import { Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Dark Matter Well — the bespoke shaders.
 *
 *  - **the well** — a polar grid dropped in the vertex stage into a gravity
 *    well: the textbook picture of spacetime round a mass, a sheet that is
 *    flat at the rim and plunges into a narrow throat. The fragment draws the
 *    sheet's *grid* — concentric rings that flow inward (advected by a phase
 *    integrated on the CPU) and spokes that wind into a spiral toward the
 *    throat — glowing violet on near-black, darkening with depth. Then the
 *    dark matter comes in **from the rim**: a front (`uFront`, 1 → 0) with a
 *    ragged lavender edge, and behind it the grid is drowned in ink — black,
 *    with faint violet veins and a few cold stars in it. It is drawn *below*
 *    the floor and writes its own depth, so it can be seen there; the trick
 *    is MaelstromVortex's (see that file): a fragment under the floor is
 *    placed just in front of where its view ray crosses the floor. The drawn
 *    sheet is the throat *plus a broad bowl*, so the whole circle visibly
 *    sags; light dies with depth (`depthFalloff`) and the far wall, turned to
 *    the camera, catches it — the depth reads from 8 m. A four-stop ramp:
 *    dark sheet at the lip, the saturated body on the lit wall, abyss below,
 *    bright only in the grid lines, the front and the photon ring. The ink is
 *    wound with spiral arms that turn into the eye, and at the eye a **pit**
 *    of pure black — it eats light — ringed by a thin hot ring of bent light.
 *  - **the curtain** — an open cylinder of dark matter standing on the front:
 *    a wall of inky tongues with violet-white crests, flowing upward, its
 *    crest leaning in over the well. It closes with the front like an iris
 *    and, at the end, is pulled down the throat.
 *  - **the seed** — the thrown mote: an ink-black bead inside a thin lensed
 *    ring of light.
 *  - **the lens** — a disc on `LAYER.DISTORTION` that pulls the world inward,
 *    hardest on the front and toward the throat.
 *
 * Every material reads `settings.darkwell` in `userData.sync(state)`.
 */

const ID = 'darkwell';

/* -------------------------------------------------------------------- */
/* The well                                                             */
/* -------------------------------------------------------------------- */

/** `wellShape(x)` 1 at the eye .. 0 at the rim — keep `DarkMatterWellAbility#_shape` in step. */
const SHAPE_GLSL = /* glsl */ `
  float wellShape(float x, float throat) {
    float a = max(throat, 0.02);
    float f = 1.0 / (1.0 + (x * x) / (a * a));
    float f1 = 1.0 / (1.0 + 1.0 / (a * a));
    return clamp((f - f1) / (1.0 - f1), 0.0, 1.0);
  }

  /** The sheet as drawn: the throat plus a broad bowl, so the whole floor sags. */
  float sagShape(float x, float throat, float bowl, float bowlPow) {
    float b = pow(clamp(1.0 - x * x, 0.0, 1.0), max(bowlPow, 0.2));
    return mix(wellShape(x, throat), b, clamp(bowl, 0.0, 1.0));
  }
`;

