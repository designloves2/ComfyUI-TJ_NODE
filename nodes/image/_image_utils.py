# nodes/image/_image_utils.py
# image 카테고리 노드들이 공통으로 사용하는 유틸 함수

import os
import re
import numpy as np
from PIL import Image
from pathlib import Path


ECLIPSE_NAME_REGISTRY = {}


def _tj_safe_filename_part(name: str) -> str:
    """파일명 구성요소에서 경로 구분자와 순회 시퀀스를 제거합니다."""
    if not name:
        return name
    name = re.sub(r'[\\/]', '', str(name))
    name = re.sub(r'^\.+', '', name)
    return name


def save_image_with_quality(img_obj, file_path, ext):
    ext = ext.lower().strip('.')
    if ext == 'png':
        img_obj.save(file_path, format='PNG', compress_level=3)
    elif ext in ['jpg', 'jpeg']:
        img_obj.save(file_path, format='JPEG', quality=100, subsampling=0, optimize=True)
    elif ext == 'webp':
        img_obj.save(file_path, format='WEBP', lossless=True, quality=100)
    else:
        img_obj.save(file_path, format='PNG')


def resolve_target_dir(base_dir_path, input_path_str):
    """Resolve save target safely inside ComfyUI output directory only."""
    import folder_paths
    import re

    output_root = Path(folder_paths.get_output_directory()).resolve()
    base_dir = Path(base_dir_path).resolve()
    input_str = str(input_path_str or "").strip()

    if not input_str:
        resolved_path = base_dir
    else:
        if Path(input_str).is_absolute() or re.match(r"^[A-Za-z]:[\\/]", input_str):
            raise ValueError("TJ_NODE: absolute save paths are not allowed.")

        normalized = input_str.replace("\\", "/").strip("/")
        parts = [p for p in normalized.split("/") if p]
        if any(p == ".." for p in parts):
            raise ValueError("TJ_NODE: '..' is not allowed in save paths.")

        resolved_path = (base_dir / "/".join(parts)).resolve()

    try:
        if os.path.commonpath([str(output_root), str(resolved_path)]) != str(output_root):
            raise ValueError
    except Exception:
        raise ValueError("TJ_NODE: save path must stay inside ComfyUI/output.")

    return resolved_path
