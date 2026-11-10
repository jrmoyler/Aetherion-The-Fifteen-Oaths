import { AdditiveBlending, Color, DoubleSide, MeshStandardMaterial, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';
import { HEART_Y, SHOULDER } from './geometry.js';

/**
 * Photon Doppel — the bespoke shaders.
 *
 * Every layer is coloured from one four-stop ramp (`coreColor` white-hot →
 * `tintColor` pale → `bodyColor` sun-gold → `deepColor` the dark the decoy
 * drinks light into). Only the cores and rims go above 1, so bloom picks out
 * edges, not bodies.
 *
 *  - **the figure** — a hooded light-figure whose *core goes dark* as it
 *    drinks: bands of light run inward to the heart, the umbra spreads out
 *    from it, the rim stays white-hot and splits prismatically. Normal
 *    blended so the dark actually occludes the floor. The vertex stage lifts
 *    the arms round the shoulder, swells the chest, ripples the hem, leans the
 *    body; at the overexposure it whites out, swells and burns away upward.
 *  - **the floor** — dashed lure ring, the strike circle, rays combed toward
 *    the feet with dashes running inward, the umbra eating the floor under the
 *    figure; at the overexposure a white front runs out, leaving a sun-print
 *    that cools from the rim inward; noise dissolve on the exit.
 *  - **streamers** and **tethers** — ribbons with dashes that run into the
 *    heart; the tethers are arced between their ends in the vertex shader.
 *  - **the packet** — the photon in flight, fresnel-hot and flickering.
 *  - **the flare** — a camera-facing starburst with an anamorphic streak and
 *    a chromatic ghost ring.
 *  - **the warp** — `LAYER.DISTORTION` disc: inward pull while it drinks, a
 *    pressure ring at the overexposure.
 *  - **the shards** — `MeshStandardMaterial`, lit and shadow-casting: light
 *    gone solid.
 *
 * Every material reads `settings.photonDoppel` in `userData.sync(state)`.
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

/** Shared ramp uniforms, refreshed from settings. */
function rampUniforms() {
  return {
    uCore: { value: new Color('#ffffff') },
    uTint: { value: new Color('#fff0c8') },
    uBody: { value: new Color('#ffb93f') },
    uDeep: { value: new Color('#24150a') },
  };
}
function syncRamp(u, c) {
  u.uCore.value.copy(getColor(c.coreColor));
  u.uTint.value.copy(getColor(c.tintColor));
  u.uBody.value.copy(getColor(c.bodyColor));
  u.uDeep.value.copy(getColor(c.deepColor));
}
const RAMP_GLSL = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
`;

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

/* -------------------------------------------------------------------- */
/* 1 · The figure                                                       */
/* -------------------------------------------------------------------- */

const FIGURE_VERTEX = /* glsl */ `
  attribute float aPart;
  attribute float aSide;
  attribute float aArm;
  uniform float uClock;
  uniform float uBreath;     // chest swell, already × the breathing phase
  uniform float uSway;
  uniform float uRaise;      // arm lift round the shoulder (rad)
  uniform float uRipple;
  uniform float uSwell;      // overexposure swell (0..1)
  uniform float uScale;
  uniform vec3  uShoulder;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${noiseGLSL}

  vec3 rotZ(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
  }

  void main() {
    vec3 p = position;
    vec3 n = normal;
    // Arms: lift round the shoulder, the hand a little more than the elbow,
    // with a slow independent drift so the pose is never quite still.
    if (aPart > 0.5) {
      vec3 pivot = vec3(uShoulder.x * aSide, uShoulder.y, uShoulder.z);
      float ang = aSide * (uRaise * (0.55 + 0.45 * aArm) + 0.06 * sin(uClock * 1.3 + aSide));
      p = rotZ(p - pivot, ang) + pivot;
      n = rotZ(n, ang);
    }
    // Breath: the chest swells.
    float chest = smoothstep(0.38, 0.6, p.y) * (1.0 - smoothstep(0.66, 0.8, p.y));
    p.xz *= 1.0 + uBreath * chest;
    // The hem ripples like cloth in a draught.
    float hem = 1.0 - smoothstep(0.0, 0.5, p.y);
    float rip = snoise(vec3(p.xz * 5.0 * uScale, uClock * 0.9 + p.y * 3.0));
    p.xz *= 1.0 + uRipple * hem * rip;
    // A lean from the hem up.
    p.x += uSway * sin(uClock * 0.8) * p.y * p.y;
    p.z += uSway * 0.6 * cos(uClock * 0.6) * p.y * p.y;
    // Overexposure: the whole figure swells and its skin lifts in flakes.
    float flake = snoise(position * 9.0);
    p += n * uSwell * (0.03 + 0.05 * flake);
    p.xz *= 1.0 + uSwell * 0.12;
    vLocal = p;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * n);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FIGURE_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uAbsorb;     // 0..1 charge drunk so far
  uniform float uGlow;
  uniform float uRim;
  uniform float uRimPower;
  uniform float uSplit;
  uniform float uOpacity;
  uniform float uUmbra;
  uniform float uBands;
  uniform float uFlow;
  uniform float uWhite;      // overexposure white-out 0..1
  uniform float uDissolve;   // burn-away 0..1
  uniform float uFade;
  uniform float uScale;
  uniform float uHeartY;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  ${RAMP_GLSL}
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
    float edge = 1.0 - ndv;
    // Distance to the heart the light drains into.
    vec3 h = (vLocal - vec3(0.0, uHeartY, 0.0)) * vec3(1.0, 0.75, 1.0);
    float d = length(h);
    float n = fbm3(vLocal * 4.0 * uScale + vec3(0.0, 0.0, uClock * 0.25));
    // Bands of light whose phase runs inward: sin(k·d + ωt) holds still
    // where d = (c − ωt)/k, which shrinks.
    float bands = pow(0.5 + 0.5 * sin((d * uBands * 6.0 + n * 2.5) + uClock * uFlow * 6.2831), 5.0);
    // Body tone off the ramp: pale at the skin, saturated deeper in.
    vec3 col = gradient4(uCore, uTint, uBody, uDeep, 0.3 + 0.38 * ndv + 0.22 * uAbsorb);
    col += mix(uTint, uBody, 0.5) * bands * (0.3 + 0.8 * uAbsorb) * uShaderIntensity;
    // The umbra: the heart going dark as it drinks, spreading with charge.
    float reach = 0.16 + 0.5 * uAbsorb;
    float umbra = smoothstep(0.05, 0.55, uAbsorb) * uUmbra * (1.0 - smoothstep(reach * 0.3, reach, d + (n - 0.5) * 0.14)) * (1.0 - edge * edge);
    col = mix(col, uDeep * 0.35, clamp(umbra, 0.0, 1.0));
    col *= uGlow;
    // White-hot prismatic rim: each channel's fresnel at a slightly
    // different power, so the edge splits like light through a prism.
    vec3 prism = vec3(
      pow(edge, uRimPower * (1.0 - 0.1 * uSplit)),
      pow(edge, uRimPower),
      pow(edge, uRimPower * (1.0 + 0.16 * uSplit)));
    col += (uCore * 0.7 + uTint * 0.3) * prism * uRim * (0.8 + 0.6 * uAbsorb);
    // Overexposure: everything clips to white.
    col = mix(col, uCore * 3.5, uWhite);
    // Burn-away from the hem up, with a white-hot edge.
    float dn = snoise01(vLocal * vec3(9.0, 6.0, 9.0) * uScale + 1.7);
    float threshold = uDissolve * 1.35 - (1.0 - vLocal.y) * 0.35;
    vec2 dm = dissolveMask(dn, threshold, 0.09);
    col += uCore * dm.y * 5.0 + uBody * dm.y * 2.0;
    float alpha = mix(uOpacity, 1.0, clamp(edge * 1.4, 0.0, 1.0));
    alpha = max(alpha, umbra * 0.95);
    alpha = max(alpha, uWhite);
    alpha *= dm.x * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/** The hero figure. Normal blended: its dark core really hides the floor. */
export function createFigureMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uBreath: { value: 0 },
      uSway: { value: 0.05 },
      uRaise: { value: 0 },
      uRipple: { value: 0.08 },
      uSwell: { value: 0 },
      uScale: { value: 1 },
      uShoulder: { value: SHOULDER.clone() },
      uAbsorb: { value: 0 },
      uGlow: { value: 1 },
      uRim: { value: 3 },
      uRimPower: { value: 2.2 },
      uSplit: { value: 0.8 },
      uOpacity: { value: 0.7 },
      uUmbra: { value: 0.9 },
      uBands: { value: 3 },
      uFlow: { value: 1 },
      uWhite: { value: 0 },
      uDissolve: { value: 0 },
      uFade: { value: 1 },
      uHeartY: { value: HEART_Y },
      ...rampUniforms(),
    }),
    vertexShader: FIGURE_VERTEX,
    fragmentShader: FIGURE_FRAGMENT,
  });
  /** @param {object} s { clock, breath, raise, swell, absorb, white, dissolve, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uBreath.value = s.breath;
    u.uSway.value = c.swayAmount;
    u.uRaise.value = s.raise;
    u.uRipple.value = c.robeRipple * g.noiseStrength;
    u.uSwell.value = s.swell;
    u.uScale.value = g.noiseFrequency;
    u.uAbsorb.value = s.absorb;
    u.uGlow.value = c.bodyGlow;
    u.uRim.value = c.rimGlow * g.fresnel;
    u.uRimPower.value = c.rimPower;
    u.uSplit.value = c.prismSplit;
    u.uOpacity.value = c.bodyOpacity;
    u.uUmbra.value = c.umbraStrength;
    u.uBands.value = c.flowBands;
    u.uFlow.value = c.flowSpeed;
    u.uWhite.value = s.white;
    u.uDissolve.value = s.dissolve;
    u.uFade.value = s.fade * g.opacity;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 5 · The floor                                                        */
