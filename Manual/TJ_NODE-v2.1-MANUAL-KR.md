

# TJ_NODE v2.1 공식 한글 매뉴얼

## Chapter 01 — Wireless Routing System

---

### Wireless Routing System 소개

TJ_NODE의 핵심은:

```text
Wireless Workflow Architecture
```

입니다.

기존 ComfyUI는:

```text
노드 ↔ 노드
```

를 직접 visible wire로 연결하는 구조입니다.

작은 workflow에서는 문제가 없지만, 규모가 커질수록:

* 긴 와이어
* 겹치는 연결선
* routing 혼잡
* 구조 파악 어려움
* 유지보수 난이도 증가

문제가 발생합니다.

TJ_NODE는 이를 해결하기 위해:

```text
TJ Fake-Wire System
```

을 사용합니다.

---

#스크린샷 : 일반 workflow vs TJ workflow 비교

---

### TJ Fake-Wire 구조

TJ Fake-Wire는:

```text
실제 연결은 유지
+
시각적 연결은 숨김
```

구조입니다.

즉:

```text
논리적 연결
=
유지

시각적 clutter
=
최소화
```

됩니다.

---

#### 기존 방식 예시

```text
Load Image
 └────────────────────────────→ KSampler
```

---

#### TJ 방식 예시

```text
Load Image
 → Set Node

KSampler
 ← Get Node
```

실제 내부 연결은 유지됩니다.

단지 workflow 화면에서 긴 와이어를 제거하여:

* 읽기 쉬운 구조
* 모듈 구조
* 유지보수 가능한 workflow

를 만들기 위한 시스템입니다.

---

#스크린샷 : fake-wire hover 상태
#스크린샷 : hidden wire structure

---

### Realtime Wires View Mode

Realtime Wires View Mode는:

```text
hover 시에만 fake-wire 표시
```

하는 기능입니다.

---

#### 목적

이 기능의 목적은:

```text
평소에는 깔끔하게
필요할 때만 연결 확인
```

입니다.

---

#### 활성화 방법

우클릭 메뉴:

```text
TJ Node
 → Realtime Wires View Mode
```

---

#### 동작 방식

|상태|설명|
|-|-|
|OFF|hidden wire 표시 안함|
|ON|hover 시 hidden wire 표시|

---

#### 추천 사용 방식

TJ_NODE workflow에서는:

```text
Realtime Wires View Mode = ON
Show ALL Wires = OFF
```

상태를 권장합니다.

이 구조가 가장 workflow 가독성이 좋습니다.

---

#스크린샷 : Realtime Hover Wire

---

### Show ALL Wires

Show ALL Wires는:

```text
모든 fake-wire 강제 표시
```

모드입니다.

---

#### 사용 목적

추천 사용 상황:

* provider 추적
* wireless 디버깅
* 연결 검사
* workflow 분석

---

#### 주의 사항

대규모 workflow에서는:

```text
와이어 clutter가 다시 증가
```

할 수 있습니다.

일반 workflow 작업 중에는 OFF를 추천합니다.

---

#스크린샷 : Show ALL Wires ON 상태

---

### Embedded Get 시스템

TJ_NODE의 핵심 철학 중 하나는:

```text
Standalone Get Node 남발 최소화
```

입니다.

이를 위해 많은 TJ 노드는:

```text
get_name
```

내장 위젯을 포함합니다.

즉:

```text
노드 내부에서 직접 wireless receive
```

가 가능합니다.

---

#### 지원 노드

현재 embedded get 지원 노드:

* Save & Preview Image (TJ)
* Save & Preview Video (TJ)
* Show Any (TJ)
* Smart Converter (TJ)
* Prompt Text (TJ)
* Batch to Multi Image Output (TJ)
* Scene Maker (TJ)
* Z-Image Turbo (TJ)
* Prompt Studio (TJ)
* Prompt Show & Locker (TJ)
* Multi Model Selecter (TJ)
* Queue Loop (TJ)
* Ollama LLM Loader (TJ)
* LLM Content Quality Controller (TJ)

v2.1 기준 LLM / Generator / Queue / Model Selector 계열 노드도 TJ wireless lifecycle 위에서 동작합니다.

---

#### 장점

Embedded Get 구조의 장점:

|장점|설명|
|-|-|
|노드 수 감소|Get Node 반복 제거|
|workflow 단순화|긴 routing 제거|
|가독성 향상|모듈 구조 강화|
|유지보수 개선|local receive 가능|

---

#스크린샷 : embedded get 위젯
#스크린샷 : embedded get 연결

---

### Wireless Lifecycle System

TJ_NODE는 단순 연결 시스템이 아닙니다.

내부적으로:

```text
Wireless Lifecycle Management
```

시스템이 존재합니다.

---

#### 역할

이 시스템은:

* provider 등록
* reconnect
* cleanup
* reload restore
* fake-wire sync

를 관리합니다.

---

#### 왜 중요한가?

대규모 workflow에서는:

* node duplicate
* workflow reload
* provider rename
* node delete

상황이 매우 자주 발생합니다.

단순 wireless 구조는 이 과정에서 쉽게 깨집니다.

TJ_NODE는 이를 최대한 자동 복구하도록 설계되었습니다.

---

#스크린샷 : provider reconnect
#스크린샷 : reload-safe restore

---

## 노드 시스템 구성

현재 TJ_NODE v2.1 기준 실제 ComfyUI 메뉴 카테고리는 다음 구조입니다.

기존 기능 설명은 유지하되, 노드 상세 설명은 현재 카테고리 기준으로 정리합니다.

---

### 1. Image

이미지 입력, 이미지 배치, 이미지 저장, 이미지 미리보기, 이미지 save chain 관련 노드입니다.

포함 노드:

* Multi Image Loader (TJ)
* Save Image(Primary-TJ)
* Batch to Multi Image Output(TJ)
* Save & Preview Image (TJ)
* Save Image(Suffix-TJ)
* Save Image(Eclipse Suffix-TJ)
* Dynamic Image Batch(TJ)
* Dynamic Image Batch(Eclipse-TJ)

---

### 2. Wireless

TJ_NODE wireless routing system의 핵심 노드입니다.

포함 노드:

* Set Node (TJ)
* Get Node (TJ)
* Multi Router(TJ)
* Multi Get Node (TJ)

---

### 3. Utility

텍스트, 타입 변환, shortcut, 시간 세그먼트 등 workflow utility 노드입니다.

포함 노드:

* Prompt Text (TJ)
* Smart Converter (TJ)
* Text Concatenate (TJ)
* Shortcut Launcher (TJ)
* Time Segment List (TJ)
* Multi Model Selecter (TJ)
* Queue Loop (TJ)

---

### 4. Preview

값 확인, debug, universal preview 관련 노드입니다.

포함 노드:

* Show Any (TJ)
* Smart show (TJ)

---

### 5. Video

영상 preview, video/audio workflow, LTX sampler 관련 노드입니다.

포함 노드:

* LTX2. TJ Sampler
* Save & Preview Video (TJ)

---

### 6. LLM

LLM 기반 prompt 생성, prompt enhancement, image to prompt, scene workflow 관련 노드입니다.

포함 노드:

* Scene Maker (TJ)
* Prompt Studio (TJ)
* Image to Prompt (TJ)
* Prompt Enhancer (TJ)
* Prompt Show & Locker (TJ)
* Ollama LLM Loader (TJ)
* LLM Content Quality Controller (TJ)

---

### 7. Generator

생성 workflow 확장 노드입니다.

포함 노드:

* Z-Image Turbo (TJ)

---


# 노드 시스템 상세 설명

이 장부터는 실제 ComfyUI 메뉴 카테고리 기준으로 31개 노드 전체 상세 설명을 정리합니다.
기존 v1.0 / v2.0.1 노드 설명은 최대한 유지하고, v2.1에서 변경되거나 추가된 기능을 필요한 범위에서 업데이트했습니다.

---

# Chapter 02 — Image Node System

Image 카테고리는 이미지 입력, 이미지 배치, 이미지 저장, 이미지 미리보기, save chain을 담당합니다.

현재 포함 노드:

* Multi Image Loader (TJ)
* Save Image(Primary-TJ)
* Batch to Multi Image Output(TJ)
* Save & Preview Image (TJ)
* Save Image(Suffix-TJ)
* Save Image(Eclipse Suffix-TJ)
* Dynamic Image Batch(TJ)
* Dynamic Image Batch(Eclipse-TJ)

---

## 1. Multi Image Loader (TJ)

### TJ_NODE의 핵심 입력 허브

Multi Image Loader는 TJ workflow의 시작점 역할을 수행하는 핵심 노드입니다.
이 노드는 단순히 이미지를 로드하는 것이 아니라 image stack manager, batch generator, resolution manager, provider source, metadata sync system 역할을 동시에 수행합니다.

---

#스크린샷 : Multi Image Loader 기본 상태

---

### 주요 역할

|기능|설명|
|-|-|
|이미지 로드|다중 이미지 입력|
|Image Stack|내부 리스트 관리|
|Thumbnail Preview|미리보기|
|Reorder|drag 정렬|
|Batch 생성|IMAGE batch tensor 출력|
|Resize|해상도 통일|
|Metadata 유지|원본 정보 유지|
|Auto Set|WIDTH / HEIGHT / BATCH provider 생성|

---

### 언제 사용하는가?

추천 상황:

* dataset batch
* variation workflow
* upscale batch
* VAE Encode batch
* ControlNet image group
* style transfer batch
* image compare workflow

---

#스크린샷 : 대량 batch workflow 예시

---

### 이미지 추가 방법

지원 방식:

|방식|설명|
|-|-|
|파일 선택|로컬 파일|
|Drag & Drop|직접 드래그|
|URL Download|외부 이미지 다운로드|

---

#스크린샷 : 이미지 추가 버튼
#스크린샷 : drag & drop 상태

---

### URL Download 기능

외부 URL 입력 가능.

```text
https://example.com/image.jpg
```

추천 사용:

* reference image
* external dataset
* remote workflow asset

일부 사이트는 hotlink 차단 또는 CORS 제한으로 다운로드 실패 가능성이 있습니다.

