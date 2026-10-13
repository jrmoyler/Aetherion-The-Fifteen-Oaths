import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/** Healing waves the floor and the curtains can carry at once. */
export const MAX_WAVES = 6;

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* ==================================================================== */
/* 1 · the petals                                                         */
/* ==================================================================== */

/**
 * The petals — one instanced draw for every petal in every ring.
 *
 * ## Placed in the vertex stage
 *
 * The blank (`createPetalBlankGeometry`) is parameter space: `(t, a, face)`.
 * `petalPoint` turns it into a leaf: an outline that is narrow at the hinge,
 * full a third of the way out and pinched to a point at the tip; a centreline
 * that is a circular arc (pitch at the hinge, `uCurl` more by the tip — a
 * closed form, so no integration); a dish across the width (`uCup`); and a
 * thickness that thins toward the tip. Normals are rebuilt by finite
 * differences of that same function, so the shading is right however far the
 * sliders bend it.
 *
 * Each instance carries `aPetal = (ring, azimuth, seed, slot)`. The ring picks
 * its length, pitch, hinge height and spin out of three-element uniform
 * arrays, so the three rings unfold on their own clocks from one draw.
 *
 * ## The fragment
 *
 * A petal is a row of `uSegments` plates. Most are **brass** — sky
 * reflection, a tight specular, engraved concentric filigree, a glowing inlay
 * round the edge and a light channel down the midrib. Every `uLightEvery`th
 * plate is a **pane of light** instead: a lit membrane with a slow inner
 * flow. The gaps between plates are recesses with light leaking out of them.
 * A healing wave leaving the lotus sends a **pulse** along every petal from
 * hinge to tip (`uPulse`), and the panes flare as it crosses them.
 *
 * Opaque and depth-writing, on LAYER.VFX for the same reason as the Chrono
 * rings: it is shaped in the vertex stage, and the depth prepass would draw
 * the raw blank.
 */
