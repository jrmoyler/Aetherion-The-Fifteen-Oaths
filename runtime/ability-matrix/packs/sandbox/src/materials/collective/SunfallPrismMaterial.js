import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  NormalBlending,
  ShaderMaterial,
  Vector3
} from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/** Spectral beams the shaders are compiled for. The ability clamps to this. */
export const MAX_BEAMS = 8;

/** HSV → RGB, shared by every shader in this file. */
const HSV_GLSL = /* glsl */ `
  vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  }
`;

/* ====================================================================== */
/* The glass                                                               */
/* ====================================================================== */

/**
 * The prism — glass that splits light, which is the whole ability in one mesh.
 *
 * A raw ShaderMaterial rather than a patched standard one, because what makes
 * it read as a prism is not lighting, it is **what it does to the light behind
 * it**, and that is cheaper to fake outright than to coax out of PBR:
 *
 *   - **refraction with dispersion** — the view ray is bent through the facet
 *     three times, once per channel, at three slightly different indices of
 *     refraction (`uDispersion`), and each bent ray samples the sky probe
 *     (`frame.uEnvMap`). Where the facets are steep the three samples land on
 *     different parts of the sky and the stone fringes red on one side and
 *     violet on the other — the one thing a prism has to do.
 *   - **reflection** — the mirrored ray samples the same probe, weighted by a
 *     Schlick-ish fresnel, so the grazing facets go to sky and the head-on
 *     ones stay clear.
 *   - **inner fire** — spectral flashes caught in the internal facets: noise in
 *     the stone's *local* space (so the fire turns with it), mapped through a
 *     hue ramp and sharpened so only the brightest knots survive.
 *   - **facet edges** — a barycentric attribute (`aEdge`) marks the real edges
 *     of the solid, which are drawn as thin bright lines. Cut glass is mostly
 *     edges; without them a bipyramid at fifteen metres reads as a blob.
 *   - **the charge** — while the strike beam is in it, the whole stone is
 *     flooded white from the inside (`uCharge`), past 1 so bloom takes it.
 *
 * Until the probe has loaded `uHasEnv` is 0 and a vertical gradient between the
 * two glass colours stands in for the sky.
 */
