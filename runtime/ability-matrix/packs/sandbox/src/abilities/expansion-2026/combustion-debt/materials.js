import { AdditiveBlending, Color, DoubleSide, FrontSide, MeshStandardMaterial, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Combustion Debt — the bespoke materials.
 *
 * Every layer takes its colour from one four-stop black-body ramp —
 * `colorCore` (white-hot, the only HDR stop) → `colorTint` → `colorBody` →
 * `colorDeep` (dull red-black, which is what grounds the cast on the dark
 * floor) — so heat reads the same on the iron, the floor and the flame.
 *
 *  - **the coil** (`createCoilMaterial`) — forged iron: a lit, shadowing
 *    `MeshStandardMaterial` whose emissive is patched with the heat of the
 *    debt. The length behind the heat front glows (`uFront` crawls from the
 *    floor end, s = 0, to the tip, s = 1), the leading edge is white-hot, hot
 *    spots crawl along the iron and the whole coil flares on each tick. After
 *    the call `uTemp` cools it back to black iron.
 *  - **the hob** (`createHobMaterial`) — the floor under the coil: a scorched
 *    disc (normal-blended, so it *darkens* the floor) that spreads from the
 *    slug's landing, heat pooled along the coil's own spiral (computed from
 *    the same parameters as the coil, so it stays under it as sliders move),
 *    voronoi cracks that open with the debt, a fire ring at the call, cooling
 *    embers, and a noise dissolve on the exit.
 *  - **the plume** (`createPlumeMaterial`) — the combustion column at the
 *    call: vertex-turbulated lathe, climbing fbm flame shaded through the ramp,
 *    burnt away bottom-up by a dissolve threshold.
 *  - **the slug** (`createSlugMaterial`) — the molten bead thrown at the
 *    target: fresnel crust over a white core.
 *  - **the brands** (`createBrandMaterial`) — instanced tally rings under each
 *    debtor: one notch per stack, flaring white once the debtor is past the
 *    ignite threshold.
 *  - **the haze** (`createHazeMaterial`) — `LAYER.DISTORTION` proxy: rising
 *    shimmer over the coil that grows with the debt, a pressure ring at the call.
 *
 * Every material reads `settings.combustionDebt` in `userData.sync(state)`.
 */

const ID = config.id;

const additive = (extra) => ({
  transparent: true,
  depthWrite: false,
  depthTest: true,
  blending: AdditiveBlending,
  side: DoubleSide,
  toneMapped: false,
  ...extra,
});

/** The ramp, as GLSL: t 0 = cold (deep), 1 = white-hot (core). */
const RAMP_GLSL = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  vec3 heatRamp(float t) {
    t = clamp(t, 0.0, 1.2);
    vec3 c = mix(uDeep, uBody, smoothstep(0.0, 0.4, t));
    c = mix(c, uTint, smoothstep(0.35, 0.75, t));
    c = mix(c, uCore, smoothstep(0.7, 1.0, t));
    return c * (1.0 + max(0.0, t - 0.85) * 2.0);
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
/* 1 · The coil                                                         */
/* -------------------------------------------------------------------- */

/**
 * Forged iron with the debt's heat in its emissive. Lit and shadowing; the
 * patch only adds emission, so the iron stays iron where it is cold.
 */
export function createCoilMaterial() {
  const material = new MeshStandardMaterial({ color: 0x2a2220, metalness: 0.6, roughness: 0.52 });
  const u = {
    uFront: { value: 0 }, // heat front, 0..1 along the coil
    uTemp: { value: 1 }, // overall temperature (cools after the call)
    uPulse: { value: 0 }, // tick flare, decays
    uClock: { value: 0 },
    uCrawl: { value: 1.4 },
    uGrain: { value: 5 },
    uTurns: { value: 3.25 },
    uHeatGlow: { value: 2.4 },
    uFrontGlow: { value: 3.2 },
    uGlobalGlow2: { value: 1 },
    ...rampUniforms(),
  };
  material.userData.uniforms = u;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCoil;\nvarying vec2 vCoil;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoil = aCoil;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vCoil;
        uniform float uFront;
        uniform float uTemp;
        uniform float uPulse;
        uniform float uClock;
        uniform float uCrawl;
        uniform float uGrain;
        uniform float uTurns;
        uniform float uHeatGlow;
        uniform float uFrontGlow;
        uniform float uGlobalGlow2;
        ${RAMP_GLSL}
        float cdHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float cdNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(cdHash(i), cdHash(i + vec2(1.0, 0.0)), f.x),
                     mix(cdHash(i + vec2(0.0, 1.0)), cdHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float s = vCoil.x;
          // Hot behind the front, a soft shoulder ahead of it.
          float hot = 1.0 - smoothstep(uFront - 0.015, uFront + 0.035, s);
          hot *= step(0.0005, uFront);
          // Hot spots crawl along the iron toward the tip.
          vec2 q = vec2(s * uTurns * uGrain * 6.0 - uClock * uCrawl, vCoil.y * 4.0);
          float n = cdNoise(q) * 0.6 + cdNoise(q * 2.3 + 7.1) * 0.4;
          // The underside (φ ≈ 0.5) runs cooler than the crown of the tube.
          float crown = 0.75 + 0.25 * cos(vCoil.y * 6.2831853);
          // Mostly red-to-orange iron; only hot spots and the front reach white.
          float t = hot * uTemp * (0.3 + 0.55 * n * n) * crown + uPulse * hot * 0.3;
          float lead = exp(-pow((s - uFront) / 0.02, 2.0)) * step(0.0005, uFront) * step(uFront, 0.999);
          vec3 heat = heatRamp(t) * smoothstep(0.02, 0.18, t) * uHeatGlow
                    + heatRamp(1.0) * lead * uFrontGlow * uTemp;
          totalEmissiveRadiance += heat * uGlobalGlow2;
          // Glowing iron loses its dark albedo.
          diffuseColor.rgb *= 1.0 - 0.7 * clamp(t, 0.0, 1.0);
        }`
      );
  };
  material.customProgramCacheKey = () => 'combustion-debt-coil';
  /** @param {object} s { front, temp, pulse, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    material.color.copy(getColor(c.ironColor));
    material.metalness = c.ironMetalness;
    material.roughness = c.ironRoughness;
    u.uFront.value = s.front;
    u.uTemp.value = s.temp;
    u.uPulse.value = s.pulse * c.tickFlash;
    u.uClock.value = s.clock;
    u.uCrawl.value = c.heatCrawl * g.noiseSpeed;
    u.uGrain.value = c.heatGrain * g.noiseFrequency;
    u.uTurns.value = c.coilTurns;
    u.uHeatGlow.value = c.heatGlow * g.shaderIntensity;
    u.uFrontGlow.value = c.frontGlow;
    u.uGlobalGlow2.value = g.glow;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 2 · The hob                                                          */
/* -------------------------------------------------------------------- */

const HOB_FRAGMENT = /* glsl */ `
  uniform float uReveal;      // 0..1 scorch spread from the landing
  uniform float uHeat;        // 0..1 debt so far (floor heat)
  uniform float uFront;       // coil heat front
  uniform float uTemp;        // coil temperature
  uniform float uRelease;     // 0..1 fire ring, −1 before the call
  uniform float uDissolve;
  uniform float uFade;
  uniform float uDiscR;       // disc radius (m)
  uniform float uOuter;       // coil outer radius (m)
  uniform float uInner;
  uniform float uTurns;
  uniform float uSpin;
  uniform float uSpiralW;
  uniform float uCracks;
  uniform float uCrackGlow;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uNoise;
  uniform float uClock;
  uniform vec3  uChar;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  float cellEdge(vec2 x) {
    vec2 n = floor(x), f = fract(x);
    float f1 = 8.0, f2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)));
        float d = length(g + o - f);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
      }
    }
    return f2 - f1;
  }
  void main() {
    vec2 p = (vUv - 0.5) * 2.0 * uDiscR;      // metres from the centre
    float rho = length(p);
    float edge = rho / uDiscR;
    float wobble = (fbm3(vec3(p * 0.9, 1.7)) - 0.5) * 0.35 * uNoise;
    // Scorch: spreads from the centre, ragged rim.
    float reach = uReveal * (1.0 + wobble);
    float disc = 1.0 - smoothstep(reach - 0.18, reach, edge);
    if (disc <= 0.001) discard;
    float ash = fbm3(vec3(p * 2.6, 3.1));

    // Heat pooled under the coil: which coil s sits over this radius, and how
    // far round the spiral this point is from it.
    float s = clamp(pow(clamp((rho - uInner) / max(0.01, uOuter - uInner), 0.0, 1.0), 1.0 / 0.92), 0.0, 1.0);
    s = 1.0 - s;
    // The quad lies with local +y on world −z, so world θ = atan(−y, x).
    float theta = atan(-p.y, p.x);
    float thetaC = s * uTurns * 6.2831853 + uSpin;
    float dTheta = abs(fract((theta - thetaC) / 6.2831853 + 0.5) - 0.5) * 6.2831853;
    float arc = dTheta * max(rho, 0.2);
    float under = exp(-pow(arc / max(0.02, uSpiralW), 2.0));
    float hot = (1.0 - smoothstep(uFront - 0.02, uFront + 0.05, s)) * step(0.0005, uFront);
    float pool = under * hot * uTemp * step(rho, uOuter + 0.3);

    // Cracks open with the debt and glow hotter toward the centre.
    // Cell borders (F2 − F1): thin seams that widen as the debt grows.
    float seam = 1.0 - smoothstep(0.02, 0.06 + 0.06 * uHeat, cellEdge(p * uCracks + wobble));
    float crackHeat = seam * uHeat * (1.0 - smoothstep(0.2, 1.0, edge)) * (0.6 + 0.4 * snoise01(vec3(p * 1.5, uClock * 0.8)));

    // The call: a ring of fire runs out to the rim.
    float ring = uRelease >= 0.0 ? exp(-pow((edge - uRelease) / 0.06, 2.0)) * (1.0 - uRelease * 0.7) : 0.0;

    float t = clamp(pool * 0.9 + crackHeat * 0.75 + ring, 0.0, 1.2);
    vec3 glow = heatRamp(t) * (pool * uGlow + crackHeat * uCrackGlow + ring * uGlow * 1.6) * uShaderIntensity;
    vec2 dm = dissolveMask(snoise01(vec3(p * 1.4, 4.2)), uDissolve, 0.08);
    float charA = disc * uOpacity * (0.75 + 0.25 * ash) * (1.0 - smoothstep(0.82, 1.0, edge) * 0.6);
    float glowA = clamp(max(max(pool, crackHeat), ring), 0.0, 1.0);
    vec3 col = uChar * (0.6 + 0.6 * ash) + glow * uGlobalGlow + heatRamp(0.55) * dm.y * 1.5 * uDissolve;
    float a = clamp(max(charA, glowA), 0.0, 1.0) * dm.x * uFade;
    gl_FragColor = vec4(col, a);
  }
