import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms, frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Riptide Lash — the bespoke shaders the water is drawn with.
 *
 *  - **the jet** — one parameter-space grid (`PlaneGeometry`, `uv.x` round the
 *    tube, `uv.y` along it) bent into a tube in the vertex stage. Its centre
 *    line drops from the hand to a working height and whips side to side; its
 *    radius spreads off the nozzle, bulges at the churning head and rounds off
 *    at both ends. The surface is displaced by a *helical* ridge (the angle is
 *    offset by `twist × s`, and the whole pattern screws down the jet), so the
 *    tube reads as a twisted rope of water rather than a pipe. The same grid is
 *    drawn three times:
 *      · MODE 0, the **body** — alpha-blended water: deep in the middle of the
 *        silhouette, bright and opaque at the rim (fresnel), the sky mirrored
 *        in it, a hard sun glint, flow streaks and foam riding the ridges;
 *      · MODE 1, the **pressure core** — a thinner additive tube of streaming
 *        light inside the body, what makes it read as *high pressure*;
 *      · MODE 2, the **lens** — a fatter tube on `LAYER.DISTORTION` that pushes
 *        the world outward along the tube's own screen-space normal, the
 *        magnification of a cylinder of water, with noise mixed in.
 *  - **the soak** — a ground strip down the line that is only wet behind the
 *    jet's head, plus a disc of flood round the crash. Wet floor is darkened,
 *    picks up a rippled sun glint and a little sky; voronoi puddles hold water
 *    longer than the film round them, so when it drains the band dries first
 *    and the puddles shrink last. Foam scum floats where the wave came down.
 *  - **the breaking wave** — a sheet whose cross-section is integrated in the
 *    vertex stage: the tangent turns from `waveSlope` (the rising back face)
 *    through horizontal (the crest) to `-curl` (the lip curling over and
 *    down). Integrating it rather than writing a closed form means curling
 *    the lip is one number. One side peels before the other, the two ends fall
 *    away, and on the crash it collapses forward and dissolves into foam.
 *
 * Every material reads `settings.riptide` in `userData.sync(state)`; `state`
 * carries only what the ability knows that the settings do not.
 */

const ENV_GLSL = /* glsl */ `
  vec2 rtEquirect(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* -------------------------------------------------------------------- */
/* The jet — shape shared by the body, the core and the lens            */
/* -------------------------------------------------------------------- */

/**
 * `jetCentre(s)` / `jetRadius(s)` at `s` metres down the line from the caster.
 * `RiptideLashAbility#_jetCentre` / `#_jetRadius` are the CPU copies (they place
 * the spray on the surface and test the shove), so they change together.
 */
const JET_SHAPE_GLSL = /* glsl */ `
  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uTail;        // metres down the line the jet's tail is
  uniform float uHead;        // and its head
  uniform float uNozzle;
  uniform float uHandY;
  uniform float uJetY;
  uniform float uDropLen;
  uniform float uSnake;
  uniform float uSnakeFreq;
  uniform float uSnakePhase;  // integrated on the CPU
  uniform float uSnakeRamp;
  uniform float uRadius0;
  uniform float uRadius1;
  uniform float uSpreadLen;
  uniform float uHeadBulge;
  uniform float uHeadLen;
  uniform float uTailTaper;
  uniform float uHeadTaper;
  uniform float uForm;

  vec3 jetCentre(float s) {
    float k = max(s - uNozzle, 0.0);
    float y = uJetY + (uHandY - uJetY) * exp(-k / max(uDropLen, 0.05));
    float lat = uSnake * sin(s * uSnakeFreq - uSnakePhase) * clamp(k / max(uSnakeRamp, 0.05), 0.0, 1.0);
    return uOrigin + uDir * s + uSide * lat + vec3(0.0, y, 0.0);
  }

  float jetRadius(float s) {
    float k = max(s - uNozzle, 0.0);
    float r = mix(uRadius0, uRadius1, clamp(k / max(uSpreadLen, 0.05), 0.0, 1.0));
    r *= 1.0 + uHeadBulge * exp(-max(uHead - s, 0.0) / max(uHeadLen, 0.05));
    // Round caps: sqrt(k(2-k)) is a quarter circle, so the ends are domes.
    float tk = clamp((s - uTail) / max(uTailTaper, 0.01), 0.0, 1.0);
    float hk = clamp((uHead - s) / max(uHeadTaper, 0.01), 0.0, 1.0);
    return r * sqrt(tk * (2.0 - tk)) * sqrt(hk * (2.0 - hk)) * uForm;
  }
`;

