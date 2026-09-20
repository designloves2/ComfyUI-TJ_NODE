# nodes/image/skin_retouch.py
# Skin Retouch (TJ) — thin ComfyUI IMAGE adapter around VRGDG-SeedVR2-TensorRT-Studio's
# apply_skin_finishing() / apply_skin_microtexture() (tools/postprocess_tensor_video.py).
#
# Ported nearly verbatim on request (STUDIO_ONE, for the MiniMax H3 Postprocess chain's
# "Skin Retouch" step) — pure PyTorch, no external model/checkpoint, YCbCr-based skin-
# likelihood mask so only tone/blemishes/shine/microtexture are touched and identity is
# never altered (non-generative). Kept as its own file rather than folded into
# rtx_effects.py since it has nothing to do with the NVIDIA VFX SDK.
#
# The source functions operate on a 5D [B, C, F, H, W] tensor (F = frame count).
# ComfyUI's IMAGE type is [N, H, W, C] (N = batch/frame count). This node treats the
# whole incoming batch as one clip: [N,H,W,C] -> [1,C,N,H,W] (unsqueeze a batch=1 dim,
# existing batch becomes the frame axis) -> run -> [1,C,N,H,W] -> [N,H,W,C].

import torch
import torch.nn.functional as F


def _box_blur(value, kernel):
    radius = kernel // 2
    return F.avg_pool2d(F.pad(value, (radius, radius, radius, radius), mode="replicate"), kernel, stride=1)


def _skin_likelihood(flat):
    red, green, blue = flat[:, 0:1], flat[:, 1:2], flat[:, 2:3]
    luma = 0.299 * red + 0.587 * green + 0.114 * blue
    cb = 0.5 - 0.168736 * red - 0.331264 * green + 0.5 * blue
    cr = 0.5 + 0.5 * red - 0.418688 * green - 0.081312 * blue
    skin = (
        torch.sigmoid((cb - 0.26) * 32.0)
        * torch.sigmoid((0.55 - cb) * 32.0)
        * torch.sigmoid((cr - 0.50) * 36.0)
        * torch.sigmoid((0.73 - cr) * 32.0)
        * torch.sigmoid((cr - cb - 0.015) * 30.0)
        * torch.sigmoid((luma - 0.055) * 28.0)
        * torch.sigmoid((0.97 - luma) * 28.0)
    )
    return _box_blur(skin, 9)


def _stable_center_mask(skin, batch, ext_frames, local_start, local_end):
    shaped = skin.reshape(batch, ext_frames, 1, skin.shape[-2], skin.shape[-1]).permute(0, 2, 1, 3, 4)
    shaped = F.avg_pool3d(F.pad(shaped, (0, 0, 0, 0, 1, 1), mode="replicate"), (3, 1, 1), stride=1)
    return shaped[:, :, local_start:local_end].permute(0, 2, 1, 3, 4).reshape(-1, 1, skin.shape[-2], skin.shape[-1])


def apply_skin_finishing(video, evenness, smoothing, redness, shine, blemish_mode, preserve_marks):
    """Conservative, non-generative complexion finishing. video: [B,C,F,H,W] in [0,1]."""
    evenness = max(0.0, min(1.0, float(evenness)))
    smoothing = max(0.0, min(1.0, float(smoothing)))
    redness = max(0.0, min(1.0, float(redness)))
    shine = max(0.0, min(1.0, float(shine)))
    blemish_mode = blemish_mode if blemish_mode in {"off", "subtle", "strong"} else "off"
    if max(evenness, smoothing, redness, shine) <= 0 and blemish_mode == "off":
        return video
    batch, _, frame_count, _, _ = video.shape
    for start in range(0, frame_count, 4):
        end = min(frame_count, start + 4)
        ext_start, ext_end = max(0, start - 1), min(frame_count, end + 1)
        frames = video[:, :, ext_start:ext_end].permute(0, 2, 1, 3, 4)
        flat = frames.reshape(-1, 3, frames.shape[-2], frames.shape[-1])
        ext_frames = ext_end - ext_start
        local_start, local_end = start - ext_start, start - ext_start + (end - start)
        skin = _stable_center_mask(_skin_likelihood(flat), batch, ext_frames, local_start, local_end)
        center = flat.reshape(batch, ext_frames, 3, flat.shape[-2], flat.shape[-1])[:, local_start:local_end]
        result = center.reshape(-1, 3, flat.shape[-2], flat.shape[-1])
        luma = 0.299 * result[:, 0:1] + 0.587 * result[:, 1:2] + 0.114 * result[:, 2:3]
        medium = luma - _box_blur(luma, 7)
        edge_guard = 1.0 - 0.88 * torch.sigmoid((medium.abs() - 0.065) * 45.0)
        mask = (skin * edge_guard).clamp(0, 1)

        if evenness > 0:
            target = result + _box_blur(result, 21) - _box_blur(result, 5)
            result = result.lerp(target.clamp(0, 1), mask * evenness * 0.75)
        if smoothing > 0:
            result = result.lerp(_box_blur(result, 3), mask * smoothing * 0.72)
        if blemish_mode != "off":
            luma = 0.299 * result[:, 0:1] + 0.587 * result[:, 1:2] + 0.114 * result[:, 2:3]
            local_luma = _box_blur(luma, 5)
            threshold = 0.085 if preserve_marks else 0.052
            spot = torch.sigmoid(((luma - local_luma).abs() - threshold) * 65.0) * mask
            amount = 0.24 if blemish_mode == "subtle" else 0.48
            result = result.lerp(_box_blur(result, 5), spot * amount)
        if redness > 0:
            red, green, blue = result[:, 0:1], result[:, 1:2], result[:, 2:3]
            excess = (red - 0.5 * (green + blue) - 0.025).clamp_min(0)
            correction = excess * mask * redness * 0.55
            result = torch.cat((red - correction, green + correction * 0.18, blue + correction * 0.08), dim=1).clamp(0, 1)
        if shine > 0:
            luma = 0.299 * result[:, 0:1] + 0.587 * result[:, 1:2] + 0.114 * result[:, 2:3]
            local_luma = _box_blur(luma, 15)
            highlight_floor = torch.maximum(local_luma + 0.045, torch.full_like(luma, 0.70))
            reduction = (luma - highlight_floor).clamp_min(0) * mask * shine * 0.75
            result = (result - reduction).clamp(0, 1)
        video[:, :, start:end] = result.reshape(batch, end - start, 3, result.shape[-2], result.shape[-1]).permute(0, 2, 1, 3, 4)
    return video


