# PR #18 reconstruction continuation

Recovered checkpoint: the previous chat described unpublished Kiln Blender work. Its temporary logs survived, but the source files and binary did not. This continuation rebuilds the geometry from the checked-in reference sheets and pins its source to `3c991ee6e83dce6bd13a8bade714fc463e4263be`. Earlier logs are not substituted for these runs.

## Implemented

- Kiln / reference-091: elderly reference face detail; dark/grey solid hair locks; shoulder harness, buckles, shaped bib/apron, edged hem, kiln door, vents and hinges. Covered legacy apron faces are culled; the replacement lower apron blends hips and thigh joints.
- Storm / reference-087: individual front facial detail, dark coiled-bun construction, continuous cape and copper edging, belt pouches and clasps.
- Time / reference-064: young dark-haired identity and removal of the invented glasses; asymmetric coat panels, lapel, seams, buttons and belt hardware.
- Geometry additions are authored using Blender 4.5.3 and appended to the real runtime GLBs, retaining the original binary data, inverse bind matrices and all 23 animation clips per character. Added geometry is weighted to original joints.
- Face albedo is prepared from observed front closeups using bounded low-frequency illumination normalization. Only the front face receives projection; side/back skin stays inferred. Source lighting cannot be perfectly recovered from RGB artwork.
- Reference material swatches supply the added costume surfaces. Unknown physical roughness is inferred. Solid hair locks replace the three generic hair-card sets; other characters retain their current pipeline.
- Missing face textures retain the skin fallback while loading or after failure. Updated runtime asset cache avoids serving the old GLBs from the previous cache namespace after the new service worker activates.

## Visual review

Actual Three.js front, close-up, oblique, rear and casting renders are in `../fidelity-pass/reference-*.png`. They use the production `BodyFactory`, the actual exported GLBs and active skeletal clips. These are not Blender-only preview models.

The reference identities are more distinct and the costume components are present. The renders still show approximate facial proportions, simplified hair bundles, legacy body/boot/weapon shapes and imperfect cloth deformation. The Time blouse/lapel relationship and Storm shoulder transition need further tailoring. These images do **not** meet reference-identical or final AAA acceptance. No numerical likeness score is asserted.

This checkpoint covers three sorcerers, not the complete hero/NPC/creature roster. World reconstruction and target-hardware performance remain open. SwiftShader is a functional test renderer, not Steam Deck hardware.

## Reproduction

From repository root:

```sh
python tools/blender/reconstruction/prepare_faces.py
blender -b -t 2 --python tools/blender/reconstruction/rebuild_details.py
node --test game/src/three/*.test.mjs game/test/*.test.mjs
npm --prefix game run build
CAPTURE_LABEL=reference node game/test/fidelity-capture.mjs
FIDELITY_CLASS=sorcerer FIDELITY_OUT=../../validation/reconstruction-continuation/gameplay-kiln/ node game/test/fidelity-runtime.mjs
```

The browser harness accepts `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, `FIDELITY_OATH`, `FIDELITY_CLASS`, `FIDELITY_QUALITY`, and `FIDELITY_OUT`. Build reports record source/output SHA-256 hashes, added triangles, primitive counts and binary-prefix preservation. The original img2threejs checklist is preserved; the continuation ledger records this direct reconstruction route without claiming its unfinished gates passed.

## Final checks

All 54 regression tests pass; production build and PWA generation pass. All three actual keyboard-casting runs completed with zero browser errors and zero failed HTTP requests at 1280×800, low quality:

| Character | Draw calls | Triangles | Recorded skeletal samples |
| --- | ---: | ---: | ---: |
| Kiln | 127 | 547,510 | 26 |
| Storm | 138 | 539,021 | 23 |
| Time | 163 | 590,549 | 23 |

These are scene counters in Chromium SwiftShader, not hardware frame-rate results. Each `gameplay-*/runtime.json` includes the selected model URL and distinct hand positions during the keyboard-triggered action.
