import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * The bespoke surfaces of the Starfall Rite — all additive light, all
 * instanced, all shaped in their vertex stage from per-instance attributes the
 * ability writes in place.
 *
 *   - `createStarPointMaterial`  — the constellation's stars: camera-facing
 *     points with a hot core, a soft halo and diffraction spikes, twinkling.
 *   - `createStarLineMaterial`   — the fine light lines joining them, drawn
 *     on star to star, and closed toward their midpoints at the end.
 *   - `createStarMeteorMaterial` — a falling star: a bright head with a long
 *     tapering additive trail, one strip whose rows the shader places in
 *     metres along the fall.
 *   - `createStarGroundMaterial` — the soft floor telegraph under each landing
 *     point, and the glow it leaves after.
 *   - `createStarBurstMaterial`  — the radiant star-burst each impact prints on
 *     the floor.
 *
 * All read `settings.starfall` through `userData.sync`, every frame.
 */

const BILLBOARD = /* glsl */ `
  // Camera-facing offset in world space — right and up of the view.
  vec3 billboard(vec2 corner) {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    return right * corner.x + up * corner.y;
  }
`;

/* ==================================================================== */
/* Star points                                                           */
/* ==================================================================== */

/**
 * `aStar` = (x, y, z, size), `aGlow` = (level, flare, seed, ghost).
 *
 * The quad is sized for the longest spike, not the core, so the spikes are
 * never clipped; everything inside is measured in units of the *core* radius
 * (`vP`), which keeps the halo and spikes proportional at any size.
 *
 * Diffraction spikes are what make a point read as a *star* rather than a
 * particle: thin, sharp streaks along fixed axes that fall off with distance.
 * They are `exp(-|cross axis| · sharp) · (1 − along / length)^p` per axis, the
 * second axis pair turned 45° and weaker — a four-plus-four spike pattern.
 * The pattern turns very slowly per star and the whole thing twinkles on noise.
 */
const STAR_VERTEX = /* glsl */ `
  attribute vec4 aStar;
  attribute vec4 aGlow;

  uniform float uSpikeLength;  // × core radius

  varying vec2  vP;
  varying vec4  vGlow;

  ${BILLBOARD}

  void main() {
    vGlow = aGlow;
    if (aGlow.x <= 0.001 || aStar.w <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    float reach = max(uSpikeLength, 3.0) * (1.0 + aGlow.y * 0.8);
    vec2 corner = position.xy * aStar.w * reach;
    vP = position.xy * reach;
    vec3 world = aStar.xyz + billboard(corner);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uHalo;
  uniform float uHaloSize;
  uniform float uSpikeLength;
  uniform float uSpikeSharp;
  uniform float uSpikeGlow;
  uniform float uSpikeTurn;
  uniform float uTwinkle;
  uniform float uTwinkleSpeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorHalo;
  uniform vec3  uColorSpike;
  uniform float uGlobalGlow;

  varying vec2 vP;
  varying vec4 vGlow;

  ${noiseGLSL}

  float spike(vec2 p, float len, float sharp) {
    float along = abs(p.x) / max(len, 1e-3);
    if (along >= 1.0) return 0.0;
    return exp(-abs(p.y) * sharp) * pow(1.0 - along, 2.2);
  }

  void main() {
    float level = vGlow.x;
    float flare = vGlow.y;
    float seed = vGlow.z;
    float ghost = vGlow.w;

    float r = length(vP);
    float core = exp(-r * r * 2.6);
    float halo = exp(-r / max(uHaloSize, 0.05)) * uHalo;

    vec2 q = rot2(seed * 6.2831 + uTime * uSpikeTurn) * vP;
    float len = uSpikeLength * (1.0 + flare * 0.8);
    float spikes = spike(q, len, uSpikeSharp) + spike(q.yx, len, uSpikeSharp);
    vec2 q2 = rot2(0.785398) * q;
    spikes += 0.4 * (spike(q2, len * 0.55, uSpikeSharp * 1.3) + spike(q2.yx, len * 0.55, uSpikeSharp * 1.3));
    // Ghosts (a star that has fallen) keep their halo, lose their spikes.
    spikes *= uSpikeGlow * (1.0 - ghost);

    float tw = 1.0 - uTwinkle * (snoise(vec3(seed * 17.0, uTime * uTwinkleSpeed, 0.0)) * 0.5 + 0.5);

    vec3 color = uColorCore * core * (1.0 + flare * 2.0)
               + uColorHalo * halo
               + uColorSpike * spikes;
    color *= level * tw * uIntensity * uGlobalGlow;
    float alpha = clamp(core + halo + spikes, 0.0, 1.0) * level * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uOpacity, alpha);
  }
`;

