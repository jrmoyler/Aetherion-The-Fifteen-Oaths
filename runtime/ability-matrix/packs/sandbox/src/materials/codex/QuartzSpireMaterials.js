import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'quartzspire';

/**
 * Quartz Spire — the four bespoke shaders.
 *
 *  - **quartz** (`createQuartzCrystalMaterial`) — opaque, instanced, on
 *    `LAYER.WORLD`. Clear rock crystal is mostly what you see *through* it, so
 *    the shader fakes the inside rather than the surface:
 *      1. a **core** term (pow of N·V): looking straight into a face you look
 *         down the long axis of the crystal and see its warm inner light;
 *      2. **phantoms** — the ghost terminations real quartz grows inside
 *         itself: thin chevron bands that follow the termination's slope,
 *         stacked down the shaft;
 *      3. **veils** — milky noise wisps (fluid inclusions);
 *      4. a **dispersive rim**: the fresnel edge split into a spectrum by hue
 *         shifting with the angle, so every arris throws a rainbow;
 *      5. **bright arrises** off the `aEdge` attribute, the facet lines that
 *         make it read as a cut, hard thing from twenty metres;
 *      6. **the song** — gold bands of light that climb each spire, the
 *         harmonic the choir is holding;
 *      7. a **shatter** dissolve, tip-first, with a white-hot fracture edge.
 *    Per-instance `vec4 aState`: seed, song phase offset, glow (0..1+), shatter (0..1).
 *  - **the choir floor** (`createQuartzFloorMaterial`) — the circle cut into
 *    crystal: radial veins from the heart to every spire, a star polygon
 *    joining the spires, a ring through them, frosted voronoi plates, all
 *    pulsing gold when the choir sings. Erodes raggedly at the end.
 *  - **tip flare** (`createQuartzFlareMaterial`) — a camera-facing six-ray
 *    star at the master spire's point.
 *  - **resonance** (`createQuartzResonanceMaterial`) — an open cylinder over
 *    the circle on `LAYER.DISTORTION`: rings of compression climbing it, the
 *    air ringing with the note.
 *
 * Every material reads `settings.quartzspire` in `userData.sync()`.
 */

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
  vec3 spectrum(float t) {
    return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67)));
  }
