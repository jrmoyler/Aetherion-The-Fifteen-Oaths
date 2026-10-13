import { Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector2, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Hourglass Sunder — the bespoke surfaces.
 *
 *  - `createHourglassGlassMaterial` — the ghost glass. Transparent, two-sided:
 *    a Schlick-ish **fresnel** that is almost clear head-on and silvered at the
 *    silhouette; the sky **reflected** and **refracted** through it (two
 *    samples of `frame.uEnvMap`, the second bent by `refract` at the glass's
 *    IOR); ghostly bands of light climbing the bulbs; pin glints; a
 *    **materialise** dissolve with a gold burning edge; and **cracks** — F2−F1
 *    cell edges on the bulb's cylindrical unwrap, spreading from a point as the
 *    sand runs out, hot and bright, until it bursts.
 *  - `createHourglassLensMaterial` — the same bulbs on `LAYER.DISTORTION`:
 *    the screen offset is the glass's own view-space normal, strongest at the
 *    silhouette, so the world behind the hourglass is genuinely bent by it.
 *  - `createHourglassBrassMaterial` — the frame and the clockwork. Metal: the
 *    sky reflected and tinted by the brass, a hard sun glint, a dark patina in
 *    the noise, engraved rings, a ghostly fresnel glow, and the same
 *    materialise / dissolve as the glass.
 *  - `createHourglassSandMaterial` — the sand inside, drawn on the bulb's own
 *    inner surface and cut by **levels** the CPU computes from a volume table.
 *    Back faces are painted as the sand's free surface (the classic
 *    "liquid in a bottle" trick), so a hollow shell reads as a solid mass.
 *    The top surface dimples into a funnel as it drains; the bottom heaps into
 *    a cone.
 *  - `createSandStreamMaterial` — the thread of sand falling through the neck.
 *  - `createClockFaceMaterial` — the dial on the floor: rings, minute and
 *    hour ticks, diamond markers, a counter-turning escapement ring, two
 *    ticking hands, the elapsed sector greying over as the sand runs, and the
 *    sand spilled across it at the end.
 *  - `createShardMaterial` — the instanced glass the hourglass bursts into.
 *
 * Every material reads `settings.hourglass` in `userData.sync()`.
 */

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/** F2 − F1 Voronoi: 0 on a cell border. */
const EDGES_GLSL = /* glsl */ `
  float cellEdges(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; }
        else if (d < d2) { d2 = d; }
      }
    }
    return sqrt(d2) - sqrt(d1);
  }
`;

/**
 * The materialise / dissolve both the glass and the brass share.
 * `reveal` 0 → nothing, 1 → whole. Returns vec2(visible, burning edge).
 */
const REVEAL_GLSL = /* glsl */ `
  vec2 revealMask(float n, float reveal, float edge) {
    float t = reveal * (1.0 + edge);
    float vis = 1.0 - smoothstep(t - edge, t, n);
    float rim = smoothstep(t - edge, t - edge * 0.3, n) * vis;
    return vec2(vis, rim);
  }
`;

const LIT_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;

  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/* ==================================================================== */
/* Ghost glass                                                           */
/* ==================================================================== */

