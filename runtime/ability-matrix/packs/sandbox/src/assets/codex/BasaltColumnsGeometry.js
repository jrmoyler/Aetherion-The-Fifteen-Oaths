import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * Basalt Columns — procedural geometry.
 *
 * One flat-topped hexagonal prism, built so an instance matrix can place it
 * straight from the hex grid the floor shader cracks into:
 *
 *   - **flat-top orientation**: corner 0 sits on +X, then every 60° toward +Z.
 *     The floor's hex SDF (`hexDist` in BasaltColumnsMaterials) uses the same
 *     convention, so a column stands exactly inside the seam it rose out of.
 *   - **unit circumradius** in XZ and **unit length** in Y, hanging *down*
 *     from y = 0: the instance's translation is the column's top, its Y scale
 *     the full length of the shaft. A column sunk to y ≈ 0 is entirely under
 *     the stage floor, which is opaque, so it needs no clipping to vanish.
 *   - a small **chamfer** round the top: the cap is inset by `bevel` (unit
 *     radius) and the chamfer drops `bevelDrop` (unit length). Because the
 *     shaft is scaled several metres long and only a fraction of a metre wide,
 *     the drop is passed in already divided by that length — see
 *     `BasaltColumnsAbility#_columnGeometry`, which rebuilds this when either
 *     number moves.
 *
 * Non-indexed (every face owns its corners) so faces stay hard-edged; the
 * shader rebuilds a true facet normal from derivatives anyway. A float
 * attribute `aPart` tags each face: 0 shaft, 1 chamfer, 2 cap — the shader
 * strata-bands the shaft, wears the chamfer and cracks the cap.
 *
 * @param {number} bevel     0..0.5, how far the cap is inset (unit radius)
 * @param {number} bevelDrop 0..0.5, how far the chamfer drops (unit length)
 * @returns {BufferGeometry}
 */
export function createHexColumnGeometry(bevel = 0.1, bevelDrop = 0.02) {
  const b = Math.min(0.5, Math.max(0, bevel));
  const drop = Math.min(0.5, Math.max(0.0005, bevelDrop));
  const positions = [];
  const parts = [];

  const corner = (k, radius, y) => {
    const a = (k % 6) * (Math.PI / 3);
    return [Math.cos(a) * radius, y, Math.sin(a) * radius];
  };

  /**
   * Push a triangle, wound so its normal faces `out` (a rough outward
   * direction). Done by test rather than by bookkeeping, so the winding is
   * right whatever order the corners were listed in.
   */
  const tri = (a, b2, c, out, part) => {
    const ux = b2[0] - a[0];
    const uy = b2[1] - a[1];
    const uz = b2[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const flip = nx * out[0] + ny * out[1] + nz * out[2] < 0;
    const list = flip ? [a, c, b2] : [a, b2, c];
    for (const p of list) positions.push(p[0], p[1], p[2]);
    parts.push(part, part, part);
  };

  for (let k = 0; k < 6; k++) {
    // Outward: the middle of this face, flat.
    const am = (k + 0.5) * (Math.PI / 3);
    const out = [Math.cos(am), 0, Math.sin(am)];

    /* shaft: y = −1 … −drop at full radius */
    const s0 = corner(k, 1, -1);
    const s1 = corner(k + 1, 1, -1);
    const s2 = corner(k + 1, 1, -drop);
    const s3 = corner(k, 1, -drop);
    tri(s0, s1, s2, out, 0);
    tri(s0, s2, s3, out, 0);

    /* chamfer: full radius at −drop up to the inset cap at 0 */
    const c2 = corner(k + 1, 1 - b, 0);
    const c3 = corner(k, 1 - b, 0);
    const outUp = [out[0], 0.6, out[2]];
    tri(s3, s2, c2, outUp, 1);
    tri(s3, c2, c3, outUp, 1);

    /* cap: a fan to the centre, very slightly domed so it catches light */
    tri(c3, c2, [0, drop * 0.25, 0], [0, 1, 0], 2);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aPart', new Float32BufferAttribute(parts, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Centre of the flat-top hex cell with axial coordinates (q, r).
 * Shared by the layout and mirrored in the floor shader's `hexCentre`.
 *
 * @param {number} q
 * @param {number} r
 * @param {number} size circumradius, metres
 * @param {{x:number, z:number}} out written in place
 */
export function hexCellCentre(q, r, size, out) {
  out.x = size * 1.5 * q;
  out.z = size * Math.sqrt(3) * (r + q * 0.5);
  return out;
}
