import { AdditiveBlending, Color, DoubleSide, MeshStandardMaterial, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';

/**
 * Materials for Nightshade Inheritance.
 *
 * Shadow needs *darkness with weight*, which additive blending cannot give:
 * the wings, the blossoms and the umbral pool are normal-blended so they
 * occlude what is behind them, their colour sinking toward `uVoid`, with only
 * veins and rims lit (`toneMapped: false`, so a hungry mark can bloom). The
 * floor glyph, the ribbon, the crown and the seals are light, and additive.
 *
 * The ability writes every uniform from the live settings each frame. `uClock`
 * is the cast's visual clock (held at zero under reduced motion).
 */

const SURFACE_VARYINGS = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vWorld;
  varying float vViewZ;
`;

function surfaceVertex(displace = '', header = '') {
  return /* glsl */ `
    uniform float uClock;
    ${header}
    ${SURFACE_VARYINGS}
    ${noiseGLSL}

    void main() {
      vUv = uv;
      vec3 p = position;
      ${displace}
      vec4 world = modelMatrix * vec4(p, 1.0);
      vWorld = world.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vViewDir = cameraPosition - world.xyz;
      vec4 mv = viewMatrix * world;
      vViewZ = mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `;
}

function shadowMaterial({ uniforms, vertexShader = surfaceVertex(), fragmentShader, additive = false }) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
    blending: additive ? AdditiveBlending : NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1 },
      uColor: { value: new Color('#68409e') },
      uEdge: { value: new Color('#c7a7ff') },
      uVoid: { value: new Color('#120a1c') },
      ...uniforms
    }),
    vertexShader,
    fragmentShader
  });
}

/* ---------------------------------------------------------------------- */
/* The wings                                                               */
/* ---------------------------------------------------------------------- */

/**
 * Wing membrane. The vertex stage ripples the membrane outward from the root
 * (a slow wingbeat plus a noise shiver), the fragment draws a vein network
 * from voronoi cell edges, a bright leading edge and scalloped trailing edge,
 * and eats the tips away with a smoky dissolve. `uHunger` — the mark's pulse
 * — floods the veins with the edge colour.
 */
const WING_DISPLACE = /* glsl */ `
  p.z += sin(uClock * 2.5 + uv.x * 5.0) * 0.12 * uv.x;
  p.z += snoise(vec3(uv * vec2(3.0, 2.0), uClock * 0.8)) * 0.04 * uv.x * uv.y;
`;

const WING_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uHunger;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uShaderIntensity;
  uniform vec3 uColor;
  uniform vec3 uEdge;
  uniform vec3 uVoid;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float fres = fresnelTerm(V, N, 2.0, 1.0);

    // Vein network: the zero-crossings of noise are thin connected lines.
    float veins = pow(1.0 - abs(snoise(vec3(vUv * vec2(7.0, 3.5), uClock * 0.05))), 12.0);
    float spine = pow(max(0.0, cos(vUv.x * 31.4)), 30.0) * vUv.y;
    float edge = pow(abs(vUv.y - 0.5) * 2.0, 4.0);

    // Smoke eats the tips and the trailing edge.
    float smoke = fbm3(vec3(vUv * vec2(4.0, 3.0), uClock * 0.3)) * 0.5 + 0.5;
    vec2 eaten = dissolveMask(smoke, smoothstep(0.7, 1.0, vUv.x) * 0.55 + vUv.y * 0.12, 0.08);
    float body = sin(vUv.x * 3.14159);

    vec3 color = mix(uVoid, uColor, 0.25 + 0.3 * fres);
    color = mix(color, uEdge * 1.6, clamp(veins * (0.25 + uHunger * 0.9) * uShaderIntensity + edge * 0.5 + spine * 0.4 + eaten.y, 0.0, 1.0));
    float alpha = (uOpacity * (0.55 + 0.35 * fres) * body * eaten.x + eaten.y * 0.7 + veins * uHunger * 0.2) * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color * uGlow, clamp(alpha, 0.0, 1.0));
  }
`;

export function createShadeWingMaterial() {
  return shadowMaterial({
    vertexShader: surfaceVertex(WING_DISPLACE),
    fragmentShader: WING_FRAGMENT,
    uniforms: { uHunger: { value: 0 }, uOpacity: { value: 0.85 } }
  });
}

/* ---------------------------------------------------------------------- */
/* The floor: glyph (light) and pool (dark)                                */
/* ---------------------------------------------------------------------- */

/**
 * The glyph round the host's feet: a rim, seven claw arcs swirled by a radial
 * noise that pulls inward, and the hunger beat. Additive.
 */
const GLYPH_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uHunger;
  uniform float uGlow;
  uniform vec3 uColor;
  uniform vec3 uEdge;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float rim = exp(-abs(r - 0.84) * 80.0) + 0.5 * exp(-abs(r - 0.92) * 120.0);
    // Claw arcs curl toward the centre as the field swirls inward.
    float swirl = a * 7.0 + sin(r * 15.0 + uClock * 2.0) + r * 4.0 - uClock * 0.6;
    float arcs = pow(max(0.0, cos(swirl)), 18.0) * (1.0 - smoothstep(0.78, 1.0, r)) * smoothstep(0.15, 0.35, r);
    float motes = pow(snoise01(vec3(p * 7.0, uClock * 0.7)), 6.0) * (1.0 - smoothstep(0.5, 0.9, r));
    float alpha = (rim * 0.55 + arcs * (0.22 + uHunger * 0.35) + motes * 0.5) * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(mix(uColor, uEdge, clamp(rim * 0.4 + uHunger * 0.3, 0.0, 1.0)) * uGlow, alpha);
  }
`;

export function createShadeGlyphMaterial() {
  return shadowMaterial({ additive: true, fragmentShader: GLYPH_FRAGMENT, uniforms: { uHunger: { value: 0 }, uFade: { value: 0 } } });
}

/**
 * The umbral pool: real darkness on the floor, normal-blended, its edge
 * ragged with fbm and slowly drawn into the centre by a spiral domain warp —
 * the host is standing in a hole the light falls into.
 */
const POOL_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uDarkness;
  uniform float uSwirl;
  uniform float uHunger;
  uniform float uShaderIntensity;
  uniform vec3 uColor;
  uniform vec3 uVoid;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    vec2 q = rot2(uClock * uSwirl + r * 3.0) * p;
    float n = fbm3(vec3(q * 2.2, uClock * 0.25)) * uShaderIntensity;
    float body = 1.0 - smoothstep(0.45 + n * 0.25, 0.95 + n * 0.1, r);
    float vein = pow(snoise01(vec3(q * 5.0, uClock * 0.5)), 8.0) * body;
    vec3 color = mix(uVoid, uColor * 0.35, vein + uHunger * 0.15 * body);
    float alpha = body * uDarkness * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

export function createShadePoolMaterial() {
  return shadowMaterial({
    fragmentShader: POOL_FRAGMENT,
    uniforms: { uDarkness: { value: 0.75 }, uSwirl: { value: 0.6 }, uHunger: { value: 0 }, uFade: { value: 0 } }
  });
}

/* ---------------------------------------------------------------------- */
/* The inheritance ribbon                                                  */
/* ---------------------------------------------------------------------- */

/**
 * The ribbon is authored flat; here its section twists about the arc by
 * `uTwist` half-turns along its length (rolling with the clock) and ripples,
 * so it reads as a strand of shade being pulled taut. The fragment races
 * veins from the fallen host to the heir and brightens the two edges.
 */
const RIBBON_DISPLACE = /* glsl */ `
  float t = uv.x;
  float centre = sin(3.14159 * t) * 0.55;
  float side = p.z;
  float theta = uTwist * 3.14159 * t + uClock * 3.0;
  p.y = centre + sin(theta) * side + sin(t * 12.0 - uClock * 5.0) * 0.06 * sin(t * 3.14159);
  p.z = cos(theta) * side;
`;

const RIBBON_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uGlow;
  uniform vec3 uColor;
  uniform vec3 uEdge;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}

  void main() {
    float vein = pow(max(0.0, cos(vUv.x * 25.0 - uClock * 8.0)), 12.0);
    float edge = pow(abs(vUv.y * 2.0 - 1.0), 3.0);
    float smoke = snoise01(vec3(vUv.x * 6.0 - uClock * 2.0, vUv.y * 2.0, 0.5));
    // A bright head races ahead of the strand toward the heir.
    float head = exp(-abs(vUv.x - fract(uClock * 1.6)) * 14.0);
    float alpha = (0.2 + vein * 0.4 + edge * 0.3 + head * 0.4) * (0.6 + 0.6 * smoke) * sin(vUv.x * 3.14159) * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(mix(uColor, uEdge, clamp(edge + head, 0.0, 1.0)) * uGlow, alpha);
  }
`;

export function createInheritanceRibbonMaterial() {
  return shadowMaterial({
    additive: true,
    vertexShader: surfaceVertex(RIBBON_DISPLACE, 'uniform float uTwist;'),
    fragmentShader: RIBBON_FRAGMENT,
    uniforms: { uTwist: { value: 1.5 }, uFade: { value: 0 } }
  });
}

/* ---------------------------------------------------------------------- */
/* Belladonna blossoms                                                     */
/* ---------------------------------------------------------------------- */

/**
 * Deep violet petals that go almost black toward the throat (belladonna's
 * real colouring), with a lit lip and a fresnel sheen. Normal-blended.
 */
const BLOSSOM_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uGlow;
  uniform float uHunger;
  uniform vec3 uColor;
  uniform vec3 uEdge;
  uniform vec3 uVoid;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float fres = fresnelTerm(V, N, 2.5, 1.0);
    float lip = smoothstep(0.7, 1.0, vUv.y);
    float lobeVein = pow(max(0.0, cos(vUv.x * 31.4159)), 8.0) * vUv.y;
    vec3 color = mix(uVoid, uColor, vUv.y * 0.8 + lobeVein * 0.3);
    color += uEdge * (lip * 0.6 + fres * 0.5 + uHunger * 0.2);
    float alpha = (0.75 + fres * 0.25) * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color * uGlow, clamp(alpha, 0.0, 1.0));
  }
