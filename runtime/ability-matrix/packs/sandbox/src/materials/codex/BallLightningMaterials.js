import {
  AdditiveBlending,
  Color,
  CustomBlending,
  DoubleSide,
  FrontSide,
  Matrix3,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Vector4
} from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * The bespoke surfaces of Ball Lightning.
 *
 *   - `createOrbMaterial` — the plasma sphere. Noise-displaced in the vertex
 *     stage so its silhouette roils; the noise is sampled through a roll
 *     matrix the ability turns with distance travelled, so the surface visibly
 *     *rolls*. The fragment stage is three looks layered additively: a white
 *     core where the view looks straight in (`|N·V|^k`), a blue-violet fresnel
 *     rim, and electric filaments — the zero set of 3D noise, `pow(1−|n|, k)`,
 *     two octaves crawling in different directions — strobing.
 *   - `createCoreMaterial` — a camera-facing white-hot sprite inside the orb,
 *     with star spikes; it is also the burst's flash.
 *   - `createBoltMaterial` — every bolt: camera-facing ribbons with a hard
 *     white core and a soft blue glow fading to violet at the edge, racing out
 *     from their source (`grow`) with a hot head, plasma crawling along them.
 *   - `createTrackMaterial` — the scorched track along the whole line, on one
 *     floor quad, premultiplied (`One, OneMinusSrcAlpha`) so a single pass both
 *     *darkens* the floor with char and *adds* light: ragged char, heat under
 *     the orb, branching burn veins cooling behind it, embers, a flare of arcs
 *     at every floor strike and the burst's crater.
 *   - `createWarpMaterial` — `LAYER.DISTORTION`: ionised air shimmering round
 *     the orb's skin and the burst's pressure ring.
 *
 * All read `settings.balllightning` through `material.userData.sync`.
 */

/** Floor strike flares the track can show at once. */
export const TRACK_STRIKES = 8;

/* ==================================================================== */
/* The orb                                                               */
/* ==================================================================== */

