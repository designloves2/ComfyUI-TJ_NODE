"""
Krea2 LoRA Analyzer + Selective Loader  (TJ_NODE 편입판)
원본: ComfyUI-Krea2-Analyzer v2.1

핵심: return {"ui": {...}, "result": (...)} 포맷 사용
→ ComfyUI가 JS onExecuted로 데이터 전송하는 공식 채널
"""

import os
import re
import json
import torch
import folder_paths
import comfy.utils
import comfy.sd

# ─────────────────────────────────────────────
# 블록 구조  (28 main + 2 layerwise + 2 refiner = 32)
# ─────────────────────────────────────────────

NUM_MAIN_BLOCKS      = 28
NUM_LAYERWISE_BLOCKS = 2
NUM_REFINER_BLOCKS   = 2
TOTAL_BLOCKS         = 32

COMPONENTS = [
    "attn.gate", "attn.wk", "attn.wo", "attn.wq", "attn.wv",
    "mlp.down",  "mlp.gate", "mlp.up"
]

# ─────────────────────────────────────────────
# 프리셋
# ─────────────────────────────────────────────

KREA2_PRESETS = {
    "All ON":           list(range(32)),
    "Main Blocks Only": list(range(28)),
    "TxtFusion OFF":    list(range(28)),
    "Late Blocks (14-27)": list(range(14, 28)),
    "Early Blocks (0-13)": list(range(14)),
    "All OFF":          [],
}


def block_prefix(idx: int) -> str:
    """(참고용) 표준 diffusion_model 접두. 분석/필터는 형식 무관 파서를 사용."""
    if idx < NUM_MAIN_BLOCKS:
        return f"diffusion_model.blocks.{idx}."
    elif idx < NUM_MAIN_BLOCKS + NUM_LAYERWISE_BLOCKS:
        return f"diffusion_model.txtfusion.layerwise_blocks.{idx - NUM_MAIN_BLOCKS}."
    else:
        return f"diffusion_model.txtfusion.refiner_blocks.{idx - NUM_MAIN_BLOCKS - NUM_LAYERWISE_BLOCKS}."


def block_display_name(idx: int) -> str:
    if idx < NUM_MAIN_BLOCKS:
        return f"Block {idx:02d}"
    elif idx < NUM_MAIN_BLOCKS + NUM_LAYERWISE_BLOCKS:
        return f"TxtFusion-Layerwise {idx - NUM_MAIN_BLOCKS}"
    else:
        return f"TxtFusion-Refiner {idx - NUM_MAIN_BLOCKS - NUM_LAYERWISE_BLOCKS}"


# ─────────────────────────────────────────────
# 형식 무관 키 파서
#   Krea2 LoRA 는 학습 옵션/모듈에 따라 키 저장 형식이 다양하다:
#     - dot 표준 : diffusion_model.blocks.{N}.attn.wq.lora_A.weight / .lora_B.weight
#     - kohya    : lora_unet_blocks_{N}_attn_wq.lora_down.weight / .lora_up.weight / .alpha
#     - LoKr     : ...lokr_w1 / ...lokr_w2
#     - 단축형   : blocks.{N}.attn.wq.A / .B
#   접두/컴포넌트에 의존하지 않고, (down/up) 쌍의 노름으로 블록별 기여도를 계산한다.
# ─────────────────────────────────────────────

# down(=lora_A) 쪽 / up(=lora_B) 쪽 접미사
_DOWN_SUFFIXES = (".lora_down.weight", ".lora_A.weight", ".lokr_w1", ".hada_w1_a", ".A")
_UP_SUFFIXES   = (".lora_up.weight",   ".lora_B.weight", ".lokr_w2", ".hada_w2_a", ".B")
_ALL_SUFFIXES  = _DOWN_SUFFIXES + _UP_SUFFIXES + (".alpha",)


def _role_and_base(key: str):
    """키의 역할('down'/'up')과 모듈 베이스명을 반환. 아니면 (None, None)."""
    for suf in _DOWN_SUFFIXES:
        if key.endswith(suf):
            return "down", key[:-len(suf)]
    for suf in _UP_SUFFIXES:
        if key.endswith(suf):
            return "up", key[:-len(suf)]
    return None, None


def _module_base(key: str):
    """알려진 접미사(.alpha 포함)를 제거한 모듈 베이스명. 아니면 None."""
    for suf in _ALL_SUFFIXES:
        if key.endswith(suf):
            return key[:-len(suf)]
    return None


def _is_down_key(key: str) -> bool:
    return any(key.endswith(suf) for suf in _DOWN_SUFFIXES)


def _block_index_from_base(base: str):
    """모듈 베이스명 → Krea2 블록 인덱스(0~31). 매칭 불가 시 None.
    구분자는 '.'/'_' 모두 허용 (dot / kohya 형식 동시 지원)."""
    if not base:
        return None
    m = re.search(r'refiner_blocks[._](\d+)', base)
    if m:
        return NUM_MAIN_BLOCKS + NUM_LAYERWISE_BLOCKS + int(m.group(1))
    m = re.search(r'layerwise_blocks[._](\d+)', base)
    if m:
        return NUM_MAIN_BLOCKS + int(m.group(1))
    m = re.search(r'blocks[._](\d+)', base)
    if m:
        return int(m.group(1))
    return None


# ─────────────────────────────────────────────
# 분석 (형식 무관)
# ─────────────────────────────────────────────

