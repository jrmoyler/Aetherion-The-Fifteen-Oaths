// Creature roster shared by the simulation (stats/AI), the client (model + tint) and the
// creature forge (Blender archetypes). Model resolution on the client:
//   /assets/creatures/<archetype>-<oath>.glb  ->  /assets/creatures/<archetype>.glb  ->  procedural fallback
// Archetype GLB contract: Y-up metres, faces +Z, origin at ground; clips idle, walk, run, attack, hit, death (+ roar);
// materials named body / secondary / accent / glow so the client can tint with `tint` (hex per slot).

export const ARCHETYPES = {
  hound: { label: 'quadruped canine', height: 1.1, speed: 7.5, gait: 'quadruped' },
  boar: { label: 'heavy tusked quadruped', height: 1.3, speed: 6.2, gait: 'quadruped' },
  stag: { label: 'antlered grazer', height: 2.1, speed: 7.8, gait: 'quadruped' },
  raptor: { label: 'bipedal raptor', height: 1.9, speed: 8.0, gait: 'biped' },
  drake: { label: 'winged reptile', height: 2.6, speed: 6.5, gait: 'quadruped', flies: true },
  golem: { label: 'heavy stone/metal humanoid', height: 3.2, speed: 4.2, gait: 'biped' },
  wraith: { label: 'floating cloaked spirit', height: 2.4, speed: 5.4, gait: 'hover' },
  spider: { label: 'eight-legged skitterer', height: 1.2, speed: 7.0, gait: 'multi' },
  serpent: { label: 'coiling serpent', height: 1.4, speed: 5.8, gait: 'slither' },
  construct: { label: 'mechanical walker', height: 2.4, speed: 5.0, gait: 'biped' },
  treant: { label: 'root-and-bark behemoth', height: 3.6, speed: 3.8, gait: 'biped' },
  wisp: { label: 'floating elemental core', height: 1.6, speed: 6.0, gait: 'hover' },
};