`;

/* ==================================================================== */
/* Quartz                                                                 */
/* ==================================================================== */

const CRYSTAL_VERTEX = /* glsl */ `
  attribute vec4  aState;
  attribute float aPart;
  attribute float aFace;
  attribute float aEdge;

  varying vec3  vWorld;
  varying vec3  vLocal;
  varying vec4  vState;
  varying float vPart;
  varying float vFace;
  varying float vEdge;

  void main() {
    vLocal = position;
    vState = aState;
    vPart = aPart;
    vFace = aFace;
    vEdge = aEdge;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CRYSTAL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  uniform vec3  uColorCore;
  uniform vec3  uColorSong;
  uniform vec3  uColorEdge;

  uniform float uCoreGlow;
  uniform float uCoreSharp;
  uniform float uPhantoms;
  uniform float uPhantomGlow;
  uniform float uVeils;
  uniform float uVeilScale;
  uniform float uRimGlow;
  uniform float uDispersion;
  uniform float uEdgeGlow;
  uniform float uEdgeWidth;
  uniform float uEnv;
  uniform float uSpecular;
  uniform float uSongPhase;
  uniform float uSongWidth;
  uniform float uSongGlow;
  uniform float uShatterEdge;
  uniform float uTipLength;

  varying vec3  vWorld;
  varying vec3  vLocal;
  varying vec4  vState;
  varying float vPart;
  varying float vFace;
  varying float vEdge;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    float seed    = vState.x;
    float songOff = vState.y;
    float glow    = vState.z;
    float shatter = vState.w;

    // Height up the point, 0 at the floor line, 1 at the apex.
    float y = clamp(vLocal.y, 0.0, 1.0);

    // 7 · the shatter eats tip-first, along fracture noise.
    float n = snoise(vec3(vLocal * 3.1 + seed * 13.0)) * 0.5 + 0.5;
    float field = (1.0 - y) * 0.7 + n * 0.3;
    float thr = shatter * 1.15 - 0.08;
    if (shatter > 0.0 && field < thr) discard;
    float fracture = shatter > 0.0 ? 1.0 - smoothstep(thr, thr + uShatterEdge, field) : 0.0;

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(N, V) < 0.0) N = -N;
    float facing = clamp(dot(N, V), 0.0, 1.0);

    float isTip = step(0.5, vPart) * (1.0 - step(1.5, vPart));
    // Alternate faces are the broad and the narrow rhombohedra: tint apart.
    float alt = mod(vFace, 2.0);

    // 1 · the core seen down the long axis.
    float core = pow(facing, max(uCoreSharp, 0.2));

    // 2 · phantoms — chevrons following the termination's slope.
    float r = length(vLocal.xz);
    float ph = (y + r * uTipLength * 0.9) * uPhantoms + seed * 3.0;
    float phantom = 1.0 - smoothstep(0.0, 0.08, abs(fract(ph) - 0.5));
    phantom *= smoothstep(0.05, 0.3, y);

    // 3 · veils — milky inclusions drifting slowly.
    float veil = fbm3(vec3(vLocal.xz * uVeilScale, vLocal.y * uVeilScale * 0.5 + seed * 5.0 + uTime * 0.05));
    veil = smoothstep(0.1, 0.8, veil * 0.5 + 0.5) * uVeils;

    vec3 body = mix(uColorDeep, uColorBody, 0.35 + 0.35 * alt + 0.3 * y);
    vec3 col = body * (0.25 + 0.25 * max(dot(N, normalize(uLightDir)), 0.0));
    col += uColorBody * veil * 0.35;
    col += uColorCore * core * uCoreGlow * (0.4 + 0.6 * glow) * (0.6 + 0.4 * y) * (0.35 + 0.65 * veil / max(uVeils, 0.01));
    col += mix(uColorBody, uColorCore, 0.5) * phantom * uPhantomGlow * (0.5 + glow);

    // 4 · the dispersive rim.
    float fres = pow(1.0 - facing, 3.0);
    float hue = dot(N, vec3(0.3, 0.6, 0.2)) * 1.7 + vFace * 0.17 + seed;
    vec3 rainbow = mix(vec3(1.0), spectrum(hue), clamp(uDispersion, 0.0, 1.0));
    col += rainbow * fres * uRimGlow;

    // Cheap sky reflection and a sharp sun glint.
    vec3 R = reflect(-V, N);
    col += texture2D(uEnvMap, equirectUv(R)).rgb * uEnv * (0.2 + fres);
    vec3 H = normalize(normalize(uLightDir) + V);
    col += vec3(pow(max(dot(N, H), 0.0), 90.0) * uSpecular);

    // 5 · bright arrises (and the ridge lines of the termination).
    float e = min(vEdge, 1.0 - vEdge);
    float arris = 1.0 - smoothstep(0.0, uEdgeWidth, e);
    col += uColorEdge * arris * uEdgeGlow * (0.5 + 0.5 * glow);
    col += uColorEdge * isTip * smoothstep(0.85, 1.0, y) * uEdgeGlow * glow * 0.6;

    // 6 · the song climbing.
    float s = fract(uSongPhase + songOff);
    float d = (y - (s * 1.4 - 0.2)) / max(uSongWidth, 0.01);
    float band = exp(-d * d);
    col += uColorSong * band * uSongGlow * glow * (0.5 + 0.5 * core + arris);

    col += uColorEdge * fracture * 5.0;
    col *= uGlobalGlow * mix(1.0, uShaderIntensity, 0.5);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Rock crystal, opaque and instanced. Lives on LAYER.WORLD. */
