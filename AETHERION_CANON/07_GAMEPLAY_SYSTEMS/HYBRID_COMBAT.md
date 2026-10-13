# Hybrid combat, traversal and encounter rules

Status: PROPOSED implementation design, except explicitly identified user-established foundations. Numerical values are bounded prototype hypotheses, unvalidated by playtests or profiling. These documents do not change imported Ability Matrix behavior.

Sources: SRC-USER-DIRECTIVE; SRC-RECOVERED-LORE; SRC-SYSTEMS-PROPOSAL. The first two establish the fifteen covenants and broad game pillars. SRC-SYSTEMS-PROPOSAL identifies design authorship, not user approval. Source runtime claims cite SRC-ABILITY-MATRIX-4c4a1eb at commit 4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451.

## Shared resolution, flexible input
Tab selection selects an eligible target; it is not an automatic hit. Action aiming selects a direction, point or volume. Both produce the same server-validated intent and run the same collision, range, line-of-sight, resource and timing rules for that technique. Each technique declares supported aim modes. A targeted heal can support selection and ally-cycle; a freely aimed ground line remains a ground line. Input accessibility cannot secretly widen damage or change targeting eligibility.

The authority uses a cast state machine: requested → validated → resource-reserved → anticipation → committed → active/sustained → recovery → complete. Denial before commitment releases reservation. An interrupt after commitment consumes only the published portion of cost. Cancellation and fizzle reason codes distinguish invalid target, protected volume, range, insufficient resource and capacity saturation.

Ability Matrix uid/element/cast/settings remain preserved in source. A PROPOSED gameplay descriptor may reference a real uid, but source visual timing and dummy reactions are not automatically promoted to combat damage, cooldowns, multiplayer guarantees or lore. Per-castable classification and adapter mappings require explicit review and independent regression tests.

## Weapons and styles
Melee: authored collision sweeps with capped target counts, facing and root-motion limits. Reach is verified against animation; animation cancellation is allowed only in marked windows.
Ranged: hitscan/projectile are declared per technique, with cover and bounded lag compensation; no client claims a hit. Leading and assisted aim use published, input-parity rules.
Spells: point, line, cone, targeted, scribed and persistent-volume templates. Moving targets may leave a zone before commitment; predictive telegraphs show authoritative area and timing.
Support: friendly-target filters, heal-overheal rules, cleanse categories and revive consent. Blood resource costs are self-owned; allies cannot be drained without an explicit opt-in mechanic.
Summons: each owner has a proposed cap of 2 simulation agents; a large controllable summon counts as both slots. The body remains governed by a safe, visible rule. Recall, death and disconnect clean up ownership and outstanding attacks. The source's two drivable summons remain source behavior; a production cap is a separate design proposal.
Mounted: traversal mount state is distinct from combat permission. Mount attacks need authored hitboxes, turn limits and dismount rules; interiors and protected social areas can disallow attacks. Forced dismount gives a safe landing and brief input recovery, not fall-to-death traps.
Morphs: bounded transformation state retains actor identity, inventory permissions and health ledger. A large form cannot enter a volume it cannot safely exit. Expiry validates space and returns to the last safe pose.
Siege: crew slots, occupancy, ammunition, traverse limits, repair windows and protected target masks. Siege damage never hits private storage or an unflagged player's dwelling inventory.

## Resources and response windows
Use health, stamina/guard and an Oath channel resource as separate ledgers. Resource names are design labels, not settled lore. Cooldowns and costs are per-technique configuration, not inferred from element. Holding a sustain reserves capacity and constrains another action, giving opponents a readable opportunity.

Prototype fixtures: 30 Hz authority, maximum 150 ms bounded hit-rewind for actor collision only, 300 ms ordinary large-attack minimum anticipation and 800 ms siege warning. These are unvalidated test values, not platform promises. Never rewind inventory, resources already committed, world ownership or protected-volume rules. For latency beyond the bound, resolve at the latest valid state and surface degraded connection feedback.

## Crowd-control limits
Classify hard control (stun, freeze, immobilization with no permitted action), soft control (slow, silence with remaining weapon actions), displacement, visual deception and camera effects independently. Proposed competitive fixture: hard-control accumulation ceiling 2 seconds within a rolling 8-second window, followed by 3 seconds of hard-control immunity; displacement capped at 6 meters per event and cannot cross protected boundaries. NPC/boss profiles may differ but must be authored. No elemental pair bypasses this shared budget. Client camera control is never seized by hostile effects; screen shake can be disabled.

Every hard control requires at least one authored avoidance/prevention route or a shared recovery resource. Bosses use staged vulnerability, stagger or object objectives instead of long chains of immunity-breaking stuns. Timers pause only local presentation where appropriate; server wall-clock consent, immunity and disconnection recovery continue.

## Encounter and difficulty grammar
An encounter specifies arena escape/safe bounds, enemy roles, target/agent budget, phase transitions, telegraph vocabulary, reset/recovery and noncombat alternatives where narratively appropriate. Teaching encounters isolate one rule; advanced encounters combine already-taught rules. Difficulty changes planning, patterns and pressure rather than unreadable saturation.

Puzzles use the same material/state interaction rules but declare permitted substitutes and reset controls. Sequence puzzles preserve progress at safe checkpoints. Sound puzzles provide captions, directional indicators and a visual rhythm lane; color puzzles provide shapes and labels. Illusion mechanics retain accessible cues without exposing unrelated secrets by disabling graphics.

## Fairness and verification
Friendly fire is off in ordinary cooperative play; designated consensual modes declare exceptions on entry. Hostile casts cannot become harmful through another player's friendly environmental effect outside opted-in combat. Protected spaces clamp authored gameplay volumes, not merely VFX.

Tests must cover mouse/keyboard, gamepad, remapping, toggle/hold alternatives, target cycling, reduced motion, mono audio and color-vision modes. Playtest both input styles against the same encounter with logs for aim assistance and server decisions; do not claim balance from unit tests.
