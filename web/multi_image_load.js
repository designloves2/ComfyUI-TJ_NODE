import { app } from "../../scripts/app.js";

/* ============================================================
   Multi Image Loader (TJ) — Frontend
   ============================================================ */

// ── Widget Hide / Show ──
function hideWidget(widget) {
    if (!widget || widget._hidden) return;
    widget._hidden = true;
    widget._origDraw = widget.draw;
    widget._origComputeSize = widget.computeSize;
    widget._origMouse = widget.mouse;
    widget.draw = function () {};
    widget.computeSize = function () { return [0, -4]; };
    widget.mouse = function () { return false; };
}

function showWidget(widget) {
    if (!widget || !widget._hidden) return;
    widget._hidden = false;
    if (widget._origDraw !== undefined) widget.draw = widget._origDraw; else delete widget.draw;
    if (widget._origComputeSize !== undefined) widget.computeSize = widget._origComputeSize; else delete widget.computeSize;
    if (widget._origMouse !== undefined) widget.mouse = widget._origMouse; else delete widget.mouse;
}

function findWidget(node, name) {
    return node.widgets ? node.widgets.find(w => w.name === name) : null;
}

function getWidgetInputName(input) {
    return input?.widget?.name || input?.name || "";
}

function moveWidgetAfter(node, widgetName, anchorName) {
    if (!node?.widgets) return;

    // 1) Move the visible widget row. This controls the actual displayed order.
    const widgetIdx = node.widgets.findIndex(w => w?.name === widgetName);
    const anchorIdx = node.widgets.findIndex(w => w?.name === anchorName);
    if (widgetIdx >= 0 && anchorIdx >= 0 && widgetIdx !== anchorIdx + 1) {
        const [widget] = node.widgets.splice(widgetIdx, 1);
        const freshAnchorIdx = node.widgets.findIndex(w => w?.name === anchorName);
        node.widgets.splice(freshAnchorIdx + 1, 0, widget);
    }

    // 2) If these widgets were converted to inputs, keep input slot order consistent too.
    //    Otherwise LiteGraph can still hit-test / display the old converted-widget slot order.
    if (node.inputs?.length) {
        const inputIdx = node.inputs.findIndex(i => getWidgetInputName(i) === widgetName);
        const inputAnchorIdx = node.inputs.findIndex(i => getWidgetInputName(i) === anchorName);
        if (inputIdx >= 0 && inputAnchorIdx >= 0 && inputIdx !== inputAnchorIdx + 1) {
            const [input] = node.inputs.splice(inputIdx, 1);
            const freshInputAnchorIdx = node.inputs.findIndex(i => getWidgetInputName(i) === anchorName);
            node.inputs.splice(freshInputAnchorIdx + 1, 0, input);
        }
    }

    node.setDirtyCanvas?.(true, true);
}


const TJ_RESIZE_WIDGET_INPUTS = ["edge_size", "custom_width", "custom_height", "megapixel"];

function getResizeWidgetInputName(input) {
    return input?.widget?.name || input?.name || "";
}

function isResizeWidgetInput(input) {
    return TJ_RESIZE_WIDGET_INPUTS.includes(getResizeWidgetInputName(input));
}

function disconnectWidgetInput(node, widgetName) {
    if (!node?.inputs || !node.graph) return;
    const input = node.inputs.find(i => getResizeWidgetInputName(i) === widgetName);
    if (input?.link != null) {
        node.graph.removeLink(input.link);
    }
}

function syncResizeWidgetInputSlots(node, activeNames) {
    if (!node) return;
    const active = new Set(activeNames || []);

    // Store converted-widget input slot objects so we can remove hidden slots from hit-testing
    // and restore them later without losing the user's "Convert Widget to Input" state.
    if (!node._tjResizeInputSlotStore) node._tjResizeInputSlotStore = {};

    const keptInputs = [];
    for (const input of node.inputs || []) {
        const name = getResizeWidgetInputName(input);
        if (!TJ_RESIZE_WIDGET_INPUTS.includes(name)) {
            keptInputs.push(input);
            continue;
        }

        node._tjResizeInputSlotStore[name] = input;

        if (active.has(name)) {
            input.hidden = false;
            keptInputs.push(input);
        } else {
            if (input?.link != null && node.graph) node.graph.removeLink(input.link);
            input.link = null;
            input.hidden = true;
        }
    }

    // If a slot was previously converted to input and then temporarily removed,
    // restore it when its widget becomes active again.
    for (const name of TJ_RESIZE_WIDGET_INPUTS) {
        if (!active.has(name)) continue;
        if (keptInputs.some(i => getResizeWidgetInputName(i) === name)) continue;
        const stored = node._tjResizeInputSlotStore[name];
        if (stored) {
            stored.hidden = false;
            keptInputs.push(stored);
        }
    }

    node.inputs = keptInputs;
}

function getActiveResizeWidgetInputs(node, nextResizeValue=null, nextMatchModeValue=null) {
    const matchMode = nextMatchModeValue ?? findWidget(node, "match_mode")?.value;
    const resize = nextResizeValue ?? findWidget(node, "resize_input")?.value ?? "none";

    if (matchMode === "Megapixel") return ["megapixel"];
    if (resize === "long edge" || resize === "short edge") return ["edge_size"];
    if (resize === "Custom") return ["custom_width", "custom_height"];
    return [];
}

function cleanupAndSyncResizeInputs(node, nextResizeValue=null, nextMatchModeValue=null) {
    syncResizeWidgetInputSlots(node, getActiveResizeWidgetInputs(node, nextResizeValue, nextMatchModeValue));
}

function getAutoSetWidget(node) {
    return findWidget(node, "auto_set");
}

function _tjStripNumericSuffix(name) {
    return String(name || "TJ_Set").trim().replace(/_\d+$/, "") || "TJ_Set";
}

function _tjCollectProviderNames(graph, excludeNode=null) {
    const names = new Set();
    if (!graph) return names;
    graph._nodes?.forEach(n => {
        if (!n || n === excludeNode) return;
        if (n.type === "TJ_GetNode" || n.type === "TJ_MultiGetNode") return;
        (n.widgets || []).forEach(w => {
            if (w.name === "set_name" || w.name === "setnode_name") {
                const v = String(w.value || "").trim();
                if (v) names.add(v);
            }
        });
        if (n.properties?.auto_sets) {
            const aw = n.widgets?.find(w => w.name === "auto_set");
            if (!aw || aw.value) {
                Object.values(n.properties.auto_sets).forEach(v => {
                    v = String(v || "").trim();
                    if (v) names.add(v);
                });
            }
        }
    });
    return names;
}

function _tjUniqueAutoSetName(graph, desired, existing, excludeNode=null) {
    const base = _tjStripNumericSuffix(desired);
    let name = base;
    let i = 1;
    while (existing.has(name)) name = `${base}_${i++}`;
    existing.add(name);
    return name;
}

function syncGetNodesForAutoSets(graph) {
    if (!graph) return;
    if (window.TJ_NODE_syncAllGetNodes) {
        window.TJ_NODE_syncAllGetNodes(graph);
        return;
    }
    graph._nodes?.forEach(n => {
        if (!n) return;
        try {
            if (n.type === "TJ_GetNode") {
                if (n._syncWithSetNode) n._syncWithSetNode();
                const w = n.widgets?.find(x => x.name === "get_name" || x.name === "set_name");
                if (w && n._connectToSetNode) n._connectToSetNode(w.value);
            } else if (n.type === "TJ_MultiGetNode") {
                if (n._syncWithSetNodes) n._syncWithSetNodes();
                if (n._rebuild) n._rebuild();
            } else {
                const w = n.widgets?.find(x => x.name === "get_name");
                if (w && n._tjConnectGetReceiver) n._tjConnectGetReceiver(w.value);
            }
        } catch (err) {
            console.warn("[TJ_NODE] AutoSet sync skipped stale node/link", err);
        }
    });
    app.canvas?.setDirty(true, true);
}

