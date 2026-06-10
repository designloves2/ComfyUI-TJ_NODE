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

function moveWidgetToTop(node, name, index = 0) {
    if (!node?.widgets) return;
    const idx = node.widgets.findIndex(w => w?.name === name);
    if (idx < 0 || idx === index) return;
    const [w] = node.widgets.splice(idx, 1);
    node.widgets.splice(Math.max(0, Math.min(index, node.widgets.length)), 0, w);
}

function graphLink(graph, linkId) {
    if (!graph || linkId == null) return null;
    return graph.links?.[linkId] || graph.links?.get?.(linkId) || null;
}

function isWireless(graph, linkId) {
    const link = graphLink(graph, linkId);
    return !!(link && (link._tj_wireless || link._tj_provider_value));
}

function providerValues(graph) {
    if (window.TJ_NODE_getAllSetNames) return window.TJ_NODE_getAllSetNames(graph);
    return ["(none)"];
}

function isSeparator(value) {
    return !!(value && window.TJ_NODE_PROVIDER_SEPARATOR && value === window.TJ_NODE_PROVIDER_SEPARATOR);
}

function providerLabel(graph, value) {
    if (window.TJ_NODE_getProviderLabelName) return window.TJ_NODE_getProviderLabelName(graph, value);
    return value && value !== "(none)" ? String(value).replace(/^TJ\s*\/\s*/, "") : "";
}

function findProvider(graph, value) {
    if (window.TJ_NODE_findProviderByValue) return window.TJ_NODE_findProviderByValue(graph, value);
    return null;
}

function findSource(graph, value) {
    if (window.TJ_NODE_findSetterSourceInfo) return window.TJ_NODE_findSetterSourceInfo(graph, value);
    return null;
}

function removeLink(graph, linkId) {
    if (!graph || linkId == null) return;
    try { graph.removeLink(linkId); } catch (_) {}
}

function attachEmbeddedGet(node, opts = {}) {
    if (!node || node._tj_llm_get_attached) return;
    const widgetName = opts.widgetName || "get_name";
    const inputIndex = opts.inputIndex ?? 0;
    const inputName = opts.inputName || node.inputs?.[inputIndex]?.name || "input";
    const defaultType = opts.defaultType || "STRING";
    const getW = node.widgets?.find(w => w.name === widgetName);
    if (!getW || !node.inputs?.[inputIndex]) return;

    node._tj_llm_get_attached = true;

    const refreshProviderValues = () => {
        const values = providerValues(node.graph);
        const next = Array.isArray(values) ? [...values] : ["(none)"];
        if (getW.value && getW.value !== "(none)" && !next.includes(getW.value)) next.push(getW.value);
        getW.options = { ...(getW.options || {}), values: next };
        return next;
    };

    node._tjLLMUpdateGetOptions = function() {
        const w = this.widgets?.find(x => x.name === widgetName);
        if (!w) return;
        const values = refreshProviderValues();
        if (w.value && w.value !== "(none)" && !values.includes(w.value)) {
            w.options = { ...(w.options || {}), values: [...values, w.value] };
        }
        const label = providerLabel(this.graph, w.value);
        if (this.inputs?.[inputIndex]) this.inputs[inputIndex].label = label ? `◀ ${label}` : "";
    };

    node._tjLLMConnectGet = function(value) {
        if (!this.graph || !this.inputs?.[inputIndex]) return;
        if (isSeparator(value)) value = "(none)";

        const input = this.inputs[inputIndex];
        const wantsWireless = !!(value && value !== "(none)" && !isSeparator(value));
        const currentLinkId = input.link;
        const currentIsWireless = isWireless(this.graph, currentLinkId);

        if (!wantsWireless) {
            // Explicit none must fully disconnect the embedded GET link.
            // Older builds could leave a real visible wire behind; remove any current link,
            // wireless or not, because this slot is owned by get_name.
            if (currentLinkId != null) {
                this._tj_connecting_wireless = true;
                try { removeLink(this.graph, currentLinkId); }
                finally { this._tj_connecting_wireless = false; }
                input.link = null;
            }
            input.name = inputName;
            input.label = "";
            input.type = defaultType;
            app.canvas?.setDirty(true, true);
            return;
        }

        // Core-native reconnect is preferred. It preserves TJ fake-wire lifecycle.
        if (window.TJ_NODE_forceReconnectConsumer) {
            const provider = findProvider(this.graph, value);
            if (!provider) {
                input.name = inputName;
                input.label = `◀ ${providerLabel(this.graph, value) || value}`;
                window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 80);
                window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 300);
                app.canvas?.setDirty(true, true);
                return;
            }
            window.TJ_NODE_forceReconnectConsumer(this, value, inputIndex);
            input.name = inputName;
            input.label = `◀ ${providerLabel(this.graph, value) || value}`;
            app.canvas?.setDirty(true, true);
            return;
        }

        const sourceInfo = findSource(this.graph, value);
        const normalizedValue = sourceInfo?.displayName || value;
        const w = this.widgets?.find(x => x.name === widgetName);
        if (w && w.value !== normalizedValue) w.value = normalizedValue;
        input.name = inputName;
        input.label = `◀ ${providerLabel(this.graph, normalizedValue) || normalizedValue}`;

        // Never remove existing fake-wire until a replacement source really exists.
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
        sourceInfo.node.connect(sourceInfo.slot, this, inputIndex);
        window.TJ_NODE_markWirelessLink?.(this.graph, this, inputIndex, normalizedValue);
        this._tj_connecting_wireless = false;
        input.type = sourceInfo.node.outputs?.[sourceInfo.slot]?.type || defaultType;
        app.canvas?.setDirty(true, true);
    };

    const origCb = getW.callback;
    getW.callback = function(v) {
        origCb?.call(this, v);
        if (isSeparator(v)) {
            getW.value = getW._tj_previous_value || getW.value || "(none)";
            return;
        }
        getW._tj_previous_value = v;
        node._tjLLMConnectGet?.(v);
    };

    const origConn = node.onConnectionsChange;
    node.onConnectionsChange = function(type, index, connected) {
        origConn?.apply(this, arguments);
        if (type === LiteGraph.INPUT && index === inputIndex) {
            if (!connected && !this._tj_connecting_wireless) {
                const w = this.widgets?.find(x => x.name === widgetName);
                const selected = w?.value;
                if (selected && selected !== "(none)") {
                    this.inputs[inputIndex].label = `◀ ${providerLabel(this.graph, selected) || selected}`;
                    window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 80);
                    window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 300);
                }
            }
            app.canvas?.setDirty(true, true);
        }
    };

    requestAnimationFrame(() => {
        refreshProviderValues();
        node._tjLLMUpdateGetOptions?.();
        if (getW.value) node._tjLLMConnectGet?.(getW.value);
    });
    setTimeout(() => {
        refreshProviderValues();
        node._tjLLMUpdateGetOptions?.();
        if (getW.value) node._tjLLMConnectGet?.(getW.value);
    }, 160);
}

