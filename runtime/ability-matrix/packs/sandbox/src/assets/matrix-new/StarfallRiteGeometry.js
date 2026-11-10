import { BufferAttribute, BufferGeometry, InstancedBufferAttribute, InstancedBufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Procedural geometry for the Starfall Rite.
 *
 * Everything here is a *template* the vertex stage turns into metres, built
 * once with fixed instance capacity, so a cast allocates nothing:
 *
 *   - `createStarQuadGeometry`  — one unit quad, instanced: the star points and
 *     the radiant floor bursts. Per-instance attributes are added here so the
 *     ability only writes into their arrays.
 *   - `createLinkGeometry`      — one quad per constellation line, instanced:
 *     `aFrom`/`aTo` are the line's two stars, `aLink` its draw progress,
 *     brightness and seed. Swung across the view direction in the shader.
 *   - `createMeteorGeometry`    — a strip, instanced, whose rows are indexed by
 *     `along`: 0 at the tip of the trail, 1 at the head, and a few rows past 1
 *     that the shader pushes beyond the head in *metres* (the head's own glow),
 *     so a six-metre trail and a half-metre head share one mesh.
 */

/** @param {number} capacity instances  @param {object} attrs { name: itemSize } */
function instanced(base, capacity, attrs) {
  const geometry = new InstancedBufferGeometry();
  geometry.index = base.index;
  for (const [name, attribute] of Object.entries(base.attributes)) geometry.setAttribute(name, attribute);
  for (const [name, size] of Object.entries(attrs)) {
    geometry.setAttribute(name, new InstancedBufferAttribute(new Float32Array(capacity * size), size));
  }
  geometry.instanceCount = 0;
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

function unitQuad() {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  return g;
}

/**
 * Star points: `aStar` = (x, y, z, size), `aGlow` = (level, flare, seed, ghost).
 * Floor bursts reuse it with their own meaning (see the material).
 */
export function createStarQuadGeometry(capacity) {
  return instanced(unitQuad(), capacity, { aStar: 4, aGlow: 4 });
}

/** Constellation lines: `aFrom`, `aTo` (xyz), `aLink` = (draw, level, seed, retract). */
export function createLinkGeometry(capacity) {
  return instanced(unitQuad(), capacity, { aFrom: 3, aTo: 3, aLink: 4 });
}

/** Rows of the meteor strip, tip → head → past the head. */
const METEOR_ROWS = [0, 0.15, 0.3, 0.45, 0.6, 0.72, 0.82, 0.9, 0.96, 1.0, 1.04, 1.1];

/** Meteors: `aHead` (xyz + level), `aTail` (xyz + seed). */
export function createMeteorGeometry(capacity) {
  const rows = METEOR_ROWS.length;
  const positions = new Float32Array(rows * 2 * 3);
  const index = new Uint16Array((rows - 1) * 6);
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < 2; s++) {
      const v = r * 2 + s;
      positions[v * 3] = s === 0 ? -1 : 1; // across
      positions[v * 3 + 1] = METEOR_ROWS[r]; // along
      positions[v * 3 + 2] = 0;
    }
  }
  let k = 0;
  for (let r = 0; r < rows - 1; r++) {
    const v = r * 2;
    index[k++] = v;
    index[k++] = v + 1;
    index[k++] = v + 2;
    index[k++] = v + 1;
    index[k++] = v + 3;
    index[k++] = v + 2;
  }
  const base = new BufferGeometry();
  base.setAttribute('position', new BufferAttribute(positions, 3));
  base.setIndex(new BufferAttribute(index, 1));
  return instanced(base, capacity, { aHead: 4, aTail: 4 });
}

/**
 * The fallen star itself — the hero solid. A five-pointed star ornament:
 * ten rim vertices alternating a point (radius 1) and a notch (radius 0.42)
 * in the XY plane, each joined to a front apex (z = +0.36) and a back apex
 * (z = −0.36). Twenty flat facets that catch the sun, so it reads as a cut
 * crystal from any side; non-indexed with flat normals.
 *
 * Per instance it carries `aHeat` (0..1, white-hot at landing, cooling) and
 * `aSeed`, written in place by the ability. Unit radius; the ability scales
 * it to `crystalSize` metres.
 */
export function createStarCrystalGeometry(capacity) {
  const rim = [];
  for (let k = 0; k < 10; k++) {
    const a = Math.PI / 2 + (k / 10) * Math.PI * 2;
    const r = k % 2 ? 0.42 : 1;
    rim.push([Math.cos(a) * r, Math.sin(a) * r, 0]);
  }
  const front = [0, 0, 0.36];
  const back = [0, 0, -0.36];
  const positions = [];
  for (let k = 0; k < 10; k++) {
    const a = rim[k];
    const b = rim[(k + 1) % 10];
    positions.push(...front, ...a, ...b);
    positions.push(...back, ...b, ...a);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  geometry.setAttribute('aHeat', new InstancedBufferAttribute(new Float32Array(capacity), 1));
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(capacity), 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/** The floor the constellation is re-drawn on: one quad, laid flat by the ability. */
export function createStarFieldGeometry() {
  return unitQuad();
}
