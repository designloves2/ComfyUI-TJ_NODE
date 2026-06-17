# nodes/image/dynamic_batch.py
import torch


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
            try:
                return int(key_str.split('_')[1])
            except:
                return 999

        for key in sorted(kwargs.keys(), key=get_number):
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
        processed = []
        for img in valid_images:
            if img.shape[1] != target_h or img.shape[2] != target_w:
                permuted = img.permute(0, 3, 1, 2)
                resized = torch.nn.functional.interpolate(
                    permuted, size=(target_h, target_w), mode="bilinear", align_corners=False
                )
                img = resized.permute(0, 2, 3, 1)
            processed.append(img)

        return (torch.cat(processed, dim=0),)
