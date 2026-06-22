// web/tj_flux2_klein.js
// -----------------------------------------------------------------------------
// Flux2 Klein 4B/9B (TJ)
// TJ_NODE UI integration: fixed 5 embedded GET reference slots, Auto Set,
// seed-after-generate, LoRA slot controls, size readout, and title help badge.
// -----------------------------------------------------------------------------

import { app } from "../../scripts/app.js";

const NODE_TYPE = "TJ_Flux2Klein";
const MAX_LORA_SLOTS = 5;
const MAX_REFERENCE_SLOTS = 5;
const ACCENT = "#B78CFF";
const TJ_SEED_MAX_SAFE = 0x1fffffffffffff;
const TJ_SEED_HOOK_VERSION = "TJ_SEED_FLUX2_KLEIN_V1";

const RATIO_PRESETS = {
    "1:1": [1, 1], "16:9": [16, 9], "9:16": [9, 16], "4:3": [4, 3],
    "3:4": [3, 4], "3:2": [3, 2], "2:3": [2, 3], "21:9": [21, 9], "9:21": [9, 21],
};

const ADVANCED_WIDGETS = [
    "divisible_by",
    "sampler_name", "denoise",
    "get_name_reference_3", "get_name_reference_4", "get_name_reference_5",
];

const OVERRIDE_INPUT_SPECS = [
    ["model_override", "MODEL"],
    ["clip_override", "CLIP"],
    ["vae_override", "VAE"],
];

const REF_SPECS = Array.from({ length: MAX_REFERENCE_SLOTS }, (_, i) => {
    const slot = i + 1;
    return { widgetName: `get_name_reference_${slot}`, inputName: `reference_${slot}_image`, defaultType: "IMAGE" };
});

function findWidget(node, name) { return node.widgets?.find(w => w.name === name); }
function currentInputIndex(node, inputName) {
    return node.inputs ? node.inputs.findIndex(i => (i?._tj_flux_input_name || i?.widget?.name || i?.name) === inputName) : -1;
}
function currentInput(node, inputName) {
    const idx = currentInputIndex(node, inputName);
    return idx >= 0 ? { input: node.inputs[idx], index: idx } : { input: null, index: -1 };
}
function refreshFluxGetSpecIndexes(node) {
    if (!node?._tj_flux_get_specs) return;
    for (const spec of node._tj_flux_get_specs) {
        const idx = currentInputIndex(node, spec.inputName);
        if (idx >= 0) {
            spec.inputIndex = idx;
            if (node.inputs?.[idx]) node.inputs[idx]._tj_flux_input_name = spec.inputName;
        }
    }
}
function graphLink(graph, linkId) { return graph?.links?.[linkId] || graph?.links?.get?.(linkId) || null; }
function isSeparator(value) { return !!(value && window.TJ_NODE_PROVIDER_SEPARATOR && value === window.TJ_NODE_PROVIDER_SEPARATOR); }
function providerOutputType(graph, value) {
    const provider = window.TJ_NODE_findProviderByValue ? window.TJ_NODE_findProviderByValue(graph, value) : null;
    const out = provider?.node?.outputs?.[provider.slot];
    return String(out?.type || "").toUpperCase();
}

function getProviderValues(graph, ownerNode = null, allowedTypes = null) {
    const raw = window.TJ_NODE_getAllSetNames ? window.TJ_NODE_getAllSetNames(graph) : ["(none)"];
    const values = Array.isArray(raw) ? raw : ["(none)"];
    const typeSet = allowedTypes ? new Set(allowedTypes.map(v => String(v).toUpperCase())) : null;
    return values.filter(v => {
        if (!v || v === "(none)" || isSeparator(v)) return true;
        const provider = window.TJ_NODE_findProviderByValue ? window.TJ_NODE_findProviderByValue(graph, v) : null;
        if (!provider) return true;
        if (ownerNode && provider.node === ownerNode) return false;
        if (typeSet) {
            const t = String(provider.node?.outputs?.[provider.slot]?.type || "").toUpperCase();
            if (!typeSet.has(t) && t !== "*") return false;
        }
        return true;
    });
}
function labelName(graph, value) { return window.TJ_NODE_getProviderLabelName ? window.TJ_NODE_getProviderLabelName(graph, value) : (value && value !== "(none)" ? String(value) : ""); }
function findSource(graph, value) { return window.TJ_NODE_findSetterSourceInfo ? window.TJ_NODE_findSetterSourceInfo(graph, value) : null; }
function isWireless(graph, linkId) { const link = graphLink(graph, linkId); return !!(link && (link._tj_wireless || link._tj_provider_value)); }
function removeLink(graph, linkId) { if (!graph || linkId == null) return; try { graph.removeLink(linkId); } catch (_) {} }
function attachSetSync(node) { if (window.TJ_NODE_attachProviderNameSync) return window.TJ_NODE_attachProviderNameSync(node); }

function applyTheme(node) {
    if (window.TJ_NODE_applyTheme) window.TJ_NODE_applyTheme(node);
    node.bgcolor = "#000000";
    node.color = "#7612DA";
    node.title_text_color = "#FFFFFF";
}

function setWidgetVisible(node, widget, visible) {
    if (!widget) return;
    if (!widget._tj_flux_orig_type) {
        widget._tj_flux_orig_type = widget.type;
        widget._tj_flux_orig_compute = widget.computeSize;
    }
    widget.hidden = !visible;
    widget.disabled = !visible;
    widget.type = visible ? widget._tj_flux_orig_type : "hidden";
    widget.computeSize = visible ? widget._tj_flux_orig_compute : () => [0, -4];
    node.setDirtyCanvas?.(true, true);
}

