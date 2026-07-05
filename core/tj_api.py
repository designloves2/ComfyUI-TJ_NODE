# core/tj_api.py
# TJ_NODE 공용 API 라우트 - 파일 다운로드/업로드/삭제/목록 기능

import os
import shutil
import urllib.request
import urllib.parse
import folder_paths
from aiohttp import web
import server

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tiff", ".tif"}

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
            return web.json_response({"success": True, "files": [], "folders": []})

        folders = []
        files = []

        for entry in sorted(os.listdir(target_dir)):
            full_path = os.path.join(target_dir, entry)
            if os.path.isdir(full_path):
                folder_rel = (subfolder.rstrip("/") + "/" + entry) if subfolder else entry
                folders.append({"name": entry, "subfolder": folder_rel})
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
                    files.append({"filename": entry, "path": rel})

        return web.json_response({"success": True, "files": files, "folders": folders})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})

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