const GLASS_VERTEX = /* glsl */ `
  attribute vec3 aEdge;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying vec3  vEdge;

  void main() {
    vLocal = position;
    vEdge = aEdge;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const GLASS_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform sampler2D uEnvMap;
  uniform float uHasEnv;
  uniform float uEnvIntensity;
  uniform float uOpacity;
  uniform float uFresnel;
  uniform float uFresnelPower;
  uniform float uDispersion;
  uniform float uRefraction;
  uniform float uInnerFire;
  uniform float uInnerScale;
  uniform float uCharge;
  uniform float uFade;
  uniform vec3  uColorGlass;
  uniform vec3  uColorDeep;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying vec3  vEdge;

  ${noiseGLSL}
  ${HSV_GLSL}

  const float PI = 3.14159265359;

  /** The sky probe in a direction — or a stand-in until it has loaded. */
  vec3 sky(vec3 dir) {
    vec3 fallback = mix(uColorDeep, uColorGlass, dir.y * 0.5 + 0.5);
    vec2 uv = vec2(atan(dir.z, dir.x) / (2.0 * PI) + 0.5, asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5);
    vec3 env = min(texture2D(uEnvMap, uv).rgb, vec3(8.0));
    return mix(fallback, env, uHasEnv) * uEnvIntensity;
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    float fres = clamp(uFresnel * pow(1.0 - ndv, uFresnelPower), 0.0, 1.0);

    // Reflection.
    vec3 refl = sky(reflect(-V, N));

    // Refraction, once per channel. The bend is exaggerated by uRefraction so
    // the dispersion is visible at gameplay distance.
    vec3 I = -V;
    float base = 1.0 / (1.0 + 0.5 * uRefraction);
    float d = 0.06 * uDispersion;
    vec3 tR = refract(I, N, base + d);
    vec3 tG = refract(I, N, base);
    vec3 tB = refract(I, N, base - d);
    vec3 through = vec3(sky(tR).r, sky(tG).g, sky(tB).b);
    // Thicker head-on: tint toward the deep colour where the path is long.
    through *= mix(uColorDeep, uColorGlass, 0.35 + 0.65 * (1.0 - ndv));

    // Inner fire: spectral knots in local space, turning with the stone.
    vec3 lp = vLocal * uInnerScale + vec3(uSeed);
    float knot = pow(snoise01(lp + vec3(0.0, uTime * 0.35, 0.0)), 6.0) * 3.0;
    float hue = fract(dot(vLocal, vec3(1.3, 2.1, 0.7)) * 0.8 + uTime * 0.12 + uSeed);
    vec3 fire = hsv2rgb(vec3(hue, 0.85, 1.0)) * knot * uInnerFire * uShaderIntensity;

    // Facet edges: thin, anti-aliased, only on real edges of the solid.
    float e = min(vEdge.x, min(vEdge.y, vEdge.z));
    float edge = 1.0 - smoothstep(0.0, fwidth(e) * 1.6 + 1e-4, e);

    vec3 color = mix(through, refl, fres);
    color += fire;
    color += uColorRim * edge * (0.8 + uCharge) * uGlobalGlow;
    color += uColorRim * uCharge * (0.5 + 0.5 * (1.0 - ndv)) * uGlobalGlow;

    float alpha = clamp(uOpacity + fres * 0.45 + edge * 0.6 + uCharge * 0.3, 0.0, 1.0) * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createPrismGlassMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uSeed: { value: 0 },
      uHasEnv: { value: 0 },
      uEnvIntensity: { value: 1 },
      uOpacity: { value: 0.6 },
      uFresnel: { value: 1.8 },
      uFresnelPower: { value: 2.6 },
      uDispersion: { value: 0.6 },
      uRefraction: { value: 0.35 },
      uInnerFire: { value: 1.5 },
      uInnerScale: { value: 3 },
      uCharge: { value: 0 },
      uFade: { value: 1 },
      uColorGlass: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: GLASS_VERTEX,
    fragmentShader: GLASS_FRAGMENT
  });

  /** @param {object} state { charge, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.prism;
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = state.seed;
    u.uHasEnv.value = frame.uEnvMap.value ? 1 : 0;
    u.uEnvIntensity.value = c.envIntensity;
    u.uOpacity.value = c.glassOpacity * g.opacity;
    u.uFresnel.value = c.fresnel * g.fresnel;
    u.uFresnelPower.value = c.fresnelPower;
    u.uDispersion.value = c.dispersion;
    u.uRefraction.value = c.refraction;
    u.uInnerFire.value = c.innerFire * g.glow;
    u.uInnerScale.value = c.innerScale * g.noiseFrequency;
    u.uCharge.value = state.charge * c.chargeGlow * g.glow;
    u.uFade.value = state.fade;
    u.uColorGlass.value.copy(getColor(c.colorGlass));
    u.uColorDeep.value.copy(getColor(c.colorGlassDeep));
    u.uColorRim.value.copy(getColor(c.colorGlassRim));
  };

  return material;
}

/* ====================================================================== */
/* Beams                                                                   */
/* ====================================================================== */

/**
 * Light in a column — the sun shaft, the white strike and every spectral beam
 * are this one shader on `createBeamGeometry`.
 *
 * The mesh is an open cylinder from y = 0 (the **source** — the sky, or the
 * prism) to y = 1 (the **target**), scaled by the ability so Y is the length.
 * The radius is set here in metres and tapers from `uRadiusSource` to
 * `uRadiusTarget`, which is what turns one cylinder into a flaring shaft.
 *
 * Brightness is the chord rule, not the rim rule: a beam is a column of lit
 * air, densest through the middle, so the term is `pow(n·v, uCore)`. Motes of
 * dust drift through it as a slow noise, `uReach` lets it be drawn *out* of the
 * source over a few frames rather than appearing whole, and it is soft-faded
 * against scene depth so it pools into the floor instead of slicing it.
 */
const BEAM_VERTEX = /* glsl */ `
  uniform float uRadiusSource;
  uniform float uRadiusTarget;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vY;
  varying float vViewZ;

  void main() {
    float y = position.y;
    float r = mix(uRadiusSource, uRadiusTarget, y);
    vec3 p = vec3(position.x * r, y, position.z * r);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * vec3(position.x, 0.0, position.z));
    vY = y;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform vec3  uColor;
  uniform vec3  uColorCore;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uCore;
  uniform float uReach;
  uniform float uEndFade;
  uniform float uNoise;
  uniform float uNoiseScale;
  uniform float uNoiseSpeed;
  uniform float uFlicker;
  uniform float uSoftFade;
  uniform float uFade;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vY;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    if (vY > uReach) discard;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = abs(dot(N, V));
    float density = pow(ndv, max(uCore, 0.05));

    // Dust drifting down the beam.
    float n = snoise01(vWorld * uNoiseScale + vec3(0.0, uTime * uNoiseSpeed, uSeed));
    density *= mix(1.0, 0.45 + n * 1.1, uNoise);

    float flick = 1.0 + uFlicker * sin(uTime * 37.0 + uSeed * 9.0) * sin(uTime * 13.0 + uSeed);

    // Feather both ends, and the drawing tip.
    float ends = smoothstep(0.0, uEndFade, vY) * (1.0 - smoothstep(1.0 - uEndFade * 0.3, 1.0, vY));
    float tip = 1.0 - smoothstep(uReach - 0.04, uReach, vY);

    float alpha = density * ends * tip * uOpacity * uFade;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.002) discard;

    // White-hot through the middle, the beam's own hue at the edges.
    vec3 color = mix(uColor, uColorCore, pow(ndv, 6.0) * 0.7);
    color *= uIntensity * flick * uGlobalGlow;

    // AdditiveBlending is (SrcAlpha, One): alpha scales the colour once, there.
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * @param {'shaft'|'strike'|'spectral'} role
 */