function setInputVisible(node, name, type, visible) {
    const idx = currentInputIndex(node, name);
    const exists = idx >= 0;
    if (visible) {
        if (!exists) {
            node.addInput(name, type);
            const fresh = currentInputIndex(node, name);
            if (fresh >= 0) node.inputs[fresh]._tj_flux_input_name = name;
        } else {
            node.inputs[idx].name = name;
            node.inputs[idx]._tj_flux_input_name = name;
        }
    } else if (exists && node.inputs[idx].link == null) {
        node.removeInput(idx);
    }
    refreshFluxGetSpecIndexes(node);
}

function setOverrideInputsVisible(node, visible) {
    for (const [name, type] of OVERRIDE_INPUT_SPECS) setInputVisible(node, name, type, visible);
}

function attachEmbeddedGet(node, opts) {
    const widgetName = opts.widgetName;
    const inputName = opts.inputName;
    const found = currentInput(node, inputName);
    if (found.index < 0) {
        console.warn(`[TJ_NODE Flux2 Klein] embedded get target input not found: ${inputName}`);
        return;
    }
    const defaultType = opts.defaultType || found.input?.type || "IMAGE";
    const getW = findWidget(node, widgetName);
    if (!getW || !found.input || getW._tj_get_attached) return;
    found.input._tj_flux_input_name = inputName;
    getW._tj_get_attached = true;

    const refreshProviderValues = () => {
        const values = getProviderValues(node.graph, node, [defaultType]);
        const next = Array.isArray(values) ? [...values] : ["(none)"];
        if (getW.value && getW.value !== "(none)" && !next.includes(getW.value)) next.push(getW.value);
        getW.options = { ...(getW.options || {}), values: next };
        return next;
    };

    const removeWirelessInputOnly = (target) => {
        const { input } = currentInput(target, inputName);
        if (!target.graph || !input || input.link == null) return;
        if (isWireless(target.graph, input.link)) {
            target._tj_connecting_wireless = true;
            try { removeLink(target.graph, input.link); }
            finally { target._tj_connecting_wireless = false; }
            input.link = null;
        }
    };

    const removeAnyInputLinkForEmbeddedGet = (target) => {
        const { input } = currentInput(target, inputName);
        if (!target.graph || !input || input.link == null) return;
        target._tj_connecting_wireless = true;
        try { removeLink(target.graph, input.link); }
        finally { target._tj_connecting_wireless = false; }
        input.link = null;
    };

    if (!node._tj_flux_get_specs) node._tj_flux_get_specs = [];
    node._tj_flux_get_specs.push({ widgetName, inputName, inputIndex: found.index, defaultType, refreshProviderValues });

    node[`_tjConnect_${widgetName}`] = function(value) {
        const targetSlot = currentInput(this, inputName);
        if (!this.graph || !targetSlot.input || targetSlot.index < 0) return;
        const inputIndex = targetSlot.index;
        const w = findWidget(this, widgetName);
        if (isSeparator(value)) {
            if (w) w.value = w._tj_previous_value || w.value || "(none)";
            return;
        }
        const selected = value || "(none)";
        if (w && w.value !== selected) w.value = selected;
        if (w) w._tj_previous_value = selected;

        const input = targetSlot.input;
        input.name = inputName;
        input._tj_flux_input_name = inputName;
        if (!selected || selected === "(none)") {
            // IMPORTANT: (none) must only clear TJ fake-wire links.
            // A real physical cable from another node must stay connected.
            // Previous patch removed every link here, which made direct IMAGE
            // connections impossible on reference_1~5.
            if (input.link != null && isWireless(this.graph, input.link)) {
                this._tj_connecting_wireless = true;
                try { removeLink(this.graph, input.link); }
                finally { this._tj_connecting_wireless = false; }
                input.link = null;
            }
            if (input.link == null) input.label = "";
            input.type = defaultType;
            app.canvas?.setDirty(true, true);
            return;
        }

        const provider = window.TJ_NODE_findProviderByValue ? window.TJ_NODE_findProviderByValue(this.graph, selected) : null;
        if (!provider) {
            input.label = `◀ ${labelName(this.graph, selected)}`;
            app.canvas?.setDirty(true, true);
            return;
        }

        const normalized = provider.displayName || selected;
        if (w && w.value !== normalized) w.value = normalized;
        if (w) w._tj_previous_value = normalized;

        const sourceInfoForConnect = findSource(this.graph, normalized);
        if (sourceInfoForConnect?.node && sourceInfoForConnect.slot != null && sourceInfoForConnect.node.outputs?.[sourceInfoForConnect.slot]) {
            // Embedded GET selection has priority over a direct cable.
            // Direct cable -> choose list value: remove the physical cable and create TJ fake-wire.
            // Choose (none): handled above and only removes fake-wire, not physical cable.
            removeAnyInputLinkForEmbeddedGet(this);
            this._tj_connecting_wireless = true;
            try {
                sourceInfoForConnect.node.connect(sourceInfoForConnect.slot, this, inputIndex);
                if (window.TJ_NODE_markWirelessLink) window.TJ_NODE_markWirelessLink(this.graph, this, inputIndex, normalized);
            } finally {
                this._tj_connecting_wireless = false;
            }
        }

        const sourceInfo = findSource(this.graph, normalized);
        input.name = inputName;
        input.type = sourceInfo?.node?.outputs?.[sourceInfo.slot]?.type || defaultType;
        input.label = `◀ ${provider.labelName || labelName(this.graph, normalized)}`;
        app.canvas?.setDirty(true, true);
    };

    const origCb = getW.callback;
    getW.callback = function(v) {
        origCb?.call(this, v);
        if (isSeparator(v)) {
            getW.value = getW._tj_previous_value || "(none)";
            return;
        }
        getW._tj_previous_value = v;
        node[`_tjConnect_${widgetName}`]?.(v);
    };

    const repair = () => {
        refreshProviderValues();
        node[`_tjConnect_${widgetName}`]?.(getW.value);
    };
    requestAnimationFrame(repair);
    setTimeout(repair, 140);
    setTimeout(repair, 500);
}

