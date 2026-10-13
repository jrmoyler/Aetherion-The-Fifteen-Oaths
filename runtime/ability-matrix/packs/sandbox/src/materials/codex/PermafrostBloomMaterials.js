import { Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Permafrost Bloom — the bespoke shaders the frost is drawn with.
 *
 *  - **the rime** — one ground quad over the circle, everything in the
 *    fragment stage. Three scales of frost, each fed by the same front radius:
 *      · *the arms* — a handful of frost-fern spines radiating from the
 *        centre, wandering on noise, that run `armLead` ahead of the fill (so
 *        the frost visibly *races* along its veins), each feathered with side
 *        branches at 60° the way real hoar-frost dendrites branch;
 *      · *the dendrites* — a field of small six-armed fern crystals, one per
 *        jittered cell, each rotated by its own dice and grown to full length
 *        only once the front has passed it, so the floor fills in behind the
 *        arms with branching structure rather than a flat tint;
 *      · *the frosting* — fbm haze between them, white over a deep ice blue.
 *    A bright band rides the front while it spreads; the frost sparkles with
 *    view-dependent glints. It sublimates on a noise threshold with a
 *    glittering edge.
 *  - **ice** — one faceted material for the seed, the shells round frozen
 *    bodies and the spikes: a cold body colour that deepens where you look
 *    through more of it, a hard fresnel rim, the sky reflected in the faces,
 *    internal fractures on noise, light glowing up from the base, and a
 *    per-instance crack that dissolves it with a bright edge when it breaks.
 *    Instanced: the per-instance `aIce` is (glow, crack, seed, unused).
 *  - **cold air** — the rime's footprint again on `LAYER.DISTORTION`, a slow
 *    low shimmer over the frost.
 *
 * Every material reads `settings.permafrost` in `userData.sync(state)`;
 * `state` carries only what the ability knows that the settings do not.
 */

const ID = 'permafrost';

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* -------------------------------------------------------------------- */
/* The rime                                                             */
/* -------------------------------------------------------------------- */

/** A ±1 XZ quad, scaled and placed over the circle; `vFlat` is metres from its centre. */
const GROUND_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uQuad;        // half-size, metres
  uniform float uLift;

  varying vec2 vFlat;
  varying vec3 vWorld;

  void main() {
    vec3 world = uCenter + vec3(position.x * uQuad, 0.0, position.z * uQuad);
    world.y = uLift;
    vFlat = world.xz - uCenter.xz;
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

/**
 * A six-armed frost fern in a cell's own frame (`q`, cell units): fold into
 * one 30° half-arm, then the spine is the distance to the x axis and each side
 * branch is a segment leaving the spine at 60°, shorter toward the arm's tip.
 */
const FERN_GLSL = /* glsl */ `
  float fernBranches(vec2 p, float len, float spacing, float width, float maxBranch) {
    float d = p.x < len ? abs(p.y) : length(p - vec2(len, 0.0));
    if (p.x < 0.0) d = length(p);
    vec2 bd = vec2(0.5, 0.8660254);
    float sp = max(spacing, 0.02);
    float xb = mod(max(p.x, 0.0), sp);
    float x0 = max(p.x, 0.0) - xb;
    // This segment's branch, and the one before it (they slant forward).
    for (int k = 0; k < 2; k++) {
      float root = x0 - float(k) * sp;
      if (root < sp * 0.5 || root > len) continue;
      vec2 rel = vec2(p.x - root, abs(p.y));
      float bl = min((len - root) * 0.5, maxBranch);
      float t = clamp(dot(rel, bd), 0.0, bl);
      d = min(d, length(rel - bd * t));
    }
    float w = width * (1.0 - 0.6 * clamp(p.x / max(len, 1e-3), 0.0, 1.0));
    return 1.0 - smoothstep(w * 0.4, w, d);
  }

  float snowFern(vec2 q, float len, float spacing, float width) {
    float r = length(q);
    if (r > len + width) return 0.0;
    float a = atan(q.y, q.x);
    const float sector = 1.0471976;
    a = mod(a + sector * 0.5, sector) - sector * 0.5;
    vec2 p = r * vec2(cos(a), abs(sin(a)));
    return fernBranches(p, len, spacing, width, len * 0.5);
  }
`;

const RIME_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uFront;       // metres the fill has reached
  uniform float uRadius;      // the zone, metres
  uniform float uGrowing;     // 1 while spreading, eases to 0 once full
  uniform float uArmCount;
  uniform float uArmLead;
  uniform float uArmWidth;
  uniform float uArmWobble;
  uniform float uFernScale;
  uniform float uFernBranch;
  uniform float uFernWidth;
  uniform float uDensity;
  uniform float uFeather;
  uniform float uGlow;
  uniform float uFrontGlow;
  uniform float uFrontWidth;
  uniform float uSparkle;
  uniform float uSparkleScale;
  uniform float uTwinkle;     // integrated on the CPU
  uniform float uOpacity;
  uniform float uSublimate;   // 0 .. 1 gone
  uniform float uSubEdge;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorDeep;
  uniform vec3  uColorFront;
  uniform vec3  uColorSparkle;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec2 vFlat;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${FERN_GLSL}

  void main() {
    float r = length(vFlat);
    float ang = atan(vFlat.y, vFlat.x);
    if (r > uRadius * 1.15 || uFront <= 0.001) discard;

    // The fill's edge fingers out on noise; it never passes the circle.
    vec2 dir = vFlat / max(r, 1e-4);
    float edgeN = fbm3(vec3(dir * 2.4, uSeed)) * 0.5 + 0.5;
    float reach = min(uFront, uRadius) * (0.86 + 0.24 * edgeN);
    float fill = 1.0 - smoothstep(reach - uFeather, reach, r);
    float rim = 1.0 - smoothstep(uRadius * (0.97 + 0.06 * edgeN) - uFeather * 0.5, uRadius * (0.97 + 0.06 * edgeN) + uFeather * 0.5, r);

    /* --- 1 · the arms: spines from the centre, running ahead of the fill --- */
    float n = max(floor(uArmCount + 0.5), 1.0);
    float sector = 6.2831853 / n;
    float wob = snoise(vec3(r * 0.45, uSeed, 3.0)) * uArmWobble;
    float sa = ang + wob + uSeed;
    float idx = floor(sa / sector + 0.5);
    float da = sa - idx * sector;
    float armHash = hash11(idx * 13.7 + uSeed);
    vec2 ap = vec2(r * cos(da), r * sin(da));
    float armLen = min(uFront * (1.0 + uArmLead) * mix(0.8, 1.1, armHash), uRadius * 1.02);
    float arms = fernBranches(ap, armLen, 0.42, uArmWidth * 2.0, 0.6) * step(0.15, r);
    arms *= rim;

    /* --- 2 · the dendrites: one small fern per jittered cell --- */
    vec2 cp = vFlat * uFernScale + uSeed * 1.37;
    vec2 cell = floor(cp);
    vec2 f = fract(cp);
    float ferns = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 id = cell + g;
        vec2 o = vec2(hash13(vec3(id, 2.1)), hash13(vec3(id, 7.9)));
        vec2 q = f - g - o;
        float rot = hash13(vec3(id, 5.3)) * 6.2831853;
        float cs = cos(rot), sn = sin(rot);
        q = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
        // A crystal only grows once the front has passed its own centre.
        vec2 world = (id + o - uSeed * 1.37) / uFernScale;
        float behind = reach - length(world);
        float grown = clamp(behind * 1.6, 0.0, 1.0);
        float len = mix(0.35, 0.75, hash13(vec3(id, 3.3))) * grown;
        if (len <= 0.01) continue;
        ferns = max(ferns, snowFern(q, len, uFernBranch * len, uFernWidth * 2.0));
      }
    }
    ferns *= fill;

    /* --- 3 · the frosting --- */
    float haze = fbm4(vec3(vFlat * 1.6, uSeed * 2.0)) * 0.5 + 0.5;
    float grain = snoise(vec3(vFlat * 9.0, uSeed)) * 0.5 + 0.5;
    float frost = fill * clamp(uDensity * (0.55 + 0.6 * haze) + grain * 0.12, 0.0, 1.0);

    /* --- the front, while it races --- */
    float band = exp(-abs(r - reach) / max(uFrontWidth, 0.02)) * uGrowing * rim * step(r, reach + uFrontWidth * 2.0);

    /* --- glints: view-dependent sparkle in the frost --- */
    vec2 sp = vFlat * uSparkleScale;
    vec2 sc = floor(sp);
    float sh = hash13(vec3(sc, uSeed));
    float dot0 = 1.0 - smoothstep(0.05, 0.22, length(fract(sp) - 0.5 - (vec2(hash13(vec3(sc, 1.0)), hash13(vec3(sc, 2.0))) - 0.5) * 0.5));
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 facetN = normalize(vec3(hash13(vec3(sc, 3.0)) - 0.5, 1.2, hash13(vec3(sc, 4.0)) - 0.5));
    float catchL = pow(clamp(dot(reflect(-normalize(uLightDir), facetN), V), 0.0, 1.0), 40.0);
    float twinkle = pow(0.5 + 0.5 * sin(uTwinkle * (1.0 + sh * 2.0) + sh * 40.0), 12.0);
    float glint = dot0 * step(0.72, sh) * (catchL * 2.0 + twinkle) * max(frost, ferns) * uSparkle;

    /* --- colour --- */
    vec3 col = mix(uColorDeep, uColorB, frost);
    col = mix(col, uColorA * uGlow, clamp(ferns + arms, 0.0, 1.0));
    col += uColorFront * band * uFrontGlow;
    col += uColorSparkle * glint;
    float a = max(frost * uOpacity, max(ferns, arms) * 0.95);
    a = max(a, band * 0.9);
    a = max(a, clamp(glint, 0.0, 1.0));

    /* --- sublimation: a noise threshold eating it, with a glittering edge --- */
    float sn2 = fbm3(vec3(vFlat * 1.3, uSeed + 9.0)) * 0.5 + 0.5;
    float field = mix(sn2, sn2 * 0.6 + (1.0 - clamp(r / uRadius, 0.0, 1.0)) * 0.4, 0.5);
    float thr = uSublimate * 1.2 - 0.1;
    float keep = uSublimate <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.04, field);
    float edge = uSublimate <= 0.0 ? 0.0 : smoothstep(thr - uSubEdge, thr, field) - smoothstep(thr, thr + uSubEdge, field);
    col += uColorSparkle * edge * 3.0 * step(0.5, grain);
    a = a * keep + edge * 0.8 * fill;

    if (a < 0.004) discard;
    gl_FragColor = vec4(col * mix(1.0, uGlobalGlow, 0.5), clamp(a, 0.0, 1.0));
  }
