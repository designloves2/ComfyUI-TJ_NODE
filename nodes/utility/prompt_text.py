# nodes/utility/prompt_text.py

class TJ_PromptText:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": ""}),
                "get_name": (["(none)"],),
                "setnode_name": ("STRING", {"default": ""}),
            },
            "optional": {
                "prompt_in": ("STRING", {"forceInput": True}),
            }
        }

    @classmethod
    def VALIDATE_INPUTS(s, *args, **kwargs):
        return True

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "process"
    CATEGORY = " ✨ TJ_Node/Utility"

    def process(self, text, get_name, setnode_name, prompt_in=""):
        out = ""
        if prompt_in and isinstance(prompt_in, str) and prompt_in.strip():
            out += prompt_in.strip() + "\n"
        out += text.strip()
        return (out.strip(),)
