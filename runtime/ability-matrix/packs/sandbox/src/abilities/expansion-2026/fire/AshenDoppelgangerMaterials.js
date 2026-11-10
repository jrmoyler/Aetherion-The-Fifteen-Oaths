import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshStandardMaterial,
  NormalBlending,
  ShaderMaterial,
  Vector3
} from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { ID } from './AshenDoppelgangerConfig.js';

/**
 * Ashen Doppelganger — the bespoke shaders.
 *
 *  - **the ember crust** (`createEchoSkinMaterial`) — the fallback figure. Char
 *    grain from fbm, glowing fissures that crawl up the body (a sine band bent
 *    by simplex noise, so the cracks branch instead of striping), a fresnel rim,
 *    and a two-sided noise dissolve: the echo *condenses* feet-first out of ash
 *    while it forms and *crumbles* crown-first when it expires, with a white-hot
 *    edge on both fronts. All in body space, so the crust is welded to the
 *    walking echo rather than sliding through it.
 *  - **the rig crust** (`createRigMaterial`) — the same reading on a skinned
 *    clone of the caster. A built-in `MeshStandardMaterial` (it has to skin),
 *    patched in `onBeforeCompile` with the fissures and dissolve.
 *  - **the sigil** (`createSigilMaterial`) — the ash circle under the echo: a
 *    wavering ring, noise-broken radial cracks that brighten as the next pulse
 *    nears, and the pulse ring itself running out to the rim.
 *  - **the ember column** (`createEmberColumnMaterial`) — baked points lifted
 *    in an updraft that narrows as it rises.
 *  - **the fuse** (`createFuseMaterial`) — the smouldering path between caster
 *    and echo: hot coals where the caster has just walked, cooling to ash where
 *    the echo is about to tread.
 *  - **the heat haze** (`createHeatHazeMaterial`) — a `LAYER.DISTORTION` proxy:
 *    rising simplex shimmer above the echo, strongest at the pulse.
 *
 * Every material reads `settings['ashen-doppelganger']` in
 * `userData.sync(state)`; the ability only hands over what a cast owns
 * (its clock, its heat, how formed or crumbled it is).
 */

/* -------------------------------------------------------------------- */
/* The ember crust (fallback figure)                                    */
/* -------------------------------------------------------------------- */

