// Multi Model Selecter (TJ)
// Dynamic selector widgets + typed dynamic output slots + Auto Set provider metadata.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "TJ_MultiModelSelecter";
const TJ_NONE = "[none]";
const MAX_SLOTS = 64;
const SELECT_TYPES = ["Model", "Checkpoints", "Clip", "VAE"];
const OUTPUT_MODES = ["Model Direct out", "Model Path out"];
const TYPE_TO_LABEL = { Model: "Model", Checkpoints: "Checkpoint", Clip: "Clip", VAE: "Vae" };
const DIRECT_OUTPUT_TYPE = { Model: "MODEL", Clip: "CLIP", VAE: "VAE" };
let CLIP_LOADER_TYPES = [TJ_NONE, "stable_diffusion"];
const DEFAULT_NODE_SIZE = [460, 0];
const MAX_REASONABLE_NODE_SIZE = [900, 700];

function markUserResizePatch(node) {
    if (!node || node._tj_mms_resize_patch_done) return;
    node._tj_mms_resize_patch_done = true;
    const oldOnResize = node.onResize;
    node.onResize = function(size) {
        if (!this._tj_mms_programmatic_resize && this._tj_mms_ready_for_user_resize) {
            this.properties = this.properties || {};
            this.properties._tj_mms_user_width = true;
        }
        if (oldOnResize) return oldOnResize.apply(this, arguments);
    };
}

function setNodeSizeSafe(node, size) {
    if (!node || !Array.isArray(size)) return;
    node._tj_mms_programmatic_resize = true;
    try {
        if (typeof node.setSize === "function") node.setSize(size);
        else node.size = [...size];
        node.size = [...size];
    } finally {
        requestAnimationFrame(() => { node._tj_mms_programmatic_resize = false; });
    }
}

function isBrokenAutoSize(node) {
    const size = node?.size || [];
    const w = Number(size[0] || 0);
    const h = Number(size[1] || 0);
    // Old broken builds serialized a very tall empty node because Python exposed 192 max outputs.
    // Reset only when the user has not resized after this fixed version marked it.
    return !w || !h || w > MAX_REASONABLE_NODE_SIZE[0] || h > MAX_REASONABLE_NODE_SIZE[1];
}

function applyInitialNodeSize(node) {
    if (!node || node._tj_mms_initial_size_done) return;
    node._tj_mms_initial_size_done = true;
    node.properties = node.properties || {};
    if (!node.properties._tj_mms_user_width && isBrokenAutoSize(node)) {
        setNodeSizeSafe(node, DEFAULT_NODE_SIZE);
    }
    requestAnimationFrame(() => { node._tj_mms_ready_for_user_resize = true; });
}

let cachedLists = null;
let loadingPromise = null;

async function getLists() {
    if (cachedLists) return cachedLists;
    if (!loadingPromise) {
        loadingPromise = api.fetchApi("/tj_node/multi_model_selecter/list")
            .then(r => r.json())
            .then(j => {
                cachedLists = j?.lists || { Model: [], Checkpoints: [], Clip: [], VAE: [] };
                if (Array.isArray(j?.clip_loader_types) && j.clip_loader_types.length) {
                    CLIP_LOADER_TYPES = [TJ_NONE, ...new Set(j.clip_loader_types.map(v => String(v)).filter(v => v && v !== TJ_NONE))];
                }
                return cachedLists;
            })
            .catch(err => {
                console.warn("[TJ_NODE] Multi Model Selecter list fetch failed", err);
                cachedLists = { Model: [], Checkpoints: [], Clip: [], VAE: [] };
                return cachedLists;
            });
    }
    return loadingPromise;
}

function findWidget(node, name) {
    return node.widgets?.find(w => w.name === name) || null;
}

function hideWidget(w) {
    if (!w) return;
    w.type = "hidden";
    w.computeSize = () => [0, -4];
}

function hideHiddenJsonWidgets(node) {
    hideWidget(findWidget(node, "slots_json"));
    hideWidget(findWidget(node, "clip_types_json"));
}

function visibleSelectWidgets(node) {
    return (node.widgets || []).filter(w => w._tj_mms_slot === true && w._tj_mms_role === "model");
}

function visibleClipTypeWidgets(node) {
    return (node.widgets || []).filter(w => w._tj_mms_slot === true && w._tj_mms_role === "clip_type");
}

