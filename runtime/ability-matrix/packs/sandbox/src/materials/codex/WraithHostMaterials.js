import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Wraith Host — the three bespoke shaders the host is drawn with.
 *
 *  - **the pool** — a floor quad shaded as a disc of shadow that spreads open
 *    with a fingered edge. Normal-blended, so it is genuinely *dark*: domain-
 *    warped fbm churning in a slow vortex toward a deeper middle, a thin pale
 *    rim, and a ring of procedural runes (three hashed strokes per cell, an
 *    SDF each) that light in order round the ring and waver.
 *  - **the shade** — one instanced, procedurally built hooded cloak
 *    (`createWraithGeometry`) per wraith. Additive and double-sided, so the
 *    far wall shows through the near one and the figure reads as a volume of
 *    light: a tight fresnel rim, a faint haze with wisps streaming down it, a
 *    hood whose hollow is dark with two cold points of eyes in it, and a hem
 *    torn into tatters on a noise threshold. In the vertex stage the hem
 *    billows, flares and trails out behind the motion. Each instance carries
 *    its own fade, dissolve, trail and wail in `aState`, so the CPU never
 *    touches a uniform per wraith. The dissolve takes the hem first and climbs
 *    to the hood — the shade goes *up* into smoke.
 *  - **the wail** — a camera-facing disc on `LAYER.DISTORTION` over the circle:
 *    rings of pressure running outward from the host each time it screams.
 *
 * Every material reads `settings.wraiths` in `userData.sync(state)`.
 */

/* -------------------------------------------------------------------- */
/* The pool                                                              */
/* -------------------------------------------------------------------- */