const SKIN_VERTEX = /* glsl */ `
  uniform float uClock;
  uniform float uWobble;

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    vec3 p = position;
    // Heat shimmer: the figure sways, more towards the top of each part.
    p.x += sin(position.y * 8.0 + uClock * 3.0) * uWobble * (0.4 + position.y);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SKIN_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uOpacity;
  uniform float uHeat;
  uniform float uForm;       // 0..1 condensed (feet first)
  uniform float uCrumble;    // 0..1 crumbled (crown first)
  uniform float uHeight;     // body height used by both fronts (m)
  uniform float uFissureScale;
  uniform float uFissureSpeed;
  uniform float uGrain;
  uniform float uFissureGlow;
  uniform float uRimGlow;
  uniform float uBurnEdge;
  uniform float uFresnel;
  uniform vec3  uOrigin;     // the echo's feet, world
  uniform vec3  uColorCharA;
  uniform vec3  uColorCharB;
  uniform vec3  uColorFissure;
  uniform vec3  uColorRim;
  uniform vec3  uColorBurnEdge;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec3  uLightDir;

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 q = vWorld - uOrigin;
    float h = clamp(q.y / max(uHeight, 0.05), 0.0, 1.0);

    // Two fronts share one noise so their edges are ragged the same way.
    float n = snoise01(q * 5.0 + vec3(0.0, uClock * 0.2, 0.0));
    float formKeep = uForm * 1.25 - 0.1 - h + (n - 0.5) * 0.25;
    // Crumbling eats from the crown: the keep line falls from above the head.
    float crumbleKeep = (1.15 - uCrumble * 1.3) - h + (n - 0.5) * 0.25;
    float keep = min(formKeep, crumbleKeep);
    if (keep < 0.0) discard;
    float burn = 1.0 - smoothstep(0.0, max(uBurnEdge, 1e-3), keep);

    // Char: coarse fbm grain, warmer in the hollows.
    float grain = fbm3(q * uGrain * 0.3);
    vec3 charred = mix(uColorCharA, uColorCharB, clamp(grain * 0.8 + 0.5, 0.0, 1.0));
    // Lit by the sun, so the figure has a shaded side like any solid body.
    charred *= 0.45 + 0.9 * max(dot(normalize(vNormalW), normalize(uLightDir)), 0.0);

    // Fissures: a sine band bent by noise so the cracks branch and wander.
    float bend = snoise(q * 3.0) * 1.8;
    float band = sin(q.y * uFissureScale + bend + sin(q.x * uFissureScale * 0.85) * 1.6 + uClock * uFissureSpeed);
    float fissure = pow(max(0.0, 1.0 - abs(band) * 5.0), 2.0);
    // Breathing coals inside the cracks.
    fissure *= 0.65 + 0.35 * snoise01(q * 9.0 + vec3(0.0, -uClock * 1.3, 0.0));

    float rim = fresnelTerm(vViewDir, vNormalW, 2.0, uFresnel);

    vec3 glow = uColorFissure * fissure * uFissureGlow * (1.0 + uHeat)
              + uColorRim * rim * uRimGlow * (1.0 + uHeat * 0.6)
              + uColorBurnEdge * burn * 3.0;
    vec3 col = charred + glow * uGlobalGlow * uShaderIntensity;
    float alpha = uOpacity * clamp(0.68 + rim * 0.25 + burn * 0.4, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

/** The fallback echo body. Normal-blended char with an emissive crust. */
export function createEchoSkinMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uOpacity: { value: 0 },
      uHeat: { value: 0 },
      uForm: { value: 1 },
      uCrumble: { value: 0 },
      uHeight: { value: 1.8 },
      uWobble: { value: 0.025 },
      uFissureScale: { value: 21 },
      uFissureSpeed: { value: 2 },
      uGrain: { value: 18 },
      uFissureGlow: { value: 1.3 },
      uRimGlow: { value: 0.42 },
      uBurnEdge: { value: 0.08 },
      uFresnel: { value: 1 },
      uOrigin: { value: new Vector3() },
      uColorCharA: { value: new Color() },
      uColorCharB: { value: new Color() },
      uColorFissure: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorBurnEdge: { value: new Color() }
    }),
    vertexShader: SKIN_VERTEX,
    fragmentShader: SKIN_FRAGMENT
  });

  /**
   * @param {{clock:number, heat:number, form:number, crumble:number,
   *          origin:Vector3}} state
   * `uOpacity` is written by the ability (tests read it straight back).
   */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = state.clock;
    u.uHeat.value = state.heat * c.heatFlare;
    u.uForm.value = state.form;
    u.uCrumble.value = state.crumble;
    u.uWobble.value = c.wobble;
    u.uFissureScale.value = c.fissureScale * g.noiseFrequency;
    u.uFissureSpeed.value = c.fissureSpeed * g.noiseSpeed;
    u.uGrain.value = c.crustGrain;
    u.uFissureGlow.value = c.fissureGlow * g.glow;
    u.uRimGlow.value = c.rimGlow * g.glow;
    u.uBurnEdge.value = c.burnEdge;
    u.uFresnel.value = g.fresnel;
    u.uOrigin.value.copy(state.origin);
    u.uColorCharA.value.copy(getColor(c.colorCharA));
    u.uColorCharB.value.copy(getColor(c.colorCharB));
    u.uColorFissure.value.copy(getColor(c.colorFissure));
    u.uColorRim.value.copy(getColor(c.colorRim));
    u.uColorBurnEdge.value.copy(getColor(c.colorBurnEdge));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The rig crust (skinned clone of the caster)                          */
/* -------------------------------------------------------------------- */

/**
 * A skinned mesh needs three's skinning chunks, so the rig keeps a built-in
 * material and has the crust patched in. `userData.ash` holds the uniform
 * boxes (shared with the compiled program by identity).
 */
export function createRigMaterial() {
  const material = new MeshStandardMaterial({
    color: 0x3a2c26,
    emissive: 0x4a0e02,
    emissiveIntensity: 0.3,
    roughness: 0.94,
    metalness: 0.02,
    transparent: false,
    opacity: 1,
    depthWrite: true
  });
  const ash = {
    time: { value: 0 },
    heat: { value: 0 },
    form: { value: 1 },
    crumble: { value: 0 },
    height: { value: 1.8 },
    edge: { value: 0.08 },
    fissure: { value: 23 },
    speed: { value: 2 },
    grain: { value: 18 },
    fissureColor: { value: new Color(1, 0.13, 0.015) },
    edgeColor: { value: new Color(1, 0.75, 0.44) },
    rimColor: { value: new Color(1, 0.4, 0.1) },
    pale: { value: new Color(0.42, 0.36, 0.33) }
  };
  material.userData.ash = ash;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAshTime = ash.time;
    shader.uniforms.uAshHeat = ash.heat;
    shader.uniforms.uAshForm = ash.form;
    shader.uniforms.uAshCrumble = ash.crumble;
    shader.uniforms.uAshHeight = ash.height;
    shader.uniforms.uAshEdge = ash.edge;
    shader.uniforms.uAshFissure = ash.fissure;
    shader.uniforms.uAshSpeed = ash.speed;
    shader.uniforms.uAshGrain = ash.grain;
    shader.uniforms.uAshFissureColor = ash.fissureColor;
    shader.uniforms.uAshEdgeColor = ash.edgeColor;
    shader.uniforms.uAshRimColor = ash.rimColor;
    shader.uniforms.uAshPale = ash.pale;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAshWorld;')
      // After skinning: `transformed` is the posed vertex in mesh space.
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvAshWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vAshWorld;
        uniform float uAshTime;
        uniform float uAshHeat;
        uniform float uAshForm;
        uniform float uAshCrumble;
        uniform float uAshHeight;
        uniform float uAshEdge;
        uniform float uAshFissure;
        uniform float uAshSpeed;
        uniform float uAshGrain;
        uniform vec3 uAshFissureColor;
        uniform vec3 uAshEdgeColor;
        uniform vec3 uAshRimColor;
        uniform vec3 uAshPale;
        ${noiseGLSL}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // Ash, not paint: coarse char grain with pale flecks of cooled ash.
          float ashG = snoise01(vAshWorld * uAshGrain * 0.35);
          diffuseColor.rgb *= 0.55 + 0.85 * ashG;
          float fleck = smoothstep(0.62, 0.8, snoise01(vAshWorld * uAshGrain * 0.9 + 4.1));
          diffuseColor.rgb = mix(diffuseColor.rgb, uAshPale, fleck * 0.7);
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // The echo stands on y = 0; both fronts measure height off the floor.
          float ashH = clamp(vAshWorld.y / max(uAshHeight, 0.05), 0.0, 1.0);
          float ashN = snoise01(vAshWorld * 5.0);
          float ashKeep = min(uAshForm * 1.25 - 0.1 - ashH, 1.15 - uAshCrumble * 1.3 - ashH) + (ashN - 0.5) * 0.25;
          if (ashKeep < 0.0) discard;
          float ashBurn = 1.0 - smoothstep(0.0, max(uAshEdge, 1e-3), ashKeep);
          float ashSeam = pow(max(0.0, 1.0 - abs(sin(vAshWorld.y * uAshFissure + snoise(vAshWorld * 3.0) * 1.8 + uAshTime * uAshSpeed)) * 7.0), 2.0);
          ashSeam *= 0.5 + 0.5 * snoise01(vAshWorld * 9.0 + vec3(0.0, -uAshTime * 1.3, 0.0));
          // An ember rim on the silhouette, so the dark body reads off the floor.
          float ashRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
          totalEmissiveRadiance += uAshFissureColor * ashSeam * (1.0 + uAshHeat * 1.5)
                                 + uAshRimColor * ashRim * (1.0 + uAshHeat)
                                 + uAshEdgeColor * ashBurn * 3.0;
        }`
      );
  };
  material.customProgramCacheKey = () => 'ashen-doppelganger-rig-v3';

  /** @param {{clock:number, heat:number, form:number, crumble:number, height:number, opacity:number}} state */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    // Solid ash while whole; only a thinned echo blends.
    const blend = state.opacity < 0.99;
    if (material.transparent !== blend) {
      material.transparent = blend;
      material.depthWrite = !blend;
      material.needsUpdate = true;
    }
    material.opacity = state.opacity;
    material.color.copy(getColor(c.colorRigBody));
    material.emissive.copy(getColor(c.colorRigEmissive));
    material.emissiveIntensity = c.rigEmissive * g.glow;
    ash.time.value = state.clock;
    ash.heat.value = state.heat * c.heatFlare;
    ash.form.value = state.form;
    ash.crumble.value = state.crumble;
    ash.height.value = state.height;
    ash.edge.value = c.burnEdge;
    ash.fissure.value = c.fissureScale * 1.1 * g.noiseFrequency;
    ash.speed.value = c.fissureSpeed * g.noiseSpeed;
    ash.grain.value = c.crustGrain;
    ash.fissureColor.value.copy(getColor(c.colorFissure)).multiplyScalar(c.fissureGlow * g.glow);
    ash.edgeColor.value.copy(getColor(c.colorBurnEdge));
    ash.rimColor.value.copy(getColor(c.colorRim)).multiplyScalar(c.rimGlow * g.glow * g.fresnel);
    ash.pale.value.copy(getColor(c.colorRigAsh));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The sigil                                                            */
