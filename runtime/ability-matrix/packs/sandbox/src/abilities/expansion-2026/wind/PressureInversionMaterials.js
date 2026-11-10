import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial } from 'three';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';

/**
 * Pressure Inversion — the bespoke shaders.
 *
 * One idea runs through all of them: a signed **polarity**. +1 is the well,
 * air spiralling *in* and up; −1 is the inversion, the same air thrown *out*.
 * Every layer reads it, so the reversal happens in every layer on the same
 * frame — and because each spiral's phase is integrated on the CPU rather than
 * computed from `time × polarity`, the reversal is a change of direction, not
 * a snap to a new angle.
 *
 *  - **vortex ribbons** (`createVortexMaterial`) — a parameter-space strip
 *    wound into a rising spiral in the vertex stage. It grows out from the rim
 *    as the well forms, is *squeezed* toward the eye in the last moments
 *    before the inversion (the anticipation), and *blooms* outward with the
 *    gust. Streamlines run along it, broken up by noise, in the direction the
 *    air is moving. The carrier — the small knot of wind that travels to the
 *    target — is the same material at a tenth of the size.
 *  - **the well floor** (`createWellFloorMaterial`) — isobars (pressure
 *    contours) crawling toward the eye, curling spiral arms, a swirl of
 *    ground dust, a bright eye; after the inversion a gust front racing out
 *    across it.
 *  - **motes** (`createMoteMaterial`) — 128 GPU points drawn up the spiral.
 *  - **the lens** (`createPressureLensMaterial`, `LAYER.DISTORTION`) — the
 *    air itself bending: a tangential swirl while the well pulls, a radial
 *    pressure ring with the gust.
 *  - **the pressure column** (`createColumnMaterial`) — the hero: a waisted
 *    funnel 4 m tall lathed in the vertex stage, drawn as an additive
 *    streamline core and a normal-blended, sun-lit dust sheath (the mass and
 *    the deep tone). It rises out of the eye with an overshoot, pinches at
 *    the waist as the well tightens, and at the inversion blows out into a
 *    squat bell that tears apart from the rim inward.
 *  - **the pressure bowl** (`createWellBowlMaterial`) — the floor's dark
 *    body under the additive isobars: a normal-blended depression in the
 *    ramp's deep tone with dust dragged into spiral arms; behind the gust
 *    front it is combed radially outward and heaped with pale dust at the
 *    front. It stays through the settle.
 *
 * Every material reads `settings['pressure-inversion']` in
 * `userData.sync(state)`.
 */

const ID = 'pressure-inversion';

/* -------------------------------------------------------------------- */
/* Vortex ribbons                                                       */
/* -------------------------------------------------------------------- */

