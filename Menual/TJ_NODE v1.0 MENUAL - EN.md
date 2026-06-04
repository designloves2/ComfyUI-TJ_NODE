---

# TJ_NODE v1.0 Official English Manual

## Chapter 01 — Wireless Routing System

---

### Introduction to Wireless Routing System

The core of TJ_NODE is the:

```text
Wireless Workflow Architecture
```

In standard ComfyUI, the structure is:

```text
Node ↔ Node
```

connected directly via visible wires.

This is not an issue for small workflows, but as the scale grows, it causes problems such as:

* Long wires
* Overlapping connection lines
* Routing clutter
* Difficulty in understanding the structure
* Increased difficulty in maintenance

To solve this, TJ_NODE uses the:

```text
TJ Fake-Wire System
```

---

#Screenshot : Standard workflow vs TJ workflow comparison

---

### TJ Fake-Wire Structure

The TJ Fake-Wire structure is:

```text
Physical connections maintained
+
Visual connections hidden
```

In other words:

```text
Logical connection
=
Maintained

Visual clutter
=
Minimized
```

---

#### Standard Method Example

```text
Load Image
 └────────────────────────────→ KSampler
```

---

#### TJ Method Example

```text
Load Image
 → Set Node

KSampler
 ← Get Node
```

The actual internal connection remains intact.

This system removes long wires from the workflow screen to create:

* An easy-to-read structure
* A modular architecture
* A maintainable workflow

---

#Screenshot : Fake-wire hover state
#Screenshot : Hidden wire structure

---

### Realtime Wires View Mode

Realtime Wires View Mode is a feature that:

```text
Shows fake-wires only on hover
```

---

#### Purpose

The purpose of this feature is:

```text
Keep it clean normally,
check connections only when needed
```

---

#### How to Enable

Right-click menu:

```text
TJ Node
 → Realtime Wires View Mode
```

---

#### How it Works

| State | Description |
| - | - |
| OFF | Does not show hidden wires |
| ON | Shows hidden wires on hover |

---

#### Recommended Usage

In TJ_NODE workflows, we recommend the following state:

```text
Realtime Wires View Mode = ON
Show ALL Wires = OFF
```

This structure provides the best workflow readability.

---

#Screenshot : Realtime Hover Wire

---

### Show ALL Wires

Show ALL Wires is a mode that:

```text
Forcefully displays all fake-wires
```

---

#### Purpose of Use

Recommended situations to use this:

* Provider tracking
* Wireless debugging
* Connection inspection
* Workflow analysis

---

#### Precautions

In large-scale workflows:

```text
Wire clutter may increase again
```

It is recommended to keep this OFF during general workflow operations.

---

#Screenshot : Show ALL Wires ON state

---

### Embedded Get System

One of the core philosophies of TJ_NODE is:

```text
Minimize the overuse of Standalone Get Nodes
```

To achieve this, many TJ nodes include a built-in:

```text
get_name
```

widget.

This means:

```text
Wireless receiving directly inside the node
```

is possible.

---

#### Supported Nodes

Nodes currently supporting Embedded Get:

* Save & Preview Image (TJ)
* Save & Preview Video (TJ)
* Smart Show (TJ)
* Prompt Text (TJ)
* Batch to Multi Image Output (TJ)

---

#### Advantages

Advantages of the Embedded Get structure:

| Advantage | Description |
| - | - |
| Reduced node count | Eliminates repetitive Get Nodes |
| Simplified workflow | Removes long routing |
| Improved readability | Strengthens modular structure |
| Better maintainability | Local receive is possible |

---

#Screenshot : Embedded get widget
#Screenshot : Embedded get connection

---

### Wireless Lifecycle System

TJ_NODE is not just a simple connection system.

Internally, there is a:

```text
Wireless Lifecycle Management
```

system.

---

#### Role

This system manages:

* Provider registration
* Reconnects
* Cleanups
* Reload restores
* Fake-wire sync

---

#### Why is this important?

In large workflows, situations such as:

* Node duplication
* Workflow reloads
* Provider renaming
* Node deletion

occur very frequently.

A simple wireless structure easily breaks during these processes.

TJ_NODE is designed to automatically recover from this as much as possible.

---

#Screenshot : Provider reconnect
#Screenshot : Reload-safe restore

---

## Node System Composition

TJ_NODE is mainly composed of the following structures:

### 1. Wireless Routing System

The core structural system.

Included Nodes:

* Set Node (TJ)
* Get Node (TJ)
* Multi Get Node (TJ)
* Multi Router (TJ)

### 2. Batch Workflow System

Mass image/batch processing structure.

Included Nodes:

* Multi Image Loader (TJ)
* Dynamic Image Batch(TJ)
* Dynamic Image Batch(Eclipse-TJ)
* Batch to Multi Image Output(TJ)

### 3. Preview / Utility System

Preview and debugging system.

Included Nodes:

* Save & Preview Image (TJ)
* Save & Preview Video (TJ)
* Smart Show (TJ)
* Prompt Text (TJ)
* Text Concatenate (TJ)

### 4. Save Pipeline System

Save structure system.

Included Nodes:

* Save Image(Primary-TJ)
* Save Image(Suffix-TJ)
* Save Image(Eclipse Suffix-TJ)

---

## Node System Detailed Explanations

---

### 1. Set Node (TJ)

#### Wireless Provider Creation Node

---

#### Purpose

The Set Node is used to:

```text
Register data as a wireless provider
```

Simply put, it acts as a:

```text
Broadcasting station within the workflow
```

---

#Screenshot : Set Node basic structure

---

#### How to Use

#### Step 1 — Connect Input

First, connect the source data.

Supported examples:

* IMAGE
* LATENT
* STRING
* MODEL
* CONDITIONING
* CLIP
* VAE

Supports most types.

---

#Screenshot : IMAGE input connection

---

#### Step 2 — Set setnode_name

Next, set the:

```text
setnode_name
```

Examples:

```text
MAIN_CHARACTER
UPSCALE_IMAGE
MASTER_PROMPT
```

---

#### Recommended Naming Convention

Recommended format:

```text
SECTION_PURPOSE
```

Examples:

```text
INPUT_MAIN_IMAGE
UPSCALE_FINAL_IMAGE
PROMPT_CHARACTER_MAIN
```

---

#### Not Recommended

We advise avoiding meaningless names like:

```text
test
aaa
123
```

This makes maintenance difficult in large-scale workflows.

---

#Screenshot : setnode_name examples

---

#### Step 3 — Receive downstream

Now, other nodes can receive wirelessly using:

* Get Node
* Embedded Get
* MultiGet

---

#Screenshot : Downstream receive example

---

#### Internal Behavior of Set Node

Internally, the Set Node is registered in the:

```text
Provider Registry
```

This means the entire workflow shares a:

```text
List of currently active providers
```

The Get list is automatically generated from here.

---

#### Precautions

#### Duplicate Name Issue

If multiple nodes have the same:

```text
setnode_name
```

it can cause:

* Unexpected receives
* Tangled reconnects
* Provider overwrites

---

#### Recommended Approach

Always use:

```text
Unique and meaningful provider names
```

---

### 2. Get Node (TJ)

#### Wireless Receive Node

---

#### Purpose

The Get Node is used to:

```text
Receive the wireless provider of a Set Node
```

Simply put, it acts as a:

```text
Wireless receiver
```

---

#Screenshot : Get Node overview

---

#### How to Use

#### Step 1 — Place Get Node

Place the Get Node near the location where the data will be used.

The core purpose of this structure is:

```text
Removing long visible wires
```

---

#Screenshot : Local receive example

---

#### Step 2 — Select get_name

Select a provider from the dropdown.

Examples:

```text
MAIN_CHARACTER
UPSCALE_IMAGE
MASTER_PROMPT
```

---

#### Eclipse Compatibility Display

Eclipse SetNode providers are displayed as:

```text
Eclipse / PROVIDER_NAME
```

Example:

```text
Eclipse / MAIN_IMAGE
```

---

#Screenshot : get_name dropdown

---

#### Step 3 — Use output

The Get Node output:

```text
Behaves identically to the original data
```

Meaning it can be used downstream just like a standard connection.

---

#Screenshot : Sampler connection example

---

#### Hover Wire Visualization

When hovering over a Get Node or slot:

```text
The fake-wire path is displayed
```

Through this, you can:

* Check the source provider
* Check the routing direction
* Analyze the workflow structure

---

#Screenshot : Hover wire route

---

#### Common Issues

#### Provider list not showing

Things to check:

* Does the provider exist?
* Has the workflow been reloaded?
* Was the Set Node deleted?

---

#### Solution

Right-click menu:

It is recommended to run:

```text
Refresh ALL Get Nodes
```

---

### 3. Multi Get Node (TJ)

#### Multi-Wireless Receive Node

---

#### Purpose

A node that receives multiple wireless providers simultaneously.

Particularly crucial for:

```text
Modularizing large-scale workflows
```

---

#Screenshot : MultiGet overview

---

#### Recommended Use Cases

Examples:

* Receiving multiple prompts
* Receiving multiple images
* Managing grouped providers
* Module receive structures

---

#### How to Use

#### Step 1 — Add Providers

Multiple providers can be registered.

Examples:

```text
MAIN_PROMPT
STYLE_PROMPT
LIGHTING_PROMPT
NEGATIVE_PROMPT
```

---

#Screenshot : Multiple provider slots

---

#### Step 2 — Use Reorder

Buttons:

| Button | Function |
| - | - |
| ↑ | Move Up |
| ↓ | Move Down |
| ✕ | Remove |

---

#### Purpose

To align the provider order with the:

```text
Logical order of the workflow
```

---

#Screenshot : Reorder UI

---

#### Compact Slot Structure

Deleted slots are automatically compacted.

Meaning it uses a structure that:

```text
Minimizes empty slots in the middle
```

---

#Screenshot : Compact slot behavior

---

#### Recommended Structure

Instead of using multiple Get Nodes, we recommend a:

```text
MultiGet-based module receive
```

structure.

It is highly effective for receiving:

* Prompt groups
* Model groups
* Image groups

---

### 4. Multi Router (TJ)

#### Wireless Branch Architecture Node

---

#### Purpose

The Multi Router is a core node for:

