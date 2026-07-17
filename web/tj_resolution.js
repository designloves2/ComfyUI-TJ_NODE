import { app } from "../../scripts/app.js";

// Resolution (TJ)
// 비율 프리셋 / 커스텀 비율 / 커스텀 해상도를 고르고 width·height 를 출력.
// TJ 브랜드 컬러(#7612DA) 적용.

const NODE_CLASS = "TJ_Resolution";

const ACCENT      = "#7612DA";
const ACCENT_TEXT = "#b47cff";
const ACCENT_SOFT = "rgba(118, 18, 218, 0.28)";

const PRESETS = [
    { label: "1:1",  w: 1, h: 1 },
    { label: "16:9", w: 16, h: 9 },
    { label: "9:16", w: 9, h: 16 },
    { label: "2:1",  w: 2, h: 1 },
    { label: "3:2",  w: 3, h: 2 },
    { label: "2:3",  w: 2, h: 3 },
    { label: "4:3",  w: 4, h: 3 },
    { label: "3:4",  w: 3, h: 4 },
    { label: "4:5",  w: 4, h: 5 },
];
const BASES = [512, 768, 1024, 1536];
// 비율별 대표 해상도 목록 — LTX-2 / Z-Image / Klein / Flux / Krea2 / Qwen-Image /
// Ideogram 등 실제 생태계에서 쓰는 버킷 기준 (검증된 값을 그대로 표로 보관).
// 생태계 버킷은 정확한 비율이 아닌 경우가 많아(예: 1920×1088 = 1.765) 계산식으로 만들지 않는다.
const RATIO_SIZES = {
    "1:1":  [[512,512],[768,768],[1024,1024],[1280,1280],[1328,1328],[1408,1408],[1536,1536],[2048,2048]],
    "16:9": [[832,464],[1280,720],[1344,752],[1536,864],[1600,896],[1664,928],[1792,1008],[1920,1088]],
    "2:1":  [[512,256],[1024,512],[1280,640],[1536,768],[1600,800],[1792,896],[1920,960],[2048,1024]],
    "3:2":  [[1024,688],[1216,816],[1248,832],[1344,896],[1536,1024],[1584,1056],[1728,1152],[1920,1280]],
    "4:3":  [[1024,768],[1152,864],[1280,960],[1408,1056],[1472,1104],[1600,1200],[1920,1440],[2048,1536]],
    "4:5":  [[640,800],[768,960],[832,1040],[1024,1280],[1152,1440],[1280,1600],[1440,1800],[1536,1920]],
};
// 세로 비율은 가로 비율의 전치
const SIZE_TRANSPOSE = { "9:16": "16:9", "2:3": "3:2", "3:4": "4:3" };

const SNAPS = [8, 16, 32, 64];

const gcd = (a, b) => { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) { [a, b] = [b, a % b]; } return a || 1; };
const ratioStr = (w, h) => { if (w <= 0 || h <= 0) return "-"; const g = gcd(w, h); return `${Math.round(w / g)}:${Math.round(h / g)}`; };
const snapTo = (v, m) => Math.max(m, Math.round(v / m) * m);
// 해당 비율의 대표 해상도 8개
const sizesFor = (rw, rh) => {
    const key = `${rw}:${rh}`;
    if (RATIO_SIZES[key]) return RATIO_SIZES[key].map(([w, h]) => ({ w, h }));
    const t = SIZE_TRANSPOSE[key];
    if (t && RATIO_SIZES[t]) return RATIO_SIZES[t].map(([w, h]) => ({ w: h, h: w }));
    return [];   // 커스텀 비율 등 목록 없음
};

// ── Auto Set (Wireless) — TJ 코어 재사용 ───────────────────
// Registry Name = Output Label = Get Selection Name 규칙 준수 ({이름}/width ▶)
const OUTPUT_NAMES = ["width", "height"];

