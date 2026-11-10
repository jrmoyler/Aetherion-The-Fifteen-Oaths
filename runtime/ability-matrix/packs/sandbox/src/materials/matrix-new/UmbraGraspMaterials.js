import { Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Umbra Grasp — the four bespoke shaders the shadow is drawn with.
 *
 *  - **the pool of living dark** — a ground quad whose fragment stage is a
 *    signed distance: a noise-lobed disc unioned with a ring of tendrils that
 *    writhe as they reach out past the edge. Inside, the ink is not flat black:
 *    it is a slow polar swirl of two near-blacks with faint violet veins, it
 *    deepens to a true hole wherever the hand is coming up, and it carries a
 *    violet rim light along its edge so a black pool still reads on a dark floor.
 *    Alpha-blended — it *darkens* the stage, it never lights it.
 *  - **the hand** — instanced capsule bones (see `UmbraGraspGeometry`) whose
 *    vertex stage builds each capsule from its own radii and length, boils the
 *    surface with noise, and whose fragment stage *erodes* the silhouette with
 *    rising fbm so the edges are torn smoke while the core stays solid. The body
 *    is opaque and nearly black; the only light it has is a thin violet rim and
 *    embers deep in the smoke. A noise dissolve with a hot violet edge takes it
 *    away at the end. It writes depth, so the floor hides the arm below it.
 *  - **the haze** — the same bones drawn again, inflated, as soft alpha smoke
 *    that feathers to nothing at the silhouette. This is what turns twenty
 *    capsules into one volumetric-looking mass: the seams between bones vanish
 *    under it and the hand has a soft, smoking edge rather than a hard one.
 *  - **the sinking warp** — a camera-facing proxy on LAYER.DISTORTION that pours
 *    the frame slowly *downward* into the pool and winds it, so the air above
 *    the shadow looks like it is being drawn under too.
 *
 * Every material reads `settings.umbra` in `userData.sync(state)`; `state`
 * carries only what the ability knows that settings do not.
 */

/** A ground quad lying in XZ, metres from its own centre. */
const GROUND_VERTEX = /* glsl */ `
  uniform float uQuadSize;
  varying vec2 vFlat;
  varying vec3 vWorld;

  void main() {
    vFlat = (uv - 0.5) * uQuadSize;
    // PlaneGeometry rotated into XZ has its +V running toward -Z.
    vFlat.y = -vFlat.y;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/* -------------------------------------------------------------------- */
/* the pool of living dark                                              */
/* -------------------------------------------------------------------- */

const POOL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGrown;        // metres the body of the pool has spread to
  uniform float uEdgeNoise;
  uniform float uEdgeScale;
  uniform float uFeather;
  uniform float uTendrils;
  uniform float uTendrilCount;
  uniform float uTendrilLength; // metres
  uniform float uTendrilWidth;  // metres
  uniform float uWrithe;
  uniform float uSwirl;
  uniform float uSwirlScale;
  uniform float uSpin;          // radians the ink has turned
  uniform float uRim;
  uniform float uRimWidth;
  uniform float uVeins;
  uniform float uVeinScale;
  uniform float uDepth;
  uniform vec3  uHole;          // xy: where the hand comes up, local metres; z: radius
  uniform float uSeed;
  uniform float uFade;
  uniform float uOpacity;
  uniform vec3  uColorInk;
  uniform vec3  uColorDeep;
  uniform vec3  uColorRim;
  uniform vec3  uColorVein;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  const float TAU = 6.28318530718;

  /** Polynomial smooth minimum, so tendrils grow *out of* the edge. */
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  /** Signed distance to the pool, metres; negative inside. */
  float poolSDF(vec2 p, out float tendrilMask) {
    float r = length(p);
    float a = atan(p.y, p.x);
    vec2 dir = p / max(r, 1e-4);

    // The body: a lobed, slowly breathing disc.
    float n = fbm3(vec3(dir * uEdgeScale, uSeed + uTime * 0.12))
            + 0.3 * snoise(vec3(p * uEdgeScale * 0.7, uSeed + 3.0 + uTime * 0.2));
    float body = r - uGrown * (1.0 + n * uEdgeNoise);

    // The tendrils: one per sector, each reaching its own length past the
    // edge and writhing more the further out it gets.
    tendrilMask = 0.0;
    float d = body;
    if (uTendrils > 0.001 && uTendrilLength > 0.001) {
      float count = max(1.0, floor(uTendrilCount + 0.5));
      float sector = TAU / count;
      float k = floor(a / sector + 0.5);
      float id = mod(k, count) + uSeed * 7.0;
      float reach = uTendrilLength * mix(0.45, 1.0, hash11(id * 3.7)) * uTendrils;
      float out_ = max(r - uGrown * 0.8, 0.0);
      float f = clamp(out_ / max(reach, 1e-3), 0.0, 1.0);
      // Writhe: the tendril's bearing wanders with distance and time.
      float wander = sin(out_ * 3.2 + uTime * 2.1 + id * 5.0) * 0.6
                   + snoise(vec3(out_ * 1.7, uTime * 0.7, id)) * 0.8;
      float centre = (k + (hash11(id) - 0.5) * 0.5) * sector + wander * uWrithe * sector * 0.35 * f;
      float da = a - centre;
      da = mod(da + 0.5 * TAU, TAU) - 0.5 * TAU;
      float tangential = abs(da) * max(r, 1e-3);
      // Tapers to a point; the tip is a little rounded.
      float width = uTendrilWidth * (1.0 - f * f) + 0.004;
      float tendril = max(tangential - width, out_ - reach);
      tendril = max(tendril, uGrown * 0.6 - r);
      tendrilMask = 1.0 - smoothstep(-0.02, 0.02, tendril);
      d = smin(body, tendril, uTendrilWidth * 0.8);
    }
    return d;
  }

  void main() {
    if (uGrown <= 0.001) discard;

    float tendrilMask;
    float d = poolSDF(vFlat, tendrilMask);
    float cover = 1.0 - smoothstep(-uFeather, uFeather, d);
    if (cover < 0.004) discard;

    float r = length(vFlat);

    // The ink: two near-blacks in a slow polar swirl, wound tighter toward the
    // middle so the pool reads as *draining* rather than lying still.
    vec2 q = vFlat * rot2(uSpin + r * uSwirl);
    float swirlN = fbm3(vec3(q * uSwirlScale, uSeed + uTime * 0.15));
    vec3 ink = mix(uColorInk, uColorDeep, smoothstep(-0.2, 0.6, swirlN));

    // Violet veins: ridged filaments, drifting with the swirl.
    float vein = pow(clamp(ridged(vec3(q * uVeinScale, uSeed * 2.0 + uTime * 0.25), 4), 0.0, 1.0), 6.0);
    ink += uColorVein * vein * uVeins * uGlobalGlow;

    // The hole the hand comes out of: a true black, ringed with faint light.
    vec2 hp = vFlat - uHole.xy;
    float hr = length(hp);
    float hole = 1.0 - smoothstep(uHole.z * 0.4, uHole.z * 1.2, hr);
    float holeRim = exp(-abs(hr - uHole.z) / max(uHole.z * 0.25, 1e-3)) * step(0.001, uHole.z);
    ink = mix(ink, vec3(0.0), hole * uDepth);
    ink += uColorRim * holeRim * 0.4 * uRim * uGlobalGlow;

    // Darker toward the middle anyway — depth, not a decal.
    float depthShade = smoothstep(0.0, uGrown * 0.9, -d);
    ink *= mix(1.0, 1.0 - uDepth * 0.7, depthShade);

    // The rim: violet light along the edge and up each tendril.
    float rim = exp(-max(-d, 0.0) / max(uRimWidth, 1e-3)) * (1.0 - smoothstep(0.0, uFeather * 2.0, d));
    float flicker = 0.8 + 0.2 * snoise(vec3(vFlat * 2.0, uTime * 1.5 + uSeed));
    vec3 color = ink + uColorRim * rim * uRim * flicker * uGlobalGlow;

    float alpha = cover * uOpacity * uFade;
    gl_FragColor = vec4(color * uFade, alpha);
  }
`;

/** The spreading pool of living dark. Alpha-blended ground quad. */
export function createUmbraPoolMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uQuadSize: { value: 8 },
      uGrown: { value: 0 },
      uEdgeNoise: { value: 0.25 },
      uEdgeScale: { value: 2.4 },
      uFeather: { value: 0.05 },
      uTendrils: { value: 1 },
      uTendrilCount: { value: 11 },
      uTendrilLength: { value: 1 },
      uTendrilWidth: { value: 0.1 },
      uWrithe: { value: 0.7 },
      uSwirl: { value: 0.4 },
      uSwirlScale: { value: 1.6 },
      uSpin: { value: 0 },
      uRim: { value: 2.5 },
      uRimWidth: { value: 0.09 },
      uVeins: { value: 1 },
      uVeinScale: { value: 2.2 },
      uDepth: { value: 0.8 },
      uHole: { value: new Color(0, 0, 0) },
      uSeed: { value: 0 },
      uFade: { value: 1 },
      uOpacity: { value: 1 },
      uColorInk: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorVein: { value: new Color() }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: POOL_FRAGMENT
  });
  // `uHole` is a vec3 carried in a Color: an allocation-free box three uploads
  // as vec3, written with setRGB(x, z, radius) below.

  /** @param {object} state { quadSize, grown, tendril, spin, holeX, holeZ, holeR, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.umbra;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuadSize.value = state.quadSize ?? 8;
    u.uGrown.value = state.grown ?? 0;
    u.uTendrilLength.value = Math.max(0, state.tendril ?? 0);
    u.uSpin.value = state.spin ?? 0;
    u.uHole.value.setRGB(state.holeX ?? 0, state.holeZ ?? 0, Math.max(0, state.holeR ?? 0));
    u.uFade.value = state.fade ?? 1;
    u.uSeed.value = state.seed ?? 0;
    u.uEdgeNoise.value = c.poolEdgeNoise * g.noiseStrength;
    u.uEdgeScale.value = c.poolEdgeScale * g.noiseFrequency;
    u.uFeather.value = Math.max(0.005, c.poolFeather);
    u.uTendrils.value = c.poolTendrils;
    u.uTendrilCount.value = c.poolTendrilCount;
    u.uTendrilWidth.value = Math.max(0.005, c.poolTendrilWidth);
    u.uWrithe.value = c.poolWrithe * g.turbulence;
    u.uSwirl.value = c.poolSwirl;
    u.uSwirlScale.value = c.poolSwirlScale * g.noiseFrequency;
    u.uRim.value = c.poolRim * g.glow;
    u.uRimWidth.value = Math.max(0.005, c.poolRimWidth);
    u.uVeins.value = c.poolVeins * g.shaderIntensity;
    u.uVeinScale.value = c.poolVeinScale * g.noiseFrequency;
    u.uDepth.value = c.poolDepth;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uColorInk.value.copy(getColor(c.colorPoolInk));
    u.uColorDeep.value.copy(getColor(c.colorPoolDeep));
    u.uColorRim.value.copy(getColor(c.colorPoolRim));
    u.uColorVein.value.copy(getColor(c.colorPoolVein));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the hand — shared vertex stage                                       */
