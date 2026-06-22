// TJ_NODE Floating Launcher - Registry Version TEST
// Place both files in the same folder:
//   web/js/tj_node_floating_launcher_registry.js
//   web/js/tj_node_floating_launcher.js
//
// If you place these files directly in web/, change app import to "../../scripts/app.js".

import { app } from "../../../scripts/app.js";
import {
  TJ_LAUNCHER_CATEGORIES,
  TJ_QUICK_NODES,
  TJ_LAUNCHER_NODES
} from "./tj_node_floating_launcher_registry.js";

(function () {
  const EXT_NAME = "TJ.NodeFloatingLauncher.Registry";
  const STORAGE_POS = "tj_node_launcher_pos_v3";
  const STORAGE_RECENT = "tj_node_launcher_recent_v3";

  let launcherBtn = null;
  let panel = null;
  let ghost = null;
  let pendingNodeType = null;
  let pendingNodeTitle = "";
  let dragState = null;
  let isDraggingButton = false;
  let selectedCategory = TJ_LAUNCHER_CATEGORIES[0] || "Wireless";
  let searchText = "";
  let currentMouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  function log(...args) {
    console.log("[TJ Launcher]", ...args);
  }

  function injectStyle() {
    if (document.getElementById("tj-node-launcher-style")) return;
    const style = document.createElement("style");
    style.id = "tj-node-launcher-style";
    style.textContent = `
      #tj-node-launcher {
        position: fixed;
        z-index: 99999;
        left: 48px;
        top: 180px;
        height: 42px;
        width: 42px;
        border-radius: 999px;
        background: #f3f7ff;
        color: #000;
        box-shadow: 0 8px 26px rgba(0,0,0,.35);
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        user-select: none;
        overflow: hidden;
        transition: width .22s ease, background .18s ease, transform .16s ease;
        font-family: Arial, sans-serif;
        border: 1px solid rgba(255,255,255,.55);
      }
      #tj-node-launcher:hover {
        width: 158px;
        background: #ffffff;
        transform: translateY(-1px);
      }
      #tj-node-launcher .tj-icon {
        min-width: 42px;
        width: 42px;
        height: 42px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: 16px;
        color: #7612DA;
      }
      #tj-node-launcher .tj-label {
        white-space: nowrap;
        font-weight: 800;
        font-size: 13px;
        opacity: 0;
        transform: translateX(-8px);
        transition: opacity .18s ease, transform .18s ease;
      }
      #tj-node-launcher:hover .tj-label {
        opacity: 1;
        transform: translateX(0);
      }

      #tj-node-launcher-panel {
        position: fixed;
        z-index: 100000;
        width: 430px;
        max-height: min(650px, calc(100vh - 24px));
        background: rgba(18,18,22,.98);
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 14px;
        box-shadow: 0 18px 50px rgba(0,0,0,.55);
        color: #f5f5f5;
        font-family: Arial, sans-serif;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .tj-panel-head {
        padding: 14px 14px 10px 14px;
        border-bottom: 1px solid rgba(255,255,255,.08);
        background: linear-gradient(135deg, rgba(118,18,218,.28), rgba(0,0,0,0));
      }
      .tj-panel-title {
        font-size: 15px;
        font-weight: 900;
        letter-spacing: .2px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .tj-panel-close {
        border: 0;
        background: rgba(255,255,255,.08);
        color: #fff;
        border-radius: 7px;
        width: 24px;
        height: 24px;
        cursor: pointer;
      }
      .tj-panel-search {
        margin-top: 10px;
        width: 100%;
        box-sizing: border-box;
        background: rgba(255,255,255,.08);
        color: #fff;
        border: 1px solid rgba(255,255,255,.13);
        border-radius: 9px;
        outline: none;
        padding: 9px 10px;
        font-size: 13px;
      }
      .tj-quick-actions {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 7px;
        padding: 10px 12px 8px 12px;
        border-bottom: 1px solid rgba(255,255,255,.08);
      }
      .tj-quick-btn {
        border: 1px solid rgba(155,88,239,.65);
        background: rgba(118,18,218,.26);
        color: #fff;
        border-radius: 10px;
        padding: 9px 6px;
        font-size: 12px;
        font-weight: 900;
        cursor: pointer;
        line-height: 1.15;
      }
      .tj-quick-btn:hover {
        background: rgba(118,18,218,.48);
        border-color: rgba(190,150,255,.95);
      }
      .tj-quick-btn.disabled {
        opacity: .35;
        cursor: default;
        background: rgba(255,255,255,.05);
        border-color: rgba(255,255,255,.12);
      }
      .tj-body {
        display: grid;
        grid-template-columns: 128px 1fr;
        min-height: 0;
        flex: 1 1 auto;
        overflow: hidden;
      }
      .tj-category-tabs {
        border-right: 1px solid rgba(255,255,255,.08);
        padding: 8px;
        overflow-y: auto;
        min-height: 0;
      }
      .tj-category-tab {
        width: 100%;
        text-align: left;
        padding: 9px 10px;
        border-radius: 9px;
        font-size: 13px;
        font-weight: 800;
        border: 0;
        background: transparent;
        color: #aaa;
        cursor: pointer;
        margin-bottom: 4px;
      }
      .tj-category-tab:hover {
        background: rgba(255,255,255,.06);
        color: #fff;
      }
      .tj-category-tab.active {
        background: rgba(118,18,218,.55);
        color: white;
      }
      .tj-node-list {
        overflow-y: auto;
        padding: 8px;
        min-height: 0;
        max-height: calc(100vh - 210px);
        overscroll-behavior: contain;
      }
      .tj-section-label {
        padding: 5px 8px 8px 8px;
        font-size: 11px;
        color: #9a9a9a;
        font-weight: 800;
        letter-spacing: .3px;
        text-transform: uppercase;
      }
      .tj-node-item {
        padding: 9px 10px;
        border-radius: 9px;
        margin-bottom: 5px;
        background: rgba(255,255,255,.045);
        border: 1px solid rgba(255,255,255,.06);
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .tj-node-item:hover {
        background: rgba(118,18,218,.28);
        border-color: rgba(155,88,239,.65);
      }
      .tj-node-item.missing {
        opacity: .38;
        cursor: default;
      }
      .tj-node-item.missing:hover {
        background: rgba(255,255,255,.045);
        border-color: rgba(255,255,255,.06);
      }
      .tj-node-name {
        font-size: 13px;
        font-weight: 800;
        color: #fff;
      }
      .tj-node-meta {
        font-size: 11px;
        color: #aaa;
      }
      .tj-empty {
        padding: 24px;
        color: #999;
        text-align: center;
        font-size: 13px;
      }
      #tj-node-ghost {
        position: fixed;
        z-index: 100001;
        pointer-events: none;
        min-width: 180px;
        padding: 10px 14px;
        border-radius: 10px;
        background: rgba(0,0,0,.76);
        border: 2px solid #7612DA;
        color: #fff;
        box-shadow: 0 12px 30px rgba(0,0,0,.45);
        font-family: Arial, sans-serif;
        font-size: 13px;
        font-weight: 800;
        transform: translate(14px, 14px);
      }
      #tj-node-ghost::after {
        content: "Click canvas to place · Esc to cancel";
        display: block;
        margin-top: 4px;
        font-size: 11px;
        font-weight: 500;
        color: #ccc;
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHTML(s) {
    return String(s || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  function safeJSONParse(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function registeredTypes() {
    return LiteGraph?.registered_node_types || {};
  }

  function resolveRegisteredType(typeOrTitle) {
    const types = registeredTypes();
    if (types[typeOrTitle]) return typeOrTitle;

    const q = String(typeOrTitle || "").toLowerCase();
    const found = Object.keys(types).find((type) => {
      const ctor = types[type];
      const nodeData = ctor?.nodeData || {};
      const title = nodeData.display_name || nodeData.name || ctor?.title || type;
      return type.toLowerCase() === q || String(title).toLowerCase() === q;
    });

    return found || null;
  }

  function normalizeNode(item) {
    const realType = resolveRegisteredType(item.type) || resolveRegisteredType(item.title);
    return { ...item, realType, exists: !!realType };
  }

  function allRegistryNodes() {
    return TJ_LAUNCHER_NODES.map(normalizeNode);
  }

  function getRecent() {
    const arr = safeJSONParse(localStorage.getItem(STORAGE_RECENT), []);
    return Array.isArray(arr) ? arr.slice(0, 5) : [];
  }

  function pushRecent(nodeType) {
    if (!nodeType) return;
    const recent = getRecent().filter((x) => x !== nodeType);
    recent.unshift(nodeType);
    localStorage.setItem(STORAGE_RECENT, JSON.stringify(recent.slice(0, 5)));
  }

  function findRegistryNodeByTitle(title) {
    const q = String(title || "").toLowerCase();
    return allRegistryNodes().find((n) =>
      String(n.title).toLowerCase() === q ||
      String(n.type).toLowerCase() === q
    );
  }

  function visibleNodes() {
    let nodes = allRegistryNodes();

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      return nodes.filter((n) =>
        `${n.title} ${n.type} ${n.category}`.toLowerCase().includes(q)
      );
    }

    return nodes.filter((n) => n.category === selectedCategory);
  }

  function createLauncherButton() {
    if (document.getElementById("tj-node-launcher")) return;

    launcherBtn = document.createElement("div");
    launcherBtn.id = "tj-node-launcher";
    launcherBtn.innerHTML = `
      <div class="tj-icon">TJ</div>
      <div class="tj-label">TJ_NODE SET</div>
    `;

    launcherBtn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      isDraggingButton = false;
      dragState = {
        startX: e.clientX,
        startY: e.clientY,
        left: launcherBtn.offsetLeft,
        top: launcherBtn.offsetTop
      };
      launcherBtn.setPointerCapture(e.pointerId);
    });

    launcherBtn.addEventListener("pointermove", (e) => {
      if (!dragState) return;
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) isDraggingButton = true;
      if (!isDraggingButton) return;

      const maxLeft = window.innerWidth - 44;
      const maxTop = window.innerHeight - 44;
      launcherBtn.style.left = `${Math.max(4, Math.min(maxLeft, dragState.left + dx))}px`;
      launcherBtn.style.top = `${Math.max(4, Math.min(maxTop, dragState.top + dy))}px`;
    });

    launcherBtn.addEventListener("pointerup", (e) => {
      if (dragState) {
        launcherBtn.releasePointerCapture(e.pointerId);
        localStorage.setItem(STORAGE_POS, JSON.stringify({
          left: launcherBtn.style.left,
          top: launcherBtn.style.top
        }));
      }
      const clicked = !isDraggingButton;
      dragState = null;
      if (clicked) togglePanel();
    });

    document.body.appendChild(launcherBtn);

    const pos = safeJSONParse(localStorage.getItem(STORAGE_POS), null);
    if (pos?.left && pos?.top) {
      launcherBtn.style.left = pos.left;
      launcherBtn.style.top = pos.top;
    }
  }

  function closePanel() {
    panel?.remove();
    panel = null;
  }

  function togglePanel() {
    if (panel) closePanel();
    else openPanel();
  }

  function openPanel() {
    closePanel();

    panel = document.createElement("div");
    panel.id = "tj-node-launcher-panel";

    const left = Math.min(window.innerWidth - 450, Math.max(10, launcherBtn.offsetLeft + 52));
    const top = Math.min(window.innerHeight - 660, Math.max(10, launcherBtn.offsetTop));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;

    panel.innerHTML = `
      <div class="tj-panel-head">
        <div class="tj-panel-title">
          <span>✨ TJ_NODE SET</span>
          <button class="tj-panel-close" title="Close">×</button>
        </div>
        <input class="tj-panel-search" placeholder="Search TJ node..." value="${escapeHTML(searchText)}" />
      </div>
      <div class="tj-quick-actions"></div>
      <div class="tj-body">
        <div class="tj-category-tabs"></div>
        <div class="tj-node-list"></div>
      </div>
    `;

    panel.querySelector(".tj-panel-close").addEventListener("click", closePanel);
    const search = panel.querySelector(".tj-panel-search");
    search.addEventListener("input", (e) => {
      searchText = e.target.value || "";
      renderPanelContent();
    });

    document.body.appendChild(panel);
    renderPanelContent();
    setTimeout(() => search.focus(), 0);
  }

  function renderQuickActions() {
    const wrap = panel?.querySelector(".tj-quick-actions");
    if (!wrap) return;
    wrap.innerHTML = "";

    TJ_QUICK_NODES.forEach((title) => {
      const node = findRegistryNodeByTitle(title);
      const btn = document.createElement("button");
      btn.className = `tj-quick-btn ${node?.exists ? "" : "disabled"}`;
      btn.textContent = title.replace(" Node", "").replace(" (TJ)", "");
      btn.title = node?.exists ? node.realType : `${title} not registered`;
      if (node?.exists) {
        btn.addEventListener("click", () => selectNodeForPlacement(node));
      }
      wrap.appendChild(btn);
    });
  }

  function renderPanelContent() {
    if (!panel) return;

    renderQuickActions();

    const tabs = panel.querySelector(".tj-category-tabs");
    const list = panel.querySelector(".tj-node-list");

    tabs.innerHTML = "";
    TJ_LAUNCHER_CATEGORIES.forEach((cat) => {
      const count = TJ_LAUNCHER_NODES.filter((n) => n.category === cat).length;
      const tab = document.createElement("button");
      tab.className = `tj-category-tab ${selectedCategory === cat ? "active" : ""}`;
      tab.textContent = `${cat} ${count ? `(${count})` : ""}`;
      tab.addEventListener("click", () => {
        selectedCategory = cat;
        searchText = "";
        const input = panel.querySelector(".tj-panel-search");
        if (input) input.value = "";
        renderPanelContent();
      });
      tabs.appendChild(tab);
    });

    const nodes = visibleNodes();
    list.innerHTML = "";

    const label = document.createElement("div");
    label.className = "tj-section-label";
    label.textContent = searchText.trim() ? `Search results (${nodes.length})` : `${selectedCategory} (${nodes.length})`;
    list.appendChild(label);

    if (!nodes.length) {
      const empty = document.createElement("div");
      empty.className = "tj-empty";
      empty.textContent = "No node in this category.";
      list.appendChild(empty);
      return;
    }

    nodes.forEach((node) => {
      const item = document.createElement("div");
      item.className = `tj-node-item ${node.exists ? "" : "missing"}`;
      item.innerHTML = `
        <div class="tj-node-name">${escapeHTML(node.title)}</div>
        <div class="tj-node-meta">${escapeHTML(node.category)} · ${escapeHTML(node.exists ? node.realType : "missing / type mismatch")}</div>
      `;
      if (node.exists) {
        item.addEventListener("click", () => selectNodeForPlacement(node));
      }
      list.appendChild(item);
    });
  }

  function selectNodeForPlacement(node) {
    if (!node?.exists) return;
    pendingNodeType = node.realType;
    pendingNodeTitle = node.title || node.realType;
    pushRecent(node.realType);
    closePanel();
    showGhost(pendingNodeTitle);
  }

  function showGhost(title) {
    hideGhost();
    ghost = document.createElement("div");
    ghost.id = "tj-node-ghost";
    ghost.textContent = title;
    document.body.appendChild(ghost);
    moveGhostTo(currentMouse.x, currentMouse.y);
  }

  function hideGhost() {
    ghost?.remove();
    ghost = null;
  }

  function moveGhostTo(x, y) {
    currentMouse = { x, y };
    if (!ghost) return;
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
  }

  function getCanvasElement() {
    return app?.canvas?.canvas || document.querySelector("canvas");
  }

  function clientToGraphPos(clientX, clientY) {
    const canvas = app?.canvas;
    const canvasEl = getCanvasElement();

    if (!canvasEl || !canvas) return [clientX, clientY];

    if (typeof canvas.convertEventToCanvasOffset === "function") {
      return canvas.convertEventToCanvasOffset({ clientX, clientY });
    }

    const rect = canvasEl.getBoundingClientRect();
    const ds = canvas.ds;
    const x = (clientX - rect.left) / ds.scale - ds.offset[0];
    const y = (clientY - rect.top) / ds.scale - ds.offset[1];
    return [x, y];
  }

  function placePendingNode(clientX, clientY) {
    if (!pendingNodeType) return false;

    try {
      const node = LiteGraph.createNode(pendingNodeType);
      if (!node) {
        console.warn("[TJ Launcher] Failed to create node:", pendingNodeType);
        return true;
      }

      node.pos = clientToGraphPos(clientX, clientY);
      app.graph.add(node);

      if (app.canvas?.selectNode) app.canvas.selectNode(node);
      if (app.canvas?.setDirty) app.canvas.setDirty(true, true);
      else app.canvas?.draw?.(true, true);

      log("Placed node:", pendingNodeTitle, pendingNodeType, node.pos);
    } catch (err) {
      console.error("[TJ Launcher] Node placement error:", err);
    } finally {
      pendingNodeType = null;
      pendingNodeTitle = "";
      hideGhost();
    }
    return true;
  }

  function installPlacementListeners() {
    window.addEventListener("mousemove", (e) => {
      moveGhostTo(e.clientX, e.clientY);
    }, true);

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && pendingNodeType) {
        pendingNodeType = null;
        pendingNodeTitle = "";
        hideGhost();
      }
    }, true);

    window.addEventListener("click", (e) => {
      if (!pendingNodeType) return;

      const canvasEl = getCanvasElement();
      const clickedCanvas = e.target === canvasEl || e.target?.tagName?.toLowerCase() === "canvas";
      if (!clickedCanvas) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      placePendingNode(e.clientX, e.clientY);
    }, true);
  }

  function closePanelOnOutsideClick() {
    window.addEventListener("pointerdown", (e) => {
      if (!panel) return;
      if (panel.contains(e.target)) return;
      if (launcherBtn?.contains(e.target)) return;
      closePanel();
    }, true);
  }

  app.registerExtension({
    name: EXT_NAME,
    async setup() {
      injectStyle();
      createLauncherButton();
      installPlacementListeners();
      closePanelOnOutsideClick();

      setTimeout(() => {
        const missing = allRegistryNodes().filter((n) => !n.exists);
        if (missing.length) console.warn("[TJ Launcher] Missing registered types:", missing.map((n) => n.title));
        log("loaded. registry nodes:", TJ_LAUNCHER_NODES.length);
      }, 1000);
    }
  });
})();
