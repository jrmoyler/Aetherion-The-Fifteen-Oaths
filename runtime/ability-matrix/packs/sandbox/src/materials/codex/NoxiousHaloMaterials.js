import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Noxious Halo — the bespoke shaders the noose is drawn with.
 *
 *  - **the gas ring** — a parameter grid wrapped into a torus in the vertex
 *    stage. The ring turns (`uSpin`) and the gas *rolls* round the tube
 *    (`uRoll`), and both are integrated on the CPU so a slider never makes
 *    it jump. The tube is lumpy on noise and the ring rocks. The gas is
 *    shaded thick-in-the-middle (looking through more of it), banded by dark
 *    twisted lanes that spiral round the ring, and brightens with `uTension`
 *    as the noose closes.
 *  - **the core** — the same torus, thin, additive: a white-hot filament at
 *    the heart of the gas — the *halo* in it.
 *  - **the haze** — the torus again, fattened, on `LAYER.DISTORTION`.
 *  - **the curtain** — an open cylinder hung from the ring to the floor, its
 *    foot wider than its head, so as the ring tightens the curtain becomes a
 *    cone of fume being dragged in. Thin vertical strands of fume slide down
 *    it and drip toward the floor as it first unrolls.
 *  - **the ground** — a disc: a toxic ring of light under the halo following
 *    its radius, suction streaks between that ring and the edge of the
 *    circle pointing in, and a dark stain inside that deepens.
 *  - **the pop** — a flat annulus at the halo's height opening outward with a
 *    ragged leading edge, and its twin on the distortion layer.
 *
 * Every material reads `settings.noxioushalo` in `userData.sync(state)`.
 */

const ID = 'noxioushalo';

/* -------------------------------------------------------------------- */
/* The torus                                                            */
/* -------------------------------------------------------------------- */

const TORUS_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRingR;
  uniform float uTubeR;
  uniform float uSpin;
  uniform float uRoll;
  uniform float uLumps;
  uniform float uLumpScale;
  uniform float uWobble;
  uniform float uScale;
  uniform float uSeed;
  uniform float uTime;

  varying vec2  vUV;          // x round the ring, y round the tube (rolled)
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float a = position.x * 6.2831853 + uSpin;
    float b = position.y * 6.2831853;
    vec3 out_ = vec3(cos(a), 0.0, sin(a));
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 n = cos(b) * out_ + sin(b) * up;
    float rr = uRingR * uScale;
    vec3 ringP = uCenter + out_ * uRingR;
    ringP.y += sin(position.x * 6.2831853 * 2.0 + uTime * 1.3 + uSeed) * uWobble;
    float lump = snoise(vec3(cos(a) * uRingR * uLumpScale * 0.5, sin(a) * uRingR * uLumpScale * 0.5, b * 0.6 + uRoll * 0.3 + uSeed));
    float r = uTubeR * uScale * (1.0 + uLumps * lump);
    vec3 world = ringP + n * r;
    vUV = vec2(position.x, position.y + uRoll / 6.2831853);
    vNormalW = n;
    vViewDir = cameraPosition - world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

function torusUniforms() {
  return {
    uCenter: { value: new Vector3() },
    uRingR: { value: 4 },
    uTubeR: { value: 0.3 },
    uSpin: { value: 0 },
    uRoll: { value: 0 },
    uLumps: { value: 0.3 },
    uLumpScale: { value: 1.5 },
    uWobble: { value: 0.2 },
    uScale: { value: 1 },
    uSeed: { value: 0 }
  };
}

/** @param {object} state { center, ringR, tubeR, spin, roll, seed } */
function syncTorus(u, state) {
  const c = settings[ID];
  const g = settings.global;
  u.uCenter.value.copy(state.center);
  u.uRingR.value = Math.max(0.02, state.ringR);
  u.uTubeR.value = Math.max(0.005, state.tubeR);
  u.uSpin.value = state.spin;
  u.uRoll.value = state.roll;
  u.uLumps.value = c.lumps * g.noiseStrength;
  u.uLumpScale.value = c.lumpScale * g.noiseFrequency;
  u.uWobble.value = c.wobble * g.noiseStrength;
  u.uSeed.value = state.seed;
}