/* -------------------------------------------------------------------- */

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SIGIL_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uOpacity;
  uniform float uPulse;      // 0 at the pulse, 1 when its ring has run out
  uniform float uHeat;       // 0..1 as the next pulse nears
  uniform float uGlow;
  uniform float uRing;
  uniform float uCracks;
  uniform vec3  uColor;
  uniform vec3  uColorHot;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);

    // The standing circle, wavering like a heat line.
    float waver = snoise(vec3(p * 3.0, uClock * 0.6)) * 0.03;
    float ring = exp(-pow((r - uRing + waver) * 18.0, 2.0));

    // Radial cracks out from the feet, broken by noise so no two are alike.
    float spoke = pow(max(0.0, sin(a * uCracks + snoise(vec3(p * 4.0, 1.7)) * 2.0)), 14.0);
    float crackMask = smoothstep(uRing + 0.05, 0.12, r) * snoise01(vec3(p * 6.0, uClock * 0.3));
    float cracks = spoke * crackMask;

    // The pulse ring runs out from the body to the rim and dies.
    float shockR = 0.12 + uPulse * 0.82;
    float shock = exp(-pow((r - shockR) * 26.0, 2.0)) * (1.0 - uPulse);

    // A bed of ash right under the feet (dims, never brightens).
    float ash = smoothstep(0.5, 0.0, r) * (0.5 + 0.5 * fbm3(vec3(p * 5.0, 3.1)));

    float edge = 1.0 - smoothstep(0.84, 1.0, r);
    float glow = ring * (0.7 + uHeat * 0.6) + cracks * (0.35 + uHeat) + shock * 1.4;
    vec3 col = mix(uColor, uColorHot, clamp(shock + uHeat * ring * 0.5, 0.0, 1.0));
    float m = (glow + ash * 0.12) * edge * uOpacity * uShaderIntensity;
    if (m < 0.002) discard;
    gl_FragColor = vec4(col * m * uGlow * uGlobalGlow, m);
  }
