# Performance, accessibility and localization

Status: PROPOSED implementation design, except explicitly identified user-established foundations. Numerical values are bounded prototype hypotheses, unvalidated by playtests or profiling. These documents do not change imported Ability Matrix behavior.

Sources: SRC-USER-DIRECTIVE; SRC-RECOVERED-LORE; SRC-SYSTEMS-PROPOSAL. The first two establish the fifteen covenants and broad game pillars. SRC-SYSTEMS-PROPOSAL identifies design authorship, not user approval. Source runtime claims cite SRC-ABILITY-MATRIX-4c4a1eb at commit 4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451.

## Performance targets are hypotheses
PROPOSED_BUDGETS defines baseline/mid/high experimental quality profiles. Hardware is unresolved. Counts and frame-time goals are starting constraints for identical representative scenes, not measured performance or shipping requirements. The team must select supported device classes, resolution, framerate, memory and network expectations before accepting a production target.

Capture cold load, traversal across boundaries, repeated cast/clear cycles, pooled effect reuse, housing editing, crowded events and siege destruction. Record frame-time distributions, CPU/GPU split, peak memory, garbage collection, shader stalls, load latency, server-tick percentiles, bytes per player and interest-set size. Preserve capture settings, build hashes and content revisions. Compare regression deltas against a baseline measured on the same machine.

Load shedding changes cosmetic density, distant animation cadence, local shadow quality and ambience first. It cannot alter authoritative outcomes or erase essential enemy telegraphs. Budget exhaustion in proposed simulation interactions returns a visible, deterministic neutral result and a diagnostic counter. Source effect appearance can have quality variants only through a separate reviewed extension; source defaults remain archived and testable.

## Accessibility contract
Input: fully remappable actions, hold/toggle alternatives, target cycling, aim mode labels, adjustable sensitivity, controller navigation and no mandatory rapid-mash input. Keep combat assistance settings discoverable and document competitive parity.
Vision: scaleable text/HUD, contrast-aware silhouettes, shape/pattern redundant to color, outline options, readable range/timing, camera distance choices within fairness limits, and subtitles for essential cues. Weather and illusions preserve danger boundaries.
Hearing: captions identify source, direction and importance; music/sound puzzles have equivalent visual timing and pattern information. Provide separate dialogue, music, ambient and effects levels and mono compatibility.
Motor: repeatable safe practice, adjustable noncompetitive timing where appropriate, no precision requirement for ordinary UI, and switch-friendly menu focus. Competitive variations need explicit rules and testing.
Vestibular/photosensitivity: camera shake and motion blur can be disabled; limit flashing and sudden full-screen effects; gravity/time transitions support reduced-motion alternatives; no mandatory camera inversion. Formal compliance claims require specialist evaluation, not this specification.
Cognition: persistent objective summaries, plain-language pact terms, explicit consequence/recovery previews, adjustable tutorial replay and a clear distinction between player choice and timed event outcomes.

All settings survive reconnect and apply to every Oath. An accessibility mode must not remove the only cue to a puzzle, hostile deception or route change. Test with actual users and report limitations; checkbox coverage is not evidence of usability.

## Localization and content safety
Stable IDs are never translated. All displayed text uses localization keys with speaker, context, placeholders, grammatical constraints and length guidance. Use locale-aware quantities, times, plural forms and input glyphs. Avoid string concatenation. Layout handles expansion, right-to-left scripts and non-Latin glyphs. Caption ordering follows authoritative event order and has a legible priority cap.

Store player-authored housing names/signs with language metadata, moderation state and length/character constraints. Do not interpret them as executable markup or game instructions. Logs must avoid copying private chat, secrets or unnecessary personal data into telemetry. Privacy, retention and moderation policies remain unresolved production dependencies.

## Readability hierarchy
Tier 1: immediate personal danger, safe exits and interaction denial.
Tier 2: target identity, ally status, objective state and control recovery.
Tier 3: Oath identity, material reactions and spectacle.
Tier 4: ambient decoration and distant simulation.

Reserve audio/visual channels for tiers 1–2 when the scene saturates. Accessibility, localization and performance are jointly reviewed: a cheaper effect that loses meaning fails, and a translated warning that changes commitment semantics fails.
