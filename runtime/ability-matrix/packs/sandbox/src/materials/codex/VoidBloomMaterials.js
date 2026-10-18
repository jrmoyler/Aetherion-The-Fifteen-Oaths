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
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  uniform vec3  uColorVein;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;

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
    vec3 V = normalize(vViewDir);
    float fres = pow(max(1.0 - abs(dot(N, V)), 0.0), 2.5);

    // Veins: a midrib and herringbone side veins, pulses running to the base.
    float midrib = exp(-pow(abs(u / 0.06), 2.0)) * smoothstep(0.98, 0.7, v);
    float hv = fract(v * uVeins - au * 1.4 + vSeed);
    float side = (1.0 - smoothstep(0.0, 0.06, min(hv, 1.0 - hv))) * smoothstep(0.08, 0.25, au) * (1.0 - smoothstep(0.7, 0.92, au));
    float pulse = pow(max(0.5 + 0.5 * sin((v * 2.5 + uFlow + vSeed) * 6.2831853), 0.0), 4.0);
    float veins = (midrib + side * 0.7) * (0.35 + 0.65 * pulse);

    float edge = smoothstep(0.78, 1.0, au);
    float tip = smoothstep(0.86, 1.0, v);
    float n = snoise(vec3(u * 3.0, v * 6.0, vSeed * 10.0)) * 0.5 + 0.5;

    vec3 col = mix(uColorBody, uColorDeep, v * 0.7 + n * 0.3);
    col += uColorVein * veins * uVeinGlow * (gl_FrontFacing ? 1.0 : 0.55);
    col += uColorRim * (edge * uEdgeGlow + tip * uEdgeGlow * 0.7 + fres * uRimGlow);
    col += uColorRim * uFlare * (0.5 + edge);
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
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
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() },
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
    u.uFlare.value = s.flare * c.edgeGlow;
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
    float lit = arm * smoothstep(0.12, 0.45, r) * (1.0 - smoothstep(0.8, 1.0, r)) * (0.6 + 0.4 * n);
    float lip = exp(-pow(abs((r - 0.86) / 0.07), 2.0));
    vec3 col = uColorCore + mix(uColorArmB, uColorArmA, smoothstep(0.3, 0.9, r)) * (lit * uGlow + lip * uGlow * 0.8);
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
    u.uColorRim.value.copy(getColor(c.colorRim));
  };

  return material;
}