const ORB_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform mat3  uRoll;
  uniform float uDisplace;
  uniform float uNoiseScale;
  uniform float uBoil;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vQ;
  varying float vD;

  ${noiseGLSL}

  void main() {
    vec3 n = normalize(position);
    vec3 q = uRoll * n;
    float t = uTime * uBoil;
    float d = snoise(q * uNoiseScale + vec3(0.0, t, 0.0)) * 0.65
            + snoise(q * uNoiseScale * 2.3 - vec3(t * 1.4, 0.0, t * 0.6)) * 0.35;
    vec3 p = n * (1.0 + d * uDisplace);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    vQ = q;
    vD = d;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ORB_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uFresnel;
  uniform float uRim;
  uniform float uCore;
  uniform float uCoreSize;
  uniform float uFilGlow;
  uniform float uFilScale;
  uniform float uFilSharp;
  uniform float uFilSpeed;
  uniform float uFlicker;
  uniform float uFlickerRate;
  uniform float uOpacity;
  uniform float uIntensity;
  uniform float uUnstable;   // 0..1 swelling toward the burst
  uniform float uSeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorInner;
  uniform vec3  uColorRim;
  uniform vec3  uColorFil;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vQ;
  varying float vD;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
    float fres = pow(1.0 - ndv, uFresnel);
    float core = pow(ndv, uCoreSize);

    float t = uTime * uFilSpeed;
    vec3 p = vQ * uFilScale;
    float f1 = pow(clamp(1.0 - abs(snoise(p + vec3(0.0, 0.0, t) + uSeed)), 0.0, 1.0), uFilSharp);
    float f2 = pow(clamp(1.0 - abs(snoise(p * 2.1 + vec3(t * 1.3, -t * 0.4, 0.0) + uSeed * 2.0)), 0.0, 1.0), uFilSharp * 1.3);
    float fil = (f1 + f2 * 0.7) * uShaderIntensity;

    float strobe = hash11(floor(uTime * uFlickerRate) + uSeed * 31.0);
    float flick = 1.0 - uFlicker * (0.6 + uUnstable * 0.4) * step(0.55, strobe) * 0.8 + uFlicker * step(strobe, 0.12) * 0.7;

    vec3 color = uColorInner * core * uCore
               + uColorCore * pow(core, 3.0) * uCore * 1.5
               + uColorRim * fres * uRim
               + uColorFil * fil * uFilGlow * (0.45 + 0.55 * fres + uUnstable)
               + uColorCore * smoothstep(0.35, 0.9, vD) * uUnstable * 2.0;
    color *= flick * uIntensity * uGlobalGlow;
    float alpha = clamp(fres + core * 0.7 + fil * 0.5, 0.0, 1.0) * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createOrbMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRoll: { value: new Matrix3() },
      uDisplace: { value: 0.14 },
      uNoiseScale: { value: 2.3 },
      uBoil: { value: 1.8 },
      uFresnel: { value: 2.4 },
      uRim: { value: 2.6 },
      uCore: { value: 3 },
      uCoreSize: { value: 2.2 },
      uFilGlow: { value: 3 },
      uFilScale: { value: 2.8 },
      uFilSharp: { value: 14 },
      uFilSpeed: { value: 2.4 },
      uFlicker: { value: 0.35 },
      uFlickerRate: { value: 22 },
      uOpacity: { value: 0.9 },
      uIntensity: { value: 1.6 },
      uUnstable: { value: 0 },
      uSeed: { value: 0 },
      uColorCore: { value: new Color() },
      uColorInner: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorFil: { value: new Color() }
    }),
    vertexShader: ORB_VERTEX,
    fragmentShader: ORB_FRAGMENT
  });

  /** @param {object} s { roll: Matrix3, unstable, level, seed } */
  material.userData.sync = (s) => {
    const c = settings.balllightning;
    const g = settings.global;
    const u = material.uniforms;
    u.uRoll.value.copy(s.roll);
    u.uDisplace.value = c.orbDisplace * g.noiseStrength * (1 + s.unstable * (c.swellBoil - 1));
    u.uNoiseScale.value = c.orbDisplaceScale * g.noiseFrequency;
    u.uBoil.value = c.orbBoil * g.noiseSpeed * (1 + s.unstable);
    u.uFresnel.value = c.orbFresnel * g.fresnel;
    u.uRim.value = c.orbRim;
    u.uCore.value = c.orbCore;
    u.uCoreSize.value = c.orbCoreSize;
    u.uFilGlow.value = c.filamentGlow;
    u.uFilScale.value = c.filamentScale * g.noiseFrequency;
    u.uFilSharp.value = c.filamentSharp;
    u.uFilSpeed.value = c.filamentSpeed * g.noiseSpeed;
    u.uFlicker.value = c.orbFlicker;
    u.uFlickerRate.value = c.orbFlickerRate;
    u.uOpacity.value = c.orbOpacity * g.opacity;
    u.uIntensity.value = c.orbIntensity * g.glow * s.level;
    u.uUnstable.value = s.unstable;
    u.uSeed.value = s.seed;
    u.uColorCore.value.copy(getColor(c.colorOrbCore));
    u.uColorInner.value.copy(getColor(c.colorOrbInner));
    u.uColorRim.value.copy(getColor(c.colorOrbRim));
    u.uColorFil.value.copy(getColor(c.colorFilament));
  };

  return material;
}

/* ==================================================================== */
/* The hot core sprite                                                   */
/* ==================================================================== */

const CORE_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vP;
  void main() {
    vP = position.xy * 2.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uIntensity;
  uniform float uSpikes;
  uniform float uSeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorGlow;
  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    if (r > 1.0) discard;
    float core = exp(-r * r * 40.0);
    float glow = exp(-r * 4.5) * (1.0 - r);
    vec2 q = rot2(uSeed * 6.28 + floor(uTime * 12.0) * 0.7) * vP;
    float spikes = exp(-abs(q.y) * 60.0) * pow(1.0 - min(abs(q.x), 1.0), 2.5)
                 + exp(-abs(q.x) * 60.0) * pow(1.0 - min(abs(q.y), 1.0), 2.5);
    spikes *= uSpikes;
    vec3 color = uColorCore * (core * 2.0 + spikes) + uColorGlow * glow;
    float alpha = clamp(core + glow + spikes, 0.0, 1.0);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uIntensity * uGlobalGlow, alpha);
  }
