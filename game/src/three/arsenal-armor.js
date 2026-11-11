// Arsenal Forge armor on character bodies.
//
// Forged armor is authored as unskinned pieces, each in its own frame, for a figure standing with arms down.
// To wear one, the piece is measured against the wearer's own skeleton in its bind pose, wrapped onto the
// matching bones, and given skin weights so it bends with elbows, knees and spine instead of floating on a socket.
// Everything a character wears is merged into two skinned meshes (metal, everything else): two draw calls.
import { BufferAttribute, BufferGeometry, Matrix3, Matrix4, MeshStandardMaterial, SkinnedMesh, Vector3 } from 'three';
import { loadModel } from './models.js';
import { ARSENAL_ARMOR_MESHES } from '@shared/arsenal-armor.generated.js';

const base = () => `${import.meta.env?.BASE_URL ?? '/'}assets/arsenal/`;
const FRONT = new Vector3(0, 0, 1), UP = new Vector3(0, 1, 0);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const smooth = (from, to, value) => { const t = clamp((value - from) / (to - from), 0, 1); return t * t * (3 - 2 * t); };
const SIDED = /^(shoulder|upperarm|forearm|hand|thigh|shin|foot|toe)\.?([LR])$/;
const boneName = (name) => name.replace(SIDED, '$1.$2');
const otherSide = (name) => name.replace(/\.([LR])$/, (_, side) => `.${side === 'L' ? 'R' : 'L'}`);

// ---------------------------------------------------------------------------------------------------------
// Pieces: decoded once per id into plain arrays in the piece's own metres.
const pieces = new Map();
function pieceData(id) {
  if (pieces.has(id)) return pieces.get(id);
  const entry = ARSENAL_ARMOR_MESHES[id];
  const pending = loadModel(base() + entry.path).then((gltf) => {
    gltf.scene.updateMatrixWorld(true);
    const surfaces = [], point = new Vector3(), normalMatrix = new Matrix3();
    gltf.scene.traverse((node) => {
      if (!node.isMesh) return;
      const { position, normal, color } = node.geometry.attributes, count = position.count;
      const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), colours = new Float32Array(count * 3);
      normalMatrix.getNormalMatrix(node.matrixWorld);
      for (let i = 0; i < count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld).toArray(positions, i * 3);
        point.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize().toArray(normals, i * 3);
        colours[i * 3] = color ? color.getX(i) : 1; colours[i * 3 + 1] = color ? color.getY(i) : 1; colours[i * 3 + 2] = color ? color.getZ(i) : 1;
      }
      surfaces.push({ metal: (node.material.metalness ?? 0) > .5, roughness: node.material.roughness ?? .8, positions, normals, colours, index: Array.from(node.geometry.index.array) });
    });
    return { id, family: entry.family, min: new Vector3(...entry.min), max: new Vector3(...entry.max), surfaces };
  });
  pending.catch(() => pieces.delete(id));
  pieces.set(id, pending);
  return pending;
}

