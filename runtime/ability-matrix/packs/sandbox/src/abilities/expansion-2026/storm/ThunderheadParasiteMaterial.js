import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';

/**
 * Thunderhead Parasite — materials.
 *
 * Each factory returns a raw `ShaderMaterial` whose `userData.sync(c, state)`
 * resolves the live settings block `c` and `settings.global` into uniforms
 * every frame, so the editor reshapes a storm that is already attached.
 *
 *  - **cloud** — the thunderhead. Normal blending, because a storm cloud is
 *    *dark*: it has to sit in front of the floor and the target and dim them,
 *    and an additive cloud is a glow. The vertex stage billows the lobes
 *    along their normals with drifting fbm. The fragment stage lights the
 *    crown off the scene's key light, sinks the belly toward near-black, eats
 *    the silhouette into wisps with a fresnel × noise term, and carries the
 *    storm's internal life: sheet lightning lighting the cloud from *inside*
 *    around a moving point, plus the bright flood of a retaliation strike.
 *    Formation and exit are both a noise dissolve (`uForm`), so the cloud
 *    condenses out of nothing and rains itself away.
 *  - **bolt** — tether strands and the strike: gaussian core / body / halo
 *    across a ribbon, beads crawling along, ends pinned dark.
 *  - **shadow** — the cloud's footprint on the floor: a soft, noise-broken
 *    dark pool with a cold wet sheen on its rim where the rain lands.
 *  - **warp** — LAYER.DISTORTION: the pressure under a storm, a slow
 *    downdraft ripple, kicked hard by every strike.
 */

/* ---------------------------------------------------------------------- */
/* Cloud                                                                   */
/* ---------------------------------------------------------------------- */

