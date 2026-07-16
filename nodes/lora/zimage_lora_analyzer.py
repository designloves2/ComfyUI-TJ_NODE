"""
Z-Image LoRA Analyzer (TJ)

블록 구조: layers 0~29 = 30 (Z-Image Turbo / Base 동일, 실측 검증)
컴포넌트: attention.to_q/k/v/out.0, adaLN_modulation.0, feed_forward.wN
부분 학습(일부 layer 만 있는 LoRA)도 정상 인식 — _lora_core 참조.
"""

from ._analyzer_base import BaseLoRAAnalyzer


class ZImageLoRAAnalyzer(BaseLoRAAnalyzer):
    ARCH = "zimage"


NODE_CLASS_MAPPINGS = {
    "ZImageLoRAAnalyzer": ZImageLoRAAnalyzer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ZImageLoRAAnalyzer": "Z-Image LoRA Analyzer (TJ)",
}
