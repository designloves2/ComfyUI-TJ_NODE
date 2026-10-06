# nodes/reflib/nodes.py
# Canvas nodes of the reference asset library (plain widgets, no screens needed):
#   TJ_RefAssetRegister - copy IMAGE / AUDIO / VIDEO into the library, output asset ids
#   TJ_RefProjectSave   - make a project from asset ids (+ aliases)
#   TJ_H3Reference      - project / asset slots + prompt -> match check -> MiniMax H3 reference
#                         conditioning in one node (wraps the core MiniMaxH3ReferenceToVideo)

import io
import json
import os
import re
import tempfile

import soundfile
import torch.nn.functional as F

import node_helpers
from comfy_extras.nodes_minimax_h3 import MiniMaxH3ImageToVideo, MiniMaxH3ReferenceToVideo

from . import library as lib
from . import media
from .encode_cache import CachedVAE
from .resolve import ALWAYS_FATAL, entry_kind, fingerprint, resolve

MAX_SLOTS = 15
CATEGORY = " ✨ TJ_Node/Reference"

_CORE = {i.id: i for i in MiniMaxH3ReferenceToVideo.define_schema().inputs}
_CORE_I2V = {i.id: i for i in MiniMaxH3ImageToVideo.define_schema().inputs}


def _core_int(name, core=None):
    i = (core or _CORE)[name]
    return ("INT", {"default": i.default, "min": i.min, "max": i.max, "step": i.step, "tooltip": i.tooltip})


def _asset_choices(kind=None):
    try:
        order = {c: i for i, c in enumerate(lib.CATEGORIES)}
        assets = sorted(lib.list_assets(kind=kind, limit=2000), key=lambda a: (order.get(a["category"], 99), a["name"].lower()))
        return ["(none)"] + [lib.asset_label(a) for a in assets]
    except Exception:
        return ["(none)"]


def _project_choices():
    try:
        return ["(none)"] + [lib.project_label(p) for p in lib.list_projects()]
    except Exception:
        return ["(none)"]


def _audio_bytes(audio):
    wave = audio["waveform"][0].cpu().numpy().T
    buf = io.BytesIO()
    soundfile.write(buf, wave, int(audio["sample_rate"]), format="FLAC")
    return buf.getvalue()


def _video_bytes(video):
    fd, path = tempfile.mkstemp(suffix=".mp4")
    os.close(fd)
    try:
        video.save_to(path)
        with open(path, "rb") as f:
            return f.read()
    finally:
        os.remove(path)


class TJ_RefAssetRegister:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "category": (list(lib.CATEGORIES), {"default": "character"}),
                "name": ("STRING", {"default": "asset"}),
            },
            "optional": {
                "image": ("IMAGE", {"tooltip": "Every frame of the batch is copied into the library as its own asset."}),
                "audio": ("AUDIO",),
                "video": ("VIDEO",),
                "as_set": ("BOOLEAN", {"default": False,
                                       "tooltip": "Images only: group the image batch into one set (same subject, several angles)."}),
                "set_mode": (["video", "images"], {"default": "video",
                             "tooltip": "Only for as_set: the set is sent either packed as one reference video or as separate pictures."}),
                "subcategory": ("STRING", {"default": "", "tooltip": "One level under the category (becomes a folder)."}),
                "alias": ("STRING", {"default": "", "tooltip": "Optional short name for prompts (@alias). Used by the items output for Project Save."}),
                "tags": ("STRING", {"default": "", "tooltip": "Comma separated words; the Asset Browser search also looks at them."}),
                "prev_items": ("*", {
                                          "tooltip": "items output of another Register node; chain them so one Project Save gets every asset."}),
                "mp": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 64.0, "step": 0.1,
                                 "tooltip": "Default size limit (megapixels, down only) used whenever this asset is attached. 0 = untouched."}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("asset_ids", "items")
    OUTPUT_NODE = True
    FUNCTION = "run"
    CATEGORY = CATEGORY

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")  # registering is idempotent; always run so the result box is filled

    def run(self, category, name, image=None, audio=None, video=None, as_set=False, subcategory="", alias="",
            tags="", mp=0.0, set_mode="video", prev_items=""):
        found = []  # (asset, duplicate, alias)
        defaults = {"mp": mp} if mp else None
        alias = alias.strip()
        multi = sum(x is not None for x in (image, audio, video)) > 1  # one alias, several kinds: suffix them
        try:
            if image is not None:
                frames = image.shape[0]
                made = []
                for i in range(frames):
                    suffix = f"_{i + 1:02d}" if frames > 1 else ""
                    asset, dup = lib.register_image(image[i:i + 1], category, subcategory, f"{name}{suffix}",
                                                    tags=tags, settings=defaults)
                    made.append(asset)
                    if not (as_set and frames > 1):
                        found.append((asset, dup, alias + suffix if alias else ""))
                if as_set and frames > 1:
                    asset, dup = lib.create_set(name, category, subcategory, [a["id"] for a in made], tags=tags,
                                                settings={**(defaults or {}), "set_mode": set_mode})
                    found.append((asset, dup, alias))
            if audio is not None:
                asset, dup = lib.register(_audio_bytes(audio), ".flac", category, subcategory, name, "audio", tags=tags)
                found.append((asset, dup, f"{alias}_audio" if alias and multi else alias))
            if video is not None:
                asset, dup = lib.register(_video_bytes(video), ".mp4", category, subcategory, name, "video",
                                          tags=tags, settings=defaults)
                found.append((asset, dup, f"{alias}_video" if alias and multi else alias))
        except lib.LibraryError as exc:
            raise ValueError(str(exc)) from None
        if not found:
            raise ValueError("BAD_INPUT: connect an image, audio or video to register")
        notes = [f"{'existing' if dup else 'new'} #{a['id']} {a['kind']} {a['rel_path'] or ('set of ' + str(len(a['members'])))}"
                 for a, dup, _ in found]
        ids = ",".join(str(a["id"]) for a, _, _ in found)
        lines = [f"{a['id']}={al}" if al else str(a["id"]) for a, _, al in found]
        items = "\n".join(([prev_items.strip()] if prev_items.strip() else []) + lines)
        return {"ui": {"text": ["\n".join(notes)]}, "result": (ids, items)}


