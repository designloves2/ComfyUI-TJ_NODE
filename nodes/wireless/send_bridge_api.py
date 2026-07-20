"""
TJ_NODE - Send Bridge 공용 레지스트리 + API

Send (TJ) → Send Point (TJ) 로 '값만' 복사하는 브리지.
그래프상 두 노드는 서로를 참조하지 않으므로 큐 실행이 완전히 분리된다.
  - Send 실행      : SENDER_CACHE[자기 id] = 값
  - 버튼 클릭      : API 가 SENDER_CACHE → GET_REGISTRY[포인트 id] 로 복사
  - Send Point 실행: 자기 저장값만 읽음 (Send 를 참조하지 않음)

보안 note:
  sender_id/get_id/ref 는 모두 클라이언트(워크플로우 JSON 포함)에서 오는 값이라
  신뢰하지 않는다. 파일명으로 쓰기 전에 정규화하고, 최종 경로는 realpath +
  commonpath 로 허용 루트 내부인지 검증한다.
"""

import hashlib
import os
import re
import time

import numpy as np
import torch
from PIL import Image
import folder_paths

from ..utility._utility_utils import _tj_resolve_media_path

# sender_node_id(str) -> 마지막 실행 결과값 (세션 메모리)
SENDER_CACHE = {}

# send_point_id(str) -> {"kind", "ref"/"value", "source_label", "ts"}
# (이미지 참조는 Send Point 위젯에도 저장되어 재시작 후에도 유지된다)
GET_REGISTRY = {}

BRIDGE_DIRNAME = "tj_send_bridge"

_UNSAFE_TOKEN = re.compile(r"[^A-Za-z0-9_-]")

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"}
VIDEO_EXTS = {".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v", ".gif"}


def media_kind_of(path):
    """확장자로 image / video 판별. 둘 다 아니면 None."""
    ext = os.path.splitext(str(path))[1].lower()
    if ext in VIDEO_EXTS:
        return "video"
    if ext in IMAGE_EXTS:
        return "image"
    return None


def bridge_dir():
    """이미지 영구 보관 폴더. temp 는 ComfyUI 가 시작 시 삭제하므로 output 하위를 쓴다."""
    d = os.path.join(folder_paths.get_output_directory(), BRIDGE_DIRNAME)
    os.makedirs(d, exist_ok=True)
    return d


def _safe_token(value, limit=64):
    """클라이언트 값(node id 등)을 파일명에 넣기 전 정규화."""
    token = _UNSAFE_TOKEN.sub("_", str(value))[:limit]
    return token or "x"


def _contained(path, root):
    """realpath 기준으로 path 가 root 내부인지 (심볼릭 링크 우회 방지)."""
    try:
        rp = os.path.realpath(path)
        rr = os.path.realpath(root)
        return os.path.commonpath([rr, rp]) == rr
    except Exception:
        return False


def resolve_image_ref(ref):
    """저장된 참조 → 실제 파일 경로. 허용 범위 밖이면 None.

    1) 구분자 없는 순수 파일명 → 브리지 폴더 내부에서만 해석
    2) 그 외(저장 노드 결과물 경로 등) → input/output/temp 루트 내부만 허용
    """
    if not ref or not isinstance(ref, str) or "\x00" in ref:
        return None
    ref = ref.strip().strip("\"'")
    if not ref:
        return None

    # 1) 브리지 폴더의 순수 파일명
    if not any(sep in ref for sep in ("/", "\\")) and ref not in (".", ".."):
        base = bridge_dir()
        cand = os.path.join(base, ref)
        if _contained(cand, base) and os.path.isfile(cand):
            return os.path.realpath(cand)
        # 브리지 폴더에 없으면 아래의 루트 내부 탐색으로 넘어간다
        # (저장 노드 결과물이 output/ 등에 있는 경우)

    # 2) 알려진 루트 내부 경로 (검증된 공용 헬퍼 재사용)
    resolved = _tj_resolve_media_path(ref)
    if resolved and os.path.isfile(resolved):
        return resolved
    return None


MAX_BRIDGE_FILES = 500
MAX_BRIDGE_BYTES = 1024 * 1024 * 1024      # 1 GB


def _prune_bridge_dir(base, keep=MAX_BRIDGE_FILES, max_bytes=MAX_BRIDGE_BYTES):
    """브리지 폴더를 오래된 파일부터 정리한다.

    개수만으로는 용량을 보장할 수 없어(고해상도 PNG 는 장당 수 MB) **총 용량**도
    함께 상한을 둔다. 방금 저장한 최신 파일은 항상 남긴다.
    (영상은 원본을 참조만 하므로 이 폴더에 쌓이지 않는다 — 이미지 캐시 전용)
    """
    try:
        entries = []
        for f in os.listdir(base):
            p = os.path.join(base, f)
            if os.path.isfile(p):
                st = os.stat(p)
                entries.append((st.st_mtime, st.st_size, p))
    except Exception:
        return

    entries.sort()                                  # 오래된 것부터
    total = sum(size for _, size, _ in entries)
    idx = 0
    last = len(entries) - 1                         # 최신 1개는 보존
    while idx < last and (len(entries) - idx > keep or total > max_bytes):
        _, size, path = entries[idx]
        try:
            os.remove(path)
            total -= size
        except Exception:
            pass
        idx += 1


