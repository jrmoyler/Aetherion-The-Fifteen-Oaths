import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'shearwall';

/**
 * Shear Wall — the four bespoke shaders.
 *
 *  - **the wall** (`createShearWallMaterial`) — a grid in parameter space
 *    (x −0.5..0.5 across, y 0..1 up) stood across the line in the vertex
 *    stage. In plan it is **pleated**: a triangle wave along its width folds
 *    it into an accordion of slabs, so it has depth and catches light on
 *    every ridge. In elevation it is cut into **rows** that are shoved
 *    sideways in alternate directions — the shear — by an amount the CPU
 *    snaps from one side to the other on a spring. At the end of the line the
 *    two halves are torn apart laterally. The fragment streams air *sideways*
 *    inside every row (alternate rows opposite ways, so the eye reads layers
 *    sliding past each other), lights the fold ridges and the row seams (the
 *    seams flash white on every snap), tears the top edge with noise and
 *    feathers the foot into the dust; a soft depth fade and a dissolve on the
 *    way out.
 *  - **the body** (`createShearBodyMaterial`) — the same wall as a stack of
 *    slices through `wallThickness`, normal-blended on the four-stop ramp
 *    down to a deep teal and shaded by the sun through the fold normals: the
 *    mass under the bright additive skin.
 *  - **the lens** (`createShearLensMaterial`) — the same wall, deeper, on
 *    `LAYER.DISTORTION`, pushing the world sideways row by row: alternate rows
 *    opposite ways. That is what makes it read as *shear* rather than glow.
 *  - **the scour** (`createShearGroundMaterial`) — a filled floor band behind
 *    the wall: bare floor scoured dark, dust combed flat along the line,
 *    grooves that **step sideways** at every place the wall snapped, dust
 *    heaped into berms at both edges, loose dust that keeps drifting sideways
 *    through the linger, fresh-glowing near the wall, eroding at the end.
 *
 * Every material reads `settings.shearwall` in `userData.sync()`.
 */

const WALL_GLSL = /* glsl */ `
  uniform vec3  uCenter;      // the wall's foot, on the line
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uWidth;
  uniform float uHeight;
  uniform float uSlabs;
  uniform float uFold;        // metres of pleat depth
  uniform float uRows;
  uniform float uShift;       // metres the rows are shoved sideways (signed)
  uniform float uSplit;       // metres the halves have been torn apart
  uniform float uBow;         // metres the ends trail behind the middle
  uniform float uLean;        // metres the top leans forward
  uniform float uSeed;
  uniform float uDepthScale;  // the lens is a deeper wall
  uniform float uThick;       // metres of body: the slice stack spans this along the line
  uniform float uLift;        // metres the torn halves have risen
  uniform float uCurl;        // metres the crest curls forward over the front
  uniform float uRowBlend;    // 0 = rows cut hard, 1 = the shear bends smoothly through one mass
  uniform float uRowPhase;    // 0 = pleats run straight up every row (one mass), 1 = alternate rows flipped
  uniform float uWaves;       // half-waves the smooth shear makes up the wall (0 = follow the rows)

  float tri(float x) { return abs(fract(x) - 0.5) * 4.0 - 1.0; }

  float rowOf(float v) { return min(floor(v * max(uRows, 1.0)), max(uRows, 1.0) - 1.0); }
  float rowSign(float row) { return mod(row, 2.0) < 0.5 ? 1.0 : -1.0; }

  vec3 wallPoint(float u, float v, float slice, out float fold, out float row) {
    row = rowOf(v);
    float sgn = rowSign(row);
    float hard = uShift * sgn * (0.75 + 0.5 * fract(sin(row * 12.9898 + uSeed) * 43758.5453));
    // Smooth shear: the same alternate shove, but bending continuously from
    // row to row, so the wall sways as one sheared slab instead of bands.
    float waves = uWaves > 0.01 ? uWaves : max(uRows, 1.0);
    float smoothS = uShift * sin((v - 0.5) * waves * 3.14159265 + (uWaves > 0.01 ? 0.0 : 0.5 * waves * 3.14159265));
    float shift = mix(hard, smoothS, uRowBlend);
    float lateral = u * uWidth + shift + sign(u) * uSplit;
    fold = tri(u * uSlabs + row * 0.5 * uRowPhase + uShift * 0.25);
    // The crest curls forward and over, like the lip of a breaking wave:
    // the whole wall reads as one leaning, curling front with a back to it.
    float cr = smoothstep(0.35, 1.0, v);
    float along = fold * uFold * uDepthScale * (1.0 - 0.5 * cr) - uBow * 4.0 * u * u + uLean * v
      + uCurl * cr * cr + slice * uThick;
    vec3 p = uCenter + uSide * lateral + uDir * along;
    // The body is thickest at the foot and thins towards the torn top.
    float droop = smoothstep(0.7, 1.0, v);
    p.y = v * uHeight - uCurl * 0.45 * droop * droop + uLift * v * (0.5 + abs(u));
    return p;
  }
`;

