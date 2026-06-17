# nodes/generator/zit_controlnet.py
# -----------------------------------------------------------------------------
# TJ_NODE ZIT ControlNet bundle node for Z-Image Turbo (TJ)
# Original UI concept reference: 너무바쁜베짱이 / toobusy ZIT ControlNet
# -----------------------------------------------------------------------------

import inspect
import os
import uuid


def _call_node(class_name, **kwargs):
    import nodes
    try:
        cls = nodes.NODE_CLASS_MAPPINGS[class_name]
    except KeyError as e:
        raise RuntimeError(f"Required ComfyUI node '{class_name}' is not available.") from e
    node = cls()
    fn_name = getattr(cls, "FUNCTION", None)
    if not fn_name:
        raise RuntimeError(f"Node '{class_name}' does not define FUNCTION.")
    fn = getattr(node, fn_name)
    sig = inspect.signature(fn)
    if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()):
        return fn(**kwargs)
    return fn(**{k: v for k, v in kwargs.items() if k in sig.parameters})


def _folder_list(kind, fallback):
    try:
        import folder_paths
        names = list(folder_paths.get_filename_list(kind))
        return names or fallback
    except Exception:
        return fallback


def _patch_names():
    # ModelPatchLoader reads ComfyUI/models/model_patches.
    # Do not scan diffusion_models/unet/checkpoints here; those folders expose
    # base models and make the ZIT ControlNet selector misleading.
    preferred = "ZIT/qwen_image_controlnet_union.safetensors"
    names = _folder_list("model_patches", [])
    if preferred in names:
        names.remove(preferred)
        names.insert(0, preferred)
    return names or [preferred]


def _is_enabled(value):
    return bool(value)


def _first_output(result):
    if isinstance(result, tuple):
        return result[0]
    if isinstance(result, list):
        return result[0]
    return result


def _extract_image(value):
    """Normalize preprocessor output to a ComfyUI IMAGE tensor.

    Some pose preprocessors return a dict/list wrapper instead of the image
    tensor directly. Z-Image ControlNet expects the raw IMAGE tensor.
    """
    if isinstance(value, tuple):
        return _extract_image(value[0])
    if isinstance(value, list):
        return _extract_image(value[0])
    if isinstance(value, dict):
        for key in ("image", "images", "result", "IMAGE", "ui"):
            if key in value:
                candidate = value[key]
                try:
                    return _extract_image(candidate)
                except Exception:
                    continue
        raise RuntimeError(
            f"ZIT ControlNet (TJ): preprocessor returned dict without IMAGE tensor. Keys={list(value.keys())}"
        )
    return value


def _save_previews(items):
    """Save processed control maps to ComfyUI temp and return PreviewImage-style UI entries."""
    results = []
    try:
        import numpy as np
        import folder_paths
        from PIL import Image as PILImage

        temp_dir = folder_paths.get_temp_directory()
        os.makedirs(temp_dir, exist_ok=True)
        prefix = f"tj_zitcn_{uuid.uuid4().hex[:8]}"

        for index, (control_type, tensor) in enumerate(items):
            try:
                tensor = _extract_image(tensor)
                array = tensor
                if hasattr(array, "detach"):
                    array = array.detach().cpu().numpy()
                # ComfyUI IMAGE tensor: [B, H, W, C], float 0..1
                frame = np.clip(array[0] * 255.0, 0, 255).astype("uint8")
                filename = f"{prefix}_{control_type}_{index}.png"
                PILImage.fromarray(frame).save(os.path.join(temp_dir, filename), compress_level=1)
                results.append({"filename": filename, "subfolder": "", "type": "temp"})
            except Exception:
                continue
    except Exception:
        return []
    return results


