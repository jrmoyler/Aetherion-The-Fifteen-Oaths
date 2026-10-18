import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Glass Tide — the bespoke shaders the sheet of tide is drawn with.
 *
 *  - **the sheet** (`createTideSheetMaterial(0)`) — a grid stood up along the
 *    line in the vertex stage: a curtain of water, low at its tail and tall at
 *    its head, snaking side to side on a travelling wave (the *whip*), its
 *    crest leaning forward and rolling on noise. Shaded as clear water with a
 *    hard edge: fresnel and the stage sky for reflection, caustic lines
 *    (Voronoi F2−F1) drifting with the flow, streaks racing to the head, a
 *    white-hot crest line torn into spray on top and foam where it meets the
 *    floor. Then the same surface **hardens** (`uHarden`): the flow freezes,
 *    the caustics lock into flat glassy facets; **cracks** race from the head
 *    back to the tail (`uCrack`), and the facets fall out cell by cell
 *    (`uShatter`) as the CPU throws the shards.
 *  - **the lens** (`createTideSheetMaterial(1)`) — the same sheet on
 *    `LAYER.DISTORTION`, bending the world through it along its normal.
 *  - **the wet trail** (`createTideTrailMaterial`) — a floor strip, darkened
 *    and glinting behind the head, with a line of foam where the sheet's foot
 *    dragged; it drains raggedly.
 *  - **the shards** (`createTideShardMaterial`) — instanced slabs of
 *    glass-hard water: flat-faced, fresnel and sky, bright hard rims off
 *    barycentrics, fading as they melt back into droplets.
 *  - **the glint** (`createTideGlintMaterial`) — a four-point star flare
 *    where the sheet turns to glass.
 *
 * Every material reads `settings.glasstide` in `userData.sync(state)`.
 */

const ID = 'glasstide';

const ENV_GLSL = /* glsl */ `
  uniform sampler2D uEnvMap;
  uniform float uHasEnv;
  vec3 skyAt(vec3 dir) {
    vec2 uv = vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5, asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    return uHasEnv > 0.5 ? texture2D(uEnvMap, uv).rgb : mix(vec3(0.08, 0.12, 0.18), vec3(0.55, 0.7, 0.85), dir.y * 0.5 + 0.5);
  }
`;

/** F2 − F1 cells: x = distance to the nearest seam, y = the cell's own random. */
const CELLS_GLSL = /* glsl */ `
  vec2 glassCells(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    float id = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 cell = n + g;
        vec2 o = vec2(hash13(vec3(cell, 3.7)), hash13(vec3(cell, 8.1)));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = hash13(vec3(cell, 5.3)); }
        else if (d < d2) { d2 = d; }
      }
    }
    return vec2(sqrt(d2) - sqrt(d1), id);
  }
`;

/* -------------------------------------------------------------------- */
/* The sheet's shape — the GLSL twin of GlassTideAbility#_sheetPoint      */
/* -------------------------------------------------------------------- */

const SHEET_GLSL = /* glsl */ `
  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uTail;        // metres along the line the sheet starts
  uniform float uHead;        // metres along the line the head is
  uniform float uTailH;
  uniform float uHeadH;
  uniform float uHCurve;
  uniform float uLean;
  uniform float uWhipAmp;
  uniform float uWhipLen;
  uniform float uWhipPhase;   // integrated on the CPU
  uniform float uRise;        // 0..1, the sheet standing up out of the floor
  uniform float uCrestRoll;
  uniform float uCrestScale;
  uniform float uFlow;
  uniform float uSeed;

  float whipEnv(float s) {
    return smoothstep(0.0, 0.35, s) * (1.0 - 0.55 * smoothstep(0.7, 1.0, s));
  }
  float sheetHeight(float s) {
    float h = mix(uTailH, uHeadH, pow(clamp(s, 0.0, 1.0), max(uHCurve, 0.05)));
    // A rounded leading edge and a tail that rises out of the floor.
    h *= 1.0 - 0.7 * smoothstep(0.93, 1.0, s);
    h *= smoothstep(0.0, 0.1, s) * 0.85 + 0.15;
    return h * uRise;
  }
  vec3 sheetPoint(float s, float v) {
    float d = mix(uTail, uHead, s);
    float lat = uWhipAmp * whipEnv(s) * sin(6.2831853 * d / max(uWhipLen, 0.2) - uWhipPhase);
    float roll = snoise(vec3(d * uCrestScale - uFlow * 0.35, uSeed, 0.0)) * uCrestRoll * v * v;
    vec3 p = uOrigin + uDir * (d + uLean * v * v * s * s) + uSide * (lat + roll);
    p.y = sheetHeight(s) * v;
    return p;
  }
`;

