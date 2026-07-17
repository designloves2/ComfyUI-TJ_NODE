# ComfyUI-TJ_NODE
# ✨ TJ_NODE v2.6.5

## Large Scale Wireless Workflow Architecture Toolkit for ComfyUI

ComfyUI용 대규모 Wireless Workflow Architecture Toolkit
Large Scale Wireless Workflow Architecture Toolkit for ComfyUI

---

TJ_NODE는 단순 Utility Node Pack이 아닙니다.
TJ_NODE is not just another utility node pack.

TJ_NODE는 대규모 ComfyUI Workflow를 유지 가능한 구조로 만들기 위한 Architecture Toolkit입니다.
TJ_NODE is an architecture toolkit designed to make large-scale ComfyUI workflows maintainable.

---

<img width="2713" height="1640" alt="12b63f61-5a0b-4f77-9827-b4f0918e3299" src="https://github.com/user-attachments/assets/8de8b406-b1c3-4c12-98cb-3fc292f4df26" />

# ✨ Overview

TJ_NODE는 복잡한 ComfyUI Workflow를 더 읽기 쉽고, 유지 가능하며, 구조적으로 운영하기 위해 설계되었습니다.
TJ_NODE was designed to make complex ComfyUI workflows cleaner, more maintainable, and structurally scalable.

TJ_NODE의 핵심은 단순한 노드 추가가 아닙니다.
TJ_NODE is not simply about adding more nodes.

핵심은 Workflow Architecture입니다.
The core idea is Workflow Architecture.

---

기존 ComfyUI Workflow가 커질수록 다음 문제가 발생합니다.
As ComfyUI workflows become larger, the following problems quickly appear.

* Giant Visible Wires
* Routing Chaos
* Preview Clutter
* Save Structure Collapse
* Reload Instability
* Workflow Maintenance Difficulty

---

TJ_NODE는 이를 해결하기 위해 다음 시스템을 제공합니다.
TJ_NODE introduces the following systems to solve these problems.

* Wireless Fake-Wire Architecture
* Embedded Get System
* Multi Router Workflow Structure
* Batch Workflow System
* Preview Lifecycle System
* Save Pipeline Architecture
* HTML5 Overlay UI System
* Reload-Safe Wireless Lifecycle

---

#스크린샷 : OVERVIEW WORKFLOW

---

# ✨ Why TJ_NODE Exists

TJ_NODE의 목표는 단순히 Workflow를 작동시키는 것이 아닙니다.
TJ_NODE is NOT about simply making workflows work.

TJ_NODE의 목표는 대규모 Workflow를 유지 가능한 상태로 만드는 것입니다.
TJ_NODE is about making large-scale workflows maintainable.

---

핵심 철학:
Core Philosophy:

```text id="bw9q4y"
Large Scale Workflow Architecture
```

---

TJ Workflow의 핵심은 다음 구조입니다.
The core of TJ Workflow is section-based architecture.

```text id="pfuk8o"
INPUT
 ↓
GENERATION
 ↓
EDIT
 ↓
UPSCALE
 ↓
PREVIEW
 ↓
SAVE
```

---

각 Section 내부는 짧은 Wire를 사용합니다.
Short wires are used inside each section.

Section 간 연결은 Wireless Routing을 사용합니다.
Wireless routing is used between sections.

---

#스크린샷 : SECTION ARCHITECTURE

---

# 🚀 What's New in v2.4.x

## ✨ New: LoRA Analyzer 제품군 확장 (Klein 4B/9B, Z-Image)

Krea2 Analyzer와 **동일한 UI/기능**을 다른 아키텍처로 확장했습니다.
Same UI and features, now for more architectures.

| 노드 | 블록 구조 | 총 블록 |
|---|---|---|
| `Krea2 LoRA Analyzer (TJ)` | main 28 + TxtFusion layerwise 2 + refiner 2 | **32** |
| `Klein 4B LoRA Analyzer (TJ)` | double 5 + single 20 | **25** |
| `Klein 9B LoRA Analyzer (TJ)` | double 8 + single 24 | **32** |
| `Z-Image LoRA Analyzer (TJ)` | layers 30 (Turbo/Base 공통) | **30** |

> 블록 수는 실제 LoRA 파일들을 교차 검증해 확정한 값입니다.

**⚠ 아키텍처 불일치 자동 경고**
4B/9B 처럼 구조만 다른 변형을 **잘못 고르면 초과 블록이 조용히 버려져** 분석이 틀리게 나옵니다.
이제 이를 감지해 경고합니다 (노드 상태줄 + `analysis_text` + 콘솔).
- 예) Klein **9B LoRA를 4B 노드**에 넣으면 → `⚠ Double up to 7 (this node supports 5)` 경고
- 인식 블록이 0개면 → `⚠ 다른 아키텍처 LoRA일 수 있음` 안내

Automatically warns when a LoRA doesn't fit the chosen node (e.g. a 9B LoRA in the 4B node),
instead of silently ignoring the out-of-range blocks.

**공통 기능** (4개 노드 전부):
- 블록별 기여도 분석 + 실시간 효과 막대 (강도 조절 시 즉시 반영)
- `🔍 원본 대비` 겹쳐보기, 🎯 핵심만 / ⚖️ 균형 / 🧹 약한블록 정리 원클릭
- `use_original` 토글 — 설정 유지한 채 원본으로 큐 실행 (A/B 비교)
- 한/영 UI 토글 🌐, 프리셋 저장/불러오기, 필터링 LoRA 저장

**키 형식 무관 분석** — 학습 툴/옵션이 달라도 자동 인식:
`lora_A/B`(dot) · `lora_down/up`(kohya) · `.lora.down.weight`(diffusers) · `lokr_w1/w2`(LoKr) · `.A/.B`(단축형)

---

# 🚀 What's New in v2.3.0

## ✨ New: Krea2 LoRA Analyzer (TJ)

Krea2 모델용 LoRA를 **블록 단위(32 blocks)** 로 분석하고, 불필요한 블록을 비활성화하거나 강도를 조절한 뒤 **필터링된 LoRA를 저장**하는 신규 노드입니다.

Analyze Krea2 LoRAs block-by-block, toggle/scale individual blocks, and export a filtered LoRA.

- 블록 구조: Main 28 + TxtFusion Layerwise 2 + Refiner 2 = **32 blocks**
- 블록별 기여도(impact) 시각화 — 임팩트 바 + 색상 (파랑 → 빨강)
- 블록 ON/OFF + strength(-5~5) 개별 조절
- 프리셋 저장/불러오기/삭제 (localStorage)
- `🔍 Analyze` 버튼 — 워크플로우 실행 없이 즉시 분석
- `💾 Save Filtered` — 필터링된 LoRA를 **loras 폴더 하위**로 안전 저장 (path traversal 차단)
- 블록별 강도: 숫자 입력 + 슬라이더 + `‹`/`›` 0.05 미세조정 + `⟲` 개별 리셋 (모두 동기화)
- **초보자 모드**: 색 그라데이션(파랑→빨강) + 원클릭 자동 조절(🎯 핵심만 / ⚖️ 균형 / 🧹 약한블록 정리)
- **한/영 UI 토글** 🌐 (브라우저 언어 자동 감지, 선택 저장) — Bilingual KO/EN interface
- 카테고리: `✨ TJ_Node/Lora Analyzer` (신규)

