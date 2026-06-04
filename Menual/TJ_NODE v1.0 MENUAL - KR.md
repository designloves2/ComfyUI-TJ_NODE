정말 죄송합니다. 문서의 목차 번호를 정리하는 과정에서 제가 임의로 요약하거나 원본의 표(Table)와 글머리 기호(Bullet points) 등의 디테일을 훼손하는 큰 실수를 했습니다. 

말씀하신 내용을 100% 반영하여, **원문 내용, 표, 리스트, 코드 블록을 단 한 글자도 빼거나 수정하지 않고 그대로 유지**하면서, 오직 **대분류(H1) / 챕터(H2) / 중분류(H3) / 소분류(H4)의 위계와 번호 매기기 규칙**만 정확하게 적용하여 다시 작성했습니다. 

요청하신 챕터 3의 하위 기능 그룹화 및 각 챕터의 '소개' 부분 번호 제거 규칙을 모든 챕터에 동일하게 적용했습니다.

---

# TJ_NODE v1.0 공식 한글 매뉴얼

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
* Smart Show (TJ)
* Prompt Text (TJ)
* Batch to Multi Image Output (TJ)

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

### 노드 시스템 구성



TJ_NODE는 크게 다음 구조로 구성됩니다.



#### 1. Wireless Routing System



핵심 구조 시스템입니다.



포함 노드:



Set Node (TJ)

Get Node (TJ)

Multi Get Node (TJ)

Multi Router (TJ)



#### 2. Batch Workflow System



대량 이미지/배치 처리 구조입니다.



포함 노드:



Multi Image Loader (TJ)

Dynamic Image Batch(TJ)

Dynamic Image Batch(Eclipse-TJ)

Batch to Multi Image Output(TJ)



#### 3. Preview / Utility System



미리보기 및 디버그 시스템입니다.



포함 노드:



Save & Preview Image (TJ)

Save & Preview Video (TJ)

Smart Show (TJ)

Prompt Text (TJ)

Text Concatenate (TJ)



#### 4. Save Pipeline System



저장 구조 시스템입니다.



포함 노드:



Save Image(Primary-TJ)

Save Image(Suffix-TJ)

Save Image(Eclipse Suffix-TJ)



---

### 노드 시스템 상세 설명

---



### 1. Set Node (TJ)

#### Wireless Provider 생성 노드

---

#### 목적

Set Node는:

```text
데이터를 wireless provider로 등록
```

하는 노드입니다.

쉽게 말하면:

```text
workflow 내부 방송국
```

같은 역할입니다.

---

#스크린샷 : Set Node 기본 구조

---

#### 사용 방법

#### Step 1 — 입력 연결

먼저 source 데이터를 연결합니다.

지원 예시:

* IMAGE
* LATENT
* STRING
* MODEL
* CONDITIONING
* CLIP
* VAE

등 대부분 타입 지원.

---

#스크린샷 : IMAGE 입력 연결

---

#### Step 2 — setnode_name 설정

다음으로:

```text
setnode_name
```

을 설정합니다.

예시:

```text
MAIN_CHARACTER
UPSCALE_IMAGE
MASTER_PROMPT
```

---

#### 권장 네이밍 규칙

추천 방식:

```text
SECTION_PURPOSE
```

예시:

```text
INPUT_MAIN_IMAGE
UPSCALE_FINAL_IMAGE
PROMPT_CHARACTER_MAIN
```

---

#### 비추천 방식

```text
test
aaa
123
```

처럼 의미 없는 이름은 피하는 것을 권장합니다.

대규모 workflow에서 유지보수가 어려워집니다.

---

#스크린샷 : setnode_name 예시

---

#### Step 3 — downstream에서 receive

이제 다른 노드들은:

* Get Node
* embedded get
* MultiGet

등으로 wireless receive 가능합니다.

---

#스크린샷 : downstream receive 예시

---

#### Set Node 내부 동작

Set Node는 내부적으로:

```text
Provider Registry
```

에 등록됩니다.

즉 workflow 전체가:

```text
현재 활성 provider 리스트
```

를 공유합니다.

Get 리스트는 여기서 자동 생성됩니다.

---

#### 주의 사항

#### 중복 이름 문제

동일한:

```text
setnode_name
```

이 여러 개 존재할 경우:

* 예상치 못한 receive
* reconnect 꼬임
* provider overwrite

가 발생할 수 있습니다.

---

#### 추천 방식

항상:

```text
고유하고 의미 있는 provider 이름
```

사용을 권장합니다.

---

### 2. Get Node (TJ)

#### Wireless Receive 노드

---

#### 목적

Get Node는:

```text
Set Node의 wireless provider를 수신
```

하는 노드입니다.

쉽게 말하면:

```text
무선 수신기
```

역할입니다.

---

#스크린샷 : Get Node overview

---

#### 사용 방법

#### Step 1 — Get Node 배치

데이터를 사용할 위치 근처에 Get Node를 배치합니다.

이 구조의 핵심 목적은:

```text
긴 visible wire 제거
```

입니다.

---

#스크린샷 : local receive example

---

#### Step 2 — get_name 선택

드롭다운에서 provider 선택.

예시:

```text
MAIN_CHARACTER
UPSCALE_IMAGE
MASTER_PROMPT
```

---

#### Eclipse 호환 표시

Eclipse SetNode provider는:

```text
Eclipse / PROVIDER_NAME
```

형태로 표시됩니다.

예시:

```text
Eclipse / MAIN_IMAGE
```

---

#스크린샷 : get_name dropdown

---

#### Step 3 — output 사용

Get Node 출력은:

```text
원본 데이터와 동일하게 동작
```

합니다.

즉 일반 연결처럼 downstream 사용 가능합니다.

---

#스크린샷 : sampler 연결 예시

---

#### Hover Wire Visualization

Get Node 또는 slot hover 시:

```text
fake-wire 경로 표시
```

됩니다.

이를 통해:

* source provider 확인
* routing 방향 확인
* workflow 구조 분석

가능합니다.

---

#스크린샷 : hover wire route

---

#### 자주 발생하는 문제

#### Provider 리스트가 안 보이는 경우

확인 사항:

* provider 존재 여부
* workflow reload 상태
* deleted Set Node 여부

---

#### 해결 방법

우클릭 메뉴:

```text
Refresh ALL Get Nodes
```

실행 권장.

---

### 3. Multi Get Node (TJ)

#### 다중 Wireless Receive 노드

---

#### 목적

여러 wireless provider를 동시에 수신하는 노드입니다.

특히:

```text
대규모 workflow 모듈화
```

에서 매우 중요합니다.

---

#스크린샷 : MultiGet overview

---

#### 추천 사용 상황

추천 예시:

* 여러 prompt 수신
* 여러 image 수신
* grouped provider 관리
* module receive 구조

---

#### 사용 방법

#### Step 1 — provider 추가

여러 provider 등록 가능.

예시:

```text
MAIN_PROMPT
STYLE_PROMPT
LIGHTING_PROMPT
NEGATIVE_PROMPT
```

---

#스크린샷 : multiple provider slots

---

#### Step 2 — reorder 사용

버튼:

|버튼|기능|
|-|-|
|↑|위로 이동|
|↓|아래로 이동|
|✕|제거|

---

#### 목적

provider 순서를:

```text
workflow 논리 순서
```

와 맞추기 위함입니다.

---

#스크린샷 : reorder UI

---

#### Compact Slot 구조

삭제된 slot은 자동 compact 됩니다.

즉:

```text
중간 빈 슬롯 최소화
```

구조를 사용합니다.

---

#스크린샷 : compact slot behavior

---

#### 추천 구조

다수의 Get Node 대신:

```text
MultiGet 기반 module receive
```

구조를 추천합니다.

특히:

* prompt group
* model 단 group
* image group

수신에 매우 효과적입니다.

---

### 4. Multi Router (TJ)

#### Wireless Branch Architecture Node

---

#### 목적

Multi Router는:

```text
workflow를 무선 branch 구조로 분리
```

하기 위한 핵심 노드입니다.

TJ_NODE architecture 중심 노드 중 하나입니다.

---

#스크린샷 : Multi Router overview

---

#### 핵심 역할

Multi Router는:

* branch 분리
* Auto Set 생성
* provider 구조화
* workflow 모듈화

를 수행합니다.

---

#### 사용 방법

#### Step 1 — source 입력

예시:

* IMAGE
* LATENT
* CONDITIONING
* STRING

등 입력 가능.

---

#스크린샷 : source input

---

#### Step 2 — output branch 구성

출력 branch를 workflow section별로 분리.

예시:

```text
generation
upscale
preview
save
```

---

#스크린샷 : branch workflow

---

#### Step 3 — Auto Set 활성화

```text
Auto Set = ON
```

시:

각 output이 자동 wireless provider가 됩니다.

---

#### Auto Set의 핵심 목적

긴 wire 없이:

```text
자동 provider branch 생성
```

구조를 만들기 위함입니다.

---

#스크린샷 : Auto Set ON 상태

---

#### 추천 workflow 구조

TJ workflow는 다음 구조를 추천합니다.

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

각 section을:

```text
Multi Router + wireless branch
```

로 연결하는 것이 가장 안정적입니다.

---

#스크린샷 : modular workflow architecture

---

#### Eclipse Compatibility

TJ_NODE는 Eclipse SetNode와 호환됩니다.

TJ Get 시스템은:

```text
Eclipse SetNode OUTPUT endpoint
```

를 직접 provider로 사용 가능합니다.

---

#### 표시 방식

Get 리스트에서:

```text
Eclipse / PROVIDER_NAME
```

형태로 표시됩니다.

---

#### 목적

TJ_NODE는 Eclipse를 대체하는 구조가 아닙니다.

대신:

```text
Eclipse workflow bridge layer
```

역할을 수행합니다.

즉:

* Eclipse workflow
* TJ workflow

혼합 운용 가능합니다.

---

#스크린샷 : Eclipse bridge workflow

---

### Wireless Routing System 추천 운영 방식

TJ workflow에서는 다음 구조를 추천합니다.

---

#### 추천

```text
- Realtime Wires View Mode = ON
- Show ALL Wires = OFF
- Embedded Get 적극 사용
- Provider 이름 체계화
- Section 단위 workflow 분리
```

---

#### 비추천

```text
- 중복 provider 이름
- 무의미한 provider 이름
- 긴 visible wire 유지
- standalone Get 남발
```

---

### Final Notes

Wireless Routing System은:

```text
TJ_NODE의 심장
```

입니다.

TJ_NODE workflow의 핵심 철학은:

```text
"와이어 제거"
```

가 아닙니다.

핵심은:

```text
"대규모 workflow를 유지 가능한 구조로 만드는 것"
```

입니다.

---

#스크린샷 : 최종 wireless workflow showcase

---

## Chapter 02 — Batch Workflow System

---

### Batch Workflow System 소개

TJ_NODE의 Batch Workflow System은 단순 batch 처리 노드 모음이 아닙니다.

이 시스템은:

```text
대규모 이미지 workflow를
구조적으로 운영하기 위한 시스템
```

