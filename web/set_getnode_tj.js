// web/set_getnode_tj.js
// "투명 선(Invisible Wire)" 패러다임 + 글로벌 서브메뉴 (더블클릭 네비게이션 제거)

import { app } from "../../scripts/app.js";

const LGraphNode = LiteGraph.LGraphNode;
const MAX_PORTS = 20;
const AUTO_SET_PROVIDER_TYPES = new Set([
    "TJ_MultiRouter",
    "TJ_BatchToMultiOutput",
    "TJ_MultiImageLoader",
    "TJ_ZImageTurbo",
    "TJ_Flux2Klein",
    "TJ_SceneMaker",
    "TJ_MultiModelSelecter",
    "TJ_ModelSetLoader",
    "TJ_LLMContentQualityController",
    "TJ_QueueLoop"
]);
const ECLIPSE_SET_TYPES = new Set(["SetNode", "SetNode [Eclipse]"]);
const TJ_PROVIDER_PREFIX = "TJ / ";
const ECLIPSE_PROVIDER_PREFIX = "Eclipse / ";
const ECLIPSE_SEPARATOR = "──────── Eclipse ────────";

function isAutoSetProviderNode(node) {
    return !!(node && AUTO_SET_PROVIDER_TYPES.has(node.type));
}

function getGraphLink(graph, linkId) {
    if (!graph || linkId == null) return null;
    return graph.links?.[linkId] || graph.links?.get?.(linkId) || null;
}

function getOutputSlot(node, slot) {
    if (!node || slot == null || slot < 0) return null;
    return node.outputs?.[slot] || null;
}

function canConnectWireless(sourceInfo, target, targetSlot) {
    if (!sourceInfo || !sourceInfo.node || !target || !target.inputs?.[targetSlot]) return false;
    if (sourceInfo.connectable === false) return false;
    if (!getOutputSlot(sourceInfo.node, sourceInfo.slot)) return false;
    return true;
}



function isEmbeddedGetReceiverNode(node) {
    return !!(node && node.type !== "TJ_GetNode" && node.type !== "TJ_MultiGetNode" && node.widgets?.some(w => w.name === "get_name"));
}

function hasDirectNonWirelessInput(node, inputIndex = 0) {
    if (!isEmbeddedGetReceiverNode(node) || !node.graph || !node.inputs?.[inputIndex]) return false;
    const lid = node.inputs[inputIndex].link;
    const link = getGraphLink(node.graph, lid);
    return !!(link && !link._tj_wireless);
}

function getConsumerWidget(node) {
    return node?.widgets?.find(x => x.name === "get_name" || String(x.name || "").startsWith("get_name_") || (node?.type === "TJ_GetNode" && x.name === "set_name")) || null;
}

function isWirelessProviderNode(node) {
    if (!node) return false;
    if (ECLIPSE_SET_TYPES.has(node.type)) return true;
    if (node.type === "TJ_GetNode" || node.type === "TJ_MultiGetNode") return false;
    if (providerNameWidgets(node).some(w => String(w.value || "").trim())) return true;
    if (isAutoSetProviderNode(node)) return true;
    return false;
}

function isProviderInputDisconnectLink(graph, link) {
    if (!graph || !link) return false;
    const target = graph.getNodeById(link.target_id);
    if (!isWirelessProviderNode(target)) return false;
    // Set-like provider input links should never be rerouted directly into consumers.
    // For named/embedded providers we still repair after any input slot disconnect because
    // LiteGraph may auto-reconnect the old source to hidden consumers.
    return true;
}

function markWirelessLink(graph, target, targetSlot, providerValue) {
    if (!graph || !target?.inputs?.[targetSlot]) return null;
    const lid = target.inputs[targetSlot].link;
    const link = getGraphLink(graph, lid);
    if (link) {
        link._tj_wireless = true;
        link._tj_provider_value = providerValue || "";
    }
    return link;
}

function linkMatchesProvider(graph, link, provider) {
    if (!graph || !link || !provider || provider.connectable === false) return false;
    return link.origin_id === provider.node?.id && link.origin_slot === provider.slot;
}

function removeConsumerInputLink(node, inputIndex = 0) {
    if (!node?.graph || !node.inputs?.[inputIndex]) return;
    const lid = node.inputs[inputIndex].link;
    if (lid != null && getGraphLink(node.graph, lid)) node.graph.removeLink(lid);
    if (node.inputs?.[inputIndex]) {
        node.inputs[inputIndex].link = null;
        node.inputs[inputIndex].label = "";
    }
}

function scheduleWirelessRepair(graph, delay = 0) {
    graph = graph || app.graph;
    if (!graph) return;

    // Coalesce repair calls. Without this, connect/removeLink hooks can create
    // timer storms or recursive repair loops that freeze ComfyUI.
    if (graph._tj_wireless_repair_running) return;
    if (graph._tj_wireless_repair_timer) {
        clearTimeout(graph._tj_wireless_repair_timer);
        graph._tj_wireless_repair_timer = null;
    }

    graph._tj_wireless_repair_timer = setTimeout(() => {
        graph._tj_wireless_repair_timer = null;
        if (graph._tj_wireless_repair_running) return;
        graph._tj_wireless_repair_running = true;
        try { syncAllGetNodes(graph); }
        catch (err) { console.warn("[TJ_NODE] wireless repair failed", err); }
        finally { graph._tj_wireless_repair_running = false; }
    }, Math.max(0, delay || 0));
}

let globalShowWire = false;
let realtimeWireHoverEnabled = true; 

const origRenderLink = LGraphCanvas.prototype.renderLink;
LGraphCanvas.prototype.renderLink = function(ctx, a, b, link, skip_border, flow, color, start_dir, end_dir, num_sublines) {
	if (link && this.graph) {
		const origin = this.graph.getNodeById(link.origin_id);
		const target = this.graph.getNodeById(link.target_id);
		
        const originW = origin?.widgets?.find(w => w.name === "set_name" || w.name === "setnode_name");
        const autoSetW = origin?.widgets?.find(w => w.name === "auto_set");
        const hasNamedProvider = !!(originW && originW.value && originW.value.trim() !== "");
        const hasAutoSetOutput = !!(isAutoSetProviderNode(origin) && (!autoSetW || autoSetW.value) && origin?.properties?.auto_sets && String(origin.properties.auto_sets[link.origin_slot] || "").trim() !== "");
        let selectedValue = null;
        let targetGetW = null;
        const multiSpecsForRender = getMultiEmbeddedGetSpecs(target);
        if (multiSpecsForRender?.length) {
            const targetInput = target?.inputs?.[link.target_slot];
            const matchedSpec = multiSpecsForRender.find(spec =>
                spec.inputIndex === link.target_slot ||
                (spec.inputName && (targetInput?._tj_flux_input_name === spec.inputName || targetInput?.name === spec.inputName))
            );
            if (matchedSpec) {
                targetGetW = target?.widgets?.find(w => w.name === matchedSpec.widgetName) || null;
                selectedValue = targetGetW?.value || null;
            }
        }
        if (!targetGetW) {
            targetGetW = target?.widgets?.find(w => w.name === "get_name" || String(w.name || "").startsWith("get_name_") || (target?.type === "TJ_GetNode" && w.name === "set_name"));
            if (targetGetW) selectedValue = targetGetW.value;
        }
        if (!selectedValue && target?.type === "TJ_MultiGetNode" && target._selectors) {
            selectedValue = target._selectors()?.[link.target_slot]?.value || null;
        }
        const selectedProvider = selectedValue ? findProviderByValue(this.graph, selectedValue) : null;
        const isEclipseWire = !!(selectedProvider?.source === "eclipse" && selectedProvider.node === origin && selectedProvider.slot === link.origin_slot);
		const isMarkedWireless = !!link._tj_wireless;
		const isSetSource = origin && origin.type !== "TJ_GetNode" && origin.type !== "TJ_MultiGetNode" && (hasNamedProvider || hasAutoSetOutput || isEclipseWire || isMarkedWireless);
		const isEmbeddedGetter = !!(targetGetW && targetGetW.value && targetGetW.value !== "(none)");
		const isGetter = target && (target.type === "TJ_GetNode" || target.type === "TJ_MultiGetNode" || isEmbeddedGetter);
		
		if (isSetSource && isGetter) {
            const hoverNode = this.node_over || app.canvas?.node_over || null;
            const hoverWire = !!(hoverNode && (hoverNode === origin || hoverNode === target));
			if (globalShowWire || (realtimeWireHoverEnabled && hoverWire) || origin.properties?.show_wire || target.properties?.show_wire) {
				ctx.save();
				ctx.setLineDash([2, 5]); 
				
				const originalWidth = this.connections_width;
				this.connections_width = 2; 
				
				const origLinkColor = link.color;
				link.color = "#ffff00"; 
				
				const args = Array.from(arguments);
				args[6] = "#ffff00"; 
				
				const res = origRenderLink.apply(this, args);
				
				link.color = origLinkColor;
				this.connections_width = originalWidth;
				
				ctx.restore();
				return res;
			}
			return; 
		}
	}
	return origRenderLink.apply(this, arguments);
};

const origDrawNode = LGraphCanvas.prototype.drawNode;
LGraphCanvas.prototype.drawNode = function(node, ctx) {
    if (node.type === "TJ_GetNode") {
        const w = node.widgets?.find(x => x.name === "get_name" || x.name === "set_name");
        markWirelessInputLabel(node, 0, getProviderLabelName(node.graph, w?.value));
    } else if (node.type === "TJ_MultiGetNode") {
        const sels = node._selectors ? node._selectors() : [];
        node.inputs?.forEach((inp, i) => markWirelessInputLabel(node, i, getProviderLabelName(node.graph, sels[i]?.value)));
    } else {
        if (providerNameWidgets(node).length) updateProviderLabels(node);
    }
	return origDrawNode.apply(this, arguments);
};

// TJ fake-wire slot tooltip.
// DOM overlay 방식으로 처리해서 LiteGraph draw 순서/좌표계 영향 없이 표시한다.
let tjFakeWireTooltipEl = null;

function getTJFakeWireTooltipEl() {
    if (tjFakeWireTooltipEl && document.body.contains(tjFakeWireTooltipEl)) return tjFakeWireTooltipEl;
    tjFakeWireTooltipEl = document.createElement("div");
    tjFakeWireTooltipEl.id = "tj-fake-wire-slot-tooltip";
    Object.assign(tjFakeWireTooltipEl.style, {
        position: "fixed",
        zIndex: "999999",
        pointerEvents: "none",
        display: "none",
        padding: "5px 8px",
        borderRadius: "5px",
        border: "1px solid #7612DA",
        background: "#1a0330",
        color: "#d4d4d4",
        fontFamily: "sans-serif",
        fontSize: "12px",
        lineHeight: "14px",
        whiteSpace: "nowrap",
        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
    });
    document.body.appendChild(tjFakeWireTooltipEl);
    return tjFakeWireTooltipEl;
}

function hideTJFakeWireTooltip() {
    if (tjFakeWireTooltipEl) tjFakeWireTooltipEl.style.display = "none";
}

function cleanTJSlotTooltipName(value) {
    return String(value || "")
        .replace(/^\s*◀\s*/, "")
        .replace(/\s*▶\s*$/, "")
        .trim();
}

function getTJFakeWireInputTooltip(node, slotIndex) {
    const input = node?.inputs?.[slotIndex];
    if (!input) return null;

    let name = cleanTJSlotTooltipName(input.label || "");

    if (!name && node?.graph && input.link != null) {
        const link = getGraphLink(node.graph, input.link);
        if (link?._tj_wireless) {
            name = getProviderLabelName(node.graph, link._tj_provider_value) || cleanTJSlotTooltipName(link._tj_provider_value);
        }
    }

    if (!name && node?.type === "TJ_GetNode" && slotIndex === 0) {
        const w = node.widgets?.find(x => x.name === "get_name" || x.name === "set_name");
        name = getProviderLabelName(node.graph, w?.value);
    }

    if (!name && node?.type === "TJ_MultiGetNode") {
        const w = node._selectors ? node._selectors()?.[slotIndex] : null;
        name = getProviderLabelName(node.graph, w?.value);
    }

    if (!name || name === "(none)") return null;
    return `Get Name: ${name}`;
}

