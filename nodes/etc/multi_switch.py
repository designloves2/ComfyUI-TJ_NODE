# nodes/multi_switch.py
# TJ_MultiSwitch — 그룹 단위 A/B 스위치 (테스트 버전)
#
# 실제 "실행 자체를 차단"하는 핵심 로직은 web/multi_switch.js 에서
# 큐 전송 직전 app.graphToPrompt() 결과를 가로채 처리한다.
# 이 Python 노드는 (1) 입력/출력 슬롯 정의, (2) JS 프루닝이 어떤 이유로
# 동작하지 않았을 때(API 직접 호출 등)의 안전한 폴백 역할만 담당한다.

try:
    from ...core.tj_types import _AnyDict
except ImportError:
    # TJ_NODE_TEST 단독 실행 시 폴백
    class _AnyDict(dict):
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

MAX_GROUPS = 12


class TJ_MultiSwitch:
    """
    그룹 N개 = (A_n, B_n) 입력 페어 + output_n 출력.
    toggle_mode 가 Global 이면 global_switch 값을 모든 그룹이 공유,
    Per-Group 이면 그룹마다 개별 switch_n 값을 사용한다.

    실행 차단 로직(선택 안 된 쪽 상위 노드 미실행 / 선택된 쪽 미연결 시
    해당 그룹만 조용히 빈 값 처리)은 JS 큐-훅에서 그래프 자체를 잘라
    처리하므로, 정상 사용 시 이 execute()는 이미 가지치기된 입력만 받는다.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "toggle_mode": (["Global", "Per-Group"],),
                "global_switch": ("BOOLEAN", {"default": True, "label_on": "A", "label_off": "B"}),
                "num_groups": ("INT", {"default": 1, "min": 1, "max": MAX_GROUPS}),
            },
            "optional": _AnyDict(),
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = tuple(["*"] * MAX_GROUPS)
    RETURN_NAMES = tuple([f"output_{i}" for i in range(1, MAX_GROUPS + 1)])
    FUNCTION = "execute"
    CATEGORY = " ✨ TJ_Node/Wireless"
    OUTPUT_NODE = False

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        # Multi Router와 동일하게 그룹별 동적 타입을 프론트에서 관리하므로
        # 백엔드 단계에서는 항상 통과시킨다.
        return True

    def execute(self, toggle_mode="Global", global_switch=True, num_groups=1,
                unique_id=None, **kwargs):
        # 토글 위젯 값(True/False)을 A/B 선택으로 해석. True == A, False == B.
        outputs = []
        for i in range(1, MAX_GROUPS + 1):
            if i > num_groups:
                outputs.append(None)
                continue

            if toggle_mode == "Per-Group":
                sw_is_a = kwargs.get(f"switch_{i}", global_switch)
            else:
                sw_is_a = global_switch

            selected_key = f"A_{i}" if sw_is_a else f"B_{i}"
            outputs.append(kwargs.get(selected_key, None))

        return tuple(outputs)
