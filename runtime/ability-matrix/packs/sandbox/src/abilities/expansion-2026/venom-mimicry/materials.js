import {
  Color,
  DoubleSide,
  FrontSide,
  MeshDepthMaterial,
  MeshStandardMaterial,
  NormalBlending,
  RGBADepthPacking,
  ShaderMaterial,
} from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { patchOnBeforeCompile } from '../../../utils/shaderPatch.js';
import config from './config.js';

/**
 * Venom Mimicry — the bespoke shaders.
 *
 *  - **the serpent** — a lit `MeshStandardMaterial` whose vertex and colour
 *    stages are rewritten: the vertex stage bends the spine-space body (see
 *    `geometry.js`) along a curvature profile θ(s) = A·s + C·s² + a travelling
 *    sway, and builds the hood from `aHood` so its span, cup and flare are
 *    live; the colour stage paints coral-snake **warning bands** (venom green,
 *    black, violet — the pattern every harmless mimic in nature copies), scale
 *    cells, a pale belly, and on the back of the hood two **false eyes** that
 *    glow white-hot while the hood is flared. The sun lights it and it casts a
 *    real shadow through a matching depth material (`LAYER.SHAPED`).
 *  - **venom threads** — an instanced tube laid on an arc between two
 *    carriers in the vertex stage; dark venom with bright beads flowing from
 *    the infector to the infected.
 *  - **the pools** — instanced floor blots: an fbm-ragged dark stain, glowing
 *    ridged veins, bubbling voronoi cells, a bright meniscus and a strike ring.
 *    Normal-blended, so they *darken* the floor before they light it.
 *  - **the seed** — the spat gob: lit, fresnel-rimmed, with venom swirling in.
 *  - **the haze** — `LAYER.DISTORTION` shimmer over the main pool.
 *
 * Every material reads `settings.venomMimicry` in `userData.sync(...)`.
 */

const ID = config.id;
const cfg = () => settings[ID] ?? config.settings;

/* -------------------------------------------------------------------- */
/* The serpent                                                          */
/* -------------------------------------------------------------------- */