export function createStarPointMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uIntensity: { value: 4 },
      uOpacity: { value: 1 },
      uHalo: { value: 0.5 },
      uHaloSize: { value: 1.2 },
      uSpikeLength: { value: 8 },
      uSpikeSharp: { value: 6 },
      uSpikeGlow: { value: 1 },
      uSpikeTurn: { value: 0.05 },
      uTwinkle: { value: 0.3 },
      uTwinkleSpeed: { value: 3 },
      uColorCore: { value: new Color() },
      uColorHalo: { value: new Color() },
      uColorSpike: { value: new Color() }
    }),
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.starfall;
    const g = settings.global;
    const u = material.uniforms;
    u.uIntensity.value = c.starIntensity * g.glow * g.shaderIntensity;
    u.uOpacity.value = g.opacity;
    u.uHalo.value = c.starHalo;
    u.uHaloSize.value = c.starHaloSize;
    u.uSpikeLength.value = c.spikeLength;
    u.uSpikeSharp.value = c.spikeSharpness;
    u.uSpikeGlow.value = c.spikeGlow;
    u.uSpikeTurn.value = c.spikeTurn * g.animationSpeed;
    u.uTwinkle.value = c.twinkle * g.noiseStrength;
    u.uTwinkleSpeed.value = c.twinkleSpeed * g.noiseSpeed;
    u.uColorCore.value.copy(getColor(c.colorStarCore));
    u.uColorHalo.value.copy(getColor(c.colorStarHalo));
    u.uColorSpike.value.copy(getColor(c.colorStarSpike));
  };

  return material;
}

/* ==================================================================== */
/* Constellation lines                                                   */
/* ==================================================================== */

/**
 * `aFrom`, `aTo` — the two stars; `aLink` = (draw, level, seed, close).
 *
 * `position.x` −1..1 is the fraction along the line, `position.y` −1..1 across
 * it. The visible span is `[close/2, min(draw, 1 − close/2)]`: a line is drawn
 * on from its first star to its second, and at the end it *closes* toward its
 * own midpoint, which reads as the figure folding up rather than fading.
 * A small gap is left at both stars so a line never runs through a star core.
 */