```text
Separating a workflow into a wireless branch structure
```

It is one of the central nodes in the TJ_NODE architecture.

---

#Screenshot : Multi Router overview

---

#### Core Role

The Multi Router performs:

* Branch separation
* Auto Set creation
* Provider structuring
* Workflow modularization

---

#### How to Use

#### Step 1 — Source Input

Examples of valid inputs:

* IMAGE
* LATENT
* CONDITIONING
* STRING

---

#Screenshot : Source input

---

#### Step 2 — Configure Output Branches

Separate the output branches by workflow section.

Examples:

```text
generation
upscale
preview
save
```

---

#Screenshot : Branch workflow

---

#### Step 3 — Enable Auto Set

When:

```text
Auto Set = ON
```

Each output automatically becomes a wireless provider.

---

#### Core Purpose of Auto Set

To create an:

```text
Auto provider branch creation
```

structure without long wires.

---

#Screenshot : Auto Set ON state

---

#### Recommended Workflow Structure

TJ workflows recommend the following structure:

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

Connecting each section via:

```text
Multi Router + wireless branches
```

is the most stable method.

---

#Screenshot : Modular workflow architecture

---

#### Eclipse Compatibility

TJ_NODE is compatible with the Eclipse SetNode.

The TJ Get system can directly use the:

```text
Eclipse SetNode OUTPUT endpoint
```

as a provider.

---

#### Display Format

In the Get list, it appears as:

```text
Eclipse / PROVIDER_NAME
```

---

#### Purpose

TJ_NODE is not meant to replace Eclipse.

Instead, it acts as an:

```text
Eclipse workflow bridge layer
```

Meaning you can run a mix of:

* Eclipse workflows
* TJ workflows

---

#Screenshot : Eclipse bridge workflow

---

### Recommended Operation for Wireless Routing System

We recommend the following for TJ workflows:

---

#### Recommended

```text
- Realtime Wires View Mode = ON
- Show ALL Wires = OFF
- Active use of Embedded Get
- Systematized provider naming
- Separating workflows into sections
```

---

#### Not Recommended

```text
- Duplicate provider names
- Meaningless provider names
- Maintaining long visible wires
- Overuse of standalone Get nodes
```

---

### Final Notes

The Wireless Routing System is the:

```text
Heart of TJ_NODE
```

The core philosophy of TJ_NODE workflows is not:

```text
"Removing wires"
```

The core is:

```text
"Making large-scale workflows maintainable"
```

---

#Screenshot : Final wireless workflow showcase

---

## Chapter 02 — Batch Workflow System

---

### Introduction to Batch Workflow System

The Batch Workflow System of TJ_NODE is not just a collection of simple batch processing nodes.

This system is:

```text
A system designed to structurally operate
large-scale image workflows
```

Standard batch workflows often cause the following issues:

* Image sequence tangling
* Loss of metadata
* Resolution mismatch
* Congestion in downstream branches
* Difficulty managing image groups
* Save path sync issues

To solve these, TJ_NODE provides:

* Multi Image Loader
* Dynamic Batch
* Batch Split
* Eclipse Metadata Sync

---

#Screenshot : Batch Workflow Overall Structure

---

### 1. Multi Image Loader (TJ)

#### The Core Input Hub of TJ_NODE

The Multi Image Loader acts as the:

```text
Starting point of a TJ workflow
```

It doesn't merely load images.

In reality, it simultaneously acts as an:

* Image stack manager
* Batch generator
* Resolution manager
* Provider source
* Metadata sync system

---

#Screenshot : Multi Image Loader basic state

---

#### Key Roles

The Multi Image Loader performs:

| Function | Description |
| - | - |
| Image Load | Multiple image input |
| Image Stack | Internal list management |
| Thumbnail Preview | Previewing images |
| Reorder | Drag-to-sort |
| Batch Generation | IMAGE batch tensor output |
| Resize | Standardize resolutions |
| Metadata Preservation | Maintain original info |
| Auto Set | Generate WIDTH/HEIGHT/BATCH providers |

---

#### When to use it?

Recommended situations:

* Dataset batch processing
* Variation workflows
* Upscale batches
* VAE Encode batches
* ControlNet image groups
* Style transfer batches
* Image compare workflows

---

#Screenshot : Mass batch workflow example

---

#### A. Adding Images

Supported methods:

| Method | Description |
| - | - |
| File Select | Local files |
| Drag & Drop | Direct drag |
| URL Download | Download external images |

---

#Screenshot : Add Image button
#Screenshot : Drag & drop state

---

#### B. URL Download Feature

Allows external URL input.

Example:

```text
https://example.com/image.jpg
```

---

#### Purpose

Recommended for:

* Reference images
* External datasets
* Remote workflow assets

---

#### Precautions

Some sites may cause downloads to fail due to:

* Hotlink blocking
* CORS restrictions

---

#Screenshot : URL download example

---

#### C. Image Stack System

Images are managed internally as an:

```text
Image Stack
```

Meaning it’s not just an array, but also manages:

* Preview state
* Order
* Metadata
* Resize state

---

#### D. Thumbnail Grid

Added images are displayed as a:

```text
Thumbnail grid
```

Purpose:

* Quick structural check
* Batch state check
* Improved reorder intuitiveness

---

#Screenshot : Thumbnail grid

---

#### E. Drag Reorder Feature

Images can be reordered by dragging.

---

#### Why is this important?

In batch workflows, the:

```text
Order itself is data
```

in many cases.

Examples:

* Animation sequences
* Prompt sync
* Frame processing
* Paired datasets

---

#Screenshot : Drag reorder state

---

#### Recommended Usage

It is recommended to maintain a sorting rule.

Example:

```text
001_input
002_input
003_input
```

---

#### F. Resize System

#### Core Purpose

In batch workflows, a:

```text
Resolution mismatch
```

is a very common issue.

The Multi Image Loader includes a resize system to fix this.

---

#### Supported Modes

| Mode | Description |
| - | - |
| none | Keep original |
| long edge | Based on the longest side |
| short edge | Based on the shortest side |
| custom | Manual input |
| megapixel | Calculated based on MP |

---

#Screenshot : Resize settings

---

#### Long Edge Mode

Resize based on the longest side.

Example:

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

#### Recommended Usage

Recommended for:

* SDXL workflows
* Image generation normalization
* Upscale pipelines

---

#### Short Edge Mode

Resize based on the shortest side.

Recommended for:

* Portrait datasets
* Vertical image consistency

---

#### Megapixel Mode

Auto-calculate based on MP.

Examples:

```text
1MP
2MP
4MP
```

---

#### Advantages

Normalize based on the:

```text
Target pixel count
```

without manually calculating width/height.

---

#### G. Scale Method

#### Center Crop

Maintain ratio and crop from the center.

---

#### Recommended Use Cases

* Portrait datasets
* Subject-focused images
* Fashion workflows

---

#### Force Fit

Force fit to aspect ratio.

---

#### Recommended Use Cases

* Textures
* Tiles
* Exact resolution workflows

---

#### Precautions

Force Fit can cause:

```text
Ratio distortion
```

Center Crop is recommended for images of people.

---

#Screenshot : Center Crop vs Force Fit comparison

---

#### H. Output Descriptions

#### BATCH

Outputs an IMAGE batch tensor.

---

#### Usage Example

```text
Multi Image Loader
 → VAE Encode
 → KSampler
 → Save Preview
```

---

#### WIDTH / HEIGHT

Outputs the resolution based on the current batch.

---

#### Why is this important?

In TJ workflows:

```text
Resolution is also used as routing data
```

---

#### Recommended Usage

* Auto Set providers
* Upscale sync
* Save pipelines
* Latent sizing

---

#Screenshot : WIDTH/HEIGHT routing

---

#### I. Auto Set Feature

The Multi Image Loader can automatically create:

```text
BATCH
WIDTH
HEIGHT
```

wireless providers.

---

#### How to Use

```text
Auto Set = ON
```

---

#### Internal Behavior

Automatically generates:

```text
TJ / BATCH
TJ / WIDTH
TJ / HEIGHT
```

providers.

---

#### Advantages

* Removes long wires
* Simplifies downstream routing
* Modularizes batch structures

---

#Screenshot : Auto Set provider list

---

#### Recommended Structure

We recommend the following structure:

```text
Multi Image Loader
 ↓
Multi Router
 ↓
Wireless Sections
```

---

#Screenshot : Recommended structure

---

### 2. Dynamic Image Batch (TJ)

#### Purpose

A node that combines multiple images into a:

```text
Dynamic batch structure
```

---

#### Core Roles

* Image grouping
* Dynamic batching
* Scalable processing
* Workflow distribution

---

#### Recommended Use Cases

Examples:

* Image variations
* Multi-prompt generation
* Grouped upscaling
* Iterative processing

---

#Screenshot : Dynamic Image Batch overview

---

#### Internal Structure

This node does not create a:

```text
Fixed batch
```

but instead:

```text
Creates batches dynamically
```

Meaning depending on the workflow state, the:

* Batch size
* Image groups
* Downstream branches

may vary.

---

#### Why is this important?

In large-scale workflows:

```text
The batch itself is often dynamic data
```

---

### 3. Dynamic Image Batch(Eclipse-TJ)

#### Eclipse Compatibility Batch System

A batch system compatible with Eclipse workflow structures.

---

#### Core Features

This node keeps the:

```text
IMAGE + FILES pair
```

together.

Meaning it simultaneously maintains the:

* Image tensor
* Original file metadata
* Original path

---

#### Why is this important?

Standard batch systems often suffer from:

```text
Loss of original file information
```

This is extremely important in Eclipse workflows.

---

#### Supported Features

| Feature | Description |
| - | - |
| Maintain Metadata | Keep original info |
| Bypass Filtering | Maintain file sync |
| Original Path | Keep original paths |
| Eclipse Save Sync | Link save structures |

---

#Screenshot : Eclipse batch flow

---

#### Recommended Use Cases

Recommended workflows:

* Large dataset workflows
* Eclipse save pipelines
* Metadata-dependent workflows
* File-tracking workflows

---

### 4. Batch to Multi Image Output (TJ)

#### Batch Split System

A node that splits an IMAGE batch into:

```text
Up to 64 independent IMAGE outputs
```