const CLOUD_VERTEX = /* glsl */ `
  attribute float aLobe;
  attribute float aHeight;
  attribute vec3  aCenter;
  attribute float aOcc;
  uniform float uTime;
  uniform float uBillow;
  uniform float uBillowScale;
  uniform float uDrift;
  uniform float uSeed;
  uniform float uBoil;       // how hard each lobe swells and sinks on its own
  uniform float uBoilRate;   // boils per second
  uniform float uTwist;      // radians the crown has wheeled against the belly
  uniform float uAnvil;      // 0..1 how far the anvil has spread
  uniform float uSurge;      // strike surge: the cloud heaves out

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vLocal;
  varying vec3  vWorld;
  varying float vHeight;
  varying float vLobe;
  varying float vOcc;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    // Each lobe boils on its own phase: it swells out of the cluster and
    // sinks back, so the outline keeps changing — the cloud churns.
    float phase = aLobe * 6.2831853 + uTime * uBoilRate * (0.7 + 0.6 * aLobe);
    float boil = 1.0 + uBoil * sin(phase) + uSurge * (0.6 + 0.4 * aLobe);
    vec3 c = aCenter;
    // The anvil spreads outward and flattens as the storm matures.
    float anvil = smoothstep(0.75, 0.95, aHeight);
    c.x += anvil * uAnvil * 0.25 * (0.5 + aLobe);
    vec3 p = c + (position - aCenter) * boil * vec3(1.0 + anvil * uAnvil * 0.35, 1.0 - anvil * uAnvil * 0.2, 1.0);
    // Updraft shear: the crown wheels against the belly.
    float tw = uTwist * (aCenter.y + 0.35);
    float cs = cos(tw), sn = sin(tw);
    p.xz = mat2(cs, -sn, sn, cs) * p.xz;
    vec3 nrm = normal;
    nrm.xz = mat2(cs, -sn, sn, cs) * nrm.xz;
    // Fine billow on top.
    vec3 q = position * uBillowScale + vec3(uTime * uDrift, uTime * uDrift * 0.6 + aLobe * 7.0, uSeed);
    float billow = fbm3(q);
    p += nrm * billow * uBillow * (0.4 + 0.6 * aHeight);

    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * nrm);
    vViewDir = cameraPosition - world.xyz;
    vLocal = position;
    vWorld = world.xyz;
    vHeight = aHeight;
    vLobe = aLobe;
    vOcc = aOcc;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const CLOUD_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform float uEdge;        // silhouette wisp power
  uniform float uForm;        // 0 → 1 condensed; dissolve threshold
  uniform float uFlash;       // retaliation flood, 0..1
  uniform float uSheet;       // ambient sheet lightning, 0..1
  uniform vec3  uSheetPos;    // local point the sheet lightning lights from
  uniform float uFlashGlow;
  uniform float uSoftFade;
  uniform vec3  uColorDark;
  uniform vec3  uColorMid;
  uniform vec3  uColorLit;
  uniform vec3  uColorFlash;
  uniform vec3  uLightDir;
  uniform float uCrown;
  uniform float uLining;
  uniform float uEmber;
  uniform float uShade;       // overall body brightness before any lightning
  uniform float uSkyFill;     // sky catching the lobe tops
  uniform float uFlashWash;   // how much a flash lights the dense faces (gaps always light)
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vLocal;
  varying vec3  vWorld;
  varying float vHeight;
  varying float vLobe;
  varying float vOcc;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = abs(dot(N, V));

    // Condensation: noise dissolve, the crown first, so the cloud heaps up out
    // of its own base instead of fading in as a whole.
    float dn = snoise01(vLocal * 2.6 + uSeed) * 0.75 + (1.0 - vHeight) * 0.25;
    float formed = smoothstep(1.0 - uForm - 0.08, 1.0 - uForm + 0.08, dn);
    if (formed < 0.01) discard;

    // Wisps: the silhouette is torn by noise, the face is dense.
    float wisp = fbm3(vLocal * 3.4 + vec3(0.0, uTime * 0.2, uSeed));
    float body = smoothstep(0.0, 0.35 + 0.25 * wisp, pow(ndv, max(uEdge, 0.1)));

    // Light. A storm is bruise-dark: the belly sinks to the deep stop, the body
    // is a dim indigo, and only the open, sun-facing faces of the upper lobes
    // reach the tint. The crevices between lobes (vOcc) go darker still —
    // that self-shadow is what reads as volume, lobe against lobe.
    vec3 L = normalize(uLightDir);
    float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    float open = 1.0 - vOcc;
    // Heavy: the lower half of the cloud is all deep stop, the slate-indigo
    // body only owns the upper lobes, and the tint is held to the few faces
    // that turn square to the sun at the very top.
    vec3 color = mix(uColorDark, uColorMid, smoothstep(0.2, 0.85, vHeight) * (0.2 + 0.8 * open));
    color = mix(color, uColorLit, pow(wrap, 5.0) * smoothstep(0.6, 1.0, vHeight) * open * uCrown);
    color *= (0.45 + 0.55 * open) * (0.8 + 0.3 * vLobe) * uShade;
    // Near-black base: the belly reads as the underside of a storm.
    color *= mix(0.3, 1.0, smoothstep(0.0, 0.45, vHeight));
    // A thin silver lining only where a lobe turns away against the sky.
    float lining = pow(1.0 - ndv, 5.0) * (0.25 + 0.75 * wrap) * smoothstep(0.35, 0.95, vHeight) * open;
    color += uColorLit * lining * uLining;
    // Sky fill: a little on the lobe tops so the heaped crown separates
    // from a black backdrop.
    color += uColorMid * max(0.0, N.y) * open * smoothstep(0.4, 0.9, vHeight) * uSkyFill;
    // Embers of the storm: the crevices smoulder violet between flashes, each
    // lobe on its own flicker — the cloud is alive inside even when it is dark.
    // Only the deep crevices between lobes carry light of their own; the
    // half-buried faces stay dark.
    // A crevice is a buried vertex on a face turning away from the eye: the
    // seam where one lobe disappears behind the next, not the lobe's face.
    float gap = smoothstep(0.55, 0.95, vOcc) * pow(1.0 - ndv, 1.5);
    float ember = gap * (0.55 + 0.45 * sin(uTime * (3.0 + vLobe * 5.0) + vLobe * 40.0)) * (1.0 - 0.6 * vHeight);
    color += uColorFlash * ember * uEmber * uGlobalGlow;

    // Sheet lightning: lit from inside, so it falls off with distance from a
    // point within the cluster and leaks out through the thin silhouette and
    // the gaps between lobes — the crevices light up, the faces stay dark.
    float d = length(vLocal - uSheetPos);
    float inner = exp(-d * d * 7.0) * (uFlashWash + 0.3 * pow(1.0 - ndv, 4.0) + 1.2 * gap);
    // A strike floods the cloud from its belly, where the bolt leaves — again
    // mostly through the gaps, so the lobes stand out dark against their own
    // lightning instead of the cloud turning into a white blob.
    float belly = pow(1.0 - vHeight, 3.0);
    float flood = uFlash * belly * (uFlashWash + 0.3 * pow(1.0 - ndv, 4.0) + 1.1 * gap);
    vec3 lit = uColorFlash * (inner * uSheet + flood) * uFlashGlow * uGlobalGlow * uShaderIntensity * 0.45;
    // Soft-clip so stacked flashes roll off instead of clipping to white.
    color += lit / (1.0 + 1.1 * dot(lit, vec3(0.333)));

    float alpha = body * formed * uOpacity;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

export function createCloudMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uBillow: { value: 0.12 },
      uBillowScale: { value: 1.6 },
      uDrift: { value: 0.35 },
      uBoil: { value: 0.08 },
      uBoilRate: { value: 0.6 },
      uTwist: { value: 0 },
      uAnvil: { value: 0 },
      uSurge: { value: 0 },
      uCrown: { value: 0.7 },
      uEmber: { value: 0.25 },
      uLining: { value: 0.6 },
      uShade: { value: 0.6 },
      uSkyFill: { value: 0.15 },
      uFlashWash: { value: 0.03 },
      uOpacity: { value: 0.92 },
      uEdge: { value: 1.6 },
      uForm: { value: 1 },
      uFlash: { value: 0 },
      uSheet: { value: 0 },
      uSheetPos: { value: new Vector3() },
      uFlashGlow: { value: 3 },
      uSoftFade: { value: 0.5 },
      uColorDark: { value: new Color() },
      uColorMid: { value: new Color() },
      uColorLit: { value: new Color() },
      uColorFlash: { value: new Color() }
    }),
    vertexShader: CLOUD_VERTEX,
    fragmentShader: CLOUD_FRAGMENT
  });
  /** @param {object} state { seed, form, flash, sheet, sheetPos, fade, twist, anvil, surge } */
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = state.seed;
    u.uBillow.value = c.cloudBillow * g.noiseStrength;
    u.uBillowScale.value = c.cloudBillowScale * g.noiseFrequency;
    u.uDrift.value = c.cloudDrift * g.noiseSpeed;
    u.uBoil.value = (c.cloudBoil ?? 0.08) * g.turbulence;
    u.uBoilRate.value = c.cloudBoilRate ?? 0.6;
    u.uTwist.value = state.twist ?? 0;
    u.uAnvil.value = state.anvil ?? 0;
    u.uSurge.value = (state.surge ?? 0) * (c.cloudSurge ?? 0.06);
    u.uCrown.value = c.cloudCrownLight ?? 0.7;
    u.uEmber.value = (c.cloudEmber ?? 0.25) * state.fade;
    u.uLining.value = (c.cloudLining ?? 0.6) * g.fresnel;
    u.uShade.value = c.cloudShade ?? 0.6;
    u.uSkyFill.value = c.cloudSkyFill ?? 0.15;
    u.uFlashWash.value = c.cloudFlashWash ?? 0.03;
    u.uOpacity.value = c.cloudOpacity * g.opacity * state.fade;
    u.uEdge.value = c.cloudEdge * g.fresnel;
    u.uForm.value = state.form;
    u.uFlash.value = state.flash;
    u.uSheet.value = state.sheet;
    u.uSheetPos.value.copy(state.sheetPos);
    u.uFlashGlow.value = c.flashGlow * g.glow;
    u.uColorDark.value.copy(getColor(c.colorCloudDark));
    u.uColorMid.value.copy(getColor(c.colorCloudMid));
    u.uColorLit.value.copy(getColor(c.colorCloudLit));
    u.uColorFlash.value.copy(getColor(c.colorCloudFlash));
  };
  return material;
}

/**
 * Depth pre-pass for the cloud.
 *
 * The thunderhead is eleven overlapping lobes merged into one mesh and drawn
 * transparent without depth writes, so on its own the lobes paint in index
 * order: a crown-lit back lobe drawn late lands on top of a front one. This
 * pass runs first (opaque, colour off) with the *same* vertex stage and the
 * *same* uniforms object, so the billow and the dissolve match exactly, and
 * lays down the nearest dense cloud surface in the depth buffer. The colour
 * pass then only shows that surface.
 *
 * It discards where the cloud is not yet condensed and where the silhouette
 * is thin wisp, so the torn edges stay see-through instead of becoming a hard
 * cut-out over whatever hangs behind them.
 */
const CLOUD_DEPTH_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform float uEdge;
  uniform float uForm;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vLocal;
  varying vec3  vWorld;
  varying float vHeight;
  varying float vLobe;
  varying float vOcc;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    // Same dissolve as the colour pass.
    float dn = snoise01(vLocal * 2.6 + uSeed) * 0.75 + (1.0 - vHeight) * 0.25;
    float formed = smoothstep(1.0 - uForm - 0.08, 1.0 - uForm + 0.08, dn);
    if (formed < 0.01) discard;
    // Only the dense face occludes; wisps stay translucent.
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = abs(dot(N, V));
    float wisp = fbm3(vLocal * 3.4 + vec3(0.0, uTime * 0.2, uSeed));
    float body = smoothstep(0.0, 0.35 + 0.25 * wisp, pow(ndv, max(uEdge, 0.1)));
    if (body * formed * uOpacity < 0.5) discard;
    gl_FragColor = vec4(0.0);
  }
`;

