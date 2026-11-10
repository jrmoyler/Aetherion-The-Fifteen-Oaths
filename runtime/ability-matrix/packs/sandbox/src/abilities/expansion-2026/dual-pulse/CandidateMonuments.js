import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  ShaderMaterial,
} from 'three';
import { LAYER } from '../../../core/Layers.js';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { PULSE_GLOBALS_GLSL, pulseUniforms } from './PulseUniforms.js';

/**
 * Layer 3 · the monument at the centre of the circle.
 *
 * Fire: a **coal heart** — a closed, faceted lump of coal, irregular (every
 * vertex pushed by a deterministic hash so no two facets match) with four
 * raised fire veins. Frost: a **glacier bell** — a lathed bell with a fluted
 * waist, a scalloped lip hollowed beneath, and a crown loop on top.
 *
 * Three parts each:
 *   - **solid** — opaque and depth-writing, under a bespoke lit shader in
 *     the Fabricator housing idiom: wrapped diffuse from `uLightDir`, a
 *     specular glint, an fbm-grained emissive driven by the strike energy,
 *     and a noise **dissolve** on `1 − fade × global.opacity` with a burning
 *     edge, so it crumbles away over the linger instead of going see-through.
 *     It is on `LAYER.SHAPED` (as the Fabricator's housing is): opaque and
 *     lit, but kept out of the depth prepass so the dissolved part never
 *     rasterises there. DoubleSide with the normal flipped on back faces,
 *     because the bell is open beneath and the coal's vein fins are thin.
 *   - **shell** — the same surface pushed out slightly under a bespoke
 *     fresnel shader: glowing voronoi cracks pulsing with each strike on the
 *     coal, a frosted rim and drifting rime on the bell.
 *   - **shafts** — eight rising flame shafts round the heart, or six ice
 *     teeth splayed round the bell's foot.
 */

