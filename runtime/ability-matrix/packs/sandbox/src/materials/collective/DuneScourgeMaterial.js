import { Color, DoubleSide, MeshDepthMaterial, NormalBlending, RGBADepthPacking, ShaderMaterial, Vector3 } from 'three';
import { patchOnBeforeCompile } from '../../utils/shaderPatch.js';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * The dune wave — a ridge of sand that runs down the cast line and breaks.
 *
 * Drawn from a parameter-space strip (`createWaveGeometry`): `position.x` is
 * the lateral fraction, `position.y` the signed fraction from the crest (back
 * slope negative, front face positive). Every metre is decided here, from the
 * live front position the ability hands in each frame.
 *
 * ## The profile
 *
 * A real dune wave is not symmetric, and the whole silhouette rests on that:
 *
 *   - the **back slope** is long and gentle — a raised cosine over `uTail`
 *     metres, so the sand it has already lifted trails away behind it;
 *   - the **front face** is short and steep, and near the top it **curls**: a
 *     sine bump pushed forward and hooked down (`uCurl`, `uCurlSharp`), so the
 *     lip overhangs a hollow and the face recedes beneath it. That hollow is
 *     the one place the sun cannot reach, and painting it near-black is what
 *     makes the ridge read as a solid mass rather than a bump in a sheet;
 *   - the **flanks** taper to the floor and trail the centre (`uBow`), the
 *     crescent every barchan dune has.
 *
 * Fbm grain is laid along the surface normal, scaled by height so the toe of
 * the wave stays welded to the floor, and the noise is sampled in **world**
 * space so the sand does not slide with the wave — it is lifted *through* it.
 *
 * ## Shading
 *
 * Normals are reconstructed by finite differences of the very function that
 * places the vertex, grain included, so the key light (`uLightDir`, the same
 * sun the lit meshes use) rakes across the grain correctly. On top of that:
 * a darker shadowed underside under the lip, wind-blown streaks running back
 * off the crest along the travel direction, and a thin backlit glow along the
 * crest line where spray is coming off it.
 */
const WAVE_SURFACE = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uFront;       // metres from the caster to the crest
  uniform float uHalfWidth;   // metres, at the crest
  uniform float uHeight;      // crest height, metres (build + crash already applied)
  uniform float uLead;
  uniform float uTail;
  uniform float uCurl;        // × height, crash already applied
  uniform float uCurlSharp;
  uniform float uBow;
  uniform float uEdgeTaper;
  uniform float uCrestNoise;
  uniform float uCrestNoiseScale;
  uniform float uGrain;
  uniform float uGrainScale;
  uniform float uCrash;

  ${noiseGLSL}

  const float DUNE_PI = 3.14159265359;

  /**
   * The wave's surface at one parameter-space point, in line-local metres:
   * x = along the line from the caster, y = up, z = across.
   */
  vec3 surfaceLocal(float lat, float s) {
    float flank = 1.0 - smoothstep(1.0 - max(uEdgeTaper, 0.01), 1.0, abs(lat));
    float across = lat * uHalfWidth;

    // The crest is not one height: it wavers across the width.
    float wob = snoise(vec3(across * uCrestNoiseScale, uSeed, uTime * 0.25));
    float H = uHeight * flank * (1.0 + wob * uCrestNoise);
    float K = uCurl * H;

    float along;
    float y;
    if (s <= 0.0) {
      // Back slope: a raised cosine over the tail.
      float b = -s;
      along = -b * uTail;
      y = H * pow(0.5 + 0.5 * cos(DUNE_PI * b), 1.3);
    } else {
      // Front face: the lip bulges forward over a hollow, then the face falls
      // to the toe. pow(s, 1/curlSharp) pushes the bulge toward the very top.
      float lip = sin(DUNE_PI * pow(s, 1.0 / max(uCurlSharp, 0.2)));
      along = uLead * s * s + K * lip * (1.0 - s);
      y = H * (1.0 - pow(s, 1.25)) - K * 0.35 * lip * s;
      // As it breaks, the lip is thrown forward and comes down.
      along += K * uCrash * lip * 0.6;
      y = max(0.0, y);
    }

    // The flanks trail the centre: a crescent.
    along -= uBow * lat * lat;

    float x = uFront + along;
    // Nothing is lifted behind the caster's feet.
    y *= smoothstep(-0.2, 0.9, x);

    return vec3(x, y, across);
  }

  vec3 toWorld(vec3 l) {
    return uOrigin + uDir * l.x + vec3(0.0, l.y, 0.0) + uSide * l.z;
  }

  /** World position, with the sand grain pushed out along the rough normal. */
  vec3 surfaceWorld(float lat, float s) {
    vec3 l = surfaceLocal(lat, s);
    vec3 w = toWorld(l);
    float g = fbm3(w * uGrainScale + vec3(uSeed * 3.1));
    w.y += g * uGrain * clamp(l.y / max(uHeight, 0.05), 0.0, 1.0);
    return w;
  }
