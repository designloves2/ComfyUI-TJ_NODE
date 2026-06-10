import { app } from "../../scripts/app.js";


function tjGetOutputSlot(node, slot) {
    if (!node || slot == null || slot < 0) return null;
    return node.outputs?.[slot] || null;
}

function tjCanConnect(sourceInfo, target, targetSlot) {
    return !!(sourceInfo?.node && target?.inputs?.[targetSlot] && tjGetOutputSlot(sourceInfo.node, sourceInfo.slot));
}

function tjSafeRemoveLink(graph, linkId) {
    if (!graph || linkId == null) return;
    const link = graph.links?.[linkId] || graph.links?.get?.(linkId);
    if (link) graph.removeLink(linkId);
}

function tjGetGraphLink(graph, linkId) {
    if (!graph || linkId == null) return null;
    return graph.links?.[linkId] || graph.links?.get?.(linkId) || null;
}

function tjIsWirelessLink(graph, linkId) {
    const link = tjGetGraphLink(graph, linkId);
    return !!(link && (link._tj_wireless || link._tj_provider_value));
}
function tjApplyTheme(node) {
    if (!node) return;
    node.bgcolor = "#000000";
    node.color = "#7612DA";
    node.title_text_color = "#FFFFFF";
}

function tjCollectProviderNames(graph, excludeNode=null) {
    const names = new Set();
    graph?._nodes?.forEach(n => {
        if (!n || n === excludeNode || n.type === "TJ_GetNode" || n.type === "TJ_MultiGetNode") return;
        (n.widgets || []).forEach(w => {
            if ((w.name === "set_name" || w.name === "setnode_name") && String(w.value || "").trim()) names.add(String(w.value).trim());
        });
        if ((n.type === "TJ_MultiRouter" || n.type === "TJ_BatchToMultiOutput" || n.type === "TJ_MultiImageLoader") && n.properties?.auto_sets) {
            const autoW = n.widgets?.find(w => w.name === "auto_set");
            if (!autoW || autoW.value) Object.values(n.properties.auto_sets).forEach(v => { if (String(v || "").trim()) names.add(String(v).trim()); });
        }
    });
    return names;
}

function tjUniqueName(graph, base, excludeNode=null) {
    const names = tjCollectProviderNames(graph, excludeNode);
    const raw = String(base || "IMAGE").trim() || "IMAGE";
    const clean = raw.replace(/_\d+$/, "") || "IMAGE";
    if (!names.has(raw)) return raw;
    let i = 1;
    while (names.has(`${clean}_${i}`)) i++;
    return `${clean}_${i}`;
}

function tjGetAllSetNames(graph) {
    if (window.TJ_NODE_getAllSetNames) return window.TJ_NODE_getAllSetNames(graph);
    if (!graph) return ["(none)"];
    const names = Array.from(tjCollectProviderNames(graph));
    return ["(none)", ...new Set(names)].sort();
}

function tjFindSetterSourceInfo(graph, setName) {
    if (window.TJ_NODE_findSetterSourceInfo) return window.TJ_NODE_findSetterSourceInfo(graph, setName);
    if (!graph || !setName || setName === "(none)") return null;
    for (const n of graph._nodes || []) {
        if (!n || n.type === "TJ_GetNode" || n.type === "TJ_MultiGetNode") continue;
        const w = n.widgets?.find(x => x.name === "set_name" || x.name === "setnode_name");
        if (w && w.value === setName && n.outputs?.length) return { node: n, slot: 0 };
        if ((n.type === "TJ_MultiRouter" || n.type === "TJ_BatchToMultiOutput" || n.type === "TJ_MultiImageLoader") && n.properties?.auto_sets) {
            const autoW = n.widgets?.find(x => x.name === "auto_set");
            if (autoW && !autoW.value) continue;
            for (const [idx, nm] of Object.entries(n.properties.auto_sets)) {
                if (nm === setName) {
                    const slot = parseInt(idx);
                    if (tjGetOutputSlot(n, slot)) return { node: n, slot };
                }
            }
        }
    }
    return null;
}

function tjRefreshGetNodes(graph) {
    if (window.TJ_NODE_syncAllGetNodes) window.TJ_NODE_syncAllGetNodes(graph);
}

function tjLabelName(graph, name) {
    if (window.TJ_NODE_getProviderLabelName) return window.TJ_NODE_getProviderLabelName(graph, name);
    return name && name !== "(none)" ? String(name) : "";
}

function tjIsSeparator(name) {
    return !!(name && window.TJ_NODE_PROVIDER_SEPARATOR && name === window.TJ_NODE_PROVIDER_SEPARATOR);
}

