// -----------------------------------------------------------------------------
// TJ_NODE adapted version
//
// Original concept / source credit:
// - Original author: 너무바쁜베짱이
// - GitHub: https://github.com/nicekriss/toobusy
// - YouTube: https://www.youtube.com/@%EB%84%88%EB%AC%B4%EB%B0%94%EC%81%9C%EB%B2%A0%EC%A7%B1%EC%9D%B4
//
// This TJ_NODE version keeps the original workflow concept while adding
// TJ_NODE-specific embedded GET/SET workflow features, TJ_NODE styling,
// and TJ_NODE integration behavior.
// -----------------------------------------------------------------------------

import { app } from "../../scripts/app.js";

function applyTJTheme(node) {
    if (window.TJ_NODE_applyTheme) return window.TJ_NODE_applyTheme(node);
    node.bgcolor = "#000000";
    node.color = "#7612DA";
    node.title_text_color = "#FFFFFF";
}



const TJ_SEED_TARGET_NODE_TYPES = new Set(["TJ_ZImageTurbo", "TJ_ImageToPrompt", "TJ_PromptEnhancer", "TJ_PromptStudio"]);
const TJ_SEED_MAX_SAFE = 0x1fffffffffffff;
const TJ_SEED_HOOK_VERSION = "TJ_SEED_V2_27";
function tjSeedWidget(node) { return node?.widgets?.find(w => w.name === "seed"); }
function tjSeedControlWidget(node) { return node?.widgets?.find(w => w.name === "control_after_generate"); }
function tjNormalizeSeedControl(value) {
    const v = String(value || "fixed").toLowerCase();
    if (v.includes("random")) return "randomize";
    if (v.includes("decrement") || v.includes("decrease")) return "decrement";
    if (v.includes("increment") || v.includes("increase")) return "increment";
    return "fixed";
}
function tjSeedControlMode(node) {
    const ctrlW = tjSeedControlWidget(node);
    if (ctrlW) return tjNormalizeSeedControl(ctrlW.value);
    const seedW = tjSeedWidget(node);
    const opts = seedW?.options || {};
    return tjNormalizeSeedControl(
        opts.control_after_generate ??
        opts.controlAfterGenerate ??
        seedW?.control_after_generate ??
        node?.properties?.control_after_generate ??
        node?.properties?.seed_control_after_generate ??
        "fixed"
    );
}
function tjApplySeedControl(node, beforeValue = undefined) {
    if (!node || !TJ_SEED_TARGET_NODE_TYPES.has(node.type) || node._tj_seed_applying) return;
    const seedW = tjSeedWidget(node);
    if (!seedW) return;
    const mode = tjSeedControlMode(node);
    if (mode === "fixed") return;

    const current = Number(seedW.value ?? 0);
    const before = Number(beforeValue ?? current);
    // If ComfyUI's native control_after_generate already changed the seed, do not double-apply.
    if (beforeValue !== undefined && Number.isFinite(current) && Number.isFinite(before) && current !== before) return;

    let next = Number.isFinite(before) ? Math.floor(before) : 0;
    if (mode === "increment") next = Math.min(TJ_SEED_MAX_SAFE, next + 1);
    else if (mode === "decrement") next = Math.max(0, next - 1);
    else if (mode === "randomize") next = Math.floor(Math.random() * TJ_SEED_MAX_SAFE);

    node._tj_seed_applying = true;
    try {
        seedW.value = next;
        try { seedW.callback?.(next, node, seedW); } catch (_) {}
        node.widgets_values = node.widgets?.map(w => w.value);
    } finally {
        node._tj_seed_applying = false;
    }
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}
function tjInstallSeedQueueHook() {
    if (!app || typeof app.queuePrompt !== "function") return false;
    if (window.TJ_NODE_seed_queue_hook_version === TJ_SEED_HOOK_VERSION) return true;
    const original = app.queuePrompt._tj_seed_original || app.queuePrompt.bind(app);
    const wrapped = function(...args) {
        const before = new Map();
        try {
            app.graph?._nodes?.forEach(node => {
                if (TJ_SEED_TARGET_NODE_TYPES.has(node?.type)) {
                    const v = tjSeedWidget(node)?.value;
                    before.set(node.id, v);
                    node._tj_seed_before_queue = v;
                }
            });
        } catch (_) {}
        const result = original(...args);
        const applyAll = () => {
            try {
                app.graph?._nodes?.forEach(node => {
                    if (TJ_SEED_TARGET_NODE_TYPES.has(node?.type)) tjApplySeedControl(node, before.get(node.id));
                });
            } catch (err) {
                console.warn("[TJ_NODE] seed control_after_generate queue hook skipped", err);
            }
        };
        setTimeout(applyAll, 120);
        setTimeout(applyAll, 600);
        return result;
    };
    wrapped._tj_seed_original = original;
    app.queuePrompt = wrapped;
    window.TJ_NODE_seed_queue_hook_version = TJ_SEED_HOOK_VERSION;
    return true;
}
function tjEnsureSeedQueueHook() {
    if (tjInstallSeedQueueHook()) return;
    setTimeout(() => tjInstallSeedQueueHook(), 500);
    setTimeout(() => tjInstallSeedQueueHook(), 1500);
}
function installSeedAfterGenerate(node) {
    if (!node || node._tj_seed_after_generate_installed) return;
    node._tj_seed_after_generate_installed = true;
    tjEnsureSeedQueueHook();
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function(message) {
        const res = origOnExecuted?.apply(this, arguments);
        const before = this._tj_seed_before_queue;
        setTimeout(() => tjApplySeedControl(this, before), 0);
        setTimeout(() => tjApplySeedControl(this, before), 120);
        return res;
    };
}


