import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import {
  LATTICE_GLSL,
  latticeUniforms,
  syncLatticeUniforms
} from '../../assets/matrix-new/EmberveilLatticeGeometry.js';

/**
 * The four bespoke surfaces of the Emberveil Lattice.
 *
 *   - `createEmberStrandMaterial('core')`  — the burning strand itself: a thin
 *     tube inflated round the lattice path in the vertex stage, white-hot down
 *     the line of sight, orange through its body, red at its silhouette, with
 *     heat pulses running from the anchors to the crown.
 *   - `createEmberStrandMaterial('flame')` — the same path, a fatter tube whose
 *     upward-facing side is torn upward by noise: the flames licking off every
 *     strand. Additive, depth-soft, and faded out at the floor.
 *   - `createEmberFloorMaterial`  — the scorched ring: a charred band round the
 *     circle (normal blending, so it can darken), a crawling ember seam along it,
 *     a molten pool under every anchor and a faint heat wash inside.
 *   - `createEmberHazeMaterial`   — the heat haze over the cage, on
 *     LAYER.DISTORTION (the acid-fume contract).
 *
 * All four read `settings.emberveil` through `userData.sync`, every frame.
 */

/** Must match the geometry the ability builds — the floor loops over anchors. */
export const EMBERVEIL_MAX_STRANDS = 24;

/* ==================================================================== */
/* The strands                                                           */
/* ==================================================================== */

/**
 * Tube inflation from a parameter buffer.
 *
 * The frame is taken from finite differences of the path rather than carried
 * as an attribute, because the path is a uniform: the editor bends it every
 * frame and a baked tangent would lag. `across` is horizontal and
 * perpendicular to the tangent; at the crown, where a strand runs flat, it is
 * still well defined, and where a strand stands straight up out of the floor
 * the fallback picks the radial direction, which is what that ring is facing.
 *
 * The flame variant pushes vertices *up* by noise, weighted by how far the
 * vertex's own outward normal faces up: the top of every strand burns upward,
 * the underside hugs the strand. `vLick` carries that displacement to the
 * fragment so the tips of the tongues cool to red and thin to nothing.
 */
