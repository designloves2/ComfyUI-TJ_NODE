# nodes/image/multi_image_loader.py
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
                "image_paths_json": ("STRING", {"default": "[]", "multiline": True}),
                "auto_set": ("BOOLEAN", {"default": True, "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
                "match_mode": (["Keep Input Ratio", "Megapixel"], {"default": "Keep Input Ratio"}),
                "resize_input": (["none", "long edge", "short edge", "Custom"], {"default": "none"}),
                "edge_size": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "custom_width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "custom_height": ("INT", {"default": 1536, "min": 64, "max": 8192, "step": 8}),
                "megapixel": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 16.0, "step": 0.1}),
                "interpolation": (["lanczos", "nearest", "bilinear", "bicubic"], {"default": "lanczos"}),
                "scale_method": (["Center Crop", "Force Fit"], {"default": "Center Crop"}),
                "batch_select": ("STRING", {"default": "", "multiline": False, "placeholder": "ex: 1,2,4 / empty = all"}),
            },
        }

    @staticmethod
    def _resolve_path(p):
        p = p.strip()
        if os.path.isabs(p) or p.startswith(("/", "\\")):
            raise ValueError("TJ_NODE: absolute image paths are not allowed.")
        input_base = folder_paths.get_input_directory()
        output_base = folder_paths.get_output_directory()
        if p.startswith("input/"):
            target_base = input_base
            rel = p[len("input/"):]
        elif p.startswith("download/"):
            target_base = input_base
            rel = p
        elif p.startswith("output/"):
            target_base = output_base
            rel = p[len("output/"):]
        else:
            target_base = input_base
            rel = p

        resolved = os.path.realpath(os.path.join(target_base, rel))
        real_base = os.path.realpath(target_base)
        try:
            if os.path.commonpath([real_base, resolved]) != real_base:
                raise ValueError
        except ValueError:
            raise ValueError("TJ_NODE: image path traversal is not allowed.")
        return resolved

    @staticmethod
    def _get_resample(interpolation):
        return {"lanczos": Image.LANCZOS, "nearest": Image.NEAREST,
                "bilinear": Image.BILINEAR, "bicubic": Image.BICUBIC}.get(interpolation, Image.LANCZOS)

    @staticmethod
    def _round8(v):
        return max(8, round(v / 8) * 8)

    @staticmethod
    def _compute_long_edge(w, h, target):
        if w >= h:
            nw, nh = target, TJ_MultiImageLoader._round8(target * h / w)
        else:
            nh, nw = target, TJ_MultiImageLoader._round8(target * w / h)
        return int(nw), int(nh)

    @staticmethod
    def _compute_short_edge(w, h, target):
        if w <= h:
            nw, nh = target, TJ_MultiImageLoader._round8(target * h / w)
        else:
            nh, nw = target, TJ_MultiImageLoader._round8(target * w / h)
        return int(nw), int(nh)

    @staticmethod
    def _compute_megapixel(w, h, mp):
        total = mp * 1_048_576
        ratio = w / h
        th = (total / ratio) ** 0.5
        tw = ratio * th
        return int(TJ_MultiImageLoader._round8(tw)), int(TJ_MultiImageLoader._round8(th))

    @staticmethod
    def _center_crop(img, tw, th, resample):
        w, h = img.size
        scale = max(tw / w, th / h)
        nw, nh = round(w * scale), round(h * scale)
        img = img.resize((nw, nh), resample)
        left, top = (nw - tw) // 2, (nh - th) // 2
        return img.crop((left, top, left + tw, top + th))

    @staticmethod
    def _force_fit(img, tw, th, resample):
        return img.resize((tw, th), resample)

    @staticmethod
    def _resize_to_target(img, tw, th, scale_method, resample):
        if scale_method == "Center Crop":
            return TJ_MultiImageLoader._center_crop(img, tw, th, resample)
        return TJ_MultiImageLoader._force_fit(img, tw, th, resample)

    @staticmethod
    def _parse_batch_select(batch_select, count):
        raw = str(batch_select or "").strip()
        if not raw:
            return list(range(count))
        indices = []
        for part in raw.split(","):
            part = part.strip()
            if not part:
                continue
            try:
                idx = int(part) - 1
            except ValueError:
                print(f"[TJ_MultiImageLoader] Ignored invalid item: {part!r}")
                continue
            if 0 <= idx < count:
                indices.append(idx)
            else:
                print(f"[TJ_MultiImageLoader] Out-of-range item: {int(part)} / total {count}")
        return indices if indices else list(range(count))

    def load_images(self, image_paths_json, auto_set, match_mode, resize_input,
                    edge_size, custom_width, custom_height, megapixel, interpolation,
                    scale_method, batch_select):
        try:
            paths = json.loads(image_paths_json)
        except json.JSONDecodeError:
            paths = []

        if not paths:
            return (torch.zeros(1, 64, 64, 3), 64, 64)

        resample = self._get_resample(interpolation)
        first_img = Image.open(self._resolve_path(paths[0])).convert("RGB")
        fw, fh = first_img.size

        if match_mode == "Megapixel":
            tw, th = self._compute_megapixel(fw, fh, megapixel)
        else:
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

        tensors = []
        for p in paths:
            try:
                img = Image.open(self._resolve_path(p)).convert("RGB")
                img = self._resize_to_target(img, tw, th, scale_method, resample)
                arr = np.array(img).astype(np.float32) / 255.0
                tensors.append(torch.from_numpy(arr).unsqueeze(0))
            except Exception as e:
                print(f"[TJ_MultiImageLoader] Failed to load: {p} — {e}")

        if not tensors:
            return (torch.zeros(1, 64, 64, 3), 64, 64)

        batch = torch.cat(tensors, dim=0)
        sel = self._parse_batch_select(batch_select, batch.shape[0])
        if sel != list(range(batch.shape[0])):
            batch = batch[sel]
        return (batch, tw, th)
