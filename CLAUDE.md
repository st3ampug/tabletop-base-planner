# Tabletop Base Planner: guide for coding agents

A static web page for planning Warhammer 40,000 (11th edition) deployments with true-size bases on the Battlemaster terrain layouts. It's live at https://st3ampug.github.io/tabletop-base-planner/ and deployed to GitHub Pages by the `Pages` workflow, so **whatever is pushed to `main` goes live within a few minutes.**

Every other branch pushed to GitHub gets a preview at `https://st3ampug.github.io/tabletop-base-planner/preview/<branch>/` (slashes in the name become dashes), listed at `/preview/`. Use previews to try changes without touching the live page. `tools/build_site.sh` builds the whole site; `.github/workflows/branch-pushed.yml` exists only to start the `Pages` workflow when a branch other than `main` is pushed, because only `main` may deploy.

The owner is a software QA specialist. Prefer small, reviewable commits, tests for new behaviour, and plain explanations of trade-offs.

## Build and test

```
python3 tools/build.py .         # rebuilds index.html (the live page) from src/ and data/
python3 tools/build.py build     # same, into build/ (git-ignored), for testing
node tests/test-import.js build  # army-list import against tests/fixtures/*.txt
node tests/test-ui.js build      # end-to-end: picker, import, deploy, coherency, rings, boards, help (24 checks)
```

- **Tests:** Playwright, run against `build/index.html` via `file://`. Install Playwright locally (`npm i -D playwright`) and point it at your Chromium. The tests currently pass `executablePath: '/opt/pw-browsers/chromium'` with a fallback.
- **Before committing:** always run both test files, and commit the rebuilt `index.html` together with the source change. `index.html` is a build output; the workflow rebuilds it, but keep it committed so the repo still holds a working page that can be downloaded and opened offline.
- **Screenshots:** `tests/test-ui.js` writes them to `build/shots/`. Look at them after visual changes (desktop 1280×900 and phone 390×844).

## How the code is organised

`src/app.src.html` holds the CSS and markup. The script is split into modules in `src/` with no dependencies or framework. `tools/build.py` makes one self-contained page by replacing three placeholders:

- `/*MODULES*/` ← the modules, joined in the `MODULES` order listed in `build.py` with their `import` and `export` lines removed, so they share one script scope
- `/*MAPS*/…/*END*/` ← `data/layouts-40kdc.json` (layouts, terrain shapes, deployment zones)
- `/*UNITS*/…/*ENDUNITS*/` ← `data/units-40kdc.json` (unit names, model counts, base sizes)

| Module | What it holds |
|---|---|
| `core.js` | Constants (`IN`, base sizes, colours), the injected data `DC` and `CAT`, `$()` |
| `maps.js` | Expands the compact layout data into `MAPS[id]` (terrain polygons in mm, zones, objectives) |
| `state.js` | `S` (the board state), `snapshot()`, `applyState()`, undo stack, `T` (live terrain for the current map), board storage |
| `geometry.js` | Point-in-polygon, ellipse and hull collision, `blockers()`, `tryMove()`, `moveGroup()`, `findSpot()`, `edgeDist()`, `cohIssues()`, `ringPath()` |
| `render.js` | `fit()`, `draw()` (one function draws everything), tags, the status line |
| `ui/pointer.js` | Pointer events: drag bases or units, pan, pinch zoom, ruler, terrain dragging |
| `ui/actions.js` | Select, add, remove, duplicate and rotate bases; terrain edits |
| `ui/panel.js` | The side panel: inspector, size chips, layout picker and thumbnails, rules settings |
| `armies.js` | Roster format parser `parseRoster()`, deployment into zones `deployUnit()` / `deployAll()`, swap sides, the Armies tab |
| `import.js` | `readList()`: parses Warhammer-app exports and plain text lists and fuzzy-matches units to the catalogue; the import preview |
| `ui/saveload.js` | Board text export (`exportText()` adds a read-only `table` block), import |
| `ui/boards.js` | Named boards in `localStorage` |
| `ui/keyboard.js` | Shortcuts |
| `ui/help.js` | The Help dialog (its text is in the markup in `app.src.html`; keep it in step with features) |
| `main.js` | Start-up, migration of older saves, `window.__planner` |

