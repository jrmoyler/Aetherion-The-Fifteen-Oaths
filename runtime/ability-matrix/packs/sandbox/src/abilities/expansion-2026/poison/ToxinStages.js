import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, ShaderMaterial, Vector3 } from 'three';
import { LAYER } from '../../../core/Layers.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { settings } from '../../../config/settings.js';
import { copyColor, getColor } from '../../../utils/color.js';

const TAU = Math.PI * 2;
const clamp = (x) => Math.max(0, Math.min(1, x));

/**
 * The three stage crowns — physically distinct, so each generation of the
 * toxin reads as a *different* growth rather than the same ring bigger:
 *
 *   0 — six broad seed petals lying almost flat
 *   1 — ten narrower split lobes, lifted at the tips
 *   2 — twelve raised spines, alternately tall and short
 *
 * Each petal is a fan of five triangles round a raised centre vertex, built
 * from six authored points (`inner → shoulder → tip → shoulder → inner`, plus
 * the ridge). Vertex counts are 36 / 60 / 72 and are pinned by tests.
 * `uv` is planar so the shader can work in polar coordinates.
 */
export function toxinStageGeometry(stage) {
  const positions = [], uv = [], indices = [];
  const count = [6, 10, 12][stage];
  if (count === undefined) throw new RangeError('Expected toxin stage 0, 1 or 2');
  for (let i = 0; i < count; i++) {
    const a = (i * TAU) / count;
    const half = ((stage === 0 ? 0.34 : stage === 1 ? 0.21 : 0.12) * Math.PI / count) * 6;
    const inner = stage === 0 ? 0.28 : 0.38;
    const outer = stage === 0 ? 0.85 : stage === 1 ? 1.05 : 1.22;
    const tipHeight = stage === 2 ? 0.48 + (i % 2) * 0.12 : stage === 1 ? 0.13 : 0.04;
    const base = positions.length / 3;
    const points = [
      [inner, a - half, 0],
      [outer * 0.77, a - half * 0.55, 0.04],
      [outer, a, tipHeight],
      [outer * 0.77, a + half * 0.55, 0.04],
      [inner, a + half, 0],
      [outer * 0.65, a, stage === 2 ? 0.12 : 0.06]
    ];
    for (const [radius, angle, y] of points) {
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      uv.push(0.5 + Math.cos(angle) * radius * 0.38, 0.5 + Math.sin(angle) * radius * 0.38);
    }
    for (let j = 0; j < 5; j++) indices.push(base + j, base + ((j + 1) % 5), base + 5);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const STAGE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uStage;
  varying vec2 vUv;
  varying float vHeight;
  void main() {
    vUv = uv;
    vec3 p = position;
    vHeight = position.y;
    // Petals ripple while they unfurl, then settle.
    p.y += sin(uv.x * 18.0 + uv.y * 11.0 - uTime * 3.0) * 0.035 * (1.0 - uProgress);
    // Spines (stage 2) jut upward as the crown opens.
    p.y *= 0.4 + 0.6 * smoothstep(0.0, 0.35, uProgress);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const STAGE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uProgress;
  uniform float uStage;
  uniform float uGlobalGlow;
  uniform vec3  uColor;
  uniform vec3  uCore;
  varying vec2 vUv;
  varying float vHeight;

  ${noiseGLSL}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float ridges = pow(max(0.0, cos(a * (6.0 + uStage * 4.0) + sin(r * 12.0 - uTime * 2.0))), 14.0);
    // A bright ring sweeping out across the crown as it opens.
    float rim = exp(-abs(r - (0.45 + uProgress * 0.35)) * 20.0);
    // The crown decays as it fades: noise eats it from the tips.
    float n = snoise01(vec3(p * 5.0, uStage * 3.1));
    if (n < uProgress * uProgress * 0.9 - (0.6 - r)) discard;
    vec3 color = mix(uColor, uCore, clamp(ridges * 0.5 + rim * 0.3 + uStage * 0.08 + vHeight, 0.0, 1.0)) * uGlobalGlow;
    gl_FragColor = vec4(color, clamp((0.05 + ridges * 0.4 + rim * 0.25) * uFade, 0.0, 1.0));
  }
`;

function stageMaterial(stage) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: 0 },
      uProgress: { value: 0 },
      uStage: { value: stage },
      uGlobalGlow: { value: 1 },
      uColor: { value: new Color('#9be641') },
      uCore: { value: new Color('#e4ff93') }
    },
    vertexShader: STAGE_VERTEX,
    fragmentShader: STAGE_FRAGMENT
  });
}

/**
 * Owned by one cast. Three independently timed crowns accompany accepted
 * hits, each with its own burst and decal mode so the three stages are three
 * different contact beats (an airy puff, a wet ripple, a hard shockwave).
 */
export class ToxinStages {
  /**
   * @param {Object3D} parent      the effect group the crowns live in
   * @param {object} ctx           ability context (bursts, decals)
   * @param {ExpansionAtmosphere} atmosphere spore bubbles, also used for bursts
   * @param {Function} ownGeometry registers a geometry for disposal
   * @param {Function} ownMaterial registers a material for disposal
   */
  constructor(parent, ctx, atmosphere, ownGeometry, ownMaterial) {
    this.ctx = ctx;
    this.atmosphere = atmosphere;
    this.point = new Vector3();
    this.primary = new Color();
    this.core = new Color();
    this.dark = new Color();
    this.deep = new Color();
    this.meshes = [];
    this.materials = [];
    // Burst/decal options, one record reused for every stage.
    // The shells ride the ramp's lower stops (body → deep), so a growing
    // generation never washes the colony out with a pale ball.
    this._burst = { radius: 0.08, endRadius: 1, life: 0.35, intensity: 1, opacity: 0.4, colorA: this.primary, colorB: this.dark, colorC: this.deep };
    this._decal = { radius: 1, life: 0.45, intensity: 1, width: 0.04, colorA: this.primary, colorB: this.dark };
    this._spores = { radius: 0.4, speed: 0.45, size: 0.09, life: 1.3 };
    for (let i = 0; i < 3; i++) {
      const mat = ownMaterial(stageMaterial(i));
      const mesh = new Mesh(ownGeometry(toxinStageGeometry(i)), mat);
      mesh.position.y = 0.055 + i * 0.012;
      mesh.visible = false;
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      parent.add(mesh);
      this.meshes.push(mesh);
      this.materials.push(mat);
    }
  }

  reset() {
    for (const mesh of this.meshes) mesh.visible = false;
  }

  /** A stage cue is called only after its combat hit was accepted. */
  fire(stage, position, c) {
    const index = stage - 1;
    if (index < 0 || index > 2) return;
    this.point.fromArray(position);
    this.primary.copy(getColor(c.toxinColor));
    this.core.copy(getColor(c.coreColor));
    this.dark.copy(this.primary).multiplyScalar(0.25);
    this.deep.copy(getColor(c.deepColor ?? '#0b1806'));
    const scale = Math.max(0.25, Math.min(3, c.stageCueScale ?? 1));
    // Bounded by the bridge's 5 m radius limit whatever the slider says.
    const radius = Math.min(5, (0.8 + stage * 0.35) * scale);
    const glow = Math.max(0, Math.min(2, c.stageCueGlow ?? 0.8));
    const modes = [BurstMode.AIR, BurstMode.WATER, BurstMode.EARTH];
    const marks = [DecalType.DUSTRING, DecalType.RIPPLE, DecalType.SHOCKWAVE];
    const burst = this._burst;
    burst.endRadius = radius;
    burst.life = 0.35 + stage * 0.12;
    burst.intensity = glow * (0.35 + stage * 0.16);
    this.ctx.bursts?.spawn(modes[index], this.point, burst);
    const decal = this._decal;
    decal.radius = radius;
    decal.life = 0.45 + stage * 0.16;
    decal.intensity = glow;
    decal.width = 0.04 + stage * 0.015;
    this.ctx.decals?.spawn(marks[index], this.point, decal);
    const spores = this._spores;
    spores.radius = 0.4 + stage * 0.15;
    spores.speed = 0.45 + stage * 0.15;
    spores.size = 0.09 + stage * 0.02;
    this.atmosphere.burst(position, 8 + stage * 6, spores);
  }

  /**
   * @param {number[]} times   accepted time of each stage, −1 if not yet
   * @param {number} elapsed   staged impact time now
   * @param {number} time      visual clock (held under reduced motion)
   */
  update(times, elapsed, time, fade, c, reducedMotion) {
    const duration = Math.max(0.1, c.stageCueDuration ?? 0.8);
    const scale = Math.max(0.25, Math.min(3, c.stageCueScale ?? 1));
    const glow = Math.max(0, Math.min(2, c.stageCueGlow ?? 0.8));
    for (let i = 0; i < 3; i++) {
      const age = times[i] < 0 ? -1 : elapsed - times[i];
      const progress = age < 0 ? 0 : clamp(age / duration);
      const mesh = this.meshes[i];
      const mat = this.materials[i];
      mesh.visible = !reducedMotion && age >= 0 && progress < 1;
      mesh.rotation.y = time * (i % 2 ? -0.55 : 0.55);
      mesh.scale.setScalar(scale * (0.35 + progress * (0.8 + i * 0.18)));
      const u = mat.uniforms;
      u.uTime.value = time;
      u.uProgress.value = progress;
      u.uFade.value = fade * (1 - progress) * glow;
      u.uGlobalGlow.value = settings.global.glow;
      copyColor(u.uColor.value, c.toxinColor);
      copyColor(u.uCore.value, c.coreColor);
    }
  }
}
