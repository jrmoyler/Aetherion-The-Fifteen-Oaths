# Cinematic world upgrade proposal

Base: merged PR #26, `eeb037dd1fef02ba1a329a23da6c16689df53017`.

This PR improves shared presentation across the existing Three.js game. It does not establish Unreal Engine/Rockstar production parity, rebuild the entire asset library, or certify release quality. No production mesh, rig, animation, texture, ability, or biome asset is replaced. Merge, deployment, and asset replacement still require approval. Automatic Vercel deployment is disabled for `feat/cinematic-world-upgrade`.

## Proposed changes

| Area | Behavior | Review concern |
|---|---|---|
| World illumination | Shipped outdoor HDR feeds PMREM reflections; environmental intensity tracks daylight/weather. Generic room remains a load-failure fallback. | Night readability, realm hue preservation, reflected highlight strength. |
| Contact shadows | High/ultra activate the previously unused AO quality setting using Three GTAO, at half/three-quarter resolution and 8/16 samples. Low/medium omit AO. | Foliage halos, transparent objects, near-camera contact, cost on real GPUs. |
| Finishing | Bounded bloom, neutral HDR contrast/saturation/vignette, FXAA after output conversion. Source ability distortion and bloom-input cap retained. | Bright ability cores, dark detail, fine hair/UI edges. UI is DOM and is not graded. |
| Sanctuary lamps | Authored brazier/shrine positions populate a fixed pool of 2/4/6 non-shadowed point lights. Fade before reassignment, dim during daylight. | Pool transitions while moving; fixtures must illuminate the intended geometry. No arbitrary replacement lamps. |
| Camera | Bounded travel lead, live 40–80° field of view, adjustable impact shake, OS/player reduced-motion handling. Marsh waterline uses local surface height. | Walking, sprinting, tight walls, swimming, touch look, transitions, teleport recovery. |
| Character materials | Existing accessory materials receive fabric sheen, porcelain glaze and lacquer clearcoat; explicit recipes win. Fix same-length shader additions incorrectly sharing a program cache key. | Hero closeups under daylight and lamps; retain authored colors and surface identity. |
| Interface | Shared ink/brass panels, squared corners, visible keyboard focus, restrained contrast and controls across HUD and windows. Existing layout and touch-safe areas retained. | Actual mobile portrait/landscape, settings scrolling, keyboard navigation and combat readability. |

## Repeatable visual coverage

`npm run qa:cinematic -- http://127.0.0.1:5173 OUTPUT` captures the **real client**, not substitute geometry. Set `TERRAIN_TIER=low` and `high`. Every realm has a daylight sanctuary, night sanctuary, hero closeup and terrain-transition view: **120 planned images** across both tiers. Capture records include camera/position, time, active renderer features, renderer identity, context loss, streaming state, errors and commit/dirty status. These are staged captures, not full gameplay sessions or frame-rate benchmarks.

Priority order preserves the nine realms lacking documented rendered inspection in PR #25:

| Realm | Terrain | Priority |
|---|---|---|
| 04 | Coast | First |
| 06 | Cliffs | First |
| 08 | Marsh | First |
| 09 | Meadow | First |
| 10 | Highland | First |
| 11 | Badlands | First |
| 12 | Crimson | First |
| 13 | Terraces | First |
| 15 | Industrial | First |
| 01, 02, 03, 05, 07, 14 | Volcanic, glacial, alpine, canyon, forest, plateau | Regression |

The `Cinematic world review` workflow shards these captures across six software-WebGL jobs and uploads PNG/JSON artifacts even after failure. A passing capture job only confirms rendering and absence of collected errors; a person must inspect images before visual acceptance. It does not measure genuine GPU/device performance. The existing terrain harness continues covering spawn, camp, transition geometry and simulation behavior.

Local browser attempt: **blocked, zero images**. Chromium aborts at process-singleton socket creation with `Operation not permitted`; see [the recorded launch failure](local-attempt/report.json). No screenshot, visual acceptance, gameplay session, FPS result or physical-device validation is claimed from this workspace.

## Acceptance before merge

- Inspect all priority realms first, then the remaining six; compare low/high and day/night, including sanctuary entrances, lamps, vegetation bases, terrain joins and camp grounding.
- Inspect hero skin/hair/gear and ability highlights at gameplay distance and close range. Confirm no clipping, changed silhouette, washed-out highlights, AO halos or dark crushed surfaces.
- Exercise real movement, sprint, jump, shrine access, camp approach, collision, swim, ability casts and camera controls. Check settings and reduced motion during play. Staged capture alone does not satisfy this requirement.
- Inspect portrait and landscape mobile HUD layouts and all menu panels. Retain touch target and focus visibility.
- Measure actual device frame times, memory, thermal behavior and streaming during representative gameplay on the intended hardware. Software rendering and CPU sampling timings are separate evidence.

## Automated results

See `validation.json` for commands, outcomes and limitations. CPU assertions verify constructor/lifecycle wiring, deterministic scene data, bounded lighting, all-city shrine illumination, camera preferences/waterline and shader-cache correctness. They do not certify shader output or visual quality. Existing source-ability null-context test failures are tracked separately from this presentation change.