const VORTEX_VERTEX = /* glsl */ `
  uniform float uRadius;      // rim radius, metres
  uniform float uInner;       // eye radius, fraction of the rim
  uniform float uHeight;      // height at the eye, metres
  uniform float uTurns;
  uniform float uPhase;       // integrated spin, radians
  uniform float uWidth;       // ribbon width, metres
  uniform float uSqueeze;     // 0..1 pulled toward the eye before the inversion
  uniform float uBloom;       // 0..1 thrown outward by the gust

  varying float vU;
  varying float vV;
  varying float vView;

  void main() {
    float u = position.x;     // 0 eye … 1 rim
    float v = position.y;     // -1..1 across
    // The spiral: tight and high at the eye, wide and low at the rim.
    float r = uRadius * mix(uInner, 1.0, u);
    r *= 1.0 - uSqueeze * 0.4 * u;
    r *= 1.0 + uBloom * (0.5 + 0.9 * u);
    float h = mix(uHeight, 0.12, pow(u, 0.75)) * (1.0 + uBloom * 0.35);
    float a = u * 6.2831853 * uTurns + uPhase;
    vec3 radial = vec3(cos(a), 0.0, sin(a));
    // Across the ribbon: mostly up, partly out, so it reads from above too.
    vec3 across = normalize(vec3(0.0, 0.8, 0.0) + radial * 0.6);
    float w = uWidth * (0.55 + 0.45 * u) * (1.0 + uBloom * 0.8);
    vec3 p = radial * r + vec3(0.0, h, 0.0) + across * v * w * 0.5;
    vU = u;
    vV = v;
    vec4 world = modelMatrix * vec4(p, 1.0);
    // How edge-on the ribbon is to the camera, for a soft silhouette.
    vec3 tangent = normalize(vec3(-sin(a), 0.0, cos(a)));
    vec3 n = normalize(cross(tangent, across));
    vView = abs(dot(normalize(cameraPosition - world.xyz), n));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const VORTEX_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uPolarity;
  uniform float uGrow;        // 0..1 grown in from the rim
  uniform float uFlow;        // integrated streamline offset
  uniform float uStreaks;
  uniform float uGlow;
  uniform float uBloom;
  uniform float uSeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorEdge;
  uniform vec3  uColorGust;
  uniform float uShaderIntensity;
  uniform float uGlobalGlow;

  varying float vU;
  varying float vV;
  varying float vView;

  ${noiseGLSL}

  void main() {
    // Grows from the rim inward as the well draws breath.
    float grown = smoothstep(1.0 - uGrow - 0.08, 1.0 - uGrow, vU);
    if (grown < 0.002) discard;
    float core = pow(max(0.0, 1.0 - abs(vV)), 1.6);
    // Streamlines along the ribbon, torn by noise so they never read as stripes.
    float tear = snoise(vec3(vU * 6.0, vV * 1.5, uSeed + uTime * 0.4));
    float s = fract(vU * uStreaks + uFlow + tear * 0.35);
    float stream = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.08, 0.45, s));
    stream *= 0.6 + 0.4 * snoise01(vec3(vU * 18.0, vV * 3.0, uSeed));
    // Thin at the eye and the rim, so the spiral has no hard ends.
    float ends = smoothstep(0.0, 0.08, vU) * (1.0 - smoothstep(0.9, 1.0, vU));
    float soft = smoothstep(0.05, 0.5, vView);
    float a = (core * 0.22 + stream * 0.5 * core) * ends * soft * grown * uFade;
    if (a < 0.003) discard;
    vec3 col = mix(uColorEdge, uColorCore, core);
    col = mix(col, uColorGust, clamp(uBloom * 1.5, 0.0, 1.0) * step(uPolarity, 0.0));
    col += uColorCore * stream * 0.5;
    gl_FragColor = vec4(col * a * uGlow * uShaderIntensity * uGlobalGlow, a);
  }
`;

/** The well's ribbons (and, at a tenth of the size, the carrier knot). */
export function createVortexMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFade: { value: 1 },
      uPolarity: { value: 1 },
      uRadius: { value: 4 },
      uInner: { value: 0.18 },
      uHeight: { value: 1.75 },
      uTurns: { value: 3 },
      uPhase: { value: 0 },
      uWidth: { value: 0.24 },
      uSqueeze: { value: 0 },
      uBloom: { value: 0 },
      uGrow: { value: 1 },
      uFlow: { value: 0 },
      uStreaks: { value: 12 },
      uGlow: { value: 1.2 },
      uSeed: { value: 0 },
      uColorCore: { value: new Color() },
      uColorEdge: { value: new Color() },
      uColorGust: { value: new Color() }
    }),
    vertexShader: VORTEX_VERTEX,
    fragmentShader: VORTEX_FRAGMENT
  });
  material.uniforms.uTime = { value: 0 };

  /**
   * @param {object} state { time, fade, polarity, radius, inner, height, turns,
   *   phase, flow, width, squeeze, bloom, grow, glow, seed }
   */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time * g.noiseSpeed;
    u.uFade.value = state.fade * g.opacity;
    u.uPolarity.value = state.polarity;
    u.uRadius.value = Math.max(0.05, state.radius);
    u.uInner.value = state.inner;
    u.uHeight.value = state.height;
    u.uTurns.value = state.turns;
    u.uPhase.value = state.phase;
    u.uFlow.value = state.flow;
    u.uWidth.value = state.width;
    u.uSqueeze.value = state.squeeze;
    u.uBloom.value = state.bloom;
    u.uGrow.value = state.grow;
    u.uStreaks.value = c.ribbonStreaks;
    u.uGlow.value = state.glow * g.glow;
    u.uSeed.value = state.seed;
    u.uColorCore.value.copy(getColor(c.colorAirCore));
    u.uColorEdge.value.copy(getColor(c.colorAirEdge));
    u.uColorGust.value.copy(getColor(c.colorGust));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The well floor                                                       */
/* -------------------------------------------------------------------- */

