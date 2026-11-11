// Code-built hands. The rig has one bone per hand, so a hand is a rigid, posed piece: a palm, four fingers of
// three joints and a thumb. `glove` colours it as a glove; `fingerless` leaves the fingers past the first
// knuckle in skin. The hand that holds the hero's baked weapon is closed into a fist around the grip.
import { Quaternion, Vector3 } from 'three';
import { MAT, V, bar, frame, moved, roundBox } from './kernel.js';

const AXIS_Y = V(0, 1, 0);

/**
 * @param glove       palette name of the glove, or null for bare hands
 * @param fingerless  glove stops at the first knuckle
 * @param skin        palette name of the skin (defaults to the head's skin tone)
 * @param fist        which hands are closed: 'R' (default, the weapon hand), 'L', 'both' or 'none'
 * @param scale       hand size relative to the form
 */
export function hands(c, { glove = null, fingerless = false, skin = 'skin', fist = 'R', scale = 1, knuckles = null }) {
  const { arm, k } = c.form, s = k * scale * .88, seg = arm.seg[1];
  c.bag.part = 'hands';
  for (const side of ['L', 'R']) {
    c.bag.mirror = side === 'R';
    const closed = fist === 'both' || fist === side, weights = [['hand.L', 1]];
    // Hand frame at the wrist: x toward the thumb (forward), y down the hand, z out of the back of the hand.
    const place = frame(arm.points[2], seg.Z, seg.along, seg.X);
    const gloveC = glove ? c.pal(glove) : null, skinC = c.pal(skin), palmC = gloveC ?? skinC, palmM = glove ? MAT.leather : MAT.skin;
    c.bag.solid(moved(roundBox(.039 * s, .044 * s, .012 * s, .01 * s), V(0, .05 * s, 0)), place, weights, palmC, palmM, glove ? .7 : 1);
    if (knuckles && glove) c.bag.solid(moved(roundBox(.036 * s, .012 * s, .004 * s, .003 * s), V(0, .086 * s, .0135 * s)), place, weights, c.pal(knuckles), MAT.leather);
    const curl = closed ? [1.35, 1.75, 1.5] : [.22, .42, .38], lengths = [.042, .026, .021], spread = closed ? 0 : .06;
    for (let i = 0; i < 4; i++) {
      const size = [.95, 1.05, 1, .8][i], x = (.03 - i * .02) * s, radius = (.0082 - i * .0004) * s;
      let at = V(x, .094 * s, -.001 * s), angle = (i === 0 && !closed ? -.08 : 0) + (closed ? 0 : i * .05);
      for (let j = 0; j < 3; j++) {
        angle += curl[j];
        // Each joint bends toward the palm (-z) from the one before it.
        const dir = V(Math.sin((1.5 - i) * spread), Math.cos(angle), -Math.sin(angle)).normalize(), half = lengths[j] * size * s / 2, mid = at.clone().addScaledVector(dir, half);
        const gloved = glove && (!fingerless || j === 0), turn = new Quaternion().setFromUnitVectors(AXIS_Y, dir);
        c.bag.solid(moved(bar(radius * (gloved ? 1.12 : 1) * (1 - j * .1), half * (fingerless && j === 0 && glove ? .8 : .82), 5), mid, turn), place, weights, gloved ? gloveC : skinC, gloved ? MAT.leather : MAT.skin, 1);
        at = at.addScaledVector(dir, half * 2);
      }
    }
    // Thumb: sits forward of the palm, folds across the fingers when the hand is closed.
    let at = V(.036 * s, .03 * s, -.004 * s);
    const thumb = closed ? [V(.5, .7, -.5), V(-.45, .55, -.7)] : [V(.62, .72, -.3), V(.3, .95, -.2)];
    thumb.forEach((d, j) => {
      const dir = d.normalize(), half = [.03, .024][j] * s / 2, gloved = glove && (!fingerless || j === 0);
      c.bag.solid(moved(bar((.0108 - j * .0012) * s * (gloved ? 1.1 : 1), half, 5), at.clone().addScaledVector(dir, half), new Quaternion().setFromUnitVectors(AXIS_Y, dir)), place, weights, gloved ? gloveC : skinC, gloved ? MAT.leather : MAT.skin, 1);
      at = at.addScaledVector(dir, half * 2);
    });
  }
  c.bag.mirror = false;
  void Vector3;
}
