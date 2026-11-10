import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Zephyr Shuriken — the four bespoke shaders the wind discs are drawn with.
 *
 *  - **the disc** — a flat quad placed in the vertex stage from a centre, an
 *    axis and a heading, so the ability can bank and rock it without a matrix.
 *    The shuriken is a signed distance field in polar coordinates: `blades`
 *    sectors that taper to a point and sweep back with radius, unioned with a
 *    hub and cut by a hole. Additive and nearly transparent — one bright line
 *    on every edge (the *leading* edge brighter, it is the one that cuts), a
 *    faint body, the full disc of the spin blur with wind lines streaming
 *    round it, and a chromatic fringe made by re-evaluating the same field at
 *    three angles *behind* the current spin: the three copies are the last
 *    few milliseconds of the blade, each in its own primary, which is both a
 *    motion blur and the colour split at the edge of a lens.
 *  - **the lens** — a wider disc on `LAYER.DISTORTION` whose offset is mixed
 *    between the disc's radial direction (a magnifying lens) and its
 *    tangential direction (a vortex), both projected into view space, so the
 *    world visibly *twists* round each disc.
 *  - **the scuffs** — one ground strip carrying all three discs' marks. The
 *    braid is analytic (the same sine `ZephyrShurikenAbility#_lat` uses), so
 *    each disc's centre line is known at every fragment; round it a coil of
 *    thin overlapping loops is drawn — the trace a spinning rim leaves as it
 *    is carried forward — opened into spirals by keeping only an arc of each
 *    loop. Each disc's mark only exists behind that disc, glows fresh just
 *    behind it, and erodes raggedly as the cast fades.
 *    Under the three thin loop coils each strand also cuts a filled, combed
 *    **furrow** in the ramp's deep tone, and the cyclone scours a spiral
 *    **eye** into the floor at the end of the line; both stay for the linger.
 *  - **the disc body** (`createZephyrDiscMaterial('body')`) — the same polar
 *    field filled and bevelled, normal-blended and lit from deep jade to the
 *    body colour, under the bright pass: the blades have mass at 8 m.
 *  - **the cyclone** — a flared, twisted funnel 5 m tall whose spine leans,
 *    precesses and snakes, drawn twice: an additive banded core and a
 *    normal-blended, sun-lit dust sheath (the mass and the deep tone). It
 *    unravels from the foot up along a burning edge as it lifts away.
 *
 * Every material reads `settings.zephyr` in `userData.sync(state)`.
 */

/* -------------------------------------------------------------------- */
/* The disc                                                             */
/* -------------------------------------------------------------------- */

