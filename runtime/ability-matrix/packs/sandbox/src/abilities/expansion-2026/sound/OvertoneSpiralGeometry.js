import { BufferAttribute, BufferGeometry } from 'three';

/**
 * Procedural geometry for OVERTONE SPIRAL.
 *
 * The cast is a struck tuning fork. A carrier (a ringing bead of sound) flies
 * to the circle; there a resonator stands up — a three-tined fork on a turned
 * stem — and is struck three times, each strike releasing a harmonic front
 * that rolls out across the floor. A helix of overtones climbs the fork, a
 * Chladni plate of standing-wave nodes draws itself on the floor, and notes
 * drift up off it.
 *
 * Everything is built once, in normalised units, and placed and scaled per
 * frame from the live settings. None of it is rebuilt per frame: the fronts'
 * lobes, the helix's draw-on and the fork's vibration are all vertex-stage.
 */

const TAU = Math.PI * 2;

function build(positions, uvs, indices, extra = null) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  if (extra) for (const [name, data, size] of extra) g.setAttribute(name, new BufferAttribute(new Float32Array(data), size));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * A harmonic front: a unit-radius annular band, `segments` round and `rows`
 * across. `uv.x` runs round (0..1), `uv.y` across the band (0 inner, 1
 * outer). Positions are the flat unit circle; the front shader displaces it
 * into a travelling pressure ridge with `n` lobes and sets its width in
 * metres, so one geometry serves all three harmonics at any radius.
 */
