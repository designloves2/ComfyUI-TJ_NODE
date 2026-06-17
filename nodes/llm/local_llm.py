
from __future__ import annotations

import base64
import hashlib
import http.client
import itertools
import json
import os
import queue
import random
import re
import threading
import time
import urllib.parse
from io import BytesIO
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

import numpy as np
from PIL import Image

try:
    from comfy_execution.graph_utils import ExecutionBlocker
except Exception:
    class ExecutionBlocker:  # type: ignore[no-redef]
        def __init__(self, message):
            self.message = message

try:
    from aiohttp import web
    from server import PromptServer
except Exception:
    web = None
    PromptServer = None

try:
    import comfy.model_management as comfy_model_management
except Exception:
    comfy_model_management = None

from ...core.tj_types import any_type

OLLAMA_DEFAULT_SERVER = "http://127.0.0.1:11434"
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1", "[::1]"}
PROGRESS_EVENT = "tj-ollama-llm-progress"
CQC_WAIT_EVENT = "tj-cqc-review-waiting"


MEMORY_UNLOAD_AFTER_RUN = "Unload after run"
MEMORY_KEEP_MINUTES = "Keep for minutes"
MEMORY_KEEP_LOADED = "Keep loaded"
MODEL_MEMORY_OPTIONS = [MEMORY_UNLOAD_AFTER_RUN, MEMORY_KEEP_MINUTES, MEMORY_KEEP_LOADED]

COMFY_VRAM_AUTO = "Auto: unload only before first LLM call"
COMFY_VRAM_ALWAYS = "Always unload before each LLM call"
COMFY_VRAM_NEVER = "Never unload before LLM call"
COMFY_VRAM_POLICY_OPTIONS = [COMFY_VRAM_AUTO, COMFY_VRAM_ALWAYS, COMFY_VRAM_NEVER]

SEED_MODE_FIXED = "fixed"
SEED_MODE_INCREMENT = "increment"
SEED_MODE_DECREMENT = "decrement"
SEED_MODE_RANDOMIZE = "randomize"
SEED_MODE_OPTIONS = [SEED_MODE_FIXED, SEED_MODE_INCREMENT, SEED_MODE_DECREMENT, SEED_MODE_RANDOMIZE]

THINK_TAG_RE = re.compile(r"<(?:think|thinking)>(.*?)</(?:think|thinking)>", re.IGNORECASE | re.DOTALL)

_WARM_OLLAMA_KEYS: Dict[str, Optional[float]] = {}
_ACTIVE_OLLAMA_KEYS: Dict[str, int] = {}
_CANCEL_OLLAMA_KEYS: Set[str] = set()
_ACTIVE_LOCK = threading.Lock()
_CHANGED_COUNTER = itertools.count()


def _json_response(payload: Dict[str, Any], status: int = 200):
    if web is None:
        return {"payload": payload, "status": status}
    return web.json_response(payload, status=status)


def _extract_scalar(value: Any, default: Any = None) -> Any:
    if isinstance(value, list):
        if not value:
            return default
        return _extract_scalar(value[0], default)
    return default if value is None else value


def _safe_bool(value: Any, default: bool = False) -> bool:
    scalar = _extract_scalar(value, default)
    if isinstance(scalar, bool):
        return scalar
    text = str(scalar).strip().lower()
    if text in {"true", "1", "yes", "on"}:
        return True
    if text in {"false", "0", "no", "off", ""}:
        return False
    return bool(default)


def _safe_int(value: Any, default: int, minimum: int = 0, maximum: Optional[int] = None) -> int:
    try:
        parsed = int(float(_extract_scalar(value, default)))
    except Exception:
        parsed = int(default)
    parsed = max(int(minimum), parsed)
    if maximum is not None:
        parsed = min(int(maximum), parsed)
    return parsed


def _safe_float(value: Any, default: float, minimum: Optional[float] = None, maximum: Optional[float] = None) -> float:
    try:
        parsed = float(_extract_scalar(value, default))
    except Exception:
        parsed = float(default)
    if minimum is not None:
        parsed = max(float(minimum), parsed)
    if maximum is not None:
        parsed = min(float(maximum), parsed)
    return parsed


def _normalize_seed_mode(value: Any) -> str:
    text = str(_extract_scalar(value, SEED_MODE_FIXED) or SEED_MODE_FIXED).strip()
    return text if text in SEED_MODE_OPTIONS else SEED_MODE_FIXED


def _normalize_model_memory(value: Any) -> str:
    text = str(_extract_scalar(value, MEMORY_UNLOAD_AFTER_RUN) or MEMORY_UNLOAD_AFTER_RUN).strip()
    return text if text in MODEL_MEMORY_OPTIONS else MEMORY_UNLOAD_AFTER_RUN


def _normalize_comfy_vram_policy(value: Any) -> str:
    text = str(_extract_scalar(value, COMFY_VRAM_AUTO) or COMFY_VRAM_AUTO).strip()
    return text if text in COMFY_VRAM_POLICY_OPTIONS else COMFY_VRAM_AUTO


