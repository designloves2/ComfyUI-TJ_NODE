"""
TJ_NODE - LoRA Block Analyzer 공용 코어

여러 아키텍처(Krea2 / Flux2 Klein 4B·9B / Z-Image)의 LoRA 를
'키 형식 무관' 하게 분석/필터링하기 위한 공통 로직.

지원 키 형식 (학습 툴/옵션에 따라 제각각이라 자동 인식):
  - dot 표준   : ...attn.wq.lora_A.weight        / .lora_B.weight
  - kohya      : lora_unet_blocks_0_attn_wq.lora_down.weight / .lora_up.weight / .alpha
  - diffusers  : ...attn.to_k.lora.down.weight   / .lora.up.weight
  - LoKr       : ...lokr_w1 / .lokr_w2
  - 단축형     : ....A / .B

블록 매핑은 BlockSpec(아키텍처별 섹션 정의)이 담당한다.
"""

import re
import torch

# ─────────────────────────────────────────────
# 키 접미사 (down = lora_A 계열 / up = lora_B 계열)
#   긴 것부터 검사해야 오매칭이 없다 (.lora.down.weight vs .down.weight 등)
# ─────────────────────────────────────────────

_DOWN_SUFFIXES = (
    ".lora_down.weight", ".lora.down.weight", ".lora_A.weight",
    ".lokr_w1", ".hada_w1_a", ".A",
)
_UP_SUFFIXES = (
    ".lora_up.weight", ".lora.up.weight", ".lora_B.weight",
    ".lokr_w2", ".hada_w2_a", ".B",
)
_ALL_SUFFIXES = _DOWN_SUFFIXES + _UP_SUFFIXES + (".alpha",)


def role_and_base(key: str):
    """키의 역할('down'/'up')과 모듈 베이스명. 아니면 (None, None)."""
    for suf in _DOWN_SUFFIXES:
        if key.endswith(suf):
            return "down", key[:-len(suf)]
    for suf in _UP_SUFFIXES:
        if key.endswith(suf):
            return "up", key[:-len(suf)]
    return None, None


def module_base(key: str):
    """알려진 접미사(.alpha 포함)를 제거한 모듈 베이스명. 아니면 None."""
    for suf in _ALL_SUFFIXES:
        if key.endswith(suf):
            return key[:-len(suf)]
    return None


def is_down_key(key: str) -> bool:
    return any(key.endswith(suf) for suf in _DOWN_SUFFIXES)


def effective_delta_norm(down, up):
    """실제 기여 크기 ‖up @ down‖_F 를 rank 공간에서 계산. (norm, rank) 반환.
    ‖up@down‖_F² = trace((uᵀu)(d dᵀ)) → rank×rank 연산이라 큰 레이어도 빠르다.
    단순 ‖d‖·‖u‖(상한)보다 블록 간 차이를 또렷하게 반영한다."""
    d = down.float()
    u = up.float()
    if d.ndim == 2 and u.ndim == 2 and d.shape[0] == u.shape[1]:
        Gu = u.transpose(0, 1) @ u        # [r, r]
        Gd = d @ d.transpose(0, 1)        # [r, r]
        val = float(torch.sqrt(torch.clamp((Gu * Gd).sum(), min=0.0)))
        return val, d.shape[0]
    # 형상 불일치(LoKr 등) → 상한 근사로 폴백
    return float(torch.norm(d) * torch.norm(u)), (d.shape[0] if d.ndim else 1)


# ─────────────────────────────────────────────
# 아키텍처별 블록 스펙
# ─────────────────────────────────────────────

class BlockSpec:
    """sections: [(aliases, count, label), ...]  — 표시 순서대로.
    aliases: 같은 섹션을 가리키는 컨테이너 이름들(네이밍 변형 대응).
      예) Klein double = ["double_blocks", "transformer_blocks"]
    """

    def __init__(self, sections):
        self.sections = sections
        self.total = sum(c for _, c, _ in sections)
        # 표시 순서 기준 오프셋
        self.offsets = []
        off = 0
        for aliases, cnt, label in sections:
            self.offsets.append(off)
            off += cnt
        # 매칭 우선순위: alias 길이 긴 것부터
        #  (single_transformer_blocks 가 transformer_blocks 를 포함하므로 필수)
        self._alias_map = []
        for si, (aliases, cnt, label) in enumerate(sections):
            for a in aliases:
                self._alias_map.append((a, si))
        self._alias_map.sort(key=lambda x: -len(x[0]))

    def probe(self, base: str):
        """모듈 베이스명 → (섹션 인덱스, 로컬 번호). 매칭 불가 시 None.
        범위 초과여도 그대로 돌려준다(아키텍처 불일치 감지에 사용)."""
        if not base:
            return None
        for alias, si in self._alias_map:
            m = re.search(re.escape(alias) + r'[._](\d+)', base)
            if m:
                return si, int(m.group(1))
        return None

    def block_index(self, base: str):
        """모듈 베이스명 → 블록 인덱스. 매칭 불가/범위 초과 시 None."""
        p = self.probe(base)
        if p is None:
            return None
        si, local = p
        aliases, cnt, label = self.sections[si]
        if 0 <= local < cnt:
            return self.offsets[si] + local
        return None

    def display_name(self, idx: int) -> str:
        for si, (aliases, cnt, label) in enumerate(self.sections):
            off = self.offsets[si]
            if off <= idx < off + cnt:
                return f"{label} {idx - off:02d}"
        return f"Block {idx:02d}"

    def structure(self):
        """프론트엔드용 구조 정보."""
        return {
            "total": self.total,
            "sections": [
                {"label": label, "start": self.offsets[si], "count": cnt}
                for si, (aliases, cnt, label) in enumerate(self.sections)
            ],
            "names": [self.display_name(i) for i in range(self.total)],
        }


