import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Bile Lance — the bespoke shaders the drill is drawn with.
 *
 *  - **the lance** — a tube grid bent in the vertex stage into a long spike:
 *    a belly a quarter of the way back, a needle nose, a tail that pinches to
 *    a drip. Helical *flutes* are cut into it (the radius is modulated by
 *    `sin(angle·flutes + s·twist − spin)`), and because the spin is a uniform
 *    the grooves visibly corkscrew backward: that is what makes it read as a
 *    drill rather than a dart. Shading is viscous bile — a murk streaming
 *    tail-ward, a bright acid rim, light running down the troughs of the
 *    flutes, a wet highlight and a white-hot point.
 *  - **the haze** — the same tube, fattened, on `LAYER.DISTORTION`.
 *  - **the helix ribbons** — two thin tubes wound round the line as a
 *    corkscrew that is fixed *in the world* (its angle is a function of
 *    metres down the line, not of time): the lance screws through it and
 *    leaves it behind like the thread a tap cuts.
 *  - **the wake rings** — one draw call of quads standing across the line,
 *    each opening with three spiral arms; centres and ages come out of
 *    uniform arrays indexed by a per-vertex slot.
 *  - **the trench** — a strip on the floor down the line, existing only
 *    behind the nose: a wet channel of live acid with bubbles swelling and
 *    popping, a bright seam at its lip, etched and pitted stone round it.
 *  - **the bore** — a floor quad at the end of the line: a drain of acid
 *    spiralling into a black hole with a glowing lip.
 *  - **the geyser** — the eruption's mass. The tube grid again, stood on
 *    end over the bore and bent in the vertex stage into a column of bile
 *    with a flared foot and a swollen, mushrooming head: it bursts up, boils
 *    (crawling lobes, a sway), then its head droops and the column slumps
 *    into a heap that keeps bubbling — voronoi domes that swell, pop and
 *    flash — and sinks back into the hole. Lit and normal-blended so the deep
 *    stop can be near-black: deep bile in the shadowed folds, olive body,
 *    lime rim and veins, a white-hot throat only while it is still rising.
 *
 * Every material reads `settings.bilelance` in `userData.sync(state)`;
 * `state` carries only what the ability knows that the settings do not.
 */

const ID = 'bilelance';
export const MAX_WAKE_RINGS = 16;

/* -------------------------------------------------------------------- */
/* The lance                                                            */
/* -------------------------------------------------------------------- */

