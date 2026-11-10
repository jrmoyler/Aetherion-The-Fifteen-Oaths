import { Color, DoubleSide, MeshStandardMaterial, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Existence Tax — the bespoke materials.
 *
 * One four-stop void ramp colours everything: `colorCore` (white-violet, the
 * only HDR stop) → `colorTint` (pale violet) → `colorBody` (saturated violet)
 * → `colorDeep` (violet-black, which is what lets the void read as *absence*
 * on the dark floor instead of as fog). The void eats light, so the large
 * surfaces are dark — obsidian, ash, a floor gone black — and the light lives
 * only in lines: grooves, the ledger, the throat's lip, the cracks.
 *
 *  - **the well** (`createWellMaterial`) — glossy obsidian, a lit, shadowing
 *    `MeshStandardMaterial` (it reflects the HDR probe, so it reads as solid
 *    black glass, not as a flat polygon). The patch adds emission only: spiral
 *    grooves on the inner wall whose light runs *down* toward the throat, a
 *    white-violet photon lip round the throat, a ledger of arcs round the rim
 *    that lights one quarter per assessment, tally ticks, a violet fresnel —
 *    and kills the diffuse inside the throat, so the hole is a hole.
 *  - **the coins** (`createCoinMaterial`) — dark minted metal, instanced; an
 *    engraved rim and the square hole glow, brighter the deeper the coin is in
 *    the well, and a noise dissolve eats it as the throat takes it.
 *  - **the fins** (`createFinMaterial`) — obsidian with a lit tally edge that
 *    flares on each assessment.
 *  - **the field** (`createFieldMaterial`) — the excised floor: normal-blended
 *    so it *darkens* the ground, with veins of light dragged round the throat
 *    by differential rotation (`ω ∝ 1/r`), two ledger rings with tally ticks,
 *    the quarter arcs, a black hole at the centre, and a noise dissolve.
 *  - **the vortex** (`createVortexMaterial`) — an inverted funnel cloud over
 *    the throat: a reshaped open cylinder, fbm smoke streaming *downward*,
 *    normal-blended dark with violet seams; it is drained into the throat at
 *    the swallow.
 *  - **the lens** (`createLensMaterial`) — `LAYER.DISTORTION` proxy: inward
 *    pinch round the throat that grows with the assessment, and a pressure
 *    ring on landing.
 *
 * Every material reads `settings.existenceTax` in `userData.sync(state)`.
 */

const ID = config.id;

/** The void ramp, as GLSL: t 0 = deep, 1 = core (> 1 overdrives the core). */
const RAMP_GLSL = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  vec3 voidRamp(float t) {
    t = clamp(t, 0.0, 1.4);
    vec3 c = mix(uDeep, uBody, smoothstep(0.0, 0.38, t));
    c = mix(c, uTint, smoothstep(0.34, 0.74, t));
    c = mix(c, uCore, smoothstep(0.7, 1.0, t));
    return c * (1.0 + max(0.0, t - 0.85) * 2.2);
  }
`;

/** A tiny value noise for the patched standard materials (no lib clash). */
const ET_NOISE = /* glsl */ `
  float etHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float etNoise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = mix(mix(etHash(i), etHash(i + vec3(1,0,0)), f.x), mix(etHash(i + vec3(0,1,0)), etHash(i + vec3(1,1,0)), f.x), f.y);
    float b = mix(mix(etHash(i + vec3(0,0,1)), etHash(i + vec3(1,0,1)), f.x), mix(etHash(i + vec3(0,1,1)), etHash(i + vec3(1,1,1)), f.x), f.y);
    return mix(a, b, f.z);
  }
