# Multi Model Selecter (TJ)
# Dynamic model/checkpoint/clip/vae selector with Direct Object out / Path out modes.

import json
import os

try:
    import folder_paths
except Exception:  # pragma: no cover
    folder_paths = None

try:
    from aiohttp import web
    import server
except Exception:  # pragma: no cover
    web = None
    server = None

MAX_SLOTS = 64
SELECT_TYPES = ["Model", "Checkpoints", "Clip", "VAE"]
OUTPUT_MODES = ["Model Direct out", "Model Path out"]
NONE_VALUE = "[none]"

DEFAULT_CLIP_LOADER_TYPES = ["stable_diffusion"]


def _clip_loader_types():
    """Return CLIPLoader type choices from the installed ComfyUI.

    This avoids freezing the selector to an old hard-coded list. If ComfyUI
    changes CLIPLoader.INPUT_TYPES(), the frontend receives the current list
    through the /tj_node/multi_model_selecter/list route.
    """
    try:
        import nodes
        cls = nodes.NODE_CLASS_MAPPINGS.get("CLIPLoader") or getattr(nodes, "CLIPLoader", None)
        if cls is None or not hasattr(cls, "INPUT_TYPES"):
            return list(DEFAULT_CLIP_LOADER_TYPES)
        input_types = cls.INPUT_TYPES() or {}
        required = input_types.get("required", {}) if isinstance(input_types, dict) else {}
        spec = required.get("type")
        values = []
        if isinstance(spec, (list, tuple)) and spec:
            raw = spec[0]
            if isinstance(raw, (list, tuple)):
                values = [str(v) for v in raw if v]
        return _dedupe(values + list(DEFAULT_CLIP_LOADER_TYPES)) or list(DEFAULT_CLIP_LOADER_TYPES)
    except Exception:
        return list(DEFAULT_CLIP_LOADER_TYPES)


def _dedupe(seq):
    seen = set()
    out = []
    for x in seq:
        if not x or x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out


def _list_folder(kind):
    if folder_paths is None:
        return []
    try:
        return list(folder_paths.get_filename_list(kind) or [])
    except Exception:
        return []


def _all_model_lists():
    # Model = 기본 시스템 모델: unet / gguf / diffusion_models
    models = []
    for kind in ("unet", "diffusion_models", "gguf"):
        models.extend(_list_folder(kind))

    # Checkpoints
    checkpoints = _list_folder("checkpoints")

    # Clip = text_encoders 우선 + 기존 Comfy clip 폴더도 병합
    clips = []
    for kind in ("text_encoders", "clip"):
        clips.extend(_list_folder(kind))

    # VAE
    vaes = _list_folder("vae")

    return {
        "Model": _dedupe(models),
        "Checkpoints": _dedupe(checkpoints),
        "Clip": _dedupe(clips),
        "VAE": _dedupe(vaes),
    }


def _folder_kind_for_select(select_type, name):
    if folder_paths is None:
        return None
    if select_type == "Checkpoints":
        return "checkpoints"
    if select_type == "VAE":
        return "vae"
    if select_type == "Clip":
        for kind in ("text_encoders", "clip"):
            if name in _list_folder(kind):
                return kind
        return "text_encoders"
    if select_type == "Model":
        for kind in ("unet", "diffusion_models", "gguf"):
            if name in _list_folder(kind):
                return kind
        return "diffusion_models"
    return None


def _as_relative_model_path(name):
    # Comfy widget values normally expect a model-relative filename, not an absolute path.
    return str(name or "")


def _call_comfy_node(class_name, **kwargs):
    import inspect
    import nodes

    if class_name not in nodes.NODE_CLASS_MAPPINGS:
        raise RuntimeError(f"Required ComfyUI node '{class_name}' is not available.")
    cls = nodes.NODE_CLASS_MAPPINGS[class_name]
    node = cls()
    fn_name = getattr(cls, "FUNCTION", None)
    if not fn_name:
        raise RuntimeError(f"ComfyUI node '{class_name}' does not define FUNCTION.")
    fn = getattr(node, fn_name)
    sig = inspect.signature(fn)
    if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()):
        return fn(**kwargs)
    return fn(**{k: v for k, v in kwargs.items() if k in sig.parameters})