const SHEET_VERTEX = /* glsl */ `
  varying float vS;
  varying float vV;
  varying float vAlong;
  varying float vH;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${SHEET_GLSL}

  void main() {
    float s = position.x;
    float v = position.y;
    vec3 p = sheetPoint(s, v);
    vec3 ds = sheetPoint(min(s + 0.006, 1.0), v) - sheetPoint(max(s - 0.006, 0.0), v);
    vec3 dv = sheetPoint(s, min(v + 0.03, 1.0)) - sheetPoint(s, max(v - 0.03, 0.0));
    vec3 N = cross(ds, dv);
    N = length(N) > 1e-6 ? normalize(N) : uSide;

    vS = s;
    vV = v;
    vAlong = mix(uTail, uHead, s);
    vH = sheetHeight(s);
    vNormalW = N;
    vWorld = p;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHEET_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uSeed;
  uniform float uFlow;
  uniform float uHead;
  uniform float uTail;
  uniform float uOpacity;
  uniform float uFresnelPow;
  uniform float uFresnelGlow;
  uniform float uEnvAmt;
  uniform float uCausticScale;
  uniform float uCausticGlow;
  uniform float uStreakScale;
  uniform float uCrestGlow;
  uniform float uCrestWidth;
  uniform float uCrestTear;
  uniform float uFoam;
  uniform float uSoftFade;
  uniform float uHarden;       // 0 flowing .. 1 glass
  uniform float uCrack;        // 0..1 the crack front, head → tail
  uniform float uCrackScale;
  uniform float uCrackGlow;
  uniform float uShatter;      // 0..1 cells falling out
  uniform float uFade;
  uniform vec3  uColorDeep;
  uniform vec3  uColorShallow;
  uniform vec3  uColorCrest;
  uniform vec3  uColorCaustic;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying float vS;
  varying float vV;
  varying float vAlong;
  varying float vH;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}
  ${ENV_GLSL}
  ${CELLS_GLSL}

  void main() {
    float height = vV * vH;                         // metres up the sheet
    float fromHead = uHead - vAlong;                // metres behind the head
    float span = max(uHead - uTail, 0.5);

    // The crest is torn: spray-toothed while it flows, clean once it is glass.
    float tear = snoise(vec3(vAlong * 2.6 - uFlow * 1.4, uSeed, 3.0)) * 0.5 + 0.5;
    float top = 1.0 - uCrestTear * (1.0 - uHarden * 0.8) * tear * 0.22;
    if (vV > top) discard;

    // Shatter: whole cells fall out, from the head back.
    vec2 crackCell = glassCells(vec2(vAlong, height) * uCrackScale + uSeed);
    float order = crackCell.y * 0.55 + clamp(fromHead / span, 0.0, 1.0) * 0.45;
    if (uShatter > 0.0 && order < uShatter * 1.08) discard;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    float facing = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - facing, max(uFresnelPow, 0.2));

    // Flowing water: streaks racing toward the head, caustic lines drifting.
    float flow = uFlow * (1.0 - uHarden);
    vec2 cp = vec2(vAlong - flow * 0.6, height * 1.4) * uCausticScale;
    vec2 cc = glassCells(cp + vec2(snoise(vec3(cp * 0.6, uSeed)) * 0.35, 0.0));
    float caustic = 1.0 - smoothstep(0.0, mix(0.12, 0.05, uHarden), cc.x);
    float streak = snoise(vec3((vAlong - flow) * 0.35 * uStreakScale, height * 5.0 * uStreakScale, uSeed + 2.0));
    streak = smoothstep(0.35, 0.9, streak) * (1.0 - uHarden);

    // Glass: the same cells become flat facets with their own tilt of light.
    float facet = (crackCell.y - 0.5) * uHarden;

    vec3 body = mix(uColorDeep, uColorShallow, smoothstep(0.0, 1.0, vV) * 0.7 + facet * 0.6);
    vec3 R = reflect(-V, normalize(N + vec3(facet * 0.3, 0.0, -facet * 0.3)));
    vec3 sky = skyAt(R) * uEnvAmt;

    float crest = 1.0 - smoothstep(0.0, uCrestWidth / max(vH, 0.1), top - vV);
    float foam = (1.0 - smoothstep(0.0, 0.18, height)) * smoothstep(0.2, 0.7, snoise(vec3(vAlong * 3.0 - uFlow, height * 8.0, uSeed)) * 0.5 + 0.5);

    // Cracks: bright seams from the head back, as far as the front has got.
    float crackReach = uCrack * span * 1.15 + snoise(vec3(height * 2.0, uSeed, 1.0)) * 0.6;
    float cracked = 1.0 - smoothstep(crackReach - 0.4, crackReach, fromHead);
    float seam = (1.0 - smoothstep(0.0, 0.05, crackCell.x)) * cracked * step(0.001, uCrack);

    vec3 col = body * (0.35 + 0.4 * facing);
    col += sky * (0.25 + fres);
    col += uColorShallow * fres * uFresnelGlow;
    col += uColorCaustic * caustic * uCausticGlow * (0.35 + 0.65 * smoothstep(0.1, 0.8, vV)) * uShaderIntensity;
    col += uColorCaustic * streak * 0.8;
    col += uColorCrest * crest * uCrestGlow;
    col += uColorCrest * foam * uFoam;
    col += uColorCrest * seam * uCrackGlow;

    float alpha = uOpacity * (0.32 + 0.68 * fres) + caustic * 0.25 + streak * 0.2 + crest + foam * uFoam * 0.6 + seam;
    alpha *= mix(1.0, 1.25, uHarden);
    alpha *= smoothstep(0.0, 0.22, vS) * uFade;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uFlow;
  uniform float uHead;
  uniform float uTail;
  uniform float uStrength;
  uniform float uLensScale;
  uniform float uShatter;
  uniform float uCrackScale;
  uniform float uFade;
  uniform float uShaderIntensity;

  varying float vS;
  varying float vV;
  varying float vAlong;
  varying float vH;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${CELLS_GLSL}

  void main() {
    float height = vV * vH;
    float span = max(uHead - uTail, 0.5);
    vec2 crackCell = glassCells(vec2(vAlong, height) * uCrackScale + uSeed);
    float order = crackCell.y * 0.55 + clamp((uHead - vAlong) / span, 0.0, 1.0) * 0.45;
    if (uShatter > 0.0 && order < uShatter * 1.08) discard;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    // The bend follows the sheet's normal on screen, rippled by the flow.
    vec3 nv = (viewMatrix * vec4(N, 0.0)).xyz;
    vec2 dir = nv.xy * sign(dot(N, V) + 1e-4);
    vec3 np = vec3(vAlong * uLensScale - uFlow * 0.5, height * uLensScale * 1.5, uSeed);
    dir += vec2(snoise(np), snoise(np + 7.3)) * 0.5;
    float len = length(dir);
    if (len > 1.0) dir /= len;
    float mask = smoothstep(0.0, 0.25, vS) * (1.0 - smoothstep(0.85, 1.0, vV)) * uFade;
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
  }
`;

