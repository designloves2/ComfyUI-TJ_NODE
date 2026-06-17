import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const LOADER_NODE = "TJ_OllamaLLMLoader";
const CQC_NODE = "TJ_LLMContentQualityController";
const LOADER_TITLE = "Ollama LLM Loader (TJ)";
const CQC_TITLE = "LLM Content Quality Controller (TJ)";
const PROGRESS_EVENT = "tj-ollama-llm-progress";

const TJ_PURPLE = "#7612DA";
const TJ_BG = "#000000";
const TJ_PANEL = "#090909";
const TJ_PANEL_2 = "#121212";
const TJ_TEXT = "#FFFFFF";
const TJ_MUTED = "#BDBDBD";
const TJ_SOFT = "#D9C8FF";
const TJ_OK = "#9DFFBA";
const TJ_FAIL = "#FF8C8C";
const TJ_WARN = "#FFCC7A";

const DEFAULT_WIDTH = 560;
const CQC_DEFAULT_WIDTH = 440;
const PREVIEW_HEIGHT = 154;
const LINE_H = 13;
const PREVIEW_FONT = "10px monospace";
const PROMPT_PRESET_KEY = "tj.localLLM.systemPromptPresets.v1";
const REVIEWER_AUTO_RETRY_MAX = 3;
const REVIEWER_SEED_AUTO = "auto";
const PROP_AUTO_RETRY = "tj_cqc_auto_retry_on_fail";
const PROP_SEED_TARGET = "tj_cqc_auto_retry_seed_target";

const PROMPT_ONLY_SYSTEM_PROMPT = [
    "You are an image prompt generator.",
    "",
    "Return exactly one final positive image prompt only.",
    "Do not explain, analyze, reason, list steps, give tips, add headings, use markdown, or mention your process.",
    "",
    "Write exactly one line in this format:",
    "DENO_FINAL_PROMPT: your final image prompt here",
].join("\n");

const REVIEWER_JSON_SYSTEM_PROMPT = [
    "You are an image review judge for a ComfyUI workflow.",
    "",
    "Compare the provided prompt with the generated image/audio/text result.",
    "Pass when the main subject, action, setting, mood, and requested quality are mostly correct.",
    "Fail when the result is clearly low quality, contradicts the prompt, or important requested content is missing.",
    "",
    "Return only valid JSON.",
    "Schema:",
    "{",
    '  "verdict": "OK" or "FAIL",',
    '  "reason": "short reason",',
    '  "matched": ["important matched elements"],',
    '  "issues": ["important problems, or an empty array"]',
    "}",
].join("\n");

const BUILTIN_PRESETS = Object.freeze([
    { id: "prompt_only", label: "Prompt Only", description: "Final image prompt only.", text: PROMPT_ONLY_SYSTEM_PROMPT },
    { id: "reviewer_json", label: "Reviewer JSON", description: "OK/FAIL JSON review preset.", text: REVIEWER_JSON_SYSTEM_PROMPT },
]);

const CQC_HELP_SECTIONS = Object.freeze([
    { title: "What this node does", lines: [
        "This node is a quality gate controlled by local LLM review text.",
        "prompt_in should receive the Loader response / review text.",
        "If review text says OK, PASS, APPROVE, or APPROVED, image/audio pass through.",
        "If review text says FAIL, REJECT, or BAD, image/audio are blocked with ExecutionBlocker.",
    ]},
    { title: "Basic setup", lines: [
        "1. Send the generation prompt and optional image into Ollama LLM Loader (TJ).",
        "2. Use the Loader System Prompt popup and load Reviewer JSON preset.",
        "3. Connect Loader response to prompt_in of this node.",
        "4. Connect generated image to image and generated audio/text to audio.",
        "5. Connect image/audio outputs to preview, save, or downstream workflow.",
    ]},
    { title: "Buttons", lines: [
        "Review: normal judging mode.",
        "Pass: bypass review and pass through manually.",
        "Approve Once: pass current result once.",
        "Regenerate: queue the workflow again.",
        "Retry x3: on FAIL, increment selected seed and rerun up to 3 times.",
        "Seed: choose the upstream seed widget used for retry.",
    ]},
]);

function applyTJTheme(node) {
    if (window.TJ_NODE_applyTheme) return window.TJ_NODE_applyTheme(node);
    node.bgcolor = TJ_BG;
    node.color = TJ_PURPLE;
    node.title_text_color = TJ_TEXT;
}
function markDirty(node) {
    node?.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty?.(true, true);
}
function getWidget(node, name) { return node?.widgets?.find(w => w.name === name); }
function getWidgetValue(node, name, fallback = "") { const w = getWidget(node, name); return w ? w.value : fallback; }
function setWidgetValue(node, name, value, call = true) {
    const w = getWidget(node, name);
    if (!w) return false;
    w.value = value;
    if (call && typeof w.callback === "function") {
        try { w.callback.call(w, value, app.canvas, node); } catch (_) { try { w.callback(value); } catch (_) {} }
    }
    markDirty(node);
    return true;
}
function hideWidget(widget) {
    if (!widget || widget._tj_hidden) return;
    widget._tj_hidden = true;
    widget._tj_orig_compute = widget.computeSize;
    widget._tj_orig_draw = widget.draw;
    widget._tj_orig_mouse = widget.mouse;
    widget.computeSize = () => [0, -4];
    widget.draw = () => {};
    widget.mouse = () => false;
}
function showWidget(widget) {
    if (!widget || !widget._tj_hidden) return;
    widget._tj_hidden = false;
    if (widget._tj_orig_compute !== undefined) widget.computeSize = widget._tj_orig_compute; else delete widget.computeSize;
    if (widget._tj_orig_draw !== undefined) widget.draw = widget._tj_orig_draw; else delete widget.draw;
    if (widget._tj_orig_mouse !== undefined) widget.mouse = widget._tj_orig_mouse; else delete widget.mouse;
}
function setWidgetVisible(widget, visible) {
    if (visible) showWidget(widget);
    else hideWidget(widget);
}
function normalizeTitle(node, title) {
    if (!node.title || node.title === node.type) node.title = title;
}
function graphNodes(graph = app.graph) { return graph?._nodes || graph?.nodes || []; }

