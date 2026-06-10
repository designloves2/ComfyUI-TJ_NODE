import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "TJ_SaveAndPreviewVideo";
const WIDGET_NAME = "tj_savepreview_video_viewer_force";
const CSS_ID = "tj-savepreview-video-viewer-force-css-v67";
const MIN_W = 340;
const DEFAULT_H = 360;
const PREVIEW_MIN_H = 160;
const CHROME = 150;

function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style");
  s.id = CSS_ID;
  s.textContent = `
.tjvforce{position:absolute;inset:0;overflow:hidden;background:#000;border-radius:4px;font:11px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
.tjvforce video{display:block;width:100%;height:100%;object-fit:contain;background:#000;}
.tjvforce .audioBox{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:10px;padding:18px;box-sizing:border-box;background:#000;}
.tjvforce .audioBox audio{width:min(92%,520px);height:36px;}
.tjvforce .info{position:absolute;left:0;right:0;bottom:0;padding:5px 38px 5px 8px;color:#dfffea;text-align:center;background:rgba(0,0,0,.72);pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.tjvforce .info:empty{display:none;}
.tjvforce .warn{position:absolute;right:8px;bottom:4px;width:24px;height:24px;border-radius:50%;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.62);color:#ffd24a;font-size:15px;cursor:help;z-index:4;}
.tjvforce .warn[hidden]{display:none;}
.tjvforce .ctrls{position:absolute;top:5px;right:5px;display:flex;gap:4px;z-index:5;opacity:.78;}
.tjvforce .ctrls:hover{opacity:1;}
.tjvforce .ctrls button{min-width:22px;height:20px;padding:0 5px;border:1px solid rgba(0,191,255,.55);border-radius:4px;background:rgba(0,0,0,.55);color:#dfffea;font-size:10px;line-height:18px;cursor:pointer;}
.tjvforce .ctrls button:hover{background:rgba(0,80,140,.75);}
.tjvforce .ctrls button.active{color:#00efff;border-color:#00efff;box-shadow:0 0 5px rgba(0,239,255,.32);}
.tjvforce .ctrls button[hidden]{display:none;}
`;
  document.head.appendChild(s);
}

function nativeHeight(node) {
  const rowH = (window.LiteGraph && window.LiteGraph.NODE_WIDGET_HEIGHT) || 20;
  let h = 0;
  for (const w of node.widgets || []) {
    if (w.name === WIDGET_NAME || w === node.__tjvforce?.widget) continue;
    if (w.hidden || w._hidden) continue;
    let wh = rowH;
    if (typeof w.computeSize === "function") {
      const c = w.computeSize(node.size?.[0] || MIN_W);
      wh = c && c[1] > 0 ? c[1] : 0;
    }
    if (wh > 0) h += wh + 4;
  }
  return h;
}

function findMetas(obj, out = []) {
  if (!obj) return out;
  if (Array.isArray(obj)) {
    for (const x of obj) findMetas(x, out);
    return out;
  }
  if (typeof obj === "object") {
    if (obj.filename && (obj.type || obj.media_type)) out.push(obj);
    for (const v of Object.values(obj)) findMetas(v, out);
  }
  return out;
}

function fmt(meta, video) {
  const parts = [];
  const w = Number(meta?.width || video?.videoWidth || 0);
  const h = Number(meta?.height || video?.videoHeight || 0);
  const fps = Number(meta?.frame_rate || meta?.fps || 0);
  const fc = Number(meta?.frame_count || 0);
  if (w && h) parts.push(`${Math.round(w)}x${Math.round(h)}`);
  if (fps) parts.push(`${Math.round(fps * 100) / 100}fps`);
  if (fc) parts.push(`${Math.round(fc)}f`);
  return parts.join(" | ");
}

function metaUrl(meta) {
  const params = new URLSearchParams({
    filename: meta.filename,
    subfolder: meta.subfolder || "",
    type: meta.type || "temp",
    rand: String(Date.now()),
  });
  return api.apiURL("/view?" + params.toString());
}

function fallbackTitle(meta) {
  const list = Array.isArray(meta?.fallback_outputs) ? meta.fallback_outputs : [];
  if (!list.length) return "";
  return "Fallback outputs active\n\n" + list.map(x => `${x.slot || "output"} -> ${x.fallback || "fallback"}`).join("\n");
}

function updateFallbackWarning(state, meta) {
  if (!state?.warn) return;
  const title = fallbackTitle(meta);
  if (!title) {
    state.warn.hidden = true;
    state.warn.style.display = "none";
    state.warn.title = "";
    return;
  }
  state.warn.hidden = false;
  state.warn.style.display = "flex";
  state.warn.title = title;
}

function getLoopEnabled(node) {
  if (!node.properties) node.properties = {};
  if (node.properties.tj_video_loop_enabled === undefined) node.properties.tj_video_loop_enabled = true;
  return !!node.properties.tj_video_loop_enabled;
}

