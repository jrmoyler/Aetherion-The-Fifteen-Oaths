import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Pulsar Lash — the bespoke shaders the neutron star is drawn with.
 *
 *  - **the star** — a unit sphere placed and scaled in the vertex stage: a
 *    blinding white crust crawling with fine noise, two polar hot-spots where
 *    the magnetic axis leaves the surface, a violet limb.
 *  - **the beams** — two tube grids in parameter space, each a cone grown along
 *    the star's magnetic axis and *curled back* against the spin by `uLag`
 *    (Rodrigues rotation about the spin axis, more the further out), so the
 *    pair reads as a spinning two-armed whip rather than two sticks. Inverted
 *    fresnel, a hard white core, radio pulses running outward, clipped at the
 *    floor and soft where they meet it.
 *  - **the magnetosphere** — up to ten dipole field loops (`r = L sin²θ`)
 *    hung round the magnetic axis and turning with it; thin, violet, dashes of
 *    light streaming pole to pole. At the collapse they are flung outward.
 *  - **the strobe** — a camera-facing corona at the star, brightest whenever a
 *    beam swings toward the viewer: the lighthouse blink.
 *  - **the lens** — a camera-facing proxy on `LAYER.DISTORTION` pinching the
 *    frame toward the star, and a ring of push when it quakes.
 *  - **the scars** — a ground quad down the line that draws up to 48 recorded
 *    beam footprint segments as crosswise lash marks: a white-hot slit that
 *    cools through violet to a dark burn, each on its own clock.
 *
 * Every material reads `settings.pulsar` in `userData.sync(state)`; `state`
 * carries only what the ability knows that the settings do not.
 */

const ID = 'pulsar';
export const MAX_SCARS = 48;
export const MAX_LOOPS = 10;

/* -------------------------------------------------------------------- */
/* Shared GLSL                                                          */
/* -------------------------------------------------------------------- */

const ROT_GLSL = /* glsl */ `
  vec3 rotAxis(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
`;

/* -------------------------------------------------------------------- */
/* The star                                                             */
/* -------------------------------------------------------------------- */

const STAR_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;

  varying vec3  vN;
  varying vec3  vViewDir;

  void main() {
    vec3 world = uCenter + position * uRadius;
    vN = position;
    vViewDir = cameraPosition - world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform vec3  uM;           // magnetic axis
  uniform float uSurfaceScale;
  uniform float uSurfaceSpeed;
  uniform float uGlow;
  uniform float uHotspot;
  uniform float uPower;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorD;
  uniform float uGlobalGlow;

  varying vec3 vN;
  varying vec3 vViewDir;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(vViewDir);
    float facing = abs(dot(N, V));
    // A crust of fine, fast cells — a neutron star does not boil, it crackles.
    float n = fbm3(N * uSurfaceScale + vec3(uSeed, uTime * uSurfaceSpeed, -uTime * uSurfaceSpeed * 0.7));
    float cells = voronoi2(N.xy * uSurfaceScale * 2.3 + N.z * 3.1 + uTime * uSurfaceSpeed).x;
    float crack = 1.0 - smoothstep(0.0, 0.12, cells);
    float pole = pow(max(dot(N, uM), 0.0), 18.0) + pow(max(dot(N, -uM), 0.0), 18.0);
    float heat = clamp(facing * 0.75 + (n * 0.5 + 0.5) * 0.3 + crack * 0.25 + pole, 0.0, 1.0);
    vec3 col = gradient4(uColorA, uColorB, uColorC, uColorD, 1.0 - heat);
    float rim = pow(1.0 - facing, 2.2);
    vec3 color = col * uGlow * (0.55 + 0.6 * heat) + uColorA * pole * uHotspot + uColorC * rim * uGlow * 0.6;
    gl_FragColor = vec4(color * uPower * uGlobalGlow, clamp(uPower, 0.0, 1.0));
  }
