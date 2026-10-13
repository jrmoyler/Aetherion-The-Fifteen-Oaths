# Castable migration report

## Decision and provenance

Aetherion was inspected before Ability-Matrix. GitHub returned `This repository is empty`, and `git ls-remote` returned no refs. There was no destination commit, canon, implementation, or asset baseline. No castables had already been imported, so this is a first import, not a duplicate migration.

Source: [jrmoyler/Ability-Matrix at 4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451](https://github.com/jrmoyler/Ability-Matrix/tree/4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451), evidence ID `SRC-ABILITY-MATRIX-4c4a1eb`.

Exactly **100 live castables** were found: **95 abilities, 3 buffs, and 2 summons** across **15 elements** and nine runtime groups. Eleven character moves and seven archived effects are preserved separately and excluded from the 100. No castable was invented to satisfy the total.

The complete tracked snapshot is copied to [runtime/ability-matrix](runtime/ability-matrix/): **1,896 files, 331,989,108 bytes**, including **197 binary/image assets**, build definitions, lockfiles, source license notices, source tests, portable prototypes, archives, pack-only features, and shared infrastructure. The snapshot remains byte-identical; source-relative asset paths are unchanged. Identical source files and shared models legitimately exist at several paths because original independently runnable packs are preserved. This is not a second registry of extra castables.

## Preservation and integration

- [CASTABLE_SOURCE_MANIFEST.json](CASTABLE_SOURCE_MANIFEST.json) records every path, byte count, and SHA-256. The source repository was read only; no source branch, commit, push, or remote mutation was made.
- [CASTABLE_REGISTRY.json](CASTABLE_REGISTRY.json) preserves each source catalog record and complete preset in `sourceCatalog` and `sourcePreset`. Original UIDs, IDs, names, element IDs, kinds, cast shapes, settings and schema are unchanged. `proposedAetherion` is deliberately separate.
- [AbilityMatrixAdapter.js](src/abilities/AbilityMatrixAdapter.js) enumerates the complete source catalog, delegates ordinary casts and summons to the original sandbox bridge, and routes the three buffs to the original non-slot `runAction` API. It returns source results unchanged and does not manufacture damage, resource costs, cooldown rules, or successful activation.
- The Aetherion adapter additionally restores the original Linear `FissureSystem` omitted by the upstream hosted runtime. It uses the original implementation and standalone lifecycle order; a failing baseline and repaired Meteor integration regression are retained outside the unchanged snapshot. The original sandbox remains an executable Three.js implementation. Its five vendored engines remain intact alongside 56 native sandbox abilities. Three.js use here does not decide Aetherion's full-game engine.
- Oath mapping follows the user's fifteen named forces. The stable `oath-01` through `oath-15` strings are proposed technical IDs, not new names or lore.

## Validation and limits

See [CASTABLE_VALIDATION_REPORT.md](CASTABLE_VALIDATION_REPORT.md) for measured results and per-castable coverage. Byte integrity, schema preservation, UID uniqueness, all fifteen elements, source implementation/dependency paths, binary headers, and adapter dispatch are separate from rendering and gameplay tests.

**The migration is not a claim that all 100 are production-validated.** Complete visual/GPU behavior, target-hit semantics, character animation, interactive summon control, and full-game integration need their own gates. The cloud browser's current WebGL2 diagnostic explicitly reports that it is disabled or unavailable. No browser security flags were changed. New ecology, crafting, progression, multiplayer, and world-persistence mechanics are design proposals.

Source MIT license files and READMEs are retained verbatim. Their presence does not establish all third-party model, texture, Mixamo animation, or MediaPipe asset rights. Production redistribution/commercial rights require the asset-rights review described in the canon asset registry; no legal agreement was signed or assumed on the user's behalf.

## Branch and delivery boundary

The implementation is prepared on `foundation/aetherion-canon-castable-migration`. The initially empty destination needs a minimal base commit before GitHub can compare a feature-branch draft PR. No implementation belongs on the bootstrap default branch. Publication and exact remote commit/PR verification are recorded by the final handoff; this document alone does not assert that publication succeeded. No merge or deployment is authorized.

## Reproduction

From repository root, run `npm test` for Aetherion integrity/routing checks and `npm run test:source` for inherited source tests. For fresh dependencies, use `npm ci --prefix runtime/ability-matrix` and `npm ci --prefix runtime/ability-matrix/packs/sandbox`. Source lockfiles are authoritative. Use `npm run dev:abilities` to run the Aetherion wrapper around the original sandbox, with the source-faithful repair installed. `npm run build:abilities` creates `dist/abilities`; `npm run preview:abilities` serves it. All 24 original sandbox public assets are copied byte-identically by this build.

Do not run the source's `tools/extract-presets.mjs` during integrity verification: it regenerates source metadata timestamps. `tools/generate-migration.py` is a maintainer-only evidence generator requiring a clean checkout at the pinned SHA; it reads that source and writes destination evidence. Future source revisions require explicit migration review and a new manifest rather than silently replacing this pin.

## Later upstream observation

While this migration was in progress, read-only `ls-remote` observed upstream main at `4f2d06278c07eb07ea42bb4e60d6606c068924c2`. The local source checkout remains clean at the original discovery pin, `4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451`. This import does not silently absorb that later revision, and no mutation to Ability-Matrix was made by this migration. See [upstream observation](validation/upstream-observation.json). A future update must compare and review revisions explicitly.

A bounded read-only comparison of those exact commits confirmed **four changed files across two later commits**: root README, root package build script, site-staging script and new Vercel configuration. No castable implementation, catalog, preset, original asset or dependency version changed. The actual changes invoke site staging from the production build and mirror staged output to `dist`; the model/HDR staging rename behavior already existed at the pinned revision. This conclusion comes from the [complete file comparison](https://github.com/jrmoyler/Ability-Matrix/compare/4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451...4f2d06278c07eb07ea42bb4e60d6606c068924c2), not the commit title. The destination wrapper has its own tested build path and does not import or execute these later deployment changes.
