# Source fidelity import — 18 October 2026

## Implemented import

Repository: https://github.com/jrmoyler/Ability-Matrix  
Commit: `c16da3c978a4815f46273fdcda2252ab48977a53`

The earlier vendored sandbox source lacked the current codex implementations. This change imports 205 changed or missing source files byte-for-byte from `packs/sandbox/src`, including the codex abilities, procedural geometry, shaders, materials, and particle effects. It preserves the source's own implementations rather than replacing them with palette variants. Every imported file has a SHA-256 in `ability-source-import.json`.

The three models used by HandCast Drone, Monowheel, and Phoenix are staged at `/assets/ability-source/handcast/models/`. The Phoenix's embedded glTF metadata identifies NORBERTO-3D and CC-BY-4.0; served credit and the pack's MIT notice are at `/assets/ability-source/ATTRIBUTION.txt`. Drone and monowheel contain no individual license metadata; they were already bundled in the user-authorized source pack.

The atlas runtime and its five `presets/new` supporting files were compared against this commit and already matched byte-for-byte. Atlas is a standalone preview importing `presets/runtime.js`, while codex classes live under the sandbox pack. They must be routed accordingly in the game adapter.

## Additional requested repository review

`NewKrok/three-particles` was cloned and its actual source and MIT license read at commit `f54737cabfec5668ac654c712aff0593162ca4ef`. Its instanced particle renderer, trail shaders, emitter lifecycle and force modules are reusable MIT code (copyright 2021 Istvan Krisztian Somoracz). No code from this library is copied in this change: retaining each original ability's particle system preserves source behavior and avoids running a competing emitter API. The source import above is the concrete implementation, not an assertion that reviewed repositories were integrated.

Prior repository availability and license review is recorded in `docs/THREEJS_SOURCE_REVIEW.md`; that inventory is not evidence of actual imports. Character/world quality requires rendered comparison against the project's reference artwork independently of source availability.

## Additional source resources and intentional adapter repairs

Eight additional unchanged GLBs are staged from the original casting pack (shark, wolf, dragon, magical gyroscope, amethyst stones, arcane tome, wildroot reliquary) and linear-extended pack (snake). Their embedded attribution metadata is retained in the binary and copied into served `ATTRIBUTION.txt`. **Dragon carries CC-BY-NC-4.0**, author 3DHaupt; its original source availability does not grant commercial-use rights. Magical gyroscope (reddification) and two-headed snake (Providence Secretary / NIEZDE) carry CC-BY-4.0. Other imported models contain no individual rights metadata.

Four original cathedral texture JPGs are served at `/textures/cathedral/` because the original material code uses those literal URLs. Each is byte-identical across the handcast, casting, and linear-extended source packs.

The ability integration intentionally repairs `PrismLieMaterials.js`: named color lookup resolves `c[s.color] ?? s.color` before calling `getColor`. The import manifest records the original upstream hash; this documented runtime repair means this file no longer remains byte-for-byte upstream after integration.
