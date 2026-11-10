import { BufferGeometry, DynamicDrawUsage, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { LineTrail } from './LineTrail.js';
import { createAfterimageSwingPieceGeometry, createAfterimageSwingHeroGeometry } from '../../assets/codex/AfterimageSwingGeometry.js';
import {
  createAfterimageSwingBodyMaterial,
  createAfterimageSwingLensMaterial,
  createAfterimageSwingGroundMaterial,
  createAfterimageSwingVoiceMaterial,
  createAfterimageSwingDetailMaterial,
  createAfterimageSwingTrailMaterial,
  createAfterimageSwingScarMaterial,
  createAfterimageBladeMaterial,
  createAfterimageGhostMaterial,
  createAfterimageCutMaterial,
  createAfterimageFloorMaterial
} from '../../materials/codex/AfterimageSwingMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'afterimage';

const TWIST = 'return';
const ARCH = 'pendulum';
const HIT = 'swing';
const CARRY = 'none';
const WHEN = 'return';
const ECHO = null;
const OFFSET = false;
const DISSOLVE_TRAVEL = false;
const COUNTER = false;
const ZONE = false;
const LIFT = 1;
const SLICE = true;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _end = new Vector3();
const _focus = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);

/** Felled bodies one cast can keep marked at once. */
const MAX_MARKS = 12;
/** Afterimages one swing can leave down the line (plus the decoy itself). */
const MAX_GHOSTS = 8;

const _bp = new Vector3();
const _pivot = new Vector3();
const _radial = new Vector3();
const _scale = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();
const _qa = new Quaternion();
const _axisX = new Vector3(1, 0, 0);
const _axisZ = new Vector3(0, 0, 1);
const TAU = Math.PI * 2;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/* ------------------------------------------------------------------ */
/* Cast-local geometry for the upgrade. It lives here, not in the      */
/* generated `AfterimageSwingGeometry.js`, which must stay byte-identical to   */
/* its rig recipe (tests/pure-rigs.test.mjs).                         */
/* ------------------------------------------------------------------ */
/**
 * The blade — hero of the upgraded cast. A crescent war-glaive lying in the
 * XZ plane, its convex side the cutting edge facing +X: the centre line is an
 * arc of radius 1 about the origin swept over ±`span` radians, the blade's
 * width tapers to needle points at both tips (sin^0.7), and the cross-section
 * is a five-sided lens — thick, flat spine on the inside, a raised ridge, a
 * knife edge outside — lofted with flat normals so the facets glint. A short
 * wrapped grip sits on the spine at the middle.
 *
 * Attributes: `aEdge` (0 spine .. 1 cutting edge), `aAlong` (0..1 tip to
 * tip). The blade is shifted so its origin sits at its centre of mass, so a
 * yaw spins it like a thrown glaive.
 */
