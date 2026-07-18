# nodes/llm/_llm_utils.py
# LLM 노드 공용 상수 및 헬퍼 함수

import os
import gc
import re
import json
import base64
from io import BytesIO

import numpy as np
import torch
from PIL import Image

# ── User-editable option data (JSON) ────────────────────────────────────────
# model_formats.json / aesthetics.json / vision_tasks.json 파일을 열어서
# 항목을 자유롭게 추가/수정할 수 있습니다. (ComfyUI 재시작 후 반영)
_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def _load_json_data(filename, fallback):
    """data/<filename> 을 읽어온다. 파일이 없거나 형식이 잘못되면 기본값(fallback)을 사용한다.
    fallback이 list면 list, dict면 dict 형식을 기대한다."""
    path = os.path.join(_DATA_DIR, filename)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, type(fallback)) and len(data) > 0:
            return data
        print(f"[TJ_Node] {filename} is empty or invalid, using built-in defaults.")
    except Exception as e:
        print(f"[TJ_Node] Could not load {filename} ({e}), using built-in defaults.")
    return fallback


# ── Vision chat handlers (best-effort import) ──────────────────────────────
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

# ── 상수 ───────────────────────────────────────────────────────────────────
TJ_LLM_CATEGORY = " ✨ TJ_Node/LLM"
MODEL_BACKEND_OPTIONS = ["GGUF / llama.cpp", "ComfyUI TextGenerate"]
MMPROJ_NONE = "none"
DEFAULT_TEXT_ENCODER_MODEL = "gemma4_e4b_it_fp8_scaled.safetensors"
DEFAULT_GGUF_MODEL = "qwen3.5-4B-Uncensored-HauhauCS-Aggressive-Q8_0.gguf"
DEFAULT_MMPROJ_MODEL = "mmproj-qwen3.5-4B-Uncensored-HauhauCS-Aggressive-BF16.gguf"
CLIP_LOADER_TYPE_OPTIONS = [
    "Auto", "stable_diffusion", "stable_cascade", "sd3", "stable_audio",
    "mochi", "ltxv", "pixart", "cosmos", "lumina2", "wan", "hidream", "chroma",
    "ace", "omnigen2", "qwen_image", "hunyuan_image", "flux2", "ovis",
    "longcat_image", "cogvideox", "lens", "pixeldict", "ideogram4",
]

# ── Purpose (편집: nodes/llm/data/purposes.json) ────────────────────────────
_PURPOSE_FALLBACK = [
    {"name": "Image",
     "framing": "Rewrite the user's input as a detailed prompt for a static image. "
                "Cover subject, environment, lighting, composition, and mood."},
    {"name": "Video",
     "framing": "Rewrite the user's input as a detailed prompt for a video shot. "
                "Cover subject motion, camera movement, pacing, lighting, and mood."},
    {"name": "Edit (Inpainting/I2V)",
     "framing": "Rewrite the user's edit instruction as a description of the final transformed "
                "scene as it appears after the edit. Do not describe the editing process."},
]
_purpose_data = _load_json_data("purposes.json", _PURPOSE_FALLBACK)
PURPOSE_OPTIONS = [item["name"] for item in _purpose_data]
PURPOSE_FRAMING = {item["name"]: item.get("framing", "") for item in _purpose_data}

