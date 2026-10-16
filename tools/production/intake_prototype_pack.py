#!/usr/bin/env python3
"""Fail-closed intake for the 105-GLB Aetherion procedural PROTOTYPE archive.

This does not create approved content and never modifies assets/production.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import struct
import tempfile
import zipfile

ROOT = "AETHERION_3D_CANDIDATES/"
TARGET = Path("assets/prototype-intake/aetherion-2026-10-16")
STATUS = "UNAPPROVED_PROCEDURAL_CANDIDATE"


def inspect_glb(data, entry):
    if len(data) < 28 or data[:4] != b"glTF":
        raise ValueError("Not a binary glTF 2.0 file: " + entry["path"])
    version, total = struct.unpack_from("<II", data, 4)
    if version != 2 or total != len(data):
        raise ValueError("Invalid GLB version/length: " + entry["path"])
    position = 12
    chunks = []
    while position < total:
        if position + 8 > total:
            raise ValueError("Truncated GLB chunk header")
        count, kind = struct.unpack_from("<I4s", data, position)
        position += 8
        if count % 4 or position + count > total:
            raise ValueError("Misaligned/overlong GLB chunk")
        chunks.append((kind, data[position:position + count]))
        position += count
    if position != total or len(chunks) != 2 or chunks[0][0] != b"JSON" or chunks[1][0] != b"BIN\\0":
        raise ValueError("Expected embedded JSON and BIN chunks")
    doc = json.loads(chunks[0][1])
    if doc.get("asset", {}).get("version") != "2.0" or not doc.get("meshes"):
        raise ValueError("Missing glTF 2.0 mesh")
    if len(doc.get("buffers", [])) != 1 or doc["buffers"][0]["byteLength"] > len(chunks[1][1]):
        raise ValueError("Missing/out-of-bounds embedded binary buffer")
    materials = doc.get("materials", [])
    if not materials or not doc.get("textures") or not doc.get("images"):
        raise ValueError("Missing PBR texture/material content")
    if not any(m.get("pbrMetallicRoughness", {}).get("baseColorTexture") and m.get("normalTexture") for m in materials):
        raise ValueError("Missing base color or normal texture")
    skins = doc.get("skins", [])
    animations = doc.get("animations", [])
    if bool(entry["skeletal_rig"]) != bool(skins):
        raise ValueError("Rig declaration differs from GLB")
    if len(animations) != len(entry["animation_clips"]):
        raise ValueError("Animation clip count mismatch")
    if any(image.get("uri") for image in doc["images"]):
        raise ValueError("External textures are not allowed in isolated intake")
    return {"meshes": len(doc["meshes"]), "skins": len(skins), "animations": len(animations)}


def validate_archive(archive):
    with zipfile.ZipFile(archive) as z:
        members = z.infolist()
        if not members or len(members) > 250:
            raise ValueError("Unexpected archive member count")
        seen = set()
        for m in members:
            p = PurePosixPath(m.filename)
            if m.filename in seen or p.is_absolute() or ".." in p.parts or not m.filename.startswith(ROOT):
                raise ValueError("Unsafe/duplicate archive member: " + m.filename)
            seen.add(m.filename)
            if (m.external_attr >> 16) & 0o170000 == stat.S_IFLNK:
                raise ValueError("Symlink rejected: " + m.filename)
            if m.file_size > 32_000_000:
                raise ValueError("Oversize individual archive member")
        if sum(m.file_size for m in members) > 500_000_000:
            raise ValueError("Oversize uncompressed archive")
        manifest = json.loads(z.read(ROOT + "ASSET_MANIFEST.json"))
        models = manifest["models"]
        if len(models) != 105:
            raise ValueError("Expected exactly 105 declared procedural GLBs")
        if sum(manifest["counts"].values()) != 105:
            raise ValueError("Unexpected category count")
        paths = set()
        oath_ids = set()
        report = []
        for entry in models:
            rel = entry["path"]
            name = PurePosixPath(rel)
            if name.is_absolute() or ".." in name.parts or name.suffix != ".glb" or rel in paths:
                raise ValueError("Unsafe/duplicate model path: " + rel)
            paths.add(rel)
            oath_ids.add(entry["oath_id"])
            if entry["status"] != STATUS or entry.get("visual_match") is not False:
                raise ValueError("Candidate incorrectly presented as visually approved")
            data = z.read(ROOT + rel)
            if hashlib.sha256(data).hexdigest() != entry["sha256"] or len(data) != entry["size_bytes"]:
                raise ValueError("SHA-256/length mismatch: " + rel)
            result = inspect_glb(data, entry)
            report.append({"path": rel, "sha256": entry["sha256"], "status": STATUS, **result})
        if oath_ids != {f"oath-{i:02}" for i in range(1, 16)}:
            raise ValueError("Incomplete Oath coverage")
        return manifest, report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("zip", type=Path, help="Locally supplied Aetherion 105 GLB prototype ZIP")
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    manifest, report = validate_archive(args.zip)
    result = {"status": STATUS, "model_count": len(report), "repo_target": str(TARGET), "models": report,
              "warning": "Models are geometry/rigging prototypes, not original-art replicas or game-ready approvals."}
    if args.dry_run:
        print(json.dumps({"count": len(report), "status": STATUS, "categories": manifest["counts"], "written": False}, indent=2))
        return
    repo = args.repo.resolve(strict=True)
    if not (repo / "AETHERION_CANON").is_dir():
        raise ValueError("Not an Aetherion checkout")
    output = repo / TARGET
    if output.exists():
        raise FileExistsError("Refusing to overwrite existing intake: " + str(output))
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix=".intake-", dir=output.parent))
    try:
        with zipfile.ZipFile(args.zip) as z:
            for row in report:
                dest = temp / row["path"]
                dest.parent.mkdir(parents=True, exist_ok=True)
                with z.open(ROOT + row["path"]) as source, dest.open("wb") as target:
                    shutil.copyfileobj(source, target)
        (temp / "ASSET_MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")
        (temp / "INTAKE_VALIDATION.json").write_text(json.dumps(result, indent=2) + "\n")
        os.replace(temp, output)
    except BaseException:
        shutil.rmtree(temp, ignore_errors=True)
        raise
    print(json.dumps({"count": len(report), "status": STATUS, "output": str(output)}, indent=2))


if __name__ == "__main__":
    main()
