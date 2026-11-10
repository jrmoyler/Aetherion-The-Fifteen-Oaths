import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Resonance Theft — the bespoke shaders. Every colour comes from one
 * four-stop ramp (`colorCore → colorTint → colorBody → colorDeep`).
 *
 *  - **the horn** — lit, opaque lacquered bronze: the scene sun (wrapped
 *    lambert + Blinn lobe), one sample of the room's HDR probe, a fresnel rim
 *    and fbm grain in the lacquer. The tube *swells* with a standing wave run
 *    along its arclength in the vertex stage (toward the apex while it
 *    listens, toward the bell at the playback). Groove bands round the tube
 *    light one by one from the bell upward as frequencies are captured; the
 *    inside of the bell glows with what it holds. On exit it dissolves through
 *    noise with a hot edge.
 *  - **taps** — corkscrew waveform ribbons from an enemy's chest into the
 *    bell, placed entirely in the vertex stage (bezier + helix + billboard);
 *    bright packets run along them into the horn.
 *  - **the floor** — a spectrogram pressed into the stone: a dark plum stain,
 *    spiral record grooves, a ring of spectrum bars, one bright groove per
 *    captured frequency, interference rings at the playback; noise dissolve.
 *  - **reeds** — the instanced spectrum ring: ramp from a dark foot to a
 *    white-hot tip, fresnel edges, a lit slot.
 *  - **the cone** — the playback: a pressure cone reshaped from a cylinder,
 *    rings running down it from the bell to the floor.
 *  - **the lens** — `LAYER.DISTORTION`: an inward draw under the bell while
 *    listening, an outward pressure ring at the playback.
 *
 * Each material reads `settings.resonanceTheft` in `userData.sync(state)`.
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

/** Copy the four-stop ramp from settings into four colour uniforms. */
function syncRamp(u, c) {
  u.uCore.value.copy(getColor(c.colorCore));
  u.uTint.value.copy(getColor(c.colorTint));
  u.uBody.value.copy(getColor(c.colorBody));
  u.uDeep.value.copy(getColor(c.colorDeep));
}
const ramp = () => ({
  uCore: { value: new Color() },
  uTint: { value: new Color() },
  uBody: { value: new Color() },
  uDeep: { value: new Color() },
});
const RAMP_GLSL = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  // 0 = white-hot core … 1 = dark deep.
  vec3 rampAt(float t) { return gradient4(uCore, uTint, uBody, uDeep, t); }