// ─────────────────────────────────────────────────────────────
// TJ embedded Set/Get bridge copied from working TJ utility pattern.
// ─────────────────────────────────────────────────────────────
function tjGetGraphLink(graph, linkId) {
    if (!graph || linkId == null) return null;
    return graph.links?.[linkId] || graph.links?.get?.(linkId) || null;
}
function tjIsWirelessLink(graph, linkId) {
    const link = tjGetGraphLink(graph, linkId);
    return !!(link && (link._tj_wireless || link._tj_provider_value));
}
function tjGetOutputSlot(node, slot) {
    if (!node || slot == null || slot < 0) return null;
    return node.outputs?.[slot] || null;
}
function tjSafeRemoveLink(graph, linkId) {
    const link = tjGetGraphLink(graph, linkId);
    if (link) graph.removeLink(linkId);
}
function tjSmartIsSeparator(name) {
    return !!(name && window.TJ_NODE_PROVIDER_SEPARATOR && name === window.TJ_NODE_PROVIDER_SEPARATOR);
}
function tjSmartLabelName(graph, name) {
    if (window.TJ_NODE_getProviderLabelName) return window.TJ_NODE_getProviderLabelName(graph, name);
    return name && name !== "(none)" ? String(name).replace(/^TJ \/ /, "").replace(/^Eclipse \/ /, "") : "";
}
function tjSmartGetAllSetNames(graph) {
    if (window.TJ_NODE_getAllSetNames) return window.TJ_NODE_getAllSetNames(graph);
    if (!graph) return ["(none)"];
    const names = [];
    graphNodes(graph).forEach(n => {
        if (!n || n.type === "TJ_GetNode" || n.type === "TJ_MultiGetNode") return;
        const w = n.widgets?.find(x => x.name === "set_name" || x.name === "setnode_name");
        if (w && String(w.value || "").trim()) names.push(String(w.value).trim());
        const autoW = n.widgets?.find(x => x.name === "auto_set");
        if ((!autoW || autoW.value) && n.properties?.auto_sets) {
            Object.values(n.properties.auto_sets).forEach(v => { if (String(v || "").trim()) names.push(String(v).trim()); });
        }
    });
    return ["(none)", ...new Set(names)].sort();
}
function tjSmartFindSetterSourceInfo(graph, setName) {
    if (window.TJ_NODE_findSetterSourceInfo) return window.TJ_NODE_findSetterSourceInfo(graph, setName);
    if (!graph || !setName || setName === "(none)") return null;
    for (const n of graphNodes(graph)) {
        if (!n || n.type === "TJ_GetNode" || n.type === "TJ_MultiGetNode") continue;
        const w = n.widgets?.find(x => x.name === "set_name" || x.name === "setnode_name");
        if (w && w.value === setName && n.outputs?.length) return { node: n, slot: 0 };
        const autoW = n.widgets?.find(x => x.name === "auto_set");
        if ((!autoW || autoW.value) && n.properties?.auto_sets) {
            for (const [idx, nm] of Object.entries(n.properties.auto_sets)) {
                if (nm === setName) {
                    const slot = parseInt(idx);
                    if (tjGetOutputSlot(n, slot)) return { node: n, slot };
                }
            }
        }
    }
    return null;
}
function attachSetNodeSync(node) {
    if (window.TJ_NODE_attachProviderNameSync) {
        window.TJ_NODE_attachProviderNameSync(node);
        return;
    }
    const w = node.widgets?.find(x => x.name === "setnode_name" || x.name === "set_name");
    if (!w || w._tj_sync_attached) return;
    w._tj_sync_attached = true;
    const origCb = w.callback;
    w.callback = function(v) {
        if (origCb) origCb.call(this, v);
        window.TJ_NODE_scheduleWirelessRepair?.(app.graph, 50);
        markDirty(node);
    };
}
function attachTJGetReceiver(node, opts = {}) {
    const widgetName = opts.widgetName || "get_name";
    const inputIndex = opts.inputIndex ?? 0;
    const inputName = opts.inputName || node.inputs?.[inputIndex]?.name || "input";
    const outputIndex = opts.outputIndex;
    const defaultType = opts.defaultType || node.inputs?.[inputIndex]?.type || "*";
    const defaultOutputType = opts.defaultOutputType || node.outputs?.[outputIndex]?.type || "*";
    const getW = node.widgets?.find(w => w.name === widgetName);
    if (!getW || getW._tj_get_receiver_attached) return;
    getW._tj_get_receiver_attached = true;

    const refreshProviderValues = () => {
        const values = tjSmartGetAllSetNames(node.graph);
        const next = Array.isArray(values) ? [...values] : ["(none)"];
        if (getW.value && getW.value !== "(none)" && !next.includes(getW.value)) next.push(getW.value);
        getW.options = { ...(getW.options || {}), values: next };
        return next;
    };
    const removeWirelessInputOnly = (target) => {
        const input = target.inputs?.[inputIndex];
        if (!target.graph || !input || input.link == null) return;
        if (tjIsWirelessLink(target.graph, input.link)) {
            target._tj_connecting_wireless = true;
            try { tjSafeRemoveLink(target.graph, input.link); }
            finally { target._tj_connecting_wireless = false; }
            input.link = null;
        }
    };
    const updateFnName = `_tjUpdateGetReceiverOptions_${widgetName}`;
    const connectFnName = `_tjConnectGetReceiver_${widgetName}`;

    node[updateFnName] = function() {
        refreshProviderValues();
        const w = this.widgets?.find(x => x.name === widgetName);
        const label = tjSmartLabelName(this.graph, w?.value);
        if (this.inputs?.[inputIndex]) this.inputs[inputIndex].label = label ? `◀ ${label}` : "";
    };
    node[connectFnName] = function(setName, connectOpts = {}) {
        if (!this.graph || !this.inputs?.[inputIndex]) return;
        const w = this.widgets?.find(x => x.name === widgetName);
        if (tjSmartIsSeparator(setName)) {
            if (w) w.value = w._tj_previous_value || w.value || "(none)";
            return;
        }
        const selected = setName || "(none)";
        if (w && w.value !== selected) w.value = selected;
        if (w) w._tj_previous_value = selected;
        const input = this.inputs[inputIndex];
        const currentLinkId = input.link;
        const currentIsWireless = tjIsWirelessLink(this.graph, currentLinkId);
        input.name = inputName;
        if (currentLinkId != null && !currentIsWireless && !connectOpts.forceWireless) {
            input.label = "";
            markDirty(this);
            return;
        }
        if (!selected || selected === "(none)") {
            removeWirelessInputOnly(this);
            input.label = "";
            if (currentLinkId == null || currentIsWireless) input.type = defaultType;
            if (outputIndex !== undefined && this.outputs?.[outputIndex]) this.outputs[outputIndex].type = defaultOutputType;
            markDirty(this);
            return;
        }
        const provider = window.TJ_NODE_findProviderByValue ? window.TJ_NODE_findProviderByValue(this.graph, selected) : null;
        const normalizedValue = provider?.displayName || selected;
        if (window.TJ_NODE_forceReconnectConsumer && provider) {
            window.TJ_NODE_forceReconnectConsumer(this, normalizedValue, inputIndex);
        } else {
            const sourceInfo = tjSmartFindSetterSourceInfo(this.graph, normalizedValue);
            if (sourceInfo?.node && tjGetOutputSlot(sourceInfo.node, sourceInfo.slot)) {
                removeWirelessInputOnly(this);
                this._tj_connecting_wireless = true;
                try {
                    sourceInfo.node.connect(sourceInfo.slot, this, inputIndex);
                    window.TJ_NODE_markWirelessLink?.(this.graph, this, inputIndex, normalizedValue);
                } finally {
                    this._tj_connecting_wireless = false;
                }
            }
        }
        const sourceInfo = tjSmartFindSetterSourceInfo(this.graph, normalizedValue);
        const t = tjGetOutputSlot(sourceInfo?.node, sourceInfo?.slot)?.type || defaultType || "*";
        input.name = inputName;
        input.type = t;
        input.label = `◀ ${provider?.labelName || tjSmartLabelName(this.graph, normalizedValue) || selected}`;
        if (outputIndex !== undefined && this.outputs?.[outputIndex]) this.outputs[outputIndex].type = t;
        markDirty(this);
    };
    const origCb = getW.callback;
    getW.callback = function(v) {
        if (origCb) origCb.call(this, v);
        if (tjSmartIsSeparator(v)) { getW.value = getW._tj_previous_value || getW.value || "(none)"; return; }
        getW._tj_previous_value = v;
        node[connectFnName](v, { forceWireless: true });
    };
    const origConnChange = node.onConnectionsChange;
    node.onConnectionsChange = function(type, index, connected) {
        if (origConnChange) origConnChange.apply(this, arguments);
        if (type === LiteGraph.INPUT && index === inputIndex) {
            const w = this.widgets?.find(x => x.name === widgetName);
            if (connected && !this._tj_connecting_wireless) {
                const lid = this.inputs?.[inputIndex]?.link;
                if (lid != null && !tjIsWirelessLink(this.graph, lid)) {
                    if (w && w.value !== "(none)") w.value = "(none)";
                    this.inputs[inputIndex].label = "";
                }
            } else if (!connected && !this._tj_connecting_wireless) {
                const selected = w?.value;
                if (selected && selected !== "(none)") {
                    this.inputs[inputIndex].label = `◀ ${tjSmartLabelName(this.graph, selected) || selected}`;
                    window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 80);
                    window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 300);
                }
            }
            markDirty(this);
        }
    };
    requestAnimationFrame(() => { refreshProviderValues(); node[updateFnName]?.(); node[connectFnName]?.(getW.value); });
    setTimeout(() => { refreshProviderValues(); node[updateFnName]?.(); if (getW.value && getW.value !== "(none)") node[connectFnName]?.(getW.value); }, 500);
}

