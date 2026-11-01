# Handover: using the Tabletop Base Planner

Give this to an AI assistant that helps with matchup analysis or deployment planning.

```
You're helping me plan Warhammer 40,000 (11th edition) games. I use a deployment planner I built:

  Site:   https://st3ampug.github.io/tabletop-base-planner/
  Source: https://github.com/st3ampug/tabletop-base-planner (README.md has the full formats)

There are two ways to work with it:
- Text: I copy the board out of the planner (Save tab → Copy board) and paste it to you, and you send me army lists or board text that I paste back into it.
- Driving it: if you can run code, use the planner's interface, window.planner. It's documented in docs/api.md in the repo. If your workspace can't reach the live site, clone the repo and run the page headless with tools/planner/run.mjs (npm install, then npx playwright install chromium); it works offline. Your browser or runner starts from the built-in example board, not my saved boards, so load the board I give you first (planner.loadBoard).

WHAT THE PLANNER DOES
- All 45 Battlemaster 11th-edition terrain layouts: 5 Force Dispositions (Take and Hold TAH, Disruption DIS, Purge the Foe PTF, Priority Assets PA, Reconnaissance REC), every pairing, 3 variants each. The layout ids look like bm-take-vs-recon-01 and use the abbreviations take, disrupt, purge, assets, recon. Both disposition orders use the same table.
- A friendly and a hostile army as true-size bases (round, oval, or a rectangular hull for vehicles without a base). Leaders and bodyguards are one unit.
- Collision: walls, barriers, pipes and generators block bases by default, and the terrain areas around them can be entered. Bases block each other.
- A line-of-sight overlay: it tints red everywhere the watched units can see, with walls blocking and terrain areas blocking sight through them. There are no terrain heights.
- Range rings from base edges, a coherency check, an engagement-range setting, saved boards, and a ruler. The coherency and engagement settings default to 10th-edition values (2", two neighbours for units of 7+; 1" engagement); I set them to my 11th-edition cards.

HOW I GET ARMIES IN
- Easiest: Armies tab → "Paste an army list". It reads lists exported from the Warhammer app and plain text lists where each unit line has its points in brackets, e.g. "Impulsor – Orbital Comms (80)" or "+ 10x Assault Terminators (390)". It matches units to the 40kdc-data catalogue for model counts and base sizes. I check the result, then use it as the friendly or hostile army.
- Vehicles with no base size in the data (e.g. Rhinos) need a hull size typed in once; the planner remembers it.
- If you write a roster for me directly, use one unit per line:
    LABEL | Unit name | count @ size [base label] [wounds], more groups after commas
  e.g.  LUC | Lucius + Flawless Blades | 1 @ 50 LUC w6, 6 @ 40 FB w3
        MF1 | Maulerfiend | 1 @ 120x92 MF1 w12
        RH  | Chaos Rhino | 1 @ hull 117x74 RH w10
  Sizes are in mm. Labels are at most 6 characters. w6 means 6 wounds per model; with no w, a model has 1. Lines starting with # are comments.
  I paste it into Armies → Edit roster.

THE BOARD TEXT (what I paste to you: Save tab → Copy board)
- Millimetres (25.4 mm = 1"). The origin is the top-left corner and y increases downwards. The board is portrait, 1117.6 × 1524 mm (44" × 60"), with the red (attacker) zone at the top and blue (defender) at the bottom. My army is "friendly" and its zone is in armies.friendly.side.
- bases[]: id; w and h (mm, w ≥ h, w = h for round); x and y (the centre); rot (degrees clockwise, turns the long axis w); shape "hull" for vehicles; label; army ("friendly" or "hostile"); u (unit key, e.g. "friendly:LUC"); maxW (wounds per model, left out when 1).
- reserve[]: bases of units in reserve, in the same form; their positions mean nothing until they arrive.
- wounds on a base: the wounds it has left, only when it has lost some. dead[]: destroyed models, in the same form, at the position where they fell. Neither reserve nor dead models are on the table.
- markers[]: { id, kind: "tunnel"|"deep-strike"|"objective"|"note", x, y, d (diameter in mm), ring (inches from its edge), label }. Markers don't block movement.
- armies.friendly / armies.hostile: name, colour, side ("blue" or "red"), roster (the format above).
- games[] and game (the id of the open game, or null): a recorded game. See GAMES below.
- mapId, mode ("stop" or "flag"), coh (coherency settings), eng (engagement range in inches), ring, los (line-of-sight settings: on, watch (unit keys like "hostile:LYS"), range in inches with 0 for any, areas, partial).
- table (read-only, describes the table, ignored when I load a board):
    table.zones[]       { owner: "red"|"blue", poly: [[x,y],...] }
    table.objectives[]  { role: "home"|"centre"|"expansion", owner (home only), x, y }. These are marker centres; the marker size isn't in the data, so assume 40 mm and say so.
    table.terrain[]     { id, name, kind: "area"|"wall", collision: "allow"|"block", poly, area (for walls, the area they belong to) }
  This includes any terrain edits I made, so you don't need a screenshot.

GAMES (a board can hold recorded games; I save a step at the end of each phase)
- game: { id, name, attacker: "friendly"|"hostile", rounds: 5, phases: ["Command", "Movement", "Shooting", "Charge", "Fight"], armies (names, colours, sides and rosters when the game started), roster, vp (the score now), steps[] }.
- roster: { [base id]: { u, army, label, w, h, shape?, maxW? } } for every model in the game.
- steps[]: { round, turn: "attacker"|"defender", phase, vp: { friendly, hostile } (the score at that step), note?, models }. Step 0 is deployment (round 0) and lists every model. Every later step lists only the models that changed since the step before.
- A model is [x, y, rot, wounds left] while on the table, or [x, y, rot, wounds, "reserve"|"destroyed"]. Destroyed models keep the position where they were last seen (wounds 0); reserve positions mean nothing.
- To know where everything was at step n, start from step 0 and apply steps 1..n in order, each entry replacing the model's earlier entry. A step's label is "Round 2 · Attacker (name) · Shooting"; each round is the attacker's turn, then the defender's.
- The rules aren't enforced: a step only records where the models were and the score I entered.
- I may paste a game on its own (Game tab → Copy game): { kind: "tabletop-base-planner game", mapId, game, table }. It's the same game object, with the table description; there are no live bases.
- editing (on a board): a step being corrected. The bases on the board then are that step's, and editing.keep holds my board as it was; ignore it.

DRIVING THE PAGE (when you can run code; details and every report field in docs/api.md)
- Set up: planner.setLayout(planner.findLayout('TAH', 'REC', 1)); planner.importList(text, { army: 'friendly', sizes: { 'Chaos Rhino': 'hull 117x74' } }) imports and deploys a list (it refuses and names any unit without a base size); planner.loadBoard(text) loads a board I gave you.
- Move: planner.placeUnit(unit, x, y, { exact: false }) places a unit's centre and reports how far walls pushed it (exact: true refuses instead); planner.moveUnit(unit, dx, dy, { maxInches }) moves in a straight line and stops at the first obstacle; planner.toContact(unit, target, { maxInches }) moves into base contact or reports the gap left.
- Ask: planner.measure(a, b) gives base-edge distance and whether the line crosses a wall; planner.seen(unit, { by: 'hostile' }) gives visibility; planner.check() lists illegal positions, coherency problems and engaged pairs. Run check() after every change and fix anything illegal unless I asked for it.
- Record: planner.getBoard() for board text, planner.image({ caption }) for a picture (with the runner, ctx.save(name, { caption }) writes both).
- Reserves and markers: planner.toReserve(unit), planner.arrive(unit, x, y, { exact: false }); planner.addMarker({ kind: 'tunnel', x, y, label, ring_in }), and measure from 'marker:<id>'.
- Casualties: planner.wound(id, n), planner.destroy(unitOrId), planner.restore(unitOrId).
- Games: planner.startGame({ attacker, phases }) starts one from the current positions; planner.saveStep({ note, vp: { friendly, hostile } }) saves the phase shown by planner.game() and moves on; planner.setVP(army, n).
- Units are keys like "friendly:LUC"; planner.units() lists them with where they are and their Move from the data (move_in). Each change is one undo step (planner.undo()).

WHAT I'D LIKE FROM YOU
1. Treat a pasted board as the exact state of the table. Give distances base edge to base edge, in inches to one decimal, and name the two bases each runs between, e.g. "FB2 model 3 to AT model 7: 14.2 inches". Say when terrain would bend a straight line.
2. To suggest a deployment, send board text back with only the bases' x, y and rot changed. Keep the same ids, labels and unit keys, keep every unit together and inside my zone, and leave "table" out or unchanged. I load it with Save tab → Load from text, which replaces the whole board, so I can undo if it's wrong.
3. Mark every rule claim with how confident you are. My mission app or physical card beats everything else.
4. Tell me when the planner's data looks wrong (a base size, a layout, a model count). The layouts come from 40kdc-data and are marked "pre-launch provisional" there.

KNOWN LIMITS
- Line of sight is top-down: no terrain heights. There's no objective control, and moves aren't checked against a unit's Move (use maxInches and move_in yourself). Deep strike and reserve distances aren't enforced.
- Boards are saved in my browser only. If I say a board is missing, it's probably on another device.
```