const JET_VERTEX = /* glsl */ `
  uniform float uRadiusScale;
  uniform float uTwist;
  uniform float uTwistPhase;
  uniform float uWobble;
  uniform float uWobbleScale;
  uniform float uFlow;
  uniform float uSeed;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec2  vJet;         // x: metres along, y: angle round the tube
  varying vec2  vOutward;     // the surface normal, in view space (the lens)
  varying float vRidge;       // 0 trough .. 1 crest of the turbulence
  varying float vViewZ;

  ${noiseGLSL}
  ${JET_SHAPE_GLSL}

  void main() {
    float s = mix(uTail, uHead, uv.y);
    vec3 c = jetCentre(s);
    vec3 T = normalize(jetCentre(s + 0.05) - c + 1e-5);
    vec3 B = normalize(cross(T, vec3(0.0, 1.0, 0.0)) + 1e-5);
    vec3 U = cross(B, T);

    // The helix: the angle is wound by distance, then the whole pattern
    // screws down the jet with time.
    float a = uv.x * 6.2831853 + uTwist * s - uTwistPhase;
    vec3 n = B * cos(a) + U * sin(a);

    float ridge = snoise(vec3(cos(a) * 1.3, sin(a) * 1.3, s * uWobbleScale - uFlow) + uSeed);
    float rope = sin(a * 3.0 + s * 2.3 - uFlow * 1.7);
    float disp = (ridge * 0.7 + rope * 0.3) * uWobble;
    float r = jetRadius(s) * uRadiusScale;
    vec3 world = c + n * r * (1.0 + disp);

    vNormalW = normalize(n + T * disp * 0.3);
    vWorld = world;
    vJet = vec2(s, a);
    vRidge = clamp(disp / max(uWobble, 1e-3) * 0.5 + 0.5, 0.0, 1.0);
    vOutward = (viewMatrix * vec4(n, 0.0)).xy;

    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const JET_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uFlow;
  uniform float uHead;
  uniform float uTail;
  uniform float uOpacity;
  uniform float uFresnelPow;
  uniform float uFresnelGlow;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uEnv;
  uniform float uStreakScale;
  uniform float uStreakGlow;
  uniform float uFoamScale;
  uniform float uFoamThreshold;
  uniform float uFoam;
  uniform float uHeadFoam;
  uniform float uSoftFade;
  uniform float uFade;
  uniform float uCoreGlow;
  uniform float uWarp;
  uniform float uWarpNoise;
  uniform float uWarpNoiseScale;
  uniform vec3  uColorDeep;
  uniform vec3  uColorShallow;
  uniform vec3  uColorGlow;
  uniform vec3  uColorSpec;
  uniform vec3  uColorFoam;
  uniform vec3  uColorCore;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec2  vJet;
  varying vec2  vOutward;
  varying float vRidge;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}
  ${ENV_GLSL}

  void main() {
    float s = vJet.x;
    float a = vJet.y;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float facing = abs(dot(N, V));
    float fres = pow(1.0 - facing, max(uFresnelPow, 0.1));

    // Seamless round the tube: the angle goes in as a circle.
    vec2 ring = vec2(cos(a), sin(a));
    float streak = smoothstep(0.25, 0.95, snoise(vec3(ring * 1.6, s * uStreakScale - uFlow) + uSeed * 0.37));

    // The tail is ragged as it retracts: water tearing off the back.
    float tailN = snoise(vec3(ring * 2.0, s * 3.0 - uTime * 4.0 + uSeed));
    float tailK = smoothstep(0.0, 0.6, s - uTail + tailN * 0.25);

  #if MODE == 2
    // The lens: outward along the tube's screen normal, strongest in the
    // middle of the silhouette where the water is thickest.
    vec2 dir = normalize(vOutward + 1e-5);
    vec3 np = vec3(vWorld.xz * uWarpNoiseScale, vWorld.y * uWarpNoiseScale - uFlow * 0.2);
    vec2 n = vec2(snoise(np), snoise(np + vec3(17.1, 3.3, 9.7)));
    vec2 offset = dir * (1.0 - uWarpNoise) + n * uWarpNoise;
    float len = length(offset);
    if (len > 1.0) offset /= len;
    float mask = (0.35 + 0.65 * facing) * tailK * uFade;
    float strength = uWarp * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  #else
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    float soft = softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);

    #if MODE == 1
      // The pressure core: brightest where you look straight into it.
      float core = pow(facing, 1.5) * (0.35 + 0.65 * streak);
      float a2 = core * tailK * uFade * soft;
      if (a2 < 0.004) discard;
      gl_FragColor = vec4(uColorCore * core * uCoreGlow * uGlobalGlow * uShaderIntensity, clamp(a2, 0.0, 1.0));
    #else
      vec3 L = normalize(uLightDir);
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), max(uGloss, 1.0)) * uSpecular;
      vec3 env = texture2D(uEnvMap, rtEquirect(reflect(-V, N))).rgb * uEnv;

      float headK = exp(-max(uHead - s, 0.0) / 1.1) * uHeadFoam;
      float foamN = fbm3(vec3(ring * 2.5, s * uFoamScale - uFlow * 1.3) + uSeed) * 0.5 + 0.5;
      float foam = smoothstep(uFoamThreshold, uFoamThreshold + 0.18, foamN + vRidge * 0.3 + headK * 0.45) * uFoam;

      vec3 col = mix(uColorDeep, uColorShallow, clamp(fres * 0.85 + vRidge * 0.25, 0.0, 1.0));
      col *= 0.55 + 0.45 * clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
      col += env * (0.12 + fres);
      col += uColorGlow * (fres * uFresnelGlow + streak * uStreakGlow * 0.35) * uShaderIntensity;
      col += uColorSpec * spec;
      col = mix(col, uColorFoam * (1.1 + headK), clamp(foam, 0.0, 1.0));

      float alpha = mix(uOpacity, 1.0, fres);
      alpha = max(alpha, foam);
      alpha *= tailK * uFade * soft;
      if (alpha < 0.004) discard;
      gl_FragColor = vec4(col * uGlobalGlow, clamp(alpha, 0.0, 1.0));
    #endif
  #endif
  }
`;