---

#### Core Purpose

To split a batch workflow into:

```text
Individual downstream branches
```

---

#Screenshot : Batch Split overview

---

#### How to Use

#### Step 1 — Input IMAGE Batch

Connect the:

```text
IMAGE batch
```

---

#### Step 2 — Use Output

Each image is separated into an:

```text
Independent IMAGE output
```

---

#### Recommended Use Cases

Examples:

* Selective upscaling
* Compare workflows
* Image ranking
* Branch processing
* Multi-save pipelines

---

#Screenshot : Split branch example

---

#### Embedded Get Support

Batch to Multi Image Output supports:

```text
Embedded Get
```

Meaning direct wireless receiving is possible.

---

#Screenshot : Embedded get in batch output

---

### Recommended Batch Workflow Structure

We recommend the following structure in TJ workflows:

---

#### Recommended Structure

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

#### Advantages

This structure is highly advantageous for:

* Batch management
* Routing structuring
* Save pipeline separation
* Workflow maintenance

---

### Common Issues

#### Image order tangling

Causes:

* Missing reorder
* Batch overwrite
* Duplicated workflows

---

#### Solution

Recommendation:

```text
Save workflow after drag reorder
```

---

#### Resolution Mismatch

Causes:

* Mixed resolutions
* Resize OFF
* Force Fit mismatch

---

#### Solution

Recommendation:

```text
Long edge normalize
```

---

#### Metadata Loss

Causes:

* Using standard batch
* Not using Eclipse metadata

---

#### Solution

Recommendation:

Use:

```text
Dynamic Image Batch(Eclipse-TJ)
```

---

### Final Notes

The Batch Workflow System is the:

```text
Input and distribution structure of TJ workflows
```

The core of TJ_NODE isn't just basic batch processing, but:

```text
Structuring large-scale workflows
into a maintainable form
```

---

#Screenshot : Final Batch Workflow showcase

---

## Chapter 03 — Preview / Utility System

---

### Introduction to Preview / Utility System

The Preview / Utility System in TJ_NODE is not just a collection of simple preview nodes.

This system is a:

```text
Visualization and debugging system designed
to keep large-scale workflows in an operational state
```

Standard workflows frequently encounter the following issues:

* Overusing preview nodes to check results
* Long preview wires
* Difficult fullscreen inspections
* Difficult batch comparisons
* Loss of previews after reloading
* Unstable video previews
* Audio sync issues

To solve these, TJ_NODE provides:

* Smart Preview
* Snapshot Preview
* Reload Restore
* Embedded Get
* Fullscreen Viewer
* HTML5 Video Player
* Audio Controller

---

#Screenshot : Preview System Overall Structure

---

### 1. Save & Preview Image (TJ)

#### Unified Image Preview System

Save & Preview Image is the flagship preview system of TJ_NODE.

It is not just a preview node.

It integrates:

* Image preview
* Fullscreen viewer
* Batch grid
* Keyboard navigation
* Snapshot preview
* Save pipeline
* Embedded Get

into a single structure.

---

#Screenshot : Save & Preview Image basic state

---

#### Main Purpose

In standard workflows, you had to separately configure:

```text
Preview Image
+
Save Image
+
Fullscreen Viewer
+
Compare Viewer
```

TJ_NODE unifies these into a single workflow node.

---

#### Supported Features

| Feature | Description |
| - | - |
| IMAGE preview | Single/Batch display |
| Fullscreen | Zoomed view |
| Smart Grid | Batch grid layout |
| Keyboard Control | Arrow keys / ESC |
| Snapshot | Preview copy |
| Embedded Get | Wireless receive |
| Save System | Save images |
| Reload Restore | Restore previews |

---

#### Basic Usage

#### Step 1 — Connect IMAGE Input

Connect an IMAGE or IMAGE batch to the:

```text
image
```

slot.

---

#Screenshot : Image input connection

---

#### Supported Inputs

| Input Type | Description |
| - | - |
| IMAGE | Single image |
| IMAGE batch | Multiple images |

---

#### Auto Detection

The node automatically determines between:

```text
single image
or
batch grid
```

modes.

---

#### Step 2 — Execute Queue

When the workflow is executed:

* Preview generation
* Grid generation
* Snapshot metadata save

are performed automatically.

---

#Screenshot : Preview generation state

---

#### Step 3 — Inspect Image

Click the image to enter fullscreen preview.

---

#Screenshot : Fullscreen viewer

---

#### Smart Grid System

#### Purpose

To display batch previews in an:

```text
Easy-to-read structure
```

---

#### Features

The Smart Grid uses:

* Dynamic layout
* Fit-center
* 2px spacing
* Stable rendering

---

#Screenshot : Smart grid layout

---

#### Why is this important?

Standard batch previews often suffer from:

* Image overlapping
* Broken resizing
* Collapsed aspect ratios

The TJ grid system is designed to minimize these issues.

---

#### Relationship between Node Resize and Preview

Save & Preview Image does not:

```text
Force change node.size upon execution
```

Instead, it:

* Provides an initial preview area
* Displays fit-center
* Retains user resizing

---

#### Advantages

| Advantage | Description |
| - | - |
| Retain User Layout | Protects resizing |
| Workflow Stability | Minimizes positional shifts |
| Preview Stability | Maintains grid |

---

#Screenshot : Fit-center preview

---

#### Fullscreen Viewer

#### Purpose

A feature to inspect resulting images at:

```text
Actual quality levels
```

---

#### How to Enter

Methods:

* Click image
* Keyboard F / f

---

#Screenshot : Fullscreen mode

---

#### Key Features

| Feature | Description |
| - | - |
| Zoom View | Based on original size |
| Batch Navigation | Previous/Next |
| ESC Close | Close fullscreen |
| Reload Persist | Preview restore |

---

#### Keyboard Controls

| Key | Function |
| - | - |
| F / f | Fullscreen |
| ESC | Close |
| ← | Previous image |
| → | Next image |

---

#### Important Feature

Even in Fullscreen mode, the:

```text
Preview lifecycle
```

is maintained.

Meaning it can restore the last state even after:

* Reloading
* Moving tabs
* Saving workflow

---

#Screenshot : Fullscreen restore

---

#### Snapshot Preview System

#### Core Concept

TJ preview copies are not:

```text
Live mirrors
```

Instead, it uses a:

```text
Preserve current preview snapshot
```

structure.

---

#### Why is this important?

Intermediate workflow results can be maintained as:

* Comparisons
* Records
* Checkpoints

---

#### Example

```text
Copy Save Preview
 ↓
Keep current result snapshot
 ↓
Original workflow continues updating
```

---

#Screenshot : Snapshot preview copy

---

#### Advantages

| Advantage | Description |
| - | - |
| Result Compare | Keeps previous results |
| Checkpoints | Preserves intermediate states |
| Debugging | Step-by-step analysis |

---

#### Embedded Get Support

Save & Preview Image supports Embedded Get.

Meaning it can directly receive wireless providers using:

```text
get_name
```

---

#### Recommended Structure

```text
Multi Router
 ↓
Wireless Provider
 ↓
Save & Preview Image
```

---

#### Advantages

* Removes long preview wires
* Simplifies workflow
* Structures preview modules

---

#Screenshot : Embedded get preview

---

#### Save System

#### filename_prefix

Sets the filename naming convention.

---

#### Supported Aliases

| Alias | Result |
| - | - |
| %date | YYYY-MM-DD |
| %time | HH-MM-SS |

---

#### Usage Example

```text
%date_%time_preview
```

Result:

```text
2026-06-04_14-22-11_preview
```

---

#### Precautions

The following are not recommended:

```text
%D
%T
```

Reason:

May conflict with default Python strftime tokens.

---

#### Duplicate Save Handling

If the same filename exists, it auto-increments:

```text
_001
_002
_003
```

---

#Screenshot : Save filename example

---

### 2. Save & Preview Video (TJ)

#### Unified Video Workflow System

Save & Preview Video is a node that integrates:

* Image batch playback
* Video decode
* Audio mux
* Preview restore
* Video save
* Audio only export

---

#Screenshot : Save & Preview Video overview

---

#### Core Purpose

In standard workflows, you had to separately configure:

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

TJ_NODE integrates this into one.

---

#### Supported Features

| Feature | Description |
| - | - |
| IMAGE batch playback | Frame preview |
| VIDEO decode | mp4 → frames |
| Audio mux | Audio merge |
| Audio Only | Audio only export |
| Embedded Get | Wireless receive |
| Preview Restore | Reload recovery |
| HTML5 Player | Browser playback |

---

#### Using IMAGE Batch Method

#### Basic Structure

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

#### How to Use

#### Step 1 — Connect IMAGE batch

Connect to the:

```text
image
```

input.

---

#### Recommended Sources

Recommended sources:

* AnimateDiff
* Frame Generators
* VFI
* Interpolation
* Dynamic Batch

---

#Screenshot : Image batch playback

---

#### Step 2 — Set fps

Set playback fps.

---

#### Recommended FPS

| Use Case | Recommended |
| - | - |
| Preview | 12~16 |
| Animation | 24 |
| Cinematic | 30 |

---

#### Step 3 — Execute Queue

Internally, the node automatically performs:

* Playback generation
* Preview frame generation
* Optional video rebuild

---

#Screenshot : Playback preview

---

#### Using VIDEO Decode Method

#### Purpose

A structure to convert existing mp4 files into an:

```text
IMAGE batch
```

---

#### Usage Flow

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

#Screenshot : Decode flow

---

#### Recommended Use Cases

Recommended for:

* Frame inspections
* VFI workflows
* Frame editing
* img2img animations

---

#### Important Feature

Decoded frames can be used downstream:

```text
Just like a standard IMAGE batch
```

---

#Screenshot : Decoded frame preview

---

#### Mutex System

Save & Preview Video prevents simultaneous connections of:

```text
image + video direct input
```

---

#### Why is this needed?

Simultaneous connections can cause:

* Ambiguous decode states
* Invalid playback states
* Reload mismatches

---

#### Internal Structure

The node operates based on the:

```text
Currently active source
```

---

#### Reload-Safe Behavior

Upon workflow reload, it automatically cleans up:

* Invalid mutexes
* Stale sources

as much as possible.

