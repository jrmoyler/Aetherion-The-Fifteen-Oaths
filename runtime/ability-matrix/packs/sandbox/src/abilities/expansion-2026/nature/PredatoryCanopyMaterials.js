import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';

/**
 * Materials for PREDATORY CANOPY — one factory per layer.
 *
 * Like the rest of the expansion casts, every material owns its own `uTime`
 * box: the ability writes the cast's visual clock into it and holds it at zero
 * under `prefers-reduced-motion`, so the trap still arms and strikes while the
 * foliage stands still. Global depth/light/glow uniforms come from
 * `sharedUniforms`.
 *
 * Two kinds of surface live here:
 *
 *   - **lit** — bark and leaves. They are the *body* of the trap and must sit
 *     in the scene with weight, so they shade off `uLightDir` (the sun the
 *     lit meshes use) with a wrap term, rather than glowing. They dissolve
 *     with a noise threshold and a burning edge when the canopy withers.
 *   - **emissive** — the root sigil on the floor, the strike vines' veins and
 *     the seed pod. `toneMapped: false`, additive, so bloom carries the
 *     warning the player has to read.
 */

const g = () => settings.global;

/* ------------------------------------------------------------------ */
/* 1 · Bark — branches, vines, thorns, crown                           */
/* ------------------------------------------------------------------ */

const BARK_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BARK_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uDissolve;
  uniform float uWake;       // 0..1: the trap is triggered — veins flush
  uniform float uTipGlow;    // thorns: the point burns with sap (uv.y → 1)
  uniform float uRidge;
  uniform float uMoss;
  uniform vec3  uColor;
  uniform vec3  uMossColor;
  uniform vec3  uVein;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    // Ridged bark furrows run along the wood (uv.y), twisted a little.
    float furrow = ridged(vec3(vUv.x * 6.0 + vUv.y * 1.5, vUv.y * 22.0, 0.0) * uRidge, 4);
    float grain = fbm3(vWorld * 3.0);
    vec3 n = normalize(vNormalW);
    // Wrap lighting: bark facing away from the sun is still readable.
    float lambert = clamp((dot(n, normalize(uLightDir)) + 0.45) / 1.45, 0.0, 1.0);
    // Moss collects on the upward faces.
    float moss = smoothstep(0.25, 0.85, n.y + grain * 0.4) * uMoss;
    vec3 base = uColor * (0.55 + 0.45 * furrow) * (0.85 + 0.3 * grain);
    vec3 col = mix(base, uMossColor, moss) * (0.35 + 0.75 * lambert);
    // When the trap wakes, sap glows up the furrows.
    float vein = smoothstep(0.75, 0.95, furrow) * uWake * (0.6 + 0.4 * sin(vUv.y * 30.0 - uTime * 6.0));
    col += uVein * vein * 1.6 * uGlobalGlow * uShaderIntensity;
    // A sap-lit point (only the thorns turn this on).
    col += uVein * smoothstep(0.45, 1.0, vUv.y) * uTipGlow * (0.6 + 0.4 * uWake) * uGlobalGlow * uShaderIntensity;
    // Withering: a noise threshold eats the wood, leaving a glowing rim.
    float burn = 0.0;
    if (uDissolve > 0.0) {
      float k = snoise01(vWorld * 2.2) - uDissolve;
      if (k < 0.0) discard;
      burn = 1.0 - smoothstep(0.0, 0.08, k);
    }
    col += uVein * burn * 2.0;
    gl_FragColor = vec4(col, uFade);
  }
