import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Rime Halo — the five bespoke shaders.
 *
 *  - **needle ice** (`createNeedleMaterial`) — opaque, instanced, on
 *    `LAYER.WORLD`. A clear spear with a lit core: flat facets rebuilt from
 *    derivatives, an inner filament that runs root → tip and burns brightest
 *    at the point (bloom > 1), a fresnel rim, frost dusted on the upward
 *    faces, a white flash the instant a needle crystallises (`aState.y`),
 *    and a noise dissolve as it sublimes at the end (`aState.z`).
 *  - **the spine** (`createSpineMaterial`) — the ring the needles hang
 *    from. Additive. Its vertex stage rebuilds the torus from the live halo
 *    radius; its fragment stage draws a hot thread with pulses running round
 *    it, revealed only behind the walking head.
 *  - **the head** (`createGlintMaterial`) — a billboarded four-point star
 *    with a soft halo: what walks the rim and lays the needles down.
 *  - **the rime floor** (`createRimeFloorMaterial`) — the circle's floor
 *    frosting *inward* as the halo closes: the band the halo has swept is
 *    white rime streaked round the circle (the halo dragged it), a bright
 *    track under the ring, a crystal star where it closes, and sublimation.
 *  - **cold air** (`createColdBandMaterial`) — an open cylinder under the
 *    ring on `LAYER.DISTORTION`.
 *
 * Every material reads `settings.rimehalo` in `userData.sync()`.
 */

const KEY = 'rimehalo';

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* ==================================================================== */
/* Needle ice                                                             */
/* ==================================================================== */

