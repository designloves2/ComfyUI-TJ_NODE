// web/video_grid_comparer_tj.js
// Video Grid Comparer (TJ) — 독립 비디오 그리드 비교 뷰어
//
// 기능:
//  - 폴더 경로 스캔 + 개별 파일 다중 선택 추가
//  - 파일명 {concept}_{step}_{seed} 자동 파싱 → concept=행 / step=열 정렬, 미분류는 별도 행
//  - 그리드 셀 드래그앤드롭 순서 변경, 우클릭 팝업(이동/제거/미분류 이동)
//  - 마스터 컨트롤 하나로 전체 재생/정지/시크/음소거 동시 제어
//  - 단축키(노드 선택 시): Space, ←/→(1f), Shift+←/→(5f), Ctrl+←/→(10f)
//  - 그리드 레이아웃(수동 정렬 포함)을 grid_layout 위젯에 JSON 영구 저장
//
// Registry/Fake-Wire 와 무관한 독립 노드이므로 Core 파일은 건드리지 않는다.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "TJ_VideoGridComparer";
const WIDGET_NAME = "tj_vgc_viewer";
const CSS_ID = "tj-vgc-css-v1";
const MIN_W = 520;
const DEFAULT_H = 520;
// 모든 backing 위젯이 hidden 이라 DOM 뷰어 하나가 타이틀 아래 전체를 채운다.
// CHROME 은 타이틀 바 + 여백만 보정한다.
const CHROME = 40;
const VIEWER_MIN_H = 220;

