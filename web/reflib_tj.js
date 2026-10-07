// web/reflib_tj.js
// Reference asset library nodes (plain-widget front end, no gallery UI):
//   TJ_H3Reference      - mode/asset_count driven widget visibility, Load button + info box
//                         (resolve REST), library list refresh, wireless Set/Get
//   TJ_RefAssetRegister / TJ_RefProjectSave - show what the last run did

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyLayout, fitToContent, makeGrip, resizableMultiline } from "./tj_box_resize.js";

const H3 = "TJ_H3Reference";
const I2V = "TJ_H3ImageToVideo";
const REGISTER = "TJ_RefAssetRegister";
const PROJECT_SAVE = "TJ_RefProjectSave";
const OUTPUT_NAMES = ["positive", "latent", "snapshot", "report"];
const OUTPUT_NAMES_I2V = ["positive", "latent"];
const MAX_SLOTS = 15;

// ── helpers ──────────────────────────────────────────────────────────────────

function findW(node, name) {
    return node.widgets?.find((w) => w.name === name);
}

function setHidden(w, hide) {
    if (!w) return;
    if (hide) {
        if (!w._tjRef) w._tjRef = { type: w.type, computeSize: w.computeSize };
        w.type = "hidden";
        w.hidden = true;
        w.computeSize = () => [0, -4];
    } else if (w._tjRef) {
        w.type = w._tjRef.type;
        w.hidden = false;
        if (w._tjRef.computeSize) w.computeSize = w._tjRef.computeSize;
        else delete w.computeSize;
        delete w._tjRef;
    }
}

// Read-only text box with a fixed height the user changes with the grip below it (remembered in
// node.properties); extra node height goes to the other flexible widgets, not to this box.
function addTextBox(node, name, defaultHeight) {
    const key = `height_${name}`;
    if (!node.properties) node.properties = {};
    const height = () => Math.max(40, Number(node.properties[key]) || defaultHeight);

    const ta = document.createElement("textarea");
    ta.readOnly = true;
    ta.spellcheck = false;
    ta.style.cssText = "flex:1 1 auto;min-height:0;width:100%;box-sizing:border-box;resize:none;font:11px/1.45 Consolas,monospace;" +
        "background:#1b1b1b;color:#ddd;border:1px solid #333;border-radius:4px 4px 0 0;padding:6px;white-space:pre;overflow:auto;";
    const grip = makeGrip(node, key, height, 40);
    grip.style.cssText = "flex:0 0 8px;cursor:ns-resize;background:#2a2a2a;border:1px solid #333;border-top:0;border-radius:0 0 4px 4px;";
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;width:100%;height:100%;";
    wrap.append(ta, grip);

    const dw = node.addDOMWidget(name, "tj_ref_text", wrap, { serialize: false });
    delete dw.computeSize;
    dw.computeLayoutSize = () => ({ minHeight: height(), maxHeight: height(), minWidth: 220, maxWidth: 1e6 });
    return ta;
}

async function getJson(path, options) {
    const r = await api.fetchApi(path, options);
    return r.json();
}

// ── library lists ────────────────────────────────────────────────────────────

// the "/" makes rgthree-style combo menus nest the list by folder: character/demo/Hero [id:1]
const assetLabel = (a) => [a.category, a.subcategory, `${a.name} [id:${a.id}]`].filter(Boolean).join("/");

const CATEGORIES = ["character", "background", "prop", "music", "voice", "video", "etc"];

// Asset combos list "<id>: <name> [category]" sorted by category; the "category" widget narrows
// every asset slot of the node to one category (a flat combo cannot show folders).
function applyCategoryFilter(node) {
    const cat = findW(node, "category filter")?.value || "all";
    const rank = (c) => CATEGORIES.indexOf(c);
    const list = (node._tjAssets || [])
        .filter((a) => cat === "all" || a.category === cat)
        .sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name));
    const values = ["(none)", ...list.map(assetLabel)];
    for (let i = 1; i <= MAX_SLOTS; i++) {
        const w = findW(node, `asset_${i}`);
        if (!w) continue;
        // keep a value the user already picked even when it is filtered out of the list
        w.options.values = w.value && w.value !== "(none)" && !values.includes(w.value) ? [...values, w.value] : values;
    }
}

function addCategoryFilter(node) {
    if (findW(node, "category filter")) return;
    const w = node.addWidget("combo", "category filter", "all", () => applyCategoryFilter(node),
        { values: ["all", ...CATEGORIES] });
    w.serialize = false;
}

