# nodes/llm/image_to_prompt.py
import gc
import os
import torch
from ._llm_utils import (
    TJ_LLM_CATEGORY, MODEL_BACKEND_OPTIONS, MMPROJ_NONE,
    DEFAULT_TEXT_ENCODER_MODEL, DEFAULT_GGUF_MODEL, DEFAULT_MMPROJ_MODEL,
    CLIP_LOADER_TYPE_OPTIONS, MODEL_FORMAT_OPTIONS, AESTHETIC_OPTIONS,
    _HANDLER_CLASSES,
    _text_encoder_ggufs, _text_encoder_mmproj_options, _text_encoder_model_options,
    _resolve_text_encoder_path, _is_bad_choice, _free_llm, _clean_output,
    _load_clip_from_text_encoder, _generate_with_textgenerate,
    MODEL_FORMAT_INSTRUCTIONS, AESTHETIC_DESCRIPTORS,
    tensor_to_data_uri,
)

CONTENT_QUALITY_CHECK_INSTRUCTION = """You are an image usability reviewer for a ComfyUI workflow.

Your goal is to decide whether the generated image should be saved automatically or sent to preview for human review.

Return "OK" only when the image is clearly usable.

Return "FAIL" when the image should be checked by a human before saving.

Do not judge artistic style harshly.
Do not fail for small texture issues or minor background artifacts.

Return FAIL when any of the following is clearly visible:
- missing arm
- only one arm visible when two arms should be visible
- missing hand
- severely deformed hand
- broken or impossible body structure
- severely distorted face
- missing or badly damaged eyes
- strong blur on the main subject
- low-detail or melted main subject
- body parts cut off unexpectedly
- major asymmetry in the body
- heavy artifacts on the person
- the main subject is not clearly usable

If the person has unclear arms, unclear hands, or strong blur on the body, return FAIL.

If the image is generally sharp, the face is usable, the body structure is believable, and the prompt is mostly represented, return OK.

When uncertain, return FAIL.

Return only valid JSON.

{
  "verdict":"OK" or "FAIL",
  "reason":"short reason",
  "matched":[...],
  "issues":[...]
}
"""

VISION_TASK_OPTIONS = [
    "Caption (plain description)",
    "Caption + Format (apply model_format below)",
    "SD/Booru Tags",
    "Pose & Anatomy Focus",
    "Content Quality Check",
    "Custom Instruction",
]
VISION_TASK_INSTRUCTIONS = {
    "Caption (plain description)": (
        "Describe this image in one detailed paragraph covering subject, composition, "
        "lighting, colors, mood, and notable details. Output only the description."
    ),
    "SD/Booru Tags": (
        "Generate a comma-separated list of descriptive tags for this image. "
        "Include subject, action, setting, lighting, mood, and style tags. "
        "Output only the tags, comma-separated."
    ),
    "Pose & Anatomy Focus": (
        "Describe the subject's pose, body position, expression, framing, and what's "
        "visible in detail. Be precise about positioning. Output only the description."
    ),
    "Content Quality Check": CONTENT_QUALITY_CHECK_INSTRUCTION,
}