`;

/** The frost across the floor. Normal blending: frost is white *paint*, not light. */
export function createRimeMaterial() {
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
      uCenter: { value: new Vector3() },
      uQuad: { value: 5 },
      uLift: { value: 0.013 },
      uSeed: { value: 0 },
      uFront: { value: 0 },
      uRadius: { value: 4 },
      uGrowing: { value: 1 },
      uArmCount: { value: 9 },
      uArmLead: { value: 0.24 },
      uArmWidth: { value: 0.05 },
      uArmWobble: { value: 0.4 },
      uFernScale: { value: 1.7 },
      uFernBranch: { value: 0.55 },
      uFernWidth: { value: 0.03 },
      uDensity: { value: 0.75 },
      uFeather: { value: 0.3 },
      uGlow: { value: 1.3 },
      uFrontGlow: { value: 2.6 },
      uFrontWidth: { value: 0.35 },
      uSparkle: { value: 2.4 },
      uSparkleScale: { value: 24 },
      uTwinkle: { value: 0 },
      uOpacity: { value: 0.9 },
      uSublimate: { value: 0 },
      uSubEdge: { value: 0.08 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorFront: { value: new Color() },
      uColorSparkle: { value: new Color() }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: RIME_FRAGMENT
  });

  /** @param {object} state { center, front, radius, growing, twinkle, sublimate, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uRadius.value = Math.max(0.2, state.radius);
    u.uQuad.value = state.radius * 1.2 + 0.5;
    u.uFront.value = state.front;
    u.uGrowing.value = state.growing;
    u.uSeed.value = state.seed;
    u.uArmCount.value = Math.max(1, Math.round(c.armCount));
    u.uArmLead.value = c.armLead;
    u.uArmWidth.value = c.armWidth;
    u.uArmWobble.value = c.armWobble * g.noiseStrength * g.randomness;
    u.uFernScale.value = Math.max(0.1, c.fernScale * g.noiseFrequency);
    u.uFernBranch.value = c.fernBranch;
    u.uFernWidth.value = c.fernWidth;
    u.uDensity.value = c.frostDensity;
    u.uFeather.value = Math.max(0.01, c.edgeFeather);
    u.uGlow.value = c.rimeGlow * g.glow;
    u.uFrontGlow.value = c.frontGlow * g.glow;
    u.uFrontWidth.value = c.frontWidth;
    u.uSparkle.value = c.sparkle * g.shaderIntensity;
    u.uSparkleScale.value = c.sparkleScale;
    u.uTwinkle.value = state.twinkle;
    u.uOpacity.value = c.rimeOpacity * g.opacity;
    u.uSublimate.value = state.sublimate;
    u.uSubEdge.value = Math.max(0.005, c.sublimateEdge);
    u.uColorA.value.copy(getColor(c.colorRimeA));
    u.uColorB.value.copy(getColor(c.colorRimeB));
    u.uColorDeep.value.copy(getColor(c.colorRimeDeep));
    u.uColorFront.value.copy(getColor(c.colorFront));
    u.uColorSparkle.value.copy(getColor(c.colorSparkle));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* Cold air — LAYER.DISTORTION                                          */
/* -------------------------------------------------------------------- */

const COLD_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFront;
  uniform float uRadius;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uShaderIntensity;

  varying vec2 vFlat;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float r = length(vFlat);
    float reach = min(uFront, uRadius);
    float mask = (1.0 - smoothstep(reach * 0.8, reach, r)) * smoothstep(0.0, 0.4, reach);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    vec3 np = vec3(vFlat * uScale, uTime * uSpeed + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(13.7, 4.1, 8.9)));
    gl_FragColor = vec4(n * 0.5 + 0.5, strength, mask);
  }
`;

