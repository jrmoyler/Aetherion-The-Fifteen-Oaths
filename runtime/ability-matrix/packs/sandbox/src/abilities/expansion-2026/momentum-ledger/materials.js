import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  MeshStandardMaterial,
  NormalBlending,
  ShaderMaterial,
  Vector2,
} from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Momentum Ledger — the bespoke shaders.
 *
 *  - **the dial** — the ledger's floor: a rim, flow lines bent along the
 *    *banked direction* (the way you actually walked), the travelling waves of
 *    the original, and a **tally** of 24 cells round the rim lit one by one as
 *    the bank fills — the same count as the gauge glyphs. A shock ring runs
 *    out at the release; the dial dissolves through noise on the exit.
 *  - **the velocity glyphs** — instanced arrows (orbiting glyphs and the
 *    gauge): a hot spine, a streak gradient tail→tip and a pulse that runs
 *    faster with the bank.
 *  - **the ledger glow** — the lit wheel and release rings: fresnel light.
 *  - **the wake ribbon** — the walked path as a ribbon of chevrons flowing
 *    toward the newest point, feathered at its edges and its oldest end.
 *  - **the directional fan** — the release front: a sector laid out in the
 *    vertex stage from `uSpread`, a front racing out along it with streaks.
 *  - **speed motes** — GPU points orbiting the dial, faster with the bank.
 *  - **the compression lens** — `LAYER.DISTORTION` disc: a pinch toward the
 *    centre while banking, a pressure ring at the release.
 *  - **the flywheel** — the hero's lit cast iron (`MeshStandardMaterial`,
 *    world layer, shadows) patched so its 24 teeth light one by one with the
 *    *banked* fraction (an honest gauge on the hero itself) and the whole
 *    wheel glows from within as it winds up.
 *  - **the spin halo** — an additive disc in the wheel's plane: teeth smear
 *    into a continuous ring and long rotational streaks pull off the rim as
 *    the wheel winds up — the stored momentum made visible.
 *  - **the ledger plate** — the floor: a normal-blended cast-iron plate
 *    (deep tone, hammered noise) engraved with ledger columns and ticks,
 *    radial grooves that turn with the wheel, a sector that fills with the
 *    bank, and after the release a burnt, ember-lined wedge thrown along the
 *    banked direction that cools through the linger.
 *
 * The palette is one ramp: core #fff1d3 → tint #ffb088 → body #d6503a →
 * deep #2a0f14 (iron #3a2a28).
 *
 * Every material reads `settings.momentumLedger` in `userData.sync(state)`.
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

/* -------------------------------------------------------------------- */
/* The dial                                                             */
/* -------------------------------------------------------------------- */

