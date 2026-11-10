import { BufferAttribute, BufferGeometry, DynamicDrawUsage, PlaneGeometry, Sphere, Vector3 } from 'three';

/**
 * Geometry for Vector Chakram.
 *
 * ## The disc
 *
 * A toothed ring in the XZ plane, centred on the origin, unit outer radius
 * (the ability scales it). Built from a polar grid:
 *
 *   - **the profile** — the outer edge runs out to `1 + toothDepth` on every
 *     tooth and back in between. A tooth is a *sawtooth*, not a sine: a long
 *     ramp up to the tip and a short hook back down, all leaning the way the
 *     disc spins, which is what makes a chakram read as a cutting thing rather
 *     than a gear. `toothSharp` hardens the hook.
 *   - **the blade** — the faces are not flat: the thickness tapers from the
 *     full `thickness` at the hub ring to a knife edge on the rim over the
 *     outer `blade` of the radius, so the key light catches a bevel.
 *   - **the hub** — an inner wall at `inner`; the middle is open.
 *
 * Top, bottom, outer and inner walls are separate vertex runs so the creases
 * stay hard. Per vertex `aRing` carries
 *
 *   x  normalised radius — 0 on the inner wall, 1 on the tooth tips
 *   y  angle round the disc, 0..1
 *   z  tooth phase 0..1 (0 at the root of the ramp, 1 at the tip)
 *
 * which the material uses for its energy channel, brushed streaks and hot
 * tooth tips.
 */
