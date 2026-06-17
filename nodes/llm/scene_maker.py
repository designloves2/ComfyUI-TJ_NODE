# nodes/llm/scene_maker.py
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


def _clip_names():
    names = _folder_list("clip", [])
    if not names:
        names = _folder_list("text_encoders", [])
    return names or ["t5xxl_fp16.safetensors"]


def _first_existing(names, preferred):
    for name in preferred:
        if name in names:
            return name
    return names[0]


def _load_clip(clip_name):
    try:
        return _call_node("CLIPLoader", clip_name=clip_name, type="stable_diffusion")[0]
    except Exception:
        return _call_node("CLIPLoader", clip_name=clip_name)[0]


def _sampling_mode(seed, temperature=0.7, top_k=64, top_p=0.95, min_p=0.05, repetition_penalty=1.05):
    return {
        "sampling_mode": "on",
        "temperature": float(temperature),
        "top_k": int(top_k),
        "top_p": float(top_p),
        "min_p": float(min_p),
        "repetition_penalty": float(repetition_penalty),
        "seed": int(seed),
    }


def _format_template(template, **values):
    result = template
    for key, value in values.items():
        result = result.replace("{" + key + "}", str(value))
    return result


def _mode_label(mode):
    return {"Product Commercial": "product commercial", "Music Video": "music video", "Short Drama": "short drama"}.get(mode, "storyboard")


def _brief_prompt_for_mode(mode):
    if mode == "Product Commercial":
        return PRODUCT_BRIEF_PROMPT
    return _format_template(SUBJECT_BRIEF_PROMPT, MODE_LABEL=_mode_label(mode))


def _text_brief_prompt(mode, idea, style, fixed_elements):
    return _format_template(TEXT_BRIEF_TEMPLATE, MODE_LABEL=_mode_label(mode), IDEA=idea, STYLE=style, FIXED=fixed_elements)


def _line_count(text):
    return len([line for line in str(text).splitlines() if line.strip()])


def _prompt_lines(text):
    lines = [line.strip() for line in str(text or "").splitlines()]
    lines = [line for line in lines if line]
    return lines or [""]


def _cut_list(shot_count):
    return "\n".join(f"{i}cut: ..." for i in range(1, int(shot_count) + 1))


def _generate_text(clip, prompt, max_length, seed, image=None):
    kwargs = {
        "clip": clip, "prompt": prompt, "max_length": int(max_length),
        "sampling_mode": _sampling_mode(seed), "thinking": False, "use_default_template": True,
    }
    if image is not None:
        kwargs["image"] = image
    return _call_node("TextGenerate", **kwargs)[0]


# ── Prompt Templates ───────────────────────────────────────────────────────
PRODUCT_BRIEF_PROMPT = """Analyze the product image and create a compact product brief for a beauty commercial storyboard.

Return only this format:

product_category:
product_type:
product_form:
main_material:
main_shape:
cap_or_closure:
visible_color:
label_or_branding:
usage_context:
key_beauty_appeal:
human_usage_needed:

Rules:
- Be literal and concise.
- Focus only on the visible product.
- Do not invent brand names.
- If text is unreadable, write "unreadable".
- If there is no label, write "none".
- Keep each field short.
- English only."""

SUBJECT_BRIEF_PROMPT = """Analyze the reference image and create a compact subject/visual brief for a {MODE_LABEL} storyboard.

Return only this format:

main_subject:
subject_type:
outfit_or_styling:
visible_identity_traits:
pose_or_expression:
setting_or_background:
dominant_colors:
visual_mood:
important_props:
continuity_notes:

Rules:
- Be literal and concise. Focus only on what is visible in the image.
- Do not invent names or backstory.
- If the subject is a human wearing a costume, describe them as a human wearing a costume.
- Do not transform a human costume into a literal animal, insect, monster, creature, or hybrid body.
- Keep each field short. English only."""

TEXT_BRIEF_TEMPLATE = """Create a compact reference brief for a {MODE_LABEL} storyboard from the user's text inputs.

Core idea:
{IDEA}

Style:
{STYLE}

Fixed elements:
{FIXED}

Return only this format:

main_subject:
subject_type:
outfit_or_styling:
setting_or_background:
dominant_colors:
visual_mood:
important_props:
continuity_notes:

Rules:
- Be literal and concise. Do not invent names or unrelated backstory.
- Treat fixed elements as the strongest identity/continuity rules.
- If the subject is described as a human wearing a costume, keep them human.
- Keep each field short. English only."""

