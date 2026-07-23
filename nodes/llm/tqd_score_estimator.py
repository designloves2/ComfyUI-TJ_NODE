# nodes/llm/tqd_score_estimator.py
"""TQD Score Estimate (TJ) — local Vision-LLM scorer for Krea2 TQD training
(structure_score / detail_score), built on the same GGUF/llama.cpp + mmproj
vision backend and ComfyUI TextGenerate backend that Image to Prompt (TJ) and
Prompt Studio (TJ) already use — see nodes/llm/_llm_utils.py.

No separate loader node: like every other node in this package, the model is
loaded once per node execution (covering the whole image batch) and freed at
the end; ComfyUI's own execution cache already skips re-running this node
when its widget values haven't changed, so nothing extra is needed to avoid
reloading between runs.
"""

import base64
import json
import os
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image

import folder_paths
from ..image._image_utils import resolve_target_dir
from ._llm_utils import (
    TJ_LLM_CATEGORY, MODEL_BACKEND_OPTIONS, MMPROJ_NONE,
    DEFAULT_TEXT_ENCODER_MODEL, DEFAULT_GGUF_MODEL, DEFAULT_MMPROJ_MODEL,
    CLIP_LOADER_TYPE_OPTIONS, _HANDLER_CLASSES,
    _text_encoder_ggufs, _text_encoder_mmproj_options, _text_encoder_model_options,
    _resolve_text_encoder_path, _is_bad_choice, _free_llm, _free_chat_handler, _free_comfy_vram,
    _load_clip_from_text_encoder, _generate_with_textgenerate,
    tensor_to_data_uri,
)

try:
    from server import PromptServer
    from aiohttp import web
except Exception:
    PromptServer = None
    web = None

try:
    import comfy.model_management as comfy_model_management
except Exception:
    comfy_model_management = None

PROGRESS_EVENT = "tj-tqd-score-progress"


def _settings_file_path() -> str:
    """User's own ComfyUI/user directory (respects --user-directory), not the git-tracked
    node folder — settings are per-installation config, not something to commit or ship."""
    return os.path.join(folder_paths.get_user_directory(), "tj_node", "tqd_score_estimate_settings.json")


async def _handle_load_settings(request):
    path = _settings_file_path()
    if not os.path.isfile(path):
        return web.json_response({})
    try:
        with open(path, "r", encoding="utf-8") as f:
            return web.json_response(json.load(f))
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def _handle_save_settings(request):
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise TypeError("settings payload must be a JSON object")
        path = _settings_file_path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return web.json_response({"ok": True, "path": path})
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=400)


if PromptServer is not None:
    PromptServer.instance.routes.get("/tj/tqd_score_estimate/settings")(_handle_load_settings)
    PromptServer.instance.routes.post("/tj/tqd_score_estimate/settings")(_handle_save_settings)


def _check_interrupted() -> None:
    """Hard-stop check between images. Each LLM call takes 13-30s and can't be
    interrupted mid-call, but checking here means pressing ComfyUI's Cancel button
    aborts the loop right after the current image finishes instead of running the
    rest of the batch."""
    if comfy_model_management is not None:
        thrower = getattr(comfy_model_management, "throw_exception_if_processing_interrupted", None)
        if callable(thrower):
            thrower()


def _send_progress(payload: Dict[str, Any]) -> None:
    try:
        sender = getattr(getattr(PromptServer, "instance", None), "send_sync", None)
        if sender:
            sender(PROGRESS_EVENT, payload)
    except Exception:
        pass


