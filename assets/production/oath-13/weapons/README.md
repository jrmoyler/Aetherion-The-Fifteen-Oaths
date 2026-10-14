# Folded Theatre weapon production candidates

Original low-poly derivative assets authored after inspecting actual reference-036 and 037 pixels. Status: **PRODUCTION_CANDIDATE_UNREVIEWED**. No family closure or approved matching-art claim.

Each design includes an editable packed Blender 4.3.2 source, UV-unwrapped textured GLB, separately reduced LOD1/LOD2 GLBs, untextured convex pickup collision, 512px PBR maps and actual front/side/hero CPU Cycles renders. 96 samples, denoising disabled. Dimensions are meters in Blender Z-up; glTF exports Y-up. Grip origins and named grip, belt and tip sockets are proposed attachment locations, not verified character fit.

This set has three distinct designs: ceremonial rapier, mirrored baton and four-panel mirror codex. Codex rigid panels are skinned to 4 hinge bones with a 48-frame fold/open demonstration. Closing overlap clearance and reflection parity need review. Illustration nominal dimensions informed construction; overall tassel dimensions extend beyond hard-body measures.

Scripts in tools/production/authoring reproduce actual artifacts; use Blender background with --threads 2. The manifest records exported triangle counts, not generator estimates. Shared textures are not additional asset designs.

Remaining gates: owner art review, reference ornament/detail refinement, ergonomic scale and character grip/stow integration, damaged states, runtime engine material/import/animation parity, LOD transitions, collision gameplay validation, secondary motion, sound and VFX. The static colliders are broadphase candidates, not certified strike hitboxes.

Actual `mirror-codex/hinge-pose.png` shows the frame20 folded pose. Review confirms the panels rotate and fold. The baton has visible grip overlap with its central shaft; end-grip layout, finer mirror faceting and polished reflection appearance remain art-refinement gates.