SHOT_BEATS_TEMPLATE = """You are a storyboard planner.

Create exactly {SHOT_COUNT} short visual beats for a {MODE_LABEL}.

Reference brief:
{BRIEF}

Core idea:
{IDEA}

Style:
{STYLE}

Fixed elements:
{FIXED}

Rules:
- Output exactly {SHOT_COUNT} lines. Each line must describe one shot beat only.
- Each line must be short, under 12 words.
- Keep the sequence visually progressive.
- Keep the same product/main subject and same character identity when present.
- If the reference shows a human in a costume, keep them human.
- No numbering. No explanations. No blank lines. English only."""

ANCHOR_TEMPLATE = """Extract a compact visual identity anchor from this storyboard brief.

Reference brief:
{BRIEF}

Style:
{STYLE}

Fixed elements:
{FIXED}

Return only this format (one value per line, no extra text):

character: [main subject appearance — age, look, outfit, key traits. write "none" if no character]
setting: [primary location or environment]
palette: [2-3 dominant colors]
lighting: [lighting quality and tone]
signature_prop: [one key object or product that must appear consistently. write "none" if absent]

Rules:
- Be specific and literal. Pull only from what is stated in the brief and fixed elements.
- Keep each value under 12 words. English only."""

KEYFRAME_PROMPTS_TEMPLATE = """You are writing image-generation prompts for storyboard keyframes.

Expand each shot beat into one cinematic image prompt.

Shot beats:
{BEATS}

Reference brief:
{BRIEF}

Visual identity anchor — repeat these across every shot:
{ANCHOR}

Global style:
{STYLE}

Fixed elements that must remain consistent in every shot:
{FIXED}

Rules:
- Output exactly {SHOT_COUNT} lines. One line = one final image prompt.
- Each line should be 25 to 40 words.
- Every line must reflect the visual identity anchor (character, setting, palette, lighting).
- Keep the same product/main subject and same character identity across all lines when present.
- If the reference shows a human wearing a costume, write it as a realistic human in that costume.
- Do not turn costume details into literal creature anatomy.
- Make each shot visually distinct and sequential. Include camera/composition cues naturally.
- No numbering. No explanations. No blank lines. English only."""

KOREAN_STORY_TEMPLATE = """You are a Korean storyboard interpreter for AI-generated storyboard keyframes.

Your job is to read the generated keyframe prompts and explain what kind of {MODE_LABEL} story they represent.

Input information:

Reference brief:
{BRIEF}

Original idea:
{IDEA}

Visual style:
{STYLE}

Shot beats:
{BEATS}

Final keyframe prompts:
{FINAL_PROMPTS}

Rules:
- Output in Korean only.
- Do not rewrite the prompts. Do not generate new prompts.
- Explain the story in a way that a non-prompt user can understand.
- Focus on what happens in each keyframe, the emotional flow, and the advertising intention.
- If the sequence feels inconsistent, mention it briefly.
- Keep the answer concise and easy to read. Do not use markdown tables.

Output format:

[한 줄 요약]
한 문장으로 이 시퀀스가 어떤 분위기와 메시지를 가졌는지 설명한다.

[전체 스토리 흐름]
2~4문장으로 키프레임들이 어떤 순서로 이어지는지 설명한다.

[컷별 해석]
{CUT_LIST}

[의도와 분위기]
이 키프레임들이 전달하려는 이미지, 감정, 장르 톤을 간단히 설명한다.

[체크 포인트]
레퍼런스 일관성, 장면 흐름, 전달력 관점에서 주의할 점이 있으면 1~3개만 적는다."""