/**
 * The jet, one of three ways.
 * @param {0|1|2} mode 0 body (alpha), 1 pressure core (additive), 2 lens (distortion)
 */
export function createRiptideJetMaterial(mode = 0) {
  const material = new ShaderMaterial({
    defines: { MODE: mode },
    transparent: true,
    depthWrite: false,
    depthTest: mode !== 2,
    blending: mode === 1 ? AdditiveBlending : NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uOrigin: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uTail: { value: 0 },
      uHead: { value: 1 },
      uNozzle: { value: 0.5 },
      uHandY: { value: 1.3 },
      uJetY: { value: 0.8 },
      uDropLen: { value: 2 },
      uSnake: { value: 0.2 },
      uSnakeFreq: { value: 0.5 },
      uSnakePhase: { value: 0 },
      uSnakeRamp: { value: 3 },
      uRadius0: { value: 0.1 },
      uRadius1: { value: 0.3 },
      uSpreadLen: { value: 4 },
      uHeadBulge: { value: 0.8 },
      uHeadLen: { value: 0.9 },
      uTailTaper: { value: 0.5 },
      uHeadTaper: { value: 0.4 },
      uForm: { value: 1 },
      uRadiusScale: { value: 1 },
      uTwist: { value: 1.5 },
      uTwistPhase: { value: 0 },
      uWobble: { value: 0.2 },
      uWobbleScale: { value: 1.7 },
      uFlow: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 0.55 },
      uFresnelPow: { value: 2.2 },
      uFresnelGlow: { value: 1.4 },
      uGloss: { value: 60 },
      uSpecular: { value: 2 },
      uEnv: { value: 0.9 },
      uStreakScale: { value: 2.4 },
      uStreakGlow: { value: 1.6 },
      uFoamScale: { value: 2.2 },
      uFoamThreshold: { value: 0.62 },
      uFoam: { value: 0.9 },
      uHeadFoam: { value: 0.7 },
      uSoftFade: { value: 0.35 },
      uFade: { value: 1 },
      uCoreGlow: { value: 2.6 },
      uWarp: { value: 1 },
      uWarpNoise: { value: 0.35 },
      uWarpNoiseScale: { value: 2.2 },
      uColorDeep: { value: new Color() },
      uColorShallow: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorSpec: { value: new Color() },
      uColorFoam: { value: new Color() },
      uColorCore: { value: new Color() }
    }),
    vertexShader: JET_VERTEX,
    fragmentShader: JET_FRAGMENT
  });

  /**
   * @param {object} state { origin, dir, side, tail, head, snakePhase,
   *   twistPhase, flow, form, fade, seed, pressure }
   */
  material.userData.sync = (state) => {
    const c = settings.riptide;
    const g = settings.global;
    const u = material.uniforms;
    u.uOrigin.value.copy(state.origin);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uTail.value = state.tail;
    u.uHead.value = Math.max(state.head, state.tail + 0.02);
    u.uNozzle.value = c.nozzle;
    u.uHandY.value = c.handHeight;
    u.uJetY.value = c.jetHeight;
    u.uDropLen.value = c.dropLength;
    u.uSnake.value = c.snake * g.randomness;
    u.uSnakeFreq.value = c.snakeFreq;
    u.uSnakePhase.value = state.snakePhase;
    u.uSnakeRamp.value = c.snakeRamp;
    u.uRadius0.value = c.nozzleRadius;
    u.uRadius1.value = c.jetRadius;
    u.uSpreadLen.value = c.spreadLength;
    u.uHeadBulge.value = c.headBulge;
    u.uHeadLen.value = c.headLength;
    u.uTailTaper.value = c.tailTaper;
    u.uHeadTaper.value = c.headTaper;
    u.uForm.value = state.form;
    u.uRadiusScale.value = mode === 1 ? c.coreScale : mode === 2 ? c.warpScale : 1;
    u.uTwist.value = c.twist;
    u.uTwistPhase.value = state.twistPhase;
    u.uWobble.value = c.wobble * g.noiseStrength * (mode === 1 ? 0.5 : 1);
    u.uWobbleScale.value = c.wobbleScale * g.noiseFrequency;
    u.uFlow.value = state.flow;
    u.uSeed.value = state.seed;
    u.uOpacity.value = c.opacity * g.opacity;
    u.uFresnelPow.value = c.fresnelPower;
    u.uFresnelGlow.value = c.fresnelGlow * g.fresnel;
    u.uGloss.value = c.gloss;
    u.uSpecular.value = c.specular;
    u.uEnv.value = c.envReflect;
    u.uStreakScale.value = c.streakScale * g.noiseFrequency;
    u.uStreakGlow.value = c.streakGlow * g.glow;
    u.uFoamScale.value = c.foamScale * g.noiseFrequency;
    u.uFoamThreshold.value = c.foamThreshold;
    u.uFoam.value = c.foamAmount;
    u.uHeadFoam.value = c.headFoam;
    u.uSoftFade.value = c.softFade;
    u.uFade.value = state.fade * (mode === 2 ? state.pressure : 1);
    u.uCoreGlow.value = c.coreGlow * g.glow * state.pressure;
    u.uWarp.value = c.warpStrength * g.distortion;
    u.uWarpNoise.value = Math.min(1, Math.max(0, c.warpNoise * g.turbulence));
    u.uWarpNoiseScale.value = c.warpNoiseScale * g.noiseFrequency;
    u.uColorDeep.value.copy(getColor(c.colorDeep));
    u.uColorShallow.value.copy(getColor(c.colorShallow));
    u.uColorGlow.value.copy(getColor(c.colorGlow));
    u.uColorSpec.value.copy(getColor(c.colorSpec));
    u.uColorFoam.value.copy(getColor(c.colorFoam));
    u.uColorCore.value.copy(getColor(c.colorCore));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The soak                                                             */
/* -------------------------------------------------------------------- */

/**
 * A raw unit PlaneGeometry (XY, ±0.5) laid down the cast line from uniforms:
 * `position.x` across, `position.y` along. Width and length follow the sliders.
 */
const SOAK_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uWidth;

  varying vec2 vFlat;         // x: metres across, y: metres along
  varying vec3 vWorld;

  void main() {
    float across = position.x * uWidth;
    float along = (position.y + 0.5) * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = 0.014;
    vFlat = vec2(across, along);
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SOAK_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uWetEnd;      // metres soaked so far
  uniform float uHeadAt;      // where the jet's head is, metres along
  uniform float uHalfW;
  uniform float uEdgeNoise;
  uniform float uEdgeScale;
  uniform float uCrashAt;     // metres along of the crash centre
  uniform float uCrashR;      // flood radius, grows on the crash
  uniform float uDark;
  uniform float uSheen;
  uniform float uEnv;
  uniform float uRippleScale;
  uniform float uRippleSpeed;
  uniform float uBump;
  uniform float uPuddleScale;
  uniform float uPuddleShare;
  uniform float uPuddleSize;
  uniform float uPuddleOpacity;
  uniform float uDrain;       // 0 wet .. 1 dry
  uniform float uErode;
  uniform float uFoamCover;   // foam scum round the crash, 0..1
  uniform float uOpacity;
  uniform vec3  uColorWet;
  uniform vec3  uColorPuddle;
  uniform vec3  uColorSheen;
  uniform vec3  uColorFoam;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;

  varying vec2 vFlat;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${ENV_GLSL}

  /** Rippled height of the water film: rings travelling down the line + chop. */
  float waterHeight(vec2 p) {
    float run = sin(p.y * uRippleScale * 2.0 - uTime * uRippleSpeed * 3.0 + snoise(vec3(p * 0.8, uSeed)) * 2.0);
    float chop = snoise(vec3(p * uRippleScale, uTime * uRippleSpeed * 0.5 + uSeed));
    return run * 0.35 + chop * 0.65;
  }

  void main() {
    vec2 p = vFlat;
    float x = p.x;
    float along = p.y;

    // The band behind the head, with ragged edges, and the flood disc.
    float edgeN = fbm3(vec3(p * uEdgeScale, uSeed)) * uEdgeNoise * uHalfW;
    float band = (1.0 - smoothstep(uHalfW * 0.55, uHalfW, abs(x) + edgeN))
               * (1.0 - smoothstep(uWetEnd - 0.4, uWetEnd + 0.1, along + edgeN * 0.6))
               * smoothstep(0.0, 0.5, along);
    vec2 toCrash = vec2(x, along - uCrashAt);
    float crashN = fbm3(vec3(normalize(toCrash + 1e-4) * 1.7, uSeed + 3.0)) * 0.35;
    float flood = 1.0 - smoothstep(uCrashR * (0.7 + crashN), uCrashR * (1.0 + crashN), length(toCrash));
    float wet = max(band, flood);
    if (wet < 0.004) discard;

    // Puddles: voronoi cells that hold water longer than the film round them.
    vec2 cell = voronoi2(p * uPuddleScale + uSeed * 3.1);
    float holds = step(1.0 - uPuddleShare, cell.y);
    float pr = uPuddleSize * (1.0 - smoothstep(0.55, 1.0, uDrain));
    float puddle = holds * (1.0 - smoothstep(pr * 0.75, pr, cell.x)) * wet;

    // The film dries first, raggedly.
    float dryN = snoise(vec3(p * 1.3, uSeed * 5.0)) * 0.5 + 0.5;
    float filmThr = uDrain * 1.3 - 0.15;
    float film = wet * (uDrain <= 0.0 ? 1.0 : smoothstep(filmThr, filmThr + 0.2, mix(0.5, dryN, uErode)));

    float cover = max(film, puddle);
    if (cover < 0.004) discard;

    // Ripples tilt the glint. Central differences on the film's height.
    float e = 0.05;
    float h0 = waterHeight(p);
    float hx = waterHeight(p + vec2(e, 0.0));
    float hz = waterHeight(p + vec2(0.0, e));
    float bump = uBump * (0.4 + 0.6 * puddle);
    vec3 N = normalize(vec3(-(hx - h0) / e * bump * 0.08, 1.0, -(hz - h0) / e * bump * 0.08));
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 90.0) * uSheen;
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0) + 0.04;
    vec3 env = texture2D(uEnvMap, rtEquirect(reflect(-V, N))).rgb * uEnv * fres;

    // Freshly wet right behind the head: a brighter, moving sheen.
    float fresh = exp(-max(uHeadAt - along, 0.0) / 2.5) * (1.0 - uDrain);

    vec3 col = mix(uColorWet, uColorPuddle, puddle);
    col += (uColorSheen * spec + env) * (0.4 + 0.6 * puddle + fresh);
    float a = film * uDark + puddle * uPuddleOpacity;

    // Foam scum floating on the flood.
    float scum = smoothstep(0.15, 0.7, fbm3(vec3(p * 2.4, uTime * 0.15 + uSeed)) * 0.5 + 0.5 - (1.0 - flood) * 0.6);
    scum *= uFoamCover * (1.0 - uDrain) * flood;
    col = mix(col, uColorFoam, scum * 0.85);
    a = max(a, scum * 0.8);

    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * mix(1.0, uGlobalGlow, 0.5), clamp(a, 0.0, 1.0));
  }
