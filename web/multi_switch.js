// web/multi_switch.js — TJ_MultiSwitch (테스트 버전)
//
// 역할 1) 그룹(+/- 버튼) UI: 그룹 = {A_n, B_n} 입력 슬롯 2개 + output_n 출력 1개
// 역할 2) Global / Per-Group 토글 모드 전환
// 역할 3) 큐 전송 직전 app.graphToPrompt() 결과를 가로채서
//         - 선택 안 된 쪽 입력에 연결된 상위 체인을 통째로 프루닝(실행 자체 차단)
//         - 선택된 쪽 입력이 미연결이면 그 그룹의 output_n을 소비하는 다운스트림 노드를 프루닝
//         (= "노드가 있으나 없으나 한" Bypass와 동일한 효과, 에러 없음)

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const MAX_GROUPS = 12;
const NODE_TYPE = "TJ_MultiSwitch";

// ────────────────────────────────────────────────────────────
// 그룹 슬롯 헬퍼
// ────────────────────────────────────────────────────────────

function groupInputNames(g) {
    return [`A_${g}`, `B_${g}`];
}

function findInput(node, name) {
    return (node.inputs || []).find((s) => s.name === name);
}

function findOutput(node, idx) {
    return (node.outputs || [])[idx - 1];
}

// ComfyUI는 RETURN_NAMES(MAX_GROUPS=12개 고정)를 기준으로 노드 생성 시
// output 슬롯을 자동으로 12개 다 만들어버린다. 실제 필요한 개수(num_groups)만
// 남기고 나머지는 강제로 정리한다. 신규 생성 시 1회만 필요.
function trimOutputsToCount(node, count) {
    if (!node.outputs) node.outputs = [];
    while (node.outputs.length > count) {
        const lastIdx = node.outputs.length - 1;
        const sl = node.outputs[lastIdx];
        if (sl?.links?.length) {
            [...sl.links].forEach((lid) => node.graph?.removeLink(lid));
        }
        node.removeOutput(lastIdx);
    }
    while (node.outputs.length < count) {
        node.addOutput(`output_${node.outputs.length + 1}`, "*");
    }
    node.outputs.forEach((s, i) => { s.name = `output_${i + 1}`; });
}

function addGroup(node) {
    const g = (node.properties.num_groups || 1) + 1;
    if (g > MAX_GROUPS) return;
    node.properties.num_groups = g;

    node.addInput(`A_${g}`, "*");
    node.addInput(`B_${g}`, "*");
    node.addOutput(`output_${g}`, "*");

    if (node.properties.toggle_mode === "Per-Group") {
        addPerGroupWidget(node, g);
    }

    syncNumGroupsWidget(node);
    enforceSizePolicy(node);
    node.setDirtyCanvas(true, true);
}

function removeGroup(node) {
    // 마지막 그룹 삭제 (+/- 버튼용)
    removeGroupAt(node, node.properties.num_groups || 1);
}

// 임의의 그룹 g 하나만 삭제. 그 뒤 그룹들은 번호가 하나씩 당겨진다
// (예: 1/2/3 에서 2 삭제 → 남은 3이 2로 재번호). 연결선은 유지된 채
// 슬롯 위치만 이동하므로 링크가 끊기지 않는다.
function removeGroupAt(node, g) {
    const total = node.properties.num_groups || 1;
    if (total <= 1 || g < 1 || g > total) return;

    const aIdx = node.inputs.findIndex((s) => s.name === `A_${g}`);
    const bIdx = node.inputs.findIndex((s) => s.name === `B_${g}`);
    [aIdx, bIdx].sort((a, b) => b - a).forEach((idx) => {
        if (idx >= 0) node.removeInput(idx);
    });

    const outIdx = node.outputs.findIndex((s) => s.name === `output_${g}`);
    if (outIdx >= 0) {
        const out = node.outputs[outIdx];
        if (out?.links?.length) {
            [...out.links].forEach((lid) => node.graph?.removeLink(lid));
        }
        node.removeOutput(outIdx);
    }

    removePerGroupWidget(node, g);

    node.properties.num_groups = total - 1;
    renumberGroups(node);
    syncNumGroupsWidget(node);
    enforceSizePolicy(node);
    node.setDirtyCanvas(true, true);
}

