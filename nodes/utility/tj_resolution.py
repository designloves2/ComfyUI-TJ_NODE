"""
TJ Node - Resolution (TJ)
비율 프리셋 / 커스텀 비율 / 커스텀 해상도를 DOM UI 로 고르고 width·height 를 출력.
실제 UI 와 계산은 프론트엔드(web/tj_resolution.js)에서 수행하고,
여기서는 최종 위젯 값을 검증해 출력만 한다.
"""


class TJ_Resolution:
    CATEGORY = " ✨ TJ_Node/Utility"
    FUNCTION = "run"
    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # Auto Set — width/height 출력을 Wireless Provider 로 자동 등록
                "auto_set": ("BOOLEAN", {"default": False,
                             "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
                # JS DOM UI 가 채우는 값 (위젯은 JS 에서 숨김)
                "width":  ("INT", {"default": 1024, "min": 8, "max": 16384, "step": 8}),
                "height": ("INT", {"default": 1024, "min": 8, "max": 16384, "step": 8}),
                # UI 상태 보존용(모드/비율/기준크기/스냅) — 워크플로우 저장 시 함께 저장됨
                "ui_state": ("STRING", {"default": "", "multiline": False}),
            }
        }

    def run(self, width, height, auto_set=False, ui_state=""):
        w = max(8, int(width))
        h = max(8, int(height))
        return (w, h)


NODE_CLASS_MAPPINGS = {
    "TJ_Resolution": TJ_Resolution,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TJ_Resolution": "Resolution (TJ)",
}
