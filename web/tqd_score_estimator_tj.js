// TQD Score Estimate (TJ) — live preview while scoring runs.
// Each image takes ~13-30s (sequential, one LLM call per image, never batched),
// so this shows one big image + the two scores as each image finishes, replacing
// in place — that's the main event, so every model/backend setting lives behind
// a Settings popup instead of cluttering the node body.
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const NODE_TYPE = "TJ_TQDScoreEstimate";
const PROGRESS_EVENT = "tj-tqd-score-progress";
const IMAGE_HEIGHT = 300;
const SETTINGS_STORAGE_KEY = "tj_tqd_score_estimate_settings_v1";

function loadSavedSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        return null;
    }
}

function saveSettingsFromNode(node, settingWidgets) {
    const data = {};
    settingWidgets.forEach((w) => { data[w.name] = w.value; });
    try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(data));
        return true;
    } catch (err) {
        return false;
    }
}

function applySavedSettings(node) {
    const saved = loadSavedSettings();
    if (!saved) return;
    (node.widgets || []).forEach((w) => {
        if (Object.prototype.hasOwnProperty.call(saved, w.name)) {
            w.value = saved[w.name];
            w.callback?.call(w, w.value, app.canvas, node, null, null);
        }
    });
}

function scoreColor(score) {
    if (score >= 0.75) return "#4ee8a4";
    if (score >= 0.45) return "#f0c05a";
    return "#f0645e";
}

// ── Styling ──────────────────────────────────────────────────────────────────

