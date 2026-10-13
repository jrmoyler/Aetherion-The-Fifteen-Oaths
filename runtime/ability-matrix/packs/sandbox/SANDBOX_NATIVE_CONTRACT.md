# Writing a native Sandbox ability (Matrix New / Ability Atlas)

The `sandbox` pack is the one unified ability sandbox. Its engine is a copy of the `collective` pack's engine, itself a fork of the `linear-extended` engine (achrefelouafi's
LinearAbiltyCastingExtendedThreeJS, MIT). Every engine system — particles, decals,
bursts, lights, shake, flash, distortion layer, dummies + ragdolls, VFX editor,
aim indicator — is the original code, untouched. Three sets of native abilities plug into it: Matrix New (`<set>` = `matrix-new`), Ability Atlas (`<set>` = `atlas`) and Elemental Codex (`<set>` = `codex`, whose `meta.element` must match `src/config/elements.js`). Twelve finished abilities built to this exact contract already live in the same pack — `src/abilities/collective/*Ability.js` with materials in `src/materials/collective/` — read at least two of them as worked examples of the bar (e.g. TempestSpiralAbility and CrimsonRiteAbility). Do not copy their designs.
The bar is **the quality of the originals**: hand-written GLSL, fully procedural (no
textures, no new model files), every number a live editor slider, pooled and
allocation-free per frame.

Read these before you write a line (they are the reference implementations):

- `src/abilities/Ability.js` — base class, phase machine, light handling.
- `src/abilities/VenomSurgeAbility.js` — the style bar for a line cast: records
  that store only dice, everything resolved from `settings[id]` every frame.
- `src/abilities/WardAbility.js` or `src/abilities/AstralVoidAbility.js` — zone casts.
- `src/abilities/ArborBloomAbility.js` — an ability that picks its own targets
  (`handlesOwnHits`, `ctx.dummies.findTargets`, `dummy.kill`).
- `src/materials/VenomCoreMaterial.js` — material factory pattern
  (`material.userData.sync(...)` reads settings → uniforms).
- `src/materials/ToxicMistMaterial.js` → `createAcidFumeMaterial` — a distortion proxy.
- `src/ui/Editor.js` → `_buildVenom()` — editor folder style.
- `src/config/settings.js` → the `venom:` block — settings block style (comments!).

## Files you own (only these)

For ability `<id>` with class prefix `<Name>`:

1. `src/config/<set>/<id>.js` — **data only, no imports**. Keep the `id` and
   `meta` exactly as given (you may improve `hint` wording and `glyph`). Expand
   `settings` into a full block: every dimension, colour, timing, count. Keep keys
   `range`, `minRange`, `speed`, `lifetime`, `cooldown`, `castAnim`, `lightColor`,
   `lightIntensity`, `lightRadius`, and `zoneRadius` for zone casts. Colours are
   `'#rrggbb'` strings. Comment the block like `settings.venom` is commented.
2. `src/abilities/<set>/<Name>Ability.js` — must export:
   - `export const ID = '<id>';`
   - `export class <Name>Ability extends Ability { constructor(ctx) { super(ID, ctx); } … }`
   - `export function buildEditor(gui, c, Editor) { … }` — one top-level folder
     `gui.addFolder('<glyph-ish unicode>  <Label>')`, sub-folders per layer, use
     `Editor.range(folder, c, key, min, max, step, label)`,
     `Editor.castAnimation(folder, c)`, `Editor.gradient(folder, c, prefix, title)`
     (needs keys `${prefix}A..D`), `folder.addColor(c, key)`. Expose **every** key.
3. Optional: `src/materials/<set>/<Name>*.js` for material factories, and
   `src/assets/<set>/<Name>Geometry.js` for procedural geometry.

Do **not** edit any other file. Do not touch the other abilities' files. Delete the
`import … from '../collective/_stub.js'` line from your ability file (the stub is shared, leave it).

## The contract the engine gives you

