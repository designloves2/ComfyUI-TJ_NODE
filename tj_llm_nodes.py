import torch
import gc
import os
import re
import base64
from io import BytesIO

import numpy as np
from PIL import Image
from llama_cpp import Llama

# Vision chat handlers — best-effort import.
_HANDLER_CLASSES = {}
for _label, _modname in [
    ("LLaVA 1.5", "Llava15ChatHandler"),
    ("LLaVA 1.6", "Llava16ChatHandler"),
    ("Moondream", "MoondreamChatHandler"),
    ("MiniCPM-V 2.6", "MiniCPMv26ChatHandler"),
    ("NanoLLaVA", "NanoLlavaChatHandler"),
    ("Qwen2.5-VL", "Qwen25VLChatHandler"),
]:
    try:
        _mod = __import__("llama_cpp.llama_chat_format", fromlist=[_modname])
        _HANDLER_CLASSES[_label] = getattr(_mod, _modname)
    except Exception:
        pass


# =========================================================================
# Shared cleaning helpers
# =========================================================================

REASONING_MARKERS = (
    "let me", "i'll ", "i will ", "i need", "i must", "i should",
    "the prompt is", "the user", "key elements", "brainstorm",
    "as per the rules", "according to the rules", "the rules say",
    "let's", "okay so", "first,", "second,", "third,",
    "i can say", "i might", "since this", "so i",
)

PREAMBLES = (
    "here's", "here is", "sure,", "sure!", "certainly,", "of course,",
    "okay,", "okay.", "alright,",
    "enhanced prompt:", "expanded prompt:", "prompt:",
    "output:", "answer:", "final prompt:", "final:", "example:",
    "the image shows", "the image depicts", "this image shows",
    "in the image", "i can see", "i see",
)


def _strip_thinking_tags(text):
    for pat in (
        r"<think(?:ing)?>.*?</think(?:ing)?>",
        r"<\|thinking\|>.*?<\|/thinking\|>",
        r"\[THINK(?:ING)?\].*?\[/THINK(?:ING)?\]",
    ):
        text = re.sub(pat, "", text, flags=re.DOTALL | re.IGNORECASE)
    return text


def _extract_final_paragraph(text):
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if len(paragraphs) < 2:
        return text
    full_lower = text.lower()
    if sum(1 for m in REASONING_MARKERS if m in full_lower) < 2:
        return text
    for p in reversed(paragraphs):
        lower = p.lower().lstrip()
        if any(lower.startswith(m) for m in REASONING_MARKERS):
            continue
        lines = p.split("\n")
        bullets = sum(
            1 for l in lines
            if l.strip().startswith(("-", "*", "•", "1.", "2.", "3."))
        )
        if bullets > 0 and bullets >= len(lines) / 2:
            continue
        if len(p) < 60:
            continue
        if sum(1 for m in REASONING_MARKERS if m in lower) >= 2:
            continue
        return p
    return text


def _strip_preambles(text):
    for _ in range(3):
        lowered = text.lower().lstrip()
        stripped = False
        for p in PREAMBLES:
            if lowered.startswith(p):
                colon = text.find(":")
                newline = text.find("\n")
                if 0 < colon < 60:
                    text = text[colon + 1:].strip()
                elif 0 < newline < 80:
                    text = text[newline + 1:].strip()
                else:
                    text = text[len(p):].strip(" ,.:-")
                stripped = True
                break
        if not stripped:
            break
    return text


def _clean_output(text, original_input=""):
    text = text.strip()
    text = _strip_thinking_tags(text)
    text = _extract_final_paragraph(text)
    text = _strip_preambles(text)
    if original_input:
        raw = original_input.strip()
        if raw and text.lower().startswith(raw.lower()):
            text = text[len(raw):].lstrip(" ,.:-\"'\n")
    return text.strip().strip('"\'')


def _free_llm(llm):
    try:
        del llm
    except Exception:
        pass
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def _list_ggufs(exclude_mmproj=True):
    try:
        node_dir = os.path.dirname(os.path.abspath(__file__))
        files = []
        for f in os.listdir(node_dir):
            if not f.lower().endswith(".gguf"):
                continue
            if exclude_mmproj and f.lower().startswith("mmproj"):
                continue
            files.append(f)
        files.sort()
        return files if files else ["NO_GGUF_FILES_IN_FOLDER"]
    except Exception:
        return ["NO_GGUF_FILES_IN_FOLDER"]


