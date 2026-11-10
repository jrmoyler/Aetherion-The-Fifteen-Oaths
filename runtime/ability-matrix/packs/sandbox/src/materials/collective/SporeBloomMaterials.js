import {
  Color,
  DoubleSide,
  FrontSide,
  MeshDepthMaterial,
  MeshStandardMaterial,
  NormalBlending,
  RGBADepthPacking,
  ShaderMaterial
} from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { patchOnBeforeCompile } from '../../utils/shaderPatch.js';

/**
 * The three bespoke surfaces of the Spore Bloom.
 *
 *   - `createSporeMushroomMaterial` — the mushrooms. A patched
 *     MeshStandardMaterial whose vertex stage *builds* the mushroom from the
 *     unit lathe in `SporeBloomGeometry.js`: stem height, stem and cap radius,
 *     cap height, the bud opening, the sway, the wilt and the droop are all
 *     resolved here from uniforms and one per-instance state vector. The
 *     fragment stage paints the cap's luminous spots, the glowing rim band and
 *     the gills underneath.
 *   - `createSporePodMaterial` — the seed pod lobbed onto the circle: a dark
 *     husk with veins of light pulsing through it.
 *   - `createSporeGroundMaterial` — the mycelium: a network of veins spreading
 *     out of the impact across the floor, with light pulses running outward
 *     along it.
 */

/* ==================================================================== */
/* The mushroom                                                          */
/* ==================================================================== */

/**
 * Shared between the colour pass and the shadow pass, so the shadow is cast by
 * the mushroom that is drawn and not by the unit lathe it is built from.
 *
 * `aState` = (stem grown 0..1, cap open 0..1 with overshoot past 1, wilt 0..1,
 * puff flash 0..1). Everything in metres comes from the uniforms; the instance
 * matrix carries only the placement, the lean out of the clump and the
 * per-mushroom size factor, so it is a rotation plus a uniform scale and the
 * standard normal path stays valid.
 */
const MUSHROOM_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uStemHeight;
  uniform float uStemRadius;
  uniform float uCapRadius;
  uniform float uCapHeight;
  uniform float uDroop;
  uniform float uWiltLean;
  uniform float uSway;
  uniform float uSwaySpeed;

  attribute float aPart;
  attribute float aRadial;
  attribute vec4  aState;
  attribute float aSeed;

  vec3 mPos;
  vec3 mNormal;

  void mushroomVertex() {
    float stemGrow = clamp(aState.x, 0.0, 1.0);
    float open     = max(aState.y, 0.0);
    float opened   = clamp(open, 0.0, 1.0);
    float wilt     = clamp(aState.z, 0.0, 1.0);

    // The stem shoots first, from a stub; the cap is a closed bud riding it.
    float H = uStemHeight * mix(0.06, 1.0, stemGrow);
    float capR = uCapRadius * mix(0.32, 1.0, open);
    float capH = uCapHeight * mix(1.9, 1.0, opened);

    vec3 p;
    vec3 n;
    if (aPart < 0.5) {
      float r = uStemRadius * mix(0.55, 1.0, stemGrow);
      p = vec3(position.x * r, position.y * H, position.z * r);
      // Inverse scale on the normal, so a tall thin stem still shades round.
      n = normalize(vec3(normal.x / r, normal.y / max(H, 1e-3), normal.z / r));
    } else {
      // A bud has its rim curled in round the stem; a wilting cap lets its rim
      // fall. Both are the same displacement — down, by radius² — which is why
      // the wilt reads as the bloom going back the way it came.
      float curl = (1.0 - opened) * 0.85 + wilt * uDroop;
      p = vec3(position.x * capR, position.y * capH, position.z * capR);
      p.y -= curl * capR * aRadial * aRadial;
      p.y += H;
      vec3 sn = vec3(normal.x / capR, normal.y / max(capH, 1e-3), normal.z / capR);
      // The curl tips every facet outward-down by its slope, 2·curl·r.
      sn.y += 2.0 * curl * aRadial * length(normal.xz) / capR;
      n = normalize(sn);
    }

    // Sway and the wilt's bow, both growing with the square of height, so the
    // foot stays planted and the cap does the moving.
    float h = clamp(p.y / max(uStemHeight, 1e-3), 0.0, 1.6);
    float bend = h * h;
    vec2 sway = vec2(
      sin(uTime * uSwaySpeed + aSeed * 6.2831),
      cos(uTime * uSwaySpeed * 0.73 + aSeed * 3.1)
    ) * uSway * (1.0 - wilt);
    p.xz += sway * bend;
    // The wilt bows the whole mushroom over toward its own +x — the instance's
    // random yaw is what makes every one fall a different way.
    float bow = uWiltLean * uStemHeight * wilt * bend;
    p.x += bow;
    p.y -= bow * 0.4;

    mPos = p;
    mNormal = n;
  }
