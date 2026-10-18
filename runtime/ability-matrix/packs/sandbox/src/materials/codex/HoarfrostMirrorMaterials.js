import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Hoarfrost Mirror — the five bespoke shaders.
 *
 *  - **the pane** (`createMirrorPaneMaterial`) — a standing sheet of black
 *    ice polished to a mirror. Opaque, on `LAYER.WORLD`. It reflects the
 *    stage's sky through the equirect (breathing very slightly, so it reads
 *    as ice and not chrome), has a cold sheen band sweeping across it, and
 *    then three things happen to it on cue:
 *      1. **hoarfrost creeps in from the frame** — a signed distance to the
 *         two-centred arch (the same four numbers the geometry was built
 *         from) races inward under a ragged noise front, and behind it the
 *         glass goes to white fern-veined rime;
 *      2. **it charges** — a cold light swells at its heart while it draws
 *         the air in, and flashes white on the throw;
 *      3. **it cracks, then shatters** — a Voronoi crack net spreads from the
 *         middle, glowing, and the pane dissolves along it into shards.
 *  - **the rime crust** (`createRimeCrustMaterial`) — the frame and the
 *    hoarfrost bristles round it (instanced). Snow-white ice with blue in
 *    its hollows, glints, a fresnel rim and an inner glow that tracks the
 *    charge.
 *  - **the mirror floor** (`createMirrorFloorMaterial`) — the circle frozen
 *    to polished black ice that reflects the sky, ragged hoarfrost round its
 *    rim, rings of light drawn *inward* while the mirror inhales and the
 *    bright ring of the throw racing back out.
 *  - **the throw** (`createBlastMaterial`) — an open cylinder, additive:
 *    a wall of white gale, streaked horizontally, brightest at its foot and
 *    leading edge, thinning upward and as it travels.
 *  - **the shove** (`createBlastWarpMaterial`) — the same cylinder on
 *    `LAYER.DISTORTION`: the air the throw pushes ahead of itself.
 *
 * Every material reads `settings.hoarfrost` in `userData.sync()`.
 */

const KEY = 'hoarfrost';

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/** F2 − F1 Voronoi: 0 on a cell border, growing into the cell. */
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
 * Fern-like hoarfrost: ridged noise, domain-warped and stretched along a
 * direction, so the crests read as feathered spines rather than blobs.
 */
const FERN_GLSL = /* glsl */ `
  float fern(vec2 p, vec2 dir, float seed) {
    vec2 t = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x)));
    vec3 q = vec3(t.x * 0.6, t.y * 1.8, seed);
    q.xy += vec2(snoise(q * 0.7), snoise(q * 0.7 + 9.1)) * 0.6;
    float spine = ridged(q, 4);
    float barbs = ridged(vec3(t * vec2(3.2, 1.2), seed + 4.0), 3);
    return clamp(spine * 0.75 + barbs * 0.45, 0.0, 1.5);
  }
`;

/* ==================================================================== */
/* The pane                                                               */
/* ==================================================================== */

