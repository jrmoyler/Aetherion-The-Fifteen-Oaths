import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* ==================================================================== */
/* 1 · the capsules                                                       */
/* ==================================================================== */

/**
 * The capsule mines — one InstancedMesh.
 *
 * Per instance, `aMine = (polarity ±1, beacon 0..1, heat 0..1, fins 0..1)`.
 * Everything that changes per frame for one capsule lives in those four
 * numbers; the hull's shape comes from the shared blank and two uniforms.
 *
 * Vertex: the blank's radial coordinate is in girths, so `x/z × uGirth`
 * makes it fat or slim live. Fins (`aPart == 3`) swing about their hinge by
 * `fins × uFinSpread`, from folded flat against the hull in flight to splayed
 * into the floor once planted. A capsule about to go **swells** a few percent
 * with its heat.
 *
 * Fragment: gunmetal — sky reflection, specular, stencilled panel seams and a
 * hazard chevron band — with the **polarity band** at the waist lit red or
 * blue, the **beacon** blinking in the same colour, and the whole hull flaring
 * white-hot from the band outward in its last instant (`heat`).
 */
const MINE_VERTEX = /* glsl */ `
  attribute float aPart;
  attribute vec2  aFin;      // bearing, hinge height
  attribute vec4  aMine;     // polarity, beacon, heat, fins

  uniform float uGirth;
  uniform float uFinSpread;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vPart;
  varying vec4  vMine;

  void main() {
    vec3 p = position;
    vec3 n = normal;

    if (aPart > 2.5) {
      // Swing the fin about its hinge: tangent axis, angle down and out.
      vec2 dir = vec2(cos(aFin.x), sin(aFin.x));
      float radial = dot(p.xz, dir);
      vec2 tang = p.xz - dir * radial;
      float ang = -aMine.w * uFinSpread;
      float c = cos(ang), s = sin(ang);
      vec2 d = vec2(radial - 0.92, p.y - aFin.y);
      d = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
      radial = 0.92 + d.x;
      p = vec3(dir.x * radial + tang.x, aFin.y + d.y, dir.y * radial + tang.y);
      float nr = dot(n.xz, dir);
      vec2 nt = n.xz - dir * nr;
      vec2 nd = vec2(c * nr - s * n.y, s * nr + c * n.y);
      n = vec3(dir.x * nd.x + nt.x, nd.y, dir.y * nd.x + nt.y);
    }

    float swell = 1.0 + aMine.z * 0.08;
    p.xz *= uGirth * swell;
    n = normalize(vec3(n.x / max(uGirth, 1e-3), n.y, n.z / max(uGirth, 1e-3)));

    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(model) * n);
    vLocal = position;
    vPart = aPart;
    vMine = aMine;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const MINE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uReflect;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uPanel;
  uniform float uBandGlow;
  uniform float uBeaconGlow;
  uniform float uHeatGlow;
  uniform vec3  uColorHull;
  uniform vec3  uColorDeep;
  uniform vec3  uColorSpec;
  uniform vec3  uColorPos;
  uniform vec3  uColorNeg;
  uniform vec3  uColorHeat;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vPart;
  varying vec4  vMine;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    float pol = vMine.x;
    vec3 tint = pol > 0.0 ? uColorPos : uColorNeg;
    float beacon = vMine.y;
    float heat = vMine.z;

    /* --- gunmetal --- */
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;
    float fres = 0.25 + 0.75 * pow(1.0 - ndv, 5.0);
    float lambert = 0.3 + 0.7 * clamp(dot(N, L), 0.0, 1.0);
    vec3 metal = uColorHull * lambert + uColorHull * env * uReflect * fres;
    metal += uColorSpec * pow(clamp(dot(N, normalize(L + V)), 0.0, 1.0), uGloss) * uSpecular;
    metal += uColorDeep * 0.3;

    // Panel seams: four vertical and two horizontal, plus a hazard chevron
    // band just under the top cap.
    float az = atan(vLocal.z, vLocal.x) / 6.2831853 + 0.5;
    float y = vLocal.y;
    float seamV = 1.0 - smoothstep(0.004, 0.012, abs(fract(az * 4.0 + 0.125) - 0.5) * 0.25);
    float seamH = 1.0 - smoothstep(0.004, 0.012, min(abs(y - 0.3), abs(y - 0.7)));
    float seam = max(seamV, seamH) * step(vPart, 0.5) * step(0.08, y) * step(y, 0.86);
    float chevron = step(0.5, fract(az * 16.0 + y * 6.0)) * step(0.72, y) * step(y, 0.8) * step(vPart, 0.5);
    vec3 color = mix(metal, uColorDeep, seam * uPanel);
    color = mix(color, mix(metal, tint * 0.6, 0.6), chevron * 0.7);

    /* --- the polarity band --- */
    if (vPart > 0.5 && vPart < 1.5) {
      float scroll = 0.6 + 0.4 * sin(az * 6.2831853 * 3.0 - uTime * 6.0 * pol);
      color = tint * uBandGlow * (0.5 + 0.5 * scroll) * (0.6 + beacon * 0.6) * uGlobalGlow + metal * 0.15;
    }

    /* --- the beacon --- */
    if (vPart > 1.5 && vPart < 2.5) {
      vec3 lens = mix(tint * 0.15, tint * uBeaconGlow, beacon);
      color = lens * uGlobalGlow + uColorSpec * pow(1.0 - ndv, 3.0) * 0.3;
    }

    /* --- fins --- */
    if (vPart > 2.5) color = metal * 0.8 + tint * 0.08;

    /* --- heat: white-hot from the band outward --- */
    float fromBand = abs(y - 0.47);
    float heatMask = smoothstep(heat * 0.8, heat * 0.8 - 0.2, fromBand) * step(0.001, heat);
    float crackle = 0.7 + 0.3 * snoise(vLocal * 9.0 + vec3(0.0, uTime * 8.0, 0.0));
    color += uColorHeat * heatMask * heat * uHeatGlow * crackle * uGlobalGlow;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createPolarityMineMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uGirth: { value: 0.32 },
      uFinSpread: { value: 0.5 },
      uReflect: { value: 1 },
      uGloss: { value: 80 },
      uSpecular: { value: 1.4 },
      uPanel: { value: 0.6 },
      uBandGlow: { value: 3 },
      uBeaconGlow: { value: 6 },
      uHeatGlow: { value: 5 },
      uColorHull: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorSpec: { value: new Color() },
      uColorPos: { value: new Color() },
      uColorNeg: { value: new Color() },
      uColorHeat: { value: new Color() }
    }),
    vertexShader: MINE_VERTEX,
    fragmentShader: MINE_FRAGMENT
  });
  material.userData.instanced = true;

  material.userData.sync = () => {
    const c = settings.polarity;
    const g = settings.global;
    const u = material.uniforms;
    u.uGirth.value = Math.max(0.05, c.mineGirth);
    u.uFinSpread.value = c.finSpread;
    u.uReflect.value = c.hullReflect;
    u.uGloss.value = c.hullGloss;
    u.uSpecular.value = c.hullSpecular;
    u.uPanel.value = c.panelLines;
    u.uBandGlow.value = c.bandGlow * g.glow;
    u.uBeaconGlow.value = c.beaconGlow * g.glow;
    u.uHeatGlow.value = c.heatGlow * g.glow;
    u.uColorHull.value.copy(getColor(c.colorHull));
    u.uColorDeep.value.copy(getColor(c.colorHullDeep));
    u.uColorSpec.value.copy(getColor(c.colorHullSpec));
    u.uColorPos.value.copy(getColor(c.colorPositive));
    u.uColorNeg.value.copy(getColor(c.colorNegative));
    u.uColorHeat.value.copy(getColor(c.colorHeat));
  };

  return material;
}

/* ==================================================================== */
/* 2 · the tethers                                                        */
/* ==================================================================== */

/**
 * Magnetic field lines — one instanced draw of camera-facing ribbons.
 *
 * Per instance: `aA`, `aB` (the two capsules' band points, world space) and
 * `aInfo = (form, snap, bow sign, seed)`.
 *
 * Vertex: a quadratic Bézier from A to B whose control point is pushed up and
 * sideways by `uBow × span` (the bow sign fans sibling lines of one tether
 * apart, like the lines between two real poles). Only the first `form` of
 * the curve is drawn as it reaches across; a tether whose capsule has gone
 * **snaps** — it shortens back toward the survivor and whips upward.
 *
 * Fragment: a hot core, a soft polarity-coloured sheath (red at the + end,
 * blue at the − end), and dashes **crawling** from + to − with a stuttering
 * electrical flicker. The reaching tip is a bright bead.
 */
const TETHER_VERTEX = /* glsl */ `
  attribute vec3 aA;
  attribute vec3 aB;
  attribute vec4 aInfo;    // form, snap, bow sign, seed

  uniform float uTime;
  uniform float uBow;
  uniform float uLift;
  uniform float uWidth;

  varying vec2  vUv;       // s along (0 at A), w across
  varying float vForm;
  varying float vSeed;
  varying float vSnap;

  vec3 bez(vec3 a, vec3 c, vec3 b, float t) {
    float u = 1.0 - t;
    return u * u * a + 2.0 * u * t * c + t * t * b;
  }

  void main() {
    float form = aInfo.x;
    float snap = aInfo.y;
    float sign = aInfo.z;
    vec3 a = aA;
    vec3 b = aB;
    vec3 d = b - a;
    float span = length(d);
    vec3 dir = d / max(span, 1e-4);
    vec3 side = normalize(cross(dir, vec3(0.0, 1.0, 0.0)) + vec3(1e-5));
    vec3 ctrl = (a + b) * 0.5
              + vec3(0.0, 1.0, 0.0) * span * uBow * (uLift + (1.0 - uLift) * abs(sign) * 0.5)
              + side * span * uBow * (1.0 - uLift) * sign;
    // A snapping tether whips up as it recoils.
    ctrl.y += snap * span * 0.6;

    float s = position.x * form * (1.0 - snap);
    vec3 p = bez(a, ctrl, b, s);
    vec3 p2 = bez(a, ctrl, b, min(s + 0.01, 1.0));
    vec3 tangent = normalize(p2 - p + vec3(1e-5));
    vec3 view = normalize(cameraPosition - p);
    vec3 across = normalize(cross(tangent, view) + vec3(1e-5));
    p += across * position.y * uWidth * 0.5;

    vUv = vec2(s, position.y);
    vForm = form * (1.0 - snap);
    vSeed = aInfo.w;
    vSnap = snap;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const TETHER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uFlowDensity;
  uniform float uFlowSharp;
  uniform float uGlow;
  uniform float uFlicker;
  uniform float uOpacity;
  uniform vec3  uColorPos;
  uniform vec3  uColorNeg;
  uniform vec3  uColorCore;
  uniform float uGlobalGlow;

  varying vec2  vUv;
  varying float vForm;
  varying float vSeed;
  varying float vSnap;

  ${noiseGLSL}

  void main() {
    if (vForm <= 0.001) discard;
    float s = vUv.x;
    float w = abs(vUv.y);
    float core = exp(-w * w * 40.0);
    float sheath = exp(-w * w * 4.0) * 0.45;

    float crawl = fract(s * uFlowDensity - uTime * uFlowSpeed + vSeed * 7.0);
    float dash = smoothstep(uFlowSharp, 1.0, crawl) * 1.4;
    float jitter = 1.0 - uFlicker * step(0.7, hash11(floor(uTime * 24.0) + vSeed * 13.0));
    float tip = exp(-pow((s - vForm) / 0.03, 2.0)) * (1.0 - step(0.999, vForm)) * 3.0;
    float ends = smoothstep(0.0, 0.04, s) * smoothstep(0.0, 0.04, vForm - s + 0.04);

    vec3 pol = mix(uColorPos, uColorNeg, smoothstep(0.1, 0.9, s));
    vec3 color = pol * sheath + mix(pol, uColorCore, 0.75) * core * (0.55 + dash) + uColorCore * tip;
    color *= jitter * (1.0 + vSnap * 2.0);
    float alpha = clamp(sheath + core * (0.6 + dash) + tip, 0.0, 1.0) * ends * uOpacity * jitter;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uGlow * uGlobalGlow, alpha);
  }
