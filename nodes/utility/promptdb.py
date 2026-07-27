# nodes/utility/promptdb.py
"""TJ_PromptDB — log prompts/settings/thumbnails to an Excel workbook and browse
them back into a workflow via a gallery-style loader node.

Two nodes:
  TJ_PromptDBSave — appends one row per image in the batch to excel_path
  TJ_PromptDBLoader — thumbnail-grid browser; outputs the selected row's fields
"""

import base64
import ipaddress
import os
import re
import time
from datetime import datetime
from io import BytesIO
from typing import Any, Dict, List, Optional

import numpy as np
from PIL import Image

try:
    from openpyxl import Workbook, load_workbook
    from openpyxl.drawing.image import Image as XLImage
    from openpyxl.styles import Font
    from openpyxl.utils import get_column_letter
except Exception:
    Workbook = load_workbook = XLImage = Font = get_column_letter = None

try:
    from server import PromptServer
    from aiohttp import web
except Exception:
    PromptServer = None
    web = None

TJ_PROMPT_PIPE = "TJ_PROMPT_PIPE"

# Fixed column order — Logger writes it, Loader reads it. Both nodes must agree, so this
# is the single source of truth for the layout (col index is position in this list, 1-based).
HEADERS = ["ID", "날짜", "Positive Prompt", "Negative Prompt", "Model", "Seed", "Steps", "CFG", "기타 설정", "썸네일", "원본 경로"]
(COL_ID, COL_DATE, COL_POS, COL_NEG, COL_MODEL, COL_SEED, COL_STEPS, COL_CFG, COL_EXTRA, COL_THUMB, COL_SRC) = range(1, 12)

THUMB_SUBDIR = "_tj_thumbnails_tmp"
SAVE_RETRIES = 3
SAVE_RETRY_DELAY = 0.6


def _resolve_excel_path(excel_path: str) -> str:
    path = os.path.expandvars(os.path.expanduser(str(excel_path or "").strip()))
    if "\x00" in path:
        raise ValueError("Invalid excel_path")
    return os.path.normpath(path)


def _thumb_dir_for(excel_path: str) -> str:
    return os.path.join(os.path.dirname(excel_path), THUMB_SUBDIR)


def _open_or_create_workbook(excel_path: str):
    if os.path.isfile(excel_path):
        wb = load_workbook(excel_path)
        ws = wb.active
        return wb, ws
    os.makedirs(os.path.dirname(excel_path) or ".", exist_ok=True)
    wb = Workbook()
    ws = wb.active
    ws.title = "Prompts"
    for col, title in enumerate(HEADERS, start=1):
        cell = ws.cell(row=1, column=col, value=title)
        cell.font = Font(bold=True)
    ws.freeze_panes = "A2"
    widths = {COL_ID: 6, COL_DATE: 12, COL_POS: 42, COL_NEG: 32, COL_MODEL: 18,
              COL_SEED: 10, COL_STEPS: 8, COL_CFG: 8, COL_EXTRA: 24, COL_THUMB: 10, COL_SRC: 32}
    for col, w in widths.items():
        ws.column_dimensions[get_column_letter(col)].width = w
    return wb, ws


def _next_id(ws) -> int:
    max_id = 0
    for row in ws.iter_rows(min_row=2, max_col=1, values_only=True):
        val = row[0]
        if isinstance(val, (int, float)):
            max_id = max(max_id, int(val))
    return max_id + 1


def _save_with_retry(wb, excel_path: str) -> None:
    last_exc = None
    for attempt in range(SAVE_RETRIES):
        try:
            wb.save(excel_path)
            return
        except PermissionError as exc:
            last_exc = exc
            time.sleep(SAVE_RETRY_DELAY)
        except Exception as exc:
            last_exc = exc
            time.sleep(SAVE_RETRY_DELAY)
    raise RuntimeError(
        f"Could not save {excel_path} after {SAVE_RETRIES} attempts "
        f"(is it open in Excel or another program?): {last_exc}"
    )


def _tensor_to_pil(image_slice: Any) -> Image.Image:
    img = image_slice[0] if hasattr(image_slice, "dim") and image_slice.dim() == 4 else image_slice
    arr = (img.detach().cpu().numpy() * 255.0).clip(0, 255).astype("uint8")
    return Image.fromarray(arr)