def _strip_trailing_slash(url: str) -> str:
    return str(url or "").strip().rstrip("/")


def _parse_local_url(url: str) -> urllib.parse.ParseResult:
    parsed = urllib.parse.urlparse(str(url or "").strip())
    if parsed.scheme not in {"http", "https"}:
        raise RuntimeError("Use a local http:// or https:// Ollama server URL.")
    host = parsed.hostname or ""
    if host.lower() not in LOCAL_HOSTS:
        raise RuntimeError("Only local Ollama servers are allowed. Use 127.0.0.1 or localhost.")
    return parsed


def _normalize_ollama_url(server_url: str) -> str:
    url = _strip_trailing_slash(server_url or OLLAMA_DEFAULT_SERVER)
    _parse_local_url(url)
    return url


def _http_connection(parsed: urllib.parse.ParseResult, timeout: float):
    if not parsed.hostname:
        raise RuntimeError("Ollama server URL is missing a host.")
    cls = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    return cls(parsed.hostname, parsed.port, timeout=timeout)


def _http_json(url: str, payload: Optional[Dict[str, Any]] = None, method: str = "GET", timeout: float = 20.0) -> Dict[str, Any]:
    parsed = _parse_local_url(url)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    conn = _http_connection(parsed, timeout)
    try:
        conn.request(method.upper(), path, body=body, headers=headers)
        response = conn.getresponse()
        data = response.read().decode("utf-8", errors="replace")
        if response.status >= 400:
            raise RuntimeError(f"Ollama server returned HTTP {response.status}: {data[:800]}")
    except (TimeoutError, OSError, http.client.HTTPException) as exc:
        raise RuntimeError(f"Could not reach Ollama server: {exc}") from exc
    finally:
        try:
            conn.close()
        except Exception:
            pass
    if not data.strip():
        return {}
    return json.loads(data)


def _iter_cancellable_response_lines(url: str, payload: Dict[str, Any], timeout: float = 600.0, cancel_key: Optional[str] = None) -> Iterable[bytes]:
    parsed = _parse_local_url(url)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    conn = _http_connection(parsed, timeout)
    q: "queue.Queue[Tuple[str, Any]]" = queue.Queue()
    stop_event = threading.Event()

    def reader() -> None:
        try:
            body = json.dumps(payload).encode("utf-8")
            conn.request("POST", path, body=body, headers={"Content-Type": "application/json"})
            response = conn.getresponse()
            if response.status >= 400:
                msg = response.read().decode("utf-8", errors="replace")
                raise RuntimeError(f"Ollama server returned HTTP {response.status}: {msg[:800]}")
            while not stop_event.is_set():
                raw = response.readline()
                if raw == b"":
                    break
                q.put(("line", raw))
            q.put(("done", None))
        except BaseException as exc:
            q.put(("done", None) if stop_event.is_set() else ("error", exc))
        finally:
            try:
                conn.close()
            except Exception:
                pass

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()
    try:
        while True:
            _raise_if_stopped(cancel_key)
            try:
                kind, value = q.get(timeout=0.2)
            except queue.Empty:
                continue
            _raise_if_stopped(cancel_key)
            if kind == "line":
                yield value
            elif kind == "done":
                break
            elif kind == "error":
                raise value
    finally:
        stop_event.set()
        try:
            conn.close()
        except Exception:
            pass
        thread.join(timeout=0.1)


def _http_stream_json_lines(url: str, payload: Dict[str, Any], cancel_key: Optional[str] = None) -> Iterable[Dict[str, Any]]:
    try:
        for raw in _iter_cancellable_response_lines(url, payload, cancel_key=cancel_key):
            line = raw.decode("utf-8", errors="replace").strip()
            if line:
                yield json.loads(line)
    except (TimeoutError, OSError, http.client.HTTPException) as exc:
        raise RuntimeError(f"Could not reach Ollama server: {exc}") from exc


def _flatten_prompts(value: Any) -> List[str]:
    if value is None:
        return [""]
    if isinstance(value, list):
        out: List[str] = []
        for item in value:
            out.extend(_flatten_prompts(item))
        return out or [""]
    return [str(value)]


def _seed_for_index(seed: int, mode: str, index: int = 0) -> int:
    mode = _normalize_seed_mode(mode)
    seed = int(seed)
    if mode == SEED_MODE_INCREMENT:
        return max(0, seed + index)
    if mode == SEED_MODE_DECREMENT:
        return max(0, seed - index)
    if mode == SEED_MODE_RANDOMIZE:
        return random.randint(0, 0xFFFFFFFF)
    return max(0, seed)