/* -------------------------------------------------------------------- */

const FIELD_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uZone;        // zoneRadius / lureRadius
  uniform float uUmbraR;      // umbra radius / lureRadius
  uniform float uTelegraph;   // 0..1 the circle drawn
  uniform float uAbsorb;      // 0..1 charge
  uniform float uDrink;       // 0..1 while the decoy is drinking
  uniform float uExpose;      // 0..1 the white front running out, −1 before
  uniform float uBurn;        // 0..1 the sun-print's presence
  uniform float uCool;        // 0..1 how far it has cooled
  uniform float uDissolve;
  uniform float uFade;
  uniform float uRays;
  uniform float uRaySpeed;
  uniform float uGlow;
  uniform float uTeleGlow;
  uniform float uBurnGlow;
  uniform float uScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  ${RAMP_GLSL}
  varying vec2 vUv;
  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float n = fbm3(vec3(p * 3.0 * uScale, uClock * 0.15));

    // The telegraph: the strike circle and the dashed lure ring.
    float ring = exp(-abs(r - uZone) * 70.0) + 0.35 * exp(-abs(r - uZone) * 14.0);
    float dash = smoothstep(0.35, 0.5, fract(a / 6.2831853 * 56.0 + uClock * 0.04));
    float lure = exp(-abs(r - 0.965) * 110.0) * dash;

    // Rays combed toward the feet, their dashes running inward.
    float comb = pow(abs(sin(a * uRays * 0.5 + n * 1.6)), 14.0);
    float run = pow(fract(r * 3.2 + uClock * uRaySpeed + n * 0.35), 4.0);
    float rays = comb * run * smoothstep(uUmbraR * 0.5, uUmbraR * 1.3, r) * (1.0 - smoothstep(0.88, 0.99, r));
    float feet = exp(-r * r * 260.0);

    // The umbra: the floor eaten under the decoy, a ragged edge that grows.
    float ur = uUmbraR * (0.45 + 0.75 * uAbsorb);
    float umbra = 1.0 - smoothstep(ur * 0.55, ur, r + (n - 0.5) * 0.14);
    float umbraLip = exp(-abs(r + (n - 0.5) * 0.14 - ur) * 45.0);

    // The overexposure: a white front, then a sun-print cooling inward.
    float front = uExpose >= 0.0 ? exp(-abs(r - uExpose * uZone * 1.1) * 28.0) * (1.0 - uExpose) : 0.0;
    float printR = uZone * (1.0 + (n - 0.5) * 0.18);
    float print = 1.0 - smoothstep(printR * 0.86, printR, r);
    float hotR = mix(uZone * 1.02, 0.03, uCool);
    float hot = print * (1.0 - smoothstep(hotR * 0.6, hotR, r));
    float streak = pow(abs(sin(a * 17.0 + n * 5.0)), 8.0) * print * smoothstep(0.08, uZone, r);
    float printRim = exp(-abs(r - printR * 0.93) * 40.0) * print;

    // Dark first, then light over it.
    float darkA = umbra * uAbsorb * 0.85 * uDrink + print * uBurn * 0.72;
    vec3 darkC = uDeep * 0.35;
    vec3 lightC = vec3(0.0);
    float lightA = 0.0;
    float tele = (ring * uTeleGlow + lure * 0.6) * uTelegraph;
    lightC += mix(uBody, uTint, 0.5) * tele;
    lightA += tele;
    float drink = (rays * (0.4 + uAbsorb) * uShaderIntensity + feet * 2.0 + umbraLip * 0.45) * uDrink * uGlow;
    lightC += gradient4(uCore, uTint, uBody, uDeep, r * 1.1 + 0.15) * drink;
    lightA += drink;
    float burn = (hot * 1.2 + streak * 0.6 * (1.0 - uCool * 0.6) + printRim * 0.8) * uBurn * uBurnGlow;
    lightC += gradient4(uCore, uTint, uBody, uDeep, 0.15 + uCool * 0.6 + r * 0.4) * burn;
    lightA += burn;
    lightC += uCore * front * 3.0;
    lightA += front * 3.0;

    vec2 dm = dissolveMask(snoise01(vec3(p * 3.6 * uScale, 4.1)), uDissolve, 0.07);
    float alpha = clamp(darkA + lightA, 0.0, 1.0);
    vec3 col = (darkC * darkA + lightC * uGlobalGlow) / max(darkA + lightA, 1e-3);
    col += uBody * dm.y * 2.5;
    alpha = alpha * dm.x * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

