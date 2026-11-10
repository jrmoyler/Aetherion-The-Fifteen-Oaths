import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, ShaderMaterial } from 'three';
import { LAYER } from '../../../core/Layers.js';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { PULSE_GLOBALS_GLSL, pulseUniforms } from './PulseUniforms.js';

/**
 * Layer 5 · the ground seal, each keyed to its own gameplay timing.
 *
 * Fire: a **scorch seal** — fbm char across the disc, glowing voronoi cracks
 * radiating out, faint heat rings, and two bright shock fronts that run from
 * the centre to the rim at each real strike (q = 0 and q = pulse).
 *
 * Frost: **rime** — everything inside the actual frost radius (q) is covered
 * in crystal plates (voronoi), six-fold arms and fine veins, with a sharp
 * bright front exactly at r = q: the same radius the hit test uses.
 *
 * A unit disc in XZ, scaled by `zoneRadius`. Uniform names are kept stable
 * because the tests and the editor bind to them.
 */

/** A unit disc in XZ with uv spanning the square (centre 0.5, 0.5). */
function discGeometry(segments = 72) {
  const positions = [0, 0, 0];
  const uv = [0.5, 0.5];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(a), 0, Math.sin(a));
    uv.push(0.5 + Math.cos(a) * 0.5, 0.5 - Math.sin(a) * 0.5);
  }
  for (let i = 1; i <= segments; i++) indices.push(0, i, i + 1);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  return g;
}

const VERTEX = /* glsl */ `
  varying vec2 p;
  void main() {
    p = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FIRE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float progress;
  uniform float pulse;
  uniform float fade;
  uniform float glow;
  uniform float opacity;
  uniform vec3  tint;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 p;
  ${noiseGLSL}

  /** A shock front launched at phase time t0, crossing the disc in 0.25 of the phase. */
  float shock(float r, float t0) {
    float age = progress - t0;
    if (age < 0.0) return 0.0;
    float at = clamp(age * 4.0, 0.0, 1.0);
    return exp(-abs(r - at) * 40.0) * max(0.0, 1.0 - age * 4.0);
  }

  void main() {
    float r = length(p);
    float mask = 1.0 - smoothstep(0.97, 1.0, r);
    // Char: dark fbm blotches that the glow sits on.
    float charred = fbm3(vec3(p * 3.0 * uNoiseScale, 0.7)) * 0.5 * uNoiseStrength + 0.5;
    // Cracks: voronoi borders, cells shrinking toward the rim so the
    // fractures read as radiating from the centre. Seamless (no atan).
    vec2 cell = voronoi2(p * (3.5 + 3.0 * r) * uNoiseScale);
    float cracks = smoothstep(0.55, 0.75, cell.x) * smoothstep(0.16, 0.4, r) * uNoiseStrength;
    float rings = pow(max(0.0, sin(r * 46.0 - clock * 2.0)), 22.0);
    float v = (cracks * (0.3 + 0.2 * charred) * uShaderIntensity + rings * 0.12 + shock(r, 0.0) * 0.75 + shock(r, pulse) * 0.75) * mask;
    gl_FragColor = vec4(tint * (1.0 + glow) * uGlobalGlow, v * fade * opacity * uGlobalOpacity);
  }
`;

const FROST_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float progress;
  uniform float fade;
  uniform float glow;
  uniform float opacity;
  uniform vec3  tint;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 p;
  ${noiseGLSL}
  void main() {
    float r = length(p);
    float a = atan(p.y, p.x);
    float mask = 1.0 - smoothstep(0.98, 1.0, r);
    // Everything inside the frost radius is covered.
    float covered = 1.0 - smoothstep(progress - 0.03, progress + 0.03, r);
    float arm = pow(max(0.0, cos(a * 6.0)), 18.0);
    float veins = pow(max(0.0, cos(a * 24.0 + r * 25.0)), 32.0);
    // Crystal plates: bright voronoi borders over the rime.
    float plates = smoothstep(0.4, 0.7, voronoi2(p * 7.0 * uNoiseScale).x) * uNoiseStrength;
    float front = exp(-abs(r - progress) * 55.0);
    float glint = pow(max(0.0, sin(r * 52.0 + a * 9.0 - clock)), 24.0);
    float v = (covered * (0.08 + arm * 0.25 + veins * 0.16 + glint * 0.08 + plates * 0.18 * uShaderIntensity) + front * 0.7) * mask;
    gl_FragColor = vec4(tint * (1.0 + glow) * uGlobalGlow, v * fade * opacity * uGlobalOpacity);
  }
`;

export function createElementalGround(root, resources, fire) {
  const uniforms = pulseUniforms({
    clock: { value: 0 },
    progress: { value: 0 },
    pulse: { value: 0 },
    fade: { value: 1 },
    glow: { value: 1 },
    opacity: { value: 1 },
    tint: { value: new Color(fire ? '#ff6030' : '#8edcff') },
  });
  const geometry = discGeometry();
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: fire ? FIRE_FRAGMENT : FROST_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  resources.push(geometry, material);
  const mesh = new Mesh(geometry, material);
  mesh.position.y = 0.025;
  mesh.layers.set(LAYER.VFX);
  root.add(mesh);
  return mesh;
}

/** Shown only once the strike has landed; scaled by the live radius. */
export function updateElementalGround(mesh, { phase, q, pulse, radius, fade, clock, tint, glow, opacity }) {
  mesh.visible = phase === 'impact' || phase === 'fade';
  // Unit disc in XZ: scale x/z by the radius (y is the flat axis).
  mesh.scale.set(radius, 1, radius);
  const u = mesh.material.uniforms;
  u.clock.value = clock;
  u.progress.value = q;
  u.pulse.value = pulse;
  u.fade.value = fade;
  u.tint.value.set(tint);
  u.glow.value = glow;
  u.opacity.value = opacity;
}