const DIAL_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uCharge;      // 0..1 banked fraction
  uniform float uFade;
  uniform float uDissolve;
  uniform float uRelease;     // 0..1 through the release shock, −1 before
  uniform vec2  uFlow;        // banked direction in the dial's own frame
  uniform float uFlowLines;
  uniform float uTally;
  uniform float uGlow;
  uniform float uScale;
  uniform vec3  uA;
  uniform vec3  uB;
  uniform vec3  uCore;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    if (r > 1.0) discard;
    float phi = atan(q.y, q.x);

    float edge = exp(-abs(r - 0.94) * 65.0);
    float travel = pow(max(0.0, sin(phi * 10.0 - uClock * 6.0 - r * 12.0)), 14.0);
    float wave = exp(-abs(r - mod(uClock * 0.65, 1.0)) * 45.0) * uCharge;

    // Flow lines run along the banked direction, bent by fbm.
    vec2 f = length(uFlow) > 1e-3 ? normalize(uFlow) : vec2(0.0, 1.0);
    float across = dot(q, vec2(-f.y, f.x));
    float alongF = dot(q, f);
    float bend = (fbm3(vec3(q * 1.8 * uScale, uClock * 0.2)) - 0.5) * 0.25;
    float lines = pow(max(0.0, cos((across + bend) * 26.0)), 18.0)
                * (0.5 + 0.5 * sin(alongF * 9.0 - uClock * (3.0 + 9.0 * uCharge)))
                * (1.0 - smoothstep(0.55, 0.9, r)) * uFlowLines * (0.25 + 0.75 * uCharge);

    // The tally: 24 cells just inside the rim, lit one by one with the bank.
    float cellA = fract(0.25 - phi / 6.2831853);
    float cell = floor(cellA * 24.0);
    float lit = step(cell + 0.5, uCharge * 24.0);
    float cellShape = (1.0 - smoothstep(0.32, 0.42, abs(fract(cellA * 24.0) - 0.5)))
                    * smoothstep(0.8, 0.82, r) * (1.0 - smoothstep(0.88, 0.9, r));
    float tally = cellShape * (0.12 + lit * uTally);

    float shock = uRelease >= 0.0 ? exp(-abs(r - uRelease) * 28.0) * (1.0 - uRelease) * 2.0 : 0.0;

    vec2 dm = dissolveMask(snoise01(vec3(q * 3.2, 4.1)), uDissolve, 0.07);
    float mask = 1.0 - smoothstep(0.92, 1.0, r);
    float alpha = ((edge * 0.7 + travel * 0.23 * uShaderIntensity + wave * 0.6 + lines) * mask + tally + shock) * dm.x * uFade;
    vec3 col = mix(uB, uA, clamp(edge + wave + uCharge * 0.5 + lines, 0.0, 1.0));
    col = mix(col, uCore, clamp(tally * lit + shock * 0.5 + dm.y, 0.0, 1.0));
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/** The ledger's floor dial. Additive. */
export function createDialMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uCharge: { value: 0 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uRelease: { value: -1 },
      uFlow: { value: new Vector2(0, 1) },
      uFlowLines: { value: 1 },
      uTally: { value: 1.4 },
      uGlow: { value: 2 },
      uScale: { value: 1 },
      uA: { value: new Color() },
      uB: { value: new Color() },
      uCore: { value: new Color() },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: DIAL_FRAGMENT,
  });
  /** @param {object} s { clock, charge, fade, dissolve, release, flowX, flowY } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uCharge.value = s.charge;
    u.uFade.value = s.fade * g.opacity;
    u.uDissolve.value = s.dissolve;
    u.uRelease.value = s.release;
    u.uFlow.value.set(s.flowX, s.flowY);
    u.uFlowLines.value = c.flowLines * g.shaderIntensity;
    u.uTally.value = c.tallyGlow;
    u.uGlow.value = c.dialGlow * g.glow;
    u.uScale.value = g.noiseFrequency;
    u.uA.value.copy(getColor(c.accentColor));
    u.uB.value.copy(getColor(c.trailColor));
    u.uCore.value.copy(getColor(c.coreColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The velocity glyphs                                                  */
/* -------------------------------------------------------------------- */

const GLYPH_VERTEX = /* glsl */ `
  varying float vAlong;
  varying float vHeight;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vSeed;
  void main() {
    mat4 local = mat4(1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix;
    #endif
    vAlong = position.z * 1.1 + 0.5; // tail 0 → tip 1
    vHeight = position.y;
    vec4 world = modelMatrix * local * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * mat3(local) * normal);
    vViewDir = cameraPosition - world.xyz;
    vSeed = fract(local[3].x * 1.7 + local[3].z * 2.9);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const GLYPH_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uCharge;
  uniform float uFade;
  uniform float uGlow;
  uniform float uFresnel;
  uniform vec3  uA;
  uniform vec3  uCore;
  uniform float uGlobalGlow;
  varying float vAlong;
  varying float vHeight;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vSeed;
  ${commonGLSL}
  void main() {
    float spine = smoothstep(0.02, 0.08, vHeight);
    float pulse = pow(max(0.0, sin((vAlong - uClock * (1.0 + 3.0 * uCharge) - vSeed) * 6.2831853)), 6.0);
    float rim = fresnelTerm(vViewDir, vNormalW, 2.0, uFresnel);
    vec3 col = mix(uA, uCore, clamp(vAlong * 0.7 + spine * 0.5 + pulse, 0.0, 1.0));
    float a = (0.45 + 0.4 * vAlong + spine * 0.4 + pulse * 0.6 + rim * 0.5) * uFade;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** Instanced velocity glyphs (orbiting arrows and the gauge). */
export function createGlyphMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uCharge: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1.8 },
      uFresnel: { value: 1 },
      uA: { value: new Color() },
      uCore: { value: new Color() },
    }),
    vertexShader: GLYPH_VERTEX,
    fragmentShader: GLYPH_FRAGMENT,
  });
  material.userData.instanced = true;
  /** @param {object} s { clock, charge, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uCharge.value = s.charge;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.glyphGlow * g.glow;
    u.uFresnel.value = g.fresnel;
    u.uA.value.copy(getColor(c.accentColor));
    u.uCore.value.copy(getColor(c.coreColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The ledger glow                                                      */
/* -------------------------------------------------------------------- */

const LEDGER_VERTEX = /* glsl */ `
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

