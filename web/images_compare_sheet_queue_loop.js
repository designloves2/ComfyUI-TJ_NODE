// web/images_compare_sheet_queue_loop.js
import { app } from "../../scripts/app.js";

const NODE_NAME = "TJ_ImagesCompareSheetQueueLoop";
const DEFAULT_AUTO_SETS = {
    0: "Images Compare Sheet/image",
    1: "Images Compare Sheet/name",
};

function applyTheme(node) {
    if (window.TJ_NODE_applyTheme) window.TJ_NODE_applyTheme(node);
    else {
        node.bgcolor = "#000000";
        node.color = "#7612DA";
        node.title_text_color = "#FFFFFF";
    }
}

function syncAutoSetLabels(node) {
    const enabled = !!node.widgets?.find(w => w.name === "auto_set")?.value;
    node.properties = node.properties || {};
    node.properties.auto_sets = node.properties.auto_sets || { ...DEFAULT_AUTO_SETS };

    [0, 1].forEach((slot) => {
        const out = node.outputs?.[slot];
        if (!out) return;
        const base = node.properties.auto_sets[slot] || DEFAULT_AUTO_SETS[slot];
        out.label = enabled ? `${base} ▶` : "";
    });

    if (enabled && window.TJ_NODE_ensureUniqueAutoSetNames) {
        window.TJ_NODE_ensureUniqueAutoSetNames(node.graph || app.graph);
    }
    if (window.TJ_NODE_syncAllGetNodes) window.TJ_NODE_syncAllGetNodes(node.graph || app.graph);
    node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "TJ.ImagesCompareSheetQueueLoop",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            originalCreated?.apply(this, arguments);
            applyTheme(this);
            this.properties = this.properties || {};
            this.properties.auto_sets = this.properties.auto_sets || { ...DEFAULT_AUTO_SETS };

            const autoSet = this.widgets?.find(w => w.name === "auto_set");
            if (autoSet) {
                const oldCallback = autoSet.callback;
                autoSet.callback = (value) => {
                    oldCallback?.call(autoSet, value);
                    syncAutoSetLabels(this);
                };
            }
            syncAutoSetLabels(this);
        };

        const originalConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            originalConfigure?.apply(this, arguments);
            setTimeout(() => {
                applyTheme(this);
                syncAutoSetLabels(this);
            }, 0);
        };
    },
});
