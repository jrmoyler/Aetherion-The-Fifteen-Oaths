// Cloth that gives way to the body in motion.
//
// A costume is one linear-blend-skinned mesh, so a tabard hung from the belt cannot know that a knee is coming
// through it, and a bell sleeve keeps the shape it had in the bind pose when the arm is raised. Two small passes
// in the vertex program, after skinning, fix that for every hero at once:
//
//  1. Clearance. Vertices of hanging cloth (skirts, coats, tabards, tassets and whatever is laid on them) carry
//     the direction that is "outward" for them and how far beyond the legs they hung along it in the bind pose.
//     In any pose they are pushed along that direction until they stand that far beyond the thigh and shin of
//     both legs again (four tapered capsules whose radii are measured from what the legs wear). Layers keep
//     their order because each keeps its own distance along the same line; in the bind pose nothing moves.
//  2. Sleeve hang. Loose cloth standing off the forearm (a sleeve mouth, a cuff flare) carries its stand-off
//     vector. Each frame that vector is turned toward the ground: the top of the mouth draws in toward the arm
//     and the rest hangs below it, whichever way the arm points.
//
// The same arithmetic exists twice on purpose: GLSL for the game, plain JS (settle) for tests and the Node preview.
import { BufferAttribute, Matrix4, Vector3 } from 'three';
import { clamp, smooth } from './kernel.js';

/** How far a vertex may be kept from a leg, however far away it was hanging in the bind pose. */
const CAP = .05, SOFT = .6, DEEPEST = -.09, SNUG = .012;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const LEG = ['thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R'];
const SEGMENTS = [[0, 1, 0], [1, 2, 1], [3, 4, 0], [4, 5, 1]];   // joint a, joint b, index of the first radius

/**
 * Weights for cloth hanging from the hips: the hips carry it at the belt, each thigh takes over its own side
 * further down, and the shin has a say near the hem. The pairs are tagged (`hang`) so the Bag marks the vertex.
 */
export function hangSkin(form) {
  const { trunk, J } = form, yHip = trunk.Y.hip, zc = form.spineZ(yHip);
  return (p) => {
    if (p.y >= yHip) return trunk.skin(p);
    // Weights depend on the direction from the body's axis and the height only, never on how far out the cloth
    // lies: layers worn over each other (under-skirt, coat, tabard) then move as one and cannot cross.
    const side = p.x >= 0 ? 'L' : 'R', drop = smooth(yHip + .03, yHip - .17, p.y) * .84, lower = smooth(J['shin.L'].y + .05, J['shin.L'].y - .25, p.y) * .3;
    const dz = p.z - zc, left = smooth(-.75, .75, p.x / (Math.hypot(p.x, dz) || 1));
    const pairs = [['hips', 1 - drop], ['thigh.L', drop * left * (1 - lower)], ['thigh.R', drop * (1 - left) * (1 - lower)], [`shin.${side}`, drop * lower * smooth(.05, .5, Math.abs(p.x) / (Math.hypot(p.x, dz) || 1))]];
    // Full strength almost at once: the thigh hardly moves this close to its pivot, so the push grows by itself.
    pairs.hang = 1;
    return pairs;
  };
}

const ab = new Vector3(), ap = new Vector3(), q = new Vector3(), out = new Vector3(), sub = new Vector3(), FAR = .3;
/** Distance from p to the tapered capsule a-b (radii ra, rb), measured to its surface. */
function capsuleGap(p, a, b, ra, rb) {
  ab.subVectors(b, a); const h = clamp(ap.subVectors(p, a).dot(ab) / ab.lengthSq(), 0, 1);
  return q.copy(a).addScaledVector(ab, h).distanceTo(p) - (ra + (rb - ra) * h);
}
// Strictly increasing, so layers worn over each other keep their order however far out they hang.
const kept = (d) => Math.max(DEEPEST, d < CAP ? d : CAP + (d - CAP) * SOFT);

