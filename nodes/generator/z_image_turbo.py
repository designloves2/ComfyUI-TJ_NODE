# nodes/generator/z_image_turbo.py
# -----------------------------------------------------------------------------
# TJ_NODE adapted version
# Original: 너무바쁜베짱이 / https://github.com/nicekriss/toobusy
# -----------------------------------------------------------------------------

import math
import inspect


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


def _sampler_names():
    try:
        import comfy.samplers
        names = list(comfy.samplers.KSampler.SAMPLERS)
        if names:
            return names
    except Exception:
        pass
    return ["euler", "euler_cfg_pp", "euler_ancestral", "euler_ancestral_cfg_pp"]


def _default_sampler_name(sampler_names):
    if "res_multistep" in sampler_names:
        return "res_multistep"
    return "res_2s" if "res_2s" in sampler_names else sampler_names[0]


def _scan_for(names, keyword_groups, fallback_preferred=None):
    names = list(names or [])
    fallback_preferred = list(fallback_preferred or [])
    lowered = [(name, str(name).lower().replace("-", "_").replace(" ", "_")) for name in names]
    for group in keyword_groups:
        wanted = [str(x).lower().replace("-", "_").replace(" ", "_") for x in group]
        for name, low in lowered:
            if all(w in low for w in wanted):
                return name
    for preferred in fallback_preferred:
        if preferred in names:
            return preferred
    return names[0] if names else (fallback_preferred[0] if fallback_preferred else "")


RATIO_PRESETS = {
    "1:1": (1, 1), "16:9": (16, 9), "9:16": (9, 16),
    "4:3": (4, 3), "3:4": (3, 4), "3:2": (3, 2), "2:3": (2, 3),
    "21:9": (21, 9), "9:21": (9, 21),
}
MAX_LORA_SLOTS = 5


def _folder_list(kind, fallback):
    try:
        import folder_paths
        names = list(folder_paths.get_filename_list(kind))
        return names or fallback
    except Exception:
        return fallback


def _first_existing(names, preferred):
    for name in preferred:
        if name in names:
            return name
    return names[0]


def _model_names():
    names = _folder_list("diffusion_models", [])
    if not names:
        names = _folder_list("unet", [])
    return names or ["ZIT/zImage_turbo.safetensors"]


def _clip_names():
    names = _folder_list("text_encoders", [])
    if not names:
        names = _folder_list("clip", [])
    return names or ["ZIT/zImage_textEncoder.safetensors"]


def _vae_names():
    return _folder_list("vae", ["FLUX1/ae.safetensors"])


def _lora_names():
    return ["None"] + _folder_list("loras", ["Lora/ZIT/ZIT_Neobabae_v1.safetensors"])


def _default_lora_name(lora_names):
    for name in ["Lora/ZIT/ZIT_Neobabae_v1.safetensors", "ZIT/ZIT_Neobabae_v1.safetensors"]:
        if name in lora_names:
            return name
    for name in lora_names:
        if "ZIT_Neobabae" in name:
            return name
    return lora_names[1] if len(lora_names) > 1 else "None"


def _scheduler_names():
    try:
        import comfy.samplers
        names = list(comfy.samplers.KSampler.SCHEDULERS)
        if names:
            return names
    except Exception:
        pass
    return ["simple", "normal", "karras", "exponential", "sgm_uniform"]


def _round_to(value, divisible_by):
    return max(int(divisible_by), int(round(value / divisible_by)) * int(divisible_by))


