# nodes/reflib/routes.py
# REST surface of the reference library: /tj_node/reflib/...
# Same local guard as the PromptDB routes (loopback + same-origin). Failures are
# {ok:false, code, detail}; matching problems found by resolve are HTTP 200 inside the report.

import ipaddress
import os

from aiohttp import web

from server import PromptServer

from . import bundle, encode_cache
from . import library as lib
from .resolve import resolve

PREFIX = "/tj_node/reflib"


def _guard(request):
    host = request.remote
    try:
        ip = ipaddress.ip_address(host)
        ip = getattr(ip, "ipv4_mapped", None) or ip
        loopback = ip.is_loopback
    except ValueError:
        loopback = False
    if not loopback:
        return web.json_response({"ok": False, "code": "FORBIDDEN", "detail": "Local (loopback) requests only."}, status=403)
    origin = request.headers.get("Origin") or request.headers.get("Referer") or ""
    host_header = request.headers.get("Host", "")
    origin_root = "/".join(origin.split("/", 3)[:3]).lower()
    same_host = origin.split("://", 1)[-1].split("/", 1)[0] == host_header
    if host_header and origin and not same_host and origin_root not in lib.allowed_origins():
        return web.json_response({"ok": False, "code": "FORBIDDEN", "detail": "Cross-origin requests are not allowed."}, status=403)
    return None


def _route(method, path):
    def deco(fn):
        async def handler(request):
            blocked = _guard(request)
            if blocked is not None:
                return blocked
            try:
                return await fn(request)
            except lib.LibraryError as exc:
                status = 404 if exc.code in ("ASSET_MISSING", "PROJECT_NOT_FOUND") else 400
                return web.json_response({"ok": False, "code": exc.code, "detail": exc.detail}, status=status)
            except (ValueError, KeyError, TypeError) as exc:
                return web.json_response({"ok": False, "code": "BAD_REQUEST", "detail": str(exc)}, status=400)
        getattr(PromptServer.instance.routes, method)(PREFIX + path)(handler)
        return fn
    return deco


def _asset_or_404(request):
    asset = lib.get_asset(int(request.match_info["id"]))
    if asset is None:
        raise lib.LibraryError("ASSET_MISSING", f"asset_id={request.match_info['id']} is not in the library")
    return asset


@_route("get", "/info")
async def info(request):
    return web.json_response({"ok": True, "root": lib.get_root(), "default_root": lib.default_root(),
                              "categories": list(lib.CATEGORIES), "limits": lib.LIMITS,
                              "defaults": lib.DEFAULT_SETTINGS, "asset_count": lib.count_assets()})


@_route("post", "/settings")
async def settings(request):
    body = await request.json()
    return web.json_response({"ok": True, "root": lib.set_root(body["root"])})


@_route("get", "/assets")
async def assets(request):
    q = request.query
    rows = lib.list_assets(q.get("category"), q.get("sub"), q.get("kind"), q.get("q"),
                           q.get("limit", 200), q.get("offset", 0))
    return web.json_response({"ok": True, "assets": rows})


@_route("get", "/assets/{id}")
async def asset(request):
    a = _asset_or_404(request)
    return web.json_response({"ok": True, "asset": a, "projects": lib.asset_usage(a["id"])})


@_route("post", "/assets")
async def register(request):
    """multipart: file + category, subcategory, name, tags, note."""
    form = await request.post()
    upload = form["file"]
    data = upload.file.read()
    ext = os.path.splitext(upload.filename or "")[1].lower() or ".png"
    name = form.get("name") or os.path.splitext(upload.filename or "asset")[0]
    a, duplicate = lib.register(data, ext, form.get("category", "etc"), form.get("subcategory", ""), name,
                                tags=form.get("tags", ""), note=form.get("note", ""))
    return web.json_response({"ok": True, "asset": a, "duplicate": duplicate})


@_route("post", "/assets/import")
async def import_asset(request):
    """Register a file already in ComfyUI's input / output / temp folder: {path, category, subcategory, name, tags, note}."""
    body = await request.json()
    a, duplicate = lib.import_file(body["path"], body.get("category", "etc"), body.get("subcategory", ""),
                                   body.get("name", ""), tags=body.get("tags", ""), note=body.get("note", ""))
    return web.json_response({"ok": True, "asset": a, "duplicate": duplicate})