/**
 * After a costume is built: measure the legs as dressed, give every hanging vertex its bind-pose clearance and
 * outward direction (`hg`: xyz direction scaled by its weight, w clearance), and give loose sleeve cloth its
 * stand-off vector (`sv`). Returns the per-costume numbers the vertex program needs.
 */
export function finishMotion(bag, form) {
  const { J, leg, arm } = form, n = bag.count, P = bag.position, hang = bag.hang;
  const joints = LEG.map((name) => { const side = name.endsWith('R') ? -1 : 1, j = J[name.replace('.R', '.L')]; return new Vector3(j.x * side, j.y, j.z); });
  const boneOf = (name) => bag.index[name], legBones = new Set(LEG.slice(0, 2).concat(LEG.slice(3, 5)).map(boneOf));
  // What the legs wear: how far leg-skinned geometry (trousers, wraps, boots) stands off the bare form.
  // Three zones: the thigh, the knee (cops and pads stand well off it) and the shin.
  const zones = [[], [], []], p = new Vector3();
  for (let i = 0; i < n; i++) {
    if (hang[i] > 0) continue;
    let best = 0, owner = -1; for (let k = 0; k < 4; k++) if (bag.skinWeight[i * 4 + k] > best) { best = bag.skinWeight[i * 4 + k]; owner = bag.skinIndex[i * 4 + k]; }
    if (!legBones.has(owner) || best < .5) continue;
    p.set(Math.abs(P[i * 3]), P[i * 3 + 1], P[i * 3 + 2]);
    const shin = owner === boneOf('shin.L') || owner === boneOf('shin.R') ? 1 : 0, a = joints[shin], b = joints[shin + 1];
    ab.subVectors(b, a); const h = ap.subVectors(p, a).dot(ab) / ab.lengthSq(), t = shin + h; if (t < .2 || t > 1.85) continue;
    zones[t > .84 && t < 1.2 ? 1 : shin ? 2 : 0].push(q.copy(a).addScaledVector(ab, clamp(h, 0, 1)).distanceTo(p));
  }
  const worn = (list, f, bare, cap) => { if (list.length < 8) return bare + .004; list.sort((x, y) => x - y); return clamp(list[Math.floor(list.length * f)], bare + .002, bare + cap); };
  const radii = [worn(zones[0], .75, leg.radius(.3), .05), worn(zones[1], .9, leg.radius(1), .07), worn(zones[2], .8, leg.radius(1.6), .05)];

  const hg = new Float32Array(n * 4), sv = new Float32Array(n * 3), zc = form.spineZ(form.trunk.Y.hip);
  let hanging = 0, loose = 0;
  for (let i = 0; i < n; i++) {
    p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    if (hang[i] > 0) {
      let dx = p.x, dz = p.z - zc; const len = Math.hypot(dx, dz); if (len < .02) { dx = 0; dz = dz >= 0 ? 1 : -1; } else { dx /= len; dz /= len; }
      // How far beyond each leg it hangs along its own outward direction; the least of these is what it keeps.
      out.set(dx, 0, dz); let beyond = FAR;
      for (const [a, b, r] of SEGMENTS) { const e2 = sub.subVectors(joints[b], joints[a]), h = clamp(ap.subVectors(p, joints[a]).dot(e2) / e2.lengthSq(), 0, 1), R = radii[r] + (radii[r + 1] - radii[r]) * h;
        ap.subVectors(p, q.copy(joints[a]).addScaledVector(e2, h)); const bq = ap.dot(out), side = Math.sqrt(Math.max(0, ap.lengthSq() - bq * bq)); if (side < R + .05) beyond = Math.min(beyond, bq - Math.sqrt(Math.max(0, R * R - side * side))); }
      const gap = beyond;
      hg[i * 4] = dx * hang[i]; hg[i * 4 + 2] = dz * hang[i]; hg[i * 4 + 3] = kept(gap); hanging++;
      continue;
    }
    // Loose sleeve cloth (with its lining and trim), carried mostly by the forearm or hand.
    if (!bag.free[i]) continue;
    const side = p.x >= 0 ? 'L' : 'R'; let w = 0;
    for (let k = 0; k < 4; k++) { const b = bag.skinIndex[i * 4 + k]; if (b === boneOf(`forearm.${side}`) || b === boneOf(`hand.${side}`)) w += bag.skinWeight[i * 4 + k]; }
    if (w < .5) continue;
    const sx = side === 'L' ? 1 : -1; p.x *= sx;
    const a = J['forearm.L'], b = J['hand.L']; ab.subVectors(b, a); const h = clamp(ap.subVectors(p, a).dot(ab) / ab.lengthSq(), -.2, 1.3);
    q.copy(a).addScaledVector(ab, h); const r = q.distanceTo(p), over = r - (arm.radius(1 + clamp(h, 0, 1)) + SNUG) - SNUG;
    if (over <= 0) continue;
    const k = over / r * smooth(.5, .8, w); sv[i * 3] = (p.x - q.x) * k * sx; sv[i * 3 + 1] = (p.y - q.y) * k; sv[i * 3 + 2] = (p.z - q.z) * k; loose++;
  }
  return { hg, sv, hanging, loose, motion: { joints: joints.flatMap((j) => [j.x, j.y, j.z]), bones: LEG.map(boneOf), radii } };
}