# ── Model Format (편집: nodes/llm/data/model_formats.json) ─────────────────
_MODEL_FORMAT_FALLBACK = [
    {"name": "Flux / Chroma (natural language)",
     "instruction": "Format the output as flowing natural language in long descriptive sentences "
                     "suitable for Flux or Chroma. No tag syntax. No parenthesis weights. "
                     "No 'masterpiece' or quality boosters. Describe the scene as prose."},
    {"name": "Z-Image / Lumina-2 (LLM text encoder)",
     "instruction": "Format the output as long, richly descriptive natural-language prose suitable "
                     "for LLM-based text encoders (Z-Image, Lumina-2). Use complex sentences and "
                     "vivid concrete detail. No tag syntax, no weights."},
    {"name": "HiDream (hybrid prose + descriptors)",
     "instruction": "Format the output as flowing natural language with concrete photographic and "
                     "material descriptors woven in. Suitable for HiDream's multi-encoder pipeline. No weight syntax."},
    {"name": "SDXL (tags + weights)",
     "instruction": "Format the output as a comma-separated list of descriptive tags for SDXL. "
                     "Start with quality tags (masterpiece, best quality, highly detailed). "
                     "Use parenthesis weight syntax for emphasis like (cinematic lighting:1.2). "
                     "Order: subject, action, environment, lighting, camera, style, quality."},
    {"name": "SD 1.5 (tags + weights)",
     "instruction": "Format the output as a comma-separated list of descriptive tags for SD 1.5. "
                     "Lead with quality boosters (masterpiece, best quality, ultra-detailed). "
                     "Use parenthesis weight syntax. Keep tags compact."},
    {"name": "Pony / Illustrious (booru tags + score)",
     "instruction": "Format the output as comma-separated booru-style tags for Pony / Illustrious. "
                     "Lead with score tags: score_9, score_8_up, score_7_up. Include rating tag. "
                     "Use underscores for multi-word tags."},
    {"name": "LTX Video (motion-focused prose)",
     "instruction": "Format the output as a video shot description for LTX Video. "
                     "Lead with a clear shot description, then describe subject motion, camera movement, pacing, and atmosphere. No tag syntax."},
    {"name": "Hunyuan / Wan Video (cinematic motion prose)",
     "instruction": "Format the output as a cinematic video description with detailed motion. "
                     "Cover camera angle, camera movement, subject action, environmental motion, atmosphere, and pacing. No tag syntax."},
    {"name": "Universal Natural Language",
     "instruction": "Format the output as a flowing natural language paragraph describing the scene "
                     "in concrete visual detail. No tags, no weights."},
]
_model_format_data = _load_json_data("model_formats.json", _MODEL_FORMAT_FALLBACK)
MODEL_FORMAT_OPTIONS = [item["name"] for item in _model_format_data]
MODEL_FORMAT_INSTRUCTIONS = {item["name"]: item.get("instruction", "") for item in _model_format_data}

# ── Aesthetic (편집: nodes/llm/data/aesthetics.json) ────────────────────────
_AESTHETIC_FALLBACK = [
    {"name": "None (no aesthetic injection)", "descriptor": ""},
    {"name": "Photorealistic", "descriptor": "Visual style: photorealistic, sharp focus, accurate textures, lifelike skin and materials, realistic lighting and shadows, shallow depth of field, 8k camera detail."},
    {"name": "Cinematic Film", "descriptor": "Visual style: cinematic film aesthetic, dramatic lighting with strong key and rim, filmic color grade, anamorphic framing, atmospheric haze, shallow depth of field."},
    {"name": "Anime / Manga", "descriptor": "Visual style: anime/manga aesthetic, cel-shaded coloring, stylized features, expressive large eyes, dynamic poses, vibrant saturated color palette, clean lineart."},
    {"name": "Studio Ghibli", "descriptor": "Visual style: Studio Ghibli aesthetic, hand-painted watercolor backgrounds, soft natural lighting, warm pastoral atmosphere, gentle character designs, nostalgic and serene mood."},
    {"name": "Pixar / 3D Animation", "descriptor": "Visual style: 3D animation aesthetic in the spirit of Pixar/Disney, expressive stylized character proportions, polished CG surfaces, warm cinematic lighting."},
    {"name": "Comic Book / Graphic Novel", "descriptor": "Visual style: comic book aesthetic, bold ink linework, halftone or hatching shading, dynamic poses, exaggerated proportions, saturated panel colors."},
    {"name": "Concept Art", "descriptor": "Visual style: digital concept art, painterly brushwork, atmospheric perspective, value-driven composition, professional production-art feel."},
    {"name": "Oil Painting", "descriptor": "Visual style: oil painting aesthetic, visible impasto brushwork, rich color depth, painterly textures, classical composition, warm gallery lighting."},
    {"name": "Watercolor", "descriptor": "Visual style: watercolor painting aesthetic, soft translucent washes, paper texture visible, flowing pigment bleeds, gentle edges, limited palette."},
    {"name": "Pencil Sketch", "descriptor": "Visual style: pencil sketch aesthetic, graphite linework, crosshatching shadows, monochrome or restrained color accents, loose unfinished sketchbook feel."},
    {"name": "Cyberpunk", "descriptor": "Visual style: cyberpunk aesthetic, neon signage, rain-slicked streets, holographic interfaces, dystopian high-tech low-life atmosphere, magenta-cyan color palette."},
    {"name": "Steampunk", "descriptor": "Visual style: steampunk aesthetic, brass and copper machinery, Victorian-era styling, exposed gears and clockwork, gas-lamp lighting, sepia and bronze color palette."},
    {"name": "Fantasy", "descriptor": "Visual style: high fantasy aesthetic, medieval or magical setting, ethereal lighting, ornate detail, mythological elements, lush detailed environments, painterly atmosphere."},
    {"name": "Sci-Fi", "descriptor": "Visual style: science fiction aesthetic, advanced technology, sleek futuristic surfaces, panel-screen lighting, industrial design, blue and white accent palette."},
    {"name": "Horror / Dark", "descriptor": "Visual style: horror aesthetic, low-key dramatic lighting, deep shadows, unsettling atmosphere, desaturated muted palette with occasional blood-red accents."},
    {"name": "Vintage / Retro Film", "descriptor": "Visual style: vintage film aesthetic, 35mm grain, faded warm color cast, soft contrast, period-appropriate styling, light leaks and lens artifacts."},
    {"name": "Film Noir", "descriptor": "Visual style: film noir aesthetic, high-contrast black-and-white or near-monochrome, dramatic chiaroscuro lighting, venetian-blind shadows, urban night atmosphere."},
    {"name": "Glamour / Editorial", "descriptor": "Visual style: high-fashion editorial aesthetic, polished beauty lighting, magazine-shoot composition, soft skin rendering, dramatic backdrop."},
    {"name": "Minimalist", "descriptor": "Visual style: minimalist aesthetic, clean composition, generous negative space, limited color palette, simple geometric forms, calm uncluttered framing."},
    {"name": "Surreal / Dreamy", "descriptor": "Visual style: surreal dreamlike aesthetic, soft hazy lighting, impossible compositions, dream-logic juxtapositions, ethereal color shifts."},
    {"name": "3D Render / CGI", "descriptor": "Visual style: 3D render aesthetic, clean CGI surfaces, ray-traced lighting, sharp reflections, subsurface scattering, Octane/Blender render quality."},
]
_aesthetic_data = _load_json_data("aesthetics.json", _AESTHETIC_FALLBACK)
AESTHETIC_OPTIONS = [item["name"] for item in _aesthetic_data]
AESTHETIC_DESCRIPTORS = {item["name"]: item["descriptor"] for item in _aesthetic_data if str(item.get("descriptor", "")).strip()}

