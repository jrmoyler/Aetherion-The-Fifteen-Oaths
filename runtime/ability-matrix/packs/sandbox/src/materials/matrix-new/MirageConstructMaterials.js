import {
  AdditiveBlending,
  Color,
  CustomBlending,
  DoubleSide,
  FrontSide,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Vector3
} from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Mirage Construct — the five bespoke surfaces of the illusion.
 *
 *  - `createMirageBodyMaterial(after)` — the spectral copy itself. Runs on the
 *    caster's *own skinned mesh* (a SkeletonUtils clone, so three's skinning
 *    chunks do the posing) and on the procedural fallback silhouette alike —
 *    every skinning line is behind `USE_SKINNING`, which three defines per
 *    object. A fresnel rim, interference bands rolling up the body with the
 *    red and blue bands phase-shifted against the green (the chromatic
 *    fringe), a strobe, slice tearing in the vertex stage, a noise-fronted
 *    dissolve that assembles the figure from the feet up with a hot seam, and
 *    the erosion that takes it apart on the burst. `after = true` builds the
 *    afterimage variant: the same shader, offset sideways in world space and
 *    tinted one colour, drawn rim-only behind the copy.
 *  - `createMiragePoolMaterial` — the mirage on the floor under it: rings of
 *    interference running outward, iridescent, bent by a heat shimmer.
 *  - `createMirageShardMaterial` — the shards of light it bursts into: glassy,
 *    additive, a bright spine and a fresnel edge, per-instance fade.
 *  - `createMirageHazeMaterial` — LAYER.DISTORTION: an upright column of heat
 *    shimmer rising off the copy while it stands.
 *  - `createMirageShockMaterial` — LAYER.DISTORTION: the burst's ring, a
 *    double front pushing the frame outward.
 *
 * Every material reads `settings.mirage` in `userData.sync(state)`; `state`
 * carries only what the ability knows that settings do not (its clock, its
 * seed, where its feet are).
 */

/* ==================================================================== */
/* The copy                                                              */
/* ==================================================================== */

/**
 * Three's own skinning chunks, so the clone is posed exactly as the caster's
 * renderer would pose it — and so the same program draws the non-skinned
 * fallback silhouette, where every one of those chunks compiles to nothing.
 *
 * The slice tearing happens here rather than in the fragment stage, because a
 * band thrown sideways has to *move* its silhouette, not just its colour.
 */