export function createQuartzCrystalMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorCore: { value: new Color() },
      uColorSong: { value: new Color() },
      uColorEdge: { value: new Color() },
      uCoreGlow: { value: 1.5 },
      uCoreSharp: { value: 3 },
      uPhantoms: { value: 5 },
      uPhantomGlow: { value: 0.6 },
      uVeils: { value: 0.5 },
      uVeilScale: { value: 2 },
      uRimGlow: { value: 2 },
      uDispersion: { value: 0.8 },
      uEdgeGlow: { value: 2 },
      uEdgeWidth: { value: 0.06 },
      uEnv: { value: 0.5 },
      uSpecular: { value: 3 },
      uSongPhase: { value: 0 },
      uSongWidth: { value: 0.12 },
      uSongGlow: { value: 4 },
      uShatterEdge: { value: 0.08 },
      uTipLength: { value: 0.32 }
    }),
    vertexShader: CRYSTAL_VERTEX,
    fragmentShader: CRYSTAL_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {number} songPhase integrated on the CPU so the rate slider never jumps */
  material.userData.sync = (songPhase) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uColorBody.value.copy(getColor(c.colorBody));
    u.uColorDeep.value.copy(getColor(c.colorDeep));
    u.uColorCore.value.copy(getColor(c.colorCore));
    u.uColorSong.value.copy(getColor(c.colorSong));
    u.uColorEdge.value.copy(getColor(c.colorEdge));
    u.uCoreGlow.value = c.coreGlow * g.glow;
    u.uCoreSharp.value = c.coreSharpness;
    u.uPhantoms.value = c.phantoms;
    u.uPhantomGlow.value = c.phantomGlow * g.glow;
    u.uVeils.value = c.veils * g.noiseStrength;
    u.uVeilScale.value = c.veilScale * g.noiseFrequency;
    u.uRimGlow.value = c.rimGlow * g.fresnel * g.glow;
    u.uDispersion.value = c.dispersion;
    u.uEdgeGlow.value = c.edgeGlow * g.glow;
    u.uEdgeWidth.value = c.edgeWidth;
    u.uEnv.value = c.envReflect * g.fresnel;
    u.uSpecular.value = c.specular;
    u.uSongPhase.value = songPhase;
    u.uSongWidth.value = c.songWidth;
    u.uSongGlow.value = c.songGlow * g.glow * g.shaderIntensity;
    u.uShatterEdge.value = c.shatterEdge;
    u.uTipLength.value = c.tipLength;
  };

  return material;
}