def _list_mmproj():
    try:
        node_dir = os.path.dirname(os.path.abspath(__file__))
        files = sorted(
            f for f in os.listdir(node_dir)
            if f.lower().endswith(".gguf") and f.lower().startswith("mmproj")
        )
        return files if files else ["NO_MMPROJ_FILE_FOUND"]
    except Exception:
        return ["NO_MMPROJ_FILE_FOUND"]


# =========================================================================
# Style system — Purpose + Model Format + Aesthetic
# =========================================================================

PURPOSE_OPTIONS = ["Image", "Video", "Edit (Inpainting/I2V)"]

PURPOSE_FRAMING = {
    "Image": (
        "Rewrite the user's input as a detailed prompt for a static image. "
        "Cover subject, environment, lighting, composition, and mood."
    ),
    "Video": (
        "Rewrite the user's input as a detailed prompt for a video shot. "
        "Cover subject motion, camera movement, pacing, lighting, and mood."
    ),
    "Edit (Inpainting/I2V)": (
        "Rewrite the user's edit instruction as a description of the final transformed "
        "scene as it appears after the edit. Do not describe the editing process."
    ),
}

MODEL_FORMAT_OPTIONS = [
    "Flux / Chroma (natural language)",
    "Z-Image / Lumina-2 (LLM text encoder)",
    "HiDream (hybrid prose + descriptors)",
    "SDXL (tags + weights)",
    "SD 1.5 (tags + weights)",
    "Pony / Illustrious (booru tags + score)",
    "LTX Video (motion-focused prose)",
    "Hunyuan / Wan Video (cinematic motion prose)",
    "Universal Natural Language",
]

MODEL_FORMAT_INSTRUCTIONS = {
    "Flux / Chroma (natural language)": (
        "Format the output as flowing natural language in long descriptive sentences "
        "suitable for Flux or Chroma. No tag syntax. No parenthesis weights. "
        "No 'masterpiece' or quality boosters. Describe the scene as prose."
    ),
    "Z-Image / Lumina-2 (LLM text encoder)": (
        "Format the output as long, richly descriptive natural-language prose suitable "
        "for LLM-based text encoders (Z-Image, Lumina-2). Use complex sentences and "
        "vivid concrete detail. No tag syntax, no weights."
    ),
    "HiDream (hybrid prose + descriptors)": (
        "Format the output as flowing natural language with concrete photographic and "
        "material descriptors woven in (lighting type, lens feel, surface texture). "
        "Suitable for HiDream's multi-encoder pipeline. No weight syntax."
    ),
    "SDXL (tags + weights)": (
        "Format the output as a comma-separated list of descriptive tags for SDXL. "
        "Start with quality tags (masterpiece, best quality, highly detailed). "
        "Use parenthesis weight syntax for emphasis like (cinematic lighting:1.2). "
        "Order: subject, action, environment, lighting, camera, style, quality."
    ),
    "SD 1.5 (tags + weights)": (
        "Format the output as a comma-separated list of descriptive tags for SD 1.5. "
        "Lead with quality boosters (masterpiece, best quality, ultra-detailed). "
        "Use parenthesis weight syntax for emphasis. Keep tags compact and direct. "
        "Order: subject, action, environment, lighting, style, quality."
    ),
    "Pony / Illustrious (booru tags + score)": (
        "Format the output as comma-separated booru-style tags for Pony / Illustrious. "
        "Lead with score tags: score_9, score_8_up, score_7_up. Include an appropriate "
        "rating tag (rating_safe, rating_questionable, rating_explicit). Use underscores "
        "for multi-word tags (long_hair, blue_eyes). "
        "Order: score, rating, subject, character traits, action, setting, style."
    ),
    "LTX Video (motion-focused prose)": (
        "Format the output as a video shot description for LTX Video. "
        "Lead with a clear shot description, then describe subject motion explicitly "
        "(what moves and how), camera movement (pan, dolly, zoom, tracking), pacing, "
        "and atmosphere. Natural language sentences. No tag syntax."
    ),
    "Hunyuan / Wan Video (cinematic motion prose)": (
        "Format the output as a cinematic video description with detailed motion. "
        "Cover camera angle, camera movement, subject action, environmental motion, "
        "atmosphere, and pacing. Natural language sentences. No tag syntax."
    ),
    "Universal Natural Language": (
        "Format the output as a flowing natural language paragraph describing the scene "
        "in concrete visual detail. No tags, no weights."
    ),
}

