import os
import json
import shutil
import urllib.request
import urllib.parse
import folder_paths
from aiohttp import web
import server

from .multi_image_load import TJ_MultiImageLoader
from .dynamic_image_batch import (
    DynamicImageBatch,
    TJ_SaveImage_Primary,
    TJ_SaveImage_Subsequent,
    DynamicImageBatchEclipse,
    TJ_SaveImage_EclipseSubsequent,
    TJ_BatchToMultiOutput,
)

# ──────────── Node Mappings ────────────
NODE_CLASS_MAPPINGS = {
    "TJ_MultiImageLoader": TJ_MultiImageLoader,
    "DynamicImageBatch": DynamicImageBatch,
    "TJ_SaveImage_Primary": TJ_SaveImage_Primary,
    "TJ_SaveImage_Subsequent": TJ_SaveImage_Subsequent,
    "DynamicImageBatchEclipse": DynamicImageBatchEclipse,
    "TJ_SaveImage_EclipseSubsequent": TJ_SaveImage_EclipseSubsequent,
    "TJ_BatchToMultiOutput": TJ_BatchToMultiOutput,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TJ_MultiImageLoader": "Multi Image Loader (TJ)",
    "DynamicImageBatch": "Dynamic Image Batch(TJ)",
    "TJ_SaveImage_Primary": "Save Image(Primary-TJ)",
    "TJ_SaveImage_Subsequent": "Save Image(Suffix-TJ)",
    "DynamicImageBatchEclipse": "Dynamic Image Batch(Eclipse-TJ)",
    "TJ_SaveImage_EclipseSubsequent": "Save Image(Eclipse Suffix-TJ)",
    "TJ_BatchToMultiOutput": "Batch to Multi Image Output (TJ)",
}

WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

# ──────────── API Routes ────────────

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tiff", ".tif"}

def _get_download_dir():
    d = os.path.join(folder_paths.get_input_directory(), "download")
    os.makedirs(d, exist_ok=True)
    return d

# ── Download URL ──
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


# ── List directory files ──
@server.PromptServer.instance.routes.post("/tj_node/list_dir_files")
async def list_dir_files(request):
    try:
        data = await request.json()
        dir_type = data.get("dir_type", "input")

        if dir_type == "download":
            target_dir = _get_download_dir()
        elif dir_type == "output":
            target_dir = folder_paths.get_output_directory()
        else:
            target_dir = folder_paths.get_input_directory()

        if not os.path.isdir(target_dir):
            return web.json_response({"success": True, "files": []})

        files = []
        for fname in sorted(os.listdir(target_dir)):
            ext = os.path.splitext(fname)[1].lower()
            if ext in ALLOWED_EXTENSIONS:
                if dir_type == "download":
                    rel = "input/download/" + fname
                elif dir_type == "output":
                    rel = "output/" + fname
                else:
                    rel = "input/" + fname
                files.append({"filename": fname, "path": rel})

        return web.json_response({"success": True, "files": files})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})


# ── Upload local file ──
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
