// The tailor's form: a parametric mannequin measured from the wearer's own bind-pose joints.
//
// Garments are not sculpted freehand. Each is a region of the form's surface (the trunk, an arm or a leg) pushed
// out by an offset, so a plate always sits on the shirt it is strapped over and a sleeve always ends on its arm.
// The form also answers "which bones move this point", so every garment bends with the rig.
import { Vector3 } from 'three';
import { clamp, curve, lerp, smooth, TAU } from './kernel.js';

const FRONT = new Vector3(0, 0, 1);
const pow = (value, e) => Math.sign(value) * Math.abs(value) ** e;

/**
 * A limb as a chain of two bones. t runs 0..1 down the first bone and 1..2 down the second; it may run a little
 * past either end. phi is the angle around the limb: 0 faces forward, +90 degrees faces away from the body.
 */
class Chain {
  constructor(points, bones, radius, root) {
    this.points = points; this.bones = bones; this.radius = radius; this.root = root;
    this.seg = [0, 1].map((i) => {
      const along = new Vector3().subVectors(points[i + 1], points[i]), length = along.length(); along.normalize();
      const Y = along.clone().negate(), Z = FRONT.clone().addScaledVector(Y, -FRONT.dot(Y)).normalize(), X = new Vector3().crossVectors(Y, Z);
      return { along, length, X, Y, Z };
    });
    this.length = this.seg[0].length + this.seg[1].length;
    this.band = .05; // metres either side of the middle joint over which the two bones share a vertex
  }
  metres(t) { return t <= 1 ? t * this.seg[0].length : this.seg[0].length + (t - 1) * this.seg[1].length; }
  /** t that lies `metres` further down the limb than t0 */
  step(t0, metres) { const m = this.metres(t0) + metres; return m <= this.seg[0].length ? m / this.seg[0].length : 1 + (m - this.seg[0].length) / this.seg[1].length; }
  blend(t) { const m = this.metres(t) - this.seg[0].length; return smooth(-this.band, this.band, m); }
  centre(t, out = new Vector3()) {
    const [a, b] = this.seg, m = this.metres(t) - a.length, r = this.band;
    if (m <= -r) return out.copy(this.points[1]).addScaledVector(a.along, m);
    if (m >= r) return out.copy(this.points[1]).addScaledVector(b.along, m);
    // Round the corner at the joint so cloth does not crease to a point.
    const s = (m + r) / (2 * r), p0 = this.points[1].clone().addScaledVector(a.along, -r), p2 = this.points[1].clone().addScaledVector(b.along, r);
    return out.copy(p0).multiplyScalar((1 - s) * (1 - s)).addScaledVector(this.points[1], 2 * s * (1 - s)).addScaledVector(p2, s * s);
  }
  frame(t) {
    const f = this.blend(t), [a, b] = this.seg;
    const along = a.along.clone().lerp(b.along, f).normalize();
    const Z = a.Z.clone().lerp(b.Z, f); Z.addScaledVector(along, -Z.dot(along)).normalize();
    const X = new Vector3().crossVectors(along.clone().negate(), Z);
    return { along, X, Z };
  }
  point(t, phi, r, out = new Vector3()) {
    const { X, Z } = this.frame(t);
    return this.centre(t, out).addScaledVector(Z, Math.cos(phi) * r).addScaledVector(X, Math.sin(phi) * r);
  }
  skin(t) {
    const f = this.blend(t), pairs = [[this.bones[0], 1 - f], [this.bones[1], f]];
    if (this.root) { const k = smooth(this.root.to, this.root.from, this.metres(t)) * this.root.weight; if (k > 0) { pairs[0][1] *= 1 - k; pairs[1][1] *= 1 - k; pairs.push([this.root.bone, k]); } }
    return pairs;
  }
  /**
   * place() map that wraps a flat shape onto the limb: the shape's x runs around the limb (metres of arc), y runs
   * up the limb, z stands off the surface. The shape's origin sits at (t0, phi0), `off` above the limb's radius.
   */
  wrap(t0, phi0, off = 0, radius = this.radius) {
    return (p) => { const t = this.step(t0, -p.y), r = radius(t) + off; return this.point(t, phi0 + p.x / Math.max(.02, r), r + p.z); };
  }
}

