import { BufferAttribute, BufferGeometry } from 'three';

/**
 * Procedural geometry for MASS WEFT.
 *
 * Every builder here produces a mesh in *normalised corridor space*: the
 * ability scales it per frame from the live settings, so none of the metres
 * are baked and every slider can reshape a corridor already standing. The
 * builders run once, at construction — never per frame.
 *
 * The cast is a loom. A shuttle (the core) runs down the line laying a gravity
 * weft behind it; the weft is the ribbon on the floor, two helical filaments
 * twisting round it, and a row of bead rings that the filaments thread
 * through. Each accepted pulse sends compression rings down the corridor and a
 * contact rosette under every body it struck (`GravityContacts`).
 */

const TAU = Math.PI * 2;

/** Pack plain arrays into an indexed BufferGeometry. Construction only. */
function build(positions, uvs, indices, normals = null) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  if (normals) geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setIndex(indices);
  if (!normals) geometry.computeVertexNormals();
  return geometry;
}

/** Quad-strip indices for a `rows × cols` vertex grid. */
function gridIndices(rows, cols, out) {
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const n = j * cols + i;
      out.push(n, n + cols, n + 1, n + 1, n + cols, n + cols + 1);
    }
  }
  return out;
}

/**
 * The weft ribbon: a long, narrow sheet whose edges fold up into a shallow
 * trough. Local +Y is the cast axis (0 at the caster, 1 at the aim point) and
 * X spans -0.5..0.5 across the corridor. The ability lays it flat
 * (`rotation.x = π/2`) and scales X by the corridor width, Y by its length.
 *
 * The fold is quadratic in X so the trough reads as mass pressing the floor
 * down along the spine, and the field shader's vertex stage ripples it.
 */
export function gravityRibbonGeometry() {
  const rows = 65;
  const cols = 9;
  const p = [];
  const uv = [];
  const ix = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const t = j / (rows - 1);
      const u = (i / (cols - 1)) * 2 - 1;
      p.push(u * 0.5, t, u * u * 0.1);
      uv.push(i / (cols - 1), t);
    }
  }
  gridIndices(rows, cols, ix);
  return build(p, uv, ix);
}

/**
 * Two helical filaments in normalised corridor coordinates: a thin tube wound
 * four full turns round the corridor axis (local Z, 0..1). The ability draws
 * two copies half a turn apart and counter-rotates them, so the pair reads as
 * the twist of a single thread being spun.
 */
export function gravityFilamentGeometry() {
  const rows = 97;
  const cols = 7;
  const p = [];
  const uv = [];
  const ix = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const t = j / (rows - 1);
      const phase = t * Math.PI * 8;
      const side = (i / (cols - 1)) * TAU;
      const r = 0.31 + 0.018 * Math.cos(side);
      p.push(Math.cos(phase) * r, Math.sin(phase) * r + 0.018 * Math.sin(side), t);
      uv.push(i / (cols - 1), t);
    }
  }
  gridIndices(rows, cols, ix);
  return build(p, uv, ix);
}

/**
 * A faceted compression ring in the plane of the corridor cross-section: a
 * unit-radius loop with a six-sided profile, so it catches light as a hard
 * band rather than a soft torus.
 */
export function compressionRingGeometry() {
  const sides = 72;
  const profile = 6;
  const p = [];
  const uv = [];
  const ix = [];
  for (let i = 0; i <= sides; i++) {
    for (let j = 0; j <= profile; j++) {
      const a = (i * TAU) / sides;
      const b = (j * TAU) / profile;
      const r = 0.5 + 0.025 * Math.cos(b);
      p.push(Math.cos(a) * r, Math.sin(a) * r, 0.025 * Math.sin(b));
      uv.push(i / sides, j / profile);
    }
  }
  for (let i = 0; i < sides; i++) {
    for (let j = 0; j < profile; j++) {
      const n = i * (profile + 1) + j;
      ix.push(n, n + profile + 1, n + 1, n + 1, n + profile + 1, n + profile + 2);
    }
  }
  return build(p, uv, ix);
}

/**
 * A bead ring — the heddle the filaments thread through. Instead of a smooth
 * torus it is a loop of `beads` swollen lobes joined by a waisted cord: the
 * tube radius is modulated by `|cos(beads·a)|^k`, which reads as a string of
 * pearls at distance and as a loom heddle up close.
 *
 * Outer radius ≈ 0.65 (the old torus), in the XY plane, so the ability's
 * placement and tilt carry over unchanged. `uv.x` runs round the ring and
 * `uv.y` round the tube; the shader uses `uv.x` to march light round it.
 */
