import { Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Sanguine Tide — the four bespoke shaders the blood wave is drawn with.
 *
 *  - **the wave** — a flat grid (`PlaneGeometry`, u across, v along the
 *    profile) bent in the vertex stage into a breaking wave: a cubic back slope
 *    rising to the crest, then a face that is steep while it rolls and curls
 *    over into a hanging lip as it nears the end of the line, and finally
 *    slams that lip onto the floor ahead. The normal is taken by central
 *    differences on the same function, so the shading follows whatever the
 *    sliders do to the silhouette. The fragment is glossy blood: dark in the
 *    trough, a wrap-lit body, light glowing through the thin lip, a sharp
 *    sun highlight plus the sky reflected through a fresnel, and a band of
 *    pink froth (voronoi bubbles) riding the crest. It dissolves into the
 *    smear once it has broken.
 *  - **the lens** — the same profile pushed out along its normal, written to
 *    `LAYER.DISTORTION`: the world seen past the wave's skin wobbles, which is
 *    what sells "liquid" at a distance where the highlights are a pixel wide.
 *  - **the smear** — a ground strip down the line, painted only behind the
 *    crest. Ragged edges, drag streaks along the line, beads thrown past the
 *    edges, a pool at the caster's feet and a splash pool where the wave
 *    broke. Fresh it is a mirror; every fragment dries on its own clock (the
 *    time since the wave passed *it*), going matte and brown, then crazing
 *    into voronoi cracks. At the very end the blood drains into the floor,
 *    thin edges first, leaving a dark tide line at the receding edge.
 *  - **the crown** — a ring sheet flaring outward, its rim torn into fingers
 *    each with a bead at its tip, shaded with the same wet blood as the wave.
 *
 * Every material reads `settings.sanguine` in `userData.sync(state)`; `state`
 * carries only what the ability knows that settings do not (the integrated
 * phases, the envelopes, the extents of the painted floor).
 */

/* -------------------------------------------------------------------- */
/* Shared GLSL                                                          */
/* -------------------------------------------------------------------- */

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/**
 * Wet blood under the sun: wrap diffuse, a tight Blinn highlight, a broad
 * sheen, and the sky through a Schlick fresnel. `base` is the albedo, already
 * deepened where the liquid is thick.
 */
const BLOOD_SHADE_GLSL = /* glsl */ `
  vec3 shadeBlood(vec3 base, vec3 N, vec3 V, vec3 L, float gloss, float spec, float envAmt,
                  float fresAmt, vec3 specColor, sampler2D envMap) {
    vec3 H = normalize(L + V);
    float ndl = dot(N, L);
    float wrap = 0.28 + 0.72 * clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float hi = pow(clamp(dot(N, H), 0.0, 1.0), max(gloss, 1.0)) * spec;
    float sheen = pow(clamp(dot(N, H), 0.0, 1.0), max(gloss * 0.08, 1.0)) * spec * 0.12;
    vec3 sheenCol = mix(specColor, base * 3.0, 0.7);   // a broad sheen takes the liquid's colour
    float fres = 0.035 + 0.965 * pow(1.0 - ndv, 5.0);
    vec3 env = texture2D(envMap, equirectUv(reflect(-V, N))).rgb;
    return base * wrap * (1.0 - fres * 0.4)
         + specColor * hi + sheenCol * sheen
         + env * mix(vec3(1.0), specColor * 0.6 + base * 2.0, 0.45) * envAmt * fres * fresAmt;
  }
`;

/* -------------------------------------------------------------------- */
/* The wave profile — shared by the wave and its lens                   */
/* -------------------------------------------------------------------- */

/**
 * `wavePoint(u, v)` — u across (-1..1), v along the profile (0 the tail on
 * the floor behind, 0.5 the crest, 1 the lip). Local frame: +Z the direction
 * of travel, +Y up, the crest's foot at the origin.
 * `SanguineTideAbility#_crestLocal` is the CPU twin (droplets are thrown off
 * it, bodies ride it) — keep them together.
 */
const WAVE_GLSL = /* glsl */ `
  uniform float uHalfWidth;
  uniform float uHeight;
  uniform float uBack;
  uniform float uFace;
  uniform float uShoulder;
  uniform float uTaper;
  uniform float uSweep;
  uniform float uJag;
  uniform float uJagScale;
  uniform float uCurl;      // 0 steep face .. 1 the lip curled over
  uniform float uSlam;      // 0 .. 1 the lip thrown down onto the floor
  uniform float uSlamReach;
  uniform float uSeed;

  vec2 bez2(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
    float s = 1.0 - t;
    return s * s * s * a + 3.0 * s * s * t * b + 3.0 * s * t * t * c + t * t * t * d;
  }

  float waveEnvelope(float u) {
    return pow(max(1.0 - pow(abs(u), max(uShoulder, 0.5)), 0.0), max(uTaper, 0.05));
  }

  vec3 wavePoint(float u, float v) {
    float env = waveEnvelope(u);
    float jag = 1.0 + uJag * snoise(vec3(u * uJagScale * uHalfWidth * 0.5, uSeed, 0.0));
    float h = uHeight * env * jag;
    float back = uBack * mix(0.45, 1.0, env);
    float face = uFace * mix(0.3, 1.0, env);
    // The middle curls first; the shoulders follow.
    float curl = clamp(uCurl * (1.12 - 0.35 * u * u), 0.0, 1.0);
    vec2 p;
    if (v < 0.5) {
      float t = v * 2.0;
      p = bez2(vec2(-back, 0.0), vec2(-back * 0.5, 0.0), vec2(-h * 0.45 - back * 0.1, h * 0.92), vec2(0.0, h), t);
    } else {
      float t = (v - 0.5) * 2.0;
      vec2 f1 = mix(vec2(face * 0.35, h), vec2(h * 0.55, h * 1.1), curl);
      vec2 f2 = mix(vec2(face * 0.85, h * 0.45), vec2(h * 1.0, h * 0.78), curl);
      vec2 f3 = mix(vec2(face, 0.0), vec2(h * 0.62, h * 0.3), curl);
      float reach = uSlamReach * mix(0.4, 1.0, env);
      f1 = mix(f1, vec2(h * 0.55 + reach * 0.3, h * 0.72), uSlam);
      f2 = mix(f2, vec2(h * 0.85 + reach * 0.8, h * 0.22), uSlam);
      f3 = mix(f3, vec2(h * 0.5 + reach, 0.0), uSlam);
      p = bez2(vec2(0.0, h), f1, f2, f3, t);
    }
    // The ends trail behind the middle — a crescent, as a real breaker is.
    p.x -= uSweep * uHalfWidth * u * u;
    return vec3(u * uHalfWidth, p.y, p.x);
  }

  /** Outward normal by central differences on the profile. */
  vec3 waveNormal(float u, float v) {
    float e = 0.004;
    vec3 du = wavePoint(min(u + e, 1.0), v) - wavePoint(max(u - e, -1.0), v);
    vec3 dv = wavePoint(u, min(v + e, 1.0)) - wavePoint(u, max(v - e, 0.0));
    vec3 n = cross(dv, du);
    float l = length(n);
    return l > 1e-6 ? n / l : vec3(0.0, 1.0, 0.0);
  }
`;

/* -------------------------------------------------------------------- */
/* The wave                                                             */
/* -------------------------------------------------------------------- */

const WAVE_VERTEX = /* glsl */ `
  uniform float uNoise;
  uniform float uNoiseScale;
  uniform float uFlow;

  varying vec2  vUV;        // x: u across, y: v along the profile
  varying float vH;         // height above the floor, × wave height
  varying float vEnv;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${WAVE_GLSL}

  void main() {
    float u = position.x * 2.0;
    float v = position.y + 0.5;
    vec3 p = wavePoint(u, v);
    vec3 n = waveNormal(u, v);
    float env = waveEnvelope(u);
    // The surface heaves along its normal, streaming up the back and over.
    float heave = fbm3(vec3(u * uHalfWidth * uNoiseScale, v * 4.0 * uNoiseScale - uFlow, uSeed));
    p += n * heave * uNoise * smoothstep(0.0, 0.18, v) * env;

    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    vUV = vec2(u, v);
    vH = p.y / max(uHeight, 0.05);
    vEnv = env;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const WAVE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uFlow;
  uniform float uHalfWidth;
  uniform float uCurl;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uEnv;
  uniform float uFresnel;
  uniform float uRipple;
  uniform float uRippleScale;
  uniform float uSSS;
  uniform float uTroughDark;
  uniform float uFroth;
  uniform float uFrothScale;
  uniform float uFrothWidth;
  uniform float uEdgeSoft;
  uniform float uSoftFade;
  uniform float uOpacity;
  uniform float uDissolve;   // 0 whole .. 1 drained into the smear
  uniform vec3  uColorBlood;
  uniform vec3  uColorDeep;
  uniform vec3  uColorLip;
  uniform vec3  uColorFroth;
  uniform vec3  uColorSpec;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vUV;
  varying float vH;
  varying float vEnv;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}
  ${ENV_GLSL}
  ${BLOOD_SHADE_GLSL}

  void main() {
    float u = vUV.x;
    float v = vUV.y;
    float au = abs(u);

    // The two ends feather into the floor; so does the very tail.
    float edge = 1.0 - smoothstep(1.0 - max(uEdgeSoft, 0.01), 1.0, au);
    float tail = smoothstep(0.0, 0.12, v);

    // Breaking up into the smear: the thin parts go first, the crest last.
    float dn = fbm3(vec3(vWorld.xz * 1.7, uSeed + uTime * 0.6)) * 0.5 + 0.5;
    dn = mix(dn, vH, 0.35);
    float thr = uDissolve * 1.25 - 0.12;
    float keep = uDissolve <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.1, dn);

    float mask = edge * tail * keep * uOpacity;
    if (mask < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (mask < 0.004) discard;

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (dot(N, V) < 0.0) N = -N;  // a sheet: shade whichever side is seen

    // Fine ripple, streaming with the surface.
    vec3 rp = vec3(vWorld.xz * uRippleScale, vWorld.y * uRippleScale - uFlow * 1.3 + uSeed);
    vec3 bump = vec3(snoise(rp), 0.0, snoise(rp + vec3(17.1, 3.3, 9.7)));
    N = normalize(N + bump * uRipple * uShaderIntensity * 0.35);

    vec3 L = normalize(uLightDir);

    /* the body: deep in the trough, the crest the colour of fresh blood */
    float trough = 1.0 - smoothstep(0.05, 0.85, vH);
    vec3 base = mix(uColorBlood, uColorDeep, trough * uTroughDark);
    // Slow dark veins drifting in the body, so it is never a flat fill.
    float vein = fbm3(vec3(u * uHalfWidth * 0.8, v * 3.0 - uFlow * 0.6, uSeed * 2.0));
    base *= 0.82 + 0.3 * vein;

    vec3 color = shadeBlood(base, N, V, L, uGloss, uSpecular, uEnv, uFresnel, uColorSpec, uEnvMap);

    /* light through the thin lip — strongest seen against the sun */
    float thin = smoothstep(0.47, 0.64, v) * smoothstep(0.3, 0.9, vH) * (0.55 + 0.45 * uCurl);
    float against = pow(clamp(dot(V, -L) * 0.5 + 0.5, 0.0, 1.0), 2.0);
    color += uColorLip * thin * (0.3 + 0.9 * against) * uSSS * uGlobalGlow;

    /* froth: a band of bubbles riding the crest, spilling down the lip */
    float w = max(uFrothWidth, 0.005);
    float crest = exp(-pow((v - 0.53) / w, 2.0));
    float spill = smoothstep(0.55, 0.8, v) * (1.0 - smoothstep(0.85, 1.0, v)) * uCurl * 0.65;
    vec2 cellP = vec2(u * uHalfWidth, v * 2.6) * uFrothScale + vec2(0.0, -uFlow * 1.6);
    vec2 cell = voronoi2(cellP);
    float bubbles = smoothstep(0.15, 0.55, cell.x) * (0.6 + 0.4 * cell.y);
    float patchy = smoothstep(-0.35, 0.55, snoise(vec3(u * uHalfWidth * 1.4, v * 5.0 - uFlow, uSeed + 4.0)));
    float froth = clamp((crest + spill) * patchy * vEnv * uFroth, 0.0, 1.0);
    vec3 frothCol = uColorFroth * (0.55 + 0.6 * bubbles) * (0.6 + 0.5 * clamp(dot(N, L), 0.0, 1.0));
    color = mix(color, frothCol + uColorSpec * pow(clamp(dot(N, normalize(L + V)), 0.0, 1.0), 24.0) * 0.4, froth * (0.45 + 0.55 * bubbles));

    // A thin bright line where it is coming apart.
    float fray = uDissolve <= 0.0 ? 0.0 : (smoothstep(thr - 0.02, thr + 0.1, dn) - smoothstep(thr + 0.1, thr + 0.22, dn));
    color += uColorLip * fray * 0.8;

    gl_FragColor = vec4(color, clamp(mask, 0.0, 1.0));
  }
`;

/** The breaking wave. Mostly opaque, so it writes depth; its ends feather. */
export function createSanguineWaveMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      ...waveShapeUniforms(),
      uNoise: { value: 0.08 },
      uNoiseScale: { value: 1.2 },
      uFlow: { value: 0 },
      uGloss: { value: 110 },
      uSpecular: { value: 1.7 },
      uEnv: { value: 1 },
      uFresnel: { value: 1.4 },
      uRipple: { value: 0.35 },
      uRippleScale: { value: 5 },
      uSSS: { value: 1.3 },
      uTroughDark: { value: 0.8 },
      uFroth: { value: 0.9 },
      uFrothScale: { value: 7 },
      uFrothWidth: { value: 0.09 },
      uEdgeSoft: { value: 0.22 },
      uSoftFade: { value: 0.3 },
      uOpacity: { value: 1 },
      uDissolve: { value: 0 },
      uColorBlood: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorLip: { value: new Color() },
      uColorFroth: { value: new Color() },
      uColorSpec: { value: new Color() }
    }),
    vertexShader: WAVE_VERTEX,
    fragmentShader: WAVE_FRAGMENT
  });

  /**
   * @param {object} state { height, curl, slam, flow, dissolve, fade, seed }
   */
  material.userData.sync = (state) => {
    const c = settings.sanguine;
    const g = settings.global;
    const u = material.uniforms;
    syncWaveShape(u, state);
    u.uNoise.value = c.surfaceNoise * g.noiseStrength;
    u.uNoiseScale.value = c.surfaceScale * g.noiseFrequency;
    u.uFlow.value = state.flow;
    u.uGloss.value = c.gloss;
    u.uSpecular.value = c.specular * g.shaderIntensity;
    u.uEnv.value = c.envReflect;
    u.uFresnel.value = c.fresnel * g.fresnel;
    u.uRipple.value = c.ripple * g.noiseStrength;
    u.uRippleScale.value = c.rippleScale * g.noiseFrequency;
    u.uSSS.value = c.sss * g.glow;
    u.uTroughDark.value = c.troughDark;
    u.uFroth.value = c.froth;
    u.uFrothScale.value = c.frothScale;
    u.uFrothWidth.value = c.frothWidth;
    u.uEdgeSoft.value = c.edgeSoft;
    u.uSoftFade.value = c.softFade;
    u.uOpacity.value = c.opacity * g.opacity * state.fade;
    u.uDissolve.value = state.dissolve;
    u.uColorBlood.value.copy(getColor(c.colorBlood));
    u.uColorDeep.value.copy(getColor(c.colorDeep));
    u.uColorLip.value.copy(getColor(c.colorLip));
    u.uColorFroth.value.copy(getColor(c.colorFroth));
    u.uColorSpec.value.copy(getColor(c.colorSpec));
  };

  return material;
}