const LEDGER_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uFresnel;
  uniform float uClock;
  uniform vec3  uColor;
  uniform vec3  uCore;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${commonGLSL}
  void main() {
    float rim = fresnelTerm(vViewDir, vNormalW, 2.0, uFresnel);
    float run = pow(max(0.0, sin((vUv.x * 8.0 - uClock) * 6.2831853)), 10.0);
    vec3 col = mix(uColor, uCore, clamp(rim + run * 0.6, 0.0, 1.0));
    float a = (0.5 + 0.5 * rim + run * 0.4) * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The lit wheel and the release rings. `state.opacity` is the record's own. */
export function createLedgerGlowMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uOpacity: { value: 0.9 },
      uGlow: { value: 1.6 },
      uFresnel: { value: 1 },
      uClock: { value: 0 },
      uColor: { value: new Color() },
      uCore: { value: new Color() },
    }),
    vertexShader: LEDGER_VERTEX,
    fragmentShader: LEDGER_FRAGMENT,
  });
  /** @param {object} s { opacity, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uOpacity.value = s.opacity * g.opacity;
    u.uClock.value = s.clock;
    u.uGlow.value = c.ringGlow * g.glow;
    u.uFresnel.value = g.fresnel;
    u.uColor.value.copy(getColor(c.accentColor));
    u.uCore.value.copy(getColor(c.coreColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The wake ribbon                                                      */
/* -------------------------------------------------------------------- */

const RIBBON_VERTEX = /* glsl */ `
  attribute float aT;
  attribute float aSide;
  varying float vT;
  varying float vSide;
  void main() {
    vT = aT;
    vSide = aSide;
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RIBBON_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFlow;
  uniform float uFade;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uSpan;        // how many chevrons fit the recorded path
  uniform vec3  uColor;
  uniform vec3  uA;
  uniform vec3  uCore;
  uniform float uGlobalGlow;
  varying float vT;
  varying float vSide;
  void main() {
    float edge = 1.0 - smoothstep(0.55, 1.0, abs(vSide));
    float tail = smoothstep(0.0, 0.25, vT);
    // Chevrons flowing toward the newest point — toward you.
    float chev = pow(max(0.0, sin((vT * uSpan - abs(vSide) * 0.6 - uClock * uFlow) * 6.2831853)), 6.0);
    vec3 col = mix(uColor, mix(uA, uCore, chev), 0.3 + 0.7 * vT);
    float a = (0.25 + chev * 0.75) * edge * tail * (0.35 + 0.65 * vT) * uFade * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The walked path as a ribbon. */
export function createRibbonMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uFlow: { value: 2.5 },
      uFade: { value: 1 },
      uGlow: { value: 1.6 },
      uOpacity: { value: 0.8 },
      uSpan: { value: 8 },
      uColor: { value: new Color() },
      uA: { value: new Color() },
      uCore: { value: new Color() },
    }),
    vertexShader: RIBBON_VERTEX,
    fragmentShader: RIBBON_FRAGMENT,
  });
  /** @param {object} s { clock, fade, span } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uFlow.value = c.wakeFlow;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.wakeGlow * g.glow;
    u.uOpacity.value = c.wakeOpacity;
    u.uSpan.value = Math.max(1, s.span);
    u.uColor.value.copy(getColor(c.trailColor));
    u.uA.value.copy(getColor(c.accentColor));
    u.uCore.value.copy(getColor(c.coreColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The directional fan                                                  */
/* -------------------------------------------------------------------- */

const FAN_VERTEX = /* glsl */ `
  uniform float uSpread;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Laid out here so the half-angle is live: uv.x across, uv.y out.
    float a = (uv.x * 2.0 - 1.0) * uSpread;
    vec3 p = vec3(sin(a) * uv.y, 0.0, cos(a) * uv.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FAN_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uPower;
  uniform float uGlow;
  uniform vec3  uA;
  uniform vec3  uCore;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    float front = exp(-abs(vUv.y - uProgress) * 22.0);
    float wake = smoothstep(uProgress - 0.45, uProgress, vUv.y) * step(vUv.y, uProgress) * 0.35;
    float streaks = 0.6 + 0.4 * snoise(vec3(vUv.x * 18.0, vUv.y * 2.0 - uProgress * 6.0, 0.0));
    float sides = 1.0 - smoothstep(0.7, 1.0, abs(vUv.x * 2.0 - 1.0));
    float a = (front + wake) * streaks * sides * uPower * (1.0 - uProgress);
    if (a < 0.003) discard;
    gl_FragColor = vec4(mix(uA, uCore, front) * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The directional release front. */
export function createFanMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uSpread: { value: 0.9 },
      uProgress: { value: 0 },
      uPower: { value: 0 },
      uGlow: { value: 2.2 },
      uA: { value: new Color() },
      uCore: { value: new Color() },
    }),
    vertexShader: FAN_VERTEX,
    fragmentShader: FAN_FRAGMENT,
  });
  /** @param {object} s { progress, power } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSpread.value = Math.max(0.05, Math.min(Math.PI, c.fanSpread));
    u.uProgress.value = s.progress;
    u.uPower.value = s.power * g.opacity;
    u.uGlow.value = c.fanGlow * g.glow;
    u.uA.value.copy(getColor(c.accentColor));
    u.uCore.value.copy(getColor(c.coreColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Speed motes                                                          */
