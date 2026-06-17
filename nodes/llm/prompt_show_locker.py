# nodes/llm/prompt_show_locker.py
from ._llm_utils import TJ_LLM_CATEGORY


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
            raise ValueError("🟡 PAUSED — Prompt Show & Locker intentionally stopped text passthrough. Toggle LOCKED IN to continue.")
        return {
            "ui": {
                "tj_prompt_locker_text": [source_text],
                "tj_prompt_locker_status": ["🟢 LOCKED IN — Text passthrough active."]
            },
            "result": (source_text,)
        }
