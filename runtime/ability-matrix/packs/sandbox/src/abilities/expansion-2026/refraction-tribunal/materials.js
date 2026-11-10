import { AdditiveBlending, Color, DoubleSide, FrontSide, MeshStandardMaterial, NormalBlending, ShaderMaterial, Vector2, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Refraction Tribunal — materials.
 *
 *  - **quartz** — the judges' solid body: `MeshStandardMaterial`, flat
 *    shaded, deep amethyst, low roughness, so the sun and the environment
 *    pick out every facet. It is the mass of the cast and casts shadows.
 *  - **facet light** — a bespoke additive shell drawn on the same geometry,
 *    pushed a few millimetres out: a *dispersive* fresnel rim (red, green
 *    and violet peel apart at grazing angles by `dispersion`), bands of light
 *    climbing inside the crystal, a per-facet sparkle hashed from the flat
 *    normal, and a white-hot flash (`charge`) when the judge refracts the
 *    bolt. Its own dissolve takes it off on the exit while the solid sinks.
 *  - **the beam** — a camera-facing ribbon in the vertex stage; the fragment
 *    is a white core with a chromatic sheath (the colours split across the
 *    width by `beamSplit`) and light flowing along it; drawn up to the bolt's
 *    head, which carries a bright knot.
 *  - **the witness** — the bolt's gem: inverted fresnel, so its heart is the
 *    brightest thing in the shot and its rim takes the amethyst body.
 *  - **the seal** — the court on the floor, *normal*-blended so its deep
 *    tone actually darkens the ground: a dark faceted crystal floor inside a
 *    ring, the etched triangle between the judges and an inverted inner
 *    triangle, voronoi facets, caustics thrown through the judges, cracks
 *    round each judge's foot, a pool of light under each refracting judge
 *    and the verdict's ring running out. Dissolves through noise.
 *  - **the column** — the verdict: a lathe spindle of streaming light.
 *  - **the lens** — `LAYER.DISTORTION` disc: inward pull while the judges
 *    bow, a pressure ring at the verdict.
 *
 * Every material reads `settings.refractionTribunal` in `userData.sync(state)`.
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

/** Copy the four ramp stops onto four uniforms. */
function syncRamp(u, c) {
  u.uRampA.value.copy(getColor(c.colorA));
  u.uRampB.value.copy(getColor(c.colorB));
  u.uRampC.value.copy(getColor(c.colorC));
  u.uRampD.value.copy(getColor(c.colorD));
}
const rampUniforms = () => ({
  uRampA: { value: new Color('#fff7ff') },
  uRampB: { value: new Color('#f0c4ff') },
  uRampC: { value: new Color('#a74cff') },
  uRampD: { value: new Color('#1f0838') },
});
const RAMP_GLSL = /* glsl */ `
  uniform vec3 uRampA;
  uniform vec3 uRampB;
  uniform vec3 uRampC;
  uniform vec3 uRampD;
  // 0 = white-hot core … 1 = the deep.
  vec3 ramp(float t) { return gradient4(uRampA, uRampB, uRampC, uRampD, t); }
`;

/* -------------------------------------------------------------------- */
/* Quartz — the solid, lit judges                                       */
/* -------------------------------------------------------------------- */

/** One per judge, so each judge's refraction flash lights its own body. */
export function createQuartzMaterial() {
  const material = new MeshStandardMaterial({
    color: 0x2a1048,
    emissive: 0x7b2cff,
    emissiveIntensity: 0.35,
    roughness: 0.14,
    metalness: 0.35,
    flatShading: true,
    envMapIntensity: 1.4,
  });
  /** @param {object} s { charge } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    material.color.copy(getColor(c.crystalColor));
    material.emissive.copy(getColor(c.crystalEmissive));
    material.emissiveIntensity = (c.crystalGlow + s.charge * 1.4) * g.glow;
    material.roughness = c.crystalRoughness;
    material.metalness = c.crystalMetalness;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Facet light                                                          */
/* -------------------------------------------------------------------- */

const FACET_VERTEX = /* glsl */ `
  attribute float aHeight;
  uniform float uInflate;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying float vHeight;
  varying float vWorldY;
  varying vec2 vUv;
  void main() {
    vec3 p = position + normal * uInflate;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    vLocal = position;
    vHeight = aHeight;
    vWorldY = world.y;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FACET_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uFresnel;
  uniform float uDispersion;
  uniform float uBandDensity;
  uniform float uCharge;
  uniform float uChargeGlow;
  uniform float uDissolve;
  uniform float uFade;
  uniform float uScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying float vHeight;
  varying float vWorldY;
  varying vec2 vUv;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewDir);
    float facing = 1.0 - abs(dot(n, v));
    // Dispersive rim: the three channels peel apart at grazing angles.
    float spread = 0.35 * uDispersion;
    vec3 rim = vec3(
      pow(facing, uFresnel * (1.0 - spread)),
      pow(facing, uFresnel),
      pow(facing, uFresnel * (1.0 + spread))
    );
    // Each flat facet sparkles on its own phase (hash of its normal).
    float facet = hash11(dot(floor(n * 9.0), vec3(1.0, 7.0, 31.0)));
    float sparkle = pow(0.5 + 0.5 * sin(uClock * 3.0 + facet * 40.0), 18.0);
    // Bands of light climbing inside the column, bent per facet.
    float band = pow(0.5 + 0.5 * sin((vHeight * uBandDensity + facet * 0.35) * 6.2831853 - uClock * 2.0), 8.0);
    float grain = snoise01(vec3(vUv * 6.0 * uScale, uClock * 0.2));
    float inner = band * (0.45 + 0.55 * grain) * uShaderIntensity;

    vec3 spectral = rim * vec3(1.15, 0.9, 1.25);
    vec3 col = ramp(0.55 - 0.4 * rim.g) * inner * 1.2
      + mix(ramp(0.3), spectral * 1.6, 0.6) * rim.g * 1.4
      + ramp(0.0) * sparkle * 0.9 * step(0.55, facing)
      + ramp(0.0) * uCharge * uChargeGlow * (0.35 + rim.g);

    // Never glow below the floor while the judge rises or sinks.
    float floorMask = smoothstep(-0.02, 0.12, vWorldY);
    vec2 dm = dissolveMask(snoise01(vLocal * 5.0 * uScale + 3.1), uDissolve, 0.08);
    col += ramp(0.1) * dm.y * 4.0;
    float a = clamp((rim.g * 0.8 + inner * 0.5 + uCharge * 0.6 + sparkle * 0.2) * uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * floorMask * dm.x * uFade, a * floorMask * dm.x * uFade);
  }
`;

/** The additive facet shell on a judge. One per judge (own charge). */
export function createFacetMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uGlow: { value: 1.6 },
      uOpacity: { value: 0.85 },
      uFresnel: { value: 2.4 },
      uDispersion: { value: 1 },
      uBandDensity: { value: 5 },
      uCharge: { value: 0 },
      uChargeGlow: { value: 3 },
      uDissolve: { value: 0 },
      uFade: { value: 1 },
      uInflate: { value: 0.012 },
      uScale: { value: 1 },
      ...rampUniforms(),
    }),
    vertexShader: FACET_VERTEX,
    fragmentShader: FACET_FRAGMENT,
  });
  /** @param {object} s { clock, charge, dissolve, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock * c.bandSpeed;
    u.uGlow.value = c.facetGlow * g.glow;
    u.uOpacity.value = c.facetOpacity * g.opacity;
    u.uFresnel.value = Math.max(0.2, c.facetFresnel / Math.max(0.05, g.fresnel));
    u.uDispersion.value = c.dispersion;
    u.uBandDensity.value = c.bandDensity;
    u.uCharge.value = s.charge;
    u.uChargeGlow.value = c.chargeGlow;
    u.uDissolve.value = s.dissolve;
    u.uFade.value = s.fade;
    u.uScale.value = g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The beam                                                             */