function getWidget(node, name) {
    return node.widgets?.find(w => w.name === name);
}

function setWidgetVisible(widget, visible) {
    if (!widget) return;
    if (!widget._tj_llm_saved) widget._tj_llm_saved = { type: widget.type, computeSize: widget.computeSize };
    widget.type = visible ? widget._tj_llm_saved.type : "hidden";
    widget.computeSize = visible ? widget._tj_llm_saved.computeSize : () => [0, -4];
    widget.disabled = !visible;
    widget.hidden = !visible;
}

function getInputSlot(node, name) {
    return node?.inputs?.find(i => (i?.widget?.name || i?.name) === name) || null;
}

function isInputConnected(node, name) {
    const input = getInputSlot(node, name);
    return !!(input && input.link != null);
}

function setWidgetValueSilent(widget, value) {
    if (widget && widget.value !== value) widget.value = value;
}

function getEffectiveBackend(node) {
    const clipConnected = isInputConnected(node, "clip");
    const backendW = getWidget(node, "model_backend");
    if (clipConnected && backendW && backendW.value !== "ComfyUI TextGenerate") {
        setWidgetValueSilent(backendW, "ComfyUI TextGenerate");
    }
    return String(backendW?.value || "GGUF / llama.cpp");
}

function getEffectiveStudioMode(node) {
    const mode = String(getWidget(node, "mode")?.value || "Prompt Enhancer");
    if (node.type !== "TJ_PromptStudio") return node.type === "TJ_ImageToPrompt" ? "Image to Prompt" : "Prompt Enhancer";
    if (mode !== "Auto") return mode;
    return isInputConnected(node, "image") ? "Image to Prompt" : "Prompt Enhancer";
}

