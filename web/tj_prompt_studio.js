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

function getWidget(node, name) { return node.widgets?.find(w => w.name === name); }
function getInputSlot(node, name) { return node?.inputs?.find(i => (i?.widget?.name || i?.name) === name) || null; }
function isInputConnected(node, name) { const input = getInputSlot(node, name); return !!(input && input.link != null); }
function graphLink(graph, linkId) { if (!graph || linkId == null) return null; return graph.links?.[linkId] || graph.links?.get?.(linkId) || null; }
function isWireless(graph, linkId) { const link = graphLink(graph, linkId); return !!(link && (link._tj_wireless || link._tj_provider_value)); }
function removeLink(graph, linkId) { if (!graph || linkId == null) return; try { graph.removeLink(linkId); } catch (_) {} }
function providerValues(graph) { if (window.TJ_NODE_getAllSetNames) return window.TJ_NODE_getAllSetNames(graph); return ["(none)"]; }
function isSeparator(value) { return !!(value && window.TJ_NODE_PROVIDER_SEPARATOR && value === window.TJ_NODE_PROVIDER_SEPARATOR); }
function providerLabel(graph, value) { if (window.TJ_NODE_getProviderLabelName) return window.TJ_NODE_getProviderLabelName(graph, value); return value && value !== "(none)" ? String(value).replace(/^TJ\s*\/\s*/, "") : ""; }
function findSource(graph, value) { if (window.TJ_NODE_findSetterSourceInfo) return window.TJ_NODE_findSetterSourceInfo(graph, value); return null; }
function setWidgetValueSilent(widget, value) { if (widget && widget.value !== value) widget.value = value; }
function innerWidth(node, fallback = 420) { return Math.max(120, Number(node?.size?.[0] || fallback) - 20); }

function moveWidgetToTop(node, name, index = 0) {
    if (!node?.widgets) return;
    const idx = node.widgets.findIndex(w => w?.name === name);
    if (idx < 0 || idx === index) return;
    const [w] = node.widgets.splice(idx, 1);
    node.widgets.splice(Math.max(0, Math.min(index, node.widgets.length)), 0, w);
}

function setWidgetVisible(widget, visible) {
    if (!widget) return;
    if (!widget._tj_studio_saved) widget._tj_studio_saved = { type: widget.type, computeSize: widget.computeSize };
    widget.type = visible ? widget._tj_studio_saved.type : "hidden";
    widget.computeSize = visible ? widget._tj_studio_saved.computeSize : () => [0, -4];
    widget.disabled = !visible;
    widget.hidden = !visible;
}


function removeLegacyHiddenGetNameProxy(node) {
    if (!node?.widgets) return;
    for (let i = node.widgets.length - 1; i >= 0; i--) {
        const w = node.widgets[i];
        if (w?.name === "get_name") node.widgets.splice(i, 1);
    }
}

function promptStudioWidgetForInputName(node, inputName) {
    if (inputName === "raw_prompt_input") return getWidget(node, "get_name_prompt");
    if (inputName === "image") return getWidget(node, "get_name_image");
    return null;
}

function promptStudioProviderMatchesLink(graph, link, value) {
    if (!graph || !link || !value || value === "(none)" || isSeparator(value)) return false;
    const sourceInfo = findSource(graph, value);
    if (!sourceInfo?.node || sourceInfo.slot == null) return false;
    return link.origin_id === sourceInfo.node.id && link.origin_slot === sourceInfo.slot;
}


