# CLAUDE.md — ComfyUI-TJ_NODE 인수인계 가이드

어떤 모델이든 이 파일을 먼저 읽고 작업을 이어받을 수 있게 정리한 문서입니다.
`[Claude Code 전용]` 표시는 Claude Code 기능에 의존하는 규칙이고, 바로 아래에 일반 텍스트 규칙을 함께 적었습니다.
확실하지 않은 것은 "확인 필요"로 표시했습니다.

## 1. 이 저장소는?

ComfyUI 커스텀 노드 팩 (현재 v2.26.0, MIT). 무선(Wireless Set/Get) 워크플로우, 이미지 저장/미리보기,
LLM 프롬프트 노드, LoRA 분석, Reference Asset Library, MiniMax H3 연동 등 약 100개 노드.
GitHub: `designloves2/ComfyUI-TJ_NODE`. Comfy Registry와 ComfyUI-Manager 둘 다에 등록됨.

4개 저장소 관계:
- **ComfyUI-TJ_NODE (이 저장소)** — 메인 코어. 노드 + 웹 UI(JS).
- ComfyUI-TJ_NODE_STUDIO_ONE — 원노드 방식, 이 코어 기반. 갤러리 선택창(`shared/reflib_gallery_import.js`)을 이 저장소가 불러다 씀.
- AI-ONE-STUDIO — 원스튜디오 기반 웹앱.
- AI-One-Studio-Canvers — 원스튜디오 기반 웹앱(지능형 캔버스형).
(앞의 둘은 `custom_nodes/` 옆 폴더. 나머지 둘의 위치와 내부 구조는 확인 필요.)

## 2. 먼저 읽을 문서 (순서대로)

1. 이 파일
2. `CHANGELOG.md` — 맨 위 몇 항목이 최근 작업 (이 저장소에는 `HANDOFF*.md`가 없음)
3. `README.md` — 맨 위 "Latest Additions"에 최근 기능 요약, 아래에 노드별 설명 (2800줄, 필요한 부분만)
4. `REFERENCE_LIBRARY.md` — Reference Asset Library 설계/사용
5. `SPEC_H3_LATENT_CONTINUATION_SEAM.md` — `TJ_H3_LatentContinuation` 이음매 색 깨짐 측정 자료와 수정 제안
6. `LLAMA_GPU_SETUP.md` — llama-cpp-python GPU 빌드 / `THIRD_PARTY_LICENSES.md` — 외부 코드 출처
7. `workflow/readme.md` 와 예제 워크플로우 JSON

## 3. 디렉터리 구조

- `__init__.py` — 모든 노드 등록 (새 노드는 여기에 import + 매핑 추가)
- `core/` — API 라우트(`tj_api`), 썸네일, 공용 유틸
- `nodes/<분류>/` — 서버(Python) 노드. 분류: `wireless` `etc` `image` `llm` `lora` `reflib` `sampling` `utility` `video` `generator`
  - `llm/custom_llm.py` — LLM (TJ), `LLMSession`; `scene_maker.py`, `scene_maker_pipe.py` — Scene Maker와 Result pipe
  - `reflib/` — 에셋 라이브러리 (`library.py` SQLite+폴더, `resolve.py` `@토큰`, `nodes.py`, `routes.py`)
  - `utility/promptdb.py` — PromptDBSave/Loader (xlsx)
- `web/` — 프런트엔드 JS. 노드마다 `*_tj.js`. `web/tj_llm_model_ui.js`는 LLM 계열 공용 UI,
  `web/js/tj_node_floating_launcher_registry.js`는 플로팅 TJ 메뉴 등록부
- `workflow/` — 예제 워크플로우 (한국어 / `_EN` 영어판)
- `assetDB/`(에셋 라이브러리 데이터), `promptDB/`, `customLLM/`, `logs/`, `node.zip` — 로컬 데이터, git 제외
- `.github/workflows/publish.yml` — `pyproject.toml`이 main에 푸시되면 Comfy Registry에 자동 게시
- `.claude/skills/ltx25prompt` — LTX-2.5 프롬프트 작성 스킬 `[Claude Code 전용]`

## 4. 실행 · 설치 · 테스트

- 설치: ComfyUI의 `custom_nodes/`에 두고 `install_requirements.bat` (Windows) 또는 `install_requirements.sh`.
  의존성은 `requirements.txt` (`llama-cpp-python`, `openpyxl`, `imageio`, `imageio-ffmpeg`).
