import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Winter's Borrowed Breath — the bespoke shaders.
 *
 *  - **the plume** — the exhale. A tube laid down the cast line in the vertex
 *    shader: it leaves the hand thin, swells toward the head, and coils as it
 *    goes. The fragment is fbm vapour streaked along the flow, a bright
 *    swelling head, and a window [tail, head] so the breath can run out and
 *    then be drawn in behind itself.
 *  - **the breath ribbon** — the cyclone. Two interleaved helical bands wound
 *    round the zone in the vertex shader; streaks scroll along them at the
 *    cyclone's *integrated* angle, so when it decelerates the streaks visibly
 *    slow. Its opacity is the velocity that is left.
 *  - **the ice** — the carapace's lamellae. Opaque and *lit*: wrapped sun
 *    diffuse, a sky/ground ambient, a tight Blinn glint, a fresnel rim, a
 *    cloudy frost interior, and, per instance, the flash of a plate locking
 *    into its seat, the cracks that spread before the return, and the noise
 *    dissolve on the exit. World layer, casts shadows.
 *  - **the rime** — the floor. Frost plates (voronoi cells with bright
 *    edges), feathered hoarfrost and the breath's spiral streaks over a dark
 *    blue stain; it runs out from the centre at the gust, telegraphs the
 *    zone's edge while the breath travels, and dissolves on the exit.
 *  - **the lens** — `LAYER.DISTORTION` disc: a cold swirl proportional to the
 *    cyclone's speed, a pressure ring when the armour bursts.
 *
 * Every material reads `settings.wintersBorrowedBreath` in `userData.sync(s)`.
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

/** Shared four-stop ramp uniforms, filled from the palette keys. */
function rampUniforms() {
  return {
    uCore: { value: new Color('#f4fbff') },
    uTint: { value: new Color('#bfe8ff') },
    uBody: { value: new Color('#3f9fe6') },
    uDeep: { value: new Color('#0a2457') },
  };
}
function syncRamp(u, c) {
  u.uCore.value.copy(getColor(c.coreColor));
  u.uTint.value.copy(getColor(c.tintColor));
  u.uBody.value.copy(getColor(c.bodyColor));
  u.uDeep.value.copy(getColor(c.deepColor));
}

const RAMP_GLSL = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  // t = 1 is the white-hot core, t = 0 the deep. Only the core goes past 1.
  vec3 frostRamp(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 a = mix(uDeep, uBody, smoothstep(0.0, 0.35, t));
    vec3 b = mix(a, uTint, smoothstep(0.32, 0.72, t));
    return mix(b, uCore * 1.6, smoothstep(0.7, 1.0, t));
  }
