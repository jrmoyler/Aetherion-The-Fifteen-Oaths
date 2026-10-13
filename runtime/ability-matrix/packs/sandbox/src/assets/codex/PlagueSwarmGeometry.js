import { BufferAttribute, BufferGeometry, InstancedBufferGeometry } from 'three';

/**
 * Plague Swarm — procedural geometry.
 *
 *  - `createHiveGeometry` — the chitinous hive: an egg-shaped pod cut into
 *    `plates` shell plates with thin seams between them, its surface pushed
 *    into lumps and ridges by a baked 3D value noise. Unit space: y 0..1, about
 *    0.45 across. Each vertex knows its plate (`aPlate` = the plate's centre
 *    bearing, radians) and where it sits on it (`aPV` = across 0..1, up 0..1),
 *    so the shader can glow the seams before they split and swing each plate
 *    open about its own hinge. `userData.hingeRadius(v)` is the profile, for
 *    the hinge pivot.
 *  - `createInsectGeometry` — one insect in parameter space, drawn instanced:
 *    a diamond body along +Z (`aPart` 0), two wing blades (1 left, 2 right)
 *    and a camera-facing halo quad (3). The swarm shader places, orients and
 *    flaps every one of them; nothing here moves.
 */

/* ---------------------------------------------------------------------- */
/* noise for the lumps                                                     */
/* ---------------------------------------------------------------------- */

function hash3(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Trilinear value noise, -1..1. */
function valueNoise(x, y, z, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = smooth(x - xi);
  const fy = smooth(y - yi);
  const fz = smooth(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, seed);
  const v = l(
    l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy),
    l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz
  );
  return v * 2 - 1;
}

/** The pod's silhouette: radius at height v (0 floor .. 1 crown). */
function profile(v) {
  // Squat and bulbous low down, drawn up to a blunt crown.
  return 0.46 * Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * v)), 0.62) * (1 - 0.22 * v) + 0.004;
}

/**
 * @param {object} o
 * @param {number} [o.plates] shell plates round the pod
 * @param {number} [o.lumps]  0..1 how lumpy the surface is
 * @param {number} [o.seed]
 */
export function createHiveGeometry({ plates = 6, lumps = 0.18, seed = 3 } = {}) {
  const P = Math.max(2, Math.round(plates));
  const across = 8; // segments across one plate
  const up = 22; // segments up the pod
  const gap = 0.02; // radians of seam either side of a plate
  const pos = [];
  const plate = [];
  const pv = [];
  const idx = [];
  const s = Math.floor(seed * 1000);

  for (let p = 0; p < P; p++) {
    const a0 = (p / P) * Math.PI * 2 + gap;
    const a1 = ((p + 1) / P) * Math.PI * 2 - gap;
    const centre = (a0 + a1) * 0.5;
    const base = pos.length / 3;
    for (let j = 0; j <= up; j++) {
      const v = j / up;
      for (let i = 0; i <= across; i++) {
        const u = i / across;
        const a = a0 + (a1 - a0) * u;
        const r0 = profile(v);
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        // Lumps and a few raised ridges running up each plate, plus a
        // bulge in the middle of the plate so the seams sit in valleys.
        const n =
          valueNoise(dx * 2.6 + 9, v * 3.2, dz * 2.6, s) * 0.65 +
          valueNoise(dx * 6.1, v * 7.5 + 3, dz * 6.1, s + 7) * 0.35;
        const ridge = Math.pow(Math.abs(Math.sin(u * Math.PI * 3)), 6) * 0.25;
        const bulge = Math.sin(u * Math.PI) * 0.08;
        const r = r0 * (1 + lumps * n + lumps * ridge + bulge);
        // The crown closes to one point the plates share.
        const y = v + lumps * 0.04 * n * Math.sin(Math.PI * v);
        pos.push(dx * r, Math.max(0, y), dz * r);
        plate.push(centre);
        pv.push(u, v);
      }
    }
    const row = across + 1;
    for (let j = 0; j < up; j++) {
      for (let i = 0; i < across; i++) {
        const a = base + j * row + i;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        // Outward-facing winding.
        idx.push(a, c, b, b, c, d);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('aPlate', new BufferAttribute(new Float32Array(plate), 1));
  geometry.setAttribute('aPV', new BufferAttribute(new Float32Array(pv), 2));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.hingeRadius = profile;
  return geometry;
}

/** One insect, in parameter space (see the module comment). */
export function createInsectGeometry() {
  const pos = [];
  const uv = [];
  const part = [];
  const idx = [];
  const v = (x, y, z, u, w, p) => {
    pos.push(x, y, z);
    uv.push(u, w);
    part.push(p);
    return pos.length / 3 - 1;
  };

  /* the body: a diamond, long along +Z, a fat thorax a little forward */
  const nose = v(0, 0, 0.55, 0.5, 1, 0);
  const tail = v(0, 0, -0.6, 0.5, 0, 0);
  const rx = 0.14;
  const ry = 0.11;
  const ring = [v(rx, 0, 0.08, 1, 0.55, 0), v(0, ry, 0.08, 0.5, 0.55, 0), v(-rx, 0, 0.08, 0, 0.55, 0), v(0, -ry, 0.08, 0.5, 0.55, 0)];
  for (let i = 0; i < 4; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % 4];
    idx.push(nose, a, b, tail, b, a);
  }

  /* the wings: blades swept back off the thorax (uv.y 0 root .. 1 tip) */
  const wing = (sign, p) => {
    const r0 = v(0.04 * sign, 0.05, 0.16, 0, 0, p);
    const r1 = v(0.04 * sign, 0.05, -0.12, 1, 0, p);
    const t0 = v(0.62 * sign, 0.08, -0.02, 0, 1, p);
    const t1 = v(0.54 * sign, 0.08, -0.34, 1, 1, p);
    idx.push(r0, t0, r1, r1, t0, t1);
  };
  wing(1, 1);
  wing(-1, 2);

  /* the halo: a camera-facing glow */
  const h0 = v(-1, -1, 0, 0, 0, 3);
  const h1 = v(1, -1, 0, 1, 0, 3);
  const h2 = v(1, 1, 0, 1, 1, 3);
  const h3 = v(-1, 1, 0, 0, 1, 3);
  idx.push(h0, h1, h2, h0, h2, h3);

  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geometry.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  geometry.setIndex(idx);
  return geometry;
}