const DISC_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform vec3  uAxis;        // the disc's normal
  uniform vec3  uHeading;     // in its plane
  uniform float uRadius;      // metres, already × form

  varying vec2  vLocal;       // -1..1 across the disc
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec2  vT;           // the disc's in-plane axes in view space (the lens)
  varying vec2  vB;
  varying float vViewZ;

  void main() {
    vec3 n = normalize(uAxis);
    vec3 t = normalize(uHeading - n * dot(uHeading, n) + 1e-5);
    vec3 b = cross(n, t);
    vec3 world = uCentre + (t * position.x + b * position.y) * uRadius;
    vLocal = position.xy;
    vNormalW = n;
    vViewDir = cameraPosition - world;
    vT = (viewMatrix * vec4(t, 0.0)).xy;
    vB = (viewMatrix * vec4(b, 0.0)).xy;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const DISC_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSpin;        // integrated on the CPU
  uniform float uSpinDir;     // ±1
  uniform float uBlades;
  uniform float uBladeWidth;
  uniform float uBladeTaper;
  uniform float uBladeCurve;
  uniform float uHub;
  uniform float uHole;
  uniform float uEdgeWidth;
  uniform float uEdgeGlow;
  uniform float uBodyOpacity;
  uniform float uBlur;
  uniform float uSwirlLines;
  uniform float uSwirlGlow;
  uniform float uFringe;
  uniform float uFringeSpread;
  uniform float uRimGlow;
  uniform float uSoftFade;
  uniform float uFade;
  uniform float uSeed;
  uniform float uWarp;
  uniform float uWarpSwirl;
  uniform float uWarpNoise;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uFringeR;
  uniform vec3  uFringeG;
  uniform vec3  uFringeB;
  uniform float uBodyFill;
  uniform float uBevel;
  uniform vec3  uBodyColor;
  uniform vec3  uDeep;
  uniform vec3  uLightDir;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vLocal;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec2  vT;
  varying vec2  vB;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  /**
   * Signed distance (disc units) to the shuriken at spin angle \`spin\`.
   * \`side\` comes back +1 on a blade's leading half, -1 on its trailing half.
   */
  float shuriken(vec2 p, float spin, out float side) {
    float r = length(p);
    float th = atan(p.y, p.x);
    float gap = 6.2831853 / max(uBlades, 1.0);
    // Swept back: the further out, the further the blade lags its root.
    float ph = (th - spin * uSpinDir) * uSpinDir + uBladeCurve * r;
    float f = mod(ph, gap) - gap * 0.5;
    side = sign(f);
    float w = gap * 0.5 * uBladeWidth * pow(max(1.0 - r, 0.0), max(uBladeTaper, 0.05));
    float blade = (abs(f) - w) * max(r, 0.05);
    blade = max(blade, r - 1.0);
    float hub = r - uHub;
    return max(min(blade, hub), uHole - r);
  }

  void main() {
    vec2 p = vLocal;
    float r = length(p);
    if (r > 1.02) discard;

  #ifdef WARP
    // Radial (lens) mixed with tangential (vortex), into view space.
    vec2 radial = p / max(r, 1e-3);
    vec2 tangential = vec2(-radial.y, radial.x) * uSpinDir;
    vec2 local = mix(radial, tangential, uWarpSwirl);
    vec2 dir = normalize(vT * local.x + vB * local.y + 1e-5);
    vec2 n = vec2(snoise(vec3(p * 3.0, uTime * 2.0 + uSeed)), snoise(vec3(p * 3.0 + 7.1, uTime * 2.0 - uSeed)));
    vec2 offset = dir * (1.0 - uWarpNoise) + n * uWarpNoise;
    float len = length(offset);
    if (len > 1.0) offset /= len;
    float mask = sin(3.14159 * clamp(r, 0.0, 1.0)) * (1.0 - smoothstep(0.8, 1.0, r));
    float strength = uWarp * uShaderIntensity * mask * uFade;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  #elif defined(BODY)
    // The blades' mass: the same field filled, bevelled toward its edges and
    // lit by the sun from the ramp's deep jade to its body colour, plus a
    // dark smoked disc of spin blur. Normal-blended, under the bright pass.
    float side;
    float sd = shuriken(p, uSpin, side);
    float ew = max(uEdgeWidth, 0.004);
    float inside = 1.0 - smoothstep(-ew * 0.5, ew * 0.5, sd);
    float bevel = clamp(-sd / max(uBevel, 0.01), 0.0, 1.0);
    float n = snoise(vec3(p * 3.2, uSeed + uSpin * 0.05)) * 0.5 + 0.5;
    float facing = abs(dot(normalize(vNormalW), normalize(uLightDir)));
    // The leading half of each blade catches the light, the trailing half falls away.
    float lead = mix(0.55, 1.0, step(0.0, side));
    vec3 col = mix(uDeep, uBodyColor, clamp(bevel * lead * (0.45 + 0.55 * facing) * (0.6 + 0.6 * n), 0.0, 1.0));
    float disc = (1.0 - smoothstep(0.8, 1.0, r)) * smoothstep(uHole, uHole + 0.08, r);
    float a = max(inside * uBodyFill * (0.7 + 0.3 * n), disc * uBlur * 0.35 * uBodyFill);
    col = mix(uDeep, col, inside);
    a *= uFade * (1.0 - smoothstep(0.96, 1.02, r));
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    a *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  #else
    float side;
    float sd = shuriken(p, uSpin, side);
    float ew = max(uEdgeWidth, 0.004);

    // The edge: a hard line on the boundary, brighter on the leading side.
    float edge = 1.0 - smoothstep(ew * 0.25, ew, abs(sd));
    float lead = mix(0.45, 1.6, step(0.0, side));
    float inside = 1.0 - smoothstep(-ew * 0.5, ew * 0.5, sd);

    // The fringe: the same blade a moment ago, three times, in three colours.
    float s1, s2, s3;
    float f1 = 1.0 - smoothstep(0.0, ew * 1.6, abs(shuriken(p, uSpin - uFringeSpread * 1.0, s1)));
    float f2 = 1.0 - smoothstep(0.0, ew * 1.6, abs(shuriken(p, uSpin - uFringeSpread * 2.0, s2)));
    float f3 = 1.0 - smoothstep(0.0, ew * 1.6, abs(shuriken(p, uSpin - uFringeSpread * 3.0, s3)));
    vec3 fringe = (uFringeR * f1 + uFringeG * f2 + uFringeB * f3) * uFringe;

    // The spin blur: a faint full disc with wind lines streaming round it.
    float th = atan(p.y, p.x);
    float lines = sin(th * uSwirlLines - uSpin * uSpinDir * 0.35 + r * 9.0 + snoise(vec3(p * 2.5, uSeed)) * 1.5);
    lines = smoothstep(0.55, 1.0, lines);
    float disc = (1.0 - smoothstep(0.82, 1.0, r)) * smoothstep(uHole, uHole + 0.08, r);
    float blur = disc * uBlur * (0.35 + 0.65 * lines);

    // Edge-on, a flat disc is all rim.
    float rim = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir))), 3.0) * uRimGlow;

    vec3 col = uColorA * (inside * uBodyOpacity * (0.6 + 0.4 * lines) + blur)
             + uColorB * edge * lead * uEdgeGlow
             + uColorA * lines * disc * uSwirlGlow * 0.4
             + fringe * (1.0 - inside * 0.6)
             + uColorB * rim * (edge + disc * 0.3);
    col *= uShaderIntensity;

    float mask = uFade * (1.0 - smoothstep(0.96, 1.02, r));
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (mask < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow * mask, clamp(mask, 0.0, 1.0));
  #endif
  }
