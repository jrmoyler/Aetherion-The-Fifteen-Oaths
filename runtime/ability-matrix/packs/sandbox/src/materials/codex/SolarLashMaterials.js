import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Solar Lash — the bespoke shaders the plasma whip is drawn with.
 *
 *  - **the lash** — a tube grid in parameter space (`createLashTubeGeometry`)
 *    bent along the whip's centreline in the vertex stage. The centreline is a
 *    straight run from the hand to the tip plus three offsets, each scaled by
 *    the whip's *slack*: a bow to one side (the sweep), an arch upward, and an
 *    S-wave travelling hand → tip. At the crack the slack goes to zero and the
 *    whip is a taut line; it overshoots, then the recoil gives slack back. The
 *    surface boils on noise. Shading is *inverted* fresnel: plasma is
 *    brightest where you look straight through the most of it, so the core is
 *    a white-hot wire and the silhouette an orange rim — the reverse of a
 *    solid. Plasma streams along it and bright surges run down to the tip.
 *  - **the heat haze** — the same tube, fattened, on `LAYER.DISTORTION`; and a
 *    camera-facing ribbon standing over the hot furrow.
 *  - **the furrow** — a ground strip down the line that only exists where the
 *    tip has passed. A molten channel down the middle; round it a crust broken
 *    into plates (F2−F1 cell edges) with lava seeping through the seams,
 *    fuller near the channel; round that a char of scorched floor. Its
 *    temperature is one number (`uHeat`, cooled on the CPU over the lifetime)
 *    plus a fresh-burn boost right behind the tip, and the colour is read off
 *    it: yellow-white → orange → dull red → black crust.
 *  - **the flare** — a camera-facing corona with rays, at the hand while the
 *    lash is out and at the tip on the crack.
 *  - **the boom ring** — a ring quad set across the whip's line at the tip,
 *    opening fast; and its twin on the distortion layer, so the crack visibly
 *    bends the air.
 *
 * Every material reads `settings.solarlash` in `userData.sync(state)`; `state`
 * carries only what the ability knows that the settings do not.
 */

const ID = 'solarlash';

/* -------------------------------------------------------------------- */
/* The centreline — shared by the lash and its haze                     */
/* -------------------------------------------------------------------- */

/**
 * `lashPoint(s)` is the whip's centreline at `s` (0 hand .. 1 tip), world
 * space. `SolarLashAbility#_lashPoint` is the CPU twin (it places the embers,
 * the light and the throw), so the two must change together.
 */
const LASH_GLSL = /* glsl */ `
  uniform vec3  uHand;
  uniform vec3  uTip;
  uniform vec3  uSide;
  uniform float uSlack;       // 1 loose .. 0 taut (negative while it overshoots)
  uniform float uArch;
  uniform float uSweep;       // signed metres the whip bows sideways
  uniform float uWaveAmp;
  uniform float uWaveLen;
  uniform float uWavePhase;   // integrated on the CPU
  uniform float uWaveLift;
  uniform float uRootR;
  uniform float uTipR;
  uniform float uTaper;

  vec3 lashPoint(float s) {
    vec3 p = mix(uHand, uTip, s);
    float L = distance(uHand, uTip);
    float env = smoothstep(0.0, 0.25, s) * (0.4 + 0.6 * s);
    float ph = 6.2831853 * s * L / max(uWaveLen, 0.1) - uWavePhase;
    float bow = sin(3.14159265 * s);
    p += uSide * (uWaveAmp * env * sin(ph) + uSweep * bow) * uSlack;
    p.y += (uArch * bow + uWaveLift * env * cos(ph)) * uSlack;
    return p;
  }

  float lashRadius(float s) {
    float r = mix(uRootR, uTipR, pow(clamp(s, 0.0, 1.0), max(uTaper, 0.05)));
    return r * (1.0 - 0.7 * smoothstep(0.97, 1.0, s));
  }
`;