`;

/** Lit, ridged, mossy bark that flushes with sap and withers away. */
export function createBarkMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: DoubleSide,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uWake: { value: 0 },
      uTipGlow: { value: 0 },
      uRidge: { value: 1 },
      uMoss: { value: 0.6 },
      uColor: { value: new Color('#365423') },
      uMossColor: { value: new Color('#5f8a2e') },
      uVein: { value: new Color('#a9eb6a') }
    }),
    vertexShader: BARK_VERTEX,
    fragmentShader: BARK_FRAGMENT
  });
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uColor.value.set(c.barkColor);
    u.uMossColor.value.set(c.mossColor ?? c.leafColor);
    u.uVein.value.set(c.rootColor);
    u.uRidge.value = (c.barkRidge ?? 1) * g().noiseFrequency;
    u.uMoss.value = c.barkMoss ?? 0.6;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 2 · Leaves                                                          */
/* ------------------------------------------------------------------ */

const LEAF_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uFlutter;
  uniform float uBristle;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec3 p = position;
    // Leaves bend from the stem: displacement grows with uv.y. When the trap
    // triggers they bristle — curl hard toward their own normal.
    p.z += sin(uTime * 2.3 + position.y * 3.8 + position.x * 7.0) * 0.045 * uv.y * uFlutter;
    p.z += uBristle * uv.y * uv.y * 0.45;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const LEAF_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uDissolve;
  uniform float uFresnel;
  uniform float uVariegate;
  uniform vec3  uColor;
  uniform vec3  uRim;
  uniform vec3  uDeepColor;
  uniform float uDeepAmount;
  uniform float uDeepFloor;
  uniform float uEdgeStart;
  uniform float uEdgeGlow;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float mid = 1.0 - smoothstep(0.0, 0.035, abs(vUv.x - 0.5));
    float veins = pow(max(0.0, cos((vUv.y + abs(vUv.x - 0.5) * 0.65) * 55.0)), 18.0) * 0.25;
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    vec3 L = normalize(uLightDir);
    // The face toward the light is the lit body; the face away (the
    // underside) and the stem end fall to a near-black green — the deep stop
    // carries the mass of the crown, the light lives on the margins.
    float ndl = dot(n, L);
    float lit = clamp(ndl * 0.7 + 0.3, 0.0, 1.0);
    float under = 1.0 - smoothstep(-0.15, 0.35, ndl);
    float rim = fresnelTerm(vViewW, n, 2.0, uFresnel);
    float blotch = fbm3(vec3(vUv * vec2(3.0, 6.0), 0.0) + vWorld * 0.3);
    float across = abs(vUv.x - 0.5) * 2.0;
    float edge = smoothstep(uEdgeStart, 0.99, across) * smoothstep(0.04, 0.2, vUv.y);
    vec3 body = uColor * (0.35 + 0.65 * lit) * (1.0 - uVariegate * 0.35 * blotch);
    float deep = clamp(max(uDeepFloor, under * 0.85 + (1.0 - smoothstep(0.0, 0.45, vUv.y)) * 0.55 + (1.0 - lit) * 0.35) * (1.0 - edge * 0.6), 0.0, 1.0) * uDeepAmount;
    vec3 col = mix(body, uDeepColor, deep);
    col += uRim * (0.08 * mid + veins * 0.3 + 0.12 * rim + edge * uEdgeGlow * (0.45 + 0.55 * lit)) * uGlobalGlow;
    // Withering eats each leaf from its tip with a pale burn edge.
    float burn = 0.0;
    if (uDissolve > 0.0) {
      float k = snoise01(vWorld * 3.0) * 0.6 + (1.0 - vUv.y) * 0.4 - uDissolve;
      if (k < 0.0) discard;
      burn = 1.0 - smoothstep(0.0, 0.06, k);
    }
    col += uRim * burn * 1.5;
    gl_FragColor = vec4(col, uFade);
  }
`;

