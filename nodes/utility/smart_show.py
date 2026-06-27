# nodes/utility/smart_show.py
import os
import re
import random
import numpy as np
import torch
from PIL import Image
import folder_paths
from ...core.tj_types import any_type
from ._utility_utils import (
    _tj_audio_payload, _tj_write_wav, get_supported_files
)


class TJ_SmartShow:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "get_name": (["(none)"],),
                "setnode_name": ("STRING", {"default": ""}),
                "file": (["(none)"] + get_supported_files(),),
                "edit_mode": ("BOOLEAN", {"default": False}),
                "text_content": ("STRING", {"default": ""}),
            },
            "optional": {
                "input": (any_type,),
            }
        }

    @classmethod
    def VALIDATE_INPUTS(s, file, **kwargs):
        return True

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("output",)
    FUNCTION = "process"
    CATEGORY = " ✨ TJ_Node/Preview"
    OUTPUT_NODE = True

    def process(self, get_name, setnode_name, file, edit_mode, text_content, input=None):
        target_data = input

        if target_data is None and file != "(none)":
            input_dir = folder_paths.get_input_directory()
            file_path = os.path.join(input_dir, file)
            if os.path.exists(file_path):
                ext = os.path.splitext(file_path)[1].lower()
                if ext == '.txt':
                    with open(file_path, "r", encoding="utf-8") as f:
                        target_data = f.read()
                elif ext in {'.jpg', '.jpeg', '.png', '.webp'}:
                    img = Image.open(file_path).convert("RGB")
                    img_np = np.array(img).astype(np.float32) / 255.0
                    target_data = torch.from_numpy(img_np).unsqueeze(0)
                elif ext in {'.mp4', '.mov', '.webm', '.avi'}:
                    return {"ui": {"tj_type": ["video_file"], "tj_data": [{"filename": file, "subfolder": "", "type": "input"}]}, "result": (file_path,)}
                elif ext in {'.mp3', '.m4a', '.wav', '.flac'}:
                    return {"ui": {"tj_type": ["audio_file"], "tj_data": [{"filename": file, "subfolder": "", "type": "input"}]}, "result": (file_path,)}

        if target_data is None:
            return {"ui": {"tj_type": ["none"], "tj_data": []}, "result": (None,)}

        def find_media_path(obj):
            try:
                if isinstance(obj, str):
                    return obj
                if isinstance(obj, (list, tuple)):
                    for item in obj:
                        res = find_media_path(item)
                        if res:
                            return res
                if isinstance(obj, dict):
                    for v in obj.values():
                        res = find_media_path(v)
                        if res:
                            return res
                if hasattr(obj, '__dict__'):
                    for v in vars(obj).values():
                        res = find_media_path(v)
                        if res:
                            return res
                if hasattr(obj, 'get_full_path'):
                    return obj.get_full_path()
                if hasattr(obj, 'path'):
                    return obj.path
                s = str(obj)
                m = re.search(r"(['\"])([A-Za-z]:\\[^\1]+|\/[^\1]+)\1", s)
                if m:
                    return m.group(2)
                return s
            except Exception:
                pass
            return None

        found_path = find_media_path(target_data)
        if found_path and isinstance(found_path, str):
            input_dir = folder_paths.get_input_directory()
            output_dir = folder_paths.get_output_directory()
            resolved_path = None
            if os.path.isabs(found_path) and os.path.exists(found_path):
                resolved_path = found_path
            elif os.path.exists(os.path.join(input_dir, found_path)):
                resolved_path = os.path.join(input_dir, found_path)
            elif os.path.exists(os.path.join(output_dir, found_path)):
                resolved_path = os.path.join(output_dir, found_path)
            if resolved_path:
                ext = os.path.splitext(resolved_path)[1].lower()
                if ext in {'.mp4', '.mov', '.webm', '.avi', '.mp3', '.m4a', '.wav', '.flac'}:
                    out_type = "video_file" if ext in {'.mp4', '.mov', '.webm', '.avi'} else "audio_file"
                    if resolved_path.startswith(input_dir):
                        rel = os.path.relpath(resolved_path, input_dir)
                        return {"ui": {"tj_type": [out_type], "tj_data": [{"filename": os.path.basename(rel), "subfolder": os.path.dirname(rel), "type": "input"}]}, "result": (target_data,)}
                    elif resolved_path.startswith(output_dir):
                        rel = os.path.relpath(resolved_path, output_dir)
                        return {"ui": {"tj_type": [out_type], "tj_data": [{"filename": os.path.basename(rel), "subfolder": os.path.dirname(rel), "type": "output"}]}, "result": (target_data,)}
                    else:
                        out_dir_tmp = folder_paths.get_temp_directory()
                        rnd = random.randint(10000, 99999)
                        temp_filename = f"tj_media_ext_{rnd}{ext}"
                        temp_path = os.path.join(out_dir_tmp, temp_filename)
                        try:
                            import shutil
                            shutil.copy2(resolved_path, temp_path)
                            return {"ui": {"tj_type": [out_type], "tj_data": [{"filename": temp_filename, "subfolder": "", "type": "temp"}]}, "result": (target_data,)}
                        except Exception:
                            pass

        if isinstance(target_data, str):
            final_output = text_content if edit_mode else target_data
            return {"ui": {"tj_type": ["text"], "tj_data": [target_data]}, "result": (final_output,)}

        if isinstance(target_data, torch.Tensor) and len(target_data.shape) == 4:
            out_dir = folder_paths.get_temp_directory()
            os.makedirs(out_dir, exist_ok=True)
            results = []
            rnd = random.randint(10000, 99999)
            for i in range(target_data.shape[0]):
                img_np = 255.0 * target_data[i].cpu().numpy()
                img = Image.fromarray(np.clip(img_np, 0, 255).astype(np.uint8))
                filename = f"tj_smart_{rnd}_{i:04d}.jpg"
                file_path = os.path.join(out_dir, filename)
                img.save(file_path, format="JPEG", quality=80)
                results.append({"filename": filename, "subfolder": "", "type": "temp"})
            return {"ui": {"tj_type": ["image"], "tj_data": results}, "result": (target_data,)}

        if isinstance(target_data, dict):
            try:
                if _tj_audio_payload(target_data):
                    out_dir = folder_paths.get_temp_directory()
                    os.makedirs(out_dir, exist_ok=True)
                    rnd = random.randint(10000, 99999)
                    filename = f"tj_audio_{rnd}.wav"
                    file_path = os.path.join(out_dir, filename)
                    written = _tj_write_wav(target_data, file_path)
                    if written:
                        return {"ui": {"tj_type": ["audio_file"], "tj_data": [{"filename": filename, "subfolder": "", "type": "temp"}]}, "result": (target_data,)}
            except Exception:
                pass

        try:
            import numbers
            if isinstance(target_data, (bool, int, float, np.bool_, np.integer, np.floating, numbers.Number)):
                return {"ui": {"tj_type": ["text"], "tj_data": [str(target_data)]}, "result": (target_data,)}
            if isinstance(target_data, torch.Tensor) and target_data.numel() == 1:
                val = target_data.detach().cpu().item()
                return {"ui": {"tj_type": ["text"], "tj_data": [str(val)]}, "result": (target_data,)}
        except Exception:
            pass

        return {"ui": {"tj_type": ["unknown"], "tj_data": [str(type(target_data))]}, "result": (target_data,)}
