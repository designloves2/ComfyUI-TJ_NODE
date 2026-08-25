// web/tj_h3_audio_lock.js — MiniMax H3 Audio Lock (TJ)
//
// 담당: mode 에 따른 strength 위젯 표시/숨김, 출력 Auto Set 라벨, 테마.
// Registry/무선 연결은 set_getnode_tj.js 의 기존 시스템을 그대로 쓴다(재구현 금지).

import { app } from "../../scripts/app.js";

const NODE_TYPE = "TJ_H3_AudioLock";

const OUTPUT_SPECS = [
    { name: "av_latent", type: "LATENT" },
    { name: "audio", type: "AUDIO" },
    { name: "report", type: "STRING" },
];

// get_name 위젯 ↔ 입력 슬롯 매핑. 타입 필터는 defaultType 으로 걸린다.
const GET_SLOTS = [
    { widgetName: "get_name_av_latent", inputName: "av_latent", defaultType: "LATENT" },
    { widgetName: "get_name_audio", inputName: "audio", defaultType: "AUDIO" },
    { widgetName: "get_name_audio_vae", inputName: "audio_vae", defaultType: "VAE" },
];

function findWidget(node, name) {
    return node?.widgets?.find(w => w?.name === name) || null;
}
function markDirty(node) {
    node?.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty?.(true, true);
}
function applyTheme(node) {
    if (typeof window.TJ_NODE_applyTheme === "function") return window.TJ_NODE_applyTheme(node);
    node.bgcolor = "#000000";
    node.color = "#7612DA";
    node.title_text_color = "#FFFFFF";
}

// 숨겨도 위젯 값 자체는 그대로 남으므로 Save/Load/Refresh 후에도 값이 복원된다.
// (type 만 "hidden" 으로 바꾸고 원래 값을 건드리지 않는 것이 핵심)
function setWidgetVisible(widget, visible) {
    if (!widget) return;
    if (!widget._tj_h3al_saved) {
        widget._tj_h3al_saved = { type: widget.type, computeSize: widget.computeSize };
    }
    widget.type = visible ? widget._tj_h3al_saved.type : "hidden";
    widget.computeSize = visible ? widget._tj_h3al_saved.computeSize : () => [0, -4];
    widget.hidden = !visible;
    widget.disabled = !visible;
}

function applyModeVisibility(node) {
    const mode = String(findWidget(node, "mode")?.value || "lock");
    setWidgetVisible(findWidget(node, "strength"), mode === "remix");
    // 구조가 바뀌었으니 높이만 다시 계산 — 사용자가 잡아둔 가로 폭은 유지한다.
    const width = node.size?.[0];
    const computed = node.computeSize?.();
    if (computed) node.setSize([width || computed[0], computed[1]]);
    markDirty(node);
}

function updateAutoSet(node) {
    if (!node) return;
    node.properties = node.properties || {};
    node.properties.auto_sets = {};
    const enabled = !!findWidget(node, "auto_set")?.value;

    OUTPUT_SPECS.forEach((spec, i) => {
        const out = node.outputs?.[i];
        if (!out) return;
        out.name = spec.name;
        out.type = spec.type;
        if (enabled) {
            // Registry Name = Output Label = Get Selection Name 완전 일치가 규칙.
            // 중복 시 _1/_2 넘버링은 Core 의 ensureUniqueAutoSetNames 가 처리한다.
            node.properties.auto_sets[i] = spec.name;
            out.label = `${spec.name} ▶`;
        } else {
            out.label = spec.name;
        }
    });

    // 이름 중복 해소와 Get 목록 갱신은 Core 가 담당한다.
    window.TJ_NODE_ensureUniqueAutoSetNames?.(node.graph || app.graph);
    window.TJ_NODE_syncAllGetNodes?.(node.graph || app.graph);
    window.TJ_NODE_scheduleWirelessRepair?.(node.graph || app.graph, 80);
    markDirty(node);
}

function install(node) {
    if (!node || node._tj_h3al_installed) return;
    node._tj_h3al_installed = true;
    applyTheme(node);

    // 입력 3개에 Embedded Get 부착 — 타입 필터는 각 슬롯의 defaultType 으로 걸린다.
    for (const spec of GET_SLOTS) {
        const idx = node.inputs?.findIndex(i => (i?.widget?.name || i?.name) === spec.inputName);
        if (idx == null || idx < 0) continue;
        window.TJ_NODE_attachGetReceiver?.(node, {
            widgetName: spec.widgetName,
            inputIndex: idx,
            inputName: spec.inputName,
            defaultType: spec.defaultType,
        });
    }

    const modeW = findWidget(node, "mode");
    if (modeW && !modeW._tj_h3al_cb) {
        modeW._tj_h3al_cb = true;
        const orig = modeW.callback;
        modeW.callback = function (v) {
            if (orig) orig.call(this, v, app.canvas, node);
            applyModeVisibility(node);
        };
    }

    const autoW = findWidget(node, "auto_set");
    if (autoW && !autoW._tj_h3al_cb) {
        autoW._tj_h3al_cb = true;
        const orig = autoW.callback;
        autoW.callback = function (v) {
            if (orig) orig.call(this, v, app.canvas, node);
            updateAutoSet(node);
        };
    }

    applyModeVisibility(node);
    updateAutoSet(node);
}

app.registerExtension({
    name: "TJ_NODE.H3AudioLock",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            setTimeout(() => install(this), 0);
            return r;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (data) {
            const r = onConfigure?.apply(this, arguments);
            // 저장된 mode 값에 맞춰 다시 숨김 상태를 복원한다.
            setTimeout(() => { install(this); applyModeVisibility(this); updateAutoSet(this); }, 0);
            return r;
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            this._tjUpdateGetReceiverOptions?.();
            return onDrawForeground?.apply(this, arguments);
        };
    },
    nodeCreated(node) {
        if (node?.type === NODE_TYPE) setTimeout(() => install(node), 0);
    },
});
