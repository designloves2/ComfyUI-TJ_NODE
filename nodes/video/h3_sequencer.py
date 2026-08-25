# nodes/video/h3_sequencer.py
# MiniMax H3 Sequencer (TJ)
#
# 모드 스위치(Text/First-Last/Reference) + 오디오 락 + 원테이크를 하나의 노드로
# 통합한다. 조건부 로직(레퍼런스 배치 인코딩, 오디오 인코딩, 프레임 정렬 등)은
# ComfyUI 공식 comfy_extras/nodes_minimax_h3.py 의 함수와 이미 검증된
# TJ_H3_AudioLock / TJ_H3_LatentContinuation 의 헬퍼를 그대로 재사용한다.
#
# 이 노드가 새로 하는 일은 딱 하나: video mask 와 audio mask 를 항상 "같이"
# 계산해서 noise_mask 를 한 번만 쓴다. Audio Lock 노드와 One-Take 노드를 그냥
# 체인으로 연결하면 뒤 노드가 out["noise_mask"] 를 통째로 덮어써서 앞 노드가
# 만든 마스크가 사라지는 문제가 있는데(TJ_H3_AudioLock.lock()의 unconditional
# overwrite), 여기서는 두 마스크를 하나의 NestedTensor로 합쳐 한 번만 기록하므로
# 그 문제가 애초에 발생하지 않는다.

import math

import torch

import comfy.nested_tensor
import node_helpers
from comfy_extras.nodes_minimax_h3 import (
    CANVAS_MULTIPLE,
    REF_IMAGE_SHORT_EDGE,
    FPS,
    align_frame_count,
    video_latent_t,
    adapt_canvas,
    _resize,
    _empty_av_latent,
)

from .h3_audio_lock import _encode_audio, _fit_length, FIT_PAD, FIT_OPTIONS

AUDIO_LATENT_FPS = 40
MODE_TEXT = "Text"
MODE_FIRST_LAST = "First-Last"
MODE_REFERENCE = "Reference"
MODE_OPTIONS = [MODE_TEXT, MODE_FIRST_LAST, MODE_REFERENCE]

ONE_TAKE_OVERLAP_FRAMES = 39  # 공식 고정값(1.625초) — 위젯으로 노출하지 않는다.


def _as_nested(samples, label):
    if not getattr(samples, "is_nested", False):
        raise ValueError(f"MiniMax H3 Sequencer (TJ): {label}이(가) H3 AV latent가 아닙니다.")
    tensors = samples.unbind()
    if len(tensors) != 2:
        raise ValueError(f"MiniMax H3 Sequencer (TJ): {label}의 스트림 개수가 다릅니다(2개 필요).")
    video, audio = tensors
    if video.ndim != 5 or video.shape[1] != 24:
        raise ValueError(f"MiniMax H3 Sequencer (TJ): {label}의 비디오 스트림 규격이 H3와 다릅니다.")
    return video, audio


