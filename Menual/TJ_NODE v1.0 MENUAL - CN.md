---

# TJ_NODE v1.0 官方中文手册

## Chapter 01 — Wireless Routing System

---

### Wireless Routing System 介绍

TJ_NODE 的核心是：

```text
Wireless Workflow Architecture
(无线工作流架构)
```

现有的 ComfyUI 结构是：

```text
节点 ↔ 节点
```

通过可见的连线 (visible wire) 直接连接的结构。

在小型 workflow 中这没有问题，但随着规模的扩大，会出现以下问题：

* 过长的连线
* 连接线相互重叠
* 路由 (routing) 杂乱
* 难以看清结构
* 维护难度增加

为了解决这些问题，TJ_NODE 使用了：

```text
TJ Fake-Wire System
```

---

#截图 : 常规 workflow vs TJ workflow 对比

---

### TJ Fake-Wire 结构

TJ Fake-Wire 的结构是：

```text
保留物理连接
+
隐藏视觉连接
```

也就是说：

```text
逻辑连接
=
保持不变

视觉杂乱 (clutter)
=
最小化
```

---

#### 传统方式示例

```text
Load Image
 └────────────────────────────→ KSampler
```

---

#### TJ 方式示例

```text
Load Image
 → Set Node

KSampler
 ← Get Node
```

实际的内部连接仍然保留。

只是在 workflow 界面中移除了长连线，以此来创建一个：

* 易于阅读的结构
* 模块化的架构
* 可维护的 workflow

---

#截图 : fake-wire 悬停 (hover) 状态
#截图 : hidden wire (隐藏连线) 结构

---

### Realtime Wires View Mode

Realtime Wires View Mode (实时连线视图模式) 的功能是：

```text
仅在悬停 (hover) 时显示 fake-wire
```

---

#### 目的

此功能的目的是：

```text
平时保持界面整洁
仅在需要时确认连接
```

---

#### 开启方法

右键菜单：

```text
TJ Node
 → Realtime Wires View Mode
```

---

#### 运行方式

| 状态 | 说明 |
| - | - |
| OFF | 不显示隐藏的连线 |
| ON | 悬停时显示隐藏的连线 |

---

#### 推荐使用方式

在 TJ_NODE workflow 中，我们推荐以下状态：

```text
Realtime Wires View Mode = ON
Show ALL Wires = OFF
```

这种结构的 workflow 可读性最好。

---

#截图 : Realtime Hover Wire

---

### Show ALL Wires

Show ALL Wires 是：

```text
强制显示所有 fake-wire
```

的模式。

---

#### 使用目的

推荐的使用场景：

* 追踪 Provider
* 无线路由调试 (wireless debugging)
* 检查连接
* 分析 workflow

---

#### 注意事项

在大型 workflow 中：

```text
连线杂乱度可能会再次增加
```

建议在日常 workflow 操作中保持 OFF 状态。

---

#截图 : Show ALL Wires ON 状态

---

### Embedded Get 系统

TJ_NODE 的核心理念之一是：

```text
尽量减少滥用独立的 Get Node (Standalone Get Node)
```

为此，许多 TJ 节点内置了：

```text
get_name
```

小部件 (widget)。

也就是说：

```text
可以在节点内部直接进行 wireless receive (无线接收)
```

---

#### 支持的节点

目前支持 Embedded Get 的节点：

* Save & Preview Image (TJ)
* Save & Preview Video (TJ)
* Smart Show (TJ)
* Prompt Text (TJ)
* Batch to Multi Image Output (TJ)

---

#### 优势

Embedded Get 结构的优势：

| 优势 | 说明 |
| - | - |
| 减少节点数量 | 消除重复的 Get Node |
| 简化 workflow | 移除长距离路由 |
| 提升可读性 | 强化模块化结构 |
| 改善维护性 | 可在局部直接接收 |

---

#截图 : embedded get 小部件
#截图 : embedded get 连接

---

### Wireless Lifecycle System

TJ_NODE 并非单纯的连接系统。

在其内部，存在着：

```text
Wireless Lifecycle Management
(无线生命周期管理)
```

系统。

---

#### 作用

该系统负责管理：

* Provider 注册
* 自动重连 (reconnect)
* 清理 (cleanup)
* 重新加载恢复 (reload restore)
* fake-wire 同步 (sync)

---

#### 为什么重要？

在大型 workflow 中：

* 复制节点 (node duplicate)
* 重新加载工作流 (workflow reload)
* 重命名 Provider (provider rename)
* 删除节点 (node delete)

这些情况非常频繁。

简单的无线结构在这些过程中很容易崩溃。

TJ_NODE 的设计旨在尽可能自动恢复这些异常。

---

#截图 : provider 重连
#截图 : reload-safe 恢复

---

## 节点系统组成

TJ_NODE 主要由以下结构组成：

### 1. Wireless Routing System

核心结构系统。

包含节点：

* Set Node (TJ)
* Get Node (TJ)
* Multi Get Node (TJ)
* Multi Router (TJ)

### 2. Batch Workflow System

大规模图像/批处理结构。

包含节点：

* Multi Image Loader (TJ)
* Dynamic Image Batch(TJ)
* Dynamic Image Batch(Eclipse-TJ)
* Batch to Multi Image Output(TJ)

### 3. Preview / Utility System

预览与调试系统。

包含节点：

* Save & Preview Image (TJ)
* Save & Preview Video (TJ)
* Smart Show (TJ)
* Prompt Text (TJ)
* Text Concatenate (TJ)

### 4. Save Pipeline System

保存结构系统。

包含节点：

* Save Image(Primary-TJ)
* Save Image(Suffix-TJ)
* Save Image(Eclipse Suffix-TJ)

---

## 节点系统详细说明

---

### 1. Set Node (TJ)

#### 无线 Provider 生成节点

---

#### 目的

Set Node 的作用是：

```text
将数据注册为 wireless provider (无线提供者)
```

简单来说，它的角色就像：

```text
workflow 内部的广播站
```

---

#截图 : Set Node 基本结构

---

#### 使用方法

#### Step 1 — 连接输入

首先连接 source 数据。

支持的类型示例：

* IMAGE
* LATENT
* STRING
* MODEL
* CONDITIONING
* CLIP
* VAE

支持绝大多数数据类型。

---

#截图 : IMAGE 输入连接

---

#### Step 2 — 设置 setnode_name

接下来，设置：

```text
setnode_name
```

示例：

```text
MAIN_CHARACTER
UPSCALE_IMAGE
MASTER_PROMPT
```

---

#### 推荐的命名规则

推荐格式：

```text
SECTION_PURPOSE
(区块_用途)
```

示例：

```text
INPUT_MAIN_IMAGE
UPSCALE_FINAL_IMAGE
PROMPT_CHARACTER_MAIN
```

---

#### 不推荐的方式

我们建议避免使用毫无意义的名称，例如：

```text
test
aaa
123
```

这会使得大型 workflow 难以维护。

---

#截图 : setnode_name 示例

---

#### Step 3 — 在下游 (downstream) 接收

现在，其他节点可以使用：

* Get Node
* embedded get
* MultiGet

进行 wireless receive (无线接收)。

---

#截图 : downstream 接收示例

---

#### Set Node 的内部运行机制

Set Node 会在内部自动注册到：

```text
Provider Registry (提供者注册表)
```

这意味着整个 workflow 共享：

```text
当前活跃的 provider 列表
```

Get 列表就是从中自动生成的。

---

#### 注意事项

#### 名称冲突问题

如果存在多个相同的：

```text
setnode_name
```

可能会导致：

* 意外的接收错误
* 重连逻辑混乱
* Provider 被覆盖 (overwrite)

---

#### 推荐方式

始终建议使用：

```text
唯一且有意义的 provider 名称
```

---

### 2. Get Node (TJ)

#### 无线接收节点

---

#### 目的

Get Node 的作用是：

```text
接收 Set Node 的 wireless provider
```

简单来说，它的角色就是：

```text
无线接收器
```

---

#截图 : Get Node 概览

---

#### 使用方法

#### Step 1 — 放置 Get Node

将 Get Node 放置在需要使用数据的位置附近。

这种结构的核心目的是：

```text
消除长距离的可见连线 (visible wire)
```

---

#截图 : 局部接收示例

---

#### Step 2 — 选择 get_name

在下拉菜单中选择 provider。

示例：

```text
MAIN_CHARACTER
UPSCALE_IMAGE
MASTER_PROMPT
```

---

#### Eclipse 兼容性显示

Eclipse SetNode provider 的显示格式为：

```text
Eclipse / PROVIDER_NAME
```

示例：

```text
Eclipse / MAIN_IMAGE
```

---

#截图 : get_name 下拉菜单

---

#### Step 3 — 使用 output

Get Node 的输出：

```text
与原始数据行为完全一致
```

即可以像普通连接一样在下游 (downstream) 使用。

---

#截图 : KSampler 连接示例

---

#### Hover Wire 可视化

悬停在 Get Node 或插槽 (slot) 上时：

```text
会显示 fake-wire 的路径
```

通过此功能可以：

* 确认 source provider
* 确认路由方向
* 分析 workflow 结构

---

#截图 : hover wire 路径

---

#### 常见问题

#### 看不到 Provider 列表的情况

检查事项：

* provider 是否存在
* workflow 是否处于已重新加载 (reload) 状态
* Set Node 是否已被删除

---

#### 解决方法

右键菜单：

建议执行：

```text
Refresh ALL Get Nodes
```

---

### 3. Multi Get Node (TJ)

#### 多重无线接收节点

---

#### 目的

同时接收多个 wireless provider 的节点。

特别是在以下情况中非常重要：

```text
大型 workflow 的模块化
```

---

#截图 : MultiGet 概览

---

#### 推荐使用场景

推荐示例：

* 接收多个 prompt
* 接收多个 image
* 管理分组的 provider
* 模块接收 (module receive) 结构

---

#### 使用方法

#### Step 1 — 添加 provider

可以注册多个 provider。

示例：

```text
MAIN_PROMPT
STYLE_PROMPT
LIGHTING_PROMPT
NEGATIVE_PROMPT
```

---

#截图 : 多个 provider 插槽

---

#### Step 2 — 使用重排 (reorder)

按钮：

| 按钮 | 功能 |
| - | - |
| ↑ | 向上移动 |
| ↓ | 向下移动 |
| ✕ | 移除 |

---

#### 目的

使 provider 的顺序符合：

```text
workflow 的逻辑顺序
```

---

#截图 : reorder UI

---

#### 紧凑插槽 (Compact Slot) 结构

删除的插槽会自动紧凑。

即采用：

```text
最小化中间空插槽
```

的结构。

---

#截图 : 紧凑插槽行为

---

#### 推荐结构

相比于使用多个 Get Node，我们更推荐：

```text
基于 MultiGet 的模块接收结构
```

这对于接收以下内容非常有效：

* Prompt 组
* Model 组
* Image 组

---

### 4. Multi Router (TJ)

#### 无线分支架构节点

---

#### 目的

Multi Router 是用于：

```text
将 workflow 拆分为无线分支 (branch) 结构
```

的核心节点。也是 TJ_NODE 架构的中心节点之一。

---

#截图 : Multi Router 概览

---

#### 核心作用

Multi Router 执行：

* 分支拆分 (branch separation)
* Auto Set 生成
* Provider 结构化
* Workflow 模块化

---

#### 使用方法

#### Step 1 — 输入 source

可输入的示例：

* IMAGE
* LATENT
* CONDITIONING
* STRING

等。

---

#截图 : source 输入

---

#### Step 2 — 构建 output 分支

按 workflow 区块 (section) 拆分输出分支。

示例：

```text
generation
upscale
preview
save
```

---

#截图 : 分支 workflow

---

#### Step 3 — 激活 Auto Set

当：

```text
Auto Set = ON
```

时，每个输出都会自动成为 wireless provider。

---

#### Auto Set 的核心目的

无需长连线，为了构建：

```text
自动创建 provider 分支
```

的结构。

---

#截图 : Auto Set ON 状态

---

#### 推荐的 workflow 结构

TJ workflow 推荐以下结构：

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

