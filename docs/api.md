# `window.planner`: the interface for scripts and AI agents

**Version 1.** The planner page exposes `window.planner`, a frozen object of functions for driving the board from code. Each function changes the board the same way the UI does: one undo step, autosave and redraw. Each returns a plain report (JSON-safe) instead of throwing. When something goes wrong it returns `{ ok: false, error }`.

`window.__planner` is a different object: it's the page's test hook, and it can change without notice. Use `window.planner`.

## Conventions

- **Units:** all positions are in **millimetres**, origin top-left, y down. The board is portrait, 1117.6 × 1524 mm (44" × 60"), with the red (attacker) zone at the top. Reports give distances in both `_mm` and `_in` (inches to one decimal).
- **References:** a function that takes a *ref* accepts a unit key (`"friendly:LUC"`), a base id (`42`), or an army (`"friendly"` / `"hostile"`). Use `units()` to list the keys.
- **Distances:** always base edge to base edge.
- **Collision:** when the interface moves or places units, it checks against blocking terrain, the board edge and **all** other models, whatever the Rules tab says. A unit never collides with its own models.

## Running it

**In a browser:** open the page (https://st3ampug.github.io/tabletop-base-planner/ or a downloaded `index.html`) and call `window.planner` from the console or from your browser tool's JavaScript.

**Headless, offline** (the usual case for agents, whose workspaces often can't reach github.io): from a clone of the repository,

```
npm install
npx playwright install chromium           # once
node tools/planner/run.mjs my-plan.mjs --out planner-out [--board start.board.json]
```

`my-plan.mjs` exports `default async (planner, ctx) => result`. The `planner` there has the same functions, called from Node with `await`. `ctx.save(name, { caption })` writes `<name>.board.json` and `<name>.png` into the output folder, `ctx.read(path)` reads a file, and `ctx.page` is the Playwright page. See `tools/planner/examples/thursday.mjs`. The runner starts from the page's built-in example board in a fresh browser profile; pass `--board` to start from a saved board.

## Functions

### Board

**`getBoard()`** returns the board object, the same as **Save → Copy board**: `mapId`, `armies`, `bases`, settings, and a read-only `table` (zones, objectives, terrain in mm). The format is described in `docs/agent-briefing.md` and `README.md`.

**`loadBoard(textOrObject)`** replaces the board. It returns `{ ok, errors, check }`, where `check` is the result of `check()`. A `table` in the input is ignored.

**`undo()`** undoes the last change. It returns `{ ok }`.

**`image({ caption, pxPerInch = 16 })`** returns a PNG data URL of the whole board, with an optional caption above it.

### Layouts

**`layouts()`** returns `[{ id, you, opponent, variant, deployment, name }]` for all 45 layouts.

**`findLayout(you, opponent, variant)`** returns a layout id or `null`. The dispositions can be abbreviations (`TAH`, `DIS`, `PTF`, `PA`, `REC`) or names (`take-and-hold`). Both orders give the same table.

**`setLayout(id)`** returns `{ ok, id, name, check }`. Models keep their positions, so `check` shows any that now overlap the new terrain.

### Armies

**`importList(text, { army = 'friendly', sizes, name, deploy = true })`** reads a list the way **Armies → Paste an army list** does: Warhammer-app exports, or text with points in brackets per unit.

- If every base has a size, it replaces that army's roster and deploys it into its zone. It returns `{ ok: true, units, faction, notInZone }`; `notInZone` lists units that didn't fit and were placed outside the zone.
- If some sizes are missing, usually vehicles with no base, it changes nothing and returns `{ ok: false, error, units }`, where each unit shows `missingSize`. Call it again with `sizes`, e.g. `{ "Chaos Rhino": "hull 117x74" }`. Sizes are written like `40`, `120x92` or `hull 117x74`, and sizes given this way are remembered like sizes entered in the page.

**`units(army?)`** returns `[{ u, army, name, models, centre: { x, y }, bases: [{ id, label, w, h, shape, x, y, rot }] }]`.

### Moving

**`placeUnit(ref, x, y, { exact = true, turn = 0, searchInches = 6 })`** moves the unit so its centre (the average of its model centres) lands on `(x, y)`, keeping its formation. `turn` turns the whole unit that many degrees clockwise about its centre first.

- With `exact: true` it refuses rather than sliding: `{ ok: false, blockers: [{ base, by }] }`, with the unit unchanged.
- With `exact: false` it takes the nearest free spot within `searchInches` and reports how far it was pushed: `{ ok: true, placed, pushed_mm, pushed_in }`.

**`moveUnit(ref, dx, dy, { maxInches })`** moves the unit in a straight line by `(dx, dy)` mm, stopping at the first wall, model or board edge. It doesn't slide. `maxInches` caps the length of the move. It returns `{ ok, moved_in, moved_mm, requested_in, limitedByMax, stoppedBy, startedIllegal }`; `ok` is true only when the whole requested move happened.

**`toContact(ref, targetRef, { maxInches })`** moves the unit straight at the closest model of the target until base contact (within 0.5 mm), or as far as it can. It returns `{ ok, gap_in, gap_mm, moved_in, from, to, blockers }`. Use `maxInches` for a charge roll; when it falls short, `gap_in` is what's left.

### Questions

**`measure(a, b)`** returns `{ inches, mm, from, to, crossesWalls, wall }`, base edge to base edge between the closest pair of models of `a` and `b`. `crossesWalls` tells whether the straight line between those two models' centres crosses a blocking wall.

**`seen(target, { by })`** tells whether a point `{ x, y }`, a base or a unit is visible. `by` is a unit key, a list of keys, or an army; without it, the units currently watched in the page are used. It returns `{ ok, seen, fraction, by }`. A unit counts as seen if any sampled point of any of its bases is seen, and `fraction` is the share of sampled points seen. It uses the page's line-of-sight model: top-down, walls block, terrain areas block sight through them (a Rules setting), no heights, and the range setting applies. It leaves the page's sight settings as they were.

**`check()`** returns `{ ok, illegal, coherency, engagement, engagementRange_in }`:
- `illegal`: models overlapping blocking terrain or another model, with what they overlap.
- `coherency`: units out of coherency, using the Rules tab settings, with the models concerned.
- `engagement`: friendly and hostile unit pairs within the engagement-range setting (Rules tab, default 1"), with the closest distance.
- `ok` is true when there's nothing illegal and nothing out of coherency. Engagement isn't an error.

## Example (in a browser console)

```js
const p = window.planner;
p.setLayout(p.findLayout('TAH', 'REC', 1));
p.importList(myListText, { army: 'friendly', sizes: { 'Chaos Rhino': 'hull 117x74' } });
p.importList(theirListText, { army: 'hostile' });
const fb = p.units('friendly').find(u => u.u === 'friendly:FB');
p.placeUnit('friendly:FB', fb.centre.x, fb.centre.y - 8*25.4, { exact: false });
p.measure('friendly:FB', 'hostile');   // { inches, from, to, crossesWalls }
p.seen('friendly:FB', { by: 'hostile' });
p.check();
```

## Changing the interface

Breaking changes (renamed functions, changed arguments or report fields) need `version` bumped, this document updated, and `tests/test-api.js` updated. Adding a function or a report field isn't breaking.
