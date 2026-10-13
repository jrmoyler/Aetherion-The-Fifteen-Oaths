import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Nebula Collapse — the bespoke shaders the dying cloud is drawn with.
 *
 *  - **gas puffs** (`createNebulaGasMaterial`) — instanced billboards placed in
 *    the vertex stage from dice (`NEBULA_PLACE_GLSL`): a flattened cloud that
 *    turns faster at its heart than at its rim (so the turning shears it into
 *    a spiral), falls in from the inside out as it collapses, and is blown
 *    out again by the supernova. Each puff is a domain-warped fbm wisp with
 *    ridged filaments, coloured between violet, teal and pink, and heated
 *    toward white-gold as it is compressed. Additive, soft against the stage.
 *  - **embedded stars** (`createNebulaStarMaterial`) — the same placement,
 *    tiny: a hot core, a halo and four diffraction spikes, twinkling. They are
 *    swallowed with the gas and flare as they go.
 *  - **the protostar** (`createProtostarMaterial`) — a sphere boiling with
 *    granulation cells, limb-brightened, white-hot at the centre.
 *  - **the corona** (`createCoronaMaterial`) — a billboard round the core:
 *    flickering radial streamers and a soft glow falloff.
 *  - **the accretion disk** (`createAccretionDiskMaterial`) — a flat ring laid
 *    in a tilted basis from uniforms: logarithmic spiral arms that wind tighter
 *    toward the inner edge (the inside orbits faster), white-hot inside and
 *    violet out, brighter on the limb that turns toward the camera.
 *  - **the supernova shell** (`createNovaShellMaterial`) — a sphere: a thin
 *    fresnel shell threaded with ridged filaments, hottest on its leading
 *    edge, cooling through pink and violet to teal as it expands and tearing
 *    away on a noise threshold.
 *  - **the ground** (`createNebulaGroundMaterial`) — under the circle: the
 *    cloud's glow reflected on the floor while it gathers, gravity ripples
 *    running *inward* while it collapses, and at the supernova a chromatic
 *    shock front sweeping out with a scorched starburst of rays behind it.
 *  - **the remnant ring** (`createRemnantRingMaterial`) — the faint glowing
 *    ring the blast leaves hanging in the air, wispy and slowly widening.
 *  - **the lens** (`createNebulaLensMaterial`) — a billboard on
 *    `LAYER.DISTORTION`: the collapsing mass pinching the image toward the
 *    core, then a ring of push riding the shell out.
 *
 * Every material reads `settings.nebula` in `userData.sync(state)`; `state`
 * carries only what the ability knows that the settings do not (the clocks,
 * envelopes and integrated phases).
 */

/* -------------------------------------------------------------------- */
/* Shared placement — gas and stars                                     */
/* -------------------------------------------------------------------- */

const NEBULA_PLACE_GLSL = /* glsl */ `
  attribute vec4 aDice;       // bearing, radial 0..1, height -1..1, size jitter
  attribute vec4 aSeed;       // seed, colour pick, spin jitter, flicker phase

  uniform vec3  uCentre;      // the cloud's heart, world
  uniform float uRadius;      // metres
  uniform float uThick;       // half-thickness, metres
  uniform float uAngle;       // integrated rotation, rad
  uniform float uShear;       // 0..1 how much faster the inside turns
  uniform float uContract;    // 0..1 the collapse
  uniform float uInfall;      // 0..1 how much the inside leads the outside
  uniform float uWind;        // extra turns wound in as it falls, rad
  uniform float uCoreRadius;  // metres it collapses into
  uniform float uBlast;       // 0..1 blown out
  uniform float uBlastRadius; // metres

  /** Where this instance is, and how collapsed (x) and blown out (y) it is. */
  vec3 placeDice(out vec2 state) {
    float rad = aDice.y;
    // The inside falls first: a body's own clock, led by the core.
    float k = clamp(uContract * (1.0 + uInfall) - rad * uInfall, 0.0, 1.0);
    k = k * k * (3.0 - 2.0 * k);
    float b = clamp(uBlast * (1.0 + 0.35 * aSeed.x), 0.0, 1.0);
    state = vec2(k, b);

    float spin = uAngle * (1.0 + aSeed.z * 0.2) * mix(1.0, 1.0 / (0.3 + rad), uShear);
    float ang = aDice.x + spin + uWind * k * (1.0 - rad * 0.5);
    float r = mix(rad * uRadius, rad * uCoreRadius, k);
    float y = aDice.z * mix(uThick, uCoreRadius * 0.3, k);
    float outR = uBlastRadius * (0.35 + 0.65 * rad) * (0.8 + 0.4 * aSeed.x);
    r = mix(r, outR, b);
    y = mix(y, aDice.z * uThick * 1.4, b);
    return uCentre + vec3(cos(ang) * r, y, sin(ang) * r);
  }
`;