将各个 section 使用：

```text
Multi Router + wireless branch
```

进行连接是最稳定的方式。

---

#截图 : 模块化 workflow 架构

---

#### Eclipse 兼容性

TJ_NODE 兼容 Eclipse SetNode。

TJ Get 系统可以：

```text
直接将 Eclipse SetNode OUTPUT 端口
```

作为 provider 使用。

---

#### 显示方式

在 Get 列表中显示为：

```text
Eclipse / PROVIDER_NAME
```

---

#### 目的

TJ_NODE 的目的并不是取代 Eclipse。

相反，它扮演着：

```text
Eclipse workflow 桥接层 (bridge layer)
```

的角色。也就是说，你可以混合运行：

* Eclipse workflow
* TJ workflow

---

#截图 : Eclipse 桥接 workflow

---

### Wireless Routing System 推荐运行方式

在 TJ workflow 中，我们推荐以下结构：

---

#### 推荐

```text
- Realtime Wires View Mode = ON
- Show ALL Wires = OFF
- 积极使用 Embedded Get
- Provider 命名规范化
- 按区块 (Section) 拆分 workflow
```

---

#### 不推荐

```text
- 重复的 provider 名称
- 毫无意义的 provider 名称
- 保留冗长的可见连线 (visible wire)
- 滥用独立的 Get Node
```

---

### Final Notes

Wireless Routing System 是：

```text
TJ_NODE 的心脏
```

TJ_NODE workflow 的核心理念并非：

```text
“消除连线”
```

真正的核心是：

```text
“让大型 workflow 成为可维护的结构”
```

---

#截图 : 最终的 wireless workflow 演示

---

## Chapter 02 — Batch Workflow System

---

### Batch Workflow System 介绍

TJ_NODE 的 Batch Workflow System 并不是简单的批处理节点集合。

该系统是：

```text
为了结构化运行
大规模图像 workflow 的系统
```

常规的批处理 workflow 经常出现以下问题：

* 图像顺序混乱
* 元数据 (metadata) 丢失
* 分辨率不匹配 (mismatch)
* 下游分支拥堵
* 图像组管理困难
* 保存路径同步 (sync) 问题

为了解决这些问题，TJ_NODE 提供了：

* Multi Image Loader
* Dynamic Batch
* Batch Split
* Eclipse Metadata Sync

等结构。

---

#截图 : Batch Workflow 整体结构

---

### 1. Multi Image Loader (TJ)

#### TJ_NODE 的核心输入枢纽

Multi Image Loader 扮演着：

```text
TJ workflow 起点
```

的核心角色。

这个节点不仅仅是加载图像。

实际上，它同时承担了以下角色：

* image stack manager (图像栈管理器)
* batch generator (批处理生成器)
* resolution manager (分辨率管理器)
* provider source (提供者源)
* metadata sync system (元数据同步系统)

---

#截图 : Multi Image Loader 默认状态

---

#### 主要功能

Multi Image Loader 执行：

| 功能 | 说明 |
| - | - |
| 图像加载 (Load) | 多图输入 |
| image stack | 内部列表管理 |
| thumbnail preview | 缩略图预览 |
| reorder | 拖拽排序 |
| batch 生成 | 输出 IMAGE batch tensor |
| resize | 统一分辨率 |
| metadata 维持 | 保留原始信息 |
| Auto Set | 生成 WIDTH/HEIGHT/BATCH provider |

---

#### 什么时候使用？

推荐场景：

* 数据集批处理 (dataset batch)
* 变体生成 (variation workflow)
* 批量放大 (upscale batch)
* VAE Encode 批处理
* ControlNet 图像组
* 风格迁移批处理 (style transfer batch)
* 图像对比 (image compare) workflow

---

#截图 : 大规模批处理 workflow 示例

---

#### A. 添加图像的方法

支持的方式：

| 方式 | 说明 |
| - | - |
| File Select | 选择本地文件 |
| Drag & Drop | 直接拖拽放入 |
| URL Download | 下载外部图像 |

---

#截图 : 添加图像按钮
#截图 : 拖放 (drag & drop) 状态

---

#### B. URL Download 功能

支持输入外部 URL。

示例：

```text
https://example.com/image.jpg
```

---

#### 目的

推荐用途：

* 参考图 (reference image)
* 外部数据集
* 远程 workflow 资产

---

#### 注意事项

部分网站可能会因为：

* 防盗链 (hotlink blocking)
* CORS 限制

导致下载失败。

---

#截图 : URL 下载示例

---

#### C. Image Stack 系统

图像在内部通过：

```text
Image Stack (图像栈)
```

结构进行管理。

也就是说，它不仅仅是一个数组，而是同时管理：

* 预览状态 (preview state)
* 顺序 (order)
* 元数据 (metadata)
* 缩放状态 (resize state)

---

#### D. Thumbnail Grid

添加的图像将以：

```text
缩略图网格 (thumbnail grid)
```

显示。

目的：

* 快速查看结构
* 确认批处理状态
* 提升重新排序 (reorder) 的直观性

---

#截图 : 缩略图网格

---

#### E. 拖拽重新排序 (Drag Reorder) 功能

图像可通过拖拽来改变顺序。

---

#### 为什么重要？

在批处理 workflow 中：

```text
顺序本身就是数据
```

这在很多情况下成立。

示例：

* 动画序列 (animation sequence)
* 提示词同步 (prompt sync)
* 帧处理 (frame processing)
* 成对数据集 (paired dataset)

---

#截图 : 拖拽排序状态

---

#### 推荐使用方式

建议保持明确的排序规则。

示例：

```text
001_input
002_input
003_input
```

---

#### F. Resize System

#### 核心目的

在批处理 workflow 中：

```text
分辨率不匹配 (resolution mismatch)
```

是非常常见的问题。

Multi Image Loader 包含了一个缩放系统来解决此问题。

---

#### 支持的模式

| 模式 | 说明 |
| - | - |
| none | 保持原图 |
| long edge | 以长边为基准 |
| short edge | 以短边为基准 |
| custom | 手动输入 |
| megapixel | 以 MP 为基准计算 |

---

#截图 : resize 设置

---

#### Long Edge 模式

以长边为基准进行缩放。

示例：

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

#### 推荐使用

推荐场景：

* SDXL workflow
* 图像生成标准化 (normalization)
* 放大流程 (upscale pipeline)

---

#### Short Edge 模式

以短边为基准缩放。

推荐场景：

* 肖像数据集 (portrait dataset)
* 垂直图像一致性

---

#### Megapixel 模式

基于像素总量 (MP) 自动计算。

示例：

```text
1MP
2MP
4MP
```

---

#### 优势

无需手动计算宽高，直接基于：

```text
目标像素量进行归一化 (normalize)
```

---

#### G. Scale Method

#### Center Crop

保持比例并居中裁剪。

---

#### 推荐场景

* 肖像数据集
* 以主体为中心的图像
* 时尚类 workflow

---

#### Force Fit

强制拉伸匹配。

---

#### 推荐场景

* 纹理 (texture)
* 贴图 (tile)
* 要求精确分辨率的 workflow

---

#### 注意事项

Force Fit 可能会导致：

```text
比例失真
```

人物图像建议使用 Center Crop。

---

#截图 : Center Crop vs Force Fit 对比

---

#### H. Output 说明

#### BATCH

输出 IMAGE batch tensor。

---

#### 使用示例

```text
Multi Image Loader
 → VAE Encode
 → KSampler
 → Save Preview
```

---

#### WIDTH / HEIGHT

输出当前 batch 的分辨率。

---

#### 为什么重要？

在 TJ workflow 中：

```text
分辨率也会作为路由数据使用
```

---

#### 推荐使用

* Auto Set provider
* 放大同步 (upscale sync)
* 保存管道 (save pipeline)
* 潜变量尺寸设定 (latent sizing)

---

#截图 : WIDTH/HEIGHT 路由

---

#### I. Auto Set 功能

Multi Image Loader 支持：

```text
BATCH
WIDTH
HEIGHT
```

自动生成 wireless provider。

---

#### 使用方法

```text
Auto Set = ON
```

---

#### 内部运行机制

自动生成：

```text
TJ / BATCH
TJ / WIDTH
TJ / HEIGHT
```

等 provider。

---

#### 优势

* 消除长连线
* 简化下游路由
* 批处理结构模块化

---

#截图 : Auto Set provider 列表

---

#### 推荐结构

推荐以下结构：

```text
Multi Image Loader
 ↓
Multi Router
 ↓
Wireless Sections
```

---

#截图 : 推荐结构

---

### 2. Dynamic Image Batch (TJ)

#### 目的

将多个图像合并为：

```text
动态批处理 (dynamic batch) 结构
```

的节点。

---

#### 核心作用

* 图像分组 (image grouping)
* 动态组批 (dynamic batch)
* 可扩展处理 (scalable processing)
* workflow 分发

---

#### 推荐使用场景

推荐示例：

* 图像变体 (variation)
* 多提示词生成
* 分组放大 (grouped upscale)
* 迭代处理 (iterative processing)

---

#截图 : Dynamic Image Batch 概览

---

#### 内部结构

此节点生成的不是：

```text
固定 batch
```

而是：

```text
动态生成 batch
```

即根据 workflow 状态，以下内容可能发生变化：

* batch 数量
* 图像分组
* 下游分支

---

#### 为什么重要？

在大型 workflow 中：

```text
批处理 (batch) 本身通常就是动态数据
```

---

### 3. Dynamic Image Batch(Eclipse-TJ)

#### 兼容 Eclipse 的批处理系统

与 Eclipse workflow 结构兼容的批处理系统。

---

#### 核心特征

此节点将：

```text
IMAGE + FILES 数据对
```

保持绑定在一起。

也就是说，它同时保留了：

* 图像 tensor
* 原始文件元数据 (original file metadata)
* 原始路径 (original path)

---

#### 为什么重要？

常规批处理系统经常发生：

```text
原始文件信息丢失
```

这在 Eclipse workflow 中是极其重要的数据。

---

#### 支持功能

| 功能 | 说明 |
| - | - |
| metadata 维持 | 保留原始信息 |
| bypass filtering | 保持文件同步 |
| original path | 维持原始路径 |
| Eclipse save sync| 联动保存结构 |

---

#截图 : Eclipse 批处理流

---

#### 推荐使用场景

推荐 workflow：

* 大型数据集 workflow
* Eclipse 存储管道 (save pipeline)
* 依赖 metadata 的 workflow
* 文件追踪 (file-tracking) workflow

---

### 4. Batch to Multi Image Output (TJ)

#### Batch 拆分系统 (Batch Split System)

将 IMAGE batch 拆分为：

```text
最多 64 个独立的 IMAGE 输出
```

的节点。

---

#### 核心目的

为了将 Batch workflow 拆分到：

```text
独立的下游分支 (downstream branch)
```

---

#截图 : Batch 拆分概览

---

#### 使用方法

#### Step 1 — 输入 IMAGE batch

连接：

```text
IMAGE batch
```

---

#### Step 2 — 使用输出

每张图像将被拆分为：

```text
独立的 IMAGE 输出
```

---

#### 推荐使用场景

推荐示例：

* 选择性放大 (selective upscale)
* 对比 workflow (compare workflow)
* 图像评级 (image ranking)
* 分支处理 (branch processing)
* 多重保存管道 (multi save pipeline)

---

#截图 : 拆分分支示例

---

#### 支持 Embedded Get

Batch to Multi Image Output 支持：

```text
embedded get
```

也就是说可以直接进行 wireless receive。

---

#截图 : batch 输出中的 embedded get

---

### Batch Workflow 推荐结构

在 TJ workflow 中推荐以下结构。

---

#### 推荐结构

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

#### 优势

这种结构对于：

* 批处理管理
* 路由结构化
* 存储管道隔离
* workflow 维护

具有极大优势。

---

### 常见问题

#### 图像顺序混乱

原因：

* 未进行重新排序 (reorder)
* batch 被覆盖
* workflow 重复 (duplicated)

---

#### 解决方法

推荐：

```text
拖拽重新排序 (drag reorder) 后保存 workflow
```

