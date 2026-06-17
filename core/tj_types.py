# core/tj_types.py
# TJ_NODE 공용 타입 - 모든 노드에서 이 파일을 import해서 사용

class AnyType(str):
    """모든 타입과 연결 가능한 와일드카드 클래스"""
    def __ne__(self, __value: object) -> bool:
        return False

class _AnyDict(dict):
    """모든 키를 허용하는 와일드카드 딕셔너리"""
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

any_type = AnyType("*")
