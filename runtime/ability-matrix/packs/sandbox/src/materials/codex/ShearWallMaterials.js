import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'shearwall';

/**
 * Shear Wall — the three bespoke shaders.
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
 *  - **the lens** (`createShearLensMaterial`) — the same wall, deeper, on
 *    `LAYER.DISTORTION`, pushing the world sideways row by row: alternate rows
 *    opposite ways. That is what makes it read as *shear* rather than glow.
 *  - **the drag marks** (`createShearGroundMaterial`) — a floor strip behind
 *    the wall: parallel scrape grooves that **step sideways** at every place
 *    the wall snapped, a scoured band, fresh-glowing near the wall, eroding.
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

  float tri(float x) { return abs(fract(x) - 0.5) * 4.0 - 1.0; }

  float rowOf(float v) { return min(floor(v * max(uRows, 1.0)), max(uRows, 1.0) - 1.0); }
  float rowSign(float row) { return mod(row, 2.0) < 0.5 ? 1.0 : -1.0; }

  vec3 wallPoint(float u, float v, out float fold, out float row) {
    row = rowOf(v);
    float sgn = rowSign(row);
    float shift = uShift * sgn * (0.75 + 0.5 * fract(sin(row * 12.9898 + uSeed) * 43758.5453));
    float lateral = u * uWidth + shift + sign(u) * uSplit;
    fold = tri(u * uSlabs + row * 0.5 + uShift * 0.25);
    float along = fold * uFold * uDepthScale - uBow * 4.0 * u * u + uLean * v;
    vec3 p = uCenter + uSide * lateral + uDir * along;
    p.y = v * uHeight;
    return p;
  }
`;

const WALL_VERTEX = /* glsl */ `
  varying vec2  vUv;
  varying float vFold;
  varying float vRow;
  varying vec3  vWorld;
  varying float vViewZ;

  ${WALL_GLSL}

  void main() {
    float u = position.x;
    float v = position.y;
    float fold;
    float row;
    vec3 world = wallPoint(u, v, fold, row);
    vUv = vec2(u, v);
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

    vec3 col = mix(uColorC, uColorB, flow) * uBodyGlow;
    col += uColorA * pow(flow, 3.0) * uStreakGlow;
    col += uColorA * ridge * uRidgeGlow * (0.5 + 0.5 * flow);
    col += uColorSeam * seam * uSeamGlow * (0.35 + uSeamFlash * 2.5);

    // A torn top, a foot feathered into the dust, soft ends.
    float tear = snoise(vec3(x * 0.9, uTime * 0.8, uSeed)) * 0.5 + 0.5;
    float top = 1.0 - smoothstep(1.0 - uTopTear * (0.4 + 0.6 * tear), 1.0, vUv.y);
    float foot = smoothstep(0.0, max(uFootFade, 0.01), vUv.y);
    float ends = 1.0 - smoothstep(0.38, 0.5, abs(vUv.x));
    float mask = top * foot * ends * (0.2 + 0.8 * flow + ridge * 0.4 + seam);
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
    uDepthScale: { value: 1 }
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
    u.uColorA.value.copy(getColor(c.colorAirA));
    u.uColorB.value.copy(getColor(c.colorAirB));
    u.uColorC.value.copy(getColor(c.colorAirC));
    u.uColorSeam.value.copy(getColor(c.colorSeam));
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
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uReach;       // metres the wall's foot has reached
  uniform float uWidth;
  uniform float uSnapSpacing; // metres between snaps
  uniform float uStep;        // metres the grooves jump sideways at a snap
  uniform float uGrooves;     // grooves per metre
  uniform float uGrooveGlow;
  uniform float uScour;
  uniform float uFresh;       // metres of fresh glow behind the wall
  uniform float uErode;
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3  uColorScour;
  uniform vec3  uColorGroove;
  uniform vec3  uColorFresh;
  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float halfW = uWidth * 0.5;
    // Which snap this stretch of floor was dragged under; its sideways offset.
    float k = floor(vP.x / max(uSnapSpacing, 0.1));
    float off = (mod(k, 2.0) < 0.5 ? 1.0 : -1.0) * uStep * (0.6 + 0.4 * hash11(k + uSeed));
    float lane = (vP.y + off) * uGrooves;
    float wob = snoise(vec3(vP * vec2(0.3, 1.5), uSeed)) * 0.15;
    float g = abs(fract(lane + wob) - 0.5);
    float groove = 1.0 - smoothstep(0.05, 0.18, g);
    float laneId = floor(lane + wob);
    groove *= step(0.35, hash11(laneId * 3.7 + k * 1.3 + uSeed));
    // A bright notch across the floor where each snap jolted it.
    float edge = fract(vP.x / max(uSnapSpacing, 0.1));
    float notch = (1.0 - smoothstep(0.0, 0.025, edge)) * step(uSnapSpacing, vP.x) * 0.5;

    float behind = step(vP.x, uReach);
    float sideFade = 1.0 - smoothstep(halfW * 0.7, halfW, abs(vP.y));
    float startFade = smoothstep(0.4, 1.6, vP.x);
    float lit = behind * sideFade * startFade;
    float fresh = exp(-max(uReach - vP.x, 0.0) / max(uFresh, 0.05));

    vec3 col = uColorScour;
    col = mix(col, uColorGroove, max(groove, notch * 0.7));
    col += uColorFresh * (groove + notch) * fresh * uGrooveGlow * uGlobalGlow * uShaderIntensity;
    float a = lit * max(uScour, max(groove, notch) * 0.9);

    float en = snoise(vec3(vP * 1.2, uSeed * 2.0)) * 0.5 + 0.5;
    float t = uErode * 1.3 - 0.15;
    a *= smoothstep(t, t + 0.15, mix(en, groove, 0.3));
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
      uFresh: { value: 2 },
      uErode: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uColorScour: { value: new Color() },
      uColorGroove: { value: new Color() },
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
    u.uWidth.value = c.wallWidth * 0.9;
    u.uReach.value = st.reach;
    u.uSnapSpacing.value = Math.max(0.1, st.snapSpacing);
    u.uStep.value = c.groundStep;
    u.uGrooves.value = c.grooveDensity;
    u.uGrooveGlow.value = c.grooveGlow * g.glow;
    u.uScour.value = c.groundScour;
    u.uFresh.value = c.freshLength;
    u.uErode.value = st.erode;
    u.uSeed.value = st.seed;
    u.uOpacity.value = g.opacity;
    u.uColorScour.value.copy(getColor(c.colorScour));
    u.uColorGroove.value.copy(getColor(c.colorGroove));
    u.uColorFresh.value.copy(getColor(c.colorAirA));
  };

  return material;
}
