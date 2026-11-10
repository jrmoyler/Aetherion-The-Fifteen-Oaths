import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Symbiotic Exchange — the bespoke shaders.
 *
 *  - **the tendril** (`createTendrilMaterial`) — every root, the lifeline and
 *    the ally lines. Each vertex is placed in the vertex stage from parameter
 *    space: a quadratic arch from its start to its end, then (for a binding
 *    root) a helix that climbs round the bound body; a travelling writhe
 *    squirms it. Shaded opaque and lit: ridged bark with knots, a wrapped sun,
 *    a green fresnel rim, sap flowing in the grooves *toward the start* (into
 *    the heart for a root, down to the ally for a lifeline) — amber for taken
 *    vitality, green for given — a lime-hot grow tip, and a brown wither.
 *    Its twin `userData.depth` writes the same shape into the shadow map.
 *    CPU twin of the centreline: `tendrilPoint` in index.js.
 *  - **the heart** (`createHeartMaterial`) — the lobed pod: wrap-lit skin
 *    darkening into the lobe grooves, a translucent fresnel rim, a web of
 *    veins that flush on every beat and *fill from the root up* with the
 *    vitality the heart has banked (amber below the fill line, green where it
 *    has been converted), and a cup that glows from within. Also the seed.
 *  - **the root field** (`createFieldMaterial`) — the floor: a dark moss stain
 *    under radial root veins that spread out to the rim, beat rings running
 *    *in* along the veins toward the heart, a torn soil ring at the mound,
 *    noise dissolve on the exit.
 *  - **the sap bead** (`createBeadMaterial`) — a glowing drop with a hot
 *    core and a fresnel skin, amber → green by instance.
 *  - **the pulse** (`createPulseWarpMaterial`) — `LAYER.DISTORTION` disc: a
 *    pressure ring pushed through the air by each beat.
 *
 * Every material reads `settings.symbioticExchange` in `userData.sync(state)`;
 * `state` carries only what the ability knows that the settings do not.
 */

const ID = config.id;

/* ==================================================================== */
/* The tendril centreline — CPU twin: index.js `tendrilPoint`             */
/* ==================================================================== */

