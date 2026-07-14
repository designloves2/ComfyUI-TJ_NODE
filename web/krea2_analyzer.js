import { app } from "../../scripts/app.js";

const NODE_CLASS   = "Krea2LoRAAnalyzer";
const TOTAL_BLOCKS = 32;
const PRESET_KEY   = "krea2_analyzer_presets_v1";
const LANG_KEY     = "krea2_analyzer_lang";

const BLOCK_NAMES = (() => {
    const n = [];
    for (let i = 0; i < 28; i++) n.push(`Block ${String(i).padStart(2,"0")}`);
    n.push("TxtFusion-Layer 0", "TxtFusion-Layer 1");
    n.push("TxtFusion-Refiner 0", "TxtFusion-Refiner 1");
    return n;
})();

// ── i18n (한국어 / English) ──────────────────────────
const STR = {
    ko: {
        langBtn: "🌐 English",
        guideHTML:
            `<b style="color:#eaf3ff;">🔰 사용법</b>　` +
            `① <b>🔍 분석</b> 눌러 분석　→　② 색으로 중요도 확인　→　③ 아래 <b>자동 조절</b> 버튼 클릭<br>` +
            `<span style="color:#4a9eff;">■</span> 약함(빼도 됨)　` +
            `<span style="color:#8fd14f;">■</span>　` +
            `<span style="color:#ffbb33;">■</span> 보조　` +
            `<span style="color:#ff5555;">■</span> 핵심(유지 권장)　` +
            `— 진할수록(빨강) 중요한 블록`,
        presetLabel: "프리셋:",
        presetNamePh: "프리셋 이름…",
        selectPh: "— 선택 —",
        btnSavePreset: "💾 저장",
        btnDelPreset: "🗑 삭제",
        alertName: "프리셋 이름을 입력하세요.",
        confirmDel: (n) => `"${n}" 프리셋을 삭제할까요?`,
        autoLabel: "🎚 자동:",
        nmCore: "핵심만", nmBalance: "균형", nmTrim: "약한블록 정리",
        btnCore: "🎯 핵심만", btnBalance: "⚖️ 균형", btnTrim: "🧹 약한블록 정리",
        hintAnalyzeFirst: "← 먼저 🔍 분석 을 누르세요",
        hintKept: (name, on, off) => `${name}: ${on}개 유지 / ${off}개 끔`,
        summaryAnalyzed: (c, m, l) => `분석완료 → 핵심 ${c} · 보조 ${m} · 약함 ${l}`,
        saveLabel: "저장:",
        savePathPh: "filtered/my_lora.safetensors  (loras 폴더 기준)",
        btnSaveFiltered: "💾 필터 저장",
        btnAnalyze: "🔍 분석",
        stNeedLora: "⚠ LoRA 선택 필요",
        stNeedPath: "⚠ 경로 입력 필요",
        stSaving: "저장 중…",
        stSaved: (k, b, p) => `✅ 저장됨 → ${p}  (${k}키 / ${b}블록)`,
        stAnalyzing: "분석 중…",
        stAnalyzed: "✅ 분석 완료",
        secMain: "■ 메인 블록 (0–27)",
        secTxt: "■ TxtFusion (Layerwise 0-1 / Refiner 0-1)",
        resetTitle: "이 블록 강도를 1.00으로 초기화",
    },
    en: {
        langBtn: "🌐 한국어",
        guideHTML:
            `<b style="color:#eaf3ff;">🔰 How to</b>　` +
            `① Click <b>🔍 Analyze</b>　→　② Read importance by color　→　③ Click an <b>Auto</b> button below<br>` +
            `<span style="color:#4a9eff;">■</span> Weak (removable)　` +
            `<span style="color:#8fd14f;">■</span>　` +
            `<span style="color:#ffbb33;">■</span> Mid　` +
            `<span style="color:#ff5555;">■</span> Core (keep)　` +
            `— redder = more important`,
        presetLabel: "Preset:",
        presetNamePh: "preset name…",
        selectPh: "— select —",
        btnSavePreset: "💾 Save",
        btnDelPreset: "🗑 Del",
        alertName: "Enter a preset name.",
        confirmDel: (n) => `Delete preset "${n}"?`,
        autoLabel: "🎚 Auto:",
        nmCore: "Core only", nmBalance: "Balanced", nmTrim: "Trim weak",
        btnCore: "🎯 Core only", btnBalance: "⚖️ Balanced", btnTrim: "🧹 Trim weak",
        hintAnalyzeFirst: "← Press 🔍 Analyze first",
        hintKept: (name, on, off) => `${name}: kept ${on} / off ${off}`,
        summaryAnalyzed: (c, m, l) => `Analyzed → Core ${c} · Mid ${m} · Weak ${l}`,
        saveLabel: "Save:",
        savePathPh: "filtered/my_lora.safetensors  (relative to loras)",
        btnSaveFiltered: "💾 Save Filtered",
        btnAnalyze: "🔍 Analyze",
        stNeedLora: "⚠ Select a LoRA",
        stNeedPath: "⚠ Enter a path",
        stSaving: "Saving…",
        stSaved: (k, b, p) => `✅ Saved → ${p}  (${k} keys / ${b} blocks)`,
        stAnalyzing: "Analyzing…",
        stAnalyzed: "✅ Analysis done",
        secMain: "■ Main Blocks (0–27)",
        secTxt: "■ TxtFusion (Layerwise 0-1 / Refiner 0-1)",
        resetTitle: "Reset this block to 1.00",
    },
};

