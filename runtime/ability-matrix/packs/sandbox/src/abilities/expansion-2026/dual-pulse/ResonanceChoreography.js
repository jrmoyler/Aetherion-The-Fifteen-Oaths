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
 * Layer 6 · resonance — the part that *moves* with the strike.
 *
 * Fire: a **split ember crown** of eight leaning tongues round the heart that
 * flexes open on each real strike (q = 0, q = pulse) and turns slowly.
 * Frost: the bell's **striker** — a shaft with a faceted pendulum bob hung
 * inside the bell's silhouette, swinging in a decaying oscillation as the
 * ring expands, which is the "ring" of the bell made visible. Reduced motion
 * holds both still; gameplay timing is unchanged.
 */

function geometry(fire) {
  const p = [];
  const uv = [];
  const face = (a, b, c) => {
    p.push(...a, ...b, ...c);
    uv.push(0, 0, 1, 0, 0.5, 1);
  };
  if (fire) {
    // A split ember crown that opens when each real pulse fires.
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      const b = ((i + 0.55) * Math.PI * 2) / 8;
      const m = (a + b) / 2;
      face([Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5], [Math.sin(b) * 0.5, 0, Math.cos(b) * 0.5], [Math.sin(m) * 0.73, 0.8, Math.cos(m) * 0.73]);
      face([Math.sin(b) * 0.5, 0, Math.cos(b) * 0.5], [Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5], [Math.sin(m) * 0.57, 0.25, Math.cos(m) * 0.57]);
    }
  } else {
    // Striker shaft with a faceted pendulum bob, kept inside the bell silhouette.
    const tip = [0, -0.58, 0];
    const lo = [-0.04, -0.44, 0];
    const ro = [0.04, -0.44, 0];
    const lt = [-0.025, 0, 0];
    const rt = [0.025, 0, 0];
    face(lt, rt, lo);
    face(rt, ro, lo);
    const ring = [[-0.11, -0.46, 0], [0, -0.46, 0.11], [0.11, -0.46, 0], [0, -0.46, -0.11]];
    for (let i = 0; i < 4; i++) {
      face(ring[i], ring[(i + 1) % 4], tip);
      face(ring[(i + 1) % 4], ring[i], [0, -0.35, 0]);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vLocal;
  void main() {
    vUv = uv;
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FIRE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform vec3  tint;
  uniform float energy;
  uniform float fade;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  varying vec3 vLocal;
  ${noiseGLSL}
  void main() {
    float flame = fbm3(vec3(vLocal.xz * 5.0, vLocal.y * 3.0) * uNoiseScale - vec3(0.0, 0.0, clock * 3.0)) * 0.5 * uNoiseStrength + 0.5;
    gl_FragColor = vec4(tint * (1.0 + energy + flame * 0.6) * uGlobalGlow, fade * uGlobalOpacity * (1.0 - vUv.y * 0.55) * (0.5 + 0.35 * flame));
  }
`;

const FROST_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3  tint;
  uniform float energy;
  uniform float fade;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  varying vec3 vLocal;
  void main() {
    float facet = 0.75 + 0.25 * sin(vUv.y * 18.0 + vLocal.y * 30.0);
    gl_FragColor = vec4(tint * (1.0 + energy) * uGlobalGlow, fade * uGlobalOpacity * facet * 0.75);
  }
`;

export function createResonance(root, resources, fire) {
  const own = (x) => (resources.push(x), x);
  const group = new Group();
  root.add(group);
  const material = own(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      toneMapped: false,
      uniforms: pulseUniforms({
        tint: { value: new Color(fire ? '#ffba52' : '#c8f6ff') },
        energy: { value: 0 },
        fade: { value: 1 },
        clock: { value: 0 },
      }),
      vertexShader: VERTEX,
      fragmentShader: fire ? FIRE_FRAGMENT : FROST_FRAGMENT,
    }),
  );
  const mesh = new Mesh(own(geometry(fire)), material);
  mesh.layers.set(LAYER.VFX);
  group.add(mesh);
  return { group, mesh, fire };
}

export function updateResonance(r, { phase, q, pulse, fade, scale, amplitude, tint, reducedMotion, clock = 0 }) {
  const active = phase === 'impact' || phase === 'fade';
  r.group.visible = active;
  const energy = r.fire ? Math.max(0, 1 - q / 0.15, 1 - Math.abs(q - pulse) / 0.15) : Math.max(0, 1 - q);
  r.group.position.y = r.fire ? 0.3 : 0.8;
  r.group.scale.setScalar(scale);
  if (r.fire) {
    // The crown flexes open on each strike.
    r.mesh.rotation.y = reducedMotion ? 0 : q * 0.5;
    r.mesh.scale.set(1 + energy * amplitude * 0.2, 1 + energy * amplitude * 0.3, 1 + energy * amplitude * 0.2);
  } else {
    // Three decaying swings across the ring's life: the bell ringing out.
    r.mesh.rotation.z = reducedMotion ? 0 : Math.sin(q * Math.PI * 6) * (1 - q) * amplitude * 0.4;
    r.mesh.scale.setScalar(1);
  }
  const u = r.mesh.material.uniforms;
  u.tint.value.set(tint);
  u.energy.value = energy;
  u.fade.value = fade;
  u.clock.value = clock;
}
