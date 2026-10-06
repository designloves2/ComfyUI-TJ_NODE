# nodes/reflib/resolve.py
# One function turns "project or asset slots + prompt + overrides" into the final attached
# list, the rewritten prompt and the match-check report. The H3 node and the REST resolve
# route both call it, so the Load-button info box, the STUDIO_ONE check and the real run
# always agree.

import json
import os
import re

from . import library as lib

# Without these the asset cannot be loaded at all, so match_check=off does not waive them.
ALWAYS_FATAL = {"ASSET_MISSING", "HASH_MISMATCH", "PROJECT_NOT_FOUND", "BAD_MODE"}

_NAME_TOKEN = re.compile(r"[^\W\d]\w*")
_TOKEN = re.compile(r"(?<![\w@])@(@|id:\d+|\w+)")
_LABEL = re.compile(r"<(Picture|Video|Audio) (\d+)>")
_LABEL_KIND = {"Picture": "image", "Video": "video", "Audio": "audio"}


def entry_kind(e):
    """What the entry becomes for the core: image | image_set | video | audio. A set packed as a
    video is one <Video k>; a set kept as images is several <Picture i>."""
    asset = e["asset"]
    if asset["kind"] == "set":
        return "image_set" if e["settings"]["set_mode"] == "images" else "video"
    return asset["kind"]


def _assign_labels(entries):
    """Core order: images, then videos (a soundtrack's <Audio j> right before its <Video k>),
    then standalone audio; each kind numbered from 1."""
    picture = audio_no = 0
    for e in entries:
        e["audio_label"] = None
        kind = entry_kind(e)
        if kind == "image":
            picture += 1
            e["labels"] = [f"<Picture {picture}>"]
        elif kind == "image_set":
            e["labels"] = [f"<Picture {picture + i + 1}>" for i in range(len(e["asset"]["members"]))]
            picture += len(e["labels"])
    k = 0
    for e in (e for e in entries if entry_kind(e) == "video"):
        k += 1
        if e["asset"]["kind"] == "video" and e["settings"]["with_audio"] and e["asset"].get("has_audio"):
            audio_no += 1
            e["audio_label"] = f"<Audio {audio_no}>"
        e["labels"] = [f"<Video {k}>"]
    for e in (e for e in entries if entry_kind(e) == "audio"):
        audio_no += 1
        e["labels"] = [f"<Audio {audio_no}>"]
    for e in entries:
        e["label"] = " ".join(e["labels"])


def _limits(entries):
    used = {
        "image": sum(len(e["labels"]) for e in entries if entry_kind(e) in ("image", "image_set")),
        "video": sum(entry_kind(e) == "video" for e in entries),
        "video_audio": sum(bool(e.get("audio_label")) for e in entries),
        "audio": sum(entry_kind(e) == "audio" for e in entries),
    }
    return {k: {"used": used[k], "max": lib.LIMITS[k]} for k in used}


def _parse_overrides(overrides):
    if isinstance(overrides, dict):
        return overrides, None
    text = str(overrides or "").strip()
    if not text:
        return {}, None
    try:
        data = json.loads(text)
    except ValueError as exc:
        return {}, f"overrides is not valid JSON: {exc}"
    if not isinstance(data, dict):
        return {}, "overrides must be a JSON object"
    return data, None