---

#### Audio System

#### Supported Inputs

| Input | Description |
| - | - |
| audio_a | Main audio |
| audio_b | Sub audio |

---

#Screenshot : Audio input

---

#### Audio Only Mode

If save_type is:

```text
audio only
```

A dedicated audio controller UI is displayed.

---

#### Features

* HTML5 audio player
* Dynamic controller count
* Synchronized playback

---

#### Controller Creation Rules

| Input State | Display |
| - | - |
| A only | 1 controller |
| B only | 1 controller |
| A+B | 2 controllers |

---

#Screenshot : Dual audio controller

---

#### original_audio Output

During video decode, the:

```text
Original video audio
```

is maintained in AUDIO dict format.

---

#### Purpose

Recommended usage:

* Remuxing
* Audio preservation
* Keeping the original soundtrack

---

#### Preview Restore System

Save & Preview Video supports:

```text
reload-safe preview restore
```

---

#### Maintained Items

* Preview state
* Playback state
* Snapshot
* Decoded preview

---

#### Purpose

To preserve the:

```text
Last preview state
```

even after changing tabs or reloading.

---

#Screenshot : Reload restore

---

### 3. Smart Show (TJ)

#### Universal Debug Viewer

Smart Show is the flagship debug viewer of TJ_NODE.

---

#### Purpose

A node designed for:

```text
Automatic analysis and preview
```

of various data types.

---

#### Supported Types

| Type | Description |
| - | - |
| IMAGE | Image |
| STRING | Text |
| FLOAT | Number |
| INT | Integer |
| JSON | Structured data |
| LIST | Lists |
| VIDEO | Video |
| AUDIO | Audio |

---

#Screenshot : Smart Show overview

---

#### Automatic Type Switching

Depending on the input type, it automatically switches to:

* Image viewer
* Text viewer
* Media player
* Numeric viewer

---

#Screenshot : Automatic type switching

---

#### Edit Mode

Edit Mode defaults to:

```text
OFF
```

---

#### Why is this important?

To prevent:

```text
Accidentally overwriting workflow values
```

---

#### Recommended Usage

* Debugging
* Comparing
* Text inspection
* Metadata inspection

---

### 4. Prompt Text (TJ)

#### Prompt Management Node

A node for structuring prompts.

---

#### Recommended Usage

* Character prompts
* Style prompts
* Reusable prompt blocks
* Lighting prompts

---

#### Embedded Get Support

Prompt Text supports Embedded Get.

Meaning you can build a:

```text
Modular prompt architecture
```

without long text wires.

---

#Screenshot : Prompt routing

---

### 5. Text Concatenate (TJ)

#### Dynamic Text Combine Node

A node that combines multiple texts.

---

#### Features

* Dynamic inputs
* Custom delimiters
* Scalable combining

---

#Screenshot : Concatenate example

---

#### Embedded Get Not Supported

This node intentionally:

```text
Does not support Embedded Get
```

---

#### Reason

Because a dynamic input structure conflicts with:

```text
Stable wireless routing
```

---

#### Recommended Usage

Recommended combination example:

```text
Character prompt
+
Style prompt
+
Camera prompt
+
Lighting prompt
```

---

### 6. Recommended Structure for Preview / Utility System

TJ workflows recommend the following structure.

---

#### Recommended Workflow

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

#### Advantages

* Structured previews
* Simplified debugging
* Improved workflow readability
* Preserved snapshot checkpoints

---

### 7. Common Issues

#### Preview black screen

Check:

* Existence of IMAGE batch
* Whether decode frames were generated
* Browser autoplay restrictions

---

#### Cannot close fullscreen

Cause:

* Overlay pointer conflict
* Refresh overlay overlap

---

#### Solution

Using the latest TJ preview structure is recommended.

---

#### Preview restore fails

Check:

* Execution history
* Snapshot metadata
* Workflow save status

---

#### Audio playback fails

Check:

* Audio input connection
* Browser autoplay policies
* Muted state

---

### Final Notes

The Preview / Utility System is the:

```text
Visualization layer of TJ workflows
```

The core of TJ_NODE isn't just generating simple previews, but:

```text
Maintaining large-scale workflows
in an operational structure
```

---

#Screenshot : Final Preview Workflow showcase

---

## Chapter 04 — Save Pipeline System

---

### Introduction to Save Pipeline System

The Save Pipeline System in TJ_NODE is not just a collection of simple save nodes.

This system is designed to:

```text
Structurally save and manage the results
of large-scale workflows
```

In standard ComfyUI workflows, the following issues frequently occur:

* Duplicated save locations
* Difficulty organizing output files
* Difficulty saving upscale results separately
* Difficulty tracking relationships between original/post-processing
* Eclipse workflow path tracking issues
* Difficulty saving based on metadata

To solve these, TJ_NODE provides:

* Primary Save
* Suffix Save
* Eclipse Path Tracking
* Save Chain Architecture

---

#Screenshot : Save Pipeline Overall Structure

---

### Save Pipeline Architecture

The core of the TJ Save structure is:

```text
"Manage saving on a workflow level"
```

Meaning, instead of just:

```text
Saving an image
```

the goal is to:

```text
Keep the entire workflow output structure
in an organized form
```

---

#### Basic Structure

```text
Primary Save
 ↓
Suffix Save
 ↓
Final Result Groups
```

---

#### Why is this important?

In large-scale workflows:

* Originals
* Upscales
* Detail passes
* Masks
* Compares
* Variations

are continuously generated.

If saved randomly, it becomes:

```text
Impossible to manage the results
```

The TJ Save Pipeline is a system designed to structurally organize this.

---

#Screenshot : Organized save structure

---

### 1. Save Image (Primary-TJ)

#### Save Pipeline Base Node

Primary-TJ is the node that:

```text
Creates the base save location
```

It acts as the starting point of the TJ Save structure.

---

#Screenshot : Primary-TJ overview

---

#### Key Roles

Primary-TJ handles:

* Generating base save paths
* Saving based on workflow standards
* Providing the baseline for downstream suffixes
* Managing naming structures

---

#### Basic Usage

#### Step 1 — Connect IMAGE Input

Connect an IMAGE to the:

```text
image
```

slot.

---

#Screenshot : Primary image input

---

#### Step 2 — Configure filename_prefix

Example:

```text
project_main
```

Or:

```text
%date_%time_project
```

---

#### Supported Aliases

| Alias | Result |
| - | - |
| %date | YYYY-MM-DD |
| %time | HH-MM-SS |

---

#### Usage Example

```text
%date_%time_main
```

↓

```text
2026-06-04_14-35-22_main
```

---

#Screenshot : Filename example

---

#### Step 3 — Execute Queue

Upon execution:

* Generates save paths
* Saves metadata
* Generates downstream save contexts

are automatically performed.

---

#### Core Role of Primary Save

Primary-TJ is not a simple save node.

In reality, it functions closer to a:

```text
Save Context Provider
```

Meaning downstream nodes can share the:

* Save path
* Base filename
* Suffix chain

---

#Screenshot : Save chain context

---

#### Recommended Usage

Recommended structure:

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

#### Advantages

| Advantage | Description |
| - | - |
| Organize Results | Maintains same sets |
| Path Management | Preserves structures |
| Naming Consistency | Filename uniformity |
| Downstream Sync | Links subsequent saves |

---

### 2. Duplicate Save Handling System

If the same filename exists, the TJ Save system automatically increments:

```text
_001
_002
_003
```

---

#### Why is this important?

In mass generation workflows:

```text
Filename collision
```

happens very frequently.

The TJ Save system is designed to prevent overwrites as much as possible.

---

#### Example

Existing file:

```text
main.png
```

Already exists.

↓

Auto-saves as:

```text
main_001.png
```

---

#Screenshot : Collision handling

---

### 3. Save Image (Suffix-TJ)

#### Subsequent Save System

Suffix-TJ is a node that:

```text
Inherits the Primary save baseline
and saves subsequent results
```

---

#Screenshot : Suffix-TJ overview

---

#### Core Purpose

In large-scale workflows:

* Upscales
* Detail passes
* Color corrections
* Compare results

are continuously generated.

Suffix-TJ is a structure designed to keep them in the:

```text
Same result set
```

---

#### Basic Structure

```text
Primary-TJ
 ↓
Creates base path

Suffix-TJ
 ↓
Saves with appended suffix
```

---

#### Usage Examples

#### Original Save

```text
main.png
```

---

#### Upscale Result

```text
main_upscale.png
```

---

#### Detail Result

```text
main_detail.png
```

---

#Screenshot : Suffix save example

---

#### Step 1 — Connect IMAGE

Connect the subsequent result IMAGE.

---

#### Step 2 — Configure suffix

Examples:

```text
upscale
detail
mask
compare
```

---

#### Recommended Naming

Recommended method:

```text
Function-based suffixes
```

Examples:

```text
upscale_4x
detail_pass
mask_clean
```

---

#Screenshot : Suffix naming

---

#### Step 3 — Execute Save

Suffix-TJ automatically:

* References the Primary context
* Maintains the base filename
* Saves by appending the suffix

---

#### Advantages

| Advantage | Description |
| - | - |
| Grouping Results | Maintains related outputs |
| Naming Consistency | Organizes filenames |
| Save Chain Preservation | Tracks the workflow |

---

#### Why is this important?

In standard workflows, the problem of:

```text
Final results getting mixed together
```

frequently occurs.

The TJ Save structure solves this.

---

#Screenshot : Organized result folder

---

### 4. Save Image (Eclipse Suffix-TJ)

#### Eclipse Save Compatibility System

This node is a save system designed to:

```text
Preserve the Eclipse original file structure
```

---

#### Core Features

Standard save structures save based on the:

```text
Current workflow location
```

But in Eclipse workflows, saving based on the:

```text
Original file location
```

is important.

---

#### Key Features

| Feature | Description |
| - | - |
| Original Path Tracking | Retains original paths |
| Metadata Path Restore | Restores paths |
| Relative Save | Maintains relative paths |
| Suffix Append | Subsequent saves |

---

#Screenshot : Eclipse save pipeline

---

#### Internal Behavior

The node calculates the save location based on:

```text
IMAGE + Original file metadata
```

Meaning:

