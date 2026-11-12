// Folds and wrinkles in cloth.
//
// Costume cloth is built smooth. Real cloth is not: it rucks into rings where a joint bends it (elbow, knee,
// armpit, the top of a boot), it is drawn into pleats where a belt cinches it, and it falls in long soft folds
// toward a hem. After a costume is built, every vertex of woven cloth or soft leather is given
//
//   fd = (metres along its limb or up the trunk, direction around that axis as cos / sin, how loose it is)
//   ff = (how strongly it rucks into rings, how strongly it falls into pleats)
//
// and the fragment program turns those into relief (through the same bump path as the weave) and a little
// shading in the valleys. Skin, hair, metal, ceramic, glass and the other hard kinds get zeros and are untouched.
import { BufferAttribute, Vector3 } from 'three';
import { clamp, smooth } from './kernel.js';

const bump = (x, x0, w) => Math.exp(-(((x - x0) / w) ** 2));
const SOFT = new Map([[0, 1], [2, .42]]);   // shader kind -> how readily it folds: woven cloth, leather

export function foldAttributes(bag, form) {
  const { J, arm, leg, trunk } = form, n = bag.count, P = bag.position, fd = new Float32Array(n * 4), ff = new Float32Array(n * 2), Y = trunk.Y;
  const bone = (name) => bag.index[name], group = new Map();
  for (const side of ['L', 'R']) { for (const b of ['upperarm', 'forearm', 'hand']) group.set(bone(`${b}.${side}`), 'arm'); for (const b of ['thigh', 'shin']) group.set(bone(`${b}.${side}`), 'leg'); for (const b of ['foot', 'toe']) group.set(bone(`${b}.${side}`), 'foot'); group.set(bone(`shoulder.${side}`), 'trunk'); }
  for (const b of ['hips', 'spine', 'spine1', 'spine2']) group.set(bone(b), 'trunk');
  const p = new Vector3(), c = new Vector3(), d = new Vector3();
  const onChain = (chain) => {
    // Nearest point on the two-bone chain: metres along it, and the direction around it in the chain's frame.
    let best = Infinity, t = 0;
    for (let s = 0; s < 2; s++) { const a = chain.points[s], b = chain.points[s + 1], ab = d.subVectors(b, a), h = clamp(c.subVectors(p, a).dot(ab) / ab.lengthSq(), s ? 0 : -.3, s ? 1.15 : 1), dist = c.copy(a).addScaledVector(ab, h).distanceTo(p); if (dist < best) { best = dist; t = s + h; } }
    const { X, Z } = chain.frame(clamp(t, 0, 2)), centre = chain.centre(clamp(t, -.2, 2.2)), r = d.subVectors(p, centre), x = r.dot(X), z = r.dot(Z), len = Math.hypot(x, z) || 1;
    return { t, m: chain.metres(t), cos: z / len, sin: x / len, loose: clamp((len - chain.radius(clamp(t, -.2, 2.2)) - .004) / .04, 0, 1.5) };
  };
  let folded = 0;
  for (let i = 0; i < n; i++) {
    const soft = SOFT.get(bag.sm[i * 3 + 2]); if (!soft) continue;
    const share = { arm: 0, leg: 0, trunk: 0, foot: 0 };
    for (let k = 0; k < 4; k++) { const g = group.get(bag.skinIndex[i * 4 + k]); if (g) share[g] += bag.skinWeight[i * 4 + k]; }
    p.set(Math.abs(P[i * 3]), P[i * 3 + 1], P[i * 3 + 2]); const sx = P[i * 3] < 0 ? -1 : 1;
    let along = 0, cos = 1, sin = 0, loose = 0, ring = 0, pleat = 0;
    if (bag.hang[i] > 0) {
      // Hanging cloth: long folds that deepen toward the hem, a few drag lines under the belt.
      const zc = form.spineZ(Y.hip), len = Math.hypot(p.x, p.z - zc) || 1, fall = smooth(Y.hip, Y.hip * .35, p.y);
      along = p.y; cos = (p.z - zc) / len; sin = p.x / len; loose = 1; pleat = .4 + .6 * fall; ring = 0;
    } else if (share.arm >= .5) {
      const q = onChain(arm), elbow = arm.seg[0].length; along = q.m; cos = q.cos; sin = q.sin; loose = q.loose;
      // Rings at the elbow (deepest inside the bend), at the armpit, and where a sleeve is stopped at the wrist.
      ring = .95 * bump(q.m, elbow, .075) * (.75 + .25 * -q.cos) + .5 * bump(q.m, .03, .07) + .45 * bump(q.t, 1.92, .1) * smooth(.15, .6, loose);
      pleat = .1 + .4 * smooth(.2, 1, loose);
    } else if (share.leg >= .5) {
      const q = onChain(leg), knee = leg.seg[0].length; along = q.m; cos = q.cos; sin = q.sin; loose = q.loose;
      // Rings behind and around the knee, drag lines from the crotch, cloth stacked above the boot or the gather.
      ring = .9 * bump(q.m, knee, .09) * (.7 + .3 * -q.cos) + .5 * bump(q.m, .04, .1) + .5 * bump(q.t, 1.75, .16) * smooth(.1, .6, loose);
      pleat = .1 + .5 * smooth(.25, 1.1, loose);
    } else if (share.trunk + share.arm + share.leg >= .5) {
      const y = p.y, zc = form.spineZ(clamp(y, Y.crotch, Y.neck)), len = Math.hypot(p.x, p.z - zc) || 1;
      along = y; cos = (p.z - zc) / len; sin = p.x / len;
      loose = clamp((len - trunk.rho(clamp(y, Y.crotch, Y.neck), Math.atan2(p.x, p.z - zc)) - .004) / .04, 0, 1.5);
      // Pleats drawn into the belt from above and below, cross-wise rucks at the waist and under the arm.
      pleat = .8 * bump(y, Y.belt + .02, .075) + .1 + .3 * smooth(.2, 1, loose);
      ring = .55 * bump(y, Y.waist, .05) * (.4 + .6 * Math.abs(sin)) + .5 * bump(y, Y.armpit, .05) * smooth(.5, .95, Math.abs(sin)) + .3 * bump(y, Y.crotch + .03, .05);
    } else continue;
    fd[i * 4] = along; fd[i * 4 + 1] = cos; fd[i * 4 + 2] = sin * sx; fd[i * 4 + 3] = loose;
    ff[i * 2] = clamp(ring, 0, 1.2) * soft; ff[i * 2 + 1] = clamp(pleat, 0, 1.2) * soft; folded++;
  }
  return { fd, ff, folded };
}