const PETAL_VERTEX = /* glsl */ `
  attribute float aKind;
  attribute vec4  aPetal;      // ring, azimuth, seed, slot

  uniform float uTime;
  uniform float uLen[3];
  uniform float uPitch[3];
  uniform float uSpin[3];
  uniform float uHinge[3];
  uniform float uHubRadius;
  uniform float uWidth;
  uniform float uTaper;
  uniform float uThick;
  uniform float uCup;
  uniform float uCurl;
  uniform float uBreathe;
  uniform float uBreatheSpeed;
  uniform float uLift;         // radians, the wave's lift

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec2  vPetal;        // t along, a across
  varying float vFace;
  varying float vKind;
  varying float vSeed;
  varying float vRing;

  float halfWidth(float t, float len) {
    float body = pow(clamp(sin(3.14159265 * pow(clamp(t, 0.0, 1.0), 0.62)), 0.0, 1.0), max(uTaper, 0.05) * 0.5);
    return uWidth * len * (0.2 * (1.0 - t) + 0.8 * body);
  }

  /** Petal-local point: x out along the petal, y up, z across. */
  vec3 petalPoint(float t, float a, float face, float len, float pitch) {
    float k = uCurl;
    float th = pitch + k * t;
    vec2 c;
    if (abs(k) < 1e-3) {
      c = vec2(cos(pitch), sin(pitch)) * len * t;
    } else {
      c = vec2(sin(th) - sin(pitch), cos(pitch) - cos(th)) * len / k;
    }
    vec3 T = vec3(cos(th), sin(th), 0.0);
    vec3 N = vec3(-sin(th), cos(th), 0.0);
    float w = halfWidth(t, len);
    float dish = uCup * w * a * a;
    float thick = face * uThick * 0.5 * (1.0 - 0.65 * t);
    return vec3(c, 0.0) + vec3(0.0, 0.0, 1.0) * a * w + N * (dish + thick);
  }

  void main() {
    int ring = int(aPetal.x + 0.5);
    float len = uLen[0];
    float pitch = uPitch[0];
    float spin = uSpin[0];
    float hinge = uHinge[0];
    if (ring == 1) { len = uLen[1]; pitch = uPitch[1]; spin = uSpin[1]; hinge = uHinge[1]; }
    if (ring == 2) { len = uLen[2]; pitch = uPitch[2]; spin = uSpin[2]; hinge = uHinge[2]; }

    float seed = aPetal.z;
    // The breath and the wave both pitch the petal, never bend it, so it stays
    // a stamped plate rather than a flag.
    pitch += uBreathe * sin(uTime * uBreatheSpeed * 6.2831853 + seed * 6.2831853) + uLift * (0.6 + 0.4 * seed);

    float t = position.x;
    float a = position.y;
    float face = position.z;

    vec3 p = petalPoint(t, a, face, len, pitch);

    // Finite-difference normal, in petal space.
    float e = 0.01;
    vec3 n;
    if (aKind < 0.5) {
      vec3 pt = petalPoint(min(t + e, 1.0), a, face, len, pitch) - petalPoint(max(t - e, 0.0), a, face, len, pitch);
      vec3 pa = petalPoint(t, min(a + e, 1.0), face, len, pitch) - petalPoint(t, max(a - e, -1.0), face, len, pitch);
      n = normalize(cross(pt, pa)) * face;
    } else if (aKind < 1.5) {
      vec3 pa = petalPoint(t, a, 0.0, len, pitch) - petalPoint(t, a * 0.98, 0.0, len, pitch);
      n = normalize(pa + vec3(1e-5));
    } else {
      vec3 pt = petalPoint(min(t + e, 1.0), a, 0.0, len, pitch) - petalPoint(max(t - e, 0.0), a, 0.0, len, pitch);
      n = normalize(pt) * (t > 0.5 ? 1.0 : -1.0);
    }

    // Onto the hinge ring: petal x is the radial direction at its azimuth.
    float phi = aPetal.y + spin;
    vec3 radial = vec3(cos(phi), 0.0, sin(phi));
    vec3 tangent = vec3(-sin(phi), 0.0, cos(phi));
    vec3 local = radial * (uHubRadius + p.x) + vec3(0.0, hinge + p.y, 0.0) + tangent * p.z;
    vec3 nLocal = radial * n.x + vec3(0.0, n.y, 0.0) + tangent * n.z;

    vec4 world = modelMatrix * vec4(local, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * nLocal);
    vPetal = vec2(t, a);
    vFace = face;
    vKind = aKind;
    vSeed = seed;
    vRing = aPetal.x;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PETAL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSegments;
  uniform float uSegmentGap;
  uniform float uLightEvery;
  uniform float uTrim;
  uniform float uRib;
  uniform float uMetal;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uFiligree;
  uniform float uLightGlow;
  uniform float uPulseGlow;
  uniform float uPulse;        // 0..1 strength of the pulse running out the petals
  uniform float uPulseFront;   // where it is, 0 hinge → 1 tip
  uniform float uLightFade;
  uniform vec3  uColorBrass;
  uniform vec3  uColorDeep;
  uniform vec3  uColorSpec;
  uniform vec3  uColorLight;
  uniform vec3  uColorHot;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec2  vPetal;
  varying float vFace;
  varying float vKind;
  varying float vSeed;
  varying float vRing;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    float t = vPetal.x;
    float a = vPetal.y;
    float segs = max(1.0, floor(uSegments + 0.5));
    float st = t * segs;
    float seg = floor(min(st, segs - 0.001));
    float f = fract(st);
    float gapHalf = uSegmentGap * 0.5;
    float aaT = fwidth(st) * 1.2;
    // Inside a plate: 1; in the recess between two: 0.
    float plate = smoothstep(gapHalf - aaT, gapHalf + aaT, f) * (1.0 - smoothstep(1.0 - gapHalf - aaT, 1.0 - gapHalf + aaT, f));
    // The very first plate starts at the hinge; no recess there.
    if (seg < 0.5 && f < 0.5) plate = 1.0;

    float every = floor(uLightEvery + 0.5);
    // The last plate of every group of N is a pane (N = 1: all of them).
    float isPane = every >= 1.0 ? step(every - 1.5, mod(seg + vRing, every)) : 0.0;

    /* --- the pulse running out along the petal --- */
    float pulse = exp(-pow((t - uPulseFront) / 0.13, 2.0)) * uPulse;
    float trail = (1.0 - smoothstep(uPulseFront - 0.5, uPulseFront, t)) * step(t, uPulseFront) * uPulse * 0.35;

    /* --- brass --- */
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;
    float fres = 0.3 + 0.7 * pow(1.0 - ndv, 5.0);
    float lambert = 0.35 + 0.65 * clamp(dot(N, L), 0.0, 1.0);
    // Engraved rings round each plate's own centre: filigree.
    vec2 pc = vec2((f - 0.5) * 2.2, a);
    float rings = 0.5 + 0.5 * sin(length(pc) * 26.0 + vSeed * 6.0);
    float engrave = smoothstep(0.75, 0.95, rings) * uFiligree;
    float brush = snoise(vec3(t * 60.0, a * 4.0, vSeed * 13.0)) * 0.05;
    vec3 brass = uColorBrass * (lambert * 0.5 + brush) + uColorBrass * env * uMetal * fres;
    brass += uColorSpec * pow(clamp(dot(N, H), 0.0, 1.0), uGloss) * uSpecular;
    brass = mix(brass, uColorDeep * 0.8, engrave);
    brass += uColorDeep * 0.25;

    // Inlay round the plate's edge, and the midrib channel.
    float edgeA = abs(a);
    float aaA = fwidth(a) * 1.2;
    float trim = smoothstep(1.0 - uTrim - aaA, 1.0 - uTrim + aaA, edgeA);
    float rib = 1.0 - smoothstep(uRib - aaA, uRib + aaA, edgeA);
    float inlay = max(trim, rib) * step(vKind, 0.5) * step(0.0, vFace);

    /* --- a pane of light --- */
    float flow = fbm3(vec3(a * 1.6, t * 3.0 - uTime * 0.7, vSeed * 5.0)) * 0.5 + 0.5;
    vec3 pane = mix(uColorLight, uColorHot, smoothstep(0.2, 1.0, t) * 0.6 + flow * 0.4);
    float paneLight = (0.55 + 0.45 * flow) * (0.6 + 0.4 * pow(1.0 - ndv, 2.0));

    float glow = uLightGlow * uLightFade * uGlobalGlow * uShaderIntensity;
    float pulseLight = (pulse * uPulseGlow + trail) * uLightFade * uGlobalGlow;

    vec3 color;
    if (vKind > 0.5) {
      // Side walls and caps: dark worked metal with a lit seam.
      color = mix(brass * 0.55, uColorLight * glow * 0.4, isPane * 0.6);
    } else if (isPane > 0.5) {
      color = pane * paneLight * glow + uColorHot * pulseLight * 1.4;
      // The pane is framed by the same brass as the rest.
      color = mix(color, brass, trim * 0.85);
    } else {
      color = brass;
      color += uColorLight * inlay * glow * 0.8;
      color += mix(uColorLight, uColorHot, 0.5) * pulseLight * (0.25 + inlay);
    }
    // Recesses between plates: dark, with light leaking out of the seam.
    vec3 recess = uColorDeep * 0.2 + uColorLight * glow * 0.55 + uColorHot * pulseLight;
    color = mix(recess, color, plate);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createSanctuaryPetalMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uLen: { value: [1, 1, 1] },
      uPitch: { value: [1.6, 1.6, 1.6] },
      uSpin: { value: [0, 0, 0] },
      uHinge: { value: [0, 0, 0] },
      uHubRadius: { value: 0.3 },
      uWidth: { value: 0.3 },
      uTaper: { value: 1.6 },
      uThick: { value: 0.03 },
      uCup: { value: 0.2 },
      uCurl: { value: 0.5 },
      uBreathe: { value: 0 },
      uBreatheSpeed: { value: 1 },
      uLift: { value: 0 },
      uSegments: { value: 5 },
      uSegmentGap: { value: 0.07 },
      uLightEvery: { value: 2 },
      uTrim: { value: 0.07 },
      uRib: { value: 0.07 },
      uMetal: { value: 1 },
      uGloss: { value: 60 },
      uSpecular: { value: 1.5 },
      uFiligree: { value: 0.5 },
      uLightGlow: { value: 2 },
      uPulseGlow: { value: 4 },
      uPulse: { value: 0 },
      uPulseFront: { value: 0 },
      uLightFade: { value: 1 },
      uColorBrass: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorSpec: { value: new Color() },
      uColorLight: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: PETAL_VERTEX,
    fragmentShader: PETAL_FRAGMENT
  });

  /**
   * @param {object} state { len[3], pitch[3], spin[3], hinge[3], hubRadius,
   *   lift, pulse, pulseFront, lightFade }
   */
  material.userData.sync = (state) => {
    const c = settings.sanctuary;
    const g = settings.global;
    const u = material.uniforms;
    for (let i = 0; i < 3; i++) {
      u.uLen.value[i] = state.len[i];
      u.uPitch.value[i] = state.pitch[i];
      u.uSpin.value[i] = state.spin[i];
      u.uHinge.value[i] = state.hinge[i];
    }
    u.uHubRadius.value = state.hubRadius;
    u.uWidth.value = c.petalWidth;
    u.uTaper.value = c.petalTaper;
    u.uThick.value = c.petalThickness;
    u.uCup.value = c.petalCup;
    u.uCurl.value = c.petalCurl;
    u.uBreathe.value = c.breathe * state.breathe;
    u.uBreatheSpeed.value = c.breatheSpeed * g.animationSpeed;
    u.uLift.value = state.lift;
    u.uSegments.value = c.segments;
    u.uSegmentGap.value = c.segmentGap;
    u.uLightEvery.value = c.lightEvery;
    u.uTrim.value = c.trimWidth;
    u.uRib.value = c.ribWidth;
    u.uMetal.value = c.metalReflect;
    u.uGloss.value = c.metalGloss;
    u.uSpecular.value = c.metalSpecular;
    u.uFiligree.value = c.filigree;
    u.uLightGlow.value = c.lightGlow * g.glow;
    u.uPulseGlow.value = c.pulseGlow;
    u.uPulse.value = state.pulse;
    u.uPulseFront.value = state.pulseFront;
    u.uLightFade.value = state.lightFade;
    u.uColorBrass.value.copy(getColor(c.colorBrass));
    u.uColorDeep.value.copy(getColor(c.colorBrassDeep));
    u.uColorSpec.value.copy(getColor(c.colorBrassSpec));
    u.uColorLight.value.copy(getColor(c.colorLight));
    u.uColorHot.value.copy(getColor(c.colorLightHot));
  };

  return material;
}

/* ==================================================================== */
/* the seed pod                                                           */
/* ==================================================================== */

/**
 * The brass hub the petals hinge on: the same brass as the plates, pierced
 * with a voronoi scatter of holes that glow from inside, and a band of light
 * round its lip where the hinges are.
 */
const POD_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;

  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const POD_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uMetal;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uHoles;
  uniform float uGlow;
  uniform float uPulse;
  uniform vec3  uColorBrass;
  uniform vec3  uColorDeep;
  uniform vec3  uColorSpec;
  uniform vec3  uColorLight;
  uniform vec3  uColorHot;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;

  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;
    float fres = 0.3 + 0.7 * pow(1.0 - ndv, 5.0);
    vec3 brass = uColorBrass * (0.35 + 0.5 * clamp(dot(N, L), 0.0, 1.0)) + uColorBrass * env * uMetal * fres;
    brass += uColorSpec * pow(clamp(dot(N, normalize(L + V)), 0.0, 1.0), uGloss) * uSpecular;
    brass += uColorDeep * 0.25;

    // Holes on the dome: voronoi cells on the azimuth/height.
    float az = atan(vLocal.z, vLocal.x) / 6.2831853 + 0.5;
    vec2 q = vec2(az * uHoles * 2.0, vLocal.y * uHoles * 0.8);
    vec2 vor = voronoi2(q);
    float hole = 1.0 - smoothstep(0.16, 0.22, vor.x);
    hole *= smoothstep(0.3, 0.45, vLocal.y);
    float lip = 1.0 - smoothstep(0.0, 0.06, abs(vLocal.y - 0.14));

    float flick = 0.75 + 0.25 * sin(uTime * 3.0 + vor.y * 30.0);
    vec3 light = mix(uColorLight, uColorHot, 0.5 + 0.5 * uPulse) * uGlow * uGlobalGlow * (1.0 + uPulse * 2.0);
    vec3 color = mix(brass, light * flick, hole) + light * lip * 0.7;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createSanctuaryPodMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uMetal: { value: 1 },
      uGloss: { value: 60 },
      uSpecular: { value: 1.5 },
      uHoles: { value: 7 },
      uGlow: { value: 3 },
      uPulse: { value: 0 },
      uColorBrass: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorSpec: { value: new Color() },
      uColorLight: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: POD_VERTEX,
    fragmentShader: POD_FRAGMENT
  });

  /** @param {object} state { pulse, lightFade } */
  material.userData.sync = (state) => {
    const c = settings.sanctuary;
    const g = settings.global;
    const u = material.uniforms;
    u.uMetal.value = c.metalReflect;
    u.uGloss.value = c.metalGloss;
    u.uSpecular.value = c.metalSpecular;
    u.uHoles.value = c.podHoles;
    u.uGlow.value = c.podGlow * g.glow * state.lightFade;
    u.uPulse.value = state.pulse;
    u.uColorBrass.value.copy(getColor(c.colorBrass));
    u.uColorDeep.value.copy(getColor(c.colorBrassDeep));
    u.uColorSpec.value.copy(getColor(c.colorBrassSpec));
    u.uColorLight.value.copy(getColor(c.colorLight));
    u.uColorHot.value.copy(getColor(c.colorLightHot));
  };

  return material;
}

/* ==================================================================== */
/* the dawn orb                                                           */
/* ==================================================================== */

/**
 * A camera-facing sun over the hub: a hot core, a soft halo, and slowly
 * turning rays whose lengths are rolled per ray. It is also the bead that
 * travels to the circle — the same mesh, smaller, with no rays.
 */
const ORB_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vLocal;

  void main() {
    vLocal = position.xy * 2.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize * 2.0 * 2.0;
    gl_Position = projectionMatrix * mv;
  }
`;