`;

/** The scorched floor under the coil (normal blending: it darkens the floor). */
export function createHobMaterial() {
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
      uReveal: { value: 0 },
      uHeat: { value: 0 },
      uFront: { value: 0 },
      uTemp: { value: 1 },
      uRelease: { value: -1 },
      uDissolve: { value: 0 },
      uFade: { value: 1 },
      uDiscR: { value: 3.6 },
      uOuter: { value: 3 },
      uInner: { value: 0.3 },
      uTurns: { value: 3.25 },
      uSpin: { value: 0 },
      uSpiralW: { value: 0.3 },
      uCracks: { value: 2.2 },
      uCrackGlow: { value: 1.6 },
      uGlow: { value: 1.5 },
      uOpacity: { value: 0.86 },
      uNoise: { value: 1 },
      uClock: { value: 0 },
      uChar: { value: new Color() },
      ...rampUniforms(),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: HOB_FRAGMENT,
  });
  /** @param {object} s { reveal, heat, front, temp, release, dissolve, fade, discR, outer, inner, spin, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uReveal.value = s.reveal;
    u.uHeat.value = s.heat;
    u.uFront.value = s.front;
    u.uTemp.value = s.temp;
    u.uRelease.value = s.release;
    u.uDissolve.value = s.dissolve;
    u.uFade.value = s.fade * g.opacity;
    u.uDiscR.value = s.discR;
    u.uOuter.value = s.outer;
    u.uInner.value = s.inner;
    u.uTurns.value = c.coilTurns;
    u.uSpin.value = s.spin;
    u.uSpiralW.value = c.hobSpiralWidth;
    u.uCracks.value = c.hobCracks * g.noiseFrequency;
    u.uCrackGlow.value = c.hobCrackGlow * g.glow;
    u.uGlow.value = c.hobGlow * g.glow;
    u.uOpacity.value = c.hobOpacity;
    u.uNoise.value = g.noiseStrength;
    u.uClock.value = s.clock;
    u.uChar.value.copy(getColor(c.charColor));
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 3 · The plume                                                        */
/* -------------------------------------------------------------------- */

const PLUME_VERTEX = /* glsl */ `
  uniform float uClock;
  uniform float uSwell;
  uniform float uScroll;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${noiseGLSL}
  void main() {
    vUv = uv;
    vec3 p = position;
    // Turbulent swelling that climbs the column with the flame.
    float n = snoise(vec3(p.x * 2.2, p.y * 3.0 - uClock * uScroll, p.z * 2.2));
    p.xz *= 1.0 + n * uSwell * (0.25 + 0.75 * uv.y);
    vLocal = p;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PLUME_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uScroll;
  uniform float uBurn;        // 0..1 dissolve threshold (eats the column)
  uniform float uPower;       // 0..1 envelope
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uNoiseScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    float y = vUv.y;
    vec3 q = vec3(vLocal.xz * 2.4, vLocal.y * 2.8 - uClock * uScroll) * uNoiseScale;
    float flame = fbm4(q);
    float tongues = ridged(q * 1.7 + vec3(0.0, -uClock * uScroll * 0.6, 0.0), 4);
    // Hottest at the throat, cooling as it climbs and at the silhouette.
    float rim = fresnelTerm(vViewDir, vNormalW, 1.6, 1.0);
    float heat = (1.15 - y * 0.75) * (0.55 + 0.6 * flame) * (1.0 - rim * 0.45) + tongues * 0.25;
    // Burnt away from the foot upward as the call spends itself.
    float eaten = flame + (1.0 - y) * 0.35 - uBurn * 1.4;
    float mask = smoothstep(0.0, 0.18, eaten);
    float a = mask * uPower * uOpacity * (0.35 + 0.65 * (1.0 - rim)) * smoothstep(0.0, 0.05, y) * (0.55 + 0.45 * flame);
    if (a < 0.003) discard;
    vec3 col = heatRamp(heat * uPower) * uGlow * uShaderIntensity;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The combustion column at the call. Additive. */
export function createPlumeMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: DoubleSide }),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uSwell: { value: 0.35 },
      uScroll: { value: 2.4 },
      uBurn: { value: 0 },
      uPower: { value: 0 },
      uGlow: { value: 2.2 },
      uOpacity: { value: 0.95 },
      uNoiseScale: { value: 1 },
      ...rampUniforms(),
    }),
    vertexShader: PLUME_VERTEX,
    fragmentShader: PLUME_FRAGMENT,
  });
  /** @param {object} s { clock, burn, power } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uSwell.value = c.plumeNoise * g.turbulence;
    u.uScroll.value = c.plumeScroll * g.noiseSpeed;
    u.uBurn.value = s.burn;
    u.uPower.value = s.power;
    u.uGlow.value = c.plumeGlow * g.glow;
    u.uOpacity.value = c.plumeOpacity * g.opacity;
    u.uNoiseScale.value = g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 4 · The slug                                                         */
