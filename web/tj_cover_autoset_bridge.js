// -----------------------------------------------------------------------------
// TJ_NODE Cover Auto Set Bridge
//
// Shared bridge for TJ_NODE cover/adapted nodes that expose output auto_sets.
// This file does NOT modify set_getnode_tj.js. It wraps TJ_NODE public globals:
//
// - window.TJ_NODE_getAllSetNames
// - window.TJ_NODE_findSetterSourceInfo
//
// Cover nodes only need to call:
//   window.TJ_NODE_registerCoverAutoSetType("TJ_YourNodeType")
//
// Required per node:
//   node.widgets has auto_set BOOLEAN
//   node.properties.auto_sets = { outputSlotIndex: "provider/name" }
// -----------------------------------------------------------------------------

import { app } from "../../scripts/app.js";

const TJ_PREFIX = "TJ / ";
const NONE = "(none)";

function normalizeName(value) {
    return String(value || "").trim();
}

function stripTJPrefix(value) {
    return String(value || "").replace(/^TJ\s*\/\s*/, "").trim();
}

function displayName(name) {
    const clean = stripTJPrefix(name);
    return clean ? `${TJ_PREFIX}${clean}` : "";
}

function getGraph(graph) {
    return graph || app.graph;
}

function getOutputSlot(node, slot) {
    return node?.outputs?.[slot] || null;
}

function getAutoSetWidget(node) {
    return node?.widgets?.find(w => w.name === "auto_set") || null;
}

function isAutoSetEnabled(node) {
    const w = getAutoSetWidget(node);
    return !!w?.value;
}

function registeredTypes() {
    window.TJ_NODE_COVER_AUTOSET_TYPES = window.TJ_NODE_COVER_AUTOSET_TYPES || [];
    return window.TJ_NODE_COVER_AUTOSET_TYPES;
}

function isCoverAutoSetNode(node) {
    return !!(
        node &&
        registeredTypes().includes(node.type) &&
        node.properties?.auto_sets &&
        isAutoSetEnabled(node)
    );
}

function collectCoverProviders(graph) {
    graph = getGraph(graph);
    const providers = [];
    if (!graph?._nodes) return providers;

    for (const node of graph._nodes) {
        if (!isCoverAutoSetNode(node)) continue;

        for (const [idxRaw, rawName] of Object.entries(node.properties.auto_sets || {})) {
            const slot = parseInt(idxRaw);
            const name = stripTJPrefix(rawName);
            if (!name || !Number.isFinite(slot) || !getOutputSlot(node, slot)) continue;

            providers.push({
                source: "tj",
                kind: "cover_auto",
                node,
                slot,
                name,
                labelName: name,
                displayName: displayName(name),
                connectable: true,
            });
        }
    }

    return providers;
}

function findCoverProviderByValue(graph, value) {
    if (!value || value === NONE) return null;
    const wantedDisplay = displayName(value);
    const wantedRaw = stripTJPrefix(value);

    return collectCoverProviders(graph).find(p =>
        p.displayName === value ||
        p.displayName === wantedDisplay ||
        p.name === value ||
        p.name === wantedRaw
    ) || null;
}

function installBridge() {
    // set_getnode_tj.js may load before or after this file, so install only when
    // public TJ_NODE functions exist. Retry is handled below.
    if (!window.TJ_NODE_getAllSetNames || !window.TJ_NODE_findSetterSourceInfo) return false;

    if (window.TJ_NODE_COVER_AUTOSET_BRIDGE_INSTALLED) return true;
    window.TJ_NODE_COVER_AUTOSET_BRIDGE_INSTALLED = true;

    const baseGetAll = window.TJ_NODE_getAllSetNames;
    const baseFind = window.TJ_NODE_findSetterSourceInfo;
    const baseFindProvider = window.TJ_NODE_findProviderByValue;
    const baseCollect = window.TJ_NODE_collectAllProviders;
    const baseLabel = window.TJ_NODE_getProviderLabelName;

    window.TJ_NODE_collectCoverAutoSetProviders = collectCoverProviders;

    window.TJ_NODE_collectAllProviders = function(graph) {
        const base = baseCollect ? baseCollect(graph) : [];
        const extra = collectCoverProviders(graph);
        const seen = new Set();
        const merged = [];
        for (const p of [...base, ...extra]) {
            const key = `${p.source}:${p.kind}:${p.node?.id}:${p.slot}:${p.displayName}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(p);
        }
        return merged;
    };

    window.TJ_NODE_getAllSetNames = function(graph) {
        const base = baseGetAll ? baseGetAll(graph) : [NONE];
        const list = Array.isArray(base) ? [...base] : [NONE];

        for (const p of collectCoverProviders(graph)) {
            if (p.displayName && !list.includes(p.displayName)) list.push(p.displayName);
        }

        return list;
    };

    window.TJ_NODE_findSetterSourceInfo = function(graph, setName) {
        const found = baseFind ? baseFind(graph, setName) : null;
        if (found) return found;

        const p = findCoverProviderByValue(graph, setName);
        if (!p) return null;

        return {
            source: p.source,
            kind: p.kind,
            node: p.node,
            slot: p.slot,
            name: p.name,
            labelName: p.labelName,
            displayName: p.displayName,
            connectable: true,
        };
    };

    window.TJ_NODE_findProviderByValue = function(graph, value) {
        const found = baseFindProvider ? baseFindProvider(graph, value) : null;
        if (found) return found;
        return findCoverProviderByValue(graph, value);
    };

    window.TJ_NODE_getProviderLabelName = function(graph, value) {
        const p = findCoverProviderByValue(graph, value);
        if (p) return p.labelName;
        if (baseLabel) return baseLabel(graph, value);
        return stripTJPrefix(value);
    };

    console.log("[TJ_NODE] Cover AutoSet Bridge installed");
    return true;
}

function scheduleInstall() {
    installBridge();
    requestAnimationFrame(installBridge);
    setTimeout(installBridge, 100);
    setTimeout(installBridge, 300);
    setTimeout(installBridge, 800);
}

window.TJ_NODE_registerCoverAutoSetType = function(typeName) {
    const type = normalizeName(typeName);
    if (!type) return;

    const list = registeredTypes();
    if (!list.includes(type)) list.push(type);

    scheduleInstall();

    // Refresh wireless lists after provider type registration.
    setTimeout(() => {
        try {
            window.TJ_NODE_scheduleWirelessRepair?.(app.graph, 80);
        } catch (_) {}
    }, 120);
};

scheduleInstall();

export {};