const LANCE_VERTEX = /* glsl */ `
  uniform vec3  uNose;
  uniform vec3  uAxis;        // unit, nose-ward
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uRadius;
  uniform float uBelly;
  uniform float uFlutes;
  uniform float uFluteDepth;
  uniform float uTwist;
  uniform float uSpin;        // integrated on the CPU
  uniform float uWobble;
  uniform float uWobbleScale;
  uniform float uGrow;        // 0..1 swelling out of the hand
  uniform float uScale;       // the haze is a fat lance
  uniform float uSeed;
  uniform float uTime;

  varying float vS;
  varying float vAng;
  varying float vGroove;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}

  float profile(float s) {
    // A spike: swells to its belly, needles to the nose, pinches to a drip.
    float b = clamp(uBelly, 0.05, 0.9);
    float rise = pow(smoothstep(0.0, b, s), 0.55);
    float fall = pow(clamp((1.0 - s) / (1.0 - b), 0.0, 1.0), 1.1);
    return rise * fall;
  }

  float fluteMask(float s) {
    return smoothstep(0.04, 0.25, s) * (1.0 - smoothstep(0.88, 1.0, s));
  }

  void main() {
    float s = position.x;
    float ang = position.y * 6.2831853;
    vec3 up = normalize(cross(uSide, uAxis));
    vec3 radial = cos(ang) * uSide + sin(ang) * up;
    vec3 tang = -sin(ang) * uSide + cos(ang) * up;

    float L = uLength * uGrow;
    float phi = ang * uFlutes + s * uTwist * 6.2831853 - uSpin;
    float fm = fluteMask(s);
    float groove = sin(phi) * fm;
    float wob = snoise(vec3(s * L * uWobbleScale - uTime * 1.3, cos(ang) + uSeed, sin(ang)));
    float base = uRadius * uGrow * uScale;
    float r = base * profile(s) * (1.0 + uFluteDepth * groove) * (1.0 + uWobble * wob);

    vec3 c = uNose - uAxis * (1.0 - s) * L;
    vec3 world = c + radial * r;

    // Normal: the radial, tipped back by the profile's slope and sideways by the flute's.
    float e = 0.01;
    float dr = (profile(min(s + e, 1.0)) - profile(max(s - e, 0.0))) / (2.0 * e) * base / max(L, 0.05);
    float dflute = uFluteDepth * cos(phi) * fm * uFlutes;
    vec3 n = radial - uAxis * dr - tang * dflute * 0.5;

    vS = s;
    vAng = ang;
    vGroove = groove;
    vNormalW = normalize(n);
    vViewDir = cameraPosition - world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const LANCE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uSeed;
  uniform float uFlow;
  uniform float uFlowScale;
  uniform float uLength;
  uniform float uGrow;
  uniform float uOpacity;
  uniform float uRimGlow;
  uniform float uGrooveGlow;
  uniform float uTipGlow;
  uniform float uSoftFade;
  uniform float uFade;
  uniform float uSink;        // 0..1 how far it has bored into the floor
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorD;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform vec3      uLightDir;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying float vS;
  varying float vAng;
  varying float vGroove;
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

    float d = vS * uLength * uGrow;
    float flow = fbm3(vec3(d * uFlowScale + uFlow, cos(vAng) * 0.8 + uSeed, sin(vAng) * 0.8));
    vec3 murk = mix(uColorD, uColorC, smoothstep(-0.45, 0.55, flow * uShaderIntensity));

    // Light runs down the troughs of the flutes, in beads.
    float trough = smoothstep(0.15, -0.85, vGroove);
    float beads = 0.55 + 0.45 * sin(d * 7.0 + uFlow * 5.0 + vAng);
    float tip = pow(smoothstep(0.78, 1.0, vS), 2.0);

    vec3 R = reflect(-V, N);
    float spec = pow(max(dot(R, normalize(uLightDir)), 0.0), 48.0);

    vec3 col = murk;
    col += uColorB * (fres * uRimGlow + trough * beads * uGrooveGlow * 0.5);
    col += uColorA * (tip * uTipGlow + spec * 1.6);

    float alpha = mix(uOpacity, 1.0, fres) * smoothstep(0.0, 0.04, vS) * uFade;
    alpha = max(alpha, tip * uFade);
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade + uSink * 0.3);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

function lanceUniforms() {
  return {
    uNose: { value: new Vector3() },
    uAxis: { value: new Vector3(0, 0, 1) },
    uSide: { value: new Vector3(1, 0, 0) },
    uLength: { value: 2.6 },
    uRadius: { value: 0.24 },
    uBelly: { value: 0.24 },
    uFlutes: { value: 4 },
    uFluteDepth: { value: 0.28 },
    uTwist: { value: 2.2 },
    uSpin: { value: 0 },
    uWobble: { value: 0.12 },
    uWobbleScale: { value: 2.2 },
    uGrow: { value: 1 },
    uScale: { value: 1 },
    uSeed: { value: 0 }
  };
}

/** @param {object} state { nose, axis, side, spin, grow, seed } */
function syncLanceShape(u, state) {
  const c = settings[ID];
  const g = settings.global;
  u.uNose.value.copy(state.nose);
  u.uAxis.value.copy(state.axis);
  u.uSide.value.copy(state.side);
  u.uLength.value = Math.max(0.1, c.lanceLength);
  u.uRadius.value = Math.max(0.01, c.lanceRadius);
  u.uBelly.value = c.bellyAt;
  u.uFlutes.value = Math.max(1, Math.round(c.flutes));
  u.uFluteDepth.value = c.fluteDepth;
  u.uTwist.value = c.twist;
  u.uSpin.value = state.spin;
  u.uWobble.value = c.wobble * g.noiseStrength;
  u.uWobbleScale.value = c.wobbleScale * g.noiseFrequency;
  u.uGrow.value = state.grow;
  u.uSeed.value = state.seed;
}

/** The drill itself: viscous bile, normal-blended so the murk can be dark. */
export function createLanceMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...lanceUniforms(),
      uFlow: { value: 0 },
      uFlowScale: { value: 1.6 },
      uOpacity: { value: 0.86 },
      uRimGlow: { value: 3 },
      uGrooveGlow: { value: 4 },
      uTipGlow: { value: 6 },
      uSoftFade: { value: 0.2 },
      uFade: { value: 1 },
      uSink: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorD: { value: new Color() }
    }),
    vertexShader: LANCE_VERTEX,
    fragmentShader: LANCE_FRAGMENT
  });

  /** @param {object} state shape state plus { flow, fade, sink } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncLanceShape(u, state);
    u.uScale.value = 1;
    u.uFlow.value = state.flow;
    u.uFlowScale.value = c.flowScale * g.noiseFrequency;
    u.uOpacity.value = c.bodyOpacity * g.opacity;
    u.uRimGlow.value = c.rimGlow * g.glow * g.fresnel;
    u.uGrooveGlow.value = c.grooveGlow * g.glow;
    u.uTipGlow.value = c.tipGlow * g.glow;
    u.uSoftFade.value = c.softFade;
    u.uFade.value = state.fade;
    u.uSink.value = state.sink;
    u.uColorA.value.copy(getColor(c.colorBileA));
    u.uColorB.value.copy(getColor(c.colorBileB));
    u.uColorC.value.copy(getColor(c.colorBileC));
    u.uColorD.value.copy(getColor(c.colorBileD));
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

  varying float vS;
  varying float vAng;
  varying float vGroove;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float through = pow(abs(dot(normalize(vNormalW), normalize(vViewDir))), 1.5);
    vec3 np = vec3(vS * 6.0 * uNoiseScale + uTime * uNoiseSpeed, vAng * 0.5 + uSeed, uTime * 0.7);
    vec2 n = vec2(snoise(np), snoise(np + vec3(13.1, 7.3, 2.9)));
    float mask = through * smoothstep(0.0, 0.2, vS) * (1.0 - smoothstep(0.9, 1.0, vS));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    float len = length(n);
    if (len > 1.0) n /= len;
    gl_FragColor = vec4(n * 0.5 + 0.5, strength, mask);
  }
`;