---

#### 分辨率不匹配 (mismatch)

原因：

* 分辨率混杂
* 未开启 resize
* Force Fit 不匹配

---

#### 解决方法

推荐：

```text
使用 long edge 进行归一化 (normalize)
```

---

#### Metadata 丢失

原因：

* 使用了常规批处理
* 未使用 Eclipse metadata

---

#### 解决方法

推荐：

使用：

```text
Dynamic Image Batch(Eclipse-TJ)
```

---

### Final Notes

Batch Workflow System 是：

```text
TJ workflow 的输入和分发结构
```

TJ_NODE 的核心不仅仅是提供批处理功能，而是：

```text
让大型 workflow 变成
具有结构性、可维护形态的系统
```

---

#截图 : 最终的 Batch Workflow 演示

---

## Chapter 03 — Preview / Utility System

---

### Preview / Utility System 介绍

TJ_NODE 的 Preview / Utility System 并不是简单的预览节点集合。

该系统是：

```text
为了在实际运行中维持大型 workflow 可靠性
而设计的可视化与调试系统
```

在常规 workflow 中，经常会出现以下问题：

* 为了查看结果而滥用 preview 节点
* 预览连线过长
* 难以进行全屏 (fullscreen) 检查
* 难以进行 batch 对比
* 重新加载 (reload) 后预览丢失
* 视频预览不稳定
* 音频同步 (sync) 问题

为了解决这些问题，TJ_NODE 提供了：

* Smart Preview
* Snapshot Preview
* Reload Restore
* Embedded Get
* Fullscreen Viewer
* HTML5 Video Player
* Audio Controller

---

#截图 : Preview System 整体结构

---

### 1. Save & Preview Image (TJ)

#### 统一图像预览系统

Save & Preview Image 是 TJ_NODE 极具代表性的预览系统。

它不仅仅是一个预览节点。

该节点将以下功能：

* image preview
* fullscreen viewer
* batch grid (网格)
* keyboard navigation (键盘导航)
* snapshot preview
* save pipeline (保存管道)
* embedded get

整合为一个统一的结构。

---

#截图 : Save & Preview Image 默认状态

---

#### 主要目的

在传统 workflow 中，你需要分别配置：

```text
Preview Image
+
Save Image
+
Fullscreen Viewer
+
Compare Viewer
```

TJ_NODE 将这些整合到一个 workflow 节点中。

---

#### 支持的功能

| 功能 | 说明 |
| - | - |
| IMAGE preview | 单图/批处理显示 |
| Fullscreen | 放大查看 |
| Smart Grid | batch 网格排版 |
| Keyboard Control | 方向键 / ESC 操作 |
| Snapshot | 预览副本备份 |
| Embedded Get | 无线接收 |
| Save System | 图像保存 |
| Reload Restore | 重新加载时恢复预览 |

---

#### 基本使用方法

#### Step 1 — 连接 IMAGE 输入

将 IMAGE 或 IMAGE batch 连接到：

```text
image
```

插槽。

---

#截图 : image 输入连接

---

#### 支持的输入

| 输入类型 | 说明 |
| - | - |
| IMAGE | 单张图像 |
| IMAGE batch | 多张图像 |

---

#### 自动检测

节点会自动判断：

```text
single image
或
batch grid
```

模式。

---

#### Step 2 — 执行 Queue

执行 workflow 时：

* 生成预览
* 生成 grid
* 保存 snapshot 元数据

这些动作会自动执行。

---

#截图 : 预览生成状态

---

#### Step 3 — 查看图像

点击图像即可进入全屏 (fullscreen) 预览。

---

#截图 : fullscreen viewer

---

#### Smart Grid 系统

#### 目的

将 batch 预览以：

```text
易于阅读的结构
```

呈现。

---

#### 特征

Smart Grid 采用：

* 动态布局 (dynamic layout)
* 居中适应 (fit-center)
* 2px 间距 (spacing)
* 稳定渲染 (stable rendering)

等机制。

---

#截图 : smart grid 布局

---

#### 为什么重要？

普通的 batch 预览经常出现：

* 图像重叠
* 缩放破损
* 宽高比 (aspect ratio) 崩坏

TJ grid 系统就是为了最大限度减少这些问题而设计的。

---

#### 节点缩放 (Resize) 与预览的关系

Save & Preview Image：

```text
在执行时不会强制修改 node.size
```

相反，它提供：

* 初始的预览区域
* fit-center 显示
* 保留用户的手动缩放大小

等机制。

---

#### 优势

| 优势 | 说明 |
| - | - |
| 保持用户布局 | 保护用户缩放大小 |
| workflow 稳定性 | 将位置偏移降到最低 |
| 预览稳定性 | 维持 grid 布局 |

---

#截图 : fit-center 预览

---

#### Fullscreen Viewer

#### 目的

此功能用于：

```text
以实际画质级别检查结果图像
```

---

#### 进入方法

方法：

* 点击图像
* 键盘按下 F / f

---

#截图 : fullscreen 模式

---

#### 主要功能

| 功能 | 说明 |
| - | - |
| 放大查看 | 基于原图大小 |
| batch 切换 | 上一张 / 下一张 |
| ESC 退出 | 关闭 fullscreen |
| 重新加载保持 | 恢复预览结果 |

---

#### 键盘操作

| 按键 | 功能 |
| - | - |
| F / f | 全屏 |
| ESC | 退出全屏 |
| ← | 上一张图像 |
| → | 下一张图像 |

---

#### 关键特征

即使在 Fullscreen 状态下：

```text
也会维持 preview lifecycle (预览生命周期)
```

也就是说，在：

* 重新加载 (reload)
* 切换浏览器标签页 (tab)
* 保存 workflow

之后，依然可以恢复最后的预览状态。

---

#截图 : fullscreen 恢复

---

#### Snapshot Preview 系统

#### 核心概念

TJ 的预览复制 (preview copy) 并不是：

```text
实时镜像 (live mirror)
```

而是采用：

```text
保留当前预览快照 (snapshot)
```

的结构。

---

#### 为什么重要？

可以将 workflow 的中间结果以：

* 对比 (compare)
* 记录
* 检查点 (checkpoint)

的形式保存下来。

---

#### 示例

```text
复制 Save Preview
 ↓
保留当前结果的 snapshot
 ↓
原始 workflow 继续更新
```

---

#截图 : snapshot 预览复制

---

#### 优势

| 优势 | 说明 |
| - | - |
| 结果对比 | 保留之前的结果 |
| checkpoint | 保存中间状态 |
| debug | 分阶段分析 |

---

#### 支持 Embedded Get

Save & Preview Image 支持 embedded get。

即可以通过：

```text
get_name
```

直接接收 wireless provider。

---

#### 推荐结构

```text
Multi Router
 ↓
Wireless Provider
 ↓
Save & Preview Image
```

---

#### 优势

* 消除过长的预览连线
* 简化 workflow
* 预览模块结构化

---

#截图 : embedded get 预览

---

#### 保存系统 (Save System)

#### filename_prefix

设置文件名规则。

---

#### 支持的别名 (Alias)

| Alias | 结果 |
| - | - |
| %date | YYYY-MM-DD |
| %time | HH-MM-SS |

---

#### 使用示例

```text
%date_%time_preview
```

结果：

```text
2026-06-04_14-22-11_preview
```

---

#### 注意事项

不推荐使用以下别名：

```text
%D
%T
```

原因：

可能会与 Python 的 strftime 默认 Token 发生冲突。

---

#### 重复保存处理

如果存在同名文件，将自动递增保存：

```text
_001
_002
_003
```

---

#截图 : save 文件名示例

---

### 2. Save & Preview Video (TJ)

#### 统一视频工作流系统

Save & Preview Video 整合了：

* image batch playback (图像批处理播放)
* video decode (视频解码)
* audio mux (音频混合)
* preview restore (预览恢复)
* video save (视频保存)
* audio only export (仅音频导出)

等功能。

---

#截图 : Save & Preview Video 概览

---

#### 核心目的

在传统 workflow 中，你需要分别配置：

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

TJ_NODE 将这些功能统一到一个节点中。

---

#### 支持的功能

| 功能 | 说明 |
| - | - |
| IMAGE batch 播放 | 帧预览 (frame preview) |
| VIDEO 解码 | mp4 → frames |
| Audio mux | 音频合并 |
| Audio Only | 仅导出音频 |
| Embedded Get | 无线接收 |
| Preview Restore | 重新加载时恢复 |
| HTML5 Player | 浏览器原生播放 |

---

#### 使用 IMAGE Batch 模式

#### 基本结构

```text
IMAGE batch
 ↓
preview
 ↓
playback
 ↓
optional mp4 rebuild (可选视频重构)
```

---

#### 使用方法

#### Step 1 — 连接 IMAGE batch

连接到：

```text
image
```

输入。

---

#### 推荐数据源 (source)

推荐的源：

* AnimateDiff
* Frame Generator
* VFI
* 插帧 (interpolation)
* Dynamic Batch

---

#截图 : image batch 播放

---

#### Step 2 — 设置 fps

设置播放的 fps。

---

#### 推荐 fps

| 用途 | 推荐值 |
| - | - |
| preview | 12~16 |
| animation | 24 |
| cinematic | 30 |

---

#### Step 3 — 执行 Queue

在节点内部，会自动执行：

* 生成 playback
* 生成预览帧
* (可选) video rebuild

---

#截图 : 播放预览

---

#### 使用 VIDEO Decode 模式

#### 目的

将已有的 mp4 文件转换为：

```text
IMAGE batch
```

的结构。

---

#### 使用流程

```text
VIDEO
 ↓
帧解码 (frame decode)
 ↓
IMAGE batch
 ↓
preview
```

---

#截图 : decode 流程

---

#### 推荐使用场景

推荐用于：

* 帧检查 (frame inspection)
* VFI workflow
* 帧编辑 (frame editing)
* img2img 动画

---

#### 关键特征

解码后的帧：

```text
可以像普通 IMAGE batch 一样在下游使用
```

---

#截图 : 解码帧预览

---

#### 互斥保护 (Mutex) 系统

Save & Preview Video 会防止：

```text
image + video 同时输入连接
```

---

#### 为什么需要？

同时连接可能会导致：

* 模糊的解码状态
* 无效的播放状态
* 重新加载不匹配 (reload mismatch)

---

#### 内部结构

节点会基于：

```text
当前活跃的 source
```

进行运行。

---

#### reload-safe 机制

即使在 workflow 重新加载时：

* 无效的互斥冲突
* 过时的 source (stale source)

也会被尽可能自动清理。

---

#### Audio 系统

#### 支持的输入

| 输入 | 说明 |
| - | - |
| audio_a | 主音频 |
| audio_b | 辅助音频 |

---

#截图 : audio 输入

---

#### Audio Only 模式

如果 save_type 设置为：

```text
audio only
```

则显示专属的音频控制器 UI。

---

#### 特征

* HTML5 音频播放器
* 动态控制器数量
* 同步播放

---

#### 控制器生成规则

| 输入状态 | 显示 |
| - | - |
| 仅 A | 1 个控制器 |
| 仅 B | 1 个控制器 |
| A+B | 2 个控制器 |

---

#截图 : 双音频控制器

---

#### original_audio 输出

在进行视频解码时，会将：

```text
原始视频的音频 (original video audio)
```

以 AUDIO 字典 (dict) 形式保留。

---

#### 目的

推荐使用场景：

* 重封装 (remux)
* 保留音频
* 维持原始音轨

---

#### Preview Restore 系统

Save & Preview Video 支持：

```text
reload-safe preview restore (防重载预览恢复)
```

---

#### 维护的项目

* 预览状态
* 播放状态
* 快照 (snapshot)
* 解码预览

---

#### 目的

即使在切换标签页或重新加载后：

```text
也能维持最后的预览状态
```

---

#截图 : reload 恢复

---

### 3. Smart Show (TJ)

#### 万能调试查看器

Smart Show 是 TJ_NODE 最具代表性的调试查看器。

---

#### 目的

针对各种数据类型进行：

```text
自动分析及预览
```

的节点。

