import {
  BufferAttribute,
  BufferGeometry,
  ExtrudeGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LatheGeometry,
  Path,
  Shape,
  Sphere,
  Vector2,
  Vector3
} from 'three';

/**
 * Stasis Bell — the procedural meshes the bell and its fence are drawn with.
 *
 * The bell, the clapper and the escapement wheel are ordinary meshes built
 * at unit size and scaled live by their transforms. The tines, the strings,
 * the sound fronts and the floor are built in *parameter space* and placed
 * entirely in their vertex stages from uniforms, so their counts, heights and
 * spacing are sliders and nothing is ever rebuilt.
 */

const BIG = new Sphere(new Vector3(), 1e4);

function gridIndices(cols, rows, flip) {
  const out = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let k = 0;
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (flip) {
        out[k++] = a; out[k++] = c; out[k++] = b;
        out[k++] = b; out[k++] = c; out[k++] = d;
      } else {
        out[k++] = a; out[k++] = b; out[k++] = c;
        out[k++] = b; out[k++] = d; out[k++] = c;
      }
    }
  }
  return out;
}

/**
 * The bell: a lathe, crown at y = 0 hanging down to the lip at y = −1, lip
 * radius 1. Outer profile (shoulder, waist, sound-bow, flared lip) down, then
 * the inner wall back up, so the mouth has a real lip to it.
 */
export function createBellGeometry(segments = 72) {
  const outer = [
    [0.0, 0.02],
    [0.3, 0.0],
    [0.5, -0.04],
    [0.58, -0.12],
    [0.6, -0.3],
    [0.62, -0.5],
    [0.68, -0.68],
    [0.8, -0.84],
    [0.94, -0.95],
    [1.0, -1.0]
  ];
  const pts = [];
  for (const [r, y] of outer) pts.push(new Vector2(r, y));
  // The lip, rounded, then the inner wall back up.
  pts.push(new Vector2(0.97, -1.02));
  pts.push(new Vector2(0.9, -0.99));
  for (let i = outer.length - 2; i >= 1; i--) {
    const [r, y] = outer[i];
    pts.push(new Vector2(Math.max(0.02, r * 0.9 - 0.02), y - 0.03));
  }
  pts.push(new Vector2(0.0, -0.1));
  const geometry = new LatheGeometry(pts, segments);
  geometry.boundingSphere = BIG.clone();
  return geometry;
}

/** The clapper: a rod and a ball, hanging from y = 0 to y = −1 (ball centre). */
export function createClapperGeometry(sides = 16) {
  const pts = [
    new Vector2(0.0, 0.0),
    new Vector2(0.06, 0.0),
    new Vector2(0.05, -0.7)
  ];
  // The ball, radius 0.24 round y = −1.
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (0.5 - i / 10) + Math.PI * 0.0;
    pts.push(new Vector2(Math.max(0.0, Math.cos(a) * 0.24), -1 + Math.sin(a) * 0.24 + 0.0));
  }
  pts.push(new Vector2(0.0, -1.24));
  const geometry = new LatheGeometry(pts, sides);
  geometry.boundingSphere = BIG.clone();
  return geometry;
}

/**
 * The escapement wheel: a flat toothed ring, outer radius 1, lying in XZ,
 * `thickness` deep. Saw-toothed — an escape wheel's teeth lean one way.
 */
export function createGearGeometry(teeth = 30, thickness = 0.06) {
  const shape = new Shape();
  const n = teeth;
  const rIn = 0.9;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 0.62) / n) * Math.PI * 2;
    const a2 = ((i + 0.72) / n) * Math.PI * 2;
    const p0 = [Math.cos(a0) * rIn, Math.sin(a0) * rIn];
    if (i === 0) shape.moveTo(p0[0], p0[1]);
    else shape.lineTo(p0[0], p0[1]);
    shape.lineTo(Math.cos(a1) * 1.0, Math.sin(a1) * 1.0);
    shape.lineTo(Math.cos(a2) * rIn, Math.sin(a2) * rIn);
  }
  shape.closePath();
  const hole = new Path();
  hole.absarc(0, 0, 0.8, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geometry = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 4 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -thickness * 0.5, 0);
  geometry.computeVertexNormals();
  geometry.boundingSphere = BIG.clone();
  return geometry;
}

/**
 * The tines: one tuning fork per instance, in parameter space. Two tubes:
 * `aPart` 0 is the U (prong, bend, prong), `aPart` 1 the stem. `position.x`
 * 0..1 along the tube, `position.y` 0..1 round it. The instanced `aIndex`
 * says which tine; the material stands it on the rim.
 */
export function createTineGeometry(maxTines, alongU = 40, alongStem = 6, sides = 8) {
  const cols = sides + 1;
  const rowsU = alongU + 1;
  const rowsS = alongStem + 1;
  const total = cols * (rowsU + rowsS);
  const positions = new Float32Array(total * 3);
  const part = new Float32Array(total);
  let p = 0;
  let q = 0;
  for (let j = 0; j < rowsU; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = j / alongU;
      positions[p++] = i / sides;
      positions[p++] = 0;
      part[q++] = 0;
    }
  }
  for (let j = 0; j < rowsS; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = j / alongStem;
      positions[p++] = i / sides;
      positions[p++] = 0;
      part[q++] = 1;
    }
  }
  const a = gridIndices(cols, rowsU, false);
  const b = gridIndices(cols, rowsS, false);
  const indices = new Uint32Array(a.length + b.length);
  indices.set(a, 0);
  const off = cols * rowsU;
  for (let i = 0; i < b.length; i++) indices[a.length + i] = b[i] + off;

  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aPart', new BufferAttribute(part, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  const idx = new Float32Array(maxTines);
  for (let i = 0; i < maxTines; i++) idx[i] = i;
  geometry.setAttribute('aIndex', new InstancedBufferAttribute(idx, 1));
  geometry.instanceCount = maxTines;
  geometry.boundingSphere = BIG.clone();
  return geometry;
}

/**
 * The strings: a ribbon per instance (`position.x` 0..1 along, `.y` −1..1
 * across), instanced per gap and row (`aGap`, `aRow`).
 */
export function createStringGeometry(maxGaps, rows, segments = 28) {
  const cols = segments + 1;
  const positions = new Float32Array(cols * 2 * 3);
  let p = 0;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / segments;
      positions[p++] = j * 2 - 1;
      positions[p++] = 0;
    }
  }
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(gridIndices(cols, 2, true), 1));
  const n = maxGaps * rows;
  const gap = new Float32Array(n);
  const row = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    gap[i] = Math.floor(i / rows);
    row[i] = i % rows;
  }
  geometry.setAttribute('aGap', new InstancedBufferAttribute(gap, 1));
  geometry.setAttribute('aRow', new InstancedBufferAttribute(row, 1));
  geometry.instanceCount = n;
  geometry.boundingSphere = BIG.clone();
  return geometry;
}

/** A ring band: `position.x` 0..1 round, `position.y` −1..1 across the band. */
export function createBandGeometry(around = 96, across = 4) {
  const cols = around + 1;
  const rows = across + 1;
  const positions = new Float32Array(cols * rows * 3);
  let p = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / around;
      positions[p++] = (j / across) * 2 - 1;
      positions[p++] = 0;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(gridIndices(cols, rows, false), 1));
  geometry.boundingSphere = BIG.clone();
  return geometry;
}

/** A unit quad, ±1 in XY. */
export function createQuadGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  geometry.boundingSphere = BIG.clone();
  return geometry;
}
