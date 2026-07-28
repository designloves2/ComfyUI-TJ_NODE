// TJ_PromptDBLoader — thumbnail-grid browser for a TJ_PromptDBSave workbook (PromptDB (TJ)).
// Single click selects a row (updates the hidden selected_id widget + highlight).
// Double click opens a detail popup to review/edit and save back to the sheet.
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const NODE_TYPE = "TJ_PromptDBLoader";
// Pushed by the backend after any write to a workbook (see UPDATED_EVENT in promptdb.py).
const UPDATED_EVENT = "tj_promptdb_updated";
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
        height:100%; box-sizing:border-box;
      }
      .tj-pdb-wrap > * { flex-shrink:0; }
      .tj-pdb-wrap > .tj-pdb-grid-area { flex:1 1 auto; min-height:0; }

      .tj-pdb-toolbar { display:flex; align-items:center; gap:6px; }
      .tj-pdb-icon-btn {
        flex:none; width:30px; height:30px; border-radius:8px; border:1px solid rgba(155,110,255,.4);
        background:#241a38; color:#d9c6ff; font-size:13px; cursor:pointer;
        display:flex; align-items:center; justify-content:center; transition:background .15s ease;
      }
      .tj-pdb-icon-btn:hover { background:#3a2758; }

      .tj-pdb-search {
        flex:1; min-width:0; box-sizing:border-box; background:rgba(255,255,255,.04); color:#eee;
        border:1px solid rgba(255,255,255,.1); border-radius:9px; padding:7px 10px; font-size:11.5px; outline:none;
      }
      .tj-pdb-search::placeholder { color:#6b6480; }
      .tj-pdb-search:focus { border-color:rgba(155,88,239,.55); }

      .tj-pdb-status { text-align:center; font-size:10.5px; font-weight:700; color:#8a8299; }
      .tj-pdb-status b { color:#d9c6ff; font-weight:800; }

      .tj-pdb-grid-area { overflow-y:auto; overscroll-behavior:contain; padding:2px; }
      .tj-pdb-grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; }
      /* Card layout matches NO8D-Prompt-libraries' reference: padded outer card, square
         image, caption as its own bold centered label block below (wraps, never truncates
         mid-word — you should be able to tell what a card is at a glance). */
      .tj-pdb-cell {
        position:relative; display:flex; flex-direction:column; width:100%; min-width:0;
        box-sizing:border-box; padding:4px; border-radius:8px; overflow:hidden; cursor:pointer;
        background:#1b1622; border:2px solid transparent;
        transition:border-color 150ms ease, box-shadow 150ms ease;
      }
      .tj-pdb-cell-img { position:relative; aspect-ratio:1/1; flex:0 0 auto; background:#0d0a12; border-radius:6px; overflow:hidden; }
      .tj-pdb-cell-img img { width:100%; height:100%; object-fit:cover; display:block; }
      .tj-pdb-cell-id {
        position:absolute; top:4px; left:4px; font-size:9px; font-weight:800; color:#fff;
        background:rgba(0,0,0,.55); border-radius:5px; padding:1px 5px;
      }
      /* Fixed height (not min-height) so every card in the grid lines up evenly regardless
         of how long its prompt text is — 2 lines shown, the rest clipped with an ellipsis. */
      .tj-pdb-cell-caption {
        display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
        text-align:center;
        height:42px; max-height:42px; margin-top:4px; padding:6px 6px; border-radius:0 0 5px 5px;
        background:#24202e; color:#f0eafb; font-size:10.5px; font-weight:700; line-height:1.25;
        overflow:hidden; overflow-wrap:anywhere; box-sizing:border-box;
      }
      .tj-pdb-cell:hover { border-color:rgba(118,18,218,.4); }
      .tj-pdb-cell.tj-pdb-selected { border-color:${TJ_ACCENT}; box-shadow:0 0 0 1px ${TJ_ACCENT}; }
      .tj-pdb-cell.tj-pdb-selected .tj-pdb-cell-caption { background:rgba(118,18,218,.28); color:#fff; }

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
      /* align-items:flex-start is required — the default "stretch" would otherwise force
         .tj-pdb-modal-img to match its taller sibling's height, silently overriding its
         aspect-ratio:1/1 and stretching the image tall/narrow instead of square. */
      .tj-pdb-modal-body { display:flex; align-items:flex-start; gap:16px; padding:16px 18px; overflow-y:auto; }
      .tj-pdb-modal-imgcol { flex:0 0 220px; display:flex; flex-direction:column; gap:8px; align-self:flex-start; }
      .tj-pdb-modal-img { width:220px; aspect-ratio:1/1; border-radius:10px; overflow:hidden; background:rgba(255,255,255,.05); }
      .tj-pdb-thumb-replace {
        border:1px solid rgba(155,110,255,.4); background:#241a38; color:#d9c6ff;
        border-radius:8px; padding:7px 10px; font-size:11px; font-weight:700; cursor:pointer;
      }
      .tj-pdb-thumb-replace:hover { background:#3a2758; }

      /* ── output-only image picker (thumbnail replacement) ─────────────── */
      .tj-pdb-pick-modal { width:min(720px,94vw); }
      .tj-pdb-pick-nav {
        display:flex; align-items:center; gap:10px; padding:8px 18px;
        border-bottom:1px solid rgba(255,255,255,.06);
      }
      .tj-pdb-pick-back {
        border:1px solid rgba(155,110,255,.4); background:#241a38; color:#d9c6ff;
        border-radius:7px; padding:4px 10px; font-size:11px; cursor:pointer;
      }
      .tj-pdb-pick-back:disabled { opacity:.35; cursor:default; }
      .tj-pdb-pick-path { font-size:10.5px; color:#8a8299; overflow-wrap:anywhere; }
      .tj-pdb-pick-grid {
        display:grid; grid-template-columns:repeat(auto-fill, minmax(110px,1fr)); gap:8px;
        padding:12px 18px 18px; overflow-y:auto; max-height:58vh;
      }
      .tj-pdb-pick-cell {
        display:flex; flex-direction:column; gap:4px; padding:4px; border-radius:8px;
        background:#1b1622; border:2px solid transparent; cursor:pointer;
      }
      .tj-pdb-pick-cell:hover { border-color:rgba(118,18,218,.5); }
      .tj-pdb-pick-cell img {
        width:100%; aspect-ratio:1/1; object-fit:cover; display:block;
        border-radius:6px; background:#0d0a12;
      }
      .tj-pdb-pick-folder-icon {
        display:flex; align-items:center; justify-content:center;
        aspect-ratio:1/1; font-size:34px; background:#0d0a12; border-radius:6px;
      }
      .tj-pdb-pick-name {
        font-size:9.5px; color:#c9c1da; text-align:center;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      }
      .tj-pdb-modal-img img { width:100%; height:100%; object-fit:cover; display:block; }
      .tj-pdb-modal-form { flex:1; min-width:0; display:flex; flex-direction:column; gap:10px; }
      .tj-pdb-field label { display:block; font-size:10.5px; font-weight:800; color:#b9a8e0; margin-bottom:4px; text-transform:uppercase; letter-spacing:.3px; }
      .tj-pdb-field textarea, .tj-pdb-field input {
        width:100%; box-sizing:border-box; background:#0a0713; color:#eee; border:1px solid rgba(155,88,239,.35);
        border-radius:8px; padding:7px 9px; font-size:12px; outline:none;
      }
      .tj-pdb-field textarea { resize:vertical; min-height:44px; }
      .tj-pdb-field textarea.tj-pdb-textarea-main { min-height:180px; }
      .tj-pdb-row2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .tj-pdb-divider { border-top:1px solid rgba(255,255,255,.08); margin:2px 0; }
      .tj-pdb-modal-foot { padding:12px 18px; border-top:1px solid rgba(155,88,239,.3); display:flex; justify-content:space-between; align-items:center; gap:8px; }
      .tj-pdb-modal-error { color:#ff9d97; font-size:11px; font-weight:700; flex:1; }
      .tj-pdb-modal-cancel { border:0; background:transparent; color:#999; font-weight:700; cursor:pointer; padding:8px 10px; }
      .tj-pdb-modal-save { border:1px solid ${TJ_ACCENT}; background:linear-gradient(135deg,${TJ_ACCENT},#4d0aa8); color:#fff; border-radius:10px; padding:8px 18px; font-weight:800; cursor:pointer; }
      .tj-pdb-modal-save.tj-pdb-saved { background:#1f7a4f; border-color:#2fa86b; }
      /* Destructive actions sit apart from Cancel/Save so Delete can't be hit by muscle
         memory aimed at the primary button. */
      .tj-pdb-modal-delete {
        margin-right:auto; border:1px solid rgba(224,90,90,.5); background:rgba(224,90,90,.12);
        color:#ffb3ae; border-radius:9px; padding:7px 14px; font-weight:800; font-size:11.5px; cursor:pointer;
      }
      .tj-pdb-modal-delete:hover { background:rgba(224,90,90,.28); border-color:#e05a5a; }
      .tj-pdb-modal-save.tj-pdb-danger {
        background:linear-gradient(135deg,#c0392b,#7d1d13); border-color:#e05a5a;
      }

      /* ── Library pill + Library tabs modal ────────────────────────── */
      .tj-pdb-lib-pill {
        flex:1; min-width:0; display:flex; align-items:center; gap:6px; cursor:pointer;
        background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1); border-radius:9px;
        padding:6px 10px; font-size:11.5px; font-weight:700; color:#e3d3ff; transition:background .15s ease;
      }
      .tj-pdb-lib-pill:hover { background:rgba(255,255,255,.08); }
      .tj-pdb-lib-pill .tj-pdb-lib-icon { flex:none; }
      .tj-pdb-lib-pill .tj-pdb-lib-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .tj-pdb-lib-pill .tj-pdb-lib-name.tj-pdb-lib-empty { color:#6b6480; font-weight:600; }

      .tj-pdb-lib-modal { width:min(560px,92vw); }
      .tj-pdb-lib-body { padding:10px 18px 18px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; max-height:60vh; }
      .tj-pdb-lib-import {
        align-self:flex-start; border:1px solid ${TJ_ACCENT}; background:rgba(118,18,218,.18); color:#e3d3ff;
        border-radius:9px; padding:7px 14px; font-weight:800; font-size:12px; cursor:pointer; margin-bottom:4px;
      }
      .tj-pdb-lib-import:hover { background:rgba(118,18,218,.32); }
      .tj-pdb-lib-row {
        display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px;
        background:rgba(255,255,255,.035); border:1px solid rgba(255,255,255,.06); cursor:pointer;
        transition:background .15s ease, border-color .15s ease;
      }
      .tj-pdb-lib-row:hover { background:rgba(118,18,218,.12); border-color:rgba(155,88,239,.3); }
      .tj-pdb-lib-row.tj-pdb-lib-active { border-color:${TJ_ACCENT}; background:rgba(118,18,218,.18); }
      .tj-pdb-lib-row.tj-pdb-lib-inactive { opacity:.5; }
      .tj-pdb-lib-row.tj-pdb-lib-inactive .tj-pdb-lib-title { text-decoration:line-through; text-decoration-color:rgba(255,255,255,.35); }
      .tj-pdb-lib-drag { flex:none; color:#666; cursor:grab; font-size:13px; letter-spacing:-2px; }
      .tj-pdb-lib-toggle { flex:none; display:flex; align-items:center; cursor:pointer; }
      .tj-pdb-lib-toggle input { width:15px; height:15px; accent-color:${TJ_ACCENT}; cursor:pointer; }
      .tj-pdb-lib-info { flex:1; min-width:0; }
      .tj-pdb-lib-info .tj-pdb-lib-title { font-weight:800; color:#eee; font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .tj-pdb-lib-info .tj-pdb-lib-count { font-size:10px; color:#8a8299; margin-top:1px; }
      .tj-pdb-lib-export, .tj-pdb-lib-del {
        flex:none; width:24px; height:24px; border-radius:7px; border:1px solid rgba(255,255,255,.15);
        background:rgba(255,255,255,.05); color:#bbb; cursor:pointer; font-size:12px;
      }
      .tj-pdb-lib-export:hover { background:rgba(118,18,218,.3); border-color:${TJ_ACCENT}; color:#e3d3ff; }
      .tj-pdb-lib-del:hover { background:rgba(224,90,90,.25); border-color:#e05a5a; color:#ffb3ae; }
      .tj-pdb-lib-empty2 { text-align:center; color:#666; font-size:11.5px; padding:20px 10px; }

      /* ── Quick-switch popup (pill click) — lightweight, active libraries only ───────── */
      .tj-pdb-quickmenu {
        position:absolute; top:calc(100% + 4px); left:0; right:34px; z-index:1000;
        background:#1c1628; border:1px solid rgba(155,88,239,.4); border-radius:10px;
        box-shadow:0 8px 24px rgba(0,0,0,.5); padding:6px; max-height:260px; overflow-y:auto;
      }
      .tj-pdb-quickmenu-row {
        display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:7px; cursor:pointer;
        font-size:11.5px; font-weight:700; color:#ddd;
      }
      .tj-pdb-quickmenu-row:hover { background:rgba(118,18,218,.2); }
      .tj-pdb-quickmenu-row.tj-pdb-lib-active { color:#e3d3ff; background:rgba(118,18,218,.14); }
      .tj-pdb-quickmenu-text { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
      .tj-pdb-quickmenu-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      /* The name alone doesn't say which file a run gets written to — show the path too. */
      .tj-pdb-quickmenu-file {
        font-size:9.5px; font-weight:600; color:#7d7590;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      }
      .tj-pdb-quickmenu-settings {
        width:100%; margin-top:4px; border:0; border-top:1px solid rgba(255,255,255,.08); background:transparent;
        color:#8a8299; font-size:10.5px; font-weight:700; padding:8px 6px 4px; cursor:pointer; text-align:center;
      }
      .tj-pdb-quickmenu-settings:hover { color:#e3d3ff; }

      /* ── Folder/file browser modal (native tkinter dialog unavailable — embedded
         Python ships without it) ─────────────────────────────────────────────── */
      .tj-pdb-browse-modal { width:min(520px,92vw); }
      .tj-pdb-browse-path {
        padding:8px 18px; font-size:10.5px; color:#8a8299; border-bottom:1px solid rgba(255,255,255,.06);
        overflow-wrap:anywhere;
      }
      .tj-pdb-browse-list { padding:6px 10px; overflow-y:auto; max-height:50vh; }
      .tj-pdb-browse-row {
        padding:8px 10px; border-radius:8px; font-size:12px; color:#ddd; cursor:pointer;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      .tj-pdb-browse-row:hover { background:rgba(118,18,218,.18); }
      .tj-pdb-browse-row.tj-pdb-browse-file { color:#e3d3ff; font-weight:700; }
      /* ── askText / notify (in-app replacements for prompt/alert) ───────────── */
      .tj-pdb-ask-modal { width:min(400px,92vw); }
      .tj-pdb-ask-body { padding:16px 18px; }
      .tj-pdb-ask-input {
        width:100%; box-sizing:border-box; background:#0a0713; color:#eee;
        border:1px solid rgba(155,88,239,.35); border-radius:8px; padding:9px 11px;
        font-size:13px; outline:none;
      }
      .tj-pdb-ask-input:focus { border-color:${TJ_ACCENT}; }
      .tj-pdb-ask-message { color:#ddd; font-size:12.5px; line-height:1.5; overflow-wrap:anywhere; }

      .tj-pdb-browse-actionbar { display:flex; gap:8px; padding:8px 18px 10px; }
      .tj-pdb-browse-mkdir {
        border:1px solid rgba(155,110,255,.4); background:#241a38; color:#d9c6ff;
        border-radius:8px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer;
      }
      .tj-pdb-browse-mkdir:hover { background:#3a2758; }
      .tj-pdb-browse-savebar { display:flex; gap:8px; padding:12px 18px; border-top:1px solid rgba(155,88,239,.3); }
      .tj-pdb-browse-filename {
        flex:1; min-width:0; box-sizing:border-box; background:#0a0713; color:#eee; border:1px solid rgba(155,88,239,.35);
        border-radius:8px; padding:7px 9px; font-size:12px; outline:none;
      }
      .tj-pdb-browse-savebtn {
        flex:none; border:1px solid ${TJ_ACCENT}; background:linear-gradient(135deg,${TJ_ACCENT},#4d0aa8); color:#fff;
        border-radius:8px; padding:7px 16px; font-weight:800; cursor:pointer;
      }
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
    const caption = truncate(row.positive_prompt, 90) || "(no prompt)";
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

// ── Library list: named shortcuts to excel_path files, so nobody has to type/remember
// a full path again. Shared with TJ_PromptDBSave's UI (promptdb_save_tj.js). ─────────

let cachedRoot = "";

export async function fetchLibraries() {
    try {
        const res = await api.fetchApi("/tj_node/promptdb/libraries");
        const data = await res.json();
        if (data.root) cachedRoot = data.root;
        return Array.isArray(data.libraries) ? data.libraries : [];
    } catch (err) {
        return [];
    }
}

// Stored library paths are relative to the sandbox root, but the file picker hands back
// absolute ones — comparing the two forms directly makes every "is this already
// registered?" check fail. Normalise both to the same lowercase, forward-slash relative
// form before comparing.
export function normalizeLibPath(path) {
    let p = String(path || "").replace(/\\/g, "/");
    const root = String(cachedRoot || "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (root && p.toLowerCase().startsWith(root.toLowerCase() + "/")) {
        p = p.slice(root.length + 1);
    }
    return p.replace(/^\/+/, "").toLowerCase();
}

export function sameLibraryPath(a, b) {
    return normalizeLibPath(a) === normalizeLibPath(b);
}

// Storage form for the excel_path widget: sandbox-relative, original casing kept.
// The file picker hands back an absolute path, but an absolute path baked into a saved
// workflow only resolves on the machine that made it — the backend accepts either form,
// so store the portable one.
export function toSandboxRelative(path) {
    const p = String(path || "").replace(/\\/g, "/");
    const root = String(cachedRoot || "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (root && p.toLowerCase().startsWith(root.toLowerCase() + "/")) {
        return p.slice(root.length + 1);
    }
    return p;
}

export function sameLibraryName(a, b) {
    return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

// Asks for a library name and keeps asking until it's unused (or the user cancels).
//
// Names must be unique because the quick-switch menu and the Save node's pill identify a
// library by name alone — two libraries called "Photography" give the user no way to tell
// which file a run will actually be written to.
export async function askUniqueLibraryName(defaultName, libraries) {
    let suggestion = defaultName;
    for (;;) {
        const name = await askText("📚 라이브러리 이름", suggestion);
        if (!name) return null;
        if (!libraries.some((l) => sameLibraryName(l.name, name))) return name;
        await notify(`"${name}" 이름은 이미 사용 중입니다.\n다른 이름을 입력해 주세요.`);
        suggestion = name;
    }
}

export async function saveLibraries(libraries) {
    try {
        const res = await api.fetchApi("/tj_node/promptdb/libraries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ libraries }),
        });
        return (await res.json()).ok === true;
    } catch (err) {
        return false;
    }
}

async function listDir(path) {
    try {
        const res = await api.fetchApi("/tj_node/promptdb/browse/list", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: path || "" }),
        });
        return await res.json();
    } catch (err) {
        return { ok: false, error: String(err) };
    }
}

// In-app replacement for window.prompt().
//
// Every one of these prompts happens *after* an `await` (picking a file, listing a folder),
// which ends the transient user activation the click started — Chrome then suppresses
// native dialogs and prompt() returns null immediately. That looked exactly like "Import
// silently does nothing": the name came back null and the handler bailed before saving.
// A modal we own has no such rule, and matches the rest of the UI.
export function askText(title, defaultValue = "") {
    installStyle();
    return new Promise((resolve) => {
        const backdrop = document.createElement("div");
        backdrop.className = "tj-pdb-backdrop";
        backdrop.innerHTML = `
          <div class="tj-pdb-modal tj-pdb-ask-modal">
            <div class="tj-pdb-modal-head">
              <div class="tj-pdb-modal-title">${escapeHTML(title)}</div>
              <button class="tj-pdb-modal-close">✕</button>
            </div>
            <div class="tj-pdb-ask-body">
              <input class="tj-pdb-ask-input" type="text" value="${escapeAttr(defaultValue)}" />
            </div>
            <div class="tj-pdb-modal-foot">
              <div class="tj-pdb-modal-error"></div>
              <button class="tj-pdb-modal-cancel">Cancel</button>
              <button class="tj-pdb-modal-save">OK</button>
            </div>
          </div>`;
        document.body.appendChild(backdrop);
        requestAnimationFrame(() => backdrop.classList.add("tj-pdb-open"));

        const input = backdrop.querySelector(".tj-pdb-ask-input");
        input.focus();
        input.select();

        let done = false;
        const finish = (value) => {
            if (done) return;
            done = true;
            backdrop.remove();
            resolve(value);
        };
        const accept = () => finish(input.value.trim() || null);

        backdrop.querySelector(".tj-pdb-modal-save").addEventListener("click", accept);
        backdrop.querySelector(".tj-pdb-modal-cancel").addEventListener("click", () => finish(null));
        backdrop.querySelector(".tj-pdb-modal-close").addEventListener("click", () => finish(null));
        backdrop.addEventListener("pointerdown", (e) => { if (e.target === backdrop) finish(null); });
        input.addEventListener("keydown", (e) => {
            e.stopPropagation(); // keep ComfyUI's canvas shortcuts out of the text field
            if (e.key === "Enter") accept();
            if (e.key === "Escape") finish(null);
        });
    });
}

// Message-only counterpart to askText — window.alert is suppressed in the same
// post-await situations, so errors raised after an async step need our own modal too.
export function notify(message) {
    installStyle();
    return new Promise((resolve) => {
        const backdrop = document.createElement("div");
        backdrop.className = "tj-pdb-backdrop";
        backdrop.innerHTML = `
          <div class="tj-pdb-modal tj-pdb-ask-modal">
            <div class="tj-pdb-modal-head">
              <div class="tj-pdb-modal-title">⚠ 알림</div>
              <button class="tj-pdb-modal-close">✕</button>
            </div>
            <div class="tj-pdb-ask-body"><div class="tj-pdb-ask-message">${escapeHTML(message)}</div></div>
            <div class="tj-pdb-modal-foot">
              <div class="tj-pdb-modal-error"></div>
              <button class="tj-pdb-modal-save">OK</button>
            </div>
          </div>`;
        document.body.appendChild(backdrop);
        requestAnimationFrame(() => backdrop.classList.add("tj-pdb-open"));
        const close = () => { backdrop.remove(); resolve(); };
        backdrop.querySelector(".tj-pdb-modal-save").addEventListener("click", close);
        backdrop.querySelector(".tj-pdb-modal-close").addEventListener("click", close);
        backdrop.addEventListener("pointerdown", (e) => { if (e.target === backdrop) close(); });
    });
}

// Yes/no counterpart to notify(). window.confirm has the same post-await suppression
// problem as prompt/alert, and a suppressed confirm() returns false — which would look
// like the user cancelled rather than like a broken dialog.
export function askConfirm(message, { confirmLabel = "삭제", danger = true } = {}) {
    installStyle();
    return new Promise((resolve) => {
        const backdrop = document.createElement("div");
        backdrop.className = "tj-pdb-backdrop";
        backdrop.innerHTML = `
          <div class="tj-pdb-modal tj-pdb-ask-modal">
            <div class="tj-pdb-modal-head">
              <div class="tj-pdb-modal-title">⚠ 확인</div>
              <button class="tj-pdb-modal-close">✕</button>
            </div>
            <div class="tj-pdb-ask-body"><div class="tj-pdb-ask-message">${escapeHTML(message)}</div></div>
            <div class="tj-pdb-modal-foot">
              <div class="tj-pdb-modal-error"></div>
              <button class="tj-pdb-modal-cancel">Cancel</button>
              <button class="tj-pdb-modal-save ${danger ? "tj-pdb-danger" : ""}">${escapeHTML(confirmLabel)}</button>
            </div>
          </div>`;
        document.body.appendChild(backdrop);
        requestAnimationFrame(() => backdrop.classList.add("tj-pdb-open"));
        const finish = (value) => { backdrop.remove(); resolve(value); };
        backdrop.querySelector(".tj-pdb-modal-save").addEventListener("click", () => finish(true));
        backdrop.querySelector(".tj-pdb-modal-cancel").addEventListener("click", () => finish(false));
        backdrop.querySelector(".tj-pdb-modal-close").addEventListener("click", () => finish(false));
        backdrop.addEventListener("pointerdown", (e) => { if (e.target === backdrop) finish(false); });
    });
}

async function deleteRow(excelPath, id) {
    try {
        const res = await api.fetchApi("/tj_node/promptdb/delete_row", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ excel_path: excelPath, id }),
        });
        return await res.json();
    } catch (err) {
        return { ok: false, error: String(err) };
    }
}

// Image picker for replacing a row's thumbnail. Browsing follows Multi Image Loader's
// "Add image" flow (same /tj_node/list_dir_files listing and /tj_node/thumbnail previews,
// folder drill-down with a Back button), but is pinned to the OUTPUT directory — those are
// the images this workflow produced, and the backend refuses anything outside it anyway.
function pickOutputImage() {
    installStyle();
    return new Promise((resolve) => {
        const backdrop = document.createElement("div");
        backdrop.className = "tj-pdb-backdrop";
        backdrop.innerHTML = `
          <div class="tj-pdb-modal tj-pdb-pick-modal">
            <div class="tj-pdb-modal-head">
              <div class="tj-pdb-modal-title">🖼 output 폴더에서 이미지 선택</div>
              <button class="tj-pdb-modal-close">✕</button>
            </div>
            <div class="tj-pdb-pick-nav">
              <button class="tj-pdb-pick-back" disabled>← Back</button>
              <span class="tj-pdb-pick-path">/output</span>
            </div>
            <div class="tj-pdb-pick-grid"></div>
          </div>`;
        document.body.appendChild(backdrop);
        requestAnimationFrame(() => backdrop.classList.add("tj-pdb-open"));

        let done = false;
        const finish = (value) => { if (done) return; done = true; backdrop.remove(); resolve(value); };
        backdrop.querySelector(".tj-pdb-modal-close").addEventListener("click", () => finish(null));
        backdrop.addEventListener("pointerdown", (e) => { if (e.target === backdrop) finish(null); });

        const gridEl = backdrop.querySelector(".tj-pdb-pick-grid");
        const pathEl = backdrop.querySelector(".tj-pdb-pick-path");
        const backBtn = backdrop.querySelector(".tj-pdb-pick-back");
        const stack = [];

        async function load() {
            const subfolder = stack.join("/");
            pathEl.textContent = "/output" + (subfolder ? "/" + subfolder : "");
            backBtn.disabled = stack.length === 0;
            gridEl.innerHTML = `<div class="tj-pdb-lib-empty2">불러오는 중...</div>`;
            let data;
            try {
                const res = await api.fetchApi("/tj_node/list_dir_files", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dir_type: "output", subfolder }),
                });
                data = await res.json();
            } catch (err) {
                gridEl.innerHTML = `<div class="tj-pdb-lib-empty2">${escapeHTML(String(err))}</div>`;
                return;
            }
            if (!data.success) {
                gridEl.innerHTML = `<div class="tj-pdb-lib-empty2">${escapeHTML(data.error || "폴더를 열 수 없습니다")}</div>`;
                return;
            }
            // Newest first: when replacing a thumbnail you almost always want a recent render.
            const files = (data.files || []).slice().sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
            const folders = data.folders || [];
            const cells = [];
            for (const f of folders) {
                cells.push(`<div class="tj-pdb-pick-cell tj-pdb-pick-folder" data-folder="${escapeAttr(f.name)}">
                    <div class="tj-pdb-pick-folder-icon">📁</div>
                    <div class="tj-pdb-pick-name">${escapeHTML(f.name)}</div></div>`);
            }
            for (const f of files) {
                const url = `/tj_node/thumbnail?dir_type=output&subfolder=${encodeURIComponent(subfolder)}`
                          + `&filename=${encodeURIComponent(f.filename)}&size=128`;
                cells.push(`<div class="tj-pdb-pick-cell" data-file="${escapeAttr(f.filename)}" title="${escapeAttr(f.filename)}">
                    <img src="${url}" loading="lazy" />
                    <div class="tj-pdb-pick-name">${escapeHTML(f.filename)}</div></div>`);
            }
            gridEl.innerHTML = cells.length ? cells.join("") : `<div class="tj-pdb-lib-empty2">이미지가 없습니다</div>`;
        }

        gridEl.addEventListener("click", (e) => {
            const cell = e.target.closest(".tj-pdb-pick-cell");
            if (!cell) return;
            if (cell.dataset.folder) { stack.push(cell.dataset.folder); load(); return; }
            if (cell.dataset.file) finish({ subfolder: stack.join("/"), filename: cell.dataset.file });
        });
        backBtn.addEventListener("click", () => { stack.pop(); load(); });

        load();
    });
}

async function setRowThumbnail(excelPath, id, pick, thumbnailSize) {
    try {
        const res = await api.fetchApi("/tj_node/promptdb/set_thumbnail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                excel_path: excelPath, id,
                subfolder: pick.subfolder, filename: pick.filename,
                thumbnail_size: thumbnailSize || 128,
            }),
        });
        return await res.json();
    } catch (err) {
        return { ok: false, error: String(err) };
    }
}

async function makeDir(path, name) {
    try {
        const res = await api.fetchApi("/tj_node/promptdb/browse/mkdir", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: path || "", name }),
        });
        return await res.json();
    } catch (err) {
        return { ok: false, error: String(err) };
    }
}

// In-app folder/file browser — the embedded Python ComfyUI ships with has no tkinter,
// so a native OS file dialog isn't available; this reimplements just enough of one
// (breadcrumb path, folder list, .xlsx files) as an HTML modal instead.
// mode: "open" (pick an existing .xlsx) or "save" (navigate to a folder, type a filename).
//
// Navigation is confined to the promptDB sandbox by the backend — there are no drive
// letters to show, and "⬅ .." simply isn't offered once you're at the root.
export function browseForFile(mode) {
    installStyle();
    return new Promise((resolve) => {
        const backdrop = document.createElement("div");
        backdrop.className = "tj-pdb-backdrop";
        backdrop.innerHTML = `
          <div class="tj-pdb-modal tj-pdb-browse-modal">
            <div class="tj-pdb-modal-head">
              <div class="tj-pdb-modal-title">${mode === "save" ? "💾 Save Prompt DB (.xlsx)" : "📂 Open Prompt DB (.xlsx)"}</div>
              <button class="tj-pdb-modal-close">✕</button>
            </div>
            <div class="tj-pdb-browse-path"></div>
            <div class="tj-pdb-browse-list"></div>
            <div class="tj-pdb-browse-actionbar">
              <button class="tj-pdb-browse-mkdir">📁+ 새 폴더</button>
            </div>
            ${mode === "save" ? `
              <div class="tj-pdb-browse-savebar">
                <input class="tj-pdb-browse-filename" type="text" placeholder="filename.xlsx" value="prompts.xlsx" />
                <button class="tj-pdb-browse-savebtn">Save here</button>
              </div>` : ""}
          </div>`;
        document.body.appendChild(backdrop);
        requestAnimationFrame(() => backdrop.classList.add("tj-pdb-open"));

        let resolved = false;
        const finish = (path) => {
            if (resolved) return;
            resolved = true;
            backdrop.remove();
            resolve(path || "");
        };
        backdrop.querySelector(".tj-pdb-modal-close").addEventListener("click", () => finish(""));
        backdrop.addEventListener("pointerdown", (e) => { if (e.target === backdrop) finish(""); });

        const pathEl = backdrop.querySelector(".tj-pdb-browse-path");
        const listEl = backdrop.querySelector(".tj-pdb-browse-list");
        let currentPath = "";

        async function go(path) {
            listEl.innerHTML = `<div class="tj-pdb-lib-empty2">불러오는 중...</div>`;
            const data = await listDir(path);
            if (!data.ok) {
                listEl.innerHTML = `<div class="tj-pdb-lib-empty2">${escapeHTML(data.error || "폴더를 열 수 없습니다")}</div>`;
                return;
            }
            currentPath = data.path;
            // Show the sandbox-relative path, not the machine-specific absolute one.
            pathEl.textContent = data.rel ? `promptDB / ${data.rel.replace(/\//g, " / ")}` : "promptDB";
            const rows = [];
            if (data.parent) rows.push(`<div class="tj-pdb-browse-row" data-nav="${escapeAttr(data.parent)}">⬅ ..</div>`);
            for (const name of data.dirs) {
                const full = currentPath.replace(/[\\/]+$/, "") + "\\" + name;
                rows.push(`<div class="tj-pdb-browse-row" data-nav="${escapeAttr(full)}">📁 ${escapeHTML(name)}</div>`);
            }
            for (const name of data.files) {
                const full = currentPath.replace(/[\\/]+$/, "") + "\\" + name;
                rows.push(`<div class="tj-pdb-browse-row tj-pdb-browse-file" data-file="${escapeAttr(full)}">📄 ${escapeHTML(name)}</div>`);
            }
            listEl.innerHTML = rows.length ? rows.join("") : `<div class="tj-pdb-lib-empty2">비어 있습니다</div>`;
        }

        listEl.addEventListener("click", (e) => {
            const row = e.target.closest(".tj-pdb-browse-row");
            if (!row) return;
            if (row.dataset.file) {
                if (mode === "save") {
                    backdrop.querySelector(".tj-pdb-browse-filename").value = row.dataset.file.split(/[\\/]/).pop();
                } else {
                    finish(row.dataset.file);
                }
                return;
            }
            if (row.dataset.nav) go(row.dataset.nav);
        });

        backdrop.querySelector(".tj-pdb-browse-mkdir").addEventListener("click", async () => {
            const name = await askText("📁 새 폴더 이름", "");
            if (!name) return;
            const result = await makeDir(currentPath, name);
            if (!result.ok) {
                await notify(result.error || "폴더를 만들지 못했습니다");
                return;
            }
            go(currentPath);
        });

        if (mode === "save") {
            backdrop.querySelector(".tj-pdb-browse-savebtn").addEventListener("click", () => {
                const filename = backdrop.querySelector(".tj-pdb-browse-filename").value.trim();
                if (!filename) return;
                const name = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
                finish(currentPath.replace(/[\\/]+$/, "") + "\\" + name);
            });
        }

        go("");
    });
}

// Backup = download, not a file-system copy. The server streams a .zip (workbook +
// thumbnail sidecar) and the browser's own download handling decides where it lands, so
// the node never needs permission to write outside the promptDB sandbox.
export async function downloadLibrary(sourcePath) {
    try {
        const res = await api.fetchApi("/tj_node/promptdb/download_library", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source_path: sourcePath }),
        });
        if (!res.ok) {
            let message = `HTTP ${res.status}`;
            try { message = (await res.json()).error || message; } catch (e) { /* not JSON */ }
            return { ok: false, error: message };
        }

        const disposition = res.headers.get("Content-Disposition") || "";
        const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
        const plain = /filename="([^"]+)"/i.exec(disposition);
        const filename = utf8 ? decodeURIComponent(utf8[1]) : (plain ? plain[1] : "promptdb_backup.zip");

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return { ok: true, filename };
    } catch (err) {
        return { ok: false, error: String(err) };
    }
}

function libraryRowHTML(lib, activePath) {
    const selected = sameLibraryPath(lib.path, activePath);
    const isActive = lib.active !== false;
    return `
      <div class="tj-pdb-lib-row ${selected ? "tj-pdb-lib-active" : ""} ${isActive ? "" : "tj-pdb-lib-inactive"}" data-id="${escapeAttr(lib.id)}" draggable="true">
        <span class="tj-pdb-lib-drag">⠿</span>
        <label class="tj-pdb-lib-toggle" title="${isActive ? "비활성화 (콤보메뉴에서 숨기기)" : "활성화 (콤보메뉴에 표시)"}">
          <input type="checkbox" class="tj-pdb-lib-active-cb" ${isActive ? "checked" : ""} />
        </label>
        <div class="tj-pdb-lib-info">
          <div class="tj-pdb-lib-title">${escapeHTML(lib.name)}</div>
          <div class="tj-pdb-lib-count">${lib.count ?? 0}개 행 · ${escapeHTML(lib.path)}</div>
        </div>
        <button class="tj-pdb-lib-export" title="백업 다운로드 (.zip — 워크북 + 썸네일)">⬇</button>
        <button class="tj-pdb-lib-del" title="삭제">✕</button>
      </div>`;
}

// Lightweight quick-switch popup, distinct from the full Library tabs Settings modal:
// only lists libraries the user has left active, click one to load it immediately.
function openQuickSwitchMenu(anchorEl, activePath, onPick, onOpenSettings) {
    installStyle();
    document.querySelectorAll(".tj-pdb-quickmenu").forEach((el) => el.remove());

    const menu = document.createElement("div");
    menu.className = "tj-pdb-quickmenu";
    menu.innerHTML = `<div class="tj-pdb-quickmenu-list"><div class="tj-pdb-lib-empty2">불러오는 중...</div></div>`;
    anchorEl.appendChild(menu);

    const close = () => menu.remove();
    setTimeout(() => document.addEventListener("pointerdown", closeOnOutside), 0);
    function closeOnOutside(e) {
        if (!menu.contains(e.target)) {
            document.removeEventListener("pointerdown", closeOnOutside);
            close();
        }
    }

    fetchLibraries().then((libraries) => {
        const active = libraries.filter((l) => l.active !== false);
        const listEl = menu.querySelector(".tj-pdb-quickmenu-list");
        if (!active.length) {
            listEl.innerHTML = `<div class="tj-pdb-lib-empty2">활성화된 라이브러리가 없습니다.<br/>⚙ Settings에서 추가/활성화하세요.</div>
              <button class="tj-pdb-quickmenu-settings">⚙ Open Settings</button>`;
        } else {
            listEl.innerHTML = active.map((lib) => `
              <div class="tj-pdb-quickmenu-row ${sameLibraryPath(lib.path, activePath) ? "tj-pdb-lib-active" : ""}"
                   data-path="${escapeAttr(lib.path)}" title="${escapeAttr(lib.path)}">
                <span>📄</span>
                <span class="tj-pdb-quickmenu-text">
                  <span class="tj-pdb-quickmenu-name">${escapeHTML(lib.name)}</span>
                  <span class="tj-pdb-quickmenu-file">${escapeHTML(lib.path)}</span>
                </span>
              </div>`).join("") + `<button class="tj-pdb-quickmenu-settings">⚙ Manage libraries...</button>`;
        }
        listEl.addEventListener("click", (e) => {
            const row = e.target.closest(".tj-pdb-quickmenu-row");
            if (row) {
                onPick?.(row.dataset.path);
                close();
                return;
            }
            if (e.target.closest(".tj-pdb-quickmenu-settings")) {
                close();
                onOpenSettings?.();
            }
        });
    });
}

// Opens the Library tabs modal. `activePath` highlights the current selection.
// `onPick(path)` fires when the user clicks a library row (not the delete button).
export function openLibraryModal(activePath, onPick) {
    installStyle();
    const backdrop = document.createElement("div");
    backdrop.className = "tj-pdb-backdrop";
    backdrop.innerHTML = `
      <div class="tj-pdb-modal tj-pdb-lib-modal">
        <div class="tj-pdb-modal-head">
          <div class="tj-pdb-modal-title">📚 Library tabs</div>
          <button class="tj-pdb-modal-close">✕</button>
        </div>
        <div class="tj-pdb-lib-body">
          <button class="tj-pdb-lib-import">＋ Import library (.xlsx)</button>
          <div class="tj-pdb-lib-list"></div>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("tj-pdb-open"));

    const close = () => backdrop.remove();
    backdrop.querySelector(".tj-pdb-modal-close").addEventListener("click", close);
    backdrop.addEventListener("pointerdown", (e) => { if (e.target === backdrop) close(); });

    const listEl = backdrop.querySelector(".tj-pdb-lib-list");
    let libraries = [];
    let dragFromId = null;

    async function render() {
        libraries = await fetchLibraries();
        if (!libraries.length) {
            listEl.innerHTML = `<div class="tj-pdb-lib-empty2">등록된 라이브러리가 없습니다.<br/>위 버튼으로 기존 .xlsx 파일을 추가하세요.</div>`;
            return;
        }
        listEl.innerHTML = libraries.map((lib) => libraryRowHTML(lib, activePath)).join("");
    }

    // Delegated on the label wrapper (not just the checkbox) — clicking a <label> fires a
    // click on both the label AND the checkbox it wraps, and the label-target click would
    // otherwise fall through to the row-pick branch below and close the modal by accident.
    listEl.addEventListener("change", (e) => {
        const cb = e.target.closest(".tj-pdb-lib-active-cb");
        if (!cb) return;
        const row = cb.closest(".tj-pdb-lib-row");
        const lib = libraries.find((l) => String(l.id) === row?.dataset.id);
        if (!lib) return;
        lib.active = cb.checked;
        saveLibraries(libraries);
        row.classList.toggle("tj-pdb-lib-inactive", !lib.active);
    });

    listEl.addEventListener("click", async (e) => {
        if (e.target.closest(".tj-pdb-lib-toggle")) return;
        const delBtn = e.target.closest(".tj-pdb-lib-del");
        const exportBtn = e.target.closest(".tj-pdb-lib-export");
        const row = e.target.closest(".tj-pdb-lib-row");
        if (!row) return;
        const id = row.dataset.id;
        const lib = libraries.find((l) => String(l.id) === id);
        if (delBtn) {
            libraries = libraries.filter((l) => String(l.id) !== id);
            saveLibraries(libraries);
            render();
            return;
        }
        if (exportBtn && lib) {
            exportBtn.textContent = "…";
            const result = await downloadLibrary(lib.path);
            exportBtn.textContent = result.ok ? "✓" : "✕";
            if (!result.ok) await notify(result.error || "백업 다운로드 실패");
            setTimeout(() => { exportBtn.textContent = "⬇"; }, 1200);
            return;
        }
        if (lib) {
            onPick?.(lib.path);
            close();
        }
    });

    // Drag-to-reorder (native HTML5 drag/drop, matches the reference's drag-handle rows).
    listEl.addEventListener("dragstart", (e) => {
        const row = e.target.closest(".tj-pdb-lib-row");
        dragFromId = row?.dataset.id ?? null;
    });
    listEl.addEventListener("dragover", (e) => e.preventDefault());
    listEl.addEventListener("drop", (e) => {
        e.preventDefault();
        const row = e.target.closest(".tj-pdb-lib-row");
        const toId = row?.dataset.id;
        if (!dragFromId || !toId || dragFromId === toId) return;
        const fromIdx = libraries.findIndex((l) => String(l.id) === dragFromId);
        const toIdx = libraries.findIndex((l) => String(l.id) === toId);
        if (fromIdx < 0 || toIdx < 0) return;
        const [moved] = libraries.splice(fromIdx, 1);
        libraries.splice(toIdx, 0, moved);
        saveLibraries(libraries);
        listEl.innerHTML = libraries.map((lib) => libraryRowHTML(lib, activePath)).join("");
    });

    backdrop.querySelector(".tj-pdb-lib-import").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.textContent = "파일 선택 중...";
        const path = await browseForFile("open");
        btn.textContent = "＋ Import library (.xlsx)";
        if (!path) return;
        // Re-read rather than trusting the closure's copy: the browse modal was open for a
        // while and another node's modal may have written the list in the meantime.
        const current = await fetchLibraries();
        if (current.some((l) => sameLibraryPath(l.path, path))) {
            await notify("이미 등록된 라이브러리입니다.");
            return;
        }
        const defaultName = path.split(/[\\/]/).pop().replace(/\.xlsx$/i, "");
        const name = await askUniqueLibraryName(defaultName, current);
        if (!name) return;
        current.push({ id: `${Date.now()}`, name, path, active: true });
        if (!(await saveLibraries(current))) {
            await notify("라이브러리를 저장하지 못했습니다.");
            return;
        }
        render();
    });

    render();
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

function openDetailModal(node, row, onSaved, onDeleted) {
    const backdrop = document.createElement("div");
    backdrop.className = "tj-pdb-backdrop";
    backdrop.innerHTML = `
      <div class="tj-pdb-modal">
        <div class="tj-pdb-modal-head">
          <div class="tj-pdb-modal-title">🖼 Row #${row.id} — ${row.date || ""}</div>
          <button class="tj-pdb-modal-close">✕</button>
        </div>
        <div class="tj-pdb-modal-body">
          <div class="tj-pdb-modal-imgcol">
            <div class="tj-pdb-modal-img">${row.thumbnail ? `<img src="${row.thumbnail}" />` : ""}</div>
            <button class="tj-pdb-thumb-replace" title="output 폴더의 이미지로 교체">🖼 썸네일 교체</button>
          </div>
          <div class="tj-pdb-modal-form">
            <div class="tj-pdb-field"><label>Positive Prompt</label><textarea id="tj-pdb-f-pos" class="tj-pdb-textarea-main">${row.positive_prompt || ""}</textarea></div>
            <div class="tj-pdb-field"><label>Negative Prompt</label><textarea id="tj-pdb-f-neg">${row.negative_prompt || ""}</textarea></div>
            <div class="tj-pdb-divider"></div>
            <div class="tj-pdb-row2">
              <div class="tj-pdb-field"><label>Model</label><input id="tj-pdb-f-model" type="text" value="${escapeAttr(row.model_name)}" /></div>
              <div class="tj-pdb-field"><label>Seed</label><input id="tj-pdb-f-seed" type="number" value="${row.seed ?? 0}" /></div>
              <div class="tj-pdb-field"><label>Steps</label><input id="tj-pdb-f-steps" type="number" value="${row.steps ?? 0}" /></div>
              <div class="tj-pdb-field"><label>CFG</label><input id="tj-pdb-f-cfg" type="number" step="0.1" value="${row.cfg ?? 0}" /></div>
              <div class="tj-pdb-field"><label>Sampler</label><input id="tj-pdb-f-sampler" type="text" value="${escapeAttr(row.sampler_name)}" /></div>
              <div class="tj-pdb-field"><label>Scheduler</label><input id="tj-pdb-f-scheduler" type="text" value="${escapeAttr(row.scheduler)}" /></div>
            </div>
            <div class="tj-pdb-field"><label>Extra Settings</label><textarea id="tj-pdb-f-extra">${row.extra_settings || ""}</textarea></div>
            <div class="tj-pdb-divider"></div>
            <div class="tj-pdb-field"><label>Source Path</label><input id="tj-pdb-f-src" type="text" value="${escapeAttr(row.source_path)}" /></div>
          </div>
        </div>
        <div class="tj-pdb-modal-foot">
          <button class="tj-pdb-modal-delete" title="이 기록을 엑셀에서 삭제">🗑 Delete</button>
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

    const replaceBtn = backdrop.querySelector(".tj-pdb-thumb-replace");
    replaceBtn.addEventListener("click", async () => {
        const pick = await pickOutputImage();
        if (!pick) return;
        errEl.textContent = "";
        replaceBtn.textContent = "교체 중...";
        const result = await setRowThumbnail(node.__tjPdbExcelPath, row.id, pick);
        replaceBtn.textContent = "🖼 썸네일 교체";
        if (!result.ok) {
            errEl.textContent = result.error || "썸네일 교체 실패";
            return;
        }
        row.thumbnail = result.thumbnail;
        backdrop.querySelector(".tj-pdb-modal-img").innerHTML =
            result.thumbnail ? `<img src="${result.thumbnail}" />` : "";
        onSaved?.(row);   // repaint the grid so the card shows the new image immediately
    });

    const deleteBtn = backdrop.querySelector(".tj-pdb-modal-delete");
    deleteBtn.addEventListener("click", async () => {
        const preview = truncate(row.positive_prompt, 60) || "(no prompt)";
        const ok = await askConfirm(`#${row.id} 기록을 삭제할까요?\n\n${preview}\n\n삭제하면 되돌릴 수 없습니다.`);
        if (!ok) return;
        errEl.textContent = "";
        deleteBtn.textContent = "삭제 중...";
        const result = await deleteRow(node.__tjPdbExcelPath, row.id);
        if (result.ok) {
            onDeleted?.(row.id);
            close();
        } else {
            deleteBtn.textContent = "🗑 Delete";
            errEl.textContent = result.error || "삭제 실패 — 파일이 열려 있나요?";
        }
    });

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
            sampler_name: backdrop.querySelector("#tj-pdb-f-sampler").value,
            scheduler: backdrop.querySelector("#tj-pdb-f-scheduler").value,
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

// The Loader deliberately exposes only positive_prompt and pipe (see RETURN_TYPES in
// promptdb.py). An output-collapsing toggle used to live here and had to go: hiding an
// output removes it from node.outputs, which renumbers the slot indices serialised into
// the prompt, while the backend still resolves them against RETURN_TYPES — a link from
// the collapsed pipe was sent as slot 1 and read as negative_prompt. Use
// PromptDBBridge(TJ) to fan the pipe back out instead.

// ── Auto Set ────────────────────────────────────────────────────────────────
// Registers each output as a wireless provider (properties.auto_sets[slot] = name), so a
// loaded row's fields can be picked up by name instead of dragging 11 wires across the
// canvas. Mirrors tj_resolution.js; TJ_PromptDBLoader is also listed in
// AUTO_SET_PROVIDER_TYPES in set_getnode_tj.js, which is what makes the core treat it as
// a provider at all.
function collectExistingSets(node) {
    const used = new Set();
    for (const n of node.graph?._nodes || []) {
        if (n === node) continue;
        if (n.type === "TJ_SetNode") {
            const w = n.widgets?.find((x) => x.name === "set_name" || x.name === "setnode_name");
            if (w?.value) used.add(String(w.value).trim());
        }
        if (n.properties?.auto_sets) {
            Object.values(n.properties.auto_sets).forEach((v) => { if (v) used.add(String(v).trim()); });
        }
    }
    return used;
}

function notifyGetNodes(node) {
    // Get / Multi Get nodes only rescan on demand — without this the new names never
    // show up in their dropdowns.
    setTimeout(() => {
        for (const n of node.graph?._nodes || []) {
            if (n.type === "TJ_GetNode") {
                n._syncWithSetNode?.();
                const w = n.widgets?.find((x) => x.name === "set_name");
                if (w) n._connectToSetNode?.(w.value);
            }
            if (n.type === "TJ_MultiGetNode") {
                n._syncWithSetNodes?.();
                n._rebuild?.();
            }
        }
        app.canvas?.setDirty(true, true);
    }, 50);
}

function updateAutoSets(node, prefix = "PDB_") {
    if (!node || !node.graph) return;
    if (!node.properties) node.properties = {};
    const enabled = !!node.widgets?.find((w) => w.name === "auto_set")?.value;

    node.properties.auto_sets = {};
    const used = collectExistingSets(node);

    (node.outputs || []).forEach((out, i) => {
        if (!out) return;
        // Outputs are collapsible, so key the name off the socket's own name rather than a
        // fixed index table — slot 3 is not always the same field.
        const base = `${prefix}${out.name || `out_${i + 1}`}`;
        // Which field the front end reads varies by version; set all three so the ▶ marker
        // shows consistently.
        const setLabel = (txt) => { out.label = txt; out.localized_name = txt; };
        if (!enabled) {
            setLabel(out.name);
            return;
        }
        let finalName = base;
        let tries = 1;
        while (used.has(finalName)) finalName = `${base}_${tries++}`;
        used.add(finalName);
        node.properties.auto_sets[i] = finalName;
        setLabel(`${finalName} ▶`);
    });

    node.setDirtyCanvas?.(true, true);
    notifyGetNodes(node);
}

function installAutoSet(node, prefix = "PDB_") {
    const w = node.widgets?.find((x) => x.name === "auto_set");
    if (w && !w.__tjPdbAutoSetAttached) {
        w.__tjPdbAutoSetAttached = true;
        const orig = w.callback;
        w.callback = function (v) {
            orig?.call(this, v);
            updateAutoSets(node, prefix);
        };
    }
    // Re-register after the output list changes (the Hide/Show toggle rebuilds it).
    node.__tjPdbUpdateAutoSets = () => updateAutoSets(node, prefix);
    requestAnimationFrame(() => updateAutoSets(node, prefix));
}

function installUI(node) {
    if (node.__tjPdbInstalled) return;
    node.__tjPdbInstalled = true;
    installStyle();
    installAutoSet(node);

    const selectedWidget = getW(node, "selected_id");
    if (selectedWidget) {
        selectedWidget.hidden = true;
        selectedWidget.computeSize = () => [0, -4];
        selectedWidget.draw = () => {};
    }

    // Raw excel_path is never shown — nobody should have to type/remember a file path.
    // Everything routes through the library pill + Library tabs modal instead.
    const excelWidget = getW(node, "excel_path");
    if (excelWidget) {
        excelWidget.hidden = true;
        excelWidget.computeSize = () => [0, -4];
        excelWidget.draw = () => {};
        if (excelWidget.element) excelWidget.element.style.display = "none";
    }

    const wrap = document.createElement("div");
    wrap.className = "tj-pdb-wrap";

    // Row 1: current library (click to switch/manage in the Library tabs modal).
    const libRow = document.createElement("div");
    libRow.className = "tj-pdb-toolbar";
    const libPill = document.createElement("div");
    libPill.className = "tj-pdb-lib-pill";
    libPill.innerHTML = `<span class="tj-pdb-lib-icon">📚</span><span class="tj-pdb-lib-name tj-pdb-lib-empty">라이브러리 선택...</span><span>▾</span>`;
    const settingsBtn = document.createElement("button");
    settingsBtn.className = "tj-pdb-icon-btn";
    settingsBtn.textContent = "⚙";
    settingsBtn.title = "Settings — manage libraries (import / export / activate)";
    libRow.appendChild(libPill);
    libRow.appendChild(settingsBtn);
    libRow.style.position = "relative";
    wrap.appendChild(libRow);

    // Row 2: search + refresh.
    const toolbar = document.createElement("div");
    toolbar.className = "tj-pdb-toolbar";
    const search = document.createElement("input");
    search.className = "tj-pdb-search";
    search.type = "text";
    search.placeholder = "🔍 프롬프트 검색...";
    const refreshBtn = document.createElement("button");
    refreshBtn.className = "tj-pdb-icon-btn";
    refreshBtn.textContent = "⟳";
    refreshBtn.title = "Refresh";
    toolbar.appendChild(search);
    toolbar.appendChild(refreshBtn);
    wrap.appendChild(toolbar);

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
                : "📚 을 눌러 라이브러리를 선택하세요");
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
        openDetailModal(node, row, () => renderGrid(), (deletedId) => {
            node.__tjPdbRows = node.__tjPdbRows.filter((r) => r.id !== deletedId);
            // Clear the selection if the row that was deleted is the one wired to outputs,
            // so the node can't keep referencing an id that no longer exists in the sheet.
            if (Number(selectedWidget?.value) === deletedId) selectRow(-1);
            renderGrid();
        });
        selectRow(row.id);
    });
    search.addEventListener("input", renderGrid);

    async function updateLibraryPill() {
        const excelPath = node.__tjPdbExcelPath;
        const nameEl = libPill.querySelector(".tj-pdb-lib-name");
        if (!excelPath) {
            nameEl.textContent = "라이브러리 선택...";
            nameEl.classList.add("tj-pdb-lib-empty");
            return;
        }
        const libraries = await fetchLibraries();
        const match = libraries.find((l) => sameLibraryPath(l.path, excelPath));
        nameEl.textContent = match ? match.name : excelPath.split(/[\\/]/).pop();
        nameEl.classList.remove("tj-pdb-lib-empty");
        // The pill shows only the name, so hover reveals the file it actually points at.
        libPill.title = match ? `${match.name}\n${match.path}` : excelPath;
    }

    async function refresh() {
        const excelPath = String(excelWidget?.value || "").trim();
        node.__tjPdbExcelPath = excelPath;
        updateLibraryPill();
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

    // Auto-refresh when the workbook this node is showing gets written to — a run that logs
    // a new row should appear straight away instead of needing a manual ⟳. Scoped by path so
    // several Loaders on different libraries don't all reload on every save.
    const onUpdated = (event) => {
        const changed = event?.detail?.path;
        if (!changed || !node.__tjPdbExcelPath) return;
        if (!sameLibraryPath(changed, node.__tjPdbExcelPath)) return;
        refresh();
    };
    api.addEventListener(UPDATED_EVENT, onUpdated);
    const origOnRemoved = node.onRemoved;
    node.onRemoved = function () {
        api.removeEventListener(UPDATED_EVENT, onUpdated);
        origOnRemoved?.apply(this, arguments);
    };

    function onLibraryPicked(path) {
        excelWidget.value = toSandboxRelative(path);
        excelWidget.callback?.call(excelWidget, excelWidget.value);
        refresh();
    }

    // Pill = fast switch: a small dropdown of already-registered, active libraries only —
    // pick one and its thumbnails load immediately. Managing the list itself (import,
    // export, reorder, delete, activate/deactivate) lives behind the separate ⚙ Settings
    // button instead, so this everyday path stays a single click.
    libPill.addEventListener("click", () => {
        openQuickSwitchMenu(libRow, node.__tjPdbExcelPath, onLibraryPicked, () => settingsBtn.click());
    });

    settingsBtn.addEventListener("click", () => {
        openLibraryModal(node.__tjPdbExcelPath, onLibraryPicked);
    });

    if (excelWidget) {
        const origCb = excelWidget.callback;
        excelWidget.callback = function (value) {
            origCb?.call(this, value);
            refresh();
        };
    }

    // Chrome = everything in `wrap` above the grid (library pill row, search/refresh row,
    // status line, plus their gaps/padding).
    const LIB_ROW_H = 34, TOOLBAR_H = 30, SEARCH_H = 34, STATUS_H = 18, GAP = 8, PAD = 20;
    const CHROME_H = PAD + LIB_ROW_H + GAP + TOOLBAR_H + GAP + SEARCH_H + GAP + STATUS_H + GAP;

    const ONE_ROW_H = 150; // one row of square thumbnails — the floor the node can shrink to

    const domWidget = node.addDOMWidget("tj_promptdb_gallery", "div", wrap, { serialize: false, hideOnZoom: false });

    // Use computeLayoutSize, NOT computeSize. A widget exposing computeSize is laid out as a
    // fixed-height widget, so making the gallery follow the node's height would mean feeding
    // node.size back into computeSize — and LiteGraph re-clamps the drag to node.computeSize()
    // on every mousemove tick, so that feedback compounds and the node grows without bound
    // even with the mouse held still (confirmed live three ways, incl. a fixed drag-start
    // baseline that still reached ~9800px in a 40-tick simulation).
    // computeLayoutSize instead declares a min/preferred range and lets the node's own layout
    // pass distribute whatever body space is free between such widgets. The gallery then
    // stretches and shrinks with the node by construction, and nothing this returns depends
    // on node.size, so there is no loop to run away.
    delete domWidget.computeSize;
    domWidget.computeLayoutSize = () => ({
        minHeight: CHROME_H + ONE_ROW_H,
        minWidth: MIN_WIDTH,
        maxHeight: 1e6,
        maxWidth: 1e6,
    });

    const MIN_WIDTH = 320;
    const origOnResize = node.onResize;
    node.onResize = function (size) {
        if (size[0] < MIN_WIDTH) size[0] = MIN_WIDTH;
        origOnResize?.apply(this, arguments);
    };
    node.setSize([Math.max(node.size[0], MIN_WIDTH), CHROME_H + GRID_MAX_HEIGHT + 40]);

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

// ── PromptDBBridge ──────────────────────────────────────────────────────────
// Unpacks a pipe into the individual fields. Keeps the Loader down to two sockets:
// run one pipe wire across the canvas, then fan it out next to whatever consumes it.
// Its own Auto Set republishes every field wirelessly from wherever it sits, under a
// distinct prefix so the names never collide with a Loader's.
const BRIDGE_TYPE = "TJ_PromptDBBridge";

function installBridge(node) {
    if (node.__tjPdbBridgeInstalled) return;
    node.__tjPdbBridgeInstalled = true;

    // Type-filtered receiver: only TJ_PROMPT_PIPE providers appear in get_name. Declaring
    // the widget alone would list every provider in the graph and never connect.
    window.TJ_NODE_attachGetReceiver?.(node, {
        widgetName: "get_name",
        inputIndex: 0,          // `pipe`
        inputName: "pipe",
        defaultType: "TJ_PROMPT_PIPE",
    });

    installAutoSet(node, "PDBB_");
}

app.registerExtension({
    name: "TJ.PromptDBBridge",
    nodeCreated(node) {
        if (node?.type === BRIDGE_TYPE || node?.comfyClass === BRIDGE_TYPE) {
            installBridge(node);
        }
    },
});