function installTQDStyle() {
    if (document.getElementById("tj-tqd-style")) return;
    const style = document.createElement("style");
    style.id = "tj-tqd-style";
    style.textContent = `
      /* ComfyUI's DOM-widget host stretches this wrap to h-full/w-full, which — combined
         with default flex-shrink:1 — would otherwise crush every child down to near-0px
         (the host's own height is derived FROM this content, a circular dependency).
         flex-shrink:0 on every direct child breaks that: children keep their natural/fixed
         height no matter what the host's current (possibly stale) height is. */
      .tj-tqd-wrap { display:flex; flex-direction:column; gap:10px; padding:10px 8px 8px; font-family:Arial,sans-serif; background:#0b0812; }
      .tj-tqd-wrap > * { flex-shrink:0; }

      /* ComfyUI draws a thin divider line right above where the DOM widget starts —
         a small top margin + solid card background keeps the gear button clear of it. */
      .tj-tqd-topbar { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:2px; position:relative; z-index:1; }
      .tj-tqd-status { font-size:11.5px; font-weight:800; color:#e6e6ee; line-height:1.5; }
      .tj-tqd-status .tj-tqd-sub { color:#8a8aa0; font-weight:600; }
      .tj-tqd-gear {
        flex:none; width:28px; height:28px; border-radius:9px; border:1px solid rgba(155,110,255,.4);
        background:#241a38;
        color:#d9c6ff; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center;
        transition:background .15s ease, border-color .15s ease;
      }
      .tj-tqd-gear:hover { background:#3a2758; border-color:rgba(190,150,255,.8); }

      .tj-tqd-imgcard {
        position:relative; width:100%; height:${IMAGE_HEIGHT}px; border-radius:14px; overflow:hidden;
        background:
          radial-gradient(circle at 30% 20%, rgba(155,88,239,.22), transparent 55%),
          radial-gradient(circle at 80% 90%, rgba(95,251,255,.10), transparent 55%),
          linear-gradient(160deg, #17101f, #0a0710);
        border:1px solid rgba(155,88,239,.30);
        display:flex; align-items:center; justify-content:center;
        box-shadow: inset 0 0 40px rgba(0,0,0,.5), 0 8px 24px rgba(0,0,0,.35);
      }
      .tj-tqd-imgcard img { max-width:96%; max-height:96%; object-fit:contain; border-radius:10px; box-shadow:0 6px 22px rgba(0,0,0,.55); }
      .tj-tqd-imgcard .tj-tqd-placeholder { color:#5c5470; font-size:12px; font-weight:800; letter-spacing:.5px; }
      .tj-tqd-imgcard .tj-tqd-corner {
        position:absolute; width:16px; height:16px; border-color:rgba(190,150,255,.55); opacity:.8;
      }
      .tj-tqd-imgcard .tj-tqd-corner.tl { top:8px; left:8px; border-top:2px solid; border-left:2px solid; border-radius:6px 0 0 0; }
      .tj-tqd-imgcard .tj-tqd-corner.tr { top:8px; right:8px; border-top:2px solid; border-right:2px solid; border-radius:0 6px 0 0; }
      .tj-tqd-imgcard .tj-tqd-corner.bl { bottom:8px; left:8px; border-bottom:2px solid; border-left:2px solid; border-radius:0 0 0 6px; }
      .tj-tqd-imgcard .tj-tqd-corner.br { bottom:8px; right:8px; border-bottom:2px solid; border-right:2px solid; border-radius:0 0 6px 0; }

      .tj-tqd-scores { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .tj-tqd-score-card {
        display:flex; align-items:center; gap:12px; padding:12px;
        border-radius:14px; background:linear-gradient(160deg, rgba(255,255,255,.05), rgba(255,255,255,.015));
        border:1px solid rgba(255,255,255,.09);
      }
      .tj-tqd-ring { position:relative; width:60px; height:60px; flex:none; border-radius:50%; transition:background .25s ease; }
      .tj-tqd-ring::before { content:""; position:absolute; inset:6px; border-radius:50%; background:#0c0a12; box-shadow:inset 0 2px 6px rgba(0,0,0,.5); }
      .tj-tqd-ring-num { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:900; }
      .tj-tqd-score-label { font-size:10.5px; font-weight:800; color:#9a94ad; text-transform:uppercase; letter-spacing:.5px; }
      .tj-tqd-score-value { font-size:21px; font-weight:900; margin-top:2px; }
      .tj-tqd-error-card { grid-column:1 / -1; color:#ff9d97; font-size:12px; font-weight:700; line-height:1.4; }

      .tj-tqd-warning {
        padding:8px 10px; border-radius:10px; background:rgba(240,100,94,.16);
        border:1px solid rgba(240,100,94,.55); color:#ffb3ae; font-weight:700; font-size:11px; line-height:1.5;
      }

      /* ── Settings modal ─────────────────────────────────────────────── */
      .tj-tqd-backdrop { position:fixed; inset:0; background:rgba(6,4,12,.62); z-index:100000; display:flex; align-items:center; justify-content:center; font-family:Arial,sans-serif; }
      .tj-tqd-modal { width:min(480px,92vw); max-height:86vh; background:#120c1c; border:1px solid rgba(155,88,239,.5); border-radius:16px; box-shadow:0 0 40px rgba(118,18,218,.35); display:flex; flex-direction:column; overflow:hidden; color:#eee; }
      .tj-tqd-modal-head { padding:14px 18px; border-bottom:1px solid rgba(155,88,239,.3); display:flex; justify-content:space-between; align-items:center; background:linear-gradient(135deg, rgba(118,18,218,.28), transparent); }
      .tj-tqd-modal-title { font-size:15px; font-weight:900; color:#e3d3ff; }
      .tj-tqd-modal-close { border:0; background:rgba(255,255,255,.08); color:#fff; border-radius:8px; width:26px; height:26px; cursor:pointer; font-size:14px; }
      .tj-tqd-modal-body { padding:16px 18px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; }
      .tj-tqd-field label { display:block; font-size:11px; font-weight:800; color:#b9a8e0; margin-bottom:5px; letter-spacing:.2px; }
      .tj-tqd-field select, .tj-tqd-field input[type=text], .tj-tqd-field input[type=number], .tj-tqd-field textarea {
        width:100%; box-sizing:border-box; background:#0a0713; color:#eee; border:1px solid rgba(155,88,239,.35);
        border-radius:9px; padding:8px 10px; font-size:12.5px; outline:none;
      }
      .tj-tqd-field textarea { resize:vertical; min-height:52px; }
      .tj-tqd-field-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .tj-tqd-field-row label { margin-bottom:0; }
      .tj-tqd-switch { position:relative; width:36px; height:20px; flex:none; }
      .tj-tqd-switch input { opacity:0; width:0; height:0; }
      .tj-tqd-switch-track { position:absolute; inset:0; background:rgba(255,255,255,.15); border-radius:999px; cursor:pointer; transition:background .15s ease; }
      .tj-tqd-switch input:checked + .tj-tqd-switch-track { background:#7612DA; }
      .tj-tqd-switch-thumb { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#fff; transition:transform .15s ease; }
      .tj-tqd-switch input:checked + .tj-tqd-switch-track .tj-tqd-switch-thumb { transform:translateX(16px); }
      .tj-tqd-modal-foot { padding:12px 18px; border-top:1px solid rgba(155,88,239,.3); display:flex; justify-content:space-between; align-items:center; gap:8px; }
      .tj-tqd-modal-hint { font-size:10.5px; color:#8a8aa0; }
      .tj-tqd-modal-save { border:1px solid rgba(155,88,239,.5); background:rgba(118,18,218,.18); color:#e3d3ff; border-radius:10px; padding:8px 14px; font-weight:800; cursor:pointer; transition:background .15s ease; }
      .tj-tqd-modal-save:hover { background:rgba(118,18,218,.35); }
      .tj-tqd-modal-save.tj-tqd-saved { background:#1f7a4f; border-color:#2fa86b; color:#d7ffe9; }
      .tj-tqd-modal-done { border:1px solid #7612DA; background:linear-gradient(135deg,#7612DA,#4d0aa8); color:#fff; border-radius:10px; padding:8px 16px; font-weight:800; cursor:pointer; }
    `;
    document.head.appendChild(style);
}