def analyze_krea2_lora(lora_sd: dict) -> dict:
    # 모듈 베이스별 down/up 텐서 수집
    modules = {}
    for key, val in lora_sd.items():
        role, base = _role_and_base(key)
        if role:
            modules.setdefault(base, {})[role] = val

    block_norm = {i: 0.0 for i in range(TOTAL_BLOCKS)}
    block_cnt  = {i: 0 for i in range(TOTAL_BLOCKS)}
    for base, du in modules.items():
        if "down" not in du or "up" not in du:
            continue
        bi = _block_index_from_base(base)
        if bi is None or not (0 <= bi < TOTAL_BLOCKS):
            continue
        try:
            a = du["down"].float()
            b = du["up"].float()
            block_norm[bi] += float(torch.norm(a) * torch.norm(b))
            block_cnt[bi]  += 1
        except Exception:
            continue

    block_data = {}
    for i in range(TOTAL_BLOCKS):
        avg = block_norm[i] / block_cnt[i] if block_cnt[i] else 0.0
        block_data[i] = {
            "name":   block_display_name(i),
            "norm":   avg,
            "pairs":  block_cnt[i],
            "impact": 0.0,
        }
    max_norm = max(v["norm"] for v in block_data.values()) or 1.0
    for idx in block_data:
        block_data[idx]["impact"] = round(block_data[idx]["norm"] / max_norm * 100, 1)
    return block_data


# ─────────────────────────────────────────────
# 필터링 LoRA 빌드 (형식 무관)
# ─────────────────────────────────────────────

def build_filtered_lora(lora_sd: dict, config: dict) -> dict:
    filtered = {}
    for key, tensor in lora_sd.items():
        base = _module_base(key)
        bi = _block_index_from_base(base) if base else None

        # 블록에 매핑되지 않는 키(other_weights) → 그대로 포함
        if bi is None or not (0 <= bi < TOTAL_BLOCKS):
            filtered[key] = tensor
            continue

        bc = config.get(str(bi), {})
        if not bc.get("enable", True):
            continue  # 블록 비활성 → 이 모듈의 모든 키 제외

        s = float(bc.get("strength", 1.0))
        # 강도는 down(=lora_A/lokr_w1) 쪽에만 곱해 선형 스케일 (형식 무관)
        if s != 1.0 and _is_down_key(key):
            filtered[key] = tensor * s
        else:
            filtered[key] = tensor
    return filtered


# ─────────────────────────────────────────────
# 노드
# ─────────────────────────────────────────────

class Krea2LoRAAnalyzer:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model":           ("MODEL",),
                "lora_name":       (folder_paths.get_filename_list("loras"),),
                "global_strength": ("FLOAT", {"default": 1.0, "min": -5.0, "max": 5.0, "step": 0.01}),
                "block_config":    ("STRING", {"default": "{}", "multiline": True}),
            },
            "optional": {
                "clip": ("CLIP",),
            }
        }

    RETURN_TYPES  = ("MODEL", "CLIP", "STRING", "STRING")
    RETURN_NAMES  = ("model", "clip", "analysis_text", "analysis_json")
    FUNCTION      = "execute"
    CATEGORY      = " ✨ TJ_Node/Lora Analyzer"
    OUTPUT_NODE   = True

    def execute(self, model, lora_name, global_strength, block_config, clip=None):
        full_path = folder_paths.get_full_path("loras", lora_name)
        if not full_path or not os.path.exists(full_path):
            err = f"LoRA not found: {lora_name}"
            return {"ui": {"analysis_json": ["{}"]}, "result": (model, clip, err, "{}")}

        lora_sd    = comfy.utils.load_torch_file(full_path)
        block_data = analyze_krea2_lora(lora_sd)

        try:
            config = json.loads(block_config) if block_config.strip() else {}
        except Exception:
            config = {}

        # 선택적 LoRA 적용
        filtered = build_filtered_lora(lora_sd, config)
        model_out, clip_out = comfy.sd.load_lora_for_models(
            model, clip, filtered, global_strength, global_strength
        ) if filtered else (model, clip)

        # 분석 텍스트
        lines = [
            f"╔══ Krea2 LoRA Analyzer ══════════════════════╗",
            f"  File   : {os.path.basename(full_path)}",
            f"  Blocks : {TOTAL_BLOCKS}  |  Keys: {len(lora_sd)}",
            f"╠═══════════════════════════════════════════════╣",
        ]
        enabled_count = 0
        for idx in range(TOTAL_BLOCKS):
            d        = block_data[idx]
            bc       = config.get(str(idx), {})
            is_on    = bc.get("enable", True)
            strength = float(bc.get("strength", 1.0))
            impact   = d["impact"]
            if is_on: enabled_count += 1
            bar    = "█" * int(impact / 10) + "░" * (10 - int(impact / 10))
            status = "ON " if is_on else "OFF"
            lines.append(f"  [{status}] {d['name']:24s} {bar} {impact:5.1f}%  str:{strength:+.2f}")
        lines += [
            f"╠═══════════════════════════════════════════════╣",
            f"  Enabled: {enabled_count} / {TOTAL_BLOCKS} blocks",
            f"╚═══════════════════════════════════════════════╝",
        ]

        analysis_text = "\n".join(lines)
        analysis_json = json.dumps(block_data)

        # ★ 핵심: "ui" 딕셔너리로 JS에 데이터 전송
        return {
            "ui":     {"analysis_json": [analysis_json]},
            "result": (model_out, clip_out, analysis_text, analysis_json),
        }


NODE_CLASS_MAPPINGS = {
    "Krea2LoRAAnalyzer": Krea2LoRAAnalyzer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Krea2LoRAAnalyzer": "Krea2 LoRA Analyzer (TJ)",
}