// 삭제로 인해 비어버린 그룹 번호를 채우도록 남은 그룹들을 앞으로 당겨 재번호.
// 슬롯 자체(및 연결선)는 건드리지 않고 이름(name)만 순서대로 다시 붙인다.
function renumberGroups(node) {
    const ins = (node.inputs || []).filter((s) => /^[AB]_\d+$/.test(s.name));
    const outs = (node.outputs || []).filter((s) => /^output_\d+$/.test(s.name));

    // A_n, B_n 페어 순서 그대로(2개씩) 새 그룹 번호 부여
    let newG = 1;
    for (let i = 0; i < ins.length; i += 2) {
        ins[i].name = `A_${newG}`;
        if (ins[i + 1]) ins[i + 1].name = `B_${newG}`;
        newG++;
    }
    outs.forEach((s, i) => { s.name = `output_${i + 1}`; });

    // switch_n per-group 위젯도 같은 순서로 재번호 (값은 유지)
    const switchWidgets = (node.widgets || [])
        .filter((w) => /^switch_\d+$/.test(w.name))
        .sort((a, b) => Number(a.name.split("_")[1]) - Number(b.name.split("_")[1]));
    switchWidgets.forEach((w, i) => { w.name = `switch_${i + 1}`; });
}

function hideWidget(w) {
    if (!w || w._tjHidden) return;
    w._tjHidden = true;
    w._origComputeSize = w.computeSize;
    w._origDraw = w.draw;
    w.computeSize = () => [0, -4];
    w.draw = () => {};
}

function syncNumGroupsWidget(node) {
    const w = node.widgets?.find((w) => w.name === "num_groups");
    if (w) w.value = node.properties.num_groups;
    hideWidget(w); // +/- 버튼과 Delete Group으로만 조작, 화면에는 안 보여줌
}

// ────────────────────────────────────────────────────────────
// 노드 크기: 세로(높이)는 항상 내용물에 맞게 자동 조절, 가로(너비)는
// 사용자가 직접 드래그로 조절하고 그 값을 properties.user_width 에 저장해서
// Save/Load/그룹 추가삭제 등 어떤 구조 변경에도 유지되게 한다.
// ────────────────────────────────────────────────────────────

function autoHeight(node) {
    const computed = node.computeSize ? node.computeSize() : node.size;
    return computed[1];
}

function enforceSizePolicy(node) {
    if (!node.size) return;
    const width = node.properties.user_width || node.size[0] || node.computeSize?.()[0] || 240;
    const height = autoHeight(node);
    node.size[0] = width;
    node.size[1] = height;
    node.setDirtyCanvas(true, true);
}

// ────────────────────────────────────────────────────────────
// Global / Per-Group 토글 위젯 관리
// ────────────────────────────────────────────────────────────

function addPerGroupWidget(node, g) {
    if (node.widgets?.find((w) => w.name === `switch_${g}`)) return;
    node.addWidget("toggle", `switch_${g}`, true, () => {}, { on: "A", off: "B" });
}

function removePerGroupWidget(node, g) {
    const idx = node.widgets?.findIndex((w) => w.name === `switch_${g}`);
    if (idx >= 0) node.widgets.splice(idx, 1);
}

function rebuildPerGroupWidgets(node) {
    // 기존 switch_n 위젯 전부 제거 후 현재 그룹 수만큼 재생성
    node.widgets = (node.widgets || []).filter((w) => !/^switch_\d+$/.test(w.name));
    if (node.properties.toggle_mode === "Per-Group") {
        for (let g = 1; g <= node.properties.num_groups; g++) addPerGroupWidget(node, g);
    }
    enforceSizePolicy(node);
    node.setDirtyCanvas(true, true);
}

function applyToggleModeVisibility(node) {
    const globalW = node.widgets?.find((w) => w.name === "global_switch");
    if (globalW) {
        const show = node.properties.toggle_mode === "Global";
        globalW.computeSize = show ? undefined : (() => [0, -4]);
        globalW.draw = show ? undefined : (() => {});
    }
    rebuildPerGroupWidgets(node);
}

// ────────────────────────────────────────────────────────────
// 그룹 타입 잠금 (연결된 순간 A_n/B_n/output_n 타입 확정, Multi Router 패턴 참고)
// ────────────────────────────────────────────────────────────

function lockGroupType(node, g) {
    const a = findInput(node, `A_${g}`);
    const b = findInput(node, `B_${g}`);
    const out = findOutput(node, g);
    if (!a || !b || !out) return;

    const connected = (slot) => slot.link != null;
    let resolvedType = null;

    if (connected(a) && node.graph) {
        const link = node.graph.links?.[a.link];
        const src = link && node.graph.getNodeById(link.origin_id);
        resolvedType = src?.outputs?.[link.origin_slot]?.type || null;
    } else if (connected(b) && node.graph) {
        const link = node.graph.links?.[b.link];
        const src = link && node.graph.getNodeById(link.origin_id);
        resolvedType = src?.outputs?.[link.origin_slot]?.type || null;
    }

    if (resolvedType && resolvedType !== "*") {
        a.type = resolvedType;
        b.type = resolvedType;
        out.type = resolvedType;
    } else if (!connected(a) && !connected(b)) {
        a.type = "*";
        b.type = "*";
        out.type = "*";
    }
}

