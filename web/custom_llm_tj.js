// web/custom_llm_tj.js
// Custom LLM (TJ): API key field (memory only, never serialised) + "Connect & test" + model list,
// system-prompt presets (pick / save / save as new / delete), wireless Set/Get.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyLayout, fitToContent, resizableMultiline } from "./tj_box_resize.js";

const NODE = "TJ_CustomLLM";
const OUTPUT_NAMES = ["text", "info"];
const BASE = "/tj_node/custom_llm";
const NO_PRESET = "(custom)";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// which widgets each backend uses (everything else - prompt, presets, tokens... - is always shown)
const BACKEND_WIDGETS = {
    "GGUF / llama.cpp": ["gguf_model", "mmproj_file", "chat_handler", "n_gpu_layers", "n_ctx"],
    "ComfyUI TextGenerate": ["text_encoder_name", "clip_loader_type"],
    "Open Router": ["model", "max_image_px"],
    "Connect Custom": ["api_base", "model", "context", "max_image_px"],
};
const ALL_BACKEND_WIDGETS = [...new Set(Object.values(BACKEND_WIDGETS).flat())];
const HTTP_BACKENDS = ["Open Router", "Connect Custom"];

const findW = (node, name) => node.widgets?.find((w) => w.name === name);

async function call(path, body) {
    const r = await api.fetchApi(BASE + path, body === undefined ? undefined : {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return r.json();
}

function el(tag, css, props = {}) {
    const e = document.createElement(tag);
    e.style.cssText = css || "";
    Object.assign(e, props);
    return e;
}

const FIELD = "background:#1b1b1b;color:#ddd;border:1px solid #3a3a3a;border-radius:4px;padding:4px 6px;font:12px sans-serif;min-width:0;";
const BUTTON = "background:#2d2d2d;color:#ddd;border:1px solid #4a4a4a;border-radius:4px;padding:4px 8px;cursor:pointer;font:12px sans-serif;";

function addPanel(node, name, height, children) {
    const row = el("div", "display:flex;flex-direction:column;gap:4px;width:100%;height:100%;box-sizing:border-box;");
    row.append(...children);
    const dw = node.addDOMWidget(name, "tj_custom_llm", row, { serialize: false });
    delete dw.computeSize;
    dw.computeLayoutSize = () => (dw._tjHidden ? { minHeight: 0, maxHeight: 0, minWidth: 0, maxWidth: 1e6 }
        : { minHeight: height, maxHeight: height, minWidth: 240, maxWidth: 1e6 });
    return dw;
}

function setHidden(w, hide) {
    if (!w) return;
    if (w.element) {                       // DOM panel
        w._tjHidden = hide;
        w.element.style.display = hide ? "none" : "";
        return;
    }
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

function updateVisibility(node, opts) {
    applyLayout(node, () => {
        const backend = findW(node, "backend")?.value;
        const used = BACKEND_WIDGETS[backend] || [];
        for (const name of ALL_BACKEND_WIDGETS) setHidden(findW(node, name), !used.includes(name));
        const http = HTTP_BACKENDS.includes(backend);
        setHidden(findW(node, "custom_llm_connection"), !http);
        setHidden(findW(node, "models (from server)"), !http);
        if (node._tjCheckKey) setTimeout(node._tjCheckKey, 0);
    }, opts);
}

// ── connection (key + models) ────────────────────────────────────────────────────────────────

function setupConnection(node) {
    const key = el("input", FIELD + "flex:1;", { type: "password", placeholder: "API key (kept in server memory only, not saved)", autocomplete: "off" });
    const connect = el("button", BUTTON, { textContent: "Connect & test" });
    const status = el("div", "font:11px sans-serif;color:#9ab;min-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;");
    const top = el("div", "display:flex;gap:4px;");
    top.append(key, connect);
    addPanel(node, "custom_llm_connection", 58, [top, status]);

    const modelsW = node.addWidget("combo", "models (from server)", "(connect first)", (v) => {
        if (v && !v.startsWith("(")) { const m = findW(node, "model"); if (m) m.value = v; app.canvas?.setDirty(true, true); }
    }, { values: ["(connect first)"] });
    modelsW.serialize = false;

    const say = (text, err = false) => { status.textContent = text; status.style.color = err ? "#f09090" : "#9c9"; };
    const base = () => (findW(node, "backend")?.value === "Open Router" ? OPENROUTER_BASE : findW(node, "api_base")?.value || "");

    async function checkKey() {
        try {
            const r = await call(`/status?base_url=${encodeURIComponent(base())}`);
            if (r.ok) say(r.keyStored ? "key stored in server memory" : "no key stored for this URL (empty key is fine for proxies)", false);
            else say(r.error, true);
        } catch (_) { /* server restarting */ }
    }

    connect.addEventListener("click", async () => {
        say("connecting...");
        const r = await call("/connect", { base_url: base(), api_key: key.value, model: findW(node, "model")?.value || "" });
        key.value = ""; // the server has it now; do not keep it in the page
        if (!r.ok) return say(r.error, true);
        if (r.models?.length) modelsW.options.values = r.models;
        say(`${r.models?.length ? r.models.length + " models" : r.note || "ok"} · ${r.ms} ms · ` +
            (r.modelFound === false ? "model id not in the list · " : "") + (r.keyStored ? "key stored" : "no key"));
    });
    const urlW = findW(node, "api_base");
    if (urlW) {
        const orig = urlW.callback;
        urlW.callback = function () { orig?.apply(this, arguments); checkKey(); };
    }
    node._tjCheckKey = () => { if (HTTP_BACKENDS.includes(findW(node, "backend")?.value)) checkKey(); };
    setTimeout(node._tjCheckKey, 800);
}

// ── system-prompt presets ────────────────────────────────────────────────────────────────────
// The node only holds the preset combo and one "manage" button; creating, editing and deleting
// presets happens in a popup.

function setupPresets(node) {
    const sel = () => findW(node, "system_preset");
    const promptW = () => findW(node, "system_prompt");
    const manage = el("button", BUTTON + "width:100%;", { textContent: "시스템 프롬프트 프리셋 관리..." });
    manage.addEventListener("click", () => openPresetManager(node));
    const panel = addPanel(node, "system_prompt_presets", 30, [manage]);
    const at = node.widgets.indexOf(sel());                    // sit right under the preset combo
    if (at >= 0) { node.widgets.splice(node.widgets.indexOf(panel), 1); node.widgets.splice(at + 1, 0, panel); }

    node._tjRefreshPresets = (presets, pick) => {
        node._tjPresets = presets;
        const w = sel();
        if (!w) return;
        w.options.values = [NO_PRESET, ...presets.map((p) => p.name)];
        if (pick !== undefined) w.value = pick;
        if (!w.options.values.includes(w.value)) w.value = NO_PRESET;
        app.canvas?.setDirty(true, true);
    };
    node._tjUsePreset = (preset) => {            // fill the system_prompt box with a preset's text
        const w = sel();
        if (w) w.value = preset ? preset.name : NO_PRESET;
        if (preset && promptW()) promptW().value = preset.text;
        app.canvas?.setDirty(true, true);
    };
    const w0 = sel();
    if (w0) {
        const orig = w0.callback;
        w0.callback = function () {
            orig?.apply(this, arguments);
            node._tjUsePreset((node._tjPresets || []).find((p) => p.name === w0.value));
        };
    }
    node._tjReloadPresets = async () => {
        const r = await call("/presets");
        if (r.ok) node._tjRefreshPresets(r.presets);
    };
    node._tjReloadPresets();
}

function openPresetManager(node) {
    if (document.getElementById("tj-preset-popup")) return;
    const state = { id: null, armed: false, timer: null };
    const overlay = el("div", "position:fixed;inset:0;background:#000a;z-index:10001;display:flex;align-items:center;justify-content:center;", { id: "tj-preset-popup" });
    const box = el("div", "width:min(880px,92vw);height:min(580px,88vh);background:#1c1c1c;border:1px solid #4a4a4a;border-radius:10px;" +
        "display:flex;flex-direction:column;box-shadow:0 10px 40px #000;color:#ddd;font:13px sans-serif;");
    const head = el("div", "display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid #333;font-weight:600;");
    head.append(el("div", "flex:1;", { textContent: "시스템 프롬프트 프리셋" }), el("button", BUTTON, { textContent: "✕", title: "close (Esc)" }));
    const list = el("div", "overflow:auto;border-right:1px solid #333;padding:6px;display:flex;flex-direction:column;gap:2px;");
    const nameIn = el("input", FIELD + "width:100%;box-sizing:border-box;", { placeholder: "프리셋 이름" });
    const textIn = el("textarea", FIELD + "flex:1;min-height:0;width:100%;box-sizing:border-box;resize:none;line-height:1.5;", { placeholder: "시스템 프롬프트 내용" });
    const msg = el("div", "min-height:16px;font-size:12px;color:#9c9;");
    const editor = el("div", "display:flex;flex-direction:column;gap:8px;padding:10px;min-width:0;min-height:0;");
    editor.append(nameIn, textIn, msg);
    const body = el("div", "display:grid;grid-template-columns:230px 1fr;flex:1;min-height:0;");
    body.append(list, editor);
    const foot = el("div", "display:flex;gap:8px;padding:10px 14px;border-top:1px solid #333;");
    const btnNew = el("button", BUTTON, { textContent: "+ 새 프리셋" });
    const btnDel = el("button", BUTTON + "color:#f0a0a0;border-color:#8a3a3a;", { textContent: "삭제" });
    const btnSave = el("button", BUTTON + "background:#2f4a66;", { textContent: "저장" });
    const btnUse = el("button", BUTTON, { textContent: "이 프리셋 사용하고 닫기" });
    foot.append(btnNew, el("div", "flex:1;"), btnDel, btnSave, btnUse);
    box.append(head, body, foot);
    overlay.append(box);
    document.body.append(overlay);

    const say = (t, err = false) => { msg.textContent = t || ""; msg.style.color = err ? "#f09090" : "#9c9"; };
    const presets = () => node._tjPresets || [];
    const current = () => presets().find((p) => p.id === state.id);
    const disarm = () => { clearTimeout(state.timer); state.armed = false; btnDel.textContent = "삭제"; };
    const close = () => { disarm(); document.removeEventListener("keydown", onKey, true); overlay.remove(); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };

    function draw() {
        list.replaceChildren(...presets().map((p) => {
            const row = el("div", "padding:6px 8px;border-radius:5px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" +
                (p.id === state.id ? "background:#2f4a66;color:#fff;" : ""), { textContent: p.name, title: p.text });
            row.addEventListener("click", () => pick(p.id));
            return row;
        }));
        if (!presets().length) list.append(el("div", "color:#888;padding:8px;", { textContent: "프리셋이 없습니다. '+ 새 프리셋'으로 추가하세요." }));
    }
    function pick(id) {
        disarm();
        state.id = id;
        const p = current();
        nameIn.value = p ? p.name : "";
        textIn.value = p ? p.text : "";
        say("");
        draw();
    }
    function startNew() { pick(null); nameIn.focus(); }

    async function save() {
        const name = nameIn.value.trim();
        if (!name) return say("이름을 입력하세요", true);
        const r = await call("/presets", { id: state.id || undefined, name, text: textIn.value });
        if (!r.ok) return say(r.error, true);
        node._tjRefreshPresets(r.presets);
        state.id = r.presets.find((p) => p.name === name)?.id ?? null;
        draw();
        say(`'${name}' 저장했습니다`);
    }
    async function remove() {
        const p = current();
        if (!p) return say("삭제할 프리셋을 고르세요", true);
        if (!state.armed) {
            state.armed = true;
            btnDel.textContent = `'${p.name}' 삭제? (한 번 더)`;
            state.timer = setTimeout(disarm, 4000);
            return;
        }
        disarm();
        const r = await call("/presets/delete", { id: p.id });
        if (!r.ok) return say(r.error, true);
        node._tjRefreshPresets(r.presets);
        startNew();
        say(`'${p.name}' 삭제했습니다`);
    }

    head.lastChild.addEventListener("click", close);
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
    btnNew.addEventListener("click", startNew);
    btnSave.addEventListener("click", save);
    btnDel.addEventListener("click", remove);
    btnUse.addEventListener("click", () => {
        const p = current();
        if (p) node._tjUsePreset(p);
        else if (textIn.value.trim()) { node._tjUsePreset(null); findW(node, "system_prompt").value = textIn.value; }
        close();
    });
    document.addEventListener("keydown", onKey, true);

    call("/presets").then((r) => {
        if (r.ok) node._tjRefreshPresets(r.presets);
        const selected = presets().find((p) => p.name === findW(node, "system_preset")?.value);
        pick(selected ? selected.id : presets()[0]?.id ?? null);
    });
}

// ── wireless Set/Get (same recipe as the other TJ nodes) ─────────────────────────────────────

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
    const enabled = !!findW(node, "auto_set")?.value;
    node.properties.auto_sets = {};
    const used = collectExistingSets(node);
    const base = String(findW(node, "setnode_name")?.value || node.title || "CustomLLM").trim();
    (node.outputs || []).forEach((out, i) => {
        if (!out) return;
        const raw = OUTPUT_NAMES[i] || `out_${i + 1}`;
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

function setupWireless(node) {
    try { window.TJ_NODE_applyTheme?.(node); } catch (_) {}
    try { window.TJ_NODE_attachProviderNameSync?.(node); } catch (_) {}
    const promptIndex = node.inputs?.findIndex((i) => i.name === "prompt");
    if (promptIndex >= 0) {
        try { window.TJ_NODE_attachGetReceiver?.(node, { inputIndex: promptIndex, inputName: "prompt", defaultType: "STRING" }); } catch (_) {}
    }
    for (const [name, flag] of [["auto_set", "_tj_cl_auto"], ["setnode_name", "_tj_cl_name"]]) {
        const w = findW(node, name);
        if (w && !w[flag]) {
            w[flag] = true;
            const orig = w.callback;
            w.callback = function (v) { if (orig) orig.call(this, v); updateAutoSets(node); };
        }
    }
    requestAnimationFrame(() => updateAutoSets(node));
}

app.registerExtension({
    name: "TJ.CustomLLM",
    async nodeCreated(node) {
        if ((node.comfyClass || node.type) !== NODE) return;
        setupWireless(node);
        resizableMultiline(node, "prompt", "height_prompt", 120);
        resizableMultiline(node, "system_prompt", "height_system_prompt", 90);
        setupConnection(node);
        setupPresets(node);
        const backendW = findW(node, "backend");
        if (backendW) {
            const orig = backendW.callback;
            backendW.callback = function () { orig?.apply(this, arguments); updateVisibility(node); };
        }
        updateVisibility(node);
        fitToContent(node);
        const origConfigure = node.onConfigure;
        node.onConfigure = function () {
            origConfigure?.apply(this, arguments);
            requestAnimationFrame(() => {
                updateVisibility(this, { keepSize: true });
                this._tjReloadPresets?.();
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
    },
});
