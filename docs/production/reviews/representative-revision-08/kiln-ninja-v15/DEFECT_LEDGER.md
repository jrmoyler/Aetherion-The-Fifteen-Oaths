# V15 walk grounding correction — unapproved

Frozen V13 is the exact baseline. Original090 pixels were inspected before the correction. The reference supplies visual stance/boot context, not animation ground-truth. No source/reference bytes or previously frozen candidate files were edited.

## Fixed measurement scope

The original review floor remains at **world Z=0.012m**, not world zero. The baseline rest sole is worldZ0.014m, giving2mm clearance. V13 walk penetrated that elevated plane by as much as2.963029mm; this was not penetration below worldZ0.

V15 evaluates the entire deformed character mesh and computes a walk-only vertical pelvis correction so its lowest vertex targets worldZ0.01275m, a0.75mm clearance. It authors249linear keys at1/8frame intervals over frames1–32. Source pelvis localY maps to Blender worldZ; the matching glTF translation component is Y in its Y-up coordinate system. Corrections range from **−3.409534mm to +3.713029mm**. This varies the body height with the existing gait rather than moving the floor or simply lifting the model by a constant amount.

Only the walk pelvis localY FCurve changes in the saved source. Leg rotations, lateral/forward motion, every other walk FCurve, idle/cast curves, mesh/UV/weights, bone structure, materials, sockets and38bone count are retained. GLBs preserve original binary bytes and379accessors, mesh/skin/node/material data and all other animation samplers. Two accessors are appended and only walk pelvis translation sampler3 is replaced. Collision GLB is byte-identical. Geometry triangle counts remain57,284/34,943/19,476 and collision76. No V14 material work is included.

## Actual checks

All128integer clip frames are included in each representation's1089evaluations:48idle+48cast+993walk samples at1/32frame intervals. Walk includes both endpoints and961noninteger samples. The complete mesh minimum is checked, alongside the original dominant-foot-weight subset and complete geometric shoe/lower-ankle regions (restworldZ≤0.25m on each side). The whole-mesh check includes every shoe vertex even where semantic grouping is ambiguous in the joined character.

| Representation | Dense walk minimum clearance | Maximum support clearance | Penetrating samples |
|---|---:|---:|---:|
| V13 source baseline | −2.963029mm |4.159534mm |742/993 |
| V15 source |0.745924mm |0.750100mm |0/993 |
| V15 primary, actual Blender GLB import |0.746586mm |0.750939mm |0/993 |
| V15 LOD1, actual Blender GLB import |0.746586mm |0.750939mm |0/993 |
| V15 LOD2, actual Blender GLB import |0.683716mm |0.724649mm |0/993 |

Criterion: no vertex below the fixed floor by more than1e-6m. Absolute minima and subset minima are recorded in ground-checks.json; candidate source minima therefore lie around worldZ0.012746m, and LOD2 reaches worldZ0.012684m. Loop endpoint maximum vertex delta is approximately2.8e-18m in source and0 in Blender imports. All four GLBs pass the author Khronos check with zero errors/warnings. Independent Godot/Three/Blender verification is requested separately; no pending results are claimed here.

## Remaining defects and limits

| Gate | Status |
|---|---|
| Sampled plane penetration | Corrected in source and Blender-imported primary/LODs under the stated dense sampling. Continuous mathematical proof between all sample times is not claimed. |
| Walk-to-idle/cast transitions | Unvalidated. Idle/cast remain2mm clear while walk targets0.75mm: approximately1.25mm support-height difference can affect blends. No transition graph/blend acceptance. |
| Contact realism | This is a vertical nonpenetration correction, not contact IK, pressure, heel/toe roll or terrain adaptation. The linear correction curve can change vertical velocity at key boundaries. |
| Sliding and gait | Horizontal foot movement and stride are preserved, not corrected or certified. Dense endpoint continuity is not foot-locking, sliding, gameplay or natural-motion acceptance. |
| All LODs/runtime | Author actual Blender imports pass the narrow check. Godot/Three independent checks are pending; Unreal and GPU appearance remain unverified. |
| Art and equipment | V13 likeness, armor/bracer/mask/hair/cape defects remain. No weapon is equipped; grasp, socket fit and collision remain unaccepted. |

Before/after full-body and foot renders at walkframes9 and25 were inspected. The small vertical adjustment is consistent with the quantitative change; it is not an art approval. Earlier clipped foot-camera views are retained as rejected framing evidence, outside the final artifact manifest. Floor geometry and lighting are identical between each before/after pair. No publication was performed.