/** The floor under the decoy. Normal blended so the umbra can darken it. */
export function createFieldMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uZone: { value: 0.6 },
      uUmbraR: { value: 0.3 },
      uTelegraph: { value: 0 },
      uAbsorb: { value: 0 },
      uDrink: { value: 0 },
      uExpose: { value: -1 },
      uBurn: { value: 0 },
      uCool: { value: 0 },
      uDissolve: { value: 0 },
      uFade: { value: 1 },
      uRays: { value: 26 },
      uRaySpeed: { value: 0.8 },
      uGlow: { value: 1.3 },
      uTeleGlow: { value: 1.6 },
      uBurnGlow: { value: 1.8 },
      uScale: { value: 1 },
      ...rampUniforms(),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: FIELD_FRAGMENT,
  });
  /** @param {object} s { clock, zone, umbra, telegraph, absorb, drink, expose, burn, cool, dissolve, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uZone.value = s.zone;
    u.uUmbraR.value = s.umbra;
    u.uTelegraph.value = s.telegraph;
    u.uAbsorb.value = s.absorb;
    u.uDrink.value = s.drink;
    u.uExpose.value = s.expose;
    u.uBurn.value = s.burn;
    u.uCool.value = s.cool;
    u.uDissolve.value = s.dissolve;
    u.uFade.value = s.fade * c.fieldOpacity * g.opacity;
    u.uRays.value = Math.round(c.rayCount);
    u.uRaySpeed.value = c.raySpeed;
    u.uGlow.value = c.fieldGlow;
    u.uTeleGlow.value = c.telegraphGlow;
    u.uBurnGlow.value = c.burnGlow;
    u.uScale.value = g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 3 · Streamers                                                        */
