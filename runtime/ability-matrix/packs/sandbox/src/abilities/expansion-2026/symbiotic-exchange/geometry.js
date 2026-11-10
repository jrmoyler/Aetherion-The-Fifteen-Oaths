import {
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LatheGeometry,
  PlaneGeometry,
  Shape,
  Vector2,
} from 'three';

/**
 * Symbiotic Exchange — procedural geometry. Everything is authored here and
 * built once per pool member; nothing is a library primitive used as is.
 *
 *  - **the heart** — a lobed pod turned on a lathe that is not a lathe: six
 *    swollen lobes run up a gourd-shaped profile (fat belly, waisted neck, a
 *    flared lip that rolls *inward* into a cup), with shallow ribs in each
 *    lobe. The cup's inside faces are what the heart shader lights from
 *    within. Unit height; the ability scales it from the settings.
 *  - **the seed** — the same idea at thrown size: a ribbed spindle pod.
 *  - **the tendril** — a parameter tube: each vertex stores only `s` (0..1
 *    along it) and its place round the ring. The tendril shader places every
 *    vertex on its curve (arch → coil) in the vertex stage, so one buffer
 *    serves every root, the lifeline and the ally lines.
 *  - **the sepals** — a serrated leaf blade, extruded with a bevel and
 *    curled outward along its length, pivoting at its base.
 *  - **the mound** — a turned hummock of soil with root humps heaved
 *    through it and a deterministic lumpy surface.
 */

const TAU = Math.PI * 2;

/** Deterministic hash, so every pool member builds the same mound. */
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/* ---------------------------------------------------------------------- */
/* The heart                                                               */
/* ---------------------------------------------------------------------- */

/**
 * Heart profile: [height, radius] outside → round the lip → inside the cup.
 * Radius is at the lobe crest; grooves pull in from it.
 */
const HEART_PROFILE = [
  [0.0, 0.34], [0.06, 0.52], [0.16, 0.8], [0.28, 0.97], [0.4, 1.0], [0.52, 0.93],
  [0.63, 0.74], [0.72, 0.52], [0.79, 0.42], [0.85, 0.44], [0.9, 0.53], [0.94, 0.6],
  [0.965, 0.58], [0.975, 0.5], [0.95, 0.4], [0.9, 0.3], [0.84, 0.18], [0.8, 0.0],
];
/** Index in HEART_PROFILE where the lip turns in (inside faces start). */
const HEART_LIP = 12;
const HEART_LOBES = 6;

/**
 * The symbiont heart pod, unit height (y 0..1), unit belly radius.
 * Attributes: `aLobe` (0 groove … 1 crest) and `aInside` (0 skin, 1 cup).
 */
export function createHeartGeometry(segments = 96) {
  const rings = HEART_PROFILE.length;
  const positions = [];
  const uvs = [];
  const lobes = [];
  const inside = [];
  const indices = [];
  for (let j = 0; j < rings; j++) {
    const [y, r] = HEART_PROFILE[j];
    // Lobes fade out at the neck and in the cup so the lip stays round.
    const lobeWeight = j >= HEART_LIP ? 0 : Math.sin(Math.min(1, y / 0.8) * Math.PI) * 0.9 + 0.1;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * TAU;
      const lobe = 0.5 + 0.5 * Math.cos(a * HEART_LOBES);
      // A rib down the middle of each lobe: a narrow secondary crest.
      const rib = Math.pow(Math.max(0, Math.cos(a * HEART_LOBES * 2)), 12) * 0.03;
      const k = r * (1 - lobeWeight * (0.16 * (1 - lobe) - rib));
      positions.push(Math.cos(a) * k, y, Math.sin(a) * k);
      uvs.push(i / segments, j / (rings - 1));
      lobes.push(lobe);
      inside.push(j >= HEART_LIP ? 1 : 0);
    }
  }
  const row = segments + 1;
  for (let j = 0; j < rings - 1; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * row + i;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setIndex(indices);
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setAttribute('aLobe', new Float32BufferAttribute(lobes, 1));
  g.setAttribute('aInside', new Float32BufferAttribute(inside, 1));
  g.computeVertexNormals();
  return g;
}

