# Fault Choir amethyst blade — revision 9 review

Status: REVIEW ONLY, NOT APPROVED. No production repository files changed. Revision 8 is preserved separately.

Inspected actual original reference 053. Authored changes widen the irregular exposed amethyst channel, increase overlapping mineral-layer thickness and broken cleavage bevels, narrow the guard crown and anchors, darken stone/bronze/leather material values, and remove the revision-8 extra studio reflection cards. The crystal is a closed faceted mesh, not an image plane. Every mesh has UVs and assigned materials; all 16 PBR maps are packed in source.blend and included externally.

## Material engineering evidence

Revision 9 explicitly sets Non-Color before writing roughness/metallic/normal images. An initial hypothesis that revision 8 had gamma-corrupted data textures was tested and NOT confirmed: both revisions have taupe normal mean RGB [127.5038,127.4984,255] and amethyst roughness mean 11.92995/255. Therefore this ordering change is preventive clarity, not a demonstrated encoding repair. The bronze metallic difference 219 to 199 is the intentional material value change, not a color-space correction. See non-color-map-audit.json. Do not attribute the visual changes to a fixed gamma bug.

## Actual inspection

Blender 4.3.2 reopened the saved source successfully. Source has 116 mesh objects and 8,366 polygon-derived triangles before modifier evaluation, dimensions 0.122584 × 0.085600 × 0.773522 m in Blender XYZ. These are authored proposal dimensions, not established canon measurements. No missing mesh UV layers or material assignments. Source has 16 packed 512×512 images: four sRGB base colors and twelve Non-Color scalar/normal maps. No new GLB/engine runtime test was performed for this review-only source. Static blade does not require a deformation rig.

Cycles CPU, two threads, 96 samples for front/profile/hero/material detail; 128 samples for the rolled comparison views. The matched views use camera roll -98 degrees to approximate the source sheet main-view direction; they are not calibrated perspective/landmark matches. Neutral shared area-light rig with AgX. Recipes retain the paths of this isolated folder; rerun with `blender -b -t 2 --python fault_weapons.review.py`, then `render_matched.py`, then `inspect_source.py`.

## Visible deficiencies — acceptance remains open

Direct inspection of the final matched front against reference 053 shows that the source has more irregular chipped exterior edges, warmer/lighter weathered mineral facets, glassy purple crystal depth and a richer fitted bronze guard. V9 retains overly regular broad mineral divisions, some exaggerated straight pale bevel lines, a uniform purple channel and a simplified dark guard. Leather grain/cross-wrap and pommel layering remain less intricate than the reference. The render proves geometry/material changes, not exact visual parity or production readiness. Grip/stow fit, evaluated/exported geometry, GLB validation, engine imports, LODs and performance must be retested before promotion.

The diagnostic-first-pass folder preserves rejected darker preview renders; only amethyst-short-blade/ contains final renders. All final files are listed in REVIEW_EVIDENCE.json. No original images were modified.
