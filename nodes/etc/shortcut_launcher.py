# nodes/etc/shortcut_launcher.py
import ipaddress
import os
import sys
import webbrowser
from aiohttp import web
from server import PromptServer


def _is_loopback(host):
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


def _local_only(request):
    """Block non-loopback and cross-origin requests.

    This route launches local files/apps on the machine running ComfyUI, so it
    must never be reachable by an unauthenticated remote caller or by a
    malicious page in the user's browser (CSRF) — either could otherwise
    trigger arbitrary local code execution via os.startfile(). Requiring a
    loopback source plus a same-origin Origin/Referer header closes both
    paths while leaving the node's own UI (served from this same origin)
    working normally. Remote access is intentionally not configurable —
    shortcuts always execute on the machine running ComfyUI, never elsewhere.

    Returns None if the request is allowed, or an aiohttp response if blocked.
    """
    if not _is_loopback(request.remote):
        return web.json_response(
            {"ok": False, "error": "blocked_remote", "message": "Shortcuts only run locally on the machine running ComfyUI."},
            status=403,
        )

    host_header = request.headers.get("Host", "")
    origin = request.headers.get("Origin") or request.headers.get("Referer") or ""
    if host_header:
        origin_host = origin.split("://", 1)[-1].split("/", 1)[0]
        if origin and origin_host != host_header:
            return web.json_response(
                {"ok": False, "error": "blocked_cross_origin", "message": "Cross-origin requests are not allowed."},
                status=403,
            )

    return None


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
    blocked = _local_only(request)
    if blocked is not None:
        return blocked
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
    blocked = _local_only(request)
    if blocked is not None:
        return blocked
    try:
        data = await request.json()
        target = (data.get("target") or "").strip()

        if not target:
            return web.json_response({"ok": False, "error": "Empty target"}, status=400)

        if _is_url(target):
            webbrowser.open(target, new=2)
            return web.json_response({"ok": True, "type": "url", "message": f"Opening {target} in your browser (local)."})

        path = os.path.expandvars(os.path.expanduser(target))
        path = os.path.normpath(path)

        if not os.path.exists(path):
            return web.json_response({"ok": False, "error": "not_found", "message": f"Path not found: {path}", "path": path}, status=404)

        if os.name == "nt":
            os.startfile(path)  # type: ignore[attr-defined]
        else:
            import subprocess
            opener = "open" if sys.platform == "darwin" else "xdg-open"
            subprocess.Popen([opener, path])

        return web.json_response({"ok": True, "type": "path", "message": f"Opening locally: {path}"})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)
