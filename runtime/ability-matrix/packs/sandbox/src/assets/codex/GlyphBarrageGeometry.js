import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * Glyph Barrage — the seal stone.
 *
 * The hero of the cast is the thing that does the stamping: a heavy obsidian
 * seal with a faceted body, a chamfered striking face and a turned handle —
 * the silhouette of a wax-seal stamp, so the verb "stamp" is read before the
 * light arrives. It is a faceted lathe (flat-shaded, every facet catches the
 * sun on its own), with alternate rows turned half a facet so the edges zig
 * rather than stack.
 *
 * Unit sizes: striking face radius 1 at y = 0, overall height ≈ 1.2. The
 * ability scales it from `glyphRadius × sealSize`. A per-vertex `aPart`
 * marks the striking face (0), the body band that carries the runes (1) and
 * the handle (2), so the material can engrave the right surfaces.
 */
export function createSealGeometry({ sides = 8 } = {}) {
  const TAU = Math.PI * 2;
  // [radius, height, part]
  const profile = [
    [0.0, 0.0, 0],
    [0.93, 0.0, 0],
    [1.0, 0.07, 1],
    [1.0, 0.27, 1],
    [0.88, 0.36, 2],
    [0.46, 0.41, 2],
    [0.3, 0.52, 2],
    [0.25, 0.72, 2],
    [0.4, 0.86, 2],
    [0.46, 0.98, 2],
    [0.33, 1.12, 2],
    [0.0, 1.19, 2],
  ];
  const position = [];
  const part = [];
  const point = (row, i) => {
    const [r, y] = profile[row];
    const a = ((i + (row % 2) * 0.5) * TAU) / sides;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  };
  const tri = (a, b, c, p) => {
    position.push(...a, ...b, ...c);
    part.push(p, p, p);
  };
  for (let row = 0; row < profile.length - 1; row++) {
    const p = profile[row + 1][2];
    for (let i = 0; i < sides; i++) {
      const a = point(row, i), b = point(row, i + 1);
      const c = point(row + 1, i), d = point(row + 1, i + 1);
      // Winding so the outside faces out (counter-clockwise seen from outside).
      if (row % 2 === 0) { tri(a, c, d, p); tri(a, d, b, p); }
      else { tri(a, c, b, p); tri(b, c, d, p); }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('aPart', new Float32BufferAttribute(part, 1));
  g.computeVertexNormals(); // non-indexed: flat facets
  g.computeBoundingSphere();
  return g;
}