/**
 * @param {ShaderMaterial} cloudMaterial the colour pass; its uniforms object is
 *   shared, so its `userData.sync` drives both passes.
 */
export function createCloudDepthMaterial(cloudMaterial) {
  return new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    colorWrite: false,
    side: FrontSide,
    uniforms: cloudMaterial.uniforms,
    vertexShader: CLOUD_VERTEX,
    fragmentShader: CLOUD_DEPTH_FRAGMENT
  });
}

/* ---------------------------------------------------------------------- */
/* Bolt — tether strands and strike                                        */
/* ---------------------------------------------------------------------- */

const BOLT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BOLT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uFade;
  uniform float uCore;
  uniform float uGlow;
  uniform float uSeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorBody;
  uniform vec3  uColorHalo;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float x = (vUv.y - 0.5) * 2.0;
    float s = vUv.x;
    float core = exp(-x * x / max(uCore * uCore, 1e-4));
    float body = exp(-x * x * 4.0);
    float halo = (1.0 - x * x) * 0.3;
    float crawl = 0.65 + 0.35 * snoise(vec3(s * 9.0 - uTime * 14.0, uSeed, uTime * 3.0));
    // The cloud end is buried in vapour, the far end is pinned to the target.
    float ends = smoothstep(0.0, 0.12, s) * smoothstep(1.0, 0.9, s);
    vec3 color = uColorCore * core * 1.8 + uColorBody * body + uColorHalo * halo;
    float alpha = clamp(core + body * 0.7 + halo, 0.0, 1.0) * ends * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * crawl * uGlow * uGlobalGlow * mix(1.0, uShaderIntensity, 0.5), alpha);
  }