export function createPrismBeamMaterial(role = 'spectral') {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: Math.random() * 10 },
      uRadiusSource: { value: 0.1 },
      uRadiusTarget: { value: 0.1 },
      uColor: { value: new Color(1, 1, 1) },
      uColorCore: { value: new Color(1, 1, 1) },
      uIntensity: { value: 1 },
      uOpacity: { value: 1 },
      uCore: { value: 2 },
      uReach: { value: 1 },
      uEndFade: { value: 0.1 },
      uNoise: { value: 0.5 },
      uNoiseScale: { value: 1.4 },
      uNoiseSpeed: { value: 1.5 },
      uFlicker: { value: 0.1 },
      uSoftFade: { value: 0.4 },
      uFade: { value: 1 }
    }),
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT
  });

  /**
   * @param {object} state { reach, fade, color (Color, spectral only) }
   */
  material.userData.sync = (state) => {
    const c = settings.prism;
    const g = settings.global;
    const u = material.uniforms;

    u.uReach.value = state.reach;
    u.uFade.value = state.fade;
    u.uNoiseScale.value = c.noiseScale * g.noiseFrequency;
    u.uNoiseSpeed.value = -c.noiseSpeed * g.noiseSpeed;

    if (role === 'shaft') {
      u.uRadiusSource.value = c.shaftTopRadius;
      u.uRadiusTarget.value = c.shaftRadius;
      u.uColor.value.copy(getColor(c.colorSun));
      u.uColorCore.value.copy(getColor(c.colorSun));
      u.uIntensity.value = c.shaftIntensity;
      u.uOpacity.value = c.shaftOpacity * g.opacity;
      u.uCore.value = c.shaftSoftness;
      u.uEndFade.value = 0.35;
      u.uNoise.value = 0.6 * g.noiseStrength;
      u.uFlicker.value = 0.03;
      u.uSoftFade.value = 1.2;
    } else if (role === 'lance') {
      // The heliograph: the thread of sun the caster throws ahead of the dart.
      u.uRadiusSource.value = c.lanceRadius * 0.4;
      u.uRadiusTarget.value = c.lanceRadius;
      u.uColor.value.copy(getColor(c.colorSun));
      u.uColorCore.value.copy(getColor(c.colorStrike));
      u.uIntensity.value = c.lanceIntensity;
      u.uOpacity.value = g.opacity;
      u.uCore.value = 1.6;
      u.uEndFade.value = 0.15;
      u.uNoise.value = 0.3 * g.noiseStrength;
      u.uFlicker.value = c.beamFlicker;
      u.uSoftFade.value = 0.2;
    } else if (role === 'strike') {
      u.uRadiusSource.value = c.strikeRadius * 1.6;
      u.uRadiusTarget.value = c.strikeRadius;
      u.uColor.value.copy(getColor(c.colorSun));
      u.uColorCore.value.copy(getColor(c.colorStrike));
      u.uIntensity.value = c.strikeIntensity;
      u.uOpacity.value = g.opacity;
      u.uCore.value = 1.4;
      u.uEndFade.value = 0.2;
      u.uNoise.value = 0.25 * g.noiseStrength;
      u.uFlicker.value = c.beamFlicker;
      u.uSoftFade.value = 0.2;
    } else {
      u.uRadiusSource.value = c.beamWidth * 0.55;
      u.uRadiusTarget.value = c.beamWidth;
      u.uColor.value.copy(state.color);
      u.uColorCore.value.copy(state.color).lerp(getColor(c.colorStrike), 0.55);
      u.uIntensity.value = c.beamIntensity;
      u.uOpacity.value = g.opacity;
      u.uCore.value = c.beamCore;
      u.uEndFade.value = 0.06;
      u.uNoise.value = 0.35 * g.noiseStrength;
      u.uFlicker.value = c.beamFlicker;
      u.uSoftFade.value = 0.25;
    }
  };

  return material;
}