function attachAllReferenceGets(node) {
    for (const spec of REF_SPECS) attachEmbeddedGet(node, spec);
}

function syncAllReferenceGets(node) {
    if (!node?._tj_flux_get_specs) return;
    for (const spec of node._tj_flux_get_specs) {
        const w = findWidget(node, spec.widgetName);
        if (!w) continue;
        spec.refreshProviderValues?.();
        const selected = w.value || "(none)";
        node[`_tjConnect_${spec.widgetName}`]?.(selected);
    }
}

function clearReferenceGetSlot(node, spec) {
    const w = findWidget(node, spec.widgetName);
    if (w) {
        w.value = "(none)";
        w._tj_previous_value = "(none)";
    }
    const { input, index } = currentInput(node, spec.inputName);
    if (input) {
        spec.inputIndex = index;
        if (input.link != null && node.graph) removeLink(node.graph, input.link);
        input.link = null;
        input.label = "";
        input.type = spec.defaultType || "IMAGE";
        input.name = spec.inputName;
        input._tj_flux_input_name = spec.inputName;
    }
}


function tjOutputBaseName(name) { return String(name || "").replace(/^▶\s*/, "").replace(/\s*▶$/, ""); }

const FLUX2_OUTPUT_BASE_NAMES = ["Flux2 Klein", "latent", "positive", "negative", "setting"];
function tjEnsureOriginalOutputNames(node) {
    if (!node?.outputs) return;
    node.outputs.forEach((out, idx) => {
        if (!out) return;
        if (out._tj_flux_original_output_name === undefined) {
            const fallback = FLUX2_OUTPUT_BASE_NAMES[idx] || tjOutputBaseName(out.name || out.label || `output_${idx + 1}`);
            const raw = tjOutputBaseName(out.name || out.label || fallback);
            out._tj_flux_original_output_name = raw.includes("/") ? fallback : (raw || fallback);
        }
    });
}
function tjRestoreOriginalOutputNames(node) {
    if (!node?.outputs) return;
    let changed = false;
    tjEnsureOriginalOutputNames(node);
    node.outputs.forEach((out, idx) => {
        if (!out) return;
        const base = out._tj_flux_original_output_name || FLUX2_OUTPUT_BASE_NAMES[idx] || `output_${idx + 1}`;
        out._tj_output_base_name = base;
        out._tj_base_name = base;
        if (out.name !== base) { out.name = base; changed = true; }
        if (out.label !== base) { out.label = base; changed = true; }
        if (out.localized_name !== base) { out.localized_name = base; changed = true; }
    });
    if (changed) {
        node.setDirtyCanvas?.(true, true);
        app.canvas?.setDirty(true, true);
    }
}
function tjApplyOutputArrowState(node, enabled) {
    if (!node?.outputs) return;
    tjEnsureOriginalOutputNames(node);
    if (!enabled) {
        tjRestoreOriginalOutputNames(node);
        return;
    }
    let changed = false;
    for (const [idx, out] of (node.outputs || []).entries()) {
        if (!out) continue;
        const base = out._tj_flux_original_output_name || FLUX2_OUTPUT_BASE_NAMES[idx] || tjOutputBaseName(out.name || out.label || `output_${idx + 1}`);
        const display = `${base} ▶`;
        out._tj_output_base_name = base;
        out._tj_base_name = base;
        if (out.name !== display) { out.name = display; changed = true; }
        if (out.label !== display) { out.label = display; changed = true; }
        if (out.localized_name !== display) { out.localized_name = display; changed = true; }
    }
    if (changed) {
        node.setDirtyCanvas?.(true, true);
        app.canvas?.setDirty(true, true);
    }
}
function tjAutosetEnabled(node) { return !!findWidget(node, "auto_set")?.value; }
function updateAutoSets(node) {
    if (!node) return;
    if (!node.properties) node.properties = {};
    const enabled = tjAutosetEnabled(node);
    tjApplyOutputArrowState(node, enabled);
    if (!enabled) {
        node.properties.auto_sets = {};
        tjRestoreOriginalOutputNames(node);
    } else {
        tjEnsureOriginalOutputNames(node);
        const base = String(findWidget(node, "setnode_name")?.value || node.title || node.type || "Flux2 Klein").trim();
        const autoSets = {};
        (node.outputs || []).forEach((out, idx) => {
            const nm = (out?._tj_flux_original_output_name || FLUX2_OUTPUT_BASE_NAMES[idx] || `OUT_${idx + 1}`).trim();
            if (nm) autoSets[idx] = base ? `${base}/${nm}` : nm;
        });
        node.properties.auto_sets = autoSets;
    }
    if (window.TJ_NODE_ensureUniqueAutoSetNames && node.graph) window.TJ_NODE_ensureUniqueAutoSetNames(node.graph);
    if (enabled && node.properties?.auto_sets) {
        for (const [idx, nm] of Object.entries(node.properties.auto_sets)) {
            const out = node.outputs?.[parseInt(idx)];
            if (out && nm) {
                const display = `${nm} ▶`;
                out.name = display; out.label = display; out.localized_name = display;
            }
        }
    }
    if (window.TJ_NODE_scheduleWirelessRepair && node.graph) window.TJ_NODE_scheduleWirelessRepair(node.graph, 80);
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}
function installAutoSet(node) {
    const autoW = findWidget(node, "auto_set");
    const setW = findWidget(node, "setnode_name");
    if (autoW && !autoW._tj_auto_attached) {
        autoW._tj_auto_attached = true;
        const orig = autoW.callback;
        autoW.callback = function(v) { orig?.call(this, v); updateAutoSets(node); };
    }
    if (setW && !setW._tj_auto_name_attached) {
        setW._tj_auto_name_attached = true;
        const orig = setW.callback;
        setW.callback = function(v) { orig?.call(this, v); updateAutoSets(node); };
    }
    requestAnimationFrame(() => updateAutoSets(node));
}

