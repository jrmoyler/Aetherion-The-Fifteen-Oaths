# Oathbound character inspection

Preserve the existing parchment dossiers, dark iron panels, oath emblems and per-Oath accents. The player should inspect the actual playable model before committing to a covenant. No unrelated UI framework or stock art.

Add an optional `Inspect character` action beneath the discipline choices. It opens a native modal dialog with a large model viewport, the character title, status text, rotate controls, idle/walk/attack controls, and a visible close button. Use existing serif headings and sans-serif controls, #111827 stage, #f5f0e6 text and the selected Oath accent. Controls remain at least 44px high. Dialog width is min(720px, viewport minus 24px); canvas height is bounded by available viewport height. Controls wrap on narrow screens.

Load the model on demand using the gameplay asset loader and body factory. If the model cannot load, show the authored procedural character and explicitly identify that fallback. Do not download all 30 characters. Disable animation by default under reduced motion, but permit explicitly requested animation. Native dialog focus containment, Escape dismissal and focus return are required. Dispose the preview engine, scene, models and event listeners on close. Avoid a persistent second rendering loop during gameplay.

Verification: build, model instantiation tests, open/close and rapid selection checks, desktop/mobile rendered inspection when browser execution is available. No external UI components introduced.

Narrow touch HUD: health/mana text must stay inside its own panel and never extend beneath the minimap. Allow grid children to shrink, truncate long character names, and remove the desktop XP minimum width in touch mode.

## Touch campaign HUD

Keep the story objective and vitals in the upper-left, with navigation in the upper-right. Reserve lower corners for a small floating movement stick and a responsive combat cluster. Give Attack, Dodge, Jump, Interact and Target visible labels. Retain the painted ability art and brass/ink treatment. Use 44 CSS pixels or more for thumb targets and reserve the center for the character and right-side camera drag. Keep stretch, wrapping and safe-area handling in CSS, so rotation does not require a page reload.

Use the existing input actions. Hold Attack for the same repeat behavior as keyboard or gamepad. Capture each held pointer independently and release it on cancellation, resize, visibility loss or modal entry. Swipe outside the movement and control zones to orbit and use two fingers to zoom. Verify touch-only movement, look, attack and menus in portrait and short landscape.
