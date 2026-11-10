import {
  BufferGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  LatheGeometry,
  PlaneGeometry,
  Vector2,
} from 'three';

/**
 * Venom Mimicry — procedural geometry.
 *
 *  - **the serpent** — one authored body in *spine space*: `position.y` is the
 *    arclength fraction `s` (0 at the pool, 1 at the snout) and `position.xz`
 *    is the offset off the spine, x toward the belly (+N), z lateral (+B), in
 *    units of the spine length. It stands straight up at rest; the vertex
 *    stage bends it (see `materials.js`). Three parts share one buffer:
 *      0 · the body — a tube with an authored girth profile: a heavy coil at
 *          the pool, a neck that narrows under the hood, a wedge head that is
 *          wider than it is deep, closing on a rounded snout;
 *      1 · the hood — a two-sheet lens of skin (back and front) whose shape is
 *          computed in the shader from `aHood = (across, along, side)`, so its
 *          span, cup and flare are live sliders;
 *      2 · the fangs — two curved cones under the snout.
 *    The serpent and every mimic are one InstancedMesh of this geometry: the
 *    copies are literally the same creature.
 *  - **venom threads** — a unit tube along +X (x = 0..1 along, yz the unit
 *    section) that the vertex stage lays on an arc between two carriers.
 *  - **the seed** — a ridged lathe teardrop: the spat venom gob.
 *  - **pools** — a flat quad on the floor (instanced).
 *
 * Built once per pool member, disposed with it.
 */

const TAU = Math.PI * 2;
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Body girth (× spine length) at arclength `s`. */
export function bodyRadius(s) {
  // Heavy at the pool, tapering through the neck, swelling into the head.
  let r = 0.074 - 0.03 * smooth(0.0, 0.82, s);
  r += 0.024 * Math.exp(-((s - 0.945) ** 2) / 0.0012);
  // Close on a rounded snout.
  if (s > 0.955) r *= Math.sqrt(Math.max(0, 1 - ((s - 0.955) / 0.045) ** 2));
  // The tail end (s = 0, lying on the floor) tapers to a point.
  r *= 0.18 + 0.82 * smooth(0.0, 0.22, s);
  return r;
}

/** Lateral (z) and depth (x) section scale: the head is a flattened wedge. */
function sectionScale(s, out) {
  const head = smooth(0.84, 0.93, s);
  out.x = 1 - 0.22 * head; // shallower
  out.y = 1 + 0.38 * head; // wider
  return out;
}

const _sec = new Vector2();

/**
 * The serpent, in spine space (see the module comment).
 * @param {object} o { rings, sides, hoodRows, hoodCols }
 */