class TJ_H3_Sequencer:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "auto_set": ("BOOLEAN", {"default": False, "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
                "clip": ("CLIP",),
                "vae": ("VAE",),
                "audio_vae": ("VAE",),
                "prompt": ("STRING", {"multiline": True, "dynamicPrompts": True}),
                "mode": (MODE_OPTIONS, {"default": MODE_TEXT}),
                "width": ("INT", {"default": 1344, "min": 32, "max": 8192, "step": 32}),
                "height": ("INT", {"default": 768, "min": 32, "max": 8192, "step": 32}),
                "length": ("INT", {"default": 124, "min": 5, "max": 3600, "step": 17,
                    "tooltip": "24fps 프레임 수, 17k+5 그리드로 정렬됩니다. One-Take를 쓸 때도 클립마다 "
                               "이 길이(전체 grid) 그대로 생성하고, 겹치는 앞부분만 mask=0으로 보존합니다."}),
                "ref_image_size": (["match", "max"], {"default": "match"}),
                "audio_lock": ("BOOLEAN", {"default": False, "label_on": "Audio Lock ON", "label_off": "Audio Lock OFF"}),
                "audio_lock_mode": (["lock", "remix"], {"default": "lock"}),
                "audio_lock_strength": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "audio_lock_fit": (FIT_OPTIONS, {"default": FIT_PAD}),
                "one_take": ("BOOLEAN", {"default": False, "label_on": "One-Take ON", "label_off": "One-Take OFF"}),
            },
            "optional": {
                "first_frame": ("IMAGE",),
                "last_frame": ("IMAGE",),
                "ref_images": ("IMAGE",),
                "ref_video_1": ("IMAGE",),
                "ref_video_2": ("IMAGE",),
                "ref_video_3": ("IMAGE",),
                "ref_video_audio_1": ("AUDIO",),
                "ref_video_audio_2": ("AUDIO",),
                "ref_video_audio_3": ("AUDIO",),
                "ref_audio_1": ("AUDIO",),
                "ref_audio_2": ("AUDIO",),
                "ref_audio_3": ("AUDIO",),
                "audio_lock_source": ("AUDIO",),
                "prev_latent": ("LATENT",),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "LATENT", "AUDIO", "FLOAT", "INT", "STRING")
    RETURN_NAMES = ("positive", "latent", "audio", "fps", "total_frame", "report")
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/Video"

    # ---- mode branches (ComfyUI 공식 nodes_minimax_h3.py 로직 재사용) -------

    def _cond_text_or_firstlast(self, clip, vae, prompt, width, height, length, first_frame, last_frame):
        latent, frame_count = _empty_av_latent(width, height, length)

        images, keyframes = [], []
        if first_frame is not None:
            img = _resize(first_frame[:1], width, height, "disabled")
            images.append(img)
            keyframes.append({"resolved_frame_index": 0, "image": img})
        if last_frame is not None:
            img = _resize(last_frame[:1], width, height, "center")
            images.append(img)
            keyframes.append({"resolved_frame_index": frame_count - 1, "image": img})

        tokens = clip.tokenize(prompt, images=images)
        cond = clip.encode_from_tokens_scheduled(tokens)
        if keyframes:
            for kf in keyframes:
                kf["latent"] = vae.encode(kf.pop("image"))
            cond = node_helpers.conditioning_set_values(cond, {
                "minimax_keyframes": keyframes,
                "minimax_frame_count": frame_count,
            })
        return cond, latent, frame_count

    @staticmethod
    def _encode_ref_audio(audio_vae, audio):
        import torchaudio
        waveform = audio["waveform"]
        sr = audio["sample_rate"]
        vae_sr = getattr(audio_vae, "audio_sample_rate", 32000)
        if sr != vae_sr:
            waveform = torchaudio.functional.resample(waveform, sr, vae_sr)
        z = audio_vae.encode(waveform[:1].movedim(1, -1))
        return z, z.shape[-1]

    def _cond_reference(self, clip, vae, audio_vae, prompt, width, height, length,
                         ref_image_size, ref_images_list, ref_videos, ref_video_audios, ref_audios):
        latent, frame_count = _empty_av_latent(width, height, length)

        ref_items, ref_blocks = [], []

        for img in ref_images_list:
            if img is None:
                continue
            h, w = img.shape[1], img.shape[2]
            if ref_image_size == "match":
                scale = min(1.0, math.sqrt((width * height) / (w * h)))
            else:
                scale = min(1.0, REF_IMAGE_SHORT_EDGE / min(w, h))
            tw = max(CANVAS_MULTIPLE, round(w * scale / CANVAS_MULTIPLE) * CANVAS_MULTIPLE)
            th = max(CANVAS_MULTIPLE, round(h * scale / CANVAS_MULTIPLE) * CANVAS_MULTIPLE)
            resized = _resize(img[:1], tw, th, "disabled")
            z = vae.encode(resized)
            ref_items.append({"type": "image", "data": resized})
            ref_blocks.append({"kind": "image", "latent_h": th // 16, "latent_w": tw // 16, "latent": z})

        for video_frames, soundtrack in zip(ref_videos, ref_video_audios):
            if video_frames is None:
                continue
            vh, vw = video_frames.shape[1], video_frames.shape[2]
            cw, ch = adapt_canvas(vw, vh)
            if vw * vh < cw * ch:
                cw = max(CANVAS_MULTIPLE, round(vw / CANVAS_MULTIPLE) * CANVAS_MULTIPLE)
                ch = max(CANVAS_MULTIPLE, round(vh / CANVAS_MULTIPLE) * CANVAS_MULTIPLE)
            frames = _resize(video_frames, cw, ch, "disabled")
            if frames.shape[0] > frame_count:
                frames = frames[:frame_count]
            n = frames.shape[0]
            if n < 5:
                raise ValueError("MiniMax H3 Sequencer (TJ): 레퍼런스 비디오는 최소 5프레임(약 0.2초) 필요합니다.")
            while n % 17 != 5:
                n -= 1
            frames = frames[:n]
            z = vae.encode(frames)
            audio_latent, ref_audio_t = (None, 0)
            if soundtrack is not None:
                audio_latent, ref_audio_t = self._encode_ref_audio(audio_vae, soundtrack)
                ref_items.append({"type": "audio"})
            sample_idx = list(range(0, frames.shape[0], FPS // 2))
            qwen_frames = frames[sample_idx]
            ref_items.append({"type": "video", "data": qwen_frames,
                              "timestamps": [i / 2.0 for i in range(len(sample_idx))]})
            ref_blocks.append({"kind": "video_audio" if ref_audio_t else "video",
                               "latent_t": z.shape[2], "latent_h": ch // 16, "latent_w": cw // 16,
                               "ref_audio_t": ref_audio_t, "latent": z, "audio_latent": audio_latent})

        for audio in ref_audios:
            if audio is None:
                continue
            audio_latent, ref_audio_t = self._encode_ref_audio(audio_vae, audio)
            ref_items.append({"type": "audio"})
            ref_blocks.append({"kind": "audio", "ref_audio_t": ref_audio_t, "audio_latent": audio_latent})

        tokens = clip.tokenize(prompt, minimax_ref_items=ref_items)
        cond = clip.encode_from_tokens_scheduled(tokens)
        if ref_blocks:
            cond = node_helpers.conditioning_set_values(cond, {"minimax_refs": ref_blocks})
        return cond, latent, frame_count

    # ---- main ---------------------------------------------------------

    def run(self, auto_set=False, clip=None, vae=None, audio_vae=None, prompt="",
            mode=MODE_TEXT, width=1344, height=768, length=124, ref_image_size="match",
            audio_lock=False, audio_lock_mode="lock", audio_lock_strength=0.5, audio_lock_fit=FIT_PAD,
            one_take=False,
            first_frame=None, last_frame=None,
            ref_images=None,
            ref_video_1=None, ref_video_2=None, ref_video_3=None,
            ref_video_audio_1=None, ref_video_audio_2=None, ref_video_audio_3=None,
            ref_audio_1=None, ref_audio_2=None, ref_audio_3=None,
            audio_lock_source=None, prev_latent=None):

        if clip is None or vae is None or audio_vae is None:
            raise ValueError("MiniMax H3 Sequencer (TJ): clip/vae/audio_vae가 연결되지 않았습니다.")

        if mode == MODE_REFERENCE:
            if isinstance(ref_images, torch.Tensor) and ref_images.ndim == 4:
                ref_images_list = [ref_images[i:i + 1] for i in range(ref_images.shape[0])]
            else:
                ref_images_list = []
            cond, latent, frame_count = self._cond_reference(
                clip, vae, audio_vae, prompt, width, height, length, ref_image_size,
                ref_images_list,
                [ref_video_1, ref_video_2, ref_video_3],
                [ref_video_audio_1, ref_video_audio_2, ref_video_audio_3],
                [ref_audio_1, ref_audio_2, ref_audio_3],
            )
        else:
            ff = first_frame if mode == MODE_FIRST_LAST else None
            lf = last_frame if mode == MODE_FIRST_LAST else None
            cond, latent, frame_count = self._cond_text_or_firstlast(clip, vae, prompt, width, height, length, ff, lf)

        video, audio_lat = _as_nested(latent["samples"], "생성된 latent")
        new_video = video.clone()
        new_audio = audio_lat.clone()
        video_mask = None
        audio_mask = None

        report_lines = [f"MiniMax H3 Sequencer (TJ)\nmode: {mode}"]

        # --- One-Take: 이전 클립의 꼬리를 이번 클립 머리에 복사 ---
        if one_take and prev_latent is not None:
            prev_video, prev_audio = _as_nested(prev_latent.get("samples"), "prev_latent")
            if prev_video.shape[-2:] != new_video.shape[-2:]:
                raise ValueError(
                    "MiniMax H3 Sequencer (TJ): 이전 클립 체크포인트의 해상도가 이번 클립과 다릅니다 "
                    f"(이전 latent H×W={tuple(prev_video.shape[-2:])}, 이번 latent H×W={tuple(new_video.shape[-2:])}). "
                    "One-Take 시퀀스는 처음 클립부터 끝까지 width/height가 동일해야 합니다 — "
                    "1번 클립부터 다시 돌리거나, 이전 실행에서 남은 체크포인트 파일을 삭제하고 다시 시작하세요."
                )
            overlap_aligned = align_frame_count(ONE_TAKE_OVERLAP_FRAMES)
            k_v = min(video_latent_t(overlap_aligned), prev_video.shape[2], new_video.shape[2])
            if k_v > 0:
                new_video[:, :, :k_v] = prev_video[:, :, -k_v:]
                video_mask = torch.ones_like(new_video[:, :1], dtype=torch.float32)
                video_mask[:, :, :k_v] = 0.0
            if not audio_lock:
                k_a = min(round(overlap_aligned / FPS * AUDIO_LATENT_FPS),
                          prev_audio.shape[-1], new_audio.shape[-1])
                if k_a > 0:
                    new_audio[:, :, :, :k_a] = prev_audio[:, :, :, -k_a:]
                    audio_mask = torch.ones_like(new_audio[:, :1], dtype=torch.float32)
                    audio_mask[:, :, :, :k_a] = 0.0
            report_lines.append(
                f"one-take: overlap {ONE_TAKE_OVERLAP_FRAMES}f -> {overlap_aligned}f aligned, "
                f"{k_v} video latent frame(s) carried from prev_latent")
        elif one_take and prev_latent is None:
            report_lines.append("one-take: prev_latent 없음 -> 이번 클립을 첫 클립으로 취급(전체 새로 생성)")

        # --- Audio Lock: 외부 오디오를 인코딩해서 오디오 스트림 전체를 교체 ---
        if audio_lock:
            if audio_lock_source is None:
                raise ValueError("MiniMax H3 Sequencer (TJ): audio_lock이 켜져 있는데 audio_lock_source가 연결되지 않았습니다.")
            z, src_seconds, resampled, vae_sr = _encode_audio(audio_lock_source, audio_vae)
            z = z.to(dtype=new_audio.dtype, device=new_audio.device)
            target_t = new_audio.shape[-1]
            fitted, fit_note = _fit_length(z, target_t, audio_lock_fit)
            new_audio = fitted
            mask_value = 0.0 if audio_lock_mode == "lock" else float(max(0.0, min(1.0, audio_lock_strength)))
            audio_mask = torch.full_like(new_audio[:, :1], mask_value, dtype=torch.float32)
            report_lines.append(
                f"audio-lock: {audio_lock_mode} (mask={mask_value:g}), source {src_seconds:.2f}s"
                f"{' (resampled)' if resampled else ''}, fit {fit_note}")

        new_samples = comfy.nested_tensor.NestedTensor((new_video, new_audio))
        out = {k: v for k, v in latent.items()}
        out["samples"] = new_samples

        if video_mask is not None or audio_mask is not None:
            if video_mask is None:
                video_mask = torch.ones_like(new_video[:, :1], dtype=torch.float32)
            if audio_mask is None:
                audio_mask = torch.ones_like(new_audio[:, :1], dtype=torch.float32)
            out["noise_mask"] = comfy.nested_tensor.NestedTensor((video_mask, audio_mask))
            report_lines.append("noise_mask: video/audio 마스크를 한 번에 병합해서 기록 (덮어쓰기 없음)")
        else:
            report_lines.append("noise_mask: 없음 (전체 새로 생성)")

        # audio 출력은 락 상태일 때만 의미가 있다 — VAE 왕복 손실을 피하려고 원본을 그대로 통과.
        audio_out = audio_lock_source if audio_lock else None

        # fps/total_frame — 최종 출력(Output 노드)이나 프레임 보간(RIFE/FILM 등) 노드에
        # 바로 물릴 수 있게 24fps 그리드 기준 실제 프레임 수를 같이 내보낸다.
        return (cond, out, audio_out, float(FPS), int(frame_count), "\n".join(report_lines))
