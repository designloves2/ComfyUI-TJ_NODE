// web/tj_llm_model_ui.js
// The model section shared by LLM (TJ) and Scene Maker (TJ): backend-driven widget visibility,
// API key field (memory only, never serialised) + "Connect & test" + the server's model list.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyLayout } from "./tj_box_resize.js";

const BASE = "/tj_node/custom_llm";
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

export const findW = (node, name) => node.widgets?.find((w) => w.name === name);

export async function call(path, body) {
    const r = await api.fetchApi(BASE + path, body === undefined ? undefined : {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return r.json();
}

export function el(tag, css, props = {}) {
    const e = document.createElement(tag);
    e.style.cssText = css || "";
    Object.assign(e, props);
    return e;
}

export const FIELD = "background:#1b1b1b;color:#ddd;border:1px solid #3a3a3a;border-radius:4px;padding:4px 6px;font:12px sans-serif;min-width:0;";
export const BUTTON = "background:#2d2d2d;color:#ddd;border:1px solid #4a4a4a;border-radius:4px;padding:4px 8px;cursor:pointer;font:12px sans-serif;";

export function addPanel(node, name, height, children) {
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

export function updateVisibility(node, opts) {
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

function setupConnection(node, after) {
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
    const at = after ? node.widgets.indexOf(findW(node, after)) : -1;
    if (at >= 0) {
        for (const [i, w] of [findW(node, "custom_llm_connection"), modelsW].entries()) {
            node.widgets.splice(node.widgets.indexOf(w), 1);
            node.widgets.splice(at + 1 + i, 0, w);
        }
    }

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

export function setupLlmModelUi(node, after) {
    setupConnection(node, after);
    const backendW = findW(node, "backend");
    if (backendW) {
        const orig = backendW.callback;
        backendW.callback = function () { orig?.apply(this, arguments); updateVisibility(node); };
    }
    updateVisibility(node);
}