export function createAfterimageBladeGeometry({ span = 1.25, width = 0.34, thick = 0.07, segs = 48 } = {}) {
  const pos = [];
  const edge = [];
  const along = [];
  // Cross-section, as (radial offset from the inner rim in units of width, height in units of thick, edge weight).
  const ring = [
    [0, 0.5, 0],
    [0.38, 1, 0.35],
    [1, 0, 1],
    [0.38, -1, 0.35],
    [0, -0.5, 0]
  ];
  const slice = (t) => {
    const a = -span + 2 * span * t;
    const w = width * Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.7) + 0.004;
    const h = thick * (0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.5));
    const ri = 1 - w * 0.5;
    return ring.map(([r, y, e]) => [Math.cos(a) * (ri + r * w), y * h, Math.sin(a) * (ri + r * w), e]);
  };
  const push = (p, t) => {
    pos.push(p[0], p[1], p[2]);
    edge.push(p[3]);
    along.push(t);
  };
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const A = slice(t0);
    const B = slice(t1);
    for (let k = 0; k < ring.length; k++) {
      const k1 = (k + 1) % ring.length;
      push(A[k], t0); push(B[k], t1); push(B[k1], t1);
      push(A[k], t0); push(B[k1], t1); push(A[k1], t0);
    }
  }
  // The grip: a short wrapped box on the spine at the middle, pointing inward.
  const gx0 = 1 - width * 0.5 - 0.22;
  const gx1 = 1 - width * 0.5 + 0.02;
  const gy = thick * 0.9;
  const gz = 0.06;
  const box = [
    [[gx0, -gy, -gz], [gx1, -gy, -gz], [gx1, gy, -gz], [gx0, gy, -gz]],
    [[gx0, -gy, gz], [gx0, gy, gz], [gx1, gy, gz], [gx1, -gy, gz]],
    [[gx0, gy, -gz], [gx1, gy, -gz], [gx1, gy, gz], [gx0, gy, gz]],
    [[gx0, -gy, -gz], [gx0, -gy, gz], [gx1, -gy, gz], [gx1, -gy, -gz]],
    [[gx0, -gy, -gz], [gx0, gy, -gz], [gx0, gy, gz], [gx0, -gy, gz]]
  ];
  for (const q of box) {
    for (const idx of [0, 1, 2, 0, 2, 3]) push([...q[idx], -0.4], 0.5);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aEdge', new Float32BufferAttribute(edge, 1));
  g.setAttribute('aAlong', new Float32BufferAttribute(along, 1));
  // Spin about the blade's own mass, not the circle it was drawn on.
  g.translate(-0.78, 0, 0);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * AFTERIMAGE SWING — illusion, line cast.
 *
 * Illusion — the swing is the decoy; the blade arrives on the way back.
 *
 * The outward swing is the decoy. The blade and the kill are the return.
 *
 * The read is `return`: hit timing `return`, blow `swing`.
 *
 * ## Layers
 *
 *   1. **body** — the return placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled illusion field under the strip the head has crossed: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a bore riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createAfterimageSwingPieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createAfterimageSwingHeroGeometry`), stood by its archetype (pendulum): hinged at the hand, swung across the cast.
 *      Hero and pieces are energy: emissive over a dark body with a fresnel shell (LAYER.VFX). The rig is framed to the body height (`heroMinSpan`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: the outward swing is the decoy. The blade and the kill are the return.
 *  10. **mark** — a felled body is glamoured: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The upgrade — the decoy and the blade
 *
 * The template layers above (body fan, voice, floor grid, rig, pieces, trail)
 * are off by default (their opacity/count sliders still work). The cast now
 * reads through its own layers:
 *
 *  11. **the decoy and its afterimages** (`createAfterimageBladeGeometry`,
 *      `createAfterimageGhostMaterial`, instanced, additive) — on the throw a
 *      crescent war-glaive *image* (scanlines, stutter, chromatic split)
 *      spins out down the line on a weaving arc. Every `1/(ghostCount+1)` of
 *      the line it leaves a frozen copy of itself where it was: a strobe of
 *      afterimages standing in the air between the caster and the group.
 *      The decoy kills nothing (the hit rule is unchanged: `return`).
 *  12. **the blade** (`createAfterimageBladeMaterial`, `LAYER.WORLD`, shadows)
 *      — on the beat the decoy winks out at the group and the *real* blade
 *      forms out of glass panes behind them: dark-plum faceted glass with a
 *      white-hot edge and an oil-on-glass sheen, `bladeSize` metres of crescent.
 *      It sweeps through the group on an arc (`gashRadius`, `gashSpan`) —
 *      that is the kill — then comes *back* up the line (`bladeStop`),
 *      shattering each afterimage it passes into glass. Through the fade it
 *      hangs there turning and bobbing, then breaks apart along its facets.
 *  13. **the cut** (`createAfterimageCutMaterial`) — the swept arc of light
 *      behind the blade as it crosses the group, brightest at its edge.
 *  14. **the floor** (`createAfterimageFloorMaterial`) — a mirror-dark pool
 *      under every afterimage, and the gash: a filled crescent cut into the
 *      floor along the blade's arc, a hot seam that cools and an iridescent
 *      lip; it holds through the linger and erodes on the exit.
 *
 * Every metre, rate and colour is read from `settings.afterimage` each frame.
 * A cast only captures a seed, an integrated spin and event times (when each
 * afterimage was left and when the blade broke it).
 */
export class AfterimageSwingAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._hits;
  }

  createShaders() {
    this.bodyGeometry = createSpellBodyGeometry(ID);
    this.voiceGeometry = new PlaneGeometry(1, 1, 64, 8);
    this.groundGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.bodyMaterial = createAfterimageSwingBodyMaterial();
    this.lensMaterial = createAfterimageSwingLensMaterial();
    this.groundMaterial = createAfterimageSwingGroundMaterial();
    this.voiceMaterial = createAfterimageSwingVoiceMaterial();
    this.detailMaterial = createAfterimageSwingDetailMaterial();
    this.heroMaterial = createAfterimageSwingDetailMaterial(true);
    this.detail = new DetailLayer(createAfterimageSwingPieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createAfterimageSwingHeroGeometry(), this.heroMaterial, ARCH, ZONE);
    this.group.add(this.rig.mesh);
    this.body = this._mesh(this.bodyGeometry, this.bodyMaterial, LAYER.VFX, 12);
    this.voice = this._mesh(this.voiceGeometry, this.voiceMaterial, LAYER.VFX, 13);
    this.lens = this._mesh(this.bodyGeometry, this.lensMaterial, LAYER.DISTORTION, 0);
    this.ground = this._mesh(this.groundGeometry, this.groundMaterial, LAYER.VFX, 1);
    this._state = {
      center: new Vector3(),
      origin: new Vector3(),
      dir: new Vector3(0, 0, 1),
      side: new Vector3(1, 0, 0),
      radius: 1,
      length: 1,
      height: 1,
      thickness: 0.3,
      count: 6,
      spin: 0,
      voiceSpin: 0,
      open: 1,
      beat: 0,
      grow: 1,
      along: 0,
      seed: 0,
      fade: 1,
      dissolve: 0,
      phrase: 0,
      foot: 1,
      footWidth: 1,
      groundCenter: new Vector3(),
      land: 0,
      pre: 0,
      heat: 0,
      erode: 0,
      pulse: 1
    };
    this._seed = 0;
    this._settled = false;
    this._spin = 0;
    this._hits = 0;
    this._echoed = false;
    this._struck = [];
    this._carried = [];
    this._parts = Array.from({ length: 12 }, () => ({ armed: true }));
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._flow = { vx: 0, vy: 0, vz: 0 };
    this._field = (x, y, z, out) => out.set(this._flow.vx, this._flow.vy, this._flow.vz);
    this._found = [];
    this._marks = Array.from({ length: MAX_MARKS }, () => ({ dummy: null, time: 0, emitter: new RateEmitter() }));
    this._markCount = 0;
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0 };
    this.trailMaterial = createAfterimageSwingTrailMaterial();
    this.scarMaterial = createAfterimageSwingScarMaterial();
    this.trail = new LineTrail(TWIST, this.trailMaterial, this.scarMaterial);
    this.trail.onWake = (point, lane, s) => this._wake(point, lane, s);
    this.group.add(this.trail.scarMesh, this.trail.trailMesh);

    // The upgrade's own layers: the real blade, the afterimages, the cut, the floor.
    this.bladeGeometry = createAfterimageBladeGeometry({ width: 0.46, thick: 0.09 });
    this.bladeMaterial = createAfterimageBladeMaterial();
    this.blade = new Mesh(this.bladeGeometry, this.bladeMaterial);
    this.blade.layers.set(LAYER.WORLD);
    this.blade.castShadow = true;
    this.blade.frustumCulled = false;
    this.blade.visible = false;
    this.group.add(this.blade);

    this.ghostGeometry = createAfterimageBladeGeometry({ width: 0.46, thick: 0.09 });
    this._ghostState = new Float32Array((MAX_GHOSTS + 1) * 4);
    this._ghostAttr = new InstancedBufferAttribute(this._ghostState, 4).setUsage(DynamicDrawUsage);
    this.ghostGeometry.setAttribute('aGhost', this._ghostAttr);
    this.ghostMaterial = createAfterimageGhostMaterial();
    this.ghosts = new InstancedMesh(this.ghostGeometry, this.ghostMaterial, MAX_GHOSTS + 1);
    this.ghosts.instanceMatrix.setUsage(DynamicDrawUsage);
    this.ghosts.layers.set(LAYER.VFX);
    this.ghosts.renderOrder = 15;
    this.ghosts.frustumCulled = false;
    this.ghosts.visible = false;
    this.ghosts.count = 0;
    this.group.add(this.ghosts);

    this.cutGeometry = new PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
    this.cutMaterial = createAfterimageCutMaterial();
    this.cut = this._mesh(this.cutGeometry, this.cutMaterial, LAYER.VFX, 16);

    this.floorGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.floorMaterial = createAfterimageFloorMaterial();
    this.floor = this._mesh(this.floorGeometry, this.floorMaterial, LAYER.VFX, 2);

    this._left = new Float32Array(MAX_GHOSTS).fill(-1);
    this._broke = new Float32Array(MAX_GHOSTS).fill(-1);
    this._bladeYaw = 0;
    this._bladeAlong = 1;
    this._cutAt = -1;
    this._cutLead = 0;
    this._shattered = false;
    this._fadeT = 0;
    this._decoyEmitter = new RateEmitter();
  }

  _mesh(geometry, material, layer, order) {
    const mesh = new Mesh(geometry, material);
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;
    this.dust = particles.get('afterimage.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('afterimage.streak', {
      capacity: 1200,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('afterimage.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('afterimage.mote', {
      capacity: 600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.2
    });
    this.dustEmitter = new RateEmitter();
    this.streakEmitter = new RateEmitter();
    this.chipEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
  }

  get impactDuration() {
    return Math.max(0.05, settings[ID].impactTime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].fadeTime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f + f * Math.sin(this.age * 7.00);
  }

  onSpawn() {
    this._seed = Math.random() * 10;
    this._spin = Math.random() * Math.PI * 2;
    this._hits = 0;
    this._echoed = false;
    this._settled = false;
    this._struck.length = 0;
    this._carried.length = 0;
    for (let i = 0; i < this._parts.length; i++) this._parts[i].armed = true;
    this.dustEmitter.reset();
    this.streakEmitter.reset();
    this.chipEmitter.reset();
    this.moteEmitter.reset();
    this.detail.reseed(this._seed);
    this.trail.reset();
    this.detail.hide();
    this.rig.hide();
    this.body.visible = false;
    this.voice.visible = false;
    this.lens.visible = false;
    this.ground.visible = false;
    this._releaseMarks();
    this._left.fill(-1);
    this._broke.fill(-1);
    this._bladeYaw = this._seed;
    this._bladeAlong = 1;
    this._cutAt = -1;
    this._shattered = false;
    this._fadeT = 0;
    this._decoyEmitter.reset();
    this.blade.visible = false;
    this.ghosts.visible = false;
    this.ghosts.count = 0;
    this.cut.visible = false;
    this.floor.visible = false;
    this._palette();
    this._hand();
    if (ZONE) this._telegraph();
  }

  /** The cast leaves the fist: a small flare, a spray of sparks along the aim, motes left hanging. */
  _hand() {
    const c = settings[ID];
    const g = settings.global;
    _pos.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    _pos.y = c.handHeight;
    if (c.handFlare > 0.01) {
      this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
        radius: 0.05,
        endRadius: c.handFlare,
        life: 0.22,
        intensity: 0.6,
        opacity: 0.4 * g.opacity,
        squash: 1,
        colorA: getColor(c.colorBurstA),
        colorB: getColor(c.colorBurstB),
        colorC: getColor(c.colorBurstC)
      });
    }
    const sparks = Math.round(c.handSparks * g.particleCount);
    if (sparks > 0) {
      this._fillEmit(_pos, 0.08, this.direction, c.streakSpeed * 1.2, 0.5, 0.06, c.streakLife * 0.8, 2);
      this.streaks.emit(sparks, _emit);
    }
    const motes = Math.round(c.handMotes * g.particleCount);
    if (motes > 0) {
      this._fillEmit(_pos, 0.15, _up, c.moteSpeed * 0.5, 0.9, 0.08, c.moteLife, 1);
      this.motes.emit(motes, _emit);
    }
  }

  _focusPoint(out) {
    if (ZONE) return this.pointAt(1, out);
    return this.pointAt(this.u, out);
  }

  _aim(out) {
    this._focusPoint(out);
    if (OFFSET) out.addScaledVector(this.side, settings[ID].thickness * 4);
    return out;
  }

  _pose(committed, fadeT) {
    const u = this.u;
    
    
    let grow;
    let open;
    let along;
    along = committed ? (1 - saturate(fadeT < 1 ? fadeT : 1)) : u; grow = 1; open = committed ? saturate(fadeT) : 0;
    let dissolve = 0;
    if (committed && fadeT >= 1) dissolve = saturate((fadeT - 1) * 1.15);
    else if (DISSOLVE_TRAVEL && !committed) dissolve = saturate(u * 0.55);
    const fade = committed && fadeT >= 1 ? 1 - (fadeT - 1) : 1;
    const phrase = committed ? (fadeT < 1 ? 1 : 2) : 0;
    this._groundPose(committed, fadeT);
    this._write(open, grow, along, dissolve, fade, phrase);
  }

  /**
   * The floor's own clock. Before the beat a zone shows its footprint faintly
   * and a line lays its strip behind the head; on the beat the field lands out
   * to the rim over `groundLand` seconds (a line's strip is already down),
   * hot; it cools through the fade and breaks up over its last stretch. The
   * residue decal outlives it.
   */
  _groundPose(committed, fadeT) {
    const c = settings[ID];
    const st = this._state;
    if (!committed) {
      st.land = 1;
      st.pre = 0;
      st.heat = 0.85;
      st.erode = 0;
      return;
    }
    st.land = 1;
    st.pre = 0;
    st.heat = fadeT < 1 ? 1 - 0.3 * fadeT : 0.7 * (1 - saturate((fadeT - 1) * 1.5));
    st.erode = fadeT < 1 ? 0 : saturate((fadeT - 1.4) / 0.6);
  }

  _write(open, grow, along, dissolve, fade, phrase) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._state;
    this._focusPoint(_focus);
    st.center.copy(_focus);
    st.origin.copy(this.origin);
    st.dir.copy(this.direction);
    st.side.copy(this.side);
    st.radius = ZONE ? Math.max(0.2, c.zoneRadius) : Math.max(0.2, c.sweep);
    st.length = Math.max(0.2, this.length);
    st.height = c.height * g.shaderIntensity;
    st.thickness = c.thickness;
    st.count = Math.max(1, c.count);
    st.spin = this._spin;
    st.voiceSpin = this._spin * (COUNTER ? -1.35 : 1);
    st.open = open * (0.35 + Math.max(0, c.lean));
    st.beat = open;
    st.grow = grow;
    st.along = along;
    st.seed = this._seed;
    st.fade = fade;
    st.dissolve = dissolve;
    st.phrase = phrase;
    st.foot = ZONE ? c.zoneRadius * 2 : Math.max(0.4, this.front);
    st.footWidth = ZONE ? c.zoneRadius * 2 : c.groundWidth;
    // A zone's field sits on the circle; a line's covers the strip already crossed.
    if (ZONE) st.groundCenter.copy(_focus);
    else st.groundCenter.copy(this.origin).addScaledVector(this.direction, st.foot * 0.5);
    st.pulse = 1 + c.bodyPulse * Math.sin(this.age * c.bodyPulseRate);
    this.bodyMaterial.userData.sync(st);
    this.lensMaterial.userData.sync(st);
    this.groundMaterial.userData.sync(st);
    this.voiceMaterial.userData.sync(st);
    this.detailMaterial.userData.sync(st);
    this.heroMaterial.userData.sync(st);
    this.trailMaterial.userData.sync(st, this.trail, this._travelTime());
    this.scarMaterial.userData.sync(st, this.trail, this._travelTime());
    this.trail.show(this.isActive);
    this.detail.update(TWIST, ZONE, st, c, this.age);
    this.rig.update(st, c, this.age);
    const show = fade > 0.02 && (grow > 0.02 || open > 0.02);
    this.body.visible = show && c.bodyOpacity > 0.01;
    this.voice.visible = show && c.voiceOpacity > 0.01;
    this.lens.visible = show && c.lensWarp > 0.01;
    this.ground.visible = c.groundOpacity > 0.01 && st.erode < 0.99 && (st.land > 0.001 || st.pre > 0.01);
    if (c.trailOpacity <= 0.01 && c.scarOpacity <= 0.01) this.trail.show(false);
    this.position.copy(_focus);
    this.position.y = c.height * 0.45;
  }

  _palette() {
    const c = settings[ID];
    const g = settings.global;
    const sync = (p, a, b, cc, d, size, glow, grav) => {
      p.setGradient(getColor(a), getColor(b), getColor(cc), getColor(d));
      p.uniforms.uSizeScale.value = size * g.particleSize * 7;
      p.uniforms.uLifeScale.value = g.particleLifetime;
      p.uniforms.uSpeedScale.value = g.particleSpeed;
      p.uniforms.uOpacity.value = g.opacity;
      p.uniforms.uGlow.value = glow;
      p.uniforms.uGravity.value.set(0, grav, 0);
    };
    sync(this.dust, c.colorDustA, c.colorDustB, c.colorDustC, c.colorDustD, c.dustSize, 1, 0.4);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    sync(this.streaks, c.colorStreakA, c.colorStreakB, c.colorStreakC, c.colorStreakD, c.streakSize, 2 * g.glow, 0);
    this.streaks.uniforms.uStretch.value = c.streakStretch;
    sync(this.motes, c.colorMoteA, c.colorMoteB, c.colorMoteC, c.colorMoteD, c.moteSize, 1.6 * g.glow, 0.5);
    this.motes.uniforms.uOpacity.value = 0.9 * g.opacity;
    sync(this.chips, c.colorChipA, c.colorChipB, c.colorChipC, c.colorChipD, c.chipSize, 1, -9);
  }

  _fillEmit(position, radius, direction, speed, spread, size, life, spin) {
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.speedVariance = 0.4;
    _emit.spread = spread;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = size;
    _emit.sizeVariance = 0.5;
    _emit.life = life;
    _emit.lifeVariance = 0.35;
    _emit.spin = spin;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
  }

  _shed(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    this._focusPoint(_end);
    const dustN = Math.round(this.dustEmitter.tick(dt, c.dustRate * strength) * g.particleCount);
    if (dustN > 0) {
      this._fillEmit(_end, ZONE ? c.zoneRadius * 0.35 : 0.3, _dir, c.dustSpeed, 0.45, 0.45, c.dustLife, 0.4);
      for (let i = 0; i < dustN; i++) {
        const ang = this._spin + i * 0.7;
        _dir.copy(this.side).multiplyScalar(1.2).setY(0.3);
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
    const streakN = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (streakN > 0) {
      this._fillEmit(_end, 0.2, _dir, c.streakSpeed, 0.22, 0.08, c.streakLife, 2);
      for (let i = 0; i < streakN; i++) {
        const ang = this._spin * 1.7 + i;
        _dir.copy(this.side).multiplyScalar(-0.8).setY(0.5);
        _emit.direction = _dir;
        this.streaks.emit(1, _emit);
      }
    }
    const chipN = Math.round(this.chipEmitter.tick(dt, c.chipRate * strength) * g.particleCount);
    if (chipN > 0) {
      this._fillEmit(_end, 0.16, _dir, c.chipSpeed, 0.4, 0.08, c.chipLife, 6);
      for (let i = 0; i < chipN; i++) {
        const ang = this._spin + i * 1.3;
        _dir.set(Math.cos(ang), 0.7, Math.sin(ang));
        _emit.direction = _dir;
        this.chips.emit(1, _emit);
      }
    }
    this._motes(dt, strength);
  }

  /** Motes drift off whichever detail pieces are standing. */
  _motes(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength * (this.detail.live / Math.max(1, c.detailCount))) * g.particleCount);
    if (n <= 0) return;
    const count = Math.round(c.detailCount);
    for (let k = 0; k < n; k++) {
      const pick = Math.floor(Math.random() * count);
      if (!this.detail.pointOf(pick, _pos)) continue;
      _dir.set((Math.random() - 0.5) * 0.6, 1, (Math.random() - 0.5) * 0.6);
      this._fillEmit(_pos, 0.12, _dir, c.moteSpeed, 0.5, 0.08, c.moteLife, 1);
      this.motes.emit(1, _emit);
    }
  }

  _already(dummy) {
    for (let i = 0; i < this._struck.length; i++) if (this._struck[i] === dummy) return true;
    return false;
  }

  _remember(dummy) {
    if (this._struck.length < 24) this._struck.push(dummy);
    if (CARRY !== 'none' && this._carried.length < 16) this._carried.push(dummy);
    this._hits++;
    this._mark(dummy);
  }

  /** Start a felled body wearing the element. */
  _mark(dummy) {
    if (this._markCount >= MAX_MARKS) return;
    const slot = this._marks[this._markCount++];
    slot.dummy = dummy;
    slot.time = 0;
    slot.emitter.reset();
  }

  /** Stain the marked bodies toward the element's look and keep them shedding. */
  _updateMarks(dt) {
    if (this._markCount === 0) return;
    const c = settings[ID];
    const g = settings.global;
    const look = this._look;
    look.color = c.colorMarkBody;
    look.rimColor = c.colorMarkRim;
    look.rimEmissive = c.markRimGlow;
    look.edgeColor = c.colorMarkEdge;
    look.edgeEmissive = c.markEdgeGlow;
    look.edgeWidth = c.markEdgeWidth;
    for (let i = 0; i < this._markCount; i++) {
      const slot = this._marks[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      slot.time += dt;
      dummy.corrode(saturate(slot.time / Math.max(0.02, c.markTime)) * c.markAmount, look);
      const left = 1 - saturate(slot.time / Math.max(0.05, c.markLife * g.lifetime));
      if (left <= 0) continue;
      const n = Math.round(slot.emitter.tick(dt, c.markMotes * left) * g.particleCount);
      if (n <= 0) continue;
      const at = dummy.bodyPoint?.(_body) ?? _body.copy(dummy.position).setY(0.9);
      this._fillEmit(at, 0.3, _up, c.moteSpeed, 0.7, 0.08, c.moteLife, 1);
      this.motes.emit(n, _emit);
    }
  }

  _releaseMarks() {
    for (let i = 0; i < this._markCount; i++) this._marks[i].dummy = null;
    this._markCount = 0;
  }


  _killDir() {
    const ang = lerp(-settings[ID].sweep, settings[ID].sweep, saturate(this._state.along));
    _dir.copy(this.direction).multiplyScalar(Math.cos(ang)).addScaledVector(this.side, Math.sin(ang));
  }

  _blow(dummy, mode) {
    const c = settings[ID];
    const g = settings.global;
    if (mode && mode !== HIT) this._killEcho(dummy, mode);
    else this._killDir(dummy);
    this._force.impulse = c.hitImpulse * g.explosionIntensity;
    this._force.lift = c.hitLift * g.explosionIntensity * LIFT;
    if (mode === 'up') this._force.lift *= 1.4;
    this._force.spin = c.hitSpin;
    if (dummy.kill(_dir.x, _dir.z, this._force, SLICE || mode === 'swing')) this._remember(dummy);
  }

  _killEcho(dummy, mode) {
    this._aim(_focus);
    if (mode === 'up') {
      _dir.copy(this.direction).multiplyScalar(0.2);
      return;
    }
    _dir.set(dummy.position.x - _focus.x, 0, dummy.position.z - _focus.z);
    if (_dir.lengthSq() < 1e-4) _dir.copy(this.direction);
    else _dir.normalize();
    if (mode === 'in') _dir.multiplyScalar(-1);
    if (mode === 'tangent') {
      const x = _dir.x;
      _dir.set(-_dir.z, 0, x);
    }
  }

  _gather(x, z, radius, mode) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(x, z, radius, this._found);
    for (let i = 0; i < found.length; i++) {
      const dummy = found[i];
      if (this._already(dummy)) continue;
      this._blow(dummy, mode);
    }
    this._found.length = 0;
  }


  _head(i, n) {
    return saturate(this.u * n - i);
  }

  _partPoint(i, n, out) {
    const c = settings[ID];
    const lane = ((i + 0.5) / n - 0.5) * 2 * c.sweep;
    const s = (i + 0.5) / n;
    return this.pointAt(s, out).addScaledVector(this.side, lane);
  }

  _strikeParts(forceAll) {
    const c = settings[ID];
    const n = Math.max(1, Math.min(12, Math.round(c.count)));
    for (let i = 0; i < n; i++) {
      if (!forceAll && this._head(i, n) < 0.98) continue;
      if (!this._parts[i].armed) continue;
      this._parts[i].armed = false;
      this._partPoint(i, n, _end);
      this._gather(_end.x, _end.z, Math.max(0.45, c.thickness * 4 + 0.5));
    }
  }

  _strike(forceAll) {
    const c = settings[ID];
    if (WHEN === 'part') {
      this._strikeParts(forceAll);
      return;
    }
    if (WHEN === 'late' && this.u < 0.42 && !forceAll) return;
    this._aim(_end);
    const reach = ZONE ? Math.max(c.zoneRadius, c.hitRadius) : Math.max(0.35, c.hitRadius);
    this._gather(_end.x, _end.z, reach);
  }

  _echo() {
    if (!ECHO) return;
    const c = settings[ID];
    this._aim(_end);
    const reach = (ZONE ? Math.max(c.zoneRadius, c.hitRadius) : c.hitRadius) * 1.15;
    this._gather(_end.x, _end.z, reach, ECHO);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * 0.45 * settings.global.explosionIntensity);
    this.ctx.shake.add(c.impactShake * 0.4 * settings.global.cameraShake, 6, 16);
  }

  _drag(dt, fade) {
    if (CARRY === 'none' || fade <= 0.02) return;
    const c = settings[ID];
    this._focusPoint(_focus);
    const grab = saturate(6 * dt) * fade;
    for (let i = this._carried.length - 1; i >= 0; i--) {
      const dummy = this._carried[i];
      if (!dummy || dummy.finished || dummy.alive) {
        dummy?.release?.();
        this._carried.splice(i, 1);
        continue;
      }
      const at = dummy.bodyPoint ? dummy.bodyPoint(_pos) : dummy.position;
      if (!at) continue;
      const dx = _focus.x - at.x;
      const dz = _focus.z - at.z;
      const d = Math.max(0.2, Math.hypot(dx, dz));
      const inward = CARRY === 'in' ? 1 : CARRY === 'out' ? -1 : 0.25;
      const spin = CARRY === 'orbit' ? 4.2 : 1.15;
      const lift = CARRY === 'up' ? 7 : 1.3;
      this._flow.vx = (dx / d) * inward * 6 * c.sweep + (-dz / d) * spin;
      this._flow.vz = (dz / d) * inward * 6 * c.sweep + (dx / d) * spin;
      this._flow.vy = lift * fade;
      dummy.carry(this._field, grab, grab, CARRY === 'up' ? 0.35 : 0);
    }
  }

  _telegraph() {
    const c = settings[ID];
    this.pointAt(1, _end);
    this.ctx.decals.spawn(DecalType.DUSTRING, _end, {
      radius: Math.max(0.4, c.zoneRadius) * 0.85,
      life: Math.max(0.4, c.shockLife),
      width: 0.05,
      intensity: 0.45,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.02
    });
  }

  /**
   * The beat lands as a hit, not a pop: shake, flash and a light punch, a
   * burst, real fragments thrown up and out with dust rolled along
   * the floor, and a filled residue decal sized to the strip that stays on the
   * floor after the cast is gone. The thin shock ring is only a trace now (`shockRing`).
   */
  _beat() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._aim(_end);
    this.ctx.shake.add(c.impactShake * power * g.cameraShake, 4, 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.impactLight * power;
    if (c.burstOpacity > 0.01) {
      this.ctx.bursts.spawn(BurstMode.AIR, _pos.copy(_end).setY(Math.max(0.4, c.height * 0.35)), {
        radius: 0.35,
        endRadius: c.burstRadius * power,
        life: c.burstLife,
        intensity: 0.85,
        opacity: c.burstOpacity * g.opacity,
        squash: 0.38,
        colorA: getColor(c.colorBurstA),
        colorB: getColor(c.colorBurstB),
        colorC: getColor(c.colorBurstC)
      });
    }
    this._debris(_end);
    this.ctx.decals.spawn(DecalType.SCORCH, _end, {
      radius: Math.max(0.5, c.groundWidth * c.groundStainReach) * power,
      life: c.groundLife * g.lifetime,
      width: 0.8,
      intensity: c.groundStain,
      colorA: getColor(c.colorGroundStain),
      colorB: getColor(c.colorGroundA),
      height: 0.025
    });
    if (c.shockRing > 0.01) {
      this.ctx.decals.spawn(DecalType.SHOCKWAVE, _end, {
        radius: c.shockRadius * 0.8,
        life: c.shockLife * 0.75,
        width: 0.08,
        intensity: 0.85 * c.shockRing,
        colorA: getColor(c.colorShockB),
        colorB: getColor(c.colorShockA),
        height: 0.03
      });
    }
  }

  /** Fragments thrown up and out of the strike, and dust rolled out along the floor. */
  _debris(at) {
    const c = settings[ID];
    const g = settings.global;
    const spread = ZONE ? c.zoneRadius * 0.4 : 0.5;
    _pos.copy(at).setY(0.15);
    const chips = Math.round(c.impactChips * g.particleCount * g.explosionIntensity);
    if (chips > 0) {
      this._fillEmit(_pos, spread, _up, c.chipSpeed * 1.5, 0.8, c.chipSize * 1.4, c.chipLife * 1.3, 8);
      this.chips.emit(chips, _emit);
    }
    const dust = Math.round(c.impactDust * g.particleCount);
    for (let i = 0; i < dust; i++) {
      const ang = (i / Math.max(1, dust)) * Math.PI * 2 + this._spin;
      _dir.set(Math.cos(ang), 0.12, Math.sin(ang));
      this._fillEmit(_pos, spread * 0.6, _dir, c.dustSpeed * 1.8, 0.25, 0.6, c.dustLife * 1.4, 0.4);
      this.dust.emit(1, _emit);
    }
  }

  /** The smaller second beat: a low dust roll settling over the field, a thud and a last flare of light. */
  _aftershock() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._aim(_end);
    this.ctx.shake.add(c.aftershockShake * power * g.cameraShake, 3, 12);
    this.lightBoost += c.aftershockLight * power;
    this.ctx.decals.spawn(DecalType.DUSTRING, _end, {
      radius: c.aftershockRadius * power,
      life: c.aftershockLife,
      width: 0.06,
      intensity: 0.55,
      colorA: getColor(c.colorGroundB),
      colorB: getColor(c.colorGroundA),
      height: 0.03
    });
  }

  /** Seconds the head takes over the whole line — the trail's clock. */
  _travelTime() {
    return Math.max(0.05, this.length / Math.max(1, settings[ID].speed * settings.global.speed));
  }

  /** Where the head crosses each `wakeSpacing` metre: a scorch decal and a few chips. */
  _wake(point, lane, s) {
    const c = settings[ID];
    const g = settings.global;
    _pos.copy(point).setY(0);
    this.ctx.decals.spawn(DecalType.SCORCH, _pos, {
      radius: c.wakeRadius * (0.8 + 0.4 * Math.random()),
      life: c.wakeLife * g.lifetime,
      width: 0.08,
      intensity: 0.75,
      colorA: getColor(c.colorScarB),
      colorB: getColor(c.colorScarA),
      height: 0.03
    });
    const chips = Math.round(c.wakeChips * g.particleCount);
    if (chips > 0) {
      this._fillEmit(_pos.setY(0.1), 0.25, _up, c.chipSpeed * 0.6, 0.8, c.chipSize, c.chipLife, 3);
      this.chips.emit(chips, _emit);
    }
  }

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._spin += dt * c.spinSpeed * g.animationSpeed;
    this._fadeT = 0;
    this._pose(false, 0);
    this._palette();
    this._shed(dt, 0.35 + 0.65 * this._state.grow);
    this.trail.tick(dt, this._state.along, this._state, c.wakeSpacing);
    if (WHEN === 'travel' || WHEN === 'part' || WHEN === 'late') this._strike(false);
    this._swing(dt);
    this._updateMarks(dt);
    this.ctx.shake.rumble(0.035 * c.impactShake * g.cameraShake, dt);
  }

  onImpact() {
    this._beat();
    if (WHEN === 'commit' || WHEN === 'part') this._strike(true);
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const fade = t < 1 ? 1 : 1 - (t - 1);
    this._spin += dt * c.spinSpeed * g.animationSpeed * 0.40;
    this._fadeT = t;
    if (this._cutAt < 0) this._cutAt = this.age;
    this._pose(true, t);
    this._palette();
    this._shed(dt, fade * 0.7);
    this.trail.tick(dt, 1, this._state, c.wakeSpacing);
    if (WHEN === 'return') this._strike(false);
    this._swing(dt);
    if (!this._settled && t > c.aftershockAt) {
      this._settled = true;
      this._aftershock();
    }
    if (ECHO && !this._echoed && t > 1.08) {
      this._echoed = true;
      this._echo();
    }
    this._drag(dt, fade);
    this._updateMarks(dt);
  }

  onDestroy() {
    this._releaseMarks();
    for (let i = 0; i < this._carried.length; i++) this._carried[i].release?.();
    this._carried.length = 0;
    this.body.visible = false;
    this.voice.visible = false;
    this.lens.visible = false;
    this.ground.visible = false;
    this.detail.hide();
    this.rig.hide();
    this.trail.hide();
    this.blade.visible = false;
    this.ghosts.visible = false;
    this.ghosts.count = 0;
    this.cut.visible = false;
    this.floor.visible = false;
  }

  /* ------------------------------------------------------------------ */
  /* The upgrade: the decoy, its afterimages, the blade, the cut, floor  */
  /* ------------------------------------------------------------------ */

  /** Where along the line (0..1) afterimage `k` of `n` is left: spread from `ghostStart` to the group. */
  _station(k, n) {
    const a = saturate(settings[ID].ghostStart);
    return a + (1 - a) * (k + 1) / (n + 1);
  }

  /** Lateral weave of the decoy's path at `s` along the line, metres. */
  _weave(s) {
    const c = settings[ID];
    return c.decoyWeave * c.sweep * Math.sin(s * Math.PI);
  }

  /** Place a blade-space pose into `_m`: position, yaw (local +X), bank, size. */
  _bladeMatrix(at, yaw, bank, size) {
    _q.setFromAxisAngle(_up, yaw);
    _qa.setFromAxisAngle(_axisX, bank);
    _q.multiply(_qa);
    _scale.setScalar(size);
    _m.compose(at, _q, _scale);
  }

  /** Yaw that points the blade's cutting edge (local +X) along `v` (flat). */
  _yawOf(v) {
    return Math.atan2(-v.z, v.x);
  }

  _swing(dt) {
    const c = settings[ID];
    const g = settings.global;
    const life = Math.max(0.05, g.lifetime);
    const size = Math.max(0.1, c.bladeSize);
    const committed = this._cutAt >= 0;
    const n = Math.max(0, Math.min(MAX_GHOSTS, Math.round(c.ghostCount)));
    const spin = c.bladeSpin * g.animationSpeed;
    const tau = committed ? this.age - this._cutAt : 0;
    const cutTime = Math.max(0.05, c.cutTime);
    const impactDur = this.impactDuration;
    const R = Math.max(0.3, c.gashRadius);
    const span = c.gashSpan;
    this.pointAt(1, _end);
    _pivot.copy(_end).addScaledVector(this.direction, -R);

    // --- the real blade ---
    let bladeAlong = 1;
    if (committed) {
      let dissolve;
      let heat;
      if (tau < cutTime) {
        // The cut: an arc round the pivot through the group.
        const k = tau / cutTime;
        const th = -span + 2 * span * (k * k * (3 - 2 * k));
        _radial.copy(this.direction).multiplyScalar(Math.cos(th)).addScaledVector(this.side, Math.sin(th));
        _bp.copy(_pivot).addScaledVector(_radial, R);
        _bp.y = c.bladeHeight * 0.7;
        this._bladeYaw = this._yawOf(_radial);
        this._bladeMatrix(_bp, this._bladeYaw, c.bladeBank * 0.35, size);
        dissolve = 1 - saturate(tau / Math.max(0.02, c.bladeForm));
        heat = 1;
        this._cutLead = th;
      } else {
        // The way back: up the line toward `bladeStop`, spinning down, then hanging there.
        const back = saturate((tau - cutTime) / Math.max(0.1, impactDur - cutTime));
        bladeAlong = 1 + (c.bladeStop - 1) * (back * back * (3 - 2 * back));
        const slow = Math.exp(-(tau - cutTime) / Math.max(0.1, c.bladeSpinDown * life));
        this._bladeYaw += dt * spin * (0.15 + 0.85 * slow);
        this.pointAt(bladeAlong, _bp);
        // It comes back like a boomerang: out wide on one side, settling off the line.
        _bp.addScaledVector(this.side, c.returnArc * Math.sin(Math.PI * Math.min(1, back * 0.75 + 0.0)) + c.returnSide * back);
        const bob = this._fadeT >= 1 ? Math.sin(this.age * c.bladeBobRate) * c.bladeBob : 0;
        _bp.y = c.bladeHeight * (0.7 + 0.3 * easeOutCubic(back)) + bob;
        const bank = c.bladeBank * (0.35 + 0.65 * back) * (1 + 0.25 * Math.sin(this.age * 2.1));
        this._bladeMatrix(_bp, this._bladeYaw, bank, size);
        dissolve = saturate((this._fadeT - c.bladeExitAt) / Math.max(0.05, 1.95 - c.bladeExitAt));
        heat = 0.25 + 0.75 * slow;
        this._cutLead = span;
        if (dissolve > 0 && !this._shattered) {
          this._shattered = true;
          this._glass(_bp, c.bladeShards, size);
        }
      }
      this.blade.matrixAutoUpdate = false;
      this.blade.matrix.copy(_m);
      this.blade.matrixWorldNeedsUpdate = true;
      this.blade.visible = dissolve < 0.99;
      this.blade.castShadow = c.bladeShadow >= 0.5;
      this.bladeMaterial.userData.sync(dissolve, heat);
      this._bladeAlong = bladeAlong;
    } else {
      this.blade.visible = false;
    }

    // --- the decoy and the afterimages ---
    let drawn = 0;
    const echo = this.floorMaterial.uniforms.uEcho.value;
    for (let k = 0; k < MAX_GHOSTS; k++) echo[k].z = 0;
    if (!committed) {
      this._bladeYaw += dt * spin;
      const u = this.u;
      this.pointAt(u, _bp).addScaledVector(this.side, this._weave(u));
      _bp.y = c.bladeHeight;
      this._bladeMatrix(_bp, this._bladeYaw, c.bladeBank, size);
      this.ghosts.setMatrixAt(drawn, _m);
      this._ghostState[0] = c.decoyOpacity;
      this._ghostState[1] = this._seed;
      this._ghostState[2] = 0.5;
      this._ghostState[3] = 0;
      drawn++;
      // Leave an afterimage at every station the decoy has crossed.
      for (let k = 0; k < n; k++) if (this._left[k] < 0 && u >= this._station(k, n)) this._left[k] = this.age;
      // The decoy streams streaks behind it.
      const sn = Math.round(this._decoyEmitter.tick(dt, c.decoyStreaks) * g.particleCount);
      if (sn > 0) {
        _dir.copy(this.direction).multiplyScalar(-1).setY(0.1);
        this._fillEmit(_bp, size * 0.6, _dir, c.streakSpeed * 0.6, 0.5, 0.08, c.streakLife, 2);
        this.streaks.emit(sn, _emit);
      }
    }
    const ghostLife = Math.max(0.05, c.ghostLife * life);
    for (let k = 0; k < n; k++) {
      const left = this._left[k];
      if (left < 0) continue;
      const s = this._station(k, n);
      // Broken by the blade as it passes; whatever it did not reach collapses one by one once it stops.
      const collapse = this._fadeT >= 1 && this.age - this._cutAt - this.impactDuration > c.ghostCollapse + (n - 1 - k) * c.ghostStagger;
      if (committed && this._broke[k] < 0 && (this._bladeAlong <= s + 0.02 || collapse)) {
        this._broke[k] = this.age;
        this.pointAt(s, _pos).addScaledVector(this.side, this._weave(s));
        _pos.y = c.bladeHeight;
        this._glass(_pos, c.ghostShards, size * 0.8);
      }
      const shatter = this._broke[k] >= 0 ? saturate((this.age - this._broke[k]) / Math.max(0.02, c.ghostBreak)) : 0;
      if (shatter >= 1) continue;
      const age = this.age - left;
      const alpha = (0.35 + 0.65 * Math.exp(-age / ghostLife)) * (1 - shatter * 0.6);
      this.pointAt(s, _bp).addScaledVector(this.side, this._weave(s));
      _bp.y = c.bladeHeight + shatter * 0.3;
      this._bladeMatrix(_bp, this._seed + left * spin, c.bladeBank, size * (1 + shatter * 0.25));
      this.ghosts.setMatrixAt(drawn, _m);
      const j = drawn * 4;
      this._ghostState[j] = alpha;
      this._ghostState[j + 1] = k * 1.7 + this._seed;
      this._ghostState[j + 2] = (k % 2) ? 0.2 : 0.8;
      this._ghostState[j + 3] = shatter;
      drawn++;
      // Its pool on the floor.
      echo[k].set(_bp.x, _bp.z, alpha * (1 - shatter) * c.floorEcho, size * c.echoSize);
    }
    // A broken afterimage's pool stays, dimmer, until the exit.
    for (let k = 0; k < n; k++) {
      if (this._broke[k] >= 0 && echo[k].z === 0) {
        const s = this._station(k, n);
        this.pointAt(s, _bp).addScaledVector(this.side, this._weave(s));
        echo[k].set(_bp.x, _bp.z, 0.45 * c.floorEcho, size * c.echoSize);
      }
    }
    this.ghosts.count = drawn;
    this.ghosts.visible = drawn > 0 && c.ghostOpacity > 0.01;
    this.ghosts.instanceMatrix.needsUpdate = true;
    this._ghostAttr.needsUpdate = true;
    this.ghostMaterial.userData.sync();

    // --- the cut ---
    const cutAlpha = committed ? Math.exp(-Math.max(0, tau - cutTime) / Math.max(0.02, c.cutLife)) : 0;
    if (cutAlpha > 0.01 && c.cutOpacity > 0.01) {
      const toA = (th) => Math.atan2(-Math.cos(th), -Math.sin(th));
      this.cut.position.copy(_pivot).setY(c.bladeHeight * 0.7);
      this.cut.rotation.set(0, Math.atan2(this.direction.x, this.direction.z), 0);
      const r = R + size * 0.3;
      this.cut.scale.set(r, 1, r);
      this.cutMaterial.userData.sync(toA(-span), toA(this._cutLead), cutAlpha);
      this.cut.visible = true;
    } else {
      this.cut.visible = false;
    }

    // --- the floor ---
    const erode = saturate((this._fadeT - c.floorErodeAt) / Math.max(0.05, 2 - c.floorErodeAt));
    if (c.floorOpacity > 0.01 && erode < 0.99 && (drawn > 0 || committed)) {
      const u = this.floorMaterial.uniforms;
      u.uCut.value.set(_end.x, _end.z, committed ? tau : -1);
      u.uDir.value.set(this.direction.x, this.direction.z, 0);
      this.floor.position.copy(this.origin).addScaledVector(this.direction, this.length * 0.5);
      this.floor.position.y = 0.02;
      this.floor.rotation.set(0, Math.atan2(this.direction.x, this.direction.z), 0);
      this.floor.scale.set(2 * (R + c.gashWidth + c.sweep), 1, this.length + 2 * (R + c.gashWidth));
      this.floorMaterial.userData.sync(erode, committed ? this._cutLead : -10);
      this.floor.visible = true;
    } else {
      this.floor.visible = false;
    }
  }

  /** Glass panes thrown off a breaking blade or afterimage. */
  _glass(at, count, size) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(count * g.particleCount);
    if (n <= 0) return;
    this._fillEmit(at, size * 0.6, _up, c.chipSpeed * 0.8, 0.9, c.chipSize * 1.4, c.chipLife * 1.4, 7);
    this.chips.emit(n, _emit);
    const m = Math.round(n * 0.6);
    if (m > 0) {
      this._fillEmit(at, size * 0.5, _up, c.moteSpeed * 1.5, 1, 0.08, c.moteLife, 1);
      this.motes.emit(m, _emit);
    }
  }

  dispose() {
    this.bladeGeometry.dispose();
    this.bladeMaterial.dispose();
    this.ghostGeometry.dispose();
    this.ghostMaterial.dispose();
    this.ghosts.dispose();
    this.cutGeometry.dispose();
    this.cutMaterial.dispose();
    this.floorGeometry.dispose();
    this.floorMaterial.dispose();
    this.trail.dispose();
    this.trailMaterial.dispose();
    this.scarMaterial.dispose();
    this.detail.dispose();
    this.rig.dispose();
    this.detailMaterial.dispose();
    this.heroMaterial.dispose();
    this.bodyGeometry.dispose();
    this.voiceGeometry.dispose();
    this.groundGeometry.dispose();
    this.bodyMaterial.dispose();
    this.lensMaterial.dispose();
    this.groundMaterial.dispose();
    this.voiceMaterial.dispose();
    super.dispose();
  }
}

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('Afterimage Swing');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'travel (m/s)');
  R(cast, c, 'cooldown', 0, 8, 0.05, 'cooldown');
  R(cast, c, 'impactTime', 0.05, 3, 0.01, 'impact (s)');
  R(cast, c, 'fadeTime', 0.05, 4, 0.01, 'fade (s)');
  
  Editor.castAnimation(cast, c);

  const hand = folder.addFolder('0 · Hand');
  R(hand, c, 'handForward', -0.5, 2, 0.01, 'forward (m)');
  R(hand, c, 'handSide', -1, 1, 0.01, 'side (m)');
  R(hand, c, 'handHeight', 0.2, 2.5, 0.01, 'height (m)');
  R(hand, c, 'handFlare', 0, 3, 0.01, 'flare (m)');
  R(hand, c, 'handSparks', 0, 120, 1, 'sparks');
  R(hand, c, 'handMotes', 0, 80, 1, 'motes');

  const shape = folder.addFolder('1 · Shape — return');
  R(shape, c, 'count', 1, 16, 1, 'count');
  R(shape, c, 'height', 0.2, 10, 0.05, 'height (m)');
  R(shape, c, 'thickness', 0.02, 2, 0.01, 'thickness (m)');
  R(shape, c, 'sweep', 0, 8, 0.05, 'reach');
  R(shape, c, 'lean', 0, 3, 0.01, 'lean');

  const motion = folder.addFolder('2 · Timing');
  R(motion, c, 'spinSpeed', -20, 20, 0.1, 'spin (rad/s)');
  R(motion, c, 'lifetime', 0.1, 5, 0.05, 'hold (s)');

  const look = folder.addFolder('3 · Body');
  R(look, c, 'bodyOpacity', 0, 2, 0.01, 'opacity');
  R(look, c, 'bodyGlow', 0, 4, 0.01, 'body glow');
  R(look, c, 'edgeGlow', 0, 10, 0.05, 'edge glow');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft fade (m)');
  R(look, c, 'bodyPulse', 0, 1, 0.01, 'pulse');
  R(look, c, 'bodyPulseRate', 0, 20, 0.1, 'pulse rate');
  R(look, c, 'lensWarp', 0, 3, 0.01, 'lens warp');
  look.addColor(c, 'colorA').name('edge');
  look.addColor(c, 'colorB').name('core');
  look.addColor(c, 'colorC').name('deep');

  const voice = folder.addFolder('4 · Voice');
  R(voice, c, 'voiceOpacity', 0, 2, 0.01, 'opacity');
  voice.addColor(c, 'colorVoiceA').name('voice');
  voice.addColor(c, 'colorVoiceB').name('voice, hot');

  const floor = folder.addFolder('5 · Ground');
  R(floor, c, 'groundWidth', 0.2, 16, 0.05, 'width (m)');
  R(floor, c, 'groundGlow', 0, 6, 0.05, 'glow');
  R(floor, c, 'groundLife', 0.1, 12, 0.05, 'residue life (s)');
  R(floor, c, 'groundOpacity', 0, 2, 0.01, 'opacity');
  R(floor, c, 'groundHeat', 0, 4, 0.05, 'heat');
  R(floor, c, 'groundCoat', 0, 1, 0.01, 'stain .. coat');
  
  R(floor, c, 'groundStain', 0, 1.5, 0.01, 'residue');
  R(floor, c, 'groundStainReach', 0.1, 2, 0.01, 'residue reach');
  floor.addColor(c, 'colorGroundA').name('ground');
  floor.addColor(c, 'colorGroundB').name('ground, deep');
  floor.addColor(c, 'colorGroundStain').name('stain');

  const pieces = folder.addFolder('6 · Detail pieces');
  R(pieces, c, 'detailCount', 0, 48, 1, 'count');
  R(pieces, c, 'detailSize', 0.05, 2, 0.01, 'size (m)');
  R(pieces, c, 'detailSizeJitter', 0, 1, 0.01, 'size jitter');
  R(pieces, c, 'detailSpread', 0.1, 2, 0.01, 'spread');
  R(pieces, c, 'detailLift', 0, 8, 0.05, 'lift (m)');
  R(pieces, c, 'detailSpin', -4, 4, 0.05, 'orbit');
  R(pieces, c, 'detailGlow', 0, 6, 0.05, 'rim glow');
  R(pieces, c, 'detailOpacity', 0, 1.5, 0.01, 'opacity');
  R(pieces, c, 'detailSwing', 0, 2.5, 0.01, 'fold');
  R(pieces, c, 'detailEdge', 0, 4, 0.05, 'arris light');
  R(pieces, c, 'detailDeep', 0, 1, 0.01, 'colour depth');
  pieces.addColor(c, 'colorDetailA').name('rim');
  pieces.addColor(c, 'colorDetailB').name('lit');
  pieces.addColor(c, 'colorDetailC').name('shade');

  const hero = folder.addFolder('7 · Hero rig');
  R(hero, c, 'heroSize', 0.2, 8, 0.05, 'size (m)');
  R(hero, c, 'heroReach', 0.1, 1.4, 0.01, 'ring fit');
  R(hero, c, 'heroLift', 0, 8, 0.05, 'travel (m)');
  R(hero, c, 'heroSpin', -4, 4, 0.05, 'turn');
  R(hero, c, 'heroSwing', 0, 2.5, 0.01, 'fold');
  R(hero, c, 'heroGlow', 0, 6, 0.05, 'rim glow');
  R(hero, c, 'heroEdge', 0, 4, 0.05, 'arris light');
  R(hero, c, 'heroOpacity', 0, 1.5, 0.01, 'opacity');
  R(hero, c, 'heroDeep', 0, 1, 0.01, 'colour depth');
  R(hero, c, 'heroMaxHeight', 1, 12, 0.05, 'max height (m)');
  R(hero, c, 'heroMinSpan', 0, 6, 0.05, 'min span (m)');
  hero.addColor(c, 'colorHeroA').name('rim');
  hero.addColor(c, 'colorHeroB').name('lit');
  hero.addColor(c, 'colorHeroC').name('shade');

  const parts = folder.addFolder('8 · Shed');
  R(parts, c, 'dustRate', 0, 400, 1, 'dust / s');
  R(parts, c, 'dustSize', 0.02, 2, 0.01, 'dust size');
  R(parts, c, 'dustSpeed', 0, 20, 0.1, 'dust speed');
  R(parts, c, 'dustLife', 0.05, 3, 0.01, 'dust life');
  R(parts, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(parts, c, 'colorDust', 'dust colour');
  R(parts, c, 'streakRate', 0, 400, 1, 'shed / s');
  R(parts, c, 'streakSize', 0.005, 0.4, 0.005, 'shed size');
  R(parts, c, 'streakSpeed', 0, 30, 0.1, 'shed speed');
  R(parts, c, 'streakLife', 0.05, 2, 0.01, 'shed life');
  R(parts, c, 'streakStretch', 0, 4, 0.01, 'shed stretch');
  Editor.gradient(parts, c, 'colorStreak', 'shed colour');
  R(parts, c, 'chipRate', 0, 200, 1, 'chips / s');
  R(parts, c, 'chipSize', 0.01, 0.4, 0.005, 'chip size');
  R(parts, c, 'chipSpeed', 0, 20, 0.1, 'chip speed');
  R(parts, c, 'chipLife', 0.05, 3, 0.01, 'chip life');
  Editor.gradient(parts, c, 'colorChip', 'chip colour');

  const motes = folder.addFolder('9 · Motes');
  R(motes, c, 'moteRate', 0, 200, 1, 'motes / s');
  R(motes, c, 'moteSize', 0.01, 0.4, 0.005, 'size');
  R(motes, c, 'moteSpeed', 0, 10, 0.1, 'speed');
  R(motes, c, 'moteLife', 0.1, 4, 0.05, 'life');
  Editor.gradient(motes, c, 'colorMote', 'mote colour');

  const beat = folder.addFolder('10 · The beat');
  R(beat, c, 'impactShake', 0, 2, 0.01, 'camera punch');
  R(beat, c, 'impactFlash', 0, 1, 0.01, 'flash');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 12, 0.05, 'burst (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'burst life');
  R(beat, c, 'burstOpacity', 0, 1.5, 0.01, 'burst opacity');
  R(beat, c, 'impactChips', 0, 200, 1, 'fragments');
  R(beat, c, 'impactDust', 0, 120, 1, 'dust roll');
  beat.addColor(c, 'colorBurstA').name('burst, hot');
  beat.addColor(c, 'colorBurstB').name('burst, body');
  beat.addColor(c, 'colorBurstC').name('burst, deep');
  R(beat, c, 'shockRadius', 0, 16, 0.05, 'decal (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'decal life');
  R(beat, c, 'shockRing', 0, 1.5, 0.01, 'shock ring');
  beat.addColor(c, 'colorShockA').name('decal');
  beat.addColor(c, 'colorShockB').name('decal, hot');

  const after = folder.addFolder('11 · Aftershock');
  R(after, c, 'aftershockAt', 1, 1.9, 0.01, 'lands at');
  R(after, c, 'aftershockRadius', 0, 12, 0.05, 'dust roll (m)');
  R(after, c, 'aftershockShake', 0, 2, 0.01, 'camera punch');
  R(after, c, 'aftershockLight', 0, 40, 0.5, 'light punch');
  R(after, c, 'aftershockLife', 0.05, 3, 0.01, 'dust life');

  const bodies = folder.addFolder('12 · Bodies');
  R(bodies, c, 'hitRadius', 0.1, 12, 0.05, 'reach (m)');
  R(bodies, c, 'hitImpulse', 0, 24, 0.1, 'impulse');
  R(bodies, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(bodies, c, 'hitSpin', 0, 8, 0.05, 'spin');

  const mark = folder.addFolder('13 · Mark — glamoured');
  R(mark, c, 'markAmount', 0, 1, 0.01, 'stain');
  R(mark, c, 'markTime', 0.02, 3, 0.01, 'sets in (s)');
  R(mark, c, 'markLife', 0, 8, 0.05, 'sheds for (s)');
  R(mark, c, 'markMotes', 0, 120, 1, 'motes / s');
  mark.addColor(c, 'colorMarkBody').name('body');
  mark.addColor(c, 'colorMarkRim').name('rim');
  R(mark, c, 'markRimGlow', 0, 6, 0.05, 'rim glow');
  mark.addColor(c, 'colorMarkEdge').name('edge');
  R(mark, c, 'markEdgeGlow', 0, 8, 0.05, 'edge glow');
  R(mark, c, 'markEdgeWidth', 0, 0.3, 0.005, 'edge width');

  const trail = folder.addFolder('14 · Trail');
  R(trail, c, 'trailWidth', 0, 3, 0.01, 'ribbon width (m)');
  R(trail, c, 'trailLife', 0.05, 6, 0.05, 'ribbon life (s)');
  R(trail, c, 'trailOpacity', 0, 2, 0.01, 'ribbon opacity');
  R(trail, c, 'trailGlow', 0, 4, 0.01, 'ribbon glow');
  R(trail, c, 'trailCore', 0, 1, 0.01, 'white core');
  R(trail, c, 'trailBreakup', 0, 3, 0.01, 'break-up');
  R(trail, c, 'scarWidth', 0, 4, 0.01, 'scar width (m)');
  R(trail, c, 'scarLife', 0.05, 8, 0.05, 'scar life (s)');
  R(trail, c, 'scarOpacity', 0, 1, 0.01, 'scar opacity');
  R(trail, c, 'scarGlow', 0, 6, 0.05, 'seam glow');
  trail.addColor(c, 'colorScarA').name('seam');
  trail.addColor(c, 'colorScarB').name('bed');
  R(trail, c, 'wakeSpacing', 0, 6, 0.05, 'wake every (m)');
  R(trail, c, 'wakeRadius', 0, 4, 0.01, 'wake decal (m)');
  R(trail, c, 'wakeLife', 0.05, 6, 0.05, 'wake life (s)');
  R(trail, c, 'wakeChips', 0, 40, 1, 'wake chips');

  const decoy = folder.addFolder('15 · Decoy & afterimages');
  R(decoy, c, 'decoyOpacity', 0, 3, 0.01, 'decoy strength');
  R(decoy, c, 'decoyWeave', 0, 3, 0.01, 'weave, × reach');
  R(decoy, c, 'decoyStreaks', 0, 300, 1, 'streaks / s');
  R(decoy, c, 'ghostCount', 0, 8, 1, 'afterimages');
  R(decoy, c, 'ghostStart', 0, 0.8, 0.01, 'first one at (× line)');
  R(decoy, c, 'ghostOpacity', 0, 3, 0.01, 'afterimage strength');
  R(decoy, c, 'ghostLife', 0.05, 6, 0.05, 'dims over (s)');
  R(decoy, c, 'ghostScan', 0, 120, 1, 'scanlines');
  R(decoy, c, 'ghostBreak', 0.02, 1.5, 0.01, 'breaks over (s)');
  R(decoy, c, 'ghostShards', 0, 80, 1, 'shards each');
  R(decoy, c, 'ghostCollapse', 0, 2, 0.01, 'rest collapse after (s)');
  R(decoy, c, 'ghostStagger', 0, 0.6, 0.01, 'collapse stagger (s)');

  const blade = folder.addFolder('16 · The blade');
  R(blade, c, 'bladeSize', 0.2, 4, 0.01, 'size (m)');
  R(blade, c, 'bladeHeight', 0.2, 4, 0.01, 'height (m)');
  R(blade, c, 'bladeBank', -1.5, 1.5, 0.01, 'bank (rad)');
  R(blade, c, 'bladeSpin', 0, 60, 0.5, 'spin (rad/s)');
  R(blade, c, 'bladeSpinDown', 0.1, 6, 0.05, 'spins down over (s)');
  R(blade, c, 'bladeStop', 0.1, 1, 0.01, 'comes back to (× line)');
  R(blade, c, 'returnArc', -4, 4, 0.05, 'return arc (m)');
  R(blade, c, 'returnSide', -4, 4, 0.05, 'hangs off the line (m)');
  R(blade, c, 'bladeBob', 0, 1, 0.01, 'bob (m)');
  R(blade, c, 'bladeBobRate', 0, 10, 0.05, 'bob rate');
  R(blade, c, 'bladeForm', 0.02, 0.6, 0.01, 'forms over (s)');
  R(blade, c, 'bladeExitAt', 1, 1.95, 0.01, 'shatters from');
  R(blade, c, 'bladeShards', 0, 120, 1, 'shards');
  R(blade, c, 'bladeSpecular', 0, 4, 0.01, 'specular');
  R(blade, c, 'bladeFresnel', 0, 3, 0.01, 'rim');
  R(blade, c, 'bladeAmbient', 0, 1.5, 0.01, 'ambient');
  R(blade, c, 'bladeEdgeGlow', 0, 6, 0.05, 'edge glow');
  R(blade, c, 'bladeSheen', 0, 3, 0.01, 'sheen');
  R(blade, c, 'bladeShadow', 0, 1, 1, 'cast shadow');
  blade.addColor(c, 'colorBladeCore').name('core');
  blade.addColor(c, 'colorBladeTint').name('tint');
  blade.addColor(c, 'colorBladeBody').name('body');
  blade.addColor(c, 'colorBladeDeep').name('deep');

  const cut = folder.addFolder('17 · The cut');
  R(cut, c, 'gashRadius', 0.3, 6, 0.05, 'arc radius (m)');
  R(cut, c, 'gashSpan', 0.1, 1.5, 0.01, 'half-arc (rad)');
  R(cut, c, 'gashWidth', 0.05, 2, 0.01, 'gash width (m)');
  R(cut, c, 'cutTime', 0.05, 1, 0.01, 'sweep (s)');
  R(cut, c, 'cutLife', 0.02, 2, 0.01, 'light fades over (s)');
  R(cut, c, 'cutOpacity', 0, 3, 0.01, 'light strength');
  R(cut, c, 'cutInner', 0, 0.95, 0.01, 'light inner radius');

  const pools = folder.addFolder('18 · Floor');
  R(pools, c, 'floorOpacity', 0, 1.5, 0.01, 'opacity');
  R(pools, c, 'floorGlow', 0, 5, 0.05, 'glow');
  R(pools, c, 'floorEcho', 0, 1.5, 0.01, 'afterimage pools');
  R(pools, c, 'echoSize', 0.1, 3, 0.01, 'pool size, × blade');
  R(pools, c, 'floorErodeAt', 1, 1.95, 0.01, 'erodes from');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
