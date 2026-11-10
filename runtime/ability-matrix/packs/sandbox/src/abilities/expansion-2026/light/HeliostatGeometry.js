import { BufferAttribute, BufferGeometry } from 'three';

/**
 * Procedural geometry for Heliostat Verdict.
 *
 * Nothing here is a stock primitive standing in for a shape: every mesh is
 * authored in metres with the silhouette the spell is about — a concave dish of
 * mirror slabs, lenticular iris blades, a fluted cone of gathered light, a ray
 * that *narrows* toward its target because it is being focused.
 *
 * All builders return non-indexed-per-face (flat) vertices where a hard edge
 * is wanted, and shared vertices where the surface should read smooth. The
 * shaders read `uv` (and, on the dish, `aInfo`) rather than world position, so
 * every pattern is stable while the rig spins and scales.
 */

const TAU = Math.PI * 2;

/** Minimal accumulating builder: positions, uvs, an optional vec2 attribute. */
class MeshBuilder {
  constructor(withInfo = false) {
    this.positions = [];
    this.uvs = [];
    this.info = withInfo ? [] : null;
    this.indices = [];
  }

  vertex(x, y, z, u, v, i0 = 0, i1 = 0) {
    this.positions.push(x, y, z);
    this.uvs.push(u, v);
    if (this.info) this.info.push(i0, i1);
    return this.positions.length / 3 - 1;
  }

  /** Two triangles, wound a → b → c → d. */
  quad(a, b, c, d) {
    this.indices.push(a, b, c, a, c, d);
  }

  tri(a, b, c) {
    this.indices.push(a, b, c);
  }

  build() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));
    if (this.info) geometry.setAttribute('aInfo', new BufferAttribute(new Float32Array(this.info), 2));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}

/** Face ids carried in `aInfo.y`, so the mirror shader can tell glass from frame. */
export const HELIOSTAT_FACE = Object.freeze({ GLASS: 0, BACK: 1, FRAME: 2, HUB: 3 });

/** Height of the concave dish at radius `r` — a shallow paraboloid, so it focuses. */
const dish = (r) => 0.16 * r * r;

/**
 * The heliostat: twelve concave mirror slabs on spokes round a hub.
 *
 * Lies in the XZ plane with the reflective glass facing *down* (toward the
 * target it hangs over). Each slab is a 5 × 5 patch of the paraboloid with real
 * thickness — glass underneath, a back plate above, four rim walls between —
 * so it catches a highlight edge-on instead of vanishing like a card. A
 * hexagonal hub with a downward focus nib and twelve box spokes holds it
 * together. `aInfo.x` is the panel index (0..1), `aInfo.y` a `HELIOSTAT_FACE`.
 */