// ─────────────────────────────────────────────────────────────
// Deno-inspired loader UI: prompt popup, presets, live log/response panel.
// ─────────────────────────────────────────────────────────────
function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}
function readCustomPresets() {
    try { return JSON.parse(localStorage.getItem(PROMPT_PRESET_KEY) || "[]").filter(x => x && x.label && x.text); }
    catch (_) { return []; }
}
function writeCustomPresets(items) {
    try { localStorage.setItem(PROMPT_PRESET_KEY, JSON.stringify(items || [])); } catch (_) {}
}
function showTJModal(className, width = 720) {
    const overlay = document.createElement("div");
    overlay.className = className;
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:100000;backdrop-filter:blur(3px);";
    const box = document.createElement("div");
    box.style.cssText = `background:#111;border:1px solid ${TJ_PURPLE};border-radius:10px;width:${width}px;max-width:94vw;max-height:90vh;overflow:auto;color:#fff;font-family:Arial,sans-serif;box-shadow:0 16px 46px rgba(0,0,0,.9);`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.addEventListener("mousedown", e => { if (e.target === overlay) overlay.remove(); });
    return { overlay, box };
}

function openLargeTextViewer(title, text) {
    const { overlay, box } = showTJModal("tj-local-llm-text-viewer-modal", 780);
    box.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.cssText = "padding:16px;";
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;";
    const h = document.createElement("div");
    h.textContent = title || "Preview";
    h.style.cssText = `font-weight:700;font-size:16px;color:${TJ_OK};`;
    const close = document.createElement("button");
    close.textContent = "Close";
    close.style.cssText = `background:#222;color:#fff;border:1px solid ${TJ_PURPLE};border-radius:6px;padding:8px 14px;cursor:pointer;`;
    close.onclick = () => overlay.remove();
    head.appendChild(h); head.appendChild(close);
    const pre = document.createElement("pre");
    pre.textContent = String(text || "Waiting for run output.");
    pre.style.cssText = `min-height:420px;max-height:70vh;overflow:auto;white-space:pre-wrap;word-break:break-word;background:#070707;color:#fff;border:1px solid ${TJ_PURPLE};border-radius:8px;padding:14px;font:12px monospace;line-height:1.45;`;
    wrap.appendChild(head); wrap.appendChild(pre); box.appendChild(wrap);
}
function openSystemPromptDialog(node) {
    const w = getWidget(node, "system_prompt");
    const { overlay, box } = showTJModal("tj-local-llm-system-prompt-modal", 820);
    box.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.cssText = "padding:18px;";

    const title = document.createElement("div");
    title.textContent = "System Prompt";
    title.style.cssText = `font-weight:700;font-size:16px;padding-bottom:10px;margin-bottom:12px;border-bottom:1px solid ${TJ_PURPLE};`;

    const presetRow = document.createElement("div");
    presetRow.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:8px;";
    const select = document.createElement("select");
    select.style.cssText = "flex:1;background:#070707;color:#fff;border:1px solid #444;border-radius:5px;padding:8px;";
    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Load";
    loadBtn.style.cssText = `background:${TJ_PURPLE};color:#fff;border:0;border-radius:5px;padding:8px 12px;font-weight:700;cursor:pointer;`;
    const refreshBtn = document.createElement("button");
    refreshBtn.textContent = "Refresh";
    refreshBtn.style.cssText = `background:#222;color:#fff;border:1px solid ${TJ_PURPLE};border-radius:5px;padding:8px 12px;cursor:pointer;`;
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.style.cssText = "background:#221111;color:#fff;border:1px solid #7a3333;border-radius:5px;padding:8px 12px;cursor:pointer;";
    presetRow.appendChild(select); presetRow.appendChild(loadBtn); presetRow.appendChild(refreshBtn); presetRow.appendChild(deleteBtn);

    const desc = document.createElement("div");
    desc.style.cssText = "color:#aaa;font-size:12px;margin-bottom:10px;min-height:16px;";

    const textarea = document.createElement("textarea");
    textarea.value = String(w?.value || "");
    textarea.spellcheck = false;
    textarea.style.cssText = "width:100%;height:380px;box-sizing:border-box;background:#050505;color:#fff;border:1px solid #444;border-radius:6px;padding:12px;font:12px monospace;resize:vertical;outline:none;";

    const saveRow = document.createElement("div");
    saveRow.style.cssText = "display:flex;gap:8px;margin-top:10px;";
    const nameInput = document.createElement("input");
    nameInput.placeholder = "Custom preset name";
    nameInput.style.cssText = "flex:1;background:#070707;color:#fff;border:1px solid #444;border-radius:5px;padding:8px;";
    const savePresetBtn = document.createElement("button");
    savePresetBtn.textContent = "Save Preset";
    savePresetBtn.style.cssText = `background:#222;color:#fff;border:1px solid ${TJ_PURPLE};border-radius:5px;padding:8px 12px;cursor:pointer;`;
    saveRow.appendChild(nameInput); saveRow.appendChild(savePresetBtn);

    const stats = document.createElement("div");
    stats.style.cssText = "color:#888;font-size:11px;margin-top:6px;";

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:14px;";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.style.cssText = "background:#333;color:#fff;border:0;border-radius:5px;padding:9px 16px;cursor:pointer;";
    const clear = document.createElement("button");
    clear.textContent = "Clear";
    clear.style.cssText = "background:#222;color:#fff;border:1px solid #444;border-radius:5px;padding:9px 16px;cursor:pointer;";
    const apply = document.createElement("button");
    apply.textContent = "Apply";
    apply.style.cssText = `background:${TJ_PURPLE};color:#fff;border:0;border-radius:5px;padding:9px 16px;font-weight:700;cursor:pointer;`;
    actions.appendChild(cancel); actions.appendChild(clear); actions.appendChild(apply);

    const updateStats = () => {
        const text = textarea.value || "";
        const chars = text.length;
        const lines = text ? text.split(/\r?\n/).length : 0;
        const tokenApprox = Math.ceil(chars / 4);
        stats.textContent = `${chars} chars · ${lines} lines · ~${tokenApprox} tokens`;
    };
    const rebuildPresetList = (preferredValue = null) => {
        const previous = preferredValue || select.value;
        select.innerHTML = "";
        const builtGroup = document.createElement("optgroup");
        builtGroup.label = "Built-in";
        BUILTIN_PRESETS.forEach(p => {
            const opt = document.createElement("option");
            opt.value = `builtin:${p.id}`;
            opt.textContent = `${p.label} — ${p.description || "built-in"}`;
            builtGroup.appendChild(opt);
        });
        select.appendChild(builtGroup);

        const custom = readCustomPresets();
        const customGroup = document.createElement("optgroup");
        customGroup.label = "User Presets";
        custom.forEach((p, i) => {
            const opt = document.createElement("option");
            opt.value = `custom:${i}`;
            opt.textContent = `${p.label} — ${p.description || "custom"}`;
            customGroup.appendChild(opt);
        });
        select.appendChild(customGroup);
        if ([...select.options].some(o => o.value === previous)) select.value = previous;
        else select.value = select.options[0]?.value || "";
        updatePresetDescription();
    };
    const currentPreset = () => {
        const value = select.value || "";
        if (value.startsWith("builtin:")) return BUILTIN_PRESETS.find(p => p.id === value.slice(8)) || null;
        if (value.startsWith("custom:")) return readCustomPresets()[Number(value.slice(7))] || null;
        return null;
    };
    function updatePresetDescription() {
        const p = currentPreset();
        const isCustom = String(select.value || "").startsWith("custom:");
        desc.textContent = p ? `${isCustom ? "User preset" : "Built-in"}: ${p.description || p.label || ""}` : "";
        deleteBtn.disabled = !isCustom;
        deleteBtn.style.opacity = isCustom ? "1" : ".45";
        deleteBtn.style.cursor = isCustom ? "pointer" : "not-allowed";
    }

    select.onchange = updatePresetDescription;
    loadBtn.onclick = () => { const p = currentPreset(); if (p) { textarea.value = p.text || ""; updateStats(); } };
    refreshBtn.onclick = () => rebuildPresetList();
    savePresetBtn.onclick = () => {
        const label = String(nameInput.value || "").trim() || "My System Prompt";
        const items = readCustomPresets();
        const idx = items.findIndex(p => String(p.label || "") === label);
        const item = { label, description: "custom", text: textarea.value };
        if (idx >= 0) {
            if (!confirm(`Preset '${label}' already exists. Overwrite?`)) return;
            items[idx] = item;
            writeCustomPresets(items);
            rebuildPresetList(`custom:${idx}`);
        } else {
            items.push(item);
            writeCustomPresets(items);
            rebuildPresetList(`custom:${items.length - 1}`);
        }
        nameInput.value = "";
        savePresetBtn.textContent = "Saved";
        setTimeout(() => savePresetBtn.textContent = "Save Preset", 900);
    };
    deleteBtn.onclick = () => {
        if (!String(select.value || "").startsWith("custom:")) return;
        const idx = Number(select.value.slice(7));
        const items = readCustomPresets();
        const item = items[idx];
        if (!item) return;
        if (!confirm(`Delete preset '${item.label}'?`)) return;
        items.splice(idx, 1);
        writeCustomPresets(items);
        rebuildPresetList();
    };
    cancel.onclick = () => overlay.remove();
    clear.onclick = () => { textarea.value = ""; updateStats(); };
    apply.onclick = () => {
        if (w) {
            w.value = textarea.value;
            if (typeof w.callback === "function") { try { w.callback.call(w, w.value, app.canvas, node); } catch (_) {} }
        }
        markDirty(node);
        overlay.remove();
    };
    textarea.addEventListener("input", updateStats);

    wrap.appendChild(title); wrap.appendChild(presetRow); wrap.appendChild(desc); wrap.appendChild(textarea); wrap.appendChild(saveRow); wrap.appendChild(stats); wrap.appendChild(actions); box.appendChild(wrap);
    rebuildPresetList();
    updateStats();
    textarea.focus();
}