const TENDRIL_GLSL = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute vec4 aShape;   // arch height, thickness, coil (0/1), hue (0 taken .. 1 given)
  attribute vec4 aLife;    // grow 0..1, seed, flush, sideways bow

  uniform float uClock;
  uniform float uWritheAmp;
  uniform float uWritheFreq;
  uniform float uWritheSpeed;
  uniform float uWrapR;
  uniform float uWrapH;
  uniform float uWrapTurns;
  uniform float uWrapPortion;
  uniform float uRootR;
  uniform float uTipR;

  varying float vS;
  varying vec4  vShape;
  varying vec4  vLife;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vAround;

  vec3 bez(vec3 a, vec3 c, vec3 b, float t) {
    float m = 1.0 - t;
    return m * m * a + 2.0 * m * t * c + t * t * b;
  }

  vec3 centre(float s) {
    vec3 A = aStart;
    vec3 E = aEnd;
    vec3 chord = vec3(E.x - A.x, 0.0, E.z - A.z);
    float L = max(length(chord), 1e-3);
    vec3 dir = chord / L;
    vec3 side = vec3(-dir.z, 0.0, dir.x);
    float wrapP = aShape.z * uWrapPortion;
    float sb = 1.0 - wrapP;
    float a0 = atan(-dir.z, -dir.x);
    vec3 B = E + vec3(cos(a0), 0.0, sin(a0)) * uWrapR * aShape.z;
    vec3 C = mix(A, B, 0.5) + vec3(0.0, aShape.x, 0.0) + side * aLife.w;
    vec3 p;
    float env;
    if (s <= sb) {
      float t = s / sb;
      p = bez(A, C, B, t);
      env = sin(3.14159265 * t);
    } else {
      float k = (s - sb) / max(wrapP, 1e-3);
      float ang = a0 + k * uWrapTurns * 6.2831853;
      p = E + vec3(cos(ang) * uWrapR, k * uWrapH, sin(ang) * uWrapR);
      env = 0.0;
    }
    float ph = s * uWritheFreq * 6.2831853 - uClock * uWritheSpeed + aLife.y * 6.2831853;
    p += (side * sin(ph) + vec3(0.0, 0.6 * cos(ph * 0.7 + 1.3), 0.0)) * uWritheAmp * env;
    return p;
  }

  float radiusAt(float s) {
    float r = mix(uRootR, uTipR, pow(s, 0.6)) * aShape.y;
    r *= 1.0 + 0.14 * pow(max(0.0, sin(s * 38.0 + aLife.y * 20.0)), 6.0); // knots
    r *= clamp((aLife.x - s) / 0.07, 0.2, 1.0);                            // grow point
    return r;
  }

  vec3 placeTendril(out vec3 normalOut) {
    float s = min(position.x, aLife.x);
    vec3 c = centre(s);
    vec3 T = normalize(centre(s + 0.004) - centre(max(0.0, s - 0.004)) + vec3(1e-5, 0.0, 0.0));
    vec3 ref = abs(T.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 N = normalize(cross(T, ref));
    vec3 Bn = cross(N, T);
    vec3 n = N * position.y + Bn * position.z;
    normalOut = n;
    vS = position.x;
    vShape = aShape;
    vLife = aLife;
    vAround = atan(position.z, position.y);
    return c + n * radiusAt(s);
  }
`;

const TENDRIL_VERTEX = /* glsl */ `
  ${TENDRIL_GLSL}
  void main() {
    vec3 n;
    vec3 world = placeTendril(n);
    vNormalW = n;
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const TENDRIL_FRAGMENT = /* glsl */ `
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uClock;
  uniform vec3  uBark;
  uniform vec3  uBarkLight;
  uniform vec3  uBody;
  uniform vec3  uTint;
  uniform vec3  uCore;
  uniform vec3  uSap;
  uniform vec3  uWither;
  uniform float uAmbient;
  uniform float uDiffuse;
  uniform float uRim;
  uniform float uSapGlow;
  uniform float uSapSpeed;
  uniform float uRidges;
  uniform float uBump;
  uniform float uDry;
  uniform float uScale;

  varying float vS;
  varying vec4  vShape;
  varying vec4  vLife;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vAround;

  ${noiseGLSL}

  void main() {
    if (vS > vLife.x + 0.002) discard;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);

    // Bark: ridges running along the root, bent by noise, plus knot grain.
    float along = vS * 26.0 * uScale;
    float ridge = abs(sin(vAround * uRidges + snoise(vec3(along * 0.35, vAround, vLife.y * 9.0)) * 1.6 * uBump));
    float grain = snoise01(vec3(along, vAround * 3.0, vLife.y * 5.0));
    vec3 albedo = mix(uBark, uBarkLight, ridge * 0.75 + grain * 0.25);
    // Younger toward the tip: the bark greens.
    albedo = mix(albedo, uBody * 0.55, smoothstep(0.45, 1.0, vS) * 0.6);
    albedo = mix(albedo, uWither, uDry);

    float wrap = clamp(dot(N, L) * 0.6 + 0.4, 0.0, 1.0);
    vec3 color = albedo * (uAmbient + uDiffuse * wrap);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    color += uTint * fres * uRim * (1.0 - uDry) * 0.6;

    // Sap runs in the grooves toward s = 0 (into the heart / down to the ally).
    float groove = 1.0 - smoothstep(0.15, 0.6, ridge);
    float band = pow(0.5 + 0.5 * sin((vS * 9.0 + uClock * uSapSpeed + vLife.y) * 6.2831853), 6.0);
    vec3 sap = mix(uSap, uTint, vShape.w);
    float flow = groove * (band * 0.8 + 0.2) * (0.3 + 1.6 * vLife.z) * uSapGlow * uShaderIntensity * (1.0 - uDry);
    color += sap * flow;
    // A flush runs the whole root on a beat.
    color += mix(uSap, uCore, vShape.w) * vLife.z * 0.35 * (0.4 + groove);
    // The grow point burns lime-white while the root is still reaching.
    float tip = exp(-max(0.0, vLife.x - vS) * 45.0) * (1.0 - step(0.999, vLife.x));
    color += uCore * tip * 3.0 * (1.0 - uDry);

    gl_FragColor = vec4(color * uGlobalGlow, 1.0);
  }
`;

const TENDRIL_DEPTH_VERTEX = /* glsl */ `
  ${TENDRIL_GLSL}
  void main() {
    vec3 n;
    vec3 world = placeTendril(n);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const TENDRIL_DEPTH_FRAGMENT = /* glsl */ `
  #include <packing>
  varying float vS;
  varying vec4  vLife;
  void main() {
    if (vS > vLife.x + 0.002) discard;
    gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
  }
`;

/** The roots, lifeline and ally lines. Opaque, placed in the vertex stage — `LAYER.SHAPED`. */
export function createTendrilMaterial() {
  const material = new ShaderMaterial({
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uWritheAmp: { value: 0.1 },
      uWritheFreq: { value: 3 },
      uWritheSpeed: { value: 2.5 },
      uWrapR: { value: 0.36 },
      uWrapH: { value: 1.3 },
      uWrapTurns: { value: 2.2 },
      uWrapPortion: { value: 0.3 },
      uRootR: { value: 0.14 },
      uTipR: { value: 0.03 },
      uBark: { value: new Color() },
      uBarkLight: { value: new Color() },
      uBody: { value: new Color() },
      uTint: { value: new Color() },
      uCore: { value: new Color() },
      uSap: { value: new Color() },
      uWither: { value: new Color() },
      uAmbient: { value: 0.35 },
      uDiffuse: { value: 0.9 },
      uRim: { value: 0.8 },
      uSapGlow: { value: 2 },
      uSapSpeed: { value: 1.5 },
      uRidges: { value: 9 },
      uBump: { value: 0.6 },
      uDry: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: TENDRIL_VERTEX,
    fragmentShader: TENDRIL_FRAGMENT,
  });
  material.userData.depth = new ShaderMaterial({
    uniforms: material.uniforms,
    vertexShader: TENDRIL_DEPTH_VERTEX,
    fragmentShader: TENDRIL_DEPTH_FRAGMENT,
    side: DoubleSide,
  });
  /** @param {object} s { clock, dry } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uWritheAmp.value = c.writheAmp * g.turbulence;
    u.uWritheFreq.value = c.writheFreq * g.noiseFrequency;
    u.uWritheSpeed.value = c.writheSpeed * g.noiseSpeed;
    u.uWrapR.value = c.wrapRadius;
    u.uWrapH.value = c.wrapHeight;
    u.uWrapTurns.value = c.wrapTurns;
    u.uWrapPortion.value = Math.min(0.6, Math.max(0.05, c.wrapPortion));
    u.uRootR.value = Math.max(0.005, c.rootRadius);
    u.uTipR.value = Math.max(0.003, c.tipRadius);
    u.uBark.value.copy(getColor(c.colorBark));
    u.uBarkLight.value.copy(getColor(c.colorBarkLight));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uCore.value.copy(getColor(c.colorCore));
    u.uSap.value.copy(getColor(c.colorSap));
    u.uWither.value.copy(getColor(c.colorWither));
    u.uAmbient.value = 0.32;
    u.uDiffuse.value = c.tendrilDiffuse;
    u.uRim.value = c.tendrilRim * g.fresnel;
    u.uSapGlow.value = c.sapGlow * g.glow;
    u.uSapSpeed.value = c.sapSpeed * g.noiseSpeed;
    u.uRidges.value = c.barkRidges;
    u.uBump.value = c.barkBump * g.noiseStrength;
    u.uDry.value = s.dry;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}

/* ==================================================================== */
/* The heart (and the seed)                                              */
/* ==================================================================== */

const HEART_VERTEX = /* glsl */ `
  attribute float aLobe;
  attribute float aInside;
  varying vec3  vObj;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vLobe;
  varying float vInside;
  void main() {
    vObj = position;
    vLobe = aLobe;
    vInside = aInside;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const HEART_FRAGMENT = /* glsl */ `
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uClock;
  uniform float uBeat;       // 0..1 envelope of the current heartbeat
  uniform float uFill;       // 0..1 vitality banked, fills the veins from the root up
  uniform float uConvert;    // 0..1 how much of the fill has turned green (given)
  uniform float uDry;        // exit: the pod browns
  uniform float uGlow;
  uniform float uVeinGlow;
  uniform float uVeinScale;
  uniform float uFresnel;
  uniform float uAmbient;
  uniform float uScale;
  uniform vec3  uSkin;
  uniform vec3  uDeep;
  uniform vec3  uBody;
  uniform vec3  uTint;
  uniform vec3  uCore;
  uniform vec3  uSap;
  uniform vec3  uWither;

  varying vec3  vObj;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vLobe;
  varying float vInside;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float h = clamp(vObj.y, 0.0, 1.0);
    float ang = atan(vObj.z, vObj.x);

    // The cup: lit from within, hottest at its floor.
    if (!gl_FrontFacing || vInside > 0.5) {
      float depth = 1.0 - smoothstep(0.8, 0.98, h);
      vec3 cup = mix(uBody, uCore, depth * (0.5 + 0.5 * uBeat));
      cup = mix(cup, uWither * 0.4, uDry);
      gl_FragColor = vec4(cup * uGlow * (0.8 + 1.4 * uBeat) * uGlobalGlow, 1.0);
      return;
    }

    // Skin: dark in the lobe grooves, lighter on the crests, mottled.
    float mottle = fbm3(vec3(ang * 2.0, h * 6.0, 1.7) * uScale) * 0.5 + 0.5;
    vec3 albedo = mix(uDeep, uSkin, smoothstep(0.0, 0.7, vLobe));
    albedo = mix(albedo, uSkin * 1.6, mottle * 0.3 * vLobe);
    albedo = mix(albedo, uWither, uDry);
    float wrap = clamp(dot(N, L) * 0.55 + 0.45, 0.0, 1.0);
    vec3 color = albedo * (uAmbient + 0.85 * wrap);

    // Veins: ridged filaments wrapping the pod, denser at the belly.
    vec3 vp = vec3(cos(ang), h * 2.2, sin(ang)) * uVeinScale * uScale;
    float vein = pow(clamp(1.0 - abs(snoise(vp + vec3(0.0, -uClock * 0.05, 0.0))), 0.0, 1.0), 7.0);
    vein += pow(clamp(1.0 - abs(snoise(vp * 2.1 + 4.0)), 0.0, 1.0), 9.0) * 0.6;
    vein *= smoothstep(0.02, 0.15, h) * (1.0 - smoothstep(0.86, 0.95, h));
    // The banked vitality fills the veins from the root: amber, turning green.
    float filled = 1.0 - smoothstep(uFill - 0.04, uFill, h);
    vec3 fillCol = mix(uSap, uTint, smoothstep(uFill - 0.2 - (1.0 - uConvert), uFill, h) * uConvert + uConvert * 0.5);
    vec3 veinCol = mix(uBody, fillCol, filled);
    // A beat travels up the veins.
    float wave = exp(-pow((h - uBeat * 1.1 + 0.05) * 6.0, 2.0)) * step(0.01, uBeat);
    color += veinCol * vein * (0.25 + filled * 0.9 + wave * 1.6 + uBeat * 0.6) * uVeinGlow * uShaderIntensity * (1.0 - uDry);

    // Translucent flesh at the silhouette.
    float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.5);
    color += mix(uBody, uTint, uBeat) * fres * uFresnel * (0.6 + 0.8 * uBeat) * (1.0 - uDry * 0.8);

    gl_FragColor = vec4(color * uGlow * uGlobalGlow, 1.0);
  }
`;

/** The heart pod and the seed. Opaque, lit; `LAYER.WORLD`, casts shadows. */
export function createHeartMaterial() {
  const material = new ShaderMaterial({
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uBeat: { value: 0 },
      uFill: { value: 0 },
      uConvert: { value: 0 },
      uDry: { value: 0 },
      uGlow: { value: 1 },
      uVeinGlow: { value: 2 },
      uVeinScale: { value: 3 },
      uFresnel: { value: 1.5 },
      uAmbient: { value: 0.3 },
      uScale: { value: 1 },
      uSkin: { value: new Color() },
      uDeep: { value: new Color() },
      uBody: { value: new Color() },
      uTint: { value: new Color() },
      uCore: { value: new Color() },
      uSap: { value: new Color() },
      uWither: { value: new Color() },
    }),
    vertexShader: HEART_VERTEX,
    fragmentShader: HEART_FRAGMENT,
  });
  /** @param {object} s { clock, beat, fill, convert, dry } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uBeat.value = s.beat;
    u.uFill.value = s.fill;
    u.uConvert.value = s.convert;
    u.uDry.value = s.dry;
    u.uGlow.value = c.heartGlow * g.glow;
    u.uVeinGlow.value = c.heartVeinGlow * g.glow;
    u.uVeinScale.value = c.heartVeinScale;
    u.uFresnel.value = c.heartFresnel * g.fresnel;
    u.uAmbient.value = c.heartAmbient;
    u.uScale.value = g.noiseFrequency;
    u.uSkin.value.copy(getColor(c.colorSkin));
    u.uDeep.value.copy(getColor(c.colorDeep));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uCore.value.copy(getColor(c.colorCore));
    u.uSap.value.copy(getColor(c.colorSap));
    u.uWither.value.copy(getColor(c.colorWither));
  };
  return material;
}

/* ==================================================================== */
/* The root field                                                        */
/* ==================================================================== */

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const FIELD_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uGrow;       // 0..1 veins spread from the mound to the rim
  uniform float uBeat;       // 0..1 progress of the current beat ring (runs inward), -1 none
  uniform float uMound;      // mound radius as a fraction of the field
  uniform float uZone;       // zone radius as a fraction of the field
  uniform float uFade;
  uniform float uDissolve;
  uniform float uGlow;
  uniform float uStain;
  uniform float uDensity;
  uniform float uWidth;
  uniform float uRingWidth;
  uniform float uScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform vec3  uSap;
  varying vec2 vUv;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);

    // The spread front: ragged, out from the mound.
    float front = uGrow * 1.02 + (snoise(vec3(a * 3.0, 0.0, 2.1)) * 0.06);
    float reached = 1.0 - smoothstep(front - 0.08, front, r);

    // Radial root veins: noise stretched along the radius so filaments
    // radiate from the heart, a second finer octave for branching.
    vec2 q = vec2(a * uDensity * 1.6, log(max(r, 0.02)) * 1.2) * uScale;
    float n1 = snoise(vec3(q, 0.3));
    float n2 = snoise(vec3(q * 2.3 + 7.1, 1.7));
    float w = uWidth * (1.3 - r * 0.6);
    float vein = (1.0 - smoothstep(0.0, w, abs(n1))) + (1.0 - smoothstep(0.0, w * 0.6, abs(n2))) * 0.55 * smoothstep(0.25, 0.6, r);
    vein *= smoothstep(uMound * 0.7, uMound * 1.05, r) * reached;

    // Beat ring: runs in from the zone rim to the mound along the veins.
    float ringR = mix(uZone, uMound, uBeat);
    float ring = uBeat >= 0.0 ? exp(-pow((r - ringR) / max(uRingWidth, 0.01), 2.0)) * (1.0 - uBeat * 0.5) : 0.0;

    // Torn soil at the mound's foot.
    float torn = exp(-pow((r - uMound * 1.08) / 0.05, 2.0)) * (0.6 + 0.4 * snoise(vec3(a * 9.0, r * 5.0, 3.3)));

    // Moss stain, fading out past the zone.
    float stain = reached * (1.0 - smoothstep(uZone * 0.85, 1.0, r)) * (0.75 + 0.25 * fbm3(vec3(p * 3.0 * uScale, 4.0)));

    vec2 dm = dissolveMask(snoise01(vec3(p * 3.6, 9.1)), uDissolve, 0.08);
    float glow = (vein * (0.55 + ring * 2.5) + ring * 0.35) * uShaderIntensity;
    vec3 veinCol = gradient4(uCore, uTint, uBody, uDeep, 1.0 - clamp(glow * 0.8 + ring, 0.0, 1.0));
    vec3 col = mix(uDeep, veinCol * uGlow * uGlobalGlow, clamp(glow, 0.0, 1.0));
    col += uSap * dm.y * 2.0 + uBody * torn * 0.4;
    float alpha = clamp(stain * uStain + glow + torn * 0.5, 0.0, 1.0) * dm.x * uFade;
    gl_FragColor = vec4(col, alpha);
  }
