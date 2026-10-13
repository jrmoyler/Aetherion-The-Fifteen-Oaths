# Ten new procedural abilities

These additions are implemented independently of the five upstream repositories. Their original spell definitions, assets, controls, and runtimes are not replaced by these presets.

## The additions

| Preset ID | Distinct mechanic | Visual construction and phases | Gameplay hooks |
| --- | --- | --- | --- |
| `chain-relay` | Successive multi-target chaining | Three-axis source electrode; camera-facing hot-core/halo lightning ribbons; branching forks; individual relay coronas; timed whole-network overload | Per-relay damage, conductive status |
| `temporal-rewind` | Recorded path and reverse traversal | Curved locomotion record; seven humanoid pose echoes; physical brass hourglass; moving clock hands; forward and reversed particles | Temporal anchor, recorded echo, rewind teleport with sampled path |
| `blink-corridor` | Paired transport and reconstruction | Two independently articulated 12-blade irises; custom spiral aperture shaders; body dissolution; 96 instanced transport fragments; exit reconstruction | Phase interval, teleport, exit knockback |
| `restorative-sanctuary` | Repeated area healing | Twelve curved, shader-veined lotus petals unfold; emissive stamens grow; healing symbols and waves rise through the sanctuary; flower dissolves | Four healing pulses |
| `magnetic-minefield` | Deployment, arming, cascade | Seven machines arrive on separate ballistic trajectories; shells open; magnetic tether network engages; ordered explosions break the lattice | Arm statuses, localized damage, inward force per mine |
| `mirror-decoys` | Illusion formation and swaps | Three articulated refractive humanoids; orbiting mirror panels; formation-swapping curves; 216 instanced shatter pieces | Decoy lifetimes, two swap teleports, disorientation |
| `ricochet-chakram` | Multi-bank projectile and homing return | Ten extruded metal teeth; spinning luminous hub; actual segmented bank path; per-hit ground sigils; separate curved return flight | Individual bounce damage, recovered-projectile status |
| `kinetic-parry` | Catch, absorb, reflect | Seven beveled shield plates; Fresnel lattice shell; visible incoming projectile; impact compression and plate expansion; counter-bolt with widening crescents | Parry window, reflection status, counter damage and knockback |
| `stasis-bubble` | Momentum capture and release | Latitude/longitude cage; capture sweep; suspended faceted projectiles; orbiting clock markers; released ballistic fragments | Time-dilated status, release impulse |
| `prismatic-splitshot` | Refraction into independent trajectories | Charged input lance; physical rotating prism with luminous edges; three curved colored paths; separately timed impact structures | Three individual damage events |

The original sources already include stationary portal gates, singularities, autonomous summons, elemental walls, and celestial barrages. The additions above focus on absent gameplay relationships rather than renaming those existing effects. Shared rings and particles provide secondary details; each addition has its own main geometry, animation, and event sequence.

## Import and run

Copy the `presets` directory into a Three.js project, install the same Three.js version as the host, and import `presets/runtime.js`. The new runtime uses only ESM `three`; no image, audio, font, model, CDN, DOM, or network resource is required. The app currently pins Three.js 0.185.1. Browser rendering requires WebGL2. Creating and stepping the runtime without a renderer also works for server-side simulation tests.

```js
import * as THREE from 'three';
import { NEW_PRESETS, createPresetRuntime } from './presets/runtime.js';

const abilities = createPresetRuntime({
  scene,
  camera,                    // optional; improves camera-facing trail ribbons
  renderer,                  // optional; reserved for host integration
  maxEffects: 12,
  onEvent(event) {
    if (event.type === 'damage') game.applyAreaDamage(event);
    if (event.type === 'heal') game.applyAreaHealing(event);
    if (event.type === 'status') game.applyStatus(event);
    if (event.type === 'knockback') game.applyImpulse(event);
    if (event.type === 'teleport') player.position.fromArray(event.position);
  }
});

const cast = abilities.cast('chain-relay', {
  origin: new THREE.Vector3(0, 0, 4),
  target: new THREE.Vector3(0, 0, -3),
  targets: enemies.map(enemy => enemy.position),
  radius: 3,
  power: 1,
  duration: 3.2,
  seed: 17,
  color: '#82e9ff'
});

// In the host's render loop. Pausing means not advancing the effect clock.
abilities.update(paused ? 0 : deltaSeconds);
renderer.render(scene, camera);

// Optional cancellation of one instance:
cast.dispose();
// Cancel all active effects, but allow later casts:
abilities.clear();
// On scene teardown:
abilities.dispose();
```

Use a lit scene: the new effects deliberately combine metallic/physical meshes with emissive shaders. Hemisphere and directional lighting make the shapes readable; bloom is optional. No tone mapping, camera, lights, or renderer setting is changed by the runtime. The standalone visual fixture demonstrates one suitable setup.

## Parameters and results

`NEW_PRESETS` is a frozen array. Each entry contains `id`, `name`, `category`, `description`, `tags`, CSS `color`, and `defaults` with `radius`, `power`, `duration`, and `seed`.

