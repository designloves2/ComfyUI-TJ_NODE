import { app } from "../../scripts/app.js";

// ── 아키텍처별 블록 구조 (Python _lora_core.SPECS 와 동일하게 유지) ──
const mkNames = (sections) => {
    const out = [];
    for (const s of sections) {
        for (let i = 0; i < s.count; i++) out.push(`${s.label} ${String(i).padStart(2, "0")}`);
    }
    return out;
};
const mkSpec = (arch, sections) => {
    let start = 0;
    const secs = sections.map(s => { const o = { ...s, start }; start += s.count; return o; });
    return { arch, sections: secs, names: mkNames(sections), total: start };
};

const ARCHS = {
    // Krea2: main 28 + txtfusion layerwise 2 + refiner 2 = 32
    "Krea2LoRAAnalyzer": mkSpec("krea2", [
        { label: "Block", count: 28 },
        { label: "TxtFusion-Layerwise", count: 2 },
        { label: "TxtFusion-Refiner", count: 2 },
    ]),
    // Flux2 Klein 4B: double 5 + single 20 = 25
    "Klein4BLoRAAnalyzer": mkSpec("klein4b", [
        { label: "Double", count: 5 },
        { label: "Single", count: 20 },
    ]),
    // Flux2 Klein 9B: double 8 + single 24 = 32
    "Klein9BLoRAAnalyzer": mkSpec("klein9b", [
        { label: "Double", count: 8 },
        { label: "Single", count: 24 },
    ]),
    // Z-Image (Turbo/Base): layers 30
    "ZImageLoRAAnalyzer": mkSpec("zimage", [
        { label: "Layer", count: 30 },
    ]),
};

const LANG_KEY = "krea2_analyzer_lang";   // 언어 설정은 노드 공통

// ── i18n (한국어 / English) ──────────────────────────
const STR = {
    ko: {
        langBtn: "🌐 English",
        guideHTML:
            `<b style="color:#eaf3ff;">🔰 사용법</b>　` +
            `① <b>🔍 분석</b> 눌러 분석　→　② 색으로 중요도 확인　→　③ 강도 조절 시 막대가 실시간 반영<br>` +
            `<span style="color:#4a9eff;">■</span> 약함(빼도 됨)　` +
            `<span style="color:#8fd14f;">■</span>　` +
            `<span style="color:#ffbb33;">■</span> 보조　` +
            `<span style="color:#ff5555;">■</span> 핵심(유지 권장)　` +
            `— 막대 = 현재 효과 강도`,
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
        cmpLabel: "📊 효과:",
        btnCompareOn: "🔍 원본 대비: 켬",
        btnCompareOff: "🔍 원본 대비: 끔",
        cmpHintOn: "연한 막대 = 원본 효과, 진한 막대 = 현재 효과",
        cmpHintOff: "",
        saveLabel: "저장:",
        savePathPh: "filtered/my_lora.safetensors  (models/loras 기준)",
        btnSaveFiltered: "💾 필터 저장",
        btnAnalyze: "🔍 분석",
        stNeedLora: "⚠ LoRA 선택 필요",
        stNeedPath: "⚠ 경로 입력 필요",
        stSaving: "저장 중…",
        stSaved: (k, b, p) => `✅ 저장됨 → ${p}  (${k}키 / ${b}블록)`,
        stAnalyzing: "분석 중…",
        stAnalyzed: "✅ 분석 완료",
        resetTitle: "이 블록 강도를 1.00으로 초기화",
        uoLabel: "원본값 사용",
        uoOn: "원본값 사용 (블록설정 무시)",
        uoOff: "내 블록설정 적용",
    },
    en: {
        langBtn: "🌐 한국어",
        guideHTML:
            `<b style="color:#eaf3ff;">🔰 How to</b>　` +
            `① Click <b>🔍 Analyze</b>　→　② Read importance by color　→　③ Bars update live as you change strength<br>` +
            `<span style="color:#4a9eff;">■</span> Weak (removable)　` +
            `<span style="color:#8fd14f;">■</span>　` +
            `<span style="color:#ffbb33;">■</span> Mid　` +
            `<span style="color:#ff5555;">■</span> Core (keep)　` +
            `— bar = current effect strength`,
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
        cmpLabel: "📊 Effect:",
        btnCompareOn: "🔍 vs Original: ON",
        btnCompareOff: "🔍 vs Original: OFF",
        cmpHintOn: "faint bar = original, solid bar = current effect",
        cmpHintOff: "",
        saveLabel: "Save:",
        savePathPh: "filtered/my_lora.safetensors  (relative to models/loras)",
        btnSaveFiltered: "💾 Save Filtered",
        btnAnalyze: "🔍 Analyze",
        stNeedLora: "⚠ Select a LoRA",
        stNeedPath: "⚠ Enter a path",
        stSaving: "Saving…",
        stSaved: (k, b, p) => `✅ Saved → ${p}  (${k} keys / ${b} blocks)`,
        stAnalyzing: "Analyzing…",
        stAnalyzed: "✅ Analysis done",
        resetTitle: "Reset this block to 1.00",
        uoLabel: "use original",
        uoOn: "Use ORIGINAL (ignore blocks)",
        uoOff: "Use my block config",
    },
};

