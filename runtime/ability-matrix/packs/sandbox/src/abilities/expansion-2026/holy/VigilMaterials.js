import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';

/**
 * Materials for Vigil of Embers.
 *
 * Raw `ShaderMaterial`s on the shared noise / common libraries. The ability
 * resolves `settings[ID]` once per frame and writes the uniforms; nothing here
 * reads settings, so one material can serve every arch (or every bell) of the
 * rig. `uClock` is the cast's visual clock (held at zero under reduced
 * motion), never the shared frame time.
 *
 * The sanctuary is **gilded stone lit from within**: the arches are solid,
 * sun-lit pale-gold masonry whose shaded faces fall to a dark bronze (the
 * cast's deep stop), with gilt trim and kindling veins of light; the bells and
 * crown are solid lit gold. The light itself — lamp flames, floor sigil,
 * curtains, the column, the processional runner — stays additive and
 * `toneMapped: false`, so pulses can push it past 1 and bloom. Palette: core
 * `uCore` → tint `uColor` → body (gilt/stone) → deep `uDeep`.
 */

const SURFACE_VARYINGS = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vWorld;
  varying float vViewZ;
`;

/** Pass-through vertex stage with an optional displacement hook. */
function surfaceVertex(displace = '') {
  return /* glsl */ `
    uniform float uClock;
    ${SURFACE_VARYINGS}
    ${displace ? noiseGLSL : ''}

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

function holyMaterial({ uniforms, vertexShader = surfaceVertex(), fragmentShader, blending = AdditiveBlending, depthTest = true, depthWrite = false }) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite,
    depthTest,
    side: DoubleSide,
    blending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uFade: { value: 1 },
      uPulse: { value: 0 },
      uGlow: { value: 1 },
      uColor: { value: new Color('#ffe9ac') },
      uCore: { value: new Color('#ffffff') },
      ...uniforms
    }),
    vertexShader,
    fragmentShader
  });
}

/* ---------------------------------------------------------------------- */
/* The arches                                                              */
/* ---------------------------------------------------------------------- */

/**
 * Vaulted arches of light. They *build* on arrival: a noise-ragged dissolve
 * front climbs from both feet (uv.x = 0 and 1) to the keystone (0.5), its
 * edge burning white. Fine vertical grain shimmers in the faces, the box
 * edges carry a gilt trim (uv.y crosses a face boundary every 0.25), the rim
 * catches the view by fresnel, and each accepted pulse sends a ripple of
 * light up the sweep.
 */
const ARCH_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uPulse;
  uniform float uBuild;
  uniform float uKindle;      // 0..1 how far the veins of light have climbed
  uniform float uGlow;
  uniform float uShaderIntensity;
  uniform vec3 uColor;
  uniform vec3 uCore;
  uniform vec3 uStone;
  uniform vec3 uDeep;
  uniform vec3 uLightDir;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(vViewDir);
    float fres = fresnelTerm(V, N, 2.2, 1.0);

    // Build front: feet first, keystone last.
    float climb = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float n = snoise01(vec3(vUv.x * 14.0, vUv.y * 6.0, 1.3));
    // Built where the feet-first value has passed the falling threshold; the
    // band just past it is the burning build edge.
    float bv = 1.0 - climb + n * 0.25 * uShaderIntensity;
    float th = 1.25 - uBuild * 1.3;
    if (bv < th) discard;
    float buildEdge = (1.0 - smoothstep(th, th + 0.08, bv)) * step(uBuild, 0.999);

    // Exit: the masonry crumbles away on a burning edge.
    float en = snoise01(vec3(vUv * vec2(18.0, 5.0), 7.0));
    float gone = 1.0 - uFade * 1.08;
    if (en < gone) discard;
    float exitEdge = (1.0 - smoothstep(gone, gone + 0.06, en)) * step(0.001, gone);

    // Lit stone: sun-facing faces pale gold, shaded faces fall to bronze.
    float diff = clamp(dot(N, normalize(uLightDir)), 0.0, 1.0);
    float sky = 0.5 + 0.5 * N.y;
    float grain = 0.5 + 0.5 * sin(vUv.x * 160.0 + snoise(vec3(vUv * vec2(40.0, 8.0), 0.0)) * 2.0);
    float lit = clamp(0.04 + diff * 0.8 + sky * 0.1, 0.0, 1.0);
    vec3 stone = mix(uDeep, uStone, lit * lit * (3.0 - 2.0 * lit)) * (0.85 + 0.25 * grain);

    float faceEdge = abs(fract(vUv.y * 4.0) - 0.5) * 2.0;
    float trim = smoothstep(0.8, 1.0, faceEdge);
    // Veins of light kindle from the feet to the keystone over the vigil.
    float vein = smoothstep(0.9, 0.98, 1.0 - abs(snoise(vec3(vUv.x * 26.0, vUv.y * 5.0, 2.0))));
    float reach = uKindle * 1.1 - (1.0 - climb) * 1.0 - n * 0.1;
    float kindled = smoothstep(0.0, 0.05, reach);
    float kindleFront = exp(-abs(reach) * 30.0) * step(uKindle, 0.999);
    // The pulse climbs the sweep from the feet to the keystone as it decays.
    float ripple = exp(-abs(climb - (1.0 - uPulse)) * 18.0) * uPulse;

    vec3 light = uColor * (trim * 0.9 + vein * kindled * 1.4 + fres * 0.35 + uPulse * 0.25)
               + uCore * (kindleFront * 1.2 + ripple * 1.6 + buildEdge * 3.0 + exitEdge * 2.0);
    vec3 color = stone + light * uGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createVigilArchMaterial() {
  return holyMaterial({
    fragmentShader: ARCH_FRAGMENT,
    blending: NormalBlending,
    depthWrite: true,
    uniforms: {
      uBuild: { value: 1 },
      uKindle: { value: 1 },
      uStone: { value: new Color('#e2c48e') },
      uDeep: { value: new Color('#3a2209') }
    }
  });
}