AESTHETIC_OPTIONS = [
    "None (no aesthetic injection)",
    "Photorealistic",
    "Cinematic Film",
    "Anime / Manga",
    "Studio Ghibli",
    "Pixar / 3D Animation",
    "Comic Book / Graphic Novel",
    "Concept Art",
    "Oil Painting",
    "Watercolor",
    "Pencil Sketch",
    "Cyberpunk",
    "Steampunk",
    "Fantasy",
    "Sci-Fi",
    "Horror / Dark",
    "Vintage / Retro Film",
    "Film Noir",
    "Glamour / Editorial",
    "Minimalist",
    "Surreal / Dreamy",
    "3D Render / CGI",
]

AESTHETIC_DESCRIPTORS = {
    "Photorealistic": (
        "Visual style: photorealistic, sharp focus, accurate textures, lifelike skin and "
        "materials, realistic lighting and shadows, shallow depth of field, 8k camera detail."
    ),
    "Cinematic Film": (
        "Visual style: cinematic film aesthetic, dramatic lighting with strong key and rim, "
        "filmic color grade, anamorphic framing, atmospheric haze, shallow depth of field."
    ),
    "Anime / Manga": (
        "Visual style: anime/manga aesthetic, cel-shaded coloring, stylized features, "
        "expressive large eyes, dynamic poses, vibrant saturated color palette, clean lineart."
    ),
    "Studio Ghibli": (
        "Visual style: Studio Ghibli aesthetic, hand-painted watercolor backgrounds, "
        "soft natural lighting, warm pastoral atmosphere, gentle character designs, "
        "nostalgic and serene mood."
    ),
    "Pixar / 3D Animation": (
        "Visual style: 3D animation aesthetic in the spirit of Pixar/Disney, expressive "
        "stylized character proportions, polished CG surfaces, warm cinematic lighting, "
        "vibrant family-friendly color palette."
    ),
    "Comic Book / Graphic Novel": (
        "Visual style: comic book aesthetic, bold ink linework, halftone or hatching shading, "
        "dynamic poses, exaggerated proportions, saturated panel colors."
    ),
    "Concept Art": (
        "Visual style: digital concept art, painterly brushwork, atmospheric perspective, "
        "value-driven composition, loose suggestion of detail over full rendering, "
        "professional production-art feel."
    ),
    "Oil Painting": (
        "Visual style: oil painting aesthetic, visible impasto brushwork, rich color depth, "
        "painterly textures, classical composition, warm gallery lighting."
    ),
    "Watercolor": (
        "Visual style: watercolor painting aesthetic, soft translucent washes, paper texture "
        "visible, flowing pigment bleeds, gentle edges, limited palette."
    ),
    "Pencil Sketch": (
        "Visual style: pencil sketch aesthetic, graphite linework, crosshatching shadows, "
        "monochrome or restrained color accents, loose unfinished sketchbook feel."
    ),
    "Cyberpunk": (
        "Visual style: cyberpunk aesthetic, neon signage, rain-slicked streets, holographic "
        "interfaces, cybernetic implants, dystopian high-tech low-life atmosphere, "
        "magenta-cyan color palette, deep shadows with glowing accents."
    ),
    "Steampunk": (
        "Visual style: steampunk aesthetic, brass and copper machinery, Victorian-era styling, "
        "exposed gears and clockwork, gas-lamp lighting, sepia and bronze color palette, "
        "steam and soot atmosphere."
    ),
    "Fantasy": (
        "Visual style: high fantasy aesthetic, medieval or magical setting, ethereal lighting, "
        "ornate detail, mythological elements, lush detailed environments, painterly atmosphere."
    ),
    "Sci-Fi": (
        "Visual style: science fiction aesthetic, advanced technology, sleek futuristic surfaces, "
        "panel-screen lighting, industrial design, blue and white accent palette."
    ),
    "Horror / Dark": (
        "Visual style: horror aesthetic, low-key dramatic lighting, deep shadows, "
        "unsettling atmosphere, desaturated muted palette with occasional blood-red accents, "
        "dread-filled mood."
    ),
    "Vintage / Retro Film": (
        "Visual style: vintage film aesthetic, 35mm grain, faded warm color cast, soft contrast, "
        "period-appropriate styling, light leaks and lens artifacts."
    ),
    "Film Noir": (
        "Visual style: film noir aesthetic, high-contrast black-and-white or near-monochrome, "
        "dramatic chiaroscuro lighting, venetian-blind shadows, urban night atmosphere, "
        "cigarette smoke and rain."
    ),
    "Glamour / Editorial": (
        "Visual style: high-fashion editorial aesthetic, polished beauty lighting, "
        "magazine-shoot composition, soft skin rendering, dramatic backdrop, "
        "professional studio styling."
    ),
    "Minimalist": (
        "Visual style: minimalist aesthetic, clean composition, generous negative space, "
        "limited color palette, simple geometric forms, calm uncluttered framing."
    ),
    "Surreal / Dreamy": (
        "Visual style: surreal dreamlike aesthetic, soft hazy lighting, impossible compositions, "
        "dream-logic juxtapositions, ethereal color shifts, painterly atmosphere."
    ),
    "3D Render / CGI": (
        "Visual style: 3D render aesthetic, clean CGI surfaces, ray-traced lighting, "
        "sharp reflections, subsurface scattering, Octane/Blender render quality."
    ),
}