export function heliostatGeometry() {
  const b = new MeshBuilder(true);
  const panels = 12;
  const inner = 0.62;
  const outer = 1.32;
  const halfSpan = 0.2; // radians each side of the panel's centre bearing
  const thickness = 0.045;
  const steps = 4;

  for (let i = 0; i < panels; i++) {
    const centre = (i * TAU) / panels;
    const id = i / panels;
    const point = (s, t, lift) => {
      const angle = centre + (s * 2 - 1) * halfSpan;
      const r = inner + (outer - inner) * t;
      return [Math.cos(angle) * r, dish(r) + lift, Math.sin(angle) * r];
    };

    // Glass (underside) and back plate (top), each a (steps+1)² patch.
    for (const [lift, face] of [[0, HELIOSTAT_FACE.GLASS], [thickness, HELIOSTAT_FACE.BACK]]) {
      const base = b.positions.length / 3;
      for (let row = 0; row <= steps; row++) {
        for (let col = 0; col <= steps; col++) {
          const s = col / steps;
          const t = row / steps;
          const [x, y, z] = point(s, t, lift);
          b.vertex(x, y, z, s, t, id, face);
        }
      }
      for (let row = 0; row < steps; row++) {
        for (let col = 0; col < steps; col++) {
          const a = base + row * (steps + 1) + col;
          const c = a + steps + 1;
          // Glass faces down, the back plate up: opposite windings.
          if (face === HELIOSTAT_FACE.GLASS) b.quad(a, a + 1, c + 1, c);
          else b.quad(a, c, c + 1, a + 1);
        }
      }
    }

    // Rim walls: walk the patch boundary and drop a wall from back to glass.
    const boundary = [];
    for (let col = 0; col < steps; col++) boundary.push([col / steps, 0]);
    for (let row = 0; row < steps; row++) boundary.push([1, row / steps]);
    for (let col = steps; col > 0; col--) boundary.push([col / steps, 1]);
    for (let row = steps; row > 0; row--) boundary.push([0, row / steps]);
    for (let k = 0; k < boundary.length; k++) {
      const [s0, t0] = boundary[k];
      const [s1, t1] = boundary[(k + 1) % boundary.length];
      const p0 = point(s0, t0, 0);
      const p1 = point(s1, t1, 0);
      const q0 = point(s0, t0, thickness);
      const q1 = point(s1, t1, thickness);
      const a = b.vertex(p0[0], p0[1], p0[2], s0, t0, id, HELIOSTAT_FACE.FRAME);
      const c = b.vertex(p1[0], p1[1], p1[2], s1, t1, id, HELIOSTAT_FACE.FRAME);
      const d = b.vertex(q1[0], q1[1], q1[2], s1, t1, id, HELIOSTAT_FACE.FRAME);
      const e = b.vertex(q0[0], q0[1], q0[2], s0, t0, id, HELIOSTAT_FACE.FRAME);
      b.quad(a, c, d, e);
    }

    // A box spoke from the hub to the panel's inner edge, following the dish.
    const w = 0.022;
    const cx = Math.cos(centre);
    const cz = Math.sin(centre);
    const sx = -cz * w;
    const sz = cx * w;
    const r0 = 0.2;
    const r1 = inner + 0.02;
    const corners = [];
    for (const r of [r0, r1]) {
      const y = dish(r) + thickness * 0.5;
      for (const [side, up] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        corners.push([cx * r + sx * side, y + up * w, cz * r + sz * side]);
      }
    }
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      const quad = [corners[k], corners[n], corners[n + 4], corners[k + 4]];
      const ids = quad.map((p, j) => b.vertex(p[0], p[1], p[2], j < 2 ? 0 : 1, k / 4, id, HELIOSTAT_FACE.FRAME));
      b.quad(ids[0], ids[1], ids[2], ids[3]);
    }
  }

  // Hub: a hexagonal drum with a cone nib pointing down at the target.
  const sides = 6;
  const hubR = 0.22;
  const top = 0.12;
  const bottom = -0.06;
  const nib = -0.24;
  for (let k = 0; k < sides; k++) {
    const a0 = (k * TAU) / sides;
    const a1 = ((k + 1) * TAU) / sides;
    const u0 = k / sides;
    const u1 = (k + 1) / sides;
    const x0 = Math.cos(a0) * hubR;
    const z0 = Math.sin(a0) * hubR;
    const x1 = Math.cos(a1) * hubR;
    const z1 = Math.sin(a1) * hubR;
    const wall = [
      b.vertex(x0, bottom, z0, u0, 0, 0, HELIOSTAT_FACE.HUB),
      b.vertex(x1, bottom, z1, u1, 0, 0, HELIOSTAT_FACE.HUB),
      b.vertex(x1, top, z1, u1, 1, 0, HELIOSTAT_FACE.HUB),
      b.vertex(x0, top, z0, u0, 1, 0, HELIOSTAT_FACE.HUB)
    ];
    b.quad(wall[0], wall[1], wall[2], wall[3]);
    const cap = b.vertex(0, top + 0.03, 0, 0.5, 1, 0, HELIOSTAT_FACE.HUB);
    b.tri(wall[3], wall[2], cap);
    const tip = b.vertex(0, nib, 0, 0.5, 0, 0, HELIOSTAT_FACE.HUB);
    b.tri(wall[1], wall[0], tip);
  }

  return b.build();
}

/**
 * Asymmetric four-sided lens shard with a bevelled central ridge.
 *
 * Deliberately tiny (five vertices): twelve of them orbit the dish, and at
 * that size a ridge and four facets is all the eye resolves. The facet shader
 * does the rest with a prismatic split along the ridge.
 */