const STRAND_VERTEX = /* glsl */ `
  ${LATTICE_GLSL}

  uniform float uTime;
  uniform float uWidth;      // tube radius, metres
  uniform float uTaper;      // how much thinner the crown is than the roots
  uniform float uLick;       // metres the flame tongues reach (flame only)
  uniform float uLickScale;
  uniform float uLickSpeed;
  uniform float uOrbit;        // phase of the heat wave chasing round the cage
  uniform float uOrbitAmount;

  attribute float aStrand;
  varying float vOrbit;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vWorld;
  varying float vS;
  varying float vStrand;
  varying float vLick;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float s = position.x;
    float i = aStrand;
    vS = s;
    vStrand = i;

    if (i >= uCount) {
      // A strand the editor has switched off: collapse it out of the clip box.
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    const float ds = 0.004;
    vec3 P  = latticePoint(i, s, uTime);
    vec3 Pa = latticePoint(i, clamp(s - ds, 0.0, 1.0), uTime);
    vec3 Pb = latticePoint(i, clamp(s + ds, 0.0, 1.0), uTime);
    vec3 T = normalize(Pb - Pa + vec3(1e-6));

    vec3 radial = P - uCentre;
    radial.y = 0.0;
    radial = length(radial) > 1e-4 ? normalize(radial) : vec3(1.0, 0.0, 0.0);
    vec3 across = cross(T, vec3(0.0, 1.0, 0.0));
    across = length(across) > 1e-3 ? normalize(across) : normalize(cross(T, radial));
    vec3 over = normalize(cross(across, T));

    vec3 n = across * position.y + over * position.z;
    // Thick at the roots, thinner over the crown, pinched to a point in the
    // floor so the strand grows out of the ground instead of standing on it.
    float crown = sin(3.14159265359 * s);
    float root = smoothstep(0.0, 0.035, min(s, 1.0 - s));
    float radius = uWidth * mix(1.0, 1.0 - uTaper, crown) * (0.35 + 0.65 * root);

    vec3 world = P + n * radius;

    // The burn wave: one hot side that chases itself round the cage.
    float bearing = atan(P.z - uCentre.z, P.x - uCentre.x);
    vOrbit = pow(0.5 + 0.5 * cos(bearing - uOrbit), 3.0) * uOrbitAmount;

    float lick = 0.0;
    #ifdef FLAME
      float upness = clamp(n.y * 0.7 + 0.45, 0.0, 1.0);
      float field = snoise(vec3(world.xz * uLickScale, world.y * uLickScale * 0.6 - uTime * uLickSpeed + i * 3.1));
      lick = max(field * 0.5 + 0.55, 0.0) * upness * (1.0 + vOrbit * 0.9);
      world.y += lick * uLick;
      // The tongue narrows as it climbs: pull it back toward the strand axis.
      world -= n * radius * lick * 0.35;
    #endif
    vLick = lick;

    vNormalW = n;
    vWorld = world;
    vViewDir = cameraPosition - world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const STRAND_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uCount;
  uniform float uGrow;        // 0..1 how far the weave has climbed
  uniform float uStagger;     // how much strands differ in when they climb
  uniform float uHeadGlow;    // hot tip on the growth front
  uniform float uDissolve;    // 0..1 the burnt-out strand falling apart
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uCoreSharp;   // how narrow the white-hot line is
  uniform float uPulse;       // heat pulses running to the crown
  uniform float uPulseScale;
  uniform float uPulseSpeed;
  uniform float uFlameNoise;
  uniform float uFlameScale;
  uniform float uFlameSpeed;
  uniform float uFloorFade;   // metres the strand fades out over at the floor
  uniform float uSoftFade;
  uniform float uSurge;       // 0..1 the contraction flaring it up
  uniform vec3  uColorCore;
  uniform vec3  uColorBody;
  uniform vec3  uColorEdge;
  uniform vec3  uColorDeep;   // the dark ember stop
  uniform vec3  uColorChar;   // the charred cord
  uniform float uBurn;        // 0..1 through the burn: cracks widen, flames climb
  uniform float uCrackScale;
  uniform float uCrackWidth;
  uniform vec3  uLightDir;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vWorld;
  varying float vS;
  varying float vStrand;
  varying float vLick;
  varying float vViewZ;
  varying float vOrbit;

  ${noiseGLSL}
  ${commonGLSL}

  float strandHash(float i) { return fract(sin(i * 91.345 + 7.13) * 43758.5453); }

  void main() {
    if (vStrand >= uCount) discard;

    /* --- the weave climbs: from both anchors to the crown --- */
    float h = strandHash(vStrand);
    float st = clamp(uStagger, 0.0, 0.95);
    float grow = clamp((uGrow - h * st) / (1.0 - st), 0.0, 1.0);
    float reach = min(vS, 1.0 - vS) * 2.0;          // 0 at an anchor, 1 at the crown
    if (reach > grow + 0.001) discard;
    float head = smoothstep(grow - 0.12, grow, reach) * step(grow, 0.999) * uHeadGlow;

    /* --- burnt out: the strand breaks into glowing pieces --- */
    float edge = 0.0;
    if (uDissolve > 0.0) {
      float n = snoise(vec3(vS * 9.0, vStrand * 2.7, uTime * 0.3)) * 0.5 + 0.5;
      vec2 dm = dissolveMask(n, uDissolve, 0.12);
      if (dm.x < 0.5) discard;
      edge = dm.y;
    }

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);

    /* --- heat pulses running from the roots to the crown --- */
    float pulse = snoise(vec3(reach * uPulseScale - uTime * uPulseSpeed, vStrand * 1.9, 0.0)) * 0.5 + 0.5;
    pulse = mix(1.0, 0.45 + pulse * 1.1, uPulse);

    vec3 color;
    float alpha;

    #ifdef FLAME
      // Flame: a volume, so density is how directly we look *through* the tube,
      // eroded by a field that streams upward in world space.
      float density = pow(ndv, 1.4);
      vec3 fp = vWorld * uFlameScale - vec3(0.0, uTime * uFlameSpeed, 0.0) + vStrand * 5.3;
      float f = fbm3(fp) * 0.5 + 0.5;
      float tongues = smoothstep(0.25, 0.85, f + (1.0 - vLick) * 0.35);
      density *= mix(1.0, tongues * 1.6, uFlameNoise);
      density *= 1.0 - smoothstep(0.35, 1.0, vLick);  // the tips burn away
      float t = clamp(vLick * 0.9 + (1.0 - density) * 0.4, 0.0, 1.0);
      color = mix(uColorBody, uColorEdge, smoothstep(0.15, 0.85, t));
      color = mix(uColorCore, color, smoothstep(0.0, 0.3, t));
      alpha = clamp(density, 0.0, 1.0) * pulse * (1.0 + vOrbit);
    #else
      // Strand: a charred cord with molten cracks. The cord itself is solid
      // and lit by the scene sun (dark char, an ember-red rim), so the cage
      // carries a true deep stop; the cracks run the four-stop heat ramp
      // (deep → saturated → tint → white-hot) and only the hottest crack
      // centres go over 1 for the bloom. As the cage burns (uBurn) the cracks
      // widen; the contraction (uSurge) opens them right up.
      float diff = clamp(dot(N, normalize(uLightDir)) * 0.6 + 0.4, 0.0, 1.0);
      float rim = pow(1.0 - ndv, 2.5);
      vec3 cp = vWorld * uCrackScale + vec3(0.0, -uTime * 0.25, vStrand * 7.1);
      float ridge = max(1.0 - abs(snoise(cp)), (1.0 - abs(snoise(cp * 2.3 + 11.0))) * 0.9);
      float cw = clamp(uCrackWidth * (0.6 + 0.55 * uBurn) * (1.0 + uSurge * 2.5 + vOrbit * 1.2), 0.001, 0.95);
      float crack = smoothstep(1.0 - cw, 1.0 - cw * 0.2, ridge);
      float t = clamp(crack * pulse * (0.7 + 0.3 * uBurn + vOrbit * 0.5) + uSurge * 0.45 + head * 0.35, 0.0, 1.0);
      vec3 hot = gradient4(uColorDeep, uColorEdge, uColorBody, uColorCore, t);
      float emit = smoothstep(0.03, 0.3, t);
      vec3 charC = uColorChar * (0.3 + 0.9 * diff) + uColorDeep * rim * 1.4 + uColorEdge * rim * rim * 0.9;
      float hdr = mix(1.0, uIntensity * (1.0 + uSurge * 0.6), smoothstep(0.62, 1.0, t));
      color = mix(charC, hot * hdr, emit);
      alpha = 1.0;
    #endif

    #ifdef FLAME
    color += uColorCore * (head + edge * 2.0);
    float energy = uIntensity * (1.0 + uSurge * 1.5);
    #else
      color += uColorBody * head * 1.5 + uColorCore * edge * 2.0;
      float energy = 1.0;
    #endif

    /* --- soft at the floor, soft against the scene --- */
    float floorFade = smoothstep(0.0, max(uFloorFade, 1e-3), vWorld.y);
    alpha *= floorFade;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    #ifdef FLAME
      alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    #endif
    alpha *= uOpacity;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(color * energy * uGlobalGlow, alpha);
  }
`;