`;

/** The soaked floor. Normal blending: wet floor is *darker*. */
export function createRiptideSoakMaterial() {
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
      uEnvMap: frame.uEnvMap,
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uWidth: { value: 4 },
      uSeed: { value: 0 },
      uWetEnd: { value: 0 },
      uHeadAt: { value: 0 },
      uHalfW: { value: 1 },
      uEdgeNoise: { value: 0.3 },
      uEdgeScale: { value: 1 },
      uCrashAt: { value: 10 },
      uCrashR: { value: 0 },
      uDark: { value: 0.6 },
      uSheen: { value: 1 },
      uEnv: { value: 0.6 },
      uRippleScale: { value: 2.6 },
      uRippleSpeed: { value: 2.4 },
      uBump: { value: 0.6 },
      uPuddleScale: { value: 0.7 },
      uPuddleShare: { value: 0.45 },
      uPuddleSize: { value: 0.4 },
      uPuddleOpacity: { value: 0.75 },
      uDrain: { value: 0 },
      uErode: { value: 0.6 },
      uFoamCover: { value: 0 },
      uOpacity: { value: 1 },
      uColorWet: { value: new Color() },
      uColorPuddle: { value: new Color() },
      uColorSheen: { value: new Color() },
      uColorFoam: { value: new Color() }
    }),
    vertexShader: SOAK_VERTEX,
    fragmentShader: SOAK_FRAGMENT
  });

  /**
   * @param {object} state { start, dir, side, length, width, wetEnd, headAt,
   *   crashAt, crashR, drain, foamCover, seed }
   */
  material.userData.sync = (state) => {
    const c = settings.riptide;
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.1, state.length);
    u.uWidth.value = state.width;
    u.uSeed.value = state.seed;
    u.uWetEnd.value = state.wetEnd;
    u.uHeadAt.value = state.headAt;
    u.uHalfW.value = Math.max(0.05, c.soakWidth);
    u.uEdgeNoise.value = c.soakEdgeNoise * g.noiseStrength;
    u.uEdgeScale.value = c.soakEdgeScale * g.noiseFrequency;
    u.uCrashAt.value = state.crashAt;
    u.uCrashR.value = state.crashR;
    u.uDark.value = c.soakDark;
    u.uSheen.value = c.soakSheen * g.glow;
    u.uEnv.value = c.soakEnv;
    u.uRippleScale.value = c.rippleScale * g.noiseFrequency;
    u.uRippleSpeed.value = c.rippleSpeed * g.noiseSpeed;
    u.uBump.value = c.rippleBump * g.noiseStrength;
    u.uPuddleScale.value = c.puddleScale;
    u.uPuddleShare.value = c.puddleShare;
    u.uPuddleSize.value = c.puddleSize;
    u.uPuddleOpacity.value = c.puddleOpacity;
    u.uDrain.value = state.drain;
    u.uErode.value = c.drainErode;
    u.uFoamCover.value = state.foamCover;
    u.uOpacity.value = g.opacity;
    u.uColorWet.value.copy(getColor(c.colorWet));
    u.uColorPuddle.value.copy(getColor(c.colorPuddle));
    u.uColorSheen.value.copy(getColor(c.colorSheen));
    u.uColorFoam.value.copy(getColor(c.colorWaveFoam));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The breaking wave                                                    */
/* -------------------------------------------------------------------- */

const WAVE_STEPS = 24;

const WAVE_VERTEX = /* glsl */ `
  uniform vec3  uCentre;      // floor point at the end of the line
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uWidth;
  uniform float uLen;         // arc length of the profile, metres
  uniform float uBack;        // fraction of uLen the base sits behind the centre
  uniform float uSlope;       // radians the back face rises at
  uniform float uCurl;        // radians the lip has turned past horizontal
  uniform float uCurlPow;
  uniform float uPeel;
  uniform float uEndTaper;
  uniform float uBend;
  uniform float uLipNoise;
  uniform float uNoiseScale;
  uniform float uCrash;       // 0 standing .. 1 collapsed
  uniform float uSurge;
  uniform float uFlow;
  uniform float uSeed;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec2  vWave;        // x: -1..1 across, y: 0 base .. 1 lip
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float u = uv.x * 2.0 - 1.0;
    float v = uv.y;

    // The two ends are lower and curl later; one side peels first.
    float endK = pow(max(1.0 - u * u, 0.0), uEndTaper * 0.5 + 0.05);
    float peelK = 1.0 - uPeel * (u * 0.5 + 0.5);
    float lipN = snoise(vec3(u * uNoiseScale * 2.0, uFlow * 0.4, uSeed)) * uLipNoise;
    // The ends come all the way down to the floor, so the wave grows out of
    // the water rather than standing on it like a slab.
    float L = uLen * mix(0.06, 1.0, endK) * (1.0 + lipN * v);
    float curl = uCurl * peelK * mix(0.6, 1.0, endK);

    // Integrate the profile: the tangent turns from the back face's slope
    // through horizontal (the crest) to -curl (the lip, over and down).
    vec2 p = vec2(0.0);
    float th = uSlope;
    float target = v * ${WAVE_STEPS}.0;
    float ds = L / ${WAVE_STEPS}.0;
    for (int i = 0; i < ${WAVE_STEPS}; i++) {
      float fi = float(i);
      if (fi >= target) break;
      float frac = min(1.0, target - fi);
      float sm = (fi + 0.5 * frac) / ${WAVE_STEPS}.0;
      th = uSlope - (uSlope + curl) * pow(sm, uCurlPow);
      p += vec2(cos(th), sin(th)) * ds * frac;
    }

    // The crash: it falls flat and surges on.
    float fall = uCrash * uCrash;
    p.y *= 1.0 - fall;
    p.x += uSurge * uCrash * (0.4 + 0.6 * v);
    // A crescent: the ends wrap forward round the far end of the line.
    float z = p.x - uLen * uBack + uBend * u * u * uWidth * 0.5;
    float across = u * uWidth * 0.5 * (1.0 + uCrash * 0.25);
    vec3 world = uCentre + uSide * across + uDir * z + vec3(0.0, max(p.y, 0.0) + 0.02, 0.0);

    // Normal of the profile, (−sin, cos) in the (forward, up) plane.
    vec3 n = normalize(uDir * -sin(th) + vec3(0.0, cos(th), 0.0));
    vNormalW = normalize(mix(n, vec3(0.0, 1.0, 0.0), fall));
    vWorld = world;
    vWave = vec2(u, v);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const WAVE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uFlow;
  uniform float uCrash;
  uniform float uOpacity;
  uniform float uFresnel;
  uniform float uTranslucency;
  uniform float uFoamStart;
  uniform float uFoam;
  uniform float uFoamScale;
  uniform float uStreaks;
  uniform float uEnv;
  uniform float uFade;
  uniform vec3  uColorDeep;
  uniform vec3  uColorMid;
  uniform vec3  uColorThin;
  uniform vec3  uColorFoam;
  uniform vec3  uColorSpec;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec2  vWave;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}
  ${ENV_GLSL}

  void main() {
    float u = vWave.x;
    float v = vWave.y;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    float fres = pow(1.0 - abs(dot(N, V)), 3.0) * uFresnel;

    // Body colour runs deep → mid → thin up the profile; the thin top glows
    // where the sun comes through it.
    vec3 col = mix(uColorDeep, uColorMid, smoothstep(0.0, 0.45, v));
    float thin = smoothstep(0.35, 0.85, v) * (1.0 - smoothstep(0.92, 1.0, v) * 0.5);
    float back = pow(max(dot(-V, L) * 0.5 + 0.5, 0.0), 2.0);
    col = mix(col, uColorThin, thin * 0.7);
    col += uColorThin * thin * back * uTranslucency * uShaderIntensity;
    vec3 env = texture2D(uEnvMap, rtEquirect(reflect(-V, N))).rgb * uEnv;
    col += env * (0.15 + fres) + uColorThin * fres * 0.6;
    vec3 H = normalize(L + V);
    col += uColorSpec * pow(max(dot(N, H), 0.0), 70.0) * 2.0;

    // Foam: a ragged crest, and streaks of it dragged down the face.
    float fn = fbm3(vec3(u * uFoamScale * 2.0, v * uFoamScale - uFlow * 0.6, uSeed)) * 0.5 + 0.5;
    float crest = smoothstep(uFoamStart, uFoamStart + 0.25, v + (fn - 0.5) * 0.4);
    float streak = smoothstep(0.55, 0.85, snoise(vec3(u * uFoamScale * 3.5, v * 1.2 + uFlow * 0.9, uSeed + 4.0)) * 0.5 + 0.5)
                 * smoothstep(0.1, 0.6, v) * uStreaks;
    float foam = clamp(max(crest * (0.55 + 0.45 * fn), streak) * uFoam, 0.0, 1.0);
    // More foam as it collapses: a crashed wave is mostly white water.
    foam = max(foam, uCrash * smoothstep(0.3, 0.7, fn));
    col = mix(col, uColorFoam * (1.0 + 0.3 * back), foam);

    // Dissolving into the floor on the crash, a foam edge where it goes.
    float dn = fbm3(vec3(u * 3.0, v * 2.5, uSeed * 2.0 + uTime * 0.5)) * 0.5 + 0.5;
    float thr = smoothstep(0.45, 1.0, uCrash) * 1.2 - 0.1;
    float keep = uCrash <= 0.45 ? 1.0 : smoothstep(thr, thr + 0.08, dn);
    float edge = uCrash <= 0.45 ? 0.0 : smoothstep(thr - 0.02, thr + 0.08, dn) - smoothstep(thr + 0.08, thr + 0.2, dn);
    col = mix(col, uColorFoam * 1.4, clamp(edge, 0.0, 1.0));

    // Ragged, soft ends, and white water where it meets the floor.
    float ends = 1.0 - smoothstep(0.55, 1.0, abs(u) + (fn - 0.5) * 0.25);
    float skirt = (1.0 - smoothstep(0.0, 0.16, v)) * (0.55 + 0.45 * fn);
    col = mix(col, uColorFoam, skirt * 0.8);
    foam = max(foam, skirt);
    float base = smoothstep(0.0, 0.03, v);
    float alpha = max(mix(uOpacity, 1.0, clamp(fres, 0.0, 1.0)), foam) * keep * ends * base * uFade;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.25);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/** The curling wave. Alpha-blended, double-sided (you see under the lip). */
