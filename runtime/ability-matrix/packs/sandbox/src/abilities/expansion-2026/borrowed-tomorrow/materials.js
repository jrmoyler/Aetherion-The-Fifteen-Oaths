import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Borrowed Tomorrow — the bespoke shaders.
 *
 *  - **the face** — the clock face on the floor: a bezel line, ripple rings
 *    bent by fbm (time running), twelve hour rays, a sweeping wedge, and the
 *    **debt arc** — a band round the rim that fills clockwise from twelve as
 *    the borrowed time accrues, its leading edge white-hot. At the strike a
 *    shock ring runs out; on the exit the face dissolves through noise.
 *    `uTime` is the ability's own age × `pulseSpeed` (not the frame clock),
 *    so the face's rhythm is part of the cast.
 *  - **chronoglow** — the lit bezel, minute hand and pendulum bob: fresnel
 *    light that breathes faster as the debt comes due.
 *  - **tomorrow's ring** — a ghost ring hovering above the clock that
 *    descends with the debt, drawn twice with a chromatic split that closes
 *    as it lands.
 *  - **the glass** — instanced cut-glass fragments: a smeared fake
 *    reflection, a dispersive rim and a violet body.
 *  - **the sand** — a GPU point cloud spiralling in toward the arbor while
 *    the debt accrues and thrown outward at the strike.
 *  - **the shock** — the strike's floor ring.
 *  - **the pillar** — the column of light that drops through the clock.
 *  - **the lens** — `LAYER.DISTORTION` disc: a slow inward swirl while the
 *    debt accrues, a pressure ring at the strike.
 *
 * Every material reads `settings.borrowedTomorrow` in `userData.sync(state)`.
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

const LIT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/* -------------------------------------------------------------------- */
/* The face                                                             */
/* -------------------------------------------------------------------- */

