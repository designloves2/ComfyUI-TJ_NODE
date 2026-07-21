# nodes/utility/index_lora_loader_counter.py
# Index LoRA Loader Counter (TJ)
#
# Index LoRA Loader (TJ) 의 활성(= "[none]" 이 아닌) LoRA 슬롯 개수를 그래프 연결 없이
# 실시간으로 따라간다. 프론트엔드(JS)가 캔버스에서 대상 Index LoRA Loader 노드의
# lora_1..lora_20 위젯 값을 직접 읽어 이 노드의 숨김 위젯에 채워 넣는다.
#
# 왜 그래프 연결이 아니라 JS 로 미러링하는가:
#   Index LoRA Loader 는 `index` 입력을 (보통) Queue Loop 의 출력에서 받는다. 만약 이
#   노드가 Index LoRA Loader 를 실제 그래프 링크로 참조해 total_count 를 얻고, 그 값을
#   다시 Queue Loop 의 queue_count/end_index 에 연결하면:
#     Queue Loop -> Index LoRA Loader -> (이 노드) -> Queue Loop
#   순환 의존성이 되어 ComfyUI 가 실행을 거부한다("dependency_cycle"). 이 노드는 Index
#   LoRA Loader 를 그래프상 전혀 참조하지 않으므로(입력이 전혀 없음) 그 문제가 없다.

MAX_LORA_SLOTS = 20


class TJ_IndexLoRALoaderCounter:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # 여러 개의 Index LoRA Loader 가 캔버스에 있을 때 어떤 것을 볼지 고른다.
                # 목록(옵션값)은 JS 가 그래프를 스캔해 런타임에 채운다("get_name" 콤보와
                # 동일한 TJ_NODE 관례). "(auto)" 면 캔버스에 로더가 하나뿐일 때 그것을 추적.
                "target_picker": (["(auto)"], {"default": "(auto)"}),
                # ↓ JS 가 실시간으로 채우는 값들 — 프론트에서 숨김, 직접 편집 불필요.
                "active_count": ("INT", {"default": 0, "min": 0, "max": MAX_LORA_SLOTS}),
                "target_label": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("total_count",)
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/Utility"

    def run(self, target_picker="(auto)", active_count=0, target_label=""):
        return (max(0, min(MAX_LORA_SLOTS, int(active_count))),)


NODE_CLASS_MAPPINGS = {
    "TJ_IndexLoRALoaderCounter": TJ_IndexLoRALoaderCounter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TJ_IndexLoRALoaderCounter": "Index LoRA Loader Counter (TJ)",
}
