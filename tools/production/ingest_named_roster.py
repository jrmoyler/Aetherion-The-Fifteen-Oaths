#!/usr/bin/env python3
"""Ingest identity-specific 128 GLBs without promoting them to production.

No external packages required. The ZIP from the conversation is an unapproved
prototype artifact, never an art or playable roster acceptance certificate.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import struct
import tempfile
import os
import zipfile

ROOT = "AETHERION_ROSTER_REBUILD/"
TARGET = Path("assets/prototype-intake/named-character-creature-v01")
STAGING_STATUS = "NONAPPROVED_IDENTITY_SPECIFIC_RECONSTRUCTION_CANDIDATE"

def valid_relative(name: str) -> bool:
    path = PurePosixPath(name)
    return bool(name) and not path.is_absolute() and ".." not in path.parts and "." not in path.parts and "\\" not in name and path.suffix == ".glb"

def check_glb(data: bytes, row: dict) -> dict:
    if len(data) < 28 or data[:4] != b"glTF":
        raise ValueError("Bad GLB magic")
    version, size = struct.unpack_from("<II", data, 4)
    if version != 2 or size != len(data):
        raise ValueError("Incorrect GLB header")
    jsize, jkind = struct.unpack_from("<I4s", data, 12)
    if jkind != b"JSON" or jsize == 0 or jsize % 4:
        raise ValueError("Invalid JSON chunk")
    doc = json.loads(data[20:20 + jsize])
    bpos = 20 + jsize
    if bpos + 8 > len(data):
        raise ValueError("Missing binary chunk")
    bsize, bkind = struct.unpack_from("<I4s", data, bpos)
    if bkind != b"BIN\x00" or bpos + 8 + bsize != len(data):
        raise ValueError("Invalid binary chunk")
    if doc.get("asset", {}).get("version") != "2.0" or not doc.get("meshes"):
        raise ValueError("Not a mesh-bearing glTF 2.0")
    buffers = doc.get("buffers", [])
    if len(buffers) != 1 or buffers[0]["byteLength"] > bsize:
        raise ValueError("Invalid binary buffer")
    for view in doc.get("bufferViews", []):
        if view.get("byteOffset", 0) + view["byteLength"] > buffers[0]["byteLength"]:
            raise ValueError("Buffer view outside declared range")
    if len(doc.get("skins", [])) != 1:
        raise ValueError("Missing skeletal rig")
    if not doc.get("materials") or not doc.get("images") or not doc.get("textures"):
        raise ValueError("Missing embedded PBR textures")
    materials = doc["materials"]
    if not any(m.get("normalTexture") and m.get("pbrMetallicRoughness", {}).get("baseColorTexture") and m.get("pbrMetallicRoughness", {}).get("metallicRoughnessTexture") for m in materials):
        raise ValueError("Incomplete basecolor/normal/metalrough texture assignments")
    if any("uri" in image for image in doc["images"]):
        raise ValueError("External textures not accepted")
    for mesh in doc["meshes"]:
        for primitive in mesh.get("primitives", []):
            if not {"POSITION","NORMAL","TEXCOORD_0","JOINTS_0","WEIGHTS_0"}.issubset(primitive.get("attributes", {})):
                raise ValueError("Missing UV, normal or skeletal vertex attributes")
    clips = [a["name"] for a in doc.get("animations", [])]
    if clips != row["clip_names"]:
        raise ValueError("Missing or incorrectly ordered clips")
    for skin in doc["skins"]:
        for j in skin.get("joints", []):
            if j >= len(doc["nodes"]):
                raise ValueError("Out of bounds skeleton node")
    for clip in doc["animations"]:
        for channel in clip.get("channels", []):
            if channel["target"]["node"] >= len(doc["nodes"]):
                raise ValueError("Out of bounds animation node")
    return {"clips": clips, "skins": len(doc["skins"]), "meshes": len(doc["meshes"])}

def validate(z: zipfile.ZipFile, repository: Path):
    infos = z.infolist()
    if len(infos) > 160 or sum(i.file_size for i in infos) > 200_000_000:
        raise ValueError("Unexpected or overlarge archive")
    names = set()
    for info in infos:
        path = PurePosixPath(info.filename)
        if info.filename in names or path.is_absolute() or ".." in path.parts or not info.filename.startswith(ROOT):
            raise ValueError("Unsafe or duplicate path: " + info.filename)
        names.add(info.filename)
        if (info.external_attr >> 16) & 0o170000 == 0o120000:
            raise ValueError("Symlink rejected")
    manifest = json.loads(z.read(ROOT + "ROSTER_REBUILD_MANIFEST.json"))
    provided_audit = json.loads(z.read(ROOT + "ROSTER_STRUCTURAL_AUDIT.json"))
    if len(manifest["assets"]) != 128 or manifest["counts"] != {"character":34,"creature":94}:
        raise ValueError("Archive inventory mismatch")
    if provided_audit["hard_errors"] != 0 or provided_audit["passes"] != 128:
        raise ValueError("Archive's prior structural audit has open errors")
    canon_char = json.loads((repository / "AETHERION_CANON/05_FACTIONS_AND_CHARACTERS/CHARACTER_REGISTRY.json").read_text())
    canon_creatures = json.loads((repository / "AETHERION_CANON/12_CREATURES_AND_MOUNTS/CREATURE_MOUNT_MORPH_REGISTRY.json").read_text())
    canon_ids = {r["id"]: ("character", r["name"]) for r in canon_char["records"]}
    canon_ids.update({r["id"]: ("creature", r["name"]) for r in canon_creatures["records"]})
    if len(canon_ids) != 128:
        raise ValueError("Canonical identity count mismatch")
    verified = []
    seen = set()
    for row in manifest["assets"]:
        identity = row["identity_id"]
        if identity in seen or canon_ids.get(identity) != (row["category"], row["name"]):
            raise ValueError("Mismatched or duplicate canon identity: " + identity)
        seen.add(identity)
        if row["production_approved"] or row["visual_fidelity"] != "UNVERIFIED_AND_NOT_REFERENCE_EXACT":
            raise ValueError("Unauthorized art promotion: " + identity)
        rel = row["glb_path"]
        if not valid_relative(rel) or not rel.startswith(("characters/", "creatures/")):
            raise ValueError("Invalid file path: " + rel)
        data = z.read(ROOT + rel)
        if len(data) != row["size_bytes"] or hashlib.sha256(data).hexdigest() != row["sha256"]:
            raise ValueError("Content digest mismatch: " + rel)
        evidence = check_glb(data, row)
        verified.append({"identity_id": identity,"glb_path": str(TARGET / rel),
                         "sha256": row["sha256"],"status": STAGING_STATUS, **evidence})
    if seen != set(canon_ids):
        raise ValueError("Missing character or creature identity")
    return manifest, verified

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    repository = args.repo.resolve(strict=True)
    if not (repository / "AETHERION_CANON").is_dir():
        raise ValueError("Not an Aetherion repo checkout")
    with zipfile.ZipFile(args.archive) as z:
        manifest, verified = validate(z, repository)
        if args.dry_run:
            print(json.dumps({"models":len(verified),"status":STAGING_STATUS,"staged":False},indent=2))
            return
        target = repository / TARGET
        if target.exists():
            raise FileExistsError("No overwrite allowed: " + str(target))
        target.parent.mkdir(parents=True,exist_ok=True)
        temp = Path(tempfile.mkdtemp(prefix=".roster-intake-",dir=target.parent))
        try:
            for row in manifest["assets"]:
                src = ROOT + row["glb_path"]
                dest = temp / row["glb_path"]
                dest.parent.mkdir(parents=True, exist_ok=True)
                with z.open(src) as infile, dest.open("wb") as outfile:
                    shutil.copyfileobj(infile,outfile)
            (temp / "ROSTER_REBUILD_MANIFEST.json").write_text(json.dumps(manifest,indent=2)+"\n")
            (temp / "STAGING_VERIFICATION.json").write_text(json.dumps(verified,indent=2)+"\n")
            os.replace(temp,target)
        except BaseException:
            shutil.rmtree(temp,ignore_errors=True)
            raise
    print(json.dumps({"models": len(verified),"status":STAGING_STATUS,"target":str(target)},indent=2))

if __name__ == "__main__":
    main()
