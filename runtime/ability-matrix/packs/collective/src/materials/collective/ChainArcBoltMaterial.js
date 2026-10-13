import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * One strike of the Chain Arc — a camera-facing ribbon of plasma.
 *
 * The geometry (see `assets/collective/ChainArcGeometry.js`) is only a *centre
 * line*: every vertex sits on the channel and carries the tangent there and a
 * side of −1 or +1. The vertex stage swings each pair apart across the view
 * direction, so the ribbon is always seen face-on however the camera orbits —
 * a flat strip of lightning seen edge-on is a hairline, and lightning is never
 * a hairline.
 *
 * The fragment stage draws two profiles across that strip:
 *
 *  - a **core** — a hard, narrow, white-hot band of `uCoreWidth` metres, which
 *    is what the eye reads as the actual discharge;
 *  - a **glow** — `pow(1 − |side|, uFalloff)` out to the ribbon's edge, tinted
 *    from the glow colour to the violet edge colour as it thins.
 *
 * Over them, three time effects, all hash- or noise-driven so nothing pulses on
 * a clock:
 *
 *  - **grow**: a strike races from its source to its target over `growTime`.
 *    `aCoord.y` is how far along the bolt a vertex is (forks inherit it from
 *    their parent point), anything past `uGrow` is discarded, and a hot head
 *    rides the cut;
 *  - **flicker**: the whole ribbon strobes on a per-bolt hash of quantised time
 *    — lightning does not dim smoothly, it drops out for a frame;
 *  - **crackle**: as a strike dies it tears into pieces along its length rather
 *    than fading as one object — a hash per piece against `uBreak`.
 */
const BOLT_VERTEX = /* glsl */ `
  attribute vec3 aTangent;
  attribute vec4 aCoord;   // x side -1/+1, y along 0..1+, z width factor, w brightness

  uniform float uGlowWidth;
  uniform float uWidthScale;

  varying vec2  vCoord;
  varying float vBright;
  varying float vWidth;

  void main() {
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 tangent = normalize(mat3(modelMatrix) * aTangent + vec3(1e-5));
    vec3 toCamera = normalize(cameraPosition - world);

    // Perpendicular to the channel *and* to the line of sight: the widest the
    // strip can be on screen.
    vec3 across = cross(tangent, toCamera);
    float len = length(across);
    across = len > 1e-4 ? across / len : vec3(0.0, 1.0, 0.0);

    float width = uGlowWidth * uWidthScale * aCoord.z;
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

  uniform float uSeed;
  uniform float uGrow;
  uniform float uLevel;
  uniform float uBreak;
  uniform float uHead;
  uniform float uHeadLength;
  uniform float uCoreWidth;
  uniform float uFalloff;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uFlicker;
  uniform float uFlickerRate;
  uniform float uCrackleScale;
  uniform float uCrawl;
  uniform float uCrawlScale;
  uniform float uCrawlSpeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorGlow;
  uniform vec3  uColorEdge;

  varying vec2  vCoord;
  varying float vBright;
  varying float vWidth;

  ${noiseGLSL}

  void main() {
    float along = vCoord.y;
    // Not there yet: the strike has not raced this far.
    if (along > uGrow || vBright <= 0.0) discard;

    float across = abs(vCoord.x);

    /* --- crackle: the dying bolt tears into pieces --- */
    float piece = floor(along * uCrackleScale + uSeed * 13.0);
    float keep = hash11(piece + floor(uTime * 18.0) * 0.37);
    if (keep < uBreak) discard;

    /* --- profiles --- */
    // Core fraction of the half-width; held to at least a pixel's worth by the
    // derivative so a thin far-off bolt does not shimmer to nothing.
    float coreFrac = clamp(uCoreWidth / max(vWidth, 1e-4), 0.02, 0.9);
    float aa = fwidth(across) * 1.2;
    float core = 1.0 - smoothstep(coreFrac - aa, coreFrac + aa, across);
    float glow = pow(clamp(1.0 - across, 0.0, 1.0), uFalloff);

    /* --- plasma crawling along the glow --- */
    float crawl = snoise(vec3(along * uCrawlScale - uTime * uCrawlSpeed, uSeed * 7.0, across * 2.0));
    glow *= 1.0 + uCrawl * crawl * uShaderIntensity;

    /* --- the hot head riding the growth front --- */
    float head = smoothstep(uGrow - uHeadLength, uGrow, along) * uHead;

    /* --- strobe, per bolt, quantised --- */
    float strobe = hash11(floor(uTime * uFlickerRate) + uSeed * 41.0);
    float flick = 1.0 - uFlicker * step(0.62, strobe) * 0.85 + uFlicker * step(strobe, 0.12) * 0.6;

    vec3 tint = mix(uColorEdge, uColorGlow, smoothstep(0.0, 0.7, glow));
    vec3 color = tint * glow + uColorCore * core * (1.0 + head);
    float energy = uLevel * flick * vBright * (1.0 + head * 0.6);

    color *= energy * uIntensity * uGlobalGlow;
    float alpha = clamp(max(glow, core) * energy, 0.0, 1.0) * uOpacity;
    if (alpha < 0.003) discard;

    // Additive: alpha only scales, the colour is light.
    gl_FragColor = vec4(color * uOpacity, alpha);
  }
`;