`;

const rampUniforms = () => ({
  uCore: { value: new Color() },
  uTint: { value: new Color() },
  uBody: { value: new Color() },
  uDeep: { value: new Color() },
});

function syncRamp(u, c) {
  u.uCore.value.copy(getColor(c.colorCore));
  u.uTint.value.copy(getColor(c.colorTint));
  u.uBody.value.copy(getColor(c.colorBody));
  u.uDeep.value.copy(getColor(c.colorDeep));
}

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

/* -------------------------------------------------------------------- */
/* 1 · The well                                                         */
/* -------------------------------------------------------------------- */

/**
 * Obsidian with the ledger in its emissive. `aWell` = (region, q, angle01):
 * region 0 outer wall, 1 lip, 2 inner well (q 0 at the lip → 1 at the
 * throat), 3 throat (q 0 at the lip of the hole → 1 under the floor).
 */
export function createWellMaterial() {
  const material = new MeshStandardMaterial({ color: 0x0c0a12, metalness: 0.35, roughness: 0.16, side: DoubleSide });
  const u = {
    uClock: { value: 0 },
    uLevied: { value: 0 }, // ledger arcs lit (float, 0..ticks)
    uTicks: { value: 4 },
    uTickFlash: { value: 0 }, // decaying flare of the latest assessment
    uSwallow: { value: 0 }, // throat flare at the consumption
    uFade: { value: 1 },
    uArms: { value: 3 },
    uTwist: { value: 2.6 },
    uFlow: { value: 0.7 },
    uGrooveGlow: { value: 1.6 },
    uLedgerGlow: { value: 2.6 },
    uThroatGlow: { value: 3.2 },
    uRimFresnel: { value: 1.1 },
    uGlowG: { value: 1 },
    ...rampUniforms(),
  };
  material.userData.uniforms = u;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aWell;\nvarying vec3 vWell;\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWell = aWell;\nvLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWell;
        varying vec3 vLocal;
        uniform float uClock, uLevied, uTicks, uTickFlash, uSwallow, uFade;
        uniform float uArms, uTwist, uFlow, uGrooveGlow, uLedgerGlow, uThroatGlow, uRimFresnel, uGlowG;
        ${RAMP_GLSL}
        ${ET_NOISE}
        float etRegion(float r) { return step(r - 0.5, vWell.x) * step(vWell.x, r + 0.5); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // The throat is a hole: no albedo below its lip.
        float etAbyss = etRegion(3.0) * smoothstep(0.05, 0.45, vWell.y);
        diffuseColor.rgb *= 1.0 - etAbyss;
        // Obsidian grain: faint veining so the black has a surface.
        diffuseColor.rgb *= 0.75 + 0.5 * etNoise(vLocal * 7.0);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 1.0, etAbyss);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float q = vWell.y;
          float r = length(vLocal.xz);
          float phi = atan(vLocal.z, vLocal.x);
          vec3 V = normalize(vViewPosition);
          float fres = pow(1.0 - abs(dot(normal, V)), 4.0);
          vec3 glow = vec3(0.0);

          // Inner wall: spiral grooves, their light running down to the throat.
          float inner = etRegion(2.0);
          float sp = fract(phi / 6.2831853 * uArms + log(max(r, 0.05)) * uTwist + uClock * uFlow);
          float line = 1.0 - smoothstep(0.015, 0.06, abs(sp - 0.5));
          float pulse = 0.65 + 0.35 * uTickFlash;
          glow += voidRamp(0.3 + 0.65 * q) * line * uGrooveGlow * inner * pulse * (0.35 + 0.65 * q);
          // Concentric ledger lines every so often down the well.
          float rings = smoothstep(0.44, 0.49, abs(fract(q * 6.0) - 0.5));
          glow += voidRamp(0.4) * rings * inner * 0.25 * uGrooveGlow;

          // The photon lip round the throat, and its flare at the swallow.
          float lipBand = inner * smoothstep(0.82, 1.0, q) + etRegion(3.0) * (1.0 - smoothstep(0.0, 0.3, q));
          glow += voidRamp(0.92 + 0.35 * uSwallow) * lipBand * uThroatGlow * (1.0 + uSwallow * 1.5);

          // The rolled lip carries the ledger: one arc per assessment.
          float lip = etRegion(1.0);
          float seg = vWell.z * uTicks;
          float idx = floor(seg);
          float f = fract(seg);
          float arc = smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.95, 1.0, f));
          float lit = step(idx + 0.5, uLevied);
          float current = lit * (1.0 - step(idx + 1.5, uLevied));
          float tally = step(0.8, fract(f * 7.0)) * arc;
          float ledger = arc * (0.1 + lit * (0.85 + current * uTickFlash * 2.2)) + tally * (0.25 + lit * 0.5);
          glow += voidRamp(0.55 + 0.35 * lit + 0.35 * current * uTickFlash) * ledger * lip * uLedgerGlow;

          // Outer wall: engraved columns that fill with light as the ledger fills.
          float outer = etRegion(0.0);
          float col = smoothstep(0.43, 0.49, abs(fract(vWell.z * 36.0) - 0.5));
          float filled = smoothstep(0.0, 1.0, uLevied / max(1.0, uTicks));
          glow += voidRamp(0.45 + 0.3 * filled) * col * outer * q * (0.15 + 0.6 * filled) * uLedgerGlow * 0.5;

          // A violet rim on the black glass, so the silhouette never melts into the floor.
          glow += voidRamp(0.5) * fres * uRimFresnel * (1.0 - etAbyss);

          totalEmissiveRadiance += glow * uGlowG * uFade;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'existence-tax-well';
  /** @param {{ clock:number, levied:number, ticks:number, flash:number, swallow:number, fade:number }} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    material.color.copy(getColor(c.obsidianColor));
    material.metalness = c.obsidianMetalness;
    material.roughness = c.obsidianRoughness;
    material.envMapIntensity = 1;
    u.uClock.value = s.clock;
    u.uLevied.value = s.levied;
    u.uTicks.value = s.ticks;
    u.uTickFlash.value = s.flash;
    u.uSwallow.value = s.swallow;
    u.uFade.value = s.fade;
    u.uArms.value = Math.max(1, Math.round(c.grooveArms));
    u.uTwist.value = c.grooveTwist;
    u.uFlow.value = c.grooveFlow * g.noiseSpeed;
    u.uGrooveGlow.value = c.grooveGlow;
    u.uLedgerGlow.value = c.ledgerGlow;
    u.uThroatGlow.value = c.throatGlow;
    u.uRimFresnel.value = c.rimFresnel * g.fresnel;
    u.uGlowG.value = g.glow * g.shaderIntensity;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 2 · The coins                                                        */
/* -------------------------------------------------------------------- */

/**
 * Minted dark metal for the instanced tithe coins and the writ. Per instance
 * `aCoin` = (heat 0..1, dissolve 0..1).
 */
export function createCoinMaterial() {
  const material = new MeshStandardMaterial({ color: 0x1a1426, metalness: 0.82, roughness: 0.3 });
  const u = {
    uCoinGlow: { value: 1.8 },
    uGlowG: { value: 1 },
    uFade: { value: 1 },
    ...rampUniforms(),
  };
  material.userData.uniforms = u;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCoin;\nvarying vec2 vCoin;\nvarying vec3 vCoinPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoin = aCoin;\nvCoinPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vCoin;
        varying vec3 vCoinPos;
        uniform float uCoinGlow, uGlowG, uFade;
        ${RAMP_GLSL}
        ${ET_NOISE}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        // Eaten by the throat: a noisy dissolve that leaves a burning lip.
        float etN = etNoise(vCoinPos * 9.0 + vCoin.x * 3.0);
        if (etN < vCoin.y * 1.05) discard;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float r = length(vCoinPos.xy);
          float face = smoothstep(0.02, 0.06, abs(vCoinPos.z));
          float rim = smoothstep(0.42, 0.47, r);
          float ring = 1.0 - smoothstep(0.0, 0.018, abs(r - 0.33));
          vec2 a = abs(vCoinPos.xy);
          float hole = 1.0 - smoothstep(0.0, 0.035, max(a.x, a.y) - 0.135);
          float burn = smoothstep(vCoin.y * 1.05, vCoin.y * 1.05 + 0.12, etN);
          float edge = (1.0 - burn) * step(0.001, vCoin.y);
          float heat = vCoin.x;
          vec3 glow = voidRamp(0.45 + 0.5 * heat) * (rim * 0.9 + ring * face * 0.8 + hole * 1.2) * (0.35 + 0.65 * heat);
          glow += voidRamp(1.05) * edge * 2.0;
          totalEmissiveRadiance += glow * uCoinGlow * uGlowG * uFade;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'existence-tax-coin';
  /** @param {{ fade:number, glow:number }} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    u.uCoinGlow.value = s.glow;
    u.uGlowG.value = g.glow * g.shaderIntensity;
    u.uFade.value = s.fade;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 3 · The fins                                                         */
/* -------------------------------------------------------------------- */

/** Obsidian blades whose notched outer edge flares on each assessment. */
export function createFinMaterial() {
  const material = new MeshStandardMaterial({ color: 0x0c0a12, metalness: 0.4, roughness: 0.22 });
  const u = { uFinGlow: { value: 1 }, uFlash: { value: 0 }, uFill: { value: 0 }, uGlowG: { value: 1 }, ...rampUniforms() };
  material.userData.uniforms = u;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFin;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFin = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFin;\nuniform float uFinGlow, uFlash, uFill, uGlowG;\n${RAMP_GLSL}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // The outer, notched edge (x past the wall) lights from the floor up as the ledger fills.
          float outerEdge = smoothstep(0.45, 0.8, vFin.x);
          float climb = 1.0 - smoothstep(uFill - 0.05, uFill + 0.05, vFin.y);
          float seam = 1.0 - smoothstep(0.0, 0.012, abs(vFin.z) - 0.028);
          vec3 glow = voidRamp(0.5 + 0.4 * uFlash) * outerEdge * (0.15 + climb * 0.85) * (0.6 + 0.4 * seam);
          totalEmissiveRadiance += glow * uFinGlow * (1.0 + uFlash * 1.5) * uGlowG;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'existence-tax-fin';
  /** @param {{ flash:number, fill:number, fade:number }} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    material.color.copy(getColor(c.obsidianColor));
    material.metalness = c.obsidianMetalness;
    material.roughness = c.obsidianRoughness + 0.06;
    u.uFinGlow.value = c.ledgerGlow * 0.6 * s.fade;
    u.uFlash.value = s.flash;
    u.uFill.value = s.fill;
    u.uGlowG.value = g.glow * g.shaderIntensity;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 4 · The field                                                        */
/* -------------------------------------------------------------------- */

const FIELD_FRAGMENT = /* glsl */ `
  uniform float uRadius;   // field radius (m)
  uniform float uRim;      // well rim radius (m)
  uniform float uFoot;     // where the outer wall meets the floor (m)
  uniform float uThroat;   // hole radius (m)
  uniform float uFront;    // excision front 0..1 (landing)
  uniform float uLevied, uTicks, uTickFlash;
  uniform float uTelegraph;
  uniform float uDissolve;
  uniform float uDark, uGlow, uCrack, uClock, uFade, uScale, uSwallow;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${RAMP_GLSL}
  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * uRadius;
    float r = length(p);
    if (r > uRadius) discard;
    float ang = atan(p.y, p.x);
    float edge = 1.0 - smoothstep(uRadius * 0.78, uRadius, r);

    // Excision front: the floor is eaten from the throat outward on landing.
    float front = uFront * uRadius * 1.08;
    float n = snoise(vec3(p * 0.9 * uScale, 3.1));
    float inside = 1.0 - smoothstep(front - 0.35, front + 0.05, r + n * 0.25);

    // Differential rotation: the floor is dragged round the throat, faster near it.
    float swirl = uClock * 1.6 / max(r, 0.35);
    vec2 sp = mat2(cos(swirl), -sin(swirl), sin(swirl), cos(swirl)) * p;
    float vein = 1.0 - abs(snoise(vec3(sp * uCrack * 0.55 * uScale, 1.7)));
    vein = pow(vein, 9.0);
    float vein2 = pow(1.0 - abs(snoise(vec3(sp * uCrack * 1.3 * uScale, 8.2))), 14.0);
    float cracks = (vein + vein2 * 0.6) * smoothstep(uFoot * 0.85, uFoot * 1.1, r) * edge;

    // Ledger rings: one just outside the foot, one at the field's edge.
    float ringA = 1.0 - smoothstep(0.0, 0.035, abs(r - uFoot * 1.12));
    float ringB = 1.0 - smoothstep(0.0, 0.03, abs(r - uRadius * 0.88));
    float seg = (ang / 6.2831853 + 0.5) * uTicks;
    float idx = floor(seg);
    float f = fract(seg);
    float arc = smoothstep(0.0, 0.03, f) * (1.0 - smoothstep(0.97, 1.0, f));
    float lit = step(idx + 0.5, uLevied);
    float current = lit * (1.0 - step(idx + 1.5, uLevied));
    float ticks = step(0.86, fract(f * 9.0)) * (1.0 - smoothstep(0.0, 0.16, abs(r - uRadius * 0.83)));
    float ledger = ringB * arc * (0.25 + lit * (0.9 + current * uTickFlash * 2.0)) + ringA * 0.5 + ticks * (0.3 + lit * 0.6);

    // The hole at the centre: there is nothing there.
    float hole = 1.0 - smoothstep(uThroat * 0.9, uThroat * 1.08, r);
    float lipGlow = exp(-pow((r - uThroat) / 0.07, 2.0));

    // Telegraph (writ in the air): only the outer ledger, faint.
    float tele = uTelegraph * (ringB * arc + ticks * 0.6 + ringA * 0.4) * (1.0 - step(0.001, uFront));

    float drain = uLevied / max(1.0, uTicks);
    vec3 glow = voidRamp(0.35 + 0.45 * (1.0 - r / uRadius) + 0.25 * drain) * cracks * (0.45 + 0.75 * drain);
    glow += voidRamp(0.6 + 0.35 * lit + 0.3 * current * uTickFlash) * ledger;
    glow += voidRamp(1.0 + 0.3 * uSwallow) * lipGlow * (1.0 + uSwallow * 2.0);
    glow *= inside;
    glow += voidRamp(0.65) * tele;
    glow *= uGlow;

    float dark = uDark * inside * edge * (0.75 + 0.25 * snoise(vec3(p * 1.7 * uScale, 0.4)));
    dark = max(dark, hole * inside);

    // Exit: a noise dissolve with a burning lip.
    float dn = snoise(vec3(p * 1.4 * uScale, 9.0)) * 0.5 + 0.5;
    float keep = smoothstep(uDissolve, uDissolve + 0.06, dn + (1.0 - edge) * 0.0);
    float burnLip = (1.0 - smoothstep(0.0, 0.08, abs(dn - uDissolve))) * step(0.001, uDissolve);

    vec3 col = uDeep * 0.25 + glow + voidRamp(0.8) * burnLip * 1.5 * inside;
    float alpha = clamp(dark + length(glow) * 0.6 + tele, 0.0, 1.0) * keep + burnLip * inside * 0.6;
    alpha *= uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

