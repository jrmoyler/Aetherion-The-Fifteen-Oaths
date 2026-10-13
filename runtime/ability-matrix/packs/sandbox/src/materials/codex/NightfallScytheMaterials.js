import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Nightfall Scythe — the four bespoke shaders the blade of night is drawn with.
 *
 *  - **the blade** — a parameter-space strip bent into a hooked scythe blade in
 *    the vertex stage (`bladeCentre` below). Normal-blended, because night has
 *    to *darken* what is behind it: an ink-black body with slow violet nebula
 *    swirls and a field of twinkling star flecks, a thin white-violet cutting
 *    line along the concave leading edge, and a back edge that is not an edge
 *    at all but smoke — eroded by streaming fbm so the blade frays into the
 *    black wake it sheds. It dissolves on a noise threshold with a violet fray.
 *  - **the sweep** — the arc the blade has just swept, a polar fan parented to
 *    the spinning blade so it trails it exactly. Additive: a violet smear of
 *    motion with a bright band along the path the tip took.
 *  - **the sweep's lens** — the same fan on `LAYER.DISTORTION`, pushing the
 *    world radially out from the hub where the blade has just been.
 *  - **the stain** — a ground strip down the line that exists only behind the
 *    hub: a ragged inky pool with a violet rim, a few cold stars in it, and a
 *    violet glow fresh behind the blade that cools away. Erodes on the fade.
 *
 * Every material reads `settings.nightfall` in `userData.sync(state)`; `state`
 * carries only what the ability knows that the settings do not (envelopes,
 * integrated phases, the extents of the stain).
 */

/* -------------------------------------------------------------------- */
/* The blade's shape — shared by the blade, its sweep and the lens       */
/* -------------------------------------------------------------------- */

/**
 * Blade-local frame: the hub at the origin, the spin plane XZ. A point at
 * rotation angle `a` and radius `r` is `(r cos a, y, -r sin a)` — which is
 * exactly where `rotation.y = a` sends local +X, so the spin is a plain
 * `rotation.y` on the mesh and the blade's leading side is +a.
 *
 * `NightfallScytheAbility#_bladeLocal` is the CPU copy (it sheds smoke off the
 * back edge and reaps along the front one), so the two change together.
 */
const BLADE_GLSL = /* glsl */ `
  uniform float uInner;   // heel radius, metres
  uniform float uReach;   // tip radius, metres
  uniform float uCurve;   // radians the blade hooks forward, heel to tip
  uniform float uWidth;   // depth of the blade at the heel
  uniform float uTaper;
  uniform float uHeel;
  uniform float uDroop;
  uniform float uForm;    // 0..1 forming
  uniform float uSpread;  // >= 1 while it comes apart

  float bladePhi(float u) {
    return uCurve * pow(max(u, 0.0), 1.6) * mix(0.3, 1.0, uForm);
  }

  float bladeRadius(float u) {
    return mix(uInner, uReach, u) * uSpread * mix(0.25, 1.0, uForm);
  }

  vec3 bladeCentre(float u) {
    float r = bladeRadius(u);
    float a = bladePhi(u);
    return vec3(r * cos(a), -uDroop * u * u, -r * sin(a));
  }

  float bladeWidth(float u) {
    float heel = 0.35 + 0.65 * smoothstep(0.0, max(uHeel, 0.001), u);
    return uWidth * uSpread * mix(0.2, 1.0, uForm) * pow(max(1.0 - u, 0.0), max(uTaper, 0.05)) * heel;
  }

  /** In-plane unit vector from the cutting edge toward the blade's back. */
  vec3 bladeBack(float u) {
    vec3 a = bladeCentre(max(u - 0.01, 0.0));
    vec3 b = bladeCentre(min(u + 0.01, 1.0));
    vec3 t = b - a;
    t.y = 0.0;
    t = normalize(t + vec3(1e-5, 0.0, 0.0));
    vec3 n = vec3(-t.z, 0.0, t.x);
    // The trailing side of a point turning about +Y is (-z, 0, x).
    vec3 c = bladeCentre(u);
    vec3 trail = vec3(-c.z, 0.0, c.x);
    return dot(n, trail) < 0.0 ? -n : n;
  }
`;

