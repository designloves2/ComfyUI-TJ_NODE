import { app } from "../../scripts/app.js";

const TJ_SC_TYPES = ["AUTO", "INT", "FLOAT", "STRING", "BOOLEAN", "TENSOR", "LIST", "DICT", "JSON"];
const TJ_SC_SLOT_TYPES = { AUTO: "*", INT: "INT", FLOAT: "FLOAT", STRING: "STRING", BOOLEAN: "BOOLEAN", TENSOR: "TENSOR", LIST: "LIST", DICT: "DICT", JSON: "STRING" };

function applyTheme(node) {
    if (window.TJ_NODE_applyTheme) return window.TJ_NODE_applyTheme(node);
    node.bgcolor = "#000000";
    node.color = "#7612DA";
    node.title_text_color = "#FFFFFF";
}

function attachSetSync(node) {
    if (window.TJ_NODE_attachProviderNameSync) return window.TJ_NODE_attachProviderNameSync(node);
}

function values(graph) {
    if (window.TJ_NODE_getAllSetNames) return window.TJ_NODE_getAllSetNames(graph);
    return ["(none)"];
}

function isSeparator(value) {
    return !!(value && window.TJ_NODE_PROVIDER_SEPARATOR && value === window.TJ_NODE_PROVIDER_SEPARATOR);
}

