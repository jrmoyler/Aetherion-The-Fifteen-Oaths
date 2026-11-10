import { Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Void Bloom — the bespoke shaders.
 *
 *  - **the petal** — an instanced parameter grid bent in the vertex stage
 *    into a petal: a spine of constant curvature (closed form, no loop) whose
 *    base angle and curl are both blended by `uOpen` — 0 is a bud, the
 *    petals standing up and curling in over the middle; 1 is a lily lying
 *    open, tips curling out and down; a little below 0 is clenched. The
 *    blade tapers to a point and cups. It rises out of the floor and sinks
 *    back into it (the opaque stage hides what is below). The fragment is
 *    black-violet flesh with glowing veins — a midrib and herringbone side
 *    veins — down which pulses run from the tip *toward the throat*, a
 *    bright violet-white rim, fresnel, a hot tip.
 *  - **the throat** — a disc on the floor at the heart of the bloom: a
 *    black hole of a centre and spiral arms of violet light winding into it,
 *    turning with a phase integrated on the CPU.
 *  - **the veins** — a stain spreading over the circle with root-like veins
 *    whose pulses run inward: the pull, drawn on the floor.
 *  - **the swirl** — a disc on `LAYER.DISTORTION` turning the light round
 *    the throat.
 *  - **the seed** — the thrown bud: a dark bead with six violet rays.
 *
 * Every material reads `settings.voidbloom` in `userData.sync(state)`.
 */

const ID = 'voidbloom';

/* -------------------------------------------------------------------- */
/* The petal                                                            */
/* -------------------------------------------------------------------- */

const PETAL_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  uniform float uWidth;
  uniform float uOpen;
  uniform float uCup;
  uniform float uBase;
  uniform float uRise;        // 0 under the floor .. 1 fully up
  uniform float uSink;        // metres pulled back down
  uniform float uBreath;
  uniform float uCloseAngle;
  uniform float uOpenAngle;
  uniform float uCloseCurl;
  uniform float uOpenCurl;

  varying vec2  vPet;         // x: −1..1 across, y: 0 base .. 1 tip
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vSeed;

  vec2 spine(float v, float th0, float k) {
    if (abs(k) < 1e-3) return vec2(cos(th0), sin(th0)) * v * uLength;
    return vec2(sin(th0 + k * v) - sin(th0), cos(th0) - cos(th0 + k * v)) * uLength / k;
  }

  void main() {
    float u = position.x;
    float v = position.y;
    mat4 model = modelMatrix;
    float seed = 0.0;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
      seed = fract(sin(dot(instanceMatrix[0].xz, vec2(12.9898, 78.233))) * 43758.5453);
    #endif

    float o = uOpen;
    float breath = uBreath * sin(uTime * 2.2 + seed * 6.2831853) * clamp(o, 0.0, 1.0);
    float th0 = mix(uCloseAngle, uOpenAngle, o) + breath;
    float k = mix(uCloseCurl, uOpenCurl, o);
    vec2 sp = spine(v, th0, k);
    float th = th0 + k * v;
    vec2 tang = vec2(cos(th), sin(th));
    vec2 nrm = vec2(-sin(th), cos(th));

    float w = uWidth * pow(max(sin(3.14159265 * pow(v, 0.7)), 0.0), 0.8);
    w = max(w, uWidth * 0.12 * (1.0 - v) + 0.004);
    float cup = uCup * u * u * w;
    vec3 local = vec3(uBase + sp.x + nrm.x * cup, sp.y + nrm.y * cup, u * w);
    local.y -= (1.0 - uRise) * uLength * 1.1 + uSink;

    // Surface normal from the two partials.
    vec3 dv = vec3(tang, 0.0);
    vec3 du = vec3(nrm * (2.0 * uCup * u * w), w);
    vec3 n = normalize(cross(dv, du));

    vec4 world = model * vec4(local, 1.0);
    vPet = vec2(u, v);
    vNormalW = normalize(mat3(model) * n);
    vViewDir = cameraPosition - world.xyz;
    vSeed = seed;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PETAL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFlow;        // integrated: pulses run tip → base
  uniform float uVeins;
  uniform float uVeinGlow;
  uniform float uEdgeGlow;
  uniform float uRimGlow;
  uniform float uFlare;       // the snap shut
  uniform vec3  uColorBody;   // deep, near-black flesh
  uniform vec3  uColorDeep;   // deep, mottle
  uniform vec3  uColorFlesh;  // body — saturated violet where the sun lands
  uniform vec3  uColorVein;   // tint
  uniform vec3  uColorRim;    // hot — only the thinnest rim and the tip
  uniform vec3  uLightDir;
  uniform float uRampLight;
  uniform float uRimWidth;
  uniform float uSpecular;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2  vPet;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vSeed;

  ${noiseGLSL}

  void main() {
    float u = vPet.x;
    float v = vPet.y;
    float au = abs(u);
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(vViewDir);
    vec3 L = normalize(uLightDir);
    float ndv = abs(dot(N, V));
    float fres = pow(max(1.0 - ndv, 0.0), 2.5);

    // Veins: a midrib and herringbone side veins, pulses running to the base.
    float midrib = exp(-pow(abs(u / 0.06), 2.0)) * smoothstep(0.98, 0.7, v);
    float hv = fract(v * uVeins - au * 1.4 + vSeed);
    float side = (1.0 - smoothstep(0.0, 0.06, min(hv, 1.0 - hv))) * smoothstep(0.08, 0.25, au) * (1.0 - smoothstep(0.7, 0.92, au));
    float pulse = pow(max(0.5 + 0.5 * sin((v * 2.5 + uFlow + vSeed) * 6.2831853), 0.0), 4.0);
    float veins = (midrib + side * 0.7) * (0.35 + 0.65 * pulse);

    float edge = smoothstep(1.0 - uRimWidth, 1.0, au);
    float tip = smoothstep(0.93, 1.0, v);
    float n = snoise(vec3(u * 3.0, v * 6.0, vSeed * 10.0)) * 0.5 + 0.5;

    // Four-stop ramp, deep → flesh → vein → rim. Sunlight alone only carries
    // the near-black flesh part way to violet: the bloom stays a dark thing.
    vec3 deep = mix(uColorBody, uColorDeep, n * 0.7 + v * 0.3);
    float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    float t = wrap * wrap * uRampLight * (1.0 - 0.45 * v) + (n - 0.5) * 0.08;
    float glow = uGlobalGlow * uShaderIntensity;
    t += veins * uVeinGlow * 0.11 * (gl_FrontFacing ? 1.0 : 0.6) * glow;
    t += (edge + tip * 0.6) * uEdgeGlow * 0.16 * glow;
    t += uFlare * (0.25 + 0.5 * edge);
    t = clamp(t, 0.0, 1.0);
    vec3 col = mix(deep, uColorFlesh, smoothstep(0.0, 0.45, t));
    col = mix(col, uColorVein, smoothstep(0.45, 0.8, t));
    col = mix(col, uColorRim, smoothstep(0.8, 1.0, t));
    col *= 1.0 + smoothstep(0.75, 1.0, t) * 1.4;

    // A waxy sheen and a violet (never white) fresnel rim.
    vec3 H = normalize(L + V);
    col += uColorFlesh * pow(max(dot(N, H), 0.0), 36.0) * uSpecular;
    col += uColorVein * fres * uRimGlow * 0.35 * glow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The petals — opaque, instanced. */
export function createPetalMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uLength: { value: 3 },
      uWidth: { value: 0.8 },
      uOpen: { value: 0 },
      uCup: { value: 0.4 },
      uBase: { value: 0.3 },
      uRise: { value: 0 },
      uSink: { value: 0 },
      uBreath: { value: 0.05 },
      uCloseAngle: { value: 1.45 },
      uOpenAngle: { value: 0.5 },
      uCloseCurl: { value: 0.9 },
      uOpenCurl: { value: -0.8 },
      uFlow: { value: 0 },
      uVeins: { value: 7 },
      uVeinGlow: { value: 2 },
      uEdgeGlow: { value: 2.5 },
      uRimGlow: { value: 1.5 },
      uFlare: { value: 0 },
      uRampLight: { value: 0.5 },
      uRimWidth: { value: 0.08 },
      uSpecular: { value: 0.4 },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorFlesh: { value: new Color() },
      uColorVein: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: PETAL_VERTEX,
    fragmentShader: PETAL_FRAGMENT
  });

  /** @param {object} s { length, open, rise, sink, flow, flare } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uLength.value = Math.max(0.1, s.length);
    u.uWidth.value = c.petalWidth;
    u.uOpen.value = s.open;
    u.uCup.value = c.petalCup;
    u.uBase.value = c.petalBase;
    u.uRise.value = s.rise;
    u.uSink.value = s.sink;
    u.uBreath.value = c.breath;
    u.uCloseAngle.value = c.budAngle;
    u.uOpenAngle.value = c.openAngle;
    u.uCloseCurl.value = c.budCurl;
    u.uOpenCurl.value = c.openCurl;
    u.uFlow.value = s.flow;
    u.uVeins.value = c.veinCount;
    u.uVeinGlow.value = c.veinGlow * g.glow;
    u.uEdgeGlow.value = c.edgeGlow * g.glow;
    u.uRimGlow.value = c.petalRim * g.glow * g.fresnel;
    u.uFlare.value = s.flare;
    u.uRampLight.value = c.petalRampLight;
    u.uRimWidth.value = c.petalRimWidth;
    u.uSpecular.value = c.petalSpecular;
    u.uColorFlesh.value.copy(getColor(c.colorPetalBody));
    u.uColorBody.value.copy(getColor(c.colorPetal));
    u.uColorDeep.value.copy(getColor(c.colorPetalDeep));
    u.uColorVein.value.copy(getColor(c.colorVein));
    u.uColorRim.value.copy(getColor(c.colorRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* Floor discs: the throat, the veins, the swirl                        */
/* -------------------------------------------------------------------- */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  uniform float uLift;
  varying vec2 vXZ;           // −1..1

  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uSize;
    world.y = uLift;
    vXZ = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const THROAT_FRAGMENT = /* glsl */ `
  uniform float uSpin;
  uniform float uArms;
  uniform float uTwist;
  uniform float uGlow;
  uniform float uOpacity;
  uniform vec3  uColorCore;
  uniform vec3  uColorArmA;
  uniform vec3  uColorArmB;
  uniform float uHole;
  uniform float uGlobalGlow;
  varying vec2 vXZ;

  ${noiseGLSL}

  void main() {
    float r = length(vXZ);
    if (r > 1.0) discard;
    float a = atan(vXZ.y, vXZ.x);
    float sp = fract(a / 6.2831853 * uArms + log(r + 0.04) * uTwist + uSpin);
    float arm = pow(clamp(1.0 - abs(sp - 0.5) * 2.0, 0.0, 1.0), 3.0);
    float n = snoise(vec3(vXZ * 4.0, uSpin * 0.5)) * 0.5 + 0.5;
    // A wide black hole of a centre: the arms only light up well clear of it,
    // and they are violet — the white is kept for the thin lip alone.
    float hole = 1.0 - smoothstep(uHole * 0.6, uHole, r);
    float lit = arm * smoothstep(uHole * 0.8, uHole + 0.2, r) * (1.0 - smoothstep(0.8, 1.0, r)) * (0.6 + 0.4 * n);
    float lip = exp(-pow(abs((r - 0.86) / 0.05), 2.0));
    vec3 col = uColorCore + uColorArmB * lit * uGlow + mix(uColorArmB, uColorArmA, 0.2) * lip * uGlow * 0.45;
    col = mix(col, uColorCore, hole);
    float alpha = (1.0 - smoothstep(0.88, 1.0, r)) * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col * uGlobalGlow, alpha);
  }
`;

export function createThroatMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 1 },
      uLift: { value: 0.02 },
      uSpin: { value: 0 },
      uArms: { value: 5 },
      uTwist: { value: 1.5 },
      uGlow: { value: 3 },
      uOpacity: { value: 1 },
      uHole: { value: 0.45 },
      uColorCore: { value: new Color() },
      uColorArmA: { value: new Color() },
      uColorArmB: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: THROAT_FRAGMENT
  });

  /** @param {object} s { center, size, spin, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = Math.max(0.02, s.size);
    u.uSpin.value = s.spin;
    u.uArms.value = Math.max(1, Math.round(c.throatArms));
    u.uTwist.value = c.throatTwist;
    u.uGlow.value = c.throatGlow * g.glow;
    u.uOpacity.value = s.fade * g.opacity;
    u.uHole.value = c.throatHole;
    u.uColorCore.value.copy(getColor(c.colorThroatCore));
    u.uColorArmA.value.copy(getColor(c.colorRim));
    u.uColorArmB.value.copy(getColor(c.colorVein));
  };

  return material;
}

const VEINS_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uReach;       // 0..1 how far out it has spread
  uniform float uFlow;        // integrated: pulses run inward
  uniform float uGlow;
  uniform float uStain;
  uniform float uErode;
  uniform float uOpacity;
  uniform vec3  uColorStain;
  uniform vec3  uColorVein;
  uniform float uGlobalGlow;
  varying vec2 vXZ;

  ${noiseGLSL}

  void main() {
    float r = length(vXZ);
    if (r > 1.0) discard;
    float a = atan(vXZ.y, vXZ.x);
    float edgeN = snoise(vec3(cos(a) * 2.0, sin(a) * 2.0, uSeed)) * 0.08;
    float inside = 1.0 - smoothstep(uReach - 0.06, uReach + edgeN, r);
    // Root-like veins, stretched along the radius.
    vec2 q = vec2(a * 2.6, log(r + 0.05) * 1.1);
    float rid = 1.0 - abs(snoise(vec3(q.x, q.y * 0.5, uSeed)));
    float rid2 = 1.0 - abs(snoise(vec3(q.x * 2.1 + 5.0, q.y, uSeed + 3.0)));
    float vein = pow(max(rid, 0.0), 14.0) + pow(max(rid2, 0.0), 18.0) * 0.6;
    float pulse = 0.35 + 0.65 * pow(max(0.5 + 0.5 * sin((r * 3.0 + uFlow) * 6.2831853), 0.0), 3.0);
    vec3 col = uColorStain + uColorVein * vein * pulse * uGlow;
    float a01 = inside * max(uStain * (1.0 - smoothstep(0.7, 1.0, r)), vein * 0.9);
    float n = snoise(vec3(vXZ * 3.0, uSeed * 2.0)) * 0.5 + 0.5;
    float thr = uErode * 1.2 - 0.1;
    a01 *= uErode <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.1, mix(n, r, 0.3));
    a01 *= uOpacity;
    if (a01 < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a01, 0.0, 1.0));
  }
`;

export function createVeinsMaterial() {
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
      uCenter: { value: new Vector3() },
      uSize: { value: 5 },
      uLift: { value: 0.014 },
      uSeed: { value: 0 },
      uReach: { value: 0 },
      uFlow: { value: 0 },
      uGlow: { value: 2 },
      uStain: { value: 0.6 },
      uErode: { value: 0 },
      uOpacity: { value: 1 },
      uColorStain: { value: new Color() },
      uColorVein: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: VEINS_FRAGMENT
  });

  /** @param {object} s { center, size, reach, flow, erode, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = Math.max(0.2, s.size);
    u.uSeed.value = s.seed;
    u.uReach.value = s.reach;
    u.uFlow.value = s.flow;
    u.uGlow.value = c.groundVeinGlow * g.glow;
    u.uStain.value = c.stainOpacity;
    u.uErode.value = s.erode;
    u.uOpacity.value = g.opacity;
    u.uColorStain.value.copy(getColor(c.colorStain));
    u.uColorVein.value.copy(getColor(c.colorVein));
  };

  return material;
}

const SWIRL_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec2 vXZ;

  void main() {
    float r = length(vXZ);
    if (r > 1.0) discard;
    vec2 tang = vec2(-vXZ.y, vXZ.x) / max(r, 1e-3);
    vec2 inward = -vXZ / max(r, 1e-3);
    float mask = smoothstep(0.0, 0.25, r) * (1.0 - smoothstep(0.6, 1.0, r));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(normalize(tang + inward * 0.6) * 0.5 + 0.5, strength, mask);
  }
`;

/** The light turning round the throat — LAYER.DISTORTION. */
export function createSwirlMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 4 },
      uLift: { value: 0.5 },
      uStrength: { value: 1 }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: SWIRL_FRAGMENT
  });

  /** @param {object} s { center, size, strength } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = Math.max(0.2, s.size);
    u.uLift.value = 0.6;
    u.uStrength.value = c.swirlStrength * g.distortion * s.strength;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The seed                                                             */
