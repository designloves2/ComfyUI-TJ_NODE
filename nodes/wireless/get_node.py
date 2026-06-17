# nodes/wireless/get_node.py
from ...core.tj_types import any_type

class TJ_GetNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "get_name": (["(none)"],),
            },
            "optional": {
                "wire": (any_type,),
            }
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("value",)
    FUNCTION = "execute"
    CATEGORY = " ✨ TJ_Node/Wireless"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def execute(self, get_name="(none)", wire=None):
        return (wire,)
