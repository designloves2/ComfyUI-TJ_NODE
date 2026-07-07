// -----------------------------------------------------------------------------
// Scene Maker Result - pipe (TJ)
// Scene Maker의 pipe 출력을 받아 brief / beat / anchor / prompt / translated 를
// 한 노드에서 보여준다.
//  - 노드 크기를 바꾸면 5개 텍스트 필드가 "비율"을 유지한 채 함께 커지고 작아진다.
//  - 각 필드는 하단 그립으로 개별 높이 조절이 가능하며, 그 값도 노드 리사이즈 시
//    비율로 함께 스케일된다.
//  - 조절한 비율 / 표시된 값은 저장·재로드 후에도 유지된다.
// -----------------------------------------------------------------------------

import { app } from "../../scripts/app.js";

const FIELDS = [
    ["scene_brief", "Scene brief"],
    ["visual_beat", "Visual Beat"],
    ["visual_anchor", "Visual anchor"],
    ["scene_prompt", "Scene prompt"],
    ["translated_result", "Translated result"],
];

const DEFAULT_TA = 264;   // 텍스트 영역 기본 높이(px) — 이전(88)의 3배
const LABEL_H = 16;       // 라벨 줄 높이(px)
const GAP = 8;            // 필드 간 간격(px)
const MIN_TA = 34;        // 텍스트 영역 최소 높이(px)
const TOP_FALLBACK = 165; // 위젯 시작 y 추정치 (실측 last_y 확보 전까지)

function applyTheme(node) {
    if (window.TJ_NODE_applyTheme) window.TJ_NODE_applyTheme(node);
}

function panelWidgetOf(node) {
    return node.widgets?.find((w) => w.name === "tj_pipe_panel");
}

function getWeights(node) {
    if (!node.properties) node.properties = {};
    let w = node.properties.tj_pipe_weights;
    if (!Array.isArray(w) || w.length !== FIELDS.length) {
        w = FIELDS.map(() => DEFAULT_TA);
        node.properties.tj_pipe_weights = w;
    }
    return w;
}

function chromeHeight() {
    return FIELDS.length * (LABEL_H + GAP);
}

// 패널이 채워야 할 세로 공간 (노드 높이에서 위쪽 슬롯/타이틀 영역을 뺀 값)
function availableH(node) {
    const panel = panelWidgetOf(node);
    const top = panel && panel.last_y ? panel.last_y : TOP_FALLBACK;
    const min = FIELDS.length * MIN_TA + chromeHeight();
    return Math.max(min, Number(node.size?.[1] || 0) - top - 6);
}

// 저장된 weight(각 텍스트 영역 높이)를 실제 textarea 에 반영
function applyHeights(node) {
    const w = getWeights(node);
    node._tj_laying_out = true;
    FIELDS.forEach(([, ], i) => {
        const rec = node._tj_pipe_fields?.[i];
        if (rec?.ta) rec.ta.style.height = `${Math.max(MIN_TA, Number(w[i]) || MIN_TA)}px`;
    });
    requestAnimationFrame(() => { node._tj_laying_out = false; });
}

// 노드 높이에 맞춰 모든 필드를 "비율 유지"하며 다시 분배
function scaleToFit(node) {
    const w = getWeights(node);
    const target = Math.max(FIELDS.length * MIN_TA, availableH(node) - chromeHeight());
    const cur = w.reduce((a, b) => a + (Number(b) || 0), 0) || 1;
    const f = target / cur;
    const nw = w.map((x) => Math.max(MIN_TA, (Number(x) || MIN_TA) * f));
    node.properties.tj_pipe_weights = nw;
    applyHeights(node);
}

function applyValues(node) {
    const vals = node.properties?.tj_pipe_vals;
    FIELDS.forEach(([, ], i) => {
        const rec = node._tj_pipe_fields?.[i];
        if (rec?.ta && Array.isArray(vals) && vals[i] != null) rec.ta.value = String(vals[i]);
    });
}