const BODY_VERTEX = /* glsl */ `
  #include <skinning_pars_vertex>

  uniform float uTime;
  uniform vec3  uRoot;        // world position of the copy's feet
  uniform vec3  uOffset;      // world offset (afterimages only)
  uniform float uHeight;      // metres
  uniform float uGlitch;      // metres a torn slice jumps
  uniform float uSlices;
  uniform float uFlickerRate;
  uniform float uSeed;
  uniform float uMirror;      // 1 = the reflection in the false lake
  uniform float uRipple;      // metres the reflection wavers sideways
  uniform float uRippleFreq;  // ripples per metre down the reflection
  uniform float uRippleSpeed;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vLocal;       // metres from the feet, before tearing
  varying float vH;           // metres above the feet
  varying float vFlat;        // metres from the feet, across the floor

  float mhash(float n) { return fract(sin(n) * 43758.5453123); }

  void main() {
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <beginnormal_vertex>
    #include <skinnormal_vertex>
    #include <skinning_vertex>

    vec4 world = modelMatrix * vec4(transformed, 1.0);
    float h = world.y - uRoot.y;
    vLocal = world.xyz - uRoot;
    vH = h;

    // Tearing is laid across the view, so a torn band always reads as a
    // sideways jump, whichever side of the copy the camera is on.
    vec3 toCam = cameraPosition - uRoot;
    toCam.y = 0.0;
    toCam = length(toCam) > 1e-4 ? normalize(toCam) : vec3(0.0, 0.0, 1.0);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));

    float band = floor(h / max(uHeight, 0.01) * uSlices);
    float tick = floor(uTime * uFlickerRate);
    float roll = mhash(band * 1.37 + tick * 0.71 + uSeed * 13.0);
    float tear = (mhash(band * 3.11 + tick * 1.93 + uSeed) - 0.5) * 2.0 * uGlitch * step(0.74, roll);
    world.xyz += right * tear + uOffset;
    vec3 nW = normalize(mat3(modelMatrix) * objectNormal);

    // The mirage's own trick: the copy hangs upside down in the false lake,
    // wavering as if seen through rising air.
    if (uMirror > 0.5) {
      world.xyz += right * sin(h * uRippleFreq * 6.2831853 - uTime * uRippleSpeed + uSeed) * uRipple * min(h, 1.0);
      world.y = 2.0 * uRoot.y - world.y;
      nW.y = -nW.y;
    }
    vFlat = length(world.xz - uRoot.xz);

    vWorld = world.xyz;
    vNormalW = nW;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BODY_FRAGMENT = /* glsl */ `
  #define TAU 6.28318530718

  uniform float uTime;
  uniform float uHeight;
  uniform float uForm;          // metres: the assembly front
  uniform float uFormEdge;
  uniform float uFormNoise;
  uniform float uFormNoiseScale;
  uniform float uFormGlow;
  uniform float uRim;
  uniform float uRimPower;
  uniform float uFill;
  uniform float uBandDensity;
  uniform float uBandSpeed;
  uniform float uBandSharp;
  uniform float uBandStrength;
  uniform float uBandWarp;
  uniform float uChroma;
  uniform float uFlicker;
  uniform float uFlickerRate;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uBreak;         // 0 whole .. 1 gone (the burst)
  uniform float uCharge;        // 0..1 the gather before the burst
  uniform float uChargeGlow;
  uniform float uSeed;
  uniform float uAfter;         // 1 = afterimage
  uniform float uMirror;        // 1 = reflection
  uniform float uPoolR;         // metres: the reflection is clipped to the lake
  uniform float uReflectFade;   // metres of depth over which it fades
  uniform float uReflect;       // reflection strength
  uniform vec3  uMirrorTint;
  uniform vec3  uColorRim;
  uniform vec3  uColorBand;
  uniform vec3  uColorEdge;
  uniform vec3  uTint;
  uniform vec3  uColorDeep;     // the dark glass the copy is made of
  uniform float uCover;         // how much that glass covers what is behind it
  uniform vec3  uRoot;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vLocal;
  varying float vH;
  varying float vFlat;

  ${noiseGLSL}
  ${commonGLSL}

  float band(float x) {
    return pow(0.5 + 0.5 * sin(x), uBandSharp);
  }

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);

    /* --- assembly: a ragged front climbing from the feet --- */
    float n = snoise(vec3(vLocal * uFormNoiseScale + uSeed));
    float above = vH - (uForm + n * uFormNoise);
    if (above > 0.0) discard;
    float seam = exp(above / max(uFormEdge, 1e-3));

    /* --- the burst: eaten from everywhere at once, edges blazing --- */
    float e = snoise(vLocal * 5.0 + vec3(uSeed * 3.0, uTime * 1.7, -uTime * 0.6)) * 0.5 + 0.5;
    float thresh = uBreak * 1.15 - 0.05;
    if (uBreak > 0.0 && e < thresh) discard;
    float burn = uBreak > 0.0 ? exp(-(e - thresh) / 0.06) : 0.0;

    /* --- fresnel rim --- */
    float rim = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), uRimPower) * uRim;

    /* --- interference: R and B bands run ahead / behind G --- */
    float warp = snoise(vec3(vLocal.xz * 2.0, vH * 1.5 - uTime * 0.5)) * uBandWarp;
    float ph = (vH * uBandDensity - uTime * uBandSpeed + warp) * TAU;
    float shift = uChroma * TAU;
    vec3 bands = vec3(band(ph + shift), band(ph), band(ph - shift));

    float tick = floor(uTime * uFlickerRate);
    float strobe = 1.0 - uFlicker * hash11(tick * 1.13 + uSeed * 31.0);
    // A slow breath under the strobe, so the copy never sits perfectly still.
    strobe *= 0.9 + 0.1 * sin(uTime * 2.3 + uSeed);

    vec3 color;
    float energy;
    if (uAfter > 0.5) {
      // Afterimage: one colour, rim and bands only — a fringe, not a body.
      float b = dot(bands, vec3(0.3333));
      energy = rim * (0.6 + 0.6 * b * uBandStrength);
      color = uTint;
    } else {
      energy = rim + uFill + uBandStrength * dot(bands, vec3(0.3333)) * (uFill + rim * 0.7);
      color = uColorRim * rim
            + uColorBand * bands * uBandStrength * (uFill + rim * 0.7)
            + uColorBand * uFill;
      color /= max(energy, 1e-3);
    }

    // The seam and the burn are pure light, whatever the body is doing.
    float hot = seam * uFormGlow + burn * 3.0;
    color = mix(color, uColorEdge, clamp(hot / (hot + energy + 1e-3), 0.0, 1.0));
    energy += hot;
    energy *= strobe * (1.0 + uCharge * uChargeGlow);
    energy *= mix(1.0, uShaderIntensity, 0.5);

    float cover = uCover * (1.0 - clamp(burn, 0.0, 1.0)) * (1.0 - 0.5 * clamp(rim, 0.0, 1.0));
    if (uMirror > 0.5) {
      // Seen *in* the lake: the image of a point under the floor appears where
      // the eye ray to it crosses the water, so clip on that crossing — not
      // on the point's own xz, which lets the image spill toward the camera.
      vec3 toP = vWorld - cameraPosition;
      float k = (cameraPosition.y - uRoot.y) / max(cameraPosition.y - vWorld.y, 1e-3);
      vec3 wet = cameraPosition + toP * clamp(k, 0.0, 1.0);
      float crossR = length(wet.xz - uRoot.xz);
      float inLake = 1.0 - smoothstep(uPoolR * 0.8, uPoolR * 0.97, crossR);
      // Anything standing in front of the water hides the image.
      vec4 crossView = viewMatrix * vec4(wet, 1.0);
      vec2 screenUV = gl_FragCoord.xy / uResolution;
      float seen = softFade(uSceneDepth, screenUV, crossView.z + 0.35, uCameraNear, uCameraFar, 0.2);
      float depthFade = exp(-vH / max(uReflectFade, 0.05));
      energy *= inLake * seen * depthFade * uReflect;
      cover *= inLake * seen * depthFade;
      color = mix(color, uMirrorTint, 0.45);
    }
    if (energy < 0.004 && cover < 0.004) discard;
    vec3 light = color * energy * uGlow * uGlobalGlow;
    if (uAfter > 0.5) {
      gl_FragColor = vec4(light, clamp(energy, 0.0, 1.0) * uOpacity);
    } else {
      // Premultiplied over: a dark violet glass body (the deep stop) that
      // covers what is behind it, so the copy reads as a silhouette with a
      // pale rim and saturated interference bands, never a white blob.
      float a = clamp(cover * uOpacity, 0.0, 1.0);
      gl_FragColor = vec4(light * uOpacity + uColorDeep * a * 0.35, a);
    }
  }
