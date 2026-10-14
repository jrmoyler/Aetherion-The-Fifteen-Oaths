# Kiln ninja character candidate

One proposed character ensemble member, linked to `asset-o01-a-characters-family`. It does not complete the family, its civilian/sorcerer/militia variants, facial-expression family or animation family. Final-art approval is open.

The author inspected the actual pixels of `reference-090` (front/back/profile/three-quarter turnaround, face and materials) and `reference-060` (armor assembly and movement guide). The candidate preserves the lean masked figure, asymmetrical black firecloth shoulder cape, horizontal fired-terracotta chest plates, unequal forearm equipment, bloused trousers, dark shin protection and ceramic boot fasteners. These observations guide new authored geometry; no reference image bytes or source castable behavior changed.

The editable, packed, uncompressed Blender source contains a tailored ring-mesh humanoid, separate armor/component geometry joined into a textured character, a 38-bone humanoid/hand skeleton, weighted deformation and three authored clips. The PBR atlas supplies base color, packed occlusion/roughness/metallic and tangent normal maps at 1024 × 512 pixels. LOD1/2 remain skinned and animated. Collision is a separate coarse proposed navigation hull, **not** calibrated combat hitboxes.

## Actual review and refinements

The first rendered inspection exposed nonplanar chest-plate tessellation and a contact-sheet resize that doubled the displayed width. The chest bands now use explicit curved quads, and the final sheet preserves the original image aspect ratio. The individual source renders never used the stretched ratio. Following correct-aspect review, trouser thigh cross-sections were narrowed by 10%, and sleeve shoulder radii reduced from 0.081 to 0.066 m to soften the angular shoulder peaks. Tangent-compatible triangulation is explicit in the final source.

Body height is approximately 1.81 m (proposed authoring scale); exported manifest dimensions include the relaxed A-pose hands, so full bounding-box width is not shoulder width. The source torso shoulder half-width is 0.221 m. Dimensions are authored estimates, not measurements printed on or calibrated from the reference artwork.

The pose contact sheet is four columns by four rows. Top row: front, back, profile, three-quarter rest views. Second row: idle frames 1/13/25/37. Third row: walk frames 1/9/17/25. Fourth row: cast frames 1/13/25/37. Each thumbnail preserves the source 5:6 aspect ratio. Every frame is a real CPU Cycles render with denoising disabled.

## Remaining fidelity and gameplay gates

- Face likeness, eyelid expression and less stylized hair clumps need further art review; there is no facial speech/expression rig.
- Cape folds, shoulder transitions and cloth simulation/collision remain simplified. The cape follows the chest, with no cloth solver or cloth bones.
- Fabric gathering, stitched edges, ceramic pore scale, material weathering and small bracer latches remain less detailed than the painted references.
- Idle, walk and cast are authored candidate clips, not retargeted replacements for the 100 existing source castables. Foot placement, ground contact, interruptions, hit reactions and source timing remain gameplay gates.
- Hand grips and `grip_primary`, `cast_origin`, `hit_reference`, `stow` sockets need calibration with actual equipped weapons and runtime effect attachments.
- LOD transition appearance, navigation/collision fit, accessibility and representative-device performance need runtime measurement. Engine support is not inferred from exports or source renders.

Reproduce with `blender -b -t 2 --python tools/production/authoring/kiln_ninja.py`. Verify actual saved-source opening and GLB imports with the same command plus `-- --verify`. `rig-evidence.json` records actual vertex-weight and evaluated-pose checks; `blender-import-evidence.json` records scoped Blender imports with exact file hashes. These checks do not establish Unreal, Godot or Three.js visual parity or final artistic approval.
