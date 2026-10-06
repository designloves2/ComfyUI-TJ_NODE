# nodes/llm/custom_llm.py
# Custom LLM (TJ): one node for any OpenAI-compatible Chat Completions server (LM Studio, Ollama,
# llama.cpp, a gateway / proxy such as http://localhost:3000/v1), with optional images and
# user-managed system-prompt presets.
#
# The API key lives in this process's memory only (keyed by the normalised base URL): it is never
# a node input, never written to disk and never sent back to the page. The page sends it once
# through /tj_node/custom_llm/connect.

import asyncio
import base64
import ipaddress
import json
import os
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from io import BytesIO

import numpy as np
from aiohttp import web
from PIL import Image

from server import PromptServer

from ._llm_utils import (
    CLIP_LOADER_TYPE_OPTIONS, DEFAULT_GGUF_MODEL, DEFAULT_MMPROJ_MODEL, DEFAULT_TEXT_ENCODER_MODEL, MMPROJ_NONE,
    TJ_LLM_CATEGORY, _HANDLER_CLASSES, _free_chat_handler, _free_comfy_vram, _free_llm, _generate_with_textgenerate,
    _is_bad_choice, _load_clip_from_text_encoder, _resolve_text_encoder_path, _strip_thinking_process_block,
    _strip_thinking_tags, _text_encoder_ggufs, _text_encoder_mmproj_options, _text_encoder_model_options,
    tensor_to_data_uri,
)
from .image_to_prompt import TJ_ImageToPrompt

_KEYS = {}  # normalised api base -> key (memory only)
_PACK_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PRESET_FILE = os.path.join(_PACK_ROOT, "customLLM", "system_prompts.json")
_preset_lock = threading.Lock()
NO_PRESET = "(custom)"

_SEED_PRESETS = [
    {"name": "Prompt enhancer", "text": "You rewrite the user's idea into one vivid, concrete, visual prompt for an image or video model. "
                                        "Keep every detail the user gave, add camera, lighting and mood, and answer with the prompt only."},
    {"name": "Translator (EN)", "text": "Translate the user's text into natural English. Answer with the translation only."},
    {"name": "Summarizer", "text": "Summarize the user's text in three short sentences. Answer with the summary only."},
]


# ── endpoint helpers (same behaviour as STUDIO_ONE's "Connect Custom") ───────────────────────

def _base(base_url):
    """Normalised API base URL, or raise. Public hosts must use HTTPS; plain HTTP is only for
    loopback and private-network addresses so a key never crosses the open internet unencrypted."""
    url = (base_url or "").strip().rstrip("/")
    for tail in ("/chat/completions", "/chat"):
        if url.endswith(tail):
            url = url[:-len(tail)]
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("API base URL must start with http:// or https:// (e.g. http://localhost:3000/v1)")
    if parts.scheme == "http":
        try:
            addrs = {ipaddress.ip_address(ai[4][0].split("%")[0])
                     for ai in socket.getaddrinfo(parts.hostname, parts.port or 80, proto=socket.IPPROTO_TCP)}
        except (OSError, ValueError) as exc:
            raise ValueError(f"cannot resolve {parts.hostname}: {exc}")
        if not addrs or not all(a.is_loopback or a.is_private or a.is_link_local for a in addrs):
            raise ValueError("Public endpoints require HTTPS; loopback and private LAN addresses may use HTTP.")
    return url


def _key_for(base):
    key = _KEYS.get(base, "")
    if not key and "openrouter.ai" in base:
        key = (os.environ.get("OPENROUTER_API_KEY") or os.environ.get("LLM_KEY") or "").strip()
    return key


def _request(base, path, payload=None, timeout=60):
    key = _key_for(base)
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    req = urllib.request.Request(base + path, headers=headers, method="GET" if payload is None else "POST",
                                 data=None if payload is None else json.dumps(payload).encode("utf-8"))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            err = json.loads(exc.read().decode("utf-8")).get("error", "")
            detail = err.get("message", "") if isinstance(err, dict) else str(err)
        except (ValueError, AttributeError):
            pass
        hint = " - no key stored for this URL; type it in the key box and press Connect & test" if exc.code == 401 and not key else ""
        raise RuntimeError(f"HTTP {exc.code}: {detail or exc.reason}{hint}")
    except urllib.error.URLError as exc:
        raise RuntimeError(f"cannot reach {base}: {exc.reason}")


def _image_part(frame, max_px):
    im = Image.fromarray((frame.cpu().numpy()[..., :3].clip(0.0, 1.0) * 255.0 + 0.5).astype(np.uint8))
    if max_px > 0 and max(im.size) > max_px:
        scale = max_px / max(im.size)
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    buf = BytesIO()
    im.save(buf, format="JPEG", quality=90)
    url = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    return {"type": "image_url", "image_url": {"url": url}}


