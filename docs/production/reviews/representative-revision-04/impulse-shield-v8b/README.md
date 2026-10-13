# Impulse shield revision08b — proposed visual repair

This isolated candidate continues the validated revision07 mechanism. It is not a production replacement or accepted exact reference match. No repository or proposed-expansion uploader files were changed.

## Reference-driven geometry

Actual reference032 pixels were inspected in full and in the exterior/component regions recorded in `reference-landmarks.json`. This pass replaces the broad plain borders and generic small service rectangles with paired inner cast mounting plates, narrow stepped outer casings, source-like diagonal panel divisions and actual countersunk recesses. The hub now has separated outer casing segments, recessed orange arcs, guarded tabs, machined spindle detail and recessed screw sockets. A narrow central service guide and its mounting rails follow the source's visible center housing.

The pressure head is larger than revision07, within a fixed guide diameter of 25 cm. Its proportion remains smaller than it appears in the reference front view; the source drawing and its stated stowed width have not been declared dimensionally consistent. This candidate does not conceal that mismatch by changing the stated dimensions.

The existing normal-to-face carriage movement clears the lateral panel fold. It is not longitudinal collapse: height remains 95 cm at every measured animation frame. Deployed width is 53 cm and stowed width is 25 cm. The horizontal 25 cm source annotation is interpreted as stowed width. No scale animation, hidden geometry toggle, or height telescoping is used.

New casing geometry initially contacted the carriage bridge and new hub guards crossed the bearing bore. The guards were moved inward, and the rod terminal/bridge were shortened and lowered to restore real geometric clearance. No collision exclusions were introduced.

## PBR finish and render controls

Localized exported base-color/ORM/normal maps place subtle wear near actual casing edges and panel junctions, with sparse fine scuffs and roughness changes. Front/back planar surfaces have model-space UV mapping; sidewalls retain their original smart unwrap and base finish. All textures are actual PNGs and packed into the Blender source and GLB. The UV audit initially exposed nanometer-thick bevel remnants; reproducible 0.1-micrometer vertex welding and degenerate-edge cleanup remove those numerical slivers before unwrap. The final UV audit reports zero collapsed UV triangles; the cleanup and repair records retain object-level evidence.

The five comparison states, an additional deployed reverse view, and two close-ups use the same neutral Cycles CPU lighting, AgX transform and 48 samples as revision07. Close-ups alter only the camera framing. `render_first.py` reproduces the full views; `render_details.py` reproduces close-ups; `render_back.py` reproduces the reverse view. Reference crop images are analysis-only crops; `reference-032-original.png` is copied unchanged.

## Acceptance limits

The paired casings and segmented hub improve source fidelity, but exact art matching remains open. Manufacturing detail, finish age, small hardware placement, rear strap construction, side/rear silhouette and wearer fit still need independent review. The proposed hidden mechanism has a substantial extension normal to the shield face; it has not passed strength, load-bearing, continuous swept-volume, containment, glove/forearm or gameplay tests. This is one review mesh, not a completed production LOD/collision package.

The clearance audit checks evaluated triangles of every distinct moving mechanical group, without intergroup contact exclusions, at 721 quarter-frame states over the full 181-frame action. Same-rigid-group components form one assembly. A passing sampled surface-intersection test does not prove physical engineering or all-time collision clearance.

`glb-validation.json` records real Khronos and GLTFLoader CPU geometry/skin/animation checks. The local CPU checker substitutes texture objects, so its pass is not an appearance test. GPU and independent engine evidence, if later supplied, are separate results. `review-evidence.json` records the final state and hashes; pre-audit gate entries in the generated measurement report are not acceptance claims.

## Bounded repair after revision08 review

Frozen revision08 revealed a regression: the new smaller front-panel outline had also been reused for reverse armor, exposing excessive gray casting when stowed. Revision08b restores a separate broad reverse outline matching revision07 coverage. The front casing, hub, localized materials, rigid rig, animation sequence and dimensional targets are unchanged. The original revision08 files and its failed visual evidence remain preserved in the adjacent directory.

The restored reverse coverage resolves that specific regression, but does not certify detailed rear hardware, forearm straps or exact reference appearance. Those remain independent review gates.