/* -------------------------------------------------------------------- */

const STREAMER_VERTEX = /* glsl */ `
  attribute float aS;
  attribute float aAcross;
  attribute float aSeed;
  uniform float uWidth;      // metres
  varying float vS;
  varying float vAcross;
  varying float vSeed;
  void main() {
    vS = aS;
    vAcross = aAcross;
    vSeed = aSeed;
    vec4 world = modelMatrix * vec4(position, 1.0);
    // Height in metres, tapering as the ribbon reaches the heart.
    world.y += aAcross * uWidth * 0.5 * (1.0 - 0.7 * aS);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RIBBON_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uSpeed;
  uniform float uDashes;
  uniform float uPower;
  uniform float uGlow;
  uniform float uGlobalGlow;
  ${RAMP_GLSL}
  varying float vS;
  varying float vAcross;
  varying float vSeed;
  ${commonGLSL}
  void main() {
    // fract(k·s − ωt) holds still where s grows with t: dashes run inward.
    float head = fract(vS * uDashes - uClock * uSpeed + vSeed * 7.0);
    float dash = pow(head, 5.0);
    float edge = 1.0 - abs(vAcross);
    edge = edge * edge * (3.0 - 2.0 * edge);
    float ends = smoothstep(0.0, 0.12, vS) * (1.0 - smoothstep(0.88, 1.0, vS));
    float a = (dash * 1.4 + 0.12) * edge * ends * uPower;
    vec3 col = gradient4(uCore, uTint, uBody, uDeep, 0.85 - dash * 0.8);
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * (0.6 + dash), clamp(a, 0.0, 1.0));
  }
`;