Rules for the modules:

- **Imports:** write `import { a, b } from './x.js';` at the top and one `export { … };` list at the bottom. `build.py` stops if an import names something its module doesn't export, or if a `.js` file in `src/` isn't in `MODULES`.
- **Assigning shared values:** a module can read another module's `let` but must not assign it. Assign it in the module that declares it, or call a setter (`setM`, `setT`, `setSel`, `setBX`, `setArmyView`, `clearLiveMsg`).
- **Order:** the modules depend on each other in a cycle (state calls the panel to re-render, the panel calls state), which works because the build joins them into one scope and functions are hoisted. Code that runs while the script loads, such as `addEventListener` calls and top-level constants, relies on `MODULES` order. The modules don't load natively in a browser.
- **Names:** every top-level name must be unique across all modules, because they share one scope after the build.

`window.__planner` exposes state and functions for the tests. Keep it working, or update the tests with it.

## Conventions and decisions (don't change without asking)

- **Units:** everything internal is millimetres, and the UI shows inches (`IN = 25.4`).
- **Board orientation:** the board is 44" × 60" portrait, origin top-left, y down, red attacker zone at the top. The source data is landscape 60" × 44"; `tools/dc_export.py` rotates it.
- **Base shapes:** a base is `{ w, h, x, y, rot }` with `w ≥ h`, centred, `rot` in degrees clockwise. `shape: 'hull'` makes it a rectangle for vehicles without a base; otherwise it's an ellipse (a circle when `w = h`).
- **Collision:** circles and ellipses are tested exactly, by transforming into unit-circle space. Hulls use polygon intersection. Terrain pieces have `collision: 'allow' | 'block'`, and walls belong to an area via `g`, so moving an area moves its walls.
- **Units of models:** a unit is the bases sharing a key `u` (`"friendly:LUC"`). Leaders and bodyguards are one unit.
- **Formats:** the roster text format (`LABEL | name | n @ size [label], …`) and the board text format are documented in `README.md` and in `docs/agent-briefing.md`, which the owner gives to an analysis AI. Keep both documents in sync with any format change, and keep old saved boards loading. `applyState()` is the place for migrations.
- **Storage:** browser storage only. Keys are `tabletop-base-planner-boards`, `…-boards:<id>` and `…-prefs`. There's no server, and none should be added without discussing it.
- **Hosting:** no external requests at runtime, because the page must work offline from a downloaded file.
- **Rules values:** rules values (coherency distance and so on) are settings, never hard-coded truths. The defaults are 10th-edition values marked for the owner to confirm against 11th-edition cards. The owner's physical cards and mission app beat every other source.

## Data

- **Source:** [40kdc-data](https://github.com/wn-mitch/40kdc-data), CC BY 4.0. The attribution must stay in the page (Save tab) and in the README. The layouts were imported there from Battlemaster and are marked "pre-launch provisional".
- **Regenerating the layouts:** `tools/dc_export.py`. It includes one deliberate fix (a generator 4.5" outside its area in Purge vs Recon 1), with an assertion that stops if the source changes.
- **Regenerating the units:** `tools/units_export.py`. The unit records also have `profiles` with `W` (wounds) per model name, which the rounds-and-replay feature needs. See `docs/spec-rounds-and-replay.md`.
- **Base sizes:** vehicle hulls have no size in the data, so users enter them and the sizes are remembered in prefs.

## Open work

- `docs/spec-rounds-and-replay.md`: game rounds, wounds, casualties and replay. This is the next feature.
- Known limits: no line of sight, terrain height, engagement range or objective control.
