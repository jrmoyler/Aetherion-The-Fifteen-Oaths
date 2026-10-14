# Time & Motion weapon candidates — unreviewed

Inspected reference-034 pixels and its dimensional labels. Four unique tools: sectional scythe with open clockwork hub, three-pod throwing ring, hinged wrist blades, and a 22cm double-ended dart. Source meshes are named editable components with projected UVs, original packed/external 512px PBR maps and actual portable LOD/collision exports.

The wrist tool has two weighted mechanical hinges with a 120-degree deploy/retract action over 48 frames. Rigid scythe, ring and dart have no fabricated skeletons. Stowed and damaged states remain missing. Pickup collision hulls are static authoring candidates; moving combat collision and wrist clearance need gameplay integration.

Regenerate: `blender --background --threads 2 --python tools/production/authoring/chronal_weapons.py`. CPU Cycles review images use size-scaled lighting. Render inspection caught and repaired an off-axis scythe grip detail and overlit small objects. The latest source also avoids degenerate pole quads on the dart.

Open gates: formal art approval, fine engraved/worn detail, character hand/wrist fit, stowed and damaged exports, elemental VFX/audio, real engine imports and animation checks, LOD review and measured budgets. Proposed meter values need in-character calibration; no full family closure asserted.