function openCqcHelpDialog() {
    const { overlay, box } = showTJModal("tj-local-llm-reviewer-help-modal", 700);
    const wrap = document.createElement("div");
    wrap.style.cssText = "padding:18px;";
    const title = document.createElement("div");
    title.textContent = CQC_TITLE;
    title.style.cssText = `font-weight:700;font-size:16px;padding-bottom:10px;margin-bottom:12px;border-bottom:1px solid ${TJ_PURPLE};`;
    wrap.appendChild(title);
    for (const section of CQC_HELP_SECTIONS) {
        const h = document.createElement("div");
        h.textContent = section.title;
        h.style.cssText = `font-weight:700;color:${TJ_SOFT};margin:14px 0 6px;`;
        wrap.appendChild(h);
        const ul = document.createElement("ul");
        ul.style.cssText = "margin:0 0 6px 18px;padding:0;color:#ddd;font-size:13px;line-height:1.55;";
        section.lines.forEach(line => { const li = document.createElement("li"); li.textContent = line; ul.appendChild(li); });
        wrap.appendChild(ul);
    }
    const close = document.createElement("button");
    close.textContent = "Close";
    close.style.cssText = `margin-top:12px;float:right;background:${TJ_PURPLE};color:#fff;border:0;border-radius:5px;padding:9px 16px;cursor:pointer;font-weight:700;`;
    close.onclick = () => overlay.remove();
    wrap.appendChild(close); box.appendChild(wrap);
}

function splitLinesForWidth(ctx, text, maxWidth, maxLines = 999) {
    const raw = String(text || "").replace(/\r/g, "").split("\n");
    const out = [];
    for (const rawLine of raw) {
        const words = rawLine.trim().split(/\s+/).filter(Boolean);
        if (!words.length) { out.push(""); continue; }
        let line = "";
        for (const word of words) {
            const test = line ? `${line} ${word}` : word;
            if (ctx.measureText(test).width > maxWidth && line) { out.push(line); line = word; }
            else line = test;
            if (out.length >= maxLines) return out;
        }
        if (line) out.push(line);
        if (out.length >= maxLines) return out;
    }
    return out;
}
function drawRoundRect(ctx, x, y, w, h, r = 6, fill = TJ_PANEL, stroke = TJ_PURPLE) {
    ctx.save();
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1;
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); ctx.stroke(); }
    else { ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); }
    ctx.restore();
}
function drawPreviewBlock(ctx, x, y, w, h, label, text, color = TJ_MUTED, opts = {}) {
    drawRoundRect(ctx, x, y, w, h, 5, opts.fill || TJ_PANEL, opts.stroke || "#333");
    ctx.save();
    ctx.font = "11px sans-serif";
    ctx.fillStyle = opts.labelColor || TJ_SOFT;
    ctx.fillText(label, x + 8, y + 15);
    ctx.font = PREVIEW_FONT;
    ctx.fillStyle = color;
    const lines = splitLinesForWidth(ctx, text || "", w - 18, Math.max(1, Math.floor((h - 28) / LINE_H)));
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x + 8, y + 31 + i * LINE_H);
    ctx.restore();
}

class LoaderPreviewWidget {
    constructor(node) {
        this.name = "tj_local_llm_preview";
        this.type = "custom";
        this.node = node;
        this.options = { serialize: false };
        this.hitAreas = {};
        this.pressed = "";
    }
    serializeValue() { return undefined; }
    computeSize(width) { return [Math.max(width || DEFAULT_WIDTH, DEFAULT_WIDTH), PREVIEW_HEIGHT + 12]; }
    drawMoreButton(ctx, bounds, pressed = false) {
        const [x, y, w, h] = bounds;
        drawRoundRect(ctx, x, y, w, h, 6, pressed ? TJ_PURPLE : "#111", TJ_PURPLE);
        ctx.save();
        ctx.font = "10px sans-serif";
        ctx.fillStyle = TJ_OK;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("More", x + w / 2, y + h / 2);
        ctx.restore();
    }
    draw(ctx, node, width, y, height) {
        this.node = node;
        const drawW = Math.max(1, Math.min(width || node.size?.[0] || DEFAULT_WIDTH, node.size?.[0] || DEFAULT_WIDTH));
        const x = 12;
        const panelW = Math.max(1, drawW - 24);
        const status = String(node._tj_llm_status || "ready");
        const model = String(node._tj_llm_model || getWidgetValue(node, "model", ""));
        const top = y + 6;
        drawRoundRect(ctx, x, top, panelW, PREVIEW_HEIGHT, 7, "#070707", TJ_PURPLE);
        ctx.save();
        ctx.font = "11px sans-serif";
        ctx.fillStyle = status === "error" ? TJ_FAIL : status === "done" ? TJ_OK : TJ_TEXT;
        ctx.fillText(`Ollama: ${status}${model ? " / " + model : ""}`, x + 10, top + 17);
        const half = Math.floor((panelW - 30) / 2);
        drawPreviewBlock(ctx, x + 10, top + 28, half, 54, "Log", node._tj_llm_log || "Ready.", TJ_MUTED, { fill: "#0e0e0e" });
        drawPreviewBlock(ctx, x + 20 + half, top + 28, half, 54, "Thinking", node._tj_llm_thinking || "", "#888", { fill: "#0e0e0e" });
        drawPreviewBlock(ctx, x + 10, top + 90, panelW - 20, 52, "Response", node._tj_llm_answer || "", TJ_MUTED, { fill: "#0e0e0e" });
        this.hitAreas = {
            log: [x + half - 34, top + 34, 30, 18],
            thinking: [x + panelW - 44, top + 34, 30, 18],
            response: [x + panelW - 44, top + 96, 30, 18],
        };
        this.drawMoreButton(ctx, this.hitAreas.log, this.pressed === "log");
        this.drawMoreButton(ctx, this.hitAreas.thinking, this.pressed === "thinking");
        this.drawMoreButton(ctx, this.hitAreas.response, this.pressed === "response");
        ctx.restore();
    }
    mouse(event, pos, node) {
        const type = String(event?.type || "");
        const key = Object.entries(this.hitAreas || {}).find(([, b]) => pos[0] >= b[0] && pos[0] <= b[0] + b[2] && pos[1] >= b[1] && pos[1] <= b[1] + b[3])?.[0] || "";
        if ((type === "pointerdown" || type === "mousedown") && key) { this.pressed = key; markDirty(node); return true; }
        if ((type === "pointerup" || type === "mouseup") && this.pressed) {
            const pressed = this.pressed; this.pressed = "";
            if (key === pressed) {
                if (pressed === "log") openLargeTextViewer("Log", node._tj_llm_log || "Ready.");
                else if (pressed === "thinking") openLargeTextViewer("Thinking", node._tj_llm_thinking || "Waiting for run output.");
                else if (pressed === "response") openLargeTextViewer("Response", node._tj_llm_answer || "Waiting for run output.");
            }
            markDirty(node);
            return true;
        }
        return Boolean(this.pressed);
    }
}