const BLADE_VERTEX = /* glsl */ `
  uniform float uFlutter;
  uniform float uPhase;
  uniform float uSeed;

  varying vec2  vBlade;    // x: 0 heel .. 1 tip, y: 0 cutting edge .. 1 back
  varying float vDepth;    // metres behind the cutting edge
  varying float vLen;      // metres along the blade
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}
  ${BLADE_GLSL}

  void main() {
    float u = position.x;
    float v = position.y;
    float w = bladeWidth(u);
    vec3 p = bladeCentre(u) + bladeBack(u) * w * v;
    // The smoky back of the blade billows; the edge stays rigid.
    p.y += uFlutter * v * v * snoise(vec3(u * 4.0, v * 2.0 - uPhase, uSeed));

    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
    vViewDir = cameraPosition - world.xyz;
    vBlade = vec2(u, v);
    vDepth = w * v;
    vLen = u * (uReach - uInner) * (1.0 + uCurve * 0.5);

    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const BLADE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uEdgeWidth;
  uniform float uEdgeGlow;
  uniform float uEdgeHalo;
  uniform float uBodyOpacity;
  uniform float uNebula;
  uniform float uNebulaScale;
  uniform float uStarDensity;
  uniform float uStarSize;
  uniform float uStarChance;
  uniform float uStarGlow;
  uniform float uStarTwinkle;
  uniform float uSmokeEdge;
  uniform float uSmokeScale;
  uniform float uFlow;        // integrated on the CPU so the slider never jumps
  uniform float uRimGlow;
  uniform float uSoftFade;
  uniform float uDissolve;    // 0 whole .. 1 gone
  uniform float uFade;
  uniform vec3  uColorEdge;
  uniform vec3  uColorHot;
  uniform vec3  uColorBody;
  uniform vec3  uColorNebula;
  uniform vec3  uColorStar;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vBlade;
  varying float vDepth;
  varying float vLen;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float u = vBlade.x;
    float v = clamp(vBlade.y, 0.0, 1.0);
    float d = vDepth;

    // 1 · the cutting line along the concave front: a hard core, a short halo.
    float ew = max(uEdgeWidth, 0.004);
    float core = 1.0 - smoothstep(ew * 0.3, ew, d);
    float halo = exp(-d / (ew * 3.5));
    // The point is the sharpest, brightest part of a scythe.
    float tipHeat = 0.7 + 0.6 * smoothstep(0.6, 1.0, u);

    // 2 · the back of the blade is smoke, streaming off it.
    float sn = fbm3(vec3(u * uSmokeScale * 3.0, v * uSmokeScale - uFlow, uSeed)) * 0.5 + 0.5;
    float smokeZone = smoothstep(1.0 - max(uSmokeEdge, 0.01), 1.0, v);
    float erosion = smokeZone * (0.55 + 0.9 * sn);
    float body = 1.0 - smoothstep(0.45, 1.0, erosion);
    // The heel frays too, so the blade has no hard square end.
    body *= smoothstep(0.0, 0.06, u + sn * 0.05);

    // 3 · the night inside it: nebula and stars that drift with the smoke.
    vec2 sp = vec2(vLen, d) * uNebulaScale;
    float neb = fbm3(vec3(sp, uTime * 0.15 + uSeed)) * 0.5 + 0.5;
    neb = smoothstep(0.35, 0.95, neb) * uNebula * uShaderIntensity;
    vec2 cell = voronoi2(vec2(vLen, d - uFlow * 0.08) * max(uStarDensity, 0.5) + uSeed);
    float lit = step(1.0 - uStarChance, cell.y);
    float twinkle = 0.55 + 0.45 * sin(uTime * uStarTwinkle + cell.y * 61.0);
    float star = (1.0 - smoothstep(0.0, max(uStarSize, 0.01), cell.x)) * lit * twinkle;

    // 4 · coming apart: a noise threshold that takes the back and the heel
    // first and the edge last, with a violet fray where it is going.
    float tearN = fbm3(vec3(u * 3.4, v * 2.6 - uTime * 1.4, uSeed + 3.0)) * 0.5 + 0.5;
    tearN = mix(tearN, tearN * 0.55 + (1.0 - v) * 0.45, 0.6);
    float thr = uDissolve * 1.3 - 0.12;
    float keep = uDissolve <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.06, tearN);
    float fray = uDissolve <= 0.0 ? 0.0 : smoothstep(thr - 0.02, thr + 0.06, tearN) - smoothstep(thr + 0.06, thr + 0.2, tearN);

    // 5 · edge-on, the plane is all rim.
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float rim = pow(1.0 - abs(dot(N, V)), 3.0) * uRimGlow;

    vec3 color = mix(uColorBody, uColorNebula, neb)
               + uColorStar * star * uStarGlow * (1.0 - smokeZone)
               + uColorEdge * halo * uEdgeHalo * uEdgeGlow * 0.3 * tipHeat
               + uColorHot * core * uEdgeGlow * tipHeat
               + uColorEdge * rim * (halo + 0.25)
               + uColorEdge * fray * 3.0;
    color *= uGlobalGlow;

    float alpha = max(body * uBodyOpacity, max(core, halo * 0.7));
    alpha = max(alpha, fray);
    alpha *= keep * uFade;
    if (alpha < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

const BLADE_DEFAULTS = () => ({
  uInner: { value: 0.45 },
  uReach: { value: 2.7 },
  uCurve: { value: 1.15 },
  uWidth: { value: 0.95 },
  uTaper: { value: 0.85 },
  uHeel: { value: 0.12 },
  uDroop: { value: 0.18 },
  uForm: { value: 1 },
  uSpread: { value: 1 }
});

/** The blade's shape uniforms, shared by all three materials that use it. */
function syncShape(u, state) {
  const c = settings.nightfall;
  u.uInner.value = Math.max(0, c.bladeInner);
  u.uReach.value = Math.max(c.bladeInner + 0.1, c.bladeReach);
  u.uCurve.value = c.bladeCurve;
  u.uWidth.value = Math.max(0.02, c.bladeWidth);
  u.uTaper.value = c.bladeTaper;
  u.uHeel.value = c.bladeHeel;
  u.uDroop.value = c.bladeDroop;
  u.uForm.value = state.form;
  u.uSpread.value = state.spread;
}

/** The blade of night: normal-blended, double-sided, bent in the vertex stage. */
export function createNightBladeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...BLADE_DEFAULTS(),
      uSeed: { value: 0 },
      uFlutter: { value: 0.08 },
      uPhase: { value: 0 },
      uEdgeWidth: { value: 0.055 },
      uEdgeGlow: { value: 5 },
      uEdgeHalo: { value: 0.9 },
      uBodyOpacity: { value: 0.94 },
      uNebula: { value: 0.75 },
      uNebulaScale: { value: 2.2 },
      uStarDensity: { value: 7 },
      uStarSize: { value: 0.11 },
      uStarChance: { value: 0.55 },
      uStarGlow: { value: 3 },
      uStarTwinkle: { value: 4 },
      uSmokeEdge: { value: 0.42 },
      uSmokeScale: { value: 2.6 },
      uFlow: { value: 0 },
      uRimGlow: { value: 1.2 },
      uSoftFade: { value: 0.35 },
      uDissolve: { value: 0 },
      uFade: { value: 1 },
      uColorEdge: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorNebula: { value: new Color() },
      uColorStar: { value: new Color() }
    }),
    vertexShader: BLADE_VERTEX,
    fragmentShader: BLADE_FRAGMENT
  });

  /** @param {object} state { form, spread, dissolve, phase, flow, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.nightfall;
    const g = settings.global;
    const u = material.uniforms;
    syncShape(u, state);
    u.uSeed.value = state.seed;
    u.uFlutter.value = 0.12 * g.noiseStrength;
    u.uPhase.value = state.phase;
    u.uEdgeWidth.value = c.edgeWidth;
    u.uEdgeGlow.value = c.edgeGlow * g.glow;
    u.uEdgeHalo.value = c.edgeHalo;
    u.uBodyOpacity.value = Math.min(1, c.bodyOpacity * g.opacity);
    u.uNebula.value = c.nebula;
    u.uNebulaScale.value = c.nebulaScale * g.noiseFrequency;
    u.uStarDensity.value = c.starDensity;
    u.uStarSize.value = c.starSize;
    u.uStarChance.value = c.starChance;
    u.uStarGlow.value = c.starGlow * g.glow;
    u.uStarTwinkle.value = c.starTwinkle * g.animationSpeed;
    u.uSmokeEdge.value = c.smokeEdge;
    u.uSmokeScale.value = c.smokeScale * g.noiseFrequency;
    u.uFlow.value = state.flow;
    u.uRimGlow.value = c.rimGlow * g.fresnel;
    u.uSoftFade.value = c.softFade;
    u.uDissolve.value = state.dissolve;
    u.uFade.value = state.fade;
    u.uColorEdge.value.copy(getColor(c.colorA));
    u.uColorHot.value.copy(getColor(c.colorB));
    u.uColorBody.value.copy(getColor(c.colorBody));
    u.uColorNebula.value.copy(getColor(c.colorNebula));
    u.uColorStar.value.copy(getColor(c.colorStar));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The sweep — and its lens                                              */
/* -------------------------------------------------------------------- */

/**
 * A raw unit plane (x 0..1 behind the blade, y 0..1 heel to tip) wrapped into
 * a polar fan *behind* the blade's leading edge. Parented to the spinning
 * blade, so "behind" is simply a smaller rotation angle.
 */
const SWEEP_VERTEX = /* glsl */ `
  uniform float uArc;

  varying vec2 vSweep;      // x: 0 at the blade .. 1 oldest, y: 0 heel .. 1 tip
  varying vec2 vRadial;     // outward from the hub, in view space (lens only)
  varying vec3 vWorld;
  varying float vViewZ;

  ${BLADE_GLSL}

  void main() {
    float a = position.x;
    float u = position.y;
    vec3 c = bladeCentre(u);
    float r = length(c.xz) * (1.0 + 0.04 * u);
    float ang = bladePhi(u) - a * uArc;
    vec3 p = vec3(r * cos(ang), c.y, -r * sin(ang));

    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vSweep = vec2(a, u);
    vec3 radial = normalize(mat3(modelMatrix) * vec3(cos(ang), 0.0, -sin(ang)));
    vRadial = (viewMatrix * vec4(radial, 0.0)).xy;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SWEEP_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uEdge;
  uniform float uFalloff;
  uniform float uNoise;
  uniform float uScale;
  uniform float uFade;
  uniform float uSoftFade;
  uniform vec3  uColorBody;
  uniform vec3  uColorEdge;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;

  varying vec2 vSweep;
  varying vec2 vRadial;
  varying vec3 vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float a = clamp(vSweep.x, 0.0, 1.0);
    float u = clamp(vSweep.y, 0.0, 1.0);

    float age = pow(1.0 - a, max(uFalloff, 0.05));
    // Soft against the blade itself, so the fan does not draw a hard line on it.
    float lead = smoothstep(0.0, 0.035, a);
    float e = max(uEdge, 0.01);
    float tip = exp(-(1.0 - u) * (1.0 - u) / (e * e));
    float heel = smoothstep(0.0, 0.25, u);

    // Smoke streaks, smeared along the arc — the direction of motion.
    float n = fbm3(vec3(a * uScale * 4.0 + uTime * 0.7, u * uScale * 1.5, uSeed)) * 0.5 + 0.5;
    float smoke = mix(1.0, smoothstep(0.25, 0.85, n), clamp(uNoise, 0.0, 1.0));

    vec3 color = uColorBody * heel * smoke * 0.55 + uColorEdge * tip * (0.6 + 0.4 * n) * 1.6;
    float mask = age * lead * uFade * uOpacity * (heel * smoke * 0.55 + tip);
    if (mask < 0.003) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    gl_FragColor = vec4(color * uGlow * uGlobalGlow, clamp(mask, 0.0, 1.0));
  }