---

#### 支持的类型

| 类型 | 说明 |
| - | - |
| IMAGE | 图像 |
| STRING | 文本 |
| FLOAT | 浮点数 |
| INT | 整数 |
| JSON | 结构化数据 |
| LIST | 列表 |
| VIDEO | 视频 |
| AUDIO | 音频 |

---

#截图 : Smart Show 概览

---

#### 自动类型切换

根据输入类型，自动切换为：

* image viewer
* text viewer
* media player
* numeric viewer

---

#截图 : 自动类型切换

---

#### Edit Mode (编辑模式)

Edit Mode 默认处于：

```text
OFF
```

状态。

---

#### 为什么重要？

为了防止：

```text
意外覆盖 (overwrite) workflow 的值
```

---

#### 推荐使用场景

* debug
* 对比 (compare)
* 检查文本
* 检查元数据 (metadata)

---

### 4. Prompt Text (TJ)

#### 提示词管理节点

用于将提示词结构化的节点。

---

#### 推荐使用场景

* 角色 prompt
* 风格 prompt
* 可复用的 prompt 块
* 光影 prompt

---

#### 支持 Embedded Get

Prompt Text 支持 embedded get。

即无需冗长的文本连线，即可构建：

```text
模块化提示词架构 (modular prompt architecture)
```

---

#截图 : prompt 路由

---

### 5. Text Concatenate (TJ)

#### 动态文本拼接节点

用于合并多段文本的节点。

---

#### 特征

* 动态输入
* 自定义分隔符 (delimiter)
* 可扩展的合并结构

---

#截图 : 文本拼接示例

---

#### 不支持 Embedded Get

此节点是有意设计为：

```text
不支持 embedded get
```

---

#### 原因

动态输入 (dynamic input) 结构与：

```text
稳定的无线路由 (stable wireless routing)
```

存在冲突。

---

#### 推荐使用场景

推荐合并示例：

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

### 6. Preview / Utility System 推荐结构

TJ workflow 推荐以下结构。

---

#### 推荐 workflow

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

#### 优势

* 预览结构化
* 简化调试
* 提升 workflow 可读性
* 维持 snapshot 检查点

---

### 7. 常见问题

#### 预览黑屏

检查：

* 是否存在 IMAGE batch
* 是否生成了解码帧
* 浏览器自动播放 (autoplay) 限制

---

#### 无法关闭 Fullscreen

原因：

* overlay 指针冲突
* refresh overlay 重叠

---

#### 解决方法

建议使用最新版本的 TJ preview 结构。

---

#### 恢复预览 (Preview restore) 失败

检查：

* 运行历史 (execution history)
* snapshot 元数据
* workflow 保存状态

---

#### 音频无法播放

检查：

* audio 输入连接
* 浏览器的 autoplay 策略
* 是否处于静音 (muted) 状态

---

### Final Notes

Preview / Utility System 是：

```text
TJ workflow 的可视化层 (Visualization layer)
```

TJ_NODE 的核心并非只是单纯的预览本身，而是：

```text
让大型 workflow
保持在可运行的结构之中
```

---

#截图 : 最终的 Preview Workflow 演示

---

## Chapter 04 — Save Pipeline System

---

### Save Pipeline System 介绍

TJ_NODE 的 Save Pipeline System 绝非简单的保存节点。

该系统是：

```text
为了结构化地保存和管理
大型 workflow 输出结果的系统
```

在常规的 ComfyUI workflow 中：

* 保存位置重复
* 结果文件难以整理
* 难以分离保存放大 (upscale) 的结果
* 原图与后处理关系难以追踪
* 难以保留 Eclipse workflow 路径
* 难以基于 metadata 进行保存

这些问题频繁发生。

TJ_NODE 为解决这些问题，提供了：

* Primary Save
* Suffix Save
* Eclipse Path Tracking
* Save Chain Architecture (保存链架构)

---

#截图 : Save Pipeline 整体结构

---

### Save Pipeline Architecture

TJ Save 结构的核心在于：

```text
“以 workflow 为单位管理保存行为”
```

也就是说，不仅仅是：

```text
保存一张图像
```

而是为了：

```text
让整个 workflow 的输出结果
以整洁的结构保留下来
```

---

#### 基本结构

```text
Primary Save
 ↓
Suffix Save
 ↓
Final Result Groups (最终结果组)
```

---

#### 为什么重要？

在大型 workflow 中，会源源不断地生成：

* 原图 (original)
* 放大结果 (upscale)
* 细节传递 (detail pass)
* 蒙版 (mask)
* 对比 (compare)
* 变体 (variation)

如果将这些无序保存，那么：

```text
结果管理将变得完全不可能
```

TJ Save Pipeline 就是为了将这些结果结构化而设计的系统。

---

#截图 : 结构化的保存目录

---

### 1. Save Image (Primary-TJ)

#### Save Pipeline 基准节点

Primary-TJ 是：

```text
创建基准保存位置
```

的节点。扮演着 TJ Save 结构的起点角色。

---

#截图 : Primary-TJ 概览

---

#### 主要作用

Primary-TJ 负责：

* 生成基准保存路径 (base save path)
* 基于 workflow 基准进行保存
* 为下游的 suffix (后缀) 提供基准
* 管理命名结构

---

#### 基本使用方法

#### Step 1 — 连接 IMAGE 输入

将 IMAGE 连接到：

```text
image
```

插槽。

---

#截图 : Primary image 输入

---

#### Step 2 — 设置 filename_prefix

示例：

```text
project_main
```

或：

```text
%date_%time_project
```

---

#### 支持的别名 (Alias)

| Alias | 结果 |
| - | - |
| %date | YYYY-MM-DD |
| %time | HH-MM-SS |

---

#### 使用示例

```text
%date_%time_main
```

↓

```text
2026-06-04_14-35-22_main
```

---

#截图 : 文件名示例

---

#### Step 3 — 执行 Queue

在执行时会自动：

* 生成保存路径
* 保存元数据 (metadata)
* 生成供下游使用的保存上下文 (save context)

---

#### Primary Save 的核心作用

Primary-TJ 并非简单的保存节点。

实际上它的作用更接近于：

```text
Save Context Provider (保存上下文提供者)
```

即让下游节点能够共享：

* 存储路径 (save path)
* 基准文件名 (filename base)
* 后缀链 (suffix chain)

---

#截图 : save chain 上下文

---

#### 推荐使用方式

推荐结构：

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

#### 优势

| 优势 | 说明 |
| - | - |
| 结果整理 | 归入同一集合 |
| 路径管理 | 维持结构 |
| 命名一致性 | 文件名统一 |
| 下游同步 | 关联后续保存 |

---

### 2. 重复保存处理系统

如果存在同名文件，TJ Save 系统会自动递增保存：

```text
_001
_002
_003
```

---

#### 为什么重要？

在大量的生成 (generation) workflow 中：

```text
文件名冲突 (filename collision)
```

是非常普遍的现象。TJ Save 系统经过专门设计，旨在最大程度防止文件被覆盖 (overwrite)。

---

#### 示例

如果已有文件：

```text
main.png
```

↓

则自动保存为：

```text
main_001.png
```

---

#截图 : 冲突处理机制

---

### 3. Save Image (Suffix-TJ)

#### 后续保存系统

Suffix-TJ 是一个：

```text
继承 Primary 保存基准
并将后续结果追加保存
```

的节点。

---

#截图 : Suffix-TJ 概览

---

#### 核心目的

在大型 workflow 中：

* upscale (放大)
* detail pass (细节增强)
* color correction (调色)
* compare result (对比结果)

会持续生成。

Suffix-TJ 是为了将这些结果保存在：

```text
同一个结果集合中
```

而设计的结构。

---

#### 基本结构

```text
Primary-TJ
 ↓
生成基准路径

Suffix-TJ
 ↓
追加 suffix 后保存
```

---

#### 使用示例

#### 原图保存

```text
main.png
```

---

#### 放大结果

```text
main_upscale.png
```

---

#### 细节结果

```text
main_detail.png
```

---

#截图 : suffix 保存示例

---

#### Step 1 — 连接 IMAGE

连接后续处理结果的 IMAGE。

---

#### Step 2 — 设置 suffix

示例：

```text
upscale
detail
mask
compare
```

---

#### 推荐规则

推荐方式：

```text
基于功能的后缀 (suffix)
```

示例：

```text
upscale_4x
detail_pass
mask_clean
```

---

#截图 : suffix 命名

---

#### Step 3 — 执行保存

Suffix-TJ 会自动：

* 引用 Primary 上下文
* 维持基准文件名
* 追加 suffix 进行保存

---

#### 优势

| 优势 | 说明 |
| - | - |
| 结果分组 | 维持相关结果的联系 |
| 命名一致性 | 文件名梳理 |
| 维持保存链 | 使 workflow 可追溯 |

---

#### 为什么重要？

在普通 workflow 中经常会发生：

```text
最终结果完全混作一团
```

的问题。TJ Save 结构解决了这一痛点。

---

#截图 : 整理后的结果文件夹

---

### 4. Save Image (Eclipse Suffix-TJ)

#### 兼容 Eclipse 的保存系统

该节点是：

```text
用于维持 Eclipse 原始文件结构
```

的保存系统。

---

#### 核心特征

普通的保存结构是基于：

```text
当前 workflow 为基准保存
```

但在 Eclipse workflow 中，基于：

```text
原始文件位置保存
```

是非常重要的。

---

#### 主要功能

| 功能 | 说明 |
| - | - |
| original path tracking | 追踪原始路径 |
| metadata path restore | 恢复路径 |
| relative save | 维持相对路径 |
| suffix append | 后续保存 |

---

#截图 : Eclipse save 管道

---

#### 内部动作

节点基于：

```text
IMAGE + 原始文件元数据
```

来计算保存位置。

也就是说，可以做到：

```text
在维持原始文件结构的同时
对后续结果进行保存
```

---

#### 推荐使用场景

推荐 workflow：

* Eclipse workflow
* 数据集处理
* 依赖 metadata 的流程
* 需要保留原始路径的 workflow

---

### 5. Save Chain Workflow 推荐结构

在 TJ workflow 中推荐以下保存结构。

---

#### 推荐结构

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

#### 优势

* 梳理结果结构
* workflow 具备可追溯性
* 便于对比 (compare)
* 便于数据集管理

---

#截图 : 推荐的 save chain

---

### 6. 存储结构推荐规则

#### 推荐的文件夹结构

推荐：

```text
project/
 ├─ main
 ├─ upscale
 ├─ detail
 ├─ compare
 └─ mask
```

---

#### 推荐的 filename 结构

推荐形态：

```text
%date_%time_project
```

---

#### 为什么重要？

在大型 workflow 中：

```text
文件整理本身就是 workflow 的管理
```

---

### 7. Save Metadata 系统

TJ Save 结构在内部维护了：

```text
save context metadata (保存上下文元数据)
```

---

#### 目的

为了让下游节点能够共享：

* path (路径)
* filename (文件名)
* suffix chain (后缀链)

---

#### 优势

| 优势 | 说明 |
| - | - |
| save consistency | 存储一致性 |
| downstream sync | 维持下游联动 |
| workflow restore | 结构恢复 |

---

#截图 : save metadata 流程

---

### 8. 常见问题

#### 结果文件被覆盖 (overwrite)

原因：

* 文件名相同
* 手动执行了覆盖
* save path 存在重复

---

#### 解决方法

建议使用 TJ 自动递增 (auto increment) 机制。

---

#### 保存位置混乱

原因：

* 缺少 Primary 上下文
* 无效的 save chain
* 元数据 (metadata) 丢失

---

#### 解决方法

推荐结构：

维持 `Primary → Suffix` 的先后顺序。

---

#### Eclipse path 恢复失败

原因：

* 缺少 original metadata
* 使用了常规批处理
* 未使用 Eclipse batch

---

#### 解决方法

推荐使用：

```text
Dynamic Image Batch(Eclipse-TJ)
```

---

#### 文件名出现异常

不建议使用的别名：

```text
%D
%T
```

---

#### 推荐使用的别名

建议使用：

```text
%date
%time
```

