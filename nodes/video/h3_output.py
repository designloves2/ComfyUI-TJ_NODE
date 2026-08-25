# nodes/video/h3_output.py
# MiniMax H3 Output (TJ)
#
# Save clip과 One-Take Recorder를 하나로 합친 노드(2-in-1). save_mode 로 동작을
# 고른다:
#   Single Clip : 이번 클립을 파일로 저장하고 끝.
#   One-Take    : 클립마다 파일 저장 + 디스크 매니페스트(JSON)에 {index, path}를
#                 append. index >= total_count 가 되는 마지막 실행에서만
#                 ffmpeg trim(overlap)+concat 으로 최종본을 만든다.
#
# overlap 값은 MiniMax H3 Sequencer (TJ)와 동일한 고정 상수(39프레임)를 그대로
# 가져와 쓴다 — 스티치 쪽에서 값이 어긋나면 겹친 구간이 잘못 잘려나가므로 두
# 노드가 반드시 같은 값을 봐야 한다.

import json
import os
import random
from datetime import datetime

import numpy as np
import torch

import folder_paths

from .h3_sequencer import ONE_TAKE_OVERLAP_FRAMES, FPS as H3_FPS
from ..utility._utility_utils import (
    _tj_expand_datetime_aliases, _tj_safe_output_dir, _tj_safe_filename_part, _tj_next_file,
    _tj_write_wav, _tj_ffmpeg_run, _tj_media_meta_for_path, _tj_read_video_frames_to_tensor,
)

SAVE_SINGLE = "Single Clip"
SAVE_ONE_TAKE = "One-Take"
SAVE_MODES = [SAVE_SINGLE, SAVE_ONE_TAKE]


def _manifest_dir():
    d = os.path.join(folder_paths.get_output_directory(), "one_minimax_h3", "_manifests")
    os.makedirs(d, exist_ok=True)
    return d


def _safe_name(name):
    name = os.path.basename(str(name or "").strip())
    if not name or any(c in name for c in ("..", "/", "\\", "\0")):
        raise ValueError("MiniMax H3 Output (TJ): 잘못된 manifest_name 입니다.")
    return name


def _load_manifest(path):
    if not os.path.isfile(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save_manifest(path, entries):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)