function attachTJGetReceiver(node, opts = {}) {
    const widgetName = opts.widgetName || "get_name";
    const inputIndex = opts.inputIndex ?? 0;
    const inputName = opts.inputName || node.inputs?.[inputIndex]?.name || "images";
    const outputIndex = opts.outputIndex;
    const defaultType = opts.defaultType || node.inputs?.[inputIndex]?.type || "IMAGE";
    const defaultOutputType = opts.defaultOutputType || node.outputs?.[outputIndex]?.type || "IMAGE";
    const getW = node.widgets?.find(w => w.name === widgetName);
    if (!getW || getW._tj_get_receiver_attached) return;
    getW._tj_get_receiver_attached = true;

    const refreshProviderValues = () => {
        const values = tjGetAllSetNames(node.graph);
        const next = Array.isArray(values) ? [...values] : ["(none)"];
        if (getW.value && getW.value !== "(none)" && !next.includes(getW.value)) next.push(getW.value);
        getW.options = { ...(getW.options || {}), values: next };
        return next;
    };

    const removeWirelessInputOnly = (target) => {
        const input = target.inputs?.[inputIndex];
        if (!target.graph || !input || input.link == null) return;
        if (tjIsWirelessLink(target.graph, input.link)) {
            target._tj_connecting_wireless = true;
            try { tjSafeRemoveLink(target.graph, input.link); }
            finally { target._tj_connecting_wireless = false; }
            input.link = null;
        }
    };

    node._tjUpdateGetReceiverOptions = function() {
        const w = this.widgets?.find(x => x.name === widgetName);
        if (!w) return;
        refreshProviderValues();
        const label = tjLabelName(this.graph, w.value);
        if (this.inputs?.[inputIndex]) this.inputs[inputIndex].label = label ? `◀ ${label}` : "";
    };

    node._tjConnectGetReceiver = function(setName, connectOpts = {}) {
        if (!this.graph || !this.inputs?.[inputIndex]) return;
        const w = this.widgets?.find(x => x.name === widgetName);
        if (tjIsSeparator(setName)) {
            if (w) w.value = w._tj_previous_value || w.value || "(none)";
            return;
        }
        const selected = setName || "(none)";
        if (w && w.value !== selected) w.value = selected;
        if (w) w._tj_previous_value = selected;

        const input = this.inputs[inputIndex];
        const currentLinkId = input.link;
        const currentIsWireless = tjIsWirelessLink(this.graph, currentLinkId);
        input.name = inputName;

        if (currentLinkId != null && !currentIsWireless && !connectOpts.forceWireless) {
            input.label = "";
            app.canvas?.setDirty(true, true);
            return;
        }

        if (!selected || selected === "(none)") {
            removeWirelessInputOnly(this);
            input.label = "";
            if (currentLinkId == null || currentIsWireless) {
                input.type = defaultType;
                if (outputIndex !== undefined && this.outputs?.[outputIndex]) this.outputs[outputIndex].type = defaultOutputType;
            }
            app.canvas?.setDirty(true, true);
            return;
        }

        const provider = window.TJ_NODE_findProviderByValue ? window.TJ_NODE_findProviderByValue(this.graph, selected) : null;
        if (!provider) {
            input.label = `◀ ${tjLabelName(this.graph, selected) || selected}`;
            window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 80);
            window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 300);
            app.canvas?.setDirty(true, true);
            return;
        }

        const normalizedValue = provider.displayName || selected;
        if (w && w.value !== normalizedValue) w.value = normalizedValue;
        if (w) w._tj_previous_value = normalizedValue;

        if (window.TJ_NODE_forceReconnectConsumer) {
            window.TJ_NODE_forceReconnectConsumer(this, normalizedValue, inputIndex);
        } else {
            const sourceInfo = tjFindSetterSourceInfo(this.graph, normalizedValue);
            if (sourceInfo && tjCanConnect(sourceInfo, this, inputIndex)) {
                removeWirelessInputOnly(this);
                this._tj_connecting_wireless = true;
                try {
                    sourceInfo.node.connect(sourceInfo.slot, this, inputIndex);
                    window.TJ_NODE_markWirelessLink?.(this.graph, this, inputIndex, normalizedValue);
                } finally { this._tj_connecting_wireless = false; }
            }
        }

        const sourceInfo = tjFindSetterSourceInfo(this.graph, normalizedValue);
        const t = tjGetOutputSlot(sourceInfo?.node, sourceInfo?.slot)?.type || defaultType || "*";
        input.label = `◀ ${provider.labelName || tjLabelName(this.graph, normalizedValue)}`;
        input.type = t;
        if (outputIndex !== undefined && this.outputs?.[outputIndex]) this.outputs[outputIndex].type = t;
        app.canvas?.setDirty(true, true);
    };

    const origCb = getW.callback;
    getW.callback = function(v) {
        if (origCb) origCb.call(this, v);
        if (tjIsSeparator(v)) { getW.value = getW._tj_previous_value || getW.value || "(none)"; return; }
        getW._tj_previous_value = v;
        node._tjConnectGetReceiver(v, { forceWireless: true });
    };

    const origConnChange = node.onConnectionsChange;
    node.onConnectionsChange = function(type, index, connected) {
        if (origConnChange) origConnChange.apply(this, arguments);
        if (type === LiteGraph.INPUT && index === inputIndex) {
            const w = this.widgets?.find(x => x.name === widgetName);
            if (connected && !this._tj_connecting_wireless) {
                const lid = this.inputs?.[inputIndex]?.link;
                if (lid != null && !tjIsWirelessLink(this.graph, lid)) {
                    if (w && w.value !== "(none)") w.value = "(none)";
                    this.inputs[inputIndex].label = "";
                }
            } else if (!connected && !this._tj_connecting_wireless) {
                const selected = w?.value;
                if (selected && selected !== "(none)") {
                    this.inputs[inputIndex].label = `◀ ${tjLabelName(this.graph, selected) || selected}`;
                    window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 80);
                    window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 300);
                }
            }
            app.canvas?.setDirty(true, true);
        }
    };
    requestAnimationFrame(() => { refreshProviderValues(); node._tjUpdateGetReceiverOptions?.(); node._tjConnectGetReceiver?.(getW.value); });
    setTimeout(() => { refreshProviderValues(); node._tjUpdateGetReceiverOptions?.(); if (getW.value && getW.value !== "(none)") node._tjConnectGetReceiver?.(getW.value); }, 500);
}