const GLASS_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec3  uTint;
  uniform vec3  uRimColor;
  uniform vec3  uCrackColor;
  uniform vec3  uRevealColor;
  uniform float uOpacity;
  uniform float uFresnel;
  uniform float uFresnelPow;
  uniform float uEnv;
  uniform float uRefract;
  uniform float uIOR;
  uniform float uRimGlow;
  uniform float uShimmer;
  uniform float uShimmerScale;
  uniform float uSparkle;
  uniform float uFlicker;
  uniform float uCrack;        // 0..1 how far the cracks have spread
  uniform vec3  uCrackOrigin;  // local
  uniform float uCrackScale;
  uniform float uCrackWidth;
  uniform float uCrackGlow;
  uniform float uHalf;         // half-height, local metres
  uniform float uReveal;
  uniform float uRevealEdge;
  uniform float uFade;
  uniform float uSeed;

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;

  ${noiseGLSL}
  ${ENV_GLSL}
  ${EDGES_GLSL}
  ${REVEAL_GLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
    float F = clamp(pow(1.0 - ndv, uFresnelPow) * uFresnel, 0.0, 1.5);

    // Materialise out of noise, a gold edge burning where it forms.
    float rn = snoise01(vLocal * 1.7 + uSeed);
    vec2 rv = revealMask(rn, uReveal, uRevealEdge);
    if (rv.x < 0.01) discard;

    vec3 refl = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;
    vec3 refr = texture2D(uEnvMap, equirectUv(refract(-V, N, 1.0 / max(uIOR, 1.0)))).rgb;

    // Ghost light climbing the bulbs.
    float sh = snoise(vec3(vLocal.xz * uShimmerScale, vLocal.y * uShimmerScale * 0.5 - uTime * 0.6 + uSeed));
    float bands = smoothstep(0.55, 1.0, sin(vLocal.y * 5.0 - uTime * 2.2 + sh * 2.5) * 0.5 + 0.5);
    float flick = 1.0 - uFlicker * (0.5 + 0.5 * snoise(vec3(uTime * 3.1, uSeed, 0.0)));

    // Pin glints that wander over the glass.
    float spark = pow(snoise01(vLocal * 22.0 + vec3(0.0, uTime * 0.35, 0.0)), 22.0) * uSparkle * 6.0;

    // Cracks on the cylindrical unwrap, spreading from the origin.
    float ang = atan(vLocal.z, vLocal.x);
    vec2 cp = vec2(ang * 0.9, vLocal.y / max(uHalf, 0.1) * 1.6) * uCrackScale + uSeed;
    float e = cellEdges(cp);
    float reach = uCrack * uHalf * 2.6;
    float d = length(vLocal - uCrackOrigin);
    float spread = 1.0 - smoothstep(reach * 0.75, reach, d + snoise(vLocal * 3.0) * 0.25);
    float crack = (1.0 - smoothstep(uCrackWidth * 0.3, uCrackWidth, e)) * spread * step(0.001, uCrack);
    // Long radial fractures off the origin as well.
    float radial = smoothstep(0.93, 0.995, ridged(vec3(cp * 0.6, uSeed), 4)) * spread;
    crack = max(crack, radial);

    vec3 color = uTint * (0.06 + refr * uRefract)
               + refl * uEnv * (0.15 + F)
               + uRimColor * F * uRimGlow
               + uRimColor * bands * uShimmer * 0.5
               + uRimColor * spark
               + uCrackColor * crack * uCrackGlow * (1.0 + uCrack)
               + uRevealColor * rv.y * 3.0;
    color *= uGlobalGlow * uShaderIntensity * flick;

    float alpha = uOpacity + F * 0.55 + bands * uShimmer * 0.12 + spark * 0.3 + crack * 0.8 + rv.y;
    alpha = clamp(alpha, 0.0, 1.0) * rv.x * uFade * flick;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createHourglassGlassMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uTint: { value: new Color() },
      uRimColor: { value: new Color() },
      uCrackColor: { value: new Color() },
      uRevealColor: { value: new Color() },
      uOpacity: { value: 0.1 },
      uFresnel: { value: 1.5 },
      uFresnelPow: { value: 3 },
      uEnv: { value: 1 },
      uRefract: { value: 0.3 },
      uIOR: { value: 1.25 },
      uRimGlow: { value: 1.5 },
      uShimmer: { value: 0.35 },
      uShimmerScale: { value: 2 },
      uSparkle: { value: 1 },
      uFlicker: { value: 0.15 },
      uCrack: { value: 0 },
      uCrackOrigin: { value: new Vector3() },
      uCrackScale: { value: 3.5 },
      uCrackWidth: { value: 0.035 },
      uCrackGlow: { value: 3 },
      uHalf: { value: 1.7 },
      uReveal: { value: 1 },
      uRevealEdge: { value: 0.08 },
      uFade: { value: 1 },
      uSeed: { value: 0 }
    }),
    vertexShader: LIT_VERTEX,
    fragmentShader: GLASS_FRAGMENT
  });

  /** @param {object} s { reveal, crack, crackOrigin, fade, half, seed } */
  material.userData.sync = (s) => {
    const c = settings.hourglass;
    const g = settings.global;
    const u = material.uniforms;
    u.uTint.value.copy(getColor(c.glassTint));
    u.uRimColor.value.copy(getColor(c.glassRim));
    u.uCrackColor.value.copy(getColor(c.colorCrack));
    u.uRevealColor.value.copy(getColor(c.colorReveal));
    u.uOpacity.value = c.glassOpacity * g.opacity;
    u.uFresnel.value = c.glassFresnel * g.fresnel;
    u.uFresnelPow.value = c.glassFresnelPower;
    u.uEnv.value = c.glassEnv;
    u.uRefract.value = c.glassRefract;
    u.uIOR.value = c.glassIOR;
    u.uRimGlow.value = c.glassRimGlow * g.glow;
    u.uShimmer.value = c.glassShimmer * g.noiseStrength;
    u.uShimmerScale.value = c.glassShimmerScale * g.noiseFrequency;
    u.uSparkle.value = c.glassSparkle;
    u.uFlicker.value = c.ghostFlicker;
    u.uCrack.value = s.crack;
    u.uCrackOrigin.value.copy(s.crackOrigin);
    u.uCrackScale.value = c.crackScale * g.noiseFrequency;
    u.uCrackWidth.value = c.crackWidth;
    u.uCrackGlow.value = c.crackGlow * g.glow;
    u.uHalf.value = s.half;
    u.uReveal.value = s.reveal;
    u.uRevealEdge.value = c.revealEdge;
    u.uFade.value = s.fade;
    u.uSeed.value = s.seed;
  };

  return material;
}

