// web/tj_box_resize.js
// Shared by the reference-library and LLM nodes: user-set text-box heights (remembered in the node's
// properties) and layout changes that keep the node size the user dragged.

import { app } from "../../scripts/app.js";

// Run a layout change (showing / hiding widgets) and move the node height by exactly the change in
// the height it needs, so a size the user dragged is kept instead of snapping to the minimum.
// opts.keepSize: apply the change only (a loaded workflow already carries the matching size).
export function applyLayout(node, change, opts) {
    const before = node.computeSize()[1];
    change();
    if (opts && opts.keepSize === true) return;
    const after = node.computeSize()[1];
    node.setSize([node.size[0], node._tjFit ? after : Math.max(after, node.size[1] + after - before)]);
    app.canvas?.setDirty(true, true);
}

// Keep the node's bottom edge on its last widget: the height always equals what the widgets need,
// whatever the user drags (the width stays free), so no blank margin is left below the last slot.
// Only for nodes whose widgets all have set heights (the text boxes use user-set heights).
export function fitToContent(node) {
    node._tjFit = true;
    const fit = () => {
        const h = node.computeSize()[1];
        if (Math.abs(node.size[1] - h) > 0.5) node.size[1] = h;
    };
    const onResize = node.onResize;
    node.onResize = function () { const r = onResize?.apply(this, arguments); fit(); return r; };
    const onConfigure = node.onConfigure;
    node.onConfigure = function () { const r = onConfigure?.apply(this, arguments); requestAnimationFrame(() => { fit(); app.canvas?.setDirty(true, true); }); return r; };
    requestAnimationFrame(() => { fit(); app.canvas?.setDirty(true, true); });
}

// Drag handle that changes a box height stored in node.properties[key] and grows / shrinks the
// node by the same amount, so the other widgets keep their size.
export function makeGrip(node, key, height, minHeight) {
    const grip = document.createElement("div");
    grip.title = "drag to change the height of this box";
    grip.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startY = e.clientY, startH = height();
        const move = (ev) => {
            const next = Math.max(minHeight, Math.round(startH + (ev.clientY - startY) / (app.canvas?.ds?.scale || 1)));
            const delta = next - height();
            if (!delta) return;
            node.properties[key] = next;
            node.setSize([node.size[0], node.size[1] + delta]);
            app.canvas?.setDirty(true, true);
        };
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    });
    return grip;
}

// ComfyUI's own multiline widget gets a fixed, user-set height and a grip along its bottom edge
// instead of soaking up every extra pixel of the node.
export function resizableMultiline(node, widgetName, key, defaultHeight) {
    const w = node.widgets?.find((x) => x.name === widgetName);
    if (!w) return;
    if (!node.properties) node.properties = {};
    const height = () => Math.max(60, Number(node.properties[key]) || defaultHeight);
    w.computeLayoutSize = () => ({ minHeight: height(), maxHeight: height(), minWidth: 220, maxWidth: 1e6 });
    const grip = makeGrip(node, key, height, 60);
    grip.style.cssText = "position:absolute;left:0;right:0;bottom:0;height:8px;cursor:ns-resize;background:#2a2a2a;border:1px solid #333;border-top:0;border-radius:0 0 4px 4px;z-index:2;";
    let tries = 0;
    const attach = () => {
        const box = w.element?.parentElement;
        if (!box) { if (tries++ < 60) requestAnimationFrame(attach); return; }
        w.element.style.height = "calc(100% - 8px)";
        box.append(grip);
    };
    attach();
}
