import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Pearl Tempest — the bespoke shaders.
 *
 *  - **the pearl** (`createPearlMaterial`) — opaque, instanced. A milky nacre
 *    body lit from the stage's sun, a thin-film iridescence that shifts hue
 *    with the viewing angle at the rim (cosine palette off `1 − N·V`), a hard
 *    specular and a sky reflection, and — the reason it reads as *compressed
 *    tide* and not a marble — a swirl of bright blue water seen through the
 *    middle of it, turning on curl-warped noise in the pearl's own frame.
 *    It flashes white the instant before it bursts.
 *  - **the wake** (`createWakeMaterial`) — two additive strands per pearl,
 *    wound as a double helix round the pearl's own flight arc in the vertex
 *    stage (`arcPoint` — the CPU twin is `PearlTempestAbility#_arcPoint`).
 *  - **the crown** (`createCrownMaterial(0)`) — a splash crown raised from a
 *    flat cylinder grid in the vertex stage: a wall that shoots up, flares out
 *    and breaks at its rim into spikes, then slumps outward into the floor.
 *    Fresnel water with a foam rim and white spike tips.
 *  - **the crown's lens** (`createCrownMaterial(1)`) — the same crowns on
 *    `LAYER.DISTORTION`.
 *
 * Every material reads `settings.pearltempest` in `userData.sync()`.
 */

const ID = 'pearltempest';

const ENV_GLSL = /* glsl */ `
  uniform sampler2D uEnvMap;
  uniform float uHasEnv;
  vec3 skyAt(vec3 dir) {
    vec2 uv = vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5, asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    return uHasEnv > 0.5 ? texture2D(uEnvMap, uv).rgb : mix(vec3(0.08, 0.12, 0.18), vec3(0.55, 0.7, 0.85), dir.y * 0.5 + 0.5);
  }
`;

/** The flight of one pearl. Twin of `PearlTempestAbility#_arcPoint`. */
const ARC_GLSL = /* glsl */ `
  vec3 arcPoint(vec3 from, vec3 to, float apex, float bow, float t) {
    vec3 p = mix(from, to, t);
    vec3 d = to - from;
    vec3 side = normalize(vec3(-d.z, 0.0, d.x) + vec3(1e-5, 0.0, 0.0));
    p.y += apex * 4.0 * t * (1.0 - t);
    p += side * bow * sin(3.14159265 * t);
    return p;
  }
`;

/* ==================================================================== */
/* The pearl                                                              */
/* ==================================================================== */

