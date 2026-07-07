# nodes/utility/led_display.py
from __future__ import annotations


class AnyType(str):
    def __ne__(self, _: object) -> bool:
        return False


any_type = AnyType("*")


class TJ_LEDDisplay:
    """LED Display (TJ) - 전광판 스타일 텍스트/숫자 디스플레이 노드."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "tooltip": "표시할 텍스트. value 입력이 연결된 경우 덮어씌워집니다.",
                }),
                "font_size": ("INT", {
                    "default": 64,
                    "min": 8,
                    "max": 256,
                    "step": 1,
                    "tooltip": "글씨 크기 (px). 슬라이더를 드래그하면 라이브로 크기가 바뀝니다.",
                }),
                "text_color": ("STRING", {
                    "default": "#00FF41",
                    "tooltip": "#00FF41 초록 · #FFB300 주황 · #FF3131 빨강 · #00FFFF 청록 · #FFFFFF 흰색",
                }),
                "bg_color": ("STRING", {
                    "default": "#0A0A0A",
                    "tooltip": "배경 색상 (HEX).",
                }),
                "label": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "tooltip": "패널 왼쪽 상단에 작게 표시되는 라벨.",
                }),
            },
            "optional": {
                "value": (any_type, {
                    "forceInput": True,
                    "tooltip": "연결하면 text 위젯 대신 이 값을 표시합니다. INT / FLOAT / STRING 모두 허용.",
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("value",)
    FUNCTION = "display"
    CATEGORY = " ✨ TJ_Node/Utility"
    OUTPUT_NODE = True

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def display(
        self,
        text: str,
        font_size: int,
        text_color: str,
        bg_color: str,
        label: str = "",
        value=None,
        unique_id=None,
    ):
        display_val = value if value is not None else text

        if isinstance(display_val, float):
            # 소수점 불필요한 0 제거 (예: 1.0 → 1, 3.14000 → 3.14)
            display_str = f"{display_val:.6g}"
        elif isinstance(display_val, bool):
            display_str = "TRUE" if display_val else "FALSE"
        else:
            display_str = str(display_val)

        return {
            "ui": {"tj_led": [{"text": display_str, "label": label}]},
            "result": (display_val,),
        }