function seedWidget(node) { return findWidget(node, "seed"); }
function seedControlWidget(node) { return findWidget(node, "control_after_generate"); }
function normalizeSeedControl(value) {
    const v = String(value || "fixed").toLowerCase();
    if (v.includes("random")) return "randomize";
    if (v.includes("decrement") || v.includes("decrease")) return "decrement";
    if (v.includes("increment") || v.includes("increase")) return "increment";
    return "fixed";
}
function applySeedControl(node, beforeValue = undefined) {
    if (!node || node.type !== NODE_TYPE || node._tj_seed_applying) return;
    const seedW = seedWidget(node);
    if (!seedW) return;
    const mode = normalizeSeedControl(seedControlWidget(node)?.value || "fixed");
    if (mode === "fixed") return;
    const current = Number(seedW.value ?? 0);
    const before = Number(beforeValue ?? current);
    if (beforeValue !== undefined && Number.isFinite(current) && Number.isFinite(before) && current !== before) return;
    let next = Number.isFinite(before) ? Math.floor(before) : 0;
    if (mode === "increment") next = Math.min(TJ_SEED_MAX_SAFE, next + 1);
    else if (mode === "decrement") next = Math.max(0, next - 1);
    else if (mode === "randomize") next = Math.floor(Math.random() * TJ_SEED_MAX_SAFE);
    node._tj_seed_applying = true;
    try {
        seedW.value = next;
        seedW.callback?.(next, node, seedW);
        node.widgets_values = node.widgets?.map(w => w.value);
    } finally { node._tj_seed_applying = false; }
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}
function installSeedQueueHook() {
    if (!app || typeof app.queuePrompt !== "function") return false;
    if (window.TJ_NODE_flux2_seed_hook_version === TJ_SEED_HOOK_VERSION) return true;
    const original = app.queuePrompt._tj_flux2_seed_original || app.queuePrompt.bind(app);
    const wrapped = function(...args) {
        const before = new Map();
        try { app.graph?._nodes?.forEach(node => { if (node?.type === NODE_TYPE) before.set(node.id, seedWidget(node)?.value); }); } catch (_) {}
        const result = original(...args);
        const applyAll = () => { try { app.graph?._nodes?.forEach(node => { if (node?.type === NODE_TYPE) applySeedControl(node, before.get(node.id)); }); } catch (_) {} };
        setTimeout(applyAll, 120);
        setTimeout(applyAll, 600);
        return result;
    };
    wrapped._tj_flux2_seed_original = original;
    app.queuePrompt = wrapped;
    window.TJ_NODE_flux2_seed_hook_version = TJ_SEED_HOOK_VERSION;
    return true;
}
function installSeedAfterGenerate(node) {
    if (node._tj_seed_after_generate_installed) return;
    node._tj_seed_after_generate_installed = true;
    if (!installSeedQueueHook()) setTimeout(installSeedQueueHook, 500);
    const orig = node.onExecuted;
    node.onExecuted = function(message) {
        const res = orig?.apply(this, arguments);
        setTimeout(() => applySeedControl(this), 120);
        return res;
    };
}

function activeLoraCount(node) {
    const value = Number(findWidget(node, "lora_slots")?.value ?? 0);
    return Math.max(0, Math.min(MAX_LORA_SLOTS, Number.isFinite(value) ? Math.round(value) : 0));
}
function setActiveLoraCount(node, count) {
    const w = findWidget(node, "lora_slots");
    if (w) w.value = Math.max(0, Math.min(MAX_LORA_SLOTS, count));
    updateLoraSlots(node);
}
function loraSlotWidgets(node, slot) {
    return [findWidget(node, `lora_${slot}_enable`), findWidget(node, `lora_${slot}_name`), findWidget(node, `lora_${slot}_strength`), node[`_tjRemoveLora${slot}`]];
}
function clearLoraSlot(node, slot) {
    const values = { enable: false, name: "None", strength: 1.0 };
    for (const [field, value] of Object.entries(values)) {
        const w = findWidget(node, `lora_${slot}_${field}`);
        if (w) { w.value = value; w.callback?.(value); }
    }
}
function copyLoraSlot(node, from, to) {
    for (const field of ["enable", "name", "strength"]) {
        const src = findWidget(node, `lora_${from}_${field}`);
        const dst = findWidget(node, `lora_${to}_${field}`);
        if (src && dst) { dst.value = src.value; dst.callback?.(dst.value); }
    }
}
function removeLoraSlot(node, slot) {
    const count = activeLoraCount(node);
    if (slot < 1 || slot > count) return;
    for (let k = slot; k < count; k++) copyLoraSlot(node, k + 1, k);
    clearLoraSlot(node, count);
    setActiveLoraCount(node, count - 1);
}
function isAdvanced(node) { return !!node.properties?.tj_flux2_advanced; }
function updateLoraSlots(node) {
    const advanced = isAdvanced(node);
    const count = activeLoraCount(node);
    for (let slot = 1; slot <= MAX_LORA_SLOTS; slot++) {
        const visible = advanced && slot <= count;
        for (const w of loraSlotWidgets(node, slot)) setWidgetVisible(node, w, visible);
    }
    setWidgetVisible(node, node._tjAddLoraBtn, advanced);
    if (node._tjAddLoraBtn) node._tjAddLoraBtn.name = count >= MAX_LORA_SLOTS ? "LoRA slots full" : "Add LoRA Slot";
}

