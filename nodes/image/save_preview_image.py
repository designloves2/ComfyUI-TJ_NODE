# nodes/image/save_preview_image.py
import os
import random
import numpy as np
from PIL import Image
from datetime import datetime
import folder_paths
from ..utility._utility_utils import _tj_safe_output_dir


class TJ_SaveAndPreviewImage:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "get_name": (["(none)"],),
                "setnode_name": ("STRING", {"default": ""}),
                "filename_prefix": ("STRING", {"default": "TJ_Output"}),
                "path": ("STRING", {"default": ""}),
                "type": (["png", "jpg", "webp"], {"default": "png"}),
                "mode": (["Preview", "Save"], {"default": "Preview"}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "process"
    CATEGORY = " ✨ TJ_Node/Image"
    OUTPUT_NODE = True

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def process(self, images, get_name, setnode_name, filename_prefix, path, type, mode):
        now = datetime.now()
        parsed_prefix = now.strftime(filename_prefix)
        parsed_path = now.strftime(path)

        if mode == "Preview":
            out_dir = folder_paths.get_temp_directory()
        else:
            out_dir = _tj_safe_output_dir(parsed_path)

        os.makedirs(out_dir, exist_ok=True)
        results = []
        is_batch = len(images) > 1

        for i, img_tensor in enumerate(images):
            img_np = 255.0 * img_tensor.cpu().numpy()
            img = Image.fromarray(np.clip(img_np, 0, 255).astype(np.uint8))
            suffix = f"_{i:04d}" if is_batch else ""
            filename = f"{parsed_prefix}{suffix}.{type}"

            if mode == "Save":
                base = parsed_prefix
                counter = 1
                file_path = os.path.join(out_dir, filename)
                while os.path.exists(file_path):
                    filename = f"{base}{suffix}_{counter:04d}.{type}"
                    file_path = os.path.join(out_dir, filename)
                    counter += 1
            else:
                rnd = random.randint(10000, 99999)
                filename = f"tj_prev_{rnd}_{parsed_prefix}{suffix}.{type}"
                file_path = os.path.join(out_dir, filename)

            if type == "png":
                img.save(file_path, format="PNG", compress_level=4)
            elif type == "jpg":
                img.save(file_path, format="JPEG", quality=100, subsampling=0)
            elif type == "webp":
                img.save(file_path, format="WEBP", lossless=True, quality=100)

            base_ref = folder_paths.get_temp_directory() if mode == "Preview" else folder_paths.get_output_directory()
            try:
                subfolder = os.path.relpath(out_dir, base_ref)
                if subfolder == ".":
                    subfolder = ""
            except ValueError:
                subfolder = ""

            results.append({
                "filename": filename,
                "subfolder": subfolder,
                "type": "temp" if mode == "Preview" else "output"
            })

        return {"ui": {"tj_images": results}, "result": (images,)}
