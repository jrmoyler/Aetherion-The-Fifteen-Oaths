import { AdditiveBlending, BackSide, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { ION_MAX_BOLTS } from '../../assets/matrix-new/IonStormPillarGeometry.js';

/**
 * The bespoke surfaces of the Ion Storm Pillar.
 *
 *   - `createIonPillarMaterial('body')`  — the column of plasma: a hot white
 *     core down the line of sight, plasma bands racing up it, noise turbulence
 *     tearing the bands, cooling to cyan toward its silhouette.
 *   - `createIonPillarMaterial('shell')` — a wider, rippling sheath round it,
 *     drawn from the back so it reads as a corona: fresnel only, crawled over
 *     by thin ionised filaments.
 *   - `createIonBoltMaterial` — every orbiting and striking bolt in one draw,
 *     each slot's envelope read from a uniform array.
 *   - `createIonGroundMaterial` — the ionised floor: a hot pool at the base, a
 *     ring at the circle's edge, arcs crawling round the annulus between, and
 *     a flare at every strike point.
 *   - `createIonWarpMaterial` — the air bending round the column, on
 *     LAYER.DISTORTION.
 *
 * All read `settings.ionstorm` through `userData.sync`, every frame.
 */

/* ==================================================================== */
/* The pillar                                                            */
/* ==================================================================== */

/**
 * The column is an open unit cylinder, `position.y` 0..1. In metres:
 *
 *   - it **slams**: the bottom edge descends from the top as `uDrop` goes 0→1,
 *     so the pillar is seen to come *down* out of the sky rather than grow up;
 *   - it **writhes**: the wall is pushed in and out by noise that streams up the
 *     column, and the whole axis kinks a little, so it is never a tube;
 *   - it **implodes**: `uImplode` pinches the radius toward zero, hardest in the
 *     middle, and pulls both ends toward the centre of the column.
 */
const PILLAR_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uRadius;
  uniform float uHeight;
  uniform float uDrop;
  uniform float uImplode;
  uniform float uWrithe;
  uniform float uWritheScale;
  uniform float uWritheSpeed;
  uniform float uKink;
  uniform float uFlare;      // how much wider the foot is than the trunk

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vLocal;      // (bearing.x, y metres, bearing.z)
  varying float vY;          // 0..1 up the drawn column
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    vec2 bearing = normalize(position.xz + vec2(1e-5));
    float t = position.y;

    // The slam: the drawn column runs from 'bottom' up to the top.
    float bottom = uHeight * (1.0 - uDrop);
    float y = mix(bottom, uHeight, t);
    // The implosion pulls both ends toward the middle.
    float mid = uHeight * 0.5;
    y = mix(y, mid, uImplode * uImplode * 0.85);

    float yn = y / max(uHeight, 1e-3);
    float foot = 1.0 + uFlare * exp(-y * 1.8);
    float pinch = 1.0 - uImplode * (0.65 + 0.35 * sin(3.14159265 * yn));
    float wall = snoise(vec3(bearing * uWritheScale, y * uWritheScale * 0.35 - uTime * uWritheSpeed));
    float r = uRadius * foot * max(pinch, 0.0) * (1.0 + wall * uWrithe);

    vec2 kink = vec2(
      snoise(vec3(y * 0.35, uTime * 0.7, 3.1)),
      snoise(vec3(y * 0.35, uTime * 0.7, 9.7))
    ) * uKink * smoothstep(0.0, 1.0, yn);

    vec3 local = vec3(bearing.x * r + kink.x, y, bearing.y * r + kink.y);
    vec4 world = modelMatrix * vec4(local, 1.0);

    vNormalW = normalize(mat3(modelMatrix) * vec3(bearing.x, 0.0, bearing.y));
    vViewDir = cameraPosition - world.xyz;
    vLocal = vec3(bearing.x, y, bearing.y);
    vY = yn;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const PILLAR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uHeight;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uCoreSharp;
  uniform float uCoreGlow;
  uniform float uBands;      // bands per metre
  uniform float uBandSpeed;  // metres/second they race upward
  uniform float uBandSharp;
  uniform float uBandGlow;
  uniform float uNoise;
  uniform float uNoiseScale;
  uniform float uNoiseSpeed;
  uniform float uFresnel;
  uniform float uFresnelPower;
  uniform float uTopFade;    // fraction of the column the top fades over
  uniform float uSurge;      // 0..1 a strike (or the implosion) flaring it
  uniform float uSoftFade;
  uniform vec3  uColorCore;
  uniform vec3  uColorBand;
  uniform vec3  uColorEdge;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vLocal;
  varying float vY;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
    float rim = pow(1.0 - ndv, uFresnelPower);

    // Turbulence first: it tears the bands, so the bands read as plasma, not stripes.
    float ang = atan(vLocal.z, vLocal.x);
    vec3 np = vec3(cos(ang) * uNoiseScale, vLocal.y * uNoiseScale * 0.5 - uTime * uNoiseSpeed, sin(ang) * uNoiseScale);
    float turb = fbm3(np);

    #ifdef SHELL
      // Corona: fresnel, crawled over by thin ridged filaments.
      float fil = pow(1.0 - abs(snoise(np * 1.7 + vec3(0.0, -uTime * uNoiseSpeed, 0.0))), 8.0);
      float density = rim * (0.35 + 0.65 * fil * uNoise + (1.0 - uNoise) * 0.5);
      vec3 color = mix(uColorEdge, uColorBand, fil);
      color += uColorCore * fil * rim * 0.6;
      float alpha = density;
    #else
      float core = pow(ndv, uCoreSharp);
      float phase = vLocal.y * uBands - uTime * uBandSpeed + turb * uNoise * 2.0;
      float band = pow(0.5 + 0.5 * sin(phase * 6.28318530718), uBandSharp);
      vec3 color = uColorEdge * (0.35 + rim * uFresnel);
      color += uColorBand * band * uBandGlow * (0.4 + 0.6 * ndv);
      color = mix(color, uColorCore, core);
      color += uColorCore * core * uCoreGlow;
      float alpha = clamp(0.25 + core + band * 0.4 + rim * uFresnel * 0.5, 0.0, 1.0);
    #endif

    color *= 1.0 + uSurge * 1.8;

    // Feathered at both ends: the column has no caps.
    float ends = smoothstep(0.0, 0.03, vY) * (1.0 - smoothstep(1.0 - max(uTopFade, 1e-3), 1.0, vY));
    alpha *= ends * uOpacity;

    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(color * uIntensity * uGlobalGlow, alpha);
  }
