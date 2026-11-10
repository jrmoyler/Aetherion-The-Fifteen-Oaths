import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Trajectory Hijack — the bespoke shaders. All four colour stops come from
 * the same ramp (`colorCore → colorTint → colorBody → colorDeep`), so one
 * slider re-tempers every layer together.
 *
 *  - **the deflection field** — the floor under the ring. A dark deep disc
 *    (it grounds the cast on the stage floor) carved with spiral stream lines
 *    whose twist *is* the vanes' pitch: radial while the vanes stand open,
 *    winding into a log spiral when they snap to the seize, flowing inward
 *    while darts are held. Compass ticks on the rim, a lit socket under every
 *    vane, the orbit band, the seize shock, a noise dissolve with a burning
 *    edge on the exit. Normal-blended so the deep tone can darken the floor.
 *  - **the vane edge** — instanced over the same airfoil the lit steel vanes
 *    use: a hot leading edge with chevrons climbing it, a faint trailing
 *    edge, flared by a per-vane `aKick` when a dart is released past it.
 *  - **the ribbons** — every dart's remembered flight, a camera-facing strip
 *    expanded in the vertex stage from the closed-form path the CPU sampled;
 *    white-hot at the head through the ramp to the deep at the tail.
 *  - **the glow** — the compass needle's north tip: fresnel light.
 *  - **the lens** — `LAYER.DISTORTION`: the air dragged round the orbit band,
 *    a pressure ring on the seize.
 *
 * Every material reads `settings.trajectoryHijack` in `userData.sync(state)`.
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

const RAMP_UNIFORMS = () => ({
  uCore: { value: new Color() },
  uTint: { value: new Color() },
  uBody: { value: new Color() },
  uDeep: { value: new Color() },
});
function syncRamp(u, c) {
  u.uCore.value.copy(getColor(c.colorCore));
  u.uTint.value.copy(getColor(c.colorTint));
  u.uBody.value.copy(getColor(c.colorBody));
  u.uDeep.value.copy(getColor(c.colorDeep));
}

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
/* The deflection field                                                 */
/* -------------------------------------------------------------------- */

