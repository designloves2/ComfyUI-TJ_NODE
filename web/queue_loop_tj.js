// Queue Loop (TJ)
// Runs the workflow repeatedly as separate queue executions and outputs the current index first.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "TJ_QueueLoop";
const DISPLAY_TITLE = "Queue Loop (TJ)";
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
        console.warn("[TJ_NODE] Queue Loop queue failed", err);
    }
}
function applyTheme(node) {
    if (typeof window.TJ_NODE_applyTheme === "function") return window.TJ_NODE_applyTheme(node);
    node.bgcolor = TJ_BG;
    node.color = TJ_PURPLE;
    node.title_text_color = TJ_TEXT;
}
function hideWidget(widget) {
    if (!widget || widget._tj_ql_hidden) return;
    widget._tj_ql_hidden = true;
    widget._tj_ql_orig_compute = widget.computeSize;
    widget._tj_ql_orig_draw = widget.draw;
    widget._tj_ql_orig_mouse = widget.mouse;
    widget.computeSize = () => [0, -4];
    widget.draw = () => {};
    widget.mouse = () => false;
}

const QUEUE_LOOP_OUTPUTS = [
    { name: "index", type: "INT" },
    { name: "index_text", type: "STRING" },
    { name: "queue_count", type: "INT" },
];

function ensureOutputs(node) {
    if (!node?.outputs) return;
    QUEUE_LOOP_OUTPUTS.forEach((spec, i) => {
        const out = node.outputs?.[i];
        if (!out) return;
        out.name = spec.name;
        out.localized_name = spec.name;
        out.type = spec.type;
    });
    for (let i = node.outputs.length - 1; i >= QUEUE_LOOP_OUTPUTS.length; i--) {
        try { node.removeOutput(i); } catch (_) { node.outputs.splice(i, 1); }
    }
}
function updateAutoSet(node) {
    if (!node) return;
    node.properties = node.properties || {};
    node.properties.auto_sets = {};
    ensureOutputs(node);
    const enabled = boolWidget(node, "auto_set", true);
    QUEUE_LOOP_OUTPUTS.forEach((spec, i) => {
        const out = node.outputs?.[i];
        if (!out) return;
        out.name = spec.name;
        out.localized_name = spec.name;
        out.type = spec.type;
        out.label = enabled ? `${spec.name} ▶` : spec.name;
        if (enabled) node.properties.auto_sets[i] = spec.name;
    });
    if (typeof window.TJ_NODE_scheduleWirelessRepair === "function") {
        window.TJ_NODE_scheduleWirelessRepair(node.graph || app.graph, 80);
    }
    markDirty(node);
}
function setStatus(node, text, color = TJ_TEXT) {
    node._tj_queue_loop_status = text;
    node._tj_queue_loop_status_color = color;
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
    const running = !!node.properties.tj_queue_loop_running;
    const start = Number(node.properties.tj_queue_loop_started_at || 0);
    if (running && start > 0) return Date.now() - start;
    return Number(node.properties.tj_queue_loop_elapsed_ms || 0);
}
function startTimer(node) {
    node.properties = node.properties || {};
    node.properties.tj_queue_loop_started_at = Date.now();
    node.properties.tj_queue_loop_elapsed_ms = 0;
}
function stopTimer(node) {
    node.properties = node.properties || {};
    const start = Number(node.properties.tj_queue_loop_started_at || 0);
    if (start > 0) node.properties.tj_queue_loop_elapsed_ms = Date.now() - start;
    node.properties.tj_queue_loop_started_at = 0;
}
function resetTimer(node) {
    node.properties = node.properties || {};
    node.properties.tj_queue_loop_started_at = 0;
    node.properties.tj_queue_loop_elapsed_ms = 0;
}
function indexMode(node) {
    return String(findWidget(node, "index_loop_mode")?.value || "Index Loop");
}
function nextIndexValue(node, current) {
    const start = Math.max(1, intWidget(node, "start_index", 1));
    const end = Math.max(start, intWidget(node, "end_index", start));
    const step = Math.max(1, intWidget(node, "step", 1));
    const next = Math.max(1, Number(current || 1)) + step;
    if (indexMode(node) === "Index Loop") return next > end ? start : next;
    return Math.min(next, end);
}
function resetToStart(node) {
    const start = Math.max(1, intWidget(node, "start_index", 1));
    setWidgetValue(node, "current_index", start);
    setWidgetValue(node, "current_queue", 0);
    node.properties = node.properties || {};
    node.properties.tj_queue_loop_running = false;
    node._tj_queue_loop_pending = null;
    resetTimer(node);
    setStatus(node, `ready - 0/${intWidget(node, "queue_count", 1)}`, TJ_TEXT);
}
function stopLoop(node, reason = "Stopped") {
    node.properties = node.properties || {};
    node.properties.tj_queue_loop_running = false;
    node._tj_queue_loop_pending = null;
    stopTimer(node);
    setStatus(node, reason, TJ_WARN);
}

