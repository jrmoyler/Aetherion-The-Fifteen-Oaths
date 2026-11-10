import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector2, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { copyColor } from '../../../utils/color.js';

/**
 * Toxin Evolution — the bespoke shaders.
 *
 *  - **the membrane** — the hero: a translucent capsule grown over the host.
 *    Additive, so the host stays readable *inside* it, and dense at the
 *    silhouette (fresnel) like any thin wet film. Veins are domain-warped fbm
 *    streaming upward; cysts are voronoi bumps that rise out of the surface in
 *    the vertex stage as `uStage` climbs, and every accepted stage throbs the
 *    whole membrane (`uPulse`). It dissolves from the floor up on release.
 *  - **the vessel** — the seed pods: ribbed, fresnel-lit, with a hot seed
 *    glowing through the waist.
 *  - **the coil** — one generation of growth winding round the host. Grows
 *    along its length (`uGrow`), tapers to a point, filaments of light
 *    running along it.
 *  - **the spore** — small lumpy beads, fresnel and a slow pulse.
 *  - **the pool** — the infection stain on the floor. Normal-blended so it
 *    *darkens* the ground: wet voronoi cells, glowing seams between them,
 *    a spreading front that advances with each stage, a soft lobed edge.
 *  - **the haze** — a `LAYER.DISTORTION` billboard over the host: the air
 *    shimmering with fumes, stronger with every stage.
 *
 * Each material carries `userData.sync(c, state)` that reads the live
 * settings block, so every slider applies mid-cast. Uniform names the
 * candidate tests read (`uPulse`, `uStage`, `uFade`, `uColor`, `uCore`) are
 * kept from the first implementation.
 */

/* -------------------------------------------------------------------- */
/* The membrane                                                         */
/* -------------------------------------------------------------------- */