/** The excised floor. Normal-blended so it darkens the ground it covers. */
export function createFieldMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      uRadius: { value: 4 },
      uRim: { value: 3 },
      uFoot: { value: 2.4 },
      uThroat: { value: 0.4 },
      uFront: { value: 0 },
      uLevied: { value: 0 },
      uTicks: { value: 4 },
      uTickFlash: { value: 0 },
      uTelegraph: { value: 0 },
      uDissolve: { value: 0 },
      uDark: { value: 0.85 },
      uGlow: { value: 1.4 },
      uCrack: { value: 2.2 },
      uClock: { value: 0 },
      uFade: { value: 1 },
      uScale: { value: 1 },
      uSwallow: { value: 0 },
      ...rampUniforms(),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: FIELD_FRAGMENT,
  });
  /** @param {object} s { radius, rim, foot, throat, front, levied, ticks, flash, telegraph, dissolve, clock, fade, swallow } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uRadius.value = s.radius;
    u.uRim.value = s.rim;
    u.uFoot.value = s.foot;
    u.uThroat.value = s.throat;
    u.uFront.value = s.front;
    u.uLevied.value = s.levied;
    u.uTicks.value = s.ticks;
    u.uTickFlash.value = s.flash;
    u.uTelegraph.value = s.telegraph * c.telegraph;
    u.uDissolve.value = s.dissolve;
    u.uDark.value = c.fieldDarkness;
    u.uGlow.value = c.fieldGlow * g.glow * g.shaderIntensity;
    u.uCrack.value = c.crackScale;
    u.uClock.value = s.clock;
    u.uFade.value = s.fade * g.opacity;
    u.uScale.value = g.noiseFrequency;
    u.uSwallow.value = s.swallow;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 5 · The vortex                                                       */