/* ==================================================================== */
/* The glass, bending the world (LAYER.DISTORTION)                       */
/* ==================================================================== */

const LENS_VERTEX = /* glsl */ `
  varying vec3 vViewN;
  varying vec3 vViewDir;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewN = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uShaderIntensity;

  varying vec3 vViewN;
  varying vec3 vViewDir;

  void main() {
    vec3 n = normalize(vViewN);
    if (!gl_FrontFacing) n = -n;
    float ndv = clamp(abs(dot(n, normalize(vViewDir))), 0.0, 1.0);
    // A lens is flat head-on and bends hardest at the rim.
    float rim = pow(1.0 - ndv, 1.5);
    float s = uStrength * uShaderIntensity * (0.25 + 0.75 * rim);
    if (s < 0.002) discard;
    gl_FragColor = vec4(n.xy * 0.5 + 0.5, s, 1.0);
  }
`;

export function createHourglassLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({ uStrength: { value: 0 } }),
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {number} level 0..1 how much glass there is to bend through */
  material.userData.sync = (level) => {
    material.uniforms.uStrength.value = level * settings.hourglass.distortStrength * settings.global.distortion;
  };

  return material;
}

/* ==================================================================== */
/* Brass                                                                 */
/* ==================================================================== */

const BRASS_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  uniform vec3  uBrass;
  uniform vec3  uBrassDark;
  uniform vec3  uGhost;
  uniform vec3  uRevealColor;
  uniform float uMetal;
  uniform float uEnv;
  uniform float uSpecular;
  uniform float uGloss;
  uniform float uEngrave;
  uniform float uEngraveScale;
  uniform float uPatina;
  uniform float uGhostGlow;
  uniform float uFlicker;
  uniform float uReveal;
  uniform float uRevealEdge;
  uniform float uSeed;

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;

  ${noiseGLSL}
  ${ENV_GLSL}
  ${REVEAL_GLSL}

  void main() {
    float rn = snoise01(vLocal * 2.1 + uSeed + 5.0);
    vec2 rv = revealMask(rn, uReveal, uRevealEdge);
    if (rv.x < 0.5) discard;

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (dot(N, V) < 0.0) N = -N;

    // Engraved rings round the axis and a hammered roughness.
    float rr = length(vLocal.xz);
    float rings = smoothstep(0.75, 1.0, abs(sin(rr * uEngraveScale * 6.2831 + vLocal.y * uEngraveScale * 2.0)));
    float ham = snoise(vLocal * 9.0);
    N = normalize(N + vec3(ham, snoise(vLocal * 9.0 + 7.0), snoise(vLocal * 9.0 + 13.0)) * 0.03);

    float patina = smoothstep(0.2, 0.8, snoise01(vLocal * 3.0 + uSeed) ) * uPatina;
    vec3 base = mix(uBrass, uBrassDark, patina);
    base *= 1.0 - rings * uEngrave * 0.55;

    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;
    vec3 F0 = mix(vec3(0.04), base, uMetal);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
    vec3 color = base * (1.0 - uMetal) * (0.2 + 0.8 * max(dot(N, L), 0.0));
    color += env * F * uEnv;
    color += base * pow(max(dot(N, H), 0.0), uGloss) * uSpecular;
    // Lift the brass off a dark stage: a warm floor of light so it never goes black.
    color += base * 0.12;

    // Ghostly: the frame is half spirit — a fresnel glow, flickering.
    float flick = 1.0 - uFlicker * (0.5 + 0.5 * snoise(vec3(uTime * 2.7, uSeed * 3.0, 1.0)));
    float rim = pow(1.0 - ndv, 2.5);
    color += uGhost * rim * uGhostGlow * flick * uGlobalGlow;
    color += uRevealColor * rv.y * 4.0 * uGlobalGlow;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createHourglassBrassMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uBrass: { value: new Color() },
      uBrassDark: { value: new Color() },
      uGhost: { value: new Color() },
      uRevealColor: { value: new Color() },
      uMetal: { value: 0.85 },
      uEnv: { value: 1.2 },
      uSpecular: { value: 2.5 },
      uGloss: { value: 60 },
      uEngrave: { value: 0.5 },
      uEngraveScale: { value: 6 },
      uPatina: { value: 0.4 },
      uGhostGlow: { value: 0.6 },
      uFlicker: { value: 0.15 },
      uReveal: { value: 1 },
      uRevealEdge: { value: 0.08 },
      uSeed: { value: 0 }
    }),
    vertexShader: LIT_VERTEX,
    fragmentShader: BRASS_FRAGMENT
  });

  /** @param {object} s { reveal, seed } */
  material.userData.sync = (s) => {
    const c = settings.hourglass;
    const g = settings.global;
    const u = material.uniforms;
    u.uBrass.value.copy(getColor(c.colorBrass));
    u.uBrassDark.value.copy(getColor(c.colorBrassDark));
    u.uGhost.value.copy(getColor(c.colorGhost));
    u.uRevealColor.value.copy(getColor(c.colorReveal));
    u.uMetal.value = c.brassMetal;
    u.uEnv.value = c.brassEnv * g.fresnel;
    u.uSpecular.value = c.brassSpecular * g.glow;
    u.uGloss.value = c.brassGloss;
    u.uEngrave.value = c.brassEngrave;
    u.uEngraveScale.value = c.engraveScale;
    u.uPatina.value = c.brassPatina;
    u.uGhostGlow.value = c.brassGhost * g.fresnel;
    u.uFlicker.value = c.ghostFlicker;
    u.uReveal.value = s.reveal;
    u.uRevealEdge.value = c.revealEdge;
    u.uSeed.value = s.seed;
  };

  return material;
}

