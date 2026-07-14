"""
Krea2 LoRA Analyzer + Selective Loader  (TJ_NODE 편입판)
원본: ComfyUI-Krea2-Analyzer v2.1

핵심: return {"ui": {...}, "result": (...)} 포맷 사용
→ ComfyUI가 JS onExecuted로 데이터 전송하는 공식 채널
"""

import os
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
# 분석
# ─────────────────────────────────────────────

def analyze_krea2_lora(lora_sd: dict) -> dict:
    block_data = {}
    for block_idx in range(TOTAL_BLOCKS):
        prefix     = block_prefix(block_idx)
        total_norm = 0.0
        pair_count = 0
        for comp in COMPONENTS:
            key_a = f"{prefix}{comp}.lora_A.weight"
            key_b = f"{prefix}{comp}.lora_B.weight"
            if key_a in lora_sd and key_b in lora_sd:
                a = lora_sd[key_a].float()
                b = lora_sd[key_b].float()
                total_norm += float(torch.norm(a) * torch.norm(b))
                pair_count += 1
        avg_norm = total_norm / pair_count if pair_count > 0 else 0.0
        block_data[block_idx] = {
            "name":   block_display_name(block_idx),
            "norm":   avg_norm,
            "pairs":  pair_count,
            "impact": 0.0,
        }
    max_norm = max(v["norm"] for v in block_data.values()) or 1.0
    for idx in block_data:
        block_data[idx]["impact"] = round(block_data[idx]["norm"] / max_norm * 100, 1)
    return block_data


# ─────────────────────────────────────────────
# 필터링 LoRA 빌드
# ─────────────────────────────────────────────

def build_filtered_lora(lora_sd: dict, config: dict) -> dict:
    filtered = {}
    for key, tensor in lora_sd.items():
        matched = False
        for block_idx in range(TOTAL_BLOCKS):
            if key.startswith(block_prefix(block_idx)):
                matched = True
                bc = config.get(str(block_idx), {})
                if bc.get("enable", True):
                    s = float(bc.get("strength", 1.0))
                    filtered[key] = tensor * s if ".lora_A.weight" in key else tensor
                break
        # other_weights: 블록 미매칭 키는 그대로 포함
        if not matched:
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
