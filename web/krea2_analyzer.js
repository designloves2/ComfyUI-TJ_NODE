import { app } from "../../scripts/app.js";

const NODE_CLASS   = "Krea2LoRAAnalyzer";
const TOTAL_BLOCKS = 32;
const PRESET_KEY   = "krea2_analyzer_presets_v1";

const BLOCK_NAMES = (() => {
    const n = [];
    for (let i = 0; i < 28; i++) n.push(`Block ${String(i).padStart(2,"0")}`);
    n.push("TxtFusion-Layer 0", "TxtFusion-Layer 1");
    n.push("TxtFusion-Refiner 0", "TxtFusion-Refiner 1");
    return n;
})();

// 부드러운 그라데이션: 0%(파랑) → 50%(초록/노랑) → 100%(빨강)
// 4단계 하드밴드보다 서열이 한눈에 보인다.
const impactColor = (pct) => {
    const p = Math.max(0, Math.min(100, pct)) / 100;
    const hue = 220 - 220 * p;   // 220=파랑 → 120=초록 → 60=노랑 → 0=빨강
    return `hsl(${hue.toFixed(0)}, 78%, 55%)`;
};

// 임팩트 등급(초보자 안내용)
const impactTier = (pct) => {
    if (pct >= 66) return { label: "핵심", color: "#ff5555" };
    if (pct >= 33) return { label: "보조", color: "#ffbb33" };
    return { label: "약함", color: "#4a9eff" };
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

        // ════════════════════════════════════════════════
        // 0. 초보자 안내 (사용법 3단계 + 색 범례)
        // ════════════════════════════════════════════════
        const guide = mkDiv(`
            background:#12202e; border:1px solid #274156; border-radius:5px;
            padding:6px 8px; margin-bottom:8px; line-height:1.5; color:#bcd;
        `);
        guide.innerHTML =
            `<b style="color:#eaf3ff;">🔰 사용법</b>　` +
            `① <b>🔍 Analyze</b> 눌러 분석　→　② 색으로 중요도 확인　→　③ 아래 <b>자동 조절</b> 버튼 클릭<br>` +
            `<span style="color:#4a9eff;">■</span> 약함(빼도 됨)　` +
            `<span style="color:#8fd14f;">■</span>　` +
            `<span style="color:#ffbb33;">■</span> 보조　` +
            `<span style="color:#ff5555;">■</span> 핵심(유지 권장)　` +
            `— 진할수록(빨강) 중요한 블록`;
        wrap.appendChild(guide);

        // ════════════════════════════════════════════════
        // 1. 프리셋 섹션
        // ════════════════════════════════════════════════
        const presetRow = mkDiv("display:flex;gap:4px;margin-bottom:8px;align-items:center;flex-wrap:wrap;");
        wrap.appendChild(presetRow);

        presetRow.appendChild(mkSpan("Preset:", "color:#888;flex-shrink:0;"));

        const presetSelect = css(document.createElement("select"), `
            background:#2a2a2a;color:#eee;border:1px solid #444;border-radius:4px;
            padding:2px 4px;font-size:11px;flex:1;min-width:100px;
        `);
        presetRow.appendChild(presetSelect);

        const presetNameInput = css(document.createElement("input"), `
            background:#2a2a2a;color:#eee;border:1px solid #444;border-radius:4px;
            padding:2px 6px;font-size:11px;width:100px;
        `);
        presetNameInput.placeholder = "preset name…";
        presetRow.appendChild(presetNameInput);

        const refreshPresetSelect = () => {
            const presets = getPresets();
            presetSelect.innerHTML = '<option value="">— select —</option>';
            Object.keys(presets).sort().forEach(name => {
                const opt = document.createElement("option");
                opt.value = name; opt.textContent = name;
                presetSelect.appendChild(opt);
            });
        };

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

        presetRow.appendChild(mkBtn("💾 Save", () => {
            const name = presetNameInput.value.trim();
            if (!name) { alert("프리셋 이름을 입력하세요."); return; }
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
        }));

        presetRow.appendChild(mkBtn("🗑 Del", () => {
            const name = presetSelect.value;
            if (!name) return;
            if (!confirm(`"${name}" 프리셋을 삭제할까요?`)) return;
            const presets = getPresets();
            delete presets[name];
            savePresets(presets);
            refreshPresetSelect();
        }));

        refreshPresetSelect();

        // ════════════════════════════════════════════════
        // 2. 빠른 조작 버튼
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
        autoRow.appendChild(mkSpan("🎚 자동:", "color:#8fd; flex-shrink:0;"));

        const autoHint = mkSpan("", "font-size:10px;color:#889;flex-shrink:0;");

        // 분석됐는지 확인 (임팩트가 하나라도 0 초과)
        const isAnalyzed = () => rows.some(r => (r._impact ?? 0) > 0);
        // minPct 이상만 ON, 나머지 OFF
        const applyByImpact = (minPct, name) => {
            if (!isAnalyzed()) {
                autoHint.textContent = "← 먼저 🔍 Analyze 를 누르세요";
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
            autoHint.textContent = `${name}: ${on}개 유지 / ${rows.length - on}개 끔`;
            autoHint.style.color = "#8fd14f";
        };

        autoRow.append(
            mkBtn("🎯 핵심만",      () => applyByImpact(66, "핵심만"),      "border-color:#ff5555;"),
            mkBtn("⚖️ 균형",       () => applyByImpact(40, "균형"),        "border-color:#ffbb33;"),
            mkBtn("🧹 약한블록 정리", () => applyByImpact(25, "약한블록 정리"), "border-color:#4a9eff;"),
            autoHint,
        );

        // ════════════════════════════════════════════════
        // 3. 저장 섹션
        // ════════════════════════════════════════════════
        const saveRow = mkDiv("display:flex;gap:4px;margin-bottom:8px;align-items:center;flex-wrap:wrap;");
        wrap.appendChild(saveRow);

        saveRow.appendChild(mkSpan("Save:", "color:#888;flex-shrink:0;"));

        const savePathInput = css(document.createElement("input"), `
            flex:1;background:#2a2a2a;color:#eee;border:1px solid #444;
            border-radius:4px;padding:2px 6px;font-size:11px;min-width:160px;
        `);
        savePathInput.placeholder = "filtered/my_lora.safetensors  (loras 폴더 기준)";
        saveRow.appendChild(savePathInput);

        const saveStatusLabel = mkSpan("", "font-size:10px;color:#888;flex-shrink:0;");
        saveRow.appendChild(saveStatusLabel);

        saveRow.appendChild(mkBtn("💾 Save Filtered", async () => {
            const loraWidget = node.widgets?.find(w => w.name === "lora_name");
            const loraName   = loraWidget?.value;
            const savePath   = savePathInput.value.trim();

            if (!loraName) { saveStatusLabel.textContent = "⚠ LoRA 선택 필요"; saveStatusLabel.style.color="#ffaa00"; return; }
            if (!savePath) { saveStatusLabel.textContent = "⚠ 경로 입력 필요"; saveStatusLabel.style.color="#ffaa00"; return; }

            saveStatusLabel.textContent = "저장 중…";
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
                    saveStatusLabel.textContent =
                        `✅ 저장완료 (${result.filtered_keys}키 / ${result.enabled_blocks}블록)`;
                    saveStatusLabel.style.color = "#44dd88";
                }
            } catch (e) {
                saveStatusLabel.textContent = `❌ ${e.message}`;
                saveStatusLabel.style.color = "#ff4444";
            }
        }));

        // ── 분석 버튼 (워크플로우 없이 직접 분석) ─────
        saveRow.appendChild(mkBtn("🔍 Analyze", async () => {
            const loraWidget = node.widgets?.find(w => w.name === "lora_name");
            const loraName   = loraWidget?.value;
            if (!loraName) { saveStatusLabel.textContent = "⚠ LoRA 선택 필요"; return; }

            saveStatusLabel.textContent = "분석 중…";
            saveStatusLabel.style.color = "#888";
            try {
                const result = await apiPost("/krea2analyzer/analyze", { lora_name: loraName });
                if (result.error) {
                    saveStatusLabel.textContent = `❌ ${result.error}`;
                    saveStatusLabel.style.color = "#ff4444";
                } else {
                    updateImpact(result.block_data);
                    saveStatusLabel.textContent = "✅ 분석 완료";
                    saveStatusLabel.style.color = "#44dd88";
                }
            } catch (e) {
                saveStatusLabel.textContent = `❌ ${e.message}`;
                saveStatusLabel.style.color = "#ff4444";
            }
        }));

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

            // 숫자 ↔ 슬라이더 양방향 동기화 (어느 쪽으로 조절해도 반영)
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
            // blur/Enter 시 정수 입력이어도 소수점 2자리로 정규화
            strInput.onchange = () => applyStrength(strInput.value, "reformat");

            // 0.05 단위 미세조정 (부동소수 오차 방지 위해 반올림)
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

            // 블록별 1.00 되돌리기 버튼
            const resetBtn = mkBtn("⟲", () => applyStrength(1.0, "reset"),
                `padding:1px 5px;font-size:11px;flex-shrink:0;`);
            resetBtn.title = "이 블록 강도를 1.00으로 초기화";

            const barWrap = mkDiv(`flex:1;height:5px;background:#2a2a2a;border-radius:3px;overflow:hidden;`);
            const barFill = mkDiv(`height:100%;width:0%;background:#4488ff;transition:width .3s;`);
            barWrap.appendChild(barFill);

            const impLabel = mkSpan("—", "color:#666;min-width:36px;text-align:right;font-size:10px;");

            el.append(dot, check, name, strInput, decBtn, strSlider, incBtn, resetBtn, barWrap, impLabel);

            const row = { el, dot, check, strInput, strSlider, barFill, impLabel, _impact: 0 };
            updateRowStyle(row, idx);
            return row;
        };

        const sectionLabel = (txt) => {
            const d = mkDiv(`color:#888;font-size:10px;margin:6px 0 3px;border-bottom:1px solid #333;padding-bottom:2px;`);
            d.textContent = txt;
            return d;
        };

        wrap.appendChild(sectionLabel("■ Main Blocks (0–27)"));
        for (let i = 0; i < 28; i++) {
            const r = mkRow(i);
            rows.push(r);
            wrap.appendChild(r.el);
        }
        wrap.appendChild(sectionLabel("■ TxtFusion (Layerwise 0-1 / Refiner 0-1)"));
        for (let i = 28; i < TOTAL_BLOCKS; i++) {
            const r = mkRow(i);
            rows.push(r);
            wrap.appendChild(r.el);
        }

        // ════════════════════════════════════════════════
        // 5. 임팩트 업데이트 함수
        // ════════════════════════════════════════════════

        // block_data 객체 또는 JSON 문자열 모두 허용
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
                // 분석 요약: 핵심/보조/약함 개수 안내 (초보자용)
                let core = 0, mid = 0, low = 0;
                rows.forEach(r => {
                    const t = impactTier(r._impact ?? 0).label;
                    if (t === "핵심") core++; else if (t === "보조") mid++; else low++;
                });
                autoHint.textContent = `분석완료 → 핵심 ${core} · 보조 ${mid} · 약함 ${low}`;
                autoHint.style.color = "#8fd14f";
            } catch(e) { console.warn("[Krea2Analyzer] impact update error", e); }
        };

        // ── onExecuted: analysis_json 읽기 ──────────────
        const origOnExecuted = node.onExecuted;
        node.onExecuted = function(msg) {
            if (origOnExecuted) origOnExecuted.call(this, msg);
            const out = msg?.output;
            if (!out) return;

            // 방법1: RETURN_NAMES 기반 (analysis_json)
            // 방법1: ui 딕셔너리 방식 (Realtime-Lora 확인된 포맷)
            if (out?.analysis_json?.[0]) { updateImpact(out.analysis_json[0]); return; }

            // 방법2: 인덱스 기반 [3]
            if (out?.[3]?.[0])           { updateImpact(out[3][0]);            return; }

            // 방법3: 마지막 배열 요소에서 JSON 찾기
            const vals = Object.values(out);
            for (let i = vals.length - 1; i >= 0; i--) {
                const v = Array.isArray(vals[i]) ? vals[i][0] : vals[i];
                if (typeof v === "string" && v.trim().startsWith("{")) {
                    try { JSON.parse(v); updateImpact(v); return; } catch (_) {}
                }
            }
        };

        // ── DOM 위젯 등록 ────────────────────────────────
        // host(외곽)는 ComfyUI가 노드 높이에 맞춰 늘리지만, 실제 콘텐츠(wrap)는
        // 그 안에서 content 높이만 차지 → wrap.scrollHeight 로 참 높이를 측정.
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
        // DOM 콘텐츠(프리셋/버튼/저장/32행)의 실제 높이를 노드가 확보하도록
        // computeSize를 콘텐츠 높이에 연동. 레이아웃이 잡힌 뒤 재측정한다.
        const CONTENT_FALLBACK = 760;
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

        // 최소 노드 폭 강제 — 이보다 좁히면 내부 UI가 노드 밖으로 삐져나옴
        const MIN_W = 540;
        const origOnResize = node.onResize;
        node.onResize = function (size) {
            if (size[0] < MIN_W) size[0] = MIN_W;
            origOnResize?.apply(this, arguments);
        };
        if (Array.isArray(node.min_size)) node.min_size[0] = MIN_W;
        else node.min_size = [MIN_W, 0];

        // TJ 브랜드 테마 적용
        node.color   = "#7612DA";
        node.bgcolor = "#000000";
        if (node.title_text_color !== undefined) node.title_text_color = "#FFFFFF";

        writeConfig();
        // 최초 배치: 폭 먼저 확정(콘텐츠 width:100% 뭉개짐 방지) 후 높이 측정
        node.setSize([Math.max(540, node.size[0] || 540), node.size[1]]);
        requestAnimationFrame(fitNode);
        setTimeout(fitNode, 120);  // 폰트/레이아웃 정착 후 재보정
    },
});
