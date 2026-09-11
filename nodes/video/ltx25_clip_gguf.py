# nodes/video/ltx25_clip_gguf.py
# LTX25 CLIP GGUF LOADER (TJ)
#
# LTX 2.5 의 gemma4 텍스트 인코더를 GGUF 로 로드한다.
#
# city96/ComfyUI-GGUF 는 LTX 2.5 gemma4 파이프라인을 그대로 돌리지 못한다. 두 가지
# 문제가 있고, 제작자 패치(HF elix3r/gemma4-12b-with-proj-ltx-2.5-GGUF 의
# patches/ComfyUI-GGUF-ltx25-gemma4.patch)가 둘 다 고친다. 이 모듈은 그 패치와
# 동일한 동작을 런타임에 적용한다 — loader.py 파일을 직접 수정하지 않으므로
# ComfyUI-Manager 가 GGUF 팩을 업데이트해도 되돌려지지 않는다.
#
#   1) gemma4 텍스트 인코더 GGUF: `general.architecture = gemma4` 가 TXT_ARCH_LIST 에
#      없어서 "Unexpected text model architecture" 로 거부된다. → set.add("gemma4").
#      (다운스트림은 이미 gemma4 정상 처리: gguf_clip_loader 의 else:pass 통과,
#       comfy CLIPType.LTXV 가 dual_linear projection 선택.)
#
#   2) arch=ltxv 확산 모델 GGUF: embeddings connector 의 raw 파라미터 3종
#      (audio/video_embeddings_connector.learnable_registers, keyframes_abs_pos_embedding)
#      은 BF16 로 저장되고 GGMLOps 를 안 거치므로, gguf_sd_loader 에서 강제로 dequant
#      하지 않으면 GGMLTensor 인 채로 connector 의 torch.cat 에 들어가
#      "Tensors must have same number of dimensions: got 4 and 3" 로 샘플링이 죽는다.
#      → gguf_sd_loader 를 래핑해 arch=ltxv 일 때 이 3종을 float32 로 dequant.
#
# set.add 와 함수 래핑 모두 멱등이다.

import sys

import folder_paths

_LTXV_BF16_PARAMETERS = (
    "audio_embeddings_connector.learnable_registers",
    "video_embeddings_connector.learnable_registers",
    "keyframes_abs_pos_embedding",
)


def _apply_ltx25_gguf_patch():
    """제작자 LTX 2.5 gemma4 패치와 동일한 동작을 city96 loader 에 런타임 적용.

    반환: city96 loader 모듈을 찾아 적용했으면 True.
    """
    loader_mod = None
    for mod in list(sys.modules.values()):
        try:
            arch_list = getattr(mod, "TXT_ARCH_LIST", None)
        except Exception:
            continue
        # city96 loader.py 만 TXT_ARCH_LIST + gguf_sd_loader + dequantize_tensor 를
        # 동시에 가진다
        if (isinstance(arch_list, set)
                and hasattr(mod, "gguf_sd_loader")
                and hasattr(mod, "dequantize_tensor")):
            arch_list.add("gemma4")
            loader_mod = mod

    if loader_mod is None:
        return False
    if getattr(loader_mod, "_tj_ltx25_bf16_patch", False):
        return True

    import torch

    _orig = loader_mod.gguf_sd_loader
    _dequant = loader_mod.dequantize_tensor

    def _wrapped(path, *args, **kwargs):
        sd, extra = _orig(path, *args, **kwargs)
        try:
            if extra.get("arch_str") == "ltxv":
                for key in list(sd.keys()):
                    if not any(key == p or key.endswith("." + p) for p in _LTXV_BF16_PARAMETERS):
                        continue
                    val = sd[key]
                    if hasattr(val, "tensor_type"):   # 아직 GGMLTensor (BF16 raw)
                        sd[key] = _dequant(val, dtype=torch.float32)
        except Exception:
            pass
        return sd, extra

    _wrapped._tj_orig = _orig
    # gguf_sd_loader 는 loader.py 자신(gguf_clip_loader 가 호출)과 nodes.py
    # (`from .loader import gguf_sd_loader`, UnetLoaderGGUF 가 호출) 양쪽에 바인딩돼
    # 있으므로 두 곳 다 교체한다.
    for mod in list(sys.modules.values()):
        try:
            if getattr(mod, "gguf_sd_loader", None) is _orig:
                mod.gguf_sd_loader = _wrapped
        except Exception:
            continue
    loader_mod._tj_ltx25_bf16_patch = True
    return True


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
        _apply_ltx25_gguf_patch()

        node = loader_cls()
        fn = getattr(node, getattr(loader_cls, "FUNCTION", "load_clip"))
        # city96 CLIPLoaderGGUF.load_clip(clip_name, type="stable_diffusion")
        # type="ltxv" 로 core 의 CLIPType.LTXV(=gemma4 dual_linear) 경로를 탄다.
        result = fn(clip_name=clip_name, type="ltxv")
        clip = result[0] if isinstance(result, (tuple, list)) else result
        return (clip,)


# import 시점에 한 번 적용해 둔다 — LTX 2.5 확산 모델 GGUF 를 로드하는
# UnetLoaderGGUF 가 이 노드보다 먼저 실행돼도 패치가 걸려 있도록. (city96 loader 가
# 아직 import 안 됐으면 조용히 실패하고, load_clip 에서 다시 시도한다.)
try:
    _apply_ltx25_gguf_patch()
except Exception:
    pass