/* ====================================================================== */
/* The scorch                                                              */
/* ====================================================================== */

/**
 * The spectrum burnt into the floor.
 *
 * One quad over the circle, drawn twice: a **char** pass (normal blending, the
 * dark burnt body of every line) and a **glow** pass (additive, the hot end of
 * each line where the beam has just been, in that beam's hue, plus the sun
 * pool under the shaft). Splitting them is what lets a line be both darker
 * than the floor and brighter than it at once.
 *
 * Every line is drawn *analytically* from the same sweep the ability uses to
 * aim the beams: beam `i` touches the floor at bearing
 * `phase[i] + sweep·p` and radius `R·mix(inner, outer, p)` for p in 0..1, a
 * spiral arc. For a floor point the shader inverts the bearing to the `p`
 * that would have passed through it, compares the radius it should have had,
 * and that difference is the distance to the line. Nothing is rasterised into
 * a buffer and nothing accumulates, so the lines are exact at any frame rate,
 * re-draw themselves when `sweepAngle` is dragged, and never alias.
 *
 * `uProgress` is how far along its arc each contact has got; behind it the
 * line cools over `uCool` metres from hot hue to char.
 */
const SCORCH_VERTEX = /* glsl */ `
  varying vec2 vLocal;
  void main() {
    // The quad is a unit square on the floor scaled to 2 × uExtent, unrotated,
    // so vLocal × uExtent is the world XZ offset from the centre.
    vLocal = position.xz * 2.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SCORCH_FRAGMENT = /* glsl */ `
  precision highp float;

  #define MAX_BEAMS ${MAX_BEAMS}

  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;
  uniform float uExtent;      // half-size of the quad, metres
  uniform int   uCount;
  uniform float uPhase[MAX_BEAMS];
  uniform vec3  uBeamColor[MAX_BEAMS];
  uniform float uSweep;
  uniform float uInner;
  uniform float uOuter;
  uniform float uProgress;
  uniform float uWidth;
  uniform float uWobble;
  uniform float uCool;
  uniform float uGlow;
  uniform float uHue;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uLive;        // 1 while the beams are on the floor
  uniform float uPool;        // sun pool strength
  uniform float uPoolRadius;  // metres
  uniform vec3  uColorChar;
  uniform vec3  uColorSun;
  uniform float uGlobalGlow;
  uniform float uField;       // 0..1 the glassed floor the sweep leaves
  uniform float uFieldReach;  // metres it has spread to
  uniform float uFieldGlow;
  uniform float uFieldOpacity;
  uniform float uFieldCells;
  uniform float uFieldSpin;

  varying vec2 vLocal;

  vec3 spectral(float h) {
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }

  ${noiseGLSL}

  const float TAU = 6.28318530718;

  void main() {
    vec2 q = vLocal * uExtent;           // metres from the centre
    float r = length(q);
    float ang = atan(q.y, q.x);

    float wob = snoise(vec3(q * 2.3, uSeed)) * uWobble;
    float arcLen = sqrt(uSweep * uSweep * uRadius * uRadius * 0.25 * (uInner + uOuter) * (uInner + uOuter)
                      + uRadius * uRadius * (uOuter - uInner) * (uOuter - uInner));

    float body = 0.0;
    vec3 hot = vec3(0.0);
    vec3 tint = vec3(0.0);

    for (int i = 0; i < MAX_BEAMS; i++) {
      if (i >= uCount) break;
      // Which p would have crossed this bearing (the sweep is less than a turn).
      float rel = ang - uPhase[i];
      float s = sign(uSweep);
      rel = mod(rel * s, TAU);
      float p = rel / max(abs(uSweep), 1e-3);
      if (p > uProgress) continue;
      float rp = uRadius * mix(uInner, uOuter, p);
      float d = abs(r - rp + wob);
      // Rounded start of the line.
      float line = 1.0 - smoothstep(uWidth * 0.55, uWidth, d);
      if (line <= 0.0) continue;

      // Heat: hottest where the beam is now, cooling behind it.
      float behind = (uProgress - p) * arcLen;
      float heat = exp(-behind / max(uCool, 0.01)) * uLive;
      // The core of a line is hotter than its edge.
      float core = 1.0 - smoothstep(0.0, uWidth * 0.6, d);

      body = max(body, line);
      hot += uBeamColor[i] * heat * core * line;
      tint += uBeamColor[i] * line;
    }

    // Sun pool under the shaft.
    float pool = (1.0 - smoothstep(uPoolRadius * 0.3, uPoolRadius, r)) * uPool;
    pool *= 0.75 + 0.25 * snoise01(vec3(q * 1.4, uTime * 0.6 + uSeed));

    // The glassed floor: everything the sweep has passed over is fused to a
    // dark mirror, crazed into cells whose edges throw the spectrum — the hue
    // turning with the bearing, so the floor keeps the fan's rainbow.
    float fieldIn = uField * (1.0 - smoothstep(uFieldReach - 0.35, uFieldReach, r));
    vec2 cell = voronoi2(q * uFieldCells / max(uRadius, 0.1) + uSeed);
    float craze = 1.0 - smoothstep(0.0, 0.09, cell.x);
    float rayAng = ang + uTime * uFieldSpin;
    float rays = pow(max(0.0, cos(rayAng * 9.0 + snoise(vec3(q * 0.6, uSeed)) * 2.0)), 18.0) * smoothstep(0.2, 1.2, r);
    vec3 caustic = spectral(fract(ang / TAU + cell.y * 0.15)) * (craze * 0.8 + rays * 0.6) * fieldIn;
    float edge = exp(-abs(r - uFieldReach) * 4.0) * uField * step(0.05, uFieldReach);

    #ifdef GLOW
      vec3 color = hot * uGlow + uColorSun * pool + (caustic + uColorSun * edge * 0.8) * uFieldGlow;
      color *= uGlobalGlow * uFade;
      if (max(color.r, max(color.g, color.b)) < 0.002) discard;
      gl_FragColor = vec4(color, 1.0);
    #else
      float glass = fieldIn * uFieldOpacity * (0.75 + 0.25 * cell.y);
      float alpha = max(body * uOpacity, glass) * uFade;
      if (alpha < 0.004) discard;
      // A cooled line keeps a stain of its colour; the rest is char. The
      // glassed floor is the char darkened further, the deep stop of the ramp.
      vec3 color = mix(uColorChar, uColorChar + tint * 0.35, uHue);
      color = mix(color, uColorChar * 0.45, glass * (1.0 - body));
      gl_FragColor = vec4(color, alpha);
    #endif
  }