async function refreshLists(node) {
    const [assets, projects] = await Promise.all([
        getJson("/tj_node/reflib/assets?limit=2000"),
        getJson("/tj_node/reflib/projects"),
    ]);
    if (assets.assets) {
        node._tjAssets = assets.assets;
        applyCategoryFilter(node);
    }
    const pw = findW(node, "project");
    if (pw && projects.projects) pw.options.values = ["(none)", ...projects.projects.map((p) => `${p.name} [id:${p.id}]`)];
}

// ── info box ─────────────────────────────────────────────────────────────────

function formatReport(r) {
    if (!r || r.ok === undefined) return r?.detail ? `${r.code}: ${r.detail}` : "(no data)";
    const out = [];
    out.push(r.project ? `Project #${r.project.id}  ${r.project.name}` : `Mode: ${r.mode}`);
    out.push("");
    for (const a of r.attached) {
        const label = a.audio_label ? `${a.audio_label} ${a.label}` : a.label;
        out.push(`${label.padEnd(24)} #${String(a.id).padEnd(4)} ${a.kind.padEnd(6)} ${a.alias ? "@" + a.alias : "-"}  ${a.name} [${a.category}]`);
    }
    if (!r.attached.length) out.push("(nothing attached)");
    const l = r.limits;
    out.push("", `image ${l.image.used}/${l.image.max}   video ${l.video.used}/${l.video.max}   ` +
        `video-audio ${l.video_audio.used}/${l.video_audio.max}   audio ${l.audio.used}/${l.audio.max}`);
    for (const e of r.errors) out.push(`ERROR   ${e.code}: ${e.message}`);
    for (const w of r.warnings) out.push(`warning ${w.code}: ${w.message}`);
    if (r.ok && !r.warnings.length) out.push("OK - prompt and references match");
    out.push("", "Resolved prompt:", r.resolved_prompt);
    return out.join("\n");
}

async function loadInfo(node) {
    const box = node._tjInfoBox;
    try {
        await refreshLists(node);
        const slots = [];
        const count = Number(findW(node, "asset_count")?.value || 1);
        for (let i = 1; i <= Math.min(count, MAX_SLOTS); i++) slots.push(String(findW(node, `asset_${i}`)?.value ?? ""));
        const report = await getJson("/tj_node/reflib/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mode: findW(node, "mode")?.value,
                project: findW(node, "project")?.value,
                assets: slots,
                prompt: findW(node, "prompt")?.value || "",
                overrides: findW(node, "overrides")?.value || "",
            }),
        });
        box.value = formatReport(report);
    } catch (e) {
        box.value = `Load failed: ${e}`;
    }
}

// ── visibility ───────────────────────────────────────────────────────────────

// Slots open one at a time: the next asset_N appears once asset_(N-1) holds an asset.
// asset_count (hidden) follows, so the node still receives a plain count.
function openSlots(node) {
    let last = 0;
    for (let i = 1; i <= MAX_SLOTS; i++) {
        const v = findW(node, `asset_${i}`)?.value;
        if (v && v !== "(none)") last = i;
    }
    const count = Math.min(MAX_SLOTS, last + 1);
    const w = findW(node, "asset_count");
    if (w && w.value !== count) w.value = count;
    return count;
}

// Attachment limits (same rule as library.count_kinds): a set kept as images counts every member,
// a set packed as video counts once.
const LIMITS = { image: 9, video: 3, audio: 3 };

function countKinds(assets) {
    const n = { image: 0, video: 0, audio: 0 };
    for (const a of assets) {
        if (a.kind !== "set") n[a.kind]++;
        else if (a.settings?.set_mode === "images") n.image += a.members.length;
        else n.video++;
    }
    return n;
}

function warn(node, text) {
    app.extensionManager?.toast?.add({ severity: "warn", summary: "Reference limit", detail: text, life: 6000 });
    if (node._tjInfoBox) node._tjInfoBox.value = text;
}

