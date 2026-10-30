# Briefing an analysis agent

Paste this into a chat with the agent that breaks down your matchups. It can't open the planner, so you exchange boards with it as text: Save tab → Copy board, then paste the text into the chat. To load a deployment it sends back, paste the text into the Save tab and press "Load from text".

```
I use a deployment planner for 11th-edition 40K. You can't open it, so we exchange the board as JSON text.

THE BOARD JSON
- All positions are in millimetres (25.4 mm = 1"). The origin is the top-left corner and y increases downwards. The board is portrait, 1117.6 × 1524 mm (44" × 60"), with the red (attacker) zone at the top.
- bases[]: w and h are the base size in mm (w ≥ h; w = h for round bases), x and y are the centre, rot is in degrees clockwise and turns the long axis (w), shape "hull" marks a rectangular vehicle hull, u is the unit key (e.g. "friendly:LUC"), and army is "friendly" or "hostile".
- armies.friendly / armies.hostile: name, colour, side ("blue" or "red"), roster (one unit per line: LABEL | name | count @ size [label], e.g. "1 @ 40 LYS, 10 @ 40 TH"; ovals 120x92, vehicles "hull 117x74").
- table (read-only): zones[] { owner, poly }, objectives[] { role: home|centre|expansion, owner, x, y }, and terrain[] { id, name, kind: area|wall, collision: allow|block, poly }. The objective marker size isn't in the data, so assume 40 mm and say so.
- Layouts come from github.com/wn-mitch/40kdc-data (CC BY 4.0).

WHAT I'D LIKE
1. Treat a pasted board as the exact state of the table. Report every distance base edge to base edge, in inches to one decimal, and name the two bases it runs between.
2. When you suggest a deployment, give it back as board JSON with only the bases' x, y and rot changed. Keep every unit together and inside my zone, and leave "table" out or unchanged.
3. Mark every rule claim with how confident you are. My mission app or physical card beats everything else.
4. Say honestly what the board let you be precise about, what was still guesswork, and what feature would help most.
```
