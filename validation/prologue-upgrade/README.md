# Playable prologue verification

Follow-up to the playable realm upgrade in PR #16.

- Production build: passed (Vite/PWA).
- Client regression suite: 75 passed, 0 failed.
- Production browser flow: title → live Tidal Sorcerer selection → code-driven arrival → skip → enabled movement and HUD. No page errors or failed HTTP responses. See flow.json.
- Arrival uses Three.js camera choreography, procedural geometry and HTML captions; zero video elements. Gameplay input and offline simulation pause during the sequence and restore on exit.
- Unit coverage includes all 15 cinematic plans, cleanup, supersession, reduced motion, action-based onboarding and authoritative objective markers.
- Selection browser checks cover 1440×900, 390×844 and 320×568: actual fire/water and ninja/sorcerer GLBs, rotation, stance and no horizontal overflow.
- Native onboarding selection/scroll/submission checks passed at the same three sizes.

Screenshots use software Chromium at low rendering quality; they demonstrate layout and behavior, not a hardware performance benchmark. The cinematic is a three-shot arrival, not a full story campaign.
