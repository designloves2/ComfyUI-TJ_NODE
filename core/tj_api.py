# core/tj_api.py
# TJ_NODE 공용 API 라우트 - 파일 다운로드/업로드/삭제/목록 기능

import os
import socket
import ipaddress
import shutil
import hashlib
import urllib.request
import urllib.parse
import folder_paths
from aiohttp import web
from PIL import Image
import server

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tiff", ".tif"}


def _validate_download_url(url):
    """SSRF/로컬파일 방어: http(s)만 허용하고, 호스트가 사설/루프백/링크로컬로
    해석되면 거부한다. 문제가 있으면 사유 문자열을, 없으면 None을 반환한다."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return "Only http/https URLs are allowed."
    host = parsed.hostname
    if not host:
        return "URL has no host."
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:
        return "Could not resolve host."
    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            return "Access to internal/private addresses is blocked."
    return None

def _get_download_dir():
    d = os.path.join(folder_paths.get_input_directory(), "download")
    os.makedirs(d, exist_ok=True)
    return d

def _resolve_base_dir(dir_type):
    if dir_type == "download":
        return _get_download_dir()
    elif dir_type == "output":
        return folder_paths.get_output_directory()
    else:
        return folder_paths.get_input_directory()

def _safe_resolve(base_dir, subfolder):
    if subfolder:
        target = os.path.realpath(os.path.join(base_dir, subfolder))
        real_base = os.path.realpath(base_dir)
        # str.startswith prefix confusion 방지 — commonpath 사용
        try:
            if os.path.commonpath([real_base, target]) != real_base:
                return None
        except ValueError:
            return None
        return target
    return base_dir

@server.PromptServer.instance.routes.post("/tj_node/download_url")
async def download_url(request):
    try:
        data = await request.json()
        url = data.get("url", "").strip()
        if not url:
            return web.json_response({"success": False, "error": "No URL provided"})

        url_error = _validate_download_url(url)
        if url_error:
            return web.json_response({"success": False, "error": url_error})

        parsed = urllib.parse.urlparse(url)
        filename = os.path.basename(parsed.path) or "downloaded_image.png"
        filename = "".join(c for c in filename if c.isalnum() or c in "._-")
        if not filename:
            filename = "downloaded_image.png"

        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            filename += ".png"

        download_dir = _get_download_dir()
        dest = os.path.join(download_dir, filename)

        base, ext = os.path.splitext(filename)
        counter = 1
        while os.path.exists(dest):
            dest = os.path.join(download_dir, f"{base}_{counter}{ext}")
            counter += 1

        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            with open(dest, "wb") as f:
                shutil.copyfileobj(resp, f)

        rel_path = "input/download/" + os.path.basename(dest)
        return web.json_response({"success": True, "path": rel_path, "filename": os.path.basename(dest)})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})

@server.PromptServer.instance.routes.post("/tj_node/list_dir_files")
async def list_dir_files(request):
    try:
        data = await request.json()
        dir_type = data.get("dir_type", "input")
        subfolder = data.get("subfolder", "")

        base_dir = _resolve_base_dir(dir_type)
        target_dir = _safe_resolve(base_dir, subfolder)

        if target_dir is None:
            return web.json_response({"success": False, "error": "Invalid subfolder path"})

        if not os.path.isdir(target_dir):
            # exists=False 로 폴더가 사라졌음을 알려 프론트가 죽은 북마크를 정리할 수 있게 한다.
            return web.json_response({"success": True, "files": [], "folders": [], "exists": False})

        folders = []
        files = []

        for entry in sorted(os.listdir(target_dir)):
            full_path = os.path.join(target_dir, entry)
            if os.path.isdir(full_path):
                folder_rel = (subfolder.rstrip("/") + "/" + entry) if subfolder else entry
                # 폴더도 파일과 동일한 정렬 기준(시간)을 쓸 수 있도록 mtime 을 함께 내려준다.
                try:
                    fmtime = os.stat(full_path).st_mtime
                except OSError:
                    fmtime = 0
                folders.append({"name": entry, "subfolder": folder_rel, "mtime": fmtime})
            else:
                ext = os.path.splitext(entry)[1].lower()
                if ext in ALLOWED_EXTENSIONS:
                    if dir_type == "download":
                        prefix = "input/download/"
                    elif dir_type == "output":
                        prefix = "output/"
                    else:
                        prefix = "input/"
                    rel = (prefix + subfolder.rstrip("/") + "/" + entry) if subfolder else (prefix + entry)
                    # 정렬용 메타데이터(수정시각/크기/확장자)를 함께 내려준다.
                    try:
                        st = os.stat(full_path)
                        mtime, size = st.st_mtime, st.st_size
                    except OSError:
                        mtime, size = 0, 0
                    files.append({"filename": entry, "path": rel,
                                  "mtime": mtime, "size": size, "ext": ext.lstrip(".")})

        return web.json_response({"success": True, "files": files, "folders": folders, "exists": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})


# ──────────────────────────────────────────────────────────────────────────
# 썸네일 캐시 (Multi Image Loader 파일 피커 전용)
#   /view 는 원본 파일을 그대로 서빙한다(리사이즈 없음). 그래서 그리드에 80px
#   짜리로 그릴 이미지도 매번 전체 원본을 내려받았고, 프론트가 매 렌더마다
#   t=Date.now() 캐시버스터를 붙여 브라우저 캐시도 못 썼다(정렬만 바꿔도
#   폴더 전체를 재다운로드) — 원격/고지연 환경에서 체감 프리즈의 실제 원인.
#   여기서는 실제로 작게 리사이즈한 JPEG 을 (경로+수정시각+크기) 로 디스크에
#   캐시해, 한 번만 인코딩하고 이후엔 즉시 읽어서 돌려준다.
# ──────────────────────────────────────────────────────────────────────────
THUMB_CACHE_DIRNAME = "tj_thumbnails"
THUMB_DEFAULT_SIZE = 96
THUMB_MAX_FILES = 8000
THUMB_MAX_BYTES = 300 * 1024 * 1024   # 300MB — 썸네일은 몇 KB 라 넉넉히


def _thumb_cache_dir():
    d = os.path.join(folder_paths.get_temp_directory(), THUMB_CACHE_DIRNAME)
    os.makedirs(d, exist_ok=True)
    return d


def _prune_thumb_cache(cache_dir):
    try:
        entries = []
        total = 0
        for f in os.listdir(cache_dir):
            p = os.path.join(cache_dir, f)
            if os.path.isfile(p):
                st = os.stat(p)
                entries.append((st.st_mtime, st.st_size, p))
                total += st.st_size
        if len(entries) <= THUMB_MAX_FILES and total <= THUMB_MAX_BYTES:
            return
        entries.sort()  # 오래된 것부터
        i = 0
        while entries and (len(entries) - i > THUMB_MAX_FILES or total > THUMB_MAX_BYTES) and i < len(entries) - 1:
            _, size, path = entries[i]
            try:
                os.remove(path)
                total -= size
            except Exception:
                pass
            i += 1
    except Exception:
        pass


@server.PromptServer.instance.routes.get("/tj_node/thumbnail")
async def tj_thumbnail(request):
    """(dir_type, subfolder, filename) 이미지의 축소 썸네일을 반환/캐시한다.
    list_dir_files 와 동일한 샌드박스 헬퍼로 경로를 해석하므로 안전 속성이 같다."""
    try:
        q = request.rel_url.query
        dir_type = q.get("dir_type", "input")
        subfolder = q.get("subfolder", "")
        filename = os.path.basename(q.get("filename", ""))  # 경로 조작 방지: 파일명만 사용
        try:
            size = max(32, min(256, int(q.get("size", THUMB_DEFAULT_SIZE))))
        except ValueError:
            size = THUMB_DEFAULT_SIZE

        if not filename:
            return web.Response(status=400, text="filename required")

        base_dir = _resolve_base_dir(dir_type)
        target_dir = _safe_resolve(base_dir, subfolder)
        if target_dir is None:
            return web.Response(status=400, text="Invalid subfolder path")

        src_path = os.path.join(target_dir, filename)
        real_target_dir = os.path.realpath(target_dir)
        real_src = os.path.realpath(src_path)
        try:
            if os.path.commonpath([real_target_dir, real_src]) != real_target_dir:
                return web.Response(status=403, text="Path traversal blocked")
        except ValueError:
            return web.Response(status=403, text="Path traversal blocked")

        if not os.path.isfile(real_src):
            return web.Response(status=404, text="File not found")
        ext = os.path.splitext(real_src)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return web.Response(status=403, text="Not an allowed image file")

        try:
            mtime = int(os.path.getmtime(real_src))
        except OSError:
            mtime = 0

        cache_dir = _thumb_cache_dir()
        key = hashlib.sha1(f"{real_src}|{mtime}|{size}".encode("utf-8")).hexdigest()[:24]
        cache_path = os.path.join(cache_dir, f"{key}.jpg")

        if not os.path.isfile(cache_path):
            with Image.open(real_src) as img:
                img = img.convert("RGB")
                img.thumbnail((size, size), Image.LANCZOS)
                img.save(cache_path, format="JPEG", quality=80)
            _prune_thumb_cache(cache_dir)

        with open(cache_path, "rb") as f:
            data = f.read()
        # 파일명에 mtime 이 들어간 캐시 키라 내용이 바뀌면 키도 바뀐다 —
        # 브라우저에 영구 캐시를 지시해도 안전하다.
        return web.Response(body=data, content_type="image/jpeg",
                            headers={"Cache-Control": "public, max-age=31536000, immutable"})
    except Exception as e:
        return web.Response(status=500, text=str(e))


@server.PromptServer.instance.routes.post("/tj_node/delete_files")
async def delete_files(request):
    try:
        data = await request.json()
        paths = data.get("paths", [])
        if not paths:
            return web.json_response({"success": False, "error": "No paths provided"})

        deleted = []
        errors = []

        for rel_path in paths:
            rel_path = rel_path.strip()
            if not rel_path:
                continue
            if rel_path.startswith("output/"):
                base = folder_paths.get_output_directory()
                file_rel = rel_path[len("output/"):]
            elif rel_path.startswith("input/"):
                base = folder_paths.get_input_directory()
                file_rel = rel_path[len("input/"):]
            else:
                errors.append({"path": rel_path, "error": "Unknown path prefix"})
                continue

            abs_path = os.path.realpath(os.path.join(base, file_rel))
            real_base = os.path.realpath(base)
            # str.startswith prefix confusion 방지 — commonpath 사용
            try:
                contained = os.path.commonpath([real_base, abs_path]) == real_base
            except ValueError:
                contained = False
            if not contained:
                errors.append({"path": rel_path, "error": "Path traversal blocked"})
                continue
            if not os.path.isfile(abs_path):
                errors.append({"path": rel_path, "error": "File not found"})
                continue
            ext = os.path.splitext(abs_path)[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                errors.append({"path": rel_path, "error": "Not an allowed image file"})
                continue
            try:
                os.remove(abs_path)
                deleted.append(rel_path)
            except Exception as e:
                errors.append({"path": rel_path, "error": str(e)})

        return web.json_response({
            "success": True,
            "deleted": deleted,
            "deleted_count": len(deleted),
            "errors": errors,
        })
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})

@server.PromptServer.instance.routes.post("/tj_node/upload_local")
async def upload_local(request):
    try:
        reader = await request.multipart()
        field = await reader.next()
        if field is None:
            return web.json_response({"success": False, "error": "No file uploaded"})

        filename = field.filename or "uploaded_image.png"
        filename = "".join(c for c in filename if c.isalnum() or c in "._-")
        if not filename:
            filename = "uploaded_image.png"

        # 이미지 파일만 허용 (확장자 화이트리스트). 비-이미지는 저장하지 않는다.
        if os.path.splitext(filename)[1].lower() not in ALLOWED_EXTENSIONS:
            return web.json_response({"success": False, "error": "Only image files are allowed"})

        input_dir = folder_paths.get_input_directory()
        dest = os.path.join(input_dir, filename)

        base, ext = os.path.splitext(filename)
        counter = 1
        while os.path.exists(dest):
            dest = os.path.join(input_dir, f"{base}_{counter}{ext}")
            counter += 1

        with open(dest, "wb") as f:
            while True:
                chunk = await field.read_chunk()
                if not chunk:
                    break
                f.write(chunk)

        rel_path = "input/" + os.path.basename(dest)
        return web.json_response({"success": True, "path": rel_path, "filename": os.path.basename(dest)})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})


# ──────────────────────────────────────────────────────────────────────────
# Video Grid Comparer (TJ) 전용 라우트
#   - 임의 로컬 폴더의 비디오 파일 목록 조회 및 개별 파일 스트리밍
#   - Registry/Fake-Wire 와 무관한 독립 뷰어 노드용
# ──────────────────────────────────────────────────────────────────────────
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v", ".gif"}


def _vgc_is_video(path):
    return os.path.splitext(path)[1].lower() in VIDEO_EXTENSIONS


def _vgc_is_loopback(host):
    """host 문자열이 루프백 주소인지 판정. IPv4-mapped IPv6(::ffff:127.x)도 처리."""
    if not host:
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        ip = mapped
    return ip.is_loopback


def _vgc_local_only(request):
    """외부/LAN 접근 차단.

    이 노드는 서버 로컬 디스크의 임의 영상 파일을 다루므로, 기본적으로
    루프백(127.0.0.0/8, ::1) 요청만 허용한다. ComfyUI 가 0.0.0.0 으로
    바인딩돼 있어도 외부/다른 기기에서는 이 라우트에 접근할 수 없다.

    LAN 등 신뢰된 원격에서 의도적으로 열려면 TJ_VGC_ALLOW_REMOTE=1 을 설정한다
    (사용자가 명시적으로 위험을 감수하는 옵트인).

    허용 시 None, 차단 시 aiohttp 응답 객체를 반환한다."""
    if os.environ.get("TJ_VGC_ALLOW_REMOTE", "").strip().lower() in ("1", "true", "yes", "on"):
        return None
    if _vgc_is_loopback(request.remote):
        return None
    return web.json_response(
        {"success": False, "error": "Local (loopback) requests only. "
         "Set TJ_VGC_ALLOW_REMOTE=1 to allow trusted remote access."},
        status=403,
    )


def _vgc_allowed_roots():
    """선택적 잠금장치.

    환경변수 TJ_VGC_ALLOWED_ROOTS(os.pathsep 구분)가 설정되면 조회/서빙을 해당
    루트 하위로만 제한한다. 미설정 시 None 을 반환하며 임의 로컬 경로를 허용한다
    (순수 로컬 뷰어 기본 동작). 네트워크에 노출된 배포에서는 이 변수를 설정해
    영상 파일 열람 범위를 제한하는 것을 권장한다."""
    raw = os.environ.get("TJ_VGC_ALLOWED_ROOTS", "").strip()
    if not raw:
        return None
    roots = []
    for p in raw.split(os.pathsep):
        p = p.strip()
        if p:
            roots.append(os.path.realpath(p))
    return roots or None


def _vgc_check_path(target_real):
    """정규화된 실경로를 검증한다. 문제 시 사유 문자열, 정상 시 None 반환."""
    # NUL 바이트 등 제어문자 차단 (경로 인젝션 방어)
    if "\x00" in target_real:
        return "Invalid path"
    roots = _vgc_allowed_roots()
    if roots is None:
        return None
    for root in roots:
        try:
            if os.path.commonpath([root, target_real]) == root:
                return None
        except ValueError:
            continue  # 다른 드라이브 등 — 공통 경로 없음
    return "Path is outside the allowed roots (TJ_VGC_ALLOWED_ROOTS)"


def _vgc_base_dir(base):
    if base == "input":
        return folder_paths.get_input_directory()
    if base == "temp":
        return folder_paths.get_temp_directory()
    return folder_paths.get_output_directory()


@server.PromptServer.instance.routes.post("/tj_node/vgc/browse")
async def vgc_browse(request):
    """ComfyUI output/input/temp 디렉터리 내부를 안전하게 탐색한다.

    임의 경로가 아닌 ComfyUI 관리 디렉터리 하위로만 제한되므로(commonpath 샌드박스)
    루프백 제약 없이 사용할 수 있고, 서빙은 ComfyUI 내장 /view 라우트를 쓴다."""
    try:
        data = await request.json()
        base = data.get("base", "output")
        if base not in ("output", "input", "temp"):
            base = "output"
        subfolder = (data.get("subfolder") or "").strip().replace("\\", "/")
        if "\x00" in subfolder:
            return web.json_response({"success": False, "error": "Invalid subfolder"})

        base_dir = _vgc_base_dir(base)
        target = _safe_resolve(base_dir, subfolder)
        if target is None:
            return web.json_response({"success": False, "error": "Invalid subfolder path"})
        if not os.path.isdir(target):
            return web.json_response({"success": True, "base": base, "subfolder": subfolder,
                                      "folders": [], "files": []})

        folders, files = [], []
        for entry in sorted(os.listdir(target), key=str.lower):
            full = os.path.join(target, entry)
            if os.path.isdir(full):
                sub = (subfolder.rstrip("/") + "/" + entry) if subfolder else entry
                folders.append({"name": entry, "subfolder": sub})
            elif os.path.isfile(full) and _vgc_is_video(entry):
                try:
                    size = os.path.getsize(full)
                except OSError:
                    size = 0
                files.append({"filename": entry, "subfolder": subfolder, "type": base,
                              "path": full, "size": size})

        return web.json_response({"success": True, "base": base, "subfolder": subfolder,
                                  "folders": folders, "files": files})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})


@server.PromptServer.instance.routes.post("/tj_node/vgc/list_videos")
async def vgc_list_videos(request):
    """주어진 폴더 경로의 비디오 파일 목록을 반환한다."""
    try:
        blocked = _vgc_local_only(request)
        if blocked is not None:
            return blocked
        data = await request.json()
        folder = (data.get("folder") or "").strip()
        if not folder or "\x00" in folder:
            return web.json_response({"success": False, "error": "No folder provided"})

        folder_real = os.path.realpath(folder)
        path_error = _vgc_check_path(folder_real)
        if path_error:
            return web.json_response({"success": False, "error": path_error})
        if not os.path.isdir(folder_real):
            return web.json_response({"success": False, "error": "Folder not found"})

        files = []
        for entry in sorted(os.listdir(folder_real)):
            full = os.path.join(folder_real, entry)
            if os.path.isfile(full) and _vgc_is_video(entry):
                try:
                    size = os.path.getsize(full)
                except OSError:
                    size = 0
                files.append({"filename": entry, "path": full, "size": size})

        return web.json_response({"success": True, "folder": folder_real, "files": files})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})


@server.PromptServer.instance.routes.get("/tj_node/vgc/video")
async def vgc_video(request):
    """임의 로컬 비디오 파일을 Range 지원과 함께 스트리밍한다.

    비디오 확장자를 가진 실존 파일만 허용한다(로컬 뷰어 노드 전용)."""
    try:
        blocked = _vgc_local_only(request)
        if blocked is not None:
            return web.Response(status=403, text="Local (loopback) requests only")
        raw = request.rel_url.query.get("path", "")
        if not raw or "\x00" in raw:
            return web.Response(status=400, text="No path provided")

        target = os.path.realpath(raw)
        # 확장자 화이트리스트를 먼저 확인해 비-영상 파일 존재/내용 노출을 차단한다.
        if not _vgc_is_video(target):
            return web.Response(status=403, text="Not an allowed video file")
        if _vgc_check_path(target):
            return web.Response(status=403, text="Path is outside the allowed roots")
        if not os.path.isfile(target):
            return web.Response(status=404, text="File not found")

        # web.FileResponse 는 HTTP Range 요청(시크/동시 재생)을 자동 처리한다.
        return web.FileResponse(target)
    except Exception as e:
        return web.Response(status=500, text=str(e))