function placeUniforms() {
  return {
    uCentre: { value: new Vector3() },
    uRadius: { value: 5 },
    uThick: { value: 1 },
    uAngle: { value: 0 },
    uShear: { value: 0.5 },
    uContract: { value: 0 },
    uInfall: { value: 0.6 },
    uWind: { value: 2 },
    uCoreRadius: { value: 0.5 },
    uBlast: { value: 0 },
    uBlastRadius: { value: 10 }
  };
}

/** The placement uniforms both cloud layers share. */
function syncPlace(u, state) {
  const c = settings.nebula;
  u.uCentre.value.copy(state.centre);
  u.uRadius.value = state.radius;
  u.uThick.value = c.cloudThickness;
  u.uAngle.value = state.angle;
  u.uShear.value = c.cloudShear;
  u.uContract.value = state.contract;
  u.uInfall.value = c.infallLead;
  u.uWind.value = c.infallWind;
  u.uCoreRadius.value = c.coreRadius * c.collapseTo;
  u.uBlast.value = state.blast;
  u.uBlastRadius.value = state.blastRadius;
}

/* -------------------------------------------------------------------- */
/* Gas puffs                                                            */
/* -------------------------------------------------------------------- */

const GAS_VERTEX = /* glsl */ `
  uniform float uPuffSize;
  uniform float uSizeJitter;
  uniform float uCoreSize;    // size scale once collapsed
  uniform float uBlastSize;   // size scale once blown out

  varying vec2  vUv;
  varying vec4  vSeed;
  varying vec3  vState;       // collapsed, blown, radial
  varying float vViewZ;

  ${NEBULA_PLACE_GLSL}

  void main() {
    vec2 st;
    vec3 centre = placeDice(st);
    vState = vec3(st, aDice.y);
    vSeed = aSeed;
    float size = uPuffSize * (1.0 + aDice.w * uSizeJitter) * mix(1.0, uCoreSize, st.x) * mix(1.0, uBlastSize, st.y);
    // Each puff turned on its own, so the cloud is not a grid of squares.
    float a = aSeed.x * 6.2831853;
    vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
    vUv = q + 0.5;
    vec4 mv = viewMatrix * vec4(centre, 1.0);
    mv.xy += position.xy * size;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const GAS_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uFlow;        // integrated churn
  uniform float uNoiseScale;
  uniform float uWisp;        // 0..1 filament share
  uniform float uDensity;
  uniform float uGlow;
  uniform float uHeat;        // 0..1 compression heating
  uniform float uFade;
  uniform float uSoftFade;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorHot;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vUv;
  varying vec4  vSeed;
  varying vec3  vState;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;

    // Domain-warped churn: the gas folds over itself.
    vec3 q = vec3(p * uNoiseScale, uFlow + vSeed.x * 17.0);
    vec2 w = vec2(snoise(q * 0.7), snoise(q * 0.7 + vec3(5.2, 1.3, 2.8)));
    float n = fbm3(q + vec3(w * 0.9, 0.0));
    float fil = 1.0 - abs(snoise(q * 1.6 + vec3(w, 3.1)));
    fil = pow(fil, 4.0);

    float body = 1.0 - smoothstep(0.15, 1.0, r + n * 0.35);
    float cloud = body * (smoothstep(-0.45, 0.6, n) * (1.0 - uWisp) + fil * uWisp * 1.6);
    float density = clamp(cloud * uDensity, 0.0, 1.0);

    // Colour: a pick between the three gases, heated toward white-gold.
    float pick = fract(vSeed.y + n * 0.25);
    vec3 col = pick < 0.5 ? mix(uColorA, uColorB, smoothstep(0.0, 1.0, pick * 2.0))
                          : mix(uColorB, uColorC, smoothstep(0.0, 1.0, pick * 2.0 - 1.0));
    float heat = uHeat * vState.x * (1.0 - vState.z * 0.6);
    col = mix(col, uColorHot, clamp(heat, 0.0, 1.0) * 0.75);
    col *= 0.6 + 0.8 * fil;
    // Compression brightens it; a blown-out wisp cools and dims.
    float bright = uGlow * (1.0 + heat * 1.5) * (1.0 - vState.y * 0.55);

    float alpha = density * uFade;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col * bright * uGlobalGlow * uShaderIntensity, clamp(alpha, 0.0, 1.0));
  }
`;