function waveShapeUniforms() {
  return {
    uHalfWidth: { value: 2.2 },
    uHeight: { value: 2 },
    uBack: { value: 2.8 },
    uFace: { value: 1.2 },
    uShoulder: { value: 2.4 },
    uTaper: { value: 0.8 },
    uSweep: { value: 0.22 },
    uJag: { value: 0.14 },
    uJagScale: { value: 1.6 },
    uCurl: { value: 0 },
    uSlam: { value: 0 },
    uSlamReach: { value: 1.3 },
    uSeed: { value: 0 }
  };
}

/** The profile's uniforms, shared by the wave and its lens. */
function syncWaveShape(u, state) {
  const c = settings.sanguine;
  u.uHalfWidth.value = Math.max(0.1, c.waveHalfWidth);
  u.uHeight.value = Math.max(0.01, state.height);
  u.uBack.value = Math.max(0.1, c.waveBack);
  u.uFace.value = Math.max(0.05, c.waveFace);
  u.uShoulder.value = c.waveShoulder;
  u.uTaper.value = c.waveTaper;
  u.uSweep.value = c.waveSweep;
  u.uJag.value = c.crestJag * settings.global.randomness;
  u.uJagScale.value = c.crestJagScale;
  u.uCurl.value = state.curl;
  u.uSlam.value = state.slam;
  u.uSlamReach.value = c.slamReach;
  u.uSeed.value = state.seed;
}

