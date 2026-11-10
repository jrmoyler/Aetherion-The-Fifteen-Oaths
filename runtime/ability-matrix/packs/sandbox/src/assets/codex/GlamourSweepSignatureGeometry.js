import { BufferAttribute, BufferGeometry } from 'three';

/**
 * GlamourSweep — the cast's own signature geometry, kept out of the generated
 * `GlamourSweepGeometry.js` (which is pinned byte for byte by tests/pure-rigs.test.mjs).
 */

/* ------------------------------------------------------------------ */
/* The signature: the glamour blade                                    */
/* ------------------------------------------------------------------ */

const TAU = Math.PI * 2;

/** Half the angle the blade's spine sweeps (radians). */
const ARC = 0.78;

/** Where the blade is widest along its length (0 heel .. 1 tip). */
function widthAt(t) {
  const body = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.72);
  // Heavier in the lower belly, a long fine tip at the top.
  const belly = 1 + 0.35 * Math.exp(-((t - 0.36) ** 2) / 0.03);
  return 0.2 * body * belly;
}

/** Thickness of the spine along the blade, metres per unit height. */
function spineAt(t) {
  return 0.006 + 0.04 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.5);
}

/** A notched back edge: three shallow scallops, the glamour's filigree in silhouette. */
function backAt(t) {
  const notch = Math.max(0, Math.sin(t * Math.PI * 3.0 + 0.4));
  return 0.32 + 0.12 * Math.pow(notch, 6);
}

/**
 * A point on the blade: `t` 0 (heel, bottom) .. 1 (tip, top), `s` 0 (back
 * edge) .. 1 (cutting edge), `side` ±1 (front / back face). The blade stands
 * in the XY plane, one unit tall (y −0.5..0.5); the spine bows to +X so the
 * convex cutting edge leads along +X, and the faces look along ±Z.
 */
function bladePoint(t, s, side, out) {
  const rc = 0.5 / Math.sin(ARC);
  const cx = -rc * Math.cos(ARC);
  const a = -ARC + 2 * ARC * t;
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  const w = widthAt(t);
  const back = backAt(t);
  const across = (s - back) * w * (s < back ? 1 + 0.6 * (back - s) : 1);
  out[0] = cx + rc * nx + nx * across;
  out[1] = rc * ny + ny * across;
  // A lens section: the full spine at the back, a sharp edge at the front.
  out[2] = side * spineAt(t) * Math.pow(1 - s, 0.85);
  return out;
}

/**
 * The glamour blade: a crescent scythe-blade, sharp along its convex edge,
 * with a thick spine, scalloped back and a long fine tip. One unit tall; the
 * ability scales it to `bladeHeight`. `aBlade` = (t along, s across, face):
 * the shader lights the cutting edge and the engraved seams from it.
 */
export function createGlamourBladeGeometry(nt = 72, ns = 10) {
  const positions = [];
  const blade = [];
  const index = [];
  const p = [0, 0, 0];
  let base = 0;
  const grid = (side) => {
    for (let i = 0; i <= nt; i++) {
      const t = i / nt;
      for (let j = 0; j <= ns; j++) {
        const s = j / ns;
        bladePoint(t, s, side, p);
        positions.push(p[0], p[1], p[2]);
        blade.push(t, s, side > 0 ? 1 : 0);
      }
    }
    for (let i = 0; i < nt; i++) {
      for (let j = 0; j < ns; j++) {
        const a = base + i * (ns + 1) + j;
        const b = a + ns + 1;
        if (side > 0) index.push(a, b, a + 1, a + 1, b, b + 1);
        else index.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    base += (nt + 1) * (ns + 1);
  };
  grid(1);
  grid(-1);
  // The spine: a flat strip closing the back edge between the two faces.
  for (let i = 0; i <= nt; i++) {
    const t = i / nt;
    bladePoint(t, 0, 1, p);
    positions.push(p[0], p[1], p[2]);
    blade.push(t, 0, 0.5);
    bladePoint(t, 0, -1, p);
    positions.push(p[0], p[1], p[2]);
    blade.push(t, 0, 0.5);
  }
  for (let i = 0; i < nt; i++) {
    const a = base + i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aBlade', new BufferAttribute(new Float32Array(blade), 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.arc = ARC;
  geometry.userData.turn = TAU;
  return geometry;
}