// A slot change that would push an attachment kind over its limit is reverted with a warning.
function guardSlot(node, w) {
    let prev = w.value;
    const orig = w.callback;
    w.callback = function (v) {
        const byId = new Map((node._tjAssets || []).map((a) => [a.id, a]));
        const chosen = [];
        for (let i = 1; i <= MAX_SLOTS; i++) {
            const sw = findW(node, `asset_${i}`);
            const a = byId.get(assetIdOf(sw?.value));
            if (a) chosen.push(a);
        }
        const before = countKinds(chosen.filter((a) => a.id !== assetIdOf(w.value)));
        const after = countKinds(chosen);
        const over = Object.keys(LIMITS).find((k) => after[k] > LIMITS[k]);
        if (over) {
            w.value = prev;
            warn(node, before[over] >= LIMITS[over]
                ? `${LIMITS[over]} ${over}s are already added. To add another one, replace an added asset.`
                : `This asset would exceed the limit of ${LIMITS[over]} ${over}s. Replace or remove an added asset first.`);
            return;
        }
        prev = w.value;
        if (orig) orig.apply(this, arguments);
    };
}

function hookSlots(node, onChange) {
    for (let i = 1; i <= MAX_SLOTS; i++) {
        const w = findW(node, `asset_${i}`);
        if (w && !w._tjGuard) { w._tjGuard = true; guardSlot(node, w); }
        hook(w, onChange);
    }
}

function updateVisibility(node, opts) {
    applyLayout(node, () => {
        const mode = findW(node, "mode")?.value;
        const count = openSlots(node);
        setHidden(findW(node, "project"), mode !== "project");
        setHidden(findW(node, "asset_count"), true);
        for (let i = 1; i <= MAX_SLOTS; i++) setHidden(findW(node, `asset_${i}`), mode !== "assets" || i > count);
    }, opts);
}

// ── wireless Set/Get (same recipe as the other TJ nodes) ─────────────────────

function collectExistingSets(node) {
    const used = new Set();
    for (const n of node.graph?._nodes || []) {
        if (n === node) continue;
        if (n.type === "TJ_SetNode") {
            const w = n.widgets?.find((x) => x.name === "set_name" || x.name === "setnode_name");
            if (w?.value) used.add(String(w.value).trim());
        }
        if (n.properties?.auto_sets) Object.values(n.properties.auto_sets).forEach((v) => { if (v) used.add(String(v).trim()); });
    }
    return used;
}

function notifyGetNodes(node) {
    setTimeout(() => {
        for (const n of node.graph?._nodes || []) {
            if (n.type === "TJ_GetNode") {
                if (n._syncWithSetNode) n._syncWithSetNode();
                const w = n.widgets?.find((x) => x.name === "set_name");
                if (w && n._connectToSetNode) n._connectToSetNode(w.value);
            }
            if (n.type === "TJ_MultiGetNode") {
                if (n._syncWithSetNodes) n._syncWithSetNodes();
                if (n._rebuild) n._rebuild();
            }
        }
        app.canvas?.setDirty(true, true);
    }, 50);
}

function updateAutoSets(node) {
    if (!node || !node.graph) return;
    if (!node.properties) node.properties = {};
    const setW = findW(node, "setnode_name");
    const enabled = !!findW(node, "auto_set")?.value;
    node.properties.auto_sets = {};
    const used = collectExistingSets(node);
    const base = String(setW?.value || node.title || "H3Ref").trim();
    (node.outputs || []).forEach((out, i) => {
        if (!out) return;
        const raw = (node.comfyClass === I2V ? OUTPUT_NAMES_I2V : OUTPUT_NAMES)[i] || `out_${i + 1}`;
        const setLabel = (txt) => { out.name = txt; out.label = txt; out.localized_name = txt; };
        if (!enabled) { setLabel(raw); return; }
        let finalName = `${base}_${raw}`;
        let tries = 1;
        while (used.has(finalName)) finalName = `${base}_${raw}_${tries++}`;
        used.add(finalName);
        node.properties.auto_sets[i] = finalName;
        setLabel(`${finalName} ▶`);
    });
    node.setDirtyCanvas?.(true, true);
    notifyGetNodes(node);
}

function installAutoSet(node) {
    for (const [name, flag] of [["auto_set", "_tj_ref_auto"], ["setnode_name", "_tj_ref_name"]]) {
        const w = findW(node, name);
        if (w && !w[flag]) {
            w[flag] = true;
            const orig = w.callback;
            w.callback = function (v) { if (orig) orig.call(this, v); updateAutoSets(node); };
        }
    }
    requestAnimationFrame(() => updateAutoSets(node));
}

// ── "@" autocomplete in the prompt ───────────────────────────────────────────
// Typing "@" lists what the prompt can refer to: the project's aliases (project mode) or the
// picked assets (assets mode). Up / Down move, Enter or Tab inserts, Esc closes.