function autoSetEnabled(node) {
    return !!(node?.widgets?.find((w) => w.name === "auto_set")?.value);
}
function getBaseName(node) {
    const setW = node.widgets?.find((w) => w.name === "setnode_name" || w.name === "set_name");
    return String(setW?.value || node.title || "Resolution").trim();
}
function updateAutoSets(node) {
    if (!node) return;
    if (!node.properties) node.properties = {};

    if (!autoSetEnabled(node)) {
        node.properties.auto_sets = {};
        (node.outputs || []).forEach((out, idx) => {
            if (!out) return;
            const orig = out._tj_orig_name || OUTPUT_NAMES[idx] || `out_${idx}`;
            out.name = orig; out.label = orig; out.localized_name = orig;
            delete out._tj_auto_label;
        });
    } else {
        const base = getBaseName(node);
        const autoSets = {};
        (node.outputs || []).forEach((out, idx) => {
            if (!out) return;
            if (!out._tj_orig_name) out._tj_orig_name = out.name || OUTPUT_NAMES[idx];
            const slotName = OUTPUT_NAMES[idx] || `OUT_${idx + 1}`;
            const fullName = base ? `${base}/${slotName}` : slotName;
            autoSets[idx] = fullName;
            out._tj_auto_label = fullName;
            out.name = `${fullName} ▶`;
            out.label = `${fullName} ▶`;
            out.localized_name = `${fullName} ▶`;
        });
        node.properties.auto_sets = autoSets;
    }
    // 이름 중복 방지 / fake-wire 복구는 코어에 위임
    if (window.TJ_NODE_ensureUniqueAutoSetNames && node.graph) {
        window.TJ_NODE_ensureUniqueAutoSetNames(node.graph);
    }
    if (window.TJ_NODE_scheduleWirelessRepair && node.graph) {
        window.TJ_NODE_scheduleWirelessRepair(node.graph, 80);
    }
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}
function installAutoSet(node) {
    for (const name of ["auto_set", "setnode_name"]) {
        const w = node.widgets?.find((x) => x.name === name);
        if (w && !w._tj_res_attached) {
            w._tj_res_attached = true;
            const orig = w.callback;
            w.callback = function (v) {
                if (orig) orig.call(this, v);
                updateAutoSets(node);
            };
        }
    }
    requestAnimationFrame(() => updateAutoSets(node));
}

const css = (el, s) => { el.style.cssText = s; return el; };
const mkDiv = (s = "") => css(document.createElement("div"), s);
const mkSpan = (t, s = "") => { const e = css(document.createElement("span"), s); e.textContent = t; return e; };

const BTN_BASE = `
    display:flex;align-items:center;justify-content:center;gap:6px;
    padding:7px 8px;font-size:12px;cursor:pointer;
    background:#242424;color:#ddd;border:1px solid #3a3a3a;border-radius:6px;
    font-family:inherit;transition:background .12s,border-color .12s;
`;

function mkBtn(txt, fn, extra = "") {
    const b = css(document.createElement("button"), BTN_BASE + extra);
    b.textContent = txt;
    b.onclick = fn;
    return b;
}
function setActive(btn, on) {
    if (!btn) return;
    btn.style.background = on ? ACCENT : "#242424";
    btn.style.borderColor = on ? ACCENT : "#3a3a3a";
    btn.style.color = on ? "#fff" : "#ddd";
    btn.style.fontWeight = on ? "600" : "400";
}
function mkNumInput(val, onChange) {
    const i = css(document.createElement("input"), `
        width:100%;box-sizing:border-box;text-align:center;
        background:#242424;color:${ACCENT_TEXT};border:1px solid #3a3a3a;border-radius:6px;
        padding:8px 4px;font-size:15px;font-weight:700;font-family:inherit;
    `);
    i.type = "number";
    i.value = String(val);
    i.oninput = () => onChange(i.value);
    return i;
}
// 비율 미리보기용 작은 도형 아이콘
function mkShape(rw, rh) {
    const box = 18;
    let w = box, h = box;
    if (rw >= rh) h = Math.max(6, Math.round(box * rh / rw));
    else w = Math.max(6, Math.round(box * rw / rh));
    const wrap = mkDiv(`width:${box}px;height:${box}px;display:flex;align-items:center;justify-content:center;flex-shrink:0;`);
    wrap.appendChild(mkDiv(`width:${w}px;height:${h}px;background:#6a6a6a;border-radius:2px;`));
    return wrap;
}