_ITEM = re.compile(r"^\s*(\d+)\s*(?:[=\s]\s*([^\s,;]+))?")


class TJ_RefAssetBrowser:
    """Browse, preview, edit, replace and delete library assets and manage projects (the screen is
    web/reflib_browser_tj.js); the selected asset id and project id come out as STRINGs."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": {"selected": ("STRING", {"default": ""}),
                                             "selected_project": ("STRING", {"default": ""})}}

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("asset_id", "project_id")
    FUNCTION = "run"
    CATEGORY = CATEGORY

    @classmethod
    def IS_CHANGED(cls, selected="", selected_project=""):
        asset = lib.get_asset(lib.parse_id(selected)) if lib.parse_id(selected) is not None else None
        project = lib.get_project(lib.parse_id(selected_project)) if lib.parse_id(selected_project) is not None else None
        return f"{asset['sha256'] if asset else ''}|{project['updated'] if project else ''}"

    def run(self, selected="", selected_project=""):
        asset_id, project_id = lib.parse_id(selected), lib.parse_id(selected_project)
        if asset_id is not None and lib.get_asset(asset_id) is None:
            raise ValueError(f"ASSET_MISSING: asset_id={asset_id} is not in the library")
        if project_id is not None and lib.get_project(project_id) is None:
            raise ValueError(f"PROJECT_NOT_FOUND: project_id={project_id} does not exist")
        return ("" if asset_id is None else str(asset_id), "" if project_id is None else str(project_id))


class TJ_RefProjectSave:
    @classmethod
    def INPUT_TYPES(cls):
        optional = {
            "asset_count": ("INT", {"default": 3, "min": 1, "max": MAX_SLOTS,
                                    "tooltip": "How many asset slots below are used (pick from the library)."}),
        }
        choices = _asset_choices()
        for i in range(1, MAX_SLOTS + 1):
            optional[f"asset_{i}"] = (choices, {"default": "(none)"})
            optional[f"alias_{i}"] = ("STRING", {"default": "", "tooltip": "Short name for prompts (@alias)."})
        optional["items"] = ("STRING", {"multiline": True, "default": "",
                                        "tooltip": "Extra assets as text, one per line (or comma separated): '12' or '12=hero' (id=alias). "
                                                   "Useful when linked from Register nodes."})
        optional["note"] = ("STRING", {"default": ""})
        optional["if_exists"] = (["update", "error"], {"default": "update"})
        return {"required": {"name": ("STRING", {"default": "project"})}, "optional": optional}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("project_id",)
    OUTPUT_NODE = True
    FUNCTION = "run"
    CATEGORY = CATEGORY

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def run(self, name, items="", note="", if_exists="update", asset_count=3, **kw):
        parsed = []
        for i in range(1, max(1, min(MAX_SLOTS, int(asset_count))) + 1):
            asset_id = lib.parse_id(kw.get(f"asset_{i}"))
            if asset_id is not None:
                parsed.append({"asset_id": asset_id, "alias": (kw.get(f"alias_{i}") or "").strip() or None})
        for part in re.split(r"[\n,;]+", items):
            if not part.strip():
                continue
            m = _ITEM.match(part)
            if not m:
                raise ValueError(f"BAD_ITEM: cannot read '{part.strip()}' (use 'id' or 'id=alias')")
            parsed.append({"asset_id": int(m.group(1)), "alias": m.group(2)})
        try:
            project = lib.save_project(name, parsed, note, update_existing=(if_exists == "update"))
        except lib.LibraryError as exc:
            raise ValueError(str(exc)) from None
        text = f"project #{project['id']} '{project['name']}': {len(project['items'])} assets"
        return {"ui": {"text": [text]}, "result": (str(project["id"]),)}


def _load_references(entries, length):
    """Core input dicts, filled in label order so the core's own numbering matches the report."""
    ref_images, ref_videos, ref_video_audios, ref_audios = {}, {}, {}, {}
    for e in entries:
        asset, st = e["asset"], e["settings"]
        kind = entry_kind(e)
        if kind in ("image", "image_set"):
            for member in ([asset] if kind == "image" else [lib.get_asset(m) for m in asset["members"]]):
                ref_images[f"ref_image_{len(ref_images) + 1}"] = media.load_image(lib.abs_path(member), st["mp"])
        elif kind == "video":
            n = len(ref_videos) + 1
            if asset["kind"] == "set":
                images = [media.load_image(lib.abs_path(lib.get_asset(m)), st["mp"]) for m in asset["members"]]
                if (len(images) - 1) * st["frames_per_image"] + 1 > length:
                    print(f"[TJ_H3Reference] set {asset['id']}: {len(images)} images x {st['frames_per_image']} frames "
                          f"does not fit in length={length}; the last images are cut off")
                ref_videos[f"ref_video_{n}"] = media.pack_set(images, st["frames_per_image"], st["fit"])
            else:
                path = lib.abs_path(asset)
                ref_videos[f"ref_video_{n}"] = media.load_video(path, st["start"], st["end"], st["mp"], max_frames=length)
                if e["audio_label"]:
                    ref_video_audios[f"ref_video_audio_{n}"] = media.load_audio(path, st["start"], st["end"])
        else:
            ref_audios[f"ref_audio_{len(ref_audios) + 1}"] = media.load_audio(lib.abs_path(asset), st["start"], st["end"])
    return ref_images or None, ref_videos or None, ref_video_audios or None, ref_audios or None


