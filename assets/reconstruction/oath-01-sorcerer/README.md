# Kiln sorcerer reconstruction

Status: three-character Blender continuation integrated; full reference-fidelity acceptance remains open. See [continuation review](../../../validation/reconstruction-continuation/REVIEW.md) and `blender-continuation.json`. The external mesh-generation attempt below remains unsuccessful; subsequent work uses direct Blender/Three.js reconstruction.

`source-front.png` is an isolated, generated interpretation of the leftmost front view in `assets/references/reference-091/original.png`. The original sheet remains the authority for identity, proportions, rear equipment and construction. The new image is input for reconstruction, not evidence of runtime quality or an exact crop.

The proposed reconstruction job uses fal.ai Hunyuan 3D Pro image-to-3D, PBR enabled, with a 100,000-face target. The user explicitly authorized transfer to fal.ai. The subsequent submission failed with HTTP 403 `balance_exhausted` on account `Jr Moyler`. No 3D result was produced. See ANALYSIS.md and assessment.json for the img2threejs checkpoint and outstanding acceptance gates.

## Integration requirements

A generated static mesh is not a finished game character. Before replacing `game/public/assets/characters/oath-01-sorcerer.glb`:

- Compare front, back and side renders against reference-091, including face, cloth layers, apron borders, straps, buckles and the kiln backpack.
- Fit and skin the body to the game skeleton; keep backpack rigid to the upper torso and preserve hands, skirt and elbow deformation.
- Supply the locomotion, combat, casting, reaction and death clips used by the actor controller; verify them in the game, including contact timing.
- Export the glTF scene extras `{"aetherion":{"presentation":"authored-v1"}}`. This preserves the reconstructed face, hair, clothing and authored materials; legacy assets continue through the old presentation pass.
- Review material maps, scale, ground contact, memory, draw calls and crowd cost. The generation polygon target is not a Steam Deck performance certification.

The runtime contract test covers preservation of authored geometry/materials, independent animation instances and spawn fading. It does not establish visual fidelity. The roster, NPC and environment reconstruction remain unfinished.
