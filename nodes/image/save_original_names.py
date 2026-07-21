# nodes/image/save_original_names.py
# Save With Original Names (TJ)
# 배치의 각 이미지를 원본 파일명 그대로 저장한다.
# Multi Image Loader (TJ) 의 FILENAMES 출력(줄바꿈 구분)을 그대로 받아 사용.
import os
import json
import numpy as np
from PIL import Image
from pathlib import Path
import folder_paths

from ._image_utils import (
    save_image_with_quality, resolve_target_dir, _tj_safe_filename_part
)


class TJ_SaveWithOriginalNames:
    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                # Multi Image Loader 의 FILENAMES 출력(줄바꿈 구분). JSON 배열도 허용.
                "filenames": ("STRING", {"forceInput": True}),
                "save_path": ("STRING", {"default": "", "placeholder": "output 하위 폴더 (예: resized/batch1)"}),
                "extension_option": (["Original", "png", "jpg", "webp"], {"default": "Original"}),
                "overwrite": ("BOOLEAN", {"default": True,
                                          "label_on": "Overwrite", "label_off": "Auto-number"}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("IMAGE",)
    OUTPUT_NODE = True
    FUNCTION = "save_images"
    CATEGORY = " ✨ TJ_Node/Image"

    @staticmethod
    def _parse_names(filenames):
        """FILENAMES 입력을 파일명 리스트로. 줄바꿈 우선, JSON 배열도 지원."""
        s = str(filenames or "").strip()
        if not s:
            return []
        if s.startswith("["):
            try:
                arr = json.loads(s)
                if isinstance(arr, list):
                    return [os.path.basename(str(x)).strip() for x in arr if str(x).strip()]
            except Exception:
                pass
        return [line.strip() for line in s.splitlines() if line.strip()]

    def save_images(self, images, filenames, save_path, extension_option, overwrite):
        names = self._parse_names(filenames)

        final_dir = resolve_target_dir(self.output_dir, save_path)   # output 내부로 격리
        final_dir.mkdir(parents=True, exist_ok=True)
        output_root = Path(self.output_dir).resolve()

        ui_images = []
        n = int(images.shape[0]) if hasattr(images, "shape") else len(images)
        for idx in range(n):
            image = images[idx]
            # 이미지가 이름보다 많으면 image_{i} 로 대체(중복 회피), 없으면 image
            if idx < len(names):
                base = names[idx]
            else:
                base = f"image_{idx + 1}"

            stem = _tj_safe_filename_part(Path(base).stem) or f"image_{idx + 1}"
            orig_ext = Path(base).suffix.lower().strip(".") or "png"
            target_ext = orig_ext if extension_option == "Original" else extension_option

            file_path = final_dir / f"{stem}.{target_ext}"
            if not overwrite:
                c = 1
                while file_path.exists():
                    file_path = final_dir / f"{stem}_{c}.{target_ext}"
                    c += 1

            arr = 255.0 * image.cpu().numpy()
            img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
            save_image_with_quality(img, str(file_path), target_ext)

            # 노드 미리보기용 (output 기준 상대경로)
            try:
                rel = file_path.resolve().relative_to(output_root)
                ui_images.append({
                    "filename": rel.name,
                    "subfolder": str(rel.parent).replace("\\", "/") if str(rel.parent) != "." else "",
                    "type": "output",
                })
            except Exception:
                pass

        return {"ui": {"images": ui_images}, "result": (images,)}


NODE_CLASS_MAPPINGS = {"TJ_SaveWithOriginalNames": TJ_SaveWithOriginalNames}
NODE_DISPLAY_NAME_MAPPINGS = {"TJ_SaveWithOriginalNames": "Save With Original Names (TJ)"}
