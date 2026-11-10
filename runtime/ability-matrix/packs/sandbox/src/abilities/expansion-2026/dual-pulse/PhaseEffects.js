import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  Points,
  ShaderMaterial,
} from 'three';
import { LAYER } from '../../../core/Layers.js';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { PULSE_GLOBALS_GLSL, pulseUniforms } from './PulseUniforms.js';

/**
 * Layer 2b · phase detail — the ring of spears and the rising motes.
 *
 * Fire stands twelve faceted ember spears just inside the strike ring, of
 * three heights, that swell on each strike beat. Frost lays eighteen
 * six-winged ice needles out flat and low, splayed outward. Both share 64
 * motes laid on a golden-angle spiral inside the unit disc (so they cover
 * it evenly), each with its own phase seed, rising and fading in the shader
 * — no CPU per mote.
 *
 * Everything is built in *unit field space* (radius 1) and scaled by the
 * live `zoneRadius`.
 */

/** Motes per cast. */
export const MOTES = 64;

/** A faceted ember spear, or a six-winged ice needle, round the unit circle. */
export function phaseGeometry(fire) {
  const verts = [];
  const uv = [];
  const count = fire ? 12 : 18;
  const triangle = (a, b, c) => {
    verts.push(...a, ...b, ...c);
    uv.push(0, 0, 1, 0, 0.5, 1);
  };
  for (let i = 0; i < count; i++) {
    const angle = (i * Math.PI * 2) / count;
    const x = Math.sin(angle);
    const z = Math.cos(angle);
    const tangent = [Math.cos(angle), -Math.sin(angle)];
    const r = fire ? 0.53 : 0.62;
    const w = fire ? 0.055 : 0.035;
    const p = [x * r, 0.1, z * r];
    const left = [p[0] + tangent[0] * w, 0.1, p[2] + tangent[1] * w];
    const right = [p[0] - tangent[0] * w, 0.1, p[2] - tangent[1] * w];
    const tip = [x * (fire ? 0.68 : 0.94), fire ? 0.7 + (i % 3) * 0.11 : 0.24 + (i % 4) * 0.07, z * (fire ? 0.68 : 0.94)];
    triangle(left, right, tip);
    triangle(right, [x * r, 0.1, z * r], tip);
    if (!fire) {
      // The needle's wing: a third blade off its root, so it reads as ice.
      const wing = [x * 0.72 + tangent[0] * 0.12, 0.2, z * 0.72 + tangent[1] * 0.12];
      triangle(p, wing, tip);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

const SURFACE_VERTEX = /* glsl */ `
  uniform float clock;
  uniform float beat;
  varying vec2 vUv;
  varying vec3 vLocal;
  void main() {
    vUv = uv;
    vLocal = position;
    vec3 p = position;
    // Spears swell on a beat; the tips sway on the field clock.
    p.y *= 0.7 + beat * 0.3;
    p.y += sin(clock * 2.8 + position.x * 4.0) * 0.03 * uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FIRE_SURFACE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float fade;
  uniform float beat;
  uniform float glow;
  uniform vec3  tint;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  varying vec3 vLocal;
  ${noiseGLSL}
  void main() {
    // Flame tongues: fbm scrolled up each spear, thinning toward the tip.
    float flame = fbm3(vec3(vLocal.xz * 5.0, vUv.y * 3.0) * uNoiseScale - vec3(0.0, 0.0, clock * 3.5)) * 0.5 * uNoiseStrength + 0.5;
    float lick = pow(max(0.0, sin(vUv.y * 17.0 - clock * 5.0 + vUv.x * 3.0)), 4.0);
    float edge = (1.0 - vUv.y) * (0.35 + flame * 0.45 + lick * 0.4);
    gl_FragColor = vec4(tint * (1.0 + beat + lick + flame) * glow * uGlobalGlow, fade * edge * 0.7 * uGlobalOpacity);
  }
`;

const FROST_SURFACE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float fade;
  uniform float beat;
  uniform float glow;
  uniform vec3  tint;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vUv;
  varying vec3 vLocal;
  ${noiseGLSL}
  void main() {
    // Facets: voronoi plates across each needle, with a glint sweeping them.
    vec2 cell = voronoi2((vLocal.xz * 14.0 + vUv.y * 3.0) * uNoiseScale);
    float plate = smoothstep(0.2, 0.6, cell.x) * (0.5 + 0.5 * cell.y) * uNoiseStrength;
    float facet = pow(max(0.0, sin(vUv.y * 28.0 + vUv.x * 8.0 + clock)), 18.0);
    float edge = 1.0 - abs(vUv.x - 0.5);
    gl_FragColor = vec4(tint * (0.8 + facet + beat + plate * 0.5) * glow * uGlobalGlow, fade * edge * (0.45 + 0.25 * plate) * uGlobalOpacity);
  }
`;

const MOTE_VERTEX = /* glsl */ `
  attribute float seed;
  uniform float clock;
  uniform float beat;
  varying float alpha;
  varying float vSeed;
  void main() {
    // Each mote rises on its own phase and is reborn at the floor.
    float t = fract(seed + clock * 0.26);
    vec3 p = position;
    p.y = 0.1 + t * (0.7 + beat * 0.5);
    alpha = sin(t * 3.14159265);
    vSeed = seed;
    vec4 v = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * v;
    gl_PointSize = clamp(24.0 / max(1.0, -v.z), 1.5, 5.0);
  }
`;

const MOTE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float fade;
  uniform float glow;
  uniform vec3  tint;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying float alpha;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    // A per-mote flicker so the field twinkles rather than breathes in step.
    float flicker = 0.7 + 0.3 * sin(clock * 9.0 + vSeed * 40.0);
    gl_FragColor = vec4(tint * 1.5 * glow * uGlobalGlow, (1.0 - smoothstep(0.1, 0.5, d)) * alpha * fade * 0.7 * flicker * uGlobalOpacity);
  }
`;

export function createPhaseEffects(root, resources, fire) {
  const own = (x) => (resources.push(x), x);
  // One uniform block, shared by the spears and the motes, so a single write
  // per frame drives both.
  const uniforms = pulseUniforms({
    clock: { value: 0 },
    fade: { value: 1 },
    beat: { value: 0 },
    glow: { value: 1 },
    tint: { value: new Color(fire ? '#ff9b40' : '#a8efff') },
  });
  const surface = new Mesh(
    own(phaseGeometry(fire)),
    own(
      new ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
        toneMapped: false,
        vertexShader: SURFACE_VERTEX,
        fragmentShader: fire ? FIRE_SURFACE_FRAGMENT : FROST_SURFACE_FRAGMENT,
      }),
    ),
  );
  surface.layers.set(LAYER.VFX);
  root.add(surface);

  // Golden-angle spiral: even coverage of the unit disc for any count.
  const values = [];
  const seed = [];
  for (let i = 0; i < MOTES; i++) {
    const a = i * 2.399963;
    const r = Math.sqrt((i + 0.5) / MOTES) * 0.9;
    values.push(Math.sin(a) * r, 0, Math.cos(a) * r);
    seed.push((i * 0.618034) % 1);
  }
  const particles = own(new BufferGeometry());
  particles.setAttribute('position', new Float32BufferAttribute(values, 3));
  particles.setAttribute('seed', new Float32BufferAttribute(seed, 1));
  const points = new Points(
    particles,
    own(
      new ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        vertexShader: MOTE_VERTEX,
        fragmentShader: MOTE_FRAGMENT,
      }),
    ),
  );
  points.layers.set(LAYER.VFX);
  points.frustumCulled = false;
  root.add(points);
  return { surface, points, uniforms };
}