---

### 9. Save Pipeline System 推荐运行方式

TJ Save 结构推荐以下方式。

---

#### 推荐

```text
- 基于 Primary 生成基准
- 使用 Suffix 进行后续保存
- 以 workflow 为单位管理结果
- 基于功能的 suffix 命名
- 保留元数据 (metadata)
```

---

#### 不推荐

```text
- 随意使用单独的 Save Image
- 覆盖式保存
- 不加 suffix 的后续保存
- 无视原始路径
```

---

### Final Notes

Save Pipeline System 是：

```text
TJ workflow 的输出结果管理层
```

TJ_NODE 的核心并非单纯的存储动作，而是：

```text
以结构化的形态
管理大型 workflow 的输出结果
```

---

#截图 : 最终的 Save Pipeline 演示

---

## Chapter 05 — Workflow Architecture & Real Production Guide

---

### 本章目的

前面的章节主要集中在：

* 节点说明
* 功能说明
* 结构说明

但实际最重要的问题是：

```text
“如何在实战中设计和运营 workflow”
```

TJ_NODE 绝非单纯的实用节点包 (utility node pack)。

TJ_NODE 是一种接近于：

```text
Workflow Operating Layer (工作流运营层)
```

的结构。

换句话说，它是兼顾了：

* workflow 结构
* 可维护性
* 模块化
* 扩展性
* 调试
* 结果管理

的架构工具包 (architecture toolkit)。

---

#截图 : 大规模 TJ workflow 整体架构

---

### TJ_NODE Workflow 哲学

TJ_NODE workflow 的核心哲学不是打造：

```text
“仅仅能运行的 workflow”
```

而是致力于打造：

```text
“可维护的 workflow”
```

---

#### 常规 workflow 的问题

随着规模的增加，会产生：

* 连线增加
* 路由 (routing) 混乱
* preview 节点泛滥
* save 结构崩溃
* batch 结构杂杂
* 陷入无法修改的状态

---

#### TJ workflow 的目标

TJ_NODE 通过以下机制解决上述痛点：

* Wireless Routing (无线路由)
* Modular Workflow (模块化)
* Save Pipeline (保存管道)
* Preview Lifecycle (预览生命周期)
* Fake-Wire (虚拟连线)
* Embedded Get (内置接收)

---

#### 核心概念

在 TJ workflow 中最重要的是：

```text
“将 workflow 按区块 (section) 进行拆分”
```

---

#### 推荐的区块结构

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

#截图 : 区块 workflow 结构

---

### 1. TJ Workflow 推荐架构

#### INPUT SECTION

作用：

* 输入数据集
* 生成 image batch
* 维持元数据
* 归一化 (normalize) 分辨率

推荐节点：

* Multi Image Loader
* Dynamic Image Batch
* Dynamic Image Batch(Eclipse)

---

#截图 : INPUT SECTION

---

#### GENERATION SECTION

作用：

* 生成潜变量 (latent)
* prompt 管道
* sampler 管道

推荐结构：

```text
Prompt
 ↓
KSampler
 ↓
Preview
```

---

#### 重点推荐

在 Generation 区块中，我们推荐：

```text
最小化长距离的可见连线 (visible wire)
```

即推荐使用：

* Set Node
* Multi Router
* Embedded Get

---

#截图 : Generation 无线路由

---

#### EDIT SECTION

作用：

* 图生图 (img2img)
* detail pass
* 调色 (color correction)
* 局部重绘 (inpaint)
* 变体生成 (variation)

---

#### 推荐结构

```text
Generation Result
 ↓
Multi Router
 ↓
Wireless Edit Branches (无线编辑分支)
```

---

#### 优势

* 分离分支
* 保持编辑 workflow 的独立性
* 易于构建对比 (compare) 结构

---

#截图 : Edit 分支

---

#### UPSCALE SECTION

作用：

* 放大 (upscale)
* 修复 (restoration)
* 画质增强 (enhancement)

推荐结构：

```text
Upscale
 ↓
Save Preview
 ↓
Suffix Save
```

---

#### 为什么重要？

因为 Upscale 的结果必须：

```text
绝对保持与原图的关联关系
```

---

#截图 : Upscale workflow

---

#### PREVIEW SECTION

作用：

* 图像检查 (image inspect)
* 全屏检查
* 对比 (compare)
* 备份快照 (snapshot)
* 视频播放 (video playback)

推荐节点：

* Save & Preview Image
* Smart Show
* Save & Preview Video

---

#截图 : preview 区块

---

#### SAVE SECTION

作用：

* 整理输出结果
* 后缀保存 (suffix save)
* 维护 metadata
* 维持 Eclipse 路径

推荐结构：

```text
Primary Save
 ↓
Suffix Save Chain
```

---

#截图 : save 结构

---

### 2. Wireless Workflow 运营方式

TJ_NODE workflow 的核心是：

```text
“wireless section architecture (无线区块架构)”
```

---

#### 推荐方式

推荐结构：

```text
区块内部
=
使用短连线

区块之间
=
使用无线传输 (Wireless)
```

---

#### 为什么重要？

在大型 workflow 中：

```text
冗长的可见连线本身就是维护的难题
```

---

#### 推荐示例

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

#截图 : 无线区块 workflow

---

### 3. Provider Naming 规则

Provider 命名至关重要。

错误的命名会导致：

* 重连逻辑混乱
* 难以理清结构
* 冲突重复 (duplicate) 问题

---

#### 推荐命名结构

推荐：

```text
SECTION_PURPOSE (区块_用途)
```

示例：

```text
INPUT_MAIN_IMAGE
UPSCALE_FINAL_IMAGE
PROMPT_CHARACTER
SAVE_COMPARE_IMAGE
```

---

#### 不推荐的命名

```text
test
aaa
123
temp
```

---

#### 为什么重要？

随着 workflow 规模的增长：

```text
provider 的名称本身将成为路由图 (routing map)
```

---

### 4. Embedded Get 运营策略

在 TJ workflow 中，我们推荐：

```text
积极使用 embedded get
```

---

#### 推荐理由

| 优势 | 说明 |
| - | - |
| 减少节点 | 减少 Get Node 滥用 |
| 简化结构 | 局部直接接收 |
| 提升可读性 | 让 workflow 更整洁 |

---

#### 推荐使用位置

推荐用于：

* Preview 节点
* Save 节点
* Prompt 节点
* 辅助工具 (Utility) 节点

---

#### 不推荐的位置

不推荐：

```text
复杂的 batch 拆分中间环节
```

等动态 (dynamic) 结构较强的位置。

---

#截图 : embedded get 架构

---

### 5. Multi Router 运营策略

在 TJ workflow 中：

```text
Multi Router
```

是最核心的架构节点之一。

---

#### 核心作用

* workflow 分支隔离
* 区块模块化
* 自动生成 Auto Set provider
* 梳理下游结构

---

#### 推荐结构

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

#### 优势

* 保持分支独立性
* 提升架构可读性
* 增强维护性

---

#截图 : Multi Router workflow

---

### 6. Preview 运营策略

TJ preview 系统不仅仅是为了展示结果。

其实际作用更接近于：

```text
workflow 检查系统 (inspection system)
```

---

#### 推荐使用方式

与其：

```text
在每个中间步骤滥用 Save Preview
```

不如：

```text
建立 Section 级别的 preview 检查点 (checkpoint)
```

---

#### 推荐位置

推荐放置在：

* generation 最终步
* upscale 最终步
* compare 分支
* save 最终步

---

#截图 : preview 检查点

---

#### Snapshot 策略

TJ snapshot 系统推荐作为：

```text
用于结果对比的检查点
```

---

#### 示例

```text
基础结果 (Base Result)
 ↓
Snapshot 备份

细节层结果 (Detail Result)
 ↓
Snapshot 备份

对比 (Compare)
```

---

#截图 : snapshot 对比

---

### 7. Save Pipeline 运营策略

TJ Save 结构的设计初衷是为了：

```text
维持 workflow 结果文件的结构关系
```

---

#### 推荐结构

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

#### 优势

* 结果自动分组
* workflow 具备追溯性
* 数据集易于整理

---

#### 不推荐的结构

```text
随意滥用基础的 Save Image
```

---

#### 为什么不推荐？

因为会导致不同结果之间的关系几乎无法追踪。

---

#截图 : 结构化的 save chain

---

### 8. Eclipse Workflow 运营策略

TJ_NODE 可与 Eclipse workflow 混合使用。

---

#### 核心结构

```text
Eclipse SetNode
 ↓
TJ Get
 ↓
TJ Workflow
```

---

#### 推荐使用场景

推荐用于：

* 数据集 workflow
* 依赖 metadata 的流程
* 文件追踪 (file-tracking) workflow

---

#### 重要特征

TJ_NODE 并非：

```text
Eclipse 的替代品 (replacement)
```

相反，它是：

```text
Eclipse bridge layer (桥接层)
```

---

#截图 : Eclipse 桥接 workflow

---

### 9. 大型 Workflow 推荐策略

#### 最重要的原则

```text
“将 workflow 按区块 (section) 拆分”
```

---

#### 推荐的区块

```text
INPUT
GENERATION
EDIT
UPSCALE
PREVIEW
SAVE
```

---

#### 理由

这种结构在：

* 维护性
* 可读性
* 调试 (debug)
* 复用性 (reuse)

方面表现最为强悍。

---

#### 推荐规则

| 规则 | 理由 |
| - | - |
| 最小化长连线 | 提升可读性 |
| 使用无线区块 (wireless section) | 模块化 |
| 规范 provider 命名 | 便于调试 |
| 维持 Save chain | 结果追踪 |
| 部署 Preview 检查点 | 对比分析 |

---

#截图 : 推荐的大型 workflow

---

### 10. TJ Workflow 调试 (Debug) 策略

#### 推荐的调试顺序

#### 第 1 步

使用：

```text
Show ALL Wires
```

检查 provider 连接。

---

#### 第 2 步

使用：

```text
Smart Show
```

检查数据类型。

---

#### 第 3 步

使用：

```text
Save Preview Snapshot
```

进行步骤对比。

---

#### 第 4 步

使用：

```text
Refresh ALL Get Nodes
```

刷新 provider。

---

#### 推荐的调试节点

推荐：

* Smart Show
* Save Preview
* Multi Router

---

#截图 : debug workflow

---

### 11. Reload-Safe Workflow 策略

TJ_NODE 非常注重 reload-safe (防重载) 的结构设计。

---

#### 推荐方式

```text
- 保持提供者名称不变
- 维持 Auto Set 结构
- 维持 save chain
- 经常保存 workflow
```

---

#### 不推荐

```text
- 随意重命名 provider
- 滥用重复的 provider
- 不稳定的动态分支
```

---

#### 为什么重要？

在大型 workflow 中：

```text
重新加载的稳定性
=
workflow 的生存能力
```

---

### 12. TJ_NODE 推荐运营哲学

TJ_NODE workflow 并不以：

```text
“只要能运行就行”
```

为目标。

---

#### TJ_NODE 的目标

TJ_NODE 的目标是构建：

```text
- 可维护的 workflow
- 可扩展的 workflow
- 易读的 workflow
- 可恢复的 workflow
```

---

#### 最核心的概念

TJ workflow 的灵魂是：

```text
“工作流架构 (workflow architecture)”
```

---

### Final Notes

TJ_NODE 并非单纯的实用节点包。

TJ_NODE 是：

```text
Large Scale Workflow Architecture Toolkit
(大型工作流架构工具包)
```

TJ_NODE 的核心不是：

```text
消除连线
```

而是：

```text
让大型 workflow
成为能在实际生产中稳定运营的架构
```

---

#截图 : 最终 TJ workflow 演示

---

## Chapter 06 — Troubleshooting & Internal Systems

---

### 本章目的

前面的章节重点在于：

* 节点说明
* workflow 结构
* 运营方式

但在实际的大规模 workflow 中：

```text
“当问题发生时，
理解其原因并具备恢复的能力”
```

是非常重要的。

TJ_NODE 并非单纯的节点堆砌，而是：

```text
workflow architecture layer
(工作流架构层)
```

