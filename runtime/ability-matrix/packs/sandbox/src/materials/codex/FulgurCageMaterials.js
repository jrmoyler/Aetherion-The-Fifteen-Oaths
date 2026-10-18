import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Fulgur Cage — the five bespoke shaders.
 *
 *  - **lightning** (`createBoltMaterial`) — the ribbons `BoltBatch` writes.
 *    Additive, unlit. Across the ribbon: a hard white core (bloom > 1), a
 *    blue body and a violet halo, each a Gaussian of its own width; along
 *    it: brightness that crawls and stutters with the bolt's seed, so even a
 *    held bar never looks static. A per-bolt intensity scales the lot.
 *  - **fulgurite glass** (`createFulguriteMaterial`) — opaque, instanced, on
 *    `LAYER.WORLD`: the fused-sand tubes each strike leaves standing in the
 *    floor. Glassy olive-black with a gritty sand crust, a sky sheen, and a
 *    molten interior (`aState.x` heat) that glows white-orange, cools to a
 *    deep blue charge and dies.
 *  - **the knot** (`createKnotMaterial`) — a billboard of plasma at the
 *    centre the arcs feed: a churning noise ball with a white heart, a blue
 *    corona and crackling filaments.
 *  - **the scorched floor** (`createCageFloorMaterial`) — a conductive ring
 *    burnt into the floor round the rim, hot at each bar's foot; branching
 *    burn spokes running from each foot to the middle as the arcs leap; a
 *    starburst scorch where the knot detonates; it all cools to soot.
 *  - **ionised air** (`createIonWarpMaterial`) — an open cylinder at the
 *    cage on `LAYER.DISTORTION`, juddering.
 *
 * Every material reads `settings.fulgur` in `userData.sync()`.
 */

const KEY = 'fulgur';

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* ==================================================================== */
/* Lightning                                                              */
/* ==================================================================== */

const BOLT_VERTEX = /* glsl */ `
  attribute vec2 aCoord;
  attribute vec3 aBolt;
  varying vec2 vCoord;
  varying vec3 vBolt;

  void main() {
    vCoord = aCoord;
    vBolt = aBolt;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;

const BOLT_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uCoreWidth;
  uniform float uGlow;
  uniform float uCrawl;
  uniform vec3  uColorCore;
  uniform vec3  uColorBody;
  uniform vec3  uColorHalo;

  varying vec2 vCoord;
  varying vec3 vBolt;

  void main() {
    float x = vCoord.y;
    float s = vCoord.x;
    float intensity = vBolt.x;
    float seed = vBolt.y;
    float core = exp(-x * x / max(uCoreWidth * uCoreWidth, 1e-4));
    float body = exp(-x * x * 5.0);
    float halo = exp(-x * x * 1.5) * 0.35;
    // Brightness crawling along the bolt and stuttering.
    float crawl = 0.65 + 0.35 * sin(s * 40.0 - uTime * uCrawl + seed * 9.0) * sin(s * 13.0 + uTime * uCrawl * 0.7);
    vec3 col = uColorCore * core * 2.2 + uColorBody * body + uColorHalo * halo;
    float k = intensity * crawl * uGlow * uGlobalGlow * uShaderIntensity;
    gl_FragColor = vec4(col * k, 1.0);
  }
`;

export function createBoltMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCoreWidth: { value: 0.3 },
      uGlow: { value: 4 },
      uCrawl: { value: 30 },
      uColorCore: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: BOLT_VERTEX,
    fragmentShader: BOLT_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uCoreWidth.value = c.boltCore;
    u.uGlow.value = c.boltGlow * g.glow;
    u.uCrawl.value = c.boltCrawl * g.animationSpeed;
    u.uColorCore.value.copy(getColor(c.colorBoltCore));
    u.uColorBody.value.copy(getColor(c.colorBoltBody));
    u.uColorHalo.value.copy(getColor(c.colorBoltHalo));
  };

  return material;
}

/* ==================================================================== */
/* Fulgurite glass                                                        */
/* ==================================================================== */

