import {
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Path,
  PlaneGeometry,
  Shape,
  Uint16BufferAttribute,
  Vector3,
} from 'three';

/**
 * Resonance Theft — procedural geometry.
 *
 *  - **the horn** — a cochlear horn swept along an authored centreline: a
 *    conical spiral that winds 1¾ turns outward and down, then swoops in on a
 *    cubic to a bell that hangs mouth-down over the circle's centre. The
 *    tube's radius follows an exponential-horn law (a hair at the apex, a
 *    wide flare at the bell), carries raised brass bands, and ends in a
 *    rolled lip. Frames are parallel-transported so the tube never twists.
 *    Unit space: the mouth's centre is the origin, the bell opens toward −Y,
 *    the coil sits above it (≈ 0.62 high, ≈ 0.5 wide). The ability scales it
 *    by `zoneRadius × hornScale`.
 *  - **reeds** — a tapered, slotted blade extruded with a bevel: one reed of
 *    the spectrum ring.
 *  - **taps** — a ribbon strip (`aT` along, `aSide` across) whose whole
 *    shape — the bezier, the corkscrew, the width — is placed in the vertex
 *    shader, so no vertex is rewritten on the CPU.
 *  - **the cone** — an open cylinder used only as a carrier: the cone shader
 *    reshapes it from the bell down to the floor.
 *
 * Built once per pool member, disposed with it.
 */

const TAU = Math.PI * 2;
const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ---------------------------------------------------------------------- */
/* The horn                                                                */
/* ---------------------------------------------------------------------- */

/** Where the coil ends and the swoop to the bell begins (arclength share). */
const COIL_END = 0.72;
const COIL_TURNS = 1.75;

/** Coil centreline at q ∈ [0,1] (apex → coil end). */
function coilPoint(q, out) {
  const theta = 0.6 + TAU * COIL_TURNS * q;
  const radius = 0.05 + 0.41 * Math.pow(q, 0.9);
  return out.set(Math.cos(theta) * radius, 0.62 - 0.22 * q, Math.sin(theta) * radius);
}

const _a = new Vector3();
const _b = new Vector3();
const _p0 = new Vector3();
const _p1 = new Vector3();
const _p2 = new Vector3();
const _p3 = new Vector3();

/** The horn's centreline at s ∈ [0,1] (apex → mouth). */
function hornCentre(s, out) {
  if (s <= COIL_END) return coilPoint(s / COIL_END, out);
  // The swoop: a cubic leaving the coil along its own tangent and arriving
  // at the origin heading straight down.
  coilPoint(1, _p0);
  coilPoint(0.995, _a);
  _b.subVectors(_p0, _a).normalize();
  _p1.copy(_p0).addScaledVector(_b, 0.2);
  _p3.set(0, 0, 0);
  _p2.set(0, 0.3, 0);
  const t = (s - COIL_END) / (1 - COIL_END);
  const u = 1 - t;
  return out
    .copy(_p0).multiplyScalar(u * u * u)
    .addScaledVector(_p1, 3 * u * u * t)
    .addScaledVector(_p2, 3 * u * t * t)
    .addScaledVector(_p3, t * t * t);
}

/** Tube radius at s: exponential-horn flare with raised bands. */
export function hornRadius(s) {
  const flare = Math.pow(smoothstep(0.78, 1, s), 3);
  let r = 0.028 + 0.062 * Math.pow(s, 1.2) + 0.29 * flare;
  // Raised brass bands at regular stations along the tube, gone in the bell.
  const band = Math.pow(Math.abs(Math.sin(Math.PI * s * 17)), 18) * (1 - smoothstep(0.86, 0.93, s));
  r *= 1 + 0.16 * band;
  return r;
}

/**
 * The cochlear horn. Attributes: position, normal, uv (u round, v = s),
 * `aS` (arclength share, 1 on the lip) and `aRad` (local tube radius).
 */