function getSelectType(node) {
    const w = findWidget(node, "select_type");
    return SELECT_TYPES.includes(w?.value) ? w.value : "Model";
}

function getOutputMode(node) {
    const w = findWidget(node, "output_mode");
    return OUTPUT_MODES.includes(w?.value) ? w.value : "Model Direct out";
}

function isAutoSetOn(node) {
    const w = findWidget(node, "auto_set");
    return !!w?.value;
}

function selectedValues(node) {
    return visibleSelectWidgets(node).map(w => String(w.value || TJ_NONE));
}

function selectedNonNone(node) {
    return selectedValues(node).filter(v => v && v !== TJ_NONE);
}

function normalizeSelectedList(values) {
    return (values || []).map(v => String(v || TJ_NONE)).filter(v => v && v !== TJ_NONE).slice(0, MAX_SLOTS);
}

function selectedClipTypes(node) {
    return visibleClipTypeWidgets(node).map(w => String(w.value || TJ_NONE));
}

function selectedClipTypesForNonNone(node) {
    const values = visibleSelectWidgets(node);
    const types = visibleClipTypeWidgets(node);
    const out = [];
    values.forEach((w, i) => {
        if (w.value && w.value !== TJ_NONE) out.push(String(types[i]?.value || TJ_NONE));
    });
    return out;
}

function setSlotsJson(node) {
    const w = findWidget(node, "slots_json");
    if (w) w.value = JSON.stringify(selectedNonNone(node));
    const c = findWidget(node, "clip_types_json");
    if (c) c.value = JSON.stringify(selectedClipTypesForNonNone(node));
}

function optionsFor(node, lists) {
    const selectType = getSelectType(node);
    return [TJ_NONE, ...((lists && lists[selectType]) || [])];
}

function setOutputDisplayLabels(node) {
    const autoOn = isAutoSetOn(node);
    (node.outputs || []).forEach((out) => {
        if (!out) return;
        const base = String(out.name || "").replace(/\s*▶\s*$/, "");
        out.name = base;
        out.label = autoOn ? `${base}▶` : base;
    });
}

function updateAutoSets(node) {
    node.properties = node.properties || {};
    node.properties.auto_sets = {};
    const autoOn = isAutoSetOn(node);
    (node.outputs || []).forEach((out, i) => {
        if (!out) return;
        const base = String(out.name || "").replace(/\s*▶\s*$/, "").trim();
        out.label = autoOn ? `${base}▶` : base;
        if (autoOn && base) node.properties.auto_sets[i] = base;
    });
}

function notifyTJGetNodes(node, delay = 0) {
    const graph = node?.graph;
    if (!graph) return;
    const run = () => {
        try {
            if (typeof window.TJ_NODE_syncAllGetNodes === "function") {
                window.TJ_NODE_syncAllGetNodes(graph);
            }
        } catch (e) {
            console.warn("[TJ_NODE] Multi Model Selecter syncAllGetNodes failed", e);
        }
        try {
            for (const n of (graph._nodes || [])) {
                if (!n) continue;
                if (n.type === "TJ_GetNode") {
                    if (n._syncWithSetNode) n._syncWithSetNode();
                    const w = n.widgets?.find(x => x.name === "set_name" || x.name === "get_name");
                    const v = w?.value;
                    if (v && v !== "(none)" && n._connectToSetNode) n._connectToSetNode(v);
                } else if (n.type === "TJ_MultiGetNode") {
                    if (n._syncWithSetNodes) n._syncWithSetNodes();
                    if (n._rebuild) n._rebuild();
                }
            }
        } catch (e) {
            console.warn("[TJ_NODE] Multi Model Selecter Get reconnect failed", e);
        }
        app.canvas?.setDirty(true, true);
    };
    if (delay > 0) setTimeout(run, delay);
    else run();
}

function clearLinksAndOutputs(node) {
    if (!node.outputs) node.outputs = [];
    for (let i = node.outputs.length - 1; i >= 0; i--) {
        const links = node.outputs[i]?.links ? [...node.outputs[i].links] : [];
        links.forEach(id => node.graph?.removeLink(id));
        node.removeOutput(i);
    }
}