const PEARL_VERTEX = /* glsl */ `
  attribute vec4 aPearl;      // seed, flash, spin angle, unused

  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec4 vPearl;

  void main() {
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(model) * normal);
    vLocal = position;
    vPearl = aPearl;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PEARL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uNacre;
  uniform float uIrid;
  uniform float uFilm;
  uniform float uCore;
  uniform float uSwirl;
  uniform float uFresnelPow;
  uniform float uSpecular;
  uniform float uEnvAmt;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorD;
  uniform vec3  uLightDir;
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec4 vPearl;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float facing = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - facing, max(uFresnelPow, 0.2));

    // Nacre: soft wrap lighting, milky, a little blue in the shadow.
    float wrap = clamp(dot(N, uLightDir) * 0.5 + 0.5, 0.0, 1.0);
    vec3 body = mix(uColorB, uColorA, wrap) * uNacre;

    // Thin film: the hue walks round the palette with the angle.
    float film = (1.0 - facing) * uFilm + vPearl.x * 0.13;
    vec3 irid = 0.5 + 0.5 * cos(6.2831853 * (film + vec3(0.0, 0.33, 0.67)));

    // The compressed tide inside: curl-warped swirl, turning in the pearl's frame.
    float a = vPearl.z;
    vec3 q = vLocal;
    q.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * q.xz;
    vec3 w = q * uSwirl + vec3(vPearl.x * 7.0, uTime * 0.6, 0.0);
    w += curlNoise(w * 0.7) * 0.6;
    float swirl = fbm3(w);
    float veins = 1.0 - smoothstep(0.0, 0.18, abs(swirl));
    float through = pow(facing, 2.5);
    vec3 core = uColorC * (0.35 + veins * 1.6) * through * uCore * uShaderIntensity;

    vec3 H = normalize(uLightDir + V);
    float spec = pow(max(dot(N, H), 0.0), 90.0) * uSpecular;
    vec3 sky = skyAt(reflect(-V, N)) * uEnvAmt;

    vec3 col = body * (1.0 - through * 0.55) + core;
    col += irid * fres * uIrid;
    col += sky * (0.2 + fres * 0.8);
    col += uColorD * spec;
    col = mix(col, uColorD * 3.0, clamp(vPearl.y, 0.0, 1.0));
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

export function createPearlMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uHasEnv: { value: 0 },
      uNacre: { value: 1 },
      uIrid: { value: 1 },
      uFilm: { value: 1.6 },
      uCore: { value: 2.5 },
      uSwirl: { value: 2 },
      uFresnelPow: { value: 2.2 },
      uSpecular: { value: 3 },
      uEnvAmt: { value: 0.6 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorD: { value: new Color() }
    }),
    vertexShader: PEARL_VERTEX,
    fragmentShader: PEARL_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHasEnv.value = frame.uEnvMap.value ? 1 : 0;
    u.uNacre.value = c.nacreGlow;
    u.uIrid.value = c.iridescence * g.fresnel;
    u.uFilm.value = c.filmScale;
    u.uCore.value = c.coreGlow * g.glow;
    u.uSwirl.value = c.swirlScale * g.noiseFrequency;
    u.uFresnelPow.value = c.fresnelPower;
    u.uSpecular.value = c.specular;
    u.uEnvAmt.value = c.envAmount;
    u.uColorA.value.copy(getColor(c.colorPearlA));
    u.uColorB.value.copy(getColor(c.colorPearlB));
    u.uColorC.value.copy(getColor(c.colorPearlC));
    u.uColorD.value.copy(getColor(c.colorPearlD));
  };

  return material;
}

/* ==================================================================== */
/* The wake                                                               */
/* ==================================================================== */

const WAKE_VERTEX = /* glsl */ `
  attribute vec3 aFrom;
  attribute vec3 aTo;
  attribute vec4 aArc;        // apex, bow, progress, strand phase
  attribute vec2 aLook;       // seed, strength

  uniform float uWakeLen;
  uniform float uRadius;
  uniform float uTurns;
  uniform float uWidth;
  uniform float uTime;

  varying float vU;
  varying float vAng;
  varying float vLive;
  varying vec2  vLook;
  varying float vViewZ;

  ${ARC_GLSL}

  void main() {
    float u = position.y;                 // 0 at the pearl .. 1 the end of the wake
    float ang = position.x * 6.2831853;
    float t = aArc.z - u * uWakeLen;
    float tc = clamp(t, 0.0, 1.0);
    vec3 c = arcPoint(aFrom, aTo, aArc.x, aArc.y, tc);
    vec3 T = arcPoint(aFrom, aTo, aArc.x, aArc.y, min(tc + 0.01, 1.0)) - arcPoint(aFrom, aTo, aArc.x, aArc.y, max(tc - 0.01, 0.0));
    T = normalize(T + vec3(0.0, 1e-5, 0.0));
    vec3 ref = abs(T.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 N1 = normalize(cross(T, ref));
    vec3 B = cross(N1, T);

    // The double helix: a strand wound round the arc, opening out behind the pearl.
    float h = aArc.w + u * uTurns * 6.2831853 - uTime * 9.0;
    float hr = uRadius * (0.55 + 0.9 * u);
    vec3 strand = c + (cos(h) * N1 + sin(h) * B) * hr;
    float sr = uWidth * (1.0 - u) * (0.6 + 0.4 * sin(u * 20.0 + aLook.x));
    vec3 world = strand + (cos(ang) * N1 + sin(ang) * B) * sr;

    vU = u;
    vAng = ang;
    vLook = aLook;
    // Nothing before the throw, nothing past the landing.
    vLive = step(0.0, t) * (1.0 - smoothstep(0.98, 1.05, t));
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const WAKE_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uOpacity;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying float vU;
  varying float vAng;
  varying float vLive;
  varying vec2  vLook;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float m = vLive * vLook.y * pow(1.0 - vU, 1.4) * uOpacity;
    float n = snoise(vec3(vU * 14.0, vLook.x, vAng * 0.3)) * 0.5 + 0.5;
    m *= 0.55 + 0.45 * n;
    if (m < 0.004) discard;
    vec3 col = mix(uColorB, uColorA, pow(1.0 - vU, 3.0)) * uGlow * uGlobalGlow;
    gl_FragColor = vec4(col * m, m);
  }
`;

export function createWakeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWakeLen: { value: 0.3 },
      uRadius: { value: 0.24 },
      uTurns: { value: 3.5 },
      uWidth: { value: 0.05 },
      uGlow: { value: 2 },
      uOpacity: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: WAKE_VERTEX,
    fragmentShader: WAKE_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uWakeLen.value = Math.max(0.01, c.wakeLength);
    u.uRadius.value = c.wakeRadius;
    u.uTurns.value = c.wakeTurns;
    u.uWidth.value = Math.max(0.002, c.wakeWidth);
    u.uGlow.value = c.wakeGlow * g.glow;
    u.uOpacity.value = c.wakeOpacity * g.opacity;
    u.uColorA.value.copy(getColor(c.colorWakeA));
    u.uColorB.value.copy(getColor(c.colorWakeB));
  };

  return material;
}

/* ==================================================================== */
/* The crown                                                              */
/* ==================================================================== */

const CROWN_VERTEX = /* glsl */ `
  attribute vec4  aCrown;     // x, z, progress, seed
  attribute float aScale;

  uniform float uRadius;
  uniform float uHeight;
  uniform float uSpikes;
  uniform float uSpikeDepth;
  uniform float uFlare;

  varying float vV;
  varying float vAng;
  varying float vTip;
  varying float vProg;
  varying float vSeed;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float ang = position.x * 6.2831853;
    float v = position.y;
    float prog = aCrown.z;
    float seed = aCrown.w;

    float rise = 1.0 - pow(1.0 - clamp(prog / 0.32, 0.0, 1.0), 3.0);
    float slump = smoothstep(0.4, 1.0, prog);
    float spikeN = snoise(vec3(cos(ang) * 1.5, sin(ang) * 1.5, seed)) * 0.5;
    float spikes = pow(0.5 + 0.5 * cos(ang * floor(uSpikes) + seed * 6.0 + spikeN * 2.0), 2.0);
    float rimH = 1.0 - uSpikeDepth * (1.0 - spikes);

    float R = uRadius * aScale * (0.3 + 0.7 * rise) * (1.0 + 0.5 * slump);
    float H = uHeight * aScale * rise * (1.0 - slump * 0.92);
    // The wall: straight at the floor, flaring at the rim, falling outward as it slumps.
    float r = R * (1.0 + uFlare * v * v + slump * v * 0.8);
    float y = v * H * mix(1.0, rimH, smoothstep(0.55, 1.0, v));

    vec3 world = vec3(aCrown.x + cos(ang) * r, y, aCrown.y + sin(ang) * r);
    vec3 radial = vec3(cos(ang), 0.0, sin(ang));
    vNormalW = normalize(radial - vec3(0.0, uFlare * v * 0.8 + 0.1, 0.0));
    vV = v;
    vAng = ang;
    vTip = spikes * smoothstep(0.7, 1.0, v);
    vProg = prog;
    vSeed = seed;
    vWorld = world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const CROWN_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uOpacity;
  uniform float uGlow;
  uniform float uFoam;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform float uTime;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;

  varying float vV;
  varying float vAng;
  varying float vTip;
  varying float vProg;
  varying float vSeed;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}
  ${ENV_GLSL}

  void main() {
    if (vProg <= 0.0 || vProg >= 1.0) discard;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);

    // Sheets of water running up the wall, and the rim breaking into foam.
    float run = snoise(vec3(vAng * 3.0, vV * 4.0 - uTime * 3.0, vSeed)) * 0.5 + 0.5;
    float foam = smoothstep(0.65, 1.0, vV) * smoothstep(0.3, 0.8, run + vTip) + vTip;
    // Holes tear open in the thin wall as it slumps.
    float tearN = snoise(vec3(vAng * 2.5, vV * 3.0, vSeed + 4.0)) * 0.5 + 0.5;
    if (tearN < smoothstep(0.45, 1.0, vProg) * 1.1 - 0.05) discard;

    vec3 sky = skyAt(reflect(-V, N));
    vec3 col = mix(uColorA, uColorB, vV * 0.7 + run * 0.3) * uGlow + sky * fres * 0.8;
    col = mix(col, uColorC * 1.6, clamp(foam * uFoam, 0.0, 1.0));
    float a = (0.35 + 0.65 * fres + foam * 0.5) * uOpacity * (1.0 - smoothstep(0.75, 1.0, vProg));
    a *= smoothstep(0.0, 0.06, vV + 0.02);
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    a *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.15);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

