import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'vortexbell';

/**
 * Vortex Bell — the five bespoke shaders.
 *
 *  - **the bell** (`createBellMaterial`) — an open cylinder grid reshaped in
 *    the vertex stage into a bell: a flared lip, a waist, a domed crown — the
 *    profile is analytic, so every curve is a live slider — with its normal
 *    derived from the same profile. It **rings**: the classic (2,0) bell mode
 *    squeezes the lip into an oval that swaps axes, decaying, plus a fine hum.
 *    The fragment is a shell of streaming air: spiral streaks pouring down the
 *    surface, a bright fresnel silhouette (a bell is read by its outline), a
 *    glowing lip, and a brass **strike band** that runs from the crown to the
 *    lip when it is struck. Dissolves upward from the lip when it lifts away.
 *  - **the bell lens** (`createBellLensMaterial`) — the same bell on
 *    `LAYER.DISTORTION`, pushing the world out along its normal.
 *  - **the vortex ring** (`createVortexMaterial`) — a torus written from its
 *    own (θ, φ) parameters in the vertex stage, so its major and tube radius
 *    are uniforms. Rolling: poloidal bands turn round the tube (outward over
 *    the top, the way a real vortex ring rolls as it travels), streak noise
 *    runs round it, a fresnel rim outlines it.
 *  - **the vortex lens** (`createVortexLensMaterial`) — the torus on
 *    `LAYER.DISTORTION`, offset by the roll: the world is dragged round it.
 *  - **the bell print** (`createBellFloorMaterial`) — the floor under the
 *    bell: standing radial pressure rings, the four nodal diameters of the
 *    (2,0) mode glowing, a bright rim where the lip strikes, darkened inside.
 *
 * Every material reads `settings.vortexbell` in `userData.sync()`.
 */

/* ==================================================================== */
/* The bell                                                               */
/* ==================================================================== */

const BELL_GLSL = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;     // lip radius, metres
  uniform float uHeight;     // metres
  uniform float uWaist;      // radius at the shoulder, share of the lip
  uniform float uFlareExp;   // how fast the lip flares out of the waist
  uniform float uLipFlare;   // extra flare at the very lip
  uniform float uCrown;      // height share where the dome begins
  uniform float uMode;       // (2,0) mode amplitude, signed, already × sin(ωt)
  uniform float uModeAng;
  uniform float uHum;
  uniform float uSwell;      // the lens is a fatter bell

  float bellR(float y) {
    float r = uWaist + (1.0 - uWaist) * pow(clamp(1.0 - y / max(uCrown, 0.05), 0.0, 1.0), uFlareExp);
    r += uLipFlare * exp(-y * 25.0);
    float k = clamp((y - uCrown) / max(1.0 - uCrown, 0.01), 0.0, 1.0);
    r *= sqrt(max(1.0 - k * k, 0.0));
    return r;
  }

  vec3 bellPoint(float ang, float y, out vec3 normal) {
    float r = bellR(y);
    float dr = (bellR(min(y + 0.01, 1.0)) - bellR(max(y - 0.01, 0.0))) / 0.02;
    // The (2,0) mode: an oval that swaps axes; strongest at the lip.
    float mode = 1.0 + uMode * cos(2.0 * (ang - uModeAng)) * (1.0 - y) + uHum * sin(ang * 6.0 + y * 9.0);
    float R = uRadius * uSwell * mode;
    vec3 radial = vec3(cos(ang), 0.0, sin(ang));
    normal = normalize(radial * uHeight - vec3(0.0, 1.0, 0.0) * R * dr);
    return uCenter + radial * (r * R) + vec3(0.0, y * uHeight, 0.0);
  }
