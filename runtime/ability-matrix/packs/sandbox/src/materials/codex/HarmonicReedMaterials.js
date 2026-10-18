import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'harmonic';

/** Reeds the floor's interference pattern listens to (the shader loop is fixed). */
export const HARMONIC_SOURCES = 16;

/**
 * Harmonic Reed — the four bespoke shaders.
 *
 *  - **the reeds** (`createReedMaterial`) — instanced open tubes of streaming
 *    air, additive. Each tube is bent in world space after the instance
 *    transform (so the sway is in metres whatever the reed's radius), and
 *    its fragment draws a pipe of moving air: a bright fresnel wall (you see
 *    a tube by its edges), streaks flowing up inside it, and the reed's
 *    **harmonic** — `n` bright node bands up its length that throb as it
 *    rings, with a glowing lip at the top. Unravels top-down at the end.
 *    Per-instance `vec4 aState`: seed, harmonic n, ring (glow 0..1+),
 *    unravel 0..1. `aPitch` (0..1) picks its colour along the pitch ramp.
 *  - **the lens** (`createReedLensMaterial`) — the same tubes, fatter, on
 *    `LAYER.DISTORTION`: every reed bends the world behind it like a column
 *    of hot glass.
 *  - **sound shells** (`createReedShellMaterial`) — instanced flat rings that
 *    leave every reed's lip and nodes and open outward, interference fringes
 *    inside a bright rim. Per-instance `vec4 aShell`: progress, intensity,
 *    pitch, seed.
 *  - **the interference floor** (`createReedFloorMaterial`) — every reed is a
 *    point source of ripples on the floor; the shader sums them, so the
 *    circle shows the real moiré of a chord — bright where the waves agree,
 *    dark where they cancel — and flares on the chord.
 *
 * Every material reads `settings.harmonic` in `userData.sync()`.
 */

const PITCH_GLSL = /* glsl */ `
  vec3 pitchColor(float p, vec3 a, vec3 b, vec3 c) {
    return p < 0.5 ? mix(a, b, p * 2.0) : mix(b, c, p * 2.0 - 1.0);
  }
`;

/* ==================================================================== */
/* The reeds                                                              */
/* ==================================================================== */