export function createNebulaGasMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...placeUniforms(),
      uPuffSize: { value: 3 },
      uSizeJitter: { value: 0.4 },
      uCoreSize: { value: 0.3 },
      uBlastSize: { value: 1.6 },
      uFlow: { value: 0 },
      uNoiseScale: { value: 1.4 },
      uWisp: { value: 0.4 },
      uDensity: { value: 1 },
      uGlow: { value: 1 },
      uHeat: { value: 0 },
      uFade: { value: 0 },
      uSoftFade: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: GAS_VERTEX,
    fragmentShader: GAS_FRAGMENT
  });

  /** @param {object} state { centre, radius, angle, contract, blast, blastRadius, flow, heat, fade } */
  material.userData.sync = (state) => {
    const c = settings.nebula;
    const g = settings.global;
    const u = material.uniforms;
    syncPlace(u, state);
    u.uPuffSize.value = c.puffSize;
    u.uSizeJitter.value = c.puffSizeJitter * g.randomness;
    u.uCoreSize.value = c.puffCoreSize;
    u.uBlastSize.value = c.puffBlastSize;
    u.uFlow.value = state.flow;
    u.uNoiseScale.value = c.gasNoiseScale * g.noiseFrequency;
    u.uWisp.value = c.gasFilaments;
    u.uDensity.value = c.gasDensity * g.opacity;
    u.uGlow.value = c.gasGlow * g.glow;
    u.uHeat.value = state.heat;
    u.uFade.value = state.fade;
    u.uSoftFade.value = c.gasSoftFade;
    u.uColorA.value.copy(getColor(c.colorA));
    u.uColorB.value.copy(getColor(c.colorGasB));
    u.uColorC.value.copy(getColor(c.colorGasC));
    u.uColorHot.value.copy(getColor(c.colorHot));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* Embedded stars                                                       */
/* -------------------------------------------------------------------- */

const STAR_VERTEX = /* glsl */ `
  uniform float uStarSize;
  uniform float uFlare;       // extra size as they are swallowed

  varying vec2  vUv;
  varying vec4  vSeed;
  varying vec2  vState;

  ${NEBULA_PLACE_GLSL}

  void main() {
    vec2 st;
    vec3 centre = placeDice(st);
    vState = st;
    vSeed = aSeed;
    vUv = position.xy * 2.0;
    float size = uStarSize * (1.0 + aDice.w * 0.5) * (1.0 + uFlare * st.x * (1.0 - st.x) * 4.0);
    vec4 mv = viewMatrix * vec4(centre, 1.0);
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTwinkle;     // integrated phase
  uniform float uTwinkleDepth;
  uniform float uGlow;
  uniform float uSpikes;
  uniform float uFade;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying vec2  vUv;
  varying vec4  vSeed;
  varying vec2  vState;

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float core = exp(-r * r * 60.0);
    float halo = exp(-r * 6.0) * 0.35;
    float sx = exp(-abs(vUv.y) * 40.0) * (1.0 - smoothstep(0.0, 1.0, abs(vUv.x)));
    float sy = exp(-abs(vUv.x) * 40.0) * (1.0 - smoothstep(0.0, 1.0, abs(vUv.y)));
    float spikes = (sx + sy) * uSpikes;
    float tw = 1.0 - uTwinkleDepth * (0.5 + 0.5 * sin(uTwinkle * (1.0 + vSeed.w * 2.0) + vSeed.x * 40.0));
    float level = (core * 2.0 + halo + spikes * 0.6) * tw;
    // Gone once they are swallowed, or blown out with the gas.
    level *= (1.0 - smoothstep(0.85, 1.0, vState.x)) * (1.0 - vState.y);
    vec3 col = mix(uColorA, uColorB, vSeed.y);
    float a = clamp(level, 0.0, 1.0) * uFade;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * (1.0 + core * 2.0), a);
  }
`;

export function createNebulaStarMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...placeUniforms(),
      uStarSize: { value: 0.2 },
      uFlare: { value: 1 },
      uTwinkle: { value: 0 },
      uTwinkleDepth: { value: 0.5 },
      uGlow: { value: 2 },
      uSpikes: { value: 1 },
      uFade: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT
  });

  /** @param {object} state the cloud's state plus { twinkle } */
  material.userData.sync = (state) => {
    const c = settings.nebula;
    const g = settings.global;
    const u = material.uniforms;
    syncPlace(u, state);
    u.uStarSize.value = c.starSize * g.particleSize;
    u.uFlare.value = c.starFlare;
    u.uTwinkle.value = state.twinkle;
    u.uTwinkleDepth.value = c.starTwinkle;
    u.uGlow.value = c.starGlow * g.glow;
    u.uSpikes.value = c.starSpikes;
    u.uFade.value = state.fade * g.opacity;
    u.uColorA.value.copy(getColor(c.colorStarA));
    u.uColorB.value.copy(getColor(c.colorStarB));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The protostar                                                        */
/* -------------------------------------------------------------------- */

const CORE_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vObj;

  void main() {
    vObj = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uBoil;        // integrated
  uniform float uGranScale;
  uniform float uLimb;
  uniform float uGlow;
  uniform float uHeat;        // 0..1 how white-hot
  uniform float uFade;
  uniform vec3  uColorHot;
  uniform vec3  uColorCore;
  uniform vec3  uColorLimb;
  uniform float uGlobalGlow;

  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vObj;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    // Granulation: bright cells with dark lanes, boiling.
    vec2 cell = voronoi2(vObj.xy * uGranScale + vObj.z * 1.7 + vec2(uBoil * 0.3, -uBoil * 0.2));
    float lanes = smoothstep(0.05, 0.45, cell.x);
    float boil = fbm3(vObj * uGranScale * 0.6 + vec3(0.0, 0.0, uBoil));
    float surf = 0.65 + 0.35 * (1.0 - lanes) + 0.25 * boil;
    vec3 col = mix(uColorCore, uColorHot, clamp(ndv * ndv * 0.8 + uHeat * 0.6, 0.0, 1.0));
    // Limb: a thin hot rim where the corona starts.
    float limb = pow(1.0 - ndv, 3.0) * uLimb;
    col = col * surf + uColorLimb * limb;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, uFade);
  }