// 부드러운 그라데이션: 0%(파랑) → 50%(초록/노랑) → 100%(빨강)
const impactColor = (pct) => {
    const p = Math.max(0, Math.min(100, pct)) / 100;
    const hue = 220 - 220 * p;   // 220=파랑 → 120=초록 → 60=노랑 → 0=빨강
    return `hsl(${hue.toFixed(0)}, 78%, 55%)`;
};

// 임팩트 등급 (core / mid / weak)
const impactTier = (pct) => {
    if (pct >= 66) return "core";
    if (pct >= 33) return "mid";
    return "weak";
};

// ── 프리셋 저장소 ─────────────────────────────────────
const getPresets  = () => { try { return JSON.parse(localStorage.getItem(PRESET_KEY) || "{}"); } catch { return {}; } };
const savePresets = (p) => localStorage.setItem(PRESET_KEY, JSON.stringify(p));

// ── API 헬퍼 ─────────────────────────────────────────
const apiPost = async (url, body) => {
    const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return r.json();
};

// ── 스타일 헬퍼 ──────────────────────────────────────
const css = (el, style) => { el.style.cssText = style; return el; };

const mkDiv  = (style="") => css(document.createElement("div"),  style);
const mkSpan = (txt, style="") => { const s = css(document.createElement("span"), style); s.textContent=txt; return s; };
const mkBtn  = (txt, fn, style="") => {
    const b = css(document.createElement("button"),
        `padding:3px 9px;font-size:11px;cursor:pointer;background:#2a2a2a;
         color:#eee;border:1px solid #444;border-radius:4px;font-family:monospace;${style}`);
    b.textContent = txt;
    b.onclick = fn;
    return b;
};
const mkInput = (type, style="", attrs={}) => {
    const i = css(document.createElement("input"), style);
    i.type = type;
    Object.entries(attrs).forEach(([k,v]) => i[k]=v);
    return i;
};