/* -------------------------------------------------------------------- */

const VORTEX_VERTEX = /* glsl */ `
  uniform float uHeight, uBase, uTop, uTwist, uClock, uDrain, uBaseY, uTurb;
  varying vec2 vUv;
  varying float vY;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    float y = position.y;
    float ang = atan(position.z, position.x);
    float h = uHeight * (1.0 - 0.88 * uDrain);
    // Pinched at the throat, flaring above, wobbling as it turns.
    float rad = mix(uBase, uTop * (1.0 - 0.5 * uDrain), pow(y, 1.6));
    rad *= 1.0 + uTurb * 0.14 * sin(ang * 3.0 + y * 9.0 - uClock * 2.3) * y;
    // The whole column precesses a little about the throat.
    vec2 lean = vec2(sin(uClock * 0.9), cos(uClock * 0.7)) * 0.18 * y * y * uTurb;
    vec3 p = vec3(cos(ang) * rad + lean.x, uBaseY + y * h, sin(ang) * rad + lean.y);
    vUv = vec2(ang / 6.2831853 + 0.5, y);
    vY = y;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * vec3(cos(ang), -0.25, sin(ang)));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const VORTEX_FRAGMENT = /* glsl */ `
  uniform float uTwist, uClock, uFlow, uOpacity, uGlowV, uFade, uScale;
  varying vec2 vUv;
  varying float vY;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${RAMP_GLSL}
  void main() {
    // Streaks wound round the column and flowing *down* into the throat.
    float u = vUv.x + vY * uTwist * 0.35;
    vec3 q = vec3(u * 6.0, vY * 3.2 + uClock * uFlow, 0.0) * uScale;
    q.xy = vec2(cos(u * 6.2831853), sin(u * 6.2831853)) * 1.4 + vec2(0.0, q.y);
    float d = fbm3(vec3(q.x * 1.3, q.y * 1.5, q.y * 0.3 + uClock * 0.2));
    float streak = smoothstep(0.42, 0.85, d * 0.5 + 0.5 + 0.25 * sin(u * 6.2831853 * 5.0 + vY * 7.0 + uClock * uFlow * 4.0));
    vec3 V = normalize(cameraPosition - vWorld);
    float side = 1.0 - abs(dot(normalize(vNormalW), V));
    float ends = smoothstep(0.0, 0.07, vY) * (1.0 - smoothstep(0.62, 1.0, vY));
    float alpha = streak * uOpacity * uFade * ends * (0.45 + 0.55 * side);
    if (alpha < 0.004) discard;
    // Dark ash with violet seams; hottest where it pours into the throat.
    float seam = smoothstep(0.55, 0.95, streak) * (1.0 - smoothstep(0.0, 0.6, vY) * 0.6);
    vec3 col = mix(uDeep * 0.6, uBody * 0.35, side * 0.5) + voidRamp(0.55 + 0.4 * (1.0 - vY)) * seam * uGlowV;
    gl_FragColor = vec4(col, alpha);
  }
