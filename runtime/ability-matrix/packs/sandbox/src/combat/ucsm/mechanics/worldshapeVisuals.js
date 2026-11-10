import { Group, Mesh } from 'three';
import { LAYER } from '../../../core/Layers.js';
import { WORLDSHAPE_TERRAINS } from './WorldshapeLook.js';
import { attachWorldshapeFx, createWorldshapeShockMaterial } from './WorldshapeShaders.js';
import { createWorldshapeGround } from './WorldshapeHeroGeometry.js';

/**
 * worldshapeVisuals — the solid rigs of the five authored terrains, their
 * deterministic animation, and the damage-pulse cue.
 *
 * The solids are the readable gameplay: every ridge, spire and pylon stands
 * on a collision centre the `WorldshapeManager` actually uses, and every
 * vertex stays inside the advertised field radius. The glacier's ramp is the
 * very cone the height query samples, so feet meet visible ice. The shader
 * layers that sit on top (field lines, ground treatment, veil, motes, spray,
 * shimmer) are added by `WorldshapeHeroGeometry#addWorldshapeHero`.
 *
 * Animation is a pure function of combat age, tagged per node as
 * `userData.worldshapeMotion` and driven by `animateWorldshape`; reduced
 * motion holds the authored first pose.
 *
 * The pulse cue (0.35 s) is a ring plus element debris, and now a shader
 * shockwave that bursts from the centre to the rim and fades on its own cue
 * age, so the pulse reads as an event rather than a flashing decal. The
 * engine half of the same beat — camera shake, screen flash, a light punch
 * and the terrain's ground mark, on arrival and on every pulse — is
 * `WorldshapeBeats#worldshapeBeat`, played by the host that owns `app`.
 */
const TAU = Math.PI * 2;

/** Tag a node for `animateWorldshape`, recording its authored rest pose. */
function motion(node, type, phase = 0, extra = {}) {
  node.userData.worldshapeMotion = { type, phase, baseY: node.position.y, baseScale: node.scale.y, ...extra };
  return node;
}