app.registerExtension({
    name: "TJNode.Krea2LoRAAnalyzer",

    async nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;

        const cfgWidget = node.widgets?.find(w => w.name === "block_config");
        if (!cfgWidget) return;

        // block_config 위젯 높이 0으로 숨기기
        cfgWidget.computeSize = () => [0, -4];

        // ── 언어 상태 ─────────────────────────────────
        let lang = localStorage.getItem(LANG_KEY);
        if (lang !== "ko" && lang !== "en") {
            lang = (navigator.language || "").toLowerCase().startsWith("ko") ? "ko" : "en";
        }
        const t = (k, ...a) => {
            const v = STR[lang][k];
            return typeof v === "function" ? v(...a) : v;
        };
        const langUpdaters = [];
        const onLang = (fn) => { fn(); langUpdaters.push(fn); };
        const setLang = (l) => {
            lang = l;
            localStorage.setItem(LANG_KEY, l);
            langUpdaters.forEach(fn => fn());
            node.setDirtyCanvas(true, true);
            requestAnimationFrame(() => { try { fitNode(); } catch (_) {} });
        };

        // ── 상태 ──────────────────────────────────────
        const states = Array.from({ length: TOTAL_BLOCKS }, () => ({ enable: true, strength: 1.0 }));

        const readConfig = () => {
            try {
                const obj = JSON.parse(cfgWidget.value || "{}");
                for (let i = 0; i < TOTAL_BLOCKS; i++) {
                    const v = obj[String(i)];
                    if (v) {
                        states[i].enable   = v.enable !== false;
                        states[i].strength = parseFloat(v.strength ?? 1.0);
                    }
                }
            } catch (_) {}
        };

        const writeConfig = () => {
            const obj = {};
            for (let i = 0; i < TOTAL_BLOCKS; i++) obj[i] = { ...states[i] };
            cfgWidget.value = JSON.stringify(obj);
            if (cfgWidget.callback) cfgWidget.callback(cfgWidget.value);
            app.graph.setDirtyCanvas(true);
        };

        readConfig();

        // ── 메인 컨테이너 ──────────────────────────────
        const wrap = mkDiv(`
            padding:6px; background:#161616; border-radius:6px;
            font-family:monospace; font-size:11px; color:#ddd;
            width:100%; box-sizing:border-box;
        `);

        // ── 언어 토글 (우측 상단) ──────────────────────
        const topBar = mkDiv("display:flex;justify-content:flex-end;margin-bottom:4px;");
        const langBtn = mkBtn("", () => setLang(lang === "ko" ? "en" : "ko"), "padding:2px 8px;");
        onLang(() => langBtn.textContent = t("langBtn"));
        topBar.appendChild(langBtn);
        wrap.appendChild(topBar);

        // ── 초보자 안내 (사용법 + 색 범례) ─────────────
        const guide = mkDiv(`
            background:#12202e; border:1px solid #274156; border-radius:5px;
            padding:6px 8px; margin-bottom:8px; line-height:1.5; color:#bcd;
        `);
        onLang(() => guide.innerHTML = t("guideHTML"));
        wrap.appendChild(guide);

        // ════════════════════════════════════════════════
        // 1. 프리셋 섹션
        // ════════════════════════════════════════════════
        const presetRow = mkDiv("display:flex;gap:4px;margin-bottom:8px;align-items:center;flex-wrap:wrap;");
        wrap.appendChild(presetRow);

        const presetLbl = mkSpan("", "color:#888;flex-shrink:0;");
        onLang(() => presetLbl.textContent = t("presetLabel"));
        presetRow.appendChild(presetLbl);

        const presetSelect = css(document.createElement("select"), `
            background:#2a2a2a;color:#eee;border:1px solid #444;border-radius:4px;
            padding:2px 4px;font-size:11px;flex:1;min-width:100px;
        `);
        presetRow.appendChild(presetSelect);

        const presetNameInput = css(document.createElement("input"), `
            background:#2a2a2a;color:#eee;border:1px solid #444;border-radius:4px;
            padding:2px 6px;font-size:11px;width:100px;
        `);
        onLang(() => presetNameInput.placeholder = t("presetNamePh"));
        presetRow.appendChild(presetNameInput);

        const refreshPresetSelect = () => {
            const presets = getPresets();
            const cur = presetSelect.value;
            presetSelect.innerHTML = `<option value="">${t("selectPh")}</option>`;
            Object.keys(presets).sort().forEach(name => {
                const opt = document.createElement("option");
                opt.value = name; opt.textContent = name;
                presetSelect.appendChild(opt);
            });
            if (cur) presetSelect.value = cur;
        };
        onLang(refreshPresetSelect);

        presetSelect.onchange = () => {
            const presets = getPresets();
            const preset  = presets[presetSelect.value];
            if (!preset) return;
            try {
                const cfg = JSON.parse(preset.block_config || "{}");
                for (let i = 0; i < TOTAL_BLOCKS; i++) {
                    const v = cfg[String(i)];
                    if (v) {
                        states[i].enable   = v.enable !== false;
                        states[i].strength = parseFloat(v.strength ?? 1.0);
                    }
                }
                rows?.forEach((r,i) => {
                    r.check.checked  = states[i].enable;
                    r.strInput.value = states[i].strength.toFixed(2);
                    if (r.strSlider) r.strSlider.value = String(states[i].strength);
                    updateRowStyle(r, i);
                });
                writeConfig();
            } catch (_) {}
        };

        const btnSaveP = mkBtn("", () => {
            const name = presetNameInput.value.trim();
            if (!name) { alert(t("alertName")); return; }
            const presets = getPresets();
            const obj = {};
            for (let i = 0; i < TOTAL_BLOCKS; i++) obj[i] = { ...states[i] };
            presets[name] = {
                name,
                created:      new Date().toISOString(),
                block_config: JSON.stringify(obj),
            };
            savePresets(presets);
            refreshPresetSelect();
            presetSelect.value = name;
        });
        onLang(() => btnSaveP.textContent = t("btnSavePreset"));
        presetRow.appendChild(btnSaveP);

        const btnDelP = mkBtn("", () => {
            const name = presetSelect.value;
            if (!name) return;
            if (!confirm(t("confirmDel", name))) return;
            const presets = getPresets();
            delete presets[name];
            savePresets(presets);
            refreshPresetSelect();
        });
        onLang(() => btnDelP.textContent = t("btnDelPreset"));
        presetRow.appendChild(btnDelP);

        // ════════════════════════════════════════════════
        // 2. 빠른 조작 버튼 (수동 / 범용)
        // ════════════════════════════════════════════════
        const btnBar = mkDiv("display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;");
        wrap.appendChild(btnBar);

        const rows = [];  // forward ref

        btnBar.append(
            mkBtn("All ON",        () => { rows.forEach((r,i) => setEnable(r,i,true));  writeConfig(); }),
            mkBtn("All OFF",       () => { rows.forEach((r,i) => setEnable(r,i,false)); writeConfig(); }),
            mkBtn("Main 0-27 ⏻",   () => {
                const allOn = states.slice(0,28).every(s => s.enable);
                rows.slice(0,28).forEach((r,i) => setEnable(r,i,!allOn));
                writeConfig();
            }),
            mkBtn("TxtF ⏻",        () => {
                const allOn = states.slice(28).every(s => s.enable);
                rows.slice(28).forEach((r,i) => setEnable(r,28+i,!allOn));
                writeConfig();
            }),
            mkBtn("Reset Str",     () => {
                rows.forEach((r,i) => {
                    states[i].strength = 1.0;
                    r.strInput.value = "1.00";
                    if (r.strSlider) r.strSlider.value = "1";
                });
                writeConfig();
            }),
        );

        // ════════════════════════════════════════════════
        // 2-B. 자동 조절 (초보자용, 분석 결과 기반 원클릭)
        // ════════════════════════════════════════════════
        const autoRow = mkDiv("display:flex;gap:4px;margin-bottom:6px;align-items:center;flex-wrap:wrap;");
        wrap.appendChild(autoRow);
        const autoLbl = mkSpan("", "color:#8fd; flex-shrink:0;");
        onLang(() => autoLbl.textContent = t("autoLabel"));
        autoRow.appendChild(autoLbl);

        const autoHint = mkSpan("", "font-size:10px;color:#889;flex-shrink:0;");

        // 분석 요약 상태 (언어 전환 시 재렌더 위해 보관)
        let lastCounts = null;
        const applySummary = () => {
            if (lastCounts) {
                autoHint.textContent = t("summaryAnalyzed", lastCounts.core, lastCounts.mid, lastCounts.weak);
                autoHint.style.color = "#8fd14f";
            }
        };
        onLang(applySummary);

        const isAnalyzed = () => rows.some(r => (r._impact ?? 0) > 0);
        const applyByImpact = (minPct, nameKey) => {
            if (!isAnalyzed()) {
                autoHint.textContent = t("hintAnalyzeFirst");
                autoHint.style.color = "#ffaa00";
                return;
            }
            let on = 0;
            rows.forEach((r, i) => {
                const keep = (r._impact ?? 0) >= minPct;
                setEnable(r, i, keep);
                if (keep) on++;
            });
            writeConfig();
            autoHint.textContent = t("hintKept", t(nameKey), on, rows.length - on);
            autoHint.style.color = "#8fd14f";
        };

        const bCore = mkBtn("", () => applyByImpact(66, "nmCore"), "border-color:#ff5555;");
        const bBal  = mkBtn("", () => applyByImpact(40, "nmBalance"), "border-color:#ffbb33;");
        const bTrim = mkBtn("", () => applyByImpact(25, "nmTrim"), "border-color:#4a9eff;");
        onLang(() => {
            bCore.textContent = t("btnCore");
            bBal.textContent  = t("btnBalance");
            bTrim.textContent = t("btnTrim");
        });
        autoRow.append(bCore, bBal, bTrim, autoHint);

        // ════════════════════════════════════════════════
        // 3. 저장 섹션
        // ════════════════════════════════════════════════
        const saveRow = mkDiv("display:flex;gap:4px;margin-bottom:8px;align-items:center;flex-wrap:wrap;");
        wrap.appendChild(saveRow);

        const saveLbl = mkSpan("", "color:#888;flex-shrink:0;");
        onLang(() => saveLbl.textContent = t("saveLabel"));
        saveRow.appendChild(saveLbl);

        const savePathInput = css(document.createElement("input"), `
            flex:1;background:#2a2a2a;color:#eee;border:1px solid #444;
            border-radius:4px;padding:2px 6px;font-size:11px;min-width:160px;
        `);
        onLang(() => savePathInput.placeholder = t("savePathPh"));
        saveRow.appendChild(savePathInput);

        const saveStatusLabel = mkSpan("", "font-size:10px;color:#888;flex-basis:100%;word-break:break-all;");

        const btnSaveFiltered = mkBtn("", async () => {
            const loraWidget = node.widgets?.find(w => w.name === "lora_name");
            const loraName   = loraWidget?.value;
            const savePath   = savePathInput.value.trim();

            if (!loraName) { saveStatusLabel.textContent = t("stNeedLora"); saveStatusLabel.style.color="#ffaa00"; return; }
            if (!savePath) { saveStatusLabel.textContent = t("stNeedPath"); saveStatusLabel.style.color="#ffaa00"; return; }

            saveStatusLabel.textContent = t("stSaving");
            saveStatusLabel.style.color = "#888";

            const cfg = {};
            for (let i = 0; i < TOTAL_BLOCKS; i++) cfg[i] = { ...states[i] };

            try {
                const result = await apiPost("/krea2analyzer/save_filtered", {
                    lora_name:    loraName,
                    block_config: cfg,
                    save_path:    savePath,
                });
                if (result.error) {
                    saveStatusLabel.textContent = `❌ ${result.error}`;
                    saveStatusLabel.style.color = "#ff4444";
                } else {
                    console.log("[Krea2Analyzer] saved:", result.saved_path);
                    saveStatusLabel.textContent = t("stSaved", result.filtered_keys, result.enabled_blocks, result.saved_path);
                    saveStatusLabel.style.color = "#44dd88";
                }
            } catch (e) {
                saveStatusLabel.textContent = `❌ ${e.message}`;
                saveStatusLabel.style.color = "#ff4444";
            }
        });
        onLang(() => btnSaveFiltered.textContent = t("btnSaveFiltered"));
        saveRow.appendChild(btnSaveFiltered);

        // ── 분석 버튼 (워크플로우 없이 직접 분석) ─────
        const btnAnalyze = mkBtn("", async () => {
            const loraWidget = node.widgets?.find(w => w.name === "lora_name");
            const loraName   = loraWidget?.value;
            if (!loraName) { saveStatusLabel.textContent = t("stNeedLora"); saveStatusLabel.style.color="#ffaa00"; return; }

            saveStatusLabel.textContent = t("stAnalyzing");
            saveStatusLabel.style.color = "#888";
            try {
                const result = await apiPost("/krea2analyzer/analyze", { lora_name: loraName });
                if (result.error) {
                    saveStatusLabel.textContent = `❌ ${result.error}`;
                    saveStatusLabel.style.color = "#ff4444";
                } else {
                    updateImpact(result.block_data);
                    saveStatusLabel.textContent = t("stAnalyzed");
                    saveStatusLabel.style.color = "#44dd88";
                }
            } catch (e) {
                saveStatusLabel.textContent = `❌ ${e.message}`;
                saveStatusLabel.style.color = "#ff4444";
            }
        });
        onLang(() => btnAnalyze.textContent = t("btnAnalyze"));
        saveRow.appendChild(btnAnalyze);

        // 상태 메시지(저장 경로 등)는 버튼들 아래 전체 폭으로 표시
        saveRow.appendChild(saveStatusLabel);

        // ════════════════════════════════════════════════
        // 4. 블록 행 생성
        // ════════════════════════════════════════════════
        const setEnable = (row, idx, val) => {
            states[idx].enable = val;
            row.check.checked  = val;
            updateRowStyle(row, idx);
        };

        const updateRowStyle = (row, idx) => {
            const on     = states[idx].enable;
            const impact = row._impact ?? 0;
            row.el.style.opacity         = on ? "1" : "0.35";
            row.dot.style.background     = impactColor(impact);
            row.barFill.style.background = impactColor(impact);
        };

        const mkRow = (idx) => {
            const el = mkDiv(`
                display:flex;align-items:center;gap:5px;
                padding:2px 4px;margin-bottom:2px;
                background:#1e1e1e;border-radius:3px;
            `);

            const dot  = mkDiv(`width:7px;height:7px;border-radius:50%;background:#4488ff;flex-shrink:0;`);

            const check = mkInput("checkbox", "flex-shrink:0;cursor:pointer;width:13px;height:13px;",
                { checked: states[idx].enable });
            check.onchange = () => {
                states[idx].enable = check.checked;
                updateRowStyle(row, idx);
                writeConfig();
            };

            const name = mkSpan(BLOCK_NAMES[idx], "min-width:120px;flex-shrink:0;color:#ccc;");

            const strInput = mkInput("number",
                `width:54px;background:#2a2a2a;color:#eee;border:1px solid #444;
                 border-radius:3px;padding:1px 4px;font-size:11px;flex-shrink:0;`,
                { min:"-5", max:"5", step:"0.05", value: states[idx].strength.toFixed(2) });

            const strSlider = mkInput("range",
                `width:70px;flex-shrink:0;cursor:pointer;accent-color:#7612DA;`,
                { min:"-5", max:"5", step:"0.05", value: String(states[idx].strength) });

            // 숫자 ↔ 슬라이더 양방향 동기화
            const applyStrength = (val, from) => {
                let v = parseFloat(val);
                if (isNaN(v)) v = 1.0;
                v = Math.min(5, Math.max(-5, v));
                states[idx].strength = v;
                if (from !== "num")    strInput.value  = v.toFixed(2);
                if (from !== "slider") strSlider.value = String(v);
                writeConfig();
            };
            strInput.oninput  = () => applyStrength(strInput.value, "num");
            strSlider.oninput = () => applyStrength(strSlider.value, "slider");
            strInput.onchange = () => applyStrength(strInput.value, "reformat");

            // 0.05 단위 미세조정
            const stepStrength = (delta) => {
                const cur = parseFloat(strInput.value);
                const base = isNaN(cur) ? (states[idx].strength || 0) : cur;
                applyStrength(Math.round((base + delta) * 100) / 100, "reformat");
            };
            const btnStyle = `padding:1px 5px;font-size:12px;line-height:1;flex-shrink:0;`;
            const decBtn = mkBtn("‹", () => stepStrength(-0.05), btnStyle);
            const incBtn = mkBtn("›", () => stepStrength(0.05), btnStyle);
            decBtn.title = "-0.05";
            incBtn.title = "+0.05";

            const resetBtn = mkBtn("⟲", () => applyStrength(1.0, "reset"),
                `padding:1px 5px;font-size:11px;flex-shrink:0;`);
            onLang(() => resetBtn.title = t("resetTitle"));

            const barWrap = mkDiv(`flex:1;height:5px;background:#2a2a2a;border-radius:3px;overflow:hidden;`);
            const barFill = mkDiv(`height:100%;width:0%;background:#4488ff;transition:width .3s;`);
            barWrap.appendChild(barFill);

            const impLabel = mkSpan("—", "color:#666;min-width:36px;text-align:right;font-size:10px;");

            el.append(dot, check, name, strInput, decBtn, strSlider, incBtn, resetBtn, barWrap, impLabel);

            const row = { el, dot, check, strInput, strSlider, barFill, impLabel, _impact: 0 };
            updateRowStyle(row, idx);
            return row;
        };

        const sectionLabel = () => mkDiv(`color:#888;font-size:10px;margin:6px 0 3px;border-bottom:1px solid #333;padding-bottom:2px;`);

        const secMainEl = sectionLabel();
        onLang(() => secMainEl.textContent = t("secMain"));
        wrap.appendChild(secMainEl);
        for (let i = 0; i < 28; i++) {
            const r = mkRow(i);
            rows.push(r);
            wrap.appendChild(r.el);
        }
        const secTxtEl = sectionLabel();
        onLang(() => secTxtEl.textContent = t("secTxt"));
        wrap.appendChild(secTxtEl);
        for (let i = 28; i < TOTAL_BLOCKS; i++) {
            const r = mkRow(i);
            rows.push(r);
            wrap.appendChild(r.el);
        }

        // ════════════════════════════════════════════════
        // 5. 임팩트 업데이트 함수
        // ════════════════════════════════════════════════
        const updateImpact = (dataOrStr) => {
            try {
                const data = typeof dataOrStr === "string" ? JSON.parse(dataOrStr) : dataOrStr;
                for (let i = 0; i < TOTAL_BLOCKS; i++) {
                    const d   = data[String(i)] ?? data[i];
                    if (!d) continue;
                    const pct              = d.impact ?? 0;
                    rows[i]._impact        = pct;
                    rows[i].barFill.style.width  = pct + "%";
                    rows[i].barFill.style.background = impactColor(pct);
                    rows[i].impLabel.textContent = pct.toFixed(1) + "%";
                    rows[i].dot.style.background = impactColor(pct);
                    updateRowStyle(rows[i], i);
                }
                let core = 0, mid = 0, weak = 0;
                rows.forEach(r => {
                    const tr = impactTier(r._impact ?? 0);
                    if (tr === "core") core++; else if (tr === "mid") mid++; else weak++;
                });
                lastCounts = { core, mid, weak };
                applySummary();
            } catch(e) { console.warn("[Krea2Analyzer] impact update error", e); }
        };

        // ── onExecuted: analysis_json 읽기 ──────────────
        const origOnExecuted = node.onExecuted;
        node.onExecuted = function(msg) {
            if (origOnExecuted) origOnExecuted.call(this, msg);
            const out = msg?.output;
            if (!out) return;
            if (out?.analysis_json?.[0]) { updateImpact(out.analysis_json[0]); return; }
            if (out?.[3]?.[0])           { updateImpact(out[3][0]);            return; }
            const vals = Object.values(out);
            for (let i = vals.length - 1; i >= 0; i--) {
                const v = Array.isArray(vals[i]) ? vals[i][0] : vals[i];
                if (typeof v === "string" && v.trim().startsWith("{")) {
                    try { JSON.parse(v); updateImpact(v); return; } catch (_) {}
                }
            }
        };

        // ── DOM 위젯 등록 ────────────────────────────────
        const host = document.createElement("div");
        host.style.cssText = "width:100%;box-sizing:border-box;";
        host.appendChild(wrap);
        const domWidget = node.addDOMWidget("krea2_block_ui", "custom", host, {
            getValue() { return cfgWidget.value; },
            setValue(v) {
                cfgWidget.value = v;
                readConfig();
                rows.forEach((r, i) => {
                    r.check.checked  = states[i].enable;
                    r.strInput.value = states[i].strength.toFixed(2);
                    if (r.strSlider) r.strSlider.value = String(states[i].strength);
                    updateRowStyle(r, i);
                });
            },
            serialize: false,
        });

        // ── 초기 크기 보정 ────────────────────────────────
        const CONTENT_FALLBACK = 800;
        if (domWidget) {
            domWidget.computeSize = function (nodeWidth) {
                const h = (wrap.scrollHeight || CONTENT_FALLBACK) + 8;
                return [nodeWidth, h];
            };
        }

        const fitNode = () => {
            const w = Math.max(540, node.size[0] || 540);
            const target = node.computeSize()[1];
            node.setSize([w, target]);
            node.setDirtyCanvas(true, true);
        };

        // 최소 노드 폭 강제
        const MIN_W = 540;
        const origOnResize = node.onResize;
        node.onResize = function (size) {
            if (size[0] < MIN_W) size[0] = MIN_W;
            origOnResize?.apply(this, arguments);
        };
        if (Array.isArray(node.min_size)) node.min_size[0] = MIN_W;
        else node.min_size = [MIN_W, 0];

        // TJ 브랜드 테마
        node.color   = "#7612DA";
        node.bgcolor = "#000000";
        if (node.title_text_color !== undefined) node.title_text_color = "#FFFFFF";

        writeConfig();
        node.setSize([Math.max(540, node.size[0] || 540), node.size[1]]);
        requestAnimationFrame(fitNode);
        setTimeout(fitNode, 120);
    },
});
