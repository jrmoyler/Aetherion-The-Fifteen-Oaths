import { BufferAttribute, BufferGeometry, Float32BufferAttribute, LatheGeometry, PlaneGeometry, Vector2 } from 'three';

/**
 * Ashen Doppelganger — procedural geometry.
 *
 * Everything here is built once per pooled instance and never reallocated:
 *
 *  - **the fallback figure** (`createTorsoGeometry`, `createHeadGeometry`,
 *    `createLimbGeometry`) — only drawn until the host hands the cast the
 *    caster's rig, after which the echo is a skinned clone of the caster
 *    itself. A plain capsule would read as a placeholder, so the figure is
 *    profiled like a body — pelvis, waist, ribcage, shoulders, neck; a
 *    cranium over a jaw; limbs that swell at the muscle and pinch at the joint
 *    — flattened front-to-back, and then *eroded*: every vertex is pushed in
 *    by a deterministic value noise so the surface reads as a crust of ash
 *    with flakes missing, not as a smooth mannequin.
 *  - **the ember column** (`createEmberColumnGeometry`) — points baked on a
 *    golden-angle spiral around the body with a per-point seed. The shader
 *    lifts and recycles them; the CPU never touches them again.
 *  - **the fuse** (`createFuseGeometry`) — a fixed-capacity ribbon the ability
 *    rewrites in place each frame along the recorded path from the echo to the
 *    caster; unused points collapse onto the last one and the draw range trims
 *    them.
 *  - **the cinder spire** (`createSpireGeometry`) — the hero of the echo's
 *    own cast: a tapered, twisted, hexagonal shard of ash-basalt with a
 *    broken crown, every ring jittered so the facets are uneven, and the
 *    triangles left unshared so the sun picks out each facet. One unit tall;
 *    the cast instances it round the landing and sizes each from the zone.
 *  - **the brand** (`createBrandGeometry`) — the coal the echo throws: a
 *    lumpy, eroded ember heart; and **the brand's tail**
 *    (`createBrandTailGeometry`), an open flame cone the cast points back
 *    along the flight.
 *  - **the ground quad** and **the haze quad** — flat parameter quads for the
 *    sigil and the distortion billboard (the haze quad is anchored at its
 *    bottom edge so it stands on the floor).
 */

/** Points the fuse ribbon can hold. */
export const FUSE_POINTS = 48;
/** Baked points in the ember column. */
export const EMBER_POINTS = 96;

/* -------------------------------------------------------------------- */
/* Deterministic value noise for the erosion                            */
/* -------------------------------------------------------------------- */

function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function valueNoise(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  // Smoothstep weights so the crust has no grid creases.
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  let v = 0;
  for (let k = 0; k < 2; k++) {
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const w = (i ? ux : 1 - ux) * (j ? uy : 1 - uy) * (k ? uz : 1 - uz);
        v += w * hash3(ix + i, iy + j, iz + k);
      }
    }
  }
  return v;
}

/**
 * Flatten a lathe front-to-back and erode it.
 *
 * @param {BufferGeometry} geometry built round +Y
 * @param {number} depth   z scale (a body is deeper than it is wide only at the head)
 * @param {number} erosion metres the deepest flake bites in
 * @param {number} seed    keeps the torso, head and limbs from sharing one crust
 */
function erode(geometry, depth, erosion, seed) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i) * depth;
    const r = Math.hypot(x, z);
    if (r < 1e-4) {
      pos.setXYZ(i, x, y, z);
      continue;
    }
    // Two octaves; the high one is sharpened so flakes have edges.
    const n1 = valueNoise(x * 7 + seed, y * 7, z * 7);
    const n2 = valueNoise(x * 19, y * 19 + seed, z * 19);
    const flake = Math.pow(Math.max(0, n2 - 0.55) / 0.45, 1.5);
    const k = 1 - erosion * (0.45 * n1 + 0.9 * flake) / Math.max(r, 0.05);
    pos.setXYZ(i, x * k, y, z * k);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/* -------------------------------------------------------------------- */
/* The fallback figure                                                  */
/* -------------------------------------------------------------------- */