const GAS_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uBands;
  uniform float uTwist;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uRimGlow;
  uniform float uTension;     // 0 hanging .. 1 closed
  uniform float uFade;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorD;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2  vUV;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float facing = abs(dot(N, V));
    float fres = pow(1.0 - facing, 2.0);
    // Dark lanes spiral round the ring as the gas rolls.
    float lane = sin((vUV.y * uBands + vUV.x * uTwist) * 6.2831853);
    float n = fbm3(vec3(vUV.x * 18.0, vUV.y * 4.0, uTime * 0.6 + uSeed)) * uShaderIntensity;
    float dark = smoothstep(0.1, 0.9, lane + n * 0.8);
    float heat = clamp(facing * 0.55 + (n * 0.5 + 0.5) * 0.35 + uTension * 0.35 - dark * 0.5, 0.0, 1.0);
    vec3 col = gradient4(uColorA, uColorB, uColorC, uColorD, 1.0 - heat);
    col *= uGlow * (1.0 + uTension * 0.8);
    col += uColorB * fres * uRimGlow;
    float a = uOpacity * (0.55 + 0.45 * facing) * (1.0 - fres * 0.5) * uFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The ring of gas. */
export function createGasRingMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...torusUniforms(),
      uBands: { value: 4 },
      uTwist: { value: 6 },
      uOpacity: { value: 0.85 },
      uGlow: { value: 1.6 },
      uRimGlow: { value: 1.4 },
      uTension: { value: 0 },
      uFade: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorD: { value: new Color() }
    }),
    vertexShader: TORUS_VERTEX,
    fragmentShader: GAS_FRAGMENT
  });
  /** @param {object} state torus state plus { tension, glow, fade } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncTorus(u, state);
    u.uScale.value = 1;
    u.uBands.value = Math.max(1, Math.round(c.bands));
    u.uTwist.value = Math.round(c.bandTwist);
    u.uOpacity.value = c.gasOpacity * g.opacity;
    u.uGlow.value = c.gasGlow * g.glow * state.glow;
    u.uRimGlow.value = c.rimGlow * g.fresnel;
    u.uTension.value = state.tension;
    u.uFade.value = state.fade;
    u.uColorA.value.copy(getColor(c.colorGasA));
    u.uColorB.value.copy(getColor(c.colorGasB));
    u.uColorC.value.copy(getColor(c.colorGasC));
    u.uColorD.value.copy(getColor(c.colorGasD));
  };
  return material;
}

const CORE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform float uFade;
  uniform vec3  uColor;
  uniform float uGlobalGlow;
  varying vec2  vUV;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  void main() {
    float facing = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    float beads = 0.65 + 0.35 * sin(vUV.x * 6.2831853 * 9.0 - uTime * 6.0);
    float m = pow(facing, 1.2) * beads * uFade;
    if (m < 0.004) discard;
    gl_FragColor = vec4(uColor * uGlow * m * uGlobalGlow, m);
  }
`;

/** The white-hot filament at the heart of the gas — additive. */
export function createCoreRingMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...torusUniforms(),
      uGlow: { value: 5 },
      uFade: { value: 1 },
      uColor: { value: new Color() }
    }),
    vertexShader: TORUS_VERTEX,
    fragmentShader: CORE_FRAGMENT
  });
  /** @param {object} state torus state plus { glow, fade } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncTorus(u, state);
    u.uTubeR.value = Math.max(0.005, c.coreWidth * (state.tubeR / Math.max(0.01, c.tubeRadius)));
    u.uLumps.value = 0;
    u.uScale.value = 1;
    u.uGlow.value = c.coreGlow * g.glow * state.glow;
    u.uFade.value = state.fade * g.opacity;
    u.uColor.value.copy(getColor(c.colorCore));
  };
  return material;
}

const HAZE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uNoiseScale;
  uniform float uNoiseSpeed;
  uniform float uSeed;
  uniform float uShaderIntensity;
  varying vec2  vUV;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  ${noiseGLSL}
  void main() {
    float through = pow(abs(dot(normalize(vNormalW), normalize(vViewDir))), 1.5);
    vec3 np = vec3(vUV.x * 24.0 * uNoiseScale, vUV.y * 3.0, uTime * uNoiseSpeed + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(5.3, 9.1, 2.2)));
    float strength = uStrength * uShaderIntensity * through;
    if (strength < 0.002) discard;
    float len = length(n);
    if (len > 1.0) n /= len;
    gl_FragColor = vec4(n * 0.5 + 0.5, strength, through);
  }
`;

/** The air bending round the ring — LAYER.DISTORTION. */
export function createHaloHazeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...torusUniforms(),
      uStrength: { value: 1 },
      uNoiseScale: { value: 2 },
      uNoiseSpeed: { value: 2.5 }
    }),
    vertexShader: TORUS_VERTEX,
    fragmentShader: HAZE_FRAGMENT
  });
  /** @param {object} state torus state plus { fade } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncTorus(u, state);
    u.uScale.value = Math.max(1, c.hazeWidth);
    u.uLumps.value = 0;
    u.uStrength.value = c.hazeStrength * g.distortion * state.fade;
    u.uNoiseScale.value = c.hazeScale * g.noiseFrequency;
    u.uNoiseSpeed.value = c.hazeSpeed * g.noiseSpeed;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The curtain                                                          */