function saveLastPreview(node, kind, metas) {
  if (!node || !metas?.length) return;
  if (!node.properties) node.properties = {};
  node.properties.tj_last_video_preview = {
    kind,
    metas: JSON.parse(JSON.stringify(metas)),
    saved_at: Date.now(),
  };
}

function restoreLastPreview(node) {
  const saved = node?.properties?.tj_last_video_preview;
  if (!saved || !Array.isArray(saved.metas) || !saved.metas.length) return false;
  try {
    if (saved.kind === "audio") setAudioPreview(node, saved.metas);
    else setVideoPreview(node, saved.metas[0]);
    return true;
  } catch (e) {
    console.warn("[TJ_NODE] video preview restore failed", e);
    return false;
  }
}

function syncPlayAllVideoPreviews() {
  const nodes = app.graph?._nodes || [];
  for (const n of nodes) {
    const v = n?.type === NODE_NAME ? n.__tjvforce?.video : null;
    if (!v || !v.src || v.style.display === "none") continue;
    try {
      v.pause();
      v.currentTime = 0;
    } catch (_) {}
  }
  for (const n of nodes) {
    const v = n?.type === NODE_NAME ? n.__tjvforce?.video : null;
    if (!v || !v.src || v.style.display === "none") continue;
    try { v.play?.(); } catch (_) {}
  }
}

function syncPlayCurrentAudioPreview(node) {
  const audios = Array.from(node?.__tjvforce?.audioBox?.querySelectorAll?.("audio") || []);
  if (audios.length < 2) return;
  for (const a of audios) {
    try {
      a.pause();
      a.currentTime = 0;
    } catch (_) {}
  }
  for (const a of audios) {
    try { a.play?.(); } catch (_) {}
  }
}

function build(node) {
  if (node.__tjvforce) return node.__tjvforce;
  ensureCss();

  const root = document.createElement("div");
  root.className = "tjvforce";

  const video = document.createElement("video");
  video.controls = true;
  video.loop = getLoopEnabled(node);
  video.preload = "metadata";
  video.playsInline = true;

  const audioBox = document.createElement("div");
  audioBox.className = "audioBox";

  const info = document.createElement("div");
  info.className = "info";
  info.textContent = "Run to preview the encoded video.";

  const warn = document.createElement("div");
  warn.className = "warn";
  warn.textContent = "⚠";
  warn.hidden = true;

  const ctrls = document.createElement("div");
  ctrls.className = "ctrls";
  const syncBtn = document.createElement("button");
  syncBtn.type = "button";
  syncBtn.textContent = "SYNC";
  syncBtn.title = "Start all TJ video previews from frame 0";
  const audioSyncBtn = document.createElement("button");
  audioSyncBtn.type = "button";
  audioSyncBtn.textContent = "A/B▶";
  audioSyncBtn.title = "Start audio A/B previews from 0";
  audioSyncBtn.hidden = true;
  const loopBtn = document.createElement("button");
  loopBtn.type = "button";
  loopBtn.textContent = "LOOP";
  loopBtn.title = "Toggle loop for this preview";
  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.textContent = "↻";
  refreshBtn.title = "Reload this node's last preview";
  ctrls.appendChild(syncBtn);
  ctrls.appendChild(audioSyncBtn);
  ctrls.appendChild(loopBtn);
  ctrls.appendChild(refreshBtn);

  root.appendChild(video);
  root.appendChild(audioBox);
  root.appendChild(info);
  root.appendChild(warn);
  root.appendChild(ctrls);

  const widget = node.addDOMWidget(WIDGET_NAME, "div", root, { serialize: false, hideOnZoom: false });
  const state = node.__tjvforce = { root, video, audioBox, info, warn, ctrls, syncBtn, audioSyncBtn, loopBtn, refreshBtn, widget, currentMeta: null };

  function updateLoopButton() {
    const enabled = getLoopEnabled(node);
    video.loop = enabled;
    loopBtn.classList.toggle("active", enabled);
  }
  updateLoopButton();

  syncBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); syncPlayAllVideoPreviews(); });
  audioSyncBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); syncPlayCurrentAudioPreview(node); });
  loopBtn.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!node.properties) node.properties = {};
    node.properties.tj_video_loop_enabled = !getLoopEnabled(node);
    updateLoopButton();
    node.setDirtyCanvas?.(true, true);
  });
  refreshBtn.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!restoreLastPreview(node)) info.textContent = "No saved preview to refresh.";
  });

  widget.computeSize = function(width) {
    const nh = Number(node.size?.[1]) || DEFAULT_H;
    return [Math.max(Number(width) || MIN_W, MIN_W), Math.max(PREVIEW_MIN_H, nh - CHROME - nativeHeight(node))];
  };

  video.addEventListener("loadedmetadata", () => {
    info.textContent = fmt(state.currentMeta, video) || "preview ready";
    node.setDirtyCanvas?.(true,true);
  });
  video.addEventListener("error", () => {
    info.textContent = "Preview load failed.";
    node.setDirtyCanvas?.(true,true);
  });
  root.addEventListener("wheel", (e) => {
    const cv = app.canvas?.canvas; if (!cv) return;
    e.preventDefault();
    cv.dispatchEvent(new WheelEvent("wheel", { deltaX:e.deltaX, deltaY:e.deltaY, deltaZ:e.deltaZ, deltaMode:e.deltaMode, clientX:e.clientX, clientY:e.clientY, bubbles:true, cancelable:true }));
  }, { passive:false });

  if ((node.size?.[0] || 0) < MIN_W || (node.size?.[1] || 0) < DEFAULT_H) {
    node.setSize?.([Math.max(node.size?.[0] || 0, MIN_W), Math.max(node.size?.[1] || 0, DEFAULT_H)]);
  }
  node.setDirtyCanvas?.(true,true);
  app.canvas?.setDirty(true,true);
  console.log("[TJ_NODE] Save & Preview Video viewer attached", node.id);
  return state;
}