function startLoop(node) {
    node.properties = node.properties || {};
    const start = Math.max(1, intWidget(node, "start_index", 1));

    // 연결된 IndexLoRALoader의 활성 LoRA 수를 자동으로 반영합니다.

    setWidgetValue(node, "current_index", start);
    setWidgetValue(node, "current_queue", 0);
    node.properties.tj_queue_loop_running = true;
    node._tj_queue_loop_pending = null;
    startTimer(node);
    const total = Math.max(1, intWidget(node, "queue_count", 1));
    setStatus(node, `running - 1/${total}`, TJ_OK);
    setTimeout(() => queuePromptSafe(), 40);
}
function continueAfterWorkflowFinished(node) {
    if (!node || node.type !== NODE_TYPE) return;
    if (!node.properties?.tj_queue_loop_running || !node._tj_queue_loop_pending) return;

    const info = node._tj_queue_loop_pending;
    node._tj_queue_loop_pending = null;

    const total = Math.max(1, intWidget(node, "queue_count", Number(info.queue_count || 1)));
    const queuePos = Math.max(0, Number(info.current_queue ?? intWidget(node, "current_queue", 0)));
    const nextQueuePos = queuePos + 1;

    if (nextQueuePos >= total) {
        node.properties.tj_queue_loop_running = false;
        setWidgetValue(node, "current_queue", total);
        stopTimer(node);
        setStatus(node, `done - ${total}/${total}`, TJ_OK);
        return;
    }

    const current = Math.max(1, Number(info.index ?? intWidget(node, "current_index", intWidget(node, "start_index", 1))));
    const nextIndex = nextIndexValue(node, current);
    setWidgetValue(node, "current_index", nextIndex);
    setWidgetValue(node, "current_queue", nextQueuePos);
    setStatus(node, `running - ${nextQueuePos + 1}/${total}`, TJ_OK);
    setTimeout(() => queuePromptSafe(), 80);
}

const PANEL_INNER_H = 76; // status(22) + gap(10) + buttons(26) + margins
const WIDGET_H = PANEL_INNER_H + 14; // top(6) + panel + bottom(8)
const MIN_NODE_W = 280;