function attachSetSync(node) {
    if (window.TJ_NODE_attachProviderNameSync) return window.TJ_NODE_attachProviderNameSync(node);
}

function getProviderValues(graph) {
    if (window.TJ_NODE_getAllSetNames) return window.TJ_NODE_getAllSetNames(graph);
    return ["(none)"];
}

function isSeparator(value) {
    return !!(value && window.TJ_NODE_PROVIDER_SEPARATOR && value === window.TJ_NODE_PROVIDER_SEPARATOR);
}

function labelName(graph, value) {
    if (window.TJ_NODE_getProviderLabelName) return window.TJ_NODE_getProviderLabelName(graph, value);
    return value && value !== "(none)" ? String(value) : "";
}

function findSource(graph, value) {
    if (window.TJ_NODE_findSetterSourceInfo) return window.TJ_NODE_findSetterSourceInfo(graph, value);
    return null;
}

function graphLink(graph, linkId) {
    if (!graph || linkId == null) return null;
    return graph.links?.[linkId] || graph.links?.get?.(linkId) || null;
}

function isWireless(graph, linkId) {
    const link = graphLink(graph, linkId);
    return !!(link && (link._tj_wireless || link._tj_provider_value));
}

function removeLink(graph, linkId) {
    if (!graph || linkId == null) return;
    try { graph.removeLink(linkId); } catch (_) {}
}

