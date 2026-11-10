import { BufferAttribute, BufferGeometry } from 'three';

/**
 * The Chain Arc's hero form: a **fulgurite** — the tube of fused, blackened
 * glass lightning leaves where it goes into the ground.
 *
 * Built once per variant, in unit space (a cluster about one metre across and
 * one metre tall); the ability scales and turns each instance from live
 * settings, so `fulguriteHeight` and `fulguriteRadius` are sliders, not
 * rebuilds.
 *
 * ## The shape
 *
 *  - a low **crust**: an irregular fused mound, a lathe whose radius and
 *    height wander with angle, so the cluster sits *in* the floor instead of
 *    on it;
 *  - `SPIKES` **spikes**: each a faceted (five-sided) tube following a jagged
 *    polyline that leaves the crust and climbs outward at a random elevation,
 *    kinked at every joint and tapering to a point — the channel the strike
 *    took, frozen;
 *  - a short **side branch** off most spikes, the same construction smaller.
 *
 * Facets stay hard (duplicated vertices per face ring are not merged) so the
 * sun catches them like glass.
 *
 * Per vertex: `aTip` — 0 at a spike's root, 1 at its point (the crust is 0).
 * The material runs the residual charge up the spikes along it.
 */

const SIDES = 5;
const SPIKE_POINTS = 7;
const BRANCH_POINTS = 4;
const SPIKES = 7;
const CRUST_AROUND = 28;
const CRUST_RINGS = 4;

/** Small deterministic PRNG so every variant is stable between loads. */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** Push one tapered, faceted tube along `pts` into the buffers. */
function tube(out, pts, radii, tip0, tip1, rand) {
  const n = pts.length;
  const base = out.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    // Tangent from neighbours.
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    let tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    // A perpendicular pair.
    let ux = 0;
    let uy = 1;
    let uz = 0;
    if (Math.abs(ty) > 0.9) {
      ux = 1;
      uy = 0;
    }
    // n1 = normalize(cross(t, up)), n2 = cross(t, n1)
    let n1x = ty * uz - tz * uy;
    let n1y = tz * ux - tx * uz;
    let n1z = tx * uy - ty * ux;
    const nl = Math.hypot(n1x, n1y, n1z) || 1;
    n1x /= nl;
    n1y /= nl;
    n1z /= nl;
    const n2x = ty * n1z - tz * n1y;
    const n2y = tz * n1x - tx * n1z;
    const n2z = tx * n1y - ty * n1x;

    const r = radii[i];
    const twist = rand() * 1.2;
    const t = tip0 + (tip1 - tip0) * (i / (n - 1));
    for (let k = 0; k < SIDES; k++) {
      const ang = (k / SIDES) * Math.PI * 2 + twist;
      // Facet wobble: glass does not set round.
      const rr = r * (0.75 + rand() * 0.5);
      const c = Math.cos(ang) * rr;
      const s = Math.sin(ang) * rr;
      out.pos.push(p[0] + n1x * c + n2x * s, p[1] + n1y * c + n2y * s, p[2] + n1z * c + n2z * s);
      out.tip.push(t);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < SIDES; k++) {
      const a = base + i * SIDES + k;
      const b = base + i * SIDES + ((k + 1) % SIDES);
      const c = a + SIDES;
      const d = b + SIDES;
      out.idx.push(a, c, b, b, c, d);
    }
  }
  // Cap the point.
  const last = base + (n - 1) * SIDES;
  const p = pts[n - 1];
  const apex = out.pos.length / 3;
  out.pos.push(p[0], p[1], p[2]);
  out.tip.push(tip1);
  for (let k = 0; k < SIDES; k++) out.idx.push(last + k, apex, last + ((k + 1) % SIDES));
}

/** One jagged climbing polyline. */
function channel(rand, x0, y0, z0, heading, elevation, length, count) {
  const pts = [];
  let x = x0;
  let y = y0;
  let z = z0;
  let h = heading;
  let e = elevation;
  const step = length / (count - 1);
  pts.push([x, y, z]);
  for (let i = 1; i < count; i++) {
    h += (rand() - 0.5) * 0.9;
    e = Math.min(1.45, Math.max(0.25, e + (rand() - 0.5) * 0.7));
    x += Math.cos(h) * Math.cos(e) * step;
    z += Math.sin(h) * Math.cos(e) * step;
    y += Math.sin(e) * step;
    pts.push([x, y, z]);
  }
  return pts;
}

