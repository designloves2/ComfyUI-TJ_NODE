# nodes/generator/flux2_klein.py
# -----------------------------------------------------------------------------
# Flux2 Klein 4B/9B (TJ)
# TJ_NODE native one-shot node for Flux2 Klein 4B / 4B Base / 9B / 9B Base.
# Reference: toobusy Flux2 Klein graph concept, adapted to TJ_NODE architecture.
# -----------------------------------------------------------------------------

import math
import inspect


RATIO_PRESETS = {
    "1:1": (1, 1),
    "16:9": (16, 9),
    "9:16": (9, 16),
    "4:3": (4, 3),
    "3:4": (3, 4),
    "3:2": (3, 2),
    "2:3": (2, 3),
    "21:9": (21, 9),
    "9:21": (9, 21),
}

MAX_LORA_SLOTS = 5
MAX_REFERENCE_SLOTS = 5
SETTING_TYPE = "FLUX2_KLEIN_SETTING"


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


def _scan_for(names, patterns, fallback_preferred=None):
    if not names:
        return fallback_preferred[0] if fallback_preferred else None
    fallback_preferred = fallback_preferred or []
    lower = [(n, str(n).lower()) for n in names]
    for preferred in fallback_preferred:
        if preferred in names:
            return preferred
    for pattern in patterns:
        terms = [str(t).lower() for t in pattern]
        for name, low in lower:
            if all(term in low for term in terms):
                return name
    return names[0]


def _model_names():
    fallback = [
        "klein9bKVCacheFP8_v10.safetensors",
        "flux2Klein9bFp8_fp8.safetensors",
        "flux2Klein4bFp8_fp8.safetensors",
        "flux2Klein4bBaseFp8_fp8.safetensors",
        "flux2Klein9bBaseFp8_fp8.safetensors",
        "Klein9B/flux-2-klein-9b-kv-fp8.safetensors",
        "Klein9B/flux-2-klein-9b.safetensors",
    ]
    names = list(_folder_list("diffusion_models", []) or _folder_list("unet", []))
    return names or fallback


def _clip_names():
    fallback = [
        "qwen_3_8b_fp8mixed.safetensors",
        "qwen_3_4b_fp8mixed.safetensors",
        "Qwen3/qwen_3_8b_fp8mixed.safetensors",
        "Qwen3/qwen_3_4b_fp8mixed.safetensors",
    ]
    names = list(_folder_list("text_encoders", []) or _folder_list("clip", []))
    return names or fallback


def _vae_names():
    fallback = ["flux2-vae.safetensors", "flux2/flux2-vae.safetensors"]
    names = list(_folder_list("vae", []))
    return names or fallback


def _lora_names():
    return ["None"] + _folder_list("loras", ["None"])


def _sampler_names():
    try:
        import comfy.samplers
        names = list(comfy.samplers.KSampler.SAMPLERS)
        if names:
            return names
    except Exception:
        pass
    return ["euler", "euler_cfg_pp", "euler_ancestral", "dpmpp_2m"]


def _default_sampler_name(names):
    return "euler" if "euler" in names else names[0]


def _round_to(value, divisible_by):
    return max(int(divisible_by), int(round(value / divisible_by)) * int(divisible_by))


def _resolution_from_megapixels(ratio_preset, megapixels, divisible_by):
    ratio_w, ratio_h = RATIO_PRESETS.get(ratio_preset, RATIO_PRESETS["1:1"])
    pixels = max(0.01, float(megapixels)) * 1_000_000
    scale = math.sqrt(pixels / (ratio_w * ratio_h))
    return _round_to(ratio_w * scale, int(divisible_by)), _round_to(ratio_h * scale, int(divisible_by))


