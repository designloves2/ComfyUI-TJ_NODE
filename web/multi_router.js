// multi_router.js — TJ_MultiRouter 프론트엔드 (순수 라우터 버전 - 여백 제거 완료)
// 위치: web/multi_router.js

import { app } from "../../scripts/app.js";

const MAX_PORTS = 20;

const inSlots  = (n) => (n.inputs  || []).filter(s => s.name.startsWith("input_"));
const outSlots = (n) => (n.outputs || []).filter(s => s.name.startsWith("output_"));

function renumber(node) {
    let c = 1;
    for (const s of node.inputs)  if (s.name.startsWith("input_"))  s.name = `input_${c++}`;
    c = 1;
    for (const s of node.outputs) if (s.name.startsWith("output_")) s.name = `output_${c++}`;
}

function syncOutputs(node) {
    const ins = inSlots(node), outs = outSlots(node), need = ins.length;
    for (let i = outs.length; i < need; i++) node.addOutput(`output_${i + 1}`, "*");
    let cur = outSlots(node);
    for (let i = cur.length - 1; i >= need; i--) {
        const ri = node.outputs.indexOf(cur[i]);
        if (ri === -1) continue;
        const sl = node.outputs[ri];
        if (sl.links?.length) [...sl.links].forEach(lid => node.graph?.removeLink(lid));
        node.removeOutput(ri);
    }
    outSlots(node).forEach((s, i) => { s.name = `output_${i + 1}`; });
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

// ★ 하단 여백 제거 패치: 현재 크기 유지(Math.max)를 빼고, 계산된 최적의 크기로 강제 고정!
function applyNodeSize(node) {
    const computed = node.computeSize();
    node.size[0] = Math.max(node.size[0], computed[0]); // 가로는 유저가 늘린 크기 유지
    node.size[1] = computed[1]; // 세로는 빈 공간 없이 타이트하게 딱 맞춤!
}

function refreshSlots(node) {
    if (!node.graph) return;
    const ins = inSlots(node), outs = outSlots(node);

    ins.forEach((inp, i) => {
        let label = inp.name;
        if (inp.link != null) {
            const link = node.graph.links?.[inp.link];
            if (link) {
                const src = node.graph.getNodeById(link.origin_id);
                const srcOut = src?.outputs?.[link.origin_slot];
                if (srcOut?.type && srcOut.type !== "*") label = srcOut.type;
                else label = src?.title || src?.type || inp.name;
            }
        }
        
        inp.label = label;
        if (outs[i]) outs[i].label = label;

        const color = resolveColor(node, inp);
        inp.color_on = color; inp.color_off = color;
        if (outs[i]) { outs[i].color_on = color; outs[i].color_off = color; }
    });

    node.setDirtyCanvas(true, false);
    applyNodeSize(node);
}

function updateWidgetVis(node) {
    const modeW = node.widgets?.find(w => w.name === "mode");
    const numW  = node.widgets?.find(w => w.name === "num_ports");
    if (!numW) return;
    if (modeW?.value === "Dynamic (Auto)") {
        numW.type = "hidden"; numW.computeSize = () => [0, -4]; // 숨김 처리 시 여백도 제거
    } else {
        numW.type = "number"; numW.computeSize = null;
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
    for (let i = ins.length; i < count; i++) node.addInput(`input_${i + 1}`, "*");
    const cur = inSlots(node);
    for (let i = cur.length - 1; i >= count; i--) {
        const sl = cur[i], ri = node.inputs.indexOf(sl);
        if (sl.link != null) node.graph?.removeLink(sl.link);
        node.removeInput(ri);
    }
    renumber(node); syncOutputs(node); node.setDirtyCanvas(true, true);
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
    renumber(node); syncOutputs(node);
}

function detectSlotAt(node, cx, cy) {
    for (const [arr, isIn] of [[inSlots(node), true], [outSlots(node), false]]) {
        for (let i = 0; i < arr.length; i++) {
            const ri = isIn ? node.inputs.indexOf(arr[i]) : node.outputs.indexOf(arr[i]);
            const p = node.getConnectionPos(isIn, ri);
            if (p && Math.abs(cy - p[1]) < 14 && cx >= node.pos[0] - 15 && cx <= node.pos[0] + node.size[0] + 15) return i;
        }
    }
    return -1;
}

function installSlotMenu(node) {
    const origGSIP = node.getSlotInPosition?.bind(node);
    node.getSlotInPosition = function(cx, cy) {
        const slot = origGSIP ? origGSIP(cx, cy) : null;
        if (slot) return slot;
        const idx = detectSlotAt(this, cx, cy);
        if (idx >= 0) return { _tj: true, _idx: idx, output: { type: `Slot ${idx + 1}` } };
        return null;
    };
    const origGSMO = node.getSlotMenuOptions?.bind(node);
    node.getSlotMenuOptions = function(slot) {
        if (!slot?._tj) return origGSMO ? origGSMO(slot) : null;
        const idx = slot._idx, ins = inSlots(this), items = [];
        if (idx > 0) items.push({ content: "⬆ Move Up", callback: () => {
            this.graph.beforeChange(); swapPair(this, idx, idx-1); this.graph.afterChange(); refreshSlots(this); this.setDirtyCanvas(true,true);
        }});
        if (idx < ins.length-1) items.push({ content: "⬇ Move Down", callback: () => {
            this.graph.beforeChange(); swapPair(this, idx, idx+1); this.graph.afterChange(); refreshSlots(this); this.setDirtyCanvas(true,true);
        }});
        items.push(null);
        items.push({ content: "✕ Remove Slot", callback: () => {
            this.graph.beforeChange();
            const sl = ins[idx], ri = this.inputs.indexOf(sl);
            if (sl.link != null) this.graph.removeLink(sl.link);
            this.removeInput(ri); renumber(this); syncOutputs(this);
            if (this.widgets?.find(w => w.name === "mode")?.value === "Manual") {
                const nw = this.widgets.find(w => w.name === "num_ports");
                if (nw) nw.value = Math.max(1, inSlots(this).length);
            }
            this.graph.afterChange(); refreshSlots(this); this.setDirtyCanvas(true,true);
        }});
        items.push(null);
        if (ins.length >= 2) items.push({ content: "↕ Reorder Slots...", callback: () => openReorderModal(this) });
        return items;
    };
}

function installDrag(node) {
    let dragging = false, dragIdx = -1;
    const omd = node.onMouseDown;
    node.onMouseDown = function(e, lp, c) {
        if (omd) { const r = omd.apply(this, arguments); if (r === true) return true; }
        if (!e.shiftKey) return false;
        const idx = detectSlotAt(this, this.pos[0]+lp[0], this.pos[1]+lp[1]);
        if (idx === -1 || inSlots(this).length < 2) return false;
        dragging = true; dragIdx = idx; e.preventDefault(); e.stopPropagation(); return true;
    };
    const omm = node.onMouseMove;
    node.onMouseMove = function(e, lp) {
        if (omm) omm.apply(this, arguments);
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
    const odf = node.onDrawForeground;
    node.onDrawForeground = function(ctx) {
        if (odf) odf.apply(this, arguments);
        if (!dragging || dragIdx < 0) return;
        const ins = inSlots(this); if (dragIdx >= ins.length) return;
        const p = this.getConnectionPos(true, this.inputs.indexOf(ins[dragIdx]));
        if (!p) return;
        const ly = p[1]-this.pos[1];
        ctx.save(); ctx.fillStyle = "rgba(100,150,255,0.15)"; ctx.fillRect(0,ly-10,this.size[0],20);
        ctx.strokeStyle = "rgba(100,150,255,0.6)"; ctx.lineWidth = 1; ctx.strokeRect(0,ly-10,this.size[0],20); ctx.restore();
    };
}

function openReorderModal(node) {
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
        node.graph.beforeChange(); const ni=node.inputs.filter(s=>!s.name.startsWith("input_")); node.inputs=[...ni,...order.map(i=>ins[i])];
        renumber(node);syncOutputs(node);node.graph.afterChange();refreshSlots(node);node.setDirtyCanvas(true,true);md.remove();ov.remove();
    }));
    md.appendChild(br); ov.onclick=()=>{md.remove();ov.remove();}; document.body.appendChild(ov); document.body.appendChild(md);
}

