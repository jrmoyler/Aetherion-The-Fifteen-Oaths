# Bitterglass Guild weapon production candidates

Original low-poly derivative assets authored after inspecting actual reference-047 pixels. Status: **PRODUCTION_CANDIDATE_UNREVIEWED**. No family closure or approved matching-art claim.

Each design includes an editable packed Blender 4.3.2 source, UV-unwrapped textured GLB, separately reduced LOD1/LOD2 GLBs, untextured convex pickup collision, 512px PBR maps and actual front/side/hero CPU Cycles renders. 96 samples, denoising disabled. Dimensions are meters in Blender Z-up; glTF exports Y-up. Grip origins and named grip, belt and tip sockets are proposed attachment locations, not verified character fit.

The focus includes a real 3mm transmissive glass shell (KHR_materials_transmission 0.92 and IOR 1.45), a separate lower liquid mesh and four internal bubbles. Transmission is verified in GLB bytes; runtime renderer optical parity is not yet verified. CPU transmission render noise remains visible.

Scripts in tools/production/authoring reproduce actual artifacts; use Blender background with --threads 2. The manifest records exported triangle counts, not generator estimates. Shared textures are not additional asset designs.

Remaining gates: owner art review, reference ornament/detail refinement, ergonomic scale and character grip/stow integration, damaged states, runtime engine material/import/animation parity, LOD transitions, collision gameplay validation, secondary motion, sound and VFX. The static colliders are broadphase candidates, not certified strike hitboxes.