function advancedWidgetsFor(node) {
    if (node.type === "TJ_ImageToPrompt") {
        return ["custom_instruction", "n_gpu_layers", "n_ctx", "max_tokens", "temperature"];
    }
    if (node.type === "TJ_PromptEnhancer") {
        return ["extra_instructions", "system_prompt_override", "append_no_think", "n_gpu_layers", "n_ctx", "max_tokens", "temperature", "top_p", "repeat_penalty"];
    }
    if (node.type === "TJ_PromptStudio") {
        return ["extra_instructions", "system_prompt_override", "custom_instruction", "append_no_think", "n_gpu_layers", "n_ctx", "max_tokens", "temperature", "top_p", "repeat_penalty"];
    }
    return [];
}

function setManyVisible(node, names, visible) {
    for (const name of names) setWidgetVisible(getWidget(node, name), visible);
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
            console.warn("[TJ_NODE] LLM resize skipped", err);
        }
    });
}

function layoutSignature(node) {
    return [
        node?.type || "",
        String(!!node?.properties?.tj_llm_advanced),
        String(getWidget(node, "model_backend")?.value || ""),
        getEffectiveStudioMode(node),
        String(isInputConnected(node, "clip")),
        String(isInputConnected(node, "image")),
    ].join("|");
}

function updateLLMVisibility(node) {
    const backend = getEffectiveBackend(node);
    const isGGUF = backend === "GGUF / llama.cpp";
    const advanced = !!node.properties?.tj_llm_advanced;
    const effectiveMode = getEffectiveStudioMode(node);
    const isImageMode = effectiveMode === "Image to Prompt";
    const isEnhanceMode = effectiveMode === "Prompt Enhancer";

    // Backend widgets.
    setWidgetVisible(getWidget(node, "gguf_model"), isGGUF);
    setWidgetVisible(getWidget(node, "mmproj_file"), isGGUF);
    setWidgetVisible(getWidget(node, "chat_handler"), isGGUF && (node.type === "TJ_ImageToPrompt" || isImageMode));
    setWidgetVisible(getWidget(node, "text_encoder_name"), !isGGUF);
    setWidgetVisible(getWidget(node, "clip_loader_type"), !isGGUF);

    // Studio mode-specific widgets. Existing standalone nodes keep their own layout.
    if (node.type === "TJ_PromptStudio") {
        setWidgetVisible(getWidget(node, "raw_prompt"), isEnhanceMode);
        setWidgetVisible(getWidget(node, "purpose"), isEnhanceMode);
        setWidgetVisible(getWidget(node, "vision_task"), isImageMode);
    }

    // Standalone node mode-specific widgets.
    if (node.type === "TJ_PromptEnhancer") {
        setWidgetVisible(getWidget(node, "purpose"), true);
        setWidgetVisible(getWidget(node, "vision_task"), false);
        setWidgetVisible(getWidget(node, "custom_instruction"), false);
    }
    if (node.type === "TJ_ImageToPrompt") {
        setWidgetVisible(getWidget(node, "purpose"), false);
        setWidgetVisible(getWidget(node, "vision_task"), true);
        setWidgetVisible(getWidget(node, "extra_instructions"), false);
        setWidgetVisible(getWidget(node, "system_prompt_override"), false);
        setWidgetVisible(getWidget(node, "append_no_think"), false);
        setWidgetVisible(getWidget(node, "top_p"), false);
        setWidgetVisible(getWidget(node, "repeat_penalty"), false);
    }

    // Advanced widgets are always controlled by the Show/Hide button.
    for (const name of advancedWidgetsFor(node)) {
        let visible = advanced;
        if (node.type === "TJ_PromptStudio") {
            if (["extra_instructions", "system_prompt_override", "append_no_think", "top_p", "repeat_penalty"].includes(name)) visible = visible && isEnhanceMode;
            if (name === "custom_instruction") visible = visible && isImageMode;
        }
        if (node.type === "TJ_PromptEnhancer" && name === "custom_instruction") visible = false;
        if (node.type === "TJ_ImageToPrompt" && ["extra_instructions", "system_prompt_override", "append_no_think", "top_p", "repeat_penalty"].includes(name)) visible = false;
        setWidgetVisible(getWidget(node, name), visible);
    }

    if (node._tj_llm_advanced_btn) {
        node._tj_llm_advanced_btn.textContent = advanced ? "Hide advanced settings" : "Show advanced settings";
    }

    const sig = layoutSignature(node);
    if (node._tj_llm_last_layout_signature !== sig) {
        node._tj_llm_last_layout_signature = sig;
        scheduleFitNodeHeightKeepWidth(node);
    }
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

function installAdvancedToggle(node) {
    if (node._tj_llm_advanced_toggle_installed) return;
    node._tj_llm_advanced_toggle_installed = true;
    if (!node.properties) node.properties = {};
    if (node.properties.tj_llm_advanced === undefined) node.properties.tj_llm_advanced = false;

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;justify-content:center;padding:2px;height:22px;box-sizing:border-box;width:100%;max-width:100%;";
    const btn = document.createElement("button");
    btn.textContent = "Show advanced settings";
    btn.style.cssText = "width:100%;height:20px;background:#151515;color:#ddd;border:1px solid #555;border-radius:2px;cursor:pointer;font-size:11px;line-height:18px;box-sizing:border-box;";
    row.appendChild(btn);
    node._tj_llm_advanced_btn = btn;

    const widget = node.addDOMWidget("tj_llm_advanced_toggle", "btn", row, { serialize: false, hideOnZoom: false });
    widget.computeSize = (width) => {
        const w = width || innerWidth(node);
        row.style.width = `${w}px`;
        row.style.maxWidth = `${w}px`;
        return [w, 26];
    };

    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        node.properties.tj_llm_advanced = !node.properties.tj_llm_advanced;
        updateLLMVisibility(node);
    };
}

