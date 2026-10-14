# Independent Fault V13 verification

SCOPED CPU CHECKS PASS. All21 geometry inputs and all48 final listed files (19,632,456 bytes) match their freeze manifests. Geometry receipt SHA256 `def945d39ef95f5bcb90a2db8c06353ca6febca330935913d4b35c9b4f087bd7`; final REVIEW_EVIDENCE SHA256 `8948b0d41c7d77be6ead6a5991099b647fae2e02cf8272a65d9075c9db8439ea`.

Actual Blender source opening and GLB reimport, Godot4.6.3 headless instantiation (167meshes,7materials), and Three.js CPU checks pass with unchanged source/export bytes. Khronos reports zero errors, zero warnings and six UNUSED_MESH_TANGENT informational messages. Static source/GLB-reimport/Three bounds agree within2.33e-10m; deliberately translated1cm negative fixtures reject. No rig/animation expected for this static weapon.

Source SHA256 `a1b1b9a506ef09ec48d20b9ecdd3f8a544741c81b8e17768684827ca7494178b`.
GLB SHA256 `c81ccea3e213aa5da0c6231a6dd7f2f05c02ba41d4132342243035549899ba14`.

All63 prior V12 freeze files were also checked and remain byte-identical. V13 bounds equal V12 bounds; V13 is a distinct authored candidate. Source-face triangle totals and modifier-applied export totals are different quantities and are not treated as an unexplained parity claim.

No GPU optics/material appearance, exact per-vertex identity, collision fit, Unreal compatibility or art approval is established. Three.js CPU tests substitute texture objects. Pixel review remains separate.