/** The bend in the air round the drill — LAYER.DISTORTION. */
export function createLanceHazeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...lanceUniforms(),
      uStrength: { value: 1 },
      uNoiseScale: { value: 2 },
      uNoiseSpeed: { value: 3 }
    }),
    vertexShader: LANCE_VERTEX,
    fragmentShader: HAZE_FRAGMENT
  });

  /** @param {object} state shape state plus { fade } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncLanceShape(u, state);
    u.uScale.value = Math.max(1, c.hazeWidth);
    u.uFluteDepth.value = 0;
    u.uStrength.value = c.hazeStrength * g.distortion * state.fade;
    u.uNoiseScale.value = c.hazeScale * g.noiseFrequency;
    u.uNoiseSpeed.value = c.hazeSpeed * g.noiseSpeed;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The helix ribbons                                                    */
/* -------------------------------------------------------------------- */

const RIBBON_VERTEX = /* glsl */ `
  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uHeight;
  uniform float uFront;       // metres down the line the nose is
  uniform float uTailGap;     // metres behind the nose the ribbon starts
  uniform float uStartAlong;  // nothing exists before this
  uniform float uRibbonLen;
  uniform float uHelixR;
  uniform float uHelixFlare;
  uniform float uPitch;
  uniform float uThick;
  uniform float uPhase;       // 0 or π: which of the two strands
  uniform float uGrow;

  varying float vS;
  varying float vAlong;
  varying float vValid;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  vec3 helix(float s) {
    float back = (1.0 - s) * uRibbonLen;
    float along = uFront - uTailGap - back;
    float rr = mix(uHelixR, uHelixFlare, pow(1.0 - s, 0.8)) * uGrow;
    // Fixed in the world: the angle is a function of metres down the line.
    float th = along * 6.2831853 / max(uPitch, 0.05) + uPhase;
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 p = uOrigin + uDir * along + up * uHeight;
    return p + (cos(th) * uSide + sin(th) * up) * rr;
  }

  void main() {
    float s = position.x;
    float ang = position.y * 6.2831853;
    vec3 c = helix(s);
    vec3 T = normalize(helix(min(s + 0.004, 1.0)) - helix(max(s - 0.004, 0.0)) + vec3(1e-5));
    vec3 ref = abs(T.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 N1 = normalize(cross(T, ref));
    vec3 B = cross(N1, T);
    vec3 radial = cos(ang) * N1 + sin(ang) * B;
    float back = (1.0 - s) * uRibbonLen;
    float along = uFront - uTailGap - back;
    float r = uThick * (0.35 + 0.65 * s) * uGrow;
    vec3 world = c + radial * r;
    vS = s;
    vAlong = along;
    vValid = step(uStartAlong, along);
    vNormalW = radial;
    vViewDir = cameraPosition - world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RIBBON_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform float uFade;
  uniform vec3  uColor;
  uniform float uGlobalGlow;

  varying float vS;
  varying float vAlong;
  varying float vValid;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  void main() {
    if (vValid < 0.5) discard;
    float core = pow(abs(dot(normalize(vNormalW), normalize(vViewDir))), 1.5);
    float beads = 0.55 + 0.45 * sin(vAlong * 9.0 - uTime * 14.0);
    float m = pow(vS, 1.6) * uFade * (0.35 + 0.65 * core) * beads;
    if (m < 0.004) discard;
    gl_FragColor = vec4(uColor * uGlow * m * uGlobalGlow, m);
  }
`;