`;

/** The floor under the heart. Normal-blended so the moss stain can darken. */
export function createFieldMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uGrow: { value: 0 },
      uBeat: { value: -1 },
      uMound: { value: 0.2 },
      uZone: { value: 0.85 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uGlow: { value: 1.5 },
      uStain: { value: 0.6 },
      uDensity: { value: 3.4 },
      uWidth: { value: 0.07 },
      uRingWidth: { value: 0.09 },
      uScale: { value: 1 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
      uSap: { value: new Color() },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: FIELD_FRAGMENT,
  });
  /** @param {object} s { clock, grow, beat, mound, zone, fade, dissolve } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uGrow.value = s.grow;
    u.uBeat.value = s.beat;
    u.uMound.value = s.mound;
    u.uZone.value = s.zone;
    u.uFade.value = s.fade * g.opacity;
    u.uDissolve.value = s.dissolve;
    u.uGlow.value = c.fieldGlow * g.glow;
    u.uStain.value = c.stainOpacity;
    u.uDensity.value = c.veinDensity;
    u.uWidth.value = c.veinWidth * g.noiseStrength;
    u.uRingWidth.value = c.beatRingWidth;
    u.uScale.value = g.noiseFrequency;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uDeep.value.copy(getColor(c.colorDeep));
    u.uSap.value.copy(getColor(c.colorSap));
  };
  return material;
}

/* ==================================================================== */
/* Sap beads                                                             */
/* ==================================================================== */

const BEAD_VERTEX = /* glsl */ `
  attribute float aHue;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vHue;
  void main() {
    vHue = aHue;
    mat4 model = modelMatrix * instanceMatrix;
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BEAD_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uFade;
  uniform float uGlobalGlow;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uSap;
  uniform vec3  uSapDeep;
  uniform vec3  uBody;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vHue;
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float facing = clamp(abs(dot(N, V)), 0.0, 1.0);
    // Hot core facing the eye, a coloured skin at the limb.
    vec3 skin = mix(mix(uSapDeep, uSap, facing), mix(uBody, uTint, facing), vHue);
    vec3 col = mix(skin, uCore * 1.6, pow(facing, 4.0));
    float a = (0.35 + 0.65 * facing) * uFade;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * a, a);
  }