const SERPENT_VERTEX = /* glsl */ `
  attribute float aPart;
  attribute vec3 aHood;   // across −1..1, along 0..1, side −1 back / +1 front
  attribute vec4 aPose;   // lean, curl, sway amplitude, sway phase
  attribute vec4 aLife;   // emerged, flare, flash, seed
  attribute vec4 aSize;   // length (m), sink (m), glow gain, girth

  uniform float uHoodSpan;
  uniform float uHoodCup;
  uniform float uHoodFold;
  uniform float uHoodBreath;
  uniform float uSideWave;
  uniform float uTail;      // fraction of the body that lies on the floor
  uniform float uTailLen;
  uniform float uTailAngle;
  uniform float uTailWave;

  varying float vPart;
  varying vec3  vHood;
  varying vec4  vLife;
  varying float vS;
  varying float vAround;
  varying float vGain;

  vec3 vmPos;
  vec3 vmNormal;

  float vmAngle(float s) {
    return aPose.x * s + aPose.y * s * s + aPose.z * sin(s * 8.17 - aPose.w) * s;
  }

  // Centreline at arclength t, unit length: x forward (the bite), y up.
  vec2 vmCentre(float t) {
    float dt = t / 12.0;
    vec2 prev = vec2(sin(vmAngle(0.0)), cos(vmAngle(0.0)));
    vec2 acc = vec2(0.0);
    for (int i = 1; i <= 12; i++) {
      float a = vmAngle(dt * float(i));
      vec2 cur = vec2(sin(a), cos(a));
      acc += (prev + cur) * 0.5 * dt;
      prev = cur;
    }
    return acc;
  }

  // The hood, in spine space: (belly offset, s, lateral offset).
  vec3 vmHood(float b, float v, float side) {
    // Broad and flat-topped like a cobra's: widest just above the middle.
    // A flat shield: broad from low on the neck, rounded at the crown.
    // Long taper out of the neck, widest two-thirds up, cut off square-ish
    // under the head so the head rises clear of it: a shield, not a bulb.
    float w = uHoodSpan * pow(smoothstep(0.0, 0.66, v), 0.75) * (1.0 - 0.8 * smoothstep(0.7, 1.0, v));
    float flare = mix(uHoodFold, 1.0, aLife.y) * (1.0 + uHoodBreath * sin(aPose.w * 0.5) * aLife.y);
    float lateral = b * w * flare;
    // Behind the neck, edges wrapping forward round it, ribs corrugating it.
    float x = -0.05 * aSize.w + uHoodCup * b * b * w * flare - 0.025 * sin(3.14159265 * v) * flare;
    x += 0.002 * sin(b * 3.14159265 * 4.5) * flare;
    float thick = 0.008 * (1.0 - b * b) * sin(3.14159265 * v) + 0.002;
    x += side * thick * 0.5;
    return vec3(x, 0.36 + 0.5 * v, lateral);
  }

  void vmVertex() {
    vec3 off;
    vec3 n;
    float s;
    if (aPart > 0.5 && aPart < 1.5) {
      vec3 p = vmHood(aHood.x, aHood.y, aHood.z);
      float e = 0.01;
      vec3 db = vmHood(aHood.x + e, aHood.y, aHood.z) - vmHood(aHood.x - e, aHood.y, aHood.z);
      vec3 dv = vmHood(aHood.x, min(aHood.y + e, 1.0), aHood.z) - vmHood(aHood.x, max(aHood.y - e, 0.0), aHood.z);
      n = normalize(cross(db, dv) + 1e-6) * -aHood.z;
      off = vec3(p.x, 0.0, p.z);
      s = p.y;
    } else {
      s = (position.y - uTail) / (1.0 - uTail);
      off = vec3(position.x, 0.0, position.z) * aSize.w;
      n = normal;
      if (s < 0.0) {
        // The coil: lying on the floor, trailing back and aside in an S.
        float L0 = aSize.x;
        float q = -s * (1.0 - uTail) / uTail;            // 0 at the base, 1 at the tip
        float sideSign = fract(aLife.w * 7.0) > 0.5 ? 1.0 : -1.0;
        vec3 back = vec3(-cos(uTailAngle), 0.0, sin(uTailAngle) * sideSign);
        vec3 perp = vec3(-back.z, 0.0, back.x);
        float Lt = uTailLen * L0;
        float ph = aPose.w * 0.6;
        vec3 p0 = back * q * Lt + perp * Lt * uTailWave * sin(q * 5.0 + ph) * q;
        float q2 = q + 0.01;
        vec3 p1 = back * q2 * Lt + perp * Lt * uTailWave * sin(q2 * 5.0 + ph) * q2;
        vec3 Tt = normalize(p1 - p0);
        vec3 Nt = vec3(0.0, -1.0, 0.0);
        vec3 Bt = normalize(cross(Tt, Nt));
        float lie = 0.074 * aSize.w * L0 * (0.18 + 0.82 * smoothstep(0.0, 0.22, position.y));
        vmPos = p0 + vec3(0.0, lie - aSize.y, 0.0) + Nt * off.x * L0 + Bt * off.z * L0;
        vmNormal = normalize(Nt * n.x - Tt * n.y + Bt * n.z);
        vPart = aPart; vHood = aHood; vLife = aLife; vS = position.y; vGain = aSize.z;
        vAround = atan(position.z, position.x);
        return;
      }
    }
    float th = vmAngle(s);
    vec3 T = vec3(sin(th), cos(th), 0.0);
    vec3 N = vec3(cos(th), -sin(th), 0.0);
    vec2 c = vmCentre(s);
    float L = aSize.x;
    // A sideways S travelling down the spine, so it weaves even seen from behind.
    float side = uSideWave * sin(s * 5.0 - aPose.w * 0.8) * smoothstep(0.0, 0.25, s) * (1.0 - 0.5 * s);
    vmPos = vec3(c.x * L, c.y * L - aSize.y, side * L) + N * off.x * L + vec3(0.0, 0.0, off.z * L);
    vmNormal = normalize(N * n.x + T * n.y + vec3(0.0, 0.0, n.z));
    vPart = aPart;
    vHood = aHood;
    vLife = aLife;
    vS = position.y;
    vAround = atan(position.z, position.x);
    vGain = aSize.z;
  }
`;

const SERPENT_VARYINGS = /* glsl */ `
  varying float vPart;
  varying vec3  vHood;
  varying vec4  vLife;
  varying float vS;
  varying float vAround;
  varying float vGain;
`;