const REED_VERTEX = /* glsl */ `
  attribute vec4  aState;
  attribute float aPitch;

  uniform float uTime;
  uniform float uSway;
  uniform float uSwayRate;
  uniform float uSwell;       // the lens is a fatter reed

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vY;
  varying float vAng;
  varying vec4  vState;
  varying float vPitch;
  varying float vViewZ;
  varying float vHeight;

  void main() {
    vState = aState;
    vPitch = aPitch;
    float y = clamp(position.y, 0.0, 1.0);
    vY = y;
    vAng = atan(position.z, position.x);
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec3 local = vec3(position.x * uSwell, position.y, position.z * uSwell);
    vec4 world = model * vec4(local, 1.0);
    vec3 base = (model * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 top = (model * vec4(0.0, 1.0, 0.0, 1.0)).xyz;
    vHeight = length(top - base);
    // Sway in metres, after the instance scale — a reed bends at the top.
    float seed = aState.x;
    vec2 swayDir = vec2(cos(seed * 6.2831853), sin(seed * 6.2831853));
    float sw = sin(uTime * uSwayRate + seed * 17.0) + 0.4 * sin(uTime * uSwayRate * 2.3 + seed * 5.0);
    world.xz += swayDir * uSway * sw * y * y * vHeight * 0.25;
    vWorld = world.xyz;
    vNormalW = normalize(mat3(model) * vec3(position.x, 0.0, position.z));
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const REED_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uFlow;          // integrated upward flow
  uniform float uFlowScale;
  uniform float uRimGlow;
  uniform float uCoreGlow;
  uniform float uNodeGlow;
  uniform float uNodeWidth;
  uniform float uLipGlow;
  uniform float uUnravelEdge;
  uniform float uSoftFade;
  uniform float uOpacity;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorD;

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
  varying vec4  vState;
  varying float vPitch;
  varying float vViewZ;
  varying float vHeight;

  ${noiseGLSL}
  ${commonGLSL}
  ${PITCH_GLSL}

  void main() {
    float seed = vState.x;
    float harm = max(vState.y, 1.0);
    float ring = vState.z;
    float unravel = vState.w;

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    float facing = abs(dot(N, V));
    float rim = pow(1.0 - facing, 2.0);

    // Air streaming up the pipe.
    float h = vY * vHeight;
    float streak = fbm3(vec3(cos(vAng) * 0.8 + seed * 9.0, sin(vAng) * 0.8, h * uFlowScale - uFlow));
    streak = smoothstep(0.0, 0.8, streak * 0.5 + 0.5);

    // The harmonic: n node bands, throbbing as it rings.
    float node = abs(fract(vY * harm + 0.5) - 0.5);
    float band = exp(-pow(node / max(uNodeWidth, 0.005), 2.0));
    float throb = 0.6 + 0.4 * sin(uTime * (6.0 + harm * 2.0) + seed * 20.0);
    float lip = smoothstep(0.9, 1.0, vY);

    vec3 tint = pitchColor(vPitch, uColorB, uColorC, uColorD);
    vec3 col = tint * (rim * uRimGlow + uCoreGlow) * (0.55 + 0.6 * streak);
    col += uColorA * pow(streak, 3.0) * rim * uRimGlow * 0.6;
    col += mix(tint, uColorA, 0.6) * band * uNodeGlow * ring * throb;
    col += uColorA * lip * uLipGlow * (0.4 + ring);

    float mask = (rim * 0.85 + 0.15 + band * ring * 0.5 + lip) * smoothstep(0.0, 0.03, vY);

    // Unravels from the top down, into strands of the flow.
    if (unravel > 0.0) {
      float n = snoise(vec3(cos(vAng) * 1.3 + seed, sin(vAng) * 1.3, h * 1.2)) * 0.5 + 0.5;
      float field = (1.0 - vY) * 0.7 + n * 0.3;
      float thr = unravel * 1.15 - 0.08;
      float keep = smoothstep(thr, thr + 0.03, field);
      col += uColorA * keep * (1.0 - smoothstep(thr + 0.03, thr + 0.03 + uUnravelEdge, field)) * 3.0;
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

/** Instanced tubes of streaming air. Additive. */
export function createReedMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSway: { value: 0.2 },
      uSwayRate: { value: 1.3 },
      uSwell: { value: 1 },
      uFlow: { value: 0 },
      uFlowScale: { value: 3 },
      uRimGlow: { value: 2 },
      uCoreGlow: { value: 0.3 },
      uNodeGlow: { value: 3 },
      uNodeWidth: { value: 0.06 },
      uLipGlow: { value: 3 },
      uUnravelEdge: { value: 0.06 },
      uSoftFade: { value: 0.3 },
      uOpacity: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorD: { value: new Color() }
    }),
    vertexShader: REED_VERTEX,
    fragmentShader: REED_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {number} flow integrated upward flow, metres */
  material.userData.sync = (flow) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSway.value = c.swayAmp * g.noiseStrength;
    u.uSwayRate.value = c.swayRate * g.noiseSpeed;
    u.uSwell.value = 1;
    u.uFlow.value = flow;
    u.uFlowScale.value = c.flowScale * g.noiseFrequency;
    u.uRimGlow.value = c.rimGlow * g.glow * g.fresnel;
    u.uCoreGlow.value = c.coreGlow * g.glow;
    u.uNodeGlow.value = c.nodeGlow * g.glow;
    u.uNodeWidth.value = c.nodeWidth;
    u.uLipGlow.value = c.lipGlow * g.glow;
    u.uUnravelEdge.value = c.unravelEdge;
    u.uSoftFade.value = c.softFade;
    u.uOpacity.value = c.reedOpacity * g.opacity;
    u.uColorA.value.copy(getColor(c.colorReedA));
    u.uColorB.value.copy(getColor(c.colorReedB));
    u.uColorC.value.copy(getColor(c.colorReedC));
    u.uColorD.value.copy(getColor(c.colorReedD));
  };

  return material;
}

const LENS_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uShaderIntensity;
  uniform float uTime;
  varying vec3  vNormalW;
  varying float vY;
  varying vec4  vState;

  void main() {
    // Push the world out from the tube's axis — a column of dense air.
    vec3 N = normalize(vNormalW);
    vec3 Nv = normalize((viewMatrix * vec4(N, 0.0)).xyz);
    float ring = vState.z;
    float mask = smoothstep(0.0, 0.05, vY) * (1.0 - smoothstep(0.85, 1.0, vY)) * (1.0 - vState.w);
    float wob = 0.75 + 0.25 * sin(vY * 20.0 - uTime * 6.0);
    float s = uStrength * uShaderIntensity * mask * (0.5 + 0.5 * ring) * wob;
    if (s < 0.002) discard;
    gl_FragColor = vec4(normalize(Nv.xy + 1e-4) * 0.5 + 0.5, s, mask);
  }
`;