const FACE_FRAGMENT = /* glsl */ `
  uniform float uTime;        // age × pulseSpeed — the face's own rhythm
  uniform float uRadius;
  uniform float uEnergy;
  uniform float uFade;
  uniform float uDebt;        // 0..1 borrowed so far
  uniform float uRelease;     // 0..1 through the strike's shock, −1 before
  uniform float uDissolve;
  uniform float uGlow;
  uniform float uDebtGlow;
  uniform float uRipple;
  uniform float uScale;
  uniform vec3  uGold;
  uniform vec3  uViolet;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    // Clockwise from twelve o'clock, 0..1.
    float clockA = fract(0.25 - a / 6.2831853);

    float bend = (fbm3(vec3(p * 2.0 * uScale, uTime * 0.12)) - 0.5) * 0.08 * uRipple;
    float perimeter = exp(-abs(r - 0.94) * 75.0);
    float rings = pow(max(0.0, cos((r + bend) * 55.0 - uTime * 3.0)), 16.0) * (1.0 - smoothstep(0.16, 0.92, r));
    float rays = pow(abs(sin(a * 6.0)), 38.0) * smoothstep(0.3, 0.62, r) * (1.0 - smoothstep(0.75, 0.98, r));
    float wedge = pow(max(0.0, cos(a - uTime * 0.8)), 45.0) * (1.0 - smoothstep(0.2, 0.9, r));

    // The debt arc: a band just inside the bezel, filled to uDebt.
    float band = smoothstep(0.8, 0.83, r) * (1.0 - smoothstep(0.88, 0.91, r));
    float filled = 1.0 - smoothstep(uDebt - 0.004, uDebt, clockA);
    float lead = exp(-abs(clockA - uDebt) * 90.0) * step(0.001, uDebt) * step(uDebt, 0.999);
    float debt = band * (filled * 0.7 + lead * 2.5) * uDebtGlow;

    float shock = uRelease >= 0.0 ? exp(-abs(r - uRelease) * 30.0) * (1.0 - uRelease) * 2.0 : 0.0;

    vec2 dm = dissolveMask(snoise01(vec3(p * 3.4, 2.3)), uDissolve, 0.07);
    float inside = 1.0 - smoothstep(0.94, 1.0, r);
    float lines = perimeter * 0.8 + (rings * 0.2 + rays * 0.24 + wedge * 0.22) * uShaderIntensity;
    float alpha = (inside * lines * uEnergy + debt + shock) * dm.x * uFade;
    vec3 col = mix(uViolet, uGold, clamp(perimeter + rings * 0.6 + wedge + debt + shock, 0.0, 1.0));
    col += uGold * dm.y * 3.0;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/** The clock face on the floor. Additive. */
export function createClockFaceMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uTime: { value: 0 }, // owned, not the shared frame clock (see above)
      uRadius: { value: 3.6 },
      uEnergy: { value: 0 },
      uFade: { value: 1 },
      uDebt: { value: 0 },
      uRelease: { value: -1 },
      uDissolve: { value: 0 },
      uGlow: { value: 2 },
      uDebtGlow: { value: 1.4 },
      uRipple: { value: 1 },
      uScale: { value: 1 },
      uGold: { value: new Color('#ffd38a') },
      uViolet: { value: new Color('#6f4e9c') },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: FACE_FRAGMENT,
  });
  /** @param {object} s { time, radius, energy, fade, debt, release, dissolve } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = s.time;
    u.uRadius.value = s.radius;
    u.uEnergy.value = s.energy;
    u.uFade.value = s.fade * g.opacity;
    u.uDebt.value = s.debt;
    u.uRelease.value = s.release;
    u.uDissolve.value = s.dissolve;
    u.uGlow.value = c.faceGlow * g.glow;
    u.uDebtGlow.value = c.debtGlow;
    u.uRipple.value = c.faceRipple * g.noiseStrength;
    u.uScale.value = g.noiseFrequency;
    u.uGold.value.copy(getColor(c.coreColor));
    u.uViolet.value.copy(getColor(c.shadowColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Chronoglow                                                           */
/* -------------------------------------------------------------------- */

const CHRONO_FRAGMENT = /* glsl */ `
  uniform float uPulse;       // 0..1, breathes faster as the debt comes due
  uniform float uFade;
  uniform float uGlow;
  uniform float uFresnel;
  uniform vec3  uColor;
  uniform vec3  uShadow;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${commonGLSL}
  void main() {
    float rim = fresnelTerm(vViewDir, vNormalW, 2.0, uFresnel);
    vec3 col = mix(uColor, uShadow, 0.25 * (1.0 - rim)) * (0.7 + 0.6 * uPulse) + uColor * rim;
    float a = (0.55 + 0.45 * rim) * uFade;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The lit bezel, minute hand and bob. */
export function createChronoGlowMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uPulse: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1.6 },
      uFresnel: { value: 1 },
      uColor: { value: new Color() },
      uShadow: { value: new Color() },
    }),
    vertexShader: LIT_VERTEX,
    fragmentShader: CHRONO_FRAGMENT,
  });
  /** @param {object} s { pulse, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uPulse.value = s.pulse;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.chronoGlow * g.glow;
    u.uFresnel.value = g.fresnel;
    u.uColor.value.copy(getColor(c.coreColor));
    u.uShadow.value.copy(getColor(c.shadowColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Tomorrow's ring                                                      */
/* -------------------------------------------------------------------- */

const FUTURE_FRAGMENT = /* glsl */ `
  uniform float uFade;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uSplit;       // 0..1 chromatic separation
  uniform float uDebt;
  uniform vec3  uColor;
  uniform vec3  uShadow;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    // Two images of the same ring, pulled apart in radius by the split.
    float w = 0.018;
    float gold = exp(-pow((r - 0.92 + uSplit * 0.05) / w, 2.0));
    float violet = exp(-pow((r - 0.92 - uSplit * 0.05) / w, 2.0));
    float ticks = step(0.94, abs(cos(atan(p.y, p.x) * 6.0))) * smoothstep(0.82, 0.86, r) * (1.0 - smoothstep(0.9, 0.92, r));
    vec3 col = uColor * (gold + ticks * 0.6) + uShadow * violet * 1.5;
    float a = (gold + violet * 0.7 + ticks * 0.5) * uFade * uOpacity * (0.5 + 0.5 * uDebt);
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** Tomorrow's ghost ring, descending with the debt. */
export function createFutureRingMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uFade: { value: 1 },
      uGlow: { value: 1.8 },
      uOpacity: { value: 0.7 },
      uSplit: { value: 1 },
      uDebt: { value: 0 },
      uColor: { value: new Color() },
      uShadow: { value: new Color() },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: FUTURE_FRAGMENT,
  });
  /** @param {object} s { fade, split, debt } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.futureGlow * g.glow;
    u.uOpacity.value = c.futureOpacity;
    u.uSplit.value = s.split;
    u.uDebt.value = s.debt;
    u.uColor.value.copy(getColor(c.coreColor));
    u.uShadow.value.copy(getColor(c.shadowColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The glass                                                            */
/* -------------------------------------------------------------------- */

const GLASS_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vSeed;
  void main() {
    mat4 local = mat4(1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix;
    #endif
    vec4 world = modelMatrix * local * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * mat3(local) * normal);
    vViewDir = cameraPosition - world.xyz;
    vSeed = fract(local[3].x * 2.1 + local[3].z * 3.7);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const GLASS_FRAGMENT = /* glsl */ `
  uniform float uFade;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uFresnel;
  uniform vec3  uBody;
  uniform vec3  uLight;
  uniform vec3  uShadow;
  uniform float uGlobalGlow;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vSeed;
  ${commonGLSL}
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    vec3 R = reflect(-V, N);
    float rim = fresnelTerm(V, N, 2.5, uFresnel);
    // A smeared reflection: the warm sky streaked as though in long exposure.
    float sky = smoothstep(-0.2, 0.7, R.y + 0.15 * sin(R.x * 6.0 + vSeed * 6.0));
    // Dispersion at the rim: warm on one side of the edge, violet the other.
    vec3 disp = mix(uShadow, uLight, smoothstep(-0.3, 0.3, dot(N, normalize(vec3(1.0, 0.2, 0.0)))));
    vec3 col = uBody * 0.6 + uLight * sky * 0.8 + disp * rim * 1.4;
    float a = (0.35 + 0.35 * sky + rim) * uFade * uOpacity;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** Instanced cut-glass fragments. */
