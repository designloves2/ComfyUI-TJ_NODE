// TJ_PromptExcelLoader — thumbnail-grid browser for a TJ_PromptExcelLogger workbook.
// Single click selects a row (updates the hidden selected_id widget + highlight).
// Double click opens a detail popup to review/edit and save back to the sheet.
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const NODE_TYPE = "TJ_PromptExcelLoader";
const TJ_ACCENT = "#7612DA"; // reuse TJ_NODE's existing brand/accent color — no new palette
const GRID_MAX_HEIGHT = 360;

function installStyle() {
    if (document.getElementById("tj-pe-style")) return;
    const style = document.createElement("style");
    style.id = "tj-pe-style";
    style.textContent = `
      .tj-pe-wrap { display:flex; flex-direction:column; gap:8px; padding:8px; font-family:Arial,sans-serif; }
      .tj-pe-wrap > * { flex-shrink:0; }

      .tj-pe-topbar { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:2px; }
      .tj-pe-status { font-size:11px; font-weight:800; color:#ccc; }
      .tj-pe-refresh {
        flex:none; width:26px; height:26px; border-radius:8px; border:1px solid rgba(155,110,255,.4);
        background:#241a38; color:#d9c6ff; font-size:13px; cursor:pointer;
        display:flex; align-items:center; justify-content:center;
      }
      .tj-pe-refresh:hover { background:#3a2758; }

      .tj-pe-grid-area { max-height:${GRID_MAX_HEIGHT}px; overflow-y:auto; overscroll-behavior:contain; }
      .tj-pe-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:7%; }
      .tj-pe-cell {
        position:relative; aspect-ratio:1/1; border-radius:8px; overflow:hidden; cursor:pointer;
        background:rgba(255,255,255,.06); border:2px solid transparent;
        transition:transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
      }
      .tj-pe-cell img { width:100%; height:100%; object-fit:cover; display:block; }
      .tj-pe-cell:hover { box-shadow:0 0 0 2px rgba(118,18,218,.35) inset; }
      .tj-pe-cell.tj-pe-selected { border-color:${TJ_ACCENT}; transform:scale(1.03); }
      .tj-pe-cell .tj-pe-id-badge {
        position:absolute; bottom:2px; right:3px; font-size:9px; font-weight:800; color:#fff;
        background:rgba(0,0,0,.55); border-radius:4px; padding:1px 4px;
      }

      .tj-pe-empty {
        display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;
        padding:26px 10px; color:#666; font-size:11px;
      }
      .tj-pe-empty .tj-pe-empty-icon { font-size:22px; opacity:.5; }

      /* ── Detail modal ─────────────────────────────────────────────── */
      .tj-pe-backdrop { position:fixed; inset:0; background:rgba(6,4,12,.6); z-index:100000; display:flex; align-items:center; justify-content:center; font-family:Arial,sans-serif; opacity:0; transition:opacity 180ms ease; }
      .tj-pe-backdrop.tj-pe-open { opacity:1; }
      .tj-pe-modal { width:min(680px,92vw); max-height:86vh; background:#120c1c; border:1px solid rgba(155,88,239,.5); border-radius:16px; box-shadow:0 0 40px rgba(118,18,218,.35); display:flex; flex-direction:column; overflow:hidden; color:#eee; transform:scale(.97); transition:transform 180ms ease; }
      .tj-pe-backdrop.tj-pe-open .tj-pe-modal { transform:scale(1); }
      .tj-pe-modal-head { padding:14px 18px; border-bottom:1px solid rgba(155,88,239,.3); display:flex; justify-content:space-between; align-items:center; background:linear-gradient(135deg, rgba(118,18,218,.28), transparent); }
      .tj-pe-modal-title { font-size:14px; font-weight:900; color:#e3d3ff; }
      .tj-pe-modal-close { border:0; background:rgba(255,255,255,.08); color:#fff; border-radius:8px; width:26px; height:26px; cursor:pointer; font-size:14px; }
      .tj-pe-modal-body { display:flex; gap:16px; padding:16px 18px; overflow-y:auto; }
      .tj-pe-modal-img { flex:0 0 220px; aspect-ratio:1/1; border-radius:10px; overflow:hidden; background:rgba(255,255,255,.05); }
      .tj-pe-modal-img img { width:100%; height:100%; object-fit:cover; display:block; }
      .tj-pe-modal-form { flex:1; min-width:0; display:flex; flex-direction:column; gap:10px; }
      .tj-pe-field label { display:block; font-size:10.5px; font-weight:800; color:#b9a8e0; margin-bottom:4px; text-transform:uppercase; letter-spacing:.3px; }
      .tj-pe-field textarea, .tj-pe-field input {
        width:100%; box-sizing:border-box; background:#0a0713; color:#eee; border:1px solid rgba(155,88,239,.35);
        border-radius:8px; padding:7px 9px; font-size:12px; outline:none;
      }
      .tj-pe-field textarea { resize:vertical; min-height:44px; }
      .tj-pe-row2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .tj-pe-divider { border-top:1px solid rgba(255,255,255,.08); margin:2px 0; }
      .tj-pe-modal-foot { padding:12px 18px; border-top:1px solid rgba(155,88,239,.3); display:flex; justify-content:space-between; align-items:center; gap:8px; }
      .tj-pe-modal-error { color:#ff9d97; font-size:11px; font-weight:700; flex:1; }
      .tj-pe-modal-cancel { border:0; background:transparent; color:#999; font-weight:700; cursor:pointer; padding:8px 10px; }
      .tj-pe-modal-save { border:1px solid ${TJ_ACCENT}; background:linear-gradient(135deg,${TJ_ACCENT},#4d0aa8); color:#fff; border-radius:10px; padding:8px 18px; font-weight:800; cursor:pointer; }
      .tj-pe-modal-save.tj-pe-saved { background:#1f7a4f; border-color:#2fa86b; }
    `;
    document.head.appendChild(style);
}