def _cache_stable_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, np.ndarray):
        arr = np.ascontiguousarray(value)
        return {"__array__": True, "dtype": str(arr.dtype), "shape": list(arr.shape), "sha256": hashlib.sha256(arr.tobytes()).hexdigest()}
    if hasattr(value, "detach") and hasattr(value, "cpu"):
        try:
            return _cache_stable_value(value.detach().cpu().numpy())
        except Exception:
            pass
    if isinstance(value, dict):
        return {str(k): _cache_stable_value(v) for k, v in sorted(value.items(), key=lambda p: str(p[0]))}
    if isinstance(value, (list, tuple)):
        return [_cache_stable_value(v) for v in value]
    return {"__repr__": repr(value), "__type__": type(value).__name__}


def _local_llm_cache_key(kwargs: Dict[str, Any]) -> str:
    if _normalize_seed_mode(kwargs.get("seed_mode")) == SEED_MODE_RANDOMIZE:
        return f"randomize:{time.monotonic_ns()}:{next(_CHANGED_COUNTER)}"
    payload = {k: _cache_stable_value(v) for k, v in sorted(kwargs.items()) if k != "unique_id"}
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return f"stable:{hashlib.sha256(encoded.encode('utf-8')).hexdigest()}"


def _extract_media(value: Any) -> Any:
    if isinstance(value, list):
        for item in value:
            found = _extract_media(item)
            if found is not None:
                return found
        return None
    return value


def _prepare_image_attachment(image: Any, max_side: int = 1280) -> Optional[Dict[str, Any]]:
    image = _extract_media(image)
    if image is None:
        return None
    if hasattr(image, "detach"):
        arr = image.detach().cpu().numpy()
    else:
        arr = np.asarray(image)
    if arr.ndim == 4:
        arr = arr[0]
    if arr.ndim != 3:
        raise RuntimeError("Image input must be an IMAGE tensor shaped HxWxC or BxHxWxC.")
    if arr.shape[-1] > 3:
        arr = arr[..., :3]
    if arr.shape[-1] == 1:
        arr = np.repeat(arr, 3, axis=-1)
    if arr.dtype != np.uint8:
        if float(np.nanmax(arr)) <= 1.5:
            arr = arr * 255.0
        arr = np.nan_to_num(arr, nan=0.0, posinf=255.0, neginf=0.0)
        arr = np.clip(arr, 0, 255).astype(np.uint8)
    pil = Image.fromarray(arr, "RGB")
    original_width, original_height = pil.size
    pil.thumbnail((int(max_side), int(max_side)), Image.Resampling.LANCZOS)
    buf = BytesIO()
    pil.save(buf, format="JPEG", quality=92)
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return {"base64": encoded, "mime": "image/jpeg", "width": original_width, "height": original_height, "sent_width": pil.size[0], "sent_height": pil.size[1]}


def _ollama_keep_alive(model_memory: str, keep_minutes: int, is_last: bool) -> Any:
    model_memory = _normalize_model_memory(model_memory)
    keep_minutes = max(1, int(keep_minutes))
    if model_memory == MEMORY_KEEP_LOADED:
        return "-1m"
    if model_memory == MEMORY_KEEP_MINUTES:
        return f"{keep_minutes}m"
    return "0m" if is_last else f"{keep_minutes}m"


def _ollama_state_key(server_url: str, model: str) -> str:
    url = _normalize_ollama_url(server_url)
    parsed = urllib.parse.urlparse(url)
    host = str(parsed.hostname or "").lower()
    if host in {"localhost", "::1", "[::1]"}:
        host = "127.0.0.1"
    netloc = f"{host}:{parsed.port}" if parsed.port else host
    return f"ollama|{parsed.scheme.lower()}://{netloc}{parsed.path.rstrip('/')}|{str(model or '').strip()}"


def _mark_active(server_url: str, model: str) -> str:
    key = _ollama_state_key(server_url, model)
    with _ACTIVE_LOCK:
        _ACTIVE_OLLAMA_KEYS[key] = _ACTIVE_OLLAMA_KEYS.get(key, 0) + 1
    return key


def _clear_active(key: str) -> None:
    with _ACTIVE_LOCK:
        count = _ACTIVE_OLLAMA_KEYS.get(key, 0)
        if count <= 1:
            _ACTIVE_OLLAMA_KEYS.pop(key, None)
            _CANCEL_OLLAMA_KEYS.discard(key)
        else:
            _ACTIVE_OLLAMA_KEYS[key] = count - 1


def _raise_if_stopped(cancel_key: Optional[str] = None) -> None:
    if cancel_key:
        with _ACTIVE_LOCK:
            cancelled = cancel_key in _CANCEL_OLLAMA_KEYS
            if cancelled:
                _CANCEL_OLLAMA_KEYS.discard(cancel_key)
        if cancelled:
            exc_cls = getattr(comfy_model_management, "InterruptProcessingException", None) if comfy_model_management else None
            raise (exc_cls("Ollama LLM generation stopped.") if exc_cls else RuntimeError("Ollama LLM generation stopped."))
    if comfy_model_management is not None:
        thrower = getattr(comfy_model_management, "throw_exception_if_processing_interrupted", None)
        if callable(thrower):
            thrower()