`;

/** @param {'strand'|'strike'} role */
export function createBoltMaterial(role = 'strand') {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFade: { value: 0 },
      uCore: { value: 0.3 },
      uGlow: { value: 1.5 },
      uSeed: { value: role === 'strike' ? 4.2 : 1.3 },
      uColorCore: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: BOLT_VERTEX,
    fragmentShader: BOLT_FRAGMENT
  });
  /** `fade` is resolved by the ability; this is the look. */
  material.userData.sync = (c, fade) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uFade.value = fade * g.opacity;
    if (role === 'strike') {
      u.uCore.value = 0.35;
      u.uGlow.value = c.strikeGlow * g.glow;
      u.uColorCore.value.copy(getColor(c.colorStrikeCore));
      u.uColorBody.value.copy(getColor(c.colorStrikeBody));
      u.uColorHalo.value.copy(getColor(c.colorStrandHalo));
    } else {
      u.uCore.value = 0.25;
      u.uGlow.value = c.strandGlow * g.glow;
      u.uColorCore.value.copy(getColor(c.colorStrandCore));
      u.uColorBody.value.copy(getColor(c.colorStrandBody));
      u.uColorHalo.value.copy(getColor(c.colorStrandHalo));
    }
  };
  return material;
}

/* ---------------------------------------------------------------------- */
/* Shadow                                                                  */
/* ---------------------------------------------------------------------- */

const SHADOW_VERTEX = /* glsl */ `
  uniform float uRadius;
  varying vec2 vP;
  varying vec3 vWorld;
  void main() {
    vP = position.xz;
    vec4 world = modelMatrix * vec4(position.x * uRadius, 0.02, position.z * uRadius, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHADOW_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform float uWet;
  uniform float uRain;       // 0..1 how hard it is raining onto the pool
  uniform float uCrackle;    // idle crackle brightness
  uniform float uFlash;      // strike flood, 0..1
  uniform float uCrackleScale;
  uniform float uScorch;     // 0..1 charred centre (grows as it feeds)
  uniform float uGlobalGlow;
  uniform vec3  uColor;
  uniform vec3  uColorWet;
  uniform vec3  uColorCrackle;
  uniform vec3  uColorCore;
  varying vec2 vP;
  varying vec3 vWorld;

  ${noiseGLSL}

  /** F2 − F1 of a voronoi: ~0 on the borders between cells (the crack net). */
  float cellEdge(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
      }
    }
    return sqrt(f2) - sqrt(f1);
  }

  void main() {
    float r = length(vP);
    if (r > 1.0) discard;
    // A cloud's shadow is ragged, and it drifts with the cloud's own churn.
    float n = fbm3(vec3(vWorld.xz * 0.9, uTime * 0.15 + uSeed));
    float pool = 1.0 - smoothstep(0.35 + n * 0.25, 1.0, r);
    // Rain pocks: tiny rings blooming and dying on a cell grid.
    vec2 cell = voronoi2(vWorld.xz * 3.2 + uSeed);
    float phase = fract(cell.y * 7.0 + uTime * 1.6);
    float ring = (1.0 - smoothstep(0.0, 0.06, abs(cell.x - phase * 0.45))) * (1.0 - phase);
    float sheen = pool * (1.0 - pool) * 3.0;
    vec3 color = mix(uColor, uColorWet, clamp(sheen * uWet + ring * uRain * 0.6, 0.0, 1.0));

    // Scorch: the floor under the host charred black, feathered by noise.
    float scorch = (1.0 - smoothstep(0.0, 0.55 + n * 0.2, r)) * uScorch;
    color *= 1.0 - scorch * 0.8;

    // Crackle: a branching net of charge crawling over the wet floor — cell
    // borders of a warped voronoi, re-rolled a few times a second so it
    // jitters like current, flaring along the whole net on a strike.
    vec2 wp = vWorld.xz * uCrackleScale;
    wp += vec2(snoise(vec3(wp * 0.7, uSeed)), snoise(vec3(wp * 0.7 + 9.1, uSeed))) * 0.35;
    float hop = floor(uTime * 7.0);
    float edge = 1.0 - smoothstep(0.0, 0.07, cellEdge(wp + vec2(hop * 0.37, hop * 0.11) * step(0.5, fract(hop * 0.5))));
    float fine = (1.0 - smoothstep(0.0, 0.05, cellEdge(wp * 2.1 + 3.3))) * 0.55;
    float net = max(edge, fine) * pool * smoothstep(1.0, 0.35, r);
    float live = 0.55 + 0.45 * snoise(vec3(wp * 1.3, uTime * 6.0));
    float charge = net * (uCrackle * live + uFlash * 2.0);
    color += mix(uColorCrackle, uColorCore, clamp(uFlash * net, 0.0, 1.0)) * charge * uGlobalGlow;

    float alpha = (pool * 0.85 + ring * uRain * 0.25 * pool + charge * 0.5 + scorch * 0.3) * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

export function createShadowMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    uniforms: sharedUniforms({
      uRadius: { value: 1.8 },
      uSeed: { value: 0 },
      uOpacity: { value: 0.45 },
      uWet: { value: 0.35 },
      uRain: { value: 1 },
      uCrackle: { value: 0.4 },
      uFlash: { value: 0 },
      uCrackleScale: { value: 1.2 },
      uScorch: { value: 0 },
      uColor: { value: new Color() },
      uColorWet: { value: new Color() },
      uColorCrackle: { value: new Color() },
      uColorCore: { value: new Color() }
    }),
    vertexShader: SHADOW_VERTEX,
    fragmentShader: SHADOW_FRAGMENT
  });
  /** @param {object} state { radius, fade, rain, seed, flash, scorch } */
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uRadius.value = state.radius;
    u.uSeed.value = state.seed;
    u.uOpacity.value = c.shadowOpacity * g.opacity * state.fade;
    u.uWet.value = c.shadowWet;
    u.uRain.value = state.rain;
    u.uCrackle.value = (c.crackleGlow ?? 0.45) * state.fade;
    u.uFlash.value = (state.flash ?? 0) * state.fade;
    u.uCrackleScale.value = (c.crackleScale ?? 1.2) * g.noiseFrequency;
    u.uScorch.value = (state.scorch ?? 0) * (c.scorchDarken ?? 0.8);
    u.uColor.value.copy(getColor(c.colorShadow));
    u.uColorWet.value.copy(getColor(c.colorWet));
    u.uColorCrackle.value.copy(getColor(c.colorStrandBody));
    u.uColorCore.value.copy(getColor(c.colorStrikeCore));
  };
  return material;
}