export function createHornGeometry({ samples = 220, sides = 32, lipRings = 8, lip = 0.022 } = {}) {
  const centres = [];
  for (let i = 0; i <= samples; i++) centres.push(hornCentre(i / samples, new Vector3()));
  // Tangents by central difference, then a parallel-transported normal.
  const tangents = centres.map((c, i) => {
    const a = centres[Math.max(0, i - 1)];
    const b = centres[Math.min(samples, i + 1)];
    return new Vector3().subVectors(b, a).normalize();
  });
  const normals = [];
  let n = new Vector3(0, 1, 0).cross(tangents[0]);
  if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
  n.normalize();
  for (let i = 0; i <= samples; i++) {
    if (i > 0) {
      // Remove the component along the new tangent: transport without twist.
      n = n.clone().addScaledVector(tangents[i], -n.dot(tangents[i])).normalize();
    }
    normals.push(n);
  }

  const rings = [];
  for (let i = 0; i <= samples; i++) {
    const s = i / samples;
    rings.push({ c: centres[i], t: tangents[i], n: normals[i], r: hornRadius(s), s, back: 0 });
  }
  // The rolled lip: the bell's edge curls outward and back up on itself.
  const end = rings[rings.length - 1];
  for (let k = 1; k <= lipRings; k++) {
    const phi = (k / lipRings) * Math.PI;
    rings.push({
      c: end.c.clone().addScaledVector(end.t, lip * Math.sin(phi)),
      t: end.t, n: end.n, r: end.r + lip * (1 - Math.cos(phi)), s: 1, back: k / lipRings,
    });
  }

  const position = [];
  const normal = [];
  const uv = [];
  const aS = [];
  const aRad = [];
  const b = new Vector3();
  const dir = new Vector3();
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    b.crossVectors(ring.t, ring.n).normalize();
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * TAU;
      dir.copy(ring.n).multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
      position.push(ring.c.x + dir.x * ring.r, ring.c.y + dir.y * ring.r, ring.c.z + dir.z * ring.r);
      // On the lip the surface turns over: blend the normal toward the tangent.
      const lipTurn = Math.sin(ring.back * Math.PI);
      const nx = dir.x * (1 - lipTurn) + ring.t.x * lipTurn;
      const ny = dir.y * (1 - lipTurn) + ring.t.y * lipTurn;
      const nz = dir.z * (1 - lipTurn) + ring.t.z * lipTurn;
      const len = Math.hypot(nx, ny, nz) || 1;
      normal.push(nx / len, ny / len, nz / len);
      uv.push(j / sides, ring.s);
      aS.push(ring.s);
      aRad.push(ring.r);
    }
  }
  const index = [];
  const stride = sides + 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * stride + j;
      const c = a + stride;
      // Counter-clockwise seen from outside: front faces are the outer skin.
      index.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('aS', new Float32BufferAttribute(aS, 1));
  g.setAttribute('aRad', new Float32BufferAttribute(aRad, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/** Unit-space height of the coil's apex above the mouth (for placement). */
export const HORN_TOP = 0.62;
/** Unit-space radius of the bell's mouth (with the lip). */
export const HORN_MOUTH = hornRadius(1) + 0.044;

/* ---------------------------------------------------------------------- */
/* Reeds                                                                   */
/* ---------------------------------------------------------------------- */

/** One reed of the spectrum ring: XY outline, unit wide and tall, +Y up. */
export function createReedGeometry() {
  const s = new Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.bezierCurveTo(0.42, 0.3, 0.34, 0.55, 0.16, 0.86);
  s.lineTo(0, 1);
  s.lineTo(-0.16, 0.86);
  s.bezierCurveTo(-0.34, 0.55, -0.42, 0.3, -0.5, 0);
  // The reed's slot, where it speaks.
  const slot = new Path();
  slot.moveTo(-0.05, 0.14);
  slot.lineTo(0.05, 0.14);
  slot.lineTo(0.035, 0.62);
  slot.lineTo(-0.035, 0.62);
  slot.closePath();
  s.holes.push(slot);
  const depth = 0.1;
  const g = new ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 10,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* Taps, the cone, quads                                                   */
/* ---------------------------------------------------------------------- */

/** A ribbon strip placed entirely in the tap shader. */
export function createTapGeometry(segments = 120) {
  const position = new Float32Array((segments + 1) * 2 * 3);
  const aT = new Float32Array((segments + 1) * 2);
  const aSide = new Float32Array((segments + 1) * 2);
  for (let i = 0; i <= segments; i++) {
    aT[i * 2] = aT[i * 2 + 1] = i / segments;
    aSide[i * 2] = -1;
    aSide[i * 2 + 1] = 1;
  }
  const index = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('aT', new Float32BufferAttribute(aT, 1));
  g.setAttribute('aSide', new Float32BufferAttribute(aSide, 1));
  g.setIndex(new Uint16BufferAttribute(index, 1));
  return g;
}

/** Carrier for the playback cone (reshaped in its vertex shader). */
export function createConeGeometry() {
  return new CylinderGeometry(1, 1, 1, 56, 18, true);
}

/** A flat unit quad. */
export function createQuad() {
  return new PlaneGeometry(1, 1);
}