/* ==================================================================== */
/* Sand                                                                  */
/* ==================================================================== */

const SAND_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  uniform vec3  uSand;
  uniform vec3  uSandDark;
  uniform vec3  uSandTop;
  uniform float uALo;          // bulb A (local +y): sand between these heights
  uniform float uAHi;
  uniform float uBHi;          // bulb B (local −y): sand from the cap up to here
  uniform float uDimple;       // metres the top surface funnels at the centre
  uniform float uCone;         // metres the pile heaps at the centre
  uniform float uRadius;       // widest radius of the bulb, local
  uniform float uGrain;
  uniform float uSparkle;
  uniform float uGlow;
  uniform float uReveal;
  uniform float uSeed;

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;

  ${noiseGLSL}

  void main() {
    float y = vLocal.y;
    float rr = clamp(length(vLocal.xz) / max(uRadius, 0.01), 0.0, 1.0);
    float centre = (1.0 - rr) * (1.0 - rr);
    if (y >= 0.0) {
      float hi = uAHi - uDimple * centre;
      if (y < uALo || y > hi) discard;
    } else {
      float hi = uBHi + uCone * (1.0 - rr);
      if (y > hi) discard;
    }
    // Fades in with the glass.
    if (snoise01(vLocal * 1.7 + uSeed) > uReveal * 1.08) discard;

    float n = snoise(vLocal * uGrain);
    float fine = snoise(vLocal * uGrain * 3.7 + 11.0);
    float glint = pow(snoise01(vLocal * uGrain * 2.3 + vec3(0.0, uTime * 0.05, 0.0)), 24.0) * uSparkle * 8.0;

    vec3 color;
    if (gl_FrontFacing) {
      // The sand against the glass: grain, light from the sun side.
      vec3 N = normalize(vNormalW);
      float lit = 0.45 + 0.55 * max(dot(-N, normalize(uLightDir)), 0.0);
      color = mix(uSandDark, uSand, 0.55 + 0.3 * n + 0.15 * fine) * lit;
    } else {
      // A back face seen through the free surface: paint it as that surface.
      color = uSandTop * (0.85 + 0.15 * n + 0.1 * fine);
    }
    color += uSandTop * glint;
    color *= 1.0 + uGlow * uGlobalGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createHourglassSandMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSand: { value: new Color() },
      uSandDark: { value: new Color() },
      uSandTop: { value: new Color() },
      uALo: { value: 0 },
      uAHi: { value: 0 },
      uBHi: { value: -10 },
      uDimple: { value: 0 },
      uCone: { value: 0 },
      uRadius: { value: 1 },
      uGrain: { value: 40 },
      uSparkle: { value: 2 },
      uGlow: { value: 0.5 },
      uReveal: { value: 1 },
      uSeed: { value: 0 }
    }),
    vertexShader: LIT_VERTEX,
    fragmentShader: SAND_FRAGMENT
  });

  /** @param {object} s { aLo, aHi, bHi, dimple, cone, radius, reveal, seed } */
  material.userData.sync = (s) => {
    const c = settings.hourglass;
    const g = settings.global;
    const u = material.uniforms;
    u.uSand.value.copy(getColor(c.colorSand));
    u.uSandDark.value.copy(getColor(c.colorSandDark));
    u.uSandTop.value.copy(getColor(c.colorSandTop));
    u.uALo.value = s.aLo;
    u.uAHi.value = s.aHi;
    u.uBHi.value = s.bHi;
    u.uDimple.value = s.dimple;
    u.uCone.value = s.cone;
    u.uRadius.value = s.radius;
    u.uGrain.value = c.sandGrain * g.noiseFrequency;
    u.uSparkle.value = c.sandSparkle;
    u.uGlow.value = c.sandGlow * g.glow;
    u.uReveal.value = s.reveal;
    u.uSeed.value = s.seed;
  };

  return material;
}

