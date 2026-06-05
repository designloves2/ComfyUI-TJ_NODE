# smart_converter_tj.py

import json
import math
import torch
import numpy as np


class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False


any_type = AnyType("*")
OUTPUT_TYPES = ["AUTO", "INT", "FLOAT", "STRING", "BOOLEAN", "TENSOR", "LIST", "DICT", "JSON"]


def _is_tensor(value):
    return isinstance(value, torch.Tensor)


def _is_numpy(value):
    return isinstance(value, np.ndarray)


def _is_scalar_tensor(value):
    return _is_tensor(value) and value.numel() == 1


def _tensor_scalar(value):
    return value.detach().cpu().reshape(-1)[0].item()


def _summary(value):
    if value is None:
        return "None"
    if _is_tensor(value):
        return f"Tensor(shape={tuple(value.shape)}, dtype={value.dtype}, device={value.device})"
    if _is_numpy(value):
        return f"ndarray(shape={value.shape}, dtype={value.dtype})"
    return f"{type(value).__name__}: {repr(value)}"


def _json_safe(value, depth=0, max_depth=6):
    if depth > max_depth:
        return "..."
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if _is_tensor(value):
        return {
            "__type__": "torch.Tensor",
            "shape": list(value.shape),
            "dtype": str(value.dtype),
            "device": str(value.device),
            "scalar": _tensor_scalar(value) if _is_scalar_tensor(value) else None,
        }
    if _is_numpy(value):
        return {
            "__type__": "numpy.ndarray",
            "shape": list(value.shape),
            "dtype": str(value.dtype),
            "scalar": value.reshape(-1)[0].item() if value.size == 1 else None,
        }
    if isinstance(value, dict):
        return {str(k): _json_safe(v, depth + 1, max_depth) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v, depth + 1, max_depth) for v in list(value)]
    try:
        if hasattr(value, "__dict__"):
            return {"__class__": value.__class__.__name__, "__dict__": _json_safe(vars(value), depth + 1, max_depth)}
    except Exception:
        pass
    return repr(value)


def _is_number_string(value):
    if not isinstance(value, str):
        return False
    try:
        s = value.strip()
        if not s:
            return False
        float(s)
        return True
    except Exception:
        return False


def _string_to_bool(value):
    s = str(value).strip().lower()
    if s in {"true", "yes", "y", "on", "1"}:
        return True
    if s in {"false", "no", "n", "off", "0", ""}:
        return False
    raise ValueError(f'cannot convert string "{value}" to BOOLEAN')


def _auto_type(value):
    if isinstance(value, bool):
        return "BOOLEAN"
    if isinstance(value, int) and not isinstance(value, bool):
        return "INT"
    if isinstance(value, float):
        return "FLOAT"
    if isinstance(value, str):
        return "STRING"
    if _is_tensor(value) or _is_numpy(value):
        return "TENSOR"
    if isinstance(value, dict):
        return "DICT"
    if isinstance(value, (list, tuple, set)):
        return "LIST"
    return "STRING"