// ---------------------------------------------------------------------------------------------------------
// The wearer: bind-pose joints and a few measurements taken from the body's own vertices.
function rigOf(body) {
  const mesh = body.meshes.filter((m) => m.isSkinnedMesh).sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0];
  if (!mesh) return null;
  const cached = mesh.geometry.userData.arsenalRig;
  const index = {}, J = {};
  const toGeometry = new Matrix4().copy(mesh.bindMatrixInverse), bind = new Matrix4();
  mesh.skeleton.bones.forEach((bone, i) => {
    const name = boneName(bone.name); index[name] = i;
    J[name] = cached?.J[name] ?? new Vector3().setFromMatrixPosition(bind.copy(mesh.skeleton.boneInverses[i]).invert().premultiply(toGeometry));
  });
  const need = ['hips', 'spine', 'spine1', 'spine2', 'neck', 'head', 'upperarm.L', 'forearm.L', 'hand.L', 'thigh.L', 'shin.L', 'foot.L', 'toe.L'];
  if (need.some((name) => !J[name])) return null;
  if (cached) return { mesh, index, J, M: cached.M };

  // One pass over the body: extents of the vertices each region's bones own.
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  const names = mesh.skeleton.bones.map((bone) => boneName(bone.name));
  const region = () => ({ min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) });
  const head = region(), face = region(), chest = region(), waist = region(), foot = region();
  const point = new Vector3(), handAxis = new Vector3().subVectors(J['hand.L'], J['forearm.L']).normalize();
  let handReach = 0;
  const points = new Float32Array(position.count * 3), owners = new Array(position.count);
  for (let i = 0; i < position.count; i++) {
    let owner = 0, best = -1;
    for (let k = 0; k < 4; k++) { const w = skinWeight.getComponent(i, k); if (w > best) { best = w; owner = skinIndex.getComponent(i, k); } }
    const name = names[owner]; point.fromBufferAttribute(position, i);
    point.toArray(points, i * 3); owners[i] = name;
    if (name === 'head') {
      head.min.min(point); head.max.max(point);
      if (point.y > J.head.y + .03 && point.y < J.head.y + .15 && Math.abs(point.x) < .05) { face.min.min(point); face.max.max(point); }
    } else if ((name === 'spine1' || name === 'spine2') && Math.abs(point.x) < J['upperarm.L'].x && point.y < J.neck.y - .04) { chest.min.min(point); chest.max.max(point); }
    else if ((name === 'hips' || name === 'spine') && point.y > J.hips.y - .06) { waist.min.min(point); waist.max.max(point); }
    else if (name === 'foot.L' || name === 'toe.L') { foot.min.min(point); foot.max.max(point); }
    else if (name === 'hand.L') handReach = Math.max(handReach, point.sub(J['hand.L']).dot(handAxis));
  }
  const finite = (r, fallbackMin, fallbackMax) => { if (!Number.isFinite(r.min.x)) { r.min.copy(fallbackMin); r.max.copy(fallbackMax); } return r; };
  const M = {
    crown: Math.min(head.max.y, J.head.y + .245),
    faceFront: Number.isFinite(face.max.z) ? face.max.z : J.head.z + .11,
    chest: finite(chest, new Vector3(-.17, J.spine.y, -.11), new Vector3(.17, J.neck.y, .12)),
    waist: finite(waist, new Vector3(-.16, J.hips.y - .05, -.1), new Vector3(.16, J.spine.y, .11)),
    foot: finite(foot, new Vector3(J['foot.L'].x - .05, 0, J['foot.L'].z - .07), new Vector3(J['foot.L'].x + .05, .13, J['toe.L'].z + .08)),
    hand: clamp(handReach, .12, .22),
    points, owners,
  };
  mesh.geometry.userData.arsenalRig = { J, M };
  return { mesh, index, J, M };
}

// ---------------------------------------------------------------------------------------------------------
// Mappings. Each takes a vertex in piece space and writes its place on the body, its normal and its bones.

/**
 * Wrap a piece that runs along a limb. `knots` pair a height in the piece with a joint on the body, top to
 * bottom; the piece's cross-section rides the bone between each pair and the two frames blend across a joint.
 */
