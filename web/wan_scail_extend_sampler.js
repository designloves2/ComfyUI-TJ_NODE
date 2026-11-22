import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const MAX_EXTEND_SEGMENTS = 8;
// Auto mode plans internally, not from slots — mirror the Python sanity cap.
const MAX_AUTO_SEGMENTS = 64;

// ----- Auto ("target total") planning — mirrors _auto_plan in Python so the
// on-canvas readout shows exactly the chunk breakdown that will run. -----

function roundToGrid(value, minimum) {
    value = Math.round(Number(value) || 0);
    if (value < minimum) value = minimum;
    const remainder = (value - 1) % 4;
    let grid;
    if (remainder === 0) grid = value;
    else if (remainder <= 2) grid = value - remainder;
    else grid = value + (4 - remainder);
    while (grid < minimum) grid += 4;
    return grid;
}

function autoPlanLengths(target, chunkFrames, overlap, maxSegments) {
    overlap = Math.max(0, Math.round(Number(overlap) || 0));
    const chunk = roundToGrid(chunkFrames, 9);
    const goal = Math.max(1, Math.round(Number(target) || 0));
    const base = roundToGrid(Math.min(chunk, goal), 5);
    const lengths = [base];
    const perExtend = chunk - overlap;
    if (perExtend <= 0) return lengths;

    let remaining = goal - base;
    const minLast = Math.max(9, overlap + 4);
    let index = 1;
    while (remaining > 0 && index <= maxSegments) {
        if (remaining >= perExtend) {
            lengths.push(chunk);
            remaining -= perExtend;
            index += 1;
            continue;
        }
        const lastLength = roundToGrid(remaining + overlap, minLast);
        const contributed = lastLength - overlap;
        if (Math.abs(remaining - contributed) < remaining) lengths.push(lastLength);
        break;
    }
    return lengths;
}

function frameMode(node) {
    return findWidget(node, "frame_mode")?.value || "manual segments";
}

function isAuto(node) {
    return frameMode(node) === "target total";
}

// Expert tuning hidden by default (Basic view). The extend segment controls
// are NOT here — growing the video is the whole point of this node, so the
// +/- segment surface always shows. replacement_mode is deliberately NOT here
// either: animation vs replacement changes what the node fundamentally does
// (whose scene, whose character), so it stays on the Basic surface.
const ADVANCED_WIDGETS = [
    "sampler_name",
    "scheduler",
    "shift",
    "previous_frame_count",
    "color_match",
    "color_anchor",
    "color_sample",
    "color_match_strength",
    "pose_strength",
    "pose_start",
    "pose_end",
    "clip_vision_crop",
];

//  signature accent — same calm blue as the other  nodes.
const ACCENT = "#B78CFF";

const INFO_TITLE = "Wan SCAIL Extend Sampler (TJ)";
const INFO_TEXT =
    "Folds the SCAIL-2 generate + extend graph into one node: CLIPTextEncode x2 " +
    "+ CLIPVisionEncode + ModelSamplingSD3 + KSamplerSelect + BasicScheduler, then " +
    "WanSCAILToVideo -> SamplerCustom -> VAEDecode per chunk with overlap trim and " +
    "Reinhard LAB seam color match. Every '+ Add extend' replaces an 18-node block.";
const INFO_SIGNATURE = "fold the graph — TJ_NODE";

function findWidget(node, name) {
    return node.widgets?.find((widget) => widget.name === name);
}

function applyTJTheme(node) {
    if (!node) return;
    node.bgcolor = "#000000";
    node.color = "#7612DA";
    node.title_text_color = "#FFFFFF";
}

// Read-only status line drawn on the canvas (same custom widget pattern as the
// Z-Image readout): total output frames and rough seconds at 16 fps.
const READOUT_FONT = "600 12px sans-serif";
const READOUT_LINE = 16;
const READOUT_PAD = 12;
const measureCtx = document.createElement("canvas").getContext("2d");