`;

/**
 * @param {boolean|'body'|'after'|'mirror'} mode `true`/`'after'` builds the
 *   afterimage variant (offset, single tint); `'mirror'` builds the reflection
 *   in the false lake (flipped through the floor in the vertex stage, drawn
 *   without the depth test so it shows *in* the floor, clipped to the lake).
 */
export function createMirageBodyMaterial(mode = false) {
  const kind = mode === true ? 'after' : mode || 'body';
  const after = kind === 'after';
  const mirror = kind === 'mirror';
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: !mirror,
    // The copy and its reflection are dark glass over the scene (premultiplied
    // over); the afterimages are pure fringe light (additive).
    blending: after ? AdditiveBlending : CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    side: mirror ? DoubleSide : FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRoot: { value: new Vector3() },
      uOffset: { value: new Vector3() },
      uHeight: { value: 1.78 },
      uGlitch: { value: 0.03 },
      uSlices: { value: 24 },
      uFlickerRate: { value: 14 },
      uSeed: { value: 0 },
      uForm: { value: 0 },
      uFormEdge: { value: 0.08 },
      uFormNoise: { value: 0.2 },
      uFormNoiseScale: { value: 3.5 },
      uFormGlow: { value: 4 },
      uRim: { value: 2 },
      uRimPower: { value: 2.4 },
      uFill: { value: 0.15 },
      uBandDensity: { value: 9 },
      uBandSpeed: { value: 2.4 },
      uBandSharp: { value: 3 },
      uBandStrength: { value: 0.9 },
      uBandWarp: { value: 0.25 },
      uChroma: { value: 0.16 },
      uFlicker: { value: 0.35 },
      uGlow: { value: 2.4 },
      uOpacity: { value: 0.85 },
      uBreak: { value: 0 },
      uCharge: { value: 0 },
      uChargeGlow: { value: 2 },
      uAfter: { value: after ? 1 : 0 },
      uMirror: { value: mirror ? 1 : 0 },
      uPoolR: { value: 2 },
      uReflectFade: { value: 1.5 },
      uReflect: { value: 0.6 },
      uRipple: { value: 0.05 },
      uRippleFreq: { value: 1.5 },
      uRippleSpeed: { value: 3 },
      uMirrorTint: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorBand: { value: new Color() },
      uColorEdge: { value: new Color() },
      uTint: { value: new Color() },
      uColorDeep: { value: new Color() },
      uCover: { value: 0.6 }
    }),
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT
  });

  /**
   * @param {object} state { root, offset, form, breakup, charge, seed, tint, opacity, poolR }
   *   `tint` is a settings colour key (afterimages), `opacity` a 0..1 multiplier,
   *   `poolR` the lake's grown radius in metres (reflection only).
   */
  material.userData.sync = (state) => {
    const c = settings.mirage;
    const g = settings.global;
    const u = material.uniforms;
    u.uRoot.value.copy(state.root);
    u.uOffset.value.copy(state.offset);
    u.uSeed.value = state.seed;
    u.uForm.value = state.form;
    u.uBreak.value = state.breakup;
    u.uCharge.value = state.charge;

    u.uHeight.value = c.bodyHeight * Math.max(0.1, c.copyScale);
    u.uPoolR.value = state.poolR ?? 0;
    u.uReflectFade.value = c.reflectFade;
    u.uReflect.value = c.reflectStrength;
    u.uRipple.value = c.reflectRipple * g.noiseStrength;
    u.uRippleFreq.value = c.reflectRippleFreq * g.noiseFrequency;
    u.uRippleSpeed.value = c.reflectRippleSpeed * g.noiseSpeed;
    u.uMirrorTint.value.copy(getColor(c.colorReflect));
    u.uGlitch.value = (c.glitch + c.chargeGlitch * state.charge) * g.randomness;
    u.uSlices.value = Math.max(1, Math.round(c.glitchSlices));
    u.uFlickerRate.value = c.flickerRate * g.animationSpeed;
    u.uFormEdge.value = c.formEdge;
    u.uFormNoise.value = c.formNoise * g.noiseStrength;
    u.uFormNoiseScale.value = c.formNoiseScale * g.noiseFrequency;
    u.uFormGlow.value = c.formGlow;
    u.uRim.value = c.rimStrength * g.fresnel;
    u.uRimPower.value = c.rimPower;
    u.uFill.value = c.fill;
    u.uBandDensity.value = c.bandDensity * g.noiseFrequency;
    u.uBandSpeed.value = c.bandSpeed * g.noiseSpeed;
    u.uBandSharp.value = Math.max(0.1, c.bandSharpness);
    u.uBandStrength.value = c.bandStrength;
    u.uBandWarp.value = c.bandWarp * g.noiseStrength;
    u.uChroma.value = c.chromaSplit;
    u.uFlicker.value = c.flicker;
    u.uGlow.value = c.bodyGlow * g.glow;
    u.uOpacity.value = c.bodyOpacity * g.opacity * state.opacity;
    u.uChargeGlow.value = c.chargeGlow;
    u.uColorRim.value.copy(getColor(c.colorBodyRim));
    u.uColorBand.value.copy(getColor(c.colorBodyBand));
    u.uColorEdge.value.copy(getColor(c.colorBodyEdge));
    u.uColorDeep.value.copy(getColor(c.colorBodyDeep));
    u.uCover.value = (mirror ? c.reflectCover : c.bodyCover) * (1 - state.breakup);
    if (state.tint) u.uTint.value.copy(getColor(c[state.tint]));
  };

  return material;
}

/* ==================================================================== */
/* The mirage pool                                                       */
/* ==================================================================== */

const POOL_VERTEX = /* glsl */ `
  uniform float uQuadSize;
  varying vec2 vFlat;
  varying vec3 vWorld;
  void main() {
    vFlat = (uv - 0.5) * uQuadSize;
    vFlat.y = -vFlat.y;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  #define TAU 6.28318530718

  uniform float uTime;
  uniform float uRadius;       // metres, grown
  uniform float uRings;
  uniform float uRingSpeed;
  uniform float uRingWidth;
  uniform float uIridescence;
  uniform float uShimmer;
  uniform float uShimmerScale;
  uniform float uEdgeGlow;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uFlare;
  uniform float uSeed;
  uniform float uSky;          // how much sky the lake mirrors
  uniform float uEvap;         // 0..1 the lake drying from its rim in
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uDeep;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;

  varying vec2 vFlat;
  varying vec3 vWorld;

  ${noiseGLSL}

  vec2 lakeEquirect(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }

  void main() {
    if (uRadius < 0.01) discard;
    // The heat shimmer bends everything in the lake before it is drawn.
    vec2 p = vFlat;
    vec2 bend = vec2(
      snoise(vec3(p * uShimmerScale, uTime * 0.9 + uSeed)),
      snoise(vec3(p * uShimmerScale + 7.1, uTime * 0.9 + uSeed))
    ) * uShimmer * 0.15;
    float ang = atan(p.y, p.x);
    // A ragged shoreline, which dries inward on the way out.
    float shore = 1.0 + 0.07 * snoise(vec3(cos(ang) * 1.7, sin(ang) * 1.7, uSeed + uTime * 0.2));
    float r = length(p + bend) / (uRadius * shore * (1.0 - 0.85 * uEvap));
    if (r > 1.12) discard;
    float fill = 1.0 - smoothstep(0.9, 1.0, r);

    // A false lake: the deep tone, with the sky mirrored in it — what a mirage is.
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 R = reflect(-V, normalize(vec3(bend.x * 1.6, 1.0, bend.y * 1.6)));
    vec3 sky = texture2D(uEnvMap, lakeEquirect(R)).rgb;
    sky = sky / (1.0 + sky);
    float grazing = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.0);
    vec3 mirror = sky * uColorA * uSky * (0.35 + 0.9 * grazing);

    // Ripples of interference running outward, iridescent.
    float x = r * uRings - uTime * uRingSpeed;
    float ring = 1.0 - smoothstep(0.0, max(uRingWidth * uRings, 0.01), abs(fract(x) - 0.5) * 2.0 * 0.5);
    ring *= 0.25 + 0.75 * r;
    // Broken by a slow noise into wavelets, so the lake reads as water
    // ruffled by heat rather than a target board of rings.
    ring *= smoothstep(-0.25, 0.65, snoise(vec3(p * 2.2 / max(uRadius, 0.1), uTime * 0.35 + uSeed * 1.7)));
    vec3 film = 0.5 + 0.5 * cos(TAU * (r * 1.7 - uTime * 0.12 + vec3(0.0, 0.33, 0.67)));
    vec3 ripple = mix(uColorB, uColorC, 0.5 + 0.5 * sin(r * 9.0 - uTime)) * ring * (1.0 + uIridescence * (film - 0.5) * 2.0);

    float edge = exp(-pow((r - 1.0) / 0.05, 2.0)) * uEdgeGlow;
    vec3 light = (ripple * 0.55 + uColorA * edge) * uGlow * uGlobalGlow * (1.0 + uFlare);
    vec3 color = uDeep + mirror + light;
    float alpha = clamp(fill * uOpacity + edge * 0.4, 0.0, 1.0) * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createMiragePoolMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uQuadSize: { value: 6 },
      uRadius: { value: 0 },
      uRings: { value: 7 },
      uRingSpeed: { value: 0.6 },
      uRingWidth: { value: 0.05 },
      uIridescence: { value: 0.7 },
      uShimmer: { value: 0.35 },
      uShimmerScale: { value: 2.2 },
      uEdgeGlow: { value: 2 },
      uGlow: { value: 1.2 },
      uOpacity: { value: 0.8 },
      uFade: { value: 1 },
      uFlare: { value: 0 },
      uSeed: { value: 0 },
      uSky: { value: 0.6 },
      uEvap: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uDeep: { value: new Color() }
    }),
    vertexShader: POOL_VERTEX,
    fragmentShader: POOL_FRAGMENT
  });
  material.uniforms.uEnvMap = frame.uEnvMap;

  /** @param {object} state { quadSize, radius, fade, flare, seed, evap } */
  material.userData.sync = (state) => {
    const c = settings.mirage;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuadSize.value = state.quadSize;
    u.uRadius.value = state.radius;
    u.uFade.value = state.fade;
    u.uFlare.value = state.flare;
    u.uSeed.value = state.seed;
    u.uEvap.value = state.evap ?? 0;
    u.uRings.value = c.poolRings;
    u.uRingSpeed.value = c.poolRingSpeed * g.noiseSpeed;
    u.uRingWidth.value = c.poolRingWidth;
    u.uIridescence.value = c.poolIridescence;
    u.uShimmer.value = c.poolShimmer * g.noiseStrength;
    u.uShimmerScale.value = c.poolShimmerScale * g.noiseFrequency;
    u.uEdgeGlow.value = c.poolEdgeGlow;
    u.uGlow.value = c.poolGlow * g.glow;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uSky.value = c.poolSky;
    u.uColorA.value.copy(getColor(c.colorPoolA));
    u.uColorB.value.copy(getColor(c.colorPoolB));
    u.uColorC.value.copy(getColor(c.colorPoolC));
    u.uDeep.value.copy(getColor(c.colorPoolDeep));
  };

  return material;
}