function limb(knots, { radial = 1, twist = 0, offset = null, band = .045 } = {}) {
  const segments = knots.slice(0, -1).map((knot, i) => {
    const next = knots[i + 1], along = new Vector3().subVectors(next.p, knot.p), length = along.length(); along.normalize();
    const Y = along.clone().negate();
    let Z = FRONT.clone().addScaledVector(Y, -FRONT.dot(Y)).normalize();
    let X = new Vector3().crossVectors(Y, Z);
    if (twist) { const c = Math.cos(twist), s = Math.sin(twist), x = X.clone(); X = x.clone().multiplyScalar(c).addScaledVector(Z, s); Z = Z.clone().multiplyScalar(c).addScaledVector(x, -s); }
    return { top: knot.y, bottom: next.y, p: knot.p, along, length, X, Y, Z, bone: knot.bone };
  });
  const place = (s, v, out) => out.copy(s.p).addScaledVector(s.along, ((s.top - v.y) / (s.top - s.bottom)) * s.length)
    .addScaledVector(s.X, (v.x - (offset?.x ?? 0)) * radial).addScaledVector(s.Z, (v.z - (offset?.z ?? 0)) * radial);
  const turn = (s, n, out) => out.set(0, 0, 0).addScaledVector(s.X, n.x).addScaledVector(s.Y, n.y).addScaledVector(s.Z, n.z);
  const a = new Vector3(), b = new Vector3(), source = new Vector3(), sourceNormal = new Vector3();
  const map = (position, normal, skin) => {
    source.copy(position); sourceNormal.copy(normal);
    let k = segments.findIndex((s) => source.y >= s.bottom); if (k < 0) k = segments.length - 1;
    // Nearest interior joint decides whether this vertex blends two segments.
    let joint = -1;
    if (k > 0 && source.y > segments[k].top - band) joint = k;
    else if (k < segments.length - 1 && source.y < segments[k].bottom + band) joint = k + 1;
    if (joint < 0) {
      place(segments[k], source, position); turn(segments[k], sourceNormal, normal).normalize();
      skin.push([segments[k].bone, 1]);
      return;
    }
    const upper = segments[joint - 1], lower = segments[joint], f = smooth(lower.top + band, lower.top - band, source.y);
    place(upper, source, a); place(lower, source, b); position.lerpVectors(a, b, f);
    turn(upper, sourceNormal, a); turn(lower, sourceNormal, b); normal.lerpVectors(a, b, f).normalize();
    skin.push([upper.bone, 1 - f], [lower.bone, f]);
  };
  // Where a point of the body lies in the piece's own frame; used to check the piece clears the body.
  const rel = new Vector3();
  map.inverse = (point, bone, out) => {
    const s = segments.find((segment) => segment.bone === bone); if (!s) return null;
    const t = rel.subVectors(point, s.p).dot(s.along) / s.length; if (t < -.04 || t > 1.04) return null;
    rel.addScaledVector(s.along, -t * s.length);
    return out.set(rel.dot(s.X) / radial + (offset?.x ?? 0), s.top - t * (s.top - s.bottom), rel.dot(s.Z) / radial + (offset?.z ?? 0));
  };
  return map;
}

/** Scale and place a piece that sits on the trunk or head. `bones(point)` names the bones for a placed vertex. */
function seat(scale, translate, bones) {
  const inverse = new Vector3(1 / scale.x, 1 / scale.y, 1 / scale.z);
  const map = (position, normal, skin) => {
    position.multiply(scale).add(translate);
    normal.multiply(inverse).normalize();
    bones(position, skin);
  };
  map.inverse = (point, bone, out) => out.copy(point).sub(translate).multiply(inverse);
  return map;
}

/**
 * Make a piece clear the body it is worn on. Both are compared in the piece's own frame as rings around its
 * vertical axis: wherever the body reaches past the piece's inner surface, that part of the piece is widened
 * just enough. Scaling whole rings keeps plate thickness, edges and rivets in their authored order.
 */
