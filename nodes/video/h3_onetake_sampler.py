# nodes/video/h3_onetake_sampler.py
# MiniMax H3 One-Take Sampler (TJ)
#
# Sequencer + 샘플러 체인(RandomNoise/BasicGuider/KSamplerSelect/BasicScheduler/
# SamplerCustomAdvanced) + 디코더(VAEDecode/VAEDecodeAudio, 타일 옵션 포함) +
# 클립 간 latent 체크포인트 저장/로드를 전부 하나로 묶은 노드.
#
# 목적: 캔버스에 RandomNoise/BasicGuider/KSamplerSelect/BasicScheduler/
# SamplerCustomAdvanced/Save Checkpoint/Load Checkpoint를 매번 손으로 배선하고
# strict/index 옵션까지 신경 써야 했던 저수준 조합을 하나로 줄인다 — Prompt Queue
# → 이 노드 → (필요하면 Preview/Save) 만 있으면 되게.
#
# 샘플러 체인은 ComfyUI 공식 comfy_extras/nodes_custom_sampler.py 의 로직을
# 그대로 재현한다(Noise_RandomNoise/Guider_Basic는 그 모듈에서 직접 가져와 재사용).
# 모델 자체의 패치(SageAttention, MiniMaxH3Cache, SigmaShift, Model Preview
# Override 등)는 이 노드 밖에서 model 입력으로 이미 끝내고 들어온다고 가정한다 —
# 어떤 패치를 몇 개 걸든 이 노드는 그냥 MODEL 하나만 받는다.

import torch

import comfy.sample
import comfy.samplers
import comfy.model_management
import comfy.utils
import latent_preview
from comfy_extras.nodes_custom_sampler import Noise_RandomNoise, Guider_Basic
from comfy_extras.nodes_audio import vae_decode_audio
from comfy_extras.nodes_minimax_h3 import align_frame_count, FPS as H3_FPS

from .h3_sequencer import (
    TJ_H3_Sequencer, MODE_OPTIONS, MODE_TEXT,
)
from .h3_audio_lock import FIT_PAD, FIT_OPTIONS
from .h3_latent_checkpoint import TJ_H3_SaveLatentCheckpoint, TJ_H3_LoadLatentCheckpoint


