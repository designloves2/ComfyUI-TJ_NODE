# nodes/llm/prompt_enhancer.py
import os
from ._llm_utils import (
    TJ_LLM_CATEGORY, MODEL_BACKEND_OPTIONS, MMPROJ_NONE,
    DEFAULT_TEXT_ENCODER_MODEL, DEFAULT_GGUF_MODEL, DEFAULT_MMPROJ_MODEL,
    CLIP_LOADER_TYPE_OPTIONS, PURPOSE_OPTIONS, MODEL_FORMAT_OPTIONS, AESTHETIC_OPTIONS,
    _text_encoder_ggufs, _text_encoder_mmproj_options, _text_encoder_model_options,
    _resolve_text_encoder_path, _is_bad_choice, _free_llm, _free_comfy_vram, _clean_output,
    _strip_thinking_tags, _strip_thinking_process_block,
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
            _free_comfy_vram()   # GGUF 로드 전 ComfyUI 모델을 VRAM 에서 내려 공간 확보
            llm = Llama(model_path=model_path, n_gpu_layers=n_gpu_layers, verbose=False, n_ctx=int(n_ctx), seed=int(seed))
            try:
                messages = [
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": prompt_in},
                ]
                chat_kwargs = dict(
                    messages=messages,
                    max_tokens=int(max_tokens), temperature=float(temperature), top_p=float(top_p),
                    repeat_penalty=float(repeat_penalty),
                    # "</think>" 를 stop 에 넣으면 하이브리드 씽킹 모델이 생각 블록을 닫는
                    # 순간(진짜 답변이 나오기 직전) 생성이 통째로 끊겨서, raw_output 이
                    # 추론 내용뿐이거나(닫는 태그 직후 곧바로) 빈 문자열이 돼버린다 —
                    # 실제 브리프는 </think> 뒤에 나오므로 여기서 자르면 안 되고, 생성이
                    # 끝난 뒤 _strip_thinking_tags/_strip_thinking_process_block 로
                    # 사후에 걷어내는 쪽(아래 _clean_output)에 맡긴다.
                    stop=["\n\nUser:", "\n\nAssistant:", "Human:"],
                )
                if append_no_think:
                    # 예전엔 "<think>\n</think>\n" 을 가짜 assistant 턴으로 미리 넣어 씽킹을
                    # "우회"하려 했는데, create_chat_completion 은 이걸 이미 끝난 턴으로 취급해
                    # 새 assistant 턴을 또 시작하므로 모델이 다시 생각 블록을 여는 경우가 흔했다.
                    # ComfyUI-MiniMaxH3-Prompt-Writer(같은 GGUF/llama.cpp 스택, 실제로 결과가
                    # 잘 나오는 걸로 확인된 구현)는 해킹 없이 Qwen3 계열 공식 Jinja 템플릿이
                    # 지원하는 enable_thinking 템플릿 변수를 그대로 넘긴다 - 여기도 동일하게
                    # 맞춘다. 구버전 llama-cpp-python/이 kwarg 를 모르는 채팅 포맷이면
                    # TypeError 가 나므로, 그때만 재시도 없이 그냥 빼고 보낸다.
                    chat_kwargs["enable_thinking"] = False
                try:
                    output = llm.create_chat_completion(**chat_kwargs)
                except TypeError:
                    chat_kwargs.pop("enable_thinking", None)
                    output = llm.create_chat_completion(**chat_kwargs)
                raw_output = output["choices"][0]["message"]["content"].strip()
            finally:
                _free_llm(llm)
            file_label = gguf_model

        final_prompt = _clean_output(raw_output, prompt_in)
        if not final_prompt.strip() or len(final_prompt) < 20:
            final_prompt = _strip_thinking_process_block(_strip_thinking_tags(raw_output)).strip()
            if not final_prompt:
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
