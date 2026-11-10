import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  AddEquation,
  CustomBlending,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  SrcAlphaFactor,
} from 'three';
import { LAYER } from '../../../core/Layers.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { PULSE_GLOBALS_GLSL, pulseUniforms } from './PulseUniforms.js';

/**
 * Layers 2a and 8 — the telegraph ring, the ring of tongues/teeth, and the
 * distortion proxy.
 *
 *  - **telegraph ring** — the landing circle. During travel it is a dim,
 *    ticked rim at full `zoneRadius` (you see where it will land); after
 *    impact it is the strike ring: steady for fire, expanding with q for
 *    frost — the exact hit radius.
 *  - **sculpture** — a ring of rising flame tongues (fire, 16, three heights,
 *    each with a curling inner blade) or low radial ice teeth (frost, 24).
 *    Flames are ridged noise scrolled upward; teeth are faceted glints.
 *  - **warp** — `LAYER.DISTORTION`, acid-fume contract. Fire stands a
 *    camera-facing column of heat shimmer `warpHeight` metres tall over the
 *    crown; frost lays a flat band of cold refraction, `warpHeight` metres
 *    wide, that rides the expanding ring.
 *
 * Every alpha takes `global.opacity` and the flame noise takes the global
 * noise frequency/strength through the shared `PulseUniforms` boxes.
 */

/* ==================================================================== */
/* Telegraph ring                                                         */
/* ==================================================================== */