/** One strand of the corkscrew — additive, fixed in the world. */
export function createRibbonMaterial(phase) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uOrigin: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uHeight: { value: 1.2 },
      uFront: { value: 0 },
      uTailGap: { value: 1 },
      uStartAlong: { value: 0 },
      uRibbonLen: { value: 5 },
      uHelixR: { value: 0.4 },
      uHelixFlare: { value: 0.7 },
      uPitch: { value: 1.5 },
      uThick: { value: 0.035 },
      uPhase: { value: phase },
      uGrow: { value: 1 },
      uGlow: { value: 3 },
      uFade: { value: 1 },
      uColor: { value: new Color() }
    }),
    vertexShader: RIBBON_VERTEX,
    fragmentShader: RIBBON_FRAGMENT
  });

  /** @param {object} state { origin, dir, side, front, tailGap, startAlong, grow, fade } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uOrigin.value.copy(state.origin);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uHeight.value = c.flightHeight;
    u.uFront.value = state.front;
    u.uTailGap.value = state.tailGap;
    u.uStartAlong.value = state.startAlong;
    u.uRibbonLen.value = Math.max(0.2, c.ribbonLength);
    u.uHelixR.value = c.ribbonRadius;
    u.uHelixFlare.value = c.ribbonFlare;
    u.uPitch.value = c.ribbonPitch;
    u.uThick.value = Math.max(0.003, c.ribbonThickness);
    u.uGrow.value = state.grow;
    u.uGlow.value = c.ribbonGlow * g.glow;
    u.uFade.value = state.fade * g.opacity;
    u.uColor.value.copy(getColor(c.colorRibbon));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The wake rings                                                       */
/* -------------------------------------------------------------------- */

const WAKE_VERTEX = /* glsl */ `
  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uHeight;
  uniform float uAlong[${MAX_WAKE_RINGS}];
  uniform float uAge[${MAX_WAKE_RINGS}];
  uniform float uLife;
  uniform float uStartR;
  uniform float uEndR;

  attribute float aSlot;

  varying vec2  vUv;
  varying float vP;
  varying float vSlot;

  void main() {
    int i = int(aSlot + 0.5);
    float age = uAge[i];
    float p = clamp(age / max(uLife, 0.01), 0.0, 1.0);
    float live = step(0.0, age) * step(p, 0.999);
    float k = 1.0 - pow(1.0 - p, 3.0);
    float R = mix(uStartR, uEndR, k) * live;
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 centre = uOrigin + uDir * uAlong[i] + up * uHeight;
    vec3 world = centre + (uSide * position.x + up * position.y) * R * 1.2;
    vUv = position.xy * 1.2;
    vP = p;
    vSlot = aSlot;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const WAKE_FRAGMENT = /* glsl */ `
  uniform float uWidth;
  uniform float uGlow;
  uniform float uArms;
  uniform float uSeed;
  uniform vec3  uColor;
  uniform float uGlobalGlow;

  varying vec2  vUv;
  varying float vP;
  varying float vSlot;

  void main() {
    float r = length(vUv);
    if (r > 1.2) discard;
    float a = atan(vUv.y, vUv.x);
    float d = (r - 1.0) / max(uWidth, 0.01);
    float ring = exp(-d * d * 2.0);
    // Corkscrew arms twist through the ring as it opens.
    float arms = pow(0.5 + 0.5 * sin(a * uArms + r * 5.0 - vP * 9.0 + vSlot * 1.7 + uSeed), 3.0);
    float inner = exp(-pow((r - 0.7) / (uWidth * 2.5), 2.0)) * 0.35 * arms;
    float fade = (1.0 - vP) * (1.0 - vP);
    float m = (ring * (0.3 + 0.7 * arms) + inner) * fade;
    if (m < 0.004) discard;
    gl_FragColor = vec4(uColor * uGlow * m * uGlobalGlow, m);
  }
