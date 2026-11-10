import {
  AdditiveBlending,
  Color,
  DoubleSide,
  NormalBlending,
  ShaderMaterial
} from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * The tornado's walls — one factory, three roles.
 *
 *  - **outer** — the dust shell. Normal blending, because a tornado is mostly
 *    *dirt*: it has to occlude the floor behind it, and an additive funnel is a
 *    pale ghost with no weight. Lit by `uLightDir` off a reconstructed normal.
 *  - **inner** — the wind shell. Additive, a little narrower, spinning the
 *    *other* way. The two shells shearing past each other is the whole read of
 *    rotation: one surface turning looks like a texture scrolling over a cone,
 *    two turning against each other look like air.
 *  - **devil** — the small dust devil that skims to the circle during travel.
 *    The outer shell's shader at a tenth of the size, with its own block of
 *    dimensions.
 *
 * ## Parameter-space vertices
 *
 * The mesh (`createFunnelGeometry`) carries a unit bearing in `position.xz`
 * and a 0..1 height fraction in `position.y`. Everything in metres happens
 * here: the flare curve, the rise, the axis snaking off true, the noise
 * rippling the wall, and the bottom-up collapse that pinches the funnel thin
 * as it dies. Nothing about the tornado's shape is baked, so every one of
 * those is a live slider.
 *
 * ## Where the alpha comes from
 *
 * Four terms, multiplied, each doing one job:
 *
 *   1. **facing ratio** — a thin shell of dust is densest where you look along
 *      it, at the silhouette, and thinnest head-on. That is the opposite of the
 *      glow-ball rule elsewhere in this project, and it is right here because
 *      a funnel really is a *shell*: its middle is the calm eye.
 *   2. **banded noise filaments** — ridged noise sampled on a cylinder whose
 *      bearing is wound by height (`uTwist`) and scrolled by the spin phase, so
 *      the filaments are spirals that climb as the column turns.
 *   3. **horizontal bands** — slow sine bands broken by noise, the stacked
 *      cloud rings every photograph of a twister has.
 *   4. **the edges** — feathered into the floor so it never cuts a hard ring
 *      where it meets the stone, feathered at the lip, soft-faded against scene
 *      depth, and eaten from the bottom up by the collapse.
 */
/**
 * The collapse edge needs the same noise in both stages (the vertex pinches,
 * the fragment fades), so it is a function of the inputs both stages have. In
 * the vertex stage it is evaluated per ring; the fragment re-derives it per
 * pixel for a crisp ragged line.
 */
const CUT_GLSL = /* glsl */ `
  float n2cut(vec2 bearing, float y, float v) {
    if (uCollapse <= 0.0) return 0.0;
    float soft = max(uCollapseSoft, 0.01);
    float jag = snoise(vec3(bearing * 1.7, y * 0.9 + uSeed * 3.0)) * uCollapseNoise;
    float front = uCollapse * (1.0 + soft + uCollapseNoise) - soft;
    return 1.0 - smoothstep(front, front + soft, v + jag);
  }
`;

/**
 * The helical cloud bands that wrap the column. A band is a stripe in
 * (bearing, height) space: `N` bands, each making `uSpiralTurns` turns from
 * foot to lip, carried round by the dust shell's own spin phase so the
 * rotation is read straight off the bands. Both stages need it (the vertex
 * rolls the band out of the wall, the fragment lights it), so it is shared.
 */
const SPIRAL_GLSL = /* glsl */ `
  float spiralBand(float wound, float v, float warp) {
    if (uSpiralBands < 0.5) return 0.0;
    float ph = floor(uSpiralBands + 0.5) * (wound + uSpiralTurns * 6.28318530718 * v) + warp;
    float s = 0.5 + 0.5 * sin(ph);
    float w = clamp(uSpiralWidth, 0.02, 0.98);
    return smoothstep(1.0 - w - 0.16, 1.0 - w + 0.16, s);
  }
`;