/* -------------------------------------------------------------------- */

const MOTE_VERTEX = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uClock;
  uniform float uRadius;
  uniform float uCharge;
  uniform float uThrow;
  uniform float uSize;
  uniform float uFade;
  uniform float uCount;
  uniform vec2  uResolution;
  varying float vAlpha;
  varying float vHot;
  void main() {
    if (aSeed.w >= uCount) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      vHot = 0.0;
      return;
    }
    float speed = (0.6 + 1.4 * aSeed.y) * (0.4 + 2.6 * uCharge);
    float ang = aSeed.x * 6.2831853 + uClock * speed;
    float rad = uRadius * mix(0.45, 1.05, aSeed.z) * (1.0 + uThrow * (0.6 + aSeed.y));
    float y = 0.12 + aSeed.y * 0.5 + sin(uClock * 2.0 + aSeed.x * 9.0) * 0.05;
    vec4 mv = modelViewMatrix * vec4(cos(ang) * rad, y, sin(ang) * rad, 1.0);
    gl_Position = projectionMatrix * mv;
    vAlpha = (0.35 + 0.65 * uCharge) * (1.0 - uThrow) * uFade;
    vHot = aSeed.y;
    gl_PointSize = uSize * uResolution.y * projectionMatrix[1][1] * 0.5 / max(0.1, -mv.z);
  }
`;

const MOTE_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uGlobalGlow;
  varying float vAlpha;
  varying float vHot;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    float soft = exp(-d * 3.0);
    gl_FragColor = vec4(mix(uColor, uHot, soft * vHot) * uGlow * uGlobalGlow, soft * vAlpha);
  }
`;