/* ==================================================================== */
/* The road (travel)                                                     */
/* ==================================================================== */

/**
 * The way the mirage comes: a strip of false water racing along the floor
 * from the caster's feet to the circle, widening as it goes, mirroring the
 * sky, its leading edge a hot seam of shimmer. Drawn up to the projection's
 * front; after landing it stays and dries from the caster's end toward the
 * lake. Normal blending, so it carries the deep tone onto the floor.
 */
const ROAD_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uNear;
  uniform float uFar;
  varying vec2 vS;     // metres along, −1..1 across
  varying vec3 vWorld;
  void main() {
    float t = position.x + 0.5;
    float along = t * uLength;
    float hw = mix(uNear, uFar, t);
    vec3 world = uStart + uDir * along + uSide * position.y * 2.0 * hw;
    world.y = 0.016;
    vS = vec2(along, position.y * 2.0);
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const ROAD_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFront;     // metres: the projection's leading edge
  uniform float uDry;       // metres from the caster end already dried
  uniform float uOpacity;
  uniform float uSky;
  uniform float uSeam;
  uniform float uShimmer;
  uniform float uSeed;
  uniform float uGlobalGlow;
  uniform vec3  uDeep;
  uniform vec3  uTint;
  uniform vec3  uHot;
  uniform sampler2D uEnvMap;
  varying vec2 vS;
  varying vec3 vWorld;

  ${noiseGLSL}

  vec2 roadEquirect(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }

  void main() {
    float d = vS.x;
    float n = snoise(vec3(d * 0.7 - uTime * 1.2, vS.y * 1.3, uSeed));
    if (d > uFront || d < uDry + n * 0.6) discard;
    float across = 1.0 - smoothstep(0.55 + 0.25 * n, 1.0, abs(vS.y));
    float foot = smoothstep(0.0, 1.2, d);
    vec3 V = normalize(cameraPosition - vWorld);
    vec2 wob = vec2(snoise(vec3(vWorld.xz * 1.4, uTime * 1.5)), snoise(vec3(vWorld.zx * 1.4, uTime * 1.5 + 4.0))) * uShimmer;
    vec3 R = reflect(-V, normalize(vec3(wob.x, 1.0, wob.y)));
    vec3 sky = texture2D(uEnvMap, roadEquirect(R)).rgb;
    sky = sky / (1.0 + sky);
    float seam = exp(-pow((uFront - d) / 0.6, 2.0)) * uSeam;
    float dry = exp(-pow((d - uDry) / 0.5, 2.0)) * step(0.01, uDry) * 0.6;
    vec3 col = uDeep + sky * uTint * uSky + uHot * (seam + dry) * uGlobalGlow;
    float a = across * foot * uOpacity;
    gl_FragColor = vec4(col, clamp(a + seam * across * 0.3, 0.0, 1.0));
  }
`;

export function createMirageRoadMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: sharedUniforms({
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uNear: { value: 0.3 },
      uFar: { value: 1.2 },
      uFront: { value: 0 },
      uDry: { value: 0 },
      uOpacity: { value: 0.7 },
      uSky: { value: 0.6 },
      uSeam: { value: 2 },
      uShimmer: { value: 0.2 },
      uSeed: { value: 0 },
      uDeep: { value: new Color() },
      uTint: { value: new Color() },
      uHot: { value: new Color() }
    }),
    vertexShader: ROAD_VERTEX,
    fragmentShader: ROAD_FRAGMENT
  });
  material.uniforms.uEnvMap = frame.uEnvMap;

  /** @param {object} s { start, dir, side, length, front, dry, fade, seed } */
  material.userData.sync = (s) => {
    const c = settings.mirage;
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(s.start);
    u.uDir.value.copy(s.dir);
    u.uSide.value.copy(s.side);
    u.uLength.value = Math.max(0.1, s.length);
    u.uNear.value = c.roadWidthNear * 0.5;
    u.uFar.value = c.roadWidthFar * 0.5;
    u.uFront.value = s.front;
    u.uDry.value = s.dry;
    u.uOpacity.value = c.roadOpacity * g.opacity * s.fade;
    u.uSky.value = c.poolSky;
    u.uSeam.value = c.roadSeam * g.glow;
    u.uShimmer.value = c.poolShimmer * 0.5 * g.noiseStrength;
    u.uSeed.value = s.seed;
    u.uDeep.value.copy(getColor(c.colorPoolDeep));
    u.uTint.value.copy(getColor(c.colorPoolA));
    u.uHot.value.copy(getColor(c.colorBodyEdge));
  };
  return material;
}

/* ==================================================================== */
/* The heat veil                                                         */
/* ==================================================================== */

/**
 * Tongues of bent air standing in a ring round the copy. Placed entirely in
 * the vertex stage from `createMirageVeilGeometry`'s `(t, a, i)`: seated on
 * `veilSeat × zoneRadius`, each ribbon turned to run round the ring, swaying
 * with a wave that climbs it, tapering to a tip like a flame of heat. The
 * charge **pulls** the tips in over the copy (the illusion gathering); the
 * burst **blows** them outward and they thin to nothing (the exit). Additive:
 * interference bands rolling up them with the R/B phase split of the copy,
 * so the veil and the body read as one illusion.
 */
const VEIL_VERTEX = /* glsl */ `
  #define TAU 6.28318530718
  uniform float uTime;
  uniform vec3  uCentre;
  uniform float uRadius;
  uniform float uHeight;
  uniform float uWidth;
  uniform float uCount;
  uniform float uSway;
  uniform float uSwayFreq;
  uniform float uSwaySpeed;
  uniform float uSpin;
  uniform float uPull;
  uniform float uBlow;
  uniform float uRise;
  uniform float uSeed;
  varying float vT;
  varying float vA;
  varying float vI;
  varying vec3  vWorld;

  float vhash(float n) { return fract(sin(n * 91.345 + uSeed) * 43758.5453); }

  void main() {
    float t = position.x;
    float a = position.y;
    float i = position.z;
    float jit = vhash(i);
    float ang = (i + 0.35 * jit) / uCount * TAU + uTime * uSpin + t * 0.35;
    // Each ribbon its own height, rising out of the floor.
    float h = uHeight * (0.75 + 0.45 * jit) * t * uRise;
    // Lean in on the charge, out on the burst, more at the tip.
    float rad = uRadius * (1.0 - uPull * (0.15 + 0.7 * t)) * (1.0 + uBlow * (0.4 + 1.4 * t));
    float sway = sin(t * uSwayFreq * TAU - uTime * uSwaySpeed + i * 2.3) * uSway * t;
    float width = uWidth * pow(max(1.0 - t, 0.0), 0.55) * (1.0 - 0.6 * uBlow);
    vec3 radial = vec3(cos(ang), 0.0, sin(ang));
    vec3 tangent = vec3(-sin(ang), 0.0, cos(ang));
    vec3 world = uCentre + radial * (rad + sway * 0.6) + tangent * (a * width * 0.5 + sway) + vec3(0.0, h, 0.0);
    vT = t; vA = a; vI = i; vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const VEIL_FRAGMENT = /* glsl */ `
  #define TAU 6.28318530718
  uniform float uTime;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uBands;
  uniform float uBandSpeed;
  uniform float uChroma;
  uniform float uFade;
  uniform float uSeed;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uCover;
  varying float vT;
  varying float vA;
  varying float vI;
  varying vec3  vWorld;

  ${noiseGLSL}

  void main() {
    float n = snoise(vec3(vA * 1.5 + vI * 3.1, vT * 4.0 - uTime * 1.6, uSeed));
    float across = 1.0 - smoothstep(0.35 + 0.3 * n, 1.0, abs(vA));
    float foot = smoothstep(0.0, 0.08, vT);
    float tip = 1.0 - smoothstep(0.55 + 0.25 * n, 1.0, vT);
    float ph = (vT * uBands - uTime * uBandSpeed + n * 0.4) * TAU;
    vec3 bands = vec3(0.5 + 0.5 * sin(ph + uChroma * TAU), 0.5 + 0.5 * sin(ph), 0.5 + 0.5 * sin(ph - uChroma * TAU));
    bands = pow(bands, vec3(3.0));
    float spine = exp(-vA * vA * 9.0);
    vec3 col = uBody * (0.35 + 0.65 * bands) + uTint * bands * 0.8 + uCore * spine * (1.0 - vT) * 0.6;
    // The deep stop: tongues smoke out to dark violet toward their tips and
    // ragged edges, and that smoke covers the sky behind (premultiplied).
    float deep = clamp(smoothstep(0.4, 0.95, vT) * 0.75 + (1.0 - across) * 0.35, 0.0, 1.0);
    col = mix(col, uDeep, deep);
    float e = across * foot * tip * (0.55 + 0.45 * n) * uFade;
    if (e < 0.003) discard;
    float cover = clamp(e * uCover * (0.3 + 0.7 * deep), 0.0, 1.0);
    gl_FragColor = vec4(col * e * uGlow * uGlobalGlow * uShaderIntensity * uOpacity, cover * uOpacity);
  }
`;

export function createMirageVeilMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uRadius: { value: 2 },
      uHeight: { value: 3.5 },
      uWidth: { value: 1.2 },
      uCount: { value: 9 },
      uSway: { value: 0.2 },
      uSwayFreq: { value: 1.2 },
      uSwaySpeed: { value: 3 },
      uSpin: { value: 0.2 },
      uPull: { value: 0 },
      uBlow: { value: 0 },
      uRise: { value: 0 },
      uSeed: { value: 0 },
      uGlow: { value: 1 },
      uOpacity: { value: 0.6 },
      uBands: { value: 6 },
      uBandSpeed: { value: 1.5 },
      uChroma: { value: 0.16 },
      uFade: { value: 1 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
      uCover: { value: 0.35 }
    }),
    vertexShader: VEIL_VERTEX,
    fragmentShader: VEIL_FRAGMENT
  });

  /** @param {object} s { centre, rise, pull, blow, fade, seed } */
  material.userData.sync = (s) => {
    const c = settings.mirage;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uRadius.value = Math.max(0.2, c.zoneRadius) * c.veilSeat;
    u.uHeight.value = c.veilHeight;
    u.uWidth.value = c.veilWidth;
    u.uCount.value = Math.max(1, Math.round(c.veilCount));
    u.uSway.value = c.veilSway * g.turbulence;
    u.uSwayFreq.value = c.veilSwayFreq * g.noiseFrequency;
    u.uSwaySpeed.value = c.veilSwaySpeed * g.animationSpeed;
    u.uSpin.value = c.veilSpin * g.animationSpeed;
    u.uPull.value = s.pull;
    u.uBlow.value = s.blow;
    u.uRise.value = s.rise;
    u.uSeed.value = s.seed;
    u.uGlow.value = c.veilGlow * g.glow;
    u.uOpacity.value = c.veilOpacity * g.opacity;
    u.uBands.value = c.veilBands * g.noiseFrequency;
    u.uBandSpeed.value = c.bandSpeed * g.noiseSpeed;
    u.uChroma.value = c.chromaSplit;
    u.uFade.value = s.fade;
    u.uCore.value.copy(getColor(c.colorBodyEdge));
    u.uTint.value.copy(getColor(c.colorVeilTint));
    u.uBody.value.copy(getColor(c.colorVeil));
    u.uDeep.value.copy(getColor(c.colorVeilDeep));
    u.uCover.value = c.veilCover;
  };
  return material;
}