const MEMBRANE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uStage;
  uniform float uPulse;
  uniform float uCysts;
  uniform float uWobble;

  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vCyst;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    vUv = uv;
    vec3 p = position;
    // Slow peristaltic wave climbing the membrane, stronger at later stages.
    float wave = sin(uv.y * 19.0 - uTime * 4.0 + uv.x * 12.0) * 0.035 * (1.0 + uStage * 0.3) * uWobble;
    // Cysts: voronoi cells round the girth whose centres swell outward as
    // the toxin evolves. Cell size shrinks per stage so more erupt.
    vec2 cellUv = vec2(uv.x * (7.0 + uStage * 2.0), uv.y * (5.0 + uStage * 1.5));
    vec2 cell = voronoi2(cellUv);
    float cyst = (1.0 - smoothstep(0.0, 0.45, cell.x)) * step(0.45 - uStage * 0.12, cell.y) * min(uStage, 3.0) / 3.0;
    vCyst = cyst;
    float swell = 1.0 + wave + uPulse * 0.12 + cyst * 0.18 * uCysts;
    p.xz *= swell;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const MEMBRANE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStage;
  uniform float uPulse;
  uniform float uFade;
  uniform float uDissolve;
  uniform float uFresnel;
  uniform float uGlow;
  uniform float uVeinScale;
  uniform float uVeinSharp;
  uniform float uOpacity;
  uniform float uSoftFade;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec3  uColor;
  uniform vec3  uCore;
  uniform vec3  uDeep;
  uniform vec3  uLightDir;
  uniform float uBodyAlpha;
  uniform float uBodyTone;
  uniform sampler2D uSceneDepth;
  uniform vec2  uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;

  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vCyst;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    // Release eats from the floor up with a bright margin.
    float eat = vUv.y + snoise(vec3(vUv * vec2(9.0, 4.0), 2.3)) * 0.12;
    if (eat < uDissolve * 1.15) discard;
    float burn = (1.0 - smoothstep(uDissolve * 1.15, uDissolve * 1.15 + 0.08, eat)) * step(0.001, uDissolve);

    // Domain-warped veins streaming upward round the girth.
    vec3 q = vec3(vUv.x * 6.2831 * 0.6, vUv.y * 3.0 - uTime * 0.35, 1.7) * uVeinScale;
    vec3 warp = vec3(fbm3(q), fbm3(q + vec3(5.2, 1.3, 2.8)), 0.0);
    float veins = pow(1.0 - abs(snoise(q * 1.7 + warp * 1.6)), uVeinSharp);
    float rib = pow(max(0.0, cos(vUv.y * 42.0 - uTime * 3.0)), 18.0);

    float rim = fresnelTerm(vViewDir, vNormalW, 2.0, uFresnel);

    // A dark, wet, lit sac — not a glow. The skin is shaded off the scene key
    // (wrapped, it is flesh) from the deep stop up to a dim body tone; only the
    // veins, the cysts and a thin silhouette carry light of their own.
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    float mottle = 0.6 + 0.4 * fbm3(vec3(vUv * vec2(7.0, 5.0), uStage * 0.3 + 1.1));
    vec3 skin = mix(uDeep, uColor * uBodyTone, wrap * wrap * mottle);
    skin *= 0.65 + 0.35 * smoothstep(0.0, 0.35, vUv.y);
    float spec = pow(clamp(dot(N, normalize(L + V)), 0.0, 1.0), 48.0) * 0.55;
    float heat = clamp(veins * 0.7 + vCyst * 0.8 + uPulse * 0.35, 0.0, 1.0);
    vec3 light = mix(uColor, uCore, clamp(vCyst + uPulse * 0.5, 0.0, 1.0)) * (veins * 0.45 + vCyst * 0.9 + rib * 0.08 + rim * 0.1);
    vec3 col = skin + vec3(spec) * mix(vec3(1.0), uCore, 0.4);
    col += light * uGlow * uGlobalGlow * (1.0 + uPulse * 0.8);
    col += uCore * burn * 2.5;

    float alpha = (uBodyAlpha + rim * 0.3 + veins * 0.1 + vCyst * 0.15 + heat * 0.05) * uFade * uOpacity * uShaderIntensity;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export function createMembraneMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    // Normal-blended: the sac is dark and *occludes* (mostly) — the host shows
    // through only as a shadow inside it.
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      // Own clock, held at 0 under reduced motion (the shared uTime is not).
      uTime: { value: 0 },
      uDeep: { value: new Color('#0b1806') },
      uBodyAlpha: { value: 0.62 },
      uBodyTone: { value: 0.08 },
      uStage: { value: 0 },
      uPulse: { value: 0 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uCysts: { value: 1 },
      uWobble: { value: 1 },
      uFresnel: { value: 1.6 },
      uGlow: { value: 1.3 },
      uVeinScale: { value: 1 },
      uVeinSharp: { value: 6 },
      uOpacity: { value: 1 },
      uSoftFade: { value: 0.25 },
      uColor: { value: new Color('#9be641') },
      uCore: { value: new Color('#e4ff93') }
    }),
    vertexShader: MEMBRANE_VERTEX,
    fragmentShader: MEMBRANE_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uStage.value = state.stage;
    u.uPulse.value = state.pulse;
    u.uFade.value = state.fade;
    u.uDissolve.value = state.dissolve;
    u.uCysts.value = c.cystGrowth;
    u.uWobble.value = state.reduced ? 0 : 1;
    u.uFresnel.value = c.membraneFresnel * g.fresnel;
    u.uGlow.value = c.membraneGlow * g.glow;
    u.uVeinScale.value = c.veinScale * g.noiseFrequency;
    u.uVeinSharp.value = c.veinSharp;
    u.uOpacity.value = g.opacity;
    u.uSoftFade.value = c.softFade;
    u.uBodyAlpha.value = c.membraneOpacity ?? 0.62;
    u.uBodyTone.value = c.membraneBodyTone ?? 0.08;
    copyColor(u.uColor.value, c.toxinColor);
    copyColor(u.uCore.value, c.coreColor);
    copyColor(u.uDeep.value, c.deepColor ?? '#0b1806');
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Vessel and spore — small fresnel-lit solids                          */
/* -------------------------------------------------------------------- */

const LIT_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uBreathe;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec3 p = position;
    // The vessel breathes round its waist.
    p.xz *= 1.0 + 0.04 * sin(uTime * 3.0 + uv.y * 10.0) * uBreathe;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const VESSEL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uFresnel;
  uniform float uGlow;
  uniform float uGlobalGlow;
  uniform vec3  uColor;
  uniform vec3  uCore;
  uniform vec3  uDeep;
  uniform vec3  uLightDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    if (uFade < 0.01) discard;
    float ribs = pow(max(0.0, cos(vUv.x * 31.42 + sin(vUv.y * 9.0 - uTime))), 16.0);
    // The seed: a hot knot glowing through the waist, mottled by noise.
    float seed = exp(-abs(vUv.y - 0.55) * 8.0) * (0.7 + 0.3 * snoise(vec3(vUv * 6.0, uTime * 0.7)));
    float rim = fresnelTerm(vViewDir, vNormalW, 2.2, uFresnel);
    // A solid, lit husk: dark ribbed rind shaded off the scene key, the seed
    // and the rib seams glowing through it.
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    vec3 rind = mix(uDeep, uColor * 0.12, wrap * wrap) * (0.75 + 0.25 * (1.0 - ribs));
    float spec = pow(clamp(dot(N, normalize(L + V)), 0.0, 1.0), 40.0) * 0.6;
    vec3 glow = mix(uColor, uCore, clamp(seed * 0.8 + rim * 0.2, 0.0, 1.0)) * (seed * 0.9 + ribs * 0.18 + rim * 0.15);
    vec3 col = rind + vec3(spec) + glow * uGlow * uGlobalGlow;
    gl_FragColor = vec4(col, uFade);
  }
