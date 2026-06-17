# nodes/utility/text_concatenate.py
from ...core.tj_types import _AnyDict


class TJ_TextConcatenate:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mode": (["Dynamic (Auto)", "Manual"], {"default": "Dynamic (Auto)"}),
                "num_ports": ("INT", {"default": 2, "min": 1, "max": 64}),
                "delimiter": ("STRING", {"default": ", "}),
                "setnode_name": ("STRING", {"default": ""}),
            },
            "optional": _AnyDict()
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "process"
    CATEGORY = " ✨ TJ_Node/Utility"

    def process(self, mode, num_ports, delimiter, setnode_name, **kwargs):
        delim = delimiter.replace("\\n", "\n")
        texts = []

        def get_number(key_str):
            try:
                return int(key_str.split('_')[1])
            except:
                return 999

        sorted_keys = sorted([k for k in kwargs.keys() if k.startswith("input_")], key=get_number)
        for k in sorted_keys:
            val = kwargs[k]
            if val is not None and str(val).strip():
                texts.append(str(val))
        return (delim.join(texts),)
