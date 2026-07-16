"""
Enhanced KSampler (TJ)
표준 KSampler + 아키텍처별 프롬프트 반영 증폭(enhancer)을 하나의 노드에 내장.

증폭 로직은 아래 MIT 라이선스 프로젝트에서 유래했습니다 (THIRD_PARTY_LICENSES.md 참조):
Enhancement logic derived from MIT-licensed work by capitan01R:
  - ComfyUI-Krea2T-Enhancer      (Krea2 txtfusion tap-chunk amplification)
  - ComfyUI-Flux2Klein-Enhancer  (Klein conditioning ops)

MIT License
Copyright (c) 2026 capitan01R

동작 레벨이 아키텍처마다 다르다:
  - Krea2  : MODEL 패치 (txtfusion.forward 를 런타임 교체, 12-tap → 24청크 증폭)
  - Klein  : CONDITIONING 연산 (Qwen3 3-레이어 슬라이스 스케일 + whiten/norm)
  - Z-Image: CONDITIONING 연산 (레이어 슬라이스 없음 — 아키텍처 중립 연산만)
KSampler 는 model 과 conditioning 을 모두 입력받으므로 한 노드에서 분기 가능하다.
매칭되는 아키텍처가 없으면 증폭 없이 표준 KSampler 로 동작한다(안전 fallback).
"""

import math
from typing import Any

import torch

import comfy.samplers
import comfy.patcher_extension
from nodes import common_ksampler

from .._tj_sampling_utils import TJ_SAMPLING_CATEGORY

WRAPPER_KEY = "tj_enhanced_ksampler_krea2"

# ── Krea2 상수 (원본 ComfyUI-Krea2T-Enhancer 기준) ──────────────
KREA2_TAP_LAYERS = (2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35)
KREA2_TAP_DIM = 2560
KREA2_CHUNK_COUNT = 24
KREA2_CHUNK_DIM = 1280
ENHANCER_PROFILE_12 = (1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 2.5, 5.0, 1.1, 4.0, 1.0)
ENHANCER_CHUNK_PROFILE = ENHANCER_PROFILE_12 + ENHANCER_PROFILE_12
ENHANCER_GLOBAL_MULTIPLIER = 15.0
TXTFUSION_TOKEN_REL_CAP = 0.75


def _bounded_float(value, default: float, lo: float, hi: float) -> float:
    try:
        v = float(value)
    except Exception:
        v = default
    if not math.isfinite(v):
        v = default
    return max(lo, min(hi, v))


# ═══════════════════════════════════════════════════════════════
# 아키텍처 감지
# ═══════════════════════════════════════════════════════════════

def _is_krea2_dm(dm: Any) -> bool:
    """Krea2 SingleStreamDiT: 12-tap × 2560 txtfusion 어댑터 보유 여부."""
    return (
        hasattr(dm, "txtfusion")
        and hasattr(dm, "txtmlp")
        and hasattr(dm, "blocks")
        and hasattr(dm, "_unpack_context")
        and int(getattr(dm, "txtlayers", 0)) == len(KREA2_TAP_LAYERS)
        and int(getattr(dm, "txtdim", 0)) == KREA2_TAP_DIM
    )


def _is_klein_dm(dm: Any) -> bool:
    """FLUX.2 Klein: double/single blocks + txt_in 선형 투영."""
    return (
        hasattr(dm, "txt_in")
        and hasattr(dm, "double_blocks")
        and hasattr(dm, "single_blocks")
        and not hasattr(dm, "txtfusion")
    )


def _is_zimage_dm(dm: Any) -> bool:
    """Z-Image (Lumina NextDiT): cap_embedder + context_refiner + layers."""
    return (
        hasattr(dm, "cap_embedder")
        and hasattr(dm, "layers")
        and not hasattr(dm, "txtfusion")
    )


def _detect_arch(model) -> str:
    """model 에서 실제 diffusion model 을 꺼내 아키텍처를 판별."""
    dm = None
    for attr in ("diffusion_model",):
        inner = getattr(getattr(model, "model", None), attr, None)
        if inner is not None:
            dm = inner
            break
    if dm is None:
        return "none"
    if _is_krea2_dm(dm):
        return "krea2"
    if _is_klein_dm(dm):
        return "klein"
    if _is_zimage_dm(dm):
        return "zimage"
    return "none"