`;

export function createCoreMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 1 },
      uIntensity: { value: 2 },
      uSpikes: { value: 0.7 },
      uSeed: { value: 0 },
      uColorCore: { value: new Color() },
      uColorGlow: { value: new Color() }
    }),
    vertexShader: CORE_VERTEX,
    fragmentShader: CORE_FRAGMENT
  });

  /** @param {object} s { size, level, seed } */
  material.userData.sync = (s) => {
    const c = settings.balllightning;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = s.size;
    u.uIntensity.value = c.coreGlow * g.glow * g.shaderIntensity * s.level;
    u.uSpikes.value = c.coreSpikes;
    u.uSeed.value = s.seed;
    // The sprite wears the accent pair: white-hot core, electric halo.
    u.uColorCore.value.copy(getColor(c.colorB));
    u.uColorGlow.value.copy(getColor(c.colorA));
  };

  return material;
}

/* ==================================================================== */
/* Bolts                                                                 */
/* ==================================================================== */

const BOLT_VERTEX = /* glsl */ `
  attribute vec3 aTangent;
  attribute vec4 aCoord;   // side, along, width scale, brightness
  attribute vec2 aState;   // grow, seed

  uniform float uWidth;

  varying vec2  vCoord;
  varying float vBright;
  varying float vWidth;
  varying vec2  vState;

  void main() {
    vState = aState;
    if (aCoord.w <= 0.001 || aCoord.y > aState.x + 0.07) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 tangent = normalize(aTangent + vec3(1e-5));
    vec3 toCam = normalize(cameraPosition - world);
    vec3 across = cross(tangent, toCam);
    float l = length(across);
    across = l > 1e-4 ? across / l : vec3(0.0, 1.0, 0.0);
    float width = uWidth * aCoord.z;
    world += across * aCoord.x * width;
    vCoord = aCoord.xy;
    vBright = aCoord.w;
    vWidth = width;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const BOLT_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uCore;
  uniform float uFalloff;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uCrawl;
  uniform float uCrawlScale;
  uniform float uCrawlSpeed;
  uniform float uFlicker;
  uniform vec3  uColorCore;
  uniform vec3  uColorGlow;
  uniform vec3  uColorEdge;

  varying vec2  vCoord;
  varying float vBright;
  varying float vWidth;
  varying vec2  vState;

  ${noiseGLSL}

  void main() {
    float along = vCoord.y;
    float grow = vState.x;
    float seed = vState.y;
    if (along > grow) discard;
    float across = abs(vCoord.x);

    float coreFrac = clamp(uCore / max(vWidth, 1e-4), 0.03, 0.9);
    float aa = fwidth(across) * 1.2;
    float core = 1.0 - smoothstep(coreFrac - aa, coreFrac + aa, across);
    float glow = pow(clamp(1.0 - across, 0.0, 1.0), uFalloff);

    float crawl = snoise(vec3(along * uCrawlScale - uTime * uCrawlSpeed, seed * 7.0, across * 2.0));
    glow *= 1.0 + uCrawl * crawl * uShaderIntensity;
    // The head of a strike still racing out burns hottest.
    float head = smoothstep(grow - 0.15, grow, along) * step(grow, 0.999) * 2.0;
    float strobe = hash11(floor(uTime * 30.0) + seed * 53.0);
    float flick = 1.0 - uFlicker * step(0.7, strobe) * 0.7;

    vec3 tint = mix(uColorEdge, uColorGlow, smoothstep(0.0, 0.7, glow));
    vec3 color = tint * glow + uColorCore * core * (1.0 + head);
    float energy = vBright * flick;
    color *= energy * uIntensity * uGlobalGlow;
    float alpha = clamp(max(glow, core) * energy, 0.0, 1.0) * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
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
      uWidth: { value: 0.15 },
      uCore: { value: 0.02 },
      uFalloff: { value: 2.2 },
      uIntensity: { value: 5 },
      uOpacity: { value: 1 },
      uCrawl: { value: 0.45 },
      uCrawlScale: { value: 12 },
      uCrawlSpeed: { value: 10 },
      uFlicker: { value: 0.5 },
      uColorCore: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorEdge: { value: new Color() }
    }),
    vertexShader: BOLT_VERTEX,
    fragmentShader: BOLT_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.balllightning;
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = c.boltWidth;
    u.uCore.value = c.boltCore;
    u.uFalloff.value = c.boltFalloff;
    u.uIntensity.value = c.boltIntensity * g.glow * g.shaderIntensity;
    u.uOpacity.value = c.boltOpacity * g.opacity;
    u.uCrawl.value = c.boltCrawl * g.noiseStrength;
    u.uCrawlScale.value = c.boltCrawlScale * g.noiseFrequency;
    u.uCrawlSpeed.value = c.boltCrawlSpeed * g.noiseSpeed;
    u.uFlicker.value = c.boltFlicker;
    u.uColorCore.value.copy(getColor(c.colorBoltCore));
    u.uColorGlow.value.copy(getColor(c.colorBoltGlow));
    u.uColorEdge.value.copy(getColor(c.colorBoltEdge));
  };

  return material;
}

