import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// === Set Node 이름 변경 시 글로벌 동기화 ===


function tjStripCacheBust(url) {
    if (!url) return "";
    try {
        const u = new URL(url, window.location.origin);
        u.searchParams.delete("t");
        return u.pathname + u.search;
    } catch (_) {
        return String(url).replace(/([?&])t=[^&]*/g, "$1").replace(/[?&]$/, "");
    }
}

function tjSafePreviewMeta(meta) {
    if (!meta || typeof meta !== "object") return null;
    const filename = meta.filename || meta.name || meta.file || "";
    if (!filename) return null;
    return {
        filename,
        type: meta.type || "output",
        subfolder: meta.subfolder || ""
    };
}

function tjBuildPreviewUrl(meta, node=null, retry=0) {
    const m = tjSafePreviewMeta(meta);
    if (!m) return "";
    let url = `/view?filename=${encodeURIComponent(m.filename)}&type=${encodeURIComponent(m.type)}`;
    if (m.subfolder) url += `&subfolder=${encodeURIComponent(m.subfolder)}`;
    url += `&t=${Date.now()}_${node?.id || "node"}_${retry}`;
    return api.apiURL(url);
}

function tjMakePreviewImage(meta, node=null, idx=0, onReady=null) {
    const imgEl = new Image();
    imgEl._tj_meta = tjSafePreviewMeta(meta) || meta;
    imgEl._tj_ready = false;
    imgEl._tj_error = false;
    imgEl._tj_index = idx;
    const load = (retry = 0) => {
        imgEl._tj_retry = retry;
        imgEl.onload = async () => {
            try { if (imgEl.decode) await imgEl.decode().catch(() => {}); } catch (_) {}
            imgEl._tj_ready = true;
            imgEl._tj_error = false;
            if (onReady) onReady(imgEl, idx);
            node?.setDirtyCanvas?.(true, true);
            app.canvas?.setDirty(true, true);
        };
        imgEl.onerror = () => {
            imgEl._tj_ready = false;
            imgEl._tj_error = true;
            if (retry < 3) setTimeout(() => load(retry + 1), 120 * (retry + 1));
            else {
                node?.setDirtyCanvas?.(true, true);
                app.canvas?.setDirty(true, true);
            }
        };
        const nextUrl = tjBuildPreviewUrl(meta, node, retry);
        imgEl._tj_base_url = tjPreviewBaseUrl ? tjPreviewBaseUrl(nextUrl) : tjStripCacheBust(nextUrl);
        imgEl.src = nextUrl;
    };
    load(0);
    return imgEl;
}

function tjStorePreviewState(node, payload) {
    if (!node) return;
    if (!node.properties) node.properties = {};
    node.properties.tj_last_preview = {
        ...(payload || {}),
        saved_at: Date.now(),
        owner_node_id: node.id
    };
}

function tjSetWidgetValue(node, name, value) {
    const w = node?.widgets?.find(x => x.name === name);
    if (!w) return false;
    w.value = value;
    try { if (typeof w.callback === "function") w.callback.call(w, value, node, w); } catch (_) {}
    return true;
}

function tjRemoveInputLink(node, index = 0) {
    const input = node?.inputs?.[index];
    const graph = node?.graph || app.graph;
    if (!input || input.link == null || !graph) return false;
    const linkId = input.link;
    try {
        if (typeof graph.removeLink === "function") graph.removeLink(linkId);
        else if (graph.links && graph.links[linkId]) {
            const link = graph.links[linkId];
            const origin = graph.getNodeById?.(link.origin_id);
            const target = graph.getNodeById?.(link.target_id);
            if (origin?.outputs?.[link.origin_slot]?.links) {
                origin.outputs[link.origin_slot].links = origin.outputs[link.origin_slot].links.filter(id => id !== linkId);
            }
            if (target?.inputs?.[link.target_slot]) target.inputs[link.target_slot].link = null;
            delete graph.links[linkId];
        } else {
            input.link = null;
        }
    } catch (_) {
        input.link = null;
    }
    return true;
}

function tjDetachCopiedPreviewSnapshot(node, opts = {}) {
    if (!node || !node.properties) return false;
    const stored = node.properties.tj_last_preview;
    if (!stored || !stored.owner_node_id || node.properties.tj_snapshot_detached) return false;
    if (String(stored.owner_node_id) === String(node.id)) return false;

    // This node is a copied preview snapshot. Keep the visual preview state,
    // but detach every live source that would update it on the next queue run.
    tjRemoveInputLink(node, opts.inputIndex ?? 0);
    tjSetWidgetValue(node, "get_name", "(none)");
    tjSetWidgetValue(node, "setnode_name", "");
    tjSetWidgetValue(node, "file", "(none)");
    tjSetWidgetValue(node, "text_content", "");

    // Clear live local-file restore hints while keeping tj_last_preview as the snapshot.
    delete node.properties.tj_local_file;
    delete node.properties.tj_local_filename;
    delete node.properties.tj_restore_file;
    delete node.properties.tj_uploaded_file;

    node.properties.tj_snapshot_detached = true;
    stored.owner_node_id = node.id;
    stored.snapshot_detached = true;

    const inp = node.inputs?.[opts.inputIndex ?? 0];
    if (inp && opts.inputName) {
        inp.name = opts.inputName;
        inp.link = null;
    }
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
    return true;
}

function tjGetStoredPreviewState(node) {
    return node?.properties?.tj_last_preview || null;
}

function tjRestoreDetachedSnapshotIfNeeded(node) {
    if (!node?.properties?.tj_snapshot_detached) return false;
    const stored = tjGetStoredPreviewState(node);
    if (!stored) return false;
    // Snapshot nodes must never be overwritten by later queue runs.
    // If ComfyUI clears the runtime preview cache during execution, rebuild it from stored metadata.
    if (typeof node._tjRestoreLastPreview === "function") {
        try { return !!node._tjRestoreLastPreview(); } catch (_) { return false; }
    }
    return false;
}

function attachSetNodeSync(node) {
    if (window.TJ_NODE_attachProviderNameSync) {
        window.TJ_NODE_attachProviderNameSync(node);
        return;
    }
    const w = node.widgets?.find(x => x.name === "setnode_name" || x.name === "set_name");
    if (w && !w._tj_sync_attached) {
        w._tj_sync_attached = true;
        const origCb = w.callback;
        w.callback = function(v) {
            if (origCb) origCb.call(this, v);
            if (app.graph) {
                app.graph._nodes.forEach(n => {
                    if (n.type === "TJ_GetNode" && n._syncWithSetNode) n._syncWithSetNode();
                    if (n.type === "TJ_MultiGetNode") {
                        if (n._syncWithSetNodes) n._syncWithSetNodes();
                        else if (n._rebuild) n._rebuild();
                    }
                });
            }
            app.canvas.setDirty(true, true);
        };
    }
}
function applyTJTheme(node) {
    if (window.TJ_NODE_applyTheme) return window.TJ_NODE_applyTheme(node);
    node.bgcolor = "#000000";
    node.color = "#7612DA";
    node.title_text_color = "#FFFFFF";
}


function tjGetOutputSlot(node, slot) {
    if (!node || slot == null || slot < 0) return null;
    return node.outputs?.[slot] || null;
}

function tjCanConnect(sourceInfo, target, targetSlot) {
    return !!(sourceInfo?.node && target?.inputs?.[targetSlot] && tjGetOutputSlot(sourceInfo.node, sourceInfo.slot));
}

function tjSafeRemoveLink(graph, linkId) {
    if (!graph || linkId == null) return;
    const link = graph.links?.[linkId] || graph.links?.get?.(linkId);
    if (link) graph.removeLink(linkId);
}

function tjGetGraphLink(graph, linkId) {
    if (!graph || linkId == null) return null;
    return graph.links?.[linkId] || graph.links?.get?.(linkId) || null;
}

function tjIsWirelessLink(graph, linkId) {
    const link = tjGetGraphLink(graph, linkId);
    return !!(link && (link._tj_wireless || link._tj_provider_value));
}
function tjSmartGetAllSetNames(graph) {
    if (window.TJ_NODE_getAllSetNames) return window.TJ_NODE_getAllSetNames(graph);
    if (!graph) return ["(none)"];
    const names = [];
    graph._nodes?.forEach(n => {
        if (!n || n.type === "TJ_GetNode" || n.type === "TJ_MultiGetNode") return;
        const w = n.widgets?.find(x => x.name === "set_name" || x.name === "setnode_name");
        if (w && String(w.value || "").trim()) names.push(String(w.value).trim());
        if ((n.type === "TJ_MultiRouter" || n.type === "TJ_BatchToMultiOutput" || n.type === "TJ_MultiImageLoader") && n.properties?.auto_sets) {
            const autoW = n.widgets?.find(x => x.name === "auto_set");
            if (!autoW || autoW.value) Object.values(n.properties.auto_sets).forEach(v => { if (String(v || "").trim()) names.push(String(v).trim()); });
        }
    });
    return ["(none)", ...new Set(names)].sort();
}

function tjSmartFindSetterSourceInfo(graph, setName) {
    if (window.TJ_NODE_findSetterSourceInfo) return window.TJ_NODE_findSetterSourceInfo(graph, setName);
    if (!graph || !setName || setName === "(none)") return null;
    for (const n of graph._nodes || []) {
        if (!n || n.type === "TJ_GetNode" || n.type === "TJ_MultiGetNode") continue;
        const w = n.widgets?.find(x => x.name === "set_name" || x.name === "setnode_name");
        if (w && w.value === setName && n.outputs?.length) return { node: n, slot: 0 };
        if ((n.type === "TJ_MultiRouter" || n.type === "TJ_BatchToMultiOutput" || n.type === "TJ_MultiImageLoader") && n.properties?.auto_sets) {
            const autoW = n.widgets?.find(x => x.name === "auto_set");
            if (autoW && !autoW.value) continue;
            for (const [idx, nm] of Object.entries(n.properties.auto_sets)) {
                if (nm === setName) {
                    const slot = parseInt(idx);
                    if (tjGetOutputSlot(n, slot)) return { node: n, slot };
                }
            }
        }
    }
    return null;
}

function tjSmartLabelName(graph, name) {
    if (window.TJ_NODE_getProviderLabelName) return window.TJ_NODE_getProviderLabelName(graph, name);
    return name && name !== "(none)" ? String(name) : "";
}

function tjSmartIsSeparator(name) {
    return !!(name && window.TJ_NODE_PROVIDER_SEPARATOR && name === window.TJ_NODE_PROVIDER_SEPARATOR);
}

function tjSmartMarkGetLabel(node, name) {
    if (!node?.inputs?.[0]) return;
    const label = tjSmartLabelName(node.graph, name);
    node.inputs[0].label = label ? `◀ ${label}` : "";
}


