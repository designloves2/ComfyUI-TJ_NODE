import { app } from "../../scripts/app.js";

/* ============================================================
   Multi Image Loader (TJ) — Frontend
   ============================================================ */

// ── Widget Hide / Show (DazzleNodes 검증 방식) ──
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
    if (widget._origDraw !== undefined) {
        widget.draw = widget._origDraw;
    } else {
        delete widget.draw;
    }
    if (widget._origComputeSize !== undefined) {
        widget.computeSize = widget._origComputeSize;
    } else {
        delete widget.computeSize;
    }
    if (widget._origMouse !== undefined) {
        widget.mouse = widget._origMouse;
    } else {
        delete widget.mouse;
    }
}

function findWidget(node, name) {
    return node.widgets ? node.widgets.find(w => w.name === name) : null;
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

    requestAnimationFrame(() => {
        const sz = node.computeSize();
        node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
        node.setDirtyCanvas(true, true);
    });
}

// ── Helper: get thumbnail src (subfolder 분리) ──
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

    // filename에 "/" 가 있으면 subfolder 분리
    // 예: "download/abc.jpg" → subfolder="download", filename="abc.jpg"
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


// ── Register Extension ──
app.registerExtension({
    name: "tj.multi_image_loader",

    async beforeRegisterNodeDef(nodeType, nodeData, _app) {
        if (nodeData.name !== "TJ_MultiImageLoader") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnNodeCreated ? origOnNodeCreated.apply(this, arguments) : undefined;
            const node = this;

            // ─── Widget callbacks for visibility ───
            const matchModeW = findWidget(node, "match_mode");
            const resizeInputW = findWidget(node, "resize_input");

            if (matchModeW) {
                const origCb1 = matchModeW.callback;
                matchModeW.callback = function (v) {
                    if (origCb1) origCb1.call(this, v);
                    updateWidgetVisibility(node);
                };
            }
            if (resizeInputW) {
                const origCb2 = resizeInputW.callback;
                resizeInputW.callback = function (v) {
                    if (origCb2) origCb2.call(this, v);
                    updateWidgetVisibility(node);
                };
            }

            // ─── DOM UI Widget (serialize: false) ───
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

            // ── Add Images → Modal File Picker (멀티 선택 + 확인) ──
            addBtn.addEventListener("click", () => openFilePicker());

            function openFilePicker() {
                const modal = document.createElement("div");
                modal.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);z-index:99998;display:flex;align-items:center;justify-content:center;";

                const box = document.createElement("div");
                box.style.cssText = "background:#000;border:1px solid #0055bb;border-radius:8px;width:560px;height:600px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 0 20px #0055bb44;";

                const selectedPaths = new Set();

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

                const fileList = document.createElement("div");
                fileList.style.cssText = "flex:1;overflow-y:auto;padding:8px;background:#000;";

                tabNames.forEach((t, i) => {
                    const tabEl = document.createElement("div");
                    tabEl.textContent = tabLabels[i];
                    tabEl.style.cssText = "flex:1;text-align:center;padding:8px;color:#0055bb;font-size:12px;cursor:pointer;border-bottom:2px solid transparent;background:#000;";
                    tabEl.addEventListener("click", () => {
                        activeTab = t;
                        tabsEl.querySelectorAll("div").forEach(d => { d.style.color = "#aaa"; d.style.borderBottomColor = "transparent"; });
                        tabEl.style.color = "#00efff";
                        tabEl.style.borderBottomColor = "#0055bb";
                        loadTabContent();
                    });
                    if (t === activeTab) { tabEl.style.color = "#fff"; tabEl.style.borderBottomColor = "#58f"; }
                    tabsEl.appendChild(tabEl);
                });
                box.appendChild(tabsEl);
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
                const confirmBtn = document.createElement("button");
                confirmBtn.textContent = "Add Selected";
                confirmBtn.style.cssText = "height:30px;padding:0 16px;border:none;border-radius:4px;background:#cc1133;color:#fff;font-size:12px;cursor:pointer;font-weight:bold;box-shadow:0 0 8px #ff224488;";
                confirmBtn.addEventListener("click", () => {
                    selectedPaths.forEach(path => addPathToList(path));
                    renderThumbnails();
                    modal.remove();
                });
                btnGroup.appendChild(cancelBtn);
                btnGroup.appendChild(confirmBtn);
                footer.appendChild(selectCount);
                footer.appendChild(btnGroup);
                box.appendChild(footer);

                function updateSelectCount() {
                    selectCount.textContent = `${selectedPaths.size} selected`;
                    confirmBtn.textContent = selectedPaths.size > 0 ? `Add ${selectedPaths.size} Images` : "Add Selected";
                }

                async function loadTabContent() {
                    fileList.innerHTML = "";

                    if (activeTab === "upload") {
                        const uploadArea = document.createElement("div");
                        uploadArea.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:180px;border:2px dashed #555;border-radius:8px;margin:10px;padding:20px;color:#888;font-size:13px;cursor:pointer;";
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

                        async function doUpload(files) {
                            uploadArea.textContent = "Uploading...";
                            for (const file of files) {
                                const fd = new FormData();
                                fd.append("file", file, file.name);
                                try {
                                    const resp = await fetch("/tj_node/upload_local", { method: "POST", body: fd });
                                    const data = await resp.json();
                                    if (data.success) addPathToList(data.path);
                                } catch (e) { console.error("Upload failed:", e); }
                            }
                            renderThumbnails();
                            uploadArea.textContent = "Upload complete! Click or drag more files.";
                        }

                        fileList.appendChild(uploadArea);
                        fileList.appendChild(fileInput);
                        return;
                    }

                    fileList.innerHTML = '<div style="color:#888;font-size:12px;padding:20px;text-align:center;">Loading...</div>';
                    try {
                        const resp = await fetch("/tj_node/list_dir_files", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ dir_type: activeTab }),
                        });
                        const data = await resp.json();
                        fileList.innerHTML = "";

                        if (!data.files || data.files.length === 0) {
                            fileList.innerHTML = '<div style="color:#666;font-size:12px;padding:20px;text-align:center;">No images found</div>';
                            return;
                        }

                        // Select All / Deselect All
                        const selectBar = document.createElement("div");
                        selectBar.style.cssText = "display:flex;gap:8px;margin-bottom:6px;";
                        const selectAllBtn = document.createElement("button");
                        selectAllBtn.textContent = "Select All";
                        selectAllBtn.style.cssText = "height:22px;padding:0 10px;border:1px solid #ffffff;border-radius:3px;background:transparent;color:#ffffff;font-size:11px;cursor:pointer;";
                        const deselectAllBtn = document.createElement("button");
                        deselectAllBtn.textContent = "Deselect All";
                        deselectAllBtn.style.cssText = "height:22px;padding:0 10px;border:1px solid #ffffff;border-radius:3px;background:transparent;color:#ffffff;font-size:11px;cursor:pointer;";
                        selectBar.appendChild(selectAllBtn);
                        selectBar.appendChild(deselectAllBtn);
                        fileList.appendChild(selectBar);

                        const pickerGrid = document.createElement("div");
                        pickerGrid.style.cssText = "display:grid;grid-template-columns:repeat(5, 90px);grid-auto-rows:110px;gap:6px;";

                        const cellList = [];

                        data.files.forEach(f => {
                            const cell = document.createElement("div");
                            cell.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px;border-radius:4px;cursor:pointer;border:2px solid transparent;position:relative;";

                            const checkMark = document.createElement("div");
                            checkMark.style.cssText = "position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,0.5);border:2px solid #555;display:flex;align-items:center;justify-content:center;font-size:12px;color:transparent;z-index:1;pointer-events:none;";
                            checkMark.textContent = "✓";
                            cell.appendChild(checkMark);

                            const thumb = document.createElement("img");
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
                                checkMark.style.background   = sel ? "#ff2244" : "rgba(0,0,0,0.5)";
					 checkMark.style.borderColor  = sel ? "#ff2244" : "#555";
					 checkMark.style.color        = sel ? "#fff"    : "transparent";
                            }

                            cell.addEventListener("click", () => {
                                if (selectedPaths.has(f.path)) { selectedPaths.delete(f.path); }
                                else { selectedPaths.add(f.path); }
                                updateCellVisual();
                                updateSelectCount();
                            });

                            updateCellVisual();
                            cellList.push({ path: f.path, updateVisual: updateCellVisual });
                            pickerGrid.appendChild(cell);
                        });

                        selectAllBtn.addEventListener("click", () => {
                            data.files.forEach(f => selectedPaths.add(f.path));
                            cellList.forEach(c => c.updateVisual());
                            updateSelectCount();
                        });
                        deselectAllBtn.addEventListener("click", () => {
                            data.files.forEach(f => selectedPaths.delete(f.path));
                            cellList.forEach(c => c.updateVisual());
                            updateSelectCount();
                        });

                        fileList.appendChild(pickerGrid);
                    } catch (e) {
                        fileList.innerHTML = `<div style="color:#f66;font-size:12px;padding:20px;text-align:center;">Error: ${e.message}</div>`;
                    }
                }

                loadTabContent();
                modal.appendChild(box);
                modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
                document.body.appendChild(modal);
            }

            // ── Initial render ──
            setTimeout(() => {
                updateWidgetVisibility(node);
                renderThumbnails();
            }, 100);

            // ── Handle workflow load ──
            const origOnConfigure = node.onConfigure;
            node.onConfigure = function (data) {
                if (origOnConfigure) origOnConfigure.call(this, data);
                setTimeout(() => {
                    updateWidgetVisibility(node);
                    renderThumbnails();
                }, 100);
            };

            return r;
        };
    },
});