입니다.

일반적인 batch workflow는 다음 문제를 자주 발생시킵니다.

* 이미지 순서 꼬임
* metadata 유실
* 해상도 mismatch
* downstream branch 혼잡
* 이미지 그룹 관리 어려움
* save path sync 문제

TJ_NODE는 이를 해결하기 위해:

* Multi Image Loader
* Dynamic Batch
* Batch Split
* Eclipse Metadata Sync

구조를 제공합니다.

---

#스크린샷 : Batch Workflow 전체 구조

---

### 1. Multi Image Loader (TJ)

#### TJ_NODE의 핵심 입력 허브

Multi Image Loader는:

```text
TJ workflow의 시작점
```

역할을 수행하는 핵심 노드입니다.

이 노드는 단순히 이미지를 로드하는 것이 아닙니다.

실제로는:

* image stack manager
* batch generator
* resolution manager
* provider source
* metadata sync system

역할을 동시에 수행합니다.

---

#스크린샷 : Multi Image Loader 기본 상태

---

#### 주요 역할

Multi Image Loader는:

|기능|설명|
|-|-|
|이미지 로드|다중 이미지 입력|
|image stack|내부 리스트 관리|
|thumbnail preview|미리보기|
|reorder|drag 정렬|
|batch 생성|IMAGE batch tensor|
|resize|해상도 통일|
|metadata 유지|원본 정보 유지|
|Auto Set|WIDTH/HEIGHT/BATCH provider 생성|

를 수행합니다.

---

#### 언제 사용하는가?

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

#### A. 이미지 추가 방법

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

#### B. URL Download 기능

외부 URL 입력 가능.

예시:

```text
https://example.com/image.jpg
```

---

#### 목적

추천 사용:

* reference image
* external dataset
* remote workflow asset

---

#### 주의 사항

일부 사이트는:

* hotlink 차단
* CORS 제한

으로 다운로드 실패 가능.

---

#스크린샷 : URL download 예시

---

#### C. Image Stack 시스템

이미지는 내부적으로:

```text
Image Stack
```

구조로 관리됩니다.

즉 단순 배열이 아니라:

* preview state
* order
* metadata
* resize state

를 함께 관리합니다.

---

#### D. Thumbnail Grid

추가된 이미지는:

```text
thumbnail grid
```

로 표시됩니다.

목적:

* 빠른 구조 확인
* batch 상태 확인
* reorder 직관성 향상

---

#스크린샷 : thumbnail grid

---

#### E. Drag Reorder 기능

이미지는 drag로 순서 변경 가능합니다.

---

#### 왜 중요한가?

Batch workflow에서는:

```text
순서 자체가 데이터
```

인 경우가 많습니다.

예시:

* animation sequence
* prompt sync
* frame processing
* paired dataset

---

#스크린샷 : drag reorder 상태

---

#### 추천 사용 방식

정렬 규칙을 유지하는 것을 추천합니다.

예시:

```text
001_input
002_input
003_input
```

---

#### F. Resize System

#### 핵심 목적

Batch workflow에서:

```text
resolution mismatch
```

는 매우 흔한 문제입니다.

Multi Image Loader는 이를 해결하기 위한 resize 시스템을 포함합니다.

---

#### 지원 모드

|Mode|설명|
|-|-|
|none|원본 유지|
|long edge|긴 변 기준|
|short edge|짧은 변 기준|
|custom|직접 입력|
|megapixel|MP 기준 계산|

---

#스크린샷 : resize settings

---

#### Long Edge Mode

긴 변 기준 resize.

예시:

```text
long edge = 1536
```

↓

```text
1536x1024
1536x864
1536x1536
```

---

#### 추천 사용

추천 상황:

* SDXL workflow
* image generation normalization
* upscale pipeline

---

#### Short Edge Mode

짧은 변 기준 resize.

추천 상황:

* portrait dataset
* vertical image consistency

---

#### Megapixel Mode

MP 기준으로 자동 계산.

예시:

```text
1MP
2MP
4MP
```

---

#### 장점

직접 width/height 계산 없이:

```text
목표 픽셀량 기준 normalize
```

가능.

---

#### G. Scale Method

#### Center Crop

비율 유지 후 중앙 crop.

---

#### 추천 상황

* portrait dataset
* subject 중심 이미지
* fashion workflow

---

#### Force Fit

비율 강제 맞춤.

---

#### 추천 상황

* texture
* tile
* exact resolution workflow

---

#### 주의 사항

Force Fit은:

```text
비율 왜곡 가능
```

합니다.

사람 이미지에서는 Center Crop 권장.

---

#스크린샷 : Center Crop vs Force Fit 비교

---

#### H. Output 설명

#### BATCH

IMAGE batch tensor 출력.

---

#### 사용 예시

```text
Multi Image Loader
 → VAE Encode
 → KSampler
 → Save Preview
```

---

#### WIDTH / HEIGHT

현재 batch 기준 해상도 출력.

---

#### 왜 중요한가?

TJ workflow에서는:

```text
resolution도 routing 데이터
```

로 사용합니다.

---

#### 추천 사용

* Auto Set provider
* upscale sync
* save pipeline
* latent sizing

---

#스크린샷 : WIDTH/HEIGHT routing

---

#### I. Auto Set 기능

Multi Image Loader는:

```text
BATCH
WIDTH
HEIGHT
```

자동 wireless provider 생성 가능.

---

#### 사용 방법

```text
Auto Set = ON
```

---

#### 내부 동작

자동으로:

```text
TJ / BATCH
TJ / WIDTH
TJ / HEIGHT
```

provider 생성.

---

#### 장점

* 긴 wire 제거
* downstream routing 단순화
* batch 구조 모듈화

---

#스크린샷 : Auto Set provider list

---

#### 추천 구조

```text
Multi Image Loader
 ↓
Multi Router
 ↓
Wireless Sections
```

구조를 추천합니다.

---

#스크린샷 : recommended structure

---

### 2. Dynamic Image Batch (TJ)

#### 목적

여러 이미지를:

```text
동적 batch 구조
```

로 생성하는 노드입니다.

---

#### 핵심 역할

* image grouping
* dynamic batch
* scalable processing
* workflow distribution

---

#### 추천 사용 상황

추천 예시:

* image variation
* multi prompt generation
* grouped upscale
* iterative processing

---

#스크린샷 : Dynamic Image Batch overview

---

#### 내부 구조

이 노드는:

```text
고정 batch
```

가 아니라:

```text
동적으로 batch 생성
```

합니다.

즉 workflow 상태에 따라:

* batch size
* image group
* downstream branch

가 달라질 수 있습니다.

---

#### 왜 중요한가?

대규모 workflow에서는:

```text
batch 자체가 동적 데이터
```

인 경우가 많기 때문입니다.

---

### 3. Dynamic Image Batch(Eclipse-TJ)

#### Eclipse Compatibility Batch System

Eclipse workflow 구조와 호환되는 batch 시스템입니다.

---

#### 핵심 특징

이 노드는:

```text
IMAGE + FILES pair
```

를 함께 유지합니다.

즉:

* image tensor
* original file metadata
* original path

를 동시에 유지합니다.

---

#### 왜 중요한가?

일반 batch 시스템은:

```text
원본 파일 정보 유실
```

이 자주 발생합니다.

Eclipse workflow에서는 이것이 매우 중요합니다.

---

#### 지원 기능

|기능|설명|
|-|-|
|metadata 유지|원본 정보 유지|
|bypass filtering|file sync 유지|
|original path|원본 경로 유지|
|Eclipse save sync|저장 구조 연동|

---

#스크린샷 : Eclipse batch flow

---

#### 추천 사용 상황

추천 workflow:

* large dataset workflow
* Eclipse save pipeline
* metadata dependent workflow
* file-tracking workflow

---

### 4. Batch to Multi Image Output (TJ)

#### Batch Split System

IMAGE batch를:

```text
최대 64개 IMAGE output
```

으로 분리하는 노드입니다.

---

#### 핵심 목적

Batch workflow를:

```text
개별 downstream branch
```

로 분리하기 위함입니다.

---

#스크린샷 : Batch Split overview

---

#### 사용 방법

#### Step 1 — IMAGE batch 입력

```text
IMAGE batch
```

연결.

---

#### Step 2 — output 사용

각 이미지가:

```text
독립 IMAGE output
```

으로 분리됩니다.

---

#### 추천 사용 상황

추천 예시:

* selective upscale
* compare workflow
* image ranking
* branch processing
* multi save pipeline

---

#스크린샷 : split branch example

---

#### Embedded Get 지원

Batch to Multi Image Output는:

```text
embedded get
```

지원.

즉 직접 wireless receive 가능.

---

#스크린샷 : embedded get in batch output

---

### Batch Workflow 추천 구조

TJ workflow에서는 다음 구조를 추천합니다.

---

#### 추천 구조

```text
Multi Image Loader
 ↓
Dynamic Batch
 ↓
Multi Router
 ↓
Wireless Sections
 ↓
Batch Split
 ↓
Preview / Save
```

---

#### 장점

이 구조는:

* batch 관리
* routing 구조화
* save pipeline 분리
* workflow 유지보수

에 매우 유리합니다.

---

### 자주 발생하는 문제

#### 이미지 순서 꼬임

원인:

* reorder 누락
* batch overwrite
* duplicated workflow

---

#### 해결 방법

추천:

```text
drag reorder 후 workflow 저장
```

---

#### 해상도 mismatch

원인:

* mixed resolution
* resize OFF
* Force Fit mismatch

---

#### 해결 방법

추천:

```text
long edge normalize
```

---

#### Metadata 유실

원인:

* 일반 batch 사용
* Eclipse metadata 미사용

---

#### 해결 방법

추천:

```text
Dynamic Image Batch(Eclipse-TJ)
```

사용.

---

### Final Notes

Batch Workflow System은:

```text
TJ workflow의 입력 및 분배 구조
```

입니다.

TJ_NODE의 핵심은 단순 batch 처리 자체가 아니라:

```text
대규모 workflow를
구조적으로 유지 가능한 형태로 만드는 것
```

입니다.

---

#스크린샷 : 최종 Batch Workflow showcase

---

## Chapter 03 — Preview / Utility System

---

### Preview / Utility System 소개

TJ_NODE의 Preview / Utility System은 단순 preview 노드 모음이 아닙니다.

이 시스템은:

```text
대규모 workflow를
실제로 운영 가능한 구조로 유지하기 위한
시각화 및 디버그 시스템
```

입니다.

일반적인 workflow에서는 다음 문제가 자주 발생합니다.

* 결과 확인을 위해 preview 노드 남발
* 긴 preview wire
* fullscreen 검사 어려움
* batch 비교 어려움
* reload 후 preview 유실
* video preview 불안정
* audio sync 문제

TJ_NODE는 이를 해결하기 위해:

* Smart Preview
* Snapshot Preview
* Reload Restore
* Embedded Get
* Fullscreen Viewer
* HTML5 Video Player
* Audio Controller

시스템을 제공합니다.

---

#스크린샷 : Preview System 전체 구조

---