export function makeForm(rig, build = {}) {
  const J = rig.J, S = J['upperarm.L'].x, k = S / .182;
  // `thigh`, `calf`, `upperArm` and `forearm` scale one half of a limb on top of `leg` / `arm`; `seat` rounds the back of the hips.
  const b = { width: 1, depth: 1, belly: 0, bust: 0, hips: 1, waist: 1, arm: 1, leg: 1, neck: 1, shoulder: 1, thigh: 1, calf: 1, upperArm: 1, forearm: 1, seat: 1, ...build };
  const spineZ = curve([[J.hips.y, J.hips.z], [J.spine.y, J.spine.z], [J.spine1.y, J.spine1.z], [J.spine2.y, J.spine2.z], [J.neck.y, J.neck.z]]);
  // Heights of the trunk's landmarks, bottom to top.
  const Y = {
    crotch: J['thigh.L'].y - .095 * k, hip: J['thigh.L'].y, belt: J.hips.y + .07 * k, waist: J.spine.y + .06 * k, ribs: J.spine1.y + .04 * k,
    chest: J.spine2.y + .02 * k, armpit: J['upperarm.L'].y - .03 * k, shoulder: J['upperarm.L'].y + .03 * k, base: J.neck.y + .018 * k, neck: J.neck.y + .07 * k,
  };
  const belly = (y) => b.belly * Math.exp(-(((y - (J.spine.y + .02)) / (.13 * k)) ** 2));
  const bust = (y) => b.bust * Math.exp(-(((y - (J.spine2.y - .01)) / (.07 * k)) ** 2));
  const w = b.width * k, d = b.depth * k;
  // Lean, athletic default: wide chest, narrow waist and hips. A recipe's `build` scales from here.
  const half = curve([[Y.crotch, .108 * w * b.hips], [Y.hip, .162 * w * b.hips], [Y.belt, .148 * w * b.waist], [Y.waist, .136 * w * b.waist], [Y.ribs, .162 * w], [Y.chest, .186 * w], [Y.armpit, Math.max(.184 * w, S * .99)], [Y.shoulder, S * .86 * b.shoulder], [Y.base, .07 * k * b.neck], [Y.neck, .055 * k * b.neck]]);
  const frontK = curve([[Y.crotch, .066 * d], [Y.hip, .094 * d], [Y.belt, .096 * d], [Y.waist, .092 * d], [Y.ribs, .108 * d], [Y.chest, .122 * d], [Y.armpit, .108 * d], [Y.shoulder, .074 * d], [Y.base, .058 * k * b.neck], [Y.neck, .054 * k * b.neck]]);
  const backK = curve([[Y.crotch, .076 * d], [Y.hip, .108 * d * b.hips], [Y.belt, .098 * d], [Y.waist, .09 * d], [Y.ribs, .1 * d], [Y.chest, .112 * d], [Y.armpit, .11 * d], [Y.shoulder, .088 * d], [Y.base, .068 * k * b.neck], [Y.neck, .058 * k * b.neck]]);
  const N = 2.5, E = 2 / N;
  // The bust is two forms either side of the sternum, not a band: the section carries a little of it everywhere
  // (so cloth bridges the gap) and at() adds the rest where the breasts are.
  const section = (y) => ({ a: half(y), f: frontK(y) + belly(y) + bust(y) * .45, b: backK(y) * (1 + (b.seat - 1) * Math.exp(-(((y - Y.hip) / (.09 * k)) ** 2))), c: spineZ(y) });
  const lobes = (y, u) => bust(y) * .9 * Math.exp(-(((Math.abs(u) - .5) / .3) ** 2));

  const trunk = {
    Y, section, bottom: Y.crotch, top: Y.neck,
    /** Point on the trunk at height y, angle th (0 front, +90 degrees the wearer's left), pushed out by `off`. */
    at(y, th, off = 0, out = new Vector3()) {
      const s = section(y), sn = Math.sin(th), cs = Math.cos(th);
      out.set(s.a * pow(sn, E), y, s.c + (cs >= 0 ? s.f : s.b) * pow(cs, E));
      if (b.bust && cs > 0) out.z += lobes(y, pow(sn, E)) * cs;
      if (off) {
        // Outward normal of the section: the gradient of the superellipse, lifted by the trunk's slope.
        const depth = cs >= 0 ? s.f : s.b, nx = pow((out.x) / s.a, N - 1) / s.a, nz = pow((out.z - s.c) / depth, N - 1) / depth, len = Math.hypot(nx, nz) || 1;
        const e = .004, s2 = section(y + e), slope = ((s.a - s2.a) * Math.abs(sn) + ((cs >= 0 ? s.f - s2.f : s.b - s2.b)) * Math.abs(cs)) / e, up = clamp(slope, -2.5, 2.5);
        const scale = off / Math.hypot(1, up);
        out.x += nx / len * scale; out.z += nz / len * scale; out.y += up * scale;
      }
      return out;
    },
    /** Horizontal distance from the spine to the surface: turns metres of arc into an angle. */
    rho(y, th) { const s = section(y); return Math.hypot(s.a * pow(Math.sin(th), E), (Math.cos(th) >= 0 ? s.f : s.b) * pow(Math.cos(th), E)); },
    inside(x, y, z, pad = 0) { const s = section(y), depth = (z >= s.c ? s.f : s.b) + pad; return (Math.abs(x) / (s.a + pad)) ** N + (Math.abs(z - s.c) / depth) ** N <= 1; },
    /** Height of the trunk's upper surface over the point (x, z); -Infinity where the trunk is not below. */
    over(x, z, pad = () => 0) {
      let low = Y.chest, high = Y.neck;
      if (!this.inside(x, low, z, pad(low))) return -Infinity;
      for (let i = 0; i < 14; i++) { const mid = (low + high) / 2; if (this.inside(x, mid, z, pad(mid))) low = mid; else high = mid; }
      return low;
    },
    skin(p) {
      const chain = [['hips', J.hips.y], ['spine', J.spine.y], ['spine1', J.spine1.y], ['spine2', J.spine2.y]], pairs = [];
      if (p.y <= chain[0][1]) pairs.push(['hips', 1]);
      else if (p.y >= chain[3][1]) pairs.push(['spine2', 1]);
      else for (let i = 0; i < 3; i++) if (p.y <= chain[i + 1][1]) { const f = smooth(chain[i][1], chain[i + 1][1], p.y); pairs.push([chain[i][0], 1 - f], [chain[i + 1][0], f]); break; }
      const neck = smooth(J.neck.y - .015, J.neck.y + .05, p.y);
      const side = p.x >= 0 ? 'L' : 'R', girdle = smooth(S * .45, S * .95, Math.abs(p.x)) * smooth(J.spine2.y + .02, J['upperarm.L'].y - .03, p.y) * .55 * (1 - neck);
      const legs = smooth(J['thigh.L'].y + .02, Y.crotch, p.y) * .5;
      for (const pair of pairs) pair[1] *= (1 - neck) * (1 - girdle) * (1 - legs);
      if (neck > 0) pairs.push(['neck', neck]);
      if (girdle > 0) pairs.push([`shoulder.${side}`, girdle]);
      if (legs > 0) { const left = smooth(-.04, .04, p.x); pairs.push(['thigh.L', legs * left], ['thigh.R', legs * (1 - left)]); }
      return pairs;
    },
    /** place() map wrapping a flat shape around the trunk: x is metres of arc, y is height, z stands off. */
    wrap(y0, th0, off = 0) { return (p) => this.at(y0 + p.y, th0 + p.x / Math.max(.03, this.rho(y0 + p.y, th0)), off + p.z); },
  };

  const armR = curve([[-.25, .05], [0, .058], [.3, .054], [.55, .05], [.85, .043], [1, .041], [1.22, .046], [1.6, .039], [2, .031], [2.2, .03]].map(([t, r]) => [t, r * k * b.arm * (t < .9 ? b.upperArm : t > 1.1 ? b.forearm : (b.upperArm + b.forearm) / 2)]));
  const legR = curve([[-.2, .082], [0, .086], [.3, .08], [.7, .064], [1, .052], [1.2, .049], [1.36, .051], [1.7, .037], [2, .032], [2.2, .032]].map(([t, r]) => [t, r * k * b.leg * (t < .8 ? b.thigh : t > 1.15 && t < 1.8 ? b.calf : 1)]));
  // Muscle: how far the surface of a bare limb swells beyond its tube at (t, phi). Garments ignore it; skin uses it.
  const bump = (t, t0, w) => Math.exp(-(((t - t0) / w) ** 2));
  const armMuscle = (t, phi) => (.012 * bump(t, .1, .2) * Math.max(0, Math.sin(phi)) ** .7                 // deltoid, outside of the shoulder
    + .009 * bump(t, .5, .2) * Math.max(0, Math.cos(phi)) + .006 * bump(t, .55, .22) * Math.max(0, -Math.cos(phi))   // biceps in front, triceps behind
    + .007 * bump(t, 1.2, .16) * Math.max(0, Math.sin(phi + .5)) - .003 * bump(t, .82, .08)) * k * b.arm;          // forearm extensor, pinch above the elbow
  const legMuscle = (t, phi) => (.01 * bump(t, .4, .3) * Math.max(0, Math.cos(phi - .3)) + .008 * bump(t, 1.3, .15) * Math.max(0, -Math.cos(phi))
    + .004 * bump(t, 1, .05) * Math.max(0, Math.cos(phi))) * k * b.leg;                                            // quadriceps, calf, kneecap
  const arm = new Chain([J['upperarm.L'], J['forearm.L'], J['hand.L']], ['upperarm.L', 'forearm.L'], armR, { bone: 'shoulder.L', from: -.06, to: .05, weight: .5 });
  const leg = new Chain([J['thigh.L'], J['shin.L'], J['foot.L']], ['thigh.L', 'shin.L'], legR, { bone: 'hips', from: -.03, to: .12, weight: .55 });

  // Foot frame: heel on the ground under the ankle, pointing where the toe bone points.
  const ankle = J['foot.L'], toe = J['toe.L'];
  const forward = new Vector3(toe.x - ankle.x, 0, toe.z - ankle.z).normalize(), sideways = new Vector3(forward.z, 0, -forward.x);
  const foot = {
    ankle, toe, forward, sideways, heel: -.085 * k, tip: toe.clone().sub(ankle).dot(forward) + .1 * k,
    /** x across the foot (outward positive), y up from the ground, z forward from the ankle */
    at(x, y, z, out = new Vector3()) { return out.set(ankle.x, 0, ankle.z).addScaledVector(sideways, x).addScaledVector(forward, z).setY(y); },
    skin(p) {
      const shin = smooth(ankle.y - .015, ankle.y + .06, p.y), ahead = (p.x - ankle.x) * forward.x + (p.z - ankle.z) * forward.z;
      const toes = (1 - shin) * smooth(toe.clone().sub(ankle).dot(forward) - .03, toe.clone().sub(ankle).dot(forward) + .03, ahead);
      return [['shin.L', shin], ['foot.L', 1 - shin - toes], ['toe.L', toes]];
    },
  };

  /** Height of the body's upper surface over (x, z): what a cloth laid over the shoulders rests on. */
  const samples = [];
  for (let i = 0; i <= 26; i++) { const t = -.22 + i / 26 * 1.5; samples.push({ c: arm.centre(t), r: armR(t) }); }
  const over = (x, z, trunkPad, armPad) => {
    let best = trunk.over(x, z, trunkPad);
    for (const side of [1, -1]) for (const s of samples) {
      const r = s.r + armPad, dx = x - s.c.x * side, dz = z - s.c.z, q = r * r - dx * dx - dz * dz;
      if (q > 0) best = Math.max(best, s.c.y + Math.sqrt(q));
    }
    return best;
  };
  arm.muscle = armMuscle; leg.muscle = legMuscle;
  return { J, S, k, build: b, trunk, arm, leg, foot, over, spineZ };
}

export { TAU, lerp };
