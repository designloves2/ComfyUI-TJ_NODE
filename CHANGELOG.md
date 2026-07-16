# CHANGELOG

이 프로젝트의 주요 변경 사항을 기록합니다.
(Keep a Changelog 형식 / 날짜: YYYY-MM-DD)
---
## [2.5.0] - 2026-07-16

### [Added]

* `Enhanced KSampler (TJ)` 신규 노드 — 표준 KSampler + 프롬프트 반영 증폭 내장

  * `enhance_arch`: `auto / krea2 / klein / zimage / off` — **하나의 샘플러에서 골라 사용**
  * `auto` 는 모델 클래스로 아키텍처 자동 판별, 미매칭 시 표준 KSampler 로 안전 fallback
  * **Krea2**: MODEL 패치 — `txtfusion.forward` 런타임 교체, 12-tap→24청크 증폭 + 폭주 방지 클램프
  * **Klein**: CONDITIONING 연산 — Qwen3 3-레이어 슬라이스 스케일 + whiten/norm
  * **Z-Image**: CONDITIONING 연산 — 슬라이스 구조가 없어 아키텍처 중립 연산만 적용
  * 고급 노브 노출: `adv_active_scale`, `adv_per_token_whiten`, `adv_norm_equalize`,
    `adv_early/mid/late_layer_scale`(Klein 전용)
  * 출력에 `enhance_info` 추가 (감지/적용 아키텍처·강도 확인용)
  * 신규 CATEGORY: ` ✨ TJ_Node/Sampling`

### [Credits]