def _thumbnail_data_uri(image_slice: Any, max_side: int = 220) -> str:
    """Small preview-only thumbnail sent over the progress websocket — kept separate
    from the full-resolution image handed to the LLM so live-preview traffic stays light."""
    img = image_slice[0] if hasattr(image_slice, "dim") and image_slice.dim() == 4 else image_slice
    arr = (img.detach().cpu().numpy() * 255.0).clip(0, 255).astype("uint8")
    pil = Image.fromarray(arr)
    pil.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    buf = BytesIO()
    pil.save(buf, format="JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

# LLM 채점자는 기준점(anchor) 없이 점수만 요구하면 거의 항상 상단(0.9+)에 몰려서 답하는
# 경향(leniency bias)이 있다 — 실측: abliterated Qwen3-VL 8B로 서로 다른 이미지 6장을
# 채점했더니 0.95~0.98 사이에 전부 뭉침(캡션은 이미지마다 정확히 달랐으므로 비전 인식
# 자체는 정상이었음 — 순수하게 채점 관대함 문제).
#
# 절대치를 낮추는 것만으로는 부족하다: krea2-trainer의 실제 학습 공식은
#   mu = 0.5 + 0.5*(structure - detail),  kappa ∝ |structure - detail|
# 를 써서 두 점수의 "차이"로 timestep 샘플링을 편향시킨다 (구조가 강하면 고노이즈/초반
# 구간에, 디테일이 강하면 저노이즈/후반 구간에 그 이미지를 집중 노출). 두 점수를 그냥
# 같이 낮추기만 하면(예: 0.95/0.98 → 0.75/0.78) 여전히 mu≈0.5로 붙어있어서 TQD가 아무
# 일도 안 하는 건 똑같다. 그래서 "낮게 주는 것"보다 "두 축을 독립적으로 평가해서 실제
# 격차를 그대로 드러내는 것"이 훨씬 중요하다.
_SCORE_CALIBRATION = (
    "채점 시 반드시 지킬 것:\n"
    "- 완벽한(1.0에 가까운) 이미지는 극히 드물다. 실제 사진 대부분은 0.5~0.85 사이에 분포해야\n"
    "  정상이다. 뚜렷한 결함이 없다고 자동으로 0.9+ 를 주지 말 것 — 결함이 '있는지'가 아니라\n"
    "  '얼마나 완벽에 가까운지'를 기준으로 삼는다.\n"
    "- 이미지를 볼 때 먼저 결점을 최소 1개 이상 적극적으로 찾아라(손가락 개수, 손 모양,\n"
    "  피부 텍스처의 플라스틱 느낌, 배경의 사소한 왜곡, 조명 불균일, 미세한 블러 등). 결점을\n"
    "  찾지 못했다면 다시 한번 자세히 보라.\n"
    "- structure_score와 detail_score는 반드시 서로 완전히 독립적으로 채점하라. 절대 비슷한\n"
    "  값으로 맞추려 하지 마라. 대부분의 실제 이미지는 두 축의 강약이 다르다 — 구도/자세는\n"
    "  좋은데 피부/모발 디테일이 뭉개졌다면 structure는 높고 detail은 낮게, 반대로 얼굴은\n"
    "  선명한데 자세가 어색하거나 프레이밍이 잘렸다면 detail은 높고 structure는 낮게 매겨라.\n"
    "  두 점수가 이번 이미지에서 0.15 이상 차이 나지 않는다면, 정말 그런지 두 축을 각각\n"
    "  다시 따로 살펴보고 놓친 격차가 없는지 확인하라.\n"
    "- 점수 구간 기준(참고용, 두 축에 각각 독립적으로 적용):\n"
    "  0.95~1.00 = 거의 완벽, 실사와 구분 불가, 흠잡을 곳이 사실상 없음 (극히 드묾)\n"
    "  0.85~0.94 = 매우 좋음, 아주 사소한 흠만 있음\n"
    "  0.70~0.84 = 양호, 눈에 띄는 사소한 결함 1~2개\n"
    "  0.50~0.69 = 보통, 명확한 결함이 있지만 사용 가능한 수준\n"
    "  0.30~0.49 = 미흡, 여러 결함이 뚜렷함\n"
    "  0.00~0.29 = 심각한 결함, 사용 불가 수준\n"
)

DEFAULT_SYSTEM_PROMPT = (
    "당신은 이미지 학습 데이터셋의 품질을 평가하는 엄격한 채점자입니다.\n"
    "두 가지 독립적인 축을 0.00~1.00 사이 실수로 평가하세요:\n\n"
    "1. structure_score (구도/자세 신뢰도):\n"
    "   - 피사체(인물)의 전체적인 구도, 자세, 프레이밍이 얼마나 자연스럽고 명확한가\n"
    "   - 인물이 잘리지 않고, 자세가 왜곡되지 않았으며, 카메라 앵글이 적절한가\n"
    "   - 1.0 = 완벽한 구도/자세, 0.0 = 구도가 심하게 어색하거나 피사체가 거의 안 보임\n\n"
    "2. detail_score (얼굴/디테일 신뢰도):\n"
    "   - 얼굴, 피부, 옷 재질 등 세부 디테일이 얼마나 선명하고 왜곡 없이 보이는가\n"
    "   - 블러, 노이즈, 압축 아티팩트, 이중노출/겹침 등 결함이 있으면 감점\n"
    "   - 1.0 = 디테일이 완벽하게 선명, 0.0 = 디테일을 전혀 알아볼 수 없음\n\n"
    f"{_SCORE_CALIBRATION}\n"
    "반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트 금지:\n"
    '{"structure_score": 0.xx, "detail_score": 0.xx, "reasoning": "structure와 detail 중 어느 쪽이 더 약한지와 그 근거를 한 문장으로"}'
)
DEFAULT_SYSTEM_PROMPT_WITH_CAPTION = (
    "당신은 이미지 학습 데이터셋의 품질을 평가하고 캡션을 작성하는 엄격한 채점자입니다.\n"
    "세 가지를 평가/작성하세요:\n\n"
    "1. structure_score (구도/자세 신뢰도, 0.00~1.00):\n"
    "   - 피사체(인물)의 전체적인 구도, 자세, 프레이밍이 얼마나 자연스럽고 명확한가\n"
    "   - 인물이 잘리지 않고, 자세가 왜곡되지 않았으며, 카메라 앵글이 적절한가\n"
    "   - 1.0 = 완벽한 구도/자세, 0.0 = 구도가 심하게 어색하거나 피사체가 거의 안 보임\n\n"
    "2. detail_score (얼굴/디테일 신뢰도, 0.00~1.00):\n"
    "   - 얼굴, 피부, 옷 재질 등 세부 디테일이 얼마나 선명하고 왜곡 없이 보이는가\n"
    "   - 블러, 노이즈, 압축 아티팩트, 이중노출/겹침 등 결함이 있으면 감점\n"
    "   - 1.0 = 디테일이 완벽하게 선명, 0.0 = 디테일을 전혀 알아볼 수 없음\n\n"
    f"{_SCORE_CALIBRATION}\n"
    "3. caption (LoRA 학습용 캡션):\n"
    "   - 이 이미지를 영어로 한 문단(100단어 이내) 설명. 피사체, 구도, 옷, 배경, 조명을 포함.\n"
    "   - 주관적 미사여구 없이 사실 위주로 작성.\n\n"
    "반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트 금지:\n"
    '{"structure_score": 0.xx, "detail_score": 0.xx, "caption": "...", "reasoning": "structure와 detail 중 어느 쪽이 더 약한지와 그 근거를 한 문장으로"}'
)
DEFAULT_USER_PROMPT = "이 이미지를 위 기준으로 평가하세요."
JSON_ONLY_RETRY_SUFFIX = "\n\n(다시: 반드시 JSON 오브젝트 하나만 출력하세요. 설명, 코드블록, 다른 텍스트 금지.)"


def _extract_first_json_object(text: str) -> Optional[Dict[str, Any]]:
    text = str(text or "").strip()
    if not text:
        return None
    candidates = [text]
    start, end = text.find("{"), text.rfind("}")
    if 0 <= start < end:
        candidates.append(text[start:end + 1])
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except Exception:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _clamp01(value: Any) -> Optional[float]:
    try:
        f = float(value)
    except Exception:
        return None
    if f != f:  # NaN
        return None
    return max(0.0, min(1.0, f))


def _read_score_map(path: str) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    if not path or not os.path.isfile(path):
        return out
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except Exception:
                continue
            if not isinstance(record, dict):
                continue
            key = record.get("image_file") or record.get("cache_file")
            if not key:
                continue
            out[os.path.splitext(os.path.basename(str(key)))[0]] = record
    return out


def _upsert_score_file(path: str, updates: Dict[str, Dict[str, Any]]) -> None:
    """Replace the line for each stem in-place if it already exists, else append it
    (matches the GUI's upsert convention — no duplicate lines per image)."""
    if not path or not updates:
        return
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    lines: List[str] = []
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            lines = [ln.rstrip("\n") for ln in f]

    stem_to_line_idx: Dict[str, int] = {}
    for idx, line in enumerate(lines):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except Exception:
            continue
        if not isinstance(record, dict):
            continue
        key = record.get("image_file") or record.get("cache_file")
        if not key:
            continue
        stem_to_line_idx[os.path.splitext(os.path.basename(str(key)))[0]] = idx

    for stem, record in updates.items():
        encoded = json.dumps(record, ensure_ascii=False)
        if stem in stem_to_line_idx:
            lines[stem_to_line_idx[stem]] = encoded
        else:
            lines.append(encoded)
            stem_to_line_idx[stem] = len(lines) - 1

    with open(path, "w", encoding="utf-8") as f:
        for line in lines:
            if line.strip():
                f.write(line + "\n")


_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def _dataset_consistency_check(output_dir: str) -> Tuple[int, int]:
    """(image_count, score_count) in output_dir — a training run needs these equal,
    or Krea2 TQD training errors out at startup."""
    if not output_dir or not os.path.isdir(output_dir):
        return (0, 0)
    n_images = sum(
        1 for f in os.listdir(output_dir)
        if os.path.splitext(f)[1].lower() in _IMAGE_EXTS
    )
    score_path = os.path.join(output_dir, "tqd_scores.jsonl")
    n_scores = 0
    if os.path.isfile(score_path):
        with open(score_path, "r", encoding="utf-8") as f:
            n_scores = sum(1 for line in f if line.strip())
    return (n_images, n_scores)


def _write_caption_file(output_dir: str, filename: str, caption: str) -> None:
    """Sidecar .txt caption next to the image, matching filename stem — the standard
    LoRA training convention (image.jpg + image.txt)."""
    if not output_dir or not caption.strip():
        return
    os.makedirs(output_dir, exist_ok=True)
    stem = os.path.splitext(os.path.basename(filename))[0]
    with open(os.path.join(output_dir, stem + ".txt"), "w", encoding="utf-8") as f:
        f.write(caption.strip())


_IMAGE_FORMAT_BY_EXT = {"jpg": "JPEG", "jpeg": "JPEG", "png": "PNG", "webp": "WEBP", "bmp": "BMP"}


def _image_signature(pil_img: Image.Image) -> np.ndarray:
    """Coarse perceptual signature (16x16 grayscale) — cheap and tolerant of
    re-encoding/compression noise, unlike a byte-exact hash."""
    small = pil_img.convert("L").resize((16, 16), Image.Resampling.LANCZOS)
    return np.asarray(small, dtype=np.int16)


def _images_look_same(pil_a: Image.Image, pil_b: Image.Image, threshold: float = 8.0) -> bool:
    return float(np.abs(_image_signature(pil_a) - _image_signature(pil_b)).mean()) <= threshold


def _save_image_file(output_dir: str, filename: str, image_slice: Any) -> str:
    """Saves the actual image into the dataset folder (Krea2 TQD training reads
    image + caption + tqd_scores.jsonl from the same folder — see class docstring).

    If a file already exists under this name but is a *different* image (perceptual
    check, not just the same filename), the incoming image is saved under an
    auto-numbered name instead of silently overwriting someone else's data — two
    different upstream batches can easily reuse a generic filename like IMG_001.jpg.
    Returns the filename actually written (== ``filename`` unless renamed)."""
    if not output_dir:
        return filename
    os.makedirs(output_dir, exist_ok=True)
    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    fmt = _IMAGE_FORMAT_BY_EXT.get(ext, "PNG")
    base_name = os.path.basename(filename) if ext in _IMAGE_FORMAT_BY_EXT else os.path.splitext(os.path.basename(filename))[0] + ".png"

    img = image_slice[0] if hasattr(image_slice, "dim") and image_slice.dim() == 4 else image_slice
    arr = (img.detach().cpu().numpy() * 255.0).clip(0, 255).astype("uint8")
    pil = Image.fromarray(arr)

    stem, dot_ext = os.path.splitext(base_name)
    out_name = base_name
    n = 1
    while True:
        target = os.path.join(output_dir, out_name)
        if not os.path.isfile(target):
            break
        try:
            if _images_look_same(pil, Image.open(target)):
                break  # 같은 이미지 재저장 — 그대로 덮어써도 안전.
        except Exception:
            pass  # 손상/비이미지 파일이면 다른 이미지로 간주하고 이름을 바꾼다.
        n += 1
        out_name = f"{stem}_{n}{dot_ext}"

    save_kwargs = {"quality": 95} if fmt == "JPEG" else {}
    pil.save(os.path.join(output_dir, out_name), format=fmt, **save_kwargs)
    return out_name


class TJ_TQDScoreEstimate:
    """Builds a Krea2 TQD training dataset folder: scores each image with a local
    Vision-LLM (structure/detail + optional caption), then saves all three files
    a training folder needs into ``output_dir``:

      output_dir/
        image_001.jpg          <- the image itself (copied from the batch)
        image_001.txt          <- caption sidecar (if generate_caption=True)
        tqd_scores.jsonl       <- upserted score file, one JSON object per image

    ``tqd_scores.jsonl`` is produced here, per image, as this node runs — it's the
    *input* Krea2 TQD training reads, not an output of training itself.

      - JSON Lines, UTF-8, one object per image, no surrounding array.
      - Required keys: image_file (basename, extension optional), structure_score,
        detail_score, both in [0.0, 1.0].
      - Matching is done on the filename stem (extension stripped) — an image
        already present in tqd_scores.jsonl is skipped (no LLM call, no re-save).
      - Re-scoring the same image replaces its existing line (upsert), never appends
        a duplicate.
    """

    _cache = {}

    @classmethod
    def INPUT_TYPES(cls):
        handler_options = ["Auto-detect"] + list(_HANDLER_CLASSES.keys())
        if not _HANDLER_CLASSES:
            handler_options = ["NO_VISION_HANDLERS_AVAILABLE"]
        return {
            "required": {
                "image": ("IMAGE",),
                "model_backend": (MODEL_BACKEND_OPTIONS, {"default": "GGUF / llama.cpp"}),
                "gguf_model": (_text_encoder_ggufs(exclude_mmproj=True), {"default": DEFAULT_GGUF_MODEL}),
                "mmproj_file": (_text_encoder_mmproj_options(), {"default": DEFAULT_MMPROJ_MODEL}),
                "chat_handler": (handler_options,),
                "text_encoder_name": (_text_encoder_model_options(), {"default": DEFAULT_TEXT_ENCODER_MODEL}),
                "clip_loader_type": (CLIP_LOADER_TYPE_OPTIONS, {"default": "Auto"}),
                # n_ctx는 4096보다 넉넉하게: 고해상도 이미지는 비전 인코더가 뱉는 이미지 토큰만으로도
                # 수천 개를 먹을 수 있어, 지시문+답변까지 더하면 4096은 종종 부족하다.
                "n_gpu_layers": ("INT", {"default": -1, "min": -1, "max": 999, "step": 1}),
                "n_ctx": ("INT", {"default": 8192, "min": 512, "max": 32768, "step": 512}),
                # max_tokens 128은 점수만 낼 땐 충분하지만 caption(영어 100단어 ≈ 150토큰 안팎)까지
                # 같이 시키면 자주 잘려서 JSON 파싱이 깨진다. generate_caption 기본값이 True이므로
                # 여유 있게 잡는다.
                "max_tokens": ("INT", {"default": 320, "min": 16, "max": 1024, "step": 16}),
                # temperature 0.0 = greedy decoding — 같은 이미지는 항상 같은 점수가 나와야
                # (재현성) TQD 학습 데이터로서 의미가 있다.
                "temperature": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 2.0, "step": 0.05}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
            },
            "optional": {
                "image_filename": ("STRING", {"forceInput": True}),
                "output_dir": ("STRING", {"default": "", "placeholder": "output 하위 폴더 (예: krea2_tqd/dataset1)"}),
                "save_results": ("BOOLEAN", {"default": True}),
                "generate_caption": ("BOOLEAN", {"default": True}),
                "custom_prompt": ("STRING", {"multiline": True, "default": ""}),
                "clip": ("CLIP",),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    RETURN_TYPES = ("FLOAT", "FLOAT", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("structure_score", "detail_score", "reasoning", "caption", "jsonl_line", "preview_text")
    OUTPUT_IS_LIST = (True, True, True, True, True, False)
    FUNCTION = "estimate"
    CATEGORY = TJ_LLM_CATEGORY
    # 이 노드의 실질적인 결과물은 output_dir에 쓰는 파일들(이미지+캡션+tqd_scores.jsonl)이지,
    # 그래프 출력 소켓이 아니다. OUTPUT_NODE가 없으면 아무 출력도 연결 안 됐을 때 ComfyUI가
    # 이 노드를 실행 그래프에서 가지치기해버려 저장 자체가 안 될 수 있다.
    OUTPUT_NODE = True

    def estimate(self, image, model_backend="GGUF / llama.cpp", gguf_model="", mmproj_file=MMPROJ_NONE,
                 chat_handler="Auto-detect", text_encoder_name="", clip_loader_type="Auto",
                 n_gpu_layers=-1, n_ctx=8192, max_tokens=320, temperature=0.0, seed=0,
                 image_filename="", output_dir="", save_results=True,
                 generate_caption=True, custom_prompt="", clip=None,
                 unique_id=None):

        node_id = str(unique_id or "")
        if clip is not None:
            model_backend = "ComfyUI TextGenerate"

        custom_prompt = str(custom_prompt or "").strip()
        system_prompt = custom_prompt or (DEFAULT_SYSTEM_PROMPT_WITH_CAPTION if generate_caption else DEFAULT_SYSTEM_PROMPT)

        # 저장 경로는 ComfyUI output 폴더 내부로만 격리한다 (다른 저장 노드들과 동일한 보안 규칙,
        # nodes/image/_image_utils.py의 resolve_target_dir 재사용) — 절대경로/".."는 여기서 차단된다.
        output_dir = str(output_dir or "").strip()
        if output_dir:
            comfy_output_root = folder_paths.get_output_directory()
            output_dir = str(resolve_target_dir(comfy_output_root, output_dir))

        # 데이터셋 폴더 하나에 이미지/캡션/점수 파일을 전부 모은다 (Krea2 TQD 학습 관례).
        score_file = os.path.join(output_dir, "tqd_scores.jsonl") if (save_results and output_dir) else ""
        existing_map = _read_score_map(score_file)

        count = image.shape[0] if hasattr(image, "shape") and len(image.shape) == 4 else 1
        names = [n for n in str(image_filename or "").split("\n") if n.strip()]
        if len(names) != count:
            names = [f"image_{i:03d}" for i in range(count)]

        structure_scores: List[float] = []
        detail_scores: List[float] = []
        reasonings: List[str] = []
        captions: List[str] = []
        jsonl_lines: List[str] = []
        table_rows: List[str] = []
        upserts: Dict[str, Dict[str, Any]] = {}
        n_scored = n_skipped = n_error = 0

        _send_progress({"node_id": node_id, "event": "start", "total": count})

        # 채점이 필요한(=이미 파일에 없는) 이미지 인덱스만 추린다 — LLM 호출/모델 로드 비용 절약.
        pending: List[int] = []
        for i in range(count):
            stem = os.path.splitext(os.path.basename(names[i]))[0]
            if stem in existing_map:
                record = existing_map[stem]
                s = _clamp01(record.get("structure_score")) or 0.0
                d = _clamp01(record.get("detail_score")) or 0.0
                structure_scores.append(s)
                detail_scores.append(d)
                reasonings.append("skipped (already in tqd_scores.jsonl)")
                captions.append("")
                jsonl_lines.append(json.dumps(record, ensure_ascii=False))
                table_rows.append(f"{names[i]:<32} [SKIP]     [SKIP]     already scored")
                n_skipped += 1
                _send_progress({
                    "node_id": node_id, "event": "item", "status": "skipped",
                    "index": i, "total": count, "filename": names[i],
                    "structure_score": s, "detail_score": d, "reasoning": reasonings[-1], "caption": "",
                    "thumbnail": _thumbnail_data_uri(image[i:i + 1]),
                })
            else:
                structure_scores.append(0.0)
                detail_scores.append(0.0)
                reasonings.append("")
                captions.append("")
                jsonl_lines.append("")
                table_rows.append("")
                pending.append(i)

        if pending:
            if model_backend == "ComfyUI TextGenerate":
                if clip is None:
                    if _is_bad_choice(text_encoder_name):
                        raise FileNotFoundError("No model found in models/text_encoders.")
                    clip = _load_clip_from_text_encoder(text_encoder_name, clip_loader_type)
                for i in pending:
                    _check_interrupted()
                    _send_progress({"node_id": node_id, "event": "start_item", "index": i, "total": count, "filename": names[i]})
                    try:
                        raw = str(_generate_with_textgenerate(clip, system_prompt, max_tokens, seed, image=image[i:i + 1])).strip()
                        s, d, caption, reason = self._parse_or_retry(raw, None, None, None, None, system_prompt)
                        # 채점(s/d)과 저장(이미지+캡션+jsonl)을 같은 try 안에서 처리 —
                        # 디스크 오류 등으로 저장이 실패해도 "이미지는 저장됐는데 점수는 없는" 불일치가 남지 않는다.
                        self._record_result(i, names[i], image[i:i + 1], s, d, caption, reason, "comfyui_textgenerate", output_dir if save_results else "",
                                             structure_scores, detail_scores, reasonings, captions, jsonl_lines, table_rows, upserts)
                    except Exception as exc:
                        s = d = None
                        reason = f"ERROR: {exc}"
                        self._record_result(i, names[i], image[i:i + 1], None, None, "", reason, "comfyui_textgenerate", "",
                                             structure_scores, detail_scores, reasonings, captions, jsonl_lines, table_rows, upserts)
                    if s is not None and d is not None:
                        n_scored += 1
                    else:
                        n_error += 1
                    _send_progress({
                        "node_id": node_id, "event": "item", "status": "error" if s is None else "scored",
                        "index": i, "total": count, "filename": names[i],
                        "structure_score": structure_scores[i], "detail_score": detail_scores[i],
                        "reasoning": reasonings[i], "caption": captions[i], "thumbnail": _thumbnail_data_uri(image[i:i + 1]),
                    })
                    if save_results and score_file and upserts:
                        _upsert_score_file(score_file, upserts)
                        upserts = {}
            else:
                from llama_cpp import Llama
                if _is_bad_choice(gguf_model):
                    raise FileNotFoundError("No .gguf model found in models/text_encoders.")
                if chat_handler == "NO_VISION_HANDLERS_AVAILABLE" or not _HANDLER_CLASSES:
                    raise RuntimeError("No vision chat handlers available. Update/install llama-cpp-python.")
                if mmproj_file == MMPROJ_NONE:
                    raise RuntimeError("GGUF Vision mode requires an mmproj file.")
                model_path = _resolve_text_encoder_path(gguf_model)
                mmproj_path = _resolve_text_encoder_path(mmproj_file)
                if not model_path or not os.path.isfile(model_path):
                    raise FileNotFoundError(f"Model not found: {model_path}")
                if not mmproj_path or not os.path.isfile(mmproj_path):
                    raise FileNotFoundError(f"mmproj not found: {mmproj_path}")
                handler_cls, handler_label = self._resolve_handler(chat_handler, gguf_model)

                _free_comfy_vram()
                chat_handler_instance = handler_cls(clip_model_path=mmproj_path, verbose=False)
                llm = Llama(model_path=model_path, chat_handler=chat_handler_instance,
                            n_gpu_layers=int(n_gpu_layers), verbose=False, n_ctx=int(n_ctx),
                            seed=int(seed), logits_all=True)
                try:
                    # 배치 전체를 이 한 번의 로드에서 처리 — 이미지마다 모델을 다시 로드하지 않는다.
                    for i in pending:
                        # 하드 중단은 이미지 사이에서만 가능 — generate() 호출 도중엔 인터럽트 불가(동기 호출).
                        _check_interrupted()
                        _send_progress({"node_id": node_id, "event": "start_item", "index": i, "total": count, "filename": names[i]})
                        try:
                            img_uri = tensor_to_data_uri(image[i:i + 1])
                            s, d, caption, reason = self._parse_or_retry(None, llm, img_uri, max_tokens, temperature, system_prompt)
                            # 채점(s/d)과 저장(이미지+캡션+jsonl)을 같은 try 안에서 처리 —
                            # 디스크 오류 등으로 저장이 실패해도 "이미지는 저장됐는데 점수는 없는" 불일치가 남지 않는다.
                            self._record_result(i, names[i], image[i:i + 1], s, d, caption, reason, gguf_model, output_dir if save_results else "",
                                                 structure_scores, detail_scores, reasonings, captions, jsonl_lines, table_rows, upserts)
                        except Exception as exc:
                            s = d = None
                            caption = ""
                            reason = f"ERROR: {exc}"
                            self._record_result(i, names[i], image[i:i + 1], None, None, "", reason, gguf_model, "",
                                                 structure_scores, detail_scores, reasonings, captions, jsonl_lines, table_rows, upserts)
                        if s is not None and d is not None:
                            n_scored += 1
                        else:
                            n_error += 1
                        _send_progress({
                            "node_id": node_id, "event": "item", "status": "error" if s is None else "scored",
                            "index": i, "total": count, "filename": names[i],
                            "structure_score": structure_scores[i], "detail_score": detail_scores[i],
                            "reasoning": reasonings[i], "caption": captions[i], "thumbnail": _thumbnail_data_uri(image[i:i + 1]),
                        })
                        # 완료된 이미지마다 즉시 upsert — 배치 중간에 중단돼도 이미 채점한 결과는 유실되지 않는다.
                        if save_results and score_file and upserts:
                            _upsert_score_file(score_file, upserts)
                            upserts = {}
                finally:
                    _free_llm(llm)
                    _free_chat_handler(chat_handler_instance)
                    chat_handler_instance = None

        if save_results and score_file and upserts:
            _upsert_score_file(score_file, upserts)

        header = f"=== TQD Score Estimation ({model_backend}) ===\n{'파일명':<32} {'structure':<10} {'detail':<10} 근거\n" + "-" * 62
        footer = f"\n평가 완료: {n_scored} / {count} (스킵 {n_skipped}, 에러 {n_error})"
        preview_text = header + "\n" + "\n".join(table_rows) + footer

        mismatch_warning = ""
        if save_results and output_dir:
            n_images, n_scores = _dataset_consistency_check(output_dir)
            if n_images != n_scores:
                mismatch_warning = (
                    f"\n\n⚠️ 경고: output_dir 이미지 수({n_images})와 tqd_scores.jsonl 항목 수({n_scores})가 "
                    f"다릅니다 — 이 상태로 Krea2 TQD 학습을 시작하면 오류가 납니다. output_dir에 이 노드가 "
                    f"만들지 않은 이미지/점수가 섞여있는지 확인하세요."
                )
                preview_text += mismatch_warning

        _send_progress({
            "node_id": node_id, "event": "done", "total": count, "scored": n_scored, "skipped": n_skipped,
            "error": n_error, "mismatch_warning": mismatch_warning,
        })

        return (structure_scores, detail_scores, reasonings, captions, jsonl_lines, preview_text)

    def _resolve_handler(self, chat_handler_choice, model_file):
        if chat_handler_choice == "Auto-detect":
            mf = str(model_file or "").lower()
            if "qwen" in mf and "Qwen2.5-VL" in _HANDLER_CLASSES:
                return _HANDLER_CLASSES["Qwen2.5-VL"], "Qwen2.5-VL"
            if "moondream" in mf and "Moondream" in _HANDLER_CLASSES:
                return _HANDLER_CLASSES["Moondream"], "Moondream"
            if "minicpm" in mf and "MiniCPM-V 2.6" in _HANDLER_CLASSES:
                return _HANDLER_CLASSES["MiniCPM-V 2.6"], "MiniCPM-V 2.6"
            if "llava" in mf and "LLaVA 1.6" in _HANDLER_CLASSES:
                return _HANDLER_CLASSES["LLaVA 1.6"], "LLaVA 1.6"
            if "LLaVA 1.5" in _HANDLER_CLASSES:
                return _HANDLER_CLASSES["LLaVA 1.5"], "LLaVA 1.5 (fallback)"
            raise RuntimeError("No vision chat handler available.")
        if chat_handler_choice not in _HANDLER_CLASSES:
            raise RuntimeError(f"Chat handler '{chat_handler_choice}' not available. Available: {list(_HANDLER_CLASSES.keys())}")
        return _HANDLER_CLASSES[chat_handler_choice], chat_handler_choice

    def _parse_or_retry(self, textgen_raw, llm, img_uri, max_tokens, temperature, system_prompt) -> Tuple[Optional[float], Optional[float], str, str]:
        """Runs one generation, parses JSON, and retries once with a stricter
        'JSON only' suffix if parsing failed. textgen_raw is used for the
        ComfyUI TextGenerate path (already generated); llm/img_uri drive the
        GGUF path (generation happens here). Returns (structure, detail, caption, reasoning)."""
        for attempt_prompt in (system_prompt, system_prompt + JSON_ONLY_RETRY_SUFFIX):
            if llm is not None:
                output = llm.create_chat_completion(
                    messages=[
                        {"role": "system", "content": attempt_prompt},
                        {"role": "user", "content": [
                            {"type": "image_url", "image_url": {"url": img_uri}},
                            {"type": "text", "text": DEFAULT_USER_PROMPT},
                        ]},
                    ],
                    max_tokens=int(max_tokens), temperature=float(temperature), top_p=0.9, repeat_penalty=1.1,
                )
                raw = output["choices"][0]["message"]["content"].strip()
            else:
                raw = textgen_raw

            parsed = _extract_first_json_object(raw)
            if parsed is not None:
                s = _clamp01(parsed.get("structure_score"))
                d = _clamp01(parsed.get("detail_score"))
                caption = str(parsed.get("caption") or "").strip()
                reason = str(parsed.get("reasoning") or "").strip()
                if s is not None and d is not None:
                    return s, d, caption, reason
            if llm is None:
                # ComfyUI TextGenerate path only generates once (raw was passed in) — no retry generation available.
                break

        raw_preview = str(raw or "")[:120]
        return None, None, "", f"JSON parse failed (raw: {raw_preview!r})"

    def _record_result(self, i, filename, image_slice, s, d, caption, reason, scored_by, output_dir,
                        structure_scores, detail_scores, reasonings, captions, jsonl_lines, table_rows, upserts):
        if s is None or d is None:
            structure_scores[i] = 0.0
            detail_scores[i] = 0.0
            reasonings[i] = reason if reason.startswith("ERROR") or "parse failed" in reason else f"ERROR: {reason}"
            captions[i] = ""
            jsonl_lines[i] = ""
            table_rows[i] = f"{filename:<32} ERROR      ERROR      {reason[:60]}"
            return
        saved_filename = filename
        if output_dir:
            # 파일명이 겹치지만 실제로는 다른 이미지면 자동으로 번호를 붙여 저장한다 —
            # 캡션/점수 레코드도 반드시 실제 저장된 이름을 따라가야 셋이 어긋나지 않는다.
            saved_filename = _save_image_file(output_dir, filename, image_slice)
            if caption:
                _write_caption_file(output_dir, saved_filename, caption)

        stem = os.path.splitext(os.path.basename(saved_filename))[0]
        # 정확히 이 3개 키만 — krea2-trainer가 읽는 표준 형식과 그대로 일치시킨다 (여분 키 없음).
        record = {"image_file": saved_filename, "structure_score": round(s, 3), "detail_score": round(d, 3)}
        structure_scores[i] = s
        detail_scores[i] = d
        reasonings[i] = reason
        captions[i] = caption
        jsonl_lines[i] = json.dumps(record, ensure_ascii=False)
        rename_note = f" (saved as {saved_filename})" if saved_filename != filename else ""
        table_rows[i] = f"{filename:<32} {s:<10.2f} {d:<10.2f} {reason[:60]}{rename_note}"
        upserts[stem] = record