const ORB_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform float uRays;
  uniform float uRayLength;
  uniform float uRayAmount;
  uniform float uFade;
  uniform float uPulse;
  uniform vec3  uColorCore;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;

  varying vec2 vLocal;

  ${noiseGLSL}

  void main() {
    // vLocal spans ±1, which is ±2 orb radii.
    float r = length(vLocal);
    float core = exp(-r * r * 9.0);
    float halo = exp(-r * 2.6) * 0.55;
    float ang = atan(vLocal.y, vLocal.x);
    float n = max(3.0, floor(uRays + 0.5));
    float sector = floor((ang / 6.2831853 + 0.5) * n);
    float len = uRayLength * (0.6 + 0.4 * hash11(sector + 3.0)) * (0.85 + 0.15 * sin(uTime * 2.0 + sector));
    float across = abs(fract((ang + uTime * 0.25) / 6.2831853 * n) - 0.5);
    float ray = (1.0 - smoothstep(0.0, 0.12, across)) * (1.0 - smoothstep(0.2, len * 0.5, r)) * smoothstep(0.1, 0.25, r);
    ray *= uRayAmount;

    float body = core + halo * (1.0 + uPulse) + ray * 0.6;
    vec3 color = mix(uColorRim, uColorCore, clamp(core * 1.4 + ray * 0.3, 0.0, 1.0)) * body;
    float alpha = clamp(body, 0.0, 1.0) * uFade;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(color * uGlow * uGlobalGlow * uFade * (1.0 + uPulse), alpha);
  }