/**
 * @param {'core'|'flame'} kind
 */
export function createEmberStrandMaterial(kind) {
  const flame = kind === 'flame';
  const material = new ShaderMaterial({
    defines: flame ? { FLAME: '' } : {},
    transparent: true,
    // The flame is light; the cord is a solid, so it writes depth and the
    // flames behind it are hidden by it.
    depthWrite: !flame,
    depthTest: true,
    blending: flame ? AdditiveBlending : NormalBlending,
    side: flame ? DoubleSide : FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...latticeUniforms(),
      uWidth: { value: 0.06 },
      uTaper: { value: 0.3 },
      uLick: { value: 0 },
      uLickScale: { value: 1 },
      uLickSpeed: { value: 1 },
      uOrbit: { value: 0 },
      uOrbitAmount: { value: 0 },
      uGrow: { value: 0 },
      uStagger: { value: 0.4 },
      uHeadGlow: { value: 2 },
      uDissolve: { value: 0 },
      uIntensity: { value: 3 },
      uOpacity: { value: 1 },
      uCoreSharp: { value: 4 },
      uPulse: { value: 0.5 },
      uPulseScale: { value: 4 },
      uPulseSpeed: { value: 2 },
      uFlameNoise: { value: 0.7 },
      uFlameScale: { value: 2 },
      uFlameSpeed: { value: 2 },
      uFloorFade: { value: 0.3 },
      uSoftFade: { value: 0.2 },
      uSurge: { value: 0 },
      uColorCore: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorEdge: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorChar: { value: new Color() },
      uBurn: { value: 0 },
      uCrackScale: { value: 2 },
      uCrackWidth: { value: 0.2 }
    }),
    vertexShader: STRAND_VERTEX,
    fragmentShader: STRAND_FRAGMENT
  });

  /**
   * @param {object} lattice the shared path state (see `syncLatticeUniforms`)
   * @param {object} state   { grow, dissolve, surge, fade, burn }
   */
  material.userData.sync = (lattice, state) => {
    const c = settings.emberveil;
    const g = settings.global;
    const u = material.uniforms;
    syncLatticeUniforms(u, lattice);

    u.uGrow.value = state.grow;
    u.uDissolve.value = state.dissolve;
    u.uSurge.value = state.surge;
    u.uStagger.value = c.weaveStagger * g.randomness;
    u.uHeadGlow.value = c.weaveHeadGlow;
    u.uPulse.value = c.pulseAmount * g.noiseStrength;
    u.uPulseScale.value = c.pulseScale * g.noiseFrequency;
    u.uPulseSpeed.value = c.pulseSpeed * g.noiseSpeed;
    u.uFloorFade.value = c.floorFade;
    u.uTaper.value = c.strandTaper;
    u.uBurn.value = state.burn ?? 0;
    u.uOrbit.value = state.orbit ?? 0;
    u.uOrbitAmount.value = state.orbitAmount ?? 0;
    u.uColorDeep.value.copy(getColor(c.colorStrandDeep));

    if (flame) {
      u.uWidth.value = c.strandWidth * c.flameWidth;
      // The tongues climb as the cage burns.
      u.uLick.value = c.flameLick * g.turbulence * (1 + c.flameClimb * (state.burn ?? 0));
      u.uLickScale.value = c.flameLickScale * g.noiseFrequency;
      u.uLickSpeed.value = c.flameSpeed * g.noiseSpeed;
      u.uFlameNoise.value = c.flameNoise * g.noiseStrength;
      u.uFlameScale.value = c.flameNoiseScale * g.noiseFrequency;
      u.uFlameSpeed.value = c.flameSpeed * g.noiseSpeed;
      u.uIntensity.value = c.flameIntensity * g.glow * g.shaderIntensity;
      u.uOpacity.value = c.flameOpacity * g.opacity * state.fade;
      u.uSoftFade.value = c.flameSoftFade;
      u.uColorCore.value.copy(getColor(c.colorFlameCore));
      u.uColorBody.value.copy(getColor(c.colorFlameBody));
      u.uColorEdge.value.copy(getColor(c.colorFlameTip));
    } else {
      u.uWidth.value = c.strandWidth;
      u.uCoreSharp.value = c.coreSharpness;
      u.uIntensity.value = c.strandIntensity * g.glow * g.shaderIntensity;
      u.uOpacity.value = c.strandOpacity * g.opacity * state.fade;
      u.uSoftFade.value = c.strandSoftFade;
      u.uColorCore.value.copy(getColor(c.colorStrandCore));
      u.uColorBody.value.copy(getColor(c.colorStrandBody));
      u.uColorEdge.value.copy(getColor(c.colorStrandEdge));
      u.uColorChar.value.copy(getColor(c.colorStrandChar));
      u.uCrackScale.value = c.crackScale * g.noiseFrequency;
      u.uCrackWidth.value = c.crackWidth * g.noiseStrength;
    }
  };

  return material;
}