`;

export function createProtostarMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uBoil: { value: 0 },
      uGranScale: { value: 5 },
      uLimb: { value: 2 },
      uGlow: { value: 4 },
      uHeat: { value: 0 },
      uFade: { value: 1 },
      uColorHot: { value: new Color() },
      uColorCore: { value: new Color() },
      uColorLimb: { value: new Color() }
    }),
    vertexShader: CORE_VERTEX,
    fragmentShader: CORE_FRAGMENT
  });

  /** @param {object} state { boil, heat, fade } */
  material.userData.sync = (state) => {
    const c = settings.nebula;
    const g = settings.global;
    const u = material.uniforms;
    u.uBoil.value = state.boil;
    u.uGranScale.value = c.coreGranulation * g.noiseFrequency;
    u.uLimb.value = c.coreLimb * g.fresnel;
    u.uGlow.value = c.coreGlow * g.glow * g.shaderIntensity;
    u.uHeat.value = state.heat;
    u.uFade.value = state.fade;
    u.uColorHot.value.copy(getColor(c.colorHot));
    u.uColorCore.value.copy(getColor(c.colorCore));
    u.uColorLimb.value.copy(getColor(c.colorB));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The corona                                                           */
/* -------------------------------------------------------------------- */

const BILLBOARD_VERTEX = /* glsl */ `
  uniform float uSize;        // full side, metres

  varying vec2  vUv;
  varying float vViewZ;

  void main() {
    vUv = position.xy * 2.0;  // -1..1
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const CORONA_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uBoil;
  uniform float uCore;        // core radius, as a share of the half-size
  uniform float uRays;
  uniform float uRayLength;
  uniform float uFalloff;
  uniform float uGlow;
  uniform float uFade;
  uniform vec3  uColorHot;
  uniform vec3  uColorRay;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    vec2 dir = vUv / max(r, 1e-4);
    float a = atan(dir.y, dir.x);
    // Streamers: angular noise, stretched outward and flickering.
    float s = snoise(vec3(dir * uRays * 0.5, uBoil * 0.6));
    float s2 = snoise(vec3(dir * uRays * 1.3, uBoil * 1.1 + 7.0));
    float streak = pow(clamp(0.5 + 0.5 * s, 0.0, 1.0), 3.0) + 0.5 * pow(clamp(0.5 + 0.5 * s2, 0.0, 1.0), 4.0);
    float beyond = max(r - uCore, 0.0);
    float rays = streak * exp(-beyond / max(uRayLength, 0.01));
    float glow = exp(-beyond / max(uFalloff, 0.01));
    float edge = 1.0 - smoothstep(0.8, 1.0, r);
    vec3 col = uColorHot * glow * 1.2 + uColorRay * rays * 1.6;
    float level = (glow + rays) * edge * uFade;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(level, 0.0, 1.0));
  }