/* -------------------------------------------------------------------- */

const SLUG_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SLUG_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uGlow;
  uniform float uFade;
  uniform float uGlobalGlow;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    float rim = fresnelTerm(vViewDir, vNormalW, 2.0, 1.0);
    float crust = snoise01(vec3(vLocal * 9.0 + vec3(0.0, uClock * 3.0, 0.0)));
    // White core, a crust of dull slag breaking over it at the rim.
    float t = clamp(1.05 - rim * 0.8 - crust * 0.35 * rim + (vLocal.y + 0.65) * 0.1, 0.0, 1.2);
    gl_FragColor = vec4(heatRamp(t) * uGlow * uGlobalGlow, uFade);
  }
`;

/** The molten slug. Additive. */
export function createSlugMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uGlow: { value: 2.8 },
      uFade: { value: 1 },
      ...rampUniforms(),
    }),
    vertexShader: SLUG_VERTEX,
    fragmentShader: SLUG_FRAGMENT,
  });
  /** @param {object} s { clock, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uGlow.value = c.slugGlow * g.glow;
    u.uFade.value = s.fade * g.opacity;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 5 · The brands                                                       */
/* -------------------------------------------------------------------- */

const BRAND_VERTEX = /* glsl */ `
  attribute vec2 aStack;      // x = stacks owed, y = flare 0..1 (past threshold / call)
  varying vec2 vUv;
  varying vec2 vStack;
  void main() {
    vUv = uv;
    vStack = aStack;
    mat4 local = mat4(1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix;
    #endif
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * local * vec4(position, 1.0);
  }
`;

const BRAND_FRAGMENT = /* glsl */ `
  uniform float uTicks;
  uniform float uThreshold;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uClock;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec2 vStack;
  ${RAMP_GLSL}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0 || vStack.x < 0.5) discard;
    float a01 = fract(0.25 - atan(p.y, p.x) / 6.2831853);
    // One notch per tick in the ledger; lit notches are stacks owed.
    float slot = floor(a01 * uTicks);
    float inSlot = fract(a01 * uTicks);
    float notch = smoothstep(0.06, 0.12, inSlot) * (1.0 - smoothstep(0.88, 0.94, inSlot));
    float band = smoothstep(0.66, 0.72, r) * (1.0 - smoothstep(0.9, 0.96, r));
    float owed = step(slot + 0.5, vStack.x);
    float hairline = exp(-pow((r - 0.62) / 0.025, 2.0)) * 0.5;
    float due = step(uThreshold - 0.5, vStack.x);
    float pulse = 0.75 + 0.25 * sin(uClock * (6.0 + 10.0 * due));
    float t = mix(0.35, 0.8, due) + vStack.y * 0.4;
    float a = (band * notch * mix(0.18, 1.0, owed) * pulse + hairline * due) * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(heatRamp(t) * uGlow * uGlobalGlow * (1.0 + vStack.y), clamp(a, 0.0, 1.0));
  }
