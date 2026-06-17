# nodes/wireless/multi_get_node.py
from ...core.tj_types import any_type

MAX_PORTS = 20

class TJ_MultiGetNode:
    @classmethod
    def INPUT_TYPES(cls):
        inputs = {"required": {}, "optional": {}}
        for i in range(1, MAX_PORTS + 1):
            inputs["optional"][f"wire_{i}"] = (any_type,)
        return inputs

    RETURN_TYPES = tuple([any_type] * MAX_PORTS)
    RETURN_NAMES = tuple([f"output_{i}" for i in range(1, MAX_PORTS + 1)])
    FUNCTION = "execute"
    CATEGORY = " ✨ TJ_Node/Wireless"

    def execute(self, **kwargs):
        outputs = []
        for i in range(1, MAX_PORTS + 1):
            outputs.append(kwargs.get(f"wire_{i}", None))
        return tuple(outputs)