`;

export function createCoronaMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 3 },
      uBoil: { value: 0 },
      uCore: { value: 0.2 },
      uRays: { value: 8 },
      uRayLength: { value: 0.3 },
      uFalloff: { value: 0.15 },
      uGlow: { value: 2 },
      uFade: { value: 1 },
      uColorHot: { value: new Color() },
      uColorRay: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: CORONA_FRAGMENT
  });

  /** @param {object} state { size, core, boil, fade } — size in metres, core a share */
  material.userData.sync = (state) => {
    const c = settings.nebula;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = state.size;
    u.uBoil.value = state.boil;
    u.uCore.value = state.core;
    u.uRays.value = c.coronaRays;
    u.uRayLength.value = c.coronaRayLength;
    u.uFalloff.value = c.coronaFalloff;
    u.uGlow.value = c.coronaGlow * g.glow;
    u.uFade.value = state.fade * g.opacity;
    u.uColorHot.value.copy(getColor(c.colorHot));
    u.uColorRay.value.copy(getColor(c.colorB));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* Flat rings in a tilted basis — the disk and the remnant              */
/* -------------------------------------------------------------------- */

/**
 * A unit PlaneGeometry (XY, ±0.5) laid in the plane spanned by `uAxisU` and
 * `uAxisV` round `uCentre`, `uExtent` metres from the centre to its edge.
 */
const RING_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform vec3  uAxisU;
  uniform vec3  uAxisV;
  uniform float uExtent;

  varying vec2  vDisk;        // metres in the ring's plane
  varying vec3  vWorld;
  varying float vViewZ;

  void main() {
    vec2 p = position.xy * 2.0 * uExtent;
    vec3 world = uCentre + uAxisU * p.x + uAxisV * p.y;
    vDisk = p;
    vWorld = world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const DISK_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3  uCentre;
  uniform vec3  uAxisU;
  uniform vec3  uAxisV;
  uniform float uInner;
  uniform float uOuter;
  uniform float uSpin;        // integrated
  uniform float uArms;
  uniform float uTwist;
  uniform float uDoppler;
  uniform float uGlow;
  uniform float uFade;
  uniform float uSeed;
  uniform vec3  uColorHot;
  uniform vec3  uColorMid;
  uniform vec3  uColorOut;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2  vDisk;
  varying vec3  vWorld;

  ${noiseGLSL}

  void main() {
    float r = length(vDisk);
    if (r < uInner * 0.85 || r > uOuter) discard;
    float a = atan(vDisk.y, vDisk.x);
    float t = clamp((r - uInner) / max(uOuter - uInner, 0.01), 0.0, 1.0);
    // The inside orbits faster: the phase winds by 1/r, so arms trail.
    float phase = a - uSpin / max(r / max(uOuter, 0.01), 0.15);
    float arms = 0.5 + 0.5 * sin(phase * uArms + log(max(r, 0.01)) * uTwist);
    float n = fbm3(vec3(cos(phase) * r * 3.0, sin(phase) * r * 3.0, uSeed));
    float lanes = smoothstep(0.2, 0.9, arms * 0.7 + n * 0.5 + 0.2);

    float inner = smoothstep(uInner * 0.85, uInner * 1.05, r);
    float outer = 1.0 - smoothstep(0.55, 1.0, t);
    float level = inner * outer * (0.35 + 0.65 * lanes);

    vec3 col = mix(uColorHot, uColorMid, smoothstep(0.0, 0.45, t));
    col = mix(col, uColorOut, smoothstep(0.4, 1.0, t));

    // The limb turning toward the camera is brighter.
    vec3 radial = normalize(vWorld - uCentre);
    vec3 normal = normalize(cross(uAxisU, uAxisV));
    vec3 tangent = normalize(cross(normal, radial));
    float toward = dot(tangent, normalize(cameraPosition - vWorld));
    level *= 1.0 + uDoppler * toward;
    level *= uFade;
    if (level < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * uShaderIntensity * (1.0 + (1.0 - t) * 1.5), clamp(level, 0.0, 1.0));
  }
`;