function buildPanel(node) {
    const panel = document.createElement("div");
    panel.style.cssText = "display:flex;flex-direction:column;width:100%;height:100%;box-sizing:border-box;overflow:hidden;";

    node._tj_pipe_fields = [];

    FIELDS.forEach(([key, label], i) => {
        const field = document.createElement("div");
        field.style.cssText = `display:flex;flex-direction:column;width:100%;box-sizing:border-box;margin-bottom:${GAP}px;`;

        const lab = document.createElement("div");
        lab.textContent = label;
        lab.style.cssText = `flex:0 0 ${LABEL_H}px;height:${LABEL_H}px;line-height:${LABEL_H}px;`
            + "font-size:11px;font-weight:bold;color:#d9b3ff;padding:0 2px;"
            + "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";

        const ta = document.createElement("textarea");
        ta.readOnly = true;
        ta.style.cssText = "width:100%;box-sizing:border-box;resize:vertical;overflow:auto;"
            + `min-height:${MIN_TA}px;background:rgba(5,5,5,0.96);color:#eee;`
            + "border:1px solid rgba(118,18,218,0.5);border-radius:4px;"
            + "font-size:11px;line-height:1.35;padding:4px;font-family:inherit;";
        ta.style.height = `${Math.max(MIN_TA, getWeights(node)[i])}px`;

        field.appendChild(lab);
        field.appendChild(ta);
        panel.appendChild(field);
        node._tj_pipe_fields.push({ field, lab, ta });

        // 개별 필드 높이 조절: 그립을 드래그하면 그만큼 노드가 커지고 나머지는 유지된다.
        const ro = new ResizeObserver(() => {
            if (node._tj_laying_out) return;
            const th = ta.offsetHeight;
            const w = getWeights(node);
            const delta = th - (Number(w[i]) || 0);
            if (Math.abs(delta) < 1) return;
            w[i] = th;
            node.properties.tj_pipe_weights = w;
            node._tj_internal_resize = true;
            node.setSize([node.size[0], node.size[1] + delta]);
            node._tj_internal_resize = false;
            node.setDirtyCanvas(true, true);
        });
        ro.observe(ta);
    });

    const widget = node.addDOMWidget("tj_pipe_panel", "panel", panel, { serialize: false, hideOnZoom: false });
    widget._tj_panel = panel;
    // fill 트릭: 노드 높이에서 위 영역을 뺀 만큼 패널이 채운다 → 노드를 자유롭게 리사이즈 가능.
    widget.computeSize = function (width) {
        return [width || 200, availableH(node)];
    };
    return widget;
}

function attachResizeHook(node) {
    if (node._tj_pipe_resize_hooked) return;
    node._tj_pipe_resize_hooked = true;
    const orig = node.onResize;
    node.onResize = function (size) {
        if (orig) orig.apply(this, arguments);
        // 사용자가 노드 모서리로 리사이즈한 경우에만 비율 재분배 (내부 setSize는 제외)
        if (!this._tj_internal_resize) scaleToFit(this);
    };
}

app.registerExtension({
    name: "TJ.SceneMakerResultPipe",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "TJ_SceneMakerResultPipe") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
            applyTheme(this);
            buildPanel(this);
            attachResizeHook(this);

            // 새 노드 기본 크기: 5필드 × 기본높이가 모두 보이도록
            const contentH = TOP_FALLBACK + FIELDS.length * (DEFAULT_TA + LABEL_H + GAP);
            this.setSize([Math.max(340, this.size?.[0] || 0), contentH]);
            requestAnimationFrame(() => applyHeights(this));
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (data) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            attachResizeHook(this);
            requestAnimationFrame(() => {
                applyTheme(this);
                applyValues(this);
                // 저장된 노드 크기에 맞춰 필드 비율을 채운다 (비율 유지).
                scaleToFit(this);
            });
        };

        nodeType.prototype.onExecuted = function (message) {
            const raw = message?.tj_scene_pipe || message?.ui?.tj_scene_pipe;
            if (!Array.isArray(raw)) return;
            if (!this.properties) this.properties = {};
            this.properties.tj_pipe_vals = FIELDS.map(([, ], i) => (raw[i] != null ? String(raw[i]) : ""));
            applyValues(this);
            this.setDirtyCanvas(true, true);
        };
    },
});