```text
It can save subsequent results while
maintaining the original file structure
```

---

#### Recommended Use Cases

Recommended workflows:

* Eclipse workflows
* Dataset processing
* Metadata-dependent pipelines
* Original path preserving workflows

---

### 5. Recommended Save Chain Workflow Structure

We recommend the following save structure in TJ workflows:

---

#### Recommended Structure

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

#### Advantages

* Organizes result structures
* Keeps the workflow trackable
* Easy comparisons
* Easy dataset management

---

#Screenshot : Recommended save chain

---

### 6. Recommended Save Structure Rules

#### Recommended Folder Structure

Recommendation:

```text
project/
 ├─ main
 ├─ upscale
 ├─ detail
 ├─ compare
 └─ mask
```

---

#### Recommended Filename Structure

Format recommendation:

```text
%date_%time_project
```

---

#### Why is this important?

In large-scale workflows:

```text
File organization itself is workflow management
```

---

### 7. Save Metadata System

The TJ Save structure internally maintains:

```text
Save context metadata
```

---

#### Purpose

So downstream nodes can share:

* Path
* Filename
* Suffix chain

---

#### Advantages

| Advantage | Description |
| - | - |
| Save Consistency | Uniform saving |
| Downstream Sync | Maintains links |
| Workflow Restore | Restores structures |

---

#Screenshot : Save metadata flow

---

### 8. Common Issues

#### Overwriting Output Files

Causes:

* Same filename
* Manual overwrite
* Duplicate save paths

---

#### Solution

Using TJ auto increment is recommended.

---

#### Tangled Save Locations

Causes:

* No Primary context
* Invalid save chain
* Loss of metadata

---

#### Solution

Recommended structure:

Maintain the order of `Primary → Suffix`.

---

#### Eclipse Path Restore Fails

Causes:

* Missing original metadata
* Using standard batch
* Not using Eclipse batch

---

#### Solution

Recommendation:

Use:

```text
Dynamic Image Batch(Eclipse-TJ)
```

---

#### Filename Anomalies

Aliases not recommended:

```text
%D
%T
```

---

#### Recommended Aliases

Recommend using:

```text
%date
%time
```

---

### 9. Recommended Operation for Save Pipeline System

We recommend the following approaches for the TJ Save structure:

---

#### Recommended

```text
- Create base with Primary
- Use Suffix for subsequent saves
- Manage results per workflow
- Function-based suffix naming
- Maintain metadata
```

---

#### Not Recommended

```text
- Using Save Image randomly
- Overwrite saving
- Subsequent saves without suffixes
- Ignoring original paths
```

---

### Final Notes

The Save Pipeline System is the:

```text
Output management layer of TJ workflows
```

The core of TJ_NODE is not just basic saving, but:

```text
Managing the results of large-scale workflows
in a structurally maintainable form
```

---

#Screenshot : Final Save Pipeline showcase

---

## Chapter 05 — Workflow Architecture & Real Production Guide

---

### Purpose of this Chapter

The previous chapters focused on:

* Node descriptions
* Feature descriptions
* System structures

But what truly matters is:

```text
"How to design and operate workflows in real production"
```

TJ_NODE is not a simple utility node pack.

TJ_NODE functions closely as a:

```text
Workflow Operating Layer
```

Meaning it is an architecture toolkit designed for:

* Workflow structuring
* Maintainability
* Modularization
* Scalability
* Debugging
* Output management

---

#Screenshot : Large-scale TJ workflow architecture

---

### TJ_NODE Workflow Philosophy

The core philosophy of TJ_NODE workflows is not about building:

```text
"A workflow that just works"
```

but rather building:

```text
"A maintainable workflow"
```

---

#### Problems with standard workflows

As the scale grows:

* Wire count increases
* Routing gets tangled
* Preview nodes proliferate
* Save structures break down
* Batch structures become chaotic
* Workflows become uneditable

---

#### TJ Workflow Goals

TJ_NODE solves these through its:

* Wireless Routing
* Modular Workflow
* Save Pipeline
* Preview Lifecycle
* Fake-Wire
* Embedded Get

structures.

---

#### Core Concept

In a TJ workflow, what matters is:

```text
"Dividing the workflow into sections"
```

---

#### Recommended Section Structure

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

#Screenshot : Section workflow structure

---

### 1. Recommended TJ Workflow Structure

#### INPUT SECTION

Role:

* Dataset input
* Generating image batches
* Maintaining metadata
* Normalizing resolution

Recommended Nodes:

* Multi Image Loader
* Dynamic Image Batch
* Dynamic Image Batch(Eclipse)

---

#Screenshot : INPUT SECTION

---

#### GENERATION SECTION

Role:

* Latent generation
* Prompt pipeline
* Sampler pipeline

Recommended Structure:

```text
Prompt
 ↓
KSampler
 ↓
Preview
```

---

#### Important Recommendation

In the Generation section, we recommend:

```text
Minimizing long visible wires
```

Meaning we recommend using:

* Set Node
* Multi Router
* Embedded Get

---

#Screenshot : Generation routing

---

#### EDIT SECTION

Role:

* img2img
* Detail passes
* Color correction
* Inpainting
* Variations

---

#### Recommended Structure

```text
Generation Result
 ↓
Multi Router
 ↓
Wireless Edit Branches
```

---

#### Advantages

* Separates branches
* Preserves edit workflow independence
* Simplifies compare structures

---

#Screenshot : Edit branches

---

#### UPSCALE SECTION

Role:

* Upscale
* Restoration
* Enhancement

Recommended Structure:

```text
Upscale
 ↓
Save Preview
 ↓
Suffix Save
```

---

#### Why is this important?

Because Upscale results must:

```text
Absolutely maintain their relationship with the original
```

---

#Screenshot : Upscale workflow

---

#### PREVIEW SECTION

Role:

* Image inspection
* Fullscreen inspection
* Comparisons
* Snapshots
* Video playback

Recommended Nodes:

* Save & Preview Image
* Smart Show
* Save & Preview Video

---

#Screenshot : Preview section

---

#### SAVE SECTION

Role:

* Organizing results
* Suffix saving
* Preserving metadata
* Preserving Eclipse paths

Recommended Structure:

```text
Primary Save
 ↓
Suffix Save Chain
```

---

#Screenshot : Save structure

---

### 2. Wireless Workflow Operating Methods

The core of TJ_NODE workflows is the:

```text
"Wireless section architecture"
```

---

#### Recommended Method

Recommend a structure where:

```text
Inside a Section
=
Short wires

Between Sections
=
Wireless
```

---

#### Why is this important?

In large-scale workflows:

```text
Long wires themselves become a maintenance issue
```

---

#### Recommended Example

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

#Screenshot : Wireless section workflow

---

### 3. Provider Naming Conventions

Provider naming is highly important.

Incorrect naming causes:

* Tangled reconnects
* Failure to understand the structure
* Duplication issues

---

#### Recommended Naming Structure

Recommendation:

```text
SECTION_PURPOSE
```

Examples:

```text
INPUT_MAIN_IMAGE
UPSCALE_FINAL_IMAGE
PROMPT_CHARACTER
SAVE_COMPARE_IMAGE
```

---

#### Not Recommended Naming

```text
test
aaa
123
temp
```

---

#### Why is this important?

As workflows grow:

```text
The provider names themselves act as a routing map
```

---

### 4. Embedded Get Operating Strategy

In TJ workflows, we recommend:

```text
Actively using Embedded Get
```

---

#### Recommended Reasons

| Advantage | Description |
| - | - |
| Fewer nodes | Reduces Get node overuse |
| Simplified structure | Local receiving |
| Improved readability | Cleans up the workflow |

---

#### Recommended Locations

Recommend using on:

* Preview Nodes
* Save Nodes
* Prompt Nodes
* Utility Nodes

---

#### Locations Not Recommended

Do not recommend on:

```text
Positions with heavily dynamic structures,
such as the middle of complex batch splits
```

---

#Screenshot : Embedded get architecture

---

### 5. Multi Router Operating Strategy

In TJ workflows, the:

```text
Multi Router
```

is one of the most important architectural nodes.

---

#### Core Roles

* Branch separation of workflows
* Section modularization
* Auto Set provider creation
* Structuring downstream operations

---

#### Recommended Structure

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

#### Advantages

* Branch independence
* Structural readability
* Improved maintainability

---

#Screenshot : Multi Router workflow

---

### 6. Preview Operating Strategy

The TJ preview system is not just for displaying outputs.

In reality, it acts more like a:

```text
Workflow inspection system
```

---

#### Recommended Usage

Instead of:

```text
Overusing Save Preview for every intermediate result
```

We recommend using:

```text
Preview checkpoints per section
```

---

#### Recommended Locations

Recommend:

* Final generation
* Final upscale
* Compare branches
* Final saves

---

#Screenshot : Preview checkpoints

---

#### Snapshot Strategy

We recommend using the TJ snapshot system as a:

```text
Checkpoint for comparing results
```

---

#### Example

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

#Screenshot : Snapshot compare

---

### 7. Save Pipeline Operating Strategy

The TJ Save structure was designed to:

```text
Maintain the result structures of the workflow
```

---

#### Recommended Structure

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

#### Advantages

* Result grouping
* Trackable workflows
* Easy dataset organization

---

#### Structure Not Recommended

```text
Using Save Image randomly
```

---

#### Why is this not recommended?

Tracking the relationship between results becomes virtually impossible.

---

#Screenshot : Organized save chain

---

### 8. Eclipse Workflow Operating Strategy

TJ_NODE can be used mixed together with Eclipse workflows.

---

#### Core Structure

```text
Eclipse SetNode
 ↓
TJ Get
 ↓
TJ Workflow
```

---

#### Recommended Usage

Recommended for:

* Dataset workflows
* Metadata workflows
* File-tracking workflows

---

#### Important Feature

TJ_NODE is not an:

```text
Eclipse replacement
```

Instead, it acts as a:

```text
Eclipse bridge layer
```

---

#Screenshot : Eclipse bridge workflow

---

### 9. Large Scale Workflow Strategies

#### The Most Important Rule

```text
"Divide the workflow into sections"
```

---

#### Recommended Structure

```text
INPUT
GENERATION
EDIT
UPSCALE
PREVIEW
SAVE
```

