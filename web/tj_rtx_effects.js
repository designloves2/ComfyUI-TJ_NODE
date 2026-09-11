// web/tj_rtx_effects.js
// RTX Deblur / RTX Denoise / RTX VSR (TJ) — embedded get/set binding.
// Same minimal recipe as TJ_SaveAndPreviewVideo (see utility_node_tj.js): get_name
// bound to the single "images" input, setnode_name syncs the provider name. No
// auto_set — single IMAGE output, a plain embedded Set covers it.

import { app } from "../../scripts/app.js";

const NODE_TYPES = new Set(["TJ_NODE_RTXDeblur", "TJ_NODE_RTXDenoise", "TJ_NODE_RTXVSR"]);

function setup(node) {
    window.TJ_NODE_applyTheme?.(node);
    window.TJ_NODE_attachProviderNameSync?.(node);
    window.TJ_NODE_attachGetReceiver?.(node, { inputIndex: 0, inputName: "images", defaultType: "IMAGE" });
}

app.registerExtension({
    name: "TJ.RTXEffects.EmbeddedGet",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!NODE_TYPES.has(nodeData.name)) return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origOnNodeCreated?.apply(this, arguments);
            setup(this);
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (data) {
            origOnConfigure?.apply(this, arguments);
            setTimeout(() => {
                setup(this);
                this._tjUpdateGetReceiverOptions?.();
                const gw = this.widgets?.find(w => w.name === "get_name");
                if (gw && gw.value && gw.value !== "(none)") this._tjConnectGetReceiver?.(gw.value);
            }, 100);
        };

        const origOnDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            this._tjUpdateGetReceiverOptions?.();
            return origOnDrawForeground?.apply(this, arguments);
        };
    },
});
