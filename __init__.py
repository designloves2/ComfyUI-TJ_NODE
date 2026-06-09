# __init__.py

import os
import json
import shutil
import urllib.request
import urllib.parse
import folder_paths
from aiohttp import web
import server

from .multi_image_load import TJ_MultiImageLoader
from .multi_router import TJ_MultiRouter
from .dynamic_image_batch import (
    DynamicImageBatch,
    TJ_SaveImage_Primary,
    TJ_SaveImage_Subsequent,
    DynamicImageBatchEclipse,
    TJ_SaveImage_EclipseSubsequent,
    TJ_BatchToMultiOutput,
)

# ====== 무선 패러다임 Set/Get 노드 임포트 ======
from .set_getnode_tj import TJ_SetNode, TJ_GetNode, TJ_MultiGetNode

# ====== 신규 유틸리티 노드 임포트 ======
from .utility_node_tj import (
    TJ_SaveAndPreviewImage,
    TJ_PromptText,
    TJ_TextConcatenate,
    TJ_SmartShow,
    TJ_SaveAndPreviewVideo
)

# ====== 신규 노드 임포트 ======

from .showany_tj import TJ_ShowAny
from .smart_converter_tj import TJ_SmartConverter
from .shortcut_launcher import TJShortcutLauncher

# ──────────── Node Mappings ────────────
NODE_CLASS_MAPPINGS = {
    "TJ_MultiImageLoader": TJ_MultiImageLoader,
    "DynamicImageBatch": DynamicImageBatch,
    "TJ_SaveImage_Primary": TJ_SaveImage_Primary,
    "TJ_SaveImage_Subsequent": TJ_SaveImage_Subsequent,
    "DynamicImageBatchEclipse": DynamicImageBatchEclipse,
    "TJ_SaveImage_EclipseSubsequent": TJ_SaveImage_EclipseSubsequent,
    "TJ_BatchToMultiOutput": TJ_BatchToMultiOutput,
    "TJ_MultiRouter": TJ_MultiRouter,
    "TJ_SetNode": TJ_SetNode,
    "TJ_GetNode": TJ_GetNode,
    "TJ_MultiGetNode": TJ_MultiGetNode,
    
    # Utilities
    "TJ_SaveAndPreviewImage": TJ_SaveAndPreviewImage,
    "TJ_PromptText": TJ_PromptText,
    "TJ_TextConcatenate": TJ_TextConcatenate,
    "TJ_SmartShow": TJ_SmartShow,
    "TJ_SaveAndPreviewVideo": TJ_SaveAndPreviewVideo,
    "TJ_ShowAny": TJ_ShowAny,
    "TJ_SmartConverter": TJ_SmartConverter,
    "TJShortcutLauncher": TJShortcutLauncher,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TJ_MultiImageLoader": "Multi Image Loader (TJ)",
    "DynamicImageBatch": "Dynamic Image Batch(TJ)",
    "TJ_SaveImage_Primary": "Save Image(Primary-TJ)",
    "TJ_SaveImage_Subsequent": "Save Image(Suffix-TJ)",
    "DynamicImageBatchEclipse": "Dynamic Image Batch(Eclipse-TJ)",
    "TJ_SaveImage_EclipseSubsequent": "Save Image(Eclipse Suffix-TJ)",
    "TJ_BatchToMultiOutput": "Batch to Multi Image Output(TJ)",
    "TJ_MultiRouter": "Multi Router(TJ)",
    "TJ_SetNode": "Set Node (TJ)",
    "TJ_GetNode": "Get Node (TJ)",
    "TJ_MultiGetNode": "Multi Get Node (TJ)",
    
    # Utilities
    "TJ_SaveAndPreviewImage": "Save & Preview Image (TJ)",
    "TJ_PromptText": "Prompt Text (TJ)",
    "TJ_TextConcatenate": "Text Concatenate (TJ)",
    "TJ_SmartShow": "Smart show (TJ)",
    "TJ_SaveAndPreviewVideo": "Save & Preview Video (TJ)",
    "TJ_ShowAny": "Show Any (TJ)",
    "TJ_SmartConverter": "Smart Converter (TJ)",
    "TJShortcutLauncher": "Shortcut Launcher (TJ)",
}

WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]


# ──────────── API Routes ────────────
# (이하 다운로드 및 파일 시스템 API는 기존과 100% 동일하게 유지)
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
        if not target.startswith(real_base):
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
                if subfolder:
                    folder_rel = subfolder.rstrip("/") + "/" + entry
                else:
                    folder_rel = entry
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

                    if subfolder:
                        rel = prefix + subfolder.rstrip("/") + "/" + entry
                    else:
                        rel = prefix + entry
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

            if not abs_path.startswith(real_base):
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