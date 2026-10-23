# Playable interface verification

Browser: headless Chromium (Sparticuz), software WebGL/SwiftShader; Vite development runtime. This is layout/interaction evidence, not target-device performance certification.

- Desktop 1440×900 and touch portrait 390×844 entered the actual deployed Three.js client with `?oath=oath-01&cls=sorcerer&name=Wayfarer&q=low`.
- Both runs: zero uncaught page errors and no document horizontal overflow.
- Desktop: four labelled command buttons present. Menu click opened settings; status read “Realm paused · take your time.” Return to world closed settings.
- Touch: Jump, Dodge, Target, Interact controls measured approximately 53.04×53.04 CSS pixels at this viewport. Command dock correctly hidden; dedicated touch buttons remained available.
- Inspected actual screenshots. Corrected oversized quest icon flex allocation and portrait overlap between command toolbar and task header. Final captures include both corrections.
- Tracked destination Mara Venn showed camera-relative direction and measured distance. Pure navigation tests pass for left/right/ahead/behind, yaw wrapping, arrival and missing input.
- Vite production build passed. `node --test game/src/ui/questNavigation.test.mjs`: 2 passed.

The development server logged an expected unavailable WebSocket backend before automatic local-realm fallback. The browser completed startup in the local simulation.

Evidence: `ui-desktop.png`, `ui-mobile.png`.
