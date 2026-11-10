import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  LatheGeometry,
  PlaneGeometry,
  Vector2,
} from 'three';

/**
 * Hydraulic Marionette — procedural geometry.
 *
 *  - **the bar** — a lofted tube along X with an authored *beaded* radius
 *    profile: water under pressure gathers in beads along a jet, swells at
 *    the ends and waists between. Unit length and unit radius; the ability
 *    scales length from `zoneRadius` and girth from `barThickness`.
 *  - **the drop** — a lathe teardrop: a full bead with a drawn-out neck that
 *    points up into whatever it hangs from. Bar ends, the travelling spool,
 *    and the hook on every string.
 *  - **the reservoir** — the knuckle where the bars cross: a lathe onion
 *    with a pinched waist and a spout on top where the feed line enters.
 *  - **the strings** — tubes whose centreline is rewritten every frame on the
 *    CPU into preallocated buffers (`writeString`), parallel-transport framed
 *    so the cross-section never twists. Real positions, so they sit in the
 *    depth prepass and cast true shadows.
 *  - **the crown** — an open lathe cup for the splash crowns; the spikes and
 *    the rise are drawn in the crown shader.
 *
 * Everything is built once per pool member and disposed with it.
 */

const TAU = Math.PI * 2;

/** A unit floor quad (pool, lens). */
export function createQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}

/* ---------------------------------------------------------------------- */
/* The bar                                                                 */
/* ---------------------------------------------------------------------- */

/**
 * Unit bar along X (−0.5..0.5), unit radius. The radius profile is three
 * things multiplied: a gentle waist (thinner at the middle third), beads
 * spaced along the jet, and a swell into the end bulbs. Capped with
 * hemispherical fans so it is closed from any angle.
 */
export function createBarGeometry(segments = 72, radial = 18) {
  const profile = (s) => {
    const x = s * 2 - 1; // −1..1
    const waist = 0.82 + 0.18 * x * x;
    const bead = 1 + 0.2 * Math.pow(Math.max(0, Math.cos(s * TAU * 3.5)), 6);
    const swell = 1 + 0.35 * Math.pow(Math.abs(x), 8);
    return waist * bead * swell;
  };
  const ring = radial + 1;
  const rows = segments + 1;
  const capRows = 6;
  const total = (rows + capRows * 2) * ring;
  const pos = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let v = 0;
  const put = (x, r, cy, cz, s) => {
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      pos[v * 3] = x;
      pos[v * 3 + 1] = Math.cos(a) * r * cy;
      pos[v * 3 + 2] = Math.sin(a) * r * cz;
      uv[v * 2] = s;
      uv[v * 2 + 1] = j / radial;
      v++;
    }
  };
  // Start cap (x = −0.5 − bulge), then body, then end cap.
  const r0 = profile(0);
  for (let k = 0; k < capRows; k++) {
    const t = k / capRows; // 0 at the pole
    const ang = (1 - t) * Math.PI * 0.5;
    put(-0.5 - Math.sin(ang) * r0 * 0.02, Math.cos(ang) * r0, 1, 1, 0);
  }
  for (let i = 0; i < rows; i++) {
    const s = i / segments;
    put(s - 0.5, profile(s), 1, 1, s);
  }
  const r1 = profile(1);
  for (let k = 1; k <= capRows; k++) {
    const t = k / capRows;
    const ang = t * Math.PI * 0.5;
    put(0.5 + Math.sin(ang) * r1 * 0.02, Math.cos(ang) * r1, 1, 1, 1);
  }
  const rowCount = v / ring;
  const index = [];
  for (let i = 0; i < rowCount - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j;
      const b = a + ring;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos.subarray(0, v * 3), 3));
  g.setAttribute('uv', new BufferAttribute(uv.subarray(0, v * 2), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* Drops and the reservoir                                                 */
/* ---------------------------------------------------------------------- */

/**
 * A teardrop of unit radius, the bead centred on the origin and the neck
 * drawn up to y = +1.9. Points from the bottom pole up.
 */
export function createDropGeometry(segments = 28) {
  const pts = [];
  const n = 18;
  // The bead: most of a sphere.
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 0.78;
    pts.push(new Vector2(Math.cos(a), Math.sin(a)));
  }
  // The neck: a concave taper to a fine point (surface tension pulling a drop
  // off a jet).
  const last = pts[pts.length - 1];
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    const r = last.x * Math.pow(1 - t, 1.8);
    pts.push(new Vector2(Math.max(r, 0.0001), last.y + t * (1.9 - last.y)));
  }
  const g = new LatheGeometry(pts, segments);
  g.computeVertexNormals();
  return g;
}