// ────────────────────────────── CSS ──────────────────────────────
function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style");
  s.id = CSS_ID;
  s.textContent = `
.tjvgc{position:absolute;inset:0;display:flex;flex-direction:column;background:#141414;border-radius:4px;overflow:hidden;font:11px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#dfe7ef;}
.tjvgc .bar{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:5px 6px;background:#1c1c1c;border-bottom:1px solid #333;}
.tjvgc .bar input.path{flex:1 1 160px;min-width:120px;height:22px;padding:0 6px;background:#0e0e0e;border:1px solid #444;border-radius:3px;color:#dfe7ef;font-size:11px;}
.tjvgc .bar button{height:22px;padding:0 8px;background:#232a33;border:1px solid #3a4756;border-radius:3px;color:#cfe6ff;font-size:11px;cursor:pointer;white-space:nowrap;}
.tjvgc .bar button:hover{background:#2d3a49;}
.tjvgc .bar button.prim{background:#1e4a6b;border-color:#2f79ad;color:#dff;}
.tjvgc .bar button.prim:hover{background:#255a83;}
.tjvgc .bar button.warn{border-color:#5a3a3a;color:#ffbcbc;}
.tjvgc .bar .sp{flex:1 1 auto;}
.tjvgc .bar2{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 8px;background:#171717;border-bottom:1px solid #2a2a2a;}
.tjvgc .bar2 label{font-size:10px;color:#9fb4c8;}
.tjvgc .bar2 select{height:22px;background:#0e0e0e;border:1px solid #444;border-radius:3px;color:#dfe7ef;font-size:11px;}
.tjvgc .bar2 input.num{width:46px;height:22px;padding:0 4px;background:#0e0e0e;border:1px solid #444;border-radius:3px;color:#dfe7ef;font-size:11px;text-align:center;}
.tjvgc .bar2 .gctl{display:flex;align-items:center;gap:4px;}
.tjvgc .bar2 .gctl.off{display:none;}
.tjvgc .master{display:flex;align-items:center;gap:6px;padding:4px 8px;background:#181e26;border-bottom:1px solid #2a333d;}
.tjvgc .master button{width:30px;height:22px;background:#232a33;border:1px solid #3a4756;border-radius:3px;color:#cfe6ff;cursor:pointer;font-size:12px;}
.tjvgc .master button:hover{background:#2d3a49;}
.tjvgc .master button.active{color:#00efff;border-color:#00efff;}
.tjvgc .master input[type=range]{flex:1 1 auto;min-width:60px;accent-color:#00bfff;}
.tjvgc .master .tt{min-width:82px;text-align:right;font-variant-numeric:tabular-nums;color:#9fb4c8;font-size:10px;}
.tjvgc .grid{flex:1 1 auto;overflow:auto;padding:6px;}
.tjvgc .row{margin-bottom:8px;}
.tjvgc .rowhead{font-size:10px;color:#7fd6ff;margin:0 0 3px 2px;text-transform:uppercase;letter-spacing:.5px;}
.tjvgc .rowhead.uns{color:#c8a24a;}
.tjvgc .cells{display:flex;flex-wrap:wrap;gap:6px;}
.tjvgc .cells.fixed{display:grid;gap:6px;align-content:start;}
.tjvgc.gridmode .row{margin-bottom:0;}
.tjvgc.gridmode .cell{width:auto;height:var(--vgc-cellh,150px);}
.tjvgc.gridmode .cell video{width:100%;height:100%;object-fit:contain;}
.tjvgc.gridmode .cell .cap{position:absolute;left:0;right:0;bottom:0;}
.tjvgc .cell{position:relative;width:var(--vgc-cell,150px);background:#000;border:1px solid #2a2a2a;border-radius:3px;overflow:hidden;cursor:grab;}
.tjvgc .cell.drag{opacity:.4;}
.tjvgc .cell.over{border-color:#00bfff;box-shadow:0 0 0 1px #00bfff inset;}
.tjvgc .cell video{display:block;width:100%;height:auto;background:#000;}
.tjvgc .cell .cap{padding:2px 4px;font-size:9px;color:#b7c4d1;background:rgba(0,0,0,.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.tjvgc .cell .step{position:absolute;top:2px;left:2px;background:rgba(0,120,200,.82);color:#fff;font-size:9px;padding:0 4px;border-radius:2px;pointer-events:none;}
.tjvgc .cell.err{border-color:#5a3a3a;}
.tjvgc .cell .errmsg{position:absolute;top:0;left:0;right:0;bottom:18px;display:flex;align-items:center;justify-content:center;text-align:center;padding:6px;font-size:9px;color:#ffb0b0;background:#1a0e0e;pointer-events:none;}
.tjvgc .empty{padding:24px;text-align:center;color:#6b7683;}
.tjvgc-pop{position:fixed;z-index:99999;background:#1e1e1e;border:1px solid #3a4756;border-radius:4px;padding:3px;min-width:150px;box-shadow:0 6px 18px rgba(0,0,0,.6);font:11px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
.tjvgc-pop button{display:block;width:100%;text-align:left;padding:5px 9px;background:none;border:none;color:#dfe7ef;font-size:11px;cursor:pointer;border-radius:3px;}
.tjvgc-pop button:hover{background:#2d3a49;}
.tjvgc-pop .sep{height:1px;background:#333;margin:3px 0;}
.tjvgc-pop .hd{padding:3px 9px;color:#7fd6ff;font-size:10px;}
.tjvgc-modal{position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);}
.tjvgc-modal .box{width:min(460px,86vw);max-height:72vh;display:flex;flex-direction:column;background:#1a1a1a;border:1px solid #3a4756;border-radius:6px;overflow:hidden;}
.tjvgc-modal .hd{padding:8px 12px;background:#222;border-bottom:1px solid #333;font-size:12px;color:#cfe6ff;}
.tjvgc-modal .list{flex:1 1 auto;overflow:auto;padding:4px 0;}
.tjvgc-modal label{display:flex;align-items:center;gap:8px;padding:4px 12px;font-size:11px;color:#dfe7ef;cursor:pointer;}
.tjvgc-modal label:hover{background:#232a33;}
.tjvgc-modal .ft{display:flex;gap:6px;justify-content:flex-end;padding:8px 12px;background:#181818;border-top:1px solid #333;}
.tjvgc-modal .ft button{height:24px;padding:0 12px;background:#232a33;border:1px solid #3a4756;border-radius:3px;color:#cfe6ff;cursor:pointer;font-size:11px;}
.tjvgc-modal .ft button.prim{background:#1e4a6b;border-color:#2f79ad;color:#dff;}
.tjvgc-modal .ft button:disabled{opacity:.4;cursor:default;}
.tjvgc-modal .selinfo{flex:1 1 auto;align-self:center;font-size:10px;color:#9fb4c8;}
.tjvgc-modal .tabs{display:flex;gap:4px;padding:6px 12px;background:#181818;border-bottom:1px solid #2a2a2a;}
.tjvgc-modal .tabs button{height:22px;padding:0 12px;background:#232a33;border:1px solid #3a4756;border-radius:3px;color:#aebfce;font-size:11px;cursor:pointer;text-transform:capitalize;}
.tjvgc-modal .tabs button.active{background:#1e4a6b;border-color:#2f79ad;color:#dff;}
.tjvgc-modal .nav{display:flex;align-items:center;gap:8px;padding:5px 12px;background:#141414;border-bottom:1px solid #2a2a2a;}
.tjvgc-modal .nav button{height:20px;padding:0 8px;background:#232a33;border:1px solid #3a4756;border-radius:3px;color:#cfe6ff;font-size:10px;cursor:pointer;}
.tjvgc-modal .nav .crumb{font-size:10px;color:#7fd6ff;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tjvgc-modal .frow{display:flex;align-items:center;gap:8px;padding:5px 12px;font-size:11px;color:#dfe7ef;cursor:pointer;}
.tjvgc-modal .frow:hover{background:#232a33;}
.tjvgc-modal .frow.dir{color:#e0c98a;}
.tjvgc-modal .ph{padding:24px;text-align:center;color:#6b7683;font-size:11px;}
`;
  document.head.appendChild(s);
}

// ────────────────────────── helpers ──────────────────────────
// {concept}_{step}_{seed} 파싱. step 은 숫자 우선, seed 는 마지막 토큰.
function parseName(filename) {
  const base = filename.replace(/\.[^.]+$/, "");
  const parts = base.split("_");
  if (parts.length >= 3) {
    const seed = parts[parts.length - 1];
    const step = parts[parts.length - 2];
    const concept = parts.slice(0, parts.length - 2).join("_");
    if (concept && step !== "") {
      return { concept, step, seed, parsed: true };
    }
  }
  return { concept: "", step: "", seed: "", parsed: false };
}

function stepSortVal(step) {
  const n = parseFloat(step);
  return isNaN(n) ? Number.POSITIVE_INFINITY : n;
}

// browse 로 추가한 항목은 ComfyUI 내장 /view(샌드박스)로, 수동 경로 항목은
// 루프백 전용 /tj_node/vgc/video 로 서빙한다.
function videoUrl(item) {
  if (item && item.view) {
    const p = new URLSearchParams({
      filename: item.view.filename,
      subfolder: item.view.subfolder || "",
      type: item.view.type || "output",
      rand: String(Date.now()),
    });
    return api.apiURL("/view?" + p.toString());
  }
  const path = typeof item === "string" ? item : item.path;
  return api.apiURL("/tj_node/vgc/video?path=" + encodeURIComponent(path) + "&rand=" + Date.now());
}

