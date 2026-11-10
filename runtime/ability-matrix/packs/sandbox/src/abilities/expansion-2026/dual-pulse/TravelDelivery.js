import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  ShaderMaterial,
} from 'three';
import { LAYER } from '../../../core/Layers.js';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { PULSE_GLOBALS_GLSL, pulseUniforms } from './PulseUniforms.js';

/**
 * Layer 1 · the delivery — what flies from the caster to the circle.
 *
 * Fire throws a **flame wedge**: a four-sided spearhead with a six-blade
 * flame tail, lobbed low. Frost throws a **glacial needle**: a hexagonal
 * bipyramid with three swept vanes, lobbed high and spinning. Both carry a
 * fixed-capacity line trail (48 samples, shifted in place — no allocation)
 * that records the real arcing position, so the trail is the path.
 */

/** Trail samples kept. The oldest is dropped once full. */
export const TRAIL_SAMPLES = 48;

/** Flying flame wedge and glacial needle: independent authored profiles. */
export function deliveryGeometry(fire) {
  const v = [];
  const uv = [];
  const face = (a, b, c) => {
    v.push(...a, ...b, ...c);
    uv.push(0, 0, 1, 0, 0.5, 1);
  };
  if (fire) {
    // The spearhead: four faces to the tip, four to a short tail point.
    const tip = [0, 0.45, 0.65];
    const base = [[0, 0.16, -0.42], [0.2, 0.26, -0.3], [0, 0.45, -0.28], [-0.2, 0.26, -0.3]];
    for (let i = 0; i < 4; i++) {
      face(base[i], base[(i + 1) % 4], tip);
      face(base[(i + 1) % 4], base[i], [0, 0.3, -0.58]);
    }
    // Six flame blades streaming off the back.
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const s = Math.sin(a);
      const c = Math.cos(a);
      face([s * 0.08, 0.3 + c * 0.08, -0.28], [s * 0.15, 0.3 + c * 0.15, -0.52], [s * 0.035, 0.3 + c * 0.035, -0.9]);
    }
  } else {
    // The needle: a hexagonal bipyramid, long in front, short behind.
    const tip = [0, 0.32, 0.8];
    const back = [0, 0.32, -0.58];
    const ring = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ring.push([Math.sin(a) * 0.16, 0.32 + Math.cos(a) * 0.16, 0]);
    }
    for (let i = 0; i < 6; i++) {
      face(ring[i], ring[(i + 1) % 6], tip);
      face(ring[(i + 1) % 6], ring[i], back);
    }
    // Three swept vanes, so the spin reads.
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      const s = Math.sin(a);
      const c = Math.cos(a);
      face([s * 0.14, 0.32 + c * 0.14, -0.15], [s * 0.42, 0.32 + c * 0.42, -0.32], [s * 0.1, 0.32 + c * 0.1, 0.25]);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

const DELIVERY_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    vUv = uv;
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FIRE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float glow;
  uniform vec3  tint;
  uniform vec3  core;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vView;
  varying vec3 vLocal;
  ${noiseGLSL}
  void main() {
    // Flame licking back along the wedge: ridged noise scrolled tail-ward.
    float flame = ridged(vec3(vLocal.xy * 6.0, vLocal.z * 4.0) * uNoiseScale + vec3(0.0, 0.0, clock * 7.0), 3);
    flame = 0.5 + (flame - 0.5) * uNoiseStrength;
    float f = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vView))), 1.5) * uFresnel;
    vec3 color = mix(tint, core, clamp(flame * 0.8 + f * 0.4, 0.0, 1.0)) * glow * uGlobalGlow * (1.0 + flame);
    float alpha = (1.0 - vUv.y * 0.5) * (0.55 + 0.45 * flame);
    gl_FragColor = vec4(color, alpha * uGlobalOpacity);
  }
