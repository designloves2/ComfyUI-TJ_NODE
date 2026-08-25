# nodes/utility/free_text_encoder_vram.py
# Free Text Encoder VRAM (TJ)
#
# 목적: 텍스트 인코더 로드 -> conditioning 계산 -> (디퓨즈 모델 로드 -> 샘플링 -> 디코드) 순서로
# 도는 어떤 스튜디오/모델 워크플로우든, conditioning이 다 나온 직후 텍스트 인코더를 100%
# VRAM에서 내려서 샘플링 동안 디퓨즈 모델만 올라와 있게 만든다.
#
# ComfyUI의 스마트 메모리 관리는 "필요할 때" 알아서 내리지만, 그 판단이 항상 100%
# 깔끔하게 전부 내려주는 건 아니라서(일부 조각이 남는 경우가 있음) 이 노드로 명시적으로
# 강제 언로드 지점을 그래프에 박아둘 수 있다. 어떤 타입이든(CONDITIONING, LATENT 등)
# trigger로 받아서 그대로 통과시키므로, "이 conditioning이 나온 다음" 지점에 끼워 넣기만
# 하면 된다 — MiniMax H3 전용이 아니라 CLIP을 쓰는 어떤 노드 조합에도 범용으로 쓸 수 있다.

import comfy.model_management as mm

from ...core.tj_types import any_type


class TJ_FreeTextEncoderVRAM:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP", {"tooltip": "내리고 싶은 텍스트 인코더. conditioning을 만든 그 clip을 "
                                            "그대로 연결하세요."}),
                "trigger": (any_type, {"tooltip": "conditioning 등 아무 타입이나 연결하세요 — 이 노드는 "
                                                  "그 값을 그대로 통과시키기만 하고, 실제로 하는 일은 "
                                                  "'이 입력이 준비된 시점'에 clip을 강제로 언로드하는 것."}),
            },
        }

    RETURN_TYPES = (any_type, "STRING")
    RETURN_NAMES = ("trigger", "report")
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/Utility"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # 캐시되면 언로드가 실제로 재실행되지 않을 수 있으니 매번 강제로 실행.
        return float("nan")

    def run(self, clip, trigger):
        report_lines = ["Free Text Encoder VRAM (TJ)"]
        patcher = getattr(clip, "patcher", None)
        if patcher is None:
            report_lines.append("clip.patcher를 찾지 못해 아무 것도 내리지 않았습니다.")
            return (trigger, "\n".join(report_lines))

        try:
            device = getattr(patcher, "load_device", None)
            before = mm.get_free_memory(device) if device is not None else None
        except Exception:
            before = None

        try:
            mm.unload_model_and_clones(patcher, unload_additional_models=True)
            mm.soft_empty_cache()
        except Exception as e:
            report_lines.append(f"언로드 중 오류(무시하고 계속 진행): {e}")
            return (trigger, "\n".join(report_lines))

        try:
            after = mm.get_free_memory(device) if device is not None else None
        except Exception:
            after = None

        if before is not None and after is not None:
            freed_gb = (after - before) / (1024 ** 3)
            report_lines.append(
                f"text encoder unloaded. free VRAM: {before/1024**3:.2f}GB -> {after/1024**3:.2f}GB "
                f"({'+' if freed_gb >= 0 else ''}{freed_gb:.2f}GB)"
            )
        else:
            report_lines.append("text encoder unloaded.")

        return (trigger, "\n".join(report_lines))