async function refreshOllamaModels(node) {
    setLoaderState(node, { status: "refreshing", log: "Refreshing Ollama models..." });
    try {
        const server_url = getWidgetValue(node, "server_url", "http://127.0.0.1:11434");
        const res = await api.fetchApi("/tj/local_llm/models", { method: "POST", body: JSON.stringify({ server_url }) });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
        const values = (data.models || []).map(m => m.id).filter(Boolean);
        const modelW = getWidget(node, "model");
        if (modelW && values.length) {
            modelW.options = { ...(modelW.options || {}), values };
            if (!values.includes(modelW.value)) modelW.value = values[0];
        }
        setLoaderState(node, { status: "ready", log: `Models: ${values.length} found` });
    } catch (err) {
        setLoaderState(node, { status: "error", log: `Refresh failed: ${err.message || err}` });
    }
}
async function stopOllama(node) {
    const model = getWidgetValue(node, "model", "");
    const server_url = getWidgetValue(node, "server_url", "http://127.0.0.1:11434");
    try {
        const res = await api.fetchApi("/tj/local_llm/stop", { method: "POST", body: JSON.stringify({ server_url, model }) });
        const data = await res.json();
        setLoaderState(node, { status: data.ok ? "stopping" : "ready", log: data.message || data.error || "Stop requested." });
    } catch (err) { setLoaderState(node, { status: "error", log: `Stop failed: ${err.message || err}` }); }
}
async function unloadOllama(node) {
    const model = getWidgetValue(node, "model", "");
    const server_url = getWidgetValue(node, "server_url", "http://127.0.0.1:11434");
    try {
        const res = await api.fetchApi("/tj/local_llm/unload", { method: "POST", body: JSON.stringify({ server_url, model }) });
        const data = await res.json();
        setLoaderState(node, { status: data.ok ? "ready" : "busy", log: data.message || data.error || "Unload requested." });
    } catch (err) { setLoaderState(node, { status: "error", log: `Unload failed: ${err.message || err}` }); }
}
function setLoaderState(node, patch = {}) {
    node._tj_llm_status = patch.status || node._tj_llm_status || "ready";
    node._tj_llm_log = patch.log ?? node._tj_llm_log ?? "Ready.";
    node._tj_llm_answer = patch.answer ?? node._tj_llm_answer ?? "";
    node._tj_llm_thinking = patch.thinking ?? node._tj_llm_thinking ?? "";
    node._tj_llm_model = patch.model ?? node._tj_llm_model ?? "";
    markDirty(node);
}

const LOADER_ADVANCED_WIDGETS = ["temperature", "top_p", "repeat_penalty", "model_memory", "keep_minutes", "comfy_vram_policy"];
const CQC_ADVANCED_WIDGETS = ["pass_words", "reject_words", "unclear_result", "seed", "control_after_generate", "seed_mode"];
function setAdvancedWidgetsVisible(node, names, open) {
    for (const name of names) setWidgetVisible(getWidget(node, name), !!open);
    markDirty(node);
}
function ensureAdvancedToggle(node, propName, widgetName, labelPrefix, names) {
    node.properties = node.properties || {};
    if (node.properties[propName] === undefined) node.properties[propName] = false;
    let toggle = getWidget(node, widgetName);
    const update = () => {
        const open = !!node.properties[propName];
        setAdvancedWidgetsVisible(node, names, open);
        const w = getWidget(node, widgetName);
        if (w) w.label = `${labelPrefix}: ${open ? "Hide" : "Show"}`;
        if (node?.type === LOADER_NODE) { forceLoaderCompactHeight(node); scheduleAutoFitLocalLLMNode(node, 360, open ? 760 : 620); }
        if (node?.type === CQC_NODE) scheduleAutoFitLocalLLMNode(node, 260, open ? 560 : 520);
    };
    if (!toggle) {
        toggle = node.addWidget("button", `${labelPrefix}: Show`, null, () => {
            node.properties[propName] = !node.properties[propName];
            update();
        }, { serialize: false });
        toggle.name = widgetName;
    }
    update();
    return toggle;
}

function moveWidgetsAfter(node, anchorName, moveNames) {
    if (!node?.widgets?.length) return;
    const anchorIndex = node.widgets.findIndex(w => w?.name === anchorName);
    if (anchorIndex < 0) return;
    const moveSet = new Set(moveNames);
    const moving = [];
    const rest = [];
    for (const w of node.widgets) {
        if (moveSet.has(w?.name)) moving.push(w);
        else rest.push(w);
    }
    const nextAnchorIndex = rest.findIndex(w => w?.name === anchorName);
    if (nextAnchorIndex < 0) return;
    rest.splice(nextAnchorIndex + 1, 0, ...moving.sort((a, b) => moveNames.indexOf(a.name) - moveNames.indexOf(b.name)));
    node.widgets = rest;
}

function removeWidgetByName(node, name) {
    if (!node?.widgets?.length) return false;
    const before = node.widgets.length;
    node.widgets = node.widgets.filter(w => w?.name !== name);
    return node.widgets.length !== before;
}

function normalizeLoaderWidgetLabelsAndLegacy(node) {
    if (!node?.widgets) return;
    // 이전 실험 버전에서 남은 control_after_generate 위젯은 Loader에는 쓰지 않는다.
    removeWidgetByName(node, "control_after_generate");

    const labels = {
        get_name: "get_name",
        setnode_name: "setnode_name",
        server_url: "server_url",
        model: "model",
        user_prompt: "user_prompt",
        thinking: "thinking",
        seed: "seed",
        seed_mode: "seed_mode",
        temperature: "temperature",
        top_p: "top_p",
        repeat_penalty: "repeat_penalty",
        model_memory: "model_memory",
        keep_minutes: "keep_minutes",
        comfy_vram_policy: "comfy_vram_policy",
    };
    for (const w of node.widgets) {
        if (labels[w?.name]) w.label = labels[w.name];
    }
}

function forceLoaderCompactHeight(node) {
    if (!node) return;
    node.properties = node.properties || {};
    const maxH = node.properties.tj_loader_advanced_open ? 760 : 560;
    const current = Number(node.size?.[1] || 0);
    if (!current || current > maxH) {
        node.size[1] = maxH;
        node.properties.tj_user_resized_local_llm = false;
    }
}

function autoFitLocalLLMNode(node, minH = 220, maxH = 620) {
    if (!node || !node.computeSize) return;
    try {
        const sz = node.computeSize();
        const nextW = Math.max(Number(node.size?.[0] || 0), Number(sz?.[0] || 0));
        const nextH = Math.max(minH, Math.min(Number(sz?.[1] || minH), maxH));
        if (Math.abs(Number(node.size?.[1] || 0) - nextH) > 2 || Math.abs(Number(node.size?.[0] || 0) - nextW) > 2) {
            node.size[0] = nextW;
            node.size[1] = nextH;
        }
        markDirty(node);
    } catch (_) {}
}

function scheduleAutoFitLocalLLMNode(node, minH = 220, maxH = 620) {
    setTimeout(() => autoFitLocalLLMNode(node, minH, maxH), 0);
    setTimeout(() => autoFitLocalLLMNode(node, minH, maxH), 80);
}