def resolve(mode, project, assets, prompt, overrides=None, verify_hash=False):
    """Returns (report, entries). `entries` (internal) are the healthy attached assets in
    attach order with resolved settings and labels; `report` is the JSON-able match check."""
    errors, warnings = [], []

    def err(code, message, asset_id=None, token=None):
        errors.append({"code": code, "asset_id": asset_id, "token": token, "message": message})

    def warn(code, message, asset_id=None):
        warnings.append({"code": code, "asset_id": asset_id, "message": message})

    mode = str(mode or "").strip().lower()
    wanted = []  # (asset_id, alias, source, item_settings)
    project_info = None
    if mode == "project":
        pid = lib.parse_id(project)
        proj = lib.get_project(pid) if pid is not None else None
        if proj is None:
            err("PROJECT_NOT_FOUND", f"project '{project}' does not exist")
        else:
            project_info = {"id": proj["id"], "name": proj["name"]}
            wanted = [(it["asset_id"], it["alias"], "project", it["settings"]) for it in proj["items"]]
    elif mode == "assets":
        seen = set()
        for value in assets or []:
            aid = lib.parse_id(value)
            if aid is None:
                continue
            if aid in seen:
                warn("DUPLICATE_ASSET", f"asset_id={aid} is selected twice; used once", aid)
                continue
            seen.add(aid)
            wanted.append((aid, None, "slot", {}))
    else:
        err("BAD_MODE", f"mode must be 'project' or 'assets', got '{mode}'")

    override_data, bad = _parse_overrides(overrides)
    if bad:
        err("OVERRIDES_INVALID", bad)
    override_items = override_data.get("items") if isinstance(override_data.get("items"), dict) else {}

    entries = []
    for aid, alias, source, item_settings in wanted:
        asset = lib.get_asset(aid)
        if asset is None:
            err("ASSET_MISSING", f"asset_id={aid} is not in the library", aid)
            continue
        state = lib.file_state(asset, verify_hash)
        if state:
            err(state[0], state[1], aid)
            continue
        settings = {**asset["settings"], **item_settings,
                    **lib.normalize_settings(override_items.get(str(aid)))}
        entries.append({"asset": asset, "alias": alias, "source": source, "settings": settings})
    for key in override_items:
        if not any(str(e["asset"]["id"]) == str(key) for e in entries):
            warn("OVERRIDE_NOT_ATTACHED", f"overrides has settings for asset {key}, which is not attached",
                 lib.parse_id(key))

    _assign_labels(entries)
    limits = _limits(entries)
    for key, v in limits.items():
        if v["used"] > v["max"]:
            err("LIMIT_EXCEEDED", f"{v['used']} {key} references attached, the limit is {v['max']}")

    by_id = {e["asset"]["id"]: e for e in entries}
    by_alias = {e["alias"].casefold(): e for e in entries if e["alias"]}
    # An asset with no alias (every asset in assets mode) can be written by its library name, e.g.
    # @Hero, when the name is a valid alias and no other attached asset or alias uses it.
    names = {}
    for e in entries:
        key = e["asset"]["name"].casefold()
        if not e["alias"] and _NAME_TOKEN.fullmatch(e["asset"]["name"]):
            names.setdefault(key, []).append(e)
    for key, owners in names.items():
        if len(owners) == 1 and key not in by_alias:
            by_alias[key] = owners[0]
            owners[0]["mention"] = owners[0]["asset"]["name"]

    def substitute(m):
        body = m.group(1)
        if body == "@":
            return "@"
        if body.startswith("id:"):
            digits, tail = body[3:], ""
        else:
            digits = ""
            for c in body:
                if not c.isdigit():
                    break
                digits += c
            tail = body[len(digits):]
        if digits:
            entry = by_id.get(int(digits))
            if entry is None:
                err("NOT_ATTACHED", f"@{digits} is not attached to this node", int(digits), m.group(0))
                return m.group(0)
        else:
            folded = body.casefold()
            alias = max((a for a in by_alias if folded.startswith(a)), key=len, default=None)
            if alias is None:
                err("UNKNOWN_ALIAS", f"no attached asset has the alias '{body}'", None, m.group(0))
                return m.group(0)
            entry, tail = by_alias[alias], body[len(alias):]
        return entry["label"] + tail

    resolved = _TOKEN.sub(substitute, str(prompt or ""))

    counts = {"image": limits["image"]["used"], "video": limits["video"]["used"],
              "audio": limits["video_audio"]["used"] + limits["audio"]["used"]}
    mentioned = set()
    for m in _LABEL.finditer(resolved):
        kind, number = _LABEL_KIND[m.group(1)], int(m.group(2))
        if number < 1 or number > counts[kind]:
            err("LABEL_OUT_OF_RANGE", f"{m.group(0)} has no matching reference ({counts[kind]} attached)",
                None, m.group(0))
        mentioned.add(m.group(0))
    for e in entries:
        if not (set(e["labels"]) | {e["audio_label"]}) & mentioned:
            warn("UNUSED_ASSET", f"asset {e['asset']['id']} ({e['asset']['name']}) is attached but the prompt never mentions it",
                 e["asset"]["id"])

    report = {
        "ok": not errors,
        "mode": mode,
        "project": project_info,
        "errors": errors,
        "warnings": warnings,
        "attached": [{
            "id": e["asset"]["id"], "alias": e["alias"], "mention": e["alias"] or e.get("mention"),
            "kind": e["asset"]["kind"], "name": e["asset"]["name"],
            "category": e["asset"]["category"], "label": e["label"], "audio_label": e.get("audio_label"),
            "source": e["source"], "settings": e["settings"], "members": e["asset"].get("members"),
        } for e in entries],
        "limits": limits,
        "resolved_prompt": resolved,
    }
    return report, entries


def fingerprint(entries):
    """What the node's IS_CHANGED hashes: ids, content hashes, file stamps and settings."""
    parts = []
    for e in entries:
        stamps = []
        for a in ([lib.get_asset(m) for m in e["asset"]["members"]] if e["asset"]["kind"] == "set" else [e["asset"]]):
            st = os.stat(lib.abs_path(a))
            stamps.append([a["sha256"], st.st_size, st.st_mtime_ns])
        parts.append([e["asset"]["id"], e["asset"]["sha256"], stamps, e["settings"]])
    return json.dumps(parts, sort_keys=True)