const TUBE_VERTEX = /* glsl */ `
  uniform float uBoil;
  uniform float uBoilScale;
  uniform float uFlow;
  uniform float uSeed;
  uniform float uScale;       // radius multiplier (the haze is a fat lash)

  varying float vS;
  varying float vAng;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}
  ${LASH_GLSL}

  void main() {
    float s = position.x;
    float ang = position.y * 6.2831853;
    vec3 c = lashPoint(s);
    vec3 T = lashPoint(min(s + 0.01, 1.0)) - lashPoint(max(s - 0.01, 0.0));
    T = normalize(T + vec3(0.0, 0.0, 1e-5));
    vec3 ref = abs(T.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 N1 = normalize(cross(T, ref));
    vec3 B = cross(N1, T);
    vec3 radial = cos(ang) * N1 + sin(ang) * B;

    float L = distance(uHand, uTip);
    float boil = snoise(vec3(s * L * uBoilScale - uFlow * 0.6, cos(ang) * 0.8 + uSeed, sin(ang) * 0.8));
    float r = lashRadius(s) * uScale * (1.0 + uBoil * boil);
    vec3 world = c + radial * r;

    vS = s;
    vAng = ang;
    vNormalW = radial;
    vViewDir = cameraPosition - world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const LASH_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uSeed;
  uniform float uFlow;
  uniform float uFlowScale;
  uniform float uCoreGlow;
  uniform float uEdgeGlow;
  uniform float uCoreSharp;
  uniform float uPulse;       // integrated surge phase
  uniform float uPulseGlow;
  uniform float uTipHeat;
  uniform float uSoftFade;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uDissolve;    // 0 whole .. 1 burnt out (eats tip → hand)
  uniform float uDissolveEdge;
  uniform float uSnapFlash;   // 0..1 the whole lash flares at the crack
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorD;
  uniform vec3  uHand;
  uniform vec3  uTip;

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

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float facing = abs(dot(N, V));
    // Plasma is thickest where you look straight through it: the core.
    float core = pow(facing, max(uCoreSharp, 0.2));

    float L = distance(uHand, uTip);
    float d = vS * L;
    float n = fbm3(vec3(d * uFlowScale - uFlow, cos(vAng) * 0.7 + uSeed, sin(vAng) * 0.7));
    float surge = pow(0.5 + 0.5 * sin(6.2831853 * (d / 3.0 - uPulse)), 6.0) * smoothstep(0.05, 0.3, vS);

    float heat = core * 0.7 + (n * 0.5 + 0.5) * 0.35 * uShaderIntensity + vS * uTipHeat * 0.35 + surge * 0.25 + uSnapFlash * 0.4;
    vec3 col = gradient4(uColorA, uColorB, uColorC, uColorD, 1.0 - clamp(heat, 0.0, 1.0));
    float bright = uEdgeGlow * (1.0 - core) + uCoreGlow * core;
    bright *= (1.0 + surge * uPulseGlow) * (1.0 + uSnapFlash * 1.5) * (0.75 + 0.5 * (n * 0.5 + 0.5));

    // Burning out from the tip back, with a frayed white edge.
    float dn = snoise(vec3(d * 2.4, vAng, uSeed * 3.0)) * 0.5 + 0.5;
    float field = (1.0 - vS) * 0.75 + dn * 0.25;
    float thr = uDissolve * 1.1 - 0.05;
    float keep = uDissolve <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.02, field);
    float fray = uDissolve <= 0.0 ? 0.0 : (smoothstep(thr - 0.01, thr + 0.02, field) - smoothstep(thr + 0.02, thr + 0.02 + uDissolveEdge, field));

    float ends = smoothstep(0.0, 0.035, vS);
    float mask = ends * keep * uFade * uOpacity;
    if (mask < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (mask < 0.004) discard;

    vec3 color = col * bright + uColorA * fray * 4.0;
    gl_FragColor = vec4(color * uGlobalGlow, clamp(mask, 0.0, 1.0));
  }
`;

/** The shape uniforms shared by the lash and its haze. */
function lashShapeUniforms() {
  return {
    uHand: { value: new Vector3() },
    uTip: { value: new Vector3(0, 0, 1) },
    uSide: { value: new Vector3(1, 0, 0) },
    uSlack: { value: 1 },
    uArch: { value: 0.9 },
    uSweep: { value: 1.5 },
    uWaveAmp: { value: 0.5 },
    uWaveLen: { value: 3.4 },
    uWavePhase: { value: 0 },
    uWaveLift: { value: 0.2 },
    uRootR: { value: 0.08 },
    uTipR: { value: 0.016 },
    uTaper: { value: 1.15 },
    uBoil: { value: 0.3 },
    uBoilScale: { value: 2.4 },
    uFlow: { value: 0 },
    uSeed: { value: 0 },
    uScale: { value: 1 }
  };
}