`;

/** The neutron star itself. Additive — it is a light, not a solid. */
export function createStarMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uRadius: { value: 0.3 },
      uSeed: { value: 0 },
      uM: { value: new Vector3(0, 1, 0) },
      uSurfaceScale: { value: 3.5 },
      uSurfaceSpeed: { value: 1.2 },
      uGlow: { value: 6 },
      uHotspot: { value: 3 },
      uPower: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorD: { value: new Color() }
    }),
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT
  });

  /** @param {object} state { center, radius, m, power, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uRadius.value = Math.max(0.005, state.radius);
    u.uSeed.value = state.seed;
    u.uM.value.copy(state.m);
    u.uSurfaceScale.value = c.surfaceScale * g.noiseFrequency;
    u.uSurfaceSpeed.value = c.surfaceSpeed * g.noiseSpeed;
    u.uGlow.value = c.starGlow * g.glow;
    u.uHotspot.value = c.hotspotGlow * g.shaderIntensity;
    u.uPower.value = state.power * g.opacity;
    u.uColorA.value.copy(getColor(c.colorStarA));
    u.uColorB.value.copy(getColor(c.colorStarB));
    u.uColorC.value.copy(getColor(c.colorStarC));
    u.uColorD.value.copy(getColor(c.colorStarD));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The beams                                                            */
/* -------------------------------------------------------------------- */

/**
 * `beamPoint(s)` — the CPU twin is `PulsarLashAbility#_beamPoint`; keep them
 * together. The beam leaves the star along `uM` and is rotated about the spin
 * axis by `-uLag · s`: it trails the spin, more the further out it is.
 */
const BEAM_GLSL = /* glsl */ `
  uniform vec3  uStar;
  uniform vec3  uM;
  uniform vec3  uAxis;
  uniform float uLag;
  uniform float uLength;
  uniform float uRootR;
  uniform float uTipR;

  ${ROT_GLSL}

  vec3 beamPoint(float s) {
    return uStar + rotAxis(uM, uAxis, -uLag * s) * (s * uLength);
  }

  float beamRadius(float s) {
    return mix(uRootR, uTipR, s);
  }
`;

const BEAM_VERTEX = /* glsl */ `
  uniform float uScale;

  varying float vS;
  varying float vAng;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  varying float vWorldY;

  ${BEAM_GLSL}

  void main() {
    float s = position.x;
    float ang = position.y * 6.2831853;
    vec3 c = beamPoint(s);
    vec3 T = beamPoint(min(s + 0.01, 1.0)) - beamPoint(max(s - 0.01, 0.0));
    T = normalize(T + vec3(1e-5, 0.0, 0.0));
    vec3 ref = abs(T.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 N1 = normalize(cross(T, ref));
    vec3 B = cross(N1, T);
    vec3 radial = cos(ang) * N1 + sin(ang) * B;
    vec3 world = c + radial * beamRadius(s) * uScale;
    vS = s;
    vAng = ang;
    vNormalW = radial;
    vViewDir = cameraPosition - world;
    vWorldY = world.y;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uSeed;
  uniform float uLength;
  uniform float uFlow;
  uniform float uFlowScale;
  uniform float uPulse;
  uniform float uPulseSpacing;
  uniform float uPulseGlow;
  uniform float uCoreGlow;
  uniform float uEdgeGlow;
  uniform float uCoreSharp;
  uniform float uFalloff;
  uniform float uSoftFade;
  uniform float uOpacity;
  uniform float uPower;
  uniform float uFlare;       // extra white while it is pinned into the floor
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

  varying float vS;
  varying float vAng;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  varying float vWorldY;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    if (vWorldY < 0.0) discard;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float facing = abs(dot(N, V));
    float core = pow(facing, max(uCoreSharp, 0.2));

    float d = vS * uLength;
    // Radio pulses: bright bands racing outward from the star.
    float pulse = pow(0.5 + 0.5 * sin(6.2831853 * (d / max(uPulseSpacing, 0.05) - uPulse)), 8.0);
    float n = fbm3(vec3(d * uFlowScale - uFlow, cos(vAng) * 0.8 + uSeed, sin(vAng) * 0.8)) * 0.5 + 0.5;
    float heat = core * 0.7 + pulse * 0.3 + n * 0.25 * uShaderIntensity + uFlare * 0.3;
    vec3 col = gradient4(uColorA, uColorB, uColorC, uColorD, 1.0 - clamp(heat, 0.0, 1.0));
    float fall = mix(1.0, 0.25, pow(vS, max(uFalloff, 0.05)));
    float bright = (uEdgeGlow * (1.0 - core) + uCoreGlow * core) * (1.0 + pulse * uPulseGlow) * fall * (0.7 + 0.6 * n) * (1.0 + uFlare);

    float mask = smoothstep(0.0, 0.04, vS) * (1.0 - smoothstep(0.82, 1.0, vS)) * uPower * uOpacity;
    mask *= smoothstep(0.0, 0.12, vWorldY);
    if (mask < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (mask < 0.004) discard;
    gl_FragColor = vec4(col * bright * uGlobalGlow, clamp(mask, 0.0, 1.0));
  }
`;

