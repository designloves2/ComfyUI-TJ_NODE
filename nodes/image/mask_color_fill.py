# nodes/image/mask_color_fill.py
# Mask Color Fill (TJ) — paint a MASK with a solid color and output it as an IMAGE, with a
# mask offset (the edge grows / shrinks by N pixels, round) and feather. The background
# follows the SCAIL-2 colored-mask rule (replacement_mode / pose vs reference), and the
# offset always acts on the subject, so -N px always shrinks it.

import torch
import torch.nn.functional as F

from ..video.scail2_colored_mask import _dilate_disk


def _parse_color(text, fallback):
    """'#RRGGBB', '#RGB' or 'RRGGBB' -> (r, g, b) floats in 0..1."""
    value = (text or "").strip().lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    try:
        if len(value) != 6:
            raise ValueError
        return tuple(int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    except ValueError:
        print(f"[TJ_MaskColorFill] invalid color '{text}', using {fallback}")
        return _parse_color(fallback, "#000000")


def _offset(mask, amount):
    """[N,1,H,W] -> edge moved outward (+) / inward (-) by |amount| px (round, 0.5 threshold)."""
    amount = int(amount)
    if amount == 0:
        return mask
    binary = (mask > 0.5).float()
    if amount > 0:
        return _dilate_disk(binary, amount)
    return 1.0 - _dilate_disk(1.0 - binary, -amount)


def _blur(mask, radius):
    if radius <= 0:
        return mask
    sigma = max(0.1, radius / 2.0)
    half = int(radius * 1.5) + 1
    axis = torch.arange(-half, half + 1, device=mask.device, dtype=mask.dtype)
    kernel = torch.exp(-(axis ** 2) / (2 * sigma * sigma))
    kernel = kernel / kernel.sum()
    mask = F.conv2d(F.pad(mask, (half, half, 0, 0), mode="replicate"), kernel.view(1, 1, 1, -1))
    return F.conv2d(F.pad(mask, (0, 0, half, half), mode="replicate"), kernel.view(1, 1, -1, 1))


class TJ_MaskColorFill:
    """Paints a MASK in a solid color over a black/white background and returns an IMAGE."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mask": ("MASK",),
                "color": ("STRING", {"default": "#FF0000", "tooltip": "Fill color for the masked area (#RRGGBB or #RGB)."}),
                "replacement_mode": ("BOOLEAN", {"default": False,
                    "tooltip": "Same as 'Create SCAIL-2 Colored Mask'. Pose video mask: off = black background, on = white. "
                               "Reference image mask: off = white background, on = black. Only the background color changes; the subject keeps its shape."}),
                "use_as": (["pose_video_mask", "reference_image_mask"], {"default": "pose_video_mask",
                    "tooltip": "Which SCAIL-2 mask this output feeds (they use opposite backgrounds)."}),
                "mask_offset": ("INT", {"default": 0, "min": -512, "max": 512, "step": 1,
                    "tooltip": "Move the subject edge outward (+) or inward (-) by this many pixels. -1 shrinks the subject in either mode (use it to trim leftover background at the edge)."}),
                "feather": ("INT", {"default": 0, "min": 0, "max": 256, "step": 1,
                    "tooltip": "Soften the mask edge (blur radius in pixels)."}),
            },
            "optional": {
                "get_name": (["(none)"], {"default": "(none)"}),
                "setnode_name": ("STRING", {"default": "MaskColorFill"}),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def run(self, mask, color="#FF0000", replacement_mode=False, use_as="pose_video_mask", mask_offset=0,
            feather=0, get_name="(none)", setnode_name="MaskColorFill"):
        m = mask.to(torch.float32)
        if m.dim() == 2:
            m = m.unsqueeze(0)
        m = m.unsqueeze(1).clamp(0, 1)  # [N,1,H,W]

        m = _offset(m, int(mask_offset))
        m = _blur(m, int(feather)).clamp(0, 1)

        fg = torch.tensor(_parse_color(color, "#FF0000"), dtype=torch.float32, device=m.device).view(1, 3, 1, 1)
        white_bg = bool(replacement_mode) != (use_as == "reference_image_mask")
        bg = torch.tensor((1.0, 1.0, 1.0) if white_bg else (0.0, 0.0, 0.0),
                          dtype=torch.float32, device=m.device).view(1, 3, 1, 1)
        image = (bg + (fg - bg) * m).permute(0, 2, 3, 1).clamp(0, 1).contiguous()
        return (image, m.squeeze(1).contiguous())