class TJ_H3_Output:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 120.0, "step": 1.0,
                    "tooltip": "MiniMax H3 Sequencer (TJ)의 fps 출력을 연결하세요."}),
                "save_mode": ("BOOLEAN", {"default": False, "label_on": "One-Take", "label_off": "Single Clip",
                    "tooltip": "MiniMax H3 One-Take Sampler (TJ)의 one_take와 같은 값을 연결하면 "
                               "두 노드가 항상 같이 켜지고 꺼집니다."}),
                "filename_prefix": ("STRING", {"default": "MinimaxH3"}),
                "path": ("STRING", {"default": "minimax_h3/%date/"}),
                "manifest_name": ("STRING", {"default": "onetake001",
                    "tooltip": "One-Take 모드에서만 사용. 같은 원테이크 시퀀스의 모든 클립은 "
                               "이 이름을 동일하게 써야 하나의 매니페스트로 묶입니다."}),
                "index": ("INT", {"default": 1, "min": 1, "max": 100000, "step": 1,
                    "tooltip": "MiniMax H3 Prompt Queue (TJ)의 index 출력을 연결하세요."}),
                "total_count": ("INT", {"default": 1, "min": 1, "max": 100000, "step": 1,
                    "tooltip": "MiniMax H3 Prompt Queue (TJ)의 total_count 출력을 연결하세요."}),
            },
            "optional": {
                "audio": ("AUDIO",),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING", "AUDIO", "FLOAT", "INT", "STRING")
    RETURN_NAMES = ("images", "video", "audio", "fps", "total_frame", "report")
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/Video"
    OUTPUT_NODE = True

    def _encode_clip(self, images, fps, audio, out_dir, base_name):
        filename = _tj_next_file(out_dir, base_name, "mp4")
        clip_path = os.path.join(out_dir, filename)
        frames = [np.clip(255.0 * img.cpu().numpy(), 0, 255).astype(np.uint8) for img in images]
        import imageio.v2 as imageio
        imageio.mimsave(clip_path, frames, fps=fps, codec="libx264", quality=8, macro_block_size=8)

        has_audio = False
        if audio is not None:
            wav_tmp = os.path.join(folder_paths.get_temp_directory(), f"tj_h3out_audio_{random.randint(10000,99999)}.wav")
            written = _tj_write_wav(audio, wav_tmp)
            if written:
                mux_path = clip_path + ".mux.mp4"
                _tj_ffmpeg_run(["ffmpeg", "-y", "-i", clip_path, "-i", written,
                                "-c:v", "copy", "-c:a", "aac", "-shortest", mux_path])
                os.replace(mux_path, clip_path)
                has_audio = True
        return clip_path, has_audio

    def _stitch(self, entries, out_dir, base_name, fps):
        overlap_aligned_frames = ONE_TAKE_OVERLAP_FRAMES
        overlap_seconds = overlap_aligned_frames / float(H3_FPS)
        all_have_audio = all(e.get("has_audio") for e in entries)

        cmd = ["ffmpeg", "-y"]
        for e in entries:
            cmd += ["-i", e["path"]]

        n = len(entries)
        v_labels, a_labels = [], []
        filter_parts = []
        for i in range(n):
            if i == 0:
                filter_parts.append(f"[{i}:v]setpts=PTS-STARTPTS[v{i}]")
            else:
                filter_parts.append(f"[{i}:v]trim=start={overlap_seconds:.6f},setpts=PTS-STARTPTS[v{i}]")
            v_labels.append(f"[v{i}]")
            if all_have_audio:
                if i == 0:
                    filter_parts.append(f"[{i}:a]asetpts=PTS-STARTPTS[a{i}]")
                else:
                    filter_parts.append(f"[{i}:a]atrim=start={overlap_seconds:.6f},asetpts=PTS-STARTPTS[a{i}]")
                a_labels.append(f"[a{i}]")

        if all_have_audio:
            concat_inputs = "".join(v + a for v, a in zip(v_labels, a_labels))
            filter_parts.append(f"{concat_inputs}concat=n={n}:v=1:a=1[outv][outa]")
            out_maps = ["-map", "[outv]", "-map", "[outa]"]
        else:
            concat_inputs = "".join(v_labels)
            filter_parts.append(f"{concat_inputs}concat=n={n}:v=1:a=0[outv]")
            out_maps = ["-map", "[outv]"]

        filter_complex = ";".join(filter_parts)
        stitched_filename = _tj_next_file(out_dir, base_name + "_STITCHED", "mp4")
        stitched_path = os.path.join(out_dir, stitched_filename)
        cmd += ["-filter_complex", filter_complex] + out_maps + \
               ["-c:v", "libx264", "-crf", "18"] + (["-c:a", "aac"] if all_have_audio else []) + [stitched_path]
        _tj_ffmpeg_run(cmd)
        return stitched_path, overlap_seconds, all_have_audio

    def run(self, images, fps=24.0, save_mode=False, filename_prefix="MinimaxH3",
            path="minimax_h3/%date/", manifest_name="onetake001", index=1, total_count=1, audio=None):

        save_mode = SAVE_ONE_TAKE if save_mode else SAVE_SINGLE

        now = datetime.now()
        parsed_prefix = _tj_safe_filename_part(now.strftime(_tj_expand_datetime_aliases(filename_prefix)))
        parsed_path = now.strftime(_tj_expand_datetime_aliases(path))
        out_dir = _tj_safe_output_dir(parsed_path)
        os.makedirs(out_dir, exist_ok=True)

        clip_path, has_audio = self._encode_clip(
            images, fps, audio, out_dir, f"{parsed_prefix}_clip{int(index):03d}")
        meta = _tj_media_meta_for_path(clip_path, "video_file")
        total_frame = int(images.shape[0])

        if save_mode == SAVE_SINGLE:
            report = f"MiniMax H3 Output (TJ)\nsave_mode: Single Clip\nsaved: {clip_path}\nframes: {total_frame}"
            return {"ui": {"tj_video": [meta]},
                    "result": (images, clip_path, audio, float(fps), total_frame, report)}

        # --- One-Take: manifest에 기록 ---
        name = _safe_name(manifest_name)
        manifest_path = os.path.join(_manifest_dir(), f"{name}.json")
        entries = [e for e in _load_manifest(manifest_path) if e.get("index") != int(index)]
        entries.append({"index": int(index), "path": clip_path, "has_audio": has_audio})
        entries.sort(key=lambda e: e["index"])
        _save_manifest(manifest_path, entries)

        if int(index) < int(total_count):
            report = (f"MiniMax H3 Output (TJ)\nsave_mode: One-Take\n"
                       f"logged clip {index}/{total_count}: {clip_path}\n"
                       f"frames: {total_frame}\n"
                       f"waiting for remaining clips before stitching.")
            return {"ui": {"tj_video": [meta]},
                    "result": (images, clip_path, audio, float(fps), total_frame, report)}

        # 마지막 클립 -> 스티치. 트림+concat으로 클립 수만큼 겹침 구간이 빠지므로
        # total_frame은 Sequencer가 알려준 클립 하나짜리 값과 달라진다 — 이 최종
        # 프레임 수를 출력해야 다음 단(최종 저장/프레임 보간 등)이 정확히 맞출 수 있다.
        stitched_path, overlap_seconds, all_have_audio = self._stitch(
            entries, out_dir, parsed_prefix, fps)
        stitched_images = _tj_read_video_frames_to_tensor(stitched_path, fps)
        stitched_meta = _tj_media_meta_for_path(stitched_path, "video_file")
        stitched_total_frame = int(stitched_images.shape[0])

        report = (
            f"MiniMax H3 Output (TJ)\nsave_mode: One-Take (final clip {index}/{total_count})\n"
            f"clips stitched : {len(entries)}\n"
            f"overlap trimmed: {ONE_TAKE_OVERLAP_FRAMES} frames ({overlap_seconds:.3f}s) off every clip after the first\n"
            f"audio          : {'concatenated (all clips had audio)' if all_have_audio else 'video only (some clips had no audio)'}\n"
            f"stitched file  : {stitched_path}\n"
            f"stitched frames: {stitched_total_frame}"
        )
        return {"ui": {"tj_video": [stitched_meta]},
                "result": (stitched_images, stitched_path, audio, float(fps), stitched_total_frame, report)}
