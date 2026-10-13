# Publication continuation

Publication checkpoint at 2026-10-13 18:12 UTC: **the large-model transfer blocker is resolved**. The complete source/reference binary set is available in the destination. The reviewed full foundation tree and new draft pull request are the remaining delivery steps; this timestamped checkpoint does not assert that they have already been published.

## Last verified remote state

- Destination: [jrmoyler/Aetherion-The-Fifteen-Oaths](https://github.com/jrmoyler/Aetherion-The-Fifteen-Oaths).
- Main: `641789ebdb2f2f1232e8281347921393db4c2ccf`, containing the minimal review-base README only.
- Feature branch: `foundation/aetherion-canon-castable-migration`.
- Feature head: `1085dd520f7c0239843bf2767a15bbae4356ca9f`, descended from `0350e4bf834c093b380d9ccad16989656bca8b1f`.
- The earlier in-progress staging commit added only the byte-identical original `runtime/ability-matrix/packs/casting/public/models/amethyst_stones.glb`. It creates the real model directory without a placeholder.
- Authoritative source snapshot: [Ability-Matrix at 4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451](https://github.com/jrmoyler/Ability-Matrix/tree/4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451). Later upstream changes are outside this import.

The other source and reference asset transfers have preserved their original bytes, but they are not yet attached to a complete published branch tree. A fresh clone of the current feature branch therefore does **not** contain the complete runnable foundation.

## Resolved original model transfers

These unchanged originals were transferred by a normal authenticated Git push and independently verified through the destination remote tree at the feature head above. Their sizes exceeded the initial publication route's request limit. They were not recompressed, replaced, split, regenerated or omitted.

| Source path at the pinned commit | Bytes | Git blob SHA | SHA-256 |
| --- | ---: | --- | --- |
| `packs/casting/public/models/dragon.glb` | 13,680,600 | `3dd95b4e7605c12add71698803b07cfc9b292d5b` | `904fc29f889668ef82204feb0d87849060ae2c7cb486769a35081a415beb4db5` |
| `packs/casting/public/models/duel_hall.glb` | 13,078,696 | `71fe9f1340dd711c16f89e0a13d76650ccb688e6` | `0c7344c414e3a3fad7fc2cce38e7f0245dd2eed3969779ef0e3c03867fc58972` |

Destination paths:

1. `runtime/ability-matrix/packs/casting/public/models/dragon.glb`
2. `runtime/ability-matrix/packs/sandbox/public/models/dragon.glb` — the identical dragon blob is required in both original locations.
3. `runtime/ability-matrix/packs/casting/public/models/duel_hall.glb`

## Completed model-transfer procedure (audit record)

1. Use an authenticated checkout of **Aetherion**. Fetch the dedicated feature branch and inspect its current head before making changes. Preserve the existing branch history; do not reset, force-push, or write implementation onto `main`.
2. Read a separate checkout of the public **Ability-Matrix** source at exactly `4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451`. Do not edit, commit, push, merge, or deploy anything in Ability-Matrix.
3. Copy the two original files byte-for-byte into the three destination paths above. Verify file sizes, `sha256sum`, and `git hash-object` against this document. Both dragon destinations must have the same expected hashes.
4. In Aetherion, stage only those three model paths, review the staged diff, and commit them on `foundation/aetherion-canon-castable-migration` as an in-progress source-asset transfer.
5. Use a normal fast-forward `git push origin foundation/aetherion-canon-castable-migration`. If the remote has advanced, stop and inspect that change before proceeding. Verify the resulting remote commit and the three blob identities.
6. Return the verified commit SHA. The complete prepared canon/runtime tree must descend from that head. No full workspace transfer or regeneration is required for this narrow continuation.

## Remaining publication checks

- Use the reviewed public-safe provenance projection: repository-relative reference paths, hashes and stable local source IDs. Do not reuse earlier unsanitized publication payloads.
- Freeze and review the complete authored tree; verify every original source file and all 114 reference hashes against the manifests.
- Assemble the complete feature-branch tree, rerun applicable validation, verify the remote content, then open a **new draft pull request**.
- Do not publish an incomplete runtime as the final deliverable. Do not merge or deploy without the user's approval.

The 100 castables have scoped CPU evidence; none is claimed fully GPU/gameplay validated. See [CASTABLE_VALIDATION_REPORT.md](CASTABLE_VALIDATION_REPORT.md) for the measured acceptance scope.