def _tensor_to_bridge_file(tensor, sender_id=None):
    """이미지 텐서를 브리지 폴더에 PNG 로 저장하고 '파일명'만 반환.

    파일명은 내용 해시(content-addressed)로 만든다:
      - 같은 이미지를 여러 번 보내도 파일이 재사용되어 중복 저장이 없다
      - 파일명에 클라이언트 입력(sender_id 등)이 전혀 들어가지 않아
        경로 조작 여지가 원천적으로 사라진다
    """
    img_tensor = tensor[0] if tensor.dim() == 4 else tensor
    arr = (255.0 * img_tensor.detach().cpu().numpy()).clip(0, 255).astype(np.uint8)

    digest = hashlib.sha1(arr.tobytes()).hexdigest()[:16]
    base = bridge_dir()
    filename = f"send_{digest}.png"
    path = os.path.join(base, filename)

    # 최종 경로가 브리지 폴더 내부인지 반드시 재확인
    if not _contained(path, base):
        raise ValueError("Send Bridge: refused to write outside the bridge folder")

    if not os.path.exists(path):          # 동일 내용이면 기존 파일 재사용
        Image.fromarray(arr).save(path)
        _prune_bridge_dir(base)
    return filename


def view_params(ref):
    """참조 → ComfyUI /view 로 미리보기할 파라미터.

    절대경로 대신 (filename, subfolder, type) 만 돌려주므로 경로 노출이 없다.
    허용 루트 밖이면 None.
    """
    path = resolve_image_ref(ref)
    if not path:
        return None
    roots = (
        ("output", folder_paths.get_output_directory()),
        ("input", folder_paths.get_input_directory()),
        ("temp", folder_paths.get_temp_directory()),
    )
    for kind, root in roots:
        try:
            rr = os.path.realpath(root)
            if os.path.commonpath([rr, path]) != rr:
                continue
            rel = os.path.relpath(path, rr)
        except ValueError:
            continue
        subfolder = os.path.dirname(rel).replace("\\", "/")
        return {
            "filename": os.path.basename(rel),
            "subfolder": subfolder,
            "type": kind,
        }
    return None


def fast_video_source(value):
    """VIDEO 객체에서 '디코딩 없이' 파일 경로만 싸게 얻는다.

    주의: 범용 탐색기(_tj_find_video_path)는 get_components()/get_metadata() 같은
    메서드까지 호출하는데, ComfyUI VideoFromFile 에서 get_components() 는 영상 전체를
    디코딩해 매우 느리다. 여기서는 경로만 돌려주는 값싼 경로만 사용한다.
    """
    if value is None or isinstance(value, (str, bytes)):
        return value if isinstance(value, str) else None

    # 1) 공식 API: 경로(또는 BytesIO)를 그대로 반환 — 디코딩 없음
    try:
        fn = getattr(value, "get_stream_source", None)
        if callable(fn):
            src = fn()
            if isinstance(src, str):
                return src
    except Exception:
        pass

    # 2) 값싼 속성들 (VideoFromFile.__file 은 네임 맹글링됨)
    for attr in ("_VideoFromFile__file", "_file", "file", "path", "video_path",
                 "filename", "filepath", "file_path", "_path", "src"):
        try:
            v = getattr(value, attr, None)
            if isinstance(v, str) and v:
                return v
        except Exception:
            continue

    # 3) dict 형태(VHS 등)
    if isinstance(value, dict):
        for k in ("path", "video_path", "filename", "file", "full_path", "filepath"):
            v = value.get(k)
            if isinstance(v, str) and v:
                return v
    return None


def to_relative_ref(path):
    """절대경로 → 루트 기준 상대 ref. 워크플로우에 절대경로가 남지 않게 한다."""
    if not path:
        return None
    for root in (folder_paths.get_output_directory(),
                 folder_paths.get_input_directory(),
                 folder_paths.get_temp_directory()):
        try:
            rr = os.path.realpath(root)
            rp = os.path.realpath(path)
            if os.path.commonpath([rr, rp]) == rr:
                return os.path.relpath(rp, rr).replace("\\", "/")
        except ValueError:
            continue
    return None


def type_label(value):
    """전달된 값의 사람이 읽을 수 있는 타입 라벨 (UI 표시용)."""
    try:
        if torch.is_tensor(value):
            if value.dim() in (3, 4) and value.shape[-1] in (1, 3, 4):
                return "IMAGE"
            if value.dim() in (2, 3):
                return "MASK"
            return f"TENSOR{tuple(value.shape)}"
    except Exception:
        pass
    if isinstance(value, dict):
        if "samples" in value:
            return "LATENT"
        return "DICT"
    if isinstance(value, bool):
        return "BOOLEAN"
    if isinstance(value, str):
        return "STRING"
    if isinstance(value, int):
        return "INT"
    if isinstance(value, float):
        return "FLOAT"
    if isinstance(value, (list, tuple)):
        return f"{type(value).__name__.upper()}[{len(value)}]"
    return type(value).__name__.upper()