`this.ctx` (see `AbilityManager`, `core/App.js`):

| key | what |
| --- | --- |
| `scene`, `camera`, `environment` | three objects; `environment.equirect` is the HDR texture, `environment.registerShadowCasterWithPatch(...)` is how VenomCrystalMaterial makes a patched mesh cast correct shadows (read it before copying); `frame.uEnvMap` is the equirect for cheap reflections in custom shaders |
| `particles` | `ParticleEngine`. `particles.get(name, { capacity, shape: ParticleShape.SOFT/SMOKE/STREAK/LEAF/CHIP/RING/BUBBLE/DROPLET, additive, curl, stretch, swirl, lit, softFade })` → shared `ParticleSystem`. Name it `'<id>.<layer>'`. Set `system.uniforms.uDrag/uEndSize/uSizeIn/uFadeIn/uFadeOut/uGravity/uSizeScale/uLifeScale/uSpeedScale/uOpacity/uGlow/uTurbulence/uStretch/uSwirl…` and `system.setGradient(c0,c1,c2,c3)` every frame from settings. `system.emit(count, { position, radius, direction, speed, speedVariance, spread, inherit, anchor, size, sizeVariance, life, lifeVariance, spin, tint, time: frame.uTime.value })` — reuse one module-level `_emit` object. `RateEmitter` (from `particles/ParticleEngine.js`): `new RateEmitter()`, `.tick(dt, rate)` → whole count to emit, `.reset()`. |
| `decals` | `decals.spawn(DecalType.SCORCH/RIPPLE/CRACK/SHOCKWAVE/DUSTRING/FOAM/FROST/ARC, pos, { radius, life, colorA, colorB, intensity, width, growth, height })` |
| `bursts` | `bursts.spawn(BurstMode.FIRE/WATER/AIR/EARTH/FROST/STORM, pos, { radius, endRadius, life, intensity, opacity, fresnel, displace, turbulence, colorA, colorB, colorC, squash })` |
| `lights` | handled by the base class from `lightColor/lightIntensity/lightRadius`; punch it with `this.lightBoost = …` |
| `shake` | `shake.add(amount, decay, frequency)`, `shake.rumble(amount, dt)` — always × `settings.global.cameraShake` |
| `flash` | `flash.trigger(color, strength)` — × `settings.global.explosionIntensity` |
| `dummies` | `DummyField`: `findTargets(x, z, radius, out)` (alive, nearest first), `findBodies(x, z, radius, out)` (incl. corpses). A `Dummy` has `alive`, `position`, `kill(dirX, dirZ, force, slice=false)` (force = `settings.dummies.hit`-shaped `{impulse, lift, spin}`; returns bool), `carry(field, grab, grabY, buoyancy)`, `sink(depth)`, `release()`, `consume(amount)`, `corrode(amount, look)`, `bodyPoint(out)`. Read `combat/Dummy.js` before using carry/sink/release. |
| `character` | the `CharacterController` (`position` getter → its root position Vector3, `setFacing(yaw)`, `root`). Only Voidstep Rift (matrix-new), Parallax Blink and Chrono Recall (atlas) should move it; others may read it. `src/abilities/collective/BlinkStepAbility.js` shows the safe hide/move/restore pattern. |
| `models` | loaded models (only the serpent here) — do not depend on it |

Base class (`Ability.js`): `spawn(origin, direction, distance)` resets state then calls
your `onSpawn()`. Phases: `onTravel(dt)` while the front runs to the target at
`speed` m/s (`this.u` 0→1, `this.position`), `onImpact()` once, `onFade(dt, t)` with
t 0..1 (impact phase, length `impactDuration`) then 1..2 (fade, `fadeDuration`).
Override `impactDuration`/`fadeDuration` getters from settings (× `settings.global.lifetime`).
`pointAt(s, out)`, `this.direction`, `this.side`, `this.origin`, `this.length`.
`get instanceCount()` for the HUD. `onDestroy()` must hide everything and leave the
instance reusable (pooling: `spawn` must fully reset, no allocation in spawn/update).
`dispose()` frees GPU resources then `super.dispose()`.