def build_layered_system_prompt(purpose, model_format, aesthetic,
                                 extra_instructions="", append_no_think=False):
    """Stitch purpose + aesthetic + model format into a single system prompt."""
    parts = [PURPOSE_FRAMING[purpose]]
    if aesthetic in AESTHETIC_DESCRIPTORS:
        parts.append(AESTHETIC_DESCRIPTORS[aesthetic])
    parts.append(MODEL_FORMAT_INSTRUCTIONS[model_format])
    if extra_instructions.strip():
        parts.append(extra_instructions.strip())
    parts.append("Output only the prompt, nothing else.")
    text = " ".join(parts)
    if append_no_think:
        text = text.rstrip() + " /no_think"
    return text



# =========================================================================
# TJ_NODE LLM helpers
# =========================================================================

TJ_LLM_CATEGORY = " ✨ TJ_Node/LLM"
MODEL_BACKEND_OPTIONS = ["GGUF / llama.cpp", "ComfyUI TextGenerate"]
MMPROJ_NONE = "none"


def _folder_list_recursive(kind, suffix=None, fallback=None):
    fallback = fallback or []
    try:
        import folder_paths
        names = list(folder_paths.get_filename_list(kind))
        if suffix:
            names = [n for n in names if str(n).lower().endswith(suffix.lower())]
        return names or fallback
    except Exception:
        return fallback


def _text_encoder_ggufs(exclude_mmproj=False):
    names = _folder_list_recursive("text_encoders", ".gguf", [])
    if exclude_mmproj:
        names = [n for n in names if "mmproj" not in os.path.basename(str(n)).lower()]
    return names or ["NO_GGUF_FILES_IN_MODELS_TEXT_ENCODERS"]


def _text_encoder_mmproj_options():
    names = _folder_list_recursive("text_encoders", ".gguf", [])
    mm = [n for n in names if "mmproj" in os.path.basename(str(n)).lower()]
    return [MMPROJ_NONE] + sorted(mm)


def _text_encoder_model_options():
    names = _folder_list_recursive("text_encoders", None, [])
    # Native ComfyUI/TextGenerate mode should show normal text-encoder files,
    # while GGUF files stay in the GGUF selector.
    names = [n for n in names if not str(n).lower().endswith(".gguf") and "mmproj" not in os.path.basename(str(n)).lower()]
    return names or ["NO_TEXT_ENCODER_FILES_FOUND"]


def _resolve_text_encoder_path(name):
    if not name or name in {MMPROJ_NONE, "NO_GGUF_FILES_IN_MODELS_TEXT_ENCODERS", "NO_TEXT_ENCODER_FILES_FOUND"}:
        return None
    try:
        import folder_paths
        full = folder_paths.get_full_path("text_encoders", name)
        if full:
            return full
    except Exception:
        pass
    return os.path.join("models", "text_encoders", name)


def _call_comfy_node(class_name, **kwargs):
    try:
        import nodes
        cls = nodes.NODE_CLASS_MAPPINGS[class_name]
    except Exception as e:
        raise RuntimeError(f"ComfyUI node '{class_name}' is not available: {e}")

    obj = cls()
    fn_name = getattr(cls, "FUNCTION", None)
    if not fn_name or not hasattr(obj, fn_name):
        raise RuntimeError(f"ComfyUI node '{class_name}' has no callable FUNCTION.")
    fn = getattr(obj, fn_name)

    try:
        import inspect
        sig = inspect.signature(fn)
        if not any(p.kind == p.VAR_KEYWORD for p in sig.parameters.values()):
            kwargs = {k: v for k, v in kwargs.items() if k in sig.parameters}
    except Exception:
        pass
    return fn(**kwargs)


