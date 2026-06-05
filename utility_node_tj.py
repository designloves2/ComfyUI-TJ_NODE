# utility_node_tj.py

import os
import random
import torch
import re
from datetime import datetime
import numpy as np
from PIL import Image
import folder_paths

class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False
any_type = AnyType("*")

def _tj_expand_datetime_aliases(text):
    """Expand TJ date aliases before datetime.strftime."""
    if not text:
        return text
    text = str(text)
    text = text.replace("%date", "%Y-%m-%d")
    text = text.replace("%time", "%H-%M-%S")
    return text

def _tj_safe_output_dir(path_text=""):
    """Resolve a user save path safely inside ComfyUI output directory only."""
    output_root = os.path.realpath(folder_paths.get_output_directory())
    raw = str(path_text or "").strip()

    if not raw:
        return output_root

    if os.path.isabs(raw) or re.match(r"^[A-Za-z]:[\\/]", raw):
        raise ValueError("TJ_NODE: absolute save paths are not allowed. Use a relative subfolder inside ComfyUI/output.")

    normalized = raw.replace("\\", "/").strip("/")
    parts = [p for p in normalized.split("/") if p]
    if any(p == ".." for p in parts):
        raise ValueError("TJ_NODE: '..' is not allowed in save paths.")

    final_dir = os.path.realpath(os.path.join(output_root, *parts))
    try:
        if os.path.commonpath([output_root, final_dir]) != output_root:
            raise ValueError
    except Exception:
        raise ValueError("TJ_NODE: save path must stay inside ComfyUI/output.")

    return final_dir

class _AnyDict(dict):
    def __contains__(self, key): return True
    def __getitem__(self, key): return "*"
    def get(self, key, default=None): return "*"

def get_supported_files():
    input_dir = folder_paths.get_input_directory()
    valid_exts = {'.txt', '.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.webm', '.avi', '.mp3', '.m4a', '.wav', '.flac'}
    try:
        files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f)) and os.path.splitext(f)[1].lower() in valid_exts]
        return sorted(files)
    except Exception:
        return []