`cast(id, options)` returns `{ id, instanceId, duration, dispose() }`. Positions can be `THREE.Vector3`, `{ x, y, z }`, or three-number arrays. Inputs are copied; caller-owned vectors are never mutated. Positions use the host scene's coordinates and Y-up orientation. Place the origin/target at feet/floor height; effect factories add their own hand/head offsets.

- `origin`: defaults to `[0, 0, 4]`
- `target`: defaults to `[0, 0, -3]`
- `targets`: optional positions used by chaining, banking, and refraction; other effects use their own area geometry. At most 12 targets are retained. Chaining and banking use at most five; order is supplied by the host, not a nearest-neighbor query.
- `radius`: clamped to 0.5–8 scene units
- `power`: clamped to 0.1–4; scales hook amounts
- `duration`: clamped to 1.5–15 seconds; proportionally scales the sequence and scheduled times
- `seed`: deterministic unsigned 32-bit seed
- `color`: base color; secondary warm/cool accents remain artistically defined

Changes apply to the next cast. To change an active effect, cancel and recast with the same seed and advance to the desired time. The matrix app's sliders do not rewrite the original repository controls.

`update(dt)` accepts finite nonnegative seconds and advances only that clock. `update(0)` performs no mutation and emits no events. A large step still emits every overdue hook exactly once in chronological order. Negative or nonfinite deltas throw. Large steps do not replay intermediate rendered frames. Absolute-time animation plus seeded construction makes repeated casts reproducible without history buffers or wall-clock timers.

## Hook contract and integration limits

Every hook is a plain object with:

```js
{
  type: 'damage',             // or heal, status, knockback, teleport
  abilityId: 'chain-relay',
  instanceId: 'cast-1',
  time: 0.608,                // exact scheduled seconds since this cast
  position: [0, 1.1, -3],    // center, in host scene coordinates
  radius: 0.85,              // host hit-query radius
  amount: 22,                // for damage/heal/impulse; game-defined units
  targetIndex: 0             // optional index in this ability's target sequence
}
```

Additional fields:

- `status`, `duration`: status name and lifetime in seconds
- `direction`: normalized impulse/travel direction where defined
- `from`, `to`: blink/rewind endpoints
- `path`: Chrono Recall's sampled trajectory
- `mechanic`, `stacks`: optional effect-specific context

Lifecycle events are `cast` (with duration), `complete`, and `cancel` (with reason `capacity`, `manual`, `clear`, or `dispose`). Hook errors are isolated so they cannot strand VFX resources; inspect `stats.eventErrors` to detect a host callback failure.

The runtime supplies visuals and semantic event hooks. It does not own an enemy registry, health model, networking, rigid-body physics, navmesh, collision detection, or actual projectile interception. Apply damage/healing/status/impulses in the host and validate its own gameplay constraints. Mine detonations and incoming parry projectiles are deliberately deterministic demonstrations of those mechanics; they are not live proximity or projectile-collision queries. Stasis marks a host status rather than pausing arbitrary scene objects. Teleport hooks include intended movement destinations; a production game should validate those locations against its navigation/collision model.

## Bounds and cleanup

The default cap is 12 simultaneous instances, configurable to 1–32. A new cast at capacity cancels the oldest active cast before allocating the new one. Each effect uses bounded point clouds, ribbon buffers, and instanced fragments. At the default target count the largest effect has 410 point particles; additional mesh fragments are also fixed-size. Nothing grows with elapsed time.

Each cast owns its complete Three.js subtree. Completion/cancellation disposes each unique geometry, material, and owned texture once and removes the subtree. `clear()` retains an empty runtime root; `dispose()` also removes that root and prevents further casts. Shared geometries/materials within a cast are deduplicated during disposal. No resource from the supplied scene/camera/renderer is disposed.

`runtime.stats` returns a read-only snapshot: `active`/`activeEffects`, `capacity`, `totalCasts`, `totalEvents`, `eventErrors`, `objects`, `geometries`, `materials`, `particles`, `elapsed`, and `disposed`. Mesh fragment instances are not included in the point-particle count.

## Verification

- `node --test tests/new-presets.test.mjs`: metadata, all ten lifecycles, finite geometry and transforms, deterministic seeds, true pause, skipped-frame events, exact event order/payloads, capacity/cancellation, callback isolation, disposal, coincident endpoints, and tuning limits.
- `node --test tests/atlas-bridge.test.mjs`: matrix commands, preset validation, auto-cast, pause, cancellation, and repeatable host casts.
- `node --test tests/atlas-integration.test.mjs`: exactly ten additions, consistent per-ability and aggregate presets, and unchanged legacy catalog entries.
- `npm run build:atlas`: production module bundling for the isolated Atlas host.

Node scene tests and production bundling do not substitute for GPU compilation or visual review. WebGL2 rendering has not been verified in this environment: its available cloud browser has graphics rendering disabled.

The standalone host is `packs/atlas/index.html`; run it with `npm run dev:atlas`.
It uses a lit arena and three health-bearing targets to demonstrate event-driven teleport, knockback, healing and damage. Host integration is isolated from all six existing packs.
