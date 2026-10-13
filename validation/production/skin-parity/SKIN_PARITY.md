# Scoped CPU skin comparison

Published revision: 429dc57a1c9748d0e0835504d116bd9112c8dfd7. 6/6 sampled poses agree within 0.0001m; maximum difference 0.000024028891984012976m.

**This compares imported-data CPU weighted vertices. Native Godot RenderingServer/GPU skinning is not certified.**

| Asset | Clip midpoint (s) | Skinned vertices | Max world error (m) | Moved skinned vertices (Three/Godot) |
| --- | ---: | ---: | ---: | --- |
| kiln-ninja-ensemble-candidate | 1 | 11197 | 0.000024028891984012976 | 7459/7459 |
| tidal-tide-orb-staff | 1.0166666507720947 | 1000 | 0.00001244409809619506 | 1000/1000 |
| oath-06-folding-battle-fan | 1.0166666507720947 | 2192 | 0.000008733905506856208 | 2130/2130 |

All 3 intentional +1cm world-translation fixtures were rejected. Coordinates remain identity-mapped XYZ meters with no fit or rescaling.

- Only three fixed published assets, rest and one clip midpoint each; not all assets/poses/LODs.
- Godot results use explicit linear blend skinning from imported mesh arrays, Skin binds and Skeleton3D global poses. Native bake unavailable: headless RenderingServer has no valid skeleton RID.
- Three.js texture loading is replaced with CPU Texture objects; no appearance, texture decode, normal/tangent or shader parity.
- Normals, morph targets, attachments, retargeting, nonuniform runtime scaling, GPU skinning and Unreal are not certified.
- Passing these samples does not dismiss NODE_SKINNED_MESH_NON_ROOT or generated-tangent warnings, and grants no production/art approval.

[Full measurements, input hashes and evidence checksums](SKIN_PARITY.json). Complete rest/animated vertex samples are retained in the two gzip files. Reproduce using [the runner](../../../tools/production/skin-parity/README.md).