/* ---------------------------------------------------------------------- */
/* Warp — LAYER.DISTORTION                                                 */
/* ---------------------------------------------------------------------- */

const WARP_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * vec2(uWidth, uHeight);
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uShaderIntensity;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    // A downdraft: noise scrolled downward, pushed outward near the floor.
    vec3 np = vec3(c.x * uScale, c.y * uScale + uTime * uSpeed, uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(13.1, 3.7, 7.9)));
    vec2 out2 = vec2(sign(c.x) * (1.0 - vUv.y), -0.4);
    vec2 offset = normalize(n + out2 * 0.6 + 1e-4);
    float mask = (1.0 - smoothstep(0.4, 1.0, abs(c.x))) * smoothstep(0.0, 0.2, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

export function createParasiteWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 3 },
      uHeight: { value: 3 },
      uStrength: { value: 0.3 },
      uScale: { value: 1.4 },
      uSpeed: { value: 0.6 },
      uSeed: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });
  /** @param {object} state { width, height, strength, seed } */
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = state.width;
    u.uHeight.value = state.height;
    u.uStrength.value = state.strength * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
    u.uSeed.value = state.seed;
  };
  return material;
}

/* ---------------------------------------------------------------------- */
/* Flare — the contact flash where a bolt lands                            */
/* ---------------------------------------------------------------------- */