/**
 * One material per bolt slot — they share a program but each strike has its
 * own envelope, so each has its own uniform boxes for that envelope.
 */
export function createChainBoltMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: Math.random() * 10 },
      uGrow: { value: 1.25 },
      uLevel: { value: 1 },
      uBreak: { value: 0 },
      uHead: { value: 0 },
      uHeadLength: { value: 0.12 },
      uWidthScale: { value: 1 },
      uGlowWidth: { value: 0.34 },
      uCoreWidth: { value: 0.035 },
      uFalloff: { value: 2.4 },
      uIntensity: { value: 4 },
      uOpacity: { value: 1 },
      uFlicker: { value: 0.5 },
      uFlickerRate: { value: 26 },
      uCrackleScale: { value: 18 },
      uCrawl: { value: 0.45 },
      uCrawlScale: { value: 14 },
      uCrawlSpeed: { value: 9 },
      uColorCore: { value: new Color(1, 1, 1) },
      uColorGlow: { value: new Color(0.56, 0.72, 1) },
      uColorEdge: { value: new Color(0.35, 0.24, 1) }
    }),
    vertexShader: BOLT_VERTEX,
    fragmentShader: BOLT_FRAGMENT
  });

  /**
   * @param {object} state { grow, level, brk, head, widthScale, seed } — the
   *   strike's own envelope, which the ability owns. Everything else is read
   *   from `settings.chain` here, so every slider is live mid-strike.
   */
  material.userData.sync = (state) => {
    const c = settings.chain;
    const g = settings.global;
    const u = material.uniforms;

    u.uSeed.value = state.seed;
    u.uGrow.value = state.grow;
    u.uLevel.value = state.level;
    u.uBreak.value = state.brk;
    u.uHead.value = state.head * c.headGlow;
    u.uWidthScale.value = state.widthScale;

    u.uHeadLength.value = c.headLength;
    u.uGlowWidth.value = c.glowWidth;
    u.uCoreWidth.value = c.coreWidth;
    u.uFalloff.value = c.glowFalloff;
    u.uIntensity.value = c.intensity * g.glow;
    u.uOpacity.value = c.opacity * g.opacity;
    u.uFlicker.value = c.flicker * g.shaderIntensity;
    u.uFlickerRate.value = c.flickerRate * g.noiseSpeed;
    u.uCrackleScale.value = c.crackleScale;
    u.uCrawl.value = c.crawl * g.noiseStrength;
    u.uCrawlScale.value = c.crawlScale * g.noiseFrequency;
    u.uCrawlSpeed.value = c.crawlSpeed * g.noiseSpeed;

    u.uColorCore.value.copy(getColor(c.colorCore));
    u.uColorGlow.value.copy(getColor(c.colorGlow));
    u.uColorEdge.value.copy(getColor(c.colorEdge));
  };

  return material;
}