`;

const BELL_VERTEX = /* glsl */ `
  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vY;
  varying float vAng;
  varying float vViewZ;

  ${BELL_GLSL}

  void main() {
    float ang = atan(position.z, position.x);
    float y = clamp(position.y + 0.5, 0.0, 1.0);
    vec3 n;
    vec3 world = bellPoint(ang, y, n);
    vWorld = world;
    vNormalW = n;
    vY = y;
    vAng = ang;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const BELL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3  uCenter;
  uniform float uFlow;
  uniform float uTwist;
  uniform float uStreaks;
  uniform float uStreakGlow;
  uniform float uRimGlow;
  uniform float uBodyGlow;
  uniform float uLipGlow;
  uniform float uBand;        // where the strike band is, 1 crown → 0 lip; < 0 none
  uniform float uBandWidth;
  uniform float uBandGlow;
  uniform float uStrike;      // 0..1 flash of the strike
  uniform float uDissolve;
  uniform float uDissolveEdge;
  uniform float uSoftFade;
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorBand;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vY;
  varying float vAng;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    float facing = abs(dot(N, V));
    float rim = pow(1.0 - facing, 2.2);

    // Spiral streaks pouring down the bell. The angle is taken per fragment:
    // interpolated across the ±π wrap it would smear a seam down one side.
    float ang = atan(vWorld.z - uCenter.z, vWorld.x - uCenter.x);
    float a = ang / 6.2831853;
    float sp = a * uStreaks + vY * uTwist + uFlow;
    float lane = fract(sp);
    float id = floor(sp);
    float streakLine = exp(-pow((lane - 0.5) / 0.12, 2.0));
    float along = snoise(vec3(id * 3.7, vY * 3.0 + uFlow * 0.8, uSeed)) * 0.5 + 0.5;
    float streak = streakLine * smoothstep(0.25, 0.8, along);
    float haze = fbm3(vec3(cos(ang) * 1.5, sin(ang) * 1.5, vY * 4.0 + uFlow * 0.5 + uSeed)) * 0.5 + 0.5;

    float lip = exp(-vY * 18.0);
    float band = uBand < 0.0 ? 0.0 : exp(-pow((vY - uBand) / max(uBandWidth, 0.01), 2.0));

    vec3 col = mix(uColorC, uColorB, haze) * (uBodyGlow + rim * uRimGlow);
    col += uColorA * streak * uStreakGlow * (0.4 + 0.6 * rim + 0.3 * haze);
    col += uColorA * lip * uLipGlow;
    col += uColorBand * band * uBandGlow * (0.5 + rim);
    col += uColorBand * uStrike * (rim + lip) * 2.0;

    float mask = rim * 0.85 + 0.12 + streak * 0.5 + lip + band * 0.6;
    mask *= smoothstep(0.0, 0.015, vY + 0.005);

    if (uDissolve > 0.0) {
      float n = snoise(vec3(cos(ang) * 2.0 + uSeed, sin(ang) * 2.0, vY * 4.0)) * 0.5 + 0.5;
      float field = vY * 0.7 + n * 0.3;
      float thr = uDissolve * 1.15 - 0.08;
      float keep = smoothstep(thr, thr + 0.03, field);
      col += uColorA * keep * (1.0 - smoothstep(thr + 0.03, thr + 0.03 + uDissolveEdge, field)) * 3.0;
      mask *= keep;
    }

    mask *= uOpacity;
    if (mask < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (mask < 0.004) discard;
    gl_FragColor = vec4(col * mask * uGlobalGlow * mix(1.0, uShaderIntensity, 0.5), 1.0);
  }
`;

function bellShapeUniforms() {
  return {
    uCenter: { value: new Vector3() },
    uRadius: { value: 4 },
    uHeight: { value: 4.5 },
    uWaist: { value: 0.55 },
    uFlareExp: { value: 2.2 },
    uLipFlare: { value: 0.1 },
    uCrown: { value: 0.78 },
    uMode: { value: 0 },
    uModeAng: { value: 0 },
    uHum: { value: 0 },
    uSwell: { value: 1 }
  };
}

/** @param {object} st { center, radius, height, mode, modeAng, hum } */
function syncBellShape(u, st) {
  const c = settings[ID];
  u.uCenter.value.copy(st.center);
  u.uRadius.value = st.radius;
  u.uHeight.value = st.height;
  u.uWaist.value = c.bellWaist;
  u.uFlareExp.value = c.bellFlare;
  u.uLipFlare.value = c.lipFlare;
  u.uCrown.value = c.crownStart;
  u.uMode.value = st.mode;
  u.uModeAng.value = st.modeAng;
  u.uHum.value = st.hum;
}

/** The bell of streaming air. Additive. */
export function createBellMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...bellShapeUniforms(),
      uFlow: { value: 0 },
      uTwist: { value: 3 },
      uStreaks: { value: 22 },
      uStreakGlow: { value: 2 },
      uRimGlow: { value: 2.4 },
      uBodyGlow: { value: 0.25 },
      uLipGlow: { value: 3 },
      uBand: { value: -1 },
      uBandWidth: { value: 0.08 },
      uBandGlow: { value: 5 },
      uStrike: { value: 0 },
      uDissolve: { value: 0 },
      uDissolveEdge: { value: 0.06 },
      uSoftFade: { value: 0.4 },
      uOpacity: { value: 1 },
      uSeed: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorBand: { value: new Color() }
    }),
    vertexShader: BELL_VERTEX,
    fragmentShader: BELL_FRAGMENT
  });

  /** @param {object} st the shape state plus { flow, band, strike, dissolve, fade, seed } */
  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncBellShape(u, st);
    u.uSwell.value = 1;
    u.uFlow.value = st.flow;
    u.uTwist.value = c.spiralTwist;
    u.uStreaks.value = Math.max(1, Math.round(c.streakLanes));
    u.uStreakGlow.value = c.streakGlow * g.glow;
    u.uRimGlow.value = c.rimGlow * g.glow * g.fresnel;
    u.uBodyGlow.value = c.bodyGlow * g.glow;
    u.uLipGlow.value = c.lipGlow * g.glow;
    u.uBand.value = st.band;
    u.uBandWidth.value = c.bandWidth;
    u.uBandGlow.value = c.bandGlow * g.glow;
    u.uStrike.value = st.strike;
    u.uDissolve.value = st.dissolve;
    u.uDissolveEdge.value = c.dissolveEdge;
    u.uSoftFade.value = c.softFade;
    u.uOpacity.value = c.bellOpacity * g.opacity * st.fade;
    u.uSeed.value = st.seed;
    u.uColorA.value.copy(getColor(c.colorBellA));
    u.uColorB.value.copy(getColor(c.colorBellB));
    u.uColorC.value.copy(getColor(c.colorBellC));
    u.uColorBand.value.copy(getColor(c.colorBand));
  };

  return material;
}

const BELL_LENS_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec3  vNormalW;
  varying float vY;

  void main() {
    vec3 Nv = normalize((viewMatrix * vec4(normalize(vNormalW), 0.0)).xyz);
    float mask = smoothstep(0.0, 0.04, vY) * (1.0 - smoothstep(0.85, 1.0, vY));
    float s = uStrength * uShaderIntensity * mask * (1.0 - abs(Nv.z) * 0.6);
    if (s < 0.002) discard;
    gl_FragColor = vec4(normalize(Nv.xy + 1e-4) * 0.5 + 0.5, s, mask);
  }
`;

/** The bell's refraction. LAYER.DISTORTION. */
export function createBellLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...bellShapeUniforms(),
      uStrength: { value: 1 }
    }),
    vertexShader: BELL_VERTEX,
    fragmentShader: BELL_LENS_FRAGMENT
  });

  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncBellShape(u, st);
    u.uSwell.value = 1.04;
    u.uStrength.value = c.bellWarp * g.distortion * st.fade * (1 - st.dissolve) * (1 + st.strike * 1.5);
  };

  return material;
}