/* ==================================================================== */
/* The falling thread of sand                                            */
/* ==================================================================== */

const STREAM_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  void main() {
    vUv = uv;
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const STREAM_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform vec3  uSand;
  uniform vec3  uSandTop;
  uniform float uLength;       // metres
  uniform float uSpeed;
  uniform float uGrain;
  uniform float uGlow;
  uniform float uLevel;

  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  ${noiseGLSL}

  void main() {
    float along = -vLocal.y * uLength;                 // metres down from the neck
    float ang = atan(vLocal.z, vLocal.x);
    float n = snoise(vec3(cos(ang) * 1.5, sin(ang) * 1.5, along * uGrain - uTime * uSpeed));
    float grains = smoothstep(-0.3, 0.6, n);
    // Soft against the side-on view so the thread has no hard tube edge.
    vec3 V = normalize(cameraPosition - vWorld);
    float face = abs(dot(normalize(vNormalW), V));
    float ends = smoothstep(0.0, 0.04, vUv.y) * smoothstep(0.0, 0.04, 1.0 - vUv.y);
    float a = (0.35 + 0.65 * grains) * smoothstep(0.05, 0.6, face) * ends * uLevel;
    if (a < 0.01) discard;
    vec3 color = mix(uSand, uSandTop, grains) * (1.0 + uGlow * uGlobalGlow);
    gl_FragColor = vec4(color, a);
  }
`;

export function createSandStreamMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSand: { value: new Color() },
      uSandTop: { value: new Color() },
      uLength: { value: 1 },
      uSpeed: { value: 6 },
      uGrain: { value: 3 },
      uGlow: { value: 1 },
      uLevel: { value: 0 }
    }),
    vertexShader: STREAM_VERTEX,
    fragmentShader: STREAM_FRAGMENT
  });

  /** @param {object} s { length, level } */
  material.userData.sync = (s) => {
    const c = settings.hourglass;
    const g = settings.global;
    const u = material.uniforms;
    u.uSand.value.copy(getColor(c.colorSand));
    u.uSandTop.value.copy(getColor(c.colorSandTop));
    u.uLength.value = Math.max(0.01, s.length);
    u.uSpeed.value = c.streamSpeed * g.animationSpeed;
    u.uGrain.value = 3 * g.noiseFrequency;
    u.uGlow.value = c.streamGlow * g.glow;
    u.uLevel.value = s.level * g.opacity;
  };

  return material;
}

/* ==================================================================== */
/* The clock face on the floor                                            */
/* ==================================================================== */

const DIAL_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;

  varying vec2 vP;

  void main() {
    vec2 p = position.xy * uExtent;
    vP = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(uCentre.x + p.x, 0.016, uCentre.z + p.y, 1.0);
  }
`;

const DIAL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec2  uForward;      // world xz of 12 o'clock
  uniform float uRadius;       // metres
  uniform float uSpin;         // radians the dial graphics have turned
  uniform float uMinute;       // hand angles, radians clockwise from 12
  uniform float uHour;
  uniform float uElapsed;      // 0..1 of the sector greyed over
  uniform float uReveal;       // 0..1 the dial drawing itself
  uniform float uTickPulse;    // 0..1, flashes on each tick
  uniform float uGlow;
  uniform float uHandGlow;
  uniform float uOpacity;
  uniform float uBaseOpacity;
  uniform float uRingWidth;    // metres
  uniform float uTickLen;      // fraction of radius
  uniform float uHandWidth;    // metres
  uniform float uHourLen;
  uniform float uMinLen;
  uniform float uSectorFill;
  uniform float uRipple;
  uniform float uSpill;        // 0..1 how far the spilt sand has run
  uniform float uSpillRadius;  // × radius
  uniform float uFade;
  uniform float uSeed;
  uniform vec3  uColorDial;
  uniform vec3  uColorHot;
  uniform vec3  uColorBase;
  uniform vec3  uColorSpill;
  uniform vec3  uColorAged;

  varying vec2 vP;

  ${noiseGLSL}

  const float TAU = 6.2831853;

  float line(float d, float w) {
    float aa = fwidth(d) * 1.2 + 1e-4;
    return 1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, abs(d));
  }

  /** A tapering hand pointing at angle a, from just behind the hub to len·R. */
  float hand(vec2 p, vec2 f, vec2 right, float a, float len, float w) {
    vec2 h = f * cos(a) + right * sin(a);
    vec2 n = vec2(-h.y, h.x);
    float along = dot(p, h);
    float across = abs(dot(p, n));
    float L = len * uRadius;
    if (along < -0.08 * uRadius || along > L) return 0.0;
    float k = clamp(along / max(L, 1e-3), 0.0, 1.0);
    float width = w * mix(1.0, 0.12, k * k) * (along < 0.0 ? 1.6 : 1.0);
    float aa = fwidth(across) * 1.2 + 1e-4;
    return 1.0 - smoothstep(width - aa, width + aa, across);
  }

  void main() {
    vec2 p = vP;
    float dist = length(p);
    float r = dist / uRadius;
    vec2 f = normalize(uForward);
    vec2 right = vec2(-f.y, f.x);
    float theta = atan(dot(p, right), dot(p, f));      // clockwise from 12
    if (theta < 0.0) theta += TAU;
    float th = mod(theta - uSpin, TAU);                 // the turning graphics

    // The dial draws itself round from 12, ring by ring.
    float drawn = step(theta, uReveal * TAU * 1.02) * step(0.001, uReveal);

    // Rings.
    float ringW = uRingWidth;
    float rings = line(dist - uRadius, ringW * 1.4) + line(dist - uRadius * 0.955, ringW * 0.6)
                + line(dist - uRadius * 0.7, ringW * 0.5) * 0.7;
    // Escapement: a dashed ring turning the other way.
    float dash = step(0.5, fract((theta + uSpin * 2.5) / TAU * 24.0));
    rings += line(dist - uRadius * 0.3, ringW * 0.8) * dash;
    rings += line(dist - uRadius * 0.27, ringW * 0.35);

    // Minute and hour ticks (arc length in metres from the nearest tick).
    float mStep = TAU / 60.0;
    float mOff = abs(fract(th / mStep + 0.5) - 0.5) * mStep * dist;
    float inMinute = step(1.0 - uTickLen, r) * step(r, 0.955);
    float minute = (1.0 - smoothstep(ringW * 0.25, ringW * 0.45, mOff)) * inMinute;
    float hStep = TAU / 12.0;
    float hOffA = abs(fract(th / hStep + 0.5) - 0.5) * hStep;
    float hOff = hOffA * dist;
    float inHour = step(1.0 - uTickLen * 2.0, r) * step(r, 0.955);
    float hourTick = (1.0 - smoothstep(ringW * 0.6, ringW * 0.9, hOff)) * inHour;
    // Diamond markers inside the hour ticks.
    float dr = abs(r - 0.78) * uRadius;
    float diamond = 1.0 - smoothstep(0.0, ringW * 0.6, hOff * 1.4 + dr - ringW * 2.4);
    float ticks = max(minute * 0.8, max(hourTick, diamond));

    // Ripples of time running outward under the glass.
    float ripple = smoothstep(0.85, 1.0, sin(dist * 6.0 - uTime * 3.0)) * uRipple * step(r, 1.0) * (1.0 - r);

    // The elapsed sector greys over, the dial aging as the sand runs.
    float sector = step(theta, uElapsed * TAU) * step(r, 0.955) * step(0.0005, uElapsed);

    // Hands.
    float hands = max(hand(p, f, right, uMinute, uMinLen, uHandWidth),
                      hand(p, f, right, uHour, uHourLen, uHandWidth * 1.7));
    float hub = 1.0 - smoothstep(uHandWidth * 2.2, uHandWidth * 2.8, dist);

    // Sand spilt across the floor when it bursts.
    float sn = snoise(vec3(p * 1.4, uSeed)) * 0.18 + snoise(vec3(p * 4.0, uSeed + 2.0)) * 0.06;
    float spillR = uSpill * uSpillRadius;
    float spill = 1.0 - smoothstep(spillR - 0.08, spillR + 0.02, r + sn);
    spill *= step(0.001, uSpill);
    float spillGrain = snoise01(vec3(p * 22.0, uSeed));

    float inside = 1.0 - smoothstep(1.0, 1.04, r);
    float pulse = 1.0 + uTickPulse * 0.6;

    vec3 col = uColorBase;
    float a = inside * uBaseOpacity * drawn;
    // Aged sector: dull, dusty.
    col = mix(col, uColorAged, sector * uSectorFill);
    a = max(a, sector * uSectorFill * 0.7 * inside);

    float glyph = max(rings, ticks) * drawn;
    vec3 glow = uColorDial * glyph * uGlow * pulse
              + uColorHot * hands * uHandGlow * pulse
              + uColorHot * hub * uHandGlow
              + uColorDial * ripple * uGlow * 0.4 * drawn;
    col += glow * uGlobalGlow * uShaderIntensity;
    a = max(a, clamp(glyph + hands + hub + ripple * 0.5 * drawn, 0.0, 1.0));

    col = mix(col, uColorSpill * (0.75 + 0.35 * spillGrain), spill * 0.92);
    a = max(a, spill * 0.9);

    a *= uOpacity * uFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createClockFaceMaterial() {
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
      uCentre: { value: new Vector3() },
      uExtent: { value: 5 },
      uForward: { value: new Vector2(0, 1) },
      uRadius: { value: 4 },
      uSpin: { value: 0 },
      uMinute: { value: 0 },
      uHour: { value: 0 },
      uElapsed: { value: 0 },
      uReveal: { value: 0 },
      uTickPulse: { value: 0 },
      uGlow: { value: 2 },
      uHandGlow: { value: 3 },
      uOpacity: { value: 1 },
      uBaseOpacity: { value: 0.35 },
      uRingWidth: { value: 0.05 },
      uTickLen: { value: 0.08 },
      uHandWidth: { value: 0.04 },
      uHourLen: { value: 0.5 },
      uMinLen: { value: 0.82 },
      uSectorFill: { value: 0.45 },
      uRipple: { value: 0.4 },
      uSpill: { value: 0 },
      uSpillRadius: { value: 0.55 },
      uFade: { value: 1 },
      uSeed: { value: 0 },
      uColorDial: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorBase: { value: new Color() },
      uColorSpill: { value: new Color() },
      uColorAged: { value: new Color() }
    }),
    vertexShader: DIAL_VERTEX,
    fragmentShader: DIAL_FRAGMENT
  });

  /** @param {object} s { centre, forward, radius, spin, minute, hour, elapsed, reveal, tick, spill, fade, seed } */
  material.userData.sync = (s) => {
    const c = settings.hourglass;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uExtent.value = s.radius * 1.12 + 0.3;
    u.uForward.value.set(s.forward.x, s.forward.z);
    u.uRadius.value = s.radius;
    u.uSpin.value = s.spin;
    u.uMinute.value = s.minute;
    u.uHour.value = s.hour;
    u.uElapsed.value = s.elapsed;
    u.uReveal.value = s.reveal;
    u.uTickPulse.value = s.tick;
    u.uGlow.value = c.dialGlow * g.glow;
    u.uHandGlow.value = c.handGlow * g.glow;
    u.uOpacity.value = c.dialOpacity * g.opacity;
    u.uBaseOpacity.value = c.dialBaseOpacity;
    u.uRingWidth.value = c.ringWidth;
    u.uTickLen.value = c.tickLength;
    u.uHandWidth.value = c.handWidth;
    u.uHourLen.value = c.hourHandLength;
    u.uMinLen.value = c.minuteHandLength;
    u.uSectorFill.value = c.sectorFill;
    u.uRipple.value = c.dialRipple;
    u.uSpill.value = s.spill;
    u.uSpillRadius.value = c.spillRadius;
    u.uFade.value = s.fade;
    u.uSeed.value = s.seed;
    u.uColorDial.value.copy(getColor(c.colorDial));
    u.uColorHot.value.copy(getColor(c.colorDialHot));
    u.uColorBase.value.copy(getColor(c.colorDialBase));
    u.uColorSpill.value.copy(getColor(c.colorSpill));
    u.uColorAged.value.copy(getColor(c.colorAged));
  };

  return material;
}