export function motionAttributes(geometry, done) {
  geometry.setAttribute('hg', new BufferAttribute(done.hg, 4)); geometry.setAttribute('sv', new BufferAttribute(done.sv, 3));
  geometry.userData.motion = done.motion;
}

// ---------------------------------------------------------------------------------------------------------
// The vertex program

export const MOTION_PARS = /* glsl */`
attribute vec4 hg;
attribute vec3 sv;
uniform vec3 csJoint[6];
uniform float csBone[6];
uniform vec3 csRadii;
`;

/** Runs after <skinning_vertex>: `transformed` is the skinned position in the mesh's own space. */
export const MOTION_VERTEX = /* glsl */`
#ifdef USE_SKINNING
{
  float csHang = length(hg.xyz), csLoose = length(sv);
  if (csHang > .001 || csLoose > .0005) {
    mat4 csSkin = bindMatrixInverse * (skinWeight.x * boneMatX + skinWeight.y * boneMatY + skinWeight.z * boneMatZ + skinWeight.w * boneMatW) * bindMatrix;
    if (csLoose > .0005) {
      vec3 S = (csSkin * vec4(sv, 0.)).xyz, sd = S / max(length(S), 1e-5);
      vec3 down = normalize((vec4(0., -1., 0., 0.) * modelMatrix).xyz);
      float g = smoothstep(-1., .3, dot(sd, down));
      transformed += normalize(sd + down * (1.2 * g)) * (csLoose * mix(.4, 1.15, g)) - S;
    }
    if (csHang > .001) {
      vec3 dir = normalize((csSkin * vec4(hg.xyz, 0.)).xyz), jp[6];
      for (int i = 0; i < 6; i++) jp[i] = (bindMatrixInverse * getBoneMatrix(csBone[i]) * bindMatrix * vec4(csJoint[i], 1.)).xyz;
      float push = 0.;
      for (int s = 0; s < 4; s++) {
        int ia = s < 2 ? s : s + 1; vec3 a = jp[ia], e = jp[ia + 1] - a;
        float ra = (s == 0 || s == 2) ? csRadii.x : csRadii.y, rb = (s == 0 || s == 2) ? csRadii.y : csRadii.z, t = 0.;
        // How far along dir the vertex must go to stand hg.w beyond the capsule. The nearest point on the axis
        // moves as the vertex does, so walk there in three steps. A capsule passing beside the vertex fades out.
        for (int it = 0; it < 3; it++) {
          vec3 p = transformed + dir * t; float h = clamp(dot(p - a, e) / dot(e, e), 0., 1.), R = mix(ra, rb, h);
          vec3 d = transformed - (a + e * h); float bq = dot(d, dir), side = sqrt(max(0., dot(d, d) - bq * bq));
          t = max(0., (-bq + sqrt(max(0., R * R - side * side)) + hg.w) * (1. - smoothstep(R, R + .05, side)));
        }
        push = max(push, t);
      }
      transformed += dir * push * csHang;
    }
  }
}
#endif
`;