export function weftRingGeometry(beads = 12) {
  const around = beads * 8;
  const tube = 10;
  const p = [];
  const uv = [];
  const n = [];
  const ix = [];
  const R = 0.65;
  for (let i = 0; i <= around; i++) {
    const a = (i / around) * TAU;
    const lobe = Math.pow(Math.abs(Math.cos(a * beads * 0.5)), 3);
    const r = 0.018 + 0.042 * lobe;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let j = 0; j <= tube; j++) {
      const b = (j / tube) * TAU;
      const cb = Math.cos(b);
      const sb = Math.sin(b);
      p.push((R + r * cb) * ca, (R + r * cb) * sa, r * sb);
      n.push(cb * ca, cb * sa, sb);
      uv.push(i / around, j / tube);
    }
  }
  for (let i = 0; i < around; i++) {
    for (let j = 0; j < tube; j++) {
      const a = i * (tube + 1) + j;
      const b = a + tube + 1;
      ix.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return build(p, uv, ix, n);
}

/**
 * The shuttle — the hero of the travel. A lathe of a weaver's shuttle: two
 * pointed tips and a pinched waist with a ridge round it, long axis on local
 * Z (the corridor axis) so it flies point-first down the line.
 *
 * Profile (radius as a function of `s` in -1..1 along the axis):
 *   - a `sin`-shaped belly falling to sharp tips,
 *   - pinched at the waist by a narrow gaussian,
 *   - a raised ridge either side of the waist (the bobbin's spool lips).
 *
 * Unit-ish size (≈0.23 radius, 0.62 long) so the old sphere's scale applies.
 * `uv.y` is the axial coordinate 0..1; the shader keys the event-horizon band
 * off it.
 */
export function shuttleGeometry() {
  const rings = 48;
  const segs = 28;
  const p = [];
  const uv = [];
  const ix = [];
  const half = 0.31;
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const s = v * 2 - 1;
    const belly = Math.pow(Math.sin(Math.PI * v), 0.75);
    const waist = 1 - 0.38 * Math.exp(-s * s * 60);
    const lips = 1 + 0.16 * Math.exp(-Math.pow((Math.abs(s) - 0.2) * 14, 2));
    const r = 0.23 * belly * waist * lips;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      // Six shallow flutes give the spin something to show.
      const flute = 1 + 0.04 * Math.cos(a * 6);
      p.push(Math.cos(a) * r * flute, Math.sin(a) * r * flute, s * half);
      uv.push(i / segs, v);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i;
      const b = a + segs + 1;
      ix.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return build(p, uv, ix);
}

/**
 * A loom frame — the hero of the standing corridor. A pointed (ogival) arch
 * swept with a heavy, squared, bevelled section: two legs with flared feet,
 * two curved shoulders meeting at a swollen keystone, and three studded bands
 * on each leg where the warp would be tied off.
 *
 * Normalised so the ability can derive it from the settings: the span runs
 * X -0.5..0.5, the height Y 0..1, and the section depth along Z is ±0.07
 * (the ability scales Z by `archDepth`). `uv.y` runs 0..1 along the sweep
 * (foot → apex → foot) and `uv.x` round the section, so the stone shader can
 * march seams and runes along it. Built once; the ability only moves it.
 */
export function loomArchGeometry() {
  const steps = 96;
  const ring = 12;
  const p = [];
  const uv = [];
  const ix = [];
  // Centreline: straight legs to 0.52 of the height, then a pointed arch.
  const legTop = 0.52;
  const legLen = legTop;
  const arcLen = 0.62; // rough length of one shoulder, normalised
  const total = 2 * (legLen + arcLen);
  const at = (s, out) => {
    // s 0..1 along the whole sweep; mirror the second half.
    const d = s * total;
    const half = total / 2;
    const m = d <= half ? d : total - d;
    const sign = d <= half ? -1 : 1;
    if (m <= legLen) {
      out[0] = sign * 0.5;
      out[1] = m;
    } else {
      // Shoulder: a circle arc centred on the far leg's line, which is what
      // makes a two-centred (pointed) arch.
      const k = (m - legLen) / arcLen; // 0..1 up the shoulder
      const R = 1.0;
      const cx = -sign * 0.5;
      const a0 = 0;
      const a1 = Math.acos(0.5); // the arc meets its twin at the apex
      const a = a0 + (a1 - a0) * k;
      out[0] = cx + sign * Math.cos(a) * R;
      out[1] = legTop + Math.sin(a) * (1 - legTop) / Math.sin(a1);
    }
    return out;
  };
  const c0 = [0, 0];
  const c1 = [0, 0];
  for (let j = 0; j <= steps; j++) {
    const s = j / steps;
    at(s, c0);
    at(Math.min(1, s + 0.002), c1);
    if (s + 0.002 > 1) at(s - 0.002, c1), (c1[0] = 2 * c0[0] - c1[0]), (c1[1] = 2 * c0[1] - c1[1]);
    let tx = c1[0] - c0[0];
    let ty = c1[1] - c0[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    // In-plane normal (perpendicular to the sweep) and the Z axis.
    const nx = -ty;
    const ny = tx;
    // Swellings: flared feet, three tie-off studs per leg, the keystone.
    const m = Math.min(s, 1 - s) * 2; // 0 at the feet, 1 at the apex
    let swell = 1 + 0.9 * Math.exp(-Math.pow(m * 14, 2));
    for (const k of [0.16, 0.28, 0.4]) swell *= 1 + 0.32 * Math.exp(-Math.pow((m - k) * 60, 2));
    swell *= 1 + 0.75 * Math.exp(-Math.pow((m - 1) * 16, 2));
    const w = 0.045 * swell; // half-thickness in the arch plane
    const dz = 0.07 * (0.8 + 0.2 * swell); // half-depth along the corridor
    for (let i = 0; i <= ring; i++) {
      const a = (i / ring) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // A squared section with bevelled corners: superellipse, exponent 0.45.
      const qx = Math.sign(ca) * Math.pow(Math.abs(ca), 0.45);
      const qz = Math.sign(sa) * Math.pow(Math.abs(sa), 0.45);
      p.push(c0[0] + nx * qx * w, c0[1] + ny * qx * w, qz * dz);
      uv.push(i / ring, s);
    }
  }
  for (let j = 0; j < steps; j++) {
    for (let i = 0; i < ring; i++) {
      const a = j * (ring + 1) + i;
      const b = a + ring + 1;
      ix.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return build(p, uv, ix);
}

/**
 * A loom weight — what each strike drops on a body. Warp-weighted looms hung
 * their threads from fired-clay weights; this one is a truncated, four-sided
 * pyramid of dark stone (a lathe whose radius is a rounded square in angle),
 * with a cord hole near the top and a groove band round the waist.
 *
 * Base at Y 0, top at Y 1, base half-width ≈ 0.42. `uv.y` is height and
 * `uv.x` round the body.
 */
export function loomWeightGeometry() {
  const rings = 28;
  const segs = 32;
  const p = [];
  const uv = [];
  const ix = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    // Truncated pyramid with a rounded cap and a chamfered base.
    let r = 0.42 - 0.24 * v;
    r *= 1 - 0.55 * Math.pow(Math.max(0, (v - 0.86) / 0.14), 2);
    r *= 1 - 0.35 * Math.pow(Math.max(0, (0.06 - v) / 0.06), 2);
    // The groove a cord would sit in.
    r *= 1 - 0.08 * Math.exp(-Math.pow((v - 0.36) * 30, 2));
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Rounded square: four faces, softened corners.
      const sq = 1 / Math.pow(Math.pow(Math.abs(ca), 4) + Math.pow(Math.abs(sa), 4), 0.25);
      const k = 0.75 + 0.25 * Math.min(1.42, sq) / 1.42;
      // The cord hole: a dent through two faces near the top.
      const hole = Math.exp(-Math.pow((v - 0.72) * 18, 2)) * Math.pow(Math.abs(sa), 16) * 0.5;
      const rr = r * sq * k * (1 - hole);
      p.push(ca * rr, v, sa * rr);
      uv.push(i / segs, v);
    }
  }
  // Cap the base so the stone is closed from below.
  const centre = p.length / 3;
  p.push(0, 0, 0);
  uv.push(0.5, 0);
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i;
      const b = a + segs + 1;
      ix.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  for (let i = 0; i < segs; i++) ix.push(centre, i + 1, i);
  return build(p, uv, ix);
}

/**
 * The floor the corridor sags into: a fine grid over local X -0.5..0.5,
 * Y 0..1 (same frame as the ribbon), dense enough across the width that the
 * vertex stage can pull the cloth down into a well along the spine.
 */
export function weftFloorGeometry() {
  const rows = 97;
  const cols = 25;
  const p = [];
  const uv = [];
  const ix = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const u = i / (cols - 1);
      const t = j / (rows - 1);
      p.push(u - 0.5, t, 0);
      uv.push(u, t);
    }
  }
  gridIndices(rows, cols, ix);
  return build(p, uv, ix);
}