`;

export function createPolarityTetherMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uBow: { value: 0.4 },
      uLift: { value: 0.4 },
      uWidth: { value: 0.07 },
      uFlowSpeed: { value: 1.5 },
      uFlowDensity: { value: 7 },
      uFlowSharp: { value: 0.55 },
      uGlow: { value: 2.5 },
      uFlicker: { value: 0.3 },
      uOpacity: { value: 1 },
      uColorPos: { value: new Color() },
      uColorNeg: { value: new Color() },
      uColorCore: { value: new Color() }
    }),
    vertexShader: TETHER_VERTEX,
    fragmentShader: TETHER_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.polarity;
    const g = settings.global;
    const u = material.uniforms;
    u.uBow.value = c.tetherBow;
    u.uLift.value = c.tetherLift;
    u.uWidth.value = c.tetherWidth;
    u.uFlowSpeed.value = c.flowSpeed * g.animationSpeed;
    u.uFlowDensity.value = c.flowDensity;
    u.uFlowSharp.value = c.flowSharp;
    u.uGlow.value = c.tetherGlow * g.glow;
    u.uFlicker.value = c.tetherFlicker * g.randomness;
    u.uOpacity.value = g.opacity;
    u.uColorPos.value.copy(getColor(c.colorPositive));
    u.uColorNeg.value.copy(getColor(c.colorNegative));
    u.uColorCore.value.copy(getColor(c.colorTetherCore));
  };

  return material;
}

/* ==================================================================== */
/* 3 · the detonation flares                                              */
/* ==================================================================== */

/**
 * The instant a capsule goes: a camera-facing star with `uSpikes` hard
 * spikes, a white core and a polarity-tinted halo, all collapsing over its
 * short life. Instanced; per instance `aCentre` and `aFlare = (age 0..1,
 * size, polarity, seed)`.
 */
const FLARE_VERTEX = /* glsl */ `
  attribute vec3 aCentre;
  attribute vec4 aFlare;

  varying vec2  vLocal;
  varying vec4  vFlare;

  void main() {
    vLocal = position.xy * 2.0;
    vFlare = aFlare;
    float alive = step(0.0, aFlare.x) * step(aFlare.x, 1.0);
    vec4 mv = viewMatrix * vec4(aCentre, 1.0);
    mv.xy += position.xy * aFlare.y * 2.0 * alive;
    gl_Position = projectionMatrix * mv;
  }