# ── Cleaning helpers ───────────────────────────────────────────────────────
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


_THINKING_HEADING = re.compile(
    r"^\s*(thinking\s+process|chain[- ]of[- ]thought|reasoning\s+process|my\s+thinking|analysis)\s*[:\n]",
    re.IGNORECASE,
)
_NUMBERED_ITEM = re.compile(r"^\d+\.\s")
_BULLET_LINE = re.compile(r"^\s*[-*•]|\s*\d+\.")


def _strip_thinking_process_block(text):
    """'Thinking Process:' 헤딩으로 시작하는 평문 사고 블록을 제거하고 마지막 실제 출력만 반환."""
    if not _THINKING_HEADING.match(text):
        return text
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    for p in reversed(paragraphs):
        if _THINKING_HEADING.match(p):
            continue
        if _NUMBERED_ITEM.match(p):
            continue
        lines = p.split("\n")
        bullet_count = sum(1 for l in lines if _BULLET_LINE.match(l.strip()))
        if bullet_count > len(lines) * 0.5:
            continue
        if len(p) < 40:
            continue
        return p
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
        bullets = sum(1 for l in lines if l.strip().startswith(("-", "*", "•", "1.", "2.", "3.")))
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


def _extract_after_final_marker(text):
    markers = ("final prompt:", "enhanced prompt:", "output prompt:", "final output:", "result prompt:", "prompt result:")
    lower = text.lower()
    best, marker_len = -1, 0
    for marker in markers:
        idx = lower.rfind(marker)
        if idx > best:
            best, marker_len = idx, len(marker)
    if best >= 0:
        candidate = text[best + marker_len:].strip()
        if len(candidate) >= 20:
            return candidate
    return text


def _clean_output(text, original_input=""):
    text = text.strip()
    text = _strip_thinking_tags(text)
    text = _strip_thinking_process_block(text)
    text = _extract_after_final_marker(text)
    text = _extract_final_paragraph(text)
    text = _strip_preambles(text)
    if original_input:
        raw = original_input.strip()
        if raw and text.lower().startswith(raw.lower()):
            text = text[len(raw):].lstrip(" ,.:-\"'\n")
    return text.strip().strip("\"'")