function clearance(piece, instance, rig) {
  const NY = 22, NA = 24, margin = instance.margin ?? .012, limit = instance.widen ?? 1.7;
  const centre = instance.centre ?? { x: 0, z: 0 }, flip = instance.flip ? -1 : 1;
  const low = piece.min.y, span = piece.max.y - piece.min.y;
  const body = new Float32Array(NY * NA), inner = new Float32Array(NY * NA).fill(Infinity);
  const bin = (x, y, z) => {
    const row = Math.floor(((y - low) / span) * NY); if (row < 0 || row >= NY) return -1;
    const angle = Math.atan2(z - centre.z, x - centre.x) / (Math.PI * 2) + .5;
    return row * NA + Math.min(NA - 1, Math.floor(angle * NA));
  };
  const local = new Vector3(), point = new Vector3(), { points, owners } = rig.M;
  for (let i = 0; i < owners.length; i++) {
    if (!instance.bones.has(owners[i])) continue;
    point.fromArray(points, i * 3);
    if (instance.owns && !instance.owns(point, owners[i])) continue;
    if (!instance.map.inverse(point, owners[i], local)) continue;
    const at = bin(local.x, local.y, local.z);
    if (at >= 0) body[at] = Math.max(body[at], Math.hypot(local.x - centre.x, local.z - centre.z));
  }
  for (const surface of piece.surfaces) for (let i = 0; i < surface.positions.length; i += 3) {
    if (instance.keep && !instance.keep(surface.positions[i])) continue;
    const x = surface.positions[i] * flip, at = bin(x, surface.positions[i + 1], surface.positions[i + 2]);
    if (at >= 0) inner[at] = Math.min(inner[at], Math.hypot(x - centre.x, surface.positions[i + 2] - centre.z));
  }
  // The body is sampled at its vertices only, so let every ring cell also answer for its neighbours.
  const reach = new Float32Array(NY * NA);
  for (let row = 0; row < NY; row++) for (let col = 0; col < NA; col++) {
    let most = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr; if (r < 0 || r >= NY) continue;
      most = Math.max(most, body[r * NA + (col + dc + NA) % NA]);
    }
    reach[row * NA + col] = most;
  }
  let grid = new Float32Array(NY * NA).fill(1);
  for (let row = 0; row < NY; row++) {
    // A spike or prop baked into the costume should not balloon the armor: cap each ring near its typical reach.
    const ring = Array.from(reach.subarray(row * NA, row * NA + NA)).filter((r) => r > 0).sort((a, b) => a - b);
    const cap = ring.length ? ring[Math.floor(ring.length / 2)] * 1.35 : 0;
    for (let col = 0; col < NA; col++) {
      const at = row * NA + col;
      if (reach[at] > 0 && Number.isFinite(inner[at]) && inner[at] > .01) grid[at] = clamp((Math.min(reach[at], cap) + margin) / inner[at], 1, limit);
    }
  }
  // Spread each correction to its neighbours, then soften, so the widening has no steps.
  const pass = (combine) => {
    const next = new Float32Array(NY * NA);
    for (let row = 0; row < NY; row++) for (let col = 0; col < NA; col++) {
      const around = [grid[row * NA + col], grid[row * NA + (col + 1) % NA], grid[row * NA + (col + NA - 1) % NA], grid[Math.min(NY - 1, row + 1) * NA + col], grid[Math.max(0, row - 1) * NA + col]];
      next[row * NA + col] = combine(around);
    }
    grid = next;
  };
  pass((around) => Math.max(...around)); pass((around) => Math.max(...around)); pass((around) => around.reduce((sum, value) => sum + value, 0) / around.length);
  return (position) => {
    const fy = clamp(((position.y - low) / span) * NY - .5, 0, NY - 1), fa = (Math.atan2(position.z - centre.z, position.x - centre.x) / (Math.PI * 2) + .5) * NA - .5;
    const row = Math.floor(fy), ty = fy - row, col = Math.floor(fa), ta = fa - col;
    const at = (r, c) => grid[Math.min(NY - 1, r) * NA + ((c % NA) + NA) % NA];
    const k = (at(row, col) * (1 - ta) + at(row, col + 1) * ta) * (1 - ty) + (at(row + 1, col) * (1 - ta) + at(row + 1, col + 1) * ta) * ty;
    position.x = centre.x + (position.x - centre.x) * k; position.z = centre.z + (position.z - centre.z) * k;
  };
}

/** Height in the piece where a limb piece is widest (elbow or knee cop), searched in its middle band. */
function widestHeight(piece, low, high, centreX = 0) {
  const bins = new Float32Array(24), span = piece.max.y - piece.min.y;
  for (const surface of piece.surfaces) for (let i = 0; i < surface.positions.length; i += 3) {
    const t = (surface.positions[i + 1] - piece.min.y) / span;
    if (t < low || t > high) continue;
    const radius = Math.hypot(Math.abs(surface.positions[i]) - centreX, surface.positions[i + 2]);
    const bin = Math.min(23, Math.floor(((t - low) / (high - low)) * 24));
    bins[bin] = Math.max(bins[bin], radius);
  }
  let best = 12; for (let i = 0; i < 24; i++) if (bins[i] > bins[best]) best = i;
  return piece.min.y + span * (low + ((best + .5) / 24) * (high - low));
}