`;

/** The ash circle and pulse ring under the echo. Additive. */
export function createSigilMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uOpacity: { value: 0 },
      uPulse: { value: 1 },
      uHeat: { value: 0 },
      uGlow: { value: 1 },
      uRing: { value: 0.74 },
      uCracks: { value: 12 },
      uColor: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: SIGIL_FRAGMENT
  });

  /** @param {{clock:number, heat:number}} state — uOpacity/uPulse are the ability's */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = state.clock;
    u.uHeat.value = state.heat;
    u.uGlow.value = c.sigilGlow * g.glow;
    u.uRing.value = c.sigilRing;
    u.uCracks.value = Math.round(c.sigilCracks);
    u.uColor.value.copy(getColor(c.colorSigil));
    u.uColorHot.value.copy(getColor(c.colorSigilHot));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The ember column                                                     */
/* -------------------------------------------------------------------- */

const EMBER_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uClock;
  uniform float uRate;
  uniform float uHeight;
  uniform float uSize;

  varying float vSeed;
  varying float vRise;

  ${noiseGLSL}

  void main() {
    vSeed = aSeed;
    float speed = 0.25 + aSeed * 0.6;
    float rise = fract(position.y + uClock * uRate * speed / max(uHeight, 0.1));
    vRise = rise;
    // An updraft: the column narrows and turns as it climbs.
    vec2 xz = rot2(uClock * (0.3 + aSeed * 0.4) + rise * 2.0) * position.xz;
    xz *= (1.0 - 0.45 * rise) * (0.85 + 0.15 * sin(uClock * 2.0 + aSeed * 15.0));
    vec3 p = vec3(xz.x, rise * uHeight, xz.y);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(uSize * (0.6 + aSeed * 0.8) * (1.0 - rise * 0.6) / max(1.0, -mv.z), 1.0, 9.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const EMBER_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying float vSeed;
  varying float vRise;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float disc = 1.0 - smoothstep(0.0, 0.5, d);
    // Fade in off the body and out at the top so the column never pops.
    float life = smoothstep(0.0, 0.12, vRise) * (1.0 - smoothstep(0.6, 1.0, vRise));
    float a = disc * life * uOpacity;
    vec3 col = mix(uColorA, uColorB, clamp(vSeed * (1.0 - vRise * 0.7), 0.0, 1.0));
    gl_FragColor = vec4(col * a * 1.6 * uGlobalGlow, a);
  }
`;

