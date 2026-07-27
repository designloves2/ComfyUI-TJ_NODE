// TJ_PromptDBLoader — thumbnail-grid browser for a TJ_PromptDBSave workbook (PromptDB (TJ)).
// Single click selects a row (updates the hidden selected_id widget + highlight).
// Double click opens a detail popup to review/edit and save back to the sheet.
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const NODE_TYPE = "TJ_PromptDBLoader";
const TJ_ACCENT = "#7612DA"; // reuse TJ_NODE's existing brand/accent color — no new palette
const GRID_MAX_HEIGHT = 360;

function installStyle() {
    if (document.getElementById("tj-pdb-style")) return;
    const style = document.createElement("style");
    style.id = "tj-pdb-style";
    style.textContent = `
      .tj-pdb-wrap {
        display:flex; flex-direction:column; gap:8px; padding:10px; font-family:Arial,sans-serif;
        background:#17131f; border-radius:12px; border:1px solid rgba(155,88,239,.18);
      }
      .tj-pdb-wrap > * { flex-shrink:0; }

      .tj-pdb-toolbar { display:flex; align-items:center; gap:6px; }
      .tj-pdb-path-pill {
        flex:1; min-width:0; font-size:10.5px; font-weight:700; color:#a99bd0;
        background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:8px;
        padding:5px 9px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      }
      .tj-pdb-icon-btn {
        flex:none; width:26px; height:26px; border-radius:8px; border:1px solid rgba(155,110,255,.4);
        background:#241a38; color:#d9c6ff; font-size:13px; cursor:pointer;
        display:flex; align-items:center; justify-content:center; transition:background .15s ease;
      }
      .tj-pdb-icon-btn:hover { background:#3a2758; }

      .tj-pdb-search {
        width:100%; box-sizing:border-box; background:rgba(255,255,255,.04); color:#eee;
        border:1px solid rgba(255,255,255,.1); border-radius:9px; padding:7px 10px; font-size:11.5px; outline:none;
      }
      .tj-pdb-search::placeholder { color:#6b6480; }
      .tj-pdb-search:focus { border-color:rgba(155,88,239,.55); }

      .tj-pdb-status { text-align:center; font-size:10.5px; font-weight:700; color:#8a8299; }
      .tj-pdb-status b { color:#d9c6ff; font-weight:800; }

      .tj-pdb-grid-area { max-height:${GRID_MAX_HEIGHT}px; overflow-y:auto; overscroll-behavior:contain; padding:2px; }
      .tj-pdb-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
      .tj-pdb-cell {
        border-radius:10px; overflow:hidden; cursor:pointer;
        background:rgba(255,255,255,.035); border:2px solid transparent;
        transition:transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
      }
      .tj-pdb-cell-img { position:relative; aspect-ratio:1/1; background:rgba(255,255,255,.05); }
      .tj-pdb-cell-img img { width:100%; height:100%; object-fit:cover; display:block; }
      .tj-pdb-cell-id {
        position:absolute; top:4px; left:4px; font-size:9px; font-weight:800; color:#fff;
        background:rgba(0,0,0,.55); border-radius:5px; padding:1px 5px;
      }
      .tj-pdb-cell-caption {
        font-size:9.5px; color:#a99bd0; padding:5px 6px; line-height:1.3;
        display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
      }
      .tj-pdb-cell:hover { box-shadow:0 0 0 2px rgba(118,18,218,.3) inset; }
      .tj-pdb-cell.tj-pdb-selected { border-color:${TJ_ACCENT}; transform:scale(1.02); }
      .tj-pdb-cell.tj-pdb-selected .tj-pdb-cell-caption { color:#e3d3ff; }

      .tj-pdb-empty {
        display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;
        padding:26px 10px; color:#666; font-size:11px;
      }
      .tj-pdb-empty .tj-pdb-empty-icon { font-size:22px; opacity:.5; }

      /* ── Detail modal ─────────────────────────────────────────────── */
      .tj-pdb-backdrop { position:fixed; inset:0; background:rgba(6,4,12,.6); z-index:100000; display:flex; align-items:center; justify-content:center; font-family:Arial,sans-serif; opacity:0; transition:opacity 180ms ease; }
      .tj-pdb-backdrop.tj-pdb-open { opacity:1; }
      .tj-pdb-modal { width:min(680px,92vw); max-height:86vh; background:#120c1c; border:1px solid rgba(155,88,239,.5); border-radius:16px; box-shadow:0 0 40px rgba(118,18,218,.35); display:flex; flex-direction:column; overflow:hidden; color:#eee; transform:scale(.97); transition:transform 180ms ease; }
      .tj-pdb-backdrop.tj-pdb-open .tj-pdb-modal { transform:scale(1); }
      .tj-pdb-modal-head { padding:14px 18px; border-bottom:1px solid rgba(155,88,239,.3); display:flex; justify-content:space-between; align-items:center; background:linear-gradient(135deg, rgba(118,18,218,.28), transparent); }
      .tj-pdb-modal-title { font-size:14px; font-weight:900; color:#e3d3ff; }
      .tj-pdb-modal-close { border:0; background:rgba(255,255,255,.08); color:#fff; border-radius:8px; width:26px; height:26px; cursor:pointer; font-size:14px; }
      .tj-pdb-modal-body { display:flex; gap:16px; padding:16px 18px; overflow-y:auto; }
      .tj-pdb-modal-img { flex:0 0 220px; aspect-ratio:1/1; border-radius:10px; overflow:hidden; background:rgba(255,255,255,.05); }
      .tj-pdb-modal-img img { width:100%; height:100%; object-fit:cover; display:block; }
      .tj-pdb-modal-form { flex:1; min-width:0; display:flex; flex-direction:column; gap:10px; }
      .tj-pdb-field label { display:block; font-size:10.5px; font-weight:800; color:#b9a8e0; margin-bottom:4px; text-transform:uppercase; letter-spacing:.3px; }
      .tj-pdb-field textarea, .tj-pdb-field input {
        width:100%; box-sizing:border-box; background:#0a0713; color:#eee; border:1px solid rgba(155,88,239,.35);
        border-radius:8px; padding:7px 9px; font-size:12px; outline:none;
      }
      .tj-pdb-field textarea { resize:vertical; min-height:44px; }
      .tj-pdb-row2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .tj-pdb-divider { border-top:1px solid rgba(255,255,255,.08); margin:2px 0; }
      .tj-pdb-modal-foot { padding:12px 18px; border-top:1px solid rgba(155,88,239,.3); display:flex; justify-content:space-between; align-items:center; gap:8px; }
      .tj-pdb-modal-error { color:#ff9d97; font-size:11px; font-weight:700; flex:1; }
      .tj-pdb-modal-cancel { border:0; background:transparent; color:#999; font-weight:700; cursor:pointer; padding:8px 10px; }
      .tj-pdb-modal-save { border:1px solid ${TJ_ACCENT}; background:linear-gradient(135deg,${TJ_ACCENT},#4d0aa8); color:#fff; border-radius:10px; padding:8px 18px; font-weight:800; cursor:pointer; }
      .tj-pdb-modal-save.tj-pdb-saved { background:#1f7a4f; border-color:#2fa86b; }
    `;
    document.head.appendChild(style);
}

