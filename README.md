# Aetherion: The Fifteen Oaths

**Every force has a covenant. Every covenant has a price.**

A source-preserving ability foundation and a coherent, proposed game-production canon for one interconnected continent and exactly fifteen Oaths. The founder-established premises, recovered artwork, existing source behavior and new design proposals have separate evidence and approval states.

This repository is a reviewable foundation. It does not claim that the continent-scale game, multiplayer authority, finished realm assets or production economy are implemented.

## Start here

1. [Executive canon overview](AETHERION_CANON/00_GOVERNANCE/EXECUTIVE_CANON_OVERVIEW.md): established premise, evidence and decisions.
2. [Complete navigation](CANON_INDEX.md): all 28 requested artifact families, all fifteen dossiers and every production directory.
3. [World bible](AETHERION_CANON/01_WORLD_BIBLE/AETHERION_WORLD_BIBLE.md), [geography](AETHERION_CANON/03_GEOGRAPHY/WORLD_GEOGRAPHY.md) and [branching story](AETHERION_CANON/06_NARRATIVE/BRANCHING_STORY.md).
4. [Systems](AETHERION_CANON/07_GAMEPLAY_SYSTEMS/SYSTEMS_OVERVIEW.md), [art direction](AETHERION_CANON/09_ART_DIRECTION/FIFTEEN_OATH_ART_GUIDE.md) and [implementation contracts](AETHERION_CANON/18_IMPLEMENTATION_CONTRACTS/IMPLEMENTATION_CONTRACTS.md).
5. [Validation and consistency report](AETHERION_CANON/19_VALIDATION/VALIDATION_AND_CONSISTENCY_REPORT.md), [independent review](AETHERION_CANON/19_VALIDATION/INDEPENDENT_REVIEW.md) and [390-cell coverage dashboard](AETHERION_CANON/19_VALIDATION/CANON_COVERAGE_DASHBOARD.md).
6. [Open decisions](AETHERION_CANON/00_GOVERNANCE/OPEN_CANON_DECISIONS.md) and [dependency-ordered roadmap](AETHERION_CANON/20_PRODUCTION_ROADMAP/PRODUCTION_ROADMAP.md).

## What is preserved and what is proposed

| Evidence class | Scope | Boundary |
|---|---|---|
| Founder-established canon | Fifteen Oaths, their identities/elements, one continent, First Fracture, Weave fragment and Archivist opening | New names, history, geography and numeric systems are proposed |
| Existing executable source | Ability-Matrix commit `4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451`; 100 live castables across 15 elements | 95 abilities, 3 buffs, 2 summons; all overall migration records remain IMPORTED |
| Recovered artwork | 114 distinct original PNG references, with hashes and source lineage | Sharing permission does not establish individual final-art, model, rig or animation approval |
| Proposed design | World, narrative, combat, contextual interactions, civilian economy, housing, PvP and technical contracts | Specifications and static checks are not implemented gameplay |
| Scoped runtime evidence | Actual source module/CPU lifecycle, migration, adapter, build and local HTTP checks | GPU, authored-rig interactions, production networking and performance remain separate gates |

The [source manifest](CASTABLE_SOURCE_MANIFEST.json) preserves 1,896 files and original paths. Eleven character moves and seven archived effects are retained separately from the 100 castables. The [per-castable registry](CASTABLE_REGISTRY.json) preserves original source fields and evidence. [World links](AETHERION_CANON/07_GAMEPLAY_SYSTEMS/CASTABLE_WORLD_LINKS.json) keep proposed integrations separate.

The full source asset index covers 197 paths / 112 unique byte identities, including a 24-file / 24-identity primary sandbox subset. Its screenshot/reference identities remain Referenced; runtime/support presence is scoped to source prototype evidence. The [full source manifest](CASTABLE_SOURCE_MANIFEST.json) records original paths and hashes. See the [asset index](AETHERION_CANON/10_ASSET_REGISTRY/SOURCE_ASSET_INDEX.json) and [coverage report](AETHERION_CANON/10_ASSET_REGISTRY/ASSET_COVERAGE_REPORT.md).

## Run the imported ability sandbox

Use Node.js 22.12 or newer (the source audit used 24.19.0). Follow [ABILITY_MATRIX_INTEGRATION.md](ABILITY_MATRIX_INTEGRATION.md) for dependencies and the source-preserving wrapper. Install both locked dependency sets first (a root-only install is insufficient):

    npm ci --prefix runtime/ability-matrix
    npm ci --prefix runtime/ability-matrix/packs/sandbox

Then run:

    npm run dev:abilities
    npm run build:abilities
    npm run preview:abilities

A fresh network install was not independently revalidated in the restricted execution environment; exact lockfile-matched local dependencies were reused for the recorded tests.

The destination wrapper retains the original UI/scene and all 100 castables. A destination-only repair supplies the original missing Linear fissure service for Meteor; the pinned source snapshot is unchanged. See the [migration report](CASTABLE_MIGRATION_REPORT.md), [validation report](CASTABLE_VALIDATION_REPORT.md) and [runtime audit](validation/RUNTIME_AUDIT.md) for scope and limitations.

## Reproduce validation

    npm test
    npm run test:source
    python3 -m pip install -r AETHERION_CANON/19_VALIDATION/requirements-validation.txt
    npm run test:canon
    npm run test:canon-fixtures
    python3 AETHERION_CANON/18_IMPLEMENTATION_CONTRACTS/validate_systems.py --repo-root .
    python3 AETHERION_CANON/06_NARRATIVE/validate_world_narrative.py AETHERION_CANON
    python3 AETHERION_CANON/19_VALIDATION/build_coverage.py --repo .

Tests distinguish static data integrity, source/runtime evidence, skipped capability gates and human review. The current environment could not establish WebGL2 visual parity. CPU lifecycle checks do not validate authored FBX hits/animation, shader rendering, balance, streaming, multiplayer or target-device performance. See current reports rather than inferring completion from file counts.

## Review and production

Remote publication is incomplete: the final local tree has not been verified on the remote branch and no final draft PR is claimed. The original model transfers have now been verified on the feature branch; final authored-tree publication and the intended draft PR remain pending. Any eventual branch or draft PR is a review artifact; no merge or deployment is implied. Approve proposed canon, individual concepts and commercial asset rights before production use. Prioritize the bounded cross-Oath vertical slice in the roadmap. Public-world consequences must remain recoverable; narrative allegiance is distinct from known, bound, active and equipped powers.

Public source traceability uses local SRC/REF IDs, titles/dates, repository paths and hashes. Private conversation/Library locators and retrieval identifiers are withheld under the [public provenance policy](AETHERION_CANON/00_GOVERNANCE/PUBLIC_PROVENANCE_POLICY.md).

## Documentation-only handoff archive

The companion canon handoff ZIP contains documentation, registries, schemas, validators, validation reports and root migration reports. It excludes the source runtime, model/texture binaries, original PNGs, dependencies and generated builds. Those remain in the complete local checkout; the intended remote import is pending publication. The ZIP is a review handoff, not a runnable distribution; file-hash/runtime checks require the full checkout. Its archive manifest names the exact included files.
