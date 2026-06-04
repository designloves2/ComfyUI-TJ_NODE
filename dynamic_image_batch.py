import torch
import os
from PIL import Image
import numpy as np
from pathlib import Path

ECLIPSE_NAME_REGISTRY = {}

def save_image_with_quality(img_obj, file_path, ext):
    ext = ext.lower().strip('.')
    if ext == 'png':
        img_obj.save(file_path, format='PNG', compress_level=3)
    elif ext in ['jpg', 'jpeg']:
        img_obj.save(file_path, format='JPEG', quality=100, subsampling=0, optimize=True)
    elif ext == 'webp':
        img_obj.save(file_path, format='WEBP', lossless=True, quality=100)
    else:
        img_obj.save(file_path, format='PNG')

def resolve_target_dir(base_dir_path, input_path_str):
    input_str = input_path_str.strip()
    if not input_str:
        return base_dir_path
    input_path = Path(input_str)
    if input_path.is_absolute():
        return input_path
    cleaned_str = input_str.lstrip('\\/')
    if input_str.startswith('..'):
        resolved_path = (base_dir_path / input_path).resolve()
    else:
        resolved_path = (base_dir_path / cleaned_str).resolve()
    return resolved_path


class DynamicImageBatch:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "setnode_name": ("STRING", {"default": ""}),
            },
            "optional": {
                "image_1": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "do_batch"
    CATEGORY = " ✨ TJ_Node/Image"

    def do_batch(self, **kwargs):
        valid_images = []
        def get_number(key_str):
            try: return int(key_str.split('_')[1])
            except: return 999

        sorted_keys = sorted(kwargs.keys(), key=get_number)
        for key in sorted_keys:
            if key.startswith("image_"):
                img = kwargs[key]
                if img is not None and isinstance(img, torch.Tensor):
                    if len(img.shape) == 4 and img.shape[0] > 0:
                        valid_images.append(img)

        if not valid_images:
            return (torch.zeros((1, 64, 64, 3), dtype=torch.float32),)
        if len(valid_images) == 1:
            return (valid_images[0],)

        target_h, target_w = valid_images[0].shape[1], valid_images[0].shape[2]
        processed_images = []
        for img in valid_images:
            if img.shape[1] != target_h or img.shape[2] != target_w:
                permuted = img.permute(0, 3, 1, 2)
                resized = torch.nn.functional.interpolate(
                    permuted, size=(target_h, target_w), mode="bilinear", align_corners=False
                )
                img = resized.permute(0, 2, 3, 1)
            processed_images.append(img)

        batched_images = torch.cat(processed_images, dim=0)
        return (batched_images,)



class TJ_SaveImage_Primary:
    def __init__(self):
        import folder_paths
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
        import folder_paths
        import json
        from datetime import datetime
        from pathlib import Path

        # ── 경로 조합 ──
        prefix_with_path = filename_prefix

        if date_folder:
            today = datetime.now().strftime("%Y-%m-%d")
            prefix_with_path = f"{today}/{prefix_with_path}"

        if subfolder.strip():
            prefix_with_path = f"{subfolder.strip('/')}/{prefix_with_path}"

        full_output_folder, filename, counter, subfolder_ret, _ = \
            folder_paths.get_save_image_path(
                prefix_with_path, self.output_dir,
                images[0].shape[1],  # W
                images[0].shape[0]   # H
            )

        os.makedirs(full_output_folder, exist_ok=True)

        # ── 배치 순서대로 저장 (덮어쓰기 방지) ──
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
        """파일이 존재하지 않는 번호를 찾을 때까지 counter를 올림."""
        counter = start_counter
        while True:
            candidate = os.path.join(folder, f"{filename}_{counter:05d}.png")
            if not os.path.exists(candidate):
                return candidate
            counter += 1


class TJ_SaveImage_Subsequent:
    def __init__(self):
        import folder_paths
        self.output_dir = folder_paths.get_output_directory()

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "filepath_json": ("STRING", {"forceInput": True}),  # Primary에서 수신
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
        import json

        # JSON 파싱 — 단일/배치 모두 리스트로 처리
        try:
            paths = json.loads(filepath_json)
            if isinstance(paths, str):      # 혹시 단일 문자열로 왔을 때 대비
                paths = [paths]
        except Exception:
            paths = [filepath_json]

        for idx, image in enumerate(images):
            # 이미지 인덱스에 맞는 원본 경로 (초과 시 마지막 경로 재사용)
            orig_path = Path(paths[min(idx, len(paths) - 1)])

            pure_name = orig_path.stem
            orig_ext = orig_path.suffix.lower().strip('.') or "png"
            target_ext = orig_ext if extension_option == "Original" else extension_option

            final_dir = resolve_target_dir(orig_path.parent, save_path_opt)
            final_dir.mkdir(parents=True, exist_ok=True)

            # 배치 1장이면 suffix만, 2장 이상이면 suffix + 순번
            if len(images) > 1:
                file_name = f"{pure_name}{filename_suffix}_{idx + 1}.{target_ext}"
            else:
                file_name = f"{pure_name}{filename_suffix}.{target_ext}"

            file_path = final_dir / file_name

            arr = 255.0 * image.cpu().numpy()
            img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
            save_image_with_quality(img, str(file_path), target_ext)

        return {"ui": {"images": []}}


class DynamicImageBatchEclipse:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "setnode_name": ("STRING", {"default": ""}),
            },
            "optional": {
                "image_1": ("IMAGE",),
                "files_1": ("*",),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "do_batch"
    CATEGORY = " ✨ TJ_Node/Image"

    def do_batch(self, **kwargs):
        valid_images = []
        batched_paths = []
        def get_number(key_str):
            try: return int(key_str.split('_')[1])
            except: return 999

        sorted_keys = sorted(kwargs.keys(), key=get_number)
        checked_indices = set()
        for key in sorted_keys:
            if '_' in key:
                idx_str = key.split('_')[1]
                if idx_str in checked_indices:
                    continue
                checked_indices.add(idx_str)
                img_key = f"image_{idx_str}"
                files_key = f"files_{idx_str}"
                img = kwargs.get(img_key, None)
                files_list = kwargs.get(files_key, None)
                if img is not None and isinstance(img, torch.Tensor):
                    if len(img.shape) == 4 and img.shape[0] > 0:
                        valid_images.append(img)
                        full_path_found = ""
                        if files_list:
                            if isinstance(files_list, list) and len(files_list) > 0:
                                full_path_found = str(files_list[0])
                            elif isinstance(files_list, dict):
                                for k, v in files_list.items():
                                    if isinstance(v, list) and len(v) > 0:
                                        full_path_found = str(v[0])
                                        break
                                    elif isinstance(v, str):
                                        full_path_found = v
                                        break
                            else:
                                full_path_found = str(files_list)
                        if not full_path_found:
                            import folder_paths
                            full_path_found = os.path.join(folder_paths.get_output_directory(), "Eclipse_Out.png")
                        batched_paths.append(full_path_found)

        if not valid_images:
            return (torch.zeros((1, 64, 64, 3), dtype=torch.float32),)

        target_h, target_w = valid_images[0].shape[1], valid_images[0].shape[2]
        processed_images = []
        for img in valid_images:
            if img.shape[1] != target_h or img.shape[2] != target_w:
                permuted = img.permute(0, 3, 1, 2)
                resized = torch.nn.functional.interpolate(
                    permuted, size=(target_h, target_w), mode="bilinear", align_corners=False
                )
                img = resized.permute(0, 2, 3, 1)
            processed_images.append(img)

        batched_images = torch.cat(processed_images, dim=0)
        ECLIPSE_NAME_REGISTRY[id(batched_images)] = batched_paths
        return (batched_images,)


class TJ_SaveImage_EclipseSubsequent:
    def __init__(self):
        import folder_paths
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
        source_paths = ECLIPSE_NAME_REGISTRY.get(id(images), None)
        if source_paths is None:
            for registered_id, value in ECLIPSE_NAME_REGISTRY.items():
                if isinstance(value, list) and len(value) == images.shape[0]:
                    source_paths = value
                    break
        if not source_paths:
            source_paths = [os.path.join(self.output_dir, f"Eclipse_Bulk_{i}.png") for i in range(images.shape[0])]
        for idx in range(images.shape[0]):
            image = images[idx : idx + 1]
            i = 255.0 * image.squeeze(0).cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            full_path_str = source_paths[idx] if idx < len(source_paths) else os.path.join(self.output_dir, f"Extra_{idx}.png")
            orig_path_obj = Path(full_path_str)
            pure_name = orig_path_obj.stem
            orig_ext = orig_path_obj.suffix.lower().strip('.') if orig_path_obj.suffix else "png"
            final_dir = resolve_target_dir(orig_path_obj.parent, save_path_opt)
            final_dir.mkdir(parents=True, exist_ok=True)
            target_ext = orig_ext if extension_option == "Original" else extension_option
            file_name = f"{pure_name}{filename_suffix}.{target_ext}"
            file_path = final_dir / file_name
            save_image_with_quality(img, str(file_path), target_ext)
        return {"ui": {"images": []}}


# ========== Batch to Multi Image Output (TJ) ==========
class TJ_BatchToMultiOutput:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "get_name": (["(none)"], {"default": "(none)"}),
                "out_count": ("INT", {"default": 2, "min": 1, "max": 64, "step": 1}),
                "auto_set": ("BOOLEAN", {"default": True, "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
            }
        }

    RETURN_TYPES = tuple(["IMAGE"] * 64)
    RETURN_NAMES = tuple([f"IMAGE_{i+1}" for i in range(64)])
    FUNCTION = "split"
    CATEGORY = " ✨ TJ_Node/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def split(self, images, get_name="(none)", out_count=2, auto_set=True):
        # ComfyUI IMAGE의 정상 형태는 [B, H, W, C]입니다.
        # 일부 배처/커스텀 노드가 [1, B, H, W, C] 또는 list 형태로 감싸서 넘기는 경우도
        # 실제 배치로 강제 평탄화해서 각 출력 슬롯으로 분리합니다.
        if isinstance(images, (list, tuple)):
            tensors = [x for x in images if isinstance(x, torch.Tensor)]
            if tensors:
                images = torch.cat([x.reshape(-1, *x.shape[-3:]) if x.ndim >= 4 else x for x in tensors], dim=0)

        if isinstance(images, torch.Tensor) and images.ndim > 4:
            images = images.reshape(-1, *images.shape[-3:])

        if not isinstance(images, torch.Tensor) or images.ndim != 4 or images.shape[0] == 0:
            black = torch.zeros((1, 64, 64, 3), dtype=torch.float32)
            batch_size = 0
        else:
            batch_size = int(images.shape[0])
            black = torch.zeros((1, images.shape[1], images.shape[2], images.shape[3]), dtype=images.dtype, device=images.device)

        result = []
        for i in range(out_count):
            if batch_size and i < batch_size:
                result.append(images[i : i + 1])
            else:
                result.append(black)

        for _ in range(64 - out_count):
            result.append(None)

        return tuple(result)


# ========== Node Mappings ==========
NODE_CLASS_MAPPINGS = {
    "DynamicImageBatch": DynamicImageBatch,
    "TJ_SaveImage_Primary": TJ_SaveImage_Primary,
    "TJ_SaveImage_Subsequent": TJ_SaveImage_Subsequent,
    "DynamicImageBatchEclipse": DynamicImageBatchEclipse,
    "TJ_SaveImage_EclipseSubsequent": TJ_SaveImage_EclipseSubsequent,
    "TJ_BatchToMultiOutput": TJ_BatchToMultiOutput,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DynamicImageBatch": "Dynamic Image Batch(TJ)",
    "TJ_SaveImage_Primary": "Save Image(Primary-TJ)",
    "TJ_SaveImage_Subsequent": "Save Image(Suffix-TJ)",
    "DynamicImageBatchEclipse": "Dynamic Image Batch(Eclipse-TJ)",
    "TJ_SaveImage_EclipseSubsequent": "Save Image(Eclipse Suffix-TJ)",
    "TJ_BatchToMultiOutput": "Batch to Multi Image Output (TJ)",
}