---

### Image Stack / Thumbnail Grid

이미지는 내부적으로 Image Stack 구조로 관리됩니다.
단순 배열이 아니라 preview state, order, metadata, resize state를 함께 관리합니다.
추가된 이미지는 thumbnail grid로 표시되며, batch 상태 확인과 reorder에 사용됩니다.

---

#스크린샷 : thumbnail grid

---

### Drag Reorder 기능

이미지는 drag로 순서 변경 가능합니다.
Batch workflow에서는 순서 자체가 데이터인 경우가 많습니다.

예시:

* animation sequence
* prompt sync
* frame processing
* paired dataset

---

#스크린샷 : drag reorder 상태

---

### Resize System

Batch workflow에서 resolution mismatch는 매우 흔한 문제입니다.
Multi Image Loader는 이를 해결하기 위한 resize 시스템을 포함합니다.

|Mode|설명|
|-|-|
|none|원본 유지|
|long edge|긴 변 기준|
|short edge|짧은 변 기준|
|custom|직접 입력|
|megapixel|MP 기준 계산|

---

### Scale Method

#### Center Crop

비율 유지 후 중앙 crop.

추천 상황:

* portrait dataset
* subject 중심 이미지
* fashion workflow

#### Force Fit

비율 강제 맞춤.

추천 상황:

* texture
* tile
* exact resolution workflow

Force Fit은 비율 왜곡 가능성이 있으므로 사람 이미지에서는 Center Crop을 권장합니다.

---

#스크린샷 : Center Crop vs Force Fit 비교

---

### Output 설명

#### BATCH

IMAGE batch tensor 출력.

```text
Multi Image Loader
 → VAE Encode
 → KSampler
 → Save Preview
```

#### WIDTH / HEIGHT

현재 batch 기준 해상도 출력.
TJ workflow에서는 resolution도 routing 데이터로 사용할 수 있습니다.

---

### Auto Set 기능

Auto Set = ON 상태에서 자동으로 다음 provider를 생성합니다.

```text
TJ / BATCH
TJ / WIDTH
TJ / HEIGHT
```

장점:

* 긴 wire 제거
* downstream routing 단순화
* batch 구조 모듈화

---

## 2. Save Image(Primary-TJ)

### Save Pipeline 기준 노드

Primary-TJ는 기준 저장 위치를 생성하는 노드입니다.
TJ Save 구조의 시작점 역할을 수행합니다.

---

#스크린샷 : Primary-TJ overview

---

### Primary Save의 핵심 역할

Primary-TJ는 단순 저장 노드가 아니라 전체 워크플로우의 저장 맥락을 유지하는 **Save Context Provider**입니다.
downstream 노드들이 save path, filename base, suffix chain을 공유할 수 있게 하여, 분기된 전체 워크플로우의 결과물이 흩어지지 않고 하나의 맥락(Context) 안에서 구조적으로 묶이도록 보장합니다.

---

### 기본 사용 방법

#### Step 1 — IMAGE 입력 연결

`image` 슬롯에 IMAGE 연결.

#### Step 2 — filename_prefix 설정

예시:

```text
project_main
%date_%time_project
```

지원 Alias:

|Alias|결과|
|-|-|
|%date|YYYY-MM-DD|
|%time|HH-MM-SS|

#### Step 3 — Queue 실행

실행 시 저장 path 생성, metadata 저장, downstream save context 생성이 자동 수행됩니다.

---

### 추천 구조

```text
Generation
 ↓
Primary-TJ
 ↓
Upscale
 ↓
Suffix-TJ
```

---

## 3. Batch to Multi Image Output(TJ)

### Batch Split System

IMAGE batch를 최대 64개 IMAGE output으로 분리하는 노드입니다.

---

#스크린샷 : Batch Split overview

---

### 핵심 목적

Batch workflow를 개별 downstream branch로 분리하기 위함입니다.

추천 예시:

* selective upscale
* compare workflow
* image ranking
* branch processing
* multi save pipeline

---

### 사용 방법

1. IMAGE batch 입력 연결
2. output 사용
3. 필요한 branch에 각각 연결

각 이미지가 독립 IMAGE output으로 분리됩니다.

---

### Embedded Get 지원

Batch to Multi Image Output는 embedded get을 지원합니다.
즉 직접 wireless receive 가능합니다.

---

### v2.x 업데이트

* dynamic output count 지원
* auto_set 기능 추가
* dynamic output refresh 안정화
* auto_set 기본값 OFF로 정리

### v2.1 확인 사항

* 31개 노드 구조 기준 Image 카테고리 유지
* Batch split 출력 구조는 기존 v2.x 방식 유지

---

## 4. Save & Preview Image (TJ)

### Unified Image Preview System

Save & Preview Image는 TJ_NODE의 대표 image preview 시스템입니다.
단순 preview 노드가 아니라 image preview, fullscreen viewer, batch grid, keyboard navigation, snapshot preview, save pipeline, embedded get을 하나로 통합한 구조입니다.

---

#스크린샷 : Save & Preview Image 기본 상태

---

### 지원 기능

|기능|설명|
|-|-|
|IMAGE preview|단일/배치 표시|
|Fullscreen|확대 보기|
|Smart Grid|batch grid|
|Keyboard Control|방향키/ESC|
|Snapshot|preview 복사|
|Embedded Get|wireless receive|
|Save System|이미지 저장|
|Reload Restore|preview 복원|

---

### 기본 사용 방법

`image` 슬롯에 IMAGE 또는 IMAGE batch를 연결합니다.
노드는 자동으로 single image 또는 batch grid 모드를 판단합니다.

Queue 실행 시 preview 생성, grid 생성, snapshot metadata 저장이 자동 수행됩니다.
이미지를 클릭하면 fullscreen preview로 진입합니다.

---

### Smart Grid 시스템

batch preview를 읽기 쉬운 구조로 표시하기 위한 시스템입니다.

특징:

* dynamic layout
* fit-center
* 2px spacing
* stable rendering

---

### Fullscreen Viewer

결과 이미지를 실제 품질 수준으로 검사하기 위한 기능입니다.

|키|기능|
|-|-|
|F / f|fullscreen|
|ESC|종료|
|←|이전 이미지|
|→|다음 이미지|

---

### Snapshot Preview 시스템

TJ preview copy는 live mirror가 아닙니다.
현재 preview snapshot을 보존하는 구조입니다.

추천 사용:

* 결과 비교
* 중간 checkpoint
* debug 기록

---

### Embedded Get 지원

추천 구조:

```text
Multi Router
 ↓
Wireless Provider
 ↓
Save & Preview Image
```

### v2.1 개선 사항

* Reload 후 embedded get / fake-wire 유지 안정화
* Refresh 후 일반 visible wire로 바뀌는 문제 대응
* Save & Preview Image 계열 get_name reconnect 구조 개선

---

## 5. Save Image(Suffix-TJ)

### 후속 저장 시스템

Suffix-TJ는 Primary 저장 기준을 이어받아 후속 결과를 저장하는 노드입니다.

---

#스크린샷 : Suffix-TJ overview

---

### 핵심 목적

대규모 workflow에서는 upscale, detail pass, color correction, compare result 등이 계속 생성됩니다.
Suffix-TJ는 이를 같은 결과 세트로 유지하기 위한 구조입니다.

---

### 기본 구조

```text
Primary-TJ
 ↓
base path 생성

Suffix-TJ
 ↓
suffix append 저장
```

---

### 사용 예시

```text
main.png
main_upscale.png
main_detail.png
main_compare.png
```

추천 suffix:

```text
upscale
detail
mask
compare
```

---

## 6. Save Image(Eclipse Suffix-TJ)

### Eclipse Save Compatibility System

이 노드는 Eclipse 원본 파일 구조 유지를 위한 저장 시스템입니다.

---

### 핵심 특징

일반 save 구조는 현재 workflow 기준 저장입니다.
Eclipse workflow에서는 원본 파일 위치 기준 저장이 중요합니다. TJ_NODE는 Eclipse를 대체하는 것이 아니라, 원본 파일 구조와 메타데이터(path tracking 등)를 철저히 유지하며 TJ 워크플로우와 연결해주는 **'Bridge Layer'** 역할을 수행한다는 철학을 가집니다.

---

### 주요 기능

|기능|설명|
|-|-|
|original path tracking|원본 경로 유지|
|metadata path restore|경로 복원|
|relative save|상대 경로 유지|
|suffix append|후속 저장|

---

### 추천 사용 상황

* Eclipse workflow
* dataset processing
* metadata dependent pipeline
* original path preserving workflow

---

## 7. Dynamic Image Batch(TJ)

### 동적 IMAGE Batch 생성 노드

여러 이미지를 동적 batch 구조로 생성하는 노드입니다.

---

#스크린샷 : Dynamic Image Batch overview

---

### 핵심 역할

* image grouping
* dynamic batch
* scalable processing
* workflow distribution

---

### 추천 사용 상황

* image variation
* multi prompt generation
* grouped upscale
* iterative processing

---

### v2.x 업데이트

* image stack resize 구조 개선
* 노드 높이 무한 증가 문제 수정
* save_path_opt 보안 패치 적용
* path traversal 방지 구조 추가
* scale method UI 정리

---

## 8. Dynamic Image Batch(Eclipse-TJ)

### Eclipse Compatibility Batch System

Eclipse workflow 구조와 호환되는 batch 시스템입니다.

---

### 핵심 특징

이 노드는 IMAGE + FILES pair를 함께 유지합니다.
즉 image tensor, original file metadata, original path를 동시에 유지합니다.

---

### 지원 기능

|기능|설명|
|-|-|
|metadata 유지|원본 정보 유지|
|bypass filtering|file sync 유지|
|original path|원본 경로 유지|
|Eclipse save sync|저장 구조 연동|

---

### 추천 사용 상황

* large dataset workflow
* Eclipse save pipeline
* metadata dependent workflow
* file-tracking workflow

---

# Chapter 03 — Wireless Node System

Wireless 카테고리는 TJ_NODE의 핵심 routing system입니다.

현재 포함 노드:

* Set Node (TJ)
* Get Node (TJ)
* Multi Router(TJ)
* Multi Get Node (TJ)

