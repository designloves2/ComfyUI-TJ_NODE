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

const impactColor = (pct) => {
    if (pct >= 90) return "#ff4444";
    if (pct >= 60) return "#ffaa22";
    if (pct >= 30) return "#44dd88";
    return "#4488ff";
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
            mkBtn("Main ON 0-27",  () => { rows.slice(0,28).forEach((r,i)   => setEnable(r,i,true));    writeConfig(); }),
            mkBtn("TxtF OFF",      () => { rows.slice(28).forEach((r,i)     => setEnable(r,28+i,false)); writeConfig(); }),
            mkBtn("Reset Str",     () => {
                rows.forEach((r,i) => { states[i].strength = 1.0; r.strInput.value = "1.00"; });
                writeConfig();
            }),
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

            const name = mkSpan(BLOCK_NAMES[idx], "min-width:130px;flex-shrink:0;color:#ccc;");

            const strInput = mkInput("number",
                `width:54px;background:#2a2a2a;color:#eee;border:1px solid #444;
                 border-radius:3px;padding:1px 4px;font-size:11px;flex-shrink:0;`,
                { min:"-5", max:"5", step:"0.05", value: states[idx].strength.toFixed(2) });
            strInput.onchange = () => {
                states[idx].strength = parseFloat(strInput.value) || 1.0;
                writeConfig();
            };

            const barWrap = mkDiv(`flex:1;height:5px;background:#2a2a2a;border-radius:3px;overflow:hidden;`);
            const barFill = mkDiv(`height:100%;width:0%;background:#4488ff;transition:width .3s;`);
            barWrap.appendChild(barFill);

            const impLabel = mkSpan("—", "color:#666;min-width:36px;text-align:right;font-size:10px;");

            el.append(dot, check, name, strInput, barWrap, impLabel);

            const row = { el, dot, check, strInput, barFill, impLabel, _impact: 0 };
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
        node.addDOMWidget("krea2_block_ui", "custom", wrap, {
            getValue() { return cfgWidget.value; },
            setValue(v) {
                cfgWidget.value = v;
                readConfig();
                rows.forEach((r, i) => {
                    r.check.checked  = states[i].enable;
                    r.strInput.value = states[i].strength.toFixed(2);
                    updateRowStyle(r, i);
                });
            },
            serialize: false,
        });

        writeConfig();
        node.setSize([500, node.size[1]]);
    },
});
