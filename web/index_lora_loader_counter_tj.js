// web/index_lora_loader_counter_tj.js
// Index LoRA Loader Counter (TJ)
//
// Index LoRA Loader (TJ) 의 활성(= "[none]" 이 아닌) LoRA 슬롯 개수를 그래프 연결
// 없이 실시간으로 따라간다. 캔버스에서 대상 노드의 lora_1..lora_20 위젯 값을 직접
// 읽어 카운트하고, 이 노드의 숨김 위젯에 채워 넣는다(그래프 링크가 아니므로 Queue
// Loop 와 연결해도 순환 의존성이 생기지 않는다).

import { app } from "../../scripts/app.js";

const NODE_TYPE = "TJ_IndexLoRALoaderCounter";
const LOADER_TYPE = "TJ_IndexLoRALoader";
const MAX_SLOTS = 20;
const NONE_VALUE = "[none]";   // nodes/utility/index_lora_loader.py 의 NONE_VALUE 와 반드시 일치
const POLL_MS = 400;

function applyTheme(node) {
    if (window.TJ_NODE_applyTheme) {
        window.TJ_NODE_applyTheme(node);
    } else {
        node.bgcolor = "#000000";
        node.color = "#7612DA";
        node.title_text_color = "#FFFFFF";
    }
}

function findWidget(node, name) {
    return node?.widgets?.find(w => w?.name === name) || null;
}

function hideWidget(widget) {
    if (!widget || widget._tj_hidden) return;
    widget._tj_hidden = true;
    widget.computeSize = () => [0, -4];
    widget.type = "hidden";
    widget.hidden = true;
}

// 이름이 같은 여러 로더를 구분할 수 있게 항상 노드 id 를 붙인 라벨을 쓴다.
function loaderLabel(node) {
    const title = node.title || LOADER_TYPE;
    return `${title} (#${node.id})`;
}

function findLoaders(graph) {
    return (graph?._nodes || []).filter(n => n?.type === LOADER_TYPE);
}

// 대상 로더의 lora_1..lora_20 위젯 중 "[none]" 이 아닌 것만 센다.
function countActive(loaderNode) {
    let count = 0;
    for (let i = 1; i <= MAX_SLOTS; i++) {
        const w = findWidget(loaderNode, `lora_${i}`);
        if (!w) continue;
        const v = String(w.value ?? "").trim();
        if (v && v !== NONE_VALUE) count++;
    }
    return count;
}

function ensureStatusWidget(node) {
    let w = findWidget(node, "tj_ilc_status");
    if (!w) {
        w = node.addWidget("text", "status", "", () => {});
        w.name = "tj_ilc_status";
        w.disabled = true;
        w.serialize = false;
    }
    return w;
}

function resolveTarget(node, graph) {
    const loaders = findLoaders(graph);
    const picker = findWidget(node, "target_picker");
    const picked = String(picker?.value || "(auto)");

    // 콤보 옵션 목록을 항상 최신 상태로 유지 ("get_name" 콤보와 동일한 관례)
    if (picker) {
        const values = ["(auto)", ...loaders.map(loaderLabel)];
        picker.options = { ...(picker.options || {}), values };
        // 선택했던 로더가 삭제되면 자동으로 (auto) 로 되돌린다.
        if (picked !== "(auto)" && !values.includes(picked)) {
            picker.value = "(auto)";
        }
    }

    if (picked && picked !== "(auto)") {
        const target = loaders.find(n => loaderLabel(n) === picked);
        if (target) return { target, reason: "picked" };
        return { target: null, reason: "picked-missing" };
    }
    if (loaders.length === 1) return { target: loaders[0], reason: "auto-single" };
    if (loaders.length === 0) return { target: null, reason: "none-found" };
    return { target: null, reason: "ambiguous" };
}

function refresh(node) {
    const graph = node.graph || app.graph;
    if (!graph) return;

    const { target, reason } = resolveTarget(node, graph);
    const countW = findWidget(node, "active_count");
    const labelW = findWidget(node, "target_label");
    const statusW = ensureStatusWidget(node);

    if (target) {
        const count = countActive(target);
        const label = loaderLabel(target);
        if (countW && countW.value !== count) { countW.value = count; node.setDirtyCanvas?.(true, true); }
        if (labelW && labelW.value !== label) labelW.value = label;
        statusW.value = `🔗 ${label} — Active ${count}/${MAX_SLOTS}`;
        return;
    }

    // 대상을 못 찾은 경우: 마지막으로 알던 값은 그대로 두고(끊긴 순간 0으로 튀지
    // 않게) 상태 메시지로만 안내한다.
    const msgs = {
        "none-found": "⚠ 캔버스에 Index LoRA Loader (TJ) 가 없습니다.",
        "ambiguous": "⚠ Index LoRA Loader 가 여러 개입니다 — target_picker 에서 선택하세요.",
        "picked-missing": "⚠ 선택했던 로더를 찾을 수 없습니다(삭제됨?) — 자동 모드로 전환됩니다.",
    };
    statusW.value = msgs[reason] || "⚠ 대상을 찾을 수 없습니다.";
}

app.registerExtension({
    name: "TJ.IndexLoRALoaderCounter",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);
            applyTheme(this);
            if (!this.title || this.title === this.type) this.title = "Index LoRA Loader Counter (TJ)";

            hideWidget(findWidget(this, "active_count"));
            hideWidget(findWidget(this, "target_label"));

            if (!this._tj_ilc_installed) {
                this._tj_ilc_installed = true;
                refresh(this);
                this._tj_ilc_timer = setInterval(() => refresh(this), POLL_MS);
            }
            return r;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            if (this._tj_ilc_timer) { clearInterval(this._tj_ilc_timer); this._tj_ilc_timer = null; }
            return onRemoved?.apply(this, arguments);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (data) {
            const r = onConfigure?.apply(this, arguments);
            hideWidget(findWidget(this, "active_count"));
            hideWidget(findWidget(this, "target_label"));
            queueMicrotask(() => refresh(this));
            return r;
        };
    },
});