/* -------------------------------------------------------------------- */

const CURTAIN_VERTEX = /* glsl */ `
  uniform vec3  uCenter;      // on the floor
  uniform float uTopR;
  uniform float uFootR;
  uniform float uTopY;
  uniform float uSpin;
  varying vec2  vP;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  void main() {
    float a = position.x * 6.2831853 + uSpin * 0.6;
    float y = position.y;
    float r = mix(uFootR, uTopR, pow(y, 0.7));
    vec3 world = uCenter + vec3(cos(a) * r, y * uTopY, sin(a) * r);
    vP = position.xy;
    vNormalW = vec3(cos(a), 0.0, sin(a));
    vViewDir = cameraPosition - world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const CURTAIN_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uStrands;
  uniform float uSharp;
  uniform float uFlow;        // integrated slide
  uniform float uReach;       // 0..1 how far down it has dripped
  uniform float uGlow;
  uniform float uOpacity;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;
  varying vec2  vP;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  ${noiseGLSL}
  void main() {
    float x = vP.x;
    float y = vP.y;
    float wav = snoise(vec3(x * uStrands * 0.5, y * 2.0 + uFlow, uSeed)) * 0.25;
    float strand = pow(0.5 + 0.5 * sin((x * uStrands + wav) * 6.2831853), max(uSharp, 0.5));
    // Drips: each strand reaches its own length as the curtain unrolls.
    float len = uReach * (0.75 + 0.35 * snoise(vec3(floor(x * uStrands + wav + 0.5), 3.1, uSeed)));
    float reached = smoothstep(1.0 - len - 0.08, 1.0 - len, y);
    float slide = 0.55 + 0.45 * snoise(vec3(x * uStrands * 0.7, y * 3.0 + uFlow * 1.5, uSeed + 4.0));
    float edge = smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.9, 1.0, y));
    float side = 0.35 + 0.65 * abs(dot(normalize(vNormalW), normalize(vViewDir)));
    float m = strand * slide * reached * edge * side * uOpacity;
    if (m < 0.004) discard;
    vec3 col = mix(uColorB, uColorA, strand * slide) * uGlow;
    gl_FragColor = vec4(col * m * uGlobalGlow, m);
  }
`;

/** The fume hanging off the ring. Additive. */
export function createCurtainMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uTopR: { value: 4 },
      uFootR: { value: 4.5 },
      uTopY: { value: 2.6 },
      uSpin: { value: 0 },
      uSeed: { value: 0 },
      uStrands: { value: 30 },
      uSharp: { value: 5 },
      uFlow: { value: 0 },
      uReach: { value: 0 },
      uGlow: { value: 1.5 },
      uOpacity: { value: 0.5 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: CURTAIN_VERTEX,
    fragmentShader: CURTAIN_FRAGMENT
  });
  /** @param {object} state { center, ringR, topY, spin, flow, reach, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    const R = Math.max(0.3, c.zoneRadius * c.haloRadius);
    u.uCenter.value.copy(state.center);
    u.uTopR.value = Math.max(0.02, state.ringR);
    u.uFootR.value = Math.max(state.ringR, R) * (1 + c.curtainFlare) - (R - state.ringR) * 0.35;
    u.uTopY.value = Math.max(0.1, state.topY);
    u.uSpin.value = state.spin;
    u.uSeed.value = state.seed;
    u.uStrands.value = Math.max(1, Math.round(c.strands));
    u.uSharp.value = c.strandSharp;
    u.uFlow.value = state.flow;
    u.uReach.value = state.reach;
    u.uGlow.value = c.curtainGlow * g.glow * state.glow;
    u.uOpacity.value = c.curtainOpacity * g.opacity * state.fade;
    u.uColorA.value.copy(getColor(c.colorCurtainA));
    u.uColorB.value.copy(getColor(c.colorCurtainB));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The ground                                                           */
