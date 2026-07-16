"""
Flux2 Klein LoRA Analyzer (TJ)

블록 구조 (실제 LoRA 파일들로 교차 검증):
  - Klein 4B : double_blocks 5 + single_blocks 20 = 25
  - Klein 9B : double_blocks 8 + single_blocks 24 = 32

네이밍 변형(diffusers `transformer.transformer_blocks` /
`transformer.single_transformer_blocks`)도 자동 인식 — _lora_core 참조.
"""

from ._analyzer_base import BaseLoRAAnalyzer


class Klein4BLoRAAnalyzer(BaseLoRAAnalyzer):
    ARCH = "klein4b"


class Klein9BLoRAAnalyzer(BaseLoRAAnalyzer):
    ARCH = "klein9b"


NODE_CLASS_MAPPINGS = {
    "Klein4BLoRAAnalyzer": Klein4BLoRAAnalyzer,
    "Klein9BLoRAAnalyzer": Klein9BLoRAAnalyzer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Klein4BLoRAAnalyzer": "Klein 4B LoRA Analyzer (TJ)",
    "Klein9BLoRAAnalyzer": "Klein 9B LoRA Analyzer (TJ)",
}