/* -------------------------------------------------------------------- */
/* The lens — LAYER.DISTORTION                                          */
/* -------------------------------------------------------------------- */

const WARP_VERTEX = /* glsl */ `
  uniform float uPad;

  varying vec2 vUV;
  varying vec2 vScreenN;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${WAVE_GLSL}

  void main() {
    float u = position.x * 2.0;
    float v = position.y + 0.5;
    vec3 n = waveNormal(u, v);
    vec3 p = wavePoint(u, v) + n * uPad;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vUV = vec2(u, v);
    vScreenN = (viewMatrix * vec4(normalize(mat3(modelMatrix) * n), 0.0)).xy;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uShaderIntensity;

  varying vec2 vUV;
  varying vec2 vScreenN;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float u = vUV.x;
    float v = vUV.y;
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale - uTime * uSpeed + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(19.3, 7.7, 31.1)));
    vec2 offset = normalize(vScreenN + 1e-5) * 0.55 + n * 0.45;
    float len = length(offset);
    if (len > 1.0) offset /= len;
    float mask = (1.0 - smoothstep(0.7, 1.0, abs(u))) * smoothstep(0.1, 0.35, v) * (1.0 - smoothstep(0.85, 1.0, v));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

/** The wobble in the air past the wave's skin. */
export function createSanguineWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...waveShapeUniforms(),
      uPad: { value: 0.22 },
      uStrength: { value: 0.5 },
      uScale: { value: 1.8 },
      uSpeed: { value: 2.2 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} state the wave's state plus { strength } */
  material.userData.sync = (state) => {
    const c = settings.sanguine;
    const g = settings.global;
    const u = material.uniforms;
    syncWaveShape(u, state);
    u.uPad.value = c.warpPad;
    u.uStrength.value = state.strength * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The smear                                                            */
/* -------------------------------------------------------------------- */

/**
 * A raw unit PlaneGeometry laid down the cast line from uniforms: x across,
 * y along. `vFlat.y` is metres from the caster's feet (negative behind).
 */
const SMEAR_VERTEX = /* glsl */ `
  uniform vec3  uStart;     // the caster's feet, on the floor
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;    // metres the quad runs
  uniform float uBackPad;   // metres of it behind the feet
  uniform float uWidth;     // full width, metres
  uniform float uLift;

  varying vec2 vFlat;
  varying vec3 vWorld;

  void main() {
    float across = position.x * uWidth;
    float along = (position.y + 0.5) * uLength - uBackPad;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = uLift;
    vFlat = vec2(across, along);
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SMEAR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uPaint;       // metres along the wave has painted so far
  uniform float uHalfW;
  uniform float uEdgeNoise;
  uniform float uEdgeScale;
  uniform float uPoolR;
  uniform float uPoolAt;
  uniform float uSplashAt;
  uniform float uSplashR;
  uniform float uSplatter;
  uniform float uSplatterScale;
  uniform float uStreaks;
  uniform float uStreakScale;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uEnv;
  uniform float uBump;
  uniform float uClock;       // seconds since the cast began
  uniform float uWellTime;
  uniform float uSpeed;
  uniform float uSplashTime;  // when the lip landed (large until it has)
  uniform float uDryDelay;
  uniform float uDryTime;
  uniform float uCrackStart;
  uniform float uCrackScale;
  uniform float uCrackWidth;
  uniform float uDrain;       // 0 .. 1 drained into the floor
  uniform float uDrainEdge;
  uniform float uOpacity;
  uniform vec3  uColorWet;
  uniform vec3  uColorDeep;
  uniform vec3  uColorDry;
  uniform vec3  uColorCrack;
  uniform vec3  uColorSpec;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;

  varying vec2 vFlat;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${ENV_GLSL}

  /** (F2 - F1, cell id): distance to the nearest cell wall, for the cracks. */
  vec2 cellEdge(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;
    float id = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < f1) { f2 = f1; f1 = d; id = hash11(dot(n + g, vec2(31.7, 57.1))); }
        else if (d < f2) { f2 = d; }
      }
    }
    return vec2(sqrt(f2) - sqrt(f1), id);
  }

  /** Drag streaks along the line, as a height field (metres-ish). */
  float streakH(float x, float along) {
    return snoise(vec3(x * uStreakScale, along * 0.3, uSeed)) * 0.6
         + snoise(vec3(x * uStreakScale * 2.3, along * 0.6, uSeed + 2.0)) * 0.3;
  }

  void main() {
    float x = vFlat.x;
    float along = vFlat.y;

    /* --- the painted shape, as a signed distance (metres, < 0 inside) --- */
    float n1 = fbm3(vec3(along * uEdgeScale, uSeed, 0.0));
    float n2 = snoise(vec3(along * uEdgeScale * 3.0, sign(x) * 2.0, uSeed + 3.0));
    float hw = uHalfW * (0.5 + 0.5 * smoothstep(-0.2, 2.5, along)) * (1.0 + uEdgeNoise * (n1 * 0.8 + n2 * 0.3));
    float dStrip = abs(x) - hw;
    dStrip = max(dStrip, along - uPaint);       // only behind the crest
    dStrip = max(dStrip, -along - 0.3);

    vec2 pp = vec2(x, along - uPoolAt);
    float pa = atan(pp.y, pp.x);
    float dPool = length(pp) - uPoolR * (1.0 + 0.22 * snoise(vec3(cos(pa) * 1.6, sin(pa) * 1.6, uSeed + 9.0)));

    vec2 sp = vec2(x, along - uSplashAt);
    float sa = atan(sp.y, sp.x);
    float rays = snoise(vec3(cos(sa) * 3.0, sin(sa) * 3.0, uSeed + 5.0)) * 0.5 + 0.5;
    float dSplash = length(sp) - uSplashR * (0.72 + 0.65 * rays * rays);

    float d = min(min(dStrip, dPool), dSplash);

    /* --- beads thrown just past the edge --- */
    vec2 cell = voronoi2(vFlat * uSplatterScale + uSeed * 5.3);
    float beadR = mix(0.06, 0.24, cell.y) * uSplatter;
    float painted = 1.0 - smoothstep(uPaint - 0.2, uPaint + 0.4, along);
    float beads = (1.0 - smoothstep(beadR * 0.75, beadR, cell.x)) * step(0.55, cell.y)
                * step(0.0, d) * (1.0 - smoothstep(0.0, 0.9, d)) * max(painted, step(dSplash, 1.2));

    float body = 1.0 - smoothstep(-0.03, 0.03, d);
    float cover = max(body, beads);
    if (cover < 0.004) discard;

    /* --- how long ago the wave passed this fragment --- */
    float passT = min(uWellTime + max(along, 0.0) / max(uSpeed, 0.1), uSplashTime);
    if (dSplash < 0.3) passT = uSplashTime;
    if (dPool < 0.0) passT = 0.0;
    float age = uClock - passT;
    float depth = smoothstep(0.0, 0.7, -d);       // thick in the middle
    float dry = smoothstep(uDryDelay, uDryDelay + max(uDryTime, 0.05), age + (1.0 - depth) * 0.45);
    float fresh = exp(-max(age, 0.0) / 0.35);

    /* --- drain: thin edges soak away first, a dark tide line at the edge --- */
    float soakN = fbm3(vec3(vFlat * 0.9, uSeed + 11.0)) * 0.5 + 0.5;
    float soak = mix(soakN, depth, 0.55);
    float thr = uDrain * 1.25 - 0.12;
    float keep = uDrain <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.06, soak);
    float tide = uDrain <= 0.0 ? 0.0 : (1.0 - smoothstep(0.0, 0.12, soak - thr)) * uDrainEdge;

    /* --- the wet surface: streaks dragged along the line, a meniscus at the edge --- */
    // The normal by finite differences in floor space — stable at any distance,
    // where screen derivatives of a 9-per-metre streak field alias into glitter.
    float streak = streakH(x, along);
    float e = 0.05;
    float gx = (streakH(x + e, along) - streak) / e;
    float gz = (streakH(x, along + e) - streak) / e;
    float men = smoothstep(-0.3, 0.0, d);
    float wet = 1.0 - dry;
    // A meniscus bulges at the edge: the normal tips outward across it.
    float edgeTilt = men * (1.0 - men) * 4.0 * sign(x) * 0.35;
    vec3 N = normalize(vec3(-(gx * uStreaks * 0.02 + edgeTilt) * uBump * wet, 1.0, -gz * uStreaks * 0.02 * uBump * wet));

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    vec3 Hh = normalize(L + V);

    vec3 base = mix(uColorWet, uColorDeep, depth) * (0.85 + 0.25 * streak * uStreaks);
    base = mix(base, uColorWet * 1.5, fresh * 0.45);
    float lambert = 0.5 + 0.5 * clamp(dot(N, L), 0.0, 1.0);
    float spec = pow(clamp(dot(N, Hh), 0.0, 1.0), max(uGloss, 1.0)) * uSpecular;
    float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb * uEnv * fres;
    vec3 wetCol = base * lambert + (uColorSpec * spec + env) * wet;

    /* --- dried: matte crust, crazed with cracks, the flakes' edges catching light --- */
    vec2 ce = cellEdge(vFlat * uCrackScale + uSeed * 3.1);
    float crackOpen = smoothstep(uCrackStart, 1.0, dry);
    float crack = (1.0 - smoothstep(uCrackWidth * 0.4, uCrackWidth, ce.x)) * crackOpen;
    float flake = (1.0 - smoothstep(uCrackWidth, uCrackWidth * 3.0, ce.x)) * crackOpen;
    vec3 dryCol = uColorDry * (0.8 + 0.35 * ce.y) * lambert * (1.0 + flake * 0.5);
    dryCol = mix(dryCol, uColorCrack, crack);

    vec3 color = mix(wetCol, dryCol, dry);
    color = mix(color, uColorCrack, clamp(tide, 0.0, 1.0) * 0.7);

    float alpha = cover * keep * uOpacity * mix(1.0, 0.92, dry);
    alpha *= 1.0 - crack * 0.25;  // the floor shows through the widest cracks
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