const WALL_VERTEX = /* glsl */ `
  varying vec2  vUv;
  varying float vFold;
  varying float vRow;
  varying vec3  vWorld;
  varying float vViewZ;
  varying float vSlice;

  ${WALL_GLSL}

  void main() {
    float u = position.x;
    float v = position.y;
    float fold;
    float row;
    // position.z is the slice (−0.5..0.5) for the body stack; 0 for the skin and lens.
    vec3 world = wallPoint(u, v, position.z * (1.0 - 0.55 * v), fold, row);
    vUv = vec2(u, v);
    vSlice = position.z;
    vFold = fold;
    vRow = row;
    vWorld = world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const WALL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uWidth;
  uniform float uHeight;
  uniform float uRows;
  uniform float uRowBlend;
  uniform float uSeed;
  uniform float uSplit;
  uniform float uFlow;         // integrated lateral flow, metres
  uniform float uStreakScale;
  uniform float uStreakGlow;
  uniform float uBodyGlow;
  uniform float uRidgeGlow;
  uniform float uSeamGlow;
  uniform float uSeamFlash;    // 0..1, decays after every snap
  uniform float uTopTear;
  uniform float uFootFade;
  uniform float uDissolve;
  uniform float uSoftFade;
  uniform float uOpacity;
  uniform float uSkinFocus;    // 0 = streaks everywhere, 1 = streaks only on the curling lip
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorSeam;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vUv;
  varying float vFold;
  varying float vRow;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float rows = max(uRows, 1.0);
    float sgn = mod(vRow, 2.0) < 0.5 ? 1.0 : -1.0;
    float x = vUv.x * uWidth;
    float y = vUv.y * uHeight;

    // Air streaming sideways, alternate rows opposite ways.
    vec3 sp = vec3((x - sgn * uFlow) * uStreakScale * 0.25, y * uStreakScale * 2.2, vRow * 7.0 + uSeed);
    float streak = fbm3(sp);
    streak = smoothstep(0.3, 0.85, streak * 0.5 + 0.5);
    float fine = snoise(vec3((x - sgn * uFlow * 1.6) * uStreakScale * 0.6, y * uStreakScale * 6.0, vRow + uSeed * 2.0)) * 0.5 + 0.5;
    float flow = streak * (0.6 + 0.4 * fine);

    // Ridges of the pleat and seams between the rows.
    float ridge = smoothstep(0.7, 1.0, abs(vFold));
    float inRow = fract(vUv.y * rows);
    float seam = 1.0 - smoothstep(0.0, 0.06, min(inRow, 1.0 - inRow));
    seam *= step(0.5 / rows, vUv.y) * step(vUv.y, 1.0 - 0.5 / rows);
    seam *= 1.0 - 0.85 * uRowBlend;

    vec3 col = mix(uColorC, uColorB, flow) * uBodyGlow;
    col += uColorA * pow(flow, 3.0) * uStreakGlow;
    col += uColorA * ridge * uRidgeGlow * (0.5 + 0.5 * flow);
    col += uColorSeam * seam * uSeamGlow * (0.35 + uSeamFlash * 2.5);

    // A torn top, a foot feathered into the dust, soft ends.
    float tear = snoise(vec3(x * 0.9, uTime * 0.8, uSeed)) * 0.5 + 0.5;
    float top = 1.0 - smoothstep(1.0 - uTopTear * (0.4 + 0.6 * tear), 1.0, vUv.y);
    float foot = smoothstep(0.0, max(uFootFade, 0.01), vUv.y);
    float ends = 1.0 - smoothstep(0.38, 0.5, abs(vUv.x));
    float lipS = smoothstep(0.7, 0.9, vUv.y);
    // Focused: a soft sheet of streaming light on the lip only (no fine speckle).
    float lipFlow = lipS * smoothstep(0.15, 0.75, streak);
    float mask = top * foot * ends * (mix(0.2 + 0.8 * flow, lipFlow, uSkinFocus) + ridge * 0.4 * (1.0 - 0.6 * uSkinFocus) + seam);
    // Torn in two: the strip of triangles stretched across the middle is the gap.
    if (uSplit > 0.001) mask *= smoothstep(0.0045, 0.0085, abs(vUv.x));

    if (uDissolve > 0.0) {
      float n = snoise(vec3(x * 0.8, y * 1.6, uSeed * 3.0)) * 0.5 + 0.5;
      float thr = uDissolve * 1.15 - 0.08;
      float keep = smoothstep(thr, thr + 0.08, n * 0.7 + flow * 0.3);
      col += uColorSeam * (1.0 - smoothstep(thr, thr + 0.06, n * 0.7 + flow * 0.3)) * keep * 0.8;
      mask *= keep;
    }

    mask *= uOpacity;
    if (mask < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (mask < 0.004) discard;
    gl_FragColor = vec4(col * mask * uGlobalGlow * mix(1.0, uShaderIntensity, 0.5), 1.0);
  }
`;