function tjStyleFluxButtonWidget(widget, kind = "blue") {
    if (!widget) return;
    widget._tj_button_kind = kind;
    widget._tj_orig_draw = widget._tj_orig_draw || widget.draw;
    widget.draw = function(ctx, node, width, y, h) {
        const margin = 10;
        const x = margin;
        const w = Math.max(10, width - margin * 2);
        const r = 4;
        ctx.save();
        ctx.fillStyle = kind === "red" ? "#8c2626" : "#0055bb";
        ctx.strokeStyle = kind === "red" ? "#ff4757" : "#0044aa";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect?.(x, y + 2, w, Math.max(16, h - 4), r);
        if (!ctx.roundRect) ctx.rect(x, y + 2, w, Math.max(16, h - 4));
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = kind === "red" ? "#ffd5d5" : "#00efff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.name || "", width / 2, y + h / 2);
        ctx.restore();
    };
}
function installLoraButtons(node) {
    const loraSlotWidget = findWidget(node, "lora_slots");
    if (loraSlotWidget) setWidgetVisible(node, loraSlotWidget, false);
    if (node._tj_lora_buttons_installed) return;
    node._tj_lora_buttons_installed = true;
    for (let slot = 1; slot <= MAX_LORA_SLOTS; slot++) {
        const button = node.addWidget("button", `Remove LoRA ${slot}`, "remove", () => removeLoraSlot(node, slot), { serialize: false });
        node[`_tjRemoveLora${slot}`] = button;
        tjStyleFluxButtonWidget(button, "red");
        const widgets = node.widgets;
        const fromIndex = widgets.indexOf(button);
        if (fromIndex >= 0) widgets.splice(fromIndex, 1);
        const strength = findWidget(node, `lora_${slot}_strength`);
        const insertAt = strength ? widgets.indexOf(strength) + 1 : widgets.length;
        widgets.splice(insertAt, 0, button);
    }
    node._tjAddLoraBtn = node.addWidget("button", "Add LoRA Slot", "add", () => {
        if (activeLoraCount(node) < MAX_LORA_SLOTS) setActiveLoraCount(node, activeLoraCount(node) + 1);
    }, { serialize: false });
    tjStyleFluxButtonWidget(node._tjAddLoraBtn, "blue");
}

function applyAdvanced(node) {
    const advanced = isAdvanced(node);
    for (const name of ADVANCED_WIDGETS) setWidgetVisible(node, findWidget(node, name), advanced);
    setOverrideInputsVisible(node, advanced);
    refreshFluxGetSpecIndexes(node);
    if (node._tjAdvButton) node._tjAdvButton.name = advanced ? "Hide advanced settings" : "Show advanced settings";
    updateLoraSlots(node);
}

function roundToMultiple(value, divisor) {
    const d = Math.max(1, Math.round(divisor) || 1);
    return Math.max(d, Math.round(value / d) * d);
}
function resolutionFromMegapixels(ratioPreset, megapixels, divisibleBy) {
    const [rw, rh] = RATIO_PRESETS[ratioPreset] || RATIO_PRESETS["1:1"];
    const pixels = Math.max(0.01, Number(megapixels) || 0) * 1_000_000;
    const scale = Math.sqrt(pixels / (rw * rh));
    return [roundToMultiple(rw * scale, divisibleBy), roundToMultiple(rh * scale, divisibleBy)];
}
function makeReadoutWidget(name) {
    return {
        type: "tj_flux2_readout", name, value: "", options: { serialize: false }, serialize: false,
        draw(ctx, node, widgetWidth, widgetY, height) {
            ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "bold 10px sans-serif"; ctx.fillStyle = "#00efff";
            ctx.fillText(String(this.value || ""), widgetWidth * 0.5, widgetY + height * 0.5); ctx.restore();
        },
        computeSize(width) { return [width || 0, 22]; },
    };
}
function anyReferenceSelected(node) {
    return REF_SPECS.some(spec => {
        const w = findWidget(node, spec.widgetName);
        return w && w.value && w.value !== "(none)";
    });
}
function updateSizeReadout(node) {
    const readout = findWidget(node, "tj_flux2_size_readout");
    if (!readout) return;
    const mode = String(findWidget(node, "size_mode")?.value || "from setting");
    const ratio = String(findWidget(node, "ratio_preset")?.value || "1:1");
    const mp = Number(findWidget(node, "megapixels")?.value ?? 1);
    const div = Number(findWidget(node, "divisible_by")?.value ?? 32);
    const w = Number(findWidget(node, "width")?.value ?? 0);
    const h = Number(findWidget(node, "height")?.value ?? 0);
    const [rw, rh] = resolutionFromMegapixels(ratio, mp, div);
    if (mode === "manual") readout.value = w > 0 && h > 0 ? `Size: ${roundToMultiple(w, div)} x ${roundToMultiple(h, div)} (manual)` : `Size: ${rw} x ${rh} (manual fallback)`;
    else if (mode === "ratio + megapixels") readout.value = `Size: ${rw} x ${rh} (${ratio} @ ${mp.toFixed(2)}MP)`;
    else if (mode === "from reference") readout.value = anyReferenceSelected(node) ? "Size: follows first active reference" : `Size: ${rw} x ${rh} (T2I fallback)`;
    else readout.value = `Size: from setting → ref → ${rw} x ${rh}`;
    node.setDirtyCanvas?.(true, true);
}
function hookSizeReadout(node, name) {
    const w = findWidget(node, name);
    if (!w || w._tj_size_hooked) return;
    w._tj_size_hooked = true;
    const orig = w.callback;
    w.callback = function(v) { orig?.call(this, v); updateSizeReadout(node); };
}