const FIELD_FRAGMENT = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;       // field radius (m)
  uniform float uFrame;        // world angle of the cast's heading
  uniform float uSpin;         // ±1, the way the volley circles
  uniform float uPitch;        // vane pitch (rad from radial)
  uniform float uSocket0;      // local angle of vane 0 (rad)
  uniform float uVanes;        // vane count
  uniform float uVaneSeat;     // ring radius / field radius
  uniform float uSeat;         // orbit radius / field radius
  uniform float uGrip;         // 0..1 darts held right now
  uniform float uFlow;
  uniform float uArms;
  uniform float uTwist;
  uniform float uTicks;
  uniform float uBand;
  uniform float uNoise;
  uniform float uScale;
  uniform float uShock;        // 0..1 seize ring radius, < 0 off
  uniform float uEnergy;       // 0..1 the field powering up
  uniform float uDeepAlpha;
  uniform float uGlow;
  uniform float uFade;
  uniform float uDissolve;
  uniform float uEdge;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec2 q = (vWorld.xz - uCenter.xz) / uRadius;
    float r = length(q);
    if (r > 1.0) discard;
    // Local angle: 0 points down the aim line, the same frame the CPU uses.
    float a = atan(q.y, q.x) - uFrame;

    // Stream lines: a log spiral whose winding is the vane pitch.
    float warp = (fbm3(vec3(q * 3.0 * uScale, uFlow * 0.15)) - 0.5) * uNoise;
    float wind = uSpin * uTwist * uPitch * log(max(r, 0.02));
    float phase = (a + wind) * uArms / 6.2831853 + uFlow + warp;
    float d = abs(fract(phase) - 0.5) * 2.0;
    float stream = smoothstep(0.78, 1.0, d) * smoothstep(0.1, 0.3, r) * (1.0 - smoothstep(0.86, 0.97, r));
    float band = exp(-pow((r - uSeat) / 0.11, 2.0));
    stream *= 0.35 + band * (0.6 + uGrip * uBand * 1.5);

    // Rim: a bezel line and compass ticks, every ninth one long.
    float rim = exp(-abs(r - 0.965) * 140.0);
    float ta = atan(q.y, q.x) / 6.2831853 * uTicks;
    float tf = fract(ta);
    float major = 1.0 - step(0.05, fract(floor(ta + 0.5) / 9.0 + 0.01));
    float tick = step(0.9, 1.0 - abs(tf - 0.5) * 2.0)
      * smoothstep(0.88 - major * 0.06, 0.9 - major * 0.06, r) * (1.0 - smoothstep(0.94, 0.95, r));

    // A lit socket under every vane, with a groove toward the orbit.
    float sockets = 0.0;
    for (int k = 0; k < 16; k++) {
      if (float(k) >= uVanes) break;
      float va = uSocket0 + float(k) * 6.2831853 / uVanes + uFrame;
      vec2 sp = vec2(cos(va), sin(va)) * uVaneSeat;
      float ds = length(q - sp);
      sockets += exp(-ds * ds * 900.0) * 1.4 + exp(-ds * ds * 160.0) * 0.35;
    }

    // The orbit band itself: a thin lit track while darts are held.
    float track = exp(-pow((r - uSeat) / 0.012, 2.0)) * (0.25 + uGrip * uBand);
    float shock = uShock >= 0.0 ? exp(-abs(r - uShock) * 38.0) * (1.0 - uShock) * 2.2 : 0.0;

    float L = (stream * 0.9 + rim * 0.8 + tick * 0.7 + sockets + track + shock) * uShaderIntensity * uEnergy;
    // Dissolve on the exit with a burning edge.
    vec2 dm = dissolveMask(snoise01(vec3(q * 3.2 * uScale, 4.1)), uDissolve, uEdge);
    float heat = clamp(L, 0.0, 1.0);
    vec3 lines = gradient4(uCore, uTint, uBody, uDeep, 1.0 - heat * 0.85);
    // The deep: mottled, so the floor reads as worked metal, not paint.
    float mottle = snoise01(vec3(q * 6.0 * uScale, 1.7));
    vec3 base = uDeep * (0.55 + 0.45 * mottle);
    float baseA = uDeepAlpha * (1.0 - smoothstep(0.88, 1.0, r)) * uEnergy;
    vec3 col = base * (1.0 - heat) + lines * L * uGlow * uGlobalGlow + uBody * dm.y * 3.0;
    float alpha = clamp(max(baseA, heat) + dm.y, 0.0, 1.0) * dm.x * uFade;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createFieldMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uRadius: { value: 4 },
      uFrame: { value: 0 },
      uSpin: { value: 1 },
      uPitch: { value: 0 },
      uSocket0: { value: 0 },
      uVanes: { value: 9 },
      uVaneSeat: { value: 0.8 },
      uSeat: { value: 0.5 },
      uGrip: { value: 0 },
      uFlow: { value: 0 },
      uArms: { value: 18 },
      uTwist: { value: 2.4 },
      uTicks: { value: 36 },
      uBand: { value: 1.4 },
      uNoise: { value: 0.6 },
      uScale: { value: 1 },
      uShock: { value: -1 },
      uEnergy: { value: 0 },
      uDeepAlpha: { value: 0.7 },
      uGlow: { value: 1.6 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uEdge: { value: 0.08 },
      ...RAMP_UNIFORMS(),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: FIELD_FRAGMENT,
  });
  /** @param {object} s see `Ability#_syncField` */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uRadius.value = s.radius;
    u.uFrame.value = s.frame;
    u.uSpin.value = s.spin;
    u.uPitch.value = s.pitch;
    u.uSocket0.value = s.socket0;
    u.uVanes.value = s.vanes;
    u.uVaneSeat.value = s.vaneSeat;
    u.uSeat.value = s.seat;
    u.uGrip.value = s.grip;
    u.uFlow.value = s.flow;
    u.uShock.value = s.shock;
    u.uEnergy.value = s.energy;
    u.uFade.value = s.fade * g.opacity;
    u.uDissolve.value = s.dissolve;
    u.uArms.value = Math.max(1, Math.round(c.streamArms));
    u.uTwist.value = c.streamTwist;
    u.uTicks.value = Math.max(4, Math.round(c.rimTicks));
    u.uBand.value = c.bandGlow;
    u.uNoise.value = c.fieldNoise * g.noiseStrength;
    u.uScale.value = g.noiseFrequency;
    u.uDeepAlpha.value = c.fieldDeep;
    u.uGlow.value = c.fieldGlow * g.glow;
    u.uEdge.value = c.dissolveEdge;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The vane edge                                                        */
