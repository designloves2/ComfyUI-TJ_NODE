# multi_router.py
# TJ_MultiRouter (Auto Set 스위치 부활 버전)

MAX_PORTS = 20

class _AnyDict(dict):
    def __contains__(self, key): return True
    def __getitem__(self, key):
        try: return super().__getitem__(key)
        except KeyError: return ("*", {})
    def get(self, key, default=None):
        if super().__contains__(key): return super().__getitem__(key)
        return ("*", {})

class TJ_MultiRouter:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode":      (["Dynamic (Auto)", "Manual"],),
                "auto_set":  ("BOOLEAN", {"default": True, "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
                "num_ports": ("INT", {"default": 1, "min": 1, "max": MAX_PORTS}),
            },
            "optional": _AnyDict(),
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = tuple(["*"] * MAX_PORTS)
    RETURN_NAMES = tuple([f"output_{i}" for i in range(1, MAX_PORTS + 1)])
    FUNCTION     = "execute"
    CATEGORY     = " ✨ TJ_Node/Wireless"
    OUTPUT_NODE  = True

    @classmethod
    def VALIDATE_INPUTS(cls, input_types): return True

    def execute(self, mode="Dynamic (Auto)", auto_set=True, num_ports=1, unique_id=None, **kwargs):
        outputs = []
        for i in range(1, MAX_PORTS + 1):
            outputs.append(kwargs.get(f"input_{i}", None))
        return tuple(outputs)