`;

export function createSanctuaryOrbMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 0.5 },
      uGlow: { value: 2 },
      uRays: { value: 9 },
      uRayLength: { value: 1.5 },
      uRayAmount: { value: 1 },
      uFade: { value: 1 },
      uPulse: { value: 0 },
      uColorCore: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: ORB_VERTEX,
    fragmentShader: ORB_FRAGMENT
  });

  /** @param {object} state { size, rays, fade, pulse } */
  material.userData.sync = (state) => {
    const c = settings.sanctuary;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = Math.max(0.01, state.size);
    u.uGlow.value = c.orbGlow * g.glow;
    u.uRays.value = c.orbRays;
    u.uRayLength.value = c.orbRayLength;
    u.uRayAmount.value = state.rays;
    u.uFade.value = state.fade * g.opacity;
    u.uPulse.value = state.pulse;
    u.uColorCore.value.copy(getColor(c.colorOrbCore));
    u.uColorRim.value.copy(getColor(c.colorOrbRim));
  };

  return material;
}

/* ==================================================================== */
/* 2 · the sanctuary floor                                                */
/* ==================================================================== */

/**
 * The living floor — a ground quad drawn in metres from its centre.
 *
 *  - **Spread**: everything is masked to a disc of `uSpread` metres whose
 *    edge is ragged with noise and burns bright as it grows.
 *  - **Petal lattice**: two families of logarithmic spirals, one turning each
 *    way. Their intersections tile the disc with petal-shaped cells that grow
 *    toward the rim — the same packing a lotus seed head and a sunflower use,
 *    which is why it reads as grown rather than drawn.
 *  - **Light veins**: ridged noise thresholded to thin lines, with brightness
 *    running *outward* along them so the floor reads as alive, not lit.
 *  - **Healing waves**: up to `MAX_WAVES` rings (radius, strength) which light
 *    the lattice they cross far harder than the empty floor between.
 *  - **Rim**: a boundary circle with ticks, revealed once the spread reaches
 *    it.
 */
const FLOOR_VERTEX = /* glsl */ `
  uniform float uQuadSize;
  varying vec2 vLocal;
  varying vec3 vWorld;

  void main() {
    vLocal = (uv - 0.5) * uQuadSize;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  #define MAX_WAVES ${MAX_WAVES}

  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;      // full floor radius, metres
  uniform float uSpread;      // how far it has spread, metres
  uniform float uSpreadEdge;
  uniform float uArms;
  uniform float uTwist;
  uniform float uLine;
  uniform float uFill;
  uniform float uLatticeGlow;
  uniform float uVeinScale;
  uniform float uVeinSharp;
  uniform float uVeinFlow;
  uniform float uVeinGlow;
  uniform float uRimWidth;
  uniform float uRimGlow;
  uniform float uRimTicks;
  uniform float uOpacity;
  uniform float uFade;
  uniform vec4  uWaves[MAX_WAVES];   // radius, strength, width, -
  uniform vec3  uColorFloor;
  uniform vec3  uColorVein;
  uniform vec3  uColorLattice;
  uniform vec3  uColorRim;
  uniform vec3  uColorWaveA;
  uniform vec3  uColorWaveB;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uNoiseStrength;

  varying vec2 vLocal;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float r = length(vLocal);
    float ang = atan(vLocal.y, vLocal.x);

    /* --- the spread mask, ragged at its edge --- */
    float rag = snoise(vec3(vLocal * 1.3, uSeed + uTime * 0.2)) * uSpreadEdge * uNoiseStrength;
    float reach = uSpread + rag;
    float inside = 1.0 - smoothstep(reach - uSpreadEdge * 0.5, reach, r);
    float growing = step(uSpread, uRadius * 0.999);
    float edgeBand = exp(-pow((r - reach) / max(uSpreadEdge * 0.5, 1e-3), 2.0)) * growing;
    // Nothing past the floor's own radius, however ragged.
    float bound = 1.0 - smoothstep(uRadius, uRadius + uRimWidth * 2.0, r);
    inside *= bound;

    /* --- the petal lattice: two counter-turning log spirals --- */
    float lr = log(r + 0.35) * uTwist;
    float arms = max(3.0, floor(uArms + 0.5));
    float s = ang / 6.2831853 * arms;
    float u1 = s + lr;
    float u2 = s - lr;
    float l1 = abs(fract(u1 + 0.5) - 0.5);
    float l2 = abs(fract(u2 + 0.5) - 0.5);
    float lineD = min(l1, l2);
    float aa = fwidth(lineD) * 1.2;
    float stroke = 1.0 - smoothstep(uLine - aa, uLine + aa, lineD);
    float cellC = max(abs(fract(u1) - 0.5), abs(fract(u2) - 0.5));
    float fill = pow(clamp(1.0 - cellC * 2.0, 0.0, 1.0), 1.5);
    // The middle of the disc is too dense to read: let it melt to the hub glow.
    float hubMelt = smoothstep(0.2, 0.8, r);
    stroke *= hubMelt;

    /* --- light veins, flowing outward --- */
    vec2 vp = vLocal * uVeinScale;
    float ridge = 1.0 - abs(snoise(vec3(vp, uSeed * 3.1)));
    float ridge2 = 1.0 - abs(snoise(vec3(vp * 2.1 + 7.0, uSeed * 1.7)));
    float vein = pow(ridge, uVeinSharp) + pow(ridge2, uVeinSharp * 1.4) * 0.5;
    float flow = 0.35 + 0.65 * pow(0.5 + 0.5 * sin((r * 2.2 - uTime * uVeinFlow * 6.2831853) + ridge * 2.0), 3.0);
    vein *= flow;

    /* --- healing waves --- */
    float wave = 0.0;
    float waveMix = 0.0;
    for (int k = 0; k < MAX_WAVES; k++) {
      vec4 w = uWaves[k];
      if (w.y <= 0.0) continue;
      float band = exp(-pow((r - w.x) / max(w.z, 1e-3), 2.0)) * w.y;
      // A soft afterglow left behind the front.
      float wake = (1.0 - smoothstep(w.x - w.z * 4.0, w.x, r)) * step(r, w.x) * w.y * 0.18;
      wave += band + wake;
      waveMix = max(waveMix, band);
    }
    vec3 waveColor = mix(uColorWaveA, uColorWaveB, 0.5 + 0.5 * sin(ang * 3.0 + uTime));

    /* --- the rim --- */
    float rimD = abs(r - uRadius);
    float rimLine = 1.0 - smoothstep(uRimWidth * 0.5 - aa, uRimWidth * 0.5 + aa, rimD);
    float tickCell = (fract(ang / 6.2831853 * max(uRimTicks, 1.0)) - 0.5) * 6.2831853 / max(uRimTicks, 1.0) * uRadius;
    float tick = (1.0 - smoothstep(uRimWidth * 0.3, uRimWidth * 0.6, abs(tickCell))) * step(uRadius - uRimWidth * 4.0, r) * step(r, uRadius);
    float rim = max(rimLine, tick * 0.7) * smoothstep(uRadius * 0.9, uRadius, uSpread);

    /* --- compose --- */
    float hub = exp(-r * r * 1.6) * 0.5;
    vec3 color = uColorFloor * (0.18 + fill * uFill * 2.0 + hub)
               + uColorLattice * stroke * uLatticeGlow * (0.35 + wave * 2.5)
               + uColorLattice * fill * uFill * wave * 1.2
               + uColorVein * vein * uVeinGlow * (0.5 + wave)
               + waveColor * wave * (0.45 + stroke * 1.5)
               + uColorRim * edgeBand * 1.6;
    color *= inside;
    color += uColorRim * rim * uRimGlow;

    float alpha = clamp((0.25 + stroke * 0.6 + vein * 0.5 + wave + edgeBand) * inside + rim, 0.0, 1.0) * uFade * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uGlobalGlow * uShaderIntensity * uFade * uOpacity, alpha);
  }
