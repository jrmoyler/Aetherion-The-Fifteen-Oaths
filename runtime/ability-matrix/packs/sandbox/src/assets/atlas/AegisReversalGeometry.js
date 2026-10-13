import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Procedural geometry for the Aegis Reversal.
 *
 *  - the **plate blank** — one shield plate in *parameter space*. A plate is
 *    an annular sector (a slice of a ring) with thickness and a bevelled edge,
 *    and every one of those numbers is a live slider, so the blank holds none
 *    of them: `position = (u, v, face)` with `u` 0 → 1 across the sector's
 *    angle, `v` 0 → 1 from its inner to its outer radius and `face` ±1 for
 *    the front and back skins. The vertex stage in `AegisReversalMaterials`
 *    reads each instance's radii and angles and builds the plate there —
 *    which is also how the rings *spin*: the angles change, the blank does
 *    not. `aKind`: 0 skins, 1 the radial walls (u = 0 / 1), 2 the arc walls
 *    (v = 0 / 1).
 *  - the **strip** — `(s, h)` with `s` −1 → 1 across and `h` 0 → 1 up: the
 *    counter-wave's standing front, bent round the cone's arc in the vertex
 *    stage, and the bolt, stretched along its flight.
 */

/**
 * @param {number} [across] columns across the sector's angle
 * @param {number} [radial] rows from inner to outer radius
 */
export function createShieldPlateGeometry(across = 10, radial = 6) {
  const positions = [];
  const kinds = [];
  const indices = [];
  const vertex = (u, v, face, kind) => {
    positions.push(u, v, face);
    kinds.push(kind);
    return kinds.length - 1;
  };

  /* --- front and back skins --- */
  for (const face of [1, -1]) {
    const base = kinds.length;
    for (let r = 0; r <= radial; r++) {
      for (let c = 0; c <= across; c++) vertex(c / across, r / radial, face, 0);
    }
    const stride = across + 1;
    for (let r = 0; r < radial; r++) {
      for (let c = 0; c < across; c++) {
        const i = base + r * stride + c;
        const j = i + stride;
        if (face > 0) indices.push(i, i + 1, j, i + 1, j + 1, j);
        else indices.push(i, j, i + 1, i + 1, j, j + 1);
      }
    }
  }

  /* --- radial walls: u = 0 and u = 1 --- */
  for (const u of [0, 1]) {
    const base = kinds.length;
    for (let r = 0; r <= radial; r++) {
      vertex(u, r / radial, 1, 1);
      vertex(u, r / radial, -1, 1);
    }
    for (let r = 0; r < radial; r++) {
      const i = base + r * 2;
      if (u > 0) indices.push(i, i + 2, i + 1, i + 2, i + 3, i + 1);
      else indices.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
    }
  }

  /* --- arc walls: v = 0 and v = 1 --- */
  for (const v of [0, 1]) {
    const base = kinds.length;
    for (let c = 0; c <= across; c++) {
      vertex(c / across, v, 1, 2);
      vertex(c / across, v, -1, 2);
    }
    for (let c = 0; c < across; c++) {
      const i = base + c * 2;
      if (v > 0) indices.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
      else indices.push(i, i + 2, i + 1, i + 2, i + 3, i + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aKind', new BufferAttribute(new Float32Array(kinds), 1));
  geometry.setIndex(indices);
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * A strip in parameter space, `(s, h, 0)`, `s` −1 → 1, `h` 0 → 1.
 * @param {number} [columns]
 * @param {number} [rows]
 */
export function createStripGeometry(columns = 48, rows = 4) {
  const positions = [];
  const indices = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= columns; c++) positions.push((c / columns) * 2 - 1, r / rows, 0);
  }
  const stride = columns + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const i = r * stride + c;
      indices.push(i, i + 1, i + stride, i + 1, i + stride + 1, i + stride);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