def _to_int(value):
    if value is None:
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return int(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("non-finite FLOAT cannot convert to INT")
        return int(value)
    if isinstance(value, str):
        if not _is_number_string(value):
            raise ValueError(f'cannot convert string "{value}" to INT')
        return int(float(value.strip()))
    if _is_scalar_tensor(value):
        return int(_tensor_scalar(value))
    if _is_numpy(value) and value.size == 1:
        return int(value.reshape(-1)[0].item())
    if isinstance(value, (list, tuple)) and len(value) == 1:
        return _to_int(value[0])
    raise ValueError(f"{_summary(value)} cannot convert to INT")


def _to_float(value):
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        if not _is_number_string(value):
            raise ValueError(f'cannot convert string "{value}" to FLOAT')
        return float(value.strip())
    if _is_scalar_tensor(value):
        return float(_tensor_scalar(value))
    if _is_numpy(value) and value.size == 1:
        return float(value.reshape(-1)[0].item())
    if isinstance(value, (list, tuple)) and len(value) == 1:
        return _to_float(value[0])
    raise ValueError(f"{_summary(value)} cannot convert to FLOAT")


def _to_bool(value):
    if value is None:
        return False
    if isinstance(value, bool):
        return bool(value)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return bool(value)
    if isinstance(value, str):
        return _string_to_bool(value)
    if _is_scalar_tensor(value):
        return bool(_tensor_scalar(value))
    if _is_numpy(value) and value.size == 1:
        return bool(value.reshape(-1)[0].item())
    if isinstance(value, (list, tuple, set, dict)):
        return bool(value)
    raise ValueError(f"{_summary(value)} cannot convert to BOOLEAN")


def _to_string(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if _is_tensor(value):
        if _is_scalar_tensor(value):
            return str(_tensor_scalar(value))
        return _summary(value)
    if _is_numpy(value):
        if value.size == 1:
            return str(value.reshape(-1)[0].item())
        return _summary(value)
    try:
        return json.dumps(_json_safe(value), ensure_ascii=False, indent=2)
    except Exception:
        return repr(value)


def _to_tensor(value):
    if value is None:
        return torch.zeros((1,), dtype=torch.float32)
    if _is_tensor(value):
        return value
    if _is_numpy(value):
        return torch.from_numpy(value)
    if isinstance(value, bool):
        return torch.tensor([1.0 if value else 0.0], dtype=torch.float32)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return torch.tensor([float(value)], dtype=torch.float32)
    if isinstance(value, str):
        if not _is_number_string(value):
            raise ValueError(f'cannot convert non-numeric string "{value}" to TENSOR')
        return torch.tensor([float(value.strip())], dtype=torch.float32)
    if isinstance(value, (list, tuple)):
        try:
            return torch.tensor(value, dtype=torch.float32)
        except Exception as e:
            raise ValueError(f"list/tuple cannot convert to TENSOR: {e}")
    raise ValueError(f"{_summary(value)} cannot convert to TENSOR")


def _to_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, set):
        return list(value)
    if _is_tensor(value):
        return value.detach().cpu().tolist()
    if _is_numpy(value):
        return value.tolist()
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return []
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return parsed
            return [parsed]
        except Exception:
            return [value]
    return [value]


def _to_dict(value):
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return {}
        try:
            parsed = json.loads(s)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
        raise ValueError("STRING is not a JSON object, cannot convert to DICT")
    if hasattr(value, "__dict__"):
        return dict(vars(value))
    raise ValueError(f"{_summary(value)} cannot convert to DICT")


def _to_json(value):
    return json.dumps(_json_safe(value), ensure_ascii=False, indent=2)


def _convert(value, output_type):
    target = _auto_type(value) if output_type == "AUTO" else output_type
    if target == "INT":
        return _to_int(value), target
    if target == "FLOAT":
        return _to_float(value), target
    if target == "STRING":
        return _to_string(value), target
    if target == "BOOLEAN":
        return _to_bool(value), target
    if target == "TENSOR":
        return _to_tensor(value), target
    if target == "LIST":
        return _to_list(value), target
    if target == "DICT":
        return _to_dict(value), target
    if target == "JSON":
        return _to_json(value), target
    return value, "*"


def _default_for(output_type):
    target = output_type if output_type != "AUTO" else "STRING"
    if target == "INT":
        return 0
    if target == "FLOAT":
        return 0.0
    if target == "STRING":
        return ""
    if target == "BOOLEAN":
        return False
    if target == "TENSOR":
        return torch.zeros((1,), dtype=torch.float32)
    if target == "LIST":
        return []
    if target == "DICT":
        return {}
    if target == "JSON":
        return "null"
    return None


class TJ_SmartConverter:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "output_type": (OUTPUT_TYPES, {"default": "AUTO"}),
                "get_name": (["(none)"],),
                "setnode_name": ("STRING", {"default": ""}),
                "strict_mode": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "any": (any_type,),
            },
        }

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    RETURN_TYPES = (any_type, "STRING")
    RETURN_NAMES = ("output", "status")
    FUNCTION = "process"
    CATEGORY = " ✨ TJ_Node/Utility"

    def process(self, output_type="AUTO", get_name="(none)", setnode_name="", strict_mode=False, any=None):
        requested = output_type if output_type in OUTPUT_TYPES else "AUTO"
        try:
            converted, actual_type = _convert(any, requested)
            status = f"OK: {_summary(any)} -> {actual_type}"
            return {"ui": {"tj_smart_converter_status": [status], "tj_smart_converter_type": [actual_type]}, "result": (converted, status)}
        except Exception as e:
            status = f"WARN: {requested} conversion failed: {e}"
            if strict_mode:
                raise ValueError(f"[TJ_NODE Smart Converter] {status}")
            return {"ui": {"tj_smart_converter_status": [status], "tj_smart_converter_type": [requested]}, "result": (_default_for(requested), status)}


NODE_CLASS_MAPPINGS = {"TJ_SmartConverter": TJ_SmartConverter}
NODE_DISPLAY_NAME_MAPPINGS = {"TJ_SmartConverter": "Smart Converter (TJ)"}