const FUNNEL_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uHeight;      // metres, already × the rise
  uniform float uBaseRadius;
  uniform float uTopRadius;
  uniform float uFlare;
  uniform float uSway;
  uniform float uSwayFreq;
  uniform float uSwayPhase;
  uniform float uWobble;
  uniform float uWobbleScale;
  uniform float uSpinPhase;   // radians, integrated on the CPU
  uniform float uRadiusScale; // inner shell vs outer
  uniform float uCollapse;    // 0..1 bottom-up thinning
  uniform float uCollapseSoft;
  uniform float uCollapseNoise;
  uniform float uBandFreq;
  uniform float uRisePhase;
  uniform float uBandBulge;   // how far each cloud band bulges out of the wall, fraction
  uniform float uSpiralBands;
  uniform float uSpiralTurns;
  uniform float uSpiralWidth;
  uniform float uSpiralBulge;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec2  vCyl;         // x: wound bearing, y: metres up
  varying vec2  vBearing;     // unwound unit bearing, for the collapse noise
  varying float vV;           // 0..1 up the funnel
  varying float vCut;         // how far the collapse has eaten this ring
  varying float vViewZ;

  ${noiseGLSL}
  ${CUT_GLSL}
  ${SPIRAL_GLSL}

  const float TAU = 6.28318530718;

  float funnelRadius(float v) {
    return mix(uBaseRadius, uTopRadius, pow(clamp(v, 0.0, 1.0), max(uFlare, 0.05)));
  }

  /** The axis, bent off true. Pinned at the floor so the funnel stays planted. */
  vec2 swayAt(float v) {
    float bend = uSway * pow(v, 1.3);
    float k = v * uSwayFreq * TAU;
    return bend * vec2(sin(k - uSwayPhase + uSeed), cos(k * 0.83 - uSwayPhase * 0.77 + uSeed * 1.7));
  }

  void main() {
    float v = position.y;
    vec2 bearing = position.xz;
    float theta = atan(bearing.y, bearing.x);
    float y = v * uHeight;

    // The collapse runs from the floor upward, with a ragged edge. Rings it has
    // reached pinch inward as well as fading, so the column visibly *thins*.
    float edge = n2cut(bearing, y, v);
    vCut = edge;

    float r = funnelRadius(v) * uRadiusScale;
    // Ripples in the wall, travelling with the spin so they read as gusts.
    float n = snoise(vec3(bearing * uWobbleScale * r * 0.6, y * uWobbleScale * 0.35 - uSpinPhase * 0.15 + uSeed));
    r *= 1.0 + n * uWobble;
    // Medium scale: the stacked cloud bands bulge out of the wall as rolls of
    // dust, climbing with the same phase the fragment bands use.
    float roll = smoothstep(-0.4, 0.9, sin(y * uBandFreq * 3.14159 + n * 1.2 - uRisePhase * 2.0));
    r *= 1.0 + uBandBulge * (roll - 0.5) * smoothstep(0.05, 0.25, v);
    // The helical bands roll out of the wall too, so the silhouette edge is
    // notched by them as they wind round — rotation reads at the outline.
    r *= 1.0 + uSpiralBulge * (spiralBand(theta + uSpinPhase, v, n * 0.8) - 0.4);
    r *= 1.0 - 0.6 * edge;

    vec2 off = swayAt(v);
    vec3 local = vec3(bearing.x * r + off.x, y, bearing.y * r + off.y);

    // Normal from the slope of the wall: d(radius)/d(height).
    float dv = 0.01;
    float dr = (funnelRadius(v + dv) - funnelRadius(max(v - dv, 0.0))) * uRadiusScale
             / max(uHeight * (v + dv - max(v - dv, 0.0)), 1e-3);
    vec3 nrm = normalize(vec3(bearing.x, -dr, bearing.y));

    vec4 world = modelMatrix * vec4(local, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * nrm);
    vViewDir = cameraPosition - world.xyz;
    vCyl = vec2(theta + uSpinPhase, y);
    vBearing = bearing;
    vV = v;

    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FUNNEL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uHeight;
  uniform float uTwist;
  uniform float uRisePhase;
  uniform float uBandScale;
  uniform float uStreak;
  uniform float uBandFreq;
  uniform float uBandContrast;
  uniform float uFilament;
  uniform float uFilamentSharp;
  uniform float uRimPower;
  uniform float uRim;
  uniform float uFloorFade;
  uniform float uTopFade;
  uniform float uSoftFade;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uGlow;
  uniform float uFilamentGlow;
  uniform float uLit;          // 1 for the dust shells, 0 for the wind shell
  uniform float uCollapse;
  uniform float uCollapseSoft;
  uniform float uCollapseNoise;
  uniform vec3  uColorBase;
  uniform vec3  uColorMid;
  uniform vec3  uColorTop;
  uniform vec3  uColorFilament;
  uniform vec3  uColorDeep;    // the storm-dark stop between filaments
  uniform float uDeepMix;      // 0..1 how far the gaps fall to it
  uniform float uBandDark;     // 0..1 how dark the gaps between cloud bands go
  uniform float uDensity;      // dust shell alpha multiplier — weight
  uniform float uSunLift;      // how much the sun-side of each band roll lifts up the ramp
  uniform float uBodyFloor;    // 0..1 the least opacity of the dust shell — a column, not a veil
  uniform float uSpiralBands;
  uniform float uSpiralTurns;
  uniform float uSpiralWidth;
  uniform float uSpiralContrast;
  uniform float uSpiralLight;
  uniform float uThroatDark;   // 0..1 how dark the inner wall seen through the lip goes
  uniform float uRimLight;     // backlit silhouette edge
  uniform vec3  uLightDir;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec2  vCyl;
  varying vec2  vBearing;
  varying float vV;
  varying float vCut;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}
  ${CUT_GLSL}
  ${SPIRAL_GLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = abs(dot(N, V));

    // 1 · facing ratio — densest edge-on.
    float rimTerm = pow(1.0 - ndv, max(uRimPower, 0.05));
    float density = mix(1.0, 0.3 + 0.9 * rimTerm, clamp(uRim, 0.0, 1.0));

    // 2 · spiral filaments: the bearing is wound by height, so ridged noise on
    // that cylinder runs in climbing spirals.
    float a = vCyl.x + vCyl.y * uTwist;
    float around = uBandScale * max(uStreak, 0.01);
    vec3 fp = vec3(cos(a) * around, sin(a) * around, vCyl.y * uBandFreq * 0.5 - uRisePhase + uSeed);
    float fil = ridged(fp, 4);
    fil = pow(clamp(fil * 1.15, 0.0, 1.0), max(uFilamentSharp, 0.1));
    float carve = mix(1.0, 0.25 + fil * 1.2, clamp(uFilament, 0.0, 1.0) * uShaderIntensity);

    // 3 · stacked cloud bands, broken up so they never read as rings.
    vec3 bp = vec3(cos(a) * uBandScale, sin(a) * uBandScale, vCyl.y * 0.6 - uRisePhase * 0.5);
    float wob = fbm3(bp) * 1.6;
    float bands = smoothstep(-0.4, 0.9, sin(vCyl.y * uBandFreq * 3.14159 + wob - uRisePhase * 2.0));
    float banded = mix(1.0, 0.35 + 0.9 * bands, clamp(uBandContrast, 0.0, 1.0));
    // 3b · the helical bands wrapping the column, broken by the same noise.
    float sb = spiralBand(vCyl.x, vV, wob * 0.7);
    float spiralK = clamp(uSpiralContrast, 0.0, 1.0);

    // 4 · the edges.
    float floorFade = smoothstep(0.0, max(uFloorFade, 0.01), vCyl.y);
    float topFade = 1.0 - smoothstep(1.0 - max(uTopFade, 0.01), 1.0, vV);
    float cut = max(vCut, n2cut(normalize(vBearing), vCyl.y, vV));

    float alpha = density * carve * banded * floorFade * topFade * (1.0 - cut) * uOpacity * uFade;
    if (alpha < 0.004 && uBodyFloor <= 0.0) discard;

    vec2 screenUV = gl_FragCoord.xy / uResolution;
    float soft = softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    alpha *= soft;
    if (alpha < 0.004 && uBodyFloor <= 0.0) discard;
    float envelope = floorFade * topFade * (1.0 - cut) * uOpacity * uFade * soft;

    // A key light off the reconstructed wall normal.
    float key = max(dot(N, normalize(uLightDir)), 0.0);
    vec3 color;
    if (uLit > 0.5) {
      // Dust shell: a four-stop ramp driven by how much light a patch of wall
      // catches — filaments and the lit side of each cloud band climb toward
      // the pale tint, everything between them falls to the storm-dark deep
      // stop. Height only nudges it, so the top is not a pale smear.
      float lit = clamp(fil * 1.3, 0.0, 1.0) * mix(1.0 - uBandDark, 1.0, bands);
      // The sun-side of every band roll catches light (so the column reads
      // against the night sky); the shadow side and the gaps stay storm-dark.
      float roll = smoothstep(0.2, 0.9, bands) * (0.3 + 0.7 * key);
      float t = clamp(0.06 + (0.25 + 0.75 * key) * lit * 0.85 + uSunLift * roll + 0.14 * vV + rimTerm * 0.14, 0.0, 1.0);
      // Helical bands: the gap between them falls toward the deep stop, the
      // band itself climbs the ramp on its sun side.
      t = t * (1.0 - spiralK * 0.6 * (1.0 - sb)) + uSpiralLight * sb * spiralK * (0.45 + 0.55 * key);
      t = clamp(t, 0.0, 1.0);
      t = mix(0.5, t, uDeepMix);
      if (t < 0.45) color = mix(uColorDeep, uColorMid, t / 0.45);
      else if (t < 0.82) color = mix(uColorMid, uColorTop, (t - 0.45) / 0.37);
      else color = mix(uColorTop, uColorFilament, (t - 0.82) / 0.18);
      // Dirt-dark where it scours the floor.
      color = mix(color, uColorBase * (0.5 + 0.5 * key), (1.0 - smoothstep(0.0, 0.28, vV)) * 0.85);
      // The inside of the funnel (the far wall, seen down the throat) is in
      // its own shadow: a dark hollow, never a pale cap.
      if (dot(N, V) < 0.0) color *= 1.0 - clamp(uThroatDark, 0.0, 1.0);
      // Backlit edge: dust thinning at the silhouette catches the sky, so the
      // outline of a dark column reads against a dark sky.
      color += mix(uColorTop, uColorFilament, sb) * pow(rimTerm, 2.5) * uRimLight * smoothstep(0.08, 0.35, vV);
      // Opaque enough everywhere to be a column of dirt, not a glass sheet.
      alpha = clamp(max(alpha * uDensity, uBodyFloor * envelope), 0.0, 1.0);
      if (alpha < 0.004) discard;
    } else {
      if (alpha < 0.004) discard;
      color = mix(uColorBase, uColorMid, smoothstep(0.0, 0.35, vV));
      color = mix(color, uColorTop, smoothstep(0.35, 1.0, vV));
      float lit = clamp(fil * 1.3, 0.0, 1.0) * mix(1.0 - uBandDark, 1.0, bands);
      color = mix(uColorDeep, color, mix(1.0, 0.18 + 0.82 * lit, uDeepMix));
      // On the wind shell the filaments *are* the light.
      color += uColorFilament * fil * uFilamentGlow * (0.4 + 0.6 * rimTerm);
    }
    // The dissolving edge of the collapse flares pale, like dust lit from behind.
    float edgeGlow = smoothstep(0.0, 0.5, cut) * (1.0 - smoothstep(0.5, 1.0, cut));
    color += uColorTop * edgeGlow * 0.8;

    color *= uGlow * mix(1.0, uGlobalGlow, 1.0 - uLit);
    alpha = clamp(alpha, 0.0, 1.0);

    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * @param {'outer'|'inner'|'devil'} role
 */
export function createFunnelMaterial(role = 'outer') {
  const additive = role === 'inner';

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: additive ? AdditiveBlending : NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: Math.random() * 10 },
      uHeight: { value: 8 },
      uBaseRadius: { value: 0.5 },
      uTopRadius: { value: 3 },
      uFlare: { value: 2 },
      uSway: { value: 0.8 },
      uSwayFreq: { value: 1.5 },
      uSwayPhase: { value: 0 },
      uWobble: { value: 0.1 },
      uWobbleScale: { value: 1.5 },
      uSpinPhase: { value: 0 },
      uRadiusScale: { value: 1 },
      uCollapse: { value: 0 },
      uCollapseSoft: { value: 0.2 },
      uCollapseNoise: { value: 0.2 },
      uTwist: { value: 2 },
      uRisePhase: { value: 0 },
      uBandScale: { value: 2.4 },
      uStreak: { value: 0.2 },
      uBandFreq: { value: 1.7 },
      uBandContrast: { value: 0.5 },
      uFilament: { value: 0.8 },
      uFilamentSharp: { value: 2.5 },
      uRimPower: { value: 1.4 },
      uRim: { value: 0.7 },
      uFloorFade: { value: 0.6 },
      uTopFade: { value: 0.2 },
      uSoftFade: { value: 0.6 },
      uOpacity: { value: 0.6 },
      uFade: { value: 1 },
      uGlow: { value: 1 },
      uFilamentGlow: { value: 1 },
      uLit: { value: additive ? 0 : 1 },
      uColorBase: { value: new Color() },
      uColorMid: { value: new Color() },
      uColorTop: { value: new Color() },
      uColorFilament: { value: new Color() },
      uColorDeep: { value: new Color() },
      uDeepMix: { value: 0 },
      uBandDark: { value: 0 },
      uDensity: { value: 1 },
      uBodyFloor: { value: 0 },
      uSunLift: { value: 0 },
      uBandBulge: { value: 0 },
      uSpiralBands: { value: 0 },
      uSpiralTurns: { value: 1 },
      uSpiralWidth: { value: 0.45 },
      uSpiralContrast: { value: 0 },
      uSpiralLight: { value: 0 },
      uSpiralBulge: { value: 0 },
      uThroatDark: { value: 0 },
      uRimLight: { value: 0 }
    }),
    vertexShader: FUNNEL_VERTEX,
    fragmentShader: FUNNEL_FRAGMENT
  });

  /**
   * @param {object} state per-frame shape the ability resolved:
   *   { height, base, top, flare, sway, spinPhase, swayPhase, risePhase,
   *     collapse, fade, seed }
   */
  material.userData.sync = (state) => {
    const c = settings.tempest;
    const g = settings.global;
    const u = material.uniforms;

    u.uSeed.value = state.seed;
    u.uHeight.value = Math.max(0.05, state.height);
    u.uBaseRadius.value = state.base;
    u.uTopRadius.value = state.top;
    u.uFlare.value = state.flare;
    u.uSway.value = state.sway;
    u.uSwayFreq.value = c.swayFrequency;
    u.uSwayPhase.value = state.swayPhase;
    u.uWobble.value = c.wobble * g.noiseStrength;
    u.uWobbleScale.value = c.wobbleScale * g.noiseFrequency;
    u.uSpinPhase.value = state.spinPhase;
    u.uRadiusScale.value = role === 'inner' ? c.innerScale : 1;
    u.uCollapse.value = state.collapse;
    u.uCollapseSoft.value = c.collapseSoft;
    u.uCollapseNoise.value = c.collapseNoise * g.noiseStrength;

    u.uTwist.value = c.twist;
    u.uRisePhase.value = state.risePhase;
    u.uBandScale.value = c.bandScale * g.noiseFrequency;
    u.uStreak.value = c.streak;
    u.uBandFreq.value = c.bandFrequency * g.noiseFrequency;
    u.uBandContrast.value = c.bandContrast;
    u.uFilament.value = c.filament;
    u.uFilamentSharp.value = c.filamentSharp;
    u.uRimPower.value = c.rimPower * g.fresnel;
    u.uRim.value = c.rim;
    u.uFloorFade.value = role === 'devil' ? c.floorFade * 0.3 : c.floorFade;
    u.uTopFade.value = c.topFade;
    u.uSoftFade.value = c.softFade;
    u.uFade.value = state.fade;
    u.uBandBulge.value = c.bandBulge * g.noiseStrength * (role === 'devil' ? 0.4 : 1);
    u.uSpiralBands.value = c.spiralBands ?? 0;
    u.uSpiralTurns.value = c.spiralTurns ?? 1;
    u.uSpiralWidth.value = c.spiralWidth ?? 0.45;
    u.uSpiralContrast.value = (c.spiralContrast ?? 0) * g.shaderIntensity;
    u.uSpiralLight.value = c.spiralLight ?? 0;
    u.uSpiralBulge.value = (c.spiralBulge ?? 0) * g.noiseStrength * (role === 'outer' ? 1 : 0.4);
    u.uThroatDark.value = role === 'inner' ? 0 : (c.throatDark ?? 0);
    u.uRimLight.value = role === 'inner' ? 0 : (c.rimLight ?? 0) * g.fresnel;

    if (role === 'inner') {
      u.uBodyFloor.value = 0;
      u.uOpacity.value = c.innerOpacity * g.opacity;
      u.uGlow.value = c.innerGlow * g.glow;
      u.uFilamentGlow.value = c.filamentGlow;
      // The wind shell is light, so every stop of its gradient is the wind.
      u.uColorBase.value.copy(getColor(c.colorWind)).multiplyScalar(0.4);
      u.uColorMid.value.copy(getColor(c.colorWind));
      u.uColorTop.value.copy(getColor(c.colorFilament));
      u.uColorFilament.value.copy(getColor(c.colorFilament));
      u.uColorDeep.value.copy(getColor(c.colorWind)).multiplyScalar(0.15);
      u.uDeepMix.value = c.innerDeepMix;
      u.uBandDark.value = c.bandDark;
    } else {
      u.uOpacity.value = (role === 'devil' ? c.devilOpacity : c.outerOpacity) * g.opacity;
      u.uGlow.value = 1;
      u.uFilamentGlow.value = c.filamentGlow * 0.35;
      u.uColorBase.value.copy(getColor(c.colorFunnelBase));
      u.uColorMid.value.copy(getColor(c.colorFunnelMid));
      u.uColorTop.value.copy(getColor(c.colorFunnelTop));
      u.uColorFilament.value.copy(getColor(c.colorFilament));
      u.uColorDeep.value.copy(getColor(c.colorFunnelDeep));
      u.uDeepMix.value = c.deepMix;
      u.uBandDark.value = c.bandDark;
      u.uDensity.value = role === 'devil' ? Math.max(1, c.outerDensity * 0.8) : c.outerDensity;
      u.uBodyFloor.value = c.bodyFloor * (role === 'devil' ? 0.7 : 1);
      u.uSunLift.value = c.sunLift;
    }
  };

  return material;
}

