"""
TJ Node - Universal Calculator (single node)
Resolution (aspect/megapixel, bidirectional) + Time/Frame (bidirectional, simultaneous)
All live math happens in JS (tj_universal_calculator.js). Python just finalizes/outputs.
"""

import math


def _round_to_multiple(value, multiple):
    multiple = max(1, int(multiple))
    return int(round(value / multiple) * multiple)


class TJ_UniversalCalculator:
    """
    해상도 + 시간/프레임 통합 계산기.
    위젯 값은 프론트엔드(JS)에서 실시간으로 서로 동기화됨.
    이 노드 실행 시에는 그 시점의 최종 위젯 값을 그대로 검증/반올림해서 출력함.
    """

    CATEGORY = " ✨ TJ_Node/Utility"
    FUNCTION = "calculate"
    RETURN_TYPES = ("INT", "INT", "INT", "FLOAT", "FLOAT", "STRING")
    RETURN_NAMES = ("width", "height", "frame_count", "seconds", "fps", "info")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "res_mode": (["aspect_ratio", "megapixel"], {"default": "aspect_ratio"}),
                "width": ("INT", {"default": 1024, "min": 8, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 576, "min": 8, "max": 8192, "step": 8}),
                "aspect_w": ("INT", {"default": 16, "min": 1, "max": 10000}),
                "aspect_h": ("INT", {"default": 9, "min": 1, "max": 10000}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.01, "max": 64.0, "step": 0.01}),
                "divisor": (["8", "16", "32", "64"], {"default": "8"}),
                "fps": ("FLOAT", {"default": 24.0, "min": 0.1, "max": 1000.0, "step": 0.01}),
                "seconds": ("FLOAT", {"default": 5.0, "min": 0.0, "max": 100000.0, "step": 0.01}),
                "frame_count": ("INT", {"default": 120, "min": 0, "max": 1000000}),
            }
        }

    def calculate(self, res_mode, width, height, aspect_w, aspect_h, megapixels,
                   divisor, fps, seconds, frame_count):
        div = int(divisor)

        # 안전망: 혹시 JS 동기화 없이 실행된 경우(워크플로우 API 직접 실행 등)를 대비해
        # 최종 출력 직전 배수 보정만 다시 적용
        final_w = max(div, _round_to_multiple(width, div))
        final_h = max(div, _round_to_multiple(height, div))

        # frame/seconds도 fps 기준으로 일관성 보정 (frame_count를 기준으로 seconds 재확인)
        final_seconds = round(frame_count / fps, 4) if fps > 0 else seconds

        ratio = final_w / final_h
        actual_mp = (final_w * final_h) / 1_000_000
        info = (f"{final_w}x{final_h} | {actual_mp:.2f}MP | ratio {ratio:.4f} "
                f"| {frame_count}f @ {fps}fps = {final_seconds:.3f}s")

        return (final_w, final_h, frame_count, final_seconds, fps, info)


NODE_CLASS_MAPPINGS = {
    "TJ_UniversalCalculator": TJ_UniversalCalculator,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TJ_UniversalCalculator": "Universal Calculator (TJ)",
}