export function createGlassMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uFade: { value: 1 },
      uGlow: { value: 1.2 },
      uOpacity: { value: 0.8 },
      uFresnel: { value: 1 },
      uBody: { value: new Color() },
      uLight: { value: new Color() },
      uShadow: { value: new Color() },
    }),
    vertexShader: GLASS_VERTEX,
    fragmentShader: GLASS_FRAGMENT,
  });
  material.userData.instanced = true;
  /** @param {object} s { fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uFade.value = s.fade;
    u.uGlow.value = c.glassGlow * g.glow;
    u.uOpacity.value = c.glassOpacity * g.opacity;
    u.uFresnel.value = g.fresnel;
    u.uBody.value.copy(getColor(c.glassColor));
    u.uLight.value.copy(getColor(c.coreColor));
    u.uShadow.value.copy(getColor(c.shadowColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The sand                                                             */
/* -------------------------------------------------------------------- */

const SAND_VERTEX = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uClock;
  uniform float uRadius;
  uniform float uDebt;
  uniform float uThrow;       // 0..1 after the strike
  uniform float uSwirl;
  uniform float uSize;
  uniform float uFade;
  uniform float uCount;
  uniform vec2  uResolution;
  varying float vAlpha;
  varying float vHeat;
  void main() {
    if (aSeed.w >= uCount) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      vHeat = 0.0;
      return;
    }
    // Each grain spirals from the rim toward the arbor over its life.
    float life = fract(aSeed.z + uClock * (0.3 + 0.25 * aSeed.y) * (0.6 + uDebt));
    float rad = uRadius * (1.0 - life) * mix(0.7, 1.0, aSeed.y);
    float ang = aSeed.x * 6.2831853 + life * uSwirl * 4.0;
    float y = 0.12 + (1.0 - life) * 0.6 * aSeed.x;
    // At the strike every grain is thrown out and up.
    rad += uThrow * uRadius * (0.4 + 0.8 * aSeed.y);
    y += uThrow * (1.0 + 1.5 * aSeed.z) - uThrow * uThrow * 1.2;
    vec4 mv = modelViewMatrix * vec4(cos(ang) * rad, y, sin(ang) * rad, 1.0);
    gl_Position = projectionMatrix * mv;
    float env = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.85, 1.0, life));
    vAlpha = mix(env, 1.0 - uThrow, step(0.001, uThrow)) * uFade;
    vHeat = life;
    gl_PointSize = uSize * uResolution.y * projectionMatrix[1][1] * 0.5 / max(0.1, -mv.z);
  }
`;

const SAND_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uGlobalGlow;
  varying float vAlpha;
  varying float vHeat;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    float soft = exp(-d * 2.5);
    gl_FragColor = vec4(mix(uColor, uHot, vHeat) * uGlow * uGlobalGlow, soft * vAlpha);
  }
`;