/** The cold air shimmering over the frost. */
export function createColdAirMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uQuad: { value: 5 },
      uLift: { value: 0.35 },
      uFront: { value: 0 },
      uRadius: { value: 4 },
      uStrength: { value: 0.3 },
      uScale: { value: 1.6 },
      uSpeed: { value: 0.7 },
      uSeed: { value: 0 }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: COLD_FRAGMENT
  });

  /** @param {object} state { center, front, radius, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uRadius.value = Math.max(0.2, state.radius);
    u.uQuad.value = state.radius * 1.1 + 0.3;
    u.uFront.value = state.front;
    u.uStrength.value = c.hazeStrength * g.distortion * state.fade;
    u.uScale.value = c.hazeScale * g.noiseFrequency;
    u.uSpeed.value = c.hazeSpeed * g.noiseSpeed;
    u.uSeed.value = state.seed;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* Ice — seed, shells, spikes                                           */
/* -------------------------------------------------------------------- */

const ICE_VERTEX = /* glsl */ `
  attribute vec4 aIce;        // x glow boost, y crack 0..1, z seed, w unused

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying vec4  vIce;
  varying float vViewZ;

  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vec4 world = m * vec4(position, 1.0);
    vNormalW = normalize(mat3(m) * normal);
    vWorld = world.xyz;
    vLocal = position;
    vIce = aIce;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const ICE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uGlow;
  uniform float uFresnel;
  uniform float uEnv;
  uniform float uOpacity;
  uniform float uCracks;
  uniform float uCrackScale;
  uniform float uSoftFade;
  uniform float uFade;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorDeep;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying vec4  vIce;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}
  ${ENV_GLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (!gl_FrontFacing) N = -N;
    float facing = clamp(abs(dot(N, V)), 0.0, 1.0);
    float fres = pow(1.0 - facing, 2.5) * uFresnel;

    // Looking straight into a face you see deep into the ice; at a glance, its skin.
    vec3 body = mix(uColorB, uColorDeep, facing * 0.75);
    vec3 L = normalize(uLightDir);
    float lambert = 0.35 + 0.65 * clamp(dot(N, L), 0.0, 1.0);
    float spec = pow(clamp(dot(reflect(-L, N), V), 0.0, 1.0), 60.0) * 2.5;
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb * uEnv * (0.12 + fres);

    // Internal fractures: thin sheets where a noise field crosses zero.
    float cn = snoise(vWorld * uCrackScale + vIce.z * 17.0);
    float cracks = (1.0 - smoothstep(0.0, 0.06, abs(cn))) * uCracks;
    // Light gathered at the base, glowing up through the crystal.
    float base = exp(-max(vLocal.y, 0.0) * 2.2) * uGlow * (1.0 + vIce.x);

    vec3 col = body * lambert + uColorA * (fres + spec + cracks * 0.8) + env + uColorB * base;

    // Breaking: dissolves on a noise threshold, the broken edge flaring white.
    float crack = vIce.y;
    float dn = snoise(vLocal * 3.1 + vIce.z * 9.0) * 0.5 + 0.5;
    float keep = crack <= 0.0 ? 1.0 : step(crack * 1.05, dn);
    float edge = crack <= 0.0 ? 0.0 : (1.0 - smoothstep(crack * 1.05, crack * 1.05 + 0.08, dn)) * keep;
    if (keep < 0.5) discard;
    col += uColorA * edge * 4.0;

    float a = clamp(uOpacity * (0.72 + 0.28 * clamp(fres, 0.0, 1.0)) + cracks * 0.2, 0.0, 1.0) * uFade;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    a *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * mix(1.0, uGlobalGlow, 0.6), a);
  }
`;

