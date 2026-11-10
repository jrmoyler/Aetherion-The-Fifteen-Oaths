import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  OctahedronGeometry,
  Quaternion,
  TorusGeometry,
  Vector3
} from 'three';
import { LAYER } from '../../core/Layers.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

/**
 * The instanced detail layer shared by the pure-element Codex casts.
 *
 * Every cast draws its body, lens, ground and voice with its own shaders. This
 * is the fifth layer: a handful of real geometry pieces (chunks, shards,
 * petals, bars...) that gives the effect a physical silhouette the full-screen
 * planes cannot. The pieces are one InstancedMesh, laid out each frame from
 * the same pose the shaders read, so they build, hit and settle with the cast.
 *
 * A cast supplies three things: which piece it throws (its own authored
 * geometry, or one of the stock `kind`s), how they move (`verb`, picked by the
 * cast's twist), and a block of live settings (`detail*`). Nothing here is
 * cached from settings.
 *
 * The material says whether the pieces are matter (`userData.solid`, from the
 * cast's `create<Cast>DetailMaterial`): solid elements' pieces are lit,
 * opaque and shadow-casting on `LAYER.SHAPED` with the material's folded
 * depth material; energy pieces stay on `LAYER.VFX`.
 */

/** Longest axis of every piece is +Y, so a single orientation rule fits all. */
const BUILDERS = {
  chunk: () => new DodecahedronGeometry(0.5, 0).scale(1, 0.8, 0.9),
  boulder: () => new IcosahedronGeometry(0.5, 0).scale(1.1, 0.7, 1),
  shard: () => new OctahedronGeometry(0.5, 0).scale(0.45, 1.5, 0.45),
  blade: () => new ConeGeometry(0.22, 1, 3).scale(1, 1, 0.25),
  ring: () => new TorusGeometry(0.5, 0.05, 6, 28).rotateX(Math.PI / 2),
  rod: () => new CylinderGeometry(0.05, 0.05, 1, 6),
  petal: () => new ConeGeometry(0.3, 1, 5).scale(1, 1, 0.45).translate(0, 0.5, 0),
  orb: () => new IcosahedronGeometry(0.45, 1),
  fang: () => new ConeGeometry(0.2, 1, 4).translate(0, 0.5, 0),
  disc: () => new CylinderGeometry(0.5, 0.5, 0.07, 14),
  rune: () => new OctahedronGeometry(0.5, 0).scale(1, 0.35, 1),
  pane: () => new BoxGeometry(0.8, 1, 0.035),
  cog: () => new TorusGeometry(0.42, 0.13, 5, 10).rotateX(Math.PI / 2),
  bar: () => new BoxGeometry(0.1, 1, 0.1),
  block: () => new BoxGeometry(0.5, 0.5, 0.5),
  wedge: () => new ConeGeometry(0.35, 1, 4).scale(1.3, 1, 0.55).translate(0, 0.5, 0)
};

export const DETAIL_KINDS = Object.keys(BUILDERS);

/** Twist -> how the pieces move. Twists are the shader reads in sculpt-pure. */
const VERBS = {
  topple: 'rise',
  stamp: 'orbit',
  shear: 'scatter',
  crush: 'fall',
  drill: 'trail',
  seal: 'fall',
  converge: 'orbit',
  inhale: 'spiral',
  plant: 'fall',
  hinge: 'trail',
  late: 'trail',
  return: 'trail',
  drink: 'spiral',
  braid: 'spiral',
  pair: 'fall',
  flatten: 'trail',
  erase: 'scatter',
  snap: 'scatter',
  falsecut: 'trail',
  drop: 'fall',
  reverse: 'trail',
  clock: 'orbit',
  tangent: 'orbit',
  scan: 'trail'
};

export const DETAIL_MAX = 48;

const TAU = Math.PI * 2;
const GOLDEN = 0.61803398875;

const _up = new Vector3(0, 1, 0);
const _p = new Vector3();
const _u = new Vector3();
const _s = new Vector3();
const _q = new Quaternion();
const _qs = new Quaternion();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);

function ease(x) {
  return Easing.outCubic(saturate(x));
}

