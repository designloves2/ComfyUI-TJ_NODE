# nodes/wireless/set_node.py
from ...core.tj_types import any_type

class TJ_SetNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": (any_type,),
                "set_name": ("STRING", {"default": "TJ_Set_1"}),
            }
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("value",)
    FUNCTION = "execute"
    CATEGORY = " ✨ TJ_Node/Wireless"

    def execute(self, value, set_name):
        return (value,)
