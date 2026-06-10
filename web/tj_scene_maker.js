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
    const inputIndex = opts.inputIndex ?? 0;
    const inputName = opts.inputName || node.inputs?.[inputIndex]?.name || "input";
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
            removeWirelessInputOnly(this);
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


function tjSceneApplyWidgetLabels(node) {
    const brief = node.widgets?.find(w => w.name === "brief_override");
    if (brief) brief.label = "brief_override";
    const beats = node.widgets?.find(w => w.name === "visual_beat_override");
    if (beats) beats.label = "Visual Beat_override";
}


function tjSceneReorderWidgets(node) {
    const order = [
        "clip_name",
        "get_name",
        "auto_set",
        "mode",
        "translate",
        "shot_count",
        "seed",
        "control_after_generate",
        "idea",
        "style",
        "fixed_elements",
        "brief_override",
        "visual_beat_override",
    ];
    const widgets = node.widgets || [];
    let insert = 0;
    for (const name of order) {
        const idx = widgets.findIndex(w => w.name === name);
        if (idx >= 0) {
            const [w] = widgets.splice(idx, 1);
            widgets.splice(insert, 0, w);
            insert++;
        }
    }
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
    w.computeSize = function(width) { return [width || 0, Math.max(40, Number(node.properties[prop] || defaultH))]; };
}


function findSceneWidget(node, name) {
    return node.widgets?.find((widget) => widget.name === name);
}

function sceneWidgetText(node, name) {
    return String(findSceneWidget(node, name)?.value ?? "").trim();
}

function sceneShorten(value, maxLength = 90) {
    const oneLine = String(value || "").replace(/\s+/g, " ").trim();
    if (!oneLine) return "(empty)";
    return oneLine.length > maxLength ? `${oneLine.slice(0, maxLength - 1)}...` : oneLine;
}

function sceneLineCount(value) {
    return String(value || "").split(/\r?\n/).filter((line) => line.trim()).length;
}

