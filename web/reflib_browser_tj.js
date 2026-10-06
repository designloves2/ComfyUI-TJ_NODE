// web/reflib_browser_tj.js
// Reference Asset Browser (TJ): categories | assets | viewer, with replace / save / delete.
// Everything lives in one DOM widget; the selected id goes out through the hidden "selected" widget.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE = "TJ_RefAssetBrowser";
const CATEGORIES = ["character", "background", "prop", "music", "voice", "video", "etc"];
const BASE = "/tj_node/reflib";

const css = `
.tjrb{display:flex;flex-direction:column;width:100%;height:100%;box-sizing:border-box;gap:6px;color:#ddd;font:12px/1.4 sans-serif}
.tjrb *{box-sizing:border-box}
.tjrb .top{display:flex;gap:6px}
.tjrb input,.tjrb select,.tjrb textarea{background:#1b1b1b;color:#ddd;border:1px solid #3a3a3a;border-radius:4px;padding:4px 6px;font:inherit}
.tjrb .top input{flex:1}
.tjrb button{background:#2d2d2d;color:#ddd;border:1px solid #4a4a4a;border-radius:4px;padding:5px 10px;cursor:pointer;font:inherit}
.tjrb button:hover{background:#3a3a3a}
.tjrb button.danger{border-color:#8a3a3a;color:#f0a0a0}
.tjrb button.armed{background:#8a2a2a;color:#fff}
.tjrb .cols{display:grid;grid-template-columns:130px minmax(0,1fr) minmax(0,1.2fr);gap:6px;flex:1;min-height:0}
.tjrb .col{border:1px solid #333;border-radius:6px;background:#161616;display:flex;flex-direction:column;min-height:0}
.tjrb .head{padding:4px 8px;background:#242424;border-bottom:1px solid #333;font-weight:600;color:#9ab}
.tjrb .scroll{overflow:auto;flex:1;min-height:0;padding:4px}
.tjrb .cat{padding:5px 8px;border-radius:4px;cursor:pointer;display:flex;justify-content:space-between}
.tjrb .cat:hover{background:#262626}.tjrb .cat.on{background:#2f4a66;color:#fff}
.tjrb .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px}
.tjrb .card{border:1px solid #333;border-radius:6px;overflow:hidden;cursor:pointer;background:#1e1e1e;position:relative}
.tjrb .card.on{border-color:#5aa0e0;box-shadow:0 0 0 1px #5aa0e0}
.tjrb .card img{width:100%;height:70px;object-fit:cover;display:block;background:#000}
.tjrb .card .n{padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tjrb .card .k{position:absolute;top:2px;left:2px;background:#000a;border-radius:3px;padding:0 4px;font-size:10px}
.tjrb .view{padding:6px;display:flex;flex-direction:column;gap:6px}
.tjrb .view .media{width:100%;max-height:220px;object-fit:contain;background:#000;border-radius:4px}
.tjrb .form{display:grid;grid-template-columns:70px 1fr;gap:4px 6px;align-items:center}
.tjrb .meta{color:#8a9;font-size:11px}
.tjrb .trim{display:flex;flex-direction:column;gap:4px;border:1px solid #333;border-radius:6px;padding:6px;background:#1a1a1a}
.tjrb .card .dim{position:absolute;top:0;height:70px;background:#000b;pointer-events:none}
.tjrb .card .trimbar{position:absolute;left:0;right:0;top:64px;height:6px;background:#000a;pointer-events:none}
.tjrb .card .trimbar i{position:absolute;top:0;bottom:0;background:#ffcf5a}
.tjrb .card .cut{position:absolute;top:2px;right:2px;background:#000c;color:#ffcf5a;border-radius:3px;padding:0 4px;font-size:10px;pointer-events:none}
.tjrb .trim canvas{width:100%;height:80px;background:#101010;border-radius:4px;cursor:ew-resize;touch-action:none}
.tjrb .trim .row{display:flex;gap:4px;align-items:center;flex-wrap:nowrap}
.tjrb .trim .row span{white-space:nowrap}
.tjrb .trim .row button{padding:3px 6px;white-space:nowrap}
.tjrb .trim input[type=number]{width:58px;padding:3px 4px}
.tjrb audio{height:30px}
.tjrb .tabs{display:flex;gap:2px;flex:0 0 130px;width:130px}
.tjrb .tabs button{flex:1;min-width:0;border-radius:4px 4px 0 0;padding:5px 0;text-align:center}
.tjrb .tabs button.on{background:#2f4a66;color:#fff;border-color:#5aa0e0}
.tjrb .prj{padding:6px 8px;border-radius:5px;cursor:pointer;display:flex;justify-content:space-between;gap:6px}
.tjrb .prj:hover{background:#262626}.tjrb .prj.on{background:#2f4a66;color:#fff}
.tjrb .item{display:grid;grid-template-columns:38px 1fr;gap:6px;align-items:center;padding:4px;border:1px solid #333;border-radius:6px;background:#1e1e1e;margin-bottom:4px}
.tjrb .item img{width:38px;height:38px;object-fit:cover;border-radius:4px;background:#000}
.tjrb .item .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tjrb .item .ctl{display:flex;gap:4px;align-items:center;margin-top:2px}
.tjrb .item .ctl input{flex:1;min-width:0}
.tjrb .item .ctl button{padding:1px 7px}
.tjrb .card.in::after{content:"✓";position:absolute;right:3px;bottom:20px;background:#2f8f4f;color:#fff;border-radius:50%;width:16px;height:16px;text-align:center;line-height:16px;font-size:11px}
.tjrb .bottom{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:6px;border-top:1px solid #333}
.tjrb .msg{min-height:16px;color:#9c9}.tjrb .msg.err{color:#f09090}
`;