`;

/** The corkscrew wake — one draw for every ring. */
export function createWakeRingsMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uOrigin: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uHeight: { value: 1.2 },
      uAlong: { value: new Float32Array(MAX_WAKE_RINGS) },
      uAge: { value: new Float32Array(MAX_WAKE_RINGS).fill(-1) },
      uLife: { value: 0.5 },
      uStartR: { value: 0.3 },
      uEndR: { value: 1.2 },
      uWidth: { value: 0.09 },
      uGlow: { value: 2.5 },
      uArms: { value: 3 },
      uSeed: { value: 0 },
      uColor: { value: new Color() }
    }),
    vertexShader: WAKE_VERTEX,
    fragmentShader: WAKE_FRAGMENT
  });

  /** @param {object} state { origin, dir, side, along: Float32Array, age: Float32Array, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uOrigin.value.copy(state.origin);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uHeight.value = c.flightHeight;
    u.uAlong.value.set(state.along);
    u.uAge.value.set(state.age);
    u.uLife.value = Math.max(0.05, c.ringLife * g.lifetime);
    u.uStartR.value = c.lanceRadius;
    u.uEndR.value = Math.max(c.lanceRadius, c.ringSize);
    u.uWidth.value = c.ringWidth;
    u.uGlow.value = c.ringGlow * g.glow * g.opacity;
    u.uArms.value = Math.max(1, Math.round(c.ringArms));
    u.uSeed.value = state.seed;
    u.uColor.value.copy(getColor(c.colorRing));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The trench                                                           */
/* -------------------------------------------------------------------- */

const TRENCH_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uHalfWidth;

  varying vec2 vFlat;

  void main() {
    float across = position.y * uHalfWidth;
    float along = position.x * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = 0.016;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const TRENCH_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uCutEnd;
  uniform float uTipAt;
  uniform float uLive;        // 1 eating .. 0 spent, on the CPU
  uniform float uFresh;
  uniform float uChannel;
  uniform float uEaten;
  uniform float uGlow;
  uniform float uBubbleScale;
  uniform float uBubbleRate;
  uniform float uWander;
  uniform float uErode;
  uniform float uFadeT;
  uniform float uOpacity;
  uniform vec3  uColorAcid;
  uniform vec3  uColorWet;
  uniform vec3  uColorEtched;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    float x = vFlat.x;
    float along = vFlat.y;
    if (along < 0.0 || along > uCutEnd) discard;

    float wig = snoise(vec3(along * 0.35, uSeed, 0.0)) * uWander;
    float ad = abs(x - wig);
    float open = smoothstep(0.0, 0.6, along) * mix(0.4, 1.0, smoothstep(0.0, 0.7, uCutEnd - along));
    float en = fbm3(vec3(x * 2.1, along * 1.3, uSeed));

    float w = max(uChannel * open, 0.01);
    float chan = 1.0 - smoothstep(w * 0.55, w, ad + en * 0.05);
    float etched = (1.0 - smoothstep(uEaten * 0.45, uEaten, ad + en * 0.35 * uEaten)) * open;
    float seam = exp(-pow((ad - w * 0.8) / 0.035, 2.0)) * etched;

    float behind = max(uTipAt - along, 0.0);
    float fresh = exp(-behind / max(uFresh, 0.05));
    float heat = uLive * (0.35 + 0.65 * fresh);

    // Bubbles: each voronoi cell swells a film and pops it, on its own clock.
    vec2 v = voronoi2(vec2(x - wig, along) * uBubbleScale + uSeed);
    float ph = fract(uTime * uBubbleRate * (0.6 + v.y) + v.y * 7.0);
    float br = 0.42 * ph;
    float film = exp(-pow((v.x - br) / 0.05, 2.0)) * (1.0 - ph) + (1.0 - smoothstep(0.0, br, v.x)) * 0.25 * ph;
    float bubbles = film * chan * heat;

    float flowN = snoise(vec3((x - wig) * 4.0, along * 1.6 - uTime * 1.4, uSeed)) * 0.5 + 0.5;
    float pits = smoothstep(0.35, 0.7, fbm3(vec3(x * 5.0, along * 5.0, uSeed * 2.0) ));

    vec3 col = uColorEtched * (1.0 - 0.45 * pits);
    col = mix(col, uColorWet * (0.7 + 0.5 * flowN), chan);
    // Lime only in the seams and the popping films; the channel itself is dark wet bile.
    vec3 glow = uColorAcid * uGlow * uGlobalGlow * (chan * (0.03 + 0.1 * flowN) * heat + bubbles * 0.8 + seam * heat * 0.9);
    col += glow;

    float a = max(etched * 0.86, chan);
    float n = snoise(vec3(x * 3.0, along * 1.2, uSeed * 5.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(0.55, n, uErode));
    a *= vis * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The eaten channel down the line. */
export function createTrenchMaterial() {
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
      uHalfWidth: { value: 1 },
      uSeed: { value: 0 },
      uCutEnd: { value: 0 },
      uTipAt: { value: 0 },
      uLive: { value: 1 },
      uFresh: { value: 3 },
      uChannel: { value: 0.3 },
      uEaten: { value: 0.9 },
      uGlow: { value: 2.5 },
      uBubbleScale: { value: 4 },
      uBubbleRate: { value: 1.5 },
      uWander: { value: 0.1 },
      uErode: { value: 0.7 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uColorAcid: { value: new Color() },
      uColorWet: { value: new Color() },
      uColorEtched: { value: new Color() }
    }),
    vertexShader: TRENCH_VERTEX,
    fragmentShader: TRENCH_FRAGMENT
  });

  /** @param {object} state { start, dir, side, length, cutEnd, tipAt, live, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.1, state.length);
    u.uHalfWidth.value = Math.max(c.trenchEaten, c.trenchWidth) + c.trenchWander + 0.25;
    u.uSeed.value = state.seed;
    u.uCutEnd.value = state.cutEnd;
    u.uTipAt.value = state.tipAt;
    u.uLive.value = state.live;
    u.uFresh.value = c.trenchFresh;
    u.uChannel.value = c.trenchWidth;
    u.uEaten.value = Math.max(c.trenchEaten, c.trenchWidth + 0.02);
    u.uGlow.value = c.trenchGlow * g.glow;
    u.uBubbleScale.value = c.bubbleScale * g.noiseFrequency;
    u.uBubbleRate.value = c.bubbleRate * g.animationSpeed;
    u.uWander.value = c.trenchWander * g.randomness;
    u.uErode.value = c.trenchErode;
    u.uFadeT.value = state.fadeT;
    u.uOpacity.value = g.opacity;
    u.uColorAcid.value.copy(getColor(c.colorAcid));
    u.uColorWet.value.copy(getColor(c.colorWet));
    u.uColorEtched.value.copy(getColor(c.colorEtched));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The bore                                                             */
/* -------------------------------------------------------------------- */

const BORE_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uSize;

  varying vec2 vUv;

  void main() {
    vec3 world = uCenter + (uSide * position.x + uDir * position.y) * uSize;
    world.y = 0.022;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const BORE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpen;        // 0..1 the pit spreading
  uniform float uLive;
  uniform float uSpin;
  uniform float uSwirl;
  uniform float uGlow;
  uniform float uFadeT;
  uniform float uOpacity;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    float a = atan(vUv.y, vUv.x);
    float edgeN = fbm3(vec3(cos(a) * 1.6, sin(a) * 1.6, uSeed)) * 0.22;
    float R = uOpen * (0.82 + edgeN);
    if (r > R || R < 0.01) discard;
    float rn = r / max(R, 0.01);

    // A drain: arms spiralling into the hole, turning.
    float arms = sin(a * 3.0 + log(max(rn, 0.02)) * uSwirl * 2.0 + uSpin);
    float armM = smoothstep(0.2, 0.95, arms) * smoothstep(0.12, 0.3, rn) * (1.0 - smoothstep(0.75, 1.0, rn));
    float hole = 1.0 - smoothstep(0.08, 0.2, rn);
    float lip = exp(-pow((rn - 0.22) / 0.06, 2.0));
    float rim = exp(-pow((rn - 0.96) / 0.05, 2.0));
    float bub = smoothstep(0.55, 0.9, snoise(vec3(vUv * 6.0, uTime * 1.8 + uSeed)));

    vec3 col = mix(uColorC * 1.4, uColorC, rn);
    vec3 glow = uColorB * (armM * (0.6 + 0.4 * bub)) + uColorA * (lip * 1.4 + rim * 0.5);
    col = mix(col, uColorC * 0.2, hole);
    col += glow * uGlow * uLive * uGlobalGlow;

    float a0 = 0.95 * (1.0 - smoothstep(0.85, 1.0, rn) * 0.6);
    float n = snoise(vec3(vUv * 3.0, uSeed * 4.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.2 - 0.1;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(rn, n, 0.6));
    float alpha = a0 * vis * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The drain the lance leaves where it bored into the floor. */
export function createBoreMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uSize: { value: 1.5 },
      uSeed: { value: 0 },
      uOpen: { value: 0 },
      uLive: { value: 1 },
      uSpin: { value: 0 },
      uSwirl: { value: 2.4 },
      uGlow: { value: 3 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() }
    }),
    vertexShader: BORE_VERTEX,
    fragmentShader: BORE_FRAGMENT
  });

  /** @param {object} state { center, dir, side, open, live, spin, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uSize.value = Math.max(0.1, c.boreRadius);
    u.uSeed.value = state.seed;
    u.uOpen.value = state.open;
    u.uLive.value = state.live;
    u.uSpin.value = state.spin;
    u.uSwirl.value = c.boreSwirl;
    u.uGlow.value = c.boreGlow * g.glow;
    u.uFadeT.value = state.fadeT;
    u.uOpacity.value = g.opacity;
    u.uColorA.value.copy(getColor(c.colorBoreA));
    u.uColorB.value.copy(getColor(c.colorBoreB));
    u.uColorC.value.copy(getColor(c.colorBoreC));
  };
  return material;
}


/* -------------------------------------------------------------------- */
/* The geyser — the bile coming back up                                 */
/* -------------------------------------------------------------------- */

const GEYSER_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uHeight;      // metres, top of the column
  uniform float uRadius;      // column radius
  uniform float uFoot;        // extra radius at the flared foot
  uniform float uHead;        // extra radius of the swollen head
  uniform float uHeadAt;      // 0..1 where the head sits up the column
  uniform float uLobes;       // crawling bulges, × radius
  uniform float uLobeScale;
  uniform float uFlow;        // integrated churn
  uniform float uSway;        // metres the column sways at the top
  uniform float uSink;        // metres it has sunk back into the bore
  uniform float uBubbleAmp;   // metres a bubble dome swells
  uniform float uBubbleScale;
  uniform float uBubblePhase;
  uniform float uSeed;
  uniform float uTime;

  varying float vS;
  varying float vBubble;
  varying float vPop;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}

  float bubbleAt(float s, float a, out float pop) {
    vec2 bp = vec2(a * 0.95493 * uBubbleScale, s * max(uHeight, 0.3) * uBubbleScale) + uSeed;
    vec2 cell = voronoi2(bp);
    float cyc = fract(cell.y * 7.31 + uBubblePhase * (0.6 + cell.y * 0.8));
    float grow = smoothstep(0.0, 0.85, cyc);
    pop = smoothstep(0.85, 1.0, cyc);
    float br = 0.42 * (0.5 + 0.5 * fract(cell.y * 31.1)) * grow * (1.0 - pop);
    float present = step(0.45, fract(cell.y * 13.7));
    return present * (1.0 - smoothstep(br * 0.4, br, cell.x)) * step(0.001, br);
  }

  float radiusAt(float s, float a, out float bub, out float pop) {
    float foot = uFoot * pow(1.0 - smoothstep(0.0, 0.35, s), 1.6);
    float head = uHead * exp(-pow((s - uHeadAt) / 0.17, 2.0));
    float r = uRadius + foot + head;
    // The top closes over in a dome.
    r *= pow(clamp(1.0 - s, 0.0, 1.0), 0.33);
    float n = snoise(vec3(cos(a) * uLobeScale, sin(a) * uLobeScale, s * uLobeScale * 2.2 - uFlow) + uSeed);
    r *= 1.0 + uLobes * n;
    bub = bubbleAt(s, a, pop);
    r += bub * uBubbleAmp * smoothstep(0.0, 0.1, 1.0 - s);
    return max(r, 0.0);
  }

  vec3 surface(float s, float a, out float bub, out float pop) {
    float r = radiusAt(s, a, bub, pop);
    float y = s * uHeight - uSink;
    vec2 sway = vec2(snoise(vec3(s * 1.4, uTime * 0.9, uSeed)), snoise(vec3(s * 1.4 + 7.1, uTime * 0.9, uSeed))) * uSway * s;
    return uCenter + vec3(sway.x + cos(a) * r, y, sway.y + sin(a) * r);
  }

  void main() {
    float s = position.x;
    float a = position.y * 6.2831853;
    float bub, pop, b2, p2;
    vec3 world = surface(s, a, bub, pop);
    float e = 0.012;
    vec3 ds = surface(min(s + e, 1.0), a, b2, p2) - surface(max(s - e, 0.0), a, b2, p2);
    vec3 da = surface(s, a + e * 6.2831853, b2, p2) - surface(s, a - e * 6.2831853, b2, p2);
    vec3 n = cross(ds, da);
    if (dot(n, n) < 1e-10) n = vec3(0.0, 1.0, 0.0);
    // Point outward: away from the column's axis, or up at the cap.
    vec3 out_ = world - (uCenter + vec3(0.0, s * uHeight - uSink, 0.0));
    if (dot(n, out_ + vec3(0.0, s * 0.5, 0.0)) < 0.0) n = -n;

    vS = s;
    vBubble = bub;
    vPop = pop;
    vNormalW = normalize(n);
    vWorld = world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const GEYSER_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uFlow;
  uniform float uFlowScale;
  uniform float uOpacity;
  uniform float uLight;
  uniform float uRimGlow;
  uniform float uVeinGlow;
  uniform float uHot;         // white-hot throat, only while rising
  uniform float uSpecular;
  uniform float uPopGlow;
  uniform float uSoftFade;
  uniform float uSeed;
  uniform vec3  uColorHot;
  uniform vec3  uColorTint;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform vec3      uLightDir;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying float vS;
  varying float vBubble;
  varying float vPop;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
    float wrap = dot(N, L) * 0.5 + 0.5;

    // Murk streaming up the column.
    vec3 q = vWorld * uFlowScale + vec3(0.0, -uFlow, uSeed);
    float murk = fbm3(q);
    vec3 col = mix(uColorDeep, uColorBody, smoothstep(0.35, 0.95, wrap) * smoothstep(-0.55, 0.45, murk));
    col *= mix(0.45, 1.0, wrap) * uLight;

    // Lime veins where the murk thins.
    float vein = 1.0 - smoothstep(0.0, 0.035, abs(murk - 0.15));
    col += uColorTint * vein * uVeinGlow * 0.5 * uShaderIntensity;

    // Bubble domes are paler; a popping one flashes a ring.
    col = mix(col, uColorBody * 1.3, vBubble * 0.5);
    col += uColorTint * vPop * vBubble * uPopGlow;

    // The rim, and the hot throat while it is still coming up.
    float fres = pow(1.0 - ndv, 3.0);
    col += uColorTint * fres * uRimGlow * 0.5;
    col += uColorHot * uHot * pow(1.0 - vS, 3.0) * pow(ndv, 1.5);

    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 60.0) * uSpecular;
    col += vec3(spec) * mix(vec3(1.0), uColorTint, 0.3);

    float alpha = uOpacity;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/** The eruption's body: lit, normal-blended bile so the deep stop reads. */
export function createGeyserMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uHeight: { value: 0 },
      uRadius: { value: 0.4 },
      uFoot: { value: 0.8 },
      uHead: { value: 0.6 },
      uHeadAt: { value: 0.8 },
      uLobes: { value: 0.2 },
      uLobeScale: { value: 1.4 },
      uFlow: { value: 0 },
      uFlowScale: { value: 1.2 },
      uSway: { value: 0.2 },
      uSink: { value: 0 },
      uBubbleAmp: { value: 0.1 },
      uBubbleScale: { value: 3 },
      uBubblePhase: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 0.96 },
      uLight: { value: 1 },
      uRimGlow: { value: 1.5 },
      uVeinGlow: { value: 1.5 },
      uHot: { value: 0 },
      uSpecular: { value: 1.2 },
      uPopGlow: { value: 2 },
      uSoftFade: { value: 0.15 },
      uColorHot: { value: new Color() },
      uColorTint: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: GEYSER_VERTEX,
    fragmentShader: GEYSER_FRAGMENT
  });

  /**
   * @param {object} state { center, height, radius, foot, head, headAt, sink,
   *   hot, flow, bubblePhase, seed } — the ability resolves the phases.
   */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uHeight.value = state.height;
    u.uRadius.value = state.radius;
    u.uFoot.value = state.foot;
    u.uHead.value = state.head;
    u.uHeadAt.value = state.headAt;
    u.uSink.value = state.sink;
    u.uHot.value = state.hot * c.geyserHot * g.glow;
    u.uFlow.value = state.flow;
    u.uBubblePhase.value = state.bubblePhase;
    u.uSeed.value = state.seed;
    u.uLobes.value = c.geyserLobes * g.noiseStrength;
    u.uLobeScale.value = c.geyserLobeScale * g.noiseFrequency;
    u.uFlowScale.value = c.geyserFlowScale * g.noiseFrequency;
    u.uSway.value = c.geyserSway * g.turbulence;
    u.uBubbleAmp.value = c.geyserBubbleAmp;
    u.uBubbleScale.value = c.geyserBubbleScale;
    u.uOpacity.value = Math.min(1, c.geyserOpacity * g.opacity);
    u.uLight.value = c.geyserLight;
    u.uRimGlow.value = c.geyserRimGlow * g.glow * g.fresnel;
    u.uVeinGlow.value = c.geyserVeinGlow * g.glow;
    u.uSpecular.value = c.geyserSpecular;
    u.uPopGlow.value = c.geyserPopGlow * g.glow;
    u.uSoftFade.value = c.softFade;
    u.uColorHot.value.copy(getColor(c.colorGeyserHot));
    u.uColorTint.value.copy(getColor(c.colorGeyserTint));
    u.uColorBody.value.copy(getColor(c.colorGeyserBody));
    u.uColorDeep.value.copy(getColor(c.colorGeyserDeep));
  };
  return material;
}