const GLASS_VERTEX = /* glsl */ `
  attribute vec2 aState;   // heat, seed
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec2 vState;

  void main() {
    vLocal = position;
    vState = aState;
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

const GLASS_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  uniform vec3  uColorGlass;
  uniform vec3  uColorSand;
  uniform vec3  uColorHot;
  uniform vec3  uColorCharge;
  uniform float uHotGlow;
  uniform float uSheen;
  uniform float uCrust;

  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec2 vState;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    float heat = vState.x;
    float seed = vState.y;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (dot(N, V) < 0.0) N = -N;
    vec3 p = vLocal * vec3(6.0, 3.0, 6.0) + seed * 11.0;
    N = normalize(N + vec3(snoise(p), snoise(p + 4.0), snoise(p + 9.0)) * 0.35);
    float grit = snoise(p * 3.0) * 0.5 + 0.5;
    vec3 albedo = mix(uColorGlass, uColorSand, smoothstep(0.45, 0.8, grit) * uCrust);
    vec3 L = normalize(uLightDir);
    float ndl = max(dot(N, L), 0.0);
    vec3 col = albedo * (0.35 + 0.65 * ndl);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float F = pow(1.0 - ndv, 4.0);
    col += texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb * uSheen * (0.2 + F);

    // Molten inside, cooling: white-orange → blue charge → dark.
    float vein = smoothstep(0.55, 0.9, snoise(p * 0.8 + vec3(0.0, -uTime * 0.5, 0.0)) * 0.5 + 0.5);
    vec3 hot = mix(uColorCharge, uColorHot, smoothstep(0.4, 1.0, heat));
    float glow = heat * (0.35 + vein * 0.9) * (0.4 + 0.6 * ndv) * (1.0 - vLocal.y * 0.4);
    col += hot * glow * uHotGlow * uGlobalGlow;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createFulguriteMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uColorGlass: { value: new Color() },
      uColorSand: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorCharge: { value: new Color() },
      uHotGlow: { value: 4 },
      uSheen: { value: 0.6 },
      uCrust: { value: 0.6 }
    }),
    vertexShader: GLASS_VERTEX,
    fragmentShader: GLASS_FRAGMENT
  });
  material.userData.instanced = true;

  material.userData.sync = () => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uColorGlass.value.copy(getColor(c.colorGlass));
    u.uColorSand.value.copy(getColor(c.colorSand));
    u.uColorHot.value.copy(getColor(c.colorGlassHot));
    u.uColorCharge.value.copy(getColor(c.colorBoltBody));
    u.uHotGlow.value = c.glassGlow * g.glow;
    u.uSheen.value = c.glassSheen * g.fresnel;
    u.uCrust.value = c.glassCrust;
  };

  return material;
}

/* ==================================================================== */
/* The knot                                                               */
/* ==================================================================== */

const KNOT_VERTEX = /* glsl */ `
  uniform vec3  uPos;
  uniform float uSize;
  varying vec2 vUv;

  void main() {
    vUv = position.xy * 2.0;
    vec4 view = viewMatrix * vec4(uPos, 1.0);
    view.xy += position.xy * uSize;
    gl_Position = projectionMatrix * view;
  }
`;

const KNOT_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uIntensity;
  uniform float uSeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorBody;
  uniform vec3  uColorHalo;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    vec2 p = vUv;
    float r = length(p);
    float ang = atan(p.y, p.x);
    float churn = fbm3(vec3(p * 2.2, uTime * 3.0 + uSeed)) * 0.5 + 0.5;
    float ball = 1.0 - smoothstep(0.35 + churn * 0.25, 0.65 + churn * 0.2, r);
    float heart = exp(-r * r * 30.0);
    // Filaments crackling off it.
    float fil = pow(abs(snoise(vec3(ang * 3.0, r * 4.0 - uTime * 8.0, uSeed))), 0.15);
    float rays = (1.0 - fil) * (1.0 - smoothstep(0.3, 1.0, r)) * 2.0;
    float corona = exp(-r * 3.5) * 0.6;
    vec3 col = uColorCore * heart * 3.0 + uColorBody * ball * (0.6 + churn) + uColorHalo * (corona + rays);
    float k = uIntensity * (1.0 - smoothstep(0.85, 1.0, r));
    if (k < 0.002) discard;
    gl_FragColor = vec4(col * k * uGlobalGlow, 1.0);
  }
`;