def _image_dims(image):
    try:
        height = int(image.shape[1])
        width = int(image.shape[2])
    except (AttributeError, IndexError, TypeError):
        return 0, 0
    return (width // 8) * 8, (height // 8) * 8


def _latent_dims(latent):
    try:
        samples = latent["samples"]
        return int(samples.shape[-1]) * 8, int(samples.shape[-2]) * 8
    except (AttributeError, IndexError, KeyError, TypeError):
        return 0, 0


def _apply_zit_control(model, vae, control, width, height):
    entries = list(control.get("entries", [])) if isinstance(control, dict) else []
    if not entries:
        return model

    patch_name = control.get("patch_name")
    if not patch_name or patch_name == "None":
        print("[Z-Image Turbo (TJ)] ZIT_CONTROL connected but patch_name is empty; skipped.")
        return model

    model_patch = _call_node("ModelPatchLoader", name=patch_name)[0]
    for entry in entries:
        image = entry.get("image")
        if image is None:
            continue
        sized = _call_node(
            "ImageScale",
            image=image,
            upscale_method="lanczos",
            width=int(width),
            height=int(height),
            crop="center",
        )[0]
        strength = float(entry.get("strength", 1.0))
        model = _call_node(
            "QwenImageDiffsynthControlnet",
            model=model,
            model_patch=model_patch,
            vae=vae,
            image=sized,
            strength=strength,
        )[0]
        print(f"[Z-Image Turbo (TJ)] ControlNet patch applied: {entry.get('type')} @ {strength}")
    return model


def _resolution_from_megapixels(ratio_preset, megapixels, divisible_by):
    ratio_w, ratio_h = RATIO_PRESETS.get(ratio_preset, RATIO_PRESETS["1:1"])
    pixels = max(0.01, float(megapixels)) * 1_000_000
    scale = math.sqrt(pixels / (ratio_w * ratio_h))
    return _round_to(ratio_w * scale, int(divisible_by)), _round_to(ratio_h * scale, int(divisible_by))


class TJ_ZImageTurbo:
    """Z-Image Turbo (TJ) — T2I / I2I / latent override / ZIT ControlNet one-shot node."""

    @classmethod
    def INPUT_TYPES(cls):
        model_names = _model_names()
        clip_names = _clip_names()
        vae_names = _vae_names()
        lora_names = _lora_names()
        sampler_names = _sampler_names()
        scheduler_names = _scheduler_names()

        base = {
            "required": {
                "model_name": (model_names, {"default": _first_existing(model_names, ["ZIT/z_image_turbo_bf16.safetensors", "ZIT/zImage_turbo.safetensors"])}),
                "clip_name": (clip_names, {"default": _first_existing(clip_names, ["zimage/qwen_3_4b.safetensors", "ZIT/zImage_textEncoder.safetensors"])}),
                "vae_name": (vae_names, {"default": _first_existing(vae_names, ["ae.safetensors", "FLUX1/ae.safetensors"])}),
                "positive": ("STRING", {"default": "", "multiline": True}),
                "negative": ("STRING", {"default": "", "multiline": True}),
                "get_name": (["(none)"], {"default": "(none)"}),
                "auto_set": ("BOOLEAN", {"default": False, "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
                "setnode_name": ("STRING", {"default": "Z-Image"}),
                "ratio_preset": (list(RATIO_PRESETS.keys()), {"default": "2:3"}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 4.0, "step": 0.05}),
                "divisible_by": ("INT", {"default": 32, "min": 8, "max": 128, "step": 8}),
                "seed": ("INT", {"default": 1, "min": 0, "max": 0xffffffffffffffff, "control_after_generate": True, "step": 1}),
                "steps": ("INT", {"default": 8, "min": 1, "max": 100}),
                "width": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 8}),
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 64}),
                "cfg": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 30.0, "step": 0.1}),
                "sampler_name": (sampler_names, {"default": "res_multistep" if "res_multistep" in sampler_names else _default_sampler_name(sampler_names)}),
                "scheduler": (scheduler_names, {"default": "simple" if "simple" in scheduler_names else scheduler_names[0]}),
                "denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "aura_shift": ("FLOAT", {"default": 3.0, "min": 0.0, "max": 20.0, "step": 0.1}),
                "lora_slots": ("INT", {"default": 0, "min": 0, "max": MAX_LORA_SLOTS}),
            },
            "optional": {
                "image": ("IMAGE", {"tooltip": "Embedded GET / image input. Connected image switches to img2img."}),
                "model_override": ("MODEL",),
                "clip_override": ("CLIP",),
                "vae_override": ("VAE",),
                "positive_override": ("CONDITIONING", {"tooltip": "Connected = positive text is ignored."}),
                "negative_override": ("CONDITIONING", {"tooltip": "Connected = negative text is ignored."}),
                "latent_override": ("LATENT", {"tooltip": "Connected = latent wins over image and empty latent."}),
                "zit_control": ("ZIT_CONTROL", {"tooltip": "Connect ZIT ControlNet (TJ)."}),
            },
        }

        required = base["required"]
        for slot in range(1, MAX_LORA_SLOTS + 1):
            required[f"lora_{slot}_enable"] = ("BOOLEAN", {"default": False})
            required[f"lora_{slot}_name"] = (lora_names, {"default": _default_lora_name(lora_names) if slot == 1 else "None"})
            required[f"lora_{slot}_strength"] = ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01})

        return base

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    RETURN_TYPES = ("IMAGE", "LATENT", "INT", "INT", "MODEL", "MODEL", "CLIP", "VAE", "CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("image", "latent", "width", "height", "model", "model_clean", "clip", "vae", "positive", "negative")
    FUNCTION = "generate"
    CATEGORY = " ✨ TJ_Node/Generator"

    def generate(self, model_name, clip_name, vae_name, positive, negative,
                 ratio_preset, megapixels, divisible_by, batch_size, seed, steps,
                 cfg, sampler_name, scheduler, denoise, aura_shift, lora_slots,
                 get_name="(none)", auto_set=False, setnode_name="Z-Image", image=None, width=0, height=0,
                 model_override=None, clip_override=None, vae_override=None,
                 positive_override=None, negative_override=None, latent_override=None,
                 zit_control=None, **lora_kwargs):
        # Z-Image Turbo (TJ) core is intentionally kept equivalent to the
        # stable toobusy / TJ 2.1 path. 2.1.1 extensions are only applied when
        # their inputs are actually connected.
        if int(width) > 0 and int(height) > 0:
            target_w = _round_to(int(width), divisible_by)
            target_h = _round_to(int(height), divisible_by)
        else:
            target_w, target_h = _resolution_from_megapixels(ratio_preset, megapixels, divisible_by)

        if model_override is not None:
            print("[Z-Image Turbo (TJ)] Using external MODEL override. Internal model loader ignored.")
            model = model_override
        else:
            print("[Z-Image Turbo (TJ)] Using internal MODEL loader.")
            model = _call_node("UNETLoader", unet_name=model_name, weight_dtype="default")[0]

        if clip_override is not None:
            print("[Z-Image Turbo (TJ)] Using external CLIP override. Internal CLIP loader ignored.")
            clip = clip_override
        else:
            print("[Z-Image Turbo (TJ)] Using internal CLIP loader.")
            clip = _call_node("CLIPLoader", clip_name=clip_name, type="lumina2", device="default")[0]

        if vae_override is not None:
            print("[Z-Image Turbo (TJ)] Using external VAE override. Internal VAE loader ignored.")
            vae = vae_override
        else:
            print("[Z-Image Turbo (TJ)] Using internal VAE loader.")
            vae = _call_node("VAELoader", vae_name=vae_name)[0]

        # Clean passthrough: before LoRA / ModelSamplingAuraFlow / ControlNet.
        model_clean = model

        lora_slots = max(0, min(MAX_LORA_SLOTS, int(lora_slots)))
        for slot in range(1, lora_slots + 1):
            enabled = lora_kwargs.get(f"lora_{slot}_enable", False)
            lora_name = lora_kwargs.get(f"lora_{slot}_name", "None")
            lora_strength = lora_kwargs.get(f"lora_{slot}_strength", 1.0)
            if enabled and lora_name != "None":
                model, clip = _call_node(
                    "LoraLoader",
                    model=model,
                    clip=clip,
                    lora_name=lora_name,
                    strength_model=lora_strength,
                    strength_clip=lora_strength,
                )

        model = _call_node("ModelSamplingAuraFlow", model=model, shift=aura_shift)[0]
        positive_cond = positive_override if positive_override is not None else _call_node("CLIPTextEncode", clip=clip, text=positive)[0]
        negative_cond = negative_override if negative_override is not None else _call_node("CLIPTextEncode", clip=clip, text=negative)[0]

        # Latent source. This matches the stable node:
        # image -> VAEEncode -> KSampler latent_image, otherwise EmptyLatentImage.
        # latent_override is only used when explicitly connected.
        if latent_override is not None:
            if image is not None:
                print("[Z-Image Turbo (TJ)] latent_override and image both connected — latent wins.")
            latent_image = latent_override
            latent_w, latent_h = _latent_dims(latent_override)
            width, height = (latent_w, latent_h) if latent_w > 0 and latent_h > 0 else (target_w, target_h)
        elif image is not None:
            explicit_size = int(width) > 0 and int(height) > 0
            if explicit_size:
                print(f"[Z-Image Turbo (TJ)] Image input detected -> img2img. Scaling source to {target_w}x{target_h} (denoise = strength).")
                pixels = _call_node(
                    "ImageScale",
                    image=image,
                    upscale_method="lanczos",
                    width=target_w,
                    height=target_h,
                    crop="center",
                )[0]
                width, height = target_w, target_h
            else:
                print("[Z-Image Turbo (TJ)] Image input detected -> img2img. Using source image size (denoise = strength).")
                pixels = image
                width, height = _image_dims(image)
            latent_image = _call_node("VAEEncode", pixels=pixels, vae=vae)[0]
        else:
            latent_image = _call_node("EmptyLatentImage", width=target_w, height=target_h, batch_size=batch_size)[0]
            width, height = target_w, target_h

        if zit_control is not None:
            model = _apply_zit_control(model, vae, zit_control, width, height)

        sampled = _call_node(
            "KSampler",
            model=model,
            seed=seed,
            steps=steps,
            cfg=cfg,
            sampler_name=sampler_name,
            scheduler=scheduler,
            positive=positive_cond,
            negative=negative_cond,
            latent_image=latent_image,
            denoise=denoise,
        )[0]
        image = _call_node("VAEDecode", samples=sampled, vae=vae)[0]
        return (image, sampled, width, height, model, model_clean, clip, vae, positive_cond, negative_cond)
