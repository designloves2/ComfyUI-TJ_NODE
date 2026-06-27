# nodes/image/save_eclipse_subsequent.py
import os
import numpy as np
from PIL import Image
from pathlib import Path
import folder_paths
from ._image_utils import ECLIPSE_NAME_REGISTRY, save_image_with_quality, resolve_target_dir, safe_filename_part


class TJ_SaveImage_EclipseSubsequent:
    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "filename_suffix": ("STRING", {"default": "_upscaled"}),
                "extension_option": (["Original", "png", "jpg", "webp"], {"default": "Original"}),
                "save_path_opt": ("STRING", {"default": ""}),
            }
        }

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "save_images"
    CATEGORY = " ✨ TJ_Node/Image"

    def save_images(self, images, filename_suffix, extension_option, save_path_opt):
        filename_suffix = safe_filename_part(filename_suffix, "")
        source_paths = ECLIPSE_NAME_REGISTRY.get(id(images), None)
        if source_paths is None:
            for registered_id, value in ECLIPSE_NAME_REGISTRY.items():
                if isinstance(value, list) and len(value) == images.shape[0]:
                    source_paths = value
                    break
        if not source_paths:
            source_paths = [os.path.join(self.output_dir, f"Eclipse_Bulk_{i}.png") for i in range(images.shape[0])]

        for idx in range(images.shape[0]):
            image = images[idx: idx + 1]
            i = 255.0 * image.squeeze(0).cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))

            full_path_str = source_paths[idx] if idx < len(source_paths) else os.path.join(self.output_dir, f"Extra_{idx}.png")
            orig_path_obj = Path(full_path_str)
            pure_name = orig_path_obj.stem
            orig_ext = orig_path_obj.suffix.lower().strip('.') if orig_path_obj.suffix else "png"
            target_ext = orig_ext if extension_option == "Original" else extension_option

            final_dir = resolve_target_dir(orig_path_obj.parent, save_path_opt)
            final_dir.mkdir(parents=True, exist_ok=True)

            file_path = final_dir / f"{pure_name}{filename_suffix}.{target_ext}"
            save_image_with_quality(img, str(file_path), target_ext)

        return {"ui": {"images": []}}
