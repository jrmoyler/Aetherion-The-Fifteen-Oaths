# Oath 07 weapon candidates

PRODUCTION_CANDIDATE_UNREVIEWED. Actual original reference-049 pixels inspected before authoring. These two assets do not close the weapon family.

Living twig bow has individually modeled bark ridges, twigs, leaf clusters, split sap housings and a deforming string/limb draw clip. Sapseed staff has a twisted shaft, helical vine, branching leaves, seven-part seed husks, subsidiary pod and actual root feet. Bow damaged state removes the broken string; staff loses its subsidiary sap heart. Carried states are static snapshots awaiting host docking.

Each includes packed editable Blender source, external512PBRmaps, actual UVs, LOD0/1/2GLBs, a damaged state, a carried snapshot and separate pickup envelope. CPU Cycles64sample front/side/hero renders use no denoiser. Static poses are not character-integrated animations. Dimensions and performance budgets remain proposed. See manifest remaining gates; no engine or owner approval implied.

Motion QA: bone-local Euler rotation initially produced twist instead of intended folding/bending on applicable rigs. The authoring sources now transform the intended world axis into each bone local space and key quaternion channels. Actual motion PNGs were inspected (fan closed, bow drawn, tassel/charm/chain offset). Engine gameplay/physics and self-intersection gates remain open. Final sources set render threads FIXED=2.

Final audit repair: bow dimensions now use the primary exported geometry, including evaluated shell thickness; shared authoring helper measures evaluated vertices rather than raw mesh bounds.
