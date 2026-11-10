import { BufferAttribute, BufferGeometry, Float32BufferAttribute, LatheGeometry, PlaneGeometry, Sphere, Vector2, Vector3 } from 'three';

/**
 * Strata Exchange — procedural geometry. Everything here is built once, at
 * unit size, and sized from settings every frame by the owning meshes.
 *
 *  - **the plug** (`createPlugGeometry`) — a core of ground torn out whole:
 *    a dusty crown, five strata bands each with its own wandering outline
 *    (so the silhouette steps in and out in ledges), a pinched groove between
 *    every pair of bands where the seam light lives, and a torn root of
 *    rubble tapering to ragged spikes underneath. Unit radius, crown at y = 0,
 *    banded body to y = −1, root to y = −1.35. Faceted (non-indexed) so the
 *    rock reads as broken stone, not a soft cylinder.
 *  - **the lodestone** (`createLodestoneGeometry`) — the faceted, ridged
 *    spindle that is lobbed to key the ground. Unit length.
 *  - **the arc** (`createArcGeometry`) — a tube whose shape is built entirely
 *    in the vertex shader from (t, around); the buffer holds only parameters.
 *
 * Per-vertex attributes the rock shader reads:
 *   aBand — 0..1 down the strata (which band, and where in it)
 *   aSeam — 1 deep in a groove between bands
 *   aRoot — 1 on the torn root
 *   aCap  — 1 on the crown
 */

/** Seeded PRNG so every pool member builds the same authored plug. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth periodic wobble round the circumference: a few random harmonics. */
function outline(random, harmonics, amp) {
  const h = [];
  for (let i = 0; i < harmonics; i++) h.push({ k: 2 + Math.floor(random() * 7), p: random() * Math.PI * 2, a: (random() * 0.7 + 0.3) * amp / (1 + i * 0.6) });
  return (a) => {
    let v = 0;
    for (const x of h) v += Math.sin(a * x.k + x.p) * x.a;
    return v;
  };
}

/**
 * @param {number} [seed]
 * @param {number} [segments] around the circumference
 */