/** Pelvis to neck, 1.3 m, standing on y = 0 of its own frame. */
export function createTorsoGeometry() {
  const profile = [
    [0.02, 0.0],
    [0.17, 0.02], // the crotch, closed
    [0.25, 0.12], // hips
    [0.26, 0.24],
    [0.2, 0.42], // waist
    [0.22, 0.56],
    [0.28, 0.74], // ribcage
    [0.33, 0.92],
    [0.37, 1.02], // shoulders
    [0.33, 1.1],
    [0.18, 1.16],
    [0.09, 1.2], // neck
    [0.08, 1.28],
    [0.02, 1.3]
  ].map(([r, y]) => new Vector2(r, y));
  return erode(new LatheGeometry(profile, 28), 0.62, 0.022, 3.1);
}

/** Cranium over a narrower jaw, 0.46 m. */
export function createHeadGeometry() {
  const profile = [
    [0.01, 0.0],
    [0.09, 0.02], // chin
    [0.13, 0.08], // jaw
    [0.15, 0.17],
    [0.18, 0.26], // cheekbones
    [0.19, 0.33],
    [0.17, 0.4], // brow
    [0.11, 0.45],
    [0.01, 0.46]
  ].map(([r, y]) => new Vector2(r, y));
  return erode(new LatheGeometry(profile, 20), 0.88, 0.016, 7.7);
}

/** One limb, root at y = 0 hanging to y = 0.82 (pivots flip it down). */
export function createLimbGeometry() {
  const profile = [
    [0.02, 0.0],
    [0.1, 0.02], // the joint into the body
    [0.15, 0.1], // the big muscle
    [0.14, 0.26],
    [0.09, 0.4], // knee / elbow pinch
    [0.1, 0.46],
    [0.11, 0.56], // calf / forearm
    [0.07, 0.74],
    [0.05, 0.8], // ankle / wrist
    [0.01, 0.82]
  ].map(([r, y]) => new Vector2(r, y));
  return erode(new LatheGeometry(profile, 14), 0.85, 0.014, 12.4);
}

/* -------------------------------------------------------------------- */
/* The ember column                                                     */
/* -------------------------------------------------------------------- */

/**
 * Golden-angle spiral round the body. `position.y` is the spawn height inside
 * the column (0..1, scaled by the shader), `aSeed` drives speed, size, colour.
 */
export function createEmberColumnGeometry(count = EMBER_POINTS) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = i * 2.399963;
    const r = 0.16 + (i % 9) * 0.06 + hash3(i, 1, 2) * 0.12;
    positions[i * 3] = Math.sin(a) * r;
    positions[i * 3 + 1] = hash3(i, 7, 3);
    positions[i * 3 + 2] = Math.cos(a) * r;
    seeds[i] = hash3(i, 11, 5);
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  return geometry;
}

/* -------------------------------------------------------------------- */
/* The fuse                                                             */
/* -------------------------------------------------------------------- */

/**
 * A two-vertex-wide strip of `FUSE_POINTS` stations. `uv.x` runs 0 at the echo
 * to 1 at the caster, `uv.y` 0..1 across.
 */
export function createFuseGeometry() {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(FUSE_POINTS * 2 * 3);
  const uvs = new Float32Array(FUSE_POINTS * 2 * 2);
  const index = new Uint16Array((FUSE_POINTS - 1) * 6);
  for (let i = 0; i < FUSE_POINTS; i++) {
    const u = i / (FUSE_POINTS - 1);
    uvs.set([u, 0, u, 1], i * 4);
    if (i < FUSE_POINTS - 1) {
      const j = i * 2;
      index.set([j, j + 1, j + 2, j + 1, j + 3, j + 2], i * 6);
    }
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(index, 1));
  return geometry;
}

/* -------------------------------------------------------------------- */
/* Quads                                                                */
/* -------------------------------------------------------------------- */

/** Unit ground quad, rotated flat by the mesh. */
export function createGroundQuad() {
  return new PlaneGeometry(1, 1);
}