export function createRiptideWaveMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uCentre: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uWidth: { value: 5 },
      uLen: { value: 2.5 },
      uBack: { value: 0.45 },
      uSlope: { value: 1 },
      uCurl: { value: 0.2 },
      uCurlPow: { value: 1.7 },
      uPeel: { value: 0.3 },
      uEndTaper: { value: 0.6 },
      uBend: { value: 0.4 },
      uLipNoise: { value: 0.18 },
      uNoiseScale: { value: 1.4 },
      uCrash: { value: 0 },
      uSurge: { value: 1.5 },
      uFlow: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 0.7 },
      uFresnel: { value: 1.6 },
      uTranslucency: { value: 1.4 },
      uFoamStart: { value: 0.62 },
      uFoam: { value: 1 },
      uFoamScale: { value: 3.2 },
      uStreaks: { value: 0.6 },
      uEnv: { value: 0.9 },
      uFade: { value: 1 },
      uColorDeep: { value: new Color() },
      uColorMid: { value: new Color() },
      uColorThin: { value: new Color() },
      uColorFoam: { value: new Color() },
      uColorSpec: { value: new Color() }
    }),
    vertexShader: WAVE_VERTEX,
    fragmentShader: WAVE_FRAGMENT
  });

  /**
   * @param {object} state { centre, dir, side, len, curl, crash, flow, fade, seed }
   */
  material.userData.sync = (state) => {
    const c = settings.riptide;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uWidth.value = Math.max(0.2, c.waveWidth);
    u.uLen.value = Math.max(0.01, state.len);
    u.uBack.value = c.waveBack;
    u.uSlope.value = c.waveSlope;
    u.uCurl.value = state.curl;
    u.uCurlPow.value = Math.max(0.2, c.curlPower);
    u.uPeel.value = c.peel * g.randomness;
    u.uEndTaper.value = c.endTaper;
    u.uBend.value = c.waveBend;
    u.uLipNoise.value = c.lipNoise * g.noiseStrength;
    u.uNoiseScale.value = c.waveNoiseScale * g.noiseFrequency;
    u.uCrash.value = state.crash;
    u.uSurge.value = c.crashSurge;
    u.uFlow.value = state.flow;
    u.uSeed.value = state.seed;
    u.uOpacity.value = c.waveOpacity * g.opacity;
    u.uFresnel.value = c.waveFresnel * g.fresnel;
    u.uTranslucency.value = c.waveTranslucency * g.glow;
    u.uFoamStart.value = c.waveFoamStart;
    u.uFoam.value = c.waveFoam;
    u.uFoamScale.value = c.waveFoamScale * g.noiseFrequency;
    u.uStreaks.value = c.waveStreaks;
    u.uEnv.value = c.envReflect;
    u.uFade.value = state.fade;
    u.uColorDeep.value.copy(getColor(c.colorWaveDeep));
    u.uColorMid.value.copy(getColor(c.colorWaveMid));
    u.uColorThin.value.copy(getColor(c.colorWaveThin));
    u.uColorFoam.value.copy(getColor(c.colorWaveFoam));
    u.uColorSpec.value.copy(getColor(c.colorSpec));
  };

  return material;
}