/** The blood smear down the line. Normal blending: it has to darken the floor. */
export function createSanguineSmearMaterial() {
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
      uEnvMap: frame.uEnvMap,
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uBackPad: { value: 2 },
      uWidth: { value: 6 },
      uLift: { value: 0.014 },
      uSeed: { value: 0 },
      uPaint: { value: 0 },
      uHalfW: { value: 1.6 },
      uEdgeNoise: { value: 0.3 },
      uEdgeScale: { value: 0.45 },
      uPoolR: { value: 0 },
      uPoolAt: { value: 0 },
      uSplashAt: { value: 0 },
      uSplashR: { value: 0 },
      uSplatter: { value: 1 },
      uSplatterScale: { value: 2.6 },
      uStreaks: { value: 1 },
      uStreakScale: { value: 8 },
      uGloss: { value: 140 },
      uSpecular: { value: 1.3 },
      uEnv: { value: 0.8 },
      uBump: { value: 1 },
      uClock: { value: 0 },
      uWellTime: { value: 0.38 },
      uSpeed: { value: 12 },
      uSplashTime: { value: 1e5 },
      uDryDelay: { value: 0.5 },
      uDryTime: { value: 2.2 },
      uCrackStart: { value: 0.45 },
      uCrackScale: { value: 2.4 },
      uCrackWidth: { value: 0.07 },
      uDrain: { value: 0 },
      uDrainEdge: { value: 0.6 },
      uOpacity: { value: 1 },
      uColorWet: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorDry: { value: new Color() },
      uColorCrack: { value: new Color() },
      uColorSpec: { value: new Color() }
    }),
    vertexShader: SMEAR_VERTEX,
    fragmentShader: SMEAR_FRAGMENT
  });

  /**
   * @param {object} state { start, dir, side, length, backPad, width, paint,
   *   poolR, poolAt, splashAt, splashR, clock, wellTime, speed, splashTime,
   *   drain, seed }
   */
  material.userData.sync = (state) => {
    const c = settings.sanguine;
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.1, state.length);
    u.uBackPad.value = state.backPad;
    u.uWidth.value = state.width;
    u.uSeed.value = state.seed;
    u.uPaint.value = state.paint;
    u.uHalfW.value = Math.max(0.05, c.smearWidth);
    u.uEdgeNoise.value = c.smearEdgeNoise * g.noiseStrength * g.randomness;
    u.uEdgeScale.value = c.smearEdgeScale * g.noiseFrequency;
    u.uPoolR.value = state.poolR;
    u.uPoolAt.value = state.poolAt;
    u.uSplashAt.value = state.splashAt;
    u.uSplashR.value = state.splashR;
    u.uSplatter.value = c.splatter;
    u.uSplatterScale.value = c.splatterScale;
    u.uStreaks.value = c.smearStreaks;
    u.uStreakScale.value = c.smearStreakScale * g.noiseFrequency;
    u.uGloss.value = c.smearGloss;
    u.uSpecular.value = c.smearSpecular * g.shaderIntensity;
    u.uEnv.value = c.smearEnv;
    u.uBump.value = c.smearBump;
    u.uClock.value = state.clock;
    u.uWellTime.value = state.wellTime;
    u.uSpeed.value = state.speed;
    u.uSplashTime.value = state.splashTime;
    u.uDryDelay.value = c.dryDelay * g.lifetime;
    u.uDryTime.value = c.dryTime * g.lifetime;
    u.uCrackStart.value = c.crackStart;
    u.uCrackScale.value = c.crackScale;
    u.uCrackWidth.value = c.crackWidth;
    u.uDrain.value = state.drain;
    u.uDrainEdge.value = c.drainEdge;
    u.uOpacity.value = g.opacity;
    u.uColorWet.value.copy(getColor(c.colorSmearWet));
    u.uColorDeep.value.copy(getColor(c.colorSmearDeep));
    u.uColorDry.value.copy(getColor(c.colorSmearDry));
    u.uColorCrack.value.copy(getColor(c.colorCrack));
    u.uColorSpec.value.copy(getColor(c.colorSpec));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The splash crown                                                     */