export function heliostatFacetGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    0, 0.38, 0,
    -0.12, 0, 0,
    0, -0.26, 0,
    0.12, 0, 0,
    0, 0, 0.08 // the raised ridge point
  ]), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0.5, 1, 0, 0.5, 0.5, 0, 1, 0.5, 0.5, 0.5]), 2));
  geometry.setIndex([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * An iris blade: a bowed sickle, 0.8 m long along +Y, with a lenticular
 * cross-section — a raised spine on the front, a shallow belly behind, meeting
 * in a knife edge. Because the two surfaces meet at the edge there are no
 * walls to build, and the spine catches light down its whole length.
 */
export function heliostatBladeGeometry() {
  const b = new MeshBuilder();
  const rows = 14;
  const cols = 6;
  const length = 0.8;
  const spine = 0.05;
  const rowStride = cols + 1;

  for (const face of [1, -1]) {
    const base = b.positions.length / 3;
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      // Bowed centreline, a width that swells then tapers to a point.
      const bow = 0.12 * Math.sin(Math.PI * t * 0.9);
      const width = 0.15 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7) * (1 - 0.35 * t);
      for (let i = 0; i <= cols; i++) {
        const s = (i / cols) * 2 - 1;
        const swell = 1 - s * s;
        const z = face > 0 ? spine * swell : -spine * 0.3 * swell;
        b.vertex(bow + s * width * 0.5, t * length, z, i / cols, t);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = base + j * rowStride + i;
        const c = a + rowStride;
        if (face > 0) b.quad(a, a + 1, c + 1, c);
        else b.quad(a, c, c + 1, a + 1);
      }
    }
  }
  return b.build();
}

/**
 * The travelling lens: a biconvex disc (radius 0.32 m) turned from a circular
 * arc, with a thin rim band. Lies in the XY plane so it faces its heading once
 * the rig is yawed down the cast line.
 */
export function heliostatLensGeometry() {
  const b = new MeshBuilder();
  const rings = 8;
  const sides = 32;
  const radius = 0.32;
  const bulge = 0.07;
  const stride = sides + 1;
  for (const face of [1, -1]) {
    const base = b.positions.length / 3;
    for (let j = 0; j <= rings; j++) {
      const t = j / rings;
      const r = radius * t;
      const z = face * bulge * (1 - t * t);
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * TAU;
        b.vertex(Math.cos(a) * r, Math.sin(a) * r, z, 0.5 + Math.cos(a) * t * 0.5, 0.5 + Math.sin(a) * t * 0.5);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < sides; i++) {
        const a = base + j * stride + i;
        const c = a + stride;
        if (face > 0) b.quad(a, a + 1, c + 1, c);
        else b.quad(a, c, c + 1, a + 1);
      }
    }
  }
  return b.build();
}

/**
 * The gather: an open, fluted cone from the dish (radius 1 at y = 1) down to
 * the focus point (y = 0). The radius is modulated by `bands` flutes so the
 * cone reads as separate shafts of light, one per mirror, converging.
 */
export function heliostatConeGeometry(bands = 12) {
  const b = new MeshBuilder();
  const sides = 96;
  const rows = 18;
  const stride = sides + 1;
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    for (let i = 0; i <= sides; i++) {
      const u = i / sides;
      const a = u * TAU;
      const flute = 1 + 0.09 * Math.cos(a * bands);
      const r = (0.03 + 0.97 * v) * flute;
      b.vertex(Math.cos(a) * r, v, Math.sin(a) * r, u, v);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * stride + i;
      b.quad(a, a + stride, a + stride + 1, a + 1);
    }
  }
  return b.build();
}

/**
 * One ribbon of the ray, in the XY plane, 0..1 tall. It is *narrowest at the
 * foot*: the heliostat is focusing, so the ray pinches to a point of contact
 * rather than arriving as a pillar. Three of these cross at 60°.
 */
export function heliostatRayGeometry() {
  const b = new MeshBuilder();
  const rows = 48;
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const half = 0.035 + 0.13 * Math.pow(v, 0.8);
    b.vertex(-half, v, 0, 0, v);
    b.vertex(half, v, 0, 1, v);
  }
  for (let j = 0; j < rows; j++) {
    const a = j * 2;
    b.quad(a, a + 1, a + 3, a + 2);
  }
  return b.build();
}

/**
 * The ray's white-hot core: a ruled column 0..1 tall, a little wider under
 * the dish than at the contact, with a flared foot where it splashes.
 */
export function heliostatCoreGeometry() {
  const b = new MeshBuilder();
  const sides = 16;
  const rows = 32;
  const stride = sides + 1;
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const foot = Math.exp(-v * 22) * 0.12;
    const r = 0.045 + 0.07 * v + foot;
    for (let i = 0; i <= sides; i++) {
      const u = i / sides;
      const a = u * TAU;
      b.vertex(Math.cos(a) * r, v, Math.sin(a) * r, u, v);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * stride + i;
      b.quad(a, a + stride, a + stride + 1, a + 1);
    }
  }
  return b.build();
}

/* ---------------------------------------------------------------------- */
/* The heliostat field — the mirror pylons that ring the court              */
/* ---------------------------------------------------------------------- */

