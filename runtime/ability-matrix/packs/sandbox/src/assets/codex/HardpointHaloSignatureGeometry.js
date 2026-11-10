import { BufferAttribute, CylinderGeometry, ExtrudeGeometry, LatheGeometry, Shape, Vector2 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * HardpointHalo — the cast's own signature geometry, kept out of the generated
 * `HardpointHaloGeometry.js` (which is pinned byte for byte by tests/pure-rigs.test.mjs).
 *
 * Two parts of one hardpoint turret, in metres at scale 1, firing along +Z:
 *   pod    — a hex mount plate, a collar and an armoured, sloped turret head
 *            with a sensor slit; the ability stands one per hardpoint.
 *   barrel — twin barrels with muzzle brakes on a trunnion block, pivoting at
 *            the origin, so the ability can recoil and elevate them.
 * `aGlow` marks what may glow (sensor slit, muzzles, plate seam); every other
 * face is dark lit armour.
 */

/** Strip a part down to position + normal and tag how much of it may glow. */
function tag(geometry, glow) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n).fill(glow);
  g.setAttribute('aGlow', new BufferAttribute(a, 1));
  return g;
}

/** Glow per vertex from a function of its position (muzzle rings, slits). */
function tagBy(geometry, fn) {
  const g = tag(geometry, 0);
  const pos = g.getAttribute('position');
  const glow = g.getAttribute('aGlow');
  for (let i = 0; i < pos.count; i++) glow.setX(i, fn(pos.getX(i), pos.getY(i), pos.getZ(i)));
  return g;
}

export function createHardpointPodGeometry() {
  // Hex mount plate, bolted to the floor.
  const plate = new CylinderGeometry(0.62, 0.68, 0.14, 6, 1).translate(0, 0.07, 0);
  const seam = new CylinderGeometry(0.58, 0.58, 0.03, 6, 1).translate(0, 0.155, 0);
  // Collar the head turns on.
  const collar = new CylinderGeometry(0.34, 0.46, 0.34, 8, 1).translate(0, 0.33, 0);
  // Armoured head: a side profile (z forward, y up) extruded across X.
  const profile = new Shape();
  const pts = [
    [-0.5, 0.48], [0.34, 0.48], [0.56, 0.64], [0.48, 0.9], [0.12, 1.04], [-0.38, 1.02], [-0.56, 0.82]
  ];
  profile.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) profile.lineTo(pts[i][0], pts[i][1]);
  profile.closePath();
  const depth = 0.8;
  const head = new ExtrudeGeometry(profile, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 1,
    steps: 1
  });
  head.rotateY(-Math.PI / 2).translate(depth / 2, 0, 0);
  // Side armour cheeks and a dorsal fin give it a mechanical silhouette.
  const cheekL = new CylinderGeometry(0.2, 0.24, 0.5, 6, 1).rotateX(Math.PI / 2).translate(-0.5, 0.7, -0.05);
  const cheekR = cheekL.clone().translate(1, 0, 0);
  const fin = new CylinderGeometry(0.04, 0.12, 0.3, 4, 1).scale(1, 1, 3).translate(0, 1.16, -0.2);
  // The sensor slit across the sloped front.
  const slit = new CylinderGeometry(0.035, 0.035, 0.62, 6, 1).rotateZ(Math.PI / 2).translate(0, 0.86, 0.47);
  const parts = [
    tag(plate, 0),
    tag(seam, 0.6),
    tag(collar, 0),
    tag(head, 0),
    tag(cheekL, 0),
    tag(cheekR, 0),
    tag(fin, 0),
    tag(slit, 1)
  ];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/** One barrel along +Z: sleeve, tube, muzzle brake with a bore lip. */
function barrel(x) {
  const prof = [
    [0, 0], [0.13, 0], [0.13, 0.28], [0.085, 0.32], [0.075, 1.12], [0.12, 1.14], [0.12, 1.34], [0.06, 1.34], [0.05, 1.2], [0, 1.2]
  ].map(([r, y]) => new Vector2(r, y));
  const lathe = new LatheGeometry(prof, 10);
  lathe.rotateX(Math.PI / 2).translate(x, 0, 0);
  // The muzzle (last 0.22 m) and the bore are what heat up and flash.
  return tagBy(lathe, (_x, _y, z) => Math.max(0, Math.min(1, (z - 1.1) / 0.2)));
}

export function createHardpointBarrelGeometry() {
  const block = tag(new CylinderGeometry(0.2, 0.2, 0.56, 8, 1).rotateZ(Math.PI / 2), 0);
  const parts = [block, barrel(-0.15), barrel(0.15)];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}