const PANE_VERTEX = /* glsl */ `
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

const PANE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec4  uArch;        // halfW, shoulder, r, cx (metres)
  uniform float uY0;          // the pane's base line
  uniform float uHeight;
  uniform float uSeed;

  uniform float uFrost;       // metres the hoarfrost has crept in from the frame
  uniform float uFrostRag;    // metres of ragged front
  uniform float uFrostScale;
  uniform float uFrostOpacity;
  uniform float uCharge;      // 0..1 the inhale
  uniform float uFlash;       // 0..1 the throw
  uniform float uCrack;       // metres the crack net has spread from the heart
  uniform float uCrackScale;
  uniform float uCrackGlow;
  uniform float uShatter;     // 0..1 dissolve
  uniform float uReflect;
  uniform float uFresnelPow;
  uniform float uSheen;
  uniform float uShimmer;
  uniform float uChargeGlow;
  uniform float uFlashGlow;

  uniform vec3 uColorDeep;
  uniform vec3 uColorSky;
  uniform vec3 uColorFrost;
  uniform vec3 uColorGlow;
  uniform vec3 uColorCrack;

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;

  ${noiseGLSL}
  ${ENV_GLSL}
  ${EDGES_GLSL}
  ${FERN_GLSL}

  /** Signed distance inside the two-centred arch, metres (positive inside). */
  float archInside(vec2 p) {
    float halfW = uArch.x;
    float shoulder = uArch.y;
    float r = uArch.z;
    float cx = uArch.w;
    float y = p.y - uY0;
    float ax = abs(p.x);
    float side = (y < shoulder) ? (halfW - ax) : (r - length(vec2(ax - cx, y - shoulder)));
    return min(side, y);
  }

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    float facing = dot(N, V);
    if (facing < 0.0) N = -N;
    vec2 p = vLocal.xy;
    vec2 centre = vec2(0.0, uY0 + uHeight * 0.45);

    /* the polished ice: the sky, breathing very slightly */
    vec3 wob = vec3(snoise(vec3(p * 1.3, uTime * 0.35 + uSeed)), snoise(vec3(p * 1.3 + 7.0, uTime * 0.35)), 0.0);
    vec3 Nr = normalize(N + wob * 0.05 * uShimmer);
    vec3 R = reflect(-V, Nr);
    vec3 env = texture2D(uEnvMap, equirectUv(normalize(R))).rgb;
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.08 + 0.92 * pow(1.0 - ndv, uFresnelPow);
    vec3 col = uColorDeep + env * uReflect * (0.45 + 0.55 * F) + uColorSky * F * 0.35;

    // A cold sheen band sweeping diagonally up the glass.
    float sweep = p.x * 0.55 + (p.y - uY0) * 0.35 - mod(uTime * 0.9, 6.0) + 2.0;
    col += uColorSky * exp(-sweep * sweep * 10.0) * uSheen;
    // Deep in the ice: a faint cloud of trapped bubbles.
    float cloud = fbm3(vec3(p * 2.2, uSeed + 3.0));
    col += uColorSky * smoothstep(0.35, 0.8, cloud) * 0.08;

    /* 1 · hoarfrost creeping in from the frame */
    float d = archInside(p);
    float rag = (snoise(vec3(p * 2.4, uSeed * 1.3)) * 0.6 + snoise(vec3(p * 6.0, uSeed)) * 0.4) * uFrostRag;
    float reach = uFrost + rag;
    float frosted = 1.0 - smoothstep(reach - 0.06, reach + 0.02, d);
    vec2 inward = normalize(centre - p + 1e-4);
    float veins = fern(p * uFrostScale, inward, uSeed);
    float grain = fbm3(vec3(p * uFrostScale * 3.0, uSeed + 1.0)) * 0.5 + 0.5;
    float frost = frosted * clamp(0.35 + veins * 0.55 + grain * 0.25, 0.0, 1.0) * uFrostOpacity;
    float front = (1.0 - smoothstep(0.0, 0.08, abs(d - reach))) * step(0.001, uFrost);
    col = mix(col, uColorFrost * (0.55 + 0.6 * veins), frost);
    // Glints in the rime.
    float glint = step(0.985, hash13(floor(vec3(p * 70.0, floor(uTime * 6.0 + hash13(floor(vec3(p * 70.0, 1.0))) * 6.0)))));
    col += uColorFrost * glint * frosted * 2.5 * uGlobalGlow;
    col += uColorGlow * front * 2.0 * uGlobalGlow;

    /* 2 · the charge: a cold heart swelling, and the throw's flash */
    float heart = exp(-length((p - centre) * vec2(1.4, 1.0)) * 1.6);
    col += uColorGlow * heart * uCharge * uChargeGlow * (0.8 + 0.2 * sin(uTime * 18.0)) * uGlobalGlow * uShaderIntensity;
    col += uColorGlow * uFlash * uFlashGlow * (0.4 + heart) * uGlobalGlow;

    /* 3 · the crack net, spreading from the heart */
    float rc = length(p - centre);
    float edge = cellEdges(p * uCrackScale + uSeed * 3.1);
    float radial = abs(sin(atan(p.y - centre.y, p.x) * 7.0 + snoise(vec3(p * 1.5, uSeed)) * 2.0));
    float lines = max(1.0 - smoothstep(0.0, 0.05, edge), (1.0 - smoothstep(0.0, 0.06, radial)) * step(rc, uCrack * 0.8));
    float crack = lines * (1.0 - smoothstep(uCrack - 0.3, uCrack, rc)) * step(0.001, uCrack);
    col = mix(col, uColorCrack * 0.2, crack * 0.4);
    col += uColorCrack * crack * uCrackGlow * uGlobalGlow;

    /* the shatter: dissolve along the cracks first */
    if (uShatter > 0.0) {
      float n = snoise(vec3(p * 2.6, uSeed + 5.0)) * 0.5 + 0.5;
      float th = uShatter * 1.25 - 0.1;
      float keep = n - lines * 0.35;
      if (keep < th) discard;
      float burn = 1.0 - smoothstep(0.0, 0.08, keep - th);
      col += uColorCrack * burn * uCrackGlow * 1.5 * uGlobalGlow;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The mirror pane. Opaque, LAYER.WORLD. */
export function createMirrorPaneMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uArch: { value: new Vector4() },
      uY0: { value: 0 },
      uHeight: { value: 3 },
      uSeed: { value: 0 },
      uFrost: { value: 0 },
      uFrostRag: { value: 0.2 },
      uFrostScale: { value: 3 },
      uFrostOpacity: { value: 1 },
      uCharge: { value: 0 },
      uFlash: { value: 0 },
      uCrack: { value: 0 },
      uCrackScale: { value: 2 },
      uCrackGlow: { value: 4 },
      uShatter: { value: 0 },
      uReflect: { value: 1 },
      uFresnelPow: { value: 3 },
      uSheen: { value: 0.5 },
      uShimmer: { value: 1 },
      uChargeGlow: { value: 3 },
      uFlashGlow: { value: 6 },
      uColorDeep: { value: new Color() },
      uColorSky: { value: new Color() },
      uColorFrost: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorCrack: { value: new Color() }
    }),
    vertexShader: PANE_VERTEX,
    fragmentShader: PANE_FRAGMENT
  });

  /** @param {object} s { arch, y0, height, seed, frost, charge, flash, crack, shatter } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uArch.value.set(s.arch.halfW, s.arch.shoulder, s.arch.r, s.arch.cx);
    u.uY0.value = s.y0;
    u.uHeight.value = s.height;
    u.uSeed.value = s.seed;
    u.uFrost.value = s.frost;
    u.uFrostRag.value = c.frostRagged * g.noiseStrength;
    u.uFrostScale.value = c.frostScale * g.noiseFrequency;
    u.uFrostOpacity.value = c.frostOpacity;
    u.uCharge.value = s.charge;
    u.uFlash.value = s.flash;
    u.uCrack.value = s.crack;
    u.uCrackScale.value = c.crackScale;
    u.uCrackGlow.value = c.crackGlow * g.glow;
    u.uShatter.value = s.shatter;
    u.uReflect.value = c.mirrorReflect;
    u.uFresnelPow.value = Math.max(0.5, c.mirrorFresnel / Math.max(0.1, g.fresnel));
    u.uSheen.value = c.mirrorSheen;
    u.uShimmer.value = c.mirrorShimmer * g.noiseStrength;
    u.uChargeGlow.value = c.chargeGlow * g.glow;
    u.uFlashGlow.value = c.flashGlow * g.glow;
    u.uColorDeep.value.copy(getColor(c.colorGlassDeep));
    u.uColorSky.value.copy(getColor(c.colorGlassSky));
    u.uColorFrost.value.copy(getColor(c.colorFrost));
    u.uColorGlow.value.copy(getColor(c.colorGlow));
    u.uColorCrack.value.copy(getColor(c.colorCrack));
  };

  return material;
}

/* ==================================================================== */
/* The rime crust — frame and bristles                                    */
/* ==================================================================== */

const CRUST_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;

  void main() {
    vLocal = position;
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

const CRUST_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  uniform float uCharge;
  uniform float uFlash;
  uniform float uDissolve;
  uniform float uSeed;
  uniform float uNoiseScale;
  uniform float uGlow;
  uniform float uRim;
  uniform float uSparkle;
  uniform float uAmbient;

  uniform vec3 uColorRime;
  uniform vec3 uColorShadow;
  uniform vec3 uColorGlow;

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (dot(N, V) < 0.0) N = -N;
    vec3 wp = vWorld * uNoiseScale;
    float grain = fbm3(wp + uSeed);
    N = normalize(N + vec3(snoise(wp * 2.0), snoise(wp * 2.0 + 5.0), snoise(wp * 2.0 + 9.0)) * 0.25);

    if (uDissolve > 0.0) {
      float n = snoise(wp * 1.7 + uSeed) * 0.5 + 0.5;
      if (n < uDissolve * 1.1 - 0.05) discard;
    }

    vec3 L = normalize(uLightDir);
    float ndl = max(dot(N, L), 0.0);
    float hemi = 0.5 + 0.5 * N.y;
    // Snow-white crust, blue in its hollows.
    vec3 albedo = mix(uColorShadow, uColorRime, clamp(0.45 + grain * 0.7, 0.0, 1.0));
    vec3 col = albedo * (uAmbient * (0.5 + 0.5 * hemi) + 0.85 * ndl);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float F = pow(1.0 - ndv, 3.0);
    col += texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb * 0.35 * F;
    col += uColorGlow * F * uRim * uGlobalGlow;

    // Glints: a few facets catching the light, twinkling.
    vec3 cell = floor(vWorld * 26.0);
    float h = hash13(cell);
    float tw = step(0.97, h) * (0.5 + 0.5 * sin(uTime * (6.0 + h * 10.0) + h * 40.0));
    col += uColorRime * tw * uSparkle * uGlobalGlow;

    // Inner cold light, tracking the charge, and the flash of the throw.
    col += uColorGlow * (uCharge * uGlow * (0.35 + 0.65 * (1.0 - ndv)) + uFlash * uGlow * 1.5) * uGlobalGlow;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The frame and the bristles. Opaque, LAYER.WORLD; instancing-aware. */
export function createRimeCrustMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uCharge: { value: 0 },
      uFlash: { value: 0 },
      uDissolve: { value: 0 },
      uSeed: { value: 0 },
      uNoiseScale: { value: 3 },
      uGlow: { value: 1 },
      uRim: { value: 1 },
      uSparkle: { value: 2 },
      uAmbient: { value: 0.5 },
      uColorRime: { value: new Color() },
      uColorShadow: { value: new Color() },
      uColorGlow: { value: new Color() }
    }),
    vertexShader: CRUST_VERTEX,
    fragmentShader: CRUST_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {object} s { charge, flash, dissolve, seed } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uCharge.value = s.charge;
    u.uFlash.value = s.flash;
    u.uDissolve.value = s.dissolve;
    u.uSeed.value = s.seed;
    u.uNoiseScale.value = c.crustNoise * g.noiseFrequency;
    u.uGlow.value = c.crustGlow * g.glow;
    u.uRim.value = c.crustRim * g.fresnel;
    u.uSparkle.value = c.crustSparkle;
    u.uAmbient.value = c.crustAmbient;
    u.uColorRime.value.copy(getColor(c.colorRime));
    u.uColorShadow.value.copy(getColor(c.colorRimeShadow));
    u.uColorGlow.value.copy(getColor(c.colorGlow));
  };

  return material;
}

/* ==================================================================== */
/* The mirror floor                                                       */
/* ==================================================================== */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;
  varying vec2 vP;

  void main() {
    vec2 p = position.xy * uExtent;
    vP = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(uCentre.x + p.x, 0.014, uCentre.z + p.y, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;
  uniform vec3  uCentre;

  uniform float uRadius;
  uniform float uSpread;      // metres the ice has spread
  uniform float uSeed;
  uniform float uReflect;
  uniform float uRimWidth;
  uniform float uRimRag;
  uniform float uInhale;      // 0..1 how hard the rings are being drawn in
  uniform float uRingSpacing;
  uniform float uRingSpeed;
  uniform float uRingGlow;
  uniform float uBlast;       // metres the throw has reached (−1 none)
  uniform float uBlastGlow;
  uniform float uErode;
  uniform float uOpacity;

  uniform vec3 uColorIce;
  uniform vec3 uColorSheen;
  uniform vec3 uColorRime;
  uniform vec3 uColorGlow;

  varying vec2 vP;

  ${noiseGLSL}
  ${ENV_GLSL}
  ${FERN_GLSL}

  void main() {
    vec2 p = vP;
    float r = length(p);
    float rag = snoise(vec3(p * 0.9, uSeed)) * uRimRag;
    float edge = min(uSpread, uRadius) + rag;
    float inside = 1.0 - smoothstep(edge - 0.08, edge + 0.04, r);
    float rim = smoothstep(edge - uRimWidth, edge, r) * inside;

    // Black ice, polished: a mirror of the sky seen from the camera.
    vec3 wp = vec3(uCentre.x + p.x, 0.0, uCentre.z + p.y);
    vec3 V = normalize(cameraPosition - wp);
    vec3 N = normalize(vec3(snoise(vec3(p * 1.7, uSeed)) * 0.04, 1.0, snoise(vec3(p * 1.7 + 4.0, uSeed)) * 0.04));
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;
    float F = 0.1 + 0.9 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
    vec3 col = uColorIce + env * uReflect * F + uColorSheen * F * 0.25;
    // Pressure lines frozen into the sheet.
    float lines = 1.0 - smoothstep(0.0, 0.035, abs(fract(fbm3(vec3(p * 0.6, uSeed)) * 5.0) - 0.5));
    col += uColorSheen * lines * 0.06;

    // Hoarfrost feathering in from the rim.
    vec2 inward = -normalize(p + 1e-4);
    float veins = fern(p * 2.4, inward, uSeed + 2.0);
    float frost = rim * clamp(0.3 + veins * 0.7, 0.0, 1.0);
    col = mix(col, uColorRime * (0.6 + 0.5 * veins), frost);

    // Rings drawn inward to the mirror while it inhales.
    float phase = (r + uTime * uRingSpeed) / max(uRingSpacing, 0.05);
    float ring = pow(0.5 + 0.5 * cos(phase * 6.2831853), 24.0);
    float glow = ring * uInhale * uRingGlow * smoothstep(0.3, 1.2, r) * inside;
    // The throw racing back out: a bright front with a frosted wake.
    if (uBlast > 0.0) {
      float b = (r + snoise(vec3(p * 1.2, uTime)) * 0.12) - uBlast;
      glow += exp(-b * b * 14.0) * uBlastGlow;
      col = mix(col, uColorRime, step(b, 0.0) * 0.18 * inside);
    }
    col += uColorGlow * glow * uGlobalGlow;

    float a = inside * mix(0.88, 1.0, frost);
    float n = snoise(vec3(p * 1.5, uSeed * 3.0)) * 0.5 + 0.5;
    float thr = uErode * 1.25 - 0.15;
    a *= smoothstep(thr, thr + 0.12, mix(n, frost, 0.35));
    a = max(a, min(glow, 1.0) * (1.0 - uErode));
    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The frozen floor. Normal blending — it has to be able to darken. */
export function createMirrorFloorMaterial() {
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
      uEnvMap: frame.uEnvMap,
      uCentre: { value: new Vector3() },
      uExtent: { value: 5 },
      uRadius: { value: 4 },
      uSpread: { value: 0 },
      uSeed: { value: 0 },
      uReflect: { value: 0.8 },
      uRimWidth: { value: 0.8 },
      uRimRag: { value: 0.3 },
      uInhale: { value: 0 },
      uRingSpacing: { value: 0.8 },
      uRingSpeed: { value: 3 },
      uRingGlow: { value: 2 },
      uBlast: { value: -1 },
      uBlastGlow: { value: 3 },
      uErode: { value: 0 },
      uOpacity: { value: 1 },
      uColorIce: { value: new Color() },
      uColorSheen: { value: new Color() },
      uColorRime: { value: new Color() },
      uColorGlow: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /** @param {object} s { centre, radius, spread, seed, inhale, blast, erode } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uRadius.value = s.radius;
    u.uExtent.value = Math.max(s.radius, s.blast) + 1;
    u.uSpread.value = s.spread;
    u.uSeed.value = s.seed;
    u.uReflect.value = c.floorReflect;
    u.uRimWidth.value = c.floorRimWidth;
    u.uRimRag.value = c.floorRimRagged * g.noiseStrength;
    u.uInhale.value = s.inhale;
    u.uRingSpacing.value = c.ringSpacing;
    u.uRingSpeed.value = c.ringSpeed * g.animationSpeed;
    u.uRingGlow.value = c.ringGlow * g.glow;
    u.uBlast.value = s.blast;
    u.uBlastGlow.value = c.floorBlastGlow * g.glow;
    u.uErode.value = s.erode;
    u.uOpacity.value = g.opacity;
    u.uColorIce.value.copy(getColor(c.colorFloorIce));
    u.uColorSheen.value.copy(getColor(c.colorGlassSky));
    u.uColorRime.value.copy(getColor(c.colorRime));
    u.uColorGlow.value.copy(getColor(c.colorGlow));
  };

  return material;
}

/* ==================================================================== */
/* The throw                                                              */
/* ==================================================================== */

const BAND_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BAND_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uIntensity;
  uniform float uStreaks;
  uniform float uSpeed;
  uniform float uSeed;
  uniform vec3  uColorA;
  uniform vec3  uColorB;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float y = vUv.y;
    float ang = vUv.x * 6.2831853;
    // Horizontal streaks: noise stretched round the ring, smeared outward in time.
    float s1 = snoise(vec3(ang * uStreaks * 0.25, y * 9.0, uTime * uSpeed + uSeed));
    float s2 = snoise(vec3(ang * uStreaks, y * 22.0, uTime * uSpeed * 1.7 + uSeed));
    float streak = clamp(0.45 + s1 * 0.45 + s2 * 0.35, 0.0, 1.0);
    // Brightest at the foot, thinning to nothing at the top, feathered at the floor.
    float profile = pow(1.0 - y, 1.6) * smoothstep(0.0, 0.06, y);
    float a = streak * profile * uIntensity * uShaderIntensity;
    vec3 col = mix(uColorB, uColorA, clamp(streak * profile * 1.4, 0.0, 1.0));
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * a * uGlobalGlow, a);
  }
`;