/* -------------------------------------------------------------------- */

/**
 * Builds a capsule from its shape code (see `UmbraGraspGeometry`), boils it,
 * and inflates it by `uInflate` metres — 0 for the solid core, more for the
 * haze shell drawn round it.
 */
const BONE_VERTEX = /* glsl */ `
  attribute vec3 aShape;   // t, h, s
  attribute vec4 aBone;    // rootRadius, tipRadius, length, seed

  uniform float uTime;
  uniform float uBillow;
  uniform float uBillowScale;
  uniform float uFlow;
  uniform float uInflate;
  uniform float uSeed;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vRest;     // world position before the boil — the smoke's frame
  varying float vAlong;    // 0 root .. 1 tip of this bone
  varying float vBoneSeed;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float t = aShape.x;
    float h = aShape.y;
    float s = aShape.z;
    float r0 = aBone.x + uInflate;
    float r1 = aBone.y + uInflate;
    float len = aBone.z;
    float r = mix(r0, r1, t);

    vec2 ring = position.xz;
    vec3 local = vec3(ring.x * r * s, t * len + h * r, ring.y * r * s);
    // The shaft's normal tips toward the thinner end; the caps are spheres.
    float shaft = 1.0 - abs(h);
    vec3 n = vec3(ring.x * s, h + shaft * (r0 - r1) / max(len, 1e-3), ring.y * s);

    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(local, 1.0);
    vec3 nW = normalize(mat3(model) * n);
    vRest = world.xyz;

    // The surface boils: displaced along its normal by noise that climbs.
    float boil = snoise(vec3(world.xyz * uBillowScale + vec3(0.0, -uTime * uFlow, 0.0) + uSeed));
    world.xyz += nW * boil * uBillow;

    vNormalW = nW;
    vWorld = world.xyz;
    vAlong = t;
    vBoneSeed = aBone.w;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

/* -------------------------------------------------------------------- */
/* the hand — solid core                                                */
/* -------------------------------------------------------------------- */

const CORE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uErode;
  uniform float uErodeScale;
  uniform float uFlow;
  uniform float uSoftness;
  uniform float uDensity;
  uniform float uRim;
  uniform float uRimPower;
  uniform float uInner;
  uniform float uVeinScale;
  uniform float uDissolve;      // 0 whole .. 1 gone
  uniform float uEdgeWidth;
  uniform float uEdgeGlow;
  uniform float uFloorCut;      // metres: fragments below this are under the pool
  uniform float uSeed;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  uniform vec3  uColorGlow;
  uniform vec3  uColorEdge;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vRest;
  varying float vAlong;
  varying float vBoneSeed;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    if (vWorld.y < uFloorCut) discard;

    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    // Smoke climbing the hand: sampled in a frame that scrolls upward, so the
    // texture pours *up* out of the pool even while the hand stands still.
    vec3 sp = vRest * uErodeScale + vec3(0.0, -uTime * uFlow * uErodeScale, 0.0) + uSeed;
    float smoke = fbm4(sp) * 0.5 + 0.5;

    // Erosion: the silhouette is eaten, the core is not. The view term makes
    // grazing fragments — the edge of every bone as seen — the ones torn away.
    float edge = 1.0 - smoothstep(0.0, max(uSoftness, 0.02), ndv);
    // Thinner smoke is eaten everywhere, not only at the edge.
    float eat = edge * uErode + (1.0 - uDensity) * 0.7;
    if (smoke < eat) discard;

    // The dissolve: one threshold through the same smoke, with a hot edge.
    float dn = fbm3(vRest * uErodeScale * 1.7 + uSeed * 3.0) * 0.5 + 0.5;
    float threshold = uDissolve * 1.15 - 0.075;
    if (dn < threshold) discard;
    float burn = 1.0 - smoothstep(threshold, threshold + uEdgeWidth, dn);
    burn *= step(0.001, uDissolve);

    // Body: near-black, with a swirl of the deep tone through it.
    float swirl = smoothstep(0.35, 0.75, smoke);
    vec3 color = mix(uColorBody, uColorDeep, swirl);
    // A whisper of the key light so it has form, not just a cut-out.
    float lambert = 0.6 + 0.4 * clamp(dot(N, normalize(uLightDir)), 0.0, 1.0);
    color *= lambert;

    // Embers deep in the smoke: violet, breathing.
    vec3 ep = vRest * uVeinScale + vec3(0.0, -uTime * uFlow * 0.6, uTime * 0.2) + vBoneSeed;
    float ember = pow(clamp(ridged(ep, 4), 0.0, 1.0), 5.0);
    color += uColorGlow * ember * uInner * (0.6 + 0.4 * ndv) * uGlobalGlow;

    // The rim: a thin violet line drawn round every edge, brightest where the
    // erosion is chewing at it.
    float rim = pow(1.0 - ndv, uRimPower) * uRim * (0.6 + 0.8 * (1.0 - smoke));
    color += uColorGlow * rim * uGlobalGlow;

    color += uColorEdge * burn * uEdgeGlow * uGlobalGlow;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * The solid smoke of the hand. Opaque with alpha-test erosion; writes depth.
 * Lives on LAYER.VFX (its vertex stage builds the shape, so it must stay out of
 * the depth prepass's override material).
 */
export function createUmbraHandMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uBillow: { value: 0.05 },
      uBillowScale: { value: 2 },
      uFlow: { value: 0.6 },
      uInflate: { value: 0 },
      uErode: { value: 0.6 },
      uErodeScale: { value: 2 },
      uSoftness: { value: 0.45 },
      uDensity: { value: 1 },
      uRim: { value: 2.5 },
      uRimPower: { value: 2.4 },
      uInner: { value: 1.2 },
      uVeinScale: { value: 2.6 },
      uDissolve: { value: 0 },
      uEdgeWidth: { value: 0.14 },
      uEdgeGlow: { value: 4 },
      uFloorCut: { value: -0.02 },
      uSeed: { value: 0 },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorEdge: { value: new Color() }
    }),
    vertexShader: BONE_VERTEX,
    fragmentShader: CORE_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {object} state { dissolve, seed } */
  material.userData.sync = (state) => {
    const c = settings.umbra;
    const g = settings.global;
    const u = material.uniforms;
    const scale = Math.max(0.05, c.handScale);
    u.uDissolve.value = state.dissolve ?? 0;
    u.uSeed.value = state.seed ?? 0;
    u.uBillow.value = c.handBillow * scale * g.noiseStrength;
    u.uBillowScale.value = (c.handErodeScale / scale) * g.noiseFrequency;
    u.uFlow.value = c.handFlow * g.noiseSpeed;
    u.uErode.value = c.handErode * g.shaderIntensity;
    u.uErodeScale.value = (c.handErodeScale / scale) * g.noiseFrequency;
    u.uSoftness.value = c.handSoftness;
    u.uDensity.value = c.handOpacity * g.opacity;
    u.uRim.value = c.handRim * g.fresnel * g.glow;
    u.uRimPower.value = c.handRimPower;
    u.uInner.value = c.handInnerGlow * g.glow;
    u.uVeinScale.value = (c.handVeinScale / scale) * g.noiseFrequency;
    u.uEdgeWidth.value = Math.max(0.005, c.handDissolveEdge);
    u.uEdgeGlow.value = c.handEdgeGlow;
    u.uFloorCut.value = c.poolHeight - 0.03;
    u.uColorBody.value.copy(getColor(c.colorHandBody));
    u.uColorDeep.value.copy(getColor(c.colorHandDeep));
    u.uColorGlow.value.copy(getColor(c.colorHandGlow));
    u.uColorEdge.value.copy(getColor(c.colorHandEdge));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the hand — haze shell                                                */
/* -------------------------------------------------------------------- */

const HAZE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFlow;
  uniform float uErodeScale;
  uniform float uDensity;
  uniform float uDissolve;
  uniform float uFloorCut;
  uniform float uSoftFade;
  uniform float uSeed;
  uniform vec3  uColorBody;
  uniform vec3  uColorGlow;
  uniform float uRim;
  uniform float uGlobalGlow;
  uniform sampler2D uSceneDepth;
  uniform vec2  uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vRest;
  varying float vAlong;
  varying float vBoneSeed;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    if (vWorld.y < uFloorCut) discard;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = abs(dot(N, V));

    // Thick toward the middle of the shell, nothing at its silhouette — so the
    // shell is a soft fringe round the solid hand, never an outline.
    float body = smoothstep(0.0, 0.85, ndv);

    vec3 sp = vRest * uErodeScale * 0.8 + vec3(0.0, -uTime * uFlow * uErodeScale * 1.3, 0.0) + uSeed + 11.0;
    float smoke = fbm4(sp) * 0.5 + 0.5;
    float wisps = smoothstep(0.35, 0.8, smoke);

    // As the hand dissolves, its haze thickens before it goes: it turns *to*
    // smoke rather than simply vanishing.
    float swell = 1.0 + uDissolve * 1.6;
    float alpha = body * wisps * uDensity * swell * (1.0 - smoothstep(0.6, 1.0, uDissolve));

    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.004) discard;

    vec3 color = uColorBody + uColorGlow * pow(1.0 - ndv, 3.0) * uRim * 0.25 * uGlobalGlow;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

/** The soft smoke fringe drawn round the hand. Alpha-blended, no depth write. */
export function createUmbraHazeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uBillow: { value: 0.08 },
      uBillowScale: { value: 1.5 },
      uFlow: { value: 0.6 },
      uInflate: { value: 0.1 },
      uErodeScale: { value: 2 },
      uDensity: { value: 0.6 },
      uDissolve: { value: 0 },
      uFloorCut: { value: -0.02 },
      uSoftFade: { value: 0.3 },
      uSeed: { value: 0 },
      uRim: { value: 2 },
      uColorBody: { value: new Color() },
      uColorGlow: { value: new Color() }
    }),
    vertexShader: BONE_VERTEX,
    fragmentShader: HAZE_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {object} state { dissolve, seed } */
  material.userData.sync = (state) => {
    const c = settings.umbra;
    const g = settings.global;
    const u = material.uniforms;
    const scale = Math.max(0.05, c.handScale);
    u.uDissolve.value = state.dissolve ?? 0;
    u.uSeed.value = state.seed ?? 0;
    u.uInflate.value = c.hazeInflate * scale;
    u.uBillow.value = c.handBillow * 1.8 * scale * g.noiseStrength;
    u.uBillowScale.value = (c.handErodeScale * 0.7 / scale) * g.noiseFrequency;
    u.uFlow.value = c.handFlow * g.noiseSpeed;
    u.uErodeScale.value = (c.handErodeScale / scale) * g.noiseFrequency;
    u.uDensity.value = c.hazeDensity * g.opacity;
    u.uFloorCut.value = c.poolHeight - 0.03;
    u.uSoftFade.value = c.hazeSoftFade;
    u.uRim.value = c.handRim * g.fresnel;
    u.uColorBody.value.copy(getColor(c.colorHandDeep));
    u.uColorGlow.value.copy(getColor(c.colorHandGlow));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the sinking warp                                                     */
/* -------------------------------------------------------------------- */

const WARP_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;

  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    // Camera-facing, standing on its own bottom edge: the object origin is
    // the middle of the pool, so the quad is lifted by half its height.
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 corner = position.xy * vec2(uWidth, uHeight);
    corner.y += uHeight * 0.5;
    mv.xy += corner;
    // World position for the noise, so the warp is welded to the stage.
    vWorld = (modelMatrix * vec4(corner.x, corner.y, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSink;
  uniform float uSeed;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    // Noise that pours *downward*: the field scrolls down through the air,
    // and the offset it writes points down too — the frame is drawn under.
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale * 0.6 + uTime * uSpeed + uSeed);
    float nx = snoise(np);
    float ny = snoise(np + vec3(13.1, 5.7, 27.3));
    vec2 dir = normalize(vec2(nx, ny - uSink * 1.5) + 1e-5);

    vec2 c = (vUv - 0.5) * 2.0;
    // Strongest just above the pool, thinning with height, feathered at the
    // sides and the very bottom so the proxy never prints a border.
    float mask = (1.0 - smoothstep(0.35, 1.0, abs(c.x)))
               * (1.0 - smoothstep(0.0, 1.0, vUv.y))
               * smoothstep(0.0, 0.06, vUv.y);

    float strength = uStrength * uShaderIntensity * mask * (0.6 + 0.4 * abs(nx));
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
  }
`;

