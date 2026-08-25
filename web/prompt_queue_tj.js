// Prompt Queue (TJ)
// prompt_count widget drives both how many prompt_N fields are shown AND how many
// queue runs the auto-loop performs. Adapted from queue_loop_tj.js's Start/Stop/Reset
// pattern, but the loop count is not a separate widget — prompt_count IS the loop.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "TJ_PromptQueue";
const DISPLAY_TITLE = "MiniMax H3 Prompt Queue (TJ)";
const MAX_PROMPTS = 20;
const TJ_PURPLE = "#7612DA";
const TJ_BG = "#000000";
const TJ_TEXT = "#FFFFFF";
const TJ_PANEL = "#101010";
const TJ_OK = "#9DFFBA";
const TJ_WARN = "#FFCC7A";

function graphNodes(graph = app.graph) {
    return graph?._nodes || graph?.nodes || [];
}
function markDirty(node) {
    node?.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty?.(true, true);
}
function findWidget(node, name) {
    return node?.widgets?.find(w => w?.name === name) || null;
}
function setWidgetValue(node, name, value, call = true) {
    const w = findWidget(node, name);
    if (!w) return false;
    w.value = value;
    if (call && typeof w.callback === "function") {
        try { w.callback.call(w, value, app.canvas, node); }
        catch (_) { try { w.callback(value); } catch (_) {} }
    }
    markDirty(node);
    return true;
}
function intWidget(node, name, fallback = 0) {
    const value = Number(findWidget(node, name)?.value);
    return Number.isFinite(value) ? Math.floor(value) : fallback;
}
function boolWidget(node, name, fallback = false) {
    const w = findWidget(node, name);
    return w ? !!w.value : fallback;
}
function queuePromptSafe() {
    try {
        if (typeof app.queuePrompt === "function") return void app.queuePrompt(0, 1);
        if (app.queuePrompt && typeof app.queuePrompt.queuePrompt === "function") return void app.queuePrompt.queuePrompt(0, 1);
        document.querySelector("#queue-button")?.click?.();
    } catch (err) {
        console.warn("[TJ_NODE] Prompt Queue queue failed", err);
    }
}
function applyTheme(node) {
    if (typeof window.TJ_NODE_applyTheme === "function") return window.TJ_NODE_applyTheme(node);
    node.bgcolor = TJ_BG;
    node.color = TJ_PURPLE;
    node.title_text_color = TJ_TEXT;
}

// prompt_N 위젯을 완전히 숨긴다. multiline STRING 위젯(prompt_1..20)은 canvas draw가
// 아니라 실제 HTML <textarea> DOM 엘리먼트(widget.element, addDOMWidget 계열)로 렌더링
// 되므로, computeSize/draw만 죽이면 레이아웃 높이는 0이 되어도 DOM 엘리먼트 자체는 화면에
// 그대로 남아 다른 위젯과 겹친다 — element.style.display까지 같이 꺼야 한다.
function setWidgetVisible(widget, visible) {
    if (!widget) return;
    const el = widget.element;
    const wrap = el && el.parentElement && el.parentElement.classList?.contains("dom-widget")
        ? el.parentElement : null;
    if (visible) {
        if (widget._tj_pq_hidden) {
            widget.computeSize = widget._tj_pq_orig_compute;
            widget.draw = widget._tj_pq_orig_draw;
            widget.mouse = widget._tj_pq_orig_mouse;
            widget.type = widget._tj_pq_orig_type;
            widget._tj_pq_hidden = false;
        }
        if (el) el.style.display = widget._tj_pq_orig_el_display || "";
        if (wrap) wrap.style.display = widget._tj_pq_orig_wrap_display || "";
        return;
    }
    if (!widget._tj_pq_hidden) {
        widget._tj_pq_hidden = true;
        widget._tj_pq_orig_compute = widget.computeSize;
        widget._tj_pq_orig_draw = widget.draw;
        widget._tj_pq_orig_mouse = widget.mouse;
        widget._tj_pq_orig_type = widget.type;
        widget.computeSize = () => [0, -4];
        widget.draw = () => {};
        widget.mouse = () => false;
    }
    if (el) {
        widget._tj_pq_orig_el_display = widget._tj_pq_orig_el_display ?? el.style.display;
        el.style.display = "none";
    }
    if (wrap) {
        widget._tj_pq_orig_wrap_display = widget._tj_pq_orig_wrap_display ?? wrap.style.display;
        wrap.style.display = "none";
    }
}
function hideAlways(widget) {
    setWidgetVisible(widget, false);
    // 완전히 다시 안 보이게: computeSize/draw/mouse는 이미 죽였으니 이걸로 충분.
}