function attachTJGetReceiver(node, opts = {}) {
    const widgetName = opts.widgetName || "get_name";
    const inputIndex = opts.inputIndex ?? 0;
    const inputName = opts.inputName || (node.inputs?.[inputIndex]?.name || "input");
    const outputIndex = opts.outputIndex;
    const defaultType = opts.defaultType || node.inputs?.[inputIndex]?.type || "*";
    const defaultOutputType = opts.defaultOutputType || node.outputs?.[outputIndex]?.type || "*";
    const getW = node.widgets?.find(w => w.name === widgetName);
    if (!getW || getW._tj_get_receiver_attached) return;
    getW._tj_get_receiver_attached = true;

    const refreshProviderValues = () => {
        const values = tjSmartGetAllSetNames(node.graph);
        const next = Array.isArray(values) ? [...values] : ["(none)"];
        if (getW.value && getW.value !== "(none)" && !next.includes(getW.value)) next.push(getW.value);
        getW.options = { ...(getW.options || {}), values: next };
        return next;
    };

    const removeWirelessInputOnly = (target) => {
        const input = target.inputs?.[inputIndex];
        if (!target.graph || !input || input.link == null) return;
        if (tjIsWirelessLink(target.graph, input.link)) {
            target._tj_connecting_wireless = true;
            try { tjSafeRemoveLink(target.graph, input.link); }
            finally { target._tj_connecting_wireless = false; }
            input.link = null;
        }
    };

    node._tjUpdateGetReceiverOptions = function() {
        const w = this.widgets?.find(x => x.name === widgetName);
        if (!w) return;
        refreshProviderValues();
        const label = tjSmartLabelName(this.graph, w.value);
        if (this.inputs?.[inputIndex]) this.inputs[inputIndex].label = label ? `◀ ${label}` : "";
    };

    node._tjConnectGetReceiver = function(setName, connectOpts = {}) {
        if (!this.graph || !this.inputs?.[inputIndex]) return;
        const w = this.widgets?.find(x => x.name === widgetName);
        if (tjSmartIsSeparator(setName)) {
            if (w) w.value = w._tj_previous_value || w.value || "(none)";
            return;
        }

        const selected = setName || "(none)";
        if (w && w.value !== selected) w.value = selected;
        if (w) w._tj_previous_value = selected;

        const input = this.inputs[inputIndex];
        const currentLinkId = input.link;
        const currentIsWireless = tjIsWirelessLink(this.graph, currentLinkId);
        input.name = inputName;

        if (currentLinkId != null && !currentIsWireless && !connectOpts.forceWireless) {
            input.label = "";
            app.canvas?.setDirty(true, true);
            return;
        }

        if (!selected || selected === "(none)") {
            removeWirelessInputOnly(this);
            input.label = "";
            if (currentLinkId == null || currentIsWireless) input.type = defaultType;
            if (outputIndex !== undefined && this.outputs?.[outputIndex]) this.outputs[outputIndex].type = defaultOutputType;
            app.canvas?.setDirty(true, true);
            return;
        }

        const provider = window.TJ_NODE_findProviderByValue ? window.TJ_NODE_findProviderByValue(this.graph, selected) : null;
        if (!provider) {
            input.label = `◀ ${tjSmartLabelName(this.graph, selected) || selected}`;
            window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 80);
            window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 300);
            app.canvas?.setDirty(true, true);
            return;
        }

        const normalizedValue = provider.displayName || selected;
        if (w && w.value !== normalizedValue) w.value = normalizedValue;
        if (w) w._tj_previous_value = normalizedValue;

        if (window.TJ_NODE_forceReconnectConsumer) {
            window.TJ_NODE_forceReconnectConsumer(this, normalizedValue, inputIndex);
        } else {
            const sourceInfo = tjSmartFindSetterSourceInfo(this.graph, normalizedValue);
            if (sourceInfo && tjCanConnect(sourceInfo, this, inputIndex)) {
                removeWirelessInputOnly(this);
                this._tj_connecting_wireless = true;
                try {
                    sourceInfo.node.connect(sourceInfo.slot, this, inputIndex);
                    window.TJ_NODE_markWirelessLink?.(this.graph, this, inputIndex, normalizedValue);
                } finally {
                    this._tj_connecting_wireless = false;
                }
            }
        }

        const sourceInfo = tjSmartFindSetterSourceInfo(this.graph, normalizedValue);
        const t = tjGetOutputSlot(sourceInfo?.node, sourceInfo?.slot)?.type || defaultType || "*";
        input.name = inputName;
        input.type = t;
        input.label = `◀ ${provider.labelName || tjSmartLabelName(this.graph, normalizedValue)}`;
        if (outputIndex !== undefined && this.outputs?.[outputIndex]) this.outputs[outputIndex].type = t;
        app.canvas?.setDirty(true, true);
    };

    const origCb = getW.callback;
    getW.callback = function(v) {
        if (origCb) origCb.call(this, v);
        if (tjSmartIsSeparator(v)) { getW.value = getW._tj_previous_value || getW.value || "(none)"; return; }
        getW._tj_previous_value = v;
        node._tjConnectGetReceiver(v, { forceWireless: true });
    };

    const origConnChange = node.onConnectionsChange;
    node.onConnectionsChange = function(type, index, connected) {
        if (origConnChange) origConnChange.apply(this, arguments);
        if (type === LiteGraph.INPUT && index === inputIndex) {
            const w = this.widgets?.find(x => x.name === widgetName);
            if (connected && !this._tj_connecting_wireless) {
                const lid = this.inputs?.[inputIndex]?.link;
                if (lid != null && !tjIsWirelessLink(this.graph, lid)) {
                    if (w && w.value !== "(none)") w.value = "(none)";
                    this.inputs[inputIndex].label = "";
                }
            } else if (!connected && !this._tj_connecting_wireless) {
                const selected = w?.value;
                if (selected && selected !== "(none)") {
                    this.inputs[inputIndex].label = `◀ ${tjSmartLabelName(this.graph, selected) || selected}`;
                    window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 80);
                    window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 300);
                }
            }
            app.canvas?.setDirty(true, true);
        }
    };

    requestAnimationFrame(() => {
        refreshProviderValues();
        node._tjUpdateGetReceiverOptions?.();
        node._tjConnectGetReceiver?.(getW.value);
    });
    setTimeout(() => {
        refreshProviderValues();
        node._tjUpdateGetReceiverOptions?.();
        if (getW.value && getW.value !== "(none)") node._tjConnectGetReceiver?.(getW.value);
    }, 500);
}

function tjComputePackedImageGrid(count, drawW, drawH) {
    // Smart contain grid.
    // Goal:
    // - never crop images
    // - keep a fixed 2px gap
    // - make thumbnails grow when the node grows
    // - choose 1/2/3+ rows by available width + height, not by width alone
    // - keep the bottom/right resize area reachable
    const gap = 2;
    const pad = 8;
    const resizeSafe = 18;
    const minCellW = 64;
    const aspect = 1.34; // portrait-friendly cell; actual image is drawn with contain.
    const safeCount = Math.max(1, count || 1);
    const safeW = Math.max(1, (drawW || 1) - pad * 2 - resizeSafe);
    const safeH = Math.max(1, (drawH || 1) - pad * 2 - resizeSafe);

    let best = null;
    const maxRows = Math.max(1, Math.min(safeCount, 6));

    for (let rows = 1; rows <= maxRows; rows++) {
        const cols = Math.ceil(safeCount / rows);
        const maxWByWidth = Math.floor((safeW - gap * (cols - 1)) / cols);
        const maxHByHeight = Math.floor((safeH - gap * (rows - 1)) / rows);
        if (!Number.isFinite(maxWByWidth) || !Number.isFinite(maxHByHeight) || maxWByWidth <= 0 || maxHByHeight <= 0) continue;

        // The cell is portrait-oriented, so constrain width by both horizontal and vertical space.
        const cellW = Math.max(1, Math.floor(Math.min(maxWByWidth, maxHByHeight / aspect)));
        const cellH = Math.max(1, Math.floor(cellW * aspect));
        if (cellW <= 0 || cellH <= 0) continue;

        const gridW = cols * cellW + Math.max(0, cols - 1) * gap;
        const gridH = rows * cellH + Math.max(0, rows - 1) * gap;
        const usedRatio = (gridW * gridH) / Math.max(1, safeW * safeH);
        const thumbArea = cellW * cellH;

        // Prefer larger thumbnails and better area usage.
        // A tiny penalty keeps the layout from adding rows unless it actually makes thumbnails larger.
        const tinyPenalty = cellW < minCellW ? 100000 : 0;
        const rowPenalty = rows * 20;
        const emptyPenalty = Math.max(0, 0.18 - usedRatio) * 10000;
        const score = thumbArea + usedRatio * 2500 - rowPenalty - tinyPenalty - emptyPenalty;

        if (!best || score > best.score || (Math.abs(score - best.score) < 1 && thumbArea > best.cellW * best.cellH)) {
            best = { cols, rows, cellW, cellH, score };
        }
    }

    if (!best) {
        const fallbackW = Math.max(48, Math.min(160, safeW));
        best = { cols: 1, rows: safeCount, cellW: fallbackW, cellH: Math.round(fallbackW * aspect) };
    }

    best.cellW = Math.max(48, Math.floor(best.cellW));
    best.cellH = Math.max(48, Math.floor(best.cellH));
    return { cols: best.cols, rows: best.rows, cellW: best.cellW, cellH: best.cellH, gap, pad, resizeSafe, count: safeCount, drawW: drawW || 1 };
}

function tjGetCenteredGridRect(grid, index, drawWOverride = null) {
    const cols = Math.max(1, grid?.cols || 1);
    const cellW = Math.max(1, grid?.cellW || 1);
    const cellH = Math.max(1, grid?.cellH || 1);
    const gap = grid?.gap ?? 2;
    const pad = grid?.pad ?? 8;
    const resizeSafe = grid?.resizeSafe ?? 18;
    const count = Math.max(1, grid?.count || 1);
    const drawW = drawWOverride || grid?.drawW || 1;

    const row = Math.floor(index / cols);
    const col = index % cols;
    const remaining = Math.max(0, count - row * cols);
    const itemsInRow = Math.max(1, Math.min(cols, remaining));
    const safeW = Math.max(1, drawW - pad * 2 - resizeSafe);

    // Center the whole grid block once, but keep items left-aligned inside it.
    // This means the last row starts at the same x as the first row instead of
    // being centered independently.
    const gridW = cols * cellW + Math.max(0, cols - 1) * gap;
    const startX = pad + Math.max(0, Math.floor((safeW - gridW) / 2));

    return {
        x: startX + col * (cellW + gap),
        yOffset: pad + row * (cellH + gap),
        row, col, itemsInRow
    };
}

function tjFindCenteredGridIndex(grid, x, y, startY, drawWOverride = null) {
    const count = Math.max(0, grid?.count || 0);
    for (let i = 0; i < count; i++) {
        const r = tjGetCenteredGridRect(grid, i, drawWOverride);
        const gx = r.x;
        const gy = startY + r.yOffset;
        if (x >= gx && x <= gx + grid.cellW && y >= gy && y <= gy + grid.cellH) return i;
    }
    return -1;
}

function tjDrawImageContain(ctx, img, x, y, w, h) {
    const iw = img?.naturalWidth || 1;
    const ih = img?.naturalHeight || 1;
    const scale = Math.min(w / iw, h / ih);
    const fw = Math.max(1, iw * scale);
    const fh = Math.max(1, ih * scale);
    const ox = x + (w - fw) / 2;
    const oy = y + (h - fh) / 2;
    ctx.drawImage(img, ox, oy, fw, fh);
}


function tjDrawRoundIconButton(ctx, btn, icon, opts = {}) {
    if (!ctx || !btn) return;
    const cx = btn.x + btn.w / 2;
    const cy = btn.y + btn.h / 2;
    const r = Math.max(1, Math.min(btn.w, btn.h) / 2);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = opts.bg || "rgba(0,0,0,0.55)";
    ctx.fill();
    ctx.fillStyle = opts.color || "#ffffff";
    ctx.font = opts.font || "15px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, cx + (opts.dx || 0), cy + (opts.dy || 0));
    ctx.restore();
}

