# Tidal weapon production candidates

Status: **PRODUCTION_CANDIDATE_UNREVIEWED**. These two assets address part of `asset-o04-e-weapons-family`; they do not close the family or its related weapon-construction requirement.

Reference-055's original PNG was inspected at full image level before authoring, including side, top, front, hero, component and carried views. The authored forms preserve its hooked aqua crescent, overlapping ivory nacre, gold fittings, navy wrap, segmented reservoir shaft, circular orb focus and armillary cage. Geometry is original, authored specifically for these weapons. Reference pixels are not redistributed as textures. No source originals were edited.

## Delivered

- Crescent blade and tide orb staff, each with editable `.blend`, UVs, packed image textures, metre units and grip origin.
- Four original 512 × 512 PBR material sets: base color, roughness, metallic and tangent normal, also exported externally. GLBs embed their portable material textures.
- Independent LOD0, LOD1 and LOD2 GLBs; simplified LOD geometry is applied on export. Final triangle counts are read from the actual exported buffers into the manifest.
- Separate coarse pickup-envelope collision GLBs. These are interaction envelopes, not approved authoritative combat hit shapes.
- Separate damaged GLBs with a missing nacre plate and exposed trim, and stowed GLBs with a docking clasp. The grip and docking socket nodes are included. These are asset states; no host-character attachment or gameplay transition is implied.
- Staff tassel: ten actual geometric strands weighted over two connected bones, with a 61-frame loop at 30 fps. This is hanging secondary motion, not a weapon attack clip. Static blade intentionally has no artificial skeleton.
- Front, side and hero CPU Cycles PNGs at 640 × 800, 64 samples, denoising disabled. These are review evidence, not owner acceptance.

## Review and refinements

The first render showed staff shell plates spreading radially. Their orientation was corrected to a tangential overlapping rim closer to the reference. The first cord material read gray under studio lighting; the base color and dielectric response were revised to deeper navy. The crescent outer/inner profiles were resampled to soften the first angular contour while retaining a low-poly edge. Initial LOD export inspection found unapplied decimation; `export_apply=True` fixed actual exported reductions.

## Open acceptance gates

- Owner comparison/approval of exact exported art and dimensions. The source illustration has much richer engraved filigree; these candidates simplify it and do not claim identical final fidelity.
- Reference dagger pommel tassel, reciprocal back-face detailing, and more complete breakage/chipped glass treatment remain open.
- In-hand and back-docking fit against the eventual character rigs, carry/stow transitions, attack/recovery/interruption clips and hit shape validation remain open.
- Glass is currently an opaque aqua PBR reservoir surface for conservative portability. Refraction/transmission, liquid movement and exact appearance parity across engines remain open.
- Runtime animation, skin deformation, materials, LOD silhouette/performance and state/collision swaps need engine-specific tests. No Unreal/Godot/Three.js compatibility is asserted solely from export.
- Audio, water VFX, castable binding and dynamic state behavior are not provided by this asset family output.

Regenerate from repository root with `blender -b -t 2 --python tools/production/authoring/tidal_weapons.py`. This regenerates the actual files and review renders. Material maps are deterministic; binary Blender/GLB packaging may vary by tool version. Built with Blender 4.3.2. All scale and performance choices remain proposed until measured in context.

Motion QA: bone-local Euler rotation initially produced twist instead of intended folding/bending on applicable rigs. The authoring sources now transform the intended world axis into each bone local space and key quaternion channels. Actual motion PNGs were inspected (fan closed, bow drawn, tassel/charm/chain offset). Engine gameplay/physics and self-intersection gates remain open. Final sources set render threads FIXED=2.