function getW(node, name) {
    return node.widgets?.find((w) => w.name === name) ?? null;
}

function escapeAttr(s) {
    return String(s || "").replace(/"/g, "&quot;");
}

function cellHTML(row) {
    const thumb = row.thumbnail
        ? `<img src="${row.thumbnail}" loading="lazy" title="${escapeAttr(row.positive_prompt)}" />`
        : `<div style="width:100%;height:100%;"></div>`;
    return `<div class="tj-pe-cell" data-id="${row.id}">${thumb}<span class="tj-pe-id-badge">#${row.id}</span></div>`;
}

async function fetchRows(excelPath) {
    if (!excelPath) return [];
    try {
        const res = await api.fetchApi("/tj_node/prompt_excel/list_rows", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ excel_path: excelPath }),
        });
        const data = await res.json();
        return Array.isArray(data.rows) ? data.rows : [];
    } catch (err) {
        console.error("[TJ Prompt Excel] list_rows failed", err);
        return [];
    }
}

async function updateRow(excelPath, id, fields) {
    try {
        const res = await api.fetchApi("/tj_node/prompt_excel/update_row", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ excel_path: excelPath, id, fields }),
        });
        return await res.json();
    } catch (err) {
        return { ok: false, error: String(err) };
    }
}

function openDetailModal(node, row, onSaved) {
    const backdrop = document.createElement("div");
    backdrop.className = "tj-pe-backdrop";
    backdrop.innerHTML = `
      <div class="tj-pe-modal">
        <div class="tj-pe-modal-head">
          <div class="tj-pe-modal-title">🖼 Row #${row.id} — ${row.date || ""}</div>
          <button class="tj-pe-modal-close">✕</button>
        </div>
        <div class="tj-pe-modal-body">
          <div class="tj-pe-modal-img">${row.thumbnail ? `<img src="${row.thumbnail}" />` : ""}</div>
          <div class="tj-pe-modal-form">
            <div class="tj-pe-field"><label>Positive Prompt</label><textarea id="tj-pe-f-pos">${row.positive_prompt || ""}</textarea></div>
            <div class="tj-pe-field"><label>Negative Prompt</label><textarea id="tj-pe-f-neg">${row.negative_prompt || ""}</textarea></div>
            <div class="tj-pe-divider"></div>
            <div class="tj-pe-row2">
              <div class="tj-pe-field"><label>Model</label><input id="tj-pe-f-model" type="text" value="${escapeAttr(row.model_name)}" /></div>
              <div class="tj-pe-field"><label>Seed</label><input id="tj-pe-f-seed" type="number" value="${row.seed ?? 0}" /></div>
              <div class="tj-pe-field"><label>Steps</label><input id="tj-pe-f-steps" type="number" value="${row.steps ?? 0}" /></div>
              <div class="tj-pe-field"><label>CFG</label><input id="tj-pe-f-cfg" type="number" step="0.1" value="${row.cfg ?? 0}" /></div>
            </div>
            <div class="tj-pe-field"><label>Extra Settings</label><textarea id="tj-pe-f-extra">${row.extra_settings || ""}</textarea></div>
            <div class="tj-pe-divider"></div>
            <div class="tj-pe-field"><label>Source Path</label><input id="tj-pe-f-src" type="text" value="${escapeAttr(row.source_path)}" /></div>
          </div>
        </div>
        <div class="tj-pe-modal-foot">
          <div class="tj-pe-modal-error"></div>
          <button class="tj-pe-modal-cancel">Cancel</button>
          <button class="tj-pe-modal-save">Save</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("tj-pe-open"));

    const close = () => backdrop.remove();
    backdrop.querySelector(".tj-pe-modal-close").addEventListener("click", close);
    backdrop.querySelector(".tj-pe-modal-cancel").addEventListener("click", close);
    backdrop.addEventListener("pointerdown", (e) => { if (e.target === backdrop) close(); });

    const errEl = backdrop.querySelector(".tj-pe-modal-error");
    const saveBtn = backdrop.querySelector(".tj-pe-modal-save");
    saveBtn.addEventListener("click", async () => {
        errEl.textContent = "";
        saveBtn.textContent = "Saving...";
        const fields = {
            positive_prompt: backdrop.querySelector("#tj-pe-f-pos").value,
            negative_prompt: backdrop.querySelector("#tj-pe-f-neg").value,
            model_name: backdrop.querySelector("#tj-pe-f-model").value,
            seed: Number(backdrop.querySelector("#tj-pe-f-seed").value) || 0,
            steps: Number(backdrop.querySelector("#tj-pe-f-steps").value) || 0,
            cfg: Number(backdrop.querySelector("#tj-pe-f-cfg").value) || 0,
            extra_settings: backdrop.querySelector("#tj-pe-f-extra").value,
            source_path: backdrop.querySelector("#tj-pe-f-src").value,
        };
        const result = await updateRow(node.__tjPeExcelPath, row.id, fields);
        if (result.ok) {
            saveBtn.textContent = "✓ Saved";
            saveBtn.classList.add("tj-pe-saved");
            Object.assign(row, fields);
            onSaved?.(row);
            setTimeout(close, 700);
        } else {
            saveBtn.textContent = "Save";
            errEl.textContent = result.error || "Save failed — is the file open elsewhere?";
        }
    });
}

function installUI(node) {
    if (node.__tjPeInstalled) return;
    node.__tjPeInstalled = true;
    installStyle();

    const selectedWidget = getW(node, "selected_id");
    if (selectedWidget) {
        selectedWidget.hidden = true;
        selectedWidget.computeSize = () => [0, -4];
        selectedWidget.draw = () => {};
    }

    const wrap = document.createElement("div");
    wrap.className = "tj-pe-wrap";

    const topbar = document.createElement("div");
    topbar.className = "tj-pe-topbar";
    const status = document.createElement("div");
    status.className = "tj-pe-status";
    status.textContent = "excel_path를 입력하세요";
    const refreshBtn = document.createElement("button");
    refreshBtn.className = "tj-pe-refresh";
    refreshBtn.textContent = "⟳";
    refreshBtn.title = "Refresh";
    topbar.appendChild(status);
    topbar.appendChild(refreshBtn);
    wrap.appendChild(topbar);

    const gridArea = document.createElement("div");
    gridArea.className = "tj-pe-grid-area";
    const grid = document.createElement("div");
    grid.className = "tj-pe-grid";
    gridArea.appendChild(grid);
    wrap.appendChild(gridArea);

    node.__tjPeRows = [];
    node.__tjPeExcelPath = "";

    function renderEmpty(message) {
        grid.innerHTML = `<div class="tj-pe-empty" style="grid-column:1/-1;"><div class="tj-pe-empty-icon">🗂</div><div>${message}</div></div>`;
    }

    function applySelectionHighlight() {
        const selectedId = selectedWidget?.value ?? -1;
        grid.querySelectorAll(".tj-pe-cell").forEach((el) => {
            el.classList.toggle("tj-pe-selected", Number(el.dataset.id) === Number(selectedId));
        });
    }

    function selectRow(id) {
        if (selectedWidget) {
            selectedWidget.value = id;
            selectedWidget.callback?.call(selectedWidget, id);
        }
        applySelectionHighlight();
        node.setDirtyCanvas?.(true, true);
    }

    function renderGrid() {
        if (!node.__tjPeRows.length) {
            renderEmpty(node.__tjPeExcelPath ? "이 파일에 기록된 행이 없습니다" : "excel_path를 입력하세요");
            return;
        }
        grid.innerHTML = node.__tjPeRows.map(cellHTML).join("");
        applySelectionHighlight();
    }

    grid.addEventListener("click", (e) => {
        const cell = e.target.closest(".tj-pe-cell");
        if (!cell) return;
        selectRow(Number(cell.dataset.id));
    });
    grid.addEventListener("dblclick", (e) => {
        const cell = e.target.closest(".tj-pe-cell");
        if (!cell) return;
        const row = node.__tjPeRows.find((r) => r.id === Number(cell.dataset.id));
        if (!row) return;
        openDetailModal(node, row, () => renderGrid());
        selectRow(row.id);
    });

    async function refresh() {
        const excelPath = String(getW(node, "excel_path")?.value || "").trim();
        node.__tjPeExcelPath = excelPath;
        if (!excelPath) {
            status.textContent = "excel_path를 입력하세요";
            node.__tjPeRows = [];
            renderGrid();
            return;
        }
        status.textContent = "불러오는 중...";
        const rows = await fetchRows(excelPath);
        node.__tjPeRows = rows;
        status.textContent = `${rows.length}개 행`;
        renderGrid();
    }

    refreshBtn.addEventListener("click", refresh);

    const excelWidget = getW(node, "excel_path");
    if (excelWidget) {
        const origCb = excelWidget.callback;
        excelWidget.callback = function (value) {
            origCb?.call(this, value);
            refresh();
        };
    }

    node.addDOMWidget("tj_pe_gallery", "div", wrap, { serialize: false, hideOnZoom: false });

    // Fresh node vs. workflow restore — same timing consideration as TQD Score Estimate:
    // refresh() reads excel_path off the widget, so calling it here (post-configure via
    // setTimeout) works for both cases without needing a separate guard.
    setTimeout(refresh, 50);
}

app.registerExtension({
    name: "TJ.PromptExcelLoader.Gallery",
    nodeCreated(node) {
        if (node?.type === NODE_TYPE || node?.comfyClass === NODE_TYPE) {
            installUI(node);
        }
    },
});
