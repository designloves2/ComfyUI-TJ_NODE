# multi_router.py
# TJ_MultiRouter (순수 라우터 버전)

MAX_PORTS = 20

class _AnyDict(dict):
    """
    동적 input을 허용하는 dict.
    __contains__ 는 항상 True 를 반환하지만,
    실제 키 조회(__getitem__/get) 시 키가 없으면 wildcard 타입 ("*", {}) 을 반환해야
    ComfyUI prompt validation 단계에서 KeyError 가 발생하지 않는다.
    """
    def __contains__(self, key):
        return True

    def __getitem__(self, key):
        try:
            return super().__getitem__(key)
        except KeyError:
            return ("*", {})

    def get(self, key, default=None):
        if super().__contains__(key):
            return super().__getitem__(key)
        return ("*", {})


class TJ_MultiRouter:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode":      (["Dynamic (Auto)", "Manual"],),
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
    CATEGORY     = "TJ Node"
    OUTPUT_NODE  = True

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        return True

    def execute(self, mode="Dynamic (Auto)", num_ports=1, unique_id=None, **kwargs):
        outputs = []
        for i in range(1, MAX_PORTS + 1):
            val = kwargs.get(f"input_{i}", None)
            outputs.append(val)
        return tuple(outputs)