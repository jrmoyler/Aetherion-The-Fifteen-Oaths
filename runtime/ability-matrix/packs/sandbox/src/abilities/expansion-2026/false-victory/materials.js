import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * False Victory — the bespoke shaders. Every material reads
 * `settings.falseVictory` in `userData.sync(state)`, so the editor reshapes a
 * cast that is already standing.
 *
 *  - **lacquer** — the laurel's leaves and stem. Lit matter, not light: a
 *    Blinn-Phong sun term off the shared `uLightDir`, a dark violet body that
 *    sits at the ramp's deep stop, a midrib and side veins that glow from
 *    under the varnish, and a thin-film rim that cycles cyan → magenta with
 *    the view angle (the illusion's tell: the crown is the wrong colour from
 *    every side). Dissolves through noise with a burning tint edge on exit.
 *  - **effigy** — the chess kings. Black obsidian lacquer with a fake mirror
 *    reflection (the reflected ray indexes the four-stop ramp, so each king
 *    holds a little violet sky), a voronoi crack network in its own space
 *    that heats up as the reveal approaches (`aState.x`), a dissolve that
 *    eats it from the cracks outward after the reveal (`aState.y`) and a
 *    flash on the topple's landing (`aState.z`).
 *  - **dais** — the floor: a black/violet chessboard in metres, lit grout,
 *    glitching tiles that flip colour, a thin-film sheen, an engraved laurel
 *    rim band, the reveal's pressure ring, and a noise dissolve. Normal
 *    blending — it *darkens* the floor; that is the deep tone.
 *  - **stage light** — an open cone reshaped in the vertex stage, brightest
 *    where the view ray crosses most of it (`|N·V|`), dust drifting in it.
 *  - **mirage** — `LAYER.DISTORTION` disc: a shimmer over the dais while the
 *    illusion holds, a pressure ring at the reveal.
 */

const ID = config.id;

/* -------------------------------------------------------------------- */
/* Shared vertex stage for lit solids (instanced or not)                 */
/* -------------------------------------------------------------------- */

