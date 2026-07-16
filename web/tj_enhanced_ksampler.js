import { app } from "../../scripts/app.js";

// Enhanced KSampler (TJ)
// enhance_arch 선택에 따라 그 아키텍처에 해당하는 옵션만 보이게 한다.
// (아키텍처마다 동작 레벨이 달라서 쓰이는 노브가 다름 — 다 보이면 헷갈림)

const NODE_CLASS = "TJ_EnhancedKSampler";

// 아키텍처별로 "보여줄" 고급 위젯
const ARCH_WIDGETS = {
    // Krea2 는 MODEL 패치(txtfusion 청크 증폭) — conditioning 노브를 쓰지 않는다
    krea2: [],
    // Klein 은 CONDITIONING 연산 + Qwen3 3-레이어 슬라이스
    klein: [
        "adv_active_scale", "adv_per_token_whiten", "adv_norm_equalize",
        "adv_early_layer_scale", "adv_mid_layer_scale", "adv_late_layer_scale",
    ],
    // Z-Image 는 슬라이스 구조가 없어 레이어 스케일 제외
    zimage: ["adv_active_scale", "adv_per_token_whiten", "adv_norm_equalize"],
};

const ALL_ADV = [
    "adv_active_scale", "adv_per_token_whiten", "adv_norm_equalize",
    "adv_early_layer_scale", "adv_mid_layer_scale", "adv_late_layer_scale",
];

function toggleWidget(widget, show) {
    if (!widget) return;
    if (widget.__tjOrigType === undefined) {
        widget.__tjOrigType = widget.type;
        widget.__tjOrigComputeSize = widget.computeSize;
    }
    if (show) {
        widget.type = widget.__tjOrigType;
        widget.computeSize = widget.__tjOrigComputeSize;
    } else {
        widget.type = "hidden";
        widget.computeSize = () => [0, -4];
    }
}

app.registerExtension({
    name: "TJNode.EnhancedKSampler",

    async nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;

        const get = (n) => node.widgets?.find(w => w.name === n);
        const archW    = get("enhance_arch");
        const enabledW = get("enhance_enabled");
        const strengthW = get("enhance_strength");
        const debugW   = get("enhance_debug");
        if (!archW) return;

        const refresh = () => {
            const on = enabledW ? !!enabledW.value : true;
            const arch = String(archW.value || "krea2");
            const wanted = new Set(on ? (ARCH_WIDGETS[arch] || []) : []);

            // enhance 관련 기본 노브는 ON 일 때만
            toggleWidget(strengthW, on);
            toggleWidget(debugW, on);
            // 고급 노브는 ON + 해당 아키텍처에서 쓰는 것만
            for (const name of ALL_ADV) toggleWidget(get(name), wanted.has(name));

            // 노드 크기는 건드리지 않는다 — 사용자가 latent preview 영역을
            // 원하는 만큼 늘려 쓰도록 수동 조절에 맡긴다.
            node.setDirtyCanvas(true, true);
        };

        // 값이 어떤 경로로 바뀌든 반영되도록 값 자체를 가로챈다
        const trap = (w) => {
            if (!w || w.__tjTrapped) return;
            w.__tjTrapped = true;
            let backing = w.value;
            Object.defineProperty(w, "value", {
                get() { return backing; },
                set(v) {
                    const changed = backing !== v;
                    backing = v;
                    if (changed) refresh();
                },
                configurable: true,
                enumerable: true,
            });
        };
        trap(archW);
        trap(enabledW);

        refresh();
        setTimeout(refresh, 100);   // 워크플로우 로드 후 값 복원 대비

        node.color   = "#7612DA";
        node.bgcolor = "#000000";
    },
});
