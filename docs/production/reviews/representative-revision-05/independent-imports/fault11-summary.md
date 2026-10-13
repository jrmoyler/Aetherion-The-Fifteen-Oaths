# Independent Fault V11 import verification

SCOPED CPU CHECKS PASS. All 21 frozen geometry inputs matched the initial geometry receipt at test time. The later final 57-file freeze also matches completely: `REVIEW_EVIDENCE.json` SHA256 `73263c00288a2e407e949fb34aa9b37d533bc6740127c82f662b33c228071a47`. Only geometry receipt status metadata changed after rendering; tested source/export bytes remained unchanged.

- Actual Blender source opening and GLB reimport both load 147 meshes with finite evaluated coordinates; no source bytes changed.
- Godot 4.6.3 headless instantiates 147 meshes and 7 materials, with no skin or animation expected for this static weapon.
- Three.js GLTFLoader CPU geometry checks pass. Khronos reports zero errors, zero warnings, and six UNUSED_MESH_TANGENT informational messages.
- Static world bounds match both Blender source and GLB reimport within 0.0001 m tolerance; deliberately translated 1 cm negative fixtures are rejected. Animated-bound tests are not applicable to this static asset.
- Imported glTF dimensions: approximately 0.118945 × 0.773522 × 0.080125 m; these are measured candidate dimensions, not approved canon measurements.
- Source SHA256: `91120936be7aa8ef2643d19c04cf59af710d4d45900e1c7770677aee27265c59`.
- GLB SHA256: `f704cbdc1b3364e0902dcd2ddd944f834ad9b183f5385c903559b8892db1e8af`.

These are CPU/headless structure and import checks. Three.js substitutes placeholder texture objects; no GPU appearance, crystal optical parity, exact per-vertex identity, collision behavior, Unreal compatibility, gameplay or visual acceptance is established.