// ComfyUI 코어는 캔버스 줌이 낮아지면 multiline STRING DOM 위젯을 자동으로
// display:none 처리해서 화면 밖으로 넘치는 걸 막아준다 — 근데 이 노드에서는 그
// 코어 로직이 안 걸리고, 대신 위젯이 최소 스케일(약 0.56)로 고정된 채 계속
// 그려져서 노드 박스보다 커져버리고 위로 삐져나온다(형님이 "50% 이하 고스트"라고
// 부른 증상). 코어가 왜 이 노드만 건너뛰는지는 알아내지 못했지만, 같은 효과를
// 직접 만들어서 — 줌이 낮으면 DOM만(그래프 값 말고) 숨긴다.
const LOW_ZOOM_HIDE_THRESHOLD = 0.5;
function applyLowZoomGuard(node) {
    const scale = Number(app.canvas?.ds?.scale);
    if (!Number.isFinite(scale)) return;
    const hideForZoom = scale < LOW_ZOOM_HIDE_THRESHOLD;
    for (let i = 1; i <= MAX_PROMPTS; i++) {
        const w = findWidget(node, `prompt_${i}`);
        if (!w || w._tj_pq_hidden) continue; // 이미 논리적으로 숨겨진 위젯은 손대지 않음
        const el = w.element;
        const wrap = el && el.parentElement && el.parentElement.classList?.contains("dom-widget")
            ? el.parentElement : null;
        if (!el) continue;
        if (hideForZoom) {
            if (el.style.display !== "none") w._tj_pq_zoom_orig_el_display = el.style.display;
            el.style.display = "none";
            if (wrap) {
                if (wrap.style.display !== "none") w._tj_pq_zoom_orig_wrap_display = wrap.style.display;
                wrap.style.display = "none";
            }
        } else if (w._tj_pq_zoom_orig_el_display !== undefined || el.style.display === "none") {
            el.style.display = w._tj_pq_zoom_orig_el_display || "";
            if (wrap) wrap.style.display = w._tj_pq_zoom_orig_wrap_display || "";
        }
    }
}

function updatePromptVisibility(node) {
    const total = Math.max(1, Math.min(MAX_PROMPTS, intWidget(node, "prompt_count", 3)));
    for (let i = 1; i <= MAX_PROMPTS; i++) {
        setWidgetVisible(findWidget(node, `prompt_${i}`), i <= total);
    }
    applyLowZoomGuard(node);
    markDirty(node);
}

const PQ_OUTPUTS = [
    { name: "prompt", type: "STRING" },
    { name: "index", type: "INT" },
    { name: "total_count", type: "INT" },
];
function ensureOutputs(node) {
    if (!node?.outputs) return;
    PQ_OUTPUTS.forEach((spec, i) => {
        const out = node.outputs?.[i];
        if (!out) return;
        out.name = spec.name;
        out.localized_name = spec.name;
        out.type = spec.type;
    });
    for (let i = node.outputs.length - 1; i >= PQ_OUTPUTS.length; i--) {
        try { node.removeOutput(i); } catch (_) { node.outputs.splice(i, 1); }
    }
}
function updateAutoSet(node) {
    if (!node) return;
    node.properties = node.properties || {};
    node.properties.auto_sets = {};
    ensureOutputs(node);
    const enabled = boolWidget(node, "auto_set", true);
    PQ_OUTPUTS.forEach((spec, i) => {
        const out = node.outputs?.[i];
        if (!out) return;
        out.label = enabled ? `${spec.name} ▶` : spec.name;
        if (enabled) node.properties.auto_sets[i] = spec.name;
    });
    if (typeof window.TJ_NODE_scheduleWirelessRepair === "function") {
        window.TJ_NODE_scheduleWirelessRepair(node.graph || app.graph, 80);
    }
    markDirty(node);
}

