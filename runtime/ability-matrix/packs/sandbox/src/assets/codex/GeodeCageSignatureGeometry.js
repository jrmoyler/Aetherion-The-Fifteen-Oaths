import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * Geode Cage's own solids, authored in code (cast-local; the generated
 * `GeodeCageGeometry.js` is pinned by the rig tests and is not touched).
 *
 * Every vertex carries `aKind` for the shader:
 *   0 rock rind (the outside of the geode),
 *   1 crystal bed (the lining the points grow out of),
 *   2 broken edge / seam (where the shell splits; glows when it seals),
 *   3 crystal (amethyst points: faceted, glowing toward the tip).
 */

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function makeBuilder() {
  const pos = [];
  const kind = [];
  return {
    pos,
    kind,
    tri(a, b, c, k) {
      pos.push(...a, ...b, ...c);
      kind.push(k, k, k);
    },
    quad(a, b, c, d, k) {
      this.tri(a, b, c, k);
      this.tri(a, c, d, k);
    },
    /** A crystal point: a `sides`-sided prism of radius `r` from `base` along unit `dir` for `len`, capped by a pyramid. */
    crystal(base, dir, len, r, sides, seed) {
      // Any vector not parallel to dir, then an orthonormal frame round it.
      const ref = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let ux = dir[1] * ref[2] - dir[2] * ref[1];
      let uy = dir[2] * ref[0] - dir[0] * ref[2];
      let uz = dir[0] * ref[1] - dir[1] * ref[0];
      const ul = Math.hypot(ux, uy, uz);
      ux /= ul; uy /= ul; uz /= ul;
      const vx = dir[1] * uz - dir[2] * uy;
      const vy = dir[2] * ux - dir[0] * uz;
      const vz = dir[0] * uy - dir[1] * ux;
      const at = (t, a, rr) => [
        base[0] + dir[0] * t + (ux * Math.cos(a) + vx * Math.sin(a)) * rr,
        base[1] + dir[1] * t + (uy * Math.cos(a) + vy * Math.sin(a)) * rr,
        base[2] + dir[2] * t + (uz * Math.cos(a) + vz * Math.sin(a)) * rr
      ];
      const shaft = len * (0.62 + 0.12 * hash(seed));
      const tip = [base[0] + dir[0] * len, base[1] + dir[1] * len, base[2] + dir[2] * len];
      const turn = hash(seed + 3) * 6.283;
      for (let k = 0; k < sides; k++) {
        const a0 = turn + (k / sides) * Math.PI * 2;
        const a1 = turn + ((k + 1) / sides) * Math.PI * 2;
        const b0 = at(0, a0, r);
        const b1 = at(0, a1, r);
        const t0 = at(shaft, a0, r * 0.9);
        const t1 = at(shaft, a1, r * 0.9);
        this.quad(b0, b1, t1, t0, 3);
        this.tri(t0, t1, tip, 3);
      }
    }
  };
}

