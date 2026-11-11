# Touch layout pass

Captured in headless Chrome (software rendering) from a production build, touch emulation on.

| Size | File |
| --- | --- |
| 390x844 portrait | `portrait-390x844.png` |
| 667x375 landscape | `landscape-667x375.png` |
| 844x390 landscape, both help panels collapsed | `landscape-844x390.png` |

A scripted check measured every HUD element (player frame, target frame, compass, minimap, tracker,
guide, potion belt, experience strip, four utility buttons, ten cluster buttons, thumbstick) at 667x375, 844x390,
932x430 and 390x844 in three states: first run, tracker toggled, both panels collapsed. Result at all
four sizes: no two elements overlap, nothing leaves the screen, every utility button is at least 44 px.

Not covered: real devices, notches and safe-area insets other than zero, and tablets.