const FLOOR_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uPolarity;
  uniform float uPhase;       // integrated spin, radians
  uniform float uDrift;       // integrated isobar drift
  uniform float uRings;
  uniform float uArms;
  uniform float uTwist;
  uniform float uGust;        // 0..1 radius of the gust front (0 = none)
  uniform float uSqueeze;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3  uColorFloor;
  uniform vec3  uColorEye;
  uniform vec3  uColorGust;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float a = vUv.x * 6.2831853;
    float r = vUv.y;
    // Isobars: contour rings crawling toward the eye (or away, inverted).
    float iso = fract(r * uRings + uDrift);
    float isobar = 1.0 - smoothstep(0.0, 0.07, min(iso, 1.0 - iso));
    isobar *= smoothstep(0.08, 0.3, r) * (0.55 + 0.45 * snoise01(vec3(cos(a) * 2.0, sin(a) * 2.0, r * 3.0 + uSeed)));
    // Spiral arms: logarithmic, curling the way the air turns.
    float arm = sin(a * uArms + log(max(r, 0.02)) * uTwist * 2.0 - uPhase);
    arm = pow(max(arm, 0.0), 6.0) * smoothstep(0.05, 0.4, r);
    // Ground dust dragged round by the well.
    vec2 swirl = vec2(cos(a + uPhase * 0.5 + r * uTwist), sin(a + uPhase * 0.5 + r * uTwist)) * r;
    float dust = fbm3(vec3(swirl * 3.0, uSeed + uTime * 0.2)) * 0.5 + 0.5;
    dust = smoothstep(0.45, 0.9, dust) * 0.35;
    // The eye: bright, and brighter as the well is squeezed.
    float eye = (1.0 - smoothstep(0.0, 0.16 + 0.08 * uSqueeze, r)) * (0.6 + 1.4 * uSqueeze);
    // The gust front, and torn streaks thrown out behind it.
    float front = uGust > 0.0 ? exp(-pow((r - uGust) * 14.0, 2.0)) : 0.0;
    float torn = uGust > 0.0 ? step(r, uGust) * pow(snoise01(vec3(a * 6.0, r * 2.0 - uTime * 3.0, uSeed)), 4.0) * (1.0 - uGust) : 0.0;
    float rim = 1.0 - smoothstep(0.85, 1.0, r);
    vec3 col = uColorFloor * (isobar * 0.7 + arm * 0.6 + dust) + uColorEye * eye + uColorGust * (front * 1.6 + torn);
    float alpha = clamp((isobar * 0.5 + arm * 0.45 + dust + eye * 0.6 + front + torn) * rim * uFade * uOpacity, 0.0, 1.0);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * alpha, alpha);
  }
