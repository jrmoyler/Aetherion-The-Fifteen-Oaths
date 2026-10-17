// Lightweight 2.5D collision world. Architecture registers static solids and walkable
// platforms; the character controller resolves against them. Terrain comes from shared/terrain.
import { heightAt } from '@shared/terrain.js';

const CELL = 16;

export class CollisionWorld {
  constructor() {
    this.cells = new Map();
    this.count = 0;
  }

  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }

  _insert(shape) {
    const x0 = Math.floor((shape.minX) / CELL), x1 = Math.floor((shape.maxX) / CELL);
    const z0 = Math.floor((shape.minZ) / CELL), z1 = Math.floor((shape.maxZ) / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = this._key(ix, iz);
      let c = this.cells.get(k); if (!c) this.cells.set(k, (c = []));
      c.push(shape);
    }
    this.count++;
    return shape;
  }

  /**
   * Oriented box solid. (cx,cz) centre, hw/hd half extents, rot = yaw radians,
   * yMin/yMax vertical span. If walkable, its top (yMax) can be stood on.
   */
  addBox(cx, cz, hw, hd, rot, yMin, yMax, opts = {}) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const ex = Math.abs(c * hw) + Math.abs(s * hd), ez = Math.abs(s * hw) + Math.abs(c * hd);
    return this._insert({ type: 'box', cx, cz, hw, hd, c, s, yMin, yMax, walkable: !!opts.walkable, tag: opts.tag,
      minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez });
  }

  addCircle(cx, cz, r, yMin, yMax, opts = {}) {
    return this._insert({ type: 'circle', cx, cz, r, yMin, yMax, walkable: !!opts.walkable, tag: opts.tag,
      minX: cx - r, maxX: cx + r, minZ: cz - r, maxZ: cz + r });
  }

  /** Walkable ramp/stair: box footprint whose height goes y0 -> y1 along local +Z (depth). */
  addRamp(cx, cz, hw, hd, rot, y0, y1, opts = {}) {
    const b = this.addBox(cx, cz, hw, hd, rot, Math.min(y0, y1) - 2, Math.max(y0, y1), { ...opts, walkable: true });
    b.ramp = { y0, y1 };
    return b;
  }

  _near(x, z) { return this.cells.get(this._key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []; }

  _local(sh, x, z) { const dx = x - sh.cx, dz = z - sh.cz; return [dx * sh.c + dz * sh.s, -dx * sh.s + dz * sh.c]; }

  _topAt(sh, x, z) {
    if (sh.type === 'circle') return Math.hypot(x - sh.cx, z - sh.cz) <= sh.r ? sh.yMax : null;
    const [lx, lz] = this._local(sh, x, z);
    if (Math.abs(lx) > sh.hw || Math.abs(lz) > sh.hd) return null;
    if (sh.ramp) return sh.ramp.y0 + (sh.ramp.y1 - sh.ramp.y0) * ((lz + sh.hd) / (2 * sh.hd));
    return sh.yMax;
  }

  /** Highest walkable surface at (x,z) not above yHint + stepUp. */
  groundAt(x, z, yHint = Infinity, stepUp = 0.6) {
    let g = heightAt(x, z);
    for (const sh of this._near(x, z)) {
      if (!sh.walkable) continue;
      const top = this._topAt(sh, x, z);
      if (top !== null && top > g && top <= yHint + stepUp) g = top;
    }
    return g;
  }

  /** Push a vertical cylinder (radius r, feet y, height h) out of solids. Mutates pos {x,y,z}. */
  resolve(pos, r = 0.45, h = 1.8, stepUp = 0.6) {
    for (let iter = 0; iter < 2; iter++) {
      for (const sh of this._near(pos.x, pos.z)) {
        if (pos.y + h < sh.yMin || pos.y + stepUp >= sh.yMax) continue; // above or stepping onto it
        if (sh.type === 'circle') {
          const dx = pos.x - sh.cx, dz = pos.z - sh.cz, d = Math.hypot(dx, dz), m = sh.r + r;
          if (d < m && d > 1e-6) { pos.x = sh.cx + (dx / d) * m; pos.z = sh.cz + (dz / d) * m; }
        } else {
          const [lx, lz] = this._local(sh, pos.x, pos.z);
          const px = sh.hw + r - Math.abs(lx), pz = sh.hd + r - Math.abs(lz);
          if (px > 0 && pz > 0) {
            let nx = lx, nz = lz;
            if (px < pz) nx = Math.sign(lx) * (sh.hw + r); else nz = Math.sign(lz) * (sh.hd + r);
            pos.x = sh.cx + nx * sh.c - nz * sh.s;
            pos.z = sh.cz + nx * sh.s + nz * sh.c;
          }
        }
      }
    }
    return pos;
  }

  /** True if segment a->b (at height y) is blocked by a solid. Used for line of sight. */
  blocked(ax, az, bx, bz, y) {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
    for (let i = 1; i < steps; i++) {
      const x = ax + (bx - ax) * (i / steps), z = az + (bz - az) * (i / steps);
      for (const sh of this._near(x, z)) {
        if (sh.walkable || y < sh.yMin || y > sh.yMax) continue;
        if (sh.type === 'circle' ? Math.hypot(x - sh.cx, z - sh.cz) < sh.r : (() => { const [lx, lz] = this._local(sh, x, z); return Math.abs(lx) < sh.hw && Math.abs(lz) < sh.hd; })()) return true;
      }
    }
    return false;
  }
}