function sheetUniforms() {
  return {
    uOrigin: { value: new Vector3() },
    uDir: { value: new Vector3(0, 0, 1) },
    uSide: { value: new Vector3(1, 0, 0) },
    uTail: { value: 0 },
    uHead: { value: 1 },
    uTailH: { value: 0.5 },
    uHeadH: { value: 2.6 },
    uHCurve: { value: 1.6 },
    uLean: { value: 0.6 },
    uWhipAmp: { value: 1 },
    uWhipLen: { value: 6 },
    uWhipPhase: { value: 0 },
    uRise: { value: 1 },
    uCrestRoll: { value: 0.18 },
    uCrestScale: { value: 1.6 },
    uFlow: { value: 0 },
    uSeed: { value: 0 },
    uShatter: { value: 0 },
    uCrackScale: { value: 1.6 },
    uFade: { value: 1 }
  };
}

function syncSheetShape(u, state) {
  const c = settings[ID];
  const g = settings.global;
  u.uOrigin.value.copy(state.origin);
  u.uDir.value.copy(state.dir);
  u.uSide.value.copy(state.side);
  u.uTail.value = state.tail;
  u.uHead.value = state.head;
  u.uTailH.value = c.tailHeight;
  u.uHeadH.value = c.headHeight;
  u.uHCurve.value = c.heightCurve;
  u.uLean.value = c.crestLean;
  u.uWhipAmp.value = c.whipAmp * state.whip;
  u.uWhipLen.value = c.whipLength;
  u.uWhipPhase.value = state.whipPhase;
  u.uRise.value = state.rise;
  u.uCrestRoll.value = c.crestRoll * g.noiseStrength;
  u.uCrestScale.value = c.crestScale * g.noiseFrequency;
  u.uFlow.value = state.flow;
  u.uSeed.value = state.seed;
  u.uShatter.value = state.shatter;
  u.uCrackScale.value = c.crackScale;
  u.uFade.value = state.fade;
}

