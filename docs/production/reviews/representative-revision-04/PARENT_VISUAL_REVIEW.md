# Revision 04 bounded independent visual review

Commit: ef28c950ecaae540d64674cc5c54af3c75360b97. Reviewed 2026-10-13 UTC. Read-only repository inspection; no repository mutation.

## Result

Zero final visual approvals. Kiln v6, Fault v10 and Impulse shield v8b show worthwhile targeted progress but still fail source-likeness acceptance. Prioritize authored shape corrections over adding more repetitive geometry or treating validator results as art approval. The author checkpoint documents also explicitly retain unapproved status.

## Evidence and limits

Inspected exactly four resized comparison sheets, each no larger than 1200 pixels in either dimension: Kiln front, Kiln profile, Fault source/front/profile, and shield source/front/stowed/hub. The Kiln sheets contain original reference-090 portrait crops beside frozen v5 and current v6. Fault and shield sheets include actual reference-053 and reference-032 source pixels beside current renders. All nine downloaded original render/source PNGs were verified against Git blob hashes at the pinned commit; verification is saved with the local evidence. Source images were only resized/assembled for inspection, not regenerated.

This is a bounded visual check, not a whole-package acceptance audit. Small hardware, microtextures and optical noise cannot be exhaustively judged at this display size. No mesh, GLB, animation, collision, wearer fit, GPU parity or device performance was tested. Kiln v6 is a focused head diagnostic: these images do not establish fresh full-body acceptance. Body/cape/bracer preservation is reported by the author and prior review, not newly inspected here.

## Kiln ninja v6: highest priority

### Preserve

The current face has actual nose and lip volume compared with the nearly featureless v5. Hair has fewer, broader directional locks instead of the previous dense uniform comb. Preserve the previously corrected cape direction and bracer asymmetry; they were outside this head-only image inspection.

### Required corrections, in order

1. **Seat the eyes and author the eyelids.** In the profile comparison, visible eye white stands proud of the facial silhouette rather than being contained by an eyelid. Front eyes remain narrow, almost horizontal slots with weak orbital depth. Recess the globe, wrap upper/lower lids around it, and establish canthi and brow/cheek transitions. Check both front and profile before more facial detailing.
2. **Correct the nose–mouth–chin silhouette.** V6 replaces the flat face with a blunt nose and a projecting two-step lip mound; the mouth reads as a pout. The reference has clearer bridge/alar definition, more restrained lip projection and an articulated jaw/chin. Reduce the mound and shape its transition into philtrum and chin rather than merely scaling isolated features. Do not assert precise anatomical ratios from these differently framed images or treat the collar-hidden model bottom as the reference’s visible chin point.
3. **Rebuild hair mass hierarchy.** Large regular swept plates remain the dominant read. The front crown shows open channels/rail-like strands over the cap; the side/back mass is too smooth and underarticulated relative to the source’s overlapping irregular clumps. Establish a continuous underlying mass, a small number of asymmetric primary locks, then narrower secondary breakup with varied termination. More repeated strips will not solve this.
4. **Refine facial planes after silhouette.** The cheek/jaw is a broad smooth triangular plane and the ear is a simple rimmed polygon. The source has more cheek, jaw-angle and ear structure. Resolve these before final skin finish.

Next acceptance evidence: one matched front and one true profile at equal useful head scale, with eye silhouette clearly readable. Only after these pass should a full masked/body/pose review be treated as worthwhile final-review evidence.

## Fault v10: geometry rhythm remains the blocker

### Preserve

The shell has visible chipped relief and local overlap around the aperture; bronze guard layering reads more constructed. These are real visual improvements, although the source still has much more irregular mineral structure.

### Required corrections, in order

1. **Break the repeated slab construction in depth.** Broad-side shell blocks still form repeated panel-like divisions, and the thin profile exposes nearly parallel stacked rails with repeated cross seams. Vary shell thickness, length, fracture direction, missing chips and overlap depth as a coherent fractured object. Cosmetic edge noise alone will leave the underlying repeated construction visible.
2. **Make the exposed crystal a changing fractured volume.** It remains a long continuous purple ribbon in front and a near-continuous purple rail in profile. The source has changing aperture widths, stone occlusion and interlocking crystal planes. Introduce larger purposeful facet/occlusion changes and richer local dark/light contrast; avoid a uniformly exposed strip. The render does not establish a gamma defect, and none is claimed.
3. **Match the compact irregular pommel and fitted guard.** The pommel is still a few large shell pieces surrounding one simplified purple center. The source is a small irregular stone/crystal cluster. Guard detailing should follow its fitted overlapping bronze forms rather than rely on a generic repeated collar.
4. **Recover leather identity.** The grip reads as broad regular dark bands. Match the source’s narrower layered brown wrap construction and controlled seam depth, then tune wear and roughness.

Next acceptance evidence: matched broad-side and thin-profile renders, plus one guard/pommel closeup under stable lighting. Static blade acceptance should focus on construction, material appearance and actual equipped grip/stow scale; do not add a deformation rig solely to increase deliverable counts.

## Impulse shield v8b: finish the mechanical specificity

### Preserve

Narrow stepped outer casing, diagonal panel divisions, visible hinges and segmented orange hub arcs are present. The stowed render shows broad dark reverse panel coverage; that is consistent with the stated v8b coverage repair. This does not establish rear straps or wearable fit.

### Required corrections, in order

1. **Resolve hub likeness.** The current closeup still reads primarily as a clean concentric bullseye with a central polygonal fastener. The source has a denser, more differentiated mechanical hub. Shape the spindle, stepped recesses, casing segmentation and surrounding small hardware according to source construction, avoiding more arbitrary concentric rings. Hub proportion is acknowledged as unresolved in the checkpoint; do not silently alter established mechanism dimensions to chase one painted view.
2. **Finish casing/service hardware.** Large dark panel fields and simple central rails dominate the front and stowed views. The source has more layered housings, inset edges and distinct mounting/service features. Work from matched exterior/component crops to place those features deliberately, retaining the improved narrow casing and diagonal divisions.
3. **Differentiate surfaces after geometry.** Current finish remains broadly even dark gray/light gray with salmon-colored accents in these renders. The source has stronger material and wear differentiation, including dark cavities, contrasting edge highlights and weathered orange pieces. Adjust material response under controlled lighting before deciding whether raw base colors are wrong; these images do not diagnose color management.
4. **Keep reverse/wearer acceptance separate.** Request a matched reverse view showing strap attachment and side clearance, then wearer fit and continuous motion evidence. None is established by the selected front/stowed/hub images or by sampled collision reports alone.

The reference’s 25 cm label is horizontal stowed width, not collapsed height. No longitudinal telescoping requirement is supported by that annotation. Retain that correction; current 95 cm constant height is not rejected solely on this basis.

## Pinned source locations

Base: https://github.com/jrmoyler/Aetherion-The-Fifteen-Oaths/tree/ef28c950ecaae540d64674cc5c54af3c75360b97/docs/production/reviews/representative-revision-04

- Kiln: kiln-ninja-v6/front-comparison.png and profile-comparison.png.
- Fault: fault-v10/reference-053.original.png; amethyst-short-blade/matched-front-review.png and matched-profile-review.png.
- Shield: impulse-shield-v8b/reference-032-original.png; deployed-front.png; stowed-hero.png; hub-closeup.png.

Local inspection evidence is in revision04/ beside this report, with pixel-source-verification.json recording the pinned Git blob verification.
