"""
TJ_NODE - Send Point (TJ)

자기 자신(unique_id)에게 전달된 값만 읽는다. Send (TJ) 를 그래프상 어떤 형태로도
참조하지 않으므로, Send 쪽 그룹을 재실행하지 않아도 이 노드 이후 그래프만 단독으로
큐 실행할 수 있다.

기억(persistence):
  - IMAGE  : 참조(파일명)를 `received_ref` 에 저장 → IMAGE 텐서로 출력
  - VIDEO  : 참조(파일명)를 `received_ref` 에 저장 → 파일 경로(STRING)로 출력
  - STRING : 텍스트를 `received_text` 에 저장 → 그대로 출력
  위 셋은 워크플로우에 저장되어 ComfyUI 재시작 / 재오픈 후에도 계속 기억한다.
  - 그 외(LATENT 등)는 직렬화할 수 없어 세션 메모리(GET_REGISTRY)에만 보관한다.

보안 note:
  `received_*` 는 워크플로우 JSON 에 들어가는 값이라 신뢰하지 않는다.
  resolve_image_ref() 가 브리지 폴더 또는 ComfyUI 허용 루트 내부인지 검증한다.
"""

import numpy as np
import torch
from PIL import Image

try:
    from comfy_execution.graph_utils import ExecutionBlocker
except Exception:
    class ExecutionBlocker:  # type: ignore[no-redef]
        def __init__(self, message):
            self.message = message

from ...core.tj_types import any_type
from .send_bridge_api import GET_REGISTRY, resolve_image_ref


def _load_image_as_tensor(path):
    img = Image.open(path).convert("RGB")
    arr = np.array(img).astype(np.float32) / 255.0
    return torch.from_numpy(arr)[None, ]


class TJ_SendPoint:
    CATEGORY = " ✨ TJ_Node/Wireless"
    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("value",)
    FUNCTION = "execute"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # 이 Send Point 의 고유 이름. Send (TJ) 는 이 이름으로 버튼을 만든다.
                # 비어 있으면 버튼이 생성되지 않는다 (노드 제목과는 무관).
                "point_name": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "tooltip": "이 Send Point 의 고유 이름. Send (TJ) 노드에 이 이름으로 "
                               "버튼이 생깁니다. 비워두면 버튼이 만들어지지 않습니다.",
                }),
                # 출력 게이트: OFF 면 이 노드 아래쪽 그래프가 실행되지 않는다
                "output_enabled": ("BOOLEAN", {
                    "default": True,
                    "label_on": "Output ON",
                    "label_off": "Output OFF (차단)",
                    "tooltip": "OFF 로 두면 값을 내보내지 않고 이 노드 이후 그래프의 실행을 "
                               "막습니다. 전달받은 값은 그대로 유지되며, 값이 없어도 "
                               "에러가 나지 않습니다.",
                }),
            },
            "optional": {
                # ↓ JS 가 채우는 내부 저장 슬롯 (사용자 입력용 아님, UI 에서 숨김)
                # multiline 을 쓰면 DOM 텍스트박스 위젯이 생겨 숨겨도 자리를 차지하므로
                # 모두 단일행으로 둔다(값 저장에는 제약 없음).
                "received_ref": ("STRING", {"default": "", "multiline": False}),
                "received_text": ("STRING", {"default": "", "multiline": False}),
                "received_kind": ("STRING", {"default": "", "multiline": False}),
                "received_info": ("STRING", {"default": "", "multiline": False}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    @classmethod
    def IS_CHANGED(cls, point_name="", output_enabled=True, received_ref="", received_text="",
                   received_kind="", received_info="", unique_id=None, **kwargs):
        if not output_enabled:
            return "off"
        entry = GET_REGISTRY.get(str(unique_id))
        if entry:
            return entry.get("ts", 0.0)
        return f"{received_kind}|{received_ref}|{received_text}"

    # ── 종류별 출력 ────────────────────────────────────────────────
    def _from_media(self, ref, kind):
        path = resolve_image_ref(ref)
        if not path:
            raise RuntimeError(
                "Send Point (TJ): 전달받은 파일을 찾을 수 없거나 허용되지 않은 경로입니다. "
                "Send (TJ) 에서 다시 보내주세요."
            )
        if kind == "video_path":
            return (path,)          # 영상은 경로(STRING)로 넘긴다
        return (_load_image_as_tensor(path),)

    def execute(self, point_name="", output_enabled=True, received_ref="", received_text="",
                received_kind="", received_info="", unique_id=None, **kwargs):
        # 출력 OFF: 값을 내보내지 않고 이후 그래프 실행을 차단한다.
        # (값이 아직 없어도 에러를 내지 않는다 — 꺼둔 가지는 그냥 쉬는 상태)
        if not output_enabled:
            return (ExecutionBlocker(None),)

        entry = GET_REGISTRY.get(str(unique_id))

        # 1) 세션 메모리 우선 (이번 세션에서 방금 받은 값)
        if entry is not None:
            kind = entry["kind"]
            if kind in ("image_path", "video_path"):
                return self._from_media(entry.get("ref"), kind)
            if kind == "text":
                return (entry.get("text", ""),)
            return (entry["value"],)

        # 2) 위젯에 저장된 값 (재시작 / 워크플로우 재오픈 후에도 기억)
        if received_kind in ("image_path", "video_path") and received_ref:
            return self._from_media(received_ref, received_kind)
        if received_kind == "text":
            return (received_text,)
        # 예전 버전 호환: kind 가 없어도 ref 가 있으면 이미지로 처리
        if received_ref:
            return self._from_media(received_ref, "image_path")

        raise RuntimeError(
            "Send Point (TJ): 아직 전달받은 값이 없습니다. "
            "Send (TJ) 에서 이 노드로 먼저 Send 해주세요."
        )
