import { app } from "../../scripts/app.js";

function tjShowAnyApplyTheme(node) {
    if (window.TJ_NODE_applyTheme) return window.TJ_NODE_applyTheme(node);
    node.bgcolor = "#000000";
    node.color = "#7612DA";
    node.title_text_color = "#FFFFFF";
}

function tjShowAnyAttachSetSync(node) {
    if (window.TJ_NODE_attachProviderNameSync) return window.TJ_NODE_attachProviderNameSync(node);
}

function tjShowAnyValues(graph) {
    if (window.TJ_NODE_getAllSetNames) return window.TJ_NODE_getAllSetNames(graph);
    return ["(none)"];
}

function tjShowAnyIsSeparator(value) {
    return !!(value && window.TJ_NODE_PROVIDER_SEPARATOR && value === window.TJ_NODE_PROVIDER_SEPARATOR);
}

function tjShowAnyLabel(graph, value) {
    if (window.TJ_NODE_getProviderLabelName) return window.TJ_NODE_getProviderLabelName(graph, value);
    return value && value !== "(none)" ? String(value) : "";
}

function tjShowAnyFindSource(graph, value) {
    if (window.TJ_NODE_findSetterSourceInfo) return window.TJ_NODE_findSetterSourceInfo(graph, value);
    return null;
}

function tjShowAnyGraphLink(graph, linkId) {
    if (!graph || linkId == null) return null;
    return graph.links?.[linkId] || graph.links?.get?.(linkId) || null;
}

function tjShowAnyIsWireless(graph, linkId) {
    const link = tjShowAnyGraphLink(graph, linkId);
    return !!(link && (link._tj_wireless || link._tj_provider_value));
}

function tjShowAnyRemoveLink(graph, linkId) {
    if (!graph || linkId == null) return;
    try { graph.removeLink(linkId); } catch (_) {}
}

function tjShowAnyAttachEmbeddedGet(node) {
    if (!node || node._tj_show_any_get_attached) return;
    const getW = node.widgets?.find(w => w.name === "get_name");
    if (!getW || !node.inputs?.[0]) return;

    node._tj_show_any_get_attached = true;

    const refreshProviderValues = () => {
        const values = tjShowAnyValues(node.graph);
        const next = Array.isArray(values) ? [...values] : ["(none)"];
        if (getW.value && getW.value !== "(none)" && !next.includes(getW.value)) {
            next.push(getW.value);
        }
        getW.options = { ...(getW.options || {}), values: next };
        return next;
    };

    refreshProviderValues();

    node._tjShowAnyUpdateGetOptions = function() {
        const w = this.widgets?.find(x => x.name === "get_name");
        if (!w) return;
        const values = refreshProviderValues();
        if (w.value && w.value !== "(none)" && !values.includes(w.value)) {
            w.options = { ...(w.options || {}), values: [...values, w.value] };
        }
        const label = tjShowAnyLabel(this.graph, w.value);
        if (this.inputs?.[0]) this.inputs[0].label = label ? `◀ ${label}` : "";
    };

    node._tjShowAnyConnectGet = function(value) {
        if (!this.graph || !this.inputs?.[0]) return;
        if (tjShowAnyIsSeparator(value)) value = "(none)";

        const input = this.inputs[0];
        const wantsWireless = !!(value && value !== "(none)" && !tjShowAnyIsSeparator(value));
        const currentLinkId = input.link;
        const currentIsWireless = tjShowAnyIsWireless(this.graph, currentLinkId);

        if (!wantsWireless) {
            input.name = "any";
            input.label = "";
            if (currentLinkId == null || currentIsWireless) input.type = "*";
            if (this.outputs?.[0]) this.outputs[0].type = "*";
            app.canvas?.setDirty(true, true);
            return;
        }

        const sourceInfo = tjShowAnyFindSource(this.graph, value);
        const normalizedValue = sourceInfo?.displayName || value;
        const w = this.widgets?.find(x => x.name === "get_name");
        if (w && w.value !== normalizedValue) w.value = normalizedValue;

        input.name = "any";
        input.label = `◀ ${tjShowAnyLabel(this.graph, normalizedValue) || normalizedValue}`;

        // Critical: provider scan can be temporarily empty during refresh/delete/reload.
        // Never remove the existing fake-wire until a real replacement source is found.
        if (!(sourceInfo?.node && sourceInfo.slot != null && sourceInfo.node.outputs?.[sourceInfo.slot])) {
            if (window.TJ_NODE_scheduleWirelessRepair) {
                window.TJ_NODE_scheduleWirelessRepair(this.graph, 80);
                window.TJ_NODE_scheduleWirelessRepair(this.graph, 300);
                window.TJ_NODE_scheduleWirelessRepair(this.graph, 900);
            }
            app.canvas?.setDirty(true, true);
            return;
        }

        if (currentLinkId != null && (wantsWireless || currentIsWireless)) {
            this._tj_connecting_wireless = true;
            tjShowAnyRemoveLink(this.graph, currentLinkId);
            this._tj_connecting_wireless = false;
        }

        this._tj_connecting_wireless = true;
        sourceInfo.node.connect(sourceInfo.slot, this, 0);
        if (window.TJ_NODE_markWirelessLink) window.TJ_NODE_markWirelessLink(this.graph, this, 0, normalizedValue);
        this._tj_connecting_wireless = false;
        const t = sourceInfo.node.outputs?.[sourceInfo.slot]?.type || "*";
        input.type = t;
        if (this.outputs?.[0]) this.outputs[0].type = t;
        app.canvas?.setDirty(true, true);
    };

    const origCb = getW.callback;
    getW.callback = function(v) {
        if (origCb) origCb.call(this, v);
        if (tjShowAnyIsSeparator(v)) {
            // Separator clicks are not a real provider change. Keep the current saved value.
            getW.value = getW._tj_previous_value || getW.value || "(none)";
            return;
        }
        getW._tj_previous_value = v;
        node._tjShowAnyConnectGet?.(v);
    };

    const origConn = node.onConnectionsChange;
    node.onConnectionsChange = function(type, index, connected) {
        if (origConn) origConn.apply(this, arguments);
        if (type === LiteGraph.INPUT && index === 0) {
            if (!connected && !this._tj_connecting_wireless) {
                const w = this.widgets?.find(x => x.name === "get_name");
                const selected = w?.value;
                const provider = selected && selected !== "(none)" && window.TJ_NODE_findProviderByValue
                    ? window.TJ_NODE_findProviderByValue(this.graph, selected)
                    : null;
                if (selected && selected !== "(none)") {
                    // Do not reset get_name on transient provider loss. Keep the selected value
                    // and let the global wireless repair reconnect when providers settle.
                    this.inputs[0].label = `◀ ${tjShowAnyLabel(this.graph, selected) || selected}`;
                    if (window.TJ_NODE_scheduleWirelessRepair) {
                        window.TJ_NODE_scheduleWirelessRepair(this.graph, 80);
                        window.TJ_NODE_scheduleWirelessRepair(this.graph, 300);
                        window.TJ_NODE_scheduleWirelessRepair(this.graph, 900);
                    }
                }
            }
            app.canvas?.setDirty(true, true);
        }
    };

    requestAnimationFrame(() => {
        refreshProviderValues();
        node._tjShowAnyUpdateGetOptions?.();
        node._tjShowAnyConnectGet?.(getW.value);
    });
    setTimeout(() => {
        refreshProviderValues();
        node._tjShowAnyUpdateGetOptions?.();
        node._tjShowAnyConnectGet?.(getW.value);
    }, 140);
}


