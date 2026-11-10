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
 * Layer 2c · the authored stage — the shape that *is* each cast's beat.
 *
 * Fire: eight split crown plates leaning in round the heart, each a tall
 * blade with a shorter inner blade, alternating heights so the crown has a
 * real silhouette. They flare to full height on each strike and settle
 * between.
 *
 * Frost: a six-armed branching lattice laid on the floor — a snowflake's
 * arms with two pairs of side branches each. It is drawn at `radius × q`,
 * the very radius the hit test uses, so the lattice edge *is* the frost
 * front: what you see reaching a body is what strikes it.
 *
 * Both are unit-radius buffers; a hairline ring traces their outer edge.
 * `ice` selects frost (the stage's argument is phrased as ice/not-ice).
 */

function bladeGeometry(ice) {
  const vertices = [];
  const uv = [];
  const tri = (a, b, c) => {
    vertices.push(...a, ...b, ...c);
    uv.push(0, 0, 1, 0, 0.5, 1);
  };
  const arms = ice ? 6 : 8;
  for (let i = 0; i < arms; i++) {
    const angle = (i * Math.PI * 2) / arms;
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    const tx = c;
    const tz = -s;
    // r: out along the arm, w: across it, y: up.
    const point = (r, w, y) => [s * r + tx * w, y, c * r + tz * w];
    if (ice) {
      tri(point(0.12, -0.025, 0.06), point(0.12, 0.025, 0.06), point(0.97, 0, 0.08));
      for (const sign of [-1, 1]) {
        tri(point(0.52, 0, 0.08), point(0.69, 0.022 * sign, 0.08), point(0.76, 0.19 * sign, 0.08));
        tri(point(0.72, 0, 0.08), point(0.82, 0.018 * sign, 0.08), point(0.88, 0.11 * sign, 0.08));
      }
    } else {
      tri(point(0.34, -0.075, 0.05), point(0.34, 0.075, 0.05), point(0.76, 0, 0.74 + (i % 2) * 0.16));
      tri(point(0.48, -0.035, 0.06), point(0.48, 0.035, 0.06), point(0.82, 0, 0.52));
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A hairline ring, unit radius, with uv.y across the band. */
function lineGeometry(segments = 96) {
  const positions = [];
  const uv = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = t * Math.PI * 2;
    positions.push(Math.cos(a) * 0.975, 0, Math.sin(a) * 0.975, Math.cos(a), 0, Math.sin(a));
    uv.push(t, 0, t, 1);
  }
  for (let i = 0; i < segments; i++) {
    const k = i * 2;
    indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  return g;
}

const STAGE_VERTEX = /* glsl */ `
  uniform float energy;
  varying vec2 vUv;
  varying vec3 vLocal;
  void main() {
    vUv = uv;
    vLocal = position;
    vec3 p = position;
    // Plates stand to full height only when the strike's energy is up.
    p.y *= 0.45 + 0.55 * energy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FIRE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float fade;
  uniform float energy;
  uniform vec3  tint;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  varying vec3 vLocal;
  ${noiseGLSL}
  void main() {
    float ember = pow(max(0.0, sin(vUv.y * 14.0 - clock * 4.0)), 5.0);
    // Heat haze running up the plate, broken by noise so it never bands.
    float heat = 0.5 + (snoise01(vec3(vLocal.xz * 6.0, vUv.y * 2.5) * uNoiseScale - vec3(0.0, 0.0, clock * 2.0)) - 0.5) * uNoiseStrength;
    float alpha = fade * uGlobalOpacity * (1.0 - vUv.y) * (0.35 + 0.65 * energy) * (0.7 + 0.5 * heat);
    gl_FragColor = vec4(tint * (1.0 + ember + energy + heat * 0.5) * uGlobalGlow, alpha);
  }
`;

const FROST_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float fade;
  uniform float energy;
  uniform vec3  tint;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  varying vec3 vLocal;
  ${noiseGLSL}
  void main() {
    float glint = pow(max(0.0, sin(vUv.y * 32.0 + vUv.x * 12.0 - clock)), 12.0);
    // Rime grain: fine voronoi so the arms read crystalline, not painted.
    float grain = voronoi2(vLocal.xz * 22.0 * uNoiseScale).x * uNoiseStrength;
    float alpha = fade * uGlobalOpacity * (1.0 - vUv.y * 0.5) * 0.65 * (0.75 + 0.35 * grain);
    gl_FragColor = vec4(tint * (0.9 + glint + energy * 0.5 + grain * 0.3) * uGlobalGlow, alpha);
  }
`;

function shader(ice) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: pulseUniforms({
      clock: { value: 0 },
      fade: { value: 1 },
      energy: { value: 0 },
      tint: { value: new Color(ice ? '#cdf6ff' : '#ffd06b') },
    }),
    vertexShader: STAGE_VERTEX,
    fragmentShader: ice ? FROST_FRAGMENT : FIRE_FRAGMENT,
  });
}

export function createAuthoredStages(root, resources, ice) {
  const own = (x) => (resources.push(x), x);
  const stage = new Group();
  root.add(stage);
  const mesh = new Mesh(own(bladeGeometry(ice)), own(shader(ice)));
  mesh.layers.set(LAYER.VFX);
  stage.add(mesh);
  const line = new Mesh(own(lineGeometry()), own(shader(ice)));
  line.position.y = 0.09;
  line.layers.set(LAYER.VFX);
  stage.add(line);
  return { stage, mesh, line, ice };
}

/**
 * `pulse` is the real second-strike threshold; `q` the actual impact
 * progress. Fire's energy peaks at q = 0 and q = pulse (each strike) and
 * idles at 0.16 before impact; frost's energy *is* q.
 */
export function updateAuthoredStages(stage, { radius, q, phase, pulse, fade, clock, tint, detailHeight }) {
  const active = phase === 'impact' || phase === 'fade';
  const energy = stage.ice
    ? active ? q : 0
    : active ? Math.max(0, 1 - Math.abs(q - pulse) / 0.16, 1 - q / 0.16) : 0.16;
  const scale = stage.ice ? (active ? Math.max(0.01, q) : 0.01) : 1;
  stage.stage.scale.set(radius * scale, detailHeight, radius * scale);
  stage.line.visible = stage.ice ? active : true;
  for (const object of [stage.mesh, stage.line]) {
    const u = object.material.uniforms;
    u.clock.value = clock;
    u.fade.value = fade;
    u.energy.value = energy;
    u.tint.value.set(tint);
  }
}
