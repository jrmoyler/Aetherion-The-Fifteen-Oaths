import { BufferAttribute, BufferGeometry } from 'three';

/**
 * Procedural geometry for the Bloodroot Thorns.
 *
 * ## The roots
 *
 * Every root in a cast — primaries and their branches — lives in **one** merged
 * mesh of identical tubes, and no tube knows where it is. A vertex stores only
 * `aRoot = (rootIndex, s, around)`: which root, how far along it (0 heart .. 1
 * tip), and its bearing round the tube. The vertex stage looks the root up in a
 * small uniform table (origin, bearing, length, thickness, how far it has grown,
 * two wander phases) and evaluates the path there — the same function the
 * ability evaluates on the CPU to plant thorns along it, so a thorn always
 * stands on its root however the sliders are dragged.
 *
 * ## The thorn vine
 *
 * A thorny vine is not a spike. It is a whip: thick and gnarled at the root, a
 * long taper, a hook over at the top where it has grown past its own strength,
 * and barbs down its length that point *up and out*, alternating round the
 * stem. Every barb is a small cone welded onto the stem, marked `aSap = 1` so
 * the shader can make the barbs the brightest, wettest red on the vine.
 *
 * Unit space: the root of the vine at y = 0 with a base radius of 1, the tip at
 * y = 1. Instances scale x/z by the radius and y by the height. Because the hook
 * has to read the same at any height-to-width ratio, its sideways reach is
 * baked in *height* units through `aspect` (height / radius at build time).
 */

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * The root tube shared by every root in a cast.
 *
 * @param {number} maxRoots
 * @param {number} [segments] rings along a root
 * @param {number} [radial]   vertices round a root
 */