def _try_preprocess(kind, image, resolution, canny_low=100, canny_high=200):
    """Best-effort wrapper around common ComfyUI preprocessor node names.

    Different users install different preprocessor packs. This helper tries the
    common node names and parameter shapes. If no preprocessor exists, it raises
    a clear error so the user can either install the missing preprocessor node or
    turn the corresponding *_preprocess option OFF and feed a prepared map.
    """
    import nodes

    if kind == "depth":
        attempts = [
            ("MiDaS-DepthMapPreprocessor", {"image": image, "resolution": resolution}),
            ("MiDaS_DepthMap_Preprocessor", {"image": image, "resolution": resolution}),
            ("MidasDetectorProvider", {"image": image, "resolution": resolution}),
            ("Zoe-DepthMapPreprocessor", {"image": image, "resolution": resolution}),
            ("DepthAnythingPreprocessor", {"image": image, "resolution": resolution}),
        ]
    elif kind == "canny":
        attempts = [
            ("CannyEdgePreprocessor", {"image": image, "low_threshold": canny_low, "high_threshold": canny_high, "resolution": resolution}),
            ("Canny", {"image": image, "low_threshold": canny_low, "high_threshold": canny_high}),
            ("CannyPreprocessor", {"image": image, "low_threshold": canny_low, "high_threshold": canny_high, "resolution": resolution}),
        ]
    elif kind == "pose":
        attempts = [
            ("DWPreprocessor", {"image": image, "resolution": resolution}),
            ("DWPose_Preprocessor", {"image": image, "resolution": resolution}),
            ("OpenposePreprocessor", {"image": image, "resolution": resolution}),
        ]
    else:
        return image

    last_error = None
    for class_name, kwargs in attempts:
        if class_name not in nodes.NODE_CLASS_MAPPINGS:
            continue
        try:
            return _first_output(_call_node(class_name, **kwargs))
        except Exception as e:
            last_error = e
            continue

    detail = f" Last error: {last_error}" if last_error else ""
    raise RuntimeError(
        f"ZIT ControlNet (TJ): no usable {kind} preprocessor node found. "
        f"Install the relevant preprocessor pack or set {kind}_preprocess OFF and connect a prepared control map." + detail
    )


class TJ_ZITControlNet:
    """Builds a ZIT_CONTROL bundle for Z-Image Turbo (TJ)."""

    @classmethod
    def INPUT_TYPES(cls):
        patch_names = _patch_names()
        return {
            "required": {
                "patch_name": (patch_names, {"default": patch_names[0]}),
                "depth_enable": ("BOOLEAN", {"default": False, "label_on": "Depth ON", "label_off": "Depth OFF"}),
                "depth_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 5.0, "step": 0.01}),
                "canny_enable": ("BOOLEAN", {"default": False, "label_on": "Canny ON", "label_off": "Canny OFF"}),
                "canny_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 5.0, "step": 0.01}),
                "pose_enable": ("BOOLEAN", {"default": False, "label_on": "Pose ON", "label_off": "Pose OFF"}),
                "pose_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 5.0, "step": 0.01}),
                "depth_preprocess": ("BOOLEAN", {"default": True, "label_on": "Preprocess", "label_off": "Raw map"}),
                "canny_preprocess": ("BOOLEAN", {"default": True, "label_on": "Preprocess", "label_off": "Raw map"}),
                "pose_preprocess": ("BOOLEAN", {"default": True, "label_on": "Preprocess", "label_off": "Raw map"}),
                "preprocessor_resolution": ("INT", {"default": 1024, "min": 64, "max": 4096, "step": 8}),
                "canny_low": ("INT", {"default": 100, "min": 0, "max": 255, "step": 1}),
                "canny_high": ("INT", {"default": 200, "min": 0, "max": 255, "step": 1}),
            },
            "optional": {
                "depth_image": ("IMAGE", {"tooltip": "Depth source image or prepared depth map."}),
                "canny_image": ("IMAGE", {"tooltip": "Canny source image or prepared canny map."}),
                "pose_image": ("IMAGE", {"tooltip": "Pose source image or prepared pose map."}),
            },
        }

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    RETURN_TYPES = ("ZIT_CONTROL",)
    RETURN_NAMES = ("zit_control",)
    FUNCTION = "build"
    CATEGORY = " ✨ TJ_Node/Generator"

    def build(self, patch_name, depth_enable, depth_strength, canny_enable, canny_strength,
              pose_enable, pose_strength, depth_preprocess, canny_preprocess, pose_preprocess,
              preprocessor_resolution, canny_low, canny_high,
              depth_image=None, canny_image=None, pose_image=None):
        entries = []
        previews = []

        slots = (
            ("depth", depth_image, depth_enable, depth_strength, depth_preprocess),
            ("canny", canny_image, canny_enable, canny_strength, canny_preprocess),
            ("pose", pose_image, pose_enable, pose_strength, pose_preprocess),
        )

        for control_type, source_image, enabled, strength, preprocess in slots:
            if not (_is_enabled(enabled) and source_image is not None):
                continue

            image = (
                _try_preprocess(control_type, source_image, preprocessor_resolution, canny_low, canny_high)
                if preprocess
                else source_image
            )
            image = _extract_image(image)

            entries.append({"type": control_type, "image": image, "strength": float(strength)})
            previews.append((control_type, image))

        control = {"patch_name": patch_name, "entries": entries}
        return {"ui": {"images": _save_previews(previews)}, "result": (control,)}