// 부드러운 그라데이션: 0%(파랑) → 50%(초록/노랑) → 100%(빨강)
const impactColor = (pct) => {
    const p = Math.max(0, Math.min(100, pct)) / 100;
    const hue = 220 - 220 * p;
    return `hsl(${hue.toFixed(0)}, 78%, 55%)`;
};
const impactTier = (pct) => (pct >= 66 ? "core" : pct >= 33 ? "mid" : "weak");

// ── 프리셋 저장소 (아키텍처별로 분리) ─────────────────
const presetKey = (arch) => (arch === "krea2" ? "krea2_analyzer_presets_v1" : `tj_lora_presets_${arch}`);
const getPresets  = (arch) => { try { return JSON.parse(localStorage.getItem(presetKey(arch)) || "{}"); } catch { return {}; } };
const savePresets = (arch, p) => localStorage.setItem(presetKey(arch), JSON.stringify(p));

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
    name: "TJNode.LoRAAnalyzer",

    async nodeCreated(node) {
        const SPEC = ARCHS[node.comfyClass];
        if (!SPEC) return;

        const ARCH        = SPEC.arch;
        const TOTAL       = SPEC.total;
        const BLOCK_NAMES = SPEC.names;

        const cfgWidget = node.widgets?.find(w => w.name === "block_config");
        if (!cfgWidget) return;
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

        // ── use_original 위젯 라벨 i18n ────────────────
        const uoWidget = node.widgets?.find(w => w.name === "use_original");
        if (uoWidget) {
            onLang(() => {
                uoWidget.label = t("uoLabel");
                if (uoWidget.options) {
                    uoWidget.options.on  = t("uoOn");
                    uoWidget.options.off = t("uoOff");
                }
                node.setDirtyCanvas(true, true);
            });
        }

        // ── 상태 ──────────────────────────────────────
        const states = Array.from({ length: TOTAL }, () => ({ enable: true, strength: 1.0 }));
        let compareOn = false;

        const readConfig = () => {
            try {
                const obj = JSON.parse(cfgWidget.value || "{}");
                for (let i = 0; i < TOTAL; i++) {
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
            for (let i = 0; i < TOTAL; i++) obj[i] = { ...states[i] };
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

        const topBar = mkDiv("display:flex;justify-content:flex-end;margin-bottom:4px;");
        const langBtn = mkBtn("", () => setLang(lang === "ko" ? "en" : "ko"), "padding:2px 8px;");
        onLang(() => langBtn.textContent = t("langBtn"));
        topBar.appendChild(langBtn);
        wrap.appendChild(topBar);

        const guide = mkDiv(`
            background:#12202e; border:1px solid #274156; border-radius:5px;
            padding:6px 8px; margin-bottom:8px; line-height:1.5; color:#bcd;
        `);
        onLang(() => guide.innerHTML = t("guideHTML"));
        wrap.appendChild(guide);

        // ── 1. 프리셋 ─────────────────────────────────
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
            const presets = getPresets(ARCH);
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
            const preset = getPresets(ARCH)[presetSelect.value];
            if (!preset) return;
            try {
                const cfg = JSON.parse(preset.block_config || "{}");
                for (let i = 0; i < TOTAL; i++) {
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
            const presets = getPresets(ARCH);
            const obj = {};
            for (let i = 0; i < TOTAL; i++) obj[i] = { ...states[i] };
            presets[name] = { name, created: new Date().toISOString(), block_config: JSON.stringify(obj) };
            savePresets(ARCH, presets);
            refreshPresetSelect();
            presetSelect.value = name;
        });
        onLang(() => btnSaveP.textContent = t("btnSavePreset"));
        presetRow.appendChild(btnSaveP);

        const btnDelP = mkBtn("", () => {
            const name = presetSelect.value;
            if (!name) return;
            if (!confirm(t("confirmDel", name))) return;
            const presets = getPresets(ARCH);
            delete presets[name];
            savePresets(ARCH, presets);
            refreshPresetSelect();
        });
        onLang(() => btnDelP.textContent = t("btnDelPreset"));
        presetRow.appendChild(btnDelP);

        // ── 2. 빠른 조작 (섹션 토글은 구조에서 생성) ────
        const btnBar = mkDiv("display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;");
        wrap.appendChild(btnBar);
        const rows = [];

        btnBar.append(
            mkBtn("All ON",  () => { rows.forEach((r,i) => setEnable(r,i,true));  writeConfig(); }),
            mkBtn("All OFF", () => { rows.forEach((r,i) => setEnable(r,i,false)); writeConfig(); }),
        );
        // 섹션별 ON/OFF 토글 버튼 (예: Double ⏻ / Single ⏻ / Block ⏻ …)
        SPEC.sections.forEach(s => {
            btnBar.appendChild(mkBtn(`${s.label} ⏻`, () => {
                const idxs = [];
                for (let i = s.start; i < s.start + s.count; i++) idxs.push(i);
                const allOn = idxs.every(i => states[i].enable);
                idxs.forEach(i => setEnable(rows[i], i, !allOn));
                writeConfig();
            }));
        });
        btnBar.appendChild(mkBtn("Reset Str", () => {
            rows.forEach((r,i) => {
                states[i].strength = 1.0;
                r.strInput.value = "1.00";
                if (r.strSlider) r.strSlider.value = "1";
                updateRowStyle(r, i);
            });
            writeConfig();
        }));

        // ── 2-B. 자동 조절 ─────────────────────────────
        const autoRow = mkDiv("display:flex;gap:4px;margin-bottom:6px;align-items:center;flex-wrap:wrap;");
        wrap.appendChild(autoRow);
        const autoLbl = mkSpan("", "color:#8fd; flex-shrink:0;");
        onLang(() => autoLbl.textContent = t("autoLabel"));
        autoRow.appendChild(autoLbl);
        const autoHint = mkSpan("", "font-size:10px;color:#889;flex-shrink:0;");

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

        // ── 2-C. 효과 비교 ─────────────────────────────
        const cmpRow = mkDiv("display:flex;gap:4px;margin-bottom:8px;align-items:center;flex-wrap:wrap;");
        wrap.appendChild(cmpRow);
        const cmpLbl = mkSpan("", "color:#e0c040;flex-shrink:0;");
        onLang(() => cmpLbl.textContent = t("cmpLabel"));
        cmpRow.appendChild(cmpLbl);
        const cmpHint = mkSpan("", "font-size:10px;color:#889;flex-shrink:0;");
        const bCompare = mkBtn("", () => {
            compareOn = !compareOn;
            bCompare.style.borderColor = compareOn ? "#e0c040" : "#444";
            bCompare.textContent = compareOn ? t("btnCompareOn") : t("btnCompareOff");
            cmpHint.textContent = compareOn ? t("cmpHintOn") : t("cmpHintOff");
            refreshAllBars();
        }, "");
        onLang(() => bCompare.textContent = compareOn ? t("btnCompareOn") : t("btnCompareOff"));
        cmpRow.append(bCompare, cmpHint);

        // ── 3. 저장 ───────────────────────────────────
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
            const loraName = node.widgets?.find(w => w.name === "lora_name")?.value;
            const savePath = savePathInput.value.trim();
            if (!loraName) { saveStatusLabel.textContent = t("stNeedLora"); saveStatusLabel.style.color="#ffaa00"; return; }
            if (!savePath) { saveStatusLabel.textContent = t("stNeedPath"); saveStatusLabel.style.color="#ffaa00"; return; }
            saveStatusLabel.textContent = t("stSaving");
            saveStatusLabel.style.color = "#888";
            const cfg = {};
            for (let i = 0; i < TOTAL; i++) cfg[i] = { ...states[i] };
            try {
                const result = await apiPost("/tjlora/save_filtered", {
                    arch: ARCH, lora_name: loraName, block_config: cfg, save_path: savePath,
                });
                if (result.error) {
                    saveStatusLabel.textContent = `❌ ${result.error}`;
                    saveStatusLabel.style.color = "#ff4444";
                } else {
                    console.log("[TJ LoRA Analyzer] saved:", result.saved_path);
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

        const btnAnalyze = mkBtn("", async () => {
            const loraName = node.widgets?.find(w => w.name === "lora_name")?.value;
            if (!loraName) { saveStatusLabel.textContent = t("stNeedLora"); saveStatusLabel.style.color="#ffaa00"; return; }
            saveStatusLabel.textContent = t("stAnalyzing");
            saveStatusLabel.style.color = "#888";
            try {
                const result = await apiPost("/tjlora/analyze", { arch: ARCH, lora_name: loraName });
                if (result.error) {
                    saveStatusLabel.textContent = `❌ ${result.error}`;
                    saveStatusLabel.style.color = "#ff4444";
                } else {
                    updateImpact(result.block_data);
                    if (result.warning) {
                        // 아키텍처 불일치(예: 9B LoRA를 4B 노드에) 등 — 조용히 틀리지 않도록 경고
                        saveStatusLabel.textContent = `⚠ ${result.warning}`;
                        saveStatusLabel.style.color = "#ffaa00";
                    } else {
                        saveStatusLabel.textContent = t("stAnalyzed");
                        saveStatusLabel.style.color = "#44dd88";
                    }
                }
            } catch (e) {
                saveStatusLabel.textContent = `❌ ${e.message}`;
                saveStatusLabel.style.color = "#ff4444";
            }
        });
        onLang(() => btnAnalyze.textContent = t("btnAnalyze"));
        saveRow.appendChild(btnAnalyze);
        saveRow.appendChild(saveStatusLabel);

        // ── 4. 막대 렌더링 ─────────────────────────────
        const clampPct = (x) => Math.max(0, Math.min(100, x));
        const updateBarRow = (row, idx) => {
            const base = row._impact ?? 0;
            const eff  = states[idx].enable ? base * (states[idx].strength ?? 1) : 0;
            row.barFill.style.width      = clampPct(eff) + "%";
            row.barFill.style.background = impactColor(eff);
            row.dot.style.background     = impactColor(eff);
            row.barGhost.style.width     = compareOn ? clampPct(base) + "%" : "0%";
            row.impLabel.textContent = base > 0
                ? (compareOn ? `${base.toFixed(0)}→${eff.toFixed(0)}` : `${eff.toFixed(1)}%`)
                : "—";
        };
        const refreshAllBars = () => rows.forEach((r, i) => updateBarRow(r, i));

        const setEnable = (row, idx, val) => {
            states[idx].enable = val;
            row.check.checked  = val;
            updateRowStyle(row, idx);
        };
        const updateRowStyle = (row, idx) => {
            row.el.style.opacity = states[idx].enable ? "1" : "0.35";
            updateBarRow(row, idx);
        };

        // ── 5. 블록 행 ────────────────────────────────
        const mkRow = (idx) => {
            const el = mkDiv(`
                display:flex;align-items:center;gap:5px;
                padding:2px 4px;margin-bottom:2px;
                background:#1e1e1e;border-radius:3px;
            `);
            const dot = mkDiv(`width:7px;height:7px;border-radius:50%;background:#4488ff;flex-shrink:0;`);
            const check = mkInput("checkbox", "flex-shrink:0;cursor:pointer;width:13px;height:13px;",
                { checked: states[idx].enable });
            check.onchange = () => {
                states[idx].enable = check.checked;
                updateRowStyle(row, idx);
                writeConfig();
            };
            const name = mkSpan(BLOCK_NAMES[idx], "min-width:132px;flex-shrink:0;color:#ccc;");

            const strInput = mkInput("number",
                `width:54px;background:#2a2a2a;color:#eee;border:1px solid #444;
                 border-radius:3px;padding:1px 4px;font-size:11px;flex-shrink:0;`,
                { min:"-5", max:"5", step:"0.05", value: states[idx].strength.toFixed(2) });
            const strSlider = mkInput("range",
                `width:70px;flex-shrink:0;cursor:pointer;accent-color:#7612DA;`,
                { min:"-5", max:"5", step:"0.05", value: String(states[idx].strength) });

            const applyStrength = (val, from) => {
                let v = parseFloat(val);
                if (isNaN(v)) v = 1.0;
                v = Math.min(5, Math.max(-5, v));
                states[idx].strength = v;
                if (from !== "num")    strInput.value  = v.toFixed(2);
                if (from !== "slider") strSlider.value = String(v);
                updateBarRow(row, idx);
                writeConfig();
            };
            strInput.oninput  = () => applyStrength(strInput.value, "num");
            strSlider.oninput = () => applyStrength(strSlider.value, "slider");
            strInput.onchange = () => applyStrength(strInput.value, "reformat");

            const stepStrength = (delta) => {
                const cur = parseFloat(strInput.value);
                const base = isNaN(cur) ? (states[idx].strength || 0) : cur;
                applyStrength(Math.round((base + delta) * 100) / 100, "reformat");
            };
            strSlider.addEventListener("wheel", (e) => {
                e.preventDefault();
                e.stopPropagation();
                stepStrength(e.deltaY < 0 ? 0.05 : -0.05);
            }, { passive: false });

            const btnStyle = `padding:1px 5px;font-size:12px;line-height:1;flex-shrink:0;`;
            const decBtn = mkBtn("‹", () => stepStrength(-0.05), btnStyle);
            const incBtn = mkBtn("›", () => stepStrength(0.05), btnStyle);
            decBtn.title = "-0.05";
            incBtn.title = "+0.05";
            const resetBtn = mkBtn("⟲", () => applyStrength(1.0, "reset"),
                `padding:1px 5px;font-size:11px;flex-shrink:0;`);
            onLang(() => resetBtn.title = t("resetTitle"));

            const barWrap  = mkDiv(`position:relative;flex:1;height:6px;background:#2a2a2a;border-radius:3px;overflow:hidden;`);
            const barGhost = mkDiv(`position:absolute;left:0;top:0;height:100%;width:0%;background:rgba(255,255,255,0.16);`);
            const barFill  = mkDiv(`position:absolute;left:0;top:0;height:100%;width:0%;background:#4488ff;transition:width .12s;`);
            barWrap.append(barGhost, barFill);
            const impLabel = mkSpan("—", "color:#888;min-width:52px;text-align:right;font-size:10px;");

            el.append(dot, check, name, strInput, decBtn, strSlider, incBtn, resetBtn, barWrap, impLabel);
            const row = { el, dot, check, strInput, strSlider, barFill, barGhost, impLabel, _impact: 0 };
            updateRowStyle(row, idx);
            return row;
        };

        const sectionLabel = (txt) => {
            const d = mkDiv(`color:#888;font-size:10px;margin:6px 0 3px;border-bottom:1px solid #333;padding-bottom:2px;`);
            d.textContent = txt;
            return d;
        };

        // 섹션 순서대로 헤더 + 행 생성
        SPEC.sections.forEach(s => {
            const end = s.start + s.count - 1;
            wrap.appendChild(sectionLabel(`■ ${s.label} (${s.start === end ? s.start : `${s.start}–${end}`})`));
            for (let i = s.start; i < s.start + s.count; i++) {
                const r = mkRow(i);
                rows.push(r);
                wrap.appendChild(r.el);
            }
        });

        // ── 6. 임팩트 업데이트 ─────────────────────────
        const updateImpact = (dataOrStr) => {
            try {
                const data = typeof dataOrStr === "string" ? JSON.parse(dataOrStr) : dataOrStr;
                for (let i = 0; i < TOTAL; i++) {
                    const d = data[String(i)] ?? data[i];
                    if (!d) continue;
                    rows[i]._impact = d.impact ?? 0;
                }
                refreshAllBars();
                let core = 0, mid = 0, weak = 0;
                rows.forEach(r => {
                    const tr = impactTier(r._impact ?? 0);
                    if (tr === "core") core++; else if (tr === "mid") mid++; else weak++;
                });
                lastCounts = { core, mid, weak };
                applySummary();
            } catch(e) { console.warn("[TJ LoRA Analyzer] impact update error", e); }
        };

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

        // ── DOM 위젯 ──────────────────────────────────
        const host = document.createElement("div");
        host.style.cssText = "width:100%;box-sizing:border-box;";
        host.appendChild(wrap);
        const domWidget = node.addDOMWidget("tj_lora_block_ui", "custom", host, {
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

        // ── 크기 ──────────────────────────────────────
        const CONTENT_FALLBACK = 820;
        if (domWidget) {
            domWidget.computeSize = function (nodeWidth) {
                return [nodeWidth, (wrap.scrollHeight || CONTENT_FALLBACK) + 8];
            };
        }
        const fitNode = () => {
            const w = Math.max(540, node.size[0] || 540);
            node.setSize([w, node.computeSize()[1]]);
            node.setDirtyCanvas(true, true);
        };
        const MIN_W = 540;
        const origOnResize = node.onResize;
        node.onResize = function (size) {
            if (size[0] < MIN_W) size[0] = MIN_W;
            origOnResize?.apply(this, arguments);
        };
        if (Array.isArray(node.min_size)) node.min_size[0] = MIN_W;
        else node.min_size = [MIN_W, 0];

        node.color   = "#7612DA";
        node.bgcolor = "#000000";
        if (node.title_text_color !== undefined) node.title_text_color = "#FFFFFF";

        writeConfig();
        refreshAllBars();
        node.setSize([Math.max(540, node.size[0] || 540), node.size[1]]);
        requestAnimationFrame(fitNode);
        setTimeout(fitNode, 120);

        if (typeof ResizeObserver !== "undefined") {
            let raf = null;
            const ro = new ResizeObserver(() => {
                if (raf) cancelAnimationFrame(raf);
                raf = requestAnimationFrame(() => { try { fitNode(); } catch (_) {} });
            });
            ro.observe(wrap);
        }
    },
});
