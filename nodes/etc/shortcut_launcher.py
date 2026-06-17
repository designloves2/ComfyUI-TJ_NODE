# nodes/etc/shortcut_launcher.py
import os
import sys
import webbrowser
from aiohttp import web
from server import PromptServer


class TJShortcutLauncher:
    CATEGORY = " ✨ TJ_Node/Utility"
    RETURN_TYPES = ()
    FUNCTION = "run"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    def run(self):
        return {}


def _is_url(target: str) -> bool:
    t = (target or "").strip().lower()
    return t.startswith("http://") or t.startswith("https://")


@PromptServer.instance.routes.get("/tj/shortcut/browse")
async def tj_shortcut_browse(request):
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        path = filedialog.askdirectory(title="Select Shortcut Folder")
        root.destroy()

        return web.json_response({"ok": True, "path": path or ""})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.post("/tj/shortcut/open")
async def tj_shortcut_open(request):
    try:
        data = await request.json()
        target = (data.get("target") or "").strip()

        if not target:
            return web.json_response({"ok": False, "error": "Empty target"}, status=400)

        if _is_url(target):
            webbrowser.open(target, new=2)
            return web.json_response({"ok": True, "type": "url"})

        path = os.path.expandvars(os.path.expanduser(target))
        path = os.path.normpath(path)

        if not os.path.exists(path):
            return web.json_response({"ok": False, "error": "Path not found", "path": path}, status=404)

        if os.name == "nt":
            os.startfile(path)  # type: ignore[attr-defined]
        else:
            import subprocess
            opener = "open" if sys.platform == "darwin" else "xdg-open"
            subprocess.Popen([opener, path])

        return web.json_response({"ok": True, "type": "path"})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)