- 실행: ComfyUI 자체를 재시작해야 Python 변경이 적용됨. **JS만 바꿨으면 브라우저 새로고침이면 충분.**
- 이 환경의 ComfyUI: `C:\AI\ComfyUI-Easy-Install\` (임베디드 파이썬 `python_embeded\python.exe`, 포트 8188).
  재시작 API: `POST /manager/reboot`. 로컬 Windows 환경 한정이며 다른 PC에서는 확인 필요.
- 자동 테스트: **없음** (pytest 등 설정 없음). 검증은 ComfyUI에서 노드를 실제로 돌려 확인.
  시스템 `python`에는 PIL/numpy가 없으니 스크립트는 임베디드 파이썬으로 실행.
- 빌드 단계 없음 (JS 번들러 없음).

## 5. 코딩 규칙 (이미 지켜지는 것)

- 노드 클래스 `TJ_이름`, 표시 이름 `이름 (TJ)`, 카테고리 `✨ TJ_Node/...`. JS 파일은 `*_tj.js`.
- **모든 새 노드에 Wireless Set/Get 포함**: `get_name`, `auto_set`, `setnode_name` 입력. Auto Set은 `web/set_getnode_tj.js`에 등록해야 동작.
- 기존 노드에 입력을 추가할 때는 **맨 끝에, 기본값과 함께** 추가 (저장된 워크플로우의 위젯 값이 밀리지 않게).
  링크 전용 입력은 `("*", {})`로 선언.
- DOM 위젯 크기: `computeLayoutSize`에 고정 최소값을 쓰고 `node.size`를 `computeSize`에 넣지 말 것 (무한 증가).
  화면 밖 DOM 위젯은 높이 0이므로 ResizeObserver에서 숨겨진 요소를 무시.
- 한국어/영어: README·CHANGELOG·노드 설명은 한/영 병기. **Asset Browser UI 문구는 영어만.**
  LLM이 쓰는 서술 프롬프트는 항상 영어. 예제 워크플로우는 한국어판 + `_EN` 영어판 짝으로 유지.
- 버전: **가운데 숫자만 올림 (2.26.0 → 2.27.0)**. 마지막 자리는 올리지 않음. 올릴 곳 3군데:
  `pyproject.toml`의 `version`, `README.md` 2번째 줄 `# ✨ TJ_NODE vX.Y.0`, `CHANGELOG.md`.
- CHANGELOG: `## [Unreleased]` 아래에 쓰다가 릴리즈 때 `## [X.Y.0] - YYYY-MM-DD` 로 옮김. `### [Added]` `### [Fixed]` 같은 소제목.
- 커밋 메시지: 짧은 영어 명령형 제목 (`Add ...`, `Fix ...`, `Bump version to X.Y.0`, `Remove ...`). 한 커밋에 하나의 변경.
- 릴리즈: 태그 `vX.Y.0` 푸시 + `gh release create` (노트는 영어).
- 새 노드를 만들면 `web/js/tj_node_floating_launcher_registry.js`에도 등록 (누락 점검).

## 6. 하지 말 것

- **사용자가 요청하기 전에 커밋 / 푸시 / 버전업 / 릴리즈 하지 않기.** "보류"라고 하면 전부 멈춤. `--force` 금지.
- ComfyUI 재시작은 렌더 중일 수 있으니 먼저 확인하고 사용자에게 물을 것.
- 사용자의 `assetDB/` 라이브러리 데이터를 지우거나 바꾸지 않기. 테스트로 만든 에셋만 삭제.
- API 키(OpenRouter 등)를 출력/커밋하지 않기. 키는 서버 메모리에만 두며 STUDIO_ONE `.env`에서 필요할 때만 읽음.
- `graphify-out/`은 Graphify 플러그인 출력이라 건드리지 않음 (이 PC의 `.git/info/exclude`로 제외됨).
- Grid Relay 노드는 폐기됨 — 다시 등록하지 말 것.
- `TJ_DevReloadOptions`는 플로팅 메뉴에 일부러 뺐음.
- 호환성: 기존 노드 이름, 입력 순서, 출력 순서를 바꾸지 말 것 (저장된 워크플로우가 깨짐).
  `__init__.py`에는 파일이 실제로 있는 노드만 등록 (파일 없는 등록은 신규 설치를 깨뜨림).
- 라이선스: 이 저장소는 MIT. 외부 코드를 가져오면 `THIRD_PARTY_LICENSES.md`에 출처와 라이선스를 추가.
- 상위 폴더의 `ComfyUI/AGENTS.md`는 ComfyUI 코어용 규칙이고 이 저장소에는 해당 없음 (확인 필요: 의도적으로 따를 부분이 있는지).