const LINE_VERTEX = /* glsl */ `
  attribute vec3 aFrom;
  attribute vec3 aTo;
  attribute vec4 aLink;

  uniform float uWidth;

  varying float vT;
  varying float vAcross;
  varying float vLen;
  varying vec4  vLink;

  void main() {
    vLink = aLink;
    if (aLink.y <= 0.001) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    float t = position.x * 0.5 + 0.5;
    vec3 world = mix(aFrom, aTo, t);
    vec3 dir = aTo - aFrom;
    vLen = length(dir);
    dir /= max(vLen, 1e-4);
    vec3 toCam = normalize(cameraPosition - world);
    vec3 across = cross(dir, toCam);
    float l = length(across);
    across = l > 1e-4 ? across / l : vec3(0.0, 1.0, 0.0);
    world += across * position.y * uWidth;
    vT = t;
    vAcross = position.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const LINE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uCore;
  uniform float uGap;          // metres left clear at each star
  uniform float uShimmer;
  uniform float uShimmerScale;
  uniform float uShimmerSpeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorGlow;
  uniform float uGlobalGlow;

  varying float vT;
  varying float vAcross;
  varying float vLen;
  varying vec4  vLink;

  ${noiseGLSL}

  void main() {
    float draw = vLink.x;
    float level = vLink.y;
    float seed = vLink.z;
    float close = vLink.w;

    float lo = close * 0.5;
    float hi = min(draw, 1.0 - close * 0.5);
    if (vT < lo || vT > hi) discard;

    // A bright tip rides the drawing front.
    float tip = smoothstep(hi - 0.08, hi, vT) * step(draw, 0.999);

    float a = abs(vAcross);
    float glow = pow(1.0 - a, 3.0);
    float aa = fwidth(a) * 1.2;
    float core = 1.0 - smoothstep(uCore - aa, uCore + aa, a);

    float m = vT * vLen;
    float gap = smoothstep(uGap * 0.6, uGap * 1.4, m) * smoothstep(uGap * 0.6, uGap * 1.4, vLen - m);

    // Light runs along the line.
    float sh = snoise(vec3(m * uShimmerScale - uTime * uShimmerSpeed, seed * 9.0, 0.0)) * 0.5 + 0.5;
    float shimmer = mix(1.0, 0.4 + sh * 1.2, uShimmer);

    vec3 color = (uColorGlow * glow + uColorCore * core) * (shimmer + tip * 3.0);
    float energy = level * gap * uIntensity;
    float alpha = clamp(max(glow, core) * level * gap, 0.0, 1.0) * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * energy * uGlobalGlow * uOpacity, alpha);
  }
`;

export function createStarLineMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 0.06 },
      uIntensity: { value: 2 },
      uOpacity: { value: 1 },
      uCore: { value: 0.25 },
      uGap: { value: 0.25 },
      uShimmer: { value: 0.5 },
      uShimmerScale: { value: 1 },
      uShimmerSpeed: { value: 2 },
      uColorCore: { value: new Color() },
      uColorGlow: { value: new Color() }
    }),
    vertexShader: LINE_VERTEX,
    fragmentShader: LINE_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.starfall;
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = c.lineWidth;
    u.uIntensity.value = c.lineIntensity * g.glow * g.shaderIntensity;
    u.uOpacity.value = c.lineOpacity * g.opacity;
    u.uCore.value = c.lineCore;
    u.uGap.value = c.lineGap;
    u.uShimmer.value = c.lineShimmer * g.noiseStrength;
    u.uShimmerScale.value = c.lineShimmerScale * g.noiseFrequency;
    u.uShimmerSpeed.value = c.lineShimmerSpeed * g.noiseSpeed;
    u.uColorCore.value.copy(getColor(c.colorLineCore));
    u.uColorGlow.value.copy(getColor(c.colorLineGlow));
  };

  return material;
}

/* ==================================================================== */
/* Meteors                                                               */
/* ==================================================================== */

/**
 * `aHead` = (x, y, z, level), `aTail` = (x, y, z, seed).
 *
 * Rows with `along` ≤ 1 lie on the segment tail → head; rows past 1 are pushed
 * *beyond* the head by `(along − 1) · uHeadSize · 10` metres, so the head's
 * glow is a bulb of fixed size in metres however long the trail is. The strip
 * is swung across the view like the bolts, so it is never seen edge-on.
 *
 * Width profile: the trail tapers to a hair at its tip (`along^uTaper`), the
 * head swells to `uHeadSize`. Brightness: the trail falls off toward the tip
 * and is broken into sparkle by noise that streams back up it; the head is a
 * white core over the star's colour.
 */
