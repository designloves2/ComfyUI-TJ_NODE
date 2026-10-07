# nodes/reflib/library.py
# Reference asset library: SQLite index + per-category folders of copied media.
#
# The library owns its files. Registering copies the media into
# <root>/<category>/<sub>/<id>_<name>.<ext>; the database stores only the path relative to
# <root>, so the whole folder can be moved or backed up and every id keeps resolving.
# Everything else (nodes, REST, UI) refers to assets by id.

import hashlib
import io
import json
import os
import re
import sqlite3
import threading
import time
from contextlib import contextmanager

import folder_paths
import numpy as np
from PIL import Image

from . import media

CATEGORIES = ("character", "background", "prop", "music", "voice", "video", "etc")
LIMITS = {"image": 9, "video": 3, "video_audio": 3, "audio": 3}
THUMB_SIZE = 256

DEFAULT_SETTINGS = {
    "mp": 0.0,                # >0: downscale (never upscale) to this many megapixels; 0 = untouched
    "start": 0.0,             # video/audio trim in seconds
    "end": 0.0,               # 0 = to the end
    "with_audio": True,       # video: also send its soundtrack
    "set_mode": "video",      # set: "video" (one <Video k>) | "images" (one <Picture i> each)
    "frames_per_image": 12,   # set in video mode
    "fit": "pad",             # set frame size unification: "pad" | "crop"
}
_SETTING_CHOICES = {"set_mode": ("video", "images"), "fit": ("pad", "crop")}

_lock = threading.RLock()
_ready_roots = set()
_verified = {}  # abs path -> (size, mtime_ns, sha256)


class LibraryError(Exception):
    """Raised with a stable code in front of the message: 'ASSET_MISSING: ...'."""

    def __init__(self, code, message):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.detail = message


# ── root / paths ──────────────────────────────────────────────────────────────

def _config_path():
    return os.path.join(folder_paths.get_user_directory(), "tj_reflib.json")


def default_root():
    """<this pack>/assetDB"""
    return os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "assetDB")


def get_root():
    root = os.environ.get("TJ_REFLIB_ROOT") or _read_config().get("root", "")
    return os.path.abspath(root or default_root())


