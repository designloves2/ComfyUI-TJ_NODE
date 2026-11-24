# nodes/video/scail2_colored_mask.py
# Create SCAIL-2 Colored Mask (TJ) — runs the core `SCAIL2ColoredMask` node, then moves the
# subject edge outward / inward by N pixels on the colored result. Use a negative offset to
# trim leftover background color around the person. The sign never depends on
# replacement_mode: -N always shrinks the subject, +N always grows it.

import torch
import torch.nn.functional as F

from .wan_scail_extend_sampler import _call_core

_CORE = "SCAIL2ColoredMask"
_HINT = "Update ComfyUI to a build that has the SCAIL-2 nodes (SCAIL2ColoredMask)."


def _dilate_disk(binary, radius):
    """Exact round dilation of [T,1,H,W] 0/1 floats by `radius` px (pure PyTorch).

    A disk is the union of horizontal runs: for each row offset dy the run half-width is
    floor(sqrt(r^2 - dy^2)), so it is r*2+1 cheap 1-D max-pools instead of one huge 2-D kernel."""
    height = binary.shape[-2]
    out = torch.zeros_like(binary)
    for dy in range(-radius, radius + 1):
        if abs(dy) >= height:
            continue
        half = int((radius * radius - dy * dy) ** 0.5 + 1e-9)
        run = F.max_pool2d(binary, (1, 2 * half + 1), stride=1, padding=(0, half))
        if dy >= 0:
            out[..., dy:, :] = torch.maximum(out[..., dy:, :], run[..., :height - dy, :])
        else:
            out[..., :height + dy, :] = torch.maximum(out[..., :height + dy, :], run[..., -dy:, :])
    return out


def _color_key(frames):
    """[T,H,W,3] palette-colored frames -> int key 4R+2G+B (0 = black, 7 = white)."""
    bits = (frames > 0.5).to(torch.int64)
    return bits[..., 0] * 4 + bits[..., 1] * 2 + bits[..., 2]


def offset_colored_mask(video, white_background, amount):
    """video: [T,H,W,3] SCAIL colored mask. Grow (+) or shrink (-) the colored area by |amount| px."""
    amount = int(amount)
    if amount == 0 or video is None or video.numel() == 0:
        return video
    radius = abs(amount)
    bg_key = 7 if white_background else 0
    bg_value = 1.0 if white_background else 0.0
    work = video.detach().float()
    result = work.clone()
    for start in range(0, work.shape[0], 8):  # chunks keep the temporary tensors small
        frames = work[start:start + 8]
        key = _color_key(frames)
        subject = (key != bg_key)
        sub_f = subject.unsqueeze(1).float()
        if amount < 0:
            # erode = complement of the dilated background (image border does not count as background)
            eroded = _dilate_disk(1.0 - sub_f, radius) > 0.5
            removed = subject & eroded.squeeze(1)
            chunk = frames.clone()
            chunk[removed] = bg_value
        else:
            chunk = frames.clone()
            assigned = subject.clone()
            for k in torch.unique(key[subject]).tolist():
                reach = _dilate_disk((key == k).unsqueeze(1).float(), radius).squeeze(1) > 0.5
                new = reach & ~assigned
                color = torch.tensor([(k >> 2) & 1, (k >> 1) & 1, k & 1], dtype=chunk.dtype, device=chunk.device)
                chunk[new] = color
                assigned |= new
        result[start:start + 8] = chunk
    return result.to(device=video.device, dtype=video.dtype)


class TJ_SCAIL2ColoredMask:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "driving_track_data": ("SAM3_TRACK_DATA", {"tooltip": "SAM3 track of the driving pose video."}),
                "object_indices": ("STRING", {"default": "", "tooltip": "Comma-separated person indices to include (e.g. '0,2,3'). Empty = all."}),
                "sort_by": (["none", "left_to_right", "area"], {"default": "left_to_right"}),
                "replacement_mode": ("BOOLEAN", {"default": False,
                    "tooltip": "False = Animation Mode (pose mask black background, reference mask white). True = Replacement Mode (pose mask white, reference mask black)."}),
                "pose_mask_offset": ("INT", {"default": 0, "min": -64, "max": 64, "step": 1,
                    "tooltip": "Move the subject edge of pose_video_mask outward (+) or inward (-) in pixels. -1 trims leftover background around the person, in either mode."}),
                "reference_mask_offset": ("INT", {"default": 0, "min": -64, "max": 64, "step": 1,
                    "tooltip": "Same for reference_image_mask."}),
            },
            "optional": {
                "reference_masks": ("*", {"tooltip": "SAM3 track of the reference image(s), or a plain MASK of the reference subject."}),
                "get_name": (["(none)"], {"default": "(none)"}),
                "setnode_name": ("STRING", {"default": "SCAIL2ColoredMask"}),
            },
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("pose_video_mask", "reference_image_mask")
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/Video"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def run(self, driving_track_data, object_indices="", sort_by="left_to_right", replacement_mode=False,
            pose_mask_offset=0, reference_mask_offset=0, reference_masks=None,
            get_name="(none)", setnode_name="SCAIL2ColoredMask"):
        kwargs = dict(driving_track_data=driving_track_data, object_indices=object_indices,
                      sort_by=sort_by, replacement_mode=bool(replacement_mode))
        if reference_masks is not None:
            kwargs["ref_track_data"] = reference_masks
        pose_mask, reference_mask = _call_core(_CORE, _HINT, **kwargs)[:2]
        # pose: white background in replacement mode; reference: the opposite.
        pose_mask = offset_colored_mask(pose_mask, bool(replacement_mode), pose_mask_offset)
        reference_mask = offset_colored_mask(reference_mask, not replacement_mode, reference_mask_offset)
        return (pose_mask, reference_mask)