const spineBones = (J) => (point, skin) => {
  // Bands up the trunk, each handing over to the next across the joint between them.
  const chain = [['hips', J.hips.y], ['spine', J.spine.y], ['spine1', J.spine1.y], ['spine2', J.spine2.y]];
  if (point.y <= chain[0][1]) { skin.push(['hips', 1]); return; }
  for (let i = 0; i < chain.length - 1; i++) if (point.y <= chain[i + 1][1]) {
    const f = smooth(chain[i][1], chain[i + 1][1], point.y); skin.push([chain[i][0], 1 - f], [chain[i + 1][0], f]); return;
  }
  skin.push(['spine2', 1]);
};

const TRUNK = new Set(['hips', 'spine', 'spine1', 'spine2']);
const ROBED = new Set([...TRUNK, 'thigh.L', 'thigh.R', 'shin.L', 'shin.R']);
const FIT = {
  helmet(piece, { J, M }) {
    // Forged helms put their origin at the base of the skull with the crown about 27 cm above it.
    const scale = clamp((M.crown - J.head.y) / .215, .86, 1.2);
    const translate = new Vector3(0, M.crown + .012 - .27 * scale, J.head.z + .012);
    return [{ map: seat(new Vector3(scale, scale, scale), translate, (_, skin) => skin.push(['head', 1])) }];
  },
  mask(piece, { J, M }) {
    const scale = clamp((M.crown - J.head.y) / .215, .86, 1.2) * .96;
    const middle = (piece.min.y + piece.max.y) / 2;
    const translate = new Vector3(0, J.head.y + .1 - middle * scale, M.faceFront + .024 - piece.max.z * scale);
    return [{ map: seat(new Vector3(scale, scale, scale), translate, (_, skin) => skin.push(['head', 1])) }];
  },
  chest(piece, { J, M }) {
    // Waist line of the piece (its origin) on the wearer's waist, collar at the base of the neck.
    const sy = (J.neck.y - .012 - J.spine.y) / piece.max.y;
    const sx = clamp(((M.chest.max.x - M.chest.min.x) / 2 * 1.1) / piece.max.x, sy * .9, sy * 1.45);
    const sz = clamp(((M.chest.max.z - M.chest.min.z) * 1.12) / (piece.max.z - piece.min.z), sy * .9, sy * 1.45);
    const translate = new Vector3(0, J.spine.y, (M.chest.max.z + M.chest.min.z) / 2 - ((piece.max.z + piece.min.z) / 2) * sz);
    const reach = J['upperarm.L'].x;
    return [{ map: seat(new Vector3(sx, sy, sz), translate, spineBones(J)), bones: TRUNK, owns: (point) => Math.abs(point.x) < reach, centre: { x: 0, z: (piece.max.z + piece.min.z) / 2 }, margin: .022 }];
  },
  belt(piece, { J, M }) {
    const sx = clamp(((M.waist.max.x - M.waist.min.x) / 2 * 1.06) / piece.max.x, .7, 1.2);
    const sz = clamp(((M.waist.max.z - M.waist.min.z) * 1.08) / (piece.max.z - piece.min.z), .7, 1.2);
    const translate = new Vector3(0, J.hips.y + .035, (M.waist.max.z + M.waist.min.z) / 2 - ((piece.max.z + piece.min.z) / 2) * sz);
    return [{ map: seat(new Vector3(sx, (sx + sz) / 2, sz), translate, (point, skin) => {
      // Anything hanging below the belt line follows the thigh on its side.
      const hang = smooth(J.hips.y - .03, J.hips.y - .16, point.y) * .6, left = smooth(-.03, .03, point.x);
      skin.push(['hips', 1 - hang], ['thigh.L', hang * left], ['thigh.R', hang * (1 - left)]);
    }), bones: TRUNK, centre: { x: 0, z: (piece.max.z + piece.min.z) / 2 } }];
  },
  robe(piece, { J, M }) {
    // Hem on the ground, collar at the base of the neck; width follows the chest.
    const sy = (J.neck.y - .01) / piece.max.y;
    const s = new Vector3(sy, sy, sy), translate = new Vector3(0, 0, (M.chest.max.z + M.chest.min.z) / 2);
    const trunk = spineBones(J), shoulder = J['upperarm.L'].x;
    return [{ bones: ROBED, owns: (point) => point.y < J.spine1.y || Math.abs(point.x) < shoulder, margin: .02, map: seat(s, translate, (point, skin) => {
      const side = point.x >= 0 ? 'L' : 'R', reach = Math.abs(point.x);
      if (point.y > J.spine1.y && reach > shoulder - .02) {
        // Sleeve: hands over from the trunk to the upper arm across the shoulder.
        const f = smooth(shoulder - .02, shoulder + .06, reach), start = skin.length;
        trunk(point, skin); for (let i = start; i < skin.length; i++) skin[i][1] *= 1 - f;
        skin.push([`upperarm.${side}`, f]);
      } else if (point.y >= J.hips.y) trunk(point, skin);
      else {
        // Skirt: follows the thighs, then the shins, while the hips keep it from splitting.
        const drop = smooth(J.hips.y, J['shin.L'].y, point.y) * .62, lower = smooth(J['shin.L'].y, J['shin.L'].y - .3, point.y) * .5;
        const left = smooth(-.05, .05, point.x);
        skin.push(['hips', 1 - drop], ['thigh.L', drop * left * (1 - lower)], ['thigh.R', drop * (1 - left) * (1 - lower)], [`shin.${side}`, drop * lower]);
      }
    }) }];
  },
  arm(piece, { J }) {
    const elbow = widestHeight(piece, .3, .7);
    const knots = [
      { y: piece.max.y, p: J['upperarm.L'].clone().lerp(J['forearm.L'], .2), bone: 'upperarm.L' },
      { y: elbow, p: J['forearm.L'], bone: 'forearm.L' },
      { y: piece.min.y, p: J['forearm.L'].clone().lerp(J['hand.L'], .94) },
    ];
    const reach = knots[0].p.distanceTo(knots[1].p) + knots[1].p.distanceTo(knots[2].p);
    const map = limb(knots, { radial: clamp(reach / (piece.max.y - piece.min.y), .8, 1.05) * .86 });
    const bones = new Set(['upperarm.L', 'forearm.L']);
    return [{ map, bones }, { map, bones, mirror: true }];
  },
  glove(piece, { J, M }) {
    // Cuff up the forearm, wrist on the hand joint, fingertips at the wearer's own reach.
    const wrist = piece.min.y + (piece.max.y - piece.min.y) * .5;
    const forearm = new Vector3().subVectors(J['forearm.L'], J['hand.L']).normalize();
    const scale = clamp((M.hand * 1.08) / (wrist - piece.min.y), .8, 1.35);
    const knots = [
      { y: piece.max.y, p: J['hand.L'].clone().addScaledVector(forearm, (piece.max.y - wrist) * scale), bone: 'forearm.L' },
      { y: wrist, p: J['hand.L'], bone: 'hand.L' },
      { y: piece.min.y, p: J['hand.L'].clone().addScaledVector(forearm, -M.hand * 1.08) },
    ];
    const map = limb(knots, { radial: scale * .9, twist: GLOVE_TWIST, band: .03 });
    const bones = new Set(['forearm.L']), cuff = (point, bone, out) => { const at = map.inverse(point, bone, out); return at && at.y > wrist + .01 ? at : null; };
    const cuffOnly = Object.assign((...args) => map(...args), { inverse: cuff });
    return [{ map: cuffOnly, bones }, { map: cuffOnly, bones, mirror: true }];
  },
  legs(piece, { J }) {
    // Both legs are one piece: each half is wrapped on its own leg around that leg's own centre line.
    const centre = piece.max.x * .5, knee = widestHeight(piece, .35, .65, centre);
    const knots = [
      { y: piece.max.y, p: J['thigh.L'].clone().addScaledVector(UP, .045), bone: 'thigh.L' },
      { y: knee, p: J['shin.L'], bone: 'shin.L' },
      { y: piece.min.y, p: J['foot.L'].clone().addScaledVector(UP, .015) },
    ];
    const wrap = limb(knots, { radial: clamp(J['thigh.L'].x / centre, .75, 1.1), offset: { x: centre, z: 0 } });
    const top = piece.max.y - (piece.max.y - piece.min.y) * .1;
    const left = (position, normal, skin) => {
      const lift = smooth(top, piece.max.y, position.y) * .45;
      wrap(position, normal, skin);
      if (lift) { for (const pair of skin) pair[1] *= 1 - lift; skin.push(['hips', lift]); }
    };
    left.inverse = wrap.inverse;
    const bones = new Set(['thigh.L', 'shin.L']), centreLine = { x: centre, z: 0 };
    return [{ map: left, bones, centre: centreLine, keep: (x) => x >= 0 }, { map: left, bones, centre: centreLine, keep: (x) => x < 0, flip: true, mirror: true }];
  },
  boot(piece, { J, M }) {
    // Sole on the ground, heel and toe on the wearer's own, shaft up the shin.
    const scale = clamp(((M.foot.max.z - M.foot.min.z) * 1.08) / (piece.max.z - piece.min.z), .7, 1.3);
    const yaw = Math.atan2(J['toe.L'].x - J['foot.L'].x, J['toe.L'].z - J['foot.L'].z), c = Math.cos(yaw), s = Math.sin(yaw);
    const heel = M.foot.min.z - .008 - piece.min.z * scale, ankle = J['foot.L'];
    const map = (position, normal, skin) => {
      const x = position.x * scale, z = position.z * scale;
      position.set(ankle.x + x * c + z * s, Math.max(0, M.foot.min.y) + position.y * scale, heel + z * c - x * s);
      const nx = normal.x, nz = normal.z; normal.set(nx * c + nz * s, normal.y, nz * c - nx * s);
      const shin = smooth(ankle.y - .01, ankle.y + .07, position.y), toe = (1 - shin) * smooth(J['toe.L'].z - .03, J['toe.L'].z + .03, position.z);
      skin.push(['shin.L', shin], ['foot.L', (1 - shin) - toe], ['toe.L', toe]);
    };
    const ground = Math.max(0, M.foot.min.y);
    // Only the shaft is checked against the leg; the foot is sized from the wearer's own foot above.
    map.inverse = (point, bone, out) => {
      if (point.y < ankle.y + .01) return null;
      const dx = point.x - ankle.x, dz = point.z - heel;
      return out.set((dx * c - dz * s) / scale, (point.y - ground) / scale, (dx * s + dz * c) / scale);
    };
    const bones = new Set(['shin.L', 'foot.L']);
    return [{ map, bones }, { map, bones, mirror: true }];
  },
  accessory(piece, { J, M }) {
    // Worn at the collar: top of the piece under the neck, lying on the chest.
    const centre = (piece.min.x + piece.max.x) / 2;
    const translate = new Vector3(-centre, J.neck.y - .035 - piece.max.y, M.chest.max.z + .012 - piece.min.z);
    return [{ map: seat(new Vector3(1, 1, 1), translate, (_, skin) => skin.push(['spine2', 1])) }];
  },
};
// The forged glove hangs palm-back with the thumb toward the body; the heroes' hands hang palm-in, thumb forward.
const GLOVE_TWIST = -Math.PI / 2;

