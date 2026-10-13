#!/usr/bin/env python3
"""Verify and import the public Phase II package without overwriting repository files.

First run ``python tools/production/import_phase_ii.py ARCHIVE --inspect``.
Read the emitted README and INTEGRATION_PLAN, reconcile their instructions, then
run with ``--reviewed-documents TOKEN`` using the printed review token. This token
acknowledges the exact documents and mapping; it does not grant design approval.
The default mapping accepts documents at archive root or under one common folder.
For another layout, explicitly specify ``--prefix FOLDER/`` on both invocations;
every payload must be under that prefix. Ambiguous layouts are rejected.

No private provenance archive or download identifiers belong in this workflow.
The CLI accepts only the pinned public archive. Inspection never writes files.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import os
from pathlib import Path, PurePosixPath
import stat
import tempfile
import zipfile
from dataclasses import dataclass


@dataclass(frozen=True)
class ArchiveSpec:
    filename: str
    size: int
    sha256: str
    payload_count: int


PHASE_II = ArchiveSpec(
    "Aetherion_Phase_II_Continental_Architecture_2026-10-13.zip",
    1011575,
    "02306b20f0c070f6fe488d7bf2e4fa25412503010c037860fe3a2a91244be2bc",
    115,
)
DOCUMENT_ROOT = Path("AETHERION_CANON/21_WORLD_CONSTRUCTION_PHASE_II")
ARCHIVE_ROOT = Path("docs/archives/phase-ii")


class ImportRejected(ValueError):
    """Nothing should be published when input or repository checks fail."""


@dataclass
class Inspection:
    archive: bytes
    spec: ArchiveSpec
    prefix: str
    payloads: dict[str, bytes]
    documents: dict[str, str]
    review_token: str


def safe_name(name: str) -> str:
    if not name or "\\" in name or "\x00" in name or ":" in name:
        raise ImportRejected(f"Unsafe archive path: {name!r}")
    trimmed = name[:-1] if name.endswith("/") else name
    if not trimmed or any(p in ("", ".", "..") for p in trimmed.split("/")):
        raise ImportRejected(f"Unsafe archive path: {name!r}")
    path = PurePosixPath(trimmed)
    if path.is_absolute() or any(p.endswith((" ", ".")) for p in path.parts):
        raise ImportRejected(f"Unsafe archive path: {name!r}")
    return trimmed


def document_names(payloads: dict[str, bytes]) -> dict[str, str]:
    result = {}
    for stem in ("README", "INTEGRATION_PLAN"):
        matches = [name for name in payloads if "/" not in name
                   and PurePosixPath(name).stem.upper() == stem
                   and PurePosixPath(name).suffix.lower() in (".md", ".txt")]
        if len(matches) != 1:
            raise ImportRejected(f"Mapping needs exactly one root {stem}.md or .txt")
        try:
            result[matches[0]] = payloads[matches[0]].decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ImportRejected(f"Review document is not UTF-8: {matches[0]}") from exc
    return result


def inspect_archive(path: Path, prefix: str | None = None,
                    spec: ArchiveSpec = PHASE_II) -> Inspection:
    raw = path.read_bytes()
    if len(raw) != spec.size or hashlib.sha256(raw).hexdigest() != spec.sha256:
        raise ImportRejected("Archive size or SHA256 does not match the pinned public Phase II package")
    payloads = {}
    seen = set()
    total_size = 0
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            for info in archive.infolist():
                name = safe_name(info.orig_filename)
                key = name.casefold()
                if key in seen:
                    raise ImportRejected(f"Duplicate or case-colliding archive entry: {name}")
                seen.add(key)
                mode = info.external_attr >> 16
                kind = stat.S_IFMT(mode)
                if kind not in (0, stat.S_IFREG, stat.S_IFDIR):
                    raise ImportRejected(f"Non-regular archive entry: {name}")
                if info.is_dir():
                    continue
                if kind == stat.S_IFDIR or info.flag_bits & 1:
                    raise ImportRejected(f"Invalid or encrypted payload: {name}")
                total_size += info.file_size
                if info.file_size > 32 * 1024 * 1024 or total_size > 128 * 1024 * 1024:
                    raise ImportRejected("Archive exceeds extraction budget")
                payloads[name] = archive.read(info)
    except (zipfile.BadZipFile, NotImplementedError, RuntimeError) as exc:
        raise ImportRejected(f"Cannot safely read ZIP: {exc}") from exc
    if len(payloads) != spec.payload_count:
        raise ImportRejected(f"Expected {spec.payload_count} payload files; found {len(payloads)}")
    # A file cannot also be a parent directory, even with different letter case.
    folded = {name.casefold() for name in payloads}
    for name in payloads:
        if any(str(p).casefold() in folded for p in PurePosixPath(name).parents if str(p) != "."):
            raise ImportRejected(f"File/directory collision: {name}")
    if prefix is None:
        candidates = [""]
        first_parts = {name.split("/")[0] for name in payloads}
        if len(first_parts) == 1 and all("/" in name for name in payloads):
            candidates.append(next(iter(first_parts)) + "/")
        valid = []
        for candidate in candidates:
            mapped = {name[len(candidate):]: data for name, data in payloads.items()}
            try:
                document_names(mapped)
                valid.append(candidate)
            except ImportRejected:
                pass
        if len(valid) != 1:
            raise ImportRejected("Ambiguous archive layout; provide an explicit --prefix after inspecting its contents")
        prefix = valid[0]
    elif prefix:
        prefix = safe_name(prefix.rstrip("/")) + "/"
    if not all(name.startswith(prefix) for name in payloads):
        raise ImportRejected("Explicit prefix would omit payload files")
    mapped = {name[len(prefix):]: data for name, data in payloads.items()}
    documents = document_names(mapped)
    token_hash = hashlib.sha256((spec.sha256 + "\n" + prefix + "\n").encode())
    for name in sorted(documents):
        token_hash.update(name.encode() + b"\x00" + mapped[name] + b"\x00")
    return Inspection(raw, spec, prefix, mapped, documents, token_hash.hexdigest())


def import_archive(inspection: Inspection, repository: Path, reviewed_documents: str) -> dict[str, int]:
    if reviewed_documents != inspection.review_token:
        raise ImportRejected("Read README and INTEGRATION_PLAN with --inspect, then pass their --reviewed-documents token")
    root = repository.resolve(strict=True)
    outputs = {DOCUMENT_ROOT / name: data for name, data in inspection.payloads.items()}
    archive_path = ARCHIVE_ROOT / inspection.spec.filename
    outputs[archive_path] = inspection.archive
    outputs[Path(str(archive_path) + ".sha256")] = (
        f"{inspection.spec.sha256}  {inspection.spec.filename}\n".encode()
    )
    missing = {}
    # Preflight the complete transaction before making any repository changes.
    for relative, data in outputs.items():
        target = root / relative
        for component in [target, *target.parents]:
            if component == root:
                break
            if component.is_symlink():
                raise ImportRejected(f"Repository symlink would redirect output: {component}")
            if component != target and component.exists() and not component.is_dir():
                raise ImportRejected(f"Repository parent is not a directory: {component}")
            if component.parent.is_dir():
                collisions = [entry.name for entry in component.parent.iterdir()
                              if entry.name.casefold() == component.name.casefold()
                              and entry.name != component.name]
                if collisions:
                    raise ImportRejected(f"Repository case collision: {component} with {collisions}")
        if target.exists():
            if not target.is_file() or target.read_bytes() != data:
                raise ImportRejected(f"Existing content differs; reconcile without overwrite: {relative}")
        else:
            missing[relative] = data
    created_files = []
    created_dirs = []
    try:
        # Staging on the same filesystem permits atomic, no-clobber publication.
        with tempfile.TemporaryDirectory(prefix=".phase-ii-import-", dir=root) as staging:
            for index, (relative, data) in enumerate(missing.items()):
                staged = Path(staging) / str(index)
                staged.write_bytes(data)
                target = root / relative
                parents = []
                parent = target.parent
                while not parent.exists():
                    parents.append(parent)
                    parent = parent.parent
                for parent in reversed(parents):
                    parent.mkdir()
                    created_dirs.append(parent)
                # Recheck against symlinks introduced after the preflight.
                if any(p.is_symlink() for p in [target, *target.parents] if p != root):
                    raise ImportRejected(f"Output path changed during import: {relative}")
                os.link(staged, target)
                created_files.append(target)
    except Exception:
        for path in reversed(created_files):
            path.unlink()
        for path in reversed(created_dirs):
            path.rmdir()
        raise
    return {"payload_files": len(inspection.payloads), "created_files": len(missing),
            "unchanged_files": len(outputs) - len(missing)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--repository", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--prefix", help="Explicit archive folder mapped to the Phase II canon root")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--inspect", action="store_true")
    mode.add_argument("--reviewed-documents", metavar="TOKEN")
    args = parser.parse_args()
    try:
        inspection = inspect_archive(args.archive, args.prefix)
        if args.inspect:
            print(f"Verified {inspection.spec.size} bytes, {len(inspection.payloads)} payloads")
            print(f"Mapping: {inspection.prefix or '[archive root]'} -> {DOCUMENT_ROOT}")
            for name, content in inspection.documents.items():
                print(f"\n--- {name} ---\n{content}")
            print(f"\nAfter reading and reconciling both documents: --reviewed-documents {inspection.review_token}")
        else:
            print(import_archive(inspection, args.repository, args.reviewed_documents))
    except (ImportRejected, OSError) as exc:
        parser.exit(1, f"Phase II import blocked: {exc}\n")


if __name__ == "__main__":
    main()