---

## 1. Set Node (TJ)

### Wireless Provider 생성 노드

Set Node는 데이터를 wireless provider로 등록하는 노드입니다.
workflow 내부 방송국 같은 역할입니다.

---

### 사용 방법

1. source 데이터 연결
2. setnode_name 설정
3. downstream에서 Get Node / embedded get / MultiGet으로 receive

지원 예시:

* IMAGE
* LATENT
* STRING
* MODEL
* CONDITIONING
* CLIP
* VAE

---

### 권장 네이밍 규칙

```text
SECTION_PURPOSE
```

예시:

```text
INPUT_MAIN_IMAGE
UPSCALE_FINAL_IMAGE
PROMPT_CHARACTER_MAIN
```

비추천:

```text
test
aaa
123
```

---

### 내부 동작

Set Node는 Provider Registry에 등록됩니다.
workflow 전체가 현재 활성 provider 리스트를 공유하고, Get 리스트는 여기서 자동 생성됩니다.

---

### 주의 사항

동일한 setnode_name이 여러 개 존재할 경우 예상치 못한 receive, reconnect 꼬임, provider overwrite가 발생할 수 있습니다.

---

## 2. Get Node (TJ)

### Wireless Receive 노드

Get Node는 Set Node의 wireless provider를 수신하는 노드입니다.
무선 수신기 역할입니다.

---

### 사용 방법

1. 데이터를 사용할 위치 근처에 Get Node 배치
2. get_name 드롭다운에서 provider 선택
3. output을 downstream에 연결

---

### Eclipse 호환 표시

Eclipse SetNode provider는 다음 형태로 표시됩니다.

```text
Eclipse / PROVIDER_NAME
```

---

### Hover Wire Visualization

Get Node 또는 slot hover 시 fake-wire 경로가 표시됩니다.
source provider 확인, routing 방향 확인, workflow 구조 분석이 가능합니다.

---

### 문제 해결

Provider 리스트가 안 보이면 provider 존재 여부, workflow reload 상태, deleted Set Node 여부를 확인하고 Refresh ALL Get Nodes 실행을 권장합니다.

---

## 3. Multi Router(TJ)

### Wireless Branch Architecture Node

Multi Router는 workflow를 wireless branch 구조로 분리하기 위한 핵심 노드입니다.

---

### 핵심 역할

* branch 분리
* Auto Set 생성
* provider 구조화
* workflow 모듈화

Multi Router는 대규모 워크플로우를 Generation, Edit, Upscale, Save 등의 **'Section' 단위로 분리하는 가장 중요한 심장 역할**을 수행합니다. 긴 visible wire를 없애고 무선 분기(Branch) 아키텍처를 설계할 때 반드시 워크플로우 중심에 배치해야 합니다.

---

### 사용 방법

1. source 입력 연결
2. output branch 구성
3. Auto Set 필요 시 ON

출력 branch 예시:

```text
generation
upscale
preview
save
```

---

### 추천 workflow 구조

```text
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

각 section을 Multi Router + wireless branch로 연결하는 것이 안정적입니다.

---

### v2.x 업데이트

Auto Set 활성 시 output name 앞에 `▶` 표시 구조가 추가되었습니다.
OFF 시에는 `▶` 표시가 제거됩니다.
Cover 노드에서도 TJ Set/Get 연결 가능 구조가 보강되었습니다.

### v2.1 개선 사항

* Auto Set output lifecycle 안정화
* Reload / Refresh 이후 provider restore 개선
* Dynamic output 기반 branch 구조에서 연결 유지 보강

---

## 4. Multi Get Node (TJ)

### 다중 Wireless Receive 노드

여러 wireless provider를 동시에 수신하는 노드입니다.
대규모 workflow 모듈화에서 중요합니다.

---

### 추천 사용 상황

* 여러 prompt 수신
* 여러 image 수신
* grouped provider 관리
* module receive 구조

---

### Persistent Slot 구조

v1.x 이후 MultiGet은 provider index 기반이 아니라 persistent slot entity 기반으로 개선되었습니다.

지원 기능:

* Remove Slot
* Compact Empty Slots
* Remove Last Slot
* slot persistence
* slot UUID 기반 reconnect
* slot reorder
* slot rename
* slot disconnect

---

### 추천 구조

다수의 Get Node 대신 MultiGet 기반 module receive 구조를 추천합니다.
특히 prompt group, model group, image group 수신에 효과적입니다.

---

# Chapter 04 — Utility Node System

Utility 카테고리는 prompt text, 타입 변환, 텍스트 결합, shortcut, time segment 관리 노드를 포함합니다.

현재 포함 노드:

* Prompt Text (TJ)
* Smart Converter (TJ)
* Text Concatenate (TJ)
* Shortcut Launcher (TJ)
* Time Segment List (TJ)
* Multi Model Selecter (TJ)
* Queue Loop (TJ)

---

## 1. Prompt Text (TJ)

### Prompt Management Node

프롬프트 구조화를 위한 노드입니다.

---

### 추천 사용

* character prompt
* style prompt
* reusable prompt block
* lighting prompt
* camera prompt
* negative prompt block

---

### Embedded Get 지원

Prompt Text는 embedded get을 지원합니다.
긴 text wire 없이 modular prompt architecture 구성이 가능합니다.

---

### v1.0.4 업데이트

Prompt Text에는 다음 버튼 기능이 추가되었습니다.

* Copy All
* Paste
* Clear

버튼 피드백 상태:

* Copied
* Pasted
* Cleaned

---

### 추천 구조

```text
Prompt Text
 ↓
Text Concatenate
 ↓
Generation Node
```

또는:

```text
Prompt Text
 ↓
Set Node
 ↓
Get / Embedded Get
```

---

## 2. Smart Converter (TJ)

### Universal Type Conversion Node

Smart Converter는 ANY 입력을 원하는 타입으로 변환하는 utility 노드입니다.

---

### 핵심 목적

ComfyUI workflow에서는 타입이 살짝 맞지 않아 연결이 막히는 경우가 많습니다.

예시:

```text
STRING 숫자 → INT
FLOAT → INT
Tensor scalar → FLOAT
DICT → JSON string
LIST → TENSOR
```

---

### 지원 변환 타입

|output_type|출력 타입|설명|
|-|-|-|
|AUTO|자동 감지|입력값 타입을 기준으로 자동 출력|
|INT|INT|정수 변환|
|FLOAT|FLOAT|실수 변환|
|STRING|STRING|문자열 변환|
|BOOLEAN|BOOLEAN|True / False 변환|
|TENSOR|TENSOR|torch Tensor 변환|
|LIST|LIST|리스트 변환|
|DICT|DICT|딕셔너리 변환|
|JSON|STRING|JSON 문자열 변환|

---

### 출력 설명

|출력|설명|
|-|-|
|output|변환된 값|
|status|변환 상태 메시지|

---

### strict_mode

|strict_mode|동작|
|-|-|
|OFF|경고 status 출력 후 기본값 반환|
|ON|변환 실패 시 에러 발생|

---

### 기본값 반환 규칙

|요청 타입|기본값|
|-|-|
|INT|0|
|FLOAT|0.0|
|STRING|빈 문자열|
|BOOLEAN|False|
|TENSOR|0 tensor|
|LIST|빈 리스트|
|DICT|빈 dict|
|JSON|null 문자열|

---

### Embedded Get 지원

```text
provider 선택
 ↓
타입 변환
 ↓