class TJ_PromptDBSave:
    DESCRIPTION = "Appends one row per image (prompt/settings/thumbnail) to an Excel workbook."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "positive_prompt": ("STRING", {"multiline": True, "default": ""}),
                "excel_path": ("STRING", {"default": ""}),
                "thumbnail_size": ("INT", {"default": 48, "min": 16, "max": 512, "step": 8}),
            },
            "optional": {
                "negative_prompt": ("STRING", {"multiline": True, "default": ""}),
                "model_name": ("STRING", {"default": ""}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "steps": ("INT", {"default": 0, "min": 0, "max": 10000}),
                "cfg": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100.0, "step": 0.1}),
                "extra_settings": ("STRING", {"multiline": True, "default": ""}),
                "source_path": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "log"
    CATEGORY = " ✨ TJ_Node/Utility"
    OUTPUT_NODE = True

    def log(self, images, positive_prompt, excel_path, thumbnail_size,
            negative_prompt="", model_name="", seed=0, steps=0, cfg=0.0,
            extra_settings="", source_path=""):
        if Workbook is None:
            raise RuntimeError("openpyxl is required for TJ_PromptDBSave. pip install openpyxl")

        path = _resolve_excel_path(excel_path)
        if not path:
            raise ValueError("excel_path is required.")

        wb, ws = _open_or_create_workbook(path)
        thumb_dir = _thumb_dir_for(path)
        os.makedirs(thumb_dir, exist_ok=True)

        count = images.shape[0] if hasattr(images, "shape") and len(images.shape) == 4 else 1
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        thumb_px = int(thumbnail_size)

        for i in range(count):
            row_id = _next_id(ws)
            row_idx = ws.max_row + 1

            pil = _tensor_to_pil(images[i:i + 1] if count > 1 else images)
            pil.thumbnail((thumb_px, thumb_px), Image.Resampling.LANCZOS)
            thumb_path = os.path.join(thumb_dir, f"row_{row_id}.png")
            pil.save(thumb_path, format="PNG")

            ws.cell(row=row_idx, column=COL_ID, value=row_id)
            ws.cell(row=row_idx, column=COL_DATE, value=now_str)
            ws.cell(row=row_idx, column=COL_POS, value=str(positive_prompt or ""))
            ws.cell(row=row_idx, column=COL_NEG, value=str(negative_prompt or ""))
            ws.cell(row=row_idx, column=COL_MODEL, value=str(model_name or ""))
            ws.cell(row=row_idx, column=COL_SEED, value=int(seed))
            ws.cell(row=row_idx, column=COL_STEPS, value=int(steps))
            ws.cell(row=row_idx, column=COL_CFG, value=float(cfg))
            ws.cell(row=row_idx, column=COL_EXTRA, value=str(extra_settings or ""))
            ws.cell(row=row_idx, column=COL_SRC, value=str(source_path or ""))

            ws.row_dimensions[row_idx].height = max(15, thumb_px * 0.75)
            try:
                xl_img = XLImage(thumb_path)
                xl_img.width, xl_img.height = pil.width, pil.height
                ws.add_image(xl_img, f"{get_column_letter(COL_THUMB)}{row_idx}")
            except Exception:
                pass  # thumbnail embed is best-effort; the row's data is what matters

        _save_with_retry(wb, path)
        return (images,)


class TJ_PromptDBLoader:
    DESCRIPTION = "Gallery browser for a TJ_PromptDBSave workbook — click a thumbnail to load its row."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "excel_path": ("STRING", {"default": ""}),
            },
            "optional": {
                # JS-managed selection state, serialized with the workflow so the selection
                # survives reload. Not meant to be hand-edited.
                "selected_id": ("INT", {"default": -1, "min": -1, "max": 0x7fffffff}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "INT", "INT", "FLOAT", "STRING", "STRING", TJ_PROMPT_PIPE)
    RETURN_NAMES = ("positive_prompt", "negative_prompt", "model_name", "seed", "steps", "cfg", "extra_settings", "source_path", "pipe")
    FUNCTION = "load"
    CATEGORY = " ✨ TJ_Node/Utility"

    def load(self, excel_path, selected_id=-1):
        if load_workbook is None:
            raise RuntimeError("openpyxl is required for TJ_PromptDBLoader. pip install openpyxl")

        path = _resolve_excel_path(excel_path)
        if not path or not os.path.isfile(path):
            raise FileNotFoundError(f"Excel file not found: {path}")
        if int(selected_id) < 0:
            raise RuntimeError("No row selected — click a thumbnail in the TJ_PromptDBLoader grid first.")

        wb = load_workbook(path, read_only=True, data_only=True)
        ws = wb.active
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row and row[COL_ID - 1] == int(selected_id):
                positive = str(row[COL_POS - 1] or "")
                negative = str(row[COL_NEG - 1] or "")
                model = str(row[COL_MODEL - 1] or "")
                seed = int(row[COL_SEED - 1] or 0)
                steps = int(row[COL_STEPS - 1] or 0)
                cfg = float(row[COL_CFG - 1] or 0.0)
                extra = str(row[COL_EXTRA - 1] or "")
                source = str(row[COL_SRC - 1] or "")
                pipe = {
                    "positive_prompt": positive, "negative_prompt": negative, "model_name": model,
                    "seed": seed, "steps": steps, "cfg": cfg, "extra_settings": extra, "source_path": source,
                }
                return (positive, negative, model, seed, steps, cfg, extra, source, pipe)

        raise RuntimeError(f"Row ID {selected_id} not found in {path} (was it deleted from the sheet?).")


# ── Local API: gallery listing + row update for the Loader's JS grid ───────────

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
    """This API reads/writes an arbitrary local Excel file path the user configured on the
    node (same trust model as the local Video Grid Comparer viewer in core/tj_api.py) — so
    it must stay loopback-only to avoid a remote/CSRF caller driving arbitrary file reads."""
    if not _is_loopback(request.remote):
        return web.json_response({"ok": False, "error": "Local (loopback) requests only."}, status=403)
    return None


def _thumbnail_data_uri(thumb_path: str) -> str:
    try:
        with open(thumb_path, "rb") as f:
            return "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")
    except Exception:
        return ""