const assetIdOf = (value) => {
    const text = String(value || "");
    const tagged = /\[id:(\d+)\]\s*$/.exec(text) || /^\s*(\d+)/.exec(text);
    return tagged ? Number(tagged[1]) : null;
};

// An asset without an alias can be written by its library name when that is a valid alias and unique
// among what is attached (same rule as resolve.py).
const NAME_TOKEN = /^[\p{L}_][\p{L}\p{N}_]*$/u;
function nameToken(asset, byId, items) {
    if (!NAME_TOKEN.test(asset.name)) return null;
    const same = (items || []).filter((i) => !i.alias && byId.get(i.asset_id)?.name.toLowerCase() === asset.name.toLowerCase());
    return same.length === 1 ? asset.name : null;
}

async function mentionCandidates(node) {
    if (!node._tjAssets) node._tjAssets = (await getJson("/tj_node/reflib/assets?limit=2000")).assets || [];
    const byId = new Map(node._tjAssets.map((a) => [a.id, a]));
    const out = [];
    if (findW(node, "mode")?.value === "project") {
        const pid = assetIdOf(findW(node, "project")?.value);
        const project = pid == null ? null : (await getJson(`/tj_node/reflib/projects/${pid}`)).project;
        for (const it of project?.items || []) {
            const a = byId.get(it.asset_id);
            if (a) out.push({ token: it.alias || nameToken(a, byId, project.items) || String(a.id), id: a.id, alias: it.alias, asset: a });
        }
    } else {
        for (let i = 1; i <= MAX_SLOTS; i++) {
            const id = assetIdOf(findW(node, `asset_${i}`)?.value);
            const a = id == null ? null : byId.get(id);
            if (a && !out.some((c) => c.id === id)) out.push({ token: String(id), id, alias: null, asset: a, _name: true });
        }
    }
    // assets mode: the library name when unique and valid, otherwise the id
    for (const c of out) {
        if (!c._name) continue;
        const same = out.filter((o) => o.asset.name.toLowerCase() === c.asset.name.toLowerCase());
        if (NAME_TOKEN.test(c.asset.name) && same.length === 1) c.token = c.asset.name;
    }
    return out;
}

let mentionPopup = null;
function popup() {
    if (mentionPopup) return mentionPopup;
    mentionPopup = document.createElement("div");
    mentionPopup.style.cssText = "position:fixed;z-index:10000;display:none;min-width:240px;max-height:260px;overflow:auto;" +
        "background:#1d1d1d;border:1px solid #4a6a8a;border-radius:6px;box-shadow:0 4px 14px #000a;font:12px sans-serif;color:#ddd;";
    document.body.append(mentionPopup);
    return mentionPopup;
}

function installMentions(node) {
    const ta = findW(node, "prompt")?.element;
    if (!ta || ta._tjMentions) return;
    ta._tjMentions = true;
    const box = popup();
    const state = { items: [], index: 0, match: null };
    const hide = () => { box.style.display = "none"; state.items = []; };
    const draw = () => {
        box.replaceChildren(...state.items.map((c, i) => {
            const row = document.createElement("div");
            row.style.cssText = "display:flex;gap:8px;align-items:center;padding:3px 8px;cursor:pointer;" + (i === state.index ? "background:#2f4a66;" : "");
            const img = document.createElement("img");
            img.src = api.apiURL(`/tj_node/reflib/thumb/${c.id}`);
            img.style.cssText = "width:28px;height:28px;object-fit:cover;border-radius:3px;background:#000;";
            const text = document.createElement("div");
            text.textContent = `@${c.token}   #${c.id} ${c.asset.name} · ${c.asset.kind} · ${c.asset.category}`;
            row.append(img, text);
            row.addEventListener("mousedown", (e) => { e.preventDefault(); insert(i); });
            return row;
        }));
        box.children[state.index]?.scrollIntoView({ block: "nearest" });
    };
    const insert = (i) => {
        const c = state.items[i], m = state.match;
        if (!c || !m) return;
        const at = m.start, end = ta.selectionStart;
        ta.value = ta.value.slice(0, at) + `@${c.token} ` + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = at + c.token.length + 2;
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        hide();
    };
    let seq = 0;
    const update = async () => {
        const before = ta.value.slice(0, ta.selectionStart);
        const m = /(?:^|[^\p{L}\p{N}_@])@([\p{L}\p{N}_]*)$/u.exec(before);
        if (!m) return hide();
        const mine = ++seq;
        const query = m[1].toLowerCase();
        const all = await mentionCandidates(node).catch(() => []);
        if (mine !== seq) return;
        state.items = all.filter((c) => !query || c.token.toLowerCase().startsWith(query) ||
            c.asset.name.toLowerCase().includes(query) || String(c.id).startsWith(query));
        state.match = { start: ta.selectionStart - m[1].length - 1 };
        state.index = 0;
        if (!state.items.length) return hide();
        const r = ta.getBoundingClientRect();
        box.style.left = `${Math.max(4, r.left)}px`;
        box.style.top = `${r.bottom + 2}px`;
        box.style.display = "block";
        draw();
    };
    ta.addEventListener("input", update);
    ta.addEventListener("click", update);
    ta.addEventListener("blur", () => setTimeout(hide, 120));
    ta.addEventListener("keydown", (e) => {
        if (box.style.display === "none" || !state.items.length) return;
        const stop = () => { e.preventDefault(); e.stopPropagation(); };
        if (e.key === "ArrowDown") { stop(); state.index = (state.index + 1) % state.items.length; draw(); }
        else if (e.key === "ArrowUp") { stop(); state.index = (state.index - 1 + state.items.length) % state.items.length; draw(); }
        else if (e.key === "Enter" || e.key === "Tab") { stop(); insert(state.index); }
        else if (e.key === "Escape") { stop(); hide(); }
    }, true);
}