/* -------------------------------------------------------------------- */

const BEAM_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHead;     // 0..1 how much of the leg is drawn
  varying vec2 vUv;
  varying float vAlong;
  void main() {
    vec3 a = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 b = (modelMatrix * vec4(0.0, 0.0, 1.0, 1.0)).xyz;
    float t = position.z * uHead;
    vec3 world = mix(a, b, t);
    vec3 dir = normalize(b - a + 1e-5);
    vec3 view = normalize(cameraPosition - world);
    vec3 side = normalize(cross(dir, view) + 1e-5);
    // Taper both ends so a leg starts and lands as a point of light.
    float taper = smoothstep(0.0, 0.06, t) * (0.55 + 0.45 * smoothstep(1.0, 0.85, t / max(uHead, 1e-3)));
    world += side * uv.x * uWidth * (0.35 + 0.65 * taper);
    vUv = uv;
    vAlong = t;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uGlow;
  uniform float uSplit;
  uniform float uLength;
  uniform float uHead;
  uniform float uSeed;
  uniform float uScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying float vAlong;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    float x = vUv.x;
    float metres = vAlong * uLength;
    float flow = snoise01(vec3(metres * 1.4 * uScale - uClock, x * 1.5, uSeed));
    float core = exp(-x * x * 26.0) * (1.4 + 0.6 * flow);
    // Chromatic sheath: warm on one side, violet on the other.
    float s = uSplit * 0.55;
    vec3 sheath = vec3(
      exp(-pow(x - s, 2.0) * 7.0),
      exp(-x * x * 9.0) * 0.8,
      exp(-pow(x + s, 2.0) * 7.0)
    ) * (0.45 + 0.55 * flow) * uShaderIntensity;
    float knot = exp(-pow((vAlong - uHead) * uLength, 2.0) * 3.0) * step(uHead, 0.999);
    vec3 col = ramp(0.0) * core + mix(ramp(0.35), sheath * vec3(1.2, 0.85, 1.3), 0.65) * 1.2 + ramp(0.0) * knot * 2.5;
    float edge = 1.0 - smoothstep(0.7, 1.0, abs(x));
    float a = clamp((core * 0.6 + sheath.g + knot) * edge, 0.0, 1.0) * uFade;
    gl_FragColor = vec4(col * edge * uGlow * uGlobalGlow * uFade, a);
  }
