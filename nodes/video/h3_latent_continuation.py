# nodes/video/h3_latent_continuation.py
# MiniMax H3 Latent Continuation — "One-Take" (TJ)
#
# 지금 릴레이 방식(Last Frame Chain)은 클립 N의 마지막 프레임 이미지 1장을 클립 N+1의
# first-frame으로 넘긴다. VAE로 디코드했다가 다시 인코드하는 왕복이 있고, 그 과정에서
# 모션 정보가 사라져 클립 N+1은 강제로 FL2VA 모델을 쓰게 된다(Reference 모드였어도).
#
# 이 노드는 latent 자체를 자르지 않고 그대로 이어붙인다: 클립 N을 샘플링한 결과 latent의
# 꼬리 K프레임(video + 대응하는 audio)을 클립 N+1의 빈 latent 앞부분에 복사하고, 그 구간을
# noise_mask=0으로 표시해 샘플러가 다시 생성하지 않게 한다. VAE 왕복이 없고, 원래 모드
# (Reference 포함)를 그대로 유지할 수 있다.
#
# 원리는 Audio Lock(h3_audio_lock.py)과 동일한 ComfyUI 공식 규격이다:
#   comfy/samplers.py 의 CFGNoisePredictor.__call__ 이
#       out = out * denoise_mask + latent_image * (1 - denoise_mask)
#   를 적용한다 — mask가 정확히 0/1이면 이건 근사가 아니라 대수적으로 완전한 보존이다.
#   CFGGuider.sample() 은 denoise_mask.is_nested 면 unbind() 해서 스트림별로 prepare_mask
#   후 다시 pack_latents 로 합친다. SamplerCustomAdvanced 는 latent["noise_mask"] 를 그대로
#   읽어서 넘기므로 그래프 쪽 추가 배선이 필요 없다.
#
# 함정 두 가지(직접 소스로 확인한 것):
#   1. NestedTensor.__getitem__ 은 video/audio 두 스트림에 같은 인덱스를 적용한다. 두 스트림의
#      시간축 스케일이 다르므로(24fps 그리드 vs 40fps 오디오 latent) 반드시 .unbind() 로 풀어서
#      각자 올바르게 환산한 인덱스로 슬라이싱해야 한다.
#   2. comfy/sampler_helpers.py 의 prepare_mask -> comfy/utils.py 의 reshape_mask 는 마스크를
#      항상 interpolate 한다. 마스크 shape이 latent의 T/H/W와 정확히 같으면 interpolate가
#      항등 연산이라 0/1 경계가 유지되지만, 다르면 trilinear 보간으로 경계가 블러된다.

import torch

import comfy.nested_tensor
from comfy_extras.nodes_minimax_h3 import align_frame_count, video_latent_t

FPS = 24
AUDIO_LATENT_FPS = 40


def _as_nested(samples, label):
    if not getattr(samples, "is_nested", False):
        raise ValueError(
            f"MiniMax H3 Latent Continuation (TJ): {label}이(가) H3 AV latent가 아닙니다 "
            "(NestedTensor 2-stream 필요). MiniMax H3 계열 노드의 LATENT 출력을 연결하세요."
        )
    tensors = samples.unbind()
    if len(tensors) != 2:
        raise ValueError(
            f"MiniMax H3 Latent Continuation (TJ): {label}의 스트림 개수가 다릅니다 "
            f"(2개 필요, 실제 {len(tensors)}개)."
        )
    video, audio = tensors
    if video.ndim != 5 or video.shape[1] != 24:
        raise ValueError(
            f"MiniMax H3 Latent Continuation (TJ): {label}의 비디오 스트림 규격이 H3와 다릅니다 "
            f"([B,24,T,H,W] 필요, 실제 {tuple(video.shape)})."
        )
    return video, audio