`;

/**
 * One wind disc, its lens, or its lit body.
 * @param {boolean|string} warp true / 'warp' for the `LAYER.DISTORTION` lens,
 *   'body' for the normal-blended, sun-lit mass under the bright pass
 */
export function createZephyrDiscMaterial(warp = false) {
  const body = warp === 'body';
  if (body) warp = false;
  const material = new ShaderMaterial({
    defines: warp ? { WARP: '' } : body ? { BODY: '' } : {},
    transparent: true,
    depthWrite: false,
    depthTest: !warp,
    blending: warp || body ? NormalBlending : AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uAxis: { value: new Vector3(0, 1, 0) },
      uHeading: { value: new Vector3(0, 0, 1) },
      uRadius: { value: 0.6 },
      uSpin: { value: 0 },
      uSpinDir: { value: 1 },
      uBlades: { value: 4 },
      uBladeWidth: { value: 0.4 },
      uBladeTaper: { value: 1.4 },
      uBladeCurve: { value: 1.8 },
      uHub: { value: 0.24 },
      uHole: { value: 0.09 },
      uEdgeWidth: { value: 0.05 },
      uEdgeGlow: { value: 4 },
      uBodyOpacity: { value: 0.28 },
      uBlur: { value: 0.35 },
      uSwirlLines: { value: 6 },
      uSwirlGlow: { value: 0.9 },
      uFringe: { value: 1.2 },
      uFringeSpread: { value: 0.11 },
      uRimGlow: { value: 1.1 },
      uSoftFade: { value: 0.3 },
      uFade: { value: 1 },
      uSeed: { value: 0 },
      uWarp: { value: 1 },
      uWarpSwirl: { value: 0.7 },
      uWarpNoise: { value: 0.25 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uFringeR: { value: new Color() },
      uFringeG: { value: new Color() },
      uFringeB: { value: new Color() },
      uBodyFill: { value: 0.7 },
      uBevel: { value: 0.12 },
      uBodyColor: { value: new Color() },
      uDeep: { value: new Color() }
    }),
    vertexShader: DISC_VERTEX,
    fragmentShader: DISC_FRAGMENT
  });

  /** @param {object} disc { centre, axis, heading, radius, spin, spinDir, fade, seed, strength } */
  material.userData.sync = (disc) => {
    const c = settings.zephyr;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(disc.centre);
    u.uAxis.value.copy(disc.axis);
    u.uHeading.value.copy(disc.heading);
    u.uRadius.value = Math.max(0.001, disc.radius * (warp ? c.warpRadius : 1));
    u.uSpin.value = disc.spin;
    u.uSpinDir.value = disc.spinDir;
    u.uBlades.value = Math.max(2, Math.round(c.blades));
    u.uBladeWidth.value = c.bladeWidth;
    u.uBladeTaper.value = c.bladeTaper;
    u.uBladeCurve.value = c.bladeCurve;
    u.uHub.value = c.hubRadius;
    u.uHole.value = Math.min(c.holeRadius, c.hubRadius * 0.95);
    u.uEdgeWidth.value = c.edgeWidth;
    u.uEdgeGlow.value = c.edgeGlow * g.glow;
    u.uBodyOpacity.value = c.bodyOpacity * g.opacity;
    u.uBlur.value = c.blurAmount * g.opacity;
    u.uSwirlLines.value = Math.round(c.swirlLines);
    u.uSwirlGlow.value = c.swirlGlow * g.glow;
    u.uFringe.value = c.fringe * g.shaderIntensity;
    u.uFringeSpread.value = c.fringeSpread;
    u.uRimGlow.value = c.rimGlow * g.fresnel;
    u.uSoftFade.value = c.softFade;
    u.uFade.value = disc.fade;
    u.uSeed.value = disc.seed;
    u.uWarp.value = c.warpStrength * g.distortion * disc.strength;
    u.uWarpSwirl.value = Math.min(1, Math.max(0, c.warpSwirl));
    u.uWarpNoise.value = Math.min(1, Math.max(0, c.warpNoise * g.turbulence));
    u.uColorA.value.copy(getColor(c.colorA));
    u.uColorB.value.copy(getColor(c.colorB));
    u.uFringeR.value.copy(getColor(c.colorFringeR));
    u.uFringeG.value.copy(getColor(c.colorFringeG));
    u.uFringeB.value.copy(getColor(c.colorFringeB));
    u.uBodyFill.value = c.bodyFill * g.opacity;
    u.uBevel.value = c.bodyBevel;
    u.uBodyColor.value.copy(getColor(c.colorDiscBody));
    u.uDeep.value.copy(getColor(c.colorDiscDeep));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The scuffs                                                           */
/* -------------------------------------------------------------------- */

const SCUFF_VERTEX = /* glsl */ `
  uniform vec3  uStart;       // floor point at the caster (along = 0)
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uWidth;

  varying vec2 vFlat;         // x: metres across, y: metres along from the caster

  void main() {
    float across = position.x * uWidth;
    float along = (position.y + 0.5) * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = 0.013;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SCUFF_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uAmp;         // braid half-width, metres
  uniform float uK;           // 2π / pitch
  uniform vec3  uPhase;       // each disc's braid phase
  uniform float uSpreadIn;
  uniform float uConverge;
  uniform float uLineLen;     // the cast's length
  uniform vec3  uDiscAt;      // metres along each disc has reached
  uniform float uScuffStart;
  uniform float uLoop;
  uniform float uPitch;
  uniform float uLineW;
  uniform float uArc;
  uniform float uDust;
  uniform float uOpacity;
  uniform float uDustOpacity;
  uniform float uGlow;
  uniform float uGlowLength;
  uniform float uHot;
  uniform float uErode;
  uniform float uFadeT;
  uniform vec3  uColorScuff;
  uniform vec3  uColorDust;
  uniform vec3  uColorGlow;
  uniform float uGlobalGlow;
  uniform float uFurrow;      // half-width of each strand's furrow, metres
  uniform float uFurrowOpacity;
  uniform vec3  uColorDeep;
  uniform float uEyeAt;       // metres along of the cyclone's foot
  uniform float uEyeR;        // metres, already × how far it has grown
  uniform float uEyeArms;
  uniform float uEyeSpin;     // integrated
  uniform float uEyeOpacity;

  varying vec2 vFlat;

  ${noiseGLSL}

  float envelope(float a) {
    return smoothstep(0.0, max(uSpreadIn, 0.01), a) * (1.0 - smoothstep(uLineLen - max(uConverge, 0.01), uLineLen, a));
  }

  /** One disc's furrow: a filled, combed groove under its strand. */
  float furrow(vec2 p, float phase, float discAt, float id) {
    float a = p.y;
    if (a > discAt || a < uScuffStart) return 0.0;
    float env = envelope(a);
    float lat = uAmp * env * sin(a * uK + phase);
    float d = abs(p.x - lat);
    float w = uFurrow * (0.5 + 0.5 * env);
    float edgeN = snoise(vec3(p * 2.4, uSeed + id * 3.0)) * 0.3 * w;
    float body = 1.0 - smoothstep(w * 0.35, w, d + edgeN);
    float comb = 0.55 + 0.45 * smoothstep(-0.3, 0.7, snoise(vec3(p.x * 16.0, a * 0.5, uSeed + id)));
    return body * comb * smoothstep(uScuffStart, uScuffStart + 0.8, a);
  }

  /** One disc's mark at (x, along): x = scuff line, y = dust band, z = hot. */
  vec3 mark(vec2 p, float phase, float discAt, float id) {
    float a = p.y;
    if (a > discAt || a < uScuffStart) return vec3(0.0);
    float env = envelope(a);
    float lat = uAmp * env * sin(a * uK + phase);
    float d = p.x - lat;
    float loopR = uLoop * (0.45 + 0.55 * env);
    if (abs(d) > loopR + uDust + 0.1) return vec3(0.0);

    // A coil of loops: check this loop and its two neighbours, they overlap.
    float best = 0.0;
    float n0 = floor(a / max(uPitch, 0.02));
    for (int j = -1; j <= 1; j++) {
      float n = n0 + float(j);
      vec2 q = vec2(a - (n + 0.5) * uPitch, d);
      float ring = abs(length(q) - loopR);
      // Keep only an arc of each loop, turning loop to loop: open spirals.
      float ang = atan(q.y, q.x) / 6.2831853 + 0.5;
      float keep = step(fract(ang + n * 0.37 + id * 0.21), uArc);
      float w = uLineW * (0.6 + 0.4 * hash11(n * 3.1 + id));
      best = max(best, (1.0 - smoothstep(w * 0.4, w, ring)) * keep);
    }
    float edgeN = snoise(vec3(p * 3.0, uSeed + id)) * 0.08;
    float dust = (1.0 - smoothstep(uDust * 0.3, uDust, abs(d) + edgeN)) * (0.5 + 0.5 * snoise(vec3(p.x * 9.0, a * 0.8, uSeed + id)));
    float hot = exp(-max(discAt - a, 0.0) / max(uGlowLength, 0.05));
    float open = smoothstep(uScuffStart, uScuffStart + 0.6, a);
    return vec3(best, max(dust, 0.0), hot) * open;
  }

  void main() {
    vec2 p = vFlat;
    vec3 m0 = mark(p, uPhase.x, uDiscAt.x, 0.0);
    vec3 m1 = mark(p, uPhase.y, uDiscAt.y, 1.0);
    vec3 m2 = mark(p, uPhase.z, uDiscAt.z, 2.0);
    float line = max(m0.x, max(m1.x, m2.x));
    float dust = max(m0.y, max(m1.y, m2.y));
    float hot = max(m0.z * m0.x, max(m1.z * m1.x, m2.z * m2.x)) * uHot;
    float fur = max(furrow(p, uPhase.x, uDiscAt.x, 0.0), max(furrow(p, uPhase.y, uDiscAt.y, 1.0), furrow(p, uPhase.z, uDiscAt.z, 2.0)));

    // The cyclone's eye: a spiral of scoured floor under the funnel.
    float eye = 0.0;
    float eyeRim = 0.0;
    if (uEyeR > 0.01) {
      vec2 q = vec2(p.x, p.y - uEyeAt);
      float r = length(q);
      float ang = atan(q.y, q.x);
      float arms = 0.5 + 0.5 * sin(ang * max(uEyeArms, 1.0) + log(r + 0.1) * 4.0 - uEyeSpin);
      arms = pow(arms, 2.0);
      float edgeN = snoise(vec3(q * 1.5, uSeed + 9.0)) * 0.25 * uEyeR;
      float disc = 1.0 - smoothstep(uEyeR * 0.5, uEyeR, r + edgeN);
      float core = 1.0 - smoothstep(0.0, uEyeR * 0.3, r);
      eye = disc * (0.35 + 0.65 * arms) + core * 0.4;
      eyeRim = exp(-pow((r + edgeN - uEyeR * 0.9) / max(uEyeR * 0.1, 0.02), 2.0)) * (0.5 + 0.5 * arms);
    }
    if (line + dust + fur + eye + eyeRim < 0.004) discard;

    vec3 col = mix(uColorDust, uColorDeep, clamp(max(fur, eye), 0.0, 1.0));
    col = mix(col, uColorDust, eyeRim * 0.8);
    col = mix(col, uColorScuff, line);
    col += uColorGlow * hot * uGlow * uGlobalGlow;
    float a = max(max(dust * uDustOpacity, line * uOpacity), max(fur * uFurrowOpacity, eye * uEyeOpacity));
    a = max(a, eyeRim * uDustOpacity * 1.8);
    a = max(a, hot * 0.8);

    float n = snoise(vec3(p * 2.2, uSeed * 4.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(0.55, n, uErode));
    a *= vis;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The three spiral scuffs, in one ground strip. */
export function createZephyrScuffMaterial() {
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
      uWidth: { value: 4 },
      uSeed: { value: 0 },
      uAmp: { value: 1 },
      uK: { value: 1.5 },
      uPhase: { value: new Vector3() },
      uSpreadIn: { value: 2 },
      uConverge: { value: 3 },
      uLineLen: { value: 10 },
      uDiscAt: { value: new Vector3() },
      uScuffStart: { value: 0.8 },
      uLoop: { value: 0.3 },
      uPitch: { value: 0.4 },
      uLineW: { value: 0.02 },
      uArc: { value: 0.65 },
      uDust: { value: 0.3 },
      uOpacity: { value: 0.55 },
      uDustOpacity: { value: 0.18 },
      uGlow: { value: 1.6 },
      uGlowLength: { value: 2.2 },
      uHot: { value: 1 },
      uErode: { value: 0.7 },
      uFadeT: { value: 0 },
      uColorScuff: { value: new Color() },
      uColorDust: { value: new Color() },
      uColorGlow: { value: new Color() },
      uFurrow: { value: 0.35 },
      uFurrowOpacity: { value: 0.5 },
      uColorDeep: { value: new Color() },
      uEyeAt: { value: 0 },
      uEyeR: { value: 0 },
      uEyeArms: { value: 3 },
      uEyeSpin: { value: 0 },
      uEyeOpacity: { value: 0.5 }
    }),
    vertexShader: SCUFF_VERTEX,
    fragmentShader: SCUFF_FRAGMENT
  });

  /**
   * @param {object} state { start, dir, side, length, width, amp, k, phase (Vector3),
   *   lineLen, spreadIn, converge, discAt (Vector3), hot, fadeT, seed,
   *   eyeAt, eyeR, eyeSpin }
   */
  material.userData.sync = (state) => {
    const c = settings.zephyr;
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.1, state.length);
    u.uWidth.value = state.width;
    u.uSeed.value = state.seed;
    u.uAmp.value = state.amp;
    u.uK.value = state.k;
    u.uPhase.value.copy(state.phase);
    u.uSpreadIn.value = state.spreadIn;
    u.uConverge.value = state.converge;
    u.uLineLen.value = state.lineLen;
    u.uDiscAt.value.copy(state.discAt);
    u.uScuffStart.value = c.scuffStart;
    u.uLoop.value = c.scuffLoop;
    u.uPitch.value = Math.max(0.02, c.scuffPitch);
    u.uLineW.value = c.scuffWidth;
    u.uArc.value = c.scuffArc;
    u.uDust.value = Math.max(0.01, c.scuffDust);
    u.uOpacity.value = c.scuffOpacity * g.opacity;
    u.uDustOpacity.value = c.scuffDustOpacity * g.opacity;
    u.uGlow.value = c.scuffGlow * g.glow;
    u.uGlowLength.value = c.scuffGlowLength;
    u.uHot.value = state.hot;
    u.uErode.value = c.scuffErode;
    u.uFadeT.value = state.fadeT;
    u.uColorScuff.value.copy(getColor(c.colorScuff));
    u.uColorDust.value.copy(getColor(c.colorScuffDust));
    u.uColorGlow.value.copy(getColor(c.colorScuffGlow));
    u.uFurrow.value = Math.max(0.01, c.scuffFurrow);
    u.uFurrowOpacity.value = c.scuffFurrowOpacity * g.opacity;
    u.uColorDeep.value.copy(getColor(c.colorScuffDeep));
    u.uEyeAt.value = state.eyeAt;
    u.uEyeR.value = state.eyeR;
    u.uEyeArms.value = Math.max(1, Math.round(c.eyeArms));
    u.uEyeSpin.value = state.eyeSpin;
    u.uEyeOpacity.value = c.eyeOpacity * g.opacity;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The cyclone                                                          */