const CROWN_LENS_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uShaderIntensity;

  varying float vV;
  varying float vAng;
  varying float vTip;
  varying float vProg;
  varying float vSeed;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  void main() {
    if (vProg <= 0.0 || vProg >= 1.0) discard;
    vec3 nv = (viewMatrix * vec4(normalize(vNormalW), 0.0)).xyz;
    vec2 dir = nv.xy;
    float len = length(dir);
    if (len > 1.0) dir /= len;
    float mask = (1.0 - smoothstep(0.6, 1.0, vProg)) * smoothstep(0.0, 0.2, vV);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
  }
`;

/** @param {0|1} mode 0 the water, 1 its refraction on LAYER.DISTORTION */
export function createCrownMaterial(mode = 0) {
  const lens = mode === 1;
  const shape = {
    uRadius: { value: 1 },
    uHeight: { value: 1 },
    uSpikes: { value: 13 },
    uSpikeDepth: { value: 0.45 },
    uFlare: { value: 0.5 }
  };
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: !lens,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms(
      lens
        ? { ...shape, uStrength: { value: 1 } }
        : {
            ...shape,
            uEnvMap: frame.uEnvMap,
            uHasEnv: { value: 0 },
            uOpacity: { value: 0.75 },
            uGlow: { value: 1.5 },
            uFoam: { value: 1.4 },
            uColorA: { value: new Color() },
            uColorB: { value: new Color() },
            uColorC: { value: new Color() }
          }
    ),
    vertexShader: CROWN_VERTEX,
    fragmentShader: lens ? CROWN_LENS_FRAGMENT : CROWN_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uRadius.value = c.crownRadius * g.explosionIntensity;
    u.uHeight.value = c.crownHeight * g.explosionIntensity;
    u.uSpikes.value = Math.max(3, Math.round(c.crownSpikes));
    u.uSpikeDepth.value = c.crownSpikeDepth;
    u.uFlare.value = c.crownFlare;
    if (lens) {
      u.uStrength.value = c.crownWarp * g.distortion;
      return;
    }
    u.uHasEnv.value = frame.uEnvMap.value ? 1 : 0;
    u.uOpacity.value = c.crownOpacity * g.opacity;
    u.uGlow.value = c.crownGlow * g.glow;
    u.uFoam.value = c.crownFoam;
    u.uColorA.value.copy(getColor(c.colorCrownA));
    u.uColorB.value.copy(getColor(c.colorCrownB));
    u.uColorC.value.copy(getColor(c.colorCrownC));
  };

  return material;
}