function lockAllGroupTypes(node) {
    for (let g = 1; g <= (node.properties.num_groups || 1); g++) lockGroupType(node, g);
}

// ────────────────────────────────────────────────────────────
// 큐 직전 그래프 프루닝
// ────────────────────────────────────────────────────────────

// 서브그래프에 중첩된 노드는 app.graphToPrompt() 가 "parentId:innerId" 형태의
// 합성 id 로 평탄화해서 넘긴다(중첩 깊이만큼 여러 번 이어짐, 예: "247:249").
// live LiteGraph 노드 객체를 그 합성 id 로 되찾을 때 쓴다 — 최상위 그래프에서
// 시작해 ":" 로 나눈 각 조각을 그 레벨의 _nodes 에서 찾고, 서브그래프 노드면
// 그 .subgraph 로 한 단계씩 내려간다.
function resolveNodeById(graph, compositeId) {
    const parts = String(compositeId).split(":");
    let currentGraph = graph;
    let node = null;
    for (const part of parts) {
        node = currentGraph?._nodes?.find((n) => String(n.id) === part);
        if (!node) return null;
        currentGraph = node.subgraph;
    }
    return node;
}

// 그래프(및 그 안의 서브그래프들)에 TJ_MultiSwitch 가 하나라도 있는지 재귀적으로 확인.
// installQueueHook() 이 최상위 app.graph._nodes 만 보면 서브그래프 안에 숨은
// 스위치를 놓쳐서 프루닝 파이프라인 자체가 통째로 스킵된다(실제로 겪은 버그).
function graphHasSwitchRecursive(graph, depth = 0) {
    if (!graph?._nodes || depth > 8) return false;
    for (const n of graph._nodes) {
        if (n?.type === NODE_TYPE) return true;
        if (n?.subgraph && graphHasSwitchRecursive(n.subgraph, depth + 1)) return true;
    }
    return false;
}

// app.graphToPrompt() 가 이미 평탄화해서 넘겨준 output 딕셔너리에서 직접 읽는다
// (live 그래프를 훑지 않음) — 이러면 서브그래프에 중첩된 TJ_MultiSwitch 도
// 합성 id("247:249") 그대로 자연스럽게 잡힌다. output[id].inputs 에는 위젯
// 값(toggle_mode/global_switch/num_groups/switch_N 등)도 그대로 직렬화되어 있다.
function collectSwitchInfo(output) {
    const info = new Map(); // nodeId(string, 합성 id 가능) -> { numGroups, toggleMode, globalSwitch, perGroup: {g: "A"|"B"} }
    for (const [id, data] of Object.entries(output || {})) {
        if (!data || data.class_type !== NODE_TYPE) continue;
        const inputs = data.inputs || {};
        const numGroups = Number(inputs.num_groups) || 1;
        const toggleMode = inputs.toggle_mode || "Global";
        // 토글 위젯: true == "A", false == "B"
        const globalSwitchOn = inputs.global_switch !== false;
        const perGroup = {};
        for (let g = 1; g <= numGroups; g++) {
            const v = inputs[`switch_${g}`];
            perGroup[g] = v !== false;
        }
        info.set(id, { numGroups, toggleMode, globalSwitchOn, perGroup });
    }
    return info;
}

function selectedSwitch(info, g) {
    const isA = info.toggleMode === "Per-Group" ? (info.perGroup[g] ?? true) : info.globalSwitchOn;
    return isA ? "A" : "B";
}

// 백워드 BFS: OUTPUT_NODE(root)들에서 출발해 필요한 노드만 keep에 채움.
// TJ_MultiSwitch 노드를 만나면 선택된 쪽 입력만 따라가고 반대쪽은 무시(=상위 체인 프루닝).
function backwardKeep(graph, output, switchInfo, roots) {
    const keep = new Set();
    const stack = [...roots];

    while (stack.length) {
        const id = stack.pop();
        if (keep.has(id) || !output[id]) continue;
        keep.add(id);

        const info = switchInfo.get(id);
        const inputs = output[id].inputs || {};

        if (info) {
            for (let g = 1; g <= info.numGroups; g++) {
                const sw = selectedSwitch(info, g);
                const followKey = sw === "A" ? `A_${g}` : `B_${g}`;
                const v = inputs[followKey];
                if (Array.isArray(v)) stack.push(String(v[0]));
                // 반대쪽 키는 의도적으로 무시 → 그 상위 체인은 결코 keep에 안 들어감
            }
        } else {
            for (const v of Object.values(inputs)) {
                if (Array.isArray(v)) stack.push(String(v[0]));
            }
        }
    }
    return keep;
}