---

#### Reason

This structure is strongest for:

* Maintainability
* Readability
* Debugging
* Reusability

---

#### Recommended Rules

| Rule | Reason |
| - | - |
| Minimize long wires | Readability |
| Use wireless sections | Modularity |
| Naming provider rules | Debugging |
| Maintain Save chains | Result tracking |
| Use preview checkpoints | Comparing |

---

#Screenshot : Recommended large workflow

---

### 10. TJ Workflow Debug Strategies

#### Recommended Debug Sequence

#### Phase 1

Check provider connections using:

```text
Show ALL Wires
```

---

#### Phase 2

Inspect data types using:

```text
Smart Show
```

---

#### Phase 3

Do a step-by-step comparison using:

```text
Save Preview Snapshot
```

---

#### Phase 4

Refresh providers using:

```text
Refresh ALL Get Nodes
```

---

#### Recommended Debug Nodes

Recommend using:

* Smart Show
* Save Preview
* Multi Router

---

#Screenshot : Debug workflow

---

### 11. Reload-Safe Workflow Strategies

TJ_NODE emphasizes reload-safe structures in its design.

---

#### Recommended Approaches

```text
- Maintain provider names
- Maintain Auto Set structures
- Maintain save chains
- Save the workflow frequently
```

---

#### Not Recommended

```text
- Renaming providers randomly
- Overusing duplicate providers
- Unstable dynamic branches
```

---

#### Why is this important?

In large-scale workflows:

```text
Reload stability
=
Workflow survivability
```

---

### 12. Recommended TJ_NODE Operation Philosophy

TJ_NODE workflows do not aim for:

```text
"A workflow that merely works"
```

---

#### TJ_NODE Goals

The goals of TJ_NODE are:

```text
- Maintainable workflows
- Scalable workflows
- Easy-to-read workflows
- Recoverable workflows
```

---

#### The Most Important Concept

The core of TJ workflows is:

```text
"Workflow Architecture"
```

---

### Final Notes

TJ_NODE is not a simple utility node pack.

TJ_NODE is a:

```text
Large Scale Workflow Architecture Toolkit
```

The core of TJ_NODE is not:

```text
Removing wires
```

but:

```text
Building large-scale workflows into
structures that are actually operational
```

---

#Screenshot : Final TJ workflow showcase

---

## Chapter 06 — Troubleshooting & Internal Systems

---

### Purpose of this Chapter

The previous chapters centered on:

* Node descriptions
* Workflow structures
* Operation methods

However, in actual large-scale workflows, it is crucial to have the:

```text
"Ability to understand why problems occur
and how to recover from them"
```

Because TJ_NODE is not a simple utility node pack but a:

```text
Workflow architecture layer
```

understanding its internal systems is important, such as:

* Fake-wires
* Embedded Get
* Provider registries
* Preview lifecycles
* Reload-safe restores

---

#Screenshot : TJ internal system overview

---

### 1. Fake-Wire Internal System

The TJ Fake-Wire structure is:

```text
Physical connections maintained
+
Visual connections minimized
```

---

#### Core Purpose

To keep the workflow in a:

```text
Readable state
```

---

#### Internal Structure

TJ Fake-Wire does not actually remove the:

```text
LiteGraph connections
```

Instead, it uses a structure of:

* Connection visibility control
* Transparent rendering
* Hover rendering
* Debug rendering

---

#### Why is this important?

Because:

```text
Logical connections are maintained
```

operations like:

* Execution
* Save
* Reload
* Restore

work normally.

---

#Screenshot : Fake-wire render structure

---

### 2. Realtime Wire Hover System

Realtime Wires View Mode is a system that:

```text
Shows wires only on hover
```

---

#### Purpose

Normally maintain a:

```text
Clean workflow
```

state.

When needed, it allows for:

```text
Temporary connection inspections
```

---

#### Recommended Settings

In general TJ workflows, we recommend the state:

```text
Realtime Wires View Mode = ON
Show ALL Wires = OFF
```

---

#### Why is this important?

This structure provides the best balance of:

* Readability
* Debugging
* Clutter reduction

---

#Screenshot : Hover wire example

---

### 3. Show ALL Wires System

Show ALL Wires is a mode that:

```text
Forcefully shows all hidden wires
```

---

#### Recommended Use Cases

Recommended for:

* Provider tracing
* Wireless debugging
* Connection verification
* Routing inspections

---

#### Precautions

In large-scale workflows, this can cause a:

```text
Spike in wire clutter
```

Recommended to keep OFF during normal operations.

---

#Screenshot : Show ALL Wires enabled

---

### 4. Provider Registry System

The core of the TJ wireless structure is the:

```text
Provider Registry
```

---

#### Role

A system that manages active providers by:

* Registering
* Managing
* Reconnecting
* Cleaning up

---

#### Information Managed Internally

| Information | Description |
| - | - |
| Provider Name | setnode_name |
| Source Node | Set provider |
| Type | IMAGE / STRING etc. |
| Connection State | Status of the connection |

---

#### Why is this important?

The Get list is actually generated:

```text
Based on the Provider Registry
```

---

#Screenshot : Provider registry flow

---

### 5. Embedded Get Internal Logic

Embedded Get internally uses a:

```text
Wireless receive widget
```

structure.

---

#### Internal Operations

Embedded Get performs:

1. Querying the provider registry
2. Verifying types
3. Removing invalid providers
4. Handling reconnects

---

#### Important Feature

TJ_NODE runs both:

```text
Get Nodes
and
Embedded Get
```

on the same wireless lifecycle.

Structurally, they are the exact same system.

---

#### Why is this important?

Thanks to this structure, it maintains:

* Provider sync
* Reload-safe reconnects
* Fake-wire consistency

---

#Screenshot : Embedded get lifecycle

---

### 6. Refresh ALL Get Nodes

#### The Most Important Recovery Feature

The right-click menu:

```text
Refresh ALL Get Nodes
```

is an extremely important repair tool.

---

#### Role

Performs the following tasks:

* Provider rescan
* Invalid provider cleanup
* Dropdown rebuild
* Reconnect refresh

---

#### When to use this?

Recommended situations:

| Situation | Description |
| - | - |
| Provider Rename | After changing names |
| Workflow Reload | After reloading |
| Eclipse Sync Issue | Provider mismatch |
| Get List Anomaly | Tangled lists |

---

#### Recommended Habit

In large workflows, we recommend running:

```text
Refresh after altering provider structures
```

---

#Screenshot : Refresh ALL Get Nodes

---

### 7. Wireless Reconnect System

TJ_NODE is heavily designed around a:

```text
Reload-safe reconnect
```

structure.

---

#### Role

After a workflow reload, it automatically performs:

* Provider reconnects
* Fake-wire rebuilds
* Embedded Get reconnects

---

#### Why is this important?

In large-scale workflows:

```text
Reload stability
=
Workflow survivability
```

---

#### Recommended Structure

Recommend using:

```text
Stable provider naming
```

---

#### Not Recommended Structure

```text
Random provider renaming
Duplicate providers
```

---

#Screenshot : Reconnect restore

---

### 8. Preview Lifecycle System

The TJ preview system is not a simple image viewer.

It acts closer to a:

```text
Preview lifecycle architecture
```

---

#### Managed States

| State | Description |
| - | - |
| preview image | Current preview |
| snapshot | Copied preview |
| fullscreen state | Zoomed state |
| grid state | Batch grid |
| restore metadata | Reload restore |

---

#### Why is this important?

Standard previews frequently suffer from:

```text
Loss of preview upon reload
```

The TJ preview is designed to minimize this.

---

#Screenshot : Preview lifecycle

---

### 9. Snapshot Preview System

The TJ preview copy is not a:

```text
Live mirror
```

Instead, it is a:

```text
Detach snapshot
```

structure.

---

#### Purpose

Recommended for:

* Comparisons
* Checkpoints
* Preserving results

---

#### Advantages

| Advantage | Description |
| - | - |
| Enables Comparisons | Preserves previous results |
| Workflow Records | Results per stage |
| Easy Debugging | Tracks issues |

---

#Screenshot : Snapshot compare

---

### 10. Video Preview Internal System

Save & Preview Video operates on an:

```text
HTML5 video architecture
```

base.

---

#### Internal Features

Manages:

* Playback
* Audio sync
* Frame previews
* Decode restores
* Video snapshots

---

#### Important Feature

The results of a video decode can be used downstream as an:

```text
IMAGE batch
```

---

#### Why is this important?

Meaning you can process a:

```text
Video workflow
=
Image workflow
```

---

#Screenshot : Video internal flow

---

### 11. Mutex Protection System

Save & Preview Video prevents simultaneous connection of:

```text
image + video direct input
```

---

#### Reason

Simultaneous connections could cause:

* Ambiguous states
* Invalid decodes
* Playback mismatches

---

#### Reload-Safe Purpose

Designed to allow:

```text
Stale source cleanups
```

even after reloading.

---

#Screenshot : Mutex protection

---

### 12. Save Lifecycle System

The TJ Save structure manages the:

```text
Save context lifecycle
```

---

#### Managed Items

| Item | Description |
| - | - |
| Base path | Base save location |
| Suffix chain | Subsequent saves |
| Metadata | Save information |
| Collision handling | Handling duplicates |

---

#### Purpose

To structurally maintain the:

```text
Workflow results
```

---

#Screenshot : Save lifecycle

---

### 13. Collision Handling System

If the same filename exists, it auto-increments:

```text
_001
_002
_003
```

---

#### Why is this important?

In mass generations, an:

```text
Overwrite accident
```

is very common.

TJ Saves prevent this as much as possible.

---

#Screenshot : Collision example

---

### 14. Common Issues

#### Get node isn't connecting

Check:

* Whether provider exists
* Duplicate providers
* Workflow reload state

---

#### Solution

Recommendation:

Run:

```text
Refresh ALL Get Nodes
```

---

#### Provider list doesn't appear

Causes:

* Set Node deleted
* Invalid provider
* Stale registry

---

#### Solution

* Verify provider
* Reconnect
* Save workflow and reload

---

#### Preview Black Screen

Check:

* Existence of IMAGE batch
* Whether decode frames generated
* Browser autoplay policies

---

#### Cannot close fullscreen