def _send_progress(payload: Dict[str, Any]) -> None:
    try:
        sender = getattr(getattr(PromptServer, "instance", None), "send_sync", None)
        if sender:
            sender(PROGRESS_EVENT, payload)
    except Exception:
        pass


def _free_comfy_vram() -> Dict[str, Any]:
    info: Dict[str, Any] = {"available": comfy_model_management is not None}
    if comfy_model_management is None:
        return info
    try:
        info["before_loaded_models"] = len(comfy_model_management.loaded_models())
    except Exception:
        pass
    try:
        comfy_model_management.unload_all_models()
        comfy_model_management.soft_empty_cache(force=True)
        time.sleep(0.6)
        comfy_model_management.soft_empty_cache(force=True)
        info["action"] = "freed"
    except Exception as exc:
        info["error"] = str(exc)
    try:
        info["after_loaded_models"] = len(comfy_model_management.loaded_models())
    except Exception:
        pass
    return info


def _ollama_loaded_model_names(base: str) -> List[str]:
    payload = _http_json(f"{base}/api/ps", timeout=10.0)
    names: List[str] = []
    for item in payload.get("models") or []:
        if not isinstance(item, dict):
            continue
        for key in ("model", "name"):
            value = str(item.get(key) or "").strip()
            if value and value not in names:
                names.append(value)
    return names


def _is_ollama_model_loaded(base: str, model: str) -> bool:
    try:
        return str(model or "").strip() in _ollama_loaded_model_names(base)
    except Exception:
        return False


def _prepare_comfy_vram_before_llm(server_url: str, model: str, policy: str, node_id: str) -> Dict[str, Any]:
    policy = _normalize_comfy_vram_policy(policy)
    base = _normalize_ollama_url(server_url)
    key = _ollama_state_key(base, model)
    if policy == COMFY_VRAM_NEVER:
        return {"policy": policy, "action": "skipped"}
    if policy == COMFY_VRAM_AUTO and key in _WARM_OLLAMA_KEYS:
        return {"policy": policy, "action": "skipped", "reason": "Ollama model is marked loaded"}
    if policy == COMFY_VRAM_AUTO and _is_ollama_model_loaded(base, model):
        return {"policy": policy, "action": "skipped", "reason": "Ollama model is already loaded"}
    _send_progress({"node_id": node_id, "status": "freeing ComfyUI VRAM", "provider": "Ollama", "model": model, "answer": "", "thinking": ""})
    info = _free_comfy_vram()
    info["policy"] = policy
    return info


def list_ollama_models(server_url: str = OLLAMA_DEFAULT_SERVER) -> List[Dict[str, Any]]:
    base = _normalize_ollama_url(server_url)
    payload = _http_json(f"{base}/api/tags", timeout=10.0)
    result = []
    for item in payload.get("models") or []:
        model_id = str(item.get("model") or item.get("name") or "").strip()
        if model_id:
            result.append({"id": model_id, "label": model_id, "loaded": False})
    loaded = set()
    try:
        loaded = set(_ollama_loaded_model_names(base))
    except Exception:
        pass
    for item in result:
        item["loaded"] = item["id"] in loaded
    return result


def list_detected_model_ids(server_url: str = OLLAMA_DEFAULT_SERVER) -> List[str]:
    try:
        models = list_ollama_models(server_url)
    except Exception:
        models = []
    choices = []
    for item in models:
        model_id = str(item.get("id") or "").strip()
        if model_id and model_id not in choices:
            choices.append(model_id)
    return choices or [""]


def unload_ollama_model(server_url: str, model: str) -> Dict[str, Any]:
    model = str(model or "").strip()
    if not model:
        raise RuntimeError("Select an Ollama model before unloading.")
    base = _normalize_ollama_url(server_url)
    key = _ollama_state_key(base, model)
    with _ACTIVE_LOCK:
        if _ACTIVE_OLLAMA_KEYS.get(key, 0) > 0:
            return {"ok": False, "busy": True, "message": f"Ollama model is still generating: {model}. Press Stop LLM first."}
    _http_json(f"{base}/api/generate", {"model": model, "prompt": "", "stream": False, "keep_alive": 0}, method="POST", timeout=30.0)
    _WARM_OLLAMA_KEYS.pop(key, None)
    return {"ok": True, "message": f"Unloaded Ollama model: {model}"}


def stop_ollama_generation(server_url: str, model: str) -> Dict[str, Any]:
    model = str(model or "").strip()
    if not model:
        raise RuntimeError("Select an Ollama model before stopping.")
    key = _ollama_state_key(server_url, model)
    with _ACTIVE_LOCK:
        active = _ACTIVE_OLLAMA_KEYS.get(key, 0) > 0
        if active:
            _CANCEL_OLLAMA_KEYS.add(key)
    return {"ok": bool(active), "stopping": bool(active), "message": f"Stop requested for Ollama model: {model}." if active else f"No active Ollama request matched {model}."}