// Greedy word wrap that keeps explicit line breaks and splits a single over-long word by characters.
function wrapReadout(ctx, text, maxWidth) {
    const lines = [];
    for (const paragraph of String(text || "").split("\n")) {
        let line = "";
        for (const word of paragraph.split(" ")) {
            const test = line ? `${line} ${word}` : word;
            if (!line || ctx.measureText(test).width <= maxWidth) {
                line = test;
                continue;
            }
            lines.push(line);
            line = word;
        }
        while (line && ctx.measureText(line).width > maxWidth && line.length > 1) {
            let cut = line.length - 1;
            while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut -= 1;
            lines.push(line.slice(0, cut));
            line = line.slice(cut);
        }
        lines.push(line);
    }
    return lines;
}

function readoutHeight(widget, width) {
    measureCtx.font = READOUT_FONT;
    const lines = wrapReadout(measureCtx, widget.value, Math.max(60, (width || 300) - READOUT_PAD * 2));
    return Math.max(40, lines.length * READOUT_LINE + READOUT_PAD);
}

function makeReadoutWidget() {
    return {
        type: "_readout",
        name: "frames_readout",
        value: "",
        options: { serialize: false },
        serialize: false,
        draw(ctx, node, widgetWidth, widgetY, height) {
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = READOUT_FONT;
            ctx.fillStyle = ACCENT;

            const width = node?.size?.[0] || widgetWidth;
            const lines = wrapReadout(ctx, this.value, Math.max(60, width - READOUT_PAD * 2));
            // draw from the top of the widget: `height` is the stock widget height, not the wrapped block's
            const startY = widgetY + READOUT_PAD * 0.5 + READOUT_LINE * 0.5;
            lines.forEach((line, index) => {
                ctx.fillText(line, width * 0.5, startY + index * READOUT_LINE);
            });

            ctx.restore();
        },
        computeSize(width) {
            return [width || 0, readoutHeight(this, width)];
        },
    };
}

// ----- Values fed by other nodes. A widget turned into a linked input keeps its old widget value, so the readout
// reads the source node instead (primitive / number nodes, through reroutes). Computed sources (math, image size)
// only have a value after a run: the node reports it with the tj_wan_scail_plan event. -----

function linkOf(graph, id) {
    if (id == null) return null;
    return graph?.getLink?.(id) ?? graph?.links?.get?.(id) ?? graph?.links?.[id] ?? null;
}

function sourceNumber(graph, link, depth = 0) {
    const origin = link && graph?.getNodeById?.(link.origin_id);
    if (!origin || depth > 6) return undefined;
    if (origin.type === "Reroute") {
        const upstream = linkOf(graph, origin.inputs?.[0]?.link);
        return upstream ? sourceNumber(graph, upstream, depth + 1) : undefined;
    }
    const outputName = origin.outputs?.[link.origin_slot]?.name;
    const widgets = origin.widgets || [];
    const pick = widgets.find((w) => w.name === "value")
        || widgets.find((w) => w.name === outputName)
        || (widgets.length === 1 ? widgets[0] : undefined);
    const value = Number(pick?.value);
    return pick && Number.isFinite(value) ? value : undefined;
}

// {value, linked, known}: `known` is false when the input is linked to something computed that has not run yet.
function inputNumber(node, name, fallback = 0) {
    const widget = findWidget(node, name);
    const input = node.inputs?.find((i) => i.name === name || i.widget?.name === name);
    const link = input && linkOf(node.graph, input.link);
    if (!link) return { value: Number(widget?.value ?? fallback), linked: false, known: true };
    const live = sourceNumber(node.graph, link);
    if (live !== undefined) return { value: live, linked: true, known: true };
    const lastRun = node._tjPlan?.[name];
    if (lastRun !== undefined) return { value: lastRun, linked: true, known: true };
    return { value: Number(widget?.value ?? fallback), linked: true, known: false };
}

function titleHeight() {
    return (typeof LiteGraph !== "undefined" && LiteGraph.NODE_TITLE_HEIGHT) || 30;
}

function wrapText(ctx, text, maxWidth) {
    const lines = [];
    let line = "";
    for (const word of String(text).split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(test).width > maxWidth) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);
    return lines;
}