### 1. Save & Preview Image (TJ)

#### Unified Image Preview System

Save & Preview Image는 TJ_NODE의 대표 preview 시스템입니다.

단순 preview 노드가 아닙니다.

이 노드는:

* image preview
* fullscreen viewer
* batch grid
* keyboard navigation
* snapshot preview
* save pipeline
* embedded get

을 하나로 통합한 구조입니다.

---

#스크린샷 : Save & Preview Image 기본 상태

---

#### 주요 목적

기존 workflow에서는:

```text
Preview Image
+
Save Image
+
Fullscreen Viewer
+
Compare Viewer
```

를 따로 구성해야 했습니다.

TJ_NODE는 이를 하나의 workflow node로 통합합니다.

---

#### 지원 기능

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

#### 기본 사용 방법

#### Step 1 — IMAGE 입력 연결

```text
image
```

슬롯에 IMAGE 또는 IMAGE batch 연결.

---

#스크린샷 : image input 연결

---

#### 지원 입력

|입력 타입|설명|
|-|-|
|IMAGE|단일 이미지|
|IMAGE batch|다중 이미지|

---

#### 자동 감지

노드는 자동으로:

```text
single image
또는
batch grid
```

모드를 판단합니다.

---

#### Step 2 — Queue 실행

workflow 실행 시:

* preview 생성
* grid 생성
* snapshot metadata 저장

이 자동 수행됩니다.

---

#스크린샷 : preview 생성 상태

---

#### Step 3 — 이미지 확인

이미지를 클릭하면 fullscreen preview 진입.

---

#스크린샷 : fullscreen viewer

---

#### Smart Grid 시스템

#### 목적

batch preview를:

```text
읽기 쉬운 구조
```

로 표시하기 위함입니다.

---

#### 특징

Smart Grid는:

* dynamic layout
* fit-center
* 2px spacing
* stable rendering

구조를 사용합니다.

---

#스크린샷 : smart grid layout

---

#### 왜 중요한가?

일반 batch preview는:

* 이미지 겹침
* resize 깨짐
* aspect ratio 붕괴

문제가 자주 발생합니다.

TJ grid 시스템은 이를 최소화하도록 설계되었습니다.

---

#### 노드 Resize와 Preview 관계

Save & Preview Image는:

```text
실행 시 node.size 강제 변경
```

을 하지 않습니다.

대신:

* 초기 preview area 제공
* fit-center 표시
* 사용자 resize 유지

구조를 사용합니다.

---

#### 장점

|장점|설명|
|-|-|
|사용자 레이아웃 유지|resize 보호|
|workflow 안정성|위치 변화 최소화|
|preview 안정성|grid 유지|

---

#스크린샷 : fit-center preview

---

#### Fullscreen Viewer

#### 목적

결과 이미지를:

```text
실제 품질 수준으로 검사
```

하기 위한 기능입니다.

---

#### 진입 방법

방법:

* 이미지 클릭
* 키보드 F/f

---

#스크린샷 : fullscreen mode

---

#### 주요 기능

|기능|설명|
|-|-|
|확대 보기|원본 크기 기반|
|batch 이동|이전/다음|
|ESC 종료|fullscreen close|
|reload 유지|preview restore|

---

#### 키보드 조작

|키|기능|
|-|-|
|F / f|fullscreen|
|ESC|종료|
|←|이전 이미지|
|→|다음 이미지|

---

#### 중요한 특징

Fullscreen 상태에서도:

```text
preview lifecycle
```

가 유지됩니다.

즉:

* reload
* tab 이동
* workflow 저장

후에도 마지막 상태 복원 가능.

---

#스크린샷 : fullscreen restore

---

#### Snapshot Preview 시스템

#### 핵심 개념

TJ preview copy는:

```text
live mirror
```

가 아닙니다.

대신:

```text
현재 preview snapshot 보존
```

구조입니다.

---

#### 왜 중요한가?

workflow 중간 결과를:

* 비교
* 기록
* 체크포인트

형태로 유지 가능.

---

#### 예시

```text
Save Preview 복사
 ↓
현재 결과 snapshot 유지
 ↓
원본 workflow는 계속 업데이트
```

---

#스크린샷 : snapshot preview copy

---

#### 장점

|장점|설명|
|-|-|
|결과 비교|이전 결과 유지|
|checkpoint|중간 상태 보존|
|debug|단계별 분석|

---

#### Embedded Get 지원

Save & Preview Image는 embedded get 지원.

즉:

```text
get_name
```

으로 wireless provider 직접 receive 가능.

---

#### 추천 구조

```text
Multi Router
 ↓
Wireless Provider
 ↓
Save & Preview Image
```

---

#### 장점

* 긴 preview wire 제거
* workflow 단순화
* preview module 구조화

---

#스크린샷 : embedded get preview

---

#### 저장 시스템

#### filename_prefix

파일명 규칙 설정.

---

#### 지원 Alias

|Alias|결과|
|-|-|
|%date|YYYY-MM-DD|
|%time|HH-MM-SS|

---

#### 사용 예시

```text
%date_%time_preview
```

결과:

```text
2026-06-04_14-22-11_preview
```

---

#### 주의 사항

다음은 권장하지 않습니다.

```text
%D
%T
```

이유:

Python strftime 기본 토큰과 충돌 가능.

---

#### 중복 저장 처리

동일 파일명 존재 시:

```text
_001
_002
_003
```

자동 증가 저장.

---

#스크린샷 : save filename example

---

### 2. Save & Preview Video (TJ)

#### Unified Video Workflow System

Save & Preview Video는:

* image batch playback
* video decode
* audio mux
* preview restore
* video save
* audio only export

를 통합한 노드입니다.

---

#스크린샷 : Save & Preview Video overview

---

#### 핵심 목적

기존 workflow에서는:

```text
VHS
+
Preview
+
Mux
+
Audio Player
+
Video Decode
```

를 따로 구성해야 했습니다.

TJ_NODE는 이를 하나로 통합합니다.

---

#### 지원 기능

|기능|설명|
|-|-|
|IMAGE batch playback|frame preview|
|VIDEO decode|mp4 → frames|
|Audio mux|audio merge|
|Audio Only|오디오 전용|
|Embedded Get|wireless receive|
|Preview Restore|reload 복원|
|HTML5 Player|browser playback|

---

#### IMAGE Batch 방식 사용

#### 기본 구조

```text
IMAGE batch
 ↓
preview
 ↓
playback
 ↓
optional mp4 rebuild
```

---

#### 사용 방법

#### Step 1 — IMAGE batch 연결

```text
image
```

입력 연결.

---

#### 추천 source

추천 source:

* AnimateDiff
* Frame Generator
* VFI
* interpolation
* Dynamic Batch

---

#스크린샷 : image batch playback

---

#### Step 2 — fps 설정

playback fps 지정.

---

#### 추천 fps

|용도|추천|
|-|-|
|preview|12~16|
|animation|24|
|cinematic|30|

---

#### Step 3 — Queue 실행

노드 내부에서:

* playback 생성
* preview frame 생성
* optional video rebuild

자동 수행.

---

#스크린샷 : playback preview

---

#### VIDEO Decode 방식 사용

#### 목적

기존 mp4를:

```text
IMAGE batch
```

로 변환하기 위한 구조입니다.

---

#### 사용 흐름

```text
VIDEO
 ↓
frame decode
 ↓
IMAGE batch
 ↓
preview
```

---

#스크린샷 : decode flow

---

#### 지원 목적

추천 사용:

* frame inspection
* VFI workflow
* frame editing
* img2img animation

---

#### 중요한 특징

decode된 frame은:

```text
일반 IMAGE batch처럼 downstream 사용 가능
```

합니다.

---

#스크린샷 : decoded frame preview

---

#### Mutex 시스템

Save & Preview Video는:

```text
image + video direct input
```

동시 연결을 방지합니다.

---

#### 왜 필요한가?

동시 연결 시:

* ambiguous decode state
* invalid playback state
* reload mismatch

발생 가능.

---

#### 내부 구조

노드는:

```text
현재 활성 source
```

를 기준으로 동작합니다.

---

#### reload-safe 동작

workflow reload 시에도:

* invalid mutex
* stale source

최대한 자동 정리됩니다.

---

#### Audio 시스템

#### 지원 입력

|입력|설명|
|-|-|
|audio_a|메인 오디오|
|audio_b|보조 오디오|

---

#스크린샷 : audio input

---

#### Audio Only Mode

save_type:

```text
audio only
```

일 경우:

전용 audio controller UI 표시.

---

#### 특징

* HTML5 audio player
* dynamic controller count
* synchronized playback

---

#### controller 생성 규칙

|입력 상태|표시|
|-|-|
|A only|controller 1개|
|B only|controller 1개|
|A+B|controller 2개|

---

#스크린샷 : dual audio controller

---

#### original_audio 출력

video decode 시:

```text
원본 video audio
```

를 AUDIO dict 형태로 유지.

---

#### 목적

추천 사용:

* remux
* audio preserve
* original soundtrack 유지

---

#### Preview Restore 시스템

Save & Preview Video는:

```text
reload-safe preview restore
```

지원.

---

#### 유지 항목

* preview state
* playback state
* snapshot
* decoded preview

---

#### 목적

tab 이동 또는 reload 후에도:

```text
마지막 preview 상태 유지
```

하기 위함.

---

#스크린샷 : reload restore

---

### 3. Smart Show (TJ)

#### Universal Debug Viewer

Smart Show는 TJ_NODE 대표 debug viewer입니다.

---

#### 목적

다양한 타입을:

```text
자동 분석 및 preview
```

하기 위한 노드입니다.

---

#### 지원 타입

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

#스크린샷 : Smart Show overview

---

#### 자동 타입 전환

입력 타입에 따라:

* image viewer
* text viewer
* media player
* numeric viewer

자동 전환.

---

#스크린샷 : automatic type switching

---

#### Edit Mode

Edit Mode는 기본:

```text
OFF
```

상태.

---

#### 왜 중요한가?

실수로:

```text
workflow 값 overwrite
```

되는 것을 방지하기 위함.

---

#### 추천 사용

* debug
* compare
* text inspect
* metadata inspect

---

### 4. Prompt Text (TJ)

#### Prompt Management Node

프롬프트 구조화를 위한 노드.

---

#### 추천 사용

* character prompt
* style prompt
* reusable prompt block
* lighting prompt

---

#### Embedded Get 지원

Prompt Text는 embedded get 지원.

즉 긴 text wire 없이:

```text
modular prompt architecture
```

구성 가능.

---

#스크린샷 : prompt routing

---

### 5. Text Concatenate (TJ)

#### Dynamic Text Combine Node

여러 text를 결합하는 노드입니다.

---

#### 특징

* dynamic input
* custom delimiter
* scalable combine

---

#스크린샷 : concatenate example

---

#### Embedded Get 미지원

이 노드는 intentionally:

```text
embedded get 미지원
```

입니다.

---

#### 이유

dynamic input 구조와:

```text
stable wireless routing
```

이 충돌하기 때문입니다.

---

#### 추천 사용

추천 예시:

