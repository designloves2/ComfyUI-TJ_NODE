// web/qwen_image21_encode_tj.js
// Text Encode Qwen Image 2.1 (TJ) — embedded Get on the "images" input +
// 4-output Auto Set (model/positive/negative/latent), same recipe as
// video_resize_tj.js / ltx25_clip_gguf_tj.js / krea2_*_gguf_tj.js.

import { app } from "../../scripts/app.js";

const NODE_CLASS = "TJ_TextEncodeQwenImage21";
const OUTPUT_NAMES = ["model", "positive", "negative", "latent"];

function collectExistingSets(node) {
    const used = new Set();
    for (const n of node.graph?._nodes || []) {
        if (n === node) continue;
        if (n.type === "TJ_SetNode") {
            const w = n.widgets?.find((x) => x.name === "set_name" || x.name === "setnode_name");
            if (w?.value) used.add(String(w.value).trim());
        }
        if (n.properties?.auto_sets) {
            Object.values(n.properties.auto_sets).forEach((v) => { if (v) used.add(String(v).trim()); });
        }
    }
    return used;
}

function notifyGetNodes(node) {
    setTimeout(() => {
        for (const n of node.graph?._nodes || []) {
            if (n.type === "TJ_GetNode") {
                if (n._syncWithSetNode) n._syncWithSetNode();
                const w = n.widgets?.find((x) => x.name === "set_name");
                if (w && n._connectToSetNode) n._connectToSetNode(w.value);
            }
            if (n.type === "TJ_MultiGetNode") {
                if (n._syncWithSetNodes) n._syncWithSetNodes();
                if (n._rebuild) n._rebuild();
            }
        }
        app.canvas?.setDirty(true, true);
    }, 50);
}

function updateAutoSets(node) {
    if (!node || !node.graph) return;
    if (!node.properties) node.properties = {};
    const setW = node.widgets?.find((w) => w.name === "setnode_name" || w.name === "set_name");
    const enabled = !!(node.widgets?.find((w) => w.name === "auto_set")?.value);

    node.properties.auto_sets = {};
    const used = collectExistingSets(node);
    const base = String(setW?.value || node.title || "QwenImage21").trim();

    (node.outputs || []).forEach((out, i) => {
        if (!out) return;
        const raw = OUTPUT_NAMES[i] || `out_${i + 1}`;
        const setLabel = (txt) => { out.name = txt; out.label = txt; out.localized_name = txt; };
        if (!enabled) { setLabel(raw); return; }
        let finalName = `${base}_${raw}`;
        let tries = 1;
        while (used.has(finalName)) finalName = `${base}_${raw}_${tries++}`;
        used.add(finalName);
        node.properties.auto_sets[i] = finalName;
        setLabel(`${finalName} ▶`);
    });

    node.setDirtyCanvas?.(true, true);
    notifyGetNodes(node);
}

function installAutoSet(node) {
    const autoW = node.widgets?.find((x) => x.name === "auto_set");
    if (autoW && !autoW._tj_qwen21_attached) {
        autoW._tj_qwen21_attached = true;
        const orig = autoW.callback;
        autoW.callback = function (v) { if (orig) orig.call(this, v); updateAutoSets(node); };
    }
    const setW = node.widgets?.find((x) => x.name === "setnode_name" || x.name === "set_name");
    if (setW && !setW._tj_qwen21_name_attached) {
        setW._tj_qwen21_name_attached = true;
        const orig = setW.callback;
        setW.callback = function (v) { if (orig) orig.call(this, v); updateAutoSets(node); };
    }
    requestAnimationFrame(() => updateAutoSets(node));
}

function setup(node) {
    if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;
    try { window.TJ_NODE_applyTheme?.(node); } catch (_) {}
    try { window.TJ_NODE_attachProviderNameSync?.(node); } catch (_) {}
    // node.inputs 순서: model, clip (required 소켓) 다음 vae, images (optional 소켓) —
    // prompt/negative_prompt/resolution/max_shift/... 는 위젯이라 소켓이 아니다.
    try { window.TJ_NODE_attachGetReceiver?.(node, { inputIndex: 3, inputName: "images", defaultType: "IMAGE" }); } catch (_) {}
    installAutoSet(node);
}

app.registerExtension({
    name: "TJ.TextEncodeQwenImage21",
    async nodeCreated(node) {
        setup(node);
        const origOnConfigure = node.onConfigure;
        node.onConfigure = function (data) {
            origOnConfigure?.apply(this, arguments);
            requestAnimationFrame(() => {
                setup(this);
                this._tjUpdateGetReceiverOptions?.();
                const gw = this.widgets?.find(w => w.name === "get_name");
                if (gw && gw.value && gw.value !== "(none)") this._tjConnectGetReceiver?.(gw.value);
            });
        };
        const origOnDrawForeground = node.onDrawForeground;
        node.onDrawForeground = function (ctx) {
            this._tjUpdateGetReceiverOptions?.();
            return origOnDrawForeground?.apply(this, arguments);
        };
    },
});