`;

export function createBlossomMaterial() {
  return shadowMaterial({ fragmentShader: BLOSSOM_FRAGMENT, uniforms: { uHunger: { value: 0 } } });
}

/* ---------------------------------------------------------------------- */
/* The crescent crown over the marked head                                 */
/* ---------------------------------------------------------------------- */

const SIGIL_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uHunger;
  uniform float uGlow;
  uniform vec3 uColor;
  uniform vec3 uEdge;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}

  void main() {
    float thorn = step(1.1, vUv.y);
    float band = 1.0 - abs(clamp(vUv.y, 0.0, 1.0) - 0.5) * 2.0;
    float runes = pow(max(0.0, cos(vUv.x * 150.0 + uClock)), 10.0) * (1.0 - thorn);
    float flicker = 0.8 + 0.2 * snoise(vec3(vUv.x * 8.0, uClock * 3.0, 0.0));
    float alpha = (0.35 + band * 0.3 + runes * 0.3 + thorn * 0.5 + uHunger * 0.4) * flicker * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(mix(uColor, uEdge, clamp(0.4 + uHunger * 0.6 + thorn * 0.3, 0.0, 1.0)) * uGlow, alpha);
  }
`;

export function createShadeSigilMaterial() {
  return shadowMaterial({ additive: true, fragmentShader: SIGIL_FRAGMENT, uniforms: { uHunger: { value: 0 } } });
}