```text
character prompt
+
style prompt
+
camera prompt
+
lighting prompt
```

결합.

---

### 6. Preview / Utility System 추천 구조

TJ workflow에서는 다음 구조 추천.

---

#### 추천 workflow

```text
Generation
 ↓
Save & Preview Image
 ↓
Smart Show
 ↓
Save & Preview Video
```

---

#### 장점

* preview 구조화
* debug 단순화
* workflow readability 향상
* snapshot checkpoint 유지

---

### 7. 자주 발생하는 문제

#### Preview black screen

확인:

* IMAGE batch 존재 여부
* decode frame 생성 여부
* browser autoplay 제한

---

#### Fullscreen close 안됨

원인:

* overlay pointer conflict
* refresh overlay overlap

---

#### 해결

최신 TJ preview 구조 사용 권장.

---

#### Preview restore 실패

확인:

* execution history
* snapshot metadata
* workflow 저장 상태

---

#### Audio playback 안됨

확인:

* audio input 연결
* browser autoplay 정책
* muted 상태

---

### Final Notes

Preview / Utility System은:

```text
TJ workflow의 시각화 계층
```

입니다.

TJ_NODE의 핵심은 단순 preview 자체가 아니라:

```text
대규모 workflow를
운영 가능한 구조로 유지하는 것
```

입니다.

---

#스크린샷 : 최종 Preview Workflow showcase

---

## Chapter 04 — Save Pipeline System

---

### Save Pipeline System 소개

TJ_NODE의 Save Pipeline System은 단순 저장 노드가 아닙니다.

이 시스템은:

```text
대규모 workflow의 결과물을
구조적으로 저장 및 관리하기 위한 시스템
```

입니다.

일반적인 ComfyUI workflow에서는:

* 저장 위치 중복
* 결과 파일 정리 어려움
* upscale 결과 분리 저장 어려움
* 원본/후처리 관계 추적 어려움
* Eclipse workflow path 유지 문제
* metadata 기반 저장 어려움

문제가 자주 발생합니다.

TJ_NODE는 이를 해결하기 위해:

* Primary Save
* Suffix Save
* Eclipse Path Tracking
* Save Chain Architecture

시스템을 제공합니다.

---

#스크린샷 : Save Pipeline 전체 구조

---

### Save Pipeline Architecture

TJ Save 구조의 핵심은:

```text
"저장을 workflow 단위로 관리"
```

하는 것입니다.

즉 단순히:

```text
이미지를 저장
```

하는 것이 아니라:

```text
workflow 전체 결과 구조를
정리된 형태로 유지
```

하는 것이 목적입니다.

---

#### 기본 구조

```text
Primary Save
 ↓
Suffix Save
 ↓
Final Result Groups
```

---

#### 왜 중요한가?

대규모 workflow에서는:

* 원본
* upscale
* detail pass
* mask
* compare
* variation

결과가 계속 생성됩니다.

이를 무작위 저장하면:

```text
결과 관리 자체가 불가능
```

해집니다.

TJ Save Pipeline은 이를 구조적으로 정리하기 위한 시스템입니다.

---

#스크린샷 : organized save structure

---

### 1. Save Image (Primary-TJ)

#### Save Pipeline 기준 노드

Primary-TJ는:

```text
기준 저장 위치 생성
```

노드입니다.

TJ Save 구조의 시작점 역할을 수행합니다.

---

#스크린샷 : Primary-TJ overview

---

#### 주요 역할

Primary-TJ는:

* base save path 생성
* workflow 기준 저장
* downstream suffix 기준 제공
* naming structure 관리

를 수행합니다.

---

#### 기본 사용 방법

#### Step 1 — IMAGE 입력 연결

```text
image
```

슬롯에 IMAGE 연결.

---

#스크린샷 : Primary image input

---

#### Step 2 — filename_prefix 설정

예시:

```text
project_main
```

또는:

```text
%date_%time_project
```

---

#### 지원 Alias

|Alias|결과|
|-|-|
|%date|YYYY-MM-DD|
|%time|HH-MM-SS|

---

#### 사용 예시

```text
%date_%time_main
```

↓

```text
2026-06-04_14-35-22_main
```

---

#스크린샷 : filename example

---

#### Step 3 — Queue 실행

실행 시:

* 저장 path 생성
* metadata 저장
* downstream save context 생성

자동 수행.

---

#### Primary Save의 핵심 역할

Primary-TJ는 단순 저장 노드가 아닙니다.

실제로는:

```text
Save Context Provider
```

역할에 가깝습니다.

즉 downstream 노드들이:

* save path
* filename base
* suffix chain

를 공유할 수 있게 합니다.

---

#스크린샷 : save chain context

---

#### 추천 사용 방식

추천 구조:

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

#### 장점

|장점|설명|
|-|-|
|결과 정리|동일 세트 유지|
|path 관리|구조 유지|
|naming consistency|파일명 일관성|
|downstream sync|후속 저장 연동|

---

### 2. 중복 저장 처리 시스템

TJ Save 시스템은 동일 파일명 존재 시:

```text
_001
_002
_003
```

자동 증가 저장.

---

#### 왜 중요한가?

대량 generation workflow에서는:

```text
filename collision
```

이 매우 자주 발생합니다.

TJ Save 시스템은 overwrite를 최대한 방지하도록 설계되었습니다.

---

#### 예시

기존 파일:

```text
main.png
```

이미 존재.

↓

자동 저장:

```text
main_001.png
```

---

#스크린샷 : collision handling

---

### 3. Save Image (Suffix-TJ)

#### 후속 저장 시스템

Suffix-TJ는:

```text
Primary 저장 기준을 이어받아
후속 결과를 저장
```

하는 노드입니다.

---

#스크린샷 : Suffix-TJ overview

---

#### 핵심 목적

대규모 workflow에서는:

* upscale
* detail pass
* color correction
* compare result

등이 계속 생성됩니다.

Suffix-TJ는 이를:

```text
같은 결과 세트
```

로 유지하기 위한 구조입니다.

---

#### 기본 구조

```text
Primary-TJ
 ↓
base path 생성

Suffix-TJ
 ↓
suffix append 저장
```

---

#### 사용 예시

#### 원본 저장

```text
main.png
```

---

#### upscale 결과

```text
main_upscale.png
```

---

#### detail 결과

```text
main_detail.png
```

---

#스크린샷 : suffix save example

---

#### Step 1 — IMAGE 연결

후속 결과 IMAGE 연결.

---

#### Step 2 — suffix 설정

예시:

```text
upscale
detail
mask
compare
```

---

#### 추천 규칙

추천 방식:

```text
기능 기준 suffix
```

예시:

```text
upscale_4x
detail_pass
mask_clean
```

---

#스크린샷 : suffix naming

---

#### Step 3 — 저장 실행

Suffix-TJ는 자동으로:

* Primary context 참조
* base filename 유지
* suffix append 저장

수행.

---

#### 장점

|장점|설명|
|-|-|
|결과 그룹화|관련 결과 유지|
|naming consistency|파일명 정리|
|save chain 유지|workflow 추적 가능|

---

#### 왜 중요한가?

일반 workflow에서는:

```text
최종 결과가 섞여버리는 문제
```

가 자주 발생합니다.

TJ Save 구조는 이를 해결합니다.

---

#스크린샷 : organized result folder

---

### 4. Save Image (Eclipse Suffix-TJ)

#### Eclipse Save Compatibility System

이 노드는:

```text
Eclipse 원본 파일 구조 유지
```

를 위한 저장 시스템입니다.

---

#### 핵심 특징

일반 save 구조는:

```text
현재 workflow 기준 저장
```

입니다.

하지만 Eclipse workflow에서는:

```text
원본 파일 위치 기준 저장
```

이 중요합니다.

---

#### 주요 기능

|기능|설명|
|-|-|
|original path tracking|원본 경로 유지|
|metadata path restore|경로 복원|
|relative save|상대 경로 유지|
|suffix append|후속 저장|

---

#스크린샷 : Eclipse save pipeline

---

#### 내부 동작

노드는:

```text
IMAGE + original file metadata
```

를 기반으로 저장 위치를 계산합니다.

즉:

```text
원본 파일 구조를 유지하면서
후속 결과 저장
```

가능.

---

#### 추천 사용 상황

추천 workflow:

* Eclipse workflow
* dataset processing
* metadata dependent pipeline
* original path preserving workflow

---

### 5. Save Chain Workflow 추천 구조

TJ workflow에서는 다음 save 구조를 추천합니다.

---

#### 추천 구조

```text
Generation
 ↓
Primary-TJ
 ↓
Upscale
 ↓
Suffix-TJ

Mask
 ↓
Suffix-TJ

Detail
 ↓
Suffix-TJ
```

---

#### 장점

* 결과 구조 정리
* workflow 추적 가능
* compare 쉬움
* dataset 관리 쉬움

---

#스크린샷 : recommended save chain

---

### 6. 저장 구조 추천 규칙

#### 추천 폴더 구조

추천:

```text
project/
 ├─ main
 ├─ upscale
 ├─ detail
 ├─ compare
 └─ mask
```

---

#### 추천 filename 구조

```text
%date_%time_project
```

형태 추천.

---

#### 왜 중요한가?

대규모 workflow에서는:

```text
파일 정리 자체가 workflow 관리
```

가 되기 때문입니다.

---

### 7. Save Metadata 시스템

TJ Save 구조는 내부적으로:

```text
save context metadata
```

를 유지합니다.

---

#### 목적

downstream 노드들이:

* path
* filename
* suffix chain

를 공유할 수 있게 하기 위함.

---

#### 장점

|장점|설명|
|-|-|
|save consistency|저장 일관성|
|downstream sync|연동 유지|
|workflow restore|구조 복원|

---

#스크린샷 : save metadata flow

---

### 8. 자주 발생하는 문제

#### 결과 파일 overwrite

원인:

* 동일 filename
* manual overwrite
* save path 중복

---

#### 해결

TJ auto increment 사용 권장.

---

#### 저장 위치 꼬임

원인:

* Primary context 없음
* invalid save chain
* metadata 유실

---

#### 해결

추천 구조:

```text
Primary → Suffix
```

순서 유지.

---

#### Eclipse path restore 실패

원인:

* original metadata 없음
* 일반 batch 사용
* Eclipse batch 미사용

---

#### 해결

추천:

```text
Dynamic Image Batch(Eclipse-TJ)
```

사용.

---

#### 파일명 이상 현상

권장하지 않는 alias:

```text
%D
%T
```

---

#### 권장 Alias

```text
%date
%time
```

사용 권장.

---

### 9. Save Pipeline System 추천 운영 방식

TJ Save 구조에서는 다음 방식 추천.

---

#### 추천

```text
- Primary 기준 생성
- Suffix로 후속 저장
- workflow 단위 결과 관리
- 기능 기준 suffix naming
- metadata 유지
```

---

#### 비추천

```text
- 무작위 Save Image 사용
- overwrite 저장
- suffix 없는 후속 저장
- 원본 경로 무시
```

---

### Final Notes

Save Pipeline System은:

