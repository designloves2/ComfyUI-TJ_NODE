// TJ_PromptDBSave — same "never type/remember a path" convenience as PromptDBLoader:
// hides the raw excel_path widget and replaces it with a library pill (pick an existing
// library, or Browse to create/point at a new .xlsx) that opens the same Library tabs
// modal PromptDBLoader uses.
import { app } from "../../../scripts/app.js";
import {
    fetchLibraries, saveLibraries, browseForFile, openLibraryModal,
    notify, sameLibraryPath, askUniqueLibraryName, toSandboxRelative,
} from "./promptdb_tj.js";

const NODE_TYPE = "TJ_PromptDBSave";
const TJ_ACCENT = "#7612DA";

function installStyle() {
    if (document.getElementById("tj-pdbs-style")) return;
    const style = document.createElement("style");
    style.id = "tj-pdbs-style";
    style.textContent = `
      .tj-pdbs-wrap { display:flex; flex-direction:column; gap:6px; padding:8px; font-family:Arial,sans-serif; }
      .tj-pdbs-wrap > * { flex-shrink:0; }
      .tj-pdbs-row { display:flex; align-items:center; gap:6px; }
      .tj-pdbs-pill {
        flex:1; min-width:0; display:flex; align-items:center; gap:6px; cursor:pointer;
        background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1); border-radius:9px;
        padding:6px 10px; font-size:11.5px; font-weight:700; color:#e3d3ff; transition:background .15s ease;
      }
      .tj-pdbs-pill:hover { background:rgba(255,255,255,.08); }
      .tj-pdbs-pill .tj-pdbs-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .tj-pdbs-pill .tj-pdbs-name.tj-pdbs-empty { color:#6b6480; font-weight:600; }
      .tj-pdbs-newbtn {
        flex:none; border:1px solid ${TJ_ACCENT}; background:rgba(118,18,218,.18); color:#e3d3ff;
        border-radius:9px; padding:6px 10px; font-weight:800; font-size:11px; cursor:pointer;
      }
      .tj-pdbs-newbtn:hover { background:rgba(118,18,218,.32); }
    `;
    document.head.appendChild(style);
}

function getW(node, name) {
    return node.widgets?.find((w) => w.name === name) ?? null;
}

// Wire get_name up through the shared receiver rather than just declaring the widget.
// It is what restricts the dropdown to providers whose output type matches this node's
// `images` input — without it the list shows every provider in the graph, including
// STRING/INT ones that can never connect here.
function installGetReceiver(node) {
    // Renaming setnode_name has to re-publish this node under the new name, otherwise
    // consumers keep pointing at the old one.
    window.TJ_NODE_attachProviderNameSync?.(node);

    const attach = window.TJ_NODE_attachGetReceiver;
    if (typeof attach !== "function") return;   // core script not loaded yet
    attach(node, {
        widgetName: "get_name",
        inputIndex: 0,          // `images`
        inputName: "images",
        outputIndex: 0,
        defaultType: "IMAGE",
        defaultOutputType: "IMAGE",
    });
}

function installUI(node) {
    if (node.__tjPdbsInstalled) return;
    node.__tjPdbsInstalled = true;
    installStyle();
    installGetReceiver(node);

    const excelWidget = getW(node, "excel_path");
    if (excelWidget) {
        excelWidget.hidden = true;
        excelWidget.computeSize = () => [0, -4];
        excelWidget.draw = () => {};
        if (excelWidget.element) excelWidget.element.style.display = "none";
    }

    const wrap = document.createElement("div");
    wrap.className = "tj-pdbs-wrap";

    const row = document.createElement("div");
    row.className = "tj-pdbs-row";
    const pill = document.createElement("div");
    pill.className = "tj-pdbs-pill";
    pill.innerHTML = `<span>📚</span><span class="tj-pdbs-name tj-pdbs-empty">저장할 라이브러리 선택...</span><span>▾</span>`;
    const newBtn = document.createElement("button");
    newBtn.className = "tj-pdbs-newbtn";
    newBtn.textContent = "＋ New";
    newBtn.title = "새 .xlsx 파일 만들기";
    row.appendChild(pill);
    row.appendChild(newBtn);
    wrap.appendChild(row);

    async function refreshPill() {
        const path = String(excelWidget?.value || "").trim();
        const nameEl = pill.querySelector(".tj-pdbs-name");
        if (!path) {
            nameEl.textContent = "저장할 라이브러리 선택...";
            nameEl.classList.add("tj-pdbs-empty");
            return;
        }
        const libraries = await fetchLibraries();
        const match = libraries.find((l) => sameLibraryPath(l.path, path));
        nameEl.textContent = match ? match.name : path.split(/[\\/]/).pop();
        nameEl.classList.remove("tj-pdbs-empty");
        // Saving writes to a file, so make the target visible on hover — the name alone
        // doesn't tell you where the rows will land.
        pill.title = match ? `${match.name}\n${match.path}` : path;
    }

    function setPath(path) {
        if (!excelWidget) return;
        // Store sandbox-relative so a saved workflow still resolves on another machine.
        excelWidget.value = toSandboxRelative(path);
        excelWidget.callback?.call(excelWidget, excelWidget.value);
        refreshPill();
        node.setDirtyCanvas?.(true, true);
    }

    pill.addEventListener("click", () => {
        openLibraryModal(String(excelWidget?.value || "").trim(), (path) => setPath(path));
    });

    newBtn.addEventListener("click", async () => {
        newBtn.textContent = "…";
        const path = await browseForFile("save");
        newBtn.textContent = "＋ New";
        if (!path) return;
        const libraries = await fetchLibraries();
        if (!libraries.some((l) => sameLibraryPath(l.path, path))) {
            const defaultName = path.split(/[\\/]/).pop().replace(/\.xlsx$/i, "");
            // askUniqueLibraryName, not window.prompt — Chrome suppresses native dialogs
            // raised after an await (the file-picker), which silently returned null and
            // dropped the import. It also re-asks until the name is actually free.
            const name = await askUniqueLibraryName(defaultName, libraries);
            if (!name) return;
            libraries.push({ id: `${Date.now()}`, name, path, active: true });
            if (!(await saveLibraries(libraries))) {
                await notify("라이브러리를 저장하지 못했습니다.");
                return;
            }
        }
        setPath(path);
    });

    const domWidget = node.addDOMWidget("tj_promptdb_save_pill", "div", wrap, { serialize: false, hideOnZoom: false });
    // Fixed height, not measured — same circular-collapse issue as PromptDBLoader's gallery
    // (ComfyUI stretches the DOM host to the node's content area, so a scrollHeight-based
    // computeSize collapses toward 0 before there's any real layout to measure).
    domWidget.computeSize = (width) => [width, 16 + 34];
    setTimeout(refreshPill, 50);
}

app.registerExtension({
    name: "TJ.PromptDBSave.LibraryPicker",
    nodeCreated(node) {
        if (node?.type === NODE_TYPE || node?.comfyClass === NODE_TYPE) {
            installUI(node);
        }
    },
});
