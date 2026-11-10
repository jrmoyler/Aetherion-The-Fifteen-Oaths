import { AdditiveBlending, Color, DoubleSide, Mesh, ShaderMaterial, Vector3 } from 'three';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { frame, sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { copyColor, getColor } from '../../../utils/color.js';
import { LAYER } from '../../../core/Layers.js';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { fractureGeometry } from './HollowMeridianGeometry.js';

export { fractureGeometry };

const clamp = (x) => Math.max(0, Math.min(1, x));

/** One emit record and its scratch vectors, reused by every call. */
const _emit = {};
const _point = new Vector3();
const _dir = new Vector3();
const _up = new Vector3(0, 1, 0);

/* -------------------------------------------------------------------- */
/* Ground fractures                                                     */
/* -------------------------------------------------------------------- */

const FRACTURE_VERTEX = /* glsl */ `
  varying vec2 q;
  varying vec3 vWorld;
  void main() {
    q = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/*
 * The crack is drawn as a hot core line inside a cooler flank; the `progress`
 * front runs outward along `q.x` (distance from the breach) with a bright head
 * where the floor is splitting *now*, and noise flickers the glow like light
 * leaking up through the floor from the void underneath.
 */
const FRACTURE_FRAGMENT = /* glsl */ `
  uniform vec3  color;
  uniform vec3  uCore;
  uniform float progress;
  uniform float opacity;
  uniform float uTime;
  uniform float uFlicker;
  uniform float uGlow;
  uniform float uGlobalGlow;
  varying vec2 q;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float reached = 1.0 - smoothstep(progress - 0.08, progress + 0.01, q.x);
    if (reached <= 0.0) discard;
    float across = 1.0 - abs(q.y * 2.0 - 1.0);
    float core = pow(across, 3.0);
    float head = exp(-abs(q.x - progress) * 22.0) * step(progress, 0.999);
    float leak = 0.7 + 0.3 * snoise(vec3(vWorld.xz * 3.0, uTime * 2.2)) * uFlicker;
    vec3 col = mix(color, uCore, clamp(core * 0.6 + head, 0.0, 1.0)) * uGlow * uGlobalGlow * leak;
    float a = (0.25 + 0.75 * across) * reached * opacity * (1.0 - q.x * 0.35);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

function fractureMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      color: { value: new Color('#b8a8ff') },
      uCore: { value: new Color('#ece6ff') },
      progress: { value: 0 },
      opacity: { value: 0 },
      uFlicker: { value: 1 },
      uGlow: { value: 1.6 }
    }),
    vertexShader: FRACTURE_VERTEX,
    fragmentShader: FRACTURE_FRAGMENT
  });
}

/**
 * Three pooled ground-crack surfaces, one per breach. They share one authored
 * geometry and follow the same accepted cut times as the damage: a breach the
 * combat bridge refused never cracks the floor.
 */
export class MeridianFractures {
  constructor(rig) {
    this.geometry = fractureGeometry();
    this.disposed = false;
    this.surfaces = [];
    for (let i = 0; i < 3; i++) {
      const material = fractureMaterial();
      const mesh = new Mesh(this.geometry, material);
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      mesh.visible = false;
      // Each crack set is turned so the three breaches never share a pattern.
      mesh.rotation.y = i * 2.1;
      rig.add(mesh);
      this.surfaces.push({ mesh, material });
    }
  }

  reset() {
    for (const { mesh } of this.surfaces) mesh.visible = false;
  }

  /**
   * @param {number} index breach 0..2
   * @param {number} age   seconds since that breach was accepted, < 0 if not yet
   * @param {number} fade  cast-wide fade (1 → 0 during release)
   */
  update(index, age, fade, c, length, reduced) {
    const { mesh, material } = this.surfaces[index];
    const hold = c.seamHold ?? 1.4;
    const cutFade = age < 0 ? 0 : 1 - clamp((age - hold) / Math.max(0.1, c.seamClose ?? 0.6));
    mesh.visible = age >= 0 && cutFade > 0 && fade > 0;
    if (!mesh.visible) return;
    const g = settings.global;
    mesh.position.set(0, 0.045 + index * 0.004, (length * (index + 1)) / 4);
    mesh.scale.setScalar(c.zoneRadius * (c.fractureReach ?? 1));
    const u = material.uniforms;
    copyColor(u.color.value, c.edgeColor);
    copyColor(u.uCore.value, c.starColor ?? '#ece6ff');
    // Reduced motion shows the complete crack at once rather than a racing front.
    u.progress.value = reduced ? 1 : clamp(age / Math.max(0.05, c.fractureSpeed ?? 0.24));
    u.opacity.value = fade * cutFade * (c.fractureIntensity ?? 0.65) * g.opacity;
    u.uFlicker.value = reduced ? 0 : (c.fractureFlicker ?? 1) * g.noiseStrength;
    u.uGlow.value = (c.fractureGlow ?? 1.6) * g.glow;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const { mesh, material } of this.surfaces) {
      mesh.removeFromParent();
      material.dispose();
    }
    this.geometry.dispose();
  }
}