export function createAccretionDiskMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uAxisU: { value: new Vector3(1, 0, 0) },
      uAxisV: { value: new Vector3(0, 0, 1) },
      uExtent: { value: 2 },
      uInner: { value: 0.4 },
      uOuter: { value: 2 },
      uSpin: { value: 0 },
      uArms: { value: 3 },
      uTwist: { value: 3 },
      uDoppler: { value: 0.5 },
      uGlow: { value: 2 },
      uFade: { value: 0 },
      uSeed: { value: 0 },
      uColorHot: { value: new Color() },
      uColorMid: { value: new Color() },
      uColorOut: { value: new Color() }
    }),
    vertexShader: RING_VERTEX,
    fragmentShader: DISK_FRAGMENT
  });

  /** @param {object} state { centre, axisU, axisV, inner, outer, spin, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.nebula;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uAxisU.value.copy(state.axisU);
    u.uAxisV.value.copy(state.axisV);
    u.uInner.value = state.inner;
    u.uOuter.value = Math.max(state.inner + 0.05, state.outer);
    u.uExtent.value = u.uOuter.value;
    u.uSpin.value = state.spin;
    u.uArms.value = Math.round(c.diskArms);
    u.uTwist.value = c.diskTwist;
    u.uDoppler.value = c.diskDoppler;
    u.uGlow.value = c.diskGlow * g.glow;
    u.uFade.value = state.fade * g.opacity;
    u.uSeed.value = state.seed;
    u.uColorHot.value.copy(getColor(c.colorHot));
    u.uColorMid.value.copy(getColor(c.colorB));
    u.uColorOut.value.copy(getColor(c.colorA));
  };

  return material;
}

const REMNANT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uRingRadius;
  uniform float uWidth;
  uniform float uFlow;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uFade;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying vec2 vDisk;

  ${noiseGLSL}

  void main() {
    float r = length(vDisk);
    vec2 dir = vDisk / max(r, 1e-4);
    // Wisps: the ring is clumpy and frayed, not a clean band.
    float n = fbm3(vec3(dir * 3.0, uSeed + uFlow * 0.2));
    float fray = snoise(vec3(dir * 9.0, r * 2.0 + uFlow * 0.4));
    float w = max(uWidth, 0.01) * (0.7 + 0.6 * (n * 0.5 + 0.5));
    float d = (r - uRingRadius * (1.0 + n * 0.08)) / w;
    float ring = exp(-d * d * 2.0);
    float haze = exp(-abs(d) * 0.6) * 0.25;
    float level = (ring * (0.55 + 0.45 * fray) + haze) * (0.5 + 0.5 * (n * 0.5 + 0.5));
    level *= uFade;
    if (level < 0.003) discard;
    vec3 col = mix(uColorA, uColorB, 0.5 + 0.5 * sin(atan(dir.y, dir.x) * 2.0 + n * 3.0));
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(level, 0.0, 1.0));
  }
`;

export function createRemnantRingMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uAxisU: { value: new Vector3(1, 0, 0) },
      uAxisV: { value: new Vector3(0, 0, 1) },
      uExtent: { value: 5 },
      uRingRadius: { value: 4 },
      uWidth: { value: 0.4 },
      uFlow: { value: 0 },
      uSeed: { value: 0 },
      uGlow: { value: 1 },
      uFade: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: RING_VERTEX,
    fragmentShader: REMNANT_FRAGMENT
  });

  /** @param {object} state { centre, axisU, axisV, radius, flow, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.nebula;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uAxisU.value.copy(state.axisU);
    u.uAxisV.value.copy(state.axisV);
    u.uRingRadius.value = state.radius;
    u.uWidth.value = c.remnantWidth;
    u.uExtent.value = state.radius + c.remnantWidth * 4 + 0.5;
    u.uFlow.value = state.flow;
    u.uSeed.value = state.seed;
    u.uGlow.value = c.remnantGlow * g.glow;
    u.uFade.value = state.fade * g.opacity;
    u.uColorA.value.copy(getColor(c.colorGasB));
    u.uColorB.value.copy(getColor(c.colorGasC));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The supernova shell                                                  */
/* -------------------------------------------------------------------- */