export function createRootTubeGeometry(maxRoots, segments = 40, radial = 8) {
  const columns = radial + 1;
  const rows = segments + 1;
  const perRoot = columns * rows;
  const positions = new Float32Array(maxRoots * perRoot * 3);
  const roots = new Float32Array(maxRoots * perRoot * 3);
  const indices = [];

  let v = 0;
  for (let r = 0; r < maxRoots; r++) {
    const base = v;
    for (let row = 0; row < rows; row++) {
      const s = row / segments;
      for (let col = 0; col < columns; col++) {
        roots[v * 3 + 0] = r;
        roots[v * 3 + 1] = s;
        roots[v * 3 + 2] = (col / radial) * Math.PI * 2;
        v++;
      }
    }
    for (let row = 0; row < segments; row++) {
      for (let col = 0; col < radial; col++) {
        const a = base + row * columns + col;
        const b = a + 1;
        const c = a + columns;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  const geometry = new BufferGeometry();
  // `position` is required by three but unused: the vertex stage builds the tube.
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aRoot', new BufferAttribute(roots, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * One thorny vine silhouette.
 *
 * @param {object} options
 * @param {number} [options.seed]
 * @param {number} [options.sides]       facets round the stem
 * @param {number} [options.rings]       rings up the stem
 * @param {number} [options.curl]        how far the top hooks over, × the height
 * @param {number} [options.barbs]       barbs down the vine
 * @param {number} [options.barbLength]  barb length, × the local stem radius
 * @param {number} [options.aspect]      height / radius the vine will be shown at
 */
export function createThornVineGeometry({
  seed = 1,
  sides = 9,
  rings = 22,
  curl = 0.5,
  barbs = 7,
  barbLength = 2.2,
  aspect = 14
} = {}) {
  const positions = [];
  const sap = [];
  const indices = [];

  const hookAngle = hash(seed) * Math.PI * 2;
  const hx = Math.cos(hookAngle);
  const hz = Math.sin(hookAngle);
  const wobble = [hash(seed + 1) * 6.28, hash(seed + 2) * 6.28];
  // The hook is in height units; one unit of x is one *radius*, so scale.
  const reach = curl * aspect * 0.35;

  /** Centre line at height fraction f. */
  const centre = (f, out) => {
    const hook = f * f * f * reach;
    const sway = Math.sin(f * 5 + wobble[0]) * 0.25 * f;
    out[0] = hx * hook + Math.cos(wobble[1]) * sway;
    // The hook pulls the tip *down* a little as it curls over.
    out[1] = f - curl * 0.12 * f * f * f * f;
    out[2] = hz * hook + Math.sin(wobble[1]) * sway;
    return out;
  };
  /** Stem radius at height fraction f: a gnarled root flare, then a long taper. */
  const radius = (f) => {
    const flare = Math.exp(-f * 12) * 0.55;
    const knot = 0.08 * Math.max(0, Math.sin(f * 23 + wobble[0])) * (1 - f);
    return Math.max(0, Math.pow(1 - f, 1.15) * (0.78 + knot) + flare);
  };

  const c0 = [0, 0, 0];
  const c1 = [0, 0, 0];

  /* ---- the stem ---- */
  const columns = sides + 1;
  const skirt = 0.08; // a little below the floor so a rising vine has no cut end
  for (let row = 0; row <= rings; row++) {
    const f = -skirt + (row / rings) * (0.99 + skirt);
    const h = Math.max(0, f);
    centre(h, c0);
    const r = f < 0 ? 1.25 : radius(h);
    for (let s = 0; s < columns; s++) {
      const a = (s / sides) * Math.PI * 2;
      positions.push(c0[0] + Math.cos(a) * r, f < 0 ? f : c0[1], c0[2] + Math.sin(a) * r);
      sap.push(Math.exp(-Math.max(f, 0) * 7) * 0.6);
    }
  }
  for (let row = 0; row < rings; row++) {
    for (let s = 0; s < sides; s++) {
      const a = row * columns + s;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  // The tip: a needle point.
  const tip = positions.length / 3;
  centre(1, c0);
  positions.push(c0[0], c0[1], c0[2]);
  sap.push(0.3);
  const top = rings * columns;
  for (let s = 0; s < sides; s++) indices.push(top + s, tip, top + s + 1);

  /* ---- the barbs ---- */
  const barbSides = 5;
  const count = Math.max(0, Math.round(barbs));
  for (let i = 0; i < count; i++) {
    const f = 0.12 + (0.8 * (i + hash(seed * 3 + i) * 0.6)) / Math.max(1, count);
    if (f > 0.93) continue;
    centre(f, c0);
    centre(Math.min(1, f + 0.01), c1);
    const r = radius(f);
    // Alternate round the stem, a golden-angle walk.
    const a = i * 2.39996 + hash(seed + i * 7.1) * 0.6;
    const ox = Math.cos(a);
    const oz = Math.sin(a);
    const len = barbLength * Math.max(r, 0.18);
    const baseR = Math.max(r * 0.42, 0.06);
    // Up and out: the barb rises `lift` in height units over its length.
    const lift = (len / aspect) * 0.9;

    const ring = positions.length / 3;
    // Base ring sits just inside the stem surface, on a small circle in the
    // plane facing outward.
    for (let k = 0; k < barbSides; k++) {
      const t = (k / barbSides) * Math.PI * 2;
      const up = Math.cos(t) * baseR; // along the stem (in radius units → height units)
      const side = Math.sin(t) * baseR;
      positions.push(
        c0[0] + ox * r * 0.8 + -oz * side,
        c0[1] + up / aspect,
        c0[2] + oz * r * 0.8 + ox * side
      );
      sap.push(0.7);
    }
    const point = positions.length / 3;
    positions.push(c0[0] + ox * (r * 0.8 + len), c0[1] + lift, c0[2] + oz * (r * 0.8 + len));
    sap.push(1.0);
    for (let k = 0; k < barbSides; k++) {
      indices.push(ring + k, ring + ((k + 1) % barbSides), point);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aSap', new BufferAttribute(new Float32Array(sap), 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
