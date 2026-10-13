# Oath 10 weapon candidates

PRODUCTION_CANDIDATE_UNREVIEWED. Actual original reference-043 pixels inspected before authoring. These two assets do not close the weapon family.

Paired gravity flail uses individually interlocking alternate-plane chain links with an eight-bone idle articulation and two actual crater-depressed meteor weights. Orbital staff uses split broad astrolabe bands with raised brass rims/calibration studs and two moving orbital bones around a fixed dark blue starstone. These are original distinct constructions. Damaged flail loses one meteor body; damaged staff loses one band while exposing its trim. Chain physics, exact source filigree, starfield emissive detail and combat dynamics remain open.

Each includes packed editable Blender source, external512PBRmaps, actual UVs, LOD0/1/2GLBs, a damaged state, a carried snapshot and separate pickup envelope. CPU Cycles64sample front/side/hero renders use no denoiser. Static poses are not character-integrated animations. Dimensions and performance budgets remain proposed. See manifest remaining gates; no engine or owner approval implied.

Motion QA: bone-local Euler rotation initially produced twist instead of intended folding/bending on applicable rigs. The authoring sources now transform the intended world axis into each bone local space and key quaternion channels. Actual motion PNGs were inspected (fan closed, bow drawn, tassel/charm/chain offset). Engine gameplay/physics and self-intersection gates remain open. Final sources set render threads FIXED=2.

Final audit repair: removed the unrelated flail action from the staff authoring/export scene. Staff LOD0/1/2 and damaged GLBs now contain only Astrolabe_orbit; stowed/collision contain no animation. Scene reset removes stale actions to prevent recurrence.