/* ==================================================================== */
/* The shards                                                            */
/* ==================================================================== */

/**
 * The copy comes apart into these. Unit crystal from `ProceduralGeometry`
 * (base y = 0, tip y = 1): a bright spine runs up the middle of each one so it
 * reads as a splinter of *light* rather than of glass, and the fresnel edge
 * and the tip do the rest. Per-instance `aFade`.
 */
const SHARD_VERTEX = /* glsl */ `
  attribute float aFade;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vObj;
  varying float vFade;

  void main() {
    mat4 inst = mat4(1.0);
    #ifdef USE_INSTANCING
      inst = instanceMatrix;
    #endif
    vec4 world = modelMatrix * inst * vec4(position, 1.0);
    mat3 m = mat3(modelMatrix) * mat3(inst);
    vNormalW = normalize(transpose(inverse(m)) * normal);
    vViewDir = cameraPosition - world.xyz;
    vObj = position;
    vFade = aFade;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHARD_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uFresnel;
  uniform float uOpacity;
  uniform vec3  uColorCore;
  uniform vec3  uColorEdge;
  uniform vec3  uColorDeep;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vObj;
  varying float vFade;

  void main() {
    if (vFade < 0.003) discard;
    float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    float rim = pow(1.0 - ndv, 2.2) * uFresnel;
    float spine = exp(-dot(vObj.xz, vObj.xz) / 0.02) * (0.4 + 0.6 * vObj.y);
    float tip = smoothstep(0.6, 1.0, vObj.y);
    vec3 color = mix(uColorDeep, uColorEdge, clamp(rim, 0.0, 1.0)) + uColorCore * (spine * 1.4 + tip);
    float alpha = clamp(0.2 + rim + spine * 0.6 + tip * 0.4, 0.0, 1.0) * uOpacity * vFade;
    gl_FragColor = vec4(color * uGlow * uGlobalGlow * vFade, alpha);
  }
`;

