# Frozen Daybreak r04 visual review

**Result: material visual progress, still not an exact reference match or approved production art.** This review did not alter r04 or create a new revision. No publication was performed. All image and filesystem tools used here remained operational; no usage/access limit or bypass occurred.

The immutable checkpoint is `/tmp/aetherion-daybreak-architecture-r04`. Its FREEZE SHA256 is `b08331817661347462f07d96e586fbaccbd51751b77493ef17bb012bcbe22fd8`. All264 payload hashes and byte lengths match:382,432,659bytes. `freeze-and-difference.json` supplies exact per-file hashes against r03, including new evidence files and every changed export/source/fixture.

## Actual pixel comparison

- [Original / proposed / actual assembly](01-original-proposed-assembly.png)
- [Canopy / underside / corner detail](02-canopy-underside-connection.png)

These plates use original reference pixels and frozen CPU-render pixels, with explicit crop coordinates and hashes in `pixel-provenance.json`. No reference was repainted or regenerated. The views are not registered to a common camera or lighting setup; they cannot support pixel-error or quantitative material-fidelity scores. OriginalREF105, the proposed public-colonnade sheet, the proposed removable-canopy sheet, and both resulting comparison plates were inspected directly.

R04 now reads as a four-point fabric span instead of the nearly flat r03 panel. The layered pale capital courses and bronze receiver distinguish the pier heads more clearly. The assemblies show those components connected. These are specific improvements, not a full matching-quality result.

## Remaining gaps

| Priority | Finding from pixels / source evidence | Unfinished work |
| --- | --- | --- |
| High | Proposed public-colonnade art has a pronounced downward central fold with converging underside ribs and substantial pendant. R04 is much shallower, and its centre sits above the mid-edge. Read-only source vertices confirm cornerZ0.300m, centreZ0.160m, front-mid-edgeZ0.050m. | Reconcile the original environment's canopy silhouette and the deep-colonnade proposal with the removable-canopy sheet's initial0.3m envelope. Establish the intended centre/edge profile before further geometry authoring. |
| High | The underside render is almost unarticulated textile; ribs are barely visible and the pendant is a tiny point compared with the proposed underside. | Author visible underside rib sections, converging hub and appropriately scaled pendant; verify below-canopy views and headroom. |
| High | The proposed corner shows a hollow receiver, guarded release tab, pivot and wrapped fabric attachment. R04 renders a solid stepped receiver with simple keeper geometry. | Model the recognisable receiver opening, attachment layers and release silhouette. Current static fittings do not establish a functioning removable mechanism. |
| Medium | Public-colonnade side frames retain angular dipping lines, lacking the proposed substantial branching/braced arches. | Resolve arch profile, thickness, attachment and relationship to the canopy. Present tests exclude these overhead arches from proxy coverage. |
| Medium | R04 public shafts lost the r03 diamond ornament. Base collars, facing seams, drainage and bronze anchor details remain far simpler than the proposed colonnade. | Restore the identifying diamond motif and selectively develop base/shaft details with purposeful low-poly forms. |
| Medium | Marble appears comparatively plain with a regular fine vein pattern. Bronze is uniform and the textile folds/seam definition are weak. | Refine material scale, vein variation, bronze roughness and fabric folds; validate under comparable lighting. These mismatches cannot be dismissed as only lighting differences, though lighting does affect apparent colour/contrast. |
| Open kit scope | The civic assembly remains a module demonstration with plain adjacent roof/wall/threshold and floor inlays. Guard returns, side infill, event/damage/restoration states and baffle collision remain unfinished. | Maintain those separate acceptance gaps; r04 only refines two module designs. |

The two proposed construction references do not supply one fully consistent visual target: the public-colonnade sheet depicts a deep sculpted fold, whereas the removable-canopy sheet explicitly proposes a shallow0.3m envelope. Both remain PROPOSED. R04's shallow scalloped interpretation does not resolve that difference and must not be labelled an exact match to both.

## Newly identified technical defect

Independent verification found12canopy-seat and12pier-seat nodes in each affected fixture export: three coincident copies at each of four positions. Hidden LOD construction anchors leaked into the assembly exports. The original named-pair check did not test total anchor cardinality, so its pass is insufficient for socket uniqueness. This is an unresolved r04 technical defect; freeze remains unchanged. Root has separately authorized an isolated r05 source/export-membership repair.

## Exact independent-verification scope

Ten changed GLBs:

1. `modules/shade-canopy/lod0.glb`
2. `modules/shade-canopy/lod1.glb`
3. `modules/shade-canopy/lod2.glb`
4. `modules/public-colonnade/lod0.glb`
5. `modules/public-colonnade/lod1.glb`
6. `modules/public-colonnade/lod2.glb`
7. `modules/public-colonnade/collision.glb`
8. `fixtures/civic/assembly.glb`
9. `fixtures/residential/assembly.glb`
10. `fixtures/work/assembly.glb`

Five changed Blender sources are the corresponding two module sources and three fixture sources. Each changed fixture also has a changed `hero.png` and `fixture.json`; their exact hashes are in `freeze-and-difference.json`. The other15module payloads and stair/ramp fixture payloads remain identical to r03. The frozen geometry lineage records27changed and160unchanged inherited module/fixture/reference/texture files; this differs from the full package-difference count because code, reports and new files are separate.

Verifier entrypoints: `check-source.py` for real source opens/UV/material/hidden-tier auditing; `check-r04-connections.py` for10 topology/proxy/socket/negative checks; `check-r04-lod-interfaces.py` for2 LOD-envelope checks; `r04-all-request.json` for the10 actual changed imports. Re-root request file paths in the consumer environment. Running supplied scripts as-is writes reports beside them: use a verifier copy or adapt the output root, preserving the frozen candidate.

Public-colonnade tier bounds are4×4×3.7800002m. The canopy has an explicit0.25mm envelope tolerance for subdivision-dependent solidify normals; observed maximum difference is0.149mm. The corner fittings are retained at all tiers. Canopy localXY0.3/3.7,Z0.3 and fixturetranslationZ3.48 meet public receivers atworldZ3.78 with opposing normals. Source audit of hidden editable tiers must temporarily enable their collection viewport evaluation and update the view layer before reading matrix_world; do so only in memory. The colonnade uses12 conservative stepped proxy meshes, with the existing coverage test checking2112 pier-surface vertices and excluding decorative arches.

Independent technical results are reported separately by the verifier. This review does not certify physics/controller traversal, engineering suitability, browser GPU appearance, Unreal import, material equivalence or art approval.
