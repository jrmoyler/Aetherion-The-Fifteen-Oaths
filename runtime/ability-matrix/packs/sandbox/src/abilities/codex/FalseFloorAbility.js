import { InstancedBufferAttribute, InstancedMesh, Mesh, Object3D, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { createFalseFloorPieceGeometry, createFalseFloorHeroGeometry } from '../../assets/codex/FalseFloorGeometry.js';
import { createFalseFloorTileGeometry } from '../../assets/codex/FalseFloorSignatureGeometry.js';
import {
  createFalseFloorBodyMaterial,
  createFalseFloorLensMaterial,
  createFalseFloorGroundMaterial,
  createFalseFloorVoiceMaterial,
  createFalseFloorDetailMaterial,
  createFalseFloorTileMaterial,
  createFalseFloorPitMaterial
} from '../../materials/codex/FalseFloorMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'falsefloor';

const TWIST = 'drop';
const ARCH = 'well';
const HIT = 'down';
const CARRY = 'up';
const WHEN = 'commit';
const ECHO = null;
const OFFSET = false;
const DISSOLVE_TRAVEL = false;
const COUNTER = false;
const ZONE = true;
const LIFT = -1;
const SLICE = false;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _end = new Vector3();
const _focus = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);
const _o = new Object3D();
const _q = new Quaternion();
const _axis = new Vector3();
const TAU = Math.PI * 2;

/** Flagstones the false floor can lay (a 6.5 m circle of 0.9 m tiles). */
const MAX_TILES = 170;
/** Flagstones in the wave that runs along the floor from the hand. */
const MAX_PATH = 40;