/* ==================================================================== */
/* The scorched track                                                    */
/* ==================================================================== */

/**
 * One floor quad over the whole line: uv.y runs origin → end (`uLength`
 * metres), uv.x across (`uHalf` metres either side). Everything is measured in
 * metres from those two.
 *
 * Premultiplied output: `rgb` is the light the track *adds* plus the char
 * colour times its coverage, `a` is the char's coverage, and the blend
 * `One, OneMinusSrcAlpha` darkens the floor under the char while adding the
 * glow on top — so the burn lines read as glowing *in* a black scar.
 *
 * "How long ago the orb passed here" is `(front − along) / speed + after`,
 * which cools the veins behind the orb in a gradient and keeps cooling them
 * once it has stopped.
 */
const TRACK_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRACK_FRAGMENT = /* glsl */ `
  precision highp float;
  #define MAX_STRIKES ${TRACK_STRIKES}

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uLength;
  uniform float uHalf;
  uniform float uWidth;
  uniform float uStart;
  uniform float uFront;
  uniform float uSpeed;
  uniform float uAfter;
  uniform float uFade;
  uniform float uChar;
  uniform float uEdgeNoise;
  uniform float uEdgeScale;
  uniform float uHeat;
  uniform float uHeatLength;
  uniform float uCool;
  uniform float uVeins;
  uniform float uVeinScale;
  uniform float uVeinSharp;
  uniform float uEmbers;
  uniform float uStrikeGlow;
  uniform float uSeed;
  uniform vec4  uStrikes[MAX_STRIKES]; // along, across, heat, radius
  uniform vec4  uCrater;               // along, radius, heat, on
  uniform vec3  uColorChar;
  uniform vec3  uColorHot;
  uniform vec3  uColorEmber;

  varying vec2 vUv;

  ${noiseGLSL}

  float veins(vec2 p, float scale, float sharp, float seed) {
    float n = snoise(vec3(p * scale, seed)) + 0.4 * snoise(vec3(p * scale * 2.3, seed + 3.7));
    return pow(clamp(1.0 - abs(n), 0.0, 1.0), sharp);
  }

  void main() {
    float along = vUv.y * uLength;
    float across = (vUv.x - 0.5) * 2.0 * uHalf;
    vec2 p = vec2(across, along);

    vec3 light = vec3(0.0);
    float cover = 0.0;

    /* ---- the track itself, from its start to wherever the orb is ---- */
    float edge = uWidth * (1.0 + uEdgeNoise * snoise(vec3(along * uEdgeScale, uSeed, 0.0)));
    // Rounded at both ends: distance to the segment [start, front].
    float a = clamp(along, uStart, max(uStart, uFront));
    float d = length(vec2(across, along - a));
    float band = 1.0 - smoothstep(edge * 0.55, edge, d);
    float soot = 1.0 - smoothstep(edge, edge * 1.8, d);
    if (uFront > uStart) {
      cover = max(band * uChar, soot * uChar * 0.35);
      float ago = max(0.0, (uFront - along) / max(uSpeed, 0.1)) + uAfter;
      float cool = exp(-ago / max(uCool, 0.02));
      float behind = along <= uFront ? exp(-(uFront - along) / max(uHeatLength, 0.05)) : 0.0;
      float under = exp(-d * d * 2.0 / max(edge * edge, 1e-3));
      light += uColorHot * behind * under * uHeat * (0.75 + 0.25 * snoise(vec3(p * 3.0, uTime * 6.0)));
      float v = veins(p, uVeinScale, uVeinSharp, uSeed);
      light += mix(uColorEmber, uColorHot, cool) * v * band * cool * uVeins;
      // Embers: sparse glints that cool more slowly.
      vec2 cell = floor(p * 7.0);
      float h = hash13(vec3(cell, uSeed));
      float ember = step(0.965, h) * band * exp(-ago / max(uCool * 3.0, 0.05));
      ember *= 0.6 + 0.4 * sin(uTime * (6.0 + h * 10.0) + h * 40.0);
      light += uColorEmber * ember * uEmbers * 2.5;
    }

    /* ---- the burst's crater ---- */
    if (uCrater.w > 0.5) {
      vec2 cp = vec2(across, along - uCrater.x);
      float cr = length(cp);
      float R = uCrater.y * (1.0 + 0.25 * snoise(vec3(normalize(cp + 1e-4) * 2.0, uSeed)));
      float crater = 1.0 - smoothstep(R * 0.6, R, cr);
      cover = max(cover, crater * uChar);
      float rays = veins(vec2(atan(cp.y, cp.x) * 1.4, cr * 0.6), uVeinScale * 1.4, uVeinSharp, uSeed + 9.0);
      light += mix(uColorEmber, uColorHot, uCrater.z) * rays * crater * (0.25 + uCrater.z) * uVeins * 1.5;
      // Clamped to a finite reach: a bare exponential never reaches zero and lit the quad's edges.
      light += uColorHot * exp(-cr * 1.5 / max(uCrater.y, 0.1)) * (1.0 - smoothstep(uCrater.y * 1.1, uCrater.y * 2.2, cr)) * uCrater.z * uHeat;
    }

    /* ---- strike flares: a disc of arcs round each fresh strike ---- */
    for (int i = 0; i < MAX_STRIKES; i++) {
      vec4 s = uStrikes[i];
      if (s.z <= 0.0) continue;
      vec2 sp = vec2(across - s.y, along - s.x);
      float sd = length(sp);
      if (sd > s.w * 1.5) continue;
      float arc = veins(sp + s.xy, uVeinScale * 3.0, uVeinSharp * 0.8, uSeed + float(i) * 1.7);
      float disc = 1.0 - smoothstep(0.0, s.w, sd);
      float hot = 1.0 - smoothstep(0.0, s.w * 0.3, sd);
      light += (uColorHot * arc * disc + uColorHot * hot * 1.5) * s.z * uStrikeGlow;
      cover = max(cover, disc * disc * uChar * 0.6);
    }

    // Nothing may reach the quad's own border, whatever the sliders say.
    float border = (1.0 - smoothstep(0.8, 1.0, abs(vUv.x - 0.5) * 2.0))
                 * smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.94, 1.0, vUv.y));
    light *= uFade * uGlobalGlow * uShaderIntensity * border;
    cover *= uFade * border;
    if (cover < 0.002 && max(light.r, max(light.g, light.b)) < 0.002) discard;
    gl_FragColor = vec4(light + uColorChar * cover, cover);
  }
`;

