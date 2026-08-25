# nodes/video/h3_audio_lock.py
# MiniMax H3 Audio Lock (TJ)
#
# H3 의 ref_audio 는 "참조"일 뿐이라, 프롬프트로 "원본 그대로"라고 적어도 모델이
# 음색/리듬을 참고해 새로 만들어낸다. 립싱크·뮤직비디오·더빙처럼 오디오가 원본
# 그대로여야 하는 작업에서는 샘플링 단계에서 오디오를 latent 에 고정해야 한다.
#
# 원리 (전부 ComfyUI 공식 규격):
#   H3 는 비디오+오디오를 하나의 결합 latent(NestedTensor 2-stream)로 동시에 샘플링한다.
#       video : [B, 24, T_v, H/16, W/16]
#       audio : [B, 32, 2,  T_a]
#   샘플러는 latent["noise_mask"](내부명 denoise_mask)를 매 스텝 이렇게 적용한다:
#       결과 = 결과 * mask + 원본_latent * (1 - mask)
#   즉 mask=0 인 영역은 denoise 되지 않고 원본이 계속 복원된다.
#   그리고 comfy/samplers.py 는 nested mask 를 그대로 지원한다 — denoise_mask.is_nested
#   이면 unbind() 해서 스트림별로 prepare_mask 후 pack_latents 로 다시 합친다.
#
#   따라서: 비디오 mask=1(정상 생성) / 오디오 mask=0(원본 고정) + 원본 오디오를 VAE 로
#   인코딩해 latent 의 오디오 자리에 미리 넣어두면, 결과 오디오 = 원본 오디오가 된다.
#
# RandomNoise 가 오디오 채널에도 노이즈를 만들지만 mask=0 이면 매 스텝 복원되므로
# 정상 동작이다(버그 아님).

import torch

import comfy.nested_tensor

# 공식 상수 (comfy_extras/nodes_minimax_h3.py 기준)
AUDIO_VAE_DEFAULT_SR = 32000

MODE_LOCK = "lock"
MODE_REMIX = "remix"
MODE_OPTIONS = [MODE_LOCK, MODE_REMIX]

FIT_PAD = "pad_silence"
FIT_LOOP = "loop"
FIT_NONE = "stretch_none"
FIT_OPTIONS = [FIT_PAD, FIT_LOOP, FIT_NONE]


def _as_nested(samples):
    """H3 결합 AV latent 인지 확인하고 (video, audio) 를 돌려준다."""
    if not getattr(samples, "is_nested", False):
        raise ValueError(
            "MiniMax H3 Audio Lock (TJ): H3 AV latent가 아닙니다 "
            "(NestedTensor 2-stream 필요). MiniMax H3 계열 컨디셔닝 노드의 LATENT 출력을 연결하세요."
        )
    tensors = samples.unbind()
    if len(tensors) != 2:
        raise ValueError(
            f"MiniMax H3 Audio Lock (TJ): H3 AV latent가 아닙니다 "
            f"(NestedTensor 2-stream 필요, 실제 {len(tensors)}개 스트림)."
        )
    video, audio_lat = tensors
    if video.ndim != 5 or video.shape[1] != 24:
        raise ValueError(
            f"MiniMax H3 Audio Lock (TJ): 비디오 스트림 규격이 H3와 다릅니다 "
            f"([B,24,T,H,W] 필요, 실제 {tuple(video.shape)})."
        )
    return video, audio_lat