/* -------------------------------------------------------------------- */

/**
 * A unit PlaneGeometry wrapped into a ring: x is the bearing round it, y the
 * height up the sheet. The sheet runs to the tallest finger; the fragment cuts
 * the torn rim out of it, so the fingers are sharp at any tessellation.
 */
const CROWN_VERTEX = /* glsl */ `
  uniform float uRadius;
  uniform float uFlare;
  uniform float uHeight;
  uniform float uSpikeLen;
  uniform float uSeed;

  varying vec2  vRing;      // x: bearing 0..TAU, y: metres up
  varying float vRimR;      // radius at the rim, for the bead test
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float th = (position.x + 0.5) * 6.2831853;
    float h = position.y + 0.5;
    float top = uHeight * (1.0 + uSpikeLen);
    float flare = mix(1.0, uFlare, pow(h, 1.5));
    float wob = snoise(vec3(cos(th) * 1.7, sin(th) * 1.7, h * 1.5 + uSeed)) * 0.08;
    float r = uRadius * flare * (1.0 + wob);
    vec3 p = vec3(cos(th) * r, h * top, sin(th) * r);
    // The outward slope of the flare tips the normal down.
    float slope = uRadius * (uFlare - 1.0) * 1.5 * pow(max(h, 1e-3), 0.5) / max(top, 0.05);
    vec3 n = normalize(vec3(cos(th), -slope, sin(th)));

    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    vRing = vec2(th, h * top);
    vRimR = uRadius * uFlare;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const CROWN_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uHeight;
  uniform float uSpikes;
  uniform float uSpikeLen;
  uniform float uSharp;
  uniform float uDissolve;
  uniform float uOpacity;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uEnv;
  uniform float uFresnel;
  uniform float uSSS;
  uniform float uSoftFade;
  uniform vec3  uColorBlood;
  uniform vec3  uColorDeep;
  uniform vec3  uColorLip;
  uniform vec3  uColorSpec;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;

  varying vec2  vRing;
  varying float vRimR;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}
  ${ENV_GLSL}
  ${BLOOD_SHADE_GLSL}

  void main() {
    float th = vRing.x;
    float y = vRing.y;
    float S = max(floor(uSpikes + 0.5), 3.0);
    float cellW = 6.2831853 / S;
    float idx = floor(th / cellW + 0.5);
    float phi = th - idx * cellW;                      // -cellW/2 .. cellW/2
    float len = mix(0.45, 1.0, hash11(idx * 3.17 + uSeed)) * uSpikeLen * uHeight;
    float finger = pow(max(cos(phi / cellW * 3.14159265), 0.0), max(uSharp, 0.2));
    float rim = uHeight * (0.85 + 0.15 * snoise(vec3(th * 2.0, uSeed, 1.0)));
    float top = rim + len * finger;

    // A bead of blood at each fingertip.
    float beadR = 0.05 + 0.06 * hash11(idx * 7.7 + uSeed);
    vec2 bp = vec2(phi * vRimR, y - (rim + len + beadR * 0.4));
    float bead = 1.0 - smoothstep(beadR * 0.8, beadR, length(bp));

    float sheet = 1.0 - smoothstep(top - 0.03, top, y);
    float cover = max(sheet, bead);

    // It falls back in: holes open in the thin upper sheet first.
    float hn = fbm3(vec3(cos(th) * 2.5, sin(th) * 2.5, y * 2.0 + uSeed)) * 0.5 + 0.5;
    hn = mix(hn, 1.0 - y / max(uHeight * 1.6, 0.05), 0.4);
    float thr = uDissolve * 1.2 - 0.1;
    cover *= uDissolve <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.08, hn);
    cover *= uOpacity;
    if (cover < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    cover *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (cover < 0.004) discard;

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);

    float hgt = clamp(y / max(uHeight, 0.05), 0.0, 1.5);
    vec3 base = mix(uColorDeep, uColorBlood, smoothstep(0.0, 0.8, hgt));
    vec3 color = shadeBlood(base, N, V, L, uGloss, uSpecular, uEnv, uFresnel, uColorSpec, uEnvMap);
    // The thin top of the sheet and the fingers glow red against the light.
    float thin = smoothstep(0.5, 1.2, hgt);
    float against = pow(clamp(dot(V, -L) * 0.5 + 0.5, 0.0, 1.0), 2.0);
    color += uColorLip * thin * (0.3 + 0.8 * against) * uSSS * uGlobalGlow;

    gl_FragColor = vec4(color, clamp(cover, 0.0, 1.0));
  }
`;

