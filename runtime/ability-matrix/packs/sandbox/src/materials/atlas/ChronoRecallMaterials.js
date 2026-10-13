import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { SKINNING_PARS, SKINNING_MAIN } from '../../assets/atlas/ChronoRecallRig.js';

/**
 * The four bespoke surfaces of the Chrono Recall.
 *
 *   - `createRecallEchoMaterial`  — a frozen echo of the caster: the real rig,
 *     skinned and posed, drawn as amber glass with a hot fresnel rim, frozen
 *     sand-glass bands and a faint read of the skin's own detail. On the rewind
 *     it is peeled apart slice by slice, twisted about its spine and dragged
 *     back along the curve while noise eats it from the edges.
 *   - `createRecallPathMaterial`  — the time-stream on the floor: a curved
 *     band, built in the vertex stage from a parameter ladder, with two rails,
 *     a centre line and chevrons that flow forward on the dash and backward on
 *     the rewind.
 *   - `createRecallDialMaterial`  — the clock-hand ring glyphs: instanced floor
 *     dials with a bezel, sixty ticks, two hands and a light wedge trailing the
 *     minute hand, all SDF; the hands are wound by the CPU so they can stop and
 *     run backward.
 *   - `createRecallWarpMaterial`  — the rewind distortion on LAYER.DISTORTION: a
 *     ring that twists the frame about its centre instead of only pushing it.
 *
 * All four resolve `settings.recall` in `userData.sync`, every frame.
 */

/* ==================================================================== */
/* The echoes                                                            */
/* ==================================================================== */

