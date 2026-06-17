# nodes/utility/_utility_utils.py
# utility 카테고리 노드 공통 헬퍼 함수

import os
import re
import random
import wave
import numpy as np
import torch
import folder_paths


def _tj_expand_datetime_aliases(text):
    if not text:
        return text
    text = str(text)
    text = text.replace("%date", "%Y-%m-%d")
    text = text.replace("%time", "%H-%M-%S")
    return text


def _tj_safe_output_dir(path_text=""):
    output_root = os.path.realpath(folder_paths.get_output_directory())
    raw = str(path_text or "").strip()
    if not raw:
        return output_root
    if os.path.isabs(raw) or re.match(r"^[A-Za-z]:[\\/]", raw):
        raise ValueError("TJ_NODE: absolute save paths are not allowed.")
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
                try:
                    max_num = max(max_num, int(m.group(1)))
                except Exception:
                    pass
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
                    if len(wf.shape) == 3:
                        wf = wf.squeeze(0)
                    if len(wf.shape) == 1:
                        wf = wf.unsqueeze(0)
                    return wf, int(sr)
                nested = _tj_audio_payload(val)
                if nested:
                    return nested
            for v in obj.values():
                nested = _tj_audio_payload(v)
                if nested:
                    return nested
        if isinstance(obj, torch.Tensor):
            wf = obj.detach().cpu().float()
            if len(wf.shape) == 3:
                wf = wf.squeeze(0)
            if len(wf.shape) == 1:
                wf = wf.unsqueeze(0)
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
        if pa:
            payloads.append(pa)
    if monitor in ("B", "A+B"):
        pb = _tj_audio_payload(audio_b)
        if pb:
            payloads.append(pb)
    if not payloads:
        return None
    sr = int(payloads[0][1] or 44100)
    max_len, max_ch = 0, 1
    arrays = []
    for wf, _sr in payloads:
        arr = wf.numpy().astype(np.float32)
        if arr.ndim == 1:
            arr = arr[None, :]
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


def _tj_make_monitor_wav(audio_a, audio_b, wav_path, monitor="A+B"):
    monitor = str(monitor or "A+B")
    if monitor == "A":
        return _tj_write_wav(audio_a, wav_path)
    if monitor == "B":
        return _tj_write_wav(audio_b, wav_path)
    return _tj_mix_audio(audio_a, audio_b, wav_path, "A+B")


def _tj_ffmpeg_run(args):
    import subprocess
    p = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout or "ffmpeg failed")[-1200:])


def _tj_silent_audio_dict(duration=0.1, sample_rate=44100):
    samples = max(1, int(float(duration) * int(sample_rate)))
    return {"waveform": torch.zeros((1, 1, samples), dtype=torch.float32), "sample_rate": int(sample_rate)}


def _tj_black_image_tensor(width=64, height=64):
    return torch.zeros((1, int(height), int(width), 3), dtype=torch.float32)


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
        _tj_ffmpeg_run(["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "pcm_s16le", "-ar", "44100", wav_path])
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
        meta_type, base = "temp", temp_dir
    elif media_real.startswith(output_dir):
        meta_type, base = "output", output_dir
    elif media_real.startswith(input_dir):
        meta_type, base = "input", input_dir
    else:
        import shutil
        ext = os.path.splitext(media_path)[1] or (".mp4" if media_type == "video_file" else ".wav")
        tmp_name = f"tj_media_ext_{random.randint(10000,99999)}{ext}"
        tmp_path = os.path.join(folder_paths.get_temp_directory(), tmp_name)
        shutil.copy2(media_path, tmp_path)
        media_real = os.path.realpath(tmp_path)
        meta_type, base = "temp", temp_dir
    try:
        subfolder = os.path.relpath(os.path.dirname(media_real), base)
        if subfolder == ".":
            subfolder = ""
    except Exception:
        subfolder = ""
    return {"filename": os.path.basename(media_real), "subfolder": subfolder, "type": meta_type, "media_type": media_type}


def _tj_resolve_media_path(candidate):
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
    search_roots = [folder_paths.get_input_directory(), folder_paths.get_output_directory(), folder_paths.get_temp_directory()]
    for root in search_roots:
        p = os.path.join(root, cand)
        if os.path.exists(p):
            return p
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
    for attr in ("path", "video_path", "filename", "file", "full_path", "filepath", "file_path",
                 "_path", "_file", "_filename", "_file_path", "src", "source", "name"):
        try:
            if hasattr(obj, attr):
                p = _tj_find_video_path(getattr(obj, attr), _seen)
                if p:
                    return p
        except Exception:
            pass
    for meth in ("get_full_path", "get_path", "get_filename", "get_file", "get_source", "get_components", "get_metadata"):
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
        frames.append(arr.astype(np.float32) / 255.0)
    return torch.from_numpy(np.stack(frames, axis=0)).float()


def _tj_parse_frame_index(value, default=None):
    try:
        text = str(value or "").strip()
        if not text:
            return default
        return max(0, int(float(text)))
    except Exception:
        return default


def _tj_slice_image_frames(image, begin_frame="", end_frame=""):
    if image is None or not isinstance(image, torch.Tensor) or len(image.shape) < 1:
        return image
    total = int(image.shape[0])
    start = _tj_parse_frame_index(begin_frame, 0)
    end = _tj_parse_frame_index(end_frame, total)
    start = min(max(0, start), total)
    end = min(max(0, end), total)
    if start == 0 and end == total:
        return image
    if end <= start:
        raise ValueError(f"Save & Preview Video (TJ): invalid frame range begin_frame={start}, end_frame={end} for {total} frames.")
    return image[start:end]


def get_supported_files():
    input_dir = folder_paths.get_input_directory()
    valid_exts = {'.txt', '.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.webm', '.avi', '.mp3', '.m4a', '.wav', '.flac'}
    try:
        files = [f for f in os.listdir(input_dir)
                 if os.path.isfile(os.path.join(input_dir, f)) and os.path.splitext(f)[1].lower() in valid_exts]
        return sorted(files)
    except Exception:
        return []