`;

/** The inverted funnel cloud over the throat. */
export function createVortexMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHeight: { value: 4 },
      uBase: { value: 0.4 },
      uTop: { value: 1.5 },
      uTwist: { value: 2.4 },
      uClock: { value: 0 },
      uFlow: { value: 1.3 },
      uDrain: { value: 0 },
      uBaseY: { value: 0 },
      uTurb: { value: 1 },
      uOpacity: { value: 0.6 },
      uGlowV: { value: 1.2 },
      uFade: { value: 1 },
      uScale: { value: 1 },
      ...rampUniforms(),
    }),
    vertexShader: VORTEX_VERTEX,
    fragmentShader: VORTEX_FRAGMENT,
  });
  /** @param {object} s { height, base, top, clock, drain, baseY, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHeight.value = s.height;
    u.uBase.value = s.base;
    u.uTop.value = s.top;
    u.uTwist.value = c.vortexTwist;
    u.uClock.value = s.clock;
    u.uFlow.value = c.vortexFlow * g.noiseSpeed;
    u.uDrain.value = s.drain;
    u.uBaseY.value = s.baseY;
    u.uTurb.value = g.turbulence;
    u.uOpacity.value = c.vortexOpacity * g.opacity;
    u.uGlowV.value = c.vortexGlow * g.glow * g.shaderIntensity;
    u.uFade.value = s.fade;
    u.uScale.value = g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 6 · The lens                                                         */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uPinch;   // inward pull round the throat
  uniform float uShock;   // landing pressure ring strength
  uniform float uWave;    // its radius 0..1
  uniform float uClock;
  uniform float uScale;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    vec2 radial = q / max(r, 1e-3);
    vec2 tangent = vec2(-radial.y, radial.x);
    // Pinch peaks near the throat and falls off to the rim.
    float body = exp(-r * 3.2) * (1.0 - smoothstep(0.6, 1.0, r));
    float ring = exp(-pow((r - uWave) / 0.09, 2.0));
    vec3 np = vec3(q * 2.2 * uScale, uClock * 0.5);
    vec2 n = vec2(snoise(np), snoise(np + vec3(4.1, 2.3, 9.7))) * 0.25;
    vec2 dir = (-radial * 0.85 + tangent * 0.45 + n) * body * uPinch + (radial + n) * ring * uShock;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(body * uPinch + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** `LAYER.DISTORTION` disc. Opaque on purpose (see borrowed-tomorrow's lens). */
export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uPinch: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s { pinch, shock, wave, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uPinch.value = s.pinch * c.lensPinch * g.distortion;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
