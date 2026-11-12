# Aetherion interface direction

The first session moves from covenant selection to its cost, discipline and a name, then into the living Three.js world. Preserve the authored fifteen-oath canon. Use the existing raster reference artwork in cropped portrait and equipment windows; do not draw SVG symbols or substitute stick figures. The title is typography over the live world, without an ornamental wheel.

Use existing serif display typography and sans-serif labels. Maintain dark ink surfaces (#101720), warm text (#f1ead8), muted secondary text (#b8b2a7), and selected-oath accent tokens. Keep 8/12/16/24 pixel spacing, clear borders, 44 pixel touch targets and visible keyboard focus. Selection is indicated by text and border, not color alone.

Onboarding uses three explicit steps with a persistent next/back footer. On phones each step owns one natural vertical scroll region, with no nested scroll traps and no global touch suppression. Desktop retains a three-column overview. Content must reflow at 320 pixels and when the software keyboard shrinks the viewport. Transitions never replace the focused control or prevent input. Reduced motion disables nonessential motion. Validate selecting the final oath, scrolling its covenant, reaching the name field and confirming on desktop and touch.

## Playable command layer

The HUD keeps the world sightline open: vitals upper left, target upper centre, navigation upper right, six abilities bottom centre, and a labelled command strip beneath them on desktop. Use existing ink, parchment and covenant accent tokens; serif headings and 12–14px sans-serif operational labels. Command buttons have 44px minimum targets, explicit keyboard hints and visible focus. No new icon libraries or ornamental SVGs are introduced.

The first-session guide opens with a concrete next action and advances only after actual movement, targeting, casting and conversation. Completion is saved per browser; a reset control makes instruction discoverable again. On phones the guide starts compact inside the existing flow dock. Touch utilities retain at least 44 physical pixels and readable labels. In-game settings show a clear return-to-world action and truthful local/online pause status. Modal windows trap focus and restore it on close; reduced-motion preferences continue to suppress ornamental animation.

## Covenant prologue and game presentation

The first session is a game sequence: title → live covenant audition → authored hero selection → code-rendered realm arrival → action-driven field training. The covenant audition always shows the selected Oath name, element, class, and actual GLB hero; changing either selection updates that stage. On touch the stage remains visible above a scrollable choice section. Loading and unavailable states must never present the previous hero as the new selection.

Keep the established charcoal/navy, warm parchment text, brass rules and oath accent. Use serif display headings (24–48px) with system sans instructions (13–16px), 8px spacing increments, restrained borders, clear selected/focus states and ≥44px controls. Inventory/technique illustrations stay authored raster art; utility symbols have coherent silhouettes with readable labels. Avoid document-like palette/material tables in the primary selection hierarchy.

Arrival films use only runtime Three.js geometry, camera paths, lights and subtitles, never video or external generated art. Three short shots establish realm, hero, and control handoff. Skip is always accessible; reduced motion removes camera travel. Input locks only during the film, restores on completion/error/skip, and all temporary scene resources are disposed. The HUD yields to the cinematic and returns with a clear objective.

Onboarding advances on actual player movement, NPC interaction and authoritative combat outcomes, not next buttons or elapsed time. World-space objective markers connect the HUD destination to a place in the realm. Desktop and portrait layouts preserve the center combat sightline; all screen transitions must be verified through real input with zero console errors.

## Covenant arrival film

The selected realm and the loaded hero are the imagery: three live Three.js shots establish the sanctuary, frame an element-specific covenant manifestation, then settle behind the player. Ink letterboxing, restrained warm serif titling and 14–18px high-contrast subtitles use the existing visual language. A 44px “Enter the realm” button stays visible above the lower safe area; Space/Escape skip immediately. A thin progress rule and labelled shot number explain duration. At narrow widths text wraps within 24px gutters. Reduced motion bypasses the film. The 10-second sequence gates gameplay input, hides inactive HUD layers, disposes all temporary geometry and restores the actual follow camera on skip, completion or cancellation. All visuals are code, no downloaded images, video or new UI library.

## Cinematic world presentation — November 2026

Keep all fifteen authored realm palettes and character silhouettes. Improve depth with local lamp light, contact occlusion and the shipped outdoor HDR reflection environment. No sepia grade, artificial teal/orange split, forced motion blur or always-on depth of field. HDR highlights retain the existing ability bloom cap. Low/medium tiers omit ambient occlusion; high/ultra expose it as a real render pass. Every quality tier remains explicit and user-selected.

Camera framing uses a bounded velocity lead and continuous obstruction sampling. Camera field of view, shake and motion preferences are editable live. Reduced motion removes lead, sprint lens changes and shake. Sanctuary lights come from authored lamp positions, with a fixed nearest-light pool and dusk/day fade; they must not create new gameplay collision or alter terrain.

All existing menus share dark mineral ink (#0b1018), warm white (#f1ead8), muted stone (#b8b2a7) and brass (#c9a866), with each oath's accent retained. Squared 2px corners, restrained 1px rules, serif section titles and tabular numeric labels replace rounded card framing. Preserve control dimensions, 44px targets, keyboard focus, scroll behavior and mobile safe areas. The central playfield remains unobstructed. Existing art and icons are retained.

Acceptance: all-realm day/night views, character close-ups and combat effects at low/high tiers; menu keyboard/touch checks at 390x844 and 844x390; shader compile errors fail capture. Unit/build evidence cannot certify visual quality or physical-device performance. The reference is premium cinematic third-person readability; this remains a Three.js game, not an Unreal migration.

Hero material finishes use the existing physical-material path: restrained fabric sheen, glazed porcelain, and lacquer clearcoat. Recipe-specific overrides retain priority. No character mesh, rig, costume, weapon, texture, or production asset is replaced. Ability Matrix distortion and the existing bloom-input ceiling remain in the finishing chain.
