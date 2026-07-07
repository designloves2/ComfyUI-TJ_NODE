import { app } from "../../scripts/app.js";

const NODE_NAME = "TJ_UniversalCalculator";

function roundToMultiple(value, multiple) {
    multiple = Math.max(1, multiple);
    return Math.round(value / multiple) * multiple;
}

function getW(node, name) {
    return node.widgets.find(w => w.name === name);
}

function setWidgetValue(widget, value) {
    // callback 재귀 방지: 값만 조용히 갱신
    widget.value = value;
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

            let syncing = false;

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

            function recalcFromWidth() {
                if (syncing) return;
                syncing = true;
                const div = currentDivisor();
                if (resMode.value === "aspect_ratio") {
                    const ratio = aspectW.value / aspectH.value;
                    setWidgetValue(height, Math.max(div, roundToMultiple(width.value / ratio, div)));
                } else {
                    const targetPixels = megapixels.value * 1_000_000;
                    setWidgetValue(height, Math.max(div, roundToMultiple(targetPixels / width.value, div)));
                }
                syncing = false;
                node.setDirtyCanvas(true, true);
            }

            function recalcFromHeight() {
                if (syncing) return;
                syncing = true;
                const div = currentDivisor();
                if (resMode.value === "aspect_ratio") {
                    const ratio = aspectW.value / aspectH.value;
                    setWidgetValue(width, Math.max(div, roundToMultiple(height.value * ratio, div)));
                } else {
                    const targetPixels = megapixels.value * 1_000_000;
                    setWidgetValue(width, Math.max(div, roundToMultiple(targetPixels / height.value, div)));
                }
                syncing = false;
                node.setDirtyCanvas(true, true);
            }

            function recalcFromAspectOrMp() {
                if (syncing) return;
                syncing = true;
                const div = currentDivisor();
                // 기존 width를 기준(anchor)으로 height 재계산
                if (resMode.value === "aspect_ratio") {
                    const ratio = aspectW.value / aspectH.value;
                    setWidgetValue(height, Math.max(div, roundToMultiple(width.value / ratio, div)));
                } else {
                    const targetPixels = megapixels.value * 1_000_000;
                    const ratio = width.value / height.value;
                    const newH = Math.sqrt(targetPixels / ratio);
                    const newW = newH * ratio;
                    setWidgetValue(width, Math.max(div, roundToMultiple(newW, div)));
                    setWidgetValue(height, Math.max(div, roundToMultiple(newH, div)));
                }
                syncing = false;
                node.setDirtyCanvas(true, true);
            }

            function recalcDivisorOnly() {
                if (syncing) return;
                syncing = true;
                const div = currentDivisor();
                setWidgetValue(width, Math.max(div, roundToMultiple(width.value, div)));
                setWidgetValue(height, Math.max(div, roundToMultiple(height.value, div)));
                syncing = false;
                node.setDirtyCanvas(true, true);
            }

            // ---- 시간/프레임: 셋 중 뭘 바꾸든 나머지가 즉시 동기화 ----
            function recalcFramesFromSeconds() {
                if (syncing) return;
                syncing = true;
                setWidgetValue(frameCount, Math.round(seconds.value * fps.value));
                syncing = false;
                node.setDirtyCanvas(true, true);
            }

            function recalcSecondsFromFrames() {
                if (syncing) return;
                syncing = true;
                setWidgetValue(seconds, fps.value > 0 ? Math.round((frameCount.value / fps.value) * 10000) / 10000 : 0);
                syncing = false;
                node.setDirtyCanvas(true, true);
            }

            function recalcFromFps() {
                if (syncing) return;
                syncing = true;
                // 프레임수 고정, 초를 fps 기준으로 갱신 (재생시간 개념 유지)
                setWidgetValue(seconds, fps.value > 0 ? Math.round((frameCount.value / fps.value) * 10000) / 10000 : 0);
                syncing = false;
                node.setDirtyCanvas(true, true);
            }

            const origWidthCb = width.callback;
            width.callback = (...a) => { origWidthCb?.(...a); recalcFromWidth(); };

            const origHeightCb = height.callback;
            height.callback = (...a) => { origHeightCb?.(...a); recalcFromHeight(); };

            const origAspectWCb = aspectW.callback;
            aspectW.callback = (...a) => { origAspectWCb?.(...a); recalcFromAspectOrMp(); };

            const origAspectHCb = aspectH.callback;
            aspectH.callback = (...a) => { origAspectHCb?.(...a); recalcFromAspectOrMp(); };

            const origMpCb = megapixels.callback;
            megapixels.callback = (...a) => { origMpCb?.(...a); recalcFromAspectOrMp(); };

            const origDivCb = divisor.callback;
            divisor.callback = (...a) => { origDivCb?.(...a); recalcDivisorOnly(); };

            const origResModeCb = resMode.callback;
            resMode.callback = (...a) => { origResModeCb?.(...a); updateModeVisibility(); recalcFromAspectOrMp(); };

            const origFpsCb = fps.callback;
            fps.callback = (...a) => { origFpsCb?.(...a); recalcFromFps(); };

            const origSecondsCb = seconds.callback;
            seconds.callback = (...a) => { origSecondsCb?.(...a); recalcFramesFromSeconds(); };

            const origFrameCb = frameCount.callback;
            frameCount.callback = (...a) => { origFrameCb?.(...a); recalcSecondsFromFrames(); };

            updateModeVisibility();

            // ---- 예쁜 요약 패널 (실시간 표시용, 출력에는 영향 없음) ----
            node.addCustomWidget({
                name: "tj_res_summary",
                type: "TJ_SUMMARY",
                value: "",
                draw(ctx, node2, widgetWidth, y) {
                    const h = 30;
                    const ratio = (width.value / height.value).toFixed(3);
                    const mp = ((width.value * height.value) / 1_000_000).toFixed(2);
                    const text = `📐 ${width.value} × ${height.value}  (${mp}MP, ratio ${ratio})`;
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
                    const text = `⏱ ${frameCount.value} frames @ ${fps.value}fps  =  ${seconds.value.toFixed(3)}s`;
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