/** One of the two lighthouse beams. Additive. */
export function createBeamMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStar: { value: new Vector3() },
      uM: { value: new Vector3(0, 1, 0) },
      uAxis: { value: new Vector3(0, 0, 1) },
      uLag: { value: 0 },
      uLength: { value: 7 },
      uRootR: { value: 0.05 },
      uTipR: { value: 0.4 },
      uScale: { value: 1 },
      uSeed: { value: 0 },
      uFlow: { value: 0 },
      uFlowScale: { value: 1 },
      uPulse: { value: 0 },
      uPulseSpacing: { value: 1.4 },
      uPulseGlow: { value: 2 },
      uCoreGlow: { value: 5 },
      uEdgeGlow: { value: 1.5 },
      uCoreSharp: { value: 2.4 },
      uFalloff: { value: 1 },
      uSoftFade: { value: 0.3 },
      uOpacity: { value: 1 },
      uPower: { value: 1 },
      uFlare: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorD: { value: new Color() }
    }),
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT
  });

  /** @param {object} state { star, m, axis, lag, length, flow, pulse, power, flare, widthMul, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStar.value.copy(state.star);
    u.uM.value.copy(state.m);
    u.uAxis.value.copy(state.axis);
    u.uLag.value = state.lag;
    u.uLength.value = Math.max(0.1, state.length);
    u.uRootR.value = Math.max(0.002, c.beamRootRadius) * state.widthMul;
    u.uTipR.value = Math.max(0.002, c.beamTipRadius) * state.widthMul;
    u.uSeed.value = state.seed;
    u.uFlow.value = state.flow;
    u.uFlowScale.value = c.beamFlowScale * g.noiseFrequency;
    u.uPulse.value = state.pulse;
    u.uPulseSpacing.value = c.pulseSpacing;
    u.uPulseGlow.value = c.pulseGlow * g.shaderIntensity;
    u.uCoreGlow.value = c.beamGlow * g.glow;
    u.uEdgeGlow.value = c.beamEdgeGlow * g.glow;
    u.uCoreSharp.value = c.beamCore;
    u.uFalloff.value = c.beamFalloff;
    u.uSoftFade.value = c.softFade;
    u.uOpacity.value = c.beamOpacity * g.opacity;
    u.uPower.value = state.power;
    u.uFlare.value = state.flare;
    u.uColorA.value.copy(getColor(c.colorBeamA));
    u.uColorB.value.copy(getColor(c.colorBeamB));
    u.uColorC.value.copy(getColor(c.colorBeamC));
    u.uColorD.value.copy(getColor(c.colorBeamD));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The magnetosphere                                                    */
/* -------------------------------------------------------------------- */

