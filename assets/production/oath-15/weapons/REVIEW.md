# Tech & Force weapon candidates — unreviewed

Inspected reference-032 pixels. Three archetypes, four exported configurations: long-grip and short-grip impulse hammer, unfolded mechanical shield, and belt module. Octagonal hammer shell/endcaps, compression bands, segmented grips, separate shield wings/hinges and module rails are original geometry. Every entry has editable packed-texture Blender source, UV/PBR GLB, two visual LODs and an independent untextured pickup hull.

Shield wings have two mechanically weighted bones and a 48-frame `shield_fold_unfold` action. This folds the width only. The reference's 25cm folded length requires a separate longitudinal collapse mechanism and is NOT implemented or claimed. Forearm straps are open raised bridges; fit and motion clearance are unverified. Hammer and belt module are rigid.

Regenerate: `blender --background --threads 2 --python tools/production/authoring/impulse_weapons.py`. Twelve original 512px PBR maps cover steel, charcoal iron, orange coating and rubber. Source materials and texture maps are reusable; exported geometry is design-specific.

Open gates: reference-level manufacturing seams, wear and fine hardware; missing damage and compact shield states; human fit/clearance; shield telescoping, dynamic collision and transition testing; gameplay impulse effects/audio; real engine imports and performance; explicit art approval. CPU renders are review evidence, not gameplay certification.
