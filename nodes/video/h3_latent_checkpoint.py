# nodes/video/h3_latent_checkpoint.py
# MiniMax H3 Latent Checkpoint Save/Load (TJ)
#
# One-Take(h3_latent_continuation.py)는 클립 N의 샘플링 결과 latent를 클립 N+1에 그대로
# 이어붙인다. 하지만 MiniMax H3 ONE STUDIO의 릴레이는 클립마다 새 큐를 제출한다(모델 언로드로
# VRAM을 비우기 위해) — ComfyUI는 서로 다른 프롬프트(큐) 제출 사이에 텐서를 들고 있지 않으므로,
# in-memory로는 클립 N의 latent를 클립 N+1 제출에 넘길 방법이 없다.
#
# 그래서 클립마다: 샘플링 결과 latent를 이 노드로 디스크에 저장 -> 다음 클립 제출 때 다시
# 이 노드로 읽어서 Latent Continuation에 넘긴다. 저장소처럼 클립별 latent 체크포인트를
# safetensors로 남기면, 릴레이 구조(매 클립 새 큐 + VRAM 정리)를 그대로 유지하면서 latent를
# 이어붙일 수 있고 "중단 후 재개"도 자연히 따라온다.

import os

import torch
from safetensors.torch import save_file, load_file

import folder_paths
import comfy.nested_tensor
import comfy.model_management


def _checkpoint_dir():
    d = os.path.join(folder_paths.get_output_directory(), "one_minimax_h3", "_latent_checkpoints")
    os.makedirs(d, exist_ok=True)
    return d


def _safe_name(name):
    name = os.path.basename(str(name or "").strip())
    if not name or any(c in name for c in ("..", "/", "\\", "\0")):
        raise ValueError("MiniMax H3 Latent Checkpoint (TJ): 잘못된 checkpoint 이름입니다.")
    return name


class TJ_H3_SaveLatentCheckpoint:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "latent": ("LATENT",),
                "checkpoint_name": ("STRING", {"default": "clip001",
                    "tooltip": "확장자 없이 이름만 — <이름>.h3lat.safetensors 로 저장됩니다."}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("checkpoint_name",)
    FUNCTION = "save"
    CATEGORY = " ✨ TJ_Node/Video"
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # One-Take 루프에서는 checkpoint_name이 클립마다 동일한 고정값("clip001" 등)이라,
        # 이걸로만 판단하면 ComfyUI가 "입력이 그대로니 다시 실행할 필요 없다"고 캐시를
        # 재사용해버려 실제로는 매번 다른 latent인데도 디스크에 새로 안 써질 수 있다.
        return float("nan")

    def save(self, latent, checkpoint_name):
        samples = latent.get("samples")
        if not getattr(samples, "is_nested", False):
            raise ValueError(
                "MiniMax H3 Latent Checkpoint Save (TJ): H3 AV latent가 아닙니다 "
                "(NestedTensor 2-stream 필요)."
            )
        video, audio = samples.unbind()
        name = _safe_name(checkpoint_name)
        path = os.path.join(_checkpoint_dir(), f"{name}.h3lat.safetensors")
        # 임시 파일에 먼저 쓰고 os.replace로 교체한다 — 같은 이름을 Load가 이미 mmap으로
        # 열어둔 상태여도(같은 실행 안에서 로드→샘플→세이브 순서) 새 파일 자체는 별도
        # 경로라 충돌이 없고, replace는 원자적이라 쓰다가 중단돼도 기존 파일이 안전하다.
        tmp_path = path + f".tmp{os.getpid()}"
        save_file({
            "video": video.detach().to("cpu").contiguous(),
            "audio": audio.detach().to("cpu").contiguous(),
        }, tmp_path)
        os.replace(tmp_path, path)
        return (name,)


class TJ_H3_LoadLatentCheckpoint:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "checkpoint_name": ("STRING", {"default": "clip001",
                    "tooltip": "TJ_H3_SaveLatentCheckpoint가 저장할 때 쓴 이름과 동일해야 합니다."}),
                "strict": ("BOOLEAN", {"default": True, "label_on": "Strict ON (missing = error)",
                    "label_off": "Strict OFF (missing = None)",
                    "tooltip": "index를 연결하지 않았을 때만 쓰이는 수동 설정. ON(기본): 체크포인트가 "
                               "없으면 에러. OFF: 없으면 그냥 latent=None. index를 연결하면 이 값은 "
                               "무시되고 index<=1 여부로 자동 판단합니다."}),
            },
            "optional": {
                "index": ("INT", {"default": 0, "min": 0, "max": 100000, "step": 1,
                    "tooltip": "MiniMax H3 Prompt Queue (TJ)의 index 출력을 연결하세요. 연결하면 "
                               "index<=1일 때만(첫 클립) 파일이 없어도 에러 없이 넘어가고, "
                               "2번째 클립부터는 파일이 없으면 진짜 에러로 알려줍니다 — strict 위젯을 "
                               "수동으로 안 바꿔도 자동으로 이렇게 동작합니다."}),
            },
        }

    RETURN_TYPES = ("LATENT",)
    RETURN_NAMES = ("latent",)
    FUNCTION = "load"
    CATEGORY = " ✨ TJ_Node/Video"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # checkpoint_name이 클립마다 고정값이면 ComfyUI가 이전 실행 결과를 캐시로 재사용해서
        # Save가 디스크에 새로 써도 Load가 그걸 못 읽고 옛날 값을 계속 돌려줄 수 있다 —
        # 매번 강제로 다시 읽게 한다.
        return float("nan")

    def load(self, checkpoint_name, strict=True, index=0):
        name = _safe_name(checkpoint_name)
        path = os.path.join(_checkpoint_dir(), f"{name}.h3lat.safetensors")

        # index=1은 무조건 "이번 원테이크 시퀀스의 첫 클립"이라는 뜻이다 — 같은 이름의
        # 체크포인트 파일이 (해상도가 다른 이전 세션 등에서) 남아있어도 그건 이번
        # 시퀀스와 무관한 찌꺼기이므로 파일 존재 여부와 상관없이 아예 로드를 건너뛴다.
        # 이러면 "예전 파일 지우고 다시 돌려라" 같은 수동 조치가 필요 없어진다.
        if index and int(index) <= 1:
            return (None,)

        if not os.path.isfile(path):
            # index가 연결돼 있으면(0보다 크면) 그걸로 판단 — 1번 클립만 봐주고
            # 2번부터는 파일이 없는 게 진짜 문제이므로 strict 여부와 무관하게 에러.
            tolerate_missing = (int(index) <= 1) if index else (not strict)
            if not tolerate_missing:
                raise ValueError(
                    f"MiniMax H3 Latent Checkpoint Load (TJ): 체크포인트를 찾을 수 없습니다: {name}"
                    + (f" (index={index})" if index else "")
                )
            return (None,)
        device = comfy.model_management.intermediate_device()
        tensors = load_file(path)
        # .clone() 으로 완전히 새 메모리에 복사해서 원본 파일의 mmap 참조를 끊는다 —
        # 안 하면 이 텐서가 살아있는 동안 파일이 매핑된 상태로 남아서, 같은 실행
        # 안에서 Save Checkpoint가 같은 이름으로 덮어쓰려 할 때 Windows가
        # "os error 1224"(매핑된 파일은 덮어쓸 수 없음)로 거부한다.
        video = tensors["video"].to(device).clone()
        audio = tensors["audio"].to(device).clone()
        del tensors
        return ({"samples": comfy.nested_tensor.NestedTensor((video, audio))},)
