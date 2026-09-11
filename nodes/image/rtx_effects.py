# nodes/image/rtx_effects.py
# RTX Deblur / RTX Denoise / RTX VSR (TJ) — standalone NVIDIA VFX SDK filters.
#
# The SDK exposes deblur/denoise as quality levels of the same VideoSuperRes filter the
# RTX upscale node (comfyui_nvidia_rtx_nodes' RTXVideoSuperResolution) uses, not as
# separate effect classes — see nvvfx.effects.QualityLevel: LOW..ULTRA (upscale),
# DENOISE_LOW..ULTRA, DEBLUR_LOW..ULTRA, HIGHBITRATE_LOW..ULTRA. Deblur/Denoise are
# same-resolution processing (NVIDIA's own docs), so their output width/height are
# always set to the input's, never derived from a scale factor.
#
# These live here (TJ_NODE) rather than as a patch to comfyui_nvidia_rtx_nodes because
# that pack is a git checkout: editing it in place would leave the tree dirty, and
# update_all_nodes.bat skips dirty repos, silently freezing that pack at its current
# version forever.

import torch


def _require_nvvfx(node_label):
    try:
        import nvvfx
        return nvvfx
    except Exception as e:
        raise RuntimeError(
            f"{node_label}: NVIDIA VFX SDK not available. Install "
            "comfyui_nvidia_rtx_nodes and its runtime (needs an RTX GPU + the NVIDIA "
            f"video-effects SDK libraries). ({e})"
        )