/* ---------------------------------------------------------------------- */
/* Bells and the crown                                                     */
/* ---------------------------------------------------------------------- */

/**
 * Gilt metal that *rings*: brushed-gold bands follow the lathe profile, a
 * fresnel rim outlines the silhouette, and `uRing` (the pulse envelope) runs
 * bright standing-wave rings round the body — the strike made visible.
 */
const GILT_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uPulse;
  uniform float uRing;
  uniform float uGlow;
  uniform vec3 uColor;
  uniform vec3 uCore;
  uniform vec3 uGilt;
  uniform vec3 uDeep;
  uniform vec3 uLightDir;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(vViewDir);
    vec3 L = normalize(uLightDir);
    float fres = fresnelTerm(V, N, 2.6, 1.0);
    float diff = clamp(dot(N, L), 0.0, 1.0);
    float spec = pow(max(dot(N, normalize(L + V)), 0.0), 36.0);
    float brush = snoise01(vec3(vUv.x * 2.0, vUv.y * 40.0, 0.7));
    float bands = smoothstep(0.75, 1.0, sin(vUv.y * 38.0) * 0.5 + 0.5);
    float ring = pow(max(0.0, sin(vUv.y * 24.0 - uClock * 30.0)), 6.0) * uRing;

    // Solid gold: lit faces gilt, shaded faces dark bronze, a hot specular.
    vec3 metal = mix(uDeep, uGilt, clamp(0.08 + diff * 0.85 + fres * 0.2, 0.0, 1.0)) * (0.8 + 0.35 * brush);
    vec3 light = uCore * (spec * 1.4 + ring * 1.8 + uPulse * 0.35) + uColor * (fres * 0.55 + bands * 0.12);
    vec3 color = metal + light * uGlow;
    // Exit: the gold dissolves on a bright edge.
    float en = snoise01(vec3(vUv * vec2(6.0, 9.0), 3.0));
    float gone = 1.0 - uFade * 1.08;
    if (en < gone) discard;
    color += uCore * (1.0 - smoothstep(gone, gone + 0.06, en)) * step(0.001, gone) * 2.0;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createVigilGiltMaterial() {
  return holyMaterial({
    fragmentShader: GILT_FRAGMENT,
    blending: NormalBlending,
    depthWrite: true,
    uniforms: { uRing: { value: 0 }, uGilt: { value: new Color('#e8a33a') }, uDeep: { value: new Color('#3a2209') } }
  });
}

/* ---------------------------------------------------------------------- */
/* The lamp flames                                                         */
/* ---------------------------------------------------------------------- */