function attachEmbeddedGet(node, opts = {}) {
    const widgetName = opts.widgetName || "get_name";
    const requestedInputName = opts.inputName || null;
    const foundIndex = requestedInputName
        ? node.inputs?.findIndex(i => (i?.widget?.name || i?.name) === requestedInputName)
        : -1;

    // Safety rule: embedded GET must bind by slot name.
    // Do not fall back to inputIndex 0. Z-Image Turbo embedded GET is image-slot only.
    if (requestedInputName && foundIndex < 0) {
        console.warn(`[TJ_NODE Z-Image Turbo] embedded get target input not found: ${requestedInputName}`);
        return;
    }

    const inputIndex = foundIndex >= 0 ? foundIndex : (opts.inputIndex ?? 0);
    const inputName = requestedInputName || node.inputs?.[inputIndex]?.name || "input";
    const defaultType = opts.defaultType || node.inputs?.[inputIndex]?.type || "*";
    const getW = node.widgets?.find(w => w.name === widgetName);
    if (!getW || !node.inputs?.[inputIndex] || getW._tj_get_attached) return;

    getW._tj_get_attached = true;

    const refreshProviderValues = () => {
        const values = getProviderValues(node.graph);
        const next = Array.isArray(values) ? [...values] : ["(none)"];

        // Restore-race protection:
        // During workflow load / screen refresh, provider scan can be late.
        // Never drop the saved dynamic get_name just because it is not in the list yet.
        if (getW.value && getW.value !== "(none)" && !next.includes(getW.value)) {
            next.push(getW.value);
        }
        getW.options = { ...(getW.options || {}), values: next };
        return next;
    };

    const removeWirelessInputOnly = (target) => {
        const input = target.inputs?.[inputIndex];
        if (!target.graph || !input || input.link == null) return;
        const link = graphLink(target.graph, input.link);
        if (link && isWireless(target.graph, input.link)) {
            target._tj_connecting_wireless = true;
            try { removeLink(target.graph, input.link); }
            finally { target._tj_connecting_wireless = false; }
            input.link = null;
        }
    };

    node._tjUpdateGetReceiverOptions = function() {
        const w = this.widgets?.find(x => x.name === widgetName);
        if (!w) return;
        refreshProviderValues();
        const label = labelName(this.graph, w.value);
        if (this.inputs?.[inputIndex]) this.inputs[inputIndex].label = label ? `◀ ${label}` : "";
    };

    node._tjConnectGetReceiver = function(value) {
        if (!this.graph || !this.inputs?.[inputIndex]) return;
        const w = this.widgets?.find(x => x.name === widgetName);
        if (isSeparator(value)) {
            if (w) w.value = w._tj_previous_value || w.value || "(none)";
            return;
        }

        const selected = value || "(none)";
        if (w && w.value !== selected) w.value = selected;
        if (w) w._tj_previous_value = selected;

        const input = this.inputs[inputIndex];
        input.name = inputName;

        if (!selected || selected === "(none)") {
            // User explicitly selected none: disconnect the previous GET link from the image slot.
            if (input.link != null) {
                this._tj_connecting_wireless = true;
                try { removeLink(this.graph, input.link); }
                finally { this._tj_connecting_wireless = false; }
                input.link = null;
            }
            input.label = "";
            input.type = defaultType;
            app.canvas?.setDirty(true, true);
            return;
        }

        const provider = window.TJ_NODE_findProviderByValue
            ? window.TJ_NODE_findProviderByValue(this.graph, selected)
            : null;

        // Critical survival rule:
        // If provider lookup fails during graph refresh / node deletion / late scan,
        // keep get_name and the label. Do NOT reset to (none), and do NOT remove
        // the existing wireless link. Core repair will reconnect once providers settle.
        if (!provider) {
            input.label = `◀ ${labelName(this.graph, selected)}`;
            app.canvas?.setDirty(true, true);
            return;
        }

        const normalized = provider.displayName || selected;
        if (w && w.value !== normalized) w.value = normalized;
        if (w) w._tj_previous_value = normalized;

        if (window.TJ_NODE_forceReconnectConsumer) {
            window.TJ_NODE_forceReconnectConsumer(this, normalized, inputIndex);
        } else {
            const sourceInfo = findSource(this.graph, normalized);
            if (sourceInfo?.node && sourceInfo.slot != null && sourceInfo.node.outputs?.[sourceInfo.slot]) {
                removeWirelessInputOnly(this);
                this._tj_connecting_wireless = true;
                try {
                    sourceInfo.node.connect(sourceInfo.slot, this, inputIndex);
                    if (window.TJ_NODE_markWirelessLink) window.TJ_NODE_markWirelessLink(this.graph, this, inputIndex, normalized);
                } finally {
                    this._tj_connecting_wireless = false;
                }
            }
        }

        const sourceInfo = findSource(this.graph, normalized);
        const t = sourceInfo?.node?.outputs?.[sourceInfo.slot]?.type || defaultType || "*";
        input.name = inputName;
        input.type = t;
        input.label = `◀ ${provider.labelName || labelName(this.graph, normalized)}`;
        app.canvas?.setDirty(true, true);
    };

    // Backward-compatible aliases used by older local code.
    node._tjUpdateGetOptions = node._tjUpdateGetReceiverOptions;
    node._tjConnectGet = node._tjConnectGetReceiver;

    const origCb = getW.callback;
    getW.callback = function(v) {
        if (origCb) origCb.call(this, v);
        if (isSeparator(v)) {
            getW.value = getW._tj_previous_value || "(none)";
            return;
        }
        getW._tj_previous_value = v;
        node._tjConnectGetReceiver?.(v);
    };

    const origConn = node.onConnectionsChange;
    node.onConnectionsChange = function(type, index, connected) {
        if (origConn) origConn.apply(this, arguments);
        if (type === LiteGraph.INPUT && index === inputIndex) {
            if (!connected && !this._tj_connecting_wireless) {
                const w = this.widgets?.find(x => x.name === widgetName);
                const selected = w?.value;
                const provider = selected && selected !== "(none)" && window.TJ_NODE_findProviderByValue
                    ? window.TJ_NODE_findProviderByValue(this.graph, selected)
                    : null;
                if (provider) {
                    this.inputs[inputIndex].label = `◀ ${provider.labelName || labelName(this.graph, selected)}`;
                    if (window.TJ_NODE_scheduleWirelessRepair) window.TJ_NODE_scheduleWirelessRepair(this.graph, 80);
                }
                // No provider found can be a temporary scan gap. Never force (none) here.
            }
            app.canvas?.setDirty(true, true);
        }
    };

    requestAnimationFrame(() => {
        refreshProviderValues();
        node._tjUpdateGetReceiverOptions?.();
        node._tjConnectGetReceiver?.(getW.value);
    });
    setTimeout(() => {
        refreshProviderValues();
        node._tjUpdateGetReceiverOptions?.();
        node._tjConnectGetReceiver?.(getW.value);
    }, 140);
    setTimeout(() => {
        refreshProviderValues();
        node._tjUpdateGetReceiverOptions?.();
        if (getW.value && getW.value !== "(none)") node._tjConnectGetReceiver?.(getW.value);
    }, 500);
}


function tjStripAutoSetArrow(name) {
    return String(name || "").replace(/^▶\s*/, "").replace(/\s*▶$/, "");
}

function tjApplyAutoSetOutputArrows(node, enabled) {
    // Backward-compatible alias used by updateAutoSets.
    tjApplyOutputArrowState(node, enabled);
}


function tjOutputBaseName(name) {
    return String(name || "").replace(/^▶\s*/, "").replace(/\s*▶$/, "");
}