/**
 * @param {0|1} mode 0 the water itself, 1 its refraction on LAYER.DISTORTION
 */
export function createTideSheetMaterial(mode = 0) {
  const lens = mode === 1;
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: !lens,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms(
      lens
        ? { ...sheetUniforms(), uStrength: { value: 1 }, uLensScale: { value: 1.5 } }
        : {
            ...sheetUniforms(),
            uEnvMap: frame.uEnvMap,
            uHasEnv: { value: 0 },
            uOpacity: { value: 0.55 },
            uFresnelPow: { value: 2.5 },
            uFresnelGlow: { value: 2 },
            uEnvAmt: { value: 0.8 },
            uCausticScale: { value: 1.4 },
            uCausticGlow: { value: 2.5 },
            uStreakScale: { value: 1 },
            uCrestGlow: { value: 4 },
            uCrestWidth: { value: 0.08 },
            uCrestTear: { value: 1 },
            uFoam: { value: 1 },
            uSoftFade: { value: 0.3 },
            uHarden: { value: 0 },
            uCrack: { value: 0 },
            uCrackGlow: { value: 5 },
            uColorDeep: { value: new Color() },
            uColorShallow: { value: new Color() },
            uColorCrest: { value: new Color() },
            uColorCaustic: { value: new Color() }
          }
    ),
    vertexShader: SHEET_VERTEX,
    fragmentShader: lens ? LENS_FRAGMENT : SHEET_FRAGMENT
  });

  /** @param {object} state { origin, dir, side, tail, head, whip, whipPhase, rise, flow, seed, harden, crack, shatter, fade } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncSheetShape(u, state);
    if (lens) {
      u.uStrength.value = c.refractStrength * g.distortion * (1 - state.shatter);
      u.uLensScale.value = c.refractScale * g.noiseFrequency;
      return;
    }
    u.uHasEnv.value = frame.uEnvMap.value ? 1 : 0;
    u.uOpacity.value = c.glassOpacity * g.opacity;
    u.uFresnelPow.value = c.fresnelPower;
    u.uFresnelGlow.value = c.fresnelGlow * g.fresnel * g.glow;
    u.uEnvAmt.value = c.envAmount;
    u.uCausticScale.value = c.causticScale * g.noiseFrequency;
    u.uCausticGlow.value = c.causticGlow * g.glow;
    u.uStreakScale.value = c.streakScale * g.noiseFrequency;
    u.uCrestGlow.value = c.crestGlow * g.glow;
    u.uCrestWidth.value = c.crestWidth;
    u.uCrestTear.value = c.crestTear * g.randomness;
    u.uFoam.value = c.baseFoam;
    u.uSoftFade.value = c.softFade;
    u.uHarden.value = state.harden;
    u.uCrack.value = state.crack;
    u.uCrackGlow.value = c.crackGlow * g.glow;
    u.uColorDeep.value.copy(getColor(c.colorDeep));
    u.uColorShallow.value.copy(getColor(c.colorShallow));
    u.uColorCrest.value.copy(getColor(c.colorCrest));
    u.uColorCaustic.value.copy(getColor(c.colorCaustic));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The wet trail                                                         */