/**
 * A flame: the vertex stage sways the column with height-weighted noise (the
 * foot stays planted in its lamp), the fragment carves licking tongues from
 * domain-warped fbm scrolling upward, with a white core at the root fading to
 * the holy colour at the tip. A pulse flares the whole flame.
 */
const FLAME_DISPLACE = /* glsl */ `
  float sway = uv.y * uv.y;
  p.x += (snoise(vec3(uv.y * 2.5, uClock * 1.6, 0.0)) * uSway + sin(uClock * 4.0 + uv.y * 6.0) * uSway * 0.4) * sway;
  p.z += snoise(vec3(uv.y * 2.5, uClock * 1.6, 7.0)) * uSway * sway;
`;

const FLAME_VERTEX = /* glsl */ `
  uniform float uSway;
  ${surfaceVertex(FLAME_DISPLACE)}
`;

const FLAME_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uPulse;
  uniform float uGlow;
  uniform float uShaderIntensity;
  uniform vec3 uColor;
  uniform vec3 uCore;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float facing = abs(dot(N, V));
    vec3 q = vec3(vUv.x * 4.0, vUv.y * 2.2 - uClock * 1.8, uClock * 0.3);
    q.xy += vec2(fbm3(q * 0.8), fbm3(q * 0.8 + 3.1)) * 0.6 * uShaderIntensity;
    float tongues = smoothstep(0.25, 0.75, fbm4(q) * 0.5 + 0.5 + (0.5 - vUv.y) * 0.9);
    float core = pow(1.0 - vUv.y, 2.0) * facing;
    float body = sin(vUv.y * 3.14159);

    vec3 color = mix(uColor, uCore, clamp(core * 0.9 + uPulse * 0.25, 0.0, 1.0));
    float alpha = (0.15 + core * 0.55 + tongues * 0.45 + uPulse * 0.2) * body * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color * uGlow * (1.0 + uPulse * 0.6), alpha);
  }
`;

export function createVigilFlameMaterial() {
  return holyMaterial({ vertexShader: FLAME_VERTEX, fragmentShader: FLAME_FRAGMENT, uniforms: { uSway: { value: 0.07 } } });
}

/* ---------------------------------------------------------------------- */
/* The floor sigil                                                         */
/* ---------------------------------------------------------------------- */

/**
 * The consecrated floor. Drawn in on arrival by an angular sweep (`uReveal`),
 * it carries two boundary rings at the true damage radius, eight spokes that
 * line up with the arches, a band of rune cells (voronoi) between the inner
 * rings, a slow ember noise in the field, and the pulse wave (`uWave`, radius
 * 0..1) as a bright travelling ring. On exit it dissolves from the rim in.
 */
const FLOOR_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uPulse;
  uniform float uWave;
  uniform float uReveal;
  uniform float uSpin;
  uniform float uKindle;
  uniform float uGlow;
  uniform float uShaderIntensity;
  uniform vec3 uColor;
  uniform vec3 uCore;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    p = rot2(uClock * uSpin) * p;
    float a = atan(p.y, p.x);
    float sweep = (a + 3.14159265) / 6.2831853;
    // 1 behind the sweep, 0 ahead of it; fully drawn at uReveal = 1.
    float drawn = 1.0 - smoothstep(uReveal * 1.05 - 0.05, uReveal * 1.05, sweep);

    float rings = exp(-abs(r - 0.96) * 120.0) + 0.7 * exp(-abs(r - 0.9) * 140.0) + 0.6 * exp(-abs(r - 0.62) * 110.0);
    float spokes = pow(max(0.0, cos(a * 8.0)), 60.0) * smoothstep(0.2, 0.3, r) * (1.0 - smoothstep(0.88, 0.9, r));
    vec2 cell = voronoi2(vec2(a * 6.0, r * 14.0));
    float runeBand = smoothstep(0.66, 0.68, r) * (1.0 - smoothstep(0.84, 0.86, r));
    // Rune cells: about half the cells in the band carry a glowing glyph dot.
    float runes = step(0.5, cell.y) * (1.0 - smoothstep(0.12, 0.28, cell.x)) * runeBand;
    // The runes light one by one through the vigil.
    float lit = fract(cell.y * 13.7);
    runes *= 0.25 + 0.75 * smoothstep(lit - 0.08, lit, uKindle * 1.05);
    float embers = pow(snoise01(vec3(p * 5.0, uClock * 0.5)), 5.0) * uShaderIntensity * (1.0 - smoothstep(0.6, 0.95, r));
    float wave = exp(-abs(r - uWave) * 40.0) * step(0.01, uWave) * uPulse;
    float centre = exp(-r * 6.0) * 0.4;

    float alpha = (rings * 0.8 + spokes * 0.5 + runes * 0.55 + embers * 0.6 + centre) * drawn + wave * 1.2;
    // Exit: dissolve from the rim inward with a ragged edge.
    vec2 exitMask = dissolveMask(1.0 - r + snoise01(vec3(p * 4.0, 5.0)) * 0.2, 1.1 - uFade * 1.2, 0.06);
    alpha = alpha * exitMask.x + exitMask.y * 0.8 * drawn;
    alpha *= min(1.0, uFade * 2.0);
    if (alpha < 0.004) discard;
    vec3 color = mix(uColor, uCore, clamp(rings * 0.3 + wave + centre, 0.0, 1.0));
    gl_FragColor = vec4(color * uGlow, alpha * 0.6);
  }
`;

