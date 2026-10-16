# Superseded package notice

The first 128-asset technical pack documented below has been superseded by the **r05 Y-up + degenerate-triangle repair pack**. Use [ROSTER_R05_TECHNICAL_QA.json](ROSTER_R05_TECHNICAL_QA.json) and [REFERENCE_FIDELITY_ACCEPTANCE_R05.md](REFERENCE_FIDELITY_ACCEPTANCE_R05.md).

- New archive: `Aetherion_Roster_R05_YUp_Mesh_Correction_2026-10-16.zip`
- SHA-256: `eb7e8f9322390138ff79c52604cce08146478b2ba9ebbb81e3cb17ef3d704c74`
- 128/128 strict CPU checks and 128/128 offscreen importer passes.
- **Not reference exact; artwork, gameplay, GPU runtime and GitHub binary delivery remain open.**
- The original, uncorrected archive no longer qualifies for the strengthened intake gate.

---

# Named roster GLB candidate package — October 16, 2026

## Integrity and availability

The **separate user-facing conversation archive** is named:

`Aetherion_Named_Character_Creature_3D_Review_Candidates_2026-10-16.zip`

- Final ZIP size: **31,516,536 bytes**.
- Final ZIP SHA-256: `d6de2c9ce7dfb464313fe77058c21440d2f00c8ba1af772998e8b16c20cf79e3`.
- 128 named GLB technical review candidates: 34 canonical characters (including civilians, the Archivist and player), 90 creature design roles and four recovered manifestations.
- Geometry vertex-position signatures: **128 distinct across 128 GLBs** after r02 body/hull silhouette variation; this is **not** a likeness metric.
- PBR: embedded base-color, metallic-roughness, normal maps with UVs. All are **procedurally authored substitutes**, not reference-derived maps.
- Skins: one skeleton per GLB, between 10 and 21 joints, three or four action clips. Soft materials receive limited two-influence joint weights; plate and mechanical elements remain rigid. Facial rig, contact correction, retarget mapping, cloth simulation and authored artist polish are not complete.
- Structural GLB checks and SHA verification: **128 pass, 0 errors**.
- Independent import checks: `trimesh` **128 pass** and VTK 9.6 `vtkGLTFImporter` **128 pass** (offscreen scene parsing, NOT renderer/gameplay certification).
- The ZIP includes `ROSTER_REBUILD_MANIFEST.json`, `ROSTER_STRUCTURAL_AUDIT.json`, `THIRD_PARTY_IMPORT_AUDIT.json`, and `VTK_IMPORT_AUDIT.json`.
- All candidates are **UNAPPROVED**. 0 reference-identical assets have been certified. 0 characters are newly declared playable.

## Import procedure — safe, local, explicit

A person or coding agent with a checkout and the downloaded archive may run:

```sh
sha256sum Aetherion_Named_Character_Creature_3D_Review_Candidates_2026-10-16.zip
python3 tools/production/ingest_named_roster.py Aetherion_Named_Character_Creature_3D_Review_Candidates_2026-10-16.zip --repo . --dry-run
python3 tools/production/ingest_named_roster.py Aetherion_Named_Character_Creature_3D_Review_Candidates_2026-10-16.zip --repo .
```

The validator demands **all 128 canon identities**, matching case-sensitive names, SHA-256 digests, complete embedded texture channels, rig data and 3/4 animation clips; rejects unexpected or duplicate paths; and refuses to overwrite a previous intake.

If successful it stages GLBs under `assets/prototype-intake/named-character-creature-v01/` only. This path is **outside** `assets/production/`; the existing 52 Blender-authored designs and ability logic are untouched. External ZIP model binary bytes are **not present on PR #5**: the available GitHub file-write connector supports UTF-8 text files but cannot transmit the local 31.5 MB binary archive. Staging locally is not proof of remote binary delivery.

## Acceptance gates still OPEN

- Reference exactness (original artwork including front, side, rear and silhouette measurement).
- Individually authored costumes, faces, horns, creature ecologies and realistic materials.
- Proper hand/foot contact, anatomical deformation, LOD/collision fit, gameplay animation.
- Three.js/WebGL GPU visuals, Godot 4 imports, Unreal editor imports, and mobile hardware.
- Explicit sign-off for each artifact and character playability, not inferred from role.
- Actual binary upload of the reviewed, accepted files to GitHub on this PR.

**Do not merge this draft on the mistaken premise that artwork, characters, creatures or binary delivery are finished.**