export function setFoldAttributes(geometry, done) {
  geometry.setAttribute('fd', new BufferAttribute(done.fd, 4)); geometry.setAttribute('ff', new BufferAttribute(done.ff, 2));
}

export const FOLD_VERTEX_PARS = /* glsl */`
attribute vec4 fd;
attribute vec2 ff;
varying vec4 vFd;
varying vec2 vFf;
`;
export const FOLD_VERTEX = /* glsl */`vFd = fd; vFf = ff;`;
export const FOLD_FRAGMENT_PARS = /* glsl */`
varying vec4 vFd;
varying vec2 vFf;
`;

/**
 * Adds to csH (relief, in the units the weave uses) and shades diffuseColor. Runs after the per-kind detail, only
 * where the vertex carries fold weights. A ridge function turns sines into rounded folds with narrow valleys.
 */
export const FOLD_FRAGMENT = /* glsl */`
  if (vFf.x + vFf.y > .02) {
    float around = atan(vFd.z, vFd.y), drift = csFbm(vCsP * 7.3 + 4.1), drift2 = csNoise(vCsP * 21.);
    float far = csLod(vCsP, .012);
    // Rings: soft rucks stacked across the limb, wandering and never quite closed.
    float r1 = sin(vFd.x * 74. + drift * 3.4 + sin(around * 2. + drift2 * 1.5) * 1.6);
    float ring = r1 * (.8 + .2 * r1) + sin(vFd.x * 139. - drift * 4.4 + around * 1.7) * .14 * far;
    // Pleats: long rolls down the cloth, their count set by how loose it is, leaning and merging as they wander.
    float count = mix(8., 13., clamp(vFd.w, 0., 1.));
    float p1 = sin(around * count + drift * 3. + vFd.x * 4.5 + sin(vFd.x * 9. + drift2) * .6);
    float pleat = p1 * (.8 + .2 * p1) + sin(around * (count * 1.9 + 1.) - drift * 3.3 - vFd.x * 7.) * .16 * far;
    // Where cloth rucks it does not also hang in pleats.
    float fold = vFf.x * ring + vFf.y * pleat * (1. - .8 * clamp(vFf.x, 0., 1.)) * (.8 + .2 * drift2);
    csH += fold * 10.;
    diffuseColor.rgb *= 1. + clamp(fold, -1., .7) * .2;
    roughnessFactor = clamp(roughnessFactor - min(fold, 0.) * .05, 0., 1.);
  }
`;