export function createVigilFloorMaterial() {
  return holyMaterial({
    fragmentShader: FLOOR_FRAGMENT,
    uniforms: { uWave: { value: 0 }, uReveal: { value: 0 }, uSpin: { value: 0.05 }, uKindle: { value: 1 } }
  });
}

/* ---------------------------------------------------------------------- */
/* The expanding curtain                                                   */
/* ---------------------------------------------------------------------- */

/**
 * A wall of light thrown outward by each pulse. Light columns ride the
 * bearing (one per arch bay and finer between), broken by fbm that climbs;
 * a bright band sits low where the curtain sweeps the floor; top and foot
 * are feathered so it never cuts a ring.
 */
const CURTAIN_DISPLACE = /* glsl */ `
  p.xz *= 1.0 + 0.018 * sin(uv.x * 37.7 + uClock * 2.0) * uv.y;
`;

const CURTAIN_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uGlow;
  uniform float uShaderIntensity;
  uniform vec3 uColor;
  uniform vec3 uCore;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}

  void main() {
    float bays = pow(max(0.0, cos(vUv.x * 50.265)), 10.0);
    float fine = pow(max(0.0, cos(vUv.x * 301.6 + sin(vUv.y * 7.0 - uClock))), 14.0);
    float climb = fbm3(vec3(vUv.x * 24.0, vUv.y * 3.0 - uClock * 1.4, 0.5)) * 0.5 + 0.5;
    climb = mix(1.0, climb, uShaderIntensity);
    float band = exp(-abs(vUv.y - 0.15) * 7.0);
    float feather = smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    vec3 color = mix(uColor, uCore, clamp(bays * 0.45 + band * 0.35, 0.0, 1.0));
    float alpha = (0.1 + bays * 0.35 + fine * 0.25 + band * 0.25) * (0.5 + climb) * feather * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color * uGlow, alpha);
  }
`;

export function createVigilCurtainMaterial() {
  return holyMaterial({ vertexShader: surfaceVertex(CURTAIN_DISPLACE), fragmentShader: CURTAIN_FRAGMENT });
}

/* ---------------------------------------------------------------------- */
/* The column of light                                                     */
/* ---------------------------------------------------------------------- */

/**
 * The shaft from the crown to the floor: god-rays as vertical streaks of
 * noise that drift slowly round, brightest where the eye looks *through* the
 * shell (inverse fresnel), faded top and bottom and soft against the floor.
 */
const SHAFT_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uPulse;
  uniform float uGlow;
  uniform vec3 uColor;
  uniform vec3 uCore;
  uniform vec2 uResolution;
  uniform sampler2D uSceneDepth;
  uniform float uCameraNear;
  uniform float uCameraFar;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float through = pow(abs(dot(N, V)), 1.5);
    float rays = snoise01(vec3(vUv.x * 18.0 + uClock * 0.15, vUv.y * 0.8 - uClock * 0.25, 2.0));
    rays = pow(rays, 3.0);
    float ends = smoothstep(0.0, 0.2, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
    float alpha = (0.15 + rays * 0.85) * through * ends * (1.0 + uPulse * 0.8) * uFade;
    if (alpha < 0.004) discard;
    alpha *= softFade(uSceneDepth, gl_FragCoord.xy / uResolution, vViewZ, uCameraNear, uCameraFar, 0.5);
    gl_FragColor = vec4(mix(uColor, uCore, rays * 0.5) * uGlow, alpha);
  }
`;