class TJ_SaveAndPreviewImage:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "get_name": (["(none)"],),
                "setnode_name": ("STRING", {"default": ""}),
                "filename_prefix": ("STRING", {"default": "TJ_Output"}),
                "path": ("STRING", {"default": ""}),
                "type": (["png", "jpg", "webp"], {"default": "png"}),
                "mode": (["Preview", "Save"], {"default": "Preview"}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "process"
    CATEGORY = " ✨ TJ Node/Utility"
    OUTPUT_NODE = True

    def process(self, images, get_name, setnode_name, filename_prefix, path, type, mode):
        now = datetime.now()
        parsed_prefix = now.strftime(filename_prefix)
        parsed_path = now.strftime(path)

        if mode == "Preview":
            out_dir = folder_paths.get_temp_directory()
        else:
            out_dir = _tj_safe_output_dir(parsed_path)

        os.makedirs(out_dir, exist_ok=True)

        results = []
        is_batch = len(images) > 1

        for i, img_tensor in enumerate(images):
            img_np = 255.0 * img_tensor.cpu().numpy()
            img = Image.fromarray(np.clip(img_np, 0, 255).astype(np.uint8))

            suffix = f"_{i:04d}" if is_batch else ""
            filename = f"{parsed_prefix}{suffix}.{type}"

            if mode == "Save":
                base = parsed_prefix
                counter = 1
                file_path = os.path.join(out_dir, filename)
                while os.path.exists(file_path):
                    filename = f"{base}{suffix}_{counter:04d}.{type}"
                    file_path = os.path.join(out_dir, filename)
                    counter += 1
            else:
                rnd = random.randint(10000, 99999)
                filename = f"tj_prev_{rnd}_{parsed_prefix}{suffix}.{type}"
                file_path = os.path.join(out_dir, filename)

            if type == "png":
                img.save(file_path, format="PNG", compress_level=4)
            elif type == "jpg":
                img.save(file_path, format="JPEG", quality=100, subsampling=0)
            elif type == "webp":
                img.save(file_path, format="WEBP", lossless=True, quality=100)

            base_ref = folder_paths.get_temp_directory() if mode == "Preview" else folder_paths.get_output_directory()
            try:
                subfolder = os.path.relpath(out_dir, base_ref)
                if subfolder == ".": subfolder = ""
            except ValueError:
                subfolder = ""

            results.append({
                "filename": filename,
                "subfolder": subfolder,
                "type": "temp" if mode == "Preview" else "output"
            })

        return {"ui": {"tj_images": results}, "result": (images,)}


class TJ_PromptText:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": ""}),
                "get_name": (["(none)"],),
                "setnode_name": ("STRING", {"default": ""}),
            },
            "optional": {
                "prompt_in": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "process"
    CATEGORY = " ✨ TJ Node/Utility"

    def process(self, text, get_name, setnode_name, prompt_in=""):
        out = ""
        if prompt_in and isinstance(prompt_in, str) and prompt_in.strip():
            out += prompt_in.strip() + "\n"
        out += text.strip()
        return (out.strip(),)


class TJ_TextConcatenate:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mode": (["Dynamic (Auto)", "Manual"], {"default": "Dynamic (Auto)"}),
                "num_ports": ("INT", {"default": 2, "min": 1, "max": 64}),
                "delimiter": ("STRING", {"default": ", "}),
                "setnode_name": ("STRING", {"default": ""}),
            },
            "optional": _AnyDict()
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "process"
    CATEGORY = " ✨ TJ Node/Utility"

    def process(self, mode, num_ports, delimiter, setnode_name, **kwargs):
        delim = delimiter.replace("\\n", "\n")
        texts = []
        def get_number(key_str):
            try: return int(key_str.split('_')[1])
            except: return 999
        sorted_keys = sorted([k for k in kwargs.keys() if k.startswith("input_")], key=get_number)
        for k in sorted_keys:
            val = kwargs[k]
            if val is not None and str(val).strip():
                texts.append(str(val))
        return (delim.join(texts),)


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
    CATEGORY = " ✨ TJ Node/Utility"
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

        # 🚨 해결: Load Video 등의 알 수 없는 객체 속에서 영상 파일 경로를 무조건 찾아내는 로직
        def find_media_path(obj):
            try:
                if isinstance(obj, str): return obj
                if isinstance(obj, (list, tuple)):
                    for item in obj:
                        res = find_media_path(item)
                        if res: return res
                if isinstance(obj, dict):
                    for v in obj.values():
                        res = find_media_path(v)
                        if res: return res
                if hasattr(obj, '__dict__'):
                    for v in vars(obj).values():
                        res = find_media_path(v)
                        if res: return res
                if hasattr(obj, 'get_full_path'): return obj.get_full_path()
                if hasattr(obj, 'path'): return obj.path
                s = str(obj)
                m = re.search(r"(['\"])([A-Za-z]:\\[^\1]+|\/[^\1]+)\1", s)
                if m: return m.group(2)
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
            b = target_data.shape[0]
            
            results = []
            rnd = random.randint(10000, 99999)
            
            for i in range(b):
                img_np = 255.0 * target_data[i].cpu().numpy()
                img = Image.fromarray(np.clip(img_np, 0, 255).astype(np.uint8))
                filename = f"tj_smart_{rnd}_{i:04d}.jpg"
                file_path = os.path.join(out_dir, filename)
                img.save(file_path, format="JPEG", quality=80)
                results.append({"filename": filename, "subfolder": "", "type": "temp"})
            
            return {"ui": {"tj_type": ["image"], "tj_data": results}, "result": (target_data,)}
        
        if isinstance(target_data, dict) and "waveform" in target_data:
            try:
                import torchaudio
                out_dir = folder_paths.get_temp_directory()
                os.makedirs(out_dir, exist_ok=True)
                rnd = random.randint(10000, 99999)
                filename = f"tj_audio_{rnd}.wav"
                file_path = os.path.join(out_dir, filename)
                
                waveform = target_data["waveform"]
                if len(waveform.shape) == 3:
                    waveform = waveform.squeeze(0)
                sample_rate = target_data.get("sample_rate", 44100)
                torchaudio.save(file_path, waveform, sample_rate)
                
                return {"ui": {"tj_type": ["audio_file"], "tj_data": [{"filename": filename, "subfolder": "", "type": "temp"}]}, "result": (target_data,)}
            except Exception:
                pass
        
        # Scalar / text-like values should be shown as text, not unsupported.
        # This covers width/height/seed/counter/ratio outputs from other nodes.
        try:
            import numbers
            if isinstance(target_data, (bool, int, float, np.bool_, np.integer, np.floating, numbers.Number)):
                txt = str(target_data)
                return {"ui": {"tj_type": ["text"], "tj_data": [txt]}, "result": (target_data,)}
            if isinstance(target_data, torch.Tensor) and target_data.numel() == 1:
                val = target_data.detach().cpu().item()
                txt = str(val)
                return {"ui": {"tj_type": ["text"], "tj_data": [txt]}, "result": (target_data,)}
        except Exception:
            pass

        type_str = str(type(target_data))
        return {"ui": {"tj_type": ["unknown"], "tj_data": [type_str]}, "result": (target_data,)}