/* ==================================================================== */
/* The scorched ring                                                     */
/* ==================================================================== */

/**
 * One quad over the circle, everything in metres.
 *
 * Normal blending with an emissive colour, so the same pass can both *char*
 * the floor (dark, partly opaque) and *glow* on it (bright, over 1 for the
 * bloom). Layers, outside in:
 *
 *   - a charred band round the circle, its edges broken by fbm so it reads as
 *     burnt ground rather than a painted ring; it spreads in as the cage burns;
 *   - an ember seam along the circle, a ridged line that crawls round it;
 *   - a molten pool under every anchor — the anchors are recomputed from the
 *     lattice path here, so a pool can never sit anywhere but under its strand;
 *   - a faint heat wash inside, which flares when the cage contracts.
 */
const FLOOR_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  #define MAX_STRANDS ${EMBERVEIL_MAX_STRANDS}
  #define TAU 6.28318530718

  ${LATTICE_GLSL}

  uniform float uTime;
  uniform float uQuadSize;
  uniform float uReveal;
  uniform float uHeat;       // 0..1 how much is still burning
  uniform float uSurge;
  uniform float uFade;
  uniform float uOpacity;
  uniform float uCharWidth;
  uniform float uCharInner;  // how far the char creeps inward, metres
  uniform float uCharDark;
  uniform float uSeamWidth;
  uniform float uSeamGlow;
  uniform float uSeamCrawl;
  uniform float uPoolSize;
  uniform float uPoolGlow;
  uniform float uWash;
  uniform float uNoiseScale;
  uniform float uSeed;
  uniform vec3  uColorChar;
  uniform vec3  uColorSeam;
  uniform vec3  uColorHot;
  uniform vec3  uColorWash;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    // The quad is laid with rotateX(-π/2): v runs against world z.
    vec2 p = vec2(vUv.x - 0.5, 0.5 - vUv.y) * uQuadSize;
    float rad = length(p);
    float ang = atan(p.y, p.x);
    float R = uRadius;
    float aa = fwidth(rad) + 0.01;

    float n = fbm3(vec3(p * uNoiseScale, uSeed));
    float n2 = snoise(vec3(p * uNoiseScale * 3.1, uSeed + 4.0));

    /* ---- the char: a band round the circle that creeps inward ---- */
    float outer = R + uCharWidth * (0.6 + 0.4 * n);
    float inner = R - (uCharWidth + uCharInner * uReveal) * (0.7 + 0.5 * n);
    float charBand = smoothstep(outer + aa, outer - 0.25, rad) * smoothstep(inner - 0.3, inner + aa, rad);
    float charA = charBand * uCharDark * uReveal * (0.75 + 0.25 * n2);

    /* ---- the ember seam crawling round the circle ---- */
    float seamOffset = n * 0.18;
    float seam = smoothstep(uSeamWidth + aa, 0.0, abs(rad - R - seamOffset));
    float crawl = snoise(vec3(cos(ang) * 3.0, sin(ang) * 3.0, uTime * uSeamCrawl + uSeed)) * 0.5 + 0.5;
    seam *= 0.35 + 0.9 * crawl;

    /* ---- molten pools under the anchors ---- */
    float pools = 0.0;
    for (int k = 0; k < MAX_STRANDS; k++) {
      float i = float(k);
      if (i >= uCount) break;
      vec3 a0 = latticePoint(i, 0.0, uTime) - uCentre;
      vec3 a1 = latticePoint(i, 1.0, uTime) - uCentre;
      float d0 = length(p - a0.xz);
      float d1 = length(p - a1.xz);
      float d = min(d0, d1) + n2 * 0.05;
      pools += smoothstep(uPoolSize, 0.0, d);
    }
    pools = clamp(pools, 0.0, 1.5);

    /* ---- the heat wash inside ---- */
    float inside = smoothstep(R + aa, R - 0.6, rad);
    float wash = (0.55 + 0.45 * n) * inside * uWash * (1.0 + uSurge * 3.0);

    vec3 glow = uColorSeam * seam * uSeamGlow
              + mix(uColorSeam, uColorHot, 0.6) * pools * uPoolGlow
              + uColorWash * wash;
    glow *= uHeat * uReveal;
    float glowA = clamp(max(max(seam, pools), wash) * uHeat * uReveal, 0.0, 1.0);

    // Char under, light over: the glow covers the char where it burns.
    float alpha = max(charA, glowA);
    vec3 color = mix(uColorChar, glow, clamp(glowA / max(alpha, 1e-4), 0.0, 1.0));
    alpha *= uFade * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uGlobalGlow, alpha);
  }