/** The column is built as a cylinder; its foot is widened here so it stays live. */
const SHAFT_VERTEX = /* glsl */ `
  uniform float uFoot;
  ${surfaceVertex('p.xz *= mix(uFoot, 1.0, uv.y);')}
`;

export function createVigilShaftMaterial() {
  return holyMaterial({ vertexShader: SHAFT_VERTEX, fragmentShader: SHAFT_FRAGMENT, uniforms: { uFoot: { value: 1.6 } } });
}

/* ---------------------------------------------------------------------- */
/* Heat over the lamps — LAYER.DISTORTION                                  */
/* ---------------------------------------------------------------------- */

/**
 * A camera-facing quad over the sanctuary written into the distortion buffer
 * (`vec4(offset * 0.5 + 0.5, strength, mask)`): rising heat over the lamp
 * ring, with a radial kick when a pulse goes out.
 */
const WARP_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * vec2(uWidth, uHeight);
    vWorld = (modelMatrix * vec4(position.x * uWidth, position.y * uHeight, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uStrength;
  uniform float uKick;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    vec3 np = vec3(vWorld.xz * 1.8, vWorld.y * 1.8 - uClock * 1.6);
    vec2 n = vec2(snoise(np), snoise(np + vec3(11.0, 3.0, 23.0)));
    vec2 radial = normalize(c + 1e-4);
    vec2 offset = normalize(n + radial * uKick * 2.0 + 1e-4);
    float mask = (1.0 - smoothstep(0.55, 1.0, length(c)));
    float strength = (uStrength + uKick) * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

export function createVigilWarpMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uWidth: { value: 6 },
      uHeight: { value: 2 },
      uStrength: { value: 0 },
      uKick: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });
}

/* ---------------------------------------------------------------------- */
/* Pulse glyph and footprint (owned by VigilPulses)                        */
/* ---------------------------------------------------------------------- */

/**
 * The pulse glyph: twelve raised flame petals, ribbed, with a ring front that
 * rides out with `uProgress` and a noise burn-away as it finishes.
 */
const PULSE_DISPLACE = /* glsl */ `
  p.y += sin(uv.x * 16.0 + uv.y * 13.0 - uClock * 2.0) * 0.025 * (1.0 - uProgress);
`;

const PULSE_VERTEX = /* glsl */ `
  uniform float uProgress;
  ${surfaceVertex(PULSE_DISPLACE)}
`;

const PULSE_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uProgress;
  uniform vec3 uColor;
  uniform vec3 uCore;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float ribs = pow(max(0.0, cos(a * 12.0 + uClock * 0.3)), 12.0);
    float front = exp(-abs(r - (0.3 + uProgress * 0.45)) * 22.0);
    vec2 burn = dissolveMask(snoise01(vec3(p * 6.0, 4.1)), uProgress * uProgress, 0.1);
    float alpha = ((0.18 + ribs * 0.35 + front * 0.3) * burn.x + burn.y * 0.6) * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(mix(uColor, uCore, clamp(ribs * 0.35 + front * 0.35 + burn.y, 0.0, 1.0)), alpha);
  }
`;

export function createVigilPulseMaterial() {
  return holyMaterial({ vertexShader: PULSE_VERTEX, fragmentShader: PULSE_FRAGMENT, uniforms: { uProgress: { value: 0 }, uFade: { value: 0 } } });
}

/**
 * The immediate footprint: the whole damage disc lights for an instant, so
 * the player reads exactly what the pulse covered.
 */
const FOOTPRINT_FRAGMENT = /* glsl */ `
  uniform float uFade;
  uniform vec3 uColor;
  uniform vec3 uCore;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float inside = 1.0 - smoothstep(0.9, 1.0, r);
    float edge = exp(-abs(r - 0.88) * 35.0);
    float centre = exp(-r * 3.0);
    float grain = 0.8 + 0.4 * snoise01(vec3(p * 9.0, 1.0));
    float alpha = inside * (0.16 + edge * 0.35 + centre * 0.12) * grain * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(mix(uColor, uCore, centre * 0.35 + edge * 0.25), alpha);
  }