# ─────────────────────────────────────────────────────────────
# Save & Preview Video (TJ)
# Minimal safe v1: image batch -> mp4 preview/save, optional audio A/B mux.
# Video input is accepted as a passthrough/media path when possible.
# ─────────────────────────────────────────────────────────────
def _tj_next_file(out_dir, base_name, ext):
    candidate = f"{base_name}.{ext}"
    if not os.path.exists(os.path.join(out_dir, candidate)):
        return candidate
    pattern = re.compile(rf"^{re.escape(base_name)}_(\d{{4,}})\.{re.escape(ext)}$", re.IGNORECASE)
    max_num = 0
    try:
        for fn in os.listdir(out_dir):
            m = pattern.match(fn)
            if m:
                try: max_num = max(max_num, int(m.group(1)))
                except Exception: pass
    except Exception:
        pass
    return f"{base_name}_{max_num + 1:04d}.{ext}"


def _tj_audio_payload(obj):
    try:
        if obj is None:
            return None
        if isinstance(obj, dict):
            sr = obj.get("sample_rate") or obj.get("sampling_rate") or obj.get("rate") or 44100
            for key in ("waveform", "samples", "audio"):
                val = obj.get(key)
                if isinstance(val, torch.Tensor):
                    wf = val.detach().cpu().float()
                    if len(wf.shape) == 3: wf = wf.squeeze(0)
                    if len(wf.shape) == 1: wf = wf.unsqueeze(0)
                    return wf, int(sr)
                nested = _tj_audio_payload(val)
                if nested: return nested
            for v in obj.values():
                nested = _tj_audio_payload(v)
                if nested: return nested
        if isinstance(obj, torch.Tensor):
            wf = obj.detach().cpu().float()
            if len(wf.shape) == 3: wf = wf.squeeze(0)
            if len(wf.shape) == 1: wf = wf.unsqueeze(0)
            return wf, 44100
    except Exception:
        pass
    return None


def _tj_write_wav(audio_obj, wav_path):
    payload = _tj_audio_payload(audio_obj)
    if not payload:
        return None
    waveform, sample_rate = payload
    arr = waveform.numpy()
    if arr.ndim == 1:
        arr = arr[None, :]
    arr = np.asarray(arr, dtype=np.float32)
    arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
    arr = np.clip(arr, -1.0, 1.0)
    pcm = (arr.T * 32767.0).astype(np.int16)
    import wave
    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(int(pcm.shape[1] if pcm.ndim > 1 else 1))
        wf.setsampwidth(2)
        wf.setframerate(int(sample_rate or 44100))
        wf.writeframes(pcm.tobytes())
    return wav_path