// ─────────────────────────────────────────────────────────────
// 메인 확장 (TJ_MultiRouter)
// ─────────────────────────────────────────────────────────────
app.registerExtension({
    name: "TJ.MultiRouter",
    nodeCreated(node) {
        if (node.comfyClass !== "TJ_MultiRouter") return;
		
		node.bgcolor = "#000000";
		node.color = "#7612DA";
		node.title_text_color = "#FFFFFF";

        const gm = () => node.widgets?.find(w => w.name === "mode");
        const gn = () => node.widgets?.find(w => w.name === "num_ports");

        setTimeout(() => {
            if (inSlots(node).length === 0) {
                const m = gm(); if (m) m.value = "Dynamic (Auto)";
                node.addInput("input_1", "*"); syncOutputs(node);
            } else { syncOutputs(node); }
            updateWidgetVis(node); refreshSlots(node);
            applyNodeSize(node); // 노드 생성 시 딱 맞게 조절
        }, 0);

        setTimeout(() => {
            const m = gm(); if (!m || m._tj) return; m._tj = true;
            const o = m.callback; m.callback = function(v) { if(o) o.call(this,v);
                if (v === "Manual") { const n = gn(); if (n) n.value = Math.max(1, inSlots(node).length); }
                else maybeGrow(node);
                updateWidgetVis(node); refreshSlots(node); };
        }, 10);

        setTimeout(() => {
            const n = gn(); if (!n || n._tj) return; n._tj = true;
            const o = n.callback; n.callback = function(v) { if(o) o.call(this,v);
                if (gm()?.value === "Manual") { applyManual(node, v); refreshSlots(node); } };
        }, 10);

        const oc = node.onConnectionsChange;
        node.onConnectionsChange = function(type) {
            if (oc) oc.apply(this, arguments);
            if (type === 1) { maybeGrow(node); setTimeout(() => refreshSlots(node), 50); }
        };

        installSlotMenu(node);
        installDrag(node);

        const om = node.getExtraMenuOptions;
        node.getExtraMenuOptions = function(c, opts) {
            if (om) om.apply(this, arguments);
            if (inSlots(this).length >= 2) { opts.push(null); opts.push({ content: "↕ Reorder Slots...", callback: () => openReorderModal(this) }); }
        };
    },
});