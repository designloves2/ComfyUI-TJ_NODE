import { app } from "../../scripts/app.js";

const NODE_NAME = "TJ_UniversalCalculator";

function roundToMultiple(value, multiple) {
    multiple = Math.max(1, multiple);
    return Math.round(value / multiple) * multiple;
}

function gcd(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b) { [a, b] = [b, a % b]; }
    return a || 1;
}

function ratioStr(w, h) {
    if (w <= 0 || h <= 0) return "-";
    const g = gcd(w, h);
    return `${Math.round(w / g)}:${Math.round(h / g)}`;
}

function getW(node, name) {
    return node.widgets.find(w => w.name === name);
}

function toggleWidget(node, widget, show) {
    if (!widget) return;
    if (widget.__tjOrigType === undefined) {
        widget.__tjOrigType = widget.type;
        widget.__tjOrigComputeSize = widget.computeSize;
    }
    if (show) {
        widget.type = widget.__tjOrigType;
        widget.computeSize = widget.__tjOrigComputeSize;
    } else {
        widget.type = "hidden";
        widget.computeSize = () => [0, -4];
    }
}

app.registerExtension({
    name: "TJ.UniversalCalculator",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            const node = this;

            const resMode = getW(node, "res_mode");
            const width = getW(node, "width");
            const height = getW(node, "height");
            const aspectW = getW(node, "aspect_w");
            const aspectH = getW(node, "aspect_h");
            const megapixels = getW(node, "megapixels");
            const divisor = getW(node, "divisor");
            const fps = getW(node, "fps");
            const seconds = getW(node, "seconds");
            const frameCount = getW(node, "frame_count");

            // 상태: syncing(재귀 방지), ready(로드 중 값 스크램블 방지)
            const S = { syncing: false, ready: false };

            // ---- 값을 어떤 경로로 바꾸든 가로채서 재계산 ----
            function trap(widget, handler) {
                if (!widget || widget.__tjTrapped) return;
                widget.__tjTrapped = true;
                let backing = widget.value;
                Object.defineProperty(widget, "value", {
                    get() { return backing; },
                    set(v) {
                        const changed = backing !== v;
                        backing = v;
                        if (changed && S.ready && !S.syncing) handler();
                    },
                    configurable: true,
                    enumerable: true,
                });
            }
            function setVal(widget, v) { widget.value = v; }  // syncing 중엔 handler 안 돎

            function currentDivisor() {
                return parseInt(divisor.value, 10) || 8;
            }

            function updateModeVisibility() {
                const isAspect = resMode.value === "aspect_ratio";
                toggleWidget(node, aspectW, isAspect);
                toggleWidget(node, aspectH, isAspect);
                toggleWidget(node, megapixels, !isAspect);
                node.setDirtyCanvas(true, true);
            }

            // ---- 해상도: 0 = 빈칸(자동), 채워진 칸 기준으로 나머지 계산 ----
            // edited: "width" | "height" | "master"(비율/모드 변경)
            function recalcResolution(edited) {
                if (S.syncing) return;
                S.syncing = true;
                const div = currentDivisor();
                let w = Math.max(0, width.value);
                let h = Math.max(0, height.value);

                if (resMode.value === "aspect_ratio") {
                    const aw = Math.max(1, aspectW.value);
                    const ah = Math.max(1, aspectH.value);
                    if (edited === "width") {
                        if (w > 0) h = roundToMultiple(w * ah / aw, div);
                    } else if (edited === "height") {
                        if (h > 0) w = roundToMultiple(h * aw / ah, div);
                    } else { // master: 비율/모드 변경 → 채워진 칸 기준
                        if (w > 0) h = roundToMultiple(w * ah / aw, div);
                        else if (h > 0) w = roundToMultiple(h * aw / ah, div);
                    }
                } else { // megapixel
                    const target = megapixels.value * 1_000_000;
                    if (edited === "width") {
                        if (w > 0) h = roundToMultiple(target / w, div);
                    } else if (edited === "height") {
                        if (h > 0) w = roundToMultiple(target / h, div);
                    } else {
                        if (w > 0 && h > 0) {
                            const ratio = w / h;
                            const newH = Math.sqrt(target / ratio);
                            w = roundToMultiple(newH * ratio, div);
                            h = roundToMultiple(newH, div);
                        } else if (w > 0) {
                            h = roundToMultiple(target / w, div);
                        } else if (h > 0) {
                            w = roundToMultiple(target / h, div);
                        }
                    }
                }

                if (w > 0) w = Math.max(div, roundToMultiple(w, div));
                if (h > 0) h = Math.max(div, roundToMultiple(h, div));
                setVal(width, w);
                setVal(height, h);
                S.syncing = false;
                node.setDirtyCanvas(true, true);
            }

            function recalcDivisorOnly() {
                if (S.syncing) return;
                S.syncing = true;
                const div = currentDivisor();
                if (width.value > 0) setVal(width, Math.max(div, roundToMultiple(width.value, div)));
                if (height.value > 0) setVal(height, Math.max(div, roundToMultiple(height.value, div)));
                S.syncing = false;
                node.setDirtyCanvas(true, true);
            }

            // ---- 시간/프레임: 0 = 빈칸(자동), fps 기준 ----
            // edited: "seconds" | "frames" | "master"(fps 변경)
            function recalcTime(edited) {
                if (S.syncing) return;
                S.syncing = true;
                const f = fps.value;
                let s = Math.max(0, seconds.value);
                let n = Math.max(0, frameCount.value);

                if (f > 0) {
                    if (edited === "seconds") {
                        if (s > 0) n = Math.round(s * f);
                    } else if (edited === "frames") {
                        if (n > 0) s = Math.round((n / f) * 10000) / 10000;
                    } else { // fps 변경 → 채워진 칸 기준(초 우선)
                        if (s > 0) n = Math.round(s * f);
                        else if (n > 0) s = Math.round((n / f) * 10000) / 10000;
                    }
                }
                setVal(seconds, s);
                setVal(frameCount, n);
                S.syncing = false;
                node.setDirtyCanvas(true, true);
            }

            trap(width, () => recalcResolution("width"));
            trap(height, () => recalcResolution("height"));
            trap(aspectW, () => recalcResolution("master"));
            trap(aspectH, () => recalcResolution("master"));
            trap(megapixels, () => recalcResolution("master"));
            trap(divisor, () => recalcDivisorOnly());
            trap(resMode, () => { updateModeVisibility(); recalcResolution("master"); });
            trap(fps, () => recalcTime("master"));
            trap(seconds, () => recalcTime("seconds"));
            trap(frameCount, () => recalcTime("frames"));

            updateModeVisibility();

            // 로드/configure 로 값이 세팅되는 동안엔 재계산 억제, 그 다음 프레임부터 활성화
            requestAnimationFrame(() => { S.ready = true; });

            // ---- 요약 패널 (실시간 표시용, 출력에는 영향 없음) ----
            node.addCustomWidget({
                name: "tj_res_summary",
                type: "TJ_SUMMARY",
                value: "",
                draw(ctx, node2, widgetWidth, y) {
                    const h = 30;
                    const w = width.value, ht = height.value;
                    let text;
                    if (w > 0 && ht > 0) {
                        const mp = ((w * ht) / 1_000_000).toFixed(2);
                        text = `📐 ${w} × ${ht}  (${ratioStr(w, ht)}, ${mp}MP)`;
                    } else {
                        text = `📐 — W 또는 H 입력 대기`;
                    }
                    ctx.save();
                    ctx.fillStyle = "rgba(80, 160, 220, 0.18)";
                    ctx.beginPath();
                    ctx.roundRect(8, y, widgetWidth - 16, h - 6, 6);
                    ctx.fill();
                    ctx.strokeStyle = "rgba(80, 160, 220, 0.55)";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.fillStyle = "#cfe8ff";
                    ctx.font = "12px sans-serif";
                    ctx.textBaseline = "middle";
                    ctx.fillText(text, 16, y + (h - 6) / 2);
                    ctx.restore();
                    return h;
                },
                computeSize(width_) {
                    return [width_, 30];
                },
            });

            node.addCustomWidget({
                name: "tj_time_summary",
                type: "TJ_SUMMARY",
                value: "",
                draw(ctx, node2, widgetWidth, y) {
                    const h = 30;
                    const n = frameCount.value, s = seconds.value;
                    let text;
                    if (n > 0 && s > 0) {
                        text = `⏱ ${n} frames @ ${fps.value}fps  =  ${s.toFixed(3)}s`;
                    } else {
                        text = `⏱ — seconds 또는 frames 입력 대기`;
                    }
                    ctx.save();
                    ctx.fillStyle = "rgba(220, 160, 80, 0.18)";
                    ctx.beginPath();
                    ctx.roundRect(8, y, widgetWidth - 16, h - 6, 6);
                    ctx.fill();
                    ctx.strokeStyle = "rgba(220, 160, 80, 0.55)";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.fillStyle = "#ffe3c2";
                    ctx.font = "12px sans-serif";
                    ctx.textBaseline = "middle";
                    ctx.fillText(text, 16, y + (h - 6) / 2);
                    ctx.restore();
                    return h;
                },
                computeSize(width_) {
                    return [width_, 30];
                },
            });

            node.color = "#2b3f52";
            node.bgcolor = "#1c2a36";
            node.size = node.computeSize();
        };
    },
});