/** Stable 0..1 dice from a seed and two indices. */
function dice(seed, i, k) {
  const h = Math.sin(seed * 91.7 + i * 12.9898 + k * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/** Felled bodies one cast can keep marked at once. */
const MAX_MARKS = 12;

/**
 * FALSE FLOOR — illusion, zone cast.
 *
 * Illusion — the floor agrees to be solid, then drops the circle.
 *
 * The floor reads as solid during the travel. The drop is the commit, straight down, with no warning lift.
 *
 * The read is `drop`: hit timing `commit`, blow `down`, carry `up`.
 *
 * ## Layers
 *
 *   1. **body** — the drop placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled illusion field under the circle: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a drain riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createFalseFloorPieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createFalseFloorHeroGeometry`), stood by its archetype (well): sunk low while it inhales, then stretched up the exhale.
 *      Hero and pieces are energy: emissive over a dark body with a fresnel shell (LAYER.VFX). The rig is framed to the circle (`heroFit`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: the floor reads as solid during the travel. The drop is the commit, straight down, with no warning lift.
 *  10. **mark** — a felled body is glamoured: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The false floor (upgrade pass — the cast's own silhouette)
 *
 * The template body (a dome), voice, rig, pieces, field and lens are off by
 * default (their opacity / count keys are 0). The spell's noun is now a floor
 * of real flagstones (`createFalseFloorTileGeometry`, lit slate, `LAYER.WORLD`,
 * shadows; only their seams glow) over a pit with depth:
 *
 *  - **travel** — a wave of flagstones heaves up out of the floor and sinks
 *    back behind the front, running from the hand to the circle (`path*`);
 *    as it arrives the circle paves itself, near edge to far edge, with
 *    slabs that look like the floor (`tile*`). Their seams flicker harder as
 *    the front closes (`tileStrain`): the floor *agrees* to be solid.
 *  - **impact — the drop** — on the commit every slab falls straight down
 *    (`dropKick`, `dropGravity`), tumbling, centre first (`dropStagger`),
 *    and the pit (`createFalseFloorPitMaterial`) is under them: an
 *    interior-mapped shaft `pitDepth` deep, stone courses darkening into a
 *    violet-black bottom, its wall sliding upward (`pitFall`) so the fall
 *    does not end. The rim tears (crack decal), chips fly.
 *  - **linger** — haze motes rise out of the shaft; the wall keeps sliding.
 *  - **exit — the lie reasserts** — from `reformFrom` the slabs fly back up
 *    out of the pit, rim first, and settle flush; the pit closes behind
 *    them from the rim in; then the slabs sink into the real floor and the
 *    seams go out. The residue decal stays.
 *
 * Every metre, rate and colour is read from `settings.falsefloor` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class FalseFloorAbility extends Ability {
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
    this.bodyMaterial = createFalseFloorBodyMaterial();
    this.lensMaterial = createFalseFloorLensMaterial();
    this.groundMaterial = createFalseFloorGroundMaterial();
    this.voiceMaterial = createFalseFloorVoiceMaterial();
    this.detailMaterial = createFalseFloorDetailMaterial();
    this.heroMaterial = createFalseFloorDetailMaterial(true);
    this.detail = new DetailLayer(createFalseFloorPieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createFalseFloorHeroGeometry(), this.heroMaterial, ARCH, ZONE);
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

    // The flagstones and the pit — the cast's own hero (see the class comment).
    this.tileGeometry = createFalseFloorTileGeometry();
    this.pathGeometry = createFalseFloorTileGeometry();
    this.tileState = new InstancedBufferAttribute(new Float32Array(MAX_TILES), 1);
    this.pathState = new InstancedBufferAttribute(new Float32Array(MAX_PATH), 1);
    this.tileGeometry.setAttribute('aState', this.tileState);
    this.pathGeometry.setAttribute('aState', this.pathState);
    this.tileMaterial = createFalseFloorTileMaterial();
    this.tiles = new InstancedMesh(this.tileGeometry, this.tileMaterial, MAX_TILES);
    this.path = new InstancedMesh(this.pathGeometry, this.tileMaterial, MAX_PATH);
    for (const m of [this.tiles, this.path]) {
      m.count = 0;
      m.layers.set(LAYER.WORLD);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.visible = false;
      this.group.add(m);
    }
    this.pitGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.pitMaterial = createFalseFloorPitMaterial();
    // Drawn after the ground decals (order 6/8), so the residue and cracks never paint over the shaft.
    this.pit = this._mesh(this.pitGeometry, this.pitMaterial, LAYER.VFX, 12);
    this.pit.rotation.x = -Math.PI / 2;
    this._since = -1;
    this._dropped = false;
    this.pitEmitter = new RateEmitter();
  }

  /**
   * Lay, drop and re-lay the flagstones; open and close the pit; run the
   * travelling wave. Presentation only: the template's commit is the hit.
   *
   * @param {number} dt
   * @param {number} fadeT -1 in travel; the onFade clock (0..2) after the beat
   */
  _floor(dt, fadeT) {
    const c = settings[ID];
    const g = settings.global;
    const R = Math.max(0.3, c.zoneRadius);
    const ts = Math.max(0.3, c.tileSize);
    this.pointAt(1, _focus);
    const committed = fadeT >= 0;
    if (committed) this._since += dt;
    const since = Math.max(0, this._since);
    const raise = c.tileRaise;
    const settle = committed && fadeT > c.settleFrom ? Easing.inCubic(saturate((fadeT - c.settleFrom) / Math.max(0.05, 2 - c.settleFrom))) : 0;
    const reformAt = (r01) => (committed && fadeT > c.reformFrom ? saturate((fadeT - c.reformFrom - (1 - r01) * c.reformStagger) / Math.max(0.02, c.reformTime)) : 0);

    // The circle of flagstones, laid on a grid in the cast's own frame.
    const m = Math.ceil(R / ts);
    let k = 0;
    let drawn = 0;
    for (let iz = -m; iz <= m && k < MAX_TILES; iz++) {
      for (let ix = -m; ix <= m && k < MAX_TILES; ix++) {
        const lx = ix * ts;
        const lz = iz * ts;
        const d = Math.hypot(lx, lz);
        if (d + ts * 0.3 > R) continue;
        const idx = k++;
        const r01 = d / R;
        let y;
        let tumble = 0;
        let state;
        let inward = 0;
        if (!committed) {
          const near = (lz + R) / (2 * R);
          const appear = saturate((this.u - c.tileAssembleFrom - near * c.tileAssembleSweep) / Math.max(0.02, c.tileAssembleTime));
          if (appear <= 0) continue;
          y = raise - (0.3 + raise) * (1 - Easing.outBack(appear));
          state = (1 - appear) * 0.8;
        } else {
          const local = since - c.dropDelay - r01 * c.dropStagger;
          const p = reformAt(r01);
          if (local < 0) {
            y = raise;
            state = 0.25;
          } else {
            const fall = c.dropKick * local + 0.5 * c.dropGravity * g.explosionIntensity * local * local;
            y = raise - fall;
            tumble = (0.6 + dice(this._seed, idx, 1)) * c.dropTumble * local;
            inward = Math.min(c.dropInward * local, d * 0.6);
            state = Math.min(1, local * 5);
            if (p > 0) {
              y = -c.reformDepth + (c.reformDepth + raise) * Easing.outBack(p);
              tumble = (0.6 + dice(this._seed, idx, 1)) * c.dropTumble * 0.35 * (1 - p);
              inward = 0;
              state = (1 - p) * 0.6;
            } else if (y < -c.reformDepth) continue;
          }
          y -= settle * (raise + 0.3);
          state *= 1 - settle;
        }
        const a = dice(this._seed, idx, 2) * TAU;
        _axis.set(Math.cos(a), 0, Math.sin(a));
        _o.position.copy(_focus).addScaledVector(this.side, lx * (1 - inward / Math.max(0.01, d))).addScaledVector(this.direction, lz * (1 - inward / Math.max(0.01, d)));
        _o.position.y = y;
        _o.quaternion.setFromAxisAngle(_axis, tumble);
        _q.setFromAxisAngle(_up, Math.atan2(this.direction.x, this.direction.z) + (dice(this._seed, idx, 3) - 0.5) * 0.06);
        _o.quaternion.multiply(_q);
        const w = ts * c.tileFill;
        _o.scale.set(w, 1, w);
        _o.updateMatrix();
        this.tiles.setMatrixAt(drawn, _o.matrix);
        this.tileState.array[drawn] = state;
        drawn++;
      }
    }
    this.tiles.count = drawn;
    this.tiles.instanceMatrix.needsUpdate = true;
    this.tileState.needsUpdate = true;
    this.tiles.visible = drawn > 0 && c.tileFill > 0.01 && settle < 0.999;
    const strain = committed ? 0 : c.tileStrain * saturate((this.u - 0.6) / 0.4);
    this.tileMaterial.userData.sync(c.tileSeam * (1 - settle), strain);

    // The pit: opens centre-out on the drop, closes rim-in as the floor reforms.
    if (committed) {
      const open = Easing.outCubic(saturate((since - c.dropDelay) / Math.max(0.02, c.dropStagger + 0.12)));
      const close = fadeT > c.reformFrom ? saturate((fadeT - c.reformFrom - 0.7 * c.reformTime) / Math.max(0.02, c.reformStagger)) : 0;
      this.pit.position.copy(_focus).setY(0.045);
      this.pit.scale.set(R, R, 1);
      this.pitMaterial.userData.sync(_focus, R, open, close, since * c.pitFall * g.animationSpeed, this._seed);
      this.pit.visible = c.pitOpacity > 0.01 && open > 0.01 && close < 0.999;
      // Haze rising out of the shaft.
      const n = Math.round(this.pitEmitter.tick(dt, c.pitMotes * open * (1 - close)) * g.particleCount);
      for (let i = 0; i < n; i++) {
        const rr = Math.sqrt(Math.random()) * R * 0.9 * open;
        const aa = Math.random() * TAU;
        _pos.copy(_focus);
        _pos.x += Math.cos(aa) * rr;
        _pos.z += Math.sin(aa) * rr;
        _pos.y = 0.05;
        this._fillEmit(_pos, 0.2, _up, c.moteSpeed, 0.3, 0.12, c.moteLife * 1.4, 1);
        this.motes.emit(1, _emit);
      }
    } else {
      this.pit.visible = false;
    }

    // The wave of flagstones running along the floor from the hand to the circle.
    let pn = 0;
    if (!committed && c.pathTile > 0.01) {
      const start = c.handForward + c.pathStart;
      const end = Math.max(start, this.length - R);
      const count = Math.min(MAX_PATH, Math.floor((end - start) / Math.max(0.2, c.pathSpacing)));
      for (let j = 0; j < count; j++) {
        const sm = start + (j + 0.5) * c.pathSpacing;
        const x = (this.front - sm) / Math.max(0.2, c.pathWave);
        if (x <= 0 || x >= 1) continue;
        const bump = Math.sin(Math.PI * x);
        this.pointAt(sm / Math.max(0.1, this.length), _o.position).addScaledVector(this.side, (dice(this._seed, j, 4) - 0.5) * 0.3);
        _o.position.y = -0.3 + (0.3 + c.pathLift) * bump;
        _axis.copy(this.side);
        _o.quaternion.setFromAxisAngle(_axis, -0.25 * Math.cos(Math.PI * x));
        _q.setFromAxisAngle(_up, Math.atan2(this.direction.x, this.direction.z) + (dice(this._seed, j, 5) - 0.5) * 0.3);
        _o.quaternion.multiply(_q);
        _o.scale.set(c.pathTile, 1, c.pathTile);
        _o.updateMatrix();
        this.path.setMatrixAt(pn, _o.matrix);
        this.pathState.array[pn] = bump * 0.25;
        pn++;
      }
    }
    this.path.count = pn;
    this.path.instanceMatrix.needsUpdate = true;
    this.pathState.needsUpdate = true;
    this.path.visible = pn > 0;
  }

  /** The drop lands: the rim tears and stone chips fly off the falling slabs. */
  _drop() {
    const c = settings[ID];
    const g = settings.global;
    const R = Math.max(0.3, c.zoneRadius);
    this.pointAt(1, _focus);
    // The floor tears round the rim (not across the shaft): short cracks on the edge.
    const tears = Math.max(0, Math.round(c.rimTears));
    for (let i = 0; i < tears; i++) {
      const a = (i / Math.max(1, tears)) * TAU + this._seed;
      _pos.copy(_focus);
      _pos.x += Math.cos(a) * R * 1.02;
      _pos.z += Math.sin(a) * R * 1.02;
      this.ctx.decals.spawn(DecalType.CRACK, _pos, {
        radius: c.rimCrack,
        life: c.groundLife * g.lifetime,
        width: 0.07,
        intensity: 0.5,
        colorA: getColor(c.colorPitDeep),
        colorB: getColor(c.colorPitSeam),
        height: 0.034
      });
    }
    const chips = Math.round(c.dropChips * g.particleCount * g.explosionIntensity);
    if (chips > 0) {
      _pos.copy(_focus).setY(0.1);
      this._fillEmit(_pos, R * 0.75, _up, c.chipSpeed * 0.8, 0.6, c.chipSize * 1.5, c.chipLife * 1.3, 8);
      this.chips.emit(chips, _emit);
    }
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
    this.dust = particles.get('falsefloor.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('falsefloor.streak', {
      capacity: 1200,
      shape: ParticleShape.SOFT,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('falsefloor.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('falsefloor.mote', {
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
    return 1 - f + f * Math.sin(this.age * 8.00);
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
    this.detail.hide();
    this.rig.hide();
    this.body.visible = false;
    this.voice.visible = false;
    this.lens.visible = false;
    this.ground.visible = false;
    this._since = -1;
    this._dropped = false;
    this.pitEmitter.reset();
    this.tiles.count = 0;
    this.path.count = 0;
    this.tiles.visible = false;
    this.path.visible = false;
    this.pit.visible = false;
    this._releaseMarks();
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
    const rise = committed ? 1 : Easing.outCubic(saturate(u));
    const beat = committed ? Easing.outCubic(saturate(fadeT < 1 ? fadeT : 1)) : 0;
    let grow;
    let open;
    let along;
    along = 1; grow = rise; open = beat;
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
      st.land = 0;
      st.pre = c.groundTelegraph * saturate(this.u * 1.4);
      st.heat = 0;
      st.erode = 0;
      return;
    }
    const since = fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
    const landed = saturate(since / Math.max(0.05, c.groundLand));
    st.land = 1.25 * Easing.outCubic(landed);
    st.pre = c.groundTelegraph * (1 - landed);
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
    this.detail.update(TWIST, ZONE, st, c, this.age);
    this.rig.update(st, c, this.age);
    const show = fade > 0.02 && (grow > 0.02 || open > 0.02);
    this.body.visible = show && c.bodyOpacity > 0.01;
    this.voice.visible = show && c.voiceOpacity > 0.01;
    this.lens.visible = show && c.lensWarp > 0.01;
    this.ground.visible = c.groundOpacity > 0.01 && st.erode < 0.99 && (st.land > 0.001 || st.pre > 0.01);
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
    _dir.copy(this.direction).multiplyScalar(0.12);
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
   * the floor, and a filled residue decal sized to the circle that stays on the
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
      radius: Math.max(0.5, c.zoneRadius * c.groundStainReach) * power,
      life: c.groundLife * g.lifetime,
      width: 0.8,
      intensity: c.groundStain,
      colorA: getColor(c.colorGroundStain),
      colorB: getColor(c.colorGroundA),
      height: 0.025
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _end, {
      radius: c.shockRadius * (ZONE ? 1 : 0.65) * power,
      life: c.shockLife,
      width: 0.08,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
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

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._spin += dt * c.spinSpeed * g.animationSpeed;
    this._pose(false, 0);
    this._palette();
    this._shed(dt, 0.35 + 0.65 * this._state.grow);
    this._floor(dt, -1);
    if (WHEN === 'travel' || WHEN === 'part' || WHEN === 'late') this._strike(false);
    this._updateMarks(dt);
    this.ctx.shake.rumble(0.035 * c.impactShake * g.cameraShake, dt);
  }

  onImpact() {
    this._beat();
    this._since = 0;
    if (!this._dropped) {
      this._dropped = true;
      this._drop();
    }
    if (WHEN === 'commit' || WHEN === 'part') this._strike(true);
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const fade = t < 1 ? 1 : 1 - (t - 1);
    this._spin += dt * c.spinSpeed * g.animationSpeed * 0.40;
    this._pose(true, t);
    this._palette();
    this._shed(dt, fade * 0.7);
    this._floor(dt, t);
    if (WHEN === 'return') this._strike(false);
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
    this.tiles.visible = false;
    this.path.visible = false;
    this.pit.visible = false;
  }

  dispose() {
    this.tiles.dispose();
    this.path.dispose();
    this.tileGeometry.dispose();
    this.pathGeometry.dispose();
    this.tileMaterial.dispose();
    this.pitGeometry.dispose();
    this.pitMaterial.dispose();
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
  const folder = gui.addFolder('False Floor');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'travel (m/s)');
  R(cast, c, 'cooldown', 0, 8, 0.05, 'cooldown');
  R(cast, c, 'impactTime', 0.05, 3, 0.01, 'impact (s)');
  R(cast, c, 'fadeTime', 0.05, 4, 0.01, 'fade (s)');
  R(cast, c, 'zoneRadius', 0.5, 12, 0.05, 'circle (m)');
  Editor.castAnimation(cast, c);

  const hand = folder.addFolder('0 · Hand');
  R(hand, c, 'handForward', -0.5, 2, 0.01, 'forward (m)');
  R(hand, c, 'handSide', -1, 1, 0.01, 'side (m)');
  R(hand, c, 'handHeight', 0.2, 2.5, 0.01, 'height (m)');
  R(hand, c, 'handFlare', 0, 3, 0.01, 'flare (m)');
  R(hand, c, 'handSparks', 0, 120, 1, 'sparks');
  R(hand, c, 'handMotes', 0, 80, 1, 'motes');

  const shape = folder.addFolder('1 · Shape — drop');
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
  R(floor, c, 'groundLand', 0.05, 2, 0.01, 'lands in (s)');
  R(floor, c, 'groundTelegraph', 0, 1, 0.01, 'footprint before the beat');
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
  R(hero, c, 'heroFit', 0, 1.5, 0.01, 'fit to circle');
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

  const tiles = folder.addFolder('14 · The false floor');
  R(tiles, c, 'tileSize', 0.3, 3, 0.01, 'flagstone (m)');
  R(tiles, c, 'tileFill', 0, 1.2, 0.01, 'fill (gap)');
  R(tiles, c, 'tileRaise', -0.1, 0.4, 0.005, 'stands proud (m)');
  R(tiles, c, 'tileAssembleFrom', 0, 1, 0.01, 'paves from (travel)');
  R(tiles, c, 'tileAssembleSweep', 0, 1, 0.01, 'near → far sweep');
  R(tiles, c, 'tileAssembleTime', 0.02, 1, 0.01, 'each lays in');
  R(tiles, c, 'tileStrain', 0, 1, 0.01, 'seam flicker before');
  R(tiles, c, 'tileSeam', 0, 2, 0.01, 'seam light');
  R(tiles, c, 'tileGlow', 0, 8, 0.05, 'glow');
  R(tiles, c, 'tileSheen', 0, 2, 0.01, 'sheen');
  R(tiles, c, 'tileRough', 0, 1, 0.01, 'roughness');
  tiles.addColor(c, 'colorTile').name('slate');
  R(tiles, c, 'dropDelay', 0, 0.5, 0.01, 'drop delay (s)');
  R(tiles, c, 'dropStagger', 0, 0.6, 0.01, 'centre → rim (s)');
  R(tiles, c, 'dropKick', 0, 8, 0.05, 'drop kick (m/s)');
  R(tiles, c, 'dropGravity', 0, 40, 0.5, 'gravity (m/s²)');
  R(tiles, c, 'dropTumble', 0, 12, 0.1, 'tumble (rad/s)');
  R(tiles, c, 'dropInward', 0, 4, 0.05, 'draw in (m/s)');
  R(tiles, c, 'dropChips', 0, 200, 1, 'chips');
  R(tiles, c, 'rimCrack', 0, 4, 0.01, 'rim crack (m)');
  R(tiles, c, 'rimTears', 0, 16, 1, 'rim cracks');
  R(tiles, c, 'reformFrom', 1, 1.95, 0.01, 'reforms from');
  R(tiles, c, 'reformStagger', 0, 0.6, 0.01, 'rim → centre');
  R(tiles, c, 'reformTime', 0.02, 0.6, 0.01, 'each rises in');
  R(tiles, c, 'reformDepth', 0.2, 5, 0.05, 'rises from (m)');
  R(tiles, c, 'settleFrom', 1, 1.99, 0.01, 'sinks away from');

  const pit = folder.addFolder('15 · The pit');
  R(pit, c, 'pitDepth', 0.5, 12, 0.1, 'depth (m)');
  R(pit, c, 'pitOpacity', 0, 1.5, 0.01, 'opacity');
  R(pit, c, 'pitGlow', 0, 6, 0.05, 'seam glow');
  R(pit, c, 'pitFall', 0, 10, 0.05, 'endless fall (m/s)');
  R(pit, c, 'pitMotes', 0, 200, 1, 'haze motes / s');
  pit.addColor(c, 'colorPitDeep').name('deep');
  pit.addColor(c, 'colorPitSeam').name('seams');
  pit.addColor(c, 'colorPitHaze').name('haze');

  const wave = folder.addFolder('16 · The wave');
  R(wave, c, 'pathTile', 0, 2, 0.01, 'flagstone (m)');
  R(wave, c, 'pathStart', 0, 5, 0.05, 'starts past the hand (m)');
  R(wave, c, 'pathSpacing', 0.2, 3, 0.01, 'spacing (m)');
  R(wave, c, 'pathWave', 0.2, 8, 0.05, 'wave length (m)');
  R(wave, c, 'pathLift', 0, 1.5, 0.01, 'heave (m)');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