/* ==================================================================== */
/* Glass shards                                                          */
/* ==================================================================== */

const SHARD_VERTEX = /* glsl */ `
  attribute vec2 aShard;   // seed, fade

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec2 vShard;

  void main() {
    vShard = aShard;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHARD_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform vec3  uTint;
  uniform vec3  uRim;
  uniform float uGlow;
  uniform float uOpacity;

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec2 vShard;

  ${ENV_GLSL}

  void main() {
    float fade = vShard.y;
    if (fade <= 0.002) discard;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
    float F = pow(1.0 - ndv, 2.5);
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;
    // A glint when a facet swings through the sun — the thing that sells glass.
    float sun = pow(max(dot(reflect(-V, N), normalize(uLightDir)), 0.0), 60.0);
    float twinkle = 0.7 + 0.3 * sin(uTime * 17.0 + vShard.x * 60.0);
    vec3 color = uTint * 0.15 + env * (0.3 + F) + uRim * (F * uGlow + sun * 4.0 * twinkle);
    color *= uGlobalGlow;
    float a = clamp(0.18 + F * 0.8 + sun, 0.0, 1.0) * fade * uOpacity;
    gl_FragColor = vec4(color, a);
  }
`;

export function createShardMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uTint: { value: new Color() },
      uRim: { value: new Color() },
      uGlow: { value: 1.8 },
      uOpacity: { value: 1 }
    }),
    vertexShader: SHARD_VERTEX,
    fragmentShader: SHARD_FRAGMENT
  });
  material.userData.instanced = true;

  material.userData.sync = () => {
    const c = settings.hourglass;
    const g = settings.global;
    const u = material.uniforms;
    u.uTint.value.copy(getColor(c.glassTint));
    u.uRim.value.copy(getColor(c.glassRim));
    u.uGlow.value = c.shardGlow * g.glow;
    u.uOpacity.value = g.opacity;
  };

  return material;
}