`;

const FROST_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float glow;
  uniform vec3  tint;
  uniform vec3  core;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    // Facet glints sweeping down the needle, under a crisp fresnel.
    float glint = pow(max(0.0, sin(vUv.y * 26.0 + vLocal.z * 8.0 + clock * 2.0)), 12.0);
    float f = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vView))), 2.5) * uFresnel;
    vec3 color = mix(tint * 0.6, core, f + glint) * glow * uGlobalGlow * (1.0 + glint * 1.5);
    gl_FragColor = vec4(color, (0.55 + 0.4 * f) * uGlobalOpacity);
  }
`;

export function createTravelDelivery(parent, resources, fire) {
  const own = (x) => (resources.push(x), x);
  const group = new Group();
  parent.add(group);
  const mat = own(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      toneMapped: false,
      uniforms: pulseUniforms({
        clock: { value: 0 },
        glow: { value: 1.6 },
        tint: { value: new Color(fire ? '#ff8d43' : '#9ceaff') },
        core: { value: new Color(fire ? '#ffd06b' : '#cdf6ff') },
      }),
      vertexShader: DELIVERY_VERTEX,
      fragmentShader: fire ? FIRE_FRAGMENT : FROST_FRAGMENT,
    }),
  );
  const mesh = new Mesh(own(deliveryGeometry(fire)), mat);
  mesh.layers.set(LAYER.VFX);
  group.add(mesh);

  // The trail: a fixed buffer, written in place and drawn up to `count`.
  const geo = own(new BufferGeometry());
  const attr = new Float32BufferAttribute(new Float32Array(TRAIL_SAMPLES * 3), 3);
  attr.setUsage(DynamicDrawUsage);
  geo.setAttribute('position', attr);
  geo.setDrawRange(0, 0);
  const line = new Line(
    geo,
    own(
      new LineBasicMaterial({
        color: fire ? 0xff8b35 : 0xaeeeff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    ),
  );
  line.layers.set(LAYER.VFX);
  line.frustumCulled = false;
  parent.add(line);
  return { group, mesh, line, count: 0, fire };
}

export function resetTravelDelivery(d) {
  d.count = 0;
  d.line.geometry.setDrawRange(0, 0);
  d.group.visible = true;
  d.line.visible = true;
}

/**
 * Place the delivery on its lob and record the trail.
 *
 * The lob is `4 × arc × progress × (1 − progress)` above the real cast
 * front, so it leaves the hand and lands exactly on the circle; a delta of
 * zero renders the current pose without recording a trail sample.
 */
export function updateTravelDelivery(d, position, direction, dt, clock, tint, scale, progress, arc, reducedMotion, core = null, glow = 1.6, opacity = 1) {
  d.group.position.copy(position);
  d.group.position.y += 4 * arc * progress * (1 - progress);
  // Fire rocks slightly as it flies; frost spins once round its axis.
  d.mesh.rotation.z = reducedMotion ? 0 : d.fire ? progress * 0.5 : progress * Math.PI * 2;
  d.group.rotation.y = Math.atan2(direction.x, direction.z);
  d.group.scale.setScalar(scale);
  const u = d.mesh.material.uniforms;
  u.clock.value = clock;
  u.glow.value = glow;
  u.tint.value.set(tint);
  if (core) u.core.value.set(core);
  d.line.material.color.set(tint);
  // The stock line material has no shared uniform, so global opacity is written here.
  d.line.material.opacity = 0.8 * opacity;

  const attr = d.line.geometry.attributes.position;
  if (dt > 0) {
    if (d.count === TRAIL_SAMPLES) {
      attr.array.copyWithin(0, 3);
      d.count--;
    }
    attr.setXYZ(d.count++, position.x, d.group.position.y + 0.25, position.z);
  }
  attr.needsUpdate = true;
  d.line.geometry.setDrawRange(0, d.count);
}

export function endTravelDelivery(d) {
  d.group.visible = false;
  d.line.visible = false;
  d.count = 0;
  d.line.geometry.setDrawRange(0, 0);
}