`;

export function createEmberFloorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...latticeUniforms(),
      uQuadSize: { value: 12 },
      uReveal: { value: 0 },
      uHeat: { value: 0 },
      uSurge: { value: 0 },
      uFade: { value: 1 },
      uOpacity: { value: 1 },
      uCharWidth: { value: 0.5 },
      uCharInner: { value: 0.8 },
      uCharDark: { value: 0.8 },
      uSeamWidth: { value: 0.06 },
      uSeamGlow: { value: 3 },
      uSeamCrawl: { value: 0.6 },
      uPoolSize: { value: 0.35 },
      uPoolGlow: { value: 3 },
      uWash: { value: 0.1 },
      uNoiseScale: { value: 1.3 },
      uSeed: { value: 0 },
      uColorChar: { value: new Color() },
      uColorSeam: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorWash: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /** @param {object} lattice  @param {object} state { quadSize, reveal, heat, surge, fade, seed } */
  material.userData.sync = (lattice, state) => {
    const c = settings.emberveil;
    const g = settings.global;
    const u = material.uniforms;
    syncLatticeUniforms(u, lattice);
    // The floor marks where the cage *stood*: it does not shrink with it.
    u.uShrink.value = 1;
    u.uCentre.value.set(0, 0, 0);

    u.uQuadSize.value = state.quadSize;
    u.uReveal.value = state.reveal;
    u.uHeat.value = state.heat;
    u.uSurge.value = state.surge;
    u.uFade.value = state.fade;
    u.uSeed.value = state.seed;
    u.uOpacity.value = c.floorOpacity * g.opacity;
    u.uCharWidth.value = c.charWidth;
    // The char creeps inward over the burn, not all at once.
    u.uCharInner.value = c.charCreep * (0.3 + 0.7 * (state.creep ?? 1));
    u.uCharDark.value = c.charDarkness;
    u.uSeamWidth.value = c.seamWidth;
    u.uSeamGlow.value = c.seamGlow * g.shaderIntensity;
    u.uSeamCrawl.value = c.seamCrawl * g.noiseSpeed;
    u.uPoolSize.value = c.poolSize;
    u.uPoolGlow.value = c.poolGlow * g.shaderIntensity;
    u.uWash.value = c.washGlow * g.shaderIntensity;
    u.uNoiseScale.value = c.floorNoiseScale * g.noiseFrequency;
    u.uColorChar.value.copy(getColor(c.colorChar));
    u.uColorSeam.value.copy(getColor(c.colorSeam));
    u.uColorHot.value.copy(getColor(c.colorSeamHot));
    u.uColorWash.value.copy(getColor(c.colorWash));
  };

  return material;
}

/* ==================================================================== */
/* The heat haze — LAYER.DISTORTION                                      */
/* ==================================================================== */

/**
 * A camera-facing quad standing over the cage, writing
 * `vec4(offset * 0.5 + 0.5, strength, mask)` into the distortion buffer.
 *
 * Heat haze is not swirl: it is a fine, fast, *vertical* shimmer. The offset is
 * two noise samples whose field streams upward in world space and is
 * stretched horizontally (wavering columns of hot air), strongest just inside
 * the cage wall and thinning toward the top and the sides.
 */
const HAZE_VERTEX = /* glsl */ `
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