downstream 전달
```

---

### Dynamic Output Slot (동적 슬롯 변경)

Smart Converter는 `output_type` 선택에 따라 output 슬롯 타입과 이름이 시각적으로 즉시 변경됩니다 (예: `AUTO` → `output / *`, `INT` → `int / INT`). 이를 통해 타입이 맞지 않는 잘못된 downstream 연결은 자동으로 안전하게 끊어져 워크플로우 오류를 사전에 방지합니다.

---

### v2.x 업데이트

* BOOLEAN / LIST / DICT / JSON 지원 확장
* status output 구조 보강
* strict_mode 안정화
* output reconnect 문제 수정
* UI 잘림 문제 수정
* 타입 변경 후 출력 중단 문제 수정

---

## 3. Text Concatenate (TJ)

### Dynamic Text Combine Node

여러 text를 결합하는 노드입니다.

---

### 특징

* dynamic input
* custom delimiter
* scalable combine
* multi prompt merge

---

### Embedded Get 미지원

이 노드는 intentionally embedded get 미지원입니다.
이유는 dynamic input 구조와 stable wireless routing이 충돌할 수 있기 때문입니다.

---

### 추천 사용

```text
character prompt
+
style prompt
+
camera prompt
+
lighting prompt
```

---

## 4. Shortcut Launcher (TJ)

### Workflow External Shortcut Panel

Shortcut Launcher는 ComfyUI workflow 안에서 자주 쓰는 폴더, 파일, URL을 버튼으로 실행하는 utility 노드입니다.

---

### 핵심 목적

작업 중 자주 여는 항목을 workflow 안에 버튼으로 배치합니다.

예시:

* output 폴더
* input 폴더
* 프로젝트 폴더
* 모델 폴더
* GitHub repository
* Civitai 페이지
* 내부 문서 URL

---

### 주요 기능

|기능|설명|
|-|-|
|다중 버튼|여러 shortcut 버튼 생성|
|Path 실행|로컬 폴더/파일 열기|
|URL 실행|웹 URL 브라우저로 열기|
|Tooltip|버튼 설명 표시|
|Settings Modal|HTML5 설정창 제공|
|JSON Export|shortcut preset 저장|
|JSON Import|shortcut preset 불러오기|
|Color Picker|버튼 배경색 / 글자색 지정|
|Height-only resize|버튼 수에 맞춰 높이 자동 조정|

---

### 사용 방법

1. Shortcut Launcher (TJ) 노드 배치
2. `⚙ Settings` 클릭
3. `+ Add Button`으로 shortcut 항목 추가
4. Save 버튼으로 저장

---

## 5. Time Segment List (TJ)

### Time Segment Utility Node

Time Segment List는 시간 구간 정보를 workflow 안에서 정리하기 위한 utility node입니다.

---

### 주요 목적

영상 / 장면 / segment 기반 workflow에서 시간 구간을 관리하기 위한 노드입니다.

추천 사용:

* video segment planning
* scene timing
* cut list 정리
* prompt timing reference
* animation section 관리

---

### 주요 특징

|기능|설명|
|-|-|
|Time Segment 관리|시간 구간 리스트 구성|
|Utility category|TJ_Node / Utility 등록|
|TJ Theme 적용|TJ_NODE 공통 컬러 적용|
|Workflow reference|video / scene workflow 참고값으로 사용|

---


## 6. Multi Model Selecter (TJ)

### Dynamic Model Routing Node

Multi Model Selecter는 여러 모델 계열 파일을 하나의 노드에서 선택하고, 필요한 출력 타입으로 분기하기 위한 v2.1 Utility 노드입니다.
단순 파일 선택 노드가 아니라 model / clip / vae / checkpoint 선택을 workflow 구조 안에서 관리하는 **Model Routing Hub** 역할을 합니다.

---

### 지원 Select Type

|Select Type|설명|
|-|-|
|Model|models 폴더 계열 모델 선택|
|Clip|CLIP 모델 선택|
|VAE|VAE 모델 선택|
|Checkpoints|checkpoint를 MODEL / CLIP / VAE로 분리 출력|

---

### Output Mode

|Mode|설명|
|-|-|
|Model Direct out|실제 ComfyUI 객체를 로드하여 출력|
|Model Path out|모델 경로 문자열만 출력|

Direct out은 실제 모델 객체가 필요한 workflow에 사용합니다.
Path out은 외부 loader, debug, 모델 경로 전달용 workflow에 사용합니다.

---

### Dynamic Slot 구조

Multi Model Selecter는 슬롯 수를 동적으로 확장하는 구조입니다.
프론트엔드 JS가 선택된 슬롯 수와 타입에 맞춰 출력 슬롯을 재구성하고, Python 쪽은 최대 출력 테이블을 안전하게 유지합니다.

특히 Checkpoints 선택 시에는 슬롯 하나가 다음 3개 출력으로 분리됩니다.

```text
MODEL
CLIP
VAE
```

---

### CLIP Loader Type

Clip 선택 시 현재 설치된 ComfyUI CLIPLoader의 type 목록을 읽어옵니다.
ComfyUI 쪽 CLIPLoader 타입 목록이 변경되어도 현재 환경 기준 선택지를 받아오도록 설계되어 있습니다.

---

### Auto Set 지원

Auto Set을 ON으로 설정하면 선택된 모델 출력을 TJ wireless provider로 사용할 수 있습니다.
모델 비교, generator 교체, LLM / image workflow 분기에서 긴 모델 wire를 줄이는 데 사용합니다.

---

### 추천 사용 상황

* 여러 모델 비교
* checkpoint별 결과 비교
* CLIP / VAE 교체 테스트
* 모델 path만 downstream으로 전달하는 workflow
* 대규모 generation workflow의 model routing section

---

### v2.1 추가 사항

* 신규 Utility 노드로 추가
* Model / Clip / VAE / Checkpoints 선택 지원
* Direct out / Path out 모드 지원
* Dynamic Slot 기반 output 재구성
* CLIP Loader Type 동적 목록 로딩
* Auto Set 기반 wireless routing 지원

---

## 7. Queue Loop (TJ)

### Queue Automation Node

Queue Loop는 ComfyUI queue를 반복 실행하면서 현재 index를 출력하는 v2.1 Utility 노드입니다.
한 번의 batch 내부 반복이 아니라, workflow 실행이 끝난 뒤 다음 queue를 다시 넣는 방식으로 동작합니다.

---

### 핵심 목적

Queue Loop의 목적은 다음과 같습니다.

* 대량 생성 자동화
* index 기반 이미지 / 프롬프트 순환
* seed / prompt / 파일 index 테스트
* queue_count 기준 반복 실행
* workflow cache를 우회한 반복 실행

---

### 주요 입력

|입력|설명|
|-|-|
|auto_set|출력 index provider 자동 등록|
|queue_count|전체 queue 반복 횟수|
|current_index|현재 출력 index|
|current_queue|현재 queue 진행 위치|
|start_index|index 시작값|
|end_index|index 종료값|
|step|index 증가값|
|index_loop_mode|index 종료 후 처리 방식|

---

### 출력

|출력|타입|설명|
|-|-|-|
|index|INT|현재 index 값|
|index_text|STRING|문자열 index 값|
|queue_count|INT|전체 queue 반복 횟수|

---

### Index Loop Mode

|Mode|동작|
|-|-|
|Index Loop|end_index를 넘으면 start_index로 돌아감|
|Index Stop at End|end_index에서 멈춘 값 유지|

예시:

```text
start_index = 0
end_index = 4
queue_count = 50
index_loop_mode = Index Loop
```

위 설정은 0, 1, 2, 3, 4 index를 반복하면서 총 50번 queue를 실행합니다.

---

### Queue Control UI

Queue Loop는 노드 내부에 전용 컨트롤 UI를 표시합니다.

```text
done - 1/5                         00:00:00
        Start             Stop               Reset
```

상단 상태 영역은 진행 상태와 elapsed timer를 표시합니다.
전체 queue가 완료되면 timer는 멈춥니다.

---

### Timer 표시

타이머는 다음 기준으로 동작합니다.

* Start 클릭 시 00:00:00부터 시작
* Stop 클릭 시 현재 시간에서 멈춤
* Reset 클릭 시 00:00:00으로 초기화
* 전체 queue 완료 시 자동 정지

진행 상태 텍스트와 시간 표시는 크게 표시되어 장시간 queue 진행 상태를 쉽게 확인할 수 있습니다.

---

### Backward Compatibility

v2.1에서는 기존 workflow 호환을 위해 이전 이름도 내부적으로 처리합니다.

|이전 이름|v2.1 이름|
|-|-|
|total_count|queue_count|
|loop_mode|index_loop_mode|

---

### 추천 사용 상황

* 5장의 이미지를 index로 순환하면서 50회 생성
* prompt list index 테스트
* model / lora 조합 반복 테스트
* 영상 frame index 처리
* 대량 저장 workflow 자동화

---

### v2.1 추가 사항

* 신규 Utility 노드로 추가
* queue_count 기반 queue 반복 실행
* start_index / end_index / step 지원
* index_loop_mode 추가
* current_queue 진행 상태 관리
* Start / Stop / Reset UI 추가
* elapsed timer 추가
* Auto Set 기반 index routing 지원

---

# Chapter 05 — Preview Node System

Preview 카테고리는 workflow 값 확인, debug, universal preview를 담당합니다.

현재 포함 노드:

* Show Any (TJ)
* Smart show (TJ)

---

## 1. Show Any (TJ)

### Lightweight Universal Output Viewer

Show Any는 다양한 타입의 데이터를 텍스트로 안전하게 펼쳐서 확인하면서 원본 값은 그대로 통과시키는 디버그 / 모니터링 노드입니다.

---

### 핵심 목적

대규모 workflow에서는 중간 데이터가 실제로 어떤 값인지 확인해야 할 때가 많습니다.

Show Any는 이때 STRING, INT / FLOAT / BOOLEAN, LIST, DICT / JSON, TENSOR, numpy ndarray, 기타 Python object를 사람이 읽을 수 있는 형태로 표시합니다.

---

### 중요한 특징

```text
입력 any
 ↓
텍스트 표시
 ↓
원본 any 그대로 output
```

즉 debug용으로 끼워 넣어도 downstream 데이터 흐름을 끊지 않습니다.

---

### 지원 기능

|기능|설명|
|-|-|
|ANY 입력|대부분의 ComfyUI 타입 수신|
|원본 passthrough|입력 값을 그대로 output|
|텍스트 표시|값을 multiline text로 표시|
|Tensor 요약|shape / dtype / device / min / max / mean 표시|
|JSON-safe 표시|dict/list/object를 읽기 쉬운 JSON 형태로 표시|
|Copy 버튼|표시된 텍스트를 클립보드로 복사|
|Embedded Get|wireless provider 직접 수신|
|Set Provider|setnode_name으로 provider 등록 가능|

---

### v2.x 업데이트

* workflow reload 후 get_name 유지
* provider scan 실패 시 `(none)` 강제 리셋 방지
* fake-wire provider survival 개선
* copy 버튼 위치 고정 문제 수정
* get_name disconnect 문제 수정

---

### 추천 사용 상황

* 중간 데이터 타입 확인
* Tensor 요약 확인
* JSON / dict 구조 확인
* Smart Converter 결과 확인
* wireless provider 값 검사
* workflow debug checkpoint

---

## 2. Smart show (TJ)

### Universal Debug Viewer

Smart show는 TJ_NODE의 대표 debug viewer입니다.

---

### 목적

다양한 타입을 자동 분석 및 preview하기 위한 노드입니다.

---

### 지원 타입

|타입|설명|
|-|-|
|IMAGE|이미지|
|STRING|텍스트|
|FLOAT|숫자|
|INT|정수|
|JSON|구조 데이터|
|LIST|리스트|
|VIDEO|영상|
|AUDIO|오디오|

---

### JSON-safe 및 AUDIO Dict 처리

일반 텍스트나 이미지뿐만 아니라, 딕셔너리(Dict) 안에 들어있는 복잡한 AUDIO 데이터나 계층이 깊은 JSON 데이터도 에러 없이 사람이 읽기 쉬운 형태로 안전하게 fallback 처리하여 표시합니다.

---

### 자동 타입 전환

입력 타입에 따라 image viewer, text viewer, media player, numeric viewer로 자동 전환합니다.

---

### Edit Mode

Edit Mode는 기본 OFF 상태입니다.
실수로 workflow 값이 overwrite되는 것을 방지하기 위함입니다.

---

### 추천 사용

* debug
* compare
* text inspect
* metadata inspect
* audio / video check

---

### v2.x 기준 위치

현재 Smart show (TJ)는 Preview 카테고리에 위치합니다.
Show Any가 경량 passthrough debug에 적합하다면, Smart show는 다양한 media preview 확인에 적합합니다.

---

# Chapter 06 — Video Node System

Video 카테고리는 video sampler, video/audio preview, decode, playback을 담당합니다.

현재 포함 노드:

* LTX2. TJ Sampler
* Save & Preview Video (TJ)

---

## 1. LTX2. TJ Sampler

### LTX2.3 Compact AV Sampler 기반 TJ Video Sampler

LTX2. TJ Sampler는 LTX2.3 Compact AV Sampler 기반의 TJ video workflow용 sampler입니다.

---

### 주요 특징

|기능|설명|
|-|-|
|Video workflow sampler|LTX2 기반 video sampling|
|Compact AV Sampler 기반|LTX2.3 Compact AV Sampler 구조 활용|
|Advanced 기본 표시|Hide advanced settings 제거|
|Sigma 입력 호환|sigma 입력 시 기존 sigma widget hide 유지|
|TJ Category 적용|Video 카테고리 등록|

---

### 사용 목적

* LTX video generation
* video sampling workflow
* compact sampler workflow
* video/audio pipeline 테스트

---

### 주의 사항

이 노드는 video generation workflow 내부에서 사용하는 sampler 계열 노드입니다.
Preview / 저장은 Save & Preview Video (TJ)와 함께 사용하는 것을 권장합니다.

---

## 2. Save & Preview Video (TJ)

### Unified Video Workflow System

Save & Preview Video는 image batch playback, video decode, audio mux, preview restore, video save, audio only export를 통합한 노드입니다.

---

### 지원 기능

|기능|설명|
|-|-|
|IMAGE batch playback|frame preview|
|VIDEO decode|mp4 → frames|
|Audio mux|audio merge|
|Audio Only|오디오 전용|
|Embedded Get|wireless receive|
|Preview Restore|reload 복원|
|HTML5 Player|browser playback|
|Video total frame output|총 frame 수 출력|

---

### IMAGE Batch 방식 사용

```text
IMAGE batch
 ↓
