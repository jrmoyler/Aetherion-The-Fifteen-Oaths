# Kiln weapon candidates — unreviewed

Two weapon archetypes, six exported ready/stowed/damaged states. This does not close the full weapon family or constitute approved art. Source artwork pixels inspected: reference-061 weapon sheet and reference-113 Oath sheet.

Regenerate with `blender --background --python tools/production/authoring/kiln_weapons.py` (Blender 4.3.2, CPU Cycles, no denoiser). Each scene contains named editable component meshes and smart-projected UV islands. Twelve original deterministic 512px PNGs supply base color, roughness/metallic packed channels, and tangent normals; .blend sources pack these same external files. GLB outputs embed their maps. Banked ember uses a constant emissive material intentionally.

Axes: Blender +Y weapon longitudinal forward, +Z up/face normal; export converts to standard glTF Y-up. Primary grip socket is at origin. Meter dimensions are proposed human-scale fits. Collision GLBs are deliberately untextured coarse pickup hulls, not approved combat hit geometry.

Inspected hero renders and contact sheet against reference pixels. Curved exposed sword edge, ceramic apertures, wrapped grip, focus stepped vent casing, iron staves and inset muzzle grille are present. Stowed sword includes a fitted scabbard; focus includes mounting shoes. Damage changes ceramic geometry. Contact sheet top: sword ready/stowed/damaged; bottom: focus same order. Front and side PNGs accompany each asset.

Open gates: reference-level edge wear/engraving, grip ornament and hanging chain/tassel detail; articulated accessory rig/settle clips; fitted character hands and body mounts; runtime animation/VFX/audio; actual engine imports, LOD transitions and measured performance; formal visual approval. No rigs are fabricated for rigid weapons. CPU renders are review evidence, not GPU gameplay certification.