app.registerExtension({
    name: "TJNode.Resolution",

    async nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;

        const get = (n) => node.widgets?.find((w) => w.name === n);
        const wW = get("width"), wH = get("height"), wState = get("ui_state");
        if (!wW || !wH) return;
        // 원본 위젯은 숨기고 DOM UI 로 대체
        for (const w of [wW, wH, wState]) {
            if (!w) continue;
            w.type = "hidden";
            w.hidden = true;
            w.computeSize = () => [0, -4];
        }

        // ── 상태 ──
        const st = {
            mode: "preset",         // "preset"(비율 프리셋 목록) | "ratio" | "res"
            rw: 1, rh: 1,
            base: 1024,
            snap: 16,
            w: Number(wW.value) || 1024,
            h: Number(wH.value) || 1024,
        };
        try {
            const saved = JSON.parse(wState?.value || "{}");
            Object.assign(st, saved);
        } catch (_) {}

        const pushValues = () => {
            wW.value = st.w;
            wH.value = st.h;
            if (wState) wState.value = JSON.stringify({
                mode: st.mode, rw: st.rw, rh: st.rh, base: st.base, snap: st.snap,
            });
            app.graph.setDirtyCanvas(true);
        };

        // ── 컨테이너 ──
        const wrap = mkDiv(`
            padding:10px;background:#141414;border-radius:8px;
            font-family:'Segoe UI',sans-serif;color:#ddd;
            width:100%;box-sizing:border-box;
        `);

        // 1) 비율 프리셋 3x3
        const grid = mkDiv("display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px;");
        wrap.appendChild(grid);
        const presetBtns = PRESETS.map((p) => {
            const b = css(document.createElement("button"), BTN_BASE);
            b.appendChild(mkShape(p.w, p.h));
            b.appendChild(mkSpan(p.label));
            b.onclick = () => {
                st.mode = "preset"; st.rw = p.w; st.rh = p.h;
                pickNearestSize();
                render();
            };
            grid.appendChild(b);
            return b;
        });

        // 2) 모드 선택
        const modeRow = mkDiv("display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;");
        wrap.appendChild(modeRow);
        const bModeRatio = mkBtn("Custom Ratio", () => { st.mode = "ratio"; applyFromBase(); render(); });
        const bModeRes   = mkBtn("Custom Resolution", () => { st.mode = "res"; render(); });
        modeRow.append(bModeRatio, bModeRes);

        // 3) 패널
        const panel = mkDiv("border:1px solid #303030;border-radius:8px;padding:12px;background:#181818;");
        wrap.appendChild(panel);

        // 3-0) 비율별 대표 해상도 목록 (preset 모드 전용)
        const sizeList = mkDiv("display:flex;flex-direction:column;border:1px solid #303030;border-radius:8px;overflow:hidden;");
        panel.appendChild(sizeList);

        // 3-1) RATIO 행 (ratio 모드 전용)
        const ratioRow = mkDiv("display:flex;align-items:center;gap:8px;margin-bottom:10px;");
        ratioRow.appendChild(mkSpan("RATIO", "color:#888;font-size:11px;letter-spacing:.08em;flex-shrink:0;"));
        const rwIn = mkNumInput(st.rw, (v) => { st.rw = Math.max(1, parseFloat(v) || 1); applyFromWidth(); render("rw"); });
        const rhIn = mkNumInput(st.rh, (v) => { st.rh = Math.max(1, parseFloat(v) || 1); applyFromWidth(); render("rh"); });
        const swapRatio = mkBtn("⇄", () => {
            [st.rw, st.rh] = [st.rh, st.rw];
            [st.w, st.h] = [st.h, st.w];
            render();
        }, "flex-shrink:0;width:44px;font-size:16px;");
        const rwWrap = mkDiv("flex:1;"); rwWrap.appendChild(rwIn);
        const rhWrap = mkDiv("flex:1;"); rhWrap.appendChild(rhIn);
        ratioRow.append(rwWrap, swapRatio, rhWrap);
        panel.appendChild(ratioRow);

        // 3-2) 기준 크기 버튼 (ratio 모드 전용)
        const baseRow = mkDiv("display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;");
        panel.appendChild(baseRow);
        const baseBtns = BASES.map((b) => {
            const btn = mkBtn(String(b), () => { st.base = b; applyFromBase(); render(); });
            baseRow.appendChild(btn);
            return btn;
        });

        // 3-3) WIDTH / HEIGHT
        const whLabels = mkDiv("display:flex;gap:8px;margin-bottom:4px;");
        const whRow = mkDiv("display:flex;align-items:center;gap:8px;margin-bottom:10px;");
        panel.append(whLabels, whRow);
        const lblW = mkSpan("WIDTH", "flex:1;text-align:center;color:#888;font-size:11px;letter-spacing:.08em;");
        const lblH = mkSpan("HEIGHT", "flex:1;text-align:center;color:#888;font-size:11px;letter-spacing:.08em;");
        whLabels.append(lblW, lblH);

        const wIn = mkNumInput(st.w, (v) => {
            st.w = Math.max(8, parseInt(v) || 8);
            if (st.mode === "ratio") applyFromWidth();   // 파생되는 height 는 스냅 적용
            render("w");
        });
        const hIn = mkNumInput(st.h, (v) => {
            st.h = Math.max(8, parseInt(v) || 8);
            if (st.mode === "ratio") applyFromHeight();  // 파생되는 width 는 스냅 적용
            render("h");
        });
        const swapWH = mkBtn("⇄", () => { [st.w, st.h] = [st.h, st.w]; render(); },
            "flex-shrink:0;width:44px;font-size:16px;");
        const wWrap = mkDiv("flex:1;"); wWrap.appendChild(wIn);
        const hWrap = mkDiv("flex:1;"); hWrap.appendChild(hIn);
        whRow.append(wWrap, swapWH, hWrap);

        // 3-4) 스냅 + 정보
        const snapRow = mkDiv("display:flex;align-items:center;gap:6px;margin-bottom:12px;");
        panel.appendChild(snapRow);
        snapRow.appendChild(mkSpan("⊞", "color:#777;font-size:14px;flex-shrink:0;"));
        const snapBtns = SNAPS.map((s) => {
            const b = mkBtn(String(s), () => { st.snap = s; applySnap(); render(); },
                "padding:4px 9px;font-size:11px;flex-shrink:0;");
            snapRow.appendChild(b);
            return b;
        });

        // 3-5) 미리보기 박스
        const previewArea = mkDiv("display:flex;align-items:center;justify-content:center;height:170px;");
        const previewBox = mkDiv(`border:2px solid ${ACCENT};background:${ACCENT_SOFT};border-radius:3px;`);
        previewArea.appendChild(previewBox);
        panel.appendChild(previewArea);
        const dimLbl = mkDiv(`text-align:center;margin-top:8px;font-size:14px;font-weight:600;`);
        panel.appendChild(dimLbl);

        // ── 계산 ──
        // 프리셋 목록에서 현재 크기와 가장 가까운 항목으로 스냅
        function pickNearestSize() {
            const list = sizesFor(st.rw, st.rh);
            let best = list[2] || list[0];   // 기본 1024 기준
            let bestD = Infinity;
            for (const s2 of list) {
                const d = Math.abs(s2.w - st.w) + Math.abs(s2.h - st.h);
                if (d < bestD) { bestD = d; best = s2; }
            }
            st.w = best.w; st.h = best.h;
        }
        function renderSizeList() {
            sizeList.innerHTML = "";
            const list = sizesFor(st.rw, st.rh);
            list.forEach((s2, i) => {
                const on = (s2.w === st.w && s2.h === st.h);
                const row = mkDiv(`
                    padding:11px 8px;text-align:center;cursor:pointer;font-size:14px;
                    border-bottom:${i < list.length - 1 ? "1px solid #262626" : "none"};
                    background:${on ? ACCENT_SOFT : "transparent"};
                    color:${on ? ACCENT_TEXT : "#bbb"};
                    font-weight:${on ? "700" : "400"};
                `);
                row.textContent = `${s2.w} × ${s2.h}`;
                row.onmouseenter = () => { if (!on) row.style.background = "#202020"; };
                row.onmouseleave = () => { if (!on) row.style.background = "transparent"; };
                row.onclick = () => { st.w = s2.w; st.h = s2.h; render(); };
                sizeList.appendChild(row);
            });
        }

        function applyFromBase() {
            st.w = snapTo(st.base, st.snap);
            st.h = snapTo(st.base * st.rh / st.rw, st.snap);
        }
        function applyFromWidth(snap = true) {
            st.h = snap ? snapTo(st.w * st.rh / st.rw, st.snap) : Math.round(st.w * st.rh / st.rw);
        }
        function applyFromHeight(snap = true) {
            st.w = snap ? snapTo(st.h * st.rw / st.rh, st.snap) : Math.round(st.h * st.rw / st.rh);
        }
        function applySnap() {
            st.w = snapTo(st.w, st.snap);
            st.h = snapTo(st.h, st.snap);
            if (st.mode === "ratio") applyFromWidth();
        }

        // ── 렌더 ──
        // skip: 지금 타이핑 중인 필드명("w"/"h"/"rw"/"rh") — 그 필드만 덮어쓰지 않는다
        function render(skip = null) {
            const isPreset = st.mode === "preset";
            const isRatio  = st.mode === "ratio";
            const isRes    = st.mode === "res";

            // preset: 대표 해상도 목록만 / ratio: 비율+기준+W·H / res: W·H 자유
            sizeList.style.display = isPreset ? "flex" : "none";
            ratioRow.style.display = isRatio ? "flex" : "none";
            baseRow.style.display  = isRatio ? "grid" : "none";
            whLabels.style.display = isPreset ? "none" : "flex";
            whRow.style.display    = isPreset ? "none" : "flex";
            snapRow.style.display  = isPreset ? "none" : "flex";
            // 비율 모드에선 ⇄ 가 RATIO 행에 있으므로 W/H 사이 버튼은 숨김
            swapWH.style.display = isRes ? "flex" : "none";

            setActive(bModeRatio, isRatio);
            setActive(bModeRes, isRes);
            presetBtns.forEach((b, i) => {
                const p = PRESETS[i];
                setActive(b, isPreset && p.w === st.rw && p.h === st.rh);
            });
            if (isPreset) renderSizeList();
            baseBtns.forEach((b, i) => setActive(b, BASES[i] === st.base));
            snapBtns.forEach((b, i) => setActive(b, SNAPS[i] === st.snap));

            if (skip !== "rw") rwIn.value = String(st.rw);
            if (skip !== "rh") rhIn.value = String(st.rh);
            if (skip !== "w")  wIn.value  = String(st.w);
            if (skip !== "h")  hIn.value  = String(st.h);

            const mp = (st.w * st.h) / 1e6;

            // 미리보기 박스: 비율 유지하며 영역에 맞춤
            const MAXW = 150, MAXH = 150;
            const sc = Math.min(MAXW / st.w, MAXH / st.h);
            previewBox.style.width  = Math.max(8, Math.round(st.w * sc)) + "px";
            previewBox.style.height = Math.max(8, Math.round(st.h * sc)) + "px";
            dimLbl.innerHTML =
                `<span style="color:${ACCENT_TEXT};">${st.w} × ${st.h}</span>` +
                `<span style="color:#666;font-weight:400;"> · </span>` +
                `<span style="color:#888;font-weight:400;">${mp.toFixed(2)} MP</span>`;

            pushValues();
        }

        // ── DOM 위젯 등록 ──
        const host = document.createElement("div");
        host.style.cssText = "width:100%;box-sizing:border-box;";
        host.appendChild(wrap);
        node.addDOMWidget("tj_resolution_ui", "custom", host, { serialize: false });

        // ── 크기: 콘텐츠 높이에 맞춰 보정 (렌더 실측 기반, 줌 보정 포함) ──
        const MIN_W = 320;
        const fitNode = () => {
            const contentH = wrap.scrollHeight;
            if (!contentH) return;
            const scale = app.canvas?.ds?.scale || 1;
            const hostH = host.getBoundingClientRect().height / scale;
            if (!hostH) return;
            const delta = contentH - hostH;
            if (Math.abs(delta) > 2) {
                node.setSize([Math.max(MIN_W, node.size[0] || MIN_W), Math.max(120, node.size[1] + delta)]);
                node.setDirtyCanvas(true, true);
            }
        };
        const origOnResize = node.onResize;
        node.onResize = function (size) {
            if (size[0] < MIN_W) size[0] = MIN_W;
            origOnResize?.apply(this, arguments);
        };
        if (Array.isArray(node.min_size)) node.min_size[0] = MIN_W;
        else node.min_size = [MIN_W, 0];

        node.color   = ACCENT;
        node.bgcolor = "#000000";
        if (node.title_text_color !== undefined) node.title_text_color = "#FFFFFF";

        render();
        installAutoSet(node);   // Auto Set — TJ 아이덴티티
        node.setSize([Math.max(MIN_W, node.size[0] || 360), node.size[1]]);
        requestAnimationFrame(fitNode);
        setTimeout(fitNode, 120);
        if (typeof ResizeObserver !== "undefined") {
            let raf = null;
            const ro = new ResizeObserver(() => {
                if (raf) cancelAnimationFrame(raf);
                raf = requestAnimationFrame(() => { try { fitNode(); } catch (_) {} });
            });
            ro.observe(wrap);
            ro.observe(host);
        }
    },
});