const SERPENT_SKIN = /* glsl */ `
  {
    vec3 V = normalize(vViewPosition);
    float ndv = clamp(abs(dot(normal, V)), 0.0, 1.0);
    float rim = pow(1.0 - ndv, 3.0);
    float seed = vLife.w;
    vec3 base;
    vec3 glow = vec3(0.0);
    float rough = uRoughness;

    if (vPart < 0.5) {
      /* --- the body: scales, a pale belly, coral-snake warning bands --- */
      float ventral = 0.5 + 0.5 * cos(vAround);
      vec2 cell = voronoi2(vec2(vAround * 0.159 * uScaleSize, vS * uScaleSize * 3.2 + seed * 13.0));
      float seam = smoothstep(0.42, 0.72, cell.x);
      float f = fract(vS * uBandCount + 0.3);
      float d = abs(f - 0.5);
      float soft = 0.07 * (1.0 - uBandSharp) + 0.006;
      float black = 1.0 - smoothstep(0.19, 0.19 + soft, d);
      float violet = 1.0 - smoothstep(0.09, 0.09 + soft, d);
      // The bands only run down the back and flanks, never the belly.
      float flank = 1.0 - smoothstep(0.62, 0.95, ventral);
      // Dark, scaled, lit by the sun: the deep tone carries the back.
      base = mix(uColorScale, uColorDeep * 1.4, (1.0 - ventral) * 0.75);
      base *= mix(1.0, 0.45, seam) * (0.8 + 0.35 * cell.y);
      base = mix(base, uColorDeep, black * flank);
      base = mix(base, uColorBand, violet * flank);
      base = mix(base, uColorBelly * 0.7, smoothstep(0.6, 1.0, ventral) * 0.85);
      // Venom pulses climb the spine toward the fangs.
      float pulse = pow(max(0.0, sin((vS * 3.0 - uTime * 1.7 + seed) * 6.2831853)), 6.0);
      glow = uColorBand * violet * flank * uSkinGlow * (0.5 + 1.8 * pulse);
      rough = uRoughness * mix(1.0, 0.55, ventral);
    } else if (vPart < 1.5) {
      /* --- the hood --- */
      float b = vHood.x;
      float v = vHood.y;
      float rib = pow(abs(cos(b * 3.14159265 * 4.5)), 10.0);
      if (vHood.z < 0.0) {
        // The back: deep violet-black skin, green ribs and the false eyes.
        // Dark mottled scale, a green margin — no segment stripes.
        vec2 hc = voronoi2(vec2(b * 9.0, v * 12.0) * uScaleSize / 28.0);
        base = mix(uColorDeep * 1.4, uColorScale * 0.5, 0.25 * smoothstep(0.4, 0.7, hc.x) + 0.45 * smoothstep(0.7, 1.0, abs(b)));
        vec2 e = vec2(abs(b) - 0.46, (v - 0.6) * 0.85);
        float er = length(e) / max(0.02, uEyeSize);
        float pupil = 1.0 - smoothstep(0.26, 0.34, er);
        float iris = (1.0 - smoothstep(0.62, 0.72, er)) - pupil;
        float ring = (1.0 - smoothstep(0.9, 0.98, er)) - (1.0 - smoothstep(0.72, 0.8, er));
        float outline = (1.0 - smoothstep(1.1, 1.22, er)) - (1.0 - smoothstep(0.98, 1.06, er));
        // The spectacle mark that joins them, low on the hood.
        float spec = (1.0 - smoothstep(0.03, 0.06, abs(abs(b) * 0.9 - (0.62 - v) * 0.8))) *
                     smoothstep(0.25, 0.4, v) * (1.0 - smoothstep(0.55, 0.62, v));
        base = mix(base, uColorDeep * 0.25, clamp(outline + pupil, 0.0, 1.0));
        base = mix(base, uColorEye, iris);
        base = mix(base, uColorEyeRing, ring + spec * 0.8);
        float blink = 0.8 + 0.2 * sin(uTime * 3.1 + seed * 6.0);
        glow = (uColorEye * iris + uColorEyeRing * (ring * 0.7 + spec * 0.5)) * uEyeGlow * blink * (0.25 + 0.75 * vLife.y)
             + uColorBand * rib * uSkinGlow * 0.0;
      } else {
        // The front: pale transverse plates, as a cobra's throat.
        float plate = smoothstep(0.02, 0.16, abs(fract(v * 11.0) - 0.5));
        base = mix(uColorBelly * 0.85, uColorScale, smoothstep(0.3, 1.0, abs(b))) * mix(0.55, 1.0, plate);
        glow = vec3(0.0);
      }
      // The membrane thins and lights up toward its edge.
      glow += uColorBand * smoothstep(0.85, 1.0, abs(b)) * uSkinGlow * 0.25;
      rough = uRoughness * 0.85;
    } else {
      /* --- fangs: wet bone, venom-lit tips --- */
      base = uColorBelly * 1.05;
      glow = uColorEye * smoothstep(0.45, 1.0, vHood.y) * 1.6;
      rough = 0.18;
    }

    diffuseColor.rgb = base;
    roughnessFactor = clamp(rough, 0.04, 1.0);
    glow += uColorScale * rim * uRimGlow;
    // The strike floods the skin with venom light, saturated, never white.
    glow += mix(uColorScale, uColorEyeRing, 0.6) * vLife.z * uFlashGlow * (0.4 + 0.6 * rim + 0.4 * (1.0 - ndv));
    glow *= uGlow * vGain;
    glow /= 1.0 + glow * 0.18;
    totalEmissiveRadiance += glow;
  }
`;