/** GPU speed motes orbiting the dial. */
export function createSpeedMoteMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uRadius: { value: 4 },
      uCharge: { value: 0 },
      uThrow: { value: 0 },
      uSize: { value: 0.05 },
      uFade: { value: 1 },
      uCount: { value: 1 },
      uGlow: { value: 1.8 },
      uColor: { value: new Color() },
      uHot: { value: new Color() },
    }),
    vertexShader: MOTE_VERTEX,
    fragmentShader: MOTE_FRAGMENT,
  });
  /** @param {object} s { clock, radius, charge, throw, fade, capacity } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uRadius.value = s.radius;
    u.uCharge.value = s.charge;
    u.uThrow.value = s.throw;
    u.uSize.value = c.speedLineSize * g.particleSize;
    u.uFade.value = s.fade * g.opacity;
    u.uCount.value = Math.min(1, (c.speedLineCount * g.particleCount) / s.capacity);
    u.uGlow.value = c.speedLineGlow * g.glow;
    u.uColor.value.copy(getColor(c.accentColor));
    u.uHot.value.copy(getColor(c.coreColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The compression lens                                                 */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uPinch;
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
    float body = smoothstep(0.0, 0.35, r) * (1.0 - smoothstep(0.5, 1.0, r));
    float ring = exp(-pow((r - uWave) / 0.09, 2.0));
    vec3 np = vec3(q * 2.2 * uScale, uClock * 0.5);
    vec2 n = vec2(snoise(np), snoise(np + vec3(3.7, 9.1, 0.4))) * 0.25;
    vec2 dir = (-radial + n) * body * uPinch + (radial + n) * ring * uShock;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(body * uPinch + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` disc. Opaque on purpose: the offset buffer wants the
 * proxy's own value, and an opaque proxy keeps the expansion's "transparent ⇒
 * VFX layer" routing from pulling it out of the warp pass.
 */
export function createCompressionLensMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uPinch: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s { pinch, shock, wave, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uPinch.value = s.pinch * c.lensStrength * g.distortion;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The flywheel (lit iron, patched)                                     */
/* -------------------------------------------------------------------- */

/**
 * `MeshStandardMaterial` for the flywheel, patched in `onBeforeCompile`:
 * teeth (`aTooth` ≥ 0) light white-hot one by one as the *banked* fraction
 * passes them (`uCharge`), the rest of the iron takes an inner glow with the
 * wind-up (`uHeat`) and a flash on the release (`uFlash`).
 */
export function createFlywheelMaterial() {
  const uniforms = {
    uCharge: { value: 0 },
    uHeat: { value: 0 },
    uFlash: { value: 0 },
    uToothIdle: { value: new Color() },
    uToothHot: { value: new Color() },
    uIronGlow: { value: new Color() },
  };
  const material = new MeshStandardMaterial({
    color: 0x3a2a28, metalness: 0.85, roughness: 0.32, side: DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTooth;\nvarying float vTooth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTooth = aTooth;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uCharge;
uniform float uHeat;
uniform float uFlash;
uniform vec3 uToothIdle;
uniform vec3 uToothHot;
uniform vec3 uIronGlow;
varying float vTooth;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float isTooth = step(0.0, vTooth);
  float lit = isTooth * step(vTooth + 0.5 / 24.0, uCharge);
  totalEmissiveRadiance += uToothIdle * isTooth * (0.35 + 0.65 * uHeat);
  totalEmissiveRadiance += uToothHot * lit * 3.0;
  totalEmissiveRadiance += uIronGlow * (uHeat * 0.6 + uFlash * 2.5);
}`);
  };
  material.customProgramCacheKey = () => 'momentum-ledger-flywheel';
  /** @param {object} s { charge, heat, flash, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    uniforms.uCharge.value = s.charge;
    uniforms.uHeat.value = s.heat * c.flywheelGlow * g.glow;
    uniforms.uFlash.value = s.flash * g.explosionIntensity;
    uniforms.uToothIdle.value.copy(getColor(c.colorWheelB));
    uniforms.uToothHot.value.copy(getColor(c.colorWheelA));
    uniforms.uIronGlow.value.copy(getColor(c.colorWheelC));
    material.color.copy(getColor(c.ironColor));
    material.metalness = c.flywheelMetalness;
    material.roughness = c.flywheelRoughness;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The spin halo                                                        */
/* -------------------------------------------------------------------- */