/**
 * @param {object} u the material's uniforms
 * @param {object} state { hand, tip, side, slack, sweepSign, wavePhase, flow, seed }
 */
function syncLashShape(u, state) {
  const c = settings[ID];
  const g = settings.global;
  u.uHand.value.copy(state.hand);
  u.uTip.value.copy(state.tip);
  u.uSide.value.copy(state.side);
  u.uSlack.value = state.slack;
  u.uArch.value = c.arch;
  u.uSweep.value = c.sweep * state.sweepSign;
  u.uWaveAmp.value = c.waveAmp * g.noiseStrength;
  u.uWaveLen.value = c.waveLength;
  u.uWavePhase.value = state.wavePhase;
  u.uWaveLift.value = c.waveLift;
  u.uRootR.value = Math.max(0.002, c.rootRadius);
  u.uTipR.value = Math.max(0.001, c.tipRadius);
  u.uTaper.value = c.taper;
  u.uBoil.value = c.boil * g.noiseStrength;
  u.uBoilScale.value = c.boilScale * g.noiseFrequency;
  u.uFlow.value = state.flow;
  u.uSeed.value = state.seed;
}

/** The whip itself: additive plasma, a tube bent in the vertex stage. */
export function createLashMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...lashShapeUniforms(),
      uFlowScale: { value: 1.3 },
      uCoreGlow: { value: 6 },
      uEdgeGlow: { value: 2 },
      uCoreSharp: { value: 2.2 },
      uPulse: { value: 0 },
      uPulseGlow: { value: 2.4 },
      uTipHeat: { value: 0.6 },
      uSoftFade: { value: 0.25 },
      uOpacity: { value: 1 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uDissolveEdge: { value: 0.08 },
      uSnapFlash: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorD: { value: new Color() }
    }),
    vertexShader: TUBE_VERTEX,
    fragmentShader: LASH_FRAGMENT
  });

  /** @param {object} state the shape state plus { pulse, fade, dissolve, snapFlash } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncLashShape(u, state);
    u.uScale.value = 1;
    u.uFlowScale.value = c.flowScale * g.noiseFrequency;
    u.uCoreGlow.value = c.coreGlow * g.glow;
    u.uEdgeGlow.value = c.edgeGlow * g.glow;
    u.uCoreSharp.value = c.coreSharpness;
    u.uPulse.value = state.pulse;
    u.uPulseGlow.value = c.pulseGlow * g.shaderIntensity;
    u.uTipHeat.value = c.tipHeat;
    u.uSoftFade.value = c.softFade;
    u.uOpacity.value = c.opacity * g.opacity;
    u.uFade.value = state.fade;
    u.uDissolve.value = state.dissolve;
    u.uDissolveEdge.value = c.dissolveEdge;
    u.uSnapFlash.value = state.snapFlash;
    u.uColorA.value.copy(getColor(c.colorPlasmaA));
    u.uColorB.value.copy(getColor(c.colorPlasmaB));
    u.uColorC.value.copy(getColor(c.colorPlasmaC));
    u.uColorD.value.copy(getColor(c.colorPlasmaD));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* Heat haze — LAYER.DISTORTION                                         */
/* -------------------------------------------------------------------- */

const HAZE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uNoiseScale;
  uniform float uNoiseSpeed;
  uniform float uSeed;
  uniform float uDissolve;
  uniform float uShaderIntensity;

  varying float vS;
  varying float vAng;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    // Strongest through the middle of the fat tube, nothing at its silhouette.
    float through = pow(abs(dot(N, V)), 1.5);
    vec3 np = vec3(vS * 9.0 * uNoiseScale, vAng * 0.3 + uSeed, -uTime * uNoiseSpeed);
    // Hot air rises: the bend is biased upward on screen.
    vec2 n = vec2(snoise(np), snoise(np + vec3(17.1, 5.3, 9.7)) * 0.6 + 0.45);
    float mask = through * smoothstep(0.0, 0.08, vS) * (1.0 - smoothstep(0.85, 1.0, vS)) * (1.0 - uDissolve);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    vec2 offset = n;
    float len = length(offset);
    if (len > 1.0) offset /= len;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

