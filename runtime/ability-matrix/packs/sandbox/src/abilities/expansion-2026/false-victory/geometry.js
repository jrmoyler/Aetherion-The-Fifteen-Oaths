import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  PlaneGeometry,
  Shape,
  Vector2,
} from 'three';

/**
 * False Victory — procedural geometry. Built once per pool member, in unit
 * space; every metre is applied from settings at draw time.
 *
 *  - **leaf** — a laurel leaf: a lens outline with a pointed tip, real
 *    thickness that thins to a knife edge, a raised midrib, a cupped blade
 *    and a curl along its length. Long axis +X (0 at the stalk, 1 at the
 *    tip), blade in XZ, thickness on Y. Two surfaces meet at the edge, so the
 *    shape is closed and lit from both sides.
 *  - **king** — a chess king turned on a lathe (stepped base, collar, waisted
 *    stem, flared crown) with an extruded cross, merged into one solid. Base
 *    at y = 0, height 1, base radius ~0.5.
 *  - **stem segment** — a short open tube along +X; the branches are laid
 *    from instances of it along their arcs every frame, so the gap and the
 *    radius stay live sliders.
 *  - **shard** — a bevelled, irregular mirror shard (for the leaf scatter).
 *  - **quad** / **cone** — carriers for the dais and the stage light shaders.
 */

/** Laurel leaf, closed, length 1 along +X. */
export function createLeafGeometry({ along = 18, across = 9 } = {}) {
  const positions = [];
  const indices = [];
  const thick = 0.09;
  const surface = (sign) => {
    const base = positions.length / 3;
    for (let i = 0; i <= along; i++) {
      const t = i / along;
      // Lens outline: rounded near the stalk, pointed at the tip.
      const width = 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.85);
      const curl = 0.16 * t * t; // the blade curls up toward the tip
      for (let j = 0; j <= across; j++) {
        const v = (j / across) * 2 - 1;
        const z = v * width;
        const cup = 0.22 * width * v * v; // edges lift: a cupped blade
        const body = thick * (1 - v * v) * Math.pow(Math.sin(Math.PI * t), 0.6);
        const rib = sign > 0 ? 0.035 * Math.exp(-v * v * 40) * Math.sin(Math.PI * Math.min(1, t * 1.1)) : 0;
        positions.push(t, curl + cup + sign * body + rib, z);
      }
    }
    for (let i = 0; i < along; i++) {
      for (let j = 0; j < across; j++) {
        const a = base + i * (across + 1) + j;
        const b = a + across + 1;
        if (sign > 0) indices.push(a, b, a + 1, b, b + 1, a + 1);
        else indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  };
  surface(1);
  surface(-1);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // uv.x = along the leaf, uv.y = across: the shader draws veins from them.
  const uv = new Float32Array((positions.length / 3) * 2);
  for (let k = 0, n = positions.length / 3; k < n; k++) {
    uv[k * 2] = positions[k * 3];
    uv[k * 2 + 1] = positions[k * 3 + 2] + 0.5;
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Merge non-indexed position/normal/uv geometries into one. */
function merge(parts) {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let count = 0;
  for (const g of flat) count += g.attributes.position.count;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of flat) {
    position.set(g.attributes.position.array, o * 3);
    normal.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  for (const g of parts) g.dispose();
  for (const g of flat) g.dispose();
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(position, 3));
  out.setAttribute('normal', new BufferAttribute(normal, 3));
  out.setAttribute('uv', new BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/** A turned chess king, height 1, base at the origin. */
export function createKingGeometry() {
  // Profile (radius, height) from the floor up: plinth, steps, bead, waisted
  // stem, collar, flared crown cup. Every step has a chamfer so the lathe
  // catches a highlight on each lip.
  const profile = [
    [0, 0], [0.5, 0], [0.5, 0.05], [0.46, 0.08], [0.46, 0.11], [0.4, 0.14],
    [0.36, 0.16], [0.36, 0.19], [0.3, 0.22], [0.24, 0.28], [0.2, 0.38],
    [0.17, 0.5], [0.16, 0.58], [0.22, 0.6], [0.26, 0.62], [0.26, 0.645],
    [0.19, 0.67], [0.17, 0.69], [0.2, 0.74], [0.27, 0.8], [0.31, 0.84],
    [0.3, 0.86], [0.2, 0.87], [0.12, 0.88], [0, 0.885],
  ].map(([r, y]) => new Vector2(r, y));
  const body = new LatheGeometry(profile, 40);
  // The cross on top: an extruded plus outline.
  const s = new Shape();
  const w = 0.045, arm = 0.11, h0 = 0.0, h1 = 0.17, bar = 0.1;
  s.moveTo(-w, h0); s.lineTo(w, h0); s.lineTo(w, bar - w); s.lineTo(arm, bar - w);
  s.lineTo(arm, bar + w); s.lineTo(w, bar + w); s.lineTo(w, h1); s.lineTo(-w, h1);
  s.lineTo(-w, bar + w); s.lineTo(-arm, bar + w); s.lineTo(-arm, bar - w); s.lineTo(-w, bar - w);
  s.lineTo(-w, h0);
  const cross = new ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 });
  cross.translate(0, 0.86, -0.035);
  // uv.y carries height so the shader can run seams and dissolve up the body.
  const fixUv = (g) => {
    const p = g.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = Math.atan2(p.getZ(i), p.getX(i)) / (Math.PI * 2) + 0.5;
      uv[i * 2 + 1] = p.getY(i);
    }
    g.setAttribute('uv', new BufferAttribute(uv, 2));
  };
  fixUv(body);
  fixUv(cross);
  return merge([body, cross]);
}

/** One stem segment: a short tube along +X (length 1, radius 1), centred. */
export function createStemSegmentGeometry() {
  const g = new CylinderGeometry(1, 1, 1, 8, 1, true);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** An irregular bevelled shard, ~1 m across before scaling. */
export function createShardGeometry() {
  const s = new Shape();
  s.moveTo(0, 0.5);
  s.lineTo(0.22, 0.05);
  s.lineTo(0.12, -0.42);
  s.lineTo(-0.18, -0.3);
  s.lineTo(-0.26, 0.12);
  s.lineTo(0, 0.5);
  const g = new ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 1 });
  g.translate(0, 0, -0.02);
  g.computeVertexNormals();
  return g;
}

/** Unit quad in XY (rotated flat by the owner). */
export function createQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}

/** Open cone carrier for the stage light: unit height, base at y = 0. */
export function createConeGeometry() {
  const g = new CylinderGeometry(1, 1, 1, 48, 12, true);
  g.translate(0, 0.5, 0);
  return g;
}