`;

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
/* 1 · The plume                                                        */
/* -------------------------------------------------------------------- */

const PLUME_VERTEX = /* glsl */ `
  uniform float uLength;      // metres along the cast line
  uniform float uMouthY;      // leaves the hand at
  uniform float uEndY;        // arrives at
  uniform float uMouthR;
  uniform float uHeadR;
  uniform float uTwist;
  uniform float uHead;        // 0..1 how far the breath has run
  uniform float uClock;
  uniform float uNoise;
  varying float vS;
  varying float vTheta;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  void main() {
    float s = position.x;
    float th = position.y;
    vS = s;
    vTheta = th;
    // Swells toward the head, bulges at the running front.
    float r = mix(uMouthR, uHeadR, pow(s, 0.6));
    float front = exp(-pow((s - uHead) / 0.07, 2.0));
    r *= 1.0 + 0.3 * front;
    r *= 1.0 + 0.28 * snoise(vec3(s * 9.0 - uClock * 1.7, cos(th) * 1.3, sin(th) * 1.3)) * uNoise;
    // A coil: the centre line corkscrews round the straight path.
    float coil = s * uTwist * 6.2831853 - uClock * 5.0;
    vec2 off = vec2(cos(coil), sin(coil)) * r * 0.45 * smoothstep(0.0, 0.2, s);
    // Arc from the hand down onto the zone.
    float y = mix(uMouthY, uEndY, smoothstep(0.0, 1.0, s)) + sin(3.14159 * s) * 0.35;
    vec3 local = vec3(cos(th) * r + off.x, y + sin(th) * r + off.y, s * uLength);
    vec4 world = modelMatrix * vec4(local, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * vec3(cos(th), sin(th), 0.0));
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PLUME_FRAGMENT = /* glsl */ `
  uniform float uHead;
  uniform float uTail;
  uniform float uClock;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uNoise;
  uniform float uScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying float vS;
  varying float vTheta;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    float window = smoothstep(uTail, uTail + 0.08, vS) * (1.0 - smoothstep(uHead - 0.02, uHead + 0.01, vS));
    if (window < 0.002) discard;
    vec3 q = vec3(vS * 7.0 * uScale - uClock * 2.2, cos(vTheta) * 1.4, sin(vTheta) * 1.4 + vS * 3.0);
    float vapour = fbm4(q) * 0.5 + 0.5;
    float streak = pow(0.5 + 0.5 * sin(vTheta * 3.0 + vS * 40.0 - uClock * 9.0), 6.0);
    float rim = fresnelTerm(vViewDir, vNormalW, 1.6, 1.0);
    float front = exp(-pow((vS - uHead) / 0.05, 2.0));
    float body = mix(0.35, 1.0, vapour) * (0.35 + 0.65 * rim) + streak * 0.35 * uShaderIntensity;
    float heat = clamp(body * 0.55 + front * 0.9 + rim * 0.25, 0.0, 1.0);
    vec3 col = frostRamp(heat);
    float erode = smoothstep(0.25, 0.6, vapour + (1.0 - uNoise) * 0.4);
    float a = window * (body * 0.6 + front) * erode * uOpacity;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The exhale. Additive; geometry from `createPlumeGeometry`. */
export function createPlumeMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uLength: { value: 8 },
      uMouthY: { value: 1.45 },
      uEndY: { value: 0.6 },
      uMouthR: { value: 0.14 },
      uHeadR: { value: 0.6 },
      uTwist: { value: 3 },
      uHead: { value: 0 },
      uTail: { value: 0 },
      uClock: { value: 0 },
      uNoise: { value: 1 },
      uScale: { value: 1 },
      uGlow: { value: 1.5 },
      uOpacity: { value: 0.8 },
      ...rampUniforms(),
    }),
    vertexShader: PLUME_VERTEX,
    fragmentShader: PLUME_FRAGMENT,
  });
  /** @param {object} s { length, endY, head, tail, clock, fade, swell } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uLength.value = s.length;
    u.uMouthY.value = c.plumeHeight;
    u.uEndY.value = s.endY;
    u.uMouthR.value = c.plumeMouth * (1 + s.swell);
    u.uHeadR.value = c.plumeHead;
    u.uTwist.value = c.plumeTwist;
    u.uHead.value = s.head;
    u.uTail.value = s.tail;
    u.uClock.value = s.clock * g.noiseSpeed;
    u.uNoise.value = g.noiseStrength;
    u.uScale.value = g.noiseFrequency;
    u.uGlow.value = c.plumeGlow * g.glow;
    u.uOpacity.value = c.plumeOpacity * g.opacity * s.fade;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 2 · The breath ribbon                                                */
/* -------------------------------------------------------------------- */

const RIBBON_VERTEX = /* glsl */ `
  uniform float uR0;          // radius at the floor
  uniform float uR1;          // radius at the top
  uniform float uTop;         // top height
  uniform float uTurns;
  uniform float uWidth;
  uniform float uPhase;       // the cyclone's integrated angle
  uniform float uClock;
  uniform float uNoise;
  varying vec2 vST;
  varying float vRibbon;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  void main() {
    float s = position.x;
    float t = position.y;
    float rib = position.z;
    vST = vec2(s, t);
    vRibbon = rib;
    float ang = s * uTurns * 6.2831853 + uPhase + rib * 3.14159265;
    float band = (t - 0.5) * uWidth * (1.0 - 0.4 * s);
    float r = mix(uR0, uR1, s) + band * 0.45;
    r += snoise(vec3(s * 5.0, rib * 4.0, uClock * 0.5)) * 0.14 * uNoise * r;
    float y = mix(0.1, uTop, s) + band;
    vec3 local = vec3(cos(ang) * r, y, sin(ang) * r);
    vec4 world = modelMatrix * vec4(local, 1.0);
    // The band's normal is roughly radial, tipped by its lean.
    vNormalW = normalize(mat3(modelMatrix) * vec3(cos(ang), -0.45, sin(ang)));
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RIBBON_FRAGMENT = /* glsl */ `
  uniform float uPhase;
  uniform float uClock;
  uniform float uSpeed;       // 0..1 velocity left in the cyclone
  uniform float uStreaks;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uNoise;
  uniform float uScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vST;
  varying float vRibbon;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    float s = vST.x;
    float t = vST.y;
    float edge = sin(3.14159265 * t);
    float ends = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.82, 1.0, s));
    // Streaks travel along the band with the integrated spin, stretched by speed.
    float flow = s * uStreaks * 3.0 - uPhase * 0.6 + vRibbon * 0.5;
    float streak = pow(0.5 + 0.5 * cos(flow * 6.2831853 + t * 2.0), mix(14.0, 3.0, uSpeed));
    vec3 q = vec3(s * 9.0 * uScale - uPhase * 0.35, t * 2.2, vRibbon * 3.0 + uClock * 0.2);
    float vapour = fbm4(q) * 0.5 + 0.5;
    float erode = smoothstep(0.2 + 0.35 * (1.0 - uSpeed), 0.65, vapour + (1.0 - uNoise) * 0.4);
    float rim = fresnelTerm(vViewDir, vNormalW, 1.4, 1.0);
    float body = edge * ends * erode;
    float heat = clamp(0.25 + streak * 0.6 * uShaderIntensity + rim * 0.25 + vapour * 0.2, 0.0, 1.0);
    vec3 col = frostRamp(heat * (0.55 + 0.45 * uSpeed));
    float a = body * (0.35 + 0.65 * streak + 0.3 * rim) * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The cyclone. Additive; geometry from `createRibbonGeometry`. */
export function createRibbonMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uR0: { value: 3.8 },
      uR1: { value: 1.2 },
      uTop: { value: 3 },
      uTurns: { value: 2.25 },
      uWidth: { value: 0.65 },
      uPhase: { value: 0 },
      uClock: { value: 0 },
      uSpeed: { value: 1 },
      uStreaks: { value: 7 },
      uNoise: { value: 1 },
      uScale: { value: 1 },
      uGlow: { value: 1.7 },
      uOpacity: { value: 0.85 },
      ...rampUniforms(),
    }),
    vertexShader: RIBBON_VERTEX,
    fragmentShader: RIBBON_FRAGMENT,
  });
  /** @param {object} s { r0, r1, top, phase, clock, speed, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uR0.value = s.r0;
    u.uR1.value = s.r1;
    u.uTop.value = s.top;
    u.uTurns.value = c.vortexTurns;
    u.uWidth.value = c.vortexWidth;
    u.uPhase.value = s.phase;
    u.uClock.value = s.clock * g.noiseSpeed;
    u.uSpeed.value = s.speed;
    u.uStreaks.value = c.vortexStreaks;
    u.uNoise.value = c.vortexNoise * g.noiseStrength;
    u.uScale.value = g.noiseFrequency;
    u.uGlow.value = c.vortexGlow * g.glow;
    u.uOpacity.value = c.vortexOpacity * g.opacity * s.fade;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 3 · The ice                                                          */
/* -------------------------------------------------------------------- */

const ICE_VERTEX = /* glsl */ `
  attribute vec3 aState;      // x seed, y seat flash 0..1, z crack 0..1
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying vec2 vUv;
  varying vec3 vState;
  void main() {
    vUv = uv;
    vLocal = position;
    vState = aState;
    mat4 m = modelMatrix;
    vec3 n = normal;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
      // Correct normals under the per-plate non-uniform scale: R·S·(n / S²).
      mat3 im = mat3(instanceMatrix);
      vec3 s2 = vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
      n = im * (normal / max(s2, vec3(1e-6)));
    #endif
    vec4 world = m * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * n);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ICE_FRAGMENT = /* glsl */ `
  uniform vec3  uIce;
  uniform vec3  uIceDeep;
  uniform vec3  uRim;
  uniform float uGlow;
  uniform float uFresnel;
  uniform float uSpecular;
  uniform float uCrackGlow;
  uniform float uDissolve;
  uniform float uScale;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying vec2 vUv;
  varying vec3 vState;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}

  // Voronoi edge distance (F2 − F1): the crack network.
  float crackNet(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float f1 = 8.0, f2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
      }
    }
    return sqrt(f2) - sqrt(f1);
  }

  void main() {
    float seed = vState.x;
    // Exit: a noise dissolve with a white-hot edge.
    float dn = snoise01(vLocal * 3.1 + seed * 17.0);
    vec2 dm = dissolveMask(dn, uDissolve, 0.1);
    if (dm.x < 0.5) discard;

    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(vViewDir);
    vec3 L = normalize(uLightDir);

    // Lit ice: wrapped sun diffuse, sky/ground ambient, a tight glint.
    float wrap = clamp((dot(N, L) + 0.35) / 1.35, 0.0, 1.0);
    float sky = 0.5 + 0.5 * N.y;
    vec3 H = normalize(L + V);
    float glint = pow(max(dot(N, H), 0.0), 90.0) * uSpecular;
    float fres = fresnelTerm(V, N, uFresnel, 1.0);

    // Cloudy frost inside: a refracted look-up so the interior slides.
    vec3 r = refract(-V, N, 0.76);
    float cloud = fbm3(vLocal * vec3(4.0, 2.4, 4.0) * uScale + r * 0.6 + seed * 9.0) * 0.5 + 0.5;
    float veins = pow(1.0 - abs(snoise(vLocal * 6.0 * uScale + seed * 3.0)), 8.0);

    // Facets facing away from the eye fall into the deep: the cut reads.
    float facing = clamp(dot(N, V), 0.0, 1.0);
    vec3 body = mix(uIceDeep, uIce, wrap * (0.45 + 0.55 * facing));
    vec3 col = body * (0.22 + 0.55 * wrap) + uIceDeep * 0.25 * sky;
    col += mix(uIceDeep, uIce, cloud) * cloud * 0.3 * uGlow + uRim * veins * 0.18 * uGlow;
    col += mix(uIce, uRim, 0.5) * fres * 0.45;
    col += uRim * glint;

    // The seat flash: a plate locking on rings white, then cools.
    col += uCore * vState.y * 1.6 * uShaderIntensity;

    // Cracks: a voronoi network revealed from the plate's foot as z rises.
    float cn = crackNet(vUv * vec2(3.0, 5.0) * uScale + seed * 11.0);
    float crack = (1.0 - smoothstep(0.0, 0.06, cn)) * step(vUv.y, vState.z * 1.2);
    col += frostRamp(0.85) * crack * uCrackGlow * vState.z;

    col += uCore * dm.y * 4.0;
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

/** The carapace's lamellae: opaque, lit, instanced, world layer. */
export function createIceMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uIce: { value: new Color('#78c3ee') },
      uIceDeep: { value: new Color('#0e3166') },
      uRim: { value: new Color('#e8f9ff') },
      uGlow: { value: 0.7 },
      uFresnel: { value: 2.2 },
      uSpecular: { value: 1.4 },
      uCrackGlow: { value: 2.6 },
      uDissolve: { value: 0 },
      uScale: { value: 1 },
      ...rampUniforms(),
    }),
    vertexShader: ICE_VERTEX,
    fragmentShader: ICE_FRAGMENT,
  });
  /** @param {object} s { dissolve } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uIce.value.copy(getColor(c.plateColor));
    u.uIceDeep.value.copy(getColor(c.plateDeep));
    u.uRim.value.copy(getColor(c.plateRim));
    u.uGlow.value = c.plateGlow * g.glow;
    u.uFresnel.value = Math.max(0.2, c.plateFresnel / Math.max(0.05, g.fresnel));
    u.uSpecular.value = c.plateSpecular;
    u.uCrackGlow.value = c.crackGlow * g.glow;
    u.uDissolve.value = s.dissolve;
    u.uScale.value = g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 4 · The rime (floor)                                                 */
/* -------------------------------------------------------------------- */

const FIELD_FRAGMENT = /* glsl */ `
  uniform float uGrow;        // 0..1 the rime's front, of the field radius
  uniform float uZone;        // the zone edge, of the field radius
  uniform float uTelegraph;   // 0..1 while the breath is travelling
  uniform float uSpin;        // the cyclone's integrated angle
  uniform float uSpeed;       // 0..1 velocity left
  uniform float uArmor;       // 0..1 armour minted
  uniform float uReturn;      // 0..1 through the burst, −1 before
  uniform float uDissolve;
  uniform float uFade;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uCrystals;
  uniform float uStreaks;
  uniform float uScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}

  vec2 cells(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float f1 = 8.0, f2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
      }
    }
    return vec2(sqrt(f1), sqrt(f2) - sqrt(f1));
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);

    // Telegraph: the zone's edge, pulsing while the breath is on its way.
    float ring = exp(-abs(r - uZone) * 60.0) * uTelegraph * (0.6 + 0.4 * sin(uSpin * 3.0 + a * 0.0));

    // The rime's jagged front.
    float jag = fbm3(vec3(p * 4.0 * uScale, 1.7)) * 0.12;
    float grown = 1.0 - smoothstep(uGrow - 0.06, uGrow, r + jag);
    float front = exp(-abs(r + jag - uGrow) * 28.0) * step(0.001, uGrow) * (1.0 - step(0.999, uGrow));

    // Frost plates: cells with bright edges, finer toward the centre.
    vec2 c = cells(p * (6.0 + 4.0 * (1.0 - r)) * uCrystals * uScale);
    float plateEdge = 1.0 - smoothstep(0.0, 0.07, c.y);
    // Feathered hoarfrost.
    float feather = pow(ridged(vec3(p * 9.0 * uScale, c.x * 2.0), 4), 3.0);
    // The breath's spiral streaks, turning with the cyclone.
    float sp = a * 3.0 + r * 9.0 - uSpin;
    float streak = pow(0.5 + 0.5 * cos(sp), mix(16.0, 4.0, uSpeed)) * smoothstep(0.15, 0.5, r) * (1.0 - smoothstep(uZone, 1.0, r));
    // Armour shadow: under a fuller carapace the floor runs bluer.
    float under = (1.0 - smoothstep(uZone * 0.6, uZone, r)) * uArmor;
    // The burst's ring.
    float burst = uReturn >= 0.0 ? exp(-abs(r - uReturn * 0.95) * 22.0) * (1.0 - uReturn) : 0.0;

    vec2 dm = dissolveMask(snoise01(vec3(p * 3.0 * uScale, 4.1)), uDissolve, 0.08);
    float edgeFade = 1.0 - smoothstep(0.8, 1.0, r);
    float detail = plateEdge * 0.55 + feather * 0.5 + streak * 0.5 * uStreaks;
    float heat = clamp(detail * 0.7 + front + burst + under * 0.2, 0.0, 1.0);
    vec3 col = frostRamp(0.12 + heat * 0.88);
    float alpha = (grown * edgeFade * (0.55 + 0.45 * detail) + front * 0.8 + burst) * dm.x;
    alpha = max(alpha, ring);
    col = mix(col, frostRamp(0.9), ring);
    col += uCore * dm.y * 3.0 * grown;
    alpha *= uFade * uOpacity;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * (0.6 + 0.4 * uShaderIntensity), clamp(alpha, 0.0, 1.0));
  }