class TJ_ImageToPrompt:
    _cache = {}

    VISION_TASK_OPTIONS = VISION_TASK_OPTIONS

    @classmethod
    def INPUT_TYPES(cls):
        handler_options = ["Auto-detect"] + list(_HANDLER_CLASSES.keys())
        if not _HANDLER_CLASSES:
            handler_options = ["NO_VISION_HANDLERS_AVAILABLE"]
        return {
            "required": {
                "get_name": (["(none)"], {"default": "(none)"}),
                "set_name": ("STRING", {"default": "Image_Prompt"}),
                "image": ("IMAGE",),
                "model_backend": (MODEL_BACKEND_OPTIONS, {"default": "GGUF / llama.cpp"}),
                "gguf_model": (_text_encoder_ggufs(exclude_mmproj=True), {"default": DEFAULT_GGUF_MODEL}),
                "mmproj_file": (_text_encoder_mmproj_options(), {"default": DEFAULT_MMPROJ_MODEL}),
                "chat_handler": (handler_options,),
                "text_encoder_name": (_text_encoder_model_options(), {"default": DEFAULT_TEXT_ENCODER_MODEL}),
                "clip_loader_type": (CLIP_LOADER_TYPE_OPTIONS, {"default": "Auto"}),
                "vision_task": (cls.VISION_TASK_OPTIONS,),
                "model_format": (MODEL_FORMAT_OPTIONS,),
                "aesthetic": (AESTHETIC_OPTIONS,),
                "custom_instruction": ("STRING", {"multiline": True, "default": ""}),
                "n_gpu_layers": ("INT", {"default": -1, "min": -1, "max": 999, "step": 1}),
                "n_ctx": ("INT", {"default": 4096, "min": 512, "max": 32768, "step": 512}),
                "max_tokens": ("INT", {"default": 1000, "min": 50, "max": 4096, "step": 50}),
                "temperature": ("FLOAT", {"default": 0.4, "min": 0.0, "max": 2.0, "step": 0.05}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "lock_in": ("BOOLEAN", {"default": False, "label_on": "🔒 LOCKED (cached)", "label_off": "🔄 LIVE (analyzing)"}),
            },
            "optional": {"clip": ("CLIP",)},
        }

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, image, **kwargs):
        if kwargs.get("lock_in"):
            return "LOCKED|" + "|".join(str(kwargs.get(k, "")) for k in sorted(kwargs) if k not in {"seed", "clip"})
        try:
            img_hash = hash(image.detach().cpu().numpy().tobytes())
        except Exception:
            img_hash = "noimg"
        return f"LIVE|{img_hash}|{kwargs.get('seed')}|{float('nan')}"

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("image_prompt", "thought_process")
    FUNCTION = "describe"
    CATEGORY = TJ_LLM_CATEGORY

    def _resolve_handler(self, chat_handler_choice, model_file):
        if chat_handler_choice == "Auto-detect":
            mf = str(model_file or "").lower()
            if "moondream" in mf and "Moondream" in _HANDLER_CLASSES:
                return _HANDLER_CLASSES["Moondream"], "Moondream"
            if "qwen" in mf and "Qwen2.5-VL" in _HANDLER_CLASSES:
                return _HANDLER_CLASSES["Qwen2.5-VL"], "Qwen2.5-VL"
            if "minicpm" in mf and "MiniCPM-V 2.6" in _HANDLER_CLASSES:
                return _HANDLER_CLASSES["MiniCPM-V 2.6"], "MiniCPM-V 2.6"
            if "nano" in mf and "llava" in mf and "NanoLLaVA" in _HANDLER_CLASSES:
                return _HANDLER_CLASSES["NanoLLaVA"], "NanoLLaVA"
            if "llava" in mf:
                if "LLaVA 1.6" in _HANDLER_CLASSES:
                    return _HANDLER_CLASSES["LLaVA 1.6"], "LLaVA 1.6"
                if "LLaVA 1.5" in _HANDLER_CLASSES:
                    return _HANDLER_CLASSES["LLaVA 1.5"], "LLaVA 1.5"
            if "LLaVA 1.5" in _HANDLER_CLASSES:
                return _HANDLER_CLASSES["LLaVA 1.5"], "LLaVA 1.5 (fallback)"
            raise RuntimeError("No vision chat handler available.")
        if chat_handler_choice not in _HANDLER_CLASSES:
            raise RuntimeError(f"Chat handler '{chat_handler_choice}' not available. Available: {list(_HANDLER_CLASSES.keys())}")
        return _HANDLER_CLASSES[chat_handler_choice], chat_handler_choice

    def _build_instruction(self, vision_task, model_format, aesthetic, custom_instruction):
        custom = str(custom_instruction or "").strip()
        if vision_task == "Custom Instruction":
            return custom or "Describe this image."
        if vision_task == "Caption + Format (apply model_format below)":
            base = "Describe this image faithfully, then format the description according to the rules below. "
            base += MODEL_FORMAT_INSTRUCTIONS[model_format]
            if aesthetic in AESTHETIC_DESCRIPTORS:
                base += " " + AESTHETIC_DESCRIPTORS[aesthetic]
            base += " Output only the formatted prompt."
        else:
            base = VISION_TASK_INSTRUCTIONS[vision_task]
            if aesthetic in AESTHETIC_DESCRIPTORS:
                base += " " + AESTHETIC_DESCRIPTORS[aesthetic]
        if custom:
            base += "\n\nAdditional user instruction:\n" + custom
        return base

    def describe(self, get_name="(none)", set_name="Image_Prompt", image=None,
                 model_backend="GGUF / llama.cpp", gguf_model="", mmproj_file=MMPROJ_NONE,
                 chat_handler="Auto-detect", text_encoder_name="", clip_loader_type="Auto",
                 vision_task="Caption (plain description)", model_format="Universal Natural Language",
                 aesthetic="None (no aesthetic injection)", custom_instruction="",
                 n_gpu_layers=-1, n_ctx=4096, max_tokens=1000, temperature=0.4,
                 seed=0, lock_in=False, clip=None):

        if clip is not None:
            model_backend = "ComfyUI TextGenerate"

        cache_key = (model_backend, gguf_model, mmproj_file, chat_handler, text_encoder_name,
                     clip_loader_type, vision_task, model_format, aesthetic, custom_instruction, temperature)

        if lock_in and cache_key in self._cache:
            c = self._cache[cache_key]
            thought = f"=== 🔒 LOCKED — Returning Cached Caption ===\nNo model load. New image ignored.\n\n{c['thought']}"
            return (c["final_prompt"], thought)

        instruction = self._build_instruction(vision_task, model_format, aesthetic, custom_instruction)

        if model_backend == "ComfyUI TextGenerate":
            if clip is None:
                if _is_bad_choice(text_encoder_name):
                    raise FileNotFoundError("No model found in models/text_encoders.")
                clip = _load_clip_from_text_encoder(text_encoder_name, clip_loader_type)
            try:
                raw_output = str(_generate_with_textgenerate(clip, instruction, max_tokens, seed, image=image)).strip()
            except Exception as e:
                raise RuntimeError(f"ComfyUI TextGenerate could not analyze image. Use GGUF Vision mode. Error: {e}")
            model_label = text_encoder_name
            handler_label = "ComfyUI TextGenerate"
        else:
            from llama_cpp import Llama
            if _is_bad_choice(gguf_model):
                raise FileNotFoundError("No .gguf model found in models/text_encoders.")
            if chat_handler == "NO_VISION_HANDLERS_AVAILABLE" or not _HANDLER_CLASSES:
                raise RuntimeError("No vision chat handlers available. Update/install llama-cpp-python.")
            if mmproj_file == MMPROJ_NONE:
                raise RuntimeError("GGUF Vision mode requires an mmproj file.")
            model_path = _resolve_text_encoder_path(gguf_model)
            mmproj_path = _resolve_text_encoder_path(mmproj_file)
            if not model_path or not os.path.isfile(model_path):
                raise FileNotFoundError(f"Model not found: {model_path}")
            if not mmproj_path or not os.path.isfile(mmproj_path):
                raise FileNotFoundError(f"mmproj not found: {mmproj_path}")
            handler_cls, handler_label = self._resolve_handler(chat_handler, gguf_model)
            img_uri = tensor_to_data_uri(image)
            chat_handler_instance = handler_cls(clip_model_path=mmproj_path, verbose=False)
            llm = Llama(model_path=model_path, chat_handler=chat_handler_instance,
                        n_gpu_layers=int(n_gpu_layers), verbose=False, n_ctx=int(n_ctx),
                        seed=int(seed), logits_all=True)
            try:
                output = llm.create_chat_completion(
                    messages=[{"role": "user", "content": [
                        {"type": "image_url", "image_url": {"url": img_uri}},
                        {"type": "text", "text": instruction},
                    ]}],
                    max_tokens=int(max_tokens), temperature=float(temperature), top_p=0.9, repeat_penalty=1.1,
                )
                raw_output = output["choices"][0]["message"]["content"].strip()
            finally:
                _free_llm(llm)
                try:
                    del chat_handler_instance
                except Exception:
                    pass
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            model_label = gguf_model

        final_prompt = _clean_output(raw_output)
        if not final_prompt.strip() or len(final_prompt) < 20:
            final_prompt = raw_output

        thought = (
            f"=== 🔄 LIVE — Image to Prompt (TJ) ===\n"
            f"Backend: {model_backend}\nModel: {model_label}\nmmproj: {mmproj_file}\n"
            f"Chat handler: {handler_label}\nVision task: {vision_task}\n"
            f"Format: {model_format}\nAesthetic: {aesthetic}\nSeed: {seed}\n"
            f"Raw chars: {len(raw_output)}\nClean chars: {len(final_prompt)}\n\n"
            f"=== Instruction Sent ===\n{instruction}\n\n=== Raw Output ===\n{raw_output}\n\n=== Image Prompt ===\n{final_prompt}"
        )
        self._cache[cache_key] = {"final_prompt": final_prompt, "thought": thought}
        return (final_prompt, thought)