/** The canopy's leaves: wrap-lit, translucent, variegated, withering tip-first. */
export function createLeafMaterial() {
  const material = new ShaderMaterial({
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uFlutter: { value: 1 },
      uBristle: { value: 0 },
      uFresnel: { value: 1 },
      uVariegate: { value: 0.5 },
      uColor: { value: new Color('#55a837') },
      uRim: { value: new Color('#d1ff82') },
      uDeepColor: { value: new Color('#071205') },
      uDeepAmount: { value: 0.85 },
      uDeepFloor: { value: 0.45 },
      uEdgeStart: { value: 0.72 },
      uEdgeGlow: { value: 0.9 }
    }),
    vertexShader: LEAF_VERTEX,
    fragmentShader: LEAF_FRAGMENT
  });
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uColor.value.set(c.leafColor);
    u.uRim.value.set(c.leafRim);
    u.uDeepColor.value.set(c.leafDeep ?? '#071205');
    u.uDeepAmount.value = c.leafDeepAmount ?? 0.85;
    u.uDeepFloor.value = c.leafDeepFloor ?? 0.45;
    u.uEdgeStart.value = c.leafEdgeStart ?? 0.72;
    u.uEdgeGlow.value = c.leafEdgeGlow ?? 0.9;
    u.uFlutter.value = (c.leafFlutter ?? 1) * g().noiseStrength;
    u.uVariegate.value = c.leafVariegation ?? 0.5;
    u.uFresnel.value = g().fresnel;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 3 · The root sigil on the floor                                     */
/* ------------------------------------------------------------------ */

const DISC_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ROOT_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uTrigger;
  uniform float uArm;
  uniform float uGlowGain;
  uniform float uRootCount;
  uniform vec3  uColor;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    // Two boundary rings: the snare's edge and an inner warning ring.
    float ring = exp(-abs(r - 0.9) * 100.0) + 0.55 * exp(-abs(r - 0.67) * 85.0);
    // Roots creep in from the rim: angular lobes wobbled by noise, grown out
    // to \`uArm\` of the radius as the trap arms.
    float wob = snoise(vec3(p * 3.0, uTime * 0.25)) * 0.6;
    float roots = pow(max(0.0, cos(a * uRootCount + sin(r * 18.0 - uTime * 1.5) + wob)), 18.0);
    roots *= smoothstep(0.15, 0.7, r) * (1.0 - smoothstep(0.92, 1.0, r));
    roots *= smoothstep(1.0 - uArm, 1.05 - uArm, 1.0 - r + 0.05);
    // Voronoi cells read as root-split soil between the rings: the far
    // edge of each cell (large F1) is the crack.
    vec2 cell = voronoi2(p * 5.0 + vec2(0.0, uTime * 0.05));
    float cracks = smoothstep(0.42, 0.6, cell.x) * smoothstep(0.3, 0.85, r) * uArm * 0.35;
    float pulse = 0.65 + 0.35 * sin(uTime * 3.0 + r * 14.0);
    // On trigger the warning ring races inward.
    float warn = exp(-abs(r - (0.9 - uTrigger * 0.75)) * 40.0) * uTrigger;
    float alpha = (ring * uArm + roots * 0.5 + cracks + warn * 1.2) * uFade * (0.32 + 0.3 * uTrigger) * pulse;
    vec3 col = uColor * uGlowGain * uGlobalGlow * (1.0 + uTrigger * 1.5);
    gl_FragColor = vec4(col, clamp(alpha * uShaderIntensity, 0.0, 1.0));
  }
`;

/** The snare drawn on the floor: rings, creeping roots, split soil, a racing warning. */
export function createRootMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uTrigger: { value: 0 },
      uArm: { value: 1 },
      uGlowGain: { value: 1 },
      uRootCount: { value: 12 },
      uColor: { value: new Color('#a9eb6a') }
    }),
    vertexShader: DISC_VERTEX,
    fragmentShader: ROOT_FRAGMENT
  });
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uColor.value.set(c.rootColor);
    u.uGlowGain.value = c.rootGlow ?? 1;
    u.uRootCount.value = c.rootCount ?? 12;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 4 · Dappled shade under the canopy                                  */
/* ------------------------------------------------------------------ */

const SHADE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uOpacity;
  uniform float uScale;
  uniform vec3  uColor;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    // Leaf-shadow: thresholded fbm drifting with the flutter, so sun flecks
    // move across the floor under the trap.
    float n = fbm3(vec3(p * 3.5 * uScale, uTime * 0.25));
    float shade = smoothstep(-0.05, 0.25, n);
    float edge = 1.0 - smoothstep(0.55, 1.0, r);
    gl_FragColor = vec4(uColor, shade * edge * uOpacity * uFade);
  }
`;