`;

const FLARE_FRAGMENT = /* glsl */ `
  uniform float uSpikes;
  uniform float uGlow;
  uniform vec3  uColorCore;
  uniform vec3  uColorPos;
  uniform vec3  uColorNeg;
  uniform float uGlobalGlow;

  varying vec2  vLocal;
  varying vec4  vFlare;

  ${noiseGLSL}

  void main() {
    float age = vFlare.x;
    if (age < 0.0 || age > 1.0) discard;
    float r = length(vLocal);
    float ang = atan(vLocal.y, vLocal.x) + vFlare.w * 6.2831853;
    float k = 1.0 - age;
    float spikes = pow(abs(cos(ang * floor(uSpikes + 0.5) * 0.5)), 24.0) * (1.0 - smoothstep(0.0, k, r));
    float core = exp(-r * r / max(0.02, 0.12 * k * k));
    float halo = exp(-r * 3.5) * k;
    vec3 tint = vFlare.z > 0.0 ? uColorPos : uColorNeg;
    vec3 color = uColorCore * (core * 2.0 + spikes) + tint * (halo + spikes * 0.4);
    float a = clamp(core + spikes + halo, 0.0, 1.0) * k;
    if (a < 0.003) discard;
    gl_FragColor = vec4(color * uGlow * uGlobalGlow * k, a);
  }
