import torch
import numpy as np
from PIL import Image
import os
import json
import folder_paths

class TJ_MultiImageLoader:
    """Multi Image Loader (TJ) - Load multiple images into a batch tensor."""

    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("BATCH", "WIDTH", "HEIGHT")
    FUNCTION = "load_images"
    CATEGORY = " ✨ TJ_Node/Image"
    OUTPUT_NODE = False

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_paths_json": ("STRING", {
                    "default": "[]",
                    "multiline": True,
                }),
                "auto_set": ("BOOLEAN", {"default": True, "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
                "match_mode": (["Keep Input Ratio", "Megapixel"], {
                    "default": "Keep Input Ratio",
                }),
                "resize_input": (["none", "long edge", "short edge", "Custom"], {
                    "default": "none",
                }),
                "edge_size": ("INT", {
                    "default": 1024,
                    "min": 64,
                    "max": 8192,
                    "step": 8,
                }),
                "custom_width": ("INT", {
                    "default": 1024,
                    "min": 64,
                    "max": 8192,
                    "step": 8,
                }),
                "custom_height": ("INT", {
                    "default": 1536,
                    "min": 64,
                    "max": 8192,
                    "step": 8,
                }),
                "megapixel": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.1,
                    "max": 16.0,
                    "step": 0.1,
                }),
                "interpolation": (["lanczos", "nearest", "bilinear", "bicubic"], {
                    "default": "lanczos",
                }),
                "scale_method": (["Center Crop", "Force Fit"], {
                    "default": "Center Crop",
                }),
            },
        }

    # ───────────── helpers ─────────────

    @staticmethod
    def _resolve_path(p):
        """Resolve a relative path to an absolute path."""
        p = p.strip()
        if os.path.isabs(p):
            return p
        base = folder_paths.get_input_directory()
        # input/download/xxx  →  <input>/download/xxx
        if p.startswith("input/"):
            return os.path.join(base, p[len("input/"):])
        if p.startswith("download/"):
            return os.path.join(base, p)
        if p.startswith("output/"):
            return os.path.join(folder_paths.get_output_directory(), p[len("output/"):])
        return os.path.join(base, p)

    @staticmethod
    def _get_resample(interpolation):
        mapping = {
            "lanczos": Image.LANCZOS,
            "nearest": Image.NEAREST,
            "bilinear": Image.BILINEAR,
            "bicubic": Image.BICUBIC,
        }
        return mapping.get(interpolation, Image.LANCZOS)

    @staticmethod
    def _round8(v):
        return max(8, round(v / 8) * 8)

    @staticmethod
    def _compute_long_edge(w, h, target):
        """Scale so the long edge equals target, preserving ratio."""
        if w >= h:
            nw = target
            nh = TJ_MultiImageLoader._round8(target * h / w)
        else:
            nh = target
            nw = TJ_MultiImageLoader._round8(target * w / h)
        return int(nw), int(nh)

    @staticmethod
    def _compute_short_edge(w, h, target):
        """Scale so the short edge equals target, preserving ratio."""
        if w <= h:
            nw = target
            nh = TJ_MultiImageLoader._round8(target * h / w)
        else:
            nh = target
            nw = TJ_MultiImageLoader._round8(target * w / h)
        return int(nw), int(nh)

    @staticmethod
    def _compute_megapixel(w, h, mp):
        """Compute target size from megapixel budget, preserving first image ratio."""
        total = mp * 1_048_576
        ratio = w / h
        # ratio = tw / th  →  tw = ratio * th
        # tw * th = total  →  ratio * th^2 = total
        th = (total / ratio) ** 0.5
        tw = ratio * th
        tw = TJ_MultiImageLoader._round8(tw)
        th = TJ_MultiImageLoader._round8(th)
        return int(tw), int(th)

    @staticmethod
    def _center_crop(img, tw, th, resample):
        """Resize preserving ratio then center-crop to tw x th."""
        w, h = img.size
        scale = max(tw / w, th / h)
        nw = round(w * scale)
        nh = round(h * scale)
        img = img.resize((nw, nh), resample)
        left = (nw - tw) // 2
        top = (nh - th) // 2
        return img.crop((left, top, left + tw, top + th))

    @staticmethod
    def _force_fit(img, tw, th, resample):
        """Force resize to exact tw x th (may distort)."""
        return img.resize((tw, th), resample)

    @staticmethod
    def _resize_to_target(img, tw, th, scale_method, resample):
        if scale_method == "Center Crop":
            return TJ_MultiImageLoader._center_crop(img, tw, th, resample)
        else:
            return TJ_MultiImageLoader._force_fit(img, tw, th, resample)

    # ───────────── main ─────────────

    def load_images(self, image_paths_json, auto_set, match_mode, resize_input,
                    edge_size, custom_width, custom_height,
                    megapixel, interpolation, scale_method):

        # Parse paths
        try:
            paths = json.loads(image_paths_json)
        except json.JSONDecodeError:
            paths = []

        if not paths or len(paths) == 0:
            # Return a blank 1x64x64x3 tensor
            blank = torch.zeros(1, 64, 64, 3)
            return (blank, 64, 64)

        resample = self._get_resample(interpolation)

        # Load first image to determine base size
        first_path = self._resolve_path(paths[0])
        first_img = Image.open(first_path).convert("RGB")
        fw, fh = first_img.size

        # ── Determine target size ──
        if match_mode == "Megapixel":
            tw, th = self._compute_megapixel(fw, fh, megapixel)
        else:
            # Keep Input Ratio
            if resize_input == "none":
                tw, th = fw, fh
            elif resize_input == "long edge":
                tw, th = self._compute_long_edge(fw, fh, edge_size)
            elif resize_input == "short edge":
                tw, th = self._compute_short_edge(fw, fh, edge_size)
            elif resize_input == "Custom":
                tw, th = int(custom_width), int(custom_height)
            else:
                tw, th = fw, fh

        # ── Load and resize all images ──
        tensors = []
        for p in paths:
            abs_path = self._resolve_path(p)
            try:
                img = Image.open(abs_path).convert("RGB")
            except Exception as e:
                print(f"[TJ_MultiImageLoader] Failed to load: {abs_path} — {e}")
                continue

            img = self._resize_to_target(img, tw, th, scale_method, resample)
            arr = np.array(img).astype(np.float32) / 255.0
            tensors.append(torch.from_numpy(arr).unsqueeze(0))

        if not tensors:
            blank = torch.zeros(1, 64, 64, 3)
            return (blank, 64, 64)

        batch = torch.cat(tensors, dim=0)
        return (batch, tw, th)