// ── Ring / score card HTML ──────────────────────────────────────────────────

function ringStyle(score) {
    const pct = Math.max(0, Math.min(1, score)) * 100;
    const color = scoreColor(score);
    return `background:conic-gradient(${color} ${pct}%, rgba(255,255,255,.10) ${pct}%);`;
}

function scoreCardHTML(label, score) {
    const color = scoreColor(score);
    return `
      <div class="tj-tqd-score-card">
        <div class="tj-tqd-ring" style="${ringStyle(score)}">
          <div class="tj-tqd-ring-num" style="color:${color};">${score.toFixed(2)}</div>
        </div>
        <div>
          <div class="tj-tqd-score-label">${label}</div>
          <div class="tj-tqd-score-value" style="color:${color};">${(score * 100).toFixed(0)}%</div>
        </div>
      </div>`;
}

// ── Settings modal — generic form built from the node's own widgets ────────

const HIDDEN_WIDGET_NAMES = new Set(["tj_tqd_preview"]);

function fieldHTML(widget, idx) {
    const id = `tj-tqd-f-${idx}`;
    const label = widget.name.replace(/_/g, " ");
    if (widget.type === "toggle") {
        return `
          <div class="tj-tqd-field tj-tqd-field-row">
            <label for="${id}">${label}</label>
            <div class="tj-tqd-switch">
              <input type="checkbox" id="${id}" ${widget.value ? "checked" : ""} />
              <label class="tj-tqd-switch-track" for="${id}"><span class="tj-tqd-switch-thumb"></span></label>
            </div>
          </div>`;
    }
    if (widget.type === "combo") {
        const values = Array.isArray(widget.options?.values) ? widget.options.values : (widget.options?.values?.() || []);
        const opts = values.map((v) => `<option value="${String(v).replace(/"/g, "&quot;")}" ${v === widget.value ? "selected" : ""}>${v}</option>`).join("");
        return `<div class="tj-tqd-field"><label for="${id}">${label}</label><select id="${id}">${opts}</select></div>`;
    }
    if (widget.type === "number") {
        const o = widget.options || {};
        return `<div class="tj-tqd-field"><label for="${id}">${label}</label><input type="number" id="${id}" value="${widget.value}" ${o.min != null ? `min="${o.min}"` : ""} ${o.max != null ? `max="${o.max}"` : ""} ${o.step != null ? `step="${o.step}"` : ""} /></div>`;
    }
    if (widget.type === "customtext" || (widget.type === "text" && widget.options?.multiline)) {
        return `<div class="tj-tqd-field"><label for="${id}">${label}</label><textarea id="${id}">${widget.value || ""}</textarea></div>`;
    }
    return `<div class="tj-tqd-field"><label for="${id}">${label}</label><input type="text" id="${id}" value="${widget.value ?? ""}" /></div>`;
}

function bindField(modal, widget, idx, node) {
    const el = modal.querySelector(`#tj-tqd-f-${idx}`);
    if (!el) return;
    const apply = (value) => {
        widget.value = value;
        widget.callback?.call(widget, value, app.canvas, node, null, null);
        node.setDirtyCanvas?.(true, true);
    };
    if (widget.type === "toggle") {
        el.addEventListener("change", () => apply(el.checked));
    } else if (widget.type === "number") {
        el.addEventListener("change", () => apply(Number(el.value)));
    } else {
        el.addEventListener("change", () => apply(el.value));
    }
}