/** Push a flat-shaded quad (own four vertices, so the facet keeps a hard edge). */
function flatQuad(b, a, c, d, e, uv0 = [0, 0], uv1 = [1, 1]) {
  const i0 = b.vertex(a[0], a[1], a[2], uv0[0], uv0[1]);
  const i1 = b.vertex(c[0], c[1], c[2], uv1[0], uv0[1]);
  const i2 = b.vertex(d[0], d[1], d[2], uv1[0], uv1[1]);
  const i3 = b.vertex(e[0], e[1], e[2], uv0[0], uv1[1]);
  b.quad(i0, i1, i2, i3);
}

/** An axis-aligned box from (x0,y0,z0) to (x1,y1,z1), six flat faces. */
function flatBox(b, x0, y0, z0, x1, y1, z1) {
  flatQuad(b, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); // +z
  flatQuad(b, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]); // -z
  flatQuad(b, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); // +x
  flatQuad(b, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]); // -x
  flatQuad(b, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]); // +y
  flatQuad(b, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); // -y
}

/**
 * A heliostat pylon post: a lathed bronze column 1 unit tall (the ability
 * scales Y to `postHeight` metres; radii stay in metres). A stepped plinth
 * that flares onto the floor, a fluted shaft that tapers as it climbs, a
 * collar two thirds up and a drum bearing at the top for the panel's yoke.
 * Eight flutes are cut into the shaft so the sun rakes it in stripes.
 */
export function heliostatPostGeometry() {
  const b = new MeshBuilder();
  // (radius m, height 0..1) — read from the foot up.
  const profile = [
    [0.0, 0.0], [0.42, 0.0], [0.42, 0.035], [0.34, 0.05], [0.34, 0.085], [0.22, 0.11],
    [0.15, 0.16], [0.12, 0.3], [0.105, 0.62], [0.15, 0.64], [0.15, 0.68], [0.1, 0.7],
    [0.085, 0.9], [0.13, 0.92], [0.13, 0.99], [0.0, 1.0]
  ];
  const sides = 24;
  const stride = sides + 1;
  for (let j = 0; j < profile.length; j++) {
    const [r, y] = profile[j];
    // Flutes on the shaft only (between the plinth and the bearing).
    const fluted = y > 0.16 && y < 0.9 && !(y > 0.62 && y < 0.7);
    for (let i = 0; i <= sides; i++) {
      const u = i / sides;
      const a = u * TAU;
      const flute = fluted ? 1 - 0.14 * Math.pow(Math.abs(Math.cos(a * 4)), 6) : 1;
      b.vertex(Math.cos(a) * r * flute, y, Math.sin(a) * r * flute, u, y);
    }
  }
  for (let j = 0; j < profile.length - 1; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * stride + i;
      b.quad(a, a + stride, a + stride + 1, a + 1);
    }
  }
  return b.build();
}

/**
 * One heliostat panel: a concave mirror of six tiles (3 × 2) on a bronze back
 * plate, with a strut and a horizontal trunnion axle behind it. Metres, at
 * `panelScale` 1 it is 1.8 m wide and 1.2 m tall. The glass faces +Z, so an
 * `Object3D.lookAt` aims the mirror's normal at a point. Geometry group 0 is
 * the glass, group 1 the bronze (frame, back plate, rim walls, strut, axle).
 */