function desiredOutputs(node, selectedOverride = null) {
    const mode = getOutputMode(node);
    const selectType = getSelectType(node);
    const selected = selectedOverride ? normalizeSelectedList(selectedOverride) : selectedNonNone(node);
    const desired = [];

    if (mode === "Model Path out") {
        const label = TYPE_TO_LABEL[selectType] || selectType;
        selected.forEach((_, i) => desired.push({ name: `${label} Path ${i + 1}`, type: "*" }));
    } else if (selectType === "Checkpoints") {
        selected.forEach((_, i) => {
            desired.push({ name: `Model ${i + 1}`, type: "MODEL" });
            desired.push({ name: `Clip ${i + 1}`, type: "CLIP" });
            desired.push({ name: `Vae ${i + 1}`, type: "VAE" });
        });
    } else {
        const label = TYPE_TO_LABEL[selectType] || selectType;
        const type = DIRECT_OUTPUT_TYPE[selectType] || "*";
        selected.forEach((_, i) => desired.push({ name: `${label} ${i + 1}`, type }));
    }
    return desired;
}

function outputsMatch(node, desired) {
    const outs = node.outputs || [];
    if (outs.length !== desired.length) return false;
    for (let i = 0; i < desired.length; i++) {
        const baseName = String(outs[i]?.name || "").replace(/\s*▶\s*$/, "").trim();
        if (baseName !== desired[i].name || outs[i]?.type !== desired[i].type) return false;
    }
    return true;
}

function outputHasRealLinks(out) {
    return Array.isArray(out?.links) && out.links.length > 0;
}

function trimExtraOutputsWithoutBreakingLinks(node, desiredCount) {
    if (!node.outputs) node.outputs = [];
    for (let i = node.outputs.length - 1; i >= desiredCount; i--) {
        const out = node.outputs[i];
        if (outputHasRealLinks(out)) continue;
        // Remove only unlinked extras. This cleans Python/default/generated out_### slots
        // without touching saved LiteGraph links or TJ fake-wire provider entries.
        node.removeOutput(i);
    }
}

function syncOutputs(node, { preserveWhenSame = true, preserveLinks = false, selectedOverride = null, notifyGets = true } = {}) {
    if (!node.outputs) node.outputs = [];
    const desired = desiredOutputs(node, selectedOverride);

    // Workflow refresh/load rule:
    // Keep the original output objects for the desired slots so saved links/fake-wires survive.
    // Then remove only unlinked extras generated by old broken builds or Python max outputs.
    if (preserveLinks) {
        desired.forEach((out, i) => {
            if (node.outputs[i]) {
                node.outputs[i].name = out.name;
                node.outputs[i].type = out.type;
            } else {
                node.addOutput(out.name, out.type);
            }
        });
        trimExtraOutputsWithoutBreakingLinks(node, desired.length);
        updateAutoSets(node);
        setOutputDisplayLabels(node);
        if (notifyGets) notifyTJGetNodes(node, 50);
        return;
    }

    // Normal live-edit rule: only rebuild when the actual output layout changed.
    if (!(preserveWhenSame && outputsMatch(node, desired))) {
        clearLinksAndOutputs(node);
        desired.forEach(out => node.addOutput(out.name, out.type));
    }

    updateAutoSets(node);
    setOutputDisplayLabels(node);
    if (notifyGets) notifyTJGetNodes(node, 50);
}

function rebuildOutputs(node) {
    syncOutputs(node, { preserveWhenSame: true, preserveLinks: !!node._tj_mms_preserve_links });
}

function hasDynamicSlotWidgets(node) {
    return visibleSelectWidgets(node).length > 0;
}

function shouldAutoFitHeight(node) {
    // Width may be user-controlled, but height is always content-driven.
    // Never let a user-width flag block vertical auto-fit.
    return !!node;
}

function getContentHeight(node) {
    // LiteGraph widget row height is normally 20, with title/header around 38.
    // Use a deterministic estimate to avoid triggering ComfyUI's broken 192-output autosize.
    const widgetCount = (node.widgets || []).filter(w => w.type !== "hidden").length;
    const outputCount = (node.outputs || []).length;
    const rows = Math.max(widgetCount, outputCount);
    return Math.max(DEFAULT_NODE_SIZE[1], 44 + rows * 24 + 18);
}

function fitHeightToContent(node, { allowShrink = true } = {}) {
    if (!node || !shouldAutoFitHeight(node)) return;
    const w = Math.max(DEFAULT_NODE_SIZE[0], Number(node.size?.[0] || DEFAULT_NODE_SIZE[0]));
    const targetH = Math.min(MAX_REASONABLE_NODE_SIZE[1], getContentHeight(node));
    const curH = Number(node.size?.[1] || 0);
    if (allowShrink || curH < targetH || isBrokenAutoSize(node)) {
        setNodeSizeSafe(node, [w, targetH]);
    }
}