const LOOP_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform vec3  uM;
  uniform vec3  uP1;
  uniform vec3  uP2;
  uniform float uShell;
  uniform float uStarR;
  uniform float uTubeR;
  uniform float uCount;
  uniform float uTwist;

  varying float vT;
  varying float vLoop;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  vec3 loopPoint(float t, float az) {
    // A dipole field line: r = L sin²θ, θ from the magnetic axis, between the
    // two latitudes where it leaves and re-enters the star.
    float s0 = asin(sqrt(clamp(uStarR / max(uShell, 1e-3), 0.0, 0.98)));
    float th = mix(s0, 3.14159265 - s0, t);
    float st = sin(th);
    float r = uShell * st * st;
    vec3 radial = cos(az) * uP1 + sin(az) * uP2;
    return uCenter + (uM * cos(th) + radial * st) * r;
  }

  void main() {
    float t = position.x;
    float ang = position.y * 6.2831853;
    float l = position.z;
    float az = 6.2831853 * l / max(uCount, 1.0) + uTwist * (t - 0.5);
    vec3 c = loopPoint(t, az);
    vec3 T = normalize(loopPoint(min(t + 0.01, 1.0), az) - loopPoint(max(t - 0.01, 0.0), az) + vec3(1e-5));
    vec3 ref = abs(T.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 N1 = normalize(cross(T, ref));
    vec3 B = cross(N1, T);
    vec3 radial = cos(ang) * N1 + sin(ang) * B;
    // Loops past the live count collapse onto the star and are discarded.
    float live = step(l, uCount - 0.5);
    vec3 world = mix(uCenter, c + radial * uTubeR, live);
    vT = t;
    vLoop = l + (1.0 - live) * 100.0;
    vNormalW = radial;
    vViewDir = cameraPosition - world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const LOOP_FRAGMENT = /* glsl */ `
  uniform float uFlow;
  uniform float uGlow;
  uniform float uPower;
  uniform float uCount;
  uniform vec3  uColor;
  uniform vec3  uColorHot;
  uniform float uGlobalGlow;

  varying float vT;
  varying float vLoop;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  void main() {
    if (vLoop > uCount) discard;
    float facing = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    // Charge streaming pole to pole: dashes running along the loop.
    float dash = pow(0.5 + 0.5 * sin(vT * 28.0 - uFlow + vLoop * 1.7), 5.0);
    float ends = smoothstep(0.0, 0.08, vT) * smoothstep(0.0, 0.08, 1.0 - vT);
    vec3 col = mix(uColor, uColorHot, dash);
    float m = (0.35 + 0.65 * facing) * (0.35 + 1.2 * dash) * ends * uPower;
    if (m < 0.004) discard;
    gl_FragColor = vec4(col * m * uGlow * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

/** The field loops round the star. */
export function createLoopMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uM: { value: new Vector3(0, 1, 0) },
      uP1: { value: new Vector3(1, 0, 0) },
      uP2: { value: new Vector3(0, 0, 1) },
      uShell: { value: 1 },
      uStarR: { value: 0.3 },
      uTubeR: { value: 0.01 },
      uCount: { value: 6 },
      uTwist: { value: 0 },
      uFlow: { value: 0 },
      uGlow: { value: 1.5 },
      uPower: { value: 1 },
      uColor: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: LOOP_VERTEX,
    fragmentShader: LOOP_FRAGMENT
  });

  /** @param {object} state { center, m, p1, p2, starR, expand, flow, power } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uM.value.copy(state.m);
    u.uP1.value.copy(state.p1);
    u.uP2.value.copy(state.p2);
    u.uStarR.value = Math.max(0.01, state.starR);
    u.uShell.value = Math.max(state.starR * 1.2, c.fieldShell * (1 + state.expand));
    u.uTubeR.value = Math.max(0.002, c.fieldRadius);
    u.uCount.value = Math.max(0, Math.min(MAX_LOOPS, Math.round(c.fieldLines)));
    u.uTwist.value = c.fieldTwist;
    u.uFlow.value = state.flow;
    u.uGlow.value = c.fieldGlow * g.glow;
    u.uPower.value = state.power * g.opacity;
    u.uColor.value.copy(getColor(c.colorField));
    u.uColorHot.value.copy(getColor(c.colorFieldHot));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Billboards — the strobe and the lens                                 */
/* -------------------------------------------------------------------- */

const BILLBOARD_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2  vUv;

  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = uCenter + (right * position.x + up * position.y) * uSize;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const STROBE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  uniform float uRays;
  uniform float uRayAngle;
  uniform vec3  uColorCore;
  uniform vec3  uColorHalo;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0 || uIntensity <= 0.001) discard;
    float a = atan(vUv.y, vUv.x);
    float core = exp(-r * r * 40.0);
    float halo = exp(-r * 4.0) * (1.0 - smoothstep(0.55, 1.0, r));
    // Hard diffraction spikes, turning with the beams.
    float spikes = pow(abs(cos((a - uRayAngle) * max(uRays, 1.0) * 0.5)), 60.0) * exp(-r * 2.2);
    float flick = 0.75 + 0.25 * snoise(vec3(a * 3.0, uTime * 9.0, uSeed));
    vec3 col = uColorHalo * (halo * 0.8 + spikes * 1.6 * flick) + uColorCore * core * 2.5;
    float m = clamp(halo + spikes + core, 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, r));
    gl_FragColor = vec4(col * uIntensity * uGlobalGlow, m);
  }
`;

/** The lighthouse blink at the star. */
export function createStrobeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 1 },
      uSeed: { value: 0 },
      uIntensity: { value: 0 },
      uRays: { value: 4 },
      uRayAngle: { value: 0 },
      uColorCore: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: STROBE_FRAGMENT
  });

  /** @param {object} state { center, size, intensity, rayAngle, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.01, state.size);
    u.uIntensity.value = state.intensity * g.glow;
    u.uRays.value = Math.max(1, Math.round(c.flareRays));
    u.uRayAngle.value = state.rayAngle;
    u.uSeed.value = state.seed;
    u.uColorCore.value.copy(getColor(c.colorFlareCore));
    u.uColorHalo.value.copy(getColor(c.colorFlareHalo));
  };
  return material;
}

const LENS_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uRing;        // 0..1 the quake's push ring, < 0 off
  uniform float uShaderIntensity;

  varying vec2 vUv;

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    vec2 dir = vUv / max(r, 1e-4);
    // Pinch toward the star: strongest a little way out, nothing at the edge.
    float pinch = r * (1.0 - r) * 4.0 * (1.0 - smoothstep(0.7, 1.0, r));
    vec2 offset = -dir * pinch;
    float mask = pinch;
    if (uRing >= 0.0) {
      float d = (r - (0.1 + 0.85 * uRing)) / 0.1;
      float push = -d * exp(-d * d) * (1.0 - uRing);
      offset += dir * push * 2.0;
      mask = max(mask, exp(-d * d) * (1.0 - uRing));
    }
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    float len = length(offset);
    if (len > 1.0) offset /= len;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

/** The star's weight on the light round it — LAYER.DISTORTION. */
export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 1.5 },
      uStrength: { value: 0.6 },
      uRing: { value: -1 }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {object} state { center, size, strength, ring } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.05, state.size);
    u.uStrength.value = c.lensStrength * g.distortion * state.strength;
    u.uRing.value = state.ring;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The scars                                                            */