`;

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
/* The horn                                                             */
/* -------------------------------------------------------------------- */

const HORN_VERTEX = /* glsl */ `
  attribute float aS;
  attribute float aRad;
  uniform float uRipAmp;     // swell, × local tube radius
  uniform float uRipFreq;    // waves along the tube
  uniform float uRipPhase;   // integrated on the CPU: sign = direction of travel
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying float vS;
  varying float vWave;
  void main() {
    vS = aS;
    // A travelling standing-wave swell along the arclength, strongest in the
    // narrow coil where it reads as the tube *swallowing*.
    float w = sin(aS * uRipFreq * 6.2831853 + uRipPhase);
    vWave = w;
    float env = 0.35 + 0.65 * (1.0 - smoothstep(0.75, 1.0, aS));
    vec3 p = position + normal * aRad * uRipAmp * w * env;
    vLocal = position;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const HORN_FRAGMENT = /* glsl */ `
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;    // toward the sun (shared frame uniform)
  uniform float uMetal;
  uniform float uGloss;
  uniform float uRim;
  uniform float uGrooves;
  uniform float uLitBands;    // groove bands lit, counted from the bell
  uniform float uGrooveGlow;
  uniform float uListen;      // 0..1 how hard it is drawing in
  uniform float uFlow;        // phase of the energy crawling along the tube
  uniform float uPlay;        // 0..1 playback flare
  uniform float uSteal;       // 0..1 flash when a foreign attack is swallowed
  uniform float uDissolve;
  uniform float uEdge;
  uniform float uScale;
  uniform float uGlow;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying float vS;
  varying float vWave;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  vec2 equirect(vec3 d) {
    return vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
  void main() {
    // Exit: dissolve from the bell upward through noise, with a hot edge.
    float n = snoise01(vLocal * 9.0 * uScale) * 0.75 + (1.0 - vS) * 0.25;
    vec2 dm = dissolveMask(n, uDissolve, uEdge);
    if (dm.x < 0.5 && uDissolve > 0.0) discard;

    vec3 N = normalize(vNormalW);
    bool inside = !gl_FrontFacing;
    if (inside) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);

    // Lacquer: deep plum-bronze with a little of the body hue, fbm grain.
    float grain = fbm3(vLocal * 22.0 * uScale);
    vec3 albedo = mix(uDeep * 1.1, uBody * 0.3, 0.25 + 0.3 * grain);

    float lambert = max(dot(N, L), 0.0);
    float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    float diffuse = 0.18 + 0.82 * mix(lambert, wrap * wrap, 0.35);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), uGloss) * uMetal * 1.6;
    vec3 env = texture2D(uEnvMap, equirect(reflect(-V, N))).rgb;
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    vec3 col = albedo * diffuse + env * albedo * (0.4 + uMetal) * 0.6 + vec3(spec) * mix(vec3(1.0), uTint, 0.4);
    col += uTint * fres * uRim * 0.5;

    // Groove bands: one per station, lit from the bell upward per capture.
    float band = fract(vS * uGrooves);
    float groove = 1.0 - smoothstep(0.0, 0.07, abs(band - 0.5));
    float k = floor((1.0 - vS) * uGrooves);
    float lit = step(k + 0.5, uLitBands);
    float hum = 0.75 + 0.25 * vWave;
    vec3 grooveCol = mix(uBody * 0.25, mix(uTint, uCore, 0.4 * hum), lit);
    col += grooveCol * groove * (0.25 + lit * uGrooveGlow * hum) * uShaderIntensity;

    // Energy crawling up the tube while it listens (stolen sound swallowed).
    float crawl = pow(max(0.0, sin((vS * 9.0 + uFlow) * 3.14159)), 10.0) * uListen;
    col += uBody * crawl * 1.4 * (1.0 - smoothstep(0.85, 1.0, vS));

    // The inside of the bell holds the light of what it caught.
    if (inside) {
      float depth = smoothstep(0.78, 1.0, vS);
      col = mix(col, rampAt(0.75 - 0.6 * depth) * (0.6 + uLitBands * 0.18 + uPlay * 3.0), 0.75 * depth);
    }

    col += mix(uBody, uTint, fres) * uPlay * (0.35 + fres) * 0.9;
    col += uTint * uSteal * 1.2;
    col += uCore * dm.y * 4.0;
    col *= uGlow * uGlobalGlow;
    col /= 1.0 + col * 0.12;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The lit, opaque cochlear horn. */
export function createHornMaterial() {
  const material = new ShaderMaterial({
    side: DoubleSide,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uRipAmp: { value: 0 },
      uRipFreq: { value: 26 },
      uRipPhase: { value: 0 },
      uMetal: { value: 0.75 },
      uGloss: { value: 48 },
      uRim: { value: 1 },
      uGrooves: { value: 14 },
      uLitBands: { value: 0 },
      uGrooveGlow: { value: 2 },
      uListen: { value: 0 },
      uFlow: { value: 0 },
      uPlay: { value: 0 },
      uSteal: { value: 0 },
      uDissolve: { value: 0 },
      uEdge: { value: 0.08 },
      uScale: { value: 1 },
      uGlow: { value: 1 },
      ...ramp(),
    }),
    vertexShader: HORN_VERTEX,
    fragmentShader: HORN_FRAGMENT,
  });
  /** @param {object} s { phase, litBands, listen, flow, play, steal, dissolve, swell } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uRipAmp.value = c.rippleAmp * s.swell * g.noiseStrength;
    u.uRipFreq.value = c.rippleFreq;
    u.uRipPhase.value = s.phase;
    u.uMetal.value = c.hornMetalness;
    u.uGloss.value = c.hornGloss;
    u.uRim.value = c.hornRim * g.fresnel;
    u.uGrooves.value = c.grooveCount;
    u.uLitBands.value = s.litBands;
    u.uGrooveGlow.value = c.grooveGlow;
    u.uListen.value = s.listen;
    u.uFlow.value = s.flow;
    u.uPlay.value = s.play;
    u.uSteal.value = s.steal;
    u.uDissolve.value = s.dissolve;
    u.uEdge.value = c.dissolveEdge;
    u.uScale.value = g.noiseFrequency;
    u.uGlow.value = g.glow;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Taps                                                                 */
/* -------------------------------------------------------------------- */

const TAP_VERTEX = /* glsl */ `
  attribute float aT;
  attribute float aSide;
  uniform vec3  uStart;      // the enemy's chest
  uniform vec3  uCtrl;       // bezier control (arcs the tether up)
  uniform vec3  uEnd;        // the bell's mouth
  uniform float uAmp;        // corkscrew radius at mid-span (m)
  uniform float uWaves;      // corkscrew turns along the span
  uniform float uPhase;      // integrated; the helix screws toward the horn
  uniform float uWidth;      // ribbon width (m)
  uniform float uReach;      // 0..1 how far it has reached from the enemy
  varying float vT;
  varying float vSide;
  varying float vCrest;
  vec3 bez(float t) {
    float u = 1.0 - t;
    return u * u * uStart + 2.0 * u * t * uCtrl + t * t * uEnd;
  }
  void main() {
    float t = min(aT, uReach);
    vT = aT;
    vec3 P = bez(t);
    vec3 T = normalize(bez(min(t + 0.01, 1.0)) - bez(max(t - 0.01, 0.0)) + vec3(0.0, 1e-5, 0.0));
    vec3 V = normalize(cameraPosition - P);
    vec3 side = normalize(cross(T, V) + vec3(1e-5, 0.0, 0.0));
    vec3 up = normalize(cross(side, T));
    float env = sin(3.14159 * t) * (0.35 + 0.65 * t);
    float a = 6.2831853 * uWaves * t - uPhase;
    vCrest = cos(a);
    vec3 helix = (side * cos(a) + up * sin(a)) * uAmp * env;
    vec3 world = P + helix + side * aSide * uWidth * 0.5 * (0.6 + 0.4 * (vCrest * 0.5 + 0.5));
    vSide = aSide;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const TAP_FRAGMENT = /* glsl */ `
  uniform float uReach;
  uniform float uPacket;     // integrated phase of the packets
  uniform float uGlow;
  uniform float uFade;
  uniform float uGlobalGlow;
  varying float vT;
  varying float vSide;
  varying float vCrest;
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    if (vT > uReach + 0.002) discard;
    float core = exp(-vSide * vSide * 5.0);
    // Packets of stolen sound running into the horn.
    float packet = pow(fract(vT * 3.0 - uPacket), 6.0);
    float lead = exp(-abs(vT - uReach) * 40.0) * step(uReach, 0.999);
    float heat = clamp(core * (0.35 + 0.65 * packet) + lead + (vCrest * 0.5 + 0.5) * 0.15, 0.0, 1.0);
    vec3 col = rampAt(1.0 - heat * 0.95) * (0.6 + heat * 1.6);
    float a = core * (0.35 + 0.65 * packet + lead) * uFade;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** One corkscrew waveform tether (one material per tether: own end points). */
export function createTapMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uStart: { value: new Vector3() },
      uCtrl: { value: new Vector3() },
      uEnd: { value: new Vector3() },
      uAmp: { value: 0.2 },
      uWaves: { value: 5 },
      uPhase: { value: 0 },
      uWidth: { value: 0.1 },
      uReach: { value: 0 },
      uPacket: { value: 0 },
      uGlow: { value: 2 },
      uFade: { value: 1 },
      ...ramp(),
    }),
    vertexShader: TAP_VERTEX,
    fragmentShader: TAP_FRAGMENT,
  });
  /** @param {object} s { start, ctrl, end, amp, waves, phase, width, reach, packet, glow, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(s.start);
    u.uCtrl.value.copy(s.ctrl);
    u.uEnd.value.copy(s.end);
    u.uAmp.value = s.amp * (0.6 + 0.4 * g.turbulence);
    u.uWaves.value = s.waves;
    u.uPhase.value = s.phase;
    u.uWidth.value = s.width;
    u.uReach.value = s.reach;
    u.uPacket.value = s.packet;
    u.uGlow.value = s.glow * g.glow;
    u.uFade.value = s.fade * g.opacity;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The floor                                                            */
/* -------------------------------------------------------------------- */

const FLOOR_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uEnergy;      // 0..1 how awake the floor is
  uniform float uListen;
  uniform float uCaptured;    // captured frequencies (count)
  uniform float uWave;        // 0..1 playback rings, −1 before
  uniform float uSpin;
  uniform float uDissolve;
  uniform float uFade;
  uniform float uStain;
  uniform float uGlow;
  uniform float uGrooves;
  uniform float uBins;
  uniform float uSpecH;
  uniform float uNoise;
  uniform float uScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float turn = a / 6.2831853 + 0.5;
    float mottle = fbm3(vec3(p * 2.6 * uScale, 1.7));

    // The stain: dark plum soaked into the stone, mottled, soft-edged.
    float stainA = uStain * (1.0 - smoothstep(0.72, 1.0, r)) * (0.75 + 0.5 * mottle) * uEnergy;

    // Record grooves: a tight spiral between the label and the spectrum.
    float spiral = r * uGrooves + turn - uSpin * 0.5;
    float groove = pow(abs(cos(spiral * 3.14159)), 18.0) * smoothstep(0.14, 0.2, r) * (1.0 - smoothstep(0.68, 0.74, r));

    // Spectrum bars round the rim, pumping with noise and with the listening.
    float bin = floor(turn * uBins);
    float binX = fract(turn * uBins);
    float h = snoise01(vec3(bin * 0.37, uClock * 1.7, 3.1)) * uNoise;
    h = (0.25 + 0.75 * h) * (0.4 + 0.6 * uListen + 0.5 * max(uWave, 0.0) * (1.0 - max(uWave, 0.0))) * uSpecH;
    float inBar = step(0.15, binX) * step(binX, 0.85) * step(0.76, r) * step(r, 0.76 + h);
    float tip = inBar * smoothstep(0.76 + h - 0.03, 0.76 + h, r);

    // One bright groove per captured frequency, nested from the label out.
    float caught = 0.0;
    for (int i = 0; i < 10; i++) {
      float fi = float(i);
      if (fi >= uCaptured) break;
      float ri = 0.24 + fi * 0.048;
      caught += exp(-abs(r - ri) * 140.0) * (0.75 + 0.25 * sin(uClock * 7.0 - fi * 1.3));
    }

    // Playback: interference rings run out from under the bell.
    float wave = 0.0;
    if (uWave >= 0.0) {
      for (int i = 0; i < 3; i++) {
        float wr = uWave * 1.15 - float(i) * 0.13;
        wave += exp(-abs(r - wr) * 38.0) * (1.0 - uWave) * (1.0 - float(i) * 0.25);
      }
    }
    float rim = exp(-abs(r - 0.965) * 90.0);

    vec2 dm = dissolveMask(snoise01(vec3(p * 3.1 * uScale, 4.2)) * 0.8 + r * 0.2, uDissolve, 0.06);

    float glowA = (groove * 0.3 * uListen + inBar * 0.55 + caught + wave * 1.4 + rim * 0.6) * uShaderIntensity;
    vec3 emit = uBody * groove * 0.5 * uListen
      + rampAt(0.55 - 0.45 * tip) * inBar * (0.8 + tip * 1.5)
      + rampAt(0.15) * caught * 1.6
      + rampAt(0.05) * wave * 2.0
      + uTint * rim * 0.9;
    emit *= uGlow * uGlobalGlow;
    emit += uCore * dm.y * 3.0;

    float alpha = clamp(stainA + glowA * uEnergy, 0.0, 1.0) * dm.x * uFade;
    vec3 col = mix(uDeep * 0.6, emit, clamp(glowA, 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
  }
`;

/** The spectrogram pressed into the floor. Alpha-blended so its deep tone darkens the stone. */
export function createFloorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uEnergy: { value: 0 },
      uListen: { value: 0 },
      uCaptured: { value: 0 },
      uWave: { value: -1 },
      uSpin: { value: 0 },
      uDissolve: { value: 0 },
      uFade: { value: 1 },
      uStain: { value: 0.5 },
      uGlow: { value: 1 },
      uGrooves: { value: 40 },
      uBins: { value: 56 },
      uSpecH: { value: 0.2 },
      uNoise: { value: 1 },
      uScale: { value: 1 },
      ...ramp(),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: FLOOR_FRAGMENT,
  });
  /** @param {object} s { clock, energy, listen, captured, wave, spin, dissolve, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uEnergy.value = s.energy;
    u.uListen.value = s.listen;
    u.uCaptured.value = s.captured;
    u.uWave.value = s.wave;
    u.uSpin.value = s.spin;
    u.uDissolve.value = s.dissolve;
    u.uFade.value = s.fade * g.opacity;
    u.uStain.value = c.floorStain;
    u.uGlow.value = c.floorGlow * g.glow;
    u.uGrooves.value = c.grooveRings;
    u.uBins.value = c.spectrumBins;
    u.uSpecH.value = c.spectrumHeight;
    u.uNoise.value = Math.min(1.5, g.noiseStrength);
    u.uScale.value = g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Reeds                                                                */