/** The bend in the air round the lash. */
export function createLashHazeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...lashShapeUniforms(),
      uStrength: { value: 1 },
      uNoiseScale: { value: 2 },
      uNoiseSpeed: { value: 2.5 },
      uDissolve: { value: 0 }
    }),
    vertexShader: TUBE_VERTEX,
    fragmentShader: HAZE_FRAGMENT
  });

  /** @param {object} state the shape state plus { strength, dissolve } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncLashShape(u, state);
    u.uScale.value = Math.max(1, c.hazeWidth);
    u.uBoil.value = 0;
    u.uStrength.value = state.strength * c.hazeStrength * g.distortion;
    u.uNoiseScale.value = c.hazeScale * g.noiseFrequency;
    u.uNoiseSpeed.value = c.hazeSpeed * g.noiseSpeed;
    u.uDissolve.value = state.dissolve;
  };

  return material;
}

/**
 * The shimmer standing over the hot furrow: a strip down the line whose
 * cross-axis is turned to face the camera (perpendicular to both the line and
 * the view), so it never goes edge-on, lifted to stand over the floor.
 */
const RIBBON_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform float uLength;
  uniform float uHeight;

  varying vec2 vRib;          // x: metres along, y: -1..1 across

  void main() {
    float along = position.x * uLength;
    vec3 base = uStart + uDir * along;
    vec3 toCam = normalize(cameraPosition - base);
    vec3 axis = normalize(cross(uDir, toCam) + vec3(0.0, 1e-4, 0.0));
    vec3 world = base + axis * position.y * uHeight * 0.5;
    world.y += uHeight * 0.5;
    vRib = vec2(along, position.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RIBBON_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uNoiseScale;
  uniform float uNoiseSpeed;
  uniform float uSeed;
  uniform float uCutEnd;
  uniform float uShaderIntensity;

  varying vec2 vRib;

  ${noiseGLSL}

  void main() {
    if (vRib.x < 0.0 || vRib.x > uCutEnd) discard;
    vec3 np = vec3(vRib.x * uNoiseScale, vRib.y * 1.4 - uTime * uNoiseSpeed, uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(11.3, 3.1, 7.7)) * 0.5 + 0.5);
    float mask = (1.0 - smoothstep(0.35, 1.0, abs(vRib.y)))
               * smoothstep(0.0, 0.8, vRib.x)
               * (1.0 - smoothstep(uCutEnd - 0.6, uCutEnd, vRib.x));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(n * 0.5 + 0.5, strength, mask);
  }
`;

/** Shimmer over the furrow. */
export function createFurrowHazeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uLength: { value: 10 },
      uHeight: { value: 1 },
      uStrength: { value: 1 },
      uNoiseScale: { value: 2 },
      uNoiseSpeed: { value: 2 },
      uSeed: { value: 0 },
      uCutEnd: { value: 0 }
    }),
    vertexShader: RIBBON_VERTEX,
    fragmentShader: RIBBON_FRAGMENT
  });

  /** @param {object} state { start, dir, length, cutEnd, heat, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uLength.value = Math.max(0.1, state.length);
    u.uHeight.value = Math.max(0.05, c.hazeHeight);
    u.uStrength.value = c.furrowHaze * c.hazeStrength * g.distortion * state.heat;
    u.uNoiseScale.value = c.hazeScale * g.noiseFrequency;
    u.uNoiseSpeed.value = c.hazeSpeed * g.noiseSpeed;
    u.uSeed.value = state.seed;
    u.uCutEnd.value = state.cutEnd;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The molten furrow                                                    */
/* -------------------------------------------------------------------- */

/**
 * The strip geometry laid on the floor down the line from uniforms:
 * `position.x` 0..1 along, `position.y` -1..1 across.
 */
const FURROW_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uHalfWidth;
  uniform float uLift;

  varying vec2 vFlat;         // x: metres across, y: metres along

  void main() {
    float across = position.y * uHalfWidth;
    float along = position.x * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = uLift;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FURROW_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uCutEnd;      // metres of furrow that exist so far
  uniform float uTipAt;       // where the tip is now, metres along
  uniform float uHeat;        // 0 cold .. 1 white-hot, cooled on the CPU
  uniform float uFresh;
  uniform float uChannel;
  uniform float uCrust;
  uniform float uChar;
  uniform float uCrackScale;
  uniform float uCrackWidth;
  uniform float uSeep;        // integrated seep phase
  uniform float uGlow;
  uniform float uWiggle;
  uniform float uWiggleScale;
  uniform float uCrustOpacity;
  uniform float uCharOpacity;
  uniform float uErode;
  uniform float uFadeT;
  uniform float uOpacity;
  uniform vec3  uLavaA;
  uniform vec3  uLavaB;
  uniform vec3  uLavaC;
  uniform vec3  uColorCrust;
  uniform vec3  uColorChar;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  /** Cell edges: x = F2 − F1 (0 on a seam), y = the cell's own random. */
  vec2 plates(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    float id = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 cell = n + g;
        vec2 o = vec2(hash13(vec3(cell, 1.7)), hash13(vec3(cell, 9.2)));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = hash13(vec3(cell, 4.1));
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
    return vec2(sqrt(d2) - sqrt(d1), id);
  }

  void main() {
    float x = vFlat.x;
    float along = vFlat.y;
    if (along < 0.0 || along > uCutEnd) discard;

    // The lash does not rule a line: the furrow wanders.
    float wig = snoise(vec3(along * uWiggleScale, uSeed, 0.0)) * uWiggle;
    float dx = x - wig;
    float ad = abs(dx);

    // Opens over the first metre, narrows where it is still being burnt.
    float open = smoothstep(0.0, 0.8, along) * mix(0.35, 1.0, smoothstep(0.0, 0.8, uCutEnd - along));
    float en = fbm3(vec3(x * 1.7, along * 0.9, uSeed)) * 0.5;

    float charM = (1.0 - smoothstep(uChar * 0.4, uChar, ad + en * 0.4 * uChar)) * open;
    float crustM = (1.0 - smoothstep(uCrust * 0.7, uCrust, ad + en * 0.3 * uCrust)) * open;
    float chW = max(uChannel * open, 0.005);
    float chan = 1.0 - smoothstep(chW * 0.35, chW, ad + en * 0.06);

    // Temperature: one number, plus the fresh burn right behind the tip.
    float behind = max(uTipAt - along, 0.0);
    float fresh = exp(-behind / max(uFresh, 0.05));
    float T = clamp(uHeat * (0.62 + 0.38 * fresh), 0.0, 1.0);

    // The crust: plates, and lava seeping up through the seams between them.
    vec2 pl = plates(vec2(dx, along) * uCrackScale + uSeed * 3.1);
    float seam = 1.0 - smoothstep(0.0, max(uCrackWidth * uCrackScale, 0.01), pl.x);
    float seepN = snoise(vec3(dx * 3.0, along * 1.6 - uSeep, uSeed * 2.0)) * 0.5 + 0.5;
    float nearChannel = 1.0 - smoothstep(chW, uCrust, ad);
    float seep = seam * crustM * smoothstep(0.25, 0.85, seepN * 0.55 + nearChannel * 0.65);

    float Tl = T * max(chan, seep * 0.8);
    vec3 lava = mix(uLavaC, uLavaB, smoothstep(0.12, 0.55, Tl));
    lava = mix(lava, uLavaA, smoothstep(0.55, 0.95, Tl));
    float lit = max(chan, seep);
    vec3 hot = lava * uGlow * (0.15 + 1.2 * Tl) * uGlobalGlow;

    // Plates darken as they cool; a warm bloom round each seam while hot.
    vec3 crust = uColorCrust * (0.65 + 0.6 * pl.y);
    crust += uLavaC * T * 0.6 * (1.0 - smoothstep(0.0, 0.35, pl.x)) * crustM;
    vec3 col = mix(uColorChar, crust, crustM);
    col = mix(col, hot, lit * smoothstep(0.0, 0.08, T + 0.02));

    float a = max(charM * uCharOpacity, crustM * uCrustOpacity);
    a = max(a, lit);

    // Erodes raggedly as the cast fades.
    float n = snoise(vec3(x * 3.0, along * 1.1, uSeed * 5.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(0.55, n, uErode));

    a *= vis * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The burning furrow. Normal blending: the crust has to be *dark*; the lava is HDR. */
export function createFurrowMaterial() {
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
      uHalfWidth: { value: 1.5 },
      uLift: { value: 0.014 },
      uSeed: { value: 0 },
      uCutEnd: { value: 0 },
      uTipAt: { value: 0 },
      uHeat: { value: 1 },
      uFresh: { value: 3 },
      uChannel: { value: 0.16 },
      uCrust: { value: 0.6 },
      uChar: { value: 1.1 },
      uCrackScale: { value: 3 },
      uCrackWidth: { value: 0.07 },
      uSeep: { value: 0 },
      uGlow: { value: 3.5 },
      uWiggle: { value: 0.14 },
      uWiggleScale: { value: 0.35 },
      uCrustOpacity: { value: 0.92 },
      uCharOpacity: { value: 0.55 },
      uErode: { value: 0.7 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uLavaA: { value: new Color() },
      uLavaB: { value: new Color() },
      uLavaC: { value: new Color() },
      uColorCrust: { value: new Color() },
      uColorChar: { value: new Color() }
    }),
    vertexShader: FURROW_VERTEX,
    fragmentShader: FURROW_FRAGMENT
  });

  /** @param {object} state { start, dir, side, length, cutEnd, tipAt, heat, seep, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.1, state.length);
    u.uHalfWidth.value = Math.max(c.furrowChar, c.furrowCrust, c.furrowWidth) + c.furrowWiggle + 0.3;
    u.uSeed.value = state.seed;
    u.uCutEnd.value = state.cutEnd;
    u.uTipAt.value = state.tipAt;
    u.uHeat.value = state.heat;
    u.uFresh.value = c.freshLength;
    u.uChannel.value = c.furrowWidth;
    u.uCrust.value = Math.max(c.furrowCrust, c.furrowWidth + 0.01);
    u.uChar.value = Math.max(c.furrowChar, 0.02);
    u.uCrackScale.value = c.crackScale * g.noiseFrequency;
    u.uCrackWidth.value = c.crackWidth;
    u.uSeep.value = state.seep;
    u.uGlow.value = c.furrowGlow * g.glow;
    u.uWiggle.value = c.furrowWiggle * g.noiseStrength * g.randomness;
    u.uWiggleScale.value = c.furrowWiggleScale * g.noiseFrequency;
    u.uCrustOpacity.value = c.crustOpacity;
    u.uCharOpacity.value = c.charOpacity;
    u.uErode.value = c.furrowErode;
    u.uFadeT.value = state.fadeT;
    u.uOpacity.value = g.opacity;
    u.uLavaA.value.copy(getColor(c.colorLavaA));
    u.uLavaB.value.copy(getColor(c.colorLavaB));
    u.uLavaC.value.copy(getColor(c.colorLavaC));
    u.uColorCrust.value.copy(getColor(c.colorCrust));
    u.uColorChar.value.copy(getColor(c.colorChar));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The flare — hand and crack                                           */
/* -------------------------------------------------------------------- */

const BILLBOARD_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;

  varying vec2  vUv;
  varying float vViewZ;

  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = uCenter + (right * position.x + up * position.y) * uSize;
    vUv = position.xy;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FLARE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  uniform float uRays;
  uniform vec3  uColorCore;
  uniform vec3  uColorHalo;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0 || uIntensity <= 0.001) discard;
    float a = atan(vUv.y, vUv.x);
    float core = exp(-r * r * 22.0);
    float halo = exp(-r * 3.2) * (1.0 - smoothstep(0.6, 1.0, r));
    // A corona of rays that flicker on noise, slowly turning.
    float spin = uTime * 0.6 + uSeed;
    float rays = pow(abs(cos(a * max(uRays, 1.0) * 0.5 + spin)), 18.0);
    rays *= (0.5 + 0.5 * snoise(vec3(a * 2.0, uTime * 3.0, uSeed))) * exp(-r * 2.4);
    float tongues = smoothstep(0.2, 0.9, snoise(vec3(cos(a) * 2.0, sin(a) * 2.0, uTime * 2.2 - r * 3.0 + uSeed))) * exp(-r * 4.0);
    vec3 col = uColorHalo * (halo * 0.9 + rays * 1.4 + tongues * 0.8) + uColorCore * core * 2.0;
    float mask = clamp(halo + rays + core, 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, r));
    gl_FragColor = vec4(col * uIntensity * uGlobalGlow, mask);
  }
`;

/** A corona: the fist that holds the lash, and the crack at its tip. */
export function createFlareMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 0.7 },
      uSeed: { value: 0 },
      uIntensity: { value: 0 },
      uRays: { value: 7 },
      uColorCore: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: FLARE_FRAGMENT
  });

  /** @param {object} state { center, size, intensity, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.01, state.size);
    u.uIntensity.value = state.intensity * c.flareGlow * g.glow;
    u.uRays.value = Math.round(c.flareRays);
    u.uSeed.value = state.seed;
    u.uColorCore.value.copy(getColor(c.colorFlareCore));
    u.uColorHalo.value.copy(getColor(c.colorFlareHalo));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The sonic-boom ring                                                  */