/* -------------------------------------------------------------------- */

const EDGE_VERTEX = /* glsl */ `
  attribute float aChord;
  attribute float aKick;
  varying float vChord;
  varying float vKick;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vWorldY;
  void main() {
    vUv = uv;
    vChord = aChord;
    vec4 local = vec4(position, 1.0);
    mat3 nm = mat3(modelMatrix);
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      nm = nm * mat3(instanceMatrix);
      vKick = aKick;
    #else
      vKick = 0.0;
    #endif
    vec4 world = modelMatrix * local;
    vWorldY = world.y;
    vNormalW = normalize(nm * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const EDGE_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uWidth;
  uniform float uFlow;
  uniform float uChevrons;
  uniform float uGrip;
  uniform float uFade;
  uniform float uFresnel;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  varying float vChord;
  varying float vKick;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vWorldY;
  ${commonGLSL}
  void main() {
    if (vWorldY < 0.0) discard;
    float lead = 1.0 - smoothstep(0.0, uWidth, vChord);
    float trail = smoothstep(0.86, 1.0, vChord) * 0.25;
    // Chevrons climbing the front of the blade, swept back with the chord.
    float c = fract(vUv.y * uChevrons - uFlow + vChord * 2.2);
    float chev = smoothstep(0.0, 0.08, c) * (1.0 - smoothstep(0.08, 0.3, c)) * (1.0 - smoothstep(0.15, 0.55, vChord));
    float tip = smoothstep(0.86, 1.0, vUv.y) * 0.6;
    float rim = fresnelTerm(vViewDir, vNormalW, 3.0, uFresnel) * 0.25;
    float drive = 0.45 + uGrip * 0.6 + vKick * 2.5;
    float L = (lead * 1.3 + trail * 0.5 + chev * 0.9 * drive + tip * 0.5 + rim * 0.3) * drive * uShaderIntensity;
    // Fade the foot into the floor so the cut reads as emergence.
    L *= smoothstep(0.0, 0.25, vWorldY);
    vec3 col = gradient4(uCore, uTint, uBody, uDeep, 1.0 - clamp(lead + vKick * 0.5, 0.0, 1.0) * 0.9 + 0.1);
    float a = clamp(L, 0.0, 1.0) * uFade;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * L * uGlow * uGlobalGlow, a);
  }
`;

export function createVaneEdgeMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uGlow: { value: 2 },
      uWidth: { value: 0.12 },
      uFlow: { value: 0 },
      uChevrons: { value: 5 },
      uGrip: { value: 0 },
      uFade: { value: 1 },
      uFresnel: { value: 1 },
      ...RAMP_UNIFORMS(),
    }),
    vertexShader: EDGE_VERTEX,
    fragmentShader: EDGE_FRAGMENT,
  });
  /** @param {object} s { flow, grip, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uFlow.value = s.flow;
    u.uGrip.value = s.grip;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.edgeGlow * g.glow;
    u.uWidth.value = Math.max(0.01, c.edgeWidth);
    u.uChevrons.value = c.edgeChevrons;
    u.uFresnel.value = g.fresnel;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The ribbons                                                          */
/* -------------------------------------------------------------------- */

const TRAIL_VERTEX = /* glsl */ `
  attribute vec3 aTangent;
  attribute float aAlpha;
  attribute float aSide;
  attribute float aT;
  attribute float aDart;
  uniform float uWidth;
  uniform float uTaper;
  varying float vT;
  varying float vSide;
  varying float vAlpha;
  varying float vDart;
  void main() {
    vec3 centre = position;
    vec3 view = normalize(cameraPosition - centre);
    vec3 tan = length(aTangent) > 1e-5 ? normalize(aTangent) : vec3(0.0, 1.0, 0.0);
    vec3 across = cross(tan, view);
    across = length(across) > 1e-5 ? normalize(across) : vec3(1.0, 0.0, 0.0);
    float w = uWidth * pow(1.0 - aT, uTaper) * step(0.001, aAlpha);
    vec3 world = centre + across * aSide * w;
    vT = aT;
    vSide = aSide;
    vAlpha = aAlpha;
    vDart = aDart;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const TRAIL_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uStreak;
  uniform float uFade;
  uniform float uClock;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  varying float vT;
  varying float vSide;
  varying float vAlpha;
  varying float vDart;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    float across = abs(vSide);
    float core = exp(-across * across * 7.0);
    float streak = 1.0 - uStreak * snoise01(vec3(vT * 9.0 - uClock * 3.0, across * 2.0, vDart * 3.1));
    float head = exp(-vT * 18.0) * 1.6;
    float body = pow(1.0 - vT, 1.4);
    float L = (core * (0.75 + head) + 0.18) * body * streak * uShaderIntensity;
    vec3 col = gradient4(uCore, uTint, uBody, uDeep, vT * 0.9 + (1.0 - core) * 0.35);
    float a = clamp(L, 0.0, 1.0) * vAlpha * uOpacity * uFade;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * (L + head) * uGlow * uGlobalGlow, a);
  }
`;