/** A unit ring band with eight inward ticks; uv.x round, uv.y in → out. */
function ringGeometry(segments = 128) {
  const positions = [];
  const uv = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = t * Math.PI * 2;
    const tick = Math.pow(Math.abs(Math.cos(a * 4)), 60);
    const inner = 0.96 - tick * 0.08;
    positions.push(Math.cos(a) * inner, 0, Math.sin(a) * inner, Math.cos(a), 0, Math.sin(a));
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

const RING_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float opacity;
  uniform float glow;
  uniform float travel;     // 1 while the delivery is in flight
  uniform vec3  tint;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  void main() {
    float band = 1.0 - abs(vUv.y * 2.0 - 1.0);
    // While telegraphing, dashes crawl round the rim toward the landing.
    float dash = mix(1.0, 0.45 + 0.55 * step(0.5, fract(vUv.x * 32.0 - clock * 0.8)), travel);
    float alpha = smoothstep(0.0, 0.6, band) * dash * opacity * uGlobalOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(tint * glow * uGlobalGlow * (0.8 + band * 0.6), alpha);
  }
`;

export function createTelegraphRing(root, resources, fire) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: pulseUniforms({
      clock: { value: 0 },
      opacity: { value: 0.9 },
      glow: { value: 1.5 },
      travel: { value: 1 },
      tint: { value: new Color(fire ? '#ffc95c' : '#c9f8ff') },
    }),
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT,
  });
  const geometry = ringGeometry();
  resources.push(geometry, material);
  const mesh = new Mesh(geometry, material);
  mesh.position.y = 0.05;
  mesh.layers.set(LAYER.VFX);
  root.add(mesh);
  return mesh;
}

/* ==================================================================== */
/* Sculpture                                                              */
/* ==================================================================== */

/** Rising flame tongues (with a curling inner blade) or low radial ice teeth. */
export function sculptureGeometry(fire) {
  const p = [];
  const uv = [];
  const tri = (a, b, c, ua, ub, uc) => {
    p.push(...a, ...b, ...c);
    uv.push(...ua, ...ub, ...uc);
  };
  const count = fire ? 16 : 24;
  for (let i = 0; i < count; i++) {
    const a = (i * Math.PI * 2) / count;
    const b = ((i + 0.72) * Math.PI * 2) / count;
    const mid = (a + b) / 2;
    const r = fire ? 0.72 : 0.88;
    const h = fire ? 1.1 + (i % 3) * 0.25 : 0.35 + (i % 4) * 0.12;
    const rim = fire ? 0.83 : 1;
    const A = [Math.sin(a) * r, 0.03, Math.cos(a) * r];
    const B = [Math.sin(b) * r, 0.03, Math.cos(b) * r];
    const T = [Math.sin(mid) * rim, h, Math.cos(mid) * rim];
    tri(A, B, T, [0, 0], [1, 0], [0.5, 1]);
    if (fire) {
      // The inner blade curls back toward the heart at half height.
      const C = [Math.sin(mid) * r * 0.86, h * 0.55, Math.cos(mid) * r * 0.86];
      tri(B, A, C, [1, 0], [0, 0], [0.5, 0.55]);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

const SCULPTURE_VERTEX = /* glsl */ `
  uniform float clock;
  varying vec2 vUv;
  varying vec3 vLocal;
  void main() {
    vUv = uv;
    vLocal = position;
    vec3 p = position;
    // Tips sway; the foot stays planted.
    p.y += sin(clock * 3.0 + uv.x * 5.0 + position.x * 2.0) * 0.025 * uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FIRE_SCULPTURE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float fade;
  uniform float glow;
  uniform float opacity;
  uniform vec3  tint;
  uniform vec3  core;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  varying vec3 vLocal;
  ${noiseGLSL}
  void main() {
    // Ridged flame filaments climbing each tongue. Global noise frequency
    // scales the filaments; noise strength how far they break the tongue up.
    float flame = ridged(vec3(vLocal.xz * 4.0, vUv.y * 2.5) * uNoiseScale - vec3(0.0, 0.0, clock * 2.8), 3);
    flame = 0.5 + (flame - 0.5) * uNoiseStrength;
    float body = smoothstep(0.35, 0.9, flame + (1.0 - vUv.y) * 0.4);
    vec3 color = mix(tint * 0.6, core, vUv.y * 0.6 + flame * 0.4) * (1.0 + body) * glow * uGlobalGlow;
    float alpha = fade * opacity * uGlobalOpacity * (1.0 - vUv.y * 0.65) * (0.4 + 0.6 * body);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const FROST_SCULPTURE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float fade;
  uniform float glow;
  uniform float opacity;
  uniform vec3  tint;
  uniform vec3  core;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  varying vec3 vLocal;
  void main() {
    float glint = pow(max(0.0, sin(vUv.y * 20.0 + vLocal.x * 12.0 - clock * 1.5)), 10.0);
    float edge = 1.0 - abs(vUv.x - 0.5) * 1.4;
    vec3 color = mix(tint * 0.5, core, vUv.y + glint) * glow * uGlobalGlow * (1.0 + glint);
    gl_FragColor = vec4(color, fade * opacity * uGlobalOpacity * (1.0 - vUv.y * 0.65) * (0.6 + 0.4 * edge));
  }
`;

export function createSculpture(root, resources, fire) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: pulseUniforms({
      clock: { value: 0 },
      fade: { value: 1 },
      glow: { value: 1 },
      opacity: { value: 0.65 },
      tint: { value: new Color(fire ? '#ff8d43' : '#9ceaff') },
      core: { value: new Color(fire ? '#ffd06b' : '#cdf6ff') },
    }),
    vertexShader: SCULPTURE_VERTEX,
    fragmentShader: fire ? FIRE_SCULPTURE_FRAGMENT : FROST_SCULPTURE_FRAGMENT,
  });
  const geometry = sculptureGeometry(fire);
  resources.push(geometry, material);
  const mesh = new Mesh(geometry, material);
  mesh.layers.set(LAYER.VFX);
  root.add(mesh);
  return mesh;
}

/* ==================================================================== */
/* Distortion proxy                                                       */
/* ==================================================================== */

/** A unit quad: a standing billboard (fire) or a flat XZ disc square (frost). */
function warpGeometry(fire) {
  const g = new BufferGeometry();
  const pos = fire
    ? [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]
    : [-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1];
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

const COLUMN_VERTEX = /* glsl */ `
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

const FLOOR_VERTEX = /* glsl */ `
  uniform float uWidth;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position.x * uWidth, 0.0, position.z * uWidth, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uProgress;  // frost: the ring's radius, 0..1
  uniform float uColumn;    // 1 fire column, 0 frost floor band
  uniform float uWidth;     // frost: half-span of the quad, metres
  uniform float uHeight;    // fire: column height; frost: band width, metres
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  void main() {
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale * 0.6 - uTime * uSpeed);
    float nx = snoise(np);
    float ny = snoise(np + vec3(13.3, 7.9, 21.1));
    vec2 c = vUv * 2.0 - 1.0;
    float column = (1.0 - smoothstep(0.3, 1.0, abs(c.x))) * smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y));
    // Frost's band is uHeight metres wide: c spans uWidth metres per unit,
    // so its e-fold half-width is uHeight / (2 uWidth) in c.
    float halfWidth = max(uHeight, 0.02) / max(2.0 * uWidth, 1e-3);
    float band = exp(-abs(length(c) - uProgress) / halfWidth) * (1.0 - smoothstep(0.95, 1.0, length(c)));
    float mask = mix(band, column, uColumn);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(vec2(nx, ny) * 0.5 + 0.5, strength, mask);
  }
`;

export function createPulseWarp(root, resources, fire) {
  const material = new ShaderMaterial({
    // Not `transparent` (that marks VFX-layer meshes in this pack); custom
    // SrcAlpha / OneMinusSrcAlpha is the normal blend the offset buffer needs.
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: SrcAlphaFactor,
    blendDst: OneMinusSrcAlphaFactor,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 4 },
      uHeight: { value: 3 },
      uStrength: { value: 0 },
      uScale: { value: 2.2 },
      uSpeed: { value: 1.6 },
      uProgress: { value: 0 },
      uColumn: { value: fire ? 1 : 0 },
    }),
    vertexShader: fire ? COLUMN_VERTEX : FLOOR_VERTEX,
    fragmentShader: WARP_FRAGMENT,
  });
  const geometry = warpGeometry(fire);
  resources.push(geometry, material);
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.position.y = fire ? 0 : 0.05;
  mesh.layers.set(LAYER.DISTORTION);
  mesh.visible = false;
  root.add(mesh);
  return mesh;
}
