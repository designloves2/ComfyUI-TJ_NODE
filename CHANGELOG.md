# CHANGELOG

이 프로젝트의 주요 변경 사항을 기록합니다.
(Keep a Changelog 형식 / 날짜: YYYY-MM-DD)
---
## [2.9.2] - 2026-07-23

### [Fixed]

* **`/tj/shortcut/open` 원격/CSRF 코드 실행 취약점 (ltdrdata, Comfy-Org/ComfyUI-Manager#2924
  리뷰 지적)** — 클라이언트가 보낸 경로를 존재 여부만 확인하고 `os.startfile()`/`open`/
  `xdg-open`으로 바로 실행하던 라우트라, 인증 없는 원격 요청이나 다른 사이트의 CSRF로
  로컬 임의 파일/실행 파일을 띄울 수 있었다. `/tj/shortcut/open`, `/tj/shortcut/browse`
  양쪽에 루프백(loopback) + 동일 출처(Origin/Referer == Host) 가드를 추가해 원격 접근을
  완전히 차단(옵트인 불가). 로컬에서 숏컷을 열면 무엇을 열었는지/왜 막혔는지 토스트
  알림으로 표시.

### [Changed]

* **`✨ TJ_NODE SET` 플로팅 런처 레지스트리 최신화** — 실제 등록된 노드 대비 누락돼 있던
  `Save With Original Names (TJ)`, `Index LoRA Loader Counter (TJ)`, `Resolution (TJ)`,
  `Model Set Loader (TJ)`, `Index LoRA Loader (TJ)`, `LED Display (TJ)`,
  `Universal Calculator (TJ)`, `Video Grid Comparer (TJ)`, `Send (TJ)`, `Send Point (TJ)`,
  `Images Compare Sheet - Queue Loop (TJ)`, `Scene Maker Result - pipe(TJ)` 를 추가하고,
  카테고리가 없던 LoRA Analyzer 4종과 `Enhanced KSampler (TJ)` 를 위해 **LoRA**/**Sampling**
  탭을 신설. 실제 존재하지 않는 타입을 가리키던 `Z-Image ONE (TJ)`/`flux2 klein One (TJ)`
  항목은 제거.

---
## [2.9.1] - 2026-07-22

### [Fixed]

* **원격/고지연 환경에서 Multi Image Loader 파일 피커가 매우 느리던 문제(근본 원인
  재조치)** — 기존엔 썸네일이 원본 파일을 그대로(`/view`) 서빙하면서 캐시 무효화용
  타임스탬프(`t=Date.now()`)까지 붙어 있어, 열 때마다 원본 전체를 재다운로드하고
  있었다(2.9.0 의 `loading="lazy"`/타임아웃 완화는 증상만 줄였을 뿐 근본 해결은
  아니었음). 새 엔드포인트 `GET /tj_node/thumbnail` 을 추가해 실제로 작게 리사이즈한
  JPEG 을 서버 디스크에 캐시(경로+수정시각+크기 기준 키, 최대 8000개/300MB, 오래된
  것부터 정리)하고, `Cache-Control: public, max-age=31536000, immutable` 로 내려줘
  브라우저도 같은 폴더를 다시 열 때 네트워크 요청 자체를 만들지 않는다. 실측: 원본
  95KB → 썸네일 3KB(약 30배), 서버 캐시 히트 0.16s → 0.003s, 브라우저 캐시 히트
  389ms → 1ms.

---
## [2.9.0] - 2026-07-21

### [Added]

* **`KREA2 (Prompt Enhance)`** — `model_format` 목록 맨 앞에 추가 (Prompt Studio / Prompt
  Enhancer / Image to Prompt 공용). 이미지 분석·텍스트 교정 양쪽에서 쓰이므로, 사용자
  프롬프트 전용이던 원문 대신 **소스 중립** 문구(`the source may be the user's written
  prompt or an image you have just analyzed`)로 재작성. `User's Input:` 꼬리표와
  thinking-block 지시를 제거해 뒤따르는 시스템 지시문을 삼키거나 "Thinking Process"
  노출을 유발하던 문제도 함께 제거.
* LLM 노드들의 `clip_loader_type` 을 **ComfyUI CLIPLoader 에서 동적으로 조회**하도록 변경
  — 하드코딩 목록의 오타(`pixeldict`→`pixeldit`)를 고치고 `krea2`/`boogu` 를 추가. 새
  ComfyUI 가 타입을 추가해도 자동으로 따라간다. `krea` 가 포함된 파일명은 Auto 모드에서
  `krea2` 타입을 우선 시도.
* **`Save With Original Names (TJ)`** 신규 노드 — 배치의 각 이미지를 원본 파일명 그대로
  저장한다. `Multi Image Loader` 의 `FILENAMES` 출력(줄바꿈 구분)을 그대로 연결해 쓴다.
  저장 위치는 output 하위 지정 폴더로 격리, 확장자는 원본 유지/선택 가능, 동일 파일명은
  덮어쓰기/자동 번호 선택.
* **`Index LoRA Loader Counter (TJ)`** 신규 노드 — Index LoRA Loader 의 활성(= `[none]`
  이 아닌) LoRA 슬롯 개수를 **그래프 연결 없이** 실시간으로 추적한다. 캔버스에서 대상
  로더의 `lora_1..lora_20` 위젯을 JS 가 직접 읽어 세므로, Queue Loop 의 `queue_count`/
  `end_index` 에 연결해도 순환 의존성이 생기지 않는다(직접 연결 시
  `Queue Loop → Index LoRA Loader → Queue Loop` 순환으로 ComfyUI 가 실행을 거부하는
  것을 실제로 재현·확인함). 로더가 하나면 자동 인식, 여러 개면 드롭다운으로 선택.
* `Multi Image Loader (TJ)`

  * **출력 슬롯 `FILENAMES`** 추가 — 로드/선택된 이미지들의 원본 파일명(확장자 포함,
    줄바꿈 구분). `Save With Original Names (TJ)` 와 함께 사용해 원본과 같은 이름으로
    저장하는 용도.
  * 파일 피커에 **정렬**(이름/시간/종류 × 오름/내림, localStorage 저장) 추가. 폴더는
    파일과 동일한 기준으로 정렬하되 항상 최상위.
  * **폴더 북마크** — 상단 바에서 등록/이동/해제, input·output·download 탭 한정, 폴더가
    삭제되면 자동으로 목록에서 제거.
  * 로컬 업로드를 **이미지 파일로 제한**(클라이언트 필터 + 서버 확장자 검증 — 기존엔
    임의 파일이 업로드됐음).

### [Fixed]

* **원격/고지연 환경에서 Multi Image Loader 썸네일 로딩이 가끔 멈추는 문제** — 북마크
  유효성 검사를 세션당 1회로 제한하고 메인 콘텐츠 로딩 이후 유휴 시점에 실행하도록
  변경(썸네일 요청과 커넥션을 다투지 않게), 모든 목록 조회 요청에 타임아웃(응답 없으면
  "다시 시도" 버튼과 함께 오류 표시), 썸네일 이미지에 `loading="lazy"` 적용.
* **`Resolution (TJ)` 가 새로고침/워크플로우 재로드 시 1:1 로 초기화되던 문제** —
  `nodeCreated` 시점엔 저장된 위젯 값이 아직 복원되기 전이라 항상 기본값을 읽고
  있었음. `onConfigure`(위젯 값이 실제로 복원된 뒤) 에서 상태를 다시 읽어 UI 를
  재구성하도록 수정. "워크플로우 열기" 실경로로 검증.
* **`Queue Loop (TJ)` 가 연결된 입력을 무시하고 타이핑했던 값으로 Reset/Start 되던
  문제** — `queue_count`/`start_index`/`end_index`/`step` 이 다른 노드에 연결되어
  있어도 위젯의 예전 타이핑 값을 읽고 있었음. 연결된 원본 노드의 현재 값을
  **실행 없이 즉시** 읽어오도록 수정(Index LoRA Loader Counter, PrimitiveInt 등),
  알 수 없는 노드는 마지막 실행 결과값으로 폴백. 유휴 상태의 `ready` 표시도 연결된
  값이 바뀌면 계속 최신으로 갱신됨.
* `LoRA Analyzer` 4종(Krea2/Klein 4B·9B/Z-Image) — `use_original` 아래 UI(프리셋·조절·
  저장/블록 목록)를 **아코디언으로 접기/펴기** 가능하도록 변경, 상태는
  `node.properties` 에 저장되어 불러오기·새로고침 후에도 유지. 노드 크기 계산을
  `computeSize` 기반으로 바꿔, 접었다 펴는 과정에서 노드 높이가 수천 px 로 발산하던
  버그도 함께 해결.
* `Smart Show (TJ)`

  * 사용자가 조정한 노드 크기가 워크플로우 로드 중 임시 축소값으로 영구 손상되던
    문제 — 크기 저장을 실제 사용자 드래그 리사이즈(`resizing_node`)일 때만 하도록
    제한하고, 복원 시 직렬화된 `size` 대신 사용자 의도값(`saved_grid_size`)을
    우선하도록 수정.
  * Edit 모드 ON 상태에서 새 입력이 들어오면 편집 중이던 텍스트가 사라지던 문제 —
    편집 중에는 입력을 무시하도록 수정, 편집 내용이 `text_content` 위젯에 실시간
    동기화되지 않던 문제도 함께 해결.

### [Security]

* `list_dir_files` API — 폴더 존재 여부(`exists`)와 정렬용 메타데이터(수정시각·크기·
  확장자)를 추가로 반환. `upload_local` API 가 이미지 확장자가 아닌 파일을 거부하도록
  강화(기존엔 임의 파일이 업로드 가능했음).

---
## [2.8.3] - 2026-07-20

### [Added]

* `Send Point (TJ)` 에 **출력 On/Off 토글**(`output_enabled`)

  * OFF 로 두면 값을 내보내지 않고 **이 노드 이후 그래프의 실행을 차단**한다
    (`ExecutionBlocker` — 팩의 다른 게이트 노드와 동일한 방식)
  * OFF 상태에서는 **전달받은 값이 없어도 에러가 나지 않는다** → 아직 Send 하지 않은
    Send Point 를 꺼두면 워크플로우 전체가 멈추지 않는다
  * 저장된 값은 그대로 유지되어, 다시 켜면 즉시 사용된다

* `Send (TJ)` 타이틀 우측에 **`?` 버튼** — 클릭하면 우측에 **캐시 관리 팝업**

  * 파일 수 / 총 용량 / 가장 오래 미사용·최근 사용 시각 표시
  * 현재 자동 정리 기준(미사용 7일 · 총 1GB · 5000개) 안내
  * **부분 정리** — 자동 정리 규칙을 지금 즉시 적용
  * **전체 정리** — 캐시 전부 삭제 (확인 후 진행, 다시 Send 하면 복구)
  * API: `GET /tj_send_bridge/cache_info`, `POST /tj_send_bridge/cache_clean`

---
## [2.8.2] - 2026-07-20

### [Changed]

* `Send Bridge` 캐시 보관 정책 조정

  * 개수 상한 **500 → 5000** (실질 방어선은 용량이므로 넉넉하게)
  * 총 용량 상한 **1GB** 유지
  * **기간 만료 7일** 추가
  * 만료 기준은 '생성 후' 가 아니라 **'마지막 사용 후'** — 캐시 파일을 실제로 사용할
    때마다 mtime 을 갱신하므로, 저장해둔 워크플로우에서 계속 쓰는 이미지는 7일이
    지나도 삭제되지 않는다 (안 쓰는 것만 정리)
  * 어떤 규칙으로 정리하든 **최신 파일 1개는 항상 보존**

---
## [2.8.1] - 2026-07-20

### [Changed]

* `Send Bridge` 캐시 정리에 **총 용량 상한(1GB)** 추가

  * 기존에는 파일 **개수**(500개)만 제한해 용량을 보장하지 못했음 —
    고해상도 PNG 는 장당 수 MB 라 500개면 수 GB 가 될 수 있었다
  * 이제 개수와 총 용량 중 **어느 쪽이든 초과하면** 오래된 파일부터 정리하며,
    방금 저장한 최신 파일은 항상 보존한다
  * 참고: 영상은 원본 경로를 참조만 하고 복사하지 않으므로 이 폴더에 쌓이지 않는다
    (브리지 폴더는 이미지 텐서 캐시 전용)

---
## [2.8.0] - 2026-07-20

### [Added]

* **`Send (TJ)` / `Send Point (TJ)` 신규 노드 (Send Bridge)** — 하나의 캔버스 안에서
  서로 다른 워크플로우 그룹을 **큐 실행상 완전히 분리**하되 결과물만 전달

  * `Send Point` 는 실행 시 **자기 저장값만** 읽고 `Send` 를 그래프상 참조하지 않는다
    → 그룹A 를 재실행하지 않아도 그룹B 만 단독 큐 실행 가능
  * 전달은 큐 실행이 아니라 **API 한 번으로 값 복사** (연결이 아님)
  * `point_name` (고유 이름) 으로 `Send` 노드에 버튼이 생성됨. 이름이 비면 버튼 없음
    (노드 제목과 무관)
  * **타입별 미리보기**: IMAGE→이미지, VIDEO→플레이어, STRING→텍스트.
    수신 타입 라벨 표시 (`✅ IMAGE ← Send (TJ)`)
  * **영구 기억**: IMAGE/VIDEO 는 참조를, STRING 은 텍스트를 노드 위젯에 저장 →
    ComfyUI 재시작 / 워크플로우 재오픈 후에도 유지 + 미리보기 복원
    (LATENT 등 직렬화 불가 타입은 세션 한정)
  * **부분 실행**: 값이 없을 때 버튼을 누르면 전체 큐가 아니라 **그 Send 에 연결된
    상위 노드만** 실행 후 전달
  * 캐시는 `output/tj_send_bridge` (temp 는 ComfyUI 가 시작 시 삭제하므로 사용하지 않음)
  * CATEGORY: ` ✨ TJ_Node/Wireless` — 기존 Set/Get Registry 와 독립적으로 동작

### [Security]

원본 구현 검수에서 발견한 취약점을 편입 과정에서 수정:

* **임의 파일 쓰기 차단** — 클라이언트가 보낸 `sender_id` 가 저장 파일명에 그대로
  들어가 `../` 로 캐시 폴더 밖에 쓸 수 있었음. 파일명을 **내용 해시(content-addressed)**
  로 바꿔 클라이언트 입력이 경로에 전혀 들어가지 않도록 원천 차단 + 최종 경로
  realpath/commonpath 재검증
* **임의 파일 읽기 차단** — 아무 절대경로나 이미지 참조로 수용되어 `Send Point` 가
  임의 파일을 열 수 있었음. 참조는 브리지 폴더 또는 ComfyUI input/output/temp 내부로만
  해석 (검증된 `_tj_resolve_media_path` 재사용). 워크플로우에 주입된 조작 참조도 거부
* **경로 노출 제거** — API 응답/저장 참조에 절대경로를 넣지 않고
  파일명·상대경로·(filename, subfolder, type) 만 사용
* 라우트 등록을 `try/except` + 중복 가드로 감싸 실패해도 노드 로딩이 깨지지 않게 함

### [Fixed]

* **영상 전달이 매우 느리던 문제 (4.9초 → 1ms)** — VIDEO 객체 경로 탐색이
  `get_components()` 를 호출해 **영상 전체를 디코딩**하고 있었음.
  `get_stream_source()` 등 값싼 접근만 쓰는 `fast_video_source()` 로 대체
* **영상이 잘못된 파일로 해석되던 문제** — 위 디코딩 경로가 내장 메타데이터를 따라가
  실제 로드한 파일이 아닌 다른 파일을 반환했음
* 영상 파일이 이미지로 오분류되어 `Image.open()` 이 실패하던 문제 (확장자 기반 분류)
* 문자열이 불필요하게 세션 한정이던 문제 → 직렬화 가능하므로 영구 저장
* 워크플로우 재오픈 시 미리보기가 복원되지 않던 문제 — `nodeCreated` 는 위젯 값이
  복원되기 **전에** 호출되므로 `loadedGraphNode` / `afterConfigureGraph` 로 이동
* 영상 미리보기 하단에 큰 여백이 생기던 문제 (요소 높이를 px 로 고정)
* 새로 배치한 `Send Point` 노드가 과도하게 크던 문제 (400×200 → 210×58) —
  내부 슬롯을 단일행으로 바꿔 DOM 위젯 생성을 없애고 숨김 후 크기 재계산
* 같은 이미지를 보낼 때마다 캐시 파일이 중복 생성되던 문제 (25파일 43MB 중 고유 5개)
  → 내용 해시로 재사용, 500개 초과 시 오래된 파일 정리

---
## [2.7.0] - 2026-07-19

### [Fixed]

* **LLM/GGUF 노드 VRAM 처리 대폭 개선** (Prompt Studio / Image to Prompt / Prompt Enhancer / Scene Maker)

  * **vision 노드 재실행 시 clip 인코더가 CPU 로 fallback 해 수십~수백 배 느려지던 문제**
    (예: 654ms → 124초). 원인은 비전 chat handler 의 `_exit_stack` 이 `del` 로는
    닫히지 않아 clip/mtmd CUDA 컨텍스트가 완전히 해제되지 않던 것. 새 헬퍼
    `_free_chat_handler()` 가 `_exit_stack.close()` 를 명시적으로 호출해 해결 →
    재실행해도 clip 이 GPU 를 유지 (3회 연속 617/529/547ms 검증).
  * **실행 후 llama.cpp 모델 VRAM 이 해제되지 않던 문제**. `torch.cuda.empty_cache()`
    는 llama.cpp 의 자체 CUDA 컨텍스트에 무효 → `Llama.close()` 를 명시적으로 호출하도록
    `_free_llm()` 수정 (VRAM 이 baseline 으로 반납됨).

### [Added]

* GGUF 로드 직전 `_free_comfy_vram()` — ComfyUI 모델을 먼저 언로드해 VRAM 확보
  (이미지 생성 → LLM 전환 시 VRAM 충돌/로드 실패 방지).
* **`LLAMA_GPU_SETUP.md`** — llama-cpp-python GPU 빌드/설치 안내 (한/영). 왜 소스
  빌드가 필요한지, 사전 준비물, 문제 해결(temp 삭제·cublas 누락·VRAM 부족) 정리.

### [Changed]

* **`build_llama_gemma4.bat` 개선**

  * `pip install -e .`(editable) → **wheel 빌드 후 설치** 로 변경. editable 은 소스를
    `%TEMP%` 에 두어 Windows 가 temp 를 청소하면 `llama.dll not found` 로 깨졌음 —
    wheel 은 self-contained 라 재발 방지.
  * 임베디드 Python 경로를 스크립트 위치 기준 **자동 감지** (하드코딩 제거).
  * 빌드된 `.whl` 을 `wheels/` 에 보관 → 재빌드 없이 재설치 가능. `--no-deps` 로
    설치해 기존 numpy/torch 를 건드리지 않음.

---
## [2.6.9] - 2026-07-16

### [Fixed]

* `Resolution (TJ)` — Auto Set ON 시 **width 슬롯에만 화살표가 안 붙던 문제**

  * 프론트 버전에 따라 출력 라벨을 `name` / `label` / `localized_name` 중
    다른 필드에서 읽어, 한쪽 슬롯만 반영되던 현상 → **세 필드 모두 설정**
  * 화살표를 코어(`set_getnode_tj.js`)와 동일한 `▶` 로 통일
    (Multi Router 의 `▸` 와 코어의 `▶` 가 서로 달랐음)

---
## [2.6.8] - 2026-07-16

### [Fixed]

* `Resolution (TJ)` — Auto Set 이 **get_name 목록에 나타나지 않던 문제**

  * 원인 1: 코어의 `AUTO_SET_PROVIDER_TYPES` 에 `TJ_Resolution` **미등록**
    → Get 노드가 provider 로 인식조차 못 함. `set_getnode_tj.js` 에 추가
  * 원인 2: 등록 후 **Get / Multi Get 노드에 갱신 신호를 보내지 않음**
    → Multi Router 와 동일하게 `_syncWithSetNode` / `_rebuild` 호출 추가
  * 규약을 Multi Router(TJ) 기준으로 통일: 출력 라벨 `이름 ▸`,
    이름 중복은 캔버스 전체를 훑어 `_1`, `_2` … 로 회피

### [Removed]

* `Resolution (TJ)` 의 `setnode_name` 위젯 제거 — Auto Set 노드에는 불필요
  (해당 위젯은 Auto Set 없이 단일 슬롯을 지정하는 다른 성격의 노드용)

---
## [2.6.7] - 2026-07-16

### [Fixed]

* 하단 여백 재발 수정 (`Resolution (TJ)`, LoRA Analyzer 4종)

  * 2.6.6 의 "제한 재귀" 보정은 `setSize` 후 레이아웃 반영 전에 다시 측정해
    **같은 delta 를 반복 누적**하는 구조라 수렴하지 못했음
  * 반복 보정을 없애고 **한 번에 정확히 계산**하는 방식으로 변경:
    `overhead = 노드높이 − host높이` 를 실측 → `노드높이 = overhead + 콘텐츠높이`
  * 1 패스로 정확히 맞으므로 루프 자체가 불필요 → 프리즈도 구조적으로 불가

---
## [2.6.6] - 2026-07-16

### [Fixed]

* **캔버스 드래그 시 화면 프리즈** 수정 (`Resolution (TJ)`, LoRA Analyzer 4종)

  * 원인: 노드 높이 자동 보정의 무한 루프 —
    `ResizeObserver` 가 `host` 를 관찰 → `fitNode` 가 `setSize` → `host` 리사이즈 →
    RO 재발동 → … 수렴하지 못하면 영원히 반복되어 브라우저가 멈춤
  * `host` 관찰 제거로 피드백 고리를 끊고, 수렴은 `fitNode` 내부의
    **최대 6회 제한 rAF 재귀**가 담당하도록 변경 (무한 루프 구조적으로 불가)

---
## [2.6.5] - 2026-07-16

### [Added]

* `Resolution (TJ)` — **Auto Set (Wireless) 지원** (TJ 아이덴티티)

  * `auto_set` 토글 + `setnode_name` 위젯 추가
  * ON 시 `width` / `height` 출력이 Wireless Provider 로 자동 등록
    → `{이름}/width ▶`, `{이름}/height ▶`
  * Registry Name = Output Label = Get Selection Name 규칙 준수
  * 이름 중복 방지·fake-wire 복구는 기존 TJ 코어에 위임 (재구현 없음)

---
## [2.6.4] - 2026-07-16

### [Changed]

* `Resolution (TJ)` — 정보 표시 정리 (중복 제거)

  * 배수 버튼(8/16/32/64) 옆의 `비율 · MP` 표시 **제거** — 크기가 어차피 하단에 나옴
  * 하단 크기 라벨에 MP 를 함께 표시: `1360 × 2048 · 2.80 MP`

---
## [2.6.3] - 2026-07-16

### [Fixed]

* `Resolution (TJ)` — Custom Ratio 에서 **반대쪽 입력 필드가 갱신되지 않던 버그**

  * height 를 고치면 width 필드에 이전 값이 그대로 남아 있었음
    (미리보기·출력값은 정상이라 필드만 어긋남). width 수정 시에도 동일
  * 원인: 타이핑 중 필드가 튀는 걸 막으려고 입력 동기화를 **통째로** 껐던 것
  * 이제 **편집 중인 필드만** 제외하고 나머지는 실시간 갱신
  * 파생되는 쪽(자동 계산되는 값)은 스냅(8/16/32/64) 적용 —
    예: 2:3 에서 height 2048 입력 → width **1360**(16 배수)

---
## [2.6.2] - 2026-07-16

### [Changed]

* `Resolution (TJ)` — 비율별 대표 해상도를 **실제 생태계 버킷**으로 교체

  * 기존 수학적 progression 은 `1920×1088`, `1600×896` 같이 실제로 많이 쓰는
    사이즈를 만들어내지 못했음 (생태계 버킷은 정확한 비율이 아님 — 1920×1088 = 1.765)
  * LTX-2 / Z-Image / Klein / Flux / Krea2 / Qwen-Image / Ideogram 기준 값으로
    9개 비율 × 8개 해상도 **표를 하드코딩**
    - 16:9 → 832×464, 1280×720, 1344×752, 1536×864, **1600×896**, **1664×928**(Qwen),
      1792×1008, **1920×1088**(LTX-2/Flux)
    - 3:2 → 1248×832, 1344×896, 1536×1024(Ideogram), **1584×1056**(Qwen) …
    - 1:1 → 512² … **1328²**(Qwen), **1408²**(Flux) … 2048²
  * 세로 비율(9:16 / 2:3 / 3:4)은 가로 비율의 전치로 자동 생성

---
## [2.6.1] - 2026-07-16

### [Added]

* `Resolution (TJ)` — **비율별 대표 해상도 목록** 추가

  * 9개 비율 프리셋을 누르면 그 비율에서 자주 쓰는 **해상도 8개**가 목록으로 떠서
    바로 선택 가능 (클릭 시 하이라이트)
  * 기준값 512 / 768 / 1024 / 1280 / 1328 / 1408 / 1536 / 2048 을 각 비율에 적용
    (긴 변 = 기준값, 짧은 변은 비율 계산 후 16 배수 스냅)
    - 1:1 → 512×512 … 2048×2048
    - 16:9 → 1024×576, 1280×720, 1536×864, 2048×1152 …
    - 2:3 → 512×768, 688×1024, 1024×1536 …
  * 모드 3종으로 정리: **프리셋 목록** / Custom Ratio / Custom Resolution
    (모드별로 필요한 컨트롤만 표시)

---
## [2.6.0] - 2026-07-16

### [Added]

* `Resolution (TJ)` 신규 노드 — 비율/해상도 선택 DOM UI

  * 비율 프리셋 9종: 1:1, 16:9, 9:16, 2:1, 3:2, 2:3, 4:3, 3:4, 4:5 (도형 아이콘 포함)
  * **Custom Ratio** 모드: `RATIO [w] ⇄ [h]` + 기준 크기(512/768/1024/1536)
    → 한쪽 수치를 바꾸면 **나머지가 비율에 맞춰 자동 계산**
    (예: 2:3 에서 height 1536 입력 → width 1024 자동)
  * **Custom Resolution** 모드: WIDTH/HEIGHT 자유 입력 + 둘 사이 ⇄ 스왑
  * 스냅 8/16/32/64, 실시간 정보 표시 `2:3 · 1.57 MP`
  * 하단에 **비율대로 그려지는 미리보기 박스** + `1024 × 1536` 표기
  * 출력: `width`, `height` (INT)
  * TJ 브랜드 컬러(`#7612DA`) 적용, CATEGORY: ` ✨ TJ_Node/Utility`

---
## [2.5.5] - 2026-07-16

### [Fixed]

* LoRA Analyzer 4종 — **DOM 영역 하단 여백** 수정

  * 블록 수가 25/30/32 로 다른데도 4개 노드 높이가 **전부 동일**하고 하단에
    여백이 남던 문제: `node.computeSize()` 가 프론트 버전에 따라 DOM 위젯 높이를
    반영하지 못해 `wrap.scrollHeight` 가 0 → 고정 폴백(820)이 쓰이고 있었음
  * `computeSize` 의존을 제거하고, **실제 렌더된 host 높이와 콘텐츠 높이의 차이만큼
    노드를 보정**하는 방식으로 변경 (캔버스 줌 배율 보정 포함)
  * `ResizeObserver` 가 `wrap`(콘텐츠) + `host`(외곽) 를 함께 관찰해 delta≈0 으로 수렴

---
## [2.5.4] - 2026-07-16

### [Added]

* `Enhanced KSampler (TJ)` — `adv_text_scale` 추가 (Krea2 전용)

  * 원본 `Krea2T Enhancer Advanced` 의 `text_scale` 이식 — `txtmlp` 출력 전체 배율
  * `enhance_strength`(특정 청크 재가중)와 **독립 동작** → strength=0 이어도 단독 적용 가능
  * 범위 0.25~4.0 (기본 1.0)

### [Changed]

* `enhance_enabled` 를 `enhance_arch` **위로 이동**, OFF 시 enhance 관련 항목 **전부 숨김**

### [Fixed]

* `adv_late_layer_scale` 등 Klein 전용 노브가 krea2/zimage 에서도 계속 노출되던 문제
  — 최신 ComfyUI 프론트에서 `type="hidden"` 만으론 안 숨겨져 `hidden` 속성도 함께 세팅

---
## [2.5.3] - 2026-07-16

### [Fixed]

* `Enhanced KSampler (TJ)` — 노드 높이 자동 조정 제거

  * 옵션 표시가 바뀔 때마다 높이를 `computeSize` 로 되돌려서
    **latent preview 영역을 사용자가 늘릴 수 없던 문제** 수정
  * 이제 노드 크기는 **수동 조절**만 (옵션 표시/숨김은 그대로 동작)

---
## [2.5.2] - 2026-07-16

### [Changed]

* 미리보기 실패/미지원 표시의 **빨간 배경 → 검정**으로 변경 (`utility_node_tj.js`)

  * 여러 개가 동시에 뜨면 화면이 온통 빨개져 위압적이라는 피드백 반영
  * `Preview load failed` 배경 `#441111` → `#111111` (단일/그리드 미리보기 2곳)
  * `Unsupported Data Format` 패널 배경 `#220000` → `#111111`
  * 실패/로딩 배경을 동일하게 두고 **문구로 구분** (경고 문구 글자색은 유지)
  * Multi Image Loader 의 붉은 셀 하이라이트는 **삭제 선택 표시**라 그대로 둠

---
## [2.5.1] - 2026-07-16

### [Changed]

* `Enhanced KSampler (TJ)` UI 정리

  * `enhance_arch` 에서 `auto` / `off` 제거 → `krea2 / klein / zimage` 명시 선택
  * `enhance_arch` 바로 아래 **`enhance_enabled` 토글** 추가 (OFF = 표준 KSampler)
  * **선택한 아키텍처에 필요한 옵션만 표시** (JS 동적 표시) — Krea2 는 conditioning
    노브를 쓰지 않고, Z-Image 는 레이어 슬라이스가 없어 해당 노브 숨김
  * 모든 설정에 **영문 툴팁** 추가 (무엇을 조절하는지 설명)
  * 선택한 아키텍처와 실제 모델이 다르면 경고 후 증폭 생략(표준 KSampler)

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
