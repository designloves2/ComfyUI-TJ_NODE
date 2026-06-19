# __init__.py  — TJ_NODE v2.0.1 리팩토링 완료 버전

# ── 코어 API 라우트 등록 ──────────────────────────────────────────────────
from .core import tj_api

# ── Wireless ──────────────────────────────────────────────────────────────
from .nodes.wireless import TJ_SetNode, TJ_GetNode, TJ_MultiGetNode

# ── Etc ───────────────────────────────────────────────────────────────────
from .nodes.etc import (
    TJ_MultiRouter,
    TJ_SmartConverter,
    TJShortcutLauncher,
    TimeSegmentListNode,
)

# ── Image ─────────────────────────────────────────────────────────────────
from .nodes.image import (
    TJ_MultiImageLoader,
    DynamicImageBatch,
    TJ_SaveImage_Primary,
    TJ_SaveImage_Subsequent,
    DynamicImageBatchEclipse,
    TJ_SaveImage_EclipseSubsequent,
    TJ_BatchToMultiOutput,
    TJ_SaveAndPreviewImage,
)

# ── Utility ───────────────────────────────────────────────────────────────
from .nodes.utility import (
    TJ_PromptText,
    TJ_TextConcatenate,
    TJ_SmartShow,
    TJ_ShowAny,
    TJ_MultiModelSelecter,
    TJ_SaveTextFile,
    TJ_QueueLoop,
)
from .nodes.utility.go_stop_tj import TJ_GoStop

# ── Video ─────────────────────────────────────────────────────────────────
from .nodes.video import (
    TJ_SaveAndPreviewVideo,
    TJ_LTX2Sampler,
    WanSCAILExtendSampler,
)

# ── LLM ───────────────────────────────────────────────────────────────────
from .nodes.llm import (
    TJ_PromptEnhancer,
    TJ_ImageToPrompt,
    TJ_PromptShowLocker,
    TJ_PromptStudio,
    TJ_SceneMaker,
    TJ_OllamaLLMLoader,
    TJ_LLMContentQualityController,
)

# ── Generator ─────────────────────────────────────────────────────────────
from .nodes.generator import TJ_ZImageTurbo, TJ_Flux2Klein, TJ_ZITControlNet


