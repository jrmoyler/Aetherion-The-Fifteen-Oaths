import { BufferAttribute, BufferGeometry, TorusGeometry } from 'three';

/**
 * Procedural geometry for the Chrono Fracture.
 *
 * Two shapes: the glass **plate** — a thin, irregular, bevelled pane, which is
 * what both the suspended shards and the shattered shell are made of — and the
 * **ring blank**, a torus the ring shader reshapes into a gyroscope band.
 */

function hash(n) {
  const s = Math.sin(n * 91.345 + 47.853) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * A pane of broken glass: an irregular convex polygon in XY, extruded to a
 * thickness in Z, with every face flat so a facet catches the light as one
 * plane. Unit-ish: it fits inside a radius of 0.5 and is `thickness` deep, so
 * an instance scale is its size in metres. Centred on its own middle, so it
 * tumbles about itself.
 *
 * Non-indexed on purpose: flat shading wants each face its own normals.
 *
 * @param {number} [seed]
 * @param {number} [sides]      corners of the outline (3–7 read as glass)
 * @param {number} [thickness]  depth, × the outline's radius
 * @param {number} [sliver]     0..1 how long and thin it is
 */
export function createGlassPlateGeometry(seed = 1, sides = 5, thickness = 0.08, sliver = 0.4) {
  const outline = [];
  // Angles sorted so the polygon stays convex, radii jittered so no two corners agree.
  const angles = [];
  for (let i = 0; i < sides; i++) angles.push((i + hash(seed + i * 3.1) * 0.7) / sides);
  angles.sort((a, b) => a - b);
  const stretch = 1 + sliver * 1.4;
  for (let i = 0; i < sides; i++) {
    const a = angles[i] * Math.PI * 2;
    const r = 0.5 * (0.55 + hash(seed * 1.7 + i * 7.3) * 0.45);
    outline.push([Math.cos(a) * r, (Math.sin(a) * r * stretch) / Math.sqrt(stretch)]);
  }
  const half = (thickness * 0.5);

  const positions = [];
  const normals = [];
  const uvs = [];
  const push = (x, y, z, nx, ny, nz) => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    uvs.push(x + 0.5, y + 0.5);
  };

  // Front and back fans.
  for (let i = 1; i < sides - 1; i++) {
    const [ax, ay] = outline[0];
    const [bx, by] = outline[i];
    const [cx, cy] = outline[i + 1];
    push(ax, ay, half, 0, 0, 1);
    push(bx, by, half, 0, 0, 1);
    push(cx, cy, half, 0, 0, 1);
    push(ax, ay, -half, 0, 0, -1);
    push(cx, cy, -half, 0, 0, -1);
    push(bx, by, -half, 0, 0, -1);
  }
  // The broken edges.
  for (let i = 0; i < sides; i++) {
    const [ax, ay] = outline[i];
    const [bx, by] = outline[(i + 1) % sides];
    let nx = by - ay;
    let ny = -(bx - ax);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    push(ax, ay, half, nx, ny, 0);
    push(ax, ay, -half, nx, ny, 0);
    push(bx, by, half, nx, ny, 0);
    push(bx, by, half, nx, ny, 0);
    push(ax, ay, -half, nx, ny, 0);
    push(bx, by, -half, nx, ny, 0);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  return geometry;
}

/**
 * The blank every clock ring is cut from: a torus of major radius 1 and tube
 * radius 0.5, lying in XY. The ring shader re-places every vertex from
 * uniforms — major radius, tube and band width in metres — so the rings can be
 * resized live without a rebuild, and the cross-section can be stretched into
 * a flat band, which a stock torus cannot do with a scale.
 */
export function createRingBlankGeometry(radialSegments = 14, tubularSegments = 220) {
  return new TorusGeometry(1, 0.5, radialSegments, tubularSegments);
}
