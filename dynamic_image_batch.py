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
            "required": {},
            "optional": {
                "image_1": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "do_batch"
    CATEGORY = "TJ_Node/Image"

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
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("IMAGE", "FILENAME_STR")
    FUNCTION = "save_images"
    CATEGORY = "TJ_Node/Image"

    def save_images(self, images, filename_prefix):
        import folder_paths
        full_output_folder, filename, counter, subfolder, filename_prefix = folder_paths.get_save_image_path(
            filename_prefix, self.output_dir, images[0].shape[1], images[0].shape[0]
        )
        final_filename = f"{filename}_{counter:05d}.png"
        file_path = os.path.join(full_output_folder, final_filename)
        for image in images:
            i = 255.0 * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            img.save(file_path, compress_level=4)
        return (images, file_path)


class TJ_SaveImage_Subsequent:
    def __init__(self):
        import folder_paths
        self.output_dir = folder_paths.get_output_directory()

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "base_filename": ("STRING", {"forceInput": True}),
                "filename_suffix": ("STRING", {"default": "_upscaled"}),
                "extension_option": (["Original", "png", "jpg", "webp"], {"default": "Original"}),
                "save_path_opt": ("STRING", {"default": ""}),
            }
        }

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "save_images"
    CATEGORY = "TJ_Node/Image"

    def save_images(self, images, base_filename, filename_suffix, extension_option, save_path_opt):
        orig_path = Path(base_filename)
        pure_name = orig_path.stem
        orig_ext = orig_path.suffix.lower().strip('.') if orig_path.suffix else "png"
        final_dir = resolve_target_dir(orig_path.parent, save_path_opt)
        final_dir.mkdir(parents=True, exist_ok=True)
        target_ext = orig_ext if extension_option == "Original" else extension_option
        final_filename = f"{pure_name}{filename_suffix}"
        for idx, image in enumerate(images):
            i = 255.0 * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            if len(images) > 1:
                file_name = f"{final_filename}_{idx+1}.{target_ext}"
            else:
                file_name = f"{final_filename}.{target_ext}"
            file_path = final_dir / file_name
            save_image_with_quality(img, str(file_path), target_ext)
        return {"ui": {"images": []}}


class DynamicImageBatchEclipse:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {
                "image_1": ("IMAGE",),
                "files_1": ("*",),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "do_batch"
    CATEGORY = "TJ_Node/Image"

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
    CATEGORY = "TJ_Node/Image"

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
                "out_count": ("INT", {"default": 2, "min": 1, "max": 64, "step": 1}),
            }
        }

    RETURN_TYPES = tuple(["IMAGE"] * 64)
    RETURN_NAMES = tuple([f"IMAGE_{i+1}" for i in range(64)])
    FUNCTION = "split"
    CATEGORY = "TJ_Node/Image"

    def split(self, images, out_count):
        batch_size = images.shape[0]
        # 검은색 빈 이미지 (64x64)
        black = torch.zeros((1, 64, 64, 3), dtype=torch.float32)

        result = []
        for i in range(out_count):
            if i < batch_size:
                result.append(images[i : i + 1])
            else:
                # 입력 배치에 없는 인덱스는 검은색 이미지
                result.append(black)

        # out_count 이후 슬롯은 None (JS에서 슬롯 자체를 제거)
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