export function createTrackMaterial() {
  const strikes = [];
  for (let i = 0; i < TRACK_STRIKES; i++) strikes.push(new Vector4(0, 0, 0, 0));

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      uLength: { value: 10 },
      uHalf: { value: 4 },
      uWidth: { value: 0.7 },
      uStart: { value: 0.8 },
      uFront: { value: 0 },
      uSpeed: { value: 5 },
      uAfter: { value: 0 },
      uFade: { value: 1 },
      uChar: { value: 0.8 },
      uEdgeNoise: { value: 0.4 },
      uEdgeScale: { value: 1.6 },
      uHeat: { value: 3 },
      uHeatLength: { value: 1.6 },
      uCool: { value: 1 },
      uVeins: { value: 2 },
      uVeinScale: { value: 2.2 },
      uVeinSharp: { value: 12 },
      uEmbers: { value: 1 },
      uStrikeGlow: { value: 3 },
      uSeed: { value: 0 },
      uStrikes: { value: strikes },
      uCrater: { value: new Vector4(0, 0, 0, 0) },
      uColorChar: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorEmber: { value: new Color() }
    }),
    vertexShader: TRACK_VERTEX,
    fragmentShader: TRACK_FRAGMENT
  });

  /** Strike flares, written in place by the ability: (along, across, heat, radius). */
  material.userData.strikes = strikes;

  /** @param {object} s { length, half, front, speed, after, fade, seed, crater: Vector4 } */
  material.userData.sync = (s) => {
    const c = settings.balllightning;
    const g = settings.global;
    const u = material.uniforms;
    u.uLength.value = s.length;
    u.uHalf.value = s.half;
    u.uWidth.value = Math.max(0.02, c.trackWidth);
    u.uStart.value = c.trackStart;
    u.uFront.value = s.front;
    u.uSpeed.value = s.speed;
    u.uAfter.value = s.after;
    u.uFade.value = s.fade;
    u.uChar.value = c.trackChar * g.opacity;
    u.uEdgeNoise.value = c.trackEdgeNoise * g.noiseStrength;
    u.uEdgeScale.value = c.trackEdgeScale * g.noiseFrequency;
    u.uHeat.value = c.trackHeat * g.glow;
    u.uHeatLength.value = c.trackHeatLength;
    u.uCool.value = c.trackCool * g.lifetime;
    u.uVeins.value = c.trackVeins * g.glow;
    u.uVeinScale.value = c.trackVeinScale * g.noiseFrequency;
    u.uVeinSharp.value = c.trackVeinSharp;
    u.uEmbers.value = c.trackEmbers * g.glow;
    u.uStrikeGlow.value = c.strikeGlow * g.glow;
    u.uSeed.value = s.seed;
    u.uCrater.value.copy(s.crater);
    u.uColorChar.value.copy(getColor(c.colorTrackChar));
    u.uColorHot.value.copy(getColor(c.colorTrackHot));
    u.uColorEmber.value.copy(getColor(c.colorTrackEmber));
  };

  return material;
}