def _split_thinking_tags(answer: str, thinking: str) -> Tuple[str, str]:
    extracted = [m.group(1).strip() for m in THINK_TAG_RE.finditer(answer or "")]
    if extracted:
        answer = THINK_TAG_RE.sub("", answer or "").strip()
        thinking = "\n".join(part for part in [thinking, *extracted] if str(part or "").strip()).strip()
    answer = re.sub(r"</?(?:think|thinking)>", "", answer or "", flags=re.IGNORECASE).strip()
    return answer or "", thinking or ""


def _word_list(value: Any, defaults: List[str]) -> List[str]:
    text = str(_extract_scalar(value, "") or "")
    parts = [p.strip() for p in re.split(r"[,;\n]+", text) if p.strip()]
    return parts or defaults


def _extract_first_json_object(text: str) -> Optional[Dict[str, Any]]:
    text = str(text or "").strip()
    if not text:
        return None
    candidates = [text]
    start, end = text.find("{"), text.rfind("}")
    if 0 <= start < end:
        candidates.append(text[start:end + 1])
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except Exception:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _word_found(text: str, words: List[str]) -> Optional[str]:
    lowered = str(text or "").lower()
    for word in words:
        needle = word.strip().lower()
        if needle and re.search(rf"(?<![A-Za-z0-9_]){re.escape(needle)}(?![A-Za-z0-9_])", lowered):
            return word
    return None


def _judge_review_text(review: Any, pass_words: Any, reject_words: Any, unclear_result: str) -> Tuple[bool, str, str]:
    review_text = str(_extract_scalar(review, "") or "")
    parsed = _extract_first_json_object(review_text)
    pass_tokens = _word_list(pass_words, ["OK", "PASS", "APPROVE", "APPROVED"])
    reject_tokens = _word_list(reject_words, ["FAIL", "REJECT", "BAD"])
    reason = " ".join(review_text.strip().split())[:500]
    if isinstance(parsed, dict):
        for key in ("reason", "message", "comment", "explanation", "notes"):
            if parsed.get(key):
                reason = str(parsed.get(key)).strip()
                break
        for key in ("verdict", "status", "result", "decision"):
            if key in parsed:
                value = str(parsed.get(key) or "")
                if _word_found(value, reject_tokens):
                    return False, "FAIL", reason or f"Quality Controller returned {value}."
                if _word_found(value, pass_tokens):
                    return True, "OK", reason or f"Quality Controller returned {value}."
        for key in ("ok", "pass", "passed", "accepted", "save"):
            if isinstance(parsed.get(key), bool):
                return bool(parsed[key]), "OK" if parsed[key] else "FAIL", reason or f"Quality Controller field {key}={parsed[key]}."
    reject_hit = _word_found(review_text, reject_tokens)
    pass_hit = _word_found(review_text, pass_tokens)
    if reject_hit:
        return False, "FAIL", reason or "Quality Controller marked this result as FAIL."
    if pass_hit:
        return True, "OK", reason or "Quality Controller marked this result as OK."
    should_pass = str(unclear_result or "").strip() == "Pass"
    return should_pass, "OK" if should_pass else "FAIL", "Quality Controller answer was unclear."


async def _handle_list_models(request):
    try:
        payload = await request.json()
        server_url = payload.get("server_url", OLLAMA_DEFAULT_SERVER)
        return _json_response({"models": list_ollama_models(server_url)})
    except Exception as exc:
        return _json_response({"models": [], "error": str(exc)}, status=400)


async def _handle_unload_model(request):
    try:
        payload = await request.json()
        result = unload_ollama_model(payload.get("server_url", OLLAMA_DEFAULT_SERVER), payload.get("model", ""))
        return _json_response(result, status=200 if result.get("ok") else 409)
    except Exception as exc:
        return _json_response({"ok": False, "error": str(exc)}, status=400)


async def _handle_stop_model(request):
    try:
        payload = await request.json()
        result = stop_ollama_generation(payload.get("server_url", OLLAMA_DEFAULT_SERVER), payload.get("model", ""))
        return _json_response(result, status=200 if result.get("ok") else 409)
    except Exception as exc:
        return _json_response({"ok": False, "error": str(exc)}, status=400)


if PromptServer is not None:
    PromptServer.instance.routes.post("/tj/local_llm/models")(_handle_list_models)
    PromptServer.instance.routes.post("/tj/local_llm/stop")(_handle_stop_model)
    PromptServer.instance.routes.post("/tj/local_llm/unload")(_handle_unload_model)


