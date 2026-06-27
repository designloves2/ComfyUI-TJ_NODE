# nodes/image/save_primary.py
import os
import json
import numpy as np
from PIL import Image
from pathlib import Path
import folder_paths
from ._image_utils import safe_filename_part


class TJ_SaveImage_Primary:
    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "filename_prefix": ("STRING", {"default": "TJ_Out"}),
                "subfolder": ("STRING", {"default": ""}),
                "date_folder": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("IMAGE", "FILEPATH_JSON")
    FUNCTION = "save_images"
    CATEGORY = " ✨ TJ_Node/Image"

    def save_images(self, images, filename_prefix, subfolder, date_folder):
        from datetime import datetime

        prefix_with_path = safe_filename_part(filename_prefix, "TJ_Out")
        if date_folder:
            today = datetime.now().strftime("%Y-%m-%d")
            prefix_with_path = f"{today}/{prefix_with_path}"
        if subfolder.strip():
            raw_subfolder = subfolder.replace("\\", "/").strip("/")
            parts = [p for p in raw_subfolder.split("/") if p]
            if os.path.isabs(subfolder) or subfolder.startswith(("/", "\\")) or any(p == ".." for p in parts):
                raise ValueError("TJ_NODE: invalid output subfolder.")
            prefix_with_path = f"{'/'.join(parts)}/{prefix_with_path}"

        full_output_folder, filename, counter, subfolder_ret, _ = \
            folder_paths.get_save_image_path(
                prefix_with_path, self.output_dir,
                images[0].shape[1],
                images[0].shape[0]
            )
        real_output_dir = os.path.realpath(self.output_dir)
        real_output_folder = os.path.realpath(full_output_folder)
        try:
            if os.path.commonpath([real_output_dir, real_output_folder]) != real_output_dir:
                raise ValueError
        except ValueError:
            raise ValueError("TJ_NODE: save path must stay inside ComfyUI/output.")
        os.makedirs(full_output_folder, exist_ok=True)

        saved_paths = []
        for image in images:
            file_path = self._find_next_path(full_output_folder, filename, counter)
            counter = int(Path(file_path).stem.rsplit("_", 1)[-1]) + 1
            arr = 255.0 * image.cpu().numpy()
            img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
            img.save(file_path, compress_level=4)
            saved_paths.append(file_path)

        return (images, json.dumps(saved_paths))

    @staticmethod
    def _find_next_path(folder, filename, start_counter):
        counter = start_counter
        while True:
            candidate = os.path.join(folder, f"{filename}_{counter:05d}.png")
            if not os.path.exists(candidate):
                return candidate
            counter += 1
