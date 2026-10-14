# Kiln ninja V10 — nose–mouth–chin contour checkpoint, unapproved

V10 follows the parent's original090 visual guidance and preserves the V9 seated-globe/eyelid improvement. Two focused front/profile passes were inspected. The first pass's comparison sheets are archived in diagnostic-pass1; the top-level comparisons show the final second-pass pixels. No full-body or nineteen-view pose render was run.

An explicit smooth nasal profile curve replaces the narrow summed nose Gaussians. The first pass had an overly projecting bridge and artificial posterior jaw crease. The final pass shortens and rounds the tip, restrains the bridge, reduces lower-lip/under-lip projection, broadens the low chin slightly and smooths a smaller posterior jaw lift. The actual sampled nasal tip is (0,-0.0695644,1.652)m; this is a model vertex, not a calibrated source measurement or canon scale.

The nose is still a generic broad bridge/alar form, and lip–chin planes and likeness remain below original090. A tiny bright eye sliver/canthus defects remain from V9. Polygonal ear structure, patterned hair/cap and sparse nape strips also remain. The earlier hard jaw crease is reduced, but the jaw shape is not accepted. There is no overall visual approval or claim of an exact match.

V9 globe/iris and inner-lid construction, V8b hairstyle/material repair, body/cape/bracer/stance, 38-bone rig, clips and sockets remain in the recipe. The changed nasal surface can affect the outer orbital transition near the bridge, so preserved eye code is not blanket equality of every surrounding face vertex. See eye-block-preservation.json and body-rig-preservation.json. Full exported byte equality is not claimed: UV/tangent regeneration and global LOD decimation can affect other export buffers.

Triangle counts are unchanged from V9: primary56,234; LOD1 34,301; LOD2 19,118; collision76. The source is saved using Blender's supported compression and packs all four texture images. Budgets remain proposed and unmeasured. Source/exports/maps/two final CPU views are frozen by geometry-freeze-receipt.json. Independent imports and pixel findings remain separate; no GPU, gameplay, Unreal, collision-fit or art approval follows from structural checks.

Reproduce into a fresh directory:

```sh
AETHERION_REVIEW_OUT=/tmp/ninja-v10-reproduction blender -b -t 6 --python /tmp/ninja-v10/kiln_ninja.py -- --face-diagnostic
```

Review output defaults to the recipe directory. Append `--export-only` for source/GLB/map export without rendering. RNG seeds remain deterministic; byte-identical Blender/GLB rebuilds are not promised. Do not rerun against a frozen artifact directory.
