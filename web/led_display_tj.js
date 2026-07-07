// web/led_display_tj.js  —  LED Display (TJ)
import { app } from "../../scripts/app.js";

const NODE_TYPE = "TJ_LEDDisplay";
const TJ_BRAND = "#7612DA"; // TJ 브랜드 퍼플

const PRESETS = [
    "#00FF41", // LED 초록
    "#FFB300", // 주황 (Amber)
    "#FF3131", // 빨강
    "#00FFFF", // 청록
    "#FFFFFF", // 흰색
    "#4488FF", // 파랑
    TJ_BRAND,  // TJ 퍼플
];

// ── LED 전광판 서체 로드 (VT323 — 7세그먼트 스타일) ─────────────────────────────
(function loadLEDFont() {
    const id = "tj-led-font";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id   = id;
    link.rel  = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=VT323&display=swap";
    document.head.appendChild(link);
})();

function applyTheme(node) {
    if (window.TJ_NODE_applyTheme) return window.TJ_NODE_applyTheme(node);
    node.bgcolor = "#000000";
    node.color = "#7612DA";
    node.title_text_color = "#FFFFFF";
}

function isHex(v) { return /^#[0-9a-fA-F]{6}$/.test(String(v || "").trim()); }

function getW(node, name, fallback) {
    return node?.widgets?.find(w => w.name === name) ?? null;
}

// ── LED Display Canvas Widget ─────────────────────────────────────────────────

class LEDDisplayWidget {
    constructor(node) {
        this.name   = "tj_led_display";
        this.type   = "custom";
        this.node   = node;
        this.options = { serialize: false };

        // Runtime state
        this._text   = "";    // updated by onExecuted
        this._label  = "";
        this._drawY  = 0;
        this._drawW  = 280;

        // Swatch hit rects: [[color, [x,y,w,h]], ...]
        this._swatchRects = [];
        this._pressed = "";
    }

    serializeValue() { return undefined; }

    _fontSize()   { return Math.max(8, Math.min(256, Number(getW(this.node,"font_size")?.value)  || 64)); }
    _textColor()  { const v = String(getW(this.node,"text_color")?.value||"").trim(); return isHex(v) ? v : "#00FF41"; }
    _bgColor()    { const v = String(getW(this.node,"bg_color")?.value||"").trim();   return isHex(v) ? v : "#0A0A0A"; }
    _textWidget() { return String(getW(this.node,"text")?.value || ""); }
    _labelWidget(){ return String(getW(this.node,"label")?.value || ""); }

    computeSize(width) {
        const fs      = this._fontSize();
        const displayH = Math.max(56, fs + 28);   // 상하 패딩 포함
        const swatchH  = 30;                       // 색상 스와치 행
        return [width || 280, displayH + swatchH + 12];
    }

    // ── Draw ────────────────────────────────────────────────────────────────
    draw(ctx, node, width, y) {
        this.node  = node;
        this._drawY = y;
        this._drawW = Math.max(80, width);

        const fs        = this._fontSize();
        const textColor = this._textColor();
        const bgColor   = this._bgColor();
        const text      = this._text || this._textWidget();
        const label     = this._label || this._labelWidget();

        const pw  = Math.max(60, width - 20); // panel width
        const px  = 10;                         // panel x
        const displayH = Math.max(56, fs + 28);
        const swatchH  = 30;
        const totalH   = displayH + swatchH + 12;

        // ── Panel background ─────────────────────────────────────────────
        ctx.save();
        ctx.fillStyle = bgColor;
        this._roundRect(ctx, px, y, pw, displayH, 8);
        ctx.fill();

        // Scanlines
        ctx.fillStyle = "rgba(0,0,0,0.10)";
        for (let sy = y; sy < y + displayH; sy += 3) ctx.fillRect(px, sy, pw, 1);

        // Border (dim version of textColor)
        const [tr, tg, tb] = this._hexRgb(textColor);
        ctx.strokeStyle = `rgba(${tr},${tg},${tb},0.30)`;
        ctx.lineWidth = 1;
        this._roundRect(ctx, px + 0.5, y + 0.5, pw - 1, displayH - 1, 8);
        ctx.stroke();

        // ── Label (top-left small text) ──────────────────────────────────
        if (label) {
            ctx.fillStyle = `rgba(${tr},${tg},${tb},0.50)`;
            ctx.font = "bold 9px monospace";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(label.toUpperCase(), px + 8, y + 6);
        }

        // ── Main LED text ────────────────────────────────────────────────
        // VT323은 7세그먼트 스타일 — 오프라인 폴백은 "Digital-7", "Courier New"
        const LED_FONT = `"VT323", "Digital-7", "Courier New", monospace`;
        const cy = y + displayH / 2 + (label ? 6 : 0);

        // Glow pass 1 — wide soft halo
        ctx.shadowColor  = textColor;
        ctx.shadowBlur   = Math.max(6, fs * 0.40);
        ctx.fillStyle    = textColor;
        ctx.font         = `${fs}px ${LED_FONT}`; // bold 제거 — VT323은 자체 웨이트
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, px + pw / 2, cy);

        // Glow pass 2 — 픽셀 내부 밝은 코어
        ctx.shadowBlur  = Math.max(2, fs * 0.12);
        ctx.fillStyle   = "#FFFFFF";
        ctx.globalAlpha = 0.22;
        ctx.fillText(text, px + pw / 2, cy);
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur  = 0;
        ctx.shadowColor = "transparent";

        // ── Corner accents ───────────────────────────────────────────────
        ctx.strokeStyle = `rgba(${tr},${tg},${tb},0.45)`;
        ctx.lineWidth   = 1.5;
        const ca = 8; // corner accent length
        for (const [cx2, cy2, dx, dy] of [
            [px+2, y+2, 1, 1], [px+pw-2, y+2, -1, 1],
            [px+2, y+displayH-2, 1, -1], [px+pw-2, y+displayH-2, -1, -1],
        ]) {
            ctx.beginPath();
            ctx.moveTo(cx2, cy2 + dy * ca); ctx.lineTo(cx2, cy2); ctx.lineTo(cx2 + dx * ca, cy2);
            ctx.stroke();
        }

        ctx.restore();

        // ── Color swatch row ────────────────────────────────────────────
        this._drawSwatches(ctx, px, y + displayH + 6, pw);
    }

    _drawSwatches(ctx, px, sy, pw) {
        const r     = 7;   // 7개 스와치 기준으로 조정
        const gap   = 5;
        const total = PRESETS.length * (r * 2 + gap) - gap;
        let   sx    = px + (pw - total) / 2;
        const cy    = sy + r + 2;

        ctx.save();
        this._swatchRects = [];

        for (const color of PRESETS) {
            const active = color.toLowerCase() === this._textColor().toLowerCase();

            // Outer ring if active
            if (active) {
                ctx.strokeStyle = color;
                ctx.lineWidth   = 1.5;
                ctx.shadowColor = color;
                ctx.shadowBlur  = 6;
                ctx.beginPath();
                ctx.arc(sx + r, cy, r + 2.5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            // Fill circle
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(sx + r, cy, r, 0, Math.PI * 2);
            ctx.fill();

            // Pressed indication
            if (this._pressed === color) {
                ctx.fillStyle = "rgba(255,255,255,0.4)";
                ctx.beginPath();
                ctx.arc(sx + r, cy, r, 0, Math.PI * 2);
                ctx.fill();
            }

            this._swatchRects.push([color, [sx, cy - r, r * 2, r * 2]]);
            sx += r * 2 + gap;
        }
        ctx.restore();
    }

    // ── Mouse ───────────────────────────────────────────────────────────────
    mouse(event, pos, node) {
        const type = String(event?.type || "");
        const hit  = this._swatchRects.find(([, [rx, ry, rw, rh]]) =>
            pos[0] >= rx && pos[0] <= rx + rw && pos[1] >= ry && pos[1] <= ry + rh
        );
        const color = hit?.[0] ?? "";

        if ((type === "pointerdown" || type === "mousedown") && color) {
            this._pressed = color;
            node.setDirtyCanvas?.(true, true);
            return true;
        }
        if ((type === "pointerup" || type === "mouseup") && this._pressed) {
            const pressed = this._pressed;
            this._pressed = "";
            if (color === pressed) {
                // Update text_color widget
                const w = getW(node, "text_color");
                if (w) {
                    w.value = pressed;
                    w.callback?.call(w, pressed);
                }
                node.setDirtyCanvas?.(true, true);
            }
            return true;
        }
        return Boolean(this._pressed);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────
    _roundRect(ctx, x, y, w, h, r) {
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
        else {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
            ctx.lineTo(x + w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
            ctx.lineTo(x + r, y+h);   ctx.arcTo(x, y+h, x, y+h-r, r);
            ctx.lineTo(x, y+r);       ctx.arcTo(x, y, x+r, y, r);
            ctx.closePath();
        }
    }
    _hexRgb(hex) {
        return [
            parseInt(hex.slice(1,3), 16),
            parseInt(hex.slice(3,5), 16),
            parseInt(hex.slice(5,7), 16),
        ];
    }
}

// ── Extension ─────────────────────────────────────────────────────────────────

app.registerExtension({
    name: "TJ.LEDDisplay",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        // ── onNodeCreated ────────────────────────────────────────────────
        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origCreated?.apply(this, arguments);
            applyTheme(this);
            _installLED(this);
        };

        // ── onConfigure ─────────────────────────────────────────────────
        const origConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            origConfigure?.apply(this, arguments);
            setTimeout(() => {
                applyTheme(this);
                _installLED(this);
                // 로드 시 저장된 사이즈 보존 — 최솟값만 보장
                _enforceMinSize(this);
                this.setDirtyCanvas?.(true, true);
            }, 80);
        };

        // ── onExecuted — receive value from Python ───────────────────────
        const origExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            origExecuted?.apply(this, arguments);
            const data = message?.tj_led?.[0];
            if (!data) return;
            const w = this.widgets?.find(w => w.name === "tj_led_display");
            if (w) {
                w._text  = String(data.text  ?? "");
                w._label = String(data.label ?? "");
                // 텍스트/레이블은 사이즈에 영향 없음 — 리드로우만
                this.setDirtyCanvas?.(true, true);
            }
        };
    },
});