function titleHeight() { return (typeof LiteGraph !== "undefined" && LiteGraph.NODE_TITLE_HEIGHT) || 30; }
function wrapText(ctx, text, maxWidth) {
    const lines = [];
    for (const paragraph of String(text).split("\n")) {
        let line = "";
        for (const word of paragraph.split(/\s+/)) {
            const test = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = word; }
            else line = test;
        }
        if (line) lines.push(line);
        else lines.push("");
    }
    return lines;
}
const INFO_TITLE = "Flux2 Klein 4B/9B (TJ)";
const INFO_TEXT = [
    "Model / CLIP guide:",
    "4B / 4B Base → use Qwen3 4B CLIP.",
    "9B / 9B Base → use Qwen3 8B CLIP.",
    "",
    "Base models: use higher steps. Distilled models: 4–8 steps is usually enough.",
    "",
    "KV Cache Mode:",
    "Turn ON only when using KV-cache Klein models. Turn OFF for normal Klein models.",
    "",
    "Reference slots:",
    "Each reference has its own get_name. (none) means that slot is ignored. All five none = T2I mode.",
    "",
    "Setting chain:",
    "Connect setting output to the next node. The incoming setting latent is applied as ReferenceLatent #0 before reference 1~5, while its size/model/CLIP/VAE are reused for the next pass.",
].join("\n");
function drawInfoBadge(node, ctx) {
    if (node.flags?.collapsed) { node._tjInfoRect = null; return; }
    const r = 8, cx = node.size[0] - 16, cy = -titleHeight() * 0.5;
    node._tjInfoRect = { cx, cy, r };
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = node._tjInfoHover ? ACCENT : "#6b7785"; ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("?", cx, cy + 0.5); ctx.restore();
    if (!node._tjInfoHover) return;
    ctx.save();
    const pad = 9, maxTextW = 330, lineH = 15, titleH = 18;
    ctx.font = "11px sans-serif";
    const lines = wrapText(ctx, INFO_TEXT, maxTextW);
    const boxW = maxTextW + pad * 2, boxH = pad + titleH + lines.length * lineH + pad;
    const bx = node.size[0] + 12, by = cy;
    ctx.fillStyle = "rgba(20, 20, 24, 0.97)"; ctx.strokeStyle = "#7612DA"; ctx.lineWidth = 1;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, 6); else ctx.rect(bx, by, boxW, boxH); ctx.fill(); ctx.stroke();
    let y = by + pad;
    ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillStyle = ACCENT; ctx.font = "bold 11px sans-serif"; ctx.fillText(INFO_TITLE, bx + pad, y); y += titleH;
    ctx.fillStyle = "#d4d4d4"; ctx.font = "11px sans-serif";
    lines.forEach((ln, i) => ctx.fillText(ln, bx + pad, y + i * lineH));
    ctx.restore();
}

function installPromptHeight(node, widgetName, prop, defaultH) {
    const w = findWidget(node, widgetName);
    if (!w || w._tj_resize_attached) return;
    w._tj_resize_attached = true;
    if (!node.properties) node.properties = {};
    if (!node.properties[prop]) node.properties[prop] = defaultH;
    w.computeSize = function(width) { return [width, node.properties[prop]]; };
}

function hideFluxWidget(node, name, hidden) {
    const w = findWidget(node, name);
    if (!w) return;
    if (!w._tj_flux_toggle_saved) w._tj_flux_toggle_saved = { type: w.type, computeSize: w.computeSize };
    w.type = hidden ? "hidden" : w._tj_flux_toggle_saved.type;
    w.computeSize = hidden ? () => [0, -4] : w._tj_flux_toggle_saved.computeSize;
    w.disabled = hidden;
    w.hidden = hidden;
    node.setDirtyCanvas?.(true, true);
}

function installFluxPromptToggle(node, widgetName, propName, title) {
    const target = findWidget(node, widgetName);
    if (!target || node[`_${propName}_toggle_added`]) return;
    node[`_${propName}_toggle_added`] = true;
    if (!node.properties) node.properties = {};
    if (node.properties[propName] === undefined) node.properties[propName] = true;

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;width:100%;max-width:100%;height:22px;box-sizing:border-box;padding:1px 2px;";
    const btn = document.createElement("button");
    btn.style.cssText = "width:100%;max-width:100%;height:20px;background:#151515;color:#00efff;border:1px solid #333;border-radius:3px;cursor:pointer;font-size:10px;font-weight:bold;text-align:left;padding:0 6px;box-sizing:border-box;";
    row.appendChild(btn);

    const refresh = () => {
        btn.textContent = `${node.properties[propName] ? "▼" : "▶"} ${title}`;
        hideFluxWidget(node, widgetName, !node.properties[propName]);
    };
    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        node.properties[propName] = !node.properties[propName];
        refresh();
        scheduleFitNodeHeight(node);
        app.canvas?.setDirty(true, true);
    };

    const toggle = node.addDOMWidget(`${widgetName}_toggle`, "btn", row, { serialize: false, hideOnZoom: false });
    toggle.computeSize = function(width) { return [width || 0, 24]; };
    const tIdx = node.widgets.indexOf(toggle);
    const nIdx = node.widgets.findIndex(w => w.name === widgetName);
    if (tIdx >= 0 && nIdx >= 0 && tIdx > nIdx) {
        node.widgets.splice(tIdx, 1);
        node.widgets.splice(nIdx, 0, toggle);
    }
    refresh();
}

