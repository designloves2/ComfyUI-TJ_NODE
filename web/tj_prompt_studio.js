import { app } from "../../scripts/app.js";

function applyTJTheme(node) {
    if (window.TJ_NODE_applyTheme) return window.TJ_NODE_applyTheme(node);
    node.bgcolor = "#000000";
    node.color = "#7612DA";
    node.title_text_color = "#FFFFFF";
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

function attachEmbeddedGet(node) {
    if (!node || node._tj_prompt_studio_get_attached) return;
    const getW = getWidget(node, "get_name");
    if (!getW || !node.inputs?.[0]) return;
    node._tj_prompt_studio_get_attached = true;

    const refreshProviderValues = () => {
        const values = providerValues(node.graph);
        const next = Array.isArray(values) ? [...values] : ["(none)"];
        if (getW.value && getW.value !== "(none)" && !next.includes(getW.value)) next.push(getW.value);
        getW.options = { ...(getW.options || {}), values: next };
        return next;
    };

    node._tjPromptStudioUpdateGetOptions = function() {
        const w = getWidget(this, "get_name");
        if (!w) return;
        const values = refreshProviderValues();
        if (w.value && w.value !== "(none)" && !values.includes(w.value)) w.options = { ...(w.options || {}), values: [...values, w.value] };
        const label = providerLabel(this.graph, w.value);
        if (this.inputs?.[0]) this.inputs[0].label = label ? `◀ ${label}` : "";
    };

    node._tjPromptStudioConnectGet = function(value) {
        if (!this.graph || !this.inputs?.[0]) return;
        if (isSeparator(value)) value = "(none)";
        const input = this.inputs[0];
        const wantsWireless = !!(value && value !== "(none)" && !isSeparator(value));
        const currentLinkId = input.link;
        const currentIsWireless = isWireless(this.graph, currentLinkId);

        if (!wantsWireless) {
            input.name = "raw_prompt_input";
            input.label = "";
            if (currentLinkId == null || currentIsWireless) input.type = "STRING";
            app.canvas?.setDirty(true, true);
            return;
        }

        const sourceInfo = findSource(this.graph, value);
        const normalizedValue = sourceInfo?.displayName || value;
        const w = getWidget(this, "get_name");
        if (w && w.value !== normalizedValue) w.value = normalizedValue;
        input.name = "raw_prompt_input";
        input.label = `◀ ${providerLabel(this.graph, normalizedValue) || normalizedValue}`;

        if (!(sourceInfo?.node && sourceInfo.slot != null && sourceInfo.node.outputs?.[sourceInfo.slot])) {
            window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 80);
            window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 300);
            app.canvas?.setDirty(true, true);
            return;
        }

        if (currentLinkId != null && (wantsWireless || currentIsWireless)) {
            this._tj_connecting_wireless = true;
            removeLink(this.graph, currentLinkId);
            this._tj_connecting_wireless = false;
        }
        this._tj_connecting_wireless = true;
        sourceInfo.node.connect(sourceInfo.slot, this, 0);
        window.TJ_NODE_markWirelessLink?.(this.graph, this, 0, normalizedValue);
        this._tj_connecting_wireless = false;
        input.type = sourceInfo.node.outputs?.[sourceInfo.slot]?.type || "STRING";
        app.canvas?.setDirty(true, true);
    };

    const origCb = getW.callback;
    getW.callback = function(v) {
        origCb?.call(this, v);
        if (isSeparator(v)) { getW.value = getW._tj_previous_value || getW.value || "(none)"; return; }
        getW._tj_previous_value = v;
        node._tjPromptStudioConnectGet?.(v);
    };

    requestAnimationFrame(() => { refreshProviderValues(); node._tjPromptStudioUpdateGetOptions?.(); if (getW.value) node._tjPromptStudioConnectGet?.(getW.value); });
    setTimeout(() => { refreshProviderValues(); node._tjPromptStudioUpdateGetOptions?.(); if (getW.value) node._tjPromptStudioConnectGet?.(getW.value); }, 160);
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
    moveWidgetToTop(node, "get_name", 0);
    moveWidgetToTop(node, "set_name", 1);
    moveWidgetToTop(node, "mode", 2);
    attachSetSync(node);
    attachEmbeddedGet(node);
    attachCallbacks(node);
    installAdvancedToggle(node);
    updateStudioVisibility(node);
}

app.registerExtension({
    name: "TJ.PromptStudio",
    async beforeRegisterNodeDef(nodeType, nodeData, _app) {
        if (nodeData.name !== "TJ_PromptStudio") return;

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
            };
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            origOnConfigure?.apply(this, arguments);
            requestAnimationFrame(() => {
                installStudio(this);
                this._tjPromptStudioUpdateGetOptions?.();
                const w = getWidget(this, "get_name");
                if (w?.value) this._tjPromptStudioConnectGet?.(w.value);
            });
        };

        const origOnDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            this._tjPromptStudioUpdateGetOptions?.();
            updateStudioVisibility(this);
            origOnDrawForeground?.apply(this, arguments);
        };
    }
});