const METEOR_VERTEX = /* glsl */ `
  attribute vec4 aHead;
  attribute vec4 aTail;

  uniform float uTrailWidth;
  uniform float uHeadSize;
  uniform float uTaper;

  varying float vAlong;
  varying float vAcross;
  varying float vSeed;
  varying float vLevel;
  varying float vLen;
  varying float vViewZ;

  void main() {
    vLevel = aHead.w;
    vSeed = aTail.w;
    if (aHead.w <= 0.001) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vec3 head = aHead.xyz;
    vec3 tail = aTail.xyz;
    vec3 dir = head - tail;
    vLen = length(dir);
    dir = vLen > 1e-4 ? dir / vLen : vec3(0.0, -1.0, 0.0);

    float along = position.y;
    vec3 world = along <= 1.0
      ? mix(tail, head, along)
      : head + dir * (along - 1.0) * uHeadSize * 10.0;

    float width = along <= 1.0
      ? max(uTrailWidth * pow(along, uTaper), uHeadSize * smoothstep(0.85, 1.0, along))
      : uHeadSize * (1.0 - smoothstep(1.0, 1.1, along) * 0.6);

    vec3 toCam = normalize(cameraPosition - world);
    vec3 across = cross(dir, toCam);
    float l = length(across);
    across = l > 1e-4 ? across / l : vec3(1.0, 0.0, 0.0);
    world += across * position.x * width;

    vAlong = along;
    vAcross = position.x;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const METEOR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uTrailFalloff;
  uniform float uSparkle;
  uniform float uSparkleScale;
  uniform float uHeadGlow;
  uniform float uSoftFade;
  uniform vec3  uColorHead;
  uniform vec3  uColorTrail;
  uniform vec3  uColorTip;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;

  varying float vAlong;
  varying float vAcross;
  varying float vSeed;
  varying float vLevel;
  varying float vLen;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float a = abs(vAcross);
    float profile = pow(clamp(1.0 - a, 0.0, 1.0), 2.0);
    float along = min(vAlong, 1.0);

    // Trail: brightest at the head, falling off to the tip, sparkling.
    float trail = pow(along, uTrailFalloff);
    float m = vAlong * vLen;
    float sp = snoise(vec3(m * uSparkleScale + uTime * 6.0, vSeed * 13.0, a * 3.0)) * 0.5 + 0.5;
    trail *= mix(1.0, 0.3 + sp * 1.4, uSparkle);

    // Head: a hot bulb round the front of the strip.
    float head = smoothstep(0.9, 1.0, vAlong) * (1.0 - smoothstep(1.0, 1.1, vAlong) * 0.85);
    float core = head * pow(1.0 - a, 6.0);

    vec3 color = mix(uColorTip, uColorTrail, smoothstep(0.0, 0.7, along)) * trail * profile
               + uColorHead * (head * profile + core * 3.0) * uHeadGlow;
    float alpha = clamp((trail + head) * profile, 0.0, 1.0) * vLevel * uOpacity;

    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * vLevel * uIntensity * uGlobalGlow * uOpacity, alpha);
  }
`;

export function createStarMeteorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTrailWidth: { value: 0.1 },
      uHeadSize: { value: 0.25 },
      uTaper: { value: 1.2 },
      uIntensity: { value: 4 },
      uOpacity: { value: 1 },
      uTrailFalloff: { value: 1.6 },
      uSparkle: { value: 0.5 },
      uSparkleScale: { value: 2 },
      uHeadGlow: { value: 2 },
      uSoftFade: { value: 0.2 },
      uColorHead: { value: new Color() },
      uColorTrail: { value: new Color() },
      uColorTip: { value: new Color() }
    }),
    vertexShader: METEOR_VERTEX,
    fragmentShader: METEOR_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.starfall;
    const g = settings.global;
    const u = material.uniforms;
    u.uTrailWidth.value = c.trailWidth;
    u.uHeadSize.value = c.headSize;
    u.uTaper.value = c.trailTaper;
    u.uIntensity.value = c.meteorIntensity * g.glow * g.shaderIntensity;
    u.uOpacity.value = g.opacity;
    u.uTrailFalloff.value = c.trailFalloff;
    u.uSparkle.value = c.trailSparkle * g.noiseStrength;
    u.uSparkleScale.value = c.trailSparkleScale * g.noiseFrequency;
    u.uHeadGlow.value = c.headGlow;
    u.uSoftFade.value = c.meteorSoftFade;
    u.uColorHead.value.copy(getColor(c.colorHead));
    u.uColorTrail.value.copy(getColor(c.colorTrail));
    u.uColorTip.value.copy(getColor(c.colorTrailTip));
  };

  return material;
}