export function heliostatPanelGeometry() {
  const W = 1.8;
  const H = 1.2;
  const sag = 0.1; // concavity at the corners, metres
  const z = (x, y) => -sag * ((x * x) / (0.25 * W * W) + (y * y) / (0.25 * H * H)) * 0.5;
  const b = new MeshBuilder();

  /* glass: six curved tiles, each a 4 × 4 patch, inset from the frame */
  const tilesX = 3;
  const tilesY = 2;
  const gap = 0.035;
  const seg = 4;
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = -W / 2 + (tx * W) / tilesX + gap;
      const x1 = -W / 2 + ((tx + 1) * W) / tilesX - gap;
      const y0 = -H / 2 + (ty * H) / tilesY + gap;
      const y1 = -H / 2 + ((ty + 1) * H) / tilesY - gap;
      const base = b.positions.length / 3;
      for (let j = 0; j <= seg; j++) {
        for (let i = 0; i <= seg; i++) {
          const x = x0 + ((x1 - x0) * i) / seg;
          const y = y0 + ((y1 - y0) * j) / seg;
          b.vertex(x, y, z(x, y) + 0.012, (x + W / 2) / W, (y + H / 2) / H);
        }
      }
      for (let j = 0; j < seg; j++) {
        for (let i = 0; i < seg; i++) {
          const a = base + j * (seg + 1) + i;
          b.quad(a, a + 1, a + seg + 2, a + seg + 1);
        }
      }
    }
  }
  const glassCount = b.indices.length;

  /* bronze back plate: the front face shows through the gaps as mullions */
  const segX = 12;
  const segY = 8;
  const frontBase = b.positions.length / 3;
  for (let j = 0; j <= segY; j++) {
    for (let i = 0; i <= segX; i++) {
      const x = -W / 2 + (W * i) / segX;
      const y = -H / 2 + (H * j) / segY;
      b.vertex(x, y, z(x, y), i / segX, j / segY);
    }
  }
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = frontBase + j * (segX + 1) + i;
      b.quad(a, a + 1, a + segX + 2, a + segX + 1);
    }
  }
  const T = 0.07; // plate thickness
  const backBase = b.positions.length / 3;
  for (let j = 0; j <= segY; j++) {
    for (let i = 0; i <= segX; i++) {
      const x = -W / 2 + (W * i) / segX;
      const y = -H / 2 + (H * j) / segY;
      b.vertex(x, y, z(x, y) - T, i / segX, j / segY);
    }
  }
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = backBase + j * (segX + 1) + i;
      b.quad(a, a + segX + 1, a + segX + 2, a + 1);
    }
  }
  // Rim walls round the four edges.
  const edge = (x, y) => [[x, y, z(x, y)], [x, y, z(x, y) - T]];
  const ring = [];
  for (let i = 0; i <= segX; i++) ring.push([-W / 2 + (W * i) / segX, -H / 2]);
  for (let j = 1; j <= segY; j++) ring.push([W / 2, -H / 2 + (H * j) / segY]);
  for (let i = segX - 1; i >= 0; i--) ring.push([-W / 2 + (W * i) / segX, H / 2]);
  for (let j = segY - 1; j >= 1; j--) ring.push([-W / 2, -H / 2 + (H * j) / segY]);
  ring.push(ring[0]);
  for (let k = 0; k < ring.length - 1; k++) {
    const [p0, q0] = edge(ring[k][0], ring[k][1]);
    const [p1, q1] = edge(ring[k + 1][0], ring[k + 1][1]);
    flatQuad(b, q0, q1, p1, p0);
  }
  // A raised frame lip round the glass, so the panel has a bevelled edge.
  const L = 0.06;
  const lip = 0.03;
  for (const [x0, y0, x1, y1] of [
    [-W / 2, -H / 2, W / 2, -H / 2 + L],
    [-W / 2, H / 2 - L, W / 2, H / 2],
    [-W / 2, -H / 2 + L, -W / 2 + L, H / 2 - L],
    [W / 2 - L, -H / 2 + L, W / 2, H / 2 - L]
  ]) {
    const zc = z((x0 + x1) / 2, (y0 + y1) / 2);
    flatBox(b, x0, y0, zc - 0.01, x1, y1, zc + lip);
  }
  // Strut and trunnion axle behind the plate.
  flatBox(b, -0.09, -0.32, -T - 0.26, 0.09, 0.32, -T + 0.01);
  flatBox(b, -0.42, -0.07, -T - 0.34, 0.42, 0.07, -T - 0.2);

  const geometry = b.build();
  geometry.addGroup(0, glassCount, 0);
  geometry.addGroup(glassCount, b.indices.length - glassCount, 1);
  return geometry;
}

/**
 * A reflected sun shaft: two crossed ribbons 0..1 long on +Y, wide at the
 * mirror (v = 0, half-width 0.5) and pinched at the focus (v = 1, 0.16), so
 * every shaft reads as light being gathered. `uv.x` runs across a ribbon.
 */
export function heliostatShaftGeometry() {
  const b = new MeshBuilder();
  const rows = 24;
  for (let plane = 0; plane < 2; plane++) {
    const base = b.positions.length / 3;
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      const half = 0.5 + (0.16 - 0.5) * Math.pow(v, 0.7);
      if (plane === 0) {
        b.vertex(-half, v, 0, 0, v);
        b.vertex(half, v, 0, 1, v);
      } else {
        b.vertex(0, v, -half, 0, v);
        b.vertex(0, v, half, 1, v);
      }
    }
    for (let j = 0; j < rows; j++) {
      const a = base + j * 2;
      b.quad(a, a + 1, a + 3, a + 2);
    }
  }
  return b.build();
}
