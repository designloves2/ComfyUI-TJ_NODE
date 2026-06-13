from .tj_llm_nodes import (
    TJ_PromptEnhancer,
    TJ_ImageToPrompt,
    MODEL_BACKEND_OPTIONS,
    PURPOSE_OPTIONS,
    MODEL_FORMAT_OPTIONS,
    AESTHETIC_OPTIONS,
    MMPROJ_NONE,
    _HANDLER_CLASSES,
    _text_encoder_ggufs,
    _text_encoder_mmproj_options,
    _text_encoder_model_options,
)

try:
    from .tj_llm_nodes import (
        CLIP_LOADER_TYPE_OPTIONS,
        DEFAULT_TEXT_ENCODER_MODEL,
        DEFAULT_GGUF_MODEL,
        DEFAULT_MMPROJ_MODEL,
    )
except Exception:
    CLIP_LOADER_TYPE_OPTIONS = [
        "Auto", "stable_diffusion", "stable_cascade", "sd3", "stable_audio", "mochi",
        "ltxv", "pixart", "cosmos", "lumina2", "wan", "hidream", "chroma",
        "ace", "omnigen2", "qwen_image", "hunyuan_image", "flux2", "ovis",
        "longcat_image", "cogvideox", "lens", "pixeldict", "ideogram4"
    ]
    DEFAULT_TEXT_ENCODER_MODEL = "gemma4_e4b_it_fp8_scaled.safetensors"
    DEFAULT_GGUF_MODEL = "qwen3.5-4B-Uncensored-HauhauCS-Aggressive-Q8_0.gguf"
    DEFAULT_MMPROJ_MODEL = "mmproj-qwen3.5-4B-Uncensored-HauhauCS-Aggressive-BF16.gguf"

TJ_LLM_CATEGORY = " ✨ TJ_Node/LLM"