`;

const MUSHROOM_VARYINGS = /* glsl */ `
  varying float vMushPart;
  varying float vMushRadial;
  varying vec3  vMushUnit;
  varying vec4  vMushState;
  varying float vMushSeed;
`;

export function createSporeMushroomMaterial(environment) {
  const material = new MeshStandardMaterial({
    name: 'SporeMushroom',
    color: 0xffffff,
    roughness: 0.55,
    metalness: 0.0,
    // Caps and gills are open strips; their back faces are part of the shape.
    side: DoubleSide
  });

  const uniforms = {
    uTime: frame.uTime,
    uStemHeight: { value: 0.55 },
    uStemRadius: { value: 0.05 },
    uCapRadius: { value: 0.24 },
    uCapHeight: { value: 0.15 },
    uDroop: { value: 0.55 },
    uWiltLean: { value: 0.35 },
    uSway: { value: 0.035 },
    uSwaySpeed: { value: 1.6 },
    uCapGlow: { value: 0.6 },
    uSpotGlow: { value: 2.6 },
    uSpotScale: { value: 4.0 },
    uSpotSize: { value: 0.32 },
    uRimGlow: { value: 2.2 },
    uRimPower: { value: 2.4 },
    uGillGlow: { value: 3.6 },
    uGillCount: { value: 22 },
    uStemGlow: { value: 0.6 },
    uGlowPulse: { value: 0.35 },
    uGlowPulseSpeed: { value: 2.2 },
    uPuffFlash: { value: 2.0 },
    uGlow: { value: 1 },
    uColorCap: { value: new Color() },
    uColorCapTop: { value: new Color() },
    uColorSpot: { value: new Color() },
    uColorRim: { value: new Color() },
    uColorGill: { value: new Color() },
    uColorStem: { value: new Color() },
    uColorStemGlow: { value: new Color() }
  };

  environment.registerShadowCasterWithPatch(
    material,
    (shader) => {
      Object.assign(shader.uniforms, uniforms);

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${MUSHROOM_VERTEX}\n${MUSHROOM_VARYINGS}`)
        .replace(
          '#include <beginnormal_vertex>',
          `mushroomVertex();
           vec3 objectNormal = mNormal;
           vMushPart = aPart;
           vMushRadial = aRadial;
           vMushUnit = position;
           vMushState = aState;
           vMushSeed = aSeed;
           #ifdef USE_TANGENT
             vec3 objectTangent = vec3(tangent.xyz);
           #endif`
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = mPos;');

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform float uCapGlow;
           uniform float uSpotGlow;
           uniform float uSpotScale;
           uniform float uSpotSize;
           uniform float uRimGlow;
           uniform float uRimPower;
           uniform float uGillGlow;
           uniform float uGillCount;
           uniform float uStemGlow;
           uniform float uGlowPulse;
           uniform float uGlowPulseSpeed;
           uniform float uPuffFlash;
           uniform float uGlow;
           uniform vec3  uColorCap;
           uniform vec3  uColorCapTop;
           uniform vec3  uColorSpot;
           uniform vec3  uColorRim;
           uniform vec3  uColorGill;
           uniform vec3  uColorStem;
           uniform vec3  uColorStemGlow;
           ${MUSHROOM_VARYINGS}
           ${noiseGLSL}`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           {
             float ndv = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
             float rim = pow(1.0 - ndv, uRimPower);
             // Two beats at once, so a field of them never pulses in lockstep.
             float pulse = 1.0 + uGlowPulse * (
               sin(uTime * uGlowPulseSpeed + vMushSeed * 6.2831) * 0.7 +
               sin(uTime * uGlowPulseSpeed * 2.3 + vMushSeed * 2.1) * 0.3);
             float wilt = clamp(vMushState.z, 0.0, 1.0);
             vec3 glow = vec3(0.0);

             if (vMushPart < 0.5) {
               /* --- stem: pale, lit from the gills above it --- */
               diffuseColor.rgb *= uColorStem;
               float under = smoothstep(0.4, 1.0, vMushRadial);
               glow = uColorStemGlow * uStemGlow * (0.2 + under * 1.2 + rim * 0.6);
             } else if (vMushPart < 1.5) {
               /* --- cap top: dark, spotted with light, a bright rim band --- */
               vec3 base = mix(uColorCapTop, uColorCap, smoothstep(0.15, 1.0, vMushRadial));
               // Voronoi in the cap's own unit space, so the spots ride the cap
               // as it opens rather than swimming across it.
               vec2 v = voronoi2(vMushUnit.xz * uSpotScale + vMushSeed * 7.0);
               float spot = (1.0 - smoothstep(uSpotSize * 0.5, uSpotSize, v.x)) * step(0.4, v.y);
               spot *= 1.0 - smoothstep(0.7, 0.95, vMushRadial);
               diffuseColor.rgb *= mix(base, uColorSpot * 0.4, spot);
               float band = smoothstep(0.78, 0.98, vMushRadial);
               glow = uColorSpot * spot * uSpotGlow
                    + uColorRim * (band * 0.7 + rim) * uRimGlow
                    + uColorCapTop * uCapGlow;
             } else {
               /* --- gills: the brightest thing in the bloom, seen from below --- */
               float ang = atan(vMushUnit.z, vMushUnit.x);
               float gill = pow(abs(sin(ang * uGillCount * 0.5)), 0.4);
               float deep = smoothstep(0.1, 0.95, vMushRadial);
               diffuseColor.rgb *= uColorGill * 0.25;
               glow = uColorGill * uGillGlow * (0.25 + 0.75 * gill) * mix(1.35, 0.55, deep);
             }

             glow *= pulse * (1.0 - wilt * 0.85) * uGlow;
             // The puff: the whole cap flares as it lets its spores go.
             glow += uColorSpot * vMushState.w * uPuffFlash * step(0.5, vMushPart);
             glow /= 1.0 + glow * 0.25;
             totalEmissiveRadiance += glow;
           }`
        );
    },
    'spore-bloom-mushroom'
  );

  /* ---- the shadow: the same shape, in the depth pass ---- */
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  patchOnBeforeCompile(
    depth,
    (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${MUSHROOM_VERTEX}`)
        .replace('#include <begin_vertex>', 'mushroomVertex();\nvec3 transformed = mPos;');
    },
    'spore-bloom-mushroom-depth'
  );

  material.userData.uniforms = uniforms;
  material.userData.depth = depth;

  material.userData.sync = () => {
    const c = settings.spore;
    const g = settings.global;
    const u = uniforms;

    u.uStemHeight.value = c.stemHeight;
    u.uStemRadius.value = c.stemRadius;
    u.uCapRadius.value = c.capRadius;
    u.uCapHeight.value = c.capHeight;
    u.uDroop.value = c.droop;
    u.uWiltLean.value = c.wiltLean;
    u.uSway.value = c.sway * g.turbulence;
    u.uSwaySpeed.value = c.swaySpeed * g.animationSpeed;
    u.uCapGlow.value = c.capGlow;
    u.uSpotGlow.value = c.spotGlow * g.shaderIntensity;
    u.uSpotScale.value = c.spotScale * g.noiseFrequency;
    u.uSpotSize.value = c.spotSize;
    u.uRimGlow.value = c.rimGlow * g.fresnel;
    u.uRimPower.value = c.rimPower;
    u.uGillGlow.value = c.gillGlow * g.shaderIntensity;
    u.uGillCount.value = Math.max(2, Math.round(c.gillCount));
    u.uStemGlow.value = c.stemGlow;
    u.uGlowPulse.value = c.glowPulse;
    u.uGlowPulseSpeed.value = c.glowPulseSpeed * g.animationSpeed;
    u.uPuffFlash.value = c.puffFlash;
    u.uGlow.value = g.glow;
    u.uColorCap.value.copy(getColor(c.colorCap));
    u.uColorCapTop.value.copy(getColor(c.colorCapTop));
    u.uColorSpot.value.copy(getColor(c.colorSpot));
    u.uColorRim.value.copy(getColor(c.colorRim));
    u.uColorGill.value.copy(getColor(c.colorGill));
    u.uColorStem.value.copy(getColor(c.colorStem));
    u.uColorStemGlow.value.copy(getColor(c.colorStemGlow));
    material.roughness = c.roughness;
  };

  material.userData.sync();
  return material;
}

/* ==================================================================== */
/* The seed pod                                                          */
/* ==================================================================== */

/**
 * A husk with light in its seams. The veins are ridged noise on the pod's own
 * surface normal — welded to it as it tumbles — and a pulse runs along its long
 * axis toward the leading end, so it reads as something alive and about to
 * burst rather than a glowing egg.
 */
const POD_VERTEX = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const POD_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uVeinScale;
  uniform float uGlow;
  uniform float uPulse;
  uniform float uSeed;
  uniform float uFresnel;
  uniform vec3  uColorHusk;
  uniform vec3  uColorVein;
  uniform vec3  uColorHot;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    vec3 dir = normalize(vLocal);
    float ridge = ridged(dir * uVeinScale + uSeed, 4);
    float vein = smoothstep(0.62, 0.9, ridge);
    // Light running along the pod toward its leading (+y) end.
    float run = pow(0.5 + 0.5 * sin(dir.y * 7.0 - uTime * uPulse), 3.0);
    float heat = vein * (0.45 + 0.55 * run);

    float lambert = clamp(dot(N, normalize(uLightDir)), 0.0, 1.0);
    vec3 husk = uColorHusk * (0.35 + 0.75 * lambert);
    husk *= 1.0 - vein * 0.5;

    vec3 glow = mix(uColorVein, uColorHot, run * vein) * heat * uGlow;
    glow += uColorVein * pow(1.0 - ndv, 3.0) * uFresnel;

    gl_FragColor = vec4(husk + glow * uGlobalGlow, 1.0);
  }
`;

export function createSporePodMaterial() {
  const material = new ShaderMaterial({
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uVeinScale: { value: 3.0 },
      uGlow: { value: 2.6 },
      uPulse: { value: 6 },
      uSeed: { value: 0 },
      uFresnel: { value: 0.8 },
      uColorHusk: { value: new Color() },
      uColorVein: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: POD_VERTEX,
    fragmentShader: POD_FRAGMENT
  });

  material.userData.sync = (seed) => {
    const c = settings.spore;
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = seed;
    u.uVeinScale.value = c.podVeinScale * g.noiseFrequency;
    u.uGlow.value = c.podGlow * g.shaderIntensity;
    u.uPulse.value = c.podPulse * g.animationSpeed;
    u.uFresnel.value = 0.8 * g.fresnel;
    u.uColorHusk.value.copy(getColor(c.colorPodHusk));
    u.uColorVein.value.copy(getColor(c.colorPodVein));
    u.uColorHot.value.copy(getColor(c.colorPodHot));
  };

  return material;
}

/* ==================================================================== */
/* The mycelium                                                          */
/* ==================================================================== */

/**
 * A fungal network spreading over the floor, in metres from the impact.
 *
 * Two families of veins, crossed rather than blended:
 *
 *   - a **voronoi edge network** (the bisector construction, as in the ward's
 *     floor) — hyphae branching and meeting at proper junctions, which is what
 *     a mycelial mat looks like from above;
 *   - **radial hyphae** — a handful of thicker runners leaving the impact
 *     point, wandering on noise, which is what makes it read as having grown
 *     *out of* somewhere.
 *
 * The growth front is a radius (`uGrown`, metres, advanced by the ability at
 * `veinSpeed`) broken up with noise so it creeps forward unevenly. Behind it,
 * light pulses run outward along the veins — the bloom's heartbeat — and glowing
 * knots sit on the junctions. Under all of it, a dark moss stain, which is why
 * this is alpha-blended rather than additive: additive light cannot darken the
 * floor, and a network of light on clean stone reads as a decal, not a growth.
 */
const GROUND_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  #define TAU 6.28318530718

  uniform float uTime;
  uniform float uQuadSize;
  uniform float uRadius;
  uniform float uGrown;
  uniform float uFront;
  uniform float uScale;
  uniform float uWarp;
  uniform float uWidth;
  uniform float uTaper;
  uniform float uRadial;
  uniform float uSpokes;
  uniform float uGlowAmt;
  uniform float uNodes;
  uniform float uPulse;
  uniform float uPulseFreq;
  uniform float uPulseSpeed;
  uniform float uPulseSharp;
  uniform float uMoss;
  uniform float uCore;
  uniform float uCoreSize;
  uniform float uDim;
  uniform float uFade;
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3  uColorVein;
  uniform vec3  uColorHot;
  uniform vec3  uColorDeep;
  uniform vec3  uColorMoss;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  /** Distance to the nearest voronoi *edge* (bisector construction). */
  float veinEdge(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    vec2 mg = vec2(0.0);
    vec2 mr = vec2(0.0);
    float md = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)) + uSeed);
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < md) { md = d; mr = r; mg = g; }
      }
    }
    float edge = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = mg + vec2(float(i), float(j));
        vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)) + uSeed);
        vec2 r = g + o - f;
        vec2 diff = r - mr;
        float dd = dot(diff, diff);
        if (dd > 1e-5) edge = min(edge, dot(0.5 * (mr + r), normalize(diff)));
      }
    }
    return edge;
  }

  void main() {
    vec2 p = vec2(vUv.x - 0.5, 0.5 - vUv.y) * uQuadSize;
    float rad = length(p);
    float ang = atan(p.y, p.x);
    float outer = uRadius * 1.12;
    if (rad > outer + 0.2) discard;

    /* ---- the uneven front ---- */
    float creep = fbm3(vec3(normalize(p + 1e-4) * 1.7, uSeed)) * 0.6 * uRadius * 0.3;
    float reach = min(uGrown + creep, outer);
    float grown = smoothstep(reach + 0.05, reach - 0.35, rad);
    if (grown < 0.002) discard;
    float front = exp(-abs(rad - reach) * 5.0) * uFront * step(rad, outer);

    /* ---- the network ---- */
    vec2 warp = vec2(fbm3(vec3(p * 0.6, uSeed)), fbm3(vec3(p * 0.6, uSeed + 9.1))) * uWarp;
    float e = veinEdge((p + warp) * uScale) / uScale;     // metres
    float radial01 = clamp(rad / max(uRadius, 0.05), 0.0, 1.0);
    float width = uWidth * mix(1.0, 1.0 - uTaper, radial01);
    float aa = fwidth(e) + 1e-4;
    float net = 1.0 - smoothstep(width * 0.5, width + aa, e);

    // Runners out of the middle, wandering on noise; their angular distance is
    // turned back into metres so they keep a constant width as they spread.
    float wander = fbm3(vec3(p * 0.45, uSeed + 3.3)) * 1.3;
    float a = ang / TAU * uSpokes + wander;
    float dAng = abs(fract(a + 0.5) - 0.5) / uSpokes * TAU * max(rad, 0.05);
    float runner = (1.0 - smoothstep(width * 0.6, width * 1.4 + aa, dAng)) * uRadial;
    runner *= smoothstep(0.0, 0.3, rad);

    float vein = max(net, runner);

    /* ---- knots on the junctions ---- */
    float knot = pow(snoise01(vec3(p * uScale * 2.2, uSeed * 3.0)), 6.0) *
                 (1.0 - smoothstep(0.0, width * 3.0, e)) * uNodes;

    /* ---- the heartbeat running outward ---- */
    float wave = fract(rad * uPulseFreq - uTime * uPulseSpeed + wander * 0.15);
    float pulse = pow(1.0 - wave, uPulseSharp) * uPulse;
    // Slower, deeper breathing under it.
    float breath = 0.75 + 0.25 * sin(uTime * 1.3 + uSeed);

    /* ---- the heart where the pod rooted ---- */
    float heart = (1.0 - smoothstep(0.0, uCoreSize * uRadius, rad)) * uCore;

    /* ---- put it together ---- */
    float light = (vein * (breath + pulse) + knot + front * vein * 1.5 + heart * (0.6 + pulse)) * uDim;
    vec3 hue = mix(uColorDeep, uColorVein, clamp(vein + knot, 0.0, 1.0));
    hue = mix(hue, uColorHot, clamp(pulse * vein + front * 0.6 + heart * 0.5, 0.0, 1.0));
    vec3 glow = hue * light * uGlowAmt;

    // The stain the network leaves on the stone, densest around the veins.
    float stain = (1.0 - smoothstep(width, width * 7.0, e)) * 0.7 + 0.3 * (1.0 - radial01);
    stain *= uMoss;

    float edgeFade = smoothstep(outer, uRadius * 0.85, rad);
    float alpha = clamp(stain + vein * 0.9 + knot + heart * 0.6, 0.0, 1.0);
    alpha *= grown * edgeFade * uFade * uOpacity;
    if (alpha < 0.004) discard;

    vec3 color = mix(uColorMoss, glow * uGlobalGlow, clamp(vein + knot + heart, 0.0, 1.0));
    color += glow * uGlobalGlow * 0.15;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createSporeGroundMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uQuadSize: { value: 10 },
      uRadius: { value: 3.4 },
      uGrown: { value: 0 },
      uFront: { value: 1.8 },
      uScale: { value: 1.3 },
      uWarp: { value: 0.55 },
      uWidth: { value: 0.045 },
      uTaper: { value: 0.55 },
      uRadial: { value: 0.65 },
      uSpokes: { value: 11 },
      uGlowAmt: { value: 3.2 },
      uNodes: { value: 0.8 },
      uPulse: { value: 1.4 },
      uPulseFreq: { value: 0.9 },
      uPulseSpeed: { value: 1.6 },
      uPulseSharp: { value: 5 },
      uMoss: { value: 0.55 },
      uCore: { value: 1.2 },
      uCoreSize: { value: 0.22 },
      uDim: { value: 1 },
      uFade: { value: 1 },
      uOpacity: { value: 1 },
      uSeed: { value: 0 },
      uColorVein: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorMoss: { value: new Color() }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT
  });

  /** @param {object} state { quadSize, radius, grown, front, dim, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.spore;
    const g = settings.global;
    const u = material.uniforms;

    u.uQuadSize.value = state.quadSize;
    u.uRadius.value = state.radius;
    u.uGrown.value = state.grown;
    u.uFront.value = state.front * c.veinFront;
    u.uDim.value = state.dim;
    u.uFade.value = state.fade;
    u.uSeed.value = state.seed;

    u.uScale.value = c.veinScale * g.noiseFrequency;
    u.uWarp.value = c.veinWarp * g.noiseStrength;
    u.uWidth.value = c.veinWidth;
    u.uTaper.value = c.veinTaper;
    u.uRadial.value = c.veinRadial;
    u.uSpokes.value = Math.max(1, Math.round(c.veinSpokes));
    u.uGlowAmt.value = c.veinGlow * g.shaderIntensity;
    u.uNodes.value = c.veinNodes;
    u.uPulse.value = c.veinPulse;
    u.uPulseFreq.value = c.veinPulseFreq;
    u.uPulseSpeed.value = c.veinPulseSpeed * g.noiseSpeed;
    u.uPulseSharp.value = c.veinPulseSharp;
    u.uMoss.value = c.veinMoss;
    u.uCore.value = c.veinCore;
    u.uCoreSize.value = c.veinCoreSize;
    u.uOpacity.value = c.veinOpacity * g.opacity;

    u.uColorVein.value.copy(getColor(c.colorVein));
    u.uColorHot.value.copy(getColor(c.colorVeinHot));
    u.uColorDeep.value.copy(getColor(c.colorVeinDeep));
    u.uColorMoss.value.copy(getColor(c.colorMoss));
  };

  return material;
}

/* ==================================================================== */
/* The pod's trail                                                       */
/* ==================================================================== */