function openSettingsModal(node) {
    const backdrop = document.createElement("div");
    backdrop.className = "tj-tqd-backdrop";
    backdrop.addEventListener("pointerdown", (e) => { if (e.target === backdrop) backdrop.remove(); });

    const settingWidgets = (node.widgets || []).filter((w) => !HIDDEN_WIDGET_NAMES.has(w.name) && w.type !== "custom");

    backdrop.innerHTML = `
      <div class="tj-tqd-modal">
        <div class="tj-tqd-modal-head">
          <div class="tj-tqd-modal-title">⚙️ TQD Score Estimate — Settings</div>
          <button class="tj-tqd-modal-close">✕</button>
        </div>
        <div class="tj-tqd-modal-body">
          ${settingWidgets.map((w, i) => fieldHTML(w, i)).join("")}
        </div>
        <div class="tj-tqd-modal-foot">
          <button class="tj-tqd-modal-save">💾 Save as Default</button>
          <button class="tj-tqd-modal-done">Done</button>
        </div>
      </div>`;

    settingWidgets.forEach((w, i) => bindField(backdrop, w, i, node));
    backdrop.querySelector(".tj-tqd-modal-close").addEventListener("click", () => backdrop.remove());
    backdrop.querySelector(".tj-tqd-modal-done").addEventListener("click", () => backdrop.remove());

    const saveBtn = backdrop.querySelector(".tj-tqd-modal-save");
    saveBtn.addEventListener("click", () => {
        const ok = saveSettingsFromNode(node, settingWidgets);
        saveBtn.textContent = ok ? "✓ Saved — new nodes will use this" : "저장 실패";
        saveBtn.classList.toggle("tj-tqd-saved", ok);
        setTimeout(() => {
            saveBtn.textContent = "💾 Save as Default";
            saveBtn.classList.remove("tj-tqd-saved");
        }, 1800);
    });

    document.body.appendChild(backdrop);
}

// ── Hide the raw widgets on the node body — they're only edited via the modal ──

function hideWidget(widget) {
    if (widget.__tjTqdHidden) return;
    widget.__tjTqdHidden = true;
    // ComfyUI's own hide mechanism — handles both canvas-drawn widgets AND DOM-backed
    // ones (multiline STRING fields render as a real <textarea>; zeroing computeSize
    // alone shrinks its layout slot but leaves the stray <textarea> element floating on
    // the canvas). `.hidden = true` is what the framework's DOM-widget manager itself
    // checks to actually detach/hide that element.
    widget.hidden = true;
    widget.computeSize = () => [0, -4];
    widget.draw = () => {};
    if (widget.element) widget.element.style.display = "none";
}

// ── Install ──────────────────────────────────────────────────────────────────

function installTQDUI(node) {
    if (node.__tjTqdInstalled) return;
    node.__tjTqdInstalled = true;
    installTQDStyle();

    // Applied here (nodeCreated) so a brand-new node picks up the saved defaults, but a
    // node restored from a saved workflow is unaffected — LiteGraph calls configure()
    // (which sets widget values from the workflow JSON) right after nodeCreated, so it
    // simply overwrites whatever we set here with the workflow's own serialized values.
    applySavedSettings(node);

    // Model backend / gguf / mmproj / sampling settings all move into the Settings
    // popup — the node body is reserved for the live preview, which is the whole point.
    (node.widgets || []).forEach((w) => {
        if (!HIDDEN_WIDGET_NAMES.has(w.name)) hideWidget(w);
    });

    const wrap = document.createElement("div");
    wrap.className = "tj-tqd-wrap";

    const topbar = document.createElement("div");
    topbar.className = "tj-tqd-topbar";
    const status = document.createElement("div");
    status.className = "tj-tqd-status";
    status.textContent = "대기 중";
    const gear = document.createElement("button");
    gear.className = "tj-tqd-gear";
    gear.textContent = "⚙";
    gear.title = "Settings";
    gear.addEventListener("click", () => openSettingsModal(node));
    topbar.appendChild(status);
    topbar.appendChild(gear);
    wrap.appendChild(topbar);

    const imgCard = document.createElement("div");
    imgCard.className = "tj-tqd-imgcard";
    imgCard.innerHTML = `
        <span class="tj-tqd-placeholder">이미지 대기 중</span>
        <span class="tj-tqd-corner tl"></span><span class="tj-tqd-corner tr"></span>
        <span class="tj-tqd-corner bl"></span><span class="tj-tqd-corner br"></span>`;
    wrap.appendChild(imgCard);

    const scores = document.createElement("div");
    scores.className = "tj-tqd-scores";
    scores.innerHTML = scoreCardHTML("structure", 0) + scoreCardHTML("detail", 0);
    wrap.appendChild(scores);

    const warning = document.createElement("div");
    warning.className = "tj-tqd-warning";
    warning.style.display = "none";
    wrap.appendChild(warning);

    node.__tjTqdStatusEl = status;
    node.__tjTqdImgCardEl = imgCard;
    node.__tjTqdScoresEl = scores;
    node.__tjTqdWarningEl = warning;

    const domWidget = node.addDOMWidget("tj_tqd_preview", "div", wrap, { serialize: false, hideOnZoom: false });
    // Fixed formula, NOT wrap.scrollHeight: the host div's own height is derived from
    // whatever computeSize returns, so measuring the (host-stretched) wrap's scrollHeight
    // is circular and collapses toward 0. These constants mirror the CSS above.
    const TOPBAR_H = 28, IMG_H = IMAGE_HEIGHT, SCORES_H = 84, WARNING_H = 40, GAP = 10, PAD = 16;
    domWidget.computeSize = (width) => {
        const warningVisible = node.__tjTqdWarningEl && node.__tjTqdWarningEl.style.display !== "none";
        let h = PAD + TOPBAR_H + GAP + IMG_H + GAP + SCORES_H;
        if (warningVisible) h += GAP + WARNING_H;
        return [width, h];
    };

    node.__tjTqdRender = () => {
        const minHeight = domWidget.computeSize(node.size ? node.size[0] : 340)[1] + 30;
        if (node.size && node.size[1] < minHeight) node.setSize([node.size[0], minHeight]);
        app.graph.setDirtyCanvas(true, true);
    };
    node.__tjTqdRender();
}