/**
 * The serpent's lit skin. `material.userData.depth` is the shadow material
 * that reproduces the bend; give it to the mesh as `customDepthMaterial`.
 */
export function createSerpentMaterial() {
  const uniforms = {
    uTime: frame.uTime,
    uHoodSpan: { value: 0.3 },
    uHoodCup: { value: 0.35 },
    uHoodFold: { value: 0.22 },
    uHoodBreath: { value: 0.12 },
    uSideWave: { value: 0.07 },
    uTail: { value: 0.3 },
    uTailLen: { value: 0.85 },
    uTailAngle: { value: 0.8 },
    uTailWave: { value: 0.24 },
    uRoughness: { value: 0.36 },
    uScaleSize: { value: 28 },
    uBandCount: { value: 11 },
    uBandSharp: { value: 0.55 },
    uSkinGlow: { value: 0.55 },
    uEyeSize: { value: 0.2 },
    uEyeGlow: { value: 3.2 },
    uRimGlow: { value: 1.1 },
    uFlashGlow: { value: 3.5 },
    uGlow: { value: 1 },
    uColorScale: { value: new Color() },
    uColorDeep: { value: new Color() },
    uColorBelly: { value: new Color() },
    uColorBand: { value: new Color() },
    uColorEye: { value: new Color() },
    uColorEyeRing: { value: new Color() },
  };
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.36, metalness: 0.06, side: DoubleSide });
  patchOnBeforeCompile(
    material,
    (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${SERPENT_VERTEX}`)
        .replace('#include <beginnormal_vertex>', 'vmVertex();\nvec3 objectNormal = vmNormal;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif')
        .replace('#include <begin_vertex>', 'vec3 transformed = vmPos;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform float uRoughness;
           uniform float uScaleSize;
           uniform float uBandCount;
           uniform float uBandSharp;
           uniform float uSkinGlow;
           uniform float uEyeSize;
           uniform float uEyeGlow;
           uniform float uRimGlow;
           uniform float uFlashGlow;
           uniform float uGlow;
           uniform vec3 uColorScale;
           uniform vec3 uColorDeep;
           uniform vec3 uColorBelly;
           uniform vec3 uColorBand;
           uniform vec3 uColorEye;
           uniform vec3 uColorEyeRing;
           ${SERPENT_VARYINGS}
           ${noiseGLSL}`,
        )
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${SERPENT_SKIN}`);
    },
    'venom-mimicry-serpent',
  );

  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: DoubleSide });
  patchOnBeforeCompile(
    depth,
    (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${SERPENT_VERTEX}`)
        .replace('#include <begin_vertex>', 'vmVertex();\nvec3 transformed = vmPos;');
    },
    'venom-mimicry-serpent-depth',
  );

  material.userData.uniforms = uniforms;
  material.userData.depth = depth;
  material.userData.sync = () => {
    const c = cfg();
    const g = settings.global;
    const u = uniforms;
    u.uHoodSpan.value = 0.3 * c.hoodWidth;
    u.uHoodCup.value = c.hoodCup;
    u.uHoodFold.value = c.hoodFold;
    u.uHoodBreath.value = c.hoodBreath * g.turbulence;
    u.uSideWave.value = c.sideWave * g.turbulence;
    u.uTailLen.value = c.tailLength;
    u.uTailAngle.value = c.tailAngle;
    u.uTailWave.value = c.tailWave;
    u.uRoughness.value = c.roughness;
    u.uScaleSize.value = c.scaleSize * g.noiseFrequency;
    u.uBandCount.value = c.bandCount;
    u.uBandSharp.value = c.bandSharp;
    u.uSkinGlow.value = c.skinGlow * g.shaderIntensity;
    u.uEyeSize.value = c.eyeSize;
    u.uEyeGlow.value = c.eyeGlow * g.shaderIntensity;
    u.uRimGlow.value = c.rimGlow * g.fresnel;
    u.uFlashGlow.value = c.flashGlow * g.explosionIntensity;
    u.uGlow.value = g.glow;
    u.uColorScale.value.copy(getColor(c.colorScale));
    u.uColorDeep.value.copy(getColor(c.colorDeep));
    u.uColorBelly.value.copy(getColor(c.colorBelly));
    u.uColorBand.value.copy(getColor(c.colorBand));
    u.uColorEye.value.copy(getColor(c.colorEye));
    u.uColorEyeRing.value.copy(getColor(c.colorEyeRing));
    material.metalness = c.metalness;
    material.roughness = c.roughness;
    material.opacity = 1;
  };
  material.userData.sync();
  return material;
}