/** GPU sand drawn into the clock. */
export function createSandMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uRadius: { value: 3 },
      uDebt: { value: 0 },
      uThrow: { value: 0 },
      uSwirl: { value: 1.4 },
      uSize: { value: 0.045 },
      uFade: { value: 1 },
      uCount: { value: 1 },
      uGlow: { value: 1.8 },
      uColor: { value: new Color() },
      uHot: { value: new Color() },
    }),
    vertexShader: SAND_VERTEX,
    fragmentShader: SAND_FRAGMENT,
  });
  /** @param {object} s { clock, radius, debt, throw, fade, capacity } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uRadius.value = s.radius;
    u.uDebt.value = s.debt;
    u.uThrow.value = s.throw;
    u.uSwirl.value = c.sandSwirl;
    u.uSize.value = c.sandSize * g.particleSize;
    u.uFade.value = s.fade * g.opacity;
    u.uCount.value = Math.min(1, (c.sandCount * g.particleCount) / s.capacity);
    u.uGlow.value = c.sandGlow * g.glow;
    u.uColor.value.copy(getColor(c.ringColor));
    u.uHot.value.copy(getColor(c.coreColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The shock and the pillar                                             */
/* -------------------------------------------------------------------- */

const SHOCK_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uOpacity;
  uniform float uGlow;
  uniform vec3  uColor;
  uniform vec3  uShadow;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float front = exp(-abs(r - 0.96) * 40.0);
    float trail = smoothstep(0.55, 0.96, r) * (1.0 - smoothstep(0.96, 1.0, r)) * 0.35;
    float grain = 0.75 + 0.25 * snoise(vec3(vWorld.xz * 2.0, uProgress * 4.0));
    float a = (front + trail) * grain * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(mix(uShadow, uColor, front) * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The strike's floor ring. */
export function createShockMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
      uGlow: { value: 2.4 },
      uColor: { value: new Color() },
      uShadow: { value: new Color() },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: SHOCK_FRAGMENT,
  });
  /** @param {object} s { progress, opacity } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uProgress.value = s.progress;
    u.uOpacity.value = s.opacity * g.opacity;
    u.uGlow.value = c.releaseGlow * g.glow;
    u.uColor.value.copy(getColor(c.coreColor));
    u.uShadow.value.copy(getColor(c.shadowColor));
  };
  return material;
}

const PILLAR_FRAGMENT = /* glsl */ `
  uniform float uPower;
  uniform float uGlow;
  uniform vec3  uColor;
  uniform vec3  uShadow;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    float edge = fresnelTerm(vViewDir, vNormalW, 1.5, 1.0);
    // Clock-hand stripes running down the column, faster at the base.
    float stripes = pow(max(0.0, sin(vUv.x * 6.2831853 * 12.0 + vUv.y * 4.0)), 8.0);
    float ends = smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.4, 1.0, vUv.y));
    float a = (0.2 + edge + stripes * 0.3) * ends * uPower;
    if (a < 0.003) discard;
    vec3 col = mix(uShadow, uColor, clamp(1.2 - vUv.y + stripes * 0.3, 0.0, 1.0));
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The column of light that drops through the clock at the strike. */
export function createPillarMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uPower: { value: 0 },
      uGlow: { value: 2.4 },
      uColor: { value: new Color() },
      uShadow: { value: new Color() },
    }),
    vertexShader: LIT_VERTEX,
    fragmentShader: PILLAR_FRAGMENT,
  });
  /** @param {object} s { power } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uPower.value = s.power * g.opacity;
    u.uGlow.value = c.releaseGlow * g.glow;
    u.uColor.value.copy(getColor(c.coreColor));
    u.uShadow.value.copy(getColor(c.shadowColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The lens                                                             */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uSwirl;       // inward time-warp while the debt accrues
  uniform float uShock;       // strength of the strike's pressure ring
  uniform float uWave;        // its radius, 0..1
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
    float body = 1.0 - smoothstep(0.3, 1.0, r);
    float ring = exp(-pow((r - uWave) / 0.1, 2.0));
    vec3 np = vec3(q * 2.5 * uScale, uClock * 0.4);
    vec2 n = vec2(snoise(np), snoise(np + vec3(5.2, 1.3, 7.7))) * 0.3;
    vec2 dir = (tangent * 0.7 - radial * 0.3 + n) * body * uSwirl + (radial + n) * ring * uShock;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(body * uSwirl + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` disc. Opaque on purpose: the offset buffer wants the
 * proxy's own value, and an opaque proxy keeps the expansion's "transparent ⇒
 * VFX layer" routing from pulling it out of the warp pass.
 */
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
    u.uSwirl.value = s.swirl * c.lensStrength * g.distortion;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