function setStatus(node, text, color = TJ_TEXT) {
    node._tj_pq_status = text;
    node._tj_pq_status_color = color;
    markDirty(node);
}
function formatElapsed(ms) {
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function currentElapsedMs(node) {
    node.properties = node.properties || {};
    const running = !!node.properties.tj_pq_running;
    const start = Number(node.properties.tj_pq_started_at || 0);
    if (running && start > 0) return Date.now() - start;
    return Number(node.properties.tj_pq_elapsed_ms || 0);
}
function startTimer(node) {
    node.properties = node.properties || {};
    node.properties.tj_pq_started_at = Date.now();
    node.properties.tj_pq_elapsed_ms = 0;
}
function stopTimer(node) {
    node.properties = node.properties || {};
    const start = Number(node.properties.tj_pq_started_at || 0);
    if (start > 0) node.properties.tj_pq_elapsed_ms = Date.now() - start;
    node.properties.tj_pq_started_at = 0;
}
function resetTimer(node) {
    node.properties = node.properties || {};
    node.properties.tj_pq_started_at = 0;
    node.properties.tj_pq_elapsed_ms = 0;
}

function resetToStart(node) {
    setWidgetValue(node, "current_index", 1);
    setWidgetValue(node, "current_queue", 0);
    node.properties = node.properties || {};
    node.properties.tj_pq_running = false;
    node._tj_pq_pending = null;
    resetTimer(node);
    const total = Math.max(1, intWidget(node, "prompt_count", 3));
    setStatus(node, `ready - 0/${total}`, TJ_TEXT);
}
function stopLoop(node, reason = "Stopped") {
    node.properties = node.properties || {};
    node.properties.tj_pq_running = false;
    node._tj_pq_pending = null;
    stopTimer(node);
    setStatus(node, reason, TJ_WARN);
}
function startLoop(node) {
    node.properties = node.properties || {};
    setWidgetValue(node, "current_index", 1);
    setWidgetValue(node, "current_queue", 0);
    node.properties.tj_pq_running = true;
    node._tj_pq_pending = null;
    startTimer(node);
    const total = Math.max(1, intWidget(node, "prompt_count", 3));
    setStatus(node, `running - 1/${total}`, TJ_OK);
    setTimeout(() => queuePromptSafe(), 40);
}
function continueAfterWorkflowFinished(node) {
    if (!node || node.type !== NODE_TYPE) return;
    if (!node.properties?.tj_pq_running || !node._tj_pq_pending) return;

    const info = node._tj_pq_pending;
    node._tj_pq_pending = null;

    const total = Math.max(1, Number(info.prompt_count) || intWidget(node, "prompt_count", 3));
    const queuePos = Math.max(0, Number(info.current_queue ?? intWidget(node, "current_queue", 0)));
    const nextQueuePos = queuePos + 1;

    if (nextQueuePos >= total) {
        node.properties.tj_pq_running = false;
        setWidgetValue(node, "current_queue", total);
        stopTimer(node);
        setStatus(node, `done - ${total}/${total}`, TJ_OK);
        return;
    }

    const nextIndex = nextQueuePos + 1;
    setWidgetValue(node, "current_index", nextIndex);
    setWidgetValue(node, "current_queue", nextQueuePos);
    setStatus(node, `running - ${nextQueuePos + 1}/${total}`, TJ_OK);
    setTimeout(() => queuePromptSafe(), 80);
}

const PANEL_INNER_H = 76;
const WIDGET_H = PANEL_INNER_H + 14;
const MIN_NODE_W = 280;

class PromptQueueControlsWidget {
    constructor(node) {
        this.name = "tj_prompt_queue_controls";
        this.type = "custom";
        this.node = node;
        this.options = { serialize: false };
        this._drawY = 0;
        this._drawW = MIN_NODE_W;
        this.pressed = "";
    }
    serializeValue() { return undefined; }
    computeSize(width) { return [width || MIN_NODE_W, WIDGET_H]; }

    _buttonBounds(panelW) {
        const x = 12;
        const gap = 8;
        const bw = Math.max(40, Math.floor((panelW - 20 - gap * 2) / 3));
        const by = this._drawY + 6 + 30;
        return {
            start: [x + 10, by, bw, 26],
            stop: [x + 10 + bw + gap, by, bw, 26],
            reset: [x + 10 + (bw + gap) * 2, by, bw, 26],
        };
    }
    _drawButton(ctx, bounds, key, label, active) {
        const [bx, by, bw, bh] = bounds[key];
        ctx.save();
        ctx.fillStyle = this.pressed === key ? TJ_PURPLE : active ? "#1a0630" : "#151515";
        ctx.strokeStyle = active ? TJ_PURPLE : "#444";
        ctx.lineWidth = 1;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill(); ctx.stroke(); }
        else { ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx, by, bw, bh); }
        ctx.fillStyle = active ? TJ_OK : TJ_TEXT;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, bx + bw / 2, by + bh / 2);
        ctx.restore();
    }
    draw(ctx, node, width, y) {
        // 자가 치유: prompt_N DOM 위젯이 로드 타이밍(특히 API로 그래프를 직접 주입하는
        // 경우) 때문에 최초 hide 호출을 놓치는 경우가 있었다 — 매 프레임 재확인해서
        // 어긋난 상태가 있으면 즉시 바로잡는다. setWidgetVisible은 이미 올바른 상태면
        // 아무 것도 하지 않으므로(가드 있음) 매 프레임 호출해도 비용이 거의 없다.
        updatePromptVisibility(node);
        this.node = node;
        this._drawY = y;
        this._drawW = Math.max(MIN_NODE_W, Number(width || node.size?.[0] || MIN_NODE_W));

        const w = this._drawW;
        const x = 12;
        const panelW = Math.max(60, w - 24);
        const top = y + 6;
        const running = !!node.properties?.tj_pq_running;

        ctx.save();
        ctx.fillStyle = TJ_PANEL;
        ctx.strokeStyle = TJ_PURPLE;
        ctx.lineWidth = 1;
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, top, panelW, PANEL_INNER_H, 7);
            ctx.fill(); ctx.stroke();
        } else {
            ctx.fillRect(x, top, panelW, PANEL_INNER_H);
            ctx.strokeRect(x, top, panelW, PANEL_INNER_H);
        }

        const status = node._tj_pq_status || "ready - 0/0";
        const elapsed = formatElapsed(currentElapsedMs(node));
        ctx.font = "bold 15px monospace";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = node._tj_pq_status_color || TJ_TEXT;
        ctx.textAlign = "left";
        ctx.fillText(status, x + 10, top + 20);
        ctx.fillStyle = TJ_TEXT;
        ctx.font = "13px monospace";
        ctx.textAlign = "right";
        ctx.fillText(elapsed, x + panelW - 10, top + 20);

        const bounds = this._buttonBounds(panelW);
        this._drawButton(ctx, bounds, "start", running ? "Restart" : "Start", running);
        this._drawButton(ctx, bounds, "stop", "Stop", false);
        this._drawButton(ctx, bounds, "reset", "Reset", false);
        ctx.restore();
    }
    mouse(event, pos, node) {
        const type = String(event?.type || "");
        const w = this._drawW;
        const panelW = Math.max(60, w - 24);
        const bounds = this._buttonBounds(panelW);
        const hit = (key) => {
            const [bx, by, bw, bh] = bounds[key];
            return pos[0] >= bx && pos[0] <= bx + bw && pos[1] >= by && pos[1] <= by + bh;
        };
        const key = ["start", "stop", "reset"].find(hit) || "";
        if ((type === "pointerdown" || type === "mousedown") && key) {
            this.pressed = key;
            markDirty(node);
            return true;
        }
        if ((type === "pointerup" || type === "mouseup") && this.pressed) {
            const pressed = this.pressed;
            this.pressed = "";
            if (key === pressed) {
                if (pressed === "start") startLoop(node);
                else if (pressed === "stop") stopLoop(node);
                else if (pressed === "reset") resetToStart(node);
            }
            markDirty(node);
            return true;
        }
        return Boolean(this.pressed);
    }
}