/* -------------------------------------------------------------------- */
/* Venom threads                                                        */
/* -------------------------------------------------------------------- */

const THREAD_VERTEX = /* glsl */ `
  attribute vec4 aFrom;  // start, grown
  attribute vec4 aTo;    // end, brightness
  uniform float uWidth;
  uniform float uArc;
  varying float vT;
  varying float vBright;
  varying float vGrow;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  vec3 arcAt(float t) {
    vec3 p = mix(aFrom.xyz, aTo.xyz, t);
    p.y += uArc * 4.0 * t * (1.0 - t);
    return p;
  }

  void main() {
    float grow = clamp(aFrom.w, 0.0, 1.0);
    float t = position.x * grow;
    vec3 p = arcAt(t);
    vec3 T = normalize(arcAt(min(t + 0.01, 1.0)) - arcAt(max(t - 0.01, 0.0)) + vec3(1e-5));
    vec3 S = normalize(cross(T, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
    vec3 U = cross(S, T);
    vec3 n = normalize(U * position.y + S * position.z);
    // Thin at the root, a swollen bead of venom at the growing tip.
    float r = uWidth * (0.45 + 0.55 * smoothstep(0.0, 0.25, position.x));
    r += uWidth * 0.9 * exp(-pow((position.x - 1.0) / 0.07, 2.0)) * (1.0 - smoothstep(0.85, 1.0, grow));
    r *= step(0.001, grow);
    vec4 world = modelMatrix * vec4(p + n * r, 1.0);
    vT = t;
    vBright = aTo.w;
    vGrow = grow;
    vNormalW = n;
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const THREAD_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFlow;
  uniform float uBeads;
  uniform float uGlowGain;
  uniform float uOpacity;
  uniform float uShaderIntensity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uColorD;
  varying float vT;
  varying float vBright;
  varying float vGrow;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    if (vBright <= 0.001 || vGrow <= 0.001) discard;
    float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    float core = pow(ndv, 1.5);
    // Beads flowing from the infector to the infected.
    float bead = pow(max(0.0, sin((vT * uBeads - uTime * uFlow) * 6.2831853)), 5.0);
    float n = snoise(vec3(vT * 9.0, uTime * 1.3, 0.0)) * 0.5 + 0.5;
    float x = clamp(0.2 + core * 0.45 + bead * 0.55 * uShaderIntensity + n * 0.12, 0.0, 1.0);
    vec3 col = gradient4(uColorD, uColorC, uColorB, uColorA, x);
    col *= 0.6 + (bead * 1.5 + core * 0.4) * uGlowGain;
    float a = clamp(0.55 + core * 0.45, 0.0, 1.0) * vBright * uOpacity;
    gl_FragColor = vec4(col, a);
  }
`;

