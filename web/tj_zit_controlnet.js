import { app } from "../../scripts/app.js";

const ACCENT = "#B78CFF";
const INFO_TITLE = "ZIT ControlNet (TJ)";
const INFO_TEXT =
    "Depth / canny / pose control bundle for Z-Image Turbo (TJ). " +
    "Turn ON each control type and connect its image slot. " +
    "Preprocess options live in Advanced. If a preprocessor pack is missing, " +
    "turn preprocess OFF and connect a prepared control map. " +
    "Connect the zit_control output to Z-Image Turbo (TJ)'s zit_control input in Advanced.";

const ADVANCED_WIDGETS = [
    "depth_preprocess",
    "canny_preprocess",
    "pose_preprocess",
    "preprocessor_resolution",
    "canny_low",
    "canny_high",
];

function findWidget(node, name) {
    return node.widgets?.find((widget) => widget.name === name);
}

function setWidgetVisible(node, widget, visible) {
    if (!widget) return;
    if (!widget._tjOriginalType) {
        widget._tjOriginalType = widget.type;
        widget._tjOriginalComputeSize = widget.computeSize;
    }
    widget.hidden = !visible;
    widget.disabled = !visible;
    widget.type = visible ? widget._tjOriginalType : "hidden";
    widget.computeSize = visible ? widget._tjOriginalComputeSize : () => [0, -4];
}

function isAdvanced(node) {
    return !!(node.properties && node.properties.tj_zit_control_advanced);
}

function applyAdvanced(node) {
    const advanced = isAdvanced(node);
    for (const name of ADVANCED_WIDGETS) setWidgetVisible(node, findWidget(node, name), advanced);
    if (node._tjAdvButton) node._tjAdvButton.name = advanced ? "Hide advanced settings" : "Show advanced settings";
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

function titleHeight() {
    return (typeof LiteGraph !== "undefined" && LiteGraph.NODE_TITLE_HEIGHT) || 30;
}

function wrapText(ctx, text, maxWidth) {
    const lines = [];
    let line = "";
    for (const word of String(text).split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(test).width > maxWidth) {
            lines.push(line);
            line = word;
        } else line = test;
    }
    if (line) lines.push(line);
    return lines;
}

function drawInfoBadge(node, ctx) {
    if (node.flags && node.flags.collapsed) {
        node._tjZitInfoRect = null;
        return;
    }
    const r = 7;
    const cx = node.size[0] - 15;
    const cy = -titleHeight() * 0.5;
    node._tjZitInfoRect = { cx, cy, r };

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = node._tjZitInfoHover ? ACCENT : "#6b7785";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", cx, cy + 0.5);
    ctx.restore();

    if (!node._tjZitInfoHover) return;

    ctx.save();
    const pad = 9;
    const maxTextW = 280;
    const lineH = 15;
    const titleH = 17;
    ctx.font = "11px sans-serif";
    const lines = wrapText(ctx, INFO_TEXT, maxTextW);
    const boxW = maxTextW + pad * 2;
    const boxH = pad + titleH + lines.length * lineH + pad;
    const bx = node.size[0] + 12;
    const by = cy;

    ctx.fillStyle = "rgba(20, 26, 32, 0.96)";
    ctx.strokeStyle = "#7612DA";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, 6);
    else ctx.rect(bx, by, boxW, boxH);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let y = by + pad;
    ctx.fillStyle = ACCENT;
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(INFO_TITLE, bx + pad, y);
    y += titleH;
    ctx.fillStyle = "#cfd6de";
    ctx.font = "11px sans-serif";
    lines.forEach((ln, i) => ctx.fillText(ln, bx + pad, y + i * lineH));
    ctx.restore();
}

app.registerExtension({
    name: "TJ.ZITControlNet",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "TJ_ZITControlNet") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            window.TJ_NODE_applyTheme?.(this);
            this._tjAdvButton = this.addWidget("button", "Show advanced settings", "advanced", () => {
                this.properties = this.properties || {};
                this.properties.tj_zit_control_advanced = !isAdvanced(this);
                applyAdvanced(this);
            }, { serialize: false });
            applyAdvanced(this);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            onConfigure?.apply(this, arguments);
            requestAnimationFrame(() => {
                window.TJ_NODE_applyTheme?.(this);
                applyAdvanced(this);
            });
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            const res = onDrawForeground?.apply(this, arguments);
            try { drawInfoBadge(this, ctx); } catch (_) {}
            return res;
        };

        const onMouseMove = nodeType.prototype.onMouseMove;
        nodeType.prototype.onMouseMove = function (event, pos) {
            const rect = this._tjZitInfoRect;
            let hover = false;
            if (rect && Array.isArray(pos)) {
                const dx = pos[0] - rect.cx;
                const dy = pos[1] - rect.cy;
                hover = dx * dx + dy * dy <= (rect.r + 4) * (rect.r + 4);
            }
            if (hover !== !!this._tjZitInfoHover) {
                this._tjZitInfoHover = hover;
                this.setDirtyCanvas?.(true, true);
                app.canvas?.setDirty(true, true);
            }
            return onMouseMove?.apply(this, arguments);
        };
    },
});