/** Render the same collision centres used by the worldshape simulation. */
export function buildWorldshapeVariant(v, g, data, spec) {
  if (!spec?.style) return false;
  const { style, radius } = spec;
  const at = (name, mat, x, y, z, sx, sy, sz) => v.mesh(name, mat, g, x, y, z, sx, sy, sz);
  // Ring geometry has a 0.045 tube around its unit radius.
  const ring = (mat, size, y) => v.ring(g, mat, Math.min(size, radius / 1.045), y);
  const centers = data.ridges.map((r) => [r.x - data.position[0], r.z - data.position[2], r.r]);
  if (style === 'scorched') {
    at('terrainFloor', 'terrainFire', 0, 0.03, 0, radius * 0.97, 1, radius * 0.97);
    ring('fire', radius * 0.96, 0.06);
    ring('iron', radius * 0.76, 0.04);
    for (const [x, z, r] of centers) {
      at('ridge', 'rock', x, 0.8, z, r * 0.8, 0.67, r * 0.8);
      motion(at('shard', 'terrainFire', x, 1.15, z, r * 0.35, 0.7, r * 0.35), 'flame', x + z);
    }
    for (let i = 0; i < 18; i++) {
      const a = i * TAU / 18, d = radius * (0.35 + (i % 3) * 0.2);
      const crack = at('box', i % 3 ? 'fire' : 'bronze', Math.sin(a) * d, 0.04, Math.cos(a) * d, 0.06, 0.035, 0.9);
      crack.rotation.y = a + 0.4;
    }
    for (let i = 0; i < 14; i++) {
      const a = i * TAU / 14, d = radius * (0.24 + (i % 4) * 0.15);
      motion(at('shard', 'fire', Math.sin(a) * d, 0.3 + (i % 3) * 0.17, Math.cos(a) * d, 0.055, 0.13, 0.055), 'ember', i * 0.53);
    }
  } else if (style === 'glacier') {
    // Match the cone used by the worldshape height query, so feet meet visible ice.
    const ramp = v.geo.ramp.parameters;
    const surface = at('ramp', 'terrainIce', 0, spec.height / 2, 0,
      radius / ramp.radius, spec.height / ramp.height, radius / ramp.radius);
    surface.name = 'glacier-surface';
    ring('ice', radius * 0.98, 0.09);
    ring('steel', radius * 0.65, 0.12);
    for (const [x, z, r] of centers) {
      motion(at('shard', 'terrainIce', x, 1.05, z, r, 1.25, r), 'crystal', x + z);
      for (let k = 0; k < 4; k++) {
        const a = k * TAU / 4;
        const shard = at('shard', 'ice', x + Math.sin(a) * r * 0.45, 0.45, z + Math.cos(a) * r * 0.45, 0.18, 0.65, 0.18);
        shard.rotation.z = Math.sin(a) * 0.35;
        shard.rotation.x = Math.cos(a) * 0.35;
      }
    }
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8, bar = at('box', 'ice', Math.sin(a) * 1.5, 0.08, Math.cos(a) * 1.5, 0.06, 0.05, 2.2);
      bar.rotation.y = a;
    }
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12, d = radius * 0.76;
      motion(at('shard', 'ice', Math.sin(a) * d, 0.25, Math.cos(a) * d, 0.06, 0.13, 0.06), 'glint', i * 0.7);
    }
  } else if (style === 'stormground') {
    at('terrainFloor', 'terrainStorm', 0, 0.03, 0, radius * 0.97, 1, radius * 0.97);
    ring('storm', radius * 0.95, 0.07);
    for (const [x, z, r] of centers) {
      at('base', 'iron', x, 0.1, z, r, 0.7, r);
      at('shaft', 'steel', x, 1.1, z, 0.7, 2, 0.7);
      motion(at('shard', 'terrainStorm', x, 2.2, z, 0.22, 0.65, 0.22), 'arc', x + z);
      for (let k = 0; k < 3; k++) ring('storm', 0.3 + k * 0.17, 0.2 + k * 0.15).position.set(x, 0.2 + k * 0.15, z);
    }
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12, bolt = at('box', 'storm', Math.sin(a) * 2.1, 0.07, Math.cos(a) * 2.1, 0.08, 0.05, 2.3);
      bolt.rotation.y = a;
    }
    for (let i = 0; i < 16; i++) {
      const a = i * TAU / 16, d = radius * (i % 2 ? 0.42 : 0.68);
      const spark = at('shard', 'storm', Math.sin(a) * d, 0.16, Math.cos(a) * d, 0.06, 0.24, 0.06);
      spark.rotation.z = a;
      motion(spark, 'arc', i * 0.57);
    }
  } else if (style === 'floodplain') {
    at('terrainFloor', 'terrainWater', 0, 0.03, 0, radius * 0.98, 1, radius * 0.98);
    for (let i = 0; i < 5; i++) ring(i % 2 ? 'steel' : 'water', radius * (0.25 + i * 0.17), 0.06 + i * 0.015);
    for (let i = 0; i < 20; i++) {
      const a = i * TAU / 20, d = radius * (0.35 + (i % 4) * 0.15);
      const wave = at('shard', 'water', Math.sin(a) * d, 0.14 + (i % 2) * 0.1, Math.cos(a) * d, 0.12, 0.07, 0.45);
      wave.rotation.y = a + Math.PI / 2;
    }
    // Pairs of chevrons flow in the actual force direction; their lanes stay inside the disc.
    const [dx, , dz] = data.direction;
    for (let lane = -2; lane <= 2; lane++) for (let i = 0; i < 3; i++) {
      const side = lane * 0.65, span = Math.sqrt(Math.max(0, (radius - 0.45) ** 2 - side * side));
      const marker = new Group();
      marker.rotation.y = Math.atan2(dx, dz);
      g.add(marker);
      for (const sign of [-1, 1]) {
        const arm = v.mesh('box', 'water', marker, sign * 0.16, 0.15, 0, 0.055, 0.035, 0.48);
        arm.rotation.y = sign * 0.72;
      }
      const along = -span + (i + 0.5) * span * 2 / 3;
      marker.position.set(dx * along + dz * side, 0, dz * along - dx * side);
      motion(marker, 'current', (i + 0.5) / 3, { dx, dz, side, span });
    }
  } else if (style === 'glass') {
    at('terrainFloor', 'terrainGlass', 0, 0.03, 0, radius * 0.97, 1, radius * 0.97);
    ring('ice', radius * 0.96, 0.08);
    ring('gold', radius * 0.74, 0.06);
    for (const [x, z, r] of centers) {
      motion(at('shard', 'terrainGlass', x, 1.2, z, r * 0.8, 1.6, r * 0.8), 'crystal', x - z);
      for (let k = 0; k < 3; k++) {
        const a = k * TAU / 3;
        const shard = at('shard', 'storm', x + Math.sin(a) * r * 0.45, 0.65, z + Math.cos(a) * r * 0.45, 0.18, 0.9, 0.18);
        shard.rotation.z = Math.sin(a) * 0.3;
        shard.rotation.x = Math.cos(a) * 0.3;
      }
      ring('steel', r * 0.8, 0.12).position.set(x, 0.12, z);
    }
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12, d = radius * 0.78;
      motion(at('shard', 'terrainGlass', Math.sin(a) * d, 0.22, Math.cos(a) * d, 0.07, 0.16, 0.07), 'glint', i * 0.8);
    }
  }
  return true;
}