function ensureCqcSlots(node) {
    if (!node) return;
    const graph = node.graph || app.graph;
    const ensureInput = (index, name, type) => {
        if (!node.inputs) node.inputs = [];
        let slot = node.inputs.find(s => s?.name === name);
        if (!slot) slot = node.inputs[index] || {};
        slot.name = name;
        slot.localized_name = name;
        slot.label = slot.label || name;
        slot.type = type;
        if (!node.inputs.includes(slot)) node.inputs.splice(index, 0, slot);
        else {
            const old = node.inputs.indexOf(slot);
            if (old !== index) {
                node.inputs.splice(old, 1);
                node.inputs.splice(index, 0, slot);
            }
        }
        const links = [];
        if (slot.link != null) links.push(slot.link);
        if (Array.isArray(slot.links)) links.push(...slot.links);
        for (const lid of links) {
            const link = graph?.links?.[lid] || graph?.links?.get?.(lid);
            if (link && link.target_id === node.id) link.target_slot = index;
        }
    };
    ensureInput(0, "prompt_in", "STRING");
    ensureInput(1, "image", "IMAGE");
    ensureInput(2, "audio", "*");
    if (node.inputs?.length > 3) node.inputs = node.inputs.slice(0, 3);
    if (!node.outputs) node.outputs = [];
    const ensureOutput = (index, name, type) => {
        let slot = node.outputs[index] || {};
        slot.name = name;
        slot.localized_name = name;
        slot.type = type;
        slot.label = slot.label || name;
        node.outputs[index] = slot;
        if (Array.isArray(slot.links)) {
            for (const lid of slot.links) {
                const link = graph?.links?.[lid] || graph?.links?.get?.(lid);
                if (link && link.origin_id === node.id) link.origin_slot = index;
            }
        }
    };
    ensureOutput(0, "QC_Image", "IMAGE");
    ensureOutput(1, "QC_audio", "*");
    ensureOutput(2, "QC_result", "*");
    if (node.outputs?.length > 3) node.outputs = node.outputs.slice(0, 3);
}

function installOllamaLoaderUI(node) {
    if (node._tj_loader_ui_installed) return;
    node._tj_loader_ui_installed = true;
    node.resizable = true;
    node.size[0] = Math.max(Number(node.size?.[0] || 0), DEFAULT_WIDTH);
    normalizeLoaderWidgetLabelsAndLegacy(node);
    forceLoaderCompactHeight(node);
    setLoaderState(node, { status: "ready", log: "Ollama ready." });
    const sysW = getWidget(node, "system_prompt");
    if (sysW) {
        sysW.label = "System Prompt";
        sysW.computeSize = () => [0, -4];
        sysW.draw = () => {};
    }
    const promptW = getWidget(node, "user_prompt");
    if (promptW) {
        promptW.label = "User Prompt";
        promptW.computeSize = (width) => [Math.max(width || DEFAULT_WIDTH, 360), 112];
    }
    ensureAdvancedToggle(node, "tj_loader_advanced_open", "tj_loader_advanced_toggle", "Settings", LOADER_ADVANCED_WIDGETS);
    const buttons = [
        ["refresh_models", "Refresh Models", () => refreshOllamaModels(node)],
        ["stop_llm", "Stop LLM", () => stopOllama(node)],
        ["unload_llm", "Unload LLM", () => unloadOllama(node)],
        ["system_prompt_popup", "System Prompt", () => openSystemPromptDialog(node)],
    ];
    for (const [name, label, cb] of buttons) {
        if (!getWidget(node, name)) {
            const w = node.addWidget("button", label, null, cb, { serialize: false });
            w.name = name;
        }
    }
    moveWidgetsAfter(node, "model", ["refresh_models", "stop_llm", "unload_llm"]);
    if (!getWidget(node, "tj_local_llm_preview")) node.addCustomWidget(new LoaderPreviewWidget(node));
    patchComputeSize(node, DEFAULT_WIDTH, 0);
    scheduleAutoFitLocalLLMNode(node, 360, node.properties?.tj_loader_advanced_open ? 760 : 620);
    markDirty(node);
}