function moveWidgetAfter(node, widgetName, afterName) {
    const widgets = node.widgets || [];
    const idx = widgets.findIndex(w => w.name === widgetName);
    const after = widgets.findIndex(w => w.name === afterName);
    if (idx >= 0 && after >= 0 && idx !== after + 1) {
        const [w] = widgets.splice(idx, 1);
        const freshAfter = widgets.findIndex(x => x.name === afterName);
        widgets.splice(freshAfter + 1, 0, w);
    }
}

function moveFluxManualSizeUnderSizeMode(node) {
    moveWidgetAfter(node, "width", "divisible_by");
    moveWidgetAfter(node, "height", "width");
}

function moveFluxSizeReadoutBelowAdvanced(node) {
    const readout = findWidget(node, "tj_flux2_size_readout");
    const adv = node._tjAdvButton;
    if (!readout || !adv || !node.widgets) return;
    const rIdx = node.widgets.indexOf(readout);
    const aIdx = node.widgets.indexOf(adv);
    if (rIdx >= 0 && aIdx >= 0 && rIdx !== aIdx + 1) {
        node.widgets.splice(rIdx, 1);
        const freshAIdx = node.widgets.indexOf(adv);
        node.widgets.splice(freshAIdx + 1, 0, readout);
    }
}

function reorderWidgets(node) {
    const topOrder = ["model_name", "clip_name", "vae_name", "kv_cache_mode", "positive_toggle", "positive", "negative_toggle", "negative", "auto_set", "setnode_name"];
    for (let i = topOrder.length - 1; i >= 0; i--) {
        const idx = node.widgets?.findIndex(w => w.name === topOrder[i]);
        if (idx > 0) {
            const [w] = node.widgets.splice(idx, 1);
            node.widgets.unshift(w);
        }
    }
    const detailOrder = [
        "size_mode", "ratio_preset", "megapixels", "divisible_by", "width", "height",
        "steps", "cfg", "batch_size", "sampler_name", "denoise", "seed", "control_after_generate",
        "get_name_reference_1", "get_name_reference_2", "get_name_reference_3", "get_name_reference_4", "get_name_reference_5",
    ];
    let anchor = node.widgets?.findIndex(w => w.name === "setnode_name") ?? -1;
    if (!node.widgets || anchor < 0) return;
    for (const name of detailOrder) {
        const idx = node.widgets.findIndex(w => w.name === name);
        if (idx < 0) continue;
        const [w] = node.widgets.splice(idx, 1);
        if (idx < anchor) anchor -= 1;
        node.widgets.splice(anchor + 1, 0, w);
        anchor += 1;
    }
}


function applyStartupCompactSize(node, force = false) {
    if (!node || node.flags?.collapsed) return;
    const defaultW = 460;
    const defaultH = 470;
    const hasUserSize = !!node.properties?.tj_flux2_user_resized;
    if (force || !hasUserSize || Number(node.size?.[1] || 0) > 760) {
        node._tj_applying_startup_size = true;
        node.size[0] = Math.max(defaultW, Number(node.size?.[0] || 0));
        node.size[1] = defaultH;
        node.setDirtyCanvas?.(true, true);
        app.canvas?.setDirty(true, true);
        setTimeout(() => { node._tj_applying_startup_size = false; }, 80);
    }
}

function scheduleStartupCompactSize(node) {
    node._tj_startup_compact_until = Date.now() + 1200;
    for (const delay of [0, 50, 180, 420, 900]) {
        setTimeout(() => applyStartupCompactSize(node, true), delay);
    }
}