因此，理解以下内部系统非常重要：

* fake-wire
* embedded get
* provider registry
* preview lifecycle
* reload-safe restore

---

#截图 : TJ 内部系统概览

---

### 1. Fake-Wire 内部机制 (Internal System)

TJ Fake-Wire 的设计为：

```text
保留物理连接
+
最小化视觉连接
```

---

#### 核心目的

将 workflow 维持在：

```text
可读状态
```

---

#### 内部结构

TJ Fake-Wire 实际上并**没有**消除：

```text
LiteGraph connection (底层连接)
```

相反，它使用了：

* 连接可见性控制 (connection visibility control)
* 透明渲染 (transparent rendering)
* 悬停渲染 (hover rendering)
* 调试渲染 (debug rendering)

等结构。

---

#### 为什么重要？

也就是说：

```text
逻辑上的连接被完整保留
```

因此：

* 运行 (execution)
* 保存 (save)
* 重新加载 (reload)
* 恢复 (restore)

依然能够正常工作。

---

#截图 : fake-wire 渲染结构

---

### 2. 实时连线悬停系统 (Realtime Wire Hover System)

Realtime Wires View Mode 是：

```text
仅在悬停 (hover) 时显示连线
```

的系统。

---

#### 目的

平时保持：

```text
清爽的 workflow (clean workflow)
```

仅在需要时：

```text
进行临时连接检查 (temporary connection inspect)
```

---

#### 推荐设置

在 TJ workflow 中，通常推荐以下状态：

```text
Realtime Wires View Mode = ON
Show ALL Wires = OFF
```

---

#### 为什么重要？

这种结构在：

* 可读性
* 调试
* 减少视觉杂乱

之间的平衡感最好。

---

#截图 : hover wire 示例

---

### 3. Show ALL Wires 系统

Show ALL Wires 是：

```text
强制显示所有隐藏连线
```

的模式。

---

#### 推荐使用场景

推荐用于：

* 追踪 provider
* 调试无线结构
* 校验连接
* 检查路由

---

#### 注意事项

在大型 workflow 中：

```text
可能导致连线杂乱度激增
```

在日常操作中建议保持 OFF。

---

#截图 : 开启 Show ALL Wires 状态

---

### 4. Provider 注册表系统 (Provider Registry System)

TJ 无线架构的核心是：

```text
Provider Registry
```

---

#### 作用

用于处理当前活跃 provider 的：

* 注册
* 管理
* 重连
* 清理

---

#### 内部管理的信息

| 信息 | 说明 |
| - | - |
| provider name | setnode_name |
| source node | 设置该 provider 的节点 |
| type | IMAGE / STRING 等数据类型 |
| connection state | 连接状态 |

---

#### 为什么重要？

我们看到的 Get 列表实际上是：

```text
基于 Provider Registry 生成的
```

---

#截图 : provider registry 流程

---

### 5. Embedded Get 内部逻辑

Embedded Get 在内部采用了：

```text
无线接收小部件 (wireless receive widget)
```

的结构。

---

#### 内部动作

embedded get 执行以下动作：

1. 查询 provider 注册表
2. 校验数据类型
3. 移除无效的 provider
4. 处理重连 (reconnect)

---

#### 关键特征

TJ_NODE 使得：

```text
Get Node
与
Embedded Get
```

运行在同一个 wireless lifecycle (无线生命周期) 之上。

即它们在结构上是同一个系统。

---

#### 为什么重要？

得益于该结构，可以保持：

* provider 同步
* 防重载重连 (reload-safe reconnect)
* fake-wire 一致性

---

#截图 : embedded get 生命周期

---

### 6. Refresh ALL Get Nodes (刷新所有接收节点)

#### 最重要的恢复功能

右键菜单：

```text
Refresh ALL Get Nodes
```

是极其重要的修复 (repair) 功能。

---

#### 作用

执行以下任务：

* 重新扫描 provider
* 清理无效的 provider
* 重建下拉列表
* 刷新重连状态

---

#### 什么时候使用？

推荐场景：

| 场景 | 说明 |
| - | - |
| provider rename | 更改名称后 |
| workflow reload | 重新加载页面后 |
| Eclipse 同步问题 | provider 不匹配 |
| get 列表异常 | 列表内容混乱 |

---

#### 推荐习惯

在大型 workflow 中：

```text
修改 provider 结构后
建议执行 Refresh
```

---

#截图 : Refresh ALL Get Nodes

---

### 7. 无线重连系统 (Wireless Reconnect System)

TJ_NODE 极其注重：

```text
reload-safe reconnect (防重载的自动重连)
```

结构。

---

#### 作用

在 workflow reload 之后，会自动执行：

* provider reconnect
* 重建 fake-wire
* embedded get reconnect

---

#### 为什么重要？

在大型 workflow 中：

```text
重载的稳定性
=
workflow 的生存能力
```

---

#### 推荐结构

推荐：

```text
使用稳定的 provider 命名
```

---

#### 不推荐的结构

```text
随意重命名 provider (random provider rename)
出现重复的 provider (duplicate provider)
```

---

#截图 : reconnect 恢复

---

### 8. 预览生命周期系统 (Preview Lifecycle System)

TJ preview 系统并非简单的图像查看器。

其实际机制更接近于：

```text
预览生命周期架构 (preview lifecycle architecture)
```

---

#### 管理的状态

| 状态 | 说明 |
| - | - |
| preview image | 当前预览的图像 |
| snapshot | 复制的预览副本 |
| fullscreen state | 放大状态 |
| grid state | batch 网格排版 |
| restore metadata | 用于重载恢复的元数据 |

---

#### 为什么重要？

普通的预览节点经常发生：

```text
reload 后丢失预览结果
```

TJ preview 被设计为尽可能减少此类丢失。

---

#截图 : preview 生命周期

---

### 9. Snapshot Preview 系统

TJ 的预览复制机制并非：

```text
实时镜像 (live mirror)
```

而是采用：

```text
分离的快照 (detach snapshot)
```

结构。

---

#### 目的

推荐用途：

* 对比 (compare)
* 检查点 (checkpoint)
* 保留结果 (result preserve)

---

#### 优势

| 优势 | 说明 |
| - | - |
| 支持 compare | 保留过往结果 |
| workflow 记录 | 阶段性结果快照 |
| 易于 debug | 便于问题追踪 |

---

#截图 : snapshot 对比

---

### 10. Video Preview 内部机制

Save & Preview Video 基于：

```text
HTML5 video 架构
```

运行。

---

#### 内部功能

管理以下状态：

* 播放 (playback)
* 音频同步 (audio sync)
* 帧预览 (frame preview)
* 恢复解码 (decode restore)
* 视频快照 (video snapshot)

---

#### 关键特征

video 的解码结果：

```text
可作为 IMAGE batch
```

在下游继续使用。

---

#### 为什么重要？

也就是说：

```text
可以将 video workflow
=
当做 image workflow
```

来处理。

---

#截图 : video 内部流程

---

### 11. 互斥保护机制 (Mutex Protection System)

Save & Preview Video 会阻止：

```text
image + video 直接同时输入
```

---

#### 原因

同时连接可能导致：

* ambiguous state (状态模糊)
* invalid decode (无效解码)
* playback mismatch (播放错乱)

---

#### reload-safe 目的

确保在重新加载后：

```text
仍能清理失效的源数据 (stale source)
```

---

#截图 : mutex 保护

---

### 12. 保存生命周期系统 (Save Lifecycle System)

TJ Save 结构专门负责管理：

```text
保存上下文生命周期 (save context lifecycle)
```

---

#### 管理项目

| 项目 | 说明 |
| - | - |
| base path | 基础保存位置 |
| suffix chain | 后续保存链路 |
| metadata | 关联的 save 信息 |
| collision handling | 冲突处理 |

---

#### 目的

为了将 workflow 的结果文件：

```text
以结构化的方式维持下来
```

---

#截图 : save 生命周期

---

### 13. 冲突处理机制 (Collision Handling System)

当存在同名文件名时，自动递增：

```text
_001
_002
_003
```

进行保存。

---

#### 为什么重要？

在海量图像生成中：

```text
覆盖事故 (overwrite)
```

非常常见。TJ Save 最大程度防止该问题。

---

#截图 : 冲突处理示例

---

### 14. 常见问题

#### Get 节点无法连接

检查：

* provider 是否确实存在
* 是否有重名的 duplicate provider
* workflow 重新加载状态

---

#### 解决方法

推荐执行：

```text
Refresh ALL Get Nodes
```

---

#### Provider 列表不显示

原因：

* Set Node 被删除
* 无效的 provider
* 注册表未更新 (stale registry)

---

#### 解决方法

* 确认 provider 设置
* 重新连接
* 保存 workflow 后重新加载 (reload)

---

#### 预览黑屏 (Preview Black Screen)

检查：

* 是否存在 IMAGE batch
* 是否生成了解码帧
* 浏览器的自动播放 (autoplay) 策略

---

#### 无法退出全屏 (Fullscreen)

原因：

```text
overlay pointer conflict (UI 覆盖层指针冲突)
```

---

#### 解决方法

建议升级并使用最新的 TJ preview 结构。

---

#### 视频无法播放

检查：

* fps 设置
* 是否处于静音 (muted) 状态
* 浏览器的 autoplay 限制

---

#### 音频控制器未显示

检查：

* audio_a
* audio_b

是否已正确连接。

---

#### 保存路径混乱

原因：

* 缺少 Primary 基准上下文
* invalid save chain (无效的保存链路)

---

#### 解决方法

推荐：

```text
维持 Primary → Suffix
```

的先后结构。

---

### 15. Workflow 修复指南 (Repair Guide)

#### 推荐的修复顺序

#### 第 1 步

通过：

```text
Show ALL Wires
```

检查连接情况。

---

#### 第 2 步

使用：

```text
Smart Show
```

检查数据流。

---

#### 第 3 步

执行：

```text
Refresh ALL Get Nodes
```

---

#### 第 4 步

保存 workflow 后进行 reload。

---

#### 推荐的调试节点

推荐：

* Smart Show
* Save Preview
* Multi Router

---

#截图 : debug workflow

---

### 16. Reload-Safe Workflow 设计策略

TJ workflow 中推荐以下设计：

---

#### 推荐

```text
- 稳定的 provider 命名
- 维持 Auto Set
- 维持区块架构 (section architecture)
- 维持 save chain
```

---

#### 不推荐

```text
- 存在重复 (duplicate) provider
- 随意更改命名
- 不稳定的动态分支
- 冗长的可视连线
```

---

#### 为什么重要？

在大型 workflow 中：

```text
reload-safe 结构
=
workflow 可持续维护的保证
```

---

### 17. 推荐的最佳实践 (Recommended Best Practices)

TJ workflow 的推荐运营方式。

---

#### 推荐项

| 推荐行为 | 理由 |
| - | - |
| 充分使用 Embedded Get | 简化 workflow |
| 使用 Multi Router 结构 | 隔离区块 (section) |
| 建立 Preview checkpoint | 用于结果对比 |
| 维持 Save Chain | 结构化整理结果 |
| 规范化 provider 命名 | 便于 debug |

---

#### 推荐的预览策略

```text
滥用中间预览
❌

使用区块级 checkpoint 预览
⭕
```

---

#### 推荐的保存策略

```text
Primary Save
 ↓
Suffix Chain
```

维持此结构。

---

### 18. 反面模式 (Anti-Patterns)

#### 绝对不推荐的结构

---

#### Duplicate Provider (重复提供者)

```text
MAIN_IMAGE
MAIN_IMAGE
MAIN_IMAGE
```

---

#### Giant Visible Wire (巨型可视连线)

一条贯穿 workflow 全局的长连线。

---

#### Random Naming (随机命名)

```text
aaa
test
temp
```

---

#### 滥用 Save Image

在没有建立 Save 结构的情况下随意存放。

---

#### Dynamic Chaos Workflow (混沌工作流)

毫无分支结构、错综复杂的巨型 workflow。

---

#### 为什么危险？

这些结构会导致：

* 难以调试 (debug)
* 重连不稳定
* 保存文件一团糟
* 彻底丧失可维护性

