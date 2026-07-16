"""
TJ_NODE - LoRA 분석/편집 노드 패키지

노드: Krea2 / Klein 4B / Klein 9B / Z-Image LoRA Analyzer
공용 로직: _lora_core (키 형식 무관 분석/필터), _analyzer_base (노드 베이스)
"""

import os
import folder_paths

from ._lora_core import SPECS, analyze_lora, build_filtered_lora
from ._analyzer_base import BaseLoRAAnalyzer, TJ_LORA_CATEGORY

from .krea2_lora_analyzer import (
    Krea2LoRAAnalyzer,
    analyze_krea2_lora,          # 하위호환
    TOTAL_BLOCKS,                # 하위호환 (krea2 = 32)
)
from .klein_lora_analyzer import Klein4BLoRAAnalyzer, Klein9BLoRAAnalyzer
from .zimage_lora_analyzer import ZImageLoRAAnalyzer

NODE_CLASS_MAPPINGS = {
    "Krea2LoRAAnalyzer":  Krea2LoRAAnalyzer,
    "Klein4BLoRAAnalyzer": Klein4BLoRAAnalyzer,
    "Klein9BLoRAAnalyzer": Klein9BLoRAAnalyzer,
    "ZImageLoRAAnalyzer":  ZImageLoRAAnalyzer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Krea2LoRAAnalyzer":  "Krea2 LoRA Analyzer (TJ)",
    "Klein4BLoRAAnalyzer": "Klein 4B LoRA Analyzer (TJ)",
    "Klein9BLoRAAnalyzer": "Klein 9B LoRA Analyzer (TJ)",
    "ZImageLoRAAnalyzer":  "Z-Image LoRA Analyzer (TJ)",
}


# ─────────────────────────────────────────────
# 안전한 저장 경로 해석 (기본 설치 models/loras 하위로만 샌드박스)
#   보안/예측성: extra_model_paths 로 연결된 외부 드라이브 폴더가 아니라,
#   "지금 실행 중인 ComfyUI 설치 폴더의 models/loras" 를 항상 기준으로 사용한다.
#   그 안에서만 서브폴더 생성 + 파일 저장을 허용한다.
#   path traversal / 절대경로 / 다른 드라이브는 차단한다.
# ─────────────────────────────────────────────

def _default_loras_base():
    """현재 ComfyUI 설치 폴더의 models/loras 절대경로. (extra_model_paths 무시)"""
    models_dir = getattr(folder_paths, "models_dir", None)
    if models_dir:
        return os.path.realpath(os.path.join(models_dir, "loras"))
    roots = folder_paths.get_folder_paths("loras") or []
    return os.path.realpath(roots[0]) if roots else None


def _resolve_lora_save_path(save_path: str):
    """정상 시 (abs_path, None), 문제 시 (None, error_msg)."""
    if not save_path or "\x00" in save_path:
        return None, "save_path is required"

    base = _default_loras_base()
    if not base:
        return None, "No loras directory configured"
    os.makedirs(base, exist_ok=True)

    rel = save_path.strip().replace("\\", "/").lstrip("/")
    if not rel:
        return None, "save_path is required"

    target = os.path.realpath(os.path.join(base, rel))
    try:
        if os.path.commonpath([base, target]) != base:
            return None, "Path traversal blocked (must be inside models/loras)"
    except ValueError:
        return None, "Path traversal blocked (must be inside models/loras)"

    if not target.lower().endswith(".safetensors"):
        target += ".safetensors"
    return target, None


def _get_spec(arch):
    """요청의 arch 를 검증해 BlockSpec 반환. 알 수 없으면 None."""
    return SPECS.get(str(arch or "").strip().lower())


# ─────────────────────────────────────────────
# API 엔드포인트 등록
# ─────────────────────────────────────────────

try:
    from aiohttp import web
    from server import PromptServer
    import comfy.utils

    # ── GET /tjlora/structure?arch=krea2 ────────
    @PromptServer.instance.routes.get("/tjlora/structure")
    async def tjlora_structure(request):
        """프론트엔드가 블록 행을 그리기 위한 구조(블록 수/섹션/이름) 반환."""
        try:
            spec = _get_spec(request.rel_url.query.get("arch"))
            if spec is None:
                return web.json_response({"error": "Unknown arch"}, status=400)
            return web.json_response({"status": "ok", **spec.structure()})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    # ── POST /tjlora/analyze ────────────────────
    @PromptServer.instance.routes.post("/tjlora/analyze")
    async def tjlora_analyze(request):
        """LoRA 파일 분석 → block_data JSON 반환"""
        try:
            data      = await request.json()
            spec      = _get_spec(data.get("arch"))
            if spec is None:
                return web.json_response({"error": "Unknown arch"}, status=400)
            lora_name = data.get("lora_name", "")
            full_path = folder_paths.get_full_path("loras", lora_name)
            if not full_path or not os.path.exists(full_path):
                return web.json_response({"error": f"LoRA not found: {lora_name}"}, status=400)

            lora_sd    = comfy.utils.load_torch_file(full_path)
            block_data = analyze_lora(lora_sd, spec)
            return web.json_response({"status": "ok", "block_data": block_data})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    # ── POST /tjlora/save_filtered ──────────────
    @PromptServer.instance.routes.post("/tjlora/save_filtered")
    async def tjlora_save_filtered(request):
        """필터링된 LoRA 저장 (설치 폴더 models/loras 하위로만 허용)"""
        try:
            from safetensors.torch import save_file
            data         = await request.json()
            spec         = _get_spec(data.get("arch"))
            if spec is None:
                return web.json_response({"error": "Unknown arch"}, status=400)
            lora_name    = data.get("lora_name", "")
            block_config = data.get("block_config", {})
            save_path    = data.get("save_path", "")

            dest, err = _resolve_lora_save_path(save_path)
            if err:
                return web.json_response({"error": err}, status=400)

            full_path = folder_paths.get_full_path("loras", lora_name)
            if not full_path or not os.path.exists(full_path):
                return web.json_response({"error": f"LoRA not found: {lora_name}"}, status=400)

            lora_sd  = comfy.utils.load_torch_file(full_path)
            filtered = build_filtered_lora(lora_sd, block_config, spec)

            save_dir = os.path.dirname(dest)
            if save_dir:
                os.makedirs(save_dir, exist_ok=True)
            save_file(filtered, dest)

            return web.json_response({
                "status":         "ok",
                "saved_path":     dest,
                "original_keys":  len(lora_sd),
                "filtered_keys":  len(filtered),
                "enabled_blocks": sum(
                    1 for i in range(spec.total)
                    if block_config.get(str(i), {}).get("enable", True)
                ),
            })
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    print("[TJ LoRA Analyzer] API routes registered ✅")

except Exception as e:
    print(f"[TJ LoRA Analyzer] API registration failed: {e}")


__all__ = [
    "Krea2LoRAAnalyzer", "Klein4BLoRAAnalyzer", "Klein9BLoRAAnalyzer", "ZImageLoRAAnalyzer",
    "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS",
]
