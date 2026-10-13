# Review04 publication audit

**PASS** — `b6ca38d297e25d67d37a0312c5b8b92aa62b6101` versus preservation baseline `e67fa874c53f0b9a6b319b2e7eab82141fa7c9bc`.

- All 204 committed bundle files match the exact evidence allowlist, including 21 logs; all recorded hashes/sizes and local frozen bytes match.
- All five opt-in visual GLB paths and SHA256 values match committed bundle04 bytes; collision and historical diagnostic exports are excluded.
- All 114 original reference PNGs are byte-identical to the baseline commit.
- Exact Phase II archive: 1,011,575 bytes, SHA256 `02306b20f0c070f6fe488d7bf2e4fa25412503010c037860fe3a2a91244be2bc`; all 115 unpacked payload files match the ZIP and baseline commit.
- Evidence manifest SHA256: `bb8ac26eed9d8a39e48715b730361517470c521763c192b932224a24c5526e10`.

Concrete errors: 0.

Read-only Git-byte audit; unrelated dirty character/recipe changes were excluded. This does not add engine, GPU, visual or production-acceptance evidence.