function fmtTime(t) {
  if (!isFinite(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function nativeHeight(node) {
  const rowH = (window.LiteGraph && window.LiteGraph.NODE_WIDGET_HEIGHT) || 20;
  let h = 0;
  for (const w of node.widgets || []) {
    if (w.name === WIDGET_NAME) continue;
    if (w.hidden || w._hidden || w.type === "hidden") continue;
    let wh = rowH;
    if (typeof w.computeSize === "function") {
      const c = w.computeSize(node.size?.[0] || MIN_W);
      wh = c && c[1] > 0 ? c[1] : 0;
    }
    if (wh > 0) h += wh + 4;
  }
  return h;
}

// ────────────────────────── layout model ──────────────────────────
// state.items: [{ id, path, filename, concept, step, seed, parsed, unsorted, order }]
// 저장 포맷: { items: [...], fps }

function getLayoutWidget(node) {
  return node.widgets?.find(w => w.name === "grid_layout");
}

function persist(node) {
  const st = node.__tjvgc;
  if (!st) return;
  const w = getLayoutWidget(node);
  if (!w) return;
  const payload = {
    fps: st.fps,
    layoutMode: st.layoutMode,
    cols: st.cols,
    rows: st.rows,
    items: st.items.map(it => ({
      path: it.path, filename: it.filename, view: it.view || null,
      concept: it.concept, step: it.step, seed: it.seed,
      parsed: it.parsed, unsorted: it.unsorted, order: it.order,
    })),
  };
  w.value = JSON.stringify(payload);
  node.setDirtyCanvas?.(true, true);
}

function loadPersisted(node) {
  const st = node.__tjvgc;
  const w = getLayoutWidget(node);
  if (!st || !w) return;
  let data = null;
  try { data = JSON.parse(w.value || "{}"); } catch (_) { data = null; }
  if (!data || !Array.isArray(data.items)) return;
  st.fps = Number(data.fps) || st.fps;
  st.layoutMode = data.layoutMode === "grid" ? "grid" : "auto";
  st.cols = Math.max(1, Math.min(20, Number(data.cols) || st.cols));
  st.rows = Math.max(1, Math.min(20, Number(data.rows) || st.rows));
  st.syncControls?.();
  let ord = 0;
  st.items = data.items.map(it => ({
    id: "vgc_" + (ord++) + "_" + Math.random().toString(36).slice(2, 7),
    path: it.path, filename: it.filename || (it.path || "").split(/[\\/]/).pop(),
    view: it.view || null,
    concept: it.concept || "", step: it.step || "", seed: it.seed || "",
    parsed: !!it.parsed, unsorted: !!it.unsorted,
    order: Number.isFinite(it.order) ? it.order : ord,
  }));
}

// 파일들을 items 로 추가(중복 path 무시)
function addFiles(node, files) {
  const st = node.__tjvgc;
  const existing = new Set(st.items.map(i => i.path));
  let ord = st.items.length;
  for (const f of files) {
    if (existing.has(f.path)) continue;
    const p = parseName(f.filename);
    st.items.push({
      id: "vgc_" + (ord) + "_" + Math.random().toString(36).slice(2, 7),
      path: f.path, filename: f.filename,
      view: f.view || (f.type ? { filename: f.filename, subfolder: f.subfolder || "", type: f.type } : null),
      concept: p.concept, step: p.step, seed: p.seed, parsed: p.parsed,
      unsorted: !p.parsed, order: ord++,
    });
    existing.add(f.path);
  }
  persist(node);
  render(node);
}

// ────────────────────────── grid render ──────────────────────────
function buildRows(items) {
  // 정렬된 items → concept 행 그룹. 미분류는 "__unsorted__" 그룹.
  const rows = new Map(); // concept -> items[]
  const sorted = items.slice().sort((a, b) => a.order - b.order);
  for (const it of sorted) {
    const key = it.unsorted ? "__unsorted__" : (it.concept || "__unsorted__");
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(it);
  }
  // 각 행 내부는 step 오름차순, 동률은 order
  for (const [k, arr] of rows) {
    if (k === "__unsorted__") { arr.sort((a, b) => a.order - b.order); continue; }
    arr.sort((a, b) => {
      const d = stepSortVal(a.step) - stepSortVal(b.step);
      return d !== 0 ? d : a.order - b.order;
    });
  }
  return rows;
}

// 노드 폭에 맞춰 셀 폭을 계산한다. 가장 열이 많은 행 기준으로 균등 배분해
// 모든 셀이 동일 크기가 되도록 하고, 노드를 키우면 영상도 함께 커진다.
function applyCellSize(node) {
  const st = node.__tjvgc;
  if (!st || !st.grid || st.layoutMode === "grid") return;  // grid 모드는 applyGridSize 담당
  let maxCols = 1;
  for (const arr of buildRows(st.items).values()) maxCols = Math.max(maxCols, arr.length);
  const GAP = 6, PAD = 12;               // .cells gap + .grid 좌우 padding
  const avail = Math.max(0, (st.grid.clientWidth || 0) - PAD);
  if (avail <= 0) return;                 // 아직 레이아웃 전 — 이후 rAF 에서 재계산
  let cw = Math.floor((avail - GAP * (maxCols - 1)) / maxCols);
  cw = Math.max(90, Math.min(cw, 640));   // 과도한 확대/축소 방지
  st.root.style.setProperty("--vgc-cell", cw + "px");
}

// Fixed grid 모드: 사용자가 지정한 Cols×Rows 격자에 셀을 균등 배치하고,
// 셀 크기를 뷰포트에 맞춰 계산한다(가로=cols, 세로=rows 기준으로 리사이즈).
function applyGridSize(node) {
  const st = node.__tjvgc;
  if (!st || !st.grid || st.layoutMode !== "grid") return;
  const cols = Math.max(1, st.cols | 0);
  const rows = Math.max(1, st.rows | 0);
  const GAP = 6, PADX = 12, PADY = 12;
  const availW = Math.max(0, (st.grid.clientWidth || 0) - PADX);
  const availH = Math.max(0, (st.grid.clientHeight || 0) - PADY);
  if (availW <= 0) return;
  const cw = Math.floor((availW - GAP * (cols - 1)) / cols);
  st.root.style.setProperty("--vgc-cell", Math.max(60, cw) + "px");
  if (availH > 0) {
    const ch = Math.floor((availH - GAP * (rows - 1)) / rows);
    st.root.style.setProperty("--vgc-cellh", Math.max(60, ch) + "px");
  }
}

function scheduleCellSize(node) {
  requestAnimationFrame(() => { applyCellSize(node); applyGridSize(node); });
}

function render(node) {
  const st = node.__tjvgc;
  if (!st) return;
  const grid = st.grid;
  grid.innerHTML = "";
  st.videos = [];
  st.root.classList.toggle("gridmode", st.layoutMode === "grid");

  if (!st.items.length) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "Scan a folder or add files to build the comparison grid.";
    grid.appendChild(e);
    updateMaster(node);
    return;
  }

  if (st.layoutMode === "grid") {
    // 고정 격자: order 순서대로 flat 배치
    const cols = Math.max(1, st.cols | 0);
    const cells = document.createElement("div");
    cells.className = "cells fixed";
    cells.style.gridTemplateColumns = `repeat(${cols}, var(--vgc-cell, 1fr))`;
    const sorted = st.items.slice().sort((a, b) => a.order - b.order);
    for (const it of sorted) cells.appendChild(makeCell(node, it, false));
    grid.appendChild(cells);
  } else {
    // Auto: concept=행, step=열. 미분류는 맨 아래 행.
    const rows = buildRows(st.items);
    const keys = [...rows.keys()].filter(k => k !== "__unsorted__").sort();
    if (rows.has("__unsorted__")) keys.push("__unsorted__");
    for (const key of keys) {
      const rowEl = document.createElement("div");
      rowEl.className = "row";
      const head = document.createElement("div");
      head.className = "rowhead" + (key === "__unsorted__" ? " uns" : "");
      head.textContent = key === "__unsorted__" ? "◆ Unsorted" : key;
      rowEl.appendChild(head);
      const cells = document.createElement("div");
      cells.className = "cells";
      for (const it of rows.get(key)) cells.appendChild(makeCell(node, it, key === "__unsorted__"));
      rowEl.appendChild(cells);
      grid.appendChild(rowEl);
    }
  }
  updateMaster(node);
  applyCellSize(node);
  applyGridSize(node);
  scheduleCellSize(node);   // 레이아웃 확정 후 한 번 더 (clientWidth/Height 0 대비)
}

function makeCell(node, item, isUnsorted) {
  const st = node.__tjvgc;
  const cell = document.createElement("div");
  cell.className = "cell";
  cell.draggable = true;
  cell.dataset.id = item.id;

  const v = document.createElement("video");
  v.preload = "metadata";
  v.muted = st.muted;
  v.loop = true;
  v.playsInline = true;
  v.src = videoUrl(item);
  v.addEventListener("loadedmetadata", () => updateMaster(node));
  v.addEventListener("error", () => {
    // 원격(비-루프백) 접근은 백엔드가 403 으로 차단한다 → 안내 표시
    cell.classList.add("err");
    if (!cell.querySelector(".errmsg")) {
      const m = document.createElement("div");
      m.className = "errmsg";
      m.textContent = "Load blocked (local-only viewer)";
      cell.appendChild(m);
    }
  });
  cell.appendChild(v);
  st.videos.push(v);

  if (!isUnsorted && item.step !== "") {
    const badge = document.createElement("div");
    badge.className = "step";
    badge.textContent = "step " + item.step;
    cell.appendChild(badge);
  }

  const cap = document.createElement("div");
  cap.className = "cap";
  cap.textContent = item.filename;
  cap.title = item.filename;
  cell.appendChild(cap);

  // drag & drop 순서 변경
  cell.addEventListener("dragstart", (e) => {
    st.dragId = item.id;
    cell.classList.add("drag");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", item.id); } catch (_) {}
  });
  cell.addEventListener("dragend", () => { cell.classList.remove("drag"); st.dragId = null; });
  cell.addEventListener("dragover", (e) => { e.preventDefault(); cell.classList.add("over"); });
  cell.addEventListener("dragleave", () => cell.classList.remove("over"));
  cell.addEventListener("drop", (e) => {
    e.preventDefault(); cell.classList.remove("over");
    if (st.dragId && st.dragId !== item.id) reorder(node, st.dragId, item.id);
  });

  // 우클릭 팝업
  cell.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); openPopup(node, item, e.clientX, e.clientY); });
  return cell;
}