def _load_checkpoint(name):
    # Returns MODEL, CLIP, VAE
    try:
        return _call_comfy_node("CheckpointLoaderSimple", ckpt_name=name)
    except Exception:
        # Some installs use CheckpointLoader.
        return _call_comfy_node("CheckpointLoader", config_name="Default", ckpt_name=name)


def _load_clip(name, clip_loader_type="stable_diffusion"):
    # CLIPLoader requires the loader type for many modern text encoders.
    # The frontend stores one type per Clip slot in clip_types_json.
    errors = []
    ordered = []
    if clip_loader_type:
        ordered.append(str(clip_loader_type))
    ordered.extend(_clip_loader_types())
    for t in _dedupe(ordered):
        try:
            return _call_comfy_node("CLIPLoader", clip_name=name, type=t)[0]
        except Exception as e:
            errors.append(f"{t}: {e}")
    try:
        return _call_comfy_node("CLIPLoader", clip_name=name)[0]
    except Exception as e:
        errors.append(f"no type: {e}")
        raise RuntimeError("CLIP direct load failed. Tried: " + " | ".join(errors))


def _load_vae(name):
    return _call_comfy_node("VAELoader", vae_name=name)[0]


def _load_model(name):
    kind = _folder_kind_for_select("Model", name)
    if kind == "gguf":
        # GGUF direct loading is extension-node dependent. Path out is intentionally supported.
        raise RuntimeError(
            "GGUF Model Direct out requires a GGUF loader-specific node. "
            "Use Model Path out for GGUF, or connect through the target node widget."
        )
    # UNETLoader is the standard direct model loader for diffusion_models/unet.
    errors = []
    for weight_dtype in ("default", "fp8_e4m3fn", "fp8_e5m2"):
        try:
            return _call_comfy_node("UNETLoader", unet_name=name, weight_dtype=weight_dtype)[0]
        except Exception as e:
            errors.append(f"UNETLoader/{weight_dtype}: {e}")
    try:
        full_path = folder_paths.get_full_path_or_raise(kind or "diffusion_models", name)
        import comfy.sd
        return comfy.sd.load_diffusion_model(full_path)
    except Exception as e:
        errors.append(f"comfy.sd.load_diffusion_model: {e}")
        raise RuntimeError("Model direct load failed. Tried: " + " | ".join(errors))


def _parse_slots(slots_json):
    try:
        data = json.loads(slots_json or "[]")
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    out = []
    for v in data[:MAX_SLOTS]:
        s = str(v or "").strip()
        if s and s != NONE_VALUE:
            out.append(s)
    return out


def _connected_output_indices(prompt, unique_id):
    """Return output indexes of this node that are actually requested by downstream inputs.

    ComfyUI executes a node once, but the API prompt graph tells us which outputs are
    connected. Direct out should not eagerly load every selected model; it should load
    only the connected output slots and leave all other outputs as None.
    """
    if prompt is None or unique_id is None:
        return None
    uid = str(unique_id)
    try:
        nodes_dict = prompt.get("nodes", prompt) if isinstance(prompt, dict) else prompt
        if not isinstance(nodes_dict, dict):
            return None
        used = set()
        for _node_id, node_data in nodes_dict.items():
            if not isinstance(node_data, dict):
                continue
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            for value in inputs.values():
                # API prompt link format: [source_node_id, source_output_index]
                if isinstance(value, (list, tuple)) and len(value) >= 2 and str(value[0]) == uid:
                    try:
                        used.add(int(value[1]))
                    except Exception:
                        pass
        return used
    except Exception:
        return None


def _output_index_for_slot(select_type, output_mode, slot_index, checkpoint_part=None):
    if output_mode == "Model Path out":
        return slot_index
    if select_type == "Checkpoints":
        # checkpoint_part: 0=MODEL, 1=CLIP, 2=VAE
        return slot_index * 3 + int(checkpoint_part or 0)
    return slot_index