`;

/** One per beam (each leg has its own head, fade and length). */
export function createBeamMaterial(seed = 0) {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uFade: { value: 0 },
      uGlow: { value: 2.4 },
      uSplit: { value: 0.55 },
      uLength: { value: 1 },
      uHead: { value: 1 },
      uWidth: { value: 0.16 },
      uSeed: { value: seed * 3.17 },
      uScale: { value: 1 },
      ...rampUniforms(),
    }),
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
  });
  /** @param {object} s { clock, fade, length, head, width } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock * c.beamFlow;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.beamGlow * g.glow;
    u.uSplit.value = c.beamSplit * g.fresnel;
    u.uLength.value = s.length;
    u.uHead.value = s.head;
    u.uWidth.value = s.width;
    u.uScale.value = g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The witness (bolt gem)                                               */
/* -------------------------------------------------------------------- */

const LIT_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    vLocal = position;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WITNESS_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uFade;
  uniform float uFlicker;
  uniform float uGlobalGlow;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    float rim = fresnelTerm(vViewDir, vNormalW, 1.6, 1.0);
    float heart = 1.0 - clamp(rim, 0.0, 1.0);
    vec3 col = ramp(0.0) * heart * 2.2 + ramp(0.45) * rim * 1.4;
    col *= 0.85 + 0.3 * uFlicker;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * uFade, clamp(0.6 + rim, 0.0, 1.0) * uFade);
  }
`;

export function createWitnessMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uGlow: { value: 2.6 },
      uFade: { value: 1 },
      uFlicker: { value: 0.5 },
      ...rampUniforms(),
    }),
    vertexShader: LIT_VERTEX,
    fragmentShader: WITNESS_FRAGMENT,
  });
  /** @param {object} s { fade, flicker } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.boltGlow * g.glow;
    u.uFade.value = s.fade * g.opacity;
    u.uFlicker.value = s.flicker;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The seal (floor)                                                     */
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