function wallShapeUniforms() {
  return {
    uCenter: { value: new Vector3() },
    uDir: { value: new Vector3(0, 0, 1) },
    uSide: { value: new Vector3(1, 0, 0) },
    uWidth: { value: 6 },
    uHeight: { value: 3 },
    uSlabs: { value: 4 },
    uFold: { value: 0.4 },
    uRows: { value: 3 },
    uShift: { value: 0 },
    uSplit: { value: 0 },
    uBow: { value: 0.5 },
    uLean: { value: 0.3 },
    uSeed: { value: 0 },
    uDepthScale: { value: 1 },
    uThick: { value: 0 },
    uLift: { value: 0 },
    uCurl: { value: 0 },
    uRowPhase: { value: 1 },
    uRowBlend: { value: 0 },
    uWaves: { value: 0 }
  };
}

/** @param {object} st { center, dir, side, shift, split, grow, seed } */
function syncWallShape(u, st) {
  const c = settings[ID];
  u.uCenter.value.copy(st.center);
  u.uDir.value.copy(st.dir);
  u.uSide.value.copy(st.side);
  u.uWidth.value = Math.max(0.2, c.wallWidth * st.grow);
  u.uHeight.value = Math.max(0.1, c.wallHeight * st.grow);
  u.uSlabs.value = Math.max(0.5, c.pleats);
  u.uFold.value = c.pleatDepth;
  u.uRows.value = Math.max(1, Math.round(c.rows));
  u.uShift.value = st.shift;
  u.uSplit.value = st.split;
  u.uBow.value = c.wallBow;
  u.uLean.value = c.wallLean;
  u.uSeed.value = st.seed;
  u.uThick.value = 0;
  u.uLift.value = st.lift || 0;
  u.uCurl.value = c.wallCurl * st.grow;
  u.uRowPhase.value = c.pleatRowPhase;
  u.uRowBlend.value = c.rowBlend;
  u.uWaves.value = c.shearWaves ?? 0;
}