# ═══════════════════════════════════════════════════════════════
# Krea2: txtfusion 증폭 (MODEL 패치)
#   원본 ComfyUI-Krea2T-Enhancer 로직 이식
# ═══════════════════════════════════════════════════════════════

def _chunk_gains(device, dtype, strength: float) -> torch.Tensor:
    base = torch.tensor(ENHANCER_CHUNK_PROFILE, device=device, dtype=torch.float32)
    gains = 1.0 + float(strength) * (base - 1.0)
    return gains.to(dtype=dtype)


def _run_txtfusion_parts(txtfusion, x, mask=None, transformer_options=None):
    transformer_options = transformer_options or {}
    b, seq, taps, dim = x.shape
    y = x.reshape(b * seq, taps, dim)
    for block in txtfusion.layerwise_blocks:
        y = block(y.contiguous(), mask=None, transformer_options=transformer_options)
    tap_mix = y.reshape(b, seq, taps, dim).permute(0, 1, 3, 2).contiguous()
    projected = txtfusion.projector(tap_mix).squeeze(-1)
    out = projected
    for block in txtfusion.refiner_blocks:
        out = block(out, mask=mask, transformer_options=transformer_options)
    return out


def _enhanced_txtfusion_forward(txtfusion, x, mask=None, transformer_options=None, strength=1.0):
    transformer_options = transformer_options or {}
    b, seq, taps, dim = x.shape
    if taps != len(KREA2_TAP_LAYERS) or dim != KREA2_TAP_DIM:
        return txtfusion._tj_original_forward(x, mask=mask, transformer_options=transformer_options)

    reference_out = _run_txtfusion_parts(txtfusion, x, mask=mask, transformer_options=transformer_options)
    if strength == 0.0:
        return reference_out

    gains = _chunk_gains(x.device, x.dtype, strength)
    global_multiplier = 1.0 + float(strength) * (ENHANCER_GLOBAL_MULTIPLIER - 1.0)
    scaled_x = (
        x.reshape(b, seq, KREA2_CHUNK_COUNT, KREA2_CHUNK_DIM)
        * gains.view(1, 1, KREA2_CHUNK_COUNT, 1)
        * global_multiplier
    ).reshape_as(x)
    candidate_out = _run_txtfusion_parts(txtfusion, scaled_x, mask=mask, transformer_options=transformer_options)

    # 폭주 방지: 토큰별 상대 변화량을 CAP 이내로 클램프
    post_delta = candidate_out.detach().float() - reference_out.detach().float()
    token_base_rms = torch.sqrt(torch.mean(reference_out.detach().float() ** 2, dim=-1, keepdim=True)).clamp_min(1e-8)
    token_delta_rms = torch.sqrt(torch.mean(post_delta ** 2, dim=-1, keepdim=True)).clamp_min(1e-8)
    token_scale = (TXTFUSION_TOKEN_REL_CAP / (token_delta_rms / token_base_rms)).clamp(max=1.0)
    return (reference_out.detach().float() + post_delta * token_scale).to(candidate_out.dtype)


def _krea2_wrapper(executor, x, timesteps, context, attention_mask=None, transformer_options=None, **kwargs):
    transformer_options = transformer_options or {}
    cfg = transformer_options.get(WRAPPER_KEY, {})
    if not cfg or not cfg.get("enabled", True) or cfg.get("_active", False):
        return executor(x, timesteps, context, attention_mask, transformer_options, **kwargs)

    dm = executor.class_obj
    if not _is_krea2_dm(dm):
        return executor(x, timesteps, context, attention_mask, transformer_options, **kwargs)

    strength = _bounded_float(cfg.get("strength", 1.0), 1.0, 0.0, 2.0)
    if strength == 0.0:
        return executor(x, timesteps, context, attention_mask, transformer_options, **kwargs)

    txtfusion = dm.txtfusion
    if hasattr(txtfusion, "_tj_original_forward"):
        txtfusion.forward = txtfusion._tj_original_forward
        delattr(txtfusion, "_tj_original_forward")
    original_forward = txtfusion.forward

    def enhanced_forward(x_in, mask=None, transformer_options=None):
        txtfusion._tj_original_forward = original_forward
        try:
            return _enhanced_txtfusion_forward(
                txtfusion, x_in, mask=mask,
                transformer_options=transformer_options or {},
                strength=strength,
            )
        finally:
            if hasattr(txtfusion, "_tj_original_forward"):
                delattr(txtfusion, "_tj_original_forward")

    try:
        cfg["_active"] = True
        txtfusion.forward = enhanced_forward
        return executor(x, timesteps, context, attention_mask, transformer_options, **kwargs)
    finally:
        cfg["_active"] = False
        txtfusion.forward = original_forward