`;

export function createVigilFootprintMaterial() {
  return holyMaterial({ fragmentShader: FOOTPRINT_FRAGMENT, uniforms: { uFade: { value: 0 } } });
}

/* ---------------------------------------------------------------------- */
/* The consecrated ground (the deep stop under the sigil)                  */
/* ---------------------------------------------------------------------- */

/**
 * A dark bronze stain under the sigil, drawn round with the same sweep: the
 * floor inside the sanctuary goes deep and warm so the gold reads against it,
 * with a faint ember grain and a darker rim. Normal blending, so it darkens.
 */
const GROUND_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uReveal;
  uniform float uDark;
  uniform vec3 uDeep;
  uniform vec3 uColor;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float sweep = (a + 3.14159265) / 6.2831853;
    float drawn = 1.0 - smoothstep(uReveal * 1.05 - 0.08, uReveal * 1.05, sweep);
    float n = fbm3(vec3(p * 3.0, 1.7));
    float disc = (1.0 - smoothstep(0.88 + n * 0.06, 1.0, r));
    float grain = pow(snoise01(vec3(p * 9.0, uClock * 0.3)), 6.0);
    vec3 color = uDeep * (0.7 + 0.5 * n) + uColor * grain * 0.6;
    float alpha = disc * drawn * uDark * (0.75 + 0.25 * n) * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createVigilGroundMaterial() {
  return holyMaterial({
    fragmentShader: GROUND_FRAGMENT,
    blending: NormalBlending,
    uniforms: { uReveal: { value: 0 }, uDark: { value: 0.6 }, uDeep: { value: new Color('#3a2209') } }
  });
}

/* ---------------------------------------------------------------------- */
/* The processional runner (travel)                                        */
/* ---------------------------------------------------------------------- */

/**
 * The path the votive is carried along, laid on the floor behind it as it
 * goes: a runner of light from the hand to the votive. `vUv.y` runs 0 at the
 * hand to 1 at the votive (`uFront` metres), `vUv.x` across. A white-gold
 * centre line and two gilt borders over a dark bronze cloth, rune dashes
 * marching toward the circle, hottest at the votive and cooling to bronze at
 * the hand. After the arrival it is taken up from the hand end (`uTake`).
 */
const RUNNER_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uFront;
  uniform float uTake;
  uniform float uGlow;
  uniform vec3 uColor;
  uniform vec3 uCore;
  uniform vec3 uDeep;
  ${SURFACE_VARYINGS}

  ${noiseGLSL}

  void main() {
    float along = vUv.y;
    float wob = snoise(vec3(along * 12.0, uClock, 0.0)) * 0.03;
    if (along < uTake + wob) discard;
    float x = abs(vUv.x - 0.5) * 2.0;
    float metres = along * uFront;
    float heat = smoothstep(0.0, 1.0, along);
    float centre = exp(-x * x * 28.0);
    float borders = exp(-abs(x - 0.72) * 26.0);
    float dashes = step(0.55, fract(metres * 1.4 - uClock * 2.0)) * exp(-abs(x - 0.38) * 22.0);
    float takeEdge = (1.0 - smoothstep(0.0, 0.05, along - uTake - wob)) * step(0.001, uTake);
    float edge = 1.0 - smoothstep(0.8, 1.0, x + snoise(vec3(metres * 1.5, 0.0, 2.0)) * 0.08);
    float tail = smoothstep(0.0, 0.08, along);

    vec3 light = uColor * (centre * 1.2 + borders * 0.8 + dashes * 0.6) * (0.5 + 0.5 * heat)
               + uCore * (centre * pow(heat, 4.0) * 1.6 + takeEdge * 1.5);
    vec3 color = uDeep + light * uGlow;
    float glow = clamp(centre + borders * 0.7 + dashes * 0.5 + takeEdge, 0.0, 1.0);
    float alpha = max(0.7 * edge * (0.5 + 0.5 * heat), glow) * tail * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createVigilRunnerMaterial() {
  return holyMaterial({
    fragmentShader: RUNNER_FRAGMENT,
    blending: NormalBlending,
    uniforms: { uFront: { value: 0 }, uTake: { value: 0 }, uDeep: { value: new Color('#3a2209') } }
  });
}
