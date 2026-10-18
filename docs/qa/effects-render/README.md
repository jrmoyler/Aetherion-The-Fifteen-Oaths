# Ability effects: rendered audit (150 catalog abilities)

**What this proves.** Every one of the 150 catalog abilities was cast in a real WebGL renderer
(headless Chromium, ANGLE on SwiftShader), and the frames were read back and measured. All 150
put non-trivial pixels on screen, with zero console errors and zero page errors.

**What it does not prove.** These are software-rendered screenshots. They say nothing about
frame rate on a real GPU, and nothing about shader precision or driver behaviour on a GPU. Each
sample is a fixed simulated moment, not a recording. The stage is the review page
(`game/review.html`), not the city.

## How to run it

```sh
# any Vite server for game/ (a watcher-free one avoids mid-run reloads):
cd game && npx vite --port 5180 --host 127.0.0.1
node tools/qa/effects-render-audit.mjs --url http://127.0.0.1:5180 --times 0.3,1,2,3
# subset with per-ability time strips:
node tools/qa/effects-render-audit.mjs --ids casting/chains,casting/shark --times 0.3,0.8,1.5,2.5,4 --out /tmp/x
```

The harness loads `review.html?audit=1`. In audit mode the free-running loop is off, and
`window.__review` exposes `reset`, `cast(id)`, `step(seconds)` and `capture()`. For each ability
the harness does the following:

1. Resets the stage and renders a baseline frame before the cast.
2. Casts from the caster at z=8 toward the rigged target at the origin.
3. Advances simulated time at a fixed 1/60 s step, rendering every 4th step, up to each sample time.
4. Reads the canvas back in the same task as the render.

Metrics are computed against the baseline:

- **changedFrac**: share of pixels whose largest channel difference is above 14/255.
- **meanAbsDiff**.
- **Luma and saturation** of the changed region.
- **Luma standard deviation and gradient** of the changed region. These detect flat, solid blobs.
- **blownFrac**: share of near-white pixels (all channels at or above 248).

An ability is flagged when any of these hold:

- It has an error.
- Its source identity does not match.
- The best changedFrac is below 0.004.
- More than 5% of the frame is clipped white, or more than 45% of the changed region is clipped.
- A region larger than 3% of the frame has a luma standard deviation below 7.

Output files:

- `report.json`: the final run, with every sample and metric.
- `contact-t{0p3,1,2,3}s.jpg`: 10x15 grids of thumbnails labelled with the ability id. A red label means flagged.
- `before-contact-t1s.jpg` and `before-summary.json`: the first run, on the code as found.
- `closeup-casting-chains-t1p6s.jpg`: close-up of one ability that the fixes brought back.

## Results

| | Before (code as found, original stage) | After (this change) |
|---|---|---|
| Rendered (best changedFrac ≥ 0.004) | 150/150 | 150/150 |
| Metric pass (no flags) | 149/150 (`codex/orbital` blown to a full-frame white) | **150/150** |
| Console and page errors | 0 | 0 |
| Abilities with warnings | 4 (redundant `toNonIndexed` on Three r180 polyhedra) | 1 (`casting/dragon` dead animation tracks); fixed afterwards and re-verified warning-free in a 3-ability rerun |
| Lowest best changedFrac | 0.0106 | 0.0289 (`codex/arterial`) |
| Highest blownFrac in any sample | 0.95 changed, full-frame white | 0.038 |
| Wall time, 640x400, 4 samples | about 33 min (3 samples) | about 48 min |

The metric pass rate before the change was misleading. The pixel metrics were green for 149
abilities, but reviewing the contact sheets showed problems that the metrics cannot detect:

- **18 abilities had every particle system invisible.** This covered all of the casting and handcast packs: shark, wolf, dragon, gyro, amethyst, tome, reliquary, chains, lance, glacial, frost, phoenix, toxic, monowheel, drone, flux, voidslash and shard.
- **casting/chains never drew its chains**, and its portals were placed at NaN.
- **Generic target knockback never happened.**
- **Buffs had no body to wrap**, because the review caster was only a position.
- **The stage was so bright that additive effects washed out.**
- **Several effects bloomed into a full-frame haze.**