export function harmonicFrontGeometry(segments = 160, rows = 6) {
  const p = [];
  const uv = [];
  const ix = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * TAU;
    for (let j = 0; j <= rows; j++) {
      p.push(Math.cos(a), 0, Math.sin(a));
      uv.push(i / segments, j / rows);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = a + rows + 1;
      ix.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = build(p, uv, ix);
  // The shader rebuilds positions; keep the culling volume honest anyway.
  g.computeBoundingSphere();
  return g;
}

/**
 * One tine of the fork: a tapering prism with a rounded-square (superellipse)
 * section and a domed tip, 0..1 along +Y. The superellipse is what makes it
 * read as machined steel rather than a cylinder: flat faces catch one sheen
 * band each, rounded corners roll the highlight between them.
 */
export function forkTineGeometry() {
  const rows = 28;
  const segs = 24;
  const p = [];
  const uv = [];
  const ix = [];
  const e = 0.35; // superellipse exponent: < 1 squares the section off
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    // Taper to 70% at the top, then dome the last tenth closed.
    const dome = v > 0.9 ? Math.sqrt(Math.max(0, 1 - ((v - 0.9) / 0.1) ** 2)) : 1;
    const half = 0.06 * (1 - 0.3 * v) * dome;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = Math.sign(c) * Math.abs(c) ** e * half;
      const z = Math.sign(s) * Math.abs(s) ** e * half * 0.7;
      p.push(x, v - 0.5, z);
      uv.push(i / segs, v);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i;
      const b = a + segs + 1;
      ix.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return build(p, uv, ix);
}

/**
 * The turned stem the tines rise from: a lathe profile with a ball foot, a
 * waisted shaft, a collar and the flared yoke the three tines spring from.
 * Height 0.65 centred on the origin (the old cylinder's frame).
 */
export function forkStemGeometry() {
  const profile = [
    [0.0, 0.0], [0.06, 0.0], [0.1, 0.03], [0.11, 0.07], [0.09, 0.11], // ball foot
    [0.05, 0.14], [0.042, 0.3], [0.045, 0.42], // shaft
    [0.075, 0.45], [0.075, 0.49], [0.05, 0.51], // collar
    [0.07, 0.56], [0.12, 0.62], [0.14, 0.65], [0.0, 0.65] // yoke
  ];
  const segs = 32;
  const p = [];
  const uv = [];
  const ix = [];
  for (let j = 0; j < profile.length; j++) {
    const [r, y] = profile[j];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      p.push(Math.cos(a) * r, y - 0.325, Math.sin(a) * r);
      uv.push(i / segs, y / 0.65);
    }
  }
  for (let j = 0; j < profile.length - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i;
      const b = a + segs + 1;
      ix.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return build(p, uv, ix);
}

/**
 * The overtone helix — the cast's namesake. A flat ribbon wound up round the
 * fork whose turns crowd together and whose radius shrinks as it climbs, the
 * way the overtone series 1, ½, ⅓, ¼ … crowds toward the top of the
 * spectrum. Unit height (0..1 on +Y), base radius 1.
 *
 * Attribute `aTurn` holds the turn index along the ribbon (0..turns) so the
 * shader can light it one harmonic at a time as the fork is struck.
 */
export function overtoneHelixGeometry(turns = 6, steps = 360) {
  const p = [];
  const uv = [];
  const turn = [];
  const ix = [];
  for (let k = 0; k <= steps; k++) {
    const s = k / steps;
    // Harmonic crowding: angle grows faster than height near the top.
    const harmonic = 1 - 1 / (1 + s * turns);
    const a = harmonic * (1 + 1 / turns) * turns * TAU;
    const y = s;
    const r = 1 / (1 + s * 2.2);
    const width = 0.06 * (1 - 0.5 * s);
    for (let side = 0; side < 2; side++) {
      const lift = (side ? 1 : -1) * width;
      p.push(Math.cos(a) * r, y + lift, Math.sin(a) * r);
      uv.push(side, s);
      turn.push((a / TAU) % (turns + 1));
    }
    if (k < steps) {
      const n = k * 2;
      ix.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
  return build(p, uv, ix, [['aTurn', turn, 1]]);
}

/**
 * The carrier: a ringing bead — an annulus whose rim is pinched into seven
 * lobes, the shape of a vibrating membrane caught mid-cycle. Flat in XY, outer
 * radius 1 (the old RingGeometry(0.6, 1)).
 */
export function carrierGeometry(lobes = 7, segments = 112) {
  const p = [];
  const uv = [];
  const ix = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * TAU;
    const wobble = 1 + 0.08 * Math.cos(a * lobes);
    const inner = 0.6 * (1 - 0.06 * Math.cos(a * lobes));
    for (const [r, v] of [[inner, 0], [(inner + wobble) / 2, 0.5], [wobble, 1]]) {
      p.push(Math.cos(a) * r, Math.sin(a) * r, 0);
      uv.push(i / segments, v);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j;
      const b = a + 3;
      ix.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return build(p, uv, ix);
}

/** A flat unit disc (radius 1) in the XY plane with polar-friendly UVs. */
export function plateGeometry(segments = 96, rings = 12) {
  const p = [0, 0, 0];
  const uv = [0.5, 0.5];
  const ix = [];
  for (let r = 1; r <= rings; r++) {
    const rad = r / rings;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * TAU;
      p.push(Math.cos(a) * rad, Math.sin(a) * rad, 0);
      uv.push(0.5 + Math.cos(a) * rad * 0.5, 0.5 + Math.sin(a) * rad * 0.5);
    }
  }
  for (let i = 0; i < segments; i++) ix.push(0, 1 + i, 1 + ((i + 1) % segments));
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segments;
    const b0 = 1 + r * segments;
    for (let i = 0; i < segments; i++) {
      const i1 = (i + 1) % segments;
      ix.push(a0 + i, b0 + i, a0 + i1, a0 + i1, b0 + i, b0 + i1);
    }
  }
  return build(p, uv, ix);
}

/**
 * The drifting notes: `count` points laid on a golden-angle spiral over the
 * unit disc, each with a phase that staggers when it rises. The note shader
 * owns their motion; this only seeds where and when.
 */
export function noteCloudGeometry(count = 96) {
  const p = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = i * 2.399963; // the golden angle
    const r = Math.sqrt((i + 0.5) / count);
    p[i * 3] = Math.cos(a) * r;
    p[i * 3 + 1] = (i % 7) / 7;
    p[i * 3 + 2] = Math.sin(a) * r;
    phase[i] = (i * 0.618034) % 1;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(p, 3));
  g.setAttribute('phase', new BufferAttribute(phase, 1));
  return g;
}

/**
 * The carrier's wake: the line of sound from the caster's hand to the fork.
 * A strip along +Z, 0..1 (`uv.x` along, `uv.y` across, −1..1 in X). The wake
 * shader lays it out in metres — its length, its rise from hand height to the
 * carrier, the standing wave that swings it from side to side and the
 * envelope that pinches it at both ends — so one geometry serves any range.
 * Drawn twice, crossed, so it has a body from any side.
 */
export function carrierWakeGeometry(segments = 120, rows = 4) {
  const p = [];
  const uv = [];
  const ix = [];
  for (let i = 0; i <= segments; i++) {
    const s = i / segments;
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      p.push(v * 2 - 1, 0, s);
      uv.push(s, v);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = a + rows + 1;
      ix.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = build(p, uv, ix);
  g.computeBoundingSphere();
  return g;
}
