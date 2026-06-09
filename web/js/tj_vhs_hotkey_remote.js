import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

// TJ VHS Hotkey Remote
// Target: Kosinkadink ComfyUI-VideoHelperSuite preview widgets
// Install path:
// ComfyUI/custom_nodes/ComfyUI-TJ_NODE/web/js/tj_vhs_hotkey_remote.js

const TJ_VHS_HOTKEYS = {
    togglePause: "Space", // Space
    toggleHide: "KeyH",   // Alt + H
    toggleMute: "KeyM",   // Alt + M
    open: "KeyO",         // Alt + O
    save: "KeyS",         // Alt + S
    copyPath: "KeyC",     // Alt + C
    syncPreview: "KeyY",  // Alt + Y
};

function tjIsTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

function tjGetSelectedNode() {
    const selected = app.canvas?.selected_nodes;
    if (selected && Object.keys(selected).length) {
        return Object.values(selected)[0];
    }
    return app.canvas?.selected_node || null;
}

function tjGetVHSPreview(node) {
    if (!node?.widgets) return null;
    return node.widgets.find(w => w.name === "videopreview") || null;
}

function tjMarkDirty(node) {
    try {
        node?.setDirtyCanvas?.(true, true);
        node?.graph?.setDirtyCanvas?.(true, true);
        app.canvas?.setDirty?.(true, true);
    } catch (err) {
        console.warn("[TJ VHS Hotkey] dirty canvas failed:", err);
    }
}

function tjFitNodeHeight(node) {
    try {
        if (!node) return;
        const size = node.computeSize ? node.computeSize([node.size?.[0] || 320, node.size?.[1] || 200]) : null;
        if (size && node.setSize) {
            node.setSize([node.size?.[0] || size[0], size[1]]);
        }
        tjMarkDirty(node);
    } catch (err) {
        console.warn("[TJ VHS Hotkey] fit height failed:", err);
    }
}

function tjGetPreviewURL(widget) {
    if (!widget) return null;

    const params = widget.value?.params;

    if (widget.videoEl?.hidden === false && widget.videoEl.src) {
        if (params && ["input", "output", "temp"].includes(params.type)) {
            let url = api.apiURL("/view?" + new URLSearchParams(params));
            // VHS uses animated preview sequences; keep the same fallback behavior used by VHS menu handling.
            return url.replace("%2503d", "001");
        }
        return widget.videoEl.src;
    }

    if (widget.imgEl?.hidden === false && widget.imgEl.src) {
        return widget.imgEl.src;
    }

    if (params && ["input", "output", "temp"].includes(params.type)) {
        let url = api.apiURL("/view?" + new URLSearchParams(params));
        return url.replace("%2503d", "001");
    }

    return null;
}

function tjTogglePause(node, widget) {
    if (!widget?.videoEl || widget.videoEl.hidden) return;

    const wasPaused = !!widget.value?.paused;

    if (wasPaused) {
        widget.videoEl.play?.().catch?.(() => {});
    } else {
        widget.videoEl.pause?.();
    }

    widget.value.paused = !wasPaused;
    tjMarkDirty(node);
}

function tjToggleHide(node, widget) {
    if (!widget?.value) return;

    widget.value.hidden = !widget.value.hidden;

    if (widget.parentEl) {
        widget.parentEl.hidden = widget.value.hidden;
    }

    if (widget.value.hidden) {
        widget.videoEl?.pause?.();
    } else if (!widget.value.paused) {
        widget.videoEl?.play?.().catch?.(() => {});
    }

    tjFitNodeHeight(node);
}

function tjToggleMute(node, widget) {
    if (!widget?.value) return;

    widget.value.muted = !widget.value.muted;

    if (widget.videoEl) {
        widget.videoEl.muted = widget.value.muted;
    }

    tjMarkDirty(node);
}

function tjOpenPreview(widget) {
    const url = tjGetPreviewURL(widget);
    if (!url) return;
    window.open(url, "_blank");
}

function tjSavePreview(widget) {
    const url = tjGetPreviewURL(widget);
    if (!url) return;

    const a = document.createElement("a");
    a.href = url;
    a.download = widget.value?.params?.filename || "vhs_preview";
    document.body.append(a);
    a.click();
    requestAnimationFrame(() => a.remove());
}

function tjSyncPreview() {
    // Same behavior as VHS context menu: reset all VHS preview videos/images on the page.
    for (const p of document.getElementsByClassName("vhs_preview")) {
        for (const child of p.children) {
            if (child.tagName === "VIDEO") {
                try { child.currentTime = 0; } catch (_) {}
            } else if (child.tagName === "IMG") {
                child.src = child.src;
            }
        }
    }
    app.canvas?.setDirty?.(true, true);
}

async function tjCopyPath(widget) {
    const fullpath = widget.value?.params?.fullpath;
    if (!fullpath) return;

    try {
        await navigator.clipboard.writeText(fullpath);
        console.log("[TJ VHS Hotkey] copied:", fullpath);
    } catch (err) {
        console.warn("[TJ VHS Hotkey] clipboard copy failed:", err);
    }
}

app.registerExtension({
    name: "TJ.VHS.HotkeyRemote",

    setup() {
        window.addEventListener("keydown", async (e) => {
            if (e.repeat) return;
            if (tjIsTypingTarget(document.activeElement)) return;

            const isPlainSpace = e.code === TJ_VHS_HOTKEYS.togglePause && !e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey;
            const isAltHotkey = e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey;

            if (!isPlainSpace && !isAltHotkey) return;

            const node = tjGetSelectedNode();
            const widget = tjGetVHSPreview(node);
            if (!node || !widget) return;

            const altCodes = [
                TJ_VHS_HOTKEYS.toggleHide,
                TJ_VHS_HOTKEYS.toggleMute,
                TJ_VHS_HOTKEYS.open,
                TJ_VHS_HOTKEYS.save,
                TJ_VHS_HOTKEYS.copyPath,
                TJ_VHS_HOTKEYS.syncPreview,
            ];

            if (isAltHotkey && !altCodes.includes(e.code)) return;

            e.preventDefault();
            e.stopPropagation();

            if (isPlainSpace) {
                tjTogglePause(node, widget);
                return;
            }

            if (e.code === TJ_VHS_HOTKEYS.toggleHide) {
                tjToggleHide(node, widget);
            } else if (e.code === TJ_VHS_HOTKEYS.toggleMute) {
                tjToggleMute(node, widget);
            } else if (e.code === TJ_VHS_HOTKEYS.open) {
                tjOpenPreview(widget);
            } else if (e.code === TJ_VHS_HOTKEYS.save) {
                tjSavePreview(widget);
            } else if (e.code === TJ_VHS_HOTKEYS.copyPath) {
                await tjCopyPath(widget);
            } else if (e.code === TJ_VHS_HOTKEYS.syncPreview) {
                tjSyncPreview();
            }
        }, true);

        console.log("[TJ VHS Hotkey Remote] loaded");
    }
});
