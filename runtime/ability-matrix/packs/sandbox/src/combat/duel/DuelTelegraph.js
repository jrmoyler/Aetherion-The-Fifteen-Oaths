import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry
} from 'three';

import { LAYER } from '../../core/Layers.js';

/**
 * The floor marker the Arch-Wizard shows while it winds a cast up: where it is
 * going to land, for exactly as long as the player has to get out of it.
 *
 * A zone cast draws its footprint (a ring and a faint disc filling in from the
 * middle as the release nears); a line cast draws its lane from the wizard to
 * its reach (a strip filling from the wizard's end). Mechanics draw a ring at
 * their radius. Additive, unlit, on the floor — readable from any camera angle.
 */
export class DuelTelegraph {
  constructor(scene) {
    this.group = new Group();
    this.group.name = 'DuelTelegraph';
    this.group.visible = false;
    this.color = new Color('#ff5a3c');

    const material = (opacity) =>
      new MeshBasicMaterial({ color: this.color, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });

    this.ring = new Mesh(new RingGeometry(0.93, 1, 64), material(0.9));
    this.disc = new Mesh(new CircleGeometry(1, 48), material(0.22));
    this.fill = new Mesh(new CircleGeometry(1, 48), material(0.28));
    this.lane = new Mesh(new PlaneGeometry(1, 1), material(0.2));
    this.laneFill = new Mesh(new PlaneGeometry(1, 1), material(0.35));
    this.edgeL = new Mesh(new PlaneGeometry(1, 1), material(0.9));
    this.edgeR = new Mesh(new PlaneGeometry(1, 1), material(0.9));
    for (const mesh of [this.ring, this.disc, this.fill, this.lane, this.laneFill, this.edgeL, this.edgeR]) {
      mesh.rotation.x = -Math.PI / 2;
      mesh.layers.set(LAYER.WORLD);
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
    }
    this.zone = new Group();
    this.zone.add(this.disc, this.fill, this.ring);
    this.line = new Group();
    this.line.add(this.lane, this.laneFill, this.edgeL, this.edgeR);
    this.group.add(this.zone, this.line);
    scene.add(this.group);
    this.progress = 0;
  }

  /**
   * @param {'line'|'zone'} shape
   * @param {{x: number, z: number}} from the wizard
   * @param {{x: number, z: number, dirX: number, dirZ: number, distance: number}} aim
   * @param {number} radius zone footprint, or half-width of the lane
   */
  show(shape, from, aim, radius) {
    this.group.visible = true;
    this.shape = shape;
    this.zone.visible = shape === 'zone';
    this.line.visible = shape !== 'zone';
    if (shape === 'zone') {
      this.zone.position.set(aim.x, 0.05, aim.z);
      this.zone.scale.setScalar(Math.max(0.6, radius));
    } else {
      const length = Math.max(1, aim.distance);
      const width = Math.max(0.4, radius * 2);
      this.line.position.set(from.x, 0.05, from.z);
      this.line.rotation.y = Math.atan2(aim.dirX, aim.dirZ);
      this.lane.scale.set(width, length, 1);
      this.lane.position.set(0, 0, length / 2);
      for (const [edge, side] of [[this.edgeL, -1], [this.edgeR, 1]]) {
        edge.scale.set(0.07, length, 1);
        edge.position.set((side * width) / 2, 0, length / 2);
      }
      this.length = length;
      this.width = width;
    }
    this.set(0);
  }

  /** @param {number} t 0 → just raised, 1 → released this frame */
  set(t, time = 0) {
    this.progress = t;
    const pulse = 0.75 + 0.25 * Math.sin(time * 18);
    this.ring.material.opacity = 0.9 * pulse;
    this.edgeL.material.opacity = this.edgeR.material.opacity = 0.9 * pulse;
    if (this.shape === 'zone') {
      this.fill.scale.setScalar(Math.max(0.001, t));
    } else if (this.length) {
      const l = Math.max(0.001, t) * this.length;
      this.laneFill.scale.set(this.width, l, 1);
      this.laneFill.position.set(0, 0.002, l / 2);
    }
  }

  hide() {
    this.group.visible = false;
  }

  dispose() {
    this.group.traverse((node) => {
      node.geometry?.dispose();
      node.material?.dispose();
    });
    this.group.parent?.remove(this.group);
  }
}