## Root causes and fixes

These are all procedural. No images were downloaded or generated, and the source identity
(`sourceId`) is unchanged.

1. **Particle engine clock.** `game/src/three/source-abilities.js` called `particles.flush()`
   without a time argument. The casting and handcast engines need `flush(time)`. With
   `undefined`, `hasLive()` is false, so every system hid itself every frame. The adapter now
   passes the shared `uTime` clock.
2. **Missing `lateUpdate`.** The source app calls `abilities.lateUpdate(dt)` after the targets
   step. `casting/chains` lays its links there. The adapter now follows the source order:
   `update`, then the target step, then `lateUpdate`, then `flush`.
3. **Missing generic hits.** The source `DummyField#applyHits` was never ported. A
   presentation-only port now knocks back a mob when a line cast's front sweeps it or a zone
   cast lands on it, for packs whose source app stands dummies. `handlesOwnHits` casts are
   untouched. Server authority is unchanged.
4. **Target proxy had no `facing`.** `game/src/three/source-targets.js` now exposes `facing`,
   `sliced` and `height`. Before this, casting/chains computed its whole rite frame from
   `Math.sin(undefined)`.
5. **Bloom input cap.** `game/src/three/postprocessing.js` changed. The source packs were
   authored for a bloom strength of 0.03; the game uses 0.38. The bloom high-pass input is now
   capped at a luminance of 2.4. The displayed HDR image and its white-hot cores are untouched,
   but VFX cores can no longer flood the frame through bloom. This fixes `codex/orbital`.
6. **Glyph Barrage pillars.** In `sandbox/config/codex/glyphs.js`, `pillarGlow` goes from 1.6 to
   0.8 and `pillarCore` from 1.25 to 0.35. Four pillars stacked along the behind-the-caster view
   added up to a flat white slab. The violet streaks and climbing rings are visible again.
7. **Console warnings.**
   - The redundant `toNonIndexed()` on r180 polyhedra is now guarded in 12 vendored copies of
     ProceduralGeometry and AmethystRig. The resulting geometry is byte-identical.
   - The dragon idle clip's tracks for `Plane` and `Hemi`, nodes that DragonRig removes, are now
     stripped in the adapter.
8. **Review stage** (`game/review.js` and `review.html`).
   - Neutral dark-slate floor and moderate lighting, to match the reference sheets.
   - The source sandbox's own rigged Mixamo dummy (`casting/public/models/dummy.fbx`) is now the
     target, with an untextured authored PBR material as in the source Dummy.
   - A rigged caster figure stands at z=8, so boost auras have bones to wrap.
   - Closer audit framing.
   - Empty favicon, which removed a 404 console error.
   - The audit API described above.

Every changed upstream runtime file is recorded with its reason and hashes in
`docs/upgrades/source-integration-patches.json`, which is checked by
`tests/migration-integrity.test.mjs`.

## Still not at parity, and honest caveats

- **Short-lived effects can fall between samples.** `linear/thunder` and `collective/blink`
  peak at about 0.1 to 0.4 s. Use `--times 0.1,0.2,0.4` to see them. Summons such as
  `casting/dragon` and `casting/tome` arrive after about 2 s.
- **Strong light spill is by design and has been kept.** `matrix-new/emberveil` and
  `codex/orbital` (during the strike) throw strong point-light spill across the floor. This is
  intended, but it is the brightest content in the set.
- **The reference sheets are a bar, not a match.** Sheets such as reference-000 (Riptide Lash)
  and reference-020 (Frost Lance) are painted concept art. The effects are recognisably the
  same idea, with the same staging, palette and target reaction, but they are not a
  pixel-for-pixel match. Volumetric water sheets and foam in particular read thinner than the
  paintings.
- **Target reactions run on the review stage only.** They act on the source dummy. In the city
  they act on whatever rig the mob has, which needs Mixamo-like bone names or `body.sockets`
  for bone-driven casts such as chains.
- **Thresholds are coarse.** A pass means the frame is not empty, blown out or a flat blob. It
  does not mean art-directed quality. The contact sheets were reviewed by eye for that.