class TJ_PromptStudio:
    """Prompt Studio (TJ)

    2-in-1 experimental LLM node.
    - Auto mode: image connected -> Image to Prompt, otherwise Prompt Enhancer.
    - Manual mode: force Prompt Enhancer or Image to Prompt.
    This file is intentionally separated so it can be removed safely if needed.
    """

    MODE_OPTIONS = ["Auto", "Image to Prompt", "Prompt Enhancer"]

    @classmethod
    def INPUT_TYPES(cls):
        handler_options = ["Auto-detect"] + list(_HANDLER_CLASSES.keys())
        if not _HANDLER_CLASSES:
            handler_options = ["NO_VISION_HANDLERS_AVAILABLE"]
        return {
            "required": {
                "get_name_prompt": (["(none)"], {"default": "(none)"}),
                "get_name_image": (["(none)"], {"default": "(none)"}),
                "set_name": ("STRING", {"default": "Prompt_Studio"}),
                "mode": (cls.MODE_OPTIONS, {"default": "Auto"}),
                "raw_prompt": ("STRING", {"multiline": True, "default": ""}),
                "model_backend": (MODEL_BACKEND_OPTIONS, {"default": "GGUF / llama.cpp"}),
                "gguf_model": (_text_encoder_ggufs(exclude_mmproj=True), {"default": DEFAULT_GGUF_MODEL}),
                "mmproj_file": (_text_encoder_mmproj_options(), {"default": DEFAULT_MMPROJ_MODEL}),
                "chat_handler": (handler_options,),
                "text_encoder_name": (_text_encoder_model_options(), {"default": DEFAULT_TEXT_ENCODER_MODEL}),
                "clip_loader_type": (CLIP_LOADER_TYPE_OPTIONS, {"default": "Auto"}),
                "purpose": (PURPOSE_OPTIONS,),
                "vision_task": (TJ_ImageToPrompt.VISION_TASK_OPTIONS,),
                "model_format": (MODEL_FORMAT_OPTIONS,),
                "aesthetic": (AESTHETIC_OPTIONS,),
                "extra_instructions": ("STRING", {"multiline": True, "default": ""}),
                "system_prompt_override": ("STRING", {"multiline": True, "default": ""}),
                "custom_instruction": ("STRING", {"multiline": True, "default": ""}),
                "append_no_think": ("BOOLEAN", {"default": True, "label_on": "Append /no_think", "label_off": "Don't append"}),
                "n_gpu_layers": ("INT", {"default": -1, "min": -1, "max": 999, "step": 1}),
                "n_ctx": ("INT", {"default": 4096, "min": 512, "max": 32768, "step": 512}),
                "max_tokens": ("INT", {"default": 1000, "min": 50, "max": 4096, "step": 50}),
                "temperature": ("FLOAT", {"default": 0.7, "min": 0.0, "max": 2.0, "step": 0.05}),
                "top_p": ("FLOAT", {"default": 0.9, "min": 0.0, "max": 1.0, "step": 0.05}),
                "repeat_penalty": ("FLOAT", {"default": 1.15, "min": 1.0, "max": 2.0, "step": 0.05}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "lock_in": ("BOOLEAN", {"default": False, "label_on": "🔒 LOCKED (cached)", "label_off": "🔄 LIVE"}),
            },
            "optional": {
                "raw_prompt_input": ("STRING", {"forceInput": True}),
                "image": ("IMAGE",),
                "clip": ("CLIP",),
            },
        }

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        if kwargs.get("lock_in"):
            return "LOCKED|" + "|".join(str(kwargs.get(k, "")) for k in sorted(kwargs) if k not in {"seed", "clip", "image", "get_name", "get_name_prompt", "get_name_image"})
        return float("nan")

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "thought_process")
    FUNCTION = "run"
    CATEGORY = TJ_LLM_CATEGORY

    def run(
        self,
        get_name_prompt="(none)",
        get_name_image="(none)",
        get_name="(none)",
        set_name="Prompt_Studio",
        mode="Auto",
        raw_prompt="",
        model_backend="GGUF / llama.cpp",
        gguf_model="",
        mmproj_file=MMPROJ_NONE,
        chat_handler="Auto-detect",
        text_encoder_name="",
        clip_loader_type="Auto",
        purpose="Image",
        vision_task="Caption (plain description)",
        model_format="Universal Natural Language",
        aesthetic="None (no aesthetic injection)",
        extra_instructions="",
        system_prompt_override="",
        custom_instruction="",
        append_no_think=True,
        n_gpu_layers=-1,
        n_ctx=4096,
        max_tokens=1000,
        temperature=0.7,
        top_p=0.9,
        repeat_penalty=1.15,
        seed=0,
        lock_in=False,
        raw_prompt_input=None,
        image=None,
        clip=None,
    ):
        effective_mode = mode
        if effective_mode == "Auto":
            effective_mode = "Image to Prompt" if image is not None else "Prompt Enhancer"

        if clip is not None:
            model_backend = "ComfyUI TextGenerate"

        if effective_mode == "Image to Prompt":
            if image is None:
                raise ValueError("Prompt Studio (TJ): Image input is required for Image to Prompt mode. Use Auto or Prompt Enhancer mode if no image is connected.")
            return TJ_ImageToPrompt().describe(
                get_name=get_name_image if get_name_image != "(none)" else get_name,
                set_name=set_name,
                image=image,
                model_backend=model_backend,
                gguf_model=gguf_model,
                mmproj_file=mmproj_file,
                chat_handler=chat_handler,
                text_encoder_name=text_encoder_name,
                clip_loader_type=clip_loader_type,
                vision_task=vision_task,
                model_format=model_format,
                aesthetic=aesthetic,
                custom_instruction=custom_instruction,
                n_gpu_layers=n_gpu_layers,
                n_ctx=n_ctx,
                max_tokens=max_tokens,
                temperature=temperature,
                seed=seed,
                lock_in=lock_in,
                clip=clip,
            )

        return TJ_PromptEnhancer().enhance(
            get_name=get_name_prompt if get_name_prompt != "(none)" else get_name,
            set_name=set_name,
            raw_prompt=raw_prompt,
            model_backend=model_backend,
            gguf_model=gguf_model,
            mmproj_file=mmproj_file,
            text_encoder_name=text_encoder_name,
            clip_loader_type=clip_loader_type,
            purpose=purpose,
            model_format=model_format,
            aesthetic=aesthetic,
            extra_instructions=extra_instructions,
            system_prompt_override=system_prompt_override,
            append_no_think=append_no_think,
            n_gpu_layers=n_gpu_layers,
            n_ctx=n_ctx,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            repeat_penalty=repeat_penalty,
            seed=seed,
            lock_in=lock_in,
            raw_prompt_input=raw_prompt_input,
            clip=clip,
        )


__all__ = ["TJ_PromptStudio"]
