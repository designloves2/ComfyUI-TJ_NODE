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

const TJ_SEED_TARGET_NODE_TYPES = new Set(["TJ_ZImageTurbo", "TJ_ImageToPrompt", "TJ_PromptEnhancer", "TJ_PromptStudio"]);
const TJ_SEED_MAX_SAFE = 0x1fffffffffffff;
const TJ_SEED_HOOK_VERSION = "TJ_SEED_V2_30_ZIMG_PREVIEW_NATIVE_RESTORE";
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

function tjClearZImagePreviewBeforeQueue() {
    // Preview pipeline restored to ComfyUI native behavior.
    // Intentionally do nothing: do not clear node.imgs/node.images or local caches.
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
        tjClearZImagePreviewBeforeQueue();
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

function getProviderValues(graph, allowedTypes = null, ownerNode = null) {
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
        const values = getProviderValues(node.graph, [defaultType], node);
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


function tjOutputBaseName(name) { return String(name || "").replace(/^▶\s*/, "").replace(/\s*▶$/, ""); }

const Z_OUTPUT_BASE_NAMES = ["image", "latent", "width", "height", "model", "model_clean", "clip", "vae", "positive", "negative"];
function tjEnsureOriginalOutputNames(node) {
    if (!node?.outputs) return;
    node.outputs.forEach((out, idx) => {
        if (!out) return;
        if (out._tj_z_original_output_name === undefined) {
            const fallback = Z_OUTPUT_BASE_NAMES[idx] || tjOutputBaseName(out.name || out.label || `output_${idx + 1}`);
            const raw = tjOutputBaseName(out.name || out.label || fallback);
            out._tj_z_original_output_name = raw.includes("/") ? fallback : (raw || fallback);
        }
    });
}
function tjRestoreOriginalOutputNames(node) {
    if (!node?.outputs) return;
    let changed = false;
    tjEnsureOriginalOutputNames(node);
    node.outputs.forEach((out, idx) => {
        if (!out) return;
        const base = out._tj_z_original_output_name || Z_OUTPUT_BASE_NAMES[idx] || `output_${idx + 1}`;
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
        const base = out._tj_z_original_output_name || Z_OUTPUT_BASE_NAMES[idx] || tjOutputBaseName(out.name || out.label || `output_${idx + 1}`);
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
        tjRestoreOriginalOutputNames(node);
    } else {
        tjEnsureOriginalOutputNames(node);
        const base = String(setW?.value || prefix || node.title || node.type || "Z-Image").trim();
        const autoSets = {};
        (node.outputs || []).forEach((out, idx) => {
            const nm = (out?._tj_z_original_output_name || Z_OUTPUT_BASE_NAMES[idx] || `OUT_${idx + 1}`).trim();
            if (!nm || nm === "status") return;
            // Match Flux2 Klein Auto Set display: every output slot is namespaced by setnode_name.
            autoSets[idx] = base ? `${base}/${nm}` : nm;
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
function zAutoSetDisplayNeedsRefresh(node) {
    if (!tjAutosetEnabled(node)) return false;
    const setW = node.widgets?.find(w => w.name === "setnode_name" || w.name === "set_name");
    const base = String(setW?.value || node.title || node.type || "Z-Image").trim();
    const autoSets = node.properties?.auto_sets || {};
    for (const [idx, out] of (node.outputs || []).entries()) {
        if (!out) continue;
        const original = (out._tj_z_original_output_name || Z_OUTPUT_BASE_NAMES[idx] || `OUT_${idx + 1}`).trim();
        if (!original || original === "status") continue;
        const expectedRaw = autoSets[idx] || autoSets[String(idx)] || (base ? `${base}/${original}` : original);
        const expected = `${expectedRaw} ▶`;
        if (out.name !== expected || out.label !== expected || out.localized_name !== expected) return true;
    }
    return false;
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
const TJ_Z_ADVANCED_WIDGETS = ["sampler_name", "scheduler", "denoise", "aura_shift", "divisible_by"];
const TJ_Z_OVERRIDE_INPUT_SPECS = [
    ["model_override", "MODEL"],
    ["clip_override", "CLIP"],
    ["vae_override", "VAE"],
    ["positive_override", "CONDITIONING"],
    ["negative_override", "CONDITIONING"],
    ["latent_override", "LATENT"],
];

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

function zEnsureZitControlInput(node) {
    const idx = node.inputs ? node.inputs.findIndex(i => i.name === "zit_control") : -1;
    if (idx < 0) node.addInput("zit_control", "ZIT_CONTROL");
}

const TJ_Z_ADVANCED_OUTPUTS = new Set(["model", "model_clean", "clip", "vae", "positive", "negative"]);
function zSetAdvancedOutputsVisible(node, visible) {
    if (!node?.outputs) return;
    tjEnsureOriginalOutputNames(node);
    if (!node._tj_z_hidden_outputs) node._tj_z_hidden_outputs = {};

    if (visible) {
        const saved = Object.entries(node._tj_z_hidden_outputs)
            .map(([idx, out]) => [Number(idx), out])
            .sort((a, b) => a[0] - b[0]);
        for (const [idx, out] of saved) {
            if (!out) continue;
            const base = out._tj_z_original_output_name || Z_OUTPUT_BASE_NAMES[idx] || tjOutputBaseName(out.name || out.label || "");
            const exists = node.outputs.some(o => {
                const oBase = o?._tj_z_original_output_name || tjOutputBaseName(o?.name || o?.label || "");
                return oBase === base;
            });
            if (!exists) node.outputs.splice(Math.min(idx, node.outputs.length), 0, out);
        }
        node._tj_z_hidden_outputs = {};
        return;
    }

    for (let idx = node.outputs.length - 1; idx >= 0; idx--) {
        const out = node.outputs[idx];
        if (!out) continue;
        const base = out._tj_z_original_output_name || Z_OUTPUT_BASE_NAMES[idx] || tjOutputBaseName(out.name || out.label || "");
        if (!TJ_Z_ADVANCED_OUTPUTS.has(base)) continue;
        if (Array.isArray(out.links) && out.links.length > 0) continue;
        node._tj_z_hidden_outputs[idx] = out;
        node.outputs.splice(idx, 1);
    }
}

function zUpdateAdvanced(node) {
    if (!node.properties) node.properties = {};
    const advanced = !!node.properties.tj_z_advanced;
    const count = zActiveSlotCount(node);

    for (const name of TJ_Z_ADVANCED_WIDGETS) zSetWidgetVisible(node, zFindWidget(node, name), advanced);
    zSetOverrideInputsVisible(node, advanced);
    zEnsureZitControlInput(node);
    zSetAdvancedOutputsVisible(node, advanced);

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
        "setnode_name",
        "ratio_preset",
        "megapixels",
        "width",
        "height",
        "steps",
        "cfg",
        "batch_size",
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
        zScheduleFitNodeHeight(node);
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
        zScheduleFitNodeHeight(node);
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

function zFitNodeHeightToWidgets(node) {
    if (!node || !node.size || node.flags?.collapsed) return;
    try {
        const width = Math.max(240, Number(node.size[0] || 350));
        let total = 36;
        for (const w of (node.widgets || [])) {
            if (!w) continue;
            let h = 24;
            try {
                const computed = w.computeSize ? w.computeSize(width) : null;
                if (computed && Number.isFinite(Number(computed[1]))) h = Number(computed[1]);
            } catch (_) {}
            if (h > 0) total += h + 4;
        }
        // Native preview area is not touched. Only trim / expand the UI control area height.
        const targetH = Math.max(520, Math.min(980, Math.round(total + 18)));
        const currentH = Number(node.size[1] || 0);
        if (Math.abs(currentH - targetH) > 12) {
            node._tj_z_internal_resize = true;
            try { node.setSize?.([width, targetH]); }
            finally { setTimeout(() => { node._tj_z_internal_resize = false; }, 80); }
        }
    } catch (_) {}
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

function zScheduleFitNodeHeight(node) {
    for (const delay of [0, 60, 180]) setTimeout(() => zFitNodeHeightToWidgets(node), delay);
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

    // Native preview restore:
    // Do not override computeSize/onDrawBackground/onExecuted for preview refs.
    // Z-Image Turbo live latent preview is left fully to ComfyUI's default pipeline.
    const origOnResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function(size) {
        if (origOnResize) origOnResize.apply(this, arguments);
        if (!this.properties) this.properties = {};
        if (!this._tj_z_internal_resize) this.properties.tj_z_user_resized = true;
        zSyncDomWidgetWidths(this);
    };

    nodeType.prototype._tj_z_update_preview_visibility = function() {
        zSyncDomWidgetWidths(this);
        this.setDirtyCanvas?.(true, true);
        app.canvas?.setDirty(true, true);
    };
}





function zApplyPreviewOffStartupCompact(node) {
    // Native preview restore: do not touch preview refs.
    // Startup-only compact height for a new empty node.
    // Do not clear node.imgs/node.images and do not interfere with live latent preview.
    if (!node || !node.size) return;
    if (!node.properties) node.properties = {};
    if (node.properties.tj_z_startup_compact_applied) {
        node._tj_z_update_preview_visibility?.();
        return;
    }

    const w = Math.max(240, Number(node.size[0] || 350));
    const h = 640;

    node._tj_z_internal_resize = true;
    try { node.setSize?.([w, h]); }
    finally { requestAnimationFrame(() => { node._tj_z_internal_resize = false; }); }

    node.properties.tj_z_startup_compact_applied = true;
    node._tj_z_update_preview_visibility?.();
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



const TJ_Z_INFO_ACCENT = "#B78CFF";
const TJ_Z_INFO_TITLE = "Z-Image Turbo (TJ)";
const TJ_Z_INFO_TEXT = [
    "Modes:",
    "T2I: no image / no latent_override.",
    "I2I: connect image or select get_name.",
    "Latent edit: connect latent_override. Latent wins over image.",
    "ControlNet: connect ZIT ControlNet (TJ) to zit_control in Advanced.",
    "Overrides: positive/negative/model/clip/vae/latent/control inputs are under Show advanced settings.",
    "model_clean output is before LoRA / shift / ControlNet for safer second-pass editing."
].join(" ");

function tjZTitleHeight() {
    return (typeof LiteGraph !== "undefined" && LiteGraph.NODE_TITLE_HEIGHT) || 30;
}

function tjZWrapText(ctx, text, maxWidth) {
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

function tjZDrawInfoBadge(node, ctx, title = TJ_Z_INFO_TITLE, text = TJ_Z_INFO_TEXT) {
    if (node.flags && node.flags.collapsed) {
        node._tjZInfoRect = null;
        return;
    }
    const r = 7;
    const cx = node.size[0] - 15;
    const cy = -tjZTitleHeight() * 0.5;
    node._tjZInfoRect = { cx, cy, r };

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = node._tjZInfoHover ? TJ_Z_INFO_ACCENT : "#6b7785";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", cx, cy + 0.5);
    ctx.restore();

    if (!node._tjZInfoHover) return;

    ctx.save();
    const pad = 9;
    const maxTextW = 310;
    const lineH = 15;
    const titleH = 17;
    const lines = tjZWrapText(ctx, text, maxTextW);
    const boxW = maxTextW + pad * 2;
    const boxH = pad + titleH + lines.length * lineH + pad;
    const bx = node.size[0] + 12;
    const by = cy;

    ctx.fillStyle = "rgba(20, 26, 32, 0.96)";
    ctx.strokeStyle = "#7612DA";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, 6);
    else ctx.rect(bx, by, boxW, boxH);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let y = by + pad;
    ctx.fillStyle = TJ_Z_INFO_ACCENT;
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(title, bx + pad, y);
    y += titleH;
    ctx.fillStyle = "#cfd6de";
    ctx.font = "11px sans-serif";
    lines.forEach((ln, i) => ctx.fillText(ln, bx + pad, y + i * lineH));
    ctx.restore();
}

function tjZInstallInfoHover(nodeType) {
    if (nodeType.prototype._tj_z_info_hover_installed) return;
    nodeType.prototype._tj_z_info_hover_installed = true;
    const origOnMouseMove = nodeType.prototype.onMouseMove;
    const origOnMouseDown = nodeType.prototype.onMouseDown;
    nodeType.prototype.onMouseDown = function(event,pos){ const rect=this._tjZInfoRect; if(rect&&Array.isArray(pos)){ const dx=pos[0]-rect.cx,dy=pos[1]-rect.cy; if(dx*dx+dy*dy<=(rect.r+4)*(rect.r+4)){ this._tjZInfoHover=!this._tjZInfoHover; this.setDirtyCanvas?.(true,true); app.canvas?.setDirty(true,true); return true; }} return origOnMouseDown?.apply(this,arguments);};
    nodeType.prototype.onMouseMove = function(event, pos) {
        const rect = this._tjZInfoRect;
        let hover = false;
        if (rect && Array.isArray(pos)) {
            const dx = pos[0] - rect.cx;
            const dy = pos[1] - rect.cy;
            hover = dx * dx + dy * dy <= (rect.r + 4) * (rect.r + 4);
        }
        
        return origOnMouseMove?.apply(this, arguments);
    };
}

app.registerExtension({
    name: "TJ.ZImageTurbo",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "TJ_ZImageTurbo") return;
        zInstallCenterFitPreview(nodeType);
        tjZInstallInfoHover(nodeType);

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
            window.TJ_NODE_applyTheme(this);
            attachSetSync(this);
            zRemoveLegacyGlobalPromptInput(this);
            attachEmbeddedGet(this, { inputName: "image", defaultType: "IMAGE" });
            installAutoSet(this);
            zEnsureZitControlInput(this);
            zInstallSeedAfterGenerate(this);
            tjApplyOutputArrowState(this, tjAutosetEnabled(this));

            // auto_set / setnode_name above ratio_preset
            moveWidgetBefore(this, "auto_set", "ratio_preset");
            moveWidgetBefore(this, "setnode_name", "ratio_preset");

            zReorderCoreWidgets(this);
            zInstallOriginalButtons(this);
            zInstallSizeInfo(this);
            zRemovePreviewToggleWidgetIfExists(this);
            zMoveSizeInfoToBottom(this);

            setWidgetHeight(this, "positive", "tj_z_positive_h", 120);
            setWidgetHeight(this, "negative", "tj_z_negative_h", 120);
            zInstallPromptToggle(this, "positive", "tj_positive_open", "Positive prompt");
            zInstallPromptToggle(this, "negative", "tj_negative_open", "Negative prompt");

            requestAnimationFrame(() => {
                updateAutoSets(this);
                zSyncDomWidgetWidths(this);
                zScheduleFitNodeHeight(this);
                requestAnimationFrame(() => zApplyPreviewOffStartupCompact(this));
            });
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            requestAnimationFrame(() => {
                window.TJ_NODE_applyTheme(this);
                attachSetSync(this);
                zRemoveLegacyGlobalPromptInput(this);
            attachEmbeddedGet(this, { inputName: "image", defaultType: "IMAGE" });
                installAutoSet(this);
                zEnsureZitControlInput(this);
                zInstallSeedAfterGenerate(this);
                zInstallOriginalButtons(this);
                setWidgetHeight(this, "positive", "tj_z_positive_h", 120);
                setWidgetHeight(this, "negative", "tj_z_negative_h", 120);
                zInstallPromptToggle(this, "positive", "tj_positive_open", "Positive prompt");
                zInstallPromptToggle(this, "negative", "tj_negative_open", "Negative prompt");
                zReorderCoreWidgets(this);
                zInstallSizeInfo(this);
                    zMoveSizeInfoToBottom(this);
                this._tj_z_refresh_size_info?.();
                zUpdateAdvanced(this);
                zMoveSizeInfoToBottom(this);
                updateAutoSets(this);
                zSyncDomWidgetWidths(this);
                zScheduleFitNodeHeight(this);
            });
        };

        const origOnDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            this._tjUpdateGetOptions?.();
            if (zAutoSetDisplayNeedsRefresh(this)) updateAutoSets(this);
            zSyncDomWidgetWidths(this);
            this._tj_z_preview_top = Math.max(0, (this.widgets?.length || 0) * 24 + 30);
            const res = origOnDrawForeground ? origOnDrawForeground.apply(this, arguments) : undefined;
            try { tjZDrawInfoBadge(this, ctx); } catch (_) {}
            return res;
        };
    }
});