function getTJFakeWireOutputTooltip(node, slotIndex) {
    const output = node?.outputs?.[slotIndex];
    if (!output) return null;

    let name = cleanTJSlotTooltipName(output.label || "");

    if (!name && slotIndex === 0) {
        name = getProviderWidgetName(node);
    }

    if (!name && isAutoSetProviderNode(node)) {
        const autoSetW = node.widgets?.find(w => w.name === "auto_set");
        const autoSetEnabled = !autoSetW || !!autoSetW.value;
        if (autoSetEnabled) name = cleanTJSlotTooltipName(node.properties?.auto_sets?.[slotIndex] || "");
    }

    if (!name || name === "(none)") return null;
    const label = (node?.type === "TJ_GetNode" || node?.type === "TJ_MultiGetNode") ? "Get Name" : "Set Name";
    return `${label}: ${name}`;
}

function getTJFakeWireSlotTooltip(node, isInput, slotIndex) {
    return isInput ? getTJFakeWireInputTooltip(node, slotIndex) : getTJFakeWireOutputTooltip(node, slotIndex);
}

function getTJSlotConnectionPos(node, isInput, slotIndex) {
    if (!node || typeof node.getConnectionPos !== "function") return null;
    const out = [0, 0];
    try {
        const pos = node.getConnectionPos(!!isInput, slotIndex, out);
        return pos || out;
    } catch (_) {
        return null;
    }
}

function findTJFakeWireSlotUnderMouse(canvas) {
    const graph = canvas?.graph || app.graph;
    const mouse = canvas?.graph_mouse;
    if (!graph || !mouse) return null;

    const nodes = graph._nodes || [];
    const radius = 16;
    const radiusSq = radius * radius;

    for (let n = nodes.length - 1; n >= 0; n--) {
        const node = nodes[n];
        if (!node) continue;

        const scan = (slots, isInput) => {
            if (!slots?.length) return null;
            for (let i = 0; i < slots.length; i++) {
                const text = getTJFakeWireSlotTooltip(node, isInput, i);
                if (!text) continue;
                const pos = getTJSlotConnectionPos(node, isInput, i);
                if (!pos) continue;
                const dx = mouse[0] - pos[0];
                const dy = mouse[1] - pos[1];
                if ((dx * dx + dy * dy) <= radiusSq) return { text };
            }
            return null;
        };

        const hit = scan(node.inputs, true) || scan(node.outputs, false);
        if (hit) return hit;
    }
    return null;
}

function updateTJFakeWireTooltipFromMouse(canvas, e) {
    const hit = findTJFakeWireSlotUnderMouse(canvas);
    if (!hit?.text) {
        hideTJFakeWireTooltip();
        return;
    }

    const el = getTJFakeWireTooltipEl();
    el.textContent = hit.text;
    el.style.left = `${(e?.clientX || 0) + 14}px`;
    el.style.top = `${(e?.clientY || 0) + 14}px`;
    el.style.display = "block";
}

if (!LGraphCanvas.prototype._tj_fake_wire_tooltip_patch) {
    LGraphCanvas.prototype._tj_fake_wire_tooltip_patch = true;

    const origTJProcessMouseMove = LGraphCanvas.prototype.processMouseMove;
    LGraphCanvas.prototype.processMouseMove = function(e) {
        const res = origTJProcessMouseMove?.apply(this, arguments);
        try { updateTJFakeWireTooltipFromMouse(this, e); }
        catch (err) { hideTJFakeWireTooltip(); }
        return res;
    };

    const origTJProcessMouseDown = LGraphCanvas.prototype.processMouseDown;
    LGraphCanvas.prototype.processMouseDown = function(e) {
        hideTJFakeWireTooltip();
        return origTJProcessMouseDown?.apply(this, arguments);
    };

    const origTJProcessMouseUp = LGraphCanvas.prototype.processMouseUp;
    LGraphCanvas.prototype.processMouseUp = function(e) {
        const res = origTJProcessMouseUp?.apply(this, arguments);
        try { updateTJFakeWireTooltipFromMouse(this, e); }
        catch (err) { hideTJFakeWireTooltip(); }
        return res;
    };
}


function getProviderWidgetName(node) {
    const w = node?.widgets?.find(x => x.name === "set_name" || x.name === "setnode_name");
    return String(w?.value || "").trim();
}

function resolveEclipseSetLink(setNode) {
    const graph = setNode?.graph || app.graph;
    if (!graph || !setNode?.inputs?.length) return null;
    const linkId = setNode.inputs[0]?.link;
    const link = getGraphLink(graph, linkId);
    if (!link) return null;
    const origin = graph.getNodeById(link.origin_id);
    if (!origin || !getOutputSlot(origin, link.origin_slot)) return null;
    return {
        node: origin,
        slot: link.origin_slot,
        origin_id: link.origin_id,
        origin_slot: link.origin_slot,
        link
    };
}

function collectTJProviders(graph) {
    const providers = [];
    if (!graph) return providers;
    graph._nodes?.forEach(n => {
        if (!n || n.type === "TJ_GetNode" || n.type === "TJ_MultiGetNode") return;

        const name = getProviderWidgetName(n);
        // TJ_SetNode remains a provider by name even if its input is disconnected.
        if (name && getOutputSlot(n, 0)) {
            providers.push({
                source: "tj",
                kind: "named",
                node: n,
                slot: 0,
                name,
                labelName: name,
                displayName: `${TJ_PROVIDER_PREFIX}${name}`
            });
        }

        if (isAutoSetProviderNode(n) && n.properties?.auto_sets) {
            const autoSetW = n.widgets?.find(w => w.name === "auto_set");
            if (autoSetW && !autoSetW.value) return;
            for (const [idxStr, autoNameRaw] of Object.entries(n.properties.auto_sets)) {
                const autoName = String(autoNameRaw || "").trim();
                const slot = parseInt(idxStr);
                if (!autoName || !getOutputSlot(n, slot)) continue;
                providers.push({
                    source: "tj",
                    kind: "auto",
                    node: n,
                    slot,
                    name: autoName,
                    labelName: autoName,
                    displayName: `${TJ_PROVIDER_PREFIX}${autoName}`
                });
            }
        }
    });
    return providers;
}

function collectEclipseProviders(graph) {
    const providers = [];
    if (!graph) return providers;
    graph._nodes?.forEach(n => {
        if (!n || !ECLIPSE_SET_TYPES.has(n.type)) return;
        const name = String(n.widgets?.[0]?.value || "").trim();
        if (!name) return;

        // IMPORTANT:
        // Eclipse SetNode has its own OUTPUT slot. Treat it like a TJ SetNode endpoint.
        // Do NOT resolve to inputs[0].link/original source. If we connect consumers to
        // the original source, changing the Eclipse input leaves stale/ghost links.
        // Stable rule: Eclipse / name -> Eclipse SetNode output[0].
        const outSlot = getOutputSlot(n, 0) ? 0 : null;
        providers.push({
            source: "eclipse",
            kind: "eclipse",
            node: n,
            slot: outSlot ?? 0,
            setNode: n,
            name,
            labelName: name,
            displayName: `${ECLIPSE_PROVIDER_PREFIX}${name}`,
            connectable: outSlot != null
        });
    });
    return providers;
}