export function createTrailMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uWidth: { value: 0.2 },
      uTaper: { value: 1.3 },
      uGlow: { value: 2.4 },
      uOpacity: { value: 1 },
      uStreak: { value: 0.6 },
      uFade: { value: 1 },
      uClock: { value: 0 },
      ...RAMP_UNIFORMS(),
    }),
    vertexShader: TRAIL_VERTEX,
    fragmentShader: TRAIL_FRAGMENT,
  });
  /** @param {object} s { fade, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = c.trailWidth;
    u.uTaper.value = c.trailTaper;
    u.uGlow.value = c.trailGlow * g.glow;
    u.uOpacity.value = c.trailOpacity * g.opacity;
    u.uStreak.value = Math.min(1, c.trailStreak * g.noiseStrength);
    u.uFade.value = s.fade;
    u.uClock.value = s.clock;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The glow (needle tip)                                                */
/* -------------------------------------------------------------------- */

const GLOW_VERTEX = /* glsl */ `
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

const GLOW_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uPulse;
  uniform float uFade;
  uniform float uFresnel;
  uniform float uGlobalGlow;
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${commonGLSL}
  void main() {
    float rim = fresnelTerm(vViewDir, vNormalW, 2.2, uFresnel);
    // Hottest at the point (local z → 1).
    float point = smoothstep(0.6, 1.0, vLocal.z);
    vec3 col = gradient4(uCore, uTint, uBody, uDeep, 0.55 - point * 0.55 + (1.0 - rim) * 0.2);
    float L = (0.7 + 0.6 * uPulse) * (0.6 + rim * 0.6 + point);
    gl_FragColor = vec4(col * L * uGlow * uGlobalGlow, clamp(0.85 * uFade, 0.0, 1.0));
  }
`;

export function createGlowMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uGlow: { value: 2.5 },
      uPulse: { value: 0 },
      uFade: { value: 1 },
      uFresnel: { value: 1 },
      ...RAMP_UNIFORMS(),
    }),
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
  });
  /** @param {object} s { pulse, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uPulse.value = s.pulse;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.needleGlow * g.glow;
    u.uFresnel.value = g.fresnel;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The lens                                                             */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uSwirl;     // air dragged round the orbit band
  uniform float uShock;     // the seize's pressure ring
  uniform float uWave;      // its radius, 0..1
  uniform float uSeat;      // orbit band radius, 0..1
  uniform float uSpin;
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
    vec2 tangent = vec2(-radial.y, radial.x) * uSpin;
    float band = exp(-pow((r - uSeat) / 0.16, 2.0));
    float ring = exp(-pow((r - uWave) / 0.08, 2.0));
    vec3 np = vec3(q * 3.0 * uScale, uClock * 0.6);
    vec2 n = vec2(snoise(np), snoise(np + vec3(5.2, 1.3, 7.7))) * 0.35;
    vec2 dir = (tangent + n) * band * uSwirl + (radial + n * 0.5) * ring * uShock;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(band * uSwirl + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` disc. Opaque on purpose (see borrowed-tomorrow's lens):
 * the warp buffer wants the proxy's own value, and the expansion's
 * "transparent ⇒ VFX layer" routing must not pull it out of the warp pass.
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
      uSeat: { value: 0.5 },
      uSpin: { value: 1 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s { swirl, shock, wave, seat, spin, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSwirl.value = s.swirl * c.lensSwirl * g.distortion;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uSeat.value = s.seat;
    u.uSpin.value = s.spin;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