/** Deterministic 0..1 hash of an integer pair, for repeatable coal facets. */
function hash(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** A closed, faceted coal with four raised fire veins. */
export function emberHeartGeometry() {
  const p = [];
  const tri = (a, b, c) => p.push(...a, ...b, ...c);
  const n = 14;
  // [height, radius] rings from the foot to the crown, each jittered.
  const rings = [[0.04, 0.16], [0.22, 0.3], [0.42, 0.31], [0.62, 0.24], [0.78, 0.13]];
  const vertex = (i, j) => {
    const a = ((i % n) * Math.PI * 2) / n;
    const [y, r] = rings[j];
    const k = 1 + (hash(i % n, j) - 0.5) * 0.28;
    return [Math.cos(a) * r * k, y + (hash(j, i % n) - 0.5) * 0.05, Math.sin(a) * r * k];
  };
  const bottom = [0, 0, 0];
  const top = [0, 0.86, 0];
  for (let i = 0; i < n; i++) {
    tri(bottom, vertex(i + 1, 0), vertex(i, 0));
    for (let j = 0; j < rings.length - 1; j++) {
      const a = vertex(i, j);
      const b = vertex(i + 1, j);
      const c = vertex(i, j + 1);
      const d = vertex(i + 1, j + 1);
      tri(a, b, c);
      tri(b, d, c);
    }
    tri(vertex(i, rings.length - 1), vertex(i + 1, rings.length - 1), top);
    // A raised vein ridge every few facets: a thin fin standing off the coal.
    if (i % 4 === 0) {
      const a = (i * Math.PI * 2) / n;
      const ring = (angle, y, r) => [Math.cos(angle) * r, y, Math.sin(angle) * r];
      tri(ring(a - 0.07, 0.25, 0.32), ring(a + 0.07, 0.25, 0.32), ring(a, 0.76, 0.27));
      tri(ring(a + 0.07, 0.25, 0.32), ring(a - 0.07, 0.25, 0.32), ring(a, 0.76, 0.27));
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

/** A solid bell: fluted, scalloped on its rim, hollowed beneath, with a crown loop. */
export function glacierBellGeometry() {
  const p = [];
  const n = 40;
  const tri = (a, b, c) => p.push(...a, ...b, ...c);
  // Outer profile down to the lip, then the inner wall back up: one sweep.
  const profile = [[0, 0.83], [0.13, 0.79], [0.22, 0.65], [0.28, 0.4], [0.34, 0.14], [0.38, 0.06], [0.29, 0.09], [0.24, 0.2]];
  const v = (i, j) => {
    const a = (i * Math.PI * 2) / n;
    const [r, y] = profile[j];
    const flute = 1 + 0.07 * Math.cos(a * 6);
    // The lip (rows 4..6) is scalloped: it dips between flutes.
    const scallop = j >= 4 && j <= 6 ? 0.025 * Math.cos(a * 6) : 0;
    return [Math.sin(a) * r * flute, y + scallop, Math.cos(a) * r * flute];
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < profile.length - 1; j++) {
      const a = v(i, j);
      const b = v(i + 1, j);
      const c = v(i, j + 1);
      const d = v(i + 1, j + 1);
      tri(a, c, b);
      tri(b, c, d);
    }
  }
  // The crown loop: a flat hexagonal ring stood on top.
  const m = 6;
  for (let i = 0; i < m; i++) {
    const a0 = (i * Math.PI * 2) / m;
    const a1 = ((i + 1) * Math.PI * 2) / m;
    const ring = (a, r) => [0, 0.92 + Math.cos(a) * r, Math.sin(a) * r];
    tri(ring(a0, 0.06), ring(a1, 0.06), ring(a0, 0.1));
    tri(ring(a1, 0.06), ring(a1, 0.1), ring(a0, 0.1));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

/** Eight rising flame shafts, or six ice teeth splayed at the foot. */
function shaftGeometry(fire) {
  const v = [];
  const uv = [];
  const count = fire ? 8 : 6;
  for (let i = 0; i < count; i++) {
    const a = (i * Math.PI * 2) / count;
    const s = Math.sin(a);
    const c = Math.cos(a);
    const r = fire ? 0.3 : 0.35;
    const tip = fire ? [s * 0.48, 1.05, c * 0.48] : [s * 0.72, 0.1, c * 0.72];
    v.push(s * r + c * 0.035, 0.18, c * r - s * 0.035, s * r - c * 0.035, 0.18, c * r + s * 0.035, ...tip);
    uv.push(0, 0, 1, 0, 0.5, 1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/* ==================================================================== */
/* Solid                                                                  */
/* ==================================================================== */

const SOLID_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SOLID_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float fade;          // 1 standing, 0 fully dissolved
  uniform float energy;        // strike energy, 0..1
  uniform float uEmissiveIntensity;
  uniform float uMetal;        // specular weight
  uniform float uRoughness;    // 0 mirror .. 1 matte
  uniform float uEdgeGlow;
  uniform vec3  uColor;
  uniform vec3  uEmissive;
  uniform vec3  uEdgeColor;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  ${PULSE_GLOBALS_GLSL}
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  ${noiseGLSL}
  void main() {
    // --- dissolve ------------------------------------------------------
    // The threshold runs from just below the noise floor (nothing cut) to
    // just above its ceiling (everything cut), so fade 1 and 0 really are
    // "whole" and "gone" and the last fragment never pops.
    float n = snoise01(vLocal * 7.0 * uNoiseScale);
    float gone = 1.0 - clamp(fade * uGlobalOpacity, 0.0, 1.0);
    float threshold = gone * 1.12 - 0.06;
    float d = n - threshold;
    if (d < 0.0) discard;
    // The cut burns; the burn only exists while it is actually dissolving.
    float edge = (1.0 - smoothstep(0.0, 0.07, d)) * smoothstep(0.0, 0.04, gone);

    // --- lighting --------------------------------------------------------
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    // Wrapped so the far side is still painted coal / ice, not a black hole.
    float diffuse = 0.3 + 0.7 * clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    float spec = pow(max(dot(N, normalize(L + V)), 0.0), mix(96.0, 8.0, uRoughness)) * uMetal;
    float rim = pow(1.0 - abs(dot(N, V)), 3.0) * 0.35 * uFresnel;

    // --- emissive: smouldering grain that floods on each strike ----------
    float grain = fbm3(vLocal * 9.0 * uNoiseScale + vec3(0.0, clock * 0.6, 0.0)) * 0.5 + 0.5;
    grain = 0.5 + (grain - 0.5) * uNoiseStrength;
    // uEmissiveIntensity already carries the strike energy; the grain only
    // decides where it shows, and spreads wider as the energy rises.
    float glowMask = mix(0.35, 1.0, smoothstep(0.55 - energy * 0.3, 0.85, grain));
    vec3 emissive = uEmissive * uEmissiveIntensity * glowMask * uGlobalGlow;

    vec3 color = uColor * diffuse + vec3(spec) + uEmissive * rim + emissive;
    color += uEdgeColor * edge * uEdgeGlow * uGlobalGlow * uShaderIntensity;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * The monument's opaque body. `emissiveIntensity`, `color` and `emissive`
 * are mirrored onto the uniforms so the material reads like the stock lit
 * material it replaces.
 */
function createSolidMaterial(fire) {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: pulseUniforms({
      clock: { value: 0 },
      fade: { value: 1 },
      energy: { value: 0 },
      uEmissiveIntensity: { value: 0.7 },
      uMetal: { value: fire ? 0.3 : 0.55 },
      uRoughness: { value: fire ? 0.6 : 0.2 },
      uEdgeGlow: { value: 2.5 },
      uColor: { value: new Color(fire ? '#3e160e' : '#477691') },
      uEmissive: { value: new Color(fire ? '#a93108' : '#183e65') },
      uEdgeColor: { value: new Color(fire ? '#ffb347' : '#e6fbff') },
    }),
    vertexShader: SOLID_VERTEX,
    fragmentShader: SOLID_FRAGMENT,
  });
  const u = material.uniforms;
  Object.defineProperties(material, {
    emissiveIntensity: { get: () => u.uEmissiveIntensity.value, set: (v) => (u.uEmissiveIntensity.value = v) },
    color: { get: () => u.uColor.value },
    emissive: { get: () => u.uEmissive.value },
  });
  return material;
}

/* ==================================================================== */
/* Shafts + shell                                                         */
/* ==================================================================== */

const SHAFT_VERTEX = /* glsl */ `
  uniform float power;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.y *= 0.45 + power * 0.55;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FIRE_SHAFT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float power;
  uniform float fade;
  uniform vec3  tint;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    float flicker = pow(max(0.0, sin(vUv.y * 18.0 - clock * 6.0)), 4.0);
    float lick = 0.5 + (snoise01(vec3(vUv * vec2(3.0, 5.0) * uNoiseScale, clock * 2.5)) - 0.5) * uNoiseStrength;
    gl_FragColor = vec4(tint * (1.0 + flicker + power + lick * 0.5) * uGlobalGlow, fade * uGlobalOpacity * (1.0 - vUv.y) * (0.5 + 0.4 * lick));
  }
`;

const FROST_SHAFT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float power;
  uniform float fade;
  uniform vec3  tint;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  void main() {
    float glint = pow(max(0.0, sin(vUv.y * 32.0 + clock * 2.0)), 16.0);
    gl_FragColor = vec4(tint * (1.0 + glint) * uGlobalGlow, fade * uGlobalOpacity * (1.0 - vUv.y) * (0.3 + 0.5 * power));
  }
`;

const SHELL_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FIRE_SHELL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float power;
  uniform float fade;
  uniform float glow;
  uniform float rimPower;
  uniform vec3  tint;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  ${PULSE_GLOBALS_GLSL}
  varying vec3 vNormalW;
  varying vec3 vView;
  varying vec3 vLocal;
  ${noiseGLSL}
  void main() {
    // Cracks: the borders between voronoi cells, which flood with light on
    // each strike and smoulder between.
    vec2 cp = (vLocal.xz * 9.0 + vLocal.y * 4.0) * uNoiseScale;
    vec2 cell = voronoi2(cp);
    // A border is where a small step lands in a different cell, or where we
    // are far from the cell's own seed.
    vec2 next = voronoi2(cp + 0.04);
    float crack = max(step(1e-4, abs(cell.y - next.y)), smoothstep(0.45, 0.65, cell.x)) * uNoiseStrength;
    float f = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vView))), max(rimPower, 0.1)) * uFresnel;
    float smoulder = 0.5 + 0.5 * sin(clock * 3.0 + cell.y * 20.0);
    float alpha = (crack * (0.25 + power * 0.9) * (0.6 + 0.4 * smoulder) * uShaderIntensity + f * 0.5) * fade * uGlobalOpacity;
    gl_FragColor = vec4(tint * glow * uGlobalGlow * (1.0 + power * 1.5), clamp(alpha, 0.0, 1.0));
  }
`;

const FROST_SHELL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float power;
  uniform float fade;
  uniform float glow;
  uniform float rimPower;
  uniform vec3  tint;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  ${PULSE_GLOBALS_GLSL}
  varying vec3 vNormalW;
  varying vec3 vView;
  varying vec3 vLocal;
  ${noiseGLSL}
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vView))), max(rimPower, 0.1)) * uFresnel;
    // Rime drifting down the bell as it rings.
    float rime = fbm3(vec3(vLocal.xz * 8.0, vLocal.y * 6.0) * uNoiseScale + vec3(0.0, clock * 0.4, 0.0)) * 0.5 * uNoiseStrength + 0.5;
    float alpha = (f * (0.6 + 0.6 * power) + smoothstep(0.55, 0.85, rime) * 0.3 * uShaderIntensity) * fade * uGlobalOpacity;
    gl_FragColor = vec4(tint * glow * uGlobalGlow * (0.8 + f + power * 0.6), clamp(alpha, 0.0, 1.0));
  }
`;

export function createCandidateMonument(root, resources, fire) {
  const own = (x) => (resources.push(x), x);
  const group = new Group();
  root.add(group);
  const geometry = own(fire ? emberHeartGeometry() : glacierBellGeometry());
  const solid = new Mesh(geometry, own(createSolidMaterial(fire)));
  // Opaque and lit, out of the depth prepass (see the file comment).
  solid.layers.set(LAYER.SHAPED);
  group.add(solid);

  const shell = new Mesh(
    geometry,
    own(
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
        toneMapped: false,
        uniforms: pulseUniforms({
          clock: { value: 0 },
          power: { value: 0 },
          fade: { value: 1 },
          glow: { value: 1.2 },
          rimPower: { value: fire ? 2.2 : 3 },
          tint: { value: new Color(fire ? '#ff9a28' : '#adf4ff') },
        }),
        vertexShader: SHELL_VERTEX,
        fragmentShader: fire ? FIRE_SHELL_FRAGMENT : FROST_SHELL_FRAGMENT,
      }),
    ),
  );
  // Pushed out a few percent so it never z-fights the solid.
  shell.scale.setScalar(1.04);
  shell.layers.set(LAYER.VFX);
  group.add(shell);

  const shafts = new Mesh(
    own(shaftGeometry(fire)),
    own(
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
        toneMapped: false,
        uniforms: pulseUniforms({
          clock: { value: 0 },
          power: { value: 0 },
          fade: { value: 1 },
          tint: { value: new Color(fire ? '#ff9a28' : '#adf4ff') },
        }),
        vertexShader: SHAFT_VERTEX,
        fragmentShader: fire ? FIRE_SHAFT_FRAGMENT : FROST_SHAFT_FRAGMENT,
      }),
    ),
  );
  shafts.layers.set(LAYER.VFX);
  group.add(shafts);
  return { group, solid, shell, shafts, fire };
}

/**
 * Fire's energy spikes on each strike (q = 0 and q = pulse) and idles at
 * 0.12 before impact; frost's builds with the ring, q.
 */
export function updateCandidateMonument(m, { q, phase, pulse, fade, clock, tint, scale, glow, color, emissive, shellGlow = 1.2, shellPower }) {
  const active = phase === 'impact' || phase === 'fade';
  const energy = m.fire
    ? active ? Math.max(0, 1 - q / 0.14, 1 - Math.abs(q - pulse) / 0.14) : 0.12
    : active ? q : 0;
  m.group.scale.setScalar(scale);
  m.group.position.y = m.fire ? 0.22 : 0.1;
  const solid = m.solid.material;
  const su = solid.uniforms;
  su.clock.value = clock;
  su.fade.value = fade;
  su.energy.value = energy;
  solid.emissiveIntensity = glow * (0.4 + energy);
  if (color) solid.color.set(color);
  if (emissive) solid.emissive.set(emissive);
  su.uEdgeColor.value.set(tint);
  const shell = m.shell.material.uniforms;
  shell.clock.value = clock;
  shell.power.value = energy;
  shell.fade.value = fade;
  shell.glow.value = shellGlow;
  if (shellPower !== undefined) shell.rimPower.value = shellPower;
  shell.tint.value.set(tint);
  const u = m.shafts.material.uniforms;
  u.clock.value = clock;
  u.power.value = energy;
  u.fade.value = fade;
  u.tint.value.set(tint);
}