class TJ_H3_LatentContinuation:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "overlap_frames": ("INT", {"default": 39, "min": 5, "max": 362, "step": 1,
                    "tooltip": "비디오 쪽 겹침 프레임 수(24fps 실제 프레임, latent 프레임 아님). "
                               "17k+5 그리드로 자동 정렬됩니다. 기본 39프레임 = 1.625초."}),
                "lock_audio": ("BOOLEAN", {"default": False,
                    "tooltip": "true면 오디오 latent 전체를 mask=0으로 고정 — Audio Lock과 같이 "
                               "쓸 때 오디오는 통째로 고정하고 비디오만 이어붙이는 용도."}),
            },
            "optional": {
                "prev_latent": ("LATENT", {
                    "tooltip": "직전 클립을 샘플링한 결과 LATENT (디코드하지 않은 것, "
                               "SamplerCustomAdvanced의 출력 그대로)."}),
                "target_latent": ("LATENT", {
                    "tooltip": "이번 클립의 빈 AV latent (MiniMax H3 컨디셔닝 노드의 LATENT 출력)."}),
            },
        }

    RETURN_TYPES = ("LATENT", "STRING")
    RETURN_NAMES = ("latent", "report")
    FUNCTION = "continue_latent"
    CATEGORY = " ✨ TJ_Node/Video"

    def continue_latent(self, overlap_frames=39, lock_audio=False,
                         prev_latent=None, target_latent=None):
        if prev_latent is None:
            raise ValueError("MiniMax H3 Latent Continuation (TJ): prev_latent 입력이 연결되지 않았습니다.")
        if target_latent is None:
            raise ValueError("MiniMax H3 Latent Continuation (TJ): target_latent 입력이 연결되지 않았습니다.")

        prev_video, prev_audio = _as_nested(prev_latent.get("samples"), "prev_latent")
        tgt_video, tgt_audio = _as_nested(target_latent.get("samples"), "target_latent")

        # 비디오 쪽 겹침 프레임 수 -> latent 프레임 수. video_latent_t는 그리드에 맞춘 프레임
        # 카운트를 받는다는 점에 주의 — 먼저 align_frame_count로 정렬한다.
        overlap_aligned = align_frame_count(max(5, int(overlap_frames)))
        k_v = min(video_latent_t(overlap_aligned), prev_video.shape[2], tgt_video.shape[2])

        # 오디오 쪽 대응 스텝 수 — 24fps 프레임을 40fps 오디오 latent 스텝으로 환산.
        # temporal_shape()과 같은 비율식을 써야 두 스트림이 어긋나지 않는다.
        k_a = min(round(overlap_aligned / FPS * AUDIO_LATENT_FPS),
                  prev_audio.shape[-1], tgt_audio.shape[-1])

        if k_v <= 0:
            raise ValueError(
                "MiniMax H3 Latent Continuation (TJ): overlap_frames가 0 latent 프레임으로 "
                "정렬되었습니다 — 값을 늘려주세요."
            )

        # 1) 복사 — 직전 클립의 "꼬리"를 이번 클립의 "머리"에 그대로 붙여넣는다.
        #    target_latent가 곧 샘플러의 latent_image가 되므로, mask=0 구간이 정확히 보존되려면
        #    여기서 미리 원하는 값(복사해온 prev 값)을 넣어둬야 한다 — 마스크만 만들고 복사를
        #    빼먹으면 mask=0 구간이 "0으로 채워진 빈 latent"로 조용히 보존되어버린다.
        new_video = tgt_video.clone()
        new_video[:, :, :k_v] = prev_video[:, :, -k_v:]
        new_audio = tgt_audio.clone()
        if k_a > 0:
            new_audio[:, :, :, :k_a] = prev_audio[:, :, :, -k_a:]

        new_samples = comfy.nested_tensor.NestedTensor((new_video, new_audio))

        # 2) 마스크 — shape을 각 스트림의 T/H/W와 정확히 맞춘다(채널은 1로 브로드캐스트 가능).
        #    0 = 보존(복사된 구간), 1 = 생성.
        video_mask = torch.ones_like(new_video[:, :1], dtype=torch.float32)
        video_mask[:, :, :k_v] = 0.0
        if lock_audio:
            audio_mask = torch.zeros_like(new_audio[:, :1], dtype=torch.float32)
        else:
            audio_mask = torch.ones_like(new_audio[:, :1], dtype=torch.float32)
            if k_a > 0:
                audio_mask[:, :, :, :k_a] = 0.0

        out = {k: v for k, v in target_latent.items()}
        out["samples"] = new_samples
        out["noise_mask"] = comfy.nested_tensor.NestedTensor((video_mask, audio_mask))

        report = (
            f"MiniMax H3 Latent Continuation (TJ)\n"
            f"overlap        : {overlap_frames} frames requested -> {overlap_aligned} aligned "
            f"({overlap_aligned / FPS:.3f}s)\n"
            f"video copied   : {k_v} latent frame(s) of {tuple(tgt_video.shape)}\n"
            f"audio copied   : {k_a} latent step(s) of {tuple(tgt_audio.shape)}"
            + (" (lock_audio: entire stream mask=0)" if lock_audio else "") + "\n"
            f"note           : decode only the last clip in an One-Take chain — the point of\n"
            f"                 this node is that intermediate clips never round-trip through VAE."
        )
        return (out, report)