## 7. 다른 저장소와의 연동

- **STUDIO_ONE**: Asset Browser의 `From Gallery`가 `/extensions/ComfyUI-TJ_NODE_STUDIO_ONE/shared/reflib_gallery_import.js`를 불러옴.
  없으면 버튼 비활성 + 툴팁. 에셋 한도·`+ Add` 메뉴·`@Name` 규칙을 바꾸면 STUDIO_ONE 쪽에도 알려야 함.
- PromptDBSave `json_input`은 STUDIO_ONE 이미지 노드의 `settings` JSON을 받음 (키 `model`/`sampler` → `model_name`/`sampler_name`).
- 이 저장소의 노드 이름/입력을 바꾸면 STUDIO_ONE의 그래프 빌더와 웹앱 2종(AI-ONE-STUDIO, Canvers)이 쓰는 지점 확인 필요.
- Registry 인수인계 이력은 STUDIO_ONE의 `HANDOFF_REGISTRY.md` 참고.

## 8. 현재 진행 상황 (2026-11-03 기준)

- 릴리즈된 최신: v2.26.0 (v2.25.0 GGUF 이미지 크래시 수정 + 에셋 이름 공백/`-` 변환). 상세는 `CHANGELOG.md`.
- 커밋 전 작업 (`[Unreleased]`): LLM (TJ)의 `model_format` / `aesthetic` / `vision_task` 입력, 실시간 진행 이벤트 `tj_llm_progress`
  (명세: `C:/AI/AI-One-Studio-Canvers/docs/NODE_SPEC_LLM_LIVE_LOG.md`), `</think>` 닫는 태그만 있는 응답 처리.
  GGUF 텍스트 / 이미지 입력 실행과 이전 워크플로우 값 보존은 확인함.
- 확인됨: 콘솔 요약 줄 `[TJ_LLM] ...`. 미검증: Open Router / Custom / TextGenerate는 시작·끝 이벤트만(스트리밍 없음),
  입력 토큰은 근사값(Qwen-VL 이미지 입력은 실제보다 훨씬 작게 나옴), 스튜디오 라우트(`/tj_studio_one/llm/*`)는 이 이벤트를 아직 전달하지 않음(STUDIO_ONE 세션 몫).
  그 밖: Scene Maker + 입력 이미지 + `suggest_references`, PromptDBSave 빨간 오류 상태, MTP 복구 재시도 경로.
- 다음 할 일: 위 미검증 확인, 스튜디오 → 웹 → 캔버스 순으로 이벤트 명세 전달, 필요하면 OpenRouter/Custom SSE 스트리밍.
- `SPEC_H3_LATENT_CONTINUATION_SEAM.md` 수정 제안의 적용 여부는 확인 필요.

## 9. 작업을 끝낼 때

**시작할 때:** 작업 전에 이 파일, `CHANGELOG.md` 맨 위, `git log -20`부터 읽는다. 기존 코드를 "내가 쓴 게 아니다"라고 선을 긋지 말고 프로젝트의 코드로 보고 고친다.
**끝날 때:** 커밋 요청이 없어도 8번 "현재 진행 상황"에 한 일 / 미검증 / 다음 할 일을 적어 둔다 (파일만 수정, 커밋은 요청 시).

**필수: 사용자가 커밋 / 푸시 / 릴리즈 / 버전업을 요청할 때마다 이 `CLAUDE.md`를 먼저 갱신하고 같은 커밋에 포함.**
(버전, 8번 "현재 진행 상황", 새 규칙·파일 반영.) 사용량 한도로 작업이 언제 끊길지 몰라서, 다음 모델이 이 파일만 보고 이어받게 하려는 규칙.

1. `CHANGELOG.md`의 `[Unreleased]`에 변경 내용 추가 (사용자에게 보이는 변경은 필수).
2. 노드/옵션이 바뀌었으면 `README.md` 해당 섹션과 "Latest Additions" 갱신. 에셋 라이브러리면 `REFERENCE_LIBRARY.md`도.
3. 노드를 추가했으면 `__init__.py`, `set_getnode_tj.js`, 플로팅 런처 등록부 확인.
4. 요청이 있을 때만 커밋 → 푸시 → 버전업(3곳) → 태그/릴리즈 순서로 진행. 요청 범위 밖 파일은 커밋하지 않음.
5. 다른 저장소에 영향이 있으면 사용자에게 알리거나 해당 세션에 전달.
6. 이 파일의 "현재 진행 상황"이 낡았으면 같이 고침.