class TJ_MultiModelSelecter:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "auto_set": ("BOOLEAN", {"default": False, "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
                "output_mode": (OUTPUT_MODES, {"default": "Model Direct out"}),
                "select_type": (SELECT_TYPES, {"default": "Model"}),
                # JS keeps this hidden JSON in sync with the visible dynamic selector widgets.
                "slots_json": ("STRING", {"default": "[]", "multiline": False}),
                "clip_types_json": ("STRING", {"default": "[]", "multiline": False}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
            },
        }

    # Frontend JS rebuilds visible outputs to exact slot count/type.
    # Server-side max width is kept large enough for all dynamic cases.
    RETURN_TYPES = tuple(["*"] * (MAX_SLOTS * 3))
    RETURN_NAMES = tuple([f"out_{i + 1}" for i in range(MAX_SLOTS * 3)])
    FUNCTION = "select"
    CATEGORY = " ✨ TJ_Node/Utility"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def select(self, auto_set=False, output_mode="Model Direct out", select_type="Model", slots_json="[]", clip_types_json="[]", unique_id=None, prompt=None):
        selected = _parse_slots(slots_json)
        try:
            clip_types = json.loads(clip_types_json or "[]")
            if not isinstance(clip_types, list):
                clip_types = []
        except Exception:
            clip_types = []

        max_out = MAX_SLOTS * 3
        result = [None] * max_out
        # Dynamic frontend outputs can be serialized with visible slot indexes that do not
        # always match the Python max-output table during workflow reload. Loading only
        # indexes detected from PROMPT made slot 2+ appear connected in the UI but skip
        # actual model loading at execution time.
        # Safer rule for this selector: load every selected visible slot once the node runs.
        connected = None
        load_all_fallback = True

        if output_mode == "Model Path out":
            # Path out never loads model objects. It returns widget-safe relative paths as STRING.
            for slot_i, name in enumerate(selected):
                out_i = _output_index_for_slot(select_type, output_mode, slot_i)
                if out_i >= max_out:
                    continue
                if load_all_fallback or out_i in connected:
                    result[out_i] = _as_relative_model_path(name)
            return tuple(result)

        # Direct object out: each slot is independent. Only connected output indexes are loaded.
        for slot_i, name in enumerate(selected):
            if select_type == "Checkpoints":
                checkpoint_outs = [
                    _output_index_for_slot(select_type, output_mode, slot_i, 0),
                    _output_index_for_slot(select_type, output_mode, slot_i, 1),
                    _output_index_for_slot(select_type, output_mode, slot_i, 2),
                ]
                if not load_all_fallback and not any(i in connected for i in checkpoint_outs):
                    continue
                model, clip, vae = _load_checkpoint(name)
                values = [model, clip, vae]
                for out_i, value in zip(checkpoint_outs, values):
                    if out_i < max_out and (load_all_fallback or out_i in connected):
                        result[out_i] = value

            elif select_type == "Model":
                out_i = _output_index_for_slot(select_type, output_mode, slot_i)
                if out_i < max_out and (load_all_fallback or out_i in connected):
                    result[out_i] = _load_model(name)

            elif select_type == "Clip":
                out_i = _output_index_for_slot(select_type, output_mode, slot_i)
                if out_i < max_out and (load_all_fallback or out_i in connected):
                    clip_type = clip_types[slot_i] if slot_i < len(clip_types) and clip_types[slot_i] else _clip_loader_types()[0]
                    result[out_i] = _load_clip(name, clip_type)

            elif select_type == "VAE":
                out_i = _output_index_for_slot(select_type, output_mode, slot_i)
                if out_i < max_out and (load_all_fallback or out_i in connected):
                    result[out_i] = _load_vae(name)

        return tuple(result)

# API used by the frontend dynamic combo widgets.
if server is not None and web is not None:
    try:
        @server.PromptServer.instance.routes.get("/tj_node/multi_model_selecter/list")
        async def tj_multi_model_selecter_list(request):
            return web.json_response({
                "success": True,
                "lists": _all_model_lists(),
                "clip_loader_types": _clip_loader_types(),
                "none": NONE_VALUE,
            })
    except Exception:
        # Route may already exist after reload; avoid breaking ComfyUI import.
        pass