const TJ_PROMPT_STUDIO_SLOTS = [
    { widgetName: "get_name_prompt", inputName: "raw_prompt_input", defaultType: "STRING" },
    { widgetName: "get_name_image", inputName: "image", defaultType: "IMAGE" },
];
function promptStudioInputIndex(node, inputName) {
    return node?.inputs?.findIndex(i => (i?.widget?.name || i?.name) === inputName) ?? -1;
}
function promptStudioNormalizeProvider(node, value) {
    const sourceInfo = findSource(node?.graph, value);
    return sourceInfo?.displayName || value;
}
function promptStudioLinkProviderValue(graph, link) {
    if (!graph || !link) return null;
    const origin = graph.getNodeById(link.origin_id);
    if (!origin) return null;
    const providers = window.TJ_NODE_collectAllProviders ? window.TJ_NODE_collectAllProviders(graph) : [];
    const found = providers.find(p => p.node === origin && p.slot === link.origin_slot);
    return found?.displayName || null;
}
function promptStudioRemoveLink(node, input) {
    if (!node?.graph || !input || input.link == null) return;
    node._tj_connecting_wireless = true;
    node._tj_prompt_studio_repairing = true;
    try { removeLink(node.graph, input.link); }
    finally {
        input.link = null;
        node._tj_connecting_wireless = false;
        node._tj_prompt_studio_repairing = false;
    }
}
function promptStudioRepairSlots(node) {
    if (!node || node.type !== "TJ_PromptStudio" || !node.graph || node._tj_prompt_studio_repairing) return;
    node._tj_prompt_studio_repairing = true;
    try {
        for (const spec of TJ_PROMPT_STUDIO_SLOTS) {
            const idx = promptStudioInputIndex(node, spec.inputName);
            const input = idx >= 0 ? node.inputs?.[idx] : null;
            const w = getWidget(node, spec.widgetName);
            if (!input || !w) continue;

            if (w.options) {
                const values = providerValues(node.graph);
                const next = Array.isArray(values) ? [...values] : ["(none)"];
                if (w.value && w.value !== "(none)" && !next.includes(w.value)) next.push(w.value);
                w.options.values = next;
            }

            const selected = w.value && !isSeparator(w.value) ? w.value : "(none)";
            input.name = spec.inputName;

            if (!selected || selected === "(none)") {
                if (input.link != null) {
                    const link = graphLink(node.graph, input.link);
                    const linkProvider = promptStudioLinkProviderValue(node.graph, link);
                    if (link?._tj_wireless || link?._tj_provider_value || linkProvider) promptStudioRemoveLink(node, input);
                }
                input.label = "";
                input.type = spec.defaultType;
                continue;
            }

            const sourceInfo = findSource(node.graph, selected);
            const normalized = sourceInfo?.displayName || selected;
            if (w.value !== normalized) w.value = normalized;
            w._tj_previous_value = normalized;
            const label = providerLabel(node.graph, normalized) || normalized;
            input.label = `◀ ${label}`;

            if (!(sourceInfo?.node && sourceInfo.slot != null && sourceInfo.node.outputs?.[sourceInfo.slot])) continue;

            const link = graphLink(node.graph, input.link);
            const ok = link && link.origin_id === sourceInfo.node.id && link.origin_slot === sourceInfo.slot;
            if (!ok) {
                if (input.link != null) promptStudioRemoveLink(node, input);
                node._tj_connecting_wireless = true;
                try {
                    sourceInfo.node.connect(sourceInfo.slot, node, idx);
                    window.TJ_NODE_markWirelessLink?.(node.graph, node, idx, normalized);
                } finally {
                    node._tj_connecting_wireless = false;
                }
            } else {
                window.TJ_NODE_markWirelessLink?.(node.graph, node, idx, normalized);
            }
            input.type = sourceInfo.node.outputs?.[sourceInfo.slot]?.type || spec.defaultType;
        }

        // Cross-slot safety: if a provider was moved to the wrong Prompt Studio input by a global repair,
        // remove it and let the correct slot rebuild on the next repair pass.
        for (const spec of TJ_PROMPT_STUDIO_SLOTS) {
            const idx = promptStudioInputIndex(node, spec.inputName);
            const input = idx >= 0 ? node.inputs?.[idx] : null;
            if (!input || input.link == null) continue;
            const link = graphLink(node.graph, input.link);
            const linkProvider = promptStudioLinkProviderValue(node.graph, link);
            if (!linkProvider) continue;
            for (const other of TJ_PROMPT_STUDIO_SLOTS) {
                if (other.inputName === spec.inputName) continue;
                const otherValue = getWidget(node, other.widgetName)?.value;
                if (otherValue && otherValue !== "(none)" && promptStudioNormalizeProvider(node, otherValue) === linkProvider) {
                    promptStudioRemoveLink(node, input);
                }
            }
        }
    } finally {
        node._tj_prompt_studio_repairing = false;
    }
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}
function promptStudioScheduleRepair(node, delays = [0, 80, 260, 700]) {
    for (const delay of delays) setTimeout(() => promptStudioRepairSlots(node), delay);
}