preview
 ↓
playback
 ↓
optional mp4 rebuild
```

추천 source:

* AnimateDiff
* Frame Generator
* VFI
* interpolation
* Dynamic Batch

---

### VIDEO Decode 방식 사용

기존 mp4를 IMAGE batch로 변환하기 위한 구조입니다.

decode된 frame은 일반 IMAGE batch처럼 downstream 사용 가능합니다.

---

### Mutex 시스템

Save & Preview Video는 image + video direct input 동시 연결을 방지합니다.
동시 연결 시 ambiguous decode state, invalid playback state, reload mismatch가 발생할 수 있기 때문입니다.

---

### Audio 시스템

지원 입력:

|입력|설명|
|-|-|
|audio_a|메인 오디오|
|audio_b|보조 오디오|

Audio Only Mode에서는 전용 audio controller UI를 표시합니다.

controller 생성 규칙:

|입력 상태|표시|
|-|-|
|A only|controller 1개|
|B only|controller 1개|
|A+B|controller 2개|

---

### v1.0.2 업데이트

* audio A/B preview 구조 추가
* video total frame output 추가
* video+audio mode 무음 문제 수정
* preview/save audio routing 수정
* original audio / A+B preview 구조 개선

---

# Chapter 07 — LLM Node System

LLM 카테고리는 prompt 생성, prompt 개선, image to prompt, scene 구성 workflow를 담당합니다.

현재 포함 노드:

* Scene Maker (TJ)
* Prompt Studio (TJ)
* Image to Prompt (TJ)
* Prompt Enhancer (TJ)
* Prompt Show & Locker (TJ)
* Ollama LLM Loader (TJ)
* LLM Content Quality Controller (TJ)
* Ollama LLM Loader (TJ)
* LLM Content Quality Controller (TJ)

---

## 1. Scene Maker (TJ)

### Visual Beat 기반 Scene Workflow Node

Scene Maker (TJ)는 visual beat 기반으로 scene prompt workflow를 구성하는 노드입니다.
Keyframe Maker 기반으로 TJ 스타일 리빌드된 LLM workflow 노드입니다.

---

### 주요 기능

|기능|설명|
|-|-|
|Embedded Get/Set|wireless workflow 연결|
|Auto Set|provider 자동 생성|
|Translate|다국어 번역 지원|
|Clip Override|clip 입력 override|
|Guide Refresh|guide / summary refresh|
|Visual Beat Reuse|생성된 visual beat 재사용|

---

### 지원 언어

* KO
* EN
* JP
* CN

---

### 주요 버튼

* Refresh guide / summary
* reuse brief as override(generated)
* reuse Visual Beat as override(generated)

---

### v2.x 변경 사항

* get_name 위젯 최상단 이동
* widget layout 전체 재정렬
* auto set / mode / translate / shot_count / seed / text fields / buttons 구조 정리
* placeholder 문구 수정
* generated brief / beat 저장 구조 수정
* Cover AutoSet provider survival 문제 수정
* provider cleanup 시 fake-wire 끊김 문제 수정
* Multi Image Loader 방식 reconnect lifecycle 적용

---

### 추천 사용

* scene planning
* storyboard prompt
* fashion shoot direction
* cinematic prompt workflow
* visual beat 기반 generation 준비

---

## 2. Prompt Studio (TJ)

### Unified Prompt Workflow Node

Prompt Studio (TJ)는 Prompt Enhancer와 Image to Prompt workflow를 하나로 통합한 노드입니다.

---

### 지원 모드

|모드|설명|
|-|-|
|Auto|입력 상태 기반 자동 모드|
|Prompt Enhancer|prompt 개선|
|Image to Prompt|이미지 기반 prompt 생성|

---

### 주요 기능

|기능|설명|
|-|-|
|Mode Switching|Prompt Enhancer / Image to Prompt 전환|
|Image Auto Detection|이미지 입력 자동 감지|
|GGUF backend|llama.cpp 기반 모델 지원|
|TextGenerate backend|ComfyUI TextGenerate backend 지원|
|Advanced Toggle|고급 설정 숨김 / 펼침|
|Resize Lifecycle|모드별 노드 크기 유지|

---

### Resize 동작

Prompt Enhancer 모드:

```text
사용자 세로 크기 기억 및 복원
```

Image to Prompt 모드:

```text
기존 자동 높이 리셋 유지
```

가로 크기는 두 모드에서 공통 유지됩니다.

---

### 독립 파일 구조

```text
tj_prompt_studio.py
web/tj_prompt_studio.js
```

---

### v2.0.1 수정 사항

* 메뉴 등록 문제 수정
* JS mode switching 구조 안정화
* resize lifecycle 안정화

### v2.1 개선 사항

* LLM 카테고리 7개 노드 체계 안에서 Prompt Studio 위치 재정리
* Ollama LLM Loader / Quality Controller와 함께 사용하는 prompt workflow 가이드 추가
* image prompt / text prompt 전환 workflow 설명 보강

---

## 3. Image to Prompt (TJ)

### 이미지 기반 Prompt 생성 노드

Image to Prompt (TJ)는 입력 이미지를 분석하여 prompt text를 생성하는 LLM 계열 노드입니다.

---

### 주요 기능

|기능|설명|
|-|-|
|Image Analysis|이미지 기반 prompt 생성|
|GGUF backend|llama.cpp backend 지원|
|TextGenerate backend|ComfyUI TextGenerate backend 지원|
|models/text_encoders|전용 모델 경로 기반 로딩|
|mmproj_file optional|none 선택 가능|
|Advanced Toggle|고급 설정 숨김 / 펼침|
|CLIP Auto Switching|CLIP 연결 시 TextGenerate 모드 자동 전환|

---

### v2.0.1 수정 사항

* 메뉴 미등록 문제 수정
* `VISION_TASK_OPTIONS` 참조 오류 수정
* chat_handler 기존 llama_cpp import 방식 유지
* Advanced hide 시 노드 하단 여백 자동 축소

---

### 추천 사용

* reference image caption
* image style extraction
* lookbook prompt generation
* image prompt reverse engineering

---

## 4. Prompt Enhancer (TJ)

### Prompt Enhancement Node

Prompt Enhancer (TJ)는 기존 prompt를 더 구체적이고 생성 친화적인 prompt로 개선하는 노드입니다.

---

### 주요 기능

|기능|설명|
|-|-|
|Prompt Enhancement|입력 prompt 개선|
|GGUF backend|llama.cpp backend 지원|
|TextGenerate backend|ComfyUI TextGenerate backend 지원|
|models/text_encoders|전용 모델 경로 기반 로딩|
|mmproj_file|mmproj 선택 위젯|
|Advanced Toggle|고급 설정 숨김 / 펼침|
|CLIP Auto Switching|CLIP 연결 시 TextGenerate 모드 자동 전환|

---

### 추천 사용

* 짧은 prompt 확장
* style prompt 강화
* camera / lighting detail 추가
* production prompt refinement

---

## 5. Prompt Show & Locker (TJ)

### Prompt Inspect / Lock Node

Prompt Show & Locker (TJ)는 STRING prompt를 표시하고 queue pause 상태를 관리하기 위한 LLM utility 노드입니다.

---

### 주요 기능

|기능|설명|
|-|-|
|Prompt Display|STRING prompt 표시|
|Copy Button|Show Any 스타일 Copy 버튼|
|Copied Animation|Copy → Copied → Copy 복귀|
|PAUSED UI|PAUSED 상태 전용 메시지|
|Resize-safe|사용자 노드 높이 유지|
|Downstream Safety|PAUSED 상태 빈 데이터 출력 방지|

---

### PAUSED 상태

v2.0.1 기준:

* PAUSED 상태 메시지 자동 줄바꿈
* PAUSED 상태 메시지 TJ 보라색 컬러 적용
* PAUSED 상태 빈 데이터 downstream 출력 방지
* 큐 중단 UX 개선

---

### LLM Workflow 주의 사항

v2.0.1 기준 LLM 노드는 AutoSet provider 등록 구조 대신 일반 set_name / get_name fake-wire 방식을 사용합니다.
기존 `tj_cover_autoset_bridge.js` 의존은 제거되었습니다.

---


## 6. Ollama LLM Loader (TJ)

### Local Ollama LLM Caller

Ollama LLM Loader는 로컬 Ollama 서버를 호출하여 텍스트 응답을 생성하는 v2.1 LLM 노드입니다.
기존 GGUF / TextGenerate 계열과 별도로, Ollama 서버에 올라간 모델을 TJ_NODE workflow 안에서 직접 사용할 수 있게 합니다.

---

### 핵심 역할

* Ollama 모델 호출
* system_prompt / user_prompt 기반 응답 생성
* prompt_in 추가 입력 결합
* 이미지 입력 optional 지원
* thinking 분리 출력
* raw_response JSON 출력
* ComfyUI VRAM 정리 정책 제공
* Ollama 모델 메모리 유지 정책 제공

---

### 주요 입력

|입력|설명|
|-|-|
|get_name|embedded get provider 선택|
|setnode_name|응답을 provider로 등록할 이름|
|server_url|Ollama 서버 주소|
|model|Ollama 모델 선택|
|system_prompt|시스템 프롬프트|
|user_prompt|사용자 프롬프트|
|thinking|thinking 출력 분리 사용 여부|
|seed|seed 값|
|seed_mode|fixed / increment / decrement / randomize|
|temperature|응답 다양성|
|top_p|nucleus sampling|
|repeat_penalty|반복 억제|
|model_memory|Ollama 모델 유지 방식|
|keep_minutes|분 단위 유지 시간|
|comfy_vram_policy|LLM 호출 전 ComfyUI VRAM 정리 정책|

---

### Optional 입력

|입력|설명|
|-|-|
|image|Ollama vision 모델용 이미지 입력|
|prompt_in|외부 STRING prompt 입력|

prompt_in이 연결된 경우 prompt_in 내용과 user_prompt가 결합되어 Ollama로 전달됩니다.

---

### 출력

|출력|타입|설명|
|-|-|-|
|response|STRING|최종 응답 텍스트|
|thought_process|STRING|thinking 태그 또는 thinking stream 분리 결과|
|raw_response|STRING|provider / model / seed / meta / VRAM 정보가 포함된 JSON 문자열|

---

### Model Memory

|옵션|설명|
|-|-|
|Unload after run|실행 후 모델 unload|
|Keep for minutes|keep_minutes 동안 모델 유지|
|Keep loaded|모델을 계속 유지|

작업 방식에 따라 선택합니다.
여러 번 반복 호출할 경우 Keep for minutes 또는 Keep loaded가 유리할 수 있습니다.
VRAM / RAM 여유가 부족하면 Unload after run을 권장합니다.

---

### ComfyUI VRAM Policy

|옵션|설명|
|-|-|
|Auto: unload only before first LLM call|Ollama 모델이 이미 warm 상태면 ComfyUI unload 생략|
|Always unload before each LLM call|매 호출 전 ComfyUI 모델 unload|
|Never unload before LLM call|ComfyUI VRAM 정리 생략|

이미지 생성 모델과 Ollama를 같은 환경에서 함께 사용할 때 VRAM 충돌을 줄이기 위한 정책입니다.

---

### Progress UI

프론트엔드 JS는 Ollama 진행 상태를 수신하여 running / thinking / answer 상태를 표시합니다.
Stop LLM / Unload Model 같은 제어는 Ollama API와 연동됩니다.

---

### 추천 사용 상황

* 로컬 LLM으로 prompt 생성
* 룩북 / 화보 prompt 보강
* 이미지 caption 후속 정리
* Prompt Studio 이전 단계의 rough prompt 생성
* Queue Loop와 연결한 반복 prompt 생성

---

### v2.1 추가 사항

* 신규 LLM 노드로 추가
* Ollama `/api/chat` 호출 지원
* thinking / response 분리 출력
* raw_response 출력 추가
* image optional 입력 지원
* model_memory 정책 추가
* comfy_vram_policy 추가
* seed_mode 지원
* embedded set/get workflow 지원

---

## 7. LLM Content Quality Controller (TJ)

### LLM Quality Gate Node

LLM Content Quality Controller는 LLM 출력 또는 review text를 기준으로 후속 workflow를 통과시킬지 결정하는 v2.1 LLM 노드입니다.
단순 표시 노드가 아니라 **Quality Gate / Review Gate** 역할을 합니다.

---

### 핵심 목적

LLM 출력은 항상 안정적이지 않습니다.
잘못된 JSON, 비어 있는 prompt, 품질이 낮은 prompt, reject 키워드가 포함된 응답이 downstream generator로 바로 전달되면 결과 품질이 불안정해집니다.

이 노드는 review 결과에 따라 image / audio 흐름을 통과시키거나 block합니다.

---

### 주요 입력

|입력|설명|
|-|-|
|get_name_1|embedded get 입력 1|
|get_name_2|embedded get 입력 2|
|get_name_3|embedded get 입력 3|
|auto_set|QC 결과 provider 자동 등록|
|review_mode|Review / Pass|
|approve_once|현재 실패 결과 1회 승인|
|pass_words|통과 판정 키워드|
|reject_words|거절 판정 키워드|
|unclear_result|판정 불명확 시 Reject / Pass|
|seed|seed 값|
|seed_mode|fixed / increment / decrement / randomize|

---

### Optional 입력

|입력|설명|
|-|-|
|prompt_in|검사할 review text|
|image|통과 시 전달할 IMAGE|
|audio|통과 시 전달할 audio / any 데이터|

---

### 출력

|출력|타입|설명|
|-|-|-|
|QC_Image|IMAGE|통과 시 image 전달, 실패 시 block|
|QC_audio|ANY|통과 시 audio 전달, 실패 시 block|
|QC_result|ANY|Save / Preview routing 결과|

---

### Review Mode

|Mode|동작|
|-|-|
|Review|pass / reject 키워드를 기준으로 block 또는 통과|
|Pass|항상 downstream 통과, QC_result는 판정 결과 유지|

Review 모드에서 reject 판정이 나오면 workflow는 대기 상태가 되며, Approve Once 또는 Cancel 액션을 기다립니다.

---

### Pass / Reject 판정

기본 pass_words:

```text
OK, PASS, APPROVE, APPROVED
```

기본 reject_words:

```text
FAIL, REJECT, BAD
```

review text 안에서 해당 단어를 찾아 통과 여부를 판단합니다.
판정이 불명확할 경우 unclear_result 설정에 따릅니다.

---

### QC_result

|결과|용도|
|-|-|
|Save|통과 결과 저장 / 다음 단계 진행|
|Preview|검토 필요 결과 preview routing|

---

### 추천 Workflow

```text
Ollama LLM Loader
 ↓