/** The pleated, sheared wall. Additive. */
export function createShearWallMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...wallShapeUniforms(),
      uFlow: { value: 0 },
      uStreakScale: { value: 1 },
      uStreakGlow: { value: 2 },
      uBodyGlow: { value: 0.5 },
      uRidgeGlow: { value: 1.5 },
      uSeamGlow: { value: 2 },
      uSeamFlash: { value: 0 },
      uTopTear: { value: 0.35 },
      uFootFade: { value: 0.15 },
      uDissolve: { value: 0 },
      uSoftFade: { value: 0.4 },
      uOpacity: { value: 1 },
      uSkinFocus: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorSeam: { value: new Color() }
    }),
    vertexShader: WALL_VERTEX,
    fragmentShader: WALL_FRAGMENT
  });

  /** @param {object} st the shape state plus { flow, flash, dissolve, fade } */
  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncWallShape(u, st);
    u.uDepthScale.value = 1;
    u.uFlow.value = st.flow;
    u.uStreakScale.value = c.streakScale * g.noiseFrequency;
    u.uStreakGlow.value = c.streakGlow * g.glow;
    u.uBodyGlow.value = c.bodyGlow * g.glow;
    u.uRidgeGlow.value = c.ridgeGlow * g.glow;
    u.uSeamGlow.value = c.seamGlow * g.glow;
    u.uSeamFlash.value = st.flash;
    u.uTopTear.value = c.topTear * g.noiseStrength;
    u.uFootFade.value = c.footFade;
    u.uDissolve.value = st.dissolve;
    u.uSoftFade.value = c.softFade;
    u.uOpacity.value = c.wallOpacity * g.opacity * st.fade;
    u.uSkinFocus.value = c.skinFocus ?? 0;
    u.uColorA.value.copy(getColor(c.colorAirA));
    u.uColorB.value.copy(getColor(c.colorAirB));
    u.uColorC.value.copy(getColor(c.colorAirC));
    u.uColorSeam.value.copy(getColor(c.colorSeam));
  };

  return material;
}

/* ==================================================================== */
/* The body                                                               */
/* ==================================================================== */