def _image_dims(image):
    try:
        height = int(image.shape[1])
        width = int(image.shape[2])
    except (AttributeError, IndexError, TypeError):
        return 0, 0
    return (width // 8) * 8, (height // 8) * 8


def _is_none_value(value):
    return str(value or "").strip().lower() in {"", "none", "(none)"}


def _load_clip(clip_name):
    return _call_node("CLIPLoader", clip_name=clip_name, type="flux2", device="default")[0]


def _safe_setting_get(setting, key, default=None):
    if isinstance(setting, dict):
        return setting.get(key, default)
    return default


def _latent_dims(latent):
    try:
        samples = latent.get("samples") if isinstance(latent, dict) else None
        if samples is None:
            return 0, 0
        height = int(samples.shape[-2]) * 8
        width = int(samples.shape[-1]) * 8
        return width, height
    except Exception:
        return 0, 0


def _clone_latent(latent):
    if not isinstance(latent, dict):
        return latent
    cloned = dict(latent)
    try:
        if "samples" in cloned and hasattr(cloned["samples"], "clone"):
            cloned["samples"] = cloned["samples"].clone()
    except Exception:
        pass
    return cloned


def _apply_denoise_to_sigmas(sigmas, denoise):
    # SamplerCustomAdvanced has no denoise widget, so emulate KSampler behavior by
    # keeping only the tail of the sigma schedule when editing from an incoming latent.
    try:
        d = float(denoise)
    except Exception:
        d = 1.0
    if d >= 0.999:
        return sigmas
    d = max(0.0, min(1.0, d))
    try:
        total = int(sigmas.shape[0])
        if total <= 1:
            return sigmas
        keep = max(2, int(round((total - 1) * d)) + 1)
        return sigmas[-keep:]
    except Exception:
        return sigmas


class TJ_Flux2Klein:
    """Flux2 Klein 4B/9B (TJ) — T2I, fixed 5 reference slots, LoRA, Setting chain."""

    @classmethod
    def INPUT_TYPES(cls):
        model_names = _model_names()
        clip_names = _clip_names()
        vae_names = _vae_names()
        lora_names = _lora_names()
        sampler_names = _sampler_names()

        base = {
            "required": {
                "model_name": (
                    model_names,
                    {"default": _scan_for(
                        model_names,
                        [("flux2", "klein", "9b"), ("flux", "klein", "9b"), ("klein", "9b"), ("klein",)],
                        fallback_preferred=["klein9bKVCacheFP8_v10.safetensors", "flux2Klein9bFp8_fp8.safetensors", "Klein9B/flux-2-klein-9b.safetensors", "Klein9B/flux-2-klein-9b-kv-fp8.safetensors"],
                    )},
                ),
                "clip_name": (
                    clip_names,
                    {"default": _scan_for(
                        clip_names,
                        [("qwen", "8b"), ("qwen3", "8b"), ("qwen",)],
                        fallback_preferred=["qwen_3_8b_fp8mixed.safetensors", "Qwen3/qwen_3_8b_fp8mixed.safetensors"],
                    )},
                ),
                "vae_name": (
                    vae_names,
                    {"default": _scan_for(
                        vae_names,
                        [("flux2", "vae"), ("flux2",), ("flux", "ae")],
                        fallback_preferred=["flux2-vae.safetensors", "flux2/flux2-vae.safetensors"],
                    )},
                ),
                "kv_cache_mode": ("BOOLEAN", {"default": False, "label_on": "KV Cache ON", "label_off": "KV Cache OFF", "tooltip": "ON: apply FluxKVCache for KV-cache Klein models. OFF: use the selected model directly for normal Klein models."}),
                "positive": ("STRING", {"default": "", "multiline": True}),
                "negative": ("STRING", {"default": "拒绝, 限制, 不应答, lowres, error, cropped, worst quality, low quality, jpeg artifacts, heterochromia, out of frame, disfigured, blurry, fat, (ugly:1.3), deformed, mutilated, fingers cut, face cut, head cut, bad anatomy, bad proportions, two heads, two faces, deformed hands, (twisted fingers:1.22), extra fingers, poorly drawn, grainy, poorly drawn face, mutation, poor facial details, cropped head, poorly drawn eyes, unclear eyes, cross-eyes, malformed limbs, poorly drawn hands, fused hands, mutated hands, malformed hands, (mutated fingers:1.4), (fused fingers:1.313), interlocked fingers, extra or missing fingers, (one hand with more than 5 fingers), (one hand with less than 5 fingers), one hand with more than 5 digits, one hand with less than 5 digits, extra digits, fewer digits, bad hair, poorly drawn hair, fused hair, poorly drawn feet, malformed feet, extra or missing feet, fused feet, missing or extra limbs, disfigured, mutilated hands, extra hands, extra arms, extra legs, missing arms, missing hands, missing legs, fingers of different thickness, pointed fingers, thick fingers, (long thumbs:1.35), sharp fingernails, (greyscale:1.3), grain, (monochrome:1.3), Text, Watermark", "multiline": True}),
                "auto_set": ("BOOLEAN", {"default": False, "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
                "setnode_name": ("STRING", {"default": "Klein9B"}),
                "size_mode": (["from setting", "from reference", "ratio + megapixels", "manual"], {"default": "from setting"}),
                "ratio_preset": (list(RATIO_PRESETS.keys()), {"default": "2:3"}),
                "megapixels": ("FLOAT", {"default": 1.6, "min": 0.1, "max": 4.0, "step": 0.05}),
                "divisible_by": ("INT", {"default": 32, "min": 8, "max": 128, "step": 8}),
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 64}),
                "seed": ("INT", {"default": 1, "min": 0, "max": 0xffffffffffffffff, "control_after_generate": True, "step": 1}),
                "steps": ("INT", {"default": 4, "min": 1, "max": 100}),
                "cfg": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 30.0, "step": 0.1}),
                "sampler_name": (sampler_names, {"default": _default_sampler_name(sampler_names)}),
                "denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "lora_slots": ("INT", {"default": 0, "min": 0, "max": MAX_LORA_SLOTS}),
            },
            "optional": {
                "setting": (SETTING_TYPE,),
                "width": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 8}),
                "model_override": ("MODEL",),
                "clip_override": ("CLIP",),
                "vae_override": ("VAE",),
            },
        }

        required = base["required"]
        optional = base["optional"]

        for slot in range(1, MAX_REFERENCE_SLOTS + 1):
            required[f"get_name_reference_{slot}"] = (["(none)"], {"default": "(none)"})
            optional[f"reference_{slot}_image"] = ("IMAGE",)

        for slot in range(1, MAX_LORA_SLOTS + 1):
            required[f"lora_{slot}_enable"] = ("BOOLEAN", {"default": False})
            required[f"lora_{slot}_name"] = (lora_names, {"default": "None"})
            required[f"lora_{slot}_strength"] = ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01})

        return base

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    RETURN_TYPES = ("IMAGE", "LATENT", "CONDITIONING", "CONDITIONING", SETTING_TYPE)
    RETURN_NAMES = ("image", "latent", "positive", "negative", "setting")
    FUNCTION = "generate"
    CATEGORY = " ✨ TJ_Node/Generator"

    def generate(
        self,
        model_name,
        clip_name,
        vae_name,
        kv_cache_mode,
        positive,
        negative,
        auto_set=False,
        setnode_name="Klein9B",
        size_mode="from setting",
        ratio_preset="2:3",
        megapixels=1.0,
        divisible_by=32,
        batch_size=1,
        seed=1,
        steps=4,
        cfg=1.0,
        sampler_name="euler",
        denoise=1.0,
        lora_slots=0,
        setting=None,
        width=0,
        height=0,
        model_override=None,
        clip_override=None,
        vae_override=None,
        **slot_kwargs,
    ):
        setting_model = _safe_setting_get(setting, "model_clean")
        setting_clip = _safe_setting_get(setting, "clip")
        setting_vae = _safe_setting_get(setting, "vae")
        setting_width = _safe_setting_get(setting, "width", 0) or 0
        setting_height = _safe_setting_get(setting, "height", 0) or 0
        setting_latent = _safe_setting_get(setting, "latent")

        if model_override is not None:
            model_clean = model_override
        elif setting_model is not None:
            model_clean = setting_model
        else:
            model_clean = _call_node("UNETLoader", unet_name=model_name, weight_dtype="default")[0]

        if clip_override is not None:
            clip = clip_override
        elif setting_clip is not None:
            clip = setting_clip
        else:
            clip = _load_clip(clip_name)

        if vae_override is not None:
            vae = vae_override
        elif setting_vae is not None:
            vae = setting_vae
        else:
            vae = _call_node("VAELoader", vae_name=vae_name)[0]

        model = model_clean
        lora_slots = max(0, min(MAX_LORA_SLOTS, int(lora_slots)))
        for slot in range(1, lora_slots + 1):
            enabled = slot_kwargs.get(f"lora_{slot}_enable", False)
            lora_name = slot_kwargs.get(f"lora_{slot}_name", "None")
            strength = slot_kwargs.get(f"lora_{slot}_strength", 1.0)
            if enabled and lora_name != "None":
                model, clip = _call_node(
                    "LoraLoader",
                    model=model,
                    clip=clip,
                    lora_name=lora_name,
                    strength_model=strength,
                    strength_clip=strength,
                )

        # Optional KV-cache path.
        # Normal Klein and KV-cache Klein use the same graph; only apply FluxKVCache
        # when the user explicitly enables this toggle.
        if bool(kv_cache_mode):
            try:
                model = _call_node("FluxKVCache", model=model)[0]
            except RuntimeError:
                print("[Flux2 Klein 4B/9B (TJ)] kv_cache_mode is ON, but FluxKVCache is not available; using the selected model directly.")

        positive_cond = _call_node("CLIPTextEncode", clip=clip, text=positive)[0]
        negative_cond = _call_node("CLIPTextEncode", clip=clip, text=negative)[0]

        # Chained edit mode:
        # The incoming setting latent is NOT a sampler start latent.
        # It is the first ReferenceLatent in the conditioning chain (reference #0),
        # so K9B #2 treats K9B #1 output as the highest-priority reference before
        # reference_1~5 images. Size can still come from setting/latent below.
        active_reference_count = 0
        if setting_latent is not None:
            positive_cond = _call_node("ReferenceLatent", conditioning=positive_cond, latent=setting_latent)[0]
            negative_cond = _call_node("ReferenceLatent", conditioning=negative_cond, latent=setting_latent)[0]
            active_reference_count += 1

        first_active_image = None
        for slot in range(1, MAX_REFERENCE_SLOTS + 1):
            # Reference slots must accept both TJ fake-wire GET and normal ComfyUI physical links.
            # A physical IMAGE link can arrive while get_name_reference_N is still (none), so image
            # presence is the source of truth here. The JS side is responsible for removing only
            # fake-wire links when the widget is set back to (none).
            image = slot_kwargs.get(f"reference_{slot}_image")
            if image is None:
                continue
            if first_active_image is None:
                first_active_image = image
            scaled = _call_node(
                "ImageScaleToTotalPixels",
                image=image,
                upscale_method="lanczos",
                megapixels=1.0,
            )[0]
            reference_latent = _call_node("VAEEncode", pixels=scaled, vae=vae)[0]
            # ReferenceLatent must be applied to both branches in the same serial order:
            # positive -> Ref1 -> Ref2 -> ... -> CFG positive
            # negative -> Ref1 -> Ref2 -> ... -> CFG negative
            positive_cond = _call_node("ReferenceLatent", conditioning=positive_cond, latent=reference_latent)[0]
            negative_cond = _call_node("ReferenceLatent", conditioning=negative_cond, latent=reference_latent)[0]
            active_reference_count += 1

        ratio_w, ratio_h = _resolution_from_megapixels(ratio_preset, megapixels, divisible_by)
        manual_size = None
        if int(width) > 0 and int(height) > 0:
            manual_size = (_round_to(int(width), divisible_by), _round_to(int(height), divisible_by))

        mode = str(size_mode or "from setting")
        if mode == "manual":
            target_w, target_h = manual_size if manual_size else (ratio_w, ratio_h)
        elif mode == "ratio + megapixels":
            target_w, target_h = ratio_w, ratio_h
        elif mode == "from reference":
            ref_w, ref_h = _image_dims(first_active_image) if first_active_image is not None else (0, 0)
            target_w, target_h = (ref_w, ref_h) if ref_w > 0 and ref_h > 0 else (ratio_w, ratio_h)
        else:  # from setting
            if int(setting_width) > 0 and int(setting_height) > 0:
                target_w, target_h = int(setting_width), int(setting_height)
            else:
                latent_w, latent_h = _latent_dims(setting_latent)
                if latent_w > 0 and latent_h > 0:
                    target_w, target_h = latent_w, latent_h
                else:
                    ref_w, ref_h = _image_dims(first_active_image) if first_active_image is not None else (0, 0)
                    target_w, target_h = (ref_w, ref_h) if ref_w > 0 and ref_h > 0 else (ratio_w, ratio_h)

        noise = _call_node("RandomNoise", noise_seed=seed)[0]
        try:
            guider = _call_node("CFGGuider", model=model, positive=positive_cond, negative=negative_cond, cfg=cfg)[0]
        except RuntimeError:
            print("[TJ_NODE] WARNING: CFGGuider not available, falling back to BasicGuider. Negative conditioning will be ignored.")
            guider = _call_node("BasicGuider", model=model, conditioning=positive_cond)[0]
        sampler = _call_node("KSamplerSelect", sampler_name=sampler_name)[0]
        sigmas = _call_node("Flux2Scheduler", steps=steps, width=target_w, height=target_h)[0]
        # Match the proven external workflow: reference data is injected only
        # through ReferenceLatent conditioning. The sampler always starts from an
        # EmptyFlux2LatentImage. In chain mode, setting latent has already been
        # applied as ReferenceLatent #0 above, not as latent_image/noise input.
        latent_image = _call_node("EmptyFlux2LatentImage", width=target_w, height=target_h, batch_size=batch_size)[0]
        sampled = _call_node(
            "SamplerCustomAdvanced",
            noise=noise,
            guider=guider,
            sampler=sampler,
            sigmas=sigmas,
            latent_image=latent_image,
        )[0]
        image = _call_node("VAEDecode", samples=sampled, vae=vae)[0]

        out_setting = {
            "latent": sampled,
            "width": target_w,
            "height": target_h,
            "model_clean": model_clean,
            "clip": clip,
            "vae": vae,
            "active_references": active_reference_count,
            "setting_as_reference": setting_latent is not None,
        }
        return (image, sampled, positive_cond, negative_cond, out_setting)