export function createThreadMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 0.08 },
      uArc: { value: 1.6 },
      uFlow: { value: 2.2 },
      uBeads: { value: 6 },
      uGlowGain: { value: 1 },
      uOpacity: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorD: { value: new Color() },
    }),
    vertexShader: THREAD_VERTEX,
    fragmentShader: THREAD_FRAGMENT,
  });
  material.userData.sync = () => {
    const c = cfg();
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = c.threadWidth;
    u.uArc.value = c.threadArc;
    u.uFlow.value = c.threadFlow * g.animationSpeed;
    u.uBeads.value = c.threadBeads;
    u.uGlowGain.value = c.threadGlow * g.glow;
    u.uOpacity.value = g.opacity;
    u.uColorA.value.copy(getColor(c.colorDripB));
    u.uColorB.value.copy(getColor(c.colorScale));
    u.uColorC.value.copy(getColor(c.colorBand));
    u.uColorD.value.copy(getColor(c.colorPoolD));
  };
  material.userData.sync();
  return material;
}

/* -------------------------------------------------------------------- */
/* The pools                                                            */
/* -------------------------------------------------------------------- */

const POOL_VERTEX = /* glsl */ `
  attribute vec4 aPool;  // grown, dry, seed, ring progress
  varying vec2 vUv;
  varying vec4 vPool;
  void main() {
    vUv = uv;
    vPool = aPool;
    vec4 local = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
    #endif
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * local;
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlowGain;
  uniform float uVeins;
  uniform float uOpacity;
  uniform float uNoiseScale;
  uniform float uShaderIntensity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uColorD;
  varying vec2 vUv;
  varying vec4 vPool;
  ${noiseGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    float seed = vPool.z;
    float edge = fbm3(vec3(q * 2.1 * uNoiseScale, seed * 7.3));
    float radius = vPool.x * (0.8 + 0.2 * edge) * 0.98;
    float inside = 1.0 - smoothstep(radius - 0.06, radius, r);
    if (inside < 0.003 || vPool.x <= 0.001) discard;
    float depth = 1.0 - smoothstep(0.0, max(radius, 0.01), r);
    float mottle = fbm3(vec3(q * 3.0 * uNoiseScale, seed * 3.1 + uTime * 0.05)) * 0.5 + 0.5;
    vec3 col = mix(uColorC * 0.55, uColorD, clamp(depth * 0.75 + mottle * 0.35, 0.0, 1.0));
    // Veins: ridged noise, creeping slowly outward.
    vec3 vp = vec3(q * 3.4 * uNoiseScale + seed * 5.0, uTime * 0.12);
    float vein = pow(1.0 - abs(snoise(vp)), 14.0) + 0.6 * pow(1.0 - abs(snoise(vp * 2.1 + 3.7)), 18.0);
    vein *= smoothstep(radius * 1.02, radius * 0.35, r);
    // Bubbles rising through it.
    vec2 cellP = q * 7.0 * uNoiseScale + vec2(seed * 9.0, -uTime * 0.35);
    vec2 vo = voronoi2(cellP);
    float pop = fract(vo.y * 7.0 + uTime * 0.6);
    float bubble = (1.0 - smoothstep(0.08, 0.2, vo.x)) * step(0.72, vo.y) * smoothstep(0.0, 0.3, pop) * (1.0 - pop);
    bubble *= 1.0 - smoothstep(radius * 0.8, radius, r);
    // The wet meniscus at the edge.
    float rim = smoothstep(radius - 0.14, radius - 0.03, r) * inside;
    // A ring runs out on a strike.
    float ringR = vPool.w * radius;
    float ring = vPool.w > 0.0 ? exp(-pow((r - ringR) / 0.05, 2.0)) * (1.0 - vPool.w) : 0.0;
    float dry = clamp(vPool.y, 0.0, 1.0);
    vec3 glow = uColorB * vein * uVeins * 1.5 + uColorA * bubble * 1.4 + uColorB * rim * 0.7 + uColorA * ring * 2.4;
    glow *= uGlowGain * uShaderIntensity * (1.0 - dry);
    col = mix(col, uColorD, dry * 0.4);
    float a = inside * uOpacity * (0.82 + 0.18 * depth) * (1.0 - dry);
    gl_FragColor = vec4(col + glow, a);
  }
`;