/**
 * Faceted ice. Transparent but depth-writing: the crystals are solid enough
 * that the mist and glints have to sort *behind* them, and the frozen body
 * (drawn earlier, on the world layer) shows through.
 */
export function createIceMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uGlow: { value: 0.9 },
      uFresnel: { value: 2.4 },
      uEnv: { value: 1.2 },
      uOpacity: { value: 0.86 },
      uCracks: { value: 0.7 },
      uCrackScale: { value: 4 },
      uSoftFade: { value: 0.15 },
      uFade: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: ICE_VERTEX,
    fragmentShader: ICE_FRAGMENT
  });

  /** @param {object} state { fade, glow } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.iceGlow * g.glow * (state.glow ?? 1);
    u.uFresnel.value = c.iceFresnel * g.fresnel;
    u.uEnv.value = c.iceEnv;
    u.uOpacity.value = c.iceOpacity * g.opacity;
    u.uCracks.value = c.iceCracks * g.shaderIntensity;
    u.uCrackScale.value = c.iceCrackScale * g.noiseFrequency;
    u.uSoftFade.value = c.iceSoftFade;
    u.uFade.value = state.fade;
    u.uColorA.value.copy(getColor(c.colorIceA));
    u.uColorB.value.copy(getColor(c.colorIceB));
    u.uColorDeep.value.copy(getColor(c.colorIceDeep));
  };

  return material;
}