/* ==================================================================== */
/* Distortion — LAYER.DISTORTION                                         */
/* ==================================================================== */

/**
 * A camera-facing quad round the orb. Ionised air bends hardest at the
 * plasma's skin, so the steady mask is a soft band at `uSkin` (the orb's
 * radius as a fraction of the half-quad), its offset pointing outward plus
 * noise; the burst adds a pressure ring that runs out across the quad.
 */
const WARP_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vUv;
  varying vec2 vWorldXY;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    vWorldXY = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz + position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;
  uniform float uBurst;
  uniform float uSkin;
  uniform float uRing;
  uniform float uScale;
  uniform float uSpeed;
  varying vec2 vUv;
  varying vec2 vWorldXY;

  ${noiseGLSL}

  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float r = length(c);
    if (r > 1.0) discard;
    vec3 np = vec3(c * uScale * 2.0 + vWorldXY * 0.2, uTime * uSpeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(13.1, 7.7, 3.3)));
    float sd = (r - uSkin) / 0.18;
    float skin = exp(-sd * sd) * uStrength;
    float ring = 0.0;
    if (uRing >= 0.0) {
      float d = (r - uRing) / 0.1;
      ring = exp(-d * d) * (1.0 - uRing) * uBurst;
    }
    vec2 out2 = c / max(r, 1e-3);
    vec2 dir = normalize(out2 * (0.5 + ring) + n * 0.8 + 1e-4);
    float mask = clamp(skin + ring, 0.0, 1.0);
    float strength = (skin + ring) * uShaderIntensity;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
  }
`;

export function createWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 2 },
      uStrength: { value: 0 },
      uBurst: { value: 0 },
      uSkin: { value: 0.3 },
      uRing: { value: -1 },
      uScale: { value: 2 },
      uSpeed: { value: 3 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} s { size, skin, level, ring } */
  material.userData.sync = (s) => {
    const c = settings.balllightning;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = s.size;
    u.uSkin.value = s.skin;
    u.uStrength.value = c.warpStrength * g.distortion * s.level;
    u.uBurst.value = c.warpBurst * g.distortion;
    u.uRing.value = s.ring;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
  };

  return material;
}