function updateSceneSummary(node) {
    const idea = sceneWidgetText(node, "idea");
    const mode = String(findSceneWidget(node, "mode")?.value ?? "Product Commercial").trim();
    const style = sceneWidgetText(node, "style");
    const fixed = sceneWidgetText(node, "fixed_elements");
    const brief = sceneWidgetText(node, "brief_override");
    const beats = sceneWidgetText(node, "visual_beat_override");
    const shotCount = String(findSceneWidget(node, "shot_count")?.value ?? "").trim();
    const beatOverrideCount = sceneLineCount(beats);
    const briefName = mode === "Product Commercial" ? "Scene brief" : "Reference brief";
    const briefMode = brief ? `OVERRIDE ON: ${briefName} auto analysis is skipped.` : `AUTO: ${briefName} is generated from Input image if connected, otherwise from text inputs.`;
    const beatsMode = beats ? `OVERRIDE ON: Visual Beat generation is skipped. Effective shot count = ${beatOverrideCount || "?"}.` : `AUTO: generating ${shotCount || "?"} Visual Beat lines.`;

    const summary = [
        "INPUT GUIDE",
        `Mode: ${mode}`,
        "Idea: commercial event, transformation, or story hook.",
        "Style: look, tone, camera feeling, lighting, genre.",
        "Fixed: product/character/color/background rules to keep consistent.",
        "",
        "CURRENT INPUTS",
        `Idea: ${sceneShorten(idea)}`,
        `Style: ${sceneShorten(style)}`,
        `Fixed: ${sceneShorten(fixed)}`,
        "",
        "OVERRIDE STATUS",
        `Scene brief: ${briefMode}`,
        `Visual Beat: ${beatsMode}`,
        "",
        "TJ_NODE · brief -> beat -> prompt -> translate",
    ].join("\n");

    const widget = findSceneWidget(node, "input_guide_summary");
    if (widget) widget.value = summary;
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

function clearSceneInputFields(node) {
    const names = ["idea", "style", "fixed_elements", "brief_override", "visual_beat_override"];
    for (const name of names) {
        const widget = findSceneWidget(node, name);
        if (!widget) continue;
        widget.value = "";
        if (widget.inputEl) widget.inputEl.value = "";
        if (widget.element) widget.element.value = "";
        try { widget.callback?.("", node, widget); } catch (_) {}
    }
    updateSceneSummary(node);
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

function copySceneGeneratedToOverride(node, captureKey, overrideName) {
    const value = node[captureKey];
    if (typeof value !== "string" || !value.trim()) {
        console.warn(`[TJ_NODE] Scene Maker: no generated value for ${captureKey}`);
        return;
    }

    const widget = findSceneWidget(node, overrideName);
    if (!widget) {
        console.warn(`[TJ_NODE] Scene Maker: override widget not found: ${overrideName}`);
        return;
    }

    widget.value = value;
    if (widget.inputEl) widget.inputEl.value = value;
    if (widget.element) widget.element.value = value;

    try { widget.callback?.(value, node, widget); } catch (_) {}

    updateSceneSummary(node);
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

function installSceneButtons(node) {
    if (node._tj_scene_buttons_installed) return;
    node._tj_scene_buttons_installed = true;

    const summaryWidget = node.addWidget("customtext", "input_guide_summary", "", () => {}, { serialize: false });
    if (summaryWidget.inputEl) {
        summaryWidget.inputEl.readOnly = true;
        summaryWidget.inputEl.style.opacity = "0.95";
        summaryWidget.inputEl.style.fontSize = "12px";
        summaryWidget.inputEl.style.lineHeight = "1.35";
        summaryWidget.inputEl.style.minHeight = "230px";
        summaryWidget.inputEl.style.border = "1px solid rgba(118,18,218,0.50)";
        summaryWidget.inputEl.style.background = "rgba(5,5,5,0.96)";
        summaryWidget.inputEl.style.color = "rgba(238,238,238,0.96)";
    }

    node.addWidget("button", "Clear and reset the input field", "clear_inputs", () => clearSceneInputFields(node), { serialize: false });
    node.addWidget("button", "reuse brief as override(generated)", "use_brief", () => {
        copySceneGeneratedToOverride(node, "_tjGeneratedBrief", "brief_override");
    }, { serialize: false });
    node.addWidget("button", "reuse Visual Beat as override(generated)", "use_beats", () => {
        copySceneGeneratedToOverride(node, "_tjGeneratedBeats", "visual_beat_override");
    }, { serialize: false });

    updateSceneSummary(node);
}

app.registerExtension({
    name: "TJ.SceneMaker",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "TJ_SceneMaker") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
            applyTJTheme(this);
            attachSetSync(this);
            attachEmbeddedGet(this, { inputIndex: 0, inputName: "input_image", defaultType: "IMAGE" });
            installAutoSet(this);
            tjApplyOutputArrowState(this, tjAutosetEnabled(this));

            tjSceneApplyWidgetLabels(this);
            tjSceneReorderWidgets(this);
            installSceneButtons(this);

            requestAnimationFrame(() => { updateAutoSets(this); updateSceneSummary(this); });
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            requestAnimationFrame(() => {
                applyTJTheme(this);
                attachSetSync(this);
                attachEmbeddedGet(this, { inputIndex: 0, inputName: "input_image", defaultType: "IMAGE" });
                installAutoSet(this);
                tjSceneApplyWidgetLabels(this);
                tjSceneReorderWidgets(this);
                installSceneButtons(this);
                updateAutoSets(this);
                tjApplyOutputArrowState(this, tjAutosetEnabled(this));
                updateSceneSummary(this);
            });
        };

        const origOnExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function(message) {
            if (origOnExecuted) origOnExecuted.apply(this, arguments);
            const text = message?.text || message?.ui?.text;
            if (Array.isArray(text)) {
                // text[1] = generated brief
                // text[3] = generated Visual Beat
                if (typeof text[1] === "string") this._tjGeneratedBrief = text[1];
                if (typeof text[3] === "string") this._tjGeneratedBeats = text[3];
            }
            updateSceneSummary(this);
        };

        const origOnDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            this._tjUpdateGetOptions?.();
            tjApplyOutputArrowState(this, tjAutosetEnabled(this));
            if (origOnDrawForeground) return origOnDrawForeground.apply(this, arguments);
        };
    }
});
