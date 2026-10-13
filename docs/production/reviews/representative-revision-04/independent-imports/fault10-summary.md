# Fault V10 independent import check

Frozen source and GLB hashes match the author receipt. All tested source/GLB bytes remained unchanged.

- GLB SHA256: `6cd472308714dfd488dee23aeb82b3ff8fca711514342b16a15fe15da199d53c`.
- Source SHA256: `f968b3ad0ff1a2ed3bf6c8ebe09de2f06f8304a18047801c2c154630c1e86d3c`.
- Full Khronos validation has zero errors and zero warnings; all informational issues retained in `fault10-glb-validator-details.json`.
- Actual Blender 4.3.2 source open and GLB import succeeded.
- Actual Godot 4.6.3 import generated and instantiated a scene.
- Three.js GLTFLoader actual geometry CPU import succeeded. Texture loader uses explicit placeholders; no Three.js image decode or rendered-material verification claimed.
- Static asset has no skin or animations; no rig expected.

This scoped import evidence does not certify GPU behavior, reference fidelity, materials, LOD/collision completeness or gameplay. No source files were rewritten.