@_route("post", "/sets")
async def make_set(request):
    """{name, category, subcategory, image_ids:[...], settings:{set_mode, frames_per_image, fit, mp}, tags, note}"""
    body = await request.json()
    a, duplicate = lib.create_set(body["name"], body.get("category", "character"), body.get("subcategory", ""),
                                  body["image_ids"], body.get("tags", ""), body.get("note", ""), body.get("settings"))
    return web.json_response({"ok": True, "asset": a, "duplicate": duplicate})


@_route("post", "/assets/{id}/update")
async def update(request):
    body = await request.json()
    fields = {k: body[k] for k in ("name", "category", "subcategory", "tags", "note", "settings") if k in body}
    return web.json_response({"ok": True, "asset": lib.update_asset(int(request.match_info["id"]), **fields)})


@_route("post", "/assets/{id}/replace")
async def replace(request):
    """multipart: file. Keeps the id, replaces the media."""
    form = await request.post()
    upload = form["file"]
    ext = os.path.splitext(upload.filename or "")[1].lower()
    return web.json_response({"ok": True, "asset": lib.replace_asset(int(request.match_info["id"]), upload.file.read(), ext)})


@_route("post", "/assets/{id}/delete")
async def delete(request):
    body = await request.json() if request.can_read_body else {}
    lib.delete_asset(int(request.match_info["id"]), force=bool(body.get("force")))
    return web.json_response({"ok": True})


@_route("get", "/thumb/{id}")
async def thumb(request):
    return web.FileResponse(lib.thumb_path(_asset_or_404(request)), headers={"Cache-Control": "no-cache"})


@_route("get", "/file/{id}")
async def file(request):
    return web.FileResponse(lib.abs_path(_asset_or_404(request)), headers={"Cache-Control": "no-cache"})


@_route("get", "/preview/{id}")
async def preview(request):
    data = lib.preview_bytes(_asset_or_404(request), float(request.query.get("max_mp", 1)))
    return web.Response(body=data, content_type="image/jpeg")


@_route("get", "/projects")
async def projects(request):
    return web.json_response({"ok": True, "projects": lib.list_projects()})


@_route("get", "/projects/{id}")
async def project(request):
    p = lib.get_project(int(request.match_info["id"]))
    if p is None:
        raise lib.LibraryError("PROJECT_NOT_FOUND", f"project_id={request.match_info['id']} does not exist")
    return web.json_response({"ok": True, "project": p})


@_route("post", "/projects")
async def save_project(request):
    body = await request.json()
    p = lib.save_project(body["name"], body.get("items", []), body.get("note", ""), body.get("id"))
    return web.json_response({"ok": True, "project": p})


@_route("post", "/projects/{id}/delete")
async def delete_project(request):
    lib.delete_project(int(request.match_info["id"]))
    return web.json_response({"ok": True})


@_route("post", "/resolve")
async def resolve_route(request):
    body = await request.json()
    report, _ = resolve(body.get("mode"), body.get("project"), body.get("assets"), body.get("prompt", ""),
                        body.get("overrides"))
    return web.json_response(report)


@_route("get", "/bundle/export")
async def export_bundle(request):
    """?project=<id> and/or ?assets=1,2,3 -> zip with files + manifest."""
    ids = [int(i) for i in request.query.get("assets", "").split(",") if i.strip()]
    project = request.query.get("project")
    data = bundle.export_bundle(int(project) if project else None, ids)
    return web.Response(body=data, content_type="application/zip",
                        headers={"Content-Disposition": 'attachment; filename="reference_bundle.zip"'})


@_route("post", "/bundle/import")
async def import_bundle(request):
    form = await request.post()
    return web.json_response({"ok": True, **bundle.import_bundle(form["file"].file.read())})


@_route("post", "/cache/clear")
async def clear_cache(request):
    return web.json_response({"ok": True, "removed": encode_cache.clear()})


@_route("get", "/check")
async def check(request):
    problems = lib.check_all()
    return web.json_response({"ok": not problems, "problems": problems})