class QueueLoopControlsWidget {
    constructor(node) {
        this.name = "tj_queue_loop_controls";
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
        const by = this._drawY + 6 + 30; // top + status area
        return {
            start: [x + 10,               by, bw, 26],
            stop:  [x + 10 + bw + gap,    by, bw, 26],
            reset: [x + 10 + (bw+gap)*2,  by, bw, 26],
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
        this.node = node;
        this._drawY = y;
        this._drawW = Math.max(MIN_NODE_W, Number(width || node.size?.[0] || MIN_NODE_W));

        const w = this._drawW;
        const x = 12;
        const panelW = Math.max(60, w - 24);
        const top = y + 6;
        const running = !!node.properties?.tj_queue_loop_running;

        // Panel background
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

        // Status text + elapsed
        const status = node._tj_queue_loop_status || "ready - 0/0";
        const elapsed = formatElapsed(currentElapsedMs(node));
        ctx.font = "bold 15px monospace";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = node._tj_queue_loop_status_color || TJ_TEXT;
        ctx.textAlign = "left";
        ctx.fillText(status, x + 10, top + 20);
        ctx.fillStyle = TJ_TEXT;
        ctx.font = "13px monospace";
        ctx.textAlign = "right";
        ctx.fillText(elapsed, x + panelW - 10, top + 20);

        // Buttons
        const bounds = this._buttonBounds(panelW);
        this._drawButton(ctx, bounds, "start", running ? "Restart" : "Start", running);
        this._drawButton(ctx, bounds, "stop",  "Stop",  false);
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
        const key = ["start","stop","reset"].find(hit) || "";

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

function installQueueLoop(node) {
    if (!node || node._tj_queue_loop_installed) return;
    node._tj_queue_loop_installed = true;
    node.resizable = true;
    node.properties = node.properties || {};
    if (node.properties.tj_queue_loop_running === undefined) node.properties.tj_queue_loop_running = false;
    applyTheme(node);
    if (!node.title || node.title === node.type) node.title = DISPLAY_TITLE;
    ensureOutputs(node);

    const autoW = findWidget(node, "auto_set");
    if (autoW && !autoW._tj_ql_cb) {
        autoW._tj_ql_cb = true;
        const orig = autoW.callback;
        autoW.callback = function(v) {
            if (orig) orig.call(this, v);
            updateAutoSet(node);
        };
    }

    hideWidget(findWidget(node, "current_index"));
    hideWidget(findWidget(node, "current_queue"));

    if (!findWidget(node, "tj_queue_loop_controls")) node.addCustomWidget(new QueueLoopControlsWidget(node));
    updateAutoSet(node);
    if (!node._tj_queue_loop_status) {
        setStatus(node, `ready - 0/${intWidget(node, "queue_count", 1)}`, TJ_TEXT);
    }

    // 최소 사이즈 강제 적용
    node.onResize = function(size) {
        if (size[0] < MIN_NODE_W) size[0] = MIN_NODE_W;
        const minH = this.computeSize()[1];
        if (size[1] < minH) size[1] = minH;
    };
    queueMicrotask(() => {
        enforceMinSize(node); // 최솟값만 보장 — 사용자가 키운 사이즈는 건드리지 않음
        markDirty(node);
    });
}

app.registerExtension({
    name: "TJ.QueueLoop",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            const r = onCreated?.apply(this, arguments);
            installQueueLoop(this);
            return r;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(data) {
            const r = onConfigure?.apply(this, arguments);
            queueMicrotask(() => installQueueLoop(this));
            return r;
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function(message) {
            const r = onExecuted?.apply(this, arguments);
            const info = message?.tj_queue_loop?.[0];
            if (info) {
                this._tj_queue_loop_pending = info;
                const total = Number(info.queue_count || intWidget(this, "queue_count", 1));
                const pos = Number(info.current_queue || 0) + 1;
                setStatus(this, `done - ${pos}/${total}`, this.properties?.tj_queue_loop_running ? TJ_OK : TJ_TEXT);
            }
            return r;
        };
    },
    nodeCreated(node) {
        if (node?.type === NODE_TYPE) installQueueLoop(node);
    },
    setup() {
        setTimeout(() => graphNodes(app.graph).forEach(n => { if (n?.type === NODE_TYPE) installQueueLoop(n); }), 500);
        if (!window.__TJ_QUEUE_LOOP_TIMER_TICK__) {
            window.__TJ_QUEUE_LOOP_TIMER_TICK__ = true;
            setInterval(() => {
                for (const n of graphNodes(app.graph)) {
                    if (n?.type === NODE_TYPE && n.properties?.tj_queue_loop_running) markDirty(n);
                }
            }, 1000);
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
                    if (node?.type === NODE_TYPE && node._tj_queue_loop_pending) continueAfterWorkflowFinished(node);
                }
            }, 120);
        });
    }
});
