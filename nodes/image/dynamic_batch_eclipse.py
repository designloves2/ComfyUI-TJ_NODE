# nodes/image/dynamic_batch_eclipse.py
import os
import torch
import folder_paths
from ._image_utils import ECLIPSE_NAME_REGISTRY


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
            try:
                return int(key_str.split('_')[1])
            except:
                return 999

        checked_indices = set()
        for key in sorted(kwargs.keys(), key=get_number):
            if '_' not in key:
                continue
            idx_str = key.split('_')[1]
            if idx_str in checked_indices:
                continue
            checked_indices.add(idx_str)

            img = kwargs.get(f"image_{idx_str}", None)
            files_list = kwargs.get(f"files_{idx_str}", None)

            if img is not None and isinstance(img, torch.Tensor) and len(img.shape) == 4 and img.shape[0] > 0:
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
                    full_path_found = os.path.join(folder_paths.get_output_directory(), "Eclipse_Out.png")
                batched_paths.append(full_path_found)

        if not valid_images:
            return (torch.zeros((1, 64, 64, 3), dtype=torch.float32),)

        target_h, target_w = valid_images[0].shape[1], valid_images[0].shape[2]
        processed = []
        for img in valid_images:
            if img.shape[1] != target_h or img.shape[2] != target_w:
                permuted = img.permute(0, 3, 1, 2)
                resized = torch.nn.functional.interpolate(
                    permuted, size=(target_h, target_w), mode="bilinear", align_corners=False
                )
                img = resized.permute(0, 2, 3, 1)
            processed.append(img)

        batched_images = torch.cat(processed, dim=0)
        ECLIPSE_NAME_REGISTRY[id(batched_images)] = batched_paths
        return (batched_images,)