export class DetailLayer {
  /**
   * @param {string|import('three').BufferGeometry} kind  one of `DETAIL_KINDS`, or
   *   an authored piece (`create<Cast>PieceGeometry`), which the layer then owns
   * @param {import('three').Material} material
   * @param {number} [max]    instance budget, at most `DETAIL_MAX`
   */
  constructor(kind, material, max = DETAIL_MAX) {
    this.max = Math.min(DETAIL_MAX, max);
    this.geometry = kind?.isBufferGeometry ? kind : (BUILDERS[kind] ?? BUILDERS.chunk)();
    this.seedAttr = new InstancedBufferAttribute(new Float32Array(this.max), 1);
    this.geometry.setAttribute('aSeed', this.seedAttr);
    this.mesh = new InstancedMesh(this.geometry, material, this.max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.solid = !!material.userData?.solid;
    if (this.solid) {
      // Lit matter. SHAPED, not WORLD: the depth prepass would draw the pieces
      // unfolded; the shadow map uses the folded depth material instead.
      this.mesh.layers.set(LAYER.SHAPED);
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
      if (material.userData.depth) this.mesh.customDepthMaterial = material.userData.depth;
    } else {
      this.mesh.layers.set(LAYER.VFX);
    }
    this.mesh.renderOrder = 14;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.seed = 0;
    this.live = 0;
    this.positions = new Float32Array(this.max * 3);
    this.alive = new Uint8Array(this.max);
    this.hide();
  }

  /** New cast: fresh per-piece seeds. */
  reseed(seed) {
    this.seed = seed;
    for (let i = 0; i < this.max; i++) this.seedAttr.array[i] = this._rnd(i, 7);
    this.seedAttr.needsUpdate = true;
  }

  /** Deterministic per-piece random in [0, 1). */
  _rnd(i, k) {
    const x = Math.sin(this.seed * 12.9898 + i * 78.233 + k * 37.719) * 43758.5453;
    return x - Math.floor(x);
  }

  hide() {
    this.mesh.visible = false;
    this.live = 0;
    this.alive.fill(0);
  }

  /** World position of a piece that is currently drawn; false if it is not. */
  pointOf(i, out) {
    if (i >= this.max || !this.alive[i]) return false;
    out.set(this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]);
    return true;
  }

