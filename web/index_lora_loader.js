// web/index_lora_loader.js
import { app } from "../../scripts/app.js";

const NODE_TYPE = "TJ_IndexLoRALoader";
const MAX_SLOTS = 20;
const DEFAULT_VISIBLE = 5;
const NONE_VALUE = "[none]";

const GET_SPECS = [
    { widgetName: "get_name_model", inputName: "model", inputType: "MODEL" },
    { widgetName: "get_name_clip", inputName: "clip", inputType: "CLIP" },
    { widgetName: "get_name_index", inputName: "index", inputType: "INT" },
];

const DEFAULT_AUTO_SETS = {
    0: "Index LoRA Loader/model",
    1: "Index LoRA Loader/clip",
    2: "Index LoRA Loader/name",
    3: "Index LoRA Loader/index",
    4: "Index LoRA Loader/total",
};

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(node) {
    if (window.TJ_NODE_applyTheme) {
        window.TJ_NODE_applyTheme(node);
    } else {
        node.bgcolor = "#000000";
        node.color = "#7612DA";
        node.title_text_color = "#FFFFFF";
    }
}

// ── Wireless helpers ──────────────────────────────────────────────────────────

function getGraphLink(graph, linkId) {
    if (!graph || linkId == null) return null;
    return graph.links?.[linkId] || graph.links?.get?.(linkId) || null;
}

function findInputIndex(node, inputName) {
    return node.inputs?.findIndex(input =>
        input?.name === inputName ||
        input?.widget?.name === inputName ||
        input?._tj_flux_input_name === inputName
    ) ?? -1;
}

function isDirectWire(node, inputIndex) {
    const input = node.inputs?.[inputIndex];
    const link = getGraphLink(node.graph, input?.link);
    return !!(link && !link._tj_wireless);
}

function clearWirelessInput(node, spec) {
    const inputIndex = findInputIndex(node, spec.inputName);
    if (inputIndex < 0) return;
    const input = node.inputs?.[inputIndex];
    const link = getGraphLink(node.graph, input?.link);
    if (link?._tj_wireless) node.graph?.removeLink?.(link.id);
    if (node.inputs?.[inputIndex] && !isDirectWire(node, inputIndex)) {
        node.inputs[inputIndex].label = "";
    }
}

function connectEmbeddedGet(node, spec, value) {
    const inputIndex = findInputIndex(node, spec.inputName);
    if (inputIndex < 0 || !node.graph) return;
    if (!value || value === "(none)" || value === window.TJ_NODE_PROVIDER_SEPARATOR) {
        clearWirelessInput(node, spec);
        return;
    }
    if (isDirectWire(node, inputIndex)) return;
    const source = window.TJ_NODE_findSetterSourceInfo?.(node.graph, value);
    if (!source?.node || source.connectable === false) return;
    const oldLink = getGraphLink(node.graph, node.inputs?.[inputIndex]?.link);
    if (oldLink) node.graph.removeLink(oldLink.id);
    source.node.connect(source.slot, node, inputIndex);
    window.TJ_NODE_markWirelessLink?.(node.graph, node, inputIndex, source.displayName || value);
    const label =
        source.labelName ||
        window.TJ_NODE_getProviderLabelName?.(node.graph, source.displayName || value) ||
        value;
    if (node.inputs?.[inputIndex]) {
        node.inputs[inputIndex].label = label ? `◀ ${label}` : "";
        node.inputs[inputIndex]._tj_flux_input_name = spec.inputName;
    }
}

function updateGetOptions(node) {
    const all = window.TJ_NODE_getAllSetNames?.(node.graph || app.graph) || ["(none)"];
    for (const spec of GET_SPECS) {
        const widget = node.widgets?.find(w => w.name === spec.widgetName);
        if (!widget) continue;
        const filtered = all.filter(value => {
            if (value === "(none)" || value === window.TJ_NODE_PROVIDER_SEPARATOR) return true;
            const provider = window.TJ_NODE_findSetterSourceInfo?.(node.graph || app.graph, value);
            const outputType = provider?.node?.outputs?.[provider.slot]?.type;
            return outputType === spec.inputType || outputType === "*" || !outputType;
        });
        if (widget.options) widget.options.values = filtered;
        if (!filtered.includes(widget.value)) widget.value = "(none)";
    }
}

function syncAutoSetLabels(node) {
    node.properties = node.properties || {};
    node.properties.auto_sets = node.properties.auto_sets || { ...DEFAULT_AUTO_SETS };
    const enabled = !!node.widgets?.find(w => w.name === "auto_set")?.value;
    if (enabled) window.TJ_NODE_ensureUniqueAutoSetNames?.(node.graph || app.graph);
    node.outputs?.forEach((output, index) => {
        const name = node.properties.auto_sets[index] || DEFAULT_AUTO_SETS[index] || output.name;
        output.label = enabled ? `${name} ▶` : "";
    });
    window.TJ_NODE_syncAllGetNodes?.(node.graph || app.graph);
    node.setDirtyCanvas?.(true, true);
}