/* ==================================================================== */
/* The vortex ring                                                        */
/* ==================================================================== */

const TORUS_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uMajor;
  uniform float uTube;
  uniform float uSquash;     // flattens the tube vertically

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vTheta;
  varying float vPhi;
  varying float vViewZ;

  void main() {
    float theta = uv.x * 6.2831853;
    float phi = uv.y * 6.2831853;
    vec3 radial = vec3(cos(theta), 0.0, sin(theta));
    vec3 n = radial * cos(phi) + vec3(0.0, 1.0, 0.0) * sin(phi);
    vec3 world = uCenter + radial * (uMajor + uTube * cos(phi)) + vec3(0.0, uTube * uSquash * sin(phi), 0.0);
    vWorld = world;
    vNormalW = normalize(radial * cos(phi) * uSquash + vec3(0.0, 1.0, 0.0) * sin(phi));
    vTheta = theta;
    vPhi = phi;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const TORUS_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uRoll;
  uniform float uBands;
  uniform float uGlow;
  uniform float uRimGlow;
  uniform float uFade;
  uniform float uSoftFade;
  uniform float uSeed;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vTheta;
  varying float vPhi;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    float rim = pow(1.0 - abs(dot(N, V)), 2.0);

    // Bands rolling round the tube — the ring turning as it travels.
    float p = vPhi / 6.2831853 * uBands - uRoll;
    float wob = snoise(vec3(cos(vTheta) * 4.0, sin(vTheta) * 4.0, uSeed)) * 0.25;
    float band = exp(-pow((fract(p + wob) - 0.5) / 0.16, 2.0));
    float streak = fbm3(vec3(cos(vTheta) * 5.0, sin(vTheta) * 5.0, cos(vPhi - uRoll * 2.0) * 0.8 + sin(vPhi - uRoll * 2.0) * 0.6 + uSeed)) * 0.5 + 0.5;
    float outer = 0.5 + 0.5 * cos(vPhi);   // the leading, outside face

    vec3 col = mix(uColorC, uColorB, streak) * (0.35 + rim * uRimGlow);
    col += uColorA * band * uGlow * (0.5 + 0.5 * outer) * (0.6 + 0.4 * streak);

    float mask = (rim * 0.8 + 0.15 + band * 0.6) * uFade;
    if (mask < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (mask < 0.004) discard;
    gl_FragColor = vec4(col * mask * uGlobalGlow * mix(1.0, uShaderIntensity, 0.5), 1.0);
  }
`;

function torusUniforms() {
  return {
    uCenter: { value: new Vector3() },
    uMajor: { value: 4 },
    uTube: { value: 0.4 },
    uSquash: { value: 1 }
  };
}

/** @param {object} st { center, major, tube, roll, fade, seed } */
function syncTorus(u, st) {
  const c = settings[ID];
  u.uCenter.value.copy(st.center);
  u.uMajor.value = st.major;
  u.uTube.value = st.tube;
  u.uSquash.value = c.vortexSquash;
}

/** The vortex ring thrown off the rim. Additive. */
export function createVortexMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...torusUniforms(),
      uRoll: { value: 0 },
      uBands: { value: 6 },
      uGlow: { value: 2.5 },
      uRimGlow: { value: 2 },
      uFade: { value: 1 },
      uSoftFade: { value: 0.4 },
      uSeed: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() }
    }),
    vertexShader: TORUS_VERTEX,
    fragmentShader: TORUS_FRAGMENT
  });

  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncTorus(u, st);
    u.uRoll.value = st.roll;
    u.uBands.value = Math.max(1, Math.round(c.rollBands));
    u.uGlow.value = c.vortexGlow * g.glow;
    u.uRimGlow.value = c.vortexRim * g.glow * g.fresnel;
    u.uFade.value = st.fade * g.opacity;
    u.uSoftFade.value = c.softFade;
    u.uSeed.value = st.seed;
    u.uColorA.value.copy(getColor(c.colorVortexA));
    u.uColorB.value.copy(getColor(c.colorVortexB));
    u.uColorC.value.copy(getColor(c.colorVortexC));
  };

  return material;
}

const TORUS_LENS_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uRoll;
  uniform float uShaderIntensity;
  varying vec3  vNormalW;
  varying float vPhi;

  void main() {
    // Dragged round the tube: the offset follows the roll direction.
    vec3 N = normalize(vNormalW);
    vec3 Nv = normalize((viewMatrix * vec4(N, 0.0)).xyz);
    vec2 tangent = vec2(-Nv.y, Nv.x);
    float swirl = sin(vPhi * 2.0 - uRoll * 6.2831853);
    vec2 dir = normalize(Nv.xy * 0.6 + tangent * swirl + 1e-4);
    float s = uStrength * uShaderIntensity;
    if (s < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, s, 1.0);
  }
`;

/** The ring's drag on the air. LAYER.DISTORTION. */
export function createVortexLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...torusUniforms(),
      uRoll: { value: 0 },
      uStrength: { value: 1 }
    }),
    vertexShader: TORUS_VERTEX,
    fragmentShader: TORUS_LENS_FRAGMENT
  });

  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncTorus(u, st);
    u.uTube.value = st.tube * 1.5;
    u.uRoll.value = st.roll;
    u.uStrength.value = c.vortexWarp * g.distortion * st.fade;
  };

  return material;
}