function tjShowAnyInnerWidth(node, fallback = 360) {
    const w = Number(node?.size?.[0] || fallback);
    return Math.max(120, w - 20);
}

function tjShowAnySyncCopyRow(node) {
    const row = node?._tj_show_any_copy_row;
    if (!row?.style) return;
    const inner = tjShowAnyInnerWidth(node);
    row.style.width = `${inner}px`;
    row.style.maxWidth = `${inner}px`;
    row.style.boxSizing = "border-box";
}

function tjShowAnySetText(node, text) {
    const value = text == null ? "" : String(text);
    if (!node.properties) node.properties = {};
    node.properties.tj_show_any_last_text = value;

    const textW = node.widgets?.find(w => w.name === "text");
    if (textW) {
        textW.value = value;
        try { if (typeof textW.callback === "function") textW.callback.call(textW, value, node, textW); } catch (_) {}
    }

    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

app.registerExtension({
    name: "TJ.ShowAny",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "TJ_ShowAny") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);

            tjShowAnyApplyTheme(this);
            tjShowAnyAttachSetSync(this);
            tjShowAnyAttachEmbeddedGet(this);

            // Prompt Text 방식 그대로: DOMWidget은 Copy 버튼 한 줄만 추가한다.
            const btnRow = document.createElement("div");
            btnRow.style.cssText = "display:flex;align-items:center;justify-content:flex-end;gap:4px;padding:2px;height:12px;box-sizing:border-box;width:100%;max-width:100%;";
            this._tj_show_any_copy_row = btnRow;

            const btnStyle = "width:72px;height:20px;min-height:20px;max-height:20px;padding:0;background:#0055bb;color:#00efff;border:none;border-radius:3px;cursor:pointer;font-size:10px;font-weight:bold;line-height:20px;box-sizing:border-box;";
            const copyBtn = document.createElement("button");
            copyBtn.textContent = "Copy";
            copyBtn.style.cssText = btnStyle;

            btnRow.appendChild(copyBtn);

            const domWidget = this.addDOMWidget("tj_show_any_copy_tools", "btn", btnRow, { serialize: false, hideOnZoom: false });
            domWidget.computeSize = (width) => {
                tjShowAnySyncCopyRow(this);
                return [width || tjShowAnyInnerWidth(this), 24];
            };

            requestAnimationFrame(() => {
                const textWidget = this.widgets?.find(w => w.name === "text");
                if (textWidget && this.properties?.tj_show_any_last_text) {
                    textWidget.value = this.properties.tj_show_any_last_text;
                }

                copyBtn.onclick = async () => {
                    const w = this.widgets?.find(x => x.name === "text");
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
                        console.warn("[TJ_NODE] Show Any copy failed", err);
                    }
                };
            });
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            requestAnimationFrame(() => {
                tjShowAnyApplyTheme(this);
                tjShowAnyAttachSetSync(this);
                tjShowAnyAttachEmbeddedGet(this);
                tjShowAnySyncCopyRow(this);
                this._tjShowAnyUpdateGetOptions?.();
                const w = this.widgets?.find(x => x.name === "get_name");
                if (w?.value) this._tjShowAnyConnectGet?.(w.value);
                if (this.properties?.tj_show_any_last_text) {
                    const textW = this.widgets?.find(x => x.name === "text");
                    if (textW) textW.value = this.properties.tj_show_any_last_text;
                }
            });
        };

        nodeType.prototype.onExecuted = function(message) {
            const raw = message?.tj_show_any_text || message?.ui?.tj_show_any_text;
            const text = Array.isArray(raw) ? raw.join("\n") : raw;
            tjShowAnySetText(this, text || "");
        };

        const origOnDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            this._tjShowAnyUpdateGetOptions?.();
            tjShowAnySyncCopyRow(this);
            if (origOnDrawForeground) origOnDrawForeground.apply(this, arguments);
        };
    }
});