/* -------------------------------------------------------------------- */
/* Particles                                                            */
/* -------------------------------------------------------------------- */

// Settings colours go through the memoised getColor — Color.set(string)
// re-parses the hex every frame.
function gradient(system, c, prefix, colors) {
  colors[0].copy(getColor(c[`${prefix}A`]));
  colors[1].copy(getColor(c[`${prefix}B`]));
  colors[2].copy(getColor(c[`${prefix}C`]));
  colors[3].copy(getColor(c[`${prefix}D`]));
  system.setGradient(colors[0], colors[1], colors[2], colors[3]);
}

function globals(system) {
  const g = settings.global;
  const u = system.uniforms;
  u.uSizeScale.value = g.particleSize;
  u.uLifeScale.value = g.particleLifetime;
  u.uSpeedScale.value = g.particleSpeed;
}

/**
 * Three shared particle systems, each a distinct layer of the breach.
 *
 *  - **cut** (`expansion.hollow-meridian-cut`) — velocity-stretched streaks:
 *    the wake behind the travelling front, then two opposed jets sprayed out
 *    of each accepted breach along the line's normal, the "tear" itself.
 *  - **motes** (`expansion.hollow-meridian-motes`) — soft additive specks on a
 *    swirl anchor with a *negative* expansion, so they spiral down into each
 *    open seam: the anticipation over the next breach, and the linger that
 *    keeps an open breach alive.
 *  - **grit** (`expansion.hollow-meridian-grit`) — lit, non-additive chips of
 *    floor thrown up as each breach opens and sucked back by gravity.
 *
 * The cut system only ever emits on travel or on an *accepted* breach — a
 * refused breach must not spray (the regression test reads its cursor).
 */
export class MeridianParticles {
  constructor(ctx) {
    this.point = new Vector3();
    this.side = new Vector3();
    this.back = new Vector3();
    this.emitter = new RateEmitter();
    // One mote emitter per source (the warning plus each of the three seams),
    // so their fractional remainders never bleed into each other.
    this.moteEmitters = [new RateEmitter(), new RateEmitter(), new RateEmitter(), new RateEmitter()];
    this._cutColors = [new Color(), new Color(), new Color(), new Color()];
    this._moteColors = [new Color(), new Color(), new Color(), new Color()];
    this._gritColors = [new Color(), new Color(), new Color(), new Color()];
    const particles = ctx.particles;
    this.system = particles?.get('expansion.hollow-meridian-cut', {
      capacity: 360, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.3
    }) ?? null;
    this.motes = particles?.get('expansion.hollow-meridian-motes', {
      capacity: 420, shape: ParticleShape.SOFT, additive: true, swirl: true, curl: true, softFade: 0.4
    }) ?? null;
    this.grit = particles?.get('expansion.hollow-meridian-grit', {
      capacity: 240, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.2
    }) ?? null;
  }

  reset() {
    this.emitter.reset();
    for (const emitter of this.moteEmitters) emitter.reset();
  }

  /** Write the live settings into all three shared systems. */
  sync(c) {
    const g = settings.global;
    if (this.system) {
      gradient(this.system, c, 'cutColor', this._cutColors);
      globals(this.system);
      const u = this.system.uniforms;
      u.uStretch.value = c.cutStretch;
      u.uGlow.value = c.cutGlow * g.glow;
      u.uOpacity.value = g.opacity;
      u.uDrag.value = 1.6;
      u.uGravity.value.set(0, 0, 0);
    }
    if (this.motes) {
      gradient(this.motes, c, 'moteColor', this._moteColors);
      globals(this.motes);
      const u = this.motes.uniforms;
      u.uSwirl.value = c.moteSwirl;
      // Negative expansion: the orbit closes over the particle's life.
      u.uSwirlExpand.value = -clamp(c.motePull);
      u.uGravity.value.set(0, 0.4, 0);
      u.uGlow.value = c.moteGlow * g.glow;
      u.uOpacity.value = g.opacity;
      u.uTurbulence.value = 0.4 * g.turbulence;
      u.uEndSize.value = 0.2;
    }
    if (this.grit) {
      gradient(this.grit, c, 'gritColor', this._gritColors);
      globals(this.grit);
      const u = this.grit.uniforms;
      u.uGravity.value.set(0, -c.gritGravity, 0);
      u.uDrag.value = 0.8;
      u.uOpacity.value = g.opacity;
      u.uEndSize.value = 0.6;
    }
  }

