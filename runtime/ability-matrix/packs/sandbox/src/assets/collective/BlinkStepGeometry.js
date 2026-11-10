import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * Blink Step — procedural geometry.
 *
 * ## The rift (`createRiftGeometry`)
 *
 * The hero of the cast: the tear in the air the caster steps into at one end
 * of the line and is spat back out of at the other. Built as a **parameter
 * grid with no metres in it** — every vertex is `(v, u, 0)`:
 *
 *   - `u` 0 → 1 runs from the foot of the tear to its tip;
 *   - `v` −`halo` → +`halo` runs across it. |v| ≤ 1 is the lens itself (the
 *     void), 1 < |v| ≤ `halo` is the cracked skin of space round it.
 *
 * `createBlinkRiftMaterial` places it in the vertex stage: the lens profile
 * (a pointed almond, wider just below the middle), the jag of its lips (noise
 * along `u`, re-rolled per cast), how far it is open, the bulge of its belly
 * and the width of the crack halo are all uniforms, so one buffer draws a
 * hairline scar, a gaping door or anything between, and every slider reshapes
 * a rift that is already standing. Rows are denser toward the lips (|v| ≈ 1),
 * where the jag and the hot rim live.
 *
 * ## The scar carrier (`createScarGeometry`)
 *
 * A `(along, across)` grid in 0..1 that the scar material lays down the cast
 * line in the vertex stage: `along` from behind the start to past the end,
 * `across` the scar's width. Subdivided along its length so the floor seam can
 * follow the travelling front without a stretched triangle.
 */

/**
 * @param {object} [o]
 * @param {number} [o.rows=56]   steps from foot to tip
 * @param {number} [o.cols=18]   steps across one side (lens + halo)
 * @param {number} [o.halo=1.9]  outer edge of the crack halo, in lens half-widths
 */
export function createRiftGeometry({ rows = 56, cols = 18, halo = 1.9 } = {}) {
  // Across one side: dense near the lip (v = 1), sparse in the void and at the
  // halo's outer edge. Mirrored for the other side, centre shared.
  const side = [];
  const lensSteps = Math.ceil(cols * 0.55);
  for (let i = 0; i <= lensSteps; i++) {
    const t = i / lensSteps;
    side.push(1 - Math.pow(1 - t, 2.2)); // 0 … 1, bunched toward the lip
  }
  const haloSteps = cols - lensSteps;
  for (let i = 1; i <= haloSteps; i++) {
    const t = i / haloSteps;
    side.push(1 + (halo - 1) * Math.pow(t, 1.6)); // 1 … halo, bunched at the lip
  }
  const across = [];
  for (let i = side.length - 1; i > 0; i--) across.push(-side[i]);
  for (let i = 0; i < side.length; i++) across.push(side[i]);

  const position = [];
  const index = [];
  const width = across.length;
  for (let r = 0; r <= rows; r++) {
    const u = r / rows;
    for (let k = 0; k < width; k++) position.push(across[k], u, 0);
  }
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < width - 1; k++) {
      const a = r * width + k;
      const b = a + 1;
      const c = a + width;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.userData.halo = halo;
  return g;
}

/**
 * A `(along, across)` grid in 0..1 for the floor scar.
 * @param {number} [along=160]
 * @param {number} [across=12]
 */
export function createScarGeometry(along = 160, across = 12) {
  const position = [];
  const index = [];
  const row = across + 1;
  for (let i = 0; i <= along; i++) {
    for (let k = 0; k <= across; k++) position.push(i / along, k / across, 0);
  }
  for (let i = 0; i < along; i++) {
    for (let k = 0; k < across; k++) {
      const a = i * row + k;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  return g;
}