/* ---------------------------------------------------------------------- */
/* The scoured floor                                                       */
/* ---------------------------------------------------------------------- */

/**
 * The ground the column has ground away.
 *
 * Drawn on the polar disc from `createScourGeometry`, scaled to the scour
 * radius. Three things, all wound by the same spin the funnel turns with:
 *
 *   - **striations** — ridged noise on a log-spiral bearing, so the dirt is
 *     raked into curved grooves that converge on the funnel's foot and keep
 *     turning while the column stands;
 *   - **gouges** — a dark scoured bowl where the funnel touches down, ringed by
 *     a lip of thrown grit;
 *   - **grit** — fine noise flecks lit by the sun off a bump normal.
 *
 * Normal-blended and dark: it is dirt, not light. It grows out from the foot
 * as the column rises, stays through the linger, and is blown flat on exit.
 */
const SCOUR_VERTEX = /* glsl */ `
  uniform float uRadius;
  uniform float uLift;
  varying vec2 vFlat;
  void main() {
    vec3 p = vec3(position.x * uRadius, uLift, position.z * uRadius);
    vFlat = p.xz;
    vec4 world = modelMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SCOUR_FRAGMENT = /* glsl */ `
  uniform float uRadius;
  uniform float uSpinPhase;
  uniform float uSeed;
  uniform float uGrow;        // 0..1 how far the scour has spread
  uniform float uFade;
  uniform float uOpacity;
  uniform float uWind;        // log-spiral winding of the grooves
  uniform float uGrooves;     // grooves round the disc
  uniform float uGrooveDepth;
  uniform float uBowl;        // radius of the scoured bowl, × the scour
  uniform float uGrit;
  uniform float uLipGlow;     // the pale rim of thrown grit
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorTint;
  uniform vec3  uColorLip;
  uniform vec3  uLightDir;

  varying vec2 vFlat;

  ${noiseGLSL}

  float field(vec2 q) {
    float r = length(q);
    float a = atan(q.y, q.x) + uSpinPhase * 0.35;
    float w = a + uWind * log(max(r, 0.05));
    float g = ridged(vec3(cos(w) * uGrooves * 0.16, sin(w) * uGrooves * 0.16, r * 0.9 + uSeed), 3);
    return g;
  }

  void main() {
    float r = length(vFlat);
    float k = r / max(uRadius, 1e-3);
    if (k > 1.0) discard;
    // Spreads out from the foot.
    float front = uGrow * 1.08;
    float edgeN = snoise(vec3(vFlat * 0.9, uSeed)) * 0.08;
    float reach = 1.0 - smoothstep(front - 0.18, front, k + edgeN);

    float g = field(vFlat);
    // Bump normal from the groove field.
    float e = 0.05;
    float gx = field(vFlat + vec2(e, 0.0)) - g;
    float gz = field(vFlat + vec2(0.0, e)) - g;
    vec3 n = normalize(vec3(-gx * uGrooveDepth * 6.0, 1.0, -gz * uGrooveDepth * 6.0));
    float lambert = 0.35 + 0.65 * max(dot(n, normalize(uLightDir)), 0.0);

    float grit = snoise(vec3(vFlat * 9.0, uSeed + 3.0)) * 0.5 + 0.5;
    float bowl = 1.0 - smoothstep(uBowl * 0.55, uBowl, k);

    // deep in the grooves and in the bowl, body on the ridges, tint on the flecks.
    vec3 col = mix(uColorDeep, uColorBody, smoothstep(0.25, 0.85, g));
    col = mix(col, uColorTint, smoothstep(0.75, 1.0, grit) * uGrit * (1.0 - bowl));
    col = mix(col, uColorDeep * 0.6, bowl * 0.85);
    col *= lambert;
    // A lip of thrown grit round the bowl.
    float lipD = (k - uBowl) / 0.07;
    float lip = exp(-lipD * lipD);
    col += uColorLip * lip * uLipGlow * (0.6 + 0.4 * g);

    float alpha = (1.0 - smoothstep(0.7, 1.0, k)) * reach * uOpacity * uFade;
    alpha *= mix(0.55, 1.0, max(g, bowl));
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createTempestScourMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    // The disc is wound clockwise seen from above; draw both faces.
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRadius: { value: 3 },
      uLift: { value: 0.02 },
      uSpinPhase: { value: 0 },
      uSeed: { value: 0 },
      uGrow: { value: 0 },
      uFade: { value: 1 },
      uOpacity: { value: 0.9 },
      uWind: { value: 1.6 },
      uGrooves: { value: 14 },
      uGrooveDepth: { value: 0.5 },
      uBowl: { value: 0.3 },
      uGrit: { value: 0.6 },
      uLipGlow: { value: 0.5 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorTint: { value: new Color() },
      uColorLip: { value: new Color() }
    }),
    vertexShader: SCOUR_VERTEX,
    fragmentShader: SCOUR_FRAGMENT
  });

  /** @param {object} state { radius, spinPhase, grow, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.tempest;
    const g = settings.global;
    const u = material.uniforms;
    u.uRadius.value = Math.max(0.1, state.radius);
    u.uLift.value = c.scourLift;
    u.uSpinPhase.value = state.spinPhase;
    u.uSeed.value = state.seed;
    u.uGrow.value = state.grow;
    u.uFade.value = state.fade;
    u.uOpacity.value = c.scourOpacity * g.opacity;
    u.uWind.value = c.scourWind;
    u.uGrooves.value = c.scourGrooves * g.noiseFrequency;
    u.uGrooveDepth.value = c.scourGrooveDepth * g.noiseStrength;
    u.uBowl.value = c.scourBowl;
    u.uGrit.value = c.scourGrit;
    u.uLipGlow.value = c.scourLipGlow;
    u.uColorDeep.value.copy(getColor(c.colorScourDeep));
    u.uColorBody.value.copy(getColor(c.colorScourBody));
    u.uColorTint.value.copy(getColor(c.colorScourTint));
    u.uColorLip.value.copy(getColor(c.colorScourLip));
  };

  return material;
}

/* ---------------------------------------------------------------------- */
/* The base warp — LAYER.DISTORTION                                        */
/* ---------------------------------------------------------------------- */