/**
 * The reservoir where the bars cross: an onion of water, pinched at the
 * waist, with a short spout on top where the feed line pours in. Unit size.
 */
export function createReservoirGeometry(segments = 40) {
  const profile = [
    [0.0001, -0.62], [0.32, -0.58], [0.62, -0.42], [0.8, -0.18], [0.84, 0.0],
    [0.74, 0.14], [0.66, 0.22], [0.72, 0.32], [0.66, 0.48], [0.44, 0.62],
    [0.24, 0.7], [0.17, 0.82], [0.15, 1.0], [0.19, 1.08], [0.0001, 1.1],
  ];
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* Strings (rewritten every frame)                                         */
/* ---------------------------------------------------------------------- */

/**
 * Preallocated tube buffers for one string. Positions, normals and the
 * per-vertex `aGlow` (a pumped pulse) are rewritten by `writeString`.
 */
export function createStringGeometry(segments = 40, radial = 10) {
  const ring = radial + 1;
  const count = (segments + 1) * ring;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aGlow', new BufferAttribute(new Float32Array(count), 1));
  const uv = new Float32Array(count * 2);
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j <= radial; j++) {
      const k = i * ring + j;
      uv[k * 2] = i / segments;
      uv[k * 2 + 1] = j / radial;
    }
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  const index = [];
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j;
      const b = a + ring;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  g.setIndex(index);
  g.userData.segments = segments;
  g.userData.radial = radial;
  return g;
}

/**
 * Rewrite a string tube around a centreline.
 *
 * @param {BufferGeometry} g from `createStringGeometry`
 * @param {Float32Array} centre (segments+1)·3 world points, bar → tip
 * @param {Float32Array} radius (segments+1) radii (m)
 * @param {Float32Array} glow (segments+1) pulse light per ring
 */
export function writeString(g, centre, radius, glow) {
  const segments = g.userData.segments;
  const radial = g.userData.radial;
  const ring = radial + 1;
  const P = g.attributes.position.array;
  const N = g.attributes.normal.array;
  const G = g.attributes.aGlow.array;
  // Parallel transport: seed the normal off whichever axis is least aligned
  // with the first tangent, then carry it down the curve.
  let nx = 1, ny = 0, nz = 0;
  for (let i = 0; i <= segments; i++) {
    const a = Math.max(0, i - 1) * 3;
    const b = Math.min(segments, i + 1) * 3;
    let tx = centre[b] - centre[a];
    let ty = centre[b + 1] - centre[a + 1];
    let tz = centre[b + 2] - centre[a + 2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    if (i === 0) {
      if (Math.abs(tx) > 0.8) { nx = 0; ny = 0; nz = 1; }
      else { nx = 1; ny = 0; nz = 0; }
    }
    // Remove the tangent component and renormalise.
    const d = nx * tx + ny * ty + nz * tz;
    nx -= tx * d; ny -= ty * d; nz -= tz * d;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const bx = ty * nz - tz * ny;
    const by = tz * nx - tx * nz;
    const bz = tx * ny - ty * nx;
    const cx = centre[i * 3], cy = centre[i * 3 + 1], cz = centre[i * 3 + 2];
    const r = radius[i];
    const gl = glow[i];
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * TAU;
      const c = Math.cos(ang), s = Math.sin(ang);
      const ox = nx * c + bx * s, oy = ny * c + by * s, oz = nz * c + bz * s;
      const k = i * ring + j;
      P[k * 3] = cx + ox * r;
      P[k * 3 + 1] = cy + oy * r;
      P[k * 3 + 2] = cz + oz * r;
      N[k * 3] = ox;
      N[k * 3 + 1] = oy;
      N[k * 3 + 2] = oz;
      G[k] = gl;
    }
  }
  g.attributes.position.needsUpdate = true;
  g.attributes.normal.needsUpdate = true;
  g.attributes.aGlow.needsUpdate = true;
}

/* ---------------------------------------------------------------------- */
/* Splash crowns                                                           */
/* ---------------------------------------------------------------------- */

/**
 * An open cup: unit radius at the lip, unit height, flared. `uv.y` is the
 * height fraction the crown shader uses for spikes and thinning. Carries a
 * per-instance `aCrown` (x progress 0..1, y seed) for the instanced draw.
 */
export function createCrownGeometry(capacity, segments = 48) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    // A flared wall: narrow at the floor, opening at the lip.
    pts.push(new Vector2(0.45 + 0.55 * Math.pow(t, 0.7), t));
  }
  const g = new LatheGeometry(pts, segments);
  g.setAttribute('aCrown', new InstancedBufferAttribute(new Float32Array(capacity * 2), 2));
  return g;
}