const HAZE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uFalloff;
  uniform float uSeed;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec3 np = vec3(vWorld.x * uScale * 0.6, vWorld.y * uScale * 1.6 - uTime * uSpeed, vWorld.z * uScale * 0.6 + uSeed);
    float nx = snoise(np);
    float ny = snoise(np * 1.3 + vec3(19.3, 7.7, 31.1));

    vec2 c = (vUv - 0.5) * 2.0;
    float mask = (1.0 - smoothstep(0.35, 1.0, abs(c.x)))
               * (1.0 - smoothstep(0.0, 1.0, pow(clamp(vUv.y, 0.0, 1.0), 1.0 / max(uFalloff, 0.05))))
               * smoothstep(0.0, 0.06, vUv.y);

    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    // Mostly vertical: rising air bends light up and down more than sideways.
    gl_FragColor = vec4(vec2(nx * 0.55, ny) * 0.5 + 0.5, strength, mask);
  }
`;

export function createEmberHazeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 8 },
      uHeight: { value: 5 },
      uStrength: { value: 0 },
      uScale: { value: 2 },
      uSpeed: { value: 2 },
      uFalloff: { value: 1 },
      uSeed: { value: 0 }
    }),
    vertexShader: HAZE_VERTEX,
    fragmentShader: HAZE_FRAGMENT
  });

  /** @param {object} state { width, height, strength, seed } */
  material.userData.sync = (state) => {
    const c = settings.emberveil;
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = state.width;
    u.uHeight.value = state.height;
    u.uStrength.value = state.strength * c.hazeStrength * g.distortion;
    u.uScale.value = c.hazeScale * g.noiseFrequency;
    u.uSpeed.value = c.hazeSpeed * g.noiseSpeed;
    u.uFalloff.value = c.hazeFalloff;
    u.uSeed.value = state.seed;
  };

  return material;
}

/* ==================================================================== */
/* The burning thread (travel)                                           */
/* ==================================================================== */

/**
 * The thread the ember spools out of the hand as it flies — the cage's first
 * strand, shown on its way to the circle.
 *
 * The vertex stage lays the tube on the ember's own lob: `s` 0..1 maps to
 * 0..`uFront` metres along the line, at the lob's height there. It writhes a
 * little (more toward the ember). The fragment is the same charred cord as
 * the cage: a dark, sun-lit thread near the hand (it has burnt out there),
 * molten cracks hotter and denser toward the ember, a white-hot tip where it
 * leaves the ember. After the landing the thread burns back from the hand
 * (`uBurnBack` 0..1) with a hot front.
 */
const THREAD_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform float uFront;     // metres from the hand to the ember
  uniform float uSpan;      // the whole throw, metres (the lob is over this)
  uniform float uBaseY;
  uniform float uLob;
  uniform float uWidth;
  uniform float uWrithe;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vWorld;
  varying float vS;

  vec3 threadPoint(float s) {
    float d = s * uFront;
    vec3 p = uOrigin + uDir * d;
    p.y = uBaseY + uLob * sin(3.14159265359 * clamp(d / max(uSpan, 1e-3), 0.0, 1.0));
    vec3 side = normalize(cross(uDir, vec3(0.0, 1.0, 0.0)) + vec3(1e-5));
    p += side * sin(d * 2.3 - uTime * 7.0) * uWrithe * s;
    p.y += cos(d * 1.7 - uTime * 5.0) * uWrithe * 0.6 * s;
    return p;
  }

  void main() {
    float s = position.x;
    vS = s;
    vec3 P = threadPoint(s);
    vec3 T = normalize(threadPoint(min(s + 0.01, 1.0)) - threadPoint(max(s - 0.01, 0.0)) + vec3(1e-6));
    vec3 across = cross(T, vec3(0.0, 1.0, 0.0));
    across = length(across) > 1e-3 ? normalize(across) : vec3(1.0, 0.0, 0.0);
    vec3 over = normalize(cross(across, T));
    vec3 n = across * position.y + over * position.z;
    // Thicker toward the ember, pinched at the hand.
    float radius = uWidth * (0.45 + 0.55 * s) * smoothstep(0.0, 0.03, s);
    vec3 world = P + n * radius;
    vNormalW = n;
    vWorld = world;
    vViewDir = cameraPosition - world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const THREAD_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uFront;
  uniform float uBurnBack;   // 0..1 the thread burning away from the hand after the landing
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uCrackScale;
  uniform vec3  uColorCore;
  uniform vec3  uColorBody;
  uniform vec3  uColorEdge;
  uniform vec3  uColorDeep;
  uniform vec3  uColorChar;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vWorld;
  varying float vS;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    // Burn-back: everything behind the front is gone, the front itself glows.
    float front = uBurnBack * 1.08 - 0.04;
    float wobble = snoise(vec3(vS * 14.0, uTime * 2.0, 3.0)) * 0.03;
    if (vS < front + wobble) discard;
    float edge = 1.0 - smoothstep(0.0, 0.06, vS - front - wobble);
    edge *= step(0.001, uBurnBack);

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = abs(dot(N, V));
    float diff = clamp(dot(N, normalize(uLightDir)) * 0.6 + 0.4, 0.0, 1.0);
    float rim = pow(1.0 - ndv, 2.0);

    // Heat: the fresh end (at the ember) is molten, the old end has cooled.
    float fresh = smoothstep(0.0, 1.0, vS);
    float ridge = 1.0 - abs(snoise(vec3(vS * uFront * uCrackScale, ndv * 2.0, uTime * 0.6)));
    float crack = smoothstep(0.86 - 0.4 * fresh, 0.98, ridge);
    float t = clamp(crack * (0.35 + 0.65 * fresh) + pow(fresh, 6.0) * 0.9 + edge, 0.0, 1.0);
    vec3 hot = gradient4(uColorDeep, uColorEdge, uColorBody, uColorCore, t);
    float emit = smoothstep(0.04, 0.3, t);
    vec3 charC = uColorChar * (0.35 + 0.8 * diff) + uColorDeep * rim * 1.6;
    float hdr = mix(1.0, uIntensity, smoothstep(0.6, 1.0, t));
    vec3 color = mix(charC, hot * hdr, emit);
    float alpha = uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color * uGlobalGlow, alpha);
  }
`;