`;

/** @param {'body'|'shell'} kind */
export function createIonPillarMaterial(kind) {
  const shell = kind === 'shell';
  const material = new ShaderMaterial({
    defines: shell ? { SHELL: '' } : {},
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: shell ? BackSide : FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRadius: { value: 0.8 },
      uHeight: { value: 14 },
      uDrop: { value: 0 },
      uImplode: { value: 0 },
      uWrithe: { value: 0.1 },
      uWritheScale: { value: 1.5 },
      uWritheSpeed: { value: 2 },
      uKink: { value: 0.2 },
      uFlare: { value: 0.6 },
      uIntensity: { value: 3 },
      uOpacity: { value: 1 },
      uCoreSharp: { value: 3 },
      uCoreGlow: { value: 1.5 },
      uBands: { value: 0.6 },
      uBandSpeed: { value: 6 },
      uBandSharp: { value: 4 },
      uBandGlow: { value: 1.5 },
      uNoise: { value: 0.6 },
      uNoiseScale: { value: 1.2 },
      uNoiseSpeed: { value: 2 },
      uFresnel: { value: 1.5 },
      uFresnelPower: { value: 2.5 },
      uTopFade: { value: 0.3 },
      uSurge: { value: 0 },
      uSoftFade: { value: 0.3 },
      uColorCore: { value: new Color() },
      uColorBand: { value: new Color() },
      uColorEdge: { value: new Color() }
    }),
    vertexShader: PILLAR_VERTEX,
    fragmentShader: PILLAR_FRAGMENT
  });

  /** @param {object} state { radius, height, drop, implode, surge, fade } */
  material.userData.sync = (state) => {
    const c = settings.ionstorm;
    const g = settings.global;
    const u = material.uniforms;
    const scale = shell ? c.shellScale : 1;

    u.uRadius.value = state.radius * scale;
    u.uHeight.value = state.height;
    u.uDrop.value = state.drop;
    u.uImplode.value = state.implode;
    u.uSurge.value = state.surge;
    u.uWrithe.value = c.writhe * (shell ? 1.6 : 1) * g.turbulence;
    u.uWritheScale.value = c.writheScale * g.noiseFrequency;
    u.uWritheSpeed.value = c.writheSpeed * g.noiseSpeed;
    u.uKink.value = c.kink * g.turbulence;
    u.uFlare.value = c.footFlare;
    u.uTopFade.value = c.topFade;
    u.uNoise.value = c.plasmaNoise * g.noiseStrength;
    u.uNoiseScale.value = c.plasmaNoiseScale * g.noiseFrequency;
    u.uNoiseSpeed.value = c.plasmaNoiseSpeed * g.noiseSpeed;
    u.uFresnel.value = c.fresnel * g.fresnel;
    u.uFresnelPower.value = c.fresnelPower;
    u.uSoftFade.value = c.pillarSoftFade;
    u.uCoreSharp.value = c.coreSharpness;
    u.uCoreGlow.value = c.coreGlow;
    u.uBands.value = c.bandDensity;
    u.uBandSpeed.value = c.bandSpeed * g.animationSpeed;
    u.uBandSharp.value = c.bandSharpness;
    u.uBandGlow.value = c.bandGlow;
    if (shell) {
      u.uIntensity.value = c.shellIntensity * g.glow * g.shaderIntensity;
      u.uOpacity.value = c.shellOpacity * g.opacity * state.fade;
    } else {
      u.uIntensity.value = c.pillarIntensity * g.glow * g.shaderIntensity;
      u.uOpacity.value = c.pillarOpacity * g.opacity * state.fade;
    }
    u.uColorCore.value.copy(getColor(c.colorCore));
    u.uColorBand.value.copy(getColor(c.colorBand));
    u.uColorEdge.value.copy(getColor(c.colorEdge));
  };

  return material;
}

/* ==================================================================== */
/* The bolts                                                             */
/* ==================================================================== */

/**
 * Camera-facing ribbons, one buffer for every slot (see `IonBoltRibbons`).
 *
 * Each slot's envelope is `uBolts[slot] = (level, grow, break, seed)`, looked
 * up in the *vertex* stage (dynamic uniform indexing is safe there on every
 * GLSL profile) and handed down as varyings. A slot at level 0 is collapsed
 * out of the clip volume before it reaches the rasteriser.
 *
 * Profiles across the strip: a hard white core and a soft glow tinted from the
 * glow colour to the edge colour. Over them: growth (a strike races from its
 * source along `aCoord.y`, with a hot head on the cut), a per-bolt quantised
 * strobe, plasma crawling along the glow, and — as a strike dies — crackle,
 * the ribbon tearing into pieces along its length.
 */
const BOLT_VERTEX = /* glsl */ `
  #define MAX_BOLTS ${ION_MAX_BOLTS}

  attribute vec3  aTangent;
  attribute vec4  aCoord;   // side, along, width, brightness
  attribute float aBolt;

  uniform vec4  uBolts[MAX_BOLTS];
  uniform float uGlowWidth;

  varying vec2  vCoord;
  varying float vBright;
  varying float vWidth;
  varying vec4  vState;

  void main() {
    int slot = int(aBolt + 0.5);
    vec4 state = vec4(0.0);
    for (int i = 0; i < MAX_BOLTS; i++) {
      if (i == slot) state = uBolts[i];
    }
    vState = state;

    if (state.x <= 0.001 || aCoord.w <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 tangent = normalize(mat3(modelMatrix) * aTangent + vec3(1e-5));
    vec3 toCamera = normalize(cameraPosition - world);
    vec3 across = cross(tangent, toCamera);
    float len = length(across);
    across = len > 1e-4 ? across / len : vec3(0.0, 1.0, 0.0);

    float width = uGlowWidth * aCoord.z;
    world += across * aCoord.x * width;

    vCoord = aCoord.xy;
    vBright = aCoord.w;
    vWidth = width;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const BOLT_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uHeadLength;
  uniform float uHeadGlow;
  uniform float uCoreWidth;
  uniform float uFalloff;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uFlicker;
  uniform float uFlickerRate;
  uniform float uCrackle;
  uniform float uCrawl;
  uniform float uCrawlScale;
  uniform float uCrawlSpeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorGlow;
  uniform vec3  uColorEdge;

  varying vec2  vCoord;
  varying float vBright;
  varying float vWidth;
  varying vec4  vState;

  ${noiseGLSL}

  void main() {
    float level = vState.x;
    float grow = vState.y;
    float brk = vState.z;
    float seed = vState.w;

    float along = vCoord.y;
    if (along > grow) discard;
    float across = abs(vCoord.x);

    float piece = floor(along * uCrackle + seed * 13.0);
    if (hash11(piece + floor(uTime * 20.0) * 0.37) < brk) discard;

    float coreFrac = clamp(uCoreWidth / max(vWidth, 1e-4), 0.02, 0.9);
    float aa = fwidth(across) * 1.2;
    float core = 1.0 - smoothstep(coreFrac - aa, coreFrac + aa, across);
    float glow = pow(clamp(1.0 - across, 0.0, 1.0), uFalloff);

    float crawl = snoise(vec3(along * uCrawlScale - uTime * uCrawlSpeed, seed * 7.0, across * 2.0));
    glow *= 1.0 + uCrawl * crawl * uShaderIntensity;

    float head = smoothstep(grow - uHeadLength, grow, along) * step(grow, 1.0) * uHeadGlow;

    float strobe = hash11(floor(uTime * uFlickerRate) + seed * 41.0);
    float flick = 1.0 - uFlicker * step(0.62, strobe) * 0.85 + uFlicker * step(strobe, 0.12) * 0.6;

    vec3 tint = mix(uColorEdge, uColorGlow, smoothstep(0.0, 0.7, glow));
    vec3 color = tint * glow + uColorCore * core * (1.0 + head);
    float energy = level * flick * vBright * (1.0 + head * 0.6);

    color *= energy * uIntensity * uGlobalGlow;
    float alpha = clamp(max(glow, core) * energy, 0.0, 1.0) * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uOpacity, alpha);
  }
`;

export function createIonBoltMaterial() {
  const bolts = [];
  for (let i = 0; i < ION_MAX_BOLTS; i++) bolts.push(new Vector4(0, 0, 0, 0));

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uBolts: { value: bolts },
      uGlowWidth: { value: 0.3 },
      uHeadLength: { value: 0.12 },
      uHeadGlow: { value: 2 },
      uCoreWidth: { value: 0.03 },
      uFalloff: { value: 2.4 },
      uIntensity: { value: 4 },
      uOpacity: { value: 1 },
      uFlicker: { value: 0.5 },
      uFlickerRate: { value: 26 },
      uCrackle: { value: 18 },
      uCrawl: { value: 0.45 },
      uCrawlScale: { value: 14 },
      uCrawlSpeed: { value: 9 },
      uColorCore: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorEdge: { value: new Color() }
    }),
    vertexShader: BOLT_VERTEX,
    fragmentShader: BOLT_FRAGMENT
  });

  /** Envelopes, written in place by the ability: (level, grow, break, seed). */
  material.userData.bolts = bolts;

  material.userData.sync = () => {
    const c = settings.ionstorm;
    const g = settings.global;
    const u = material.uniforms;
    u.uGlowWidth.value = c.boltWidth;
    u.uCoreWidth.value = c.boltCoreWidth;
    u.uFalloff.value = c.boltFalloff;
    u.uHeadLength.value = c.boltHeadLength;
    u.uHeadGlow.value = c.boltHeadGlow;
    u.uIntensity.value = c.boltIntensity * g.glow;
    u.uOpacity.value = c.boltOpacity * g.opacity;
    u.uFlicker.value = c.boltFlicker * g.shaderIntensity;
    u.uFlickerRate.value = c.boltFlickerRate * g.noiseSpeed;
    u.uCrackle.value = c.boltCrackle;
    u.uCrawl.value = c.boltCrawl * g.noiseStrength;
    u.uCrawlScale.value = c.boltCrawlScale * g.noiseFrequency;
    u.uCrawlSpeed.value = c.boltCrawlSpeed * g.noiseSpeed;
    u.uColorCore.value.copy(getColor(c.colorBoltCore));
    u.uColorGlow.value.copy(getColor(c.colorBoltGlow));
    u.uColorEdge.value.copy(getColor(c.colorBoltEdge));
  };

  return material;
}

/* ==================================================================== */
/* The ionised floor                                                     */
/* ==================================================================== */

/**
 * One additive quad over the circle, everything in metres.
 *
 *   - **the base pool** — where the pillar stands, white-hot, its edge broken
 *     by noise;
 *   - **the ring** — at the circle's edge, a thin hard line with a halo;
 *   - **crawling arcs** — the zero set of a noise field sampled in *polar*
 *     coordinates, rotating, so thin branching filaments race round the
 *     annulus between the pool and the ring. `pow(1 - |n|, k)` is the classic
 *     lightning-on-a-surface trick: the zero set of smooth noise is a network
 *     of thin connected lines.
 *   - **strike flares** — `uStrikes[i] = (x, z, heat, radius)`; each fresh
 *     strike lights a disc of arcs round its point that cools out.
 */
const GROUND_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  #define MAX_STRIKES ${ION_MAX_BOLTS}
  #define TAU 6.28318530718

  uniform float uTime;
  uniform float uQuadSize;
  uniform float uRadius;
  uniform float uPoolRadius;
  uniform float uReveal;
  uniform float uFade;
  uniform float uOpacity;
  uniform float uSurge;
  uniform float uRingWidth;
  uniform float uRingGlow;
  uniform float uPoolGlow;
  uniform float uArcGlow;
  uniform float uArcScale;
  uniform float uArcSharp;
  uniform float uArcSpeed;
  uniform float uArcDensity;
  uniform float uStrikeGlow;
  uniform float uSeed;
  uniform vec4  uStrikes[MAX_STRIKES];
  uniform vec3  uColorRing;
  uniform vec3  uColorArc;
  uniform vec3  uColorHot;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  float arcs(vec2 p, float rad, float ang, float scale, float speed, float sharp, float seed) {
    // Polar sampling, turned with time: the filaments race round the circle.
    vec3 q = vec3(cos(ang + uTime * speed) * scale, rad * scale * 0.9, sin(ang + uTime * speed) * scale);
    float n = snoise(q + vec3(0.0, 0.0, seed)) + 0.35 * snoise(q * 2.3 + vec3(seed, uTime * 2.0, 0.0));
    return pow(clamp(1.0 - abs(n), 0.0, 1.0), sharp);
  }

  void main() {
    vec2 p = vec2(vUv.x - 0.5, 0.5 - vUv.y) * uQuadSize;
    float rad = length(p);
    float ang = atan(p.y, p.x);
    float aa = fwidth(rad) + 0.01;

    vec3 color = vec3(0.0);
    float flick = 0.8 + 0.2 * hash11(floor(uTime * 30.0) + uSeed);

    /* ---- the base pool ---- */
    float pn = snoise(vec3(p * 2.0, uTime * 1.5 + uSeed)) * 0.5 + 0.5;
    float pool = smoothstep(uPoolRadius * (1.0 + pn * 0.4), 0.0, rad);
    color += mix(uColorArc, uColorHot, pool) * pool * uPoolGlow * (1.0 + uSurge);

    /* ---- the ring at the edge ---- */
    float ring = smoothstep(uRingWidth + aa, 0.0, abs(rad - uRadius));
    float halo = exp(-abs(rad - uRadius) * 5.0) * 0.3;
    float sweep = step(fract(ang / TAU + 0.25), uReveal);
    color += uColorRing * (ring + halo) * sweep * uRingGlow * flick;

    /* ---- arcs crawling over the annulus ---- */
    float annulus = smoothstep(uPoolRadius * 0.6, uPoolRadius * 1.4, rad) * smoothstep(uRadius + aa, uRadius - 0.3, rad);
    float a = arcs(p, rad, ang, uArcScale, uArcSpeed, uArcSharp, uSeed);
    float gate = smoothstep(1.0 - uArcDensity, 1.0, snoise(vec3(ang * 1.5, uTime * 0.8, uSeed + 7.0)) * 0.5 + 0.5);
    color += uColorArc * a * annulus * gate * uArcGlow * uReveal * flick * (1.0 + uSurge);

    /* ---- strike flares ---- */
    for (int i = 0; i < MAX_STRIKES; i++) {
      vec4 s = uStrikes[i];
      if (s.z <= 0.0) continue;
      vec2 d2 = p - s.xy;
      float d = length(d2);
      if (d > s.w * 1.5) continue;
      float local = arcs(d2, d, atan(d2.y, d2.x), uArcScale * 1.6, uArcSpeed * 3.0, uArcSharp * 0.8, uSeed + float(i) * 3.7);
      float disc = smoothstep(s.w, 0.0, d);
      float hot = smoothstep(s.w * 0.25, 0.0, d);
      color += (uColorArc * local * disc + uColorHot * hot * 1.5) * s.z * uStrikeGlow;
    }

    color *= uFade * uOpacity * uGlobalGlow;
    if (max(color.r, max(color.g, color.b)) < 0.002) discard;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createIonGroundMaterial() {
  const strikes = [];
  for (let i = 0; i < ION_MAX_BOLTS; i++) strikes.push(new Vector4(0, 0, 0, 0));

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uQuadSize: { value: 12 },
      uRadius: { value: 5 },
      uPoolRadius: { value: 1.2 },
      uReveal: { value: 0 },
      uFade: { value: 1 },
      uOpacity: { value: 1 },
      uSurge: { value: 0 },
      uRingWidth: { value: 0.06 },
      uRingGlow: { value: 2.5 },
      uPoolGlow: { value: 2 },
      uArcGlow: { value: 2 },
      uArcScale: { value: 2 },
      uArcSharp: { value: 10 },
      uArcSpeed: { value: 0.6 },
      uArcDensity: { value: 0.6 },
      uStrikeGlow: { value: 3 },
      uSeed: { value: 0 },
      uStrikes: { value: strikes },
      uColorRing: { value: new Color() },
      uColorArc: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT
  });

  /** Strike flares, written in place by the ability: (x, z rel. centre, heat, radius). */
  material.userData.strikes = strikes;

  /** @param {object} state { quadSize, radius, poolRadius, reveal, fade, surge, seed } */
  material.userData.sync = (state) => {
    const c = settings.ionstorm;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuadSize.value = state.quadSize;
    u.uRadius.value = state.radius;
    u.uPoolRadius.value = state.poolRadius;
    u.uReveal.value = state.reveal;
    u.uFade.value = state.fade;
    u.uSurge.value = state.surge;
    u.uSeed.value = state.seed;
    u.uOpacity.value = c.groundOpacity * g.opacity;
    u.uRingWidth.value = c.ringWidth;
    u.uRingGlow.value = c.ringGlow * g.shaderIntensity;
    u.uPoolGlow.value = c.poolGlow * g.shaderIntensity;
    u.uArcGlow.value = c.arcGlow * g.shaderIntensity;
    u.uArcScale.value = c.arcScale * g.noiseFrequency;
    u.uArcSharp.value = c.arcSharpness;
    u.uArcSpeed.value = c.arcSpeed * g.noiseSpeed;
    u.uArcDensity.value = c.arcDensity;
    u.uStrikeGlow.value = c.strikeGlow * g.shaderIntensity;
    u.uColorRing.value.copy(getColor(c.colorRing));
    u.uColorArc.value.copy(getColor(c.colorArc));
    u.uColorHot.value.copy(getColor(c.colorCore));
  };

  return material;
}

/* ==================================================================== */
/* The warp — LAYER.DISTORTION                                           */
/* ==================================================================== */

/**
 * A camera-facing quad round the column. Ionised air refracts hardest right at
 * the plasma's skin, so the mask is a pair of soft bands either side of the
 * axis (strongest at `uSkin` across the quad), not a blob; the offset points
 * *away* from the axis plus noise, so the scene behind bulges round the pillar.
 */
const WARP_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
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
  uniform float uSkin;
  uniform float uSeed;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale * 0.6 - uTime * uSpeed + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(19.3, 7.7, 31.1)));
    vec2 out2 = vec2(sign(c.x), 0.0);
    vec2 offset = normalize(out2 * 0.6 + n * 0.8 + 1e-4);

    float skin = exp(-pow((abs(c.x) - uSkin) / 0.22, 2.0));
    float mask = skin
               * smoothstep(0.0, 0.05, vUv.y)
               * (1.0 - smoothstep(0.75, 1.0, vUv.y));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

export function createIonWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 4 },
      uHeight: { value: 10 },
      uStrength: { value: 0 },
      uScale: { value: 1.5 },
      uSpeed: { value: 2 },
      uSkin: { value: 0.4 },
      uSeed: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} state { width, height, skin, strength, seed } */
  material.userData.sync = (state) => {
    const c = settings.ionstorm;
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = state.width;
    u.uHeight.value = state.height;
    u.uSkin.value = state.skin;
    u.uStrength.value = state.strength * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
    u.uSeed.value = state.seed;
  };

  return material;
}
