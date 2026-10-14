# Preview validation snapshot

Captured **2026-10-14T01:00:47.563Z**. Status: **PASS_AT_CAPTURE**. This is bounded local evidence; later exports and final remote head require another run.

[File hashes](validation/snapshot.json), snapshot SHA-256: `aedf32c7a00a95517ea5623b5e5d8700bf941ff968d077d2b529743ff8d1097e`.

- Unit tests: **37 passed**.
- Actual Three.js GLTFLoader CPU checks: **209/209 GLB state/LOD records passed**, from **17 manifests**.
- Development HTTP byte checks: **209 GLBs**. Built preview HTTP byte checks: **209 GLBs**.
- Original reference byte checks: **20 development / 20 built**.
- Production build passed; bundle size warnings are retained in the build log.
- Tested inputs changed after capture: **0**. Preview code inputs are unchanged from before the checks; all tested GLBs, manifests and references match their captured hashes.

| Authored state | Tested GLB/LOD records |
|---|---:|
| damaged | 22 |
| long-grip | 3 |
| ready | 150 |
| short-grip | 3 |
| stowed | 28 |
| unfolded | 3 |

## Reproduce

Run `npm ci` then `npm run validate:snapshot` from this directory after artists finish exporting. The recorder runs unit tests, actual GLTFLoader import/animation/disposal checks, a production build, development HTTP checks and built HTTP checks. It records file hashes and exits nonzero if a checked file changes before the end. Fresh pinned dependency installation was verified during this authoring session.

## Evidence and limits

[CPU report](validation/asset-import-cpu.json) retains each GLB hash, state, LOD, clip counts, material checks and loader warnings. [Unit tests](validation/unit-tests.log), [build](validation/build.log), [development HTTP](validation/http-development.log) and [built HTTP](validation/http-built.log) preserve command output.

Optional damaged/stowed files do not inherit ready-state LODs. Separate manifest variants retain their original IDs and their own LODs. Source castable code remains unchanged.

Node does not decode browser image textures: texture decode is explicitly unverified and loader warnings remain visible. These are CPU/HTTP/build checks, with no browser/WebGL render, visual approval, gameplay integration, engine parity or target-device performance certification. No browser sandbox settings were changed.