const POOL_VERTEX = /* glsl */ `
  uniform float uQuad;      // metres across the quad

  varying vec2 vLocal;      // metres from the centre, on the floor

  void main() {
    // A unit quad scaled here, not on the mesh, so the size follows the sliders.
    vec3 p = position * uQuad;
    vLocal = p.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;      // fully open radius, metres
  uniform float uOpen;        // 0..1
  uniform float uEdgeNoise;
  uniform float uEdgeScale;
  uniform float uFeather;
  uniform float uOpacity;
  uniform float uRoil;
  uniform float uRoilScale;
  uniform float uFlow;        // integrated on the CPU
  uniform float uSwirl;
  uniform float uDepth;
  uniform float uRim;
  uniform float uRimGlow;
  uniform float uRuneR;
  uniform float uRuneW;
  uniform float uRuneCount;
  uniform float uRuneStroke;
  uniform float uRuneGlow;
  uniform float uRuneLit;     // 0..1 round the ring
  uniform float uRuneAngle;
  uniform float uRuneFlicker;
  uniform float uFade;
  uniform vec3  uColorDeep;
  uniform vec3  uColorMid;
  uniform vec3  uColorSwirl;
  uniform vec3  uColorRim;
  uniform vec3  uColorRune;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vLocal;

  ${noiseGLSL}

  float segment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    vec2 p = vLocal;
    float d = length(p);
    float ang = atan(p.y, p.x);

    // The fingered edge, opening with uOpen.
    float fingers = fbm3(vec3(cos(ang) * uEdgeScale, sin(ang) * uEdgeScale, uSeed + uFlow * 0.4)) * 0.5 + 0.5;
    float R = uRadius * uOpen * (1.0 + uEdgeNoise * (fingers - 0.5) * 2.0);
    float mask = 1.0 - smoothstep(R - max(uFeather, 0.01), R, d);
    if (mask < 0.003) discard;

    // A vortex: the darkness twists harder toward the middle.
    float twist = uSwirl / (0.35 + d / max(uRadius, 0.1));
    vec2 q = mat2(cos(twist), -sin(twist), sin(twist), cos(twist)) * p * uRoilScale;
    vec2 w = vec2(fbm3(vec3(q, uFlow + uSeed)), fbm3(vec3(q + 5.2, uFlow * 0.8 + uSeed)));
    float n = fbm3(vec3(q + w * 1.6 * uRoil, uFlow * 0.5)) * 0.5 + 0.5;
    float well = 1.0 - smoothstep(0.0, uRadius * 0.9, d);
    vec3 col = mix(uColorDeep, uColorMid, smoothstep(0.35, 0.8, n) * uShaderIntensity);
    col += uColorSwirl * pow(smoothstep(0.62, 0.95, n), 2.0) * 0.6 * uRoil;
    col *= 1.0 - uDepth * well * 0.8;

    // The pale rim, following the fingered edge.
    float rimW = max(uRim, 0.01);
    float rim = smoothstep(R - rimW * 2.5, R - rimW * 0.5, d) * (1.0 - smoothstep(R - rimW * 0.5, R + rimW * 0.3, d));
    col += uColorRim * rim * uRimGlow * uGlobalGlow * (0.6 + 0.4 * fingers);

    // The ring of runes.
    float rr = uRuneR * uRadius;
    float band = abs(d - rr);
    float inBand = 1.0 - smoothstep(uRuneW * 0.5, uRuneW * 0.5 + 0.02, band);
    float ringLines = (1.0 - smoothstep(0.0, uRuneStroke * 0.6, abs(band - uRuneW * 0.62)));
    float a01 = fract((ang - uRuneAngle) / 6.2831853);
    float cells = max(3.0, floor(uRuneCount));
    float cellF = a01 * cells;
    float cell = floor(cellF);
    // Cell-local coordinates in metres: across the ring and round it.
    float arc = 6.2831853 * rr / cells;
    vec2 cp = vec2((fract(cellF) - 0.5) * arc, d - rr);
    float sz = min(arc * 0.38, uRuneW * 0.42);
    float glyph = 1e3;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      vec2 h1 = hash21(cell * 7.13 + fk * 3.1 + uSeed) * 2.0 - 1.0;
      vec2 h2 = hash21(cell * 3.71 + fk * 5.7 + uSeed + 1.3) * 2.0 - 1.0;
      // Snap to a coarse grid so the strokes read as letters, not scribbles.
      h1 = floor(h1 * 2.0 + 0.5) / 2.0;
      h2 = floor(h2 * 2.0 + 0.5) / 2.0;
      glyph = min(glyph, segment(cp, h1 * sz, h2 * sz));
    }
    float stroke = 1.0 - smoothstep(uRuneStroke * 0.5, uRuneStroke, glyph);
    float lit = smoothstep(cell / cells - 0.02, cell / cells + 0.04, uRuneLit);
    float flick = 1.0 - uRuneFlicker * (0.5 + 0.5 * sin(uTime * 7.0 + cell * 2.3) * sin(uTime * 3.1 + cell));
    float rune = (stroke * inBand + ringLines * 0.6) * lit * flick * smoothstep(rr + uRuneW, rr + uRuneW + 0.3, R);
    col += uColorRune * rune * uRuneGlow * uGlobalGlow;

    float a = max(mask * uOpacity, rune);
    a = max(a, rim * mask);
    a *= uFade;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The pool of shadow. Normal blending: it has to darken the floor. */
export function createWraithPoolMaterial() {
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
      uQuad: { value: 10 },
      uSeed: { value: 0 },
      uRadius: { value: 4 },
      uOpen: { value: 0 },
      uEdgeNoise: { value: 0.22 },
      uEdgeScale: { value: 3 },
      uFeather: { value: 0.35 },
      uOpacity: { value: 0.95 },
      uRoil: { value: 1 },
      uRoilScale: { value: 0.55 },
      uFlow: { value: 0 },
      uSwirl: { value: 0.6 },
      uDepth: { value: 0.75 },
      uRim: { value: 0.12 },
      uRimGlow: { value: 1.6 },
      uRuneR: { value: 0.78 },
      uRuneW: { value: 0.34 },
      uRuneCount: { value: 14 },
      uRuneStroke: { value: 0.035 },
      uRuneGlow: { value: 2.4 },
      uRuneLit: { value: 0 },
      uRuneAngle: { value: 0 },
      uRuneFlicker: { value: 0.35 },
      uFade: { value: 1 },
      uColorDeep: { value: new Color() },
      uColorMid: { value: new Color() },
      uColorSwirl: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorRune: { value: new Color() }
    }),
    vertexShader: POOL_VERTEX,
    fragmentShader: POOL_FRAGMENT
  });

  /** @param {object} state { quad, radius, open, flow, runeLit, runeAngle, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.wraiths;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuad.value = state.quad;
    u.uSeed.value = state.seed;
    u.uRadius.value = state.radius;
    u.uOpen.value = state.open;
    u.uEdgeNoise.value = c.poolEdgeNoise * g.noiseStrength;
    u.uEdgeScale.value = c.poolEdgeScale * g.noiseFrequency;
    u.uFeather.value = c.poolFeather;
    u.uOpacity.value = Math.min(1, c.poolOpacity * g.opacity);
    u.uRoil.value = c.poolRoil * g.turbulence;
    u.uRoilScale.value = c.poolRoilScale * g.noiseFrequency;
    u.uFlow.value = state.flow;
    u.uSwirl.value = c.poolSwirl;
    u.uDepth.value = c.poolDepth;
    u.uRim.value = c.poolRim;
    u.uRimGlow.value = c.poolRimGlow * g.glow;
    u.uRuneR.value = c.runeRadius;
    u.uRuneW.value = c.runeWidth;
    u.uRuneCount.value = Math.round(c.runeCount);
    u.uRuneStroke.value = c.runeStroke;
    u.uRuneGlow.value = c.runeGlow * g.glow;
    u.uRuneLit.value = state.runeLit;
    u.uRuneAngle.value = state.runeAngle;
    u.uRuneFlicker.value = c.runeFlicker * g.randomness;
    u.uFade.value = state.fade;
    u.uColorDeep.value.copy(getColor(c.colorPoolDeep));
    u.uColorMid.value.copy(getColor(c.colorPoolMid));
    u.uColorSwirl.value.copy(getColor(c.colorPoolSwirl));
    u.uColorRim.value.copy(getColor(c.colorPoolRim));
    u.uColorRune.value.copy(getColor(c.colorRune));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The shade                                                             */
/* -------------------------------------------------------------------- */

const WRAITH_VERTEX = /* glsl */ `
  attribute vec2  aCloak;   // x: bearing -1..1 (0 ahead), y: 0 crown .. 1 hem
  attribute float aSeed;
  attribute vec4  aState;   // x: fade, y: dissolve, z: trail (m), w: wail

  uniform float uTime;
  uniform float uPhase;
  uniform float uFlutter;
  uniform float uHemFlare;

  varying vec2  vCloak;
  varying vec3  vLocal;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  varying float vSeed;
  varying vec4  vState;

  ${noiseGLSL}

  void main() {
    vec3 p = position;
    float v = aCloak.y;
    float hem = v * v;
    float n = snoise(vec3(aCloak.x * 2.0, v * 3.0 - uPhase, aSeed * 7.0));

    // The cloak flares and billows below the shoulders; the hood stays put.
    float below = smoothstep(0.25, 1.0, v);
    p.xz *= 1.0 + uHemFlare * hem * (0.55 + 0.45 * n);
    p += normal * uFlutter * below * n * 2.0;
    // Trailing out behind the motion, waving as it goes.
    p.z -= aState.z * hem;
    p.y += aState.z * hem * 0.2;
    p.x += sin(v * 6.0 - uPhase * 2.0 + aSeed * 10.0) * 0.1 * below * (0.4 + aState.z * 0.5);
    // On a scream the hood is thrown back.
    p.z -= aState.w * 0.06 * (1.0 - smoothstep(0.0, 0.3, v));

    vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    vCloak = aCloak;
    vLocal = position;
    vSeed = aSeed;
    vState = aState;

    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const WRAITH_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uPhase;
  uniform float uBodyOpacity;
  uniform float uFresnelPower;
  uniform float uRimGlow;
  uniform float uWispScale;
  uniform float uWispFlow;    // integrated on the CPU
  uniform float uTatterDepth;
  uniform float uTatterScale;
  uniform float uEyeGlow;
  uniform float uEyeSize;
  uniform float uEyeSep;
  uniform float uEyeY;
  uniform float uWailEyes;
  uniform float uFaceDark;
  uniform float uSoftFade;
  uniform vec3  uColorRim;
  uniform vec3  uColorFray;
  uniform vec3  uColorBody;
  uniform vec3  uColorEye;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vCloak;
  varying vec3  vLocal;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  varying float vSeed;
  varying vec4  vState;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float bearing = vCloak.x;
    float v = vCloak.y;
    float fade = vState.x;
    float dissolve = vState.y;
    float wail = vState.w;

    // The tattered hem: ragged teeth round the bottom, torn deeper here and
    // there, moving a little as the cloth streams.
    float ca = cos(bearing * 3.14159265);
    float sa = sin(bearing * 3.14159265);
    float tn = fbm3(vec3(ca * uTatterScale * 0.5, sa * uTatterScale * 0.5, vSeed * 5.0 + uPhase * 0.25)) * 0.5 + 0.5;
    float teeth = abs(sin(bearing * 3.14159265 * floor(uTatterScale + 1.0) + vSeed * 9.0));
    float hemAt = 1.0 - uTatterDepth * (0.35 + 0.65 * tn) * mix(0.6, 1.0, teeth);
    if (v > hemAt) discard;
    float hemFade = 1.0 - smoothstep(hemAt - 0.18, hemAt, v);

    // Dissolving upward: the hem goes first, the hood last.
    float dn = fbm3(vLocal * 3.2 + vec3(0.0, -uTime * 0.9, vSeed * 3.0)) * 0.5 + 0.5;
    float field = (1.0 - v) * 0.6 + dn * 0.4;
    float thr = dissolve * 1.15 - 0.08;
    float keep = dissolve <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.07, field);
    float fray = dissolve <= 0.0 ? 0.0 : smoothstep(thr - 0.02, thr + 0.05, field) - smoothstep(thr + 0.05, thr + 0.16, field);

    // Fresnel: a ghost is mostly its outline.
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float fres = pow(1.0 - abs(dot(N, V)), max(uFresnelPower, 0.2));

    // Haze with wisps streaming down the cloak.
    float wisp = fbm3(vec3(ca * uWispScale * 0.6, v * uWispScale - uWispFlow, sa * uWispScale * 0.6 + vSeed)) * 0.5 + 0.5;
    float haze = uBodyOpacity * (0.25 + 0.75 * smoothstep(0.3, 0.85, wisp) * uShaderIntensity) * (1.0 - 0.45 * v);

    // The hollow of the hood, and the eyes in it.
    float front = smoothstep(0.35, 0.9, ca);
    float face = front * smoothstep(0.02, 0.06, v) * (1.0 - smoothstep(0.15, 0.2, v));
    vec2 e = vec2(abs(vLocal.x) - uEyeSep, vLocal.y - uEyeY);
    float es = max(uEyeSize, 0.004);
    float eye = exp(-dot(e, e) / (es * es)) * front * (1.0 + wail * uWailEyes);
    float eyeHalo = exp(-dot(e, e) / (es * es * 9.0)) * front * 0.25;

    float darkFace = 1.0 - face * uFaceDark;
    vec3 color = uColorBody * haze * darkFace
               + uColorRim * fres * uRimGlow * darkFace * (0.7 + 0.3 * wisp)
               + uColorEye * (eye * uEyeGlow + eyeHalo * uEyeGlow)
               + uColorFray * fray * 3.0;
    color *= uGlobalGlow;

    float mask = hemFade * keep * fade;
    if (mask < 0.003) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    gl_FragColor = vec4(color, clamp(mask, 0.0, 1.0));
  }
