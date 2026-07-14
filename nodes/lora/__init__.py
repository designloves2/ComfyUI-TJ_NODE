"""
TJ_NODE - LoRA 분석/편집 노드 패키지
Krea2 LoRA Analyzer + 전용 API 라우트
"""

import os
import folder_paths

from .krea2_lora_analyzer import (
    Krea2LoRAAnalyzer,
    NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS,
    TOTAL_BLOCKS,
    analyze_krea2_lora,
    build_filtered_lora,
)

# ─────────────────────────────────────────────
# 안전한 저장 경로 해석 (loras 폴더 하위로 샌드박스)
#   클라이언트가 보낸 save_path 를 loras 디렉터리 기준 상대경로로만 허용.
#   path traversal / 절대경로 / 다른 드라이브는 차단한다.
# ─────────────────────────────────────────────

def _default_loras_base():
    """현재 ComfyUI 설치 폴더의 models/loras 절대경로. (extra_model_paths 무시)"""
    models_dir = getattr(folder_paths, "models_dir", None)
    if models_dir:
        return os.path.realpath(os.path.join(models_dir, "loras"))
    # 오래된 버전 폴백: 기본 loras 루트 첫 항목
    roots = folder_paths.get_folder_paths("loras") or []
    return os.path.realpath(roots[0]) if roots else None


def _resolve_lora_save_path(save_path: str):
    """정상 시 (abs_path, None), 문제 시 (None, error_msg).

    보안/예측성: extra_model_paths 로 연결된 외부 드라이브가 아니라
    '지금 실행 중인 ComfyUI 설치 폴더의 models/loras' 를 항상 기준으로 사용.
    그 안에서만 서브폴더 생성 + 파일 저장을 허용한다.
    """
    if not save_path or "\x00" in save_path:
        return None, "save_path is required"

    base = _default_loras_base()
    if not base:
        return None, "No loras directory configured"
    os.makedirs(base, exist_ok=True)

    # 기준(models/loras) 상대경로로 강제: 앞쪽 슬래시/역슬래시 제거
    rel = save_path.strip().replace("\\", "/").lstrip("/")
    if not rel:
        return None, "save_path is required"

    target = os.path.realpath(os.path.join(base, rel))
    # commonpath 로 prefix confusion 없이 샌드박스 검증
    try:
        if os.path.commonpath([base, target]) != base:
            return None, "Path traversal blocked (must be inside models/loras)"
    except ValueError:
        # 다른 드라이브 등 — 공통 경로 없음
        return None, "Path traversal blocked (must be inside models/loras)"

    if not target.lower().endswith(".safetensors"):
        target += ".safetensors"
    return target, None


# ─────────────────────────────────────────────
# API 엔드포인트 등록
# ─────────────────────────────────────────────

try:
    from aiohttp import web
    from server import PromptServer
    import comfy.utils

    # ── POST /krea2analyzer/analyze ─────────────
    @PromptServer.instance.routes.post("/krea2analyzer/analyze")
    async def krea2_analyze(request):
        """LoRA 파일 분석 → block_data JSON 반환"""
        try:
            data      = await request.json()
            lora_name = data.get("lora_name", "")
            full_path = folder_paths.get_full_path("loras", lora_name)
            if not full_path or not os.path.exists(full_path):
                return web.json_response({"error": f"LoRA not found: {lora_name}"}, status=400)

            lora_sd    = comfy.utils.load_torch_file(full_path)
            block_data = analyze_krea2_lora(lora_sd)
            return web.json_response({"status": "ok", "block_data": block_data})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    # ── POST /krea2analyzer/save_filtered ───────
    @PromptServer.instance.routes.post("/krea2analyzer/save_filtered")
    async def krea2_save_filtered(request):
        """필터링된 LoRA 저장 (loras 폴더 하위로만 허용)"""
        try:
            from safetensors.torch import save_file
            data         = await request.json()
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
            filtered = build_filtered_lora(lora_sd, block_config)

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
                    1 for i in range(TOTAL_BLOCKS)
                    if block_config.get(str(i), {}).get("enable", True)
                ),
            })
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    print("[TJ Krea2 Analyzer] API routes registered ✅")

except Exception as e:
    print(f"[TJ Krea2 Analyzer] API registration failed: {e}")


__all__ = [
    "Krea2LoRAAnalyzer",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
]