/* -------------------------------------------------------------------- */

const REED_VERTEX = /* glsl */ `
  varying float vH;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec2 vXY;
  void main() {
    mat4 local = mat4(1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix;
    #endif
    vH = clamp(position.y, 0.0, 1.0);
    vXY = position.xy;
    vec4 world = modelMatrix * local * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * mat3(local) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const REED_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uFade;
  uniform float uFresnel;
  uniform float uGlobalGlow;
  varying float vH;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec2 vXY;
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    float rim = fresnelTerm(vViewDir, vNormalW, 2.0, uFresnel);
    // Dark foot → saturated body → pale tint → white-hot tip.
    vec3 col = rampAt(1.0 - vH * 0.95) * (0.5 + vH * 1.4) + uTint * rim * 0.8;
    // The slot speaks: a lit seam up the middle.
    float slot = exp(-abs(vXY.x) * 30.0) * smoothstep(0.1, 0.2, vH) * (1.0 - smoothstep(0.58, 0.66, vH));
    col += uCore * slot * 1.2;
    float a = (0.35 + 0.65 * vH + rim * 0.5) * smoothstep(0.0, 0.08, vH) * uFade;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The instanced spectrum ring. */
export function createReedMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uGlow: { value: 1.8 },
      uFade: { value: 1 },
      uFresnel: { value: 1 },
      ...ramp(),
    }),
    vertexShader: REED_VERTEX,
    fragmentShader: REED_FRAGMENT,
  });
  material.userData.instanced = true;
  /** @param {object} s { fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.reedGlow * g.glow;
    u.uFade.value = s.fade * g.opacity;
    u.uFresnel.value = g.fresnel;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The playback cone                                                    */
/* -------------------------------------------------------------------- */

const CONE_VERTEX = /* glsl */ `
  uniform float uTopY;       // the bell's mouth height (m, local)
  uniform float uTopR;       // mouth radius (m)
  uniform float uFootR;      // foot radius on the floor (m)
  uniform float uProgress;   // 0..1 through the playback
  varying float vT;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vWorld;
  void main() {
    // The carrier is a unit open cylinder, y ∈ [−0.5, 0.5]; t = 0 at the bell.
    float t = 0.5 - position.y;
    vT = t;
    vec2 ring = normalize(position.xz + vec2(1e-5));
    // The foot spreads as the pressure lands.
    float foot = uFootR * (0.55 + 0.45 * smoothstep(0.0, 0.5, uProgress));
    float rad = mix(uTopR, foot, pow(t, 1.4));
    vec3 p = vec3(ring.x * rad, mix(uTopY, 0.04, t), ring.y * rad);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * vec3(ring.x, (uTopR - foot) / max(uTopY, 0.1), ring.y));
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CONE_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uRings;
  uniform float uGlow;
  uniform float uFade;
  uniform float uScale;
  uniform float uGlobalGlow;
  varying float vT;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    float edge = fresnelTerm(vViewDir, vNormalW, 1.6, 1.0);
    // Pressure rings run down the cone from the bell to the floor.
    float rings = pow(max(0.0, sin((vT * uRings - uProgress * uRings * 1.6) * 3.14159)), 12.0);
    float streak = snoise01(vec3(atan(vWorld.z, vWorld.x) * 4.0 * uScale, vT * 3.0 - uProgress * 6.0, 1.0));
    float ends = smoothstep(0.0, 0.08, vT) * (1.0 - smoothstep(0.85, 1.0, vT));
    float life = 1.0 - smoothstep(0.35, 1.0, uProgress);
    float a = (0.12 + edge * 0.6 + rings * 0.9) * (0.7 + 0.3 * streak) * ends * life * uFade;
    if (a < 0.003) discard;
    vec3 col = rampAt(0.1 + 0.5 * vT - rings * 0.1) * (0.8 + rings * 1.4);
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The playback's pressure cone. */
export function createConeMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uTopY: { value: 1.5 },
      uTopR: { value: 1 },
      uFootR: { value: 3 },
      uProgress: { value: 0 },
      uRings: { value: 7 },
      uGlow: { value: 2.6 },
      uFade: { value: 1 },
      uScale: { value: 1 },
      ...ramp(),
    }),
    vertexShader: CONE_VERTEX,
    fragmentShader: CONE_FRAGMENT,
  });
  /** @param {object} s { topY, topR, footR, progress, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTopY.value = s.topY;
    u.uTopR.value = s.topR;
    u.uFootR.value = s.footR;
    u.uProgress.value = s.progress;
    u.uRings.value = c.coneRings;
    u.uGlow.value = c.coneGlow * g.glow;
    u.uFade.value = s.fade * g.opacity;
    u.uScale.value = g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The lens                                                             */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uDraw;        // inward draw under the bell while listening
  uniform float uShock;       // the playback's pressure ring
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
    float body = 1.0 - smoothstep(0.2, 0.9, r);
    float ring = exp(-pow((r - uWave) / 0.09, 2.0));
    // Concentric pressure ripples drawn inward toward the bell.
    float ripple = sin(r * 30.0 + uClock * 9.0) * 0.5 + 0.5;
    vec3 np = vec3(q * 2.2 * uScale, uClock * 0.5);
    vec2 n = vec2(snoise(np), snoise(np + vec3(4.1, 2.7, 9.3))) * 0.25;
    vec2 dir = (-radial * (0.6 + 0.4 * ripple) + tangent * 0.2 + n) * body * uDraw + (radial + n) * ring * uShock;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(body * uDraw * (0.5 + 0.5 * ripple) + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` disc. Opaque on purpose (like Borrowed Tomorrow's lens):
 * the offset buffer wants the proxy's own value, and an opaque proxy is not
 * pulled onto the VFX layer by the expansion's transparency routing.
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
      uDraw: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s { draw, shock, wave, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uDraw.value = s.draw * c.lensDraw * g.distortion;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