class TJ_H3_OneTakeSampler:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL", {"tooltip": "SageAttention/Cache/SigmaShift/Model Preview Override 등 "
                                                "모델 패치는 전부 이 입력 앞에서 끝내고 들어와야 합니다."}),
                "clip": ("CLIP",),
                "vae": ("VAE",),
                "audio_vae": ("VAE",),
                "prompt": ("STRING", {"multiline": True, "dynamicPrompts": True}),
                "mode": (MODE_OPTIONS, {"default": MODE_TEXT}),
                "width": ("INT", {"default": 1344, "min": 32, "max": 8192, "step": 32}),
                "height": ("INT", {"default": 768, "min": 32, "max": 8192, "step": 32}),
                "duration": ("FLOAT", {"default": 5.17, "min": 0.21, "max": 150.0, "step": 0.01,
                    "tooltip": "초 단위 길이. 내부적으로 24fps 프레임으로 환산 후 H3의 17k+5 프레임 "
                               "그리드에 맞춰 올림 정렬됩니다 — 실제 정렬된 프레임 수는 total_frame "
                               "출력으로 확인하세요."}),
                "ref_image_size": (["match", "max"], {"default": "match"}),
                "audio_lock": ("BOOLEAN", {"default": False, "label_on": "Audio Lock ON", "label_off": "Audio Lock OFF"}),
                "audio_lock_mode": (["lock", "remix"], {"default": "lock"}),
                "audio_lock_strength": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "audio_lock_fit": (FIT_OPTIONS, {"default": FIT_PAD}),
                "one_take": ("BOOLEAN", {"default": False, "label_on": "One-Take ON", "label_off": "One-Take OFF"}),
                "index": ("INT", {"default": 1, "min": 1, "max": 100000, "step": 1,
                    "tooltip": "MiniMax H3 Prompt Queue (TJ)의 index 출력을 연결하세요. One-Take가 켜져 "
                               "있을 때 1번 클립인지 자동 판단하는 데 씁니다."}),
                "checkpoint_name": ("STRING", {"default": "prev_clip",
                    "tooltip": "클립 간 latent 핸드오프용 내부 파일 이름. 한 루프 안에서는 그대로 두면 "
                               "됩니다(매 클립 덮어쓰기) — 루프를 여러 개 동시에 돌릴 때만 서로 다르게."}),
                "sampler_name": (comfy.samplers.SAMPLER_NAMES, {"default": "er_sde"}),
                "scheduler": (comfy.samplers.SCHEDULER_NAMES, {"default": "normal"}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "control_after_generate": True}),
                "tile_decode": ("BOOLEAN", {"default": False, "label_on": "Tile Decode ON", "label_off": "Tile Decode OFF",
                    "tooltip": "VRAM이 부족할 때 켜세요 — VAEDecodeTiled 방식으로 나눠서 디코드합니다 "
                               "(비디오만 해당, 오디오 디코드는 항상 그대로)."}),
                "tile_size": ("INT", {"default": 512, "min": 64, "max": 4096, "step": 32}),
                "overlap": ("INT", {"default": 64, "min": 0, "max": 4096, "step": 32}),
                "temporal_size": ("INT", {"default": 64, "min": 8, "max": 4096, "step": 4,
                    "tooltip": "비디오 VAE 전용 — 한 번에 디코드할 프레임 수."}),
                "temporal_overlap": ("INT", {"default": 8, "min": 4, "max": 4096, "step": 4}),
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
            },
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "FLOAT", "INT", "STRING")
    RETURN_NAMES = ("images", "audio", "fps", "total_frame", "report")
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/Video"
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # 클립마다 prompt/index는 보통 바뀌지만, 체크포인트 파일이 그래프 바깥에서
        # (직전 실행에서) 바뀌는 경우까지 확실히 잡기 위해 항상 다시 실행한다.
        return float("nan")

    def run(self, model, clip, vae, audio_vae, prompt, mode, width, height, duration, ref_image_size,
            audio_lock, audio_lock_mode, audio_lock_strength, audio_lock_fit, one_take,
            index, checkpoint_name, sampler_name, scheduler, steps, denoise, seed,
            tile_decode, tile_size, overlap, temporal_size, temporal_overlap,
            first_frame=None, last_frame=None, ref_images=None,
            ref_video_1=None, ref_video_2=None, ref_video_3=None,
            ref_video_audio_1=None, ref_video_audio_2=None, ref_video_audio_3=None,
            ref_audio_1=None, ref_audio_2=None, ref_audio_3=None,
            audio_lock_source=None):

        # duration(초) -> 24fps 프레임 -> H3 17k+5 그리드 정렬. align_frame_count는
        # while n % 17 != 5: n += 1 을 반복하는 것과 완전히 동일한 결과를 준다
        # (닫힌 형태로 쓰면 n + (5 - n % 17) % 17).
        length = align_frame_count(max(5, round(duration * H3_FPS)))

        report_lines = ["MiniMax H3 One-Take Sampler (TJ)", f"clip index: {index}",
                         f"duration: {duration:.3f}s -> {length} frames (grid-aligned)"]

        # 1) 이전 클립 latent 로드 — index<=1이면 파일 없어도 에러 없이 None.
        prev_latent = None
        if one_take:
            (prev_latent,) = TJ_H3_LoadLatentCheckpoint().load(
                checkpoint_name=checkpoint_name, strict=True, index=int(index))
            report_lines.append(
                f"checkpoint load({checkpoint_name}): "
                + ("이전 클립 로드됨" if prev_latent is not None else "없음 (첫 클립으로 취급)")
            )

        # 2) 컨디셔닝 + latent 준비 — Sequencer 로직을 그대로 재사용(중복 구현 없음).
        positive, latent, audio_passthrough, fps, total_frame, seq_report = TJ_H3_Sequencer().run(
            auto_set=False, clip=clip, vae=vae, audio_vae=audio_vae, prompt=prompt,
            mode=mode, width=width, height=height, length=length, ref_image_size=ref_image_size,
            audio_lock=audio_lock, audio_lock_mode=audio_lock_mode,
            audio_lock_strength=audio_lock_strength, audio_lock_fit=audio_lock_fit,
            one_take=one_take,
            first_frame=first_frame, last_frame=last_frame, ref_images=ref_images,
            ref_video_1=ref_video_1, ref_video_2=ref_video_2, ref_video_3=ref_video_3,
            ref_video_audio_1=ref_video_audio_1, ref_video_audio_2=ref_video_audio_2, ref_video_audio_3=ref_video_audio_3,
            ref_audio_1=ref_audio_1, ref_audio_2=ref_audio_2, ref_audio_3=ref_audio_3,
            audio_lock_source=audio_lock_source, prev_latent=prev_latent,
        )
        report_lines.append(seq_report)

        # 3) 샘플링 — RandomNoise + BasicGuider + KSamplerSelect + BasicScheduler +
        #    SamplerCustomAdvanced를 comfy_extras 공식 헬퍼로 그대로 재현.
        noise = Noise_RandomNoise(int(seed))
        guider = Guider_Basic(model)
        guider.set_conds(positive)
        sampler = comfy.samplers.sampler_object(sampler_name)

        total_steps = steps
        if denoise < 1.0:
            if denoise <= 0.0:
                raise ValueError("MiniMax H3 One-Take Sampler (TJ): denoise가 0이면 생성할 게 없습니다.")
            total_steps = int(steps / denoise)
        sigmas = comfy.samplers.calculate_sigmas(
            model.get_model_object("model_sampling"), scheduler, total_steps).cpu()
        sigmas = sigmas[-(steps + 1):]

        lat = latent.copy()
        latent_samples = comfy.sample.fix_empty_latent_channels(
            guider.model_patcher, lat["samples"],
            lat.get("downscale_ratio_spacial", None), lat.get("downscale_ratio_temporal", None))
        lat["samples"] = latent_samples
        noise_mask = lat.get("noise_mask")

        x0_output = {}
        callback = latent_preview.prepare_callback(guider.model_patcher, sigmas.shape[-1] - 1, x0_output)
        disable_pbar = not comfy.utils.PROGRESS_BAR_ENABLED
        samples = guider.sample(
            noise.generate_noise(lat), latent_samples, sampler, sigmas,
            denoise_mask=noise_mask, callback=callback, disable_pbar=disable_pbar, seed=noise.seed)
        samples = samples.to(comfy.model_management.intermediate_device())

        out_latent = lat.copy()
        out_latent.pop("downscale_ratio_spacial", None)
        out_latent.pop("downscale_ratio_temporal", None)
        out_latent["samples"] = samples
        report_lines.append(f"sampler: {sampler_name} / {scheduler} / steps={steps} / denoise={denoise}")

        # 4) 다음 클립을 위해 이번 클립 latent를 디스크에 저장(항상 실행).
        if one_take:
            TJ_H3_SaveLatentCheckpoint().save(latent=out_latent, checkpoint_name=checkpoint_name)
            report_lines.append(f"checkpoint save({checkpoint_name}): 저장됨")

        # 5) 디코드 — 비디오는 타일 옵션 지원, 오디오는 항상 일반 디코드.
        video_samples = out_latent["samples"]
        if video_samples.is_nested:
            video_only = video_samples.unbind()[0]
        else:
            video_only = video_samples
        if tile_decode:
            t_size = temporal_size
            t_overlap = temporal_overlap
            tsz = tile_size
            ov = overlap
            if tsz < ov * 4:
                ov = tsz // 4
            if t_size < t_overlap * 2:
                t_overlap = t_overlap // 2
            temporal_compression = vae.temporal_compression_decode()
            if temporal_compression is not None:
                t_size = max(2, t_size // temporal_compression)
                t_overlap = max(1, min(t_size // 2, t_overlap // temporal_compression))
            else:
                t_size = None
                t_overlap = None
            compression = vae.spacial_compression_decode()
            images = vae.decode_tiled(video_only, tile_x=tsz // compression, tile_y=tsz // compression,
                                       overlap=ov // compression, tile_t=t_size, overlap_t=t_overlap)
            report_lines.append(f"decode: tiled (tile={tile_size}, overlap={overlap})")
        else:
            images = vae.decode(video_only)
            report_lines.append("decode: normal")
        if len(images.shape) == 5:
            images = images.reshape(-1, images.shape[-3], images.shape[-2], images.shape[-1])

        audio_out = vae_decode_audio(audio_vae, out_latent)

        return (images, audio_out, float(fps), int(total_frame), "\n".join(report_lines))
