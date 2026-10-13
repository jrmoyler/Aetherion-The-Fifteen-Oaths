# Fault Choir weapon production candidates

Two original derivative meshes authored after inspecting the actual reference-053 construction sheet: Amethyst Short Blade and Amethyst Seer's Mace. Both remain **PRODUCTION_CANDIDATE_UNREVIEWED**. This does not close the weapon family or certify matching artwork.

Each asset contains editable Blender 4.3.2 source with packed textures, UV-unwrapped geometry, a textured GLB, two separately exported decimated LOD GLBs, one untextured convex pickup collision GLB, and actual CPU Cycles front/side/hero renders. Shared 512×512 base-color, normal, roughness and metallic PNGs exist for four materials. GLB metallic/roughness channels are packed by Blender's exporter. The low-poly crystal uses opaque faceted PBR rather than transmission, preserving portable material behavior; optical crystal fidelity remains a review limitation.

Geometry is authored around Z in Blender; meters are proposed human-scale measurements, not approved ergonomics. Origin is primary grip center. Export converts to glTF Y-up. Named empties `SOCKET_grip_primary`, `SOCKET_belt_stow`, and `SOCKET_effect_tip` preserve intended attachment positions. Grip center is not an animated pose. These static weapons correctly have no skeleton or animation clips. Source mesh components remain independently editable. The collider is for pickup broadphase, not a certified strike hitbox.

Authoring is reproducible from the repository root:

```sh
blender -b -t 4 --python tools/production/authoring/fault_weapons.py
```

The manifest reports actual exported indexed triangle counts and Blender-coordinate dimensions. Renders use CPU Cycles, 96 samples and denoising disabled. Contact sheet rows are blade then mace; columns are front, side, hero.

Visual review changes: blade seam narrowed and subdivided with exposed mineral facets; stone outlines chipped and staggered; mace shell opened over the crystal core, reduced crown extension, variable smaller stone plates and darker fissure textures; brown leather wrap retained. Reference has finer bronze ornament, more natural stone edge abrasion, layered crystal translucency and explicit belt/hand illustrations. These remain differences requiring further art direction and approval.

Still missing: character-fitted carried/stowed variants and poses, damaged geometry state, approved scales and ergonomics, engine import/render/runtime parity, in-game LOD transitions and collision checks, sound/VFX response and owner art approval. This candidate set is not the full weapon-family production scope.
