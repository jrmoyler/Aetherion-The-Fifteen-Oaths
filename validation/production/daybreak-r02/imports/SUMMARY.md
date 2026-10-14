# Independent frozen Daybreak verification

**Scoped import/interface checks pass; stair geometry requires repair. No production or visual acceptance.**

Freeze SHA256: `1e0017444b1c84cce5538de38843d3f87766f0a308aa541b8cbbb29ac4fb0092`. All 195 allowlisted files (376,222,967 bytes) match before testing and remain unchanged afterward.

## Exact coverage

- All 17 module names and original JSON pointers match canonical ARCHITECTURAL_KIT_REGISTRY record8 and its SHA256. Derived filename slugs are not canon IDs.
- Actual Blender opening of all17 module sources and reimport of all66 module GLBs: 51 visual LODs and15 collision exports.
- All66 GLBs independently pass Khronos with zero errors/warnings, Three.js CPU geometry/animation checks and actual Godot4.6.3 headless scene instantiation. The five derivative fixture sources/exports were not reimported in this independent run; the author's separate71-file evidence covers them.
- Independent decoding of480 embedded-image occurrences across visual GLBs succeeds. All visual primitives have UVs; materials have base-color, metallic/roughness and normal texture bindings. Three.js CPU tests substitute texture objects, so decoded-image integrity does not establish rendered material parity.
- Reran the author's source UV/scale/packed-image audit redirected into this independent output directory: all17 sources have zero reported errors or collapsed UV triangles. Texel density varies and is not certified against a close-view target.

## Independently implemented geometric checks

The tests use actual source collision meshes and in-memory negative fixtures, without saving candidate files.

- Floor seam is0m; moving the neighboring copy15mm fails the5mm tolerance.
- Door/window aperture probes each test325 rays: no baseline obstruction; inserted0.2m blocker causes9/15 hits respectively.
- Ramp proxy grade is0.0833333313; raising its endpoint30mm produces0.0895833313 and fails the intended1:12 check.
- Three source baffle pivots stay synchronized at121 integer-frame samples, reach70degrees and retain unit scale. A0.02rad desynchronization fixture fails. All three exported rotation tracks have identical time/value accessor bytes and interpolation in each of the three visual LODs.

These checks improve on the author's narrow proxy-only checks, but do not prove continuous swept clearance, baffle rail clearance, access-code compliance, structural strength, character traversal, game collision/controller authority or wearer fit.

## Confirmed outstanding defect

Actual visual-mesh downward rays independently confirm the author's stair concern: surface height is approximately1.44m through y2.669 and1.60m from y2.671. The terminal riser occupies y2.67–2.70, reducing the final exposed tread to0.27m rather than the intended0.30m. The navigation wedge's correct2.70m run does not resolve this visual geometry defect. See stair-profile.json; stair tread acceptance remains failed/pending a new revision.

No source writes, repository edits, GPU bypass, Unreal import claim, visual approval or full-kit production certification occurred.