`;

/** The shade: additive, double-sided, one draw for the whole host. */
export function createWraithMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uPhase: { value: 0 },
      uFlutter: { value: 0.06 },
      uHemFlare: { value: 0.7 },
      uBodyOpacity: { value: 0.42 },
      uFresnelPower: { value: 2.2 },
      uRimGlow: { value: 2.4 },
      uWispScale: { value: 3 },
      uWispFlow: { value: 0 },
      uTatterDepth: { value: 0.34 },
      uTatterScale: { value: 5 },
      uEyeGlow: { value: 6 },
      uEyeSize: { value: 0.026 },
      uEyeSep: { value: 0.055 },
      uEyeY: { value: 0.5 },
      uWailEyes: { value: 0.8 },
      uFaceDark: { value: 0.9 },
      uSoftFade: { value: 0.35 },
      uColorRim: { value: new Color() },
      uColorFray: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorEye: { value: new Color() }
    }),
    vertexShader: WRAITH_VERTEX,
    fragmentShader: WRAITH_FRAGMENT
  });

  /** @param {object} state { phase, flow } */
  material.userData.sync = (state) => {
    const c = settings.wraiths;
    const g = settings.global;
    const u = material.uniforms;
    u.uPhase.value = state.phase;
    u.uFlutter.value = c.flutter * g.noiseStrength;
    u.uHemFlare.value = c.hemFlare;
    u.uBodyOpacity.value = c.bodyOpacity * g.opacity;
    u.uFresnelPower.value = c.fresnelPower;
    u.uRimGlow.value = c.rimGlow * g.fresnel;
    u.uWispScale.value = c.wispScale * g.noiseFrequency;
    u.uWispFlow.value = state.flow;
    u.uTatterDepth.value = c.tatterDepth;
    u.uTatterScale.value = c.tatterScale;
    u.uEyeGlow.value = c.eyeGlow * g.glow;
    u.uEyeSize.value = c.eyeSize;
    u.uEyeSep.value = c.eyeSeparation;
    u.uEyeY.value = c.eyeHeight;
    u.uWailEyes.value = c.wailEyes;
    u.uFaceDark.value = c.faceDark;
    u.uSoftFade.value = c.softFade;
    u.uColorRim.value.copy(getColor(c.colorA));
    u.uColorFray.value.copy(getColor(c.colorB));
    u.uColorBody.value.copy(getColor(c.colorBody));
    u.uColorEye.value.copy(getColor(c.colorEye));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The wail — LAYER.DISTORTION                                           */
/* -------------------------------------------------------------------- */

const WAIL_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uSize;

  varying vec2 vUv2;          // -1..1 across the disc

  void main() {
    vec4 mv = viewMatrix * vec4(uCentre, 1.0);
    mv.xy += position.xy * uSize;
    vUv2 = position.xy * 2.0;
    gl_Position = projectionMatrix * mv;
  }
`;