// Top-right "i" badge + hover tooltip floated outside the node (same pattern
// as  Z-Image Turbo). Guarded so a draw error never breaks the node.
function drawInfoBadge(node, ctx) {
    if (node.flags && node.flags.collapsed) {
        node._InfoRect = null;
        return;
    }
    const r = 7;
    const cx = node.size[0] - 15;
    const cy = -titleHeight() * 0.5;
    node._InfoRect = { cx, cy, r };

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = node._InfoHover ? ACCENT : "#6b7785";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("i", cx, cy + 0.5);
    ctx.restore();

    if (!node._InfoHover) {
        return;
    }

    ctx.save();
    const pad = 9;
    const maxTextW = 250;
    const lineH = 15;
    const titleH = 17;
    const dividerGap = 9;
    const footerH = 15;

    ctx.font = "11px sans-serif";
    const lines = wrapText(ctx, INFO_TEXT, maxTextW);
    const boxW = maxTextW + pad * 2;
    const boxH = pad + titleH + lines.length * lineH + dividerGap + footerH + pad;
    const bx = node.size[0] + 12;
    const by = cy;

    ctx.fillStyle = "rgba(20, 26, 32, 0.96)";
    ctx.strokeStyle = "#2d3642";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(bx, by, boxW, boxH, 6);
    } else {
        ctx.rect(bx, by, boxW, boxH);
    }
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let y = by + pad;

    ctx.fillStyle = ACCENT;
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(INFO_TITLE, bx + pad, y);
    y += titleH;

    ctx.fillStyle = "#cfd6de";
    ctx.font = "11px sans-serif";
    lines.forEach((ln, i) => ctx.fillText(ln, bx + pad, y + i * lineH));
    y += lines.length * lineH + dividerGap * 0.5;

    ctx.strokeStyle = "#2d3642";
    ctx.beginPath();
    ctx.moveTo(bx + pad, y);
    ctx.lineTo(bx + boxW - pad, y);
    ctx.stroke();
    y += dividerGap * 0.5;

    ctx.fillStyle = "#6b7785";
    ctx.font = "italic 10px sans-serif";
    ctx.fillText(INFO_SIGNATURE, bx + pad, y);
    ctx.restore();
}

function setWidgetVisible(node, widget, visible) {
    if (!widget) {
        return;
    }
    if (!widget._OriginalType) {
        widget._OriginalType = widget.type;
        widget._OriginalComputeSize = widget.computeSize;
    }
    widget.hidden = !visible;
    widget.disabled = !visible;
    widget.type = visible ? widget._OriginalType : "hidden";
    widget.computeSize = visible ? widget._OriginalComputeSize : () => [0, -4];
    node.setDirtyCanvas?.(true, true);
}




function promptInnerWidth(node, fallback = 300) {
    const w = Number(node?.size?.[0] || fallback);
    return Math.max(120, w - 20);
}

function hidePromptWidget(node, name, hidden = true) {
    const w = findWidget(node, name);
    if (!w) return;
    if (!w._tj_wan_prompt_saved) {
        w._tj_wan_prompt_saved = {
            type: w.type,
            computeSize: w.computeSize,
            disabled: w.disabled,
            hidden: w.hidden,
        };
    }
    w.type = hidden ? "hidden" : w._tj_wan_prompt_saved.type;
    w.computeSize = hidden ? () => [0, -4] : w._tj_wan_prompt_saved.computeSize;
    w.disabled = hidden ? true : !!w._tj_wan_prompt_saved.disabled;
    w.hidden = hidden ? true : !!w._tj_wan_prompt_saved.hidden;
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function removeLegacyPromptToggleButtons(node) {
    // Remove broken/old prompt toggle widgets only. Keep the current DOM toggle widgets.
    if (!node?.widgets) return;
    for (let index = node.widgets.length - 1; index >= 0; index -= 1) {
        const widget = node.widgets[index];
        const name = String(widget?.name || "");
        if (widget?._tj_wan_dom_prompt_toggle) continue;
        if (
            widget?._tj_prompt_toggle_target ||
            name === "positive_toggle" ||
            name === "negative_toggle" ||
            ((name.includes("Positive prompt") || name.includes("Negative prompt")) && widget?.type === "button")
        ) {
            node.widgets.splice(index, 1);
        }
    }
}

function installPromptToggle(node, widgetName, label, propName) {
    const target = findWidget(node, widgetName);
    if (!target) return;
    node.properties = node.properties || {};
    if (node.properties[propName] === undefined) node.properties[propName] = true;

    removeLegacyPromptToggleButtons(node);

    let toggle = node.widgets?.find(w => w.name === `${widgetName}_toggle` && w._tj_wan_dom_prompt_toggle);
    if (!toggle) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;width:100%;max-width:100%;height:22px;box-sizing:border-box;padding:1px 2px;";
        const btn = document.createElement("button");
        btn.style.cssText = "width:100%;max-width:100%;height:20px;background:#151515;color:#e6e6e6;border:1px solid #333;border-radius:3px;cursor:pointer;font-size:10px;font-weight:bold;text-align:center;padding:0 6px;box-sizing:border-box;";
        row.appendChild(btn);

        toggle = node.addDOMWidget(`${widgetName}_toggle`, "btn", row, { serialize: false, hideOnZoom: false });
        toggle._tj_wan_dom_prompt_toggle = true;
        toggle._tj_wan_prompt_button = btn;
        toggle._tj_wan_prompt_row = row;
        toggle.computeSize = function(width) {
            const inner = promptInnerWidth(node);
            row.style.width = `${inner}px`;
            row.style.maxWidth = `${inner}px`;
            row.style.boxSizing = "border-box";
            return [width || inner, 24];
        };

        btn.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            node.properties[propName] = !node.properties[propName];
            updatePromptToggle(node, widgetName, label, propName);
        };
    }

    const tIdx = node.widgets.indexOf(toggle);
    const nIdx = node.widgets.findIndex(w => w.name === widgetName);
    if (tIdx >= 0 && nIdx >= 0 && tIdx > nIdx) {
        node.widgets.splice(tIdx, 1);
        node.widgets.splice(nIdx, 0, toggle);
    }

    updatePromptToggle(node, widgetName, label, propName);
}