// dragId 항목을 targetId 앞 위치로 이동 + 대상 행(concept/unsorted)으로 편입
function reorder(node, dragId, targetId) {
  const st = node.__tjvgc;
  const drag = st.items.find(i => i.id === dragId);
  const target = st.items.find(i => i.id === targetId);
  if (!drag || !target) return;
  // 대상 셀과 같은 행 그룹으로 이동
  drag.unsorted = target.unsorted;
  if (!target.unsorted) { drag.concept = target.concept; }
  // order 재배치: target 바로 앞
  const list = st.items.slice().sort((a, b) => a.order - b.order);
  const without = list.filter(i => i.id !== dragId);
  const ti = without.findIndex(i => i.id === targetId);
  without.splice(ti, 0, drag);
  without.forEach((it, idx) => (it.order = idx));
  persist(node);
  render(node);
}

// ────────────────────────── right-click popup ──────────────────────────
function closePopup() {
  document.querySelectorAll(".tjvgc-pop").forEach(p => p.remove());
  document.removeEventListener("mousedown", closePopup, true);
}

function openPopup(node, item, x, y) {
  closePopup();
  const st = node.__tjvgc;
  const pop = document.createElement("div");
  pop.className = "tjvgc-pop";
  pop.style.left = x + "px";
  pop.style.top = y + "px";

  const mk = (label, fn, cls) => {
    const b = document.createElement("button");
    b.textContent = label;
    if (cls) b.classList.add(cls);
    b.addEventListener("click", (e) => { e.stopPropagation(); closePopup(); fn(); });
    return b;
  };
  const sep = () => { const d = document.createElement("div"); d.className = "sep"; return d; };
  const hd = (t) => { const d = document.createElement("div"); d.className = "hd"; d.textContent = t; return d; };

  pop.appendChild(hd(item.filename));
  pop.appendChild(sep());

  // 다른 concept 행으로 이동
  const concepts = [...new Set(st.items.filter(i => !i.unsorted && i.concept).map(i => i.concept))].sort();
  for (const c of concepts) {
    if (c === item.concept && !item.unsorted) continue;
    pop.appendChild(mk("→ Move to: " + c, () => {
      item.unsorted = false; item.concept = c;
      bumpToEnd(st, item); persist(node); render(node);
    }));
  }

  // 새 concept 행 생성 이동
  pop.appendChild(mk("→ Move to new concept…", () => {
    const name = prompt("New concept (row) name:", item.concept || "");
    if (name) { item.unsorted = false; item.concept = name; bumpToEnd(st, item); persist(node); render(node); }
  }));

  // 미분류로 이동
  if (!item.unsorted) {
    pop.appendChild(mk("→ Move to Unsorted", () => {
      item.unsorted = true; bumpToEnd(st, item); persist(node); render(node);
    }));
  }

  pop.appendChild(sep());
  pop.appendChild(mk("✕ Remove from grid", () => {
    st.items = st.items.filter(i => i.id !== item.id);
    persist(node); render(node);
  }, "warn"));

  document.body.appendChild(pop);
  // 화면 밖 보정
  const r = pop.getBoundingClientRect();
  if (r.right > innerWidth) pop.style.left = (innerWidth - r.width - 6) + "px";
  if (r.bottom > innerHeight) pop.style.top = (innerHeight - r.height - 6) + "px";
  setTimeout(() => document.addEventListener("mousedown", closePopup, true), 0);
}