/* -------------------------------------------------------------------- */

const SCAR_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uHalfWidth;

  varying vec2 vXZ;

  void main() {
    vec3 world = uStart + uDir * (position.x * uLength) + uSide * (position.y * uHalfWidth);
    world.y = 0.016;
    vXZ = world.xz;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SCAR_FRAGMENT = /* glsl */ `
  uniform vec4  uSegA[${MAX_SCARS}];   // a.xz, b.xz
  uniform vec2  uSegB[${MAX_SCARS}];   // birth (cast seconds), strength
  uniform float uCount;
  uniform float uNow;
  uniform float uCool;
  uniform float uWidth;
  uniform float uGlowWidth;
  uniform float uGlow;
  uniform float uJitter;
  uniform float uSeed;
  uniform float uCharOpacity;
  uniform float uFadeT;
  uniform float uOpacity;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorChar;
  uniform float uGlobalGlow;

  varying vec2 vXZ;

  ${noiseGLSL}

  float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    return length(p - a - ab * t);
  }

  void main() {
    // Burnt lines wander a little: the floor is not a ruler.
    float j = snoise(vec3(vXZ * 2.7, uSeed)) * uJitter;
    float hot = 0.0;
    float burn = 0.0;
    for (int i = 0; i < ${MAX_SCARS}; i++) {
      if (float(i) >= uCount) break;
      vec4 s = uSegA[i];
      vec2 info = uSegB[i];
      float d = segDist(vXZ, s.xy, s.zw) + j;
      if (d > uGlowWidth * 2.5 + uWidth) continue;
      float age = max(uNow - info.x, 0.0);
      float T = info.y * exp(-age / max(uCool, 0.02));
      float slit = 1.0 - smoothstep(uWidth * 0.3, uWidth, d);
      float glow = exp(-d * d / max(uGlowWidth * uGlowWidth, 1e-4));
      hot = max(hot, T * (slit + glow * 0.35));
      burn = max(burn, info.y * (1.0 - smoothstep(uWidth, uWidth * 3.0, d)));
    }
    float a = max(burn * uCharOpacity, clamp(hot, 0.0, 1.0));
    if (a < 0.004) discard;
    vec3 col = mix(uColorC, uColorB, smoothstep(0.15, 0.55, hot));
    col = mix(col, uColorA, smoothstep(0.55, 0.95, hot));
    vec3 lit = col * uGlow * (0.2 + 1.3 * hot) * uGlobalGlow;
    vec3 color = mix(uColorChar, lit, smoothstep(0.02, 0.2, hot));
    float n = snoise(vec3(vXZ * 1.9, uSeed * 3.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.2 - 0.1;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.15, n);
    a *= vis * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(color, clamp(a, 0.0, 1.0));
  }
`;

/** Lash marks on the floor. Normal blending: the burn has to be dark; the slit is HDR. */
export function createScarMaterial() {
  const segA = [];
  const segB = [];
  for (let i = 0; i < MAX_SCARS; i++) {
    segA.push(new Vector4());
    segB.push(new Vector2());
  }
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
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uHalfWidth: { value: 6 },
      uSegA: { value: segA },
      uSegB: { value: segB },
      uCount: { value: 0 },
      uNow: { value: 0 },
      uCool: { value: 1 },
      uWidth: { value: 0.1 },
      uGlowWidth: { value: 0.4 },
      uGlow: { value: 4 },
      uJitter: { value: 0.05 },
      uSeed: { value: 0 },
      uCharOpacity: { value: 0.6 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorChar: { value: new Color() }
    }),
    vertexShader: SCAR_VERTEX,
    fragmentShader: SCAR_FRAGMENT
  });

  /**
   * @param {object} state { start, dir, side, length, halfWidth, count, now, fadeT, seed }
   *   — the segments themselves are written straight into `uSegA/uSegB` by
   *   the ability (`material.uniforms.uSegA.value[i].set(...)`).
   */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.1, state.length);
    u.uHalfWidth.value = Math.max(0.1, state.halfWidth);
    u.uCount.value = state.count;
    u.uNow.value = state.now;
    u.uCool.value = c.scarCool;
    u.uWidth.value = Math.max(0.005, c.scarWidth);
    u.uGlowWidth.value = Math.max(0.01, c.scarGlowWidth);
    u.uGlow.value = c.scarGlow * g.glow;
    u.uJitter.value = c.scarJitter * g.noiseStrength;
    u.uSeed.value = state.seed;
    u.uCharOpacity.value = c.scarCharOpacity;
    u.uFadeT.value = state.fadeT;
    u.uOpacity.value = g.opacity;
    u.uColorA.value.copy(getColor(c.colorScarA));
    u.uColorB.value.copy(getColor(c.colorScarB));
    u.uColorC.value.copy(getColor(c.colorScarC));
    u.uColorChar.value.copy(getColor(c.colorScarChar));
  };
  return material;
}