`;

export function createWellFloorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    uniforms: sharedUniforms({
      uFade: { value: 1 },
      uPolarity: { value: 1 },
      uPhase: { value: 0 },
      uDrift: { value: 0 },
      uRings: { value: 9 },
      uArms: { value: 4 },
      uTwist: { value: 3 },
      uGust: { value: 0 },
      uSqueeze: { value: 0 },
      uGlow: { value: 1 },
      uOpacity: { value: 0.7 },
      uSeed: { value: 0 },
      uColorFloor: { value: new Color() },
      uColorEye: { value: new Color() },
      uColorGust: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });
  material.uniforms.uTime = { value: 0 };

  /** @param {object} state { time, fade, polarity, phase, drift, gust, squeeze, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time * g.noiseSpeed;
    u.uFade.value = state.fade;
    u.uPolarity.value = state.polarity;
    u.uPhase.value = state.phase;
    u.uDrift.value = state.drift;
    u.uRings.value = c.floorRings;
    u.uArms.value = Math.max(1, Math.round(c.floorArms));
    u.uTwist.value = c.floorTwist;
    u.uGust.value = state.gust;
    u.uSqueeze.value = state.squeeze;
    u.uGlow.value = c.floorGlow * g.glow;
    u.uOpacity.value = c.floorOpacity * g.opacity;
    u.uSeed.value = state.seed;
    u.uColorFloor.value.copy(getColor(c.colorFloor));
    u.uColorEye.value.copy(getColor(c.colorFloorEye));
    u.uColorGust.value.copy(getColor(c.colorGust));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Motes                                                                */
/* -------------------------------------------------------------------- */

const MOTE_VERTEX = /* glsl */ `
  attribute float phase;
  uniform float uTime;
  uniform float uRadius;
  uniform float uPolarity;
  uniform float uSpeed;
  uniform float uRise;
  uniform float uSpin;        // integrated spin, radians
  uniform float uSize;
  uniform vec2  uResolution;

  varying float vA;
  varying float vT;

  void main() {
    // Each mote cycles rim → eye (well) or eye → rim (gust).
    float t = fract(phase + uTime * uSpeed);
    float r = mix(1.0, 0.1, t);
    if (uPolarity < 0.0) r = 1.0 - r;
    float a = uSpin + t * 5.0;
    mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec2 xz = rot * position.xz * uRadius * r;
    vec3 q = vec3(xz.x, 0.15 + position.y * uRise + t, xz.y);
    vA = sin(t * 3.14159);
    vT = t;
    vec4 mv = modelViewMatrix * vec4(q, 1.0);
    float worldSize = uSize * 0.06;
    gl_PointSize = clamp(projectionMatrix[1][1] * 0.5 * uResolution.y * worldSize / max(0.5, -mv.z), 1.0, 20.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const MOTE_FRAGMENT = /* glsl */ `
  uniform float uFade;
  uniform float uGlow;
  uniform vec3  uColor;
  uniform float uGlobalGlow;

  varying float vA;
  varying float vT;

  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.15, 1.0, r)) * vA * uFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor * uGlow * uGlobalGlow * a, a);
  }
`;

export function createMoteMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFade: { value: 1 },
      uRadius: { value: 1 },
      uPolarity: { value: 1 },
      uSpeed: { value: 0.22 },
      uRise: { value: 1.8 },
      uSpin: { value: 0 },
      uSize: { value: 1 },
      uGlow: { value: 1.2 },
      uColor: { value: new Color() }
    }),
    vertexShader: MOTE_VERTEX,
    fragmentShader: MOTE_FRAGMENT
  });
  material.uniforms.uTime = { value: 0 };

  /** @param {object} state { time, fade, polarity, radius, spin } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uFade.value = state.fade * g.opacity;
    u.uPolarity.value = state.polarity;
    u.uRadius.value = state.radius;
    u.uSpin.value = state.spin;
    u.uSpeed.value = c.moteSpeed * g.particleSpeed;
    u.uRise.value = c.moteRise;
    u.uSize.value = c.moteSize * g.particleSize;
    u.uGlow.value = c.moteGlow * g.glow;
    u.uColor.value.copy(getColor(c.colorMote));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The lens — LAYER.DISTORTION                                          */
/* -------------------------------------------------------------------- */

const LENS_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // View-space billboard standing on the well's centre.
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += vec2(position.x * uWidth, (position.y + 0.5) * uHeight);
    gl_Position = projectionMatrix * mv;
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uPolarity;
  uniform float uStrength;
  uniform float uSwirl;
  uniform float uGust;        // 0..1 radius of the pressure ring
  uniform float uGustStrength;
  uniform float uPhase;
  uniform float uShaderIntensity;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    vec2 c = vec2((vUv.x - 0.5) * 2.0, vUv.y);
    // Polar about the column's axis, squashed so it hugs the floor.
    vec2 q = vec2(c.x, (c.y - 0.15) * 1.6);
    float r = length(q);
    vec2 radial = r > 1e-4 ? q / r : vec2(0.0);
    vec2 tangent = vec2(-radial.y, radial.x) * uPolarity;
    float n = snoise(vec3(q * 2.5, uTime * 0.8 - uPhase * 0.1));
    // The well: air turning round the eye, a little ragged.
    float well = (1.0 - smoothstep(0.2, 1.0, r)) * (0.6 + 0.4 * n) * uStrength;
    // The gust: a ring of pressure running outward.
    float ring = uGust > 0.0 ? exp(-pow((r - uGust * 1.1) * 7.0, 2.0)) * uGustStrength * (1.0 - uGust) : 0.0;
    vec2 dir = normalize(tangent * uSwirl + radial * (0.3 + ring * 3.0) + 1e-5);
    float mask = (1.0 - smoothstep(0.75, 1.0, abs(c.x))) * smoothstep(0.0, 0.08, c.y) * (1.0 - smoothstep(0.7, 1.0, c.y));
    float strength = (well + ring) * mask * uShaderIntensity;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
  }