`;

/**
 * @param {'char'|'glow'} role
 */
export function createPrismScorchMaterial(role = 'char') {
  const glow = role === 'glow';
  const phases = new Float32Array(MAX_BEAMS);
  const colors = [];
  for (let i = 0; i < MAX_BEAMS; i++) colors.push(new Vector3(1, 1, 1));

  const material = new ShaderMaterial({
    defines: glow ? { GLOW: '' } : {},
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: glow ? AdditiveBlending : NormalBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uRadius: { value: 3 },
      uExtent: { value: 4 },
      uCount: { value: 6 },
      uPhase: { value: phases },
      uBeamColor: { value: colors },
      uSweep: { value: 1.8 },
      uInner: { value: 0.15 },
      uOuter: { value: 1 },
      uProgress: { value: 0 },
      uWidth: { value: 0.15 },
      uWobble: { value: 0.05 },
      uCool: { value: 1.5 },
      uGlow: { value: 3 },
      uHue: { value: 0.5 },
      uOpacity: { value: 0.85 },
      uFade: { value: 1 },
      uLive: { value: 0 },
      uPool: { value: 0 },
      uPoolRadius: { value: 2 },
      uColorChar: { value: new Color() },
      uColorSun: { value: new Color() },
      uField: { value: 0 },
      uFieldReach: { value: 0 },
      uFieldGlow: { value: 1 },
      uFieldOpacity: { value: 0.6 },
      uFieldCells: { value: 6 },
      uFieldSpin: { value: 0.1 }
    }),
    vertexShader: SCORCH_VERTEX,
    fragmentShader: SCORCH_FRAGMENT
  });

  /**
   * @param {object} state { radius, extent, count, phases (Float32Array), colors (Color[]),
   *   progress, live, pool, fade, seed }
   */
  material.userData.sync = (state) => {
    const c = settings.prism;
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = state.seed;
    u.uRadius.value = state.radius;
    u.uExtent.value = state.extent;
    u.uCount.value = state.count;
    for (let i = 0; i < MAX_BEAMS; i++) {
      phases[i] = state.phases[i];
      const col = state.colors[i];
      colors[i].set(col.r, col.g, col.b);
    }
    u.uSweep.value = c.sweepAngle;
    u.uInner.value = c.sweepInner;
    u.uOuter.value = c.sweepOuter;
    u.uProgress.value = state.progress;
    u.uWidth.value = c.scorchWidth;
    u.uWobble.value = c.scorchWobble * g.noiseStrength;
    u.uCool.value = c.scorchCool;
    u.uGlow.value = c.scorchGlow * g.glow;
    u.uHue.value = c.scorchHue;
    u.uOpacity.value = c.scorchOpacity * g.opacity;
    u.uFade.value = state.fade;
    u.uLive.value = state.live;
    u.uPool.value = state.pool * c.poolIntensity;
    u.uPoolRadius.value = c.shaftRadius * c.poolRadius;
    u.uColorChar.value.copy(getColor(c.colorChar));
    u.uColorSun.value.copy(getColor(c.colorSun));
    u.uField.value = state.field ?? 0;
    u.uFieldReach.value = state.fieldReach ?? 0;
    u.uFieldGlow.value = c.fieldGlow * g.glow;
    u.uFieldOpacity.value = c.fieldOpacity * g.opacity;
    u.uFieldCells.value = c.fieldCells * g.noiseFrequency;
    u.uFieldSpin.value = c.fieldSpin * g.noiseSpeed;
  };

  return material;
}