/* ---------------------------------------------------------------------- */
/* The pull — LAYER.DISTORTION                                             */
/* ---------------------------------------------------------------------- */

/**
 * A camera-facing quad at the host's feet written into the distortion buffer
 * (`vec4(offset * 0.5 + 0.5, strength, mask)`). The offset points *inward*
 * with a spiral twist and noise, so the world bends toward the marked host.
 */
const WARP_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += vec2(position.x * uWidth, (position.y + 0.5) * uHeight);
    vWorld = (modelMatrix * vec4(position.x * uWidth, (position.y + 0.5) * uHeight, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec2 c = vec2(vUv.x * 2.0 - 1.0, vUv.y * 1.4 - 0.2);
    vec2 inward = -normalize(c + 1e-4);
    vec2 spiral = vec2(-inward.y, inward.x);
    vec3 np = vec3(vWorld.xz * 2.0, vWorld.y * 2.0 + uClock * 0.8);
    vec2 n = vec2(snoise(np), snoise(np + vec3(9.1, 2.7, 13.3)));
    vec2 offset = normalize(inward * 0.8 + spiral * 0.5 + n * 0.4 + 1e-4);
    float mask = 1.0 - smoothstep(0.3, 1.0, length(c));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

export function createShadeWarpMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uWidth: { value: 2.4 },
      uHeight: { value: 2.4 },
      uStrength: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });
}