* 증폭 로직은 **capitan01R** 의 MIT 라이선스 프로젝트에서 이식했습니다.
  원저작권 고지는 `THIRD_PARTY_LICENSES.md` 및 소스 상단에 명시.

  * [ComfyUI-Krea2T-Enhancer](https://github.com/capitan01R/ComfyUI-Krea2T-Enhancer)
  * [ComfyUI-Flux2Klein-Enhancer](https://github.com/capitan01R/ComfyUI-Flux2Klein-Enhancer)

---
## [2.4.1] - 2026-07-16

### [Added]

* LoRA Analyzer — **아키텍처 불일치 경고** (`check_spec_fit`)

  * 4B/9B 처럼 구조만 다른 변형을 잘못 고르면 초과 블록이 조용히 버려져
    분석이 틀리게 나오던 문제를 방지
  * 예) Klein **9B LoRA 를 4B 노드**에 넣으면 키 64개가 무시됨 → 이제 감지·경고
  * 인식 블록이 0개면 "다른 아키텍처 LoRA일 수 있음" 안내
  * 경고는 노드 UI 상태줄 + `analysis_text` + 콘솔에 표시

---
## [2.4.0] - 2026-07-16

### [Added]

* **LoRA Analyzer 3종 신규 추가** — Krea2 와 동일한 UI/기능

  * `Klein 4B LoRA Analyzer (TJ)` — double 5 + single 20 = **25 블록**
  * `Klein 9B LoRA Analyzer (TJ)` — double 8 + single 24 = **32 블록**
  * `Z-Image LoRA Analyzer (TJ)` — layers **30** (Turbo/Base 공통)
  * 블록 수는 실제 LoRA 파일들로 교차 검증한 값
  * 카테고리: ` ✨ TJ_Node/Lora Analyzer`

### [Changed]

* LoRA Analyzer 공용 코어로 리팩터링 (중복 제거)

  * `nodes/lora/_lora_core.py` — 키 형식 무관 파서 + 효과 노름 + `BlockSpec`
  * `nodes/lora/_analyzer_base.py` — 노드 베이스 (ARCH 만 지정하면 동작)
  * Krea2 노드도 동일 코어 사용 (동작 동일)
* 지원 키 형식 확장: dot 표준 / kohya(`lora_down/up`) / **diffusers(`.lora.down.weight`)**
  / LoKr(`lokr_w1/w2`) / 단축형(`.A/.B`)
* Klein diffusers 네이밍(`transformer.transformer_blocks`,
  `transformer.single_transformer_blocks`) 별칭 자동 인식
* API 라우트 일반화: `/krea2analyzer/*` → `/tjlora/analyze`, `/tjlora/save_filtered`,
  `/tjlora/structure` (arch 파라미터)
* 프론트엔드 단일화: `web/krea2_analyzer.js` → `web/tj_lora_analyzer.js`
  (블록 수/섹션을 아키텍처별로 동적 렌더링, 섹션 토글 버튼 자동 생성)

### [Fixed]

* `use_original` 토글 라벨 i18n 적용 (하드코딩 한글 → 언어별 자동 전환)

---
## [2.3.7] - 2026-07-16

### [Added]

* `Krea2 LoRA Analyzer (TJ)` — `use_original` 토글 추가 (A/B 비교용)

  * 체크 시 내 블록 설정(config)은 UI에 **그대로 유지**하되, 큐 실행은
    필터 무시하고 **원본 LoRA(전체 ON·강도 1.0)**로 돌림
  * 원본 vs 내 조정본을 설정 손실 없이 즉시 오가며 비교 가능
  * 분석 텍스트에 현재 Mode(ORIGINAL/FILTERED) 표시

---
## [2.3.6] - 2026-07-16

### [Changed]

* `Krea2 LoRA Analyzer (TJ)` — impact 계산을 실제 효과 크기로 개선

  * 기존 `‖down‖·‖up‖`(상한)은 블록 간 차이가 뭉개져 40~60%로 평평하게 나옴
  * 실제 델타 `‖up @ down‖_F × (alpha/rank)` 로 변경 → 블록별 기여도가 또렷하게 분산
  * rank 공간 계산(`trace((uᵀu)(d dᵀ))`)이라 대형 mlp 도 빠름, kohya `alpha` 반영

---
## [2.3.5] - 2026-07-16

### [Changed]

* `Krea2 LoRA Analyzer (TJ)` — LoRA 키 형식 무관 분석/필터 지원

  * 기존엔 `diffusion_model.blocks.{N}....lora_A/B.weight`(dot) 한 형식만
    인식 → musubi-tuner 등에서 다른 옵션으로 학습하면 분석 0으로 실패
  * 이제 형식 자동 인식: **kohya**(`lora_unet_blocks_{N}_...lora_down/up`),
    **LoKr**(`lokr_w1/w2`), **단축형**(`.A/.B`), **dot 표준** 모두 지원
  * 블록 인덱스는 `blocks`/`layerwise_blocks`/`refiner_blocks` 를 `.`/`_`
    구분자 모두 허용하는 정규식으로 추출 (레이어 필터/부분 학습본도 정상)
  * `build_filtered_lora` 도 동일하게 형식 무관 처리 (down 쪽만 강도 스케일)

---
## [2.3.4] - 2026-07-16

### [Security]

* `Save & Preview Video (TJ)` read-side arbitrary file read 차단
  (ComfyUI-Manager 리뷰 지적사항)

  * `_tj_resolve_media_path()` 상대경로 분기가 `..` 를 거부하지 않아
    `../../../../etc/passwd` 등이 input/output/temp 루트 밖으로 빠져나가
    외부 파일로 인식 → temp 로 복사·노출되던 문제 수정
  * `..` 세그먼트 및 루트 밖 절대경로 거부, 최종 경로를
    `realpath` + `commonpath` 로 input/output/temp 내부인지 검증
  * `any_type` `video` 입력을 신뢰 불가 STRING 으로 취급

---
## [2.3.0] - 2026-07-14

### [Added]

* `Krea2 LoRA Analyzer (TJ)` 신규 노드 추가

  * Krea2 LoRA(`.safetensors`)를 32개 블록 단위로 분석 (Main 28 + TxtFusion Layerwise 2 + Refiner 2)
  * 블록별 기여도(impact) 시각화 — 임팩트 바 + 색상(파랑→빨강)
  * 블록별 ON/OFF + strength 조절 후 필터링된 LoRA 저장
  * 프리셋 저장/불러오기/삭제 (localStorage)
  * `🔍 Analyze` 버튼 — 워크플로우 실행 없이 API 직접 분석
  * 블록별 강도: 숫자 + 슬라이더 + `‹`/`›` 0.05 미세조정 + `⟲` 개별 리셋 (동기화)
  * Main/TxtF 토글 버튼, 최소 노드 폭 강제, TJ 브랜드 테마
  * 신규 CATEGORY: ` ✨ TJ_Node/Lora Analyzer`
  * 독립 파일 구조:

    * `nodes/lora/krea2_lora_analyzer.py`
    * `nodes/lora/__init__.py` (전용 API 라우트)
    * `web/krea2_analyzer.js`
  * **아이디어 출처(감사):** 블록 단위 LoRA 분석·필터링 아이디어는
    [comfyUI-Realtime-Lora](https://github.com/shootthesound/comfyUI-Realtime-Lora)
    에서 영감을 받음. **코드 미카피** — Krea2 LoRA 파일을 직접 분석해 처음부터 구현. 🙏

* `Universal Calculator (TJ)` 신규 노드 추가

  * 해상도(비율/메가픽셀) + 시간/프레임 통합 계산기
  * `0 = 빈칸(자동)` 규칙 — 원하는 칸만 입력하면 나머지 자동 계산
  * 비율 정수 표시(GCD 약분, 예: `2:3`) + 실시간 요약 패널
  * CATEGORY: ` ✨ TJ_Node/Utility`

### [Changed]

* `Prompt Enhancer (TJ)` / `Prompt Studio (TJ)`

  * Qwen3.5 계열의 "Thinking Process" 노출 대응 — assistant prefill로 non-thinking 출력 유도
  * `_strip_thinking_process_block()` 후처리 추가

### [Security]

* `Krea2 LoRA Analyzer` save 라우트 하드닝

  * 클라이언트 `save_path`를 loras 폴더 하위로 샌드박스 (commonpath 검증)
  * path traversal / 절대경로 / 타 드라이브 차단, `.safetensors` 확장자 강제

---
## [2.0.2] - 2026-06-11

### [Added]

* `Prompt Studio (TJ)`에 독립 입력 구조 추가

  * `get_name_prompt`

    * `raw_prompt_input` 전용 fake-wire 연결
  * `get_name_image`

    * `image` 전용 fake-wire 연결
  * 이미지 입력과 프롬프트 입력을 완전히 분리하여 사용 가능

### [Changed]

* `Prompt Studio (TJ)`

  * Prompt Enhancer / Image to Prompt 통합 구조 개선
  * 모드별 입력 처리 로직 분리
  * Prompt 입력과 Image 입력이 동시에 연결되어 있어도 각 모드는 자신의 입력만 사용하도록 변경

* `Z-Image Turbo (TJ)`

  * embedded get 연결 대상 수정
  * `get_name`이 `image` 입력 슬롯에만 연결되도록 변경
  * `global_prompt_input`은 STRING 입력으로 유지

### [Removed]

* `tj_cover_autoset_bridge.js` 제거

  * Cover AutoSet 우회 구조 제거
  * Native AutoSet Core 방식으로 통일

### [Fixed]

* `Save & Preview Image (TJ)`

  * dynamic get_name 검증 문제 수정
  * provider 값이 `(none)`으로 강제 리셋되며 발생하던 실행 오류 수정

* `Save & Preview Video (TJ)`

  * Video Preview 리사이즈 동기화 문제 수정
  * 노드 크기 변경 후 Preview 영역이 고정되던 문제 수정

* `Batch to Multi Image Output (TJ)`

  * embedded get_name provider reconnect 안정성 개선
  * provider scan 타이밍 문제로 인한 `(none)` 리셋 가능성 제거

* `Prompt Studio (TJ)`

  * seed 위젯 `control_after_generate` 지원 추가
  * ComfyUI Seed 증분 동작 정상화

* `Prompt Enhancer (TJ)`

  * seed 위젯 `control_after_generate` 지원 추가
  * Seed 증가 동작 정상화

* `Image to Prompt (TJ)`

  * seed 위젯 `control_after_generate` 지원 추가
  * Seed 증가 동작 정상화

* `utility_node_tj.js`

  * 구버전 embedded get receiver 로직 정리
  * provider scan 지연 시 `(none)` 강제 리셋 방지

* 전체 Fake-Wire Lifecycle

  * provider scan 실패를 provider 삭제로 판단하지 않도록 개선
  * reload-safe reconnect 안정성 향상
  * embedded get 노드들의 provider 유지 로직 통일

---

## [2.0.1] - 2026-06-11

### [Added]

* `Prompt Studio (TJ)` 신규 추가

  * `Auto / Prompt Enhancer / Image to Prompt` 모드 지원
  * 이미지 입력 자동 감지 기반 모드 전환
  * Prompt Enhancer / Image to Prompt UI 통합
  * 독립 파일 구조:

    * `tj_prompt_studio.py`
    * `web/tj_prompt_studio.js`

* `Prompt Show & Locker (TJ)` 추가

  * STRING 전용 Prompt 표시 노드
  * Show Any 스타일 Copy 버튼 기능 추가
  * Copy → Copied(0.8초) → Copy 복귀 애니메이션 지원
  * PAUSED 상태 전용 상태 메시지 UI 추가

* Rebels 기반 LLM 노드 TJ 리빌드

  * `Image to Prompt (TJ)`
  * `Prompt Enhancer (TJ)`
  * `Prompt Show & Locker (TJ)`

* LLM 공통 CATEGORY 추가

  * ` ✨ TJ_Node/LLM`

* TJ 테마 공통 적용

  * 배경색: `#000000`
  * 테마 컬러: `#7612DA`
  * 타이틀 텍스트: `#FFFFFF`

* `Time Segment List (TJ)` TJ Utility 카테고리 등록

  * CATEGORY:

    * ` ✨ TJ_Node/Utility`
  * TJ 컬러 테마 적용

### [Changed]

* `Image to Prompt (TJ)`

  * GGUF / llama.cpp backend 지원
  * ComfyUI TextGenerate backend 지원
  * `models/text_encoders` 경로 기반 모델 로딩 방식 적용
  * `mmproj_file` optional 지원 (`none` 가능)
  * `chat_handler` 기존 llama_cpp import 방식 유지
  * Advanced 설정 숨김/펼침 기능 추가
  * Advanced hide 시 노드 하단 여백 자동 축소
  * CLIP 연결 시 TextGenerate 모드 자동 전환 구조 적용

* `Prompt Enhancer (TJ)`

  * GGUF / llama.cpp backend 지원
  * ComfyUI TextGenerate backend 지원
  * `models/text_encoders` 기반 모델 로딩 구조 변경
  * `mmproj_file` 위젯 추가
  * Advanced 설정 숨김/펼침 기능 추가
  * CLIP 연결 시 TextGenerate 모드 자동 전환 구조 적용

* `Prompt Studio (TJ)`

  * Prompt Enhancer 모드:

    * 사용자 세로 크기 기억 및 복원
  * Image to Prompt 모드:

    * 기존 자동 높이 리셋 유지
  * 가로 크기 공통 유지 구조 적용

* `Prompt Show & Locker (TJ)`

  * 결과값 업데이트 시 사용자 노드 높이 유지
  * 초기 기본 노드 크기 유지
  * PAUSED 상태 메시지 자동 줄바꿈 적용
  * PAUSED 상태 메시지 TJ 보라색 컬러 적용

### [Removed]

* `tj_cover_autoset_bridge.js` 의존 제거
* LLM 노드 AutoSet 구조 제거

  * `auto_set`
  * `properties.auto_sets`
  * `syncGetNodesForAutoSets()`
* LLM 노드 AutoSet provider 등록 제거

  * 일반 `set_name / get_name` fake-wire 방식으로 변경

### [Fixed]

* `Show Any (TJ)` fake-wire reconnect 문제 수정

  * workflow reload 후 get_name 유지
  * provider scan 실패 시 `(none)` 강제 리셋 방지
  * fake-wire provider survival 개선

* `Scene Maker (TJ)` / `Z-Image Turbo (TJ)`

  * Cover AutoSet provider survival 문제 수정
  * provider cleanup 시 fake-wire 끊김 문제 수정
  * Multi Image Loader 방식 reconnect lifecycle 구조 적용

* `Image to Prompt (TJ)`

  * 메뉴 미등록 문제 수정
  * `VISION_TASK_OPTIONS` 참조 오류 수정

* `Prompt Show & Locker (TJ)`

  * PAUSED 상태에서 빈 데이터 downstream 출력 문제 수정
  * 큐 중단 UX 개선

* `Prompt Studio (TJ)`

  * 메뉴 등록 문제 수정
  * JS mode switching 구조 안정화
  * resize lifecycle 안정화

* `Time Segment List (TJ)`

  * JS 테마 누락 수정

---

## [2.0.0] - 2026-06-10

### [Added]

* TJ_NODE V2.0 개발 시작
* fake-wire 기반 wireless workflow 구조 확장
* Cover node rebuild 시스템 구축
* embedded get_name 구조 확장
* reload-safe reconnect lifecycle 구조 정리

### [Changed]

* `Scene Maker (TJ)` 리빌드
* `Z-Image Turbo (TJ)` 리빌드
* fake-wire provider lifecycle 구조 재정비

### [Fixed]

* workflow reload 시 get_name `(none)` 리셋 문제 수정
* provider cleanup 시 fake-wire 삭제 문제 수정
* reconnect lifecycle 안정화


# [2.0.0] - 2026-06-10

## [Added]

### TJ Cover System

* 외부 노드를 TJ_NODE 스타일로 확장 가능한 Cover 구조 추가
* 기존 노드를 직접 수정하지 않고:

  * Embedded Get/Set
  * Auto Set
  * TJ Theme
  * Widget Reorder
  * Output Label Sync
    적용 가능 구조 추가

### Smart Converter (TJ)

* 신규 Smart Converter (TJ) 노드 추가
* Any Type 입력 지원
* 출력 타입:

  * INT
  * FLOAT
  * STRING
  * TENSOR
* 문자열 숫자 자동 변환 지원
* dict/list/object 문자열 변환 지원
* 잘못된 타입 연결 방지 구조 추가
* TJ Set/Get 임베드 기능 추가
* 원하는 출력 타입 기준 auto set 지원

### Scene Maker (TJ)

* Keyframe Maker 기반 Scene Maker (TJ) 추가
* Embedded Get/Set 지원
* Auto Set ON/OFF 지원
* Translate 기능 추가
* 지원 언어:

  * KO
  * EN
  * JP
  * CN
* Clip 입력 override 기능 추가
* 버튼:

  * Refresh guide / summary
  * reuse brief as override(generated)
  * reuse Visual Beat as override(generated)

### Z-Image Turbo (TJ)

* Embedded Get/Set 지원
* Auto Set ON/OFF 지원
* Global Prompt Input 추가
* Positive Prompt Hide 기능 추가
* Negative Prompt Hide 기능 추가
* Textarea 사용자 리사이즈 지원
* 이미지 사이즈 표시 복구:

  * 자동:

    * width x height (ratio : mega size)
  * manual:

    * width x height (custom size)

### LTX2 TJ Sampler

* LTX2.3 Compact AV Sampler 기반 TJ 버전 추가
* 노드명:

  * LTX2. TJ Sampler
* Hide advanced settings 제거
* 모든 위젯 기본 표시
* Sigma 입력 시 기존 sigma widget hide 유지

### Preview / UI System

* Z-Image Turbo 초기 compact preview 사이즈 시스템 추가
* Preview visibility 제어 실험 구조 추가
* Preview draw 분리 파이프라인 연구 시작
* Separate preview rendering 구조 연구
* computeSize 기반 preview 영향 분석

---

## [Changed]

### TJ_NODE 공통 시스템

* CATEGORY 표기 통일:

  * " ✨ TJ_Node/Utility"
* TJ 컬러 시스템 공통 적용:

  * bgcolor: #000000
  * color: #7612DA
  * title_text: #FFFFFF

### Scene Maker (TJ)

* get_name 위젯 최상단 이동
* 위젯 레이아웃 전체 재정렬:

  * auto set
  * mode
  * translate
  * shot_count
  * seed
  * control after generate
  * text fields
  * buttons
* Placeholder 문구 수정:

  * product_brief_override → brief_override
  * shot_beats_override → Visual Beat_override

### Z-Image Turbo (TJ)

* widget 레이아웃 재배치
* batch size 위치 변경
* add lora 버튼 TJ 스타일 적용
* remove lora 버튼 red 스타일 적용
* preview 구조 수정 시도:

  * center-fit 구조 연구
  * node-size-independent preview 구조 연구
  * compact initial height 구조 적용
  * preview ON/OFF 구조 연구
  * node.imgs / node.images intercept 구조 연구
  * Save & Preview Image 방식 preview 비교 분석

### Auto Set System

* Auto Set 활성 시:

  * output name ▶ 표시 구조 추가
* OFF 시:

  * ▶ 제거

### Get / Set System

* Cover 노드에서도 TJ Set/Get 연결 가능 구조 추가
* get_name 리스트 연결 안정화 보강

### Preview Rendering

* Save & Preview Image (TJ) 스타일의 contain-center preview 구조 분석
* ComfyUI 기본 preview 구조 분석
* LiteGraph computeSize 영향 분석
* node.imgs / node.images 기반 preview resize 구조 분석

---

## [Removed]

### Z-Image Turbo (TJ)

* Preview ON/OFF widget 제거
* Experimental separated preview pipeline 롤백
* 강제 custom preview draw 구조 제거

### LTX2 TJ Sampler

* hide advanced settings 기능 제거

---

## [Fixed]

### Smart Converter (TJ)

* 타입 변경 후 출력 중단 문제 수정
* UI 잘림 문제 수정
* Status 영역 충돌 문제 수정
* output reconnect 문제 수정

### Scene Maker (TJ)

* auto set 동작 수정
* get_name 연결 오류 수정
* unexpected keyword argument 'Input image' 오류 수정
* 버튼 동작 복구:

  * reuse brief
  * reuse visual beat
  * refresh summary
* generated brief / beat 저장 구조 수정

### Z-Image Turbo (TJ)

* auto set 동작 수정
* default model/clip/vae 값 적용 구조 수정
* 초기 compact size 적용
* textarea width sync 수정
* hide 영역 resize 유지 구조 수정
* 이미지 사이즈 표시 위치 수정
* preview 초기 로드 높이 수정 시도
* preview width scaling 문제 분석
* preview computeSize 충돌 분석
* preview separate pipeline 충돌 분석
* preview node-size binding 분석
* preview center-fit draw 방식 분석

### Show Any (TJ)

* copy 버튼 위치 고정 버그 수정
* get_name disconnect 문제 수정

### Batch To Multi Output (TJ)

* auto_set 기본값 OFF 수정
* dynamic output refresh 안정화

### Embedded Get / Set

* none 상태 오류 수정:

  * get_name: 'TJ / BATCH' not in ['(none)']
* Cover 노드 auto registration 보강
* output arrow 표시 구조 보강

### General

* JS preview pipeline 충돌 분석
* ComfyUI default preview computeSize 영향 분석
* Separate preview rendering 구조 분석
* Save & Preview Image (TJ) preview 구조 비교 분석
* Preview resize loop 원인 분석

---

# [1.0.4] - 2026-06-09

## [Added]

### TJ VHS Hotkey Remote

* VHS 노드용 단축키 리모트 기능 추가
* 지원 기능:

  * play
  * mute
  * pause
  * sync preview
* 노드 선택 기반 단축키 제어 구조 추가

### Prompt Text (TJ)

* Copy All 버튼 추가
* Paste 버튼 추가
* Clear 버튼 추가
* 버튼 피드백 상태 표시 추가:

  * Copied
  * Pasted
  * Cleaned

### Batch To Multi Output (TJ)

* auto_set 기능 추가
* dynamic output count 지원

---

## [Changed]

### Prompt Text (TJ)

* 버튼 row 구조 변경
* DOM widget computeSize 구조 수정
* 노드 무한 세로 증가 문제 수정 시도

### Show Any (TJ)

* textarea resize 구조 수정
* copy 버튼 위치 동기화 수정
* compact layout 개선

### Utility Nodes

* UI spacing 구조 수정
* widget resize sync 보강

---

## [Fixed]

### Prompt Text (TJ)

* DOM widget height loop 수정
* node resize recursion 수정
* copy/paste button redraw 문제 수정

### Show Any (TJ)

* copy 버튼 위치 고정 버그 수정
* node resize 이후 버튼 위치 mismatch 수정

### Batch To Multi Output (TJ)

* auto_set 동작 오류 수정
* output refresh 충돌 수정

---

# [1.0.3] - 2026-06-08

## [Added]

### Eclipse Compatibility

* Eclipse SetNode 브리지 구조 추가
* TJ GetNode에서 Eclipse SetNode 수신 지원
* Eclipse / TJ 그룹 분리 표시 추가

### Realtime Wire System

* realtime hover wire 표시 기능 추가
* Realtime Wires View Mode ON/OFF 추가

### Dynamic Image Batch

* Eclipse save suffix 구조 추가

---

## [Changed]

### Set / Get System

* Disconnect Links 처리 방식 수정
* 자동 재연결 구조 개선
* provider lifecycle 개선

### Dynamic Image Batch

* scale method UI 정리
* image stack resize 구조 변경

---

## [Fixed]

### Eclipse SetNode

* 입력선 제거 시 리스트 사라짐 수정
* 삭제 후 ghost provider 남는 문제 수정
* reconnect 시 rebinding 실패 수정

### GetNode

* get_name 표시 오류 수정
* embedded get provider refresh 안정화

### Save & Preview Image (TJ)

* 좌측 키 입력 문제 수정
* ESC / 우측키 동작 안정화

---

# [1.0.2] - 2026-06-07

## [Added]

### Save & Preview Video (TJ)

* audio A/B preview 구조 추가
* video total frame output 추가

### Smart Show / Show Any

* audio preview 지원 추가

---

## [Changed]

### Video Preview

* original audio / A+B preview 구조 개선
* preview audio sync 구조 수정

---

## [Fixed]

### Save & Preview Video (TJ)

* video+audio mode 무음 문제 수정
* preview/save audio routing 수정

### Show Any (TJ)

* output redraw 문제 수정
* get_name restore 안정화

---

# [1.0.1] - 2026-06-06

## [Added]

### Multi Router (TJ)

* Auto Set 시스템 추가

### Dynamic Image Batch (TJ)

* save_path_opt 보안 패치 적용
* path traversal 방지 구조 추가

### Documentation

* README 보강
* Civitai.red 업로드 설명 추가
* GitHub README 스크린샷 가이드 추가

### TJ Shortcut Launcher (TJ) 신규 노드 추가
* 로컬 폴더 / URL 바로가기 버튼 기능 추가
* 설정 팝업 기반 Shortcut 관리 UI 추가
* 버튼 Description / Tooltip 지원
* JSON Export / Import 기능 추가
* 버튼 컬러 커스터마이징 기능 추가
* 텍스트 컬러 커스터마이징 기능 추가
* Color Picker UI 추가
* 버튼 순서 변경(▲ ▼) 기능 추가
* Save 저장 피드백(Saved!!) 애니메이션 추가

---

## [Changed]

### Set / Get

* Refresh ALL Get Nodes 기능 강화
* provider lifecycle 처리 개선

### UI Theme

* TJ_NODE 공통 컬러 적용 범위 확대

### TJ Shortcut Launcher (TJ)

* Add Images 스타일 기반 플랫 블루 버튼 디자인 적용
* 메인 버튼 UI 사이버틱 네온 스타일 개선
* Settings 버튼 디자인 통일
* 숫자 배지 좌측 정렬 및 원형 인디케이터 복구
* 버튼 이름 중앙 정렬 구조 적용
* 세로 높이만 자동 조절되도록 리사이즈 구조 변경
* 가로 크기 사용자 수동 조절 유지
* Save 동작을 저장 전용으로 변경 (자동 Close 제거)
* Close 버튼을 하단 중앙 구조로 변경
* Cancel 버튼 제거
* 설정 팝업 스크롤 구조 개선
* Settings 버튼 외곽선 컬러를 메인 버튼 border 컬러와 동일하게 변경

---
## [Removed]

### TJ Shortcut Launcher (TJ)

* tkinter 기반 Browse 기능 제거
* 버튼/텍스트 과도한 shadow 효과 제거
* Settings 버튼 고정 블루 외곽선 제거
---
## [Fixed]

### Dynamic Image Batch (TJ)

* 노드 높이 무한 증가 수정
* image stack resize 문제 수정

### SetNode

* 복사 시 이름 증가 구조 수정

### GetNode

* disconnect 후 none 상태 처리 수정

### TJ Shortcut Launcher (TJ)

* Settings 버튼 클릭 미동작 문제 수정
* 버튼 hover shadow offset 문제 수정
* 텍스트 이중 그림자 출력 문제 수정
* 노드 가로 축소 불가 문제 수정
* 버튼 개수 증가 시 설정창 스크롤 불가 문제 수정
* Settings 버튼 컬러 적용 누락 문제 수정
* textColor 변경 시 Settings border 컬러가 함께 변경되던 문제 수정
* Color Picker ZIP 생성 및 다운로드 링크 오류 수정

---

# [1.0.0] - 2026-06-05

## [Added]

### Initial TJ_NODE Release

* Dynamic Image Batch (TJ)
* Multi Image Loader (TJ)
* Multi Router (TJ)
* Set Node (TJ)
* Get Node (TJ)
* Multi Get Node (TJ)
* Save & Preview Image (TJ)
* Save & Preview Video (TJ)
* Prompt Text (TJ)
* Show Any (TJ)

### Core TJ_NODE System

* Embedded Get/Set 시스템
* Transparent Fake Wire 시스템
* Auto Set 시스템
* Refresh ALL Get Nodes
* Provider Lifecycle 관리
* Embedded Get Receiver 시스템

### UI / UX

* TJ_NODE 공통 컬러 시스템
* TJ_NODE CATEGORY 구조
* compact widget 구조
* dynamic output 구조
* realtime hover wire 구조

### Save & Preview

* keyboard navigation:

  * LEFT
  * RIGHT
  * ESC
* image overlay preview 구조 추가

### Show Any (TJ)

* any type 출력 미리보기 지원
* text / object / audio preview 지원

---

## [Changed]

### Set / Get Architecture

* TJ virtual wire 구조 적용
* physical auto connect 제거

### Embedded Get System

* refresh 구조 개선
* rebinding 구조 추가

---

## [Fixed]

### Get / Set

* provider ghost cleanup 수정
* reconnect refresh 안정화

### Save & Preview

* overlay resize 문제 수정
* preview redraw 안정화

### Show Any

* compact resize 구조 수정
* textarea sync 수정

---

## [0.6] - 2026-06-05

### [Added]

* VHS(VideoHelperSuite) Preview Hotkey Remote 기능 추가
* 선택된 VHS 노드의 preview를 키보드 단축키로 직접 제어하는 기능 추가
* `Space` 단독 입력으로 Play / Pause 제어 기능 추가
* `Alt + M` 으로 Mute / Unmute 기능 추가
* `Alt + H` 으로 Preview Hide / Show 기능 추가
* `Alt + O` 으로 Preview Open 기능 추가
* `Alt + S` 으로 Preview Save 기능 추가
* `Alt + C` 으로 Output Full Path 복사 기능 추가
* `Alt + Y` 으로 VHS Sync Preview 기능 추가
* `TJ_VHS_Hotkey_Remote.js` 독립 확장 파일 추가
* VHS 원본 수정 없이 외부 확장 방식으로 동작하는 구조 추가

### [Changed]

* VHS Preview 제어 방식을 우클릭 컨텍스트 메뉴 기반에서 단축키 기반 제어 방식으로 확장
* 선택된 VHS 노드만 반응하도록 입력 처리 구조 변경
* 텍스트 입력 중에는 단축키가 동작하지 않도록 이벤트 처리 방식 개선
* Pause 기능을 영상 편집 스타일 UX에 맞춰 `Space` 중심 구조로 변경

### [Fixed]

* VHS Preview 제어를 위해 매번 컨텍스트 메뉴를 열어야 하는 불편 문제 개선
* Space 키 반복 입력 시 Pause/Resume 연속 토글되는 문제 방지
* Preview Hide / Show 후 노드 높이 갱신 문제 수정
* 초기 버전에서 누락되었던 `Sync Preview` 기능 추가

---

# [0.5] - 2026-06-05

## [Added]

* MultiGet persistent slot architecture 추가
* slot entity 기반 lifecycle 추가
* Remove Slot 시스템 추가
* Compact Empty Slots 기능 추가
* Remove Last Slot 기능 추가
* slot persistence 구조 추가
* slot empty state 구조 추가
* slot context menu 시스템 추가
* TJ Node slot management menu 추가
* slot rename 구조 추가
* slot disconnect 구조 추가
* slot UUID 기반 reconnect 구조 추가

## [Changed]

* MultiGet 구조를 provider index 기반에서 persistent slot entity 기반으로 변경
* provider delete 처리 구조 변경
* provider rename 처리 구조 변경
* slot reorder 구조 개선
* slot remove 구조 개선
* MultiGet rebuild 구조 개선
* fake-wire reconnect 구조 개선

## [Fixed]

* MultiGet slot shift corruption 문제 수정
* provider 삭제 시 output 밀림 문제 수정
* provider rename 시 reconnect 끊김 문제 수정
* Compact Empty Slots 미동작 문제 수정
* Remove Last Slot 미동작 문제 수정
* slot remove 후 widget reorder 문제 수정
* slot remove 후 output reorder 문제 수정
* slot dot native menu callback 문제 우회 수정
* Smart Show embedded get 누락 문제 수정
* Smart Show AUDIO unsupported dict 문제 수정
* utility import failed 문제 수정
* preview reload restore 문제 수정

---

# [0.4] - 2026-06-04

## [Added]

* TJ_NODE 공식 문서 구조 추가
* Workflow Architecture 문서 추가
* Troubleshooting 문서 추가
* HTML5 UI System 문서 추가
* Save Pipeline 문서 추가
* Production Workflow Guide 추가
* Reload-safe workflow guide 추가
* TJ_NODE 개발 레퍼런스 문서 추가
* CATEGORY / node color 개발 규칙 문서 추가
* node style 통일 규칙 추가
* patch naming 규칙 추가
* V1.0 backup branch 규칙 추가

## [Changed]

* TJ workflow philosophy 문서화
* fake-wire internal 구조 문서화
* embedded get lifecycle 문서화
* provider registry 구조 문서화
* preview lifecycle 구조 문서화
* save pipeline architecture 문서화
* workflow section architecture 문서화

## [Fixed]

* embedded get 누락 문제 수정
* Save & Preview Image fullscreen 기능 누락 수정
* keyboard control 누락 수정
* preview grid 로직 누락 수정
* Smart Show preview restore 누락 수정
* Save & Preview Video embedded get reconnect 수정
* Smart Show AUDIO detect 문제 수정
* utility_node_tj.js restore 누락 수정
* preview startup size 문제 수정
* node resize 강제 변경 문제 수정

---

# [0.3] - 2026-06-03

## [Added]

* VHS Hotkey Remote 기능 추가
* preview/video keyboard shortcut 시스템 추가
* Save & Preview Video HTML5 video player 구조 추가
* audio controller UI 추가
* audio only mode 추가
* video decode → IMAGE batch 구조 추가
* Smart Show edit_mode 시스템 추가
* Smart Show copy button 추가
* Smart Show compact layout 추가
* Smart Show monospace text UI 추가
* Show ALL Wires 기본 구조 개선
* Realtime Wires View Mode 토글 구조 개선

## [Changed]

* Save & Preview Video viewer 구조를 전용 viewer 파일로 분리
* utility_node_tj.js 구조 분리
* Save & Preview Image preview grid 구조 개선
* Smart Show preview restore 구조 개선
* Save & Preview Video reload restore 구조 개선
* image/video mutex 구조 개선
* audio routing 구조 개선

## [Fixed]

* Save & Preview Video audio monitor 문제 수정
* A/B audio playback 문제 수정
* Save & Preview Video fake-wire reconnect 문제 수정
* preview reload 후 결과 유실 문제 수정
* Smart Show edit_mode 초기값 문제 수정
* fullscreen overlay close 충돌 문제 수정
* preview snapshot detach 문제 수정
* Save & Preview Video image input disconnect 문제 수정
* preview tab 이동 후 restore 실패 문제 수정
* Smart Show unsupported dict AUDIO 처리 문제 수정

---

# [0.2] - 2026-06-02

## [Added]

* Eclipse provider bridge 구조 추가
* TJ / Eclipse provider 구분 리스트 추가
* MultiGet provider grouping UI 추가
* Save Image(Eclipse Suffix-TJ) 추가
* Smart Converter(TJ) 초기 구조 추가
* Show Any(TJ) 초기 구조 추가
* Prompt Text embedded get 기능 추가
* Save & Preview Image embedded get 기능 추가
* Save & Preview Video embedded get 기능 추가
* Smart Show embedded get 기능 추가
* Smart Show universal preview 구조 추가
* Smart Show AUDIO / VIDEO / JSON preview 지원 추가
* Save & Preview Image fullscreen viewer 추가
* keyboard control 시스템 추가
* Smart grid preview 시스템 추가
* snapshot preview copy 시스템 추가
* preview reload restore 시스템 추가

## [Changed]

* MultiGet provider lifecycle 구조 개선
* embedded get UI를 전체 노드에서 통일
* Smart Show preview renderer 구조 개선
* fullscreen overlay 구조 개선
* preview fit-center 구조 개선
* node resize 구조 개선
* provider cleanup 구조 개선
* save filename alias 구조 개선

## [Fixed]

* embedded get provider none 처리 문제 수정
* Eclipse provider reconnect 문제 수정
* fake-wire transparent 표시 문제 수정
* fullscreen close 버튼 충돌 문제 수정
* preview overlay pointer conflict 수정
* Smart Show 하단 여백 증가 문제 수정
* Save & Preview Image resize jump 문제 수정
* preview reload 시 이미지 유실 문제 수정
* embedded get reconnect 불안정 문제 수정
* Save & Preview Image 좌측 키 이동 문제 수정

---

# [0.1] - 2026-06-01

## [Added]

* TJ fake-wire 기반 Wireless Routing System 추가
* Set Node (TJ) / Get Node (TJ) / Multi Get Node (TJ) 초기 구현
* transparent wire 시스템 추가
* Realtime Wires View Mode 기능 추가
* Show ALL Wires 디버그 모드 추가
* embedded get 시스템 초기 구현
* Auto Set 시스템 추가
* Multi Router(TJ) 추가
* Dynamic Image Batch(TJ) 추가
* Dynamic Image Batch(Eclipse-TJ) 추가
* Batch to Multi Image Output(TJ) 추가
* Save & Preview Image (TJ) 추가
* Prompt Text (TJ) 추가
* Smart Show (TJ) 추가
* Text Concatenate (TJ) 추가
* Save & Preview Video (TJ) 추가
* TJ_NODE 공통 노드 컬러 시스템 추가
* CATEGORY = " ✨ TJ Node/..." 구조 추가
* Eclipse SetNode compatibility 초기 지원
* Refresh ALL Get Nodes 기능 추가

## [Changed]

* workflow 구조를 visible wire 기반에서 wireless architecture 구조로 변경
* Set/Get 연결 구조를 fake-wire 기반으로 변경
* Preview 노드를 HTML5 overlay 기반으로 변경
* Save 구조를 Save Pipeline 구조로 변경
* provider registry 구조 개선
* preview snapshot 구조 개선

## [Fixed]

* Get provider reconnect 문제 수정
* fake-wire hover 표시 문제 수정
* workflow reload 후 provider reconnect 문제 수정
* embedded get reconnect 문제 수정
* preview overlay 충돌 문제 수정
* Multi Router Auto Set 연결 문제 수정
