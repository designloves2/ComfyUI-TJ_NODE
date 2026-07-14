# nodes/utility/video_grid_comparer.py
# Video Grid Comparer (TJ) - 독립 비디오 그리드 비교 뷰어 노드
#
# 이 노드는 Registry / Fake-Wire 시스템과 무관한 순수 프론트엔드 뷰어다.
# Backend 는 실행 시 아무 처리도 하지 않으며(no-op), 그리드 레이아웃 JSON 은
# grid_layout 위젯에 직렬화되어 워크플로우와 함께 영구 저장된다.
# 실제 폴더 스캔 / 파일 서빙은 core/tj_api.py 의 /tj_node/vgc/* 라우트가 담당한다.


class TJ_VideoGridComparer:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "folder_path": ("STRING", {"default": "", "multiline": False,
                                           "placeholder": "video folder path (e.g. C:/renders/compare)"}),
                # grid_layout 은 프론트엔드가 관리하는 영구 저장용 위젯이다.
                # JS 에서 hidden 처리되며 Save/Load/Duplicate 시 레이아웃을 복원한다.
                # 단일 라인(캔버스 위젯)이라 숨김 시 DOM 요소가 남지 않는다.
                "grid_layout": ("STRING", {"default": "{}", "multiline": False}),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "noop"
    CATEGORY = " ✨ TJ_Node/Video"
    OUTPUT_NODE = True

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def noop(self, folder_path="", grid_layout="{}"):
        # 순수 뷰어 노드이므로 실행 시 부작용이 없다.
        return {}