/**
 * The air at the base of the column, bent.
 *
 * A camera-facing quad standing on the floor, written into the distortion
 * buffer as `vec4(offset * 0.5 + 0.5, strength, mask)` — the same contract as
 * the acid fume. The offset is not plain noise: it is noise sampled in a frame
 * *rotated by height and time*, plus a tangential term about the quad's middle,
 * so the refraction itself is seen to turn with the funnel.
 */
const WARP_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;

  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    // Billboard about the quad's centre, sized in metres.
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * vec2(uWidth, uHeight);
    vWorld = (modelMatrix * vec4(position.x * uWidth, position.y * uHeight, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSwirl;
  uniform float uSeed;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec2 c = (vUv - 0.5) * 2.0;

    vec2 xz = rot2(vWorld.y * uSwirl + uTime * uSpeed * 0.6) * vWorld.xz;
    vec3 np = vec3(xz * uScale, vWorld.y * uScale * 0.5 - uTime * uSpeed + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(19.3, 7.7, 31.1)));

    // A tangential push about the middle: the refraction turns.
    vec2 tangent = normalize(vec2(-c.y, c.x) + 1e-4);
    vec2 offset = normalize(n * 0.7 + tangent * 0.6 + 1e-4);

    // Strongest low and on the axis, feathered at every border.
    float mask = (1.0 - smoothstep(0.2, 1.0, abs(c.x)))
               * (1.0 - smoothstep(0.1, 1.0, vUv.y))
               * smoothstep(0.0, 0.06, vUv.y);

    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;

    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

export function createTempestWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 6 },
      uHeight: { value: 4 },
      uStrength: { value: 1 },
      uScale: { value: 1.6 },
      uSpeed: { value: 2 },
      uSwirl: { value: 1.4 },
      uSeed: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} state { width, height, strength, seed } */
  material.userData.sync = (state) => {
    const c = settings.tempest;
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = state.width;
    u.uHeight.value = state.height;
    u.uStrength.value = state.strength * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
    u.uSwirl.value = c.warpSwirl;
    u.uSeed.value = state.seed;
  };

  return material;
}
