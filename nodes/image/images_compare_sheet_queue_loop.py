# nodes/image/images_compare_sheet_queue_loop.py
# Queue Loop 결과 이미지를 큐 순서대로 수집(배치 포함)해 비교 시트로 합성합니다.

from __future__ import annotations

import math
import os
import re
import threading
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont


@dataclass
class _Item:
    image: torch.Tensor  # [1, H, W, C]
    label: str


@dataclass
class _Session:
    total_count: int
    # key = 1-based queue index, value = 해당 큐 실행에서 수집된 이미지 목록(배치 포함)
    items: Dict[int, List[_Item]] = field(default_factory=dict)


class TJ_ImagesCompareSheetQueueLoop:
    _sessions: Dict[str, _Session] = {}
    _lock = threading.RLock()

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "index": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": 999999,
                    "step": 1,
                    "tooltip": "Queue Loop의 1-based 인덱스. 첫 번째 큐는 1.",
                }),
                "total_count": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": 999999,
                    "step": 1,
                    "tooltip": "Queue Loop의 총 실행 횟수. Queue Loop의 queue_count 출력을 연결하세요.",
                }),
                "auto_set": ("BOOLEAN", {
                    "default": False,
                    "label_on": "Auto Set ON",
                    "label_off": "Auto Set OFF",
                }),
                "name_source": (["INPUT", "TEXT", "AUTO"], {"default": "INPUT"}),
                "name_text": ("STRING", {"default": "", "multiline": False}),
                "fallback_enabled": ("BOOLEAN", {"default": True}),
                "auto_name_prefix": ("STRING", {"default": "image", "multiline": False}),
                "index_digits": ("INT", {"default": 3, "min": 1, "max": 8, "step": 1}),
                "remove_extension": ("BOOLEAN", {"default": True}),
                "sheet_name": ("STRING", {"default": "Images_Compare_Sheet", "multiline": False}),
                "layout_mode": (["GRID", "HORIZONTAL", "VERTICAL"], {"default": "GRID"}),
                "auto_layout": ("BOOLEAN", {"default": True}),
                "rows": ("INT", {"default": 1, "min": 1, "max": 128, "step": 1}),
                "columns": ("INT", {"default": 4, "min": 1, "max": 128, "step": 1}),
                "fill_direction": (["ROW_FIRST", "COLUMN_FIRST"], {"default": "ROW_FIRST"}),
                "padding": ("INT", {"default": 8, "min": 0, "max": 256, "step": 1}),
                "show_label": ("BOOLEAN", {"default": True}),
                "label_position": (["BOTTOM", "TOP"], {"default": "BOTTOM"}),
                "font_size": ("INT", {"default": 24, "min": 8, "max": 256, "step": 1}),
                "label_height": ("INT", {"default": 48, "min": 0, "max": 512, "step": 1}),
                "text_align": (["LEFT", "CENTER", "RIGHT"], {"default": "CENTER"}),
                "text_color": ("STRING", {"default": "#FFFFFF", "multiline": False}),
                "label_background_color": ("STRING", {"default": "#000000", "multiline": False}),
                "resize_mode": (["PAD", "FIT", "CROP", "NONE"], {"default": "PAD"}),
                "cell_width": ("INT", {"default": 0, "min": 0, "max": 16384, "step": 1}),
                "cell_height": ("INT", {"default": 0, "min": 0, "max": 16384, "step": 1}),
                "sheet_background_color": ("STRING", {"default": "#000000", "multiline": False}),
                "reset": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "name": ("STRING", {"forceInput": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "STRING", "BOOLEAN", "INT")
    RETURN_NAMES = ("sheet", "current_image", "output_name", "is_complete", "collected_count")
    FUNCTION = "build"
    CATEGORY = " ✨ TJ_Node/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    @staticmethod
    def _clean_name(value: Optional[str], remove_extension: bool) -> str:
        text = str(value or "").strip()
        if remove_extension and text:
            text = re.sub(
                r"\.(safetensors|ckpt|pt|pth|bin|png|jpg|jpeg|webp|bmp|tif|tiff)$",
                "",
                text,
                flags=re.I,
            )
        return text

    @classmethod
    def _resolve_label(
        cls,
        index: int,
        input_name: Optional[str],
        name_source: str,
        name_text: str,
        fallback_enabled: bool,
        auto_name_prefix: str,
        index_digits: int,
        remove_extension: bool,
    ) -> str:
        input_value = cls._clean_name(input_name, remove_extension)
        text_value = cls._clean_name(name_text, remove_extension)
        prefix = (auto_name_prefix or "image").strip() or "image"
        auto_value = f"{prefix}_{index:0{index_digits}d}"

        if name_source == "AUTO":
            return auto_value
        if name_source == "TEXT":
            if text_value:
                return text_value
            if fallback_enabled and input_value:
                return input_value
            return auto_value if fallback_enabled else ""

        if input_value:
            return input_value
        if fallback_enabled and text_value:
            return text_value
        return auto_value if fallback_enabled else ""

    @staticmethod
    def _extract_items(image: torch.Tensor, base_label: str) -> List[_Item]:
        """배치 이미지 텐서 [B,H,W,C] 에서 프레임별 _Item 목록을 반환합니다."""
        if not isinstance(image, torch.Tensor) or image.ndim != 4 or image.shape[0] < 1:
            raise ValueError("image must be a ComfyUI IMAGE tensor [B,H,W,C].")

        result = []
        batch_size = image.shape[0]
        for i in range(batch_size):
            frame = image[i:i+1].detach().cpu().clamp(0.0, 1.0)
            # 배치 프레임이 여러 개면 라벨 뒤에 번호를 붙입니다.
            label = f"{base_label} [{i + 1}]" if batch_size > 1 else base_label
            result.append(_Item(frame, label))
        return result

    @staticmethod
    def _to_pil(image: torch.Tensor) -> Image.Image:
        arr = (image[0].numpy() * 255.0).round().clip(0, 255).astype(np.uint8)
        if arr.shape[-1] == 1:
            arr = np.repeat(arr, 3, axis=-1)
        if arr.shape[-1] > 3:
            arr = arr[..., :3]
        return Image.fromarray(arr, mode="RGB")

    @staticmethod
    def _to_tensor(image: Image.Image) -> torch.Tensor:
        arr = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
        return torch.from_numpy(arr)[None, ...]

    @staticmethod
    def _color(value: str, default: str) -> str:
        v = str(value or "").strip()
        if re.fullmatch(r"#[0-9a-fA-F]{6}", v):
            return v
        return default

    @staticmethod
    def _font(size: int):
        candidates = [
            "malgun.ttf",
            "C:/Windows/Fonts/malgun.ttf",
            "/System/Library/Fonts/AppleSDGothicNeo.ttc",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
        for path in candidates:
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:
                pass
        return ImageFont.load_default()

    @staticmethod
    def _fit_image(img: Image.Image, target: Tuple[int, int], mode: str, bg: str) -> Image.Image:
        tw, th = target
        if mode == "NONE":
            canvas = Image.new("RGB", (tw, th), bg)
            x = max(0, (tw - img.width) // 2)
            y = max(0, (th - img.height) // 2)
            canvas.paste(img.crop((0, 0, min(img.width, tw), min(img.height, th))), (x, y))
            return canvas

        if mode == "CROP":
            scale = max(tw / img.width, th / img.height)
        else:
            scale = min(tw / img.width, th / img.height)
        nw = max(1, round(img.width * scale))
        nh = max(1, round(img.height * scale))
        resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
        if mode == "CROP":
            left = max(0, (nw - tw) // 2)
            top = max(0, (nh - th) // 2)
            return resized.crop((left, top, left + tw, top + th))
        canvas = Image.new("RGB", (tw, th), bg)
        canvas.paste(resized, ((tw - nw) // 2, (th - nh) // 2))
        return canvas

    @staticmethod
    def _layout(total: int, layout_mode: str, auto_layout: bool, rows: int, columns: int):
        if layout_mode == "HORIZONTAL":
            return 1, total
        if layout_mode == "VERTICAL":
            return total, 1
        if auto_layout:
            columns = max(1, columns)
            return math.ceil(total / columns), columns
        if rows * columns < total:
            raise ValueError("rows × columns is smaller than the total image count.")
        return rows, columns

    @classmethod
    def _compose(
        cls,
        ordered: List[_Item],
        layout_mode: str,
        auto_layout: bool,
        rows: int,
        columns: int,
        fill_direction: str,
        padding: int,
        show_label: bool,
        label_position: str,
        font_size: int,
        label_height: int,
        text_align: str,
        text_color: str,
        label_background_color: str,
        resize_mode: str,
        cell_width: int,
        cell_height: int,
        sheet_background_color: str,
    ) -> torch.Tensor:
        total = len(ordered)
        pil_images = [cls._to_pil(item.image) for item in ordered]
        cw = cell_width or pil_images[0].width
        ch = cell_height or pil_images[0].height
        rows, columns = cls._layout(total, layout_mode, auto_layout, rows, columns)

        label_h = max(label_height, font_size + 8) if show_label else 0
        tile_h = ch + label_h
        sheet_w = columns * cw + max(0, columns - 1) * padding
        sheet_h = rows * tile_h + max(0, rows - 1) * padding
        bg = cls._color(sheet_background_color, "#000000")
        label_bg = cls._color(label_background_color, "#000000")
        fg = cls._color(text_color, "#FFFFFF")
        sheet = Image.new("RGB", (sheet_w, sheet_h), bg)
        font = cls._font(font_size)

        for ordinal, (item, img) in enumerate(zip(ordered, pil_images)):
            if fill_direction == "COLUMN_FIRST":
                col = ordinal // rows
                row = ordinal % rows
            else:
                row = ordinal // columns
                col = ordinal % columns
            x = col * (cw + padding)
            y = row * (tile_h + padding)
            tile = cls._fit_image(img, (cw, ch), resize_mode, bg)
            image_y = y + label_h if show_label and label_position == "TOP" else y
            sheet.paste(tile, (x, image_y))

            if show_label:
                label_y = y if label_position == "TOP" else y + ch
                draw = ImageDraw.Draw(sheet)
                draw.rectangle((x, label_y, x + cw, label_y + label_h), fill=label_bg)
                label = item.label
                bbox = draw.textbbox((0, 0), label, font=font)
                tw_text = bbox[2] - bbox[0]
                th_text = bbox[3] - bbox[1]
                if text_align == "LEFT":
                    tx = x + 8
                elif text_align == "RIGHT":
                    tx = x + cw - tw_text - 8
                else:
                    tx = x + (cw - tw_text) // 2
                ty = label_y + max(0, (label_h - th_text) // 2) - bbox[1]
                draw.text((tx, ty), label, fill=fg, font=font)

        return cls._to_tensor(sheet)

    def build(
        self,
        image,
        index,
        total_count,
        auto_set=False,
        name_source="INPUT",
        name_text="",
        fallback_enabled=True,
        auto_name_prefix="image",
        index_digits=3,
        remove_extension=True,
        sheet_name="Images_Compare_Sheet",
        layout_mode="GRID",
        auto_layout=True,
        rows=1,
        columns=4,
        fill_direction="ROW_FIRST",
        padding=8,
        show_label=True,
        label_position="BOTTOM",
        font_size=24,
        label_height=48,
        text_align="CENTER",
        text_color="#FFFFFF",
        label_background_color="#000000",
        resize_mode="PAD",
        cell_width=0,
        cell_height=0,
        sheet_background_color="#000000",
        reset=False,
        name=None,
        unique_id=None,
    ):
        if total_count < 1:
            raise ValueError("total_count must be >= 1.")
        if index < 1 or index > total_count:
            raise ValueError(
                f"index {index} is out of range 1-{total_count}. "
                "Connect Queue Loop's queue_count output to total_count."
            )

        key = str(unique_id or "default")

        # 라벨 결정 (배치 개별 라벨은 _extract_items 내부에서 처리)
        base_label = self._resolve_label(
            index, name, name_source, name_text,
            fallback_enabled, auto_name_prefix, index_digits, remove_extension,
        )

        # 배치 전체 이미지 추출 → List[_Item]
        new_items = self._extract_items(image, base_label)

        with self._lock:
            session = self._sessions.get(key)
            if reset or index == 1 or session is None or session.total_count != total_count:
                session = _Session(total_count=total_count)
                self._sessions[key] = session

            # 같은 index가 재입력되면 덮어씁니다.
            session.items[index] = new_items

            # 수집된 큐 실행 수(이미지 개수가 아닌 큐 횟수)로 완료 판정합니다.
            collected_runs = len(session.items)
            complete = (
                collected_runs == total_count
                and all(i in session.items for i in range(1, total_count + 1))
            )

            # collected_count는 락 안에서 계산합니다.
            total_images_so_far = sum(len(v) for v in session.items.values())

            if complete:
                # 완료: 전체 시트 합성 후 메모리 해제
                ordered: List[_Item] = []
                for i in range(1, total_count + 1):
                    ordered.extend(session.items.get(i, []))
                result = self._compose(
                    ordered,
                    layout_mode, auto_layout, rows, columns,
                    fill_direction, padding, show_label, label_position,
                    font_size, label_height, text_align, text_color,
                    label_background_color, resize_mode, cell_width, cell_height,
                    sheet_background_color,
                )
                del self._sessions[key]
            else:
                # 미완료: 현재 입력 이미지의 첫 프레임을 패스스루
                result = new_items[0].image

        # current_image: 현재 큐 실행의 첫 번째 프레임 (항상 패스스루)
        current_image = new_items[0].image
        output_name = str(sheet_name or "Images_Compare_Sheet").strip() or "Images_Compare_Sheet"
        return (result, current_image, output_name, complete, total_images_so_far)
