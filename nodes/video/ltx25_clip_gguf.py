# nodes/video/ltx25_clip_gguf.py
# LTX25 CLIP GGUF LOADER (TJ)
#
# LTX 2.5 의 gemma4 텍스트 인코더를 GGUF 로 로드한다.
#
# city96/ComfyUI-GGUF 의 gguf_sd_loader 는 `general.architecture = gemma4` 를
# 허용 목록(TXT_ARCH_LIST)에 넣지 않아서 "Unexpected text model architecture" 로
# 거부한다. 다운스트림은 이미 gemma4 를 정상 처리한다:
#   - loader.py gguf_clip_loader 의 `else: pass` 분기가 gemma4 sd 를 손대지 않고
#     그대로 반환 (T5/llama/gemma3 리매핑·norm 보정에 안 걸림)
#   - comfy/text_encoders/lt.py 가 projection 텐서를 보고 dual_linear 를 선택
#   - BF16 1D bias/norm 은 gguf_sd_loader 가 자동 dequant
# 따라서 유일하게 필요한 것은 허용 목록에 "gemma4" 를 더하는 것뿐이다.
# TXT_ARCH_LIST 는 set 이므로 add() 는 비파괴적·멱등이고, 이 노드가 실행될 때마다
# 다시 적용되므로 ComfyUI-Manager 가 GGUF 팩을 업데이트해도 되돌려지지 않는다.
# (동작 몽키패치가 아니라 허용 목록 확장이다.)

import sys

import folder_paths


def _get_gguf_clip_loader_cls():
    """ComfyUI 에 등록된 city96 CLIPLoaderGGUF 클래스를 돌려준다."""
    import nodes
    cls = nodes.NODE_CLASS_MAPPINGS.get("CLIPLoaderGGUF")
    if cls is None:
        raise RuntimeError(
            "LTX25 CLIP GGUF LOADER (TJ): ComfyUI-GGUF 가 설치되어 있지 않습니다. "
            "ComfyUI-Manager 또는 ONE STUDIO 인스톨러로 ComfyUI-GGUF 를 설치하세요."
        )
    return cls


def _enable_gemma4_arch():
    """이미 로드된 city96 loader 모듈의 TXT_ARCH_LIST 에 'gemma4' 를 추가한다.

    반환: 실제로 추가한 모듈이 하나라도 있으면 True.
    """
    patched = False
    for mod in list(sys.modules.values()):
        try:
            arch_list = getattr(mod, "TXT_ARCH_LIST", None)
        except Exception:
            continue
        # city96 loader.py 만 TXT_ARCH_LIST + gguf_sd_loader 를 동시에 가진다
        if isinstance(arch_list, set) and hasattr(mod, "gguf_sd_loader"):
            if "gemma4" not in arch_list:
                arch_list.add("gemma4")
                patched = True
    return patched


def _gguf_clip_names():
    """clip / clip_gguf / text_encoders 폴더의 .gguf 파일 목록."""
    names = []
    seen = set()
    for kind in ("clip_gguf", "clip", "text_encoders"):
        try:
            for n in folder_paths.get_filename_list(kind):
                if n.lower().endswith(".gguf") and n not in seen:
                    seen.add(n)
                    names.append(n)
        except Exception:
            continue
    return names


class TJ_LTX25ClipLoaderGGUF:
    """LTX 2.5 gemma4 텍스트 인코더 GGUF 로더.

    STUDIO_ONE 그래프 빌더는 clip 파일이 .gguf 면 core CLIPLoader 대신 이 노드를
    emit 한다. 출력은 CLIPLoader / CLIPLoaderGGUF 와 동일한 CLIP 이다.
    """

    @classmethod
    def INPUT_TYPES(cls):
        names = _gguf_clip_names()
        return {
            "required": {
                "clip_name": (names if names else ["(no .gguf files found)"],),
            },
            "optional": {
                "auto_set": ("BOOLEAN", {"default": False,
                    "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
                "setnode_name": ("STRING", {"default": "LTX25_CLIP"}),
            },
        }

    RETURN_TYPES = ("CLIP",)
    RETURN_NAMES = ("clip",)
    FUNCTION = "load_clip"
    CATEGORY = " ✨ TJ_Node/Video"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        # 서버가 아는 콤보 목록(로드 시점 스냅샷)과 달라도 통과시킨다 — 파일이
        # 나중에 추가되거나 다른 폴더에 있을 수 있다. 실제 존재 검사는 load_clip 에서.
        return True

    def load_clip(self, clip_name, auto_set=False, setnode_name="LTX25_CLIP"):
        if not clip_name or clip_name == "(no .gguf files found)":
            raise RuntimeError(
                "LTX25 CLIP GGUF LOADER (TJ): .gguf 텍스트 인코더 파일을 찾을 수 없습니다. "
                "models/text_encoders 또는 models/clip 에 gemma4 GGUF 를 두세요."
            )

        loader_cls = _get_gguf_clip_loader_cls()
        _enable_gemma4_arch()

        node = loader_cls()
        fn = getattr(node, getattr(loader_cls, "FUNCTION", "load_clip"))
        # city96 CLIPLoaderGGUF.load_clip(clip_name, type="stable_diffusion")
        # type="ltxv" 로 core 의 CLIPType.LTXV(=gemma4 dual_linear) 경로를 탄다.
        result = fn(clip_name=clip_name, type="ltxv")
        clip = result[0] if isinstance(result, (tuple, list)) else result
        return (clip,)
