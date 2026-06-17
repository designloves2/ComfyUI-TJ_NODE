# nodes/llm/prompt_enhancer.py
import os
from ._llm_utils import (
    TJ_LLM_CATEGORY, MODEL_BACKEND_OPTIONS, MMPROJ_NONE,
    DEFAULT_TEXT_ENCODER_MODEL, DEFAULT_GGUF_MODEL, DEFAULT_MMPROJ_MODEL,
    CLIP_LOADER_TYPE_OPTIONS, PURPOSE_OPTIONS, MODEL_FORMAT_OPTIONS, AESTHETIC_OPTIONS,
    _text_encoder_ggufs, _text_encoder_mmproj_options, _text_encoder_model_options,
    _resolve_text_encoder_path, _is_bad_choice, _free_llm, _clean_output,
    _load_clip_from_text_encoder, _generate_with_textgenerate,
    build_layered_system_prompt,
)


class TJ_PromptEnhancer:
    _cache = {}

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "get_name": (["(none)"], {"default": "(none)"}),
                "set_name": ("STRING", {"default": "Prompt_Enhancer"}),
                "raw_prompt": ("STRING", {"multiline": True, "default": ""}),
                "model_backend": (MODEL_BACKEND_OPTIONS, {"default": "GGUF / llama.cpp"}),
                "gguf_model": (_text_encoder_ggufs(exclude_mmproj=True), {"default": DEFAULT_GGUF_MODEL}),
                "mmproj_file": (_text_encoder_mmproj_options(), {"default": DEFAULT_MMPROJ_MODEL}),
                "text_encoder_name": (_text_encoder_model_options(), {"default": DEFAULT_TEXT_ENCODER_MODEL}),
                "clip_loader_type": (CLIP_LOADER_TYPE_OPTIONS, {"default": "Auto"}),
                "purpose": (PURPOSE_OPTIONS,),
                "model_format": (MODEL_FORMAT_OPTIONS,),
                "aesthetic": (AESTHETIC_OPTIONS,),
                "extra_instructions": ("STRING", {"multiline": True, "default": ""}),
                "system_prompt_override": ("STRING", {"multiline": True, "default": ""}),
                "append_no_think": ("BOOLEAN", {"default": True, "label_on": "Append /no_think", "label_off": "Don't append"}),
                "n_gpu_layers": ("INT", {"default": -1, "min": -1, "max": 999, "step": 1}),
                "n_ctx": ("INT", {"default": 4096, "min": 512, "max": 32768, "step": 512}),
                "max_tokens": ("INT", {"default": 1000, "min": 50, "max": 4096, "step": 50}),
                "temperature": ("FLOAT", {"default": 0.7, "min": 0.0, "max": 2.0, "step": 0.05}),
                "top_p": ("FLOAT", {"default": 0.9, "min": 0.0, "max": 1.0, "step": 0.05}),
                "repeat_penalty": ("FLOAT", {"default": 1.15, "min": 1.0, "max": 2.0, "step": 0.05}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "lock_in": ("BOOLEAN", {"default": False, "label_on": "🔒 LOCKED (cached)", "label_off": "🔄 LIVE (generating)"}),
            },
            "optional": {
                "raw_prompt_input": ("STRING", {"forceInput": True}),
                "clip": ("CLIP",),
            },
        }

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        if kwargs.get("lock_in"):
            return "LOCKED|" + "|".join(str(kwargs.get(k, "")) for k in sorted(kwargs) if k not in {"seed", "clip"})
        return float("nan")

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("enhanced_prompt", "thought_process")
    FUNCTION = "enhance"
    CATEGORY = TJ_LLM_CATEGORY

    def _build_sys_prompt(self, purpose, model_format, aesthetic, extra_instructions, override, append_no_think):
        if str(override or "").strip():
            text = str(override).strip()
            return text.rstrip() + " /no_think" if append_no_think else text
        return build_layered_system_prompt(purpose, model_format, aesthetic, extra_instructions, append_no_think)

    def enhance(self, get_name="(none)", set_name="Prompt_Enhancer", raw_prompt="",
                model_backend="GGUF / llama.cpp", gguf_model="", mmproj_file=MMPROJ_NONE,
                text_encoder_name="", clip_loader_type="Auto", purpose="Image",
                model_format="Universal Natural Language", aesthetic="None (no aesthetic injection)",
                extra_instructions="", system_prompt_override="", append_no_think=True,
                n_gpu_layers=-1, n_ctx=4096, max_tokens=1000, temperature=0.7, top_p=0.9,
                repeat_penalty=1.15, seed=0, lock_in=False, raw_prompt_input=None, clip=None):

        prompt_in = str(raw_prompt_input if raw_prompt_input not in (None, "") else raw_prompt)
        if clip is not None:
            model_backend = "ComfyUI TextGenerate"

        cache_key = (prompt_in, model_backend, gguf_model, mmproj_file, text_encoder_name,
                     clip_loader_type, purpose, model_format, aesthetic, extra_instructions,
                     system_prompt_override, append_no_think, temperature, top_p, repeat_penalty)

        if lock_in and cache_key in self._cache:
            c = self._cache[cache_key]
            thought = f"=== 🔒 LOCKED — Returning Cached Output ===\nNo model load. No VRAM used.\n\n{c['thought']}"
            return (c["final_prompt"], thought)

        sys_prompt = self._build_sys_prompt(purpose, model_format, aesthetic, extra_instructions, system_prompt_override, append_no_think)

        if model_backend == "ComfyUI TextGenerate":
            if clip is None:
                if _is_bad_choice(text_encoder_name):
                    raise FileNotFoundError("No model found in models/text_encoders.")
                clip = _load_clip_from_text_encoder(text_encoder_name, clip_loader_type)
            raw_output = str(_generate_with_textgenerate(clip, f"{sys_prompt}\n\nUser prompt:\n{prompt_in}", max_tokens, seed)).strip()
            file_label = text_encoder_name
        else:
            from llama_cpp import Llama
            if _is_bad_choice(gguf_model):
                raise FileNotFoundError("No .gguf model found in models/text_encoders.")
            model_path = _resolve_text_encoder_path(gguf_model)
            if not model_path or not os.path.isfile(model_path):
                raise FileNotFoundError(f"Selected GGUF not found: {model_path}")
            llm = Llama(model_path=model_path, n_gpu_layers=n_gpu_layers, verbose=False, n_ctx=int(n_ctx), seed=int(seed))
            try:
                output = llm.create_chat_completion(
                    messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": prompt_in}],
                    max_tokens=int(max_tokens), temperature=float(temperature), top_p=float(top_p),
                    repeat_penalty=float(repeat_penalty),
                    stop=["\n\nUser:", "\n\nAssistant:", "Human:", "</think>", "</thinking>"],
                )
                raw_output = output["choices"][0]["message"]["content"].strip()
            finally:
                _free_llm(llm)
            file_label = gguf_model

        final_prompt = _clean_output(raw_output, prompt_in)
        if not final_prompt.strip() or len(final_prompt) < 20:
            final_prompt = raw_output

        thought = (
            f"=== 🔄 LIVE — Prompt Enhancer (TJ) ===\n"
            f"Backend: {model_backend}\nModel: {file_label}\nPurpose: {purpose}\n"
            f"Format: {model_format}\nAesthetic: {aesthetic}\nSeed: {seed}\n"
            f"Raw chars: {len(raw_output)}\nClean chars: {len(final_prompt)}\n\n"
            f"=== System Prompt ===\n{sys_prompt}\n\n=== Raw Output ===\n{raw_output}\n\n=== Final Prompt ===\n{final_prompt}"
        )
        self._cache[cache_key] = {"final_prompt": final_prompt, "thought": thought}
        return (final_prompt, thought)