/* ---------------------------------------------------------------------- */
/* Tier seals (owned by InheritanceSeals)                                  */
/* ---------------------------------------------------------------------- */

/**
 * A tier seal: raised wing facets whose veins multiply with the tier, a ring
 * front that *closes* on the heir as the seal settles, and a burn-away.
 */
const SEAL_DISPLACE = /* glsl */ `
  p.y += sin(uv.x * 14.0 + uv.y * 17.0 - uClock * 3.0) * 0.04 * (1.0 - uProgress);
`;

const SEAL_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uProgress;
  uniform float uTier;
  uniform vec3 uColor;
  uniform vec3 uEdge;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float vein = pow(max(0.0, cos(a * (6.0 + uTier * 2.0) + sin(r * 10.0 - uClock))), 14.0);
    float front = exp(-abs(r - (0.7 - uProgress * 0.4)) * 22.0);
    vec2 burn = dissolveMask(snoise01(vec3(p * 5.0, uTier * 3.0)), uProgress * uProgress * 0.9, 0.1);
    float alpha = ((0.16 + vein * 0.45 + front * 0.3) * burn.x + burn.y * 0.7) * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(mix(uColor, uEdge, clamp(vein * 0.55 + front * 0.35 + burn.y, 0.0, 1.0)), alpha);
  }
`;

export function createInheritanceSealMaterial(tier) {
  return shadowMaterial({
    additive: true,
    vertexShader: surfaceVertex(SEAL_DISPLACE, 'uniform float uProgress;'),
    fragmentShader: SEAL_FRAGMENT,
    uniforms: { uProgress: { value: 0 }, uTier: { value: tier }, uFade: { value: 0 } }
  });
}

/* ---------------------------------------------------------------------- */
/* The nightshade bell, the blight and the creeping roots                  */
/* ---------------------------------------------------------------------- */

/** The shade's four-stop ramp: pale core → lilac → violet body → void. */
const SHADE_RAMP = /* glsl */ `
  uniform vec3 uRampA;
  uniform vec3 uRampB;
  uniform vec3 uRampC;
  uniform vec3 uRampD;
  vec3 shadeRamp(float k) {
    k = clamp(k, 0.0, 1.0);
    vec3 a = mix(uRampD, uRampC, smoothstep(0.0, 0.36, k));
    vec3 b = mix(a, uRampB, smoothstep(0.34, 0.72, k));
    return mix(b, uRampA, smoothstep(0.7, 1.0, k));
  }