const SHELL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uAge;         // 0..1
  uniform float uSeed;
  uniform float uThin;        // fresnel power — how thin the shell reads
  uniform float uFilaments;
  uniform float uFilScale;
  uniform float uGlow;
  uniform float uFade;
  uniform vec3  uColorHot;
  uniform vec3  uColorC;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vObj;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = abs(dot(N, V));
    float rim = pow(1.0 - ndv, max(uThin, 0.3));

    // Filaments: ridged noise on the sphere, stretched as it expands.
    vec3 q = vObj * uFilScale + vec3(uSeed, uAge * 0.8, -uSeed);
    float fil = 1.0 - abs(snoise(q));
    fil = pow(fil, 5.0) + 0.5 * pow(1.0 - abs(snoise(q * 2.1 + 4.0)), 6.0);
    float n = fbm3(vObj * 2.5 + uSeed);

    // Hot white as it leaves, cooling through pink and violet to teal.
    vec3 col = mix(uColorHot, uColorC, smoothstep(0.0, 0.3, uAge));
    col = mix(col, uColorA, smoothstep(0.25, 0.65, uAge));
    col = mix(col, uColorB, smoothstep(0.6, 1.0, uAge) * (0.4 + 0.6 * fil));

    // Torn away on a noise threshold toward the end.
    float thr = smoothstep(0.35, 1.0, uAge) * 1.1;
    float keep = smoothstep(thr - 0.1, thr + 0.05, n * 0.5 + 0.5);

    float level = (rim * 0.9 + fil * uFilaments * (0.3 + 0.7 * rim)) * keep * uFade;
    if (level < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * uShaderIntensity, clamp(level, 0.0, 1.0));
  }