function tjDrawImageCover(ctx, img, x, y, w, h) {
    const iw = img?.naturalWidth || 1;
    const ih = img?.naturalHeight || 1;
    const scale = Math.max(w / iw, h / ih);
    const sw = Math.max(1, w / scale);
    const sh = Math.max(1, h / scale);
    const sx = Math.max(0, (iw - sw) / 2);
    const sy = Math.max(0, (ih - sh) / 2);
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function tjPreviewBaseUrl(src) {
    if (!src) return "";
    return String(src).replace(/([?&])t=[^&]*/g, "").replace(/[?&]$/, "");
}

function tjReloadSavePreviewImages(node) {
    // Save & Preview only: reload current /view URLs without executing or saving again.
    if (!node || node.type !== "TJ_SaveAndPreviewImage" || !node.tj_imgs?.length) return;
    node.tj_imgs.forEach((img, idx) => {
        if (!img) return;
        const base = img._tj_base_url || tjPreviewBaseUrl(img.src);
        if (!base) return;
        const sep = base.includes("?") ? "&" : "?";
        img._tj_ready = false;
        img._tj_error = false;
        img.onload = async () => {
            try { if (img.decode) await img.decode().catch(() => {}); } catch (_) {}
            img._tj_ready = true;
            img._tj_error = false;
            autoFitTJImagePreviewNode(node, 110);
            node.setDirtyCanvas?.(true, true);
            app.canvas?.setDirty(true, true);
        };
        img.onerror = () => {
            img._tj_error = true;
            node.setDirtyCanvas?.(true, true);
            app.canvas?.setDirty(true, true);
        };
        img.src = `${base}${sep}t=${Date.now()}_${node.id || "node"}_${idx}_manual`;
    });
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

function autoFitTJImagePreviewNode(node, extraTop = 120) {
    // TJ_NODE75D:
    // Do not resize Save & Preview Image at execution time.
    // The node now starts with a usable 2:3-ish preview area and all images are
    // fit-centered inside the current user-controlled node size.
    // Keep this function as a redraw hook because older reload/refresh paths call it.
    if (!node?.tj_imgs || node.tj_imgs.length === 0) return;
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
}

function hideTJWidget(w) {
    if (!w) return;
    w.type = "hidden";
    w.computeSize = () => [0, 0];
    w.draw = () => {};
}

function showCenterConfirm(message, onConfirm) {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(3px);";
    const box = document.createElement("div");
    box.style.cssText = "background: #1a1a1a; border: 1px solid #ff4757; border-radius: 8px; padding: 24px; width: 420px; box-shadow: 0 10px 40px rgba(0,0,0,0.9); font-family: sans-serif; color: #fff; text-align: center;";
    
    const msgEl = document.createElement("div");
    msgEl.innerHTML = message;
    msgEl.style.cssText = "font-size: 14px; margin-bottom: 24px; line-height: 1.6;";
    
    const btnContainer = document.createElement("div");
    btnContainer.style.cssText = "display: flex; justify-content: center; gap: 16px;";
    
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = "padding: 10px 24px; background: #333; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;";
    cancelBtn.onclick = () => { document.body.removeChild(overlay); };
    
    const okBtn = document.createElement("button");
    okBtn.textContent = "Proceed";
    okBtn.style.cssText = "padding: 10px 24px; background: #ff4757; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;";
    okBtn.onclick = () => { document.body.removeChild(overlay); if(onConfirm) onConfirm(); };
    
    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(okBtn);
    box.appendChild(msgEl);
    box.appendChild(btnContainer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// 🚀 신규: 독립적인 풀스크린 팝업 이미지 뷰어 (마우스 드래그/휠/더블클릭/키보드 지원)
function openFullscreenViewer(images, startIdx = 0, opts = {}) {
    if (!images || images.length === 0) return;
    
    let currentIdx = startIdx;
    const onIndexChange = typeof opts?.onIndexChange === "function" ? opts.onIndexChange : null;
    const onClose = typeof opts?.onClose === "function" ? opts.onClose : null;
    let scale = 1;
    let panX = 0, panY = 0;
    let isDragging = false;
    let startClientX = 0, startClientY = 0;

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.92); z-index:999999; display:flex; justify-content:center; align-items:center; user-select:none; font-family:sans-serif; overflow:hidden;";

    const imgEl = document.createElement("img");
    imgEl.style.cssText = "position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) scale(1); max-width:95vw; max-height:95vh; object-fit:contain; cursor:grab; transition: transform 0.1s ease-out;";
    imgEl.draggable = false;
    overlay.appendChild(imgEl);

    const topBar = document.createElement("div");
    topBar.style.cssText = "position:absolute; top:0; left:0; width:100%; height:50px; background:linear-gradient(rgba(0,0,0,0.7), transparent); display:flex; justify-content:space-between; align-items:center; padding:0 20px; box-sizing:border-box; z-index:1000000; color:#fff;";
    
    const counter = document.createElement("div");
    counter.style.cssText = "font-size:14px; text-shadow: 1px 1px 2px #000;";
    
    const closeBtn = document.createElement("div");
    closeBtn.innerHTML = "✕";
    closeBtn.style.cssText = "width:32px;height:32px;border-radius:50%;border:none;outline:none;background:rgba(0,0,0,0.55);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:32px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.35);transition:background 0.15s ease, transform 0.15s ease;";
    closeBtn.onmouseover = () => { closeBtn.style.background = "rgba(0,0,0,0.72)"; closeBtn.style.transform = "scale(1.05)"; };
    closeBtn.onmouseout = () => { closeBtn.style.background = "rgba(0,0,0,0.55)"; closeBtn.style.transform = "scale(1)"; };
    
    topBar.appendChild(counter);
    topBar.appendChild(closeBtn);
    overlay.appendChild(topBar);

    const btnStyle = "position:absolute; top:50%; transform:translateY(-50%); font-size:40px; color:#fff; cursor:pointer; z-index:1000000; text-shadow: 2px 2px 4px #000; padding:20px; opacity:0.6; transition:opacity 0.2s;";
    
    const leftBtn = document.createElement("div");
    leftBtn.innerHTML = "◀";
    leftBtn.style.cssText = btnStyle + "left:20px;";
    leftBtn.onmouseover = () => leftBtn.style.opacity = "1";
    leftBtn.onmouseout = () => leftBtn.style.opacity = "0.6";
    
    const rightBtn = document.createElement("div");
    rightBtn.innerHTML = "▶";
    rightBtn.style.cssText = btnStyle + "right:20px;";
    rightBtn.onmouseover = () => rightBtn.style.opacity = "1";
    rightBtn.onmouseout = () => rightBtn.style.opacity = "0.6";

    if (images.length > 1) {
        overlay.appendChild(leftBtn);
        overlay.appendChild(rightBtn);
    }

    const updateTransform = (smooth = false) => {
        imgEl.style.transition = smooth ? "transform 0.15s ease-out" : "none";
        imgEl.style.transform = `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`;
    };

    const loadImg = (idx) => {
        currentIdx = (idx + images.length) % images.length;
        if (onIndexChange) {
            try { onIndexChange(currentIdx); } catch (err) { console.warn("[TJ_NODE] fullscreen index sync failed", err); }
        }
        const srcObj = images[currentIdx];
        imgEl.src = srcObj.src;
        scale = 1; panX = 0; panY = 0;
        updateTransform(true);
        
        const fnameRaw = srcObj.src.split('filename=')[1]?.split('&')[0] || "image";
        const fname = decodeURIComponent(fnameRaw);
        counter.innerHTML = `<b>[${currentIdx + 1} / ${images.length}]</b> &nbsp;&nbsp; ${fname} &nbsp; (${srcObj.naturalWidth || '?'} x ${srcObj.naturalHeight || '?'})`;
    };

    if (images.length > 1) {
        leftBtn.onclick = (e) => { e.stopPropagation(); loadImg(currentIdx - 1); };
        rightBtn.onclick = (e) => { e.stopPropagation(); loadImg(currentIdx + 1); };
    }

    // 마우스 휠 (Zoom)
    overlay.onwheel = (e) => {
        e.preventDefault();
        const zoomAmount = e.deltaY > 0 ? 0.85 : 1.15;
        scale = Math.max(0.2, Math.min(scale * zoomAmount, 15));
        updateTransform(false);
    };

    // 마우스 드래그 (Pan)
    imgEl.onmousedown = (e) => {
        e.preventDefault();
        isDragging = true;
        startClientX = e.clientX - panX;
        startClientY = e.clientY - panY;
        imgEl.style.cursor = "grabbing";
    };

    overlay.onmousemove = (e) => {
        if (!isDragging) return;
        panX = e.clientX - startClientX;
        panY = e.clientY - startClientY;
        updateTransform(false);
    };

    overlay.onmouseup = () => { isDragging = false; imgEl.style.cursor = "grab"; };
    overlay.onmouseleave = () => { isDragging = false; imgEl.style.cursor = "grab"; };

    // 더블 클릭 시 Fit-to-screen 복구
    imgEl.ondblclick = (e) => {
        e.stopPropagation();
        scale = 1; panX = 0; panY = 0;
        updateTransform(true);
    };

    // 닫기 및 키보드 조작
    const closeViewer = () => {
        window.removeEventListener("keydown", keyHandler, true);
        if (onClose) {
            try { onClose(currentIdx); } catch (err) { console.warn("[TJ_NODE] fullscreen close sync failed", err); }
        }
        if (document.body.contains(overlay)) document.body.removeChild(overlay);
    };

    const keyHandler = (e) => {
        const key = e.key || e.code || "";
        if (key === "Escape" || key === "Esc") {
            e.preventDefault?.();
            e.stopPropagation?.();
            e.stopImmediatePropagation?.();
            closeViewer();
            return;
        }
        if (images.length > 1 && (key === "ArrowLeft" || key === "Left" || key === "ArrowRight" || key === "Right")) {
            e.preventDefault?.();
            e.stopPropagation?.();
            e.stopImmediatePropagation?.();
            if (key === "ArrowLeft" || key === "Left") loadImg(currentIdx - 1);
            else loadImg(currentIdx + 1);
        }
    };

    closeBtn.onclick = (e) => { e.stopPropagation(); closeViewer(); };
    overlay.onclick = (e) => { 
        if (e.target === overlay || e.target === topBar || e.target === counter) closeViewer(); 
    };
    
    window.addEventListener("keydown", keyHandler, true);

    loadImg(startIdx);
    document.body.appendChild(overlay);
}


function installSavePreviewDirectInputGuard(node) {
    if (!node || node._tj_savepreview_direct_guard_installed) return;
    node._tj_savepreview_direct_guard_installed = true;

    const applyDirectState = (opts = {}) => {
        const inp = node.inputs?.[0];
        const graph = node.graph || app.graph;
        if (!inp || !graph || inp.link == null) return;
        const link = graph.links?.[inp.link] || graph.links?.get?.(inp.link) || null;
        if (!link || link._tj_wireless) return;

        const getW = node.widgets?.find(w => w.name === "get_name");
        const selected = getW?.value;
        const hasWirelessSelection = !!(selected && selected !== "(none)" && !tjSmartIsSeparator(selected));

        // Refresh/load can briefly restore the real link before the wireless marker is restored.
        // If get_name still points to a valid provider and the current link is from that provider,
        // re-mark it as wireless instead of treating it as a user direct wire.
        if (hasWirelessSelection) {
            const provider = window.TJ_NODE_findProviderByValue ? window.TJ_NODE_findProviderByValue(graph, selected) : null;
            if (!provider) {
                window.TJ_NODE_scheduleWirelessRepair?.(graph, 80);
                window.TJ_NODE_scheduleWirelessRepair?.(graph, 300);
                return;
            }
            if (link.origin_id === provider.node?.id && link.origin_slot === provider.slot) {
                const normalized = provider.displayName || selected;
                window.TJ_NODE_markWirelessLink?.(graph, node, 0, normalized);
                const label = provider.labelName || tjSmartLabelName(graph, normalized) || selected;
                inp.name = "images";
                inp.label = label ? `◀ ${label}` : "";
                inp.type = tjGetOutputSlot(provider.node, provider.slot)?.type || "IMAGE";
                if (node.outputs?.[0]) node.outputs[0].type = inp.type || "IMAGE";
                node.setDirtyCanvas?.(true, true);
                app.canvas?.setDirty(true, true);
                return;
            }
            if (!opts.fromConnectionEvent) {
                window.TJ_NODE_scheduleWirelessRepair?.(graph, 80);
                return;
            }
        }

        // Direct wire always wins only for an actual direct connection.
        // This is local to Save & Preview and does not touch the global wireless core.
        if (getW && getW.value !== "(none)") getW.value = "(none)";
        inp.name = "images";
        inp.type = "IMAGE";
        inp.label = "";
        if (node.outputs?.[0]) node.outputs[0].type = "IMAGE";
        node.setDirtyCanvas?.(true, true);
        app.canvas?.setDirty(true, true);
    };

    const origConn = node.onConnectionsChange;
    node.onConnectionsChange = function(type, index, connected, link_info, input_info) {
        const r = origConn ? origConn.apply(this, arguments) : undefined;
        if (type === LiteGraph.INPUT && index === 0 && connected) {
            setTimeout(() => applyDirectState({ fromConnectionEvent: true }), 0);
            setTimeout(() => applyDirectState({ fromConnectionEvent: true }), 80);
        }
        return r;
    };

    setTimeout(() => applyDirectState({ fromConnectionEvent: false }), 0);
}

// ─── 1. Save & Preview Image (TJ) ───
app.registerExtension({
    name: "TJ.SaveAndPreviewImage",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "TJ_SaveAndPreviewImage") {
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
                applyTJTheme(this);
                attachSetNodeSync(this);
                attachTJGetReceiver(this, { inputIndex: 0, inputName: "images", outputIndex: 0, defaultType: "IMAGE", defaultOutputType: "IMAGE" });
                installSavePreviewDirectInputGuard(this);

                if (!this.properties) this.properties = {};
                // Default startup size: keep a visible 2:3-ish preview area under the widgets.
                // Upgrade only missing/too-small saved sizes; after that user resize is preserved by onResize.
                if (!this.properties.saved_grid_size || Number(this.properties.saved_grid_size?.[1] || 0) < 250) {
                    this.properties.saved_grid_size = [Math.max(300, Number(this.size?.[0]) || 300), 400];
                }

                this.tj_mode = "grid"; 
                this.tj_view_idx = 0;
                this.tj_imgs = [];

                this._tjRestoreLastPreview = () => {
                    const stored = tjGetStoredPreviewState(this);
                    if (!stored || stored.kind !== "savepreview_image" || !Array.isArray(stored.metas) || stored.metas.length === 0) return false;
                    const metas = stored.metas.map(tjSafePreviewMeta).filter(Boolean);
                    if (metas.length === 0) return false;
                    this.tj_imgs = metas.map((meta, idx) => tjMakePreviewImage(meta, this, idx, () => autoFitTJImagePreviewNode(this, 110)));
                    this.tj_view_idx = Math.max(0, Math.min(stored.view_idx || 0, this.tj_imgs.length - 1));
                    this.tj_mode = stored.mode || (this.tj_imgs.length === 1 ? "single_locked" : "grid");
                    this.setDirtyCanvas?.(true, true);
                    app.canvas?.setDirty(true, true);
                    return true;
                };

                // Save & Preview viewer keyboard control.
                // Only works while this node is in in-node single viewer mode.
                this._tj_isSelected = () => {
                    const selected = app.canvas?.selected_nodes;
                    if (!selected) return false;
                    if (selected instanceof Set) return selected.has(this);
                    return Object.values(selected).includes(this);
                };
                this._tj_closeViewer = () => {
                    if (this.tj_mode === "single") {
                        this.tj_mode = "grid";
                        this.setDirtyCanvas(true, true);
                    }
                };
                this._tj_prevImage = () => {
                    if (this.tj_mode === "single" && this.tj_imgs?.length > 1) {
                        this.tj_view_idx = (this.tj_view_idx - 1 + this.tj_imgs.length) % this.tj_imgs.length;
                        this.setDirtyCanvas(true, true);
                    }
                };
                this._tj_nextImage = () => {
                    if (this.tj_mode === "single" && this.tj_imgs?.length > 1) {
                        this.tj_view_idx = (this.tj_view_idx + 1) % this.tj_imgs.length;
                        this.setDirtyCanvas(true, true);
                    }
                };
                this._tj_keyHandler = (e) => {
                    if (this._tj_fullscreen_open) return;
                    if (this.tj_mode !== "single") return;
                    if (!this._tj_isSelected()) return;
                    const key = e.key || e.code || "";
                    const keyCode = e.keyCode || e.which || 0;
                    const stop = () => {
                        // Capture the key before LiteGraph/ComfyUI uses ArrowLeft to move node selection.
                        if (e.cancelable !== false) e.preventDefault?.();
                        e.stopPropagation?.();
                        e.stopImmediatePropagation?.();
                        e.cancelBubble = true;
                        e.returnValue = false;
                    };
                    if ((key === "f" || key === "F" || key === "KeyF" || keyCode === 70) && !this._tj_fullscreen_open) {
                        stop();
                        this._tj_openFullscreenFromSingle?.();
                    } else if (key === "Escape" || key === "Esc" || keyCode === 27) {
                        stop();
                        this._tj_closeViewer();
                    } else if (key === "ArrowLeft" || key === "Left" || key === "Numpad4" || keyCode === 37) {
                        stop();
                        this._tj_prevImage();
                    } else if (key === "ArrowRight" || key === "Right" || key === "Numpad6" || keyCode === 39) {
                        stop();
                        this._tj_nextImage();
                    }
                };
                // Use capture phase because LiteGraph also consumes ArrowLeft/ArrowRight for canvas navigation.
                window.addEventListener("keydown", this._tj_keyHandler, true);
                document.addEventListener("keydown", this._tj_keyHandler, true);

                this._tj_openFullscreenFromSingle = () => {
                    if (!this.tj_imgs?.length) return;
                    const startIdx = Math.max(0, Math.min(this.tj_view_idx || 0, this.tj_imgs.length - 1));
                    this._tj_fullscreen_open = true;
                    openFullscreenViewer(this.tj_imgs, startIdx, {
                        ownerNode: this,
                        onIndexChange: (idx) => {
                            this.tj_view_idx = idx;
                            if (this.properties?.tj_last_preview) this.properties.tj_last_preview.view_idx = idx;
                            this.setDirtyCanvas?.(true, true);
                            app.canvas?.setDirty(true, true);
                        },
                        onClose: (idx) => {
                            this.tj_view_idx = idx;
                            if (this.properties?.tj_last_preview) this.properties.tj_last_preview.view_idx = idx;
                            this._tj_fullscreen_open = false;
                            this.setDirtyCanvas?.(true, true);
                            app.canvas?.setDirty(true, true);
                        }
                    });
                };

                this.setSize(this.properties.saved_grid_size);
            };

            const origOnResize = nodeType.prototype.onResize;
            nodeType.prototype.onResize = function(size) {
                // Keep the user's current node size as the grid/viewer canvas size.
                // Opening/closing in-node single viewer must not resize the node.
                if (!this.properties) this.properties = {};
                this.properties.saved_grid_size = [size[0], size[1]];
                if (origOnResize) origOnResize.apply(this, arguments);
            };

            const origOnRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function() {
                if (this._tj_keyHandler) {
                    window.removeEventListener("keydown", this._tj_keyHandler, true);
                    document.removeEventListener("keydown", this._tj_keyHandler, true);
                }
                if (origOnRemoved) origOnRemoved.apply(this, arguments);
            };

            const origOnConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function(data) {
                if (origOnConfigure) origOnConfigure.apply(this, arguments);
                const detachSnapshot = () => tjDetachCopiedPreviewSnapshot(this, { inputIndex: 0, inputName: "images" });
                detachSnapshot();
                setTimeout(() => {
                    detachSnapshot();
                    attachSetNodeSync(this);
                    attachTJGetReceiver(this, { inputIndex: 0, inputName: "images", outputIndex: 0, defaultType: "IMAGE", defaultOutputType: "IMAGE" });
                    installSavePreviewDirectInputGuard(this);
                    if ((!this.tj_imgs || this.tj_imgs.length === 0) && this._tjRestoreLastPreview) this._tjRestoreLastPreview();
                }, 100);
            };

            nodeType.prototype.onExecuted = function(message) {
                if (this.properties?.tj_snapshot_detached) {
                    tjRestoreDetachedSnapshotIfNeeded(this);
                    return;
                }
                // Save & Preview Image (TJ) display pipeline only.
                // Do not touch wireless/direct-wire logic here.
                // ComfyUI may return UI payloads in slightly different shapes,
                // so normalize defensively and make image loading retry-safe.
                const tjImagesRaw = message?.tj_images || message?.ui?.tj_images || message?.images || null;
                if (!tjImagesRaw) return;

                const tjImages = Array.isArray(tjImagesRaw) ? tjImagesRaw.flat(Infinity).filter(Boolean) : [];
                if (tjImages.length === 0) {
                    this.tj_imgs = [];
                    this.tj_view_idx = 0;
                    this.tj_mode = "grid";
                    this.setDirtyCanvas(true, true);
                    return;
                }

                const safeMetas = tjImages.map(tjSafePreviewMeta).filter(Boolean);
                this.tj_imgs = safeMetas.map((meta, idx) => tjMakePreviewImage(meta, this, idx, () => autoFitTJImagePreviewNode(this, 110)));

                this.tj_view_idx = 0;
                this.tj_mode = this.tj_imgs.length === 1 ? "single_locked" : "grid";
                tjStorePreviewState(this, {
                    kind: "savepreview_image",
                    metas: safeMetas,
                    view_idx: this.tj_view_idx,
                    mode: this.tj_mode
                });
                this.setDirtyCanvas(true, true);
                app.canvas?.setDirty(true, true);

                // Second delayed redraw catches cached/slow image decode cases without rerunning the sampler.
                setTimeout(() => {
                    autoFitTJImagePreviewNode(this, 110);
                    this.setDirtyCanvas(true, true);
                    app.canvas?.setDirty(true, true);
                }, 250);
            };

            nodeType.prototype.onDrawForeground = function(ctx) {
                this._tjUpdateGetReceiverOptions?.();
                if (this.flags?.collapsed) return;
                if (this.properties?.tj_snapshot_detached && (!this.tj_imgs || this.tj_imgs.length === 0)) {
                    tjRestoreDetachedSnapshotIfNeeded(this);
                }
                if (!this.tj_imgs || this.tj_imgs.length === 0) return;
                
                let startY = LiteGraph.NODE_TITLE_HEIGHT; 
                if (this.widgets) startY = this.widgets.reduce((sum, w) => sum + (w.computeSize ? w.computeSize()[1] : 20) + 4, startY);
                startY += 5; 

                const drawW = this.size[0];
                const drawH = this.size[1] - startY;
                if (drawH <= 0 || drawW <= 0) return;

                ctx.fillStyle = "#000000";
                ctx.fillRect(0, startY, drawW, drawH);

                if (this.tj_mode === "single" || this.tj_mode === "single_locked") {
                    const img = this.tj_imgs[this.tj_view_idx];
                    if (!img || !img.complete || img._tj_error || img.naturalWidth === 0) {
                        ctx.fillStyle = img?._tj_error ? "#441111" : "#111111";
                        ctx.fillRect(0, startY, drawW, drawH);
                        ctx.fillStyle = "#cccccc";
                        ctx.font = "12px sans-serif";
                        const msg = img?._tj_error ? "Preview load failed / retry after next execution" : "Loading preview...";
                        const tw = ctx.measureText(msg).width;
                        ctx.fillText(msg, Math.max(8, (drawW - tw) / 2), startY + Math.max(24, drawH / 2));
                        return;
                    }

                    const imgW = img.naturalWidth || 1;
                    const imgH = img.naturalHeight || 1;
                    const availableH = drawH - 24; 
                    
                    const scale = Math.min(drawW / imgW, availableH / imgH);
                    const fitW = imgW * scale;
                    const fitH = imgH * scale;
                    const offsetX = (drawW - fitW) / 2;
                    const offsetY = startY + (availableH - fitH) / 2;

                    ctx.drawImage(img, offsetX, offsetY, fitW, fitH);

                    // Fullscreen trigger button (Save & Preview only): small top-left magnifier.
                    // This avoids double-click conflicts with the in-node viewer layer.
                    this._tj_fullscreen_btn = { x: 8, y: startY + 6, w: 28, h: 28 };
                    tjDrawRoundIconButton(ctx, this._tj_fullscreen_btn, "🔍", {
                        bg: "rgba(0,0,0,0.55)",
                        color: "#ffffff",
                        font: "15px sans-serif",
                        dy: 0
                    });

                    // Manual display reload also works in single-image mode.
                    // For batch-expanded single viewer, draw refresh below the close button
                    // to prevent pointer overlap with X/close.
                    if (this.tj_mode === "single") {
                        this._tj_refresh_btn = { x: this.size[0] - 36, y: startY + 38, w: 28, h: 28 };
                    } else {
                        this._tj_refresh_btn = { x: 44, y: startY + 6, w: 28, h: 28 };
                    }
                    tjDrawRoundIconButton(ctx, this._tj_refresh_btn, "↺", {
                        bg: "rgba(0,0,0,0.55)",
                        color: "#ffffff",
                        font: "17px sans-serif",
                        dy: -1
                    });

                    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
                    ctx.fillRect(0, this.size[1] - 24, this.size[0], 24);
                    
                    ctx.fillStyle = "#ffffff";
                    ctx.font = "11px sans-serif";
                    const fnameRaw = img.src.split('filename=')[1]?.split('&')[0] || "image";
                    const fname = decodeURIComponent(fnameRaw);
                    
                    const text = this.tj_mode === "single"
                        ? `[${this.tj_view_idx + 1} / ${this.tj_imgs.length}] ${fname} — ${imgW} x ${imgH}`
                        : `${fname} — ${imgW} x ${imgH}`;
                    
                    const tw = ctx.measureText(text).width;
                    ctx.fillText(text, (this.size[0] - tw)/2, this.size[1] - 8);

                    if (this.tj_mode === "single") {
                        ctx.font = "24px sans-serif";
                        ctx.fillStyle = "#00efff";
                        if (this.tj_imgs.length > 1) {
                            ctx.fillText("◀", 10, startY + availableH / 2 + 10);
                            ctx.fillText("▶", this.size[0] - 30, startY + availableH / 2 + 10);
                        }
                        this._tj_close_btn = { x: this.size[0] - 36, y: startY + 6, w: 28, h: 28 };
                        tjDrawRoundIconButton(ctx, this._tj_close_btn, "✕", {
                            bg: "rgba(0,0,0,0.55)",
                            color: "#ffffff",
                            font: "16px sans-serif",
                            dy: -1
                        });
                    }
                } else {
                    const count = this.tj_imgs.length;
                    const grid = tjComputePackedImageGrid(count, drawW, drawH);
                    const { cols, cellW, cellH, gap, pad } = grid;

                    this.tj_imgs.forEach((img, i) => {
                        const col = i % cols;
                        const row = Math.floor(i / cols);
                        const rect = tjGetCenteredGridRect(grid, i, drawW);
                        const x = rect.x;
                        const y = startY + rect.yOffset;
                        if (!img || !img.complete || img._tj_error || img.naturalWidth === 0) {
                            ctx.fillStyle = img?._tj_error ? "#441111" : "#111111";
                            ctx.fillRect(x, y, Math.max(1, cellW), Math.max(1, cellH));
                            ctx.fillStyle = "#888";
                            ctx.font = "10px sans-serif";
                            ctx.fillText(img?._tj_error ? "ERR" : "LOAD", x + 6, y + 16);
                            return;
                        }

                        tjDrawImageContain(ctx, img, x, y, cellW, cellH);
                        
                        ctx.fillStyle = "rgba(0,0,0,0.6)";
                        ctx.fillRect(x + 2, y + 2, 20, 16);
                        ctx.fillStyle = "#fff";
                        ctx.font = "10px sans-serif";
                        ctx.fillText(i + 1, x + 6, y + 13);
                    });

                    // Save & Preview only: manual display reload. No sampler rerun, no save rerun.
                    this._tj_refresh_btn = { x: Math.max(6, drawW - 34), y: startY + 6, w: 28, h: 28 };
                    tjDrawRoundIconButton(ctx, this._tj_refresh_btn, "↺", {
                        bg: "rgba(0,0,0,0.55)",
                        color: "#ffffff",
                        font: "17px sans-serif",
                        dy: -1
                    });
                }
            };

            nodeType.prototype.onMouseDown = function(e, pos) {
                if (this.flags?.collapsed) return false;
                if (!this.tj_imgs || this.tj_imgs.length === 0) return false;
                
                let startY = LiteGraph.NODE_TITLE_HEIGHT; 
                if (this.widgets) startY = this.widgets.reduce((sum, w) => sum + (w.computeSize ? w.computeSize()[1] : 20) + 4, startY);
                startY += 10;

                const x = pos[0];
                const y = pos[1];

                if (y < startY) return false;
                // Keep LiteGraph resize handle reachable.
                if (x > this.size[0] - 18 || y > this.size[1] - 18) return false;

                if (this.tj_mode === "single" || this.tj_mode === "single_locked") {
                    // Close wins over every overlay button. This prevents the X button
                    // from being interpreted as refresh when button rectangles overlap
                    // after user resize or canvas scale changes.
                    const cb = this._tj_close_btn;
                    if (this.tj_mode === "single" && cb && x >= cb.x && x <= cb.x + cb.w && y >= cb.y && y <= cb.y + cb.h) {
                        this._tj_closeViewer?.();
                        return true;
                    }
                    const rb = this._tj_refresh_btn;
                    if (rb && x >= rb.x && x <= rb.x + rb.w && y >= rb.y && y <= rb.y + rb.h) {
                        tjReloadSavePreviewImages(this);
                        return true;
                    }
                    const fb = this._tj_fullscreen_btn;
                    if (fb && x >= fb.x && x <= fb.x + fb.w && y >= fb.y && y <= fb.y + fb.h && !this._tj_fullscreen_open) {
                        this._tj_openFullscreenFromSingle?.();
                        return true;
                    }
                    if (this.tj_mode === "single" && this.tj_imgs.length > 1 && x < 40 && y > startY && y < this.size[1] - 30) {
                        this._tj_prevImage?.();
                        return true;
                    }
                    if (this.tj_mode === "single" && this.tj_imgs.length > 1 && x > this.size[0] - 40 && y > startY && y < this.size[1] - 30) {
                        this._tj_nextImage?.();
                        return true;
                    }
                } else if (this.tj_mode === "grid") {
                    if (this._tj_refresh_btn &&
                        x >= this._tj_refresh_btn.x && x <= this._tj_refresh_btn.x + this._tj_refresh_btn.w &&
                        y >= this._tj_refresh_btn.y && y <= this._tj_refresh_btn.y + this._tj_refresh_btn.h) {
                        tjReloadSavePreviewImages(this);
                        return true;
                    }

                    const w = this.size[0];
                    const h = this.size[1] - startY;
                    const count = this.tj_imgs.length;
                    const grid = tjComputePackedImageGrid(count, w, h);
                    const { cols, cellW, cellH, gap, pad } = grid;

                    const idx = tjFindCenteredGridIndex(grid, x, y, startY, w);

                    if (idx >= 0 && idx < count) {
                        // In-node single viewer: use the current node size as-is.
                        // Do not resize on open/close; user resize remains the only size control.
                        this.tj_mode = "single";
                        this.tj_view_idx = idx;
                        this.setDirtyCanvas(true, true);
                        return true;
                    }
                }
                return false;
            };
        }
    }
});