def _encode_audio(audio, audio_vae):
    """원본 오디오를 H3 오디오 VAE 로 인코딩. 반환 [1, 32, 2, T]."""
    if not isinstance(audio, dict) or "waveform" not in audio:
        raise ValueError("MiniMax H3 Audio Lock (TJ): audio 입력이 비어 있거나 형식이 올바르지 않습니다.")
    waveform = audio["waveform"]
    if waveform is None or waveform.numel() == 0:
        raise ValueError("MiniMax H3 Audio Lock (TJ): audio waveform이 비어 있습니다.")

    sr = int(audio.get("sample_rate", AUDIO_VAE_DEFAULT_SR))
    vae_sr = int(getattr(audio_vae, "audio_sample_rate", AUDIO_VAE_DEFAULT_SR))
    resampled = False
    if sr != vae_sr:
        import torchaudio
        waveform = torchaudio.functional.resample(waveform, sr, vae_sr)
        resampled = True

    src_seconds = float(waveform.shape[-1]) / float(vae_sr) if vae_sr else 0.0
    try:
        # 배치 1개만 사용하고, 채널축을 뒤로 보내는 것이 이 VAE 의 입력 규약이다.
        z = audio_vae.encode(waveform[:1].movedim(1, -1))
    except Exception as exc:
        raise ValueError(
            "MiniMax H3 Audio Lock (TJ): audio_vae로 오디오를 인코딩하지 못했습니다. "
            "MiniMax H3 전용 오디오 VAE(minimax_h3_audio_vae_*)가 맞는지 확인하세요. "
            f"원본 오류: {exc}"
        ) from exc
    return z, src_seconds, resampled, vae_sr


