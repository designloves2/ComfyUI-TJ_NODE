# nodes/video/save_preview_video.py
import os
import random
import numpy as np
import torch
from datetime import datetime
import folder_paths
from ...core.tj_types import any_type
from ..utility._utility_utils import (
    _tj_expand_datetime_aliases, _tj_safe_output_dir, _tj_next_file,
    _tj_write_wav, _tj_mix_audio, _tj_make_monitor_wav, _tj_ffmpeg_run,
    _tj_apply_output_fallbacks, _tj_extract_original_audio,
    _tj_media_meta_for_path, _tj_find_video_path,
    _tj_read_video_frames_to_tensor, _tj_slice_image_frames,
)


class TJ_SaveAndPreviewVideo:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 120.0, "step": 1.0}),
                "begin_frame": ("STRING", {"default": "", "multiline": False, "placeholder": "empty = 0"}),
                "end_frame": ("STRING", {"default": "", "multiline": False, "placeholder": "empty = all"}),
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

    RETURN_TYPES = (any_type, any_type, any_type, any_type, any_type, "INT")
    RETURN_NAMES = ("image", "video", "audio_a", "audio_b", "original_audio", "video_total_frame")
    FUNCTION = "process"
    CATEGORY = " ✨ TJ_Node/Video"
    OUTPUT_NODE = True

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def process(self, fps=24.0, begin_frame="", end_frame="", save_type="video only",
                audio_monitor="A+B", get_name="(none)", setnode_name="",
                filename_prefix="TJ_Video", path="", mode="Preview",
                image=None, video=None, audio_a=None, audio_b=None):

        now = datetime.now()
        parsed_prefix = now.strftime(_tj_expand_datetime_aliases(filename_prefix))
        parsed_path = now.strftime(_tj_expand_datetime_aliases(path))
        out_dir = folder_paths.get_temp_directory() if mode == "Preview" else _tj_safe_output_dir(parsed_path)
        os.makedirs(out_dir, exist_ok=True)
        fps = float(fps or 24.0)

        has_image = image is not None
        has_video = video is not None
        if has_image and has_video:
            raise ValueError("Save & Preview Video (TJ): image and video inputs are mutually exclusive.")

        # ── Audio only mode ──
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
                image, video_path, audio_a, audio_b, original_audio, fallbacks = _tj_apply_output_fallbacks(image, None, audio_a, audio_b, None, out_dir, fps)
                return {"ui": {"tj_video": metas}, "result": (image, video_path, audio_a, audio_b, original_audio, 0)}
            else:
                save_targets = [("A", audio_a)] if audio_monitor == "A" else [("B", audio_b)] if audio_monitor == "B" else [("A", audio_a), ("B", audio_b)]
                saved_any = False
                for label, audio_obj in save_targets:
                    if audio_obj is None:
                        continue
                    filename = _tj_next_file(out_dir, f"{parsed_prefix}_{label}", "mp3")
                    final_path = os.path.join(out_dir, filename)
                    wav_tmp = os.path.join(folder_paths.get_temp_directory(), f"tj_audio_{label}_{random.randint(10000,99999)}.wav")
                    mixed = _tj_mix_audio(audio_obj if label == "A" else None, audio_obj if label == "B" else None, wav_tmp, label)
                    if not mixed:
                        continue
                    _tj_ffmpeg_run(["ffmpeg", "-y", "-i", mixed, "-codec:a", "libmp3lame", "-b:a", "192k", final_path])
                    meta = _tj_media_meta_for_path(final_path, "audio_file")
                    meta["label"] = label
                    metas.append(meta)
                    saved_any = True
                if not saved_any:
                    raise ValueError("No audio data found in audio_a/audio_b")
                image, video_path, audio_a, audio_b, original_audio, _ = _tj_apply_output_fallbacks(image, None, audio_a, audio_b, None, out_dir, fps)
                return {"ui": {"tj_video": metas}, "result": (image, video_path, audio_a, audio_b, original_audio, 0)}

        video_path = None
        original_audio = None

        # ── Image batch → mp4 ──
        if has_image:
            image = _tj_slice_image_frames(image, begin_frame, end_frame)
            filename = _tj_next_file(out_dir, parsed_prefix, "mp4") if mode == "Save" else f"tj_video_{random.randint(10000,99999)}_{parsed_prefix}.mp4"
            raw_video_path = os.path.join(out_dir, filename)
            frames = [np.clip(255.0 * img.cpu().numpy(), 0, 255).astype(np.uint8) for img in image]
            import imageio.v2 as imageio
            imageio.mimsave(raw_video_path, frames, fps=fps, codec="libx264", quality=8, macro_block_size=8)
            video_path = raw_video_path
            if save_type == "video + audio":
                wav_tmp = os.path.join(folder_paths.get_temp_directory(), f"tj_audio_mix_{random.randint(10000,99999)}.wav")
                mixed = _tj_make_monitor_wav(audio_a, audio_b, wav_tmp, audio_monitor)
                if mixed:
                    mux_path = raw_video_path + ".mux.mp4"
                    _tj_ffmpeg_run(["ffmpeg", "-y", "-i", raw_video_path, "-i", mixed, "-c:v", "copy", "-c:a", "aac", "-shortest", mux_path])
                    if mode == "Save":
                        os.replace(mux_path, raw_video_path)
                        video_path = raw_video_path
                    else:
                        video_path = mux_path
                        filename = os.path.basename(mux_path)

        # ── Video input → decode → re-encode ──
        elif has_video:
            source_path = _tj_find_video_path(video)
            if not source_path:
                raise ValueError("Save & Preview Video (TJ): VIDEO object does not expose a readable file path.")
            image = _tj_read_video_frames_to_tensor(source_path, fps)
            image = _tj_slice_image_frames(image, begin_frame, end_frame)
            original_audio, original_audio_path = _tj_extract_original_audio(source_path)
            filename = _tj_next_file(out_dir, parsed_prefix, "mp4") if mode == "Save" else f"tj_video_{random.randint(10000,99999)}_{parsed_prefix}.mp4"
            raw_video_path = os.path.join(out_dir, filename)
            frames = [np.clip(255.0 * img.cpu().numpy(), 0, 255).astype(np.uint8) for img in image]
            import imageio.v2 as imageio
            imageio.mimsave(raw_video_path, frames, fps=fps, codec="libx264", quality=8, macro_block_size=8)
            video_path = raw_video_path
            if save_type == "video + original audio":
                mux_path = raw_video_path + ".mux.mp4"
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
                    pass
            elif save_type == "video + audio":
                wav_tmp = os.path.join(folder_paths.get_temp_directory(), f"tj_audio_mix_{random.randint(10000,99999)}.wav")
                mixed = _tj_make_monitor_wav(audio_a, audio_b, wav_tmp, audio_monitor)
                if mixed:
                    mux_path = raw_video_path + ".mux.mp4"
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
                meta.update({"frame_count": int(image.shape[0]), "height": int(image.shape[1]), "width": int(image.shape[2]), "fps": fps})
        except Exception:
            pass

        video_total_frame = int(image.shape[0]) if isinstance(image, torch.Tensor) else 0
        image, video_path, audio_a, audio_b, original_audio, fallbacks = _tj_apply_output_fallbacks(image, video_path, audio_a, audio_b, original_audio, out_dir, fps)
        if fallbacks:
            meta["fallback_outputs"] = fallbacks
        return {"ui": {"tj_video": [meta]}, "result": (image, video_path, audio_a, audio_b, original_audio, video_total_frame)}
