"""
TJ_NODE - LoRA Block Analyzer 공용 노드 베이스

아키텍처별 노드(Krea2 / Klein 4B·9B / Z-Image)는 ARCH 만 지정하면 된다.
분석/필터 로직은 _lora_core 가 담당(키 형식 무관).
"""

import os
import json
import folder_paths
import comfy.utils
import comfy.sd

from ._lora_core import SPECS, analyze_lora, build_filtered_lora, check_spec_fit

TJ_LORA_CATEGORY = " ✨ TJ_Node/Lora Analyzer"


class BaseLoRAAnalyzer:
    """서브클래스에서 ARCH 만 지정. (SPECS 키: krea2 / klein4b / klein9b / zimage)"""

    ARCH = "krea2"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model":           ("MODEL",),
                "lora_name":       (folder_paths.get_filename_list("loras"),),
                "global_strength": ("FLOAT", {"default": 1.0, "min": -5.0, "max": 5.0, "step": 0.01}),
                # 라벨 기본값은 영문(글로벌). JS(i18n)가 언어에 맞춰 덮어쓴다.
                "use_original":    ("BOOLEAN", {"default": False,
                                    "label_on": "Use ORIGINAL (ignore blocks)",
                                    "label_off": "Use my block config"}),
                "block_config":    ("STRING", {"default": "{}", "multiline": True}),
            },
            "optional": {
                "clip": ("CLIP",),
            }
        }

    RETURN_TYPES  = ("MODEL", "CLIP", "STRING", "STRING")
    RETURN_NAMES  = ("model", "clip", "analysis_text", "analysis_json")
    FUNCTION      = "execute"
    CATEGORY      = TJ_LORA_CATEGORY
    OUTPUT_NODE   = True

    def execute(self, model, lora_name, global_strength, use_original, block_config, clip=None):
        spec = SPECS[self.ARCH]

        full_path = folder_paths.get_full_path("loras", lora_name)
        if not full_path or not os.path.exists(full_path):
            err = f"LoRA not found: {lora_name}"
            return {"ui": {"analysis_json": ["{}"]}, "result": (model, clip, err, "{}")}

        lora_sd    = comfy.utils.load_torch_file(full_path)
        block_data = analyze_lora(lora_sd, spec)
        fit        = check_spec_fit(lora_sd, spec)
        if fit["warning"]:
            print(f"[TJ LoRA Analyzer] ⚠ {os.path.basename(full_path)}: {fit['warning']}")

        try:
            config = json.loads(block_config) if block_config.strip() else {}
        except Exception:
            config = {}

        # 원본값 사용: 블록 설정은 UI에 그대로 두되, 큐 실행은 필터 없이
        # 전체 블록 ON·강도 1.0(원본 LoRA)으로 돌린다. (A/B 비교용)
        effective_config = {} if use_original else config

        filtered = build_filtered_lora(lora_sd, effective_config, spec)
        model_out, clip_out = comfy.sd.load_lora_for_models(
            model, clip, filtered, global_strength, global_strength
        ) if filtered else (model, clip)

        # 분석 텍스트
        mode = "ORIGINAL (use_original ON)" if use_original else "FILTERED (block config)"
        total = spec.total
        lines = [
            f"╔══ {self.ARCH.upper()} LoRA Analyzer ═══════════════╗",
            f"  File   : {os.path.basename(full_path)}",
            f"  Blocks : {total}  |  Keys: {len(lora_sd)}",
            f"  Mode   : {mode}",
        ]
        if fit["warning"]:
            lines.append(f"  ⚠ WARN  : {fit['warning']}")
        lines.append(f"╠═══════════════════════════════════════════════╣")
        enabled_count = 0
        for idx in range(total):
            d        = block_data[idx]
            bc       = effective_config.get(str(idx), {})
            is_on    = bc.get("enable", True)
            strength = float(bc.get("strength", 1.0))
            impact   = d["impact"]
            if is_on:
                enabled_count += 1
            bar    = "█" * int(impact / 10) + "░" * (10 - int(impact / 10))
            status = "ON " if is_on else "OFF"
            lines.append(f"  [{status}] {d['name']:24s} {bar} {impact:5.1f}%  str:{strength:+.2f}")
        lines += [
            f"╠═══════════════════════════════════════════════╣",
            f"  Enabled: {enabled_count} / {total} blocks",
            f"╚═══════════════════════════════════════════════╝",
        ]

        analysis_text = "\n".join(lines)
        analysis_json = json.dumps(block_data)

        # "ui" 딕셔너리로 JS(onExecuted)에 데이터 전송
        return {
            "ui":     {"analysis_json": [analysis_json]},
            "result": (model_out, clip_out, analysis_text, analysis_json),
        }