const ECHO_VERTEX = /* glsl */ `
  ${SKINNING_PARS}

  uniform float uTime;
  uniform float uHeight;     // body height, metres
  uniform vec3  uAnchor;     // the echo's feet, world
  uniform vec3  uBack;       // unit, flat: back along the curve toward the origin
  uniform float uCollapse;   // 0 standing .. 1 gone
  uniform float uSlices;
  uniform float uTwist;      // radians at full collapse
  uniform float uSmear;      // metres a slice is dragged back
  uniform float uShrink;     // 0..1 how far a slice falls into the heart
  uniform float uJitter;     // metres of frozen-time tremor
  uniform float uSeed;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec2  vUv;
  varying float vH;
  varying float vPeel;

  ${noiseGLSL}

  void main() {
    ${SKINNING_MAIN}

    vec4 world = modelMatrix * vec4(transformed, 1.0);
    vec3 nW = normalize(mat3(modelMatrix) * objectNormal);

    float h = clamp((world.y - uAnchor.y) / max(uHeight, 0.1), 0.0, 1.2);

    // Each horizontal slice peels on its own clock: the rewind does not take
    // the body whole, it unthreads it.
    float slice = floor(h * uSlices);
    float order = hash11(slice * 7.31 + uSeed * 13.0);
    float peel = clamp(uCollapse * 1.7 - order * 0.7, 0.0, 1.0);
    peel = peel * peel * (3.0 - 2.0 * peel);

    // Twist about the spine, fall into the heart, drag back along the curve.
    vec3 heart = uAnchor + vec3(0.0, uHeight * 0.55, 0.0);
    vec3 rel = world.xyz - heart;
    float a = peel * uTwist * (0.6 + 0.8 * order);
    float s = sin(a), c = cos(a);
    rel.xz = mat2(c, -s, s, c) * rel.xz;
    rel *= 1.0 - uShrink * peel * peel;
    vec3 p = heart + rel + uBack * peel * uSmear * (0.5 + order);

    // Frozen, but not dead: a sub-centimetre tremor, per slice.
    float trem = sin(uTime * 47.0 + slice * 3.7 + uSeed * 9.0) * uJitter * (1.0 - peel);
    p += vec3(uBack.z, 0.0, -uBack.x) * trem;

    vWorld = p;
    vNormalW = nW;
    vUv = uv;
    vH = h;
    vPeel = peel;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const ECHO_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uCollapse;
  uniform float uFade;
  uniform float uFlare;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uFill;
  uniform float uFresnel;
  uniform float uFresnelPower;
  uniform float uBands;
  uniform float uBandSpeed;
  uniform float uBandSharp;
  uniform float uMapMix;
  uniform float uHasMap;
  uniform sampler2D uMap;
  uniform vec3  uColorCore;
  uniform vec3  uColorRim;
  uniform vec3  uColorBand;
  uniform vec3  uColorBurn;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec2  vUv;
  varying float vH;
  varying float vPeel;

  ${noiseGLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    float ndv = abs(dot(N, V));
    float rim = pow(1.0 - ndv, uFresnelPower) * uFresnel;

    // The skin's own detail, as luminance only: the echo is the caster, but
    // poured in amber.
    float lum = 1.0;
    if (uHasMap > 0.5) {
      vec3 tex = texture2D(uMap, vUv).rgb;
      lum = mix(1.0, dot(tex, vec3(0.299, 0.587, 0.114)) * 2.2, uMapMix);
    }

    // Sand-glass bands, crawling upward very slowly: time not quite stopped.
    float band = fract(vH * uBands - uTime * uBandSpeed + uSeed);
    band = pow(1.0 - abs(band * 2.0 - 1.0), uBandSharp);

    // Grain, so the glass has depth rather than a flat tint.
    float grain = snoise(vec3(vWorld * 9.0 + uSeed * 5.0)) * 0.5 + 0.5;

    vec3 color = uColorCore * uFill * lum * (0.65 + 0.35 * grain);
    color += uColorBand * band * 0.8;
    color += uColorRim * rim;

    // Noise eats the peeling slices; a hot rewind-coloured edge where it bites.
    float n = snoise(vec3(vWorld * 4.0 + vec3(0.0, uTime * 0.7, uSeed * 3.0))) * 0.5 + 0.5;
    float cut = vPeel * 1.15 + uCollapse * 0.2;
    if (n < cut - 0.02) discard;
    float edge = 1.0 - smoothstep(0.0, 0.14, n - cut);
    color = mix(color, uColorBurn * 3.0, edge * step(0.001, cut));

    color *= uGlow * uGlobalGlow * (1.0 + uFlare * 3.0);
    float alpha = clamp((uFill * 0.35 + rim + band * 0.25 + edge) * uOpacity * uFade, 0.0, 1.0);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

/** One per echo: each carries its own collapse, fade and anchor. */
export function createRecallEchoMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    // Additive: the echo is light trapped in glass, so the floor shows through
    // its dark interior and the rim and the bands bloom.
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHeight: { value: 1.78 },
      uAnchor: { value: new Vector3() },
      uBack: { value: new Vector3(0, 0, -1) },
      uCollapse: { value: 0 },
      uSlices: { value: 18 },
      uTwist: { value: 2 },
      uSmear: { value: 1 },
      uShrink: { value: 0.8 },
      uJitter: { value: 0.004 },
      uSeed: { value: 0 },
      uFade: { value: 1 },
      uFlare: { value: 0 },
      uOpacity: { value: 1 },
      uGlow: { value: 1 },
      uFill: { value: 0.5 },
      uFresnel: { value: 1.5 },
      uFresnelPower: { value: 2.2 },
      uBands: { value: 14 },
      uBandSpeed: { value: 0.05 },
      uBandSharp: { value: 8 },
      uMapMix: { value: 0.5 },
      uHasMap: { value: 0 },
      uMap: { value: null },
      uColorCore: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorBand: { value: new Color() },
      uColorBurn: { value: new Color() }
    }),
    vertexShader: ECHO_VERTEX,
    fragmentShader: ECHO_FRAGMENT
  });

  /**
   * @param {object} state { anchor, back, collapse, fade, flare, seed, height, map }
   */
  material.userData.sync = (state) => {
    const c = settings.recall;
    const g = settings.global;
    const u = material.uniforms;
    u.uHeight.value = state.height;
    u.uAnchor.value.copy(state.anchor);
    u.uBack.value.copy(state.back);
    u.uCollapse.value = state.collapse;
    u.uFade.value = state.fade;
    u.uFlare.value = state.flare;
    u.uSeed.value = state.seed;
    u.uMap.value = state.map;
    u.uHasMap.value = state.map ? 1 : 0;
    u.uSlices.value = Math.max(1, Math.round(c.echoSlices));
    u.uTwist.value = c.echoTwist;
    u.uSmear.value = c.echoSmear;
    u.uShrink.value = c.echoShrink;
    u.uJitter.value = c.echoJitter * g.randomness;
    u.uOpacity.value = c.echoOpacity * g.opacity;
    u.uGlow.value = c.echoGlow * g.glow;
    u.uFill.value = c.echoFill;
    u.uFresnel.value = c.echoFresnel * g.fresnel;
    u.uFresnelPower.value = c.echoFresnelPower;
    u.uBands.value = c.echoBands;
    u.uBandSpeed.value = c.echoBandSpeed * g.noiseSpeed;
    u.uBandSharp.value = c.echoBandSharp;
    u.uMapMix.value = c.echoMapMix;
    u.uColorCore.value.copy(getColor(c.colorEchoCore));
    u.uColorRim.value.copy(getColor(c.colorEchoRim));
    u.uColorBand.value.copy(getColor(c.colorEchoBand));
    u.uColorBurn.value.copy(getColor(c.colorRewind));
  };

  return material;
}

/* ==================================================================== */
/* The time-stream                                                       */
/* ==================================================================== */

/** Quadratic Bézier, shared by the path's vertex stage. */
const BEZIER_GLSL = /* glsl */ `
  vec3 bez(vec3 a, vec3 b, vec3 c, float t) {
    float k = 1.0 - t;
    return a * k * k + b * 2.0 * k * t + c * t * t;
  }
  vec3 bezD(vec3 a, vec3 b, vec3 c, float t) {
    return 2.0 * (1.0 - t) * (b - a) + 2.0 * t * (c - b);
  }