function installPromptStudioGlobalWireMenuSync() {
    if (window.TJ_NODE_prompt_studio_global_wire_menu_sync_installed) return;
    window.TJ_NODE_prompt_studio_global_wire_menu_sync_installed = true;

    // Prompt Studio uses two independent embedded GET slots. The core renderer does
    // not always classify those slot-specific links as ordinary embedded getters,
    // so this node has a small local renderer below. Keep its global Show/Hide state
    // synchronized with the existing TJ Node menu without touching set_getnode_tj.js.
    if (window.TJ_NODE_prompt_studio_global_show_wire === undefined) {
        window.TJ_NODE_prompt_studio_global_show_wire = false;
    }

    const syncFromMenuLabel = (label) => {
        // Core menu labels are state labels, not action labels:
        // - "Show ALL Wires" is displayed when global wires are currently OFF.
        // - "Hide ALL Wires" is displayed when global wires are currently ON.
        if (label.includes("Hide ALL Wires")) window.TJ_NODE_prompt_studio_global_show_wire = true;
        else if (label.includes("Show ALL Wires")) window.TJ_NODE_prompt_studio_global_show_wire = false;
    };

    const wrapOptions = (options) => {
        for (const item of options || []) {
            if (!item || typeof item !== "object") continue;
            const label = String(item.content || item.title || "");
            if (label.includes("Show ALL Wires") || label.includes("Hide ALL Wires")) {
                syncFromMenuLabel(label);
                if (!item._tj_prompt_studio_global_wire_wrapped && typeof item.callback === "function") {
                    const orig = item.callback;
                    item.callback = function(...args) {
                        const ret = orig.apply(this, args);
                        // The label belongs to the pre-click state, so clicking it flips the state.
                        if (label.includes("Show ALL Wires")) window.TJ_NODE_prompt_studio_global_show_wire = true;
                        else if (label.includes("Hide ALL Wires")) window.TJ_NODE_prompt_studio_global_show_wire = false;
                        app.canvas?.setDirty(true, true);
                        return ret;
                    };
                    item._tj_prompt_studio_global_wire_wrapped = true;
                }
            }
            const sub = item.submenu?.options || item.submenu || item.options;
            if (Array.isArray(sub)) wrapOptions(sub);
        }
        return options;
    };

    const CanvasProto = LGraphCanvas?.prototype;
    if (CanvasProto && !CanvasProto._tj_prompt_studio_canvas_menu_wire_sync) {
        CanvasProto._tj_prompt_studio_canvas_menu_wire_sync = true;
        const origCanvasMenu = CanvasProto.getCanvasMenuOptions;
        CanvasProto.getCanvasMenuOptions = function(...args) {
            const options = origCanvasMenu ? origCanvasMenu.apply(this, args) : [];
            return wrapOptions(options);
        };
    }

    const NodeProto = LiteGraph?.LGraphNode?.prototype;
    if (NodeProto && !NodeProto._tj_prompt_studio_node_menu_wire_sync) {
        NodeProto._tj_prompt_studio_node_menu_wire_sync = true;
        const origNodeMenu = NodeProto.getMenuOptions;
        NodeProto.getMenuOptions = function(...args) {
            const options = origNodeMenu ? origNodeMenu.apply(this, args) : [];
            return wrapOptions(options);
        };
    }
}