const SEAL_FRAGMENT = /* glsl */ `
  uniform vec2  uCenter;
  uniform float uRadius;
  uniform float uRing;        // judges' ring, × radius
  uniform float uAngle;       // bearing of judge 0 (world xz)
  uniform float uDraw;        // 0..1 the seal is etched in
  uniform float uClock;
  uniform vec3  uCharge;      // per-judge refraction flash
  uniform float uWave;        // verdict ring radius 0..1, < 0 before
  uniform float uDissolve;
  uniform float uFade;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uLine;
  uniform float uCaustic;
  uniform float uCausticScale;
  uniform float uCrack;
  uniform float uCrackReach;
  uniform float uScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}

  vec2 judge(float k) {
    float a = uAngle + k * 2.0943951;
    return vec2(cos(a), sin(a)) * uRing;
  }
  // Distance to segment ab, and the parameter along it.
  vec2 seg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return vec2(length(pa - ba * h), h);
  }

  void main() {
    vec2 q = (vWorld.xz - uCenter) / uRadius;
    float r = length(q);
    if (r > 1.05) discard;
    vec2 j0 = judge(0.0), j1 = judge(1.0), j2 = judge(2.0);

    // The etched triangle between the judges, drawn out from each vertex.
    vec2 e0 = seg(q, j0, j1), e1 = seg(q, j1, j2), e2 = seg(q, j2, j0);
    float drawn0 = step(e0.y, uDraw), drawn1 = step(e1.y, uDraw), drawn2 = step(e2.y, uDraw);
    float tri = exp(-e0.x * 70.0) * drawn0 + exp(-e1.x * 70.0) * drawn1 + exp(-e2.x * 70.0) * drawn2;
    // The inverted inner triangle (half scale) makes the seal a star.
    vec2 i0 = -j0 * 0.5, i1 = -j1 * 0.5, i2 = -j2 * 0.5;
    float inner = exp(-seg(q, i0, i1).x * 90.0) + exp(-seg(q, i1, i2).x * 90.0) + exp(-seg(q, i2, i0).x * 90.0);
    inner *= smoothstep(0.4, 1.0, uDraw);
    float ring = exp(-abs(r - 0.97) * 90.0) * smoothstep(0.0, 0.5, uDraw)
      + exp(-abs(r - 0.9) * 140.0) * 0.5 * smoothstep(0.3, 0.8, uDraw);

    // Faceted crystal floor: voronoi cells shaded by id, edges bright.
    vec2 cp = q * 5.5 * uCausticScale * uScale;
    vec2 v = voronoi2(cp);
    vec2 v2 = voronoi2(cp + vec2(0.37, 0.71));
    float facetEdge = smoothstep(0.12, 0.0, abs(v.x - v2.x)) * 0.5;
    // Caustics: light thrown through the judges, crawling.
    float caustic = pow(1.0 - abs(snoise(vec3(q * 3.2 * uCausticScale * uScale, uClock * 0.35))), 10.0)
      + pow(1.0 - abs(snoise(vec3(q * 5.1 * uCausticScale * uScale + 7.0, -uClock * 0.27))), 14.0) * 0.6;

    // Cracks radiating from each judge's foot.
    float cracks = 0.0;
    float pools = 0.0;
    for (int k = 0; k < 3; k++) {
      vec2 jk = k == 0 ? j0 : (k == 1 ? j1 : j2);
      float ch = k == 0 ? uCharge.x : (k == 1 ? uCharge.y : uCharge.z);
      vec2 d = q - jk;
      float dl = length(d);
      float ang = atan(d.y, d.x);
      float line = 1.0 - abs(snoise(vec3(ang * 2.3, dl * 3.0, float(k) * 4.1)));
      cracks += pow(line, 22.0) * (1.0 - smoothstep(0.03, uCrackReach, dl)) * smoothstep(0.0, 0.2, uDraw);
      pools += exp(-dl * dl * 30.0) * (0.4 + ch * 2.0);
    }

    float inside = 1.0 - smoothstep(0.93, 1.0, r);
    float wave = uWave >= 0.0 ? exp(-abs(r - uWave) * 26.0) * (1.0 - uWave) * 2.0 : 0.0;

    float lines = (tri * 1.4 + inner * 0.6 + ring) * uLine;
    float light = lines + (facetEdge * 0.35 + caustic * uCaustic * 0.45) * inside * uShaderIntensity
      + cracks * uCrack + pools * 0.6 + wave;
    vec2 dm = dissolveMask(snoise01(vec3(q * 3.0 * uScale, 1.7)), uDissolve, 0.06);

    // The deep floor: facets take two depths of the deep tone.
    vec3 floorCol = mix(uRampD, mix(uRampD, uRampC, 0.35), v.y * 0.6 + facetEdge);
    vec3 lightCol = mix(ramp(0.55), ramp(0.05), clamp(lines + wave + cracks * 0.6, 0.0, 1.0));
    vec3 col = floorCol + lightCol * light * uGlow * uGlobalGlow + ramp(0.05) * dm.y * 3.0;
    float floorA = inside * uOpacity * smoothstep(0.0, 0.6, uDraw);
    float a = clamp(floorA + light * 0.8, 0.0, 1.0) * dm.x * uFade;
    gl_FragColor = vec4(col, a);
  }
`;