function bumpToEnd(st, item) {
  const maxOrd = st.items.reduce((m, i) => Math.max(m, i.order), 0);
  item.order = maxOrd + 1;
}

// ────────────────────────── master controls ──────────────────────────
function masterDuration(st) {
  let d = 0;
  for (const v of st.videos) if (isFinite(v.duration) && v.duration > d) d = v.duration;
  return d;
}

function updateMaster(node) {
  const st = node.__tjvgc;
  if (!st) return;
  const dur = masterDuration(st);
  const cur = st.videos.length ? (st.videos[0].currentTime || 0) : 0;
  st.seek.max = dur > 0 ? String(dur) : "0";
  if (!st.seeking) st.seek.value = String(Math.min(cur, dur || 0));
  st.timeTxt.textContent = `${fmtTime(cur)} / ${fmtTime(dur)}`;
  st.playBtn.textContent = st.playing ? "❚❚" : "▶";
  st.muteBtn.classList.toggle("active", st.muted);
  st.muteBtn.textContent = st.muted ? "🔇" : "🔊";
}

function masterPlay(node, play) {
  const st = node.__tjvgc;
  st.playing = play;
  for (const v of st.videos) {
    try { if (play) v.play(); else v.pause(); } catch (_) {}
  }
  updateMaster(node);
}

function masterSeek(node, t) {
  const st = node.__tjvgc;
  for (const v of st.videos) { try { v.currentTime = Math.min(t, v.duration || t); } catch (_) {} }
  updateMaster(node);
}

function masterStep(node, frames) {
  const st = node.__tjvgc;
  const dt = frames / (st.fps || 30);
  const base = st.videos.length ? (st.videos[0].currentTime || 0) : 0;
  masterSeek(node, Math.max(0, base + dt));
}

function masterMute(node, mute) {
  const st = node.__tjvgc;
  st.muted = mute;
  for (const v of st.videos) v.muted = mute;
  updateMaster(node);
}

// ────────────────────────── file picker modal ──────────────────────────
async function scanFolder(folder) {
  const resp = await api.fetchApi("/tj_node/vgc/list_videos", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });
  return await resp.json();
}

