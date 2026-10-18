# Character faces, hair and face gear — procedural groom pass

The shipped hero GLBs have blobby SDF heads with auto-unwrapped textures, so close-ups read as clay. This pass replaces the head at runtime with a fully procedural head built in Three.js. It is fitted to each rig's `head` bone in bind space, so every authored clip drives it unchanged.

## What runs (`game/src/three/character/`)

| File | What it does |
|---|---|
| `profiles.js` | 30 descriptors taken from the NINJA/SORCERER panels of `assets/references/reference-099..113` (099 is Oath 14, 113 is Oath 01). Each records sex, age, skin, iris, hair style and colour, beard, and the face gear worn. |
| `head.js` | Analytic sculpt on a dense sphere: superelliptic cranium, tapered jaw, brow ridge, orbital sockets, nasal bridge/tip/alae, cheekbones, philtrum, lips, chin and mandible angle. Proportions follow anthropometric thirds (nose base at −.22H, mouth at −.3H). Real eyeballs sit behind almond lid shells, and the iris and sclera are shaded procedurally with a clearcoat cornea. The skin shader adds pores, lip/cheek/lid colour zones, painted brow base, cavity occlusion, stubble, age lines and a wrap-lighting subsurface term. |
| `hair.js` | Opaque scalp layer with an alpha-tested natural hairline, plus strand cards grown along per-style flow fields: slicked into a bun, topknot, ponytail or braid; short, coily, messy, swept, or long. Also beards (goatee, full, braided), brows and lashes. Each card carries ~26 strands of individual length and width, and shading is dual-lobe Kajiya-Kay along the strand tangent. |
| `gear.js` | Face equipment as parametric patches over the head surface: cloth wraps, porcelain/wood faceplates, cracked half-mask, lacquer helm with shaded slits, Folded Theatre blade mask, gold eye-mask, brass plate, beak, respirator, cap, hoods with shoulder drape and moss tufts, goggles, visor, glasses, earrings. |
| `surface.js` | Rest-space micro-surface programs (skin, weave, leather, wood, brushed metal, porcelain, lacquer) with screen-derivative bump and aliasing fade. |
| `groom.js` | Culls the old head (head/neck-weighted triangles in the skull volume, plus head-borne crests above the brow) and hides the painted iris/pupil discs. Attaches the kit and upgrades the garment atlas to physical cloth/metal shading: roughness floor, albedo-tinted sheen, rest-space weave/brushing, hem grime. |

Geometry is cached per hero and quality tier. Materials are per actor, so fades never leak between actors. The `low` tier uses about a third of the head vertices and about 45% of the hair cards.

## How to look at it

```sh
npm --prefix game run dev
# http://localhost:5173/inspect.html?id=oath-13-ninja&view=face|full|back&yaw=0.5[&nogear][&nohair][&q=low]
```

`face-gallery.jpg` and `body-gallery.jpg` in this folder are SwiftShader (CPU WebGL) renders of all 30 heroes from that page.

## Checks

- `node --test game/src/three/character/character.test.mjs` checks three things. Every shipped hero has a profile. Every hero builds a finite head, groom and gear kit on the low and high tiers. The low tier is cheaper.
- The existing model-contract, VFX, boost-aura, source-target and architecture tests still pass.

## Still short of the concept art (honest)

- The bodies are still the original SDF garment meshes with auto-UV atlases. Only their shading was upgraded; layered armour, straps and folds from the sheets are not modelled.
- Faces are one parametric family. Individual likeness (e.g. the Shadow sorcerer's gaunt cheeks), expressions and eye gaze are not authored. Hair is cards, not groomed strands, and there are no physics.
- Gear covers the signature silhouette of each sheet, but not every ornament (no ear-cuffs, hairpins beyond the profile, or twig crowns on the Graft sorcerer).
- All captures are SwiftShader. Real-GPU frame time with a full crowd of groomed heroes has not been measured.