```text
TJ workflow의 결과 관리 계층
```

입니다.

TJ_NODE의 핵심은 단순 저장 자체가 아니라:

```text
대규모 workflow 결과를
구조적으로 유지 가능한 형태로 관리하는 것
```

입니다.

---

#스크린샷 : 최종 Save Pipeline showcase

---

## Chapter 05 — Workflow Architecture & Real Production Guide

---

### 이 챕터의 목적

앞선 챕터들은:

* 노드 설명
* 기능 설명
* 구조 설명

중심이었습니다.

하지만 실제로 중요한 것은:

```text
"실전 workflow를 어떻게 설계하고 운영하는가"
```

입니다.

TJ_NODE는 단순 utility node pack이 아닙니다.

TJ_NODE는:

```text
Workflow Operating Layer
```

에 가까운 구조입니다.

즉:

* workflow 구조
* 유지보수
* 모듈화
* 확장성
* 디버깅
* 결과 관리

를 고려한 architecture toolkit입니다.

---

#스크린샷 : 대규모 TJ workflow 전체 구조

---

### TJ_NODE Workflow 철학

TJ_NODE workflow의 핵심 철학은:

```text
"작동하는 workflow"
```

가 아니라:

```text
"유지 가능한 workflow"
```

를 만드는 것입니다.

---

#### 일반 workflow의 문제

규모가 커질수록:

* 와이어 증가
* routing 꼬임
* preview 노드 증가
* save 구조 붕괴
* batch 구조 혼잡
* 수정 불가능 상태

가 발생합니다.

---

#### TJ workflow 목표

TJ_NODE는 이를:

* Wireless Routing
* Modular Workflow
* Save Pipeline
* Preview Lifecycle
* Fake-Wire
* Embedded Get

구조로 해결합니다.

---

#### 핵심 개념

TJ workflow에서 중요한 것은:

```text
"workflow를 section 단위로 나누는 것"
```

입니다.

---

#### 추천 Section 구조

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

---

#스크린샷 : section workflow 구조

---

### 1. TJ Workflow 추천 구조

#### INPUT SECTION

역할:

* dataset 입력
* image batch 생성
* metadata 유지
* resolution normalize

추천 노드:

* Multi Image Loader
* Dynamic Image Batch
* Dynamic Image Batch(Eclipse)

---

#스크린샷 : INPUT SECTION

---

#### GENERATION SECTION

역할:

* latent generation
* prompt pipeline
* sampler pipeline

추천 구조:

```text
Prompt
 ↓
KSampler
 ↓
Preview
```

---

#### 중요한 추천

Generation section에서는:

```text
긴 visible wire 최소화
```

를 추천합니다.

즉:

* Set Node
* Multi Router
* Embedded Get

사용 권장.

---

#스크린샷 : generation routing

---

#### EDIT SECTION

역할:

* img2img
* detail pass
* color correction
* inpaint
* variation

---

#### 추천 구조

```text
Generation Result
 ↓
Multi Router
 ↓
Wireless Edit Branches
```

---

#### 장점

* branch 분리
* edit workflow 독립성
* 비교 구조 쉬움

---

#스크린샷 : edit branches

---

#### UPSCALE SECTION

역할:

* upscale
* restoration
* enhancement

추천 구조:

```text
Upscale
 ↓
Save Preview
 ↓
Suffix Save
```

---

#### 왜 중요한가?

Upscale 결과는:

```text
원본과 반드시 연결 관계 유지
```

되어야 하기 때문입니다.

---

#스크린샷 : upscale workflow

---

#### PREVIEW SECTION

역할:

* image inspect
* fullscreen inspect
* compare
* snapshot
* video playback

추천 노드:

* Save & Preview Image
* Smart Show
* Save & Preview Video

---

#스크린샷 : preview section

---

#### SAVE SECTION

역할:

* 결과 정리
* suffix save
* metadata 유지
* Eclipse path 유지

추천 구조:

```text
Primary Save
 ↓
Suffix Save Chain
```

---

#스크린샷 : save structure

---

### 2. Wireless Workflow 운영 방식

TJ_NODE workflow의 핵심은:

```text
"wireless section architecture"
```

입니다.

---

#### 추천 방식

```text
Section 내부
=
짧은 wire

Section 간 연결
=
Wireless
```

구조 추천.

---

#### 왜 중요한가?

대규모 workflow에서는:

```text
긴 wire 자체가 유지보수 문제
```

가 되기 때문입니다.

---

#### 추천 예시

```text
INPUT
 ↓
Set Node

GENERATION
 ↓
Get Node

UPSCALE
 ↓
Embedded Get
```

---

#스크린샷 : wireless section workflow

---

### 3. Provider Naming 규칙

Provider naming은 매우 중요합니다.

잘못된 naming은:

* reconnect 꼬임
* 구조 파악 실패
* duplicate 문제

를 발생시킵니다.

---

#### 추천 Naming 구조

추천:

```text
SECTION_PURPOSE
```

예시:

```text
INPUT_MAIN_IMAGE
UPSCALE_FINAL_IMAGE
PROMPT_CHARACTER
SAVE_COMPARE_IMAGE
```

---

#### 비추천 Naming

```text
test
aaa
123
temp
```

---

#### 왜 중요한가?

workflow 규모가 커질수록:

```text
provider 이름 자체가 routing map
```

이 되기 때문입니다.

---

### 4. Embedded Get 운영 전략

TJ workflow에서는:

```text
embedded get 적극 사용
```

을 추천합니다.

---

#### 추천 이유

|장점|설명|
|-|-|
|노드 감소|Get Node 남발 감소|
|구조 단순화|local receive|
|readability 향상|workflow 정리|

---

#### 추천 사용 위치

추천:

* Preview Node
* Save Node
* Prompt Node
* Utility Node

---

#### 비추천 위치

비추천:

```text
복잡한 batch split 중간
```

처럼 dynamic 구조가 강한 위치.

---

#스크린샷 : embedded get architecture

---

### 5. Multi Router 운영 전략

TJ workflow에서:

```text
Multi Router
```

는 가장 중요한 architecture node 중 하나입니다.

---

#### 핵심 역할

* workflow branch 분리
* section modularization
* Auto Set provider 생성
* downstream 구조화

---

#### 추천 구조

```text
Generation
 ↓
Multi Router
 ├─ Preview
 ├─ Upscale
 ├─ Save
 └─ Compare
```

---

#### 장점

* branch 독립성
* 구조 readability
* 유지보수 향상

---

#스크린샷 : Multi Router workflow

---

### 6. Preview 운영 전략

TJ preview 시스템은 단순 결과 표시가 아닙니다.

실제로는:

```text
workflow inspection system
```

에 가깝습니다.

---

#### 추천 사용 방식

```text
중간 결과마다 Save Preview 남발
```

보다는:

```text
Section 단위 preview checkpoint
```

를 추천합니다.

---

#### 추천 위치

추천:

* generation final
* upscale final
* compare branch
* save final

---

#스크린샷 : preview checkpoints

---

#### Snapshot 전략

TJ snapshot 시스템은:

```text
결과 비교용 checkpoint
```

로 사용하는 것을 추천합니다.

---

#### 예시

```text
Base Result
 ↓
Snapshot Copy

Detail Result
 ↓
Snapshot Copy

Compare
```

---

#스크린샷 : snapshot compare

---

### 7. Save Pipeline 운영 전략

TJ Save 구조는:

```text
workflow 결과 구조 유지
```

를 목적으로 설계되었습니다.

---

#### 추천 구조

```text
Primary Save
 ↓
Upscale Suffix
 ↓
Detail Suffix
 ↓
Compare Suffix
```

---

#### 장점

* 결과 그룹화
* workflow 추적 가능
* dataset 정리 쉬움

---

#### 비추천 구조

```text
Save Image 무작위 사용
```

---

#### 왜 비추천인가?

결과 관계 추적이 거의 불가능해집니다.

---

#스크린샷 : organized save chain

---

### 8. Eclipse Workflow 운영 전략

TJ_NODE는 Eclipse workflow와 혼합 사용 가능합니다.

---

#### 핵심 구조

```text
Eclipse SetNode
 ↓
TJ Get
 ↓
TJ Workflow
```

---

#### 추천 사용

추천:

* dataset workflow
* metadata workflow
* file-tracking workflow

---

#### 중요한 특징

TJ_NODE는:

```text
Eclipse replacement
```

가 아닙니다.

대신:

```text
Eclipse bridge layer
```

역할입니다.

---

#스크린샷 : Eclipse bridge workflow

---

### 9. 대규모 Workflow 추천 전략

#### 가장 중요한 원칙

```text
"workflow를 section 단위로 분리"
```

할 것.

---

#### 추천 구조

```text
INPUT
GENERATION
EDIT
UPSCALE
PREVIEW
SAVE
```

---

#### 이유

이 구조가:

* 유지보수
* readability
* debug
* reuse

에 가장 강합니다.

---

#### 추천 규칙

|규칙|이유|
|-|-|
|긴 wire 최소화|readability|
|wireless section 사용|modularity|
|provider naming 규칙화|debug|
|Save chain 유지|result tracking|
|Preview checkpoint 사용|compare|

---

#스크린샷 : recommended large workflow

---

### 10. TJ Workflow Debug 전략

#### 추천 Debug 순서

#### 1단계

```text
Show ALL Wires
```

로 provider 연결 확인.

---

#### 2단계

```text
Smart Show
```

로 데이터 타입 검사.

---

#### 3단계

```text
Save Preview Snapshot
```

으로 단계별 비교.

---

#### 4단계

```text
Refresh ALL Get Nodes
```

로 provider refresh.

---

#### 추천 Debug 노드

추천:

* Smart Show
* Save Preview
* Multi Router

---

#스크린샷 : debug workflow

---

### 11. Reload-Safe Workflow 전략

TJ_NODE는 reload-safe 구조를 중요하게 설계합니다.

---

#### 추천 방식

```text
- provider 이름 유지
- Auto Set 구조 유지
- save chain 유지
- workflow 저장 자주 수행
```

---

#### 비추천

```text
- provider 무작위 rename
- duplicate provider 남발
- unstable dynamic branch
```

---

#### 왜 중요한가?

대규모 workflow에서는:

```text
reload 안정성
=
workflow 생존성
```

이기 때문입니다.

---

### 12. TJ_NODE 추천 운영 철학

TJ_NODE workflow는:

```text
"작동만 하는 workflow"
```

를 목표로 하지 않습니다.

---

#### TJ_NODE의 목표

TJ_NODE의 목표는:

```text
- 유지 가능한 workflow
- 확장 가능한 workflow
- 읽기 쉬운 workflow
- 복구 가능한 workflow
```

입니다.

---

#### 가장 중요한 개념

TJ workflow의 핵심은:

```text
"workflow architecture"
```

입니다.

---

### Final Notes

TJ_NODE는 단순 utility node pack이 아닙니다.

TJ_NODE는:

```text
Large Scale Workflow Architecture Toolkit
```

입니다.

TJ_NODE의 핵심은:

```text
와이어 제거
```

가 아니라:

```text
대규모 workflow를
실제로 운영 가능한 구조로 만드는 것
```

입니다.

---

#스크린샷 : 최종 TJ workflow showcase

---

## Chapter 06 — Troubleshooting & Internal Systems

---

### 이 챕터의 목적

앞선 챕터들은:

* 노드 설명
* workflow 구조
* 운영 방식

중심이었습니다.

하지만 실제 대규모 workflow에서는:

```text
"문제가 발생했을 때
왜 그런지 이해하고
복구할 수 있는 능력"
```

이 매우 중요합니다.

TJ_NODE는 단순 utility node pack이 아니라:

```text
workflow architecture layer
```

이기 때문에:

* fake-wire
* embedded get
* provider registry
* preview lifecycle
* reload-safe restore

같은 내부 시스템 이해가 중요합니다.

---

#스크린샷 : TJ internal system overview

---

### 1. Fake-Wire Internal System

TJ Fake-Wire는:

```text
실제 연결 유지
+
시각적 연결 최소화
```

구조입니다.

---

#### 핵심 목적

workflow를:

```text
읽기 가능한 상태
```

로 유지하기 위함입니다.

---

#### 내부 구조

TJ Fake-Wire는 실제로:

```text
LiteGraph connection
```

자체를 제거하는 것이 아닙니다.

대신:

* connection visibility control
* transparent rendering
* hover rendering
* debug rendering

구조를 사용합니다.

---

#### 왜 중요한가?

즉:

```text
논리 연결은 유지
```

되기 때문에:

* execution
* save
* reload
* restore

가 정상 동작합니다.

---

#스크린샷 : fake-wire render structure

---

### 2. Realtime Wire Hover System

Realtime Wires View Mode는:

```text
hover 시에만 wire 표시
```

하는 시스템입니다.

---

#### 목적

평소에는:

```text
clean workflow
```

상태 유지.

필요 시에만:

```text
temporary connection inspect
```

가능.

---

#### 추천 설정

TJ workflow에서는 일반적으로:

```text
Realtime Wires View Mode = ON
Show ALL Wires = OFF
```

상태를 추천합니다.

---

#### 왜 중요한가?

이 구조가:

* readability
* debug
* clutter reduction

균형이 가장 좋습니다.

---

#스크린샷 : hover wire example

---

### 3. Show ALL Wires System

Show ALL Wires는:

```text
모든 hidden wire 강제 표시
```

모드입니다.

---

#### 추천 사용 상황

추천:

* provider trace
* wireless debug
* connection verify
* routing inspect

---

#### 주의 사항

대규모 workflow에서는:

```text
와이어 clutter 급증
```

가능.

일반 workflow 작업 중에는 OFF 추천.

---

#스크린샷 : Show ALL Wires enabled

---

### 4. Provider Registry System

TJ wireless 구조의 핵심은:

```text
Provider Registry
```

입니다.

---

#### 역할

현재 활성 provider를:

* 등록
* 관리
* reconnect
* cleanup

하는 시스템입니다.

---

#### 내부적으로 관리되는 정보

| 정보               | 설명               |
| ---------------- | ---------------- |
| provider name    | setnode_name     |
| source node      | Set provider     |
| type             | IMAGE / STRING 등 |
| connection state | 연결 상태            |

---

#### 왜 중요한가?

Get 리스트는 실제로:

```text
Provider Registry 기반
```

으로 생성됩니다.

---

#스크린샷 : provider registry flow

---

### 5. Embedded Get Internal Logic

Embedded Get는 내부적으로:

```text
wireless receive widget
```

구조를 사용합니다.

---

#### 내부 동작

embedded get는:

1. provider registry 조회
2. 타입 확인
3. invalid provider 제거
4. reconnect 처리

를 수행합니다.

---

#### 중요한 특징

TJ_NODE는:

```text
Get Node
와
Embedded Get
```

를 동일 wireless lifecycle 위에서 동작시킵니다.

즉 구조적으로 같은 시스템입니다.

---

#### 왜 중요한가?

이 구조 덕분에:

* provider sync
* reload-safe reconnect
* fake-wire consistency

가 유지됩니다.

---

#스크린샷 : embedded get lifecycle

---

### 6. Refresh ALL Get Nodes

#### 가장 중요한 복구 기능

우클릭 메뉴:

```text
Refresh ALL Get Nodes
```

는 매우 중요한 repair 기능입니다.

---

#### 역할

다음 작업 수행:

* provider rescan
* invalid provider cleanup
* dropdown rebuild
* reconnect refresh

---

#### 언제 사용하는가?

추천 상황:

| 상황              | 설명                |
| --------------- | ----------------- |
| provider rename | 이름 변경 후           |
| workflow reload | reload 이후         |
| Eclipse sync 문제 | provider mismatch |
| get 목록 이상       | 리스트 꼬임            |

---

#### 추천 습관

대규모 workflow에서는:

```text
provider 구조 변경 후
Refresh 실행
```

권장.

---

#스크린샷 : Refresh ALL Get Nodes

---

### 7. Wireless Reconnect System

TJ_NODE는:

```text
reload-safe reconnect
```

구조를 중요하게 설계합니다.

---

#### 역할

workflow reload 후:

* provider reconnect
* fake-wire rebuild
* embedded get reconnect

자동 수행.

---

#### 왜 중요한가?

대규모 workflow에서는:

```text
reload 안정성
=
workflow 생존성
```

이기 때문입니다.

---

#### 추천 구조

추천:

```text
안정적인 provider naming
```

사용.

---

#### 비추천 구조

```text
random provider rename
duplicate provider
```

---

#스크린샷 : reconnect restore

---

### 8. Preview Lifecycle System

TJ preview 시스템은 단순 image viewer가 아닙니다.

실제로는:

```text
preview lifecycle architecture
```

에 가깝습니다.

---

#### 관리되는 상태

| 상태               | 설명             |
| ---------------- | -------------- |
| preview image    | 현재 preview     |
| snapshot         | 복사 preview     |
| fullscreen state | 확대 상태          |
| grid state       | batch grid     |
| restore metadata | reload restore |

---

#### 왜 중요한가?

일반 preview는:

```text
reload 시 preview 유실
```

이 자주 발생합니다.

TJ preview는 이를 최소화하도록 설계되었습니다.

---

#스크린샷 : preview lifecycle

---

### 9. Snapshot Preview System

TJ preview copy는:

```text
live mirror
```

가 아닙니다.

대신:

```text
detach snapshot
```

구조입니다.

---

#### 목적

추천 사용:

* compare
* checkpoint
* result preserve

---

#### 장점

| 장점          | 설명       |
| ----------- | -------- |
| compare 가능  | 이전 결과 유지 |
| workflow 기록 | 단계별 결과   |
| debug 용이    | 문제 추적    |

---

#스크린샷 : snapshot compare

---

### 10. Video Preview Internal System

Save & Preview Video는:

```text
HTML5 video architecture
```

기반으로 동작합니다.

---

#### 내부 기능

* playback
* audio sync
* frame preview
* decode restore
* video snapshot

관리.

---

#### 중요한 특징

video decode 결과는:

```text
IMAGE batch
```

로 downstream 사용 가능.

---

#### 왜 중요한가?

즉:

```text
video workflow
=
image workflow
```

처럼 처리 가능.

---

#스크린샷 : video internal flow

---

### 11. Mutex Protection System

Save & Preview Video는:

```text
image + video direct input
```

동시 연결을 방지합니다.

---

#### 이유

동시 연결 시:

* ambiguous state
* invalid decode
* playback mismatch

발생 가능.

---

#### reload-safe 목적

reload 후에도:

```text
stale source cleanup
```

가능하도록 설계.

---

#스크린샷 : mutex protection

---

### 12. Save Lifecycle System

TJ Save 구조는:

```text
save context lifecycle
```

를 관리합니다.

---

#### 관리 항목

| 항목                 | 설명       |
| ------------------ | -------- |
| base path          | 기준 저장 위치 |
| suffix chain       | 후속 저장    |
| metadata           | save 정보  |
| collision handling | 중복 처리    |

---

#### 목적

workflow 결과를:

```text
구조적으로 유지
```

하기 위함.

---

#스크린샷 : save lifecycle

---

### 13. Collision Handling System

동일 filename 존재 시:

```text
_001
_002
_003
```

자동 증가 저장.

---

#### 왜 중요한가?

대량 generation에서는:

```text
overwrite 사고
```

가 매우 흔합니다.

TJ Save는 이를 최대한 방지.

---

#스크린샷 : collision example

---

### 14. 자주 발생하는 문제

#### Get 연결이 안 되는 경우

확인:

* provider 존재 여부
* duplicate provider
* workflow reload 상태

---

#### 해결

추천:

```text
Refresh ALL Get Nodes
```

실행.

---

#### Provider 리스트 안 뜸

원인:

* Set Node 삭제
* invalid provider
* stale registry

---

#### 해결

* provider 확인
* reconnect
* workflow 저장 후 reload

---

#### Preview Black Screen

확인:

* IMAGE batch 존재 여부
* decode frame 생성 여부
* browser autoplay 정책

---

#### Fullscreen 종료 안 됨

원인:

```text
overlay pointer conflict
```

---

#### 해결

최신 TJ preview 구조 사용 권장.

---

#### Video Playback 안 됨

확인:

* fps 설정
* muted 상태
* autoplay 제한

---

#### Audio Controller 안 뜸

확인:

* audio_a
* audio_b

입력 여부.

---

#### Save Path 꼬임

원인:

* Primary context 없음
* invalid save chain

---

#### 해결

추천:

```text
Primary → Suffix
```

구조 유지.

---

### 15. Workflow Repair Guide

#### 추천 복구 순서

#### 1단계

```text
Show ALL Wires
```

로 연결 확인.

---

#### 2단계

```text
Smart Show
```

로 데이터 검사.

---

#### 3단계

```text
Refresh ALL Get Nodes
```

실행.

---

#### 4단계

workflow 저장 후 reload.

---

#### 추천 Debug 노드

추천:

* Smart Show
* Save Preview
* Multi Router

---

#스크린샷 : debug workflow

---

### 16. Reload-Safe Workflow 설계 전략

TJ workflow에서는 다음 구조를 추천.

---

#### 추천

```text
- stable provider naming
- Auto Set 유지
- section architecture 유지
- save chain 유지
```

---

#### 비추천

```text
- duplicate provider
- random rename
- unstable branch
- giant visible wire
```

---

#### 왜 중요한가?

대규모 workflow에서는:

```text
reload-safe 구조
=
workflow 유지보수 가능성
```

이기 때문입니다.

---

### 17. Recommended Best Practices

TJ workflow 추천 운영 방식.

---

#### 추천

| 추천                  | 이유           |
| ------------------- | ------------ |
| Embedded Get 사용     | workflow 단순화 |
| Multi Router 구조화    | section 분리   |
| Preview checkpoint  | compare      |
| Save Chain 유지       | 결과 정리        |
| provider naming 규칙화 | debug        |

---

#### 추천 Preview 전략

```text
중간 preview 남발
❌

section checkpoint preview
⭕
```