`;

/** The arc the blade has just cut through the air. Additive. */
export function createNightSweepMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...BLADE_DEFAULTS(),
      uArc: { value: 2.6 },
      uSeed: { value: 0 },
      uOpacity: { value: 0.8 },
      uGlow: { value: 2 },
      uEdge: { value: 0.12 },
      uFalloff: { value: 1.7 },
      uNoise: { value: 0.7 },
      uScale: { value: 2.4 },
      uFade: { value: 1 },
      uSoftFade: { value: 0.3 },
      uColorBody: { value: new Color() },
      uColorEdge: { value: new Color() }
    }),
    vertexShader: SWEEP_VERTEX,
    fragmentShader: SWEEP_FRAGMENT
  });

  /** @param {object} state the blade's state plus { trailFade } */
  material.userData.sync = (state) => {
    const c = settings.nightfall;
    const g = settings.global;
    const u = material.uniforms;
    syncShape(u, state);
    u.uArc.value = Math.max(0.05, c.trailArc);
    u.uSeed.value = state.seed;
    u.uOpacity.value = c.trailOpacity * g.opacity;
    u.uGlow.value = c.trailGlow * g.glow;
    u.uEdge.value = c.trailEdge;
    u.uFalloff.value = c.trailFalloff;
    u.uNoise.value = c.trailNoise * g.noiseStrength;
    u.uScale.value = c.trailScale * g.noiseFrequency;
    u.uFade.value = state.trailFade;
    u.uSoftFade.value = c.softFade;
    u.uColorBody.value.copy(getColor(c.colorTrail));
    u.uColorEdge.value.copy(getColor(c.colorTrailEdge));
  };

  return material;
}

const LENS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uShaderIntensity;

  varying vec2 vSweep;
  varying vec2 vRadial;
  varying vec3 vWorld;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float a = clamp(vSweep.x, 0.0, 1.0);
    float u = clamp(vSweep.y, 0.0, 1.0);
    // Strongest right behind the blade and toward its tip, where it is fastest.
    float mask = pow(1.0 - a, 2.0) * smoothstep(0.0, 0.5, u) * smoothstep(0.0, 0.05, a);
    vec3 np = vec3(vWorld.xz * uScale, uTime * uSpeed + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(17.1, 5.3, 29.7)));
    vec2 dir = normalize(vRadial + 1e-5);
    vec2 offset = dir * 0.65 + n * 0.35;
    float len = length(offset);
    if (len > 1.0) offset /= len;
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

/** The bend the sweep leaves in the air. `LAYER.DISTORTION`. */
export function createNightLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...BLADE_DEFAULTS(),
      uArc: { value: 2.6 },
      uStrength: { value: 1 },
      uScale: { value: 2 },
      uSpeed: { value: 2 },
      uSeed: { value: 0 }
    }),
    vertexShader: SWEEP_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  material.userData.sync = (state) => {
    const c = settings.nightfall;
    const g = settings.global;
    const u = material.uniforms;
    syncShape(u, state);
    u.uArc.value = Math.max(0.05, c.trailArc * 0.7);
    u.uStrength.value = state.trailFade * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
    u.uSeed.value = state.seed;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The stain                                                             */
/* -------------------------------------------------------------------- */

const STAIN_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uWidth;
  uniform float uLift;

  varying vec2 vFlat;       // x: metres across, y: metres along

  void main() {
    float across = position.x * uWidth;
    float along = (position.y + 0.5) * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = uLift;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const STAIN_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uCutEnd;      // metres of the stain laid so far
  uniform float uBladeAt;     // where the hub is, metres along
  uniform float uHalf;        // half-width, metres
  uniform float uEdgeNoise;
  uniform float uEdgeScale;
  uniform float uOpacity;
  uniform float uRim;
  uniform float uRimGlow;
  uniform float uStars;
  uniform float uStarGlow;
  uniform float uHot;
  uniform float uHotLength;
  uniform float uHeat;        // 1 while the blade is cutting, cools after
  uniform float uErode;
  uniform float uFadeT;
  uniform vec3  uColorDeep;
  uniform vec3  uColorMid;
  uniform vec3  uColorRim;
  uniform vec3  uColorStar;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    float x = vFlat.x;
    float along = vFlat.y;
    if (along < 0.0 || along > uCutEnd + 0.6) discard;

    // A ragged edge that pinches and swells as it runs.
    float swell = fbm3(vec3(along * uEdgeScale, uSeed, 0.0)) * 0.5 + 0.5;
    float open = smoothstep(0.0, 1.2, along) * (1.0 - smoothstep(uCutEnd - 0.2, uCutEnd + 0.6, along));
    float edgeN = fbm3(vec3(x * 1.7, along * uEdgeScale * 2.2, uSeed * 1.3)) * uEdgeNoise * uHalf * 0.5;
    float hw = uHalf * mix(0.6, 1.0, swell) * open;
    float d = abs(x) + edgeN;
    float body = 1.0 - smoothstep(hw * 0.72, hw, d);
    float rimW = max(uRim, 0.01);
    float rim = smoothstep(hw - rimW * 1.6, hw - rimW * 0.3, d) * (1.0 - smoothstep(hw - rimW * 0.3, hw + rimW * 0.4, d));

    // Inky inside, with slow darker currents.
    float swirl = fbm3(vec3(x * 1.2, along * 0.6 - uTime * 0.1, uSeed + 7.0)) * 0.5 + 0.5;
    vec3 col = mix(uColorDeep, uColorMid, smoothstep(0.3, 0.9, swirl) * 0.8);

    // A few cold stars sunk in it.
    vec2 cell = voronoi2(vec2(x, along) * max(uStars, 0.2) + uSeed);
    float star = (1.0 - smoothstep(0.0, 0.09, cell.x)) * step(0.72, cell.y) * (0.5 + 0.5 * sin(uTime * 3.0 + cell.y * 50.0));

    // Fresh behind the blade, a violet heat down the middle that cools.
    float behind = max(uBladeAt - along, 0.0);
    float hot = exp(-behind / max(uHotLength, 0.05)) * uHeat * (1.0 - smoothstep(0.0, hw * 0.9 + 0.01, abs(x))) * open;

    col += uColorStar * star * uStarGlow * body * uGlobalGlow;
    col += uColorRim * (rim * uRimGlow + hot * uHot) * uGlobalGlow;
    float a = max(body * uOpacity, rim * 0.9);
    a = max(a, hot * 0.6);

    // Eaten from the edges in as the cast fades.
    float n = snoise(vec3(x * 2.4, along * 0.9, uSeed * 3.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float keepN = mix(0.55, n * 0.7 + (1.0 - d / max(uHalf, 0.01)) * 0.3, uErode);
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, keepN);
    a *= vis;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The shadow-stain down the floor. Normal blending: it has to be *dark*. */
export function createNightStainMaterial() {
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
      uDir: { value: new Vector3() },
      uSide: { value: new Vector3() },
      uLength: { value: 10 },
      uWidth: { value: 4 },
      uLift: { value: 0.014 },
      uSeed: { value: 0 },
      uCutEnd: { value: 0 },
      uBladeAt: { value: 0 },
      uHalf: { value: 1.5 },
      uEdgeNoise: { value: 0.5 },
      uEdgeScale: { value: 0.7 },
      uOpacity: { value: 0.86 },
      uRim: { value: 0.14 },
      uRimGlow: { value: 2 },
      uStars: { value: 3.5 },
      uStarGlow: { value: 2 },
      uHot: { value: 3 },
      uHotLength: { value: 3 },
      uHeat: { value: 1 },
      uErode: { value: 0.7 },
      uFadeT: { value: 0 },
      uColorDeep: { value: new Color() },
      uColorMid: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorStar: { value: new Color() }
    }),
    vertexShader: STAIN_VERTEX,
    fragmentShader: STAIN_FRAGMENT
  });

  /** @param {object} state { start, dir, side, length, cutEnd, bladeAt, heat, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings.nightfall;
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.1, state.length);
    u.uHalf.value = Math.max(0.05, c.stainWidth);
    u.uWidth.value = 2 * (Math.max(0.05, c.stainWidth) * (1 + c.stainEdgeNoise) + c.stainRim + 0.3);
    u.uSeed.value = state.seed;
    u.uCutEnd.value = state.cutEnd;
    u.uBladeAt.value = state.bladeAt;
    u.uEdgeNoise.value = c.stainEdgeNoise * g.noiseStrength;
    u.uEdgeScale.value = c.stainEdgeScale * g.noiseFrequency;
    u.uOpacity.value = c.stainOpacity * g.opacity;
    u.uRim.value = c.stainRim;
    u.uRimGlow.value = c.stainRimGlow * g.glow;
    u.uStars.value = c.stainStars;
    u.uStarGlow.value = c.stainStarGlow * g.glow;
    u.uHot.value = c.stainHot * g.glow;
    u.uHotLength.value = c.stainHotLength;
    u.uHeat.value = state.heat;
    u.uErode.value = c.stainErode;
    u.uFadeT.value = state.fadeT;
    u.uColorDeep.value.copy(getColor(c.colorStainDeep));
    u.uColorMid.value.copy(getColor(c.colorStainMid));
    u.uColorRim.value.copy(getColor(c.colorStainRim));
    u.uColorStar.value.copy(getColor(c.colorStainStar));
  };

  return material;
}