/** The crown of blood thrown up where the lip lands. */
export function createSanguineCrownMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uRadius: { value: 1 },
      uFlare: { value: 1.4 },
      uHeight: { value: 1 },
      uSpikes: { value: 15 },
      uSpikeLen: { value: 0.6 },
      uSharp: { value: 2 },
      uSeed: { value: 0 },
      uDissolve: { value: 0 },
      uOpacity: { value: 1 },
      uGloss: { value: 110 },
      uSpecular: { value: 1.7 },
      uEnv: { value: 1 },
      uFresnel: { value: 1.4 },
      uSSS: { value: 1.3 },
      uSoftFade: { value: 0.2 },
      uColorBlood: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorLip: { value: new Color() },
      uColorSpec: { value: new Color() }
    }),
    vertexShader: CROWN_VERTEX,
    fragmentShader: CROWN_FRAGMENT
  });

  /** @param {object} state { radius, height, dissolve, seed } */
  material.userData.sync = (state) => {
    const c = settings.sanguine;
    const g = settings.global;
    const u = material.uniforms;
    u.uRadius.value = Math.max(0.05, state.radius);
    u.uFlare.value = Math.max(1, c.crownFlare);
    u.uHeight.value = Math.max(0.01, state.height);
    u.uSpikes.value = c.crownSpikes;
    u.uSpikeLen.value = c.crownSpikeLength;
    u.uSharp.value = c.crownSharp;
    u.uSeed.value = state.seed;
    u.uDissolve.value = state.dissolve;
    u.uOpacity.value = c.opacity * g.opacity;
    u.uGloss.value = c.gloss;
    u.uSpecular.value = c.specular * g.shaderIntensity;
    u.uEnv.value = c.envReflect;
    u.uFresnel.value = c.fresnel * g.fresnel;
    u.uSSS.value = c.sss * g.glow;
    u.uColorBlood.value.copy(getColor(c.colorBlood));
    u.uColorDeep.value.copy(getColor(c.colorDeep));
    u.uColorLip.value.copy(getColor(c.colorLip));
    u.uColorSpec.value.copy(getColor(c.colorSpec));
  };

  return material;
}
