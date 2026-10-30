# Clock Race · arcade look: replaceable art

"An afternoon inside a Japanese game center, circa 1992."

**Every image in this folder is a TEMPORARY PLACEHOLDER.** They were painted procedurally by
`tools/clock-race-arcade/paint_placeholders.py`, not by an artist and not by an image model. They have the
right sizes, palette and transparent regions so the game is playable while real illustrations are made.

To swap a layer, replace the file with a real painting **of the same name, size and transparency**.
No code change is needed. Then run a normal deploy.

| Layer | File | Size | Notes |
|---|---|---|---|
| A · room | `a-room.jpg` | 1080 × 2340 (portrait 9:19.5), JPG, under 400 KB | The painted room behind everything. Shown with `cover`, anchored 22% from the top, so the top ~25% (ceiling, lights) and bottom ~20% (floor) are what players see around the cabinet during play. The whole image shows on the entry and lobby screens. No characters, no text. Keep the centre calm: the cabinet covers it. |
| B · cabinet shell | `b-cabinet-shell.png` | 360 × 360, PNG with alpha | **9-slice**, slice 72 px on all sides (CSS: `border-image: … 72 / 26px round`). The 72 px border ring is the painted shell (pink body, ivory bezel lip, dark seat for the CRT). The 216 × 216 centre must be **fully transparent**: the live screen shows through it. Corners stay unstretched; edges repeat (`round`), so paint the edge strips to tile. |
| C · CRT glass | `c-crt-glass.png` | 800 × 800, PNG with alpha | Stretched over the screen (`100% 100%`). Keep it almost clear: soft corner darkening and at most one faint highlight. Anything stronger reduces the contrast of answers. No dirt, scratches or glare. |
| D · ink outline | `d-ink-frame.png` | 120 × 120, PNG with alpha | **9-slice**, slice 12 px, used on every button and panel. A single hand-inked rounded rectangle about 5 px in from the edge, ~3 px thick, colour `#3A3446`. It is drawn 1 px off the paint on purpose (cel misregistration). |
| D · paint texture | `d-paint-texture.png` | 256 × 256, tileable | A light grey gouache density texture, multiplied into flat fills. Keep it pale (around 230–245 grey). |
| F · foreground | `f-foreground-top.png`, `f-foreground-bottom.png` | 1080 × 240 each, PNG with alpha | Details over the room and under the game (a hanging light, the edge of a neighbouring cabinet, a crane-game corner). Currently empty (fully transparent). |
| E · timers | none (drawn in code) | | The player timers are live SVG in `src/components/clockRace/Dials.jsx`: ivory bezel, 20 lamps, powder-blue face, hand. |

## Palette

Primary: faded turquoise `#7EC4BE`, dusty pink `#E8A8B6`, powder blue `#ACCAE2`, warm ivory `#F6ECD6`, soft lavender `#C4B8E0`.
Secondary: muted coral `#E8927C`, pale yellow `#F4DE96`, pistachio `#B6D296`, desaturated navy `#465474`. Ink `#3A3446`.

## Seeing the classic look

Add `?theme=classic` to the game's address (remembered on that phone). `?theme=arcade` switches back.