const BODY_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uWidth;
  uniform float uHeight;
  uniform float uRows;
  uniform float uRowBlend;
  uniform float uSeed;
  uniform float uSplit;
  uniform float uFlow;
  uniform float uStreakScale;
  uniform float uDensity;      // 0..1 how lumpy the packed air is
  uniform float uAlpha;        // per-slice opacity
  uniform float uLightAmt;     // how much the sun shapes the folds
  uniform float uRim;          // grazing-angle brightening
  uniform float uSeamGlow;
  uniform float uSeamFlash;
  uniform float uTopTear;
  uniform float uFootFade;
  uniform float uDissolve;
  uniform float uSoftFade;
  uniform vec3  uColorA;       // pale tint
  uniform vec3  uColorB;       // saturated body
  uniform vec3  uColorC;       // dark
  uniform vec3  uColorD;       // deep
  uniform vec3  uLightDir;
  uniform float uCrease;       // 0..1 how deep the upright creases sink
  uniform float uLip;          // brightness of the curling crest's edge
  uniform float uCore;         // 0..1 how much of each slice is solid regardless of the lumps
  uniform float uRib;          // brightness of the upright rib crests

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;

  varying vec2  vUv;
  varying float vFold;
  varying float vRow;
  varying vec3  vWorld;
  varying float vViewZ;
  varying float vSlice;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float rows = max(uRows, 1.0);
    float sgn = mod(vRow, 2.0) < 0.5 ? 1.0 : -1.0;
    float x = vUv.x * uWidth;
    float y = vUv.y * uHeight;

    // Packed air: big lumps streaming sideways with the row, a different cut per slice.
    vec3 sp = vec3((x - sgn * uFlow * 0.7) * uStreakScale * 0.18, y * uStreakScale * 0.9, vRow * 5.0 + vSlice * 3.1 + uSeed);
    float lump = mix(fbm3(sp) * 0.5 + 0.5, 0.6, smoothstep(0.5, 0.75, vUv.y));
    float dens = mix(1.0, smoothstep(0.25, 0.8, lump), uDensity);

    // Lit like a folded mass: the folds face the sun or turn from it.
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    vec3 v = normalize(cameraPosition - vWorld);
    if (dot(n, v) < 0.0) n = -n;
    float lam = 0.35 + 0.65 * max(dot(n, normalize(uLightDir)), 0.0);
    // Where the crest curls over, the derivative normals flip pixel to pixel:
    // calm the shading there so the curl reads as one smooth dark lip.
    float calm = smoothstep(0.5, 0.75, vUv.y);
    lam = mix(lam, 0.6, calm);
    float shade = mix(1.0, lam, uLightAmt);
    float rim = pow(1.0 - abs(dot(n, v)), 2.5) * uRim * (1.0 - calm);

    float inRow = fract(vUv.y * rows);
    float seam = 1.0 - smoothstep(0.0, 0.08, min(inRow, 1.0 - inRow));
    seam *= step(0.5 / rows, vUv.y) * step(vUv.y, 1.0 - 0.5 / rows);
    seam *= 1.0 - 0.85 * uRowBlend;

    // Four-stop ramp: deep at the foot and in the gaps, body, pale on the lit folds.
    float h = vUv.y;
    float lit = dens * shade;
    vec3 col = mix(uColorD, uColorC, smoothstep(0.0, 0.25, h) * smoothstep(0.1, 0.5, dens));
    col = mix(col, uColorB, smoothstep(0.25, 0.85, lit) * 0.9);
    col = mix(col, uColorA, smoothstep(0.92, 1.0, lit) * 0.25);
    col *= 0.55 + 0.45 * shade;
    // Upright shear ribs: the pleats run straight up the mass, the creases
    // sinking to the deep tone, so the wall has vertical structure.
    float crease = 1.0 - smoothstep(0.0, 0.55, abs(vFold));
    col = mix(col, uColorD, crease * uCrease);
    // Only the curling lip of the crest catches a pale edge.
    float lip = smoothstep(0.72, 0.9, h) * (1.0 - smoothstep(0.93, 1.0, h));
    col += uColorA * lip * uLip * (0.4 + 0.6 * shade);
    // Light on the rib crests only — thin upright highlights on the dark mass.
    float rib = smoothstep(0.82, 0.98, abs(vFold)) * smoothstep(0.08, 0.3, h);
    col += mix(uColorB, uColorA, 0.35) * rib * uRib * (0.3 + 0.7 * shade) * (0.6 + 0.4 * dens);
    col += uColorA * rim;
    col += uColorA * seam * uSeamGlow * (0.15 + uSeamFlash * 1.2);

    float tear = snoise(vec3(x * 0.9, uTime * 0.8, uSeed)) * 0.5 + 0.5;
    float top = 1.0 - smoothstep(1.0 - uTopTear * (0.5 + 0.5 * tear), 1.0, vUv.y);
    float foot = smoothstep(0.0, max(uFootFade * 0.5, 0.01), vUv.y);
    float ends = 1.0 - smoothstep(0.36, 0.5, abs(vUv.x));
    float a = uAlpha * top * foot * ends * mix(0.35 + 0.65 * dens, 1.0, uCore) * (1.0 - 0.4 * abs(vSlice) * 2.0);
    if (uSplit > 0.001) a *= smoothstep(0.006, 0.02, abs(vUv.x));

    if (uDissolve > 0.0) {
      float nn = snoise(vec3(x * 0.8, y * 1.6, uSeed * 3.0 + vSlice)) * 0.5 + 0.5;
      float d = uDissolve * uDissolve;
      float thr = d * 1.15 - 0.08;
      float keep = smoothstep(thr, thr + 0.12, nn * 0.7 + dens * 0.3);
      a *= keep;
    }
    if (a < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    a *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * mix(1.0, uGlobalGlow, 0.5), clamp(a, 0.0, 1.0));
  }
