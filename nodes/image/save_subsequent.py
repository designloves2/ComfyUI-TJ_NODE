# nodes/image/save_subsequent.py
import json
import numpy as np
from PIL import Image
from pathlib import Path
import folder_paths
from ._image_utils import save_image_with_quality, resolve_target_dir, safe_filename_part


class TJ_SaveImage_Subsequent:
    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "filepath_json": ("STRING", {"forceInput": True}),
                "filename_suffix": ("STRING", {"default": "_upscaled"}),
                "extension_option": (["Original", "png", "jpg", "webp"], {"default": "Original"}),
                "save_path_opt": ("STRING", {"default": ""}),
            }
        }

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "save_images"
    CATEGORY = " ✨ TJ_Node/Image"

    def save_images(self, images, filepath_json, filename_suffix, extension_option, save_path_opt):
        filename_suffix = safe_filename_part(filename_suffix, "")
        try:
            paths = json.loads(filepath_json)
            if isinstance(paths, str):
                paths = [paths]
        except Exception:
            paths = [filepath_json]

        for idx, image in enumerate(images):
            orig_path = Path(paths[min(idx, len(paths) - 1)])
            pure_name = orig_path.stem
            orig_ext = orig_path.suffix.lower().strip('.') or "png"
            target_ext = orig_ext if extension_option == "Original" else extension_option

            final_dir = resolve_target_dir(orig_path.parent, save_path_opt)
            final_dir.mkdir(parents=True, exist_ok=True)

            if len(images) > 1:
                file_name = f"{pure_name}{filename_suffix}_{idx + 1}.{target_ext}"
            else:
                file_name = f"{pure_name}{filename_suffix}.{target_ext}"

            arr = 255.0 * image.cpu().numpy()
            img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
            save_image_with_quality(img, str(final_dir / file_name), target_ext)

        return {"ui": {"images": []}}