function finish(b) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(b.pos, 3));
  geometry.setAttribute('aKind', new Float32BufferAttribute(b.kind, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * One shell petal of the geode. Hinge along local X at the origin, local +Z
 * points in toward the circle's centre, +Y up. Closed (no tilt) the petals of
 * a ring of `count` make a dome of radius 1 centred one unit inward, open at
 * the top by an oculus (`topAngle` short of the pole). The outside is a craggy
 * rind; the inside is a crystal bed set with amethyst points facing the
 * centre; the split edges are seams.
 */
export function createGeodeCagePetalGeometry(count = 7, topAngle = 1.22) {
  const b = makeBuilder();
  const width = ((Math.PI * 2) / count) * 0.95;
  const NP = 9;
  const NA = 6;
  const thick = 0.12;
  const C = [0, 0, 1];
  const surf = (i, j, rho) => {
    const phi = (i / NP) * topAngle;
    const a = (j / NA - 0.5) * width;
    const bump = rho > 1 - thick * 0.5 ? (hash(i * 31 + j * 7) - 0.5) * 0.07 : 0;
    const r = rho + bump;
    return [C[0] + Math.sin(a) * Math.cos(phi) * r, Math.sin(phi) * r, C[2] - Math.cos(a) * Math.cos(phi) * r];
  };
  for (let i = 0; i < NP; i++) {
    for (let j = 0; j < NA; j++) {
      // Outer rind and inner bed.
      b.quad(surf(i, j, 1), surf(i, j + 1, 1), surf(i + 1, j + 1, 1), surf(i + 1, j, 1), 0);
      b.quad(surf(i, j, 1 - thick), surf(i + 1, j, 1 - thick), surf(i + 1, j + 1, 1 - thick), surf(i, j + 1, 1 - thick), 1);
    }
    // The split sides.
    b.quad(surf(i, 0, 1), surf(i + 1, 0, 1), surf(i + 1, 0, 1 - thick), surf(i, 0, 1 - thick), 2);
    b.quad(surf(i, NA, 1), surf(i, NA, 1 - thick), surf(i + 1, NA, 1 - thick), surf(i + 1, NA, 1), 2);
  }
  for (let j = 0; j < NA; j++) {
    // The broken top lip and the foot.
    b.quad(surf(NP, j, 1), surf(NP, j + 1, 1), surf(NP, j + 1, 1 - thick), surf(NP, j, 1 - thick), 2);
    b.quad(surf(0, j, 1), surf(0, j, 1 - thick), surf(0, j + 1, 1 - thick), surf(0, j + 1, 1), 0);
  }
  // Amethyst points set in the bed, pointing at the dome's centre.
  let seed = 1;
  for (let i = 1; i < NP; i += 1) {
    for (let j = 0; j < NA; j++) {
      if (hash(i * 13 + j * 5) < 0.35) continue;
      const p = surf(i + hash(seed) * 0.6, j + 0.2 + hash(seed + 1) * 0.6, 1 - thick);
      let d = [C[0] - p[0], C[1] - p[1], C[2] - p[2]];
      const dl = Math.hypot(d[0], d[1], d[2]);
      d = [d[0] / dl + (hash(seed + 2) - 0.5) * 0.5, d[1] / dl + (hash(seed + 4) - 0.5) * 0.5, d[2] / dl];
      const dl2 = Math.hypot(d[0], d[1], d[2]);
      d = [d[0] / dl2, d[1] / dl2, d[2] / dl2];
      b.crystal(p, d, 0.1 + 0.14 * hash(seed + 5), 0.025 + 0.02 * hash(seed + 6), 5, seed);
      seed += 7;
    }
  }
  return finish(b);
}

/** One fired point: a six-sided amethyst prism one unit long along +Y, radius 0.5, foot at the origin. */
export function createGeodeCageSpikeGeometry() {
  const b = makeBuilder();
  b.crystal([0, 0, 0], [0, 1, 0], 1, 0.5, 6, 11);
  // A broken rock foot where it tore out of the wall.
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI * 2;
    const a1 = ((k + 1) / 6) * Math.PI * 2;
    const r0 = 0.62 + 0.1 * hash(k);
    const r1 = 0.62 + 0.1 * hash(k + 1);
    b.quad([Math.cos(a0) * r0, -0.08, Math.sin(a0) * r0], [Math.cos(a1) * r1, -0.08, Math.sin(a1) * r1], [Math.cos(a1) * 0.5, 0.02, Math.sin(a1) * 0.5], [Math.cos(a0) * 0.5, 0.02, Math.sin(a0) * 0.5], 2);
    b.tri([0, -0.16, 0], [Math.cos(a1) * r1, -0.08, Math.sin(a1) * r1], [Math.cos(a0) * r0, -0.08, Math.sin(a0) * r0], 0);
  }
  return finish(b);
}

/**
 * The thrown geode: a lumpy rock nodule of radius ~0.5 with a split seam
 * round its waist, crystal glinting through the seam.
 */
export function createGeodeCageNoduleGeometry() {
  const b = makeBuilder();
  const NU = 12;
  const NV = 8;
  const p = (i, j) => {
    const th = (i / NU) * Math.PI * 2;
    const ph = (j / NV) * Math.PI;
    const ii = i % NU;
    const r = 0.5 * (0.85 + 0.25 * hash(ii * 17 + j * 3)) * (j === 0 || j === NV ? 1 : 1);
    return [Math.cos(th) * Math.sin(ph) * r * 1.15, Math.cos(ph) * r * 0.9, Math.sin(th) * Math.sin(ph) * r];
  };
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const seam = j === NV / 2 - 1 || j === NV / 2 ? (hash(i * 5 + j) < 0.6 ? 2 : 0) : 0;
      b.quad(p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1), seam);
    }
  }
  // Crystal glinting out of the seam.
  for (let i = 0; i < NU; i += 2) {
    const th = (i / NU) * Math.PI * 2;
    b.crystal([Math.cos(th) * 0.4, 0, Math.sin(th) * 0.36], [Math.cos(th), 0.15, Math.sin(th)], 0.22, 0.05, 5, i + 40);
  }
  return finish(b);
}