def _load_clip_from_text_encoder(clip_name, clip_loader_type="stable_diffusion"):
    try:
        return _call_comfy_node("CLIPLoader", clip_name=clip_name, type=clip_loader_type)[0]
    except Exception:
        return _call_comfy_node("CLIPLoader", clip_name=clip_name)[0]


def _generate_with_textgenerate(clip, prompt, max_length, seed, image=None):
    kwargs = {
        "clip": clip,
        "prompt": prompt,
        "max_length": int(max_length),
        "sampling_mode": {
            "sampling_mode": "on",
            "temperature": 0.7,
            "top_k": 64,
            "top_p": 0.95,
            "min_p": 0.05,
            "repetition_penalty": 1.05,
            "seed": int(seed),
        },
        "thinking": False,
        "use_default_template": True,
    }
    if image is not None:
        kwargs["image"] = image
    return _call_comfy_node("TextGenerate", **kwargs)[0]


def _is_bad_choice(name):
    return str(name or "").startswith("NO_")


# =========================================================================
# Prompt Enhancer (TJ)
# =========================================================================

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
                "gguf_model": (_text_encoder_ggufs(exclude_mmproj=True),),
                "mmproj_file": (_text_encoder_mmproj_options(),),
                "text_encoder_name": (_text_encoder_model_options(),),
                "clip_loader_type": (["stable_diffusion", "lumina2", "wan", "flux"], {"default": "stable_diffusion"}),
                "purpose": (PURPOSE_OPTIONS,),
                "model_format": (MODEL_FORMAT_OPTIONS,),
                "aesthetic": (AESTHETIC_OPTIONS,),
                "extra_instructions": ("STRING", {"multiline": True, "default": ""}),
                "system_prompt_override": ("STRING", {"multiline": True, "default": ""}),
                "append_no_think": ("BOOLEAN", {"default": True, "label_on": "Append /no_think", "label_off": "Don't append"}),
                "n_gpu_layers": ("INT", {"default": -1, "min": -1, "max": 999, "step": 1}),
                "n_ctx": ("INT", {"default": 4096, "min": 512, "max": 32768, "step": 512}),
                "max_tokens": ("INT", {"default": 500, "min": 50, "max": 4096, "step": 50}),
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

    def enhance(self, get_name="(none)", set_name="Prompt_Enhancer", raw_prompt="", model_backend="GGUF / llama.cpp",
                gguf_model="", mmproj_file=MMPROJ_NONE, text_encoder_name="", clip_loader_type="stable_diffusion", purpose="Image",
                model_format="Universal Natural Language", aesthetic="None (no aesthetic injection)",
                extra_instructions="", system_prompt_override="", append_no_think=True,
                n_gpu_layers=-1, n_ctx=4096, max_tokens=500, temperature=0.7, top_p=0.9,
                repeat_penalty=1.15, seed=0, lock_in=False, raw_prompt_input=None, clip=None):
        prompt_in = str(raw_prompt_input if raw_prompt_input not in (None, "") else raw_prompt)
        if clip is not None:
            model_backend = "ComfyUI TextGenerate"
        cache_key = (prompt_in, model_backend, gguf_model, mmproj_file, text_encoder_name, clip_loader_type, purpose,
                     model_format, aesthetic, extra_instructions, system_prompt_override, append_no_think,
                     temperature, top_p, repeat_penalty)
        if lock_in and cache_key in self._cache:
            c = self._cache[cache_key]
            thought = f"=== 🔒 LOCKED — Returning Cached Output ===\nNo model load. No VRAM used.\n\n{c['thought']}"
            return (c["final_prompt"], thought)

        sys_prompt = self._build_sys_prompt(purpose, model_format, aesthetic, extra_instructions, system_prompt_override, append_no_think)
        if model_backend == "ComfyUI TextGenerate":
            if clip is None:
                if _is_bad_choice(text_encoder_name):
                    raise FileNotFoundError("No model found in models/text_encoders. Add a text encoder and restart ComfyUI.")
                clip = _load_clip_from_text_encoder(text_encoder_name, clip_loader_type)
            raw_output = str(_generate_with_textgenerate(clip, f"{sys_prompt}\n\nUser prompt:\n{prompt_in}", max_tokens, seed)).strip()
            file_label = text_encoder_name
        else:
            if _is_bad_choice(gguf_model):
                raise FileNotFoundError("No .gguf model found in models/text_encoders. Add a GGUF text model and restart ComfyUI.")
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
            f"Backend: {model_backend}\nModel: {file_label}\nmmproj: {mmproj_file} (ignored for text-only prompt enhancer)\nPurpose: {purpose}\nFormat: {model_format}\nAesthetic: {aesthetic}\nSeed: {seed}\n"
            f"Raw chars: {len(raw_output)}\nClean chars: {len(final_prompt)}\n\n"
            f"=== System Prompt ===\n{sys_prompt}\n\n=== Raw Output ===\n{raw_output}\n\n=== Final Prompt ===\n{final_prompt}"
        )
        self._cache[cache_key] = {"final_prompt": final_prompt, "thought": thought}
        return (final_prompt, thought)


