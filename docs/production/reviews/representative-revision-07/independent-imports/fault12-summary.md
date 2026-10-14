# Independent Fault V12 verification

SCOPED CPU CHECKS PASS. All21 geometry inputs match receipt SHA256 `733d8ccf27badc4567effa706b1dc16c77f4a873e86e2b1c2ab82bac138d15c9`.

Actual Blender source opening and GLB reimport, Godot4.6.3 headless instantiation and Three.js CPU geometry checks pass with unchanged input bytes. Khronos reports zero errors, zero warnings and six UNUSED_MESH_TANGENT informational messages. Static source/GLB-reimport/Three world bounds agree within2.33e-10m; deliberately translated1cm negative fixtures reject. No rig/animation is expected for this static weapon.

Source SHA256 `00f0a18351d2e92c47975c63b97a32947f7bb911a865bf37e1527d43870c3086`.
GLB SHA256 `63e190f7a2499a59a92f5662e4f33553bb6f2ea3fd6316f33e1b6c86d6e31a9c`.

These checks do not establish GPU optics/material appearance, per-vertex identity, collision fit, Unreal compatibility or art approval. Three.js CPU tests substitute texture objects. Final art renders are separate from this geometry receipt.

Final full freeze independently checked:63listedfiles20,815,515bytes; REVIEW_EVIDENCE SHA256 `6961cd329a0b962aef41168d062377d8c7fc493187a30466af361cbdb5b1e91b`. Geometry receipt status text changed after final rendering, while tested source/GLB bytes remain unchanged.