/* -------------------------------------------------------------------- */

const FLAT_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  uniform float uLift;
  varying vec2 vXZ;
  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uSize;
    world.y = uCenter.y + uLift;
    vXZ = position.xy * uSize;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;      // the circle
  uniform float uRingR;       // the halo's radius now
  uniform float uRingW;
  uniform float uRingGlow;
  uniform float uStreaks;
  uniform float uStreakGlow;
  uniform float uTension;
  uniform float uShow;        // 0..1 fading in
  uniform float uStain;       // 0..1 how dark inside
  uniform float uStainOpacity;
  uniform float uErode;
  uniform float uFadeT;
  uniform float uOpacity;
  uniform vec3  uColorRing;
  uniform vec3  uColorStain;
  uniform vec3  uColorStreak;
  uniform float uGlobalGlow;
  varying vec2 vXZ;
  ${noiseGLSL}
  void main() {
    float r = length(vXZ);
    float a = atan(vXZ.y, vXZ.x);
    float wob = snoise(vec3(cos(a) * 2.0, sin(a) * 2.0, uTime * 0.6 + uSeed)) * 0.08;
    float ring = exp(-pow((r - uRingR - wob) / max(uRingW, 0.01), 2.0)) * uShow;
    // Suction streaks between the halo and the edge of the circle.
    float lines = pow(0.5 + 0.5 * sin(a * uStreaks + snoise(vec3(r * 0.6, uSeed, 0.0)) * 2.0), 8.0);
    float band = smoothstep(uRingR, uRingR + 0.4, r) * (1.0 - smoothstep(uRadius * 0.9, uRadius * 1.15, r));
    float crawl = 0.5 + 0.5 * sin(r * 4.0 + uTime * 9.0);
    float streak = lines * band * crawl * uTension * uShow;
    float inside = 1.0 - smoothstep(uRingR * 0.9, uRingR * 1.1 + 0.3, r);
    float edge = 1.0 - smoothstep(uRadius * 1.05, uRadius * 1.25, r);
    float stainN = fbm3(vec3(vXZ * 0.9, uSeed)) * 0.5 + 0.5;
    float stain = max(inside * uStain, edge * uStain * 0.45) * (0.6 + 0.4 * stainN);

    vec3 col = uColorStain * (0.7 + 0.5 * stainN);
    col += (uColorRing * ring * uRingGlow + uColorStreak * streak * uStreakGlow) * uGlobalGlow;
    float alpha = max(stain * uStainOpacity, max(ring, streak * 0.8));
    float n = snoise(vec3(vXZ * 0.9, uSeed * 5.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(0.55, n, uErode));
    alpha *= vis * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The floor under the noose. */
export function createHaloGroundMaterial() {
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
      uCenter: { value: new Vector3() },
      uSize: { value: 6 },
      uLift: { value: 0.017 },
      uSeed: { value: 0 },
      uRadius: { value: 4.5 },
      uRingR: { value: 4.5 },
      uRingW: { value: 0.15 },
      uRingGlow: { value: 2.5 },
      uStreaks: { value: 26 },
      uStreakGlow: { value: 1.4 },
      uTension: { value: 0 },
      uShow: { value: 0 },
      uStain: { value: 0 },
      uStainOpacity: { value: 0.7 },
      uErode: { value: 0.7 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uColorRing: { value: new Color() },
      uColorStain: { value: new Color() },
      uColorStreak: { value: new Color() }
    }),
    vertexShader: FLAT_VERTEX,
    fragmentShader: GROUND_FRAGMENT
  });
  /** @param {object} state { center, ringR, tension, show, stain, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    const R = Math.max(0.3, c.zoneRadius);
    u.uCenter.value.copy(state.center);
    u.uSize.value = R * 1.3;
    u.uSeed.value = state.seed;
    u.uRadius.value = R;
    u.uRingR.value = state.ringR;
    u.uRingW.value = c.ringWidth;
    u.uRingGlow.value = c.ringGlow * g.glow * state.glow;
    u.uStreaks.value = Math.round(c.streaks);
    u.uStreakGlow.value = c.streakGlow * g.glow;
    u.uTension.value = state.tension;
    u.uShow.value = state.show;
    u.uStain.value = state.stain;
    u.uStainOpacity.value = c.stainOpacity;
    u.uErode.value = c.erode;
    u.uFadeT.value = state.fadeT;
    u.uOpacity.value = g.opacity;
    u.uColorRing.value.copy(getColor(c.colorRing));
    u.uColorStain.value.copy(getColor(c.colorStain));
    u.uColorStreak.value.copy(getColor(c.colorStreak));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The pop                                                              */