  /**
   * Lay every piece out for this frame.
   *
   * @param {string} twist  the cast's shader read, picks the motion
   * @param {boolean} zone  circle casts anchor on the centre, line casts on the line
   * @param {object} st     the pose the shaders read (centre, dir, side, grow, open...)
   * @param {object} c      live settings block
   * @param {number} time   seconds since the cast began
   */
  update(twist, zone, st, c, time) {
    const verb = VERBS[twist] ?? 'rise';
    const n = Math.max(0, Math.min(this.max, Math.round(c.detailCount)));
    const gate = st.fade > 0.02 && n > 0;
    this.mesh.visible = gate;
    if (!gate) {
      this.alive.fill(0);
      return;
    }
    if (this.solid) this.mesh.castShadow = this.mesh.material.userData.castShadow !== false;
    const reach = (zone ? st.radius : st.radius + st.thickness * 2) * c.detailSpread;
    const lift = c.detailLift;
    const open = saturate(st.open);
    const life = saturate(st.fade) * (1 - st.dissolve);
    const spin = st.spin * c.detailSpin;
    let drawn = 0;

    for (let i = 0; i < this.max; i++) {
      if (i >= n) {
        this.mesh.setMatrixAt(i, _zero);
        this.alive[i] = 0;
        continue;
      }
      const r1 = this._rnd(i, 1);
      const r2 = this._rnd(i, 2);
      const r3 = this._rnd(i, 3);
      const frac = (i + 0.5) / n;
      const s = zone ? 1 : frac;
      const appear = zone ? saturate((st.grow - frac * 0.5) * 2) : saturate((st.along - s) * 12 + 0.2);
      const size = c.detailSize * (1 + (r3 - 0.5) * 2 * c.detailSizeJitter);
      let scale = size * ease(appear) * life;
      const a = (r1 + frac * GOLDEN) * TAU;

      // Anchor: the circle centre, or the point on the line this piece stands at.
      if (zone) _p.copy(st.center);
      else _p.copy(st.origin).addScaledVector(st.dir, s * st.length);
      _u.copy(_up);
      let sy = scale;
      let roll = r2 * TAU;

      if (verb === 'rise') {
        const rr = reach * (0.3 + 0.7 * r2);
        const h = lift * (0.35 + 0.65 * r3) * ease(appear);
        _p.addScaledVector(st.side, Math.cos(a) * rr).addScaledVector(st.dir, Math.sin(a) * rr);
        _p.y = h * 0.5 * (1 + open * 0.2);
        _u.set(Math.cos(a) * open * (0.3 + r1) * 0.9, 1, Math.sin(a) * open * (0.3 + r1) * 0.9).normalize();
        sy = scale * (1 + h * 1.2);
        roll += time * 0.4;
      } else if (verb === 'fall') {
        const inward = twist === 'crush' || twist === 'drop' ? 0.5 : 0;
        const rr = reach * (0.55 + 0.4 * r2) * (1 - inward * open);
        const lane = zone ? a : (r1 < 0.5 ? 0 : Math.PI) + (r2 - 0.5) * 0.9;
        _p.addScaledVector(st.side, Math.cos(lane) * rr).addScaledVector(st.dir, Math.sin(lane) * rr * (zone ? 1 : 0.2));
        const drop = Easing.inQuad(saturate(appear));
        const top = lift * 2.2 + 2;
        const planted = twist === 'seal' ? 0.5 * scale : 0.3 * scale;
        _p.y = lerp(top, planted, drop);
        if (twist === 'seal') _u.copy(_up);
        else _u.set(0, -1, 0);
        sy = scale * (twist === 'seal' ? 1 + lift * 0.8 : 1.6);
        roll += time * 0.3;
      } else if (verb === 'orbit') {
        const pull = twist === 'converge' || twist === 'stamp' ? 0.55 : 0.15;
        const rr = reach * (0.85 + 0.15 * r2) * (1 - pull * open);
        const ang = a + spin * (1 + r3 * 0.3);
        const cs = Math.cos(ang);
        const sn = Math.sin(ang);
        _p.addScaledVector(st.side, cs * rr).addScaledVector(st.dir, sn * rr);
        _p.y = lift * 0.35 + 0.15 * Math.sin(time * 2 + r1 * 6);
        _u.set(0, 0, 0).addScaledVector(st.side, -sn).addScaledVector(st.dir, cs).normalize();
        sy = scale * 1.4;
      } else if (verb === 'spiral') {
        const inwards = twist !== 'braid';
        const rr = inwards ? reach * (1 - 0.85 * ease(open)) : reach * (0.25 + 0.75 * open);
        const h = lift * (frac * 0.9 + 0.1 * r2) * saturate(st.grow);
        const ang = a + spin * (1.2 + r3 * 0.5) + h * 2.2;
        const cs = Math.cos(ang);
        const sn = Math.sin(ang);
        _p.addScaledVector(st.side, cs * rr).addScaledVector(st.dir, sn * rr);
        _p.y = 0.2 + h;
        _u.set(0, 0.7, 0).addScaledVector(st.side, -sn * 0.7).addScaledVector(st.dir, cs * 0.7).normalize();
        sy = scale * 1.3;
      } else if (verb === 'scatter') {
        const throwT = ease(open);
        if (zone) {
          const rr = reach * throwT * (0.4 + 0.6 * r2);
          _p.addScaledVector(st.side, Math.cos(a) * rr).addScaledVector(st.dir, Math.sin(a) * rr);
          _u.set(0, 0, 0).addScaledVector(st.side, Math.cos(a)).addScaledVector(st.dir, Math.sin(a));
        } else {
          const side = r1 < 0.5 ? -1 : 1;
          _p.addScaledVector(st.side, side * reach * throwT * (0.25 + 0.75 * r2));
          _p.addScaledVector(st.dir, (r3 - 0.5) * reach * 0.6 * throwT);
          _u.copy(st.side).multiplyScalar(side);
        }
        _p.y = lift * 0.25 + lift * r3 * throwT * (1 - throwT) * 3;
        if (_u.lengthSq() < 1e-4) _u.copy(_up);
        else _u.normalize();
        sy = scale * 1.8;
      } else {
        // trail: strewn along the line behind the head, drifting in place.
        const wob = 0.6 + 0.4 * Math.sin(time * 2 + i);
        if (zone) {
          const rr = reach * Math.sqrt(r2);
          _p.addScaledVector(st.side, Math.cos(a) * rr).addScaledVector(st.dir, Math.sin(a) * rr);
        } else {
          _p.addScaledVector(st.side, (r1 - 0.5) * 2 * reach * 0.8);
        }
        _p.y = lift * (0.15 + 0.85 * r2) * wob;
        _u.copy(st.dir);
        sy = scale * 2;
      }

      // Settling: whatever is left when the cast fades sinks into the floor.
      _p.y -= st.dissolve * 0.5 * size;

      if (scale < 0.004) {
        this.mesh.setMatrixAt(i, _zero);
        this.alive[i] = 0;
        continue;
      }
      _q.setFromUnitVectors(_up, _u);
      _qs.setFromAxisAngle(_up, roll);
      _q.multiply(_qs);
      _s.set(scale, sy, scale);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.positions[i * 3] = _p.x;
      this.positions[i * 3 + 1] = _p.y;
      this.positions[i * 3 + 2] = _p.z;
      this.alive[i] = 1;
      drawn++;
    }
    this.live = drawn;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.dispose?.();
    this.geometry.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
