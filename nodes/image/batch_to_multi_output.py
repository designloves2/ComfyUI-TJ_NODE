# nodes/image/batch_to_multi_output.py
import torch
from ...core.tj_types import any_type


class TJ_BatchToMultiOutput:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "get_name": (["(none)"], {"default": "(none)"}),
                "out_count": ("INT", {"default": 2, "min": 1, "max": 64, "step": 1}),
                "auto_set": ("BOOLEAN", {"default": False, "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
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
            black = torch.zeros((1, images.shape[1], images.shape[2], images.shape[3]),
                                dtype=images.dtype, device=images.device)

        result = []
        for i in range(out_count):
            result.append(images[i: i + 1] if batch_size and i < batch_size else black)
        for _ in range(64 - out_count):
            result.append(None)

        return tuple(result)