function promptStudioFindAllWiresLabel(items, depth = 0) {
    if (!Array.isArray(items) || depth > 8) return null;
    for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const label = String(item.content || item.title || "");
        if (label.includes("Hide ALL Wires") || label.includes("Show ALL Wires")) return label;
        const sub = item.submenu?.options || item.submenu || item.options;
        const found = promptStudioFindAllWiresLabel(sub, depth + 1);
        if (found) return found;
    }
    return null;
}

function promptStudioIsGlobalWireVisible() {
    const now = performance?.now ? performance.now() : Date.now();
    if (window.TJ_NODE_prompt_studio_global_wire_cache_time && now - window.TJ_NODE_prompt_studio_global_wire_cache_time < 120) {
        return !!window.TJ_NODE_prompt_studio_global_show_wire;
    }
    window.TJ_NODE_prompt_studio_global_wire_cache_time = now;

    // set_getnode_tj.js keeps globalShowWire in a module closure, so Prompt Studio
    // cannot read it directly. The reliable public signal is the current TJ menu label:
    // - Hide ALL Wires => global wires are currently ON.
    // - Show ALL Wires => global wires are currently OFF.
    try {
        const canvas = app.canvas;
        const options = canvas?.getCanvasMenuOptions ? canvas.getCanvasMenuOptions() : [];
        const label = promptStudioFindAllWiresLabel(options);
        if (label?.includes("Hide ALL Wires")) window.TJ_NODE_prompt_studio_global_show_wire = true;
        else if (label?.includes("Show ALL Wires")) window.TJ_NODE_prompt_studio_global_show_wire = false;
    } catch (_) {}
    return !!window.TJ_NODE_prompt_studio_global_show_wire;
}

function installPromptStudioLocalWireRenderer() {
    installPromptStudioGlobalWireMenuSync();
    if (window.TJ_NODE_prompt_studio_wire_renderer_installed) return;
    window.TJ_NODE_prompt_studio_wire_renderer_installed = true;
    const origRenderLink = LGraphCanvas.prototype.renderLink;
    LGraphCanvas.prototype.renderLink = function(ctx, a, b, link, skip_border, flow, color, start_dir, end_dir, num_sublines) {
        if (link && this.graph) {
            const target = this.graph.getNodeById(link.target_id);
            if (target?.type === "TJ_PromptStudio" && link._tj_wireless) {
                const input = target.inputs?.[link.target_slot];
                const inputName = input?.widget?.name || input?.name || "";
                const w = promptStudioWidgetForInputName(target, inputName);
                const selected = w?.value;
                if (selected && selected !== "(none)" && !isSeparator(selected) && promptStudioProviderMatchesLink(this.graph, link, selected)) {
                    const hoverNode = this.node_over || app.canvas?.node_over || null;
                    const hoverWire = !!(hoverNode && (hoverNode.id === link.origin_id || hoverNode === target));
                    if (promptStudioIsGlobalWireVisible() || target.properties?.show_wire || hoverWire) {
                        ctx.save();
                        ctx.setLineDash([2, 5]);
                        const oldWidth = this.connections_width;
                        this.connections_width = 2;
                        const args = Array.from(arguments);
                        args[6] = "#ffff00";
                        const res = origRenderLink.apply(this, args);
                        this.connections_width = oldWidth;
                        ctx.restore();
                        return res;
                    }
                    return;
                }
            }
        }
        return origRenderLink.apply(this, arguments);
    };
}