function fitHeightSoon(node) {
    requestAnimationFrame(() => {
        fitHeightToContent(node, { allowShrink: true });
        node?.setDirtyCanvas?.(true, true);
    });
}
function removeDynamicWidgets(node) {
    if (!node.widgets) return;
    node.widgets = node.widgets.filter(w => !w._tj_mms_slot);
}

function ensureTrailingNone(values) {
    const cleaned = (values || []).map(v => String(v || TJ_NONE)).filter(v => v && v !== TJ_NONE).slice(0, MAX_SLOTS - 1);
    cleaned.push(TJ_NONE);
    return cleaned;
}

function refreshSlotNames(node) {
    const label = TYPE_TO_LABEL[getSelectType(node)] || "Slot";
    visibleSelectWidgets(node).forEach((w, i) => { w.name = `${label} ${i + 1}`; });
    visibleClipTypeWidgets(node).forEach((w, i) => { w.name = `Clip Type ${i + 1}`; });
}

function shouldShowClipType(node) {
    return getSelectType(node) === "Clip" && getOutputMode(node) === "Model Direct out";
}

async function rebuildWidgets(node, keepValues = null, keepClipTypes = null) {
    const lists = await getLists();
    const opts = optionsFor(node, lists);
    const values = ensureTrailingNone(keepValues ?? selectedValues(node));
    const clipTypes = keepClipTypes || selectedClipTypes(node);
    removeDynamicWidgets(node);

    const label = TYPE_TO_LABEL[getSelectType(node)] || "Slot";
    const showClipType = shouldShowClipType(node);
    values.forEach((val, i) => {
        const safeVal = opts.includes(val) ? val : TJ_NONE;
        const w = node.addWidget("combo", `${label} ${i + 1}`, safeVal, function(v) {
            if (!opts.includes(v)) this.value = TJ_NONE;
            normalizeAfterWidgetChange(node);
        }, { values: opts });
        w._tj_mms_slot = true;
        w._tj_mms_role = "model";
        w.serialize = false;

        if (showClipType) {
            const tval = CLIP_LOADER_TYPES.includes(clipTypes[i]) ? clipTypes[i] : TJ_NONE;
            const tw = node.addWidget("combo", `Clip Type ${i + 1}`, tval, function() {
                setSlotsJson(node);
                node.setDirtyCanvas(true, true);
            }, { values: CLIP_LOADER_TYPES });
            tw._tj_mms_slot = true;
            tw._tj_mms_role = "clip_type";
            tw.serialize = false;
        }
    });

    setSlotsJson(node);
    syncOutputs(node, { preserveWhenSame: true, preserveLinks: !!node._tj_mms_preserve_links });
    fitHeightSoon(node);
    node.setDirtyCanvas(true, true);
}

function normalizeAfterWidgetChange(node) {
    const vals = ensureTrailingNone(selectedValues(node));
    const current = visibleSelectWidgets(node);
    const types = selectedClipTypes(node);
    if (current.length !== vals.length || (shouldShowClipType(node) && visibleClipTypeWidgets(node).length !== vals.length)) {
        rebuildWidgets(node, vals, types);
        return;
    }
    current.forEach((w, i) => { w.value = vals[i]; });
    refreshSlotNames(node);
    setSlotsJson(node);
    syncOutputs(node, { preserveWhenSame: true, preserveLinks: !!node._tj_mms_preserve_links });
    fitHeightSoon(node);
    node.setDirtyCanvas(true, true);
}

function parseSlotsJson(node) {
    const w = findWidget(node, "slots_json");
    try {
        const arr = JSON.parse(w?.value || "[]");
        return Array.isArray(arr) ? arr : [];
    } catch (_) {
        return [];
    }
}

function parseClipTypesJson(node) {
    const w = findWidget(node, "clip_types_json");
    try {
        const arr = JSON.parse(w?.value || "[]");
        return Array.isArray(arr) ? arr : [];
    } catch (_) {
        return [];
    }
}


function isNodeCollapsed(node) {
    return !!(node?.flags?.collapsed || node?.collapsed);
}

function closeHelpIfCollapsed(node) {
    if (isNodeCollapsed(node)) {
        node._tj_mms_help_open = false;
        node._tj_mms_help_btn = null;
        return true;
    }
    return false;
}