/** The reeds' refraction. LAYER.DISTORTION — see `createAcidFumeMaterial`. */
export function createReedLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSway: { value: 0.2 },
      uSwayRate: { value: 1.3 },
      uSwell: { value: 1.8 },
      uStrength: { value: 1 }
    }),
    vertexShader: REED_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });
  material.userData.instanced = true;

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSway.value = c.swayAmp * g.noiseStrength;
    u.uSwayRate.value = c.swayRate * g.noiseSpeed;
    u.uSwell.value = c.lensScale;
    u.uStrength.value = c.lensWarp * g.distortion;
  };

  return material;
}

/* ==================================================================== */
/* Sound shells                                                           */
/* ==================================================================== */

const SHELL_VERTEX = /* glsl */ `
  attribute vec4 aShell;
  varying vec2 vUv;
  varying vec4 vShell;
  varying float vViewZ;

  void main() {
    vUv = position.xy;
    vShell = aShell;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    // The quad lies in XY; lay it flat on XZ.
    vec4 world = model * vec4(position.x, 0.0, position.y, 1.0);
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHELL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uWidth;
  uniform float uFringes;
  uniform float uGlow;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorD;
  uniform float uGlobalGlow;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  varying vec2 vUv;
  varying vec4 vShell;
  varying float vViewZ;

  ${commonGLSL}
  ${PITCH_GLSL}

  void main() {
    float progress = vShell.x;
    float intensity = vShell.y;
    float r = length(vUv);
    if (r > 1.0 || intensity <= 0.0) discard;
    float w = max(uWidth, 0.005);
    float rim = exp(-pow((r - 0.96) / w, 2.0));
    // Interference fringes trailing inside the rim.
    float inner = smoothstep(0.35, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r));
    float fr = 0.5 + 0.5 * cos((1.0 - r) * uFringes * 6.2831853 / 0.6);
    float fringes = inner * pow(fr, 6.0) * 0.45;
    vec3 tint = pitchColor(vShell.z, uColorB, uColorC, uColorD);
    float fade = (1.0 - progress) * (1.0 - progress);
    vec3 col = (uColorA * rim + tint * (rim * 0.6 + fringes)) * uGlow * intensity * fade;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    float soft = softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.25);
    if ((rim + fringes) * intensity * fade * soft < 0.003) discard;
    gl_FragColor = vec4(col * soft * uGlobalGlow, 1.0);
  }
`;

/** Rings of sound leaving the reeds. Instanced, additive. */
export function createReedShellMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 0.06 },
      uFringes: { value: 3 },
      uGlow: { value: 2 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorD: { value: new Color() }
    }),
    vertexShader: SHELL_VERTEX,
    fragmentShader: SHELL_FRAGMENT
  });
  material.userData.instanced = true;

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = c.shellWidth;
    u.uFringes.value = c.shellFringes;
    u.uGlow.value = c.shellGlow * g.glow * g.opacity;
    u.uColorA.value.copy(getColor(c.colorReedA));
    u.uColorB.value.copy(getColor(c.colorReedB));
    u.uColorC.value.copy(getColor(c.colorReedC));
    u.uColorD.value.copy(getColor(c.colorReedD));
  };

  return material;
}