export function createKnotMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uPos: { value: new Vector3() },
      uSize: { value: 1 },
      uIntensity: { value: 0 },
      uSeed: { value: 0 },
      uColorCore: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: KNOT_VERTEX,
    fragmentShader: KNOT_FRAGMENT
  });

  /** @param {object} s { pos, size, intensity, seed } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uPos.value.copy(s.pos);
    u.uSize.value = s.size;
    u.uIntensity.value = s.intensity * c.knotGlow * g.glow;
    u.uSeed.value = s.seed;
    u.uColorCore.value.copy(getColor(c.colorBoltCore));
    u.uColorBody.value.copy(getColor(c.colorBoltBody));
    u.uColorHalo.value.copy(getColor(c.colorBoltHalo));
  };

  return material;
}

/* ==================================================================== */
/* The scorched floor                                                     */
/* ==================================================================== */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;
  varying vec2 vP;

  void main() {
    vec2 p = position.xy * uExtent;
    vP = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(uCentre.x + p.x, 0.013, uCentre.z + p.y, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uRadius;
  uniform float uBars;        // how many bars
  uniform float uPhase;       // bearing of bar 0
  uniform float uRing;        // 0..1 the conductive ring burnt in
  uniform float uSpokes;      // 0..1 how far the burn spokes have run in
  uniform float uStar;        // 0..1 the detonation scorch
  uniform float uHeat;        // 0..1 cooling
  uniform float uGlow;
  uniform float uSeed;
  uniform float uErode;
  uniform float uOpacity;
  uniform vec3  uColorSoot;
  uniform vec3  uColorHot;
  uniform vec3  uColorCharge;

  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    vec2 p = vP;
    float r = length(p);
    float ang = atan(p.y, p.x);
    float wob = snoise(vec3(p * 1.3, uSeed)) * 0.12;

    // The conductive ring, with a hot node at each bar's foot.
    float ring = exp(-pow((r - uRadius + wob) / 0.09, 2.0)) * uRing;
    float sector = ang - uPhase;
    float node = pow(0.5 + 0.5 * cos(sector * uBars), 40.0);
    float foot = node * exp(-pow((r - uRadius) / 0.5, 2.0)) * uRing;

    // Burn spokes from each foot toward the middle, wandering.
    float jag = snoise(vec3(r * 1.7, floor(sector * uBars / 6.2831853 + 0.5), uSeed)) * 0.18;
    float spokeAng = abs(fract((sector + jag) * uBars / 6.2831853 + 0.5) - 0.5) * 6.2831853 / uBars * r;
    float spoke = exp(-spokeAng * spokeAng / 0.004) * step(uRadius * (1.0 - uSpokes) - 0.1, r) * step(r, uRadius) * step(0.001, uSpokes);

    // The detonation's starburst scorch.
    float rays = pow(abs(sin(ang * 5.0 + uSeed)), 6.0) * 0.6 + 0.4;
    float star = (1.0 - smoothstep(0.0, uRadius * 0.7 * rays, r)) * uStar;

    float burn = max(max(ring, foot), max(spoke, star * 0.8));
    vec3 hot = mix(uColorCharge, uColorHot, smoothstep(0.5, 1.0, uHeat));
    vec3 col = mix(uColorSoot, hot * 0.3, uHeat * 0.4);
    col += hot * (ring * 1.2 + foot * 2.0 + spoke * 1.4 + star * 0.5) * uHeat * uGlow * uGlobalGlow * uShaderIntensity;

    float soot = max(star, max(ring, spoke)) * (0.7 + 0.3 * (snoise(vec3(p * 3.0, uSeed)) * 0.5 + 0.5));
    float a = max(soot * 0.85, min(burn * uHeat * 2.0, 1.0));
    float n = snoise(vec3(p * 1.5, uSeed * 2.0)) * 0.5 + 0.5;
    float thr = uErode * 1.25 - 0.15;
    a *= smoothstep(thr, thr + 0.12, n);
    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createCageFloorMaterial() {
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
      uExtent: { value: 6 },
      uRadius: { value: 4 },
      uBars: { value: 10 },
      uPhase: { value: 0 },
      uRing: { value: 0 },
      uSpokes: { value: 0 },
      uStar: { value: 0 },
      uHeat: { value: 1 },
      uGlow: { value: 3 },
      uSeed: { value: 0 },
      uErode: { value: 0 },
      uOpacity: { value: 1 },
      uColorSoot: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorCharge: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /** @param {object} s { centre, radius, bars, phase, ring, spokes, star, heat, seed, erode } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uExtent.value = s.radius + 1.2;
    u.uRadius.value = s.radius;
    u.uBars.value = s.bars;
    u.uPhase.value = s.phase;
    u.uRing.value = s.ring;
    u.uSpokes.value = s.spokes;
    u.uStar.value = s.star;
    u.uHeat.value = s.heat;
    u.uGlow.value = c.floorGlow * g.glow;
    u.uSeed.value = s.seed;
    u.uErode.value = s.erode;
    u.uOpacity.value = g.opacity;
    u.uColorSoot.value.copy(getColor(c.colorSoot));
    u.uColorHot.value.copy(getColor(c.colorBoltCore));
    u.uColorCharge.value.copy(getColor(c.colorBoltBody));
  };

  return material;
}

/* ==================================================================== */
/* Ionised air                                                            */
/* ==================================================================== */

const WARP_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    // Juddering, not flowing: noise stepped in time.
    float t = floor(uTime * 24.0) * 0.37;
    vec3 np = vec3(vWorld.xz * 2.2, vWorld.y * 1.4 + t);
    float nx = snoise(np);
    float ny = snoise(np + vec3(11.0, 7.0, 3.0));
    float mask = smoothstep(0.0, 0.1, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y));
    float s = uStrength * uShaderIntensity * mask;
    if (s < 0.002) discard;
    gl_FragColor = vec4(vec2(nx, ny) * 0.5 + 0.5, s, mask);
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
    uniforms: sharedUniforms({ uStrength: { value: 0 } }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} s { strength } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    material.uniforms.uStrength.value = s.strength * c.ionWarp * settings.global.distortion;
  };

  return material;
}