/* ==================================================================== */
/* The choir floor                                                        */
/* ==================================================================== */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;
  varying vec2 vP;

  void main() {
    vec2 p = position.xy * uExtent;
    vP = p;
    vec3 world = vec3(uCentre.x + p.x, 0.014, uCentre.z + p.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uRadius;
  uniform float uRing;         // metres, the ring the spires stand on
  uniform float uCount;        // spires in the ring
  uniform float uTurn;         // radians, the ring's rotation
  uniform float uSkip;         // star polygon step
  uniform float uReveal;       // metres the veins have grown out
  uniform float uPulse;        // 0..1+ the choir's swell
  uniform float uSongPhase;
  uniform float uVeinWidth;
  uniform float uVeinGlow;
  uniform float uFrost;
  uniform float uFrostScale;
  uniform float uDark;
  uniform float uErode;
  uniform float uSeed;
  uniform float uOpacity;

  uniform vec3  uColorFloor;
  uniform vec3  uColorVein;
  uniform vec3  uColorSong;

  varying vec2 vP;

  ${noiseGLSL}

  /** F2 - F1 Voronoi: 0 on a cell border. */
  float cellEdges(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 r = g + hash21(dot(n + g, vec2(7.13, 113.17))) - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
    }
    return sqrt(d2) - sqrt(d1);
  }

  float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    vec2 p = vP;
    float r = length(p);
    float ang = atan(p.y, p.x) - uTurn;
    float sector = 6.2831853 / max(uCount, 1.0);

    // Radial vein toward the nearest spire.
    float a0 = floor(ang / sector + 0.5) * sector;
    vec2 dirA = vec2(cos(a0 + uTurn), sin(a0 + uTurn));
    float radial = abs(dot(p, vec2(-dirA.y, dirA.x)));
    radial = r < uRing ? radial : 1e3;

    // Star polygon: spire k joined to spire k + skip.
    float ak = floor(ang / sector) * sector + uTurn;
    float star = 1e3;
    for (int i = 0; i < 2; i++) {
      float a = ak + float(i) * sector;
      vec2 A = vec2(cos(a), sin(a)) * uRing;
      vec2 B = vec2(cos(a + sector * uSkip), sin(a + sector * uSkip)) * uRing;
      vec2 C = vec2(cos(a - sector * uSkip), sin(a - sector * uSkip)) * uRing;
      star = min(star, min(segDist(p, A, B), segDist(p, A, C)));
    }
    float ring = abs(r - uRing);
    float outer = abs(r - uRadius * 0.98);

    float w = uVeinWidth;
    float vein = max(max(1.0 - smoothstep(0.0, w, radial), 1.0 - smoothstep(0.0, w * 0.8, star)),
                     max(1.0 - smoothstep(0.0, w, ring), (1.0 - smoothstep(0.0, w * 1.4, outer)) * 0.8));
    float bloom = exp(-min(min(radial, star), min(ring, outer)) / max(w * 4.0, 1e-3));

    // Frosted plates: voronoi cells with bright seams.
    float frost = (1.0 - smoothstep(0.0, 0.08, cellEdges(p * uFrostScale + uSeed))) * uFrost;

    // Grown out from the heart; a song wave rides outward through it.
    float rag = snoise(vec3(p * 0.9, uSeed)) * 0.4;
    float grown = 1.0 - smoothstep(uReveal - 0.6, uReveal, r + rag);
    float inside = 1.0 - smoothstep(uRadius - 0.3, uRadius + 0.2, r + rag * 0.5);
    float wave = exp(-pow((fract(r * 0.25 - uSongPhase) - 0.5) * 6.0, 2.0));

    float lit = grown * inside;
    float glow = (vein * 1.2 + bloom * 0.35 + frost * 0.5) * uVeinGlow * (0.45 + uPulse * (0.6 + 0.8 * wave));
    vec3 col = uColorFloor + mix(uColorVein, uColorSong, clamp(uPulse * wave, 0.0, 1.0)) * glow * uGlobalGlow * uShaderIntensity;

    float a = max(lit * uDark, min(1.0, glow) * lit);
    float en = snoise(vec3(p * 1.6, uSeed * 3.0)) * 0.5 + 0.5;
    float t = uErode * 1.3 - 0.15;
    a *= smoothstep(t, t + 0.15, mix(en, vein, 0.4));
    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The circle cut into crystal. Normal blending so the floor can darken. */
export function createQuartzFloorMaterial() {
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
      uRadius: { value: 4.5 },
      uRing: { value: 3 },
      uCount: { value: 7 },
      uTurn: { value: 0 },
      uSkip: { value: 2 },
      uReveal: { value: 0 },
      uPulse: { value: 0 },
      uSongPhase: { value: 0 },
      uVeinWidth: { value: 0.05 },
      uVeinGlow: { value: 3 },
      uFrost: { value: 0.5 },
      uFrostScale: { value: 1.5 },
      uDark: { value: 0.5 },
      uErode: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uColorFloor: { value: new Color() },
      uColorVein: { value: new Color() },
      uColorSong: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /** @param {object} s { centre, ring, count, turn, reveal, pulse, songPhase, erode, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uRadius.value = c.zoneRadius;
    u.uExtent.value = c.zoneRadius + 0.6;
    u.uRing.value = s.ring;
    u.uCount.value = s.count;
    u.uTurn.value = s.turn;
    u.uSkip.value = Math.max(1, Math.round(c.starSkip));
    u.uReveal.value = s.reveal;
    u.uPulse.value = s.pulse;
    u.uSongPhase.value = s.songPhase;
    u.uVeinWidth.value = c.veinWidth;
    u.uVeinGlow.value = c.veinGlow * g.glow;
    u.uFrost.value = c.frost * g.noiseStrength;
    u.uFrostScale.value = c.frostScale * g.noiseFrequency;
    u.uDark.value = c.floorDark;
    u.uErode.value = s.erode;
    u.uSeed.value = s.seed;
    u.uOpacity.value = g.opacity;
    u.uColorFloor.value.copy(getColor(c.colorFloor));
    u.uColorVein.value.copy(getColor(c.colorVein));
    u.uColorSong.value.copy(getColor(c.colorSong));
  };

  return material;
}

/* ==================================================================== */
/* Tip flare                                                              */
/* ==================================================================== */

const FLARE_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vUv;

  void main() {
    vUv = position.xy;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = uCenter + (right * position.x + up * position.y) * uSize;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FLARE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uRays;
  uniform float uSeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorRay;
  uniform float uGlobalGlow;
  varying vec2 vUv;

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float a = atan(vUv.y, vUv.x) + uTime * 0.4 + uSeed;
    float rays = pow(abs(cos(a * uRays * 0.5)), 40.0) * (1.0 - r);
    float core = exp(-r * r * 30.0);
    float halo = exp(-r * 5.0) * 0.35;
    vec3 col = uColorCore * core * 3.0 + uColorRay * (rays * 2.0 + halo);
    float m = (core + rays + halo) * uIntensity;
    if (m < 0.003) discard;
    gl_FragColor = vec4(col * uIntensity * uGlobalGlow, 1.0);
  }
`;

/** The master spire's star. Additive, camera-facing. */
export function createQuartzFlareMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 1 },
      uIntensity: { value: 0 },
      uRays: { value: 6 },
      uSeed: { value: 0 },
      uColorCore: { value: new Color() },
      uColorRay: { value: new Color() }
    }),
    vertexShader: FLARE_VERTEX,
    fragmentShader: FLARE_FRAGMENT
  });

  /** @param {object} s { center, intensity, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = c.flareSize;
    u.uIntensity.value = s.intensity * c.flareGlow * g.glow * g.opacity;
    u.uRays.value = Math.max(2, Math.round(c.flareRays));
    u.uSeed.value = s.seed;
    u.uColorCore.value.copy(getColor(c.colorEdge));
    u.uColorRay.value.copy(getColor(c.colorSong));
  };

  return material;
}

/* ==================================================================== */
/* Resonance                                                              */
/* ==================================================================== */

const RES_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RES_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;
  uniform float uBands;
  uniform float uPhase;
  uniform float uSeed;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  ${noiseGLSL}

  void main() {
    // Faded toward the silhouette, so the column never shows a hard edge.
    float facing = abs(dot(normalize(vNormalW), normalize(cameraPosition - vWorld)));
    // Compression rings climbing the column: the derivative of a band, so the
    // world is pushed one way ahead of each ring and the other way behind.
    float x = vUv.y * uBands - uPhase;
    float d = (fract(x) - 0.5) * 4.0;
    float slope = -d * exp(-d * d);
    float wob = snoise(vec3(vWorld.xz * 0.8, vUv.y * 3.0 + uSeed)) * 0.35;
    vec2 dir = vec2(wob, 1.0);
    float mask = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y)) * smoothstep(0.15, 0.7, facing);
    float s = uStrength * uShaderIntensity * mask;
    if (s < 0.002) discard;
    gl_FragColor = vec4(normalize(dir) * clamp(slope * 2.0, -1.0, 1.0) * 0.5 + 0.5, s, mask);
  }
`;

/** The air ringing over the circle. LAYER.DISTORTION — see `createAcidFumeMaterial`. */
export function createQuartzResonanceMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStrength: { value: 0 },
      uBands: { value: 4 },
      uPhase: { value: 0 },
      uSeed: { value: 0 }
    }),
    vertexShader: RES_VERTEX,
    fragmentShader: RES_FRAGMENT
  });

  /** @param {object} s { strength, phase, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStrength.value = s.strength * c.resonanceWarp * g.distortion;
    u.uBands.value = c.resonanceBands;
    u.uPhase.value = s.phase;
    u.uSeed.value = s.seed;
  };

  return material;
}