function openPickerModal(node, folder, files) {
  const modal = document.createElement("div");
  modal.className = "tjvgc-modal";
  const box = document.createElement("div");
  box.className = "box";
  const hd = document.createElement("div");
  hd.className = "hd";
  hd.textContent = `Select files to add — ${folder} (${files.length})`;
  const list = document.createElement("div");
  list.className = "list";
  const checks = [];
  for (const f of files) {
    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = true; cb.dataset.i = checks.length;
    checks.push({ cb, f });
    lab.appendChild(cb);
    const span = document.createElement("span");
    span.textContent = f.filename;
    lab.appendChild(span);
    list.appendChild(lab);
  }
  const ft = document.createElement("div");
  ft.className = "ft";
  const allBtn = document.createElement("button"); allBtn.textContent = "Toggle all";
  const cancel = document.createElement("button"); cancel.textContent = "Cancel";
  const add = document.createElement("button"); add.textContent = "Add selected"; add.className = "prim";
  ft.appendChild(allBtn); ft.appendChild(cancel); ft.appendChild(add);

  box.appendChild(hd); box.appendChild(list); box.appendChild(ft);
  modal.appendChild(box);
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.addEventListener("mousedown", (e) => { if (e.target === modal) close(); });
  allBtn.addEventListener("click", () => { const anyOff = checks.some(c => !c.cb.checked); checks.forEach(c => (c.cb.checked = anyOff)); });
  cancel.addEventListener("click", close);
  add.addEventListener("click", () => {
    const sel = checks.filter(c => c.cb.checked).map(c => c.f);
    close();
    if (sel.length) addFiles(node, sel);
  });
}

// ────────────────────────── output browser modal ──────────────────────────
async function browseDir(base, subfolder) {
  const resp = await api.fetchApi("/tj_node/vgc/browse", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base, subfolder }),
  });
  return await resp.json();
}

function openBrowseModal(node) {
  const modal = document.createElement("div");
  modal.className = "tjvgc-modal";
  const box = document.createElement("div");
  box.className = "box";

  const hd = document.createElement("div");
  hd.className = "hd";

  // base tabs
  const tabs = document.createElement("div");
  tabs.className = "tabs";
  const nav = document.createElement("div");
  nav.className = "nav";
  const list = document.createElement("div");
  list.className = "list";
  const ft = document.createElement("div");
  ft.className = "ft";
  const selInfo = document.createElement("div");
  selInfo.className = "selinfo";
  const cancel = document.createElement("button"); cancel.textContent = "Close";
  const add = document.createElement("button"); add.textContent = "Add selected"; add.className = "prim";
  ft.appendChild(selInfo); ft.appendChild(cancel); ft.appendChild(add);

  box.appendChild(hd); box.appendChild(tabs); box.appendChild(nav);
  box.appendChild(list); box.appendChild(ft);
  modal.appendChild(box);
  document.body.appendChild(modal);

  const state = { base: "output", sub: "", selected: new Map() /* path -> file */ };

  const close = () => modal.remove();
  modal.addEventListener("mousedown", (e) => { if (e.target === modal) close(); });
  cancel.addEventListener("click", close);
  add.addEventListener("click", () => {
    const files = [...state.selected.values()];
    close();
    if (files.length) addFiles(node, files);
  });

  function updateSelInfo() {
    selInfo.textContent = state.selected.size ? `${state.selected.size} selected` : "";
    add.disabled = state.selected.size === 0;
  }

  ["output", "input", "temp"].forEach(b => {
    const t = document.createElement("button");
    t.textContent = b;
    t.addEventListener("click", () => { state.base = b; state.sub = ""; load(); });
    t._base = b;
    tabs.appendChild(t);
  });

  async function load() {
    hd.textContent = "Browse videos";
    for (const t of tabs.children) t.classList.toggle("active", t._base === state.base);
    list.innerHTML = "<div class='ph'>Loading…</div>";
    let r;
    try { r = await browseDir(state.base, state.sub); }
    catch (e) { list.innerHTML = "<div class='ph'>Error: " + e.message + "</div>"; return; }
    if (!r.success) { list.innerHTML = "<div class='ph'>Error: " + (r.error || "unknown") + "</div>"; return; }

    // breadcrumb / up
    nav.innerHTML = "";
    const crumb = document.createElement("div");
    crumb.className = "crumb";
    crumb.textContent = "/" + (state.sub || "");
    if (state.sub) {
      const up = document.createElement("button");
      up.textContent = "⬆ up";
      up.addEventListener("click", () => {
        const parts = state.sub.split("/").filter(Boolean);
        parts.pop();
        state.sub = parts.join("/");
        load();
      });
      nav.appendChild(up);
    }
    nav.appendChild(crumb);

    list.innerHTML = "";
    if (!r.folders.length && !r.files.length) {
      list.innerHTML = "<div class='ph'>Empty folder</div>";
      return;
    }
    for (const f of r.folders) {
      const row = document.createElement("div");
      row.className = "frow dir";
      row.textContent = "📁 " + f.name;
      row.addEventListener("click", () => { state.sub = f.subfolder; load(); });
      list.appendChild(row);
    }
    for (const f of r.files) {
      const lab = document.createElement("label");
      lab.className = "frow";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.selected.has(f.path);
      cb.addEventListener("change", () => {
        if (cb.checked) state.selected.set(f.path, f);
        else state.selected.delete(f.path);
        updateSelInfo();
      });
      lab.appendChild(cb);
      const span = document.createElement("span");
      span.textContent = "🎞 " + f.filename;
      lab.appendChild(span);
      list.appendChild(lab);
    }
    updateSelInfo();
  }
  load();
}