// ── Folder auto-fill ─────────────────────────────────────────────────────────

/**
 * 선택된 폴더의 LoRA를 슬롯에 순서대로 채웁니다.
 * 폴더 내 LoRA를 알파벳순 정렬 후 lora_1부터 순서대로 할당합니다.
 */
function autoFillFromFolder(node, folder) {
    if (!folder || folder === "(all)") return;

    // lora_1의 options에서 전체 LoRA 목록 가져오기
    const allLoras = node.widgets?.find(w => w.name === "lora_1")?.options?.values ?? [];

    // 경로 구분자 통일 후 해당 폴더 직하위 + 하위 폴더 전체 필터링
    const prefix = folder.replace(/\\/g, "/") + "/";
    const filtered = allLoras
        .filter(l => l && l !== NONE_VALUE && l !== "(none)"
            && l.replace(/\\/g, "/").startsWith(prefix))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

    if (filtered.length === 0) {
        console.warn(`[TJ_IndexLoRALoader] No LoRAs found in folder: ${folder}`);
        return;
    }

    const count = Math.min(filtered.length, MAX_SLOTS);

    // 슬롯 채우기 (count 초과분은 [none] 초기화)
    for (let slot = 1; slot <= MAX_SLOTS; slot++) {
        const lw = node.widgets?.find(w => w.name === `lora_${slot}`);
        if (!lw) continue;
        lw.value = slot <= count ? filtered[slot - 1] : NONE_VALUE;
    }

    // 보이는 슬롯 수 = max(기본값, LoRA 개수)
    setSlotCount(node, Math.max(DEFAULT_VISIBLE, count));
    applySlotVisibility(node);
    app.canvas?.setDirty(true, true);
}

// ── Slot visibility management ────────────────────────────────────────────────

function getSlotCount(node) {
    return node.properties?.lora_slot_count ?? DEFAULT_VISIBLE;
}

function setSlotCount(node, count) {
    node.properties = node.properties || {};
    node.properties.lora_slot_count = Math.min(MAX_SLOTS, Math.max(1, count));
}

function hideWidget(w) {
    if (!w || w._tj_hidden) return;
    w._tj_hidden = true;
    // computeSize가 없는 위젯(대부분)은 undefined 저장 → 복원 시 delete로 처리
    w._tj_origComputeSize = Object.prototype.hasOwnProperty.call(w, "computeSize")
        ? w.computeSize
        : undefined;
    w.computeSize = () => [0, -4];
}

function showWidget(w) {
    if (!w || !w._tj_hidden) return;
    w._tj_hidden = false;
    if (w._tj_origComputeSize !== undefined) {
        // 원래 자체 computeSize가 있었으면 복원
        w.computeSize = w._tj_origComputeSize;
    } else {
        // 없었으면 우리가 추가한 override 제거 → LiteGraph가 기본 높이(NODE_WIDGET_HEIGHT) 사용
        delete w.computeSize;
    }
    delete w._tj_origComputeSize;
}

/** Returns the highest slot index with a non-none lora value, at least DEFAULT_VISIBLE. */
function autoDetectSlotCount(node) {
    let max = DEFAULT_VISIBLE;
    for (let s = 1; s <= MAX_SLOTS; s++) {
        const w = node.widgets?.find(w => w.name === `lora_${s}`);
        if (w?.value && w.value !== NONE_VALUE && w.value !== "(none)") max = Math.max(max, s);
    }
    return max;
}

function updateSlotButtons(node) {
    const count = getSlotCount(node);
    if (node._tj_add_btn) {
        node._tj_add_btn.name = count >= MAX_SLOTS
            ? `＋ Add LoRA  [${count} / ${MAX_SLOTS}  MAX]`
            : `＋ Add LoRA  [${count} / ${MAX_SLOTS}]`;
    }
    if (node._tj_rm_btn) {
        node._tj_rm_btn.name = count <= 1
            ? `－ Remove Last LoRA  [MIN]`
            : `－ Remove Last LoRA  [${count}]`;
    }
}

function applySlotVisibility(node, { preserveSize = false } = {}) {
    const visible = getSlotCount(node);
    for (let s = 1; s <= MAX_SLOTS; s++) {
        const lw = node.widgets?.find(w => w.name === `lora_${s}`);
        const sw = node.widgets?.find(w => w.name === `strength_${s}`);
        if (s <= visible) {
            showWidget(lw);
            showWidget(sw);
        } else {
            hideWidget(lw);
            hideWidget(sw);
        }
    }
    updateSlotButtons(node);
    if (!preserveSize) {
        // 슬롯 추가/제거 시: 높이만 조정, 사용자가 조절한 너비는 보존
        const computed = node.computeSize?.() ?? node.size;
        node.setSize?.([node.size[0], computed[1]]);
    }
    // preserveSize=true(로드 시): 저장된 사이즈 그대로 유지
    app.canvas?.setDirty(true, true);
}