export function createMirageShardMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uGlow: { value: 3 },
      uFresnel: { value: 2.2 },
      uOpacity: { value: 0.95 },
      uColorCore: { value: new Color() },
      uColorEdge: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: SHARD_VERTEX,
    fragmentShader: SHARD_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.mirage;
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.shardGlow * g.glow;
    u.uFresnel.value = c.shardFresnel * g.fresnel;
    u.uOpacity.value = c.shardOpacity * g.opacity;
    u.uColorCore.value.copy(getColor(c.colorShardCore));
    u.uColorEdge.value.copy(getColor(c.colorShardEdge));
    u.uColorDeep.value.copy(getColor(c.colorShardDeep));
  };

  return material;
}

/* ==================================================================== */
/* Heat haze (LAYER.DISTORTION)                                          */
/* ==================================================================== */

/**
 * An upright quad turned about world Y to face the camera — a column of air
 * over the copy, not a disc — whose fragment writes a rising, curling offset.
 * The quad's foot is on y = 0 so the mesh's position is the copy's feet.
 */
const HAZE_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;
  varying vec2 vQ;   // x -1..1 across, y 0..1 up

  void main() {
    vec3 centre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 toCam = cameraPosition - centre;
    toCam.y = 0.0;
    toCam = length(toCam) > 1e-4 ? normalize(toCam) : vec3(0.0, 0.0, 1.0);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
    vec3 P = centre + right * position.x * uWidth + vec3(0.0, (position.y + 0.5) * uHeight, 0.0);
    vQ = vec2(position.x * 2.0, position.y + 0.5);
    gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
  }
