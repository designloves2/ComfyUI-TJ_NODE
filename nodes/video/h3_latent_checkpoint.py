# nodes/video/h3_latent_checkpoint.py
# MiniMax H3 Latent Checkpoint Save/Load (TJ)
#
# One-Take(h3_latent_continuation.py)는 클립 N의 샘플링 결과 latent를 클립 N+1에 그대로
# 이어붙인다. 하지만 MiniMax H3 ONE STUDIO의 릴레이는 클립마다 새 큐를 제출한다(모델 언로드로
# VRAM을 비우기 위해) — ComfyUI는 서로 다른 프롬프트(큐) 제출 사이에 텐서를 들고 있지 않으므로,
# in-memory로는 클립 N의 latent를 클립 N+1 제출에 넘길 방법이 없다.
#
# 그래서 클립마다: 샘플링 결과 latent를 이 노드로 디스크에 저장 -> 다음 클립 제출 때 다시
# 이 노드로 읽어서 Latent Continuation에 넘긴다. 저장소처럼 클립별 latent 체크포인트를
# safetensors로 남기면, 릴레이 구조(매 클립 새 큐 + VRAM 정리)를 그대로 유지하면서 latent를
# 이어붙일 수 있고 "중단 후 재개"도 자연히 따라온다.

import os

import torch
from safetensors.torch import save_file, load_file

import folder_paths
import comfy.nested_tensor
import comfy.model_management


def _checkpoint_dir():
    d = os.path.join(folder_paths.get_output_directory(), "one_minimax_h3", "_latent_checkpoints")
    os.makedirs(d, exist_ok=True)
    return d


def _safe_name(name):
    name = os.path.basename(str(name or "").strip())
    if not name or any(c in name for c in ("..", "/", "\\", "\0")):
        raise ValueError("MiniMax H3 Latent Checkpoint (TJ): 잘못된 checkpoint 이름입니다.")
    return name


class TJ_H3_SaveLatentCheckpoint:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "latent": ("LATENT",),
                "checkpoint_name": ("STRING", {"default": "clip001",
                    "tooltip": "확장자 없이 이름만 — <이름>.h3lat.safetensors 로 저장됩니다."}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("checkpoint_name",)
    FUNCTION = "save"
    CATEGORY = " ✨ TJ_Node/Video"
    OUTPUT_NODE = True

    def save(self, latent, checkpoint_name):
        samples = latent.get("samples")
        if not getattr(samples, "is_nested", False):
            raise ValueError(
                "MiniMax H3 Latent Checkpoint Save (TJ): H3 AV latent가 아닙니다 "
                "(NestedTensor 2-stream 필요)."
            )
        video, audio = samples.unbind()
        name = _safe_name(checkpoint_name)
        path = os.path.join(_checkpoint_dir(), f"{name}.h3lat.safetensors")
        save_file({
            "video": video.detach().to("cpu").contiguous(),
            "audio": audio.detach().to("cpu").contiguous(),
        }, path)
        return (name,)


class TJ_H3_LoadLatentCheckpoint:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "checkpoint_name": ("STRING", {"default": "clip001",
                    "tooltip": "TJ_H3_SaveLatentCheckpoint가 저장할 때 쓴 이름과 동일해야 합니다."}),
            },
        }

    RETURN_TYPES = ("LATENT",)
    RETURN_NAMES = ("latent",)
    FUNCTION = "load"
    CATEGORY = " ✨ TJ_Node/Video"

    def load(self, checkpoint_name):
        name = _safe_name(checkpoint_name)
        path = os.path.join(_checkpoint_dir(), f"{name}.h3lat.safetensors")
        if not os.path.isfile(path):
            raise ValueError(
                f"MiniMax H3 Latent Checkpoint Load (TJ): 체크포인트를 찾을 수 없습니다: {name}"
            )
        device = comfy.model_management.intermediate_device()
        tensors = load_file(path)
        video = tensors["video"].to(device)
        audio = tensors["audio"].to(device)
        return ({"samples": comfy.nested_tensor.NestedTensor((video, audio))},)
