// web/multi_router.js — TJ_MultiRouter (아름다운 중앙 팝업창 및 라벨 더블클릭 완벽 지원)

import { app } from "../../scripts/app.js";

const MAX_PORTS = 20;

// ── Widget Hide / Show (백엔드 에러 방지용) ──
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

const inSlots  = (n) => (n.inputs  || []).filter(s => !["mode", "auto_set", "num_ports"].includes(s.name));
const outSlots = (n) => (n.outputs || []);

function renumber(node) {
    inSlots(node).forEach((s, i) => { s.name = `input_${i + 1}`; });
    outSlots(node).forEach((s, i) => { s.name = `output_${i + 1}`; });
}

function syncOutputs(node) {
    const ins = inSlots(node);
    const need = ins.length;
    
    if (!node.outputs) node.outputs = [];

    while (node.outputs.length < need) {
        node.addOutput(`output_${node.outputs.length + 1}`, "*");
    }
    
    while (node.outputs.length > need) {
        const lastIdx = node.outputs.length - 1;
        const sl = node.outputs[lastIdx];
        if (sl && sl.links?.length) {
            [...sl.links].forEach(lid => node.graph?.removeLink(lid));
        }
        node.removeOutput(lastIdx);
    }
    
    renumber(node);
}

function resolveColor(node, inp) {
    if (!node.graph || inp.link == null) return null;
    const link = node.graph.links?.[inp.link];
    if (!link) return null;
    const src = node.graph.getNodeById(link.origin_id);
    const srcOut = src?.outputs?.[link.origin_slot];
    if (!srcOut) return null;
    const t = srcOut.type;
    return srcOut.color_on ?? srcOut.color
        ?? (t && t !== "*" ? (app.canvas?.default_connection_color_byType?.[t]
            ?? LGraphCanvas?.link_type_colors?.[t] ?? null) : null);
}

function applyNodeSize(node) {
    const computed = node.computeSize();
    const slots = Math.max(inSlots(node).length, outSlots(node).length);

    let widgetH = 0;
    for (const w of (node.widgets || [])) {
        let h = LiteGraph.NODE_WIDGET_HEIGHT;
        if (w.computeSize) {
            const sz = w.computeSize(node.size[0]);
            if (Array.isArray(sz)) h = sz[1];
        }
        widgetH += h + 4;
    }

    const minH = LiteGraph.NODE_TITLE_HEIGHT + (slots * LiteGraph.NODE_SLOT_HEIGHT) + widgetH + 12;
    node.size[0] = Math.max(node.size[0], computed[0]);
    node.size[1] = minH; 
}