---

#截图 : anti-pattern workflow

---

### Final Notes

TJ_NODE 绝非单纯的实用节点包。

TJ_NODE 是：

```text
Workflow Architecture Toolkit (工作流架构工具箱)
```

TJ_NODE 的核心并非：

```text
消除连线
```

而是：

```text
让大型 workflow
在实际操作中能保持可维护的状态
```

---

#截图 : 最终的架构展示

---

## Chapter 07 — HTML5 UI System & Advanced Features

---

### 本章目的

TJ_NODE 的最大特色之一是：

```text
“超越单纯 LiteGraph 节点级别的
基于 HTML5 的 UI 系统”
```

许多 TJ 节点在内部深层使用了：

* HTML5 覆盖层 (overlay)
* 自定义 DOM
* 动态 UI (dynamic UI)
* 交互式预览 (interactive preview)
* 实时控制 (realtime control)
* 定制化播放器 (custom player)

也就是说，TJ_NODE 不是单纯的：

```text
ComfyUI utility node (实用节点)
```

而在结构上更接近于：

```text
Workflow Interface Layer (工作流界面层)
```

---

#截图 : TJ HTML5 UI 概览

---

### 1. HTML5 覆盖系统 (Overlay System)

TJ_NODE 中的许多功能并**不是**单纯通过：

```text
Canvas draw (画布绘制)
```

来实现的。

相反，它积极利用了：

```text
HTML5 DOM Overlay (DOM 覆盖层)
```

系统。

---

#### 为什么重要？

原生的 LiteGraph UI 存在以下问题：

* 交互能力有限
* 预览能力有限
* 媒体控制能力有限

TJ_NODE 通过：

* DOM 覆盖层
* 交互式 UI
* 定制控件 (custom controls)

扩展了这部分能力。

---

#### 涉及的功能

| 功能 | 说明 |
| - | - |
| HTML5 video | 视频播放 |
| HTML5 audio | 音频播放器 |
| DOM overlay | 定制化 UI |
| 全屏预览 | 图像检查 |
| 动态控制器 | 运行时 (runtime) UI |

---

#截图 : overlay UI 结构

---

### 2. Smart Preview Overlay 系统

TJ Preview 系统绝不是简单的图像绘制。

实际上它是基于：

```text
overlay-driven preview architecture (基于覆盖层的预览架构)
```

构建的。

---

#### 管理的元素

| 元素 | 说明 |
| - | - |
| image layer (图像层) | 负责展示预览 |
| overlay layer (覆盖层) | 负责按钮 |
| fullscreen layer (全屏层) | 负责全屏 UI |
| interaction layer (交互层) | 鼠标/键盘监听 |

---

#### 为什么重要？

得益于这种结构，才实现了诸如：

* fullscreen (全屏)
* preview restore (预览恢复)
* snapshot (快照副本)
* keyboard control (键盘控制)

等功能。

---

#截图 : preview 覆盖层分层

---

### 3. Save & Preview Image HTML5 功能

Save & Preview Image 是最积极利用 TJ HTML5 结构的节点。

---

#### 包含功能

| 功能 | 说明 |
| - | - |
| fullscreen overlay | 放大查看层 |
| grid layout | batch 网格布局 |
| refresh overlay | 刷新预览层 |
| keyboard navigation | 方向键移动 |
| fit-center | 居中适配 |
| snapshot restore | 维持预览状态 |

---

#截图 : Save Preview HTML5 UI

---

### 4. Fullscreen Overlay 系统

#### 目的

这是一个旨在：

```text
以实际画质级别检查图像细节
```

的系统。

---

#### 主要功能

| 功能 | 说明 |
| - | - |
| fullscreen preview | 全屏展示 |
| zoom inspect | 放大检查 |
| batch navigation | 切换上一张/下一张 |
| ESC close | 关闭全屏 |

---

#### 进入方法

方法：

* 点击图像
* 按下 F / f 键

---

#### 退出方法

| 方式 | 说明 |
| - | - |
| ESC | 退出全屏 |
| X 按钮 | 关闭 |
| 点击背景 | 关闭 |

---

#截图 : fullscreen viewer

---

#### 重要的修正事项

过去的 TJ preview 在：

```text
refresh overlay
```

与：

```text
close button (关闭按钮)
```

之间存在指针 (pointer) 冲突问题。

当前的结构已通过：

```text
分离 overlay pointer layer
```

得到解决。

---

#### 为什么重要？

该问题曾导致：

```text
无法关闭 fullscreen
```

的现象。

现在使用的结构：

* X 按钮已独立
* refresh overlay 已分离
* 排除了指针冲突

---

#截图 : overlay pointer 层级分离

---

### 5. 键盘控制系统 (Keyboard Control System)

TJ preview 支持键盘导航。

---

#### 支持的按键

| 按键 | 功能 |
| - | - |
| F / f | 全屏 |
| ESC | 退出全屏 |
| ← | 上一张图像 |
| → | 下一张图像 |

---

#### 目的

在大批量图像检查时：

```text
最大程度减少鼠标移动
```

---

#### 推荐使用场景

推荐用于：

* 图像对比 (image compare)
* batch 审查
* detail pass 对比

---

#截图 : 键盘导航 (keyboard navigation)

---

### 6. Smart Grid 系统

TJ preview 的网格绝不是简单的平铺绘制 (tile draw)。

实际上，它是：

```text
dynamic responsive preview grid (动态响应式预览网格)
```

结构。

---

#### 特征

| 特征 | 说明 |
| - | - |
| 2px spacing | 清晰的间距分割 |
| fit-center | 居中适配 |
| aspect 保持 | 维持宽高比 |
| resize-safe | 稳定防崩坏的布局 |

---

#### 为什么重要？

常规网格经常出现：

* 比例失真
* 图像相互遮挡重叠
* 缩放导致画面瑕疵 (artifact)

TJ grid 系统就是为了最大限度地解决这些问题而设计的。

---

#截图 : smart grid 示例

---

### 7. Node Resize 策略

TJ preview 策略是：

```text
尽量避免在执行时强制改变 node.size
```

---

#### 当前结构

在节点生成时：

```text
预留出基础的预览区域
```

随后：

* 执行 fit-center
* 维持用户设定的节点大小 (user resize)

---

#### 为什么重要？

自动调整大小会引发：

* workflow 布局崩溃
* 用户的排版被破坏
* 预览框反复跳动 (jump)

---

#### 当前推荐的结构

```text
提供初始预览区域
+
保持用户调整的大小
```

---

#截图 : resize-safe 安全预览

---

### 8. Preview Restore 系统

TJ preview 支持：

```text
reload-safe restore
```

机制。

---

#### 维持的状态

| 状态 | 说明 |
| - | - |
| preview image | 最后一次结果 |
| grid state | batch 排版状态 |
| fullscreen state | 全屏状态 |
| snapshot | 分离保存的预览副本 |

---

#### 为什么重要？

普通的预览节点：

```text
在重新加载页面后必定丢失结果
```

这非常让人头疼。TJ preview 则被设计为尽量减少此问题。

---

#截图 : preview 恢复机制

---

### 9. Snapshot 分离备份系统 (Detach System)

TJ 的预览复制功能并不是简单的：

```text
live mirror (实时镜像)
```

而是采用了：

```text
detach snapshot (完全分离的快照备份)
```

结构。

---

#### 为什么重要？

可以将复制的预览用于：

* 对比 (compare)
* 检查点 (checkpoint)
* workflow 记录保存

---

#### 示例

```text
Base Result Snapshot
 ↓
Detail Pass Snapshot
 ↓
Compare
```

---

#截图 : snapshot compare workflow

---

### 10. Save & Preview Video HTML5 系统

Save & Preview Video 是 TJ HTML5 结构中最复杂的节点。

---

#### 支持的功能

| 功能 | 说明 |
| - | - |
| HTML5 video player | 视频播放 |
| audio controller | 音频控件 |
| dual audio UI | A/B 双音频播放 |
| decode preview | 帧解码审查 |
| playback restore | 重新加载恢复 |

---

#截图 : video HTML5 UI

---

### 11. 视频播放系统 (Video Playback System)

#### IMAGE Batch 播放

基于：

```text
IMAGE batch
 ↓
HTML5 playback
```

的结构。

---

#### 目的

推荐用途：

* AnimateDiff
* VFI
* 插帧 (interpolation)
* 帧检查 (frame inspect)

---

#### 关键特征

playback 并不仅是一个预览窗口，而是一个：

```text
交互式播放层 (interactive playback layer)
```

---

#截图 : image batch playback

---

### 12. Video Decode 系统

输入 VIDEO 时：

```text
video
 ↓
帧解码 (frame decode)
 ↓
IMAGE batch
```

会自动执行。

---

#### 优势

解码后的结果可以作为：

```text
普通 IMAGE workflow
```

在下游继续使用。

---

#### 推荐使用场景

推荐用于：

* 帧编辑 (frame edit)
* img2img 动画
* 逐帧放大 (frame upscale)
* VFI

---

#截图 : decode workflow

---

### 13. Audio Controller 系统

TJ video 采用：

```text
dynamic audio controller (动态音频控件)
```

结构。

---

#### 控制器生成规则

| 输入状态 | 控制器数量 |
| - | - |
| audio_a | 1 个 |
| audio_b | 1 个 |
| audio_a+b | 2 个 |

---

#### 目的

根据 workflow 当前的状态：

```text
只生成必要的 UI
```

---

#截图 : 双音频控制器

---

### 14. Audio Only 模式

如果 save_type 设置为：

```text
audio only
```

则激活专用的 audio 模式 UI。

---

#### 推荐使用场景

推荐用于：

* 音轨导出 (soundtrack export)
* 音频调试 (audio debug)
* 混流检查 (remux inspect)

---

#截图 : audio only 模式

---

### 15. HTML5 交互安全保护 (Interaction Safety)

TJ HTML5 UI 高度重视：

```text
pointer safety (指针事件安全)
```

机制的设计。

---

#### 主要管理目标

| 目标 | 说明 |
| - | - |
| overlay pointer | 点击事件处理 |
| fullscreen layer | 交互逻辑拦截 |
| refresh layer | 预览刷新控制 |
| drag event | 防止在拖动时发生冲突 |

---

#### 为什么重要？

如果 HTML5 覆盖层设计不当，会导致：

* 点击事件丢失
* 拖拽操作冲突
* 全屏卡死 (stuck)

TJ_NODE 的设计将这些问题降到了最低。

---

#截图 : pointer safety 结构

---

### 16. 实时 UI 性能策略 (Realtime UI Performance)

TJ preview 系统在设计上非常看重：

```text
实时的 UI 性能
```

---

#### 推荐结构

| 推荐项 | 理由 |
| - | - |
| checkpoint 预览 | 减少无意义渲染 |
| section 分区预览 | 结构化、轻量化 |
| snapshot compare | 减少重复的 reload |

---

#### 不推荐

```text
让 preview 节点遍布 workflow 全局
```

---

#### 为什么重要？

大量的 HTML5 预览可能导致：

* 浏览器内存飙升
* DOM 覆盖层过多
* 交互出现卡顿 (lag)

---

### 17. TJ HTML5 UI 哲学

TJ_NODE 的 HTML5 结构不仅仅是为了装饰。

其最终目的是：

```text
将 workflow 打造成为真正可运行、可操作的界面
```

---

#### 核心哲学

TJ_NODE 旨在：

```text
在 ComfyUI 内部
构建出生产级工作流的 UI 交互层
```

---

### Final Notes

TJ HTML5 UI System 是：

```text
TJ workflow 的交互层 (interaction layer)
```

TJ_NODE 的核心并非为了展示炫酷的预览，而是：

```text
让大型的 workflow
保持在实际可用的稳健状态之中
```

---

#截图 : 最终的 HTML5 UI 展示

---

## Chapter 08 — Real Workflow Examples & Production Pipelines

---

### 本章目的

前面的章节主要偏向：

* 节点功能介绍
* 系统结构介绍
* 内部架构解析

但其实最核心的问题是：