const TRAIL_VERTEX = /* glsl */ `
  uniform float uWidth;      // metres, half-width at the pod
  attribute vec3  aTangent;
  attribute float aAlong;
  attribute float aSide;
  varying float vAlong;
  varying float vSide;

  void main() {
    vAlong = aAlong;
    vSide = aSide;
    vec3 toCam = normalize(cameraPosition - position);
    vec3 across = cross(normalize(aTangent), toCam);
    float l = length(across);
    across = l > 1e-4 ? across / l : vec3(1.0, 0.0, 0.0);
    // Swells just behind the pod, then thins to a thread at the tail.
    float w = uWidth * (0.55 + 0.9 * smoothstep(0.0, 0.12, aAlong)) * (0.25 + 0.75 * pow(1.0 - aAlong, 0.6));
    vec3 p = position + across * aSide * w;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const TRAIL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uFade;       // 1 in flight → 0 as the trail settles after landing
  uniform float uScroll;
  uniform vec3  uColorHot;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  uniform float uGlobalGlow;
  varying float vAlong;
  varying float vSide;

  ${noiseGLSL}

  void main() {
    float x = vSide;
    float a = vAlong;
    // Spore smoke streaming back off the pod: torn by noise that scrolls down
    // the trail, so it pours rather than sits.
    float n = snoise(vec3(a * 7.0 - uTime * uScroll, x * 1.6, uSeed));
    float n2 = snoise(vec3(a * 19.0 - uTime * uScroll * 1.7, x * 3.0, uSeed + 4.0));
    float body = (1.0 - x * x) * clamp(0.4 + 0.6 * n + 0.3 * n2, 0.0, 1.0);
    float tail = 0.35 + 0.65 * pow(1.0 - a, 1.2);
    float alpha = clamp(body * tail, 0.0, 1.0) * uOpacity * uFade;
    // Four stops down the trail: hot thread at the pod, green body, dark deep.
    // Lit from inside by its own spores, so it reads against a night floor.
    vec3 color = mix(uColorBody * 1.4, uColorDeep, smoothstep(0.45, 1.0, a + n * 0.12));
    float core = exp(-x * x * 6.0) * pow(1.0 - a, 1.1);
    color += uColorHot * core * uGlow * uGlobalGlow;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

/** The lob's trail: dark spore smoke with a hot thread at the pod. */
export function createSporeTrailMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 0.3 },
      uSeed: { value: 0 },
      uGlow: { value: 1.6 },
      uOpacity: { value: 0.9 },
      uFade: { value: 1 },
      uScroll: { value: 3 },
      uColorHot: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: TRAIL_VERTEX,
    fragmentShader: TRAIL_FRAGMENT
  });

  material.userData.sync = (seed, fade) => {
    const c = settings.spore;
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = seed;
    u.uWidth.value = c.podSize * c.podTrailWidth;
    u.uGlow.value = c.podTrailGlow * g.shaderIntensity;
    u.uOpacity.value = c.podTrailOpacity * g.opacity;
    u.uFade.value = fade;
    u.uScroll.value = c.podTrailScroll * g.animationSpeed;
    u.uColorHot.value.copy(getColor(c.colorTrailHot));
    u.uColorBody.value.copy(getColor(c.colorTrailBody));
    u.uColorDeep.value.copy(getColor(c.colorTrailDeep));
  };
  return material;
}