  /** Wake streaks thrown back off the travelling front. */
  travel(dt, position, direction, c, reduced) {
    if (reduced || !this.system || dt <= 0) return;
    const count = this.emitter.tick(dt, Math.min(60, Math.max(0, (c.particleRate ?? 22) * settings.global.particleCount)));
    if (!count) return;
    this.back.copy(direction).multiplyScalar(-1);
    _emit.position = position;
    _emit.direction = this.back;
    _emit.radius = 0.1;
    _emit.spread = 0.24;
    _emit.speed = 1.5;
    _emit.speedVariance = 0.35;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.particleSize ?? 0.1;
    _emit.sizeVariance = 0.4;
    _emit.life = 0.42;
    _emit.lifeVariance = 0.3;
    _emit.spin = 3;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.system.emit(Math.min(24, count), _emit);
  }

  /** One accepted breach: two opposed jets along the line normal, plus grit. */
  cut(position, direction, c, reduced) {
    if (reduced) return;
    this.point.fromArray(position);
    this.point.y = 0.22;
    const g = settings.global;
    if (this.system) {
      const count = Math.min(24, Math.max(0, Math.round((c.cutJet ?? 10) * g.particleCount)));
      _emit.position = this.point;
      _emit.radius = 0.12;
      _emit.spread = 0.3;
      _emit.speed = 2.1 * (c.cutSpeed ?? 1);
      _emit.speedVariance = 0.35;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = c.particleSize ?? 0.1;
      _emit.sizeVariance = 0.4;
      _emit.life = 0.65;
      _emit.lifeVariance = 0.3;
      _emit.spin = 4;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      for (let k = 0; k < 2; k++) {
        const sign = k ? -1 : 1;
        this.side.set(direction.z * sign, 0.15, -direction.x * sign).normalize();
        _emit.direction = this.side;
        this.system.emit(count, _emit);
      }
    }
    if (this.grit) {
      const count = Math.min(32, Math.max(0, Math.round((c.gritCount ?? 14) * g.particleCount)));
      _emit.position = this.point;
      _emit.direction = _up;
      _emit.radius = Math.min(1.5, c.zoneRadius * 0.4);
      _emit.spread = 0.7;
      _emit.speed = c.gritSpeed ?? 3;
      _emit.speedVariance = 0.5;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = c.gritSize ?? 0.07;
      _emit.sizeVariance = 0.6;
      _emit.life = c.gritLife ?? 0.9;
      _emit.lifeVariance = 0.4;
      _emit.spin = 8;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.grit.emit(count, _emit);
    }
  }

  /**
   * Motes spiralling into a point. `slot` 0 is the warning over the next
   * breach, 1..3 the open seams; `strength` 0..1 scales the rate.
   */
  linger(slot, dt, position, strength, c, reduced) {
    if (reduced || !this.motes || dt <= 0 || strength <= 0) return;
    const rate = Math.min(90, (c.moteRate ?? 30) * strength * settings.global.particleCount);
    const count = this.moteEmitters[slot].tick(dt, rate);
    if (!count) return;
    _point.copy(position);
    _point.y = 0.4 + (c.seamHeight ?? 1) * 0.6;
    _dir.set(0, 1, 0);
    _emit.position = _point;
    _emit.anchor = _point;
    _emit.direction = _dir;
    _emit.radius = Math.min(3, c.zoneRadius * 0.9);
    _emit.spread = 1;
    _emit.speed = 0.15;
    _emit.speedVariance = 0.5;
    _emit.inherit = null;
    _emit.size = c.moteSize ?? 0.06;
    _emit.sizeVariance = 0.5;
    _emit.life = c.moteLife ?? 1.1;
    _emit.lifeVariance = 0.3;
    _emit.spin = 1;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.motes.emit(Math.min(24, count), _emit);
  }
}