`;

const PATH_VERTEX = /* glsl */ `
  uniform vec3  uOrigin;
  uniform vec3  uCtrl;
  uniform vec3  uTarget;
  uniform float uWidth;
  uniform float uLift;

  varying float vT;
  varying float vSide;
  varying vec3  vWorld;
  varying float vViewZ;

  ${BEZIER_GLSL}

  void main() {
    float t = position.x;
    vec3 p = bez(uOrigin, uCtrl, uTarget, t);
    vec3 tg = bezD(uOrigin, uCtrl, uTarget, t);
    tg.y = 0.0;
    tg = normalize(tg + vec3(1e-5, 0.0, 0.0));
    vec3 n = vec3(-tg.z, 0.0, tg.x);
    // Pinched at both ends, so the stream is anchored rather than cut off.
    float w = uWidth * (0.35 + 0.65 * sin(clamp(t, 0.0, 1.0) * 3.14159265));
    p += n * position.y * w;
    p.y = uLift;

    vT = t;
    vSide = position.y;
    vWorld = p;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const PATH_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uHead;       // 0..1 revealed up to here (the dash)
  uniform float uRewind;     // 0..1 the rewind head; above it the stream is gone
  uniform float uRewinding;  // 0 outbound .. 1 rewinding (flow reverses, colour turns)
  uniform float uArc;        // metres of curve
  uniform float uTick;       // metres between chevrons
  uniform float uFlowSpeed;
  uniform float uGrain;
  uniform float uHeadGlow;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uFade;
  uniform vec3  uColorCore;
  uniform vec3  uColorEdge;
  uniform vec3  uColorRewind;
  uniform float uGlobalGlow;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;

  varying float vT;
  varying float vSide;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float lim = min(uHead, uRewind);
    float soft = 0.6 / max(uArc, 0.5);           // 0.6 m feather at the moving end
    float shown = 1.0 - smoothstep(lim - soft, lim, vT);
    if (shown < 0.003) discard;

    float a = abs(vSide);
    float s = vT * uArc;                          // metres along

    // Two rails and a hairline down the middle: a track, not a smear.
    float rails = smoothstep(0.72, 0.86, a) * (1.0 - smoothstep(0.9, 1.0, a));
    float centre = 1.0 - smoothstep(0.0, 0.08, a);
    float body = (1.0 - smoothstep(0.3, 1.0, a)) * 0.22;

    // Chevrons: forward on the dash, backward on the rewind.
    float dir = mix(1.0, -1.0, uRewinding);
    float ph = fract((s - a * uTick * 0.35 * dir) / max(uTick, 0.05) - uTime * uFlowSpeed * dir / max(uTick, 0.05));
    float chev = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.12, 0.3, ph)) * (1.0 - smoothstep(0.7, 0.95, a));

    float grain = mix(1.0, fbm3(vec3(vWorld.xz * 3.0, uTime * 0.3)) * 0.8 + 0.6, uGrain);

    float headDist = (lim - vT) * uArc;
    float head = exp(-max(headDist, 0.0) * 1.6) * uHeadGlow;

    vec3 base = mix(uColorEdge, uColorCore, centre + chev * 0.6);
    vec3 color = mix(base, uColorRewind, uRewinding * 0.75);
    float energy = (rails + centre * 0.9 + body + chev * 0.8) * grain + head * (1.0 - a);

    vec2 screenUV = gl_FragCoord.xy / uResolution;
    float alpha = energy * shown * uOpacity * uFade;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.15);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uGlow * uGlobalGlow * (1.0 + head), alpha);
  }
