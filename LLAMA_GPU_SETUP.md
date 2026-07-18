# llama-cpp-python GPU Setup / GPU 설치 안내

TJ_NODE의 LLM 노드(**Prompt Studio / Image to Prompt / Prompt Enhancer / Scene Maker**)는
GGUF 모델을 돌리기 위해 `llama-cpp-python` 을 사용합니다.

The LLM nodes need `llama-cpp-python` to run GGUF models.

---

## 왜 별도 설치가 필요한가 / Why a special install

`pip install llama-cpp-python` (기본값) 으로 깔면:

- **CPU 전용** 으로 설치됩니다 → vision 인코딩이 수십~수백 배 느림
- llama.cpp 버전이 낮아 **Gemma 4 / Qwen3-VL 같은 최신 모델 로드 실패** 가능

그래서 GPU 가속 + 최신 모델을 쓰려면 **직접 소스 빌드**가 필요합니다.
The default PyPI package is **CPU-only** and may be too old to load the newest models
(Gemma 4, Qwen3-VL). For GPU speed and latest-model support you must build from source.

> ⚠️ 미리 빌드된 wheel을 배포하지 않는 이유: wheel은 **CUDA 버전 × Python 버전 × GPU 세대**
> 조합마다 달라서, 한 개를 배포하면 대부분의 사용자 환경에서 안 맞습니다
> (설치는 되는데 런타임에 `cublas64_XX.dll not found` 등으로 터짐). 그래서 각자 환경에
> 맞춰 빌드하는 스크립트를 제공합니다.

---

## 설치 경로 / Install paths

### 🔧 A. GPU 빌드 (권장) — `build_llama_gemma4.bat`

**사전 준비 (한 번만):**

1. **Visual Studio 2022 Build Tools** — "Desktop development with C++" 워크로드
   - https://visualstudio.microsoft.com/downloads/  → Build Tools for Visual Studio 2022
2. **CUDA Toolkit** (GPU 빌드용, 예: 12.6) — https://developer.nvidia.com/cuda-downloads
3. **Git** — https://git-scm.com/download/win

**실행:**

1. `build_llama_gemma4.bat` 를 더블클릭 (또는 우클릭 → 관리자 권한 실행)
2. 스크립트가 자동으로:
   - 임베디드 Python / vcvars64 / CUDA 를 감지
   - 최신 llama.cpp 를 clone + 빌드 (10~20분)
   - **wheel(`.whl`)을 만들어 `wheels/` 폴더에 저장**하고 설치
3. 끝나면 **ComfyUI 재시작**

> 빌드된 `.whl` 은 `ComfyUI-TJ_NODE/wheels/` 에 남습니다. 백업해두면 다음에
> 재빌드 없이 재설치할 수 있습니다:
> ```
> <install>\python_embeded\python.exe -m pip install --force-reinstall --no-deps "wheels\llama_cpp_python-*.whl"
> ```

### 🐌 B. CPU 전용 (빠른 설치, 느린 실행)

빌드 환경 준비가 부담되면 CPU 버전으로 일단 동작만:

```
<install>\python_embeded\python.exe -m pip install llama-cpp-python
```

GPU 가속은 없습니다. 최신 모델(Gemma4/Qwen3-VL)은 버전에 따라 안 될 수 있습니다.

---

## 문제 해결 / Troubleshooting

**`Failed to load shared library 'llama.dll' ... Could not find module`**
- 원인: 예전에 `pip install -e .`(editable) 로 깔았는데 Windows가 `%TEMP%` 를 청소함
- 해결: 위 A(빌드) 로 재설치. **현재 스크립트는 editable 대신 wheel 로 설치하므로 이 문제가 재발하지 않습니다.**

**`Failed to load ... cublas64_12.dll` / `cudart64_12.dll not found`**
- 원인: 빌드는 CUDA 12로 됐는데 시스템에 CUDA 12 런타임이 없음
- 해결: 해당 CUDA Toolkit(런타임 포함) 설치, 또는 설치된 CUDA 버전에 맞춰 재빌드

**`Failed to load model from file: ....gguf` (파일은 존재)**
- 대부분 **VRAM 부족**. 다른 모델이 VRAM 점유 중이면 GGUF 를 못 올림
- TJ_NODE 는 GGUF 로드 전 ComfyUI 모델을 언로드하고, 실행 후 GGUF VRAM 을 반납하도록
  처리합니다. 그래도 부족하면 더 작은 양자화(Q4 등)나 `n_gpu_layers` 를 낮추세요

**numpy / 의존성 충돌 경고**
- 빌드 스크립트는 `--no-deps` 로 설치해 기존 numpy/torch 를 건드리지 않습니다.
  그래도 경고가 보이면 대개 무시해도 됩니다(다른 패키지의 요구 버전 표시일 뿐)

---

## 참고 / Notes

- vision(멀티모달) GGUF 는 **모델 본체 + mmproj** 두 파일이 모두 필요합니다.
- 모델은 `models/text_encoders/` (하위 폴더 포함) 에 두면 노드에서 인식합니다.