`;

export function createPressureLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 8 },
      uHeight: { value: 2.2 },
      uPolarity: { value: 1 },
      uStrength: { value: 0.45 },
      uSwirl: { value: 1 },
      uGust: { value: 0 },
      uGustStrength: { value: 1 },
      uPhase: { value: 0 }
    }),
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });
  material.uniforms.uTime = { value: 0 };

  /** @param {object} state { time, polarity, radius, strength, gust, phase } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time * g.noiseSpeed;
    u.uPolarity.value = state.polarity;
    u.uWidth.value = Math.max(0.1, state.radius * 2.2);
    u.uHeight.value = c.lensHeight;
    u.uStrength.value = state.strength * c.lensStrength * g.distortion;
    u.uSwirl.value = c.lensSwirl;
    u.uGust.value = state.gust;
    u.uGustStrength.value = c.lensGust * g.distortion;
    u.uPhase.value = state.phase;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The pressure column — the hero                                        */
/* -------------------------------------------------------------------- */

const COLUMN_VERTEX = /* glsl */ `
  uniform float uHeight;      // metres
  uniform float uR0;          // foot radius, metres
  uniform float uR1;          // top radius, metres
  uniform float uFlare;
  uniform float uWaist;       // 0..1 up the column where it pinches
  uniform float uPinch;       // 0..1 how hard (the squeeze)
  uniform float uGrow;        // 0..1+ (overshoots) rising out of the eye
  uniform float uBloom;       // 0..1+ blown out by the gust
  uniform float uBurst;       // radius gain at full bloom
  uniform float uSquash;      // height lost at full bloom, fraction
  uniform float uRadiusScale; // the sheath is a little wider than the core
  uniform float uWobble;
  uniform float uPhase;       // integrated spin
  uniform float uSeed;

  varying vec2  vC;           // x: 0 foot .. 1 top, y: 0..1 round
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float v = position.x;
    float ang = position.y * 6.2831853;
    float h = v * uHeight * max(uGrow, 0.0) * (1.0 - uSquash * clamp(uBloom, 0.0, 1.0));
    float r = mix(uR0, uR1, pow(v, max(uFlare, 0.1)));
    float w = (v - uWaist) / 0.2;
    r *= 1.0 - uPinch * exp(-w * w);
    // The gust blows the column out into a bell, fattest at mid height.
    r *= 1.0 + uBloom * uBurst * (0.35 + sin(v * 3.14159));
    r *= mix(0.3, 1.0, clamp(uGrow, 0.0, 1.0)) * uRadiusScale;
    vec2 sway = vec2(snoise(vec3(v * 1.5, uPhase * 0.05, uSeed)), snoise(vec3(v * 1.5, uPhase * 0.05, uSeed + 5.1))) * uWobble * v;
    vec3 n = vec3(cos(ang), 0.0, sin(ang));
    vec3 p = vec3(sway.x, h, sway.y) + n * r;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * n);
    vWorld = world.xyz;
    vC = vec2(v, position.y);
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const COLUMN_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uPhase;
  uniform float uFlow;        // integrated streamline drift (reverses with the gust)
  uniform float uPolarity;
  uniform float uTwist;
  uniform float uStreams;
  uniform float uHeight;
  uniform float uTear;        // 0..1 torn away by the gust, rim inward
  uniform float uSqueezeGlow; // the eye brightening as the well tightens
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uFresnel;
  uniform float uNoise;
  uniform float uFade;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBodyColor;
  uniform vec3  uDeep;
  uniform vec3  uLightDir;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vC;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float v = vC.x;
    float ang = vC.y * 6.2831853;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float wound = ang + uPhase + uTwist * v * uHeight * uPolarity;
    vec2 ring = vec2(cos(wound), sin(wound));
    float n = fbm3(vec3(ring * 1.7, v * 3.5 - uFlow * 0.6 + uSeed)) * 0.5 + 0.5;
    n = mix(0.6, n, clamp(uNoise, 0.0, 1.0));

    // The gust tears it from the rim of the bell inward.
    float thr = uTear * 1.2 - 0.1;
    float tearN = n * 0.6 + (1.0 - abs(v - 0.45) * 1.4) * 0.4;
    float keep = uTear <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.07, tearN);
    float fray = uTear <= 0.0 ? 0.0 : smoothstep(thr - 0.02, thr + 0.05, tearN) - smoothstep(thr + 0.05, thr + 0.18, tearN);
    float ends = smoothstep(0.0, 0.05, v) * (1.0 - smoothstep(0.8, 1.0, v));

    vec2 screenUV = gl_FragCoord.xy / uResolution;
    float soft = softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.4);

  #ifdef SHEATH
    float ndl = dot(N, normalize(uLightDir)) * 0.5 + 0.5;
    float fr = fresnelTerm(V, N, uFresnel, 1.0);
    vec3 col = mix(uDeep, uBodyColor, ndl * (0.35 + 0.8 * n));
    col = mix(col, uTint, clamp(fr * 0.4, 0.0, 1.0));
    float a = uOpacity * smoothstep(0.26, 0.64, n) * (1.0 - 0.55 * clamp(fr, 0.0, 1.0)) * ends * keep * uFade * soft;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  #else
    float st = sin(wound * max(uStreams, 1.0) + (n - 0.5) * 3.0);
    st = pow(0.5 + 0.5 * st, 5.0);
    float vol = pow(abs(dot(N, V)), 1.2);
    float rim = pow(1.0 - abs(dot(N, V)), 2.0);
    // The waist burns brighter as the well is squeezed.
    float waist = exp(-pow((v - 0.4) / 0.25, 2.0)) * uSqueezeGlow;
    vec3 col = mix(uTint, uCore, clamp(st + waist, 0.0, 1.0)) * (st * 0.9 + vol * 0.15 + rim * 0.25 * n + waist);
    col += uCore * fray * 2.5;
    float a = (st * 0.8 + vol * 0.15 + rim * 0.2 + fray + waist * 0.5) * ends * keep * uFade * soft;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * uShaderIntensity * a, clamp(a, 0.0, 1.0));
  #endif
  }