/** The thrown seed: a ribbed spindle pod, unit radius, centred. */
export function createSeedGeometry() {
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const y = (t - 0.5) * 2.4;
    const r = Math.sin(t * Math.PI) * (1 - 0.25 * t) + 0.02;
    pts.push(new Vector2(r, y));
  }
  const g = new LatheGeometry(pts, 40);
  const p = g.attributes.position;
  const lobe = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const crest = 0.5 + 0.5 * Math.cos(a * 8);
    const k = 0.86 + 0.14 * crest;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
    lobe[i] = crest;
  }
  g.setAttribute('aLobe', new Float32BufferAttribute(lobe, 1));
  g.setAttribute('aInside', new Float32BufferAttribute(new Float32Array(p.count), 1));
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* The tendril                                                             */
/* ---------------------------------------------------------------------- */

/**
 * A parameter tube: `position.x` = s (0..1 along), `position.yz` = the unit
 * ring (cos, sin). The tendril vertex shader turns this into a root.
 */
export function createTendrilGeometry(segments = 80, radial = 10) {
  const positions = [];
  const indices = [];
  for (let j = 0; j <= segments; j++) {
    const s = j / segments;
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * TAU;
      positions.push(s, Math.cos(a), Math.sin(a));
    }
  }
  const row = radial + 1;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < radial; i++) {
      const a = j * row + i;
      const b = a + row;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setIndex(indices);
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return g;
}

/* ---------------------------------------------------------------------- */
/* The sepals                                                              */
/* ---------------------------------------------------------------------- */

/**
 * One crown sepal, unit length along +Y from a base pivot at the origin,
 * serrated, bevelled and curled outward (toward +Z) as it rises.
 */
export function createSepalGeometry() {
  const shape = new Shape();
  const half = 0.2;
  shape.moveTo(-half * 0.45, 0);
  // Left edge, serrated: out to the belly, in to the point.
  const teeth = 5;
  for (let i = 1; i <= teeth; i++) {
    const t = i / (teeth + 1);
    const w = half * Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.85 + 0.25);
    shape.lineTo(-w * 1.08, t - 0.04);
    shape.lineTo(-w * 0.88, t + 0.03);
  }
  shape.lineTo(0, 1);
  for (let i = teeth; i >= 1; i--) {
    const t = i / (teeth + 1);
    const w = half * Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.85 + 0.25);
    shape.lineTo(w * 0.88, t + 0.03);
    shape.lineTo(w * 1.08, t - 0.04);
  }
  shape.lineTo(half * 0.45, 0);
  shape.closePath();
  const g = new ExtrudeGeometry(shape, {
    depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 1, steps: 1, curveSegments: 4,
  });
  g.translate(0, 0, -0.01);
  // Curl: bend each vertex outward round X by an angle growing with height,
  // and cup the blade across its width.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const bend = y * y * 0.9;
    const cz = z + x * x * 1.6; // cupped
    p.setXYZ(i, x, y * Math.cos(bend) - cz * Math.sin(bend), y * Math.sin(bend) + cz * Math.cos(bend));
  }
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* The mound                                                               */
/* ---------------------------------------------------------------------- */

/** A turned hummock of soil, unit radius and height, with heaved root humps. */
export function createMoundGeometry(segments = 72) {
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    // From the rim (r 1, y 0) up over a rounded shoulder to the crown.
    const r = 1 - t;
    const y = Math.pow(Math.sin(t * Math.PI * 0.5), 0.7) * (0.75 + 0.25 * t);
    pts.push(new Vector2(Math.max(0.001, r), y));
  }
  const g = new LatheGeometry(pts, segments);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const r = Math.hypot(x, z);
    // Seven root humps heaved out radially, strongest on the shoulder.
    const hump = Math.pow(Math.max(0, Math.cos(a * 7 + 0.4)), 6) * Math.sin(Math.min(1, r) * Math.PI) * 0.22;
    // Lumpy soil: a few incommensurate ripples, deterministic.
    const lump = (Math.sin(a * 13 + r * 9) * 0.5 + Math.sin(a * 23 - r * 17 + 1.7) * 0.3 +
      (hash(Math.round(a * 40) + Math.round(r * 20) * 97) - 0.5) * 0.4) * 0.05;
    const k = 1 + lump + hump * 0.4;
    p.setXYZ(i, x * k, y * (1 + hump + lump), z * k);
  }
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* Carriers                                                                */
/* ---------------------------------------------------------------------- */

/** Sap bead carrier (the bead shader makes it a glowing drop). */
export function createBeadGeometry() {
  return new IcosahedronGeometry(1, 2);
}

/** Unit quad in XY; the ability lays it flat. */
export function createQuad() {
  return new PlaneGeometry(1, 1);
}