def _read_config():
    try:
        with open(_config_path(), "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def set_root(path):
    path = os.path.abspath(path)
    os.makedirs(path, exist_ok=True)
    with open(_config_path(), "w", encoding="utf-8") as f:
        json.dump({**_read_config(), "root": path}, f, ensure_ascii=False)
    return path


def allowed_origins():
    """Extra web origins (e.g. the web twin) the REST guard accepts; empty by default."""
    return [str(o).rstrip("/").lower() for o in _read_config().get("allowed_origins", [])]


def contain(rel):
    """Absolute path of a root-relative path; refuses anything that escapes the root."""
    root = os.path.realpath(get_root())
    path = os.path.realpath(os.path.join(root, rel))
    if os.path.commonpath([root, path]) != root:
        raise LibraryError("BAD_PATH", f"path escapes the library root: {rel}")
    return path


def safe_part(text, fallback=""):
    text = "".join(c for c in str(text or "") if c not in '<>:"/\\|?*' and ord(c) >= 32)
    text = text.strip(" .")[:80]
    return text or fallback


def check_category(category):
    category = str(category or "").strip().lower()
    if category not in CATEGORIES:
        raise LibraryError("BAD_CATEGORY", f"'{category}' is not one of {', '.join(CATEGORIES)}")
    return category


def asset_label(asset):
    """Combo text; the '/' makes rgthree-style menus nest it: character/demo/Hero [id:1]."""
    return "/".join(p for p in (asset["category"], asset["subcategory"], f"{asset['name']} [id:{asset['id']}]") if p)


def project_label(project):
    return f"{project['name']} [id:{project['id']}]"


def parse_id(value):
    """Id of a combo value: 'character/demo/Hero [id:12]', '12: hero [character]' or just '12'."""
    text = str(value or "").strip()
    tagged = re.search(r"\[id:(\d+)\]\s*$", text)
    if tagged:
        return int(tagged.group(1))
    digits = ""
    for c in text:
        if not c.isdigit():
            break
        digits += c
    return int(digits) if digits else None


# ── database ──────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS assets(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    rel_path TEXT NOT NULL DEFAULT '',
    sha256 TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    width INTEGER, height INTEGER,
    duration REAL, sample_rate INTEGER, has_audio INTEGER,
    tags TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    settings TEXT NOT NULL DEFAULT '{}',
    created REAL NOT NULL, updated REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_sha ON assets(sha256);
CREATE INDEX IF NOT EXISTS assets_cat ON assets(category, subcategory);
CREATE TABLE IF NOT EXISTS projects(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    note TEXT NOT NULL DEFAULT '',
    created REAL NOT NULL, updated REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS project_items(
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
    alias TEXT COLLATE NOCASE,
    position INTEGER NOT NULL,
    settings TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY(project_id, asset_id)
);
CREATE TABLE IF NOT EXISTS set_items(
    set_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL,
    PRIMARY KEY(set_id, position)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_alias ON project_items(project_id, alias) WHERE alias IS NOT NULL;
"""


@contextmanager
def db():
    root = get_root()
    os.makedirs(root, exist_ok=True)
    with _lock:
        conn = sqlite3.connect(os.path.join(root, "index.sqlite"), timeout=30)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA foreign_keys=ON")
            if root not in _ready_roots:
                conn.execute("PRAGMA journal_mode=WAL")
                conn.executescript(_SCHEMA)
                _ready_roots.add(root)
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()


def normalize_settings(raw):
    """Keep only known keys, coerced to their types; unknown or unusable values are dropped."""
    out = {}
    if not isinstance(raw, dict):
        return out
    for key, default in DEFAULT_SETTINGS.items():
        if key not in raw:
            continue
        value = raw[key]
        try:
            if isinstance(default, bool):
                value = bool(value)
            elif isinstance(default, int):
                value = int(value)
            elif isinstance(default, float):
                value = float(value)
            else:
                value = str(value)
        except (TypeError, ValueError):
            continue
        if key in _SETTING_CHOICES and value not in _SETTING_CHOICES[key]:
            continue
        out[key] = value
    return out


def _public(row):
    if row is None:
        return None
    d = dict(row)
    d["settings"] = {**DEFAULT_SETTINGS, **normalize_settings(json.loads(d["settings"] or "{}"))}
    d["tags"] = [t for t in d["tags"].split(",") if t]
    return d


def _with_members(conn, asset):
    if asset and asset["kind"] == "set":
        asset["members"] = [r[0] for r in conn.execute(
            "SELECT asset_id FROM set_items WHERE set_id=? ORDER BY position", (asset["id"],))]
    return asset


def abs_path(asset):
    if asset["kind"] == "set":
        raise LibraryError("BAD_KIND", f"asset_id={asset['id']} is a set and has no file of its own")
    return contain(asset["rel_path"])


# ── assets ────────────────────────────────────────────────────────────────────

def register(data, ext, category, subcategory, name, kind=None, tags="", note="", settings=None):
    """Copy `data` into the library. Returns (asset, duplicate); a file already registered
    (same sha256) is not stored twice and the existing asset is returned."""
    category = check_category(category)
    sub = safe_part(subcategory)
    kind = kind or media.kind_from_ext(ext)
    if kind is None:
        raise LibraryError("UNSUPPORTED_KIND", f"cannot tell what kind of media '{ext}' is")
    digest = hashlib.sha256(data).hexdigest()
    try:
        info = media.probe(data, kind)
    except Exception as exc:
        raise LibraryError("BAD_MEDIA", f"not a readable {kind} file: {exc}") from None

    with db() as conn:
        dup = conn.execute("SELECT * FROM assets WHERE sha256=?", (digest,)).fetchone()
        if dup:
            return _public(dup), True
        now = time.time()
        cur = conn.execute(
            "INSERT INTO assets(kind,category,subcategory,name,sha256,size,width,height,duration,sample_rate,has_audio,"
            "tags,note,settings,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (kind, category, sub, safe_part(name, "asset"), digest, len(data), info.get("width"), info.get("height"),
             info.get("duration"), info.get("sample_rate"), info.get("has_audio"),
             ",".join(tags) if isinstance(tags, (list, tuple)) else str(tags or ""), str(note or ""),
             json.dumps(normalize_settings(settings)), now, now))
        aid = cur.lastrowid
        rel = "/".join(p for p in (category, sub, f"{aid}_{safe_part(name, 'asset')}{ext}") if p)
        path = contain(rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".part"
        try:
            with open(tmp, "wb") as f:
                f.write(data)
            os.replace(tmp, path)
        except BaseException:
            for p in (tmp, path):
                if os.path.exists(p):
                    os.remove(p)
            raise
        conn.execute("UPDATE assets SET rel_path=? WHERE id=?", (rel, aid))
        return _public(conn.execute("SELECT * FROM assets WHERE id=?", (aid,)).fetchone()), False


def import_file(path, category, subcategory, name, **kw):
    """Register a file that already sits in the input / output / temp folder of this server."""
    real = os.path.realpath(path)
    roots = [os.path.realpath(d) for d in (folder_paths.get_input_directory(), folder_paths.get_output_directory(),
                                           folder_paths.get_temp_directory())]
    if not any(os.path.splitdrive(r)[0] == os.path.splitdrive(real)[0] and os.path.commonpath([r, real]) == r for r in roots):
        raise LibraryError("BAD_PATH", "only files inside ComfyUI's input / output / temp folders can be imported")
    with open(real, "rb") as f:
        return register(f.read(), os.path.splitext(real)[1].lower(), category, subcategory,
                        name or os.path.splitext(os.path.basename(real))[0], **kw)


def create_set(name, category, subcategory, image_ids, tags="", note="", settings=None):
    """An ordered group of images of one subject (angles of a person / place)."""
    category = check_category(category)
    ids = [int(i) for i in image_ids]
    if len(ids) < 2:
        raise LibraryError("BAD_SET", "a set needs at least two images")
    members = [get_asset(i) for i in ids]
    for i, m in zip(ids, members):
        if m is None or m["kind"] != "image":
            raise LibraryError("BAD_SET", f"asset_id={i} is not an image in the library")
    digest = hashlib.sha256("|".join(m["sha256"] for m in members).encode()).hexdigest()
    with db() as conn:
        dup = conn.execute("SELECT * FROM assets WHERE sha256=? AND kind='set'", (digest,)).fetchone()
        if dup:
            return _with_members(conn, _public(dup)), True
        now = time.time()
        aid = conn.execute(
            "INSERT INTO assets(kind,category,subcategory,name,sha256,size,tags,note,settings,created,updated)"
            " VALUES('set',?,?,?,?,0,?,?,?,?,?)",
            (category, safe_part(subcategory), safe_part(name, "set"), digest,
             ",".join(tags) if isinstance(tags, (list, tuple)) else str(tags or ""), str(note or ""),
             json.dumps(normalize_settings(settings)), now, now)).lastrowid
        for pos, i in enumerate(ids):
            conn.execute("INSERT INTO set_items(set_id,asset_id,position) VALUES(?,?,?)", (aid, i, pos))
        return _with_members(conn, _public(conn.execute("SELECT * FROM assets WHERE id=?", (aid,)).fetchone())), False


def register_image(frame, category, subcategory, name, **kw):
    """`frame`: an IMAGE tensor slice [1,H,W,C] or [H,W,C] with values 0..1."""
    arr = frame.detach().cpu().numpy()
    if arr.ndim == 4:
        arr = arr[0]
    im = Image.fromarray((arr.clip(0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)[..., :3])
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return register(buf.getvalue(), ".png", category, subcategory, name, "image", **kw)


def get_asset(asset_id):
    with db() as conn:
        return _with_members(conn, _public(conn.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()))


def list_assets(category=None, subcategory=None, kind=None, query=None, limit=200, offset=0):
    sql, args = "SELECT * FROM assets WHERE 1=1", []
    for col, val in (("category", category), ("subcategory", subcategory), ("kind", kind)):
        if val:
            sql += f" AND {col}=?"
            args.append(val)
    if query:
        sql += " AND (name LIKE ? OR tags LIKE ? OR note LIKE ?)"
        args += [f"%{query}%"] * 3
    sql += " ORDER BY id DESC LIMIT ? OFFSET ?"
    args += [int(limit), int(offset)]
    with db() as conn:
        return [_with_members(conn, _public(r)) for r in conn.execute(sql, args).fetchall()]


def count_assets():
    with db() as conn:
        return conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]


def update_asset(asset_id, **fields):
    """name / category / subcategory / tags / note / settings. A change of name, category
    or sub-category moves the file (and its thumbnail) inside the library."""
    with db() as conn:
        row = conn.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()
        if row is None:
            raise LibraryError("ASSET_MISSING", f"asset_id={asset_id} is not in the library")
        cur = _public(row)
        category = check_category(fields.get("category", cur["category"]))
        sub = safe_part(fields.get("subcategory", cur["subcategory"]))
        name = safe_part(fields.get("name", cur["name"]), "asset")
        tags = fields.get("tags", cur["tags"])
        tags = ",".join(tags) if isinstance(tags, (list, tuple)) else str(tags or "")
        settings = cur["settings"] if "settings" not in fields else {**cur["settings"], **normalize_settings(fields["settings"])}

        rel = cur["rel_path"]
        ext = os.path.splitext(rel)[1]
        new_rel = "/".join(p for p in (category, sub, f"{asset_id}_{name}{ext}") if p) if rel else ""
        moved = new_rel != rel
        if moved:
            src, dst = contain(rel), contain(new_rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            os.replace(src, dst)
        try:
            conn.execute(
                "UPDATE assets SET category=?,subcategory=?,name=?,rel_path=?,tags=?,note=?,settings=?,updated=? WHERE id=?",
                (category, sub, name, new_rel, tags, str(fields.get("note", cur["note"]) or ""),
                 json.dumps(settings), time.time(), asset_id))
        except BaseException:
            if moved:
                os.replace(dst, src)
            raise
        if moved and category != cur["category"]:
            old_thumb = _thumb_file(asset_id, cur["category"])
            if os.path.exists(old_thumb):
                os.remove(old_thumb)
        return _public(conn.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone())


def replace_asset(asset_id, data, ext):
    """Swap the media of an asset but keep its id, name, category, settings and project links."""
    asset = get_asset(asset_id)
    if asset is None:
        raise LibraryError("ASSET_MISSING", f"asset_id={asset_id} is not in the library")
    if asset["kind"] == "set":
        raise LibraryError("BAD_KIND", "a set has no file of its own; edit its member images instead")
    kind = media.kind_from_ext(ext)
    if kind != asset["kind"]:
        raise LibraryError("KIND_MISMATCH", f"asset_id={asset_id} is {asset['kind']}, the new file is {kind or 'unknown'}")
    try:
        info = media.probe(data, kind)
    except Exception as exc:
        raise LibraryError("BAD_MEDIA", f"not a readable {kind} file: {exc}") from None
    digest = hashlib.sha256(data).hexdigest()
    with db() as conn:
        same = conn.execute("SELECT id FROM assets WHERE sha256=? AND id!=?", (digest, asset_id)).fetchone()
        if same:
            raise LibraryError("DUPLICATE_FILE", f"this file is already registered as asset_id={same['id']}")
        rel = "/".join(p for p in (asset["category"], asset["subcategory"], f"{asset_id}_{asset['name']}{ext}") if p)
        path = contain(rel)
        tmp = path + ".part"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
        old = contain(asset["rel_path"])
        if old != path and os.path.exists(old):
            os.remove(old)
        conn.execute(
            "UPDATE assets SET rel_path=?,sha256=?,size=?,width=?,height=?,duration=?,sample_rate=?,has_audio=?,updated=? WHERE id=?",
            (rel, digest, len(data), info.get("width"), info.get("height"), info.get("duration"), info.get("sample_rate"),
             info.get("has_audio"), time.time(), asset_id))
        for (set_id,) in conn.execute("SELECT DISTINCT set_id FROM set_items WHERE asset_id=?", (asset_id,)).fetchall():
            hashes = [r[0] for r in conn.execute(
                "SELECT a.sha256 FROM set_items s JOIN assets a ON a.id=s.asset_id WHERE s.set_id=? ORDER BY s.position", (set_id,))]
            conn.execute("UPDATE assets SET sha256=?,updated=? WHERE id=?",
                         (hashlib.sha256("|".join(hashes).encode()).hexdigest(), time.time(), set_id))
        thumb = _thumb_file(asset_id, asset["category"])
        if os.path.exists(thumb):
            os.remove(thumb)
        return _public(conn.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone())


def asset_usage(asset_id):
    with db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT p.id, p.name FROM projects p JOIN project_items i ON i.project_id=p.id WHERE i.asset_id=? ORDER BY p.id",
            (asset_id,))]


def _set_usage(asset_id):
    with db() as conn:
        return [r[0] for r in conn.execute("SELECT DISTINCT set_id FROM set_items WHERE asset_id=?", (asset_id,))]


def delete_asset(asset_id, force=False):
    asset = get_asset(asset_id)
    if asset is None:
        raise LibraryError("ASSET_MISSING", f"asset_id={asset_id} is not in the library")
    used = asset_usage(asset_id)
    if used and not force:
        raise LibraryError("ASSET_IN_USE", f"asset_id={asset_id} is used by projects: " + ", ".join(p["name"] for p in used))
    in_sets = _set_usage(asset_id)
    if in_sets:
        raise LibraryError("ASSET_IN_USE", f"asset_id={asset_id} is a member of set(s) {in_sets}; delete the set first")
    with db() as conn:
        conn.execute("DELETE FROM project_items WHERE asset_id=?", (asset_id,))
        conn.execute("DELETE FROM set_items WHERE set_id=?", (asset_id,))
        conn.execute("DELETE FROM assets WHERE id=?", (asset_id,))
    for path in (contain(asset["rel_path"]) if asset["rel_path"] else "", _thumb_file(asset_id, asset["category"])):
        if path and os.path.exists(path):
            os.remove(path)


# ── integrity ─────────────────────────────────────────────────────────────────

def _sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def file_state(asset, verify_hash=False):
    """None when the file is intact, else (code, message). Without verify_hash the content
    check is skipped (size + mtime are only used to remember an earlier full check)."""
    if asset["kind"] == "set":
        for member_id in asset["members"]:
            member = get_asset(member_id)
            state = file_state(member, verify_hash) if member else (
                "ASSET_MISSING", f"asset_id={member_id} (member of set {asset['id']}) is gone")
            if state:
                return state
        return None
    path = abs_path(asset)
    try:
        st = os.stat(path)
    except OSError:
        return "ASSET_MISSING", f"asset_id={asset['id']} file not found: {asset['rel_path']}"
    if not verify_hash:
        return None
    cached = _verified.get(path)
    if cached and cached[:2] == (st.st_size, st.st_mtime_ns) and cached[2] == asset["sha256"]:
        return None
    if _sha256_file(path) != asset["sha256"]:
        return "HASH_MISMATCH", f"asset_id={asset['id']} content changed since registration: {asset['rel_path']}"
    _verified[path] = (st.st_size, st.st_mtime_ns, asset["sha256"])
    return None


def check_all():
    problems = []
    for asset in list_assets(limit=1_000_000):
        state = file_state(asset, verify_hash=True)
        if state:
            problems.append({"asset_id": asset["id"], "code": state[0], "message": state[1]})
    return problems


# ── thumbnails ────────────────────────────────────────────────────────────────

def _thumb_file(asset_id, category):
    return os.path.join(get_root(), "_thumbs", category, f"{asset_id}.jpg")


def thumb_path(asset):
    path = _thumb_file(asset["id"], asset["category"])
    if os.path.exists(path):
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    src = get_asset(asset["members"][0]) if asset["kind"] == "set" else asset
    media.poster(abs_path(src), src["kind"], THUMB_SIZE).convert("RGB").save(path, "JPEG", quality=85)
    return path


def preview_bytes(asset, max_mp=1.0):
    """JPEG for vision requests: image <= `max_mp` megapixels, video poster, audio waveform
    (a set shows its first image)."""
    src = get_asset(asset["members"][0]) if asset["kind"] == "set" else asset
    im = media.poster(abs_path(src), src["kind"], 4096)
    if max_mp and im.width * im.height > max_mp * 1e6:
        scale = (max_mp * 1e6 / (im.width * im.height)) ** 0.5
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "JPEG", quality=90)
    return buf.getvalue()


# ── projects ──────────────────────────────────────────────────────────────────

def _check_alias(alias):
    alias = str(alias or "").strip()
    if not alias:
        return None
    if alias[0].isdigit() or not all(c == "_" or c.isalnum() for c in alias):
        raise LibraryError("BAD_ALIAS", f"alias '{alias}' must be letters/digits/underscore and may not start with a digit")
    return alias


def count_kinds(pairs):
    """pairs: [(asset, item_settings)]. What the project becomes for the core: a set kept as images
    counts every member as an image, a set packed as video counts as one video."""
    out = {"image": 0, "video": 0, "audio": 0}
    for asset, item_settings in pairs:
        if asset["kind"] == "set":
            mode = {**asset["settings"], **item_settings}["set_mode"]
            if mode == "images":
                out["image"] += len(asset["members"])
            else:
                out["video"] += 1
        else:
            out[asset["kind"]] += 1
    return out


def save_project(name, items, note="", project_id=None, update_existing=False):
    """items: [{"asset_id": int, "alias": str|None, "settings": {...}|None}] in display order."""
    name = str(name or "").strip()
    if not name:
        raise LibraryError("BAD_NAME", "project name is empty")
    seen, aliases, assets = set(), set(), []
    for it in items:
        aid = int(it["asset_id"])
        if aid in seen:
            raise LibraryError("DUPLICATE_ASSET", f"asset_id={aid} appears twice in the project")
        seen.add(aid)
        asset = get_asset(aid)
        if asset is None:
            raise LibraryError("ASSET_MISSING", f"asset_id={aid} is not in the library")
        assets.append((asset, normalize_settings(it.get("settings"))))
        alias = _check_alias(it.get("alias"))
        if alias:
            if alias.lower() in aliases:
                raise LibraryError("DUPLICATE_ALIAS", f"alias '{alias}' is used twice")
            aliases.add(alias.lower())
    kinds = count_kinds(assets)
    for kind in ("image", "video", "audio"):
        if kinds[kind] > LIMITS[kind]:
            raise LibraryError("LIMIT_EXCEEDED", f"a project can hold at most {LIMITS[kind]} {kind}s ({kinds[kind]} selected)")

    with db() as conn:
        now = time.time()
        same = conn.execute("SELECT id FROM projects WHERE name=?", (name,)).fetchone()
        if project_id is None and same is not None:
            if not update_existing:
                raise LibraryError("PROJECT_EXISTS", f"a project named '{name}' already exists (id {same['id']})")
            project_id = same["id"]
        if project_id is None:
            project_id = conn.execute("INSERT INTO projects(name,note,created,updated) VALUES(?,?,?,?)",
                                      (name, str(note or ""), now, now)).lastrowid
        else:
            if same is not None and same["id"] != int(project_id):
                raise LibraryError("PROJECT_EXISTS", f"a project named '{name}' already exists (id {same['id']})")
            if conn.execute("UPDATE projects SET name=?,note=?,updated=? WHERE id=?",
                            (name, str(note or ""), now, project_id)).rowcount == 0:
                raise LibraryError("PROJECT_NOT_FOUND", f"project_id={project_id} does not exist")
            conn.execute("DELETE FROM project_items WHERE project_id=?", (project_id,))
        for pos, it in enumerate(items):
            conn.execute(
                "INSERT INTO project_items(project_id,asset_id,alias,position,settings) VALUES(?,?,?,?,?)",
                (project_id, int(it["asset_id"]), _check_alias(it.get("alias")), pos,
                 json.dumps(normalize_settings(it.get("settings")))))
    return get_project(project_id)


def get_project(project_id):
    with db() as conn:
        row = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
        if row is None:
            return None
        project = dict(row)
        project["items"] = []
        for r in conn.execute("SELECT * FROM project_items WHERE project_id=? ORDER BY position", (project_id,)):
            project["items"].append({
                "asset_id": r["asset_id"], "alias": r["alias"], "position": r["position"],
                "settings": normalize_settings(json.loads(r["settings"] or "{}")),
            })
        return project


def list_projects():
    with db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT p.id, p.name, p.note, p.updated, COUNT(i.asset_id) AS item_count FROM projects p "
            "LEFT JOIN project_items i ON i.project_id=p.id GROUP BY p.id ORDER BY p.id DESC")]


def delete_project(project_id):
    with db() as conn:
        conn.execute("DELETE FROM projects WHERE id=?", (project_id,))
