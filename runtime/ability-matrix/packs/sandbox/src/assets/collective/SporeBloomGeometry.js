import { BufferGeometry, Float32BufferAttribute, Sphere, Vector3 } from 'three';

/**
 * One mushroom, in *unit* space, for the Spore Bloom.
 *
 * The geometry holds no metres. Every vertex carries a unit-space position, a
 * unit-space normal, which part it belongs to (`aPart`: 0 stem, 1 cap top,
 * 2 cap underside) and how far along that part's profile it sits (`aRadial`:
 * up the stem, or out from the middle of the cap). The vertex shader in
 * `SporeBloomMaterials.js` turns that into a mushroom of any stem height, stem
 * radius, cap radius and cap height, opening or wilting — which is what keeps
 * every dimension a live slider on a bloom that is already standing, without
 * one geometry per size.
 *
 * Parts are built as separate lathe strips rather than one continuous profile,
 * so the crease where the cap's rim turns under is a real normal break: a
 * single smooth profile rounds it off and the cap reads as a mushroom-shaped
 * balloon.
 *
 * Unit space:
 *   - stem: radius 1 (before its own profile), y from 0 to 1
 *   - cap:  radius 1 at the rim, dome top at y = 1, underside just below y = 0;
 *           the shader lifts it onto the top of the stem
 */

const TAU = Math.PI * 2;

/**
 * Lathe one strip of profile rows round the Y axis.
 *
 * @param {object[]} rows  { r, h, nr, nh, radial } — radius, height, the
 *                         profile normal's radial and vertical components, and
 *                         the value written to `aRadial`
 * @param {number} part    written to `aPart`
 */
function lathe(rows, part, sides, out) {
  const base = out.positions.length / 3;
  for (const row of rows) {
    const nl = Math.hypot(row.nr, row.nh) || 1;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * TAU;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      out.positions.push(c * row.r, row.h, sn * row.r);
      out.normals.push((c * row.nr) / nl, row.nh / nl, (sn * row.nr) / nl);
      out.parts.push(part);
      out.radials.push(row.radial);
    }
  }
  const stride = sides + 1;
  for (let i = 0; i < rows.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const a = base + i * stride + s;
      const b = a + stride;
      // Wound so the outward face is front-facing for rows that go upward or
      // outward; the material is DoubleSide anyway, so a strip that runs the
      // other way is still drawn.
      out.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

/**
 * @param {object} [options]
 * @param {number} [options.sides]     segments round the axis
 * @param {number} [options.stemRows]  rows up the stem
 * @param {number} [options.capRows]   rows over the dome
 * @param {number} [options.gillRows]  rows across the underside
 */
export function createMushroomGeometry({ sides = 18, stemRows = 9, capRows = 12, gillRows = 6 } = {}) {
  const out = { positions: [], normals: [], parts: [], radials: [], indices: [] };

  /* ---- the stem: a little bulb at the foot, slimmer under the cap ---- */
  const stem = [];
  for (let i = 0; i <= stemRows; i++) {
    const t = i / stemRows;
    const r = 0.86 + 0.55 * Math.pow(1 - t, 4) - 0.1 * t;
    // d(r)/d(t), so the normal leans out where the bulb swells.
    const dr = -2.2 * Math.pow(1 - t, 3) - 0.1;
    stem.push({ r, h: t, nr: 1, nh: -dr * 0.25, radial: t });
  }
  lathe(stem, 0, sides, out);

  /* ---- the dome: a squashed hemisphere ---- */
  const top = [];
  for (let i = 0; i <= capRows; i++) {
    const s = i / capRows;
    // Starts a hair off the axis so the pole is not a fan of slivers.
    const phi = 0.02 + s * (Math.PI / 2 - 0.02);
    top.push({ r: Math.sin(phi), h: Math.cos(phi), nr: Math.sin(phi), nh: Math.cos(phi), radial: Math.sin(phi) });
  }
  lathe(top, 1, sides, out);

  /* ---- the lip and the gills ---- */
  const under = [
    { r: 1.0, h: 0.0, nr: 0.7, nh: -0.7, radial: 1.0 },
    { r: 0.96, h: -0.09, nr: 0.15, nh: -1, radial: 0.98 }
  ];
  for (let i = 1; i <= gillRows; i++) {
    const s = i / gillRows;
    const r = 0.96 + (0.16 - 0.96) * s;
    // The underside is slightly concave: it rises toward the stem.
    const h = -0.09 + 0.07 * s * s;
    under.push({ r, h, nr: -0.08, nh: -1, radial: r });
  }
  lathe(under, 2, sides, out);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(out.positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(out.normals, 3));
  geometry.setAttribute('aPart', new Float32BufferAttribute(out.parts, 1));
  geometry.setAttribute('aRadial', new Float32BufferAttribute(out.radials, 1));
  geometry.setIndex(out.indices);
  // The shader sizes the mushroom; the unit bounds mean nothing. The ability
  // turns frustum culling off on the mesh as well.
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * The seed pod's trail: a camera-facing strip of `segments + 1` rows.
 *
 * Each row is two vertices sharing a centre (`position`, rewritten by the
 * ability every frame from the pod's lob — no metres live here), the flight
 * tangent there (`aTangent`), how far back along the trail it is (`aAlong`,
 * 0 at the pod, 1 at the tail) and which side it is (`aSide`, ±1). The vertex
 * shader turns the pair into a ribbon facing the camera, so it reads at full
 * width from any angle.
 */
export function createSporeTrailGeometry(segments = 40) {
  const rows = segments + 1;
  const position = new Float32Array(rows * 2 * 3);
  const tangent = new Float32Array(rows * 2 * 3);
  const along = new Float32Array(rows * 2);
  const side = new Float32Array(rows * 2);
  const index = [];
  for (let i = 0; i < rows; i++) {
    along[i * 2] = along[i * 2 + 1] = i / segments;
    side[i * 2] = -1;
    side[i * 2 + 1] = 1;
    tangent[i * 6 + 2] = tangent[i * 6 + 5] = 1;
    if (i < segments) {
      const j = i * 2;
      index.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('aTangent', new Float32BufferAttribute(tangent, 3));
  geometry.setAttribute('aAlong', new Float32BufferAttribute(along, 1));
  geometry.setAttribute('aSide', new Float32BufferAttribute(side, 1));
  geometry.setIndex(index);
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