/** The baked ember column. `uOpacity` and `uRate` are written by the ability. */
export function createEmberColumnMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uOpacity: { value: 0 },
      uRate: { value: 1 },
      uHeight: { value: 2.2 },
      uSize: { value: 18 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: EMBER_VERTEX,
    fragmentShader: EMBER_FRAGMENT
  });

  /** @param {{clock:number}} state */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = state.clock;
    u.uHeight.value = c.emberHeight;
    u.uSize.value = c.emberSize * g.particleSize;
    u.uColorA.value.copy(getColor(c.colorEmberA));
    u.uColorB.value.copy(getColor(c.colorEmberB));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The fuse                                                             */
/* -------------------------------------------------------------------- */

const FUSE_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uFlicker;
  uniform vec3  uColorHot;
  uniform vec3  uColorAsh;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float across = abs(vUv.y - 0.5) * 2.0;
    float body = 1.0 - smoothstep(0.3, 1.0, across);
    // Coals welded to the floor, so the path does not crawl as it is redrawn.
    float coals = smoothstep(0.05, 0.6, fbm3(vec3(vWorld.xz * 3.0, uClock * 0.7)) + 0.35);
    // Hot where the caster has just walked (u = 1), ash where the echo treads.
    float heat = smoothstep(0.05, 1.0, vUv.x);
    float flick = 1.0 + uFlicker * 0.35 * snoise(vec3(vWorld.xz * 1.3, uClock * 4.0));
    // Both ends feathered: no hard cap at the echo's feet or the caster's.
    float ends = smoothstep(0.0, 0.1, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
    vec3 col = mix(uColorAsh, uColorHot * uGlow * uGlobalGlow * flick, heat * coals);
    float a = body * ends * uOpacity * (0.3 + 0.7 * coals) * uShaderIntensity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;

/** The smouldering path. Normal-blended so the cold end reads as ash. */
export function createFuseMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uOpacity: { value: 0 },
      uGlow: { value: 1.4 },
      uFlicker: { value: 1 },
      uColorHot: { value: new Color() },
      uColorAsh: { value: new Color() }
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: FUSE_FRAGMENT
  });

  /** @param {{clock:number, power:number}} state */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = state.clock;
    u.uOpacity.value = c.trailOpacity * state.power * g.opacity;
    u.uGlow.value = c.trailGlow * g.glow;
    u.uFlicker.value = c.trailFlicker;
    u.uColorHot.value.copy(getColor(c.colorTrailHot));
    u.uColorAsh.value.copy(getColor(c.colorTrailAsh));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The heat haze (distortion proxy)                                     */
/* -------------------------------------------------------------------- */

const HAZE_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;

  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    // Camera-facing, standing on the echo's feet.
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * vec2(uWidth * 2.0, uHeight);
    vWorld = (modelMatrix * vec4(position.x * uWidth * 2.0, position.y * uHeight, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const HAZE_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale * 0.6 - uClock * uSpeed);
    float nx = snoise(np);
    float ny = snoise(np + vec3(19.3, 7.7, 31.1));
    vec2 c = (vUv - 0.5) * 2.0;
    // Feathered on every side; strongest at chest height, thinning upward.
    float mask = (1.0 - smoothstep(0.2, 1.0, abs(c.x)))
               * smoothstep(0.0, 0.25, vUv.y)
               * (1.0 - smoothstep(0.45, 1.0, vUv.y));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(vec2(nx, ny) * 0.5 + 0.5, strength, mask);
  }