function addSlotButtons(node) {
    if (node._tj_add_btn) return; // already added

    const addBtn = node.addWidget("button", "＋ Add LoRA", null, () => {
        const cur = getSlotCount(node);
        if (cur < MAX_SLOTS) {
            setSlotCount(node, cur + 1);
            applySlotVisibility(node);
        }
    });
    addBtn.serialize = false;
    node._tj_add_btn = addBtn;

    const rmBtn = node.addWidget("button", "－ Remove Last LoRA", null, () => {
        const cur = getSlotCount(node);
        if (cur > 1) {
            // Clear the slot being removed
            const lw = node.widgets?.find(w => w.name === `lora_${cur}`);
            const sw = node.widgets?.find(w => w.name === `strength_${cur}`);
            if (lw) lw.value = NONE_VALUE;
            if (sw) sw.value = 1.0;
            setSlotCount(node, cur - 1);
            applySlotVisibility(node);
        }
    });
    rmBtn.serialize = false;
    node._tj_rm_btn = rmBtn;
}

// ── Extension registration ────────────────────────────────────────────────────

app.registerExtension({
    name: "TJ.IndexLoRALoader",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            originalCreated?.apply(this, arguments);
            applyTheme(this);

            this.properties = this.properties || {};
            this.properties.auto_sets = this.properties.auto_sets || { ...DEFAULT_AUTO_SETS };

            this._tj_multi_get_specs = GET_SPECS.map(spec => ({ ...spec }));

            for (const spec of GET_SPECS) {
                const inputIndex = findInputIndex(this, spec.inputName);
                if (inputIndex >= 0) {
                    this.inputs[inputIndex]._tj_flux_input_name = spec.inputName;
                }
                const widget = this.widgets?.find(w => w.name === spec.widgetName);
                if (!widget) continue;
                const oldCallback = widget.callback;
                widget.callback = (value) => {
                    oldCallback?.call(widget, value);
                    connectEmbeddedGet(this, spec, value);
                    app.canvas?.setDirty(true, true);
                };
                this[`_tjConnect_${spec.widgetName}`] = (value) => connectEmbeddedGet(this, spec, value);
            }

            this._tjClearMultiGetSlot = (spec) => clearWirelessInput(this, spec);
            this._tjSyncMultiGetReceiver = () => {
                updateGetOptions(this);
                for (const spec of GET_SPECS) {
                    const widget = this.widgets?.find(w => w.name === spec.widgetName);
                    if (widget?.value && widget.value !== "(none)") {
                        connectEmbeddedGet(this, spec, widget.value);
                    }
                }
            };

            const autoSet = this.widgets?.find(w => w.name === "auto_set");
            if (autoSet) {
                const oldCallback = autoSet.callback;
                autoSet.callback = (value) => {
                    oldCallback?.call(autoSet, value);
                    syncAutoSetLabels(this);
                };
            }

            // folder_filter: 폴더 선택 시 슬롯 자동 채우기
            const folderWidget = this.widgets?.find(w => w.name === "folder_filter");
            if (folderWidget && !folderWidget._tj_folder_cb) {
                folderWidget._tj_folder_cb = true;
                const oldCallback = folderWidget.callback;
                folderWidget.callback = (value) => {
                    oldCallback?.call(folderWidget, value);
                    autoFillFromFolder(this, value);
                };
            }

            // New node: default visible count
            if (this.properties.lora_slot_count === undefined) {
                setSlotCount(this, DEFAULT_VISIBLE);
            }

            addSlotButtons(this);
            applySlotVisibility(this);
            updateGetOptions(this);
            syncAutoSetLabels(this);
        };

        const originalConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            originalConfigure?.apply(this, arguments);
            setTimeout(() => {
                applyTheme(this);
                // Ensure all filled slots are visible even if saved count is lower
                const detected = autoDetectSlotCount(this);
                const stored = getSlotCount(this);
                if (detected > stored) setSlotCount(this, detected);

                addSlotButtons(this);
                // 로드 시에는 저장된 노드 사이즈를 유지 (사용자 조절값 보존)
                applySlotVisibility(this, { preserveSize: true });
                updateGetOptions(this);
                this._tjSyncMultiGetReceiver?.();
                syncAutoSetLabels(this);

                // Restore folder_filter callback after configure
                const folderWidget = this.widgets?.find(w => w.name === "folder_filter");
                if (folderWidget && !folderWidget._tj_folder_cb) {
                    folderWidget._tj_folder_cb = true;
                    const oldCb = folderWidget.callback;
                    folderWidget.callback = (value) => {
                        oldCb?.call(folderWidget, value);
                        autoFillFromFolder(this, value);
                    };
                }
            }, 100);
        };

        const originalDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            originalDrawForeground?.apply(this, arguments);
            updateGetOptions(this);
        };
    },
});
