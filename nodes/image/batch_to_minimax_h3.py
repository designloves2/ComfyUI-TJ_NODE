# nodes/batch_to_minimax_h3.py
# TJ_BatchToMinimaxH3 — TJ_BatchToMultiOutput(ComfyUI-TJ_NODE)를 그대로 복사한 뒤
# 딱 하나만 바꾼 버전: 배치 수량을 초과하는 출력(또는 배치가 아예 없는데
# 연결된 출력)을 검정 이미지로 채우는 대신 None으로 미입력 처리(연결 안 한 것과 동일한 상태) 시킨다.
#
# 처음엔 ExecutionBlocker(None)을 썼는데, 실제 사용 대상인
# "MiniMax H3 Reference to Video" 같은 Autogrow(ref_image_0..N을 하나의
# ref_images 그룹으로 묶는) 노드에서 문제가 있었다: ComfyUI의
# execution.py::process_inputs 는 여러 입력 중 단 하나라도 ExecutionBlocker면
# 그 노드 실행 자체를 통째로 건너뛴다 — "일부만 빠지고 나머지는 정상 진행"이
# 아니라 "하나라도 비면 노드 전체가 죽는" 동작이라 스펙과 안 맞음.
# 반면 이 계열 Autogrow 노드들은 자기 쪽에서 이미
# `for img in (ref_images or {}).values(): if img is None: continue`
# 식으로 None을 정상적인 "빈 슬롯"으로 처리하도록 설계돼 있다. 그래서 여기서는
# 그냥 None을 리턴한다 — 단일값 소비 노드(PreviewImage 등)처럼 None을 못
# 받아들이는 노드에 물리면 그쪽에서 에러가 날 수 있다는 게 트레이드오프지만,
# 여러 optional 슬롯을 묶어 받는 노드(이 노드의 실제 사용 대상)에서는 이게
# 맞는 동작이다.
import torch

try:
    from ...core.tj_types import any_type
except ImportError:
    any_type = "*"

MAX_OUT = 12


class TJ_BatchToMinimaxH3:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "get_name": (["(none)"], {"default": "(none)"}),
                "out_count": ("INT", {"default": 2, "min": 1, "max": MAX_OUT, "step": 1}),
                "auto_set": ("BOOLEAN", {"default": False, "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
            }
        }

    RETURN_TYPES = tuple(["IMAGE"] * MAX_OUT)
    RETURN_NAMES = tuple([f"IMAGE_{i+1}" for i in range(MAX_OUT)])
    FUNCTION = "split"
    CATEGORY = " ✨ TJ_Node/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def split(self, images, get_name="(none)", out_count=2, auto_set=True):
        if isinstance(images, (list, tuple)):
            tensors = [x for x in images if isinstance(x, torch.Tensor)]
            if tensors:
                images = torch.cat([x.reshape(-1, *x.shape[-3:]) if x.ndim >= 4 else x for x in tensors], dim=0)

        if isinstance(images, torch.Tensor) and images.ndim > 4:
            images = images.reshape(-1, *images.shape[-3:])

        if not isinstance(images, torch.Tensor) or images.ndim != 4 or images.shape[0] == 0:
            batch_size = 0
        else:
            batch_size = int(images.shape[0])

        result = []
        for i in range(out_count):
            if batch_size and i < batch_size:
                result.append(images[i: i + 1])
            else:
                # 배치가 아예 없거나(batch_size == 0), 배치 수량을 초과한
                # 인덱스 → 검정 이미지 대신 None으로 미입력 처리(연결 안 한 것과 동일한 상태).
                result.append(None)
        for _ in range(MAX_OUT - out_count):
            result.append(None)

        return tuple(result)
