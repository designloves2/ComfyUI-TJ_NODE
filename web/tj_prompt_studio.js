import { app } from "../../scripts/app.js";

function attachSetSync(node) {
    if (window.TJ_NODE_attachProviderNameSync) return window.TJ_NODE_attachProviderNameSync(node);
}

function getWidget(node, name) { return node?.widgets?.find(w => w?.name === name); }
function getInputIndex(node, inputName) { return node?.inputs?.findIndex(i => (i?.widget?.name || i?.name) === inputName) ?? -1; }
function getInputSlot(node, name) { const idx = getInputIndex(node, name); return idx >= 0 ? node.inputs[idx] : null; }
function isInputConnected(node, name) { const input = getInputSlot(node, name); return !!(input && input.link != null); }
function graphLink(graph, linkId) { if (!graph || linkId == null) return null; return graph.links?.[linkId] || graph.links?.get?.(linkId) || null; }
function isWirelessLink(graph, linkId) { const link = graphLink(graph, linkId); return !!(link && (link._tj_wireless || link._tj_provider_value)); }
function removeLink(graph, linkId) { if (!graph || linkId == null) return; try { graph.removeLink(linkId); } catch (_) {} }
function providerValues(graph) { if (window.TJ_NODE_getAllSetNames) return window.TJ_NODE_getAllSetNames(graph); return ["(none)"]; }
function isSeparator(value) { return !!(value && window.TJ_NODE_PROVIDER_SEPARATOR && value === window.TJ_NODE_PROVIDER_SEPARATOR); }
function providerLabel(graph, value) { if (window.TJ_NODE_getProviderLabelName) return window.TJ_NODE_getProviderLabelName(graph, value); return value && value !== "(none)" ? String(value).replace(/^TJ\s*\/\s*/, "") : ""; }
function findSource(graph, value) { if (window.TJ_NODE_findSetterSourceInfo) return window.TJ_NODE_findSetterSourceInfo(graph, value); return null; }
function setWidgetValueSilent(widget, value) { if (!widget) return; widget._tj_prompt_studio_silent = true; widget.value = value; widget._tj_previous_value = value; widget._tj_prompt_studio_silent = false; }
function innerWidth(node, fallback = 420) { return Math.max(120, Number(node?.size?.[0] || fallback) - 20); }

const PROMPT_STUDIO_DEFAULT_HEIGHT = 420;
const PROMPT_STUDIO_MIN_HEIGHT = 260;
const PROMPT_STUDIO_MAX_AUTOFIT_HEIGHT = 460;

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

function forceWidgetWidths(node) {
    const width = Math.max(220, Number(node?.size?.[0] || 420));
    try {
        for (const w of node.widgets || []) {
            if (w?.element?.style) {
                w.element.style.width = `${innerWidth(node)}px`;
                w.element.style.maxWidth = `${innerWidth(node)}px`;
            }
        }
    } catch (_) {}
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
    return width;
}

const TJ_PROMPT_STUDIO_SLOTS = [
    { widgetName: "get_name_prompt", inputName: "raw_prompt_input", defaultType: "STRING" },
    { widgetName: "get_name_image", inputName: "image", defaultType: "IMAGE" },
];


function promptStudioWidgetForInputName(node, inputName) {
    const spec = slotSpecForInput(inputName);
    return spec ? getWidget(node, spec.widgetName) : null;
}

function promptStudioProviderMatchesLink(graph, link, value) {
    if (!graph || !link || !value || value === "(none)" || isSeparator(value)) return false;
    const sourceInfo = findSource(graph, value);
    if (!sourceInfo?.node || sourceInfo.slot == null) return false;
    return link.origin_id === sourceInfo.node.id && link.origin_slot === sourceInfo.slot;
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
    try {
        const options = app.canvas?.getCanvasMenuOptions ? app.canvas.getCanvasMenuOptions() : [];
        const label = promptStudioFindAllWiresLabel(options);
        if (label?.includes("Hide ALL Wires")) window.TJ_NODE_prompt_studio_global_show_wire = true;
        else if (label?.includes("Show ALL Wires")) window.TJ_NODE_prompt_studio_global_show_wire = false;
    } catch (_) {}
    return !!window.TJ_NODE_prompt_studio_global_show_wire;
}