const NEEDLE_VERTEX = /* glsl */ `
  attribute vec4 aState;   // seed, crystallise flash, dissolve, glow
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec4 vState;

  void main() {
    vLocal = position;
    vState = aState;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const NEEDLE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec3  uColorBody;
  uniform vec3  uColorCore;
  uniform vec3  uColorRim;
  uniform vec3  uColorFrost;
  uniform float uCoreGlow;
  uniform float uTipGlow;
  uniform float uRimGlow;
  uniform float uFlashGlow;
  uniform float uFrost;
  uniform float uEnv;
  uniform float uCharge;     // the whole halo brightening as it closes

  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec4 vState;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    float seed = vState.x;
    float flash = vState.y;
    float dissolve = vState.z;
    float along = clamp(vLocal.y, 0.0, 1.0);

    if (dissolve > 0.0) {
      float n = snoise(vec3(vLocal.xz * 3.0, along * 4.0 + seed * 9.0)) * 0.5 + 0.5;
      // Sublimes from the tip back toward the root.
      float th = dissolve * 1.3 - 0.15;
      if (n * 0.6 + (1.0 - along) * 0.4 < th) discard;
    }

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(N, V) < 0.0) N = -N;
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float F = pow(1.0 - ndv, 2.5);

    vec3 L = normalize(uLightDir);
    float ndl = max(dot(N, L), 0.0);
    vec3 col = uColorBody * (0.35 + 0.65 * ndl);
    col += texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb * uEnv * (0.3 + 0.7 * F);

    // The lit filament inside: brightest face-on, hottest at the point.
    float radial = length(vLocal.xz);
    float core = exp(-radial * radial * 18.0) * (0.4 + 0.6 * ndv);
    float tip = smoothstep(0.55, 1.0, along);
    float pulse = 0.75 + 0.25 * sin(uTime * 14.0 + seed * 30.0 - along * 8.0);
    col += uColorCore * (core * uCoreGlow + tip * uTipGlow) * pulse * (1.0 + uCharge) * uGlobalGlow * uShaderIntensity;
    col += uColorRim * F * uRimGlow * uGlobalGlow;

    // Frost dusted on the upward facets.
    float dust = smoothstep(0.2, 0.8, N.y) * (snoise(vWorld * 22.0 + seed) * 0.5 + 0.5);
    col = mix(col, uColorFrost, dust * uFrost);

    // The flash it crystallises in, and the burn at a dissolving edge.
    col += uColorCore * flash * uFlashGlow * uGlobalGlow;
    col += uColorCore * dissolve * smoothstep(0.4, 1.0, along) * uTipGlow * 1.5;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createNeedleMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uColorBody: { value: new Color() },
      uColorCore: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorFrost: { value: new Color() },
      uCoreGlow: { value: 2 },
      uTipGlow: { value: 3 },
      uRimGlow: { value: 1 },
      uFlashGlow: { value: 6 },
      uFrost: { value: 0.5 },
      uEnv: { value: 0.5 },
      uCharge: { value: 0 }
    }),
    vertexShader: NEEDLE_VERTEX,
    fragmentShader: NEEDLE_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {object} s { charge } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uColorBody.value.copy(getColor(c.colorNeedleBody));
    u.uColorCore.value.copy(getColor(c.colorNeedleCore));
    u.uColorRim.value.copy(getColor(c.colorNeedleRim));
    u.uColorFrost.value.copy(getColor(c.colorFrost));
    u.uCoreGlow.value = c.needleCoreGlow * g.glow;
    u.uTipGlow.value = c.needleTipGlow * g.glow;
    u.uRimGlow.value = c.needleRimGlow * g.fresnel;
    u.uFlashGlow.value = c.needleFlashGlow * g.glow;
    u.uFrost.value = c.needleFrost;
    u.uEnv.value = c.needleEnv;
    u.uCharge.value = s.charge;
  };

  return material;
}

/* ==================================================================== */
/* The spine                                                              */
/* ==================================================================== */

const SPINE_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uRadius;
  uniform float uTube;
  uniform float uSpin;
  uniform float uStart;   // bearing the walk set off from

  varying vec2 vUv;
  varying float vAngle;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    float u = uv.x * 6.2831853;
    float v = uv.y * 6.2831853;
    // Measured round from the start, in the ring's own (unspun) frame.
    vAngle = mod(u - uStart + 12.5663706, 6.2831853);
    float ring = uRadius + uTube * cos(v);
    vec3 p = vec3(cos(u + uSpin) * ring, uTube * sin(v), sin(u + uSpin) * ring);
    vec4 world = vec4(uCentre + p, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SPINE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uReveal;      // radians walked so far (0..2π)
  uniform float uGlow;
  uniform float uPulses;
  uniform float uPulseSpeed;
  uniform float uIntensity;
  uniform vec3  uColorA;
  uniform vec3  uColorB;

  varying vec2 vUv;
  varying float vAngle;

  void main() {
    // Revealed behind the head only, with a hot fresh end.
    float a = vAngle;
    float shown = 1.0 - smoothstep(uReveal - 0.05, uReveal, a);
    if (shown < 0.01) discard;
    float fresh = exp(-max(uReveal - a, 0.0) * 3.0) * step(uReveal, 6.27);
    float across = abs(cos(vUv.y * 6.2831853 * 0.5));
    float pulses = pow(0.5 + 0.5 * sin(a * uPulses - uTime * uPulseSpeed), 8.0);
    float k = (0.55 + 0.45 * pulses + fresh * 1.5) * shown * uIntensity;
    vec3 col = mix(uColorB, uColorA, clamp(pulses * 0.6 + fresh, 0.0, 1.0));
    gl_FragColor = vec4(col * k * uGlow * uGlobalGlow * uShaderIntensity, 1.0);
  }
`;

export function createSpineMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uRadius: { value: 4 },
      uTube: { value: 0.04 },
      uSpin: { value: 0 },
      uStart: { value: 0 },
      uReveal: { value: 0 },
      uGlow: { value: 3 },
      uPulses: { value: 6 },
      uPulseSpeed: { value: 8 },
      uIntensity: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: SPINE_VERTEX,
    fragmentShader: SPINE_FRAGMENT
  });

  /** @param {object} s { centre, radius, spin, start, reveal, intensity } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uRadius.value = s.radius;
    u.uTube.value = c.spineThickness;
    u.uSpin.value = s.spin;
    u.uStart.value = s.start;
    u.uReveal.value = s.reveal;
    u.uGlow.value = c.spineGlow * g.glow;
    u.uPulses.value = Math.round(c.spinePulses);
    u.uPulseSpeed.value = c.spinePulseSpeed * g.animationSpeed;
    u.uIntensity.value = s.intensity * g.opacity;
    u.uColorA.value.copy(getColor(c.colorSpineA));
    u.uColorB.value.copy(getColor(c.colorSpineB));
  };

  return material;
}

/* ==================================================================== */
/* The head                                                               */
/* ==================================================================== */