// ---------------------------------------------------------------------------------------------------------
function collect(piece, rig, out) {
  const fit = FIT[piece.family]; if (!fit) return;
  const position = new Vector3(), normal = new Vector3();
  for (const instance of fit(piece, rig)) {
   const widen = instance.bones ? clearance(piece, instance, rig) : null;
   for (const surface of piece.surfaces) {
    const target = out[surface.metal ? 'metal' : 'matte'];
    target.roughness += surface.roughness * surface.index.length; target.weight += surface.index.length;
    const remap = new Int32Array(surface.positions.length / 3).fill(-1);
    const vertex = (i) => {
      if (remap[i] >= 0) return remap[i];
      position.fromArray(surface.positions, i * 3); normal.fromArray(surface.normals, i * 3);
      if (instance.flip) { position.x = -position.x; normal.x = -normal.x; }
      widen?.(position);
      const skin = [];
      instance.map(position, normal, skin);
      if (instance.mirror) { position.x = -position.x; normal.x = -normal.x; }
      skin.sort((a, b) => b[1] - a[1]); skin.length = Math.min(skin.length, 4);
      const total = skin.reduce((sum, pair) => sum + pair[1], 0) || 1;
      for (let k = 0; k < 4; k++) {
        const pair = skin[k], name = pair && (instance.mirror ? otherSide(pair[0]) : pair[0]);
        target.skinIndex.push(pair ? rig.index[name] ?? 0 : 0); target.skinWeight.push(pair ? pair[1] / total : 0);
      }
      target.position.push(position.x, position.y, position.z); target.normal.push(normal.x, normal.y, normal.z);
      target.color.push(surface.colours[i * 3], surface.colours[i * 3 + 1], surface.colours[i * 3 + 2]);
      return (remap[i] = target.count++);
    };
    for (let t = 0; t < surface.index.length; t += 3) {
      const a = surface.index[t], b = surface.index[t + 1], c = surface.index[t + 2];
      if (instance.keep && !instance.keep((surface.positions[a * 3] + surface.positions[b * 3] + surface.positions[c * 3]) / 3)) continue;
      // A mirrored copy is inside out until its winding is reversed; mirroring twice restores it.
      if (!!instance.mirror !== !!instance.flip) target.index.push(vertex(a), vertex(c), vertex(b)); else target.index.push(vertex(a), vertex(b), vertex(c));
    }
   }
  }
}