function attachEmbeddedGet(node, opts = {}) {
    const widgetName = opts.widgetName || "get_name_prompt";
    const inputName = opts.inputName || "raw_prompt_input";
    const defaultType = opts.defaultType || "STRING";
    const getW = getWidget(node, widgetName);
    const input = getInputSlot(node, inputName);
    if (!node || !getW || !input || getW[`_tj_prompt_studio_get_attached_${inputName}`]) return;

    getW[`_tj_prompt_studio_get_attached_${inputName}`] = true;

    const refreshProviderValues = () => {
        const values = providerValues(node.graph);
        const next = Array.isArray(values) ? [...values] : ["(none)"];
        if (getW.value && getW.value !== "(none)" && !next.includes(getW.value)) next.push(getW.value);
        getW.options = { ...(getW.options || {}), values: next };
        return next;
    };

    const getInputIndex = (target) => target.inputs?.findIndex(i => (i?.widget?.name || i?.name) === inputName) ?? -1;

    const updateOne = () => {
        const w = getWidget(node, widgetName);
        const idx = getInputIndex(node);
        if (!w || idx < 0 || !node.inputs?.[idx]) return;
        const values = refreshProviderValues();
        if (w.value && w.value !== "(none)" && !values.includes(w.value)) {
            w.options = { ...(w.options || {}), values: [...values, w.value] };
        }
        const lab = providerLabel(node.graph, w.value);
        node.inputs[idx].label = lab ? `◀ ${lab}` : "";
    };

    const connectOne = (value) => {
        const idx = getInputIndex(node);
        if (!node.graph || idx < 0 || !node.inputs?.[idx]) return;
        if (isSeparator(value)) value = "(none)";
        const input = node.inputs[idx];
        const wantsWireless = !!(value && value !== "(none)" && !isSeparator(value));
        const currentLinkId = input.link;
        const currentIsWireless = isWireless(node.graph, currentLinkId);

        if (!wantsWireless) {
            // User explicitly selected none: remove the previous GET/fake-wire link.
            // This also cleans up any older unmarked direct link left by previous builds.
            if (currentLinkId != null) {
                node._tj_connecting_wireless = true;
                try { removeLink(node.graph, currentLinkId); }
                finally { node._tj_connecting_wireless = false; }
                input.link = null;
            }
            input.name = inputName;
            input.label = "";
            input.type = defaultType;
                app.canvas?.setDirty(true, true);
            return;
        }

        const sourceInfo = findSource(node.graph, value);
        const normalizedValue = sourceInfo?.displayName || value;
        const w = getWidget(node, widgetName);
        if (w && w.value !== normalizedValue) w.value = normalizedValue;
        input.name = inputName;
        input.label = `◀ ${providerLabel(node.graph, normalizedValue) || normalizedValue}`;

        if (!(sourceInfo?.node && sourceInfo.slot != null && sourceInfo.node.outputs?.[sourceInfo.slot])) {
            window.TJ_NODE_scheduleWirelessRepair?.(node.graph, 80);
            window.TJ_NODE_scheduleWirelessRepair?.(node.graph, 300);
                app.canvas?.setDirty(true, true);
            return;
        }

        if (currentLinkId != null && (wantsWireless || currentIsWireless)) {
            node._tj_connecting_wireless = true;
            removeLink(node.graph, currentLinkId);
            node._tj_connecting_wireless = false;
        }
        node._tj_connecting_wireless = true;
        sourceInfo.node.connect(sourceInfo.slot, node, idx);
        window.TJ_NODE_markWirelessLink?.(node.graph, node, idx, normalizedValue);
        node._tj_connecting_wireless = false;
        input.type = sourceInfo.node.outputs?.[sourceInfo.slot]?.type || defaultType;
        app.canvas?.setDirty(true, true);
    };

    const origCb = getW.callback;
    getW.callback = function(v) {
        origCb?.call(this, v);
        if (isSeparator(v)) { getW.value = getW._tj_previous_value || getW.value || "(none)"; return; }
        getW._tj_previous_value = v;
        connectOne(v);
        promptStudioScheduleRepair(node, [0, 120, 400]);
    };

    const origConn = node.onConnectionsChange;
    node.onConnectionsChange = function(type, index, connected) {
        origConn?.apply(this, arguments);
        const changed = this.inputs?.[index];
        const changedName = changed?.widget?.name || changed?.name || "";
        if (type === LiteGraph.INPUT && changedName === inputName) {
            if (!connected && !this._tj_connecting_wireless) {
                const selected = getWidget(this, widgetName)?.value;
                if (selected && selected !== "(none)") {
                    changed.label = `◀ ${providerLabel(this.graph, selected) || selected}`;
                    window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 80);
                    window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 300);
                }
            }
            app.canvas?.setDirty(true, true);
        }
    };

    if (!node._tjPromptStudioUpdateAllGetOptions) node._tjPromptStudioUpdateAllGetOptions = () => {};
    const prevUpdateAll = node._tjPromptStudioUpdateAllGetOptions;
    node._tjPromptStudioUpdateAllGetOptions = function() { prevUpdateAll(); updateOne(); };

    requestAnimationFrame(() => { refreshProviderValues(); updateOne(); if (getW.value) connectOne(getW.value); promptStudioRepairSlots(node); });
    setTimeout(() => { refreshProviderValues(); updateOne(); if (getW.value) connectOne(getW.value); promptStudioRepairSlots(node); }, 160);
    setTimeout(() => promptStudioRepairSlots(node), 600);
}