const M = (id, name, archetype, oath, role, tint, extra = {}) => ({ id, name, archetype, oath, role, tint, ...extra });
// role: 'common' | 'veteran' | 'elite' | 'boss'
export const CREATURES = [
  M('ember-hound', 'Ember Hound', 'hound', 'oath-01', 'common', { body: '#2a2422', accent: '#9a4a2c', glow: '#ff6a1a' }),
  M('slag-golem', 'Slag Golem', 'golem', 'oath-01', 'veteran', { body: '#3a3634', accent: '#6b3a24', glow: '#ff6a1a' }),
  M('cinder-drake', 'Cinder Drake', 'drake', 'oath-01', 'elite', { body: '#2c1f1a', accent: '#9a4a2c', glow: '#ff7a2a' }),
  M('furnace-wyrm-vahl', 'Furnace Wyrm Vahl', 'drake', 'oath-01', 'boss', { body: '#1c1a19', accent: '#b05a30', glow: '#ff8a3a' }, { scale: 2.4 }),

  M('rime-wolf', 'Rime Wolf', 'hound', 'oath-02', 'common', { body: '#d8dde2', accent: '#4a5058', glow: '#8fdcff' }),
  M('archive-wraith', 'Archive Wraith', 'wraith', 'oath-02', 'veteran', { body: '#2b2e33', accent: '#c9d3da', glow: '#8fdcff' }),
  M('frost-golem', 'Frost Golem', 'golem', 'oath-02', 'elite', { body: '#9fb8c8', accent: '#4a5058', glow: '#bfe8ff' }),
  M('glacier-librarian', 'The Glacier Librarian', 'golem', 'oath-02', 'boss', { body: '#c8d8e4', accent: '#2b2e33', glow: '#8fdcff' }, { scale: 2.0 }),

  M('static-raptor', 'Static Raptor', 'raptor', 'oath-03', 'common', { body: '#2a3348', accent: '#b8743a', glow: '#b4a2ff' }),
  M('relay-construct', 'Relay Construct', 'construct', 'oath-03', 'veteran', { body: '#3c4048', accent: '#c58a4a', glow: '#b4a2ff' }),
  M('storm-wisp', 'Storm Wisp', 'wisp', 'oath-03', 'elite', { body: '#1e2a44', accent: '#c58a4a', glow: '#c8b8ff' }),
  M('thunderhead-colossus', 'Thunderhead Colossus', 'golem', 'oath-03', 'boss', { body: '#2c3240', accent: '#c58a4a', glow: '#c8b8ff' }, { scale: 2.2 }),

  M('reef-serpent', 'Reef Serpent', 'serpent', 'oath-04', 'common', { body: '#1d3352', accent: '#4fb6c9', glow: '#58d4ff' }),
  M('tideshell-skitterer', 'Tideshell Skitterer', 'spider', 'oath-04', 'veteran', { body: '#e9e1d2', accent: '#1d3352', glow: '#58d4ff' }),
  M('drowned-wraith', 'Drowned Wraith', 'wraith', 'oath-04', 'elite', { body: '#1a2a3a', accent: '#4fb6c9', glow: '#58d4ff' }),
  M('abyssal-maw', 'The Abyssal Maw', 'serpent', 'oath-04', 'boss', { body: '#14243a', accent: '#e9e1d2', glow: '#58d4ff' }, { scale: 2.6 }),

  M('shale-boar', 'Shale Boar', 'boar', 'oath-05', 'common', { body: '#4a4440', accent: '#c8a77a', glow: '#b07cff' }),
  M('canyon-raptor', 'Canyon Raptor', 'raptor', 'oath-05', 'veteran', { body: '#a58a68', accent: '#4a4440', glow: '#b07cff' }),
  M('amethyst-golem', 'Amethyst Golem', 'golem', 'oath-05', 'elite', { body: '#6e5a44', accent: '#9a5cd6', glow: '#b07cff' }),
  M('geode-titan', 'Geode Titan', 'golem', 'oath-05', 'boss', { body: '#4a4440', accent: '#9a5cd6', glow: '#c89cff' }, { scale: 2.3 }),

  M('reed-stag', 'Reed Stag', 'stag', 'oath-06', 'common', { body: '#c8b49a', accent: '#8a6a4a', glow: '#e8f2ff' }),
  M('echo-wisp', 'Echo Wisp', 'wisp', 'oath-06', 'veteran', { body: '#e6dccb', accent: '#c8402a', glow: '#e8f2ff' }),
  M('cliff-drake', 'Cliff Drake', 'drake', 'oath-06', 'elite', { body: '#9a8a74', accent: '#c8402a', glow: '#e8f2ff' }),
  M('hollow-chorus', 'The Hollow Chorus', 'wraith', 'oath-06', 'boss', { body: '#e6dccb', accent: '#c8402a', glow: '#ffffff' }, { scale: 2.0 }),

  M('thornback-boar', 'Thornback Boar', 'boar', 'oath-07', 'common', { body: '#4a3a28', accent: '#5f7a3a', glow: '#ffc04a' }),
  M('moss-stag', 'Moss Stag', 'stag', 'oath-07', 'veteran', { body: '#5a4a30', accent: '#5f7a3a', glow: '#ffc04a' }),
  M('root-treant', 'Root Treant', 'treant', 'oath-07', 'elite', { body: '#4a3a28', accent: '#5f7a3a', glow: '#ffc04a' }),
  M('elder-graft-behemoth', 'Elder Graft Behemoth', 'treant', 'oath-07', 'boss', { body: '#3a2e20', accent: '#6f8a3a', glow: '#ffd060' }, { scale: 1.8 }),

  M('vat-spider', 'Vat Spider', 'spider', 'oath-08', 'common', { body: '#1e1c1a', accent: '#8a7440', glow: '#c4ff3a' }),
  M('bile-serpent', 'Bile Serpent', 'serpent', 'oath-08', 'veteran', { body: '#2a2a20', accent: '#8a7440', glow: '#c4ff3a' }),
  M('reagent-construct', 'Reagent Construct', 'construct', 'oath-08', 'elite', { body: '#4a4a40', accent: '#9a8048', glow: '#c4ff3a' }),
  M('mother-of-vials', 'Mother of Vials', 'spider', 'oath-08', 'boss', { body: '#1e1c1a', accent: '#9a8048', glow: '#d4ff4a' }, { scale: 2.6 }),

  M('gilded-stag', 'Gilded Stag', 'stag', 'oath-09', 'common', { body: '#e8e2d6', accent: '#c8a050', glow: '#fff0b0' }),
  M('lumen-wisp', 'Lumen Wisp', 'wisp', 'oath-09', 'veteran', { body: '#ece4d2', accent: '#c8a050', glow: '#fff0b0' }),
  M('dawn-construct', 'Dawn Construct', 'construct', 'oath-09', 'elite', { body: '#e8e2d6', accent: '#c8a050', glow: '#fff0b0' }),
  M('seraph-last-light', 'Seraph of the Last Light', 'wraith', 'oath-09', 'boss', { body: '#f4eee0', accent: '#d8b060', glow: '#fff6c8' }, { scale: 2.0 }),

  M('void-hound', 'Void Hound', 'hound', 'oath-10', 'common', { body: '#1c1f3a', accent: '#a8acb8', glow: '#9a7aff' }),
  M('star-wisp', 'Star Wisp', 'wisp', 'oath-10', 'veteran', { body: '#1c1f3a', accent: '#a8acb8', glow: '#9a7aff' }),
  M('orbit-golem', 'Orbit Golem', 'golem', 'oath-10', 'elite', { body: '#4a4c58', accent: '#8a5ad8', glow: '#9a7aff' }),
  M('gravemass', 'Gravemass', 'golem', 'oath-10', 'boss', { body: '#2c2c30', accent: '#8a5ad8', glow: '#b09aff' }, { scale: 2.4 }),

  M('shade-hound', 'Shade Hound', 'hound', 'oath-11', 'common', { body: '#121214', accent: '#2e2e32', glow: '#a070ff' }),
  M('court-wraith', 'Court Wraith', 'wraith', 'oath-11', 'veteran', { body: '#121214', accent: '#a8a8b0', glow: '#a070ff' }),
  M('faceless-sentinel', 'Faceless Sentinel', 'golem', 'oath-11', 'elite', { body: '#2e2e32', accent: '#8a2a30', glow: '#a070ff' }),
  M('absent-magistrate', 'The Absent Magistrate', 'wraith', 'oath-11', 'boss', { body: '#0c0c0e', accent: '#8a2a30', glow: '#b080ff' }, { scale: 2.2 }),

  M('blood-hound', 'Blood Hound', 'hound', 'oath-12', 'common', { body: '#4a1418', accent: '#5a5048', glow: '#ff2a3a' }),
  M('thorn-serpent', 'Thorn Serpent', 'serpent', 'oath-12', 'veteran', { body: '#6a1e24', accent: '#5a5048', glow: '#ff2a3a' }),
  M('covenant-drake', 'Covenant Drake', 'drake', 'oath-12', 'elite', { body: '#4a1418', accent: '#c8a060', glow: '#ff3a4a' }),
  M('crimson-rite', 'The Crimson Rite', 'drake', 'oath-12', 'boss', { body: '#3a0e12', accent: '#c8a060', glow: '#ff4a5a' }, { scale: 2.4 }),

  M('mirror-spider', 'Mirror Spider', 'spider', 'oath-13', 'common', { body: '#3a2a3e', accent: '#e8e0d4', glow: '#e070ff' }),
  M('masked-wraith', 'Masked Wraith', 'wraith', 'oath-13', 'veteran', { body: '#3a2a3e', accent: '#c8a050', glow: '#e070ff' }),
  M('folded-construct', 'Folded Construct', 'construct', 'oath-13', 'elite', { body: '#e0d8cc', accent: '#2a3450', glow: '#e070ff' }),
  M('the-unfolded', 'The Unfolded', 'construct', 'oath-13', 'boss', { body: '#e8e0d4', accent: '#3a2a3e', glow: '#f080ff' }, { scale: 2.3 }),

  M('clockwork-raptor', 'Clockwork Raptor', 'raptor', 'oath-14', 'common', { body: '#1e3a40', accent: '#a8844a', glow: '#ffd88a' }),
  M('pendulum-construct', 'Pendulum Construct', 'construct', 'oath-14', 'veteran', { body: '#8a8478', accent: '#b8904a', glow: '#ffd88a' }),
  M('hourglass-golem', 'Hourglass Golem', 'golem', 'oath-14', 'elite', { body: '#1e3a40', accent: '#b8904a', glow: '#ffd88a' }),
  M('escapement-engine', 'The Escapement Engine', 'construct', 'oath-14', 'boss', { body: '#1e3a40', accent: '#b8904a', glow: '#ffe0a0' }, { scale: 2.5 }),

  M('rail-hound', 'Rail Hound', 'hound', 'oath-15', 'common', { body: '#3a3c40', accent: '#f07a20', glow: '#ffa040' }),
  M('impulse-drone', 'Impulse Drone', 'wisp', 'oath-15', 'veteran', { body: '#24262a', accent: '#f07a20', glow: '#ffa040' }),
  M('gantry-construct', 'Gantry Construct', 'construct', 'oath-15', 'elite', { body: '#3a3c40', accent: '#f07a20', glow: '#ffa040' }),
  M('bulwark-prime', 'Bulwark Prime', 'golem', 'oath-15', 'boss', { body: '#3a3c40', accent: '#f07a20', glow: '#ffb050' }, { scale: 2.3 }),
];

export const CREATURE_BY_ID = Object.fromEntries(CREATURES.map((c) => [c.id, c]));

/** Stat template by role (scaled by level in the simulation). */
export const ROLE_STATS = {
  common: { hpMul: 1, dmgMul: 1, xpMul: 1, aggro: 14 },
  veteran: { hpMul: 1.6, dmgMul: 1.25, xpMul: 1.8, aggro: 16 },
  elite: { hpMul: 3.5, dmgMul: 1.6, xpMul: 4, aggro: 18 },
  boss: { hpMul: 18, dmgMul: 2.4, xpMul: 30, aggro: 24 },
};

/** NPC roles placed at sanctuary npcSpots. */
export const NPC_ROLES = ['oathkeeper', 'quartermaster', 'trainer', 'warden', 'chronicler', 'artisan'];
