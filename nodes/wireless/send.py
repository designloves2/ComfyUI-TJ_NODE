"""
TJ_NODE - Send (TJ)

입력값을 세션 캐시에만 저장한다. 실제 전달은 프론트엔드 버튼 클릭 →
/tj_send_bridge/send API 호출로 이루어지며, 이 노드와 Send Point (TJ) 의
큐 실행은 그래프상 완전히 분리되어 있다(서로 참조하지 않음).
"""

from ...core.tj_types import any_type
from .send_bridge_api import store_sender_cache


class TJ_Send:
    CATEGORY = " ✨ TJ_Node/Wireless"
    RETURN_TYPES = ()
    FUNCTION = "execute"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": (any_type, {}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    @classmethod
    def IS_CHANGED(cls, value=None, unique_id=None, **kwargs):
        # 입력이 바뀌면 항상 다시 캐시하도록 매 실행 dirty 처리
        return float("nan")

    def execute(self, value=None, unique_id=None, **kwargs):
        store_sender_cache(unique_id, value)
        return {}
