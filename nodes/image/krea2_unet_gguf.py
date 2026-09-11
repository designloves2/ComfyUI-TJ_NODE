# nodes/image/krea2_unet_gguf.py
# KREA2 UNET GGUF LOADER (TJ)
#
# Same class of bug as TJ_LTX25ClipLoaderGGUF (nodes/video/ltx25_clip_gguf.py), on the
# diffusion-model side instead of the text-encoder side.
#
# city96/ComfyUI-GGUF's gguf_sd_loader gates on general.architecture before it will even
# read the tensors: IMG_ARCH_LIST (loader.py) doesn't have "krea2", so a Krea 2 (FLUX.1
# Krea [dev]-derived) GGUF is rejected with "Unexpected architecture type in GGUF file:
# 'krea2'" before UnetLoaderGGUF.load_unet ever reaches comfy.sd.load_diffusion_model_
# state_dict. That check is a pure gate — arch_str itself is never passed to or used by
# load_diffusion_model_state_dict, which detects the actual model class from tensor
# keys/shapes in the state dict, not from GGUF metadata. So the only thing needed is
# adding "krea2" to the allowlist; downstream shape-based detection picks it up as a
# FLUX-derived model on its own.
#
# TXT_ARCH_LIST.add("gemma4") in ltx25_clip_gguf.py) applies here too.

import sys

import folder_paths


def _get_unet_loader_gguf_cls():
    """ComfyUI 에 등록된 city96 UnetLoaderGGUF 클래스를 돌려준다."""
    import nodes
    cls = nodes.NODE_CLASS_MAPPINGS.get("UnetLoaderGGUF")
    if cls is None:
        raise RuntimeError(
            "KREA2 UNET GGUF LOADER (TJ): ComfyUI-GGUF 가 설치되어 있지 않습니다. "
            "ComfyUI-Manager 또는 ONE STUDIO 인스톨러로 ComfyUI-GGUF 를 설치하세요."
        )
    return cls


def _enable_krea2_arch():
    """이미 로드된 city96 loader 모듈의 IMG_ARCH_LIST 에 'krea2' 를 추가한다.

    set.add 는 비파괴적·멱등이고, 이 노드가 실행될 때마다 다시 적용되므로
    ComfyUI-Manager 가 GGUF 팩을 업데이트해도 되돌려지지 않는다.
    """
    patched = False
    for mod in list(sys.modules.values()):
        try:
            arch_list = getattr(mod, "IMG_ARCH_LIST", None)
        except Exception:
            continue
        # city96 loader.py 만 IMG_ARCH_LIST + gguf_sd_loader 를 동시에 가진다
        if isinstance(arch_list, set) and hasattr(mod, "gguf_sd_loader"):
            if "krea2" not in arch_list:
                arch_list.add("krea2")
                patched = True
    return patched


def _gguf_unet_names():
    """unet_gguf / diffusion_models 폴더의 .gguf 파일 목록."""
    names = []
    seen = set()
    for kind in ("unet_gguf", "diffusion_models"):
        try:
            for n in folder_paths.get_filename_list(kind):
                if n.lower().endswith(".gguf") and n not in seen:
                    seen.add(n)
                    names.append(n)
        except Exception:
            continue
    return names


class TJ_NODE_Krea2UnetLoaderGGUF:
    """Krea 2 diffusion-model GGUF 로더.

    city96 UnetLoaderGGUF 를 그대로 재사용하고, 실행 시점에 IMG_ARCH_LIST 에
    "krea2" 만 추가해 위임한다. 출력은 core UnetLoaderGGUF 와 동일한 MODEL.
    """

    @classmethod
    def INPUT_TYPES(cls):
        names = _gguf_unet_names()
        return {
            "required": {
                "unet_name": (names if names else ["(no .gguf files found)"],),
            },
            "optional": {
                "auto_set": ("BOOLEAN", {"default": False,
                    "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
                "setnode_name": ("STRING", {"default": "Krea2_UNET"}),
            },
        }

    RETURN_TYPES = ("MODEL",)
    RETURN_NAMES = ("model",)
    FUNCTION = "load_unet"
    CATEGORY = " ✨ TJ_Node/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def load_unet(self, unet_name, auto_set=False, setnode_name="Krea2_UNET"):
        if not unet_name or unet_name == "(no .gguf files found)":
            raise RuntimeError(
                "KREA2 UNET GGUF LOADER (TJ): .gguf 디퓨전 모델 파일을 찾을 수 없습니다. "
                "models/diffusion_models 에 Krea 2 GGUF 를 두세요."
            )

        loader_cls = _get_unet_loader_gguf_cls()
        _enable_krea2_arch()

        node = loader_cls()
        fn = getattr(node, getattr(loader_cls, "FUNCTION", "load_unet"))
        result = fn(unet_name=unet_name)
        model = result[0] if isinstance(result, (tuple, list)) else result
        return (model,)