// ─────────────────────────────────────────────────────────────
// CQC Reviewer UI: Deno-inspired controls, status, help, seed dialog, retry.
// ─────────────────────────────────────────────────────────────
function ensureReviewerRetryProperties(node) {
    node.properties = node.properties || {};
    node.properties[PROP_AUTO_RETRY] = Boolean(node.properties[PROP_AUTO_RETRY]);
    node.properties[PROP_SEED_TARGET] = String(node.properties[PROP_SEED_TARGET] || REVIEWER_SEED_AUTO);
}
function reviewerAutoRetryEnabled(node) { ensureReviewerRetryProperties(node); return Boolean(node.properties[PROP_AUTO_RETRY]); }
function setReviewerAutoRetryEnabled(node, enabled) {
    ensureReviewerRetryProperties(node);
    node.properties[PROP_AUTO_RETRY] = Boolean(enabled);
    resetReviewerAutoRetry(node);
    markDirty(node);
}
function resetReviewerAutoRetry(node) {
    node._tj_cqc_retry_active = false;
    node._tj_cqc_retry_attempt = 0;
    node._tj_cqc_retry_busy = false;
}
function isSeedWidgetCandidate(widget) {
    const name = String(widget?.name || widget?.label || "").toLowerCase();
    if (!name || !name.includes("seed") || name.includes("seed_mode") || name.includes("control")) return false;
    const value = Number(widget?.value);
    return Number.isFinite(value);
}
function collectSeedCandidates(node) {
    const graph = node.graph || app.graph;
    const candidates = [];
    let order = 0;
    for (const n of graphNodes(graph)) {
        if (!n || n === node || n.type === CQC_NODE) continue;
        for (const w of n.widgets || []) {
            if (!isSeedWidgetCandidate(w)) continue;
            const nodeId = String(n.id ?? "");
            const widgetName = String(w.name || w.label || "seed");
            candidates.push({ node: n, widget: w, nodeId, widgetName, key: `${nodeId}:${widgetName}`, value: Number(w.value), order: order++ });
        }
    }
    return candidates;
}
function seedTarget(node) { ensureReviewerRetryProperties(node); return String(node.properties[PROP_SEED_TARGET] || REVIEWER_SEED_AUTO); }
function seedTargetCandidate(node) {
    const target = seedTarget(node);
    const candidates = collectSeedCandidates(node);
    return target && target !== REVIEWER_SEED_AUTO ? candidates.find(c => c.key === target) || null : candidates[0] || null;
}
function seedButtonLabel(node) {
    const target = seedTarget(node);
    if (target === REVIEWER_SEED_AUTO) return "Seed: Auto";
    const c = collectSeedCandidates(node).find(x => x.key === target);
    return c ? `Seed: #${c.nodeId} ${c.widgetName}` : "Seed: Missing";
}
function widgetMax(widget) {
    const max = Number(widget?.options?.max ?? widget?.max ?? widget?.options?.max_value);
    return Number.isFinite(max) && max > 0 ? Math.min(Math.floor(max), Number.MAX_SAFE_INTEGER) : 1125899906842624;
}
function incrementRetrySeed(node) {
    const c = seedTargetCandidate(node);
    if (!c?.widget) return null;
    const oldSeed = Math.max(0, Math.floor(Number(c.widget.value) || 0));
    const maxSeed = widgetMax(c.widget);
    const newSeed = oldSeed >= maxSeed ? 0 : oldSeed + 1;
    c.widget.value = newSeed;
    try { c.widget.callback?.call(c.widget, newSeed, app.canvas, c.node); } catch (_) { try { c.widget.callback?.(newSeed); } catch (_) {} }
    markDirty(c.node);
    return { ...c, oldSeed, newSeed, label: `#${c.nodeId} ${c.widgetName}` };
}
function openSeedTargetDialog(node) {
    const { overlay, box } = showTJModal("tj-local-llm-seed-modal", 620);
    const candidates = collectSeedCandidates(node);
    const current = seedTarget(node);
    const wrap = document.createElement("div");
    wrap.style.cssText = "padding:18px;";
    const title = document.createElement("div");
    title.textContent = "Retry Seed Target";
    title.style.cssText = `font-weight:700;font-size:16px;padding-bottom:10px;margin-bottom:12px;border-bottom:1px solid ${TJ_PURPLE};`;
    wrap.appendChild(title);
    const addRow = (label, value, active) => {
        const row = document.createElement("div");
        row.textContent = label;
        row.style.cssText = `padding:10px;border:1px solid ${active ? TJ_PURPLE : "#333"};background:${active ? "#1a0630" : "#080808"};border-radius:6px;margin-bottom:8px;cursor:pointer;color:#fff;font-size:13px;`;
        row.onclick = () => { node.properties[PROP_SEED_TARGET] = value; resetReviewerAutoRetry(node); setCqcReason(node, `Seed target: ${label}`); overlay.remove(); markDirty(node); };
        wrap.appendChild(row);
    };
    addRow("Auto: first seed widget found", REVIEWER_SEED_AUTO, current === REVIEWER_SEED_AUTO);
    if (!candidates.length) {
        const empty = document.createElement("div");
        empty.textContent = "No seed widgets found. Connect a sampler/generation node or rerun manually.";
        empty.style.cssText = "color:#aaa;font-size:13px;padding:10px;";
        wrap.appendChild(empty);
    }
    candidates.forEach(c => addRow(`#${c.nodeId} / ${c.widgetName} = ${c.value}`, c.key, current === c.key));
    box.appendChild(wrap);
}
function drawButton(ctx, b, label, active = false, pressed = false, accent = TJ_SOFT) {
    ctx.save();
    const fill = pressed ? "#2a0b4d" : active ? "#1a0630" : "#111";
    const stroke = active ? TJ_PURPLE : "#333";
    drawRoundRect(ctx, b[0], b[1], b[2], b[3], 5, fill, stroke);
    ctx.font = "11px sans-serif";
    ctx.fillStyle = active ? accent : "#e8e8e8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, b[0] + b[2] / 2, b[1] + b[3] / 2);
    ctx.restore();
}
class CqcControlsWidget {
    constructor(node) {
        this.name = "tj_cqc_controls";
        this.type = "custom";
        this.node = node;
        this.options = { serialize: false };
        this.hitAreas = {};
        this.pressed = "";
    }
    serializeValue() { return undefined; }
    computeSize(width) { return [Math.max(width || CQC_DEFAULT_WIDTH, CQC_DEFAULT_WIDTH), 148]; }
    draw(ctx, node, width, y, height) {
        this.node = node;
        const drawW = Math.max(1, Math.min(width || node.size?.[0] || CQC_DEFAULT_WIDTH, node.size?.[0] || CQC_DEFAULT_WIDTH));
        const x = 15, panelY = y + 6, panelW = Math.max(1, drawW - 30), gap = 8, rowH = 26;
        const halfW = (panelW - gap) / 2;
        const mode = String(getWidgetValue(node, "review_mode", "Review") || "Review");
        const autoRetry = reviewerAutoRetryEnabled(node);
        const b = {
            review: [x, panelY, halfW, rowH],
            pass: [x + halfW + gap, panelY, halfW, rowH],
            approve: [x, panelY + rowH + 7, halfW, rowH],
            regenerate: [x + halfW + gap, panelY + rowH + 7, halfW, rowH],
            retry: [x, panelY + (rowH + 7) * 2, halfW, rowH],
            seed: [x + halfW + gap, panelY + (rowH + 7) * 2, halfW, rowH],
            help: [x, panelY + (rowH + 7) * 3, panelW, rowH],
        };
        this.hitAreas = b;
        drawButton(ctx, b.review, "Review", mode !== "Pass", this.pressed === "review", TJ_OK);
        drawButton(ctx, b.pass, "Pass", mode === "Pass", this.pressed === "pass", TJ_WARN);
        drawButton(ctx, b.approve, "Approve Once", false, this.pressed === "approve", TJ_OK);
        drawButton(ctx, b.regenerate, "Regenerate", false, this.pressed === "regenerate", TJ_SOFT);
        drawButton(ctx, b.retry, autoRetry ? "Retry x3 On" : "Retry x3 Off", autoRetry, this.pressed === "retry", TJ_OK);
        drawButton(ctx, b.seed, seedButtonLabel(node), seedTarget(node) !== REVIEWER_SEED_AUTO, this.pressed === "seed", TJ_SOFT);
        drawButton(ctx, b.help, "How to use", false, this.pressed === "help", TJ_SOFT);
    }
    mouse(event, pos, node) {
        const type = String(event?.type || "");
        const key = Object.entries(this.hitAreas || {}).find(([, bounds]) => pos[0] >= bounds[0] && pos[0] <= bounds[0]+bounds[2] && pos[1] >= bounds[1] && pos[1] <= bounds[1]+bounds[3])?.[0] || "";
        if ((type === "pointerdown" || type === "mousedown") && key) { this.pressed = key; markDirty(node); return true; }
        if ((type === "pointerup" || type === "mouseup") && this.pressed) {
            const pressed = this.pressed; this.pressed = "";
            if (key !== pressed) { markDirty(node); return true; }
            if (pressed === "review") { resetReviewerAutoRetry(node); setWidgetValue(node, "review_mode", "Review"); setWidgetValue(node, "approve_once", false, false); setCqcReason(node, "Review mode. Press Run."); }
            else if (pressed === "pass") { resetReviewerAutoRetry(node); setWidgetValue(node, "review_mode", "Pass"); setWidgetValue(node, "approve_once", false, false); setCqcReason(node, "Pass mode. Press Run."); }
            else if (pressed === "approve") { setWidgetValue(node, "approve_once", true, false); setCqcReason(node, "Approve Once enabled. Press Run."); }
            else if (pressed === "regenerate") { setCqcReason(node, "Regenerate requested."); queuePromptSafe(); }
            else if (pressed === "retry") { setReviewerAutoRetryEnabled(node, !reviewerAutoRetryEnabled(node)); setCqcReason(node, reviewerAutoRetryEnabled(node) ? "Auto retry enabled." : "Auto retry disabled."); }
            else if (pressed === "seed") openSeedTargetDialog(node);
            else if (pressed === "help") openCqcHelpDialog();
            markDirty(node); return true;
        }
        return Boolean(this.pressed);
    }
}
class CqcStatusWidget {
    constructor(node) {
        this.name = "tj_cqc_status";
        this.type = "custom";
        this.node = node;
        this.options = { serialize: false };
    }
    serializeValue() { return undefined; }
    computeSize(width) { return [Math.max(width || CQC_DEFAULT_WIDTH, CQC_DEFAULT_WIDTH), 116]; }
    draw(ctx, node, width, y, height) {
        const drawW = Math.max(1, Math.min(width || node.size?.[0] || CQC_DEFAULT_WIDTH, node.size?.[0] || CQC_DEFAULT_WIDTH));
        const x = 12, panelW = Math.max(1, drawW - 24), top = y + 6;
        const passed = node._tj_review_passed;
        const verdict = node._tj_review_verdict || "READY";
        drawRoundRect(ctx, x, top, panelW, 104, 7, "#070707", passed === true ? TJ_OK : passed === false ? TJ_FAIL : TJ_PURPLE);
        ctx.save();
        ctx.font = "12px sans-serif";
        ctx.fillStyle = passed === true ? TJ_OK : passed === false ? TJ_FAIL : TJ_TEXT;
        ctx.fillText(`Quality: ${verdict}`, x + 10, top + 18);
        ctx.font = PREVIEW_FONT;
        ctx.fillStyle = TJ_MUTED;
        const text = node._tj_review_reason || node._tj_review_log || "Waiting for review output.";
        splitLinesForWidth(ctx, text, panelW - 20, 5).forEach((l, i) => ctx.fillText(l, x + 10, top + 39 + i * LINE_H));
        ctx.restore();
    }
}
function setCqcReason(node, reason) { node._tj_review_reason = reason; markDirty(node); }
function ensureContentQualityControllerAutoSets(node) {
    if (!node.properties) node.properties = {};
    if (node.outputs?.[0]) { node.outputs[0].name = "QC_Image"; node.outputs[0].localized_name = "QC_Image"; node.outputs[0].type = "IMAGE"; }
    if (node.outputs?.[1]) { node.outputs[1].name = "QC_audio"; node.outputs[1].localized_name = "QC_audio"; node.outputs[1].type = "*"; }
    if (node.outputs?.[2]) { node.outputs[2].name = "QC_result"; node.outputs[2].localized_name = "QC_result"; node.outputs[2].type = "*"; }
    const autoW = node.widgets?.find(w => w.name === "auto_set");
    const enabled = !autoW || autoW.value;
    node.properties.auto_sets = {};
    if (enabled) {
        node.properties.auto_sets[0] = "QC_Image";
        node.properties.auto_sets[1] = "QC_audio";
        node.properties.auto_sets[2] = "QC_result";
        if (node.outputs?.[0]) node.outputs[0].label = "QC_Image ▸";
        if (node.outputs?.[1]) node.outputs[1].label = "QC_audio ▸";
        if (node.outputs?.[2]) node.outputs[2].label = "QC_result ▸";
    } else {
        if (node.outputs?.[0]) node.outputs[0].label = "QC_Image";
        if (node.outputs?.[1]) node.outputs[1].label = "QC_audio";
        if (node.outputs?.[2]) node.outputs[2].label = "QC_result";
    }
    window.TJ_NODE_scheduleWirelessRepair?.(node.graph, 80);
    markDirty(node);
}
function installContentQualityControllerUI(node) {
    ensureCqcSlots(node);
    if (node._tj_cqc_ui_installed) return;
    node._tj_cqc_ui_installed = true;
    node.resizable = true;
    node.size[0] = Math.max(Number(node.size?.[0] || 0), CQC_DEFAULT_WIDTH);
    ensureReviewerRetryProperties(node);
    hideWidget(getWidget(node, "review_mode"));
    hideWidget(getWidget(node, "approve_once"));
    ensureAdvancedToggle(node, "tj_cqc_advanced_open", "tj_cqc_advanced_toggle", "Advanced", CQC_ADVANCED_WIDGETS);
    node._tj_review_log = "Quality Controller ready.";
    node._tj_review_reason = "Waiting for review output.";
    if (!getWidget(node, "tj_cqc_controls")) node.addCustomWidget(new CqcControlsWidget(node));
    if (!getWidget(node, "tj_cqc_status")) node.addCustomWidget(new CqcStatusWidget(node));
    const autoW = getWidget(node, "auto_set");
    if (autoW && node.properties && node.properties.tj_cqc_autoset_initialized !== true) {
        autoW.value = false;
        node.properties.tj_cqc_autoset_initialized = true;
    }
    if (autoW && !autoW._tj_autoset_cb) {
        autoW._tj_autoset_cb = true;
        const orig = autoW.callback;
        autoW.callback = function(v) { if (orig) orig.call(this, v); ensureContentQualityControllerAutoSets(node); };
    }
    ensureContentQualityControllerAutoSets(node);
    patchComputeSize(node, CQC_DEFAULT_WIDTH, 12);
    markDirty(node);
}
function queuePromptSafe() {
    try {
        if (typeof app.queuePrompt === "function") return void app.queuePrompt(0, 1);
        if (typeof app.queuePrompt === "object" && typeof app.queuePrompt.queuePrompt === "function") return void app.queuePrompt.queuePrompt(0, 1);
        document.querySelector("#queue-button")?.click?.();
    } catch (err) { console.warn("[TJ_LOCAL_LLM] queue failed", err); }
}
function maybeAutoRetry(node, info) {
    if (!node || !info || info.passed || !reviewerAutoRetryEnabled(node)) return;
    if (node._tj_cqc_retry_busy) return;
    const attempt = Number(node._tj_cqc_retry_attempt || 0);
    if (attempt >= REVIEWER_AUTO_RETRY_MAX) {
        node._tj_cqc_retry_active = false;
        setCqcReason(node, `Auto retry stopped after ${REVIEWER_AUTO_RETRY_MAX} failed attempts. ${info.reason || ""}`);
        return;
    }
    const seedChange = incrementRetrySeed(node);
    if (!seedChange) {
        setCqcReason(node, "Auto retry failed: no seed widget found.");
        return;
    }
    node._tj_cqc_retry_busy = true;
    node._tj_cqc_retry_attempt = attempt + 1;
    setCqcReason(node, `Auto retry ${node._tj_cqc_retry_attempt}/${REVIEWER_AUTO_RETRY_MAX}: ${seedChange.label} ${seedChange.oldSeed} → ${seedChange.newSeed}`);
    setTimeout(() => { node._tj_cqc_retry_busy = false; queuePromptSafe(); }, 250);
}