`;

function rampUniforms() {
  return {
    uRampA: { value: new Color('#f3eaff') },
    uRampB: { value: new Color('#c7a7ff') },
    uRampC: { value: new Color('#7b45c9') },
    uRampD: { value: new Color('#0b0612') }
  };
}

/**
 * The bell petals: matter, not light. A glossy, waxy `MeshStandardMaterial`
 * (sun-lit, shadow-casting, `LAYER.WORLD`), near-black aubergine, patched
 * with a vein network that floods violet on the hunger beat (white at the
 * midrib's root), a lilac rim on the margin, and a tip-down wither dissolve
 * with a pale burning edge.
 */
export function createNightshadePetalMaterial() {
  const material = new MeshStandardMaterial({
    color: 0x1b1027,
    roughness: 0.32,
    metalness: 0.08,
    side: DoubleSide
  });
  const u = {
    uPetalClock: { value: 0 },
    uPetalHunger: { value: 0 },
    uPetalWither: { value: 0 },
    uPetalGlow: { value: 1 },
    uPetalGrow: { value: 1 },
    ...rampUniforms()
  };
  material.userData.petal = u;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vPetalUv;\nvarying vec3 vPetalWorld;`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vPetalUv = uv;
        {
          vec4 pw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            pw = instanceMatrix * pw;
          #endif
          vPetalWorld = (modelMatrix * pw).xyz;
        }`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uPetalClock;
        uniform float uPetalHunger;
        uniform float uPetalWither;
        uniform float uPetalGlow;
        uniform float uPetalGrow;
        varying vec2 vPetalUv;
        varying vec3 vPetalWorld;
        ${SHADE_RAMP}
        ${noiseGLSL}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float petalMottle = snoise01(vPetalWorld * vec3(3.0, 1.5, 3.0));
        diffuseColor.rgb *= 0.6 + 0.8 * petalMottle;
        // Deepest at the throat, a little bloom of colour toward the lobes.
        diffuseColor.rgb = mix(diffuseColor.rgb, uRampC * 0.35, smoothstep(0.55, 1.0, vPetalUv.y) * 0.5);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float s = abs(vPetalUv.x - 0.5) * 2.0;
          float t = vPetalUv.y;
          // Tip-down wither with a pale burning edge.
          float keep = (1.08 - uPetalWither * 1.25) - t + snoise(vPetalWorld * 3.0) * 0.12;
          if (keep < 0.0) discard;
          float burn = 1.0 - smoothstep(0.0, 0.07, keep);
          // Midrib and branching laterals that sweep up toward the margin.
          float midrib = exp(-s * s * 220.0);
          float lateral = pow(max(0.0, cos((t * 9.0 - s * 2.4) * 3.14159)), 24.0) * smoothstep(0.05, 0.25, s) * (1.0 - s);
          float fine = pow(1.0 - abs(snoise(vec3(vPetalUv * vec2(9.0, 14.0), uPetalClock * 0.1))), 14.0);
          float veins = max(midrib, max(lateral, fine * 0.6));
          // The hunger floods the veins from the root upward.
          float flood = smoothstep(uPetalHunger * 1.2 - 0.1, uPetalHunger * 1.2 - 0.5, t);
          float vk = 0.45 + 0.4 * flood + 0.15 * (1.0 - t);
          float margin = smoothstep(0.82, 1.0, s);
          totalEmissiveRadiance += shadeRamp(vk) * veins * uPetalGlow * (0.35 + 0.9 * flood)
                                 + uRampB * margin * uPetalGlow * 0.25
                                 + uRampA * burn * 2.5;
        }`
      );
  };
  material.customProgramCacheKey = () => 'nightshade-petal-v1';
  return material;
}

/**
 * The blight: the zone-sized floor the shade lands in. Normal-blended
 * darkness (the void tone) with a ragged rim, root veins that creep out from
 * the centre as it spreads, a slow inward swirl, and the arrival shock ring
 * running out to the circle's edge.
 */