def _apply_krea2_enhance(model, strength: float, debug: bool):
    patched = model.clone()
    to = patched.model_options.setdefault("transformer_options", {})
    to[WRAPPER_KEY] = {"enabled": True, "strength": strength, "debug": debug}
    if hasattr(patched, "remove_wrappers_with_key"):
        patched.remove_wrappers_with_key(comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, WRAPPER_KEY)
    patched.add_wrapper_with_key(
        comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, WRAPPER_KEY, _krea2_wrapper,
    )
    if debug:
        print(f"[TJ Enhanced KSampler] krea2 enhance attached strength={strength:.3f}")
    return patched


# ═══════════════════════════════════════════════════════════════
# Klein / Z-Image: CONDITIONING 연산
#   원본 ComfyUI-Flux2Klein-Enhancer 로직 이식
#   Klein 은 Qwen3 3-레이어가 embed 축에 쌓여 있음(예: 12288 = 3×4096).
#   Z-Image 는 그런 슬라이스 구조가 없어 레이어 스케일은 적용하지 않는다.
# ═══════════════════════════════════════════════════════════════

def _detect_active_end(meta: dict, seq_len: int) -> int:
    """attention_mask 로 실제 토큰 구간을 찾는다. 없으면 전체."""
    attn_mask = meta.get("attention_mask", None)
    if attn_mask is not None and hasattr(attn_mask, "dim") and attn_mask.dim() >= 2:
        nonzero = attn_mask[0].nonzero()
        if len(nonzero) > 0:
            return int(nonzero[-1].item()) + 1
    return seq_len


def _enhance_conditioning(conditioning, active_scale, per_token_whiten, norm_equalize,
                          layer_scales=None, debug=False, tag=""):
    """layer_scales: (early, mid, late) — Klein 전용. None 이면 슬라이스 스케일 생략."""
    if not conditioning:
        return conditioning

    no_layer = layer_scales is None or all(s == 1.0 for s in layer_scales)
    if active_scale == 1.0 and per_token_whiten == 0.0 and norm_equalize == 0.0 and no_layer:
        return conditioning

    out = []
    for cond_tensor, meta in conditioning:
        if not torch.is_tensor(cond_tensor) or cond_tensor.dim() != 3:
            out.append((cond_tensor, meta))
            continue

        original_dtype = cond_tensor.dtype
        cond = cond_tensor.float()
        seq_len, embed_dim = cond.shape[1], cond.shape[2]
        active_end = _detect_active_end(meta, seq_len)
        active = cond[:, :active_end, :].clone()

        # 1) per-token whitening (시퀀스 평균 대비 편차 증폭)
        if per_token_whiten != 0.0:
            seq_mean = active.mean(dim=1, keepdim=True)
            active = seq_mean + (active - seq_mean) * (1.0 + per_token_whiten)

        # 2) per-token L2 norm 평준화
        if norm_equalize > 0.0:
            token_norms = active.norm(dim=-1, keepdim=True).clamp(min=1e-8)
            target_norm = token_norms.mean()
            normalized = active / token_norms * target_norm
            active = active * (1.0 - norm_equalize) + normalized * norm_equalize

        # 3) 활성 구간 스칼라 배율
        if active_scale != 1.0:
            active = active * active_scale

        # 4) Klein 전용: Qwen3 레이어 슬라이스별 배율 (embed_dim 이 3의 배수일 때만)
        if not no_layer and embed_dim % 3 == 0:
            w = embed_dim // 3
            e, m, l = layer_scales
            if e != 1.0:
                active[:, :, :w] *= e
            if m != 1.0:
                active[:, :, w:2 * w] *= m
            if l != 1.0:
                active[:, :, 2 * w:] *= l

        result = cond.clone()
        result[:, :active_end, :] = active
        if debug:
            diff = (result - cond).abs()
            print(f"[TJ Enhanced KSampler] {tag} shape={tuple(cond.shape)} active=[0:{active_end}] "
                  f"diff mean={diff.mean().item():.6f} max={diff.max().item():.6f}")
        out.append((result.to(dtype=original_dtype), meta))
    return out