export function createChakramGeometry({ teeth = 7, inner = 0.42, toothDepth = 0.22, toothSharp = 3, thickness = 0.08, blade = 0.35 } = {}) {
  const T = Math.max(3, Math.round(teeth));
  const per = 10; // angular samples per tooth
  const A = T * per; // around
  const RS = 6; // radial steps across a face

  const outerAt = (a) => {
    // a in 0..1 around; tooth phase k in 0..1.
    const k = (a * T) % 1;
    // Long ramp up, hard hook down over the last 1/(sharp+1).
    const hook = 1 / (1 + Math.max(0.2, toothSharp));
    const ramp = k < 1 - hook ? Math.pow(k / (1 - hook), 1.4) : 1 - (k - (1 - hook)) / hook;
    return { r: 1 + toothDepth * ramp, k: k < 1 - hook ? k / (1 - hook) : 1 - (k - (1 - hook)) / hook };
  };

  const pos = [];
  const ring = [];
  const index = [];
  const halfT = thickness * 0.5;
  const rTip = 1 + toothDepth;

  const faceY = (r, sign) => {
    // Full thickness to (1 − blade), tapering to a knife edge at the rim.
    const start = 1 - blade;
    const s = r <= start ? 0 : Math.min(1, (r - start) / Math.max(1e-3, rTip - start));
    return sign * halfT * (1 - s * 0.94);
  };

  /* ---- top and bottom faces ---- */
  for (const sign of [1, -1]) {
    const base = pos.length / 3;
    for (let j = 0; j <= A; j++) {
      const a = j / A;
      const ang = a * Math.PI * 2;
      const o = outerAt(a % 1);
      for (let i = 0; i <= RS; i++) {
        const f = i / RS;
        const r = inner + (o.r - inner) * f;
        pos.push(Math.cos(ang) * r, faceY(r, sign), Math.sin(ang) * r);
        ring.push((r - inner) / (rTip - inner), a, o.k);
      }
    }
    for (let j = 0; j < A; j++) {
      for (let i = 0; i < RS; i++) {
        const a = base + j * (RS + 1) + i;
        const b = a + RS + 1;
        if (sign > 0) index.push(a, b, a + 1, a + 1, b, b + 1);
        else index.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }

  /* ---- outer wall (the blade edge — thin) and inner wall ---- */
  for (const outer of [true, false]) {
    const base = pos.length / 3;
    for (let j = 0; j <= A; j++) {
      const a = j / A;
      const ang = a * Math.PI * 2;
      const o = outerAt(a % 1);
      const r = outer ? o.r : inner;
      const y = outer ? faceY(r, 1) : halfT;
      pos.push(Math.cos(ang) * r, y, Math.sin(ang) * r);
      ring.push(outer ? (r - inner) / (rTip - inner) : 0, a, o.k);
      pos.push(Math.cos(ang) * r, -y, Math.sin(ang) * r);
      ring.push(outer ? (r - inner) / (rTip - inner) : 0, a, o.k);
    }
    for (let j = 0; j < A; j++) {
      const a = base + j * 2;
      const b = a + 2;
      if (outer) index.push(a, a + 1, b, a + 1, b + 1, b);
      else index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('aRing', new BufferAttribute(new Float32Array(ring), 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A flat quad in XZ, −1..1, for the smear and the bank sigils. */
export function createChakramPlaneGeometry() {
  return new PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
}

/**
 * The trail ribbon: a fixed-capacity polyline of the disc's recent positions,
 * rewritten in place every frame. Same centre-line layout as Chain Arc's bolt
 * (a left and right vertex *on* the line, swung apart in the vertex stage),
 * but one run only and with each point's **age** instead of a brightness.
 *
 *   position  the point, world
 *   aTangent  the path direction there
 *   aCoord    x side −1/+1 · y age 0..1 (0 = at the disc) · z live 0/1
 */
export const MAX_TRAIL = 72;
/** Capacity of the floor path (the scored line of the whole throw). */
export const MAX_PATH = 160;

const _t = new Vector3();

export class ChakramTrailRibbon {
  /**
   * @param {number} [capacity] samples kept (default `MAX_TRAIL`)
   * @param {boolean} [useHead] true: vertex 0 is the live disc (the air
   *   trail); false: the ribbon is only the recorded samples, each with its
   *   real age (the floor path, which must age out at its newest end too).
   */
  constructor(capacity = MAX_TRAIL, useHead = true) {
    this.cap = Math.max(4, capacity | 0);
    this.useHead = useHead;
    const CAP = this.cap;
    const vertices = CAP * 2;
    this.positions = new Float32Array(vertices * 3);
    this.tangents = new Float32Array(vertices * 3);
    this.coords = new Float32Array(vertices * 3);

    const geometry = new BufferGeometry();
    this.positionAttribute = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage);
    this.tangentAttribute = new BufferAttribute(this.tangents, 3).setUsage(DynamicDrawUsage);
    this.coordAttribute = new BufferAttribute(this.coords, 3).setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttribute);
    geometry.setAttribute('aTangent', this.tangentAttribute);
    geometry.setAttribute('aCoord', this.coordAttribute);

    const index = new Uint16Array((CAP - 1) * 6);
    let k = 0;
    for (let i = 0; i < CAP - 1; i++) {
      const v = i * 2;
      index[k++] = v;
      index[k++] = v + 1;
      index[k++] = v + 2;
      index[k++] = v + 1;
      index[k++] = v + 3;
      index[k++] = v + 2;
    }
    geometry.setIndex(new BufferAttribute(index, 1));
    geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
    this.geometry = geometry;

    /** Ring buffer of samples: x, y, z, birth time. */
    this.samples = new Float32Array(CAP * 4);
    this.head = 0;
    this.count = 0;
    this.clear();
  }

  clear() {
    this.head = 0;
    this.count = 0;
    this.coords.fill(0);
    this.coordAttribute.needsUpdate = true;
  }

  /** Record the disc's position at `time` (seconds). */
  push(p, time) {
    const i = this.head;
    this.samples[i * 4] = p.x;
    this.samples[i * 4 + 1] = p.y;
    this.samples[i * 4 + 2] = p.z;
    this.samples[i * 4 + 3] = time;
    this.head = (this.head + 1) % this.cap;
    this.count = Math.min(this.cap, this.count + 1);
  }

  /** The newest sample, into `out`. */
  last(out) {
    const i = (this.head - 1 + this.cap) % this.cap;
    return out.set(this.samples[i * 4], this.samples[i * 4 + 1], this.samples[i * 4 + 2]);
  }

  /**
   * Write the buffers, newest first. `head` is the live disc position, which
   * leads the newest sample so the trail is welded to the disc every frame.
   */
  build(head, time, life) {
    const pos = this.positions;
    const tan = this.tangents;
    const crd = this.coords;
    const n = this.count;
    const L = Math.max(1e-3, life);
    const CAP = this.cap;
    const off = this.useHead ? 0 : 1;

    for (let j = 0; j < CAP; j++) {
      // With a head, j = 0 is the disc itself; j ≥ 1 walks back through the samples.
      let x;
      let y;
      let z;
      let age;
      let live = 1;
      const s = j + off;
      if (this.useHead && j === 0) {
        x = head.x;
        y = head.y;
        z = head.z;
        age = 0;
      } else if (s <= n && s <= CAP) {
        const i = (this.head - s + CAP * 2) % CAP;
        x = this.samples[i * 4];
        y = this.samples[i * 4 + 1];
        z = this.samples[i * 4 + 2];
        age = (time - this.samples[i * 4 + 3]) / L;
        if (age >= 1) live = 0;
      } else {
        // Collapse the unused tail onto the oldest point.
        const k = Math.max(0, Math.min(n, CAP - 1));
        const i = (this.head - k + CAP * 2) % CAP;
        x = k === 0 ? head.x : this.samples[i * 4];
        y = k === 0 ? head.y : this.samples[i * 4 + 1];
        z = k === 0 ? head.z : this.samples[i * 4 + 2];
        age = 1;
        live = 0;
      }

      for (let side = 0; side < 2; side++) {
        const v = j * 2 + side;
        pos[v * 3] = x;
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = z;
        crd[v * 3] = side === 0 ? -1 : 1;
        crd[v * 3 + 1] = Math.min(1, age);
        crd[v * 3 + 2] = live;
      }
    }

    // Tangents by central difference along the written line.
    for (let j = 0; j < CAP; j++) {
      const a = Math.max(0, j - 1) * 2;
      const b = Math.min(CAP - 1, j + 1) * 2;
      _t.set(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
      for (let side = 0; side < 2; side++) {
        const v = j * 2 + side;
        tan[v * 3] = _t.x;
        tan[v * 3 + 1] = _t.y;
        tan[v * 3 + 2] = _t.z;
      }
    }

    this.positionAttribute.needsUpdate = true;
    this.tangentAttribute.needsUpdate = true;
    this.coordAttribute.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
  }
}