# ──────────────────────────────── Node Mappings ───────────────────────────
NODE_CLASS_MAPPINGS = {
    # Wireless
    "TJ_SetNode":       TJ_SetNode,
    "TJ_GetNode":       TJ_GetNode,
    "TJ_MultiGetNode":  TJ_MultiGetNode,

    # Etc
    "TJ_MultiRouter":       TJ_MultiRouter,
    "TJ_SmartConverter":    TJ_SmartConverter,
    "TJShortcutLauncher":   TJShortcutLauncher,
    "TimeSegmentListNode":  TimeSegmentListNode,

    # Image
    "TJ_MultiImageLoader":              TJ_MultiImageLoader,
    "DynamicImageBatch":                DynamicImageBatch,
    "TJ_SaveImage_Primary":             TJ_SaveImage_Primary,
    "TJ_SaveImage_Subsequent":          TJ_SaveImage_Subsequent,
    "DynamicImageBatchEclipse":         DynamicImageBatchEclipse,
    "TJ_SaveImage_EclipseSubsequent":   TJ_SaveImage_EclipseSubsequent,
    "TJ_BatchToMultiOutput":            TJ_BatchToMultiOutput,
    "TJ_SaveAndPreviewImage":           TJ_SaveAndPreviewImage,

    # Utility
    "TJ_PromptText":        TJ_PromptText,
    "TJ_TextConcatenate":   TJ_TextConcatenate,
    "TJ_SmartShow":         TJ_SmartShow,
    "TJ_ShowAny":           TJ_ShowAny,
    "TJ_MultiModelSelecter": TJ_MultiModelSelecter,
    "TJ_SaveTextFile":     TJ_SaveTextFile,
    "TJ_QueueLoop":       TJ_QueueLoop,
    "TJ_GoStop":         TJ_GoStop,

    # Video
    "TJ_SaveAndPreviewVideo":   TJ_SaveAndPreviewVideo,
    "TJ_LTX2Sampler":           TJ_LTX2Sampler,
    "WanSCAILExtendSampler":     WanSCAILExtendSampler,

    # LLM
    "TJ_PromptEnhancer":    TJ_PromptEnhancer,
    "TJ_ImageToPrompt":     TJ_ImageToPrompt,
    "TJ_PromptShowLocker":  TJ_PromptShowLocker,
    "TJ_PromptStudio":      TJ_PromptStudio,
    "TJ_SceneMaker":        TJ_SceneMaker,
    "TJ_OllamaLLMLoader":   TJ_OllamaLLMLoader,
    "TJ_LLMContentQualityController": TJ_LLMContentQualityController,

    # Generator
    "TJ_ZImageTurbo":   TJ_ZImageTurbo,
    "TJ_Flux2Klein":   TJ_Flux2Klein,
    "TJ_ZITControlNet": TJ_ZITControlNet,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    # Wireless
    "TJ_SetNode":       "Set Node (TJ)",
    "TJ_GetNode":       "Get Node (TJ)",
    "TJ_MultiGetNode":  "Multi Get Node (TJ)",

    # Etc
    "TJ_MultiRouter":       "Multi Router(TJ)",
    "TJ_SmartConverter":    "Smart Converter (TJ)",
    "TJShortcutLauncher":   "Shortcut Launcher (TJ)",
    "TimeSegmentListNode":  "Time Segment List (TJ)",

    # Image
    "TJ_MultiImageLoader":              "Multi Image Loader (TJ)",
    "DynamicImageBatch":                "Dynamic Image Batch(TJ)",
    "TJ_SaveImage_Primary":             "Save Image(Primary-TJ)",
    "TJ_SaveImage_Subsequent":          "Save Image(Suffix-TJ)",
    "DynamicImageBatchEclipse":         "Dynamic Image Batch(Eclipse-TJ)",
    "TJ_SaveImage_EclipseSubsequent":   "Save Image(Eclipse Suffix-TJ)",
    "TJ_BatchToMultiOutput":            "Batch to Multi Image Output(TJ)",
    "TJ_SaveAndPreviewImage":           "Save & Preview Image (TJ)",

    # Utility
    "TJ_PromptText":        "Prompt Text (TJ)",
    "TJ_TextConcatenate":   "Text Concatenate (TJ)",
    "TJ_SmartShow":         "Smart show (TJ)",
    "TJ_ShowAny":           "Show Any (TJ)",
    "TJ_MultiModelSelecter": "Multi Model Selecter (TJ)",
    "TJ_SaveTextFile":     "Save Text File (TJ)",
    "TJ_QueueLoop":       "Queue Loop (TJ)",
    "TJ_GoStop":         "Go & Stop (TJ)",

    # Video
    "TJ_SaveAndPreviewVideo":   "Save & Preview Video (TJ)",
    "TJ_LTX2Sampler":           "LTX2. TJ Sampler",
    "WanSCAILExtendSampler":     "Wan SCAIL Extend Sampler (TJ)",

    # LLM
    "TJ_PromptEnhancer":    "Prompt Enhancer (TJ)",
    "TJ_ImageToPrompt":     "Image to Prompt (TJ)",
    "TJ_PromptShowLocker":  "Prompt Show & Locker (TJ)",
    "TJ_PromptStudio":      "Prompt Studio (TJ)",
    "TJ_SceneMaker":        "Scene Maker (TJ)",
    "TJ_OllamaLLMLoader":   "Ollama LLM Loader (TJ)",
    "TJ_LLMContentQualityController": "LLM Content Quality Controller (TJ)",

    # Generator
    "TJ_ZImageTurbo":   "Z-Image Turbo (TJ)",
    "TJ_Flux2Klein":   "Flux2 Klein 4B/9B (TJ)",
    "TJ_ZITControlNet": "ZIT ControlNet (TJ)",
}

WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