function setVideoPreview(node, meta) {
  const st = build(node);
  st.currentMeta = meta;
  st.audioBox.style.display = "none";
  st.audioBox.innerHTML = "";
  if (st.audioSyncBtn) st.audioSyncBtn.hidden = true;
  st.video.style.display = "block";
  st.video.loop = getLoopEnabled(node);
  st.loopBtn?.classList.toggle("active", st.video.loop);
  st.info.textContent = `Loading preview: ${meta.filename}`;
  st.video.pause();
  st.video.removeAttribute("src");
  st.video.src = metaUrl(meta);
  st.video.load();
  updateFallbackWarning(st, meta);
}

function setAudioPreview(node, metas) {
  const st = build(node);
  st.currentMeta = metas[0] || null;
  st.video.pause();
  st.video.removeAttribute("src");
  st.video.style.display = "none";
  st.audioBox.innerHTML = "";
  st.audioBox.style.display = "flex";
  for (const meta of metas) {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = metaUrl(meta);
    audio.title = meta.label ? `Audio ${meta.label}` : meta.filename;
    st.audioBox.appendChild(audio);
  }
  if (st.audioSyncBtn) st.audioSyncBtn.hidden = !(metas.length >= 2);
  st.info.textContent = metas.map(m => m.label ? `Audio ${m.label}` : m.filename).join("  |  ") || "audio preview";
  updateFallbackWarning(st, metas.find(m => Array.isArray(m.fallback_outputs)) || metas[0]);
  node.setDirtyCanvas?.(true,true);
}

function reflowViewer(node) {
  if (!node) return;
  try {
    build(node);
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
  } catch (e) {
    console.warn("[TJ_NODE] video viewer reflow failed", e);
  }
}

function getTJGraphLink(graph, linkId) {
  if (!graph || linkId == null) return null;
  return graph.links?.[linkId] || graph.links?.get?.(linkId) || null;
}

function armImageVideoMutex(node, delay = 300) {
  if (!node) return;
  node.__tjv_mutex_ready = false;
  clearTimeout(node.__tjv_mutex_timer);
  node.__tjv_mutex_timer = setTimeout(() => {
    node.__tjv_mutex_ready = true;
  }, delay);
}

function enforceImageVideoMutex(node, changedIndex, connected) {
  // Only enforce this during real user-side connection changes.
  // During workflow load / refresh, ComfyUI replays existing links through
  // onConnectionsChange; removing the opposite slot there breaks saved image links.
  if (!connected || !node?.__tjv_mutex_ready || !node?.graph || !node.inputs) return;

  const imageInput = node.inputs[0];
  const videoInput = node.inputs[1];
  if (!imageInput || !videoInput) return;

  const otherIndex = changedIndex === 0 ? 1 : (changedIndex === 1 ? 0 : -1);
  if (otherIndex < 0) return;

  const changed = node.inputs[changedIndex];
  const other = node.inputs[otherIndex];
  const changedLink = getTJGraphLink(node.graph, changed?.link);
  const otherLink = getTJGraphLink(node.graph, other?.link);

  // Do not let the image/video mutex touch TJ fake-wire links.
  // Embedded get wiring is managed by the TJ wireless core.
  if (changedLink?._tj_wireless || otherLink?._tj_wireless) return;

  if (other?.link != null) {
    try { node.graph.removeLink(other.link); } catch (_) {}
    if (node.inputs?.[otherIndex]) node.inputs[otherIndex].link = null;
  }
}

