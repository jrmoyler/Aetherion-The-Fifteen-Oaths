# Character motion and world geometry correction

This change improves the current Three.js runtime. It does **not** complete reference-identical characters, costumes, NPCs, creatures, or architecture, and is not a Steam Deck certification. The render comparisons still show simplified costume construction and stylized facial forms. Those gaps remain release blockers for the requested fidelity bar.

## Observed defects and implementation

- The thirty face profiles varied mostly in sex, width, age and complexion. Thirty explicit sculpt parameter sets now control jaw, brow, nasal projection/width, lips, chin, cheek and facial depth. These are interpretations, not measured reconstructions. NPC identity selects one of eight stable variations per costume rather than duplicating its hero's face exactly.
- Hair cards had triangle winding opposed to their outward normals. Double-sided lighting flipped those normals, producing dark, fragmented-looking hair. Winding now agrees with the outward surface. Opaque bun volumes close the silhouette under the strand cards; the hairline and strand coverage were adjusted.
- Exposed spherical eyes and separate spherical lid shells looked attached to the face. Almond eye patches and continuous lid annuli replace them. Morph-target lids blink independently per actor. Skin pore relief was reduced from a millimetre-scale bump to a much smaller scale.
- Authored basic-attack clips lasted roughly 1.1–1.4 seconds and could be restarted by the faster basic-attack cadence. Nonlinear retiming preserves every authored quaternion/position value while shortening windup, contact and recovery. The character briefly retains its combat stance after an action. Repeated hit events no longer restart an already playing reaction immediately. This is an improvement to the existing authored animation library, not a new motion-capture library; server damage timing is unchanged.
- Near terrain uses 40/80/128 subdivisions on low/medium/high, with cheaper distance bands. Perimeter skirts conceal LOD joins without changing shared collision heights. Tile density refreshes as the player travels. Weathered, smoothly shaded rock geometry replaces very coarse icosahedrons.
- Closed structural boxes between 0.5 and 12 metres receive real beveled edges. Thin/open construction preserves existing topology and all collision footprints remain unchanged. Templates are cached with a finite cap.

## Reference and runtime contract

Reference set: `assets/references/reference-099..113/original.png`, especially the Kiln sheet at `reference-113`. These sheets define the target, not the existing game screenshot. Costumes, weapons, body proportions and city layouts remain the existing authored assets in this PR. No engine or dependency version changes.

Heads, eyelids, hair and equipment follow the existing head bone. Skeletons, morph weights and materials remain per instance; immutable geometry is shared. Combat clip preparation clones and caches clips without changing source GLBs. Creatures retain their authored timing. Terrain uses the shared height function and instanced scenery.

## Verification

- 17 focused tests passed: all 30 faces on supported test tiers, independent rigs/materials, action interruption, contact retiming, NPC determinism, finite geometry, and all 15 city geometry/collision metadata.
- Production Vite/PWA build passed.
- Existing keyboard/mouse combat regression passed targeting, held attacks, techniques, authoritative damage, death and shrine respawn. No browser errors or failed HTTP requests.
- 1280×800 low-tier runtime capture passed actual keyboard attack motion checks. Recorded scene: 107 draw calls, about 546,000 triangles. See `validation/fidelity-pass/runtime.json` for the latest exact values.
- Tests ran on Chromium with SwiftShader, **not Steam Deck hardware**. The medium-tier run loaded the scene but timed out during screenshot capture. No hardware frame-rate claim is made.

Reproduce from repository root:

```sh
npm --prefix game ci
node --test game/src/three/fidelity.test.mjs game/src/three/character/character.test.mjs game/src/three/model-contract.test.mjs game/src/three/worldArchitecture.test.mjs
npm --prefix game run build
node game/test/fidelity-capture.mjs
node game/test/fidelity-runtime.mjs
node game/test/combat-upgrade.browser.mjs
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to the installed Chromium executable. Capture scripts otherwise use `/tmp/chromium`. For baseline comparisons, `CAPTURE_LABEL=before` serves modified source modules from `HEAD`; run it before committing, or set `FIDELITY_BASE_REF` to the PR base commit for a later comparison.

Evidence: `validation/fidelity-pass/before-characters.png`, `after-characters.png`, `before-face.png`, `after-face.png`, `gameplay-1280x800.png`, `combat-strike.png`, JSON reports and build/test logs.

## Remaining acceptance work

Full reference reconstruction requires correcting costume silhouettes, layered armor, accessories, body proportions and region architecture beyond these fixes, then reviewing every character/NPC/creature against its actual sheet. The new facial parameters are still stylized. Validate controller navigation, load time, memory and sustained frame times on a physical Steam Deck before calling this Steam Deck ready. High-tier terrain and beveled cities need that hardware profile before promotion to a performance claim.


## Reconstruction continuation

Three sorcerer assets now include Blender-authored costume components, front reference facial detail and solid hair geometry. See [implementation, current evidence, and remaining fidelity gaps](../../validation/reconstruction-continuation/REVIEW.md). This supersedes the earlier source-only Kiln preparation status; it does not close the complete roster/environment acceptance work.
