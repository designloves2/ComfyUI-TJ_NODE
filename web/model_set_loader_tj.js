// web/model_set_loader_tj.js
// TJ_ModelSetLoader — Auto Set (Wireless) support for MODEL / CLIP / VAE outputs.

import { app } from "../../scripts/app.js";

const OUTPUT_NAMES = ["MODEL", "CLIP", "VAE"];

function autoSetEnabled(node) {
    return !!(node?.widgets?.find(w => w.name === "auto_set")?.value);
}

function getBaseName(node) {
    const setW = node.widgets?.find(w => w.name === "setnode_name" || w.name === "set_name");
    return String(setW?.value || node.title || "ModelSet").trim();
}

function applyOutputArrows(node, enabled) {
    (node.outputs || []).forEach(out => {
        if (!out) return;
        const orig = out._tj_orig_name || out.name || "";
        if (!out._tj_orig_name) out._tj_orig_name = orig;
        if (enabled) {
            const display = out._tj_auto_label || orig;
            out.name = `${display} ▶`;
            out.label = `${display} ▶`;
            out.localized_name = `${display} ▶`;
        } else {
            out.name = orig;
            out.label = orig;
            out.localized_name = orig;
        }
    });
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

function updateAutoSets(node) {
    if (!node) return;
    if (!node.properties) node.properties = {};

    const enabled = autoSetEnabled(node);
    if (!enabled) {
        node.properties.auto_sets = {};
        // 원래 출력 이름으로 복원
        (node.outputs || []).forEach((out, idx) => {
            if (!out) return;
            const orig = out._tj_orig_name || OUTPUT_NAMES[idx] || `out_${idx}`;
            out.name = orig;
            out.label = orig;
            out.localized_name = orig;
            delete out._tj_auto_label;
        });
    } else {
        const base = getBaseName(node);
        const autoSets = {};
        (node.outputs || []).forEach((out, idx) => {
            if (!out) return;
            const slotName = OUTPUT_NAMES[idx] || `OUT_${idx + 1}`;
            const fullName = base ? `${base}/${slotName}` : slotName;
            autoSets[idx] = fullName;
            out._tj_auto_label = fullName;
            out.name = `${fullName} ▶`;
            out.label = `${fullName} ▶`;
            out.localized_name = `${fullName} ▶`;
        });
        node.properties.auto_sets = autoSets;
    }

    if (window.TJ_NODE_ensureUniqueAutoSetNames && node.graph) {
        window.TJ_NODE_ensureUniqueAutoSetNames(node.graph);
    }
    if (window.TJ_NODE_scheduleWirelessRepair && node.graph) {
        window.TJ_NODE_scheduleWirelessRepair(node.graph, 80);
    }
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

function installAutoSet(node) {
    const autoW = node.widgets?.find(w => w.name === "auto_set");
    if (autoW && !autoW._tj_msl_attached) {
        autoW._tj_msl_attached = true;
        const orig = autoW.callback;
        autoW.callback = function(v) {
            if (orig) orig.call(this, v);
            updateAutoSets(node);
        };
    }
    requestAnimationFrame(() => updateAutoSets(node));
}

app.registerExtension({
    name: "TJ.ModelSetLoader",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "TJ_ModelSetLoader") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            origOnNodeCreated?.call(this);
            // 원본 출력 이름 보존
            (this.outputs || []).forEach((out, idx) => {
                if (out && !out._tj_orig_name) {
                    out._tj_orig_name = out.name || OUTPUT_NAMES[idx] || `out_${idx}`;
                }
            });
            installAutoSet(this);
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            origOnConfigure?.call(this, info);
            (this.outputs || []).forEach((out, idx) => {
                if (out && !out._tj_orig_name) {
                    out._tj_orig_name = OUTPUT_NAMES[idx] || `out_${idx}`;
                }
            });
            installAutoSet(this);
        };
    },
});