function getW(node, name) {
    return node.widgets?.find((w) => w.name === name) ?? null;
}

function escapeAttr(s) {
    return String(s || "").replace(/"/g, "&quot;");
}

function escapeHTML(s) {
    return String(s || "").replace(/[&<>"']/g, (m) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[m]));
}

function truncate(text, max) {
    const s = String(text || "");
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function cellHTML(row) {
    const thumb = row.thumbnail ? `<img src="${row.thumbnail}" loading="lazy" />` : "";
    const caption = truncate(row.positive_prompt, 48) || "(no prompt)";
    return `
      <div class="tj-pdb-cell" data-id="${row.id}" title="${escapeAttr(row.positive_prompt)}">
        <div class="tj-pdb-cell-img">${thumb}<span class="tj-pdb-cell-id">#${row.id}</span></div>
        <div class="tj-pdb-cell-caption">${escapeHTML(caption)}</div>
      </div>`;
}

async function fetchRows(excelPath) {
    if (!excelPath) return [];
    try {
        const res = await api.fetchApi("/tj_node/promptdb/list_rows", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ excel_path: excelPath }),
        });
        const data = await res.json();
        return Array.isArray(data.rows) ? data.rows : [];
    } catch (err) {
        console.error("[TJ PromptDB] list_rows failed", err);
        return [];
    }
}

async function updateRow(excelPath, id, fields) {
    try {
        const res = await api.fetchApi("/tj_node/promptdb/update_row", {
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
    backdrop.className = "tj-pdb-backdrop";
    backdrop.innerHTML = `
      <div class="tj-pdb-modal">
        <div class="tj-pdb-modal-head">
          <div class="tj-pdb-modal-title">🖼 Row #${row.id} — ${row.date || ""}</div>
          <button class="tj-pdb-modal-close">✕</button>
        </div>
        <div class="tj-pdb-modal-body">
          <div class="tj-pdb-modal-img">${row.thumbnail ? `<img src="${row.thumbnail}" />` : ""}</div>
          <div class="tj-pdb-modal-form">
            <div class="tj-pdb-field"><label>Positive Prompt</label><textarea id="tj-pdb-f-pos">${row.positive_prompt || ""}</textarea></div>
            <div class="tj-pdb-field"><label>Negative Prompt</label><textarea id="tj-pdb-f-neg">${row.negative_prompt || ""}</textarea></div>
            <div class="tj-pdb-divider"></div>
            <div class="tj-pdb-row2">
              <div class="tj-pdb-field"><label>Model</label><input id="tj-pdb-f-model" type="text" value="${escapeAttr(row.model_name)}" /></div>
              <div class="tj-pdb-field"><label>Seed</label><input id="tj-pdb-f-seed" type="number" value="${row.seed ?? 0}" /></div>
              <div class="tj-pdb-field"><label>Steps</label><input id="tj-pdb-f-steps" type="number" value="${row.steps ?? 0}" /></div>
              <div class="tj-pdb-field"><label>CFG</label><input id="tj-pdb-f-cfg" type="number" step="0.1" value="${row.cfg ?? 0}" /></div>
            </div>
            <div class="tj-pdb-field"><label>Extra Settings</label><textarea id="tj-pdb-f-extra">${row.extra_settings || ""}</textarea></div>
            <div class="tj-pdb-divider"></div>
            <div class="tj-pdb-field"><label>Source Path</label><input id="tj-pdb-f-src" type="text" value="${escapeAttr(row.source_path)}" /></div>
          </div>
        </div>
        <div class="tj-pdb-modal-foot">
          <div class="tj-pdb-modal-error"></div>
          <button class="tj-pdb-modal-cancel">Cancel</button>
          <button class="tj-pdb-modal-save">Save</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("tj-pdb-open"));

    const close = () => backdrop.remove();
    backdrop.querySelector(".tj-pdb-modal-close").addEventListener("click", close);
    backdrop.querySelector(".tj-pdb-modal-cancel").addEventListener("click", close);
    backdrop.addEventListener("pointerdown", (e) => { if (e.target === backdrop) close(); });

    const errEl = backdrop.querySelector(".tj-pdb-modal-error");
    const saveBtn = backdrop.querySelector(".tj-pdb-modal-save");
    saveBtn.addEventListener("click", async () => {
        errEl.textContent = "";
        saveBtn.textContent = "Saving...";
        const fields = {
            positive_prompt: backdrop.querySelector("#tj-pdb-f-pos").value,
            negative_prompt: backdrop.querySelector("#tj-pdb-f-neg").value,
            model_name: backdrop.querySelector("#tj-pdb-f-model").value,
            seed: Number(backdrop.querySelector("#tj-pdb-f-seed").value) || 0,
            steps: Number(backdrop.querySelector("#tj-pdb-f-steps").value) || 0,
            cfg: Number(backdrop.querySelector("#tj-pdb-f-cfg").value) || 0,
            extra_settings: backdrop.querySelector("#tj-pdb-f-extra").value,
            source_path: backdrop.querySelector("#tj-pdb-f-src").value,
        };
        const result = await updateRow(node.__tjPdbExcelPath, row.id, fields);
        if (result.ok) {
            saveBtn.textContent = "✓ Saved";
            saveBtn.classList.add("tj-pdb-saved");
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
    if (node.__tjPdbInstalled) return;
    node.__tjPdbInstalled = true;
    installStyle();

    const selectedWidget = getW(node, "selected_id");
    if (selectedWidget) {
        selectedWidget.hidden = true;
        selectedWidget.computeSize = () => [0, -4];
        selectedWidget.draw = () => {};
    }

    const wrap = document.createElement("div");
    wrap.className = "tj-pdb-wrap";

    const toolbar = document.createElement("div");
    toolbar.className = "tj-pdb-toolbar";
    const pathPill = document.createElement("div");
    pathPill.className = "tj-pdb-path-pill";
    pathPill.textContent = "excel_path를 입력하세요";
    const refreshBtn = document.createElement("button");
    refreshBtn.className = "tj-pdb-icon-btn";
    refreshBtn.textContent = "⟳";
    refreshBtn.title = "Refresh";
    toolbar.appendChild(pathPill);
    toolbar.appendChild(refreshBtn);
    wrap.appendChild(toolbar);

    const search = document.createElement("input");
    search.className = "tj-pdb-search";
    search.type = "text";
    search.placeholder = "🔍 프롬프트 검색...";
    wrap.appendChild(search);

    const status = document.createElement("div");
    status.className = "tj-pdb-status";
    status.textContent = "";
    wrap.appendChild(status);

    const gridArea = document.createElement("div");
    gridArea.className = "tj-pdb-grid-area";
    const grid = document.createElement("div");
    grid.className = "tj-pdb-grid";
    gridArea.appendChild(grid);
    wrap.appendChild(gridArea);

    node.__tjPdbRows = [];
    node.__tjPdbExcelPath = "";

    function renderEmpty(message) {
        grid.innerHTML = `<div class="tj-pdb-empty" style="grid-column:1/-1;"><div class="tj-pdb-empty-icon">🗂</div><div>${message}</div></div>`;
    }

    function applySelectionHighlight() {
        const selectedId = selectedWidget?.value ?? -1;
        grid.querySelectorAll(".tj-pdb-cell").forEach((el) => {
            el.classList.toggle("tj-pdb-selected", Number(el.dataset.id) === Number(selectedId));
        });
    }

    function updateStatusLine(visibleCount) {
        const selectedId = selectedWidget?.value ?? -1;
        const selectedText = selectedId >= 0 ? `Selected: <b>#${selectedId}</b> | ` : "";
        status.innerHTML = `${selectedText}<b>${visibleCount}</b>개 행`;
    }

    function selectRow(id) {
        if (selectedWidget) {
            selectedWidget.value = id;
            selectedWidget.callback?.call(selectedWidget, id);
        }
        applySelectionHighlight();
        updateStatusLine(getVisibleRows().length);
        node.setDirtyCanvas?.(true, true);
    }

    function getVisibleRows() {
        const q = search.value.trim().toLowerCase();
        if (!q) return node.__tjPdbRows;
        return node.__tjPdbRows.filter((r) =>
            String(r.positive_prompt || "").toLowerCase().includes(q) ||
            String(r.model_name || "").toLowerCase().includes(q) ||
            String(r.negative_prompt || "").toLowerCase().includes(q)
        );
    }

    function renderGrid() {
        const visible = getVisibleRows();
        updateStatusLine(visible.length);
        if (!visible.length) {
            renderEmpty(node.__tjPdbExcelPath
                ? (node.__tjPdbRows.length ? "검색 결과가 없습니다" : "이 파일에 기록된 행이 없습니다")
                : "excel_path를 입력하세요");
            return;
        }
        grid.innerHTML = visible.map(cellHTML).join("");
        applySelectionHighlight();
    }

    grid.addEventListener("click", (e) => {
        const cell = e.target.closest(".tj-pdb-cell");
        if (!cell) return;
        selectRow(Number(cell.dataset.id));
    });
    grid.addEventListener("dblclick", (e) => {
        const cell = e.target.closest(".tj-pdb-cell");
        if (!cell) return;
        const row = node.__tjPdbRows.find((r) => r.id === Number(cell.dataset.id));
        if (!row) return;
        openDetailModal(node, row, () => renderGrid());
        selectRow(row.id);
    });
    search.addEventListener("input", renderGrid);

    async function refresh() {
        const excelPath = String(getW(node, "excel_path")?.value || "").trim();
        node.__tjPdbExcelPath = excelPath;
        pathPill.textContent = excelPath || "excel_path를 입력하세요";
        pathPill.title = excelPath;
        if (!excelPath) {
            node.__tjPdbRows = [];
            renderGrid();
            return;
        }
        status.textContent = "불러오는 중...";
        const rows = await fetchRows(excelPath);
        node.__tjPdbRows = rows;
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

    node.addDOMWidget("tj_promptdb_gallery", "div", wrap, { serialize: false, hideOnZoom: false });

    // Fresh node vs. workflow restore — same timing consideration as TQD Score Estimate:
    // refresh() reads excel_path off the widget, so calling it here (post-configure via
    // setTimeout) works for both cases without needing a separate guard.
    setTimeout(refresh, 50);
}

app.registerExtension({
    name: "TJ.PromptDBLoader.Gallery",
    nodeCreated(node) {
        if (node?.type === NODE_TYPE || node?.comfyClass === NODE_TYPE) {
            installUI(node);
        }
    },
});