Hits: by default `DummyField.applyHits` kills along the line (line casts) or inside
`zoneRadius` once `u >= 1` (zone casts). If your ability picks targets / delays /
holds bodies, return `true` from `get handlesOwnHits()` and call `dummy.kill` yourself.

Layers (`core/Layers.js`): solid meshes `LAYER.WORLD` (depth prepass, shadows),
additive/transparent effects `LAYER.VFX` (the group already is), screen-space warp
proxies `LAYER.DISTORTION` (fragment writes `vec4(dir * 0.5 + 0.5, strength, mask)`,
NormalBlending, depthWrite false — copy `createAcidFumeMaterial`).

Shaders: `import { noiseGLSL } from '../../shaders/lib/noise.glsl.js'` (snoise, snoise01,
fbm3, fbm4, ridged, curlNoise, voronoi2, rot2, hash11/21/31/13) and
`commonGLSL` (softFade(depth, uv, viewZ, near, far, dist), fresnelTerm, dissolveMask,
gradient4, aastep). `sharedUniforms({...})` from `core/FrameUniforms.js` gives
uTime, uResolution, uSceneDepth, uCameraNear/Far, uLightDir, uShaderIntensity,
uGlobalGlow. `toneMapped: false` on emissive materials; bloom picks up values > 1.

Globals: multiply by `settings.global.*` the way VenomSurge does (glow, opacity,
particleCount, particleSize, particleLifetime, particleSpeed, noiseStrength,
noiseFrequency, noiseSpeed, turbulence, randomness, distortion, fresnel,
explosionIntensity, cameraShake, lifetime, animationSpeed, shaderIntensity).

Paths from `src/abilities/<set>/`: `'../Ability.js'`, `'../../particles/…'`,
`'../../effects/…'`, `'../../core/…'`, `'../../config/settings.js'`, `'../../utils/math.js'`
(clamp, saturate, lerp, invLerp, remap, smoothstep, damp, randRange, randSign, hash11,
Easing.{linear,inQuad,outQuad,inOutQuad,inCubic,outCubic,inOutCubic,outQuint,outExpo,outBack,outElastic,pop},
envelope), `'../../utils/color.js'` (getColor(hex) → shared Color — copy it, don't keep it).

## Quality checklist

- At least 4 distinct visual layers (e.g. a custom-shader hero mesh, a ground
  treatment, 2–3 particle systems, a burst/decal/shockwave, a distortion proxy).
- At least one bespoke `ShaderMaterial` with real GLSL (noise-driven, fresnel,
  dissolve, soft fade) — not just MeshStandardMaterial.
- Anticipation → travel → impact → linger → graceful exit. Nothing pops.
- Camera shake / flash / light punch on the beat, all scaled by the globals.
- Every value live in the editor; changing it mid-cast updates the effect.
- No allocation in `spawn`/`update` (module-level scratch vectors, pooled records,
  fixed `MAX_*` capacities).
- Documented like the originals: a class comment that explains the layers and the
  decisions, short comments on the non-obvious lines.

## Verify

From `packs/sandbox`: `npx vite build --logLevel error` must pass (other
people's files may be mid-edit; if the only errors are in files you don't own,
wait 30 s and retry). Also run `node --check` on your files. Report: files written,
settings keys, layers, and anything you could not do.

## Sandbox-specific notes

- `src/vendor/` is being filled in parallel with the five source repos' engines. Never import from it or edit it.
- Other builders are writing other abilities in the same pack at the same time. A full build can fail on a file you don't own; that is not your problem — retry later, and rely on `node --check`, offline GLSL compilation and a mock-context harness of your own (in your scratch directory, never in the repo) to prove your files.
- Build to a scratch outDir (`npx vite build --logLevel error --outDir <your scratch dir>`), never the pack's `dist`.