/* -------------------------------------------------------------------- */

const CYCLONE_VERTEX = /* glsl */ `
  uniform vec3  uCentre;      // floor point
  uniform float uRadius0;
  uniform float uRadius1;
  uniform float uHeight;
  uniform float uFlare;
  uniform float uGrow;        // 0..1 forming
  uniform float uRise;        // metres it has lifted
  uniform float uSpinPhase;   // integrated on the CPU
  uniform float uTwist;
  uniform float uNoise;
  uniform float uSeed;
  uniform float uLean;        // metres the top leans, per metre of height
  uniform float uPrecess;     // integrated: the bearing the lean points at
  uniform float uWobble;      // metres the funnel snakes
  uniform float uRadiusScale; // the dust sheath is a little wider than the core

  varying vec2  vFunnel;      // x: angle in the funnel's own frame, y: 0 base .. 1 top
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}

  /** The funnel's spine: leaning, precessing and snaking. */
  vec3 spine(float v) {
    float h = v * uHeight * uGrow;
    vec2 lean = vec2(cos(uPrecess), sin(uPrecess)) * uLean * h * v;
    vec2 sway = vec2(snoise(vec3(v * 1.6, uSpinPhase * 0.03, uSeed)), snoise(vec3(v * 1.6, uSpinPhase * 0.03, uSeed + 9.0)))
              * uWobble * v;
    return uCentre + vec3(lean.x + sway.x, h + uRise, lean.y + sway.y);
  }

  void main() {
    float v = uv.y;
    float r = mix(uRadius0, uRadius1, pow(v, max(uFlare, 0.1))) * mix(0.25, 1.0, uGrow) * uRadiusScale;
    float a = uv.x * 6.2831853;
    vec3 n = vec3(cos(a), 0.0, sin(a));
    vec3 world = spine(v) + n * r;
    vFunnel = vec2(a + uSpinPhase + uTwist * v * uHeight, v);
    vNormalW = n;
    vWorld = world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const CYCLONE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uBands;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uNoise;
  uniform float uFade;
  uniform float uDissolve;    // 0..1 unravelled from the foot up
  uniform float uFresnel;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
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

  varying vec2  vFunnel;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float a = vFunnel.x;
    float v = vFunnel.y;
    vec2 ring = vec2(cos(a), sin(a));
    float streak = snoise(vec3(ring * 1.4, v * 3.0 - uTime * 1.5) + uSeed) * 0.5 + 0.5;
    float shape = smoothstep(0.0, 0.1, v) * (1.0 - smoothstep(0.72, 1.0, v));

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - abs(dot(N, V)), 1.5);

    // Unravel from the foot up along a ragged, burning edge.
    float dn = fbm3(vec3(ring * 2.0, v * 2.5 + uSeed)) * 0.5 + 0.5;
    float front = uDissolve * 1.25 - 0.12;
    float cut = v + (dn - 0.5) * 0.3;
    float keep = uDissolve <= 0.0 ? 1.0 : smoothstep(front, front + 0.05, cut);
    float burn = uDissolve <= 0.0 ? 0.0 : smoothstep(front - 0.02, front + 0.04, cut) - smoothstep(front + 0.04, front + 0.15, cut);

    vec2 screenUV = gl_FragCoord.xy / uResolution;
    float soft = softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.4);

  #ifdef SHEATH
    // The storm's mass: dust wound round the funnel, lit by the sun from the
    // ramp's deep to its body colour, ragged, thinning at the silhouette.
    float n = fbm3(vec3(ring * 1.8, v * 4.0 - uTime * 0.7 + uSeed)) * 0.5 + 0.5;
    n = mix(0.6, n, clamp(uNoise, 0.0, 1.0));
    float ndl = dot(N, normalize(uLightDir)) * 0.5 + 0.5;
    float fr = fresnelTerm(V, N, uFresnel, 1.0);
    vec3 col = mix(uDeep, uBodyColor, ndl * (0.35 + 0.8 * n));
    col = mix(col, uTint, clamp(fr * 0.35 + v * 0.15, 0.0, 1.0));
    float alpha = uOpacity * smoothstep(0.25, 0.65, n) * (1.0 - 0.55 * clamp(fr, 0.0, 1.0)) * shape * keep * uFade * soft;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  #else
    float bands = pow(0.5 + 0.5 * sin(a * max(uBands, 1.0) + streak * uNoise * 3.0), 3.0);
    float m = (bands * 0.7 + streak * 0.3) * shape * (0.35 + 0.65 * rim) * keep + burn * shape;
    vec3 col = mix(uColorC, mix(uColorB, uColorA, bands), 0.4 + 0.6 * streak) * uGlow * uShaderIntensity;
    col += uColorA * burn * 2.0;
    float alpha = m * uOpacity * uFade * soft;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow * alpha, clamp(alpha, 0.0, 1.0));
  #endif
  }
`;

