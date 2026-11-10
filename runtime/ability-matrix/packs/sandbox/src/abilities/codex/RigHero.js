import { Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { LAYER } from '../../core/Layers.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

/**
 * The hero rig of a pure-element Codex cast.
 *
 * Beside the instanced pieces, every cast owns one larger authored solid (see
 * `assets/codex/<Cast>Geometry.js`): the thing the spell *is*, standing at the
 * heart of a circle or riding the head of a line. The rig's own parts fold in
 * the detail vertex shader; what is left for the CPU is only where the whole
 * rig stands, how it faces, and how large it is. That is the archetype:
 *
 *   spire     thrust up through the floor, then left to lean and topple
 *   halo      held flat on the ground, turning, pulsing on the beat
 *   well      sunk low while it inhales, then stretched up the exhale
 *   cage      dropped from above, then closed inward
 *   lance     riding the head of the line, rolling about its own axis
 *   whip      riding the head, swept sideways as it travels
 *   volley    riding a ballistic arc, pitched along it
 *   pendulum  hinged at the hand, swung across the cast
 *
 * Zone rigs are authored on +Y; line rigs along +Z with +X to the side. A rig
 * whose geometry says `fit: 'ring'` is scaled in the ground plane to the
 * circle; a `'mass'` rig is scaled uniformly.
 *
 * ## Matter or energy
 *
 * The material decides (`material.userData.solid`, set by the cast's
 * `create<Cast>DetailMaterial`). A solid element's rig is lit matter: it goes
 * on `LAYER.SHAPED` — opaque, sun-lit, casting and receiving shadows, but kept
 * out of the depth prepass, which would draw the unfolded rest pose — and its
 * shadow comes from the material's own folded depth material. An energy rig
 * stays on `LAYER.VFX`.
 *
 * ## Framing
 *
 * `heroSize` is the floor of the scale, not the whole of it. A mass rig in a
 * circle grows until it spans `heroFit` of the radius each side; a line rig
 * grows until its cross-section is `heroMinSpan` metres (a body height) and
 * rides clear of the floor. Then everything is held under `heroMaxHeight`:
 * the scale is capped so the rig's top fits, and any rise, drop or arc is
 * lowered so it stays in frame.
 */

const UP = new Vector3(0, 1, 0);
const _x = new Vector3();
const _dir = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();
const _qy = new Quaternion();
const _qr = new Quaternion();

const ease = (x) => Easing.outCubic(saturate(x));

export class RigHero {
  /**
   * @param {import('three').BufferGeometry} geometry  from `create<Cast>HeroGeometry`
   * @param {import('three').Material} material
   * @param {string} arch  spire | halo | well | cage | lance | whip | volley | pendulum
   * @param {boolean} zone
   */
  constructor(geometry, material, arch, zone) {
    this.geometry = geometry;
    this.arch = arch;
    this.zone = zone;
    this.ring = geometry.userData.fit === 'ring';
    // Authored extents, measured once: what the framing rules scale against.
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    this.top = Math.max(0.05, b.max.y);
    this.bottom = b.min.y;
    this.halfWidth = Math.max(0.05, -b.min.x, b.max.x, -b.min.z, b.max.z);
    this.cross = Math.max(0.05, b.max.x - b.min.x, b.max.y - b.min.y);
    this.radial = Math.max(0.05, -b.min.x, b.max.x, -b.min.y, b.max.y);
    this.mesh = new Mesh(geometry, material);
    this.solid = !!material.userData?.solid;
    if (this.solid) {
      this.mesh.layers.set(LAYER.SHAPED);
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
      if (material.userData.depth) this.mesh.customDepthMaterial = material.userData.depth;
    } else {
      this.mesh.layers.set(LAYER.VFX);
    }
    // Above the body and voice sheets, so the solid reads through their glow.
    this.mesh.renderOrder = 14;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.live = false;
  }

  hide() {
    this.mesh.visible = false;
    this.live = false;
  }

  /**
   * Stand the rig for this frame.
   *
   * @param {object} st  the pose the shaders read (centre, origin, dir, side, grow, along, beat...)
   * @param {object} c   live settings block
   * @param {number} time seconds since the cast began
   */
  update(st, c, time) {
    const life = saturate(st.fade) * (1 - st.dissolve);
    const E = ease(st.grow);
    const O = ease(st.beat);
    const A = saturate(st.along);
    const size = Math.max(0.05, c.heroSize);
    const gate = life > 0.02 && c.heroOpacity > 0.01 && (this.zone ? st.grow > 0.02 : st.grow > 0.02 || A > 0.02);
    this.mesh.visible = gate;
    this.live = gate;
    if (!gate) return;
    if (this.solid) this.mesh.castShadow = this.mesh.material.userData.castShadow !== false;

    const mesh = this.mesh;
    const shrink = 0.25 + 0.75 * life;
    const maxH = Math.max(0.5, c.heroMaxHeight ?? 1e3);
    if (this.zone) this._zone(mesh, st, c, time, size, E, O, shrink, maxH);
    else this._line(mesh, st, c, time, size, E, O, A, shrink, maxH);
  }

  _zone(mesh, st, c, time, size, E, O, shrink, maxH) {
    const yaw = st.spin * c.heroSpin;
    const R = Math.max(0.2, st.radius * c.heroReach);
    // A mass rig grows to span heroFit of the circle; nothing grows past the height cap.
    let s = this.ring ? size : Math.max(size, ((c.heroFit ?? 0) * st.radius) / this.halfWidth);
    s = Math.min(s, maxH / this.top);
    const across = this.ring ? R : s;
    let sxz = across;
    let sy = s;
    let py = 0;
    let turn = yaw;
    switch (this.arch) {
      case 'spire':
        sy = s * (0.3 + 0.7 * E);
        py = -(1 - E) * c.heroLift * 0.5;
        break;
      case 'halo':
        sxz = across * (1 - 0.1 * O);
        py = 0.04 + c.heroLift * 0.05 * (1 + Math.sin(time * 2.4));
        turn = yaw * 1.6;
        break;
      case 'well':
        sxz = across * lerp(1, 0.55, O);
        sy = Math.min(s * (0.35 + 0.15 * E) * (1 + 2 * O), maxH / this.top);
        py = -c.heroLift * 0.3 * (1 - E) + c.heroLift * 0.4 * O;
        break;
      case 'cage':
        py = (1 - E) * c.heroLift;
        sxz = across * (1 - 0.3 * O);
        turn = yaw * 0.5;
        break;
      default:
        break;
    }
    // Keep the top in frame: a drop starts lower, a rise stops sooner.
    py = Math.min(py, Math.max(0, maxH - sy * this.top));
    mesh.position.set(st.center.x, py + 0.02, st.center.z);
    mesh.quaternion.setFromAxisAngle(UP, turn);
    mesh.scale.set(sxz * shrink, sy * shrink, sxz * shrink);
  }

  _line(mesh, st, c, time, size, E, O, A, shrink, maxH) {
    let yaw = 0;
    let roll = 0;
    let pitch = 0;
    let lift = 0;
    let stretch = 1;
    let at = st.center;
    switch (this.arch) {
      case 'lance':
        lift = c.heroLift * 0.45;
        roll = st.spin * c.heroSpin * 2.2;
        break;
      case 'whip':
        lift = c.heroLift * 0.5;
        yaw = lerp(-0.7, 0.7, A);
        roll = Math.sin(time * 5) * 0.12;
        stretch = 1 + 0.8 * A;
        break;
      case 'volley':
        lift = c.heroLift * 4 * A * (1 - A) + 0.3;
        pitch = Math.atan2(c.heroLift * 4 * (1 - 2 * A), Math.max(1, st.length));
        roll = st.spin * c.heroSpin;
        break;
      case 'pendulum':
        at = st.origin;
        lift = c.heroLift * 0.9;
        yaw = lerp(-1.1, 1.1, ease(A));
        break;
      default:
        break;
    }
    // Basis: z along the cast, x = up x dir, then yawed about the vertical.
    _dir.copy(st.dir);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, 1);
    _dir.normalize();
    _x.crossVectors(UP, _dir).normalize();
    _m.makeBasis(_x, UP, _dir);
    _q.setFromRotationMatrix(_m);
    _qy.setFromAxisAngle(UP, yaw);
    _q.premultiply(_qy);
    if (pitch) {
      _qr.setFromAxisAngle(_x.set(1, 0, 0), -pitch);
      _q.multiply(_qr);
    }
    if (roll) {
      _qr.setFromAxisAngle(_dir.set(0, 0, 1), roll);
      _q.multiply(_qr);
    }
    // At least a body height across; never taller than the cap allows.
    const rolls = this.arch === 'lance' || this.arch === 'volley';
    const below = rolls ? this.radial : Math.max(0, -this.bottom);
    const above = rolls ? this.radial : this.top;
    let base = Math.max(size, (c.heroMinSpan ?? 0) / this.cross);
    base = Math.min(base, maxH / Math.max(0.05, below + above));
    const s = base * (0.6 + 0.4 * E) * shrink;
    // Ride clear of the floor, and keep the top under the cap.
    const floor = s * below * 0.9;
    lift = Math.min(Math.max(lift, floor), Math.max(floor, maxH - s * above));
    mesh.position.set(at.x, lift + 0.02, at.z);
    mesh.quaternion.copy(_q);
    mesh.scale.set(s, s, s * stretch);
  }

  dispose() {
    this.geometry.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