/** Dark, normal-blended leaf shadow: it has to *darken* the floor. */
export function createShadeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: 0 },
      uOpacity: { value: 0.45 },
      uScale: { value: 1 },
      uColor: { value: new Color('#0d1608') }
    },
    vertexShader: DISC_VERTEX,
    fragmentShader: SHADE_FRAGMENT
  });
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uColor.value.set(c.shadeColor ?? '#0d1608');
    u.uOpacity.value = (c.shadeOpacity ?? 0.45) * g().opacity;
    u.uScale.value = (c.shadeScale ?? 1) * g().noiseFrequency;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 5 · Strike vines                                                    */
/* ------------------------------------------------------------------ */

const STRIKE_VERTEX = /* glsl */ `
  uniform vec3  uAnchor;
  uniform vec3  uTarget;
  uniform float uTime;
  uniform float uProgress;
  uniform float uWidth;
  uniform float uArc;
  uniform float uCoil;        // 0..1: the last third wraps the body
  uniform float uCoilRadius;
  uniform float uCoilHeight;
  uniform float uSeed;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorld;

  const float TAU = 6.28318530718;

  // The vine's centreline at station s (0 anchor .. 1 tip).
  vec3 centre(float s) {
    // A quadratic from the canopy anchor to the target, raised by uArc in the
    // middle, drawn only as far as the windup has grown it.
    float t = s * uProgress;
    vec3 mid = (uAnchor + uTarget) * 0.5 + vec3(0.0, uArc, 0.0);
    vec3 q = (1.0 - t) * (1.0 - t) * uAnchor + 2.0 * (1.0 - t) * t * mid + t * t * uTarget;
    q.y += sin(t * 12.0 - uTime * 4.0) * 0.05 * sin(t * 3.14159) * (1.0 - uCoil);
    // The bind: the last third leaves the curve and winds up round the body.
    float k = smoothstep(0.62, 0.9, s) * uCoil;
    float c = clamp((s - 0.62) / 0.38, 0.0, 1.0);
    float ang = uSeed * 2.0944 + c * TAU * 1.6 + uTime * 0.6;
    vec3 helix = vec3(uTarget.x + cos(ang) * uCoilRadius, uTarget.y + c * uCoilHeight, uTarget.z + sin(ang) * uCoilRadius);
    return mix(q, helix, k);
  }

  void main() {
    vUv = uv;
    float s = position.y;
    vec3 c = centre(s);
    vec3 T = normalize(centre(min(1.0, s + 0.01)) - centre(max(0.0, s - 0.01)) + vec3(1e-5));
    vec3 up = abs(T.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 S = normalize(cross(T, up));
    vec3 B = normalize(cross(S, T));
    // Thick at the canopy, tapering to a hooked point; thorn knobs on one flank.
    float w = uWidth * (1.0 - 0.6 * s) * (1.0 - smoothstep(0.9, 1.0, s) * 0.85);
    w *= 1.0 + 0.9 * pow(max(0.0, sin(s * 44.0)), 14.0) * max(0.0, position.x);
    vec3 n = S * position.x + B * position.z;
    vec3 p = c + n * w;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const STRIKE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uGlowGain;
  uniform vec3  uColor;
  uniform vec3  uVein;
  uniform vec3  uDeep;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  ${noiseGLSL}
  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    float lambert = clamp(dot(N, normalize(uLightDir)) * 0.6 + 0.4, 0.0, 1.0);
    // Fibrous, ridged wood running along the vine.
    float ridge = 0.5 + 0.5 * sin(vUv.x * 6.2832 * 5.0 + vUv.y * 9.0);
    float grain = snoise(vec3(vUv.x * 4.0, vUv.y * 60.0, 0.0)) * 0.5 + 0.5;
    vec3 base = mix(uDeep, uColor, 0.45 + 0.35 * ridge + 0.2 * grain);
    vec3 col = base * (0.3 + 0.85 * lambert);
    // Sap pulses down the veins toward the prey.
    float vein = pow(max(0.0, cos(vUv.y * 38.0 - uTime * 3.0)), 10.0) * smoothstep(0.75, 1.0, ridge);
    float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.0);
    col += uVein * (vein * 0.9 + fres * 0.35) * uGlowGain * uGlobalGlow;
    gl_FragColor = vec4(col, uFade);
  }
`;