/**
 * The cyclone the discs burst into.
 * @param {boolean} sheath false: the additive banded core; true: the
 *   normal-blended, sun-lit dust sheath that gives it mass and a deep tone
 */
export function createZephyrCycloneMaterial(sheath = false) {
  const material = new ShaderMaterial({
    defines: sheath ? { SHEATH: '' } : {},
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: sheath ? NormalBlending : AdditiveBlending,
    side: sheath ? FrontSide : DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uRadius0: { value: 1 },
      uRadius1: { value: 2 },
      uHeight: { value: 3 },
      uFlare: { value: 1.6 },
      uGrow: { value: 0 },
      uRise: { value: 0 },
      uSpinPhase: { value: 0 },
      uTwist: { value: 2.4 },
      uNoise: { value: 0.6 },
      uSeed: { value: 0 },
      uLean: { value: 0.2 },
      uPrecess: { value: 0 },
      uWobble: { value: 0.3 },
      uRadiusScale: { value: 1 },
      uBands: { value: 5 },
      uOpacity: { value: 0.55 },
      uGlow: { value: 1.8 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uFresnel: { value: 2 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uTint: { value: new Color() },
      uBodyColor: { value: new Color() },
      uDeep: { value: new Color() }
    }),
    vertexShader: CYCLONE_VERTEX,
    fragmentShader: CYCLONE_FRAGMENT
  });

  /** @param {object} state { centre, grow, rise, spin, precess, fade, dissolve, seed } */
  material.userData.sync = (state) => {
    const c = settings.zephyr;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uRadius0.value = c.puffRadius;
    u.uRadius1.value = c.puffTopRadius;
    u.uHeight.value = c.puffHeight;
    u.uFlare.value = c.puffFlare;
    u.uGrow.value = state.grow;
    u.uRise.value = state.rise;
    u.uSpinPhase.value = state.spin;
    u.uTwist.value = c.puffTwist;
    u.uNoise.value = c.puffNoise * g.noiseStrength;
    u.uSeed.value = state.seed;
    u.uLean.value = c.puffLean;
    u.uPrecess.value = state.precess;
    u.uWobble.value = c.puffWobble * g.turbulence;
    u.uRadiusScale.value = sheath ? c.puffSheathScale : 1;
    u.uBands.value = Math.round(c.puffBands);
    u.uOpacity.value = (sheath ? c.puffSheathOpacity : c.puffOpacity) * g.opacity;
    u.uGlow.value = c.puffGlow * g.glow;
    u.uFade.value = state.fade;
    u.uDissolve.value = state.dissolve;
    u.uFresnel.value = c.puffFresnel * g.fresnel;
    u.uColorA.value.copy(getColor(c.colorPuffA));
    u.uColorB.value.copy(getColor(c.colorPuffB));
    u.uColorC.value.copy(getColor(c.colorPuffC));
    u.uTint.value.copy(getColor(c.colorPuffTint));
    u.uBodyColor.value.copy(getColor(c.colorPuffBody));
    u.uDeep.value.copy(getColor(c.colorPuffDeep));
  };

  return material;
}