// ─── 2. Prompt Text (TJ) ───
app.registerExtension({
    name: "TJ.PromptText",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "TJ_PromptText") {
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
                applyTJTheme(this);
                attachSetNodeSync(this);
                attachTJGetReceiver(this, { inputIndex: 0, inputName: "prompt_in", outputIndex: 0, defaultType: "*", defaultOutputType: "STRING" });

                const btnRow = document.createElement("div");
                btnRow.style.cssText = "display:flex; align-items:center; gap:4px; padding:2px; height:12px; box-sizing:border-box;";
                
                const btnStyle = "flex:1; height:20px; min-height:20px; max-height:20px; padding:0; background:#0055bb; color:#00efff; border:none; border-radius:3px; cursor:pointer; font-size:10px; font-weight:bold; line-height:20px; box-sizing:border-box;";

                const copyBtn = document.createElement("button"); copyBtn.textContent = "Copy All"; copyBtn.style.cssText = btnStyle;
                const pasteBtn = document.createElement("button"); pasteBtn.textContent = "Paste"; pasteBtn.style.cssText = btnStyle;
                const clearBtn = document.createElement("button"); clearBtn.textContent = "Clear"; clearBtn.style.cssText = btnStyle;

                btnRow.appendChild(copyBtn);
                btnRow.appendChild(pasteBtn);
                btnRow.appendChild(clearBtn);

                const ownerNode = this;
                const domWidget = this.addDOMWidget("tj_prompt_tools", "btn", btnRow, { serialize: false, hideOnZoom: false });
                domWidget.computeSize = function(width) {
                    const w = Math.max(120, Number(width || ownerNode.size?.[0] || 360) - 20);
                    btnRow.style.width = `${w}px`;
                    btnRow.style.maxWidth = `${w}px`;
                    btnRow.style.boxSizing = "border-box";
                    return [w, 24];
                };

                requestAnimationFrame(() => {
                    const textWidget = this.widgets?.find(w => w.name === "text");
                    if (textWidget) {
                        // 🚀 피드백 텍스트/컬러 일시 변경 함수
                        const showFeedback = (btn, origText, newText) => {
                            const origColor = btn.style.color;
                            btn.textContent = newText;
                            btn.style.color = "#ff4444"; 
                            setTimeout(() => {
                                btn.textContent = origText;
                                btn.style.color = origColor;
                            }, 800);
                        };

                        copyBtn.onclick = () => { 
                            navigator.clipboard.writeText(textWidget.value); 
                            showFeedback(copyBtn, "Copy All", "Copied");
                        };
                        pasteBtn.onclick = async () => { 
                            const txt = await navigator.clipboard.readText(); 
                            textWidget.value = txt; 
                            app.canvas.setDirty(true, false);
                            showFeedback(pasteBtn, "Paste", "Pasted");
                        };
                        clearBtn.onclick = () => { 
                            textWidget.value = ""; 
                            app.canvas.setDirty(true, false);
                            showFeedback(clearBtn, "Clear", "Cleaned");
                        };
                    }
                });
            };

            const origOnConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function(data) {
                if (origOnConfigure) origOnConfigure.apply(this, arguments);
                setTimeout(() => { attachSetNodeSync(this); attachTJGetReceiver(this, { inputIndex: 0, inputName: "prompt_in", outputIndex: 0, defaultType: "*", defaultOutputType: "STRING" }); }, 100);
            };

            const origOnDrawForegroundPrompt = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function(ctx) {
                this._tjUpdateGetReceiverOptions?.();
                if (origOnDrawForegroundPrompt) return origOnDrawForegroundPrompt.apply(this, arguments);
            };
        }
    }
});


