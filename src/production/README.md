# Optional candidate equipment in the ability sandbox

The destination ability wrapper can display a selected production candidate on the existing caster. Equipment starts **Off**. Catalog discovery reads manifests, but no GLB is fetched, no character child is attached, and no update/dispose hook is installed until the user selects a candidate. Switching back to Off cancels pending fetches, disposes the candidate, and restores the source instance methods. No source file, castable selection, ability settings, input binding, character animation, damage, collision rule or cast timing is modified.

`equipment.js` owns mounting, pending-load cancellation, late-response disposal, candidate-only animation mixers, switching between hand/back placement, and cleanup. The instance hook calls the original character update exactly once with the original receiver and arguments, preserves its return value, and propagates its errors. The equipment mixer then uses the same delta; pausing the source therefore pauses equipment animation. The app disposal hook cleans equipment before calling the original disposer. No global prototype is changed. A new request owns its own parsed GLB and resources; source character resources are never disposed by the equipment controller.

## Actual source sockets and scale

`SOURCE_RIG_INSPECTION.json` records the original Idle.fbx SHA-256 and all 25 bones parsed by the pinned Three.js FBXLoader. The verified socket names are `mixamorigRightHand`, `mixamorigLeftHand`, and `mixamorigSpine2`. The source character normalizes its FBX to 1.78 meters; the inspected rest model scale is approximately 0.0095991. Each mount measures the socket's actual inherited scale and compensates it, so a one-meter GLB remains one meter rather than shrinking to roughly one centimeter.

Bone parsing emitted the existing FBXLoader warning about vertices with more than four skinning weights. This destination feature does not alter the source FBX. CPU tests substitute only texture loading; bone hierarchy, mesh nodes, skinning data, animations and transforms are loaded from actual FBX/GLB bytes. They provide no texture-decode or GPU evidence.

## Proposed alignment and limits

Every catalog entry receives an explicit asset-ID-specific profile with status `PROPOSED_UNREVIEWED`. The initial hand profile positions the authored grip pivot 3.5 cm along the hand's local Y axis and rotates the asset by -90 degrees around local Z. The back profile uses the verified upper-spine bone, with a 2 cm local-Y and -18 cm local-Z offset and a 36-degree local-Z rotation. These shared starting values are exposed in each asset's profile. **They are starting alignments, not measured grips or per-asset visual fit.** Imported asset pivots, two-handed contact, body intersections, ranged-weapon orientation, animation contact, accessories and attachment visibility still require rendered review. Back placement reuses the selected mesh; it does not infer a separate sheath or automatically pick a stowed-state export.

Only explicitly typed equipment, static/articulated equipment, weapon, or focus records may be selected; character, terrain and architecture records are excluded. The UI labels these assets candidate equipment. This is appearance-only integration, not a grant of weapon behavior or an approved equipment inventory. Cloth and articulated accessories use the first authored GLB clip in their independent mixer; these clips do not replace source movement or cast animations.

`vite-assets.mjs` recursively discovers production manifests. Development serves local JSON/GLB files through a bounded read-only route; build copies those files and emits a catalog under `production-assets`. Blender sources and reference images are not required for runtime loading; candidate GLBs must carry their embedded textures. The standalone production preview remains independent.

## Reproduce

Install the unchanged locked dependencies under `runtime/ability-matrix` and `runtime/ability-matrix/packs/sandbox`, then run:

```sh
node --test tests/production-equipment.test.mjs tests/wrapper-entry.test.mjs
npm run build:abilities
npm run dev:abilities
```

The tests exercise the actual source hand hierarchy, an actual skinned candidate GLB, centimeter-to-meter compensation, candidate animation advancement, stow switching, no source-bone mutation, single resource disposal, request races, restoration of instance methods, original error propagation, default-Off behavior and confined catalog URLs. Browser rendering, grip/cast fit, GPU material behavior, performance, and full rendered gameplay remain unverified by these tests.