/** One lashing vine: a lit, thorned tube bent on the GPU, coiling to bind. */
export function createStrikeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uAnchor: { value: new Vector3() },
      uTarget: { value: new Vector3() },
      uProgress: { value: 0 },
      uWidth: { value: 0.12 },
      uArc: { value: 0.8 },
      uCoil: { value: 0 },
      uCoilRadius: { value: 0.38 },
      uCoilHeight: { value: 1.3 },
      uSeed: { value: 0 },
      uFade: { value: 0 },
      uGlowGain: { value: 1 },
      uGlobalGlow: sharedUniforms().uGlobalGlow,
      uLightDir: sharedUniforms().uLightDir,
      uColor: { value: new Color('#365423') },
      uVein: { value: new Color('#a9eb6a') },
      uDeep: { value: new Color('#0d1608') }
    },
    vertexShader: STRIKE_VERTEX,
    fragmentShader: STRIKE_FRAGMENT
  });
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uColor.value.set(c.barkColor);
    u.uVein.value.set(c.rootColor);
    u.uDeep.value.set(c.shadeColor ?? '#0d1608');
    u.uWidth.value = c.strikeWidth ?? 0.12;
    u.uArc.value = c.strikeArc ?? 0.8;
    u.uGlowGain.value = c.strikeGlow ?? 1;
    u.uCoilRadius.value = c.bindRadius ?? 0.38;
    u.uCoilHeight.value = c.bindHeight ?? 1.3;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 5b · The maw — bulb and jaws                                        */
/* ------------------------------------------------------------------ */

const MAW_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uBreath;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vNormalO;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec3 p = position;
    // It breathes: a slow swell, stronger toward the free end.
    p *= 1.0 + sin(uTime * 2.2) * 0.04 * uBreath * uv.y;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalO = normal;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const MAW_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uDissolve;
  uniform float uHunger;     // 0..1: open and hungry — the gullet blazes
  uniform float uInside;     // 1 for jaws (cupped toward +Z), 0 for the bulb
  uniform float uGlowGain;
  uniform vec3  uSkin;
  uniform vec3  uDeep;
  uniform vec3  uGullet;
  uniform vec3  uCore;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vNormalO;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 NO = normalize(vNormalO);
    if (!gl_FrontFacing) { N = -N; NO = -NO; }
    vec3 V = normalize(cameraPosition - vWorld);
    float lambert = clamp(dot(N, normalize(uLightDir)) * 0.6 + 0.4, 0.0, 1.0);
    // Waxy, mottled skin (the outside of a pitcher plant), veined lengthwise.
    float mottle = fbm3(vec3(vUv * vec2(5.0, 9.0), 0.0) + vWorld * 0.4);
    float vein = pow(max(0.0, cos(vUv.x * 6.2832 * 6.0 + mottle * 2.0)), 10.0);
    // Pale, waxy skin with dark veins: it has to stand off the dark trunk.
    vec3 skin = mix(uSkin * 0.6, uSkin, mottle) * (0.35 + 0.8 * lambert);
    skin = mix(skin, uDeep, vein * 0.75);
    float spec = pow(clamp(dot(N, normalize(normalize(uLightDir) + V)), 0.0, 1.0), 40.0) * 0.5;
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    vec3 col = skin + vec3(spec) + uGullet * fres * (0.45 + 0.6 * uHunger) * uGlowGain;
    // The inside of a jaw: a glowing gullet ramp (deep → body → tint → core),
    // ribbed, flaring when the maw is open.
    float inside = smoothstep(-0.1, 0.5, NO.z) * uInside;
    float ribs = 0.5 + 0.5 * sin(vUv.y * 40.0 - uTime * 3.0);
    float lum = clamp(0.25 + 0.35 * ribs + 0.5 * uHunger - vUv.y * 0.2, 0.0, 1.0);
    vec3 gullet = gradient4(uDeep, uSkin, uGullet, uCore, lum) * (0.8 + 1.4 * uHunger) * uGlowGain * uGlobalGlow * uShaderIntensity;
    col = mix(col, gullet, inside);
    if (uDissolve > 0.0) {
      float k = snoise01(vWorld * 2.5) - uDissolve;
      if (k < 0.0) discard;
      col += uGullet * (1.0 - smoothstep(0.0, 0.08, k)) * 2.0;
    }
    gl_FragColor = vec4(col, uFade);
  }