export function createPlugGeometry(seed = 7, segments = 44) {
  const random = rng(seed);
  // Band thicknesses, top to bottom, summing to 1 — uneven on purpose.
  const thick = [0.16, 0.24, 0.17, 0.26, 0.17];
  const bandRadius = [1.0, 0.95, 1.04, 0.92, 0.99];
  /** Rows: y, radius, band coordinate, seam, root, cap, outline function. */
  const rows = [];
  const crownWobble = outline(random, 4, 0.06);
  // The strata dip: every band boundary is tilted the same way, as real beds are.
  const dipAngle = random() * Math.PI * 2;
  const dip = 0.06;
  rows.push({ y: 0.035, r: 0.0, band: 0, seam: 0, root: 0, cap: 1, wob: crownWobble });
  rows.push({ y: 0.03, r: 0.55, band: 0, seam: 0, root: 0, cap: 1, wob: crownWobble });
  rows.push({ y: 0.012, r: 0.93, band: 0, seam: 0, root: 0, cap: 1, wob: crownWobble });
  let y = 0;
  for (let b = 0; b < thick.length; b++) {
    const wob = outline(random, 5, 0.09);
    // Each band sits a little off the axis of the one above: a stepped, broken flank.
    const shiftX = (random() - 0.5) * 0.09;
    const shiftZ = (random() - 0.5) * 0.09;
    const top = y;
    const bottom = y - thick[b];
    const r = bandRadius[b];
    const band0 = b / thick.length;
    const band1 = (b + 1) / thick.length;
    rows.push({ y: top - 0.012, r, band: band0 + 0.01, seam: 0, root: 0, cap: b === 0 ? 0.6 : 0, wob, sx: shiftX, sz: shiftZ, tilt: b === 0 ? 0 : 1 });
    rows.push({ y: (top + bottom) * 0.5, r: r * 1.01, band: (band0 + band1) * 0.5, seam: 0, root: 0, cap: 0, wob, sx: shiftX, sz: shiftZ, tilt: 1 });
    rows.push({ y: bottom + 0.022, r: r * 0.985, band: band1 - 0.01, seam: 0.15, root: 0, cap: 0, wob, sx: shiftX, sz: shiftZ, tilt: 1 });
    if (b < thick.length - 1) {
      // The groove between two bands: pinched in, where the seam light lives.
      rows.push({ y: bottom, r: Math.min(r, bandRadius[b + 1]) * 0.9, band: band1, seam: 1, root: 0, cap: 0, wob, sx: shiftX, sz: shiftZ, tilt: 1 });
    }
    y = bottom;
  }
  // The torn root: ragged, tapering, spiky.
  const rootWob = outline(random, 7, 0.22);
  rows.push({ y: -1.05, r: 0.8, band: 1, seam: 0.3, root: 0.6, cap: 0, wob: rootWob });
  rows.push({ y: -1.14, r: 0.62, band: 1, seam: 0, root: 1, cap: 0, wob: rootWob });
  rows.push({ y: -1.25, r: 0.4, band: 1, seam: 0, root: 1, cap: 0, wob: rootWob });
  rows.push({ y: -1.35, r: 0.0, band: 1, seam: 0, root: 1, cap: 0, wob: rootWob });

  const ringCount = rows.length;
  const stride = segments + 1;
  const pos = new Float32Array(ringCount * stride * 3);
  const band = new Float32Array(ringCount * stride);
  const seam = new Float32Array(ringCount * stride);
  const root = new Float32Array(ringCount * stride);
  const cap = new Float32Array(ringCount * stride);
  // Per-vertex grain on the radius — small-scale knobbles, closed round the seam.
  const grain = new Float32Array(ringCount * segments);
  for (let i = 0; i < grain.length; i++) grain[i] = random() - 0.5;
  for (let j = 0; j < ringCount; j++) {
    const row = rows[j];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const n = grain[j * segments + (i % segments)];
      const spikes = row.root > 0.5 ? n * 0.4 : n * 0.05;
      const rad = Math.max(0, row.r * (1 + row.wob(a) + spikes));
      const k = j * stride + i;
      const tilt = row.tilt ? dip * Math.cos(a - dipAngle) * Math.min(1, rad) : 0;
      pos[k * 3] = Math.cos(a) * rad + (row.sx ?? 0);
      pos[k * 3 + 1] = row.y + tilt + (row.root > 0.5 ? n * 0.12 : 0);
      pos[k * 3 + 2] = Math.sin(a) * rad + (row.sz ?? 0);
      band[k] = row.band;
      seam[k] = row.seam;
      root[k] = row.root;
      cap[k] = row.cap;
    }
  }
  const index = [];
  for (let j = 0; j < ringCount - 1; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      // Wound so the outside faces out (crown at top, rows run downward).
      index.push(a, b, c, b, d, c);
    }
  }
  const indexed = new BufferGeometry();
  indexed.setAttribute('position', new BufferAttribute(pos, 3));
  indexed.setAttribute('aBand', new BufferAttribute(band, 1));
  indexed.setAttribute('aSeam', new BufferAttribute(seam, 1));
  indexed.setAttribute('aRoot', new BufferAttribute(root, 1));
  indexed.setAttribute('aCap', new BufferAttribute(cap, 1));
  indexed.setIndex(index);
  // Faceted: every triangle owns its vertices, so normals are per face.
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** The lodestone: a faceted, ridged spindle, unit length along y. */
export function createLodestoneGeometry() {
  const profile = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 bottom … 1 top
    const body = Math.sin(Math.PI * t);
    const ridge = i % 3 === 1 ? 0.88 : 1;
    profile.push(new Vector2(Math.max(0.0001, 0.3 * Math.pow(body, 0.8) * ridge), t - 0.5));
  }
  const lathe = new LatheGeometry(profile, 7);
  const n = lathe.attributes.position.count;
  const band = new Float32Array(n);
  const seam = new Float32Array(n);
  const zero = new Float32Array(n);
  const p = lathe.attributes.position;
  for (let i = 0; i < n; i++) {
    const t = p.getY(i) + 0.5;
    band[i] = t;
    // The pinched rings are the stone's seams.
    const ring = Math.round(t * steps);
    seam[i] = ring % 3 === 1 ? 1 : 0;
  }
  lathe.setAttribute('aBand', new BufferAttribute(band, 1));
  lathe.setAttribute('aSeam', new BufferAttribute(seam, 1));
  lathe.setAttribute('aRoot', new BufferAttribute(zero, 1));
  lathe.setAttribute('aCap', new BufferAttribute(zero.slice(), 1));
  const geometry = lathe.toNonIndexed();
  lathe.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A parameter-only tube: (t along 0..1, around 0..2π). The vertex shader
 * places every vertex on the exchange arc, so the buffer never changes when
 * the span, height or radius sliders move.
 */
export function createArcGeometry(along = 72, around = 8) {
  const count = (along + 1) * (around + 1);
  const param = new Float32Array(count * 2);
  for (let j = 0; j <= along; j++) {
    for (let i = 0; i <= around; i++) {
      const k = j * (around + 1) + i;
      param[k * 2] = j / along;
      param[k * 2 + 1] = (i / around) * Math.PI * 2;
    }
  }
  const index = [];
  for (let j = 0; j < along; j++) {
    for (let i = 0; i < around; i++) {
      const a = j * (around + 1) + i;
      const b = a + 1;
      const c = a + around + 1;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aParam', new BufferAttribute(param, 2));
  geometry.setIndex(index);
  // Placed in the shader; the bounds must cover the whole arena.
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/** A unit quad carrier for the floor and lens shaders. */
export function createQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}