/* ==================================================================== */
/* Floor: telegraphs and bursts                                          */
/* ==================================================================== */

/** Lay an instanced unit quad flat on the floor, `aStar` = (x, y, z, radius). */
const FLOOR_VERTEX = /* glsl */ `
  attribute vec4 aStar;
  attribute vec4 aGlow;

  varying vec2 vP;
  varying vec4 vGlow;

  void main() {
    vGlow = aGlow;
    if (aStar.w <= 0.0 || aGlow.y <= 0.001) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vP = position.xy;
    vec3 world = aStar.xyz + vec3(position.x, 0.0, -position.y) * aStar.w;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

/**
 * Telegraph — `aGlow` = (warn 0..1, appear 0..1, seed, heat 0..1).
 *
 * Soft, as asked for: no reticle and no hard ring. Light *gathers* under the
 * falling star — a gaussian pool that tightens and brightens as `warn` climbs,
 * a faint four-pointed star drawn on the floor whose arms lengthen toward the
 * moment of impact, and a slow breathing that quickens. After the landing,
 * `heat` holds a warm afterglow that cools out.
 */
const TELEGRAPH_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uPoolSoft;
  uniform float uArmGlow;
  uniform float uBreath;
  uniform float uAfterglow;
  uniform vec3  uColorPool;
  uniform vec3  uColorHot;
  uniform float uGlobalGlow;

  varying vec2 vP;
  varying vec4 vGlow;

  ${noiseGLSL}

  void main() {
    float warn = vGlow.x;
    float appear = vGlow.y;
    float seed = vGlow.z;
    float heat = vGlow.w;

    float r = length(vP);
    if (r > 1.0) discard;
    float edge = 1.0 - smoothstep(0.75, 1.0, r);

    // The pool tightens as the star comes.
    float width = mix(0.6, 0.25, warn) * uPoolSoft;
    float pool = exp(-r * r / max(width * width, 1e-3));

    // Four arms on the floor, turning slowly, reaching further as it nears.
    vec2 q = rot2(seed * 6.2831 + uTime * 0.2) * vP;
    float reach = mix(0.25, 0.95, warn);
    float arms = exp(-abs(q.y) * 28.0) * smoothstep(reach, 0.0, abs(q.x))
               + exp(-abs(q.x) * 28.0) * smoothstep(reach, 0.0, abs(q.y));

    float breath = 1.0 - uBreath + uBreath * (0.5 + 0.5 * sin(uTime * (2.0 + warn * 14.0) + seed * 40.0));

    vec3 tint = mix(uColorPool, uColorHot, warn * warn);
    vec3 color = tint * (pool * (0.3 + warn) * breath + arms * uArmGlow * warn) * appear;
    // Afterglow where it landed.
    color += uColorHot * exp(-r * r * 6.0) * heat * heat * uAfterglow;

    color *= edge * uGlow * uOpacity * uGlobalGlow;
    if (max(color.r, max(color.g, color.b)) < 0.002) discard;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * Burst — `aGlow` = (age 0..1, level, seed, rays).
 *
 * The radiant star printed on the floor by an impact: a number of sharp rays
 * of noise-varied length shooting out over the first part of its life, a hot
 * core, and a thin ring riding just inside the ray tips. It cools from white
 * through the star's gold and fades.
 */
const BURST_FRAGMENT = /* glsl */ `
  precision highp float;
  #define TAU 6.28318530718

  uniform float uGlow;
  uniform float uOpacity;
  uniform float uRaySharp;
  uniform float uRayJitter;
  uniform float uCore;
  uniform float uRing;
  uniform vec3  uColorHot;
  uniform vec3  uColorBody;
  uniform vec3  uColorCool;
  uniform float uGlobalGlow;

  varying vec2 vP;
  varying vec4 vGlow;

  ${noiseGLSL}

  void main() {
    float age = vGlow.x;
    float level = vGlow.y;
    float seed = vGlow.z;
    float rays = max(vGlow.w, 3.0);

    float r = length(vP);
    if (r > 1.0) discard;
    float ang = atan(vP.y, vP.x);

    float grow = 1.0 - pow(1.0 - clamp(age * 3.0, 0.0, 1.0), 3.0);
    float cell = floor((ang / TAU + 0.5) * rays);
    float lenJ = 1.0 - uRayJitter * hash11(cell + seed * 31.0);
    float rayLen = grow * lenJ;
    float beam = pow(abs(cos(ang * rays * 0.5 + seed * 3.0)), uRaySharp);
    float ray = beam * smoothstep(rayLen, rayLen * 0.3, r) * step(r, rayLen);

    float core = exp(-r * r * 40.0) * uCore;
    float ring = exp(-pow((r - grow * 0.82) / 0.035, 2.0)) * uRing * (1.0 - age);

    float fade = 1.0 - smoothstep(0.25, 1.0, age);
    vec3 tint = mix(uColorHot, uColorBody, smoothstep(0.0, 0.35, age));
    tint = mix(tint, uColorCool, smoothstep(0.35, 1.0, age));

    vec3 color = tint * (ray + core + ring) * fade * level;
    color *= uGlow * uOpacity * uGlobalGlow;
    if (max(color.r, max(color.g, color.b)) < 0.002) discard;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function floorMaterial(fragmentShader, extra) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms(extra),
    vertexShader: FLOOR_VERTEX,
    fragmentShader
  });
}