function enforceMinSize(node) {
    const minH = node.computeSize()[1];
    if (node.size[0] < MIN_NODE_W) node.size[0] = MIN_NODE_W;
    if (node.size[1] < minH) node.size[1] = minH;
}

function installPromptQueue(node) {
    if (!node || node._tj_pq_installed) return;
    node._tj_pq_installed = true;
    node.resizable = true;
    node.properties = node.properties || {};
    if (node.properties.tj_pq_running === undefined) node.properties.tj_pq_running = false;
    applyTheme(node);
    if (!node.title || node.title === node.type) node.title = DISPLAY_TITLE;
    ensureOutputs(node);

    const autoW = findWidget(node, "auto_set");
    if (autoW && !autoW._tj_pq_cb) {
        autoW._tj_pq_cb = true;
        const orig = autoW.callback;
        autoW.callback = function(v) {
            if (orig) orig.call(this, v);
            updateAutoSet(node);
        };
    }
    const countW = findWidget(node, "prompt_count");
    if (countW && !countW._tj_pq_cb) {
        countW._tj_pq_cb = true;
        const orig = countW.callback;
        countW.callback = function(v) {
            if (orig) orig.call(this, v);
            updatePromptVisibility(node);
        };
    }

    hideAlways(findWidget(node, "current_index"));
    hideAlways(findWidget(node, "current_queue"));

    if (!findWidget(node, "tj_prompt_queue_controls")) node.addCustomWidget(new PromptQueueControlsWidget(node));
    updateAutoSet(node);
    updatePromptVisibility(node);
    if (!node._tj_pq_status) {
        const total = Math.max(1, intWidget(node, "prompt_count", 3));
        setStatus(node, `ready - 0/${total}`, TJ_TEXT);
    }

    node.onResize = function(size) {
        if (size[0] < MIN_NODE_W) size[0] = MIN_NODE_W;
        const minH = this.computeSize()[1];
        if (size[1] < minH) size[1] = minH;
    };
    queueMicrotask(() => {
        enforceMinSize(node);
        markDirty(node);
    });
}