LLM Content Quality Controller
 ↓
Prompt Show & Locker
 ↓
Z-Image Turbo
```

또는:

```text
Generated Image / Audio
 ↓
LLM Content Quality Controller
 ├─ QC_Image → Save
 └─ QC_result → Preview / Save branch
```

---

### v2.1 추가 사항

* 신규 LLM Quality Gate 노드로 추가
* 3개 embedded get 입력 지원
* Review / Pass 모드 지원
* approve_once 수동 승인 지원
* pass_words / reject_words 기반 판정
* unclear_result 정책 지원
* IMAGE / audio 흐름 block 지원
* QC_result 출력 추가
* Auto Set 기반 QC routing 지원

---

# Chapter 08 — Generator Node System

Generator 카테고리는 generation workflow를 확장하는 노드를 포함합니다.

현재 포함 노드:

* Z-Image Turbo (TJ)

---

## 1. Z-Image Turbo (TJ)

### Prompt-driven Turbo Generator Node

Z-Image Turbo (TJ)는 prompt 기반 generation workflow를 위한 generator 계열 노드입니다.

---

### 주요 기능

|기능|설명|
|-|-|
|Embedded Get/Set|wireless workflow 연결|
|Auto Set|provider 생성|
|Global Prompt Input|공통 prompt 입력|
|Positive Prompt Hide|positive prompt 영역 숨김|
|Negative Prompt Hide|negative prompt 영역 숨김|
|Textarea Resize|사용자 textarea 리사이즈|
|LoRA Button UI|add/remove lora 버튼 UI|
|Compact Preview|초기 compact preview 구조|
|Size Display|width x height / ratio / mega size 표시|

---

### Preview 구조

Z-Image Turbo는 compact preview 구조를 사용합니다.

목표:

* 초기 노드 높이 최소화
* 사용자 resize 유지
* preview center-fit
* reload-safe preview lifecycle 유지

---

### 이미지 사이즈 표시

자동:

```text
width x height (ratio : mega size)
```

manual:

```text
width x height (custom size)
```

형태로 표시합니다.

---

### v2.x 변경 사항

* widget layout 재배치
* batch size 위치 변경
* add lora 버튼 TJ 스타일 적용
* remove lora 버튼 red 스타일 적용
* textarea width sync 개선
* preview 초기 compact size 적용
* default model / clip / vae 값 적용 구조 보강
* Preview ON/OFF widget 제거
* 강제 custom preview draw 구조 제거

---

### v2.0.1 수정 사항

* Cover AutoSet provider survival 문제 수정
* provider cleanup 시 fake-wire 끊김 문제 수정
* Multi Image Loader 방식 reconnect lifecycle 적용

### v2.1 개선 사항

* Multi Model Selecter와 함께 사용하는 model routing workflow 가이드 추가
* Queue Loop 반복 생성 구조와 연결 가능한 generator section 설명 보강
* CLIP loader UI / provider lifecycle 개선 사항 반영

---

# Chapter 09 — Workflow Architecture & Real Production Guide

이 챕터부터는 v2.0.1 기준 전체 노드를 포함하여 실제 workflow 운영 구조를 다시 정리합니다.

---

## 1. TJ Workflow 기본 철학

TJ workflow의 핵심은 거대한 workflow 하나를 만드는 것이 아닙니다.
핵심은 작은 workflow section들을 wireless로 연결하는 것입니다.

---

### 추천 Section 구조

```text
INPUT
 ↓
PROMPT / LLM
 ↓
GENERATION
 ↓
EDIT
 ↓
UPSCALE
 ↓
PREVIEW
 ↓
VIDEO
 ↓