function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") e.className = v;
        else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
        else e[k] = v;
    }
    kids.flat().forEach((c) => c != null && e.append(c));
    return e;
}

async function call(path, options) {
    const r = await api.fetchApi(BASE + path, options);
    return r.json();
}

const post = (path, body) =>
    call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

function build(node) {
    if (!document.getElementById("tjrb-style")) document.head.append(el("style", { id: "tjrb-style", textContent: css }));
    const state = { assets: [], category: "all", query: "", id: null, detail: null, armed: null,
        tab: "assets", projects: [], draft: null, pArmed: false };
    const hideW = (w) => { if (w) { w.type = "hidden"; w.hidden = true; w.computeSize = () => [0, -4]; } return w; };
    const selW = hideW(node.widgets.find((w) => w.name === "selected"));
    const selP = hideW(node.widgets.find((w) => w.name === "selected_project"));

    const search = el("input", { placeholder: "Search: name / tag / ID", oninput: () => { state.query = search.value.toLowerCase(); state.tab === "assets" ? drawList() : drawLibrary(); } });
    const fileAdd = el("input", { type: "file", multiple: true, style: "display:none", onchange: () => upload(fileAdd.files) });
    const addBtn = el("button", { textContent: "+ Add", onclick: () => fileAdd.click() });
    const refreshBtn = el("button", { textContent: "Refresh", onclick: () => reload() });
    const catBox = el("div", { class: "scroll" });
    const listBox = el("div", { class: "scroll" });
    const viewBox = el("div", { class: "scroll" });
    const msg = el("div", { class: "msg" });
    const fileRep = el("input", { type: "file", style: "display:none", onchange: () => replace(fileRep.files[0]) });
    const btnReplace = el("button", { textContent: "Replace", onclick: () => (state.tab === "assets" ? fileRep.click() : newProject()) });
    const btnSave = el("button", { textContent: "Save", onclick: () => (state.tab === "assets" ? save() : saveProject()) });
    const btnDelete = el("button", { class: "danger", textContent: "Delete", onclick: () => (state.tab === "assets" ? remove() : removeProject()) });
    const tabAssets = el("button", { textContent: "Assets", onclick: () => setTab("assets") });
    const tabProjects = el("button", { textContent: "Projects", onclick: () => setTab("projects") });
    const heads = ["Categories", "Assets", "Viewer"].map((t) => el("div", { class: "head", textContent: t }));

    const root = el("div", { class: "tjrb" },
        el("div", { class: "top" }, el("div", { class: "tabs" }, tabAssets, tabProjects), search, addBtn, refreshBtn, fileAdd, fileRep),
        el("div", { class: "cols" },
            el("div", { class: "col" }, heads[0], catBox),
            el("div", { class: "col" }, heads[1], listBox),
            el("div", { class: "col" }, heads[2], viewBox,
                el("div", { class: "bottom" }, btnReplace, btnSave, btnDelete))),
        msg);

    const say = (text, err = false) => { msg.textContent = text || ""; msg.className = "msg" + (err ? " err" : ""); };
    const thumb = (a) => api.apiURL(`${BASE}/thumb/${a.id}?v=${Math.round(a.updated || 0)}`);

    function drawCats() {
        catBox.replaceChildren();
        const counts = { all: state.assets.length };
        for (const a of state.assets) counts[a.category] = (counts[a.category] || 0) + 1;
        for (const c of ["all", ...CATEGORIES]) {
            catBox.append(el("div", { class: "cat" + (state.category === c ? " on" : ""), onclick: () => { state.category = c; drawCats(); drawList(); } },
                el("span", { textContent: c === "all" ? "All" : c }), el("span", { textContent: counts[c] || 0 })));
        }
    }

    // Cards of a trimmed audio / video asset show the kept part: audio dims the waveform outside the
    // range, both get a yellow range bar and an "in-out" tag.
    function cutOverlay(a) {
        const start = a.settings?.start || 0, end = a.settings?.end || 0;
        if ((a.kind !== "audio" && a.kind !== "video") || !a.duration || (!start && !end)) return { nodes: [], title: "" };
        const out = end > 0 ? Math.min(end, a.duration) : a.duration;
        const l = (start / a.duration) * 100, r = (out / a.duration) * 100;
        const nodes = [el("div", { class: "trimbar" }, el("i", { style: `left:${l}%;width:${r - l}%` })),
            el("div", { class: "cut", textContent: `✂ ${start.toFixed(1)}–${out.toFixed(1)}s` })];
        if (a.kind === "audio") nodes.unshift(el("div", { class: "dim", style: `left:0;width:${l}%` }), el("div", { class: "dim", style: `left:${r}%;right:0` }));
        return { nodes, title: `trim ${start.toFixed(2)}s – ${out.toFixed(2)}s` };
    }

    function drawList() {
        listBox.replaceChildren();
        const grid = el("div", { class: "grid" });
        const q = state.query;
        for (const a of state.assets) {
            if (state.category !== "all" && a.category !== state.category) continue;
            if (q && !`${a.name} ${a.tags.join(" ")} ${a.id}`.toLowerCase().includes(q)) continue;
            const cut = cutOverlay(a);
            grid.append(el("div", { class: "card" + (a.id === state.id ? " on" : ""), title: `#${a.id} ${a.name}` + (cut.title ? `  ·  ${cut.title}` : ""), onclick: () => select(a.id) },
                el("img", { src: thumb(a), loading: "lazy" }),
                ...cut.nodes,
                el("div", { class: "k", textContent: a.kind }),
                el("div", { class: "n", textContent: `#${a.id} ${a.name}` })));
        }
        listBox.append(grid.children.length ? grid : el("div", { class: "meta", textContent: "No assets yet. Use '+ Add' to register files." }));
    }

    // In / out trim of an audio or video asset (seconds). The numbers are the asset's library default
    // (settings.start / settings.end; end 0 = to the end); the H3 nodes apply them when the asset is used.
    // Audio: drag the yellow in / out handles on the waveform, drag the lit range to move it, click
    // outside to jump the nearest handle, double-click to reset. The number fields follow every drag
    // and the waveform follows every typed value.
    function trimEditor(a, f, src, videoEl) {
        const duration = a.duration || 0;
        const wrap = el("div", { class: "trim" });
        const canvas = a.kind === "audio" ? el("canvas", { width: 900, height: 80 }) : null;
        const info = el("div", { class: "meta" });
        const num = (input) => Math.max(0, Number(input.value) || 0);
        const outOf = () => (num(f.end) > 0 ? Math.min(num(f.end), duration) : duration);
        const round = (t) => Math.round(t * 100) / 100;
        let peaks = null, playhead = null;

        const draw = () => {
            info.textContent = `in ${num(f.start).toFixed(2)}s  →  out ${outOf().toFixed(2)}s  (length ${Math.max(0, outOf() - num(f.start)).toFixed(2)}s / total ${duration.toFixed(2)}s)`;
            if (!canvas || !duration) return;
            const g = canvas.getContext("2d"), w = canvas.width, h = canvas.height, ruler = 14;
            g.clearRect(0, 0, w, h);
            const x0 = (num(f.start) / duration) * w, x1 = (outOf() / duration) * w;
            g.fillStyle = "#1d2a38"; g.fillRect(x0, 0, x1 - x0, h - ruler);
            if (peaks) peaks.forEach((pk, i) => {
                const x = (i / peaks.length) * w, bar = Math.max(1, pk * (h - ruler - 14));
                g.fillStyle = x >= x0 && x <= x1 ? "#78beff" : "#3a4654";
                g.fillRect(x, (h - ruler - bar) / 2 + 5, Math.max(1, w / peaks.length - 0.5), bar);
            });
            g.font = "10px sans-serif"; g.textBaseline = "middle";
            const step = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((v) => duration / v <= 10) || 600;
            g.fillStyle = "#6b7a88"; g.strokeStyle = "#445";
            for (let t = 0; t <= duration + 1e-6; t += step) {
                const x = (t / duration) * w;
                g.beginPath(); g.moveTo(x, h - ruler); g.lineTo(x, h - ruler + 4); g.stroke();
                g.fillText(`${+t.toFixed(2)}s`, Math.min(x + 2, w - 34), h - 5);
            }
            for (const [x, label, right] of [[x0, `in ${num(f.start).toFixed(2)}s`, false], [x1, `out ${outOf().toFixed(2)}s`, true]]) {
                g.fillStyle = "#ffcf5a"; g.fillRect(x - 1, 0, 2, h - ruler);
                g.fillRect(right ? x - 10 : x, 0, 10, 14);                       // grab tab
                const tw = g.measureText(label).width + 6;
                g.fillStyle = "#000b"; g.fillRect(right ? x - 12 - tw : x + 12, 1, tw, 13);
                g.fillStyle = "#ffcf5a"; g.fillText(label, (right ? x - 12 - tw : x + 12) + 3, 8);
            }
            if (playhead != null) { g.fillStyle = "#ff5a5a"; g.fillRect((playhead / duration) * w - 1, 0, 2, h - ruler); }
        };

        if (canvas) {
            call(`/waveform/${a.id}`).then((r) => { if (r.ok) { peaks = r.peaks; draw(); } });
            const rect = () => canvas.getBoundingClientRect();
            const timeAt = (e) => Math.min(1, Math.max(0, (e.clientX - rect().left) / rect().width)) * duration;
            const hit = (e) => {
                const r = rect(), x = e.clientX - r.left;
                const sx = (num(f.start) / duration) * r.width, ex = (outOf() / duration) * r.width;
                if (Math.abs(x - sx) <= 10) return "start";
                if (Math.abs(x - ex) <= 10) return "end";
                return x > sx && x < ex ? "move" : "new";
            };
            const setStart = (t) => { f.start.value = round(Math.min(Math.max(0, t), Math.max(0, outOf() - 0.05))); };
            const setEnd = (t) => { const v = round(Math.max(t, num(f.start) + 0.05)); f.end.value = v >= duration - 0.01 ? 0 : v; };
            let drag = null;
            canvas.addEventListener("pointerdown", (e) => {
                if (!duration) return;
                let mode = hit(e);
                const t = timeAt(e);
                if (mode === "new") mode = t < num(f.start) ? "start" : "end";
                drag = { mode, t0: t, s0: num(f.start), len: outOf() - num(f.start) };
                canvas.setPointerCapture(e.pointerId);
                canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: e.clientX, pointerId: e.pointerId }));
            });
            canvas.addEventListener("pointermove", (e) => {
                if (!drag) { canvas.style.cursor = { start: "ew-resize", end: "ew-resize", move: "grab", new: "crosshair" }[hit(e)]; return; }
                const t = timeAt(e);
                if (drag.mode === "start") setStart(t);
                else if (drag.mode === "end") setEnd(t);
                else {
                    const start = Math.min(Math.max(0, drag.s0 + (t - drag.t0)), duration - drag.len);
                    f.start.value = round(start);
                    const out = round(start + drag.len);
                    f.end.value = out >= duration - 0.01 ? 0 : out;
                }
                draw();
            });
            const release = () => { drag = null; };
            canvas.addEventListener("pointerup", release);
            canvas.addEventListener("pointercancel", release);
            canvas.addEventListener("dblclick", () => { f.start.value = 0; f.end.value = 0; draw(); });
        }

        const player = a.kind === "audio" ? new Audio(src) : videoEl;
        let guard = null;
        const stopPlay = () => { player.pause(); if (guard) player.removeEventListener("timeupdate", guard); guard = null; playhead = null; draw(); };
        const play = el("button", { textContent: "▶ Play range", title: "play only the in-out range", onclick: () => {
            stopPlay();
            player.currentTime = num(f.start); player.muted = false; player.play();
            guard = () => { playhead = player.currentTime; if (player.currentTime >= outOf()) stopPlay(); else draw(); };
            player.addEventListener("timeupdate", guard);
        } });
        const stopBtn = el("button", { textContent: "■", onclick: stopPlay });
        const reset = el("button", { textContent: "Full", onclick: () => { f.start.value = 0; f.end.value = 0; draw(); } });
        // typed values: follow on every keystroke, tidy up (end after start, inside the clip) when done
        [f.start, f.end].forEach((i) => i.addEventListener("input", draw));
        f.start.addEventListener("change", () => { setStartTidy(); draw(); });
        f.end.addEventListener("change", () => { setEndTidy(); draw(); });
        const setStartTidy = () => { f.start.value = round(Math.min(num(f.start), Math.max(0, (duration || num(f.start)) - 0.05))); };
        const setEndTidy = () => {
            let v = num(f.end);
            if (duration && v >= duration - 0.01) v = 0;
            else if (v > 0 && v < num(f.start) + 0.05) v = round(num(f.start) + 0.05);
            f.end.value = v;
        };
        wrap.append(...[canvas, el("div", { class: "row" }, el("span", { textContent: "in(s)" }), f.start, el("span", { textContent: "out(s)" }), f.end, reset, play, stopBtn), info].filter(Boolean));
        draw();
        return wrap;
    }

    function drawView() {
        viewBox.replaceChildren();
        const d = state.detail;
        if (!d) { viewBox.append(el("div", { class: "meta view", textContent: "Pick an asset on the left." })); return; }
        const a = d.asset;
        const src = api.apiURL(`${BASE}/file/${a.id}?v=${Math.round(a.updated)}`);
        let mediaEl, videoEl = null;
        if (a.kind === "image") mediaEl = el("img", { class: "media", src });
        else if (a.kind === "video") mediaEl = videoEl = el("video", { class: "media", src, controls: true, loop: true, muted: true });
        else if (a.kind === "audio") mediaEl = el("audio", { src, controls: true, style: "width:100%;height:30px" });
        else mediaEl = el("div", { class: "grid" }, a.members.map((m) => el("img", { class: "media", style: "height:80px", src: api.apiURL(`${BASE}/thumb/${m}`) })));
        const f = {
            name: el("input", { value: a.name }),
            category: el("select", {}, CATEGORIES.map((c) => el("option", { value: c, textContent: c, selected: c === a.category }))),
            sub: el("input", { value: a.subcategory, placeholder: "Sub-category (folder)" }),
            tags: el("input", { value: a.tags.join(","), placeholder: "tag1,tag2" }),
            note: el("input", { value: a.note }),
            mp: el("input", { type: "number", step: "0.1", min: "0", value: a.settings.mp }),
            start: el("input", { type: "number", step: "0.01", min: "0", value: a.settings.start }),
            end: el("input", { type: "number", step: "0.01", min: "0", value: a.settings.end, title: "0 = to the end" }),
            withAudio: el("input", { type: "checkbox", checked: a.settings.with_audio }),
        };
        state.form = f;
        const trim = a.kind === "audio" || a.kind === "video" ? trimEditor(a, f, src, videoEl) : null;
        const facts = [`#${a.id}`, a.kind, a.width ? `${a.width}x${a.height}` : null, a.duration ? `${a.duration.toFixed(1)}s` : null,
            a.size ? `${(a.size / 1048576).toFixed(2)} MB` : null].filter(Boolean).join("  ·  ");
        const used = d.projects.length ? `Projects: ${d.projects.map((p) => p.name).join(", ")}` : "Not used in any project";
        viewBox.append(el("div", { class: "view" }, a.kind === "audio" ? [trim, mediaEl] : [mediaEl, trim], el("div", { class: "meta", textContent: facts }),
            el("div", { class: "meta", textContent: a.rel_path || `Set (${a.members.length} images)` }),
            el("div", { class: "form" },
                el("span", { textContent: "Name" }), f.name, el("span", { textContent: "Category" }), f.category,
                el("span", { textContent: "Sub" }), f.sub, el("span", { textContent: "Tags" }), f.tags,
                el("span", { textContent: "Note" }), f.note,
                ...(a.kind === "audio" ? [] : [el("span", { textContent: "mp (downscale)" }), f.mp]),
                ...(a.kind === "video" ? [el("span", { textContent: "Video sound" }), f.withAudio] : [])),
            el("div", { class: "meta", textContent: used })));
    }

    // ── projects tab: projects | the project's assets (alias, order) | library to add from ──────
    const draftItems = () => state.draft?.items || [];
    const assetById = (id) => state.assets.find((a) => a.id === id);

    function setTab(tab) {
        state.tab = tab; state.pArmed = false;
        tabAssets.classList.toggle("on", tab === "assets");
        tabProjects.classList.toggle("on", tab === "projects");
        btnDelete.classList.remove("armed");
        if (tab === "assets") {
            heads[0].textContent = "Categories"; heads[1].textContent = "Assets"; heads[2].textContent = "Viewer";
            btnReplace.textContent = "Replace"; btnSave.textContent = "Save"; btnDelete.textContent = "Delete";
            search.placeholder = "Search: name / tag / ID";
            drawCats(); drawList(); drawView();
        } else {
            heads[0].textContent = "Projects"; heads[1].textContent = "Library — click to add"; heads[2].textContent = "Project contents (alias / order)";
            btnReplace.textContent = "New project"; btnSave.textContent = "Save"; btnDelete.textContent = "Delete";
            search.placeholder = "Search library";
            loadProjects().then(() => { drawProjectList(); drawDraft(); drawLibrary(); });
        }
        say("");
    }

    async function loadProjects() {
        const r = await call("/projects");
        state.projects = r.projects || [];
        return state.projects;
    }

    function drawProjectList() {
        catBox.replaceChildren(...state.projects.map((p) => el("div", { class: "prj" + (state.draft?.id === p.id ? " on" : ""), title: p.note || p.name, onclick: () => openProject(p.id) },
            el("span", { textContent: p.name, style: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }), el("span", { textContent: p.item_count }))));
        if (!state.projects.length) catBox.append(el("div", { class: "meta", textContent: "No projects yet. Press 'New project'." }));
    }

    async function openProject(id) {
        const r = await call(`/projects/${id}`);
        if (!r.ok) return say(`${r.code}: ${r.detail}`, true);
        state.draft = { id: r.project.id, name: r.project.name, note: r.project.note || "",
            items: r.project.items.map((i) => ({ asset_id: i.asset_id, alias: i.alias || "" })) };
        if (selP) selP.value = String(id);
        state.pArmed = false; btnDelete.textContent = "Delete"; btnDelete.classList.remove("armed");
        say(""); drawProjectList(); drawDraft(); drawLibrary();
    }

    function newProject() {
        state.draft = { id: null, name: "", note: "", items: [] };
        say("Type a name, click assets in the library to add them, then press Save");
        drawProjectList(); drawDraft(); drawLibrary();
    }

    function drawDraft() {
        viewBox.replaceChildren();
        const d = state.draft;
        if (!d) { viewBox.append(el("div", { class: "meta", textContent: "Pick a project on the left or press 'New project'." })); return; }
        const name = el("input", { value: d.name, placeholder: "Project name", style: "width:100%", oninput: () => { d.name = name.value; } });
        const note = el("input", { value: d.note, placeholder: "Note", style: "width:100%", oninput: () => { d.note = note.value; } });
        const move = (i, by) => { const j = i + by; if (j < 0 || j >= d.items.length) return; [d.items[i], d.items[j]] = [d.items[j], d.items[i]]; drawDraft(); };
        const rows = d.items.map((it, i) => {
            const a = assetById(it.asset_id);
            const alias = el("input", { value: it.alias, placeholder: "Alias (@alias)", oninput: () => { it.alias = alias.value.trim(); } });
            return el("div", { class: "item" },
                el("img", { src: a ? thumb(a) : "" }),
                el("div", {}, el("div", { class: "t", textContent: a ? `#${a.id} ${a.name}  ·  ${a.kind}` : `#${it.asset_id} (missing asset)`, title: a?.rel_path || "" }),
                    el("div", { class: "ctl" }, alias,
                        el("button", { textContent: "▲", onclick: () => move(i, -1) }), el("button", { textContent: "▼", onclick: () => move(i, 1) }),
                        el("button", { textContent: "✕", onclick: () => { d.items.splice(i, 1); drawDraft(); drawLibrary(); } }))));
        });
        viewBox.append(el("div", { style: "display:flex;flex-direction:column;gap:4px;margin-bottom:6px" }, name, note),
            ...rows, rows.length ? "" : el("div", { class: "meta", textContent: "Click assets in the library on the left to add them." }));
    }

    function drawLibrary() {
        listBox.replaceChildren();
        const grid = el("div", { class: "grid" });
        const q = state.query;
        for (const a of state.assets) {
            if (q && !`${a.name} ${a.tags.join(" ")} ${a.id}`.toLowerCase().includes(q)) continue;
            const inside = draftItems().some((i) => i.asset_id === a.id);
            grid.append(el("div", { class: "card" + (inside ? " in on" : ""), title: `#${a.id} ${a.name}`, onclick: () => addToDraft(a) },
                el("img", { src: thumb(a), loading: "lazy" }), el("div", { class: "k", textContent: a.kind }),
                el("div", { class: "n", textContent: `#${a.id} ${a.name}` })));
        }
        listBox.append(grid);
    }

    function addToDraft(a) {
        if (!state.draft) newProject();
        if (draftItems().some((i) => i.asset_id === a.id)) return say(`#${a.id} is already in the project`, true);
        state.draft.items.push({ asset_id: a.id, alias: "" });
        say(""); drawDraft(); drawLibrary();
    }

    async function saveProject() {
        const d = state.draft;
        if (!d) return say("No project to save", true);
        if (!d.name.trim()) return say("Enter a project name", true);
        const r = await post("/projects", { id: d.id ?? undefined, name: d.name.trim(), note: d.note,
            items: d.items.map((i) => ({ asset_id: i.asset_id, alias: i.alias || null })) });
        if (!r.ok) return say(`${r.code || "ERROR"}: ${r.detail || r.error}`, true);
        say(`Saved '${r.project.name}' (project #${r.project.id}, ${r.project.items.length} assets)`);
        await loadProjects();
        await openProject(r.project.id);
    }

    async function removeProject() {
        const d = state.draft;
        if (!d || d.id == null) return say("Pick a project to delete", true);
        if (!state.pArmed) {
            state.pArmed = true; btnDelete.classList.add("armed"); btnDelete.textContent = `Delete '${d.name}'? (press again)`;
            armTimer = setTimeout(() => { state.pArmed = false; btnDelete.classList.remove("armed"); btnDelete.textContent = "Delete"; }, 5000);
            return;
        }
        clearTimeout(armTimer); state.pArmed = false; btnDelete.classList.remove("armed"); btnDelete.textContent = "Delete";
        const r = await post(`/projects/${d.id}/delete`);
        say(r.ok ? `Deleted '${d.name}'` : `${r.code}: ${r.detail}`, !r.ok);
        if (r.ok) { state.draft = null; if (selP) selP.value = ""; await loadProjects(); drawProjectList(); drawDraft(); drawLibrary(); }
    }

    async function reload(keep = true) {
        const r = await call("/assets?limit=5000");
        state.assets = r.assets || [];
        if (keep && state.id != null && !state.assets.some((a) => a.id === state.id)) { state.id = null; state.detail = null; }
        if (state.tab === "projects") { drawProjectList(); drawDraft(); drawLibrary(); return; }
        drawCats(); drawList(); drawView();
    }

    async function select(id) {
        state.id = id; state.armed = null; resetDelete();
        if (selW) selW.value = String(id);
        const r = await call(`/assets/${id}`);
        state.detail = r.ok ? r : null;
        say(r.ok ? "" : `${r.code}: ${r.detail}`, !r.ok);
        drawList(); drawView();
    }

    async function upload(files) {
        const cat = state.category === "all" ? "etc" : state.category;
        let ok = 0, dup = 0, last = null;
        for (const file of files) {
            const form = new FormData();
            form.append("file", file); form.append("category", cat); form.append("name", file.name.replace(/\.[^.]+$/, ""));
            const r = await (await api.fetchApi(BASE + "/assets", { method: "POST", body: form })).json();
            if (!r.ok) { say(`${file.name}: ${r.code}: ${r.detail}`, true); continue; }
            r.duplicate ? dup++ : ok++; last = r.asset.id;
        }
        fileAdd.value = "";
        if (ok || dup) say(`Added ${ok}${dup ? `, already present ${dup}` : ""} (${cat})`);
        await reload(); if (last != null) select(last);
    }

    async function replace(file) {
        if (!file || state.id == null) return;
        const form = new FormData(); form.append("file", file);
        const r = await (await api.fetchApi(`${BASE}/assets/${state.id}/replace`, { method: "POST", body: form })).json();
        fileRep.value = "";
        say(r.ok ? `#${state.id} file replaced (ID kept)` : `${r.code}: ${r.detail}`, !r.ok);
        if (r.ok) { await reload(); select(state.id); }
    }

    async function save() {
        const f = state.form;
        if (state.id == null || !f) return;
        const kind = state.detail.asset.kind;
        const settings = {};
        if (kind === "image" || kind === "video") settings.mp = Number(f.mp.value) || 0;
        if (kind === "audio" || kind === "video") {
            settings.start = Math.max(0, Number(f.start.value) || 0);
            settings.end = Math.max(0, Number(f.end.value) || 0);
            if (settings.end > 0 && settings.end <= settings.start) return say("out must be later than in (0 = to the end)", true);
        }
        if (kind === "video") settings.with_audio = f.withAudio.checked;
        const r = await post(`/assets/${state.id}/update`, {
            name: f.name.value, category: f.category.value, subcategory: f.sub.value,
            tags: f.tags.value.split(",").map((t) => t.trim()).filter(Boolean), note: f.note.value,
            settings,
        });
        say(r.ok ? `Saved #${state.id}` : `${r.code}: ${r.detail}`, !r.ok);
        if (r.ok) { await reload(); select(state.id); }
    }

    let armTimer = null;
    function resetDelete() { clearTimeout(armTimer); state.armed = null; btnDelete.textContent = "Delete"; btnDelete.classList.remove("armed"); }
    async function remove() {
        if (state.id == null) return;
        const projects = state.detail?.projects || [];
        if (!state.armed) {
            state.armed = projects.length ? "force" : "plain";
            btnDelete.classList.add("armed");
            btnDelete.textContent = projects.length ? `Also remove from ${projects.length} project(s) and delete? (press again)` : "Really delete? (press again)";
            armTimer = setTimeout(resetDelete, 5000);
            return;
        }
        const force = state.armed === "force";
        resetDelete();
        const r = await post(`/assets/${state.id}/delete`, { force });
        say(r.ok ? `Deleted #${state.id}` : `${r.code}: ${r.detail}`, !r.ok);
        if (r.ok) { state.id = null; state.detail = null; if (selW) selW.value = ""; await reload(); }
    }

    const dom = node.addDOMWidget("browser", "tj_ref_browser", root, { serialize: false });
    delete dom.computeSize;
    dom.computeLayoutSize = () => ({ minHeight: 420, minWidth: 700, maxHeight: 1e6, maxWidth: 1e6 });
    node.setSize([860, 600]);
    tabAssets.classList.add("on");
    reload().then(() => { const id = selW?.value && parseInt(selW.value, 10); if (id) select(id); });
    node._tjBrowserReload = reload;
}

app.registerExtension({
    name: "TJ.RefAssetBrowser",
    async nodeCreated(node) {
        if ((node.comfyClass || node.type) !== NODE) return;
        build(node);
    },
});
