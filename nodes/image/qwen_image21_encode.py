# nodes/image/qwen_image21_encode.py
# Text Encode Qwen Image 2.1 (TJ)
#
# Single-node fold of the 4-node subgraph a user built for Qwen Image 2.1 editing:
#   Batch to MinimaxH3 (TJ) -> Text Encode Qwen Image 2.1 (core) + ModelSamplingFlux
#   (core) -> Qwen Image 2.1 Cache (core).
# Batch to MinimaxH3 (TJ)'s job is fanning a single IMAGE batch out into the core
# node's numbered image_1..image_N Autogrow slots one frame at a time - its exact
# batch-normalization logic is reproduced in _split_images_to_slots() below rather than
# delegating to that node (its own RETURN_TYPES is fixed at 12 slots; this node needs up
# to MAX_REF_IMAGES).
#
# Every widget below (range, default, tooltip, combo options, max reference-image count)
# is read from the actual core node classes at import time rather than retyped by hand,
# so this node can't drift out of sync with them.

import torch

from comfy_extras.nodes_qwen import TextEncodeQwenImage21, QwenImage21Cache
from comfy_extras.nodes_model_advanced import ModelSamplingFlux

_FLUX_WIDGETS = ModelSamplingFlux.INPUT_TYPES()["required"]
_ENCODE_SCHEMA = TextEncodeQwenImage21.define_schema()
_CACHE_SCHEMA = QwenImage21Cache.define_schema()


def _schema_input(schema, input_id):
    for inp in schema.inputs:
        if getattr(inp, "id", None) == input_id:
            return inp
    raise KeyError(f"{schema.node_id}: input '{input_id}' not found - core node schema changed?")


def _int_widget(inp):
    return ("INT", {"default": inp.default, "min": inp.min, "max": inp.max,
                     "step": inp.step, "tooltip": inp.tooltip})


def _combo_widget(inp):
    return (list(inp.options), {"default": inp.default, "tooltip": inp.tooltip})


_RESOLUTION_INPUT = _schema_input(_ENCODE_SCHEMA, "resolution")
_IMAGES_INPUT = _schema_input(_ENCODE_SCHEMA, "images")
_CACHE_DEVICE_INPUT = _schema_input(_CACHE_SCHEMA, "device")
_CACHE_DTYPE_INPUT = _schema_input(_CACHE_SCHEMA, "dtype")

MAX_REF_IMAGES = len(_IMAGES_INPUT.template.names)


def _split_images_to_slots(images, max_slots):
    """Same batch-normalization as TJ_BatchToMinimaxH3.split() (batch_to_minimax_h3.py):
    accept a list/tuple of tensors or a >4D stacked tensor, flatten to one [N,H,W,C]
    batch, then hand out one frame per slot. Missing/overflow slots bypass (omitted
    entirely, matching TextEncodeQwenImage21's own `if image is None: continue`) rather
    than getting a black-image placeholder."""
    if isinstance(images, (list, tuple)):
        tensors = [x for x in images if isinstance(x, torch.Tensor)]
        if tensors:
            images = torch.cat([x.reshape(-1, *x.shape[-3:]) if x.ndim >= 4 else x for x in tensors], dim=0)

    if isinstance(images, torch.Tensor) and images.ndim > 4:
        images = images.reshape(-1, *images.shape[-3:])

    if not isinstance(images, torch.Tensor) or images.ndim != 4 or images.shape[0] == 0:
        return {}

    batch_size = int(images.shape[0])
    return {
        f"image_{i + 1}": images[i:i + 1]
        for i in range(min(batch_size, max_slots))
    }


class TJ_TextEncodeQwenImage21:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "prompt": ("STRING", {"multiline": True, "dynamicPrompts": True}),
                "negative_prompt": ("STRING", {"multiline": True, "dynamicPrompts": True}),
                "resolution": _int_widget(_RESOLUTION_INPUT),
                "max_shift": _FLUX_WIDGETS["max_shift"],
                "base_shift": _FLUX_WIDGETS["base_shift"],
                "sampling_width": _FLUX_WIDGETS["width"],
                "sampling_height": _FLUX_WIDGETS["height"],
                "cache_device": _combo_widget(_CACHE_DEVICE_INPUT),
                "cache_dtype": _combo_widget(_CACHE_DTYPE_INPUT),
            },
            "optional": {
                "vae": ("VAE",),
                "images": ("IMAGE", {"tooltip": f"Batch of up to {MAX_REF_IMAGES} reference "
                                                 "frames, fanned out one per Autogrow slot "
                                                 "(same effect as Batch to MinimaxH3 (TJ))."}),
                "get_name": (["(none)"], {"default": "(none)"}),
                "auto_set": ("BOOLEAN", {"default": False,
                    "tooltip": "켜면 4-출력을 setnode_name 기반 이름으로 자동 Set 등록."}),
                "setnode_name": ("STRING", {"default": "QwenImage21"}),
            },
        }

    RETURN_TYPES = ("MODEL", "CONDITIONING", "CONDITIONING", "LATENT")
    RETURN_NAMES = ("model", "positive", "negative", "latent")
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def run(self, model, clip, prompt, negative_prompt, resolution=None,
            max_shift=None, base_shift=None, sampling_width=None, sampling_height=None,
            cache_device=None, cache_dtype=None,
            vae=None, images=None, get_name="(none)", auto_set=False, setnode_name="QwenImage21"):
        patched = ModelSamplingFlux().patch(model, max_shift, base_shift, sampling_width, sampling_height)[0]
        cached_model = QwenImage21Cache.execute(patched, cache_device, cache_dtype).args[0]

        images_by_slot = _split_images_to_slots(images, MAX_REF_IMAGES) if images is not None else None

        positive, negative, latent = TextEncodeQwenImage21.execute(
            clip=clip, prompt=prompt, negative_prompt=negative_prompt,
            vae=vae, resolution=resolution, images=images_by_slot,
        ).args

        return (cached_model, positive, negative, latent)


NODE_CLASS_MAPPINGS = {
    "TJ_TextEncodeQwenImage21": TJ_TextEncodeQwenImage21,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TJ_TextEncodeQwenImage21": "Text Encode Qwen Image 2.1 (TJ)",
}
