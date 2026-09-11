# nodes/image/krea2_clip_gguf.py
# KREA2 CLIP GGUF LOADER (TJ)
#
# Krea 2's text encoder is a full Qwen3-VL-4B (12-layer tap for conditioning +
# multimodal generate). Core ComfyUI already supports it natively:
#   comfy/sd.py CLIPType.KREA2 + TEModel.QWEN3VL_4B -> comfy.text_encoders.krea2.te /
#   Krea2Tokenizer (see the `elif clip_type == CLIPType.KREA2 and te_model ==
#   TEModel.QWEN3VL_4B` branch). So a GGUF-quantized Qwen3-VL-4B only needs city96's
#   gguf_sd_loader to actually accept the file — same class of pure-gate problem as
#   TJ_LTX25ClipLoaderGGUF's gemma4 and TJ_NODE_Krea2UnetLoaderGGUF's krea2 unet arch.
#
# Unlike those two, we don't have a confirmed exact `general.architecture` string for
# a Krea2 Qwen3-VL-4B GGUF export (TXT_ARCH_LIST already has "qwen3vl" — it may just
# work with zero changes). So instead of guessing a string to hardcode, this node reads
# whatever architecture tag the selected file actually declares and adds *that* to the
# allowlist if it isn't already there — safe regardless of the exact spelling, since
# downstream text-model detection (detect_te_model / gguf_clip_loader's unhandled-arch
# passthrough) works from tensor keys, not from the GGUF arch tag.

import sys

import folder_paths


def _get_gguf_clip_loader_cls():
    import nodes
    cls = nodes.NODE_CLASS_MAPPINGS.get("CLIPLoaderGGUF")
    if cls is None:
        raise RuntimeError(
            "KREA2 CLIP GGUF LOADER (TJ): ComfyUI-GGUF 가 설치되어 있지 않습니다. "
            "ComfyUI-Manager 또는 ONE STUDIO 인스톨러로 ComfyUI-GGUF 를 설치하세요."
        )
    return cls


def _read_gguf_arch(path):
    """이 GGUF 파일이 실제로 선언한 general.architecture 값을 읽는다."""
    try:
        import gguf
        reader = gguf.GGUFReader(path)
        field = reader.get_field("general.architecture")
        if field is None or not field.data:
            return None
        return str(field.parts[field.data[-1]], encoding="utf-8")
    except Exception:
        return None


def _enable_arch(arch):
    """city96 loader 의 TXT_ARCH_LIST 에 arch 를 추가한다 (이미 있으면 아무 일도 안 함).

    set.add 는 비파괴적·멱등이고 매 load_clip 호출마다 재적용되므로 GGUF 팩
    업데이트로 되돌려지지 않는다.
    """
    if not arch:
        return False
    patched = False
    for mod in list(sys.modules.values()):
        try:
            arch_list = getattr(mod, "TXT_ARCH_LIST", None)
        except Exception:
            continue
        if isinstance(arch_list, set) and hasattr(mod, "gguf_sd_loader"):
            if arch not in arch_list:
                arch_list.add(arch)
                patched = True
    return patched


def _gguf_clip_names():
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


class TJ_NODE_Krea2ClipLoaderGGUF:
    """Krea 2 Qwen3-VL-4B 텍스트 인코더 GGUF 로더.

    city96 CLIPLoaderGGUF 를 재사용하고 type="krea2" 로 core 의 CLIPType.KREA2
    (Qwen3-VL-4B, 12-layer tap) 경로를 태운다. 이 파일이 실제로 선언한
    general.architecture 값만 허용 목록에 추가하므로 정확한 태그를 몰라도 안전하다.
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
                "setnode_name": ("STRING", {"default": "Krea2_CLIP"}),
            },
        }

    RETURN_TYPES = ("CLIP",)
    RETURN_NAMES = ("clip",)
    FUNCTION = "load_clip"
    CATEGORY = " ✨ TJ_Node/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def load_clip(self, clip_name, auto_set=False, setnode_name="Krea2_CLIP"):
        if not clip_name or clip_name == "(no .gguf files found)":
            raise RuntimeError(
                "KREA2 CLIP GGUF LOADER (TJ): .gguf 텍스트 인코더 파일을 찾을 수 없습니다. "
                "models/text_encoders 또는 models/clip 에 Krea 2 Qwen3-VL-4B GGUF 를 두세요."
            )

        clip_path = folder_paths.get_full_path("clip", clip_name) or folder_paths.get_full_path("text_encoders", clip_name)
        if clip_path:
            _enable_arch(_read_gguf_arch(clip_path))

        loader_cls = _get_gguf_clip_loader_cls()
        node = loader_cls()
        fn = getattr(node, getattr(loader_cls, "FUNCTION", "load_clip"))
        result = fn(clip_name=clip_name, type="krea2")
        clip = result[0] if isinstance(result, (tuple, list)) else result
        return (clip,)