SAVE
```

v2.x부터 Prompt / LLM / Generator 영역이 명확히 분리되었습니다.
v2.1에서는 여기에 Local Ollama, LLM Quality Gate, Multi Model Routing, Queue Automation 구조가 추가되었습니다.

---

## 2. 카테고리 기반 실전 Workflow 구조

### INPUT / IMAGE Section

사용 노드:

* Multi Image Loader (TJ)
* Dynamic Image Batch(TJ)
* Dynamic Image Batch(Eclipse-TJ)
* Batch to Multi Image Output(TJ)

추천 목적:

* 이미지 입력
* batch 생성
* 해상도 normalize
* dataset 처리
* Eclipse metadata 유지

---

### WIRELESS Section

사용 노드:

* Set Node (TJ)
* Get Node (TJ)
* Multi Router(TJ)
* Multi Get Node (TJ)

추천 목적:

* section 간 long wire 제거
* provider routing
* branch 분리
* reload-safe reconnect

---

### UTILITY Section

사용 노드:

* Prompt Text (TJ)
* Text Concatenate (TJ)
* Smart Converter (TJ)
* Shortcut Launcher (TJ)
* Time Segment List (TJ)
* Multi Model Selecter (TJ)
* Queue Loop (TJ)

---

### LLM Section

사용 노드:

* Scene Maker (TJ)
* Prompt Studio (TJ)
* Image to Prompt (TJ)
* Prompt Enhancer (TJ)
* Prompt Show & Locker (TJ)
* Ollama LLM Loader (TJ)
* LLM Content Quality Controller (TJ)

---

### GENERATOR Section

사용 노드:

* Z-Image Turbo (TJ)

---

### PREVIEW Section

사용 노드:

* Show Any (TJ)
* Smart show (TJ)
* Save & Preview Image (TJ)

---

### VIDEO Section

사용 노드:

* LTX2. TJ Sampler
* Save & Preview Video (TJ)
* VHS Hotkey Remote

---

### SAVE Section

사용 노드:

* Save Image(Primary-TJ)
* Save Image(Suffix-TJ)
* Save Image(Eclipse Suffix-TJ)

---

## 3. Basic Image Generation Workflow

```text
Prompt Text
 ↓
Text Concatenate
 ↓
Z-Image Turbo / KSampler
 ↓
Save & Preview Image
 ↓
Save Image(Primary-TJ)
```

---

## 4. LLM Prompt Workflow

```text
Image to Prompt
 ↓
Prompt Enhancer
 ↓
Prompt Show & Locker
 ↓
Z-Image Turbo
 ↓
Save & Preview Image
```

또는:

```text
Prompt Studio
 ↓
Prompt Show & Locker
 ↓
Generation
```

---


## 4-1. Local Ollama Prompt Workflow

```text
Ollama LLM Loader
 ↓
Prompt Show & Locker
 ↓
Z-Image Turbo / Generation
 ↓
Save & Preview Image
```

추천 사용:

* 로컬 Ollama 모델로 prompt 초안 생성
* thinking / response 분리 확인
* ComfyUI VRAM unload 정책과 함께 안정적인 LLM 호출

---

## 4-2. LLM Quality Gate Workflow

```text
Ollama LLM Loader / Prompt Studio
 ↓
LLM Content Quality Controller
 ↓
Prompt Show & Locker
 ↓
Generation
```

이 구조는 LLM 출력이 바로 generator로 들어가기 전에 검수 단계를 추가합니다.
review text가 reject 판정을 받으면 downstream 흐름을 block하고, 사용자가 Approve Once로 1회 통과시킬 수 있습니다.

---

## 4-3. Model Routing Workflow

```text
Multi Model Selecter
 ↓
Generation / Loader / Debug
```

추천 사용:

* checkpoint 비교
* CLIP / VAE 교체 테스트
* model path 전달 workflow
* 여러 generator section의 모델 입력 통합 관리

---

## 4-4. Queue Automation Workflow

```text
Queue Loop
 ↓
Index 기반 Prompt / Image / Model 선택
 ↓
Generation
 ↓
Save
```

Queue Loop는 queue_count 기준으로 workflow를 반복 실행합니다.
index 출력은 Prompt Text, Dynamic Batch, Multi Image Loader, 외부 index 기반 노드와 연결하여 대량 생성 자동화에 사용할 수 있습니다.

---

## 5. Scene Workflow

```text
Scene Maker
 ↓
Prompt Show & Locker
 ↓
Prompt Studio / Prompt Enhancer
 ↓
Z-Image Turbo
```

추천 사용:

* 화보 컷 구성
* 룩북 scene prompt
* visual beat 생성
* cinematic shot planning

---

## 6. Dataset Batch Workflow

```text
Multi Image Loader
 ↓
Dynamic Image Batch
 ↓
Multi Router
 ├─ Preview
 ├─ Edit
 ├─ Upscale
 └─ Save
```

추천 설정:

|항목|추천|
|-|-|
|resize mode|long edge|
|scale mode|center crop|
|metadata 유지|Eclipse batch|
|preview|Save & Preview Image|

---

## 7. Wireless Production Workflow

```text
INPUT
 ↓
Set Node

GENERATION
 ↓
Get Node

PREVIEW
 ↓
Embedded Get

SAVE
 ↓
Suffix Save
```

핵심 규칙:

```text
Section 내부 = 짧은 wire
Section 간 = wireless
```

---

## 8. Video Production Workflow

```text
LTX2. TJ Sampler
 ↓
Save & Preview Video
 ↓
Preview Playback
 ↓
Save / Decode / Remux
```

VHS preview를 사용하는 경우:

```text
VHS Preview Node 선택
 ↓
Space / Alt 단축키
 ↓
Preview 제어
```

---

## 9. Save Chain Workflow

```text
Base Result
 ↓
Save Image(Primary-TJ)

Upscale
 ↓
Save Image(Suffix-TJ)

Detail Pass
 ↓
Save Image(Suffix-TJ)

Dataset / Eclipse
 ↓
Save Image(Eclipse Suffix-TJ)
```

---

## 10. Recommended Best Practices

|추천|이유|
|-|-|
|카테고리별 section 분리|workflow 구조 명확화|
|Embedded Get 적극 사용|노드 수 감소|
|Multi Router 중심 branch|section 관리|
|Provider naming 규칙화|debug 편의|
|Preview checkpoint 사용|결과 비교|
|Primary → Suffix 저장|결과 추적|
|LLM prompt QA 단계 추가|prompt 안정성|
|Show Any / Smart Converter 병행|타입 문제 해결|
|Ollama Loader 사용 시 VRAM 정책 확인|ComfyUI 모델과 LLM 메모리 충돌 방지|
|LLM Quality Controller 사용|LLM 출력 검수 및 downstream 안정화|
|Queue Loop 사용 시 queue_count / end_index 분리 이해|반복 횟수와 index 범위 혼동 방지|
|Multi Model Selecter로 모델 routing 분리|모델 비교 workflow 관리 용이|

---

# Chapter 10 — Troubleshooting & Internal Systems

---

## 1. Wireless / Provider 문제

### Get 연결이 안 되는 경우

확인:

* provider 존재 여부
* duplicate provider
* workflow reload 상태
* 삭제된 Set Node 여부

해결:

```text
TJ Node
 → Refresh ALL Get Nodes