function attachBackendVisibility(node) {
    const backendW = getWidget(node, "model_backend");
    if (backendW && !backendW._tj_llm_backend_attached) {
        backendW._tj_llm_backend_attached = true;
        const orig = backendW.callback;
        backendW.callback = function(v) {
            orig?.call(this, v);
            updateLLMVisibility(node);
        };
    }
    const modeW = getWidget(node, "mode");
    if (modeW && !modeW._tj_llm_mode_attached) {
        modeW._tj_llm_mode_attached = true;
        const orig = modeW.callback;
        modeW.callback = function(v) {
            orig?.call(this, v);
            updateLLMVisibility(node);
        };
    }
    requestAnimationFrame(() => updateLLMVisibility(node));
}

function innerWidth(node, fallback = 360) {
    return Math.max(120, Number(node?.size?.[0] || fallback) - 20);
}

function installPromptLockerUI(node) {
    if (node._tj_locker_ui_installed) return;
    node._tj_locker_ui_installed = true;

    const statusRow = document.createElement("div");
    statusRow.style.cssText = "display:block;padding:3px 6px;min-height:22px;box-sizing:border-box;width:100%;max-width:100%;color:#7612DA;font:bold 10px sans-serif;overflow:visible;white-space:normal;word-break:break-word;line-height:1.35;";
    statusRow.textContent = "🟡 PAUSED — Prompt Show & Locker intentionally stopped text passthrough. Toggle LOCKED IN to continue.";
    node._tj_locker_status_row = statusRow;

    const statusWidget = node.addDOMWidget("tj_locker_status", "div", statusRow, { serialize: false, hideOnZoom: false });
    statusWidget.computeSize = (width) => {
        const w = width || innerWidth(node);
        statusRow.style.width = `${w}px`;
        statusRow.style.maxWidth = `${w}px`;
        const text = statusRow.textContent || "";
        const charsPerLine = Math.max(18, Math.floor((w || 240) / 6.2));
        const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
        return [w, Math.max(24, lines * 14 + 8)];
    };

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;align-items:center;justify-content:flex-end;gap:4px;padding:2px;height:12px;box-sizing:border-box;width:100%;max-width:100%;";
    node._tj_locker_copy_row = btnRow;

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy";
    copyBtn.style.cssText = "width:72px;height:20px;min-height:20px;max-height:20px;padding:0;background:#0055bb;color:#00efff;border:none;border-radius:3px;cursor:pointer;font-size:10px;font-weight:bold;line-height:20px;box-sizing:border-box;";
    btnRow.appendChild(copyBtn);

    const copyWidget = node.addDOMWidget("tj_locker_copy_tools", "btn", btnRow, { serialize: false, hideOnZoom: false });
    copyWidget.computeSize = (width) => {
        const w = width || innerWidth(node);
        btnRow.style.width = `${w}px`;
        btnRow.style.maxWidth = `${w}px`;
        return [w, 24];
    };

    const lockW = getWidget(node, "lock_in_prompt");
    if (lockW && !lockW._tj_locker_status_attached) {
        lockW._tj_locker_status_attached = true;
        const origLockCb = lockW.callback;
        lockW.callback = function(v) {
            origLockCb?.call(this, v);
            setLockerStatus(node, v ? "🟢 LOCKED IN — Text passthrough active." : "🟡 PAUSED — Prompt Show & Locker intentionally stopped text passthrough. Toggle LOCKED IN to continue.");
        };
        setLockerStatus(node, lockW.value ? "🟢 LOCKED IN — Text passthrough active." : "🟡 PAUSED — Prompt Show & Locker intentionally stopped text passthrough. Toggle LOCKED IN to continue.");
    }

    copyBtn.onclick = async () => {
        const w = getWidget(node, "text");
        const value = w?.value || "";
        try {
            await navigator.clipboard.writeText(value);
            const origColor = copyBtn.style.color;
            copyBtn.textContent = "Copied";
            copyBtn.style.color = "#ff4444";
            setTimeout(() => {
                copyBtn.textContent = "Copy";
                copyBtn.style.color = origColor;
            }, 800);
        } catch (err) {
            console.warn("[TJ_NODE] Prompt Show & Locker copy failed", err);
        }
    };
}