# ═══════════════════════════════════════════════════════════════
# 노드
# ═══════════════════════════════════════════════════════════════

class TJ_EnhancedKSampler:
    """표준 KSampler + Krea2/Klein/Z-Image 프롬프트 반영 증폭 내장."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS,),
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS,),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "latent_image": ("LATENT",),
                "denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                # ── Enhance ──
                "enhance_arch": (["auto", "krea2", "klein", "zimage", "off"], {"default": "auto"}),
                "enhance_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05}),
                "enhance_debug": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                # ── 고급 (Klein / Z-Image conditioning 연산) ──
                "adv_active_scale": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.05}),
                "adv_per_token_whiten": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 5.0, "step": 0.05}),
                "adv_norm_equalize": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.05}),
                # ── 고급 (Klein 전용: Qwen3 레이어 슬라이스) ──
                "adv_early_layer_scale": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 5.0, "step": 0.05}),
                "adv_mid_layer_scale": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 5.0, "step": 0.05}),
                "adv_late_layer_scale": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 5.0, "step": 0.05}),
            },
        }

    RETURN_TYPES = ("LATENT", "STRING")
    RETURN_NAMES = ("latent", "enhance_info")
    FUNCTION = "sample"
    CATEGORY = TJ_SAMPLING_CATEGORY

    def sample(self, model, seed, steps, cfg, sampler_name, scheduler, positive, negative,
               latent_image, denoise=1.0, enhance_arch="auto", enhance_strength=1.0,
               enhance_debug=False, adv_active_scale=1.0, adv_per_token_whiten=0.0,
               adv_norm_equalize=0.0, adv_early_layer_scale=1.0, adv_mid_layer_scale=1.0,
               adv_late_layer_scale=1.0):

        strength = _bounded_float(enhance_strength, 1.0, 0.0, 2.0)
        detected = _detect_arch(model)
        arch = detected if enhance_arch == "auto" else enhance_arch

        info_arch = arch
        applied = "none"

        if enhance_arch == "off" or strength == 0.0:
            arch = "off"

        if arch == "krea2":
            if detected != "krea2" and enhance_arch != "auto":
                print("[TJ Enhanced KSampler] ⚠ krea2 를 선택했지만 모델이 Krea2 가 아닙니다 — 증폭 생략")
            else:
                model = _apply_krea2_enhance(model, strength, enhance_debug)
                applied = "krea2 (model txtfusion)"

        elif arch in ("klein", "zimage"):
            # strength(0~2) → 기본 프로파일. 고급 노브가 기본값이 아니면 그걸 우선 사용.
            act = adv_active_scale if adv_active_scale != 1.0 else 1.0
            whiten = adv_per_token_whiten if adv_per_token_whiten != 0.0 else (0.25 * strength)
            norm_eq = adv_norm_equalize
            layers = None
            if arch == "klein":
                layers = (adv_early_layer_scale, adv_mid_layer_scale, adv_late_layer_scale)
                if all(s == 1.0 for s in layers):
                    # 기본 프로파일: 후반(의미) 레이어를 강조
                    layers = (1.0, 1.0 + 0.25 * strength, 1.0 + 0.5 * strength)
            positive = _enhance_conditioning(
                positive, act, whiten, norm_eq, layer_scales=layers,
                debug=enhance_debug, tag=f"{arch}/positive",
            )
            applied = f"{arch} (conditioning)"

        info = (f"arch: detected={detected} used={info_arch} | applied={applied} | "
                f"strength={strength:.2f}")
        if enhance_debug:
            print(f"[TJ Enhanced KSampler] {info}")

        out = common_ksampler(model, seed, steps, cfg, sampler_name, scheduler,
                              positive, negative, latent_image, denoise=denoise)
        return (out[0], info)


NODE_CLASS_MAPPINGS = {
    "TJ_EnhancedKSampler": TJ_EnhancedKSampler,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TJ_EnhancedKSampler": "Enhanced KSampler (TJ)",
}