function tjApplyOutputArrowState(node, enabled) {
    if (!node?.outputs) return;
    let changed = false;

    for (const out of node.outputs) {
        if (!out) continue;

        // ComfyUI/LiteGraph builds may draw output text from name, label, or localized_name.
        // Keep all three in sync so Auto Set state is visually reliable.
        const raw = out._tj_output_base_name || out._tj_base_name || out.name || out.label || out.localized_name || "";
        const base = tjOutputBaseName(raw);
        const display = enabled ? `${base} ▶` : base;

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

function tjAutosetEnabled(node) {
    const autoW = node.widgets?.find(w => w.name === "auto_set");
    return !!autoW?.value;
}

function updateAutoSets(node, prefix = "") {
    if (!node) return;
    if (!node.properties) node.properties = {};
    const autoW = node.widgets?.find(w => w.name === "auto_set");
    const setW = node.widgets?.find(w => w.name === "setnode_name" || w.name === "set_name");
    const enabled = !!autoW?.value;
    tjApplyOutputArrowState(node, enabled);
    if (!enabled) {
        node.properties.auto_sets = {};
    } else {
        const base = String(setW?.value || prefix || node.title || node.type || "TJ").trim();
        const autoSets = {};
        (node.outputs || []).forEach((out, idx) => {
            if (!out) return;
            const nm = tjOutputBaseName(out.name || `OUT_${idx + 1}`).trim();
            if (nm && nm !== "status") autoSets[idx] = base ? `${base}/${nm}` : nm;
        });
        node.properties.auto_sets = autoSets;
    }
    if (window.TJ_NODE_scheduleWirelessRepair && node.graph) window.TJ_NODE_scheduleWirelessRepair(node.graph, 80);
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

function installAutoSet(node) {
    const autoW = node.widgets?.find(w => w.name === "auto_set");
    const setW = node.widgets?.find(w => w.name === "setnode_name" || w.name === "set_name");
    if (autoW && !autoW._tj_auto_attached) {
        autoW._tj_auto_attached = true;
        const orig = autoW.callback;
        autoW.callback = function(v) {
            if (orig) orig.call(this, v);
            tjApplyOutputArrowState(node, !!v);
            updateAutoSets(node);
        };
    }
    if (setW && !setW._tj_auto_name_attached) {
        setW._tj_auto_name_attached = true;
        const orig = setW.callback;
        setW.callback = function(v) { if (orig) orig.call(this, v); updateAutoSets(node); };
    }
    requestAnimationFrame(() => {
        updateAutoSets(node);
        tjApplyOutputArrowState(node, tjAutosetEnabled(node));
        zSyncDomWidgetWidths(node);
    });
}

function moveWidgetBefore(node, widgetName, beforeName) {
    const widgets = node.widgets || [];
    const idx = widgets.findIndex(w => w.name === widgetName);
    const before = widgets.findIndex(w => w.name === beforeName);
    if (idx >= 0 && before >= 0 && idx > before) {
        const [w] = widgets.splice(idx, 1);
        widgets.splice(before, 0, w);
    }
}

function moveWidgetAfter(node, widgetName, afterName) {
    const widgets = node.widgets || [];
    const idx = widgets.findIndex(w => w.name === widgetName);
    const after = widgets.findIndex(w => w.name === afterName);
    if (idx >= 0 && after >= 0 && idx < after) {
        const [w] = widgets.splice(idx, 1);
        widgets.splice(after + 1, 0, w);
    }
}

function hideWidget(node, name, hidden = true) {
    const w = node.widgets?.find(x => x.name === name);
    if (!w) return;
    if (!w._tj_orig_type) {
        w._tj_orig_type = w.type;
        w._tj_orig_compute = w.computeSize;
    }
    w.type = hidden ? "hidden" : w._tj_orig_type;
    w.computeSize = hidden ? () => [0, -4] : w._tj_orig_compute;
    w.disabled = hidden;
    w.hidden = hidden;
    node.setDirtyCanvas?.(true, true);
}

function setWidgetHeight(node, name, prop, defaultH = 120) {
    const w = node.widgets?.find(x => x.name === name);
    if (!w || w._tj_resize_attached) return;
    w._tj_resize_attached = true;
    if (!node.properties) node.properties = {};
    if (!node.properties[prop]) node.properties[prop] = defaultH;
    w.computeSize = function(width) { return [width || zWidgetInnerWidth(node), Math.max(40, Number(node.properties[prop] || defaultH))]; };
}


const TJ_Z_MAX_LORA_SLOTS = 5;
const TJ_Z_ADVANCED_WIDGETS = ["cfg", "sampler_name", "scheduler", "denoise", "aura_shift", "divisible_by"];
const TJ_Z_OVERRIDE_INPUT_SPECS = [["model_override", "MODEL"], ["clip_override", "CLIP"], ["vae_override", "VAE"]];

function zFindWidget(node, name) { return node.widgets?.find(w => w.name === name); }

function zWidgetInnerWidth(node, fallback = 300) {
    const w = Number(node?.size?.[0] || fallback);
    return Math.max(120, w - 20);
}

function zSyncDomWidgetWidths(node) {
    const inner = zWidgetInnerWidth(node);
    for (const key of ["_tj_positive_toggle_row", "_tj_negative_toggle_row", "_tj_z_size_info_row"]) {
        const el = node?.[key];
        if (el?.style) {
            el.style.width = `${inner}px`;
            el.style.maxWidth = `${inner}px`;
            el.style.boxSizing = "border-box";
        }
    }
}


function zSetWidgetVisible(node, widget, visible) {
    if (!widget) return;
    if (!widget._tj_saved) {
        widget._tj_saved = { type: widget.type, computeSize: widget.computeSize };
    }
    widget.type = visible ? widget._tj_saved.type : "hidden";
    widget.computeSize = visible ? widget._tj_saved.computeSize : () => [0, -4];
    widget.disabled = !visible;
    widget.hidden = !visible;
}

function zLoraWidgets(node, slot) {
    return [
        zFindWidget(node, `lora_${slot}_enable`),
        zFindWidget(node, `lora_${slot}_name`),
        zFindWidget(node, `lora_${slot}_strength`),
        node[`_tjRemoveLora${slot}`],
    ].filter(Boolean);
}

function zActiveSlotCount(node) {
    const w = zFindWidget(node, "lora_slots");
    const v = Number(w?.value ?? 0);
    return Math.max(0, Math.min(TJ_Z_MAX_LORA_SLOTS, Number.isFinite(v) ? Math.round(v) : 0));
}

function zSetActiveSlotCount(node, count) {
    const clamped = Math.max(0, Math.min(TJ_Z_MAX_LORA_SLOTS, count));
    const w = zFindWidget(node, "lora_slots");
    if (w) w.value = clamped;
    zUpdateAdvanced(node);
}

function zClearLoraSlot(node, slot) {
    const en = zFindWidget(node, `lora_${slot}_enable`);
    const name = zFindWidget(node, `lora_${slot}_name`);
    const str = zFindWidget(node, `lora_${slot}_strength`);
    if (en) en.value = false;
    if (name) name.value = "None";
    if (str) str.value = 1.0;
}

function zRemoveLoraSlot(node, slot) {
    const count = zActiveSlotCount(node);
    if (slot < 1 || slot > count) return;
    for (let i = slot; i < count; i++) {
        const nextEn = zFindWidget(node, `lora_${i + 1}_enable`);
        const nextName = zFindWidget(node, `lora_${i + 1}_name`);
        const nextStr = zFindWidget(node, `lora_${i + 1}_strength`);
        const en = zFindWidget(node, `lora_${i}_enable`);
        const name = zFindWidget(node, `lora_${i}_name`);
        const str = zFindWidget(node, `lora_${i}_strength`);
        if (en && nextEn) en.value = nextEn.value;
        if (name && nextName) name.value = nextName.value;
        if (str && nextStr) str.value = nextStr.value;
    }
    zClearLoraSlot(node, count);
    zSetActiveSlotCount(node, count - 1);
}

function zSetOverrideInputsVisible(node, visible) {
    for (const [name, type] of TJ_Z_OVERRIDE_INPUT_SPECS) {
        const idx = node.inputs ? node.inputs.findIndex(i => i.name === name) : -1;
        const exists = idx >= 0;
        if (visible) {
            if (!exists) node.addInput(name, type);
        } else if (exists && node.inputs[idx].link == null) {
            node.removeInput(idx);
        }
    }
}

function zUpdateAdvanced(node) {
    if (!node.properties) node.properties = {};
    const advanced = !!node.properties.tj_z_advanced;
    const count = zActiveSlotCount(node);

    for (const name of TJ_Z_ADVANCED_WIDGETS) zSetWidgetVisible(node, zFindWidget(node, name), advanced);
    zSetOverrideInputsVisible(node, advanced);

    const loraSlotsW = zFindWidget(node, "lora_slots");
    zSetWidgetVisible(node, loraSlotsW, false);

    for (let slot = 1; slot <= TJ_Z_MAX_LORA_SLOTS; slot++) {
        const visible = advanced && slot <= count;
        for (const widget of zLoraWidgets(node, slot)) zSetWidgetVisible(node, widget, visible);
    }

    zSetWidgetVisible(node, node._tjAddLoraBtn, advanced);
    if (node._tjAddLoraBtn) node._tjAddLoraBtn.name = count >= TJ_Z_MAX_LORA_SLOTS ? "LoRA slots full" : "Add LoRA Slot";
    if (node._tjAdvButton) node._tjAdvButton.name = advanced ? "Hide advanced settings" : "Show advanced settings";
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}


function tjStyleZButtonWidget(widget, kind = "blue") {
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


function zReorderCoreWidgets(node) {
    const order = [
        "auto_set",
        "ratio_preset",
        "megapixels",
        "steps",
        "width",
        "height",
        "batch_size",
        "cfg",
        "sampler_name",
        "scheduler",
        "denoise",
        "aura_shift",
        "divisible_by",
    ];
    const widgets = node.widgets || [];
    let insert = 0;
    // keep model/clip/vae and prompt widgets before ratio area; reorder only starting at auto_set.
    const firstIdx = widgets.findIndex(w => w.name === "auto_set");
    insert = firstIdx >= 0 ? firstIdx : 0;
    for (const name of order) {
        const idx = widgets.findIndex(w => w.name === name);
        if (idx >= 0) {
            const [w] = widgets.splice(idx, 1);
            widgets.splice(insert, 0, w);
            insert++;
        }
    }
}

function zInstallOriginalButtons(node) {
    if (node._tj_z_original_buttons_installed) return;
    node._tj_z_original_buttons_installed = true;
    if (!node.properties) node.properties = {};
    if (node.properties.tj_z_advanced === undefined) node.properties.tj_z_advanced = false;

    const slotWidget = zFindWidget(node, "lora_slots");
    if (slotWidget) {
        const cb = slotWidget.callback;
        slotWidget.callback = function(...args) { cb?.apply(this, args); zUpdateAdvanced(node); };
    }

    for (let slot = 1; slot <= TJ_Z_MAX_LORA_SLOTS; slot++) {
        const button = node.addWidget("button", `Remove LoRA ${slot}`, "remove", () => zRemoveLoraSlot(node, slot), { serialize: false });
        node[`_tjRemoveLora${slot}`] = button;
        tjStyleZButtonWidget(button, "red");
        const widgets = node.widgets;
        const fromIndex = widgets.indexOf(button);
        if (fromIndex >= 0) widgets.splice(fromIndex, 1);
        const strength = zFindWidget(node, `lora_${slot}_strength`);
        const insertAt = strength ? widgets.indexOf(strength) + 1 : widgets.length;
        widgets.splice(insertAt, 0, button);
    }

    node._tjAddLoraBtn = node.addWidget("button", "Add LoRA Slot", "add", () => {
        if (zActiveSlotCount(node) >= TJ_Z_MAX_LORA_SLOTS) return;
        zSetActiveSlotCount(node, zActiveSlotCount(node) + 1);
    }, { serialize: false });

    tjStyleZButtonWidget(node._tjAddLoraBtn, "blue");

    node._tjAdvButton = node.addWidget("button", "Show advanced settings", "advanced", () => {
        node.properties.tj_z_advanced = !node.properties.tj_z_advanced;
        zUpdateAdvanced(node);
    }, { serialize: false });

    zUpdateAdvanced(node);
}


function zInstallPromptToggle(node, widgetName, propName, title, beforeWidgetName = null) {
    const target = node.widgets?.find(w => w.name === widgetName);
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
        hideWidget(node, widgetName, !node.properties[propName]);
    };
    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        node.properties[propName] = !node.properties[propName];
        refresh();
        node.setDirtyCanvas?.(true, true);
        app.canvas?.setDirty(true, true);
    };

    const toggle = node.addDOMWidget(`${widgetName}_toggle`, "btn", row, { serialize: false, hideOnZoom: false });
    if (widgetName === "positive") node._tj_positive_toggle_row = row;
    if (widgetName === "negative") node._tj_negative_toggle_row = row;
    toggle.computeSize = function(width) {
        zSyncDomWidgetWidths(node);
        return [width || zWidgetInnerWidth(node), 24];
    };
    const tIdx = node.widgets.indexOf(toggle);
    const nIdx = node.widgets.findIndex(w => w.name === (beforeWidgetName || widgetName));
    if (tIdx >= 0 && nIdx >= 0 && tIdx > nIdx) {
        node.widgets.splice(tIdx, 1);
        node.widgets.splice(nIdx, 0, toggle);
    }
    refresh();
}


function zCalcResolutionInfo(node) {
    const get = (name) => node.widgets?.find(w => w.name === name)?.value;
    const width = Number(get("width") || 0);
    const height = Number(get("height") || 0);
    if (width > 0 && height > 0) {
        return `${Math.round(width)} x ${Math.round(height)} (custom size)`;
    }
    const preset = String(get("ratio_preset") || "1:1");
    const mp = Number(get("megapixels") || 1.0);
    const div = Number(get("divisible_by") || 32);
    const map = {
        "1:1":[1,1],"16:9":[16,9],"9:16":[9,16],"4:3":[4,3],"3:4":[3,4],
        "3:2":[3,2],"2:3":[2,3],"21:9":[21,9],"9:21":[9,21],
    };
    const [rw, rh] = map[preset] || [1,1];
    const pixels = Math.max(0.01, mp) * 1000000;
    const scale = Math.sqrt(pixels / (rw * rh));
    const roundTo = (v) => Math.max(div, Math.round(v / div) * div);
    const w = roundTo(rw * scale);
    const h = roundTo(rh * scale);
    return `${w} x ${h} (${preset} : ${mp.toFixed(2)} MP)`;
}


function zMoveSizeInfoToBottom(node) {
    const dom = node.widgets?.find(w => w.name === "tj_z_size_info");
    if (!dom) return;
    const idx = node.widgets.indexOf(dom);
    const advIdx = node._tjAdvButton ? node.widgets.indexOf(node._tjAdvButton) : -1;
    if (idx >= 0 && advIdx >= 0 && idx !== advIdx + 1) {
        node.widgets.splice(idx, 1);
        const freshAdvIdx = node.widgets.indexOf(node._tjAdvButton);
        node.widgets.splice(freshAdvIdx + 1, 0, dom);
    } else if (idx >= 0 && advIdx < 0 && idx !== node.widgets.length - 1) {
        node.widgets.splice(idx, 1);
        node.widgets.push(dom);
    }
}

function zInstallSizeInfo(node) {
    if (node._tj_z_size_info_installed) return;
    node._tj_z_size_info_installed = true;
    const row = document.createElement("div");
    row.style.cssText = "width:100%;max-width:100%;height:20px;box-sizing:border-box;padding:2px 4px;color:#00efff;font:bold 10px sans-serif;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;";
    const dom = node.addDOMWidget("tj_z_size_info", "div", row, { serialize:false, hideOnZoom:false });
    dom.computeSize = function(width) {
        zSyncDomWidgetWidths(node);
        return [width || zWidgetInnerWidth(node), 22];
    };
    node._tj_z_size_info_row = row;

    const idx = node.widgets.indexOf(dom);
    const advIdx = node._tjAdvButton ? node.widgets.indexOf(node._tjAdvButton) : -1;
    if (idx >= 0 && advIdx >= 0) {
        node.widgets.splice(idx, 1);
        const freshAdvIdx = node.widgets.indexOf(node._tjAdvButton);
        node.widgets.splice(freshAdvIdx + 1, 0, dom);
    } else if (idx >= 0) {
        node.widgets.splice(idx, 1);
        node.widgets.push(dom);
    }

    const refresh = () => {
        row.textContent = zCalcResolutionInfo(node);
        node.setDirtyCanvas?.(true, true);
        app.canvas?.setDirty(true, true);
    };
    node._tj_z_refresh_size_info = refresh;
    for (const name of ["ratio_preset", "megapixels", "divisible_by", "width", "height"]) {
        const w = node.widgets?.find(x => x.name === name);
        if (w && !w._tj_size_info_attached) {
            w._tj_size_info_attached = true;
            const cb = w.callback;
            w.callback = function(v) { cb?.call(this, v); refresh(); };
        }
    }
    refresh();
}





function zInstallCenterFitPreview(nodeType) {
    if (nodeType.prototype._tj_z_preview_toggle_installed) return;
    nodeType.prototype._tj_z_preview_toggle_installed = true;

    // TJ_NODE PATCH V2.24
    // Safe preview ON/OFF gate.
    //
    // ON  : keep ComfyUI's original/default preview behavior.
    // OFF : hide this node's default preview by clearing node.imgs/node.images
    //       and keep the node compact.
    //
    // This does NOT replace the default preview pipeline.
    // It only gates visibility, so live latent preview remains safe when ON.
    const zPreviewEnabled = (node) => !!node?.properties?.tj_z_preview_enabled;

    const zCapturePreviewRefs = (node) => {
        if (!node) return;
        if (node.imgs && node.imgs.length) node._tj_z_saved_imgs = node.imgs;
        if (node.images && node.images.length) node._tj_z_saved_images = node.images;
    };

    const zClearPreviewRefs = (node) => {
        if (!node) return;
        zCapturePreviewRefs(node);
        node.imgs = [];
        node.images = [];
    };

    const zRestorePreviewRefs = (node) => {
        if (!node) return;
        if ((!node.imgs || !node.imgs.length) && node._tj_z_saved_imgs?.length) node.imgs = node._tj_z_saved_imgs;
        if ((!node.images || !node.images.length) && node._tj_z_saved_images?.length) node.images = node._tj_z_saved_images;
    };

    const zApplyCompactNoPreviewSize = (node) => {
        if (!node || zPreviewEnabled(node)) return;
        if (!node.size) return;

        const oldImgs = node.imgs;
        const oldImages = node.images;
        node.imgs = [];
        node.images = [];

        let compactH = 360;
        try {
            const computed = node.computeSize ? node.computeSize() : null;
            if (computed && Number.isFinite(computed[1])) compactH = Math.max(280, Math.ceil(computed[1] + 8));
        } catch (_) {}

        node.imgs = oldImgs && oldImgs.length ? oldImgs : [];
        node.images = oldImages && oldImages.length ? oldImages : [];

        const w = Math.max(240, Number(node.size[0] || 300));
        const h = Math.min(Math.max(280, compactH), 560);

        node._tj_z_internal_resize = true;
        try { node.setSize?.([w, h]); }
        finally { requestAnimationFrame(() => { node._tj_z_internal_resize = false; }); }
    };

    const zUpdatePreviewVisibility = (node, compact = false) => {
        if (!node) return;
        if (!node.properties) node.properties = {};
        if (node.properties.tj_z_preview_enabled === undefined) node.properties.tj_z_preview_enabled = false;

        if (zPreviewEnabled(node)) {
            zRestorePreviewRefs(node);
        } else {
            zClearPreviewRefs(node);
            if (compact) zApplyCompactNoPreviewSize(node);
        }

        zSyncDomWidgetWidths(node);
        node.setDirtyCanvas?.(true, true);
        app.canvas?.setDirty(true, true);
    };

    const origComputeSize = nodeType.prototype.computeSize;
    nodeType.prototype.computeSize = function(...args) {
        if (zPreviewEnabled(this)) {
            zRestorePreviewRefs(this);
            return origComputeSize
                ? origComputeSize.apply(this, args)
                : LiteGraph.LGraphNode.prototype.computeSize.apply(this, args);
        }

        // OFF: prevent default preview from contributing to computed height.
        zClearPreviewRefs(this);
        return origComputeSize
            ? origComputeSize.apply(this, args)
            : LiteGraph.LGraphNode.prototype.computeSize.apply(this, args);
    };

    const origOnExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function(message) {
        if (origOnExecuted) origOnExecuted.apply(this, arguments);

        // If OFF, immediately hide live/default preview after each update.
        // If ON, leave ComfyUI default preview untouched.
        zUpdatePreviewVisibility(this, !zPreviewEnabled(this));
    };

    const origOnResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function(size) {
        if (origOnResize) origOnResize.apply(this, arguments);
        if (!this.properties) this.properties = {};
        if (!this._tj_z_internal_resize) this.properties.tj_z_user_resized = true;
        zSyncDomWidgetWidths(this);
    };

    const origOnDrawBackground = nodeType.prototype.onDrawBackground;
    nodeType.prototype.onDrawBackground = function(ctx) {
        if (!zPreviewEnabled(this)) {
            zClearPreviewRefs(this);
            return; // draw nothing below widgets when preview is OFF
        }
        zRestorePreviewRefs(this);
        if (origOnDrawBackground) return origOnDrawBackground.apply(this, arguments);
    };

    // Expose small helpers for the per-node preview widget installer.
    nodeType.prototype._tj_z_update_preview_visibility = function(compact = false) {
        zUpdatePreviewVisibility(this, compact);
    };
}





function zApplyPreviewOffStartupCompact(node) {
    if (!node || !node.size) return;
    if (!node.properties) node.properties = {};

    // The removed preview toggle used to start as OFF.
    // Keep that startup behavior without showing the widget:
    // - compact initial size
    // - no saved preview toggle widget
    // - do not permanently disable ComfyUI's forced/live preview after execution
    if (node.properties.tj_z_startup_compact_applied) return;

    const oldImgs = node.imgs;
    const oldImages = node.images;

    // Compute compact size as if preview were OFF.
    node.imgs = [];
    node.images = [];

    let compactH = 360;
    try {
        const computed = node.computeSize ? node.computeSize() : null;
        if (computed && Number.isFinite(computed[1])) {
            compactH = Math.max(280, Math.ceil(computed[1] + 8));
        }
    } catch (_) {}

    // Restore refs so ComfyUI preview can still appear naturally after run.
    node.imgs = oldImgs;
    node.images = oldImages;

    const w = Math.max(240, Number(node.size[0] || 300));
    const h = Math.min(Math.max(280, compactH), 560);

    node._tj_z_internal_resize = true;
    try {
        node.setSize?.([w, h]);
    } finally {
        requestAnimationFrame(() => { node._tj_z_internal_resize = false; });
    }

    node.properties.tj_z_startup_compact_applied = true;
}

function zRemovePreviewToggleWidgetIfExists(node) {
    if (!node?.widgets) return;
    for (let i = node.widgets.length - 1; i >= 0; i--) {
        const w = node.widgets[i];
        if (!w) continue;
        const name = String(w.name || "");
        if (name === "preview" || name === "preview  ON" || name === "preview  OFF") {
            node.widgets.splice(i, 1);
        }
    }
}

function zRemoveLegacyGlobalPromptInput(node) {
    if (!node?.inputs) return;
    for (let i = node.inputs.length - 1; i >= 0; i--) {
        const input = node.inputs[i];
        const name = input?.widget?.name || input?.name || "";
        if (name === "global_prompt_input") {
            if (input.link != null && node.graph) {
                try { node.graph.removeLink(input.link); } catch (_) {}
            }
            try { node.removeInput(i); } catch (_) { node.inputs.splice(i, 1); }
        }
    }
}

function zInstallSeedAfterGenerate(node) { installSeedAfterGenerate(node); }


app.registerExtension({
    name: "TJ.ZImageTurbo",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "TJ_ZImageTurbo") return;
        zInstallCenterFitPreview(nodeType);

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
            applyTJTheme(this);
            attachSetSync(this);
            zRemoveLegacyGlobalPromptInput(this);
            attachEmbeddedGet(this, { inputName: "image", defaultType: "IMAGE" });
            installAutoSet(this);
            zInstallSeedAfterGenerate(this);
            tjApplyOutputArrowState(this, tjAutosetEnabled(this));

            // auto_set above ratio_preset
            moveWidgetBefore(this, "auto_set", "ratio_preset");

            zReorderCoreWidgets(this);
            zInstallOriginalButtons(this);
            zInstallSizeInfo(this);
            zRemovePreviewToggleWidgetIfExists(this);
            zMoveSizeInfoToBottom(this);
            requestAnimationFrame(() => zApplyPreviewOffStartupCompact(this));

            setWidgetHeight(this, "positive", "tj_z_positive_h", 120);
            setWidgetHeight(this, "negative", "tj_z_negative_h", 90);
            zInstallPromptToggle(this, "positive", "tj_positive_open", "Positive prompt");
            zInstallPromptToggle(this, "negative", "tj_negative_open", "Negative prompt");

            requestAnimationFrame(() => {
                updateAutoSets(this);
                tjApplyOutputArrowState(this, tjAutosetEnabled(this));
                zSyncDomWidgetWidths(this);
            });
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            requestAnimationFrame(() => {
                applyTJTheme(this);
                attachSetSync(this);
                zRemoveLegacyGlobalPromptInput(this);
            attachEmbeddedGet(this, { inputName: "image", defaultType: "IMAGE" });
                installAutoSet(this);
                zInstallSeedAfterGenerate(this);
                zInstallOriginalButtons(this);
                setWidgetHeight(this, "positive", "tj_z_positive_h", 120);
                setWidgetHeight(this, "negative", "tj_z_negative_h", 90);
                zInstallPromptToggle(this, "positive", "tj_positive_open", "Positive prompt");
                zInstallPromptToggle(this, "negative", "tj_negative_open", "Negative prompt");
                zReorderCoreWidgets(this);
                zInstallSizeInfo(this);
                    zMoveSizeInfoToBottom(this);
                this._tj_z_refresh_size_info?.();
                zUpdateAdvanced(this);
                zMoveSizeInfoToBottom(this);
                updateAutoSets(this);
                tjApplyOutputArrowState(this, tjAutosetEnabled(this));
                zSyncDomWidgetWidths(this);
            });
        };

        const origOnDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            this._tjUpdateGetOptions?.();
            tjApplyOutputArrowState(this, tjAutosetEnabled(this));
            zSyncDomWidgetWidths(this);
            this._tj_z_preview_top = Math.max(0, (this.widgets?.length || 0) * 24 + 30);
            if (origOnDrawForeground) return origOnDrawForeground.apply(this, arguments);
        };
    }
});