`;

export function createVesselMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uDeep: { value: new Color('#0b1806') },
      uBreathe: { value: 1 },
      uFade: { value: 1 },
      uFresnel: { value: 1.6 },
      uGlow: { value: 1.4 },
      uColor: { value: new Color('#9be641') },
      uCore: { value: new Color('#e4ff93') }
    }),
    vertexShader: LIT_VERTEX,
    fragmentShader: VESSEL_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uFade.value = state.fade;
    u.uBreathe.value = state.reduced ? 0 : 1;
    u.uFresnel.value = c.membraneFresnel * g.fresnel;
    u.uGlow.value = c.vesselGlow * g.glow;
    copyColor(u.uColor.value, c.toxinColor);
    copyColor(u.uCore.value, c.coreColor);
    copyColor(u.uDeep.value, c.deepColor ?? '#0b1806');
  };
  return material;
}

const SPORE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uGlow;
  uniform float uGlobalGlow;
  uniform vec3  uColor;
  uniform vec3  uCore;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  ${commonGLSL}

  void main() {
    float rim = fresnelTerm(vViewDir, vNormalW, 1.6, 1.0);
    float pulse = 0.6 + 0.4 * sin(uTime * 5.0 + vUv.x * 6.2831);
    vec3 col = mix(uCore, uColor, rim) * uGlow * uGlobalGlow * pulse;
    gl_FragColor = vec4(col, clamp((0.45 + rim * 0.5) * uFade, 0.0, 1.0));
  }
`;

export function createSporeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uBreathe: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1.6 },
      uColor: { value: new Color('#9be641') },
      uCore: { value: new Color('#e4ff93') }
    }),
    vertexShader: LIT_VERTEX,
    fragmentShader: SPORE_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uFade.value = state.fade;
    u.uGlow.value = c.sporeGlow * g.glow;
    copyColor(u.uColor.value, c.toxinColor);
    copyColor(u.uCore.value, c.coreColor);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The coil                                                             */
/* -------------------------------------------------------------------- */

const COIL_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uTier;
  uniform float uTaper;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    // Taper both ends to a point by pulling vertices back onto the spine.
    float ends = smoothstep(0.0, 0.12, uv.x) * (1.0 - smoothstep(0.82, 1.0, uv.x));
    float radius = 0.025 + uTier * 0.004;
    p -= normal * radius * (1.0 - mix(1.0, ends, uTaper));
    p.y += sin(uv.x * 15.0 - uTime * 2.0 + uTier) * 0.025;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const COIL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uPulse;
  uniform float uTier;
  uniform float uGrow;
  uniform float uGlow;
  uniform float uGlobalGlow;
  uniform vec3  uColor;
  uniform vec3  uCore;
  varying vec2 vUv;

  void main() {
    // Grows from the root; the growing tip is the brightest point.
    if (vUv.x > uGrow) discard;
    float tip = exp(-(uGrow - vUv.x) * 30.0) * step(uGrow, 0.999);
    float filament = pow(max(0.0, cos(vUv.x * (24.0 + uTier * 7.0) - uTime * 3.0)), 12.0);
    float rim = pow(abs(vUv.y * 2.0 - 1.0), 2.0);
    vec3 color = mix(uColor, uCore, clamp(filament * 0.45 + rim * 0.25 + uPulse * 0.2 + tip, 0.0, 1.0)) * uGlow * uGlobalGlow;
    float alpha = (0.3 + filament * 0.35 + rim * 0.15 + uPulse * 0.2 + tip * 0.4) * uFade;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

export function createCoilMaterial(tier) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: 0 },
      uPulse: { value: 0 },
      uTier: { value: tier },
      uGrow: { value: 0 },
      uTaper: { value: 1 },
      uGlow: { value: 1.4 },
      uGlobalGlow: sharedUniforms().uGlobalGlow,
      uColor: { value: new Color('#9be641') },
      uCore: { value: new Color('#e4ff93') }
    },
    vertexShader: COIL_VERTEX,
    fragmentShader: COIL_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uFade.value = state.fade;
    u.uPulse.value = state.pulse;
    u.uGrow.value = state.grow;
    u.uTaper.value = c.coilTaper;
    u.uGlow.value = c.coilGlow * g.glow;
    copyColor(u.uColor.value, c.toxinColor);
    copyColor(u.uCore.value, c.coreColor);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The pool                                                             */
/* -------------------------------------------------------------------- */