// ── setup ────────────────────────────────────────────────────────────────────

function hook(w, fn) {
    if (!w || w._tjRefHook) return;
    w._tjRefHook = true;
    const orig = w.callback;
    w.callback = function (v) { if (orig) orig.apply(this, arguments); fn(v); };
}

function setupWireless(node) {
    try { window.TJ_NODE_applyTheme?.(node); } catch (_) {}
    try { window.TJ_NODE_attachProviderNameSync?.(node); } catch (_) {}
    const clipIndex = node.inputs?.findIndex((i) => i.name === "clip");
    if (clipIndex >= 0) {
        try { window.TJ_NODE_attachGetReceiver?.(node, { inputIndex: clipIndex, inputName: "clip", defaultType: "CLIP" }); } catch (_) {}
    }
    installAutoSet(node);
}

// Image to Video: first / last frame combos list image assets only and show their thumbnails.
async function refreshImageAssets(node) {
    const r = await getJson("/tj_node/reflib/assets?kind=image&limit=2000");
    const rank = (c) => CATEGORIES.indexOf(c);
    const list = (r.assets || []).sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name));
    const values = ["(none)", ...list.map(assetLabel)];
    for (const name of ["first_asset", "last_asset"]) {
        const w = findW(node, name);
        if (w) w.options.values = w.value && w.value !== "(none)" && !values.includes(w.value) ? [...values, w.value] : values;
    }
}

function setupI2V(node) {
    setupWireless(node);
    resizableMultiline(node, "prompt", "height_prompt", 110);
    fitToContent(node);
    const slot = (name) => {
        const img = document.createElement("img");
        img.style.cssText = "flex:1 1 0;min-width:0;height:100%;object-fit:contain;background:#111;border:1px solid #333;border-radius:4px;";
        img.alt = name;
        return img;
    };
    const first = slot("first"), last = slot("last");
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;width:100%;height:100%;";
    row.append(first, last);
    const dw = node.addDOMWidget("frame_preview", "tj_ref_frames", row, { serialize: false });
    delete dw.computeSize;
    dw.computeLayoutSize = () => ({ minHeight: 96, maxHeight: 96, minWidth: 200, maxWidth: 1e6 });
    const show = () => {
        for (const [img, name] of [[first, "first_asset"], [last, "last_asset"]]) {
            const id = assetIdOf(findW(node, name)?.value);
            img.style.visibility = id == null ? "hidden" : "visible";
            if (id != null) img.src = api.apiURL(`/tj_node/reflib/thumb/${id}`);
        }
    };
    hook(findW(node, "first_asset"), show);
    hook(findW(node, "last_asset"), show);
    node._tjShowFrames = show;
    show();
    refreshImageAssets(node).catch(() => {});
}