# 아키텍처 등록 (블록 수는 실제 LoRA 파일들로 교차 검증한 값)
SPECS = {
    # Krea2: main 28 + txtfusion layerwise 2 + refiner 2 = 32
    "krea2": BlockSpec([
        (["blocks"], 28, "Block"),
        (["layerwise_blocks"], 2, "TxtFusion-Layerwise"),
        (["refiner_blocks"], 2, "TxtFusion-Refiner"),
    ]),
    # Flux2 Klein 4B: double 5 + single 20 = 25
    "klein4b": BlockSpec([
        (["double_blocks", "transformer_blocks"], 5, "Double"),
        (["single_blocks", "single_transformer_blocks"], 20, "Single"),
    ]),
    # Flux2 Klein 9B: double 8 + single 24 = 32
    "klein9b": BlockSpec([
        (["double_blocks", "transformer_blocks"], 8, "Double"),
        (["single_blocks", "single_transformer_blocks"], 24, "Single"),
    ]),
    # Z-Image (Turbo/Base 동일): layers 30
    "zimage": BlockSpec([
        (["layers"], 30, "Layer"),
    ]),
}


# ─────────────────────────────────────────────
# 분석 / 필터
# ─────────────────────────────────────────────

def analyze_lora(lora_sd: dict, spec: BlockSpec) -> dict:
    """블록별 기여도(impact 0~100) 계산. 키 형식 무관."""
    modules = {}
    alphas = {}
    for key, val in lora_sd.items():
        role, base = role_and_base(key)
        if role:
            modules.setdefault(base, {})[role] = val
        elif key.endswith(".alpha"):
            try:
                alphas[key[:-len(".alpha")]] = float(val)
            except Exception:
                pass

    total = spec.total
    block_norm = {i: 0.0 for i in range(total)}
    block_cnt  = {i: 0 for i in range(total)}
    for base, du in modules.items():
        if "down" not in du or "up" not in du:
            continue
        bi = spec.block_index(base)
        if bi is None or not (0 <= bi < total):
            continue
        try:
            n, rank = effective_delta_norm(du["down"], du["up"])
            a = alphas.get(base)          # kohya: 효과 스케일 = alpha/rank
            if a is not None and rank:
                n *= a / rank
            block_norm[bi] += n
            block_cnt[bi]  += 1
        except Exception:
            continue

    block_data = {}
    for i in range(total):
        avg = block_norm[i] / block_cnt[i] if block_cnt[i] else 0.0
        block_data[i] = {
            "name":   spec.display_name(i),
            "norm":   avg,
            "pairs":  block_cnt[i],
            "impact": 0.0,
        }
    max_norm = max(v["norm"] for v in block_data.values()) or 1.0
    for i in block_data:
        block_data[i]["impact"] = round(block_data[i]["norm"] / max_norm * 100, 1)
    return block_data


def check_spec_fit(lora_sd: dict, spec: BlockSpec) -> dict:
    """이 LoRA 가 이 노드(아키텍처 스펙)에 맞는지 검사.

    4B/9B 처럼 구조만 다른 변형을 잘못 고르면 초과 블록이 조용히 버려져
    분석이 틀리게 나오므로, 미리 감지해 경고한다.
    반환: {"matched": n, "over": {label: max_local}, "warning": str|None}
    """
    matched = 0
    over = {}
    for key in lora_sd:
        base = module_base(key)
        if not base:
            continue
        p = spec.probe(base)
        if p is None:
            continue
        si, local = p
        aliases, cnt, label = spec.sections[si]
        if 0 <= local < cnt:
            matched += 1
        else:
            over[label] = max(over.get(label, -1), local)

    warning = None
    if matched == 0:
        warning = ("No blocks recognized — this LoRA may be for a different "
                   "architecture (check you picked the matching Analyzer node).")
    elif over:
        detail = ", ".join(
            f"{label} up to {mx} (this node supports {cnt})"
            for (aliases, cnt, label) in spec.sections
            for lbl2, mx in over.items() if lbl2 == label
        )
        warning = ("Architecture mismatch — this LoRA has blocks beyond this node's "
                   f"range: {detail}. Those blocks are ignored; use the matching "
                   "variant node (e.g. 9B vs 4B).")
    return {"matched": matched, "over": over, "warning": warning}


def build_filtered_lora(lora_sd: dict, config: dict, spec: BlockSpec) -> dict:
    """블록 ON/OFF + 강도를 적용한 LoRA state_dict 생성. 키 형식 무관."""
    filtered = {}
    for key, tensor in lora_sd.items():
        base = module_base(key)
        bi = spec.block_index(base) if base else None

        # 블록에 매핑되지 않는 키(other_weights) → 그대로 포함
        if bi is None or not (0 <= bi < spec.total):
            filtered[key] = tensor
            continue

        bc = config.get(str(bi), {})
        if not bc.get("enable", True):
            continue  # 블록 비활성 → 이 모듈의 모든 키 제외

        s = float(bc.get("strength", 1.0))
        # 강도는 down(=lora_A/lokr_w1) 쪽에만 곱해 선형 스케일
        if s != 1.0 and is_down_key(key):
            filtered[key] = tensor * s
        else:
            filtered[key] = tensor
    return filtered