const HALO_FRAGMENT = /* glsl */ `
  uniform float uAngle;      // the wheel's own turn (rad)
  uniform float uBlur;       // 0 crisp teeth → 1 a smeared ring of light
  uniform float uHeat;       // the wind-up, 0..1
  uniform float uFade;
  uniform float uGlow;
  uniform float uSpan;       // halo radius in wheel radii
  uniform float uStreaks;
  uniform vec3  uA;
  uniform vec3  uB;
  uniform vec3  uC;
  uniform vec3  uD;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    if (r > 1.0) discard;
    float w = r * uSpan;                     // wheel radii
    float phi = atan(q.y, q.x) - uAngle;
    float rim = exp(-pow((w - 0.97) / 0.07, 2.0));
    float teeth = mix(pow(0.5 + 0.5 * cos(phi * 24.0), 8.0), 0.6, uBlur);
    float k = mix(3.5, 0.7, uBlur);
    float arcs = smoothstep(0.25, 0.85, snoise(vec3(w * 15.0, cos(phi) * k, sin(phi) * k)));
    arcs *= smoothstep(0.72, 0.95, w) * (1.0 - smoothstep(1.05, uSpan * 0.98, w)) * uStreaks;
    float spokes = pow(0.5 + 0.5 * cos(phi * 6.0), mix(24.0, 1.5, uBlur))
                 * smoothstep(0.24, 0.3, w) * (1.0 - smoothstep(0.76, 0.82, w)) * uBlur * 0.45;
    float hub = exp(-pow(w / 0.2, 2.0)) * 0.6;
    float e = (rim * (0.35 + teeth) + arcs * (0.4 + uBlur) + spokes + hub) * uHeat;
    vec3 col = gradient4(uA, uB, uC, uD, 1.0 - clamp(e * 0.8, 0.0, 1.0));
    float a = clamp(e, 0.0, 1.0) * uFade;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * e * uGlow * uGlobalGlow * uFade, a);
  }
`;

/** Additive disc in the flywheel's plane. */
export function createSpinHaloMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uAngle: { value: 0 },
      uBlur: { value: 0 },
      uHeat: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1 },
      uSpan: { value: 1.3 },
      uStreaks: { value: 1 },
      uA: { value: new Color() },
      uB: { value: new Color() },
      uC: { value: new Color() },
      uD: { value: new Color() },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: HALO_FRAGMENT,
  });
  /** @param {object} s { angle, blur, heat, fade, span } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uAngle.value = s.angle;
    u.uBlur.value = s.blur;
    u.uHeat.value = s.heat;
    u.uFade.value = s.fade * g.opacity;
    u.uSpan.value = s.span;
    u.uGlow.value = c.haloGlow * g.glow;
    u.uStreaks.value = c.haloStreaks * g.shaderIntensity;
    u.uA.value.copy(getColor(c.colorWheelA));
    u.uB.value.copy(getColor(c.colorWheelB));
    u.uC.value.copy(getColor(c.colorWheelC));
    u.uD.value.copy(getColor(c.colorWheelD));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The ledger plate (floor)                                             */
/* -------------------------------------------------------------------- */

