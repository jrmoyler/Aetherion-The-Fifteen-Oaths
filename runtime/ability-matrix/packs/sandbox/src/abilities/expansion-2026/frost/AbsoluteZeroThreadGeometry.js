import { BufferAttribute, BufferGeometry, PlaneGeometry } from 'three';

/**
 * Absolute Zero Thread — procedural geometry.
 *
 *  - **the filament** (`createThreadGeometry`) — two strips of `THREAD_SEGMENTS`
 *    stations, one lying flat and one standing on edge, rewritten in place by
 *    the ability along the line each frame. Crossed like an X so the thread
 *    has body from the default camera behind the caster as well as from the
 *    side (a single ribbon disappears edge-on).
 *  - **the needle** (`createNeedleGeometry`) — a hexagonal ice spike with a
 *    swollen shoulder and three back-swept spurs, flat-shaded so each facet
 *    catches the fresnel separately. Points along +Z, tip at z = 1.
 *  - **the ice shard** (`createIceShardGeometry`) — one crystal for the ring
 *    round a statue's feet: a tapered hexagonal prism with a skewed pyramidal
 *    tip, base at y = 0, tip at y = 1, flat-shaded.
 *  - **the rime strip** (`createStripGeometry`) — a unit ground quad from
 *    z = 0 to z = 1, x −0.5..0.5; the ability places, turns and scales it
 *    down the line (shared by the frost path and its chill distortion twin).
 *  - **the rosette quad** (`createRosetteQuad`) — a unit ground quad for the
 *    rime rosette under each statue (the rosette is drawn in its shader).
 *  - **frost motes** and **shatter chips** — baked point sets with a seed;
 *    their shaders do all the motion.
 */

/** Stations along the filament. */
export const THREAD_SEGMENTS = 96;

function hash(i, k) {
  const h = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/* -------------------------------------------------------------------- */
/* The filament                                                         */
/* -------------------------------------------------------------------- */

/**
 * Vertices `[0, 2(N+1))` are the flat strip, `[2(N+1), 4(N+1))` the standing
 * strip; station `i` owns vertices `2i, 2i+1` of each. `uv.x` runs 0 at the
 * caster to 1 at the needle, `uv.y` 0..1 across.
 */
export function createThreadGeometry() {
  const N = THREAD_SEGMENTS;
  const geometry = new BufferGeometry();
  const positions = new Float32Array((N + 1) * 4 * 3);
  const uvs = new Float32Array((N + 1) * 4 * 2);
  const index = new Uint16Array(N * 6 * 2);
  for (let s = 0; s < 2; s++) {
    const vBase = s * (N + 1) * 2;
    for (let i = 0; i <= N; i++) {
      uvs.set([i / N, 0, i / N, 1], (vBase + i * 2) * 2);
      if (i < N) {
        const j = vBase + i * 2;
        index.set([j, j + 1, j + 2, j + 1, j + 3, j + 2], (s * N + i) * 6);
      }
    }
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(index, 1));
  return geometry;
}

/* -------------------------------------------------------------------- */
/* Crystals                                                             */
/* -------------------------------------------------------------------- */

/**
 * A hexagonal spike along +Z from `z0` to `z1`, widest (`r`) at `shoulder`
 * (0..1 along it), written as flat triangles into `out`.
 */
function spike(out, ox, oy, oz, dx, dy, dz, length, r, shoulder, twist) {
  // An orthonormal frame round the spike's axis.
  const len = Math.hypot(dx, dy, dz);
  const ax = dx / len;
  const ay = dy / len;
  const az = dz / len;
  let ux = -ay;
  let uy = ax;
  let uz = 0;
  if (Math.hypot(ux, uy) < 1e-4) {
    ux = 1;
    uy = 0;
  }
  const ul = Math.hypot(ux, uy, uz);
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const vx = ay * uz - az * uy;
  const vy = az * ux - ax * uz;
  const vz = ax * uy - ay * ux;
  const point = (along, radius, angle) => {
    const c = Math.cos(angle) * radius;
    const s = Math.sin(angle) * radius;
    return [
      ox + ax * along + ux * c + vx * s,
      oy + ay * along + uy * c + vy * s,
      oz + az * along + uz * c + vz * s
    ];
  };
  const base = point(0, 0, 0);
  const tip = point(length, 0, 0);
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI * 2 + twist;
    const a1 = ((k + 1) / 6) * Math.PI * 2 + twist;
    // Facets alternate slightly in radius so the crystal is not a lathe.
    const r0 = r * (k % 2 ? 0.86 : 1);
    const r1 = r * ((k + 1) % 2 ? 0.86 : 1);
    const s0 = point(length * shoulder, r0, a0);
    const s1 = point(length * shoulder, r1, a1);
    out.push(...base, ...s1, ...s0);
    out.push(...s0, ...s1, ...tip);
  }
}

function flatGeometry(triangles) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(triangles), 3));
  // Non-indexed: computeVertexNormals gives each facet its own normal.
  geometry.computeVertexNormals();
  return geometry;
}

/** Unit needle along +Z: base at z = 0, tip at z = 1, radius ~0.1 (scaled by the mesh). */
export function createNeedleGeometry() {
  const t = [];
  spike(t, 0, 0, 0, 0, 0, 1, 1, 0.1, 0.28, 0);
  // Three spurs swept back from the shoulder, like rime on a twig.
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    const ox = Math.cos(a) * 0.05;
    const oy = Math.sin(a) * 0.05;
    spike(t, ox, oy, 0.34, Math.cos(a) * 0.55, Math.sin(a) * 0.55, -0.8, 0.32, 0.035, 0.3, a);
  }
  return flatGeometry(t);
}

/** Unit ice shard: base on y = 0, tip at y = 1, radius ~0.14. */
export function createIceShardGeometry() {
  const t = [];
  // The main crystal leans a touch so a ring of them reads as grown, not placed.
  spike(t, 0, 0, 0, 0.08, 1, 0.04, 1, 0.14, 0.62, 0.3);
  // A smaller twin at its foot.
  spike(t, 0.07, 0, 0.03, 0.35, 1, -0.1, 0.48, 0.07, 0.55, 1.1);
  return flatGeometry(t);
}

/* -------------------------------------------------------------------- */
/* Ground quads                                                         */
/* -------------------------------------------------------------------- */

/** x −0.5..0.5 across, z 0..1 along, lying on y = 0. */
export function createStripGeometry() {
  return new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
}

/** Unit quad lying on y = 0, centred. */
export function createRosetteQuad() {
  return new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
}

/* -------------------------------------------------------------------- */
/* Baked points                                                         */
/* -------------------------------------------------------------------- */

/** `position.x` 0..1 along the line, `.y` 0..1 phase, `.z` −0.5..0.5 across. */
export function createMoteGeometry(count = 72) {
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    p[i * 3] = i / count;
    p[i * 3 + 1] = ((i * 31) % 19) / 19;
    p[i * 3 + 2] = ((i * 17) % 23) / 23 - 0.5;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(p, 3));
  return geometry;
}

/** Shatter chip directions (a golden-angle shell) with a `seed` each. */
export function createChipGeometry(count = 64) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const angle = i * 2.399963;
    const y = (i % 13) / 13;
    const r = 0.35 + (i % 7) / 10 + hash(i, 3) * 0.1;
    positions.set([Math.cos(angle) * r, 0.4 + y, Math.sin(angle) * r], i * 3);
    seeds[i] = (i * 0.618034) % 1;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new BufferAttribute(seeds, 1));
  return geometry;
}