function tjUpdateBatchAutoSets(node) {
    if (!node) return;
    if (!node.properties) node.properties = {};
    node.properties.auto_sets = {};
    const autoW = node.widgets?.find(w => w.name === "auto_set");
    const isAuto = autoW ? !!autoW.value : true;
    (node.outputs || []).forEach((out, i) => {
        const base = out?.name || `IMAGE_${i + 1}`;
        if (isAuto) {
            const nm = tjUniqueName(node.graph, base, node);
            node.properties.auto_sets[i] = nm;
            out.label = `${nm} ▶`;
        } else {
            out.label = base;
        }
    });
    node.setDirtyCanvas?.(true, true);
    tjRefreshGetNodes(node.graph);
}

const isInputChange = (type) => type === LiteGraph.INPUT || type === 1;
const imageInputs = (node) => (node.inputs || []).filter(s => /^image_\d+$/.test(s.name));
const eclipseInputs = (node) => (node.inputs || []).filter(s => /^(image|files)_\d+$/.test(s.name));

function updateDynamicImageBatch(node) {
    const imgs = imageInputs(node);
    if (imgs.length === 0) node.addInput("image_1", "IMAGE");
    const current = imageInputs(node);
    const last = current[current.length - 1];
    if (last && last.link != null && current.length < 64) node.addInput(`image_${current.length + 1}`, "IMAGE");
    const after = imageInputs(node);
    for (let i = after.length - 1; i > 0; i--) {
        if (after[i].link == null && after[i - 1].link == null) {
            node.removeInput(node.inputs.indexOf(after[i]));
        }
    }
    node.setDirtyCanvas(true, true);
}

function updateDynamicImageBatchEclipse(node) {
    const slots = new Set();
    for (const s of eclipseInputs(node)) {
        const m = s.name.match(/_(\d+)$/);
        if (m) slots.add(parseInt(m[1]));
    }
    if (!slots.size) { node.addInput("image_1", "IMAGE"); node.addInput("files_1", "*"); }
    const nums = Array.from(slots).sort((a,b)=>a-b);
    const max = nums.length ? nums[nums.length - 1] : 1;
    const imgLast = node.inputs?.find(s => s.name === `image_${max}`);
    const fileLast = node.inputs?.find(s => s.name === `files_${max}`);
    if ((imgLast?.link != null || fileLast?.link != null) && max < 64) {
        node.addInput(`image_${max + 1}`, "IMAGE");
        node.addInput(`files_${max + 1}`, "*");
    }
    // remove only when last two slot pairs are both empty, preserving one trailing empty pair
    let changed = true;
    while (changed) {
        changed = false;
        const ns = Array.from(new Set(eclipseInputs(node).map(s => parseInt(s.name.match(/_(\d+)$/)?.[1] || 0)).filter(Boolean))).sort((a,b)=>a-b);
        if (ns.length <= 1) break;
        const lastN = ns[ns.length - 1], prevN = ns[ns.length - 2];
        const li = node.inputs.find(s => s.name === `image_${lastN}`);
        const lf = node.inputs.find(s => s.name === `files_${lastN}`);
        const pi = node.inputs.find(s => s.name === `image_${prevN}`);
        const pf = node.inputs.find(s => s.name === `files_${prevN}`);
        if (li?.link == null && lf?.link == null && pi?.link == null && pf?.link == null) {
            if (lf) node.removeInput(node.inputs.indexOf(lf));
            if (li) node.removeInput(node.inputs.indexOf(li));
            changed = true;
        }
    }
    node.setDirtyCanvas(true, true);
}