// 선택된 쪽이 미연결인 그룹의 output_g 을 "죽은 출력"으로 표시하고,
// 그 출력을 소비하는 노드들을 재귀적으로 정리한다.
// - 소비하는 입력이 그 노드의 required 입력이면: 노드 자체가 죽으므로 keep에서
//   제거하고, 그 노드의 출력들도 새로운 데드 슬롯으로 전파(재귀 cascade).
// - optional/미등록 입력이면: 노드는 살리고 그 입력 키만 지운다(= 연결 안 한
//   것과 동일한 상태). 고정점에 도달할 때까지 반복한다.
function pruneDeadSwitchOutputs(graph, output, switchInfo, keep) {
    const deadSlots = new Set(); // "nodeId:slotIdx"
    for (const [id, info] of switchInfo) {
        if (!output[id]) continue;
        const inputs = output[id].inputs || {};
        for (let g = 1; g <= info.numGroups; g++) {
            const sw = selectedSwitch(info, g);
            const followKey = sw === "A" ? `A_${g}` : `B_${g}`;
            if (inputs[followKey] === undefined) {
                deadSlots.add(`${id}:${g - 1}`); // output slot index = g-1
            }
        }
    }
    if (!deadSlots.size) return;

    let changed = true;
    while (changed) {
        changed = false;
        for (const id of [...keep]) {
            const data = output[id];
            if (!data) continue;
            const inputs = data.inputs || {};
            const node = resolveNodeById(graph, id);
            const requiredNames = new Set(Object.keys(node?.constructor?.nodeData?.input?.required || {}));
            for (const [key, v] of Object.entries(inputs)) {
                if (!Array.isArray(v) || !deadSlots.has(`${v[0]}:${v[1]}`)) continue;
                if (!node || requiredNames.has(key)) {
                    keep.delete(id);
                    const outLen = (node?.outputs || []).length;
                    for (let s = 0; s < outLen; s++) deadSlots.add(`${id}:${s}`);
                } else {
                    delete inputs[key];
                }
                changed = true;
                break; // 이 id 상태가 바뀌었으니 다음 바깥 루프에서 다시 평가
            }
        }
    }
}

async function buildPrunedPrompt() {
    const graph = app.graph;
    const p = await app.graphToPrompt();
    const output = p.output || {};
    const switchInfo = collectSwitchInfo(output);

    if (switchInfo.size === 0) return p; // TJ_MultiSwitch 없으면 그대로

    const roots = Object.keys(output).filter((id) => {
        const n = resolveNodeById(graph, id);
        return n?.constructor?.nodeData?.output_node === true;
    });

    let keep = backwardKeep(graph, output, switchInfo, roots);
    pruneDeadSwitchOutputs(graph, output, switchInfo, keep);

    const pruned = {};
    keep.forEach((id) => {
        if (output[id]) pruned[id] = output[id];
    });

    // 스위치 노드 자신의 inputs 에 남아있는 "미선택 쪽" 링크 키를 제거한다.
    // backwardKeep은 선택 안 된 쪽 상위 체인을 keep-set에서 빼지만, 스위치
    // 노드 자체의 A_g/B_g 참조는 그대로 남아있어 이미 잘려나간(=pruned 안의
    // output 딕셔너리에 없는) 노드를 가리키는 댕글링 링크가 된다. 백엔드
    // 실행 엔진이 이 존재하지 않는 노드를 의존성으로 풀려다 걸려서
    // 큐가 0%에서 멈추는 원인이었다 — 여기서 미리 잘라낸다.
    for (const [id, info] of switchInfo) {
        if (!pruned[id]) continue;
        const inputs = pruned[id].inputs || {};
        for (let g = 1; g <= info.numGroups; g++) {
            const sw = selectedSwitch(info, g);
            const droppedKey = sw === "A" ? `B_${g}` : `A_${g}`;
            delete inputs[droppedKey];
        }
    }

    return { ...p, output: pruned };
}

let queueHookInstalled = false;

