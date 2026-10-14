# Rime weapon candidates — unreviewed

Reference-059 pixels inspected before modeling. Two archetypes with ready/stowed/damaged states. Long diamond-section frost saber, angular silver guard, pleated slate tassel and three-cartridge Rime repeater are original geometry. Twelve original 512px PBR PNGs include fractured ice base color, roughness/metallic maps and tangent normals. Ice uses glTF transmission, which still needs parity review in each engine.

Regenerate: `blender --background --python tools/production/authoring/rime_weapons.py`. The script shares UV/export/render utilities with Kiln, not its weapon geometry. Blender 4.3.2 CPU Cycles; 18 PNG views and a contact sheet. Contact sheet: saber ready/stowed/damaged above repeater same states. First receiver render was too solid; final revision uses an actual open perimeter frame so the dorsal ice conduit remains visible.

Saber tassel is skinned to four bones with one 48-frame damped `tassel_settle` clip (24fps); rigid blade is not animated. Repeater is rigid. Damage truncates and offsets crystal tips, rather than changing tint. Stowed saber adds a sheath and the repeater adds hip-mount hardware. These are proposed fits, not approved character mounts. Box pickup hulls are independent and untextured; they are not combat hitboxes.

Open: reference-level silver engraving and crystal translucency fidelity; human grip/dock calibration; runtime frost VFX/audio/combat; actual engine import and animation tests, LOD transition review and measured budgets; individual art approval. No complete family closure asserted.
