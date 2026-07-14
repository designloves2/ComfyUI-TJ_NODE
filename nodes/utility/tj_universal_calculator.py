"""
TJ Node - Universal Calculator (single node)
Resolution (aspect/megapixel) + Time/Frame, both bidirectional with
"0 = empty (auto-solve)" behavior. Fill only the field you want; the
paired field is auto-computed from the master (aspect ratio / fps).
Live math happens in JS (tj_universal_calculator.js). Python mirrors the
same logic so direct/API execution also fills the blank fields.
"""

import math


def _round_to_multiple(value, multiple):
    multiple = max(1, int(multiple))
    return int(round(value / multiple) * multiple)


def _gcd_ratio(w, h):
    if w <= 0 or h <= 0:
        return "-"
    g = math.gcd(int(w), int(h)) or 1
    return f"{int(w) // g}:{int(h) // g}"


class TJ_UniversalCalculator:
    """
    해상도 + 시간/프레임 통합 계산기.
    0(빈칸)은 "자동 계산" 을 의미한다. 원하는 칸만 입력하면
    나머지는 기준값(비율 / fps)으로 자동 채워진다.
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
                "width": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 8}),
                "aspect_w": ("INT", {"default": 16, "min": 1, "max": 10000}),
                "aspect_h": ("INT", {"default": 9, "min": 1, "max": 10000}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.01, "max": 64.0, "step": 0.01}),
                "divisor": (["8", "16", "32", "64"], {"default": "8"}),
                "fps": ("FLOAT", {"default": 24.0, "min": 0.1, "max": 1000.0, "step": 0.01}),
                "seconds": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100000.0, "step": 0.01}),
                "frame_count": ("INT", {"default": 0, "min": 0, "max": 1000000}),
            }
        }

    def _solve_resolution(self, res_mode, width, height, aspect_w, aspect_h, megapixels, div):
        w = max(0, int(width))
        h = max(0, int(height))

        if res_mode == "aspect_ratio":
            aw = max(1, int(aspect_w))
            ah = max(1, int(aspect_h))
            if w > 0 and h == 0:
                h = _round_to_multiple(w * ah / aw, div)
            elif h > 0 and w == 0:
                w = _round_to_multiple(h * aw / ah, div)
            elif w > 0 and h > 0:
                # 둘 다 있으면 W 기준으로 H 정렬
                h = _round_to_multiple(w * ah / aw, div)
        else:  # megapixel
            target = megapixels * 1_000_000
            if w > 0 and h == 0:
                h = _round_to_multiple(target / w, div)
            elif h > 0 and w == 0:
                w = _round_to_multiple(target / h, div)
            elif w > 0 and h > 0:
                ratio = w / h
                new_h = math.sqrt(target / ratio)
                new_w = new_h * ratio
                w = _round_to_multiple(new_w, div)
                h = _round_to_multiple(new_h, div)

        if w > 0:
            w = max(div, _round_to_multiple(w, div))
        if h > 0:
            h = max(div, _round_to_multiple(h, div))
        return w, h

    def _solve_time(self, fps, seconds, frame_count):
        s = max(0.0, float(seconds))
        f = max(0, int(frame_count))
        if fps <= 0:
            return f, s
        if s > 0 and f == 0:
            f = int(round(s * fps))
        elif f > 0 and s == 0:
            s = round(f / fps, 4)
        elif s > 0 and f > 0:
            # 둘 다 있으면 seconds 기준으로 frame_count 정렬
            f = int(round(s * fps))
        return f, s

    def calculate(self, res_mode, width, height, aspect_w, aspect_h, megapixels,
                   divisor, fps, seconds, frame_count):
        div = int(divisor)

        final_w, final_h = self._solve_resolution(
            res_mode, width, height, aspect_w, aspect_h, megapixels, div)
        final_frames, final_seconds = self._solve_time(fps, seconds, frame_count)

        if final_w > 0 and final_h > 0:
            actual_mp = (final_w * final_h) / 1_000_000
            res_info = f"{final_w}x{final_h} ({_gcd_ratio(final_w, final_h)}) | {actual_mp:.2f}MP"
        else:
            res_info = "resolution: input W or H"

        if final_frames > 0 and final_seconds > 0:
            time_info = f"{final_frames}f @ {fps}fps = {final_seconds:.3f}s"
        else:
            time_info = "time: input seconds or frames"

        info = f"{res_info}  ||  {time_info}"
        return (final_w, final_h, final_frames, final_seconds, fps, info)


NODE_CLASS_MAPPINGS = {
    "TJ_UniversalCalculator": TJ_UniversalCalculator,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TJ_UniversalCalculator": "Universal Calculator (TJ)",
}