export function createPoolMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      uGlowGain: { value: 1 },
      uVeins: { value: 1 },
      uOpacity: { value: 0.9 },
      uNoiseScale: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorD: { value: new Color() },
    }),
    vertexShader: POOL_VERTEX,
    fragmentShader: POOL_FRAGMENT,
  });
  material.userData.sync = () => {
    const c = cfg();
    const g = settings.global;
    const u = material.uniforms;
    u.uGlowGain.value = c.poolGlow * g.glow;
    u.uVeins.value = c.poolVeins * g.noiseStrength;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uNoiseScale.value = g.noiseFrequency;
    u.uColorA.value.copy(getColor(c.colorPoolA));
    u.uColorB.value.copy(getColor(c.colorPoolB));
    u.uColorC.value.copy(getColor(c.colorPoolC));
    u.uColorD.value.copy(getColor(c.colorPoolD));
  };
  material.userData.sync();
  return material;
}

/* -------------------------------------------------------------------- */
/* The seed                                                             */
/* -------------------------------------------------------------------- */

const SEED_VERTEX = /* glsl */ `
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

const SEED_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLightDir;
  uniform float uGlowGain;
  uniform float uFresnel;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uColorD;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float lambert = clamp(dot(N, normalize(uLightDir)), 0.0, 1.0);
    float swirl = fbm3(vLocal * 2.6 + vec3(0.0, uTime * 2.2, 0.0)) * 0.5 + 0.5;
    float fr = fresnelTerm(V, N, 2.5, 1.0) * uFresnel;
    vec3 body = gradient4(uColorD, uColorC, uColorB, uColorA, clamp(swirl * 0.7 + lambert * 0.25, 0.0, 1.0));
    vec3 col = body * (0.35 + 0.65 * lambert) + uColorA * pow(swirl, 4.0) * uGlowGain + uColorB * fr * uGlowGain * 0.8;
    // A wet highlight.
    vec3 H = normalize(normalize(uLightDir) + V);
    col += vec3(pow(clamp(dot(N, H), 0.0, 1.0), 60.0)) * 1.5;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createSeedMaterial() {
  const material = new ShaderMaterial({
    toneMapped: false,
    uniforms: sharedUniforms({
      uGlowGain: { value: 1 },
      uFresnel: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorD: { value: new Color() },
    }),
    vertexShader: SEED_VERTEX,
    fragmentShader: SEED_FRAGMENT,
  });
  material.userData.sync = () => {
    const c = cfg();
    const g = settings.global;
    const u = material.uniforms;
    u.uGlowGain.value = c.seedGlow * g.glow;
    u.uFresnel.value = g.fresnel;
    u.uColorA.value.copy(getColor(c.colorPoolA));
    u.uColorB.value.copy(getColor(c.colorDripB));
    u.uColorC.value.copy(getColor(c.colorPoolC));
    u.uColorD.value.copy(getColor(c.colorPoolD));
  };
  material.userData.sync();
  return material;
}

/* -------------------------------------------------------------------- */
/* The haze                                                             */
/* -------------------------------------------------------------------- */

const HAZE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const HAZE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    float mask = 1.0 - smoothstep(0.45, 1.0, r);
    vec3 np = vec3(q * 3.0 * uScale, uTime * 0.6);
    vec2 dir = vec2(snoise(np), snoise(np + vec3(4.1, 9.2, 1.7)));
    float strength = uStrength * uShaderIntensity * mask * (0.6 + 0.4 * snoise01(np * 0.5));
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, clamp(strength, 0.0, 1.0), mask);
  }
`;

/**
 * `LAYER.DISTORTION` disc. Opaque on purpose (see Borrowed Tomorrow's lens):
 * the warp buffer wants the proxy's own value.
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
      uStrength: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: HAZE_VERTEX,
    fragmentShader: HAZE_FRAGMENT,
  });
  /** @param {number} strength 0..1 envelope */
  material.userData.sync = (strength) => {
    const c = cfg();
    const g = settings.global;
    material.uniforms.uStrength.value = strength * c.hazeStrength * g.distortion;
    material.uniforms.uScale.value = g.noiseFrequency;
  };
  return material;
}