app.registerExtension({
    name: "Comfy.TJ_Nodes_Extension",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        const customNodes = ["DynamicImageBatch", "DynamicImageBatchEclipse", "TJ_BatchToMultiOutput"];
        const isTJNode = customNodes.includes(nodeData.name) ||
            (typeof nodeData.name === "string" && nodeData.name.includes("TJ")) ||
            (typeof nodeType.title === "string" && nodeType.title.includes("TJ"));

        if (isTJNode) {
            nodeData.category = nodeData.category || " ✨ TJ_Node/Image";
            const origOnNodeCreatedBase = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (origOnNodeCreatedBase) origOnNodeCreatedBase.apply(this, arguments);
                tjApplyTheme(this);
                requestAnimationFrame(() => tjApplyTheme(this));
            };
        }

        if (nodeData.name === "DynamicImageBatch") {
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
                requestAnimationFrame(() => updateDynamicImageBatch(this));
            };
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function (type) {
                if (onConnectionsChange) onConnectionsChange.apply(this, arguments);
                if (isInputChange(type)) requestAnimationFrame(() => updateDynamicImageBatch(this));
            };
        }

        if (nodeData.name === "DynamicImageBatchEclipse") {
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
                requestAnimationFrame(() => updateDynamicImageBatchEclipse(this));
            };
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function (type) {
                if (onConnectionsChange) onConnectionsChange.apply(this, arguments);
                if (isInputChange(type)) requestAnimationFrame(() => updateDynamicImageBatchEclipse(this));
            };
        }

        if (nodeData.name === "TJ_BatchToMultiOutput") {
            function updateOutputSlots(node) {
                const outCountWidget = node.widgets ? node.widgets.find(w => w.name === "out_count") : null;
                if (!outCountWidget) return;
                const desired = Math.max(1, Math.min(64, parseInt(outCountWidget.value) || 2));
                const current = node.outputs ? node.outputs.length : 0;
                if (current < desired) {
                    for (let i = current; i < desired; i++) node.addOutput(`IMAGE_${i + 1}`, "IMAGE");
                } else if (current > desired) {
                    for (let i = current - 1; i >= desired; i--) {
                        if (node.outputs[i]?.links?.length) [...node.outputs[i].links].forEach(id => node.graph?.removeLink(id));
                        node.removeOutput(i);
                    }
                }
                tjUpdateBatchAutoSets(node);
                node.setSize(node.computeSize());
                node.setDirtyCanvas(true, true);
            }

            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
                const self = this;
                attachTJGetReceiver(this, { inputIndex: 0, inputName: "images", outputIndex: 0, defaultType: "IMAGE", defaultOutputType: "IMAGE" });
                requestAnimationFrame(() => { updateOutputSlots(self); tjUpdateBatchAutoSets(self); });

                const outCountWidget = this.widgets?.find(w => w.name === "out_count");
                if (outCountWidget) {
                    const origCallback = outCountWidget.callback;
                    outCountWidget.callback = function (v) { if (origCallback) origCallback.call(this, v); updateOutputSlots(self); };
                }
                const autoSetWidget = this.widgets?.find(w => w.name === "auto_set");
                if (autoSetWidget) {
                    const origAutoCb = autoSetWidget.callback;
                    autoSetWidget.callback = function(v) { if (origAutoCb) origAutoCb.call(this, v); tjUpdateBatchAutoSets(self); };
                }
            };

            const origOnConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function (data) {
                if (origOnConfigure) origOnConfigure.call(this, data);
                requestAnimationFrame(() => {
                    attachTJGetReceiver(this, { inputIndex: 0, inputName: "images", outputIndex: 0, defaultType: "IMAGE", defaultOutputType: "IMAGE" });
                    updateOutputSlots(this);
                    tjUpdateBatchAutoSets(this);
                });
            };

            const origOnDrawForeground = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function(ctx) {
                this._tjUpdateGetReceiverOptions?.();
                if (origOnDrawForeground) return origOnDrawForeground.apply(this, arguments);
            };
        }
    }
});