function installQueueHook() {
    if (queueHookInstalled) return;
    queueHookInstalled = true;

    const origQueuePrompt = app.queuePrompt.bind(app);
    app.queuePrompt = async function (number, batchCount = 1) {
        const hasSwitch = graphHasSwitchRecursive(app.graph);
        if (!hasSwitch) return origQueuePrompt(number, batchCount);

        for (let i = 0; i < batchCount; i++) {
            const p = await buildPrunedPrompt();
            const res = await api.fetchApi("/prompt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: p.output,
                    client_id: api.clientId,
                    extra_data: { extra_pnginfo: { workflow: p.workflow } },
                    number,
                }),
            });
            if (!res.ok) {
                const err = await res.text();
                console.error("[TJ MultiSwitch] queue rejected", err);
                throw new Error(err);
            }
        }
    };
}

// ────────────────────────────────────────────────────────────
// 노드 등록
// ────────────────────────────────────────────────────────────

app.registerExtension({
    name: "TJ_NODE.MultiSwitch",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (origOnCreated) origOnCreated.apply(this, arguments);
            installQueueHook();

            if (!this.properties) this.properties = {};
            if (!this.properties.num_groups) this.properties.num_groups = 1;
            this.properties.toggle_mode = this.properties.toggle_mode || "Global";

            // 첫 그룹 슬롯이 없으면 생성.
            // requestAnimationFrame 은 탭이 백그라운드/비표시 상태면 아예 호출되지 않아
            // A_1/B_1 슬롯이 만들어지지 않은 채로 남는다(그 상태로 저장하면 워크플로우가
            // 깨진다). 화면 표시 여부와 무관하게 도는 setTimeout 을 쓴다.
            setTimeout(() => {
                // 백엔드가 자동 생성한 여분 output 슬롯(최대 12개) 정리 — 반드시 가장 먼저
                trimOutputsToCount(this, this.properties.num_groups);

                if (!findInput(this, "A_1")) {
                    this.addInput("A_1", "*");
                    this.addInput("B_1", "*");
                }
                applyToggleModeVisibility(this);
                syncNumGroupsWidget(this);

                this.addWidget("button", "+ Group", null, () => addGroup(this));
                this.addWidget("button", "- Group", null, () => removeGroup(this));

                const modeW = this.widgets?.find((w) => w.name === "toggle_mode");
                if (modeW) {
                    const origCb = modeW.callback;
                    modeW.callback = (v) => {
                        if (origCb) origCb.call(modeW, v);
                        this.properties.toggle_mode = v;
                        applyToggleModeVisibility(this);
                    };
                }

                // 신규 생성 시: 저장된 너비가 있으면 그걸, 없으면 기본 계산 너비를 채택
                enforceSizePolicy(this);
                this.setDirtyCanvas(true, true);
            });

            const origOnConnectionsChange = this.onConnectionsChange;
            this.onConnectionsChange = function () {
                if (origOnConnectionsChange) origOnConnectionsChange.apply(this, arguments);
                lockAllGroupTypes(this);
            };

            // 세로(높이)는 항상 자동, 가로(너비)만 사용자가 드래그로 조절하고 기억.
            const origOnResize = this.onResize;
            this.onResize = function (size) {
                if (origOnResize) origOnResize.apply(this, arguments);
                if (!this.properties) this.properties = {};
                this.properties.user_width = size[0];
                const h = autoHeight(this);
                size[0] = this.properties.user_width;
                size[1] = h;
                this.size[0] = size[0];
                this.size[1] = h;
            };
        };

        const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
            if (origGetExtraMenuOptions) origGetExtraMenuOptions.apply(this, arguments);

            const total = this.properties?.num_groups || 1;
            if (total <= 1) return;

            const node = this;
            const submenu = [];
            for (let g = 1; g <= total; g++) {
                submenu.push({
                    content: `Group ${g} (A_${g} / B_${g})`,
                    callback: () => removeGroupAt(node, g),
                });
            }
            options.push({
                content: "🗑 Delete Group...",
                has_submenu: true,
                submenu: { options: submenu },
            });
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (data) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            installQueueHook();
            if (!this.properties) this.properties = {};
            // LiteGraph가 data.size 를 this.size 에 이미 복원해둔 상태 —
            // user_width 가 아직 저장 안 된(구버전) 워크플로우라면 여기서 채워
            // 넣어 이후 enforceSizePolicy 가 그 너비를 그대로 유지하게 한다.
            if (!this.properties.user_width && this.size?.[0]) {
                this.properties.user_width = this.size[0];
            }
            setTimeout(() => {
                if (!this.properties.num_groups) this.properties.num_groups = 1;
                // 저장된 파일이 구버전(트림 버그 있던 버전)일 수 있으니 안전하게 재확인
                trimOutputsToCount(this, this.properties.num_groups);
                applyToggleModeVisibility(this);
                syncNumGroupsWidget(this);
                lockAllGroupTypes(this);
                enforceSizePolicy(this);
            }, 100);
        };
    },
});