def store_sender_cache(sender_id, value):
    SENDER_CACHE[str(sender_id)] = value


def build_entry(sender_id, source_label):
    """SENDER_CACHE 의 값 → Send Point 에 저장할 엔트리. 없으면 None."""
    value = SENDER_CACHE.get(str(sender_id))
    if value is None:
        return None

    tlabel = type_label(value)
    now = time.time()

    if torch.is_tensor(value) and tlabel == "IMAGE":
        return {
            "kind": "image_path",
            "ref": _tensor_to_bridge_file(value, sender_id),
            "type_label": tlabel,
            "source_label": source_label,
            "ts": now,
        }

    if isinstance(value, str):
        # 저장 노드를 거친 결과물(경로) → 허용 루트 내부일 때만 참조로 사용
        resolved = _tj_resolve_media_path(value)
        if resolved and os.path.isfile(resolved):
            mk = media_kind_of(resolved)
            if mk in ("video", "image"):
                return {
                    "kind": "video_path" if mk == "video" else "image_path",
                    "ref": to_relative_ref(resolved) or value,
                    "type_label": "VIDEO" if mk == "video" else "IMAGE",
                    "source_label": source_label,
                    "ts": now,
                }
        # 경로가 아닌 일반 문자열 → 직렬화 가능하므로 영구 보관
        return {
            "kind": "text",
            "text": value,
            "type_label": "STRING",
            "source_label": source_label,
            "ts": now,
        }

    # VIDEO 객체(ComfyUI VIDEO / VHS 등) → 디코딩 없이 경로만 싸게 추출
    vpath = None
    try:
        raw = fast_video_source(value)
        if raw:
            vpath = _tj_resolve_media_path(raw)   # 허용 루트 내부인지 검증
    except Exception:
        vpath = None
    if vpath and os.path.isfile(vpath):
        mk = media_kind_of(vpath)
        if mk in ("video", "image"):
            return {
                "kind": "video_path" if mk == "video" else "image_path",
                "ref": to_relative_ref(vpath) or vpath,
                "type_label": "VIDEO" if mk == "video" else "IMAGE",
                "source_label": source_label,
                "ts": now,
            }

    # 그 외 타입(latent 등)은 직렬화하지 않고 세션 메모리에만 보관
    return {
        "kind": "raw",
        "value": value,
        "type_label": tlabel,
        "source_label": source_label,
        "ts": now,
    }


# ─────────────────────────────────────────────
# API 라우트 (등록 실패가 노드 로딩을 막지 않도록 가드)
# ─────────────────────────────────────────────
_ROUTES_REGISTERED = False

try:
    from aiohttp import web
    from server import PromptServer

    if not _ROUTES_REGISTERED:

        @PromptServer.instance.routes.post("/tj_send_bridge/send")
        async def tj_send_bridge_send(request):
            try:
                data = await request.json()
            except Exception:
                return web.json_response({"ok": False, "error": "bad_request"}, status=400)

            sender_id = str(data.get("sender_id", ""))
            get_id = str(data.get("get_id", ""))
            source_label = str(data.get("source_label", "Send (TJ)"))[:120]

            if not sender_id or not get_id:
                return web.json_response({"ok": False, "error": "missing_id"}, status=400)

            try:
                entry = build_entry(sender_id, source_label)
            except Exception as e:
                return web.json_response({"ok": False, "error": str(e)}, status=500)

            if entry is None:
                return web.json_response({"ok": False, "error": "no_cached_value"})

            GET_REGISTRY[get_id] = entry
            # 절대경로는 응답에 넣지 않는다 (파일시스템 정보 노출 방지).
            # ref 는 브리지 폴더 기준 파일명이거나 이미 허용된 상대/루트 내부 경로.
            kind = entry["kind"]
            is_media = kind in ("image_path", "video_path")
            return web.json_response({
                "ok": True,
                "kind": kind,
                "ref": entry.get("ref", ""),
                "text": entry.get("text", ""),
                "type_label": entry.get("type_label", ""),
                # 재시작 후에도 기억 가능한 종류인지 (raw=latent 등은 세션 한정)
                "persistent": kind in ("image_path", "video_path", "text"),
                "source_label": source_label,
                # 미리보기용 (/view?filename=..&subfolder=..&type=..)
                "view": view_params(entry.get("ref")) if is_media else None,
            })

        @PromptServer.instance.routes.get("/tj_send_bridge/view_params")
        async def tj_send_bridge_view_params(request):
            """워크플로우를 다시 열었을 때 저장된 ref 로 미리보기를 복원하기 위한 조회."""
            ref = request.rel_url.query.get("ref", "")
            return web.json_response({"ok": True, "view": view_params(ref)})

        _ROUTES_REGISTERED = True
        print("[TJ Send Bridge] API route registered ✅")

except Exception as e:  # pragma: no cover
    print(f"[TJ Send Bridge] API registration failed: {e}")