`;

export function createSanctuaryFloorMaterial() {
  const waves = [];
  for (let i = 0; i < MAX_WAVES; i++) waves.push(new Vector4(0, 0, 0.4, 0));

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uQuadSize: { value: 8 },
      uSeed: { value: 0 },
      uRadius: { value: 3 },
      uSpread: { value: 0 },
      uSpreadEdge: { value: 0.3 },
      uArms: { value: 14 },
      uTwist: { value: 2.4 },
      uLine: { value: 0.06 },
      uFill: { value: 0.12 },
      uLatticeGlow: { value: 1.5 },
      uVeinScale: { value: 1.4 },
      uVeinSharp: { value: 18 },
      uVeinFlow: { value: 0.45 },
      uVeinGlow: { value: 1.8 },
      uRimWidth: { value: 0.05 },
      uRimGlow: { value: 2 },
      uRimTicks: { value: 48 },
      uOpacity: { value: 1 },
      uFade: { value: 1 },
      uWaves: { value: waves },
      uColorFloor: { value: new Color() },
      uColorVein: { value: new Color() },
      uColorLattice: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorWaveA: { value: new Color() },
      uColorWaveB: { value: new Color() },
      uNoiseStrength: { value: 1 }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /** @param {object} state { quadSize, radius, spread, fade, seed } — waves are written in place */
  material.userData.sync = (state) => {
    const c = settings.sanctuary;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuadSize.value = state.quadSize;
    u.uSeed.value = state.seed;
    u.uRadius.value = state.radius;
    u.uSpread.value = state.spread;
    u.uSpreadEdge.value = c.spreadEdge;
    u.uArms.value = c.latticeArms;
    u.uTwist.value = c.latticeTwist;
    u.uLine.value = c.latticeLine;
    u.uFill.value = c.latticeFill;
    u.uLatticeGlow.value = c.latticeGlow;
    u.uVeinScale.value = c.veinScale * g.noiseFrequency;
    u.uVeinSharp.value = c.veinSharp;
    u.uVeinFlow.value = c.veinFlow * g.noiseSpeed;
    u.uVeinGlow.value = c.veinGlow;
    u.uRimWidth.value = c.rimWidth;
    u.uRimGlow.value = c.rimGlow;
    u.uRimTicks.value = c.rimTicks;
    u.uOpacity.value = c.floorOpacity * g.opacity;
    u.uFade.value = state.fade;
    u.uNoiseStrength.value = g.noiseStrength;
    u.uColorFloor.value.copy(getColor(c.colorFloor));
    u.uColorVein.value.copy(getColor(c.colorVein));
    u.uColorLattice.value.copy(getColor(c.colorLattice));
    u.uColorRim.value.copy(getColor(c.colorRim));
    u.uColorWaveA.value.copy(getColor(c.colorWaveA));
    u.uColorWaveB.value.copy(getColor(c.colorWaveB));
  };

  return material;
}

/* ==================================================================== */
/* 3 · the wave curtain                                                   */
/* ==================================================================== */

/**
 * The curtain at a healing wave's front: an open cylinder of light standing
 * on the floor, combed into vertical streaks that climb, fading out at the
 * top and feathered against the floor at the bottom. Gold at the foot, green
 * above. One material per curtain, so overlapping waves keep their own age.
 */
const CURTAIN_VERTEX = /* glsl */ `
  varying vec2  vUv;
  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vViewZ;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * vec3(position.x, 0.0, position.z));
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const CURTAIN_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uStreaks;
  uniform float uGlow;
  uniform float uSeed;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec2  uResolution;
  uniform sampler2D uSceneDepth;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uGlobalGlow;

  varying vec2  vUv;
  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float h = vUv.y;
    float n = max(4.0, floor(uStreaks + 0.5));
    float col = floor(vUv.x * n);
    float rnd = hash11(col + uSeed * 31.0);
    float across = abs(fract(vUv.x * n) - 0.5);
    float streak = 1.0 - smoothstep(0.08, 0.32, across);
    float climb = fract(h * (1.2 + rnd) - uTime * (0.6 + rnd * 0.8) + rnd);
    float pulse = pow(1.0 - climb, 3.0);
    float height = 0.45 + 0.55 * rnd;
    float body = (1.0 - smoothstep(height * 0.4, height, h)) * smoothstep(0.0, 0.04, h);
    float sheet = (1.0 - smoothstep(0.0, 0.6, h)) * 0.35;
    float shimmer = 0.75 + 0.25 * snoise(vec3(vUv.x * 30.0, h * 3.0 - uTime * 2.0, uSeed));

    float light = (streak * pulse * body + sheet) * shimmer;
    vec3 color = mix(uColorB, uColorA, smoothstep(0.0, 0.5, h)) * light;
    float alpha = clamp(light, 0.0, 1.0) * uStrength;

    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.15);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uGlow * uGlobalGlow * uStrength, alpha);
  }