/* -------------------------------------------------------------------- */

const TRAIL_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uHalfWidth;

  varying vec2 vFlat;         // x: metres across, y: metres along (from uStart)

  void main() {
    float across = position.y * uHalfWidth;
    float along = position.x * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = 0.012;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const TRAIL_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uStartAt;     // metres along the line the strip starts
  uniform float uWetTo;       // metres of strip wet so far
  uniform float uWhipAmp;
  uniform float uWhipLen;
  uniform float uFootPhase;   // the whip phase the foam line was laid with
  uniform float uWidth;
  uniform float uDarken;
  uniform float uGlint;
  uniform float uFoamLine;
  uniform float uDrain;       // 0 wet .. 1 dry
  uniform float uTime;
  uniform vec3  uColorWet;
  uniform vec3  uColorFoam;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    float x = vFlat.x;
    float along = vFlat.y;
    if (along < 0.0 || along > uWetTo) discard;
    float d = uStartAt + along;

    // The sheet's footprint: where the foot of the curtain dragged across.
    float foot = uWhipAmp * sin(6.2831853 * d / max(uWhipLen, 0.2) - uFootPhase);
    float edgeN = snoise(vec3(along * 0.8, x * 0.5, uSeed)) * 0.35;
    float wet = 1.0 - smoothstep(uWidth * 0.55, uWidth, abs(x - foot * 0.6) + edgeN * uWidth);
    wet *= smoothstep(0.0, 0.6, along) * (1.0 - smoothstep(uWetTo - 0.5, uWetTo, along));

    float lineN = snoise(vec3(along * 2.5, uSeed, 1.0));
    float foam = (1.0 - smoothstep(0.03, 0.16, abs(x - foot) + lineN * 0.05)) * smoothstep(-0.2, 0.6, lineN);

    // Drains raggedly: the puddled hollows last longest.
    float pool = snoise(vec3(x * 0.9, along * 0.7, uSeed * 2.0)) * 0.5 + 0.5;
    float keep = 1.0 - smoothstep(pool * 0.9, pool * 0.9 + 0.15, uDrain * 1.1);
    wet *= keep;
    foam *= 1.0 - smoothstep(0.0, 0.6, uDrain);

    float glint = pow(snoise01(vec3(x * 9.0, along * 9.0, uTime * 0.6 + uSeed)), 14.0) * uGlint;
    vec3 col = uColorWet + vec3(glint) * uGlobalGlow + uColorFoam * foam * uFoamLine;
    float a = max(wet * uDarken, foam * uFoamLine);
    a = max(a, glint * wet * 0.6);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createTideTrailMaterial() {
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
      uHalfWidth: { value: 2 },
      uSeed: { value: 0 },
      uStartAt: { value: 0 },
      uWetTo: { value: 0 },
      uWhipAmp: { value: 1 },
      uWhipLen: { value: 6 },
      uFootPhase: { value: 0 },
      uWidth: { value: 1.4 },
      uDarken: { value: 0.5 },
      uGlint: { value: 1 },
      uFoamLine: { value: 0.6 },
      uDrain: { value: 0 },
      uColorWet: { value: new Color() },
      uColorFoam: { value: new Color() }
    }),
    vertexShader: TRAIL_VERTEX,
    fragmentShader: TRAIL_FRAGMENT
  });

  /** @param {object} state { start, dir, side, startAt, length, wetTo, footPhase, drain, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.1, state.length);
    u.uHalfWidth.value = c.trailWidth + c.whipAmp + 0.4;
    u.uSeed.value = state.seed;
    u.uStartAt.value = state.startAt;
    u.uWetTo.value = state.wetTo;
    u.uWhipAmp.value = c.whipAmp * 0.8;
    u.uWhipLen.value = c.whipLength;
    u.uFootPhase.value = state.footPhase;
    u.uWidth.value = Math.max(0.05, c.trailWidth);
    u.uDarken.value = c.trailDarken * g.opacity;
    u.uGlint.value = c.trailGlint * g.glow;
    u.uFoamLine.value = c.trailFoam;
    u.uDrain.value = state.drain;
    u.uColorWet.value.copy(getColor(c.colorWet));
    u.uColorFoam.value.copy(getColor(c.colorFoam));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The shards                                                            */