`;

/** The maw's bulb (`inside` 0) or one of its jaws (`inside` 1). Lit, opaque. */
export function createMawMaterial(inside = 1) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uHunger: { value: 0 },
      uInside: { value: inside },
      uBreath: { value: 1 },
      uGlowGain: { value: 1 },
      uSkin: { value: new Color('#4c7a2c') },
      uDeep: { value: new Color('#0d1608') },
      uGullet: { value: new Color('#a9eb6a') },
      uCore: { value: new Color('#f4ffd8') }
    }),
    vertexShader: MAW_VERTEX,
    fragmentShader: MAW_FRAGMENT
  });
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uSkin.value.set(c.mawColor ?? c.leafColor);
    u.uDeep.value.set(c.shadeColor ?? '#0d1608');
    u.uGullet.value.set(c.mawGullet ?? c.rootColor);
    u.uCore.value.set(c.mawCore ?? '#f4ffd8');
    u.uGlowGain.value = c.mawGlow ?? 1;
    u.uBreath.value = g().noiseStrength;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 6 · The seed pod                                                    */
/* ------------------------------------------------------------------ */

const BUD_VERTEX = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    vUv = uv;
    // A heartbeat: the pod swells and relaxes as it flies.
    float beat = pow(max(0.0, sin(uTime * 7.0)), 8.0);
    vec3 p = position * (1.0 + beat * 0.08);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const BUD_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uGlowGain;
  uniform vec3  uColor;
  uniform vec3  uGlow;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    float rim = fresnelTerm(vViewV, vNormalV, 2.5, 1.0);
    // Light leaks through the seams between the pod's ribs.
    float seam = pow(abs(cos(vUv.x * 3.14159 * 8.0)), 24.0);
    float flow = snoise01(vec3(vUv.x * 4.0, vUv.y * 6.0 - uTime * 1.5, 0.0));
    vec3 col = uColor * (0.4 + 0.3 * flow) + uGlow * (rim * 1.4 + seam * (0.8 + flow)) * uGlowGain * uGlobalGlow * uShaderIntensity;
    gl_FragColor = vec4(col, uFade);
  }
`;

/** The seed pod: dark husk, light seeping from the seams and the rim. */
export function createBudMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uGlowGain: { value: 1 },
      uColor: { value: new Color('#365423') },
      uGlow: { value: new Color('#d1ff82') }
    }),
    vertexShader: BUD_VERTEX,
    fragmentShader: BUD_FRAGMENT
  });
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uColor.value.set(c.barkColor);
    u.uGlow.value.set(c.leafRim);
    u.uGlowGain.value = c.seedGlow ?? 1;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 7 · The snap (LAYER.DISTORTION)                                     */
/* ------------------------------------------------------------------ */

const SNAP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uProgress;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    // A ring of bent air running out from the struck body.
    float front = exp(-abs(r - uProgress) * 9.0) * (1.0 - smoothstep(0.85, 1.0, r));
    float s = uStrength * front * (1.0 - uProgress) * (0.85 + 0.15 * snoise(vec3(p * 4.0, uTime)));
    if (s < 0.001) discard;
    vec2 dir = r < 0.001 ? vec2(0.0, 1.0) : p / r;
    gl_FragColor = vec4(dir * 0.5 + 0.5, s, front);
  }
`;

/** The air cracked by the lash. Screen-warp proxy; NormalBlending, no depth write. */
export function createSnapMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: { uTime: { value: 0 }, uStrength: { value: 0 }, uProgress: { value: 0 } },
    vertexShader: DISC_VERTEX,
    fragmentShader: SNAP_FRAGMENT
  });
}
