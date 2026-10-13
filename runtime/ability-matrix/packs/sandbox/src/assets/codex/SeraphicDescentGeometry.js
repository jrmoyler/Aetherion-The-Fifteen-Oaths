import {
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  DynamicDrawUsage,
  PlaneGeometry,
  Sphere,
  Vector3
} from 'three';

/**
 * Procedural geometry for the Seraphic Descent.
 *
 * Everything here is a *template*: unit-sized, built once with a fixed
 * instance capacity, and turned into metres by the vertex stage from uniforms
 * and per-instance attributes the ability writes in place. Nothing is rebuilt
 * during a cast and nothing is allocated.
 *
 *   - `createFeatherGeometry` — one feather, a strip `segments` rows long so
 *     the shader can bend it, instanced once per feather of both wings. The
 *     whole wing skeleton (arm arch, fold, flap, sweep) is posed in the vertex
 *     stage from a handful of uniforms; per instance there is only where on the
 *     arm the feather sits and its dice.
 *   - `createHaloGeometry` — a closed ribbon round a unit circle; `position.x`
 *     is the bearing, `position.y` the side of the ribbon. Swung to face the
 *     camera in the shader, so the band keeps its width from any angle.
 *   - `createRayGeometry` — an open frustum, instanced: `position.x` bearing,
 *     `position.y` 0 at the top to 1 at the floor. `aTop`/`aBottom` place it.
 *   - `createDartGeometry` — a strip whose rows run trail tip (0) → blade base
 *     (1) → blade tip (2); the shader lays the trail and the blade out in
 *     metres, so a long trail and a short blade share one mesh.
 *   - `createGlintGeometry` — instanced unit quads for camera-facing glints.
 *   - `createSigilGeometry` — a unit floor quad.
 */

const HUGE = new Sphere(new Vector3(), 1e4);

function instanced(base, capacity, attrs) {
  const geometry = new InstancedBufferGeometry();
  geometry.index = base.index;
  for (const [name, attribute] of Object.entries(base.attributes)) geometry.setAttribute(name, attribute);
  for (const [name, size] of Object.entries(attrs)) {
    const attribute = new InstancedBufferAttribute(new Float32Array(capacity * size), size);
    attribute.setUsage(DynamicDrawUsage); // rewritten every frame
    geometry.setAttribute(name, attribute);
  }
  geometry.instanceCount = 0;
  geometry.boundingSphere = HUGE;
  return geometry;
}

/** A strip `rows` long across x ∈ {−1, 1}, y given per row. */
function strip(rowsY) {
  const rows = rowsY.length;
  const positions = new Float32Array(rows * 2 * 3);
  const index = new Uint16Array((rows - 1) * 6);
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < 2; s++) {
      const v = r * 2 + s;
      positions[v * 3] = s === 0 ? -1 : 1;
      positions[v * 3 + 1] = rowsY[r];
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
  return base;
}

/**
 * Feathers: `aFeather` = (s along the arm, row, side ±1, seed),
 * `aShape` = (length m, half-width m, angle jitter rad, layer).
 */
export function createFeatherGeometry(capacity, segments = 7) {
  const rows = [];
  for (let i = 0; i <= segments; i++) rows.push(i / segments);
  return instanced(strip(rows), capacity, { aFeather: 4, aShape: 4 });
}

/** A closed ribbon round the unit circle. */
export function createHaloGeometry(segments = 160) {
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const index = new Uint16Array(segments * 6);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    for (let s = 0; s < 2; s++) {
      const v = i * 2 + s;
      positions[v * 3] = a;
      positions[v * 3 + 1] = s === 0 ? -1 : 1;
      positions[v * 3 + 2] = 0;
    }
  }
  let k = 0;
  for (let i = 0; i < segments; i++) {
    const v = i * 2;
    index[k++] = v;
    index[k++] = v + 1;
    index[k++] = v + 2;
    index[k++] = v + 1;
    index[k++] = v + 3;
    index[k++] = v + 2;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.boundingSphere = HUGE;
  return geometry;
}

/** God-ray shafts: `aTop`/`aBottom` = (xyz, radius), `aRay` = (level, seed, -, -). */
export function createRayGeometry(capacity, radial = 28, rows = 10) {
  const positions = new Float32Array((radial + 1) * (rows + 1) * 3);
  const index = new Uint16Array(radial * rows * 6);
  for (let r = 0; r <= rows; r++) {
    for (let a = 0; a <= radial; a++) {
      const v = r * (radial + 1) + a;
      positions[v * 3] = (a / radial) * Math.PI * 2;
      positions[v * 3 + 1] = r / rows;
      positions[v * 3 + 2] = 0;
    }
  }
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let a = 0; a < radial; a++) {
      const v = r * (radial + 1) + a;
      const w = v + radial + 1;
      index[k++] = v;
      index[k++] = w;
      index[k++] = v + 1;
      index[k++] = v + 1;
      index[k++] = w;
      index[k++] = w + 1;
    }
  }
  const base = new BufferGeometry();
  base.setAttribute('position', new BufferAttribute(positions, 3));
  base.setIndex(new BufferAttribute(index, 1));
  return instanced(base, capacity, { aTop: 4, aBottom: 4, aRay: 4 });
}

/** Rows of a dart: trail tip → blade base (1) → blade tip (2). */
const DART_ROWS = [0, 0.25, 0.5, 0.7, 0.85, 0.95, 1.0, 1.15, 1.3, 1.45, 1.6, 1.75, 1.88, 2.0];

/** Feather darts: `aHead` = (tip xyz, level), `aDir` = (unit flight xyz, trail m), `aDart` = (seed, -, -, -). */
export function createDartGeometry(capacity) {
  return instanced(strip(DART_ROWS), capacity, { aHead: 4, aDir: 4, aDart: 4 });
}

/** Camera-facing glints: `aGlint` = (xyz, size), `aGlow` = (level, seed, spikes, -). */
export function createGlintGeometry(capacity) {
  const base = new BufferGeometry();
  base.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  base.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  return instanced(base, capacity, { aGlint: 4, aGlow: 4 });
}

/** A unit floor quad (XZ), uv 0..1. */
export function createSigilGeometry() {
  const geometry = new PlaneGeometry(1, 1, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** A unit camera-facing quad for the distortion proxy. */
export function createWarpGeometry() {
  return new PlaneGeometry(1, 1, 1, 1);
}
