# ✨ TJ_NODE v0.9

## Advanced Wireless Workflow Architecture for ComfyUI
ComfyUI용 고급 무선 워크플로우 아키텍처 노드 시스템<br>
ComfyUI 高级无线工作流架构节点系统

---

# ✨ Overview

TJ_NODE는 복잡한 ComfyUI 워크플로우를 더 깔끔하고 구조적으로 관리하기 위해 설계된 고급 노드 패키지입니다.<br>
TJ_NODE is an advanced node package designed to organize complex ComfyUI workflows in a cleaner and more scalable way.<br>
TJ_NODE 是一个用于更高效整理复杂 ComfyUI 工作流的高级节点包。<br>
<br>
단순한 유틸리티 노드 모음이 아니라, 대규모 워크플로우를 위한 **Wireless Fake Wire Architecture**를 제공합니다.<br>
Rather than being just a collection of utility nodes, TJ_NODE introduces a complete **Wireless Fake Wire Architecture** for large-scale workflows.<br>
TJ_NODE 不只是一个工具节点集合，而是为大型工作流提供完整的 **Wireless Fake Wire Architecture（无线假连接架构）**。<br>

(스크린샷 #1 추가 위치)

---

# ✨ Why TJ_NODE Exists

ComfyUI의 워크플로우가 커질수록 복잡한 스파게티 와이어 문제로 인해 구조를 유지하기 어려워집니다.<br>
As ComfyUI workflows grow larger, spaghetti wires quickly become difficult to manage.<br>
随着 ComfyUI 工作流越来越大，复杂的连线会迅速失控。<br>

TJ_NODE는 이러한 문제를 해결하기 위해 설계되었습니다.<br>
TJ_NODE was designed specifically to solve this problem.<br>
TJ_NODE 正是为了解决这个问题而设计的。<br>

핵심 목표:
Core Goals:<br>
核心目标：<br>

* 더 읽기 쉬운 워크플로우

* 더 적은 와이어 혼잡

* 더 빠른 디버깅

* 더 구조적인 노드 설계

* 모듈형 워크플로우 구축

* Cleaner workflows

* Reduced wire clutter

* Faster debugging

* Better modular workflow architecture

* Large workflow scalability

* 更整洁的工作流

* 减少连线混乱

* 更快的调试

* 更模块化的架构

* 更适合大型工作流

(스크린샷 #2 추가 위치)

---

# 🚀 v0.9 Major Update

v0.9은 TJ_NODE의 Wireless System을 중심으로 완전히 재설계된 대규모 업데이트입니다.<br>
v0.9 is a major redesign centered around the TJ_NODE Wireless System.<br>
v0.9 是围绕 TJ_NODE Wireless System 进行的大规模重构版本。<br>

### ✨ New Features

| Feature                       | Description           |
| ----------------------------- | --------------------- |
| Wireless Fake Wire System     | 숨겨진 가상 연결 시스템         |
| Embedded Get System           | 일반 노드 내부에 Get 기능 내장   |
| Auto Set Providers            | 자동 Set Provider 생성    |
| Eclipse Bridge                | Eclipse SetNode 완전 호환 |
| Realtime Hover Wire Preview   | Hover 기반 숨겨진 와이어 표시   |
| Wireless Repair System        | 유령선 및 잘못된 연결 자동 정리    |
| Dynamic Provider Lifecycle    | 실시간 Provider 재연결      |
| Duplicate Provider Protection | Set 이름 중복 자동 방지       |

(스크린샷 #3 추가 위치)

---

# ✨ Wireless Fake Wire Architecture

TJ_NODE의 핵심은 **Invisible Fake Wire System** 입니다.<br>
The core of TJ_NODE is the **Invisible Fake Wire System**.<br>
TJ_NODE 的核心是 **Invisible Fake Wire System（隐藏式假连接系统）**。<br>

기존의 긴 와이어 대신:<br>
Instead of massive visible wires:<br>
代替传统的大量长连接线：<br>

```text
Load Image
 └────────────────────────────→ Sampler
```

TJ_NODE는 다음과 같이 동작합니다:<br>
TJ_NODE replaces this with:<br>
TJ_NODE 使用如下结构：<br>

```text
Load Image
 → Set
 → Get
 → Sampler
```

실제 그래프 연결은 유지되지만, 와이어는 숨겨진 상태로 관리됩니다.<br>
The graph connection still exists internally, but the wire is visually hidden.<br>
内部真实连接依然存在，但视觉上隐藏。<br>

(스크린샷 #4 추가 위치)

---

# ✨ Realtime Hover Wire Preview

Wireless hidden wire는 Hover 상태에서만 노란 점선으로 표시할 수 있습니다.<br>
Wireless hidden wires can be previewed as yellow dashed lines on hover.<br>
Wireless 隐藏连接线可在 Hover 时显示黄色虚线。<br>

Context Menu:

```text
TJ Node
 → Realtime Wires View Mode
```

| Mode | Description               |
| ---- | ------------------------- |
| OFF  | Hover 시 hidden wire 표시 안함 |
| ON   | Hover 시 hidden wire 표시    |

| 模式  | 说明             |
| --- | -------------- |
| OFF | Hover 时不显示隐藏连接 |
| ON  | Hover 时显示隐藏连接  |

(스크린샷 #5 추가 위치)

---

# ✨ Embedded Get System

TJ_NODE의 핵심 기능 중 하나는 일반 노드 내부에 Get 기능을 내장할 수 있다는 점입니다.<br>
One of TJ_NODE's key features is the ability to embed Get functionality directly inside normal nodes.<br>
TJ_NODE 的核心功能之一是可在普通节点内部嵌入 Get 功能。<br>

지원 노드:
Supported Nodes:<br>
支持节点：<br>

* Smart Show (TJ)
* Save & Preview Image (TJ)
* Prompt Text (TJ)
* Batch to Multi Image Output (TJ)
<br>
이제 별도의 Get Node 없이도 데이터를 무선으로 받을 수 있습니다.<br>
Data can now be received wirelessly without placing separate Get nodes everywhere.<br>
无需单独摆放 Get Node，即可无线接收数据。<br>

(스크린샷 #6 추가 위치)

---

# ✨ Eclipse SetNode Compatibility

TJ_NODE는 Eclipse SetNode와 완벽하게 연동됩니다.<br>
TJ_NODE fully supports Eclipse SetNodes.<br>
TJ_NODE 完全兼容 Eclipse SetNode。<br>

Get 메뉴에서:

```text
Eclipse / NAME
```

형태로 선택 가능합니다.<br>
You can directly select Eclipse providers from the Get menu.<br>
你可以直接从 Get 菜单选择 Eclipse Provider。<br>

TJ_NODE는 Eclipse SetNode의 OUTPUT endpoint를 직접 Wireless Provider로 사용합니다.<br>
TJ_NODE directly uses Eclipse SetNode OUTPUT endpoints as wireless providers.<br>
TJ_NODE 会直接将 Eclipse SetNode 的 OUTPUT 作为无线 Provider 使用。<br>

(스크린샷 #7 추가 위치)

---

# 🛠 Node Categories

| Category           | Description              |
| ------------------ | ------------------------ |
| Routing & Wireless | Set/Get/Multi Router 시스템 |
| Image              | 이미지 배치 및 로더 시스템          |
| Utility            | 텍스트/뷰어/디버그 유틸리티          |
| Eclipse            | Eclipse 기반 대용량 워크플로우 지원  |

모든 노드는 다음 카테고리 구조를 사용합니다.<br>
All nodes use the following category structure.<br>
所有节点使用以下分类结构。<br>

```python
CATEGORY = " ✨ TJ_Node/..."
```

또한 TJ_NODE 고유의 Purple & Black 테마가 자동 적용됩니다.<br>
TJ_NODE also automatically applies its custom Purple & Black theme.<br>
TJ_NODE 同时自动应用 Purple & Black 主题风格。<br>

```javascript
node.bgcolor = "#000000";
node.color = "#7612DA";
node.title_text_color = "#FFFFFF";
```

(스크린샷 #8 추가 위치)

---

## 🛠 Node Lineup / 노드 라인업 / 节点阵容

TJ_NODE v0.9은 Wireless Routing, Image Pipeline, Eclipse Workflow, Utility Viewer까지 포함하는 통합 노드 패키지입니다.<br>
TJ_NODE v0.9 is an integrated node package covering Wireless Routing, Image Pipelines, Eclipse Workflows, and Utility Viewers.<br>
TJ_NODE v0.9 是一个集成节点包，涵盖 Wireless Routing、Image Pipeline、Eclipse Workflow 与 Utility Viewer。<br>

---

### 1. Routing & Wireless Type / 라우팅 & 와이어리스 / 路由与无线类型

| Node                    | 한국어                                                              | English                                                                                    | 中文                                                |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| **Set Node (TJ)**       | 데이터를 무선으로 송신하기 위해 이름을 지정하는 Provider 노드입니다.                       | A provider node that assigns a wireless name to data.                                      | 为数据指定无线名称的 Provider 节点。                           |
| **Get Node (TJ)**       | Set Node에서 지정한 이름을 선택해 데이터를 수신합니다. 선은 투명하게 처리됩니다.                | Receives data by selecting a Set provider name. The wire is hidden visually.               | 通过选择 Set Provider 名称接收数据，连接线会被隐藏。                 |
| **Multi Get Node (TJ)** | 여러 개의 Set 데이터를 한 번에 가져와 순서대로 출력하는 통합 수신 노드입니다.                   | A multi-receiver node that collects several Set providers at once.                         | 可同时接收多个 Set Provider 的综合接收节点。                     |
| **Multi Router (TJ)**   | 최대 20개의 입출력을 라우팅하며, Auto Set ON 시 출력 슬롯이 자체 Set Provider로 동작합니다. | Routes up to 20 inputs/outputs; with Auto Set ON, each output becomes a wireless provider. | 支持最多 20 个输入/输出；开启 Auto Set 后，每个输出都可作为无线 Provider。 |

---

### 2. Standard Type / 기본형 파이프라인 / 标准流程类型

| Node                         | 한국어                                                        | English                                                                                                   | 中文                                          |
| ---------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Dynamic Image Batch (TJ)** | 표준 가변 이미지 배치 노드입니다. 연결된 이미지들을 하나의 batch로 묶고 해상도를 자동 정리합니다. | Standard dynamic image batch node. It collects connected images into one batch and normalizes resolution. | 标准动态图像 Batch 节点，可将多个图像合并为一个 Batch 并自动统一分辨率。 |
| **Save Image (Primary-TJ)**  | 단일 채널용 선행 저장 노드입니다. 저장된 원본 경로를 후속 노드로 전달합니다.               | Primary save node for single-channel pipelines. It passes saved file paths downstream.                    | 单通道流程的前置保存节点，会将保存路径传递给后续节点。                 |
| **Save Image (Suffix-TJ)**   | Primary 저장 경로를 받아 접미사, 확장자, 저장 위치를 적용해 후속 이미지를 저장합니다.      | Saves subsequent images by inheriting the Primary path and applying suffix, extension, and path options.  | 继承 Primary 保存路径，并应用后缀、扩展名和路径选项保存后续图像。       |

---

### 3. Eclipse Type / 이클립스 대용량 멀티 채널용 / Eclipse 大规模多通道类型

| Node                                 | 한국어                                                               | English                                                                                                           | 中文                                                        |
| ------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Dynamic Image Batch (Eclipse-TJ)** | Eclipse의 `IMAGE`와 `files` 정보를 세트로 받아 바이패스를 걸러내고 원본 파일 정보를 동기화합니다. | Receives Eclipse `IMAGE` and `files` pairs, filters bypassed items, and synchronizes original file metadata.      | 接收 Eclipse 的 `IMAGE` 与 `files` 成对数据，过滤 bypass 项并同步原始文件信息。 |
| **Save Image (Eclipse Suffix-TJ)**   | Eclipse 원본 경로를 역추적해 접미사, 확장자, 상대/절대 경로 규칙을 적용해 저장합니다.             | Traces the original Eclipse path and saves final images with suffix, extension, and relative/absolute path rules. | 追踪 Eclipse 原始路径，并根据后缀、扩展名、相对/绝对路径规则保存最终图像。                |

---

### 4. Utility Type / 유틸리티형 / 工具类型

| Node                                 | 한국어                                                  | English                                                                                               | 中文                                              |
| ------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Smart Show (TJ)**                  | 텍스트, 이미지, 영상, 오디오, 숫자, 리스트, 딕셔너리까지 표시하는 만능 뷰어 노드입니다. | Universal viewer node for text, image, video, audio, numbers, lists, dictionaries, and objects.       | 可显示文本、图像、视频、音频、数字、列表、字典与对象的万能查看节点。              |
| **Save & Preview Image (TJ)**        | 단일/배치 이미지 저장과 인노드 프리뷰, 팝업 뷰어를 결합한 이미지 저장 노드입니다.      | Image save node with in-node preview, batch viewer, and popup viewer.                                 | 集成节点内预览、Batch 查看器与弹出查看器的图像保存节点。                 |
| **Prompt Text (TJ)**                 | 복사/붙여넣기 툴바와 Embedded Get을 지원하는 텍스트 병합 노드입니다.         | Text merge node with clipboard toolbar and Embedded Get support.                                      | 支持剪贴板工具栏与 Embedded Get 的文本合并节点。                 |
| **Text Concatenate (TJ)**            | 가변 입력을 사용해 여러 텍스트를 구분자 기준으로 결합합니다.                   | Combines multiple text inputs using dynamic inputs and custom delimiters.                             | 使用动态输入与自定义分隔符合并多个文本。                            |
| **Multi Image Loader (TJ)**          | UI에서 이미지를 선택·정렬·다운로드·관리하여 배치 텐서로 로드하는 올인원 이미지 로더입니다. | All-in-one image loader for selecting, sorting, downloading, managing, and batching images in the UI. | 可在 UI 中选择、排序、下载、管理图像并输出 Batch Tensor 的一体化图像加载器。 |
| **Batch to Multi Image Output (TJ)** | 배치 텐서를 최대 64개의 개별 `IMAGE` 출력 슬롯으로 분리합니다.             | Splits a batch tensor into up to 64 individual `IMAGE` output slots.                                  | 将 Batch Tensor 拆分为最多 64 个独立 `IMAGE` 输出槽。        |

---

# Detailed Node Section: 
# 🖼 Multi Image Loader (TJ)

Multi Image Loader (TJ)는 TJ_NODE의 핵심 이미지 입력 노드입니다.<br>
Multi Image Loader (TJ) is the main image input node of TJ_NODE.<br>
Multi Image Loader (TJ) 是 TJ_NODE 的核心图像输入节点。<br>

UI에서 이미지를 직접 선택하고, 썸네일로 확인하고, 순서를 바꾸고, 외부 URL 다운로드까지 수행할 수 있습니다.<br>
It allows direct image selection, thumbnail preview, reordering, and external URL downloading inside the UI.<br>
它可以在 UI 中直接选择图像、查看缩略图、调整顺序，并支持外部 URL 下载。<br>

(스크린샷 #20 추가 위치)

## Main Features / 주요 기능 / 主要功能

| Feature        | 한국어                                                      | English                                                                  | 中文                                         |
| -------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| Image Stack UI | 여러 이미지를 UI 안에서 목록으로 관리합니다.                               | Manage multiple images in an in-node image stack.                        | 在节点 UI 内管理多个图像列表。                          |
| Thumbnail Grid | 썸네일 크기와 행 수를 조절하며 이미지를 확인합니다.                            | Preview images with adjustable thumbnail size and row count.             | 可调整缩略图大小和行数进行预览。                           |
| Drag Reorder   | 드래그로 이미지 순서를 변경합니다.                                      | Reorder images by drag and drop.                                         | 通过拖拽调整图像顺序。                                |
| URL Download   | 외부 이미지 URL을 다운로드해 목록에 추가합니다.                             | Download external image URLs and add them to the stack.                  | 下载外部图像 URL 并加入列表。                          |
| Resize System  | long edge, short edge, custom, megapixel 기준 리사이즈를 지원합니다. | Supports long edge, short edge, custom size, and megapixel resize modes. | 支持长边、短边、自定义尺寸与百万像素模式。                      |
| Auto Set       | BATCH, WIDTH, HEIGHT 출력을 자동 Set Provider로 등록합니다.         | Registers BATCH, WIDTH, and HEIGHT outputs as Auto Set providers.        | 将 BATCH、WIDTH、HEIGHT 输出自动注册为 Set Provider。 |

## Inputs / 입력 / 输入

| Name               | Type    | 한국어                                         | English                                               | 中文                                      |
| ------------------ | ------- | ------------------------------------------- | ----------------------------------------------------- | --------------------------------------- |
| `image_paths_json` | STRING  | UI에서 관리되는 이미지 경로 JSON입니다.                   | JSON list of image paths managed by the UI.           | 由 UI 管理的图像路径 JSON。                      |
| `match_mode`       | COMBO   | 비율 유지 또는 메가픽셀 기준 리사이즈 모드입니다.                | Resize mode based on input ratio or megapixel budget. | 基于输入比例或百万像素预算的缩放模式。                     |
| `resize_input`     | COMBO   | none, long edge, short edge, Custom을 선택합니다. | Select none, long edge, short edge, or Custom.        | 可选择 none、long edge、short edge 或 Custom。 |
| `edge_size`        | INT     | long/short edge 기준 픽셀값입니다.                  | Target pixel value for long/short edge modes.         | 长边/短边模式的目标像素值。                          |
| `custom_width`     | INT     | Custom 모드의 가로 크기입니다.                        | Width for Custom mode.                                | Custom 模式宽度。                            |
| `custom_height`    | INT     | Custom 모드의 세로 크기입니다.                        | Height for Custom mode.                               | Custom 模式高度。                            |
| `megapixel`        | FLOAT   | Megapixel 모드의 목표 픽셀 예산입니다.                  | Target pixel budget for Megapixel mode.               | Megapixel 模式的目标像素预算。                    |
| `interpolation`    | COMBO   | 리샘플링 알고리즘입니다.                               | Resampling algorithm.                                 | 重采样算法。                                  |
| `scale_method`     | COMBO   | Center Crop 또는 Force Fit 방식을 선택합니다.         | Select Center Crop or Force Fit.                      | 选择 Center Crop 或 Force Fit。             |
| `auto_set`         | BOOLEAN | 출력값을 자동 Set Provider로 등록합니다.                | Registers outputs as Auto Set providers.              | 将输出注册为 Auto Set Provider。               |

## Outputs / 출력 / 输出

| Name     | Type  | 한국어               | English                    | 中文                   |
| -------- | ----- | ----------------- | -------------------------- | -------------------- |
| `BATCH`  | IMAGE | 로드된 이미지 배치 텐서입니다. | Loaded image batch tensor. | 加载后的图像 Batch Tensor。 |
| `WIDTH`  | INT   | 출력 이미지 너비입니다.     | Output image width.        | 输出图像宽度。              |
| `HEIGHT` | INT   | 출력 이미지 높이입니다.     | Output image height.       | 输出图像高度。              |

## Example / 예제 / 示例

여러 이미지를 로드한 뒤 `BATCH`는 KSampler 또는 VAE Encode로 보내고, `WIDTH`, `HEIGHT`는 다른 노드에서 무선으로 받을 수 있습니다.<br>
Load multiple images, send `BATCH` to KSampler or VAE Encode, and receive `WIDTH` / `HEIGHT` wirelessly from other nodes.<br>
加载多张图像后，可将 `BATCH` 发送到 KSampler 或 VAE Encode，并让其他节点无线接收 `WIDTH` / `HEIGHT`。<br>

```text
Multi Image Loader (TJ)
 ├─ BATCH  → Image Pipeline
 ├─ WIDTH  → TJ / WIDTH
 └─ HEIGHT → TJ / HEIGHT
```

---

## Detailed Node Section: 
# 🧠 Smart Show (TJ)

Smart Show (TJ)는 단순 프리뷰 노드가 아니라, 워크플로우 안의 데이터를 확인하기 위한 범용 디버그 뷰어입니다.<br>
Smart Show (TJ) is not just a preview node; it is a universal debug viewer for inspecting workflow data.<br>
Smart Show (TJ) 不只是预览节点，而是用于检查工作流数据的万能调试查看器。<br>

이미지, 텍스트, 숫자, 리스트, 딕셔너리, 영상, 오디오를 자동 감지하여 표시합니다.<br>
It automatically detects and displays images, text, numbers, lists, dictionaries, video, and audio.<br>
它会自动识别并显示图像、文本、数字、列表、字典、视频和音频。<br>

(스크린샷 #21 추가 위치)

## Supported Data / 지원 데이터 / 支持数据

| Type          | 한국어                  | English                                      | 中文                |
| ------------- | -------------------- | -------------------------------------------- | ----------------- |
| IMAGE         | 이미지를 노드 안에서 표시합니다.   | Displays images inside the node.             | 在节点中显示图像。         |
| STRING        | 텍스트를 표시합니다.          | Displays text.                               | 显示文本。             |
| INT / FLOAT   | 숫자를 텍스트로 표시합니다.      | Displays numeric values as text.             | 将数字以文本形式显示。       |
| BOOL          | True/False 값을 표시합니다. | Displays boolean values.                     | 显示布尔值。            |
| LIST / DICT   | JSON 형태로 표시합니다.      | Displays list/dict values as JSON-like text. | 以 JSON 风格显示列表/字典。 |
| VIDEO / AUDIO | 미디어 플레이어로 표시합니다.     | Displays media using an in-node player.      | 使用节点内播放器显示媒体。     |

## Inputs / 입력 / 输入

| Name           | Type    | 한국어                                    | English                                     | 中文                        |
| -------------- | ------- | -------------------------------------- | ------------------------------------------- | ------------------------- |
| `input`        | *       | 표시할 입력 데이터입니다.                         | Input data to display.                      | 要显示的输入数据。                 |
| `get_name`     | COMBO   | Wireless Provider를 선택해 무선으로 데이터를 받습니다. | Select a wireless provider to receive data. | 选择无线 Provider 来接收数据。      |
| `setnode_name` | STRING  | 이 노드의 출력을 Set Provider로 내보냅니다.         | Exports this node output as a Set provider. | 将此节点输出作为 Set Provider 发送。 |
| `file`         | COMBO   | 로컬 파일을 직접 선택합니다.                       | Select a local file directly.               | 直接选择本地文件。                 |
| `edit_mode`    | BOOLEAN | 텍스트 수정 모드를 활성화합니다.                     | Enables text edit mode.                     | 启用文本编辑模式。                 |
| `text_content` | STRING  | 표시 또는 수정할 텍스트 내용입니다.                   | Text content to display or edit.            | 要显示或编辑的文本内容。              |

## Outputs / 출력 / 输出

| Name     | Type | 한국어                | English                        | 中文        |
| -------- | ---- | ------------------ | ------------------------------ | --------- |
| `output` | *    | 입력 데이터를 그대로 전달합니다. | Passes the input data through. | 原样传递输入数据。 |

## Features / 기능 / 功能

* Embedded Get 지원

* Wireless hidden wire 지원

* 이미지/텍스트/미디어 자동 감지

* 텍스트 편집 모드

* 영상/오디오 재생 컨트롤

* Batch Image Viewer 연동

* Embedded Get support

* Wireless hidden wire support

* Automatic image/text/media detection

* Text edit mode

* Video/audio playback controls

* Batch Image Viewer support

* 支持 Embedded Get

* 支持 Wireless hidden wire

* 自动检测图像/文本/媒体

* 文本编辑模式

* 视频/音频播放控制

* 支持 Batch Image Viewer

## Example / 예제 / 示例

KSampler 결과나 Prompt Text 결과를 별도 연결 없이 `get_name`으로 받아 바로 확인할 수 있습니다.<br>
You can inspect KSampler outputs or Prompt Text results directly through `get_name` without visible wires.<br>
可以通过 `get_name` 直接查看 KSampler 输出或 Prompt Text 结果，无需可见连线。<br>

```text
Prompt Text (TJ)
 └─ setnode_name: prompt_A

Smart Show (TJ)
 └─ get_name: TJ / prompt_A
```

---

## Detailed Node Section: 
# 🖼 Save & Preview Image (TJ)

Save & Preview Image (TJ)는 이미지 저장, 배치 프리뷰, 단일 이미지 확인, 키보드 탐색을 하나로 통합한 이미지 노드입니다.<br>
Save & Preview Image (TJ) combines image saving, batch preview, single image viewing, and keyboard navigation in one node.<br>
Save & Preview Image (TJ) 将图像保存、Batch 预览、单图查看和键盘导航整合到一个节点中。<br>

일반 저장 노드와 달리, 저장 결과를 즉시 노드 안에서 확인할 수 있습니다.<br>
Unlike normal save nodes, saved or previewed results can be inspected directly inside the node.<br>
与普通保存节点不同，它可以直接在节点内查看保存或预览结果。<br>
<br>
(스크린샷 #22 추가 위치)

## Inputs / 입력 / 输入

| Name              | Type   | 한국어                                 | English                                   | 中文                       |
| ----------------- | ------ | ----------------------------------- | ----------------------------------------- | ------------------------ |
| `images`          | IMAGE  | 저장 또는 프리뷰할 이미지입니다.                  | Images to save or preview.                | 要保存或预览的图像。               |
| `get_name`        | COMBO  | Wireless Provider에서 이미지를 무선으로 받습니다. | Receives images from a wireless provider. | 从无线 Provider 接收图像。       |
| `setnode_name`    | STRING | 현재 이미지를 Set Provider로 내보냅니다.        | Exports current image as a Set provider.  | 将当前图像作为 Set Provider 输出。 |
| `filename_prefix` | STRING | 저장 파일명 접두사입니다.                      | Filename prefix.                          | 文件名前缀。                   |
| `path`            | STRING | 저장 경로입니다.                           | Save path.                                | 保存路径。                    |
| `type`            | COMBO  | 저장 포맷입니다.                           | Save format.                              | 保存格式。                    |
| `mode`            | COMBO  | Preview 또는 Save 모드입니다.              | Preview or Save mode.                     | Preview 或 Save 模式。       |

## Outputs / 출력 / 输出

| Name    | Type  | 한국어                       | English                               | 中文          |
| ------- | ----- | ------------------------- | ------------------------------------- | ----------- |
| `image` | IMAGE | 입력 이미지를 그대로 후속 노드로 전달합니다. | Passes the image to downstream nodes. | 将图像传递给后续节点。 |

## Parameters / 파라미터 / 参数

| Parameter         | Values           | 한국어                     | English                                | 中文           |
| ----------------- | ---------------- | ----------------------- | -------------------------------------- | ------------ |
| `mode`            | Preview / Save   | 임시 프리뷰 또는 실제 저장을 선택합니다. | Select temporary preview or real save. | 选择临时预览或实际保存。 |
| `type`            | png / jpg / webp | 저장 이미지 포맷입니다.           | Image save format.                     | 图像保存格式。      |
| `filename_prefix` | STRING           | 날짜 포맷 문자를 사용할 수 있습니다.   | Supports date format strings.          | 支持日期格式字符串。   |
| `path`            | STRING           | 상대/절대 경로를 지원합니다.        | Supports relative/absolute paths.      | 支持相对/绝对路径。   |

## Viewer Controls / 뷰어 조작 / 查看器控制

| Action   | Keyboard | 한국어       | English        | 中文    |
| -------- | -------- | --------- | -------------- | ----- |
| Previous | ←        | 이전 이미지 보기 | Previous image | 上一张图像 |
| Next     | →        | 다음 이미지 보기 | Next image     | 下一张图像 |
| Close    | ESC      | 확대 보기 닫기  | Close viewer   | 关闭查看器 |

## Features / 기능 / 功能

* 단일 이미지 및 배치 이미지 프리뷰

* 노드 크기 안에서 이미지 확대 보기

* 키보드 좌우 탐색

* ESC 닫기

* Wireless Get 지원

* setnode_name Provider 지원

* 저장/프리뷰 모드 분리

* Single and batch image preview

* Enlarged viewing inside current node size

* Keyboard left/right navigation

* ESC close

* Wireless Get support

* setnode_name Provider support

* Separate Save and Preview modes

* 支持单图与 Batch 图像预览

* 在当前节点尺寸内放大查看

* 键盘左右切换

* ESC 关闭

* 支持 Wireless Get

* 支持 setnode_name Provider

* 区分 Save 与 Preview 模式

## Example / 예제 / 示例

Multi Image Loader의 BATCH를 무선으로 받아 저장과 프리뷰를 동시에 수행할 수 있습니다.<br>
You can wirelessly receive BATCH from Multi Image Loader and preview/save it directly.<br>
可以无线接收 Multi Image Loader 的 BATCH，并直接预览或保存。<br>

```text
Multi Image Loader (TJ)
 └─ Auto Set: BATCH

Save & Preview Image (TJ)
 └─ get_name: TJ / BATCH
```

---

# ✨ Wireless Repair & Cleanup
TJ_NODE v0.9은 Wireless 연결 상태를 자동으로 복구 및 정리합니다.<br>
TJ_NODE v0.9 automatically repairs and cleans wireless connections.<br>
TJ_NODE v0.9 会自动修复与清理无线连接。<br>

지원 기능:<br>
Features:<br>
功能：<br>

Ghost wire cleanup<br>
Invalid provider cleanup<br>
Dynamic reconnect<br>
Hidden wire rebuild<br>
Wireless refresh system<br>

(스크린샷 #18 추가 위치)

# ✨ Context Menu Features
TJ Node 우클릭 메뉴에는 다음 기능이 포함됩니다.<br>
TJ Node context menus include the following features.<br>
TJ Node 右键菜单包含以下功能。<br>

Refresh ALL Get Nodes<br>
Realtime Wires View Mode<br>
Properties<br>
Properties Panel<br>

(스크린샷 #19 추가 위치)

# ✨ Workflow Philosophy
TJ_NODE는 단순 유틸리티 노드 팩이 아닙니다.<br>
TJ_NODE is not just another utility node pack.<br>
TJ_NODE 并不只是普通工具节点包。<br>

TJ_NODE는 대규모 ComfyUI 워크플로우를 위한 Wireless Workflow Architecture Toolkit입니다.<br>
TJ_NODE is a Wireless Workflow Architecture Toolkit for large-scale ComfyUI workflows.<br>
TJ_NODE 是面向大型 ComfyUI 工作流的 Wireless Workflow Architecture Toolkit。<br>

# ✨ Credits
Created by TJ
<br>
Feedback and bug reports are always welcome.<br>
피드백과 버그 제보는 언제든 환영합니다.<br>
欢迎反馈与 Bug 报告。<br>