`;

const HAZE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uShaderIntensity;
  varying vec2 vQ;

  ${noiseGLSL}

  void main() {
    float across = 1.0 - smoothstep(0.55, 1.0, abs(vQ.x));
    float up = smoothstep(0.0, 0.12, vQ.y) * (1.0 - smoothstep(0.6, 1.0, vQ.y));
    float mask = across * up;
    vec3 p = vec3(vQ * uScale, uSeed);
    p.y -= uTime * uSpeed;
    vec2 o = vec2(snoise(p), snoise(p + vec3(19.7, 3.1, 7.3)));
    float strength = uStrength * uShaderIntensity * mask * (0.4 + 0.6 * length(o));
    if (strength < 0.002) discard;
    vec2 dir = normalize(o + vec2(1e-4));
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
  }
`;

export function createMirageHazeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 1.5 },
      uHeight: { value: 2.6 },
      uStrength: { value: 0 },
      uScale: { value: 2.2 },
      uSpeed: { value: 1.4 },
      uSeed: { value: 0 }
    }),
    vertexShader: HAZE_VERTEX,
    fragmentShader: HAZE_FRAGMENT
  });

  /** @param {object} state { strength, seed } — strength 0..1 presence */
  material.userData.sync = (state) => {
    const c = settings.mirage;
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = c.hazeWidth * 0.5;
    u.uHeight.value = c.hazeHeight;
    u.uStrength.value = state.strength * c.hazeStrength * g.distortion;
    u.uScale.value = c.hazeScale * g.noiseFrequency;
    u.uSpeed.value = c.hazeSpeed * g.noiseSpeed;
    u.uSeed.value = state.seed;
  };

  return material;
}

