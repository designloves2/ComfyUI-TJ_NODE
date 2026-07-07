# nodes/utility/index_lora_loader.py
# Queue Loop의 1-based index로 LoRA 슬롯을 선택하고 슬롯별 강도를 적용합니다.

from __future__ import annotations

import os
import threading

import comfy.sd
import comfy.utils
import folder_paths


NONE_VALUE = "[none]"
MAX_LORA_SLOTS = 20


def _lora_names():
    try:
        names = list(folder_paths.get_filename_list("loras") or [])
    except Exception:
        names = []
    return [NONE_VALUE] + names


def _lora_folders():
    """LoRA 경로에서 사용 가능한 서브폴더 목록을 반환합니다."""
    try:
        names = folder_paths.get_filename_list("loras") or []
    except Exception:
        return []
    folders: set[str] = set()
    for name in names:
        parts = name.replace("\\", "/").split("/")
        for i in range(1, len(parts)):
            folders.add("/".join(parts[:i]))
    return sorted(folders)


class TJ_IndexLoRALoader:
    _cache_lock = threading.RLock()
    _cached_path = None
    _cached_mtime = None
    _cached_lora = None

    @classmethod
    def INPUT_TYPES(cls):
        required = {
            "model": ("MODEL",),
            "clip": ("CLIP",),
            "index": ("INT", {
                "default": 1,
                "min": 1,
                "max": MAX_LORA_SLOTS,
                "step": 1,
                "tooltip": "1부터 시작. 첫 번째 LoRA는 index 1.",
            }),
            "auto_set": ("BOOLEAN", {
                "default": False,
                "label_on": "Auto Set ON",
                "label_off": "Auto Set OFF",
            }),
            "folder_filter": (["(all)"] + _lora_folders(), {
                "default": "(all)",
                "tooltip": "폴더를 선택하면 해당 폴더의 LoRA를 슬롯에 자동으로 채웁니다. 슬롯은 이후에도 직접 수정 가능합니다.",
            }),
            "overflow_mode": (["ERROR", "CLAMP", "LOOP", "BYPASS"], {
                "default": "ERROR",
            }),
            "get_name_model": (["(none)"], {"default": "(none)"}),
            "get_name_clip": (["(none)"], {"default": "(none)"}),
            "get_name_index": (["(none)"], {"default": "(none)"}),
        }

        lora_values = _lora_names()
        for slot in range(1, MAX_LORA_SLOTS + 1):
            required[f"lora_{slot}"] = (
                lora_values,
                {
                    "default": NONE_VALUE,
                    "tooltip": f"슬롯 {slot}. [none]이면 활성 목록에서 제외합니다.",
                },
            )
            required[f"strength_{slot}"] = ("FLOAT", {
                "default": 1.0,
                "min": -20.0,
                "max": 20.0,
                "step": 0.01,
                "tooltip": f"슬롯 {slot}의 LoRA 강도. model/clip 양쪽에 동일하게 적용됩니다.",
            })

        return {
            "required": required,
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING", "INT", "INT")
    RETURN_NAMES = ("MODEL", "CLIP", "lora_name", "current_index", "total_count")
    FUNCTION = "load_indexed_lora"
    CATEGORY = " ✨ TJ_Node/Loaders"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    @classmethod
    def _load_lora_file(cls, lora_name):
        path = folder_paths.get_full_path_or_raise("loras", lora_name)
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            mtime = None

        with cls._cache_lock:
            if (
                cls._cached_path == path
                and cls._cached_mtime == mtime
                and cls._cached_lora is not None
            ):
                return cls._cached_lora

            lora = comfy.utils.load_torch_file(path, safe_load=True)
            cls._cached_path = path
            cls._cached_mtime = mtime
            cls._cached_lora = lora
            return lora

    @staticmethod
    def _resolve_index(index, count, overflow_mode):
        if count <= 0:
            return None

        if 1 <= index <= count:
            return index

        if overflow_mode == "CLAMP":
            return min(max(index, 1), count)
        if overflow_mode == "LOOP":
            return ((index - 1) % count) + 1
        if overflow_mode == "BYPASS":
            return None

        raise ValueError(
            f"Queue index {index} is outside the active LoRA list range 1-{count}. "
            "The first LoRA is index 1."
        )

    def load_indexed_lora(
        self,
        model,
        clip,
        index,
        auto_set=False,
        folder_filter="(all)",
        overflow_mode="ERROR",
        get_name_model="(none)",
        get_name_clip="(none)",
        get_name_index="(none)",
        unique_id=None,
        **kwargs,
    ):
        # [none] 제외 후 활성 슬롯을 (slot_num, lora_name) 쌍으로 수집합니다.
        active_loras = []
        for slot in range(1, MAX_LORA_SLOTS + 1):
            value = kwargs.get(f"lora_{slot}", NONE_VALUE)
            if value and value != NONE_VALUE:
                active_loras.append((slot, value))

        total_count = len(active_loras)
        resolved_index = self._resolve_index(int(index), total_count, overflow_mode)

        if resolved_index is None:
            # BYPASS: LoRA 적용 없이 원본 model/clip 그대로 반환
            return (model, clip, "", int(index), total_count)

        slot_num, lora_name = active_loras[resolved_index - 1]
        # 해당 슬롯의 개별 강도를 사용합니다.
        strength = float(kwargs.get(f"strength_{slot_num}", 1.0))

        lora = self._load_lora_file(lora_name)
        loaded_model, loaded_clip = comfy.sd.load_lora_for_models(
            model,
            clip,
            lora,
            strength,
            strength,
        )

        display_name = os.path.splitext(os.path.basename(lora_name))[0]
        return (
            loaded_model,
            loaded_clip,
            display_name,
            resolved_index,
            total_count,
        )