const POOL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStage;
  uniform float uFade;
  uniform float uSpread;     // 0..1 how far the stain has crept out
  uniform float uCells;
  uniform float uGlow;
  uniform float uDarken;
  uniform float uOpacity;
  uniform float uGlobalGlow;
  uniform vec3  uColor;
  uniform vec3  uCore;
  uniform vec3  uStain;
  uniform float uEdgeGlow;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    // The creeping front, broken by noise so it advances in fingers.
    float front = uSpread * (0.85 + 0.25 * fbm3(vec3(a * 1.6, uStage * 0.7, 4.1)));
    float body = 1.0 - smoothstep(front - 0.18, front, r);
    if (body <= 0.0) discard;

    // Wet cells of toxin, with glowing seams between them.
    vec2 cell = voronoi2(p * uCells + vec2(uTime * 0.05, 0.0));
    float seam = 1.0 - smoothstep(0.03, 0.12, cell.x);
    float bubbling = 0.6 + 0.4 * sin(uTime * 2.0 + cell.y * 30.0);
    // A ring of brighter growth riding the advancing front.
    float edge = exp(-abs(r - front + 0.06) * 18.0);
    // Six-fold sigil cells that brighten per stage (the old ring glyph).
    float sigil = pow(max(0.0, cos(a * 6.0 + sin(r * 10.0 - uTime))), 16.0) * smoothstep(0.25, 0.5, r) * min(uStage, 3.0) / 3.0;

    float glow = clamp(seam * bubbling * 0.45 + edge * uEdgeGlow + sigil * 0.25, 0.0, 1.0);
    // The rot itself is the deep stop, mottled wet: it fills the stain, it is
    // not an outline. Seams carry the body colour; only bubbling peaks go hot.
    float wet = 0.7 + 0.3 * fbm3(vec3(p * 3.1, 2.0));
    vec3 lit = mix(uColor * 0.55, uCore, clamp(edge * 0.4 + (bubbling - 0.6) * 1.2, 0.0, 1.0) * seam) * uGlow * uGlobalGlow;
    vec3 col = mix(uStain * wet, lit, glow);
    float alpha = body * mix(uDarken, 1.0, glow) * uFade * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export function createPoolMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uStage: { value: 0 },
      uFade: { value: 1 },
      uSpread: { value: 0 },
      uCells: { value: 4 },
      uGlow: { value: 1.5 },
      uDarken: { value: 0.55 },
      uEdgeGlow: { value: 0.2 },
      uOpacity: { value: 1 },
      uColor: { value: new Color('#9be641') },
      uCore: { value: new Color('#e4ff93') },
      uStain: { value: new Color('#16260f') }
    }),
    vertexShader: POOL_VERTEX,
    fragmentShader: POOL_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uStage.value = state.stage;
    u.uFade.value = state.fade;
    u.uSpread.value = state.spread;
    u.uCells.value = c.poolCells * g.noiseFrequency;
    u.uGlow.value = c.poolGlow * g.glow;
    u.uDarken.value = c.poolDarken;
    u.uEdgeGlow.value = c.poolEdgeGlow ?? 0.2;
    u.uOpacity.value = g.opacity;
    copyColor(u.uColor.value, c.toxinColor);
    copyColor(u.uCore.value, c.coreColor);
    copyColor(u.uStain.value, c.stainColor);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The haze (LAYER.DISTORTION)                                          */
/* -------------------------------------------------------------------- */

const HAZE_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 offset = vec2(position.x * uWidth, (position.y + 0.5) * uHeight);
    mv.xy += offset;
    vWorld = (modelMatrix * vec4(offset, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const HAZE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    // Fumes rising off the host: noise scrolled upward, strongest at the
    // shoulders, feathered on every side so the warp never shows a border.
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale * 0.6 - uTime * uSpeed);
    float nx = snoise(np);
    float ny = snoise(np + vec3(19.3, 7.7, 31.1));
    vec2 c = (vUv - 0.5) * 2.0;
    float mask = (1.0 - smoothstep(0.3, 1.0, abs(c.x))) * smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(vec2(nx, ny) * 0.5 + 0.5, strength, mask);
  }