def _tj_mix_audio(audio_a, audio_b, wav_path, monitor="A+B"):
    payloads = []
    if monitor in ("A", "A+B"):
        pa = _tj_audio_payload(audio_a)
        if pa: payloads.append(pa)
    if monitor in ("B", "A+B"):
        pb = _tj_audio_payload(audio_b)
        if pb: payloads.append(pb)
    if not payloads:
        return None
    # Simple mix: resample is intentionally not implemented here to avoid extra deps.
    # If sample rates differ, use the first rate and trim/pad arrays.
    sr = int(payloads[0][1] or 44100)
    arrays = []
    max_len = 0
    max_ch = 1
    for wf, _sr in payloads:
        arr = wf.numpy().astype(np.float32)
        if arr.ndim == 1: arr = arr[None, :]
        max_ch = max(max_ch, arr.shape[0])
        max_len = max(max_len, arr.shape[1])
        arrays.append(arr)
    mix = np.zeros((max_ch, max_len), dtype=np.float32)
    for arr in arrays:
        if arr.shape[0] == 1 and max_ch > 1:
            arr = np.repeat(arr, max_ch, axis=0)
        elif arr.shape[0] < max_ch:
            pad = np.zeros((max_ch - arr.shape[0], arr.shape[1]), dtype=np.float32)
            arr = np.concatenate([arr, pad], axis=0)
        mix[:, :arr.shape[1]] += arr[:max_ch]
    mix = mix / max(1, len(arrays))
    return _tj_write_wav({"waveform": torch.from_numpy(mix), "sample_rate": sr}, wav_path)


def _tj_ffmpeg_run(args):
    import subprocess
    p = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout or "ffmpeg failed")[-1200:])


def _tj_black_image_tensor(width=64, height=64):
    return torch.zeros((1, int(height), int(width), 3), dtype=torch.float32)


def _tj_silent_audio_dict(duration=0.1, sample_rate=44100):
    samples = max(1, int(float(duration) * int(sample_rate)))
    return {"waveform": torch.zeros((1, 1, samples), dtype=torch.float32), "sample_rate": int(sample_rate)}


def _tj_black_video_file(out_dir=None, fps=24.0, width=64, height=64, duration=1.0):
    out_dir = out_dir or folder_paths.get_temp_directory()
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"tj_fallback_black_{random.randint(10000,99999)}.mp4")
    frame_count = max(1, int(float(fps or 24.0) * float(duration or 1.0)))
    frames = [np.zeros((int(height), int(width), 3), dtype=np.uint8) for _ in range(frame_count)]
    import imageio.v2 as imageio
    imageio.mimsave(path, frames, fps=float(fps or 24.0), codec="libx264", quality=8, macro_block_size=8)
    return path


def _tj_apply_output_fallbacks(image, video_path, audio_a, audio_b, original_audio, out_dir=None, fps=24.0):
    warnings = []
    if image is None:
        image = _tj_black_image_tensor()
        warnings.append({"slot": "image", "fallback": "black IMAGE frame"})
    if video_path is None:
        video_path = _tj_black_video_file(out_dir or folder_paths.get_temp_directory(), fps=fps)
        warnings.append({"slot": "video", "fallback": "black video 1s"})
    if audio_a is None:
        audio_a = _tj_silent_audio_dict()
        warnings.append({"slot": "audio_a", "fallback": "silent audio 0.1s"})
    if audio_b is None:
        audio_b = _tj_silent_audio_dict()
        warnings.append({"slot": "audio_b", "fallback": "silent audio 0.1s"})
    if original_audio is None:
        original_audio = _tj_silent_audio_dict()
        warnings.append({"slot": "original_audio", "fallback": "silent audio 0.1s"})
    return image, video_path, audio_a, audio_b, original_audio, warnings


def _tj_load_wav_as_audio_dict(wav_path):
    try:
        import wave
        with wave.open(wav_path, "rb") as wf:
            channels = wf.getnchannels()
            sample_rate = wf.getframerate()
            frames = wf.readframes(wf.getnframes())
        arr = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
        if channels > 1:
            arr = arr.reshape(-1, channels).T
        else:
            arr = arr.reshape(1, -1)
        return {"waveform": torch.from_numpy(arr).unsqueeze(0), "sample_rate": int(sample_rate)}
    except Exception:
        return None


def _tj_extract_original_audio(video_path):
    if not video_path or not os.path.exists(video_path):
        return None, None
    wav_path = os.path.join(folder_paths.get_temp_directory(), f"tj_orig_audio_{random.randint(10000,99999)}.wav")
    try:
        _tj_ffmpeg_run([
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-acodec", "pcm_s16le", "-ar", "44100", wav_path
        ])
        audio = _tj_load_wav_as_audio_dict(wav_path)
        if audio is None:
            return None, None
        return audio, wav_path
    except Exception:
        return None, None