def _rtx_batch_size(width, height, max_pixels=1024 * 1024 * 16):
    return max(1, max_pixels // max(1, width * height))


def _rtx_run_same_res(nvvfx, images, quality):
    """Deblur / Denoise: output size == input size."""
    b, h, w, c = images.shape
    batch_size = _rtx_batch_size(w, h)
    out = torch.empty_like(images)
    with nvvfx.VideoSuperRes(quality) as sr:
        sr.output_width = w
        sr.output_height = h
        sr.load()
        for i in range(0, b, batch_size):
            chunk = images[i:i + batch_size].cuda().permute(0, 3, 1, 2).float().contiguous()
            for j in range(chunk.shape[0]):
                dl = sr.run(chunk[j]).image
                out[i + j:i + j + 1] = torch.from_dlpack(dl).movedim(0, -1).unsqueeze(0)
    return out


def _rtx_run_upscale(nvvfx, images, quality, output_width, output_height):
    """VSR: output size derived from scale/target dims, snapped to a multiple of 8."""
    b, h, w, c = images.shape
    output_width = max(8, round(output_width / 8) * 8)
    output_height = max(8, round(output_height / 8) * 8)
    batch_size = _rtx_batch_size(output_width, output_height)
    out = torch.empty((b, output_height, output_width, c), dtype=images.dtype)
    with nvvfx.VideoSuperRes(quality) as sr:
        sr.output_width = output_width
        sr.output_height = output_height
        sr.load()
        for i in range(0, b, batch_size):
            chunk = images[i:i + batch_size].cuda().permute(0, 3, 1, 2).float().contiguous()
            for j in range(chunk.shape[0]):
                dl = sr.run(chunk[j]).image
                out[i + j:i + j + 1] = torch.from_dlpack(dl).movedim(0, -1).unsqueeze(0).cpu()
    return out


_LEVELS = ("LOW", "MEDIUM", "HIGH", "ULTRA")


class TJ_NODE_RTXDeblur:
    """NVIDIA VFX deblur — sharpen soft/motion-blurred footage. Resolution unchanged.

    Class/registry key is TJ_NODE_RTXDeblur (not TJ_RTXDeblur) on purpose: STUDIO_ONE's
    pack already registers its own node under the literal key "TJ_RTXDeblur", and
    ComfyUI merges every pack's NODE_CLASS_MAPPINGS into one global dict — same key
    means whichever pack loads last silently overwrites the other's node. Same display
    name ("RTX Deblur (TJ)") is intentional and fine; only the key must be unique.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "strength": (list(_LEVELS), {
                    "default": "MEDIUM",
                    "tooltip": "Deblur intensity. Resolution is never changed — this "
                               "sharpens, it does not upscale.",
                }),
            },
            "optional": {
                "get_name": (["(none)"], {"default": "(none)"}),
                "setnode_name": ("STRING", {"default": "RTX_Deblur"}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def run(self, images, strength="MEDIUM", get_name="(none)", setnode_name="RTX_Deblur"):
        nvvfx = _require_nvvfx("RTX Deblur (TJ)")
        quality = getattr(nvvfx.effects.QualityLevel, f"DEBLUR_{strength}", None)
        if quality is None:
            raise RuntimeError(
                f"RTX Deblur (TJ): this NVIDIA VFX SDK build has no DEBLUR_{strength} "
                f"level. SDK reports version {nvvfx.get_sdk_version()}."
            )
        return (_rtx_run_same_res(nvvfx, images, quality),)


class TJ_NODE_RTXDenoise:
    """NVIDIA VFX denoise — clean up sensor/compression noise. Resolution unchanged."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "strength": (list(_LEVELS), {
                    "default": "MEDIUM",
                    "tooltip": "Denoise intensity. Resolution is never changed.",
                }),
            },
            "optional": {
                "get_name": (["(none)"], {"default": "(none)"}),
                "setnode_name": ("STRING", {"default": "RTX_Denoise"}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def run(self, images, strength="MEDIUM", get_name="(none)", setnode_name="RTX_Denoise"):
        nvvfx = _require_nvvfx("RTX Denoise (TJ)")
        quality = getattr(nvvfx.effects.QualityLevel, f"DENOISE_{strength}", None)
        if quality is None:
            raise RuntimeError(
                f"RTX Denoise (TJ): this NVIDIA VFX SDK build has no DENOISE_{strength} "
                f"level. SDK reports version {nvvfx.get_sdk_version()}."
            )
        return (_rtx_run_same_res(nvvfx, images, quality),)


class TJ_NODE_RTXVSR:
    """NVIDIA VFX Video Super Resolution — upscale by a factor or to exact dimensions."""

    _RESIZE_TYPES = ("scale by multiplier", "target dimensions")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "resize_type": (list(cls._RESIZE_TYPES), {"default": "scale by multiplier"}),
                "scale": ("FLOAT", {"default": 2.0, "min": 1.0, "max": 4.0, "step": 0.01,
                    "tooltip": "Used when resize_type = scale by multiplier."}),
                "width": ("INT", {"default": 1920, "min": 64, "max": 8192, "step": 8,
                    "tooltip": "Used when resize_type = target dimensions."}),
                "height": ("INT", {"default": 1080, "min": 64, "max": 8192, "step": 8,
                    "tooltip": "Used when resize_type = target dimensions."}),
                "quality": (list(_LEVELS), {"default": "ULTRA"}),
            },
            "optional": {
                "get_name": (["(none)"], {"default": "(none)"}),
                "setnode_name": ("STRING", {"default": "RTX_VSR"}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("upscaled_images",)
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def run(self, images, resize_type="scale by multiplier", scale=2.0, width=1920,
             height=1080, quality="ULTRA", get_name="(none)", setnode_name="RTX_VSR"):
        nvvfx = _require_nvvfx("RTX VSR (TJ)")
        b, h, w, c = images.shape
        if resize_type == "target dimensions":
            out_w, out_h = int(width), int(height)
        else:
            out_w, out_h = int(w * scale), int(h * scale)

        quality_level = getattr(nvvfx.effects.QualityLevel, quality, None)
        if quality_level is None:
            raise RuntimeError(
                f"RTX VSR (TJ): this NVIDIA VFX SDK build has no {quality} level. "
                f"SDK reports version {nvvfx.get_sdk_version()}."
            )
        return (_rtx_run_upscale(nvvfx, images, quality_level, out_w, out_h),)
