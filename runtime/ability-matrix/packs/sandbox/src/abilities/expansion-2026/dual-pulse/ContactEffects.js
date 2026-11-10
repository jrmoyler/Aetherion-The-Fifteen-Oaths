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
 * Layer 4c · contacts — a cue on each body a strike actually reached.
 *
 * Only a hit the combat layer (or the standalone dummy) accepted adds one,
 * at the body's position *local to the circle*. Fire stamps a flat, forked
 * starlet that spins out and burns off (0.34 s by default); frost raises a
 * radial crown of ice spikes that grows in and settles (0.62 s). Both
 * lifetimes are the live `contactLife` setting. A fixed pool of
 * `CAPACITY` records, written round-robin into one instanced mesh.
 */

/** Live contact cues at once; the instanced capacity. */
const CAPACITY = 16;

/** Fire bursts are flat, forked starlets; frost contacts are a radial crown of spikes. */
export function contactGeometry(fire) {
  const v = [];
  const uv = [];
  const tri = (a, b, c) => {
    v.push(...a, ...b, ...c);
    uv.push(0, 0, 1, 0, 0.5, 1);
  };
  const count = fire ? 8 : 6;
  for (let i = 0; i < count; i++) {
    const a = (i * Math.PI * 2) / count;
    const s = Math.sin(a);
    const c = Math.cos(a);
    const x = c;
    const z = -s;
    if (fire) {
      tri([x * -0.025, 0.04, z * -0.025], [x * 0.025, 0.04, z * 0.025], [s * 0.36, 0.07, c * 0.36]);
      tri([s * 0.15, 0.05, c * 0.15], [s * 0.23 + x * 0.09, 0.06, c * 0.23 + z * 0.09], [s * 0.32, 0.07, c * 0.32]);
    } else {
      tri([x * -0.035, 0.02, z * -0.035], [x * 0.035, 0.02, z * 0.035], [s * 0.18, 0.42, c * 0.18]);
      tri([s * 0.12, 0.02, c * 0.12], [s * 0.2, 0.02, c * 0.2], [s * 0.18, 0.42, c * 0.18]);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(v, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

const CONTACT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 local = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
    #endif
    vec4 world = modelMatrix * local;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FIRE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform vec3  tint;
  uniform float opacity;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  void main() {
    float sear = 0.5 + (snoise01(vec3(vWorld.xz * 9.0 * uNoiseScale, clock * 5.0)) - 0.5) * uNoiseStrength;
    gl_FragColor = vec4(tint * (1.7 + sear) * uGlobalGlow, (1.0 - vUv.y * 0.75) * opacity * uGlobalOpacity * (0.6 + 0.4 * sear));
  }
`;

const FROST_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3  tint;
  uniform float opacity;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    float edge = 0.7 + 0.3 * sin(vUv.y * 18.0);
    gl_FragColor = vec4(tint * 1.4 * uGlobalGlow, edge * (1.0 - vUv.y * 0.55) * opacity * uGlobalOpacity);
  }
`;

export function createContacts(root, resources, fire) {
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
        tint: { value: new Color(fire ? '#ffc150' : '#bcefff') },
        opacity: { value: 1 },
      }),
      vertexShader: CONTACT_VERTEX,
      fragmentShader: fire ? FIRE_FRAGMENT : FROST_FRAGMENT,
    }),
  );
  const mesh = new InstancedMesh(own(contactGeometry(fire)), mat, CAPACITY);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.layers.set(LAYER.VFX);
  mesh.count = 0;
  group.add(mesh);
  return {
    group,
    mesh,
    states: Array.from({ length: CAPACITY }, () => ({ x: 0, z: 0, age: 0, live: false })),
    next: 0,
    object: new Object3D(),
    fire,
  };
}

export function clearContacts(c) {
  for (const item of c.states) item.live = false;
  c.mesh.count = 0;
  c.next = 0;
}

/** Record a cue at circle-local (x, z). Overwrites the oldest when full. */
export function addContact(c, x, z) {
  const state = c.states[c.next];
  c.next = (c.next + 1) % CAPACITY;
  state.x = x;
  state.z = z;
  state.age = 0;
  state.live = true;
}

/**
 * Delta zero renders current state without advancing or emitting.
 * `life` is each cue's lifetime in seconds (`contactLife`); `clock` the
 * cast's shader clock.
 */
export function updateContacts(c, dt, tint, scale, opacity, reducedMotion = false, life = c.fire ? 0.34 : 0.62, clock = 0) {
  let n = 0;
  life = Math.max(0.01, life);
  for (const state of c.states) {
    if (!state.live) continue;
    state.age += Math.max(0, dt);
    const t = state.age / life;
    if (t >= 1) {
      state.live = false;
      continue;
    }
    const obj = c.object;
    obj.position.set(state.x, 0.06, state.z);
    obj.rotation.set(0, c.fire && !reducedMotion ? t * 1.5 : 0, 0);
    // Fire: flares out while burning off. Frost: grows in, then settles.
    const s = c.fire ? (1 + t * 0.5) * (1 - t) : Math.sin(Math.PI * Math.min(0.5, t)) * (1 - t * 0.35);
    obj.scale.setScalar(Math.max(0.001, scale * s));
    obj.updateMatrix();
    c.mesh.setMatrixAt(n++, obj.matrix);
  }
  c.mesh.count = n;
  c.mesh.instanceMatrix.needsUpdate = true;
  c.mesh.material.uniforms.tint.value.set(tint);
  c.mesh.material.uniforms.opacity.value = opacity;
  c.mesh.material.uniforms.clock.value = clock;
}