/* -------------------------------------------------------------------- */

/** A quad spanned by two world axes — the ring stands across the whip's line. */
const RING_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform vec3  uAxisU;
  uniform vec3  uAxisV;
  uniform float uSize;

  varying vec2 vUv;

  void main() {
    vec3 world = uCenter + (uAxisU * position.x + uAxisV * position.y) * uSize;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RING_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uProgress;    // 0..1 the ring opening
  uniform float uWidth;
  uniform float uIntensity;
  uniform vec3  uColor;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float a = atan(vUv.y, vUv.x);
    float R = 0.08 + 0.9 * uProgress;
    float w = max(uWidth, 0.005) * (0.6 + 0.8 * uProgress);
    float d = (r - R) / w;
    float ring = exp(-d * d * 2.0);
    // A second, fainter shell trailing inside the first — the double crack.
    float d2 = (r - R * 0.72) / (w * 0.7);
    float ring2 = exp(-d2 * d2 * 2.0) * 0.45;
    float breakup = 0.55 + 0.45 * snoise(vec3(cos(a) * 3.0, sin(a) * 3.0, uSeed + uProgress * 2.0));
    float fade = (1.0 - uProgress) * (1.0 - uProgress);
    float m = (ring + ring2) * breakup * fade * uIntensity;
    if (m < 0.004) discard;
    gl_FragColor = vec4(uColor * m * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

/** The visible sonic boom. */
export function createBoomRingMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uAxisU: { value: new Vector3(1, 0, 0) },
      uAxisV: { value: new Vector3(0, 1, 0) },
      uSize: { value: 2 },
      uSeed: { value: 0 },
      uProgress: { value: 0 },
      uWidth: { value: 0.07 },
      uIntensity: { value: 1 },
      uColor: { value: new Color() }
    }),
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT
  });

  /** @param {object} state { center, axisU, axisV, progress, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uAxisU.value.copy(state.axisU);
    u.uAxisV.value.copy(state.axisV);
    u.uSize.value = Math.max(0.05, c.ringSize * g.explosionIntensity);
    u.uProgress.value = state.progress;
    u.uWidth.value = c.ringWidth;
    u.uIntensity.value = c.ringGlow * g.glow * g.opacity;
    u.uSeed.value = state.seed;
    u.uColor.value.copy(getColor(c.colorRing));
  };

  return material;
}

const BOOM_WARP_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uWidth;
  uniform float uStrength;
  uniform float uShaderIntensity;

  varying vec2 vUv;

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float R = 0.08 + 0.9 * uProgress;
    float w = max(uWidth, 0.005) * 3.0;
    float d = (r - R) / w;
    // The derivative of a bump: pushed out ahead of the shell, pulled in behind.
    float slope = -d * exp(-d * d);
    vec2 dir = vUv / max(r, 1e-4);
    float mask = exp(-d * d) * (1.0 - uProgress);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * clamp(slope * 2.0, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** The boom's bend in the air — LAYER.DISTORTION, the ring's twin. */
export function createBoomWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uAxisU: { value: new Vector3(1, 0, 0) },
      uAxisV: { value: new Vector3(0, 1, 0) },
      uSize: { value: 2 },
      uProgress: { value: 0 },
      uWidth: { value: 0.07 },
      uStrength: { value: 1 }
    }),
    vertexShader: RING_VERTEX,
    fragmentShader: BOOM_WARP_FRAGMENT
  });

  /** @param {object} state { center, axisU, axisV, progress } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uAxisU.value.copy(state.axisU);
    u.uAxisV.value.copy(state.axisV);
    u.uSize.value = Math.max(0.05, c.ringSize * g.explosionIntensity * 1.15);
    u.uProgress.value = state.progress;
    u.uWidth.value = c.ringWidth;
    u.uStrength.value = c.ringWarp * g.distortion;
  };

  return material;
}