const HELP_PANEL_W = 360;
const HELP_PANEL_H = 338;
const HELP_BUTTON_R = 9;

function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || "").split(" ");
    let line = "";
    for (let n = 0; n < words.length; n++) {
        const testLine = line ? line + " " + words[n] : words[n];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line) {
            ctx.fillText(line, x, y);
            line = words[n];
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    if (line) ctx.fillText(line, x, y);
    return y + lineHeight;
}

function drawHelpPanel(ctx, node) {
    if (closeHelpIfCollapsed(node) || !node._tj_mms_help_open) return;
    const x = (Number(node?.size?.[0]) || DEFAULT_NODE_SIZE[0]) + 8;
    const titleH = (window.LiteGraph && window.LiteGraph.NODE_TITLE_HEIGHT) ? window.LiteGraph.NODE_TITLE_HEIGHT : 24;
    const y = -titleH;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = "#111";
    ctx.strokeStyle = "#7612DA";
    ctx.lineWidth = 1;
    drawRoundRect(ctx, x, y, HELP_PANEL_W, HELP_PANEL_H, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("Multi Model Selecter Help", x + 14, y + 24);

    let ty = y + 48;
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "#d6b8ff";
    ctx.fillText("KR", x + 14, ty);
    ty += 18;
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#ddd";
    ty = wrapText(ctx, "이 노드는 듀얼 모델 로더가 아닙니다. 하나의 방식으로 여러 모델을 개별 선택/관리하고, 각 출력 슬롯이 독립적으로 로드되는 노드입니다.", x + 14, ty, HELP_PANEL_W - 28, 15);
    ty = wrapText(ctx, "Direct out: 요청된 출력 슬롯만 개별 로드합니다. 예: Clip 1은 Clip 1만, Clip 2는 Clip 2만 로드합니다. 사용하지 않는 슬롯은 로드되지 않습니다.", x + 14, ty + 2, HELP_PANEL_W - 28, 15);
    ty = wrapText(ctx, "Path out: 모델을 로드하지 않고 경로 문자열만 출력합니다. GGUF / mmproj / LLM 위젯 입력용 모델은 Path out 권장.", x + 14, ty + 2, HELP_PANEL_W - 28, 15);

    ty += 12;
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "#d6b8ff";
    ctx.fillText("EN", x + 14, ty);
    ty += 18;
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#ddd";
    ty = wrapText(ctx, "This is not a dual model loader. It uses a single selection method to manage multiple independent model slots.", x + 14, ty, HELP_PANEL_W - 28, 15);
    ty = wrapText(ctx, "Direct out: only the requested output slot is loaded. For example, Clip 1 loads Clip 1 only; Clip 2 loads Clip 2 only. Unused slots are not loaded.", x + 14, ty + 2, HELP_PANEL_W - 28, 15);
    ty = wrapText(ctx, "Path out: outputs only the model path string. Recommended for GGUF, mmproj, LLM widget inputs, and path-based model widgets.", x + 14, ty + 2, HELP_PANEL_W - 28, 15);

    ctx.restore();
}

function drawHelpButton(ctx, node) {
    if (closeHelpIfCollapsed(node)) return;
    const x = Math.max(30, (node.size?.[0] || DEFAULT_NODE_SIZE[0]) - 18);
    const y = -17;
    node._tj_mms_help_btn = { x, y, r: HELP_BUTTON_R };

    ctx.save();
    ctx.fillStyle = node._tj_mms_help_open ? "#ffffff" : "#2b2b2b";
    ctx.strokeStyle = node._tj_mms_help_open ? "#ffffff" : "#b58cff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, HELP_BUTTON_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = node._tj_mms_help_open ? "#7612DA" : "#ffffff";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", x, y + 0.5);
    ctx.restore();
}

function installHelpPatch(node) {
    if (!node || node._tj_mms_help_patch_done) return;
    node._tj_mms_help_patch_done = true;

    const oldDraw = node.onDrawForeground;
    node.onDrawForeground = function(ctx) {
        if (oldDraw) oldDraw.apply(this, arguments);
        drawHelpPanel(ctx, this);
        drawHelpButton(ctx, this);
    };

    const oldMouseDown = node.onMouseDown;
    node.onMouseDown = function(e, pos, canvas) {
        if (closeHelpIfCollapsed(this)) {
            if (oldMouseDown) return oldMouseDown.apply(this, arguments);
            return false;
        }
        const btn = this._tj_mms_help_btn || { x: Math.max(30, (this.size?.[0] || DEFAULT_NODE_SIZE[0]) - 18), y: -17, r: HELP_BUTTON_R };
        const px = Array.isArray(pos) ? pos[0] : (pos?.[0] ?? 0);
        const py = Array.isArray(pos) ? pos[1] : (pos?.[1] ?? 0);
        const dx = px - btn.x;
        const dy = py - btn.y;
        if ((dx * dx + dy * dy) <= (btn.r + 4) * (btn.r + 4)) {
            this._tj_mms_help_open = !this._tj_mms_help_open;
            this.setDirtyCanvas(true, true);
            return true;
        }
        if (oldMouseDown) return oldMouseDown.apply(this, arguments);
        return false;
    };
}

function centeredConfirm(message) {
    return new Promise(resolve => {
        const old = document.getElementById("tj-mms-confirm-modal");
        if (old) old.remove();

        const overlay = document.createElement("div");
        overlay.id = "tj-mms-confirm-modal";
        overlay.style.cssText = [
            "position:fixed",
            "left:0",
            "top:0",
            "width:100vw",
            "height:100vh",
            "display:flex",
            "align-items:center",
            "justify-content:center",
            "background:rgba(0,0,0,0.35)",
            "z-index:2147483647"
        ].join(";");

        const box = document.createElement("div");
        box.style.cssText = [
            "min-width:360px",
            "max-width:520px",
            "background:#111",
            "color:#fff",
            "border:1px solid #7612DA",
            "border-radius:10px",
            "box-shadow:0 10px 40px rgba(0,0,0,0.55)",
            "padding:18px",
            "font:14px sans-serif",
            "text-align:center"
        ].join(";");

        const text = document.createElement("div");
        text.textContent = message;
        text.style.cssText = "white-space:pre-line;line-height:1.5;margin-bottom:16px;";

        const buttons = document.createElement("div");
        buttons.style.cssText = "display:flex;gap:10px;justify-content:center;";

        const ok = document.createElement("button");
        ok.textContent = "OK";
        ok.style.cssText = "min-width:90px;padding:7px 14px;border-radius:6px;border:0;background:#7612DA;color:#fff;cursor:pointer;";
        const cancel = document.createElement("button");
        cancel.textContent = "Cancel";
        cancel.style.cssText = "min-width:90px;padding:7px 14px;border-radius:6px;border:1px solid #555;background:#222;color:#fff;cursor:pointer;";

        const done = (v) => { overlay.remove(); resolve(v); };
        ok.onclick = () => done(true);
        cancel.onclick = () => done(false);
        overlay.onclick = (e) => { if (e.target === overlay) done(false); };

        buttons.append(cancel, ok);
        box.append(text, buttons);
        overlay.append(box);
        document.body.append(overlay);
        ok.focus();
    });
}

function patchBaseWidgets(node, { isNewNode = false } = {}) {
    node.bgcolor = "#000000";
    node.color = "#7612DA";
    node.title_text_color = "#FFFFFF";
    node.properties = node.properties || {};
    node.properties.auto_sets = node.properties.auto_sets || {};
    hideHiddenJsonWidgets(node);
    markUserResizePatch(node);
    installHelpPatch(node);

    const selectW = findWidget(node, "select_type");
    if (selectW && !selectW._tj_mms_callback_patched) {
        selectW._tj_mms_callback_patched = true;
        if (isNewNode && !SELECT_TYPES.includes(selectW.value)) selectW.value = "Model";
        selectW._tj_last_value = SELECT_TYPES.includes(selectW.value) ? selectW.value : getSelectType(node);
        const origCb = selectW.callback;
        selectW.callback = async (v) => {
            const old = selectW._tj_last_value || getSelectType(node);
            if (old !== v) {
                const ok = await centeredConfirm("Select Type을 변경하면 기존 선택값이 모두 초기화됩니다.\n진행하시겠습니까?");
                if (!ok) {
                    selectW.value = old;
                    node.setDirtyCanvas(true, true);
                    return;
                }
            }
            if (origCb) origCb.call(selectW, v);
            selectW._tj_last_value = v;
            const slotsJsonW = findWidget(node, "slots_json");
            if (slotsJsonW) slotsJsonW.value = "[]";
            const clipTypesW = findWidget(node, "clip_types_json");
            if (clipTypesW) clipTypesW.value = "[]";
            rebuildWidgets(node, [TJ_NONE], []);
        };
    }

    const modeW = findWidget(node, "output_mode");
    if (modeW && !modeW._tj_mms_callback_patched) {
        modeW._tj_mms_callback_patched = true;
        const origMode = modeW.callback;
        modeW.callback = (v) => {
            if (origMode) origMode.call(modeW, v);
            const vals = selectedValues(node);
            const types = selectedClipTypes(node);
            rebuildWidgets(node, vals, types);
        };
    }

    const autoW = findWidget(node, "auto_set");
    if (autoW && !autoW._tj_mms_callback_patched) {
        autoW._tj_mms_callback_patched = true;
        const origAuto = autoW.callback;
        autoW.callback = (v) => {
            if (origAuto) origAuto.call(autoW, v);
            updateAutoSets(node);
            notifyTJGetNodes(node, 50);
            node.setDirtyCanvas(true, true);
        };
    }
}

function initNewNodeOnce(node) {
    if (!node || node._tj_mms_loaded_from_workflow || node._tj_mms_new_initialized) return;
    node._tj_mms_new_initialized = true;
    patchBaseWidgets(node, { isNewNode: true });

    const selectW = findWidget(node, "select_type");
    if (selectW && !SELECT_TYPES.includes(selectW.value)) selectW.value = "Model";

    const slots = parseSlotsJson(node);
    const clipTypes = parseClipTypesJson(node);
    if (!slots.length && !hasDynamicSlotWidgets(node)) {
        const slotsJsonW = findWidget(node, "slots_json");
        if (slotsJsonW && (!slotsJsonW.value || slotsJsonW.value === "[]")) slotsJsonW.value = "[]";
        applyInitialNodeSize(node);
        rebuildWidgets(node, [TJ_NONE], clipTypes);
    } else {
        applyInitialNodeSize(node);
        rebuildWidgets(node, slots, clipTypes);
    }
}

app.registerExtension({
    name: "TJ.MultiModelSelecter",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (origCreated) origCreated.apply(this, arguments);
            patchBaseWidgets(this, { isNewNode: true });
            // Do not clear outputs or rebuild immediately here. On workflow load,
            // onConfigure runs after creation and must keep saved widget values.
            setTimeout(() => initNewNodeOnce(this), 0);
        };

        const origConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            this._tj_mms_loaded_from_workflow = true;
            if (origConfigure) origConfigure.apply(this, arguments);
            patchBaseWidgets(this, { isNewNode: false });

            const selectW = findWidget(this, "select_type");
            if (selectW) {
                // Workflow load rule: never overwrite an existing saved select_type value.
                selectW._tj_last_value = SELECT_TYPES.includes(selectW.value) ? selectW.value : String(selectW.value || "Model");
            }

            const size = data?.size || this.size;
            const hasSavedSize = Array.isArray(size) && Number(size[0]) > 0 && Number(size[1]) > 0;
            if (hasSavedSize) {
                this.size = [Number(size[0]), Number(size[1])];
            }

            const slots = parseSlotsJson(this);
            const clipTypes = parseClipTypesJson(this);

            // Critical reload-safe step:
            // Before Get nodes scan providers during Refresh/Load, rebuild output names/types
            // from saved slots_json synchronously. Do not depend on dynamic widgets here,
            // because they are recreated asynchronously after model-list fetch.
            this._tj_mms_preserve_links = true;
            syncOutputs(this, { preserveWhenSame: true, preserveLinks: true, selectedOverride: slots, notifyGets: false });
            notifyTJGetNodes(this, 0);

            requestAnimationFrame(() => {
                // Saved workflow rule: keep stored values and keep existing links/fake-wires.
                // Do not clear/recreate outputs while restoring.
                this._tj_mms_preserve_links = true;
                Promise.resolve(rebuildWidgets(this, slots, clipTypes))
                    .finally(() => {
                        this._tj_mms_preserve_links = false;
                        notifyTJGetNodes(this, 100);
                        fitHeightSoon(this);
                        requestAnimationFrame(() => { this._tj_mms_ready_for_user_resize = true; });
                    });
            });
        };

        const origSerialize = nodeType.prototype.serialize;
        nodeType.prototype.serialize = function() {
            setSlotsJson(this);
            updateAutoSets(this);
            const data = origSerialize ? origSerialize.apply(this, arguments) : LiteGraph.LGraphNode.prototype.serialize.call(this);
            return data;
        };
    }
});