`;

export function createHazeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uWidth: { value: 2 },
      uHeight: { value: 3 },
      uStrength: { value: 0 },
      uScale: { value: 1.6 },
      uSpeed: { value: 0.9 }
    }),
    vertexShader: HAZE_VERTEX,
    fragmentShader: HAZE_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uWidth.value = state.width;
    u.uHeight.value = state.height;
    u.uStrength.value = state.strength * c.hazeStrength * g.distortion;
    u.uScale.value = c.hazeScale * g.noiseFrequency;
    u.uSpeed.value = c.hazeSpeed * g.noiseSpeed;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The blight — the whole search circle, rotting                        */
/* -------------------------------------------------------------------- */

const BLIGHT_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uReach;      // 0..1 how far the veins have crept in from the rim
  uniform float uFade;
  uniform float uPulse;      // stage throb, travels inward along the veins
  uniform float uStage;
  uniform float uVeins;      // vein count round the rim
  uniform float uSharp;
  uniform float uGlow;
  uniform float uDarken;
  uniform float uOpacity;
  uniform float uGlobalGlow;
  uniform vec2  uHost;       // host offset in disc space (0 = centre)
  uniform float uFill;       // how solidly the rot fills the grown circle between veins
  uniform float uRimGlow;    // the search circle's lit edge
  uniform vec3  uColor;
  uniform vec3  uCore;
  uniform vec3  uStain;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.02) discard;
    // Veins are laid in polar space round the *host*, so once it is chosen
    // every vein bends toward it; before that they converge on the centre.
    vec2 h = p - uHost * smoothstep(1.0, 0.2, r);
    float hr = length(h);
    float a = atan(h.y, h.x);
    float warp = fbm3(vec3(p * 2.3, 1.7)) * 1.8 + fbm3(vec3(p * 5.1, uStage * 0.4)) * 0.6;
    float vein = pow(max(0.0, cos(a * uVeins + warp + hr * 3.0)), uSharp);
    // Side shoots: a second, finer set that only appears from stage one on.
    float shoot = pow(max(0.0, cos(a * uVeins * 2.3 - warp * 1.4 + hr * 7.0)), uSharp * 1.6) * smoothstep(0.0, 1.0, uStage);
    // Growth front, creeping from the rim inward, fingered by noise.
    float front = 1.0 - uReach * (1.05 + 0.15 * fbm3(vec3(a * 1.3, 0.0, 3.3)));
    float grown = smoothstep(front - 0.02, front + 0.12, r);
    // A rotting band just inside the rim marks the circle the toxin searches.
    float band = smoothstep(1.0, 0.86, r) * smoothstep(0.6, 0.9, r);
    float rim = exp(-abs(r - 0.97) * 40.0);
    // Toxin pulses ride the veins inward toward the host.
    float pulse = pow(max(0.0, sin(hr * 14.0 + uTime * 5.0)), 6.0) * (0.35 + uPulse * 1.5);
    float lines = max(vein, shoot * 0.7) * grown;
    float glow = clamp(lines * (0.2 + pulse * 0.8) + rim * uRimGlow * uReach, 0.0, 1.0);
    float mottle = 0.6 + 0.4 * snoise(vec3(vWorld.xz * 1.6, 0.5));
    vec3 col = mix(uStain * mottle, mix(uColor * 0.5, uCore, clamp(pulse * lines * 0.8 + rim * 0.3, 0.0, 1.0)) * uGlow * uGlobalGlow, glow);
    // A filled rot, densest round the host, never just an outline.
    float dark = (uFill * (0.55 + 0.45 * smoothstep(1.0, 0.1, hr)) + band * 0.3 + lines * 0.4 + smoothstep(1.0, 0.0, hr) * 0.3 * uStage / 3.0) * grown;
    float alpha = max(min(1.0, dark) * uDarken, glow) * uFade * uOpacity * smoothstep(1.02, 0.97, r);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/**
 * The blight: a floor field the size of the search circle. Veins creep in
 * from the rim while the seed vessel flies (the telegraph: *this* is where it
 * will look for a host), bend toward the host once one is chosen, carry a
 * pulse inward on every accepted stage and rot the floor darker as the toxin
 * evolves. Normal-blended: it darkens the ground and only the veins glow.
 */
export function createBlightMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uReach: { value: 0 },
      uFade: { value: 1 },
      uPulse: { value: 0 },
      uStage: { value: 0 },
      uVeins: { value: 9 },
      uSharp: { value: 10 },
      uGlow: { value: 1.2 },
      uDarken: { value: 0.5 },
      uOpacity: { value: 1 },
      uHost: { value: new Vector2() },
      uFill: { value: 0.8 },
      uRimGlow: { value: 0.15 },
      uColor: { value: new Color('#9be641') },
      uCore: { value: new Color('#e4ff93') },
      uStain: { value: new Color('#16260f') }
    }),
    vertexShader: POOL_VERTEX,
    fragmentShader: BLIGHT_FRAGMENT
  });
  /** @param {object} state { time, reach, fade, pulse, stage, hostX, hostZ } */
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uReach.value = state.reach;
    u.uFade.value = state.fade;
    u.uPulse.value = state.pulse;
    u.uStage.value = state.stage;
    u.uVeins.value = Math.max(1, Math.round(c.blightVeins ?? 9));
    u.uSharp.value = c.blightSharp ?? 10;
    u.uGlow.value = (c.blightGlow ?? 1.2) * g.glow;
    u.uDarken.value = c.blightDarken ?? 0.5;
    u.uOpacity.value = g.opacity;
    u.uHost.value.set(state.hostX, state.hostZ);
    u.uFill.value = c.blightFill ?? 0.8;
    u.uRimGlow.value = c.blightRimGlow ?? 0.15;
    copyColor(u.uColor.value, c.toxinColor);
    copyColor(u.uCore.value, c.coreColor);
    copyColor(u.uStain.value, c.stainColor);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The blight tendrils — the zone-scale hero                            */
/* -------------------------------------------------------------------- */

const TENDRIL_VERTEX = /* glsl */ `
  attribute vec4  aPose;   // angle round the host, seed, height ×, curl ×
  attribute vec2  aLife;   // grow 0..1, stage throb 0..1
  attribute float aKnob;
  uniform float uTime;
  uniform float uRing;     // metres from the host the roots erupt
  uniform float uHeight;   // arc length of a tendril, metres
  uniform float uCurl;     // radians the arc turns back over the host
  uniform float uLean;     // radians it leans out at the root
  uniform float uThick;    // root radius, metres
  uniform float uWrithe;   // 0 under reduced motion

  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vView;
  varying float vT;
  varying float vKnob;
  varying float vSeed;
  varying float vGrow;
  varying float vPulse;

  void main() {
    float t = position.y;
    float grow = aLife.x;
    float a = aPose.x;
    float seed = aPose.y;
    vec3 radial = vec3(cos(a), 0.0, sin(a));
    vec3 D = -radial;                       // toward the host
    vec3 Y = vec3(0.0, 1.0, 0.0);
    vec3 S = vec3(-sin(a), 0.0, cos(a));

    // It is still coming out of the ground: shorter and straighter while it grows.
    float len = max(0.05, uHeight * aPose.z * (0.3 + 0.7 * grow));
    float writhe = sin(uTime * 1.3 + seed * 6.0) * 0.14 * uWrithe;
    float curl = uCurl * aPose.w * (0.35 + 0.65 * grow) * (1.0 + writhe);
    float phi0 = -uLean * (0.6 + 0.4 * aPose.w);
    float phi = phi0 + curl * t;
    // Constant-curvature arc from phi0 to phi (closed form of ∫ tangent ds).
    vec3 spine;
    if (abs(curl) > 1e-3) {
      float k = curl / len;
      spine = ((cos(phi0) - cos(phi)) * D + (sin(phi) - sin(phi0)) * Y) / k;
    } else {
      spine = len * t * (sin(phi0) * D + cos(phi0) * Y);
    }
    // Writhing: a slow sideways S travelling up it, strongest at the tip.
    spine += S * sin(uTime * 1.9 + seed * 5.0 - t * 3.5) * 0.22 * t * t * (len / 2.6) * uWrithe;

    vec3 T = sin(phi) * D + cos(phi) * Y;
    vec3 Nb = cos(phi) * D - sin(phi) * Y;
    // Every stage throb swells it; the pustules swell more.
    float swell = uThick * (0.55 + 0.45 * grow) * (1.0 + aLife.y * (0.18 + 0.4 * aKnob));
    vec3 p = radial * uRing + spine + (position.x * Nb + position.z * S) * swell;
    vec3 n = normal.x * Nb + normal.z * S + normal.y * T;

    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * n);
    vView = cameraPosition - world.xyz;
    vUv = uv;
    vT = t;
    vKnob = aKnob;
    vSeed = seed;
    vGrow = grow;
    vPulse = aLife.y;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const TENDRIL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;       // 1 alive → 0 withered
  uniform float uVeinGlow;
  uniform float uPustuleGlow;
  uniform float uVeinSpeed;
  uniform float uSpecular;
  uniform float uRim;
  uniform float uGlobalGlow;
  uniform vec3  uLightDir;
  uniform vec3  uColor;      // saturated body
  uniform vec3  uCore;       // white-hot pustules
  uniform vec3  uDeep;       // the dark stop it roots in
  uniform float uBodyTone;   // how far the lit flesh climbs from deep toward the body colour
  uniform float uVeinBase;   // veins' resting glow between pulses

  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vView;
  varying float vT;
  varying float vKnob;
  varying float vSeed;
  varying float vGrow;
  varying float vPulse;

  ${noiseGLSL}

  void main() {
    if (vGrow <= 0.001) discard;
    // Revealed along its own length behind a ragged front, so it *erupts*.
    float rag = snoise(vec3(vUv.x * 4.0, vT * 5.0, vSeed * 3.0)) * 0.08;
    float front = vGrow * 1.08 + rag;
    if (vT > front) discard;
    float lip = 1.0 - smoothstep(front - 0.06, front, vT);

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vView);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    float ndl = dot(N, L);
    float wrap = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    // Ramp: deep at the root (still in the rot) → body up the shaft, mottled.
    float ang = vUv.x * 6.2831853;
    vec2 ring = vec2(cos(ang), sin(ang));
    float mottle = fbm3(vec3(ring * 1.3, vT * 6.0 + vSeed * 4.0)) * 0.5 + 0.5;
    // The deep stop owns the flesh: near-black bile green, only lifted a little
    // toward the body colour on the lit side, so the claw reads as a dark mass
    // that the bright veins, pustules and tips are cut into.
    vec3 skin = mix(uDeep, uColor * uBodyTone, smoothstep(0.0, 0.6, vT) * (0.25 + 0.75 * mottle));
    skin = mix(skin, uDeep * 0.4, (1.0 - uFade) * 0.8);        // withering goes black
    vec3 col = skin * (0.35 + 1.0 * wrap * wrap);

    // Wet: a tight highlight and a thin, dim bile rim.
    vec3 H = normalize(L + V);
    col += vec3(pow(clamp(dot(N, H), 0.0, 1.0), 56.0) * uSpecular) * mix(vec3(1.0), uCore, 0.3);
    col += uColor * 0.35 * pow(1.0 - ndv, 5.0) * uRim;

    // Veins, with toxin pulses running up them from the host's stain.
    float vein = pow(1.0 - abs(snoise(vec3(ring * 1.8, vT * 7.0 + vSeed * 9.0))), 16.0);
    float flow = pow(max(0.0, sin((vT * 3.0 - uTime * uVeinSpeed + vSeed) * 6.2831)), 12.0);
    float veinLight = vein * (uVeinBase + 0.9 * flow + vPulse * 1.0) * uVeinGlow;
    // Pustules ripen: a hot white core in a lime sac, beating.
    float beat = 0.7 + 0.3 * sin(uTime * 4.0 + vSeed * 11.0 + vT * 9.0);
    float sac = smoothstep(0.62, 0.97, vKnob);
    vec3 glow = uColor * veinLight + mix(uColor, uCore, sac) * sac * sac * beat * (1.0 + vPulse) * uPustuleGlow;
    // The tip: a hooked barb glowing hot.
    glow += uCore * smoothstep(0.93, 1.0, vT / max(0.05, front)) * 0.6 * uPustuleGlow;
    glow += uCore * lip * 1.2 * step(vGrow, 0.995);
    col += glow * uFade * uGlobalGlow;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * The tendrils: one material for every instance; pose and life ride in on
 * `aPose` / `aLife`. Opaque, lit off the scene key (`uLightDir`), on
 * `LAYER.SHAPED` because its shape is written in the vertex stage.
 */
