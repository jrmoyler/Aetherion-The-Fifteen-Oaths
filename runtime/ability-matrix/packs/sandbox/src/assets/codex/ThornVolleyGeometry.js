import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Thorn Volley — the procedural meshes.
 *
 * The thorn is real geometry, built once at unit length: rigid, so the
 * instance matrix alone places, aims and sizes it, and it can live on
 * `LAYER.WORLD` (depth prepass, shadows) with no bespoke depth material.
 */

/**
 * One thrown thorn, base at the origin, point at +Y = 1.
 *
 *   - **the shaft** — a hooked horn: an elliptical, concave-flanked cone
 *     whose centreline curls toward +X as it narrows, with a little spiral
 *     fluting so it never reads as a smooth spike.
 *   - **three barbs** — small hooked cones off the shaft, pointing *back*
 *     toward the base, staggered round it: what makes a pin hold.
 *   - **two leaf vanes** — flat leaves at the base like fletching, so a thorn
 *     in flight has a silhouette from any angle.
 *
 * Attributes: `aT` 0 at the base → 1 at the point (for colour and the
 * splinter), `aPart` 0 shaft, 1 barb, 2 leaf.
 */
export function createThornGeometry() {
  const pos = [];
  const nrm = [];
  const at = [];
  const part = [];
  const idx = [];

  const push = (x, y, z, nx, ny, nz, t, p) => {
    pos.push(x, y, z);
    nrm.push(nx, ny, nz);
    at.push(t);
    part.push(p);
    return pos.length / 3 - 1;
  };

  /* --- the shaft --- */
  const rings = 18;
  const sides = 10;
  const baseR = 0.07;
  const hook = 0.09;
  const start = 0;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const r = baseR * Math.pow(1 - t, 0.85) * (1 + 0.25 * Math.exp(-t * 10));
    const cx = hook * t * t;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      // Fluting: shallow grooves that twist a quarter turn up the shaft.
      const flute = 1 + 0.08 * Math.cos(a * 5 + t * 1.6);
      const x = Math.cos(a) * r * 1.15 * flute;
      const z = Math.sin(a) * r * 0.85 * flute;
      push(cx + x, t, z, Math.cos(a), 0.15, Math.sin(a), t, 0);
    }
  }
  const cols = sides + 1;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < sides; i++) {
      const a = start + j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Point and base caps.
  const tip = push(hook * 1.02, 1.03, 0, 0, 1, 0, 1, 0);
  const lastRing = start + rings * cols;
  for (let i = 0; i < sides; i++) idx.push(lastRing + i, tip, lastRing + i + 1);
  const baseC = push(0, -0.01, 0, 0, -1, 0, 0, 0);
  for (let i = 0; i < sides; i++) idx.push(start + i + 1, baseC, start + i);

  /* --- barbs: small hooked cones pointing back toward the base --- */
  const barbs = [
    { t: 0.38, a: 0.4, len: 0.11 },
    { t: 0.55, a: 2.5, len: 0.09 },
    { t: 0.7, a: 4.6, len: 0.07 }
  ];
  for (const barb of barbs) {
    const r0 = baseR * Math.pow(1 - barb.t, 0.85);
    const cx = hook * barb.t * barb.t;
    const ox = Math.cos(barb.a);
    const oz = Math.sin(barb.a);
    const bx = cx + ox * r0 * 0.9;
    const bz = oz * r0 * 0.9;
    const by = barb.t;
    // Point: out and back down the shaft.
    const px = bx + ox * barb.len;
    const pz = bz + oz * barb.len;
    const py = by - barb.len * 0.9;
    const bs = 5;
    const br = r0 * 0.45;
    const first = pos.length / 3;
    for (let i = 0; i <= bs; i++) {
      const a = (i / bs) * Math.PI * 2;
      // A ring round the barb's root, in the plane across the shaft.
      const ux = -oz;
      const uz = ox;
      const rx = bx + (ux * Math.cos(a)) * br;
      const rz = bz + (uz * Math.cos(a)) * br;
      const ry = by + Math.sin(a) * br;
      push(rx, ry, rz, ux * Math.cos(a), Math.sin(a), uz * Math.cos(a), barb.t, 1);
    }
    const p = push(px, py, pz, ox, -0.6, oz, Math.min(1, barb.t + 0.15), 1);
    for (let i = 0; i < bs; i++) idx.push(first + i, first + i + 1, p);
  }

  /* --- leaf vanes at the base, crossed --- */
  const leaf = (ax, az) => {
    // A diamond leaf: root on the shaft, widest a third up, tip trailing back.
    const L = 0.34;
    const W = 0.075;
    const root = push(ax * baseR, 0.05, az * baseR, -az, 0, ax, 0.02, 2);
    const mid1 = push(ax * (baseR + L * 0.45) + -az * W, 0.08, az * (baseR + L * 0.45) + ax * W, -az, 0, ax, 0.05, 2);
    const mid2 = push(ax * (baseR + L * 0.45) - -az * W, 0.08, az * (baseR + L * 0.45) - ax * W, -az, 0, ax, 0.05, 2);
    const end = push(ax * (baseR + L), -0.12, az * (baseR + L), -az, 0, ax, 0.08, 2);
    idx.push(root, mid1, end, root, end, mid2);
  };
  leaf(0, 1);
  leaf(0, -1);
  leaf(-1, 0);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  geometry.setAttribute('aT', new BufferAttribute(new Float32Array(at), 1));
  geometry.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();
  return geometry;
}

/** A unit quad, ±1 in XY, never culled — the floor web and the lens rings place it. */
export function createThornQuadGeometry() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
