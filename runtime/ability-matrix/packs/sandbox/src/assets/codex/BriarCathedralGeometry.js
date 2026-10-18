import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Sphere,
  Vector3
} from 'three';

/**
 * Briar Cathedral — the procedural meshes the vault is drawn with.
 *
 * The ribs are built once, in *parameter space*: their vertices are not
 * positions but coordinates (`s` along the rib, an angle round the stem) that
 * the vertex stage turns into metres from uniforms, so the vault's span, its
 * height, its pointed arch and the way it closes are all live sliders and
 * nothing is rebuilt. The thorns are real geometry — rigid, placed per
 * instance on the CPU — so they can sit on `LAYER.WORLD`, write the depth
 * prepass and throw a shadow without a bespoke depth material.
 */

/**
 * The ribs: one tube grid, instanced once per strand.
 *
 * `position.x` is `s`, 0 under the floor at the rim and 1 at the apex;
 * `position.y` is 0..1 round the stem. Rings are crowded toward the root,
 * where the rib is thickest and bends hardest out of the floor.
 *
 * Per instance:
 *   - `aRib`  (static)  — bearing (radians), seed, strand phase, rib index
 *   - `aGrow` (dynamic) — grow front 0..1, wither 0..1, emerge flash, unused
 *
 * Never culled: the bounding volume of a parameter-space mesh means nothing.
 *
 * @param {number} maxInstances  strands the buffer can hold
 * @param {number} [rings]       segments root → apex
 * @param {number} [sides]       segments round the stem
 */
export function createBriarRibGeometry(maxInstances, rings = 96, sides = 9) {
  const cols = sides + 1;
  const rows = rings + 1;
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array(sides * rings * 6);

  let p = 0;
  for (let j = 0; j < rows; j++) {
    const s = Math.pow(j / rings, 1.15);
    for (let i = 0; i < cols; i++) {
      positions[p++] = s;
      positions[p++] = i / sides;
      positions[p++] = 0;
    }
  }

  let k = 0;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }

  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));

  const rib = new InstancedBufferAttribute(new Float32Array(maxInstances * 4), 4);
  const grow = new InstancedBufferAttribute(new Float32Array(maxInstances * 4), 4);
  grow.setUsage(DynamicDrawUsage);
  geometry.setAttribute('aRib', rib);
  geometry.setAttribute('aGrow', grow);
  geometry.instanceCount = 0;
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * One thorn: a hooked cone, base at the origin, length 1 up +Y, hooking
 * toward +X as it narrows. A briar thorn is broad and flattened where it
 * grips the stem, so the base is an ellipse twice as long along X as across.
 *
 * `position` is real (unit metres before the instance scale). A second
 * attribute, `aT`, is 0 at the base and 1 at the point, so the shader can
 * colour along it whatever scale the instance carries.
 *
 * @param {number} [rings]
 * @param {number} [sides]
 */
export function createBriarThornGeometry(rings = 7, sides = 7) {
  const cols = sides + 1;
  const vertexCount = cols * (rings + 1) + 1;
  const positions = new Float32Array(vertexCount * 3);
  const along = new Float32Array(vertexCount);
  const indices = [];

  let p = 0;
  let t = 0;
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    // Concave flank: wide grip, fast taper, a needle point.
    const radius = 0.5 * Math.pow(1 - v, 1.6);
    const hook = 0.32 * v * v; // the point curls over toward +X
    const y = v;
    for (let i = 0; i < cols; i++) {
      const a = (i / sides) * Math.PI * 2;
      positions[p++] = Math.cos(a) * radius * 1.5 + hook;
      positions[p++] = y;
      positions[p++] = Math.sin(a) * radius * 0.75;
      along[t++] = v;
    }
  }
  // The point.
  positions[p++] = 0.34;
  positions[p++] = 1.02;
  positions[p++] = 0;
  along[t++] = 1;
  const tip = vertexCount - 1;

  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const last = rings * cols;
  for (let i = 0; i < sides; i++) indices.push(last + i, tip, last + i + 1);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aT', new BufferAttribute(along, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A unit quad, ±1 in XY, never culled — the floor and the rings place it in the shader. */
export function createBriarQuadGeometry() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * A light shaft: an open cone in parameter space, `position.x` 0..1 round,
 * `position.y` 0 at the floor and 1 at the apex. The shader sizes it.
 */
export function createBriarShaftGeometry(sides = 40, rows = 10) {
  const cols = sides + 1;
  const rowCount = rows + 1;
  const positions = new Float32Array(cols * rowCount * 3);
  const indices = new Uint16Array(sides * rows * 6);
  let p = 0;
  for (let j = 0; j < rowCount; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / sides;
      positions[p++] = j / rows;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = c;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