const WELL_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;
  uniform float uDepth;       // metres, already × how far it has opened
  uniform float uThroat;
  uniform float uRipple;
  uniform float uRippleFreq;
  uniform float uRipplePhase;
  uniform float uBowl;
  uniform float uBowlPow;

  varying vec2  vPolar;       // x: 0 eye .. 1 rim, y: bearing radians
  varying vec3  vWorld;
  varying float vViewZ;
  varying float vSlope;
  varying float vSag;         // 0 rim .. 1 eye, the drawn sheet's shape

  ${SHAPE_GLSL}

  float heightAt(float x) {
    float h = -uDepth * sagShape(x, uThroat, uBowl, uBowlPow);
    h += uRipple * sin(x * uRippleFreq + uRipplePhase) * x * (1.0 - x) * 4.0;
    return h;
  }

  void main() {
    float x = position.x;
    float a = position.y * 6.2831853;
    float h = heightAt(x);
    vec3 world = uCenter + vec3(cos(a), 0.0, sin(a)) * x * uRadius;
    world.y = h + 0.012;
    vSlope = (heightAt(min(x + 0.01, 1.0)) - heightAt(max(x - 0.01, 0.0))) / (0.02 * max(uRadius, 0.1));
    vPolar = vec2(x, a);
    vSag = sagShape(x, uThroat, uBowl, uBowlPow);
    vWorld = world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const WELL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform vec3  uCenter;
  uniform float uRadius;
  uniform float uDepth;
  uniform float uThroat;
  uniform float uOpenK;       // 0..1 how far it has opened
  uniform float uRings;
  uniform float uSpokes;
  uniform float uLineWidth;
  uniform float uFlow;        // integrated inward flow of the rings
  uniform float uTwist;       // integrated wind of the spokes
  uniform float uGridGlow;
  uniform float uFront;       // 1 rim .. 0 eye — where the dark matter has reached
  uniform float uFrontNoise;
  uniform float uFrontGlow;
  uniform float uFrontWidth;
  uniform float uRimGlow;
  uniform float uVeinGlow;
  uniform float uStars;
  uniform float uReveal;
  uniform float uErode;
  uniform float uOpacity;
  uniform float uDepthBias;
  uniform vec3  uColorSheet;
  uniform vec3  uColorAbyss;
  uniform vec3  uColorGrid;
  uniform vec3  uColorFront;
  uniform vec3  uColorInk;
  uniform vec3  uColorVein;
  uniform vec3  uColorBody;
  uniform vec3  uColorPhoton;
  uniform float uDepthFalloff;  // 1/m — light dies going down the well
  uniform float uWallLight;     // the far wall, facing the camera, catches light
  uniform float uHorizon;       // radius (0..1) of the black pit at the eye
  uniform float uPhotonGlow;
  uniform float uPhotonWidth;
  uniform float uArms;
  uniform float uSpiralTight;
  uniform float uSpiralGlow;
  uniform float uInkBody;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uGlobalGlow;

  varying vec2  vPolar;
  varying vec3  vWorld;
  varying float vViewZ;
  varying float vSlope;
  varying float vSag;

  ${noiseGLSL}
  ${commonGLSL}
  ${SHAPE_GLSL}

  float line(float d, float w) {
    float fw = fwidth(d) + 1e-4;
    return 1.0 - smoothstep(w, w + fw * 1.5, d);
  }

  void main() {
    float x = vPolar.x;
    float a = vPolar.y;
    float deep = vSag * uOpenK;
    // Light dies with depth; the far wall, turned to the camera, catches it.
    float dm = max(-vWorld.y, 0.0);
    float shade = exp(-dm * uDepthFalloff);
    vec2 rd = vec2(cos(a), sin(a));
    vec3 Nw = normalize(vec3(-rd.x * vSlope, 1.0, -rd.y * vSlope));
    vec3 Vw = normalize(cameraPosition - vWorld);
    float lit = 0.4 + 0.6 * uWallLight * pow(max(dot(Nw, Vw), 0.0), 1.5);

    // The sheet's grid: rings flowing inward, spokes winding into a spiral.
    float rp = fract(x * uRings + uFlow);
    float ringL = line(min(rp, 1.0 - rp), uLineWidth * uRings * 0.5);
    float sp = fract(a / 6.2831853 * uSpokes + uTwist * pow(abs(1.0 - x), 2.0));
    float spokeL = line(min(sp, 1.0 - sp), uLineWidth * uSpokes * 0.08) * smoothstep(0.02, 0.12, x);
    float grid = max(ringL, spokeL * 0.85);
    // Steeper wall, brighter lines — the sheet is stretched there.
    float stretch = 1.0 + clamp(abs(vSlope), 0.0, 3.0) * 0.4;

    // Four stops: dark sheet at the lip, the saturated body on the lit wall,
    // the abyss below; the grid is the only bright thing, and it dies with depth.
    float band = smoothstep(0.08, 0.45, deep) * (1.0 - smoothstep(0.5, 0.92, deep));
    vec3 sheet = mix(uColorSheet, uColorBody, band * lit);
    sheet = mix(sheet, uColorAbyss, smoothstep(0.55, 1.0, deep));
    vec3 col = sheet * shade + uColorGrid * grid * uGridGlow * stretch * lit * shade;

    // The dark matter, in from the rim on a ragged front.
    float en = fbm3(vec3(cos(a) * 2.2, sin(a) * 2.2, uTime * 0.6 + uSeed)) * uFrontNoise;
    float dF = x - (uFront + en * 0.12);
    float drowned = smoothstep(-0.006, 0.006, dF);
    float fband = exp(-pow(abs(dF / max(uFrontWidth, 0.004)), 2.0));
    float veins = pow(max(1.0 - abs(snoise(vec3(vWorld.xz * 0.9, uTime * 0.25 + uSeed))), 0.0), 9.0);
    vec2 cell = floor(vec2(x * 46.0, a * 28.0));
    float star = step(1.0 - uStars * 0.02, hash13(vec3(cell, uSeed)));
    star *= 0.6 + 0.4 * sin(uTime * 5.0 + hash13(vec3(cell, 3.3)) * 40.0);
    // Ink is not flat: spiral arms of the body colour wind down into the eye.
    float sx = log(max(x, 0.015));
    float arm = pow(0.5 + 0.5 * sin(a * uArms - sx * uSpiralTight * 6.0 + uTwist * 4.0), 4.0);
    arm *= 0.6 + 0.4 * snoise(vec3(rd * 3.0, sx * 2.0 + uTime * 0.4 + uSeed));
    // The ink keeps the bowl's shape: body-violet on the lit upper wall,
    // going to black down the throat.
    vec3 ink = mix(uColorBody * uInkBody * lit, uColorInk, smoothstep(0.05, 0.75, deep));
    ink += uColorBody * arm * uSpiralGlow * (0.35 + 0.65 * smoothstep(0.0, 0.6, x)) * lit;
    ink += uColorVein * veins * uVeinGlow + uColorGrid * grid * 0.12 * shade + uColorFront * star * 1.5;
    col = mix(col, ink * mix(1.0, shade, 0.5), drowned);
    col += uColorFront * fband * uFrontGlow * (0.7 + 0.3 * sin(a * 9.0 + uTime * 6.0));

    // The eye: a pit that eats light, ringed by a thin hot ring of bent light.
    float hr = uHorizon * (1.0 + 0.06 * snoise(vec3(rd * 2.5, uTime * 1.3 + uSeed)));
    float pit = 1.0 - smoothstep(hr * 0.92, hr, x);
    float photon = exp(-pow((x - hr) / max(uPhotonWidth, 0.002), 2.0)) * step(0.001, uHorizon);
    photon *= 0.65 + 0.35 * sin(a * 3.0 - uTime * 7.0);
    col = mix(col, uColorAbyss, pit);
    col += uColorPhoton * photon * uPhotonGlow;

    // The rim, where flat floor turns to sheet.
    float rim = exp(-pow(abs((x - 1.0) / 0.018), 2.0));
    col += uColorFront * rim * uRimGlow * uOpenK;

    // Appears, and at the end erodes in patches from the rim in.
    float n = fbm3(vec3(vWorld.xz * 0.7, uSeed * 2.0)) * 0.5 + 0.5;
    float thr = uErode * 1.25 - 0.1;
    float keep = uErode <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.08, mix(n, 1.0 - x, 0.4));
    float alpha = uOpacity * uReveal * keep;
    if (alpha < 0.01) discard;

    // Below the floor: placed just in front of where the view ray crosses it.
    float depthOut = gl_FragCoord.z;
    vec3 ray = vWorld - cameraPosition;
    if (vWorld.y < 0.0 && ray.y < -1e-4) {
      float len = length(ray);
      float t = cameraPosition.y / (cameraPosition.y - vWorld.y);
      // Seen through solid floor (the ray crosses it outside the rim): hidden.
      vec3 cross0 = cameraPosition + ray * t;
      if (length(cross0.xz - uCenter.xz) > uRadius * 1.003) discard;
      float dFloor = t * len;
      // A constant margin in front of the floor. (A bias that decayed with
      // depth let the deep sheet z-fight the floor and lose: the well went
      // outline-only once it was deep or drowned.)
      float dOut = dFloor - uDepthBias;
      float vz = vViewZ * (dOut / len);
      depthOut = viewZToPerspectiveDepth(vz, uCameraNear, uCameraFar);
    }
    gl_FragDepth = depthOut;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/** The well. Writes its own depth — see the file comment. */
export function createWellMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uRadius: { value: 4 },
      uDepth: { value: 0 },
      uThroat: { value: 0.25 },
      uRipple: { value: 0 },
      uRippleFreq: { value: 18 },
      uRipplePhase: { value: 0 },
      uSeed: { value: 0 },
      uOpenK: { value: 0 },
      uRings: { value: 9 },
      uSpokes: { value: 24 },
      uLineWidth: { value: 0.01 },
      uFlow: { value: 0 },
      uTwist: { value: 0 },
      uGridGlow: { value: 2 },
      uFront: { value: 1 },
      uFrontNoise: { value: 1 },
      uFrontGlow: { value: 4 },
      uFrontWidth: { value: 0.03 },
      uRimGlow: { value: 2 },
      uVeinGlow: { value: 0.6 },
      uStars: { value: 1 },
      uReveal: { value: 0 },
      uErode: { value: 0 },
      uOpacity: { value: 1 },
      uDepthBias: { value: 0.08 },
      uColorSheet: { value: new Color() },
      uColorAbyss: { value: new Color() },
      uColorGrid: { value: new Color() },
      uColorFront: { value: new Color() },
      uColorInk: { value: new Color() },
      uColorVein: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorPhoton: { value: new Color() },
      uBowl: { value: 0.5 },
      uBowlPow: { value: 1.5 },
      uDepthFalloff: { value: 0.5 },
      uWallLight: { value: 1 },
      uHorizon: { value: 0 },
      uPhotonGlow: { value: 3 },
      uPhotonWidth: { value: 0.012 },
      uArms: { value: 3 },
      uSpiralTight: { value: 2 },
      uSpiralGlow: { value: 0.8 },
      uInkBody: { value: 0.5 }
    }),
    vertexShader: WELL_VERTEX,
    fragmentShader: WELL_FRAGMENT
  });

  /** @param {object} s { center, radius, open, front, flow, twist, ripplePhase, reveal, erode, seed, horizon } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uRadius.value = Math.max(0.2, s.radius);
    u.uDepth.value = c.wellDepth * s.open;
    u.uThroat.value = c.throat;
    u.uRipple.value = c.rippleAmp * g.noiseStrength * Math.min(1, s.open);
    u.uRippleFreq.value = c.rippleFreq;
    u.uRipplePhase.value = s.ripplePhase;
    u.uSeed.value = s.seed;
    u.uOpenK.value = Math.min(1, Math.max(0, s.open));
    u.uRings.value = Math.max(1, c.gridRings);
    u.uSpokes.value = Math.max(1, Math.round(c.gridSpokes));
    u.uLineWidth.value = c.gridLine;
    u.uFlow.value = s.flow;
    u.uTwist.value = s.twist;
    u.uGridGlow.value = c.gridGlow * g.glow;
    u.uFront.value = s.front;
    u.uFrontNoise.value = c.frontNoise * g.noiseStrength;
    u.uFrontGlow.value = c.frontGlow * g.glow;
    u.uFrontWidth.value = c.frontWidth;
    u.uRimGlow.value = c.rimGlow * g.glow;
    u.uVeinGlow.value = c.veinGlow * g.glow;
    u.uStars.value = c.inkStars;
    u.uReveal.value = s.reveal;
    u.uErode.value = s.erode;
    u.uOpacity.value = g.opacity;
    u.uColorSheet.value.copy(getColor(c.colorSheet));
    u.uColorAbyss.value.copy(getColor(c.colorAbyss));
    u.uColorGrid.value.copy(getColor(c.colorGrid));
    u.uColorFront.value.copy(getColor(c.colorFront));
    u.uColorInk.value.copy(getColor(c.colorInk));
    u.uColorVein.value.copy(getColor(c.colorVein));
    u.uColorBody.value.copy(getColor(c.colorBody));
    u.uColorPhoton.value.copy(getColor(c.colorPhoton));
    u.uBowl.value = c.bowl;
    u.uBowlPow.value = c.bowlPower;
    u.uDepthFalloff.value = c.depthFalloff;
    u.uWallLight.value = c.wallLight * g.fresnel;
    u.uHorizon.value = Math.max(0, s.horizon);
    u.uPhotonGlow.value = c.photonGlow * g.glow * g.shaderIntensity;
    u.uPhotonWidth.value = c.photonWidth;
    u.uArms.value = Math.max(1, Math.round(c.spiralArms));
    u.uSpiralTight.value = c.spiralTight;
    u.uSpiralGlow.value = c.spiralGlow * g.glow;
    u.uInkBody.value = c.inkBody * g.glow;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The curtain                                                          */