`;

/** The rime on the floor. Normal blending, so the deep tone darkens the stone. */
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
      uGrow: { value: 0 },
      uZone: { value: 0.8 },
      uTelegraph: { value: 0 },
      uSpin: { value: 0 },
      uSpeed: { value: 0 },
      uArmor: { value: 0 },
      uReturn: { value: -1 },
      uDissolve: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1.3 },
      uOpacity: { value: 0.9 },
      uCrystals: { value: 1 },
      uStreaks: { value: 1 },
      uScale: { value: 1 },
      ...rampUniforms(),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: FIELD_FRAGMENT,
  });
  /** @param {object} s { grow, zone, telegraph, spin, speed, armor, ret, dissolve, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uGrow.value = s.grow;
    u.uZone.value = s.zone;
    u.uTelegraph.value = s.telegraph;
    u.uSpin.value = s.spin;
    u.uSpeed.value = s.speed;
    u.uArmor.value = s.armor;
    u.uReturn.value = s.ret;
    u.uDissolve.value = s.dissolve;
    u.uFade.value = s.fade;
    u.uGlow.value = c.fieldGlow * g.glow;
    u.uOpacity.value = c.fieldOpacity * g.opacity;
    u.uCrystals.value = c.fieldCrystals;
    u.uStreaks.value = c.fieldStreaks;
    u.uScale.value = g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 5 · The lens                                                         */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uSwirl;
  uniform float uShock;
  uniform float uWave;
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
    float body = smoothstep(0.15, 0.55, r) * (1.0 - smoothstep(0.7, 1.0, r));
    float ring = exp(-pow((r - uWave) / 0.09, 2.0));
    vec3 np = vec3(q * 2.8 * uScale, uClock * 0.5);
    vec2 n = vec2(snoise(np), snoise(np + vec3(5.2, 1.3, 7.7))) * 0.35;
    vec2 dir = (tangent * 0.8 - radial * 0.2 + n) * body * uSwirl + (radial + n) * ring * uShock;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(body * uSwirl + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** `LAYER.DISTORTION` disc (opaque proxy, like the other expansion lenses). */
export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSwirl: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s { swirl, shock, wave, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSwirl.value = s.swirl * c.lensSwirl * g.distortion;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