def _compress_refs(positive):
    """Halve the width and height of every image/video reference latent (1/4 of its tokens).
    Returns the new conditioning and the reference token counts before / after."""
    before = after = 0
    blocks = []
    for blk in positive[0][1].get("minimax_refs", []):
        if blk["kind"] in ("image", "video", "video_audio"):
            z = blk["latent"]
            t, h, w = z.shape[2:]
            nh, nw = max(2, h // 2 // 2 * 2), max(2, w // 2 // 2 * 2)
            before += t * (h // 2) * (w // 2)
            after += t * (nh // 2) * (nw // 2)
            blk = {**blk, "latent": F.interpolate(z, size=(t, nh, nw), mode="area"), "latent_h": nh, "latent_w": nw}
        blocks.append(blk)
    return node_helpers.conditioning_set_values(positive, {"minimax_refs": blocks}), {"before": before, "after": after}


def _asset_image(value):
    """[1,H,W,3] tensor of an image asset picked in a combo, or None for '(none)'."""
    asset_id = lib.parse_id(value)
    if asset_id is None:
        return None
    asset = lib.get_asset(asset_id)
    if asset is None:
        raise ValueError(f"ASSET_MISSING: asset_id={asset_id} is not in the library")
    if asset["kind"] != "image":
        raise ValueError(f"UNSUPPORTED_KIND: asset_id={asset_id} is a {asset['kind']}; first / last frame need an image")
    state = lib.file_state(asset, verify_hash=True)
    if state:
        raise ValueError(f"{state[0]}: {state[1]}")
    return media.load_image(lib.abs_path(asset), asset["settings"]["mp"])


class TJ_H3ImageToVideo:
    """Text / first-frame / last-frame to video; the frames come from connected images or library assets."""

    @classmethod
    def INPUT_TYPES(cls):
        choices = _asset_choices("image")
        return {
            "required": {
                "clip": ("CLIP",),
                "vae": ("VAE",),
                "prompt": ("STRING", {"multiline": True, "dynamicPrompts": True}),
                "width": _core_int("width", _CORE_I2V),
                "height": _core_int("height", _CORE_I2V),
                "length": _core_int("length", _CORE_I2V),
            },
            "optional": {
                "first_asset": (choices, {"default": "(none)", "tooltip": "First frame from the library (used when no image is linked to first_frame)."}),
                "last_asset": (choices, {"default": "(none)", "tooltip": "Last frame from the library (used when no image is linked to last_frame)."}),
                "first_frame": ("IMAGE",),
                "last_frame": ("IMAGE",),
                "encode_cache": ("BOOLEAN", {"default": True,
                                             "tooltip": "Keep the VAE encode of the frames in the library cache and reuse it next time."}),
                "get_name": (["(none)"], {"default": "(none)"}),
                "auto_set": ("BOOLEAN", {"default": False, "tooltip": "켜면 2-출력을 setnode_name 기반 이름으로 자동 Set 등록."}),
                "setnode_name": ("STRING", {"default": "H3I2V"}),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "LATENT")
    RETURN_NAMES = ("positive", "latent")
    FUNCTION = "run"
    CATEGORY = CATEGORY

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, first_asset="", last_asset="", **kw):
        parts = []
        for value in (first_asset, last_asset):
            asset = lib.get_asset(lib.parse_id(value)) if lib.parse_id(value) is not None else None
            parts.append(asset["sha256"] if asset else "")
        return "|".join(parts)

    def run(self, clip, vae, prompt, width, height, length, first_asset="(none)", last_asset="(none)",
            first_frame=None, last_frame=None, encode_cache=True, **kw):
        if first_frame is None:
            first_frame = _asset_image(first_asset)
        if last_frame is None:
            last_frame = _asset_image(last_asset)
        if encode_cache:
            vae = CachedVAE(vae)
        return MiniMaxH3ImageToVideo.execute(clip=clip, vae=vae, prompt=prompt, width=width, height=height,
                                             length=length, first_frame=first_frame, last_frame=last_frame).args


class TJ_H3Reference:
    @classmethod
    def INPUT_TYPES(cls):
        optional = {
            "vae": ("VAE", {"tooltip": _CORE["vae"].tooltip}),
            "audio_vae": ("VAE", {"tooltip": _CORE["audio_vae"].tooltip}),
            "project": (_project_choices(), {"default": "(none)",
                                             "tooltip": "mode=project: every asset of this project is attached."}),
            "project_id": ("*", {
                                      "tooltip": "Link from Project Save: overrides the project combo (and makes this node wait for the save)."}),
            "asset_count": ("INT", {"default": 1, "min": 1, "max": MAX_SLOTS,
                                    "tooltip": "mode=assets: how many asset slots are used."}),
        }
        choices = _asset_choices()
        for i in range(1, MAX_SLOTS + 1):
            optional[f"asset_{i}"] = (choices, {"default": "(none)"})
        optional["compress_refs"] = ("BOOLEAN", {"default": False,
                                                 "tooltip": "Off = full quality. On = image/video reference latents are shrunk to half width and height "
                                                            "(1/4 of the tokens in every sampling step): faster, less detail. Audio is untouched."})
        optional["encode_cache"] = ("BOOLEAN", {"default": True,
                                                "tooltip": "Keep the VAE encode of every reference in the library cache and reuse it next time (same pixels / samples / VAE)."})
        optional["overrides"] = ("STRING", {"default": "", "multiline": False,
                                            "tooltip": 'Per-clip asset settings, e.g. {"items":{"12":{"mp":1.0}}}'})
        optional["get_name"] = (["(none)"], {"default": "(none)"})
        optional["auto_set"] = ("BOOLEAN", {"default": False,
                                            "tooltip": "켜면 4-출력을 setnode_name 기반 이름으로 자동 Set 등록."})
        optional["setnode_name"] = ("STRING", {"default": "H3Ref"})
        return {
            "required": {
                "clip": ("CLIP",),
                "prompt": ("STRING", {"multiline": True, "dynamicPrompts": True,
                                      "tooltip": "Write @12 (asset id) or @alias; they become <Picture i>/<Video k>/<Audio j>."}),
                "width": _core_int("width"),
                "height": _core_int("height"),
                "length": _core_int("length"),
                "ref_image_size": (list(_CORE["ref_image_size"].options), {"default": "match", "tooltip": _CORE["ref_image_size"].tooltip}),
                "mode": (["project", "assets"], {"default": "assets"}),
                "match_check": (["warn", "strict", "off"], {"default": "warn",
                                "tooltip": "strict: stop on prompt/reference errors; warn: report and run; off: never block."}),
            },
            "optional": optional,
        }

    RETURN_TYPES = ("CONDITIONING", "LATENT", "STRING", "STRING")
    RETURN_NAMES = ("positive", "latent", "snapshot", "report")
    FUNCTION = "run"
    CATEGORY = CATEGORY

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @staticmethod
    def _slots(kw):
        count = max(1, min(MAX_SLOTS, int(kw.get("asset_count") or 1)))
        return [kw.get(f"asset_{i}") for i in range(1, count + 1)]

    @classmethod
    def IS_CHANGED(cls, mode="assets", project="", prompt="", overrides="", project_id="", **kw):
        report, entries = resolve(mode, project_id or project, cls._slots(kw), prompt, overrides)
        return json.dumps([fingerprint(entries), report["resolved_prompt"], [e["code"] for e in report["errors"]]])

    def run(self, clip, prompt, width, height, length, ref_image_size, mode, match_check,
            vae=None, audio_vae=None, project="", project_id="", overrides="", encode_cache=True,
            compress_refs=False, **kw):
        report, entries = resolve(mode, project_id or project, self._slots(kw), prompt, overrides, verify_hash=True)

        fatal = [e for e in report["errors"] if e["code"] in ALWAYS_FATAL]
        blocking = report["errors"] if match_check == "strict" else fatal
        if blocking:
            first = blocking[0]
            raise ValueError(f"{first['code']}: {first['message']}" +
                             (f" (+{len(blocking) - 1} more, see report)" if len(blocking) > 1 else ""))
        if match_check != "off":
            for w in report["warnings"]:
                print(f"[TJ_H3Reference] {w['code']}: {w['message']}")
            if report["errors"]:
                print(f"[TJ_H3Reference] {len(report['errors'])} match-check error(s) ignored (match_check={match_check})")

        ref_images, ref_videos, ref_video_audios, ref_audios = _load_references(entries, length)
        cached = [CachedVAE(v) if (encode_cache and v is not None) else v for v in (vae, audio_vae)]
        vae, audio_vae = cached
        positive, latent = MiniMaxH3ReferenceToVideo.execute(
            clip=clip, prompt=report["resolved_prompt"], width=width, height=height, length=length,
            ref_image_size=ref_image_size, vae=vae, audio_vae=audio_vae, ref_images=ref_images,
            ref_videos=ref_videos, ref_video_audios=ref_video_audios, ref_audios=ref_audios).args

        if compress_refs:
            positive, report["ref_tokens"] = _compress_refs(positive)
        report["encode_cache"] = {"hits": sum(getattr(v, "hits", 0) for v in cached),
                                  "misses": sum(getattr(v, "misses", 0) for v in cached)}
        sha = {e["asset"]["id"]: e["asset"]["sha256"] for e in entries}
        snapshot = {
            "version": 1, "mode": mode, "project": report["project"],
            "assets": [{"id": a["id"], "alias": a["alias"], "kind": a["kind"], "name": a["name"],
                        "category": a["category"], "label": a["label"], "audio_label": a["audio_label"],
                        "members": a["members"], "settings": a["settings"], "sha256": sha[a["id"]]}
                       for a in report["attached"]],
        }
        report_json = json.dumps(report, ensure_ascii=False)
        return {"ui": {"text": [report_json]},
                "result": (positive, latent, json.dumps(snapshot, ensure_ascii=False), report_json)}


NODE_CLASS_MAPPINGS = {
    "TJ_RefAssetRegister": TJ_RefAssetRegister,
    "TJ_RefProjectSave": TJ_RefProjectSave,
    "TJ_RefAssetBrowser": TJ_RefAssetBrowser,
    "TJ_H3Reference": TJ_H3Reference,
    "TJ_H3ImageToVideo": TJ_H3ImageToVideo,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TJ_RefAssetRegister": "Reference Asset Register (TJ)",
    "TJ_RefProjectSave": "Reference Project Save (TJ)",
    "TJ_RefAssetBrowser": "Reference Asset Browser (TJ)",
    "TJ_H3Reference": "MiniMax H3 Reference to Video (TJ)",
    "TJ_H3ImageToVideo": "MiniMax H3 Image to Video (TJ)",
}