/**
 * Dress a body in forged armor. `ids` are Arsenal armor ids ("arsenal:armor/chest/03"); unknown ids are skipped.
 * Resolves to a handle with dispose(), or null when the body has no usable skeleton or nothing could be worn.
 */
export async function wearArmor(body, ids) {
  const wanted = [...new Set(ids)].filter((id) => ARSENAL_ARMOR_MESHES[id] && FIT[ARSENAL_ARMOR_MESHES[id].family]);
  const rig = rigOf(body);
  if (!rig || !wanted.length) return null;
  const loaded = (await Promise.all(wanted.map((id) => pieceData(id).catch((error) => { console.warn('[arsenal] Armor unavailable', id, error); return null; })))).filter(Boolean);
  if (!loaded.length || !rig.mesh.parent) return null; // body was replaced while pieces loaded
  const bucket = () => ({ position: [], normal: [], color: [], skinIndex: [], skinWeight: [], index: [], count: 0, roughness: 0, weight: 0 });
  const out = { metal: bucket(), matte: bucket() };
  for (const piece of loaded) collect(piece, rig, out);
  const meshes = [];
  for (const [kind, data] of Object.entries(out)) {
    if (!data.count) continue;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(data.position), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(data.normal), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(data.color), 3));
    geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(data.skinIndex), 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array(data.skinWeight), 4));
    geometry.setIndex(data.count > 65535 ? new BufferAttribute(new Uint32Array(data.index), 1) : new BufferAttribute(new Uint16Array(data.index), 1));
    const material = new MeshStandardMaterial({ name: `arsenal-${kind}`, vertexColors: true, metalness: kind === 'metal' ? .88 : 0, roughness: clamp(data.roughness / data.weight, .32, .95) });
    const mesh = new SkinnedMesh(geometry, material);
    mesh.name = `arsenal-armor-${kind}`; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    // Same place in the hierarchy and the same bind as the body, so the body's skeleton drives it directly.
    mesh.position.copy(rig.mesh.position); mesh.quaternion.copy(rig.mesh.quaternion); mesh.scale.copy(rig.mesh.scale);
    rig.mesh.parent.add(mesh); mesh.bind(rig.mesh.skeleton, rig.mesh.bindMatrix);
    meshes.push(mesh);
  }
  const worn = loaded.map((piece) => piece.id);
  body.arsenalArmor = worn.join('|');
  return {
    ids: worn, meshes, triangles: (out.metal.index.length + out.matte.index.length) / 3,
    dispose() { for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); } if (body.arsenalArmor === worn.join('|')) body.arsenalArmor = null; },
  };
}
