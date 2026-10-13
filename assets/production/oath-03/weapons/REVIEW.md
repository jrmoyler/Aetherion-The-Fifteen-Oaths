# Storm Relay weapon candidates — unreviewed

Inspected reference-057 pixels. Two unique designs: chain relay whip and conductor staff, each exported ready and stowed. Sixteen GLBs include visual LODs and independent untextured pickup hulls. Four Blender source scenes pack the nine original 512px copper, ivory and dark woven material maps. CPU review renders and a contact sheet accompany the manifest.

The whip has 26 separately weighted alternating chain links with a 48-frame damped `chain_settle` action. This is an authored cosmetic pose clip, not a simulated whip solver or combat animation. Staff remains rigid. Refined the actual render to close the gap between pommel and first chain link. The dielectric chamber is opaque ivory in this candidate; it does not yet reproduce the reference's glass chamber and electrical arcs. Staff uses an ivory orb, forked copper head and dark wrap.

Regenerate with `blender --background --threads 2 --python tools/production/authoring/storm_weapons.py`. No Kiln mesh templates are reused. Shared utility functions supply material-map IO, UV projection, export and rendering only.

Open gates: hanging tassels, glass relay/electrical VFX, damaged states, reference-level engraving, character grip/stow fit, dynamic link contacts and authoritative combat collision, actual engine imports and performance, individual visual approval. The full family remains partial.
