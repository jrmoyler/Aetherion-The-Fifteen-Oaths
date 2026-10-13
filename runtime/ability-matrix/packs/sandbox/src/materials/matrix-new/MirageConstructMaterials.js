import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
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

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vLocal;       // metres from the feet, before tearing
  varying float vH;           // metres above the feet

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

    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * objectNormal);
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
  uniform vec3  uColorRim;
  uniform vec3  uColorBand;
  uniform vec3  uColorEdge;
  uniform vec3  uTint;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vLocal;
  varying float vH;

  ${noiseGLSL}

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

    if (energy < 0.004) discard;
    gl_FragColor = vec4(color * energy * uGlow * uGlobalGlow, clamp(energy, 0.0, 1.0) * uOpacity);
  }
`;

/**
 * @param {boolean} after build the afterimage variant (offset, single tint)
 */
export function createMirageBodyMaterial(after = false) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
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
      uColorRim: { value: new Color() },
      uColorBand: { value: new Color() },
      uColorEdge: { value: new Color() },
      uTint: { value: new Color() }
    }),
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT
  });

  /**
   * @param {object} state { root, offset, form, breakup, charge, seed, tint, opacity }
   *   `tint` is a settings colour key (afterimages), `opacity` a 0..1 multiplier.
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

    u.uHeight.value = c.bodyHeight;
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
  void main() {
    vFlat = (uv - 0.5) * uQuadSize;
    vFlat.y = -vFlat.y;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
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
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    if (uRadius < 0.01) discard;
    // The heat shimmer bends the rings before they are drawn.
    vec2 p = vFlat;
    vec2 bend = vec2(
      snoise(vec3(p * uShimmerScale, uTime * 0.9 + uSeed)),
      snoise(vec3(p * uShimmerScale + 7.1, uTime * 0.9 + uSeed))
    ) * uShimmer * 0.15;
    float r = length(p + bend) / uRadius;
    if (r > 1.15) discard;

    // Rings of interference running outward; thin, and sharper near the rim.
    float x = r * uRings - uTime * uRingSpeed;
    float ring = 1.0 - smoothstep(0.0, max(uRingWidth * uRings, 0.01), abs(fract(x) - 0.5) * 2.0 * 0.5);
    ring *= 0.35 + 0.65 * r;

    // Thin-film iridescence: the hue walks round with radius and time.
    vec3 film = 0.5 + 0.5 * cos(TAU * (r * 1.7 - uTime * 0.12 + vec3(0.0, 0.33, 0.67)));
    vec3 base = mix(uColorB, uColorA, ring);
    vec3 color = mix(base, base * film * 1.6 + uColorC * 0.2, uIridescence * ring);

    float edge = exp(-pow((r - 1.0) / 0.05, 2.0)) * uEdgeGlow;
    float body = (1.0 - smoothstep(0.82, 1.0, r)) * (0.12 + ring * 0.9);
    float energy = (body + edge) * uFade * (1.0 + uFlare);
    if (energy < 0.003) discard;
    color = mix(color, uColorA, clamp(edge * 0.4, 0.0, 1.0));
    gl_FragColor = vec4(color * energy * uGlow * uGlobalGlow, clamp(energy, 0.0, 1.0) * uOpacity);
  }
`;

export function createMiragePoolMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
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
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() }
    }),
    vertexShader: POOL_VERTEX,
    fragmentShader: POOL_FRAGMENT
  });

  /** @param {object} state { quadSize, radius, fade, flare, seed } */
  material.userData.sync = (state) => {
    const c = settings.mirage;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuadSize.value = state.quadSize;
    u.uRadius.value = state.radius;
    u.uFade.value = state.fade;
    u.uFlare.value = state.flare;
    u.uSeed.value = state.seed;
    u.uRings.value = c.poolRings;
    u.uRingSpeed.value = c.poolRingSpeed * g.noiseSpeed;
    u.uRingWidth.value = c.poolRingWidth;
    u.uIridescence.value = c.poolIridescence;
    u.uShimmer.value = c.poolShimmer * g.noiseStrength;
    u.uShimmerScale.value = c.poolShimmerScale * g.noiseFrequency;
    u.uEdgeGlow.value = c.poolEdgeGlow;
    u.uGlow.value = c.poolGlow * g.glow;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uColorA.value.copy(getColor(c.colorPoolA));
    u.uColorB.value.copy(getColor(c.colorPoolB));
    u.uColorC.value.copy(getColor(c.colorPoolC));
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