/** Screen-space downward warp over the pool, for LAYER.DISTORTION. */
export function createUmbraWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 4 },
      uHeight: { value: 3 },
      uStrength: { value: 1 },
      uScale: { value: 1.5 },
      uSpeed: { value: 0.7 },
      uSink: { value: 1 },
      uSeed: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} state { width, strength, seed } */
  material.userData.sync = (state) => {
    const c = settings.umbra;
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = Math.max(0.1, state.width ?? 4);
    u.uHeight.value = Math.max(0.1, c.warpHeight);
    u.uStrength.value = (state.strength ?? 1) * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
    u.uSink.value = c.warpSink;
    u.uSeed.value = state.seed ?? 0;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the ink sleeve — the pool climbing a held body and dragging it under  */
/* -------------------------------------------------------------------- */

const SLEEVE_VERTEX = /* glsl */ `
  attribute vec4 aSleeve;   // radius, height (metres), seed, open 0..1
  uniform float uTime;
  uniform float uFlare;
  uniform float uWrithe;
  uniform float uFlow;
  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vSeed;
  varying float vOpen;
  ${noiseGLSL}
  void main() {
    vUv = uv;
    float y = position.y;
    float R = aSleeve.x;
    float H = max(aSleeve.y, 0.01);
    float seed = aSleeve.z;
    // The base spreads out into the pool; the throat narrows round the body.
    float flare = 1.0 + uFlare * pow(1.0 - y, 3.0);
    float wob = snoise(vec3(position.x * 1.4 + seed, position.z * 1.4, y * 2.5 - uTime * uFlow));
    float r = R * flare * (1.0 + 0.2 * wob);
    vec3 local = vec3(position.x * r, y * H, position.z * r);
    // The lip writhes: the higher up the sleeve, the more it sways.
    local.x += sin(uTime * 2.3 + seed + y * 3.0) * uWrithe * y * y * R;
    local.z += cos(uTime * 1.9 + seed * 1.7 + y * 2.0) * uWrithe * y * y * R;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(local, 1.0);
    // Outward and a little up where the base flares.
    vec3 n = normalize(vec3(position.x, 3.0 * uFlare * R * pow(1.0 - y, 2.0) / H, position.z));
    vNormalW = normalize(mat3(model) * n);
    vWorld = world.xyz;
    vSeed = seed;
    vOpen = aSleeve.w;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SLEEVE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFlow;
  uniform float uRagged;
  uniform float uTendrils;
  uniform float uRim;
  uniform float uLip;
  uniform vec3  uColorInk;
  uniform vec3  uColorDeep;
  uniform vec3  uColorRim;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vSeed;
  varying float vOpen;
  ${noiseGLSL}
  void main() {
    float ang = vUv.x * 6.28318;
    // A ragged top: tongues of ink reaching up the body between the bites.
    float tongue = pow(0.5 + 0.5 * sin(ang * uTendrils + vSeed * 4.0 + 1.5 * snoise(vec3(vUv.x * 4.0, uTime * 0.7, vSeed))), 2.5);
    float top = 1.0 - uRagged * (1.0 - tongue) - 0.06 * snoise(vec3(vUv.x * 18.0, uTime, vSeed));
    if (vUv.y > top) discard;
    // Opening and closing: the same noise eats it from the top down.
    float dn = snoise(vec3(vUv.x * 7.0, vUv.y * 5.0, vSeed * 2.0)) * 0.5 + 0.5;
    if (dn * 0.35 + (1.0 - vUv.y) * 0.65 < 1.0 - vOpen) discard;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float facing = dot(N, V);
    float ndv = abs(facing);
    // Ink pouring *down* the sleeve: it is going under, taking what it holds.
    float flow = snoise(vec3(ang * 1.5, vUv.y * 4.0 + uTime * uFlow * 2.0, vSeed)) * 0.5 + 0.5;
    vec3 color = mix(uColorInk, uColorDeep, smoothstep(0.45, 0.9, flow));
    color *= 0.65 + 0.35 * clamp(dot(N, normalize(uLightDir)), 0.0, 1.0);
    // Inside the sleeve is the hole: darker still.
    if (facing < 0.0) color *= 0.35;
    // A thin violet rim, and a glowing lip along the ragged top.
    color += uColorRim * pow(1.0 - ndv, 3.0) * uRim * uGlobalGlow;
    float lip = smoothstep(top - 0.1, top, vUv.y);
    color += uColorRim * lip * uLip * (0.6 + 0.4 * flow) * uGlobalGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** The ink sleeve: opaque, alpha-tested, writes depth; violet only at its rim and lip. */
export function createUmbraSleeveMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFlare: { value: 1.4 },
      uWrithe: { value: 0.25 },
      uFlow: { value: 0.8 },
      uRagged: { value: 0.35 },
      uTendrils: { value: 5 },
      uRim: { value: 1.6 },
      uLip: { value: 2.2 },
      uColorInk: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: SLEEVE_VERTEX,
    fragmentShader: SLEEVE_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {object} state { time } */
  material.userData.sync = (state) => {
    const c = settings.umbra;
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time ?? 0;
    u.uFlare.value = c.sleeveFlare;
    u.uWrithe.value = c.sleeveWrithe * g.turbulence;
    u.uFlow.value = c.sleeveFlow * g.noiseSpeed;
    u.uRagged.value = c.sleeveRagged;
    u.uTendrils.value = Math.round(c.sleeveTendrils);
    u.uRim.value = c.sleeveRim * g.fresnel * g.glow;
    u.uLip.value = c.sleeveLip * g.glow;
    u.uColorInk.value.copy(getColor(c.colorSleeveInk));
    u.uColorDeep.value.copy(getColor(c.colorSleeveDeep));
    u.uColorRim.value.copy(getColor(c.colorSleeveRim));
  };
  return material;
}
