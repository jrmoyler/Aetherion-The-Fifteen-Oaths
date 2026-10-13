import { Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Maelstrom Vortex — the three bespoke shaders the whirlpool is drawn with.
 *
 *  - **the funnel** — a polar grid dropped, in the vertex stage, into a
 *    whirlpool: shallow out on the open water, plunging toward the eye on
 *    `funnelCurve`, then on down a throat; a raised, turning lip near the edge;
 *    spiral swell running in along the wall. The normal is taken by finite
 *    differences of that same height, so the light and the shape agree.
 *
 *    The fragment draws the *flow*: spiral bands of thin streaks sampled on a
 *    cylinder in (advected angle, log radius) — so they wind in like water
 *    going down a drain, have no seam, and turn faster toward the eye because
 *    the advection is `spin × r^-falloff`, integrated on the CPU so a slider
 *    never makes them jump. Foam breaks on the lip, rides the crests of the
 *    swell and laps the stone at the edge. Fresnel and the stage's own sky for
 *    the reflection, the sun's glints, and the water darkening toward the eye
 *    into an abyss.
 *
 *    **It is drawn below the floor.** The stage floor is opaque and writes
 *    depth, so a surface a metre under it would simply never be seen. The
 *    funnel writes its own depth instead: a fragment under the floor is placed
 *    *just in front of* the point where its view ray crosses the floor, by a
 *    margin that shrinks with how far below it is. That is monotonic along any
 *    one ray, so the funnel still sorts against itself (the near wall hides the
 *    throat behind it), it passes in front of the floor it replaces, and a body
 *    standing on the water — which is genuinely nearer the camera than the
 *    floor — still hides the water behind it.
 *  - **the swirl** — a quad on `LAYER.DISTORTION` that bends the world round
 *    the rim: the offset is the swirl's own tangent, with churning noise mixed
 *    in, strongest in a band over the lip and inside it.
 *  - **the geyser** — an open tube shaped into a column of water: narrow at
 *    the foot, flaring and tearing apart at the top on a noise threshold,
 *    streaks racing up it, bright at its silhouette (fresnel) where the water
 *    is seen edge-on.
 *
 * Every material reads `settings.maelstrom` in `userData.sync(state)`.
 */

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* -------------------------------------------------------------------- */
/* The whirlpool's height — shared by both stages of the funnel         */
/* -------------------------------------------------------------------- */

/**
 * `funnelHeight(x, a)` — metres above the floor at normalised radius `x`
 * (0 eye .. 1 edge) and bearing `a`. `MaelstromVortexAbility#_surfaceAt` is
 * the CPU copy (without the swell) the bodies ride, so change them together.
 */
const FUNNEL_GLSL = /* glsl */ `
  uniform float uRadius;      // the pool, metres
  uniform float uDepth;       // already × how far the funnel has opened
  uniform float uCurve;
  uniform float uEye;
  uniform float uThroat;      // already × open
  uniform float uRimHeight;   // already × flood
  uniform float uRimAt;
  uniform float uRimWidth;
  uniform float uWaveAmp;
  uniform float uWaveArms;
  uniform float uWaveTwist;
  uniform float uWavePhase;

  float funnelHeight(float x, float a) {
    float eye = max(uEye, 0.02);
    float s = 1.0 - smoothstep(eye, 1.0, x);
    float h = -uDepth * pow(s, max(uCurve, 0.2));
    if (x < eye) h = -uDepth - uThroat * pow(1.0 - x / eye, 0.6);
    float d = (x - uRimAt) / max(uRimWidth, 0.01);
    h += uRimHeight * exp(-d * d);
    float swell = sin(uWaveArms * a + uWaveTwist * log(max(x, 0.02)) * 2.0 - uWavePhase);
    h += uWaveAmp * swell * smoothstep(eye, eye + 0.15, x) * (1.0 - smoothstep(0.9, 1.0, x)) * (uDepth > 0.0 ? 1.0 : 0.0);
    return h;
  }
`;

const FUNNEL_VERTEX = /* glsl */ `
  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec2  vPolar;       // (x normalised radius, bearing)
  varying float vHeight;
  varying float vViewZ;

  ${FUNNEL_GLSL}

  vec3 funnelPoint(float x, float a) {
    return vec3(cos(a) * x * uRadius, funnelHeight(x, a), sin(a) * x * uRadius);
  }

  void main() {
    float x = length(position.xz);
    float a = atan(position.z, position.x);
    vec3 p = funnelPoint(x, a);
    float dx = 0.006;
    float da = 0.006 / max(x, 0.03);
    vec3 pr = funnelPoint(x + dx, a);
    vec3 pa = funnelPoint(x, a + da);
    vec3 n = normalize(cross(pa - p, pr - p));
    if (n.y < 0.0) n = -n;
    // A hair over the floor where the water is level with it.
    p.y += 0.012;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = n;
    vPolar = vec2(x, a);
    vHeight = p.y;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FUNNEL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uFlood;       // 0..1 how far out the water has spread
  uniform float uFade;        // 1 standing .. 0 dried away
  uniform float uSpin;        // radians the rim has turned, integrated on the CPU
  uniform float uFalloff;
  uniform float uFlowArms;
  uniform float uFlowTwist;
  uniform float uFlowScale;
  uniform float uFlowSharp;
  uniform float uFlowStrength;
  uniform float uOpacity;
  uniform float uReflect;
  uniform float uFresnel;
  uniform float uFresnelPower;
  uniform float uSpecular;
  uniform float uSpecularSharp;
  uniform float uDepthDark;
  uniform float uFoamRim;
  uniform float uFoamRimWidth;
  uniform float uFoamArms;
  uniform float uFoamScale;
  uniform float uEdgeFoam;
  uniform float uRimGlowAmt;
  uniform float uDepthBias;
  uniform vec3  uColorShallow;
  uniform vec3  uColorDeep;
  uniform vec3  uColorAbyss;
  uniform vec3  uColorFoam;
  uniform vec3  uColorSky;
  uniform vec3  uColorRimGlow;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uHasEnv;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec2  vPolar;
  varying float vHeight;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}
  ${ENV_GLSL}
  ${FUNNEL_GLSL}

  vec3 env(vec3 dir) {
    return uHasEnv > 0.5 ? texture2D(uEnvMap, equirectUv(dir)).rgb : uColorSky * (0.4 + 0.6 * max(dir.y, 0.0));
  }

  void main() {
    float x = vPolar.x;
    float a = vPolar.y;
    float eye = max(uEye, 0.02);

    // The water spreads from the middle; its leading edge is ragged.
    float edgeN = snoise(vec3(cos(a) * 2.5, sin(a) * 2.5, uSeed + uTime * 0.4)) * 0.04;
    float reach = min(uFlood, 1.0) + edgeN;
    if (x > reach) discard;
    float edge = smoothstep(reach, reach - 0.035, x);

    // Advected bearing: the water turns faster toward the eye.
    float adv = uSpin * pow(clamp(x, eye * 0.5, 1.0), -uFalloff);
    float phi = a + adv;
    float lr = log(max(x, 0.02));

    // Flow lines: thin spiral bands, sampled on a cylinder so nothing seams.
    float spiral = phi * uFlowArms + lr * uFlowTwist * uFlowArms * 0.5;
    vec3 fp = vec3(cos(phi) * 1.4, sin(phi) * 1.4, lr * 7.0 * uFlowScale + uSeed);
    float fl = 1.0 - abs(snoise(fp + vec3(0.0, 0.0, sin(spiral) * 0.35)));
    float lines = pow(fl, max(uFlowSharp, 1.0));
    float fine = pow(1.0 - abs(snoise(fp * vec3(1.0, 1.0, 2.7) + 7.3)), max(uFlowSharp, 1.0) * 1.5);
    lines = lines * 0.7 + fine * 0.5;

    // Normal: the shape's, nudged by the flow so the streaks catch the light.
    vec3 N = normalize(vNormalW);
    vec3 tangent = normalize(vec3(-sin(a), 0.0, cos(a)));
    N = normalize(N + tangent * (fl - 0.5) * 0.25 * uShaderIntensity);

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = clamp(0.04 + uFresnel * pow(1.0 - ndv, max(uFresnelPower, 0.5)), 0.0, 1.0);

    // Depth: darker the further down, an abyss in the eye.
    float total = max(uDepth + uThroat, 0.1);
    float deep = clamp(-vHeight / total * uDepthDark * 1.6, 0.0, 1.0);
    vec3 body = mix(uColorShallow, uColorDeep, pow(deep, 0.6));
    body = mix(body, uColorAbyss, smoothstep(eye * 1.1, eye * 0.3, x) * step(0.001, uDepth));
    body += uColorShallow * lines * uFlowStrength * (1.0 - deep * 0.7) * uGlobalGlow;

    vec3 R = reflect(-V, N);
    vec3 color = mix(body, env(R) * uReflect, fres);
    float spec = pow(clamp(dot(R, L), 0.0, 1.0), max(uSpecularSharp, 2.0));
    color += vec3(spec) * uSpecular * (1.0 - deep);

    // Foam: on the lip, on the crests of the swell, and lapping the stone.
    float fn = fbm3(vec3(cos(phi) * uFoamScale, sin(phi) * uFoamScale, x * uFoamScale * 2.0 + uSeed)) * 0.5 + 0.5;
    float rd = (x - uRimAt) / max(uFoamRimWidth, 0.01);
    float rimFoam = exp(-rd * rd) * smoothstep(0.35, 0.75, fn + lines * 0.3) * uFoamRim;
    float crest = sin(uWaveArms * a + uWaveTwist * lr * 2.0 - uWavePhase);
    float armFoam = smoothstep(0.55, 0.95, crest) * smoothstep(0.45, 0.8, fn) * uFoamArms
                  * smoothstep(eye, eye + 0.2, x) * step(0.001, uDepth);
    float lap = smoothstep(reach - 0.12, reach - 0.01, x) * smoothstep(0.3, 0.6, fn) * uEdgeFoam;
    float foam = clamp(rimFoam + armFoam + lap, 0.0, 1.0);
    float ndl = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    color = mix(color, uColorFoam * (0.55 + 0.45 * ndl), foam);

    // A cold glow along the turning lip.
    float rg = (x - uRimAt) / max(uFoamRimWidth * 1.8, 0.01);
    color += uColorRimGlow * exp(-rg * rg) * uRimGlowAmt * uGlobalGlow;

    // Drying away: in patches, from the edge in.
    float dn = fbm3(vec3(vWorld.xz * 0.9, uSeed * 3.0)) * 0.5 + 0.5;
    float thr = (1.0 - uFade) * 1.2 - 0.1;
    float keep = uFade >= 1.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(dn, 1.0 - x, 0.35));

    float alpha = uOpacity * edge * keep;
    alpha = max(alpha, foam * edge * keep);
    if (alpha < 0.004) discard;

    // Under the floor: placed just in front of where the view ray crosses it.
    float depthOut = gl_FragCoord.z;
    vec3 ray = vWorld - cameraPosition;
    if (vWorld.y < 0.0 && ray.y < -1e-4) {
      float len = length(ray);
      float t = cameraPosition.y / (cameraPosition.y - vWorld.y);
      float dFloor = t * len;
      float dOut = dFloor - uDepthBias * exp(-(len - dFloor) * 1.5);
      float vz = vViewZ * (dOut / len);
      depthOut = viewZToPerspectiveDepth(vz, uCameraNear, uCameraFar);
    }
    gl_FragDepth = depthOut;

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

/** The whirlpool's surface. Writes its own depth — see the file comment. */
export function createFunnelMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uHasEnv: { value: 0 },
      uRadius: { value: 4 },
      uDepth: { value: 0 },
      uCurve: { value: 2.4 },
      uEye: { value: 0.2 },
      uThroat: { value: 0 },
      uRimHeight: { value: 0.12 },
      uRimAt: { value: 0.86 },
      uRimWidth: { value: 0.07 },
      uWaveAmp: { value: 0.07 },
      uWaveArms: { value: 4 },
      uWaveTwist: { value: 3 },
      uWavePhase: { value: 0 },
      uSeed: { value: 0 },
      uFlood: { value: 0 },
      uFade: { value: 1 },
      uSpin: { value: 0 },
      uFalloff: { value: 1.1 },
      uFlowArms: { value: 5 },
      uFlowTwist: { value: 3.6 },
      uFlowScale: { value: 1 },
      uFlowSharp: { value: 6 },
      uFlowStrength: { value: 0.55 },
      uOpacity: { value: 0.97 },
      uReflect: { value: 0.85 },
      uFresnel: { value: 1.3 },
      uFresnelPower: { value: 4 },
      uSpecular: { value: 2.4 },
      uSpecularSharp: { value: 140 },
      uDepthDark: { value: 1 },
      uFoamRim: { value: 1 },
      uFoamRimWidth: { value: 0.08 },
      uFoamArms: { value: 0.6 },
      uFoamScale: { value: 3 },
      uEdgeFoam: { value: 0.9 },
      uRimGlowAmt: { value: 0.5 },
      uDepthBias: { value: 0.04 },
      uColorShallow: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorAbyss: { value: new Color() },
      uColorFoam: { value: new Color() },
      uColorSky: { value: new Color() },
      uColorRimGlow: { value: new Color() }
    }),
    vertexShader: FUNNEL_VERTEX,
    fragmentShader: FUNNEL_FRAGMENT
  });

  /**
   * @param {object} state { radius, open, flood, fade, spin, wavePhase, seed }
   */
  material.userData.sync = (state) => {
    const c = settings.maelstrom;
    const g = settings.global;
    const u = material.uniforms;
    u.uHasEnv.value = frame.uEnvMap.value ? 1 : 0;
    u.uRadius.value = state.radius;
    u.uDepth.value = c.funnelDepth * state.open;
    u.uCurve.value = c.funnelCurve;
    u.uEye.value = c.eyeRadius;
    u.uThroat.value = c.throatDepth * state.open;
    u.uRimHeight.value = c.rimHeight * state.open;
    u.uRimAt.value = c.rimAt;
    u.uRimWidth.value = c.rimWidth;
    u.uWaveAmp.value = c.waveAmp * g.noiseStrength * state.open;
    u.uWaveArms.value = Math.max(1, Math.round(c.waveArms));
    u.uWaveTwist.value = c.waveTwist;
    u.uWavePhase.value = state.wavePhase;
    u.uSeed.value = state.seed;
    u.uFlood.value = state.flood;
    u.uFade.value = state.fade;
    u.uSpin.value = state.spin;
    u.uFalloff.value = c.swirlFalloff;
    u.uFlowArms.value = c.flowArms;
    u.uFlowTwist.value = c.flowTwist;
    u.uFlowScale.value = c.flowScale * g.noiseFrequency;
    u.uFlowSharp.value = c.flowSharp;
    u.uFlowStrength.value = c.flowStrength * g.shaderIntensity;
    u.uOpacity.value = c.waterOpacity * g.opacity;
    u.uReflect.value = c.reflect;
    u.uFresnel.value = c.fresnel * g.fresnel;
    u.uFresnelPower.value = c.fresnelPower;
    u.uSpecular.value = c.specular * g.shaderIntensity;
    u.uSpecularSharp.value = c.specularSharp;
    u.uDepthDark.value = c.depthDark;
    u.uFoamRim.value = c.foamRim * state.open;
    u.uFoamRimWidth.value = c.foamRimWidth;
    u.uFoamArms.value = c.foamArms;
    u.uFoamScale.value = c.foamScale * g.noiseFrequency;
    u.uEdgeFoam.value = c.edgeFoam;
    u.uRimGlowAmt.value = c.rimGlow * g.glow * state.open;
    u.uColorShallow.value.copy(getColor(c.colorShallow));
    u.uColorDeep.value.copy(getColor(c.colorDeep));
    u.uColorAbyss.value.copy(getColor(c.colorAbyss));
    u.uColorFoam.value.copy(getColor(c.colorFoam));
    u.uColorSky.value.copy(getColor(c.colorSky));
    u.uColorRimGlow.value.copy(getColor(c.colorRimGlow));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The swirl — LAYER.DISTORTION                                         */
/* -------------------------------------------------------------------- */

const WARP_VERTEX = /* glsl */ `
  uniform float uExtent;     // metres, half-size of the quad
  varying vec2 vLocal;       // metres from the centre
  varying vec2 vTangentS;    // the swirl's tangent, on screen

  void main() {
    vec3 p = position * uExtent;
    p.y = 0.03;
    vLocal = p.xz;
    vec2 t = normalize(vec2(-p.z, p.x) + 1e-4);
    vTangentS = (viewMatrix * vec4(t.x, 0.0, t.y, 0.0)).xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uRadius;
  uniform float uWidth;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSwirl;
  uniform float uSpin;
  uniform float uFlood;
  uniform float uShaderIntensity;

  varying vec2 vLocal;
  varying vec2 vTangentS;

  ${noiseGLSL}

  void main() {
    float r = length(vLocal) / max(uRadius, 0.1);
    float a = atan(vLocal.y, vLocal.x) + uSpin * 0.6;
    float d = (r - 0.9) / max(uWidth, 0.02);
    float band = exp(-d * d) + 0.45 * (1.0 - smoothstep(0.2, 0.85, r)) * smoothstep(0.05, 0.2, r);
    band *= smoothstep(uFlood + 0.05, uFlood - 0.1, r);
    vec3 np = vec3(cos(a) * uScale * 2.0, sin(a) * uScale * 2.0, r * uScale * 3.0 - uTime * uSpeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(11.7, 3.1, 5.3)));
    vec2 offset = normalize(vTangentS + 1e-5) * uSwirl + n * (1.0 - uSwirl);
    float strength = uStrength * uShaderIntensity * band;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(offset, -1.0, 1.0) * 0.5 + 0.5, strength, clamp(band, 0.0, 1.0));
  }
