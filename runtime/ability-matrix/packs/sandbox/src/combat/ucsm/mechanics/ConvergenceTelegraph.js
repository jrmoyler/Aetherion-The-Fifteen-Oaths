import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  Vector2
} from 'three';
import { convergenceStrikeShapes } from './ConvergenceVariants.js';
import { LAYER } from '../../../core/Layers.js';

/**
 * The aim telegraph of a convergence move, shown while the move is armed.
 *
 * Three readable layers, all exact to gameplay:
 *
 *   - **ingredient radius** (cyan line) — the reaction disc; a live region
 *     must overlap it to be consumed.
 *   - **strike footprints** (gold lines) — the outline of every strike shape
 *     `convergenceStrikeShapes` returns, so a capsule is drawn as a capsule.
 *   - **footprint fill** (faint gold) — the same outlines filled, so the area
 *     that will be hit reads at a glance on a busy floor.
 *
 * Built in local space; the host rotates the group around the cast point to
 * aim it. These are deliberate screen-visible overlays: raised worldshapes
 * must not hide a footprint, including while its origin lies under a ridge,
 * so nothing here depth-tests. Each child owns its geometry and
 * `userData.dispose()` releases every one of them and both materials.
 */
export function createConvergenceTelegraph(p) {
  const root = new Group();
  root.name = 'ConvergenceAim';
  const reactionMat = new LineBasicMaterial({ color: 0x74dce6, transparent: true, opacity: 0.7, depthWrite: false, depthTest: false });
  const strikeMat = new LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
  const fillMat = new MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.12, depthWrite: false, depthTest: false });
  const geometries = [];

  function outline(points, material, role) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(points.flatMap(([x, z]) => [x, 0.075, z]), 3));
    geometries.push(geo);
    const line = new Line(geo, material);
    line.name = role;
    line.renderOrder = 100;
    line.layers.set(LAYER.VFX);
    root.add(line);
  }

  function fill(points) {
    // Shape lives in the XY plane; laying it on the floor maps its y to -z.
    const shape = new Shape(points.map(([x, z]) => new Vector2(x, -z)));
    const geo = new ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0.07, 0);
    geometries.push(geo);
    const mesh = new Mesh(geo, fillMat);
    mesh.name = 'strike-fill';
    mesh.renderOrder = 100;
    mesh.layers.set(LAYER.VFX);
    root.add(mesh);
  }

  function disc(x, z, r) {
    return Array.from({ length: 49 }, (_, i) => {
      const a = (i * Math.PI * 2) / 48;
      return [x + Math.cos(a) * r, z + Math.sin(a) * r];
    });
  }

  function capsule(s) {
    const dx = s.bx - s.ax, dz = s.bz - s.az, length = Math.hypot(dx, dz);
    if (length < 1e-9) return disc(s.ax, s.az, s.r);
    const ux = dx / length, uz = dz / length, px = -uz, pz = ux;
    const point = (x, z, a) => [x + s.r * (ux * Math.cos(a) + px * Math.sin(a)), z + s.r * (uz * Math.cos(a) + pz * Math.sin(a))];
    const points = [point(s.ax, s.az, Math.PI / 2)];
    for (let i = 0; i <= 24; i++) points.push(point(s.bx, s.bz, Math.PI / 2 - (Math.PI * i) / 24));
    for (let i = 0; i <= 24; i++) points.push(point(s.ax, s.az, -Math.PI / 2 - (Math.PI * i) / 24));
    points.push(points[0]);
    return points;
  }

  outline(disc(0, 0, p.radius), reactionMat, 'ingredient-radius');
  const shapes = convergenceStrikeShapes(p, { position: [0, 0, 0], direction: [0, 0, 1] });
  for (const shape of shapes) {
    const points = shape.kind === 'disc' ? disc(shape.x, shape.z, shape.r) : capsule(shape);
    outline(points, strikeMat, 'strike-footprint');
    fill(points.slice(0, -1));
  }
  root.userData.dispose = () => {
    for (const g of geometries) g.dispose();
    reactionMat.dispose();
    strikeMat.dispose();
    fillMat.dispose();
  };
  return root;
}
