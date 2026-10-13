import { BufferAttribute, BufferGeometry, DynamicDrawUsage, PlaneGeometry, Sphere, SphereGeometry, Vector3 } from 'three';

/**
 * Procedural geometry for Ball Lightning.
 *
 *   - `createOrbGeometry` — a dense unit sphere; the vertex stage displaces it.
 *   - `createTrackGeometry` — a unit floor quad; the track shader works out
 *     metres from its uv, the ability places and stretches it along the line.
 *   - `createQuadGeometry` — a unit quad for camera-facing sprites (the hot
 *     core, the distortion proxy).
 *   - `BoltRibbons` — every bolt of the cast in one buffer: `slots` polylines
 *     of `points` points each, two vertices per point. The ability writes the
 *     polylines in place (`writeBolt`) every frame; the shader swings each
 *     vertex across the view, so a bolt is a flat ribbon that always faces the
 *     camera. Fixed size: nothing is allocated after construction.
 */

export const BOLT_SLOTS = 40;
export const BOLT_POINTS = 18;

export function createOrbGeometry() {
  return new SphereGeometry(1, 96, 64);
}

export function createTrackGeometry() {
  const geometry = new PlaneGeometry(1, 1, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function createQuadGeometry() {
  return new PlaneGeometry(1, 1, 1, 1);
}

const _t = new Vector3();

/**
 * Per vertex: `position` (the polyline point), `aTangent` (its direction),
 * `aCoord` = (side ±1, along 0..1, width scale, brightness),
 * `aState` = (grow 0..1 — how far out the strike has raced, seed), `aBolt` (slot).
 */
export class BoltRibbons {
  constructor(slots = BOLT_SLOTS, points = BOLT_POINTS) {
    this.slots = slots;
    this.points = points;
    const verts = slots * points * 2;
    this.position = new Float32Array(verts * 3);
    this.tangent = new Float32Array(verts * 3);
    this.coord = new Float32Array(verts * 4);
    this.bolt = new Float32Array(verts);
    this.state = new Float32Array(verts * 2);
    const index = new Uint16Array(slots * (points - 1) * 6);

    let k = 0;
    for (let s = 0; s < slots; s++) {
      for (let p = 0; p < points; p++) {
        for (let side = 0; side < 2; side++) {
          const v = (s * points + p) * 2 + side;
          this.coord[v * 4] = side === 0 ? -1 : 1;
          this.coord[v * 4 + 1] = p / (points - 1);
          this.coord[v * 4 + 2] = 1;
          this.coord[v * 4 + 3] = 0;
          this.bolt[v] = s;
        }
        if (p < points - 1) {
          const v = (s * points + p) * 2;
          index[k++] = v;
          index[k++] = v + 1;
          index[k++] = v + 2;
          index[k++] = v + 1;
          index[k++] = v + 3;
          index[k++] = v + 2;
        }
      }
    }

    const geometry = new BufferGeometry();
    this.attrPosition = new BufferAttribute(this.position, 3).setUsage(DynamicDrawUsage);
    this.attrTangent = new BufferAttribute(this.tangent, 3).setUsage(DynamicDrawUsage);
    this.attrCoord = new BufferAttribute(this.coord, 4).setUsage(DynamicDrawUsage);
    this.attrState = new BufferAttribute(this.state, 2).setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.attrPosition);
    geometry.setAttribute('aTangent', this.attrTangent);
    geometry.setAttribute('aCoord', this.attrCoord);
    geometry.setAttribute('aState', this.attrState);
    geometry.setAttribute('aBolt', new BufferAttribute(this.bolt, 1));
    geometry.setIndex(new BufferAttribute(index, 1));
    geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
    this.geometry = geometry;
  }

  /**
   * Write one bolt from a polyline of exactly `points` xyz triples.
   *
   * @param {number} slot
   * @param {Float32Array} pts xyz × points
   * @param {number} width width scale (the shader multiplies the glow width)
   * @param {number} bright 0 hides the slot's vertices
   * @param {number} taper how much the width thins toward the tip, 0..1
   * @param {number} grow 0..1 how far along it the strike has raced
   * @param {number} seed per-strike dice for the shader
   */
  writeBolt(slot, pts, width, bright, taper, grow, seed) {
    const n = this.points;
    for (let p = 0; p < n; p++) {
      const a = Math.max(0, p - 1);
      const b = Math.min(n - 1, p + 1);
      _t.set(pts[b * 3] - pts[a * 3], pts[b * 3 + 1] - pts[a * 3 + 1], pts[b * 3 + 2] - pts[a * 3 + 2]);
      if (_t.lengthSq() < 1e-10) _t.set(0, 1, 0);
      _t.normalize();
      const along = p / (n - 1);
      const w = width * (1 - taper * along * along);
      for (let side = 0; side < 2; side++) {
        const v = (slot * n + p) * 2 + side;
        this.position[v * 3] = pts[p * 3];
        this.position[v * 3 + 1] = pts[p * 3 + 1];
        this.position[v * 3 + 2] = pts[p * 3 + 2];
        this.tangent[v * 3] = _t.x;
        this.tangent[v * 3 + 1] = _t.y;
        this.tangent[v * 3 + 2] = _t.z;
        this.coord[v * 4 + 2] = w;
        this.coord[v * 4 + 3] = bright;
        this.state[v * 2] = grow;
        this.state[v * 2 + 1] = seed;
      }
    }
  }

  /** Hide one slot. */
  clear(slot) {
    const n = this.points;
    for (let p = 0; p < n; p++) {
      for (let side = 0; side < 2; side++) this.coord[((slot * n + p) * 2 + side) * 4 + 3] = 0;
    }
  }

  commit() {
    this.attrPosition.needsUpdate = true;
    this.attrTangent.needsUpdate = true;
    this.attrCoord.needsUpdate = true;
    this.attrState.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
  }
}
