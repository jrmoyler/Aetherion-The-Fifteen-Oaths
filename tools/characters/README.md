# Character mesh refinement

`refine_glb.py` changes the shipped GLB vertex buffers; these are not runtime costume overlays. Source revision `4080e58d17d56bb5a92dfe3556630258d0762205` is pinned so repeating the build does not accumulate deformations.

Changes include bounded cheek/jaw corrections using the existing reference profiles, submillimetre relief on the original exposed hair cap, physical head-skinned iris/pupil geometry, and charcoal/silver vertex tint for the Kiln sorcerer's previously white cap. The exported head pose differs from the procedural rest pose; eye placement uses sampled visible eye texture islands in exported coordinates.

Run from the repository root (Python, NumPy and Pillow):

```sh
python tools/characters/refine_glb.py
python tools/characters/verify_refinement.py
```

Validation compares all animation accessors and inverse bind matrices byte-for-byte with the source, retains nodes/skins/clips, and checks finite unit normals, valid indices/weights, and bounded geometry displacement. `refinement-report.json` records source/output hashes and changed-vertex counts. The client attachment guards recognize GLTFLoader's multi-primitive mesh suffixes, preserving embedded costumes and weapons.

`docs/qa/character-refinement/` contains deterministic CPU triangle rasterizations of the actual GLBs. These use base-color textures, interpolated normals and simple directional lighting; they are **not Three.js screenshots, PBR render acceptance, or reference-exact sign-off**. `rasterize_review.py input.glb output.png` reproduces those diagnostic images. Browser/PBR validation belongs to the separate Three.js capture harness.

The original reference faces and hair silhouettes remain substantially more detailed than the mesh. This pass does not claim reference-exact facial reconstruction, final hair grooming or AAA character acceptance. Existing UV/texture and topology limitations remain visible in the closeups.
