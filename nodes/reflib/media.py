# nodes/reflib/media.py
# Decoding helpers for library assets: probe, 24 fps video frames, audio waveforms,
# posters / waveform pictures, and the image-set -> video packing.

import io

import av
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageOps

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"}
VIDEO_EXT = {".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"}
AUDIO_EXT = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus"}
FPS = 24


def kind_from_ext(ext):
    ext = ext.lower()
    if ext in IMAGE_EXT:
        return "image"
    if ext in VIDEO_EXT:
        return "video"
    if ext in AUDIO_EXT:
        return "audio"
    return None


def probe(data, kind):
    """Facts stored with the asset. Raises when the bytes are not decodable."""
    if kind == "image":
        with Image.open(io.BytesIO(data)) as im:
            im.verify()
        with Image.open(io.BytesIO(data)) as im:
            w, h = ImageOps.exif_transpose(im).size
        return {"width": w, "height": h}
    with av.open(io.BytesIO(data)) as c:
        duration = float(c.duration) / av.time_base if c.duration else 0.0
        if kind == "video":
            if not c.streams.video:
                raise ValueError("file has no video stream")
            s = c.streams.video[0]
            return {"width": s.codec_context.width, "height": s.codec_context.height,
                    "duration": duration, "has_audio": int(bool(c.streams.audio))}
        if not c.streams.audio:
            raise ValueError("file has no audio stream")
        return {"duration": duration, "sample_rate": c.streams.audio[0].rate}


def _scale_down(im, mp):
    if mp > 0 and im.width * im.height > mp * 1e6:
        scale = (mp * 1e6 / (im.width * im.height)) ** 0.5
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    return im


def load_image(path, mp=0.0):
    """[1,H,W,3] float tensor like LoadImage (alpha dropped), `mp` down only."""
    with Image.open(path) as im:
        im = _scale_down(ImageOps.exif_transpose(im).convert("RGB"), mp)
        return torch.from_numpy(np.asarray(im).astype(np.float32) / 255.0)[None]


def load_video(path, start=0.0, end=0.0, mp=0.0, max_frames=10_000):
    """[N,H,W,3] frames resampled to 24 fps between start and end seconds (end 0 = to the end)."""
    frames = []
    with av.open(path) as c:
        total = float(c.duration) / av.time_base if c.duration else 0.0
        limit = min(end, total) if end > 0 and total else (end or total or 1e9)
        if start >= limit:
            raise ValueError(f"start {start}s is not before the end of the clip ({limit:.2f}s)")
        if start > 0:
            c.seek(int(start * av.time_base))
        stream = c.streams.video[0]
        pending, prev = 0, None  # index of next target frame, last decoded frame at or before it

        def take(arr):
            nonlocal pending
            im = _scale_down(Image.fromarray(arr), mp)
            frames.append(np.asarray(im))
            pending += 1

        for frame in c.decode(stream):
            ft = float(frame.pts * frame.time_base)
            if ft < start - 1e-3 and prev is None:
                prev = frame.to_ndarray(format="rgb24")
                continue
            cur = frame.to_ndarray(format="rgb24")
            while len(frames) < max_frames and start + pending / FPS < min(ft, limit) - 1e-6:
                take(prev if prev is not None else cur)
            prev = cur
            if start + pending / FPS >= limit or len(frames) >= max_frames:
                break
        while prev is not None and len(frames) < max_frames and start + pending / FPS < limit - 1e-6:
            take(prev)
    if not frames:
        raise ValueError("no frames decoded")
    return torch.from_numpy(np.stack(frames).astype(np.float32) / 255.0)


def load_audio(path, start=0.0, end=0.0):
    """AUDIO dict {"waveform": [1,C,N], "sample_rate"} of the file's first audio stream."""
    chunks = []
    with av.open(path) as c:
        s = c.streams.audio[0]
        resampler = av.AudioResampler(format="fltp", layout="mono" if s.channels == 1 else "stereo", rate=s.rate)
        for frame in c.decode(s):
            for out in resampler.resample(frame):
                chunks.append(out.to_ndarray())
        for out in resampler.resample(None):
            chunks.append(out.to_ndarray())
        rate = s.rate
    wave = np.concatenate(chunks, axis=1)
    a = int(start * rate)
    b = int(end * rate) if end > 0 else wave.shape[1]
    wave = wave[:, a:b]
    if wave.shape[1] == 0:
        raise ValueError("audio trim leaves no samples")
    return {"waveform": torch.from_numpy(np.ascontiguousarray(wave))[None], "sample_rate": rate}


def waveform_peaks(path, bins=600):
    """Loudness envelope for the trim editor: duration in seconds and `bins` peaks scaled to 0..1."""
    audio = load_audio(path)
    wave = audio["waveform"][0].mean(0).abs().numpy()
    usable = max(bins, -(-len(wave) // bins) * bins)
    wave = np.pad(wave, (0, usable - len(wave)))
    peaks = wave.reshape(bins, -1).max(1)
    peaks = peaks / (peaks.max() or 1.0)
    return {"duration": len(audio["waveform"][0][0]) / audio["sample_rate"], "peaks": [round(float(p), 3) for p in peaks]}


def poster(path, kind, size=256):
    """PIL image for thumbnails: the picture itself, a video's first frame, or an audio waveform."""
    if kind == "image":
        with Image.open(path) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
    elif kind == "video":
        with av.open(path) as c:
            frame = next(c.decode(c.streams.video[0]))
            im = frame.to_image().convert("RGB")
    else:
        wave = load_audio(path)["waveform"][0].mean(0).numpy()
        bars = 96
        peaks = np.abs(wave[: len(wave) // bars * bars].reshape(bars, -1)).max(1)
        peaks = peaks / (peaks.max() or 1.0)
        im = Image.new("RGB", (size, size // 2), (28, 28, 34))
        d = ImageDraw.Draw(im)
        for i, p in enumerate(peaks):
            x = int(i * size / bars)
            h = max(2, int(p * (size // 2 - 8)))
            d.rectangle([x, size // 4 - h // 2, x + 1, size // 4 + h // 2], fill=(120, 190, 255))
    im.thumbnail((size, size))
    return im


def pack_set(images, frames_per_image, fit):
    """Image set -> one reference clip [N,H,W,3]: each image held `frames_per_image` frames.

    The core samples a reference video every 12th frame and trims it to n % 17 == 5 frames, so
    the clip is padded with its last image up to the next valid length (never cut short) and
    every image keeps at least one sampled frame."""
    h, w = images[0].shape[1:3]
    fitted = []
    for img in images:
        im = Image.fromarray((img[0].numpy() * 255.0 + 0.5).astype(np.uint8))
        if im.size != (w, h):
            if fit == "crop":
                im = ImageOps.fit(im, (w, h), Image.LANCZOS)
            else:
                scale = min(w / im.width, h / im.height)
                inner = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
                canvas = Image.new("RGB", (w, h), (0, 0, 0))
                canvas.paste(inner, ((w - inner.width) // 2, (h - inner.height) // 2))
                im = canvas
        fitted.append(torch.from_numpy(np.asarray(im).astype(np.float32) / 255.0))
    needed = max((len(fitted) - 1) * frames_per_image + 1, 5)
    total = needed + (5 - needed) % 17
    frames = []
    for i, img in enumerate(fitted):
        frames += [img] * (frames_per_image if i < len(fitted) - 1 else total - len(frames))
    return torch.stack(frames[:total])

