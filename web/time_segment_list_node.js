import { app } from "../../scripts/app.js";

function applyTJTheme(node) {
    if (window.TJ_NODE_applyTheme) return window.TJ_NODE_applyTheme(node);
    node.bgcolor = "#000000";
    node.color = "#7612DA";
    node.title_text_color = "#FFFFFF";
}

app.registerExtension({
    name: "TJ.TimeSegmentList.Theme",
    async beforeRegisterNodeDef(nodeType, nodeData, _app) {
        if (nodeData.name !== "TimeSegmentListNode") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            const r = origOnNodeCreated ? origOnNodeCreated.apply(this, arguments) : undefined;
            applyTJTheme(this);
            return r;
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            requestAnimationFrame(() => applyTJTheme(this));
        };
    },
});