function updatePromptToggle(node, widgetName, label, propName) {
    const toggle = node.widgets?.find(w => w.name === `${widgetName}_toggle` && w._tj_wan_dom_prompt_toggle);
    const opened = !!node.properties?.[propName];
    if (toggle?._tj_wan_prompt_button) {
        toggle._tj_wan_prompt_button.textContent = `${opened ? "▼" : "▶"} ${label}`;
    }
    hidePromptWidget(node, widgetName, !opened);
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function installPromptToggles(node) {
    removeLegacyPromptToggleButtons(node);
    installPromptToggle(node, "positive", "Positive prompt", "tj_wan_positive_open");
    installPromptToggle(node, "negative", "Negative prompt", "tj_wan_negative_open");
}

function refreshPromptToggles(node) {
    updatePromptToggle(node, "positive", "Positive prompt", "tj_wan_positive_open");
    updatePromptToggle(node, "negative", "Negative prompt", "tj_wan_negative_open");
}

function handlePromptToggleMouseDown(node, pos) {
    // DOM buttons handle prompt toggles directly.
    return false;
}

function isAdvanced(node) {
    return !!(node.properties && node.properties._advanced);
}

// ----- Extend segments (same +/- slot pattern as the  LoRA slots) ----

function activeSegmentCount(node) {
    const widget = findWidget(node, "extend_segments");
    const value = Number(widget?.value ?? 0);
    return Math.max(0, Math.min(MAX_EXTEND_SEGMENTS, Number.isFinite(value) ? Math.round(value) : 0));
}

function setActiveSegmentCount(node, count) {
    const clamped = Math.max(0, Math.min(MAX_EXTEND_SEGMENTS, count));
    const widget = findWidget(node, "extend_segments");
    if (widget) {
        widget.value = clamped;
        widget.callback?.(clamped);
    }
    updateSegments(node);
}

function copySegment(node, from, to) {
    const src = findWidget(node, `extend_${from}_frames`);
    const dst = findWidget(node, `extend_${to}_frames`);
    if (src && dst) {
        dst.value = src.value;
        dst.callback?.(dst.value);
    }
}

function clearSegment(node, slot) {
    const widget = findWidget(node, `extend_${slot}_frames`);
    if (widget) {
        widget.value = 81;
        widget.callback?.(81);
    }
}

// Remove one segment: segments below shift up, the freed last slot resets.
function removeSegment(node, slot) {
    const count = activeSegmentCount(node);
    if (slot < 1 || slot > count) return;
    for (let k = slot; k < count; k += 1) {
        copySegment(node, k + 1, k);
    }
    clearSegment(node, count);
    setActiveSegmentCount(node, count - 1);
}

function updateSegments(node) {
    const count = activeSegmentCount(node);
    for (let slot = 1; slot <= MAX_EXTEND_SEGMENTS; slot += 1) {
        const visible = slot <= count;
        setWidgetVisible(node, findWidget(node, `extend_${slot}_frames`), visible);
        setWidgetVisible(node, node[`_RemoveSegment${slot}`], visible);
    }
    if (node._AddBtn) {
        node._AddBtn.name = count >= MAX_EXTEND_SEGMENTS
            ? "Extend segments full"
            : "＋ Add extend segment";
    }
    updateFramesReadout(node);
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function updateFramesReadout(node) {
    const readout = findWidget(node, "frames_readout");
    if (!readout) return;
    const replacement = !!findWidget(node, "replacement_mode")?.value;
    const mode = replacement ? "Replacement" : "Animation";
    const overlapInput = inputNumber(node, "previous_frame_count", 5);
    const overlap = Math.max(0, overlapInput.value);
    const pending = [];
    if (!overlapInput.known) pending.push("previous_frame_count");

    let parts;
    let extendCount;
    if (isAuto(node)) {
        const targetInput = inputNumber(node, "target_total_frames", 0);
        const chunkInput = inputNumber(node, "base_frames", 81);
        if (!targetInput.known) pending.push("target_total_frames");
        if (!chunkInput.known) pending.push("base_frames");
        const lengths = autoPlanLengths(Math.max(0, targetInput.value), Math.max(0, chunkInput.value), overlap, MAX_AUTO_SEGMENTS);
        parts = lengths.map((len, i) => (i === 0 ? len : Math.max(0, len - overlap)));
        extendCount = lengths.length - 1;
    } else {
        const baseInput = inputNumber(node, "base_frames", 0);
        if (!baseInput.known) pending.push("base_frames");
        const count = activeSegmentCount(node);
        parts = [Math.max(0, baseInput.value)];
        for (let slot = 1; slot <= count; slot += 1) {
            const frames = inputNumber(node, `extend_${slot}_frames`, 0);
            if (!frames.known) pending.push(`extend_${slot}_frames`);
            parts.push(Math.max(0, frames.value - overlap));
        }
        extendCount = count;
    }

    const total = parts.reduce((sum, value) => sum + value, 0);
    const seconds = (total / 16).toFixed(1);
    const sum = parts.length > 1 ? `${parts.join(" + ")} = ` : "";
    const extendText = `${extendCount} extend${extendCount === 1 ? "" : "s"}`;
    let text = `${sum}${total} frames\n${seconds}s @ 16fps · ${extendText} · ${mode}`;
    if (pending.length) {
        text += `\n⚠ ${pending.join(", ")} is connected to a computed value; the numbers above update after the next run`;
    }
    if (replacement) {
        const linked = (name) => node.inputs?.find((i) => i.name === name)?.link != null;
        if (!linked("pose_video_mask") || !linked("reference_image_mask")) {
            text += "\n⚠ Replacement needs pose_video_mask + reference_image_mask from 'Create SCAIL-2 Colored Mask' (replacement on)";
        }
    }
    readout.value = text;
    node._tjReadoutKey = readoutKey(node);

    // The readout can grow taller when its text wraps; the node must never be shorter than its widgets.
    const needed = node.computeSize?.();
    if (needed && node.size && node.size[1] < needed[1]) node.setSize?.([node.size[0], needed[1]]);
    node.setDirtyCanvas?.(true, true);
}

// Everything the readout depends on; compared on every redraw so an edit in an upstream node shows up at once.
function readoutKey(node) {
    const names = ["target_total_frames", "base_frames", "previous_frame_count"];
    for (let slot = 1; slot <= MAX_EXTEND_SEGMENTS; slot += 1) names.push(`extend_${slot}_frames`);
    const values = names.map((name) => {
        const { value, known } = inputNumber(node, name, 0);
        return `${value}${known ? "" : "?"}`;
    });
    const masks = ["pose_video_mask", "reference_image_mask"].map((n) => (node.inputs?.find((i) => i.name === n)?.link != null ? 1 : 0));
    return `${values.join(",")}|${masks.join("")}|${node.size?.[0]}`;
}

function hookReadout(node, name) {
    const widget = findWidget(node, name);
    if (!widget) return;
    const original = widget.callback;
    widget.callback = (...args) => {
        original?.apply(widget, args);
        updateFramesReadout(node);
    };
}

// Show the extend surface (slots + Add) only in manual mode; show
// target_total_frames only in auto mode. base_frames stays in both (it's the
// per-chunk size auto mode extends with).
function applyMode(node) {
    const auto = isAuto(node);
    setWidgetVisible(node, findWidget(node, "target_total_frames"), auto);
    if (auto) {
        for (let slot = 1; slot <= MAX_EXTEND_SEGMENTS; slot += 1) {
            setWidgetVisible(node, findWidget(node, `extend_${slot}_frames`), false);
            setWidgetVisible(node, node[`_RemoveSegment${slot}`], false);
        }
        if (node._AddBtn) setWidgetVisible(node, node._AddBtn, false);
        updateFramesReadout(node);
        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    } else {
        if (node._AddBtn) setWidgetVisible(node, node._AddBtn, true);
        updateSegments(node);
    }
}

function applyAdvanced(node) {
    const advanced = isAdvanced(node);
    for (const name of ADVANCED_WIDGETS) {
        setWidgetVisible(node, findWidget(node, name), advanced);
    }
    if (node._AdvButton) {
        node._AdvButton.name = advanced ? "Hide advanced settings" : "Show advanced settings";
    }
    applyMode(node);
}

app.registerExtension({
    name: ".wanScailExtendSampler",
    setup() {
        // What the node really used on its last run; the readout falls back on it for values fed by computed nodes.
        api.addEventListener("tj_wan_scail_plan", ({ detail }) => {
            const node = app.graph?.getNodeById?.(Number(detail?.node)) ?? app.graph?.getNodeById?.(detail?.node);
            if (!node) return;
            node._tjPlan = {
                target_total_frames: detail.target_total_frames,
                base_frames: detail.base_frames,
                previous_frame_count: detail.previous_frame_count,
            };
            updateFramesReadout(node);
        });
    },
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "WanSCAILExtendSampler") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            applyTJTheme(this);
            installPromptToggles(this);

            // Hidden counter: the +/- buttons drive it, like lora_slots.
            const segmentsWidget = findWidget(this, "extend_segments");
            if (segmentsWidget) {
                setWidgetVisible(this, segmentsWidget, false);
                const callback = segmentsWidget.callback;
                segmentsWidget.callback = (...args) => {
                    callback?.apply(segmentsWidget, args);
                    updateSegments(this);
                };
            }

            // frame_mode + target_total_frames are appended last in INPUT_TYPES
            // (to keep saved widget order stable); move them right under
            // base_frames so the "how long" controls read as one group.
            {
                const widgets = this.widgets;
                const baseFrames = findWidget(this, "base_frames");
                let anchor = baseFrames ? widgets.indexOf(baseFrames) + 1 : widgets.length;
                for (const name of ["frame_mode", "target_total_frames"]) {
                    const widget = findWidget(this, name);
                    if (!widget) continue;
                    const from = widgets.indexOf(widget);
                    if (from >= 0) {
                        widgets.splice(from, 1);
                        if (from < anchor) anchor -= 1;
                    }
                    widgets.splice(anchor, 0, widget);
                    anchor += 1;
                }
            }
            const modeWidget = findWidget(this, "frame_mode");
            if (modeWidget) {
                const callback = modeWidget.callback;
                modeWidget.callback = (...args) => {
                    callback?.apply(modeWidget, args);
                    applyMode(this);
                };
            }

            // color_sample + color_match_strength are appended last in
            // INPUT_TYPES too; move them next to color_anchor so the color
            // controls read as one group (all under Advanced).
            {
                const widgets = this.widgets;
                const colorAnchor = findWidget(this, "color_anchor");
                let anchor = colorAnchor ? widgets.indexOf(colorAnchor) + 1 : widgets.length;
                for (const name of ["color_sample", "color_match_strength"]) {
                    const widget = findWidget(this, name);
                    if (!widget) continue;
                    const from = widgets.indexOf(widget);
                    if (from >= 0) {
                        widgets.splice(from, 1);
                        if (from < anchor) anchor -= 1;
                    }
                    widgets.splice(anchor, 0, widget);
                    anchor += 1;
                }
            }

            // Per-segment remove button placed right under its frames widget.
            for (let slot = 1; slot <= MAX_EXTEND_SEGMENTS; slot += 1) {
                const button = this.addWidget("button", `✕ Remove extend ${slot}`, "remove", () => {
                    removeSegment(this, slot);
                }, { serialize: false });
                this[`_RemoveSegment${slot}`] = button;
                const widgets = this.widgets;
                const fromIndex = widgets.indexOf(button);
                if (fromIndex >= 0) widgets.splice(fromIndex, 1);
                const frames = findWidget(this, `extend_${slot}_frames`);
                const insertAt = frames ? widgets.indexOf(frames) + 1 : widgets.length;
                widgets.splice(insertAt, 0, button);
            }

            this._AddBtn = this.addWidget("button", "＋ Add extend segment", "add", () => {
                if (activeSegmentCount(this) >= MAX_EXTEND_SEGMENTS) return;
                setActiveSegmentCount(this, activeSegmentCount(this) + 1);
            }, { serialize: false });

            // Move the Add button right after the last segment row so the
            // whole extend surface reads as one block above seed/steps.
            {
                const widgets = this.widgets;
                const fromIndex = widgets.indexOf(this._AddBtn);
                if (fromIndex >= 0) widgets.splice(fromIndex, 1);
                const lastRemove = this[`_RemoveSegment${MAX_EXTEND_SEGMENTS}`];
                const anchor = lastRemove ? widgets.indexOf(lastRemove) + 1 : widgets.length;
                widgets.splice(anchor, 0, this._AddBtn);
            }

            // Total-frames readout right under the extend block.
            const readout = makeReadoutWidget();
            if (this.addCustomWidget) {
                this.addCustomWidget(readout);
            } else {
                (this.widgets = this.widgets || []).push(readout);
            }
            {
                const widgets = this.widgets;
                const fromIndex = widgets.indexOf(readout);
                if (fromIndex >= 0) widgets.splice(fromIndex, 1);
                const anchor = widgets.indexOf(this._AddBtn) + 1;
                widgets.splice(anchor, 0, readout);
            }
            hookReadout(this, "base_frames");
            hookReadout(this, "target_total_frames");
            hookReadout(this, "previous_frame_count");
            hookReadout(this, "replacement_mode");
            for (let slot = 1; slot <= MAX_EXTEND_SEGMENTS; slot += 1) {
                hookReadout(this, `extend_${slot}_frames`);
            }

            this._AdvButton = this.addWidget("button", "Show advanced settings", "advanced", () => {
                this.properties = this.properties || {};
                this.properties._advanced = !isAdvanced(this);
                applyAdvanced(this);
            }, { serialize: false });

            applyAdvanced(this);
            updateFramesReadout(this);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            onConfigure?.apply(this, arguments);
            applyTJTheme(this);
            installPromptToggles(this);
            refreshPromptToggles(this);
            applyAdvanced(this);
            updateFramesReadout(this);
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            onDrawForeground?.apply(this, arguments);
            if (this._tjReadoutKey !== readoutKey(this)) updateFramesReadout(this);
            try {
                drawInfoBadge(this, ctx);
            } catch (err) {
                // Never let a draw glitch break the node.
            }
        };

        const onMouseDown = nodeType.prototype.onMouseDown;
        nodeType.prototype.onMouseDown = function (event, pos) {
            if (handlePromptToggleMouseDown(this, pos)) return true;
            return onMouseDown?.apply(this, arguments);
        };

        const onMouseMove = nodeType.prototype.onMouseMove;
        nodeType.prototype.onMouseMove = function (event, pos) {
            const rect = this._InfoRect;
            let hover = false;
            if (rect && Array.isArray(pos)) {
                const dx = pos[0] - rect.cx;
                const dy = pos[1] - rect.cy;
                hover = dx * dx + dy * dy <= (rect.r + 4) * (rect.r + 4);
            }
            if (hover !== !!this._InfoHover) {
                this._InfoHover = hover;
                this.setDirtyCanvas?.(true, true);
            }
            return onMouseMove?.apply(this, arguments);
        };
    },
});