// ─── 3. Text Concatenate (TJ) ───
const inSlotsText = (n) => (n.inputs || []).filter(s => !["mode", "num_ports", "delimiter", "setnode_name"].includes(s.name));

function renumberTextInputs(node) {
    inSlotsText(node).forEach((s, i) => { s.name = `input_${i + 1}`; });
}

function updateTextWidgetVis(node) {
    const modeW = node.widgets?.find(w => w.name === "mode");
    const numW = node.widgets?.find(w => w.name === "num_ports");
    if (!modeW || !numW) return;

    if (modeW.value === "Dynamic (Auto)") {
        numW._hidden = true;
        numW.computeSize = function () { return [0, -4]; };
    } else {
        numW._hidden = false;
        if (numW._origComputeSize !== undefined) numW.computeSize = numW._origComputeSize; 
        else delete numW.computeSize;
    }
    node.setSize(node.computeSize());
    node.setDirtyCanvas(true, false);
}

function applyTextManual(node, count) {
    count = Math.max(1, Math.min(count, 64));
    const ins = inSlotsText(node);
    
    if (count > ins.length) {
        for (let i = ins.length; i < count; i++) node.addInput(`input_${i + 1}`, "*");
    } else if (count < ins.length) {
        for (let i = ins.length - 1; i >= count; i--) {
            const sl = ins[i];
            const ri = node.inputs.indexOf(sl);
            if (sl.link != null) node.graph?.removeLink(sl.link);
            node.removeInput(ri);
        }
    }
    renumberTextInputs(node);
    node.setDirtyCanvas(true, true);
}