function getEffectiveMode(node) {
    const mode = String(getWidget(node, "mode")?.value || "Auto");
    if (mode !== "Auto") return mode;
    return isInputConnected(node, "image") ? "Image to Prompt" : "Prompt Enhancer";
}

function getEffectiveBackend(node) {
    const clipConnected = isInputConnected(node, "clip");
    const backendW = getWidget(node, "model_backend");
    if (clipConnected && backendW && backendW.value !== "ComfyUI TextGenerate") setWidgetValueSilent(backendW, "ComfyUI TextGenerate");
    return String(backendW?.value || "GGUF / llama.cpp");
}


function scheduleFitNodeHeightKeepWidth(node) {
    if (!node || !node.computeSize) return;
    requestAnimationFrame(() => {
        try {
            const width = Math.max(220, Number(node.size?.[0] || 360));
            const computed = node.computeSize();
            const height = Math.max(80, Number(computed?.[1] || node.size?.[1] || 120));
            if (Math.abs((node.size?.[1] || 0) - height) > 2) {
                node.setSize?.([width, height]);
                node.setDirtyCanvas?.(true, true);
                app.canvas?.setDirty(true, true);
            }
        } catch (err) {
            console.warn("[TJ_NODE] Prompt Studio resize skipped", err);
        }
    });
}

function studioLayoutSignature(node) {
    return [
        node?.type || "",
        String(!!node?.properties?.tj_prompt_studio_advanced),
        String(getWidget(node, "mode")?.value || ""),
        String(getWidget(node, "model_backend")?.value || ""),
        getEffectiveMode(node),
        String(isInputConnected(node, "clip")),
        String(isInputConnected(node, "image")),
    ].join("|");
}