```

---

### Provider 리스트가 안 뜨는 경우

원인:

* Set Node 삭제
* invalid provider
* stale registry
* LLM 노드 provider 방식 변경

해결:

* provider 이름 확인
* workflow 저장 후 reload
* Refresh ALL Get Nodes 실행

---

## 2. Fake-Wire 문제

### Show ALL Wires에서 일부 wire가 안 보이는 경우

확인:

* Realtime Wires View Mode 상태
* Show ALL Wires 상태
* provider survival 상태
* Cover node reconnect 상태

v2.0.1 기준 Show Any, Scene Maker, Z-Image Turbo의 provider survival이 보강되었습니다.

---

## 3. Embedded Get 문제

Embedded Get가 none으로 리셋되는 경우:

* provider scan 실패
* reload 직후 provider registry 지연
* 삭제된 provider 참조

해결:

* provider 재선택
* Refresh ALL Get Nodes
* workflow 저장 후 reload

---

## 4. Smart Converter 문제

strict_mode OFF:

```text
WARN status + 기본값 반환
```

strict_mode ON:

```text
에러 발생
```

해결:

* Show Any로 입력 타입 확인
* output_type 재선택
* status output 확인

---

## 5. Preview 문제

### Preview black screen

확인:

* IMAGE batch 존재 여부
* decode frame 생성 여부
* browser autoplay 제한
* preview restore metadata 상태

---

### Fullscreen 종료 안 됨

원인:

* overlay pointer conflict
* fullscreen layer 충돌

해결:

* 최신 TJ preview 구조 사용
* ESC 또는 X 버튼 사용

---

## 6. Video / Audio 문제

### Audio playback 안 됨

확인:

* audio_a / audio_b 연결
* browser autoplay 정책
* muted 상태
* video+audio mode 설정

---

### A+B audio가 안 들리는 경우

확인:

* audio monitor 선택
* preview/save audio routing
* input audio dict 상태

---

## 7. LLM 노드 문제

### Image to Prompt 메뉴가 안 보이는 경우

v2.0.1에서 메뉴 등록 문제가 수정되었습니다.
문제가 지속되면 custom node reload, browser cache refresh, python import error를 확인합니다.

---

### Prompt Studio mode switching 문제

확인:

* 이미지 입력 상태
* Auto mode 여부
* JS 로드 상태
* node resize lifecycle 상태

---

### Prompt Show & Locker에서 출력이 비는 경우

v2.0.1 기준 PAUSED 상태에서 빈 데이터 downstream 출력 문제가 수정되었습니다.
문제가 있다면 queue pause 상태와 입력 STRING 상태를 확인합니다.

---


### Ollama LLM Loader에서 모델 목록이 안 보이는 경우

확인:

* Ollama 서버 실행 여부
* server_url 값
* Ollama에 모델이 pull 되어 있는지
* 방화벽 / localhost 접근 문제

기본 server_url:

```text
http://127.0.0.1:11434
```

---

### Ollama 호출 전후 VRAM 문제가 있는 경우

확인:

* comfy_vram_policy 설정
* model_memory 설정
* Keep loaded 사용 시 시스템 RAM / VRAM 여유

이미지 생성 모델과 LLM 호출을 같은 workflow에서 반복한다면 `Auto: unload only before first LLM call` 또는 `Always unload before each LLM call`을 테스트합니다.

---

### LLM Content Quality Controller에서 workflow가 멈춘 경우

원인:

* Review 모드에서 reject_words 감지
* unclear_result = Reject 상태에서 판정 불명확
* Approve Once 대기 상태

해결:

* review text 확인
* Approve Once 사용
* Pass 모드로 전환
* pass_words / reject_words 수정

---

### Queue Loop가 반복되지 않는 경우

확인:

* Start 버튼을 눌렀는지
* queue_count 값
* current_queue 상태
* ComfyUI queue 실행 실패 여부
* 브라우저 JS 캐시 상태

---

### Queue Loop index가 예상과 다른 경우

확인:

* start_index / end_index / step
* index_loop_mode
* queue_count는 반복 횟수이고 end_index는 index 범위라는 점

---

### Multi Model Selecter 출력이 비어 있는 경우

확인:

* select_type과 output_mode
* 선택한 슬롯의 모델 파일 존재 여부
* Path out인지 Direct out인지
* Checkpoints 선택 시 MODEL / CLIP / VAE 분리 출력 위치
* CLIP 선택 시 clip loader type

---

## 8. Generator 문제

### Z-Image Turbo preview 높이 문제

확인:

* 사용자 resize 상태
* preview ON/OFF widget 제거 여부
* textarea width sync 상태
* default model/clip/vae 값 확인

---

## 9. Save 문제

### 저장 위치 꼬임

원인:

* Primary context 없음
* invalid save chain
* metadata 유실

해결:

```text
Primary → Suffix
```

순서 유지.

---

### Eclipse path restore 실패

원인:

* original metadata 없음
* 일반 batch 사용
* Eclipse batch 미사용

해결:

```text
Dynamic Image Batch(Eclipse-TJ)
```

사용.

---

# Chapter 11 — TJ Cover Expansion System

## TJ Cover System 소개

TJ Cover System은 외부 노드를 TJ_NODE 스타일 workflow로 확장하기 위한 구조입니다.

---

## 핵심 개념

원본 노드를 직접 수정하지 않고 다음 기능을 추가하는 구조를 목표로 합니다.

* Embedded Get/Set
* Auto Set
* TJ Theme
* Widget Reorder
* Output Label Sync

---

## 적용 예시

v2.x에서 Cover 기반으로 리빌드 / 확장된 대표 노드:

* Scene Maker (TJ)
* Z-Image Turbo (TJ)

---

## Reload-safe Lifecycle

Cover 노드는 provider cleanup 시 fake-wire가 끊기지 않도록 lifecycle이 보강되었습니다.

개선 항목:

* provider survival
* reconnect lifecycle
* ghost cleanup
* fake-wire rebuild
* Multi Image Loader 방식 reconnect lifecycle 적용

---

## AutoSet 구조 변경

v2.0.1 기준 일부 LLM 노드의 Cover AutoSet provider 등록 구조는 제거되었습니다.
v2.1에서는 Queue Loop, Multi Model Selecter, LLM Content Quality Controller처럼 신규 노드별 목적에 맞는 Auto Set 구조가 추가되었습니다.

기존:

```text
auto_set
properties.auto_sets
syncGetNodesForAutoSets()
```

제거.

현재:

```text
일반 set_name / get_name fake-wire 방식
```

을 사용합니다.

---

# Chapter 12 — HTML5 UI System & Advanced Features

## 1. HTML5 Overlay System

TJ_NODE는 많은 기능을 Canvas draw만으로 처리하지 않습니다.
대신 HTML5 DOM Overlay 시스템을 적극 활용합니다.

|기능|설명|
|-|-|
|HTML5 video|video playback|
|HTML5 audio|audio player|
|DOM overlay|custom UI|
|fullscreen preview|image inspect|
|dynamic controller|runtime UI|

---

## 2. Keyboard Control System

지원 키:

|키|기능|
|-|-|
|F/f|fullscreen|
|ESC|fullscreen 종료|
|←|이전 이미지|
|→|다음 이미지|

---

## 3. VHS Hotkey Remote

TJ VHS Hotkey Remote는 일반 노드가 아닙니다.
VideoHelperSuite(VHS) preview를 키보드 단축키로 직접 제어하는 global utility extension입니다.

### 설치 위치

```text
ComfyUI/custom_nodes/ComfyUI-TJ_NODE/web/js/
```

파일명:

```text
tj_vhs_hotkey_remote.js
```

### 지원 단축키

|단축키|기능|
|-|-|
|Space|Pause / Play|
|Alt + H|Preview Hide|
|Alt + M|Mute|
|Alt + O|브라우저에서 열기|
|Alt + S|Preview Save|
|Alt + C|원본 경로 복사|
|Alt + Y|Sync Preview|

### 텍스트 입력 충돌 방지 (안전성)

노드의 텍스트 영역이나 프롬프트 입력창 등에서 텍스트를 타이핑하는 도중에는 단축키 이벤트가 동작하지 않도록 안전하게 차단됩니다. 이를 통해 타이핑 중 예기치 않게 영상이 재생/정지되거나 창이 숨겨지는 문제를 방지합니다.

---

## 4. Snapshot Detach System

TJ preview copy는 live mirror가 아닙니다.
detach snapshot 구조입니다.

추천 사용:

* compare
* checkpoint
* workflow 기록

---

# Chapter 13 — Anti-Patterns & Best Practices

## Anti-Patterns

### Duplicate Provider

```text
MAIN_IMAGE
MAIN_IMAGE
MAIN_IMAGE
```

### Giant Visible Wire

workflow 전체를 가로지르는 긴 visible wire.

### Random Naming

```text
aaa
test
temp
```

### Save Image 남발

Save 구조 없이 무작위 저장.

### LLM 출력 검증 없이 바로 생성

Prompt Show & Locker 또는 Show Any 없이 LLM 출력값을 바로 generation에 연결하면 prompt 문제 추적이 어려워질 수 있습니다.

### Dynamic Chaos Workflow

branch 구조 없는 giant workflow.

---

## Best Practices

|추천|이유|
|-|-|
|Image / Wireless / Utility / Preview / Video / LLM / Generator section 분리|구조 명확화|
|Stable provider naming|reconnect 안정화|
|Embedded Get 적극 사용|wire 감소|
|Multi Router branch 사용|section 분리|
|Prompt Show & Locker 사용|LLM prompt 검증|
|Smart Converter status 확인|타입 변환 안정화|
|Save Chain 유지|결과 추적|
|Eclipse workflow는 Eclipse batch 사용|metadata 유지|

---

# Appendix — v2.1 실제 노드 카테고리 체크리스트

TJ_NODE v2.1 기준 전체 노드 수는 31개입니다.

## Image — 8개

* Multi Image Loader (TJ)
* Save Image(Primary-TJ)
* Batch to Multi Image Output(TJ)
* Save & Preview Image (TJ)
* Save Image(Suffix-TJ)
* Save Image(Eclipse Suffix-TJ)
* Dynamic Image Batch(TJ)
* Dynamic Image Batch(Eclipse-TJ)

## Wireless — 4개

* Set Node (TJ)
* Get Node (TJ)
* Multi Router(TJ)
* Multi Get Node (TJ)

## Utility — 7개

* Prompt Text (TJ)
* Smart Converter (TJ)
* Text Concatenate (TJ)
* Shortcut Launcher (TJ)
* Time Segment List (TJ)
* Multi Model Selecter (TJ)
* Queue Loop (TJ)

## Preview — 2개

* Show Any (TJ)
* Smart show (TJ)

## Video — 2개

* LTX2. TJ Sampler
* Save & Preview Video (TJ)

## LLM — 7개

* Scene Maker (TJ)
* Prompt Studio (TJ)
* Image to Prompt (TJ)
* Prompt Enhancer (TJ)
* Prompt Show & Locker (TJ)
* Ollama LLM Loader (TJ)
* LLM Content Quality Controller (TJ)

## Generator — 1개

* Z-Image Turbo (TJ)

---

# v2.0.1 → v2.1 변경 요약

## Added

* Multi Model Selecter (TJ)
* Queue Loop (TJ)
* Ollama LLM Loader (TJ)
* LLM Content Quality Controller (TJ)
* Local Ollama Prompt Workflow 설명
* LLM Quality Gate Workflow 설명
* Model Routing Workflow 설명
* Queue Automation Workflow 설명

## Changed

* 전체 노드 수 27개 → 31개로 수정
* Utility 카테고리 5개 → 7개로 수정
* LLM 카테고리 5개 → 7개로 수정
* Chapter 04 Utility Node System에 신규 노드 2개 추가
* Chapter 07 LLM Node System에 신규 노드 2개 추가
* Chapter 09 Workflow Architecture & Real Production Guide를 v2.1 구조에 맞게 확장
* Troubleshooting에 Ollama / Quality Controller / Queue Loop / Multi Model Selecter 항목 추가

## Fixed / Improved 문서 반영

* Save & Preview Image reload / fake-wire 유지 개선 설명 추가
* Multi Router Auto Set / Dynamic Output lifecycle 개선 설명 추가
* Prompt Studio v2.1 workflow 연계 설명 추가
* Z-Image Turbo v2.1 model routing / queue automation 연계 설명 추가

---

# Final Notes

TJ_NODE는 단순 utility node pack이 아닙니다.

TJ_NODE는:

```text
Large Scale Workflow Architecture Toolkit
```

입니다.

TJ_NODE의 핵심은 와이어 제거가 아니라 대규모 workflow를 실제 운영 가능한 구조로 만드는 것입니다.

v2.1에서는 이 구조가 LLM / Prompt / Generator workflow를 넘어 Local Ollama Workflow, Model Routing Workflow, Queue Automation Workflow까지 확장되었습니다.

---

#스크린샷 : final TJ_NODE v2.1 workflow showcase
```