async def _handle_list_rows(request):
    blocked = _local_only(request)
    if blocked is not None:
        return blocked
    try:
        payload = await request.json()
        path = _resolve_excel_path(payload.get("excel_path", ""))
        if not path or not os.path.isfile(path):
            return web.json_response({"rows": []})

        thumb_dir = _thumb_dir_for(path)
        wb = load_workbook(path, read_only=True, data_only=True)
        ws = wb.active
        rows = []
        for row in ws.iter_rows(min_row=2, values_only=True):
            if not row or row[COL_ID - 1] is None:
                continue
            row_id = int(row[COL_ID - 1])
            thumb_path = os.path.join(thumb_dir, f"row_{row_id}.png")
            rows.append({
                "id": row_id,
                "date": str(row[COL_DATE - 1] or ""),
                "positive_prompt": str(row[COL_POS - 1] or ""),
                "negative_prompt": str(row[COL_NEG - 1] or ""),
                "model_name": str(row[COL_MODEL - 1] or ""),
                "seed": row[COL_SEED - 1],
                "steps": row[COL_STEPS - 1],
                "cfg": row[COL_CFG - 1],
                "extra_settings": str(row[COL_EXTRA - 1] or ""),
                "source_path": str(row[COL_SRC - 1] or ""),
                "thumbnail": _thumbnail_data_uri(thumb_path),
            })
        rows.sort(key=lambda r: r["id"], reverse=True)
        return web.json_response({"rows": rows})
    except Exception as exc:
        return web.json_response({"rows": [], "error": str(exc)}, status=500)


async def _handle_update_row(request):
    blocked = _local_only(request)
    if blocked is not None:
        return blocked
    try:
        payload = await request.json()
        path = _resolve_excel_path(payload.get("excel_path", ""))
        row_id = int(payload.get("id", -1))
        fields = payload.get("fields") or {}
        if not path or not os.path.isfile(path):
            return web.json_response({"ok": False, "error": "Excel file not found"}, status=404)

        wb = load_workbook(path)
        ws = wb.active
        target_row = None
        for row in ws.iter_rows(min_row=2):
            cell = row[COL_ID - 1]
            if cell.value == row_id:
                target_row = row[0].row
                break
        if target_row is None:
            return web.json_response({"ok": False, "error": f"Row ID {row_id} not found"}, status=404)

        field_col = {
            "positive_prompt": COL_POS, "negative_prompt": COL_NEG, "model_name": COL_MODEL,
            "seed": COL_SEED, "steps": COL_STEPS, "cfg": COL_CFG,
            "extra_settings": COL_EXTRA, "source_path": COL_SRC,
        }
        for key, col in field_col.items():
            if key not in fields:
                continue
            value = fields[key]
            if key == "seed":
                value = int(value or 0)
            elif key == "steps":
                value = int(value or 0)
            elif key == "cfg":
                value = float(value or 0.0)
            else:
                value = str(value or "")
            ws.cell(row=target_row, column=col, value=value)

        _save_with_retry(wb, path)
        return web.json_response({"ok": True})
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=400)


if PromptServer is not None:
    PromptServer.instance.routes.post("/tj_node/promptdb/list_rows")(_handle_list_rows)
    PromptServer.instance.routes.post("/tj_node/promptdb/update_row")(_handle_update_row)