def _tj_media_meta_for_path(media_path, media_type="video_file"):
    temp_dir = os.path.realpath(folder_paths.get_temp_directory())
    output_dir = os.path.realpath(folder_paths.get_output_directory())
    input_dir = os.path.realpath(folder_paths.get_input_directory())
    media_real = os.path.realpath(media_path)
    if media_real.startswith(temp_dir):
        meta_type = "temp"; base = temp_dir
    elif media_real.startswith(output_dir):
        meta_type = "output"; base = output_dir
    elif media_real.startswith(input_dir):
        meta_type = "input"; base = input_dir
    else:
        import shutil
        ext = os.path.splitext(media_path)[1] or (".mp4" if media_type == "video_file" else ".wav")
        tmp_name = f"tj_media_ext_{random.randint(10000,99999)}{ext}"
        tmp_path = os.path.join(folder_paths.get_temp_directory(), tmp_name)
        shutil.copy2(media_path, tmp_path)
        media_path = tmp_path
        media_real = os.path.realpath(media_path)
        meta_type = "temp"; base = temp_dir
    try:
        subfolder = os.path.relpath(os.path.dirname(media_real), base)
        if subfolder == ".": subfolder = ""
    except Exception:
        subfolder = ""
    return {"filename": os.path.basename(media_path), "subfolder": subfolder, "type": meta_type, "media_type": media_type}


def _tj_resolve_media_path(candidate):
    """Resolve a path or filename against common ComfyUI media folders."""
    if not candidate:
        return None
    try:
        cand = str(candidate).strip().strip("\"'")
    except Exception:
        return None
    if not cand:
        return None
    if os.path.isabs(cand) and os.path.exists(cand):
        return cand
    search_roots = [
        folder_paths.get_input_directory(),
        folder_paths.get_output_directory(),
        folder_paths.get_temp_directory(),
    ]
    # Try candidate as relative path first.
    for root in search_roots:
        p = os.path.join(root, cand)
        if os.path.exists(p):
            return p
    # Try basename lookup in root and one-level common subfolders.
    base = os.path.basename(cand)
    if base:
        for root in search_roots:
            p = os.path.join(root, base)
            if os.path.exists(p):
                return p
            try:
                for sub in ("video", "videos", "upload", "uploads", "download", "AnimateDiff"):
                    p = os.path.join(root, sub, base)
                    if os.path.exists(p):
                        return p
            except Exception:
                pass
    return None


def _tj_find_video_path(obj, _seen=None):
    """Best-effort extraction for core LoadVideo / VHS / path-like VIDEO objects."""
    if obj is None:
        return None
    if _seen is None:
        _seen = set()
    oid = id(obj)
    if oid in _seen:
        return None
    _seen.add(oid)

    if isinstance(obj, str):
        return _tj_resolve_media_path(obj)

    if isinstance(obj, dict):
        # Prefer explicit path-ish keys first.
        for k in ("path", "video_path", "filename", "file", "full_path", "filepath", "url"):
            if k in obj:
                p = _tj_find_video_path(obj.get(k), _seen)
                if p:
                    return p
        for v in obj.values():
            p = _tj_find_video_path(v, _seen)
            if p:
                return p
        return None

    if isinstance(obj, (list, tuple, set)):
        for v in obj:
            p = _tj_find_video_path(v, _seen)
            if p:
                return p
        return None

    # Common object attributes / methods.
    for attr in ("path", "video_path", "filename", "file", "full_path", "filepath", "file_path", "_path", "_file", "_filename", "_file_path", "src", "source", "stream_source", "name"):
        try:
            if hasattr(obj, attr):
                p = _tj_find_video_path(getattr(obj, attr), _seen)
                if p:
                    return p
        except Exception:
            pass
    for meth in ("get_full_path", "get_path", "get_filename", "get_file", "get_source", "get_stream_source", "get_components", "get_metadata"):
        try:
            fn = getattr(obj, meth, None)
            if callable(fn):
                p = _tj_find_video_path(fn(), _seen)
                if p:
                    return p
        except Exception:
            pass

    try:
        if hasattr(obj, "__dict__"):
            p = _tj_find_video_path(vars(obj), _seen)
            if p:
                return p
    except Exception:
        pass

    # Last resort: pull media-looking tokens from repr/string.
    try:
        text = str(obj)
        for m in re.finditer(r"([A-Za-z]:\\[^\"\']+?\.(?:mp4|mov|webm|avi|mkv)|/[^\"\']+?\.(?:mp4|mov|webm|avi|mkv)|[\w ._\-\/]+?\.(?:mp4|mov|webm|avi|mkv))", text, re.IGNORECASE):
            p = _tj_resolve_media_path(m.group(1))
            if p:
                return p
    except Exception:
        pass
    return None