app.registerExtension({
    name: "TJ.PromptQueue",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            const r = onCreated?.apply(this, arguments);
            installPromptQueue(this);
            return r;
        };
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            const r = onConfigure?.apply(this, arguments);
            setTimeout(() => installPromptQueue(this), 0);
            return r;
        };
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function(message) {
            const r = onExecuted?.apply(this, arguments);
            const info = message?.tj_prompt_queue?.[0];
            if (info) {
                this._tj_pq_pending = info;
                const total = Number(info.prompt_count || intWidget(this, "prompt_count", 3));
                const pos = Number(info.current_queue || 0) + 1;
                setStatus(this, `done - ${pos}/${total}`, this.properties?.tj_pq_running ? TJ_OK : TJ_TEXT);
            }
            return r;
        };
    },
    nodeCreated(node) {
        if (node?.type === NODE_TYPE) installPromptQueue(node);
    },
    setup() {
        setTimeout(() => graphNodes(app.graph).forEach(n => { if (n?.type === NODE_TYPE) installPromptQueue(n); }), 500);
        if (!window.__TJ_PROMPT_QUEUE_TIMER_TICK__) {
            window.__TJ_PROMPT_QUEUE_TIMER_TICK__ = true;
            setInterval(() => {
                for (const n of graphNodes(app.graph)) {
                    if (n?.type !== NODE_TYPE) continue;
                    if (n.properties?.tj_pq_running) markDirty(n);
                    // 자가 치유: multiline STRING(prompt_N) 위젯은 실제 <textarea> DOM
                    // 엘리먼트가 addDOMWidget 계열로 비동기 부착되는 경우가 있어, 노드
                    // 생성 시점에 한 번만 숨기면 그 뒤에 붙는 엘리먼트를 놓칠 수 있다
                    // (canvas draw가 전혀 안 일어나는 상황에서는 더더욱). 별도 interval로
                    // 계속 재확인해서 어긋난 상태를 바로잡는다 — setWidgetVisible은
                    // 이미 올바른 상태면 아무 것도 안 하므로 반복 호출 비용은 무시할 수 있다.
                    updatePromptVisibility(n);
                }
            }, 400);
        }
        api.addEventListener("executing", (event) => {
            const detail = event?.detail;
            const nodeId = detail?.node ?? detail;
            if (nodeId !== null && nodeId !== undefined) return;
            for (const node of graphNodes(app.graph)) {
                if (node?.type === NODE_TYPE) continueAfterWorkflowFinished(node);
            }
        });
        api.addEventListener("status", (event) => {
            const q = Number(event?.detail?.exec_info?.queue_remaining);
            const running = event?.detail?.exec_info?.queue_remaining !== undefined;
            if (!running || q !== 0) return;
            setTimeout(() => {
                for (const node of graphNodes(app.graph)) {
                    if (node?.type === NODE_TYPE && node._tj_pq_pending) continueAfterWorkflowFinished(node);
                }
            }, 120);
        });
    }
});
