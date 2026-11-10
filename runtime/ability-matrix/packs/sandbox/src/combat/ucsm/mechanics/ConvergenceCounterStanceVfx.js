import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  Points,
  ShaderMaterial
} from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { frame } from '../../../core/FrameUniforms.js';
import { LAYER } from '../../../core/Layers.js';
import { settings } from '../../../config/settings.js';

/**
 * Shared VFX kit for the Convergence, Counter and Stance mechanic families.
 *
 * The UCSM mechanics are drawn by `MechanicPresentation`, which owns the item
 * lifetimes (build on cue / sync, remove on expiry) and pools every geometry and
 * material on `v.geo` / `v.mat`, disposing them through `v.resources`. That
 * class is shared and stays as it is; this kit is what the three families use
 * *inside* their build functions to reach the bar the native casts set:
 *
 *  1. **hero surface** — a bespoke ShaderMaterial for the authored ribbons and
 *     facets: fbm filaments that run along the ribbon, a fresnel rim from a real
 *     normal, a root-to-tip reveal on the way in and a noise dissolve with a
 *     burning edge on the way out. Additive, `toneMapped: false`, so the hot
 *     core is above 1 and bloom picks it up.
 *  2. **motes** — fixed-capacity `Points` with a per-point seed. One shader,
 *     five behaviours chosen by `#define` (rise, fall, orbit, gather, burst).
 *     The live particle count is a draw range, not a reallocation.
 *  3. **ground** — a unit disc on the floor whose fragment draws the element's
 *     mark (scorch, rime, ripple, fracture, facet, arc, ward). Normal blending,
 *     so a scorch can actually darken the stone, with an emissive pattern on
 *     top. It grows out from the centre and cools/fades as the cast ends.
 *  4. **shockwave** — a ring front on the same disc, eased out from the
 *     centre on the impact beat.
 *  5. **distortion** — the same front written to `LAYER.DISTORTION` in the
 *     format the post stack expects (`dir * 0.5 + 0.5, strength, mask`).
 *
 * ## Per-instance time without per-instance materials
 *
 * Materials are pooled — one per move and role — but every live cast needs its
 * own age for the intro/outro envelope. Each node gets a plain-data record in
 * `userData.vfx` (`born` tick, `life`, `delay`, `seed`, `strength`, `family`)
 * and one `onBeforeRender` hook shared by the whole presentation. The hook
 * resolves the age from the fixed combat tick (so it is deterministic and
 * pauses with the simulation), writes the envelope and the family's live look
 * values into the material's uniforms and flags `uniformsNeedUpdate`, which
 * makes three upload them for that draw only. No closures, no allocation per
 * frame, and `userData` stays JSON-safe for `Object3D#toJSON`.
 *
 * ## Live look values
 *
 * Each family registers a commented `*_LOOK` block (see `ConvergenceArt.js`,
 * `CounterVisuals.js`, `stance-presentation.js`). The hook samples it on every
 * draw, multiplied by the matching `settings.global` multipliers, so editing a
 * value — including a move's palette — changes a cast that is already on
 * screen. The families also export a `build*Editor(gui, Editor)` folder builder
 * in the house style for the shared editor to mount.
 *
 * ## Persistent rigs (counter guard, held stance)
 *
 * A guard or a held stance has no fixed life: the presentation keeps it while
 * the gameplay state exists and removes it the tick that state ends. Layers
 * bound with `life: 0` therefore take their exit from the **rig**, not from a
 * timer (`rigExit`): the larger of
 *
 *  - the look's `exitTime` before the state's own `expiresTick` (the window or
 *    stance runs out on schedule, so the exit can finish exactly on that tick),
 *  - an explicit `userData.vfxExit` (0..1) on the rig root, for a presentation
 *    that keeps an exiting item alive and reports its progress,
 *  - `item.exitStart` if the presentation records one.
 *
 * Shader layers dissolve on it; solid meshes bound with `bindRigSolids` squash
 * down onto the floor over the same value.
 *
 * ## Layers
 *
 * Everything this kit makes is transparent, so it lives on `LAYER.VFX` and
 * never casts shadows: on `LAYER.WORLD` it would be rasterised into the depth
 * prepass as if it were solid and soft particles would fade against glow.
 */

const TAU = Math.PI * 2;

/** Highest mote capacity a single Points layer may request. */
export const MAX_MOTES = 96;

/** Family look blocks, by family name. Populated by `registerLook`. */
const LOOKS = Object.create(null);

/** Neutral defaults so a look block only needs the keys it changes. */
const LOOK_DEFAULTS = Object.freeze({
  glow: 1,
  opacity: 1,
  fresnel: 1,
  filamentSpeed: 1,
  noiseScale: 1,
  noiseAmount: 1,
  dissolveEdge: 0.08,
  introTime: 0.22,
  outroTime: 0.5,
  moteSize: 1,
  moteSpeed: 1,
  moteDensity: 1,
  groundOpacity: 0.85,
  groundGlow: 1,
  shockTime: 0.42,
  shockWidth: 0.12,
  warp: 1,
  exitTime: 0.2, // persistent rigs: dissolve / squash time before the state ends
  /* beat feedback (see ConvergenceCounterStanceFeedback.js) */
  shakeAmount: 0, // camera trauma added on the beat (× global.explosionIntensity)
  shakeTime: 0.35, // seconds for that trauma to decay
  flashStrength: 0, // screen flash on the beat (× global.explosionIntensity)
  lightIntensity: 0, // pooled point-light punch (× global.lightIntensity)
  lightRadius: 8, // its reach in metres (× global.lightRadius)
  palette: {}
});

/**
 * Register a family's look block. The kit reads it on every draw, so the
 * object must stay the same identity (mutate fields, do not replace it).
 */
