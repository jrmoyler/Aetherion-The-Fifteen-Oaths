import { BufferAttribute, BufferGeometry } from 'three';

/**
 * ImpulseWell — the cast's own signature geometry, kept out of the generated
 * `ImpulseWellGeometry.js` (which is pinned byte for byte by tests/pure-rigs.test.mjs).
 *
 *   floor — a polar disc of unit radius, dense at the centre, that the floor
 *           shader sinks into a funnel (the inhale) and heaves into a running
 *           ring wave (the dump). `aPolar` = (r, angle).
 *   slab  — one broken floor slab: a jittered seven-sided prism, faceted, its
 *           underside tagged (`aUnder` = 1) so it can glow where it was torn up.
 */

/** Deterministic hash, 0..1. */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function createImpulseFloorGeometry(rings = 56, segments = 112) {
  const positions = [0, 0, 0];
  const polar = [0, 0];
  const index = [];
  for (let i = 1; i <= rings; i++) {
    const r = Math.pow(i / rings, 1.35);
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      polar.push(r, a);
    }
  }
  for (let j = 0; j < segments; j++) {
    const a = 1 + j;
    const b = 1 + ((j + 1) % segments);
    index.push(0, b, a);
  }
  for (let i = 1; i < rings; i++) {
    const row = 1 + (i - 1) * segments;
    const next = row + segments;
    for (let j = 0; j < segments; j++) {
      const j1 = (j + 1) % segments;
      index.push(row + j, row + j1, next + j, row + j1, next + j1, next + j);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array((positions.length / 3) * 3).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  geometry.setAttribute('aPolar', new BufferAttribute(new Float32Array(polar), 2));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A broken slab, about 1 × 0.32 × 0.8 m: seven jittered sides, a tilted top,
 * flat-shaded so every break catches the sun.
 */
export function createImpulseSlabGeometry(seed = 1) {
  const sides = 7;
  const top = [];
  const bottom = [];
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2 + (hash(seed + k) - 0.5) * 0.5;
    const r = 0.36 + 0.16 * hash(seed * 3 + k);
    const x = Math.cos(a) * r * 1.3;
    const z = Math.sin(a) * r;
    top.push([x * (0.86 + 0.1 * hash(seed + k * 7)), 0.14 + 0.06 * hash(seed + k * 5) + x * 0.04, z * 0.9]);
    bottom.push([x, -0.16 - 0.04 * hash(seed + k * 11), z]);
  }
  const pos = [];
  const under = [];
  const tri = (a, b, c, u) => {
    pos.push(...a, ...b, ...c);
    under.push(u, u, u);
  };
  const ct = [0, 0.2, 0];
  const cb = [0, -0.18, 0];
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    tri(ct, top[k1], top[k], 0);
    tri(cb, bottom[k], bottom[k1], 1);
    tri(top[k], top[k1], bottom[k], 0.35);
    tri(top[k1], bottom[k1], bottom[k], 0.35);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('aUnder', new BufferAttribute(new Float32Array(under), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