const GLINT_VERTEX = /* glsl */ `
  uniform vec3  uPos;
  uniform float uSize;
  uniform float uRoll;
  varying vec2 vUv;

  void main() {
    vUv = position.xy * 2.0;
    vec4 view = viewMatrix * vec4(uPos, 1.0);
    float c = cos(uRoll);
    float s = sin(uRoll);
    vec2 q = mat2(c, s, -s, c) * position.xy;
    view.xy += q * uSize;
    gl_Position = projectionMatrix * view;
  }
`;

const GLINT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uGlobalGlow;
  uniform float uIntensity;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv;
    float r = length(p);
    float core = exp(-r * r * 40.0);
    float halo = exp(-r * 4.0) * 0.5;
    float rays = exp(-abs(p.x) * 60.0) * exp(-abs(p.y) * 2.5) + exp(-abs(p.y) * 60.0) * exp(-abs(p.x) * 2.5);
    vec2 d = vec2(p.x + p.y, p.x - p.y) * 0.7071;
    rays += (exp(-abs(d.x) * 90.0) * exp(-abs(d.y) * 5.0) + exp(-abs(d.y) * 90.0) * exp(-abs(d.x) * 5.0)) * 0.5;
    float k = (core * 3.0 + halo + rays) * uIntensity * (1.0 - smoothstep(0.8, 1.0, r));
    if (k < 0.002) discard;
    vec3 col = mix(uColorB, uColorA, clamp(core * 2.0 + rays * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(col * k * uGlobalGlow, 1.0);
  }
`;

export function createGlintMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uPos: { value: new Vector3() },
      uSize: { value: 1 },
      uRoll: { value: 0 },
      uIntensity: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: GLINT_VERTEX,
    fragmentShader: GLINT_FRAGMENT
  });

  /** @param {object} s { pos, size, roll, intensity } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uPos.value.copy(s.pos);
    u.uSize.value = s.size;
    u.uRoll.value = s.roll;
    u.uIntensity.value = s.intensity * c.headGlow * g.glow;
    u.uColorA.value.copy(getColor(c.colorHeadA));
    u.uColorB.value.copy(getColor(c.colorHeadB));
  };

  return material;
}

/* ==================================================================== */
/* The rime floor                                                         */
/* ==================================================================== */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;
  varying vec2 vP;

  void main() {
    vec2 p = position.xy * uExtent;
    vP = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(uCentre.x + p.x, 0.013, uCentre.z + p.y, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uRadius;      // the circle
  uniform float uHalo;        // the halo's current radius
  uniform float uReveal;      // radians walked
  uniform float uStart;       // bearing the walk started from
  uniform float uSpin;
  uniform float uSeed;
  uniform float uTrackWidth;
  uniform float uTrackGlow;
  uniform float uStar;        // 0..1 the crystal star at the heart
  uniform float uStarSize;
  uniform float uErode;
  uniform float uOpacity;
  uniform float uStreak;

  uniform vec3 uColorFrost;
  uniform vec3 uColorDeep;
  uniform vec3 uColorGlow;

  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    vec2 p = vP;
    float r = length(p);
    float ang = atan(p.y, p.x);
    // Walked: the angle measured round from where the head set off.
    float rel = mod(ang - uStart + 6.2831853 * 4.0, 6.2831853);
    float walked = 1.0 - smoothstep(uReveal - 0.15, uReveal, rel);

    // Swept: between the halo's current radius and the rim.
    float swept = smoothstep(uHalo - 0.15, uHalo + 0.25, r) * (1.0 - smoothstep(uRadius + 0.1, uRadius + 0.45, r));

    // Rime streaked round the circle, as if dragged by the ring.
    float sa = ang + uSpin * 0.15;
    float streaks = snoise(vec3(cos(sa) * r * 0.4 * uStreak, sin(sa) * r * 0.4 * uStreak, r * 6.0 + uSeed));
    float fine = snoise(vec3(p * 9.0, uSeed));
    float frost = swept * clamp(0.55 + streaks * 0.35 + fine * 0.2, 0.0, 1.0);
    vec3 col = mix(uColorDeep, uColorFrost, clamp(0.35 + streaks * 0.4 + fine * 0.25, 0.0, 1.0));

    // The bright track right under the halo, only where it has walked.
    float track = exp(-pow((r - uHalo) / max(uTrackWidth, 0.02), 2.0)) * walked;
    float glow = track * uTrackGlow * (0.75 + 0.25 * sin(ang * 12.0 + uTime * 6.0));

    // The crystal star where it closes.
    float rays = pow(abs(cos(ang * 3.0 + uSeed)), 30.0) + pow(abs(cos(ang * 3.0 + uSeed + 0.5236)), 60.0) * 0.6;
    float starR = uStarSize * uStar * (0.55 + 0.45 * rays);
    float star = (1.0 - smoothstep(starR * 0.75, starR, r)) * step(0.001, uStar);
    col = mix(col, uColorFrost, star);
    glow += star * (0.6 + rays) * uTrackGlow * 0.5 * (1.0 - smoothstep(0.0, starR, r) * 0.5);

    col += uColorGlow * glow * uGlobalGlow * uShaderIntensity;
    float a = max(frost * 0.92, max(star, min(glow, 1.0)));
    float n = snoise(vec3(p * 1.6, uSeed * 2.0)) * 0.5 + 0.5;
    float thr = uErode * 1.25 - 0.15;
    a *= smoothstep(thr, thr + 0.12, n);
    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createRimeFloorMaterial() {
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
      uHalo: { value: 4 },
      uReveal: { value: 0 },
      uStart: { value: 0 },
      uSpin: { value: 0 },
      uSeed: { value: 0 },
      uTrackWidth: { value: 0.12 },
      uTrackGlow: { value: 3 },
      uStar: { value: 0 },
      uStarSize: { value: 1.6 },
      uErode: { value: 0 },
      uOpacity: { value: 1 },
      uStreak: { value: 1 },
      uColorFrost: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorGlow: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /** @param {object} s { centre, radius, halo, reveal, start, spin, seed, star, erode } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uExtent.value = s.radius + 0.8;
    u.uRadius.value = s.radius;
    u.uHalo.value = s.halo;
    u.uReveal.value = s.reveal;
    u.uStart.value = s.start;
    u.uSpin.value = s.spin;
    u.uSeed.value = s.seed;
    u.uTrackWidth.value = c.trackWidth;
    u.uTrackGlow.value = c.trackGlow * g.glow;
    u.uStar.value = s.star;
    u.uStarSize.value = c.starSize;
    u.uErode.value = s.erode;
    u.uOpacity.value = g.opacity;
    u.uStreak.value = c.floorStreak * g.noiseFrequency;
    u.uColorFrost.value.copy(getColor(c.colorFrost));
    u.uColorDeep.value.copy(getColor(c.colorFrostDeep));
    u.uColorGlow.value.copy(getColor(c.colorSpineA));
  };

  return material;
}

/* ==================================================================== */
/* Cold air                                                               */
/* ==================================================================== */

const BAND_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const COLD_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;
  uniform float uScale;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    // Cold air pours *down* off the ring.
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale * 0.8 + uTime * 1.6);
    float nx = snoise(np);
    float ny = snoise(np + vec3(13.1, 5.7, 23.3));
    float mask = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
    float s = uStrength * uShaderIntensity * mask;
    if (s < 0.002) discard;
    gl_FragColor = vec4(vec2(nx, ny) * 0.5 + 0.5, s, mask);
  }
`;

export function createColdBandMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStrength: { value: 0 },
      uScale: { value: 1.5 }
    }),
    vertexShader: BAND_VERTEX,
    fragmentShader: COLD_FRAGMENT
  });

  /** @param {object} s { strength } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    material.uniforms.uStrength.value = s.strength * c.coldWarp * g.distortion;
    material.uniforms.uScale.value = c.coldScale * g.noiseFrequency;
  };

  return material;
}