/** The wall of white gale the mirror throws. Additive, LAYER.VFX. */
export function createBlastMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uIntensity: { value: 0 },
      uStreaks: { value: 40 },
      uSpeed: { value: 2 },
      uSeed: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: BAND_VERTEX,
    fragmentShader: BAND_FRAGMENT
  });

  /** @param {object} s { intensity, seed } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uIntensity.value = s.intensity * g.opacity;
    u.uStreaks.value = c.blastStreaks * g.noiseFrequency;
    u.uSpeed.value = c.blastStreakSpeed * g.noiseSpeed;
    u.uSeed.value = s.seed;
    u.uColorA.value.copy(getColor(c.colorBlastA));
    u.uColorB.value.copy(getColor(c.colorBlastB));
  };

  return material;
}

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;
  uniform float uSeed;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float ang = vUv.x * 6.2831853;
    // Outward along the ring's own radius, wobbled.
    vec2 dir = vec2(cos(ang), sin(ang));
    float n = snoise(vec3(ang * 6.0, vUv.y * 4.0, uTime * 3.0 + uSeed));
    dir = normalize(dir + vec2(n, -n) * 0.4);
    float mask = (1.0 - smoothstep(0.4, 1.0, vUv.y)) * smoothstep(0.0, 0.05, vUv.y);
    float s = uStrength * uShaderIntensity * mask * (0.6 + 0.4 * n);
    if (s < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, s, mask);
  }
`;

/** The air shoved ahead of the throw. LAYER.DISTORTION. */
export function createBlastWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStrength: { value: 0 },
      uSeed: { value: 0 }
    }),
    vertexShader: BAND_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} s { strength, seed } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    material.uniforms.uStrength.value = s.strength * c.blastWarp * g.distortion;
    material.uniforms.uSeed.value = s.seed;
  };

  return material;
}
