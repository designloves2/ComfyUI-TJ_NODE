// MiniMax H3 Sequencer (TJ) / MiniMax H3 One-Take Sampler (TJ)
// ref_video_N / ref_video_audio_N / ref_audio_N (N=1..3, matching H3's own cap) grow
// dynamically: only slot 1 shows at first, connecting it reveals slot 2, etc. — same
// pattern as web/dynamic_batch.js's updateDynamicImageBatch, generalized to 3 groups
// each capped at 3 instead of a single group capped at 64.
// Both node types share the same optional ref_video_*/ref_video_audio_*/ref_audio_*
// input names, so this one extension handles both.

import { app } from "../../scripts/app.js";

const NODE_TYPES = new Set(["TJ_H3_Sequencer", "TJ_H3_OneTakeSampler"]);
const GROUPS = [
    { prefix: "ref_video_", max: 3 },
    { prefix: "ref_video_audio_", max: 3 },
    { prefix: "ref_audio_", max: 3 },
];

function slotsFor(node, prefix) {
    const re = new RegExp(`^${prefix}\\d+$`);
    return (node.inputs || []).filter(s => re.test(s.name));
}

function updateGroup(node, group) {
    const { prefix, max } = group;
    let current = slotsFor(node, prefix);
    // always keep at least slot 1
    if (current.length === 0) return;
    const last = current[current.length - 1];
    if (last.link != null && current.length < max) {
        const nextIndex = current.length + 1;
        // the slot already exists in the node type's optional inputs list on first
        // creation (Python declares ref_video_1..3 etc. as optional) — if it was
        // removed earlier, LiteGraph's addInput recreates a plain slot with the same
        // name/type, which is all the backend needs (optional args default to None).
        node.addInput(`${prefix}${nextIndex}`, last.type);
    }
    // collapse trailing empty slots, but always leave slot 1 and one empty slot after
    // the last connected one (mirrors updateDynamicImageBatch's removal rule)
    current = slotsFor(node, prefix);
    for (let i = current.length - 1; i > 0; i--) {
        if (current[i].link == null && current[i - 1].link == null) {
            node.removeInput(node.inputs.indexOf(current[i]));
        }
    }
}

function collapseToOne(node, group) {
    const { prefix } = group;
    let current = slotsFor(node, prefix);
    for (let i = current.length - 1; i > 0; i--) {
        if (current[i].link == null) node.removeInput(node.inputs.indexOf(current[i]));
    }
}

function installDynamicRefSlots(node) {
    if (!node || node._tj_seq_dyn_installed) return;
    node._tj_seq_dyn_installed = true;
    // start collapsed: only slot 1 of each group visible
    GROUPS.forEach(g => collapseToOne(node, g));
    node.setDirtyCanvas?.(true, true);
}

// --- audio_lock 켰을 때만 audio_lock_mode/fit 노출, remix일 때만 strength까지 노출 ---
function findWidget(node, name) {
    return node?.widgets?.find(w => w?.name === name) || null;
}
function setWidgetVisible(widget, visible) {
    if (!widget) return;
    if (!widget._tj_seq_saved) {
        widget._tj_seq_saved = { type: widget.type, computeSize: widget.computeSize };
    }
    widget.type = visible ? widget._tj_seq_saved.type : "hidden";
    widget.computeSize = visible ? widget._tj_seq_saved.computeSize : () => [0, -4];
    widget.hidden = !visible;
    widget.disabled = !visible;
}
function applyAudioLockVisibility(node) {
    const on = !!findWidget(node, "audio_lock")?.value;
    const mode = String(findWidget(node, "audio_lock_mode")?.value || "lock");
    setWidgetVisible(findWidget(node, "audio_lock_mode"), on);
    setWidgetVisible(findWidget(node, "audio_lock_fit"), on);
    setWidgetVisible(findWidget(node, "audio_lock_strength"), on && mode === "remix");
    const width = node.size?.[0];
    const computed = node.computeSize?.();
    if (computed) node.setSize([width || computed[0], computed[1]]);
    node.setDirtyCanvas?.(true, true);
}
function installAudioLockVisibility(node) {
    const lockW = findWidget(node, "audio_lock");
    if (lockW && !lockW._tj_seq_cb) {
        lockW._tj_seq_cb = true;
        const orig = lockW.callback;
        lockW.callback = function (v) {
            if (orig) orig.call(this, v, app.canvas, node);
            applyAudioLockVisibility(node);
        };
    }
    const modeW = findWidget(node, "audio_lock_mode");
    if (modeW && !modeW._tj_seq_cb) {
        modeW._tj_seq_cb = true;
        const orig = modeW.callback;
        modeW.callback = function (v) {
            if (orig) orig.call(this, v, app.canvas, node);
            applyAudioLockVisibility(node);
        };
    }
    applyAudioLockVisibility(node);
}

app.registerExtension({
    name: "TJ.H3Sequencer.DynamicRefSlots",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!NODE_TYPES.has(nodeData.name)) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);
            setTimeout(() => { installDynamicRefSlots(this); installAudioLockVisibility(this); }, 0);
            return r;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (data) {
            const r = onConfigure?.apply(this, arguments);
            // loaded from a saved workflow: don't collapse connected slots away,
            // just make sure growth/shrink behavior is live going forward.
            this._tj_seq_dyn_installed = true;
            setTimeout(() => {
                GROUPS.forEach(g => updateGroup(this, g));
                installAudioLockVisibility(this);
            }, 0);
            return r;
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (type, index) {
            const r = onConnectionsChange?.apply(this, arguments);
            if (type === LiteGraph.INPUT) {
                const name = this.inputs?.[index]?.name;
                const group = GROUPS.find(g => name && name.startsWith(g.prefix) && /_\d+$/.test(name));
                if (group) setTimeout(() => updateGroup(this, group), 0);
            }
            return r;
        };
    },
});