`;

export function createMaelstromWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uExtent: { value: 6 },
      uRadius: { value: 4 },
      uWidth: { value: 0.3 },
      uStrength: { value: 1 },
      uScale: { value: 1.8 },
      uSpeed: { value: 2.5 },
      uSwirl: { value: 0.55 },
      uSpin: { value: 0 },
      uFlood: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} state { radius, open, flood, spin, strength } */
  material.userData.sync = (state) => {
    const c = settings.maelstrom;
    const g = settings.global;
    const u = material.uniforms;
    u.uRadius.value = state.radius;
    u.uExtent.value = state.radius * (1 + c.warpWidth * 2 + 0.1);
    u.uWidth.value = c.warpWidth;
    u.uStrength.value = c.warpStrength * g.distortion * state.strength;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
    u.uSwirl.value = Math.min(1, Math.max(0, c.warpSwirl));
    u.uSpin.value = state.spin;
    u.uFlood.value = state.flood;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The geyser                                                           */
/* -------------------------------------------------------------------- */

const COLUMN_VERTEX = /* glsl */ `
  uniform float uHeight;      // metres, already × the rise
  uniform float uRadius;
  uniform float uPhase;
  uniform float uSeed;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vH;
  varying float vAngle;

  ${noiseGLSL}

  void main() {
    float h = position.y;
    float a = atan(position.z, position.x);
    // Narrow at the foot, flaring as it rises, a crown at the top.
    float prof = 0.75 + 0.6 * h + 1.6 * smoothstep(0.7, 1.0, h);
    float n = snoise(vec3(cos(a) * 1.5, sin(a) * 1.5, h * 4.0 - uPhase * 2.0 + uSeed));
    float r = uRadius * prof * (1.0 + 0.22 * n);
    vec3 p = vec3(cos(a) * r, h * uHeight, sin(a) * r);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(vec3(cos(a), -0.25, sin(a)));
    vH = h;
    vAngle = a;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const COLUMN_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uSeed;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uStreaks;
  uniform float uDissolve;    // 0 whole .. 1 fallen back
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vH;
  varying float vAngle;

  ${noiseGLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    float ndv = abs(dot(N, V));
    float rim = pow(1.0 - ndv, 2.0);

    // Streaks racing up it.
    vec3 sp = vec3(cos(vAngle) * uStreaks * 0.5, sin(vAngle) * uStreaks * 0.5, vH * 3.0 - uPhase * 3.5 + uSeed);
    float streak = pow(1.0 - abs(snoise(sp)), 4.0);

    // Torn apart at the top, and falling back from the top down.
    float tn = fbm3(vec3(cos(vAngle) * 2.0, sin(vAngle) * 2.0, vH * 5.0 - uPhase + uSeed)) * 0.5 + 0.5;
    float top = 1.0 - smoothstep(0.65, 1.0, vH + (tn - 0.5) * 0.4);
    float thr = uDissolve * 1.2 - 0.1;
    float keep = uDissolve <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.15, tn * (1.0 - vH * 0.5) + 0.25);
    float foot = smoothstep(0.0, 0.05, vH);

    vec3 color = mix(uColorB, uColorA, clamp(rim + streak * 0.6, 0.0, 1.0)) * uGlow * uGlobalGlow;
    float alpha = uOpacity * (0.25 + 0.75 * rim + streak * 0.45) * top * keep * foot;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

export function createGeyserMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHeight: { value: 0 },
      uRadius: { value: 0.5 },
      uPhase: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 0.75 },
      uGlow: { value: 1.1 },
      uStreaks: { value: 7 },
      uDissolve: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: COLUMN_VERTEX,
    fragmentShader: COLUMN_FRAGMENT
  });

  /** @param {object} state { rise, dissolve, phase, seed } */
  material.userData.sync = (state) => {
    const c = settings.maelstrom;
    const g = settings.global;
    const u = material.uniforms;
    u.uHeight.value = c.geyserHeight * g.explosionIntensity * state.rise;
    u.uRadius.value = Math.max(0.05, c.geyserRadius);
    u.uPhase.value = state.phase;
    u.uSeed.value = state.seed;
    u.uOpacity.value = c.columnOpacity * g.opacity;
    u.uGlow.value = c.columnGlow;
    u.uStreaks.value = c.columnStreaks;
    u.uDissolve.value = state.dissolve;
    u.uColorA.value.copy(getColor(c.colorColumnA));
    u.uColorB.value.copy(getColor(c.colorColumnB));
  };

  return material;
}