export function createTendrilMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uRing: { value: 1.4 },
      uHeight: { value: 2.6 },
      uCurl: { value: 1.6 },
      uLean: { value: 0.35 },
      uThick: { value: 0.16 },
      uWrithe: { value: 1 },
      uFade: { value: 1 },
      uVeinGlow: { value: 1 },
      uPustuleGlow: { value: 1.4 },
      uVeinSpeed: { value: 0.8 },
      uSpecular: { value: 0.6 },
      uRim: { value: 0.5 },
      uBodyTone: { value: 0.07 },
      uVeinBase: { value: 0.04 },
      uColor: { value: new Color('#9be641') },
      uCore: { value: new Color('#e4ff93') },
      uDeep: { value: new Color('#0b1806') }
    }),
    vertexShader: TENDRIL_VERTEX,
    fragmentShader: TENDRIL_FRAGMENT
  });
  /** @param {object} state { time, ring, height, curl, fade, reduced } */
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uRing.value = state.ring;
    u.uHeight.value = state.height;
    u.uCurl.value = state.curl;
    u.uLean.value = c.tendrilLean ?? 0.35;
    u.uThick.value = c.tendrilThick ?? 0.16;
    u.uWrithe.value = state.reduced ? 0 : (c.tendrilWrithe ?? 1) * g.turbulence;
    u.uFade.value = state.fade;
    u.uVeinGlow.value = (c.tendrilVeinGlow ?? 1) * g.glow;
    u.uPustuleGlow.value = (c.tendrilPustuleGlow ?? 1.4) * g.glow;
    u.uVeinSpeed.value = c.tendrilVeinSpeed ?? 0.8;
    u.uSpecular.value = c.tendrilSpecular ?? 0.6;
    u.uRim.value = (c.tendrilRim ?? 0.5) * g.fresnel;
    u.uBodyTone.value = c.tendrilBodyTone ?? 0.07;
    u.uVeinBase.value = c.tendrilVeinBase ?? 0.04;
    copyColor(u.uColor.value, c.toxinColor);
    copyColor(u.uCore.value, c.coreColor);
    copyColor(u.uDeep.value, c.deepColor ?? '#0b1806');
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The venom stream — travel, then a dried line on the floor            */
/* -------------------------------------------------------------------- */