/**
 * @param {number} variant 0.. — which of the authored clusters
 * @returns {BufferGeometry}
 */
export function createFulguriteGeometry(variant = 0) {
  const rand = rng(9173 + variant * 7919);
  const out = { pos: [], tip: [], idx: [] };

  /* --- the crust --- */
  const crustBase = out.pos.length / 3;
  const wob = [];
  for (let k = 0; k < CRUST_AROUND; k++) wob.push(0.75 + rand() * 0.5);
  for (let j = 0; j <= CRUST_RINGS; j++) {
    const f = j / CRUST_RINGS; // 0 at the outer foot, 1 at the top
    for (let k = 0; k < CRUST_AROUND; k++) {
      const ang = (k / CRUST_AROUND) * Math.PI * 2;
      const w = wob[k] * 0.5 + wob[(k + 3) % CRUST_AROUND] * 0.5;
      const r = (0.52 - 0.34 * f * f) * w;
      const y = -0.03 + Math.sin(f * Math.PI * 0.5) * 0.13 * w;
      out.pos.push(Math.cos(ang) * r, y, Math.sin(ang) * r);
      out.tip.push(0.05 * f);
    }
  }
  for (let j = 0; j < CRUST_RINGS; j++) {
    for (let k = 0; k < CRUST_AROUND; k++) {
      const a = crustBase + j * CRUST_AROUND + k;
      const b = crustBase + j * CRUST_AROUND + ((k + 1) % CRUST_AROUND);
      out.idx.push(a, b, a + CRUST_AROUND, b, b + CRUST_AROUND, a + CRUST_AROUND);
    }
  }
  const crustTop = out.pos.length / 3;
  out.pos.push(0, 0.14, 0);
  out.tip.push(0.05);
  const topRing = crustBase + CRUST_RINGS * CRUST_AROUND;
  for (let k = 0; k < CRUST_AROUND; k++) out.idx.push(topRing + k, topRing + ((k + 1) % CRUST_AROUND), crustTop);

  /* --- the spikes --- */
  for (let s = 0; s < SPIKES; s++) {
    const heading = (s / SPIKES) * Math.PI * 2 + (rand() - 0.5) * 0.6;
    // One tall central spire, the rest flare outward.
    const central = s === 0;
    const elevation = central ? 1.3 : 0.55 + rand() * 0.55;
    const length = central ? 1.05 : 0.55 + rand() * 0.45;
    const r0 = central ? 0.11 : 0.06 + rand() * 0.035;
    const rootR = central ? 0 : 0.08 + rand() * 0.18;
    const pts = channel(rand, Math.cos(heading) * rootR, 0.04, Math.sin(heading) * rootR, heading, elevation, length, SPIKE_POINTS);
    const radii = [];
    for (let i = 0; i < SPIKE_POINTS; i++) radii.push(r0 * Math.pow(1 - i / SPIKE_POINTS, 1.1) + 0.006);
    tube(out, pts, radii, 0.08, 1, rand);

    // A side branch off the upper half of most spikes.
    if (rand() < 0.8) {
      const at = 2 + ((rand() * 3) | 0);
      const p = pts[at];
      const bh = heading + (rand() < 0.5 ? -1 : 1) * (0.6 + rand() * 0.6);
      const bpts = channel(rand, p[0], p[1], p[2], bh, 0.35 + rand() * 0.6, length * 0.35, BRANCH_POINTS);
      const br = [];
      const rb = radii[at] * 0.6;
      for (let i = 0; i < BRANCH_POINTS; i++) br.push(rb * (1 - i / BRANCH_POINTS) + 0.004);
      const tipAt = 0.08 + 0.92 * (at / (SPIKE_POINTS - 1));
      tube(out, bpts, br, tipAt, 1, rand);
    }
  }

  // Unindex, so every face carries its own hard normal.
  const flatPos = new Float32Array(out.idx.length * 3);
  const flatTip = new Float32Array(out.idx.length);
  for (let i = 0; i < out.idx.length; i++) {
    const v = out.idx[i];
    flatPos[i * 3] = out.pos[v * 3];
    flatPos[i * 3 + 1] = out.pos[v * 3 + 1];
    flatPos[i * 3 + 2] = out.pos[v * 3 + 2];
    flatTip[i] = out.tip[v];
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(flatPos, 3));
  geometry.setAttribute('aTip', new BufferAttribute(flatTip, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** How many authored clusters there are; slots cycle through them. */
export const FULGURITE_VARIANTS = 3;
