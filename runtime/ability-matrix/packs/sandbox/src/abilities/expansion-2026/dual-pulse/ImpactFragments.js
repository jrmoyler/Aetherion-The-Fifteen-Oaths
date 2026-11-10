import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Object3D,
  ShaderMaterial,
} from 'three';
import { LAYER } from '../../../core/Layers.js';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { PULSE_GLOBALS_GLSL, pulseUniforms } from './PulseUniforms.js';

/**
 * Layer 4b · impact fragments — 24 instanced pieces thrown by the strike.
 *
 * Fire throws **swept flame splinters** in two bursts, each at an actual
 * strike time (q = 0 and q = pulse), flying out and up and burning out in
 * under a quarter of the impact phase. Frost rides **closed six-faced crystal
 * shards** on the expanding wave itself: shard `i` sits exactly at
 * `radius × q` on its bearing, so the shards are the frost front.
 */

/** Pieces per cast; the instanced capacity. */
export const FRAGMENTS = 24;

/** A swept flame splinter, or a closed six-faced crystal shard. */
export function fragmentGeometry(fire) {
  const points = [];
  const uv = [];
  const face = (a, b, c) => {
    points.push(...a, ...b, ...c);
    uv.push(0, 0, 1, 0, 0.5, 1);
  };
  if (fire) {
    const tip = [0, 0.05, 0.34];
    const tail = [0, 0.02, -0.38];
    const l = [-0.06, 0, 0];
    const r = [0.06, 0, 0];
    const top = [0, 0.07, 0];
    face(l, r, tip);
    face(r, l, tail);
    face(l, top, tip);
    face(top, r, tip);
    face(top, l, tail);
    face(r, top, tail);
  } else {
    const top = [0, 0.44, 0];
    const bottom = [0, -0.08, 0];
    const ring = [[-0.07, 0.12, 0], [0, 0.12, 0.07], [0.07, 0.12, 0], [0, 0.12, -0.07]];
    for (let i = 0; i < 4; i++) {
      face(ring[i], ring[(i + 1) % 4], top);
      face(ring[(i + 1) % 4], ring[i], bottom);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(points, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

const FRAGMENT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vView;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 world = modelMatrix * local;
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    vView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FIRE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform vec3  tint;
  uniform float fade;
  uniform float glow;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vView;
  varying vec3 vWorld;
  ${noiseGLSL}
  void main() {
    // Each splinter flickers on its own world-space noise.
    float flick = 0.5 + (snoise01(vWorld * 4.0 * uNoiseScale + clock * 6.0) - 0.5) * uNoiseStrength;
    float edge = 1.0 - vUv.y * 0.65;
    gl_FragColor = vec4(tint * (1.0 + glow + flick) * uGlobalGlow, edge * fade * uGlobalOpacity * (0.55 + 0.35 * flick));
  }
`;

const FROST_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3  tint;
  uniform float fade;
  uniform float glow;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vView;
  varying vec3 vWorld;
  void main() {
    float facets = pow(max(0.0, sin(vUv.y * 17.0 + vUv.x * 5.0)), 10.0);
    float f = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vView))), 2.0) * uFresnel;
    gl_FragColor = vec4(tint * (1.0 + glow * 0.5 + facets + f) * uGlobalGlow, fade * uGlobalOpacity * (1.0 - vUv.y * 0.5) * (0.55 + 0.35 * f));
  }
`;

export function createImpactFragments(root, resources, fire) {
  const own = (x) => (resources.push(x), x);
  const group = new Group();
  root.add(group);
  const mat = own(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      toneMapped: false,
      uniforms: pulseUniforms({
        clock: { value: 0 },
        tint: { value: new Color(fire ? '#ffba52' : '#bfeeff') },
        fade: { value: 1 },
        glow: { value: 1 },
      }),
      vertexShader: FRAGMENT_VERTEX,
      fragmentShader: fire ? FIRE_FRAGMENT : FROST_FRAGMENT,
    }),
  );
  const mesh = new InstancedMesh(own(fragmentGeometry(fire)), mat, FRAGMENTS);
  mesh.count = FRAGMENTS;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.layers.set(LAYER.VFX);
  group.add(mesh);
  return { group, mesh, object: new Object3D(), fire };
}

/** Fire bursts at the two real strike times; frost shards ride the hit wave. */
export function updateImpactFragments(f, { phase, q, pulse, radius, fade, scale, glow, tint, clock = 0 }) {
  const active = phase === 'impact' || phase === 'fade';
  f.group.visible = active;
  if (!active) return;
  // Fire: time since the latest strike, burning out over 0.24 of the phase.
  const age = f.fire ? (q >= pulse ? q - pulse : q) : q;
  const progress = f.fire ? Math.min(1, Math.max(0, age / 0.24)) : q;
  const intensity = f.fire ? Math.max(0, 1 - progress) : 1;
  const travel = f.fire ? 0.16 + 0.7 * progress : q;
  const obj = f.object;
  for (let i = 0; i < FRAGMENTS; i++) {
    const a = (i * Math.PI * 2) / FRAGMENTS;
    const r = radius * travel;
    obj.position.set(Math.sin(a) * r, f.fire ? 0.12 + progress * 0.5 : 0.08, Math.cos(a) * r);
    obj.rotation.set(f.fire ? -0.2 : 0, a, 0);
    // Frost shards grow in over the first fifth of the ring, then hold.
    obj.scale.setScalar(Math.max(0.001, scale * (f.fire ? intensity : Math.min(1, q * 5))));
    obj.updateMatrix();
    f.mesh.setMatrixAt(i, obj.matrix);
  }
  f.mesh.instanceMatrix.needsUpdate = true;
  const u = f.mesh.material.uniforms;
  u.fade.value = fade * (f.fire ? intensity : 1);
  u.tint.value.set(tint);
  u.glow.value = glow;
  u.clock.value = clock;
}
