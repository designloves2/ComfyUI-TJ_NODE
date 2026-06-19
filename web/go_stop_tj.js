import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_CLASS = "TJ_GoStop";

// TJ_NODE original skin
const TJ_BG = "#000000";
const TJ_COLOR = "#7612DA";
const TJ_TITLE = "#FFFFFF";

// Multi Image Loader (TJ) button CSS 그대로 사용
const TJ_BUTTON_CSS = "height:24px;flex:1 1 0;min-width:0;padding:0;border:none;border-radius:4px;background:#0055bb;color:#00efff;font-size:11px;cursor:pointer;box-shadow:0 0 5px #00bfff88;box-sizing:border-box;text-align:center;";
const TJ_BUTTON_DISABLED_CSS = "opacity:0.45;cursor:default;";

// WEB_DIRECTORY = ./web 기준. 폴더명이 바뀌어도 현재 JS 위치에서 상대 경로로 mp3를 찾음.
const SOUND_URL = new URL("/extensions/ComfyUI-TJ_NODE2/audio/go_stop_notice.mp3", import.meta.url).href;

const waitingNodeIds = new Set();

const postGo = (nodeId) => fetch(`/tj_go_stop/go/${nodeId}`, { method: "POST" });
const postStop = (nodeId) => fetch(`/tj_go_stop/stop/${nodeId}`, { method: "POST" });
const postStopAll = () => fetch("/tj_go_stop/stop", { method: "POST" });

function getWidget(node, name) {
    return node.widgets?.find((w) => w.name === name);
}

function applyTJStyle(node) {
    node.bgcolor = TJ_BG;
    node.color = TJ_COLOR;
    node.title_text_color = TJ_TITLE;
}

function syncLabel(node) {
    const w = getWidget(node, "set_name");
    const value = String(w?.value ?? "").trim();
    node.properties = node.properties || {};
    node.properties.label_name = value ? `▶ ${value}` : "";
}

function updateButtonState(node) {
    const ui = node._tjGoStopUI;
    if (!ui) return;

    const waiting = waitingNodeIds.has(String(node.id));
    ui.goBtn.disabled = !waiting;
    ui.stopBtn.disabled = !waiting;

    ui.goBtn.style.cssText = TJ_BUTTON_CSS + (waiting ? "" : TJ_BUTTON_DISABLED_CSS);
    ui.stopBtn.style.cssText = TJ_BUTTON_CSS + (waiting ? "" : TJ_BUTTON_DISABLED_CSS);
}

function setWaiting(node) {
    applyTJStyle(node);
    updateButtonState(node);
    app.graph?.setDirtyCanvas(true, false);
}

function triggerGo(node) {
    waitingNodeIds.delete(String(node.id));
    setWaiting(node);
    postGo(node.id);
}

function triggerStop(node) {
    waitingNodeIds.delete(String(node.id));
    setWaiting(node);
    postStop(node.id);
}

function addGoStopButtons(node) {
    if (node._tjGoStopUI) return;

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:6px;align-items:center;width:100%;padding:4px;background:#000;border-radius:6px;box-sizing:border-box;";

    const goBtn = document.createElement("button");
    goBtn.textContent = "GO";
    goBtn.style.cssText = TJ_BUTTON_CSS;

    const stopBtn = document.createElement("button");
    stopBtn.textContent = "STOP";
    stopBtn.style.cssText = TJ_BUTTON_CSS;

    function stopEvent(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    [goBtn, stopBtn].forEach((btn) => {
        btn.addEventListener("pointerdown", stopEvent);
        btn.addEventListener("mousedown", stopEvent);
    });

    goBtn.addEventListener("click", (e) => {
        stopEvent(e);
        if (goBtn.disabled) return;
        triggerGo(node);
    });

    stopBtn.addEventListener("click", (e) => {
        stopEvent(e);
        if (stopBtn.disabled) return;
        triggerStop(node);
    });

    btnRow.appendChild(goBtn);
    btnRow.appendChild(stopBtn);

    const domWidget = node.addDOMWidget("tj_go_stop_buttons", "customtext", btnRow, {
        serialize: false,
        hideOnZoom: false,
    });

    domWidget.computeSize = function () {
        const width = Math.max(160, (node.size?.[0] || 220) - 20);
        return [width, 34];
    };

    node._tjGoStopUI = { btnRow, goBtn, stopBtn, domWidget };
    updateButtonState(node);
}

function installNodeHooks(node) {
    if (node._tjGoStopHooksInstalled) return;
    node._tjGoStopHooksInstalled = true;

    const originalDrawForeground = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
        originalDrawForeground?.apply(this, arguments);
        syncLabel(this);
    };

    const originalConfigure = node.onConfigure;
    node.onConfigure = function (data) {
        const r = originalConfigure?.apply(this, arguments);
        setTimeout(() => {
            applyTJStyle(this);
            syncLabel(this);
            addGoStopButtons(this);
            updateButtonState(this);
            this.setDirtyCanvas?.(true, true);
        }, 50);
        return r;
    };
}

app.registerExtension({
    name: "tj-node.go-stop",

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;

        node.size = [260, 170];
        applyTJStyle(node);
        syncLabel(node);
        installNodeHooks(node);
        addGoStopButtons(node);
        setWaiting(node);
    },

    loadedGraphNode(node) {
        if (node.comfyClass !== NODE_CLASS) return;

        applyTJStyle(node);
        syncLabel(node);
        installNodeHooks(node);
        addGoStopButtons(node);
        setWaiting(node);
    },

    setup() {
        api.addEventListener("tj_go_stop_waiting", ({ detail }) => {
            const nodeId = String(detail.node_id);
            waitingNodeIds.add(nodeId);

            const node = app.graph.getNodeById(nodeId);
            if (node) {
                applyTJStyle(node);
                syncLabel(node);
                updateButtonState(node);
                app.graph.setDirtyCanvas(true, false);
            }

            if (detail?.sound_notice) {
                new Audio(SOUND_URL).play().catch(() => {});
            }
        });

        const originalInterrupt = api.interrupt;
        api.interrupt = function () {
            waitingNodeIds.clear();
            postStopAll();
            originalInterrupt.apply(this, arguments);
        };
    },
});
