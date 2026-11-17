// Lightweight 2.5D collision world. Architecture registers static solids and walkable
// platforms; the character controller resolves against them. Terrain comes from shared/terrain.
import { heightAt } from '@shared/terrain.js';

const CELL = 16;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Clip the interval to values of t for which origin + delta*t lies inside a slab.
function clip(interval, origin, delta, min, max) {
  if (Math.abs(delta) < 1e-10) return origin >= min && origin <= max;
  let entry = (min - origin) / delta, exit = (max - origin) / delta;
  if (entry > exit) [entry, exit] = [exit, entry];
  interval[0] = Math.max(interval[0], entry);
  interval[1] = Math.min(interval[1], exit);
  return interval[0] <= interval[1];
}


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

  *_inBounds(minX, minZ, maxX, maxZ) {
    const ix0 = Math.floor(minX / CELL), ix1 = Math.floor(maxX / CELL);
    const iz0 = Math.floor(minZ / CELL), iz1 = Math.floor(maxZ / CELL);
    if (ix0 === ix1 && iz0 === iz1) { yield* this._near(minX, minZ); return; }
    const seen = new Set();
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      for (const shape of this.cells.get(this._key(ix, iz)) ?? []) {
        if (!seen.has(shape)) { seen.add(shape); yield shape; }
      }
    }
  }

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
      let moved = false;
      for (const sh of this._inBounds(pos.x-r, pos.z-r, pos.x+r, pos.z+r)) {
        // a ramp/stair is only as high as its surface under the player (clamped to its footprint),
        // otherwise its high end would wall off the low end and nobody could walk up it
        let top = sh.yMax;
        if (sh.ramp) { const lz = this._local(sh, pos.x, pos.z)[1]; const t = Math.max(0, Math.min(1, (lz + sh.hd) / (2 * sh.hd))); top = sh.ramp.y0 + (sh.ramp.y1 - sh.ramp.y0) * t; }
        if (pos.y + h <= sh.yMin + 1e-6 || pos.y + (sh.walkable ? stepUp : 0) >= top) continue; // above or stepping onto it
        if (sh.type === 'circle') {
          const dx = pos.x - sh.cx, dz = pos.z - sh.cz, d = Math.hypot(dx, dz), m = sh.r + r;
          if (d >= m) continue;
          pos.x = sh.cx + (d > 1e-8 ? dx / d : 1) * m;
          pos.z = sh.cz + (d > 1e-8 ? dz / d : 0) * m;
        } else {
          const [lx, lz] = this._local(sh, pos.x, pos.z);
          const cx = clamp(lx, -sh.hw, sh.hw), cz = clamp(lz, -sh.hd, sh.hd);
          const dx = lx - cx, dz = lz - cz, dist = Math.hypot(dx, dz);
          if (dist >= r) continue;
          let nx = lx, nz = lz;
          if (dist > 1e-8) {
            nx = cx + dx / dist * r;
            nz = cz + dz / dist * r;
          } else if (sh.hw - Math.abs(lx) < sh.hd - Math.abs(lz)) {
            nx = (lx >= 0 ? 1 : -1) * (sh.hw + r);
          } else {
            nz = (lz >= 0 ? 1 : -1) * (sh.hd + r);
          }
          pos.x = sh.cx + nx * sh.c - nz * sh.s;
          pos.z = sh.cz + nx * sh.s + nz * sh.c;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return pos;
  }

  /** Lowest underside crossed by the rising head of a vertical cylinder. */
  ceilingAt(x, z, radius, head, nextHead) {
    let ceiling = Infinity;
    for (const sh of this._inBounds(x-radius, z-radius, x+radius, z+radius)) {
      if (sh.yMin < head - 1e-6 || sh.yMin > nextHead || sh.yMin >= ceiling) continue;
      if (sh.type === 'circle') {
        if (Math.hypot(x-sh.cx, z-sh.cz) >= radius + sh.r) continue;
      } else {
        const [lx, lz] = this._local(sh, x, z);
        const dx = Math.max(0, Math.abs(lx)-sh.hw), dz = Math.max(0, Math.abs(lz)-sh.hd);
        if (dx*dx + dz*dz >= radius*radius) continue;
      }
      ceiling = sh.yMin;
    }
    return ceiling;
  }

  /** First hit along a 3D segment (0 = inside, 1 = clear), including walkable surfaces. */
  segmentHit(ax, ay, az, bx, by, bz, padding = 0, includeWalkable = true) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    let first = 1;
    for (const sh of this._inBounds(Math.min(ax,bx)-padding, Math.min(az,bz)-padding,
                                    Math.max(ax,bx)+padding, Math.max(az,bz)+padding)) {
      if (!includeWalkable && sh.walkable) continue;
      const interval = [0, first];
      if (!clip(interval, ay, dy, sh.yMin - padding, sh.yMax + padding)) continue;
      if (sh.type === 'circle') {
        const x = ax - sh.cx, z = az - sh.cz, radius = sh.r + padding;
        const a = dx*dx + dz*dz, b = x*dx + z*dz, c = x*x + z*z - radius*radius;
        if (a === 0) {
          if (c > 0) continue;
        } else {
          const discriminant = b*b - a*c;
          if (discriminant < 0) continue;
          const root = Math.sqrt(discriminant);
          interval[0] = Math.max(interval[0], (-b-root)/a);
          interval[1] = Math.min(interval[1], (-b+root)/a);
          if (interval[0] > interval[1]) continue;
        }
      } else {
        const [x, z] = this._local(sh, ax, az);
        const vx = dx*sh.c + dz*sh.s, vz = -dx*sh.s + dz*sh.c;
        if (!clip(interval, x, vx, -sh.hw-padding, sh.hw+padding) ||
            !clip(interval, z, vz, -sh.hd-padding, sh.hd+padding)) continue;
        if (sh.ramp) {
          const slope = (sh.ramp.y1 - sh.ramp.y0) / (2 * sh.hd);
          const top = sh.ramp.y0 + (z + sh.hd) * slope;
          if (!clip(interval, ay-top, dy-vz*slope, -Infinity, padding*Math.hypot(1,slope))) continue;
        }
      }
      first = interval[0];
      if (first === 0) break;
    }
    return first;
  }

  /** Line of sight ignores platforms, as before. */
  blocked(ax, az, bx, bz, y) {
    return this.segmentHit(ax, y, az, bx, y, bz, 0, false) < 1;
  }
}