`;

/** Heat shimmer over the echo, drawn into the distortion layer. */
export function createHeatHazeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uWidth: { value: 1.4 },
      uHeight: { value: 2.6 },
      uStrength: { value: 0 },
      uScale: { value: 2.2 },
      uSpeed: { value: 1.4 }
    }),
    vertexShader: HAZE_VERTEX,
    fragmentShader: HAZE_FRAGMENT
  });

  /** @param {{clock:number, power:number}} state */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = state.clock;
    u.uWidth.value = c.hazeWidth;
    u.uHeight.value = c.hazeHeight;
    u.uStrength.value = c.hazeStrength * state.power * g.distortion;
    u.uScale.value = c.hazeScale * g.noiseFrequency;
    u.uSpeed.value = c.hazeSpeed * g.noiseSpeed;
  };

  return material;
}


/* -------------------------------------------------------------------- */
/* The echo's own cast: brand, tail, cinder spires, cinder field        */
/* -------------------------------------------------------------------- */

/**
 * The cinder ramp every layer of the echo's cast is coloured from:
 * `colorCinderA` white-hot core → `B` pale gold → `C` saturated ember →
 * `D` the dark char that grounds it on the floor.
 */
function cinderRamp() {
  return {
    uRampA: { value: new Color() },
    uRampB: { value: new Color() },
    uRampC: { value: new Color() },
    uRampD: { value: new Color() }
  };
}

function syncRamp(u, c) {
  u.uRampA.value.copy(getColor(c.colorCinderA));
  u.uRampB.value.copy(getColor(c.colorCinderB));
  u.uRampC.value.copy(getColor(c.colorCinderC));
  u.uRampD.value.copy(getColor(c.colorCinderD));
}

const RAMP_GLSL = /* glsl */ `
  uniform vec3 uRampA;
  uniform vec3 uRampB;
  uniform vec3 uRampC;
  uniform vec3 uRampD;
  /** heat 1 = white-hot core, 0 = dark char. */
  vec3 cinder(float heat) {
    heat = clamp(heat, 0.0, 1.0);
    vec3 a = mix(uRampD, uRampC, smoothstep(0.0, 0.36, heat));
    vec3 b = mix(a, uRampB, smoothstep(0.34, 0.72, heat));
    return mix(b, uRampA, smoothstep(0.7, 1.0, heat));
  }
`;

/* ---- the brand (the coal the echo throws) ---- */

const BRAND_VERTEX = /* glsl */ `
  uniform float uClock;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  void main() {
    vLocal = position;
    // The coal boils: its crust heaves a little as it flies.
    vec3 p = position + normal * 0.05 * snoise(position * 4.0 + vec3(0.0, uClock * 2.0, 0.0));
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BRAND_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uGlow;
  uniform float uHeat;
  uniform float uFresnel;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec3 uLightDir;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    vec3 n = normalize(vNormalW);
    float lambert = 0.28 + 0.72 * max(dot(n, normalize(uLightDir)), 0.0);
    float crust = fbm3(vLocal * 5.0);
    // Cracks: the zero set of a moving noise, so they open and close.
    float seam = 1.0 - smoothstep(0.0, 0.16, abs(snoise(vLocal * 3.2 + vec3(0.0, uClock * 0.9, 0.0))));
    float rim = fresnelTerm(vViewDir, n, 2.2, uFresnel);
    float heat = clamp(seam * (0.75 + 0.5 * uHeat) + rim * 0.45, 0.0, 1.0);
    vec3 base = uRampD * (0.55 + 0.9 * crust) * lambert;
    vec3 glow = cinder(heat) * heat * uGlow * (1.0 + uHeat) * uGlobalGlow * uShaderIntensity;
    gl_FragColor = vec4(base + glow, 1.0);
  }