function refreshMultiImageLoaderAutoSets(node) {
    if (!node) return;
    if (!node.properties) node.properties = {};
    const autoW = getAutoSetWidget(node);
    const enabled = autoW ? !!autoW.value : false;
    const baseNames = ["BATCH", "WIDTH", "HEIGHT", "FILENAMES"];

    if (!enabled) {
        node.properties.auto_sets = {};
        node.outputs?.forEach((out, i) => {
            const base = baseNames[i] || out.name || `output_${i + 1}`;
            out.label = base;
        });
        syncGetNodesForAutoSets(node.graph);
        node.setDirtyCanvas?.(true, true);
        return;
    }

    const existing = _tjCollectProviderNames(node.graph, node);
    node.properties.auto_sets = {};
    node.outputs?.forEach((out, i) => {
        if (i > 3) return;
        const base = baseNames[i] || out.name || `output_${i + 1}`;
        const name = _tjUniqueAutoSetName(node.graph, base, existing, node);
        node.properties.auto_sets[i] = name;
        out.label = `${name} ▶`;
    });
    syncGetNodesForAutoSets(node.graph);
    node.setDirtyCanvas?.(true, true);
}

// ── Widget Visibility Logic ──
function updateWidgetVisibility(node) {
    const matchMode = findWidget(node, "match_mode");
    const resizeInput = findWidget(node, "resize_input");
    const edgeSize = findWidget(node, "edge_size");
    const customWidth = findWidget(node, "custom_width");
    const customHeight = findWidget(node, "custom_height");
    const megapixel = findWidget(node, "megapixel");
    const interpolation = findWidget(node, "interpolation");
    const scaleMethod = findWidget(node, "scale_method");

    if (!matchMode) return;

    const mode = matchMode.value;
    const resize = resizeInput ? resizeInput.value : "none";

    if (mode === "Megapixel") {
        hideWidget(resizeInput);
        hideWidget(edgeSize);
        hideWidget(customWidth);
        hideWidget(customHeight);
        showWidget(megapixel);
        showWidget(interpolation);
        showWidget(scaleMethod);
    } else {
        showWidget(resizeInput);
        hideWidget(megapixel);
        showWidget(interpolation);
        showWidget(scaleMethod);

        if (resize === "none") {
            hideWidget(edgeSize);
            hideWidget(customWidth);
            hideWidget(customHeight);
        } else if (resize === "long edge" || resize === "short edge") {
            showWidget(edgeSize);
            hideWidget(customWidth);
            hideWidget(customHeight);
        } else if (resize === "Custom") {
            hideWidget(edgeSize);
            showWidget(customWidth);
            showWidget(customHeight);
        }
    }

    cleanupAndSyncResizeInputs(node);

    requestAnimationFrame(() => {
        const sz = node.computeSize();
        node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
        node.setDirtyCanvas(true, true);
    });
}

// ── Helper: get thumbnail src ──
function getImageSrc(path) {
    if (!path) return "";
    const p = path.trim();

    let type = "input";
    let subfolder = "";
    let filename = p;

    if (p.startsWith("output/")) {
        type = "output";
        filename = p.substring(7);
    } else if (p.startsWith("input/")) {
        type = "input";
        filename = p.substring(6);
    }

    const slashIdx = filename.lastIndexOf("/");
    if (slashIdx !== -1) {
        subfolder = filename.substring(0, slashIdx);
        filename = filename.substring(slashIdx + 1);
    }

    let url = `/view?filename=${encodeURIComponent(filename)}&type=${type}`;
    if (subfolder) {
        url += `&subfolder=${encodeURIComponent(subfolder)}`;
    }
    url += `&t=${Date.now()}`;
    return url;
}

// ── 정렬 설정 (localStorage 저장) ──
const TJ_MIL_SORT_KEY = "tj_mil_sort_v1";
function tjMilGetSort() {
    try {
        const s = JSON.parse(localStorage.getItem(TJ_MIL_SORT_KEY) || "{}");
        return { key: s.key || "name", dir: s.dir || "asc" };
    } catch { return { key: "name", dir: "asc" }; }
}
function tjMilSetSort(s) { try { localStorage.setItem(TJ_MIL_SORT_KEY, JSON.stringify(s)); } catch (_) {} }
function tjMilSortFiles(files, sort) {
    const arr = files.slice();
    const dir = sort.dir === "desc" ? -1 : 1;
    const byName = (a, b) => String(a.filename || "").localeCompare(String(b.filename || ""), undefined, { numeric: true, sensitivity: "base" });
    arr.sort((a, b) => {
        let r = 0;
        if (sort.key === "time") r = (a.mtime || 0) - (b.mtime || 0) || byName(a, b);
        else if (sort.key === "type") r = String(a.ext || "").localeCompare(String(b.ext || "")) || byName(a, b);
        else r = byName(a, b);
        return r * dir;
    });
    return arr;
}
// 폴더는 항상 파일보다 위에 오지만, 폴더끼리는 파일과 동일한 정렬 기준을 적용한다.
// 'type'(확장자) 기준은 폴더엔 의미가 없으므로 이름순으로 대체한다.
function tjMilSortFolders(folders, sort) {
    const arr = folders.slice();
    const dir = sort.dir === "desc" ? -1 : 1;
    const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true, sensitivity: "base" });
    arr.sort((a, b) => {
        let r = 0;
        if (sort.key === "time") r = (a.mtime || 0) - (b.mtime || 0) || byName(a, b);
        else r = byName(a, b);
        return r * dir;
    });
    return arr;
}

// ── 폴더 북마크 (localStorage 저장; input/download/output 탭 한정) ──
const TJ_MIL_BM_KEY = "tj_mil_bookmarks_v1";
const TJ_MIL_BM_TABS = ["input", "download", "output"];
function tjMilGetBookmarks() {
    try { const a = JSON.parse(localStorage.getItem(TJ_MIL_BM_KEY) || "[]"); return Array.isArray(a) ? a : []; }
    catch { return []; }
}
function tjMilSetBookmarks(list) { try { localStorage.setItem(TJ_MIL_BM_KEY, JSON.stringify(list)); } catch (_) {} }
function tjMilBmId(tab, subfolder) { return tab + "|" + (subfolder || ""); }
function tjMilHasBookmark(tab, subfolder) {
    const id = tjMilBmId(tab, subfolder);
    return tjMilGetBookmarks().some(b => tjMilBmId(b.tab, b.subfolder) === id);
}
function tjMilAddBookmark(tab, subfolder) {
    if (!TJ_MIL_BM_TABS.includes(tab)) return;
    const list = tjMilGetBookmarks();
    const id = tjMilBmId(tab, subfolder);
    if (list.some(b => tjMilBmId(b.tab, b.subfolder) === id)) return;
    const label = subfolder ? subfolder.split("/").filter(Boolean).pop() : tab;
    list.push({ tab, subfolder: subfolder || "", label });
    tjMilSetBookmarks(list);
}
function tjMilRemoveBookmark(tab, subfolder) {
    const id = tjMilBmId(tab, subfolder);
    tjMilSetBookmarks(tjMilGetBookmarks().filter(b => tjMilBmId(b.tab, b.subfolder) !== id));
}
// subfolder("a/b/c") → 각 단계 스택(["a","a/b","a/b/c"])으로 만들어 Back 이 정상 동작하게.
function tjMilBuildStack(subfolder) {
    if (!subfolder) return [];
    const parts = subfolder.split("/").filter(Boolean);
    const stack = [];
    let acc = "";
    for (const p of parts) { acc = acc ? acc + "/" + p : p; stack.push(acc); }
    return stack;
}
// 이미지 파일만 업로드 허용 (클라이언트 1차 필터; 서버도 확장자 검증).
const TJ_MIL_IMG_EXT = ["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff", "tif"];
function tjMilIsImageFile(name) {
    const ext = String(name || "").split(".").pop().toLowerCase();
    return TJ_MIL_IMG_EXT.includes(ext);
}