`;

/**
 * The pressure column.
 * @param {boolean} sheath true for the normal-blended, sun-lit dust sheath
 */
export function createColumnMaterial(sheath = false) {
  const material = new ShaderMaterial({
    defines: sheath ? { SHEATH: '' } : {},
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: sheath ? NormalBlending : AdditiveBlending,
    // Front faces only: the far wall winds the other way and would cross-hatch.
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHeight: { value: 4 },
      uR0: { value: 0.8 },
      uR1: { value: 2 },
      uFlare: { value: 1.5 },
      uWaist: { value: 0.4 },
      uPinch: { value: 0.2 },
      uGrow: { value: 0 },
      uBloom: { value: 0 },
      uBurst: { value: 1.4 },
      uSquash: { value: 0.45 },
      uRadiusScale: { value: 1 },
      uWobble: { value: 0.3 },
      uPhase: { value: 0 },
      uSeed: { value: 0 },
      uFlow: { value: 0 },
      uPolarity: { value: 1 },
      uTwist: { value: 1.6 },
      uStreams: { value: 6 },
      uTear: { value: 0 },
      uSqueezeGlow: { value: 0 },
      uGlow: { value: 2 },
      uOpacity: { value: 0.6 },
      uFresnel: { value: 2.2 },
      uNoise: { value: 1 },
      uFade: { value: 1 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBodyColor: { value: new Color() },
      uDeep: { value: new Color() }
    }),
    vertexShader: COLUMN_VERTEX,
    fragmentShader: COLUMN_FRAGMENT
  });

  /**
   * @param {object} state { radius, grow, squeeze, bloom, tear, phase, flow,
   *   polarity, fade, seed }
   */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    const R = Math.max(0.05, state.radius);
    u.uHeight.value = Math.max(0.2, c.columnHeight);
    u.uR0.value = c.columnBaseRadius * R;
    u.uR1.value = c.columnTopRadius * R;
    u.uFlare.value = c.columnFlare;
    u.uWaist.value = c.columnWaist;
    u.uPinch.value = Math.min(0.95, c.columnRestPinch + c.columnPinch * state.squeeze);
    u.uGrow.value = state.grow;
    u.uBloom.value = state.bloom;
    u.uBurst.value = c.columnBurst;
    u.uSquash.value = c.columnSquash;
    u.uRadiusScale.value = sheath ? c.columnSheathScale : 1;
    u.uWobble.value = c.columnWobble * g.turbulence;
    u.uPhase.value = state.phase;
    u.uSeed.value = state.seed;
    u.uFlow.value = state.flow;
    u.uPolarity.value = state.polarity;
    u.uTwist.value = c.columnTwist;
    u.uStreams.value = Math.max(1, Math.round(c.columnStreams));
    u.uTear.value = state.tear;
    u.uSqueezeGlow.value = state.squeeze * c.columnSqueezeGlow;
    u.uGlow.value = c.columnGlow * g.glow;
    u.uOpacity.value = c.columnOpacity * g.opacity;
    u.uFresnel.value = c.columnFresnel * g.fresnel;
    u.uNoise.value = g.noiseStrength;
    u.uFade.value = state.fade * (sheath ? 1 : g.opacity);
    u.uCore.value.copy(getColor(c.colorColumnCore));
    u.uTint.value.copy(getColor(c.colorColumnTint));
    u.uBodyColor.value.copy(getColor(c.colorColumnBody));
    u.uDeep.value.copy(getColor(c.colorColumnDeep));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The pressure bowl — the floor's dark body                            */
/* -------------------------------------------------------------------- */

const BOWL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uPhase;
  uniform float uArms;
  uniform float uTwist;
  uniform float uGust;        // 0..1 radius of the gust front
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3  uDeep;
  uniform vec3  uDust;
  uniform vec3  uRim;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float a = vUv.x * 6.2831853;
    float r = vUv.y;
    vec2 q = vec2(cos(a), sin(a)) * r;
    float edgeN = fbm3(vec3(q * 2.5, uSeed)) * 0.12;
    float disc = 1.0 - smoothstep(0.82, 1.0, r + edgeN);

    // The pull: dust dragged into spiral arms, darkest toward the eye.
    float arms = 0.5 + 0.5 * sin(a * max(uArms, 1.0) + log(r + 0.05) * uTwist * 2.0 - uPhase);
    arms = pow(arms, 2.0);
    float drag = fbm3(vec3(vec2(cos(a + r * uTwist + uPhase * 0.5), sin(a + r * uTwist + uPhase * 0.5)) * r * 3.0, uSeed + 2.0)) * 0.5 + 0.5;
    float pull = (0.45 + 0.55 * (1.0 - r)) * (0.55 + 0.45 * arms * drag);
    vec3 col = mix(uDust, uDeep, clamp(0.55 + 0.45 * (1.0 - r) - arms * 0.35 * drag, 0.0, 1.0));

    // The gust: combed straight out behind the front, heaped at it.
    float behind = uGust > 0.0 ? 1.0 - smoothstep(uGust - 0.04, uGust, r) : 0.0;
    float comb = smoothstep(0.35, 0.85, snoise(vec3(a * 11.0, r * 1.5, uSeed * 1.7)) * 0.5 + 0.5);
    vec3 blown = mix(uDeep, uDust, comb * 0.6 + r * 0.2);
    col = mix(col, blown, behind);
    float heap = uGust > 0.0 ? exp(-pow((r + edgeN - uGust) / 0.06, 2.0)) * (0.5 + 0.5 * comb) : 0.0;
    col = mix(col, uRim, heap);

    float alpha = (mix(pull, 0.55 + 0.35 * comb, behind) * disc + heap * 0.9) * uFade * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The well's dark floor, under the additive isobars. Normal blended. */
export function createWellBowlMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    uniforms: sharedUniforms({
      uFade: { value: 1 },
      uPhase: { value: 0 },
      uArms: { value: 3 },
      uTwist: { value: 3 },
      uGust: { value: 0 },
      uOpacity: { value: 0.7 },
      uSeed: { value: 0 },
      uDeep: { value: new Color() },
      uDust: { value: new Color() },
      uRim: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: BOWL_FRAGMENT
  });

  /** @param {object} state { fade, phase, gust, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uFade.value = state.fade;
    u.uPhase.value = state.phase;
    u.uArms.value = Math.max(1, Math.round(c.bowlArms));
    u.uTwist.value = c.floorTwist;
    u.uGust.value = state.gust;
    u.uOpacity.value = c.bowlOpacity * g.opacity;
    u.uSeed.value = state.seed;
    u.uDeep.value.copy(getColor(c.colorBowlDeep));
    u.uDust.value.copy(getColor(c.colorBowlDust));
    u.uRim.value.copy(getColor(c.colorBowlRim));
  };
  return material;
}