function maybeGrowText(node) {
    const modeW = node.widgets?.find(w => w.name === "mode");
    if (modeW?.value !== "Dynamic (Auto)") return;
    const ins = inSlotsText(node);
    if (ins.length === 0) { node.addInput("input_1", "*"); return; }
    if (ins[ins.length - 1].link != null && ins.length < 64) {
        node.addInput(`input_${ins.length + 1}`, "*");
        node.setDirtyCanvas(true, true);
    }
}

app.registerExtension({
    name: "TJ.TextConcatenate",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "TJ_TextConcatenate") {
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
                applyTJTheme(this);
                attachSetNodeSync(this);

                const modeW = this.widgets?.find(w => w.name === "mode");
                const numW = this.widgets?.find(w => w.name === "num_ports");
                
                if (modeW && numW) {
                    numW._origComputeSize = numW.computeSize;
                    const origModeCb = modeW.callback;
                    modeW.callback = (v) => {
                        if (origModeCb) origModeCb.call(modeW, v);
                        if (v === "Manual") {
                            numW.value = Math.max(1, inSlotsText(this).length);
                            applyTextManual(this, numW.value);
                        } else {
                            maybeGrowText(this);
                        }
                        updateTextWidgetVis(this);
                    };

                    const origNumCb = numW.callback;
                    numW.callback = (v) => {
                        if (origNumCb) origNumCb.call(numW, v);
                        if (modeW.value === "Manual") {
                            applyTextManual(this, Math.floor(v));
                        }
                    };
                }

                const oc = this.onConnectionsChange;
                this.onConnectionsChange = function(type) {
                    if (oc) oc.apply(this, arguments);
                    if (type === 1) maybeGrowText(this); 
                };

                requestAnimationFrame(() => {
                    if (!this.inputs || inSlotsText(this).length === 0) this.addInput("input_1", "*");
                    updateTextWidgetVis(this);
                });
            };

            const origOnConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function(data) {
                if (origOnConfigure) origOnConfigure.apply(this, arguments);
                setTimeout(() => {
                    attachSetNodeSync(this);
                    updateTextWidgetVis(this);
                }, 100);
            };
        }
    }
});