`;

/** Instanced tally rings under each debtor. Additive. */
export function createBrandMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uTicks: { value: 4 },
      uThreshold: { value: 2 },
      uGlow: { value: 1.8 },
      uOpacity: { value: 0.95 },
      uClock: { value: 0 },
      ...rampUniforms(),
    }),
    vertexShader: BRAND_VERTEX,
    fragmentShader: BRAND_FRAGMENT,
  });
  material.userData.instanced = true;
  /** @param {object} s { clock, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTicks.value = Math.max(1, Math.round(c.ticks));
    u.uThreshold.value = c.igniteThreshold;
    u.uGlow.value = c.brandGlow * g.glow;
    u.uOpacity.value = c.brandOpacity * g.opacity * s.fade;
    u.uClock.value = s.clock;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 6 · The haze                                                         */
/* -------------------------------------------------------------------- */

const HAZE_FRAGMENT = /* glsl */ `
  uniform float uShimmer;     // grows with the debt
  uniform float uShock;       // pressure ring at the call
  uniform float uWave;        // its radius 0..1
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
    float body = 1.0 - smoothstep(0.2, 1.0, r);
    float ring = exp(-pow((r - uWave) / 0.1, 2.0));
    // Rising shimmer: noise advected "up" the screen-facing disc.
    vec3 np = vec3(q * 3.0 * uScale, uClock * 1.6);
    vec2 n = vec2(snoise(np), snoise(np + vec3(4.1, 2.7, 9.3)));
    vec2 dir = n * body * uShimmer + radial * ring * uShock;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(body * uShimmer + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` disc. Opaque on purpose (as Borrowed Tomorrow's lens):
 * the offset buffer wants the proxy's own value, and an opaque proxy keeps
 * the expansion's "transparent ⇒ VFX layer" routing from moving it.
 */
export function createHazeMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uShimmer: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: HAZE_FRAGMENT,
  });
  /** @param {object} s { shimmer, shock, wave, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uShimmer.value = s.shimmer * c.hazeStrength * g.distortion;
    u.uShock.value = s.shock * c.hazeShock * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