export function motionUniforms(motion) {
  return {
    csJoint: { value: motion ? Array.from({ length: 6 }, (_, i) => new Vector3(motion.joints[i * 3], motion.joints[i * 3 + 1], motion.joints[i * 3 + 2])) : Array.from({ length: 6 }, () => new Vector3()) },
    csBone: { value: motion ? motion.bones.slice() : [0, 0, 0, 0, 0, 0] },
    csRadii: { value: motion ? new Vector3(...motion.radii) : new Vector3(.08, .06, .04) },
  };
}

// ---------------------------------------------------------------------------------------------------------
// The same passes in JS, for tests and the software preview.

const rot = new Matrix4(), S = new Vector3(), sd = new Vector3(), nd = new Vector3(), dir = new Vector3(), pp = new Vector3(), e = new Vector3(), d = new Vector3(), c = new Vector3();
/**
 * Settle one skinned vertex. `p` is its skinned position (changed in place), `skin` the blended bone matrix that
 * skinned it (Matrix4, mesh space), `posed` the six leg joints in the pose (Vector3[]), `hg` / `sv` its attributes.
 */
export function settle(p, skin, posed, hg, sv, motion, down = new Vector3(0, -1, 0)) {
  const hang = Math.hypot(hg[0], hg[1], hg[2]), loose = Math.hypot(sv[0], sv[1], sv[2]);
  if (loose > .0005) {
    S.set(sv[0], sv[1], sv[2]).applyMatrix4(rot.copy(skin).setPosition(0, 0, 0));
    sd.copy(S).divideScalar(Math.max(S.length(), 1e-5)); const g = sstep(-1, .3, sd.dot(down)); nd.copy(sd).addScaledVector(down, 1.2 * g).normalize();
    p.addScaledVector(nd, loose * (.4 + .75 * g)).sub(S);
  }
  if (hang > .001) {
    dir.set(hg[0], hg[1], hg[2]).applyMatrix4(rot.copy(skin).setPosition(0, 0, 0)).normalize();
    let push = 0;
    for (const [ia, ib, r] of SEGMENTS) {
      let t = 0;
      for (let it = 0; it < 3; it++) t = Math.max(0, reach(pp.copy(p).addScaledVector(dir, t), p, dir, posed[ia], posed[ib], motion.radii[r], motion.radii[r + 1], hg[3]));
      push = Math.max(push, t);
    }
    p.addScaledVector(dir, push * hang);
  }
  return p;
}

/**
 * How far along dir the point `from` must travel to stand `keep` beyond the capsule a-b, judged at the axis point
 * nearest `at` (where the vertex currently is on its way out). Negative when it is already further out than that.
 * A capsule that passes beside the line of travel fades out over 5 cm instead of switching off.
 */
function reach(at, from, dir, a, b, ra, rb, keep) {
  e.subVectors(b, a); const h = clamp(d.subVectors(at, a).dot(e) / e.lengthSq(), 0, 1), R = ra + (rb - ra) * h;
  d.subVectors(from, c.copy(a).addScaledVector(e, h)); const bq = d.dot(dir), side = Math.sqrt(Math.max(0, d.lengthSq() - bq * bq));
  return (-bq + Math.sqrt(Math.max(0, R * R - side * side)) + keep) * (1 - sstep(R, R + .05, side));
}

/** How deep p sits inside the posed leg capsules (0 when outside), ignoring the clearance it is entitled to. */
export function depthInLegs(p, posed, motion) {
  let deep = 0;
  for (const [ia, ib, r] of SEGMENTS) deep = Math.max(deep, -capsuleGap(p, posed[ia], posed[ib], motion.radii[r], motion.radii[r + 1]));
  return deep;
}
