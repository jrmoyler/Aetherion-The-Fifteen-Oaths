# Ability Matrix integration contract

## Active game and preserved sandbox are separate integrations

The active Babylon game exposes **150 selectable castables**, ten per Oath, through `shared/abilities.generated.js`. Its inputs are the original 100-entry registry plus `shared/ability-supplement.json` (50 additional catalog entries and complete presets, pinned to `c16da3c978a4815f46273fdcda2252ab48977a53`). On 2026-10-18 all 150 source catalog entries matched the latest upstream catalog exactly; zero IDs were missing. Counts were already 150 before this upgrade.

This is a gameplay adaptation: Babylon uses authoritative slot costs, line/zone/self/summon resolution and its own VFX. It does not claim to execute every upstream shader, special mechanic or model. The unchanged Three.js sandbox described below remains the original **100-castable** snapshot. Its adapter and the Linear fissure repair remain intact. The additional 50 presets do not expand that isolated sandbox runtime.

Run `npm run mmo:abilities` after changing the source data, and `node tools/generate-mmo-abilities.mjs --check` to detect stale generated output. Generation rejects duplicate IDs, unknown elements, invalid numeric tuning, mismatched preset identity and unpinned revisions. Generated entries retain their source commit, original aim shape and original minimum range for traceability; source minimum range is metadata, not an additional gameplay constraint.

## Preserved sandbox boundary

The source at `runtime/ability-matrix` is the complete original program, not a data-only approximation. Run `npm run dev:abilities` to boot the runnable [Aetherion wrapper](app/abilities/README.md). It installs the Linear repair at the real App runtime-loading seam, exposes `window.matrix` and `window.aetherionAbilities`, and offers all 100 castables. `npm run build:abilities` creates `dist/abilities`; `npm run preview:abilities` serves that build. The original sandbox also remains separately runnable for comparison. Create an adapter by importing `createAbilityMatrixAdapter` from `src/abilities/AbilityMatrixAdapter.js` and passing `{ bridge: sandboxWindow.matrix, catalog: originalCatalog }`. `originalCatalog` is the JSON at `runtime/ability-matrix/presets/catalog.json`.

Adapter methods: `list({ element?, kind? })`, `describe(uid)`, asynchronous `cast(uid, options)`, `select(uid)`, `preset(uid)`, `applyPreset(uid, preset)`, `resetPreset(uid)`, and `clear()`. The adapter owns a defensive catalog copy, rejects unknown IDs and cross-identity preset application, and uses the original bridge for all behavior.

Before selecting/casting a Linear ability, the adapter loads the source pack and idempotently attaches the source `FissureSystem` through [LinearFissuresIntegration.js](src/abilities/LinearFissuresIntegration.js). The upstream sandbox omitted that dependency, crashing Meteor at impact; the standalone Linear app supplies it. Update, clear and dispose follow the original decals → fissures → bursts order. No source files are edited. The adapter requires `bridge.loadPack` for this repair.

`cast('linear/ice')` forwards unchanged to `bridge.cast`; `cast('handcast/drone')` uses the source's summon deploy/recall path; `cast('linear-ext/boost')` forwards to `bridge.runAction('linear-ext', 'boost')`. Buffs are toggles, not aimed slots; `select` explicitly rejects them. A successful bridge return does not establish a damage event, a fully rendered frame, or even that a buff changed state: source `runAction` also reports a nonempty `Not ready` toast as true. This ambiguity is preserved and documented.

The original bridge's `list()` reports native plus already-loaded slot abilities and omits buffs. Aetherion enumerates the static verified catalog to include all 100 without preloading all engines. Source frame clocks, pools, particle/decal/burst systems, shader uniforms, dummy reactions, FBX/GLB rigs, target logic, and cast settings remain source-owned.

## Real subsystems versus proposed game contracts

| Concern | Existing source implementation | Aetherion integration status |
|---|---|---|
| Ability selection/aim/cast | `packs/sandbox/src/core/App.js`, `input/AimController.js`, native and vendored `AbilityManager.js` | Imported unchanged; routing tested |
| VFX | Procedural geometry, custom GLSL materials, particles, decals, bursts, distortion, light pools | Imported; CPU construction/lifecycle evidence separate from GPU review |
| Dummy combat | `combat/DummyField.js`, per-ability own-hit code, vendored ragdolls | Local sandbox behavior; no production damage/stat model assumed |
| Animation | `SandboxCharacter.js`, source cast clips, gait layering, model-specific rig builders | Original dependencies retained; visual review pending |
| Buffs/summons | Vendored runtime actions, deploy/recall state, input steering/fire | Source semantics retained; interactive verification is separate |
| Audio | No implemented source audio service or audio assets identified | Proposed event/audio interface only |
| Stats/resources | Source per-ability settings and local cooldown maps | Production character stats, energy budgets and economy costs proposed |
| Networking | Local window bridge and cross-window commands, not a game server | Authoritative multiplayer and replication proposed |
| Environment/crafting/progression | No persistent world, crafting transaction, allegiance or progression implementation | Canon proposals, never advertised as migrated functionality |

The game's proposed production boundaries keep gameplay resolution, VFX presentation, audio cues, animation requests, stats/resources, and network replication distinct. Existing source does not implement that full separation. Do not invent an existing `DamageService`, `WorldState`, `AudioService` or authoritative server API. See the canon implementation contracts for proposed interfaces and approval state.

## Embedding and security

Prefer running the source sandbox as its own Vite app with its original public root. Keep `models/`, `hdri/`, and `textures/` relative to that app. Moving assets to a CDN requires a separately tested asset URL adapter; no such relocation is part of this migration. Same-origin integration can pass the already-initialized bridge directly. The original bridge installs permissive postMessage listeners and emits with `'*'`; it is not an authenticated cross-origin command boundary. Production cross-origin embedding must add origin/source validation, an explicit command allowlist, lifetime cancellation, and resource budgets before exposure. These hardening needs are recorded, not silently patched into the preserved snapshot.

The source bridge is asynchronous and reads a shared active slot. Callers must serialize cast/selection operations; concurrent requests may race at the source boundary. The adapter does not claim reentrancy or network determinism. Pause, invalid IDs, clear/dispose, preset reset, buffs, summons and repeated casts are independent QA cases.

## Full-game design

All fifteen Oaths map to their exact source element IDs in `CASTABLE_REGISTRY.json`. [Elemental interactions](ELEMENTAL_INTERACTION_MATRIX.md), world consequences, life skills and progression are proposed layers around those castables, never permission to change original source balance to match lore. Narrative allegiance and active loadout are distinct; imported abilities do not imply that every Oath can be equipped concurrently.

## Required next execution gate

Use a WebGL2-capable environment to run each UID through its actual source route, record cast and lifecycle, inspect shader compile logs, real target reactions, every required model/texture/animation URL, end-state cleanup, repeat/overlap, pause/resume, summon steering/recall, buff toggle/cooldown, preset edit/reset, input interruptions and framerate/memory. Attach measured results to each record; do not promote all 100 based on one representative spell or a passing bundle build.
