# Sanguine Covenant weapon production candidates

Original low-poly derivative assets authored after inspecting actual reference-039 pixels. Status: **PRODUCTION_CANDIDATE_UNREVIEWED**. No family closure or approved matching-art claim.

Each design includes an editable packed Blender 4.3.2 source, UV-unwrapped textured GLB, separately reduced LOD1/LOD2 GLBs, untextured convex pickup collision, 512px PBR maps and actual front/side/hero CPU Cycles renders. 96 samples, denoising disabled. Dimensions are meters in Blender Z-up; glTF exports Y-up. Grip origins and named grip, belt and tip sockets are proposed attachment locations, not verified character fit.

The lash has a 13-bone articulated chain and the gauntlet has 15 bones: root, 12 finger segments and 2 thumb segments. Each has actual skin weights and an authored 32-frame flex/grasp demonstration. These are candidate motions, not character combat animations or certified deformations.

Scripts in tools/production/authoring reproduce actual artifacts; use Blender background with --threads 2. The manifest records exported triangle counts, not generator estimates. Shared textures are not additional asset designs.

Remaining gates: owner art review, reference ornament/detail refinement, ergonomic scale and character grip/stow integration, damaged states, runtime engine material/import/animation parity, LOD transitions, collision gameplay validation, secondary motion, sound and VFX. The static colliders are broadphase candidates, not certified strike hitboxes.

Actual `flex-pose.png` renders show frame16 of each clip. Review confirms finger curl and lash bending. Lash segments reveal small articulation seams; the reference's continuous braided-leather surface and gauntlet ornament density remain fidelity gaps. These demonstrations do not establish collision-free animation or character retargeting.
