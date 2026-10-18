import { CanvasTexture, Sprite, SpriteMaterial, Vector3 } from 'three';
export class Nameplates {
  constructor(ctx) { this.ctx = ctx; this.plates = new Set(); }
  create(actor) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const texture = new CanvasTexture(canvas);
    const sprite = new Sprite(new SpriteMaterial({ map: texture, depthWrite: false, transparent: true }));
    sprite.scale.set(2.6, .49, 1); this.ctx.scene.add(sprite);
    const plate = { actor, canvas, texture, sprite, last: '' }; this.plates.add(plate); return plate;
  }
  remove(p) { if (!p) return; p.sprite.removeFromParent(); p.texture.dispose(); p.sprite.material.dispose(); this.plates.delete(p); }
  setTarget(id) { this.targetId = id; }
  update(dt, camera, player) {
    for (const p of this.plates) {
      const a = p.actor; p.sprite.position.copy(a.position).add(new Vector3(0, a.headY + .2, 0));
      p.sprite.visible = a.visible && a.position.distanceTo(camera.position) < 40;
      const key = `${a.name}:${a.hp}:${this.targetId === a.id}`;
      if (p.last === key) continue; p.last = key;
      const c = p.canvas.getContext('2d'); c.clearRect(0, 0, 512, 96); c.textAlign = 'center'; c.font = '500 30px Georgia'; c.shadowColor = '#000'; c.shadowBlur = 8;
      c.fillStyle = this.targetId === a.id ? '#ffe1a0' : '#f2eee2'; c.fillText(a.name, 256, 36);
      if (a.kind === 'mob') { c.fillStyle = '#24171a'; c.fillRect(115, 56, 282, 6); c.fillStyle = '#c56754'; c.fillRect(115, 56, 282 * Math.max(0, Math.min(1, a.hp / a.mhp)), 6); }
      p.texture.needsUpdate = true;
    }
  }
}