Cause:

```text
Overlay pointer conflict
```

---

#### Solution

Recommend using the latest TJ preview structure.

---

#### Video Playback fails

Check:

* fps settings
* Muted state
* Autoplay restrictions

---

#### Audio Controller doesn't appear

Check for input connections to:

* audio_a
* audio_b

---

#### Save Path tangled

Causes:

* Missing Primary context
* Invalid save chain

---

#### Solution

Recommendation:

Maintain the structure:

```text
Primary → Suffix
```

---

### 15. Workflow Repair Guide

#### Recommended Recovery Sequence

#### Phase 1

Check connections using:

```text
Show ALL Wires
```

---

#### Phase 2

Inspect data using:

```text
Smart Show
```

---

#### Phase 3

Execute:

```text
Refresh ALL Get Nodes
```

---

#### Phase 4

Save workflow and reload.

---

#### Recommended Debug Nodes

Recommend:

* Smart Show
* Save Preview
* Multi Router

---

#Screenshot : Debug workflow

---

### 16. Reload-Safe Workflow Design Strategies

We recommend the following structures in TJ workflows.

---

#### Recommended

```text
- Stable provider naming
- Maintain Auto Set
- Maintain section architecture
- Maintain save chains
```

---

#### Not Recommended

```text
- Duplicate providers
- Random renaming
- Unstable branches
- Giant visible wires
```

---

#### Why is this important?

In large-scale workflows:

```text
Reload-safe structures
=
Workflow maintainability
```

---

### 17. Recommended Best Practices

Recommended operation methods for TJ workflows.

---

#### Recommended

| Recommendation | Reason |
| - | - |
| Use Embedded Get | Simplifies workflows |
| Structured Multi Router | Section separation |
| Preview Checkpoints | Comparisons |
| Maintain Save Chains | Organize results |
| Set naming rules for providers | Debugging |

---

#### Recommended Preview Strategy

```text
Overusing intermediate previews
❌

Section checkpoint previews
⭕
```

---

#### Recommended Save Strategy

Maintain the structure:

```text
Primary Save
 ↓
Suffix Chain
```

---

### 18. Anti-Patterns

#### Absolutely Not Recommended Structures

---

#### Duplicate Provider

```text
MAIN_IMAGE
MAIN_IMAGE
MAIN_IMAGE
```

---

#### Giant Visible Wire

A long visible wire crossing the entire workflow.

---

#### Random Naming

```text
aaa
test
temp
```

---

#### Save Image Overuse

Random saving without a Save structure.

---

#### Dynamic Chaos Workflow

Giant workflows with no branch structures.

---

#### Why are these dangerous?

These structures create states where:

* Debugging is difficult
* Reconnects are unstable
* Saving becomes chaotic
* Maintenance is impossible

---

#Screenshot : Anti-pattern workflow

---

### Final Notes

TJ_NODE is not a simple utility node pack.

TJ_NODE is a:

```text
Workflow Architecture Toolkit
```

The core of TJ_NODE is not:

```text
Removing wires
```

but:

```text
Maintaining large-scale workflows
in a truly operational state
```

---

#Screenshot : Final architecture showcase

---

## Chapter 07 — HTML5 UI System & Advanced Features

---

### Purpose of this Chapter

One of the biggest features of TJ_NODE is that it is an:

```text
"HTML5-based UI system that goes beyond
simple LiteGraph nodes"
```

Many TJ nodes internally use:

* HTML5 overlays
* Custom DOMs
* Dynamic UIs
* Interactive previews
* Realtime controls
* Custom players

In other words, TJ_NODE is not a simple:

```text
ComfyUI utility node
```

but rather acts as a:

```text
Workflow Interface Layer
```

---

#Screenshot : TJ HTML5 UI overview

---

### 1. HTML5 Overlay System

TJ_NODE doesn't handle many of its features through just:

```text
Canvas draw
```

Instead, it actively utilizes an:

```text
HTML5 DOM Overlay
```

system.

---

#### Why is this important?

The default LiteGraph UI has issues with:

* Limited interaction
* Limited previews
* Limited media controls

TJ_NODE expands this through:

* DOM overlays
* Interactive UIs
* Custom controls

---

#### Utilized Features

| Feature | Description |
| - | - |
| HTML5 video | Video playback |
| HTML5 audio | Audio player |
| DOM overlay | Custom UIs |
| Fullscreen preview | Image inspection |
| Dynamic controller | Runtime UIs |

---

#Screenshot : Overlay UI structure

---

### 2. Smart Preview Overlay System

The TJ Preview system is not just simple image drawing.

In reality, it is an:

```text
Overlay-driven preview architecture
```

---

#### Managed Elements

| Element | Description |
| - | - |
| Image layer | Preview |
| Overlay layer | Buttons |
| Fullscreen layer | Fullscreen UI |
| Interaction layer | Mouse/Keyboard |

---

#### Why is this important?

Thanks to this structure, features like:

* Fullscreen
* Preview restores
* Snapshots
* Keyboard controls

become possible.

---

#Screenshot : Preview overlay layers

---

### 3. Save & Preview Image HTML5 Features

Save & Preview Image is the node that utilizes the TJ HTML5 structure the most actively.

---

#### Included Features

| Feature | Description |
| - | - |
| Fullscreen overlay | Zoom views |
| Grid layout | Batch grid |
| Refresh overlay | Preview refresh |
| Keyboard navigation | Arrow key movement |
| Fit-center | Center alignment |
| Snapshot restore | Maintain previews |

---

#Screenshot : Save Preview HTML5 UI

---

### 4. Fullscreen Overlay System

#### Purpose

A system to inspect images at:

```text
Actual detail levels
```

---

#### Key Features

| Feature | Description |
| - | - |
| Fullscreen preview | Full screen |
| Zoom inspect | Zoom inspection |
| Batch navigation | Previous/Next |
| ESC close | Close fullscreen |

---

#### How to Enter

Methods:

* Click image
* F/f key

---

#### How to Close

| Method | Description |
| - | - |
| ESC | Close |
| X button | Close |
| Background click | Close |

---

#Screenshot : Fullscreen viewer

---

#### Important Fixes

In the past, TJ previews had a pointer conflict issue between the:

```text
refresh overlay
```

and the:

```text
close button
```

The current structure resolves this via:

```text
Overlay pointer layer separation
```

---

#### Why is this important?

This issue caused phenomena where:

```text
Fullscreen wouldn't close
```

Currently, it uses a structure with:

* Independent X buttons
* Separated refresh overlays
* Eliminated pointer conflicts

---

#Screenshot : Overlay pointer separation

---

### 5. Keyboard Control System

TJ previews support keyboard navigation.

---

#### Supported Keys

| Key | Function |
| - | - |
| F/f | Fullscreen |
| ESC | Close fullscreen |
| ← | Previous image |
| → | Next image |

---

#### Purpose

To:

```text
Minimize mouse movement
```

during mass batch inspections.

---

#### Recommended Usage

Recommended workflows:

* Image compares
* Batch inspections
* Detail pass compares

---

#Screenshot : Keyboard navigation

---

### 6. Smart Grid System

The TJ preview grid is not a simple tile draw.

In reality, it is a:

```text
Dynamic responsive preview grid
```

structure.

---

#### Features

| Feature | Description |
| - | - |
| 2px spacing | Clean separation |
| Fit-center | Center alignment |
| Aspect retain | Maintains aspect ratios |
| Resize-safe | Stable layouts |

---

#### Why is this important?

Standard grids frequently suffer from:

* Broken ratios
* Overlapping images
* Resize artifacts

The TJ grid is designed to minimize this.

---

#Screenshot : Smart grid example

---

### 7. Node Resize Strategy

TJ previews minimize:

```text
Force changing node.size during execution
```

---

#### Current Structure

Upon node creation, it secures a:

```text
Default preview area
```

and then utilizes a:

* Fit-center
* Preserve user resize

structure.

---

#### Why is this important?

Automatic resizing causes issues like:

* Workflow layout collapses
* Broken user positioning
* Preview jumps

---

#### Current Recommended Structure

```text
Provide initial preview area
+
Retain user resizing
```

---

#Screenshot : Resize-safe preview

---

### 8. Preview Restore System

TJ previews support a:

```text
Reload-safe restore
```

structure.

---

#### States Maintained

| State | Description |
| - | - |
| Preview image | Last result |
| Grid state | Batch state |
| Fullscreen state | Fullscreen view |
| Snapshot | Detached preview |

---

#### Why is this important?

With standard previews, suffering from:

```text
Loss of results after reload
```

is very common.

TJ previews are designed to minimize this.

---

#Screenshot : Preview restore

---

### 9. Snapshot Detach System

A TJ preview copy is not a:

```text
Live mirror
```

Instead, it is a:

```text
Detached snapshot
```

structure.

---

#### Why is this important?

Copied previews can be used for:

* Comparisons
* Checkpoints
* Workflow records

---

#### Example

```text
Base Result Snapshot
 ↓
Detail Pass Snapshot
 ↓
Compare
```

---

#Screenshot : Snapshot compare workflow

---

### 10. Save & Preview Video HTML5 System

Save & Preview Video is the most complex node among TJ HTML5 structures.

---

#### Supported Features

| Feature | Description |
| - | - |
| HTML5 video player | Playback |
| Audio controller | Audio control |
| Dual audio UI | A/B playback |
| Decode preview | Frame inspection |
| Playback restore | Reload restore |

---

#Screenshot : Video HTML5 UI

---

### 11. Video Playback System

#### IMAGE Batch Playback

Structure:

```text
IMAGE batch
 ↓
HTML5 playback
```

---

#### Purpose

Recommended for:

* AnimateDiff
* VFI
* Interpolation
* Frame inspection

---

#### Important Feature

Playback is not just a simple preview, it is an:

```text
Interactive playback layer
```

---

#Screenshot : Image batch playback

---

### 12. Video Decode System

When inputting a VIDEO, it automatically performs:

```text
video
 ↓
frame decode
 ↓
IMAGE batch
```

---

#### Advantages

Decode results can be used downstream just like a:

```text
Standard IMAGE workflow
```

---

#### Recommended Usage

Recommend for:

* Frame edits
* img2img animations
* Frame upscales
* VFI