function patchComputeSize(node, minWidth, extraHeight) {
    if (node._tj_local_llm_compute_patched) return;
    node._tj_local_llm_compute_patched = true;
    const origCompute = node.computeSize;
    node.computeSize = function(out) {
        const size = origCompute ? origCompute.apply(this, arguments) : LGraphNode.prototype.computeSize.apply(this, arguments);
        return [Math.max(size[0], minWidth), Math.max(size[1] + (extraHeight || 0), 220)];
    };
    setTimeout(() => {
        autoFitLocalLLMNode(node, node.type === LOADER_NODE ? 360 : 260, node.type === LOADER_NODE ? 620 : 520);
    }, 50);
}

app.registerExtension({
    name: "TJ.LocalLLM",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === LOADER_NODE) {
            const onCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                const r = onCreated?.apply(this, arguments);
                applyTJTheme(this);
                normalizeTitle(this, LOADER_TITLE);
                attachSetNodeSync(this);
                attachTJGetReceiver(this, { widgetName: "get_name", inputIndex: 0, inputName: "image", defaultType: "IMAGE", defaultOutputType: "IMAGE" });
                installOllamaLoaderUI(this);
                return r;
            };
            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function() {
                const r = onConfigure?.apply(this, arguments);
                queueMicrotask(() => { applyTJTheme(this); installOllamaLoaderUI(this); });
                return r;
            };
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                const r = onExecuted?.apply(this, arguments);
                const item = message?.tj_ollama_loader?.[0];
                if (item) {
                    setLoaderState(this, { status: "done", log: `Done: ${item.model || "Ollama"}`, answer: item.response || "", thinking: item.thinking || "", model: item.model || "" });
                    scheduleAutoFitLocalLLMNode(this, 360, 620);
                }
                return r;
            };
        }
        if (nodeData.name === CQC_NODE) {
            const onCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                const r = onCreated?.apply(this, arguments);
                applyTJTheme(this);
                normalizeTitle(this, CQC_TITLE);
                ensureCqcSlots(this);
                attachTJGetReceiver(this, { widgetName: "get_name_1", inputIndex: 0, inputName: "prompt_in", defaultType: "STRING" });
                attachTJGetReceiver(this, { widgetName: "get_name_2", inputIndex: 1, inputName: "image", defaultType: "IMAGE" });
                attachTJGetReceiver(this, { widgetName: "get_name_3", inputIndex: 2, inputName: "audio", defaultType: "*" });
                installContentQualityControllerUI(this);
                return r;
            };
            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function() {
                const r = onConfigure?.apply(this, arguments);
                queueMicrotask(() => { applyTJTheme(this); ensureCqcSlots(this); installContentQualityControllerUI(this); });
                return r;
            };
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                const r = onExecuted?.apply(this, arguments);
                const item = message?.tj_llm_content_quality_controller?.[0];
                if (item) {
                    this._tj_review_passed = !!item.passed;
                    this._tj_review_verdict = item.verdict || (item.passed ? "OK" : "FAIL");
                    this._tj_review_reason = item.reason || "";
                    this._tj_review_log = item.review || "";
                    this._tj_qc_result = item.qc_result || "";
                    ensureContentQualityControllerAutoSets(this);
                    maybeAutoRetry(this, item);
                    if (item.passed) resetReviewerAutoRetry(this);
                    markDirty(this);
                }
                return r;
            };
        }
    },
    nodeCreated(node) {
        if (node?.type === LOADER_NODE) { applyTJTheme(node); installOllamaLoaderUI(node); }
        if (node?.type === CQC_NODE) { applyTJTheme(node); installContentQualityControllerUI(node); }
    },
    setup() {
        setTimeout(() => graphNodes(app.graph).forEach(n => {
            if (n?.type === LOADER_NODE) { applyTJTheme(n); installOllamaLoaderUI(n); }
            if (n?.type === CQC_NODE) { applyTJTheme(n); installContentQualityControllerUI(n); }
        }), 500);
    }
});

api.addEventListener(PROGRESS_EVENT, (event) => {
    const p = event.detail || event;
    const node = graphNodes(app.graph).find(n => String(n.id) === String(p.node_id));
    if (!node || node.type !== LOADER_NODE) return;
    setLoaderState(node, {
        status: p.error ? "error" : String(p.status || "running"),
        log: p.error ? `Error: ${p.error}` : `${p.status || "running"} ${p.index || 0}/${p.total || 0}`,
        answer: p.error ? "" : String(p.answer || node._tj_llm_answer || ""),
        thinking: String(p.thinking || node._tj_llm_thinking || ""),
        model: String(p.model || node._tj_llm_model || ""),
    });
    scheduleAutoFitLocalLLMNode(node, 360, 620);
});
