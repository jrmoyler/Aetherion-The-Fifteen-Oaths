# Kiln ninja V12 — mixed hair experiment, unapproved and not promoted

Original090 front/profile hair pixels were inspected. Five bounded two-view diagnostic passes tested an offset right part, larger leftward wave, varied curved ends, narrower oblique rear masses, subordinate locks and a continuous nape shell. Pass1–4 recipe/render history is preserved separately. Final comparisons show pass5; the parent inspected both final comparisons.

Parent assessment: front sweep/part asymmetry improves versus V11, but profile has a stronger two-tier cap with a triangular skirt below and a broad bare temple; external tips read like curled rubber. Lower hair is connected now, but coarse parallel groups, shared overlap heights and smooth root patches remain. This is a MIXED/UNAPPROVED experiment, not a promoted preview candidate or an overall likeness improvement. No art acceptance is claimed.

Only hair_lock and designed_hair changed versus frozen V11. The complete face/ear function, eyes, nose/jaw, body/cape/bracer/stance, 38-bone rig, three clips and sockets are retained. The seated eyes preserve the earlier improvement over V8b's conspicuous profile white disk; the small bright sliver/canthus defects remain. Ear has rounded structure but separate acceptance remains open. Exported UV/tangent/LOD buffers may regenerate; recipe equality is not blanket exported byte equality.

Measured triangles: primary55,602 (−1,996 vsV11); LOD1 33,916 (−1,218); LOD2 18,904 (−678); collision76 unchanged. Hair geometry12,012 triangles versusV11 14,008. Internal88 mesh components are not88 assets. Proposed performance budgets remain unmeasured. Four author Khronos checks pass with zero errors/warnings; independent imports/pixels remain pending and do not establish visual quality or Unreal/GPU/gameplay parity.

Compressed source, four PBR maps, four exports and two actual CPU renders are frozen with the recipe by geometry-freeze-receipt.json. Prior candidates and repository files remain untouched. No full pose suite was run.

Reproduce in a fresh directory:

```sh
AETHERION_REVIEW_OUT=/tmp/ninja-v12-reproduction blender -b -t 6 --python /tmp/ninja-v12/kiln_ninja.py -- --face-diagnostic
```

Default review output is the recipe directory. Do not rerun into frozen folders. Seeds are deterministic; byte-identical Blender/GLB reconstruction is not promised. --export-only skips renders.