// ────────────────────────── build DOM ──────────────────────────
function build(node) {
  if (node.__tjvgc) return node.__tjvgc;
  ensureCss();

  const root = document.createElement("div");
  root.className = "tjvgc";

  // toolbar
  const bar = document.createElement("div");
  bar.className = "bar";
  const browseBtn = document.createElement("button"); browseBtn.textContent = "📁 Browse output…"; browseBtn.className = "prim";
  const path = document.createElement("input");
  path.className = "path"; path.type = "text";
  path.placeholder = "…or type a folder path";
  const scanBtn = document.createElement("button"); scanBtn.textContent = "Scan";
  const pickBtn = document.createElement("button"); pickBtn.textContent = "Pick…";
  const clearBtn = document.createElement("button"); clearBtn.textContent = "Clear"; clearBtn.className = "warn";
  bar.appendChild(browseBtn); bar.appendChild(path); bar.appendChild(scanBtn); bar.appendChild(pickBtn); bar.appendChild(clearBtn);

  // layout controls (레이아웃 모드 + 격자 크기)
  const bar2 = document.createElement("div");
  bar2.className = "bar2";
  const modeLab = document.createElement("label"); modeLab.textContent = "Layout";
  const modeSel = document.createElement("select");
  for (const [v, t] of [["auto", "Auto (concept/step)"], ["grid", "Fixed grid"]]) {
    const o = document.createElement("option"); o.value = v; o.textContent = t; modeSel.appendChild(o);
  }
  const gctl = document.createElement("div"); gctl.className = "gctl";
  const colLab = document.createElement("label"); colLab.textContent = "Cols";
  const colIn = document.createElement("input"); colIn.className = "num"; colIn.type = "number"; colIn.min = "1"; colIn.max = "20"; colIn.value = "3";
  const rowLab = document.createElement("label"); rowLab.textContent = "Rows";
  const rowIn = document.createElement("input"); rowIn.className = "num"; rowIn.type = "number"; rowIn.min = "1"; rowIn.max = "20"; rowIn.value = "2";
  gctl.appendChild(colLab); gctl.appendChild(colIn); gctl.appendChild(rowLab); gctl.appendChild(rowIn);
  const fpsLab = document.createElement("label"); fpsLab.textContent = "fps";
  const fpsIn = document.createElement("input"); fpsIn.className = "num"; fpsIn.type = "number"; fpsIn.min = "1"; fpsIn.max = "240"; fpsIn.value = "30"; fpsIn.title = "Frame-step fps (arrow keys)";
  bar2.appendChild(modeLab); bar2.appendChild(modeSel); bar2.appendChild(gctl);
  bar2.appendChild(fpsLab); bar2.appendChild(fpsIn);

  // master control
  const master = document.createElement("div");
  master.className = "master";
  const playBtn = document.createElement("button"); playBtn.textContent = "▶"; playBtn.title = "Play/Pause all (Space)";
  const stopBtn = document.createElement("button"); stopBtn.textContent = "■"; stopBtn.title = "Stop & rewind all";
  const seek = document.createElement("input"); seek.type = "range"; seek.min = "0"; seek.max = "0"; seek.step = "0.01"; seek.value = "0";
  const timeTxt = document.createElement("div"); timeTxt.className = "tt"; timeTxt.textContent = "0:00 / 0:00";
  const muteBtn = document.createElement("button"); muteBtn.textContent = "🔊"; muteBtn.title = "Mute/unmute all";
  master.appendChild(playBtn); master.appendChild(stopBtn); master.appendChild(seek); master.appendChild(timeTxt); master.appendChild(muteBtn);

  // grid
  const grid = document.createElement("div");
  grid.className = "grid";

  root.appendChild(bar); root.appendChild(bar2); root.appendChild(master); root.appendChild(grid);

  const widget = node.addDOMWidget(WIDGET_NAME, "div", root, { serialize: false, hideOnZoom: false });

  const st = node.__tjvgc = {
    root, bar, bar2, path, grid, master, seek, timeTxt, playBtn, muteBtn,
    modeSel, colIn, rowIn, fpsIn, gctl,
    widget, items: [], videos: [], playing: false, muted: false,
    seeking: false, dragId: null, fps: 30,
    layoutMode: "auto", cols: 3, rows: 2,
  };

  // 컨트롤 → state 반영
  const syncControls = () => {
    st.modeSel.value = st.layoutMode;
    st.colIn.value = String(st.cols);
    st.rowIn.value = String(st.rows);
    st.fpsIn.value = String(st.fps);
    st.gctl.classList.toggle("off", st.layoutMode !== "grid");
  };
  st.syncControls = syncControls;
  modeSel.addEventListener("change", () => {
    st.layoutMode = modeSel.value === "grid" ? "grid" : "auto";
    syncControls(); persist(node); render(node);
  });
  const onGrid = () => {
    st.cols = Math.max(1, Math.min(20, parseInt(colIn.value) || 1));
    st.rows = Math.max(1, Math.min(20, parseInt(rowIn.value) || 1));
    persist(node); render(node);
  };
  colIn.addEventListener("change", onGrid);
  rowIn.addEventListener("change", onGrid);
  fpsIn.addEventListener("change", () => {
    st.fps = Math.max(1, Math.min(240, parseFloat(fpsIn.value) || 30));
    persist(node);
  });
  syncControls();

  // toolbar events
  const doScan = async (pickMode) => {
    const folder = path.value.trim();
    if (!folder) return;
    scanBtn.disabled = true; pickBtn.disabled = true;
    try {
      const r = await scanFolder(folder);
      if (!r.success) { alert("Scan failed: " + (r.error || "unknown")); return; }
      if (!r.files.length) { alert("No video files found in folder."); return; }
      if (pickMode) openPickerModal(node, r.folder, r.files);
      else addFiles(node, r.files);
    } catch (e) { alert("Scan error: " + e.message); }
    finally { scanBtn.disabled = false; pickBtn.disabled = false; }
  };
  browseBtn.addEventListener("click", () => openBrowseModal(node));
  scanBtn.addEventListener("click", () => doScan(false));
  pickBtn.addEventListener("click", () => doScan(true));
  path.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doScan(false); } });
  clearBtn.addEventListener("click", () => {
    if (st.items.length && !confirm("Clear all videos from the grid?")) return;
    st.items = []; persist(node); render(node);
  });
  // folder_path 위젯과 동기화
  path.addEventListener("change", () => {
    const w = node.widgets?.find(w => w.name === "folder_path");
    if (w) { w.value = path.value; node.setDirtyCanvas?.(true, true); }
  });

  // master events
  playBtn.addEventListener("click", () => masterPlay(node, !st.playing));
  stopBtn.addEventListener("click", () => { masterPlay(node, false); masterSeek(node, 0); });
  muteBtn.addEventListener("click", () => masterMute(node, !st.muted));
  seek.addEventListener("input", () => { st.seeking = true; masterSeek(node, parseFloat(seek.value) || 0); });
  seek.addEventListener("change", () => { st.seeking = false; });

  // 재생 위치 주기적 갱신
  st.raf = setInterval(() => { if (st.playing || st.seeking) updateMaster(node); }, 200);

  // 스크롤이 캔버스로 새지 않도록
  root.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

  widget.computeSize = function (width) {
    const nh = Number(node.size?.[1]) || DEFAULT_H;
    return [Math.max(Number(width) || MIN_W, MIN_W), Math.max(VIEWER_MIN_H, nh - CHROME - nativeHeight(node))];
  };

  if ((node.size?.[0] || 0) < MIN_W || (node.size?.[1] || 0) < DEFAULT_H) {
    node.setSize?.([Math.max(node.size?.[0] || 0, MIN_W), Math.max(node.size?.[1] || 0, DEFAULT_H)]);
  }
  node.setDirtyCanvas?.(true, true);
  return st;
}