> **💡 Idea credit / 아이디어 출처:** 블록 단위 LoRA 분석·필터링이라는 **아이디어**는
> [shootthesound/comfyUI-Realtime-Lora](https://github.com/shootthesound/comfyUI-Realtime-Lora)
> 에서 영감을 받았습니다. 해당 프로젝트에 감사드립니다. 🙏
> 본 노드는 **Krea2 LoRA 파일을 직접 분석해 처음부터 구현**한 것으로, 원 프로젝트의
> **코드를 복사하지 않았습니다** (Krea2 전용 32-블록 구조 + JS DOM UI + 전용 API).
> The **idea** of block-wise LoRA analysis/filtering was inspired by
> [comfyUI-Realtime-Lora](https://github.com/shootthesound/comfyUI-Realtime-Lora) —
> thank you. This node was **built from scratch** by analyzing Krea2 LoRA files
> directly and does **not** copy that project's code.

---

## ✨ New: Universal Calculator (TJ)

해상도(비율/메가픽셀)와 시간/프레임을 한 노드에서 양방향 계산하는 유틸리티 노드입니다.

Bidirectional resolution (aspect/megapixel) + time/frame calculator in one node.

- **`0 = 빈칸(자동)`** — 원하는 칸만 입력하면 나머지가 자동 계산 (예: `W 1080` + `2:3` → `H 1620`)
- 비율 정수 표시 (GCD 약분, 예: `1080 × 1620 (2:3)`)
- 시간/프레임도 동일 방식: `fps` 기준으로 seconds ↔ frame_count 자동 변환
- 실시간 요약 패널 (해상도 / 시간)
- 카테고리: `✨ TJ_Node/Utility`

---

## 🔧 LLM 개선 v2.3.0

- `Prompt Enhancer (TJ)` / `Prompt Studio (TJ)`: Qwen3.5 계열의 "Thinking Process" 노출 대응 — assistant prefill로 최종 프롬프트만 출력하도록 유도, `_strip_thinking_process_block()` 후처리 추가

---

# 🚀 What's New in v2.2.0

## ✨ New: Model Set Loader (TJ)

Model / Clip / VAE를 각각 개별 드롭다운으로 선택하여 CheckpointLoaderSimple처럼 한 노드에서 MODEL + CLIP + VAE를 한 번에 출력하는 신규 노드입니다.

Select Model, Clip, and VAE independently with individual dropdowns and output all three in a single node — just like CheckpointLoaderSimple.

- Model: `diffusion_models / unet / GGUF` 자동 감지 및 로더 선택
- Clip: `text_encoders / clip` + GGUF CLIP 자동 지원
- VAE: `vae` 폴더 목록
- `model_dtype` / `clip_dtype` 위젯으로 fp8/fp16/bf16 직접 선택 가능
- 각 슬롯 `[none]` 선택 시 해당 출력만 None 반환 (부분 연결 지원)
- **Auto Set** 내장 — MODEL ▶ / CLIP ▶ / VAE ▶ 출력이 Wireless Provider로 자동 등록
- 카테고리: `✨ TJ_Node/Loaders`

---

## ✨ TJ_Node/Loaders 카테고리 신설

`TJ_MultiModelSelecter`와 `TJ_ModelSetLoader` 두 노드를 기존 Utility에서 분리하여 전용 **Loaders** 카테고리로 이동했습니다.

---

## 🔧 Bug Fixes v2.2.0

| 파일 | 수정 내용 |
| --- | --- |
| `ltx2_sampler.py` | `_sampler_names()` 내 `nodes` NameError 수정 (Critical) |
| `flux2_klein.py` | `ImageScaleToTotalPixels`에 존재하지 않는 `resolution_steps` 파라미터 제거 |
| `flux2_klein.py` | BasicGuider fallback 시 콘솔 경고 출력 추가 (negative conditioning 무시됨 알림) |
| `scene_maker.py` | CLIPLoader type 하드코딩(`stable_diffusion`) 제거 → 실제 타입 목록 동적 탐색으로 교체 |
| `save_primary.py` | 파일명 카운터 파싱 `ValueError` 방지 try/except 추가 |
| `z_image_turbo.py` | LoRA 이름 목록 중복 항목 제거 |
| `go_stop_tj.py` | `timeout_sec` 파라미터 추가 — 사용자 설정 가능 타임아웃 (0=무제한, 기본값) |
| `multi_model_selecter.py` | `_connected_output_indices()` 최적화 활성화 — 연결된 슬롯만 로드, PROMPT 감지 실패 시 load_all fallback |

---

# 🚀 What's New in v2.0.1

TJ_NODE v2.x는 기존 Wireless Workflow Architecture를 유지하면서
LLM Workflow / Prompt Workflow / Cover Expansion Architecture 영역까지 확장되었습니다.

TJ_NODE v2.x expands the original wireless workflow architecture into:
LLM workflow systems, prompt workflow pipelines, and cover expansion architecture.

---

#스크린샷 : V2 WORKFLOW OVERVIEW

---

## ✨ Credits / Acknowledgements

Some TJ_NODE systems were rebuilt and extended based on concepts inspired by:

- TooBusy Nodes - 너무바쁜베짱이
  https://github.com/designloves2/toobusy<br>
  https://www.youtube.com/@%EB%84%88%EB%AC%B4%EB%B0%94%EC%81%9C%EB%B2%A0%EC%A7%B1%EC%9D%B4<br>

- comfyui-deno-custom-nodes
  https://github.com/Deno2026/comfyui-deno-custom-nodes<br>
  https://www.youtube.com/@Denoise-AI<br>
  
- RebelsPromptEnhancer node
  https://github.com/designloves2/RebelsPromptEnhancer<br>
  https://www.youtube.com/@realrebelai<br>

- comfyUI-Realtime-Lora — shootthesound
  https://github.com/shootthesound/comfyUI-Realtime-Lora<br>
  Krea2 LoRA Analyzer (TJ)의 **블록 단위 분석·필터링 아이디어**에 영감을 준 프로젝트입니다.
  코드는 복사하지 않았으며, Krea2 전용으로 직접 분석·구현했습니다. 감사합니다. 🙏<br>
  Inspired the **idea** of block-wise LoRA analysis in Krea2 LoRA Analyzer (TJ).
  No code was copied — built from scratch for Krea2. Thank you.<br>

  

Several nodes were heavily reworked and integrated into the TJ wireless workflow architecture.

---
## ✨ Prompt Studio (TJ)

Prompt Studio (TJ)는 TJ_NODE v2.x의 통합 LLM Prompt Workflow Node입니다.
Unified LLM prompt workflow node for TJ_NODE v2.x.

---

지원 모드:
Supported Modes:

* Auto
* Prompt Enhancer
* Image to Prompt

---

핵심 기능:
Core Features:

* Automatic Image Detection
* Unified Prompt Workflow UI
* GGUF / llama.cpp backend support
* ComfyUI TextGenerate backend support
* Embedded Workflow Architecture
* Prompt Enhancement Workflow
* Image-based Prompt Generation

---

추가 기능:
Additional Features:

* Prompt Enhancer 모드 세로 크기 기억
* Image to Prompt 모드 자동 높이 리셋 유지
* 가로 크기 공통 유지 구조

---

#스크린샷 : PROMPT STUDIO
#스크린샷 : IMAGE TO PROMPT

---

## ✨ Prompt Show & Locker (TJ)

STRING 기반 Prompt Inspect / Lock Workflow Node입니다.
STRING-based prompt inspection and lock workflow node.

---

핵심 기능:
Core Features:

* Prompt Visualization
* Copy Button Animation
* PAUSED Status UI
* Stable Resize Lifecycle
* TJ Theme Integration
* Embedded Workflow Support

---

Copy 버튼 UX:

```text id="tjpsl1"
Copy
 ↓
Copied
 ↓
Auto Restore
```

---

#스크린샷 : PROMPT SHOW LOCKER

---

## ✨ Scene Maker (TJ)

Visual Beat 기반 Prompt Workflow Architecture Node입니다.
Visual Beat-based prompt workflow architecture node.

---

지원 기능:
Supported Features:

* Embedded Get/Set
* Auto Set
* Translate Workflow
* Clip Override
* Visual Beat Reuse
* Guide / Summary Refresh

---

지원 언어:
Supported Languages:

* KO
* EN
* JP
* CN

---

#스크린샷 : SCENE MAKER

---

## ✨ Z-Image Turbo (TJ)

Prompt-driven Turbo Workflow Architecture Node입니다.
Prompt-driven turbo workflow architecture node.

---

핵심 기능:
Core Features:

* Embedded Get/Set
* Auto Set
* Global Prompt Input
* Positive / Negative Hide
* Compact Preview Architecture
* Reload-safe Preview Lifecycle
* Textarea Resize Support

---

#스크린샷 : Z IMAGE TURBO

---

## ✨ LLM Workflow Layer

TJ_NODE v2.x는 신규 LLM Workflow Layer를 제공합니다.
TJ_NODE v2.x introduces a dedicated LLM workflow layer.

---

신규 CATEGORY:
New CATEGORY:

```python id="tjllm1"
CATEGORY = " ✨ TJ_Node/LLM"
```

---

지원 노드:
Supported Nodes:

* Prompt Studio (TJ)
* Prompt Enhancer (TJ)
* Image to Prompt (TJ)
* Prompt Show & Locker (TJ)

---

#스크린샷 : LLM WORKFLOW

---

## ✨ Cover Expansion System

TJ Cover System은 외부 노드를 TJ Workflow 구조로 확장합니다.
TJ Cover System expands external nodes into TJ workflow architecture.

---

핵심 기능:
Core Features:

* Embedded Get/Set
* TJ Theme Injection
* Widget Reorder
* Output Label Sync
* Auto Set Extension
* External Node Expansion

---

원본 노드를 직접 수정하지 않는 구조입니다.
The original nodes remain untouched.

---

#스크린샷 : COVER SYSTEM

---

## ✨ Smart Converter (TJ) Expansion

Smart Converter (TJ)는 v2.x에서 더욱 확장되었습니다.
Smart Converter (TJ) has been expanded in v2.x.

---

추가 지원 타입:
Additional Supported Types:

* BOOLEAN
* LIST
* DICT
* JSON

---

추가 기능:
Additional Features:

* Strict Mode
* Safe Fallback Workflow
* Status Output
* Dynamic Conversion Lifecycle

---

#스크린샷 : SMART CONVERTER V2

---

## ✨ VHS Hotkey Remote Expansion

TJ VHS Hotkey Remote 기능이 확장되었습니다.
TJ VHS Hotkey Remote has been expanded.

---

추가 기능:
Additional Features:

* Sync Preview
* Improved Pause / Play Workflow
* Stable Keyboard Control Lifecycle
* VHS Preview Utility Expansion

---

#스크린샷 : VHS REMOTE V2

---

## ✨ Reload-safe Lifecycle Expansion

TJ_NODE v2.x는 reconnect lifecycle 구조를 더욱 강화했습니다.
TJ_NODE v2.x further improves reconnect lifecycle architecture.

---

안정화 대상:
Stabilized Systems:

* Show Any (TJ)
* Prompt Studio (TJ)
* Scene Maker (TJ)
* Z-Image Turbo (TJ)
* Eclipse Bridge Workflow

---

핵심 기능:
Core Features:

* Wireless Reconnect
* Fake-Wire Rebuild
* Provider Survival
* Ghost Cleanup
* Dynamic Provider Refresh
* Cover Lifecycle Sync

---

#스크린샷 : LIFECYCLE V2

---
# 🚀 v1.0 Major Features

| Feature                   | Description                     |
| ------------------------- | ------------------------------- |
| Wireless Fake-Wire System | 숨겨진 Wireless Routing 시스템  |
| Embedded Get System       | 일반 노드 내부 Wireless Receive |
| Multi Router Architecture | Section 기반 Workflow 분리      |
| Realtime Hover Wire       | Hover 기반 Hidden Wire 표시     |
| Preview Lifecycle         | Reload-safe Preview Restore     |
| Save Pipeline System      | 구조적 Save Chain Architecture  |
| Batch Workflow System     | Dynamic Batch & Routing         |
| Eclipse Bridge            | Eclipse Workflow Compatibility  |
| HTML5 Overlay UI          | Advanced Interactive UI Layer   |
| Reload-Safe Lifecycle     | Provider Reconnect & Restore    |

---

#스크린샷 : v1.0 FEATURE OVERVIEW

---

# ✨ Wireless Workflow Architecture

TJ_NODE의 핵심은 Wireless Workflow Architecture입니다.
The core of TJ_NODE is Wireless Workflow Architecture.

TJ_NODE는 긴 Visible Wire 대신 Fake-Wire 구조를 사용합니다.
TJ_NODE replaces massive visible wires using Fake-Wire architecture.

---

기존 방식:
Traditional Workflow:

```text id="iw01r0"
Load Image
 └────────────────────────────→ KSampler
```

---

TJ Workflow 방식:
TJ Workflow Style:

```text id="s8j7df"
Load Image
 → Set Node

KSampler
 ← Get Node
```

---

실제 연결은 유지되지만 시각적으로는 숨겨집니다.
The logical connection remains intact while being visually hidden.

이를 통해:
This allows:

* Cleaner Workflow
* Better Readability
* Easier Maintenance
* Section Modularization
* Reduced Wire Clutter

---

#스크린샷 : FAKE WIRE STRUCTURE
#스크린샷 : HOVER WIRE VIEW

---

# ✨ Embedded Get System

TJ_NODE의 핵심 기능 중 하나는 Embedded Get System입니다.
One of TJ_NODE's core features is the Embedded Get System.

이제 별도의 Get Node를 반복 배치할 필요 없이 일반 노드 내부에서 직접 Wireless Receive 가능합니다.
Data can now be received directly inside nodes without placing standalone Get nodes everywhere.

---

지원 노드:
Supported Nodes:

* Save & Preview Image (TJ)
* Save & Preview Video (TJ)
* Smart Show (TJ)
* Prompt Text (TJ)
* Batch to Multi Image Output (TJ)

---

장점:
Benefits:

* Reduced Node Count
* Cleaner Workflow
* Local Wireless Receive
* Better Workflow Readability
* Easier Maintenance

---

#스크린샷 : EMBEDDED GET EXAMPLE

---

# ✨ Multi Router Architecture

Multi Router는 TJ Workflow Architecture의 핵심 노드입니다.
Multi Router is one of the most important nodes in TJ Workflow Architecture.

---

핵심 역할:
Core Roles:

* Workflow Branch Separation
* Section Modularization
* Auto Set Provider Generation
* Wireless Branch Routing

---

추천 구조:
Recommended Structure:

```text id="32q76m"
Generation
 ↓
Multi Router
 ├─ Preview
 ├─ Upscale
 ├─ Compare
 └─ Save
```

---

Auto Set ON 시 각 Output은 자동 Wireless Provider가 됩니다.
When Auto Set is enabled, each output automatically becomes a wireless provider.

---

#스크린샷 : MULTI ROUTER WORKFLOW

---

# 🛠 Wireless Routing System

TJ_NODE의 핵심 시스템입니다.
This is the core system of TJ_NODE.

TJ Workflow Architecture의 중심 역할을 수행합니다.
It acts as the foundation of TJ Workflow Architecture.

---

## ✨ Set Node (TJ)

Wireless Provider 생성 노드입니다.
Wireless Provider creation node.

Workflow 내부에서 데이터를 무선으로 송신하기 위한 Provider 역할을 수행합니다.
Acts as a wireless provider for transmitting workflow data.

---

핵심 기능:
Core Features:

* Wireless Provider Registration
* Fake-Wire Routing
* Reload-safe Provider Restore
* Dynamic Provider Lifecycle

---

추천 사용:
Recommended Usage:

* IMAGE Routing
* Prompt Routing
* Model Routing
* Section Architecture

---

#스크린샷 : SET NODE

---

## ✨ Get Node (TJ)

Wireless Receive 노드입니다.
Wireless receive node.

Set Node의 Provider를 수신하여 긴 Visible Wire 없이 데이터를 받을 수 있습니다.
Receives providers from Set Nodes without long visible wires.

---

핵심 기능:
Core Features:

* Wireless Receive
* Fake-Wire Connection
* Hover Wire Preview
* Eclipse Provider Compatibility

---

#스크린샷 : GET NODE

---

## ✨ Multi Get Node (TJ)

여러 Wireless Provider를 동시에 수신하는 통합 Receive 노드입니다.
Integrated receiver node for multiple wireless providers.

대규모 Workflow Module 구성에 매우 중요합니다.
Very important for large-scale workflow modularization.

---

지원 기능:
Features:

* Multiple Provider Receive
* Reorder UI
* Compact Slot Structure
* Module Architecture

---

#스크린샷 : MULTI GET

---

## ✨ Multi Router (TJ)

TJ Workflow Architecture의 핵심 Branch 시스템입니다.
Core branching system of TJ Workflow Architecture.

Workflow를 Section 기반으로 분리하기 위해 사용됩니다.
Used to separate workflows into modular sections.

---

핵심 기능:
Core Features:

* Workflow Branch Separation
* Auto Set Provider Generation
* Wireless Branch Routing
* Section Modularization

---

#스크린샷 : MULTI ROUTER

---

# 🛠 Batch Workflow System

TJ_NODE의 Batch Workflow System은 단순 Batch 처리 노드 모음이 아닙니다.
TJ_NODE's Batch Workflow System is not just a collection of batch utility nodes.

대규모 Workflow를 구조적으로 운영하기 위한 Architecture Layer입니다.
It is an architecture layer designed for structurally managing large-scale workflows.

---

지원 기능:
Core Features:

* Dynamic Batch Processing
* Resolution Normalize
* Metadata Preservation
* Drag Reorder
* Thumbnail Grid
* Auto Set Routing
* Eclipse Metadata Sync

---

#스크린샷 : BATCH WORKFLOW SYSTEM

---

## ✨ Multi Image Loader (TJ)

TJ Workflow의 핵심 입력 허브입니다.
Core input hub of TJ Workflow.

단순 이미지 로더가 아니라:
It is not just an image loader.

* Image Stack Manager
* Batch Generator
* Resolution Manager
* Metadata Sync System
* Wireless Provider Source

역할을 동시에 수행합니다.
It simultaneously acts as all of the above systems.

---

핵심 기능:
Core Features:

* Drag & Drop Image Load
* Thumbnail Grid
* URL Download
* Drag Reorder
* Resolution Normalize
* Batch Tensor Generation
* Auto Set Provider

---

지원 Resize 모드:
Supported Resize Modes:

* None
* Long Edge
* Short Edge
* Custom
* Megapixel

---

Auto Set 활성화 시 다음 Provider를 자동 생성합니다.
When Auto Set is enabled, the following providers are automatically generated.

```text id="8i0h4l"
TJ / BATCH
TJ / WIDTH
TJ / HEIGHT
```

---

추천 사용:
Recommended Usage:

* Dataset Workflow
* Image Generation Pipeline
* ControlNet Batch
* Style Transfer Workflow
* Multi Image Compare
* Large Batch Processing

---

#스크린샷 : MULTI IMAGE LOADER
#스크린샷 : THUMBNAIL GRID
#스크린샷 : URL DOWNLOAD

---

## ✨ Dynamic Image Batch (TJ)

동적 IMAGE Batch 생성 노드입니다.
Dynamic IMAGE batch generation node.

Workflow 상태에 따라 유동적으로 Batch를 구성할 수 있습니다.
Allows workflows to dynamically construct image batches.

---

핵심 기능:
Core Features:

* Dynamic Batch Generation
* Image Grouping
* Workflow Distribution
* Batch Scaling

---

추천 사용:
Recommended Usage:

* Image Variation Workflow
* Multi Prompt Generation
* Iterative Processing
* Grouped Upscale Pipeline

---

#스크린샷 : DYNAMIC IMAGE BATCH

---

## ✨ Dynamic Image Batch (Eclipse-TJ)

Eclipse Workflow와 호환되는 Metadata 기반 Batch 시스템입니다.
Metadata-aware batch system compatible with Eclipse workflows.

---

핵심 기능:
Core Features:

* IMAGE + FILES Pair Sync
* Original File Metadata
* Original Path Tracking
* Eclipse Save Sync
* Metadata Preservation

---

일반 Batch 시스템과 달리 원본 파일 구조를 유지합니다.
Unlike normal batch systems, original file structures are preserved.

---

추천 사용:
Recommended Usage:

* Large Dataset Workflow
* Eclipse Workflow
* Metadata-based Pipeline
* Original Path Tracking

---

#스크린샷 : ECLIPSE BATCH

---

## ✨ Batch to Multi Image Output (TJ)

IMAGE Batch를 최대 64개의 IMAGE Output으로 분리합니다.
Splits IMAGE batches into up to 64 IMAGE outputs.

---

핵심 기능:
Core Features:

* Batch Split
* Multi Branch Workflow
* Individual Image Routing
* Embedded Get Support

---

추천 사용:
Recommended Usage:

* Selective Upscale
* Compare Workflow
* Multi Save Pipeline
* Branch Processing
* Image Ranking

---

#스크린샷 : BATCH SPLIT

---

# 🛠 Preview / Utility System

TJ Preview System은 단순 Preview Node가 아닙니다.
TJ Preview System is not just another preview node system.

TJ Workflow의 Visualization & Inspection Layer 역할을 수행합니다.
It acts as the visualization and inspection layer of TJ Workflow.

---

지원 기능:
Core Features:

* Fullscreen Preview
* Snapshot System
* Batch Viewer
* Reload Restore
* HTML5 Video Playback
* Audio Controller
* Interactive Overlay UI

---

#스크린샷 : PREVIEW SYSTEM

---

## ✨ Save & Preview Image (TJ)

이미지 저장과 Preview를 통합한 Unified Preview Node입니다.
Unified preview node combining image saving and preview systems.

---

핵심 기능:
Core Features:

* In-node Preview
* Fullscreen Viewer
* Smart Grid
* Snapshot Preview
* Keyboard Navigation
* Embedded Get
* Save Pipeline Support

---

지원 기능:
Supported Features:

| Feature           | Description               |
| ----------------- | ------------------------- |
| Fullscreen Viewer | 확대 이미지 검사          |
| Smart Grid        | Batch Grid Preview        |
| Snapshot System   | Preview Checkpoint        |
| Keyboard Control  | ← → ESC Navigation        |
| Embedded Get      | Wireless Receive          |
| Reload Restore    | Preview Lifecycle Restore |

---

추천 사용:
Recommended Usage:

* Generation Preview
* Upscale Compare
* Final Output Inspection
* Workflow Checkpoint

---

#스크린샷 : SAVE PREVIEW IMAGE
#스크린샷 : FULLSCREEN VIEWER

---

## ✨ Save & Preview Video (TJ)

Video Workflow용 통합 Preview 시스템입니다.
Integrated preview system for video workflows.

---

핵심 기능:
Core Features:

* IMAGE Batch Playback
* Video Decode
* Audio Mux
* HTML5 Video Player
* Audio Controller
* Reload-safe Preview Restore

---

지원 기능:
Supported Features:

* MP4 Decode
* Frame Preview
* Audio Only Mode
* Dual Audio Controller
* Playback Restore
* Video Snapshot

---

추천 사용:
Recommended Usage:

* Animation Workflow
* VFI Pipeline
* Frame Inspection
* Video Preview
* Audio Sync Workflow

---

#스크린샷 : VIDEO PREVIEW
#스크린샷 : VIDEO PLAYER

---

## ✨ Smart Show (TJ)

TJ_NODE의 Universal Debug Viewer입니다.
Universal debug viewer of TJ_NODE.

---

자동으로 데이터 타입을 분석하고 표시합니다.
Automatically detects and visualizes workflow data types.

지원 타입:
Supported Types:

* IMAGE
* STRING
* FLOAT
* INT
* JSON
* LIST
* VIDEO
* AUDIO

---

핵심 기능:
Core Features:

* Automatic Type Detection
* Text Viewer
* Media Viewer
* JSON Inspector
* Wireless Receive
* Embedded Get

---

추천 사용:
Recommended Usage:

* Workflow Debug
* Metadata Inspect
* Prompt Inspect
* JSON Visualization
* Audio/Video Check

---

#스크린샷 : SMART SHOW

---

## ✨ Prompt Text (TJ)

Workflow용 Modular Prompt Architecture Node입니다.
Modular prompt architecture node for workflows.

---

긴 Text Wire 없이 Prompt를 구조적으로 관리할 수 있습니다.
Allows structured prompt management without giant text wires.

---

핵심 기능:
Core Features:

* Embedded Get
* Prompt Reuse
* Wireless Prompt Routing
* Prompt Block Architecture

---

추천 사용:
Recommended Usage:

* Character Prompt
* Style Prompt
* Camera Prompt
* Lighting Prompt
* Reusable Prompt Blocks

---

#스크린샷 : PROMPT TEXT

---

## ✨ Text Concatenate (TJ)

Dynamic Text Combine Node입니다.
Dynamic text combination node.

---

여러 Prompt Block을 결합하여 최종 Prompt를 생성합니다.
Combines multiple prompt blocks into final prompts.

---

핵심 기능:
Core Features:

* Dynamic Inputs
* Custom Delimiter
* Multi Prompt Merge
* Scalable Text Combine

---

추천 사용:
Recommended Usage:

* Character + Style Prompt
* Camera + Lighting Prompt
* Modular Prompt Pipeline
* Prompt Layer Architecture

---

#스크린샷 : TEXT CONCATENATE

---

## ✨ Go & Stop (TJ)

Workflow 실행 중 사용자가 직접 계속(Go) 또는 중단(Stop)을 선택할 수 있는 수동 게이트 노드입니다.
Manual gate node allowing users to continue (Go) or abort (Stop) mid-workflow.

---

핵심 기능:
Core Features:

* ANY 타입 Pass-through
* Go / Stop 버튼 (UI 오버레이)
* Sound Notice (알림음 지원)
* `timeout_sec` 위젯 — 사용자 설정 가능한 최대 대기 시간 (0=무제한)
* 타임아웃 초과 시 자동 Stop 처리

---

주의:
Note:

ComfyUI 실행 스레드를 점유하는 구조이므로 타임아웃 설정을 권장합니다.
Since this occupies the ComfyUI execution thread, setting a timeout is strongly recommended.

---

추천 사용:
Recommended Usage:

* Intermediate Result Inspection
* Human-in-the-loop Workflow
* Conditional Generation Gate
* Manual Quality Control Checkpoint

---

#스크린샷 : GO STOP NODE

---

# 🛠 Loaders System

TJ_NODE Loaders는 Model / Clip / VAE 로딩을 더 유연하고 구조적으로 운영하기 위한 노드 그룹입니다.
TJ_NODE Loaders is a node group for flexible and structured loading of Model, Clip, and VAE assets.

카테고리: `✨ TJ_Node/Loaders`

---

## ✨ Model Set Loader (TJ)

Model / Clip / VAE를 각각 개별 드롭다운으로 선택하여 CheckpointLoaderSimple처럼 한 노드에서 MODEL + CLIP + VAE를 한 번에 출력합니다.

Select Model, Clip, and VAE independently but output all three together — just like CheckpointLoaderSimple.

---

입력 위젯:
Input Widgets:

| 위젯 | 설명 |
| --- | --- |
| `auto_set` | Auto Set ON/OFF — 출력 슬롯을 Wireless Provider로 자동 등록 |
| `model_name` | diffusion_models / unet / GGUF 모델 선택 |
| `model_dtype` | UNETLoader weight_dtype (default / fp8_e4m3fn / fp8_e5m2 / fp16 / bf16) |
| `clip_name` | text_encoders / clip 파일 선택 |
| `clip_type` | CLIPLoader type (아키텍처 타입 — ComfyUI에서 동적으로 탐색) |
| `clip_dtype` | CLIPLoader weight_dtype |
| `vae_name` | vae 폴더 파일 선택 |

---

출력:
Outputs:

* MODEL
* CLIP
* VAE

---

핵심 특징:
Key Features:

* GGUF 파일 자동 감지 → `UnetLoaderGGUF` / `CLIPLoaderGGUF` 자동 전환
* 각 슬롯 `[none]` 선택 시 해당 출력만 None 반환 (부분 연결 가능)
* CLIPLoader type 동적 탐색 — 하드코딩 없음
* Auto Set ON 시: `{이름}/MODEL ▶`, `{이름}/CLIP ▶`, `{이름}/VAE ▶` Wireless Provider 자동 생성

---

추천 사용:
Recommended Usage:

* Flux / SDXL / SD3 분리 모델 로딩
* GGUF 모델 + text encoder 조합
* 공통 VAE 공유 Workflow
* Wireless Model Routing

---

#스크린샷 : MODEL SET LOADER

---

## ✨ Multi Model Selecter (TJ)

최대 64개 슬롯의 동적 모델 선택기입니다. Model / Checkpoint / Clip / VAE를 동적 슬롯 구조로 선택하고 출력합니다.
Dynamic model selector with up to 64 slots. Supports Model, Checkpoint, Clip, and VAE selection with dynamic slot management.

---

지원 Select Type:
Supported Select Types:

* Model (diffusion_models / unet / GGUF)
* Checkpoints (MODEL + CLIP + VAE 3출력)
* Clip (text_encoders / clip)
* VAE

---

출력 모드:
Output Modes:

| 모드 | 설명 |
| --- | --- |
| Model Direct out | 모델 객체를 직접 출력 (각 슬롯 = 1 출력) |
| Model Path out | 모델 파일 경로를 STRING으로 출력 |

---

핵심 기능:
Core Features:

* Dynamic Slot Management (JS 기반 동적 슬롯 추가/제거)
* 연결된 출력 슬롯만 선택적 로드 (PROMPT 기반 최적화)
* PROMPT 감지 실패 시 전체 로드 fallback
* Auto Set 내장 — 각 출력 슬롯 Wireless Provider 자동 등록
* Clip type 슬롯별 개별 지정 지원

---

추천 사용:
Recommended Usage:

* Multi Model A/B Compare Workflow
* Dynamic Model Switch
* Batch Model Test
* Model Path Routing

---

#스크린샷 : MULTI MODEL SELECTER

---

## ✨ Show Any (TJ)

Lightweight universal workflow inspection node.
경량 Universal Workflow Inspect Node입니다.

---

Show Any는 다양한 타입의 데이터를 안전하게 펼쳐서 표시하면서 원본 값을 그대로 통과시키는 Debug / Monitor Node입니다.
Show Any safely visualizes workflow data while preserving the original passthrough output.

---

지원 타입:
Supported Types:

* STRING
* INT / FLOAT
* LIST
* JSON / DICT
* TENSOR
* PYTHON OBJECT

---

핵심 기능:
Core Features:

* Universal ANY Input
* Original Passthrough Output
* Tensor Summary
* JSON-safe Display
* Copy Button
* Embedded Get
* Wireless Provider Support

---

추천 사용:
Recommended Usage:

* Workflow Debug
* Tensor Inspection
* Metadata Visualization
* Wireless Provider Inspect
* Smart Converter Status Check

---

#스크린샷 : SHOW ANY
#스크린샷 : SHOW ANY TENSOR SUMMARY

---

## ✨ Smart Converter (TJ)

Universal Type Conversion Node입니다.
Universal type conversion utility node.

---

ANY 입력을 다양한 타입으로 안전하게 변환합니다.
Safely converts ANY input into multiple workflow data types.

---

지원 타입:
Supported Types:

* AUTO
* INT
* FLOAT
* STRING
* BOOLEAN
* TENSOR
* LIST
* DICT
* JSON

---

핵심 기능:
Core Features:

* Dynamic Output Type
* Status Output
* Strict Mode
* Embedded Get
* Wireless Conversion Workflow

---

strict_mode OFF 상태에서는 변환 실패 시 기본값과 WARN status를 반환합니다.
When strict_mode is OFF, conversion failures return fallback values with WARN status output.

---

추천 사용:
Recommended Usage:

* String → Number Conversion
* Tensor Scalar Conversion
* Metadata → JSON
* Wireless Type Correction
* Boolean Workflow Control

---

#스크린샷 : SMART CONVERTER
#스크린샷 : SMART CONVERTER STATUS

---

## ✨ Shortcut Launcher (TJ)

Workflow 내부에서 폴더, 파일, URL을 즉시 실행하는 Utility Launcher Node입니다.
Utility launcher node for opening folders, files, and URLs directly inside workflows.

---

핵심 기능:
Core Features:

* Multi Shortcut Buttons
* Folder / File Launch
* URL Launch
* JSON Export / Import
* Color Preset
* Tooltip Support
* Settings Modal

---

추천 사용:
Recommended Usage:

* Output Folder Launch
* Custom Node Folder
* GitHub Repository
* Civitai Upload Page
* Workflow Asset Folder
* Documentation Shortcut

---

#스크린샷 : SHORTCUT LAUNCHER
#스크린샷 : SHORTCUT SETTINGS

---

## ✨ VHS Hotkey Remote (Utility Extension)

TJ VHS Hotkey Remote는 일반 노드가 아닙니다.
TJ VHS Hotkey Remote is NOT a standard node.

---

VideoHelperSuite(VHS) preview를 키보드 단축키로 직접 제어하는 Global Utility Extension입니다.
A global utility extension for controlling VideoHelperSuite previews using keyboard shortcuts.

---

설치 위치:
Installation Path:

```text
ComfyUI/custom_nodes/ComfyUI-TJ_NODE/web/js/
```

파일명:
Filename:

```text
tj_vhs_hotkey_remote.js
```

---

지원 단축키:
Supported Shortcuts:

| Shortcut | Function           |
| -------- | ------------------ |
| Space    | Pause / Play       |
| Alt + H  | Preview Hide       |
| Alt + M  | Mute               |
| Alt + O  | Open in Browser    |
| Alt + S  | Save Preview       |
| Alt + C  | Copy Original Path |
| Alt + Y  | Sync Preview       |

---

동작 방식:
Behavior:

```text
Select VHS Preview Node
 ↓
Press Shortcut
 ↓
Instant Preview Control
```

---

추천 사용:
Recommended Usage:

* Animation Inspection
* Frame Compare
* VFI Workflow
* Interpolation Workflow
* Rapid Preview Control

---

필요 없으면 단순히 JS 파일만 삭제하면 됩니다.
Can be removed simply by deleting the JS file.

---

#스크린샷 : VHS HOTKEY REMOTE
#스크린샷 : VHS SHORTCUT CONTROL


# 🛠 Save Pipeline System

TJ Save Pipeline은 단순 Save Node 구조가 아닙니다.
TJ Save Pipeline is not just another save node structure.

Workflow 결과를 구조적으로 유지하기 위한 Result Management Architecture입니다.
It is a result management architecture for structurally organizing workflow outputs.

---

#스크린샷 : SAVE PIPELINE SYSTEM

---

## ✨ Save Image (Primary-TJ)

TJ Save Pipeline의 기준 Save Node입니다.
Primary save node of TJ Save Pipeline.

---

핵심 역할:
Core Roles:

* Base Save Path Creation
* Save Context Generation
* Filename Structure Management
* Downstream Save Sync

---

지원 기능:
Core Features:

* Save Context Lifecycle
* Filename Prefix
* Collision Handling
* Metadata Save Structure

---

추천 사용:
Recommended Usage:

* Main Result Save
* Generation Base Save
* Workflow Save Start Point

---

#스크린샷 : PRIMARY SAVE

---

## ✨ Save Image (Suffix-TJ)

Primary Save Context를 이어받아 후속 결과를 저장합니다.
Stores downstream results using inherited Primary Save Context.

---

핵심 기능:
Core Features:

* Suffix Save Chain
* Result Grouping
* Save Context Sync
* Filename Consistency

---

추천 사용:
Recommended Usage:

* Upscale Result
* Detail Pass
* Compare Output
* Mask Save
* Workflow Variations

---

예시 구조:
Example Structure:

```text id="abgwx3"
main.png
main_upscale.png
main_detail.png
main_compare.png
```

---

#스크린샷 : SUFFIX SAVE

---

## ✨ Save Image (Eclipse Suffix-TJ)

Eclipse Metadata 기반 Save Pipeline입니다.
Eclipse metadata-based save pipeline.

---

원본 파일 구조를 유지하면서 후속 결과를 저장합니다.
Preserves original file structures while saving downstream results.

---

핵심 기능:
Core Features:

* Original Path Tracking
* Eclipse Metadata Sync
* Relative Path Restore
* Metadata Save Chain

---

추천 사용:
Recommended Usage:

* Eclipse Workflow
* Dataset Pipeline
* Metadata Tracking Workflow
* Original Structure Preservation

---

#스크린샷 : ECLIPSE SAVE PIPELINE

---

# ✨ Workflow Architecture Strategy

TJ_NODE의 핵심은 단순 Node 기능이 아닙니다.
The core of TJ_NODE is not individual node functionality.

핵심은 Workflow Architecture입니다.
The real core is Workflow Architecture.

---

TJ Workflow의 핵심 철학은 다음과 같습니다.
The core philosophy of TJ Workflow is:

```text id="0upn18"
Maintainable Workflow Architecture
```

---

TJ Workflow에서는 다음 구조를 권장합니다.
TJ Workflow recommends the following structure.

```text id="1wjlwm"
INPUT
 ↓
GENERATION
 ↓
EDIT
 ↓
UPSCALE
 ↓
PREVIEW
 ↓
SAVE
```

---

각 Section 내부는 짧은 Wire를 사용합니다.
Short wires are used inside each section.

Section 간 연결은 Wireless Routing을 사용합니다.
Wireless routing is used between sections.

---

핵심 구조:
Core Strategy:

```text id="y6i2ep"
Short Wires Inside Sections
Wireless Routing Between Sections
```

---

#스크린샷 : SECTION WORKFLOW

---

# ✨ Recommended Workflow Design

TJ Workflow에서는 다음 전략을 추천합니다.
TJ Workflow recommends the following workflow strategies.

---

## ✅ Recommended

### Embedded Get 적극 사용

Heavy usage of Embedded Get

긴 Visible Wire 대신 Local Wireless Receive를 권장합니다.
Use local wireless receive instead of giant visible wires.

---

### Section Architecture 사용

Use Section Architecture

Workflow를 기능 단위로 분리하는 것을 권장합니다.
Split workflows into functional sections.

---

### Multi Router 중심 구조

Multi Router-centered Structure

Workflow Branch를 구조적으로 분리합니다.
Structurally separate workflow branches.

---

### Save Chain 유지

Maintain Save Chain

Workflow 결과를 그룹 단위로 유지합니다.
Keep workflow outputs grouped structurally.

---

### Stable Provider Naming 사용

Use Stable Provider Naming

Provider 이름은 Routing Map 역할을 수행합니다.
Provider names act as routing maps.

---

#스크린샷 : RECOMMENDED ARCHITECTURE

---

# ❌ Anti-Patterns

TJ Workflow에서는 다음 구조를 비추천합니다.
TJ Workflow strongly discourages the following structures.

---

## Giant Visible Wire

Workflow 전체를 가로지르는 긴 Wire 구조.
Massive visible wires crossing the entire workflow.

---

## Duplicate Provider Names

```text id="2h7uhs"
MAIN_IMAGE
MAIN_IMAGE
MAIN_IMAGE
```

중복 Provider는 Reconnect 문제를 발생시킵니다.
Duplicate providers can cause reconnect instability.

---

## Random Naming

```text id="t3f6u4"
test
aaa
temp
123
```

의미 없는 이름은 Workflow 유지보수를 어렵게 만듭니다.
Meaningless naming makes workflow maintenance difficult.

---

## Random Save Structure

무작위 Save Node 사용 구조.
Chaotic save node usage.

결과 추적이 거의 불가능해집니다.
Makes result tracking extremely difficult.

---

## Giant Chaos Workflow

Section 구조 없이 모든 노드를 하나의 영역에 배치하는 방식.
Placing all nodes in one giant unstructured workflow.

---

#스크린샷 : ANTI PATTERN WORKFLOW

---

# ✨ Reload-Safe Workflow Architecture

TJ_NODE는 Reload-safe Workflow를 매우 중요하게 설계합니다.
TJ_NODE is heavily designed around reload-safe workflow architecture.

---

지원 기능:
Core Features:

* Wireless Reconnect
* Provider Restore
* Fake-Wire Rebuild
* Preview Restore
* Save Context Restore
* Embedded Get Reconnect

---

추천 전략:
Recommended Strategy:

✅ Stable Provider Naming
✅ Auto Set Structure
✅ Save Chain Consistency
✅ Frequent Workflow Save

---

비추천:
Avoid:

❌ Random Provider Rename
❌ Duplicate Providers
❌ Unstable Dynamic Branches

---

#스크린샷 : RELOAD SAFE SYSTEM

---

# ✨ Preview Lifecycle Architecture

TJ Preview는 단순 Preview Node가 아닙니다.
TJ Preview is not just a preview node system.

TJ Preview는 Workflow Inspection Architecture입니다.
TJ Preview behaves as workflow inspection architecture.

---

관리되는 상태:
Managed States:

* Preview Image
* Snapshot State
* Fullscreen State
* Grid Layout
* Reload Metadata

---

핵심 기능:
Core Features:

* Snapshot Preview
* Reload-safe Restore
* Batch Grid
* Fullscreen Viewer
* Video Playback
* Audio Controller

---

TJ Preview Copy는 Live Mirror가 아닙니다.
TJ Preview Copy is NOT a live mirror.

현재 상태를 Snapshot 형태로 보존합니다.
It preserves workflow states as snapshots.

---

추천 사용:
Recommended Usage:

* Compare Workflow
* Workflow Checkpoints
* Result Tracking
* Debug Snapshot
* Before/After Comparison

---

#스크린샷 : SNAPSHOT SYSTEM
#스크린샷 : PREVIEW RESTORE

---

# ✨ Wireless Lifecycle System

TJ Wireless System은 단순 연결 시스템이 아닙니다.
TJ Wireless System is not a simple connection system.

내부적으로 Wireless Lifecycle Architecture를 사용합니다.
Internally, it uses a Wireless Lifecycle Architecture.

---

관리 기능:
Managed Systems:

* Provider Registry
* Wireless Reconnect
* Fake-Wire Sync
* Cleanup
* Reload Restore
* Dynamic Provider Refresh

---

Get Node와 Embedded Get는 동일한 Lifecycle 위에서 동작합니다.
Get Nodes and Embedded Get run on the same wireless lifecycle system.

---

핵심 기능:
Core Features:

* Dynamic Provider Detection
* Invalid Provider Cleanup
* Ghost Wire Cleanup
* Hover Wire Sync
* Realtime Registry Refresh

---

#스크린샷 : PROVIDER REGISTRY
#스크린샷 : WIRELESS LIFECYCLE

---

# ✨ Context Menu Features

TJ_NODE는 다양한 Workflow Utility Menu를 제공합니다.
TJ_NODE provides various workflow utility menus.

---

지원 메뉴:
Supported Menus:

```text id="j2vl0g"
TJ Node
 ├─ Refresh ALL Get Nodes
 ├─ Realtime Wires View Mode
 ├─ Show ALL Wires
 ├─ Properties
 └─ Properties Panel
```

---

## Refresh ALL Get Nodes

Provider 리스트를 재구성합니다.
Rebuilds provider lists.

추천 사용:
Recommended Usage:

* Provider Rename
* Reload Issues
* Eclipse Sync Problems
* Invalid Get List

---

## Realtime Wires View Mode

Hover 시에만 Hidden Wire를 표시합니다.
Displays hidden wires only during hover.

---

추천 설정:
Recommended Setting:

```text id="kl8q5d"
Realtime Wires View Mode = ON
Show ALL Wires = OFF
```

---

이 설정이 가장 읽기 쉬운 Workflow 상태를 제공합니다.
This provides the cleanest workflow readability.

---

## Show ALL Wires

모든 Fake-Wire를 강제로 표시합니다.
Forces all fake wires to become visible.

---

추천 사용:
Recommended Usage:

* Wireless Debug
* Provider Trace
* Routing Inspection
* Workflow Repair

---

#스크린샷 : CONTEXT MENU
#스크린샷 : SHOW ALL WIRES

---

# ✨ TJ_NODE Identity

TJ_NODE의 모든 노드는 통합된 Visual Identity를 공유합니다.
All TJ_NODE nodes share a unified visual identity.

---

기본 테마:
Default Theme:

```javascript id="3t6qt3"
node.bgcolor = "#000000";
node.color = "#7612DA";
node.title_text_color = "#FFFFFF";
```

---

Category 구조:
Category Structure:

```python id="n0jxll"
CATEGORY = " ✨ TJ_Node/Wireless"
CATEGORY = " ✨ TJ_Node/Loaders"   # NEW: Model Set Loader, Multi Model Selecter
CATEGORY = " ✨ TJ_Node/Batch"
CATEGORY = " ✨ TJ_Node/Preview"
CATEGORY = " ✨ TJ_Node/Utility"
CATEGORY = " ✨ TJ_Node/Save"
CATEGORY = " ✨ TJ_Node/Eclipse"
CATEGORY = " ✨ TJ_Node/LLM"
CATEGORY = " ✨ TJ_Node/Generator"
CATEGORY = " ✨ TJ_Node/Video"
CATEGORY = " ✨ TJ_Node/Lora Analyzer"   # NEW: Krea2 LoRA Analyzer
```

---

이 구조는 Workflow 안에서 TJ_NODE 영역을 즉시 식별할 수 있게 합니다.
This structure allows TJ_NODE workflows to be instantly recognizable.

---

#스크린샷 : TJ NODE VISUAL IDENTITY

---

# 📦 Required Models & Setup

각 노드 그룹별로 필요한 모델과 설치 방법을 안내합니다.
Required models and setup instructions for each node group.

---

## 🤖 LLM 노드 — 백엔드별 필요 사항

TJ_NODE LLM 노드는 **3가지 백엔드**를 지원합니다.

### 백엔드 1: GGUF / llama.cpp (Prompt Enhancer, Image to Prompt, Prompt Studio)

**필수 설치:**
```
pip install llama-cpp-python
```

GPU 가속 (권장):
```
CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python --force-reinstall --no-cache-dir
```

**필요 모델 파일** → `ComfyUI/models/text_encoders/` 폴더에 배치:

| 용도 | 기본 파일명 | 설명 |
|---|---|---|
| LLM 본체 (텍스트) | `qwen3.5-4B-Uncensored-HauhauCS-Aggressive-Q8_0.gguf` | Prompt Enhancer / Prompt Studio |
| Vision 프로젝터 | `mmproj-qwen3.5-4B-Uncensored-HauhauCS-Aggressive-BF16.gguf` | Image to Prompt (이미지 입력 시 필요) |

> 다른 GGUF 모델도 사용 가능합니다. `models/text_encoders/` 에 `.gguf` 파일을 넣으면 드롭다운에 자동으로 표시됩니다.

---

### 📋 추천 GGUF 모델 목록 (HuggingFace)

**⭐ Vision 지원 모델 (Image to Prompt 용)**

Vision 모델은 **본체 GGUF** + **mmproj GGUF** 두 파일 모두 필요합니다. 같은 레포에 함께 있습니다.

| 모델 | VRAM | 품질 | HuggingFace |
|---|---|---|---|
| **Qwen2.5-VL 7B** (권장) | 8GB+ | ★★★★★ | [bartowski/Qwen2.5-VL-7B-Instruct-GGUF](https://huggingface.co/bartowski/Qwen2.5-VL-7B-Instruct-GGUF) |
| **Qwen2.5-VL 3B** (경량) | 4GB+ | ★★★★☆ | [bartowski/Qwen2.5-VL-3B-Instruct-GGUF](https://huggingface.co/bartowski/Qwen2.5-VL-3B-Instruct-GGUF) |
| **MiniCPM-V 2.6** | 6GB+ | ★★★★☆ | [openbmb/MiniCPM-V-2_6-gguf](https://huggingface.co/openbmb/MiniCPM-V-2_6-gguf) |
| **LLaVA 1.6 Mistral 7B** | 8GB+ | ★★★☆☆ | [cjpais/llava-1.6-mistral-7b-gguf](https://huggingface.co/cjpais/llava-1.6-mistral-7b-gguf) |
| **LLaVA 1.5 7B** | 6GB+ | ★★★☆☆ | [mys/ggml_llava-v1.5-7b](https://huggingface.co/mys/ggml_llava-v1.5-7b) |

> **Qwen2.5-VL 7B Q4_K_M** 기준: 본체 `~5GB` + mmproj `~1GB`. 총 약 **6GB** VRAM.
> bartowski의 양자화 버전이 속도와 품질 균형이 가장 좋습니다.

**다운로드 및 배치 예시 (Qwen2.5-VL 7B Q4_K_M):**
```
models/text_encoders/
├── qwen2_5_vl_7b_instruct_q4_k_m.gguf        ← 본체 (gguf_model 선택)
└── mmproj-qwen2_5_vl_7b_instruct-f16.gguf    ← Vision 프로젝터 (mmproj_file 선택)
```

---

**✏️ 텍스트 전용 모델 (Prompt Enhancer / Prompt Studio 용, Vision 불필요)**

| 모델 | VRAM | 특징 | HuggingFace |
|---|---|---|---|
| **Qwen3 8B** (권장) | 6GB+ | Thinking 모드 지원, 한국어 강력 | [Qwen/Qwen3-8B-GGUF](https://huggingface.co/Qwen/Qwen3-8B-GGUF) |
| **Qwen3 4B** (경량) | 4GB+ | 빠름, 가성비 최상 | [Qwen/Qwen3-4B-GGUF](https://huggingface.co/Qwen/Qwen3-4B-GGUF) |
| **Qwen3 8B** (bartowski) | 6GB+ | 다양한 양자화 선택 가능 | [bartowski/Qwen3-8B-GGUF](https://huggingface.co/bartowski/Qwen3-8B-GGUF) |
| **Llama 3.2 3B** | 3GB+ | 영어 특화, 초경량 | [bartowski/Llama-3.2-3B-Instruct-GGUF](https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF) |

> **권장 양자화 등급**: VRAM 여유가 있으면 `Q6_K` 또는 `Q8_0`, 부족하면 `Q4_K_M`

---

**양자화 등급 가이드:**

| 등급 | 파일 크기 | 품질 | 권장 상황 |
|---|---|---|---|
| `Q8_0` | 가장 큼 | 원본에 근접 | VRAM 충분 |
| `Q6_K` | 크다 | 매우 좋음 | **균형 권장** |
| `Q4_K_M` | 중간 | 좋음 | VRAM 8GB 이하 |
| `Q3_K_M` | 작음 | 보통 | VRAM 6GB 이하 |

---

### 백엔드 2: ComfyUI TextGenerate (Prompt Enhancer, Image to Prompt, Prompt Studio)

**필수 설치:** ComfyUI Manager에서 `ComfyUI-TextGen` 또는 `TextGenerate` 노드 설치

**필요 모델 파일** → `ComfyUI/models/text_encoders/` 폴더에 배치:

| 용도 | 기본 파일명 | 설명 |
|---|---|---|
| Text Encoder (LLM) | `gemma4_e4b_it_fp8_scaled.safetensors` | TextGenerate 백엔드용 |

> `clip_loader_type` 위젯에서 모델 아키텍처에 맞는 type을 선택하세요. `Auto` 선택 시 파일명 기반으로 자동 탐색합니다.

---

### 백엔드 3: Ollama (TJ Ollama LLM Loader)

**필수 설치:** Ollama 별도 설치 필요
- https://ollama.com 에서 설치

**서버 실행:**
```bash
ollama serve
```

**모델 다운로드 예시:**
```bash
ollama pull qwen3:8b
ollama pull llama3.2:3b
ollama pull gemma3:4b
```

> 기본 서버 주소: `http://127.0.0.1:11434`
> 로컬 서버만 허용됩니다. 외부 서버 URL은 보안상 차단됩니다.

---

## 🖼 Scene Maker (TJ)

**필요 모델** → `ComfyUI/models/clip/` 또는 `ComfyUI/models/text_encoders/` 에 배치:

| 기본 파일명 | 용도 |
|---|---|
| `t5xxl_fp16.safetensors` | CLIP 텍스트 인코더 (기본값) |
| `clip_l.safetensors` | CLIP L (fallback) |

> Scene Maker는 `ComfyUI TextGenerate` 노드를 사용합니다. TextGenerate 노드가 없으면 CLIP 직접 로드 경로를 사용합니다.

---

## ⚡ Z-Image Turbo (TJ)

**필요 모델** — 아래 경로에 맞게 배치:

| 폴더 | 파일명 | 용도 |
|---|---|---|
| `models/diffusion_models/ZIT/` | `z_Image_turbo_bf16.safetensors` | Diffusion 모델 본체 |
| `models/text_encoders/Qwen3/` | `qwen_3_4b.safetensors` | Text Encoder (CLIP) |
| `models/vae/` | `z-image-Vae.safetensors` | VAE |
| `models/loras/Lora/lina/` | `LINA_ZIT.safetensors` | LoRA (선택사항) |

> 파일을 위 경로 구조대로 배치하면 드롭다운에서 자동으로 기본값으로 선택됩니다.

---

## 🔷 Flux2 Klein 4B/9B (TJ)

**필요 모델** — 아래 경로에 맞게 배치:

| 폴더 | 파일명 예시 | 용도 |
|---|---|---|
| `models/diffusion_models/` | `klein9bKVCacheFP8_v10.safetensors` | Klein 9B (KV Cache FP8) — 권장 |
| `models/diffusion_models/` | `flux2Klein9bFp8_fp8.safetensors` | Klein 9B FP8 |
| `models/diffusion_models/` | `flux2Klein4bFp8_fp8.safetensors` | Klein 4B FP8 |
| `models/diffusion_models/Klein9B/` | `flux-2-klein-9b.safetensors` | Klein 9B (서브폴더 형식) |
| `models/text_encoders/` | `qwen_3_8b_fp8mixed.safetensors` | Text Encoder — 권장 |
| `models/text_encoders/Qwen3/` | `qwen_3_8b_fp8mixed.safetensors` | Text Encoder (서브폴더 형식) |
| `models/vae/` | `flux2-vae.safetensors` | VAE |
| `models/vae/flux2/` | `flux2-vae.safetensors` | VAE (서브폴더 형식) |

> 노드가 파일명 키워드를 기반으로 자동 매핑합니다. 정확한 이름이 아니어도 `klein`, `flux2`, `qwen` 등 키워드가 포함되어 있으면 자동 인식됩니다.

---

## 📂 전체 모델 폴더 구조 요약

```
ComfyUI/models/
├── diffusion_models/
│   ├── ZIT/
│   │   └── z_Image_turbo_bf16.safetensors        ← Z-Image Turbo
│   ├── Klein9B/
│   │   └── flux-2-klein-9b.safetensors           ← Flux2 Klein 9B
│   └── klein9bKVCacheFP8_v10.safetensors         ← Flux2 Klein 9B (루트)
├── text_encoders/
│   ├── Qwen3/
│   │   ├── qwen_3_4b.safetensors                 ← Z-Image Turbo CLIP
│   │   └── qwen_3_8b_fp8mixed.safetensors        ← Flux2 Klein CLIP
│   ├── gemma4_e4b_it_fp8_scaled.safetensors      ← TextGenerate LLM
│   ├── t5xxl_fp16.safetensors                    ← Scene Maker CLIP
│   └── *.gguf                                    ← GGUF LLM 모델들
├── clip/
│   └── t5xxl_fp16.safetensors                    ← Scene Maker fallback
├── vae/
│   ├── z-image-Vae.safetensors                   ← Z-Image Turbo VAE
│   └── flux2-vae.safetensors                     ← Flux2 Klein VAE
└── loras/
    └── Lora/lina/
        └── LINA_ZIT.safetensors                  ← Z-Image Turbo LoRA
```

---

## 🔌 외부 노드 의존성

일부 TJ_NODE 기능은 아래 외부 노드가 있어야 동작합니다.

| 기능 | 필요 노드 | 설치 |
|---|---|---|
| ComfyUI TextGenerate 백엔드 | `TextGenerate` 노드 | ComfyUI Manager 검색: `TextGenerate` |
| GGUF 모델 로딩 (UNETLoader) | `UNETLoader` | ComfyUI 기본 내장 |
| GGUF CLIP 로딩 | `CLIPLoaderGGUF` | ComfyUI-GGUF 설치 필요 |
| GGUF Unet 로딩 | `UnetLoaderGGUF` | ComfyUI-GGUF 설치 필요 |

> ComfyUI-GGUF: https://github.com/city96/ComfyUI-GGUF

---

# ✨ Installation

## Install via ComfyUI Manager

```text id="ivn89r"
ComfyUI Manager
 → Install Custom Nodes
 → Search: TJ_NODE
```

---

## Manual Installation

```bash id="6i8v3g"
cd ComfyUI/custom_nodes
git clone https://github.com/designloves2/ComfyUI-TJ_NODE.git
```

---

설치 후 ComfyUI를 재시작하세요.
Restart ComfyUI after installation.

---

# ✨ Documentation

TJ_NODE v1.0은 전체 공식 매뉴얼을 포함합니다.
TJ_NODE v1.0 includes a complete official manual.

---

포함 내용:
Documentation Includes:

* Wireless Architecture
* Batch Workflow System
* Preview Lifecycle
* Save Pipeline
* Workflow Strategy
* Internal Systems
* Reload-safe Architecture
* Debug Guide
* Best Practices
* Anti-Patterns

---

추천 문서:
Recommended Documentation:

```text id="e5vnh5"
TJ_NODE v1.0 MANUAL
```

---

#스크린샷 : MANUAL OVERVIEW

---

# ✨ Workflow Philosophy

TJ_NODE는 단순 Utility Node Pack이 아닙니다.
TJ_NODE is not just another utility node pack.

TJ_NODE는 Workflow Operating Architecture입니다.
TJ_NODE is a Workflow Operating Architecture.

---

TJ_NODE의 핵심은 와이어 제거 자체가 아닙니다.
TJ_NODE is NOT simply about hiding wires.

핵심은 대규모 Workflow를 실제 운영 가능한 상태로 유지하는 것입니다.
The real goal is keeping large-scale workflows maintainable and production-ready.

---

TJ Workflow의 핵심 개념:
Core Concept of TJ Workflow:

```text id="a4ujk7"
Large Scale Workflow Architecture
```

---

#스크린샷 : FINAL WORKFLOW SHOWCASE

---

# ✨ Credits

Created by TJ

피드백과 버그 제보는 언제든 환영합니다.
Feedback and bug reports are always welcome.