```text
“在实战中，我们应该如何构建 workflow ？”
```

在本章节中，我们将基于实际的 workflow 讲解：

* 实际生产级的 workflow (production workflow)
* 推荐架构 (recommended architecture)
* 区块 (section) 结构
* 路由 (routing) 策略
* 存储 (save) 策略
* 调试 (debug) 策略

---

#截图 : TJ 生产级 workflow 概览

---

### TJ Workflow 核心理念

TJ workflow 并不是教你如何去搭建：

```text
“一个单一且庞大的巨型 workflow”
```

其核心理念是：

```text
“将拆分好的各个小型 workflow 区块
通过无线路由串联起来”
```

---

#### 推荐结构

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

#### 为什么重要？

这种结构对于：

* 可读性 (readability)
* 调试排错 (debug)
* 防重载崩溃 (reload-safe)
* 后期维护

具备最强的生命力。

---

#截图 : section workflow 架构

---

### 1. 基础图像生成 Workflow

#### 目的

这是最基础的：

```text
text → image generation
```

生成示例。

---

#### 推荐结构

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

#### 工作流说明

| 步骤 | 作用 |
| - | - |
| Prompt Text | 将提示词结构化 |
| Concatenate | 组合 prompt |
| KSampler | 核心生成 |
| Save Preview | 检查结果 |
| Primary Save | 建立基准保存 |

---

#截图 : 基础 generation workflow

---

#### 推荐理由

该结构十分有利于维持：

* prompt 模块化
* 预览检查点 (preview checkpoint)
* 保存逻辑一致性

---

### 2. 无线生成 Workflow

#### 目的

消除冗长可见连线 (visible wire) 的结构。

---

#### 推荐结构

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

#### 优势

| 优势 | 说明 |
| - | - |
| workflow 简化 | 消除远距离连线 |
| 可读性提升 | 结构分层明确 |
| 区块模块化 | 易于修改和维护 |

---

#截图 : 无线 generation workflow

---

### 3. 多图数据集 Workflow

#### 目的

处理海量数据集的 workflow 结构。

---

#### 推荐结构

```text
Multi Image Loader
 ↓
Dynamic Image Batch
 ↓
Multi Router
 ↓
处理分支 (Processing Branches)
```

---

#### 推荐使用场景

推荐用于：

* 时尚/服装数据集
* 姿势 (pose) 数据集
* 批量的 img2img
* 批量的 upscale 流程

---

#### 重要关键点

在数据集 workflow 中：

```text
分辨率归一化 (resolution normalize)
```

是极为重要的一环。

---

#### 推荐设置

| 项目 | 推荐值 |
| - | - |
| resize mode | long edge (长边基准) |
| scale mode | center crop (居中裁剪) |
| metadata 维护 | 采用 Eclipse batch 节点 |

---

#截图 : 数据集 workflow

---

### 4. 大型 Prompt 架构

#### 目的

用于将繁杂的提示词：

```text
以模块化结构 (modular structure)
```

进行管理的 workflow。

---

#### 推荐结构

```text
Character Prompt (角色提示词)
 ↓
Set Node

Style Prompt (风格提示词)
 ↓
Set Node

Lighting Prompt (光影提示词)
 ↓
Set Node

Generation
 ↓
MultiGet
 ↓
Text Concatenate (文本拼接)
```

---

#### 优势

* prompt 具有复用性
* 按区块进行管理
* 后期 compare workflow 极为容易

---

#### 推荐命名规则

```text
PROMPT_CHARACTER
PROMPT_STYLE
PROMPT_LIGHTING
```

---

#截图 : 模块化 prompt 架构

---

### 5. Multi Router 生产流 (Production Workflow)

#### 目的

利用 Multi Router 节点将 workflow 拆分成：

```text
生产分支 (production branch)
```

的进阶结构。

---

#### 推荐结构

```text
Generation
 ↓
Multi Router
 ├─ Preview (预览分支)
 ├─ Upscale (放大分支)
 ├─ Save (保存分支)
 ├─ Compare (对比分支)
 └─ Video (视频处理分支)
```

---

#### 为什么重要？

这种结构在面对：

* 分支完全独立运行
* workflow 可读性要求
* 高效化 debug

时，具有不可替代的强悍优势。

---

#截图 : 基于 router 的生产 workflow

---

### 6. 预览检查点 Workflow (Preview Checkpoint)

#### 目的

将中间生成结果以：

```text
checkpoint (检查点)
```

的形式进行留存管理的结构。

---

#### 推荐方式

```text
Generation Result
 ↓
备份为 Save Preview Snapshot

Detail Pass 结果
 ↓
备份为 Save Preview Snapshot

进行最终 Compare (对比)
```

---

#### 优势

| 优势 | 说明 |
| - | - |
| 结果对比 | 可以看到过往结果以进行微调 |
| debug | 支持步步排查 (step-by-step) |
| checkpoint | 方便 workflow 复盘 |

---

#截图 : checkpoint workflow

---

### 7. Upscale 生产流 Workflow

#### 目的

在执行 upscale 放大操作后，将结果：

```text
与原图保持明确的从属关系
```

进行留存的保存结构。

---

#### 推荐结构

```text
Base Result (生成原图)
 ↓
Primary Save (生成基准路径)

Upscale (放大)
 ↓
Suffix Save (追加后缀保存)

Detail Pass (细节处理)
 ↓
Suffix Save (追加后缀保存)
```

---

#### 优势

* 保持结果之间的父子关联
* 对比文件时更直观
* 生成最终数据集时更易于整理

---

#### 推荐后缀 (suffix)

| suffix | 目的 |
| - | - |
| upscale | 放大图专用 |
| detail | detail pass 效果层 |
| compare | 专用于对比备份的文件 |
| mask | 处理用的蒙版 |

---

#截图 : upscale save chain

---

### 8. 动画流 Workflow (Animation Workflow)

#### 目的

基于 IMAGE batch 处理逻辑的 animation 动画流结构。

---

#### 推荐结构

```text
Frame Generator (动画生成源)
 ↓
Dynamic Batch
 ↓
Save & Preview Video
 ↓
Preview Playback (互动播放)
```

---

#### 推荐使用场景

推荐用于：

* AnimateDiff
* 插帧 (interpolation)
* VFI 工作流
* frame compare (帧比对)

---

#### 推荐 fps 设置

| 用途 | 推荐值 |
| - | - |
| preview 审视 | 12~16 |
| standard 动画标准 | 24 |
| cinematic 电影感 | 30 |

---

#截图 : 动画 workflow

---

### 9. 视频解码流 Workflow (Video Decode)

#### 目的

将已存在硬盘中的 mp4 视频：

```text
导入并转换为 IMAGE batch 工作流
```

---

#### 推荐结构

```text
Video Input (视频源)
 ↓
Save & Preview Video (执行解码)
 ↓
Decoded IMAGE batch (输出解码帧)
 ↓
Frame Processing (进入帧处理流程)
```

---

#### 推荐使用场景

推荐用于：

* 视频逐帧放大 (frame upscale)
* 视频图生图 (img2img animation)
* VFI 插帧处理
* 逐帧修复 (frame repair)

---

#截图 : video decode workflow

---

### 10. 对比流 Workflow (Compare Workflow)

#### 目的

为了能够将诸多不同的生成效果：

```text
同时进行并排比对
```

的 workflow 结构。

---

#### 推荐结构

```text
Base Result (基准)
 ↓
Snapshot (保存快照)

Variant A (变体 A)
 ↓
Snapshot (保存快照)

Variant B (变体 B)
 ↓
Snapshot (保存快照)
```

---

#### 推荐节点

推荐使用：

* Save & Preview Image
* Smart Show

---

#截图 : compare workflow

---

### 11. Eclipse 兼容流 Workflow

#### 目的

实现 Eclipse workflow 与 TJ workflow 混合互通的操作流。

---

#### 推荐结构

```text
Eclipse SetNode
 ↓
TJ Get
 ↓
进入 TJ Workflow
 ↓
最终经由 Eclipse Save 输出
```

---

#### 关键特征

必须强调的是，TJ_NODE 并不是：

```text
取代 Eclipse (Eclipse replacement)
```

相反，它是充当：

```text
workflow 间的一座桥梁 (bridge layer)
```

---

#### 推荐使用场景

推荐用于：

* 数据集处理流程
* 高度依赖元数据 (metadata) 的流
* 必须保持原始路径树状图的 workflow

---

#截图 : Eclipse 桥接 workflow

---

### 12. 大规模 Workflow 设计终极策略

#### 最核心原则

```text
必须将整个 workflow 按功能区块 (section) 进行强力隔离拆分。
```

---

#### 推荐区块 (Section) 分层

```text
INPUT (输入层)
GENERATION (生成层)
EDIT (编辑层)
UPSCALE (放大层)
PREVIEW (预览层)
SAVE (存储层)
```

---

#### 推荐组装结构

```text
在区块 (Section) 的内部
=
允许短距离的实线连接 (wire)

在不同区块 (Section) 之间
=
强制使用无线化传输 (Wireless)
```

---

#### 优势

全面提升：

* 可读性 (readability)
* 防重载性能 (reload-safe)
* 长期维护性 (maintainability)
* 排障速度 (debug speed)

---

#截图 : 大型 workflow 范例展示

---

### 13. 推荐的最佳实践法则 (Best Practices)

TJ workflow 的推荐日常运营规范：

---

#### 推荐规范

| 推荐项 | 实施理由 |
| - | - |
| 充分利用 Embedded Get | 可进一步消除冗余 Get 节点 |
| Multi Router 作为分发枢纽 | 有效管理分支隔离 |
| 建立 Preview 检查点 (checkpoint) | 可视化地比对变动结果 |
| 严守 Save Chain (保存链) | 可确保生成的碎片被统一追踪 |
| Provider 必须符合命名规范 | 这是 debug 时唯一且可靠的路径图 |

---

#### 推荐的预览 (Preview) 策略

采用：

```text
Section 级别的检查点 (checkpoint)
```

的宏观预览思维。

---

#### 推荐的存储 (Save) 策略

维持：

```text
Primary
 ↓
Suffix Chain
```

为核心骨架。

---

### 14. 绝对不可取的反面模式 (Anti-Pattern)

#### 巨型意大利面流 (Giant Workflow)

最致命的错误：

```text
将成百上千的节点
全部用可视连线 (wire) 牵扯在一起的巨物
```

---

#### 产生的问题

* 可读性彻底崩溃
* debug 时根本无从下手
* 重连常常导致卡死闪退
* 存储毫无章法 (save chaos)

---

#### Provider 命名之灾 (Duplicate Chaos)

例如使用诸如：

```text
MAIN_IMAGE
MAIN_IMAGE
MAIN_IMAGE
```

这种多个相同 Provider。

---

#### 存储混乱 (Save Chaos)

例如毫无体系地：

```text
随意丢出个别 Save Image 节点，不加 suffix
```

就进行存储。

---

#### 为什么这是危险的？

因为一旦过了几个小时，你将几乎无法从磁盘中追踪出某张图是如何生成的、对应的关联文件又在哪儿。

---

#截图 : 反面教材 (anti-pattern) workflow 示例

---

### 15. TJ Workflow 的生产力哲学体系

TJ workflow 的研发终极目标并不是：

```text
“教你怎么连线能画出一张图”
```

---

#### 终极目标

TJ workflow 的核心价值在于：

```text
- 如何打造能长久服役的 workflow (Maintainable)
- 如何让节点故障时可被迅速恢复 (Recoverable)
- 如何让组件规模无痛膨胀 (Scalable)
- 如何让人在阅读他人工作流时清晰明了 (Readable)
```

---

#### 贯穿始终的理念

请永远记住，TJ_NODE 是：

```text
“一套严密的工作流架构工具包 (Workflow Architecture Toolkit)”
```

---

### Final Notes

TJ workflow 的灵魂绝非仅仅是：

```text
“消灭界面上的线”
```

它真正的灵魂，是：

```text
赋予那些原本无法驾驭的超大规模 workflow
一套能够真正投入实战、经受生产力考验的架构系统
```

---

#截图 : 最终生产级工作流架构展示