---

#Screenshot : Decode workflow

---

### 13. Audio Controller System

TJ video uses a:

```text
Dynamic audio controller
```

structure.

---

#### Controller Creation Rules

| Input State | Controller |
| - | - |
| audio_a | 1 |
| audio_b | 1 |
| audio_a+b | 2 |

---

#### Purpose

To create:

```text
Only the necessary UIs
```

depending on the workflow state.

---

#Screenshot : Dual audio controller

---

### 14. Audio Only Mode

If save_type is:

```text
audio only
```

Dedicated audio mode UI is enabled.

---

#### Recommended Usage

Recommend for:

* Soundtrack exports
* Audio debugging
* Remux inspections

---

#Screenshot : Audio only mode

---

### 15. HTML5 Interaction Safety

TJ HTML5 UI places high importance on a:

```text
Pointer safety
```

design.

---

#### Main Monitored Targets

| Target | Description |
| - | - |
| Overlay pointer | Click handling |
| Fullscreen layer | Interactions |
| Refresh layer | Preview control |
| Drag event | Prevent workflow conflicts |

---

#### Why is this important?

If HTML5 overlays are poorly designed, it causes issues like:

* Missed clicks
* Drag conflicts
* Stuck fullscreens

TJ_NODE is designed to minimize these.

---

#Screenshot : Pointer safety structure

---

### 16. Realtime UI Performance Strategy

The TJ preview system emphasizes:

```text
Realtime UI performance
```

in its design.

---

#### Recommended Structure

| Recommendation | Reason |
| - | - |
| Checkpoint previews | Reduces rendering |
| Section previews | Simplifies structures |
| Snapshot compares | Reduces reloads |

---

#### Not Recommended

```text
Overusing previews across the entire workflow
```

---

#### Why is this important?

Mass HTML5 previews can cause:

* Browser memory spikes
* Overlay overload
* Interaction lag

---

### 17. TJ HTML5 UI Philosophy

The HTML5 structure of TJ_NODE is not simply for decoration.

The objective is to:

```text
Make the workflow an interface that can actually be operated
```

---

#### Core Philosophy

TJ_NODE was designed in the direction of:

```text
Building a production workflow UI layer
inside ComfyUI
```

---

### Final Notes

The TJ HTML5 UI System is the:

```text
Interaction layer of TJ workflows
```

The core of TJ_NODE is not just generating simple previews, but:

```text
Maintaining large-scale workflows
in a usable state
```

---

#Screenshot : Final HTML5 UI showcase

---

## Chapter 08 — Real Workflow Examples & Production Pipelines

---

### Purpose of this Chapter

The previous chapters focused on:

* Node features
* System structures
* Internal architectures

But what truly matters is:

```text
"How do we construct workflows in reality?"
```

In this chapter, we explain based on actual workflows:

* Real production workflows
* Recommended architectures
* Section structures
* Routing strategies
* Save strategies
* Debugging strategies

---

#Screenshot : TJ production workflow overview

---

### Basic Philosophy of TJ Workflows

The core of TJ workflows is not making:

```text
"One giant workflow"
```

The core is:

```text
"Connecting small workflow sections
wirelessly"
```

---

#### Recommended Structure

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

#### Why is this important?

This structure is strongest for:

* Readability
* Debugging
* Reload-safety
* Maintenance

---

#Screenshot : Section workflow architecture

---

### 1. Basic Image Generation Workflow

#### Purpose

The most basic example for:

```text
text → image generation
```

workflows.

---

#### Recommended Structure

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

#### Workflow Description

| Stage | Role |
| - | - |
| Prompt Text | Structure prompts |
| Concatenate | Combine prompts |
| KSampler | Generate |
| Save Preview | Check results |
| Primary Save | Base save |

---

#Screenshot : Basic generation workflow

---

#### Recommended Reason

This structure is great for maintaining:

* Prompt modularity
* Preview checkpoints
* Save consistency

---

### 2. Wireless Generation Workflow

#### Purpose

A structure to remove long visible wires.

---

#### Recommended Structure

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

#### Advantages

| Advantage | Description |
| - | - |
| Workflow Simplification | Removes long wires |
| Improved Readability | Clear structures |
| Section Modularity | Improves maintenance |

---

#Screenshot : Wireless generation workflow

---

### 3. Multi Image Dataset Workflow

#### Purpose

Mass dataset processing workflow.

---

#### Recommended Structure

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

#### Recommended Usage

Recommended situations:

* Fashion datasets
* Pose datasets
* img2img batches
* Upscale datasets

---

#### Important Point

In dataset workflows:

```text
Resolution normalization
```

is extremely important.

---

#### Recommended Settings

| Item | Recommendation |
| - | - |
| resize mode | long edge |
| scale mode | center crop |
| Maintain metadata | Eclipse batch |

---

#Screenshot : Dataset workflow

---

### 4. Large Scale Prompt Architecture

#### Purpose

A workflow for managing complex prompts in a:

```text
Modular structure
```

---

#### Recommended Structure

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

#### Advantages

* Prompt reusability
* Section management
* Easier compare workflows

---

#### Recommended Naming

```text
PROMPT_CHARACTER
PROMPT_STYLE
PROMPT_LIGHTING
```

---

#Screenshot : Modular prompt architecture

---

### 5. Multi Router Production Workflow

#### Purpose

A structure to separate a workflow into:

```text
Production branches
```

---

#### Recommended Structure

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

#### Why is this important?

This structure is highly resilient for:

* Branch independence
* Workflow readability
* Simplified debugging

---

#Screenshot : Production router workflow

---

### 6. Preview Checkpoint Workflow

#### Purpose

A structure to manage intermediate results as:

```text
Checkpoints
```

---

#### Recommended Approach

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

#### Advantages

| Advantage | Description |
| - | - |
| Result Comparisons | Retains previous results |
| Debugging | Step-by-step checks |
| Checkpoints | Workflow records |

---

#Screenshot : Checkpoint workflow

---

### 7. Upscale Production Workflow

#### Purpose

A structure for maintaining upscale results:

```text
Linked with the original
```

---

#### Recommended Structure

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

#### Advantages

* Maintains relationships between results
* Easy to compare
* Easy to organize datasets

---

#### Recommended Suffixes

| Suffix | Purpose |
| - | - |
| upscale | Upscale |
| detail | Detail pass |
| compare | For comparisons |
| mask | Mask |

---

#Screenshot : Upscale save chain

---

### 8. Animation Workflow

#### Purpose

An animation workflow based on IMAGE batches.

---

#### Recommended Structure

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

#### Recommended Usage

Recommend for:

* AnimateDiff
* Interpolation
* VFI
* Frame comparisons

---

#### Recommended FPS

| Purpose | Recommendation |
| - | - |
| Preview | 12~16 |
| Standard | 24 |
| Cinematic | 30 |

---

#Screenshot : Animation workflow

---

### 9. Video Decode Workflow

#### Purpose

Converting existing mp4 files to an:

```text
IMAGE batch workflow
```

---

#### Recommended Structure

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

#### Recommended Usage

Recommend for:

* Frame upscales
* img2img animations
* VFI
* Frame repair

---

#Screenshot : Video decode workflow

---

### 10. Compare Workflow

#### Purpose

A structure for comparing multiple results:

```text
Simultaneously
```

---

#### Recommended Structure

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

#### Recommended Nodes

Recommend using:

* Save & Preview Image
* Smart Show

---

#Screenshot : Compare workflow

---

### 11. Eclipse Compatible Workflow

#### Purpose

Mixing Eclipse workflows with TJ workflows.

---

#### Recommended Structure

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

#### Important Feature

TJ_NODE is not an:

```text
Eclipse replacement
```

Instead, it acts as a:

```text
Workflow bridge layer
```

---

#### Recommended Usage

Recommend for:

* Dataset workflows
* Metadata workflows
* Original path preserving workflows

---

#Screenshot : Eclipse bridge workflow

---

### 12. Large Scale Workflow Strategies

#### The Most Important Rule

```text
Divide workflows into sections
```

---

#### Recommended Sections

```text
INPUT
GENERATION
EDIT
UPSCALE
PREVIEW
SAVE
```

---

#### Recommended Structure

```text
Inside Section
=
Short wires

Between Sections
=
Wireless
```

---

#### Advantages

Improves:

* Readability
* Reload-safety
* Maintenance
* Debugging

---

#Screenshot : Large workflow example

---

### 13. Recommended Best Practices

Recommended operating methods for TJ workflows.

---

#### Recommended

| Recommendation | Reason |
| - | - |
| Use Embedded Get | Reduces node count |
| Structure Multi Router | Manages branches |
| Preview Checkpoints | For comparisons |
| Maintain Save Chains | Track results |
| Standardize provider naming | Debugging |

---

#### Recommended Preview Strategy

Recommend using a:

```text
Section checkpoint preview
```

structure.

---

#### Recommended Save Strategy

Maintain the:

```text
Primary
 ↓
Suffix Chain
```

structure.

---

### 14. Anti-Pattern Workflows

#### Giant Workflows

A structure not recommended:

```text
A giant workflow where all nodes are
connected by a single continuous line of wires
```

---

#### Issues

* Total loss of readability
* Difficult debugging
* Unstable reconnects
* Save chaos

---

#### Duplicate Provider Chaos

Duplicate providers like:

```text
MAIN_IMAGE
MAIN_IMAGE
MAIN_IMAGE
```

---

#### Save Chaos

Structures that use:

```text
Random Save Images
```

without suffixes.

---

#### Why is this dangerous?

It makes tracking the relationship between results virtually impossible.

---

#Screenshot : Anti-pattern workflow

---

### 15. TJ Workflow Production Philosophy

The goal of a TJ workflow is not:

```text
"A workflow that just works"
```

---

#### Core Goals

The core of a TJ workflow is:

```text
- A maintainable workflow
- A recoverable workflow
- A scalable workflow
- An easy-to-read workflow
```

---

#### The Most Important Concept

TJ_NODE is a:

```text
Workflow Architecture Toolkit
```

---

### Final Notes

The core of a TJ workflow is not:

```text
Removing wires
```

The true core is:

```text
Making large-scale workflows
into structures that can actually be operated
```

---

#Screenshot : Final production workflow showcase