// ─── 4. Smart show (TJ) ───
app.registerExtension({
    name: "TJ.SmartShow",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "TJ_SmartShow") {
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
                applyTJTheme(this);
                attachSetNodeSync(this);

                const node = this;

                const getW = this.widgets?.find(w => w.name === "get_name");
                if (getW) {
                    getW.options = { values: ["(none)"] };
                    const origGetCb = getW.callback;
                    getW.callback = (v) => {
                        if (origGetCb) origGetCb.call(getW, v);
                        if (tjSmartIsSeparator(v)) { getW.value = getW._tj_previous_value || "(none)"; return; }
                        getW._tj_previous_value = v;
                        this._connectSmartGet(v);
                    };
                }

                this._connectSmartGet = function(setName) {
                    if (!this.graph || !this.inputs?.[0]) return;
                    if (tjSmartIsSeparator(setName)) setName = "(none)";
                    const values = tjSmartGetAllSetNames(this.graph);
                    if (setName && setName !== "(none)" && !values.includes(setName) && !(window.TJ_NODE_findProviderByValue && window.TJ_NODE_findProviderByValue(this.graph, setName))) {
                        // Provider scan can be temporarily late during reload/delete/refresh.
                        // Keep the saved get_name and let wireless repair reconnect later.
                        this.inputs[0].name = "input";
                        tjSmartMarkGetLabel(this, setName);
                        window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 80);
                        window.TJ_NODE_scheduleWirelessRepair?.(this.graph, 300);
                        app.canvas?.setDirty(true, true);
                        return;
                    }

                    const wantsWireless = !!(setName && setName !== "(none)" && !tjSmartIsSeparator(setName));
                    const currentLinkId = this.inputs[0].link;
                    const currentIsWireless = tjIsWirelessLink(this.graph, currentLinkId);

                    // TJ_NODE38: Smart Show direct-wire reload guard restored.
                    // When get_name is (none), preserve normal ComfyUI direct wires.
                    // Only TJ wireless links may be removed automatically, or when the user
                    // intentionally selects a wireless provider from get_name.
                    if (currentLinkId != null && (wantsWireless || currentIsWireless)) {
                        this._tj_connecting_wireless = true;
                        tjSafeRemoveLink(this.graph, currentLinkId);
                        this._tj_connecting_wireless = false;
                    }

                    if (!setName || setName === "(none)") {
                        this.inputs[0].name = "input";
                        tjSmartMarkGetLabel(this, "");
                        if (currentLinkId == null || currentIsWireless) {
                            this.inputs[0].type = "*";
                            if (this.outputs?.[0]) this.outputs[0].type = "*";
                        }
                        app.canvas?.setDirty(true, true);
                        return;
                    }
                    const sourceInfo = tjSmartFindSetterSourceInfo(this.graph, setName);
                    const normalizedValue = sourceInfo?.displayName || setName;
                    const valueW = this.widgets?.find(x => x.name === "get_name");
                    if (valueW && valueW.value !== normalizedValue) valueW.value = normalizedValue;
                    tjSmartMarkGetLabel(this, normalizedValue);
                    if (sourceInfo && tjCanConnect(sourceInfo, this, 0)) {
                        this._tj_connecting_wireless = true;
                        sourceInfo.node.connect(sourceInfo.slot, this, 0);
                        if (window.TJ_NODE_markWirelessLink) window.TJ_NODE_markWirelessLink(this.graph, this, 0, normalizedValue);
                        this._tj_connecting_wireless = false;
                        const t = tjGetOutputSlot(sourceInfo.node, sourceInfo.slot)?.type || "*";
                        this.inputs[0].type = t;
                        this.inputs[0].name = "input";
                        if (this.outputs?.[0]) this.outputs[0].type = t;
                    } else {
                        // Provider exists in the widget value but is not connectable right now.
                        // Keep the selection label; just do not create a real link.
                        this.inputs[0].name = "input";
                        tjSmartMarkGetLabel(this, normalizedValue);
                    }
                    app.canvas?.setDirty(true, true);
                };

                requestAnimationFrame(() => {
                    const editW = this.widgets?.find(w => w.name === "edit_mode");
                    if (editW) editW.value = false;
                    hideTJWidget(this.widgets?.find(w => w.name === "file"));
                    hideTJWidget(editW);
                    hideTJWidget(this.widgets?.find(w => w.name === "text_content"));
                });

                this.tj_display_type = "none"; 
                this.tj_original_text = "";
                this.tj_imgs = [];
                this.tj_view_idx = 0;
                this.tj_mode = "grid"; 
                this.tj_is_playing = false; 
                this.tj_is_loop = true;
                this.tj_unknown_msg = "";

                this._tjRestoreLastPreview = () => {
                    const stored = tjGetStoredPreviewState(this);
                    if (!stored || !stored.kind) return false;
                    if (stored.kind === "smart_image" && Array.isArray(stored.metas)) {
                        const metas = stored.metas.map(tjSafePreviewMeta).filter(Boolean);
                        if (metas.length === 0) return false;
                        this.tj_display_type = "image";
                        this.tj_imgs = metas.map((meta, idx) => tjMakePreviewImage(meta, this, idx, () => autoFitTJImagePreviewNode(this, 150)));
                        this.tj_updateUI?.();
                        this.setDirtyCanvas?.(true, true);
                        app.canvas?.setDirty(true, true);
                        return true;
                    }
                    if (stored.kind === "smart_local_file" && stored.filename && this.tj_handleNewFile) {
                        this.tj_handleNewFile(stored.filename, stored.type || "input", true);
                        return true;
                    }
                    if (stored.kind === "smart_text") {
                        this.tj_display_type = "text";
                        this.tj_original_text = stored.text || "";
                        const editW = this.widgets?.find(w => w.name === "edit_mode");
                        if (editW) editW.value = false;
                        const textContentW = this.widgets?.find(w => w.name === "text_content");
                        if (textContentW) textContentW.value = this.tj_original_text;
                        this.tj_updateUI?.();
                        setTimeout(() => this.tj_updateUI?.(), 0);
                        this.setDirtyCanvas?.(true, true);
                        return true;
                    }
                    if ((stored.kind === "smart_video_file" || stored.kind === "smart_audio_file") && stored.file && this.tj_restoreMediaFile) {
                        this.tj_restoreMediaFile(stored.kind, stored.file);
                        return true;
                    }
                    return false;
                };

                if (!this.properties) this.properties = {};
                if (!this.properties.saved_grid_size) this.properties.saved_grid_size = [340, 300];

                const origOnResize = this.onResize;
                this.onResize = function(size) {
                    if (["video_file", "audio_file", "video"].includes(this.tj_display_type)) {
                        if (size[0] < 400) size[0] = 400; 
                    }
                    if (this.tj_display_type === "audio_file") {
                        size[1] = 120;
                    }

                    if (!this.properties) this.properties = {};
                    this.properties.saved_grid_size = [size[0], size[1]];
                    try { syncSmartShowDomWidths(); } catch (_) {}
                    
                    if (origOnResize) origOnResize.apply(this, arguments);
                };

                const origOnConnectionsChange = this.onConnectionsChange;
                this.onConnectionsChange = function(type, index, connected, link_info) {
                    if (origOnConnectionsChange) origOnConnectionsChange.apply(this, arguments);
                    if (type === LiteGraph.INPUT && index === 0) {
                        if (connected && link_info) {
                            const srcNode = this.graph.getNodeById(link_info.origin_id);
                            if (srcNode) {
                                const srcType = srcNode.outputs?.[link_info.origin_slot]?.type || "*";
                                this.inputs[0].type = srcType;
                                this.outputs[0].type = srcType;
                                const setW = this.widgets?.find(x => x.name === "setnode_name");
                                if (setW && setW.value && setW.value.trim() !== "") {
                                    app.graph._nodes.forEach(n => {
                                        if (n.type === "TJ_GetNode" && n._syncWithSetNode) n._syncWithSetNode();
                                        if (n.type === "TJ_MultiGetNode") {
                                            if (n._syncWithSetNodes) n._syncWithSetNodes();
                                            else if (n._rebuild) n._rebuild();
                                        }
                                    });
                                }
                            }
                        } else {
                            this.inputs[0].type = "*";
                            this.outputs[0].type = "*";
                        }
                        app.canvas.setDirty(true, true);
                    }
                };

                const container = document.createElement("div");
                container.style.cssText = "display:flex; flex-direction:column; height:100%; width:100%; box-sizing:border-box; padding:4px; pointer-events:none;";
                
                const uploadBtn = document.createElement("button");
                uploadBtn.textContent = "choose file to upload";
                uploadBtn.style.cssText = "width:100%; min-height:20px; background:#0055bb; color:#00efff; border:1px solid #0044aa; border-radius:4px; cursor:pointer; font-size:11px; margin-bottom:4px; box-sizing:border-box; pointer-events:auto;";
                uploadBtn.onclick = () => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*,video/*,audio/*,text/plain";
                    input.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const fd = new FormData();
                        fd.append("file", file, file.name);
                        uploadBtn.textContent = "Uploading...";
                        try {
                            const resp = await fetch("/tj_node/upload_local", { method: "POST", body: fd });
                            const data = await resp.json();
                            if (data.success) {
                                const fileW = this.widgets?.find(w => w.name === "file");
                                if (fileW) fileW.value = data.filename;
                                this.tj_handleNewFile(data.filename, "input");
                            }
                        } catch (err) {
                            console.error(err);
                        }
                        uploadBtn.textContent = "choose file to upload";
                    };
                    input.click();
                };

                // 🚀 신규: Batch Image Viewer 버튼 (이미지 모드일 때만 보임)
                const viewerBtn = document.createElement("button");
                viewerBtn.textContent = "Batch Image Viewer";
                viewerBtn.style.cssText = "width:100%; min-height:20px; background:#0055bb; color:#00efff; border:1px solid #0044aa; border-radius:4px; cursor:pointer; font-size:11px; margin-bottom:4px; box-sizing:border-box; pointer-events:auto; display:none;";
                viewerBtn.onclick = () => openFullscreenViewer(node.tj_imgs, 0);

                const textArea = document.createElement("textarea");
                textArea.style.cssText = "flex:1 1 0%; height:100%; display:none; resize:none; background:#111; color:#eee; border:1px solid #555; border-radius:4px; padding:6px; font-family:monospace; font-size:12px; box-sizing:border-box; margin-bottom:4px; overflow-y:auto; pointer-events:auto;";
                textArea.readOnly = true;

                const mediaEl = document.createElement("video");
                mediaEl.style.cssText = "flex:1 1 0%; min-height:0; width:100%; display:none; background:#000; object-fit:contain; border-radius:4px; margin-bottom:4px; pointer-events:auto;";
                mediaEl.controls = false;
                mediaEl.loop = true;
                
                const controlBar = document.createElement("div");
                controlBar.style.cssText = "flex:0 0 24px; height:24px; min-height:24px; max-height:24px; display:none; align-items:center; gap:4px; background:rgba(0,0,0,0.5); padding:2px; border-radius:4px; pointer-events:auto;";

                container.appendChild(uploadBtn);
                container.appendChild(viewerBtn); // 뷰어 버튼 추가
                container.appendChild(textArea);
                container.appendChild(mediaEl);
                container.appendChild(controlBar);

                const ownerNode = this;
                const domWidget = this.addDOMWidget("tj_smart_display", "div", container, { serialize: false, hideOnZoom: false });
                const syncSmartShowDomWidths = () => {
                    const w = Math.max(180, Number(ownerNode.size?.[0] || 360) - 20);
                    for (const el of [container, uploadBtn, viewerBtn]) {
                        if (!el?.style) continue;
                        el.style.width = `${w}px`;
                        el.style.maxWidth = `${w}px`;
                        el.style.boxSizing = "border-box";
                    }
                    if (controlBar?.style) {
                        controlBar.style.width = `${w}px`;
                        controlBar.style.maxWidth = `${w}px`;
                        controlBar.style.boxSizing = "border-box";
                    }
                };
                domWidget.computeSize = function(width) {
                    const w = Math.max(180, Number(width || ownerNode.size?.[0] || 360) - 20);
                    syncSmartShowDomWidths();
                    const widgetH = Math.max(80, Number(ownerNode.size?.[1] || 300) - 120);
                    return [w, widgetH];
                };
                
                document.addEventListener('tj_sync_movies', () => {
                    if (this.tj_display_type === "video_file" || this.tj_display_type === "audio_file") {
                        mediaEl.currentTime = 0;
                        mediaEl.play().catch(e=>console.log(e));
                        this.tj_is_playing = true;
                        if (this.tj_updateUI) this.tj_updateUI();
                    }
                });

                this.tj_restoreMediaFile = (kind, fileObj) => {
                    if (!fileObj || !fileObj.filename) return;
                    this.tj_display_type = kind === "smart_audio_file" ? "audio_file" : "video_file";
                    this.tj_imgs = [];
                    mediaEl.src = api.apiURL(`/view?filename=${encodeURIComponent(fileObj.filename)}&type=${fileObj.type || "output"}&subfolder=${encodeURIComponent(fileObj.subfolder || "")}&t=${Date.now()}`);
                    this.tj_is_playing = false;
                    this.tj_updateUI?.();
                    mediaEl.pause();
                    this.setDirtyCanvas?.(true, true);
                };

                this.tj_handleNewFile = (filename, type="input", restoring=false) => {
                    const ext = filename.split('.').pop().toLowerCase();
                    const url = api.apiURL(`/view?filename=${encodeURIComponent(filename)}&type=${type}&t=${Date.now()}`);
                    if (!restoring) tjStorePreviewState(this, { kind: "smart_local_file", filename, type });
                    
                    if (['mp4', 'mov', 'webm', 'avi'].includes(ext)) {
                        this.tj_display_type = "video_file";
                        this.tj_imgs = [];
                        mediaEl.src = url;
                        this.tj_is_playing = false; 
                        this.tj_updateUI();
                        mediaEl.pause();
                    } else if (['mp3', 'm4a', 'wav', 'flac'].includes(ext)) {
                        this.tj_display_type = "audio_file";
                        this.tj_imgs = [];
                        mediaEl.src = url;
                        this.tj_is_playing = false; 
                        this.tj_updateUI();
                        mediaEl.pause();
                    } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
                        this.tj_display_type = "image";
                        const meta = { filename, type, subfolder: "" };
                        const imgEl = tjMakePreviewImage(meta, this, 0, () => autoFitTJImagePreviewNode(this, 150));
                        this.tj_imgs = [imgEl];
                        this.tj_updateUI();
                    } else if (['txt'].includes(ext)) {
                        fetch(url)
                            .then(r => r.text())
                            .then(txt => {
                                this.tj_display_type = "text";
                                this.tj_original_text = txt;
                                if (!restoring) tjStorePreviewState(this, { kind: "smart_text", text: txt });
                                this.tj_updateUI();
                                this.setDirtyCanvas(true, true);
                            });
                        return;
                    }
                    this.setDirtyCanvas(true, true);
                };

                this.tj_updateUI = () => {
                    controlBar.innerHTML = "";
                    const btnStyle = "height:100%; background:#222; color:#fff; border:1px solid #444; border-radius:3px; cursor:pointer; font-size:11px; padding:0 8px;";
                    const btnStyleActive = "height:100%; background:#ff4757; color:#fff; border:1px solid #ff4757; border-radius:3px; cursor:pointer; font-size:11px; padding:0 8px; font-weight:bold;";

                    const editModeW = this.widgets?.find(w => w.name === "edit_mode");
                    const textContentW = this.widgets?.find(w => w.name === "text_content");

                    if (this.tj_display_type === "text") {
                        textArea.style.display = "block";
                        mediaEl.style.display = "none";
                        controlBar.style.display = "flex";
                        viewerBtn.style.display = "none";

                        // Keep restored text visible after refresh/tab return.
                        // edit_mode defaults to OFF, so display the last original text unless user toggles edit on.
                        if (editModeW && !editModeW.value) {
                            textArea.readOnly = true;
                            textArea.value = this.tj_original_text || textContentW?.value || "";
                            if (textContentW) textContentW.value = textArea.value;
                        } else if (editModeW && editModeW.value) {
                            textArea.readOnly = false;
                            textArea.value = textContentW?.value || this.tj_original_text || "";
                        }
                        
                        const editBtn = document.createElement("button");
                        const isEdit = editModeW && editModeW.value;
                        editBtn.textContent = isEdit ? "Edit Mode: ON" : "Edit Mode: OFF";
                        editBtn.style.cssText = isEdit ? btnStyleActive : btnStyle;
                        
                        editBtn.onclick = () => {
                            if (!editModeW.value) { 
                                editModeW.value = true;
                                textArea.readOnly = false;
                                editBtn.textContent = "Edit Mode: ON";
                                editBtn.style.cssText = btnStyleActive;
                            } else { 
                                showCenterConfirm("수정 모드를 끄면 원본 텍스트로 자동 복원됩니다.<br>진행하시겠습니까?", () => {
                                    editModeW.value = false;
                                    textArea.value = this.tj_original_text;
                                    if (textContentW) textContentW.value = this.tj_original_text;
                                    textArea.readOnly = true;
                                    editBtn.textContent = "Edit Mode: OFF";
                                    editBtn.style.cssText = btnStyle;
                                    app.canvas.setDirty(true, false);
                                });
                            }
                        };

                        const copyBtn = document.createElement("button");
                        copyBtn.textContent = "Copy All";
                        copyBtn.style.cssText = btnStyle + " transition: color 0.1s;";
                        
                        // 🚀 수정: Copy All 버튼에 0.8초 Copied 시각적 피드백 기능 적용!
                        copyBtn.onclick = () => { 
                            navigator.clipboard.writeText(textArea.value); 
                            const origColor = copyBtn.style.color;
                            copyBtn.textContent = "Copied";
                            copyBtn.style.color = "#ff4444";
                            setTimeout(() => {
                                copyBtn.textContent = "Copy All";
                                copyBtn.style.color = origColor;
                            }, 800);
                        };

                        controlBar.appendChild(editBtn);
                        controlBar.appendChild(copyBtn);

                    } else if (this.tj_display_type === "image") {
                        textArea.style.display = "none";
                        mediaEl.style.display = "none";
                        controlBar.style.display = "none";
                        viewerBtn.style.display = "block"; // 이미지일 때 뷰어 버튼 활성화

                    } else if (this.tj_display_type === "video_file" || this.tj_display_type === "audio_file") {
                        textArea.style.display = "none";
                        controlBar.style.display = "flex";
                        viewerBtn.style.display = "none";
                        
                        if (this.tj_display_type === "audio_file") {
                            mediaEl.style.display = "none";
                            this.setSize([Math.max(400, this.size[0]), 120]);
                        } else {
                            mediaEl.style.display = "block";
                            mediaEl.style.background = "#000";
                            if (this.size[0] < 400) this.setSize([400, this.size[1]]);
                        }

                        const playBtn = document.createElement("button");
                        playBtn.innerHTML = this.tj_is_playing ? "⏸" : "▶";
                        playBtn.style.cssText = btnStyle + " padding:0 6px;";
                        playBtn.onclick = () => { 
                            this.tj_is_playing = !this.tj_is_playing; 
                            playBtn.innerHTML = this.tj_is_playing ? "⏸" : "▶";
                            if (this.tj_is_playing) mediaEl.play().catch(e=>console.log(e)); else mediaEl.pause();
                        };

                        const muteBtn = document.createElement("button");
                        muteBtn.innerHTML = mediaEl.muted || mediaEl.volume === 0 ? "🔇" : "🔊";
                        muteBtn.style.cssText = btnStyle + " padding:0 4px;";
                        
                        const volSlider = document.createElement("input");
                        volSlider.type = "range";
                        volSlider.min = 0; volSlider.max = 1; volSlider.step = 0.05;
                        volSlider.value = mediaEl.muted ? 0 : mediaEl.volume;
                        volSlider.style.cssText = "width: 45px; margin:0 4px; cursor:pointer; accent-color:#ff4757;";
                        
                        muteBtn.onclick = () => {
                            mediaEl.muted = !mediaEl.muted;
                            if (!mediaEl.muted && mediaEl.volume === 0) mediaEl.volume = 0.5;
                            muteBtn.innerHTML = mediaEl.muted || mediaEl.volume === 0 ? "🔇" : "🔊";
                            volSlider.value = mediaEl.muted ? 0 : mediaEl.volume;
                        };
                        volSlider.oninput = (e) => {
                            const val = parseFloat(e.target.value);
                            mediaEl.volume = val;
                            mediaEl.muted = (val === 0);
                            muteBtn.innerHTML = mediaEl.muted ? "🔇" : "🔊";
                        };

                        const loopBtn = document.createElement("button");
                        loopBtn.textContent = "Loop";
                        loopBtn.style.cssText = this.tj_is_loop ? (btnStyle + " color:#00efff; border-color:#0088cc;") : btnStyle;
                        loopBtn.onclick = () => {
                            this.tj_is_loop = !this.tj_is_loop;
                            loopBtn.style.cssText = this.tj_is_loop ? (btnStyle + " color:#00efff; border-color:#0088cc;") : btnStyle;
                            mediaEl.loop = this.tj_is_loop;
                        };

                        const syncBtn = document.createElement("button");
                        syncBtn.textContent = "Sync";
                        syncBtn.style.cssText = btnStyle;
                        syncBtn.onclick = () => { document.dispatchEvent(new Event('tj_sync_movies')); };

                        const slider = document.createElement("input");
                        slider.type = "range";
                        slider.style.cssText = "flex:1; margin:0 4px; cursor:pointer;";
                        
                        slider.min = 0; slider.max = 100; slider.value = 0;
                        slider.oninput = (e) => {
                            this.tj_is_playing = false;
                            playBtn.innerHTML = "▶";
                            mediaEl.pause();
                            const pct = e.target.value / 100;
                            mediaEl.currentTime = (mediaEl.duration || 0) * pct;
                        };
                        mediaEl.ontimeupdate = () => {
                            if (mediaEl.duration) slider.value = (mediaEl.currentTime / mediaEl.duration) * 100;
                        };
                        mediaEl.onended = () => {
                            if (!this.tj_is_loop) {
                                this.tj_is_playing = false;
                                playBtn.innerHTML = "▶";
                            }
                        };

                        controlBar.appendChild(playBtn);
                        controlBar.appendChild(muteBtn);
                        controlBar.appendChild(volSlider);
                        controlBar.appendChild(slider);
                        controlBar.appendChild(loopBtn);
                        controlBar.appendChild(syncBtn);
                        
                    } else {
                        textArea.style.display = "none";
                        mediaEl.style.display = "none";
                        controlBar.style.display = "none";
                        viewerBtn.style.display = "none";
                    }
                };

                this.setSize(this.properties.saved_grid_size);
            };

            const origOnConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function(data) {
                if (origOnConfigure) origOnConfigure.apply(this, arguments);
                const detachSnapshot = () => tjDetachCopiedPreviewSnapshot(this, { inputIndex: 0, inputName: "input" });
                detachSnapshot();
                requestAnimationFrame(() => {
                    detachSnapshot();
                    hideTJWidget(this.widgets?.find(w => w.name === "file"));
                    hideTJWidget(this.widgets?.find(w => w.name === "edit_mode"));
                    hideTJWidget(this.widgets?.find(w => w.name === "text_content"));
                    const getW = this.widgets?.find(w => w.name === "get_name");
                    if (getW && getW.options) getW.options.values = tjSmartGetAllSetNames(this.graph);
                    if (getW && this._connectSmartGet) this._connectSmartGet(getW.value);
                    
                    const txtW = this.widgets?.find(w => w.name === "text_content");
                    if (!this.properties?.tj_snapshot_detached && txtW && txtW.value && txtW.value.trim() !== "") {
                        this.tj_display_type = "text";
                        this.tj_original_text = txtW.value;
                        this.tj_updateUI();
                    } else if ((!this.tj_imgs || this.tj_imgs.length === 0) && this.tj_display_type === "none" && this._tjRestoreLastPreview) {
                        this._tjRestoreLastPreview();
                    }
                });
                setTimeout(() => { detachSnapshot(); attachSetNodeSync(this); }, 100);
            };

            nodeType.prototype.onExecuted = function(message) {
                if (this.properties?.tj_snapshot_detached) {
                    tjRestoreDetachedSnapshotIfNeeded(this);
                    return;
                }
                if (message && message.tj_type) {
                    this.tj_display_type = message.tj_type[0];
                    const data = message.tj_data;
                    
                    const domWidget = this.widgets.find(w => w.type === "div");
                    const container = domWidget ? domWidget.element : null;
                    const ta = container ? container.querySelector("textarea") : null;
                    const mediaEl = container ? container.querySelector("video") : null;

                    if (this.tj_display_type === "unknown") {
                        this.tj_unknown_msg = data[0] || "Unknown type";
                    } else if (this.tj_display_type === "text") {
                        this.tj_original_text = data[0] || "";
                        tjStorePreviewState(this, { kind: "smart_text", text: this.tj_original_text });
                        const textContentW = this.widgets?.find(w => w.name === "text_content");
                        const editModeW = this.widgets?.find(w => w.name === "edit_mode");
                        
                        if (ta) {
                            if (editModeW && editModeW.value) {
                                ta.value = textContentW ? textContentW.value : this.tj_original_text;
                            } else {
                                ta.value = this.tj_original_text;
                                if (textContentW) textContentW.value = this.tj_original_text;
                            }
                        }
                    } else if (this.tj_display_type === "video_file" || this.tj_display_type === "audio_file") {
                        if (mediaEl && data.length > 0) {
                            const fileObj = data[0];
                            mediaEl.src = api.apiURL(`/view?filename=${encodeURIComponent(fileObj.filename)}&type=${fileObj.type}&subfolder=${encodeURIComponent(fileObj.subfolder)}&t=${Date.now()}`);
                            mediaEl.loop = this.tj_is_loop;
                            tjStorePreviewState(this, {
                                kind: this.tj_display_type === "audio_file" ? "smart_audio_file" : "smart_video_file",
                                file: tjSafePreviewMeta(fileObj)
                            });
                            this.tj_is_playing = false; 
                            mediaEl.pause();
                        }
                    } else if (this.tj_display_type === "image") {
                        const safeMetas = (Array.isArray(data) ? data : []).map(tjSafePreviewMeta).filter(Boolean);
                        this.tj_imgs = safeMetas.map((img, idx) => tjMakePreviewImage(img, this, idx, () => autoFitTJImagePreviewNode(this, 150)));
                        tjStorePreviewState(this, { kind: "smart_image", metas: safeMetas });
                    }

                    this.tj_updateUI();
                    this.setDirtyCanvas(true, true);
                }
            };

            // 🚀 단순화: 인노드 줌 로직 완전 폐기 (이미지 및 오류 출력만 남김)
            nodeType.prototype.onDrawForeground = function(ctx) {
                if (this.flags?.collapsed) return;
                if (this.properties?.tj_snapshot_detached && (!this.tj_imgs || this.tj_imgs.length === 0)) {
                    tjRestoreDetachedSnapshotIfNeeded(this);
                }
                const getW = this.widgets?.find(w => w.name === "get_name");
                if (getW && getW.options) {
                    getW.options.values = tjSmartGetAllSetNames(this.graph);
                    tjSmartMarkGetLabel(this, getW.value);
                }
                if (this.tj_display_type === "unknown") {
                    let startY = LiteGraph.NODE_TITLE_HEIGHT;
                    if (this.widgets) {
                        for (const w of this.widgets) {
                            if (w.type === "div") break;
                            startY += (w.computeSize ? w.computeSize()[1] : 20) + 4;
                        }
                    }
                    startY += 28;
                    const drawW = this.size[0] - 8;
                    const drawH = this.size[1] - startY - 8;
                    ctx.fillStyle = "#220000";
                    ctx.fillRect(4, startY, drawW, drawH);
                    
                    ctx.fillStyle = "#ff4444";
                    ctx.font = "bold 13px sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText("Unsupported Data Format", 4 + drawW/2, startY + drawH/2 - 10);
                    
                    ctx.fillStyle = "#aaaaaa";
                    ctx.font = "10px monospace";
                    ctx.fillText(this.tj_unknown_msg || "Unknown format", 4 + drawW/2, startY + drawH/2 + 10);
                    ctx.textAlign = "left"; 
                    return;
                }

                if (this.tj_display_type === "image") {
                    if (!this.tj_imgs || this.tj_imgs.length === 0) return;
                    
                    let startY = LiteGraph.NODE_TITLE_HEIGHT; 
                    if (this.widgets) {
                        for (const w of this.widgets) {
                            if (w.type === "div") break;
                            startY += (w.computeSize ? w.computeSize()[1] : 20) + 4;
                        }
                    }
                    startY += 52; // 업로드버튼 + 뷰어버튼 여백

                    const drawW = this.size[0];
                    const drawH = this.size[1] - startY;
                    if (drawH <= 0 || drawW <= 0) return;

                    ctx.fillStyle = "#000000";
                    ctx.fillRect(0, startY, drawW, drawH);

                    if (this.tj_imgs.length === 1) {
                        const img = this.tj_imgs[0];
                        if (!img || !img.complete) return;

                        const imgW = img.naturalWidth || 1;
                        const imgH = img.naturalHeight || 1;
                        const availableH = drawH - 24; 
                        
                        const scale = Math.min(drawW / imgW, availableH / imgH);
                        const fitW = imgW * scale;
                        const fitH = imgH * scale;
                        const offsetX = (drawW - fitW) / 2;
                        const offsetY = startY + (availableH - fitH) / 2;

                        ctx.drawImage(img, offsetX, offsetY, fitW, fitH);

                        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
                        ctx.fillRect(0, this.size[1] - 24, this.size[0], 24);
                        
                        ctx.fillStyle = "#ffffff";
                        ctx.font = "11px sans-serif";
                        const fnameRaw = img.src.split('filename=')[1]?.split('&')[0] || "image";
                        const text = `${decodeURIComponent(fnameRaw)} — ${imgW} x ${imgH}`;
                        
                        const tw = ctx.measureText(text).width;
                        ctx.fillText(text, (this.size[0] - tw)/2, this.size[1] - 8);
                    } else {
                        const count = this.tj_imgs.length;
                        const grid = tjComputePackedImageGrid(count, drawW, drawH);
                        const { cols, cellW, cellH, gap, pad } = grid;

                        this.tj_imgs.forEach((img, i) => {
                            if (!img || !img.complete || img.naturalWidth === 0) return;
                            const col = i % cols;
                            const row = Math.floor(i / cols);
                            const rect = tjGetCenteredGridRect(grid, i, drawW);
                            const x = rect.x;
                            const y = startY + rect.yOffset;

                            tjDrawImageContain(ctx, img, x, y, cellW, cellH);
                            
                            ctx.fillStyle = "rgba(0,0,0,0.6)";
                            ctx.fillRect(x + 2, y + 2, 20, 16);
                            ctx.fillStyle = "#fff";
                            ctx.font = "10px sans-serif";
                            ctx.fillText(i + 1, x + 6, y + 13);
                        });
                    }
                }
            };

            // 🚀 인노드 확대 팝업 완전히 제거됨
        }
    }
});

// ─── 5. Save & Preview Video (TJ) embedded get binding ───
// Viewer UI stays separated in savepreview_video_viewer_tj.js.
// This file only binds get_name to the existing TJ fake-wire core.
app.registerExtension({
    name: "TJ.SaveAndPreviewVideo.EmbeddedGet",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "TJ_SaveAndPreviewVideo") {
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
                applyTJTheme(this);
                attachSetNodeSync(this);
                attachTJGetReceiver(this, { inputIndex: 0, inputName: "image", defaultType: "IMAGE" });
            };

            const origOnConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function(data) {
                if (origOnConfigure) origOnConfigure.apply(this, arguments);
                setTimeout(() => {
                    attachSetNodeSync(this);
                    attachTJGetReceiver(this, { inputIndex: 0, inputName: "image", defaultType: "IMAGE" });
                    this._tjUpdateGetReceiverOptions?.();
                    const gw = this.widgets?.find(w => w.name === "get_name");
                    if (gw && gw.value && gw.value !== "(none)") this._tjConnectGetReceiver?.(gw.value);
                }, 100);
            };

            const origOnDrawForeground = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function(ctx) {
                this._tjUpdateGetReceiverOptions?.();
                if (origOnDrawForeground) origOnDrawForeground.apply(this, arguments);
            };
        }
    }
});