/** The court seal on the floor. Normal-blended (the deep must darken the ground). */
export function createSealMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector2() },
      uRadius: { value: 3.8 },
      uRing: { value: 0.86 },
      uAngle: { value: 0 },
      uDraw: { value: 0 },
      uClock: { value: 0 },
      uCharge: { value: new Vector3() },
      uWave: { value: -1 },
      uDissolve: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1.6 },
      uOpacity: { value: 0.72 },
      uLine: { value: 1 },
      uCaustic: { value: 1 },
      uCausticScale: { value: 1.4 },
      uCrack: { value: 1.3 },
      uCrackReach: { value: 0.45 },
      uScale: { value: 1 },
      ...rampUniforms(),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: SEAL_FRAGMENT,
  });
  /** @param {object} s { cx, cz, radius, ring, angle, draw, clock, c0, c1, c2, wave, dissolve, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.set(s.cx, s.cz);
    u.uRadius.value = s.radius;
    u.uRing.value = s.ring;
    u.uAngle.value = s.angle;
    u.uDraw.value = s.draw;
    u.uClock.value = s.clock * g.noiseSpeed;
    u.uCharge.value.set(s.c0, s.c1, s.c2);
    u.uWave.value = s.wave;
    u.uDissolve.value = s.dissolve;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.sealGlow * g.glow;
    u.uOpacity.value = c.sealOpacity;
    u.uLine.value = c.sealLine;
    u.uCaustic.value = c.causticGlow * g.noiseStrength;
    u.uCausticScale.value = c.causticScale;
    u.uCrack.value = c.crackGlow;
    u.uCrackReach.value = c.crackReach;
    u.uScale.value = g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The verdict column                                                   */
/* -------------------------------------------------------------------- */

const COLUMN_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec2 vUv;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const COLUMN_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uPower;
  uniform float uGlow;
  uniform float uFresnel;
  uniform float uScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec2 vUv;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    float facing = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    float body = pow(facing, 1.5);
    float rim = pow(1.0 - facing, 2.0 * uFresnel);
    // Light streams down the column toward the floor.
    float stream = snoise01(vec3(vUv.x * 12.0, vUv.y * 4.0 * uScale + uClock * 3.0, 0.0));
    float streaks = pow(stream, 3.0) * uShaderIntensity;
    float ends = smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
    vec3 col = ramp(0.0) * body * (1.2 + streaks) + ramp(0.4) * rim * 1.5 + ramp(0.65) * streaks * 0.6;
    float a = clamp(body * 0.7 + rim * 0.5, 0.0, 1.0) * ends * uPower;
    gl_FragColor = vec4(col * ends * uPower * uGlow * uGlobalGlow, a);
  }
`;

export function createColumnMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uPower: { value: 0 },
      uGlow: { value: 2.8 },
      uFresnel: { value: 1 },
      uScale: { value: 1 },
      ...rampUniforms(),
    }),
    vertexShader: COLUMN_VERTEX,
    fragmentShader: COLUMN_FRAGMENT,
  });
  /** @param {object} s { clock, power } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock * g.noiseSpeed;
    u.uPower.value = s.power * g.opacity;
    u.uGlow.value = c.columnGlow * g.glow;
    u.uFresnel.value = g.fresnel;
    u.uScale.value = g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The lens                                                             */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uPull;        // inward pull while the judges bow
  uniform float uShock;       // pressure ring at the verdict
  uniform float uWave;        // its radius, 0..1
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
    // Three-fold: the pull is strongest along the judges' bearings.
    float a = atan(q.y, q.x);
    float tri = 0.6 + 0.4 * cos(a * 3.0);
    float body = (1.0 - smoothstep(0.2, 1.0, r)) * tri;
    float ring = exp(-pow((r - uWave) / 0.09, 2.0));
    vec3 np = vec3(q * 2.5 * uScale, uClock * 0.4);
    vec2 n = vec2(snoise(np), snoise(np + vec3(5.2, 1.3, 7.7))) * 0.3;
    vec2 dir = (-radial + n) * body * uPull + (radial + n) * ring * uShock;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(body * uPull + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` disc. Opaque on purpose (like the other expansion
 * lenses): the offset buffer wants the proxy's own value, and an opaque proxy
 * keeps the "transparent ⇒ VFX layer" routing from pulling it out of the pass.
 */
export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uPull: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s { pull, shock, wave, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uPull.value = s.pull * c.lensStrength * g.distortion;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