function updateStudioVisibility(node) {
    const mode = getEffectiveMode(node);
    const previousMode = node._tj_prompt_studio_effective_mode || null;
    if (!node.properties) node.properties = {};

    // Store only the vertical size for Prompt Enhancer mode.
    // Width is shared/synced between modes and must never be reset here.
    if (previousMode === "Prompt Enhancer" && previousMode !== mode && node.size?.[1]) {
        node.properties.tj_prompt_studio_enhancer_height = Number(node.size[1]);
    }
    node._tj_prompt_studio_effective_mode = mode;

    const isImageMode = mode === "Image to Prompt";
    const isEnhanceMode = mode === "Prompt Enhancer";
    const backend = getEffectiveBackend(node);
    const isGGUF = backend === "GGUF / llama.cpp";
    const advanced = !!node.properties?.tj_prompt_studio_advanced;

    setWidgetVisible(getWidget(node, "raw_prompt"), isEnhanceMode);
    setWidgetVisible(getWidget(node, "purpose"), isEnhanceMode);
    setWidgetVisible(getWidget(node, "vision_task"), isImageMode);

    setWidgetVisible(getWidget(node, "gguf_model"), isGGUF);
    setWidgetVisible(getWidget(node, "mmproj_file"), isGGUF);
    setWidgetVisible(getWidget(node, "chat_handler"), isGGUF && isImageMode);
    setWidgetVisible(getWidget(node, "text_encoder_name"), !isGGUF);
    setWidgetVisible(getWidget(node, "clip_loader_type"), !isGGUF);

    setWidgetVisible(getWidget(node, "extra_instructions"), advanced && isEnhanceMode);
    setWidgetVisible(getWidget(node, "system_prompt_override"), advanced && isEnhanceMode);
    setWidgetVisible(getWidget(node, "append_no_think"), advanced && isEnhanceMode);
    setWidgetVisible(getWidget(node, "top_p"), advanced && isEnhanceMode);
    setWidgetVisible(getWidget(node, "repeat_penalty"), advanced && isEnhanceMode);
    setWidgetVisible(getWidget(node, "custom_instruction"), advanced && isImageMode);
    setWidgetVisible(getWidget(node, "n_gpu_layers"), advanced);
    setWidgetVisible(getWidget(node, "n_ctx"), advanced);
    setWidgetVisible(getWidget(node, "max_tokens"), advanced);
    setWidgetVisible(getWidget(node, "temperature"), advanced);

    if (node._tj_prompt_studio_advanced_btn) node._tj_prompt_studio_advanced_btn.textContent = advanced ? "Hide advanced settings" : "Show advanced settings";

    const sig = studioLayoutSignature(node);
    if (node._tj_prompt_studio_last_layout_signature !== sig) {
        node._tj_prompt_studio_last_layout_signature = sig;

        if (isImageMode) {
            // Image to Prompt has no large user text field, so keep the previous auto-fit behavior.
            scheduleFitNodeHeightKeepWidth(node);
        } else if (isEnhanceMode) {
            // Prompt Enhancer owns a large text field. Restore the user's saved height instead of auto-fitting.
            const savedH = Number(node.properties?.tj_prompt_studio_enhancer_height || 0);
            if (savedH > 0 && node.size?.[1] && Math.abs(node.size[1] - savedH) > 2) {
                requestAnimationFrame(() => {
                    const width = Math.max(220, Number(node.size?.[0] || 360));
                    node.setSize?.([width, savedH]);
                    node.setDirtyCanvas?.(true, true);
                    app.canvas?.setDirty(true, true);
                });
            }
        }
    }
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

function installAdvancedToggle(node) {
    if (node._tj_prompt_studio_advanced_toggle_installed) return;
    node._tj_prompt_studio_advanced_toggle_installed = true;
    if (!node.properties) node.properties = {};
    if (node.properties.tj_prompt_studio_advanced === undefined) node.properties.tj_prompt_studio_advanced = false;

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;justify-content:center;padding:2px;height:22px;box-sizing:border-box;width:100%;max-width:100%;";
    const btn = document.createElement("button");
    btn.textContent = "Show advanced settings";
    btn.style.cssText = "width:100%;height:20px;background:#151515;color:#ddd;border:1px solid #555;border-radius:2px;cursor:pointer;font-size:11px;line-height:18px;box-sizing:border-box;";
    row.appendChild(btn);
    node._tj_prompt_studio_advanced_btn = btn;

    const widget = node.addDOMWidget("tj_prompt_studio_advanced_toggle", "btn", row, { serialize: false, hideOnZoom: false });
    widget.computeSize = (width) => {
        const w = width || innerWidth(node);
        row.style.width = `${w}px`;
        row.style.maxWidth = `${w}px`;
        return [w, 26];
    };
    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        node.properties.tj_prompt_studio_advanced = !node.properties.tj_prompt_studio_advanced;
        updateStudioVisibility(node);
    };
}

