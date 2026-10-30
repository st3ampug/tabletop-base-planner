# Spec: line-of-sight mask

**Status:** approved by the owner on 30 October 2026; built on this branch. **Owner:** Balint. **Read first:** `CLAUDE.md`. **Branch:** `line-of-sight`, built on `refactor-modules-and-help`.

## Goal

Show, as a shaded overlay, every place on the table that chosen units can see, so I can tell where a unit can end its move unseen and where it would be exposed.

## User stories

1. **Hiding from the army:** I watch the whole enemy army and see the board tinted wherever any of its models can see. Clear areas are safe places to end a move.
2. **Hiding from one threat:** I watch one enemy unit (a big gun, say) and see only its view.
3. **Firing positions:** I watch my own unit to see what it can see from where it stands.
4. **My model must fit:** with one of my units selected, the safe area shrinks by that unit's largest base, so any spot shown as safe hides the whole base, not just its centre.
5. **Range:** I can limit the mask to a range (for example 24"), so it shows only what is both visible and in range.

## Decisions (agreed)

- **Watching instead of multi-select:** selection stays single. Each unit gets a **watch** toggle (an eye button in the Armies tab list and in the Selected panel), and each army gets **Watch all** and **Clear**. The mask is the union of what every watched unit can see.
- **What blocks sight:** walls and solid scenery always block, except objective markers. Terrain areas **block sight through them**: a model can see into an area but not through it, and a model inside an area can see out. This is a setting (on by default) because the 11th-edition rule needs confirming against the owner's cards.
- **Range:** optional and off by default. Quick chips for 12", 18", 24" and 36", plus a custom value, measured from the watching model's base edge.
- **Partial visibility:** a base counts as seen if any part of it is seen. This is on by default and can be switched to centre point only.
- **Models don't block sight.** Neither do vehicles or monsters, and there are no terrain heights, so a tall model doesn't see over anything. This is a known limit.

## How it works

- **Viewpoints:** each watched model contributes points around its base edge (6 for bases up to 50 mm, 8 for larger ones and hulls). A point on the table is visible if a straight line from any viewpoint reaches it without crossing a blocker.
- **Shadows:** for each viewpoint, every blocking edge casts a shadow (the edge projected away from the viewpoint to beyond the board). For terrain areas only the far-side edges cast shadows, so the inside of the area stays visible. An area containing the viewpoint casts no shadow. Outside the range limit counts as shadow too.
- **Combining:** a point is hidden only if it is in shadow from every viewpoint of every watched model. This runs on an off-screen canvas at 4 mm per pixel (280 × 381 px for the board; 2 mm took over a second for a full army in the test browser), filling each viewpoint's shadows and intersecting them with canvas compositing (`destination-in`).
- **Fitting the base:** for partial visibility, a distance transform over the hidden pixels gives each pixel's distance to the nearest visible point. A spot is safe for the selected unit if that distance is larger than the radius of its largest base.
- **Caching:** the shadow mask is recalculated only when a watched model or the terrain moves, or a sight setting changes. Moving your own units or changing the selection only re-applies the base-size step.
- **Display:** visible areas get a red tint with a crisp edge, drawn above the terrain and below the bases. Safe areas stay clear.

## Interface

- **Board:** a **Sight** button on the board, next to the Drag switch, turns the overlay on and off. The status line reads, for example, `Seen by 3 units · 24" range`.
- **Armies tab:** an eye toggle on each unit row, plus **Watch all** and **Clear** per army.
- **Selected panel:** an eye toggle for the selected unit.
- **Rules tab:** a new "Line of sight" group with *Terrain areas block sight through them*, the range chips, and *A base is seen if any part is seen*.
- **Help dialog:** a line on the Sight button and a step in "Through a game" (check where to end moves).

## Model and storage

- **Board state:** new key `los: { on: false, watch: [], range: 0, areas: true, partial: true }`, where `watch` is a list of unit keys like `"hostile:LYS"`. It's saved with the board and survives undo.
- **Old boards:** `applyState()` fills in the defaults, so boards saved before this feature load unchanged.
- **Docs:** document the new key in `README.md` and `docs/agent-briefing.md`.

## Code

- **New module:** `src/sight.js`, holding the shadow casting, the mask cache, the distance transform and the overlay drawing. Its functions take the terrain and models as arguments where practical, so they're easy to test.
- **Wiring:** `render.js` draws the overlay. `panel.js`, `armies.js` and the markup get the controls. `__planner` exposes `sightMask()` and `isSeen(x, y)` for tests.

## Tests (Playwright)

- **Walls:** a point directly behind a wall from a single watched model is hidden; a point in the open is seen.
- **Areas:** a point behind an area is hidden when *areas block* is on and seen when it's off. A point inside the area is seen. A model inside an area sees out.
- **Range:** a point visible at 30" is hidden with a 24" range.
- **Combining:** watching two units sees at least as much as each one alone. Clearing the watch list hides the overlay.
- **Base size:** with partial visibility on, a spot just inside a shadow edge is hidden for a centre point but seen for a 60 mm base.
- **Storage:** the `los` settings survive a reload. An old board without `los` loads with the defaults.
- **Speed:** watching the whole 49-model example army computes the mask within a generous budget (500 ms on the test machine).
- **Phone:** the Sight button and the Rules controls fit at 390 × 844 with no sideways scroll.

## Rules values to confirm (owner)

- Whether 11th-edition ruins block sight through them (the default here) and whether models wholly inside an area can be seen from outside.
- Whether some models (towering, aircraft) ignore terrain for visibility. If so, a later per-unit "sees over terrain" option can handle it.

## Known limits

- **2D only:** no terrain height, floors or windows, and models don't block. The mask is a planning aid, not a rules ruling.
- **Precision:** about 2 mm, which is far finer than measuring on the table.