def _free_comfy_vram():
    # GGUF(llama.cpp)는 ComfyUI 메모리 매니저 바깥에서 자체 CUDA 컨텍스트로
    # VRAM 을 잡는다. 스마트 메모리가 켜져 있으면 ComfyUI 가 이미지 모델을
    # VRAM 에 상주시켜 두므로, GGUF 로드 직전에 ComfyUI 모델을 내려 공간을
    # 확보해야 한다(안 그러면 sysmem 으로 흘러넘쳐 느려지거나 로드 실패).
    try:
        import comfy.model_management as mm
    except Exception:
        return
    try:
        mm.unload_all_models()
    except Exception:
        pass
    try:
        mm.soft_empty_cache(force=True)
    except Exception:
        pass


def _free_chat_handler(handler):
    # 비전 핸들러(Llava/Qwen-VL 등)는 clip/mtmd 컨텍스트를 self._exit_stack 에
    # 등록해두는데, ExitStack 은 GC 로는 정리 콜백이 안 돈다(.close() 필요).
    # 그래서 `del handler` 만으로는 clip CUDA 컨텍스트가 완전히 해제되지 않아,
    # 같은 프로세스에서 다음 로드 시 clip 이 GPU 백엔드를 못 잡고 CPU 로
    # fallback → vision 인코딩이 수십~수백 배 느려진다.
    # _exit_stack 을 명시적으로 close 하면 재로드해도 clip 이 GPU 를 유지한다.
    if handler is None:
        return
    try:
        if hasattr(handler, "close"):
            handler.close()
    except Exception:
        pass
    try:
        es = getattr(handler, "_exit_stack", None)
        if es is not None:
            es.close()
    except Exception:
        pass
    try:
        del handler
    except Exception:
        pass
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def _free_llm(llm):
    # llama.cpp 는 자체 CUDA 컨텍스트로 VRAM 을 잡으므로 del/gc 나
    # torch.cuda.empty_cache() 만으로는 해제되지 않는다. Llama.close() 를
    # 명시적으로 호출해 model+context 를 확실히 free 해야 VRAM 이 내려간다.
    try:
        if llm is not None and hasattr(llm, "close"):
            llm.close()
    except Exception:
        pass
    try:
        del llm
    except Exception:
        pass
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


# ── 시스템 프롬프트 마무리 고정 지시문 (편집: nodes/llm/data/system_prompt_base.json) ──
_SYSTEM_PROMPT_BASE_FALLBACK = {
    "output_only_instruction": (
        "Output only the final prompt, nothing else. Do not explain. Do not include thinking, "
        "analysis, steps, notes, markdown headings, or labels such as 'Thinking Process'."
    )
}
_system_prompt_base_data = _load_json_data("system_prompt_base.json", _SYSTEM_PROMPT_BASE_FALLBACK)
OUTPUT_ONLY_INSTRUCTION = _system_prompt_base_data.get(
    "output_only_instruction", _SYSTEM_PROMPT_BASE_FALLBACK["output_only_instruction"]
)


def build_layered_system_prompt(purpose, model_format, aesthetic, extra_instructions="", append_no_think=False):
    parts = [PURPOSE_FRAMING.get(purpose, "")]
    if aesthetic in AESTHETIC_DESCRIPTORS:
        parts.append(AESTHETIC_DESCRIPTORS[aesthetic])
    parts.append(MODEL_FORMAT_INSTRUCTIONS.get(model_format, ""))
    if extra_instructions.strip():
        parts.append(extra_instructions.strip())
    parts.append(OUTPUT_ONLY_INSTRUCTION)
    text = " ".join(parts)
    if append_no_think:
        text = text.rstrip() + " /no_think"
    return text


# ── Model file helpers ─────────────────────────────────────────────────────
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


def _unique_prepend(names, preferred):
    items = [str(n) for n in (names or [])]
    if preferred in items:
        items.remove(preferred)
    items.insert(0, preferred)
    return items


def _text_encoder_ggufs(exclude_mmproj=False):
    names = _folder_list_recursive("text_encoders", ".gguf", [])
    if exclude_mmproj:
        names = [n for n in names if "mmproj" not in os.path.basename(str(n)).lower()]
        names = _unique_prepend(names, DEFAULT_GGUF_MODEL)
    return names or ["NO_GGUF_FILES_IN_MODELS_TEXT_ENCODERS"]