/* ==================================================================== */
/* The interference floor                                                 */
/* ==================================================================== */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;
  varying vec2 vP;
  varying vec2 vW;

  void main() {
    vec2 p = position.xy * uExtent;
    vP = p;
    vW = uCentre.xz + p;
    gl_Position = projectionMatrix * viewMatrix * vec4(uCentre.x + p.x, 0.014, uCentre.z + p.y, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uRadius;
  uniform vec4  uSources[${HARMONIC_SOURCES}];   // x, z, amplitude, phase offset
  uniform float uCount;
  uniform float uK;          // 2π / wavelength
  uniform float uPhase;      // integrated ω t
  uniform float uGlow;
  uniform float uDark;
  uniform float uChord;      // 0..1 flare on the chord
  uniform float uErode;
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorDark;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vP;
  varying vec2 vW;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    float sum = 0.0;
    float amp = 0.0;
    for (int i = 0; i < ${HARMONIC_SOURCES}; i++) {
      if (float(i) >= uCount) break;
      vec4 s = uSources[i];
      float d = distance(vW, s.xy);
      float a = s.z / (1.0 + d * 0.6);
      sum += a * sin(d * uK - uPhase + s.w);
      amp += a;
    }
    float field = sum / max(amp, 1e-3);
    float bright = smoothstep(0.25, 0.9, field);
    float trough = smoothstep(0.1, 0.8, -field);

    float rag = snoise(vec3(vP * 0.8, uSeed)) * 0.35;
    float inside = 1.0 - smoothstep(uRadius - 0.4, uRadius + 0.15, r + rag);
    float level = clamp(amp * 0.6, 0.0, 1.0);

    vec3 col = uColorDark;
    col += mix(uColorB, uColorA, bright) * bright * uGlow * (0.6 + uChord * 2.0) * uGlobalGlow * uShaderIntensity;
    float a = inside * level * max(uDark * (0.5 + 0.5 * trough), bright);
    float en = snoise(vec3(vP * 1.5, uSeed * 2.0)) * 0.5 + 0.5;
    float t = uErode * 1.3 - 0.15;
    a *= smoothstep(t, t + 0.15, en);
    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The chord's interference pattern on the floor. Normal blending. */
export function createReedFloorMaterial() {
  const sources = [];
  for (let i = 0; i < HARMONIC_SOURCES; i++) sources.push(new Vector4());
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
      uSources: { value: sources },
      uCount: { value: 0 },
      uK: { value: 6 },
      uPhase: { value: 0 },
      uGlow: { value: 1.4 },
      uDark: { value: 0.5 },
      uChord: { value: 0 },
      uErode: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorDark: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /**
   * @param {object} s { centre, count, phase, chord, erode, seed }
   * The source array is written by the ability straight into
   * `material.uniforms.uSources.value`.
   */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uRadius.value = c.zoneRadius;
    u.uExtent.value = c.zoneRadius + 0.5;
    u.uCount.value = s.count;
    u.uK.value = (Math.PI * 2) / Math.max(0.1, c.rippleWavelength);
    u.uPhase.value = s.phase;
    u.uGlow.value = c.rippleGlow * g.glow;
    u.uDark.value = c.rippleDark;
    u.uChord.value = s.chord;
    u.uErode.value = s.erode;
    u.uSeed.value = s.seed;
    u.uOpacity.value = g.opacity;
    u.uColorA.value.copy(getColor(c.colorGroundA));
    u.uColorB.value.copy(getColor(c.colorReedC));
    u.uColorDark.value.copy(getColor(c.colorGroundB));
  };

  return material;
}
