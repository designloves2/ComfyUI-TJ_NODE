# showany_tj.py

import json
import pprint
import torch
import numpy as np


class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False


any_type = AnyType("*")


def _tj_tensor_summary(value):
    try:
        shape = tuple(value.shape)
        dtype = str(value.dtype)
        device = str(value.device)
        if value.numel() == 0:
            return f"Tensor(shape={shape}, dtype={dtype}, device={device}, empty=True)"
        v = value.detach().float().cpu()
        return (
            f"Tensor(shape={shape}, dtype={dtype}, device={device}, "
            f"min={float(v.min()):.6g}, max={float(v.max()):.6g}, mean={float(v.mean()):.6g})"
        )
    except Exception:
        return repr(value)


def _tj_make_json_safe(value, depth=0, max_depth=6):
    if depth > max_depth:
        return "..."
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, torch.Tensor):
        return _tj_tensor_summary(value)
    if isinstance(value, np.ndarray):
        try:
            return f"ndarray(shape={value.shape}, dtype={value.dtype}, min={value.min():.6g}, max={value.max():.6g}, mean={value.mean():.6g})"
        except Exception:
            return f"ndarray(shape={value.shape}, dtype={value.dtype})"
    if isinstance(value, dict):
        return {str(k): _tj_make_json_safe(v, depth + 1, max_depth) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_tj_make_json_safe(v, depth + 1, max_depth) for v in list(value)]
    try:
        if hasattr(value, "__dict__"):
            return {
                "__class__": value.__class__.__name__,
                "__dict__": _tj_make_json_safe(vars(value), depth + 1, max_depth),
            }
    except Exception:
        pass
    return repr(value)


def _tj_any_to_text(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, torch.Tensor):
        return _tj_tensor_summary(value)
    try:
        safe = _tj_make_json_safe(value)
        return json.dumps(safe, ensure_ascii=False, indent=2)
    except Exception:
        try:
            return pprint.pformat(value, width=120, compact=False)
        except Exception:
            return repr(value)


class TJ_ShowAny:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # Prompt Text 방식 그대로: ComfyUI 기본 multiline STRING 위젯을 표시 필드로 사용
                "text": ("STRING", {"multiline": True, "default": ""}),
                "get_name": (["(none)"],),
                "setnode_name": ("STRING", {"default": ""}),
            },
            "optional": {
                "any": (any_type,),
            },
        }

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("output",)
    FUNCTION = "process"
    CATEGORY = " ✨ TJ_Node/Preview"
    OUTPUT_NODE = True

    def process(self, text="", get_name="(none)", setnode_name="", **kwargs):
        value = kwargs.get("any", None)
        shown_text = _tj_any_to_text(value)
        return {"ui": {"tj_show_any_text": [shown_text]}, "result": (value,)}


NODE_CLASS_MAPPINGS = {
    "TJ_ShowAny": TJ_ShowAny,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TJ_ShowAny": "Show Any (TJ)",
}
