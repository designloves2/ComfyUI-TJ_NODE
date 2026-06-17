import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "TJ.TimeSegmentList.Theme",
    async beforeRegisterNodeDef(nodeType, nodeData, _app) {
        if (nodeData.name !== "TimeSegmentListNode") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            const r = origOnNodeCreated ? origOnNodeCreated.apply(this, arguments) : undefined;
            window.TJ_NODE_applyTheme(this);
            return r;
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            requestAnimationFrame(() => window.TJ_NODE_applyTheme(this));
        };
    },
});