// ── Install helper ────────────────────────────────────────────────────────────

const MIN_W = 240;

function _enforceMinSize(node) {
    const minH = node.computeSize?.()[1] ?? node.size[1];
    if (node.size[0] < MIN_W) node.size[0] = MIN_W;
    if (node.size[1] < minH) node.size[1] = minH;
}

function _installLED(node) {
    // Add custom display widget (once only)
    if (!node.widgets?.find(w => w.name === "tj_led_display")) {
        node.addCustomWidget(new LEDDisplayWidget(node));
    }

    // 사용자 리사이즈 시 최솟값만 보장
    node.onResize = function (size) {
        if (size[0] < MIN_W) size[0] = MIN_W;
        const minH = this.computeSize()[1];
        if (size[1] < minH) size[1] = minH;
    };

    // font_size: 디스플레이 높이가 바뀌므로 높이만 조정, 너비 보존
    // 나머지(text_color, bg_color, text, label): 사이즈 불변, 리드로우만
    for (const name of ["font_size", "text_color", "bg_color", "text", "label"]) {
        const w = node.widgets?.find(w => w.name === name);
        if (!w || w._tj_led_cb) continue;
        w._tj_led_cb = true;
        const orig = w.callback;
        w.callback = function (value) {
            orig?.call(this, value);
            if (name === "font_size") {
                // 높이만 조정 — 사용자가 늘린 너비는 보존
                const computed = node.computeSize?.() ?? node.size;
                node.setSize?.([node.size[0], computed[1]]);
            }
            node.setDirtyCanvas?.(true, true);
        };
    }

    queueMicrotask(() => {
        // 최솟값만 보장 — 사용자가 조절한 사이즈는 건드리지 않음
        _enforceMinSize(node);
        node.setDirtyCanvas?.(true, true);
    });
}
