"""
Krea2 LoRA Analyzer + Selective Loader  (TJ_NODE)

블록 구조: main 28 + txtfusion layerwise 2 + refiner 2 = 32
분석/필터 로직은 _lora_core (키 형식 무관) 사용.
"""

from ._lora_core import SPECS, analyze_lora, build_filtered_lora
from ._analyzer_base import BaseLoRAAnalyzer

KREA2_SPEC   = SPECS["krea2"]
TOTAL_BLOCKS = KREA2_SPEC.total   # 32


class Krea2LoRAAnalyzer(BaseLoRAAnalyzer):
    ARCH = "krea2"


# ── 하위호환 헬퍼 (기존 시그니처 유지) ─────────────────
def block_display_name(idx: int) -> str:
    return KREA2_SPEC.display_name(idx)


def analyze_krea2_lora(lora_sd: dict) -> dict:
    return analyze_lora(lora_sd, KREA2_SPEC)


def build_filtered_krea2_lora(lora_sd: dict, config: dict) -> dict:
    return build_filtered_lora(lora_sd, config, KREA2_SPEC)


NODE_CLASS_MAPPINGS = {
    "Krea2LoRAAnalyzer": Krea2LoRAAnalyzer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Krea2LoRAAnalyzer": "Krea2 LoRA Analyzer (TJ)",
}
