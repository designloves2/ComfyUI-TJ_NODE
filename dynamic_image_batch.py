import torch
import os
from PIL import Image
import numpy as np
from pathlib import Path

# 내부 메모리 추적용 글로벌 레지스트리
ECLIPSE_NAME_REGISTRY = {}

# 이미지 저장 공통 헬퍼 함수 (퀄리티 100% 고정 및 확장자별 처리)
def save_image_with_quality(img_obj, file_path, ext):
    ext = ext.lower().strip('.')
    if ext == 'png':
        # PNG는 무손실이므로 최고 압축(파일 용량 최적화)으로 저장해도 화질 저하가 없습니다.
        img_obj.save(file_path, format='PNG', compress_level=3)
    elif ext in ['jpg', 'jpeg']:
        # JPG 화질 100% 고정 및 최적화 옵션 활성화
        img_obj.save(file_path, format='JPEG', quality=100, subsampling=0, optimize=True)
    elif ext == 'webp':
        # WebP 무손실(Lossless) 모드 및 퀄리티 100% 설정
        img_obj.save(file_path, format='WEBP', lossless=True, quality=100)
    else:
        # 혹시 모를 예외 상황은 PNG로 안전하게 저장
        img_obj.save(file_path, format='PNG')

# ========================================================
# [기본형] 1. 기본형 다이나믹 이미지 배치 노드 (Optional 방식)
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
# [기본형] 2. 첫 번째 이미지 저장 노드 (단일 채널 파일명 전달용)
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
            
        return (images, final_filename + ".png") # 기본형은 확장자를 포함해서 토큰을 넘겨줍니다.


# ========================================================
# [기본형] 3. 두 번째 이미지 저장 노드 (확장자 선택 및 100% 화질 보강)
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
                "extension_option": (["Original", "png", "jpg", "webp"], {"default": "Original"}),
            }
        }
    
    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "save_images"
    CATEGORY = "TJ_Node/Image"

    def save_images(self, images, base_filename, filename_suffix, extension_option):
        # 들어온 파일명에서 순수 이름과 원본 확장자 분리
        orig_path = Path(base_filename)
        pure_name = orig_path.stem
        orig_ext = orig_path.suffix.lower().strip('.') if orig_path.suffix else "png"
        
        # 최종 확장자 결정
        target_ext = orig_ext if extension_option == "Original" else extension_option
        final_filename = f"{pure_name}{filename_suffix}"
        
        for idx, image in enumerate(images):
            i = 255.0 * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            
            if len(images) > 1:
                file_name = f"{final_filename}_{idx+1}.{target_ext}"
            else:
                file_name = f"{final_filename}.{target_ext}"
                
            file_path = os.path.join(self.output_dir, file_name)
            save_image_with_quality(img, file_path, target_ext)
            
        return {"ui": {"images": []}}


# ========================================================
# [이클립스 전용] 4. 다이나믹 이미지 배치 노드 (이름+확장자 통째로 수집)
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
                "files_1": ("*",), 
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "do_batch"
    CATEGORY = "TJ_Node/Image"
    
    def do_batch(self, **kwargs):
        valid_images = []
        batched_names = [] # 여기에는 확장자가 포함된 전체 파일명이 담깁니다.
        
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
                        
                        filename_found = "Eclipse_Out.png"
                        if files_list:
                            raw_str_path = ""
                            if isinstance(files_list, list) and len(files_list) > 0:
                                raw_str_path = str(files_list[0])
                            elif isinstance(files_list, dict):
                                for k, v in files_list.items():
                                    if isinstance(v, list) and len(v) > 0:
                                        raw_str_path = str(v[0])
                                        break
                                    elif isinstance(v, str):
                                        raw_str_path = v
                                        break
                            else:
                                raw_str_path = str(files_list)
                            
                            if raw_str_path:
                                # 이번엔 stem 대신 name을 가져와서 확장자 정보까지 통째로 보존합니다.
                                filename_found = Path(raw_str_path).name
                        
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
# [이클립스 전용] 5. 후속 파일 저장 노드 (오리지날 추적 및 100% 화질 보강)
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
                "extension_option": (["Original", "png", "jpg", "webp"], {"default": "Original"}),
            }
        }
    
    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "save_images"
    CATEGORY = "TJ_Node/Image"

    def save_images(self, images, filename_suffix, extension_option):
        source_names = ECLIPSE_NAME_REGISTRY.get(id(images), None)
        
        if source_names is None:
            for registered_id, value in ECLIPSE_NAME_REGISTRY.items():
                if isinstance(value, list) and len(value) == images.shape[0]:
                    source_names = value
                    break
                    
        if not source_names:
            source_names = [f"Eclipse_Bulk_{i}.png" for i in range(images.shape[0])]
        
        for idx in range(images.shape[0]):
            image = images[idx : idx + 1]
            i = 255.0 * image.squeeze(0).cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            
            # 파일 정보 분석
            full_name = source_names[idx] if idx < len(source_names) else f"Extra_{idx}.png"
            file_path_obj = Path(full_name)
            
            pure_name = file_path_obj.stem
            orig_ext = file_path_obj.suffix.lower().strip('.') if file_path_obj.suffix else "png"
            
            # 사용자가 설정한 옵션에 따라 확장자 분기 처리
            target_ext = orig_ext if extension_option == "Original" else extension_option
            
            file_name = f"{pure_name}{filename_suffix}.{target_ext}"
            file_path = os.path.join(self.output_dir, file_name)
            
            # 최고 화질 고정 헬퍼 함수로 저장
            save_image_with_quality(img, file_path, target_ext)
            
        return {"ui": {"images": []}}


# ========================================================
# 6. 매핑 매니저 시스템 등록 및 이름 반영
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