`;

/** The thrown coal: opaque, sun-lit char with boiling, glowing seams. */
export function createBrandMaterial() {
  const material = new ShaderMaterial({
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uGlow: { value: 2 },
      uHeat: { value: 0 },
      uFresnel: { value: 1 },
      ...cinderRamp()
    }),
    vertexShader: BRAND_VERTEX,
    fragmentShader: BRAND_FRAGMENT
  });
  /** @param {{clock:number, heat:number}} state */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = state.clock;
    u.uHeat.value = state.heat;
    u.uGlow.value = c.brandGlow * g.glow;
    u.uFresnel.value = g.fresnel;
    syncRamp(u, c);
  };
  return material;
}

/* ---- the brand's flame tail ---- */

const TAIL_VERTEX = /* glsl */ `
  uniform float uClock;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  void main() {
    vUv = uv;
    vec3 p = position;
    // Tongues: the cone's radius is torn by noise running down the tail.
    float tongue = snoise(vec3(uv.x * 6.2832, uv.y * 3.0 - uClock * 6.0, 1.7));
    p.xz *= 1.0 + 0.35 * tongue * uv.y;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const TAIL_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  ${RAMP_GLSL}
  void main() {
    float n = snoise(vec3(vUv.x * 9.0, vUv.y * 5.0 - uClock * 8.0, 0.0));
    float along = clamp(vUv.y + n * 0.12, 0.0, 1.0);
    // Soft silhouette: facing fragments are thick, grazing ones thin.
    float facing = pow(abs(dot(normalize(vNormalW), normalize(vViewDir))), 1.4);
    float body = (1.0 - smoothstep(0.45, 1.0, along)) * facing;
    float a = body * uOpacity * uShaderIntensity;
    if (a < 0.003) discard;
    vec3 col = cinder(1.0 - along * 1.05) * uGlow * uGlobalGlow;
    gl_FragColor = vec4(col * a, a);
  }
`;

/** The flame cone streaming behind the brand. Additive. */
export function createBrandTailMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uOpacity: { value: 0 },
      uGlow: { value: 2 },
      ...cinderRamp()
    }),
    vertexShader: TAIL_VERTEX,
    fragmentShader: TAIL_FRAGMENT
  });
  /** @param {{clock:number, power:number}} state */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = state.clock * g.noiseSpeed;
    u.uOpacity.value = state.power * g.opacity;
    u.uGlow.value = c.brandGlow * 0.8 * g.glow;
    syncRamp(u, c);
  };
  return material;
}

/* ---- the cinder spires (lit, shadowing, world layer) ---- */

const SPIRE_COMMON = /* glsl */ `
  uniform float uSpireClock;
  uniform float uSpireHeat;     // 0..1 how hot the stone still is
  uniform float uSpirePulse;    // 0..1 the echo's pulse re-flaring it
  uniform float uSpireCrumble;  // 0..1 crumbled from the crown down
  uniform float uSpireVeinScale;
  uniform float uSpireVeinGlow;
  uniform float uSpireEdge;
  uniform vec3 uSpireAsh;
  varying vec3 vSpireLocal;
  varying vec3 vSpireWorld;
`;

/**
 * The cinder spire: a `MeshStandardMaterial` (lit by the sun, casting
 * shadows) patched with ash grain in colour and roughness, glowing veins
 * that are white-hot at the root and cool up the shard, a pale ash coat that
 * settles on the crown as the stone cools, and a crown-down crumble with a
 * white-hot edge.
 */
export function createSpireMaterial() {
  const material = new MeshStandardMaterial({
    color: 0x2b211d,
    roughness: 0.92,
    metalness: 0.04,
    flatShading: true
  });
  const spire = {
    uSpireClock: { value: 0 },
    uSpireHeat: { value: 1 },
    uSpirePulse: { value: 0 },
    uSpireCrumble: { value: 0 },
    uSpireVeinScale: { value: 6 },
    uSpireVeinGlow: { value: 3 },
    uSpireEdge: { value: 0.08 },
    uSpireAsh: { value: new Color() },
    ...cinderRamp()
  };
  material.userData.spire = spire;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, spire);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSpireLocal;\nvarying vec3 vSpireWorld;`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vSpireLocal = position;
        {
          vec4 spireP = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            spireP = instanceMatrix * spireP;
          #endif
          vSpireWorld = (modelMatrix * spireP).xyz;
        }`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SPIRE_COMMON}\n${noiseGLSL}\n${RAMP_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float spireGrain = snoise01(vSpireWorld * vec3(7.0, 3.0, 7.0));
        diffuseColor.rgb *= 0.55 + 0.9 * spireGrain;
        // Pale ash settles on the upper faces as the stone cools.
        float spireCoat = smoothstep(0.55, 0.8, snoise01(vSpireWorld * 5.0 + 3.1) + vSpireLocal.y * 0.35) * (1.0 - uSpireHeat * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, uSpireAsh, spireCoat * 0.75);`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.75 + 0.4 * spireGrain), 0.3, 1.0);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float h = clamp(vSpireLocal.y, 0.0, 1.06);
          float keep = (1.1 - uSpireCrumble * 1.3) - h + snoise(vSpireWorld * 4.0) * 0.1;
          if (keep < 0.0) discard;
          float burn = 1.0 - smoothstep(0.0, max(uSpireEdge, 1e-3), keep);
          // Veins: the ridge of a noise field stretched up the shard.
          float v = 1.0 - abs(snoise(vSpireWorld * vec3(uSpireVeinScale, uSpireVeinScale * 0.45, uSpireVeinScale) + vec3(0.0, -uSpireClock * 0.35, 0.0)));
          float vein = pow(v, 16.0);
          float heat = clamp(uSpireHeat * (1.15 - h * 0.75) + uSpirePulse * 0.55, 0.0, 1.0);
          totalEmissiveRadiance += cinder(heat) * vein * uSpireVeinGlow * (0.25 + heat);
          // The root still glows where it tore out of the floor.
          totalEmissiveRadiance += cinder(heat * 0.85) * smoothstep(0.22, 0.0, h) * heat * uSpireVeinGlow * 0.35;
          totalEmissiveRadiance += uRampA * burn * 3.0;
        }`
      );
  };
  material.customProgramCacheKey = () => 'ashen-doppelganger-spire-v1';
  /** @param {{clock:number, heat:number, pulse:number, crumble:number}} state */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    material.color.copy(getColor(c.colorSpireRock));
    material.roughness = c.spireRoughness;
    spire.uSpireClock.value = state.clock;
    spire.uSpireHeat.value = state.heat;
    spire.uSpirePulse.value = state.pulse;
    spire.uSpireCrumble.value = state.crumble;
    spire.uSpireVeinScale.value = c.spireVeinScale * g.noiseFrequency;
    spire.uSpireVeinGlow.value = c.spireVeinGlow * g.glow * g.shaderIntensity;
    spire.uSpireEdge.value = c.burnEdge;
    spire.uSpireAsh.value.copy(getColor(c.colorSpireAsh));
    syncRamp(spire, c);
  };
  return material;
}

/* ---- the cinder field (the floor the brand tears open) ---- */

const FIELD_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uOpacity;
  uniform float uReveal;     // 0..1 the field tears open from the centre
  uniform float uHeat;       // 0..1 how hot the cracks still are
  uniform float uPulse;      // 0..1 the echo's pulse re-flaring the cracks
  uniform float uGlow;
  uniform float uCrackScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${RAMP_GLSL}

  /** Distance to the nearest cell border (F2 - F1): the crack network. */
  float crackEdge(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
    }
    return sqrt(d2) - sqrt(d1);
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float n = fbm3(vec3(vWorld.xz * 1.1, 4.2));
    // A ragged burn edge, and the tear front running out from the centre.
    float rim = 0.8 + 0.17 * n;
    float front = uReveal * 1.12 + n * 0.08;
    float mask = (1.0 - smoothstep(rim - 0.1, rim, r)) * (1.0 - smoothstep(front - 0.06, front, r));
    if (mask < 0.003) discard;

    // Crust: charred, broken plates.
    float crust = fbm3(vec3(vWorld.xz * 3.2, 1.3));
    vec3 col = uRampD * (0.45 + 0.7 * crust);

    // Cracks between the plates, warped so they are not a tidy honeycomb.
    vec2 q = vWorld.xz * uCrackScale + vec2(snoise(vec3(vWorld.xz * 0.8, 1.0)), snoise(vec3(vWorld.xz * 0.8, 7.0))) * 0.6;
    float e = crackEdge(q);
    float width = 0.05 + 0.07 * (1.0 - r);
    float crack = 1.0 - smoothstep(0.0, width, e);
    // Hot at the centre, cooling outward and over time; coals breathe.
    float breathe = 0.15 * snoise(vec3(q * 0.6, uClock * 0.9));
    float heat = clamp(uHeat * (1.2 - r * 0.85) + uPulse * 0.35 + breathe, 0.0, 1.0);
    // The tear front itself is white-hot as it runs out.
    float tear = exp(-pow((r - front) * 12.0, 2.0)) * (1.0 - uReveal * 0.6);
    float glowAmt = crack * (0.25 + heat) + tear;
    vec3 hot = cinder(heat + tear) * uGlow * uGlobalGlow * uShaderIntensity * (0.6 + 1.6 * heat + tear * 2.0);
    col = mix(col, hot, clamp(glowAmt, 0.0, 1.0));
    float a = mask * uOpacity * (0.82 + 0.18 * crack);
    gl_FragColor = vec4(col, a);
  }
`;

/** The torn, smouldering floor under the cinder crown. Normal-blended. */
export function createCinderFieldMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uOpacity: { value: 0 },
      uReveal: { value: 0 },
      uHeat: { value: 1 },
      uPulse: { value: 0 },
      uGlow: { value: 2 },
      uCrackScale: { value: 2.4 },
      ...cinderRamp()
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: FIELD_FRAGMENT
  });
  /** @param {{clock:number, opacity:number, reveal:number, heat:number, pulse:number}} state */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = state.clock;
    u.uOpacity.value = state.opacity * c.fieldOpacity * g.opacity;
    u.uReveal.value = state.reveal;
    u.uHeat.value = state.heat;
    u.uPulse.value = state.pulse;
    u.uGlow.value = c.fieldGlow * g.glow;
    u.uCrackScale.value = c.fieldCrackScale * g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}
