import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
} from 'three';

/** Dedicated footprints for expansion casts whose actual reach differs from a single arrow. */
export class ExpansionAim {
  constructor() {
    this.object3D = new Group();
    this.object3D.name = 'ExpansionAim';
    this.material = new LineBasicMaterial({
      color: 0xffc8aa,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    });
    const ring = [];
    for (let i = 0; i < 96; i++) {
      const a = (i * Math.PI * 2) / 96;
      ring.push(Math.cos(a), 0, Math.sin(a));
    }
    this.circleGeometry = new BufferGeometry();
    this.circleGeometry.setAttribute(
      'position',
      new Float32BufferAttribute(ring, 3),
    );
    this.circle = new LineLoop(this.circleGeometry, this.material);
    this.lineGeometry = new BufferGeometry();
    this.lineGeometry.setAttribute(
      'position',
      new Float32BufferAttribute(new Float32Array(24 * 3), 3),
    );
    this.lines = new LineSegments(this.lineGeometry, this.material);
    this.object3D.add(this.circle, this.lines);
    this.object3D.renderOrder = 998;
    this.circle.renderOrder = this.lines.renderOrder = 998;
    this.object3D.visible = false;
  }
  /** Config values are live: reticles follow the same dimensions read by the cast. */
  update(style, origin, yaw, distance, config, reveal, valid) {
    this.object3D.visible = reveal > 0.001;
    this.object3D.position.set(origin.x, 0.06, origin.z);
    this.object3D.rotation.y = yaw;
    this.material.opacity = 0.9 * reveal;
    this.material.color.set(valid ? 0xffc8aa : 0xff6a5c);
    this.circle.visible = style === 'self';
    this.lines.visible = style === 'lanes' || style === 'wide';
    if (style === 'self') {
      // This marks a self activation; secondary pulse radius is centered on
      // the later hit, not on the caster.
      this.circle.scale.setScalar(0.8);
      return;
    }
    if (!this.lines.visible) return;
    const positions = this.lineGeometry.attributes.position;
    const lanes = style === 'lanes' ? [-1, 0, 1] : [0];
    const width = Math.max(
      0.01,
      style === 'lanes' ? config.hitWidth : config.width,
    );
    let n = 0;
    const vertex = (x, z) => positions.setXYZ(n++, x, 0, z);
    for (const lane of lanes) {
      // The engine's side vector is direction × up, opposite the local X axis.
      const center = style === 'lanes' ? -lane * config.laneGap : 0;
      const left = center - width,
        right = center + width;
      vertex(left, 0);
      vertex(left, distance);
      vertex(left, distance);
      vertex(right, distance);
      vertex(right, distance);
      vertex(right, 0);
      vertex(right, 0);
      vertex(left, 0);
    }
    positions.needsUpdate = true;
    this.lineGeometry.setDrawRange(0, n);
  }
  dispose() {
    this.circleGeometry.dispose();
    this.lineGeometry.dispose();
    this.material.dispose();
  }
}