/* -------------------------------------------------------------------- */

const CURTAIN_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;      // metres, where the front is
  uniform float uHeight;
  uniform float uLean;        // share of the radius the crest leans in
  uniform float uDrop;        // metres pulled down the throat
  uniform float uSway;
  uniform float uFlow;
  uniform float uSeed;

  varying vec2  vCyl;         // x: bearing radians, y: 0 foot .. 1 crest
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  varying float vWorldY;

  ${noiseGLSL}

  void main() {
    float a = position.x * 6.2831853;
    float v = position.y;
    vec3 radial = vec3(cos(a), 0.0, sin(a));
    float r = uRadius * (1.0 - uLean * v * v);
    r += snoise(vec3(radial.xz * 1.6, v * 1.3 - uFlow * 0.5 + uSeed)) * uSway * v;
    vec3 world = uCenter + radial * max(r, 0.02);
    world.y = v * uHeight - uDrop;
    vCyl = vec2(a, v);
    vNormalW = radial;
    vViewDir = cameraPosition - world;
    vWorldY = world.y;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const CURTAIN_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uFlow;
  uniform float uTendrils;
  uniform float uCrestLow;    // the lowest the ragged crest dips, 0..1
  uniform float uEdgeGlow;
  uniform float uRimGlow;
  uniform float uFootGlow;
  uniform float uStreakGlow;
  uniform float uOpacity;
  uniform float uSoftFade;
  uniform vec3  uColorInk;
  uniform vec3  uColorEdge;
  uniform vec3  uColorCrest;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;

  varying vec2  vCyl;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  varying float vWorldY;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float a = vCyl.x;
    float v = vCyl.y;
    vec2 ring = vec2(cos(a), sin(a));
    // Tongues of dark matter: the crest is cut on noise, flowing upward.
    float n = fbm3(vec3(ring * uTendrils * 0.35, v * 0.5 - uFlow * 0.35 + uSeed)) * 0.5 + 0.5;
    float cut = mix(uCrestLow, 1.0, n);
    if (v > cut) discard;
    float edge = smoothstep(cut - 0.14, cut, v);
    // Streaks running up the wall.
    float streak = pow(max(snoise(vec3(ring * uTendrils, v * 0.7 - uFlow)) * 0.5 + 0.5, 0.0), 4.0);
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float fres = pow(abs(1.0 - abs(dot(N, V))), 2.0);
    float foot = exp(-v * 7.0);

    vec3 col = uColorInk;
    col += uColorEdge * (fres * uRimGlow + streak * uStreakGlow + foot * uFootGlow);
    col += uColorCrest * edge * uEdgeGlow;

    float alpha = uOpacity * mix(0.88, 1.0, edge);
    if (vWorldY < -0.02) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/** The wall of dark matter standing on the front. */
export function createCurtainMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uRadius: { value: 4 },
      uHeight: { value: 1.5 },
      uLean: { value: 0.3 },
      uDrop: { value: 0 },
      uSway: { value: 0.2 },
      uFlow: { value: 0 },
      uSeed: { value: 0 },
      uTendrils: { value: 9 },
      uCrestLow: { value: 0.4 },
      uEdgeGlow: { value: 3 },
      uRimGlow: { value: 2 },
      uFootGlow: { value: 2 },
      uStreakGlow: { value: 1 },
      uOpacity: { value: 1 },
      uSoftFade: { value: 0.3 },
      uColorInk: { value: new Color() },
      uColorEdge: { value: new Color() },
      uColorCrest: { value: new Color() }
    }),
    vertexShader: CURTAIN_VERTEX,
    fragmentShader: CURTAIN_FRAGMENT
  });

  /** @param {object} s { center, radius, height, drop, flow, seed, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uRadius.value = Math.max(0.02, s.radius);
    u.uHeight.value = Math.max(0.01, s.height);
    u.uLean.value = c.curtainLean;
    u.uDrop.value = s.drop;
    u.uSway.value = c.curtainSway * g.noiseStrength;
    u.uFlow.value = s.flow;
    u.uSeed.value = s.seed;
    u.uTendrils.value = c.tendrils * g.noiseFrequency;
    u.uCrestLow.value = c.crestLow;
    u.uEdgeGlow.value = c.crestGlow * g.glow;
    u.uRimGlow.value = c.curtainRim * g.glow * g.fresnel;
    u.uFootGlow.value = c.footGlow * g.glow;
    u.uStreakGlow.value = c.streakGlow * g.glow;
    u.uOpacity.value = c.curtainOpacity * g.opacity * s.fade;
    u.uSoftFade.value = c.softFade;
    u.uColorInk.value.copy(getColor(c.colorInk));
    u.uColorEdge.value.copy(getColor(c.colorEdge));
    u.uColorCrest.value.copy(getColor(c.colorCrest));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The seed                                                             */