/* ==================================================================== */
/* The bell print                                                         */
/* ==================================================================== */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;
  varying vec2 vP;

  void main() {
    vec2 p = position.xy * uExtent;
    vP = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(uCentre.x + p.x, 0.014, uCentre.z + p.y, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uRadius;      // the lip's radius on the floor
  uniform float uRings;
  uniform float uPhase;
  uniform float uGlow;
  uniform float uNodal;
  uniform float uDark;
  uniform float uPress;       // 0..1 how hard the bell is pressing the floor
  uniform float uStrike;      // 0..1 flash of the strike
  uniform float uModeAng;
  uniform float uErode;
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3  uColorA;
  uniform vec3  uColorBand;
  uniform vec3  uColorDark;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    float x = r / max(uRadius, 0.1);
    float ang = atan(vP.y, vP.x);
    float rag = snoise(vec3(vP * 0.9, uSeed)) * 0.04;

    // Standing pressure rings inside the lip.
    float rings = pow(0.5 + 0.5 * cos((x * uRings - uPhase) * 6.2831853), 6.0) * (1.0 - smoothstep(0.9, 1.0, x));
    // The (2,0) mode's four nodal diameters.
    float nodal = 1.0 - smoothstep(0.0, 0.05, abs(cos(2.0 * (ang - uModeAng))) * x);
    nodal *= 1.0 - smoothstep(0.85, 1.0, x);
    // The lip line.
    float lip = exp(-pow((x + rag - 1.0) / 0.025, 2.0));

    float inside = 1.0 - smoothstep(0.98, 1.06, x + rag);
    vec3 col = uColorDark;
    col += uColorA * (rings * uGlow + nodal * uNodal) * uPress * uGlobalGlow * uShaderIntensity;
    col += mix(uColorA, uColorBand, uStrike) * lip * (uGlow * 2.0 + uStrike * 4.0) * uPress;
    float a = max(inside * uDark * uPress, max(rings * uPress, max(nodal * uPress, lip * uPress)));

    float en = snoise(vec3(vP * 1.4, uSeed * 2.0)) * 0.5 + 0.5;
    float t = uErode * 1.3 - 0.15;
    a *= smoothstep(t, t + 0.15, en);
    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The print the bell leaves on the floor. Normal blending. */
export function createBellFloorMaterial() {
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
      uCentre: { value: new Vector3() },
      uExtent: { value: 5 },
      uRadius: { value: 4 },
      uRings: { value: 6 },
      uPhase: { value: 0 },
      uGlow: { value: 1.4 },
      uNodal: { value: 2 },
      uDark: { value: 0.5 },
      uPress: { value: 0 },
      uStrike: { value: 0 },
      uModeAng: { value: 0 },
      uErode: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uColorA: { value: new Color() },
      uColorBand: { value: new Color() },
      uColorDark: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /** @param {object} s { centre, radius, phase, press, strike, modeAng, erode, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uRadius.value = s.radius;
    u.uExtent.value = s.radius * 1.15 + 0.3;
    u.uRings.value = c.printRings;
    u.uPhase.value = s.phase;
    u.uGlow.value = c.printGlow * g.glow;
    u.uNodal.value = c.nodalGlow * g.glow;
    u.uDark.value = c.printDark;
    u.uPress.value = s.press;
    u.uStrike.value = s.strike;
    u.uModeAng.value = s.modeAng;
    u.uErode.value = s.erode;
    u.uSeed.value = s.seed;
    u.uOpacity.value = g.opacity;
    u.uColorA.value.copy(getColor(c.colorPrint));
    u.uColorBand.value.copy(getColor(c.colorBand));
    u.uColorDark.value.copy(getColor(c.colorPrintDark));
  };

  return material;
}