/* -------------------------------------------------------------------- */

const POP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uProgress;
  uniform float uInner;       // 0..1 where it starts, × the full radius
  uniform float uWidth;
  uniform float uGlow;
  uniform vec3  uColor;
  uniform float uGlobalGlow;
  varying vec2 vXZ;
  ${noiseGLSL}
  void main() {
    vec2 uv = vXZ;
    float r = length(uv);
    if (r > 1.0) discard;
    float a = atan(uv.y, uv.x);
    float R = mix(uInner, 0.95, 1.0 - pow(1.0 - uProgress, 2.5));
    float rag = snoise(vec3(cos(a) * 4.0, sin(a) * 4.0, uSeed + uProgress * 3.0)) * 0.06;
    float w = max(uWidth, 0.02) * (0.4 + 0.6 * uProgress);
    float d = (r - R - rag) / w;
    float shell = exp(-d * d * 2.0) + smoothstep(0.0, -2.5, d) * exp(d * 0.6) * 0.35;
    float wisps = 0.55 + 0.45 * snoise(vec3(uv * 5.0, uTime * 2.0 + uSeed));
    float fade = pow(1.0 - uProgress, 1.5);
    float m = shell * wisps * fade;
    if (m < 0.004) discard;
    gl_FragColor = vec4(uColor * uGlow * m * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

const POP_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vXZ;
  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uSize;
    vXZ = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

/** The blast ring of gas, flat, at the halo's height. Additive. */
export function createPopRingMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 7 },
      uSeed: { value: 0 },
      uProgress: { value: 0 },
      uInner: { value: 0.1 },
      uWidth: { value: 0.3 },
      uGlow: { value: 3 },
      uColor: { value: new Color() }
    }),
    vertexShader: POP_VERTEX,
    fragmentShader: POP_FRAGMENT
  });
  /** @param {object} state { center, progress, inner, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.3, c.zoneRadius * c.popRadius * g.explosionIntensity);
    u.uSeed.value = state.seed;
    u.uProgress.value = state.progress;
    u.uInner.value = state.inner;
    u.uWidth.value = c.popWidth;
    u.uGlow.value = c.popGlow * g.glow * g.opacity;
    u.uColor.value.copy(getColor(c.colorPop));
  };
  return material;
}

const POP_WARP_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uInner;
  uniform float uWidth;
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec2 vXZ;
  void main() {
    float r = length(vXZ);
    if (r > 1.0) discard;
    float R = mix(uInner, 0.95, 1.0 - pow(1.0 - uProgress, 2.5));
    float d = (r - R) / max(uWidth, 0.02);
    float slope = -d * exp(-d * d);
    vec2 dir = vXZ / max(r, 1e-4);
    float mask = exp(-d * d) * (1.0 - uProgress);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * clamp(slope * 2.0, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** The pop's bend in the air — LAYER.DISTORTION. */
export function createPopWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 7 },
      uProgress: { value: 0 },
      uInner: { value: 0.1 },
      uWidth: { value: 0.3 },
      uStrength: { value: 1 }
    }),
    vertexShader: POP_VERTEX,
    fragmentShader: POP_WARP_FRAGMENT
  });
  /** @param {object} state { center, progress, inner } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.3, c.zoneRadius * c.popRadius * g.explosionIntensity * 1.05);
    u.uProgress.value = state.progress;
    u.uInner.value = state.inner;
    u.uWidth.value = c.popWidth * 0.8;
    u.uStrength.value = c.popWarp * g.distortion;
  };
  return material;
}