/* -------------------------------------------------------------------- */

const BILLBOARD_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vUv;

  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = uCenter + (right * position.x + up * position.y) * uSize;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SEED_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform vec3  uColorInk;
  uniform vec3  uColorRing;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float a = atan(vUv.y, vUv.x);
    // A black bead in a thin, lensed, uneven ring of light.
    float core = 1.0 - smoothstep(0.36, 0.42, r);
    float wob = 0.03 * snoise(vec3(cos(a) * 2.0, sin(a) * 2.0, uTime * 3.0 + uSeed));
    float ringD = (r - 0.46 - wob) / 0.035;
    float ring = exp(-ringD * ringD) * (0.7 + 0.3 * sin(a * 3.0 - uTime * 9.0));
    float halo = exp(-max(r - 0.46, 0.0) * 7.0) * (1.0 - core) * 0.45;
    vec3 col = uColorInk * core + uColorRing * (ring * 3.0 + halo) * uIntensity;
    float alpha = clamp(core + ring + halo, 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, r)) * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col * uGlobalGlow, alpha);
  }
`;

/** The thrown seed of dark matter. */
export function createSeedMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 0.5 },
      uSeed: { value: 0 },
      uIntensity: { value: 1 },
      uOpacity: { value: 1 },
      uColorInk: { value: new Color() },
      uColorRing: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: SEED_FRAGMENT
  });

  /** @param {object} s { center, size, seed, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = Math.max(0.01, s.size);
    u.uSeed.value = s.seed;
    u.uIntensity.value = c.seedGlow * g.glow;
    u.uOpacity.value = s.fade * g.opacity;
    u.uColorInk.value.copy(getColor(c.colorInk));
    u.uColorRing.value.copy(getColor(c.colorFront));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The lens — LAYER.DISTORTION                                          */
/* -------------------------------------------------------------------- */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  uniform float uLift;
  varying vec2 vXZ;

  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uSize;
    world.y = uLift;
    vXZ = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFront;
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec2 vXZ;

  ${noiseGLSL}

  void main() {
    float r = length(vXZ);
    if (r > 1.0) discard;
    vec2 inward = -vXZ / max(r, 1e-3);
    float onFront = exp(-pow(abs((r - uFront) / 0.1), 2.0));
    float toEye = (1.0 - smoothstep(0.0, 0.6, r)) * 0.6;
    float churn = snoise(vec3(vXZ * 4.0, uTime * 1.5)) * 0.3;
    float mask = (onFront + toEye) * (1.0 - smoothstep(0.9, 1.0, r));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    vec2 dir = normalize(inward + vec2(churn, -churn));
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
  }
`;

/** The pull of the well on the light round it. */
export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 5 },
      uLift: { value: 0.3 },
      uFront: { value: 1 },
      uStrength: { value: 1 }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {object} s { center, radius, front, strength } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = Math.max(0.2, s.radius * 1.15);
    u.uLift.value = c.lensHeight;
    u.uFront.value = s.front / 1.15;
    u.uStrength.value = c.lensStrength * g.distortion * s.strength;
  };

  return material;
}
