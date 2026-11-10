import { BufferAttribute, BufferGeometry, CylinderGeometry, ExtrudeGeometry, PlaneGeometry, Shape } from 'three';

/**
 * Procedural geometry for the Hall of Echoes.
 *
 *   - the **mirror shard**: a faceted sliver of mirror — an irregular
 *     polygon whose front and back are low pyramids rising to an off-centre
 *     apex, so every triangle is its own flat facet and the shard flashes
 *     facet by facet as it tumbles. `aEdge` is 1 on the rim, 0 at the apex,
 *     which the shader turns into a bright silvered edge;
 *   - the **dais**: a unit floor quad the projector-circle shader draws into;
 *   - the **projector beam**: an open cone, narrow at the floor node and wide
 *     at the top, foot on y = 0, height 1.
 */

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Unit-ish: fits a radius of 0.5 in XY, `depth` thick. Non-indexed so every
 * facet carries its own flat normal.
 *
 * @param {number} [seed]
 * @param {number} [sides]  rim corners (4–7 read as broken mirror)
 * @param {number} [depth]  apex height either side, × radius
 */
export function createMirrorShardGeometry(seed = 3, sides = 5, depth = 0.08) {
  const rim = [];
  const angles = [];
  for (let i = 0; i < sides; i++) angles.push((i + hash(seed + i * 1.37) * 0.8) / sides);
  angles.sort((a, b) => a - b);
  for (let i = 0; i < sides; i++) {
    const a = angles[i] * Math.PI * 2;
    // Long and thin: mirror breaks into slivers more often than into discs.
    const r = 0.5 * (0.45 + hash(seed * 3.1 + i * 5.7) * 0.55);
    rim.push([Math.cos(a) * r * 0.6, Math.sin(a) * r]);
  }
  const apex = [(hash(seed + 9.1) - 0.5) * 0.12, (hash(seed + 4.3) - 0.5) * 0.2];

  const positions = [];
  const normals = [];
  const edges = [];
  const tri = (a, b, c, ea, eb, ec) => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (const [p, e] of [
      [a, ea],
      [b, eb],
      [c, ec]
    ]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(nx, ny, nz);
      edges.push(e);
    }
  };

  const front = [apex[0], apex[1], depth * 0.5];
  const back = [apex[0], apex[1], -depth * 0.5];
  for (let i = 0; i < sides; i++) {
    const p = rim[i];
    const q = rim[(i + 1) % sides];
    tri(front, [p[0], p[1], 0], [q[0], q[1], 0], 0, 1, 1);
    tri(back, [q[0], q[1], 0], [p[0], p[1], 0], 0, 1, 1);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('aEdge', new BufferAttribute(new Float32Array(edges), 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The projector circle: −0.5..0.5 in XZ, facing up. */
export function createEchoDaisGeometry() {
  return new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
}

/** A projector beam: open cone, foot radius `foot`, top radius 1, height 1, foot on y = 0. */
export function createEchoBeamGeometry(foot = 0.12) {
  return new CylinderGeometry(1, foot, 1, 32, 1, true).translate(0, 0.5, 0);
}

/**
 * One pane of the hall: a **round-arched mirror slab** with a bevelled edge,
 * the shape of a looking-glass in a fairground hall of mirrors. Built at its
 * real size (so the arch stays round whatever the width/height sliders say —
 * the ability rebuilds it when they move): foot on y = 0, `width` across X
 * centred, `height` to the crown of the arch, `depth` thick along Z with the
 * mirror face toward +Z. The foot runs `sink` metres below the floor so a
 * rising pane comes *out of* the floor rather than sitting on it.
 *
 * `position.xy` doubles as the face's own coordinates in the material, which
 * measures the distance to the arch outline analytically for the silvered rim
 * and lays its cracks in it.
 *
 * @param {number} width  metres
 * @param {number} height metres to the crown
 * @param {number} depth  metres
 */
export function createHallPanelGeometry(width = 1.25, height = 2.9, depth = 0.08) {
  const w = width * 0.5;
  const spring = Math.max(0.05, height - w);
  const sink = 0.4;
  const shape = new Shape();
  shape.moveTo(-w, -sink);
  shape.lineTo(w, -sink);
  shape.lineTo(w, spring);
  shape.absarc(0, spring, w, 0, Math.PI, false);
  shape.lineTo(-w, -sink);
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: Math.min(0.04, depth * 0.5),
    bevelSize: Math.min(0.05, w * 0.1),
    bevelSegments: 2,
    curveSegments: 18
  });
  geometry.translate(0, 0, -depth * 0.5);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