const FLARE_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Camera-facing billboard, sized in metres.
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const FLARE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uFade;
  uniform float uRoll;
  uniform float uGlow;
  uniform float uGlobalGlow;
  uniform vec3  uColorCore;
  uniform vec3  uColorBody;
  varying vec2 vUv;
  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float r = length(c);
    if (r > 1.0) discard;
    float a = atan(c.y, c.x) + uRoll;
    // A white-hot pinpoint, a violet bloom, and six uneven rays.
    float core = exp(-r * r * 60.0);
    float bloom = exp(-r * r * 6.0) * 0.5;
    float rays = pow(max(0.0, cos(a * 3.0)), 24.0) * (1.0 - r) + pow(max(0.0, cos(a * 3.0 + 1.0)), 40.0) * (1.0 - r) * 0.6;
    vec3 color = uColorCore * (core * 3.0 + rays * 1.4) + uColorBody * (bloom + rays * 0.6);
    float alpha = clamp(core + bloom + rays, 0.0, 1.0) * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uGlow * uGlobalGlow * uFade, alpha);
  }
`;

export function createFlareMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 1 },
      uFade: { value: 0 },
      uRoll: { value: 0 },
      uGlow: { value: 1.5 },
      uColorCore: { value: new Color() },
      uColorBody: { value: new Color() }
    }),
    vertexShader: FLARE_VERTEX,
    fragmentShader: FLARE_FRAGMENT
  });
  /** @param {object} state { fade, size, roll } */
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uFade.value = state.fade * g.opacity;
    u.uSize.value = state.size;
    u.uRoll.value = state.roll;
    u.uGlow.value = (c.flareGlow ?? 1.6) * g.glow;
    u.uColorCore.value.copy(getColor(c.colorStrikeCore));
    u.uColorBody.value.copy(getColor(c.colorStrikeBody));
  };
  return material;
}