export function createEmberThreadMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uOrigin: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uFront: { value: 0 },
      uSpan: { value: 1 },
      uBaseY: { value: 1.2 },
      uLob: { value: 1.4 },
      uWidth: { value: 0.05 },
      uWrithe: { value: 0.06 },
      uBurnBack: { value: 0 },
      uIntensity: { value: 3 },
      uOpacity: { value: 1 },
      uCrackScale: { value: 2 },
      uColorCore: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorEdge: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorChar: { value: new Color() }
    }),
    vertexShader: THREAD_VERTEX,
    fragmentShader: THREAD_FRAGMENT
  });

  /** @param {object} state { origin, dir, front, span, baseY, lob, burnBack } */
  material.userData.sync = (state) => {
    const c = settings.emberveil;
    const g = settings.global;
    const u = material.uniforms;
    u.uOrigin.value.copy(state.origin);
    u.uDir.value.copy(state.dir);
    u.uFront.value = state.front;
    u.uSpan.value = state.span;
    u.uBaseY.value = state.baseY;
    u.uLob.value = state.lob;
    u.uBurnBack.value = state.burnBack;
    u.uWidth.value = c.threadWidth;
    u.uWrithe.value = c.threadWrithe * g.turbulence;
    u.uIntensity.value = c.strandIntensity * g.glow * g.shaderIntensity;
    u.uOpacity.value = g.opacity;
    u.uCrackScale.value = c.crackScale * g.noiseFrequency;
    u.uColorCore.value.copy(getColor(c.colorStrandCore));
    u.uColorBody.value.copy(getColor(c.colorStrandBody));
    u.uColorEdge.value.copy(getColor(c.colorStrandEdge));
    u.uColorDeep.value.copy(getColor(c.colorStrandDeep));
    u.uColorChar.value.copy(getColor(c.colorStrandChar));
  };

  return material;
}
