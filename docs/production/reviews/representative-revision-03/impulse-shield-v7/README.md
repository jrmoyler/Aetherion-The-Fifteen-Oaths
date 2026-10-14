# Impulse shield revision07 — proposed review candidate

This is an isolated geometry repair of revision06 against the unchanged original reference032. It is not a production replacement or accepted reference match. No repository files were modified by this work.

The lateral-fold interpretation preserves 0.53 m deployed width × 0.95 m height and 0.25 m stowed width × 0.95 m height. The reference drawing's horizontal 25 cm label is interpreted as stowed width, not collapsed height. The unseen internal engineering is proposed.

## Geometry changes

- Moved nested telescopic lift bearings into the tapered end regions and reduced their diameters, clearing the opposite wing's swept path.
- Separated moving fork supports from the rotating hinge leaves, placed their longitudinal members behind the hinge axis, and rebuilt their top connections around the sleeve mouths.
- Machined actual travel corridors through the fixed spine for the fork/drop supports. These are exported geometry changes, not collision exclusions.
- Raised the left carriage before rotating its wing, avoiding the opposite fixed knuckle assembly.
- Increased final carriage offset from 49 mm to 65 mm, clearing the folded layers and their reverse armor. Stowed depth is 0.22705 m including straps; the sampled maximum total depth during deployment is 0.55433 m. Wearer clearance remains unverified.
- Retained eight rigid mechanical bones, translating/rotating joints and constant scale. No scale keys or hidden geometry toggles.

## Art and engineering limits

The visible construction remains substantially flatter and cleaner than reference032. Reference-local panel bevels, narrow casing edges, cast transitions, scratches and finish variation need further work. The tall temporary carriage extension and proposed exposed sleeves need independent design review; mechanical surface clearance is not manufacturability, strength, forearm fit, lock behavior or final silhouette approval. This is one review mesh, not a completed LOD/collision delivery.

`comparison.html` displays the unchanged source and rendered geometry states. `render_first.py` uses Blender Cycles CPU, neutral AgX lighting, 900×900 images and 48 samples; no GPU or engine appearance verification is claimed. Intermediate frame 61 intentionally shows the raised mechanism.

## Validation interpretation

`glb-validation.json` records a real GLTFLoader CPU geometry/skin/animation load and Khronos checks. The CPU checker substitutes textures and therefore does not validate texture appearance. Its current result is zero errors and 312 generated-tangent-space warnings. No unweighted vertices, invalid joint indices, negative weights or weight sum errors were found.

The clearance audit evaluates all mesh triangles of all distinct moving mechanical groups, with 1 micrometer BVH epsilon and no intergroup contact exclusions. Objects rigidly belonging to the same group are a single assembly. `audit_quarter_clearance.py` samples 721 quarter-frame states over the entire 181-frame action. Surface intersections alone do not test containment or continuous swept volumes, and are not physical simulation. Earlier failed iterations are retained under `iteration01/`, `iteration02/`, `iteration03/`, and `iteration04/` as diagnostic evidence.

Use final `review-evidence.json` for current checksums and clearance outcome. Independent import results, if supplied later, are separate evidence.

Final local result: all 721 quarter-frame states have zero intergroup surface intersections. `clearance-audit.json` is the 181 integer-frame subset of that completed audit. The pre-audit gate list inside `measured-animation.json` is retained as generated; clearance is now supported by the separate final report. The local GLB has 27,456 triangles and 312 generated-tangent warnings.