`;

export function createRecallPathMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uOrigin: { value: new Vector3() },
      uCtrl: { value: new Vector3() },
      uTarget: { value: new Vector3() },
      uWidth: { value: 0.5 },
      uLift: { value: 0.03 },
      uHead: { value: 0 },
      uRewind: { value: 1 },
      uRewinding: { value: 0 },
      uArc: { value: 1 },
      uTick: { value: 0.8 },
      uFlowSpeed: { value: 2 },
      uGrain: { value: 0.5 },
      uHeadGlow: { value: 2 },
      uGlow: { value: 1 },
      uOpacity: { value: 1 },
      uFade: { value: 1 },
      uColorCore: { value: new Color() },
      uColorEdge: { value: new Color() },
      uColorRewind: { value: new Color() }
    }),
    vertexShader: PATH_VERTEX,
    fragmentShader: PATH_FRAGMENT
  });

  /** @param {object} state { origin, ctrl, target, arc, head, rewind, rewinding, fade } */
  material.userData.sync = (state) => {
    const c = settings.recall;
    const g = settings.global;
    const u = material.uniforms;
    u.uOrigin.value.copy(state.origin);
    u.uCtrl.value.copy(state.ctrl);
    u.uTarget.value.copy(state.target);
    u.uArc.value = state.arc;
    u.uHead.value = state.head;
    u.uRewind.value = state.rewind;
    u.uRewinding.value = state.rewinding;
    u.uFade.value = state.fade;
    u.uWidth.value = c.pathWidth;
    u.uLift.value = c.pathLift;
    u.uTick.value = c.pathTickSpacing;
    u.uFlowSpeed.value = c.pathFlowSpeed * g.noiseSpeed;
    u.uGrain.value = c.pathGrain * g.noiseStrength;
    u.uHeadGlow.value = c.pathHeadGlow;
    u.uGlow.value = c.pathGlow * g.glow;
    u.uOpacity.value = c.pathOpacity * g.opacity;
    u.uColorCore.value.copy(getColor(c.colorPathCore));
    u.uColorEdge.value.copy(getColor(c.colorPathEdge));
    u.uColorRewind.value.copy(getColor(c.colorRewind));
  };

  return material;
}

/* ==================================================================== */
/* The clock dials                                                       */
/* ==================================================================== */

/**
 * Instanced floor quad. `aDial` = (minute angle, hour angle, alpha, rewind
 * 0..1), `aDialB` = (seed, flare). The hands are wound on the CPU because the
 * clock has to *stop* during the hold and then run backward — a function of
 * time alone cannot do that without a discontinuity.
 */
const DIAL_VERTEX = /* glsl */ `
  attribute vec4 aDial;
  attribute vec2 aDialB;
  varying vec2 vP;
  varying vec4 vDial;
  varying vec2 vDialB;
  void main() {
    vP = position.xz * 2.0;             // -1..1 across the dial
    vDial = aDial;
    vDialB = aDialB;
    vec4 local = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
    #endif
    gl_Position = projectionMatrix * viewMatrix * (modelMatrix * local);
  }
