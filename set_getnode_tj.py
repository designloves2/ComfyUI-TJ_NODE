# set_getnode_tj.py
# "Invisible Wire" (투명 선) 패러다임이 적용된 완벽하고 안정적인 무선 Set/Get/MultiGet 노드

class AnyType(str):
	"""모든 타입과 연결 가능한 완벽한 와일드카드 클래스"""
	def __ne__(self, __value: object) -> bool:
		return False

any_type = AnyType("*")

class TJ_SetNode:
	@classmethod
	def INPUT_TYPES(cls):
		return {
			"required": {
				"value": (any_type,),
				"set_name": ("STRING", {"default": "TJ_Set_1"}),
			}
		}

	RETURN_TYPES = (any_type,)
	RETURN_NAMES = ("value",)
	FUNCTION = "execute"
	CATEGORY = " ✨ TJ_Node/Wireless"

	def execute(self, value, set_name):
		return (value,)


class TJ_GetNode:
	@classmethod
	def INPUT_TYPES(cls):
		return {
			"required": {
				# Get Node 전용 선택 위젯. 기존 set_name과 구분해 UI 혼동을 줄입니다.
				"get_name": (["(none)"],), 
			},
			"optional": {
				"wire": (any_type,),
			}
		}

	RETURN_TYPES = (any_type,)
	RETURN_NAMES = ("value",)
	FUNCTION = "execute"
	CATEGORY = " ✨ TJ_Node/Wireless"

	# ★ ComfyUI가 "(none) 외에 다른 이름은 안 돼!"라고 에러 뱉는 것을 방지
	@classmethod
	def VALIDATE_INPUTS(cls, **kwargs):
		return True

	def execute(self, get_name="(none)", wire=None):
		return (wire,)


# ==========================================
MAX_PORTS = 20

class TJ_MultiGetNode:
	@classmethod
	def INPUT_TYPES(cls):
		inputs = {"required": {}, "optional": {}}
		for i in range(1, MAX_PORTS + 1):
			inputs["optional"][f"wire_{i}"] = (any_type,)
		return inputs

	RETURN_TYPES = tuple([any_type] * MAX_PORTS)
	RETURN_NAMES = tuple([f"output_{i}" for i in range(1, MAX_PORTS + 1)])
	FUNCTION = "execute"
	CATEGORY = " ✨ TJ_Node/Wireless"

	def execute(self, **kwargs):
		outputs = []
		for i in range(1, MAX_PORTS + 1):
			outputs.append(kwargs.get(f"wire_{i}", None))
		return tuple(outputs)