`;

export function createNovaShellMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uAge: { value: 0 },
      uSeed: { value: 0 },
      uThin: { value: 2.5 },
      uFilaments: { value: 1 },
      uFilScale: { value: 3 },
      uGlow: { value: 3 },
      uFade: { value: 0 },
      uColorHot: { value: new Color() },
      uColorC: { value: new Color() },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: CORE_VERTEX,
    fragmentShader: SHELL_FRAGMENT
  });

  /** @param {object} state { age, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.nebula;
    const g = settings.global;
    const u = material.uniforms;
    u.uAge.value = state.age;
    u.uSeed.value = state.seed;
    u.uThin.value = c.shellThin / Math.max(0.2, g.fresnel);
    u.uFilaments.value = c.shellFilaments;
    u.uFilScale.value = c.shellFilamentScale * g.noiseFrequency;
    u.uGlow.value = c.shellGlow * g.glow;
    u.uFade.value = state.fade * g.opacity;
    u.uColorHot.value.copy(getColor(c.colorHot));
    u.uColorC.value.copy(getColor(c.colorGasC));
    u.uColorA.value.copy(getColor(c.colorA));
    u.uColorB.value.copy(getColor(c.colorGasB));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The ground                                                           */
/* -------------------------------------------------------------------- */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uQuad;
  uniform float uLift;

  varying vec2 vFlat;

  void main() {
    vec2 p = position.xy * uQuad;
    vFlat = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(uCentre.x + p.x, uLift, uCentre.z + p.y, 1.0);
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uSeed;
  uniform float uZone;        // the circle, metres
  uniform float uGather;      // 0..1 the cloud's glow on the floor
  uniform float uFlow;
  uniform float uInflow;      // 0..1 gravity ripples running in
  uniform float uInflowPhase; // integrated
  uniform float uRingsPerM;
  uniform float uShockR;      // metres, the front
  uniform float uShock;       // 0..1 strength of the front
  uniform float uShockWidth;
  uniform float uChroma;      // metres the colours split by
  uniform float uScorch;      // 0..1 the starburst behind it
  uniform float uRays;
  uniform float uGlow;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorHot;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    vec2 p = vFlat;
    float r = length(p);
    vec2 dir = p / max(r, 1e-4);
    float zone = max(uZone, 0.1);
    vec3 col = vec3(0.0);

    // 1 · the cloud's glow, mottled like the gas it is reflecting.
    float mott = fbm3(vec3(p * 0.45, uFlow * 0.3 + uSeed)) * 0.5 + 0.5;
    float pool = exp(-r * r / (zone * zone * 0.8));
    col += mix(uColorA, uColorB, mott) * pool * mott * uGather * 0.6;

    // 2 · gravity ripples running inward, sharper as they near the middle.
    float ph = r * uRingsPerM + uInflowPhase;
    float ripple = pow(0.5 + 0.5 * cos(6.2831853 * ph), 10.0);
    float inMask = (1.0 - smoothstep(zone * 0.7, zone * 1.2, r)) * smoothstep(0.0, zone * 0.25, r);
    col += mix(uColorB, uColorHot, 1.0 - r / (zone * 1.2)) * ripple * inMask * uInflow;

    // 3 · the shock front, its colours split, and the starburst behind it.
    float w = max(uShockWidth, 0.02);
    float dr = r - uShockR;
    float front = exp(-pow(dr / w, 2.0));
    float fr = exp(-pow((dr + uChroma) / w, 2.0));
    float fb = exp(-pow((dr - uChroma) / w, 2.0));
    col += (uColorHot * front + uColorC * fr + uColorB * fb) * uShock;

    float a = atan(dir.y, dir.x);
    float ray = pow(abs(sin(a * uRays * 0.5 + snoise(vec3(dir * 2.0, uSeed)) * 1.2)), 18.0);
    float rayN = 0.5 + 0.5 * snoise(vec3(dir * 6.0, uSeed * 2.0));
    float behind = 1.0 - smoothstep(uShockR * 0.85, uShockR, r);
    float burst = (ray * (0.4 + 0.6 * rayN) + exp(-r / (zone * 0.35)) * 0.5) * behind;
    col += mix(uColorC, uColorA, smoothstep(0.0, uShockR + 0.01, r)) * burst * uScorch;

    col *= uGlow * uGlobalGlow;
    float level = max(max(col.r, col.g), col.b);
    if (level < 0.003) discard;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createNebulaGroundMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uQuad: { value: 10 },
      uLift: { value: 0.016 },
      uSeed: { value: 0 },
      uZone: { value: 4 },
      uGather: { value: 0 },
      uFlow: { value: 0 },
      uInflow: { value: 0 },
      uInflowPhase: { value: 0 },
      uRingsPerM: { value: 0.8 },
      uShockR: { value: 0 },
      uShock: { value: 0 },
      uShockWidth: { value: 0.2 },
      uChroma: { value: 0.1 },
      uScorch: { value: 0 },
      uRays: { value: 18 },
      uGlow: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: GROUND_FRAGMENT
  });

  /** @param {object} state { centre, quad, gather, flow, inflow, inflowPhase, shockR, shock, scorch, seed } */
  material.userData.sync = (state) => {
    const c = settings.nebula;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uQuad.value = state.quad;
    u.uSeed.value = state.seed;
    u.uZone.value = c.zoneRadius;
    u.uGather.value = state.gather * c.groundGlow;
    u.uFlow.value = state.flow;
    u.uInflow.value = state.inflow * c.groundRipples;
    u.uInflowPhase.value = state.inflowPhase;
    u.uRingsPerM.value = c.groundRippleDensity;
    u.uShockR.value = state.shockR;
    u.uShock.value = state.shock * c.groundShock;
    u.uShockWidth.value = c.groundShockWidth;
    u.uChroma.value = c.groundChroma * g.shaderIntensity;
    u.uScorch.value = state.scorch * c.groundScorch;
    u.uRays.value = Math.round(c.groundRays);
    u.uGlow.value = g.glow * g.opacity;
    u.uColorA.value.copy(getColor(c.colorA));
    u.uColorB.value.copy(getColor(c.colorGasB));
    u.uColorC.value.copy(getColor(c.colorGasC));
    u.uColorHot.value.copy(getColor(c.colorHot));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The lens — LAYER.DISTORTION                                          */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uPinch;       // pull toward the middle
  uniform float uCore;        // share of the half-size the pinch peaks at
  uniform float uShockR;      // share of the half-size the push ring is at
  uniform float uShock;
  uniform float uShaderIntensity;

  varying vec2 vUv;

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    vec2 dir = vUv / max(r, 1e-4);
    // Gravity: the image is pulled in toward the mass, strongest near it.
    float pinch = uPinch * smoothstep(0.0, uCore, r) * (1.0 - smoothstep(uCore, 1.0, r));
    // The shell: a ring that shoves the image outward as it passes.
    float d = (r - uShockR) / 0.08;
    float push = uShock * exp(-d * d);
    vec2 offset = -dir * pinch + dir * push;
    float strength = clamp(length(offset), 0.0, 1.0) * uShaderIntensity;
    if (strength < 0.002) discard;
    vec2 o = normalize(offset + 1e-5);
    float mask = 1.0 - smoothstep(0.8, 1.0, r);
    gl_FragColor = vec4(o * 0.5 + 0.5, strength * mask, mask);
  }
`;

export function createNebulaLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 6 },
      uPinch: { value: 0 },
      uCore: { value: 0.3 },
      uShockR: { value: 0 },
      uShock: { value: 0 }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {object} state { size, pinch, core, shockR, shock } */
  material.userData.sync = (state) => {
    const c = settings.nebula;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = state.size;
    u.uPinch.value = state.pinch * c.lensPinch * g.distortion;
    u.uCore.value = Math.min(0.9, Math.max(0.05, state.core));
    u.uShockR.value = state.shockR;
    u.uShock.value = state.shock * c.lensShock * g.distortion;
  };

  return material;
}
