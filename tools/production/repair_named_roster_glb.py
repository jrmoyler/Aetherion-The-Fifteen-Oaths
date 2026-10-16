#!/usr/bin/env python3
"""Reproduce Aetherion named-roster glTF +Y and zero-area-face corrections.

Technical repairs only. This script deliberately refuses to edit authoritative
Blender production assets. It does not establish likeness, animation quality,
gameplay readiness, PBR visual parity or a measured GPU performance budget.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import struct

VERSION = "AETHERION_REPAIR_R05_CPU_GEOMETRY"
TYPES = {5123: ("<H", 2), 5125: ("<I", 4)}
FACE_EPS_SQUARED = 1e-20


def parse_binary_glb(raw: bytes):
    if len(raw) < 28 or raw[:4] != b"glTF":
        raise ValueError("Not a GLB file")
    version, total = struct.unpack_from("<II", raw, 4)
    if version != 2 or total != len(raw):
        raise ValueError("Invalid version or length")
    jslen, jkind = struct.unpack_from("<I4s", raw, 12)
    if jkind != b"JSON" or jslen % 4:
        raise ValueError("Missing or unaligned JSON chunk")
    payload = json.loads(raw[20:20 + jslen])
    at = 20 + jslen
    blen, bkind = struct.unpack_from("<I4s", raw, at)
    if bkind != b"BIN\x00" or at + 8 + blen != len(raw):
        raise ValueError("Invalid binary chunk")
    if len(payload.get("buffers", [])) != 1:
        raise ValueError("Expected exactly one embedded buffer")
    return payload, bytearray(raw[at + 8:])


def data_at(payload: dict, accessor_index: int):
    accessor = payload["accessors"][accessor_index]
    view = payload["bufferViews"][accessor["bufferView"]]
    if view.get("byteStride"):
        raise ValueError("Strided accessors require DCC-side repair")
    return accessor, view, view.get("byteOffset", 0) + accessor.get("byteOffset", 0)


def cross_sq(a, b, c):
    x1, y1, z1 = (b[i] - a[i] for i in range(3))
    x2, y2, z2 = (c[i] - a[i] for i in range(3))
    x, y, z = y1*z2-z1*y2, z1*x2-x1*z2, x1*y2-y1*x2
    return x*x+y*y+z*z


def fix(raw: bytes):
    doc, body = parse_binary_glb(raw)
    extras = doc.setdefault("extras", {})
    if extras.get("geometry_cleanup_revision") == VERSION:
        return raw, 0, False
    removed = 0
    for mesh in doc.get("meshes", []):
        for primitive in mesh["primitives"]:
            pa, pv, po = data_at(doc, primitive["attributes"]["POSITION"])
            if pa["componentType"] != 5126 or pa["type"] != "VEC3":
                raise ValueError("Expected tightly packed float32 VEC3 positions")
            if po + pa["count"] * 12 > len(body):
                raise ValueError("Out-of-range position buffer")
            positions = [struct.unpack_from("<fff", body, po + 12 * i) for i in range(pa["count"])]
            ia, iv, io = data_at(doc, primitive["indices"])
            spec = TYPES.get(ia["componentType"])
            if spec is None or ia["count"] % 3:
                raise ValueError("Unexpected indexed triangle format")
            fmt, width = spec
            if io + ia["count"] * width > len(body):
                raise ValueError("Out-of-range index buffer")
            indices = [struct.unpack_from(fmt, body, io + width * i)[0] for i in range(ia["count"])]
            clean = []
            for i in range(0, len(indices), 3):
                a, b, c = indices[i:i + 3]
                if max(a, b, c) >= len(positions):
                    raise ValueError("Out-of-range triangle vertex index")
                if cross_sq(positions[a], positions[b], positions[c]) >= FACE_EPS_SQUARED:
                    clean.extend((a, b, c))
                else:
                    removed += 1
            if not clean:
                raise ValueError("All indexed triangles are degenerate")
            if len(clean) != len(indices):
                if ia.get("byteOffset", 0) != 0 or iv["byteLength"] < ia["count"] * width:
                    raise ValueError("Cannot safely rewrite shared index buffers")
                for i, value in enumerate(clean):
                    struct.pack_into(fmt, body, io + i * width, value)
                ia["count"] = len(clean)

    alignment = extras.get("coordinate_convention")
    oriented = alignment == "GLTF_Y_UP_ROOT_ALIGNED_V1"
    if not oriented:
        if alignment:
            raise ValueError("Unexpected existing world coordinate transform")
        scenes = doc.get("scenes", [])
        if not scenes or not all(s.get("nodes") for s in scenes):
            raise ValueError("No scene roots")
        roots = sorted({index for scene in scenes for index in scene["nodes"]})
        root_id = len(doc["nodes"])
        doc["nodes"].append({
            "name": "Aetherion_ZUp_to_glTF_YUp",
            "rotation": [-math.sqrt(.5), 0.0, 0.0, math.sqrt(.5)],
            "children": roots,
        })
        for scene in scenes:
            scene["nodes"] = [root_id]
        extras["coordinate_convention"] = "GLTF_Y_UP_ROOT_ALIGNED_V1"
    extras["geometry_cleanup_revision"] = VERSION
    extras["art_approval"] = False
    extras["degenerate_triangles_removed_r05"] = removed
    encoded = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf8")
    encoded += b" " * (-len(encoded) % 4)
    if len(body) % 4:
        raise ValueError("Misaligned BIN chunk")
    result = (
        b"glTF" + struct.pack("<II", 2, 12 + 8 + len(encoded) + 8 + len(body))
        + struct.pack("<I4s", len(encoded), b"JSON") + encoded
        + struct.pack("<I4s", len(body), b"BIN\x00") + body
    )
    return result, removed, not oriented


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("extracted_roster", type=Path, help="Extracted ZIP's AETHERION_ROSTER_REBUILD folder")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    root = args.extracted_roster.resolve(strict=True)
    if "assets/production" in root.as_posix():
        raise ValueError("Cannot modify authoritative assets/production")
    manifest_file = root / "ROSTER_REBUILD_MANIFEST.json"
    manifest = json.loads(manifest_file.read_text())
    if len(manifest["assets"]) != 128:
        raise ValueError("Expected the original 128 canon identities")
    prepared = []
    for entry in manifest["assets"]:
        if entry["production_approved"]:
            raise ValueError("Refusing to modify art-approved files")
        path = root / entry["glb_path"]
        if root not in path.resolve(strict=True).parents:
            raise ValueError("Escaping output path")
        existing = path.read_bytes()
        if hashlib.sha256(existing).hexdigest() != entry["sha256"]:
            raise ValueError("Input GLB hash mismatch: " + entry["glb_path"])
        updated, removed, aligned = fix(existing)
        prepared.append((path, updated, removed, aligned))
    if not args.dry_run:
        for path, updated, _, _ in prepared:
            temp = path.with_suffix(".partial")
            temp.write_bytes(updated)
            os.replace(temp, path)
        for entry, (_, updated, _, _) in zip(manifest["assets"], prepared):
            entry["sha256"] = hashlib.sha256(updated).hexdigest()
            entry["size_bytes"] = len(updated)
            entry["up_axis"] = "Y"
        manifest["geometry_cleanup_revision"] = VERSION
        manifest["coordinate_revision"] = "glTF Y-up non-destructive mesh/skeleton common root"
        temp = manifest_file.with_suffix(".partial")
        temp.write_text(json.dumps(manifest, indent=2) + "\n")
        os.replace(temp, manifest_file)
    print(json.dumps({
        "checked": len(prepared),
        "triangle_faces_removed": sum(row[2] for row in prepared),
        "Y_up_roots_added": sum(row[3] for row in prepared),
        "written": not args.dry_run,
        "fidelity_approved": False,
    }, indent=2))


if __name__ == "__main__":
    main()