const WAIL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uRings;
  uniform float uClock;       // integrated scream phase
  uniform float uSeed;
  uniform float uShaderIntensity;

  varying vec2 vUv2;

  ${noiseGLSL}

  void main() {
    float r = length(vUv2);
    if (r > 1.0) discard;
    // Rings of pressure running outward, a new set on every scream.
    float wave = 0.0;
    float rings = max(1.0, floor(uRings));
    for (int i = 0; i < 6; i++) {
      if (float(i) >= rings) break;
      float k = fract(uClock - float(i) / rings);
      float d = (r - k) / 0.08;
      wave += exp(-d * d) * (1.0 - k);
    }
    float n = snoise(vec3(vUv2 * 3.0, uTime * 1.5 + uSeed));
    vec2 dir = normalize(vUv2 + 1e-5);
    vec2 offset = dir * (0.8 + 0.2 * n);
    float mask = smoothstep(1.0, 0.6, r) * smoothstep(0.0, 0.15, r);
    float strength = uStrength * uShaderIntensity * wave * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

/** The screams of the host, bending the air over the circle. */
export function createWraithWailMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uSize: { value: 5 },
      uStrength: { value: 0 },
      uRings: { value: 3 },
      uClock: { value: 0 },
      uSeed: { value: 0 }
    }),
    vertexShader: WAIL_VERTEX,
    fragmentShader: WAIL_FRAGMENT
  });

  /** @param {object} state { centre, size, strength, clock, seed } */
  material.userData.sync = (state) => {
    const c = settings.wraiths;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uSize.value = state.size;
    u.uStrength.value = state.strength * c.wailStrength * g.distortion;
    u.uRings.value = Math.round(c.wailRings);
    u.uClock.value = state.clock;
    u.uSeed.value = state.seed;
  };

  return material;
}