`;

export function createSanctuaryCurtainMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStrength: { value: 0 },
      uStreaks: { value: 40 },
      uGlow: { value: 2 },
      uSeed: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: CURTAIN_VERTEX,
    fragmentShader: CURTAIN_FRAGMENT
  });

  /** @param {object} state { strength, seed } */
  material.userData.sync = (state) => {
    const c = settings.sanctuary;
    const g = settings.global;
    const u = material.uniforms;
    u.uStrength.value = state.strength * c.waveOpacity * g.opacity;
    u.uStreaks.value = c.waveStreaks;
    u.uGlow.value = c.waveGlow * g.glow;
    u.uSeed.value = state.seed;
    u.uColorA.value.copy(getColor(c.colorWaveA));
    u.uColorB.value.copy(getColor(c.colorWaveB));
  };

  return material;
}

/* ==================================================================== */
/* 5 · the haze                                                           */
/* ==================================================================== */

/**
 * LAYER.DISTORTION proxy: a warm, slow shimmer over the lotus — the air over
 * a sunlit field — plus a soft ring pushed outward each time a wave leaves.
 * Gentle on purpose: this is a healing spell, the warp should be felt more
 * than seen. Same output encoding as `createAcidFumeMaterial`.
 */
const HAZE_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vLocal;
  varying vec3 vWorld;

  void main() {
    vLocal = position.xy * 2.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize * 2.0;
    vWorld = (modelMatrix * vec4(position.xy * uSize * 2.0, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const HAZE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uPulse;
  uniform float uPulseAt;
  uniform float uSeed;
  uniform vec2  uResolution;
  uniform float uShaderIntensity;

  varying vec2 vLocal;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float len = length(vLocal);
    if (len > 1.0) discard;
    vec2 dir = vLocal / max(len, 1e-4);

    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale * 0.5 - uTime * uSpeed + uSeed);
    vec2 shimmer = vec2(snoise(np), snoise(np + vec3(13.1, 5.7, 21.3)));
    float body = (1.0 - smoothstep(0.2, 1.0, len));
    vec2 offset = shimmer * uStrength * body;

    float ring = exp(-pow((len - uPulseAt) / 0.08, 2.0)) * uPulse;
    offset += dir * ring;

    float strength = length(offset);
    float mask = 1.0 - smoothstep(0.85, 1.0, len);
    if (strength * mask < 0.002) discard;
    vec2 o = offset / max(strength, 1e-4);
    float aspect = max(uResolution.x, 1.0) / max(uResolution.y, 1.0);
    o.x /= aspect;
    gl_FragColor = vec4(o * 0.5 + 0.5, strength * uShaderIntensity, mask);
  }
`;

export function createSanctuaryHazeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 4 },
      uStrength: { value: 0 },
      uScale: { value: 2 },
      uSpeed: { value: 0.6 },
      uPulse: { value: 0 },
      uPulseAt: { value: 0 },
      uSeed: { value: 0 }
    }),
    vertexShader: HAZE_VERTEX,
    fragmentShader: HAZE_FRAGMENT
  });

  /** @param {object} state { size, strength, pulse, pulseAt, seed } */
  material.userData.sync = (state) => {
    const c = settings.sanctuary;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = Math.max(0.1, state.size);
    u.uStrength.value = state.strength * c.hazeStrength * g.distortion;
    u.uScale.value = c.hazeScale * g.noiseFrequency;
    u.uSpeed.value = c.hazeSpeed * g.noiseSpeed;
    u.uPulse.value = state.pulse * c.hazePulse * g.distortion;
    u.uPulseAt.value = state.pulseAt;
    u.uSeed.value = state.seed;
  };

  return material;
}