function setWidgetHidden(widget, hidden) {
  if (!widget) return;
  if (!widget._tj_video_adv_saved) widget._tj_video_adv_saved = { type: widget.type, computeSize: widget.computeSize, draw: widget.draw, mouse: widget.mouse };
  widget.type = hidden ? "hidden" : widget._tj_video_adv_saved.type;
  widget.hidden = !!hidden;
  widget.disabled = !!hidden;
  widget.computeSize = hidden ? () => [0, -4] : widget._tj_video_adv_saved.computeSize;
  if (hidden) { widget.draw = () => {}; widget.mouse = () => false; }
  else {
    if (widget._tj_video_adv_saved.draw !== undefined) widget.draw = widget._tj_video_adv_saved.draw; else delete widget.draw;
    if (widget._tj_video_adv_saved.mouse !== undefined) widget.mouse = widget._tj_video_adv_saved.mouse; else delete widget.mouse;
  }
}

function moveWidgetToBottom(node, widget) {
  if (!node?.widgets || !widget) return;
  const idx = node.widgets.indexOf(widget);
  if (idx >= 0 && idx !== node.widgets.length - 1) {
    node.widgets.splice(idx, 1);
    node.widgets.push(widget);
  }
}

function installVideoAdvancedToggle(node) {
  if (!node || node._tj_video_adv_toggle_installed) return;
  node._tj_video_adv_toggle_installed = true;
  if (!node.properties) node.properties = {};
  if (node.properties.tj_video_advanced === undefined) node.properties.tj_video_advanced = false;

  const names = ["begin_frame", "end_frame", "save_type", "audio_monitor", "filename_prefix", "path"];
  const apply = () => {
    const show = !!node.properties.tj_video_advanced;
    for (const name of names) setWidgetHidden(node.widgets?.find(w => w.name === name), !show);
    if (node._tj_video_adv_btn) node._tj_video_adv_btn.textContent = show ? "Hide advanced settings" : "Show advanced settings";
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
    reflowViewer(node);
  };

  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;justify-content:center;padding:2px;height:22px;box-sizing:border-box;width:100%;max-width:100%;";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Show advanced settings";
  btn.style.cssText = "width:100%;height:20px;background:#151515;color:#ddd;border:1px solid #555;border-radius:2px;cursor:pointer;font-size:11px;line-height:18px;box-sizing:border-box;";
  row.appendChild(btn);
  node._tj_video_adv_btn = btn;

  const widget = node.addDOMWidget("tj_video_advanced_toggle", "btn", row, { serialize:false, hideOnZoom:false });
  widget.computeSize = function(width) {
    const w = Math.max(180, Number(width || node.size?.[0] || MIN_W) - 20);
    row.style.width = `${w}px`;
    row.style.maxWidth = `${w}px`;
    return [w, 26];
  };
  moveWidgetToBottom(node, widget);

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    node.properties.tj_video_advanced = !node.properties.tj_video_advanced;
    apply();
  });

  requestAnimationFrame(apply);
}

app.registerExtension({
  name: "TJ.SaveAndPreviewVideo.ForceViewer",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;

    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
      const r = created?.apply(this, arguments);
      try { build(this); installVideoAdvancedToggle(this); armImageVideoMutex(this, 300); } catch (e) { console.warn("[TJ_NODE] video viewer create failed", e); }
      return r;
    };

    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function() {
      this.__tjv_mutex_ready = false;
      const r = configured?.apply(this, arguments);
      queueMicrotask(() => {
        try { build(this); installVideoAdvancedToggle(this); restoreLastPreview(this); armImageVideoMutex(this, 500); }
        catch (e) { console.warn("[TJ_NODE] video viewer configure failed", e); }
      });
      return r;
    };

    const conn = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function(type, index, connected) {
      const r = conn?.apply(this, arguments);
      try {
        if (type === LiteGraph.INPUT && (index === 0 || index === 1)) enforceImageVideoMutex(this, index, connected);
      } catch (e) { console.warn("[TJ_NODE] image/video mutex failed", e); }
      return r;
    };

    const resized = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function(size) {
      const r = resized?.apply(this, arguments);
      reflowViewer(this);
      return r;
    };

    const executed = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function(output) {
      const r = executed?.apply(this, arguments);
      try {
        const metas = findMetas(output?.tj_video || output?.ui?.tj_video || output);
        const audioMetas = metas.filter(m => m.media_type === "audio_file");
        const videoMeta = metas.find(m => m.media_type !== "audio_file");
        if (audioMetas.length && !videoMeta) { saveLastPreview(this, "audio", audioMetas); setAudioPreview(this, audioMetas); }
        else if (videoMeta) { saveLastPreview(this, "video", [videoMeta]); setVideoPreview(this, videoMeta); }
        else build(this).info.textContent = "No tj_video metadata returned.";
      } catch (e) { console.warn("[TJ_NODE] video viewer executed failed", e); }
      return r;
    };
  }
});