/** Unit billboard quad standing on its bottom edge (y 0..1). */
export function createHazeQuad() {
  return new PlaneGeometry(1, 1).translate(0, 0.5, 0);
}

/* -------------------------------------------------------------------- */
/* The echo's own cast: brand, tail and cinder spires                   */
/* -------------------------------------------------------------------- */

/** Rows and sides of a cinder spire. */
const SPIRE_ROWS = 12;
const SPIRE_SIDES = 6;

/**
 * One cinder spire, y = -0.08 (buried) to ~1.05 (broken crown), base radius
 * ~0.34. Faceted: the triangles are not shared, so each facet is flat-lit.
 * `uv.y` is the height fraction (the crumble and vein shaders read it).
 */
export function createSpireGeometry() {
  const ring = [];
  for (let j = 0; j <= SPIRE_ROWS; j++) {
    const y = j / SPIRE_ROWS;
    // Tapers like a shard: a fat foot, a long waist, a sharp crown.
    const r0 = 0.34 * Math.pow(1 - y * 0.94, 0.85) + 0.012;
    // A slow bend and a twist so no two faces are parallel.
    const bend = 0.14 * y * y;
    const twist = y * 0.9;
    const row = [];
    for (let k = 0; k < SPIRE_SIDES; k++) {
      const a = (k / SPIRE_SIDES) * Math.PI * 2 + twist + (hash3(k, j, 3) - 0.5) * 0.35;
      const jag = 1 + (hash3(k, j, 9) - 0.5) * 0.42;
      const r = r0 * jag;
      row.push([Math.cos(a) * r + bend, y * 1.0 - (j === 0 ? 0.08 : 0), Math.sin(a) * r * 0.82]);
    }
    ring.push(row);
  }
  // The broken crown: an off-centre apex, a little higher than the last ring.
  const apex = [0.16 + 0.03, 1.06, 0.02];
  const positions = [];
  const uvs = [];
  const push = (p, u, v) => {
    positions.push(p[0], p[1], p[2]);
    uvs.push(u, v);
  };
  for (let j = 0; j < SPIRE_ROWS; j++) {
    const v0 = j / SPIRE_ROWS;
    const v1 = (j + 1) / SPIRE_ROWS;
    for (let k = 0; k < SPIRE_SIDES; k++) {
      const k1 = (k + 1) % SPIRE_SIDES;
      const u0 = k / SPIRE_SIDES;
      const u1 = (k + 1) / SPIRE_SIDES;
      const a = ring[j][k];
      const b = ring[j][k1];
      const c = ring[j + 1][k1];
      const d = ring[j + 1][k];
      push(a, u0, v0); push(c, u1, v1); push(b, u1, v0);
      push(a, u0, v0); push(d, u0, v1); push(c, u1, v1);
    }
  }
  const top = ring[SPIRE_ROWS];
  for (let k = 0; k < SPIRE_SIDES; k++) {
    const k1 = (k + 1) % SPIRE_SIDES;
    push(top[k], k / SPIRE_SIDES, 1); push(apex, 0.5, 1.06); push(top[k1], (k + 1) / SPIRE_SIDES, 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** The thrown coal: an eroded, lumpy ember heart about 1 m across at scale 1. */
export function createBrandGeometry() {
  const profile = [
    [0.0, -0.42],
    [0.18, -0.4],
    [0.34, -0.3],
    [0.45, -0.12],
    [0.47, 0.06],
    [0.4, 0.24],
    [0.28, 0.38],
    [0.12, 0.46],
    [0.0, 0.48]
  ].map(([r, y]) => new Vector2(r, y));
  return erode(new LatheGeometry(profile, 18), 0.9, 0.06, 21.3);
}

/** An open flame cone along +y, 1 m long, ~0.45 m across at its root. */
export function createBrandTailGeometry() {
  const profile = [
    [0.0, -0.08],
    [0.38, 0.0],
    [0.45, 0.08],
    [0.4, 0.24],
    [0.28, 0.48],
    [0.16, 0.72],
    [0.06, 0.9],
    [0.0, 1.0]
  ].map(([r, y]) => new Vector2(r, y));
  return new LatheGeometry(profile, 20);
}