def _tj_read_video_frames_to_tensor(video_path, target_fps=24.0, max_frames=0):
    """Decode a readable video file into ComfyUI IMAGE tensor batch.
    Keeps duration approximately by sampling source frames to target_fps.
    max_frames=0 means no explicit cap.
    """
    import imageio.v2 as imageio
    target_fps = float(target_fps or 24.0)
    reader = imageio.get_reader(video_path)
    try:
        meta = reader.get_meta_data() or {}
    except Exception:
        meta = {}
    src_fps = float(meta.get("fps") or target_fps or 24.0)
    try:
        nframes = reader.count_frames()
    except Exception:
        nframes = None

    selected = []
    if nframes and nframes > 0:
        duration = float(nframes) / max(src_fps, 1e-6)
        target_count = max(1, int(round(duration * target_fps)))
        if max_frames and max_frames > 0:
            target_count = min(target_count, int(max_frames))
        indices = np.linspace(0, max(0, nframes - 1), target_count).round().astype(int)
        last_idx = -1
        for idx in indices:
            idx = int(idx)
            if idx == last_idx:
                continue
            try:
                frame = reader.get_data(idx)
            except Exception:
                continue
            if frame is not None:
                selected.append(frame)
            last_idx = idx
    else:
        step = max(1, int(round(src_fps / max(target_fps, 1e-6))))
        for i, frame in enumerate(reader):
            if i % step == 0:
                selected.append(frame)
                if max_frames and len(selected) >= int(max_frames):
                    break
    try:
        reader.close()
    except Exception:
        pass

    if not selected:
        raise ValueError("Save & Preview Video (TJ): failed to decode frames from video input.")

    frames = []
    for frame in selected:
        arr = np.asarray(frame)
        if arr.ndim == 2:
            arr = np.stack([arr, arr, arr], axis=-1)
        if arr.shape[-1] == 4:
            arr = arr[..., :3]
        arr = arr.astype(np.float32) / 255.0
        frames.append(arr)
    return torch.from_numpy(np.stack(frames, axis=0)).float()