// grid_layout / folder_path 위젯 숨김 (그리드가 UI 를 대체)
// 값(serialize)은 유지하되 화면에서는 완전히 제거한다. DOM 요소가 있으면 함께 숨긴다.
function hideBackingWidgets(node) {
  for (const name of ["grid_layout", "folder_path"]) {
    const w = node.widgets?.find(w => w.name === name);
    if (!w || w.__tjHidden) continue;
    w.__tjHidden = true;
    w._origType = w.type;
    w.type = "hidden";
    w.hidden = true;
    w.computeSize = () => [0, -4];
    w.draw = () => {};
    if (w.element) w.element.style.display = "none";
    if (w.inputEl) w.inputEl.style.display = "none";
  }
}

// folder_path 위젯 값을 툴바 입력과 동기화
function syncFolderInput(node) {
  const st = node.__tjvgc;
  const w = node.widgets?.find(w => w.name === "folder_path");
  if (st && w && w.value && !st.path.value) st.path.value = w.value;
}

// ────────────────────────── keyboard shortcuts ──────────────────────────
let kbInstalled = false;
function installKeyboard() {
  if (kbInstalled) return;
  kbInstalled = true;
  window.addEventListener("keydown", (e) => {
    // 입력 요소에 포커스 중이면 무시
    const tag = (e.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
    // 선택된 VGC 노드 찾기
    const nodes = (app.graph?._nodes || []).filter(n => n.type === NODE_NAME && n.__tjvgc && n.is_selected);
    if (!nodes.length) return;
    let handled = true;
    for (const node of nodes) {
      if (e.code === "Space") { masterPlay(node, !node.__tjvgc.playing); }
      else if (e.code === "ArrowLeft") { masterStep(node, e.ctrlKey ? -10 : e.shiftKey ? -5 : -1); }
      else if (e.code === "ArrowRight") { masterStep(node, e.ctrlKey ? 10 : e.shiftKey ? 5 : 1); }
      else { handled = false; }
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }, true);
}

// ────────────────────────── extension ──────────────────────────
app.registerExtension({
  name: "TJ.VideoGridComparer",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;
    installKeyboard();

    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = created?.apply(this, arguments);
      try {
        build(this);
        hideBackingWidgets(this);
        syncFolderInput(this);
        render(this);
      } catch (e) { console.warn("[TJ_NODE] VGC create failed", e); }
      return r;
    };

    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = configured?.apply(this, arguments);
      queueMicrotask(() => {
        try {
          build(this);
          hideBackingWidgets(this);
          loadPersisted(this);
          syncFolderInput(this);
          render(this);
        } catch (e) { console.warn("[TJ_NODE] VGC configure failed", e); }
      });
      return r;
    };

    const onRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      try { if (this.__tjvgc?.raf) clearInterval(this.__tjvgc.raf); } catch (_) {}
      return onRemoved?.apply(this, arguments);
    };

    const resized = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      const r = resized?.apply(this, arguments);
      try {
        if (this.__tjvgc) {
          applyCellSize(this);
          applyGridSize(this);
          scheduleCellSize(this);   // 리사이즈 확정 후 셀 크기 재계산
          this.setDirtyCanvas?.(true, true);
        }
      } catch (_) {}
      return r;
    };
  },
});
