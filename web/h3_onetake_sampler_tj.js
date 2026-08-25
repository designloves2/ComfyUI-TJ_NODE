// MiniMax H3 One-Take Sampler (TJ)
// tile_decode 가 꺼져 있으면 tile_size/overlap/temporal_size/temporal_overlap 위젯을 숨긴다.
// index/checkpoint_name은 one_take OFF여도 숨기지 않는다 — index는 Prompt Queue와
// 와이어로 연결돼야 하는데, 위젯을 숨기면 연결점(dot)까지 같이 사라져서 와이어를
// 꽂을 수 없게 되기 때문(tile_size 등 순수 값 위젯과 달리 연결이 필요한 위젯이다).

import { app } from "../../scripts/app.js";

const NODE_TYPE = "TJ_H3_OneTakeSampler";
const TILE_WIDGETS = ["tile_size", "overlap", "temporal_size", "temporal_overlap"];

function findWidget(node, name) {
    return node?.widgets?.find(w => w?.name === name) || null;
}
function markDirty(node) {
    node?.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty?.(true, true);
}

// 값은 그대로 두고 type만 "hidden"으로 바꿔서 저장/로드해도 값이 보존된다.
function setWidgetVisible(widget, visible) {
    if (!widget) return;
    if (!widget._tj_ots_saved) {
        widget._tj_ots_saved = { type: widget.type, computeSize: widget.computeSize };
    }
    widget.type = visible ? widget._tj_ots_saved.type : "hidden";
    widget.computeSize = visible ? widget._tj_ots_saved.computeSize : () => [0, -4];
    widget.hidden = !visible;
    widget.disabled = !visible;
}

function applyTileVisibility(node) {
    const on = !!findWidget(node, "tile_decode")?.value;
    TILE_WIDGETS.forEach(name => setWidgetVisible(findWidget(node, name), on));
    resize(node);
}
function resize(node) {
    const width = node.size?.[0];
    const computed = node.computeSize?.();
    if (computed) node.setSize([width || computed[0], computed[1]]);
    markDirty(node);
}

function install(node) {
    if (!node || node._tj_ots_installed) return;
    node._tj_ots_installed = true;

    const tileW = findWidget(node, "tile_decode");
    if (tileW && !tileW._tj_ots_cb) {
        tileW._tj_ots_cb = true;
        const orig = tileW.callback;
        tileW.callback = function (v) {
            if (orig) orig.call(this, v, app.canvas, node);
            applyTileVisibility(node);
        };
    }
    applyTileVisibility(node);
}

app.registerExtension({
    name: "TJ_NODE.H3OneTakeSampler",
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
            setTimeout(() => { install(this); applyTileVisibility(this); }, 0);
            return r;
        };
    },
    nodeCreated(node) {
        if (node?.type === NODE_TYPE) setTimeout(() => install(node), 0);
    },
});