def _fit_length(z, target_t, fit_mode):
    """오디오 latent 의 시간축을 target_t 에 맞춘다. (정합된 텐서, 방식 설명) 반환."""
    t = z.shape[-1]
    if t == target_t:
        return z, "exact"

    if t > target_t:
        # 슬라이스는 원본 저장소를 공유하므로 clone 으로 끊어준다.
        return z[..., :target_t].clone(), f"trim ({t} → {target_t})"

    # t < target_t
    if fit_mode == FIT_LOOP:
        reps = -(-target_t // t)  # ceil
        looped = z.repeat(*([1] * (z.ndim - 1)), reps)
        return looped[..., :target_t].clone(), f"loop ×{reps} ({t} → {target_t})"

    out = torch.zeros(
        (*z.shape[:-1], target_t), dtype=z.dtype, device=z.device
    )
    out[..., :t] = z
    label = "pad_silence" if fit_mode == FIT_PAD else "pad(stretch_none)"
    return out, f"{label} ({t} → {target_t})"


class TJ_H3_AudioLock:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # 무선 Set/Get — 입력 수신용 get_name, 출력 발행용 auto_set
                "get_name_av_latent": (["(none)"], {"default": "(none)"}),
                "get_name_audio": (["(none)"], {"default": "(none)"}),
                "get_name_audio_vae": (["(none)"], {"default": "(none)"}),
                "auto_set": ("BOOLEAN", {"default": False, "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
                # Core
                "mode": (MODE_OPTIONS, {"default": MODE_LOCK,
                    "tooltip": "lock: 오디오를 원본 그대로 고정(mask=0). "
                               "remix: strength 만큼만 원본을 유지하고 나머지는 모델이 생성."}),
                # Control
                "strength": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "remix 전용. 오디오 스트림의 mask 값. 0에 가까울수록 원본 유지, "
                               "1에 가까울수록 모델이 새로 생성. lock 모드에서는 무시됩니다."}),
                "fit": (FIT_OPTIONS, {"default": FIT_PAD,
                    "tooltip": "오디오가 목표 길이보다 짧을 때의 처리. "
                               "pad_silence: 뒤를 무음으로 채움 / loop: 원본을 반복 / "
                               "stretch_none: 무음 패딩하되 리포트에 경고. 길면 항상 잘라냅니다."}),
            },
            "optional": {
                "av_latent": ("LATENT",),
                "audio": ("AUDIO",),
                "audio_vae": ("VAE",),
            },
        }

    RETURN_TYPES = ("LATENT", "AUDIO", "STRING")
    RETURN_NAMES = ("av_latent", "audio", "report")
    FUNCTION = "lock"
    CATEGORY = " ✨ TJ_Node/Video"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def lock(self, get_name_av_latent="(none)", get_name_audio="(none)",
             get_name_audio_vae="(none)", auto_set=False,
             mode=MODE_LOCK, strength=0.5, fit=FIT_PAD,
             av_latent=None, audio=None, audio_vae=None):

        if av_latent is None:
            raise ValueError("MiniMax H3 Audio Lock (TJ): av_latent 입력이 연결되지 않았습니다.")
        if audio is None:
            raise ValueError("MiniMax H3 Audio Lock (TJ): audio 입력이 연결되지 않았습니다.")
        if audio_vae is None:
            raise ValueError("MiniMax H3 Audio Lock (TJ): audio_vae 입력이 연결되지 않았습니다.")

        video, audio_lat_target = _as_nested(av_latent.get("samples"))
        target_t = int(audio_lat_target.shape[-1])

        z, src_seconds, resampled, vae_sr = _encode_audio(audio, audio_vae)
        src_t = int(z.shape[-1])
        z = z.to(dtype=audio_lat_target.dtype, device=audio_lat_target.device)
        new_audio, fit_note = _fit_length(z, target_t, fit)

        new_samples = comfy.nested_tensor.NestedTensor((video, new_audio))

        # mask 는 interpolate 를 타므로 반드시 float. 스트림별 latent 와 동일한 shape 로
        # 만들어 두면 prepare_mask 가 리샘플할 일이 없어 가장 안전하다.
        mask_value = 0.0 if mode == MODE_LOCK else float(max(0.0, min(1.0, strength)))
        video_mask = torch.ones_like(video, dtype=torch.float32)
        audio_mask = torch.full_like(new_audio, mask_value, dtype=torch.float32)
        noise_mask = comfy.nested_tensor.NestedTensor((video_mask, audio_mask))

        # 입력 dict 를 in-place 로 고치면 ComfyUI 출력 캐시가 오염된다 — 얕은 복사 후 교체.
        out = {k: v for k, v in av_latent.items()}
        out["samples"] = new_samples
        out["noise_mask"] = noise_mask

        warn = ""
        if src_t < target_t * 0.5:
            warn = ("\n⚠ 원본 오디오가 목표 길이의 50% 미만입니다 — 뒷부분이 크게 비어 있습니다."
                    if fit != FIT_LOOP else
                    "\n⚠ 원본 오디오가 목표 길이의 50% 미만이라 여러 번 반복되었습니다.")
        if fit == FIT_NONE and src_t < target_t:
            warn += "\n⚠ stretch_none: 길이를 늘리지 않고 무음으로 채웠습니다."

        report = (
            f"MiniMax H3 Audio Lock (TJ)\n"
            f"mode           : {mode}" + (f" (strength {mask_value:.2f})" if mode == MODE_REMIX else " (audio mask = 0)") + "\n"
            f"source audio   : {src_seconds:.2f}s @ {vae_sr}Hz" + (" (resampled)" if resampled else "") + "\n"
            f"latent frames  : source T={src_t} → target T_a={target_t}\n"
            f"fit            : {fit_note}\n"
            f"video stream   : {tuple(video.shape)} (mask=1, 정상 생성)\n"
            f"audio stream   : {tuple(new_audio.shape)} (mask={mask_value:g})\n"
            f"note           : 최종 합성에는 이 노드의 audio 출력을 사용하세요.\n"
            f"                 H3 오디오 VAE는 뉴럴 코덱이라 encode→decode가 파형을 그대로\n"
            f"                 복원하지 않습니다(내용은 보존, 위상은 달라짐). 그래서\n"
            f"                 VAEDecodeAudio 결과는 원본과 파형이 다르고, 락이 정상\n"
            f"                 동작해도 파형 상관계수는 0 근처가 나옵니다 — 확인하려면\n"
            f"                 스펙트로그램으로 비교하세요."
            + warn
        )

        # audio 는 입력 원본을 그대로 통과시킨다 — VAE 왕복 손실을 피하기 위함.
        return (out, audio, report)
