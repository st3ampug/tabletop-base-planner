# Tabletop Base Planner

A web page for planning Warhammer 40,000 (11th edition) deployments with true-size bases on all 45 Battlemaster terrain layouts.

**Use it online** at the GitHub Pages address for this repository, or download `index.html` and open it in any browser. It needs no server, account or internet connection.

## Features

- **Army lists:** paste a list exported from the Warhammer app or written as plain text. Units are matched to the 40kdc unit data, which gives model counts and base sizes. Leaders join their bodyguard as one unit. You check the result before using it, and the planner remembers sizes you enter for vehicles with no base size in the data.
- **Layouts:** a 5 × 5 Force Disposition grid (your disposition is the row, your opponent's the column) with previews of the three variants for each pairing. Each layout has its deployment zones, objectives, terrain areas and walls.
- **Deploying:** a friendly and a hostile army. "Deploy all" places a whole army inside its zone, clear of walls and other bases. "Swap sides" turns both armies to the opposite zones.
- **Moving:** drag a whole unit or a single model, with the distance moved shown in inches. Rectangular hulls for vehicles without a base. A separate ruler.
- **Line of sight:** watch enemy units (or your own) and the board is tinted red everywhere they can see, so you can find where to end a move out of sight. Walls block, terrain areas block sight through them (a setting), an optional range limits it, and with a unit selected the clear areas fit its biggest base. There are no terrain heights.
- **Reserves and markers:** put units in reserve and bring them on later; add tunnel markers, deep strike points, objective markers and notes, with optional rings. Markers don't block movement.
- **Engagement range:** a red line links friendly and enemy models within the engagement-range setting.
- **Range rings:** select a unit and show a ring at 1", 2", 3", 6", 9", 12" or any other distance, measured from every base edge.
- **Coherency:** models out of coherency are outlined in orange. The distance, the size at which a unit needs two neighbours, and the "one group" rule are settings in the Rules tab.
- **Collision:** each terrain piece either blocks bases or lets them enter. A blocked move can stop at the obstacle or be allowed and flagged in red.
- **Terrain editing:** move, turn, add, remove and rename pieces. An area carries its walls with it.
- **Games:** record a game phase by phase. Each step keeps where every model was, which were in reserve or destroyed, and the victory points, for 5 rounds of attacker and defender turns. Wounds per model come from the data.
- **Boards:** keep several named boards, each with its own layout, armies and positions, saved in the browser. Copy a board as text to move it to another device or hand it to an analysis tool.

## Roster format

Each army's roster can also be edited by hand, one unit per line: `LABEL | Unit name | count @ size [base label] [wounds], …`

```
LUC | Lucius + Flawless Blades | 1 @ 50 LUC w6, 6 @ 40 FB w3
MF1 | Maulerfiend | 1 @ 120x92 MF1 w12
RH  | Chaos Rhino | 1 @ hull 117x74 RH w10
```

Sizes are in mm: `40` is a round base, `120x92` an oval, `hull 117x74` a vehicle hull. `w6` is the wounds per model; without it a model has 1.

## Board text format (Save tab → Copy board)

Everything is in millimetres. The origin is the top-left corner and y increases downwards. The board is portrait, 1117.6 × 1524 mm (44" × 60"), with the red attacker zone at the top.

- `mapId`, `mode` (`stop` or `flag`), `baseCollide`, `unitMove`, `ring`, `coh` (coherency settings), `los` (line of sight: `on`, `watch` unit keys such as `"hostile:LYS"`, `range` in inches with 0 for any, `areas`, `partial`)
- `armies.friendly` / `armies.hostile`: `name`, `colour`, `side` (`blue` or `red`), `roster`
- `bases[]`: `id`, `w`, `h` (w ≥ h), `x`, `y` (centre), `rot` (degrees clockwise), `shape` (`hull` for vehicles), `label`, `army`, `u` (unit key, e.g. `friendly:LUC`), `maxW` (wounds per model, when more than 1)
- `reserve[]` (bases of units in reserve), `markers[]`
- `games[]`, `game` (the open game's id): recorded games, each with its phases, a roster of models and its saved steps. Step 0 lists every model; later steps list only the models that changed, as `[x, y, rot, wounds]` or `[x, y, rot, wounds, "reserve"|"destroyed"]`. Described in `docs/agent-briefing.md`.
- `table` (read-only, ignored when loading): `zones[]`, `objectives[]` (`role`, `owner`, `x`, `y`) and `terrain[]` (`kind` `area` or `wall`, `collision`, `poly`)

`docs/agent-briefing.md` is a prompt that explains this format to an AI assistant analysing a matchup.

## Check before relying on it

- **Rules:** coherency defaults are the 10th-edition values (2", two neighbours for units of 7 or more). Set them to your 11th-edition card.
- **Layout data:** marked "pre-launch provisional" in its source. Compare a layout with the official card or mission app.
- **Base sizes:** vehicle hulls have no size in the data, so you enter them. The data puts Impulsors on 100 mm round bases and Lucius on 50 mm.
- **Not modelled:** terrain height (line of sight is top-down) and objective control. Rules such as Move limits and reserve distances are shown, not enforced.

## Project layout

| Path | What it is |
|---|---|
| `index.html` | The built planner, served by GitHub Pages |
| `src/app.src.html` | Page styles and markup, with placeholders where the script and data go |
| `src/*.js`, `src/ui/*.js` | The script, as modules that the build joins into one file |
| `data/layouts-40kdc.json` | The 45 layouts, terrain shapes and deployment zones |
| `data/units-40kdc.json` | Unit names, model counts and base sizes for list import |
| `tools/build.py` | Builds the single-file `index.html` from `src` and `data` |
| `tools/dc_export.py`, `tools/units_export.py` | Regenerate the data files from 40kdc-data |
| `src/api.js` | `window.planner`, the interface for scripts and agents (`docs/api.md`) |
| `tools/planner/` | `run.mjs`, the headless runner, and example scripts |
| `tests/` | Browser tests (Playwright) and example army lists |
| `examples/` | A saved board |

To rebuild after changing the source:

```
python3 tools/build.py .
```

To refresh the data from 40kdc-data:

```
git clone --depth 1 https://github.com/wn-mitch/40kdc-data
python3 tools/dc_export.py tools 40kdc-data build              # writes build/dc-data.json; copy it to data/layouts-40kdc.json
python3 tools/units_export.py 40kdc-data data/units-40kdc.json
```

To run the tests:

```
python3 tools/build.py build
node tests/test-import.js build
node tests/test-ui.js build
node tests/test-api.js build
node tests/test-game.js build
```

## For scripts and AI agents

The page has a documented interface, `window.planner`: load and read boards, set the layout, import lists, place and move units with collision reports, move into base contact, measure, check sight, check legality, and draw the board as an image. See `docs/api.md`.

To run it headless and offline:

```
npm install
npx playwright install chromium
node tools/planner/run.mjs tools/planner/examples/thursday.mjs --out planner-out
```

`docs/agent-briefing.md` is a prompt to give an AI assistant that works with the planner.

## Credits

Terrain layouts, deployment zones, unit model counts and base sizes come from [40kdc-data](https://github.com/wn-mitch/40kdc-data) by Alpaca Software and the 40kdc community, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (see `data/LICENSE-DATA-40kdc.txt`). The layouts were imported there from Battlemaster. Changes made here: outlines simplified, board turned to portrait with the attacker at the top, wall lines thickened to 0.5" solids, one misplaced generator corrected, and the data reduced to what the planner uses.

This is an unofficial fan tool, not affiliated with or endorsed by Games Workshop. Warhammer 40,000 is a trademark of Games Workshop Ltd.
