import { BufferAttribute, BufferGeometry } from 'three';

/**
 * Procedural geometry for Nightshade Inheritance, authored in metres.
 *
 * The shade is a thing of wings and belladonna: moth-like wing membranes with
 * a cambered section, ribs and a scalloped trailing edge; a ribbon that arcs
 * from the fallen host to its heir; the five-lobed hanging bell of the deadly
 * nightshade flower; a thorned crescent crown that floats over the marked
 * head. Shaders read `uv` only, so every pattern rides the mesh as it flaps,
 * twists and scales.
 */

const TAU = Math.PI * 2;

function finish(positions, uvs, indices) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Index a (rows × cols) grid laid out row-major. */
function gridIndices(indices, base, rows, cols) {
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const n = base + j * cols + i;
      indices.push(n, n + cols, n + 1, n + 1, n + cols, n + cols + 1);
    }
  }
}

/**
 * A shade wing: a folded, tapered membrane 1.9 m long (along +X from the
 * root), not a billboard. Its width swells and tapers along the span, the
 * trailing edge is scalloped between five finger-ribs, the section is
 * cambered (it bellies outward like a sail) and each rib stands proud of the
 * membrane. `uv.x` runs root → tip, `uv.y` leading → trailing edge.
 */
export function shadeWingGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const rows = 25;
  const cols = 9;
  const ribs = 5;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const t = j / (rows - 1);
      const u = i / (cols - 1);
      const width = Math.sin(Math.PI * t) * (0.65 + 0.22 * Math.sin(t * 6));
      // Scallops bite into the trailing edge between the ribs.
      const scallop = 1 - 0.2 * Math.pow(Math.abs(Math.sin(t * Math.PI * ribs)), 1.5) * u * u * u;
      // Ribs: a ridge along each finger, strongest toward the trailing edge.
      const rib = 0.03 * Math.pow(Math.max(0, Math.cos(t * Math.PI * ribs * 2)), 6) * u;
      const camber = Math.sin(Math.PI * t) * u * (1 - u) * 0.45;
      positions.push(t * 1.9, u * width * scallop, camber + rib);
      uvs.push(t, u);
    }
  }
  gridIndices(indices, 0, rows, cols);
  return finish(positions, uvs, indices);
}

/**
 * The inheritance ribbon: 0..1 along +X (scaled to the distance between the
 * hosts), arcing 0.55 m high in the middle and tapering to points at both
 * ends. The vertex shader twists the section about the arc, so the ribbon is
 * authored flat and its twist stays a live slider. `uv.x` runs source → heir,
 * `uv.y` is the side (0 / 1).
 */
export function inheritanceRibbonGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const rows = 49;
  for (let j = 0; j < rows; j++) {
    const t = j / (rows - 1);
    const width = Math.sin(Math.PI * t) * 0.22;
    for (let side = 0; side < 2; side++) {
      positions.push(t, Math.sin(Math.PI * t) * 0.55, (side ? 1 : -1) * width);
      uvs.push(t, side);
    }
    if (j < rows - 1) {
      const n = j * 2;
      indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
  return finish(positions, uvs, indices);
}

/**
 * A deadly-nightshade blossom: the five-lobed hanging bell of belladonna,
 * 0.14 m long, its mouth facing -Y. The corolla's radius swells toward the
 * mouth and is pinched into five lobes; the lip curls outward. `uv.x` runs
 * round the bell, `uv.y` from the stem (0) to the lip (1).
 */
export function nightshadeBlossomGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const rows = 8;
  const cols = 31;
  for (let j = 0; j < rows; j++) {
    const v = j / (rows - 1);
    for (let i = 0; i < cols; i++) {
      const u = i / (cols - 1);
      const a = u * TAU;
      const lobes = 1 + 0.22 * Math.cos(a * 5) * v * v;
      const curl = v > 0.75 ? (v - 0.75) * 0.35 : 0;
      const r = (0.015 + 0.05 * Math.pow(v, 1.3) + curl) * lobes;
      positions.push(Math.cos(a) * r, -v * 0.14 + curl * 0.2, Math.sin(a) * r);
      uvs.push(u, v);
    }
  }
  gridIndices(indices, 0, rows, cols);
  return finish(positions, uvs, indices);
}

