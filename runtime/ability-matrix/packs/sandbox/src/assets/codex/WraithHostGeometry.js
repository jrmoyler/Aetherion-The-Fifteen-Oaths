import { BufferAttribute, BufferGeometry } from 'three';

/**
 * Wraith Host — the hooded shade, built procedurally.
 *
 * A lathe-style shell, `around` × `rings` vertices: a rounded hood at the top
 * with its front pushed in to make the hollow a face would be in, a narrow
 * neck, shoulders, and a cloak that flares toward a hem. Nothing is ragged
 * here — the tatters, the billow, the trail behind it and the dissolve are all
 * done in the vertex and fragment stages from `aCloak`, so they stay live.
 *
 * Local frame: +Y up (the head), +Z the way it faces, the figure's middle at
 * the origin, 1.7 m tall. `aCloak.x` is the bearing round the body in -1..1
 * (0 = straight ahead), `aCloak.y` runs 0 at the crown to 1 at the hem.
 */
export function createWraithGeometry(around = 24, rings = 30) {
  const cols = around + 1; // a seam column so the bearing can wrap cleanly
  const count = cols * (rings + 1);
  const position = new Float32Array(count * 3);
  const cloak = new Float32Array(count * 2);
  const index = [];

  const TOP = 0.62;
  const HEIGHT = 1.7;

  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const y = TOP - v * HEIGHT;
    const r = profile(v);
    for (let i = 0; i <= around; i++) {
      const s = i / around; // 0..1 round the body
      const th = (s - 0.5) * Math.PI * 2; // 0 at the front
      let rr = r;
      let z0 = 0;
      // The hood: swept back to a soft point, and hollowed at the front.
      if (v < 0.2) {
        z0 = -0.07 * (1 - v / 0.2);
        const front = Math.max(0, Math.cos(th));
        const hollow = smooth(0.03, 0.08, v) * (1 - smooth(0.14, 0.19, v));
        rr *= 1 - 0.55 * hollow * Math.pow(front, 3);
      }
      const k = (j * cols + i) * 3;
      position[k] = Math.sin(th) * rr;
      position[k + 1] = y;
      position[k + 2] = Math.cos(th) * rr + z0;
      const q = (j * cols + i) * 2;
      cloak[q] = (s - 0.5) * 2;
      cloak[q + 1] = v;
    }
  }

  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < around; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('aCloak', new BufferAttribute(cloak, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  // The bounding sphere has to cover the trail the vertex stage adds.
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 2;
  return geometry;
}

/** Radius of the shell at height fraction `v`: hood, neck, shoulders, flare. */
function profile(v) {
  if (v < 0.15) return 0.17 * Math.sqrt(Math.sin((v / 0.15) * Math.PI * 0.5)) + 0.004;
  if (v < 0.2) return lerp(0.17, 0.14, (v - 0.15) / 0.05);
  if (v < 0.32) return lerp(0.14, 0.3, smooth(0.2, 0.32, v));
  return lerp(0.3, 0.44, Math.pow((v - 0.32) / 0.68, 1.3));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