function installPromptStudioLocalWireRenderer() {
    if (window.TJ_NODE_prompt_studio_wire_renderer_installed) return;
    window.TJ_NODE_prompt_studio_wire_renderer_installed = true;
    if (window.TJ_NODE_prompt_studio_global_show_wire === undefined) window.TJ_NODE_prompt_studio_global_show_wire = false;
    const origRenderLink = LGraphCanvas.prototype.renderLink;
    LGraphCanvas.prototype.renderLink = function(ctx, a, b, link, skip_border, flow, color, start_dir, end_dir, num_sublines) {
        if (link && this.graph) {
            const target = this.graph.getNodeById(link.target_id);
            if (target?.type === "TJ_PromptStudio" && (link._tj_wireless || link._tj_provider_value)) {
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

function slotSpecForInput(inputName) {
    return TJ_PROMPT_STUDIO_SLOTS.find(s => s.inputName === inputName) || null;
}

function clearInputLink(node, inputName, options = {}) {
    const idx = getInputIndex(node, inputName);
    const input = idx >= 0 ? node.inputs[idx] : null;
    if (!node?.graph || !input) return;
    if (input.link != null) {
        node._tj_connecting_wireless = true;
        try { removeLink(node.graph, input.link); }
        finally { node._tj_connecting_wireless = false; }
        input.link = null;
    }
    input.name = inputName;
    input.label = "";
    input.type = options.defaultType || slotSpecForInput(inputName)?.defaultType || input.type;
}

function clearImageForPromptEnhancer(node) {
    const imageW = getWidget(node, "get_name_image");
    setWidgetValueSilent(imageW, "(none)");
    clearInputLink(node, "image", { defaultType: "IMAGE" });
}

function refreshProviderValuesForWidget(node, widget) {
    if (!widget) return ["(none)"];
    const values = providerValues(node.graph);
    const next = Array.isArray(values) ? [...values] : ["(none)"];
    if (widget.value && widget.value !== "(none)" && !next.includes(widget.value)) next.push(widget.value);
    widget.options = { ...(widget.options || {}), values: next };
    return next;
}

function updateOneGetSlot(node, spec) {
    const w = getWidget(node, spec.widgetName);
    const idx = getInputIndex(node, spec.inputName);
    if (!w || idx < 0 || !node.inputs?.[idx]) return;
    const values = refreshProviderValuesForWidget(node, w);
    if (w.value && w.value !== "(none)" && !values.includes(w.value)) {
        w.options = { ...(w.options || {}), values: [...values, w.value] };
    }
    const input = node.inputs[idx];
    const label = providerLabel(node.graph, w.value);
    if (w.value && w.value !== "(none)") input.label = label ? `◀ ${label}` : `◀ ${w.value}`;
    else if (!input.link || isWirelessLink(node.graph, input.link)) input.label = "";
}

function connectGetSlot(node, spec, value) {
    const idx = getInputIndex(node, spec.inputName);
    const input = idx >= 0 ? node.inputs[idx] : null;
    const w = getWidget(node, spec.widgetName);
    if (!node?.graph || !input || !w) return;
    if (isSeparator(value)) value = "(none)";

    const wantsWireless = !!(value && value !== "(none)" && !isSeparator(value));
    const currentLinkId = input.link;
    const currentIsWireless = isWirelessLink(node.graph, currentLinkId);

    if (!wantsWireless) {
        if (currentLinkId != null && currentIsWireless) {
            node._tj_connecting_wireless = true;
            try { removeLink(node.graph, currentLinkId); }
            finally { node._tj_connecting_wireless = false; }
            input.link = null;
        }
        input.name = spec.inputName;
        if (!input.link) {
            input.label = "";
            input.type = spec.defaultType;
        }
        app.canvas?.setDirty(true, true);
        return;
    }

    const sourceInfo = findSource(node.graph, value);
    const normalizedValue = sourceInfo?.displayName || value;
    if (w.value !== normalizedValue) w.value = normalizedValue;
    w._tj_previous_value = normalizedValue;
    input.name = spec.inputName;
    input.label = `◀ ${providerLabel(node.graph, normalizedValue) || normalizedValue}`;

    if (!(sourceInfo?.node && sourceInfo.slot != null && sourceInfo.node.outputs?.[sourceInfo.slot])) {
        window.TJ_NODE_scheduleWirelessRepair?.(node.graph, 80);
        window.TJ_NODE_scheduleWirelessRepair?.(node.graph, 300);
        app.canvas?.setDirty(true, true);
        return;
    }

    // User selected a get_name provider: last user action wins. Remove both direct and fake-wire links.
    if (currentLinkId != null) {
        node._tj_connecting_wireless = true;
        try { removeLink(node.graph, currentLinkId); }
        finally { node._tj_connecting_wireless = false; }
        input.link = null;
    }

    node._tj_connecting_wireless = true;
    try {
        sourceInfo.node.connect(sourceInfo.slot, node, idx);
        window.TJ_NODE_markWirelessLink?.(node.graph, node, idx, normalizedValue);
        const link = graphLink(node.graph, node.inputs?.[idx]?.link);
        if (link) {
            link._tj_wireless = true;
            link._tj_provider_value = normalizedValue;
        }
    } finally {
        node._tj_connecting_wireless = false;
    }
    input.type = sourceInfo.node.outputs?.[sourceInfo.slot]?.type || spec.defaultType;
    app.canvas?.setDirty(true, true);
}

function attachEmbeddedGet(node, spec) {
    if (!node || !spec) return;
    const w = getWidget(node, spec.widgetName);
    if (!w || w[`_tj_prompt_studio_attached_${spec.inputName}`]) return;
    w[`_tj_prompt_studio_attached_${spec.inputName}`] = true;

    const origCb = w.callback;
    w.callback = function(v) {
        origCb?.call(this, v);
        if (this._tj_prompt_studio_silent) return;
        if (isSeparator(v)) {
            this.value = this._tj_previous_value || this.value || "(none)";
            return;
        }
        this._tj_previous_value = v;
        connectGetSlot(node, spec, v);
        updateStudioVisibility(node);
    };

    if (!node._tjPromptStudioUpdateAllGetOptions) node._tjPromptStudioUpdateAllGetOptions = function() {};
    const prev = node._tjPromptStudioUpdateAllGetOptions;
    node._tjPromptStudioUpdateAllGetOptions = function() {
        prev?.call(this);
        updateOneGetSlot(this, spec);
    };

    requestAnimationFrame(() => { refreshProviderValuesForWidget(node, w); updateOneGetSlot(node, spec); if (w.value) connectGetSlot(node, spec, w.value); });
    setTimeout(() => { refreshProviderValuesForWidget(node, w); updateOneGetSlot(node, spec); if (w.value) connectGetSlot(node, spec, w.value); }, 160);
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

function scheduleFitNodeHeightKeepWidth(node, options = {}) {
    if (!node || !node.computeSize) return;
    requestAnimationFrame(() => {
        try {
            const width = Math.max(220, Number(node.size?.[0] || 420));
            const computed = node.computeSize();
            let height = Math.max(PROMPT_STUDIO_MIN_HEIGHT, Number(computed?.[1] || node.size?.[1] || PROMPT_STUDIO_DEFAULT_HEIGHT));
            if (options.capDefault) height = Math.min(height, PROMPT_STUDIO_MAX_AUTOFIT_HEIGHT);
            if (Math.abs((node.size?.[1] || 0) - height) > 2) {
                node._tj_prompt_studio_internal_resize = true;
                node.setSize?.([width, height]);
                node._tj_prompt_studio_internal_resize = false;
            }
            forceWidgetWidths(node);
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

function restoreEnhancerHeight(node) {
    const savedH = Number(node.properties?.tj_prompt_studio_enhancer_height || 0);
    if (savedH > 0 && node.size?.[1] && Math.abs(node.size[1] - savedH) > 2) {
        requestAnimationFrame(() => {
            const width = Math.max(220, Number(node.size?.[0] || 420));
            node._tj_prompt_studio_internal_resize = true;
            node.setSize?.([width, savedH]);
            node._tj_prompt_studio_internal_resize = false;
            forceWidgetWidths(node);
        });
    } else {
        scheduleFitNodeHeightKeepWidth(node, { capDefault: true });
    }
}

function updateStudioVisibility(node) {
    if (!node) return;
    const mode = getEffectiveMode(node);
    const previousMode = node._tj_prompt_studio_effective_mode || null;
    if (!node.properties) node.properties = {};

    if (previousMode === "Prompt Enhancer" && previousMode !== mode && node.size?.[1] && !node._tj_prompt_studio_internal_resize) {
        node.properties.tj_prompt_studio_enhancer_height = Number(node.size[1]);
    }
    node._tj_prompt_studio_effective_mode = mode;

    const isImageMode = mode === "Image to Prompt";
    const isEnhanceMode = mode === "Prompt Enhancer";
    const backend = getEffectiveBackend(node);
    const isGGUF = backend === "GGUF / llama.cpp";
    const advanced = !!node.properties?.tj_prompt_studio_advanced;

    if (isEnhanceMode) clearImageForPromptEnhancer(node);

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
        if (isEnhanceMode) restoreEnhancerHeight(node);
        else scheduleFitNodeHeightKeepWidth(node, { capDefault: true });
    }
    forceWidgetWidths(node);
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
        scheduleFitNodeHeightKeepWidth(node, { capDefault: false });
    };
}

function attachCallbacks(node) {
    for (const name of ["model_backend", "mode"]) {
        const w = getWidget(node, name);
        if (!w || w._tj_prompt_studio_callback_attached) continue;
        w._tj_prompt_studio_callback_attached = true;
        const orig = w.callback;
        w.callback = function(v) {
            orig?.call(this, v);
            if (name === "mode" && String(v) === "Prompt Enhancer") clearImageForPromptEnhancer(node);
            updateStudioVisibility(node);
        };
    }
}

function applyInitialSize(node) {
    if (!node || node._tj_prompt_studio_initial_size_applied) return;
    node._tj_prompt_studio_initial_size_applied = true;
    if (node.properties?.tj_prompt_studio_user_sized) return;
    requestAnimationFrame(() => {
        const width = Math.max(360, Number(node.size?.[0] || 420));
        const h = Math.min(PROMPT_STUDIO_MAX_AUTOFIT_HEIGHT, Math.max(PROMPT_STUDIO_MIN_HEIGHT, Number(node.computeSize?.()?.[1] || PROMPT_STUDIO_DEFAULT_HEIGHT)));
        node._tj_prompt_studio_internal_resize = true;
        node.setSize?.([width, h]);
        node._tj_prompt_studio_internal_resize = false;
        forceWidgetWidths(node);
    });
}

function installStudio(node) {
    window.TJ_NODE_applyTheme(node);
    if (!node.properties) node.properties = {};
    if (!node._tj_prompt_studio_resize_hooked) {
        node._tj_prompt_studio_resize_hooked = true;
        const origResize = node.onResize;
        node.onResize = function(size) {
            const res = origResize?.apply(this, arguments);
            if (!this._tj_prompt_studio_internal_resize && size?.[1]) {
                this.properties.tj_prompt_studio_user_sized = true;
                if (getEffectiveMode(this) === "Prompt Enhancer") this.properties.tj_prompt_studio_enhancer_height = Number(size[1]);
            }
            forceWidgetWidths(this);
            return res;
        };
    }

    moveWidgetToTop(node, "get_name_prompt", 0);
    moveWidgetToTop(node, "get_name_image", 1);
    moveWidgetToTop(node, "set_name", 2);
    moveWidgetToTop(node, "mode", 3);
    attachSetSync(node);
    attachEmbeddedGet(node, TJ_PROMPT_STUDIO_SLOTS[0]);
    attachEmbeddedGet(node, TJ_PROMPT_STUDIO_SLOTS[1]);
    attachCallbacks(node);
    installAdvancedToggle(node);
    updateStudioVisibility(node);
    applyInitialSize(node);
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
                if (type === LiteGraph.INPUT && name === "clip" && connected) {
                    const backendW = getWidget(this, "model_backend");
                    if (backendW) backendW.value = "ComfyUI TextGenerate";
                    updateStudioVisibility(this);
                }
                if (type === LiteGraph.INPUT && (name === "raw_prompt_input" || name === "image")) {
                    const spec = slotSpecForInput(name);
                    const w = spec ? getWidget(this, spec.widgetName) : null;
                    const link = graphLink(this.graph, input?.link);
                    const isDirect = connected && input?.link != null && !isWirelessLink(this.graph, input.link) && !this._tj_connecting_wireless;
                    if (isDirect && w) {
                        // Direct wire is the newest user action: clear get_name silently and keep the direct link.
                        setWidgetValueSilent(w, "(none)");
                        input.label = "";
                        input.name = name;
                    }
                    if (!connected && w && !this._tj_connecting_wireless) {
                        setWidgetValueSilent(w, "(none)");
                        input.label = "";
                    }
                    if (name === "image" && getEffectiveMode(this) === "Prompt Enhancer") clearImageForPromptEnhancer(this);
                    updateStudioVisibility(this);
                }
            };
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            origOnConfigure?.apply(this, arguments);
            requestAnimationFrame(() => {
                installStudio(this);
                this._tjPromptStudioUpdateAllGetOptions?.();
                for (const spec of TJ_PROMPT_STUDIO_SLOTS) {
                    const w = getWidget(this, spec.widgetName);
                    if (w?.value) connectGetSlot(this, spec, w.value);
                }
            });
        };

        const origOnDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            this._tjPromptStudioUpdateAllGetOptions?.();
            updateStudioVisibility(this);
            origOnDrawForeground?.apply(this, arguments);
        };
    }
});