const SOLID_VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute vec3 aState;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec2 vUv;
  varying float vSeed;
  varying vec3 vState;
  void main() {
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 world = modelMatrix * local;
    vWorld = world.xyz;
    vLocal = position;
    vNormalW = normalize(mat3(modelMatrix) * n);
    vUv = uv;
    vSeed = aSeed;
    vState = aState;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/* -------------------------------------------------------------------- */
/* Lacquer — the laurel                                                  */
/* -------------------------------------------------------------------- */

const LACQUER_FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  uniform vec3 uFilm;
  uniform vec3 uLightDir;
  uniform float uRough;
  uniform float uSpec;
  uniform float uFilmK;
  uniform float uGlowK;
  uniform float uDissolve;
  uniform float uFlash;
  uniform float uNoise;
  uniform float uScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec2 vUv;
  varying float vSeed;
  ${noiseGLSL}

  void main() {
    // Exit: whole leaves go first (seeded), then the noise eats the rest.
    float d = snoise01(vWorld * 2.4 * uScale + vSeed * 13.0) * 0.6 + vSeed * 0.4;
    if (d < uDissolve) discard;
    float edge = uDissolve > 0.0 ? 1.0 - smoothstep(uDissolve, uDissolve + 0.07, d) : 0.0;

    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndl = max(dot(N, L), 0.0);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    // Veins under the varnish: midrib and herringbone side veins.
    float across = abs(vUv.y - 0.5);
    float rib = exp(-pow(across * 28.0, 2.0)) * smoothstep(0.0, 0.15, vUv.x);
    float side = pow(abs(sin((vUv.x * 7.0 - across * 5.0) * 3.14159)), 22.0) * smoothstep(0.08, 0.3, vUv.x) * (1.0 - smoothstep(0.3, 0.5, across));
    float grain = (fbm3(vWorld * 7.0 * uScale) - 0.5) * uNoise;

    vec3 albedo = mix(uDeep * 1.8, uBody * 0.42, clamp(0.28 + 0.45 * vSeed + grain, 0.0, 1.0));
    float shine = mix(90.0, 10.0, uRough);
    float spec = pow(max(dot(N, H), 0.0), shine) * uSpec;
    float fres = pow(1.0 - ndv, 3.0);
    float film = fres * 1.7 + vSeed * 0.41 + dot(N, vec3(0.31, 0.52, 0.17));
    vec3 filmCol = mix(uFilm, uTint, 0.5 + 0.5 * cos(6.2831853 * film));

    vec3 col = albedo * (0.16 + 0.95 * ndl);
    col += filmCol * fres * uFilmK * uShaderIntensity;
    col += mix(uTint, uCore, 0.5) * spec;
    col += uBody * (rib * 0.9 + side * 0.45) * uGlowK * uGlobalGlow;
    col += uTint * edge * 3.0 * uGlobalGlow;
    col += uCore * uFlash;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Lit lacquer for the laurel leaves and stems. Solid, opaque. */
export function createLacquerMaterial() {
  const material = new ShaderMaterial({
    side: DoubleSide,
    uniforms: sharedUniforms({
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
      uFilm: { value: new Color() },
      uRough: { value: 0.3 },
      uSpec: { value: 1.5 },
      uFilmK: { value: 1 },
      uGlowK: { value: 0.3 },
      uDissolve: { value: 0 },
      uFlash: { value: 0 },
      uNoise: { value: 1 },
      uScale: { value: 1 },
    }),
    vertexShader: SOLID_VERTEX,
    fragmentShader: LACQUER_FRAGMENT,
  });
  /** @param {object} s { dissolve, flash, glow } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uDeep.value.copy(getColor(c.colorDeep));
    u.uFilm.value.copy(getColor(c.colorFilm));
    u.uRough.value = c.lacquerRough;
    u.uSpec.value = c.lacquerSpec;
    u.uFilmK.value = c.filmStrength * g.fresnel;
    u.uGlowK.value = c.lacquerGlow * s.glow;
    u.uDissolve.value = s.dissolve;
    u.uFlash.value = s.flash;
    u.uNoise.value = 0.5 * g.noiseStrength;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Effigy — the kings                                                    */
/* -------------------------------------------------------------------- */

const EFFIGY_FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  uniform vec3 uFilm;
  uniform vec3 uLightDir;
  uniform float uGloss;
  uniform float uCrackGlow;
  uniform float uFilmK;
  uniform float uScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec2 vUv;
  varying float vSeed;
  varying vec3 vState;   // x crack 0..1, y dissolve 0..1, z flash
  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    // Cracks in the effigy's own space, so they ride the body as it falls.
    vec2 cp = vec2(vUv.x * 7.0, vLocal.y * 5.0) * uScale + vSeed * 11.0;
    vec2 vor = voronoi2(cp + vec2(snoise(vec3(cp * 0.7, vSeed)) * 0.25));
    vec2 vor2 = voronoi2(cp * 2.3 + 4.1);
    float seam = 1.0 - smoothstep(0.0, 0.09 + 0.06 * vState.x, vor.x);
    float fine = 1.0 - smoothstep(0.0, 0.05, vor2.x);
    float cracks = max(seam, fine * 0.5) * smoothstep(0.02, 0.4, vState.x);

    // Dissolve from the cracks outward, then by cell.
    float cut = vState.y * 1.25 - (1.0 - vor.x) * 0.25 - vor.y * 0.2;
    float n = snoise01(vLocal * 6.0 + vSeed * 3.0);
    if (n < cut) discard;
    float edge = vState.y > 0.0 ? 1.0 - smoothstep(cut, cut + 0.08, n) : 0.0;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndl = max(dot(N, L), 0.0);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    vec3 R = reflect(-V, N);

    // A fake mirror: the reflected ray reads the ramp from deep (below the
    // horizon) through body to a pale tint sky — obsidian holding a violet room.
    float sky = R.y * 0.5 + 0.5;
    vec3 env = gradient4(uDeep * 0.5, uDeep * 1.4, uBody * 0.45, uBody * 0.8, sky);
    float fres = pow(1.0 - ndv, 4.0);
    float film = fres * 2.0 + vSeed * 0.3 + vLocal.y;
    vec3 filmCol = mix(uFilm, uTint, 0.5 + 0.5 * cos(6.2831853 * film));

    vec3 col = uDeep * 1.3 * (0.2 + 0.8 * ndl);
    col += env * (0.1 + 0.6 * fres);
    col += uCore * pow(max(dot(N, H), 0.0), 70.0) * uGloss;
    col += filmCol * fres * uFilmK * 0.45 * uShaderIntensity;
    vec3 hot = gradient4(uCore, uTint, uBody, uDeep, 1.0 - vState.x * 0.85);
    col += hot * cracks * uCrackGlow * uGlobalGlow;
    col += uTint * edge * 3.0 * uGlobalGlow;
    col += mix(uTint, uCore, 0.4) * vState.z;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Lit obsidian lacquer for the instanced kings. Solid, opaque. */
export function createEffigyMaterial() {
  const material = new ShaderMaterial({
    side: FrontSide,
    uniforms: sharedUniforms({
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
      uFilm: { value: new Color() },
      uGloss: { value: 1.4 },
      uCrackGlow: { value: 2.5 },
      uFilmK: { value: 1 },
      uScale: { value: 1 },
    }),
    vertexShader: SOLID_VERTEX,
    fragmentShader: EFFIGY_FRAGMENT,
  });
  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uDeep.value.copy(getColor(c.colorDeep));
    u.uFilm.value.copy(getColor(c.colorFilm));
    u.uGloss.value = c.kingGloss;
    u.uCrackGlow.value = c.crackGlow;
    u.uFilmK.value = c.filmStrength * g.fresnel;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Dais — the floor                                                      */
/* -------------------------------------------------------------------- */

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const DAIS_FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  uniform vec3 uFilm;
  uniform float uRadius;
  uniform float uTile;
  uniform float uClock;
  uniform float uFlipRate;
  uniform float uGlow;
  uniform float uGrout;
  uniform float uSheen;
  uniform float uRim;
  uniform float uOpacity;
  uniform float uGrow;      // 0..1 the dais spreads out from the centre on landing
  uniform float uEnergy;    // the triumph's brightness envelope
  uniform float uShock;     // reveal ring radius 0..1, < 0 off
  uniform float uDissolve;
  uniform float uScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}

  void main() {
    vec2 q = (vUv - 0.5) * 2.0;
    float r = length(q);
    if (r > 1.0) discard;
    vec2 p = q * uRadius;                         // metres from the centre
    float a = atan(q.y, q.x);

    // Spread from the centre on landing, with a ragged noisy front.
    float front = uGrow * 1.08 - (snoise(vec3(q * 3.0, 1.7)) * 0.05);
    if (r > front) discard;
    float frontGlow = exp(-abs(r - front) * 30.0) * step(uGrow, 0.999);

    // The chessboard in metres.
    vec2 cell = p / uTile;
    vec2 id = floor(cell);
    vec2 f = fract(cell) - 0.5;
    float parity = mod(id.x + id.y, 2.0);
    // Tiles that flip colour for a beat — the board cannot agree with itself.
    float slot = floor(uClock * uFlipRate + hash11(dot(id, vec2(3.1, 7.7))) * 4.0);
    float flip = step(0.86, hash11(dot(id, vec2(12.9, 78.2)) + slot * 1.37));
    parity = abs(parity - flip);
    float grout = exp(-(0.5 - max(abs(f.x), abs(f.y))) * 70.0);

    vec3 dark = uDeep * 0.55;
    vec3 light = mix(uDeep * 1.5, uBody * 0.32, 0.5 + 0.5 * snoise(vec3(p * 0.6 * uScale, 3.0)));
    vec3 col = mix(dark, light, parity);
    // Thin-film sheen sliding across the lacquered tiles.
    float sheen = pow(0.5 + 0.5 * sin(dot(p, vec2(0.7, 0.5)) * 1.3 - uClock * 1.2), 6.0);
    col += mix(uFilm, uTint, parity) * sheen * uSheen * 0.25 * uShaderIntensity;
    col += mix(uBody, uTint, 0.4) * grout * uGrout * 0.55 * uEnergy;
    col += uBody * flip * 0.3 * uEnergy;

    // The engraved laurel rim band.
    float band = smoothstep(1.0 - uRim, 1.0 - uRim + 0.02, r) * (1.0 - smoothstep(0.975, 0.99, r));
    float leafA = fract(a * 36.0 / 6.2831853);
    float leafR = (r - (1.0 - uRim)) / uRim;
    float leaf = 1.0 - smoothstep(0.0, 0.08, abs(leafR - 0.5 - (leafA - 0.5) * 0.7) - 0.18 * sin(3.14159 * leafA));
    float rimLines = exp(-abs(r - (1.0 - uRim)) * 160.0) + exp(-abs(r - 0.98) * 160.0);
    col = mix(col, uDeep * 0.4, band * 0.8);
    col += uBody * band * leaf * 0.55 * uEnergy + mix(uBody, uTint, 0.5) * rimLines * 0.8 * uEnergy;

    // The reveal's pressure ring.
    float shock = uShock >= 0.0 ? exp(-abs(r - uShock) * 22.0) * (1.0 - uShock) : 0.0;
    col += mix(uTint, uCore, 0.5) * shock * 2.5;
    col += uTint * frontGlow * 1.5;

    // Exit through noise, with a hot edge.
    float d = snoise01(vec3(p * 0.9 * uScale, 5.0)) * 0.85 + (1.0 - r) * 0.15;
    if (d < uDissolve) discard;
    float edge = uDissolve > 0.0 ? 1.0 - smoothstep(uDissolve, uDissolve + 0.06, d) : 0.0;
    col += uTint * edge * 2.0;

    float alpha = uOpacity * (1.0 - smoothstep(0.96, 1.0, r));
    alpha = max(alpha, clamp(shock + edge + frontGlow, 0.0, 1.0));
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, alpha);
  }
`;

/** The chessboard dais. Normal blending: it darkens what it covers. */
export function createDaisMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
      uFilm: { value: new Color() },
      uRadius: { value: 3 },
      uTile: { value: 0.6 },
      uClock: { value: 0 },
      uFlipRate: { value: 1 },
      uGlow: { value: 1 },
      uGrout: { value: 1 },
      uSheen: { value: 1 },
      uRim: { value: 0.12 },
      uOpacity: { value: 0.9 },
      uGrow: { value: 0 },
      uEnergy: { value: 1 },
      uShock: { value: -1 },
      uDissolve: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: DAIS_FRAGMENT,
  });
  /** @param {object} s { radius, clock, grow, energy, shock, dissolve, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uDeep.value.copy(getColor(c.colorDeep));
    u.uFilm.value.copy(getColor(c.colorFilm));
    u.uRadius.value = s.radius;
    u.uTile.value = Math.max(0.05, c.tileSize);
    u.uClock.value = s.clock;
    u.uFlipRate.value = c.flipRate;
    u.uGlow.value = c.daisGlow * g.glow;
    u.uGrout.value = c.groutGlow;
    u.uSheen.value = c.sheen * g.fresnel;
    u.uRim.value = Math.max(0.02, c.rimWidth);
    u.uOpacity.value = c.daisOpacity * g.opacity * s.fade;
    u.uGrow.value = s.grow;
    u.uEnergy.value = s.energy;
    u.uShock.value = s.shock;
    u.uDissolve.value = s.dissolve;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The stage light                                                       */
/* -------------------------------------------------------------------- */

const SPOT_VERTEX = /* glsl */ `
  uniform float uTop;      // top radius (m)
  uniform float uBottom;   // bottom radius (m)
  uniform float uHeight;   // m
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying float vH;
  varying vec2 vUv;
  void main() {
    float h = position.y;                 // 0 at the floor .. 1 at the lamp
    float rad = mix(uBottom, uTop, h);
    vec3 p = vec3(position.x * rad, h * uHeight, position.z * rad);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    // Cone normal: radial, tipped by the slope.
    vec3 n = normalize(vec3(position.x, (uBottom - uTop) / max(uHeight, 0.01), position.z));
    vNormalW = normalize(mat3(modelMatrix) * n);
    vH = h;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SPOT_FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform float uGlow;
  uniform float uDust;
  uniform float uFade;
  uniform float uClock;
  uniform float uScale;
  uniform float uGlobalGlow;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying float vH;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    // Volume: brightest where the ray crosses the most beam (N·V), not at the rim.
    float body = pow(abs(dot(normalize(vNormalW), V)), 1.6);
    float fall = pow(1.0 - vH, 0.7) * smoothstep(0.0, 0.12, vH);
    float dust = 0.55 + uDust * (fbm3(vec3(vWorld.xz * 1.8 * uScale, vWorld.y * 0.6 - uClock * 0.35)) - 0.3);
    vec3 col = mix(uBody, mix(uTint, uCore, vH), 0.35 + 0.5 * vH);
    float a = body * fall * max(dust, 0.0) * uFade;
    gl_FragColor = vec4(col * a * uGlow * uGlobalGlow, a);
  }
`;

/** The volumetric stage light poured onto the dais. Additive. */
export function createSpotMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uTop: { value: 0.3 },
      uBottom: { value: 3 },
      uHeight: { value: 7 },
      uGlow: { value: 0.5 },
      uDust: { value: 0.8 },
      uFade: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: SPOT_VERTEX,
    fragmentShader: SPOT_FRAGMENT,
  });
  /** @param {object} s { radius, fade, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uTop.value = c.spotTopRadius;
    u.uBottom.value = s.radius * c.spotSpread;
    u.uHeight.value = c.spotHeight;
    u.uGlow.value = c.spotGlow * g.glow;
    u.uDust.value = c.spotDust * g.noiseStrength;
    u.uFade.value = s.fade * g.opacity;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The mirage (distortion)                                               */
/* -------------------------------------------------------------------- */

const MIRAGE_FRAGMENT = /* glsl */ `
  uniform float uShimmer;
  uniform float uShock;
  uniform float uWave;
  uniform float uClock;
  uniform float uScale;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    vec2 radial = q / max(r, 1e-3);
    float body = 1.0 - smoothstep(0.55, 1.0, r);
    float ring = exp(-pow((r - uWave) / 0.09, 2.0));
    // Heat-mirage shimmer: vertical-ish bands that crawl, like air over a stage.
    vec3 np = vec3(q * 3.2 * uScale, uClock * 0.9);
    vec2 n = vec2(snoise(np), snoise(np + vec3(8.1, 2.7, 4.4)));
    vec2 dir = n * body * uShimmer + radial * ring * uShock;
    float mask = 1.0 - smoothstep(0.9, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(body * uShimmer + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** `LAYER.DISTORTION` disc; opaque so the transparency router leaves it alone. */
export function createMirageMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uShimmer: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: MIRAGE_FRAGMENT,
  });
  /** @param {object} s { shimmer, shock, wave, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uShimmer.value = s.shimmer * c.mirageStrength * g.distortion;
    u.uShock.value = s.shock * c.revealWarp * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
