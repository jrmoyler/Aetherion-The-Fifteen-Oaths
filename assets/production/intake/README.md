# Aetherion reference-fidelity intake — UNAPPROVED WORK

This is an additive **source-of-truth adapter**, not a completed asset-art pass and not permission to substitute lookalikes for the original artwork.

## What this branch actually introduces

- `ROSTER_AND_EXISTING_CANDIDATES.json`: identity-level inventory of 34 named characters and 94 creature records, with **no manufactured playable status or fictional approvals**.
- The existing **52 Blender-authored candidate designs / 63 manifest entries** are indexed with their original `.blend`, GLB, LOD, and collision paths and SHA-256 digests. These are references **to the existing repository binaries**; they are not replacements or additional completed designs.
- `src/production/identity-catalog.js`: opt-in, reference-aware review selection for a **named identity** and a specific authored design. Does not substitute the 15 elemental vanguard prototypes for the named roster. Rejects wrong categories, wrong Oath, wrong reference, and missing sources. Production identity resolution is fail-closed.
- `tools/production/intake_prototype_pack.py`: checks and unpacks the separate 105-GLB October 16 procedural prototype ZIP **only** under `assets/prototype-intake/`. It is not executed automatically and the 105 binary GLBs are not included in this PR. Structural checks are not render, retopology or visual likeness certification.

## Exact intake command

Run at the Aetherion repository root after placing your previously delivered 105-GLB ZIP on the machine:

```bash
python3 tools/production/intake_prototype_pack.py /path/to/Aetherion_Fifteen_Oaths_GLTF_Candidate_Asset_Pack_2026-10-16.zip --dry-run
python3 tools/production/intake_prototype_pack.py /path/to/Aetherion_Fifteen_Oaths_GLTF_Candidate_Asset_Pack_2026-10-16.zip --repo .
node --test tests/identity-catalog.test.mjs
```

The real intake writes 105 verified GLBs, their original manifest, and `INTAKE_VALIDATION.json` into the isolated staging directory. It refuses an existing destination, unsafe ZIP paths, symlinks, digest failures, undeclared skeletal/animation state, or missing required PBR channels. **These outputs must not be copied into `assets/production` or selected as finished characters** merely because their data structure validates.

## Per-identity production acceptance gates

1. **Authoritative references and identity:** record exact concept image IDs, user-approved visual/version scope, primary/front/side/rear and known unknowns. An Oath-wide reference sheet is not evidence that a specific individual was reconstructed.
2. **Geometry:** measured silhouette (including face/head, costume, horns/wings/tails, body plan), topology and occlusion; no generic recolored shared base as final art.
3. **PBR and texture:** distinct material IDs, UV seams, basecolor, metal/rough, normal, occlusion and emissive as required; validate under identical renderer/lighting.
4. **Skinning and motion:** rig matches anatomy and retarget behavior; deformation tested on every joint, gait, turns, stops, melee, cast and damage clips; creatures need role-appropriate locomotion rather than universal bipeds.
5. **Game interface:** correct sockets, colliders, hit volumes, LOD targets, axes, scale, cloth/hair and animation constraints; maintain original 100 source castables and their behavior.
6. **Evidence:** actual Blender source, GLB, renderer screenshots vs original front/side/back, engine imports (Godot, Three.js, Unreal if targeted), import errors, device/performance evidence and written acceptance of the exact artifact.
7. **Promotion:** change only that approved identity's linkage after a recorded approval. Neither structural validation nor a GitHub merge equals likeness signoff.

## Source of truth and scope

- Canonical characters: `AETHERION_CANON/05_FACTIONS_AND_CHARACTERS/CHARACTER_REGISTRY.json`
- Canonical creatures: `AETHERION_CANON/12_CREATURES_AND_MOUNTS/CREATURE_MOUNT_MORPH_REGISTRY.json` (90 designs + four recovered manifestation references)
- Blender/GLB production baseline: `assets/production/`
- Existing design evidence: `validation/production/DELIVERED_DESIGNS.json`
- Original concept imagery: `assets/references/reference-000` through `reference-113`
- Source castables: `CASTABLE_SOURCE_MANIFEST.json` and `runtime/ability-matrix/`

**Outstanding:** the 105 ZIP prototypes are not reference-exact; 34 named character and 94 creature GLB bodies have not been reconstructed and approved individually; game-playability is not established by role/name; full material/animation/runtime QA is pending. This is not the requested finished 3D asset library.