/* -------------------------------------------------------------------- */

const BILLBOARD_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vUv;

  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = uCenter + (right * position.x + up * position.y) * uSize;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SEED_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform float uFade;
  uniform vec3  uColorCore;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;
  varying vec2 vUv;

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float a = atan(vUv.y, vUv.x) + uTime * 1.5;
    float petals = pow(abs(cos(a * 3.0)), 3.0);
    float shape = 0.3 + 0.35 * petals;
    float body = 1.0 - smoothstep(shape - 0.04, shape, r);
    float rim = exp(-pow(abs((r - shape) / 0.05), 2.0));
    float halo = exp(-r * 4.0) * 0.4;
    vec3 col = uColorCore * body + uColorRim * (rim * 2.0 + halo) * uGlow;
    float alpha = clamp(body + rim + halo, 0.0, 1.0) * uFade * (1.0 - smoothstep(0.85, 1.0, r));
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col * uGlobalGlow, alpha);
  }
`;

export function createSeedMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 0.4 },
      uGlow: { value: 2 },
      uFade: { value: 1 },
      uColorCore: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: SEED_FRAGMENT
  });

  /** @param {object} s { center, size, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = Math.max(0.02, s.size);
    u.uGlow.value = c.edgeGlow * g.glow;
    u.uFade.value = s.fade * g.opacity;
    u.uColorCore.value.copy(getColor(c.colorPetal));
    u.uColorRim.value.copy(getColor(c.colorVein));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The void core                                                        */
/* -------------------------------------------------------------------- */

const CORE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec3  uCenter;
  uniform float uRadius;
  uniform float uWrithe;
  uniform float uSpin;

  varying vec3 vN;
  varying vec3 vWorld;
  varying vec3 vLocal;

  ${noiseGLSL}

  void main() {
    vec3 d = normalize(position);
    // A writhing mass, not a ball: two octaves of noise swim over it.
    float n = snoise(d * 1.7 + vec3(0.0, uTime * 0.9, uSpin)) * 0.7
            + snoise(d * 3.9 - vec3(uSpin, uTime * 1.4, 0.0)) * 0.3;
    vec3 world = uCenter + d * uRadius * (1.0 + n * uWrithe);
    vN = d;
    vLocal = d;
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSpin;
  uniform float uRimGlow;
  uniform float uRimPower;
  uniform float uFlare;
  uniform vec3  uColorCore;
  uniform vec3  uColorDeep;
  uniform vec3  uColorVein;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;

  varying vec3 vN;
  varying vec3 vWorld;
  varying vec3 vLocal;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, uRimPower);
    // Inside: black, with a faint deep-violet churn sliding in toward the
    // centre of the disc you see — light going down, not coming out.
    float churn = snoise(vec3(vLocal * 2.4 + vec3(uSpin * 0.7, -uTime * 0.6, 0.0))) * 0.5 + 0.5;
    vec3 col = uColorCore + uColorDeep * churn * (1.0 - ndv) * 0.9;
    // The event-horizon rim: thin, violet, hottest only at the very edge.
    col += uColorVein * fres * uRimGlow * uGlobalGlow;
    col += uColorRim * pow(fres, 3.0) * uRimGlow * 0.4 * uGlobalGlow;
    col += uColorVein * uFlare * (0.4 + fres);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The black heart of the bloom — an opaque, writhing mass that eats light. */
export function createVoidCoreMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uRadius: { value: 0.7 },
      uWrithe: { value: 0.18 },
      uSpin: { value: 0 },
      uRimGlow: { value: 2 },
      uRimPower: { value: 3 },
      uFlare: { value: 0 },
      uColorCore: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorVein: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: CORE_VERTEX,
    fragmentShader: CORE_FRAGMENT
  });

  /** @param {object} s { center, radius, spin, flare } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uRadius.value = Math.max(0.001, s.radius);
    u.uWrithe.value = c.coreWrithe * g.noiseStrength;
    u.uSpin.value = s.spin;
    u.uRimGlow.value = c.coreRimGlow * g.fresnel;
    u.uRimPower.value = c.coreRimPower;
    u.uFlare.value = s.flare;
    u.uColorCore.value.copy(getColor(c.colorThroatCore));
    u.uColorDeep.value.copy(getColor(c.colorPetalDeep));
    u.uColorVein.value.copy(getColor(c.colorVein));
    u.uColorRim.value.copy(getColor(c.colorRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The crawl — the void surging from the caster to the circle           */
/* -------------------------------------------------------------------- */

const CRAWL_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uFront;
  uniform float uWidth;
  uniform float uMeander;
  uniform float uSeedF;

  varying vec2  vSV;          // x metres along, y −1..1 across
  varying float vHead;        // metres behind the front

  void main() {
    float along = position.x * uLength;
    float lat = (sin(along * 0.55 + uSeedF) * 0.6 + sin(along * 1.7 + uSeedF * 2.3) * 0.4) * uMeander;
    lat *= smoothstep(0.0, 2.0, along) * smoothstep(0.0, 1.5, uLength - along);
    float behind = uFront - along;
    // Thickest a little behind the head, a tapered tail at the caster.
    float w = uWidth * (0.35 + 0.65 * smoothstep(0.0, 2.5, along));
    w *= smoothstep(-0.1, 0.9, behind) * (1.0 + 0.5 * exp(-pow((behind - 0.6) / 0.6, 2.0)));
    vec3 world = uStart + uDir * along + uSide * (lat + position.y * w);
    world.y = 0.022;
    vSV = vec2(along, position.y);
    vHead = behind;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const CRAWL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFlow;
  uniform float uSeedF;
  uniform float uGlow;
  uniform float uErode;
  uniform float uLength;
  uniform float uOpacity;
  uniform vec3  uColorStain;
  uniform vec3  uColorDeep;
  uniform vec3  uColorVein;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;

  varying vec2  vSV;
  varying float vHead;

  ${noiseGLSL}

  void main() {
    if (vHead < 0.0) discard;
    float d = abs(vSV.y);
    float edgeN = snoise(vec3(vSV.x * 1.6, vSV.y * 0.5, uSeedF)) * 0.25;
    float body = 1.0 - smoothstep(0.55, 1.0, d + edgeN);
    // Filaments running down the crawl, pulses racing toward the circle.
    float f1 = 1.0 - abs(snoise(vec3(vSV.x * 0.7, vSV.y * 1.6, uSeedF)));
    float f2 = 1.0 - abs(snoise(vec3(vSV.x * 1.3 + 4.0, vSV.y * 2.4, uSeedF + 2.0)));
    float fil = pow(max(f1, 0.0), 18.0) + pow(max(f2, 0.0), 24.0) * 0.5;
    float pulse = 0.3 + 0.7 * pow(max(0.5 + 0.5 * sin((vSV.x * 0.6 - uFlow) * 6.2831853), 0.0), 3.0);
    float rim = exp(-pow((d + edgeN - 0.78) / 0.12, 2.0));
    float head = exp(-vHead * 1.4);
    vec3 col = mix(uColorStain, uColorDeep, 0.4 * (1.0 - d));
    col += uColorVein * (fil * pulse * 0.9 + rim * 0.5 + head * 0.9) * uGlow * uGlobalGlow;
    col += uColorRim * pow(head, 3.0) * uGlow * 0.4 * uGlobalGlow;
    float a = max(body * 0.94, fil * 0.8) * smoothstep(0.0, 0.25, vHead);
    // Eaten from the caster's end toward the bloom.
    if (uErode > 0.0) {
      float n = snoise(vec3(vSV * 1.3, uSeedF + 7.0)) * 0.5 + 0.5;
      float k = mix(n, 1.0 - vSV.x / max(uLength, 0.1), 0.6);
      a *= smoothstep(uErode * 1.2 - 0.1, uErode * 1.2, k);
    }
    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The dark crawl along the floor from the caster to the circle. */
export function createCrawlMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    uniforms: sharedUniforms({
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uFront: { value: 0 },
      uWidth: { value: 0.7 },
      uMeander: { value: 0.3 },
      uSeedF: { value: 0 },
      uFlow: { value: 0 },
      uGlow: { value: 2 },
      uErode: { value: 0 },
      uOpacity: { value: 1 },
      uColorStain: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorVein: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: CRAWL_VERTEX,
    fragmentShader: CRAWL_FRAGMENT
  });

  /** @param {object} s { start, dir, side, length, front, seed, flow, erode } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(s.start);
    u.uDir.value.copy(s.dir);
    u.uSide.value.copy(s.side);
    u.uLength.value = Math.max(0.1, s.length);
    u.uFront.value = s.front;
    u.uWidth.value = c.crawlWidth;
    u.uMeander.value = c.crawlMeander * g.noiseStrength;
    u.uSeedF.value = s.seed;
    u.uFlow.value = s.flow;
    u.uGlow.value = c.crawlGlow * g.glow;
    u.uErode.value = s.erode;
    u.uOpacity.value = g.opacity;
    u.uColorStain.value.copy(getColor(c.colorStain));
    u.uColorDeep.value.copy(getColor(c.colorPetalBody));
    u.uColorVein.value.copy(getColor(c.colorVein));
    u.uColorRim.value.copy(getColor(c.colorRim));
  };

  return material;
}