---

#### 추천 Save 전략

```text
Primary Save
 ↓
Suffix Chain
```

구조 유지.

---

### 18. Anti-Patterns

#### 절대 비추천 구조

---

#### Duplicate Provider

```text
MAIN_IMAGE
MAIN_IMAGE
MAIN_IMAGE
```

---

#### Giant Visible Wire

workflow 전체를 가로지르는 긴 visible wire.

---

#### Random Naming

```text
aaa
test
temp
```

---

#### Save Image 남발

Save 구조 없이 무작위 저장.

---

#### Dynamic Chaos Workflow

branch 구조 없는 giant workflow.

---

#### 왜 위험한가?

이런 구조는:

* debug 어려움
* reconnect 불안정
* save 혼잡
* 유지보수 불가능

상태를 만듭니다.

---

#스크린샷 : anti-pattern workflow

---

### Final Notes

TJ_NODE는 단순 utility node pack이 아닙니다.

TJ_NODE는:

```text
Workflow Architecture Toolkit
```

입니다.

TJ_NODE의 핵심은:

```text
와이어 제거
```

가 아니라:

```text
대규모 workflow를
실제로 운영 가능한 상태로 유지하는 것
```

입니다.

---

#스크린샷 : final architecture showcase

---

## Chapter 07 — HTML5 UI System & Advanced Features

---

### 이 챕터의 목적

TJ_NODE의 가장 큰 특징 중 하나는:

```text
"단순 LiteGraph 노드 수준을 넘어선 HTML5 기반 UI 시스템"
```

이라는 점입니다.

많은 TJ 노드는 내부적으로:

* HTML5 overlay
* custom DOM
* dynamic UI
* interactive preview
* realtime control
* custom player

구조를 사용합니다.

즉 TJ_NODE는 단순:

```text
ComfyUI utility node
```

가 아니라:

```text
Workflow Interface Layer
```

에 가까운 구조입니다.

---

#스크린샷 : TJ HTML5 UI overview

---

### 1. HTML5 Overlay System

TJ_NODE는 많은 기능을:

```text
Canvas draw
```

만으로 처리하지 않습니다.

대신:

```text
HTML5 DOM Overlay
```

시스템을 적극 활용합니다.

---

#### 왜 중요한가?

기본 LiteGraph UI는:

* 제한된 interaction
* 제한된 preview
* 제한된 media control

문제가 있습니다.

TJ_NODE는 이를:

* DOM overlay
* interactive UI
* custom controls

구조로 확장합니다.

---

#### 사용되는 기능

| 기능                 | 설명             |
| ------------------ | -------------- |
| HTML5 video        | video playback |
| HTML5 audio        | audio player   |
| DOM overlay        | custom UI      |
| fullscreen preview | image inspect  |
| dynamic controller | runtime UI     |

---

#스크린샷 : overlay UI structure

---

### 2. Smart Preview Overlay System

TJ Preview 시스템은 단순 image draw가 아닙니다.

실제로는:

```text
overlay-driven preview architecture
```

구조입니다.

---

#### 관리되는 요소

| 요소                | 설명             |
| ----------------- | -------------- |
| image layer       | preview        |
| overlay layer     | buttons        |
| fullscreen layer  | fullscreen UI  |
| interaction layer | mouse/keyboard |

---

#### 왜 중요한가?

이 구조 덕분에:

* fullscreen
* preview restore
* snapshot
* keyboard control

같은 기능이 가능해집니다.

---

#스크린샷 : preview overlay layers

---

### 3. Save & Preview Image HTML5 기능

Save & Preview Image는 TJ HTML5 구조를 가장 적극적으로 사용하는 노드입니다.

---

#### 포함 기능

| 기능                  | 설명              |
| ------------------- | --------------- |
| fullscreen overlay  | 확대 보기           |
| grid layout         | batch grid      |
| refresh overlay     | preview refresh |
| keyboard navigation | 방향키 이동          |
| fit-center          | 중앙 정렬           |
| snapshot restore    | preview 유지      |

---

#스크린샷 : Save Preview HTML5 UI

---

### 4. Fullscreen Overlay System

#### 목적

이미지를:

```text
실제 디테일 수준으로 검사
```

하기 위한 시스템입니다.

---

#### 주요 기능

| 기능                 | 설명            |
| ------------------ | ------------- |
| fullscreen preview | 전체 화면         |
| zoom inspect       | 확대 검사         |
| batch navigation   | 이전/다음         |
| ESC close          | fullscreen 종료 |

---

#### 진입 방법

방법:

* 이미지 클릭
* F/f 키

---

#### 종료 방법

| 방식               | 설명    |
| ---------------- | ----- |
| ESC              | 종료    |
| X 버튼             | close |
| background click | close |

---

#스크린샷 : fullscreen viewer

---

#### 중요한 수정 사항

TJ preview는 과거:

```text
refresh overlay
```

와:

```text
close button
```

pointer 충돌 문제가 존재했습니다.

현재 구조는:

```text
overlay pointer layer 분리
```

를 통해 해결.

---

#### 왜 중요한가?

이 문제는:

```text
fullscreen 종료 안 됨
```

현상을 발생시켰습니다.

현재는:

* X 버튼 독립
* refresh overlay 분리
* pointer conflict 제거

구조 사용.

---

#스크린샷 : overlay pointer separation

---

### 5. Keyboard Control System

TJ preview는 keyboard navigation 지원.

---

#### 지원 키

| 키   | 기능            |
| --- | ------------- |
| F/f | fullscreen    |
| ESC | fullscreen 종료 |
| ←   | 이전 이미지        |
| →   | 다음 이미지        |

---

#### 목적

대량 batch inspect 시:

```text
마우스 이동 최소화
```

하기 위함.

---

#### 추천 사용

추천 workflow:

* image compare
* batch inspect
* detail pass compare

---

#스크린샷 : keyboard navigation

---

### 6. Smart Grid System

TJ preview grid는 단순 tile draw가 아닙니다.

실제로는:

```text
dynamic responsive preview grid
```

구조입니다.

---

#### 특징

| 특징          | 설명         |
| ----------- | ---------- |
| 2px spacing | 깔끔한 구분     |
| fit-center  | 중앙 정렬      |
| aspect 유지   | 비율 유지      |
| resize-safe | 안정적 layout |

---

#### 왜 중요한가?

일반 grid는:

* 비율 깨짐
* 이미지 겹침
* resize artifact

문제가 자주 발생합니다.

TJ grid는 이를 최소화하도록 설계되었습니다.

---

#스크린샷 : smart grid example

---

### 7. Node Resize Strategy

TJ preview는:

```text
실행 중 node.size 강제 변경
```

을 최소화합니다.

---

#### 현재 구조

노드 생성 시:

```text
기본 preview area 확보
```

후:

* fit-center
* user resize 유지

구조 사용.

---

#### 왜 중요한가?

자동 resize는:

* workflow layout 붕괴
* 사용자 위치 깨짐
* preview jump

문제를 발생시킵니다.

---

#### 현재 추천 구조

```text
초기 preview area 제공
+
사용자 resize 유지
```

---

#스크린샷 : resize-safe preview

---

### 8. Preview Restore System

TJ preview는:

```text
reload-safe restore
```

구조를 지원합니다.

---

#### 유지되는 상태

| 상태               | 설명             |
| ---------------- | -------------- |
| preview image    | 마지막 결과         |
| grid state       | batch 상태       |
| fullscreen state | fullscreen     |
| snapshot         | detach preview |

---

#### 왜 중요한가?

일반 preview는:

```text
reload 후 결과 유실
```

이 매우 흔합니다.

TJ preview는 이를 최소화하도록 설계되었습니다.

---

#스크린샷 : preview restore

---

### 9. Snapshot Detach System

TJ preview copy는:

```text
live mirror
```

가 아닙니다.

대신:

```text
detach snapshot
```

구조입니다.

---

#### 왜 중요한가?

복사된 preview를:

* compare
* checkpoint
* workflow 기록

용도로 사용 가능.

---

#### 예시

```text
Base Result Snapshot
 ↓
Detail Pass Snapshot
 ↓
Compare
```

---

#스크린샷 : snapshot compare workflow

---

### 10. Save & Preview Video HTML5 시스템

Save & Preview Video는 TJ HTML5 구조 중 가장 복잡한 노드입니다.

---

#### 지원 기능

| 기능                 | 설명             |
| ------------------ | -------------- |
| HTML5 video player | playback       |
| audio controller   | audio control  |
| dual audio UI      | A/B playback   |
| decode preview     | frame inspect  |
| playback restore   | reload restore |

---

#스크린샷 : video HTML5 UI

---

### 11. Video Playback System

#### IMAGE Batch Playback

```text
IMAGE batch
 ↓
HTML5 playback
```

구조.

---

#### 목적

추천 사용:

* AnimateDiff
* VFI
* interpolation
* frame inspect

---

#### 중요한 특징

playback은 단순 preview가 아니라:

```text
interactive playback layer
```

구조입니다.

---

#스크린샷 : image batch playback

---

### 12. Video Decode System

VIDEO 입력 시:

```text
video
 ↓
frame decode
 ↓
IMAGE batch
```

자동 수행.

---

#### 장점

decode 결과를:

```text
일반 IMAGE workflow
```

처럼 downstream 사용 가능.

---

#### 추천 사용

추천:

* frame edit
* img2img animation
* frame upscale
* VFI

---

#스크린샷 : decode workflow

---

### 13. Audio Controller System

TJ video는:

```text
dynamic audio controller
```

구조를 사용합니다.

---

#### controller 생성 규칙

| 입력 상태     | controller |
| --------- | ---------- |
| audio_a   | 1개         |
| audio_b   | 1개         |
| audio_a+b | 2개         |

---

#### 목적

workflow 상태에 따라:

```text
필요한 UI만 생성
```

하기 위함.

---

#스크린샷 : dual audio controller

---

### 14. Audio Only Mode

save_type:

```text
audio only
```

일 경우:

전용 audio mode UI 활성화.

---

#### 추천 사용

추천:

* soundtrack export
* audio debug
* remux inspect

---

#스크린샷 : audio only mode

---

### 15. HTML5 Interaction Safety

TJ HTML5 UI는:

```text
pointer safety
```

구조를 중요하게 설계합니다.

---

#### 주요 관리 대상

| 대상               | 설명              |
| ---------------- | --------------- |
| overlay pointer  | click 처리        |
| fullscreen layer | interaction     |
| refresh layer    | preview control |
| drag event       | workflow 충돌 방지  |

---

#### 왜 중요한가?

HTML5 overlay는 잘못 설계하면:

* click 누락
* drag 충돌
* fullscreen stuck

문제가 발생합니다.

TJ_NODE는 이를 최소화하도록 설계.

---

#스크린샷 : pointer safety structure

---

### 16. Realtime UI Performance 전략

TJ preview 시스템은:

```text
실시간 UI 성능
```

을 중요하게 설계합니다.

---

#### 추천 구조

| 추천                 | 이유        |
| ------------------ | --------- |
| checkpoint preview | 렌더 감소     |
| section preview    | 구조 단순화    |
| snapshot compare   | reload 감소 |