class TJ_SceneMaker:
    @classmethod
    def INPUT_TYPES(cls):
        clip_names = _clip_names()
        return {
            "required": {
                "clip_name": (clip_names, {"default": _first_existing(clip_names, ["t5xxl_fp16.safetensors", "clip_l.safetensors"])}),
                "get_name": (["(none)"], {"default": "(none)"}),
                "auto_set": ("BOOLEAN", {"default": False, "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
                "mode": (["Product Commercial", "Music Video", "Short Drama"], {"default": "Product Commercial"}),
                "translate": (["KO", "EN", "JP", "CN"], {"default": "KO"}),
                "idea": ("STRING", {"default": "A beautiful woman is standing with her back to the camera on a beach at sunset, wearing a red bikini.", "multiline": True}),
                "style": ("STRING", {"default": "cinematic, high-end perfume commercial, elegant composition", "multiline": True}),
                "fixed_elements": ("STRING", {"default": "Golden lighting, warm tones", "multiline": True}),
                "shot_count": ("INT", {"default": 6, "min": 1, "max": 24}),
                "seed": ("INT", {"default": 1, "min": 0, "max": 0xffffffffffffffff, "control_after_generate": True}),
            },
            "optional": {
                "input_image": ("IMAGE",),
                "clip": ("CLIP",),
                "brief_override": ("STRING", {"default": "", "multiline": True}),
                "visual_beat_override": ("STRING", {"default": "", "multiline": True}),
            },
        }

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("Scene brief", "Visual Beat", "Visual anchor", "Scene prompt", "Scene prompt line", "Translated result")
    OUTPUT_IS_LIST = (False, False, False, False, True, False)
    FUNCTION = "make"
    CATEGORY = " ✨ TJ_Node/LLM"

    def make(self, clip_name, get_name, auto_set, mode, translate, idea, style, fixed_elements,
             shot_count, seed, brief_override="", visual_beat_override="", input_image=None, clip=None):

        if clip is None:
            clip = _load_clip(clip_name)

        effective_shot_count = int(shot_count)
        product_brief = brief_override.strip()
        if not product_brief:
            if input_image is not None:
                product_brief = _generate_text(clip, _brief_prompt_for_mode(mode), 512, seed, image=input_image).strip()
            else:
                product_brief = _generate_text(clip, _text_brief_prompt(mode, idea, style, fixed_elements), 512, seed).strip()

        shot_beats = visual_beat_override.strip()
        if shot_beats:
            override_count = _line_count(shot_beats)
            if override_count:
                effective_shot_count = override_count
        else:
            shot_beats_prompt = _format_template(SHOT_BEATS_TEMPLATE, SHOT_COUNT=effective_shot_count,
                MODE_LABEL=_mode_label(mode), BRIEF=product_brief, IDEA=idea, STYLE=style, FIXED=fixed_elements)
            shot_beats = _generate_text(clip, shot_beats_prompt, 512, seed + 1).strip()

        anchor = _generate_text(clip, _format_template(ANCHOR_TEMPLATE, BRIEF=product_brief, STYLE=style, FIXED=fixed_elements), 256, seed + 2).strip()

        keyframe_prompts = _generate_text(clip,
            _format_template(KEYFRAME_PROMPTS_TEMPLATE, SHOT_COUNT=effective_shot_count, BEATS=shot_beats,
                BRIEF=product_brief, ANCHOR=anchor, STYLE=style, FIXED=fixed_elements), 2048, seed + 3).strip()
        keyframe_prompt_lines = _prompt_lines(keyframe_prompts)

        language_map = {"KO": ("Korean", "Korean headings"), "EN": ("English", "English headings"),
                        "JP": ("Japanese", "Japanese headings"), "CN": ("Chinese", "Chinese headings")}
        language_name, heading_rule = language_map.get(str(translate or "KO"), language_map["KO"])
        story_template = KOREAN_STORY_TEMPLATE.replace(
            "Output in Korean only.",
            f"Output in {language_name} only. Use {heading_rule} where possible."
        )

        korean_story = _generate_text(clip,
            _format_template(story_template, MODE_LABEL=_mode_label(mode), BRIEF=product_brief, IDEA=idea,
                STYLE=style, BEATS=shot_beats, FINAL_PROMPTS=keyframe_prompts, CUT_LIST=_cut_list(effective_shot_count)),
            2048, seed + 4).strip()

        return {
            "ui": {"text": ["Reference brief:", product_brief, "Shot beats:", shot_beats,
                            "Visual anchor:", anchor, "Keyframe prompts:", keyframe_prompts,
                            "Korean story:", korean_story, "Effective shot count:", str(effective_shot_count)]},
            "result": (product_brief, shot_beats, anchor, keyframe_prompts, keyframe_prompt_lines, korean_story),
        }