# ── system-prompt presets (a JSON file in this pack's customLLM folder) ──────────────────────

def load_presets():
    with _preset_lock:
        try:
            with open(PRESET_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            presets = [{"id": uuid.uuid4().hex[:8], **p} for p in _SEED_PRESETS]
            _write_presets(presets)
            return presets


def _write_presets(presets):
    os.makedirs(os.path.dirname(PRESET_FILE), exist_ok=True)
    tmp = PRESET_FILE + ".part"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(presets, f, ensure_ascii=False, indent=2)
    os.replace(tmp, PRESET_FILE)


def save_preset(name, text, preset_id=None):
    name = (name or "").strip()
    if not name or name == NO_PRESET:
        raise ValueError("preset name is empty")
    presets = load_presets()
    same = next((p for p in presets if p["name"].lower() == name.lower()), None)
    target = next((p for p in presets if p["id"] == preset_id), None) if preset_id else same
    if same and target is not same:
        raise ValueError(f"a preset named '{name}' already exists")
    with _preset_lock:
        if target is None:
            target = {"id": uuid.uuid4().hex[:8]}
            presets.append(target)
        target.update(name=name, text=text)
        _write_presets(presets)
    return presets


def delete_preset(preset_id):
    presets = [p for p in load_presets() if p["id"] != preset_id]
    with _preset_lock:
        _write_presets(presets)
    return presets


def _preset_text(name):
    return next((p["text"] for p in load_presets() if p["name"] == name), "")


# ── the node ─────────────────────────────────────────────────────────────────────────────────

BACKENDS = ["GGUF / llama.cpp", "ComfyUI TextGenerate", "Open Router", "Connect Custom"]
OPENROUTER_BASE = "https://openrouter.ai/api/v1"


def _http_chat(backend, api_base, model, system, prompt, images, context, max_tokens, temperature, max_image_px):
    """Open Router / Connect Custom: OpenAI-style Chat Completions. Returns (text, usage)."""
    base = _base(OPENROUTER_BASE if backend == "Open Router" else api_base)
    if not model.strip():
        raise ValueError("No model id set - press Connect & test and pick one.")
    content = prompt
    if images is not None and images.shape[0]:
        content = [{"type": "text", "text": prompt}] + [_image_part(images[i], max_image_px) for i in range(images.shape[0])]
    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": content}]
    limit = int(max_tokens)
    if int(context) > 0:
        limit = max(256, min(limit, int(context) // 2))
    reply = _request(base, "/chat/completions", {"model": model.strip(), "messages": messages,
                                                 "temperature": float(temperature), "max_tokens": limit}, timeout=180)
    if isinstance(reply, dict) and reply.get("error"):
        err = reply["error"]
        raise RuntimeError(err.get("message") if isinstance(err, dict) else str(err))
    message = ((reply.get("choices") or [{}])[0]).get("message") or {}
    text = message.get("content")
    if isinstance(text, list):
        text = "".join(p.get("text", "") for p in text if isinstance(p, dict))
    return (text or "").strip(), reply.get("usage") or {}


def _gguf_chat(gguf_model, mmproj_file, chat_handler, n_gpu_layers, n_ctx, system, prompt, images, max_tokens, temperature, seed):
    from llama_cpp import Llama
    if _is_bad_choice(gguf_model):
        raise FileNotFoundError("No .gguf model found in models/text_encoders.")
    model_path = _resolve_text_encoder_path(gguf_model)
    if not model_path or not os.path.isfile(model_path):
        raise FileNotFoundError(f"Selected GGUF not found: {model_path}")
    handler = None
    content = prompt
    kwargs = {}
    if images is not None and images.shape[0]:
        if mmproj_file == MMPROJ_NONE or not _HANDLER_CLASSES:
            raise RuntimeError("Images with a GGUF model need an mmproj file and a vision chat handler.")
        mmproj_path = _resolve_text_encoder_path(mmproj_file)
        if not mmproj_path or not os.path.isfile(mmproj_path):
            raise FileNotFoundError(f"mmproj not found: {mmproj_path}")
        handler_cls, _ = TJ_ImageToPrompt._resolve_handler(None, chat_handler, gguf_model)
        handler = handler_cls(clip_model_path=mmproj_path, verbose=False)
        kwargs = {"chat_handler": handler, "logits_all": True}
        content = [{"type": "image_url", "image_url": {"url": tensor_to_data_uri(images[i:i + 1])}} for i in range(images.shape[0])]
        content.append({"type": "text", "text": prompt})
    _free_comfy_vram()
    llm = Llama(model_path=model_path, n_gpu_layers=int(n_gpu_layers), verbose=False, n_ctx=int(n_ctx), seed=int(seed), **kwargs)
    try:
        messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": content}]
        out = llm.create_chat_completion(messages=messages, max_tokens=int(max_tokens), temperature=float(temperature))
        return out["choices"][0]["message"]["content"].strip()
    finally:
        _free_llm(llm)
        if handler is not None:
            _free_chat_handler(handler)


class TJ_CustomLLM:
    @classmethod
    def INPUT_TYPES(cls):
        handler_options = ["Auto-detect"] + list(_HANDLER_CLASSES.keys()) if _HANDLER_CLASSES else ["NO_VISION_HANDLERS_AVAILABLE"]
        return {
            "required": {
                "backend": (BACKENDS, {"default": "Connect Custom"}),
                "prompt": ("STRING", {"multiline": True, "default": ""}),
            },
            "optional": {
                "system_preset": ([NO_PRESET] + [p["name"] for p in load_presets()], {"default": NO_PRESET,
                                  "tooltip": "Saved system prompts. Picking one fills system_prompt; edit, save or delete them with the buttons."}),
                "system_prompt": ("STRING", {"multiline": True, "default": "",
                                             "tooltip": "Used as written. When empty, the picked preset's text is used."}),
                "images": ("IMAGE", {"tooltip": "Optional images for a vision model (every frame is sent)."}),
                "clip": ("CLIP", {"tooltip": "TextGenerate backend: use this loaded text encoder instead of text_encoder_name."}),
                # GGUF / llama.cpp
                "gguf_model": (_text_encoder_ggufs(exclude_mmproj=True), {"default": DEFAULT_GGUF_MODEL}),
                "mmproj_file": (_text_encoder_mmproj_options(), {"default": DEFAULT_MMPROJ_MODEL}),
                "chat_handler": (handler_options,),
                "n_gpu_layers": ("INT", {"default": -1, "min": -1, "max": 999}),
                "n_ctx": ("INT", {"default": 4096, "min": 512, "max": 131072, "step": 512}),
                # ComfyUI TextGenerate
                "text_encoder_name": (_text_encoder_model_options(), {"default": DEFAULT_TEXT_ENCODER_MODEL}),
                "clip_loader_type": (CLIP_LOADER_TYPE_OPTIONS, {"default": "Auto"}),
                # Open Router / Connect Custom
                "api_base": ("STRING", {"default": "http://localhost:3000/v1",
                                        "tooltip": "Connect Custom: OpenAI-compatible base URL. Public hosts need https://; http:// only for localhost / LAN."}),
                "model": ("STRING", {"default": "gemini-3.7-flash",
                                     "tooltip": "Open Router / Connect Custom model id (Open Router example: google/gemini-2.5-flash). Press 'Connect & test' to list the server's models."}),
                "context": ("INT", {"default": 0, "min": 0, "max": 2_000_000,
                                    "tooltip": "Known context window; max_tokens is capped to half of it. 0 = unknown."}),
                "max_image_px": ("INT", {"default": 1024, "min": 0, "max": 8192,
                                         "tooltip": "Longest image edge sent to Open Router / Custom (downscale only). 0 = original size."}),
                # all backends
                "max_tokens": ("INT", {"default": 2000, "min": 16, "max": 200_000}),
                "temperature": ("FLOAT", {"default": 0.7, "min": 0.0, "max": 2.0, "step": 0.05}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "strip_thinking": ("BOOLEAN", {"default": True}),
                "cache_same_input": ("BOOLEAN", {"default": False,
                                                 "tooltip": "Off: ask the model every run. On: reuse the last answer while the inputs are unchanged."}),
                "get_name": (["(none)"], {"default": "(none)"}),
                "auto_set": ("BOOLEAN", {"default": False, "tooltip": "켜면 2-출력을 setnode_name 기반 이름으로 자동 Set 등록."}),
                "setnode_name": ("STRING", {"default": "LLM"}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("text", "info")
    FUNCTION = "run"
    CATEGORY = TJ_LLM_CATEGORY

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, cache_same_input=False, **kw):
        return "" if cache_same_input else float("nan")

    def run(self, backend, prompt, system_preset=NO_PRESET, system_prompt="", images=None, clip=None,
            gguf_model="", mmproj_file=MMPROJ_NONE, chat_handler="Auto-detect", n_gpu_layers=-1, n_ctx=4096,
            text_encoder_name="", clip_loader_type="Auto", api_base="", model="", context=0, max_image_px=1024,
            max_tokens=2000, temperature=0.7, seed=0, strip_thinking=True, **kw):
        system = system_prompt.strip() or _preset_text(system_preset)
        started = time.time()
        usage = {}
        if backend == "GGUF / llama.cpp":
            text = _gguf_chat(gguf_model, mmproj_file, chat_handler, n_gpu_layers, n_ctx, system, prompt, images, max_tokens, temperature, seed)
            label = gguf_model
        elif backend == "ComfyUI TextGenerate":
            if clip is None:
                if _is_bad_choice(text_encoder_name):
                    raise FileNotFoundError("No model found in models/text_encoders.")
                clip = _load_clip_from_text_encoder(text_encoder_name, clip_loader_type)
            text = str(_generate_with_textgenerate(clip, f"{system}\n\n{prompt}" if system else prompt, max_tokens, seed, image=images)).strip()
            label = text_encoder_name
        elif backend in ("Open Router", "Connect Custom"):
            text, usage = _http_chat(backend, api_base, model, system, prompt, images, context, max_tokens, temperature, max_image_px)
            label = model.strip()
        else:
            raise ValueError(f"unknown backend: {backend}")
        if strip_thinking:
            text = _strip_thinking_process_block(_strip_thinking_tags(text)).strip()
        if not text:
            raise RuntimeError("The model returned no text.")
        info = f"{backend} · {label} · {int((time.time() - started) * 1000)} ms"
        if usage.get("total_tokens"):
            info += f" · {usage.get('prompt_tokens', '?')} in / {usage.get('completion_tokens', '?')} out tokens"
        return (text, info)


# ── routes (loopback + same-origin only, like the other TJ routes) ──────────────────────────

def _guard(request):
    try:
        ip = ipaddress.ip_address(request.remote)
        ip = getattr(ip, "ipv4_mapped", None) or ip
        loopback = ip.is_loopback
    except ValueError:
        loopback = False
    if not loopback:
        return web.json_response({"ok": False, "error": "Local (loopback) requests only."}, status=403)
    origin = request.headers.get("Origin") or request.headers.get("Referer") or ""
    host = request.headers.get("Host", "")
    if host and origin and origin.split("://", 1)[-1].split("/", 1)[0] != host:
        return web.json_response({"ok": False, "error": "Cross-origin requests are not allowed."}, status=403)
    return None


def _route(method, path):
    def deco(fn):
        async def handler(request):
            blocked = _guard(request)
            if blocked is not None:
                return blocked
            try:
                return await fn(request)
            except Exception as exc:
                return web.json_response({"ok": False, "error": str(exc)})
        getattr(PromptServer.instance.routes, method)("/tj_node/custom_llm" + path)(handler)
        return fn
    return deco


@_route("post", "/connect")
async def connect(request):
    """Remember the key (memory only) and test the endpoint: list its models, or fall back to a
    tiny chat when there is no /models route. Body: {base_url, api_key?, model?}."""
    data = await request.json()
    base = _base(data.get("base_url"))
    key = (data.get("api_key") or "").strip()
    if key:
        _KEYS[base] = key
    model = (data.get("model") or "").strip()

    def test():
        started = time.time()
        try:
            listing = _request(base, "/models", None, timeout=15)
            ids = [m.get("id") for m in (listing.get("data") or listing.get("models") or []) if isinstance(m, dict) and m.get("id")]
            return {"ok": True, "models": ids[:200], "modelFound": (model in ids) if model and ids else None,
                    "ms": int((time.time() - started) * 1000)}
        except RuntimeError:
            if not model:
                raise
            reply = _request(base, "/chat/completions", {"model": model, "messages": [{"role": "user", "content": "ping"}],
                                                         "max_tokens": 8}, timeout=30)
            if not reply.get("choices"):
                raise RuntimeError(f"unexpected reply: {str(reply)[:120]}")
            return {"ok": True, "models": [], "modelFound": True, "ms": int((time.time() - started) * 1000),
                    "note": "no /models list; the test chat worked"}

    result = await asyncio.get_running_loop().run_in_executor(None, test)
    result["keyStored"] = bool(_key_for(base))
    return web.json_response(result)


@_route("get", "/status")
async def status(request):
    return web.json_response({"ok": True, "keyStored": bool(_key_for(_base(request.query.get("base_url"))))})


@_route("get", "/presets")
async def presets(request):
    return web.json_response({"ok": True, "presets": load_presets()})


@_route("post", "/presets")
async def presets_save(request):
    data = await request.json()
    return web.json_response({"ok": True, "presets": save_preset(data.get("name"), data.get("text", ""), data.get("id"))})


@_route("post", "/presets/delete")
async def presets_delete(request):
    data = await request.json()
    return web.json_response({"ok": True, "presets": delete_preset(data.get("id"))})
