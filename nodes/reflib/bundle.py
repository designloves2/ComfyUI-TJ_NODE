# nodes/reflib/bundle.py
# Move assets between libraries: one zip with the media files plus a manifest of their
# metadata, sets and projects. Ids are not kept - import maps every asset to the id it gets
# (or already has, when the same file is registered) in the receiving library.

import hashlib
import io
import json
import os
import zipfile

from . import library as lib

FORMAT = 1


def export_bundle(project_id=None, asset_ids=()):
    wanted, projects = [], []
    if project_id is not None:
        project = lib.get_project(int(project_id))
        if project is None:
            raise lib.LibraryError("PROJECT_NOT_FOUND", f"project_id={project_id} does not exist")
        projects.append(project)
        wanted += [it["asset_id"] for it in project["items"]]
    wanted += [int(i) for i in asset_ids]

    assets = {}
    for aid in wanted:
        asset = lib.get_asset(aid)
        if asset is None:
            raise lib.LibraryError("ASSET_MISSING", f"asset_id={aid} is not in the library")
        assets[aid] = asset
        for member in asset.get("members", []):
            assets[member] = lib.get_asset(member)

    buf = io.BytesIO()
    manifest = {"format": FORMAT, "assets": [], "projects": []}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
        for aid in sorted(assets):
            a = assets[aid]
            entry = {"id": aid, "kind": a["kind"], "category": a["category"], "subcategory": a["subcategory"],
                     "name": a["name"], "tags": a["tags"], "note": a["note"], "settings": a["settings"],
                     "sha256": a["sha256"]}
            if a["kind"] == "set":
                entry["members"] = a["members"]
            else:
                entry["ext"] = os.path.splitext(a["rel_path"])[1]
                z.write(lib.abs_path(a), f"files/{aid}{entry['ext']}")
            manifest["assets"].append(entry)
        for p in projects:
            manifest["projects"].append({"name": p["name"], "note": p["note"], "items": p["items"]})
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
    return buf.getvalue()


def import_bundle(data):
    """Returns {"assets": {old_id: new_id}, "projects": [new project ids], "duplicates": [new ids that already existed]}."""
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        manifest = json.loads(z.read("manifest.json"))
    except (zipfile.BadZipFile, KeyError, ValueError):
        raise lib.LibraryError("BAD_BUNDLE", "not a reference library bundle") from None
    if manifest.get("format") != FORMAT:
        raise lib.LibraryError("BAD_BUNDLE", f"unsupported bundle format {manifest.get('format')}")

    mapping, duplicates = {}, []
    entries = manifest["assets"]
    for entry in (e for e in entries if e["kind"] != "set"):
        raw = z.read(f"files/{entry['id']}{entry['ext']}")
        if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            raise lib.LibraryError("HASH_MISMATCH", f"bundle file for asset {entry['id']} is damaged")
        asset, dup = lib.register(raw, entry["ext"], entry["category"], entry["subcategory"], entry["name"],
                                  entry["kind"], tags=entry["tags"], note=entry["note"], settings=entry["settings"])
        mapping[entry["id"]] = asset["id"]
        if dup:
            duplicates.append(asset["id"])
    for entry in (e for e in entries if e["kind"] == "set"):
        asset, dup = lib.create_set(entry["name"], entry["category"], entry["subcategory"],
                                    [mapping[m] for m in entry["members"]], entry["tags"], entry["note"], entry["settings"])
        mapping[entry["id"]] = asset["id"]
        if dup:
            duplicates.append(asset["id"])

    taken = {p["name"].lower() for p in lib.list_projects()}
    created = []
    for p in manifest["projects"]:
        name, n = p["name"], 1
        while name.lower() in taken:
            n += 1
            name = f"{p['name']} ({n})"
        taken.add(name.lower())
        saved = lib.save_project(name, [{"asset_id": mapping[it["asset_id"]], "alias": it["alias"],
                                         "settings": it["settings"]} for it in p["items"]], p["note"])
        created.append(saved["id"])
    return {"assets": mapping, "projects": created, "duplicates": duplicates}