const PLATE_FRAGMENT = /* glsl */ `
  uniform float uCharge;     // banked fraction (honest)
  uniform float uWind;       // wind-up, 0..1
  uniform float uSpin;       // the flywheel's turn
  uniform float uScorch;     // −1 before the release, 0 → 1 cooling after
  uniform vec2  uFlow;       // banked direction in the plate's frame
  uniform float uSpread;
  uniform float uFade;
  uniform float uDissolve;
  uniform float uBurn;
  uniform float uEngrave;
  uniform float uGlow;
  uniform float uScale;
  uniform vec3  uA;
  uniform vec3  uB;
  uniform vec3  uC;
  uniform vec3  uD;
  uniform vec3  uIron;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    if (r > 1.0) discard;
    float phi = atan(q.y, q.x);
    float n = fbm3(vec3(q * 3.5 * uScale, 1.7));

    // The plate: hammered cast iron, its edge chipped by noise.
    float plate = 1.0 - smoothstep(0.93, 1.0, r + (n - 0.5) * 0.08);

    // Engraving: ledger columns (concentric grooves) and a tick ring.
    float grooves = 0.0;
    grooves += exp(-pow((r - 0.30) / 0.007, 2.0));
    grooves += exp(-pow((r - 0.56) / 0.007, 2.0));
    grooves += exp(-pow((r - 0.74) / 0.007, 2.0));
    grooves += exp(-pow((r - 0.90) / 0.009, 2.0));
    float ticks = step(0.9, r) * step(r, 0.965) * pow(abs(cos(phi * 48.0)), 40.0);

    // Radial grooves that turn with the wheel — the idle motion.
    float spinBand = smoothstep(0.31, 0.34, r) * (1.0 - smoothstep(0.53, 0.56, r));
    float radial = pow(abs(sin((phi - uSpin * 0.35) * 12.0)), 26.0) * spinBand;

    // The bank: a sector filled from the front, clockwise, to the banked share.
    float sweep = fract(0.25 - phi / 6.2831853);
    float bankBand = smoothstep(0.575, 0.59, r) * (1.0 - smoothstep(0.715, 0.73, r));
    float bank = bankBand * step(sweep, uCharge) * (0.6 + 0.4 * n);

    // Wind: a dashed ring that brightens and runs with the wind-up.
    float windRing = exp(-pow((r - 0.8) / 0.03, 2.0))
                   * pow(0.5 + 0.5 * sin(phi * 16.0 - uSpin * 0.8), 3.0) * uWind;

    // After the release: a burnt wedge thrown along the banked direction,
    // ember skid lines combed along it, cooling over the linger.
    vec2 f = length(uFlow) > 1e-3 ? normalize(uFlow) : vec2(0.0, 1.0);
    float along = dot(q, f);
    float across = dot(q, vec2(-f.y, f.x));
    float released = step(0.0, uScorch);
    float wedge = smoothstep(-0.05, 0.15, along) * (1.0 - smoothstep(uSpread * max(along, 0.0) + 0.12, uSpread * max(along, 0.0) + 0.3, abs(across) + (n - 0.5) * 0.2));
    wedge *= released * (1.0 - smoothstep(0.85, 1.0, r));
    float embers = pow(abs(cos(across * 34.0 + n * 5.0)), 22.0) * wedge
                 * smoothstep(0.1, 0.6, snoise(vec3(along * 6.0 * uScale, across * 20.0, 3.0)) + 0.5);
    float cool = released * clamp(1.0 - uScorch, 0.0, 1.0);

    // Colour: iron in the deep tone, engraving catching a dim tint, the live
    // readouts and the embers through the ramp.
    float hot = clamp(bank * 0.9 + windRing + embers * cool, 0.0, 1.0);
    vec3 base = mix(uIron * (0.35 + 0.3 * n), uD, wedge * 0.85);
    vec3 engraved = uB * (grooves * 0.5 + ticks * 0.6) * uEngrave * (0.4 + 0.6 * uWind);
    vec3 live = gradient4(uA, uB, uC, uD, 1.0 - hot) * (bank * 1.4 + windRing * 1.2 + radial * (0.25 + uWind) * 0.8 + embers * cool * 2.2);
    vec3 col = base + (engraved + live) * uGlow * uGlobalGlow;

    float alpha = plate * uBurn;
    vec2 dm = dissolveMask(snoise01(vec3(q * 3.0, 9.0)), uDissolve, 0.06);
    col += uB * dm.y * 2.5;
    alpha *= dm.x * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The cast-iron floor plate under the dial. Normal-blended. */
export function createLedgerPlateMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: sharedUniforms({
      uCharge: { value: 0 },
      uWind: { value: 0 },
      uSpin: { value: 0 },
      uScorch: { value: -1 },
      uFlow: { value: new Vector2(0, 1) },
      uSpread: { value: 0.9 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uBurn: { value: 0.9 },
      uEngrave: { value: 1 },
      uGlow: { value: 1 },
      uScale: { value: 1 },
      uA: { value: new Color() },
      uB: { value: new Color() },
      uC: { value: new Color() },
      uD: { value: new Color() },
      uIron: { value: new Color() },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: PLATE_FRAGMENT,
  });
  /** @param {object} s { charge, wind, spin, scorch, flowX, flowY, fade, dissolve } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCharge.value = s.charge;
    u.uWind.value = s.wind;
    u.uSpin.value = s.spin;
    u.uScorch.value = s.scorch;
    u.uFlow.value.set(s.flowX, s.flowY);
    u.uSpread.value = Math.tan(Math.max(0.05, Math.min(1.4, c.fanSpread)));
    u.uFade.value = s.fade * g.opacity;
    u.uDissolve.value = s.dissolve;
    u.uBurn.value = c.plateOpacity;
    u.uEngrave.value = c.plateEngrave * g.shaderIntensity;
    u.uGlow.value = c.plateGlow * g.glow;
    u.uScale.value = g.noiseFrequency;
    u.uA.value.copy(getColor(c.colorWheelA));
    u.uB.value.copy(getColor(c.colorWheelB));
    u.uC.value.copy(getColor(c.colorWheelC));
    u.uD.value.copy(getColor(c.colorWheelD));
    u.uIron.value.copy(getColor(c.ironColor));
  };
  return material;
}
