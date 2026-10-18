import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Comet Harpoon — procedural meshes.
 *
 *  - **the harpoon** is the one real model: built here once in object space,
 *    tip at the origin pointing down +Z, shaft running back along −Z, so the
 *    ability only has to place and turn it. A four-bladed broadhead, two
 *    swept-back barbs, a banded shaft and an eye at the butt for the tether.
 *    `aPart` tags each vertex (0 shaft · 1 head · 2 barb · 3 eye) and `aAlong`
 *    carries its distance back from the tip, so the shader can light the head
 *    hot and dissolve it butt-first without knowing anything else.
 *  - everything else (tails, tether, petals, crater) is a parameter-space
 *    grid the vertex stage bends from uniforms.
 */

const HUGE = new Sphere(new Vector3(), 1e4);

/**
 * The harpoon. Dimensions are baked (they are the *model*); the ability
 * scales the whole mesh with `harpoonScale`.
 *
 * @param {object} [o]
 * @param {number} [o.shaftLength]  metres, butt to the base of the head
 * @param {number} [o.shaftRadius]
 * @param {number} [o.headLength]
 * @param {number} [o.headWidth]
 */
export function createHarpoonGeometry({ shaftLength = 2.1, shaftRadius = 0.035, headLength = 0.5, headWidth = 0.17 } = {}) {
  const pos = [];
  const part = [];
  const along = [];

  const tri = (ax, ay, az, bx, by, bz, cx, cy, cz, p) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    part.push(p, p, p);
    along.push(-az, -bz, -cz);
  };

  /* the shaft: a 12-sided tube with three raised bands */
  const sides = 12;
  const z0 = -headLength * 0.85;
  const z1 = z0 - shaftLength;
  const rings = [];
  const steps = 18;
  for (let j = 0; j <= steps; j++) {
    const t = j / steps;
    const z = z0 + (z1 - z0) * t;
    // Bands at a quarter, half and three-quarters of the shaft.
    const band = Math.max(0, 1 - Math.abs(((t * 4) % 1) - 0.5) * 12) * (t > 0.1 && t < 0.9 ? 1 : 0);
    rings.push({ z, r: shaftRadius * (1 + 0.45 * band) * (j === 0 ? 1.3 : 1) });
  }
  for (let j = 0; j < steps; j++) {
    const A = rings[j];
    const B = rings[j + 1];
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const ax = Math.cos(a0);
      const ay = Math.sin(a0);
      const bx = Math.cos(a1);
      const by = Math.sin(a1);
      tri(ax * A.r, ay * A.r, A.z, ax * B.r, ay * B.r, B.z, bx * A.r, by * A.r, A.z, 0);
      tri(bx * A.r, by * A.r, A.z, ax * B.r, ay * B.r, B.z, bx * B.r, by * B.r, B.z, 0);
    }
  }

  /* the broadhead: four diamond blades round the axis, each a thin wedge */
  const hl = headLength;
  const hw = headWidth;
  const th = 0.012;
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    // Perpendicular, for the wedge's thickness.
    const px = -uy * th;
    const py = ux * th;
    const wx = ux * hw;
    const wy = uy * hw;
    const zw = -hl * 0.55; // widest point
    const zb = -hl; // base, where it meets the shaft collar
    // two faces of the wedge, tip → wide → base, edge at (wx, wy)
    tri(0, 0, 0, wx, wy, zw, px, py, zw * 0.6, 1);
    tri(px, py, zw * 0.6, wx, wy, zw, px, py, zb, 1);
    tri(0, 0, 0, -px, -py, zw * 0.6, wx, wy, zw, 1);
    tri(-px, -py, zw * 0.6, -px, -py, zb, wx, wy, zw, 1);
  }

  /* the barbs: two swept-back hooks below the head */
  for (let k = 0; k < 2; k++) {
    const s = k === 0 ? 1 : -1;
    const zb = -hl * 0.95;
    const r = shaftRadius * 1.2;
    tri(0, s * r, zb, 0, s * hw * 1.25, zb - 0.32, 0.012, s * r, zb - 0.16, 2);
    tri(0, s * r, zb, -0.012, s * r, zb - 0.16, 0, s * hw * 1.25, zb - 0.32, 2);
    tri(0.012, s * r, zb - 0.16, 0, s * hw * 1.25, zb - 0.32, -0.012, s * r, zb - 0.16, 2);
  }

  /* the eye at the butt: a small ring the tether is tied through */
  const eyeR = 0.075;
  const eyeT = 0.016;
  const ez = z1 - eyeR;
  const eyeSeg = 16;
  const eyeSides = 6;
  for (let i = 0; i < eyeSeg; i++) {
    const a0 = (i / eyeSeg) * Math.PI * 2;
    const a1 = ((i + 1) / eyeSeg) * Math.PI * 2;
    for (let j = 0; j < eyeSides; j++) {
      const b0 = (j / eyeSides) * Math.PI * 2;
      const b1 = ((j + 1) / eyeSides) * Math.PI * 2;
      const P = (a, b) => {
        const rr = eyeR + eyeT * Math.cos(b);
        // the ring stands in the YZ plane
        return [eyeT * Math.sin(b), Math.cos(a) * rr, ez + Math.sin(a) * rr];
      };
      const p00 = P(a0, b0);
      const p10 = P(a1, b0);
      const p01 = P(a0, b1);
      const p11 = P(a1, b1);
      tri(...p00, ...p10, ...p01, 3);
      tri(...p10, ...p11, ...p01, 3);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  geometry.setAttribute('aAlong', new BufferAttribute(new Float32Array(along), 1));
  geometry.computeVertexNormals();
  geometry.boundingSphere = new Sphere(new Vector3(0, 0, -1.2), 2.5);
  return geometry;
}

/** Metres from the tip to the centre of the eye, for the default harpoon. */
export const HARPOON_BUTT = 0.5 * 0.85 + 2.1 + 0.075;

/**
 * A grid: `position.x` 0..1 over `cols`, `position.y` `y0..y1` over `rows`,
 * `position.z` an instance index 0..count-1 (each instance its own block).
 */
export function createCometGrid(cols, rows, y0 = 0, y1 = 1, count = 1) {
  const cx = cols + 1;
  const cy = rows + 1;
  const per = cx * cy;
  const positions = new Float32Array(per * count * 3);
  const indices = new Uint16Array(cols * rows * 6 * count);
  let p = 0;
  let k = 0;
  for (let n = 0; n < count; n++) {
    for (let j = 0; j < cy; j++) {
      const y = y0 + (y1 - y0) * (j / rows);
      for (let i = 0; i < cx; i++) {
        positions[p++] = i / cols;
        positions[p++] = y;
        positions[p++] = n;
      }
    }
    const base = n * per;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = base + j * cx + i;
        const b = a + 1;
        const c = a + cx;
        const d = c + 1;
        indices[k++] = a;
        indices[k++] = c;
        indices[k++] = b;
        indices[k++] = b;
        indices[k++] = c;
        indices[k++] = d;
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = HUGE;
  return geometry;
}

/** A unit quad, ±1 in XY. */
export function createCometQuad() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = HUGE;
  return geometry;
}
