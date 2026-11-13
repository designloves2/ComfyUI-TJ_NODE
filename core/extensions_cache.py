# core/extensions_cache.py
# /extensions/* JS: ComfyUI sends "no-store", so every page load downloads every extension file again.
# "no-cache" lets the browser keep the file and revalidate it (aiohttp static files answer If-None-Match with 304).
# This middleware is added last, so it runs closest to the handler and sets the header before the core
# cache_control middleware's setdefault("Cache-Control", "no-store").

from aiohttp import web
from server import PromptServer


@web.middleware
async def extensions_revalidate(request, handler):
    response = await handler(request)
    if request.path.startswith("/extensions/") and request.path.endswith(".js") and response.status in (200, 304):
        response.headers["Cache-Control"] = "no-cache"
    return response


PromptServer.instance.app.middlewares.append(extensions_revalidate)