function label(graph, value) {
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

function canConnect(outType, inputType) {
    if (!inputType || inputType === "*" || outType === "*") return true;
    if (String(inputType) === String(outType)) return true;
    if (outType === "STRING" && inputType === "JSON") return true;
    if (outType === "JSON" && inputType === "STRING") return true;
    return false;
}

function disconnectBadLinks(node, outType) {
    const out = node.outputs?.[0];
    const graph = node.graph || app.graph;
    if (!out || !graph || !Array.isArray(out.links)) return;
    for (const linkId of [...out.links]) {
        const link = graphLink(graph, linkId);
        if (!link) continue;
        const target = graph.getNodeById?.(link.target_id);
        const input = target?.inputs?.[link.target_slot];
        if (!canConnect(outType, input?.type)) {
            console.warn(`[TJ_NODE Smart Converter] disconnected incompatible output link: ${outType} -> ${input?.type}`);
            removeLink(graph, linkId);
        }
    }
}

function updateOutputType(node, opts = {}) {
    const w = node.widgets?.find(x => x.name === "output_type");
    const selected = TJ_SC_TYPES.includes(w?.value) ? w.value : "AUTO";
    const slotType = TJ_SC_SLOT_TYPES[selected] || "*";
    if (node.outputs?.[0]) {
        node.outputs[0].name = selected === "AUTO" ? "output" : selected.toLowerCase();
        node.outputs[0].type = slotType;
    }
    if (node.outputs?.[1]) {
        node.outputs[1].name = "status";
        node.outputs[1].type = "STRING";
    }
    if (!opts.skipDisconnect) disconnectBadLinks(node, slotType);
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

function attachEmbeddedGet(node) {
    if (!node || node._tj_smart_converter_get_attached) return;
    const getW = node.widgets?.find(w => w.name === "get_name");
    if (!getW || !node.inputs?.[0]) return;

    node._tj_smart_converter_get_attached = true;
    getW.options = { ...(getW.options || {}), values: values(node.graph) };

    node._tjSmartConverterUpdateGetOptions = function() {
        const w = this.widgets?.find(x => x.name === "get_name");
        if (!w) return;
        const vals = values(this.graph);
        w.options = { ...(w.options || {}), values: vals };
        if (w.value && w.value !== "(none)" && !vals.includes(w.value)) {
            w.value = "(none)";
            this._tjSmartConverterConnectGet?.("(none)");
        } else {
            const lab = label(this.graph, w.value);
            if (this.inputs?.[0]) this.inputs[0].label = lab ? `◀ ${lab}` : "";
        }
    };

    node._tjSmartConverterConnectGet = function(value) {
        if (!this.graph || !this.inputs?.[0]) return;
        if (isSeparator(value)) value = "(none)";
        const input = this.inputs[0];
        const wantsWireless = !!(value && value !== "(none)" && !isSeparator(value));
        const currentLinkId = input.link;
        const currentIsWireless = isWireless(this.graph, currentLinkId);

        if (currentLinkId != null && (wantsWireless || currentIsWireless)) {
            this._tj_connecting_wireless = true;
            removeLink(this.graph, currentLinkId);
            this._tj_connecting_wireless = false;
        }

        if (!wantsWireless) {
            input.name = "any";
            input.label = "";
            if (currentLinkId == null || currentIsWireless) input.type = "*";
            updateOutputType(this, { skipDisconnect: true });
            app.canvas?.setDirty(true, true);
            return;
        }

        const sourceInfo = findSource(this.graph, value);
        const normalizedValue = sourceInfo?.displayName || value;
        const w = this.widgets?.find(x => x.name === "get_name");
        if (w && w.value !== normalizedValue) w.value = normalizedValue;
        input.name = "any";
        input.label = `◀ ${label(this.graph, normalizedValue)}`;

        if (sourceInfo?.node && sourceInfo.slot != null && sourceInfo.node.outputs?.[sourceInfo.slot]) {
            this._tj_connecting_wireless = true;
            sourceInfo.node.connect(sourceInfo.slot, this, 0);
            if (window.TJ_NODE_markWirelessLink) window.TJ_NODE_markWirelessLink(this.graph, this, 0, normalizedValue);
            this._tj_connecting_wireless = false;
            input.type = sourceInfo.node.outputs?.[sourceInfo.slot]?.type || "*";
        }
        updateOutputType(this, { skipDisconnect: true });
        app.canvas?.setDirty(true, true);
    };

    const origCb = getW.callback;
    getW.callback = function(v) {
        if (origCb) origCb.call(this, v);
        if (isSeparator(v)) {
            getW.value = getW._tj_previous_value || "(none)";
            return;
        }
        getW._tj_previous_value = v;
        node._tjSmartConverterConnectGet?.(v);
    };

    const origConn = node.onConnectionsChange;
    node.onConnectionsChange = function(type, index, connected) {
        if (origConn) origConn.apply(this, arguments);
        if (type === LiteGraph.INPUT && index === 0) {
            if (!connected && !this._tj_connecting_wireless) {
                const w = this.widgets?.find(x => x.name === "get_name");
                const selected = w?.value;
                const provider = selected && selected !== "(none)" && window.TJ_NODE_findProviderByValue ? window.TJ_NODE_findProviderByValue(this.graph, selected) : null;
                if (provider) {
                    if (window.TJ_NODE_scheduleWirelessRepair) window.TJ_NODE_scheduleWirelessRepair(this.graph, 80);
                } else if (w && w.value !== "(none)") {
                    w.value = "(none)";
                    this.inputs[0].label = "";
                }
            }
            app.canvas?.setDirty(true, true);
        }
        if (type === LiteGraph.OUTPUT && index === 0) updateOutputType(this);
    };

    requestAnimationFrame(() => {
        node._tjSmartConverterUpdateGetOptions?.();
        node._tjSmartConverterConnectGet?.(getW.value);
        updateOutputType(node, { skipDisconnect: true });
    });
}

app.registerExtension({
    name: "TJ.SmartConverter",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "TJ_SmartConverter") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
            applyTheme(this);
            attachSetSync(this);
            attachEmbeddedGet(this);

            const node = this;
            const outputW = this.widgets?.find(w => w.name === "output_type");
            if (outputW && !outputW._tj_smart_converter_attached) {
                outputW._tj_smart_converter_attached = true;
                const origCb = outputW.callback;
                outputW.callback = function(v) {
                    if (origCb) origCb.call(this, v);
                    updateOutputType(node, { skipDisconnect: false });
                };
            }
            requestAnimationFrame(() => updateOutputType(this, { skipDisconnect: true }));
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            requestAnimationFrame(() => {
                applyTheme(this);
                attachSetSync(this);
                attachEmbeddedGet(this);
                this._tjSmartConverterUpdateGetOptions?.();
                const w = this.widgets?.find(x => x.name === "get_name");
                if (w?.value) this._tjSmartConverterConnectGet?.(w.value);
                updateOutputType(this, { skipDisconnect: true });
            });
        };

        nodeType.prototype.onExecuted = function(message) {
            const status = message?.tj_smart_converter_status || message?.ui?.tj_smart_converter_status;
            if (status) console.log(`[TJ_NODE Smart Converter] ${Array.isArray(status) ? status[0] : status}`);
            const actualType = message?.tj_smart_converter_type || message?.ui?.tj_smart_converter_type;
            const typeValue = Array.isArray(actualType) ? actualType[0] : actualType;
            if (typeValue) {
                const w = this.widgets?.find(x => x.name === "output_type");
                if (w?.value === "AUTO" && this.outputs?.[0]) {
                    const slotType = TJ_SC_SLOT_TYPES[typeValue] || "*";
                    this.outputs[0].name = String(typeValue).toLowerCase();
                    this.outputs[0].type = slotType;
                }
            }
            app.canvas?.setDirty(true, true);
        };

        const origOnDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            this._tjSmartConverterUpdateGetOptions?.();
            updateOutputType(this, { skipDisconnect: true });
            if (origOnDrawForeground) origOnDrawForeground.apply(this, arguments);
        };
    }
});
