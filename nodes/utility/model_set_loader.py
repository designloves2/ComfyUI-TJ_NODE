# nodes/utility/model_set_loader.py
# Model / Clip / VAE를 각각 선택하여 Checkpoint처럼 한 번에 출력하는 노드.

import os

try:
    import folder_paths
except Exception:
    folder_paths = None

try:
    from aiohttp import web
    import server
except Exception:
    web = None
    server = None

NONE_VALUE = "[none]"
DEFAULT_CLIP_TYPE = "stable_diffusion"
MODEL_DTYPES = ["default", "fp8_e4m3fn", "fp8_e5m2", "fp16", "bf16"]
CLIP_DTYPES = ["default", "fp8_e4m3fn", "fp8_e5m2", "fp16", "bf16"]


def _list_folder(kind):
    if folder_paths is None:
        return [NONE_VALUE]
    try:
        names = list(folder_paths.get_filename_list(kind) or [])
        return [NONE_VALUE] + names if names else [NONE_VALUE]
    except Exception:
        return [NONE_VALUE]


def _model_names():
    names = []
    for kind in ("unet", "diffusion_models", "gguf"):
        try:
            names.extend(folder_paths.get_filename_list(kind) or [])
        except Exception:
            pass
    seen = set()
    deduped = []
    for n in names:
        if n not in seen:
            seen.add(n)
            deduped.append(n)
    return [NONE_VALUE] + deduped if deduped else [NONE_VALUE]


def _clip_names():
    names = []
    for kind in ("text_encoders", "clip"):
        try:
            names.extend(folder_paths.get_filename_list(kind) or [])
        except Exception:
            pass
    seen = set()
    deduped = []
    for n in names:
        if n not in seen:
            seen.add(n)
            deduped.append(n)
    return [NONE_VALUE] + deduped if deduped else [NONE_VALUE]


def _vae_names():
    return _list_folder("vae")


def _clip_loader_types():
    try:
        import nodes as _nodes
        cls = _nodes.NODE_CLASS_MAPPINGS.get("CLIPLoader")
        if cls is None:
            return [DEFAULT_CLIP_TYPE]
        spec = cls.INPUT_TYPES().get("required", {}).get("type", [None])[0]
        if isinstance(spec, (list, tuple)):
            return [str(v) for v in spec if v] or [DEFAULT_CLIP_TYPE]
    except Exception:
        pass
    return [DEFAULT_CLIP_TYPE]


def _call_comfy_node(class_name, **kwargs):
    import inspect
    import nodes as _nodes
    if class_name not in _nodes.NODE_CLASS_MAPPINGS:
        raise RuntimeError(f"Required ComfyUI node '{class_name}' is not available.")
    cls = _nodes.NODE_CLASS_MAPPINGS[class_name]
    node = cls()
    fn_name = getattr(cls, "FUNCTION", None)
    if not fn_name:
        raise RuntimeError(f"ComfyUI node '{class_name}' does not define FUNCTION.")
    fn = getattr(node, fn_name)
    sig = inspect.signature(fn)
    if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()):
        return fn(**kwargs)
    return fn(**{k: v for k, v in kwargs.items() if k in sig.parameters})


def _load_model(name, weight_dtype="default"):
    import nodes as _nodes

    # GGUF 모델은 UnetLoaderGGUF 사용 (dtype 무관)
    if str(name).lower().endswith(".gguf"):
        if "UnetLoaderGGUF" in _nodes.NODE_CLASS_MAPPINGS:
            return _call_comfy_node("UnetLoaderGGUF", unet_name=name)[0]
        raise RuntimeError("GGUF model requires UnetLoaderGGUF node (ComfyUI-GGUF).")

    # UNETLoader: 지정 dtype 먼저, 실패 시 default 로 fallback
    dtypes_to_try = [weight_dtype] if weight_dtype != "default" else []
    dtypes_to_try.append("default")
    errors = []
    for dtype in _dedupe_list(dtypes_to_try):
        try:
            return _call_comfy_node("UNETLoader", unet_name=name, weight_dtype=dtype)[0]
        except Exception as e:
            errors.append(f"UNETLoader/{dtype}: {e}")

    # fallback: comfy.sd direct load
    for kind in ("unet", "diffusion_models"):
        try:
            full_path = folder_paths.get_full_path_or_raise(kind, name)
            import comfy.sd
            return comfy.sd.load_diffusion_model(full_path)
        except Exception as e:
            errors.append(f"comfy.sd/{kind}: {e}")

    raise RuntimeError(f"Model load failed: {name} | " + " | ".join(errors))