function fitNodeHeightToWidgets(node) {
    if (!node || node.flags?.collapsed || !node.size) return;
    try {
        const computed = node.computeSize ? node.computeSize() : null;
        if (!computed || !Number.isFinite(computed[1])) return;
        const targetH = Math.max(260, Math.ceil(computed[1] + 8));
        const currentH = Number(node.size[1] || targetH);
        // Only trim excessive bottom whitespace; never reset the user's width or enlarge aggressively.
        if (Math.abs(currentH - targetH) > 12) {
            node._tj_applying_startup_size = true;
            node.setSize?.([node.size[0], targetH]);
            setTimeout(() => { node._tj_applying_startup_size = false; }, 80);
        }
    } catch (_) {}
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

function scheduleFitNodeHeight(node) {
    for (const delay of [0, 60, 180]) setTimeout(() => fitNodeHeightToWidgets(node), delay);
}

function installNode(node) {
    node.properties = node.properties || {};
    if (node.properties.tj_flux2_advanced === undefined) node.properties.tj_flux2_advanced = true;
    applyTheme(node);
    attachSetSync(node);
    setOverrideInputsVisible(node, isAdvanced(node));
    attachAllReferenceGets(node);
    refreshFluxGetSpecIndexes(node);
    node._tj_multi_get_specs = node._tj_flux_get_specs;
    node._tjSyncMultiGetReceiver = () => syncAllReferenceGets(node);
    node._tjClearMultiGetSlot = (spec) => clearReferenceGetSlot(node, spec);
    installAutoSet(node);
    installSeedAfterGenerate(node);
    installLoraButtons(node);
    reorderWidgets(node);

    if (!findWidget(node, "tj_flux2_size_readout")) {
        const readout = makeReadoutWidget("tj_flux2_size_readout");
        if (node.addCustomWidget) node.addCustomWidget(readout); else (node.widgets = node.widgets || []).push(readout);
    }
    for (const name of ["size_mode", "ratio_preset", "megapixels", "divisible_by", "width", "height"]) hookSizeReadout(node, name);

    if (!node._tjAdvButton) {
        node._tjAdvButton = node.addWidget("button", "Show advanced settings", "advanced", () => {
            node.properties = node.properties || {};
            node.properties.tj_flux2_advanced = !isAdvanced(node);
            applyAdvanced(node);
            moveFluxSizeReadoutBelowAdvanced(node);
            scheduleFitNodeHeight(node);
        }, { serialize: false });
    }

    installPromptHeight(node, "positive", "tj_flux2_positive_h", 120);
    installPromptHeight(node, "negative", "tj_flux2_negative_h", 120);
    installFluxPromptToggle(node, "positive", "tj_flux2_positive_open", "Positive prompt");
    installFluxPromptToggle(node, "negative", "tj_flux2_negative_open", "Negative prompt");
    reorderWidgets(node);
    moveFluxManualSizeUnderSizeMode(node);
    moveFluxSizeReadoutBelowAdvanced(node);
    applyAdvanced(node);
    updateAutoSets(node);
    moveFluxSizeReadoutBelowAdvanced(node);
    updateSizeReadout(node);
    tjApplyOutputArrowState(node, tjAutosetEnabled(node));
    requestAnimationFrame(() => scheduleFitNodeHeight(node));
}

app.registerExtension({
    name: "TJ.Flux2Klein",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const origOnResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function(size) {
            this.properties = this.properties || {};
            if (!this._tj_applying_startup_size && !(this._tj_startup_compact_until && Date.now() < this._tj_startup_compact_until)) {
                this.properties.tj_flux2_user_resized = true;
            }
            return origOnResize?.apply(this, arguments);
        };

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            origOnNodeCreated?.apply(this, arguments);
            installNode(this);
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            origOnConfigure?.apply(this, arguments);
            requestAnimationFrame(() => installNode(this));
            setTimeout(() => {
                attachAllReferenceGets(this);
                syncAllReferenceGets(this);
                updateAutoSets(this);
                updateSizeReadout(this);
                scheduleFitNodeHeight(this);
            }, 300);
        };

        const origOnConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function(type, index, connected) {
            const result = origOnConnectionsChange?.apply(this, arguments);
            // Slot-specific survival: never use first-slot fallback, only repair the changed embedded GET slot.
            if (type === LiteGraph.INPUT) {
                refreshFluxGetSpecIndexes(this);
                const spec = this._tj_flux_get_specs?.find(s => s.inputIndex === index);
                if (spec) {
                    const w = findWidget(this, spec.widgetName);
                    const input = this.inputs?.[index];
                    const link = input?.link != null ? graphLink(this.graph, input.link) : null;
                    const physicalConnected = connected && link && !isWireless(this.graph, input.link);
                    if (physicalConnected && !this._tj_connecting_wireless) {
                        // A real cable has priority over embedded GET. Keep the cable,
                        // reset only this slot's get_name widget to (none), and do not
                        // auto-repair a fake-wire over it.
                        if (w) {
                            w.value = "(none)";
                            w._tj_previous_value = "(none)";
                        }
                        input.label = "";
                        input.name = spec.inputName;
                        input._tj_flux_input_name = spec.inputName;
                    } else if (!connected && !this._tj_connecting_wireless && w?.value && w.value !== "(none)") {
                        this[`_tjConnect_${spec.widgetName}`]?.(w.value);
                        if (window.TJ_NODE_scheduleWirelessRepair) window.TJ_NODE_scheduleWirelessRepair(this.graph, 80);
                    }
                    updateSizeReadout(this);
                }
            }
            return result;
        };

        const origOnDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            origOnDrawForeground?.apply(this, arguments);
            try { drawInfoBadge(this, ctx); } catch (_) {}
        };

        const origOnMouseMove = nodeType.prototype.onMouseMove;
        const origOnMouseDown = nodeType.prototype.onMouseDown;
        nodeType.prototype.onMouseDown = function(event,pos){ const rect=this._tjInfoRect; if(rect&&Array.isArray(pos)){ const dx=pos[0]-rect.cx,dy=pos[1]-rect.cy; if(dx*dx+dy*dy<=(rect.r+4)*(rect.r+4)){ this._tjInfoHover=!this._tjInfoHover; this.setDirtyCanvas?.(true,true); return true; }} return origOnMouseDown?.apply(this,arguments);};
        nodeType.prototype.onMouseMove = function(event, pos) {
            const rect = this._tjInfoRect;
            let hover = false;
            if (rect && Array.isArray(pos)) {
                const dx = pos[0] - rect.cx, dy = pos[1] - rect.cy;
                hover = dx * dx + dy * dy <= (rect.r + 4) * (rect.r + 4);
            }
            
            return origOnMouseMove?.apply(this, arguments);
        };
    },
});
