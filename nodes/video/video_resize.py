"""
TJ Node — Video Resize (TJ)

Node-side port of AI_One_Studio's gallery-only "↔ Resize" post-process tool
(web commit a1a5fc1) — same five modes, done here as a portable graph node so
any workflow (not just that gallery) can use it. Sits after a frame loader
(e.g. VHS_LoadVideo) and before whatever encodes the result (CreateVideo /
VHS_VideoCombine) — same shape the web tool's own graph uses
(VHS_LoadVideo -> ImageScale/ImageScaleToTotalPixels -> CreateVideo ->
SaveVideo), just folded into one node with a mode switch instead of wiring a
different core node per mode.

Reuses comfy.utils.common_upscale — the exact function ComfyUI's own core
ImageScale/ImageScaleBy nodes use — so scale quality and crop math match
what those already do, rather than reimplementing resize/crop from scratch.

Modes:
  Long side      — keep aspect, resize so the LONGER edge hits target_px.
  Short side     — keep aspect, resize so the SHORTER edge hits target_px.
  Ratio          — centre-crop to ratio_w:ratio_h at the source's OWN
                   resolution — no up/downscale, matches the web tool's
                   "Ratio (centre crop to a target aspect at the source's
                   own res)" behaviour exactly.
  Mega Pixel     — uniform scale so total pixel area matches megapixels,
                   aspect kept.
  Width x Height — exact target size. crop_mode "crop" = scale to cover +
                   centre-crop (no distortion); "stretch" = resize straight
                   to the target (distorts aspect).
"""
import math
import comfy.utils


class TJ_VideoResize:
    CATEGORY = " ✨ TJ_Node/Video"
    FUNCTION = "run"
    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("images", "width", "height")
    DESCRIPTION = (
        "Resize/crop a batch of video frames in one node: Long side, Short side, "
        "an aspect-ratio centre-crop, a target megapixel count, or an exact "
        "Width x Height (cover-crop or stretch). Node-side port of the gallery's "
        "own web-only Resize tool."
    )

    upscale_methods = ["lanczos", "bilinear", "bicubic", "area", "nearest-exact"]
    modes = ["Long side", "Short side", "Ratio", "Mega Pixel", "Width x Height"]
    crop_modes = ["crop", "stretch"]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "mode": (cls.modes, {"default": "Long side"}),
                "upscale_method": (cls.upscale_methods, {"default": "lanczos"}),
                "target_px": ("INT", {"default": 1080, "min": 8, "max": 16384, "step": 2,
                    "tooltip": "Long side / Short side only — the target pixel length for "
                               "that edge; the other edge follows to keep aspect."}),
                "ratio_w": ("INT", {"default": 16, "min": 1, "max": 64,
                    "tooltip": "Ratio mode only — target aspect ratio's W part. Centre-crops "
                               "at the source's own resolution, no scaling."}),
                "ratio_h": ("INT", {"default": 9, "min": 1, "max": 64,
                    "tooltip": "Ratio mode only — target aspect ratio's H part."}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.01, "max": 64.0, "step": 0.01,
                    "tooltip": "Mega Pixel mode only — uniform scale so the frame's pixel "
                               "area matches this many megapixels, aspect kept."}),
                "target_width": ("INT", {"default": 1280, "min": 8, "max": 16384, "step": 2,
                    "tooltip": "Width x Height mode only."}),
                "target_height": ("INT", {"default": 720, "min": 8, "max": 16384, "step": 2,
                    "tooltip": "Width x Height mode only."}),
                "crop_mode": (cls.crop_modes, {"default": "crop",
                    "tooltip": "Width x Height mode only. crop = scale to cover the target "
                               "then centre-crop the overhang (no distortion). stretch = "
                               "resize straight to the target (aspect not kept)."}),
            },
        }

    @staticmethod
    def _even(n):
        # Odd frame dimensions choke some video encoders — round to the nearest even int,
        # never below 2.
        n = max(2, int(round(n)))
        return n if n % 2 == 0 else n + 1

    @staticmethod
    def _scale(images, w, h, method, crop):
        # Same movedim dance ComfyUI's own core ImageScale uses: IMAGE is [B,H,W,C],
        # common_upscale wants [B,C,H,W].
        samples = images.movedim(-1, 1)
        out = comfy.utils.common_upscale(samples, w, h, method, crop)
        return out.movedim(1, -1)

    def run(self, images, mode, upscale_method, target_px, ratio_w, ratio_h,
            megapixels, target_width, target_height, crop_mode):
        b, h, w, c = images.shape

        if mode == "Long side":
            scale = target_px / float(max(w, h))
            nw, nh = self._even(w * scale), self._even(h * scale)
            out = self._scale(images, nw, nh, upscale_method, "disabled")

        elif mode == "Short side":
            scale = target_px / float(min(w, h))
            nw, nh = self._even(w * scale), self._even(h * scale)
            out = self._scale(images, nw, nh, upscale_method, "disabled")

        elif mode == "Ratio":
            # No rescale on purpose — crop only, at the source's own resolution. Compute the
            # exact centre-crop rect ourselves (same formula common_upscale uses internally
            # for crop="center") so the target width/height we pass it is already that crop
            # size - the resize step inside common_upscale then becomes a same-size no-op.
            target_ar = ratio_w / float(max(1, ratio_h))
            cur_ar = w / float(h)
            if cur_ar > target_ar:
                nw, nh = h * target_ar, h
            else:
                nw, nh = w, w / target_ar
            nw, nh = self._even(min(nw, w)), self._even(min(nh, h))
            out = self._scale(images, nw, nh, upscale_method, "center")

        elif mode == "Mega Pixel":
            cur_mp = (w * h) / 1_000_000.0
            scale = math.sqrt(megapixels / cur_mp) if cur_mp > 0 else 1.0
            nw, nh = self._even(w * scale), self._even(h * scale)
            out = self._scale(images, nw, nh, upscale_method, "disabled")

        else:  # Width x Height
            nw, nh = self._even(target_width), self._even(target_height)
            crop = "center" if crop_mode == "crop" else "disabled"
            out = self._scale(images, nw, nh, upscale_method, crop)

        out_h, out_w = out.shape[1], out.shape[2]
        return (out, out_w, out_h)


NODE_CLASS_MAPPINGS = {
    "TJ_VideoResize": TJ_VideoResize,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TJ_VideoResize": "Video Resize (TJ)",
}