def _dedupe_list(seq):
    seen = set()
    out = []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _load_clip(name, clip_type, weight_dtype="default"):
    errors = []
    types_to_try = []
    if clip_type and clip_type != NONE_VALUE:
        types_to_try.append(str(clip_type))
    for t in _clip_loader_types():
        if t not in types_to_try:
            types_to_try.append(t)

    # GGUF CLIP (dtype 무관)
    if str(name).lower().endswith(".gguf"):
        import nodes as _nodes
        if "CLIPLoaderGGUF" in _nodes.NODE_CLASS_MAPPINGS:
            return _call_comfy_node("CLIPLoaderGGUF", clip_name=name)[0]

    for t in types_to_try:
        try:
            return _call_comfy_node("CLIPLoader", clip_name=name, type=t, weight_dtype=weight_dtype)[0]
        except Exception:
            try:
                return _call_comfy_node("CLIPLoader", clip_name=name, type=t)[0]
            except Exception as e:
                errors.append(f"{t}: {e}")
    try:
        return _call_comfy_node("CLIPLoader", clip_name=name)[0]
    except Exception as e:
        errors.append(f"no-type: {e}")
        raise RuntimeError("CLIP load failed. Tried: " + " | ".join(errors))


def _load_vae(name):
    return _call_comfy_node("VAELoader", vae_name=name)[0]


class TJ_ModelSetLoader:
    """Model / Clip / VAE 를 각각 선택해서 Checkpoint처럼 MODEL + CLIP + VAE 를 한 번에 출력.

    - Model: diffusion_models / unet / GGUF 모델 (UNETLoader / UnetLoaderGGUF 자동 선택)
    - Clip: text_encoders / clip 폴더 (CLIPLoader type 자동 탐색, GGUF CLIP 지원)
    - VAE: vae 폴더 (VAELoader)
    - 각 슬롯에서 [none]을 선택하면 해당 출력은 None으로 반환됩니다.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "auto_set":      ("BOOLEAN", {"default": False,
                                  "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
                "model_name":    (_model_names(), {"default": NONE_VALUE}),
                "model_dtype":   (MODEL_DTYPES,   {"default": "default",
                                  "tooltip": "UNETLoader weight_dtype. GGUF 모델은 무시됩니다."}),
                "clip_name":     (_clip_names(),   {"default": NONE_VALUE}),
                "clip_type":     (_clip_loader_types(), {"default": DEFAULT_CLIP_TYPE,
                                  "tooltip": "CLIPLoader type 파라미터. GGUF CLIP은 무시됩니다."}),
                "clip_dtype":    (CLIP_DTYPES,     {"default": "default",
                                  "tooltip": "CLIPLoader weight_dtype (지원 버전에서만 동작). GGUF CLIP은 무시됩니다."}),
                "vae_name":      (_vae_names(),    {"default": NONE_VALUE}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE")
    RETURN_NAMES = ("MODEL", "CLIP", "VAE")
    FUNCTION = "load"
    CATEGORY = " ✨ TJ_Node/Loaders"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def load(self, auto_set=False, model_name=NONE_VALUE, model_dtype="default",
             clip_name=NONE_VALUE, clip_type=DEFAULT_CLIP_TYPE, clip_dtype="default",
             vae_name=NONE_VALUE, unique_id=None):
        model = None
        clip = None
        vae = None

        if model_name and model_name != NONE_VALUE:
            model = _load_model(model_name, weight_dtype=model_dtype)

        if clip_name and clip_name != NONE_VALUE:
            clip = _load_clip(clip_name, clip_type, weight_dtype=clip_dtype)

        if vae_name and vae_name != NONE_VALUE:
            vae = _load_vae(vae_name)

        return (model, clip, vae)