`;

/**
 * The wall's body — a stack of slices through its thickness, normal-blended,
 * coloured on the four-stop ramp down to the deep tone and shaded by the sun
 * through the fold normals, so the wall has mass and a dark core under the
 * bright additive skin.
 */
export function createShearBodyMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: true,
    uniforms: sharedUniforms({
      ...wallShapeUniforms(),
      uFlow: { value: 0 },
      uStreakScale: { value: 1 },
      uDensity: { value: 0.6 },
      uAlpha: { value: 0.2 },
      uLightAmt: { value: 0.7 },
      uRim: { value: 0.4 },
      uSeamGlow: { value: 1 },
      uSeamFlash: { value: 0 },
      uTopTear: { value: 0.35 },
      uFootFade: { value: 0.15 },
      uDissolve: { value: 0 },
      uSoftFade: { value: 0.4 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorD: { value: new Color() },
      uCrease: { value: 0.5 },
      uLip: { value: 0.3 },
      uCore: { value: 0 },
      uRib: { value: 0 }
    }),
    vertexShader: WALL_VERTEX,
    fragmentShader: BODY_FRAGMENT
  });

  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncWallShape(u, st);
    u.uThick.value = c.wallThickness * st.grow;
    u.uFlow.value = st.flow;
    u.uStreakScale.value = c.streakScale * g.noiseFrequency;
    u.uDensity.value = c.bodyDensity * g.noiseStrength;
    u.uAlpha.value = c.bodyOpacity * g.opacity * st.fade;
    u.uLightAmt.value = c.bodyLight;
    u.uRim.value = c.bodyRim * g.fresnel;
    u.uSeamGlow.value = c.seamGlow * g.glow;
    u.uSeamFlash.value = st.flash;
    u.uTopTear.value = c.topTear * g.noiseStrength;
    u.uFootFade.value = c.footFade;
    u.uDissolve.value = st.dissolve;
    u.uSoftFade.value = c.softFade;
    u.uColorA.value.copy(getColor(c.colorAirA));
    u.uColorB.value.copy(getColor(c.colorAirB));
    u.uColorC.value.copy(getColor(c.colorAirC));
    u.uColorD.value.copy(getColor(c.colorAirD));
    u.uCrease.value = c.bodyCrease;
    u.uLip.value = c.crestGlow * g.glow;
    u.uCore.value = c.bodyCore ?? 0;
    u.uRib.value = (c.ribGlow ?? 0) * g.glow;
  };

  return material;
}

/* ==================================================================== */
/* The lens                                                               */
/* ==================================================================== */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uShaderIntensity;
  uniform float uSeamFlash;
  uniform float uRows;
  varying vec2  vUv;
  varying float vFold;
  varying float vRow;

  void main() {
    float sgn = mod(vRow, 2.0) < 0.5 ? 1.0 : -1.0;
    float rows = max(uRows, 1.0);
    float inRow = fract(vUv.y * rows);
    // Each row shoves the world sideways; strongest mid-row, a kink at the seams.
    float body = sin(3.14159265 * inRow);
    float top = 1.0 - smoothstep(0.85, 1.0, vUv.y);
    float ends = 1.0 - smoothstep(0.38, 0.5, abs(vUv.x));
    float mask = top * ends * smoothstep(0.0, 0.08, vUv.y);
    vec2 dir = vec2(sgn, vFold * 0.35);
    float s = uStrength * uShaderIntensity * mask * (0.6 + 0.4 * body) * (1.0 + uSeamFlash);
    if (s < 0.002) discard;
    gl_FragColor = vec4(normalize(dir) * 0.5 + 0.5, s, mask);
  }
`;