class TJ_OllamaLLMLoader:
    DESCRIPTION = "Ollama-only local LLM caller with TJ_NODE embedded Set/Get support."

    @classmethod
    def INPUT_TYPES(cls):
        model_choices = list_detected_model_ids(OLLAMA_DEFAULT_SERVER)
        return {
            "required": {
                "get_name": (["(none)"],),
                "setnode_name": ("STRING", {"default": ""}),
                "server_url": ("STRING", {"default": OLLAMA_DEFAULT_SERVER}),
                "model": (model_choices, {"default": model_choices[0]}),
                "system_prompt": ("STRING", {"default": "", "multiline": True}),
                "user_prompt": ("STRING", {"default": "", "multiline": True}),
                "thinking": ("BOOLEAN", {"default": False}),
                "seed": ("INT", {"default": 1, "min": 0, "max": 0xFFFFFFFF, "step": 1}),
                "seed_mode": (SEED_MODE_OPTIONS, {"default": SEED_MODE_FIXED}),
                # STRING 타입으로 받는 이유:
                # 기존 저장 워크플로우/위젯 순서가 바뀐 경우 ComfyUI 검증 단계에서 FLOAT/INT 변환 오류가 먼저 발생한다.
                # 실행 함수 내부에서 _safe_float/_safe_int로 안전 변환하여 기본값으로 복구한다.
                "temperature": ("STRING", {"default": "0.7"}),
                "top_p": ("STRING", {"default": "0.9"}),
                "repeat_penalty": ("STRING", {"default": "1.1"}),
                "model_memory": (MODEL_MEMORY_OPTIONS, {"default": MEMORY_UNLOAD_AFTER_RUN}),
                "keep_minutes": ("STRING", {"default": "5"}),
                "comfy_vram_policy": (COMFY_VRAM_POLICY_OPTIONS, {"default": COMFY_VRAM_AUTO}),
            },
            "optional": {
                "image": ("IMAGE",),
                "prompt_in": ("STRING", {"forceInput": True}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    INPUT_IS_LIST = True
    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("response", "thought_process", "raw_response")
    OUTPUT_IS_LIST = (True, True, True)
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/LLM"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return _local_llm_cache_key(kwargs)

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def run(self, get_name="(none)", setnode_name="", server_url=OLLAMA_DEFAULT_SERVER, model="", system_prompt="", user_prompt="", thinking=False, seed=1, seed_mode=SEED_MODE_FIXED, temperature=0.7, top_p=0.9, repeat_penalty=1.1, model_memory=MEMORY_UNLOAD_AFTER_RUN, keep_minutes=5, comfy_vram_policy=COMFY_VRAM_AUTO, prompt_in=None, image=None, unique_id=None):
        base = _normalize_ollama_url(str(_extract_scalar(server_url, OLLAMA_DEFAULT_SERVER) or OLLAMA_DEFAULT_SERVER))
        model_value = str(_extract_scalar(model, "") or "").strip()
        if not model_value:
            raise RuntimeError("Select an Ollama model before running Ollama LLM Loader (TJ).")
        system_value = str(_extract_scalar(system_prompt, "") or "")
        user_value = str(_extract_scalar(user_prompt, "") or "")
        prompt_inputs = _flatten_prompts(prompt_in)
        prompts: List[str] = []
        for p in prompt_inputs:
            parts = []
            if str(p or "").strip():
                parts.append(str(p).strip())
            if user_value.strip():
                parts.append(user_value.strip())
            prompts.append("\n".join(parts).strip())
        if not prompts:
            prompts = [user_value.strip()]
        thinking_value = _safe_bool(thinking, False)
        seed_value = _safe_int(seed, 1, 0, 0xFFFFFFFF)
        seed_mode_value = _normalize_seed_mode(seed_mode)
        memory_value = _normalize_model_memory(model_memory)
        keep_minutes_value = _safe_int(keep_minutes, 5, 1, 240)
        comfy_policy_value = _normalize_comfy_vram_policy(comfy_vram_policy)
        temp_value = _safe_float(temperature, 0.7, 0.0, 2.0)
        top_p_value = _safe_float(top_p, 0.9, 0.0, 1.0)
        repeat_value = _safe_float(repeat_penalty, 1.1, 0.0, 3.0)
        node_id = str(_extract_scalar(unique_id, "") or "")
        image_attachment = _prepare_image_attachment(image)

        _send_progress({"node_id": node_id, "status": "running", "provider": "Ollama", "model": model_value, "index": 0, "total": len(prompts), "answer": "", "thinking": ""})
        comfy_info = _prepare_comfy_vram_before_llm(base, model_value, comfy_policy_value, node_id)

        responses: List[str] = []
        thoughts: List[str] = []
        raws: List[str] = []
        try:
            for index, prompt in enumerate(prompts):
                current_seed = _seed_for_index(seed_value, seed_mode_value, index)
                is_last = index == len(prompts) - 1
                active_key = _mark_active(base, model_value)
                try:
                    answer, thought, raw = self._run_ollama_once(base, model_value, system_value, prompt, thinking_value, current_seed, temp_value, top_p_value, repeat_value, memory_value, keep_minutes_value, image_attachment, is_last, node_id, index + 1, len(prompts))
                finally:
                    _clear_active(active_key)
                answer, thought = _split_thinking_tags(answer, thought)
                responses.append(answer)
                thoughts.append(thought)
                raw["comfy_vram"] = comfy_info
                raws.append(json.dumps(raw, ensure_ascii=False))
                key = _ollama_state_key(base, model_value)
                if memory_value == MEMORY_KEEP_LOADED:
                    _WARM_OLLAMA_KEYS[key] = None
                elif memory_value == MEMORY_KEEP_MINUTES:
                    _WARM_OLLAMA_KEYS[key] = time.monotonic() + keep_minutes_value * 60
                else:
                    _WARM_OLLAMA_KEYS.pop(key, None)
        except Exception as exc:
            _send_progress({"node_id": node_id, "status": "error", "provider": "Ollama", "model": model_value, "index": len(responses), "total": len(prompts), "answer": "", "thinking": "", "error": str(exc)})
            raise

        _send_progress({"node_id": node_id, "status": "done", "provider": "Ollama", "model": model_value, "index": len(prompts), "total": len(prompts), "answer": responses[-1] if responses else "", "thinking": thoughts[-1] if thoughts else ""})
        return {"ui": {"tj_ollama_loader": [{"response": responses[-1] if responses else "", "thinking": thoughts[-1] if thoughts else "", "raw": raws[-1] if raws else "", "model": model_value}]}, "result": (responses, thoughts, raws)}

    def _run_ollama_once(self, base: str, model: str, system_prompt: str, prompt: str, thinking: bool, seed: int, temperature: float, top_p: float, repeat_penalty: float, model_memory: str, keep_minutes: int, image_attachment: Optional[Dict[str, Any]], is_last: bool, node_id: str, index: int, total: int) -> Tuple[str, str, Dict[str, Any]]:
        messages: List[Dict[str, Any]] = []
        if system_prompt.strip():
            messages.append({"role": "system", "content": system_prompt})
        user_message: Dict[str, Any] = {"role": "user", "content": prompt}
        if image_attachment is not None:
            user_message["images"] = [image_attachment["base64"]]
        messages.append(user_message)
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "think": thinking,
            "options": {"seed": int(seed), "temperature": float(temperature), "top_p": float(top_p), "repeat_penalty": float(repeat_penalty)},
            "keep_alive": _ollama_keep_alive(model_memory, keep_minutes, is_last),
        }
        answer_parts: List[str] = []
        thinking_parts: List[str] = []
        final_meta: Dict[str, Any] = {}
        last_emit = 0.0
        cancel_key = _ollama_state_key(base, model)
        for chunk in _http_stream_json_lines(f"{base}/api/chat", payload, cancel_key=cancel_key):
            if chunk.get("error"):
                raise RuntimeError(str(chunk.get("error")))
            message = chunk.get("message") or {}
            content = str(message.get("content") or "")
            thought = str(message.get("thinking") or "")
            if content:
                answer_parts.append(content)
            if thought:
                thinking_parts.append(thought)
            if chunk.get("done"):
                final_meta = {k: chunk.get(k) for k in ("model", "done_reason", "total_duration", "load_duration", "prompt_eval_count", "eval_count") if k in chunk}
            now = time.monotonic()
            if now - last_emit > 0.12 or content or thought:
                last_emit = now
                _send_progress({"node_id": node_id, "status": "running", "provider": "Ollama", "model": model, "index": index, "total": total, "answer": "".join(answer_parts), "thinking": "".join(thinking_parts)})
        return "".join(answer_parts).strip(), "".join(thinking_parts).strip(), {"provider": "Ollama", "model": model, "seed": seed, "thinking": thinking, "model_memory": model_memory, "keep_minutes": keep_minutes, "api": "Ollama /api/chat", "meta": final_meta}


_CQC_APPROVAL_STATUS: Dict[str, str] = {}
_CQC_APPROVAL_LOCK = threading.Lock()


def _cqc_set_status(node_id: str, status: str) -> None:
    if not node_id:
        return
    with _CQC_APPROVAL_LOCK:
        _CQC_APPROVAL_STATUS[str(node_id)] = str(status)


def _cqc_get_status(node_id: str) -> str:
    with _CQC_APPROVAL_LOCK:
        return _CQC_APPROVAL_STATUS.get(str(node_id), "")


def _cqc_clear_status(node_id: str) -> None:
    with _CQC_APPROVAL_LOCK:
        _CQC_APPROVAL_STATUS.pop(str(node_id), None)


def _raise_cqc_cancelled() -> None:
    exc_cls = getattr(comfy_model_management, "InterruptProcessingException", None) if comfy_model_management else None
    if exc_cls:
        raise exc_cls("LLM Content Quality Controller approval was cancelled.")
    raise RuntimeError("LLM Content Quality Controller approval was cancelled.")


def _send_cqc_waiting(payload: Dict[str, Any]) -> None:
    try:
        sender = getattr(getattr(PromptServer, "instance", None), "send_sync", None)
        if sender:
            sender(CQC_WAIT_EVENT, payload)
    except Exception:
        pass


async def _handle_cqc_approve(request):
    node_id = request.match_info["node_id"].strip()
    _cqc_set_status(node_id, "continue")
    return _json_response({"ok": True, "status": "continue", "node_id": node_id})


async def _handle_cqc_cancel(request):
    node_id = request.match_info["node_id"].strip()
    _cqc_set_status(node_id, "cancelled")
    return _json_response({"ok": True, "status": "cancelled", "node_id": node_id})


if PromptServer is not None:
    try:
        PromptServer.instance.routes.post("/tj/local_llm/cqc/approve/{node_id}")(_handle_cqc_approve)
    except Exception:
        pass
    try:
        PromptServer.instance.routes.post("/tj/local_llm/cqc/cancel/{node_id}")(_handle_cqc_cancel)
    except Exception:
        pass


class TJ_LLMContentQualityController:
    DESCRIPTION = "Local LLM review gate with 3 embedded Get inputs and 3 Auto Set outputs."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "get_name_1": (["(none)"],),
                "get_name_2": (["(none)"],),
                "get_name_3": (["(none)"],),
                "auto_set": ("BOOLEAN", {"default": False, "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
                "review_mode": (["Review", "Pass"], {"default": "Review"}),
                "approve_once": ("BOOLEAN", {"default": False}),
                "pass_words": ("STRING", {"default": "OK, PASS, APPROVE, APPROVED"}),
                "reject_words": ("STRING", {"default": "FAIL, REJECT, BAD"}),
                "unclear_result": (["Reject", "Pass"], {"default": "Reject"}),
                "seed": ("INT", {"default": 1, "min": 0, "max": 0xFFFFFFFF, "step": 1}),
                "seed_mode": (SEED_MODE_OPTIONS, {"default": SEED_MODE_FIXED}),
            },
            "optional": {
                "prompt_in": ("STRING", {"forceInput": True}),
                "image": ("IMAGE",),
                "audio": (any_type,),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("IMAGE", any_type, any_type)
    RETURN_NAMES = ("QC_Image", "QC_audio", "QC_result")
    FUNCTION = "review"
    OUTPUT_NODE = True
    CATEGORY = " ✨ TJ_Node/LLM"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return _local_llm_cache_key(kwargs)

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def review(self, get_name_1="(none)", get_name_2="(none)", get_name_3="(none)", auto_set=False, review_mode="Review", approve_once=False, pass_words="OK, PASS, APPROVE, APPROVED", reject_words="FAIL, REJECT, BAD", unclear_result="Reject", seed=1, seed_mode=SEED_MODE_FIXED, prompt_in=None, image=None, audio=None, unique_id=None):
        review_text = str(_extract_scalar(prompt_in, "") or "")
        normalized_mode = str(_extract_scalar(review_mode, "Review") or "Review").strip()
        node_id = str(_extract_scalar(unique_id, "") or "")
        seed_value = _seed_for_index(_safe_int(seed, 1, 0, 0xFFFFFFFF), _normalize_seed_mode(seed_mode), 0)

        judged_passed, verdict, reason = _judge_review_text(review_text, pass_words, reject_words, unclear_result)
        qc_result = "Save" if judged_passed else "Preview"

        if normalized_mode == "Pass":
            # Pass mode never blocks the workflow, but QC_result still routes the judged result.
            passed = True
        elif _safe_bool(approve_once, False):
            passed, verdict, reason = True, "OK", "Approved once."
            qc_result = "Save"
        else:
            passed = judged_passed

        waiting_approval = False
        if normalized_mode != "Pass" and not passed and node_id:
            waiting_approval = True
            _cqc_set_status(node_id, "paused")
            wait_payload = {
                "node_id": node_id,
                "passed": False,
                "verdict": "WAITING",
                "reason": reason or "Review failed. Waiting for Approve Once or Cancel.",
                "review": review_text,
                "seed": seed_value,
                "seed_mode": _normalize_seed_mode(seed_mode),
                "auto_set": _safe_bool(auto_set, False),
                "waiting_approval": True,
                "qc_result": qc_result,
            }
            _send_cqc_waiting(wait_payload)
            try:
                while _cqc_get_status(node_id) == "paused":
                    time.sleep(0.1)
                    _raise_if_stopped(None)
                status = _cqc_get_status(node_id)
                if status == "cancelled":
                    _raise_cqc_cancelled()
                if status == "continue":
                    passed, verdict, reason = True, "OK", "Approved once."
                    qc_result = "Save"
                    waiting_approval = False
            finally:
                _cqc_clear_status(node_id)

        raw = {
            "passed": bool(passed),
            "verdict": verdict,
            "reason": reason,
            "review": review_text,
            "seed": seed_value,
            "seed_mode": _normalize_seed_mode(seed_mode),
            "auto_set": _safe_bool(auto_set, False),
            "waiting_approval": bool(waiting_approval),
            "qc_result": qc_result,
        }
        blocker = ExecutionBlocker(None)
        out1 = image if passed else blocker
        out2 = audio if passed else blocker
        return {"ui": {"tj_llm_content_quality_controller": [dict(raw)]}, "result": (out1, out2, qc_result)}

