# nodes/video/ltx2_sampler.py
# -----------------------------------------------------------------------------
# TJ_NODE adapted version
# Original: 너무바쁜베짱이 / https://github.com/nicekriss/toobusy
# -----------------------------------------------------------------------------

import inspect


def _call_node(class_name, **kwargs):
    import nodes
    try:
        cls = nodes.NODE_CLASS_MAPPINGS[class_name]
    except KeyError as e:
        raise RuntimeError(
            f"Required ComfyUI node '{class_name}' is not available. "
            "Install/enable the LTXV nodes first."
        ) from e
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
    try:
        import nodes as _nodes
        input_types = _nodes.NODE_CLASS_MAPPINGS["KSamplerSelect"].INPUT_TYPES()
        spec = input_types["required"]["sampler_name"][0]
        if not isinstance(spec, str):
            return list(spec)
    except Exception:
        pass
    return ["euler", "euler_cfg_pp", "euler_ancestral", "euler_ancestral_cfg_pp"]


def _default_sampler_name(sampler_names):
    return "res_2s" if "res_2s" in sampler_names else sampler_names[0]


class TJ_LTX2Sampler:
    """LTX2. TJ Sampler — 8개 노드를 1개로 압축.

    Replaces: RandomNoise + LTXVConcatAVLatent + CFGGuider + KSamplerSelect +
    ManualSigmas + SamplerCustomAdvanced + LTXVSeparateAVLatent + LTXVCropGuides
    """

    @classmethod
    def INPUT_TYPES(cls):
        sampler_names = _sampler_names()
        return {
            "required": {
                "model": ("MODEL",),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "video_latent": ("LATENT",),
                "audio_latent": ("LATENT",),
                "seed": ("INT", {"default": 42, "min": 0, "max": 0xffffffffffffffff, "control_after_generate": True}),
                "cfg": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 30.0, "step": 0.1}),
                "sampler_name": (sampler_names, {"default": _default_sampler_name(sampler_names)}),
                "manual_sigmas": ("STRING", {
                    "default": "1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0",
                    "multiline": False,
                }),
            },
            "optional": {
                "sigmas": ("SIGMAS",),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "LATENT", "LATENT")
    RETURN_NAMES = ("positive", "negative", "video_latent", "audio_latent")
    FUNCTION = "sample"
    CATEGORY = " ✨ TJ_Node/Video"

    def sample(self, model, positive, negative, video_latent, audio_latent,
               seed, cfg, sampler_name, manual_sigmas, sigmas=None):

        noise = _call_node("RandomNoise", noise_seed=seed)[0]
        av_latent = _call_node("LTXVConcatAVLatent", video_latent=video_latent, audio_latent=audio_latent)[0]
        guider = _call_node("CFGGuider", model=model, positive=positive, negative=negative, cfg=cfg)[0]
        sampler = _call_node("KSamplerSelect", sampler_name=sampler_name)[0]
        sigma_schedule = sigmas if sigmas is not None else _call_node("ManualSigmas", sigmas=manual_sigmas)[0]

        sampled_av = _call_node("SamplerCustomAdvanced",
                                noise=noise, guider=guider, sampler=sampler,
                                sigmas=sigma_schedule, latent_image=av_latent)[0]

        video_latent, audio_latent = _call_node("LTXVSeparateAVLatent", av_latent=sampled_av)[:2]

        cropped_pos, cropped_neg, cropped_video = _call_node(
            "LTXVCropGuides", positive=positive, negative=negative, latent=video_latent
        )[:3]

        return (cropped_pos, cropped_neg, cropped_video, audio_latent)