function ribbonUniforms() {
  return {
    uClock: { value: 0 },
    uSpeed: { value: 1 },
    uDashes: { value: 4 },
    uPower: { value: 0 },
    uGlow: { value: 1.5 },
    ...rampUniforms(),
  };
}

/** Light spiralling into the heart. Additive. */
export function createStreamerMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({ ...ribbonUniforms(), uWidth: { value: 0.12 } }),
    vertexShader: STREAMER_VERTEX,
    fragmentShader: RIBBON_FRAGMENT,
  });
  /** @param {object} s { clock, power } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uSpeed.value = c.streamerSpeed;
    u.uDashes.value = c.streamerDashes;
    u.uPower.value = s.power * c.streamerOpacity * g.opacity;
    u.uGlow.value = c.streamerGlow;
    u.uWidth.value = c.streamerWidth;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 4 · Tethers                                                          */
/* -------------------------------------------------------------------- */

const TETHER_VERTEX = /* glsl */ `
  #define MAX_TETHERS 8
  attribute float aT;
  attribute float aAcross;
  attribute float aIndex;
  uniform vec3 uFrom[MAX_TETHERS];
  uniform vec3 uTo[MAX_TETHERS];
  uniform float uLive[MAX_TETHERS];
  uniform float uWidth;
  uniform float uArc;
  varying float vS;
  varying float vAcross;
  varying float vSeed;
  void main() {
    int i = int(aIndex + 0.5);
    vec3 a = uFrom[i];
    vec3 b = uTo[i];
    // Reel: the tether is drawn from the enemy toward the heart as it lives.
    float live = uLive[i];
    float t = aT * clamp(live, 0.0, 1.0);
    vec3 span = b - a;
    float len = length(span);
    vec3 p = mix(a, b, t) + vec3(0.0, sin(3.14159 * t) * uArc * len * 0.25, 0.0);
    vec3 dir = normalize(span + vec3(0.0, cos(3.14159 * t) * uArc * len * 0.785, 0.0) + 1e-4);
    vec3 view = normalize(cameraPosition - p);
    vec3 side = normalize(cross(dir, view) + 1e-5);
    float w = uWidth * 0.5 * (0.55 + 0.45 * sin(3.14159 * aT)) * step(0.001, live);
    p += side * aAcross * w;
    vS = aT;
    vAcross = aAcross;
    vSeed = aIndex * 0.37;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

/** Tethers from every exposed enemy into the heart. Additive, world space. */
export function createTetherMaterial(count = 8) {
  const from = [];
  const to = [];
  const live = [];
  for (let i = 0; i < count; i++) {
    from.push(new Vector3());
    to.push(new Vector3());
    live.push(0);
  }
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      ...ribbonUniforms(),
      uFrom: { value: from },
      uTo: { value: to },
      uLive: { value: live },
      uWidth: { value: 0.16 },
      uArc: { value: 0.8 },
    }),
    vertexShader: TETHER_VERTEX,
    fragmentShader: RIBBON_FRAGMENT,
  });
  /** @param {object} s { clock, power } — ends are written by the ability */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uSpeed.value = c.tetherSpeed;
    u.uDashes.value = 3;
    u.uPower.value = s.power * g.opacity;
    u.uGlow.value = c.tetherGlow;
    u.uWidth.value = c.tetherWidth;
    u.uArc.value = c.tetherArc;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 6 · The packet                                                       */
/* -------------------------------------------------------------------- */

const LIT_VERTEX = /* glsl */ `
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

const PACKET_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uPower;
  uniform float uGlow;
  uniform float uGlobalGlow;
  ${RAMP_GLSL}
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${commonGLSL}
  void main() {
    float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    // A hot core along the axis, flickering bands sliding toward the nose.
    float bands = 0.5 + 0.5 * sin(vLocal.z * 40.0 - uClock * 30.0);
    vec3 col = mix(uBody, uTint, ndv) * (1.0 + bands * 0.6) + uCore * pow(ndv, 4.0) * 2.5;
    float a = (0.35 + 0.65 * ndv) * uPower;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

export function createPacketMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({ uClock: { value: 0 }, uPower: { value: 1 }, uGlow: { value: 2.6 }, ...rampUniforms() }),
    vertexShader: LIT_VERTEX,
    fragmentShader: PACKET_FRAGMENT,
  });
  /** @param {object} s { clock, power } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uPower.value = s.power * g.opacity;
    u.uGlow.value = c.packetGlow;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 7 · The flare                                                        */
