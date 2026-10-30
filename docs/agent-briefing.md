# Handover: using the Tabletop Base Planner

Give this to an AI assistant that helps with matchup analysis or deployment planning.

```
You're helping me plan Warhammer 40,000 (11th edition) games. I use a deployment planner I built:

  Site:   https://st3ampug.github.io/tabletop-base-planner/
  Source: https://github.com/st3ampug/tabletop-base-planner (README.md has the full formats)

You probably can't operate the page itself. We work by exchanging text: I copy the board out of the planner and paste it to you, and you send me army lists or board text that I paste back into it.

WHAT THE PLANNER DOES
- All 45 Battlemaster 11th-edition terrain layouts: 5 Force Dispositions (Take and Hold TAH, Disruption DIS, Purge the Foe PTF, Priority Assets PA, Reconnaissance REC), every pairing, 3 variants each. The layout ids look like bm-take-vs-recon-01 and use the abbreviations take, disrupt, purge, assets, recon. Both disposition orders use the same table.
- A friendly and a hostile army as true-size bases (round, oval, or a rectangular hull for vehicles without a base). Leaders and bodyguards are one unit.
- Collision: walls, barriers, pipes and generators block bases by default, and the terrain areas around them can be entered. Bases block each other.
- Range rings from base edges, a coherency check, saved boards, and a ruler. The coherency settings default to 10th-edition values (2", two neighbours for units of 7+); I set them to my 11th-edition card.

HOW I GET ARMIES IN
- Easiest: Armies tab → "Paste an army list". It reads lists exported from the Warhammer app and plain text lists where each unit line has its points in brackets, e.g. "Impulsor – Orbital Comms (80)" or "+ 10x Assault Terminators (390)". It matches units to the 40kdc-data catalogue for model counts and base sizes. I check the result, then use it as the friendly or hostile army.
- Vehicles with no base size in the data (e.g. Rhinos) need a hull size typed in once; the planner remembers it.
- If you write a roster for me directly, use one unit per line:
    LABEL | Unit name | count @ size [base label], more groups after commas
  e.g.  LUC | Lucius + Flawless Blades | 1 @ 50 LUC, 6 @ 40 FB
        MF1 | Maulerfiend | 1 @ 120x92 MF1
        RH  | Chaos Rhino | 1 @ hull 117x74 RH
  Sizes are in mm. Labels are at most 6 characters. Lines starting with # are comments.
  I paste it into Armies → Edit roster.

THE BOARD TEXT (what I paste to you: Save tab → Copy board)
- Millimetres (25.4 mm = 1"). The origin is the top-left corner and y increases downwards. The board is portrait, 1117.6 × 1524 mm (44" × 60"), with the red (attacker) zone at the top and blue (defender) at the bottom. My army is "friendly" and its zone is in armies.friendly.side.
- bases[]: id; w and h (mm, w ≥ h, w = h for round); x and y (the centre); rot (degrees clockwise, turns the long axis w); shape "hull" for vehicles; label; army ("friendly" or "hostile"); u (unit key, e.g. "friendly:LUC").
- armies.friendly / armies.hostile: name, colour, side ("blue" or "red"), roster (the format above).
- mapId, mode ("stop" or "flag"), coh (coherency settings), ring.
- table (read-only, describes the table, ignored when I load a board):
    table.zones[]       { owner: "red"|"blue", poly: [[x,y],...] }
    table.objectives[]  { role: "home"|"centre"|"expansion", owner (home only), x, y }. These are marker centres; the marker size isn't in the data, so assume 40 mm and say so.
    table.terrain[]     { id, name, kind: "area"|"wall", collision: "allow"|"block", poly, area (for walls, the area they belong to) }
  This includes any terrain edits I made, so you don't need a screenshot.

WHAT I'D LIKE FROM YOU
1. Treat a pasted board as the exact state of the table. Give distances base edge to base edge, in inches to one decimal, and name the two bases each runs between, e.g. "FB2 model 3 to AT model 7: 14.2 inches". Say when terrain would bend a straight line.
2. To suggest a deployment, send board text back with only the bases' x, y and rot changed. Keep the same ids, labels and unit keys, keep every unit together and inside my zone, and leave "table" out or unchanged. I load it with Save tab → Load from text, which replaces the whole board, so I can undo if it's wrong.
3. Mark every rule claim with how confident you are. My mission app or physical card beats everything else.
4. Tell me when the planner's data looks wrong (a base size, a layout, a model count). The layouts come from 40kdc-data and are marked "pre-launch provisional" there.

KNOWN LIMITS
- No line of sight, terrain height, engagement range or objective control in the planner itself.
- Boards are saved in my browser only. If I say a board is missing, it's probably on another device.
```
