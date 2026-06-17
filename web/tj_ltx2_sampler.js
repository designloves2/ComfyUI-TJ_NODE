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
    const getW = node.widgets?.find(w => w.name === widgetName);
    if (!getW || !node.inputs?.[inputIndex] || getW._tj_get_attached) return;

    getW._tj_get_attached = true;
    getW.options = { ...(getW.options || {}), values: getProviderValues(node.graph) };

    node._tjUpdateGetOptions = function() {
        const w = this.widgets?.find(x => x.name === widgetName);
        if (!w) return;
        const values = getProviderValues(this.graph);
        w.options = { ...(w.options || {}), values };
        if (w.value && w.value !== "(none)" && !values.includes(w.value)) {
            w.value = "(none)";
            this._tjConnectGet?.("(none)");
        } else {
            const label = labelName(this.graph, w.value);
            if (this.inputs?.[inputIndex]) this.inputs[inputIndex].label = label ? `◀ ${label}` : "";
        }
    };

    node._tjConnectGet = function(value) {
        if (!this.graph || !this.inputs?.[inputIndex]) return;
        if (isSeparator(value)) value = "(none)";

        const input = this.inputs[inputIndex];
        const wantsWireless = !!(value && value !== "(none)" && !isSeparator(value));
        const currentLinkId = input.link;
        const currentIsWireless = isWireless(this.graph, currentLinkId);

        if (currentLinkId != null && (wantsWireless || currentIsWireless)) {
            this._tj_connecting_wireless = true;
            removeLink(this.graph, currentLinkId);
            this._tj_connecting_wireless = false;
        }

        if (!wantsWireless) {
            input.name = inputName;
            input.label = "";
            if (currentLinkId == null || currentIsWireless) input.type = opts.defaultType || input.type || "*";
            app.canvas?.setDirty(true, true);
            return;
        }

        const sourceInfo = findSource(this.graph, value);
        const normalizedValue = sourceInfo?.displayName || value;
        const w = this.widgets?.find(x => x.name === widgetName);
        if (w && w.value !== normalizedValue) w.value = normalizedValue;
        input.name = inputName;
        input.label = `◀ ${labelName(this.graph, normalizedValue)}`;

        if (sourceInfo?.node && sourceInfo.slot != null && sourceInfo.node.outputs?.[sourceInfo.slot]) {
            this._tj_connecting_wireless = true;
            sourceInfo.node.connect(sourceInfo.slot, this, inputIndex);
            if (window.TJ_NODE_markWirelessLink) window.TJ_NODE_markWirelessLink(this.graph, this, inputIndex, normalizedValue);
            this._tj_connecting_wireless = false;
            input.type = sourceInfo.node.outputs?.[sourceInfo.slot]?.type || opts.defaultType || "*";
        }
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
        node._tjConnectGet?.(v);
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
                    if (window.TJ_NODE_scheduleWirelessRepair) window.TJ_NODE_scheduleWirelessRepair(this.graph, 80);
                } else if (w && w.value !== "(none)") {
                    w.value = "(none)";
                    this.inputs[inputIndex].label = "";
                }
            }
            app.canvas?.setDirty(true, true);
        }
    };

    requestAnimationFrame(() => {
        node._tjUpdateGetOptions?.();
        node._tjConnectGet?.(getW.value);
    });
}

function updateAutoSets(node, prefix = "") {
    if (!node) return;
    if (!node.properties) node.properties = {};
    const autoW = node.widgets?.find(w => w.name === "auto_set");
    const setW = node.widgets?.find(w => w.name === "setnode_name" || w.name === "set_name");
    const enabled = !!autoW?.value;
    if (!enabled) {
        node.properties.auto_sets = {};
    } else {
        const base = String(setW?.value || prefix || node.title || node.type || "TJ").trim();
        const autoSets = {};
        (node.outputs || []).forEach((out, idx) => {
            if (!out) return;
            const nm = String(out.name || `OUT_${idx + 1}`).trim();
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
        autoW.callback = function(v) { if (orig) orig.call(this, v); updateAutoSets(node); };
    }
    if (setW && !setW._tj_auto_name_attached) {
        setW._tj_auto_name_attached = true;
        const orig = setW.callback;
        setW.callback = function(v) { if (orig) orig.call(this, v); updateAutoSets(node); };
    }
    requestAnimationFrame(() => updateAutoSets(node));
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

app.registerExtension({
    name: "TJ.LTX2Sampler",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "TJ_LTX2Sampler") return;

        function applySigmaVisibility(node) {
            const sigmasInput = node.inputs?.find(s => s.name === "sigmas");
            hideWidget(node, "manual_sigmas", !!(sigmasInput && sigmasInput.link != null));
        }

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
            window.TJ_NODE_applyTheme(this);
            applySigmaVisibility(this);
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            requestAnimationFrame(() => {
                window.TJ_NODE_applyTheme(this);
                applySigmaVisibility(this);
            });
        };

        const origConn = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function(type, index, connected) {
            if (origConn) origConn.apply(this, arguments);
            applySigmaVisibility(this);
            app.canvas?.setDirty(true, true);
        };
    }
});