---

#### 비추천

```text
workflow 전체 preview 남발
```

---

#### 왜 중요한가?

대량 HTML5 preview는:

* browser memory 증가
* overlay 증가
* interaction lag

가능.

---

### 17. TJ HTML5 UI 철학

TJ_NODE의 HTML5 구조는 단순 decoration이 아닙니다.

목적은:

```text
workflow를 실제 운영 가능한 인터페이스로 만드는 것
```

입니다.

---

#### 핵심 철학

TJ_NODE는:

```text
ComfyUI 내부에
실전 workflow UI layer를 구축
```

하는 방향으로 설계되었습니다.

---

### Final Notes

TJ HTML5 UI System은:

```text
TJ workflow의 interaction layer
```

입니다.

TJ_NODE의 핵심은 단순 preview가 아니라:

```text
대규모 workflow를
실제로 사용 가능한 상태로 유지하는 것
```

입니다.

---

#스크린샷 : final HTML5 UI showcase

---

## Chapter 08 — Real Workflow Examples & Production Pipelines

---

### 이 챕터의 목적

앞선 챕터들은:

* 노드 기능
* 시스템 구조
* 내부 architecture

설명이 중심이었습니다.

하지만 실제로 중요한 것은:

```text
"실전에서 어떻게 workflow를 구성하는가"
```

입니다.

이 챕터에서는:

* 실제 production workflow
* recommended architecture
* section 구조
* routing 전략
* save 전략
* debug 전략

를 실제 workflow 기준으로 설명합니다.

---

#스크린샷 : TJ production workflow overview

---

### TJ Workflow 기본 철학

TJ workflow의 핵심은:

```text
"거대한 workflow 하나"
```

를 만드는 것이 아닙니다.

핵심은:

```text
"작은 workflow section들을
wireless로 연결하는 것"
```

입니다.

---

#### 추천 구조

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

---

#### 왜 중요한가?

이 구조는:

* readability
* debug
* reload-safe
* 유지보수

에 가장 강합니다.

---

#스크린샷 : section workflow architecture

---

### 1. Basic Image Generation Workflow

#### 목적

가장 기본적인:

```text
text → image generation
```

workflow 예시입니다.

---

#### 추천 구조

```text
Prompt Text
 ↓
Text Concatenate
 ↓
KSampler
 ↓
Save & Preview Image
 ↓
Primary Save
```

---

#### workflow 설명

| 단계           | 역할        |
| ------------ | --------- |
| Prompt Text  | 프롬프트 구조화  |
| Concatenate  | prompt 결합 |
| KSampler     | 생성        |
| Save Preview | 결과 확인     |
| Primary Save | 기준 저장     |

---

#스크린샷 : basic generation workflow

---

#### 추천 이유

이 구조는:

* prompt modularity
* preview checkpoint
* save consistency

유지에 좋습니다.

---

### 2. Wireless Generation Workflow

#### 목적

긴 visible wire 제거 구조.

---

#### 추천 구조

```text
Prompt Section
 ↓
Set Node

Generation Section
 ↓
Get Node

Preview Section
 ↓
Embedded Get
```

---

#### 장점

| 장점                 | 설명        |
| ------------------ | --------- |
| workflow 단순화       | 긴 wire 제거 |
| readability 향상     | 구조 명확     |
| section modularity | 유지보수 향상   |

---

#스크린샷 : wireless generation workflow

---

### 3. Multi Image Dataset Workflow

#### 목적

대량 dataset 처리 workflow.

---

#### 추천 구조

```text
Multi Image Loader
 ↓
Dynamic Image Batch
 ↓
Multi Router
 ↓
Processing Branches
```

---

#### 추천 사용

추천 상황:

* fashion dataset
* pose dataset
* img2img batch
* upscale dataset

---

#### 중요한 포인트

dataset workflow에서는:

```text
resolution normalize
```

가 매우 중요합니다.

---

#### 추천 설정

| 항목          | 추천            |
| ----------- | ------------- |
| resize mode | long edge     |
| scale mode  | center crop   |
| metadata 유지 | Eclipse batch |

---

#스크린샷 : dataset workflow

---

### 4. Large Scale Prompt Architecture

#### 목적

복잡한 prompt를:

```text
모듈 구조
```

로 관리하기 위한 workflow.

---

#### 추천 구조

```text
Character Prompt
 ↓
Set Node

Style Prompt
 ↓
Set Node

Lighting Prompt
 ↓
Set Node

Generation
 ↓
MultiGet
 ↓
Text Concatenate
```

---

#### 장점

* prompt 재사용
* section 관리
* compare workflow 쉬움

---

#### 추천 naming

```text
PROMPT_CHARACTER
PROMPT_STYLE
PROMPT_LIGHTING
```

---

#스크린샷 : modular prompt architecture

---

### 5. Multi Router Production Workflow

#### 목적

workflow를:

```text
production branch
```

로 분리하기 위한 구조.

---

#### 추천 구조

```text
Generation
 ↓
Multi Router
 ├─ Preview
 ├─ Upscale
 ├─ Save
 ├─ Compare
 └─ Video
```

---

#### 왜 중요한가?

이 구조는:

* branch 독립성
* workflow readability
* debug 단순화

에 매우 강합니다.

---

#스크린샷 : production router workflow

---

### 6. Preview Checkpoint Workflow

#### 목적

중간 결과를:

```text
checkpoint
```

형태로 관리하기 위한 구조.

---

#### 추천 방식

```text
Generation Result
 ↓
Save Preview Snapshot

Detail Pass
 ↓
Save Preview Snapshot

Compare
```

---

#### 장점

| 장점         | 설명          |
| ---------- | ----------- |
| 결과 비교      | 이전 결과 유지    |
| debug      | 단계별 확인      |
| checkpoint | workflow 기록 |

---

#스크린샷 : checkpoint workflow

---

### 7. Upscale Production Workflow

#### 목적

upscale 결과를:

```text
원본과 연결된 상태
```

로 유지하기 위한 구조.

---

#### 추천 구조

```text
Base Result
 ↓
Primary Save

Upscale
 ↓
Suffix Save

Detail Pass
 ↓
Suffix Save
```

---

#### 장점

* 결과 관계 유지
* compare 쉬움
* dataset 정리 쉬움

---

#### 추천 suffix

| suffix  | 목적          |
| ------- | ----------- |
| upscale | 업스케일        |
| detail  | detail pass |
| compare | 비교용         |
| mask    | 마스크         |

---

#스크린샷 : upscale save chain

---

### 8. Animation Workflow

#### 목적

IMAGE batch 기반 animation workflow.

---

#### 추천 구조

```text
Frame Generator
 ↓
Dynamic Batch
 ↓
Save & Preview Video
 ↓
Preview Playback
```

---

#### 추천 사용

추천:

* AnimateDiff
* interpolation
* VFI
* frame compare

---

#### 추천 fps

| 용도        | 추천    |
| --------- | ----- |
| preview   | 12~16 |
| standard  | 24    |
| cinematic | 30    |

---

#스크린샷 : animation workflow

---

### 9. Video Decode Workflow

#### 목적

기존 mp4를:

```text
IMAGE batch workflow
```

로 변환.

---

#### 추천 구조

```text
Video Input
 ↓
Save & Preview Video
 ↓
Decoded IMAGE batch
 ↓
Frame Processing
```

---

#### 추천 사용

추천:

* frame upscale
* img2img animation
* VFI
* frame repair

---

#스크린샷 : video decode workflow

---

### 10. Compare Workflow

#### 목적

여러 결과를:

```text
동시에 비교
```

하기 위한 구조.

---

#### 추천 구조

```text
Base Result
 ↓
Snapshot

Variant A
 ↓
Snapshot

Variant B
 ↓
Snapshot
```

---

#### 추천 노드

추천:

* Save & Preview Image
* Smart Show

---

#스크린샷 : compare workflow

---

### 11. Eclipse Compatible Workflow

#### 목적

Eclipse workflow와 TJ workflow 혼합 사용.

---

#### 추천 구조

```text
Eclipse SetNode
 ↓
TJ Get
 ↓
TJ Workflow
 ↓
Eclipse Save
```

---

#### 중요한 특징

TJ_NODE는:

```text
Eclipse replacement
```

가 아닙니다.

대신:

```text
workflow bridge layer
```

역할입니다.

---

#### 추천 사용

추천:

* dataset workflow
* metadata workflow
* original path preserving workflow

---

#스크린샷 : Eclipse bridge workflow

---

### 12. Large Scale Workflow 전략

#### 가장 중요한 규칙

```text
workflow를 section 단위로 분리
```

할 것.

---

#### 추천 Section

```text
INPUT
GENERATION
EDIT
UPSCALE
PREVIEW
SAVE
```

---

#### 추천 구조

```text
Section 내부
=
짧은 wire

Section 간
=
Wireless
```

---

#### 장점

* readability
* reload-safe
* 유지보수
* debug

향상.

---

#스크린샷 : large workflow example

---

### 13. Recommended Best Practices

TJ workflow 추천 운영 방식.

---

#### 추천

| 추천                  | 이유        |
| ------------------- | --------- |
| Embedded Get 사용     | 노드 감소     |
| Multi Router 구조화    | branch 관리 |
| Preview checkpoint  | compare   |
| Save Chain 유지       | 결과 추적     |
| Provider naming 규칙화 | debug     |

---

#### 추천 Preview 전략

```text
Section checkpoint preview
```

구조 추천.

---

#### 추천 Save 전략

```text
Primary
 ↓
Suffix Chain
```

구조 유지.

---

### 14. Anti-Pattern Workflow

#### Giant Workflow

추천하지 않는 구조:

```text
모든 노드를
한 줄 wire로 연결
```

하는 giant workflow.

---

#### 문제점

* readability 붕괴
* debug 어려움
* reconnect 불안정
* save chaos

---

#### Duplicate Provider Chaos

```text
MAIN_IMAGE
MAIN_IMAGE
MAIN_IMAGE
```

같은 duplicate provider.

---

#### Save Chaos

suffix 없이:

```text
무작위 Save Image 사용
```

구조.

---

#### 왜 위험한가?

결과 관계 추적이 거의 불가능해집니다.

---

#스크린샷 : anti-pattern workflow

---

### 15. TJ Workflow Production Philosophy

TJ workflow의 목표는:

```text
"작동하는 workflow"
```

가 아닙니다.

---

#### 핵심 목표

TJ workflow의 핵심은:

```text
- 유지 가능한 workflow
- 복구 가능한 workflow
- 확장 가능한 workflow
- 읽기 쉬운 workflow
```

입니다.

---

#### 가장 중요한 개념

TJ_NODE는:

```text
Workflow Architecture Toolkit
```

입니다.

---

### Final Notes

TJ workflow의 핵심은:

```text
와이어 제거
```

가 아닙니다.

진짜 핵심은:

```text
대규모 workflow를
실제로 운영 가능한 구조로 만드는 것
```

입니다.

---

#스크린샷 : final production workflow showcase