/* -------------------------------------------------------------------- */

const SHARD_VERTEX = /* glsl */ `
  attribute vec3 aBary;
  attribute vec2 aShard;      // x: 0..1 alpha (melting), y: seed

  varying vec3  vBary;
  varying vec3  vWorld;
  varying vec2  vShard;

  void main() {
    vBary = aBary;
    vShard = aShard;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHARD_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uOpacity;
  uniform float uRimGlow;
  uniform float uEnvAmt;
  uniform float uFresnelPow;
  uniform vec3  uColorBody;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;
  uniform vec3  uLightDir;

  varying vec3  vBary;
  varying vec3  vWorld;
  varying vec2  vShard;

  ${ENV_GLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(N, V) < 0.0) N = -N;
    float facing = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - facing, max(uFresnelPow, 0.2));
    float edge = 1.0 - smoothstep(0.0, 0.09, min(vBary.x, min(vBary.y, vBary.z)));
    vec3 H = normalize(uLightDir + V);
    float spec = pow(max(dot(N, H), 0.0), 60.0);
    vec3 sky = skyAt(reflect(-V, N)) * uEnvAmt;
    vec3 col = uColorBody * (0.4 + 0.6 * facing) + sky * (0.3 + fres) + uColorRim * (edge * uRimGlow + spec * 4.0);
    float a = (0.35 + 0.55 * fres + edge * 0.6 + spec) * uOpacity * vShard.x;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

export function createTideShardMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uHasEnv: { value: 0 },
      uOpacity: { value: 1 },
      uRimGlow: { value: 2 },
      uEnvAmt: { value: 0.8 },
      uFresnelPow: { value: 2.5 },
      uColorBody: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: SHARD_VERTEX,
    fragmentShader: SHARD_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHasEnv.value = frame.uEnvMap.value ? 1 : 0;
    u.uOpacity.value = c.shardOpacity * g.opacity;
    u.uRimGlow.value = c.shardGlow * g.glow;
    u.uEnvAmt.value = c.envAmount;
    u.uFresnelPow.value = c.fresnelPower;
    u.uColorBody.value.copy(getColor(c.colorShallow));
    u.uColorRim.value.copy(getColor(c.colorCrest));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The glint — where the water turns to glass                             */
/* -------------------------------------------------------------------- */

const BILLBOARD_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  uniform float uAngle;

  varying vec2 vUv;

  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float c = cos(uAngle);
    float s = sin(uAngle);
    vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
    vec3 world = uCenter + (right * q.x + up * q.y) * uSize;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const GLINT_FRAGMENT = /* glsl */ `
  uniform float uIntensity;
  uniform vec3  uColorCore;
  uniform vec3  uColorHalo;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  void main() {
    float r = length(vUv);
    if (r > 1.0 || uIntensity <= 0.001) discard;
    // A four-point star: two thin crossed spikes, and a smaller diagonal pair.
    float cross1 = exp(-abs(vUv.x) * 40.0) + exp(-abs(vUv.y) * 40.0);
    vec2 d = vec2(vUv.x + vUv.y, vUv.x - vUv.y) * 0.7071;
    float cross2 = (exp(-abs(d.x) * 60.0) + exp(-abs(d.y) * 60.0)) * 0.4;
    float spikes = (cross1 + cross2) * (1.0 - r);
    float core = exp(-r * r * 30.0);
    float halo = exp(-r * 5.0) * 0.5;
    vec3 col = uColorCore * (core * 2.0 + spikes) + uColorHalo * halo;
    float m = clamp(core + spikes + halo, 0.0, 1.0);
    gl_FragColor = vec4(col * uIntensity * uGlobalGlow, m);
  }
`;

export function createTideGlintMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 1 },
      uAngle: { value: 0 },
      uIntensity: { value: 0 },
      uColorCore: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: GLINT_FRAGMENT
  });

  /** @param {object} state { center, size, angle, intensity } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.01, state.size);
    u.uAngle.value = state.angle;
    u.uIntensity.value = state.intensity * c.glintFlare * g.glow;
    u.uColorCore.value.copy(getColor(c.colorCrest));
    u.uColorHalo.value.copy(getColor(c.colorShallow));
  };

  return material;
}