function attachCallbacks(node) {
    for (const name of ["model_backend", "mode"]) {
        const w = getWidget(node, name);
        if (!w || w._tj_prompt_studio_callback_attached) continue;
        w._tj_prompt_studio_callback_attached = true;
        const orig = w.callback;
        w.callback = function(v) { orig?.call(this, v); updateStudioVisibility(node); };
    }
}

function installStudio(node) {
    applyTJTheme(node);
    if (!node.properties) node.properties = {};
    if (!node._tj_prompt_studio_resize_hooked) {
        node._tj_prompt_studio_resize_hooked = true;
        const origResize = node.onResize;
        node.onResize = function(size) {
            const res = origResize?.apply(this, arguments);
            if (getEffectiveMode(this) === "Prompt Enhancer" && size?.[1]) {
                if (!this.properties) this.properties = {};
                this.properties.tj_prompt_studio_enhancer_height = Number(size[1]);
            }
            return res;
        };
    }
    if (getEffectiveMode(node) === "Prompt Enhancer" && node.size?.[1] && !node.properties.tj_prompt_studio_enhancer_height) {
        node.properties.tj_prompt_studio_enhancer_height = Number(node.size[1]);
    }
    removeLegacyHiddenGetNameProxy(node);
    moveWidgetToTop(node, "get_name_prompt", 0);
    moveWidgetToTop(node, "get_name_image", 1);
    moveWidgetToTop(node, "set_name", 2);
    moveWidgetToTop(node, "mode", 3);
    attachSetSync(node);
    attachEmbeddedGet(node, { widgetName: "get_name_prompt", inputName: "raw_prompt_input", defaultType: "STRING" });
    attachEmbeddedGet(node, { widgetName: "get_name_image", inputName: "image", defaultType: "IMAGE" });
    promptStudioScheduleRepair(node, [0, 120, 400, 900]);
    installSeedAfterGenerate(node);
    attachCallbacks(node);
    installAdvancedToggle(node);
    tjEnsureSeedQueueHook();
    updateStudioVisibility(node);
}

app.registerExtension({
    name: "TJ.PromptStudio",
    async beforeRegisterNodeDef(nodeType, nodeData, _app) {
        if (nodeData.name !== "TJ_PromptStudio") return;
        installPromptStudioLocalWireRenderer();

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            origOnNodeCreated?.apply(this, arguments);
            installStudio(this);
            const origConn = this.onConnectionsChange;
            this.onConnectionsChange = function(type, index, connected) {
                origConn?.apply(this, arguments);
                const input = this.inputs?.[index];
                const name = input?.widget?.name || input?.name || "";
                if (type === LiteGraph.INPUT && (name === "clip" || name === "image")) {
                    if (name === "clip" && connected) {
                        const backendW = getWidget(this, "model_backend");
                        if (backendW) backendW.value = "ComfyUI TextGenerate";
                    }
                    updateStudioVisibility(this);
                }
                if (type === LiteGraph.INPUT && (name === "raw_prompt_input" || name === "image")) {
                    promptStudioScheduleRepair(this, [0, 120, 400]);
                }
            };
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            origOnConfigure?.apply(this, arguments);
            requestAnimationFrame(() => {
                installStudio(this);
                this._tjPromptStudioUpdateAllGetOptions?.();
                promptStudioScheduleRepair(this, [0, 200, 700, 1200]);
            });
        };

        const origOnDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            this._tjPromptStudioUpdateAllGetOptions?.();
            updateStudioVisibility(this);
            const now = performance?.now ? performance.now() : Date.now();
            if (!this._tj_prompt_studio_last_repair_draw || now - this._tj_prompt_studio_last_repair_draw > 1000) {
                this._tj_prompt_studio_last_repair_draw = now;
                promptStudioRepairSlots(this);
            }
            origOnDrawForeground?.apply(this, arguments);
        };
    }
});