`;

const WAVE_VERTEX = /* glsl */ `
  ${WAVE_SURFACE}
  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vS;
  varying float vLat;
  varying float vHeightFrac;
  varying float vViewZ;

  void main() {
    float lat = position.x;
    float s = position.y;

    vec3 w = surfaceWorld(lat, s);

    // Normal from the same function that placed the vertex, so the grain and
    // the curl both light correctly.
    float e = 0.01;
    vec3 dl = surfaceWorld(lat + e, s) - surfaceWorld(lat - e, s);
    vec3 ds = surfaceWorld(lat, s + e) - surfaceWorld(lat, s - e);
    // side × along is up for the outward surface (side = along × up), so the
    // overhanging lip correctly comes out facing down into its own hollow.
    vec3 n = cross(dl, ds);
    // A degenerate pair (the toe, where everything is on the floor) points up.
    vNormalW = dot(n, n) > 1e-10 ? normalize(n) : vec3(0.0, 1.0, 0.0);

    vWorld = w;
    vS = s;
    vLat = lat;
    vHeightFrac = w.y / max(uHeight, 0.05);

    vec4 mv = viewMatrix * vec4(w, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const WAVE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform float uGrainScale;
  uniform vec3  uColorLight;
  uniform vec3  uColorDark;
  uniform vec3  uColorUnder;
  uniform vec3  uColorStreak;
  uniform vec3  uColorDeep;
  uniform float uContact;
  uniform float uUnder;
  uniform float uAmbient;
  uniform float uStreak;
  uniform float uStreakScale;
  uniform float uStreakFlow;
  uniform float uCrestGlow;
  uniform float uOpacity;
  uniform float uFloorFade;
  uniform float uSoftFade;
  uniform vec3  uLightDir;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vS;
  varying float vLat;
  varying float vHeightFrac;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorld);

    // Albedo: two sands mottled by fine noise in world space.
    float mottle = fbm3(vWorld * uGrainScale * 1.7 + vec3(uSeed));
    vec3 albedo = mix(uColorDark, uColorLight, clamp(0.6 + mottle * 0.7, 0.0, 1.0));

    // Wrapped key light, so the shade side is sand in shadow, not a hole.
    float lambert = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    lambert = lambert * lambert;
    vec3 color = albedo * (uAmbient + (1.0 - uAmbient) * lambert * 1.25);

    // The hollow under the lip: on the front face, below the lip, and darkest
    // where the surface faces down or away from the sun.
    float hollow = step(0.0, vS) * smoothstep(0.04, 0.3, vS) * (1.0 - smoothstep(0.75, 1.0, vS));
    hollow *= 0.55 + 0.45 * smoothstep(0.3, -0.5, N.y);
    color = mix(color, uColorUnder * (0.5 + 0.5 * lambert), clamp(hollow * uUnder, 0.0, 1.0));

    // Contact: the sand darkens to the deep stop where it meets the floor and
    // in the lee of the crest, so the mass sits on the stone with weight.
    float contact = 1.0 - smoothstep(0.0, max(uContact, 0.01), vWorld.y);
    color = mix(color, uColorDeep, contact * 0.75);

    // Wind-blown streaks: noise stretched along the travel direction, blown
    // back off the crest. Only on the back slope and the crest itself.
    float along = dot(vWorld - uOrigin, uDir);
    float across = dot(vWorld - uOrigin, vec3(-uDir.z, 0.0, uDir.x));
    vec3 sp = vec3(across * uStreakScale * 3.5, along * uStreakScale * 0.35 + uTime * uStreakFlow, uSeed);
    float streak = pow(snoise01(sp), 5.0) * 2.5;
    streak *= 1.0 - smoothstep(-0.05, 0.12, vS);
    color += uColorStreak * streak * uStreak * uShaderIntensity * (0.35 + 0.65 * lambert);

    // Backlit spray along the crest line.
    float crest = exp(-abs(vS) * 14.0) * clamp(vHeightFrac, 0.0, 1.0);
    float rim = pow(1.0 - abs(dot(N, V)), 2.0);
    color += uColorStreak * crest * (0.4 + rim) * uCrestGlow * uGlobalGlow;

    // Opaque sand. The toe and any opacity below 1 are a screen-door dither,
    // so the wave still writes depth, occludes itself and lays a shadow.
    float alpha = uOpacity * smoothstep(0.0, max(uFloorFade, 0.005), vWorld.y);
    float dither = hash13(vec3(floor(gl_FragCoord.xy), 0.0));
    if (alpha < 0.02 || alpha < dither * 0.98) discard;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createDuneWaveMaterial() {
  const material = new ShaderMaterial({
    // Solid sand: opaque, on LAYER.SHAPED (lit, shadow-casting, kept out of
    // the depth prepass); the floor fade is a dither.
    transparent: false,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: true,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uOrigin: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uFront: { value: 0 },
      uHalfWidth: { value: 1 },
      uHeight: { value: 1 },
      uLead: { value: 1 },
      uTail: { value: 3 },
      uCurl: { value: 0.5 },
      uCurlSharp: { value: 3 },
      uBow: { value: 0.8 },
      uEdgeTaper: { value: 0.4 },
      uCrestNoise: { value: 0.2 },
      uCrestNoiseScale: { value: 0.5 },
      uGrain: { value: 0.08 },
      uGrainScale: { value: 2.6 },
      uCrash: { value: 0 },
      uColorLight: { value: new Color() },
      uColorDark: { value: new Color() },
      uColorUnder: { value: new Color() },
      uColorStreak: { value: new Color() },
      uColorDeep: { value: new Color() },
      uContact: { value: 0.35 },
      uUnder: { value: 0.8 },
      uAmbient: { value: 0.4 },
      uStreak: { value: 0.5 },
      uStreakScale: { value: 1.4 },
      uStreakFlow: { value: 3 },
      uCrestGlow: { value: 0.3 },
      uOpacity: { value: 1 },
      uFloorFade: { value: 0.08 },
      uSoftFade: { value: 0.25 }
    }),
    vertexShader: WAVE_VERTEX,
    fragmentShader: WAVE_FRAGMENT
  });

  // The shadow: the same parameter-space surface in the depth pass. Shares the
  // wave's uniform objects, so it moves with every slider.
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: DoubleSide });
  const shared = material.uniforms;
  patchOnBeforeCompile(
    depth,
    (shader) => {
      Object.assign(shader.uniforms, shared);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${WAVE_SURFACE}`)
        .replace('#include <begin_vertex>', 'vec3 transformed = surfaceWorld(position.x, position.y);');
    },
    'dune-wave-depth'
  );
  material.userData.depth = depth;
  const baseDispose = material.dispose.bind(material);
  material.dispose = () => {
    depth.dispose();
    baseDispose();
  };

  /**
   * @param {object} state { origin, dir, side, front, halfWidth, height, crash, seed }
   *   and optional shape overrides { tail, lead, curl, bow, taper } (the
   *   mound left after the break is a lower, rounder dune than the wave).
   */
  material.userData.sync = (state) => {
    const c = settings.dune;
    const g = settings.global;
    const u = material.uniforms;

    u.uSeed.value = state.seed;
    u.uOrigin.value.copy(state.origin);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uFront.value = state.front;
    u.uHalfWidth.value = state.halfWidth;
    u.uHeight.value = Math.max(0.001, state.height);
    u.uLead.value = state.lead ?? c.lead;
    u.uTail.value = state.tail ?? c.tail;
    u.uCurl.value = state.curl ?? c.curl * (1 + (c.crashCurl - 1) * state.crash);
    u.uCurlSharp.value = c.curlSharp;
    u.uBow.value = state.bow ?? c.bow;
    u.uEdgeTaper.value = state.taper ?? c.edgeTaper;
    u.uCrestNoise.value = c.crestNoise * g.noiseStrength * g.randomness;
    u.uCrestNoiseScale.value = c.crestNoiseScale * g.noiseFrequency;
    u.uGrain.value = c.grain * g.noiseStrength;
    u.uGrainScale.value = c.grainScale * g.noiseFrequency;
    u.uCrash.value = state.crash;

    u.uColorLight.value.copy(getColor(c.colorSandLight));
    u.uColorDark.value.copy(getColor(c.colorSandDark));
    u.uColorUnder.value.copy(getColor(c.colorUnderside));
    u.uColorStreak.value.copy(getColor(c.colorStreak));
    u.uColorDeep.value.copy(getColor(c.colorSandDeep));
    u.uContact.value = c.contactShade;
    u.uUnder.value = c.undersideDarkness;
    u.uAmbient.value = c.ambient;
    u.uStreak.value = c.streakStrength;
    u.uStreakScale.value = c.streakScale * g.noiseFrequency;
    u.uStreakFlow.value = c.streakFlow * g.noiseSpeed;
    u.uCrestGlow.value = c.crestGlow * g.glow;
    u.uOpacity.value = c.waveOpacity * g.opacity;
    u.uFloorFade.value = c.floorFade;
    u.uSoftFade.value = c.softFade;
  };

  return material;
}

/* ---------------------------------------------------------------------- */
/* The ripple bed                                                          */
/* ---------------------------------------------------------------------- */

/**
 * What the wave leaves behind: wind ripples settled into the floor.
 *
 * One flat quad covering the cast's footprint, transformed on the CPU each
 * frame; the fragment stage does everything in **line-local** metres, which is
 * the only frame in which the ripples have a meaning:
 *
 *   - down the line, the ridges run *across* it, perpendicular to the way the
 *     sand was driven — every ripple field on every beach is laid that way;
 *   - in the fan at the crash point they run in rings round it, because that
 *     is where the sand was thrown outward from.
 *
 * A ripple's cross-section is asymmetric — a long gentle stoss slope facing
 * the wind and a short steep lee — and `uAsym` skews the sawtooth to get it.
 * Relief is faked: the height function is differenced in two directions and
 * lit with the sun direction, so the ridges catch the same light the wave did.
 *
 * The bed is revealed behind the crest (`uReveal`), each patch easing in over
 * `uSettle` metres, and fades out as a whole at the end of the cast.
 */
const RIPPLE_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RIPPLE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uWidthNear;
  uniform float uWidth;
  uniform float uReveal;       // metres down the line the bed reaches
  uniform float uSettle;       // metres over which a patch eases in
  uniform float uDisc;         // 0..1 how far the crash fan has spread
  uniform float uDiscRadius;
  uniform float uFreq;
  uniform float uSharp;
  uniform float uAsym;
  uniform float uWarp;
  uniform float uWarpScale;
  uniform float uDepth;
  uniform float uEdge;
  uniform float uOpacity;
  uniform float uFade;
  uniform vec3  uColorLight;
  uniform vec3  uColorDark;
  uniform vec3  uLightDir;
  uniform float uShaderIntensity;

  varying vec3 vWorld;

  ${noiseGLSL}

  /** Asymmetric ripple profile: gentle stoss, steep lee, crisp crest. */
  float rippleProfile(float phase) {
    float f = fract(phase);
    float k = mix(0.5, 0.88, clamp(uAsym, 0.0, 1.0));
    float h = f < k ? f / k : (1.0 - f) / (1.0 - k);
    return pow(h, max(uSharp, 0.2));
  }

  /** Line-local coordinates: x along, y across. */
  vec2 localOf(vec3 w) {
    vec3 d = w - uOrigin;
    return vec2(dot(d, uDir), dot(d, uSide));
  }

  /** Ripple height at a line-local point, plus the coverage mask in .y. */
  vec2 bed(vec2 p) {
    float bend = fbm3(vec3(p * uWarpScale, uSeed)) * uWarp;

    // Down the line: ridges across it.
    float hw = mix(uWidthNear, uWidth, clamp(p.x / max(uLength, 0.1), 0.0, 1.0));
    float rag = snoise(vec3(p * 0.9, uSeed * 2.0)) * uEdge * hw;
    float band = (1.0 - smoothstep(hw * 0.75 + rag, hw + rag, abs(p.y)))
               * smoothstep(0.0, 0.6, p.x)
               * clamp((uReveal - p.x) / max(uSettle, 0.01), 0.0, 1.0);
    float hLine = rippleProfile(p.x * uFreq + bend + p.y * 0.08);

    // At the crash: rings round the point.
    vec2 q = p - vec2(uLength, 0.0);
    float r = length(q);
    float reach = uDiscRadius * uDisc;
    float discRag = snoise(vec3(q * 0.8, uSeed * 5.0)) * uEdge * uDiscRadius * 0.5;
    float disc = 1.0 - smoothstep(reach * 0.7 + discRag, reach + discRag, r);
    float hDisc = rippleProfile(r * uFreq * 0.85 + bend);

    float pick = clamp(disc / max(disc + band, 1e-3), 0.0, 1.0);
    return vec2(mix(hLine, hDisc, pick), max(band, disc));
  }

  void main() {
    vec2 p = localOf(vWorld);
    vec2 b = bed(p);
    float mask = b.y;
    if (mask < 0.002) discard;

    // Fake relief: difference the height in both local axes, light it.
    float e = 0.03;
    float hx = bed(p + vec2(e, 0.0)).x - bed(p - vec2(e, 0.0)).x;
    float hy = bed(p + vec2(0.0, e)).x - bed(p - vec2(0.0, e)).x;
    float k = uDepth * 0.05 / e;
    vec3 nLocal = normalize(vec3(-hx * k, 1.0, -hy * k));
    vec3 N = normalize(uDir * nLocal.x + vec3(0.0, nLocal.y, 0.0) + uSide * nLocal.z);
    float lambert = clamp(dot(N, normalize(uLightDir)) * 0.5 + 0.5, 0.0, 1.0);

    vec3 color = mix(uColorDark, uColorLight, lambert * lambert * 1.2);
    // The crests are a touch lighter: they are the dry, sorted grains.
    color = mix(color, uColorLight, b.x * 0.25);

    float alpha = mask * uOpacity * uFade * (0.55 + 0.45 * b.x) * uShaderIntensity;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

export function createDuneRippleMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    toneMapped: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uOrigin: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uWidthNear: { value: 1 },
      uWidth: { value: 2 },
      uReveal: { value: 0 },
      uSettle: { value: 2 },
      uDisc: { value: 0 },
      uDiscRadius: { value: 3 },
      uFreq: { value: 2.4 },
      uSharp: { value: 2 },
      uAsym: { value: 0.5 },
      uWarp: { value: 0.9 },
      uWarpScale: { value: 0.6 },
      uDepth: { value: 0.9 },
      uEdge: { value: 0.3 },
      uOpacity: { value: 0.7 },
      uFade: { value: 1 },
      uColorLight: { value: new Color() },
      uColorDark: { value: new Color() }
    }),
    vertexShader: RIPPLE_VERTEX,
    fragmentShader: RIPPLE_FRAGMENT
  });

  /**
   * @param {object} state { origin, dir, side, length, reveal, disc, fade, seed }
   */
  material.userData.sync = (state) => {
    const c = settings.dune;
    const g = settings.global;
    const u = material.uniforms;

    u.uSeed.value = state.seed;
    u.uOrigin.value.copy(state.origin);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = state.length;
    u.uWidthNear.value = c.widthNear;
    u.uWidth.value = c.width;
    u.uReveal.value = state.reveal;
    u.uSettle.value = Math.max(0.05, c.speed * g.speed * c.rippleFadeIn);
    u.uDisc.value = state.disc;
    u.uDiscRadius.value = c.rippleRadius;
    u.uFreq.value = c.rippleFrequency;
    u.uSharp.value = c.rippleSharp;
    u.uAsym.value = c.rippleAsymmetry;
    u.uWarp.value = c.rippleWarp * g.noiseStrength;
    u.uWarpScale.value = c.rippleWarpScale * g.noiseFrequency;
    u.uDepth.value = c.rippleDepth;
    u.uEdge.value = c.rippleEdge * g.randomness;
    u.uOpacity.value = c.rippleOpacity * g.opacity;
    u.uFade.value = state.fade;
    u.uColorLight.value.copy(getColor(c.colorRippleLight));
    u.uColorDark.value.copy(getColor(c.colorRippleDark));
  };

  return material;
}