const BLIGHT_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uSpread;   // 0..1 how far the blight has crept
  uniform float uShock;    // 0..1 the arrival ring running out (1 = gone)
  uniform float uHunger;
  uniform float uGlow;
  uniform float uDarkness;
  uniform float uShaderIntensity;
  ${SURFACE_VARYINGS}
  ${noiseGLSL}
  ${SHADE_RAMP}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    vec2 q = rot2(uClock * 0.15 + r * 1.5) * p;
    float n = fbm3(vec3(q * 2.5, uClock * 0.2));
    float reach = uSpread * (0.92 + 0.12 * n);
    float body = 1.0 - smoothstep(reach - 0.22, reach, r);
    // Roots: angular ridges of noise, bent as they run out, thinning at the tips.
    float roots = pow(1.0 - abs(snoise(vec3(a * 3.0 + r * 2.0, r * 3.5, 2.3))), 22.0);
    roots += pow(1.0 - abs(snoise(vec3(a * 5.0 - r * 3.0, r * 6.0, 7.1))), 30.0) * 0.6;
    roots *= smoothstep(reach + 0.05, reach - 0.1, r) * smoothstep(0.05, 0.2, r);
    float pulse = 0.6 + 0.4 * sin(r * 14.0 - uClock * 3.0);
    float shockR = 0.08 + uShock * 0.95;
    float shock = exp(-pow((r - shockR) * 22.0, 2.0)) * (1.0 - uShock);
    vec3 col = uRampD * (0.6 + 0.6 * n);
    float glow = roots * pulse * (0.5 + uHunger) + shock * 1.5;
    col += shadeRamp(0.45 + roots * 0.4 + shock * 0.6) * glow * uGlow * uShaderIntensity;
    float alpha = (body * uDarkness + glow * 0.6) * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export function createBlightMaterial() {
  const m = shadowMaterial({
    fragmentShader: BLIGHT_FRAGMENT,
    uniforms: {
      uFade: { value: 0 },
      uSpread: { value: 0 },
      uShock: { value: 1 },
      uHunger: { value: 0 },
      uDarkness: { value: 0.8 },
      ...rampUniforms()
    }
  });
  m.side = DoubleSide;
  return m;
}

/**
 * A creeping root on the floor: the shade's wake from the caster to the
 * circle, and the tendrils that reach from a host toward the enemies that
 * would inherit it. The strip writhes sideways in the vertex stage; the
 * fragment draws a dark core with a violet vein racing to `uReveal`.
 */
const ROOT_DISPLACE = /* glsl */ `
  p.z *= 0.35 + 0.65 * sin(3.14159 * clamp(uv.x * 1.05, 0.0, 1.0));
  p.z += snoise(vec3(uv.x * 4.0 * uLength * 0.25, uClock * 0.6, 3.7)) * 0.15 * sin(3.14159 * uv.x);
`;

const ROOT_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uReveal;
  uniform float uGlow;
  uniform float uLength;
  uniform float uShaderIntensity;
  ${SURFACE_VARYINGS}
  ${noiseGLSL}
  ${SHADE_RAMP}
  void main() {
    float across = abs(vUv.y - 0.5) * 2.0;
    float n = snoise(vec3(vUv.x * uLength * 2.0, vUv.y * 3.0, uClock * 0.4));
    float body = 1.0 - smoothstep(0.25 + 0.25 * n, 0.9, across);
    float head = uReveal - vUv.x;
    if (head < 0.0) discard;
    float tip = exp(-head * uLength * 1.5);
    float core = exp(-across * across * 9.0);
    float flow = 0.55 + 0.45 * sin(vUv.x * uLength * 4.0 - uClock * 6.0);
    vec3 col = uRampD + shadeRamp(0.4 + core * 0.35 + tip * 0.4) * (core * flow + tip * 1.5) * uGlow * uShaderIntensity;
    float alpha = (body * 0.9 + core * 0.6 + tip) * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export function createRootMaterial() {
  return shadowMaterial({
    vertexShader: surfaceVertex(ROOT_DISPLACE, 'uniform float uLength;'),
    fragmentShader: ROOT_FRAGMENT,
    uniforms: { uFade: { value: 0 }, uReveal: { value: 0 }, uLength: { value: 1 }, ...rampUniforms() }
  });
}

/** Copy the four-stop shade ramp (hex strings) into any of these materials' ramp uniforms. */
export function syncShadeRamp(u, a, b, c, d, getColor) {
  u.uRampA.value.copy(getColor(a));
  u.uRampB.value.copy(getColor(b));
  u.uRampC.value.copy(getColor(c));
  u.uRampD.value.copy(getColor(d));
}