// 네트워크 요청에 타임아웃을 건다. 원격/고지연 환경에서 요청 하나가 응답 없이
// 걸려버리면(연결 끊김·프록시 지연 등) "Loading..." 이 영구히 붙잡히는 문제를 막는다.
function tjMilFetchTimeout(url, options = {}, ms = 12000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// 북마크 유효성 검사는 세션당 한 번이면 충분하다(폴더가 자주 사라지진 않음).
// 픽커를 열 때마다 북마크 수만큼 추가 요청을 쏘면, 원격/고지연 환경에서 수백 개의
// 썸네일 요청과 커넥션을 경쟁하게 되어 로딩이 오래 멈춰 보이는 원인이 될 수 있다.
let TJ_MIL_BOOKMARKS_PRUNED_THIS_SESSION = false;


// ── Register Extension ──
app.registerExtension({
    name: "tj.multi_image_loader",

    async beforeRegisterNodeDef(nodeType, nodeData, _app) {
        if (nodeData.name !== "TJ_MultiImageLoader") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnNodeCreated ? origOnNodeCreated.apply(this, arguments) : undefined;
            const node = this;

			node.bgcolor = "#000000";
			node.color = "#7612DA";
			node.title_text_color = "#FFFFFF";

            // ─── Widget callbacks for visibility ───
            const matchModeW = findWidget(node, "match_mode");
            const resizeInputW = findWidget(node, "resize_input");

            if (matchModeW) {
                const origCb1 = matchModeW.callback;
                matchModeW.callback = function (v) {
                    if (origCb1) origCb1.call(this, v);
                    cleanupAndSyncResizeInputs(node, null, v);
                    updateWidgetVisibility(node);
                };
            }
            if (resizeInputW) {
                const origCb2 = resizeInputW.callback;
                resizeInputW.callback = function (v) {
                    if (origCb2) origCb2.call(this, v);
                    cleanupAndSyncResizeInputs(node, v, null);
                    updateWidgetVisibility(node);
                };
            }

            const autoSetW = getAutoSetWidget(node);
            if (autoSetW) {
                const origAutoCb = autoSetW.callback;
                autoSetW.callback = function(v) {
                    if (origAutoCb) origAutoCb.call(this, v);
                    refreshMultiImageLoaderAutoSets(node);
                };
            }

            // ─── DOM UI Widget ───
            const container = document.createElement("div");
            container.style.cssText = "display:flex;flex-direction:column;gap:6px;padding:4px;background:#000;border-radius:6px;";

            // == URL Download Bar ==
            const urlBar = document.createElement("div");
            urlBar.style.cssText = "display:flex;gap:4px;align-items:center;";
            const urlInput = document.createElement("input");
            urlInput.type = "text";
            urlInput.placeholder = "Image URL to download...";
            urlInput.style.cssText = "flex:1;height:28px;padding:0 8px;border:1px solid #00bfff;border-radius:4px;background:#000;color:#00bfff;font-size:12px;box-sizing:border-box;";
            const urlBtn = document.createElement("button");
            urlBtn.textContent = "Download";
            urlBtn.style.cssText = "height:28px;padding:0 12px;border:none;border-radius:4px;background:#0066cc;color:#00efff;font-size:12px;cursor:pointer;white-space:nowrap;box-shadow:0 0 6px #00bfff88;";
            urlBar.appendChild(urlInput);
            urlBar.appendChild(urlBtn);

            urlBtn.addEventListener("click", async () => {
                const url = urlInput.value.trim();
                if (!url) return;
                urlBtn.textContent = "...";
                try {
                    const resp = await fetch("/tj_node/download_url", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url }),
                    });
                    const data = await resp.json();
                    if (data.success) {
                        addPathToList(data.path);
                        urlInput.value = "";
                    } else {
                        alert("Download failed: " + (data.error || "unknown"));
                    }
                } catch (e) {
                    alert("Download error: " + e.message);
                }
                urlBtn.textContent = "Download";
            });

            // == Image Stack Panel ==
            const stackPanel = document.createElement("div");
            stackPanel.style.cssText = "display:flex;flex-direction:column;gap:4px;";

            const toolbar = document.createElement("div");
            toolbar.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;";

            const addBtn = document.createElement("button");
            addBtn.textContent = "Add Images";
            addBtn.style.cssText = "height:24px;padding:0 10px;border:none;border-radius:4px;background:#0055bb;color:#00efff;font-size:11px;cursor:pointer;box-shadow:0 0 5px #00bfff88;";

            const clearBtn = document.createElement("button");
            clearBtn.textContent = "Clear";
            clearBtn.style.cssText = "height:24px;padding:0 10px;border:none;border-radius:4px;background:#0055bb;color:#00efff;font-size:11px;cursor:pointer;box-shadow:0 0 5px #00bfff88;";

            const badge = document.createElement("span");
            badge.style.cssText = "font-size:11px;color:#aaa;margin-left:auto;";
            badge.textContent = "0 images";

            toolbar.appendChild(addBtn);
            toolbar.appendChild(clearBtn);
            toolbar.appendChild(badge);

            const grid = document.createElement("div");
            grid.style.cssText = "display:grid;gap:4px;overflow-y:auto;min-height:72px;max-height:200px;border:1px solid #0055bb;border-radius:4px;padding:4px;background:#000;box-shadow:0 0 6px #0055bb44;";

            const thumbCtrl = document.createElement("div");
            thumbCtrl.style.cssText = "display:flex;align-items:center;gap:6px;border:1px solid #0055bb;border-radius:4px;padding:3px 6px;background:#000;";
            const thumbLabel = document.createElement("span");
            thumbLabel.textContent = "Size";
            thumbLabel.style.cssText = "font-size:10px;color:#0055bb;";
            const thumbSlider = document.createElement("input");
            thumbSlider.type = "range";
            thumbSlider.min = "64";
            thumbSlider.max = "128";
            thumbSlider.value = "64";
            thumbSlider.style.cssText = "flex:1;height:14px;accent-color:#0099ff;";
            const rowLabel = document.createElement("span");
            rowLabel.textContent = "Rows";
            rowLabel.style.cssText = "font-size:10px;color:#0055bb;margin-left:8px;";
            const rowSlider = document.createElement("input");
            rowSlider.type = "range";
            rowSlider.min = "2";
            rowSlider.max = "5";
            rowSlider.value = "2";
            rowSlider.style.cssText = "width:60px;height:14px;accent-color:#0099ff;";

            thumbCtrl.appendChild(thumbLabel);
            thumbCtrl.appendChild(thumbSlider);
            thumbCtrl.appendChild(rowLabel);
            thumbCtrl.appendChild(rowSlider);

            stackPanel.appendChild(toolbar);
            stackPanel.appendChild(grid);
            stackPanel.appendChild(thumbCtrl);

            container.appendChild(urlBar);
            container.appendChild(stackPanel);

            const domWidget = node.addDOMWidget("tj_main_ui", "customtext", container, {
                serialize: false,
                hideOnZoom: false,
            });
            domWidget.computeSize = function () {
                const thumbSize = parseInt(thumbSlider.value) || 64;
                const rows = parseInt(rowSlider.value) || 2;
                const gridH = rows * (thumbSize + 8) + 12;
                grid.style.maxHeight = gridH + "px";
                grid.style.minHeight = gridH + "px";
                const total = 28 + 6 + 24 + 4 + gridH + 4 + 20 + 16;
                return [220, total];
            };

            // Keep batch_select directly under scale_method, before the DOM image stack.
            moveWidgetAfter(node, "batch_select", "scale_method");

            // ── State management ──
            function getCurrentPaths() {
                const w = findWidget(node, "image_paths_json");
                if (!w) return [];
                try { return JSON.parse(w.value); } catch { return []; }
            }

            function setCurrentPaths(arr) {
                const w = findWidget(node, "image_paths_json");
                if (w) w.value = JSON.stringify(arr);
                badge.textContent = arr.length + " images";
            }

            function addPathToList(path) {
                const arr = getCurrentPaths();
                if (!arr.includes(path)) {
                    arr.push(path);
                    setCurrentPaths(arr);
                    renderThumbnails();
                }
            }

            // ── Thumbnail rendering ──
            let dragSrcIndex = null;

            function renderThumbnails() {
                const paths = getCurrentPaths();
                const thumbSize = parseInt(thumbSlider.value) || 64;

                grid.innerHTML = "";
                grid.style.gridTemplateColumns = `repeat(auto-fill, ${thumbSize}px)`;
                grid.style.gridAutoRows = `${thumbSize}px`;

                paths.forEach((p, idx) => {
                    const card = document.createElement("div");
                    card.style.cssText = `position:relative;width:${thumbSize}px;height:${thumbSize}px;border:1px solid #555;border-radius:3px;overflow:hidden;cursor:grab;background:#222;flex-shrink:0;`;
                    card.draggable = true;
                    card.dataset.index = idx;

                    const idxBadge = document.createElement("div");
                    idxBadge.textContent = idx + 1;
                    idxBadge.style.cssText = "position:absolute;top:2px;left:2px;background:rgba(0,0,0,0.7);color:#fff;font-size:9px;padding:1px 4px;border-radius:2px;z-index:2;pointer-events:none;";
                    card.appendChild(idxBadge);

                    const delBtn = document.createElement("div");
                    delBtn.textContent = "×";
                    delBtn.style.cssText = "position:absolute;top:1px;right:3px;color:#f66;font-size:14px;font-weight:bold;cursor:pointer;z-index:2;line-height:1;";
                    delBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const arr = getCurrentPaths();
                        arr.splice(idx, 1);
                        setCurrentPaths(arr);
                        renderThumbnails();
                    });
                    card.appendChild(delBtn);

                    const img = document.createElement("img");
                    img.src = getImageSrc(p);
                    img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
                    img.draggable = false;
                    img.onerror = function () {
                        this.style.display = "none";
                        const errText = document.createElement("div");
                        errText.textContent = "?";
                        errText.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#666;font-size:20px;";
                        card.appendChild(errText);
                    };
                    card.appendChild(img);

                    card.addEventListener("dblclick", () => openFullscreenViewer(paths, idx));

                    card.addEventListener("dragstart", (e) => {
                        dragSrcIndex = idx;
                        e.dataTransfer.effectAllowed = "move";
                        card.style.opacity = "0.5";
                    });
                    card.addEventListener("dragend", () => { card.style.opacity = "1"; dragSrcIndex = null; });
                    card.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; card.style.borderColor = "#8af"; });
                    card.addEventListener("dragleave", () => { card.style.borderColor = "#555"; });
                    card.addEventListener("drop", (e) => {
                        e.preventDefault();
                        card.style.borderColor = "#555";
                        if (dragSrcIndex === null || dragSrcIndex === idx) return;
                        const arr = getCurrentPaths();
                        const [moved] = arr.splice(dragSrcIndex, 1);
                        arr.splice(idx, 0, moved);
                        setCurrentPaths(arr);
                        renderThumbnails();
                    });

                    grid.appendChild(card);
                });

                requestAnimationFrame(() => {
                    const sz = node.computeSize();
                    node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
                    node.setDirtyCanvas(true, true);
                });
            }

            thumbSlider.addEventListener("input", () => renderThumbnails());
            rowSlider.addEventListener("input", () => {
                requestAnimationFrame(() => {
                    const sz = node.computeSize();
                    node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
                    node.setDirtyCanvas(true, true);
                });
            });

            clearBtn.addEventListener("click", () => {
                setCurrentPaths([]);
                renderThumbnails();
            });

            // ── Fullscreen Viewer ──
            function openFullscreenViewer(paths, startIdx) {
                let currentIdx = startIdx;
                const overlay = document.createElement("div");
                overlay.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;";

                const topBar = document.createElement("div");
                topBar.style.cssText = "position:absolute;top:10px;right:16px;display:flex;align-items:center;gap:16px;z-index:2;";
                const infoText = document.createElement("span");
                infoText.style.cssText = "color:#ccc;font-size:13px;";
                const closeBtn = document.createElement("div");
                closeBtn.textContent = "✕";
                closeBtn.style.cssText = "color:#fff;font-size:24px;cursor:pointer;padding:4px 10px;";
                closeBtn.addEventListener("click", () => { overlay.remove(); document.removeEventListener("keydown", onKey); });
                topBar.appendChild(infoText);
                topBar.appendChild(closeBtn);
                overlay.appendChild(topBar);

                const imgEl = document.createElement("img");
                imgEl.style.cssText = "max-width:90vw;max-height:85vh;object-fit:contain;border-radius:4px;";
                overlay.appendChild(imgEl);

                const bottomInfo = document.createElement("div");
                bottomInfo.style.cssText = "color:#aaa;font-size:12px;margin-top:8px;text-align:center;";
                overlay.appendChild(bottomInfo);

                const leftArrow = document.createElement("div");
                leftArrow.textContent = "❮";
                leftArrow.style.cssText = "position:absolute;left:20px;top:50%;transform:translateY(-50%);color:#fff;font-size:36px;cursor:pointer;padding:10px;user-select:none;";
                leftArrow.addEventListener("click", () => navigate(-1));
                overlay.appendChild(leftArrow);

                const rightArrow = document.createElement("div");
                rightArrow.textContent = "❯";
                rightArrow.style.cssText = "position:absolute;right:20px;top:50%;transform:translateY(-50%);color:#fff;font-size:36px;cursor:pointer;padding:10px;user-select:none;";
                rightArrow.addEventListener("click", () => navigate(1));
                overlay.appendChild(rightArrow);

                function showImage() {
                    const p = paths[currentIdx];
                    imgEl.src = getImageSrc(p);
                    infoText.textContent = `${currentIdx + 1} / ${paths.length}`;
                    imgEl.onload = function () {
                        const fname = p.split("/").pop();
                        bottomInfo.textContent = `${fname}  —  ${imgEl.naturalWidth} × ${imgEl.naturalHeight} px`;
                    };
                }

                function navigate(dir) {
                    currentIdx = (currentIdx + dir + paths.length) % paths.length;
                    showImage();
                }

                function onKey(e) {
                    if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", onKey); }
                    if (e.key === "ArrowLeft") navigate(-1);
                    if (e.key === "ArrowRight") navigate(1);
                }
                document.addEventListener("keydown", onKey);
                overlay.addEventListener("click", (e) => {
                    if (e.target === overlay) { overlay.remove(); document.removeEventListener("keydown", onKey); }
                });

                showImage();
                document.body.appendChild(overlay);
            }

            // ══════════════════════════════════════════════════════════
            // ── Add Images → Modal File Picker
            // ══════════════════════════════════════════════════════════
            addBtn.addEventListener("click", () => openFilePicker());

            function openFilePicker() {
                const modal = document.createElement("div");
                modal.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);z-index:99998;display:flex;align-items:center;justify-content:center;";

                const box = document.createElement("div");
                box.style.cssText = "background:#000;border:1px solid #0055bb;border-radius:8px;width:600px;height:660px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 0 20px #0055bb44;";

                // ── 장바구니 ──
                const selectedPaths = new Set();

                // ── 폴더 탐색 상태 ──
                const subfolderStack = { input: [], download: [], output: [] };

                function getCurrentSubfolder(tab) {
                    const stack = subfolderStack[tab];
                    return stack && stack.length > 0 ? stack[stack.length - 1] : "";
                }

                // Header
                const header = document.createElement("div");
                header.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #0055bb;background:#000;";
                const titleEl = document.createElement("span");
                titleEl.textContent = "Select Images";
                titleEl.style.cssText = "color:#ffffff;font-size:14px;font-weight:bold;";
                const closeM = document.createElement("div");
                closeM.textContent = "✕";
                closeM.style.cssText = "color:#00bfff;font-size:18px;cursor:pointer;";
                closeM.addEventListener("click", () => modal.remove());
                header.appendChild(titleEl);
                header.appendChild(closeM);
                box.appendChild(header);

                // Tabs
                const tabsEl = document.createElement("div");
                tabsEl.style.cssText = "display:flex;border-bottom:1px solid #0055bb;background:#000;";
                const tabNames = ["input", "download", "output", "upload"];
                const tabLabels = ["Input", "Download", "Output", "Local Upload"];
                let activeTab = "input";
                const tabEls = [];

                const fileList = document.createElement("div");
                fileList.style.cssText = "flex:1;overflow-y:auto;padding:8px;background:#000;";

                tabNames.forEach((t, i) => {
                    const tabEl = document.createElement("div");
                    tabEl.textContent = tabLabels[i];
                    tabEl.style.cssText = "flex:1;text-align:center;padding:8px;color:#0055bb;font-size:12px;cursor:pointer;border-bottom:2px solid transparent;background:#000;";
                    tabEl.addEventListener("click", () => {
                        activeTab = t;
                        tabEls.forEach(d => { d.style.color = "#aaa"; d.style.borderBottomColor = "transparent"; });
                        tabEl.style.color = "#00efff";
                        tabEl.style.borderBottomColor = "#0055bb";
                        loadTabContent();
                    });
                    if (t === activeTab) { tabEl.style.color = "#fff"; tabEl.style.borderBottomColor = "#58f"; }
                    tabEls.push(tabEl);
                    tabsEl.appendChild(tabEl);
                });
                box.appendChild(tabsEl);

                // ── 북마크 바 (상단 메뉴) ──
                const bookmarkBar = document.createElement("div");
                bookmarkBar.style.cssText = "display:flex;align-items:center;gap:6px;padding:5px 10px;border-bottom:1px solid #0a3;background:#001a0d;flex-wrap:wrap;min-height:26px;";

                function navigateToBookmark(bm) {
                    if (!TJ_MIL_BM_TABS.includes(bm.tab)) return;
                    activeTab = bm.tab;
                    tabEls.forEach((d, i) => {
                        const on = tabNames[i] === activeTab;
                        d.style.color = on ? "#fff" : "#aaa";
                        d.style.borderBottomColor = on ? "#58f" : "transparent";
                    });
                    subfolderStack[bm.tab] = tjMilBuildStack(bm.subfolder);
                    loadTabContent();
                }

                function renderBookmarkBar() {
                    bookmarkBar.innerHTML = "";
                    const star = document.createElement("span");
                    star.textContent = "★";
                    star.style.cssText = "color:#ffcc33;font-size:12px;flex-shrink:0;";
                    bookmarkBar.appendChild(star);

                    const bms = tjMilGetBookmarks();
                    if (bms.length === 0) {
                        const hint = document.createElement("span");
                        hint.textContent = "북마크 없음 — 폴더 안에서 ‘☆ 북마크’ 버튼으로 등록";
                        hint.style.cssText = "color:#5a7;font-size:10px;";
                        bookmarkBar.appendChild(hint);
                        return;
                    }
                    bms.forEach(bm => {
                        const chip = document.createElement("div");
                        chip.style.cssText = "display:flex;align-items:center;gap:4px;background:#0a2a18;border:1px solid #0a5;border-radius:12px;padding:2px 6px 2px 8px;cursor:pointer;";
                        const lbl = document.createElement("span");
                        lbl.textContent = (bm.tab === "download" ? "⬇ " : bm.tab === "output" ? "⬆ " : "📥 ") + bm.label;
                        lbl.title = `/${bm.tab}/${bm.subfolder || ""}`;
                        lbl.style.cssText = "color:#7fe0b0;font-size:10px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
                        lbl.addEventListener("click", () => navigateToBookmark(bm));
                        const rm = document.createElement("span");
                        rm.textContent = "×";
                        rm.style.cssText = "color:#f88;font-size:12px;line-height:1;flex-shrink:0;";
                        rm.title = "북마크 해제";
                        rm.addEventListener("click", (e) => {
                            e.stopPropagation();
                            tjMilRemoveBookmark(bm.tab, bm.subfolder);
                            renderBookmarkBar();
                            if (typeof updateBookmarkBtn === "function") updateBookmarkBtn();
                        });
                        chip.appendChild(lbl); chip.appendChild(rm);
                        bookmarkBar.appendChild(chip);
                    });
                }

                // 죽은 북마크(폴더 삭제됨) 자동 정리 — 세션당 1회, 메인 콘텐츠 로딩이
                // 끝난 뒤 낮은 우선순위로 실행해 썸네일 요청과 커넥션을 다투지 않게 한다.
                async function pruneDeadBookmarks() {
                    if (TJ_MIL_BOOKMARKS_PRUNED_THIS_SESSION) return;
                    const bms = tjMilGetBookmarks();
                    if (bms.length === 0) return;
                    TJ_MIL_BOOKMARKS_PRUNED_THIS_SESSION = true;
                    let changed = false;
                    for (const bm of bms) {
                        try {
                            const resp = await tjMilFetchTimeout("/tj_node/list_dir_files", {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ dir_type: bm.tab, subfolder: bm.subfolder }),
                            }, 8000);
                            const d = await resp.json();
                            if (d && d.success && d.exists === false) {
                                tjMilRemoveBookmark(bm.tab, bm.subfolder);
                                changed = true;
                            }
                        } catch (_) { /* 타임아웃/네트워크 오류 시엔 유지 (다음 세션에 재검사) */ }
                    }
                    if (changed) { renderBookmarkBar(); if (typeof updateBookmarkBtn === "function") updateBookmarkBtn(); }
                }

                let updateBookmarkBtn = null;   // navBar 의 북마크 토글 버튼이 채운다
                box.appendChild(bookmarkBar);
                box.appendChild(fileList);

                // Footer
                const footer = document.createElement("div");
                footer.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-top:1px solid #0055bb;background:#000;";
                const selectCount = document.createElement("span");
                selectCount.style.cssText = "color:#ffffff;font-size:12px;";
                selectCount.textContent = "0 selected";
                const btnGroup = document.createElement("div");
                btnGroup.style.cssText = "display:flex;gap:8px;";
                const cancelBtn = document.createElement("button");
                cancelBtn.textContent = "Cancel";
                cancelBtn.style.cssText = "height:30px;padding:0 16px;border:1px solid #ff2244;border-radius:4px;background:transparent;color:#ff6677;font-size:12px;cursor:pointer;";
                cancelBtn.addEventListener("click", () => modal.remove());

                // ── Delete Selected 버튼 ──
                const deleteBtn = document.createElement("button");
                deleteBtn.textContent = "Delete Selected";
                deleteBtn.style.cssText = "height:30px;padding:0 14px;border:1px solid #ff4444;border-radius:4px;background:transparent;color:#ff6666;font-size:12px;cursor:pointer;";
                deleteBtn.addEventListener("click", async () => {
                    if (selectedPaths.size === 0) return;

                    const pathsArr = Array.from(selectedPaths);
                    const confirmMsg = `Are you sure you want to permanently delete ${pathsArr.length} file(s) from disk?\n\nThis cannot be undone.`;
                    if (!confirm(confirmMsg)) return;

                    deleteBtn.textContent = "Deleting...";
                    deleteBtn.style.pointerEvents = "none";

                    try {
                        const resp = await fetch("/tj_node/delete_files", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ paths: pathsArr }),
                        });
                        const data = await resp.json();

                        if (data.success) {
                            // 삭제된 파일을 selectedPaths에서 제거
                            (data.deleted || []).forEach(p => selectedPaths.delete(p));

                            // 이미지 스택에서도 삭제된 파일 제거
                            const currentArr = getCurrentPaths();
                            const deletedSet = new Set(data.deleted || []);
                            const filtered = currentArr.filter(p => !deletedSet.has(p));
                            if (filtered.length !== currentArr.length) {
                                setCurrentPaths(filtered);
                                renderThumbnails();
                            }

                            const msg = `Deleted ${data.deleted_count} file(s).` +
                                (data.errors && data.errors.length > 0
                                    ? `\nFailed: ${data.errors.map(e => e.path + " (" + e.error + ")").join(", ")}`
                                    : "");
                            alert(msg);
                        } else {
                            alert("Delete failed: " + (data.error || "unknown"));
                        }
                    } catch (e) {
                        alert("Delete error: " + e.message);
                    }

                    deleteBtn.textContent = "Delete Selected";
                    deleteBtn.style.pointerEvents = "";
                    updateSelectCount();
                    loadTabContent();
                });

                const confirmBtn = document.createElement("button");
                confirmBtn.textContent = "Add Selected";
                confirmBtn.style.cssText = "height:30px;padding:0 16px;border:none;border-radius:4px;background:#cc1133;color:#fff;font-size:12px;cursor:pointer;font-weight:bold;box-shadow:0 0 8px #ff224488;";
                confirmBtn.addEventListener("click", () => {
                    selectedPaths.forEach(path => addPathToList(path));
                    renderThumbnails();
                    modal.remove();
                });
                btnGroup.appendChild(cancelBtn);
                btnGroup.appendChild(deleteBtn);
                btnGroup.appendChild(confirmBtn);
                footer.appendChild(selectCount);
                footer.appendChild(btnGroup);
                box.appendChild(footer);

                function updateSelectCount() {
                    selectCount.textContent = `${selectedPaths.size} selected`;
                    confirmBtn.textContent = selectedPaths.size > 0 ? `Add ${selectedPaths.size} Images` : "Add Selected";
                    // Delete 버튼 활성/비활성 시각 표시
                    if (selectedPaths.size > 0) {
                        deleteBtn.style.borderColor = "#ff4444";
                        deleteBtn.style.color = "#ff6666";
                        deleteBtn.style.cursor = "pointer";
                    } else {
                        deleteBtn.style.borderColor = "#553333";
                        deleteBtn.style.color = "#664444";
                        deleteBtn.style.cursor = "default";
                    }
                }

                // ══════════════════════════════════════════
                // ── loadTabContent
                // ══════════════════════════════════════════
                async function loadTabContent() {
                    fileList.innerHTML = "";

                    // ── Upload 탭 ──
                    if (activeTab === "upload") {
                        // Delete 버튼 숨김 (upload 탭에서는 의미 없음)
                        deleteBtn.style.display = "none";

                        const uploadArea = document.createElement("div");
                        uploadArea.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:140px;border:2px dashed #555;border-radius:8px;margin:10px;padding:20px;color:#888;font-size:13px;cursor:pointer;";
                        uploadArea.textContent = "Click or drag files here to upload";
                        const fileInput = document.createElement("input");
                        fileInput.type = "file";
                        fileInput.multiple = true;
                        fileInput.accept = "image/*";
                        fileInput.style.display = "none";

                        uploadArea.addEventListener("click", () => fileInput.click());
                        uploadArea.addEventListener("dragover", (e) => { e.preventDefault(); uploadArea.style.borderColor = "#8af"; });
                        uploadArea.addEventListener("dragleave", () => { uploadArea.style.borderColor = "#555"; });
                        uploadArea.addEventListener("drop", async (e) => {
                            e.preventDefault();
                            uploadArea.style.borderColor = "#555";
                            await doUpload(e.dataTransfer.files);
                        });
                        fileInput.addEventListener("change", async () => { await doUpload(fileInput.files); });

                        const uploadedListLabel = document.createElement("div");
                        uploadedListLabel.style.cssText = "color:#0099ff;font-size:11px;margin:8px 10px 4px;display:none;";
                        uploadedListLabel.textContent = "Uploaded (click to select/deselect, × to remove):";

                        const uploadedGrid = document.createElement("div");
                        uploadedGrid.style.cssText = "display:grid;grid-template-columns:repeat(5, 90px);grid-auto-rows:110px;gap:6px;padding:0 10px;";

                        const uploadedFiles = [];

                        function renderUploadedGrid() {
                            uploadedGrid.innerHTML = "";
                            if (uploadedFiles.length === 0) {
                                uploadedListLabel.style.display = "none";
                                return;
                            }
                            uploadedListLabel.style.display = "block";

                            uploadedFiles.forEach((f, fIdx) => {
                                const cell = document.createElement("div");
                                cell.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px;border-radius:4px;cursor:pointer;border:2px solid transparent;position:relative;";

                                const checkMark = document.createElement("div");
                                checkMark.style.cssText = "position:absolute;top:4px;left:4px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,0.5);border:2px solid #555;display:flex;align-items:center;justify-content:center;font-size:12px;color:transparent;z-index:1;pointer-events:none;";
                                checkMark.textContent = "✓";
                                cell.appendChild(checkMark);

                                const removeBtn = document.createElement("div");
                                removeBtn.textContent = "×";
                                removeBtn.style.cssText = "position:absolute;top:2px;right:4px;color:#f66;font-size:16px;font-weight:bold;cursor:pointer;z-index:2;line-height:1;";
                                removeBtn.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    selectedPaths.delete(f.path);
                                    uploadedFiles.splice(fIdx, 1);
                                    updateSelectCount();
                                    renderUploadedGrid();
                                });
                                cell.appendChild(removeBtn);

                                const thumb = document.createElement("img");
                                // 화면에 보이는 것부터 로드(브라우저 네이티브 지연 로딩).
                                // 폴더에 파일이 많을 때 원격/고지연 환경에서 수백 개를 한 번에
                                // 요청해 느려지는 것을 완화한다.
                                thumb.loading = "lazy";
                                thumb.decoding = "async";
                                thumb.src = getImageSrc(f.path);
                                thumb.style.cssText = "width:80px;height:80px;object-fit:cover;border-radius:3px;background:#222;";
                                thumb.onerror = function () { this.style.display = "none"; };

                                const nameEl = document.createElement("div");
                                nameEl.textContent = f.filename;
                                nameEl.style.cssText = "color:#bbb;font-size:10px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:85px;";

                                cell.appendChild(thumb);
                                cell.appendChild(nameEl);

                                function updateCellVisual() {
                                    const sel = selectedPaths.has(f.path);
                                    cell.style.borderColor = sel ? "#ff2244" : "transparent";
                                    cell.style.background = sel ? "rgba(255,34,68,0.15)" : "";
                                    checkMark.style.background = sel ? "#ff2244" : "rgba(0,0,0,0.5)";
                                    checkMark.style.borderColor = sel ? "#ff2244" : "#555";
                                    checkMark.style.color = sel ? "#fff" : "transparent";
                                }

                                cell.addEventListener("click", () => {
                                    if (selectedPaths.has(f.path)) selectedPaths.delete(f.path);
                                    else selectedPaths.add(f.path);
                                    updateCellVisual();
                                    updateSelectCount();
                                });

                                updateCellVisual();
                                uploadedGrid.appendChild(cell);
                            });
                        }

                        async function doUpload(fileListArg) {
                            // 이미지 파일만 업로드 (비-이미지는 걸러냄).
                            const all = Array.from(fileListArg || []);
                            const files = all.filter(f => tjMilIsImageFile(f.name));
                            const skipped = all.length - files.length;
                            if (files.length === 0) {
                                uploadArea.textContent = skipped > 0
                                    ? "이미지 파일만 업로드할 수 있습니다."
                                    : "Click or drag files here to upload";
                                return;
                            }
                            uploadArea.textContent = "Uploading...";
                            for (const file of files) {
                                const fd = new FormData();
                                fd.append("file", file, file.name);
                                try {
                                    const resp = await fetch("/tj_node/upload_local", { method: "POST", body: fd });
                                    const data = await resp.json();
                                    if (data.success) {
                                        uploadedFiles.push({ path: data.path, filename: data.filename });
                                        selectedPaths.add(data.path);
                                    }
                                } catch (e) { console.error("Upload failed:", e); }
                            }
                            updateSelectCount();
                            renderUploadedGrid();
                            uploadArea.textContent = skipped > 0
                                ? `업로드 완료 (이미지 아님 ${skipped}개 제외). 더 추가하려면 클릭/드래그.`
                                : "Upload complete! Click or drag more files.";
                        }

                        fileList.appendChild(uploadArea);
                        fileList.appendChild(fileInput);
                        fileList.appendChild(uploadedListLabel);
                        fileList.appendChild(uploadedGrid);
                        renderUploadedGrid();
                        return;
                    }

                    // ── input / download / output 탭 ──
                    // Delete 버튼 표시
                    deleteBtn.style.display = "";

                    const currentSub = getCurrentSubfolder(activeTab);

                    // 로딩 표시
                    const loadingEl = document.createElement("div");
                    loadingEl.style.cssText = "color:#888;font-size:12px;padding:20px;text-align:center;";
                    loadingEl.textContent = "Loading...";
                    fileList.appendChild(loadingEl);

                    try {
                        // 타임아웃을 걸어, 원격/고지연 환경에서 요청이 응답 없이 걸려버려도
                        // "Loading..." 이 무한정 붙잡히지 않고 재시도 가능한 오류로 넘어가게 한다.
                        const resp = await tjMilFetchTimeout("/tj_node/list_dir_files", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ dir_type: activeTab, subfolder: currentSub }),
                        }, 15000);
                        const data = await resp.json();

                        // 완전히 비우고 다시 그리기
                        fileList.innerHTML = "";

                        // ── 네비게이션 바 (항상 표시) ──
                        const navBar = document.createElement("div");
                        navBar.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:4px 2px;border-bottom:1px solid #333;flex-wrap:wrap;";

                        if (currentSub) {
                            const backBtn = document.createElement("button");
                            backBtn.textContent = "← Back";
                            backBtn.style.cssText = "height:22px;padding:0 10px;border:1px solid #0088cc;border-radius:3px;background:transparent;color:#00bfff;font-size:11px;cursor:pointer;flex-shrink:0;";
                            backBtn.addEventListener("click", () => {
                                subfolderStack[activeTab].pop();
                                loadTabContent();
                            });
                            navBar.appendChild(backBtn);
                        }

                        const pathLabel = document.createElement("span");
                        pathLabel.style.cssText = "color:#888;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:40px;";
                        pathLabel.textContent = currentSub ? `/${activeTab}/${currentSub}` : `/${activeTab}`;
                        navBar.appendChild(pathLabel);

                        // ── 현재 폴더 북마크 토글 (input/download/output 한정) ──
                        const bmBtn = document.createElement("button");
                        bmBtn.style.cssText = "height:22px;padding:0 8px;border-radius:3px;font-size:11px;cursor:pointer;flex-shrink:0;";
                        updateBookmarkBtn = () => {
                            const on = tjMilHasBookmark(activeTab, currentSub);
                            bmBtn.textContent = on ? "★ 북마크됨" : "☆ 북마크";
                            bmBtn.style.border = on ? "1px solid #ffcc33" : "1px solid #0a5";
                            bmBtn.style.background = on ? "#332a0d" : "transparent";
                            bmBtn.style.color = on ? "#ffcc33" : "#7fe0b0";
                        };
                        bmBtn.addEventListener("click", () => {
                            if (tjMilHasBookmark(activeTab, currentSub)) tjMilRemoveBookmark(activeTab, currentSub);
                            else tjMilAddBookmark(activeTab, currentSub);
                            updateBookmarkBtn();
                            renderBookmarkBar();
                        });
                        updateBookmarkBtn();
                        navBar.appendChild(bmBtn);

                        // ── 정렬 컨트롤 (이름/시간/종류 · 오름/내림; 폴더는 항상 최상위) ──
                        const sort = tjMilGetSort();
                        const sortSel = document.createElement("select");
                        sortSel.style.cssText = "height:22px;border:1px solid #0088cc;border-radius:3px;background:#001a2e;color:#00bfff;font-size:11px;cursor:pointer;flex-shrink:0;";
                        [["name", "이름"], ["time", "시간"], ["type", "종류"]].forEach(([v, t]) => {
                            const o = document.createElement("option"); o.value = v; o.textContent = t;
                            if (v === sort.key) o.selected = true; sortSel.appendChild(o);
                        });
                        sortSel.addEventListener("change", () => {
                            tjMilSetSort({ key: sortSel.value, dir: tjMilGetSort().dir });
                            loadTabContent();
                        });
                        navBar.appendChild(sortSel);

                        const dirBtn = document.createElement("button");
                        dirBtn.textContent = sort.dir === "desc" ? "▼ 내림" : "▲ 오름";
                        dirBtn.style.cssText = "height:22px;padding:0 8px;border:1px solid #0088cc;border-radius:3px;background:transparent;color:#00bfff;font-size:11px;cursor:pointer;flex-shrink:0;";
                        dirBtn.addEventListener("click", () => {
                            const cur = tjMilGetSort();
                            tjMilSetSort({ key: cur.key, dir: cur.dir === "desc" ? "asc" : "desc" });
                            loadTabContent();
                        });
                        navBar.appendChild(dirBtn);

                        fileList.appendChild(navBar);

                        // 북마크했던 폴더가 삭제됐으면 자동 해제
                        if (data.exists === false && currentSub && tjMilHasBookmark(activeTab, currentSub)) {
                            tjMilRemoveBookmark(activeTab, currentSub);
                            updateBookmarkBtn();
                            renderBookmarkBar();
                        }

                        const hasFolders = data.folders && data.folders.length > 0;
                        const hasFiles = data.files && data.files.length > 0;

                        if (!hasFolders && !hasFiles) {
                            const emptyMsg = document.createElement("div");
                            emptyMsg.style.cssText = "color:#666;font-size:12px;padding:20px;text-align:center;";
                            emptyMsg.textContent = "Empty folder";
                            fileList.appendChild(emptyMsg);
                            return;
                        }

                        // ── Select All / Deselect All ──
                        const cellList = [];
                        // 폴더와 파일 각각 같은 정렬 기준 적용. 폴더는 항상 파일보다 위에 그려진다.
                        const activeSort = tjMilGetSort();
                        let currentFiles = tjMilSortFiles(data.files || [], activeSort);
                        const currentFolders = tjMilSortFolders(data.folders || [], activeSort);

                        if (hasFiles) {
                            const selectBar = document.createElement("div");
                            selectBar.style.cssText = "display:flex;gap:8px;margin-bottom:6px;";

                            const selectAllBtn = document.createElement("button");
                            selectAllBtn.textContent = "Select All";
                            selectAllBtn.style.cssText = "height:22px;padding:0 10px;border:1px solid #ffffff;border-radius:3px;background:transparent;color:#ffffff;font-size:11px;cursor:pointer;";
                            selectAllBtn.addEventListener("click", () => {
                                currentFiles.forEach(f => selectedPaths.add(f.path));
                                cellList.forEach(c => c.updateVisual());
                                updateSelectCount();
                            });

                            const deselectAllBtn = document.createElement("button");
                            deselectAllBtn.textContent = "Deselect All";
                            deselectAllBtn.style.cssText = "height:22px;padding:0 10px;border:1px solid #ffffff;border-radius:3px;background:transparent;color:#ffffff;font-size:11px;cursor:pointer;";
                            deselectAllBtn.addEventListener("click", () => {
                                currentFiles.forEach(f => selectedPaths.delete(f.path));
                                cellList.forEach(c => c.updateVisual());
                                updateSelectCount();
                            });

                            selectBar.appendChild(selectAllBtn);
                            selectBar.appendChild(deselectAllBtn);
                            fileList.appendChild(selectBar);
                        }

                        const pickerGrid = document.createElement("div");
                        pickerGrid.style.cssText = "display:grid;grid-template-columns:repeat(5, 90px);grid-auto-rows:110px;gap:6px;";

                        // ── 폴더 (항상 최상위, 파일과 같은 기준으로 정렬) ──
                        if (hasFolders) {
                            currentFolders.forEach(folder => {
                                const cell = document.createElement("div");
                                cell.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px;border-radius:4px;cursor:pointer;border:2px solid transparent;position:relative;";

                                cell.addEventListener("mouseenter", () => { cell.style.background = "rgba(0,100,200,0.15)"; cell.style.borderColor = "#0088cc"; });
                                cell.addEventListener("mouseleave", () => { cell.style.background = ""; cell.style.borderColor = "transparent"; });

                                const folderIcon = document.createElement("div");
                                folderIcon.style.cssText = "width:80px;height:80px;background:#1a1a2e;border-radius:3px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4px;";
                                const iconSvg = document.createElement("div");
                                iconSvg.innerHTML = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0088cc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
                                folderIcon.appendChild(iconSvg);

                                const nameEl = document.createElement("div");
                                nameEl.textContent = folder.name;
                                nameEl.style.cssText = "color:#0099ff;font-size:10px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:85px;";

                                cell.appendChild(folderIcon);
                                cell.appendChild(nameEl);

                                cell.addEventListener("click", () => {
                                    subfolderStack[activeTab].push(folder.subfolder);
                                    loadTabContent();
                                });

                                pickerGrid.appendChild(cell);
                            });
                        }

                        // ── 이미지 파일 ──
                        if (hasFiles) {
                            currentFiles.forEach(f => {
                                const cell = document.createElement("div");
                                cell.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px;border-radius:4px;cursor:pointer;border:2px solid transparent;position:relative;";

                                const checkMark = document.createElement("div");
                                checkMark.style.cssText = "position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,0.5);border:2px solid #555;display:flex;align-items:center;justify-content:center;font-size:12px;color:transparent;z-index:1;pointer-events:none;";
                                checkMark.textContent = "✓";
                                cell.appendChild(checkMark);

                                const thumb = document.createElement("img");
                                // 화면에 보이는 것부터 로드(브라우저 네이티브 지연 로딩).
                                // 폴더에 파일이 많을 때 원격/고지연 환경에서 수백 개를 한 번에
                                // 요청해 느려지는 것을 완화한다.
                                thumb.loading = "lazy";
                                thumb.decoding = "async";
                                thumb.src = getImageSrc(f.path);
                                thumb.style.cssText = "width:80px;height:80px;object-fit:cover;border-radius:3px;background:#222;";
                                thumb.onerror = function () {
                                    this.style.display = "none";
                                    const ph = document.createElement("div");
                                    ph.style.cssText = "width:80px;height:80px;background:#333;border-radius:3px;display:flex;align-items:center;justify-content:center;color:#666;font-size:24px;";
                                    ph.textContent = "?";
                                    cell.insertBefore(ph, checkMark.nextSibling);
                                };

                                const nameEl = document.createElement("div");
                                nameEl.textContent = f.filename;
                                nameEl.style.cssText = "color:#bbb;font-size:10px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:85px;";

                                cell.appendChild(thumb);
                                cell.appendChild(nameEl);

                                function updateCellVisual() {
                                    const sel = selectedPaths.has(f.path);
                                    cell.style.borderColor = sel ? "#ff2244" : "transparent";
                                    cell.style.background = sel ? "rgba(255,34,68,0.15)" : "";
                                    checkMark.style.background = sel ? "#ff2244" : "rgba(0,0,0,0.5)";
                                    checkMark.style.borderColor = sel ? "#ff2244" : "#555";
                                    checkMark.style.color = sel ? "#fff" : "transparent";
                                }

                                cell.addEventListener("click", () => {
                                    if (selectedPaths.has(f.path)) selectedPaths.delete(f.path);
                                    else selectedPaths.add(f.path);
                                    updateCellVisual();
                                    updateSelectCount();
                                });

                                updateCellVisual();
                                cellList.push({ path: f.path, updateVisual: updateCellVisual });
                                pickerGrid.appendChild(cell);
                            });
                        }

                        fileList.appendChild(pickerGrid);
                    } catch (e) {
                        fileList.innerHTML = "";
                        const errEl = document.createElement("div");
                        errEl.style.cssText = "color:#f66;font-size:12px;padding:20px;text-align:center;";
                        errEl.textContent = e.name === "AbortError"
                            ? "요청 시간이 초과되었습니다 (네트워크가 느리거나 응답이 없습니다)."
                            : "Error: " + e.message;
                        fileList.appendChild(errEl);

                        const retryBtn = document.createElement("button");
                        retryBtn.textContent = "다시 시도";
                        retryBtn.style.cssText = "display:block;margin:8px auto 0;height:24px;padding:0 14px;border:1px solid #0088cc;border-radius:3px;background:transparent;color:#00bfff;font-size:11px;cursor:pointer;";
                        retryBtn.addEventListener("click", () => loadTabContent());
                        fileList.appendChild(retryBtn);
                    }
                }

                renderBookmarkBar();
                const initialLoad = loadTabContent();
                updateSelectCount();
                // 북마크 정리는 메인 콘텐츠(썸네일 등) 로딩이 끝난 뒤, 유휴 시점에 실행해
                // 커넥션을 다투지 않게 한다.
                Promise.resolve(initialLoad).then(() => {
                    const run = () => pruneDeadBookmarks();
                    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 4000 });
                    else setTimeout(run, 1200);
                });
                modal.appendChild(box);
                modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
                document.body.appendChild(modal);
            }

            // ── Initial render ──
            setTimeout(() => {
                updateWidgetVisibility(node);
                renderThumbnails();
                refreshMultiImageLoaderAutoSets(node);
                moveWidgetAfter(node, "batch_select", "scale_method");
            }, 100);

            // ── Handle workflow load ──
            const origOnConfigure = node.onConfigure;
            node.onConfigure = function (data) {
                if (origOnConfigure) origOnConfigure.call(this, data);
                setTimeout(() => {
                    updateWidgetVisibility(node);
                    renderThumbnails();
                    refreshMultiImageLoaderAutoSets(node);
                    moveWidgetAfter(node, "batch_select", "scale_method");
                }, 100);
            };

            return r;
        };
    },
});