# =========================================================================
# Image to Prompt (TJ)
# =========================================================================

class TJ_ImageToPrompt:
    _cache = {}

    VISION_TASK_OPTIONS = [
        "Caption (plain description)",
        "Caption + Format (apply model_format below)",
        "SD/Booru Tags",
        "Pose & Anatomy Focus",
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
    }

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
                "gguf_model": (_text_encoder_ggufs(exclude_mmproj=True),),
                "mmproj_file": (_text_encoder_mmproj_options(),),
                "chat_handler": (handler_options,),
                "text_encoder_name": (_text_encoder_model_options(),),
                "clip_loader_type": (["stable_diffusion", "lumina2", "wan", "flux"], {"default": "stable_diffusion"}),
                "vision_task": (cls.VISION_TASK_OPTIONS,),
                "model_format": (MODEL_FORMAT_OPTIONS,),
                "aesthetic": (AESTHETIC_OPTIONS,),
                "custom_instruction": ("STRING", {"multiline": True, "default": ""}),
                "n_gpu_layers": ("INT", {"default": -1, "min": -1, "max": 999, "step": 1}),
                "n_ctx": ("INT", {"default": 4096, "min": 512, "max": 32768, "step": 512}),
                "max_tokens": ("INT", {"default": 400, "min": 50, "max": 2048, "step": 50}),
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
            raise RuntimeError(f"Chat handler '{chat_handler_choice}' is not available. Available: {list(_HANDLER_CLASSES.keys())}")
        return _HANDLER_CLASSES[chat_handler_choice], chat_handler_choice

    def _tensor_to_data_uri(self, image_tensor):
        if image_tensor is None:
            raise ValueError("Image input is required.")
        if image_tensor.dim() == 4:
            img = image_tensor[0]
        else:
            img = image_tensor
        img_np = (img.detach().cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
        pil = Image.fromarray(img_np)
        buf = BytesIO()
        pil.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/png;base64,{b64}"

    def _build_instruction(self, vision_task, model_format, aesthetic, custom_instruction):
        if vision_task == "Custom Instruction":
            return str(custom_instruction or "").strip() or "Describe this image."
        if vision_task == "Caption + Format (apply model_format below)":
            base = "Describe this image faithfully, then format the description according to the rules below. "
            base += MODEL_FORMAT_INSTRUCTIONS[model_format]
            if aesthetic in AESTHETIC_DESCRIPTORS:
                base += " " + AESTHETIC_DESCRIPTORS[aesthetic]
            return base + " Output only the formatted prompt."
        base = self.VISION_TASK_INSTRUCTIONS[vision_task]
        if aesthetic in AESTHETIC_DESCRIPTORS:
            base += " " + AESTHETIC_DESCRIPTORS[aesthetic]
        return base

    def describe(self, get_name="(none)", set_name="Image_Prompt", image=None, model_backend="GGUF / llama.cpp",
                 gguf_model="", mmproj_file=MMPROJ_NONE, chat_handler="Auto-detect",
                 text_encoder_name="", clip_loader_type="stable_diffusion", vision_task="Caption (plain description)",
                 model_format="Universal Natural Language", aesthetic="None (no aesthetic injection)",
                 custom_instruction="", n_gpu_layers=-1, n_ctx=4096, max_tokens=400,
                 temperature=0.4, seed=0, lock_in=False, clip=None):
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
                    raise FileNotFoundError("No model found in models/text_encoders. Add a text encoder and restart ComfyUI.")
                clip = _load_clip_from_text_encoder(text_encoder_name, clip_loader_type)
            try:
                raw_output = str(_generate_with_textgenerate(clip, instruction, max_tokens, seed, image=image)).strip()
            except Exception as e:
                raise RuntimeError(
                    "ComfyUI TextGenerate backend could not analyze image input. "
                    "Use a VLM-capable TextGenerate backend/clip or switch to GGUF Vision mode. "
                    f"Original error: {e}"
                )
            model_label = text_encoder_name
            handler_label = "ComfyUI TextGenerate"
        else:
            if _is_bad_choice(gguf_model):
                raise FileNotFoundError("No .gguf model found in models/text_encoders. Add a vision-capable GGUF and restart ComfyUI.")
            if chat_handler == "NO_VISION_HANDLERS_AVAILABLE" or not _HANDLER_CLASSES:
                raise RuntimeError("No vision chat handlers available. Update/install llama-cpp-python with vision handlers.")
            if mmproj_file == MMPROJ_NONE:
                raise RuntimeError("This GGUF Vision mode requires an mmproj file. Select an mmproj GGUF or use ComfyUI TextGenerate mode.")
            model_path = _resolve_text_encoder_path(gguf_model)
            mmproj_path = _resolve_text_encoder_path(mmproj_file)
            if not model_path or not os.path.isfile(model_path):
                raise FileNotFoundError(f"Model not found: {model_path}")
            if not mmproj_path or not os.path.isfile(mmproj_path):
                raise FileNotFoundError(f"mmproj not found: {mmproj_path}")
            handler_cls, handler_label = self._resolve_handler(chat_handler, gguf_model)
            img_uri = self._tensor_to_data_uri(image)
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
                try: del chat_handler_instance
                except Exception: pass
                gc.collect()
                if torch.cuda.is_available(): torch.cuda.empty_cache()
            model_label = gguf_model

        final_prompt = _clean_output(raw_output)
        if not final_prompt.strip() or len(final_prompt) < 20:
            final_prompt = raw_output
        thought = (
            f"=== 🔄 LIVE — Image to Prompt (TJ) ===\n"
            f"Backend: {model_backend}\nModel: {model_label}\nmmproj: {mmproj_file}\nChat handler: {handler_label}\n"
            f"Vision task: {vision_task}\nFormat: {model_format}\nAesthetic: {aesthetic}\nSeed: {seed}\n"
            f"Raw chars: {len(raw_output)}\nClean chars: {len(final_prompt)}\n\n"
            f"=== Instruction Sent ===\n{instruction}\n\n=== Raw Output ===\n{raw_output}\n\n=== Image Prompt ===\n{final_prompt}"
        )
        self._cache[cache_key] = {"final_prompt": final_prompt, "thought": thought}
        return (final_prompt, thought)


# =========================================================================
# Prompt Show & Locker (TJ)
# =========================================================================

class TJ_PromptShowLocker:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "get_name": (["(none)"], {"default": "(none)"}),
                "set_name": ("STRING", {"default": "Prompt_Locker"}),
                "text": ("STRING", {"multiline": True, "default": ""}),
                "lock_in_prompt": ("BOOLEAN", {"default": False, "label_on": "LOCKED IN", "label_off": "PAUSED"}),
            },
            "optional": {
                "text_input": ("STRING", {"forceInput": True}),
            },
        }

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text_output",)
    FUNCTION = "execute"
    CATEGORY = TJ_LLM_CATEGORY
    OUTPUT_NODE = True

    def execute(self, get_name="(none)", set_name="Prompt_Locker", text="", lock_in_prompt=False, text_input=None):
        source_text = str(text_input if text_input is not None else text)
        if not lock_in_prompt:
            warning = "🟡 PAUSED — Prompt Show & Locker intentionally stopped text passthrough. Toggle LOCKED IN to continue."
            # Intentional pause: do not emit empty text downstream.
            # Raising a clear, user-facing message stops the queue before downstream CLIP/TextEncode nodes run.
            raise ValueError(warning)
        return {"ui": {"tj_prompt_locker_text": [source_text], "tj_prompt_locker_status": ["🟢 LOCKED IN — Text passthrough active."]}, "result": (source_text,)}

__all__ = ["TJ_PromptEnhancer", "TJ_ImageToPrompt", "TJ_PromptShowLocker"]