/** The shear in the air. LAYER.DISTORTION — see `createAcidFumeMaterial`. */
export function createShearLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...wallShapeUniforms(),
      uStrength: { value: 1 },
      uSeamFlash: { value: 0 }
    }),
    vertexShader: WALL_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncWallShape(u, st);
    u.uDepthScale.value = c.lensDepth;
    u.uStrength.value = c.lensWarp * g.distortion * st.fade * (1 - st.dissolve);
    u.uSeamFlash.value = st.flash;
  };

  return material;
}

/* ==================================================================== */
/* Drag marks                                                             */
/* ==================================================================== */

const GROUND_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uWidth;
  varying vec2 vP;

  void main() {
    float along = position.x * uLength;
    float across = position.y * uWidth * 0.5;
    vP = vec2(along, across);
    vec3 world = uStart + uDir * along + uSide * across;
    world.y = 0.013;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uReach;       // metres the wall's foot has reached
  uniform float uWidth;       // metres across the scoured band, berms included
  uniform float uSnapSpacing; // metres between snaps
  uniform float uStep;        // metres the grooves jump sideways at a snap
  uniform float uGrooves;     // grooves per metre
  uniform float uGrooveGlow;
  uniform float uScour;       // how dark and opaque the scoured band is
  uniform float uBerm;        // the dust piled at both edges
  uniform float uDrift;       // m/s the loose dust keeps drifting sideways
  uniform float uDriftGlow;
  uniform float uFresh;       // metres of fresh glow behind the wall
  uniform float uErode;
  uniform float uSeed;
  uniform float uSign;        // which way the last snap threw the dust
  uniform float uOpacity;
  uniform vec3  uColorDeep;   // the bare, scoured floor
  uniform vec3  uColorScour;  // the combed dust on it
  uniform vec3  uColorGroove;
  uniform vec3  uColorBerm;
  uniform vec3  uColorFresh;
  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float halfW = uWidth * 0.5;
    float ax = abs(vP.y) / max(halfW, 0.01);
    // Which snap this stretch of floor was dragged under; its sideways offset.
    // The sideways step eases over most of a snap, so the combing kinks
    // instead of breaking into a grid of cells.
    float sx = vP.x / max(uSnapSpacing, 0.1);
    float k = floor(sx);
    float offA = (mod(k, 2.0) < 0.5 ? 1.0 : -1.0) * (0.6 + 0.4 * hash11(k + uSeed));
    float offB = (mod(k + 1.0, 2.0) < 0.5 ? 1.0 : -1.0) * (0.6 + 0.4 * hash11(k + 1.0 + uSeed));
    float off = mix(offA, offB, smoothstep(0.35, 1.0, fract(sx))) * uStep;
    // Combed scratches: long, irregular streaks along the line of varying
    // width and strength — no regular lanes, no cross lines.
    float wob = snoise(vec3(vP.x * 0.12, vP.y * 0.4, uSeed + 4.0)) * 0.6;
    float yy = (vP.y + off + wob) * uGrooves;
    float s1 = snoise(vec3(vP.x * 0.09, yy * 1.3, uSeed));
    float s2 = snoise(vec3(vP.x * 0.2, yy * 3.1, uSeed + 9.0));
    float groove = smoothstep(0.35, 0.85, s1 * 0.65 + s2 * 0.35);
    groove *= smoothstep(-0.2, 0.5, snoise(vec3(vP.x * 0.35, yy * 0.25, uSeed + 3.0)));
    float notch = 0.0;

    // Dust combed flat along the line, and loose dust still drifting sideways.
    float comb = fbm3(vec3(vP.x * 0.22, (vP.y + off) * 1.4, uSeed)) * 0.5 + 0.5;
    float drift = fbm3(vec3(vP.x * 0.5, (vP.y - uSign * uTime * uDrift) * 0.9, uSeed + 7.0)) * 0.5 + 0.5;
    drift = smoothstep(0.5, 0.85, drift);

    // The band: scoured in the middle, dust heaped into berms at both edges.
    float band = 1.0 - smoothstep(0.72, 0.86, ax);
    float bermN = snoise(vec3(vP.x * 0.7, ax * 3.0, uSeed + 2.0)) * 0.5 + 0.5;
    float berm = smoothstep(0.66, 0.86, ax) * (1.0 - smoothstep(0.9, 1.0, ax)) * (0.55 + 0.45 * bermN);

    float behind = step(vP.x, uReach);
    float startFade = smoothstep(0.3, 1.4, vP.x);
    float lit = behind * startFade;
    float fresh = exp(-max(uReach - vP.x, 0.0) / max(uFresh, 0.05));

    vec3 col = mix(uColorDeep, uColorScour, smoothstep(0.35, 0.9, comb) * 0.8);
    col = mix(col, uColorGroove, groove * 0.4);
    col = mix(col, uColorBerm, berm);
    col = mix(col, uColorBerm, drift * band * uDriftGlow);
    col += uColorFresh * (groove * 0.6 + notch) * fresh * uGrooveGlow * uGlobalGlow * uShaderIntensity;

    float a = lit * max(band * uScour * (0.75 + 0.25 * comb), berm * uBerm);
    a = max(a, lit * band * drift * uDriftGlow * 0.6);

    float en = snoise(vec3(vP * 1.2, uSeed * 2.0)) * 0.5 + 0.5;
    float t = uErode * 1.3 - 0.15;
    a *= smoothstep(t, t + 0.15, mix(en, comb, 0.3));
    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The floor the wall dragged. Normal blending. */
export function createShearGroundMaterial() {
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
      uWidth: { value: 5 },
      uReach: { value: 0 },
      uSnapSpacing: { value: 2 },
      uStep: { value: 0.3 },
      uGrooves: { value: 3 },
      uGrooveGlow: { value: 1 },
      uScour: { value: 0.4 },
      uBerm: { value: 0.8 },
      uDrift: { value: 1 },
      uDriftGlow: { value: 0.3 },
      uSign: { value: 1 },
      uFresh: { value: 2 },
      uErode: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uColorDeep: { value: new Color() },
      uColorScour: { value: new Color() },
      uColorGroove: { value: new Color() },
      uColorBerm: { value: new Color() },
      uColorFresh: { value: new Color() }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT
  });

  /** @param {object} st { start, dir, side, length, reach, snapSpacing, erode, seed } */
  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(st.start);
    u.uDir.value.copy(st.dir);
    u.uSide.value.copy(st.side);
    u.uLength.value = Math.max(0.1, st.length);
    u.uWidth.value = c.wallWidth * c.groundWidth;
    u.uReach.value = st.reach;
    u.uSnapSpacing.value = Math.max(0.1, st.snapSpacing);
    u.uStep.value = c.groundStep;
    u.uGrooves.value = c.grooveDensity;
    u.uGrooveGlow.value = c.grooveGlow * g.glow;
    u.uScour.value = c.groundScour;
    u.uBerm.value = c.bermAmount;
    u.uDrift.value = c.driftSpeed * g.noiseSpeed;
    u.uDriftGlow.value = c.driftGlow;
    u.uSign.value = st.sign || 1;
    u.uFresh.value = c.freshLength;
    u.uErode.value = st.erode;
    u.uSeed.value = st.seed;
    u.uOpacity.value = g.opacity;
    u.uColorDeep.value.copy(getColor(c.colorScourDeep));
    u.uColorScour.value.copy(getColor(c.colorScour));
    u.uColorGroove.value.copy(getColor(c.colorGroove));
    u.uColorBerm.value.copy(getColor(c.colorBerm));
    u.uColorFresh.value.copy(getColor(c.colorAirA));
  };

  return material;
}
