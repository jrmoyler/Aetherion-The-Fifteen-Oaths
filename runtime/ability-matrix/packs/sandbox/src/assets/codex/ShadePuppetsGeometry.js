import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Sphere, Vector3 } from 'three';

/**
 * Shade Puppets — the procedural meshes the marionettes are drawn with.
 *
 *  - **the limb** — one carved spindle, instanced for every body part of every
 *    puppet (head, torso, upper and lower arms and legs). Real geometry in a
 *    unit frame — +Y from 0 at one joint to 1 at the next, unit radius — so an
 *    instance matrix can lay it between any two joints at any thickness.
 *  - **the crown** — the puppeteer's control: a thorned hoop that hovers over
 *    the circle and that every string hangs from. Real geometry, unit radius,
 *    flat-shaded.
 *  - **the strings**, **the spotlight** and the quads are parameter-space
 *    grids the vertex stage places from uniforms.
 */

/**
 * A carved spindle: swollen in the middle, necked toward each end, with a
 * small knob at each joint so the pivots read. `position.y` 0..1 along.
 *
 * @param {number} [rings] segments along
 * @param {number} [sides] segments round
 */
export function createLimbGeometry(rings = 14, sides = 10) {
  const cols = sides + 1;
  const rows = rings + 1;
  const positions = new Float32Array(cols * rows * 3);
  const normals = new Float32Array(cols * rows * 3);
  const indices = [];
  const profile = (y) => {
    const body = Math.pow(Math.sin(Math.PI * y), 0.55);
    const knob = 0.55 * Math.exp(-Math.pow(y / 0.06, 2)) + 0.55 * Math.exp(-Math.pow((1 - y) / 0.06, 2));
    return Math.max(0.12, 0.35 + 0.65 * body * (1 - 0.25 * Math.exp(-Math.pow((y - 0.12) / 0.05, 2)) - 0.25 * Math.exp(-Math.pow((y - 0.88) / 0.05, 2))) + knob * 0.4);
  };
  let p = 0;
  for (let j = 0; j < rows; j++) {
    const y = j / rings;
    const r = profile(y);
    const dr = (profile(Math.min(1, y + 0.01)) - profile(Math.max(0, y - 0.01))) / 0.02;
    for (let i = 0; i < cols; i++) {
      const a = (i / sides) * Math.PI * 2;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      positions[p] = cx * r;
      positions[p + 1] = y;
      positions[p + 2] = cz * r;
      // Normal of a surface of revolution: radial, tilted by the profile slope.
      const nl = Math.hypot(1, dr);
      normals[p] = cx / nl;
      normals[p + 1] = -dr / nl;
      normals[p + 2] = cz / nl;
      p += 3;
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  // Caps, so a limb seen end-on is not hollow.
  const capBase = rows * cols;
  const capPos = new Float32Array((rows * cols + 2) * 3);
  capPos.set(positions);
  capPos.set([0, 0, 0, 0, 1, 0], capBase * 3);
  const capNor = new Float32Array((rows * cols + 2) * 3);
  capNor.set(normals);
  capNor.set([0, -1, 0, 0, 1, 0], capBase * 3);
  for (let i = 0; i < sides; i++) {
    indices.push(capBase, i, i + 1);
    const top = rings * cols;
    indices.push(capBase + 1, top + i + 1, top + i);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(capPos, 3));
  geometry.setAttribute('normal', new BufferAttribute(capNor, 3));
  geometry.setIndex(indices);
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * The crown: a hoop of unit radius, a band `0.28` tall, with `spikes` thorns
 * round its top (alternately long and short) and a short hook under each long
 * one for a string. Flat-shaded triangles; `aPart` is 0 for the band and 1 for
 * a thorn, and `aTip` 0 at a thorn's root to 1 at its point.
 */
export function createCrownGeometry(spikes = 12, segments = 48) {
  const pos = [];
  const part = [];
  const tip = [];
  const push = (ax, ay, az, bx, by, bz, cx, cy, cz, pa, ta, tb, tc) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    part.push(pa, pa, pa);
    tip.push(ta, tb, tc);
  };
  const H = 0.28;
  const T = 0.06;
  // band: outer and inner walls, top and bottom rims
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);
    const ro = 1;
    const ri = 1 - T;
    push(c0 * ro, 0, s0 * ro, c0 * ro, H, s0 * ro, c1 * ro, 0, s1 * ro, 0, 0, 0, 0);
    push(c1 * ro, 0, s1 * ro, c0 * ro, H, s0 * ro, c1 * ro, H, s1 * ro, 0, 0, 0, 0);
    push(c0 * ri, 0, s0 * ri, c1 * ri, 0, s1 * ri, c0 * ri, H, s0 * ri, 0, 0, 0, 0);
    push(c1 * ri, 0, s1 * ri, c1 * ri, H, s1 * ri, c0 * ri, H, s0 * ri, 0, 0, 0, 0);
    push(c0 * ri, H, s0 * ri, c1 * ri, H, s1 * ri, c0 * ro, H, s0 * ro, 0, 0, 0, 0);
    push(c1 * ri, H, s1 * ri, c1 * ro, H, s1 * ro, c0 * ro, H, s0 * ro, 0, 0, 0, 0);
    push(c0 * ri, 0, s0 * ri, c0 * ro, 0, s0 * ro, c1 * ri, 0, s1 * ri, 0, 0, 0, 0);
    push(c1 * ri, 0, s1 * ri, c0 * ro, 0, s0 * ro, c1 * ro, 0, s1 * ro, 0, 0, 0, 0);
  }
  // thorns: four-sided pyramids leaning slightly outward
  for (let k = 0; k < spikes; k++) {
    const a = (k / spikes) * Math.PI * 2;
    const long = k % 2 === 0;
    const h = long ? 0.75 : 0.4;
    const w = long ? 0.11 : 0.08;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const tx = -s;
    const tz = c;
    const r = 1 - T * 0.5;
    const bx = c * r;
    const bz = s * r;
    const px = c * (r + h * 0.18);
    const pz = s * (r + h * 0.18);
    const py = H + h;
    const q = [
      [bx + tx * w, H, bz + tz * w],
      [bx + c * w * 0.6, H, bz + s * w * 0.6],
      [bx - tx * w, H, bz - tz * w],
      [bx - c * w * 0.6, H, bz - s * w * 0.6]
    ];
    for (let e = 0; e < 4; e++) {
      const u = q[e];
      const v = q[(e + 1) % 4];
      push(u[0], u[1], u[2], v[0], v[1], v[2], px, py, pz, 1, 0, 0, 1);
    }
    // a hook under each long thorn, where a string ties on
    if (long) {
      const hy = -0.22;
      const hq = [
        [bx + tx * 0.04, 0, bz + tz * 0.04],
        [bx + c * 0.04, 0, bz + s * 0.04],
        [bx - tx * 0.04, 0, bz - tz * 0.04],
        [bx - c * 0.04, 0, bz - s * 0.04]
      ];
      for (let e = 0; e < 4; e++) {
        const u = hq[e];
        const v = hq[(e + 1) % 4];
        push(v[0], v[1], v[2], u[0], u[1], u[2], bx, hy, bz, 1, 0, 0, 0.6);
      }
    }
  }
  const positions = new Float32Array(pos);
  const normals = new Float32Array(pos.length);
  const _a = new Vector3();
  const _b = new Vector3();
  const _c = new Vector3();
  for (let i = 0; i < positions.length; i += 9) {
    _a.set(positions[i + 3] - positions[i], positions[i + 4] - positions[i + 1], positions[i + 5] - positions[i + 2]);
    _b.set(positions[i + 6] - positions[i], positions[i + 7] - positions[i + 1], positions[i + 8] - positions[i + 2]);
    _c.crossVectors(_a, _b).normalize();
    for (let v = 0; v < 3; v++) {
      normals[i + v * 3] = _c.x;
      normals[i + v * 3 + 1] = _c.y;
      normals[i + v * 3 + 2] = _c.z;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('aPart', new Float32BufferAttribute(part, 1));
  geometry.setAttribute('aTip', new Float32BufferAttribute(tip, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * Every string at once: `count` ribbons of `segments` along × 1 across, in
 * parameter space — `position.x` 0..1 crown → puppet, `position.y` ±1 across —
 * with `aIdx` naming the string, so the vertex stage can look its ends up.
 */
export function createStringsGeometry(count = 24, segments = 24) {
  const cols = segments + 1;
  const perString = cols * 2;
  const positions = new Float32Array(count * perString * 3);
  const idx = new Float32Array(count * perString);
  const indices = new Uint16Array(count * segments * 6);
  let p = 0;
  let q = 0;
  let k = 0;
  for (let s = 0; s < count; s++) {
    const base = s * perString;
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < cols; i++) {
        positions[p++] = i / segments;
        positions[p++] = j * 2 - 1;
        positions[p++] = 0;
        idx[q++] = s;
      }
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aIdx', new BufferAttribute(idx, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/** An open cone grid: `position.x` 0 apex .. 1 rim, `position.y` 0..1 round. */
export function createConeGeometry(rows = 12, sides = 48) {
  const cols = sides + 1;
  const positions = new Float32Array(cols * (rows + 1) * 3);
  const indices = new Uint16Array(sides * rows * 6);
  let p = 0;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = j / rows;
      positions[p++] = i / sides;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/** A unit quad, ±1 in XY. */
export function createPuppetQuadGeometry() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
