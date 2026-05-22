import torch
import os
from PIL import Image
import numpy as np

# 내부 메모리 추적용 글로벌 레지스트리 (1:1 단일 채널용 및 이클립스 다중 채널용 공유)
IMAGE_NAME_REGISTRY = {}
ECLIPSE_NAME_REGISTRY = {}

# ========================================================
# [기존 기능] 1. 기본형 다이나믹 이미지 배치 노드 (Optional 방식)
# ========================================================
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


# ========================================================
# [기존 기능] 2. 첫 번째 이미지 저장 노드 (단일 채널 파일명 전달용)
# ========================================================
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
        final_filename = f"{filename}_{counter:05d}"
        
        for image in images:
            i = 255.0 * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            file_path = os.path.join(full_output_folder, f"{final_filename}.png")
            img.save(file_path, compress_level=4)
            
        return (images, final_filename)


# ========================================================
# [기존 기능] 3. 두 번째 이미지 저장 노드 (단일 채널 접미사 추가용)
# ========================================================
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
            }
        }
    
    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "save_images"
    CATEGORY = "TJ_Node/Image"

    def save_images(self, images, base_filename, filename_suffix):
        final_filename = f"{base_filename}{filename_suffix}"
        
        for idx, image in enumerate(images):
            i = 255.0 * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            
            if len(images) > 1:
                file_path = os.path.join(self.output_dir, f"{final_filename}_{idx+1}.png")
            else:
                file_path = os.path.join(self.output_dir, f"{final_filename}.png")
                
            img.save(file_path, compress_level=4)
            
        return {"ui": {"images": []}}


# ========================================================
# [신규 기능] 4. 이클립스 전용 다이나믹 이미지 배치 노드 (20개 채널 대응)
# ========================================================
class DynamicImageBatchEclipse:
    def __init__(self):
        pass
        
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {
                "image_1": ("IMAGE",),
                "files_1": ("LIST",), 
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "do_batch"
    CATEGORY = "TJ_Node/Image"
    
    def do_batch(self, **kwargs):
        valid_images = []
        batched_names = []
        
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
                        
                        filename_found = "Eclipse_Out"
                        if files_list and isinstance(files_list, list) and len(files_list) > 0:
                            raw_path = str(files_list[0])
                            filename_found = os.path.splitext(os.path.basename(raw_path))[0]
                        
                        batched_names.append(filename_found)
        
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
        ECLIPSE_NAME_REGISTRY[id(batched_images)] = batched_names
        
        return (batched_images,)


# ========================================================
# [신규 기능] 5. 이클립스 전용 후속 파일 저장 노드 (서픽스 자동 매칭)
# ========================================================
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
            }
        }
    
    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "save_images"
    CATEGORY = "TJ_Node/Image"

    def save_images(self, images, filename_suffix):
        source_names = ECLIPSE_NAME_REGISTRY.get(id(images), None)
        
        if source_names is None:
            for registered_id, value in ECLIPSE_NAME_REGISTRY.items():
                if isinstance(value, list) and len(value) == images.shape[0]:
                    source_names = value
                    break
                    
        if not source_names:
            source_names = [f"Eclipse_Bulk_{i}" for i in range(images.shape[0])]
        
        for idx in range(images.shape[0]):
            image = images[idx : idx + 1]
            i = 255.0 * image.squeeze(0).cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            
            base_name = source_names[idx] if idx < len(source_names) else f"Extra_{idx}"
            file_path = os.path.join(self.output_dir, f"{base_name}{filename_suffix}.png")
            img.save(file_path, compress_level=4)
            
        return {"ui": {"images": []}}


# ========================================================
# 6. 매핑 매니저 시스템 등록
# ========================================================
NODE_CLASS_MAPPINGS = {
    "DynamicImageBatch": DynamicImageBatch,
    "TJ_SaveImage_Primary": TJ_SaveImage_Primary,
    "TJ_SaveImage_Subsequent": TJ_SaveImage_Subsequent,
    "DynamicImageBatchEclipse": DynamicImageBatchEclipse,
    "TJ_SaveImage_EclipseSubsequent": TJ_SaveImage_EclipseSubsequent
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DynamicImageBatch": "Dynamic Image Batch(TJ)",
    "TJ_SaveImage_Primary": "Save Image(Primary-TJ)",
    "TJ_SaveImage_Subsequent": "Save Image(Suffix-TJ)",
    "DynamicImageBatchEclipse": "Dynamic Image Batch(Eclipse-TJ)",
    "TJ_SaveImage_EclipseSubsequent": "Save Image(Eclipse Suffix-TJ)"
}