/* -------------------------------------------------------------------- */

const FLARE_VERTEX = /* glsl */ `
  uniform float uAspect;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 centre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float size = length(modelMatrix[1].xyz);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = centre + right * position.x * size * uAspect + up * position.y * size;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FLARE_FRAGMENT = /* glsl */ `
  uniform float uPower;
  uniform float uAspect;
  uniform float uRot;
  uniform float uGlow;
  uniform float uGlobalGlow;
  ${RAMP_GLSL}
  varying vec2 vUv;
  void main() {
    vec2 q = (vUv - 0.5) * 2.0;
    vec2 c = vec2(q.x * uAspect, q.y);
    float r = length(c);
    float core = exp(-r * r * 30.0);
    float anam = exp(-abs(q.y) * 38.0) * (1.0 - abs(q.x));
    float star = pow(abs(cos(atan(c.y, c.x) * 3.0 + uRot)), 60.0) * exp(-r * 3.2);
    float ghost = exp(-pow((r - 0.62) / 0.035, 2.0));
    vec3 chroma = vec3(exp(-pow((r - 0.6) / 0.03, 2.0)), ghost, exp(-pow((r - 0.645) / 0.03, 2.0)));
    vec3 col = uCore * core * 4.0 + uTint * anam * 2.2 + uBody * star * 1.6 + chroma * uBody * 0.6;
    float a = clamp(core + anam + star + ghost * 0.3, 0.0, 1.0) * uPower;
    if (a < 0.002) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, a);
  }
`;

export function createFlareMaterial() {
  const material = new ShaderMaterial({
    ...additive({ depthTest: false }),
    uniforms: sharedUniforms({ uPower: { value: 0 }, uAspect: { value: 3 }, uRot: { value: 0 }, uGlow: { value: 2.4 }, ...rampUniforms() }),
    vertexShader: FLARE_VERTEX,
    fragmentShader: FLARE_FRAGMENT,
  });
  /** @param {object} s { power, rot } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uPower.value = s.power * g.opacity;
    u.uAspect.value = Math.max(1, c.flareStretch);
    u.uRot.value = s.rot;
    u.uGlow.value = c.flareGlow;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 10 · The warp                                                        */
/* -------------------------------------------------------------------- */

const WARP_FRAGMENT = /* glsl */ `
  uniform float uPull;
  uniform float uShock;
  uniform float uWave;
  uniform float uClock;
  uniform float uScale;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    vec2 radial = q / max(r, 1e-3);
    float body = 1.0 - smoothstep(0.15, 1.0, r);
    float ring = exp(-pow((r - uWave) / 0.09, 2.0));
    vec3 np = vec3(q * 2.2 * uScale, uClock * 0.5);
    vec2 n = vec2(snoise(np), snoise(np + vec3(4.1, 2.7, 9.3))) * 0.35;
    vec2 dir = (-radial + n) * body * uPull + (radial + n) * ring * uShock;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(body * uPull + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** `LAYER.DISTORTION` disc. Opaque so the expansion routing keeps it in the warp pass. */
export function createWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uPull: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: WARP_FRAGMENT,
  });
  /** @param {object} s { pull, shock, wave, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uPull.value = s.pull * c.warpPull * g.distortion;
    u.uShock.value = s.shock * c.warpShock * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* 2 · Shards                                                           */
/* -------------------------------------------------------------------- */

/** Light gone solid: lit, shadow casting crystal that cools as it falls. */
export function createShardMaterial() {
  const material = new MeshStandardMaterial({
    color: 0xfff0c8,
    metalness: 0.15,
    roughness: 0.12,
    emissive: 0xffb93f,
    emissiveIntensity: 2,
    flatShading: true,
  });
  /** @param {object} s { heat } 0..1 */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    material.color.copy(getColor(c.tintColor));
    material.emissive.copy(getColor(c.bodyColor)).lerp(getColor(c.coreColor), 0.3 * s.heat);
    material.emissiveIntensity = c.shardGlow * g.glow * (0.08 + 0.92 * s.heat);
    material.metalness = c.shardMetalness;
    material.roughness = c.shardRoughness;
  };
  return material;
}