const TRAIL_VERTEX = /* glsl */ `
  uniform vec3  uFrom;
  uniform vec3  uTo;
  uniform float uHeight;   // flight height
  uniform float uArc;      // lob at mid-flight
  uniform float uSag;      // 0 in the air → 1 lying on the floor
  uniform float uRadius;
  uniform float uHead;     // 0..1 how far it has been drawn
  uniform float uTime;
  uniform float uFlow;
  varying float vS;
  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vView;
  varying float vBead;

  void main() {
    float s = position.x;
    vec3 base = mix(uFrom, uTo, s);
    float air = uHeight + sin(3.14159265 * s) * uArc;
    base.y = mix(air, 0.04, uSag);
    vec3 fwd = normalize(vec3(uTo.x - uFrom.x, 0.0, uTo.z - uFrom.z) + 1e-5);
    vec3 side = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up = vec3(0.0, 1.0, 0.0);
    // Beads of venom running down the stream toward the host.
    float bead = pow(max(0.0, sin((s * 14.0 - uTime * uFlow) * 6.2831)), 4.0);
    // Thick behind the vessel, thinning toward the caster; flattens as it lands.
    float body = uRadius * (0.35 + 0.65 * smoothstep(0.0, max(0.05, uHead), s)) * (1.0 + bead * 0.6);
    vec3 off = (position.y * up * mix(1.0, 0.25, uSag) + position.z * side * mix(1.0, 2.2, uSag)) * body;
    vec3 p = base + off;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(position.y * up + position.z * side);
    vView = cameraPosition - world.xyz;
    vS = s;
    vUv = uv;
    vBead = bead;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const TRAIL_FRAGMENT = /* glsl */ `
  uniform float uHead;
  uniform float uTail;     // 0..1 eaten from the caster end as it dries
  uniform float uFade;
  uniform float uGlow;
  uniform float uSag;
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform vec3  uLightDir;
  uniform vec3  uColor;
  uniform vec3  uCore;
  uniform vec3  uDeep;
  varying float vS;
  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vView;
  varying float vBead;

  ${noiseGLSL}

  void main() {
    float n = snoise(vec3(vS * 18.0, vUv.y * 3.0, 1.7)) * 0.03;
    if (vS > uHead + n || vS < uTail + n) discard;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vView);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    vec3 col = mix(uDeep, uColor * 0.14, wrap * wrap);
    col += vec3(pow(clamp(dot(N, normalize(L + V)), 0.0, 1.0), 36.0) * 0.5);
    // A hot thread down the middle, beads of light running in it, hottest at the head.
    float core = pow(ndv, 3.0);
    float head = exp(-abs(uHead - vS) * 18.0);
    vec3 glow = mix(uColor, uCore, clamp(vBead + head, 0.0, 1.0)) * (core * (0.4 + vBead) + head * 1.5);
    col += glow * uGlow * uGlobalGlow * (1.0 - uSag * 0.75);
    float alpha = uFade * (0.85 + 0.15 * core);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createTrailMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFrom: { value: new Vector3() },
      uTo: { value: new Vector3() },
      uHeight: { value: 0.7 },
      uArc: { value: 1 },
      uSag: { value: 0 },
      uRadius: { value: 0.06 },
      uHead: { value: 0 },
      uTail: { value: 0 },
      uFlow: { value: 1.5 },
      uFade: { value: 1 },
      uGlow: { value: 1.2 },
      uColor: { value: new Color('#9be641') },
      uCore: { value: new Color('#e4ff93') },
      uDeep: { value: new Color('#0b1806') }
    }),
    vertexShader: TRAIL_VERTEX,
    fragmentShader: TRAIL_FRAGMENT
  });
  /** @param {object} state { time, from, to, head, tail, sag, fade } */
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uFrom.value.copy(state.from);
    u.uTo.value.copy(state.to);
    u.uHeight.value = c.travelHeight;
    u.uArc.value = c.travelArc ?? 0.6;
    u.uSag.value = state.sag;
    u.uRadius.value = (c.trailRadius ?? 0.07) * g.particleSize;
    u.uHead.value = state.head;
    u.uTail.value = state.tail;
    u.uFlow.value = (c.trailFlow ?? 1.5) * g.noiseSpeed;
    u.uFade.value = state.fade * g.opacity;
    u.uGlow.value = (c.trailGlow ?? 1.2) * g.glow;
    copyColor(u.uColor.value, c.toxinColor);
    copyColor(u.uCore.value, c.coreColor);
    copyColor(u.uDeep.value, c.deepColor ?? '#0b1806');
  };
  return material;
}