/* ==================================================================== */
/* The burst's shock ring (LAYER.DISTORTION)                             */
/* ==================================================================== */

/**
 * A view-space disc, so its own `position.xy` is already the screen-space
 * direction away from its centre. Two fronts — a hard leading one and a soft
 * echo behind it — so the air reads as having been struck, not inflated.
 */
const SHOCK_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vP;
  void main() {
    vP = position.xy * 2.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize * 2.0;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHOCK_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uFront;
  uniform float uSeed;
  uniform float uShaderIntensity;
  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    if (r > 1.0 || r < 1e-3) discard;
    float wobble = snoise(vec3(vP * 3.0, uTime * 3.0 + uSeed)) * 0.04;
    float lead = exp(-pow((r - uFront + wobble) / 0.06, 2.0));
    float echo = exp(-pow((r - uFront * 0.72 + wobble) / 0.1, 2.0)) * 0.45;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uStrength * uShaderIntensity * (lead + echo) * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4((vP / r) * 0.5 + 0.5, strength, mask);
  }
`;

export function createMirageShockMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 3 },
      uStrength: { value: 0 },
      uFront: { value: 0 },
      uSeed: { value: 0 }
    }),
    vertexShader: SHOCK_VERTEX,
    fragmentShader: SHOCK_FRAGMENT
  });

  /** @param {object} state { strength (0..1 envelope), front (0..1), seed } */
  material.userData.sync = (state) => {
    const c = settings.mirage;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = c.shockSize * 0.5;
    u.uStrength.value = state.strength * c.shockStrength * g.distortion;
    u.uFront.value = state.front;
    u.uSeed.value = state.seed;
  };

  return material;
}