export function registerLook(family, look) {
  for (const key of Object.keys(LOOK_DEFAULTS)) if (!(key in look)) look[key] = LOOK_DEFAULTS[key];
  LOOKS[family] = look;
  return look;
}

/** The live look block of a family (the neutral defaults if none registered). */
export function lookOf(family) {
  return LOOKS[family] ?? LOOK_DEFAULTS;
}

/* ------------------------------------------------------------------------ */
/* Pools                                                                    */
/* ------------------------------------------------------------------------ */

/** Build once per presentation, register for disposal, return the key. */
export function poolGeometry(v, key, factory) {
  if (!v.geo[key]) {
    const geometry = factory();
    geometry.name ||= key;
    v.geo[key] = geometry;
    v.resources.push(geometry);
  }
  return key;
}

/** Build once per presentation, register for disposal, return the key. */
export function poolMaterial(v, key, factory) {
  if (!v.mat[key]) {
    const material = factory();
    material.name ||= key;
    v.mat[key] = material;
    v.resources.push(material);
  }
  return key;
}

/** Unit disc on the floor plane: x/z in -1..1, facing up. Shared by ground, shock and warp. */
function unitDisc(v) {
  return poolGeometry(v, 'mechanicVfx:disc', () => {
    const g = new PlaneGeometry(2, 2, 1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

/* ------------------------------------------------------------------------ */
/* The shared per-draw hook                                                 */
/* ------------------------------------------------------------------------ */

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const HOOKS = new WeakMap();

/**
 * Exit envelope of a timed layer: 0 until the last `outroTime` of its life,
 * then 0..1. The outro never takes more than 70% of a short life, so a 0.25 s
 * beat still opens at full strength instead of half-dissolved.
 */
function timedOutro(age, life, outroTime) {
  const t = Math.max(0.02, Math.min(outroTime, life * 0.7));
  return clamp01((age - (life - t)) / t);
}

/* --- persistent rigs ---------------------------------------------------- */

/** Rig root → presentation item, resolved once on the first draw. */
const RIG_ITEMS = new WeakMap();
/** Rig root → presentation, for family code that only receives the group. */
const RIG_VIEWS = new WeakMap();

/** Remember which presentation built `root` (no JSON-unsafe userData). */
export function registerRig(v, root) {
  RIG_VIEWS.set(root, v);
  return root;
}

/** The presentation that built `root`, if `registerRig` was called. */
export function rigView(root) {
  return RIG_VIEWS.get(root) ?? null;
}

/** The top-level rig group a node belongs to (the presentation item's `g`). */
function rigRoot(v, node) {
  let n = node;
  while (n.parent && n.parent !== v.scene) n = n.parent;
  return n;
}

/**
 * 0..1 exit of a persistent rig (see the module notes). Allocation-free once
 * the rig's item is cached; the one-off lookup scans the presentation's items.
 */
export function rigExit(v, root, exitTime) {
  let k = root.userData.vfxExit ?? 0;
  let item = RIG_ITEMS.get(root);
  if (!item && v.items) {
    for (const candidate of v.items.values()) {
      if (candidate.g === root) {
        item = candidate;
        RIG_ITEMS.set(root, candidate);
        break;
      }
    }
  }
  if (!item) return k;
  const m = v.s.m;
  const rate = m.budget.tickRate;
  const t = Math.max(0.02, exitTime * settings.global.lifetime);
  const expires = item.data?.expiresTick;
  if (Number.isFinite(expires)) k = Math.max(k, 1 - clamp01((expires - m.tick) / rate / t));
  if (item.exitStart !== undefined) k = Math.max(k, clamp01((m.tick - item.exitStart) / rate / t));
  return k;
}

/* --- shader layers ------------------------------------------------------- */

/**
 * One hook per presentation. `this` is the object being drawn; its record is
 * `this.userData.vfx`. Everything written here is a scalar or an in-place
 * colour update, so the hook allocates nothing.
 */
function hookFor(v) {
  let hook = HOOKS.get(v);
  if (hook) return hook;
  hook = function onBeforeRender(renderer, scene, camera, geometry, material) {
    const rec = this.userData.vfx;
    const u = material.uniforms;
    // An override material (a debug or depth pass) has none of the kit uniforms.
    if (!rec || !u || !u.uAge) return;
    const m = v.s.m;
    const look = LOOKS[rec.family] ?? LOOK_DEFAULTS;
    const g = settings.global;
    const age = Math.max(0, (m.tick - rec.born) / m.budget.tickRate - rec.delay);
    const life = rec.life > 0 ? rec.life - rec.delay : 0;
    const outroTime = Math.max(0.05, (rec.outroTime ?? look.outroTime) * g.lifetime);
    u.uAge.value = age;
    u.uLife.value = life;
    u.uIntro.value = rec.delay > 0 && (m.tick - rec.born) / m.budget.tickRate < rec.delay
      ? 0
      : clamp01(age / Math.max(0.02, look.introTime));
    // Timed layers exit on their own life; persistent ones on their rig's.
    if (life > 0) u.uOutro.value = rec.outro ? timedOutro(age, life, outroTime) : 0;
    else u.uOutro.value = rigExit(v, rigRoot(v, this), look.exitTime);
    u.uSeed.value = rec.seed;
    u.uStrength.value = rec.strength;
    u.uFade.value = rec.fade ?? 1;
    u.uMotion.value = v.reducedMotion ? 0 : 1;
    u.uGlow.value = look.glow * (rec.role === 'ground' ? look.groundGlow : 1);
    u.uOpacity.value = look.opacity * g.opacity * (rec.role === 'ground' ? look.groundOpacity : 1);
    u.uFresnel.value = look.fresnel * g.fresnel;
    u.uNoise.value = look.noiseAmount * g.noiseStrength;
    u.uNoiseScale.value = look.noiseScale * g.noiseFrequency;
    u.uTurbulence.value = g.turbulence;
    // Clock-driven speeds: the family's own rate, the shared noise speed and the
    // global playback rate; motes also take the particle speed.
    u.uSpeed.value = (rec.role === 'motes' ? look.moteSpeed * g.particleSpeed : look.filamentSpeed) * g.noiseSpeed * g.animationSpeed;
    u.uMoteLife.value = Math.max(0.05, g.particleLifetime);
    u.uEdge.value = rec.role === 'shock' || rec.role === 'warp' ? look.shockWidth : look.dissolveEdge;
    u.uSize.value = look.moteSize * g.particleSize;
    u.uShockTime.value = Math.max(0.05, look.shockTime * g.lifetime);
    u.uWarp.value = look.warp * g.distortion;
    // A move's palette is live too. Compare strings so an unchanged palette
    // costs nothing; Color#set only runs on an actual edit.
    const pal = material.userData.paletteKey && look.palette[material.userData.paletteKey];
    if (pal) {
      if (pal.core && pal.core !== material.userData.core) { u.tint.value.set(pal.core); material.userData.core = pal.core; }
      if (pal.edge && pal.edge !== material.userData.edge) { u.tintB.value.set(pal.edge); material.userData.edge = pal.edge; }
    }
    // Live particle density: a draw range over the fixed capacity.
    if (this.isPoints) {
      const cap = geometry.attributes.position.count;
      geometry.setDrawRange(0, Math.max(1, Math.min(cap, Math.round(cap * look.moteDensity * g.particleCount))));
    }
    material.uniformsNeedUpdate = true;
  };
  HOOKS.set(v, hook);
  return hook;
}

/**
 * Tag a node as a timed VFX layer of the cast being built.
 *
 * @param v       the MechanicPresentation
 * @param node    Mesh or Points using a kit material
 * @param family  'convergence' | 'counter' | 'stance' (selects the look block)
 * @param opts    { life (s, 0 = persistent: exits with its rig), delay (s),
 *                  seed, strength, role, outroTime (s, overrides the look's),
 *                  outro (false: the presentation's own scale fade ends it) }
 */
export function bindVfx(v, node, family, opts = {}) {
  node.userData.vfx = {
    born: v.s.m.tick,
    life: opts.life ?? 0,
    delay: opts.delay ?? 0,
    seed: opts.seed ?? 0,
    strength: opts.strength ?? 1,
    role: opts.role ?? 'surface',
    outro: opts.outro ?? true,
    family
  };
  if (opts.outroTime !== undefined) node.userData.vfx.outroTime = opts.outroTime;
  node.onBeforeRender = hookFor(v);
  node.layers.set(opts.layer ?? LAYER.VFX);
  node.castShadow = false;
  node.receiveShadow = false;
  return node;
}

/* --- solid sculpture ----------------------------------------------------- */

/**
 * Graceful exit for solid sculpture on shared MeshStandardMaterials.
 *
 * A pooled standard material cannot carry a per-cast uniform, so the exit is
 * done on the object's transform instead: over the exit the mesh is squashed
 * down onto the floor of its rig, as if the sculpture sinks back into the
 * ground. The squash is applied to `matrixWorld` just before the draw (three
 * recomputes `matrixWorld` at the start of every render call, so the edit never
 * accumulates), once per render call through the frame counter.
 *
 * The main pass builds `modelViewMatrix` *after* `onBeforeRender`, so editing
 * `matrixWorld` is enough there. The shadow pass builds it *before*
 * `onBeforeShadow` (WebGLShadowMap, r185), so the shadow variant rebuilds it
 * from the squashed matrix — otherwise the shadow would stand at full height
 * for the whole exit and then pop off with the item.
 */
const SOLID_HOOKS = new WeakMap();

/** Squash `node`'s world matrix for this render call. Returns true if it changed. */
function applySink(v, node, frameId) {
  const rec = node.userData.vfxSolid;
  if (!rec || rec.frame === frameId) return false;
  rec.frame = frameId;
  const look = LOOKS[rec.family] ?? LOOK_DEFAULTS;
  const root = rigRoot(v, node);
  let k;
  if (rec.life > 0) {
    const m = v.s.m;
    const age = (m.tick - rec.born) / m.budget.tickRate;
    k = timedOutro(age, rec.life, Math.max(0.05, look.outroTime * settings.global.lifetime));
  } else {
    k = rigExit(v, root, look.exitTime);
  }
  if (k <= 0) return false;
  const s = 1 - 0.94 * k * k;
  const e = node.matrixWorld.elements;
  // The floor is the rig's origin (the cast point / the caster's feet).
  const y0 = root.matrixWorld.elements[13] + rec.groundY;
  // Pre-multiply by a vertical scale about y0: only the Y row changes.
  e[1] *= s;
  e[5] *= s;
  e[9] *= s;
  e[13] = y0 + (e[13] - y0) * s;
  return true;
}

function solidHooksFor(v) {
  let hooks = SOLID_HOOKS.get(v);
  if (hooks) return hooks;
  hooks = {
    render(renderer) {
      applySink(v, this, renderer.info.render.frame);
    },
    shadow(renderer, object, camera, shadowCamera) {
      if (!applySink(v, this, renderer.info.render.frame)) return;
      this.modelViewMatrix.multiplyMatrices(shadowCamera.matrixWorldInverse, this.matrixWorld);
      this.normalMatrix.getNormalMatrix(this.modelViewMatrix);
    }
  };
  SOLID_HOOKS.set(v, hooks);
  return hooks;
}

/**
 * Tag a solid sculpture mesh so it sinks out over the last `outroTime` of
 * `life` — or, with `life` 0, over its persistent rig's exit.
 */
export function bindSolidExit(v, node, family, life, groundY = 0) {
  node.userData.vfxSolid = { born: v.s.m.tick, life, groundY, family, frame: -1 };
  const hooks = solidHooksFor(v);
  node.onBeforeRender = hooks.render;
  node.onBeforeShadow = hooks.shadow;
  return node;
}

/**
 * Bind every solid mesh under `root` (not the kit's shader layers, not one
 * already bound) to sink out with the persistent rig. Returns the count.
 */
export function bindRigSolids(v, root, family) {
  let count = 0;
  root.traverse((n) => {
    if (!n.isMesh || n.userData.vfx || n.userData.vfxSolid || n.material?.isShaderMaterial) return;
    bindSolidExit(v, n, family, 0);
    count++;
  });
  return count;
}

/* ------------------------------------------------------------------------ */
/* Uniforms                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * The uniform block every kit material carries. `clock` is the presentation's
 * shared combat clock box (frozen to 0 under reduced motion); `tint` / `tintB`
 * are the core and edge colours, kept as uniforms named the way the family
 * tests and the palette sync expect.
 */
function kitUniforms(clock, tint, tintB, identity) {
  return {
    clock,
    identity: { value: identity },
    tint: { value: new Color(tint) },
    tintB: { value: new Color(tintB ?? tint) },
    uAge: { value: 0 },
    uLife: { value: 0 },
    uIntro: { value: 1 },
    uOutro: { value: 0 },
    uSeed: { value: 0 },
    uStrength: { value: 1 },
    uFade: { value: 1 },
    uMotion: { value: 1 },
    uGlow: { value: 1 },
    uOpacity: { value: 1 },
    uFresnel: { value: 1 },
    uNoise: { value: 1 },
    uNoiseScale: { value: 1 },
    uTurbulence: { value: 1 },
    uSpeed: { value: 1 },
    uMoteLife: { value: 1 },
    uEdge: { value: 0.08 },
    uSize: { value: 1 },
    uShockTime: { value: 0.42 },
    uWarp: { value: 1 },
    uShaderIntensity: frame.uShaderIntensity,
    uGlobalGlow: frame.uGlobalGlow
  };
}

const UNIFORMS_GLSL = /* glsl */ `
  uniform float clock;
  uniform float identity;
  uniform vec3 tint;
  uniform vec3 tintB;
  uniform float uAge;
  uniform float uLife;
  uniform float uIntro;     // 0..1 entry envelope
  uniform float uOutro;     // 0..1 exit envelope
  uniform float uSeed;
  uniform float uStrength;  // per-cast intensity (e.g. ingredient count)
  uniform float uFade;      // per-node alpha/colour multiplier (a trail bleeding out)
  uniform float uMotion;    // 0 under reduced motion
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uFresnel;
  uniform float uNoise;
  uniform float uNoiseScale;
  uniform float uTurbulence; // global.turbulence: scales noise displacement
  uniform float uSpeed;
  uniform float uMoteLife;   // global.particleLifetime: longer life, slower cycle
  uniform float uEdge;
  uniform float uSize;
  uniform float uShockTime;
  uniform float uWarp;
  uniform float uShaderIntensity;
  uniform float uGlobalGlow;
`;

/* ------------------------------------------------------------------------ */
/* 1. Hero surface                                                          */
/* ------------------------------------------------------------------------ */

const SURFACE_VERTEX = /* glsl */ `
  ${UNIFORMS_GLSL}
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vLift;

  ${noiseGLSL}

  void main() {
    vUv = uv;
    vec3 p = position;
    // Travelling sway along the ribbon plus a slow noise breath in the normal
    // direction. Both scale with uMotion so reduced motion holds the pose.
    float sway = sin(uv.x * 18.0 - clock * (3.0 + identity * 0.2) * uSpeed);
    float breath = snoise(vec3(position * 1.7 * uNoiseScale + vec3(0.0, clock * 0.6 * uSpeed, identity)));
    p += normal * (0.03 * sway + 0.045 * breath * uNoise * uTurbulence) * uMotion;
    p.y += 0.035 * sway * uMotion;
    // On the way out the tips drift upward as they burn away.
    vLift = uOutro * uv.x;
    p.y += vLift * 0.3 * uMotion;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SURFACE_FRAGMENT = /* glsl */ `
  ${UNIFORMS_GLSL}
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vLift;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    // Feather across the ribbon and at both ends so no strip ever shows a cut.
    float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float ends = smoothstep(0.0, 0.06, vUv.x) * (1.0 - smoothstep(0.94, 1.0, vUv.x));

    // Filaments: fbm scrolled along the ribbon bends a sharp sine pulse, so the
    // energy reads as travelling, not as a stripe texture.
    vec3 q = vec3(vUv.x * 5.0 * uNoiseScale - clock * 0.9 * uSpeed, vUv.y * 1.6, identity * 3.17 + uSeed);
    float n = fbm3(q) * uNoise;
    float n01 = clamp(n * 0.6 + 0.5, 0.0, 1.0);
    float pulse = pow(max(0.0, sin(vUv.x * (16.0 + identity * 2.0) - clock * (2.4 + identity * 0.25) * uSpeed + n * 2.5)), 5.0);
    float rim = fresnelTerm(vViewDir, vNormalW, 2.2, 1.0) * uFresnel;

    // Intro: a reveal front runs root to tip. Outro: noise dissolve whose
    // threshold rises with uOutro, leaving a hot burn line just above it.
    float reveal = smoothstep(vUv.x - 0.14, vUv.x, uIntro * 1.14);
    float threshold = uOutro * 1.05;
    float keep = step(threshold, n01);
    float burn = keep * (1.0 - smoothstep(0.0, max(uEdge, 0.005), n01 - threshold)) * step(0.001, uOutro);
    if (keep < 0.5 || reveal < 0.002) discard;

    vec3 col = mix(tint, tintB, clamp(n01 * 0.7 + rim * 0.35, 0.0, 1.0));
    col *= 1.0 + pulse * 0.9 + rim * 0.7;
    col += tintB * burn * 3.0;
    float alpha = (0.26 + 0.56 * across) * (0.7 + 0.3 * pulse) * ends * reveal * uOpacity;
    alpha = clamp(alpha * (0.85 + 0.15 * uStrength) + burn * 0.5, 0.0, 1.0) * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * uShaderIntensity * (0.9 + 0.2 * uStrength) * uFade, alpha);
  }
`;

/**
 * Hero ribbon / facet material. `paletteKey` links it to an entry of the
 * family's live `palette` (`{ core, edge }`).
 */
export function createSurfaceMaterial({ clock, tint, tintB, identity = 0, paletteKey = null, depthTest = true }) {
  const material = new ShaderMaterial({
    uniforms: kitUniforms(clock, tint, tintB, identity),
    vertexShader: SURFACE_VERTEX,
    fragmentShader: SURFACE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false
  });
  material.userData.paletteKey = paletteKey;
  return material;
}

/* ------------------------------------------------------------------------ */
/* 2. Motes                                                                 */
/* ------------------------------------------------------------------------ */

/** Behaviours a mote layer can take. Each becomes a `#define`. */
export const MOTE_STYLE = Object.freeze({
  RISE: 'STYLE_RISE', // embers: climb and drift, loop forever
  FALL: 'STYLE_FALL', // snow / rime: sink and settle
  ORBIT: 'STYLE_ORBIT', // spray / sparks: wheel around the axis
  GATHER: 'STYLE_GATHER', // anticipation: drawn in to the centre over the instance life
  BURST: 'STYLE_BURST' // impact: thrown out once and decay
});

const MOTE_VERTEX = /* glsl */ `
  ${UNIFORMS_GLSL}
  attribute float aSeed;
  varying float vFade;
  varying float vHeat;

  ${noiseGLSL}

  const float TAU = 6.28318530718;

  void main() {
    float seed = aSeed + uSeed * 0.137;
    float rate = (0.22 + 0.18 * hash11(seed * 13.1)) * uSpeed / uMoteLife;
    float phase = fract(clock * rate + hash11(seed * 7.7));
    vec3 base = position;
    vec3 p = base;
    float fade = sin(phase * 3.14159265);

  #if defined(STYLE_RISE)
    p.y += phase * 0.9;
    p.xz += (hash21(seed) - 0.5) * 0.35 * phase;
    p += curlNoise(base * 0.8 + vec3(0.0, clock * 0.3, seed)) * 0.06 * uNoise * uTurbulence;
  #elif defined(STYLE_FALL)
    p.y += (0.5 - phase) * 0.8;
    p.xz += vec2(sin(phase * TAU + seed), cos(phase * TAU * 0.7 + seed)) * 0.08 * uTurbulence;
  #elif defined(STYLE_ORBIT)
    float a = phase * TAU * 0.4;
    p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * base.xz;
    p.y += sin(phase * TAU + seed) * 0.12;
  #elif defined(STYLE_GATHER)
    // Pulled from outside the footprint to the core across the instance life.
    float k = clamp(uAge / max(uLife, 0.05), 0.0, 1.0);
    float pull = k * k * (3.0 - 2.0 * k);
    vec3 outside = base * (1.7 + 0.5 * hash11(seed * 3.1)) + vec3(0.0, 0.6 * hash11(seed * 5.3), 0.0);
    p = mix(outside, base * 0.12 + vec3(0.0, 0.5, 0.0), pull);
    // A dim floor keeps the gathered core visible to the last frame, but it
    // drains with the arrival too, so nothing is left lit when the item goes.
    fade = max(smoothstep(0.0, 0.2, k) * (1.0 - smoothstep(0.85, 1.0, k)), 0.25 * (1.0 - smoothstep(0.8, 1.0, k)));
  #elif defined(STYLE_BURST)
    // Thrown out once from the rest position, slowing as it goes.
    float t = 1.0 - exp(-uAge * (2.2 + hash11(seed * 9.1) * 1.6));
    vec3 dir = normalize(vec3(base.x, 0.35 + hash11(seed * 4.4), base.z) + 1e-4);
    p = base + dir * t * (0.9 + 1.4 * hash11(seed * 2.2)) * uStrength;
    p.y -= uAge * uAge * 0.6;
    fade = 1.0 - smoothstep(0.25, 1.0, uAge / max(uShockTime * 2.5 * uMoteLife, 0.1));
  #endif

    // Reduced motion: hold every mote at its authored rest position.
    p = mix(base, p, uMotion);
    vFade = fade * uIntro * (1.0 - uOutro) * uFade;
    vHeat = hash11(seed * 1.7);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * 26.0 / max(1.0, -mv.z), 1.5, 7.5) * (0.6 + 0.8 * vHeat);
  }
`;

const MOTE_FRAGMENT = /* glsl */ `
  ${UNIFORMS_GLSL}
  varying float vFade;
  varying float vHeat;

  void main() {
    float r = length(gl_PointCoord - vec2(0.5));
    float core = 1.0 - smoothstep(0.05, 0.22, r);
    float halo = 1.0 - smoothstep(0.1, 0.5, r);
    float a = (core * 0.7 + halo * 0.45) * vFade * uOpacity;
    if (a < 0.003) discard;
    vec3 col = mix(tintB, tint, vHeat) * (1.3 + core * 1.4);
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * uShaderIntensity, a);
  }
`;

export function createMoteMaterial({ clock, tint, tintB, style = MOTE_STYLE.RISE, paletteKey = null, depthTest = true }) {
  const material = new ShaderMaterial({
    uniforms: kitUniforms(clock, tint, tintB, 0),
    vertexShader: MOTE_VERTEX,
    fragmentShader: MOTE_FRAGMENT,
    defines: { [style]: '' },
    transparent: true,
    depthWrite: false,
    depthTest,
    blending: AdditiveBlending,
    toneMapped: false
  });
  material.userData.paletteKey = paletteKey;
  return material;
}

/**
 * A Points geometry with an `aSeed` attribute, sampled from source positions
 * (a hero surface, a ring) so the motes sit on the form they decorate.
 * `count` is fixed at build: the live density is a draw range over it.
 */
export function createMoteGeometry(source, count, jitter = 0) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const j = Math.floor((i * source.count) / count);
    // Deterministic jitter (golden-angle hash) keeps tests and replays stable.
    const h = (Math.sin(i * 12.9898 + 4.1414) * 43758.5453) % 1;
    const a = i * 2.39996323;
    positions[i * 3] = source.getX(j) + Math.cos(a) * jitter * h;
    positions[i * 3 + 1] = source.getY(j);
    positions[i * 3 + 2] = source.getZ(j) + Math.sin(a) * jitter * h;
    seeds[i] = i / count + 0.013 * i;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
  g.computeBoundingSphere();
  return g;
}

/** A ring of `count` mote anchors at `radius`, `height`, for ring-shaped layers. */
export function createMoteRing(count, radius, height = 0.1, spread = 0.15) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + Math.sin(i * 1.7) * 0.2;
    const r = radius * (1 + Math.sin(i * 3.3) * spread);
    positions[i * 3] = Math.sin(a) * r;
    positions[i * 3 + 1] = height + (Math.sin(i * 5.1) * 0.5 + 0.5) * 0.25;
    positions[i * 3 + 2] = Math.cos(a) * r;
    seeds[i] = i / count;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------------ */
/* 3. Ground treatment                                                      */
/* ------------------------------------------------------------------------ */

/** Ground marks, one per element family. Each becomes a `#define`. */
export const GROUND_PATTERN = Object.freeze({
  SCORCH: 'PATTERN_SCORCH', // fire: charred stone with glowing cracks that cool
  RIME: 'PATTERN_RIME', // frost: radial dendrites over a pale bloom
  RIPPLE: 'PATTERN_RIPPLE', // water: travelling rings and caustic lace
  FRACTURE: 'PATTERN_FRACTURE', // earth: radial and ring cracks with hot seams
  FACET: 'PATTERN_FACET', // crystal: kaleidoscope facets with iridescent edges
  ARC: 'PATTERN_ARC', // storm: flickering branched discharge
  WARD: 'PATTERN_WARD' // force: segmented runic rings
});

const GROUND_VERTEX = /* glsl */ `
  varying vec2 vDisc;
  void main() {
    vDisc = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  ${UNIFORMS_GLSL}
  varying vec2 vDisc;

  ${noiseGLSL}

  const float TAU = 6.28318530718;

  void main() {
    float r = length(vDisc);
    if (r > 1.0) discard;
    float ang = atan(vDisc.y, vDisc.x);
    float rim = 1.0 - smoothstep(0.82, 1.0, r);
    // The mark spreads out from the centre with the intro (instant under
    // reduced motion — it is information, not flourish).
    float spread = mix(1.2, uIntro * 1.25, uMotion);
    float front = 1.0 - smoothstep(spread - 0.2, spread, r);
    float n = fbm3(vec3(vDisc * 3.0 * uNoiseScale, uSeed * 0.71 + identity)) * uNoise;
    float t = clock * uSpeed;

    vec3 dark = tintB * 0.12;
    float darkA = 0.0;
    float glow = 0.0;

  #if defined(PATTERN_SCORCH)
    darkA = (1.0 - smoothstep(0.15, 1.0, r + n * 0.25)) * 0.85;
    float crack = pow(1.0 - abs(snoise(vec3(vDisc * 5.0 * uNoiseScale, uSeed))), 9.0);
    float flicker = 0.75 + 0.25 * sin(t * 9.0 + n * 6.0);
    glow = crack * (1.0 - r * 0.6) * flicker;
  #elif defined(PATTERN_RIME)
    float spokes = pow(abs(cos(ang * 3.0 + n * 0.8)), 36.0) * (1.0 - r);
    float lace = pow(ridged(vec3(vDisc * 6.0 * uNoiseScale, uSeed), 4), 3.0);
    darkA = (1.0 - smoothstep(0.2, 1.0, r)) * 0.25;
    dark = tint * 0.55;
    glow = spokes * 1.2 + lace * 0.45 * (1.0 - r * 0.5);
  #elif defined(PATTERN_RIPPLE)
    float rings = pow(0.5 + 0.5 * sin(r * 26.0 - t * 4.0 * uMotion - n * 3.0), 6.0);
    float caustic = pow(1.0 - abs(snoise(vec3(vDisc * 4.0 * uNoiseScale, t * 0.5))), 6.0);
    darkA = 0.35 * (1.0 - r);
    dark = tintB * 0.3;
    glow = (rings * 0.8 + caustic * 0.6) * (1.0 - r * 0.7);
  #elif defined(PATTERN_FRACTURE)
    float radial = pow(abs(sin(ang * 3.5 + n * 2.0)), 48.0) * step(0.12, r);
    float ringCrack = 1.0 - smoothstep(0.0, 0.025, abs(fract(r * 3.0 + n * 0.3) - 0.5) - 0.47);
    darkA = (1.0 - smoothstep(0.1, 1.0, r + n * 0.2)) * 0.7;
    glow = (radial + ringCrack * 0.5) * (1.0 - r * 0.5);
  #elif defined(PATTERN_FACET)
    float sector = TAU / 6.0;
    float folded = abs(mod(ang + n * 0.15, sector) - sector * 0.5);
    float seams = 1.0 - smoothstep(0.0, 0.03, folded * r);
    float bands = 1.0 - smoothstep(0.0, 0.02, abs(fract(r * 4.0 - t * 0.2 * uMotion) - 0.5) - 0.46);
    darkA = 0.3 * (1.0 - r);
    dark = mix(tint, tintB, 0.5 + 0.5 * sin(ang * 3.0 + t)) * 0.35;
    glow = seams * 0.9 + bands * 0.5;
  #elif defined(PATTERN_ARC)
    float bolt = pow(1.0 - abs(snoise(vec3(vDisc * 5.0 * uNoiseScale, floor(t * 12.0 * uMotion) * 0.37 + uSeed))), 26.0);
    float halo = pow(1.0 - abs(snoise(vec3(vDisc * 2.0, t * 0.7))), 6.0) * 0.25;
    darkA = 0.4 * (1.0 - smoothstep(0.3, 1.0, r));
    glow = (bolt * 1.6 + halo) * (1.0 - r * 0.4);
  #elif defined(PATTERN_WARD)
    float band1 = 1.0 - smoothstep(0.0, 0.025, abs(r - 0.93));
    float band2 = 1.0 - smoothstep(0.0, 0.018, abs(r - 0.62));
    float ticks = step(0.55, fract(ang * 12.0 / TAU + t * 0.04 * uMotion)) * step(0.66, r) * step(r, 0.88);
    float glyph = pow(abs(sin(ang * 6.0)), 20.0) * step(0.66, r) * step(r, 0.88);
    darkA = 0.18;
    glow = band1 + band2 * 0.7 + ticks * 0.35 + glyph * 0.5;
  #endif

    // Exit: the mark cools first (glow drains) and then fades away.
    float cool = 1.0 - smoothstep(0.0, 0.6, uOutro);
    float fade = 1.0 - smoothstep(0.4, 1.0, uOutro);
    glow *= cool * front * rim * uStrength;
    darkA *= fade * front * rim;
    vec3 hot = mix(tintB, tint, clamp(glow, 0.0, 1.0)) * (1.2 + glow * 1.6) * uGlow * uGlobalGlow * uShaderIntensity;
    float alpha = clamp(max(darkA, clamp(glow, 0.0, 1.0)) * uOpacity * fade, 0.0, 1.0) * uFade;
    if (alpha < 0.003) discard;
    vec3 col = mix(dark, hot, clamp(glow * 1.5, 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createGroundMaterial({ clock, tint, tintB, pattern, paletteKey = null }) {
  const material = new ShaderMaterial({
    uniforms: kitUniforms(clock, tint, tintB, 0),
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT,
    defines: { [pattern]: '' },
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
    // Lifted off the floor in depth, not in space, so it never z-fights.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  material.userData.paletteKey = paletteKey;
  return material;
}

/* ------------------------------------------------------------------------ */
/* 4 + 5. Shockwave and its distortion twin                                 */
/* ------------------------------------------------------------------------ */

/** The front, shared by both stages so the warp sits exactly on the ring. */
const FRONT_GLSL = /* glsl */ `
  float shockBand(float r, out float life) {
    float t = clamp(uAge / max(uShockTime, 0.02), 0.0, 1.0);
    life = 1.0 - t;
    // Ease out: fast off the centre, settling at the boundary. Reduced motion
    // shows the ring at the boundary and only fades it.
    float front = mix(1.0, mix(0.06, 1.0, 1.0 - pow(1.0 - t, 3.0)), uMotion);
    float w = max(uEdge, 0.01);
    return smoothstep(front - w, front, r) * (1.0 - smoothstep(front, front + w * 0.35, r));
  }
`;

const SHOCK_FRAGMENT = /* glsl */ `
  ${UNIFORMS_GLSL}
  varying vec2 vDisc;

  ${noiseGLSL}
  ${FRONT_GLSL}

  void main() {
    float r = length(vDisc);
    if (r > 1.05) discard;
    float life;
    float band = shockBand(r, life);
    band *= 0.7 + 0.3 * snoise(vec3(vDisc * 6.0 * uNoiseScale, clock * 2.0 + uSeed));
    // uOutro: a beat shorter than the front's travel still fades it out.
    float a = band * life * uOpacity * uIntro * uFade * (1.0 - uOutro);
    if (a < 0.003) discard;
    vec3 col = mix(tintB, tint, band) * (1.6 + band * 2.0) * uGlow * uGlobalGlow * uShaderIntensity * uStrength;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  ${UNIFORMS_GLSL}
  varying vec2 vDisc;

  ${noiseGLSL}
  ${FRONT_GLSL}

  void main() {
    float r = length(vDisc);
    if (r > 1.05) discard;
    float life;
    float band = shockBand(r, life);
    vec2 dir = normalize(vDisc + 1e-4);
    float strength = band * life * uWarp * uShaderIntensity * 0.6 * uStrength * uFade * (1.0 - uOutro);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, band);
  }
`;

export function createShockMaterial({ clock, tint, tintB, paletteKey = null, depthTest = true }) {
  const material = new ShaderMaterial({
    uniforms: kitUniforms(clock, tint, tintB, 0),
    vertexShader: GROUND_VERTEX,
    fragmentShader: SHOCK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false
  });
  material.userData.paletteKey = paletteKey;
  return material;
}

/** Distortion proxy (LAYER.DISTORTION), copied from the acid-fume format. */
export function createWarpMaterial({ clock, tint }) {
  return new ShaderMaterial({
    uniforms: kitUniforms(clock, tint, tint, 0),
    vertexShader: GROUND_VERTEX,
    fragmentShader: WARP_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false
  });
}

/* ------------------------------------------------------------------------ */
/* Convenience builders used by the families                                */
/* ------------------------------------------------------------------------ */

/** Floor mark of `radius` metres under `parent`. */
export function addGround(v, parent, family, materialKey, radius, opts = {}) {
  const mesh = new Mesh(v.geo[unitDisc(v)], v.mat[materialKey]);
  mesh.name = opts.name ?? `${family}-ground`;
  mesh.position.set(opts.x ?? 0, opts.y ?? 0.03, opts.z ?? 0);
  mesh.scale.set(radius, 1, radius);
  mesh.renderOrder = opts.renderOrder ?? 2;
  bindVfx(v, mesh, family, { ...opts, role: 'ground' });
  parent.add(mesh);
  return mesh;
}

/** Shockwave ring that eases out to `radius`, plus its distortion twin. */
export function addShock(v, parent, family, materialKey, warpKey, radius, opts = {}) {
  const ring = new Mesh(v.geo[unitDisc(v)], v.mat[materialKey]);
  ring.name = opts.name ?? `${family}-shock`;
  ring.position.set(opts.x ?? 0, opts.y ?? 0.06, opts.z ?? 0);
  ring.scale.set(radius, 1, radius);
  ring.renderOrder = opts.renderOrder ?? 3;
  bindVfx(v, ring, family, { ...opts, role: 'shock' });
  parent.add(ring);
  if (warpKey) {
    const warp = new Mesh(v.geo[unitDisc(v)], v.mat[warpKey]);
    warp.name = `${ring.name}-warp`;
    warp.position.copy(ring.position);
    warp.scale.copy(ring.scale);
    warp.renderOrder = ring.renderOrder;
    bindVfx(v, warp, family, { ...opts, role: 'warp', layer: LAYER.DISTORTION });
    parent.add(warp);
  }
  return ring;
}

/** A Points layer over a pooled mote geometry. */
export function addMotes(v, parent, family, geometryKey, materialKey, opts = {}) {
  const motes = new Points(v.geo[geometryKey], v.mat[materialKey]);
  motes.name = opts.name ?? geometryKey;
  motes.frustumCulled = false;
  motes.renderOrder = opts.renderOrder ?? 4;
  if (opts.y) motes.position.y = opts.y;
  bindVfx(v, motes, family, { ...opts, role: 'motes' });
  parent.add(motes);
  return motes;
}

/** Overlay material for an element the presentation has no overlay for. */
export function overlayMaterial(v, element, color) {
  const key = `convergenceOverlay-${element}`;
  if (v.mat[key]) return key;
  // Same recipe as the presentation's own overlays: drawn over raised
  // terrain (no depth test) so a footprint is never hidden by a ridge.
  return poolMaterial(
    v,
    key,
    () => new MeshBasicMaterial({ color, transparent: true, opacity: 0.82, depthTest: false, depthWrite: false })
  );
}

/**
 * Hand-authored geometry builder: tapered ribbons and faceted crystals into one
 * indexed BufferGeometry with 0..1 UVs. Used by all three families so their
 * heroes share a construction vocabulary but not a silhouette.
 */
export class FormBuilder {
  constructor() {
    this.positions = [];
    this.uvs = [];
    this.indices = [];
  }
  get vertexCount() {
    return this.positions.length / 3;
  }
  /**
   * A strip along `points`. `plane` picks the offset direction:
   *  - 'xz' — across the floor (footprint ribbons, convergence),
   *  - 'xy' — in the vertical plane (guards that face the attacker),
   *  - 'radial' — outward from the Y axis (mantles that wrap the caster).
   * `taper` (0..1) narrows both ends so no strip shows a cut end.
   */
  ribbon(points, width, plane = 'xz', taper = 0.75) {
    const start = this.vertexCount;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const [x, y, z] = points[i];
      const p = points[Math.max(0, i - 1)];
      const q = points[Math.min(n - 1, i + 1)];
      const w = width * (1 - taper + taper * Math.sin((Math.PI * (i + 0.5)) / n));
      let ox = 0, oy = 0, oz = 0;
      if (plane === 'xz') {
        const dx = q[0] - p[0], dz = q[2] - p[2], d = Math.hypot(dx, dz) || 1;
        ox = (-dz / d) * w; oz = (dx / d) * w;
      } else if (plane === 'xy') {
        const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy) || 1;
        ox = (-dy / d) * w; oy = (dx / d) * w;
      } else {
        // Radial: the strip's width runs along the tangent around the axis,
        // so a rising ribbon wraps the caster like cloth.
        const r = Math.hypot(x, z) || 1;
        ox = (-z / r) * w; oz = (x / r) * w;
      }
      this.positions.push(x + ox, y + oy, z + oz, x - ox, y - oy, z - oz);
      const u = n > 1 ? i / (n - 1) : 0;
      this.uvs.push(u, 0, u, 1);
      if (i) {
        const a = start + (i - 1) * 2, b = start + i * 2;
        this.indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return this;
  }
  /**
   * An eight-faced crystal: a diamond in the XY plane with a ridge front and
   * back. `lean` tips the crown; `twist` rotates it about Y.
   */
  facet(x, y, z, w, h, d, lean = 0, twist = 0) {
    const start = this.vertexCount;
    const c = Math.cos(twist), s = Math.sin(twist);
    const local = [[-w, 0, 0], [0, -h, 0], [w, 0, 0], [lean, h, 0], [0, 0, d], [0, 0, -d]];
    for (const [lx, ly, lz] of local) {
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      this.positions.push(px, y + ly, pz);
      this.uvs.push(Math.min(1, Math.max(0, lx / (2 * w) + 0.5)), Math.min(1, Math.max(0, (ly + h) / (2 * h))));
    }
    for (const f of [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [1, 0, 5], [2, 1, 5], [3, 2, 5], [0, 3, 5]])
      this.indices.push(start + f[0], start + f[1], start + f[2]);
    return this;
  }
  /** Finish into an indexed geometry with normals and bounds. */
  build(name) {
    const g = new BufferGeometry();
    g.name = name;
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    g.setIndex(this.indices);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}