export function createSerpentGeometry({ rings = 84, sides = 20, hoodRows = 22, hoodCols = 26 } = {}) {
  const pos = [];
  const nrm = [];
  const uv = [];
  const part = [];
  const hood = [];
  const index = [];

  /* ---- 0 · the body ---- */
  const bodyStart = 0;
  for (let i = 0; i <= rings; i++) {
    const s = i / rings;
    const r = bodyRadius(s);
    const dr = (bodyRadius(Math.min(1, s + 0.002)) - bodyRadius(Math.max(0, s - 0.002))) / 0.004;
    sectionScale(s, _sec);
    for (let j = 0; j <= sides; j++) {
      // a = 0 on the belly (+x), π over the back.
      const a = (j / sides) * TAU;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      pos.push(cx * r * _sec.x, s, cz * r * _sec.y);
      // Section normal tipped by the taper, so the head swell catches light.
      const nx = cx / _sec.x;
      const nz = cz / _sec.y;
      const nl = Math.hypot(nx, nz) || 1;
      const ny = -dr;
      const l = Math.hypot(nx / nl, ny, nz / nl) || 1;
      nrm.push(nx / nl / l, ny / l, nz / nl / l);
      uv.push(j / sides, s);
      part.push(0);
      hood.push(0, 0, 0);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = bodyStart + i * (sides + 1) + j;
      const b = a + sides + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  /* ---- 1 · the hood: two sheets, back (side −1) and front (side +1) ---- */
  for (const side of [-1, 1]) {
    const start = pos.length / 3;
    for (let i = 0; i <= hoodRows; i++) {
      const v = i / hoodRows;
      for (let j = 0; j <= hoodCols; j++) {
        const b = (j / hoodCols) * 2 - 1;
        // Rest estimate only (bounds); the shader computes the real shape.
        pos.push(-0.05 + side * 0.006, 0.5 + 0.4 * v, b * 0.3);
        nrm.push(side, 0, 0);
        uv.push(j / hoodCols, v);
        part.push(1);
        hood.push(b, v, side);
      }
    }
    for (let i = 0; i < hoodRows; i++) {
      for (let j = 0; j < hoodCols; j++) {
        const a = start + i * (hoodCols + 1) + j;
        const c = a + hoodCols + 1;
        // Wind each sheet so its face points away from the other.
        if (side < 0) index.push(a, a + 1, c, c, a + 1, c + 1);
        else index.push(a, c, a + 1, c, c + 1, a + 1);
      }
    }
  }

  /* ---- 2 · the fangs: curved cones under the snout ---- */
  const fangRings = 8;
  const fangSides = 8;
  for (const lat of [-1, 1]) {
    const start = pos.length / 3;
    for (let i = 0; i <= fangRings; i++) {
      const t = i / fangRings;
      // Root at the jaw, curving down (+x is the belly side) and back.
      const sx = 0.026 + 0.05 * t;
      const sy = 0.978 - 0.03 * t * t;
      const sz = lat * (0.02 - 0.004 * t);
      const r = 0.009 * (1 - t) + 0.0006;
      for (let j = 0; j <= fangSides; j++) {
        const a = (j / fangSides) * TAU;
        pos.push(sx, sy + Math.cos(a) * r, sz + Math.sin(a) * r);
        nrm.push(0, Math.cos(a), Math.sin(a));
        uv.push(j / fangSides, t);
        part.push(2);
        hood.push(0, t, lat);
      }
    }
    for (let i = 0; i < fangRings; i++) {
      for (let j = 0; j < fangSides; j++) {
        const a = start + i * (fangSides + 1) + j;
        const c = a + fangSides + 1;
        index.push(a, a + 1, c, c, a + 1, c + 1);
      }
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('aPart', new Float32BufferAttribute(part, 1));
  g.setAttribute('aHood', new Float32BufferAttribute(hood, 3));
  g.setIndex(index);
  return g;
}

/**
 * Per-instance state for the serpents. Written every frame by the ability.
 *   aPose — lean, curl, sway amplitude, sway phase
 *   aLife — emerged 0..1, hood flare 0..1, strike flash 0..1, seed
 *   aSize — spine length (m), sink (m), glow gain, girth
 */
export function addSerpentInstances(geometry, count) {
  for (const name of ['aPose', 'aLife', 'aSize']) {
    const a = new InstancedBufferAttribute(new Float32Array(count * 4), 4);
    a.setUsage?.(35048); // DynamicDrawUsage
    geometry.setAttribute(name, a);
  }
  return geometry;
}

/** Unit tube along +X; the vertex stage lays it on an arc. */
export function createThreadGeometry({ rings = 40, sides = 7 } = {}) {
  const pos = [];
  const nrm = [];
  const uv = [];
  const index = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * TAU;
      pos.push(t, Math.cos(a), Math.sin(a));
      nrm.push(0, Math.cos(a), Math.sin(a));
      uv.push(t, j / sides);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j;
      const b = a + sides + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

/**
 * Per-instance state for the threads.
 *   aFrom — start (xyz), grow 0..1 (w)
 *   aTo   — end (xyz), brightness 0..1 (w)
 */
export function addThreadInstances(geometry, count) {
  for (const name of ['aFrom', 'aTo']) {
    const a = new InstancedBufferAttribute(new Float32Array(count * 4), 4);
    a.setUsage?.(35048);
    geometry.setAttribute(name, a);
  }
  return geometry;
}

/** The spat seed: a ridged teardrop, point trailing (+Y up the profile). */
export function createSeedGeometry(segments = 28) {
  const pts = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Round head (t=0) drawn out into a trailing point (t=1).
    const r = Math.sin(Math.PI * Math.pow(t, 0.62)) * (1 - 0.35 * t);
    pts.push(new Vector2(Math.max(1e-4, r), -Math.cos(Math.PI * Math.pow(t, 0.8)) * 1.25));
  }
  const g = new LatheGeometry(pts, segments);
  // Eight venom ridges running down it.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.12 * Math.pow(Math.abs(Math.sin(a * 4)), 3);
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Flat floor quad (XZ, unit), for the instanced pools and the haze. */
export function createFloorQuad() {
  const g = new PlaneGeometry(1, 1, 1, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * Per-instance state for the pools.
 *   aPool — grown 0..1, dry 0..1 (exit), seed, strike pulse 0..1
 */
export function addPoolInstances(geometry, count) {
  const a = new InstancedBufferAttribute(new Float32Array(count * 4), 4);
  a.setUsage?.(35048);
  geometry.setAttribute('aPool', a);
  return geometry;
}

/**
 * The spine's centreline at arclength 1 for a pose with no sway, in units of
 * spine length: `out.x` forward (toward the bite), `out.y` up. The same
 * integral the vertex stage evaluates — the ability uses it to place each
 * serpent so its strike lands on its carrier at any length.
 */
export function spineTip(lean, curl, out, steps = 24) {
  let x = 0;
  let y = 0;
  let px = 0;
  let py = 1;
  for (let i = 1; i <= steps; i++) {
    const s = i / steps;
    const a = lean * s + curl * s * s;
    const cx = Math.sin(a);
    const cy = Math.cos(a);
    x += (px + cx) * 0.5 / steps;
    y += (py + cy) * 0.5 / steps;
    px = cx;
    py = cy;
  }
  out.x = x;
  out.y = y;
  return out;
}
