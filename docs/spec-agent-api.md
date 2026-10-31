# Spec: a stable interface for agents, and the gaps an agent run exposed

**Status:** proposed, for the owner to prioritise. **Read first:** `CLAUDE.md`.

## Why

On 31 October 2026 an analysis agent used the planner to plan a full game: Blades and Bait vs tunnel Tyranids, PA v REC 1, with five boards from deployment to turn 2. It worked, but it showed what the page lacks when an agent drives it:

1. **No access to the live site:** the agent's workspace couldn't reach github.io, so it cloned the repo and ran the page headless with Playwright, the same way our tests do. That's the normal case for agents, not an exception.
2. **No stable interface:** it drove the page through `window.__planner`, which is a test hook, plus board-text round trips and clicks. It wrote its own helper scripts and lost time to its own bugs (a dropped map id) and to UI behaviour (the import message box closes once an import succeeds).
3. **Placing by centre point is guesswork:** placing a unit at a centre point let walls push it sideways. It re-aimed several units by hand, and charges stopped 2–4" short of contact until it re-targeted them.
4. **Missing game concepts:** a reserves area, markers (tunnel markers, deep-strike points), an engagement-range check and a move-distance check. It checked move distances by hand against each unit's Move.
5. **Confusing labels:** Lucius came out as "LE", and the Neurotyrant and Neurolictor as "NEU" and "NEU2".
6. **Base sizes to verify:** Biovores 80 mm, Zoanthropes 40 mm, Raveners 40 mm. These are the dataset's values. Only hull sizes can be overridden today.
7. **Turn sequences by hand:** it built a captioned strip of five boards by hand. That's the job of the rounds-and-replay feature.

## Proposal

### A. A documented `window.planner` interface (priority 1)

A small, versioned interface that agents and the tests use, documented in `docs/api.md`. `window.__planner` stays as the test hook. Everything takes and returns millimetres, with inches added where useful. Each function changes the board the way the UI would (undo, autosave, redraw) and returns a report instead of failing silently.

| Function | Returns |
|---|---|
| `planner.version` | `1` |
| `getBoard()` | The board object (the same as Copy board, including `table`) |
| `loadBoard(textOrObject)` | `{ ok, errors, check }`, where `check` is the result of `check()` |
| `layouts()` | `[{ id, you, opponent, variant, deployment }]` |
| `setLayout(id)` | `{ ok }` |
| `importList(text, { army, sizes })` | `{ ok, units: [{ key, name, bases, matched, flags }] }`. `sizes` supplies sizes for flagged units, e.g. `{ "Chaos Rhino": "hull 117x74" }`; the army is applied and deployed only when nothing is flagged. |
| `placeUnit(u, x, y, { rot, exact })` | `{ ok, placed: { x, y }, pushed_mm, blockers }`. With `exact: true` it refuses rather than sliding. |
| `moveUnit(u, dx, dy, { maxInches })` | `{ ok, moved_in, stopped_by }`. It stops at walls and models, as a drag does. |
| `toContact(u, targetU)` | Moves the unit straight towards the target until base contact, or reports what's in the way. Returns `{ ok, gap_in, moved_in, blockers }`. |
| `measure(a, b)` | `{ inches, crossesWalls }`, base edge to base edge. `a` and `b` are base ids or unit keys; for units, the closest pair. |
| `seen(target, { by })` | Whether the target point or unit is visible to the watched units, or to `by` if given, plus the fraction seen. |
| `check()` | `{ illegal: [...], coherency: [...], engagement: [...] }`. Engagement lists enemy pairs within the engagement-range setting. |
| `image({ caption, scale })` | A PNG data URL of the board with an optional caption, for reports and strips |

**Acceptance:** every function has Playwright tests; `docs/api.md` documents each with an example; and the agent prompt shrinks to the URL, the doc link and the rules for the agent.

### B. A headless runner in the repo (priority 1)

`tools/planner/run.mjs` builds the page if needed, opens it in headless Chromium, runs an agent's script against `window.planner`, and writes the outputs:

```
node tools/planner/run.mjs plan.mjs --out out/
# plan.mjs: export default async (planner, save) => { … save('deploy', planner.getBoard(), planner.image({ caption: 'Deployment' })) }
```

- **Why:** agents shouldn't have to write their own Playwright glue. The runner works offline and needs only `npm i` plus `npx playwright install chromium`.
- **Acceptance:** an example script that imports `tests/fixtures/children-of-the-recon.txt` and `tests/fixtures/stephen-imperial-fists.txt`, sets TAH v REC 1, deploys both armies and writes a board and an image.

### C. Game concepts the agent missed (priority 2; extends `docs/spec-rounds-and-replay.md`)

- **Reserves tray:** already in the rounds spec. Bring it forward, because it's useful without replay.
- **Markers:** a new, generic token: `{ id, kind: "tunnel"|"deep-strike"|"objective"|"note", x, y, radius_in?, label, army? }`. They're drawn on the board, can be dragged, have an optional ring, are part of the board text and don't block movement.
- **Engagement range:** a setting (10th-edition default 1", to confirm for 11th) used by `check()`. The UI marks engaged pairs with a thin link.
- **Move budget:** add `M` (Move) per model to `tools/units_export.py` from the dataset `profiles`. In the inspector, show Move and Move + Advance rings. Once rounds exist, flag models that moved further than their budget since the previous step, with a warning only.

### D. Smaller fixes (priority 2)

- **Labels:** characters get the first three letters of their name (Lucius → LUC, Sorcerer → SOR, Lord Exultant → LOR). When two units would share a label, use the part of the names that differs (Neurotyrant → NTY, Neurolictor → NLI) instead of adding numbers.
- **Import messages:** after a successful import, keep a summary visible (units, models, anything that was flagged) instead of closing the message box.
- **Base size overrides for any unit:** let the user correct the size of any imported unit, not only hulls, and remember it in prefs like hull sizes. Show the dataset value next to the override.
- **Upstream reports:** when the owner confirms a dataset size is wrong, report it to 40kdc-data, and record it in a `data/size-notes.md` list.

## Suggested order

1. **A + B together:** the interface and the runner. One branch, with tests and `docs/api.md`. Then update `docs/agent-briefing.md` to point at them.
2. **D:** labels, import messages, size overrides. Small and independent.
3. **C:** reserves tray and markers first, then engagement range, then the move budget, ahead of or alongside the rounds-and-replay work.

## Open questions for the owner

1. Should agents be able to save boards into the repo, e.g. `data/boards/`? Today the page has no reason to read them, and they would only add clutter.
2. Should the engagement-range and move-budget checks be warnings only, like everything else so far? The suggestion is yes.
3. Is the 11th-edition engagement range 1"? This is the default to confirm.