def _text_encoder_mmproj_options():
    names = _folder_list_recursive("text_encoders", ".gguf", [])
    mm = [n for n in names if "mmproj" in os.path.basename(str(n)).lower()]
    mm = _unique_prepend(sorted(mm), DEFAULT_MMPROJ_MODEL)
    return [MMPROJ_NONE] + mm


def _text_encoder_model_options():
    names = _folder_list_recursive("text_encoders", None, [])
    names = [n for n in names if not str(n).lower().endswith(".gguf") and "mmproj" not in os.path.basename(str(n)).lower()]
    names = _unique_prepend(names, DEFAULT_TEXT_ENCODER_MODEL)
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


def _is_bad_choice(name):
    return str(name or "").startswith("NO_")


# ── ComfyUI TextGenerate bridge ────────────────────────────────────────────
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


def _infer_clip_loader_candidates(clip_name, clip_loader_type="Auto"):
    requested = str(clip_loader_type or "Auto")
    name = os.path.basename(str(clip_name or "")).lower()
    candidates = []
    if requested.lower() != "auto":
        candidates.append(requested)
    else:
        if any(k in name for k in ("ideogram",)):
            candidates.extend(["ideogram4", "qwen_image", "lumina2", "stable_diffusion"])
        elif any(k in name for k in ("qwen", "qwen3vl", "qwen_vl")):
            candidates.extend(["qwen_image", "ideogram4", "lumina2", "stable_diffusion"])
        elif any(k in name for k in ("gemma", "gamma")):
            candidates.extend(["stable_diffusion", "lumina2", "flux2", "ideogram4"])
        elif "wan" in name:
            candidates.extend(["wan", "stable_diffusion"])
        elif "flux2" in name:
            candidates.extend(["flux2", "flux", "stable_diffusion"])
        elif "flux" in name:
            candidates.extend(["flux", "flux2", "stable_diffusion"])
        elif "sd3" in name:
            candidates.extend(["sd3", "stable_diffusion"])
        elif "ltx" in name:
            candidates.extend(["ltxv", "stable_diffusion"])
        elif "hunyuan" in name:
            candidates.extend(["hunyuan_image", "hunyuan_video", "stable_diffusion"])
        elif "hidream" in name:
            candidates.extend(["hidream", "stable_diffusion"])
        elif "chroma" in name:
            candidates.extend(["chroma", "stable_diffusion"])
        else:
            candidates.extend(["stable_diffusion", "lumina2", "flux", "sd3", "wan"])
    for fallback in CLIP_LOADER_TYPE_OPTIONS:
        if fallback != "Auto" and fallback not in candidates:
            candidates.append(fallback)
    return candidates


def _load_clip_from_text_encoder(clip_name, clip_loader_type="Auto"):
    errors = []
    for candidate in _infer_clip_loader_candidates(clip_name, clip_loader_type):
        try:
            return _call_comfy_node("CLIPLoader", clip_name=clip_name, type=candidate)[0]
        except Exception as e:
            errors.append(f"{candidate}: {e}")
    try:
        return _call_comfy_node("CLIPLoader", clip_name=clip_name)[0]
    except Exception as e:
        errors.append(f"no type: {e}")
        raise RuntimeError("CLIPLoader failed. Tried: " + " | ".join(errors))


def _textgenerate_image_kwarg_name():
    try:
        import inspect
        import nodes
        cls = nodes.NODE_CLASS_MAPPINGS.get("TextGenerate")
        if not cls:
            return "image"
        obj = cls()
        fn_name = getattr(cls, "FUNCTION", None)
        fn = getattr(obj, fn_name)
        sig = inspect.signature(fn)
        params = sig.parameters
        if any(p.kind == p.VAR_KEYWORD for p in params.values()):
            return "image"
        for name in ("image", "images", "input_image", "vision_image", "image_input", "pixels"):
            if name in params:
                return name
    except Exception:
        pass
    return None


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
        image_kw = _textgenerate_image_kwarg_name()
        if not image_kw:
            raise RuntimeError("The installed TextGenerate node does not expose an image input parameter.")
        kwargs[image_kw] = image
    return _call_comfy_node("TextGenerate", **kwargs)[0]


def tensor_to_data_uri(image_tensor):
    if image_tensor is None:
        raise ValueError("Image input is required.")
    img = image_tensor[0] if image_tensor.dim() == 4 else image_tensor
    img_np = (img.detach().cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
    pil = Image.fromarray(img_np)
    buf = BytesIO()
    pil.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"