/**
 * The mark: a thorned crescent crown that floats horizontally over the
 * marked head. A ring (radius 0.42) whose band is thick on one side and
 * pares away to nothing on the other — the crescent — with seven thorns
 * turned inward from the thick side. `uv.x` runs round, `uv.y` across the
 * band (0 inner, 1 outer); thorns carry `uv.y` > 1 so the shader can tell.
 */
export function nightshadeSigilGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const segments = 72;
  const radius = 0.42;
  const cols = segments + 1;
  for (let i = 0; i < cols; i++) {
    const u = i / segments;
    const a = u * TAU;
    // Crescent: band width goes from 0.12 m to zero round the ring.
    const band = 0.12 * Math.pow(0.5 + 0.5 * Math.cos(a), 1.4);
    const lift = 0.02 * Math.sin(a * 3);
    positions.push(Math.cos(a) * (radius - band * 0.5), lift, Math.sin(a) * (radius - band * 0.5));
    uvs.push(u, 0);
    positions.push(Math.cos(a) * (radius + band * 0.5), lift + band * 0.15, Math.sin(a) * (radius + band * 0.5));
    uvs.push(u, 1);
  }
  for (let i = 0; i < segments; i++) {
    const n = i * 2;
    indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
  }
  // Thorns, clustered on the thick side, curling inward and down.
  const thorns = 7;
  for (let k = 0; k < thorns; k++) {
    const a = ((k - (thorns - 1) / 2) / thorns) * Math.PI * 1.1;
    const w = 0.035;
    const base = positions.length / 3;
    const r0 = radius - 0.02;
    positions.push(
      Math.cos(a - w) * r0, 0.01, Math.sin(a - w) * r0,
      Math.cos(a + w) * r0, 0.01, Math.sin(a + w) * r0,
      Math.cos(a) * (r0 - 0.16), -0.06, Math.sin(a) * (r0 - 0.16),
      Math.cos(a) * r0, 0.05, Math.sin(a) * r0
    );
    uvs.push(a / TAU, 1.2, a / TAU, 1.2, a / TAU, 2, a / TAU, 1.2);
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 3, base, base + 2);
  }
  return finish(positions, uvs, indices);
}

/**
 * The hero: one petal of the giant nightshade bell that closes over a host.
 * A cupped, pointed blade in unit space — `x` across (±0.5 at its widest),
 * `y` up (0 → 1), `z` outward from the bell's axis in units of the bell's
 * seat radius: it bellies out (z ≈ +0.3) and its tip curls in over the host
 * (z ≈ -0.9), so instancing it round a ring with scale (width, height, seat)
 * builds a closed bell of any size. The section is cupped toward the axis
 * and a raised midrib runs up it; the tip is drawn out to a hooked point.
 * `uv.x` across (0..1, midrib at 0.5), `uv.y` root → tip.
 */
export function nightshadePetalGeometry() {
  const ROWS = 28;
  const COLS = 13;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let j = 0; j < ROWS; j++) {
    const t = j / (ROWS - 1);
    // Width: narrow root, full shoulder, long pointed tip.
    const w = 0.5 * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * t)), 0.7) * (1 - 0.85 * Math.pow(t, 3)) + 0.015;
    const z0 = 0.32 * Math.sin(Math.PI * t * 0.85) - 1.05 * Math.pow(t, 2.3);
    const y = t - 0.04;
    for (let i = 0; i < COLS; i++) {
      const s = (i / (COLS - 1)) * 2 - 1;
      // Cupped toward the axis; the midrib stands proud on the outside.
      const cup = -0.16 * (1 - s * s) * Math.sin(Math.PI * t);
      const rib = 0.035 * Math.exp(-s * s * 60) * (1 - t);
      // A ruffled margin.
      const ruffle = 0.03 * Math.sin(t * 22 + s * 3) * s * s;
      positions.push(s * w, y + ruffle * 0.5, z0 + cup + rib + ruffle);
      uvs.push(i / (COLS - 1), t);
    }
  }
  gridIndices(indices, 0, ROWS, COLS);
  return finish(positions, uvs, indices);
}

/** A ground strip 1 m long (x 0 → 1), 1 m wide (z ±0.5), 32 segments along. */
export function nightshadeStripGeometry() {
  const SEG = 33;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < SEG; i++) {
      const u = i / (SEG - 1);
      positions.push(u, 0, j - 0.5);
      uvs.push(u, j);
    }
  }
  gridIndices(indices, 0, 2, SEG);
  return finish(positions, uvs, indices);
}