`;

export function createPolarityFlareMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSpikes: { value: 6 },
      uGlow: { value: 6 },
      uColorCore: { value: new Color() },
      uColorPos: { value: new Color() },
      uColorNeg: { value: new Color() }
    }),
    vertexShader: FLARE_VERTEX,
    fragmentShader: FLARE_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.polarity;
    const g = settings.global;
    const u = material.uniforms;
    u.uSpikes.value = c.flareSpikes;
    u.uGlow.value = c.flareGlow * g.glow * g.explosionIntensity;
    u.uColorCore.value.copy(getColor(c.colorFlareCore));
    u.uColorPos.value.copy(getColor(c.colorPositive));
    u.uColorNeg.value.copy(getColor(c.colorNegative));
  };

  return material;
}

/* ==================================================================== */
/* 3b · the shock lenses                                                  */
/* ==================================================================== */

/**
 * LAYER.DISTORTION: each detonation pushes one hard ring of warp outward, and
 * the lattice while armed hums with a faint magnetic shear between the poles
 * (a slow sideways ripple). Instanced; per instance `aCentre` and
 * `aLens = (age 0..1, size, strength, hum)`. Same output encoding as
 * `createAcidFumeMaterial`.
 */
const LENS_VERTEX = /* glsl */ `
  attribute vec3 aCentre;
  attribute vec4 aLens;

  varying vec2 vLocal;
  varying vec4 vLens;

  void main() {
    vLocal = position.xy * 2.0;
    vLens = aLens;
    vec4 mv = viewMatrix * vec4(aCentre, 1.0);
    mv.xy += position.xy * aLens.y * 2.0;
    gl_Position = projectionMatrix * mv;
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec2  uResolution;
  uniform float uShaderIntensity;

  varying vec2 vLocal;
  varying vec4 vLens;

  ${noiseGLSL}

  void main() {
    float len = length(vLocal);
    if (len > 1.0) discard;
    vec2 dir = vLocal / max(len, 1e-4);
    float age = vLens.x;
    float at = sqrt(clamp(age, 0.0, 1.0)) * 0.92;
    float ring = exp(-pow((len - at) / 0.08, 2.0)) * (1.0 - age) * vLens.z;
    vec2 offset = dir * ring;
    // The magnetic shear: a sideways ripple, only while the lattice holds.
    float hum = vLens.w * (1.0 - smoothstep(0.4, 1.0, len));
    offset += vec2(-dir.y, dir.x) * sin(len * 18.0 - uTime * 7.0) * hum;

    float strength = length(offset);
    float mask = 1.0 - smoothstep(0.85, 1.0, len);
    if (strength * mask < 0.002) discard;
    vec2 o = offset / max(strength, 1e-4);
    float aspect = max(uResolution.x, 1.0) / max(uResolution.y, 1.0);
    o.x /= aspect;
    gl_FragColor = vec4(o * 0.5 + 0.5, strength * uShaderIntensity, mask);
  }
`;

export function createPolarityLensMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({}),
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });
}

/* ==================================================================== */
/* the garden plot — a faint ring of field under the lattice              */
/* ==================================================================== */

/**
 * A ground quad: field-line arcs between the planted capsules drawn as an
 * iron-filings pattern — streaks aligned to a dipole-ish field built from the
 * capsule positions (up to 13, `uPoles = (x, z, charge, alive)` in quad
 * metres). Faint while the lattice forms, strongest when armed, burned away
 * by the cascade. It is what makes the trap read as a *field* rather than a
 * set of wires.
 */
const PLOT_VERTEX = /* glsl */ `
  uniform float uQuadSize;
  varying vec2 vLocal;
  void main() {
    vLocal = (uv - 0.5) * uQuadSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const MAX_POLES = 13;

const PLOT_FRAGMENT = /* glsl */ `
  #define MAX_POLES ${MAX_POLES}
  uniform float uTime;
  uniform float uRadius;
  uniform float uStrength;
  uniform vec4  uPoles[MAX_POLES];
  uniform vec3  uColorPos;
  uniform vec3  uColorNeg;
  uniform float uGlow;
  uniform float uGlobalGlow;

  varying vec2 vLocal;

  ${noiseGLSL}

  void main() {
    if (uStrength <= 0.001) discard;
    vec2 field = vec2(0.0);
    float potential = 0.0;
    for (int i = 0; i < MAX_POLES; i++) {
      vec4 p = uPoles[i];
      if (p.w <= 0.0) continue;
      vec2 d = vLocal - p.xy;
      float r2 = dot(d, d) + 0.04;
      field += p.z * p.w * d / (r2 * sqrt(r2));
      potential += p.z * p.w / sqrt(r2);
    }
    float mag = length(field);
    vec2 fdir = field / max(mag, 1e-4);
    // Iron filings: noise stretched along the field direction.
    vec2 along = vec2(dot(vLocal, fdir), dot(vLocal, vec2(-fdir.y, fdir.x)));
    float grain = snoise(vec3(along.x * 1.5, along.y * 22.0, 3.1));
    float filings = smoothstep(0.55, 0.95, grain) * clamp(mag * 0.6, 0.0, 1.0);
    // Equipotential contour lines, crawling.
    float contour = 1.0 - smoothstep(0.0, 0.08, abs(fract(potential * 1.2 - uTime * 0.4) - 0.5) * 2.0 - 0.85);
    contour *= 0.25;
    float r = length(vLocal);
    float disc = 1.0 - smoothstep(uRadius * 0.85, uRadius * 1.15, r);
    vec3 tint = mix(uColorNeg, uColorPos, smoothstep(-0.6, 0.6, potential));
    float light = (filings + contour) * disc * uStrength;
    if (light < 0.003) discard;
    gl_FragColor = vec4(tint * light * uGlow * uGlobalGlow, light);
  }
`;

export function createPolarityPlotMaterial() {
  const poles = [];
  for (let i = 0; i < MAX_POLES; i++) poles.push(new Vector4(0, 0, 0, 0));
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uQuadSize: { value: 8 },
      uRadius: { value: 3 },
      uStrength: { value: 0 },
      uPoles: { value: poles },
      uColorPos: { value: new Color() },
      uColorNeg: { value: new Color() },
      uGlow: { value: 1 }
    }),
    vertexShader: PLOT_VERTEX,
    fragmentShader: PLOT_FRAGMENT
  });

  /** @param {object} state { quadSize, radius, strength } — poles are written in place */
  material.userData.sync = (state) => {
    const c = settings.polarity;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuadSize.value = state.quadSize;
    u.uRadius.value = state.radius;
    u.uStrength.value = state.strength * g.opacity;
    u.uGlow.value = c.plotGlow * g.glow;
    u.uColorPos.value.copy(getColor(c.colorPositive));
    u.uColorNeg.value.copy(getColor(c.colorNegative));
  };

  return material;
}