`;

/** Glowing sap drops riding the roots. Additive. */
export function createBeadMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uGlow: { value: 3 },
      uFade: { value: 1 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uSap: { value: new Color() },
      uSapDeep: { value: new Color() },
      uBody: { value: new Color() },
    }),
    vertexShader: BEAD_VERTEX,
    fragmentShader: BEAD_FRAGMENT,
  });
  /** @param {object} s { fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.beadGlow * g.glow;
    u.uFade.value = s.fade * g.opacity;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uSap.value.copy(getColor(c.colorSap));
    u.uSapDeep.value.copy(getColor(c.colorSapDeep));
    u.uBody.value.copy(getColor(c.colorBody));
  };
  return material;
}

/* ==================================================================== */
/* The pulse (distortion)                                                */
/* ==================================================================== */

const PULSE_FRAGMENT = /* glsl */ `
  uniform float uWave;        // 0..1 ring radius
  uniform float uStrength;
  uniform float uWidth;
  uniform float uClock;
  uniform float uScale;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    vec2 radial = q / max(r, 1e-3);
    float ring = exp(-pow((r - uWave) / max(uWidth, 0.01), 2.0));
    vec3 np = vec3(q * 3.0 * uScale, uClock * 0.5);
    vec2 n = vec2(snoise(np), snoise(np + vec3(4.1, 2.7, 8.3))) * 0.25;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(ring * uStrength, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(radial + n, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` disc for the beat's pressure ring. Opaque on purpose so
 * the expansion's "transparent ⇒ VFX" routing never pulls it out of the warp
 * pass (same rule as Borrowed Tomorrow's lens).
 */
export function createPulseWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWave: { value: 0 },
      uStrength: { value: 0 },
      uWidth: { value: 0.12 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: PULSE_FRAGMENT,
  });
  /** @param {object} s { wave, strength, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uWave.value = s.wave;
    u.uStrength.value = s.strength * c.pulseWarp * g.distortion;
    u.uWidth.value = c.pulseWarpWidth;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