`;

const DIAL_FRAGMENT = /* glsl */ `
  #define TAU 6.28318530718
  uniform float uTime;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uTrail;
  uniform float uLine;
  uniform vec3  uColorRing;
  uniform vec3  uColorHand;
  uniform vec3  uColorTrail;
  uniform vec3  uColorRewind;
  uniform float uGlobalGlow;

  varying vec2 vP;
  varying vec4 vDial;
  varying vec2 vDialB;

  ${noiseGLSL}

  float band(float x, float a, float b, float w) {
    return smoothstep(a - w, a, x) * (1.0 - smoothstep(b, b + w, x));
  }

  /** Distance to a hand from the hub out to 'len' along angle 'ang'. */
  float hand(vec2 p, float ang, float len, float width) {
    vec2 d = vec2(sin(ang), cos(ang));
    float h = clamp(dot(p, d), -0.08, len);
    return length(p - d * h) - width * (1.0 - 0.6 * h / len);
  }

  void main() {
    float alpha0 = vDial.z;
    if (alpha0 < 0.003) discard;
    float r = length(vP);
    if (r > 1.0) discard;

    float w = uLine;
    float aa = fwidth(r) * 1.2 + 1e-4;
    float ang = atan(vP.x, vP.y);            // clockwise from +y, like a clock

    float bezel = band(r, 0.86, 0.93, aa) + band(r, 0.97, 0.985, aa) * 0.6;
    float inner = band(r, 0.6, 0.6 + w * 0.6, aa) * 0.6;

    // Sixty ticks, every fifth long.
    float tickA = fract(ang / TAU * 60.0 + 0.5) - 0.5;
    float tickW = abs(tickA) * TAU / 60.0 * r;
    float tickIn = mix(0.78, 0.68, step(0.95, 1.0 - abs(fract(ang / TAU * 12.0 + 0.5) - 0.5) * 2.0));
    float ticks = (1.0 - smoothstep(w * 0.5, w * 0.5 + aa, tickW)) * band(r, tickIn, 0.85, aa);

    // Slow counter-rotating segmented arc between bezel and ticks.
    float segA = fract((ang + uTime * 0.4 * (vDialB.x > 0.5 ? 1.0 : -1.0)) / TAU * 8.0);
    float seg = band(r, 0.94, 0.955, aa) * step(0.3, segA);

    float mA = vDial.x;
    float hA = vDial.y;
    float handM = 1.0 - smoothstep(0.0, aa, hand(vP, mA, 0.8, w * 0.9));
    float handH = 1.0 - smoothstep(0.0, aa, hand(vP, hA, 0.5, w * 1.4));
    float hub = 1.0 - smoothstep(0.05, 0.05 + aa, r);

    // A wedge of light trailing the minute hand — on whichever side it came from.
    float rew = vDial.w;
    float side = mix(1.0, -1.0, rew);
    float behind = mod((mA - ang) * side + TAU, TAU);
    float wedge = exp(-behind * 2.4) * band(r, 0.08, 0.84, aa) * uTrail;

    vec3 ringC = mix(uColorRing, uColorRewind, rew * 0.6);
    vec3 trailC = mix(uColorTrail, uColorRewind, rew);
    vec3 color = ringC * (bezel + inner + ticks + seg)
               + uColorHand * (handM + handH + hub) * 1.6
               + trailC * wedge;
    float e = bezel + inner + ticks + seg + handM + handH + hub + wedge;

    float flare = vDialB.y;
    color *= uGlow * uGlobalGlow * (1.0 + flare * 4.0);
    float alpha = clamp(e, 0.0, 1.0) * alpha0 * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createRecallDialMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uGlow: { value: 1 },
      uOpacity: { value: 1 },
      uTrail: { value: 1 },
      uLine: { value: 0.02 },
      uColorRing: { value: new Color() },
      uColorHand: { value: new Color() },
      uColorTrail: { value: new Color() },
      uColorRewind: { value: new Color() }
    }),
    vertexShader: DIAL_VERTEX,
    fragmentShader: DIAL_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.recall;
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.dialGlow * g.glow;
    u.uOpacity.value = c.dialOpacity * g.opacity;
    u.uTrail.value = c.dialTrail;
    u.uLine.value = c.dialLine;
    u.uColorRing.value.copy(getColor(c.colorDialRing));
    u.uColorHand.value.copy(getColor(c.colorDialHand));
    u.uColorTrail.value.copy(getColor(c.colorDialTrail));
    u.uColorRewind.value.copy(getColor(c.colorRewind));
  };

  return material;
}

/* ==================================================================== */
/* The rewind distortion                                                 */
/* ==================================================================== */

/**
 * A camera-facing disc on LAYER.DISTORTION. Unlike a plain shockwave it writes
 * a mix of *tangential* and radial offset (`uTwist`), so the frame is wrung
 * round the rewind head like a clock spring rather than only pushed.
 */
const WARP_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vP;
  void main() {
    vP = position.xy * 2.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uFront;
  uniform float uWidth;
  uniform float uTwist;
  uniform float uSign;
  uniform float uSeed;
  uniform float uShaderIntensity;
  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    if (r > 1.0 || r < 1e-3) discard;
    float wob = snoise(vec3(vP * 3.0, uTime * 2.5 + uSeed)) * 0.06;
    float d = r - uFront + wob;
    float window = exp(-(d * d) / max(uWidth, 1e-3)) * (1.0 - smoothstep(0.82, 1.0, r));
    float strength = uStrength * uShaderIntensity * window;
    if (strength < 0.002) discard;
    vec2 radial = vP / r;
    vec2 tangent = vec2(-radial.y, radial.x);
    vec2 dir = normalize(mix(radial * uSign, tangent, clamp(uTwist, 0.0, 1.0)) + 1e-4);
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, window);
  }
`;

export function createRecallWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 2 },
      uStrength: { value: 0 },
      uFront: { value: 0.5 },
      uWidth: { value: 0.05 },
      uTwist: { value: 0.6 },
      uSign: { value: 1 },
      uSeed: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} state { size, strength, front, width, twist, sign, seed } */
  material.userData.sync = (state) => {
    const u = material.uniforms;
    u.uSize.value = state.size;
    u.uStrength.value = state.strength * settings.global.distortion;
    u.uFront.value = state.front;
    u.uWidth.value = state.width;
    u.uTwist.value = state.twist;
    u.uSign.value = state.sign;
    u.uSeed.value = state.seed;
  };

  return material;
}