class TJ_SaveAndPreviewVideo:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 120.0, "step": 1.0}),
                "save_type": (["video only", "video + audio", "video + original audio", "audio only"], {"default": "video only"}),
                "audio_monitor": (["A", "B", "A+B"], {"default": "A+B"}),
                "get_name": (["(none)"],),
                "setnode_name": ("STRING", {"default": ""}),
                "filename_prefix": ("STRING", {"default": "TJ_Video"}),
                "path": ("STRING", {"default": ""}),
                "mode": (["Preview", "Save"], {"default": "Preview"}),
            },
            "optional": {
                "image": ("IMAGE",),
                "video": (any_type,),
                "audio_a": (any_type,),
                "audio_b": (any_type,),
            }
        }

    RETURN_TYPES = (any_type, any_type, any_type, any_type, any_type)
    RETURN_NAMES = ("image", "video", "audio_a", "audio_b", "original_audio")
    FUNCTION = "process"
    CATEGORY = " ✨ TJ_Node/Video"
    OUTPUT_NODE = True

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def process(self, fps=24.0, save_type="video only", audio_monitor="A+B", get_name="(none)", setnode_name="", filename_prefix="TJ_Video", path="", mode="Preview", image=None, video=None, audio_a=None, audio_b=None):
        now = datetime.now()
        parsed_prefix = now.strftime(_tj_expand_datetime_aliases(filename_prefix))
        parsed_path = now.strftime(_tj_expand_datetime_aliases(path))
        out_dir = folder_paths.get_temp_directory() if mode == "Preview" else _tj_safe_output_dir(parsed_path)
        os.makedirs(out_dir, exist_ok=True)
        fps = float(fps or 24.0)

        has_image = image is not None
        has_video = video is not None
        if has_image and has_video:
            raise ValueError("Save & Preview Video (TJ): image and video inputs are mutually exclusive. Use only one source.")

        # Audio-only mode: show only audio controllers, no black video.
        # Preview returns one controller per connected input; Save keeps the older
        # mixed A+B mp3 behavior. Plain audio inputs are ignored unless save_type is audio only.
        if save_type == "audio only":
            metas = []
            if mode == "Preview":
                for label, audio_obj in (("A", audio_a), ("B", audio_b)):
                    if audio_obj is None:
                        continue
                    wav_path = os.path.join(folder_paths.get_temp_directory(), f"tj_audio_{label}_{random.randint(10000,99999)}.wav")
                    written = _tj_write_wav(audio_obj, wav_path)
                    if written:
                        m = _tj_media_meta_for_path(written, "audio_file")
                        m["label"] = label
                        metas.append(m)
                if not metas:
                    raise ValueError("No audio data found in audio_a/audio_b")
                image, video_path, audio_a, audio_b, original_audio, fallback_outputs = _tj_apply_output_fallbacks(image, None, audio_a, audio_b, None, out_dir, fps)
                if fallback_outputs:
                    for m in metas:
                        m["fallback_outputs"] = fallback_outputs
                return {"ui": {"tj_video": metas}, "result": (image, video_path, audio_a, audio_b, original_audio)}
            else:
                filename = _tj_next_file(out_dir, parsed_prefix, "mp3")
                final_path = os.path.join(out_dir, filename)
                wav_tmp = os.path.join(folder_paths.get_temp_directory(), f"tj_audio_mix_{random.randint(10000,99999)}.wav")
                mixed = _tj_mix_audio(audio_a, audio_b, wav_tmp, "A+B")
                if not mixed:
                    raise ValueError("No audio data found in audio_a/audio_b")
                _tj_ffmpeg_run(["ffmpeg", "-y", "-i", mixed, "-codec:a", "libmp3lame", "-b:a", "192k", final_path])
                meta = _tj_media_meta_for_path(final_path, "audio_file")
                image, video_path, audio_a, audio_b, original_audio, fallback_outputs = _tj_apply_output_fallbacks(image, None, audio_a, audio_b, None, out_dir, fps)
                if fallback_outputs:
                    meta["fallback_outputs"] = fallback_outputs
                return {"ui": {"tj_video": [meta]}, "result": (image, video_path, audio_a, audio_b, original_audio)}

        video_path = None
        original_audio = None

        if has_image:
            # image batch -> h264 mp4
            filename = _tj_next_file(out_dir, parsed_prefix, "mp4") if mode == "Save" else f"tj_video_{random.randint(10000,99999)}_{parsed_prefix}.mp4"
            raw_video_path = os.path.join(out_dir, filename)
            frames = []
            for img_tensor in image:
                img_np = 255.0 * img_tensor.cpu().numpy()
                img_arr = np.clip(img_np, 0, 255).astype(np.uint8)
                frames.append(img_arr)
            import imageio.v2 as imageio
            imageio.mimsave(raw_video_path, frames, fps=fps, codec="libx264", quality=8, macro_block_size=8)
            video_path = raw_video_path

            if save_type == "video + audio":
                wav_tmp = os.path.join(folder_paths.get_temp_directory(), f"tj_audio_mix_{random.randint(10000,99999)}.wav")
                mixed = _tj_mix_audio(audio_a, audio_b, wav_tmp, audio_monitor)
                if mixed:
                    mux_path = os.path.join(out_dir, filename.replace(".mp4", "_audio.mp4")) if mode == "Preview" else raw_video_path + ".mux.mp4"
                    _tj_ffmpeg_run(["ffmpeg", "-y", "-i", raw_video_path, "-i", mixed, "-c:v", "copy", "-c:a", "aac", "-shortest", mux_path])
                    if mode == "Save":
                        os.replace(mux_path, raw_video_path)
                        video_path = raw_video_path
                    else:
                        video_path = mux_path
                        filename = os.path.basename(mux_path)

        elif has_video:
            # VIDEO input -> decode to IMAGE batch first, then use the same make-video path.
            # This is intentionally not passthrough: it makes the output frame/image path stable
            # and matches the requested "video -> frames -> video" behavior.
            source_path = _tj_find_video_path(video)
            if not source_path:
                raise ValueError("Save & Preview Video (TJ): this VIDEO object does not expose a readable file path. Connect decoded IMAGE frames to image input, or use a loader that exposes filename/path.")

            image = _tj_read_video_frames_to_tensor(source_path, fps)
            has_image = True
            original_audio, original_audio_path = _tj_extract_original_audio(source_path)

            filename = _tj_next_file(out_dir, parsed_prefix, "mp4") if mode == "Save" else f"tj_video_{random.randint(10000,99999)}_{parsed_prefix}.mp4"
            raw_video_path = os.path.join(out_dir, filename)
            frames = []
            for img_tensor in image:
                img_np = 255.0 * img_tensor.cpu().numpy()
                img_arr = np.clip(img_np, 0, 255).astype(np.uint8)
                frames.append(img_arr)
            import imageio.v2 as imageio
            imageio.mimsave(raw_video_path, frames, fps=fps, codec="libx264", quality=8, macro_block_size=8)
            video_path = raw_video_path

            if save_type == "video + original audio":
                mux_path = os.path.join(out_dir, filename.replace(".mp4", "_orig_audio.mp4")) if mode == "Preview" else raw_video_path + ".mux.mp4"
                try:
                    if original_audio_path:
                        _tj_ffmpeg_run(["ffmpeg", "-y", "-i", raw_video_path, "-i", original_audio_path, "-c:v", "copy", "-c:a", "aac", "-shortest", mux_path])
                    else:
                        _tj_ffmpeg_run(["ffmpeg", "-y", "-i", raw_video_path, "-i", source_path, "-map", "0:v:0", "-map", "1:a:0?", "-c:v", "copy", "-c:a", "aac", "-shortest", mux_path])
                    if mode == "Save":
                        os.replace(mux_path, raw_video_path)
                        video_path = raw_video_path
                    else:
                        video_path = mux_path
                        filename = os.path.basename(mux_path)
                except Exception:
                    # No original audio stream or ffmpeg issue: keep video-only preview instead of failing.
                    pass
            elif save_type == "video + audio":
                wav_tmp = os.path.join(folder_paths.get_temp_directory(), f"tj_audio_mix_{random.randint(10000,99999)}.wav")
                mixed = _tj_mix_audio(audio_a, audio_b, wav_tmp, audio_monitor)
                if mixed:
                    mux_path = os.path.join(out_dir, filename.replace(".mp4", "_audio.mp4")) if mode == "Preview" else raw_video_path + ".mux.mp4"
                    _tj_ffmpeg_run(["ffmpeg", "-y", "-i", raw_video_path, "-i", mixed, "-c:v", "copy", "-c:a", "aac", "-shortest", mux_path])
                    if mode == "Save":
                        os.replace(mux_path, raw_video_path)
                        video_path = raw_video_path
                    else:
                        video_path = mux_path
                        filename = os.path.basename(mux_path)
        else:
            raise ValueError("Save & Preview Video (TJ): connect image, video, or audio input.")

        meta = _tj_media_meta_for_path(video_path, "video_file")
        try:
            if image is not None and isinstance(image, torch.Tensor):
                meta["frame_count"] = int(image.shape[0])
                meta["height"] = int(image.shape[1])
                meta["width"] = int(image.shape[2])
                meta["fps"] = fps
        except Exception:
            pass
        image, video_path, audio_a, audio_b, original_audio, fallback_outputs = _tj_apply_output_fallbacks(image, video_path, audio_a, audio_b, original_audio, out_dir, fps)
        if fallback_outputs:
            meta["fallback_outputs"] = fallback_outputs
        return {"ui": {"tj_video": [meta]}, "result": (image, video_path, audio_a, audio_b, original_audio)}