def apply_skin_microtexture(video, strength):
    """Enhance existing skin-scale luma detail without sharpening facial edges. video: [B,C,F,H,W]."""
    strength = max(0.0, min(3.0, float(strength)))
    if strength <= 0:
        return video
    batch, _, frame_count, _, _ = video.shape
    for start in range(0, frame_count, 4):
        end = min(frame_count, start + 4)
        ext_start = max(0, start - 1)
        ext_end = min(frame_count, end + 1)
        frames = video[:, :, ext_start:ext_end].permute(0, 2, 1, 3, 4)
        flat = frames.reshape(-1, 3, frames.shape[-2], frames.shape[-1])
        skin = _skin_likelihood(flat)

        ext_frames = ext_end - ext_start
        local_start = start - ext_start
        local_end = local_start + (end - start)
        skin = _stable_center_mask(skin, batch, ext_frames, local_start, local_end)

        center = flat.reshape(batch, ext_frames, 3, flat.shape[-2], flat.shape[-1])[:, local_start:local_end]
        center = center.reshape(-1, 3, flat.shape[-2], flat.shape[-1])
        center_luma = 0.299 * center[:, 0:1] + 0.587 * center[:, 1:2] + 0.114 * center[:, 2:3]
        fine = center_luma - _box_blur(center_luma, 3)
        medium = center_luma - _box_blur(center_luma, 7)
        detail = (0.78 * fine + 0.22 * medium).clamp(-0.08, 0.08)

        contour = medium.abs()
        edge_guard = 1.0 - 0.85 * torch.sigmoid((contour - 0.065) * 45.0)
        delta = detail * skin * edge_guard * strength
        enhanced = (center + delta).clamp(0, 1)
        video[:, :, start:end] = enhanced.reshape(batch, end - start, 3, enhanced.shape[-2], enhanced.shape[-1]).permute(0, 2, 1, 3, 4)
    return video


_BLEMISH_MODES = ("off", "subtle", "strong")


class TJ_SkinRetouch:
    """ComfyUI IMAGE adapter for apply_skin_finishing() + apply_skin_microtexture()."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "evenness": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Removes blotchy mid-scale tone variation, keeps fine skin texture."}),
                "smoothing": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "General complexion smoothing within the skin mask."}),
                "redness": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Reduces excess red (irritation/flush) in skin-likely areas."}),
                "shine": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Knocks down specular highlight/oily shine on skin."}),
                "blemish_mode": (list(_BLEMISH_MODES), {"default": "off",
                    "tooltip": "Spot-fix small high-contrast blemishes within the skin mask."}),
                "preserve_marks": ("BOOLEAN", {"default": True,
                    "tooltip": "Raises the blemish threshold so larger marks (moles, scars) survive."}),
                "microtexture_strength": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 3.0, "step": 0.05,
                    "tooltip": "Restores/enhances fine skin-scale luma detail after smoothing (0 = off)."}),
            },
            "optional": {
                "get_name": (["(none)"], {"default": "(none)"}),
                "setnode_name": ("STRING", {"default": "SkinRetouch"}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def run(self, images, evenness=0.0, smoothing=0.0, redness=0.0, shine=0.0,
             blemish_mode="off", preserve_marks=True, microtexture_strength=0.0,
             get_name="(none)", setnode_name="SkinRetouch"):
        device = images.device
        # [N,H,W,C] -> [1,C,N,H,W]; float32 for the box-blur/sigmoid math regardless of
        # the incoming dtype (ComfyUI IMAGE is usually already float32 in [0,1]).
        video = images.permute(3, 0, 1, 2).unsqueeze(0).to(torch.float32).clone().contiguous()

        video = apply_skin_finishing(video, evenness, smoothing, redness, shine, blemish_mode, preserve_marks)
        video = apply_skin_microtexture(video, microtexture_strength)

        out = video.squeeze(0).permute(1, 2, 3, 0).clamp(0, 1).to(images.dtype).to(device)
        return (out.contiguous(),)


NODE_CLASS_MAPPINGS = {
    "TJ_SkinRetouch": TJ_SkinRetouch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TJ_SkinRetouch": "Skin Retouch (TJ)",
}