function setTextWidget(node, value) {
    const text = value == null ? "" : String(value);
    if (!node.properties) node.properties = {};
    node.properties.tj_locker_last_text = text;
    const w = getWidget(node, "text");
    if (w) {
        w.value = text;
        try { if (typeof w.callback === "function") w.callback.call(w, text, node, w); } catch (_) {}
    }
}

function setLockerStatus(node, value) {
    const text = value == null ? "" : String(value);
    if (!node.properties) node.properties = {};
    node.properties.tj_locker_last_status = text;
    if (node._tj_locker_status_row) {
        node._tj_locker_status_row.textContent = text;
        node._tj_locker_status_row.style.color = text.includes("PAUSED") ? "#7612DA" : "#00efff";
    }
    // Do not auto-fit Prompt Show & Locker after execution/status updates.
    // The user may have manually resized the prompt display area; preserve that height.
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

function installBase(node, config) {
    applyTJTheme(node);
    moveWidgetToTop(node, "get_name", 0);
    moveWidgetToTop(node, "set_name", 1);
    attachSetSync(node);
    attachEmbeddedGet(node, { inputIndex: 0, inputName: config.inputName || "input", defaultType: config.inputType || "STRING" });
    attachBackendVisibility(node);
    if (node.type === "TJ_PromptEnhancer" || node.type === "TJ_ImageToPrompt" || node.type === "TJ_PromptStudio") {
        installAdvancedToggle(node);
        installSeedAfterGenerate(node);
    }
    updateLLMVisibility(node);
    node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "TJ.LLM.Nodes",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        const configs = {
            TJ_PromptEnhancer: { inputName: "raw_prompt_input", inputType: "STRING" },
            TJ_ImageToPrompt: { inputName: "image", inputType: "IMAGE" },
            TJ_PromptShowLocker: { inputName: "text_input", inputType: "STRING" },
        };
        const cfg = configs[nodeData.name];
        if (!cfg) return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            origOnNodeCreated?.apply(this, arguments);
            installBase(this, cfg);
            if (nodeData.name === "TJ_PromptShowLocker") installPromptLockerUI(this);
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
                    updateLLMVisibility(this);
                }
            };
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            origOnConfigure?.apply(this, arguments);
            requestAnimationFrame(() => {
                installBase(this, cfg);
                if (nodeData.name === "TJ_PromptShowLocker") {
                    installPromptLockerUI(this);
                    if (this.properties?.tj_locker_last_text) setTextWidget(this, this.properties.tj_locker_last_text);
                    if (this.properties?.tj_locker_last_status) setLockerStatus(this, this.properties.tj_locker_last_status);
                }
                this._tjLLMUpdateGetOptions?.();
                const w = getWidget(this, "get_name");
                if (w?.value) this._tjLLMConnectGet?.(w.value);
            });
        };

        if (nodeData.name === "TJ_PromptShowLocker") {
            const origOnExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                origOnExecuted?.apply(this, arguments);
                const rawText = message?.tj_prompt_locker_text || message?.ui?.tj_prompt_locker_text;
                const rawStatus = message?.tj_prompt_locker_status || message?.ui?.tj_prompt_locker_status;
                const text = Array.isArray(rawText) ? rawText.join("\n") : rawText;
                const status = Array.isArray(rawStatus) ? rawStatus.join("\n") : rawStatus;
                setTextWidget(this, text || "");
                setLockerStatus(this, status || "");
                app.canvas?.setDirty(true, true);
            };
        }

        const origOnDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            this._tjLLMUpdateGetOptions?.();
            updateLLMVisibility(this);
            if (origOnDrawForeground) origOnDrawForeground.apply(this, arguments);
        };
    }
});