app.registerExtension({
    name: "TJ.TQDScoreEstimate.LivePreview",
    nodeCreated(node) {
        if (node?.type === NODE_TYPE || node?.comfyClass === NODE_TYPE) {
            installTQDUI(node);
        }
    },
});

api.addEventListener(PROGRESS_EVENT, (event) => {
    const p = event.detail || event;
    const node = app.graph._nodes?.find((n) => String(n.id) === String(p.node_id));
    if (!node || !node.__tjTqdInstalled) return;

    if (p.event === "start") {
        node.__tjTqdStatusEl.innerHTML = `0 / ${p.total || 0} <span class="tj-tqd-sub">준비 중...</span>`;
        node.__tjTqdWarningEl.style.display = "none";
        node.__tjTqdRender();
        return;
    }

    if (p.event === "start_item") {
        node.__tjTqdStatusEl.innerHTML = `${p.index + 1} / ${p.total} <span class="tj-tqd-sub">분석 중: ${p.filename || ""} (이미지당 13~30초 소요)</span>`;
        return;
    }

    if (p.event === "item") {
        const doneCount = p.index + 1;
        const tag = p.status === "error" ? "에러" : p.status === "skipped" ? "스킵" : "완료";
        node.__tjTqdStatusEl.innerHTML = `${doneCount} / ${p.total} <span class="tj-tqd-sub">${p.filename || ""} — ${tag}</span>`;

        if (p.thumbnail) {
            node.__tjTqdImgCardEl.innerHTML = `
                <img src="${p.thumbnail}" />
                <span class="tj-tqd-corner tl"></span><span class="tj-tqd-corner tr"></span>
                <span class="tj-tqd-corner bl"></span><span class="tj-tqd-corner br"></span>`;
        }

        if (p.status === "error") {
            node.__tjTqdScoresEl.innerHTML = `
              <div class="tj-tqd-score-card tj-tqd-error-card">⚠️ ${p.reasoning || "분석 실패"}</div>`;
        } else {
            node.__tjTqdScoresEl.innerHTML =
                scoreCardHTML("structure", p.structure_score || 0) + scoreCardHTML("detail", p.detail_score || 0);
        }
        node.__tjTqdRender();
        return;
    }

    if (p.event === "done") {
        node.__tjTqdStatusEl.innerHTML = `완료: ${p.scored} 채점 / ${p.skipped} 스킵 / ${p.error} 에러 <span class="tj-tqd-sub">(총 ${p.total})</span>`;
        if (p.mismatch_warning) {
            node.__tjTqdWarningEl.textContent = p.mismatch_warning.trim();
            node.__tjTqdWarningEl.style.display = "block";
        } else {
            node.__tjTqdWarningEl.style.display = "none";
        }
        node.__tjTqdRender();
    }
});