function collectAllProviders(graph) {
    graph = graph || app.graph;
    const seen = new Set();
    const dedupe = (items) => items.filter(p => {
        const key = `${p.source}:${p.node?.id}:${p.slot}:${p.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return [...dedupe(collectTJProviders(graph)), ...dedupe(collectEclipseProviders(graph))];
}

function getProviderDropdownValues(graph) {
    const providers = collectAllProviders(graph);
    const tjSets = providers.filter(p => p.source === "tj");
    const eclipseSets = providers.filter(p => p.source === "eclipse");
    const values = ["(none)"];
    values.push(...tjSets.map(v => v.displayName));
    if (tjSets.length && eclipseSets.length) values.push(ECLIPSE_SEPARATOR);
    values.push(...eclipseSets.map(v => v.displayName));
    return values;
}

function isProviderSeparator(value) {
    return value === ECLIPSE_SEPARATOR;
}

function findProviderByValue(graph, value) {
    if (!graph || !value || value === "(none)" || isProviderSeparator(value)) return null;
    const providers = collectAllProviders(graph);
    return providers.find(p => p.displayName === value)
        || providers.find(p => p.name === value && p.source === "tj")
        || providers.find(p => p.name === value)
        || null;
}

function getProviderLabelName(graph, value) {
    if (!value || value === "(none)" || isProviderSeparator(value)) return "";
    return findProviderByValue(graph || app.graph, value)?.labelName || String(value).replace(/^TJ \/ /, "").replace(/^Eclipse \/ /, "");
}

function normalizeProviderValue(graph, value) {
    if (!value || value === "(none)" || isProviderSeparator(value)) return "(none)";
    const provider = findProviderByValue(graph || app.graph, value);
    return provider?.displayName || value;
}

function setWidgetValueSilent(widget, value) {
    if (widget && widget.value !== value) widget.value = value;
}

function getAllSetNames(graph) {
    return getProviderDropdownValues(graph);
}

function findSetterSourceInfo(graph, setName) {
    const provider = findProviderByValue(graph, setName);
    if (!provider) return null;
    return {
        source: provider.source,
        kind: provider.kind,
        node: provider.node,
        slot: provider.slot,
        name: provider.name,
        labelName: provider.labelName,
        displayName: provider.displayName,
        setNode: provider.setNode,
        connectable: provider.connectable !== false
    };
}

function findProviderValueForLink(graph, originNode, originSlot) {
    if (!graph || !originNode || originSlot == null) return null;
    const providers = collectAllProviders(graph);
    const found = providers.find(p => p.node === originNode && p.slot === originSlot);
    return found?.displayName || null;
}

function getTypeColor(type) {
	if (!type || type === "*") return null;
	return app.canvas?.default_connection_color_byType?.[type] || LGraphCanvas?.link_type_colors?.[type] || null;
}

function darkenHex(hex, factor) {
	if (!hex) return null;
	let h = hex.replace("#", "");
	if (h.length === 3) h = h.split("").map(c => c + c).join("");
	const r = Math.max(0, Math.round(parseInt(h.substring(0, 2), 16) * factor));
	const g = Math.max(0, Math.round(parseInt(h.substring(2, 4), 16) * factor));
	const b = Math.max(0, Math.round(parseInt(h.substring(4, 6), 16) * factor));
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}


function applyTJTheme(node) {
    if (!node) return;
    node.bgcolor = "#000000";
    node.color = "#7612DA";
    node.title_text_color = "#FFFFFF";
}

function forceReconnectConsumer(node, value, slot = 0) {
    if (!node || !node.graph) return;
    if (!value || value === "(none)" || isProviderSeparator(value)) return;

    const provider = findProviderByValue(node.graph, value);
    if (!provider) return;
    const normalized = provider.displayName || normalizeProviderValue(node.graph, value);
    const labelName = provider.labelName || getProviderLabelName(node.graph, normalized) || getProviderLabelName(node.graph, value) || value;
    const inputIndex = slot || 0;

    // Always rebuild the real LiteGraph link from scratch.
    // TJ providers connect to their output. Eclipse providers also connect to the
    // Eclipse SetNode output[0], not to the original input source.
    node._tj_connecting_wireless = true;
    try {
        if (node.inputs?.[inputIndex]?.link != null) {
            const lid = node.inputs[inputIndex].link;
            if (getGraphLink(node.graph, lid)) node.graph.removeLink(lid);
            if (node.inputs?.[inputIndex]) node.inputs[inputIndex].link = null;
        }

        const w = getConsumerWidget(node);
        if (w) w.value = normalized;
        markWirelessInputLabel(node, inputIndex, labelName);

        const sourceInfo = findSetterSourceInfo(node.graph, normalized);
        if (!canConnectWireless(sourceInfo, node, inputIndex)) {
            // Provider name exists but has no valid source now, e.g. Eclipse Set input disconnected.
            // Keep the selected get_name, but no real wire should remain.
            if (node.type === "TJ_GetNode" && node.outputs?.[inputIndex]) {
                node.inputs[inputIndex].type = "*";
                node.inputs[inputIndex].name = "wire";
                node.outputs[inputIndex].type = "*";
                node.outputs[inputIndex].name = labelName || "value";
                node.outputs[inputIndex].label = labelName ? `${labelName} ▶` : "";
                node.title = labelName ? `(TJ) GET: ${labelName}` : "GET:";
            }
            return;
        }

        sourceInfo.node.connect(sourceInfo.slot, node, inputIndex);
        markWirelessLink(node.graph, node, inputIndex, normalized);

        const t = getOutputSlot(sourceInfo.node, sourceInfo.slot)?.type || "*";
        if (node.inputs?.[inputIndex]) {
            node.inputs[inputIndex].type = t;
            if (node.type === "TJ_GetNode") node.inputs[inputIndex].name = "wire";
        }
        if (node.type === "TJ_GetNode" && node.outputs?.[inputIndex]) {
            node.outputs[inputIndex].type = t;
            node.outputs[inputIndex].name = labelName;
            node.outputs[inputIndex].label = `${labelName} ▶`;
            node.title = `(TJ) GET: ${labelName}`;
        }
        applyTJTheme(node);
    } finally {
        node._tj_connecting_wireless = false;
    }
}


function getMultiEmbeddedGetSpecs(node) {
    const specs = Array.isArray(node?._tj_multi_get_specs) ? node._tj_multi_get_specs : null;
    if (specs?.length && node?.inputs) {
        specs.forEach(spec => {
            if (!spec?.inputName) return;
            const idx = node.inputs.findIndex(i =>
                (i?._tj_flux_input_name || i?.widget?.name || i?.name) === spec.inputName
            );
            if (idx >= 0) {
                spec.inputIndex = idx;
                node.inputs[idx]._tj_flux_input_name = spec.inputName;
            }
        });
    }
    return specs;
}

function updateMultiEmbeddedGetOptions(node) {
    const specs = getMultiEmbeddedGetSpecs(node);
    if (!specs?.length) return false;
    specs.forEach(spec => {
        const w = node.widgets?.find(x => x.name === spec.widgetName);
        if (!w) return;
        if (spec.refreshProviderValues) spec.refreshProviderValues();
        else if (w.options) w.options.values = getAllSetNames(node.graph);
    });
    return true;
}

function forceReconnectConsumersForProviderValues(graph, providerValues, delay = 0) {
    graph = graph || app.graph;
    if (!graph || !providerValues?.length) return;
    const values = [...new Set(providerValues.filter(v => v && v !== "(none)" && !isProviderSeparator(v)))];
    if (!values.length) return;
    setTimeout(() => {
        graph._nodes?.forEach(n => {
            if (!n) return;
            try {
                const multiSpecs = getMultiEmbeddedGetSpecs(n);
                if (multiSpecs?.length) {
                    updateMultiEmbeddedGetOptions(n);
                    let used = false;
                    multiSpecs.forEach(spec => {
                        const w = n.widgets?.find(x => x.name === spec.widgetName);
                        if (w && values.includes(w.value)) {
                            used = true;
                            if (!hasDirectNonWirelessInput(n, spec.inputIndex || 0)) {
                                n[`_tjConnect_${spec.widgetName}`]?.(w.value);
                            }
                        }
                    });
                    if (used) app.canvas?.setDirty(true, true);
                    return;
                }
                if (n.type === "TJ_MultiGetNode" && n._selectors && n._rebuild) {
                    const uses = n._selectors().some(w => values.includes(w?.value));
                    if (uses) n._rebuild();
                    return;
                }
                const w = getConsumerWidget(n);
                if (w && values.includes(w.value) && !hasDirectNonWirelessInput(n, 0)) forceReconnectConsumer(n, w.value, 0);
            } catch (err) {
                console.warn("[TJ_NODE] force provider reconnect skipped", err);
            }
        });
        app.canvas?.setDirty(true, true);
    }, Math.max(0, delay || 0));
}

function syncAllGetNodes(graph) {
    graph = graph || app.graph;
    if (!graph) return;
    try { ensureUniqueAutoSetNames(graph); } catch (err) { console.warn("[TJ_NODE] autoset unique skipped", err); }

    // First pass: remove stale selections and wrong ghost/direct links.
    try { cleanupInvalidGetSelections(graph); } catch (err) { console.warn("[TJ_NODE] cleanup skipped", err); }

    // Second pass: force reconnect valid selections even if the widget value did not change.
    // This is the important part: Refresh must behave like re-selecting the same get_name.
    graph._nodes?.forEach(n => {
        if (!n) return;
        try {
            const multiSpecs = getMultiEmbeddedGetSpecs(n);
            if (multiSpecs?.length) {
                updateMultiEmbeddedGetOptions(n);
                if (n._tjSyncMultiGetReceiver) n._tjSyncMultiGetReceiver();
                else {
                    multiSpecs.forEach(spec => {
                        const w = n.widgets?.find(x => x.name === spec.widgetName);
                        const selected = w?.value;
                        if (selected && selected !== "(none)" && !isProviderSeparator(selected) && !hasDirectNonWirelessInput(n, spec.inputIndex || 0)) {
                            n[`_tjConnect_${spec.widgetName}`]?.(selected);
                        } else if (!selected || selected === "(none)") {
                            n._tjClearMultiGetSlot?.(spec);
                        }
                    });
                }
                return;
            }
            if (n.type === "TJ_GetNode") {
                const w = getConsumerWidget(n);
                if (w?.options) w.options.values = getAllSetNames(graph);
                const selected = w?.value;
                if (selected && selected !== "(none)" && !isProviderSeparator(selected)) {
                    forceReconnectConsumer(n, selected, 0);
                } else if (n._connectToSetNode) {
                    n._connectToSetNode("(none)");
                }
                return;
            }

            if (n.type === "TJ_MultiGetNode") {
                if (n._selectors) {
                    n._selectors().forEach(w => {
                        if (w?.options) w.options.values = getAllSetNames(graph);
                    });
                }
                if (n._rebuild) n._rebuild();
                return;
            }

            const w = getConsumerWidget(n);
            if (n._tjUpdateGetReceiverOptions) n._tjUpdateGetReceiverOptions();
            if (w?.options) w.options.values = getAllSetNames(graph);
            if (w && n._tjConnectGetReceiver) {
                // Direct user wire wins. Do not rebuild wireless over a direct input.
                if (hasDirectNonWirelessInput(n, 0)) return;
                const selected = w.value;
                if (selected && selected !== "(none)" && !isProviderSeparator(selected)) {
                    forceReconnectConsumer(n, selected, 0);
                } else {
                    n._tj_connecting_wireless = true;
                    try { n._tjConnectGetReceiver("(none)"); }
                    finally { n._tj_connecting_wireless = false; }
                }
            }
        } catch (err) {
            console.warn("[TJ_NODE] skipped stale wireless sync", err);
        }
    });
    app.canvas?.setDirty(true, true);
}

function providerNameWidgets(node) {
    return (node.widgets || []).filter(w => w.name === "set_name" || w.name === "setnode_name");
}

function stripNumericSuffix(name) {
    return String(name || "TJ_Set").trim().replace(/_\d+$/, "") || "TJ_Set";
}

function collectProviderNames(graph, excludeNode=null) {
    const names = new Set();
    if (!graph) return names;
    graph._nodes?.forEach(n => {
        if (!n || n === excludeNode) return;
        if (n.type === "TJ_GetNode" || n.type === "TJ_MultiGetNode") return;
        providerNameWidgets(n).forEach(w => {
            const v = String(w.value || "").trim();
            if (v) names.add(v);
        });
        if (ECLIPSE_SET_TYPES.has(n.type)) {
            const v = String(n.widgets?.[0]?.value || "").trim();
            if (v) names.add(v);
        }
        if (isAutoSetProviderNode(n) && n.properties?.auto_sets) {
            const autoSetW = n.widgets?.find(w => w.name === "auto_set");
            if (!autoSetW || autoSetW.value) {
                Object.values(n.properties.auto_sets).forEach(v => {
                    v = String(v || "").trim();
                    if (v) names.add(v);
                });
            }
        }
    });
    return names;
}

function makeUniqueProviderName(graph, desired, excludeNode=null) {
    const existing = collectProviderNames(graph, excludeNode);
    const base = stripNumericSuffix(desired);
    let name = String(desired || base).trim() || base;
    if (!existing.has(name)) return name;
    let i = 1;
    while (existing.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
}

function ensureUniqueAutoSetNames(graph) {
    graph = graph || app.graph;
    if (!graph) return false;
    let changed = false;
    const used = new Set();

    // Names from normal providers and Eclipse Sets are reserved first.
    graph._nodes?.forEach(n => {
        if (!n) return;
        if (ECLIPSE_SET_TYPES.has(n.type)) {
            const v = String(n.widgets?.[0]?.value || "").trim();
            if (v) used.add(v);
        }
        if (n.type !== "TJ_GetNode" && n.type !== "TJ_MultiGetNode") {
            providerNameWidgets(n).forEach(w => {
                const v = String(w.value || "").trim();
                if (v) used.add(v);
            });
        }
    });

    graph._nodes?.forEach(n => {
        if (!isAutoSetProviderNode(n) || !n.properties?.auto_sets) return;
        const autoSetW = n.widgets?.find(w => w.name === "auto_set");
        if (autoSetW && !autoSetW.value) return;
        const entries = Object.entries(n.properties.auto_sets).sort((a,b) => parseInt(a[0]) - parseInt(b[0]));
        for (const [idx, raw] of entries) {
            const desired = String(raw || "").trim();
            if (!desired) continue;
            const base = stripNumericSuffix(desired);
            let finalName = desired;
            if (used.has(finalName)) {
                let i = 1;
                while (used.has(`${base}_${i}`)) i++;
                finalName = `${base}_${i}`;
            }
            used.add(finalName);
            if (finalName !== desired) {
                n.properties.auto_sets[idx] = finalName;
                const out = n.outputs?.[parseInt(idx)];
                if (out) out.label = finalName + " ▶";
                changed = true;
            }
        }
    });
    return changed;
}

function updateProviderLabels(node) {
    if (!node) return;
    const w = providerNameWidgets(node)[0];
    const name = String(w?.value || "").trim();
    if (node.type === "TJ_SetNode") node.title = "SET: " + (name || "TJ_Set_1");
    if (node.outputs?.[0]) {
        if (node.outputs[0]._tj_original_label === undefined) {
            node.outputs[0]._tj_original_label = node.outputs[0].label || "";
            node.outputs[0]._tj_original_name = node.outputs[0].name || "";
        }
        if (name) {
            node.outputs[0].label = `${name} ▶`;
        } else {
            // When set_name / setnode_name is cleared, fully restore the output slot.
            // Do not leave the previous provider label cached on the slot.
            node.outputs[0].name = node.outputs[0]._tj_original_name || "output";
            node.outputs[0].label = "";
        }
    }
}

function ensureUniqueProviderNames(node) {
    if (!node?.graph) return false;
    let changed = false;
    providerNameWidgets(node).forEach(w => {
        const oldVal = String(w.value || "").trim();
        if (!oldVal) return;
        const unique = makeUniqueProviderName(node.graph, oldVal, node);
        if (unique !== oldVal) {
            w.value = unique;
            changed = true;
        }
    });
    updateProviderLabels(node);
    return changed;
}

function attachProviderNameSync(node) {
    if (!node || node._tj_provider_name_sync_attached) return;
    node._tj_provider_name_sync_attached = true;
    providerNameWidgets(node).forEach(w => {
        const origCb = w.callback;
        w.callback = function(v) {
            if (origCb) origCb.apply(this, arguments);
            ensureUniqueProviderNames(node);
            syncAllGetNodes(node.graph);
        };
    });
    setTimeout(() => {
        ensureUniqueProviderNames(node);
        syncAllGetNodes(node.graph);
    }, 0);
}

function disconnectWirelessLinksFromProvider(node) {
    if (!node?.graph || !node.outputs) return;
    const ids = [];
    node.outputs.forEach(out => {
        if (out?.links?.length) ids.push(...out.links);
    });
    [...new Set(ids)].forEach(lid => {
        const l = getGraphLink(node.graph, lid);
        const target = l ? node.graph.getNodeById(l.target_id) : null;
        if (target && (target.type === "TJ_GetNode" || target.type === "TJ_MultiGetNode" || isEmbeddedGetNode(target))) {
            if (target.type !== "TJ_MultiGetNode") resetGetWidgetNode(target, l.target_slot || 0);
            else if (getGraphLink(node.graph, lid)) node.graph.removeLink(lid);
        }
    });
}

function markWirelessInputLabel(node, slot, name) {
    if (!node?.inputs?.[slot]) return;
    node.inputs[slot].label = name && name !== "(none)" ? `◀ ${name}` : "";
}

function isEmbeddedGetNode(node) {
    const w = node?.widgets?.find(x => x.name === "get_name");
    return !!(w && w.value && w.value !== "(none)");
}

function resetGetWidgetNode(node, inputIndex = 0) {
    const w = node?.widgets?.find(x => x.name === "get_name" || x.name === "set_name");
    if (w) w.value = "(none)";
    if (node?.inputs?.[inputIndex]) {
        if (node.inputs[inputIndex].link != null && node.graph) {
            const lid = node.inputs[inputIndex].link;
            if (getGraphLink(node.graph, lid)) node.graph.removeLink(lid);
        }
        node.inputs[inputIndex].link = null;
        node.inputs[inputIndex].label = "";
    }
    if (node?._tjConnectGetReceiver) node._tjConnectGetReceiver("(none)");
    if (node?._connectToSetNode) node._connectToSetNode("(none)");
}

function resetConsumersForProviderValue(graph, providerValue) {
    graph = graph || app.graph;
    if (!graph || !providerValue || providerValue === "(none)" || isProviderSeparator(providerValue)) return;

    graph._nodes?.forEach(n => {
        if (!n) return;
        try {
            const multiSpecs = getMultiEmbeddedGetSpecs(n);
        if (multiSpecs?.length) {
            const values = new Set(getAllSetNames(graph));
            multiSpecs.forEach(spec => {
                const w = n.widgets?.find(x => x.name === spec.widgetName);
                if (!w || !w.value || w.value === "(none)" || isProviderSeparator(w.value)) return;
                if (hasDirectNonWirelessInput(n, spec.inputIndex || 0)) return;
                const provider = findProviderByValue(graph, w.value);
                if (!provider || !values.has(provider.displayName)) {
                    n._tjClearMultiGetSlot?.(spec);
                    return;
                }
                const link = getGraphLink(graph, n.inputs?.[spec.inputIndex]?.link);
                if (link && !linkMatchesProvider(graph, link, provider)) {
                    const renamedValue = findProviderValueForLink(graph, graph.getNodeById(link.origin_id), link.origin_slot);
                    if (renamedValue && values.has(renamedValue)) {
                        w.value = renamedValue;
                        w._tj_previous_value = renamedValue;
                    } else {
                        removeConsumerInputLink(n, spec.inputIndex || 0);
                    }
                }
            });
            return;
        }

        if (n.type === "TJ_MultiGetNode" && n._selectors) {
                let changed = false;
                n._selectors().forEach((w, i) => {
                    if (w?.value === providerValue) {
                        w.value = "(none)";
                        removeConsumerInputLink(n, i);
                        changed = true;
                    }
                });
                if (changed && n._rebuild) n._rebuild();
                return;
            }

            const w = getConsumerWidget(n);
            if (w?.value === providerValue) resetGetWidgetNode(n, 0);
        } catch (err) {
            console.warn("[TJ_NODE] reset stale provider consumer skipped", err);
        }
    });
    app.canvas?.setDirty(true, true);
}

function resetConsumersForEclipseSet(setNode) {
    if (!setNode) return;
    const graph = setNode.graph || app.graph;
    const name = String(setNode.widgets?.[0]?.value || "").trim();
    if (!graph || !name) return;
    resetConsumersForProviderValue(graph, `${ECLIPSE_PROVIDER_PREFIX}${name}`);
}

function installWirelessGraphRemoveHook() {
    const GraphCtor = LiteGraph?.LGraph;
    if (!GraphCtor?.prototype || GraphCtor.prototype._tj_wireless_remove_hooked) return;
    GraphCtor.prototype._tj_wireless_remove_hooked = true;
    const origRemove = GraphCtor.prototype.remove;
    GraphCtor.prototype.remove = function(node) {
        const isEclipse = !!(node && ECLIPSE_SET_TYPES.has(node.type));
        const eclipseName = isEclipse ? String(node.widgets?.[0]?.value || "").trim() : "";
        const providerValues = [];
        if (isEclipse && eclipseName) providerValues.push(`${ECLIPSE_PROVIDER_PREFIX}${eclipseName}`);
        if (node && providerNameWidgets(node).length) {
            providerNameWidgets(node).forEach(w => {
                const v = String(w.value || "").trim();
                if (v) providerValues.push(`${TJ_PROVIDER_PREFIX}${v}`, v);
            });
        }
        const res = origRemove ? origRemove.apply(this, arguments) : undefined;
        providerValues.forEach(v => resetConsumersForProviderValue(this, v));
        scheduleWirelessRepair(this, 80);
        return res;
    };
}
installWirelessGraphRemoveHook();


function getProviderValuesForNode(node) {
    const values = [];
    if (!node) return values;
    if (ECLIPSE_SET_TYPES.has(node.type)) {
        const name = String(node.widgets?.[0]?.value || "").trim();
        if (name) values.push(`${ECLIPSE_PROVIDER_PREFIX}${name}`, name);
    }
    providerNameWidgets(node).forEach(w => {
        const name = String(w.value || "").trim();
        if (name) values.push(`${TJ_PROVIDER_PREFIX}${name}`, name);
    });
    if (isAutoSetProviderNode(node) && node.properties?.auto_sets) {
        Object.values(node.properties.auto_sets).forEach(v => {
            const name = String(v || "").trim();
            if (name) values.push(`${TJ_PROVIDER_PREFIX}${name}`, name);
        });
    }
    return [...new Set(values)];
}

function consumerUsesProviderValue(node, providerValues, inputSlot = 0) {
    if (!node || !providerValues?.length) return false;
    if (node.type === "TJ_MultiGetNode" && node._selectors) {
        const w = node._selectors()?.[inputSlot];
        return !!(w && providerValues.includes(w.value));
    }
    const w = getConsumerWidget(node);
    return !!(w && providerValues.includes(w.value));
}

function removeBypassLinksFromOldProviderInput(graph, oldLink, providerValues) {
    if (!graph || !oldLink || !providerValues?.length) return;
    const ids = [];
    const allLinks = graph.links instanceof Map ? Array.from(graph.links.values()) : Object.values(graph.links || {});
    for (const l of allLinks) {
        if (!l) continue;
        if (l.origin_id !== oldLink.origin_id || l.origin_slot !== oldLink.origin_slot) continue;
        const target = graph.getNodeById(l.target_id);
        if (!target) continue;
        if (consumerUsesProviderValue(target, providerValues, l.target_slot)) ids.push(l.id);
    }
    ids.forEach(id => { if (getGraphLink(graph, id)) graph.removeLink(id); });
}

function installWirelessRemoveLinkHook() {
    const GraphCtor = LiteGraph?.LGraph;
    if (!GraphCtor?.prototype || GraphCtor.prototype._tj_wireless_remove_link_hooked) return;
    GraphCtor.prototype._tj_wireless_remove_link_hooked = true;
    const origRemoveLink = GraphCtor.prototype.removeLink;
    GraphCtor.prototype.removeLink = function(linkId) {
        const link = getGraphLink(this, linkId);
        const targetBefore = link ? this.getNodeById(link.target_id) : null;
        const providerInputDisconnect = !!(link && isProviderInputDisconnectLink(this, link));
        const providerValues = providerInputDisconnect ? getProviderValuesForNode(targetBefore) : [];
        const needsWirelessRepair = !!(link && (link._tj_wireless || providerInputDisconnect));
        const oldLink = link ? { ...link } : null;
        const res = origRemoveLink ? origRemoveLink.apply(this, arguments) : undefined;
        if (providerInputDisconnect) {
            // LiteGraph may auto-bypass old source directly into Get/embedded consumers.
            // Wireless providers are not reroute nodes, so remove that bypass immediately.
            setTimeout(() => removeBypassLinksFromOldProviderInput(this, oldLink, providerValues), 0);
            setTimeout(() => removeBypassLinksFromOldProviderInput(this, oldLink, providerValues), 60);
            // Keep get_name values but rebuild/remove the actual hidden wires from scratch.
            forceReconnectConsumersForProviderValues(this, providerValues, 120);
            forceReconnectConsumersForProviderValues(this, providerValues, 260);
        }
        if (needsWirelessRepair) {
            scheduleWirelessRepair(this, 90);
            scheduleWirelessRepair(this, 240);
        }
        return res;
    };
}
installWirelessRemoveLinkHook();

function installWirelessConnectHook() {
    // Safe narrow hook: only reacts when a user connects INTO a provider input.
    // It does not react to repair-created provider->consumer links, avoiding recursion.
    if (!LGraphNode?.prototype || LGraphNode.prototype._tj_wireless_connect_hooked) return;
    LGraphNode.prototype._tj_wireless_connect_hooked = true;
    const origConnect = LGraphNode.prototype.connect;
    LGraphNode.prototype.connect = function(slot, targetNode, targetSlot) {
        const res = origConnect ? origConnect.apply(this, arguments) : undefined;
        const graph = targetNode?.graph || this.graph || app.graph;
        if (graph && !graph._tj_wireless_repair_running && targetNode && isWirelessProviderNode(targetNode)) {
            scheduleWirelessRepair(graph, 30);
            scheduleWirelessRepair(graph, 120);
            scheduleWirelessRepair(graph, 300);
        }
        return res;
    };
}
installWirelessConnectHook();

function cleanupInvalidGetSelections(graph) {
    graph = graph || app.graph;
    if (!graph) return;
    const values = new Set(getAllSetNames(graph));

    graph._nodes?.forEach(n => {
        if (!n) return;

        const multiSpecs = getMultiEmbeddedGetSpecs(n);
        if (multiSpecs?.length) {
            const values = new Set(getAllSetNames(graph));
            multiSpecs.forEach(spec => {
                const w = n.widgets?.find(x => x.name === spec.widgetName);
                if (!w || !w.value || w.value === "(none)" || isProviderSeparator(w.value)) return;
                if (hasDirectNonWirelessInput(n, spec.inputIndex || 0)) return;
                const provider = findProviderByValue(graph, w.value);
                if (!provider || !values.has(provider.displayName)) {
                    n._tjClearMultiGetSlot?.(spec);
                    return;
                }
                const link = getGraphLink(graph, n.inputs?.[spec.inputIndex]?.link);
                if (link && !linkMatchesProvider(graph, link, provider)) {
                    const renamedValue = findProviderValueForLink(graph, graph.getNodeById(link.origin_id), link.origin_slot);
                    if (renamedValue && values.has(renamedValue)) {
                        w.value = renamedValue;
                        w._tj_previous_value = renamedValue;
                    } else {
                        removeConsumerInputLink(n, spec.inputIndex || 0);
                    }
                }
            });
            return;
        }

        if (n.type === "TJ_MultiGetNode" && n._selectors) {
            const sels = n._selectors();
            let changed = false;
            sels.forEach((w, i) => {
                if (!w || !w.value || w.value === "(none)" || isProviderSeparator(w.value)) return;

                const link = getGraphLink(graph, n.inputs?.[i]?.link);

                // MultiGet is slot-entity based. A provider rename must update
                // the widget value through the existing hidden fake-wire link,
                // not clear the slot to (none).
                const linkedSource = link ? graph.getNodeById(link.origin_id) : null;
                const linkedProviderValue = link ? findProviderValueForLink(graph, linkedSource, link.origin_slot) : null;
                if (linkedProviderValue && linkedProviderValue !== w.value) {
                    w.value = linkedProviderValue;
                    w._tj_previous_value = linkedProviderValue;
                    changed = true;
                    return;
                }

                const provider = findProviderByValue(graph, w.value);
                if (!provider || !values.has(provider.displayName)) {
                    // Provider was deleted or no matching hidden link remains.
                    // Keep this MultiGet slot entity stable; clear only this slot.
                    w.value = "(none)";
                    w._tj_previous_value = "(none)";
                    removeConsumerInputLink(n, i);
                    changed = true;
                    return;
                }
                if (link && !linkMatchesProvider(graph, link, provider)) {
                    const src = graph.getNodeById(link.origin_id);
                    const renamedValue = findProviderValueForLink(graph, src, link.origin_slot);
                    if (renamedValue && values.has(renamedValue)) {
                        w.value = renamedValue;
                        w._tj_previous_value = renamedValue;
                    } else {
                        removeConsumerInputLink(n, i);
                    }
                    changed = true;
                }
            });
            if (changed && n._rebuild) n._rebuild();
            return;
        }

        const w = getConsumerWidget(n);
        if (!w || !w.value || w.value === "(none)" || isProviderSeparator(w.value)) return;

        // Direct user wires have priority over embedded get_name wireless mode.
        // If a real non-wireless link is plugged into an embedded Get receiver,
        // never remove it during wireless cleanup/repair.
        if (hasDirectNonWirelessInput(n, 0)) return;

        const provider = findProviderByValue(graph, w.value);
        if (!provider || !values.has(provider.displayName)) {
            resetGetWidgetNode(n, 0);
            return;
        }

        const link = getGraphLink(graph, n.inputs?.[0]?.link);
        if (link && !linkMatchesProvider(graph, link, provider)) {
            removeConsumerInputLink(n, 0);
        }
    });
}

window.TJ_NODE_applyTheme = applyTJTheme;
window.TJ_NODE_attachProviderNameSync = attachProviderNameSync;
window.TJ_NODE_syncAllGetNodes = syncAllGetNodes;
window.TJ_NODE_getAllSetNames = getAllSetNames;
window.TJ_NODE_findSetterSourceInfo = findSetterSourceInfo;
window.TJ_NODE_collectAllProviders = collectAllProviders;
window.TJ_NODE_findProviderByValue = findProviderByValue;
window.TJ_NODE_getProviderLabelName = getProviderLabelName;
window.TJ_NODE_PROVIDER_SEPARATOR = ECLIPSE_SEPARATOR;
window.TJ_NODE_cleanupInvalidGetSelections = cleanupInvalidGetSelections;
window.TJ_NODE_resetConsumersForProviderValue = resetConsumersForProviderValue;
window.TJ_NODE_resetConsumersForEclipseSet = resetConsumersForEclipseSet;
window.TJ_NODE_ensureUniqueProviderNames = ensureUniqueProviderNames;
window.TJ_NODE_ensureUniqueAutoSetNames = ensureUniqueAutoSetNames;
window.TJ_NODE_markWirelessLink = markWirelessLink;
window.TJ_NODE_scheduleWirelessRepair = scheduleWirelessRepair;
window.TJ_NODE_forceReconnectConsumer = forceReconnectConsumer;
window.TJ_NODE_forceReconnectConsumersForProviderValues = forceReconnectConsumersForProviderValues;

app.registerExtension({
	name: "TJ.SetNode.Wireless",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if (nodeData.name === "TJ_SetNode") {
			const origOnNodeCreated = nodeType.prototype.onNodeCreated;
			nodeType.prototype.onNodeCreated = function() {
				if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);

                applyTJTheme(this);
                attachProviderNameSync(this);

				const w = this.widgets.find(w => w.name === "get_name" || w.name === "set_name");
				if (w) {
					w.callback = () => {
                        ensureUniqueProviderNames(this);
						this.title = "SET: " + w.value;
                        updateProviderLabels(this);
                        syncAllGetNodes(this.graph);
					};
				}
				this.title = "SET: " + (w ? w.value : "TJ_Set_1");
			};

            const origOnRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function() {
                disconnectWirelessLinksFromProvider(this);
                scheduleWirelessRepair(this.graph, 0);
                if (origOnRemoved) origOnRemoved.apply(this, arguments);
            };

			const origOnConnectionsChange = nodeType.prototype.onConnectionsChange;
			nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info) {
				if (origOnConnectionsChange) origOnConnectionsChange.apply(this, arguments);
				if (type === LiteGraph.INPUT && index === 0) {
					if (connected && link_info) {
						const srcNode = this.graph.getNodeById(link_info.origin_id);
                        const srcOut = getOutputSlot(srcNode, link_info.origin_slot);
						if (srcNode && srcOut) {
							const srcType = srcOut.type || "*";
							this.inputs[0].type = srcType; this.inputs[0].name = "value";
							this.outputs[0].type = srcType; this.outputs[0].name = srcType; updateProviderLabels(this);
							applyTJTheme(this);
                            scheduleWirelessRepair(this.graph, 0);
                            scheduleWirelessRepair(this.graph, 80);
						}
					} else {
                        // Provider input changed/disconnected does NOT mean the provider died.
                        // Keep existing Get/get_name selections alive and let repair rebind them when a new input arrives.
						this.inputs[0].type = "*"; this.inputs[0].name = "value";
						this.outputs[0].type = "*"; this.outputs[0].name = "value"; updateProviderLabels(this);
						applyTJTheme(this);
                        scheduleWirelessRepair(this.graph, 0);
                        scheduleWirelessRepair(this.graph, 120);
					}
					
					if (this.outputs?.[0]?.links) {
						[...this.outputs[0].links].forEach(lid => {
							const l = getGraphLink(this.graph, lid);
							if (!l) return;
							const getn = this.graph.getNodeById(l.target_id);
							if (getn && (getn.type === "TJ_GetNode" || getn.type === "TJ_MultiGetNode") && getn.inputs?.[l.target_slot] && getn.outputs?.[l.target_slot]) {
								getn.inputs[l.target_slot].type = this.outputs[0].type || "*";
								getn.outputs[l.target_slot].type = this.outputs[0].type || "*";
                                const srcLabel = providerNameWidgets(this)[0]?.value || this.outputs[0].name || this.outputs[0].type;
								getn.outputs[l.target_slot].name = srcLabel;
                                getn.outputs[l.target_slot].label = `${srcLabel} ▶`;
								if (getn.type === "TJ_GetNode") applyTJTheme(getn);
							}
						});
					}
				}
			};
		}
	}
});

app.registerExtension({
	name: "TJ.GetNode.Wireless",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if (nodeData.name === "TJ_GetNode") {
			const origOnNodeCreated = nodeType.prototype.onNodeCreated;
			nodeType.prototype.onNodeCreated = function() {
				if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);

                applyTJTheme(this);

				const w = this.widgets.find(w => w.name === "get_name" || w.name === "set_name");
				if (w) {
					w.options = { values: ["(none)"] }; 
					w.callback = (val) => {
						this.title = "(TJ) GET: " + getProviderLabelName(this.graph, val);
                        if (isProviderSeparator(val)) { w.value = w._tj_previous_value || "(none)"; return; }
                        w._tj_previous_value = val;
                        markWirelessInputLabel(this, 0, getProviderLabelName(this.graph, val));
						this._connectToSetNode(val); 
					};
				}
				this.title = "GET: " + (w ? w.value : "");

				if (this.inputs && this.inputs[0]) {
					this.inputs[0].color_on = "transparent";
					this.inputs[0].color_off = "transparent";
					this.inputs[0].name = "wire"; 
				}
			};

			const origOnDrawForeground = nodeType.prototype.onDrawForeground;
			nodeType.prototype.onDrawForeground = function(ctx) {
				if (origOnDrawForeground) origOnDrawForeground.apply(this, arguments);
				const w = this.widgets?.find(x => x.name === "get_name" || x.name === "set_name");
				if (w && w.options) {
					w.options.values = getAllSetNames(this.graph);
				}
			};

			nodeType.prototype._connectToSetNode = function(setName) {
				if (!this.graph) return;
				const wasConnecting = !!this._tj_connecting_wireless;
				this._tj_connecting_wireless = true;
				try {
					if (this.inputs[0].link != null) this.graph.removeLink(this.inputs[0].link);
				} finally {
					this._tj_connecting_wireless = wasConnecting;
				}

				const valueW = this.widgets?.find(x => x.name === "get_name" || x.name === "set_name");

				if (!setName || setName === "(none)" || isProviderSeparator(setName)) {
	                markWirelessInputLabel(this, 0, "");
					this.inputs[0].type = "*";
					this.inputs[0].name = "wire";
					this.outputs[0].type = "*";
					this.outputs[0].name = "value";
	                this.outputs[0].label = "";
					applyTJTheme(this);
					return;
				}

				const sourceInfo = findSetterSourceInfo(this.graph, setName);
				if (canConnectWireless(sourceInfo, this, 0)) {
	                const normalizedValue = sourceInfo.displayName || normalizeProviderValue(this.graph, setName);
	                setWidgetValueSilent(valueW, normalizedValue);
	                const labelName = sourceInfo.labelName || getProviderLabelName(this.graph, normalizedValue) || getProviderLabelName(this.graph, setName) || setName;
	                markWirelessInputLabel(this, 0, labelName);
	                this._tj_connecting_wireless = true;
					sourceInfo.node.connect(sourceInfo.slot, this, 0); 
	                markWirelessLink(this.graph, this, 0, normalizedValue);
	                this._tj_connecting_wireless = false;
					const t = getOutputSlot(sourceInfo.node, sourceInfo.slot)?.type || "*";
					this.inputs[0].type = t;
					this.inputs[0].name = "wire"; 
					this.outputs[0].type = t;
					this.outputs[0].name = labelName;
	                this.outputs[0].label = `${labelName} ▶`;
	                this.title = "(TJ) GET: " + labelName;
					applyTJTheme(this);
				} else {
	                const provider = findProviderByValue(this.graph, setName);
	                if (provider) {
	                    const normalizedValue = provider.displayName || normalizeProviderValue(this.graph, setName);
	                    setWidgetValueSilent(valueW, normalizedValue);
	                    const labelName = provider.labelName || getProviderLabelName(this.graph, normalizedValue) || getProviderLabelName(this.graph, setName) || setName;
	                    markWirelessInputLabel(this, 0, labelName);
	                    this.title = "(TJ) GET: " + labelName;
	                } else {
	                    if (valueW) valueW.value = "(none)";
	                    markWirelessInputLabel(this, 0, "");
	                    this.title = "GET:";
	                }
					this.inputs[0].type = "*";
					this.inputs[0].name = "wire";
					this.outputs[0].type = "*";
					this.outputs[0].name = "value";
	                this.outputs[0].label = "";
					applyTJTheme(this);
				}
			};


			nodeType.prototype._syncWithSetNode = function() {
				if (this.inputs[0].link != null) {
					const l = getGraphLink(this.graph, this.inputs[0].link);
					if (l) {
                        const src = this.graph.getNodeById(l.origin_id);
                        const providerValue = findProviderValueForLink(this.graph, src, l.origin_slot);
                        const labelName = getProviderLabelName(this.graph, providerValue);

                        const myW = this.widgets.find(w=>w.name==="get_name" || w.name==="set_name");
                        if (myW && providerValue && myW.value !== providerValue) {
                            myW.value = providerValue;
                            this.title = "(TJ) GET: " + labelName;
                            markWirelessInputLabel(this, 0, labelName);
                        }
					}
				}
			};


            const origGetOnConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(type, index, connected) {
                if (origGetOnConnectionsChange) origGetOnConnectionsChange.apply(this, arguments);
                if (type === LiteGraph.INPUT && index === 0 && !connected && !this._tj_connecting_wireless) {
                    const w = this.widgets?.find(x => x.name === "get_name" || x.name === "set_name");
                    const selected = w?.value;
                    const provider = selected && selected !== "(none)" && !isProviderSeparator(selected) ? findProviderByValue(this.graph, selected) : null;
                    if (provider) {
                        // Temporary wireless link removal while a provider input is being changed.
                        // Keep the selection; repair will reconnect when possible.
                        markWirelessInputLabel(this, 0, provider.labelName || getProviderLabelName(this.graph, selected));
                        if (this.outputs?.[0]) {
                            this.outputs[0].name = provider.labelName || getProviderLabelName(this.graph, selected) || "value";
                            this.outputs[0].label = provider.labelName ? `${provider.labelName} ▶` : this.outputs[0].label;
                        }
                        scheduleWirelessRepair(this.graph, 60);
                        return;
                    }
                    if (w && w.value && w.value !== "(none)") w.value = "(none)";
                    markWirelessInputLabel(this, 0, "");
                    if (this.outputs?.[0]) { this.outputs[0].name = "value"; this.outputs[0].label = ""; this.outputs[0].type = "*"; }
                    app.canvas?.setDirty(true, true);
                }
            };

			const origOnConfigure = nodeType.prototype.onConfigure;
			nodeType.prototype.onConfigure = function() {
				if (origOnConfigure) origOnConfigure.apply(this, arguments);
				setTimeout(() => {
					this._syncWithSetNode();
					const w = this.widgets.find(w=>w.name==="get_name" || w.name==="set_name");
					if(w) {
						this._connectToSetNode(w.value);
						this.title = "(TJ) GET: " + getProviderLabelName(this.graph, w.value);
					}
				}, 100);
			};
		}
	}
});

app.registerExtension({
	name: "TJ.MultiGetNode.Wireless",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if (nodeData.name === "TJ_MultiGetNode") {
			const origOnNodeCreated = nodeType.prototype.onNodeCreated;
			nodeType.prototype.onNodeCreated = function() {
				if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);

                applyTJTheme(this);

				this.selectorCount = 0;
                if (!this._selectors || this._selectors().length === 0) {
				    this._addSelector("");
				    this._addSelector("");
                }
				this._rebuild();
			};

			const origOnDrawForeground = nodeType.prototype.onDrawForeground;
			nodeType.prototype.onDrawForeground = function(ctx) {
				if (origOnDrawForeground) origOnDrawForeground.apply(this, arguments);
				this.widgets?.forEach(w => {
					if (w.name?.startsWith("slot_") && w.options) {
						w.options.values = getAllSetNames(this.graph);
					}
				});
			};

			nodeType.prototype._selectors = function() { return (this.widgets || []).filter(w => w.name?.startsWith("slot_")); };
			nodeType.prototype._activeNames = function() { return this._selectors().map(w => w.value).filter(v => v && v !== "(none)" && !isProviderSeparator(v)); };

            nodeType.prototype._renumberSelectors = function() {
                const sels = this._selectors();
                sels.forEach((w, i) => {
                    w.name = `slot_${i + 1}`;
                });
                this.selectorCount = sels.length;
            };

            nodeType.prototype._ensureTrailingEmptySlot = function() {
                let sels = this._selectors();
                if (!sels.length) {
                    this._addSelector("");
                    sels = this._selectors();
                }
                const last = sels[sels.length - 1];
                const lastVal = last?.value;
                if (sels.length < MAX_PORTS && lastVal && lastVal !== "(none)" && !isProviderSeparator(lastVal)) {
                    this._addSelector("");
                }
                this._renumberSelectors();
            };

            nodeType.prototype._removeSlotAt = function(index) {
                const sels = this._selectors();
                if (index < 0 || index >= sels.length) return false;

                this._tj_removing_multiget_slot = true;
                try {
                    if (this.inputs?.[index]?.link != null && this.graph) {
                        const lid = this.inputs[index].link;
                        if (getGraphLink(this.graph, lid)) this.graph.removeLink(lid);
                    }
                    if (this.outputs?.[index]?.links?.length && this.graph) {
                        [...this.outputs[index].links].forEach(lid => {
                            if (getGraphLink(this.graph, lid)) this.graph.removeLink(lid);
                        });
                    }

                    const wi = this.widgets.indexOf(sels[index]);
                    if (wi !== -1) this.widgets.splice(wi, 1);

                    if (this.inputs?.[index] && typeof this.removeInput === "function") this.removeInput(index);
                    if (this.outputs?.[index] && typeof this.removeOutput === "function") this.removeOutput(index);
                } finally {
                    this._tj_removing_multiget_slot = false;
                }

                this._renumberSelectors();
                this._ensureTrailingEmptySlot();
                this._rebuild();
                this.setDirtyCanvas?.(true, true);
                app.canvas?.setDirty(true, true);
                return true;
            };

            nodeType.prototype._disconnectSlotAt = function(index) {
                const sels = this._selectors();
                const w = sels[index];
                if (!w) return false;
                w.value = "(none)";
                w._tj_previous_value = "(none)";
                removeConsumerInputLink(this, index);
                this._rebuild();
                app.canvas?.setDirty(true, true);
                return true;
            };

            nodeType.prototype._renameSlotAt = function(index) {
                const out = this.outputs?.[index];
                if (!out) return false;
                const current = String(out._tj_custom_label || out.name || out.label || `output_${index + 1}`).replace(/\s*▶$/, "");
                const next = prompt("Rename MultiGet slot", current);
                if (next == null) return false;
                const clean = String(next || "").trim();
                out._tj_custom_label = clean;
                if (clean) {
                    out.name = clean;
                    out.label = `${clean} ▶`;
                }
                this._rebuild();
                app.canvas?.setDirty(true, true);
                return true;
            };


            nodeType.prototype._lastRemovableSlotIndex = function() {
                const sels = this._selectors ? this._selectors() : [];
                // Remove Last Slot must target the last real/selected slot, not the auto trailing (none) slot.
                for (let i = sels.length - 1; i >= 0; i--) {
                    const v = sels[i]?.value;
                    if (v && v !== "(none)" && !isProviderSeparator(v)) return i;
                }
                return -1;
            };

            nodeType.prototype._compactEmptySlots = function() {
                const sels = this._selectors();
                const keep = sels
                    .map((w, i) => ({
                        value: w?.value,
                        customLabel: this.outputs?.[i]?._tj_custom_label || ""
                    }))
                    .filter(item => item.value && item.value !== "(none)" && !isProviderSeparator(item.value));

                // Remove all current wireless input links and downstream links once, then rebuild
                // from the compacted slot list. Compact is the only command allowed to shift slots.
                this._tj_connecting_wireless = true;
                try {
                    for (const inp of [...(this.inputs || [])]) {
                        if (inp?.link != null && this.graph && getGraphLink(this.graph, inp.link)) this.graph.removeLink(inp.link);
                    }
                    for (const out of [...(this.outputs || [])]) {
                        if (out?.links?.length && this.graph) {
                            [...out.links].forEach(lid => { if (getGraphLink(this.graph, lid)) this.graph.removeLink(lid); });
                        }
                    }
                } finally {
                    this._tj_connecting_wireless = false;
                }

                this.widgets = (this.widgets || []).filter(w => !w.name?.startsWith("slot_"));
                while ((this.inputs || []).length) this.removeInput(this.inputs.length - 1);
                while ((this.outputs || []).length) this.removeOutput(this.outputs.length - 1);

                this.selectorCount = 0;
                keep.forEach(item => {
                    const w = this._addSelector(item.value);
                    if (w) w._tj_previous_value = item.value;
                });
                this._addSelector("");
                this._rebuild();
                this.setDirtyCanvas?.(true, true);
                app.canvas?.setDirty(true, true);
                return true;
            };

			nodeType.prototype._addSelector = function(initial) {
				if (this._selectors().length >= MAX_PORTS) return null;
				const idx = ++this.selectorCount;

				const w = this.addWidget("combo", `slot_${idx}`, initial || "(none)", (v) => {
					this._onChange(w, v);
				}, { values: ["(none)"] });

				return w;
			};

			nodeType.prototype._onChange = function(w, v) {
                if (isProviderSeparator(v)) { w.value = w._tj_previous_value || "(none)"; return; }
                w._tj_previous_value = v;
				this._rebuild();
				const sels = this._selectors();
				if (v && v !== "(none)" && sels[sels.length - 1] === w && sels.length < MAX_PORTS) {
					this._addSelector("");
					this._rebuild();
				}
				app.canvas.setDirty(true, true);
			};

            nodeType.prototype._syncWithSetNodes = function() {
                let changed = false;
                const sels = this._selectors();

                for (let i = 0; i < this.inputs.length; i++) {
                    const inp = this.inputs[i];
                    if (inp && inp.link != null) {
                        const l = getGraphLink(this.graph, inp.link);
                        if (l) {
                            const src = this.graph.getNodeById(l.origin_id);
                            const providerValue = findProviderValueForLink(this.graph, src, l.origin_slot);
                            const w = sels[i];
                            if (w && providerValue && w.value !== providerValue) {
                                w.value = providerValue;
                                changed = true;
                            }
                        }
                    }
                }

                if (changed) {
                    this._rebuild();
                }
            };

			nodeType.prototype._rebuild = function() {
                this._ensureTrailingEmptySlot();
                const sels = this._selectors();
				const need = Math.max(sels.length, 1);

				while (this.inputs.length < need) this.addInput(`wire_${this.inputs.length + 1}`, "*");
				while (this.inputs.length > need) {
					const i = this.inputs.length - 1;
					if (this.inputs[i].link != null) this.graph.removeLink(this.inputs[i].link);
					this.removeInput(i);
				}

				while (this.outputs.length < need) this.addOutput(`output_${this.outputs.length + 1}`, "*");
				while (this.outputs.length > need) {
					const i = this.outputs.length - 1;
					if (this.outputs[i].links?.length) [...this.outputs[i].links].forEach(l => { if (getGraphLink(this.graph, l)) this.graph.removeLink(l); });
					this.removeOutput(i);
				}

				this.inputs.forEach((inp, i) => {
                    const out = this.outputs[i];
					inp.color_on = "transparent"; inp.color_off = "transparent"; 
					inp.name = `wire_${i+1}`; 

					if (inp.link != null) {
						const wasConnecting = !!this._tj_connecting_wireless;
						this._tj_connecting_wireless = true;
						try { this.graph.removeLink(inp.link); }
						finally { this._tj_connecting_wireless = wasConnecting; }
					}

					const widget = sels[i];
                    const name = widget?.value && !isProviderSeparator(widget.value) ? widget.value : "(none)";
					if (name && name !== "(none)") {
						const sourceInfo = findSetterSourceInfo(this.graph, name);
                        const labelName = sourceInfo?.labelName || getProviderLabelName(this.graph, name) || name;
						if (canConnectWireless(sourceInfo, this, i)) {
							sourceInfo.node.connect(sourceInfo.slot, this, i); 
                            markWirelessLink(this.graph, this, i, sourceInfo.displayName || name);
							const t = getOutputSlot(sourceInfo.node, sourceInfo.slot)?.type || "*";
							inp.type = t;
							out.type = t;
							out.name = out._tj_custom_label || labelName || t;
							markWirelessInputLabel(this, i, labelName);
							out.label = `${out._tj_custom_label || labelName} ▶`;

							const typeC = getTypeColor(t);
							if (typeC) {
								out.color_on = typeC;
								out.color_off = typeC;
							}
						} else {
                            // Provider is selected but not currently connectable.
                            // Keep this slot entity stable; do NOT delete or shift lower slots.
                            inp.type = "*";
                            out.type = "*";
                            out.name = out._tj_custom_label || "(empty)";
                            markWirelessInputLabel(this, i, labelName);
                            out.label = `${out._tj_custom_label || "(empty)"} ▶`;
                            out.color_on = null;
                            out.color_off = null;
                        }
					} else {
						inp.type = "*";
						out.type = "*";
						out.name = out._tj_custom_label || "(empty)";
						markWirelessInputLabel(this, i, "");
						out.label = `${out._tj_custom_label || "(empty)"} ▶`;
						out.color_on = null;
						out.color_off = null;
					}
				});
				applyTJTheme(this);

				this.setSize(this.computeSize());
			};

			const origOnConfigure = nodeType.prototype.onConfigure;
			nodeType.prototype.onConfigure = function(data) {
				if (origOnConfigure) origOnConfigure.apply(this, arguments);
				if (data && data.widgets_values) {
					const savedSelectors = data.widgets_values.filter(v => typeof v === "string");
					while (this._selectors().length < savedSelectors.length) this._addSelector("");
					this._selectors().forEach((w, i) => { if (savedSelectors[i] !== undefined) w.value = savedSelectors[i]; });
				}
				setTimeout(() => {
                    if (this._syncWithSetNodes) this._syncWithSetNodes();
                    this._rebuild();
                }, 100);
			};

            const origGetSlotMenuOptions = nodeType.prototype.getSlotMenuOptions;
            nodeType.prototype.getSlotMenuOptions = function(slot_info) {
                let options = origGetSlotMenuOptions ? (origGetSlotMenuOptions.apply(this, arguments) || []) : [];
                if (this.type !== "TJ_MultiGetNode") return options;

                // LiteGraph passes a slot_info object on most ComfyUI builds.
                // The old patch tried to read slot/index directly, so the menu appeared
                // but callbacks targeted index -1 or the wrong slot and did nothing.
                let index = -1;
                if (slot_info && typeof slot_info === "object") {
                    if (slot_info.input) index = this.inputs ? this.inputs.indexOf(slot_info.input) : -1;
                    if (index < 0 && slot_info.output) index = this.outputs ? this.outputs.indexOf(slot_info.output) : -1;
                    if (index < 0 && Number.isFinite(Number(slot_info.slot))) index = Number(slot_info.slot);
                    if (index < 0 && Number.isFinite(Number(slot_info.index))) index = Number(slot_info.index);
                } else if (Number.isFinite(Number(slot_info))) {
                    index = Number(slot_info);
                }

                if (index < 0 || index >= Math.max(this.inputs?.length || 0, this.outputs?.length || 0)) return options;

                const labelRaw = this.outputs?.[index]?._tj_custom_label
                    || getProviderLabelName(this.graph, this._selectors?.()[index]?.value)
                    || this.outputs?.[index]?.name
                    || this.inputs?.[index]?.type
                    || "SLOT";
                const title = String(labelRaw || "SLOT").replace(/\s*▶$/, "").toUpperCase();

                const node = this;
                const runSlotAction = (fnName) => {
                    return function() {
                        try {
                            node.graph?.beforeChange?.();
                            if (typeof node[fnName] === "function") node[fnName](index);
                            node.graph?.afterChange?.();
                            node.setDirtyCanvas?.(true, true);
                            app.canvas?.setDirty(true, true);
                        } catch (err) {
                            console.warn(`[TJ_NODE] MultiGet ${fnName} failed`, err);
                        }
                        return true;
                    };
                };

                // Native slot-dot menus are unreliable on several ComfyUI/LiteGraph builds:
                // items may be displayed but their callbacks are swallowed by the slot menu layer.
                // For MultiGet, keep this menu as guidance only and execute real actions from
                // the working node context menu path: TJ Node > Disconnect/Rename/Remove Slot...
                options = (options || []).filter(item => {
                    const label = normalizeMenuContent(item);
                    return !(label === "Disconnect Links" || label === "Rename Slot" || label === "Remove Slot");
                });

                options.push(null);
                options.push({ content: title, disabled: true });
                options.push(null);
                options.push({ content: "Slot actions: use node context menu", disabled: true });
                options.push({ content: "TJ Node > Disconnect / Rename / Remove Slot...", disabled: true });
                return options;
            };
		}
	}
});


app.registerExtension({
    name: "TJ.ProviderName.Common",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
            if (String(nodeData.name || "").includes("TJ") || providerNameWidgets(this).length) {
                applyTJTheme(this);
                attachProviderNameSync(this);
            }
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            setTimeout(() => {
                if (String(nodeData.name || "").includes("TJ") || providerNameWidgets(this).length) {
                    applyTJTheme(this);
                    attachProviderNameSync(this);
                    ensureUniqueProviderNames(this);
                    updateProviderLabels(this);
                }
            }, 100);
        };

        const origAnyConnChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function(type, index, connected) {
            const g = this.graph || app.graph;
            if (type === LiteGraph.INPUT && isWirelessProviderNode(this)) {
                // Provider input was disconnected OR reconnected.
                // Keep current get_name values, but rebuild the actual hidden wire origin.
                const vals = getProviderValuesForNode(this);
                scheduleWirelessRepair(g, connected ? 0 : 80);
                scheduleWirelessRepair(g, connected ? 80 : 220);
                forceReconnectConsumersForProviderValues(g, vals, connected ? 20 : 120);
                forceReconnectConsumersForProviderValues(g, vals, connected ? 180 : 280);
            }
            if (origAnyConnChange) origAnyConnChange.apply(this, arguments);
            if (type === LiteGraph.INPUT && isWirelessProviderNode(this)) {
                const vals = getProviderValuesForNode(this);
                forceReconnectConsumersForProviderValues(g, vals, connected ? 60 : 180);
            }
        };

        const origAnyRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function() {
            const g = this.graph || app.graph;
            if (ECLIPSE_SET_TYPES.has(this.type)) resetConsumersForEclipseSet(this);
            if (providerNameWidgets(this).length) disconnectWirelessLinksFromProvider(this);
            if (ECLIPSE_SET_TYPES.has(this.type) || providerNameWidgets(this).length) scheduleWirelessRepair(g, 120);
            if (origAnyRemoved) origAnyRemoved.apply(this, arguments);
        };
    }
});


function normalizeMenuContent(item) {
    const c = item?.content ?? item?.title ?? "";
    return String(c).replace(/<[^>]*>/g, "").trim();
}

function collectNativePropertyMenuItems(options) {
    const found = [];
    const seen = new Set();
    const walk = (items) => {
        for (const item of items || []) {
            if (!item || typeof item !== "object") continue;
            const label = normalizeMenuContent(item);
            if ((label === "Properties" || label === "Properties Panel") && !seen.has(label)) {
                seen.add(label);
                found.push(item);
            }
            const sub = item.submenu?.options || item.submenu || item.options;
            if (Array.isArray(sub)) walk(sub);
        }
    };
    walk(options);
    return found;
}

function openTJFallbackProperties(node, preferPanel = false) {
    const canvas = app.canvas;
    const calls = preferPanel
        ? [
            () => canvas?.showNodePropertiesPanel?.(node),
            () => canvas?.showNodePanel?.(node),
            () => canvas?.showShowNodePanel?.(node),
            () => canvas?.showNodeProperties?.(node),
            () => node?.showPropertiesPanel?.(),
        ]
        : [
            () => canvas?.showShowNodePanel?.(node),
            () => canvas?.showNodeProperties?.(node),
            () => canvas?.showNodePanel?.(node),
            () => canvas?.showNodePropertiesPanel?.(node),
            () => node?.showPropertiesPanel?.(),
        ];
    for (const fn of calls) {
        try {
            const r = fn();
            if (r !== undefined) return r;
        } catch (err) {}
    }
    console.warn("[TJ_NODE] Native Properties action was not found for this ComfyUI build.");
}

function addNativePropertiesIntoTJMenu(tjSubOptions, originalOptions, node) {
    const nativeItems = collectNativePropertyMenuItems(originalOptions);
    if (nativeItems.length) {
        tjSubOptions.push({
            content: "⚙️ Native Properties",
            has_submenu: true,
            submenu: { options: nativeItems }
        });
    } else {
        tjSubOptions.push({
            content: "⚙️ Properties",
            callback: () => openTJFallbackProperties(node, false)
        });
        tjSubOptions.push({
            content: "⚙️ Properties Panel",
            callback: () => openTJFallbackProperties(node, true)
        });
    }
    tjSubOptions.push(null);
}

// ─── 메뉴 및 글로벌 이벤트 제어 ───
app.registerExtension({
	name: "TJ.GlobalContext",
	setup() {
        // 1. 노드 위 우클릭 시 메뉴 추가
		const origGetMenuOptions = LGraphNode.prototype.getMenuOptions;
		LGraphNode.prototype.getMenuOptions = function(canvas) {
			const options = origGetMenuOptions ? origGetMenuOptions.call(this, canvas) : [];
			const tjSubOptions = [];

            const thisW = this.widgets?.find(w => w.name === "set_name" || w.name === "setnode_name");
            const isGetNode = (this.type === "TJ_GetNode" || this.type === "TJ_MultiGetNode");
            const hasProvider = (!isGetNode && thisW && thisW.value && thisW.value.trim() !== "");

			if (hasProvider || isGetNode || this.type === "TJ_MultiRouter") {
				tjSubOptions.push({
					content: (this.properties?.show_wire ? "👁️ Hide This Wire" : "👁️ Show This Wire"),
					callback: () => {
						if (!this.properties) this.properties = {};
						this.properties.show_wire = !this.properties.show_wire;
						app.canvas.setDirty(true, true);
					}
				});
				tjSubOptions.push(null);
			}

			if (isGetNode) {
				tjSubOptions.push({ 
					content: "🚀 Go to Source Node", 
					callback: () => {
						for (let i=0; i<this.inputs.length; i++) {
							if (this.inputs[i].link) {
								const l = getGraphLink(this.graph, this.inputs[i].link);
								const setNode = l ? this.graph.getNodeById(l.origin_id) : null;
								if (setNode) { app.canvas.centerOnNode(setNode); app.canvas.selectNode(setNode); break; }
							}
						}
					} 
				});
			} else if (hasProvider) {
				const linkIds = this.outputs?.[0]?.links || [];
				if (linkIds.length > 0) {
					const subOptions = [];
					linkIds.forEach((lid, i) => {
						const l = this.graph.links[lid] || (this.graph.links.get && this.graph.links.get(lid));
						if (l) {
							const targetNode = this.graph.getNodeById(l.target_id);
							if (targetNode) {
								subOptions.push({
									content: `🚀 Go to Get Node #${i+1}`,
									callback: () => {
										app.canvas.centerOnNode(targetNode);
										app.canvas.selectNode(targetNode);
									}
								});
							}
						}
					});
					tjSubOptions.push({ content: "🚀 Go to Get Nodes...", has_submenu: true, submenu: { options: subOptions } });
				}
			}

			if (this.type === "TJ_MultiGetNode") {
                const runMultiGetSlotAction = (fnName, slotIndex) => {
                    return () => {
                        try {
                            this.graph?.beforeChange?.();
                            if (typeof this[fnName] === "function") this[fnName](slotIndex);
                            this.graph?.afterChange?.();
                            this.setDirtyCanvas?.(true, true);
                            app.canvas?.setDirty(true, true);
                        } catch (err) {
                            console.warn(`[TJ_NODE] MultiGet ${fnName} failed`, err);
                        }
                    };
                };

                const buildSlotMenuOptions = (fnName) => {
                    const sels = this._selectors ? this._selectors() : [];
                    return sels.map((w, i) => {
                        const label = getProviderLabelName(this.graph, w.value) || w.value || "(none)";
                        const outLabel = String(this.outputs?.[i]?._tj_custom_label || this.outputs?.[i]?.name || "").replace(/\s*▶$/, "");
                        const suffix = outLabel && outLabel !== "(empty)" && outLabel !== "*" ? ` / ${outLabel}` : "";
                        return {
                            content: `slot_${i + 1} — ${label}${suffix}`,
                            callback: runMultiGetSlotAction(fnName, i)
                        };
                    });
                };

                tjSubOptions.push({
                    content: "➕ Add Slot",
                    callback: () => {
                        if (this._addSelector) this._addSelector("");
                        if (this._rebuild) this._rebuild();
                        app.canvas?.setDirty(true, true);
                    }
                });

                if (this._selectors && this._selectors().length > 0) {
                    // Slot-dot native callbacks are inconsistent between ComfyUI/LiteGraph builds.
                    // These node-context menus use the already-working TJ Node submenu path instead,
                    // so Disconnect/Rename/Remove are guaranteed to execute.
                    tjSubOptions.push({
                        content: "🔌 Disconnect Slot...",
                        has_submenu: true,
                        submenu: { options: buildSlotMenuOptions("_disconnectSlotAt") }
                    });
                    tjSubOptions.push({
                        content: "✏️ Rename Slot...",
                        has_submenu: true,
                        submenu: { options: buildSlotMenuOptions("_renameSlotAt") }
                    });
                    if (this._selectors().length > 1) {
                        tjSubOptions.push({
                            content: "✕ Remove Slot...",
                            has_submenu: true,
                            submenu: { options: buildSlotMenuOptions("_removeSlotAt") }
                        });
                        tjSubOptions.push({
                            content: "✕ Remove Last Slot",
                            callback: () => {
                                if (this._removeSlotAt) {
                                    const idx = this._lastRemovableSlotIndex ? this._lastRemovableSlotIndex() : this._selectors().length - 1;
                                    if (idx >= 0) this._removeSlotAt(idx);
                                }
                            }
                        });
                        tjSubOptions.push({
                            content: "🧹 Compact Empty Slots",
                            callback: () => {
                                try {
                                    this.graph?.beforeChange?.();
                                    if (this._compactEmptySlots) this._compactEmptySlots();
                                } finally {
                                    this.graph?.afterChange?.();
                                    this.setDirtyCanvas?.(true, true);
                                    app.canvas?.setDirty(true, true);
                                }
                            }
                        });
                    }
                }
			}

			if (this._tj_submenu_options && this._tj_submenu_options.length > 0) {
				tjSubOptions.push(...this._tj_submenu_options);
			}

			if (tjSubOptions.length > 0) tjSubOptions.push(null);

            addNativePropertiesIntoTJMenu(tjSubOptions, options, this);

			tjSubOptions.push({
				content: "➕ Add Set Node",
				callback: () => {
					const setNode = LiteGraph.createNode("TJ_SetNode");
					setNode.pos = [this.pos[0] + this.size[0] + 30, this.pos[1]];
					this.graph.add(setNode);
					app.canvas.selectNode(setNode, false);
					app.canvas.setDirty(true, true);
				}
			});

			tjSubOptions.push({
				content: "➕ Add Get Node",
				callback: () => {
					const getNode = LiteGraph.createNode("TJ_GetNode");
					getNode.pos = [this.pos[0] - 230, this.pos[1]];
					this.graph.add(getNode);
					app.canvas.selectNode(getNode, false);
					app.canvas.setDirty(true, true);
				}
			});

			tjSubOptions.push(null);

            // 🚨 노드 우클릭 시 전체 리프레시 버튼 추가
            tjSubOptions.push({
				content: "🔄 Refresh ALL Get Nodes",
				callback: () => {
                    syncAllGetNodes(app.graph);
				}
			});

            tjSubOptions.push(null);

			tjSubOptions.push({
				content: "📦 Convert ALL Outputs to Set",
				callback: () => {
					if (!this.outputs) return;
					let offsetY = 0;
					this.outputs.forEach((out, slotIdx) => {
						const setNode = LiteGraph.createNode("TJ_SetNode");
						setNode.pos = [this.pos[0] + this.size[0] + 30, this.pos[1] + offsetY];
						this.graph.add(setNode);
						this.connect(slotIdx, setNode, 0);

						const autoName = makeUniqueProviderName(this.graph, `${this.type}_${out.name}`, setNode);
						setNode.widgets.find(w => w.name === "set_name").value = autoName;
						setNode.title = "(TJ) SET: " + autoName;
                        updateProviderLabels(setNode);

						offsetY += 80;
					});
					app.canvas.setDirty(true, true);
				}
			});

			tjSubOptions.push({
				content: "📦 Convert ALL Inputs to Get",
				callback: () => {
					if (!this.inputs) return;
					let offsetY = 0;
					this.inputs.forEach((inp, slotIdx) => {
						if (inp.link != null) return;
						const getNode = LiteGraph.createNode("TJ_GetNode");
						getNode.pos = [this.pos[0] - 230, this.pos[1] + offsetY];
						this.graph.add(getNode);
						getNode.connect(0, this, slotIdx);
						offsetY += 80;
					});
					app.canvas.setDirty(true, true);
				}
			});

			tjSubOptions.push(null);

			tjSubOptions.push({
				content: (realtimeWireHoverEnabled ? "🟡 Realtime Wires View Mode OFF" : "🟡 Realtime Wires View Mode ON"),
				callback: () => {
					realtimeWireHoverEnabled = !realtimeWireHoverEnabled;
					app.canvas.setDirty(true, true);
				}
			});

			tjSubOptions.push({
				content: (globalShowWire ? "🛑 Hide ALL Wires (전체 숨김)" : "🌐 Show ALL Wires (전체 보기)"),
				callback: () => {
					globalShowWire = !globalShowWire;
					app.canvas.setDirty(true, true);
				}
			});

			const cleanOptions = options.filter(o => {
                const label = normalizeMenuContent(o);
                return !(o && (o.content === "🟩 TJ Node" || label === "Properties" || label === "Properties Panel"));
            });
			cleanOptions.push(null, {
				content: "🟩 TJ Node",
				has_submenu: true,
				submenu: { options: tjSubOptions }
			});

            // MultiGet slot actions are also exposed in the top-level node menu.
            // This mirrors the TJ Node submenu actions but avoids the unreliable slot-dot callback layer.
            if (this.type === "TJ_MultiGetNode" && this._selectors) {
                const runRootMultiGetSlotAction = (fnName, slotIndex) => {
                    return () => {
                        try {
                            this.graph?.beforeChange?.();
                            if (typeof this[fnName] === "function") this[fnName](slotIndex);
                            this.graph?.afterChange?.();
                            this.setDirtyCanvas?.(true, true);
                            app.canvas?.setDirty(true, true);
                        } catch (err) {
                            console.warn(`[TJ_NODE] MultiGet ${fnName} failed`, err);
                        }
                    };
                };

                const buildRootSlotMenuOptions = (fnName) => {
                    const sels = this._selectors ? this._selectors() : [];
                    return sels.map((w, i) => {
                        const label = getProviderLabelName(this.graph, w.value) || w.value || "(none)";
                        const outLabel = String(this.outputs?.[i]?._tj_custom_label || this.outputs?.[i]?.name || "").replace(/\s*▶$/, "");
                        const suffix = outLabel && outLabel !== "(empty)" && outLabel !== "*" ? ` / ${outLabel}` : "";
                        return {
                            content: `slot_${i + 1} — ${label}${suffix}`,
                            callback: runRootMultiGetSlotAction(fnName, i)
                        };
                    });
                };

                cleanOptions.push(null);
                cleanOptions.push({
                    content: "🔌 Disconnect Slot...",
                    has_submenu: true,
                    submenu: { options: buildRootSlotMenuOptions("_disconnectSlotAt") }
                });
                cleanOptions.push({
                    content: "✏️ Rename Slot...",
                    has_submenu: true,
                    submenu: { options: buildRootSlotMenuOptions("_renameSlotAt") }
                });
                if (this._selectors().length > 1) {
                    cleanOptions.push({
                        content: "✕ Remove Slot...",
                        has_submenu: true,
                        submenu: { options: buildRootSlotMenuOptions("_removeSlotAt") }
                    });
                    cleanOptions.push({
                        content: "✕ Remove Last Slot",
                        callback: () => {
                            if (this._removeSlotAt) {
                                const idx = this._lastRemovableSlotIndex ? this._lastRemovableSlotIndex() : -1;
                                if (idx >= 0) this._removeSlotAt(idx);
                            }
                        }
                    });
                    cleanOptions.push({
                        content: "🧹 Compact Empty Slots",
                        callback: () => {
                            if (this._compactEmptySlots) this._compactEmptySlots();
                        }
                    });
                }
            }

            // TJ Node 밖에도 기본 Properties 계열 메뉴를 안전망으로 강제 노출
            cleanOptions.push({
                content: "Properties",
                callback: () => openTJFallbackProperties(this, false)
            });
            cleanOptions.push({
                content: "Properties Panel",
                callback: () => openTJFallbackProperties(this, true)
            });

			return cleanOptions;
		};

        // 2. 캔버스 빈 공간 우클릭 시 메뉴 추가
		const origGetCanvasMenuOptions = LGraphCanvas.prototype.getCanvasMenuOptions;
		LGraphCanvas.prototype.getCanvasMenuOptions = function() {
			const options = origGetCanvasMenuOptions ? origGetCanvasMenuOptions.apply(this, arguments) : [];
			
            const tjSubOptions = [];

            tjSubOptions.push({
                content: "➕ Add Set Node",
                callback: () => {
                    const setNode = LiteGraph.createNode("TJ_SetNode");
                    setNode.pos = [this.graph_mouse[0], this.graph_mouse[1]];
                    this.graph.add(setNode);
                    app.canvas.selectNode(setNode, false);
                    app.canvas.setDirty(true, true);
                }
            });

            tjSubOptions.push({
                content: "➕ Add Get Node",
                callback: () => {
                    const getNode = LiteGraph.createNode("TJ_GetNode");
                    getNode.pos = [this.graph_mouse[0], this.graph_mouse[1]];
                    this.graph.add(getNode);
                    app.canvas.selectNode(getNode, false);
                    app.canvas.setDirty(true, true);
                }
            });

            tjSubOptions.push(null);

            // 🚨 캔버스 우클릭 메뉴에도 전체 리프레시 추가
            tjSubOptions.push({
                content: "🔄 Refresh ALL Get Nodes",
                callback: () => {
                    syncAllGetNodes(app.graph);
                }
            });

            tjSubOptions.push(null);

            tjSubOptions.push({
                content: (realtimeWireHoverEnabled ? "🟡 Realtime Wires View Mode OFF" : "🟡 Realtime Wires View Mode ON"),
                callback: () => {
                    realtimeWireHoverEnabled = !realtimeWireHoverEnabled;
                    app.canvas.setDirty(true, true);
                }
            });

            tjSubOptions.push({
                content: (globalShowWire ? "🛑 Hide ALL Wires (전체 숨김)" : "🌐 Show ALL Wires (전체 보기)"),
                callback: () => {
                    globalShowWire = !globalShowWire;
                    app.canvas.setDirty(true, true);
                }
            });

            // "🟩 TJ Node"를 메인 메뉴에 추가
            const cleanOptions = options.filter(o => !(o && o.content === "🟩 TJ Node"));
            cleanOptions.push(null, {
                content: "🟩 TJ Node",
                has_submenu: true,
                submenu: { options: tjSubOptions }
            });

            return cleanOptions;
		};
	}
});