export function createStarGroundMaterial() {
  const material = floorMaterial(TELEGRAPH_FRAGMENT, {
    uGlow: { value: 2 },
    uOpacity: { value: 1 },
    uPoolSoft: { value: 1 },
    uArmGlow: { value: 1.5 },
    uBreath: { value: 0.4 },
    uAfterglow: { value: 2 },
    uColorPool: { value: new Color() },
    uColorHot: { value: new Color() }
  });

  material.userData.sync = () => {
    const c = settings.starfall;
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.telegraphGlow * g.shaderIntensity;
    u.uOpacity.value = c.telegraphOpacity * g.opacity;
    u.uPoolSoft.value = c.telegraphSoftness;
    u.uArmGlow.value = c.telegraphArms;
    u.uBreath.value = c.telegraphBreath;
    u.uAfterglow.value = c.afterglow;
    u.uColorPool.value.copy(getColor(c.colorTelegraph));
    u.uColorHot.value.copy(getColor(c.colorTelegraphHot));
  };

  return material;
}

export function createStarBurstMaterial() {
  const material = floorMaterial(BURST_FRAGMENT, {
    uGlow: { value: 3 },
    uOpacity: { value: 1 },
    uRaySharp: { value: 40 },
    uRayJitter: { value: 0.5 },
    uCore: { value: 2 },
    uRing: { value: 1 },
    uColorHot: { value: new Color() },
    uColorBody: { value: new Color() },
    uColorCool: { value: new Color() }
  });

  material.userData.sync = () => {
    const c = settings.starfall;
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.burstGlow * g.shaderIntensity;
    u.uOpacity.value = g.opacity;
    u.uRaySharp.value = c.burstRaySharpness;
    u.uRayJitter.value = c.burstRayJitter * g.randomness;
    u.uCore.value = c.burstCore;
    u.uRing.value = c.burstRing;
    u.uColorHot.value.copy(getColor(c.colorBurstHot));
    u.uColorBody.value.copy(getColor(c.colorBurstBody));
    u.uColorCool.value.copy(getColor(c.colorBurstCool));
  };

  return material;
}