function refreshSlots(node) {
    if (!node.graph) return;
    const ins = inSlots(node), outs = outSlots(node);
    
    const autoSetWidget = node.widgets?.find(w => w.name === "auto_set");
    const isAutoSet = autoSetWidget ? autoSetWidget.value : true;

    if (node.widgets) {
        node.widgets = node.widgets.filter(w => !w.name || !w.name.startsWith("_set_label_"));
    }

    const existingSets = new Set();
    if (isAutoSet) {
        for (const n of node.graph._nodes) {
            if (!n || n === node) continue;
            // Reserve every visible Set provider name in the workflow, not just TJ_SetNode.
            (n.widgets || []).forEach(w => {
                if ((w.name === "set_name" || w.name === "setnode_name") && String(w.value || "").trim()) {
                    existingSets.add(String(w.value).trim());
                }
            });
            // Eclipse SetNode usually stores its provider name in widgets[0].value.
            if ((n.type === "SetNode" || n.type === "SetNode [Eclipse]") && String(n.widgets?.[0]?.value || "").trim()) {
                existingSets.add(String(n.widgets[0].value).trim());
            }
            if ((n.type === "TJ_MultiRouter" || n.type === "TJ_BatchToMultiOutput" || n.type === "TJ_MultiImageLoader") && n.properties?.auto_sets) {
                const otherAutoSetW = n.widgets?.find(w => w.name === "auto_set");
                if (!otherAutoSetW || otherAutoSetW.value) {
                    Object.values(n.properties.auto_sets).forEach(v => {
                        v = String(v || "").trim();
                        if (v) existingSets.add(v);
                    });
                }
            }
        }
    }

    if (!node.properties) node.properties = {};
    node.properties.auto_sets = {};
    if (!node.properties.custom_labels) node.properties.custom_labels = {};

    ins.forEach((inp, i) => {
        let baseLabel = inp.name; 
        
        if (inp.link == null) {
            if (outs[i]) outs[i].label = `output_${i+1}`;
            inp.color_on = null; inp.color_off = null;
            inp.type = "*"; 
            if (outs[i]) { outs[i].color_on = null; outs[i].color_off = null; }
            return;
        }

        if (node.properties.custom_labels[i]) {
            baseLabel = node.properties.custom_labels[i];
        } 
        else {
            const link = node.graph.links?.[inp.link];
            if (link) {
                const src = node.graph.getNodeById(link.origin_id);
                const srcOut = src?.outputs?.[link.origin_slot];
                if (srcOut?.type && srcOut.type !== "*") baseLabel = srcOut.type;
                else baseLabel = src?.title || src?.type || inp.name;
            }
        }
        
        baseLabel = baseLabel.replace(" ▸", "");
        inp.label = baseLabel; 
        
        let finalName = "";
        if (isAutoSet && baseLabel !== `input_${i+1}`) {
            finalName = baseLabel;
            let tries = 1;
            while (existingSets.has(finalName)) { finalName = `${baseLabel}_${tries++}`; }
            existingSets.add(finalName);
            
            node.properties.auto_sets[i] = finalName;
            if (outs[i]) outs[i].label = finalName + " ▸";
        } else {
            delete node.properties.auto_sets[i]; 
            if (outs[i]) outs[i].label = baseLabel;
        }

        const color = resolveColor(node, inp);
        inp.color_on = color; inp.color_off = color;
        inp.type = outs[i]?.type || "*"; 
        if (outs[i]) { outs[i].color_on = color; outs[i].color_off = color; }
    });

    node.setDirtyCanvas(true, false);
    applyNodeSize(node);

    // ★ 캔버스 전체의 Get 노드들에게 상태 갱신(혹은 자동 재연결) 신호 발송
    setTimeout(() => {
        for (const n of node.graph._nodes) {
            if (n.type === "TJ_GetNode") {
                if (n._syncWithSetNode) n._syncWithSetNode();
                const w = n.widgets?.find(x => x.name === "set_name");
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

function updateWidgetVis(node) {
    const modeW = node.widgets?.find(w => w.name === "mode");
    const numW = node.widgets?.find(w => w.name === "num_ports");
    if (!modeW || !numW) return;

    if (modeW.value === "Dynamic (Auto)") {
        hideWidget(numW); // 배열에서 삭제하지 않고 렌더링만 숨김 (에러 방지)
    } else {
        showWidget(numW);
    }
    
    applyNodeSize(node);
    node.setDirtyCanvas(true, false);
}

function maybeGrow(node) {
    const modeW = node.widgets?.find(w => w.name === "mode");
    if (modeW?.value !== "Dynamic (Auto)") return;
    const ins = inSlots(node);
    if (ins.length === 0) { node.addInput("input_1", "*"); syncOutputs(node); return; }
    if (ins[ins.length - 1].link != null && ins.length < MAX_PORTS) {
        node.addInput(`input_${ins.length + 1}`, "*");
        syncOutputs(node); node.setDirtyCanvas(true, true);
    }
}

function applyManual(node, count) {
    count = Math.max(1, Math.min(count, MAX_PORTS));
    const ins = inSlots(node);
    
    if (count > ins.length) {
        for (let i = ins.length; i < count; i++) {
            node.addInput(`input_${i + 1}`, "*");
        }
    } 
    else if (count < ins.length) {
        for (let i = ins.length - 1; i >= count; i--) {
            const sl = ins[i];
            const ri = node.inputs.indexOf(sl);
            if (sl.link != null) node.graph?.removeLink(sl.link);
            node.removeInput(ri);
            
            if (node.properties?.custom_labels?.[i]) delete node.properties.custom_labels[i];
            if (node.properties?.auto_sets?.[i]) delete node.properties.auto_sets[i];
        }
    }
    
    renumber(node); 
    syncOutputs(node); 
    node.setDirtyCanvas(true, true);
}

function swapPair(node, a, b) {
    const ins = inSlots(node);
    if (a < 0 || b < 0 || a >= ins.length || b >= ins.length) return;
    
    const iA = node.inputs.indexOf(ins[a]);
    const iB = node.inputs.indexOf(ins[b]);
    const linkIA = node.inputs[iA].link;
    const linkIB = node.inputs[iB].link;
    if (linkIA != null) node.graph.links[linkIA].target_slot = iB;
    if (linkIB != null) node.graph.links[linkIB].target_slot = iA;
    [node.inputs[iA], node.inputs[iB]] = [node.inputs[iB], node.inputs[iA]];

    const os = outSlots(node);
    if (os[a] && os[b]) {
        const oA = node.outputs.indexOf(os[a]);
        const oB = node.outputs.indexOf(os[b]);
        if (oA !== -1 && oB !== -1) {
            const linksA = os[a].links ? [...os[a].links] : [];
            const linksB = os[b].links ? [...os[b].links] : [];
            linksA.forEach(id => { const l = node.graph.links[id]; if (l) l.origin_slot = oB; });
            linksB.forEach(id => { const l = node.graph.links[id]; if (l) l.origin_slot = oA; });
            [node.outputs[oA], node.outputs[oB]] = [node.outputs[oB], node.outputs[oA]];
        }
    }

    if (node.properties?.custom_labels) {
        const temp = node.properties.custom_labels[a];
        node.properties.custom_labels[a] = node.properties.custom_labels[b];
        node.properties.custom_labels[b] = temp;
        if (!node.properties.custom_labels[a]) delete node.properties.custom_labels[a];
        if (!node.properties.custom_labels[b]) delete node.properties.custom_labels[b];
    }

    renumber(node); syncOutputs(node);
}

// ────────────────────────────────────────────────────────
// ★ 커스텀 중앙 팝업 다이얼로그 (프롬프트 & 알림창)
// ────────────────────────────────────────────────────────
function showCenterPrompt(title, defaultValue, callback) {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
        display: flex; align-items: center; justify-content: center;
        z-index: 10000; backdrop-filter: blur(3px);
    `;

    const box = document.createElement("div");
    box.style.cssText = `
        background: #1e1e1e; border: 1px solid #444; border-radius: 8px;
        padding: 20px; width: 350px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
        font-family: sans-serif; color: #fff;
    `;

    const titleEl = document.createElement("div");
    titleEl.textContent = title;
    titleEl.style.cssText = "font-size: 14px; font-weight: bold; margin-bottom: 12px; color: #ccc;";

    const inputEl = document.createElement("input");
    inputEl.type = "text";
    inputEl.value = defaultValue;
    inputEl.style.cssText = `
        width: 100%; box-sizing: border-box; padding: 10px; background: #111;
        border: 1px solid #555; border-radius: 4px; color: #fff; font-size: 14px;
        margin-bottom: 20px; outline: none;
    `;
    inputEl.onfocus = () => { inputEl.style.borderColor = "#ff4757"; };
    inputEl.onblur = () => { inputEl.style.borderColor = "#555"; };

    const btnContainer = document.createElement("div");
    btnContainer.style.cssText = "display: flex; justify-content: flex-end; gap: 10px;";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = "padding: 8px 16px; background: #333; color: #fff; border: none; border-radius: 4px; cursor: pointer;";
    cancelBtn.onclick = () => { document.body.removeChild(overlay); };

    const okBtn = document.createElement("button");
    okBtn.textContent = "Apply";
    okBtn.style.cssText = "padding: 8px 16px; background: #ff4757; color: #fff; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;";
    
    const applyValue = () => {
        document.body.removeChild(overlay);
        callback(inputEl.value);
    };
    
    okBtn.onclick = applyValue;
    inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") applyValue(); });

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(okBtn);
    box.appendChild(titleEl);
    box.appendChild(inputEl);
    box.appendChild(btnContainer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    
    setTimeout(() => { inputEl.focus(); inputEl.select(); }, 10);
}

// ── Auto Set OFF 경고를 위한 커스텀 중앙 컨펌창 ──
function showCenterConfirm(message, onConfirm, onCancel) {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7);
        display: flex; align-items: center; justify-content: center;
        z-index: 10000; backdrop-filter: blur(3px);
    `;

    const box = document.createElement("div");
    box.style.cssText = `
        background: #1a1a1a; border: 1px solid #ff4757; border-radius: 8px;
        padding: 24px; width: 420px; box-shadow: 0 10px 40px rgba(0,0,0,0.9);
        font-family: sans-serif; color: #fff; text-align: center;
    `;

    const msgEl = document.createElement("div");
    msgEl.innerHTML = message;
    msgEl.style.cssText = "font-size: 14px; margin-bottom: 24px; line-height: 1.6;";

    const btnContainer = document.createElement("div");
    btnContainer.style.cssText = "display: flex; justify-content: center; gap: 16px;";

    const isKorean = navigator.language.startsWith('ko');

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = isKorean ? "취소" : "Cancel";
    cancelBtn.style.cssText = "padding: 10px 24px; background: #333; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;";
    cancelBtn.onclick = () => { document.body.removeChild(overlay); if(onCancel) onCancel(); };

    const okBtn = document.createElement("button");
    okBtn.textContent = isKorean ? "진행 (OFF)" : "Proceed (OFF)";
    okBtn.style.cssText = "padding: 10px 24px; background: #ff4757; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;";
    
    okBtn.onclick = () => { document.body.removeChild(overlay); if(onConfirm) onConfirm(); };

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(okBtn);
    box.appendChild(msgEl);
    box.appendChild(btnContainer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

function triggerRenamePrompt(node, idx) {
    if (!node.properties) node.properties = {};
    if (!node.properties.custom_labels) node.properties.custom_labels = {};
    
    const realIns = inSlots(node);
    const currentLabel = node.properties.custom_labels[idx] || realIns[idx].label || "";
    
    showCenterPrompt("Enter custom label (Leave blank to reset to Auto):", currentLabel, (newLabel) => {
        if (newLabel.trim() === "") delete node.properties.custom_labels[idx];
        else node.properties.custom_labels[idx] = newLabel.trim();
        refreshSlots(node);
    });
}

export function openReorderModal(node) {
    document.getElementById("tj-reorder-modal")?.remove();
    document.getElementById("tj-reorder-overlay")?.remove();
    const ins = inSlots(node); if (ins.length < 2) return;
    let order = ins.map((_,i)=>i), dragSrc = null;

    const ov = document.createElement("div"); ov.id = "tj-reorder-overlay";
    Object.assign(ov.style, {position:"fixed",inset:"0",zIndex:"99998",background:"rgba(0,0,0,0.3)"});
    const md = document.createElement("div"); md.id = "tj-reorder-modal";
    Object.assign(md.style, {position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"#1a1a2e",border:"1px solid #4a4a8a",borderRadius:"8px",padding:"16px",zIndex:"99999",minWidth:"300px",maxHeight:"70vh",overflow:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.6)",fontFamily:"monospace",color:"#e0e0ff",userSelect:"none"});
    const ti = document.createElement("div"); ti.textContent = "↕ Reorder Slots"; Object.assign(ti.style,{fontSize:"13px",fontWeight:"bold",marginBottom:"10px",color:"#a0a0ff",borderBottom:"1px solid #3a3a6a",paddingBottom:"6px"}); md.appendChild(ti);
    const ls = document.createElement("div"); Object.assign(ls.style,{display:"flex",flexDirection:"column",gap:"4px"});

    const render = () => {
        ls.innerHTML = "";
        order.forEach((oi,di) => {
            const sl = ins[oi], color = sl.color_on ?? null;
            const it = document.createElement("div"); it.draggable = true;
            Object.assign(it.style,{display:"flex",alignItems:"center",gap:"8px",padding:"6px 8px",background:"#2a2a4e",border:"1px solid #3a3a6a",borderRadius:"4px",cursor:"grab",fontSize:"12px"});
            const h = document.createElement("span"); h.textContent="⠿"; h.style.color="#6060a0"; it.appendChild(h);
            if (color) { const d = document.createElement("span"); d.textContent="●"; d.style.color=color; d.style.fontSize="9px"; it.appendChild(d); }
            const lb = document.createElement("span"); lb.style.flex="1"; lb.textContent = sl.label && sl.label !== sl.name ? `${sl.name} (${sl.label})` : sl.name; if(color) lb.style.color=color; it.appendChild(lb);
            const mb = (t,dis,cb) => { const b=document.createElement("button"); b.textContent=t; b.disabled=dis; Object.assign(b.style,{background:"none",border:"1px solid #4a4a7a",borderRadius:"3px",color:dis?"#404060":"#8080c0",cursor:dis?"default":"pointer",fontSize:"10px",padding:"1px 5px"}); if(!dis){b.onmouseover=()=>b.style.color="#c0c0ff";b.onmouseout=()=>b.style.color="#8080c0";b.onclick=cb;} return b; };
            it.appendChild(mb("▲",di===0,()=>{[order[di],order[di-1]]=[order[di-1],order[di]];render();}));
            it.appendChild(mb("▼",di===order.length-1,()=>{[order[di],order[di+1]]=[order[di+1],order[di]];render();}));
            it.addEventListener("dragstart",e=>{dragSrc=di;e.dataTransfer.effectAllowed="move";setTimeout(()=>it.style.opacity="0.4",0);});
            it.addEventListener("dragend",()=>it.style.opacity="1");
            it.addEventListener("dragover",e=>{e.preventDefault();it.style.background="#3a3a6e";});
            it.addEventListener("dragleave",()=>it.style.background="#2a2a4e");
            it.addEventListener("drop",e=>{e.preventDefault();it.style.background="#2a2a4e";if(dragSrc===null||dragSrc===di)return;const m=order.splice(dragSrc,1)[0];order.splice(di,0,m);dragSrc=null;render();});
            ls.appendChild(it);
        });
    };
    render(); md.appendChild(ls);
    const br = document.createElement("div"); Object.assign(br.style,{display:"flex",justifyContent:"flex-end",gap:"8px",marginTop:"12px"});
    const ab=(t,bg,hv,cb)=>{const b=document.createElement("button");b.textContent=t;Object.assign(b.style,{background:bg,border:"none",borderRadius:"4px",color:"#e0e0ff",cursor:"pointer",fontSize:"12px",padding:"5px 14px",fontFamily:"monospace"});b.onmouseover=()=>b.style.background=hv;b.onmouseout=()=>b.style.background=bg;b.onclick=cb;return b;};
    br.appendChild(ab("Cancel","#4a3a3a","#6a4a4a",()=>{md.remove();ov.remove();}));
    br.appendChild(ab("Apply","#4a7a4a","#5a9a5a",()=>{
        node.graph.beforeChange(); const ni=node.inputs.filter(s=>!["mode", "auto_set", "num_ports"].includes(s.name)); node.inputs=[...ni,...order.map(i=>ins[i])];
        renumber(node);syncOutputs(node);node.graph.afterChange();refreshSlots(node);node.setDirtyCanvas(true,true);md.remove();ov.remove();
    }));
    md.appendChild(br); ov.onclick=()=>{md.remove();ov.remove();}; document.body.appendChild(ov); document.body.appendChild(md);
}

function installCustomEvents(node) {
    const origGetSlotMenuOptions = node.getSlotMenuOptions;
    node.getSlotMenuOptions = function(slot_info) {
        let menu = origGetSlotMenuOptions ? origGetSlotMenuOptions.apply(this, arguments) || [] : [];
        menu = menu.filter(m => m && m.content !== "Rename Slot");

        if (slot_info && slot_info.input) {
            const realIns = inSlots(this);
            const idx = realIns.indexOf(slot_info.input);
            if (idx !== -1) {
                menu.unshift(
                    {
                        content: "✏️ Rename Custom Label",
                        callback: () => triggerRenamePrompt(this, idx)
                    },
                    null
                );

                if (idx > 0) menu.push({ content: "⬆ Move Up", callback: () => {
                    this.graph.beforeChange(); swapPair(this, idx, idx-1); this.graph.afterChange(); refreshSlots(this);
                }});
                if (idx < realIns.length - 1) menu.push({ content: "⬇ Move Down", callback: () => {
                    this.graph.beforeChange(); swapPair(this, idx, idx+1); this.graph.afterChange(); refreshSlots(this);
                }});
                menu.push(null, { content: "✕ Remove Slot", callback: () => {
                    this.graph.beforeChange();
                    const ri = this.inputs.indexOf(realIns[idx]);
                    if (this.inputs[ri].link != null) this.graph.removeLink(this.inputs[ri].link);
                    this.removeInput(ri);
                    
                    if (this.properties?.custom_labels) {
                        for (let i = idx; i < realIns.length; i++) {
                            this.properties.custom_labels[i] = this.properties.custom_labels[i + 1];
                        }
                        delete this.properties.custom_labels[realIns.length];
                    }
                    renumber(this); syncOutputs(this);
                    
                    // 위젯이 필터링 삭제되지 않고 숨겨진 상태이므로 값을 안전하게 변경
                    const nw = this.widgets?.find(w => w.name === "num_ports");
                    if (nw && this.widgets?.find(w => w.name === "mode")?.value === "Manual") {
                        nw.value = Math.max(1, inSlots(this).length);
                    }
                    this.graph.afterChange(); refreshSlots(this);
                }});
            }
        }
        return menu;
    };

    let lastClickTime = 0;
    const omd = node.onMouseDown;
    node.onMouseDown = function(e, lp, c) {
        if (omd) { const r = omd.apply(this, arguments); if (r === true) return true; }
        
        const now = Date.now();
        const isDblClick = (now - lastClickTime < 300);
        lastClickTime = now;

        const cy = this.pos[1]+lp[1], cx = this.pos[0]+lp[0];
        
        if (isDblClick) {
            const realIns = inSlots(this);
            for (let i = 0; i < realIns.length; i++) {
                const ri = this.inputs.indexOf(realIns[i]);
                const p = this.getConnectionPos(true, ri);
                if (p && Math.abs(cy - p[1]) < 14 && cx >= this.pos[0] && cx <= this.pos[0] + 150) {
                    triggerRenamePrompt(this, i);
                    return true;
                }
            }
        }

        if (!e.shiftKey) return false;
        
        let idx = -1;
        for (const [arr, isIn] of [[inSlots(this), true], [outSlots(this), false]]) {
            for (let i = 0; i < arr.length; i++) {
                const ri = isIn ? this.inputs.indexOf(arr[i]) : this.outputs.indexOf(arr[i]);
                const p = this.getConnectionPos(isIn, ri);
                if (p && Math.abs(cy - p[1]) < 14 && cx >= this.pos[0] - 15 && cx <= this.pos[0] + this.size[0] + 15) { idx = i; break; }
            }
        }
        if (idx === -1 || inSlots(this).length < 2) return false;
        dragging = true; dragIdx = idx; e.preventDefault(); e.stopPropagation(); return true;
    };
    
    let dragging = false, dragIdx = -1;
    const ommDrag = node.onMouseMove;
    node.onMouseMove = function(e, lp) {
        if (ommDrag) ommDrag.apply(this, arguments);
        if (!dragging) return;
        const cy = this.pos[1]+lp[1], ins = inSlots(this);
        let cl = -1, mn = Infinity;
        for (let i = 0; i < ins.length; i++) {
            const p = this.getConnectionPos(true, this.inputs.indexOf(ins[i]));
            if (p) { const d = Math.abs(cy-p[1]); if (d < mn) { mn = d; cl = i; } }
        }
        if (cl !== -1 && cl !== dragIdx) {
            this.graph.beforeChange(); swapPair(this, dragIdx, cl); dragIdx = cl;
            this.graph.afterChange(); refreshSlots(this);
        }
        this.setDirtyCanvas(true, false);
    };
    
    const omu = node.onMouseUp;
    node.onMouseUp = function(e) {
        if (omu) omu.apply(this, arguments);
        if (dragging) { dragging = false; dragIdx = -1; refreshSlots(this); this.setDirtyCanvas(true,true); }
    };

    let hoverSlotIdx = -1;
    let hoverTimer = null;
    let showTooltipIdx = -1;

    const ommTip = node.onMouseMove;
    node.onMouseMove = function(e, lp) {
        if (ommTip) ommTip.apply(this, arguments);
        const cy = this.pos[1] + lp[1];
        const cx = this.pos[0] + lp[0];

        let foundIdx = -1;
        const outs = outSlots(this);
        for (let i = 0; i < outs.length; i++) {
            if (!this.properties?.auto_sets?.[i]) continue;
            
            const p = this.getConnectionPos(false, this.outputs.indexOf(outs[i]));
            if (p && Math.abs(cy - p[1]) < 12 && cx >= p[0] - 15 && cx <= p[0] + 15) {
                foundIdx = i; break;
            }
        }

        if (foundIdx !== hoverSlotIdx) {
            hoverSlotIdx = foundIdx;
            showTooltipIdx = -1;
            clearTimeout(hoverTimer);
            if (foundIdx !== -1) {
                hoverTimer = setTimeout(() => {
                    showTooltipIdx = foundIdx;
                    app.canvas?.setDirty(true, true);
                }, 1000); 
            }
            app.canvas?.setDirty(true, true);
        }
    };

    const oml = node.onMouseLeave;
    node.onMouseLeave = function(e) {
        if (oml) oml.apply(this, arguments);
        hoverSlotIdx = -1; showTooltipIdx = -1; clearTimeout(hoverTimer);
        app.canvas?.setDirty(true, true);
    };

    const odf = node.onDrawForeground;
    node.onDrawForeground = function(ctx) {
        if (odf) odf.apply(this, arguments);
        if (showTooltipIdx !== -1 && this.properties?.auto_sets?.[showTooltipIdx]) {
            const autoSetW = this.widgets?.find(w => w.name === "auto_set");
            if (!autoSetW || autoSetW.value) {
                const p = this.getConnectionPos(false, this.outputs.indexOf(outSlots(this)[showTooltipIdx]));
                if (p) {
                    const text = "Auto Set: " + this.properties.auto_sets[showTooltipIdx];
                    ctx.save();
                    ctx.font = "bold 12px sans-serif";
                    const w = ctx.measureText(text).width;
                    const lx = p[0] - this.pos[0] + 12;
                    const ly = p[1] - this.pos[1] - 8;
                    
                    ctx.fillStyle = "rgba(0,0,0,0.85)";
                    ctx.fillRect(lx, ly - 14, w + 16, 22);
                    ctx.strokeStyle = "#ff4757";
                    ctx.strokeRect(lx, ly - 14, w + 16, 22);
                    
                    ctx.fillStyle = "#fff";
                    ctx.fillText(text, lx + 8, ly + 2);
                    ctx.restore();
                }
            }
        }
    };
}

app.registerExtension({
    name: "TJ.MultiRouter.Core",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "TJ_MultiRouter") {
            
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);

                this.bgcolor = "#000000";
                this.color = "#7612DA";
                this.title_text_color = "#FFFFFF";

                const modeW = this.widgets?.find(w => w.name === "mode");
                if (modeW) {
                    const origModeCb = modeW.callback;
                    modeW.callback = (v) => {
                        if (origModeCb) origModeCb.call(modeW, v);
                        if (v === "Manual") {
                            const activeLinksCount = inSlots(this).length;
                            const numW = this.widgets?.find(w => w.name === "num_ports");
                            if (numW) {
                                numW.value = Math.max(1, activeLinksCount);
                                applyManual(this, numW.value);
                            }
                        } else {
                            maybeGrow(this);
                        }
                        updateWidgetVis(this);
                        refreshSlots(this);
                    };
                }

                const numW = this.widgets?.find(w => w.name === "num_ports");
                if (numW) {
                    const origNumCb = numW.callback;
                    numW.callback = (v) => {
                        if (origNumCb) origNumCb.call(numW, v);
                        const m = this.widgets?.find(w => w.name === "mode")?.value;
                        if (m === "Manual") {
                            const intVal = Math.floor(v);
                            numW.value = intVal;
                            applyManual(this, intVal);
                            refreshSlots(this);
                        }
                    };
                }

                // ★ Auto Set 스위치 끄기(OFF) 시 경고 및 링크 파괴 로직 (중앙 커스텀 팝업 & 다국어)
                const autoW = this.widgets?.find(w => w.name === "auto_set");
                if (autoW) {
                    const origAutoCb = autoW.callback;
                    autoW.callback = (v) => {
                        if (v === false) { 
                            let hasGetConnections = false;
                            const outs = outSlots(this);
                            for (const out of outs) {
                                if (out.links && out.links.length > 0) {
                                    for (const lid of out.links) {
                                        const l = this.graph.links[lid] || (this.graph.links.get && this.graph.links.get(lid));
                                        if (l) {
                                            const target = this.graph.getNodeById(l.target_id);
                                            if (target && (target.type === "TJ_GetNode" || target.type === "TJ_MultiGetNode")) {
                                                hasGetConnections = true;
                                                break;
                                            }
                                        }
                                    }
                                }
                                if(hasGetConnections) break;
                            }

                            if (hasGetConnections) {
                                const isKorean = navigator.language.startsWith('ko');
                                const msg = isKorean 
                                    ? "<b>⚠️ 경고! (Warning)</b><br><br>Auto Set 옵션을 [OFF]로 변경하면 현재 이 노드에서 데이터를 받고 있는 <b>모든 Get/Multi Get 노드의 연결이 즉시 해제(끊어짐)됩니다.</b><br><br>진행하시겠습니까?<br><br><span style='color:#aaa; font-size:12px;'>(나중에 다시 ON으로 켜면 잃어버린 노드들을 찾아 자동으로 재연결해 줍니다.)</span>"
                                    : "<b>⚠️ Warning!</b><br><br>Turning [OFF] the Auto Set option will <b>immediately disconnect all Get/Multi Get nodes</b> currently receiving data from this node.<br><br>Do you want to proceed?<br><br><span style='color:#aaa; font-size:12px;'>(If you turn it back ON later, it will automatically find and reconnect the lost nodes.)</span>";

                                showCenterConfirm(msg, 
                                    () => { // 진행(Proceed) 버튼 클릭 시
                                        this.graph.beforeChange();
                                        outs.forEach(out => {
                                            if (out.links) {
                                                const linksToRemove = [];
                                                out.links.forEach(lid => {
                                                    const l = this.graph.links[lid] || (this.graph.links.get && this.graph.links.get(lid));
                                                    if (l) {
                                                        const target = this.graph.getNodeById(l.target_id);
                                                        if (target && (target.type === "TJ_GetNode" || target.type === "TJ_MultiGetNode")) {
                                                            linksToRemove.push(lid);
                                                        }
                                                    }
                                                });
                                                linksToRemove.forEach(lid => this.graph.removeLink(lid));
                                            }
                                        });
                                        this.graph.afterChange();
                                        if (origAutoCb) origAutoCb.call(autoW, false);
                                        refreshSlots(this);
                                    },
                                    () => { // 취소(Cancel) 버튼 클릭 시
                                        autoW.value = true; // 스위치 원상복구
                                        app.canvas?.setDirty(true, false);
                                    }
                                );
                                return; // 모달 응답을 기다리기 위해 여기서 실행 중지
                            } else {
                                // Get 노드 연결이 없으면 바로 진행
                                if (origAutoCb) origAutoCb.call(autoW, false);
                                refreshSlots(this);
                            }
                        } else {
                            // ON으로 켰을 때
                            if (origAutoCb) origAutoCb.call(autoW, true);
                            refreshSlots(this);
                        }
                    };
                }

                const oc = this.onConnectionsChange;
                this.onConnectionsChange = function(type) {
                    if (oc) oc.apply(this, arguments);
                    if (type === 1) { 
                        maybeGrow(this); 
                        setTimeout(() => refreshSlots(this), 50); 
                    }
                };

                installCustomEvents(this);

                Object.defineProperty(this, "_tj_submenu_options", {
                    get: function() {
                        const opts = [];
                        const activeOuts = [];
                        const outs = outSlots(this);
                        outs.forEach((out, i) => {
                            if (out.links && out.links.length > 0) {
                                out.links.forEach(lid => {
                                    const l = this.graph.links[lid] || (this.graph.links.get && this.graph.links.get(lid));
                                    if (l) {
                                        const targetNode = this.graph.getNodeById(l.target_id);
                                        if (targetNode) {
                                            activeOuts.push({
                                                content: `🚀 Go to [Port ${i+1}] Get Node`,
                                                callback: () => {
                                                    app.canvas.centerOnNode(targetNode);
                                                    app.canvas.selectNode(targetNode);
                                                }
                                            });
                                        }
                                    }
                                });
                            }
                        });
                        if (activeOuts.length > 0) {
                            opts.push({ content: "🚀 Go to Get Nodes...", has_submenu: true, submenu: { options: activeOuts } });
                        }
                        if (inSlots(this).length >= 2) {
                            opts.push({ content: "↕ Reorder Slots...", callback: () => openReorderModal(this) });
                        }
                        return opts;
                    }
                });

                requestAnimationFrame(() => {
                    if (this.widgets) {
                        this.widgets = this.widgets.filter(w => !w.name || !w.name.startsWith("_set_label_"));
                    }
                    if (!this.inputs || inSlots(this).length === 0) {
                        this.addInput("input_1", "*");
                    }
                    syncOutputs(this);
                    updateWidgetVis(this);
                    refreshSlots(this);
                });
            };

            const origOnConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function(data) {
                if (origOnConfigure) origOnConfigure.apply(this, arguments);
                setTimeout(() => {
                    if (this.widgets) {
                        this.widgets = this.widgets.filter(w => !w.name || !w.name.startsWith("_set_label_"));
                    }
                    syncOutputs(this);
                    updateWidgetVis(this);
                    refreshSlots(this);
                }, 100);
            };
        }
    }
});