/** Animation is a pure function of combat time; reduced motion holds the authored first pose. */
export function animateWorldshape(root, age, reducedMotion) {
  if (reducedMotion) return;
  root.traverse((node) => {
    const m = node.userData.worldshapeMotion;
    if (!m) return;
    if (m.type === 'current') {
      const u = ((m.phase + age * 0.14) % 1 + 1) % 1;
      const along = (u * 2 - 1) * m.span;
      node.position.x = m.dx * along + m.dz * m.side;
      node.position.z = m.dz * along - m.dx * m.side;
    } else if (m.type === 'ember') node.position.y = m.baseY + 0.35 * ((age * 0.7 + m.phase) % 1);
    else if (m.type === 'flame') node.scale.y = m.baseScale * (0.82 + 0.18 * Math.sin(age * 9 + m.phase));
    else if (m.type === 'arc') node.scale.y = m.baseScale * (0.35 + 0.65 * Math.abs(Math.sin(age * 13 + m.phase)));
    else if (m.type === 'glint') node.scale.y = m.baseScale * (0.65 + 0.35 * Math.sin(age * 4 + m.phase));
    else if (m.type === 'crystal') node.scale.y = m.baseScale * (0.97 + 0.03 * Math.sin(age * 2 + m.phase));
  });
}

/** Style → terrain slug, for pulse rings of the authored variants. */
const STYLE_SLUG = {
  scorched: 'the-scorched-kingdom',
  glacier: 'glaciers-dominion',
  stormground: 'stormground',
  floodplain: 'the-living-floodplain',
  glass: 'the-glass-labyrinth'
};

/** Shader shockwave for one pulse, on the pooled ground disc. */
function pulseShock(v, g, data, spec, r) {
  const slug = STYLE_SLUG[spec?.style] ?? 'continental-uprising';
  const geoKey = 'worldshapeGround:geometry';
  if (!v.geo[geoKey]) {
    v.geo[geoKey] = createWorldshapeGround();
    v.resources.push(v.geo[geoKey]);
  }
  const matKey = `worldshapePulse:${slug}`;
  if (!v.mat[matKey]) {
    const m = createWorldshapeShockMaterial(slug, v.terrainTime, spec?.height ?? data?.height ?? 0);
    m.name = matKey;
    v.mat[matKey] = m;
    v.resources.push(m);
  }
  const ring = new Mesh(v.geo[geoKey], v.mat[matKey]);
  ring.name = `worldshape-pulse:${slug}`;
  ring.scale.set(r, 1, r);
  ring.castShadow = false;
  ring.receiveShadow = false;
  ring.layers.set(LAYER.VFX);
  g.add(ring);
  attachWorldshapeFx(ring, v, { kind: 'shock', terrain: WORLDSHAPE_TERRAINS[slug], life: 0.35 });
  return ring;
}

/** One damage pulse: an element-shaped ring of debris plus the shockwave. */
export function buildWorldshapePulse(v, g, data, spec) {
  const r = spec?.radius ?? 4;
  const style = spec?.style;
  const material = { scorched: 'fire', glacier: 'ice', stormground: 'storm', floodplain: 'water', glass: 'terrainGlass' }[style] ?? 'gold';
  v.ring(g, material, r * 0.9, 0.14);
  if (style === 'floodplain') {
    // Water pulses as concentric swells rather than debris.
    v.ring(g, material, r * 0.6, 0.12);
    v.ring(g, material, r * 0.3, 0.1);
  } else {
    const count = style === 'stormground' ? 12 : 10;
    for (let i = 0; i < count; i++) {
      const a = (i * TAU) / count, d = r * (style === 'scorched' ? 0.6 : 0.78);
      const n = v.mesh(style === 'stormground' ? 'box' : 'shard', material, g,
        Math.sin(a) * d, 0.24, Math.cos(a) * d,
        style === 'glass' ? 0.18 : 0.09, style === 'scorched' ? 0.5 : 0.3, 0.09);
      n.rotation.z = a;
    }
  }
  pulseShock(v, g, data, spec, r);
}