function setupH3(node) {
    setupWireless(node);
    resizableMultiline(node, "prompt", "height_prompt", 140);
    fitToContent(node);
    installMentions(node);

    if (!node._tjInfoBox) {
        const btn = node.addWidget("button", "Load / Refresh library", null, () => loadInfo(node));
        btn.serialize = false;
        node._tjInfoBox = addTextBox(node, "ref_info", 150);
        node._tjInfoBox.value = "Press 'Load / Refresh library' to list the project / attached assets,\n" +
            "their prompt labels and the match-check result.";
    }
    hook(findW(node, "mode"), () => updateVisibility(node));
    hookSlots(node, () => updateVisibility(node));
    updateVisibility(node);
    refreshLists(node).catch(() => {});
}

app.registerExtension({
    name: "TJ.RefLibrary",
    async nodeCreated(node) {
        const type = node.comfyClass || node.type;
        if (type === I2V) {
            setupI2V(node);
            const origConfigure = node.onConfigure;
            node.onConfigure = function () {
                origConfigure?.apply(this, arguments);
                requestAnimationFrame(() => {
                    this._tjShowFrames?.();
                    refreshImageAssets(this).catch(() => {});
                    this._tjUpdateGetReceiverOptions?.();
                    const gw = findW(this, "get_name");
                    if (gw && gw.value && gw.value !== "(none)") this._tjConnectGetReceiver?.(gw.value);
                });
            };
            const origDraw = node.onDrawForeground;
            node.onDrawForeground = function () {
                this._tjUpdateGetReceiverOptions?.();
                return origDraw?.apply(this, arguments);
            };
        } else if (type === H3) {
            setupH3(node);
            const origConfigure = node.onConfigure;
            node.onConfigure = function () {
                origConfigure?.apply(this, arguments);
                requestAnimationFrame(() => {
                    updateVisibility(this, { keepSize: true });
                    refreshLists(this).catch(() => {});
                    this._tjUpdateGetReceiverOptions?.();
                    const gw = findW(this, "get_name");
                    if (gw && gw.value && gw.value !== "(none)") this._tjConnectGetReceiver?.(gw.value);
                });
            };
            const origDraw = node.onDrawForeground;
            node.onDrawForeground = function () {
                this._tjUpdateGetReceiverOptions?.();
                return origDraw?.apply(this, arguments);
            };
            const origExecuted = node.onExecuted;
            node.onExecuted = function (message) {
                origExecuted?.apply(this, arguments);
                const text = message?.text?.[0];
                if (text && this._tjInfoBox) {
                    try { this._tjInfoBox.value = formatReport(JSON.parse(text)); } catch (_) { this._tjInfoBox.value = text; }
                }
            };
        } else if (type === REGISTER || type === PROJECT_SAVE) {
            if (type === REGISTER) {
                // as_set only means something for an image batch, set_mode only for as_set
                const show = (opts) => applyLayout(node, () => {
                    const imageLinked = node.inputs?.find((i) => i.name === "image")?.link != null;
                    const asSet = findW(node, "as_set");
                    setHidden(asSet, !imageLinked);
                    setHidden(findW(node, "set_mode"), !imageLinked || !asSet?.value);
                }, opts);
                hook(findW(node, "as_set"), show);
                const origConn = node.onConnectionsChange;
                node.onConnectionsChange = function () { origConn?.apply(this, arguments); show(); };
                const origConf = node.onConfigure;
                node.onConfigure = function () { origConf?.apply(this, arguments); requestAnimationFrame(() => show({ keepSize: true })); };
                show();
            }
            if (type === PROJECT_SAVE) {
                const show = (opts) => applyLayout(node, () => {
                    const count = openSlots(node);
                    setHidden(findW(node, "asset_count"), true);
                    for (let i = 1; i <= MAX_SLOTS; i++) {
                        setHidden(findW(node, `asset_${i}`), i > count);
                        setHidden(findW(node, `alias_${i}`), i > count);
                    }
                }, opts);
                hookSlots(node, show);
                addCategoryFilter(node);
                const btn = node.addWidget("button", "Refresh library list", null, () => refreshLists(node));
                btn.serialize = false;
                show();
                refreshLists(node).catch(() => {});
                const origConfigure = node.onConfigure;
                node.onConfigure = function () {
                    origConfigure?.apply(this, arguments);
                    requestAnimationFrame(() => { show({ keepSize: true }); refreshLists(this).catch(() => {}); });
                };
            }
            const box = addTextBox(node, "last_result", 80);
            fitToContent(node);
            box.value = "(not run yet)";
            const origExecuted = node.onExecuted;
            node.onExecuted = function (message) {
                origExecuted?.apply(this, arguments);
                if (message?.text) box.value = message.text.join("\n");
            };
        }
    },
});
