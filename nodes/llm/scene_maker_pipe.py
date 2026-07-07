# nodes/llm/scene_maker_pipe.py
# Scene Maker (TJ)의 pipe 출력을 받아 6개 슬롯으로 다시 펼치고,
# brief / beat / anchor / prompt / translated 를 한 노드에서 한 번에 보여준다.

from .scene_maker import SCENE_PIPE_TYPE, _prompt_lines


class TJ_SceneMakerResultPipe:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"pipe": (SCENE_PIPE_TYPE,)}}

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("Scene brief", "Visual Beat", "Visual anchor", "Scene prompt", "Scene prompt line", "Translated result")
    OUTPUT_IS_LIST = (False, False, False, False, True, False)
    FUNCTION = "unpack"
    OUTPUT_NODE = True
    CATEGORY = " ✨ TJ_Node/LLM"

    def unpack(self, pipe=None):
        data = pipe if isinstance(pipe, dict) else {}
        brief = str(data.get("scene_brief", "") or "")
        beat = str(data.get("visual_beat", "") or "")
        anchor = str(data.get("visual_anchor", "") or "")
        prompt = str(data.get("scene_prompt", "") or "")
        lines = data.get("scene_prompt_line")
        if not isinstance(lines, list) or not lines:
            lines = _prompt_lines(prompt)
        translated = str(data.get("translated_result", "") or "")

        return {
            # 표시 순서: brief / beat / anchor / prompt / translated
            "ui": {"tj_scene_pipe": [brief, beat, anchor, prompt, translated]},
            "result": (brief, beat, anchor, prompt, lines, translated),
        }
