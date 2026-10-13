import { BufferAttribute, BufferGeometry, LatheGeometry, Sphere, Vector2, Vector3 } from 'three';

/**
 * Procedural geometry for the Dawn Sanctuary.
 *
 * Two shapes:
 *
 *  - the **petal blank** — a thick, two-faced leaf in *parameter space*. It
 *    holds no metres and no curve: `position` is `(t, a, face)`, where `t` runs
 *    0 → 1 from the hinge to the tip, `a` runs −1 → 1 across the petal, and
 *    `face` is +1 on the upper skin and −1 on the lower. The vertex stage in
 *    `DawnSanctuaryMaterials.js` turns that into a petal of any length,
 *    width, taper, cup, curl and pitch — so every one of those is a live
 *    slider on a lotus that is already open, and one blank serves all three
 *    rings of an instanced mesh;
 *  - the **seed pod** — the brass hub the petals hinge on, a plain lathe.
 *
 * `aKind` tells the vertex stage how to rebuild the normal: 0 for the two
 * skins (finite differences across the surface), 1 for the side walls (the
 * across direction), 2 for the end caps at the hinge and the tip (along the
 * petal). Hard creases at the walls are real normal breaks, because the walls
 * are separate strips — a petal that is rounded off at its edge reads as
 * rubber, not as stamped brass.
 */

/**
 * @param {number} [rows]    vertex rows from hinge to tip
 * @param {number} [columns] vertex columns across one skin
 */
export function createPetalBlankGeometry(rows = 28, columns = 8) {
  const positions = [];
  const kinds = [];
  const indices = [];

  const vertex = (t, a, face, kind) => {
    positions.push(t, a, face);
    kinds.push(kind);
    return kinds.length - 1;
  };

  /* --- the two skins --- */
  for (const face of [1, -1]) {
    const base = kinds.length;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      for (let c = 0; c <= columns; c++) vertex(t, (c / columns) * 2 - 1, face, 0);
    }
    const stride = columns + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const i = base + r * stride + c;
        const j = i + stride;
        // Wound opposite on the lower skin so both face outward; the material is
        // double-sided anyway, the winding only matters to the normal check.
        if (face > 0) indices.push(i, j, i + 1, i + 1, j, j + 1);
        else indices.push(i, i + 1, j, i + 1, j + 1, j);
      }
    }
  }

  /* --- the side walls, a = ±1 --- */
  for (const a of [-1, 1]) {
    const base = kinds.length;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      vertex(t, a, 1, 1);
      vertex(t, a, -1, 1);
    }
    for (let r = 0; r < rows; r++) {
      const i = base + r * 2;
      if (a > 0) indices.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
      else indices.push(i, i + 2, i + 1, i + 2, i + 3, i + 1);
    }
  }

  /* --- the end caps, t = 0 and t = 1 --- */
  for (const t of [0, 1]) {
    const base = kinds.length;
    for (let c = 0; c <= columns; c++) {
      const a = (c / columns) * 2 - 1;
      vertex(t, a, 1, 2);
      vertex(t, a, -1, 2);
    }
    for (let c = 0; c < columns; c++) {
      const i = base + c * 2;
      if (t > 0) indices.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
      else indices.push(i, i + 2, i + 1, i + 2, i + 3, i + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aKind', new BufferAttribute(new Float32Array(kinds), 1));
  geometry.setIndex(indices);
  // Shaped entirely in the vertex stage; three cannot know where it ends up.
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * The seed pod: a squat brass dome with a lip, radius 1 and height 1 in unit
 * space, opening downward onto the hinge ring. Scaled per frame from settings.
 */
export function createSeedPodGeometry(segments = 48) {
  const profile = [];
  // From the axis at the crown, out over the shoulder, down to a flared lip.
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const a = k * Math.PI * 0.5;
    profile.push(new Vector2(Math.sin(a) * 0.86 + 1e-3, 0.25 + Math.cos(a) * 0.75));
  }
  profile.push(new Vector2(0.95, 0.18));
  profile.push(new Vector2(1.0, 0.1));
  profile.push(new Vector2(0.98, 0.0));
  return new LatheGeometry(profile, segments);
}
