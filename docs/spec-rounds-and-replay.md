# Spec: game rounds, wounds and replay

**Status:** agreed with the owner on 30 October 2026. Built on 31 October 2026: steps 2–6 and 8 (wound data, game model, casualties, replay, game export and import, VP counter). The owner confirmed the default phases are the 11th-edition ones. Next: step 7, reserves, deep strike and transports.

**As built (differences from the plan below):**
- Wounds are written into the roster as an optional token after the label, `1 @ 50 LUC w6`, and bases carry `maxW` (left out when 1). A unit with no Wounds in the data is flagged in the import preview and counts as 1. The Selected tab can correct a model's wounds.
- A model in a step is `[x, y, rot, wounds]` on the table; the state is a fifth field only when it isn't the table (`"reserve"` or `"destroyed"`), which keeps games small. A full 51-step game where all 95 example models move every step is about 100 KB.
- `board.games[]` plus `board.game` (the open game's id). Games are part of the board, so undo covers saving a step.
- The game bar has the phase to play, VP − and +, and Save step; stepping, scrubbing and play come with replay. The Game tab lists the steps and can delete the last step, close the game, and open a closed game (which puts the models back where its last step had them).
- `window.planner` gained `game()`, `startGame()`, `saveStep()`, `setVP()`, `wound()`, `destroy()` and `restore()`.
- Casualties: destroyed models go to `board.dead[]` with their last position, so Restore and the steps both have it. A unit with every model destroyed shows as destroyed in the Armies tab.
- Replay: the bar's ◀ ▶, slider and ▶▶ show saved steps read-only; the far right of the slider is the live board. Trails, the longest move per unit, and faded outlines for destroyed models. Any change that makes an undo step ends replay.
- Correcting a step: "Edit this step" stores the live board in `board.editing` (so a reload can't lose it), puts the board at the step, then rewrites it with either "later steps unchanged" (the next step is rewritten against the new one) or "carry forward" (later steps' changes stay as they were). The step's score can be corrected too.
- Export: Game tab → Copy game gives `{ kind, mapId, game, table }`; Save → Load from text accepts it and adds the game to the board, with its armies and layout, opened at its last step. **Owner:** Balint. **Read first:** `CLAUDE.md`.

## Goal

Record a real game turn by turn (model positions, wounds and casualties), then replay it step by step to review the game or hand it to an analysis AI.

## User stories

1. **Recording:** after deploying both armies, I start a game. At the end of each phase I save a step, and the planner keeps where every model was.
2. **Wounds:** when a model takes damage, I tap it and take wounds off. When it reaches zero, or when I remove it, it is destroyed and leaves the table.
3. **Replay:** I step back and forward through the game, or press play, and see models move between steps with their trails and distances.
4. **Correcting a step:** I can go back to an earlier step, fix a position, and save that step again.
5. **Export:** I can export the whole game as text to give to an analysis AI.

## Game structure (decided)

- **Rounds:** a game has **5 battle rounds**. Each round is the **attacking player's turn, then the defending player's turn**. The attacker is the army whose `side` is `red` at the start of the game; store that choice in the game so swapping sides later doesn't change history.
- **Steps:** each turn is split into **phases**, and a step is saved **per phase**. The phase list is a setting, defaulting to Command, Movement, Shooting, Charge, Fight. The owner confirms the 11th-edition list. Step 0 is deployment.
- **Labels:** each step is labelled `Round 2 · Attacker (Stephen) · Shooting`. "Save step" moves to the next phase, then the next turn, then the next round.
- **Count:** a full game is 1 + 5 × 2 × 5 = 51 steps.

## Model

```
game = {
  id, name, mapId, created, attacker: "friendly"|"hostile",
  phases: ["Command", "Movement", "Shooting", "Charge", "Fight"],
  armies: { friendly, hostile },                         // copied from the board when the game starts
  roster: { [baseId]: { u, label, w, h, shape, maxW } },  // fixed per game
  steps: [
    { round, turn: "attacker"|"defender", phase, note,
      vp: { friendly, hostile },                          // running totals at this step
      models: { [baseId]: [x, y, rot, wounds, state, carrier?] } }  // step 0: every model; later steps: only models that changed
  ]
}
```

- **State per model:** `state` is `table`, `destroyed`, `reserve` or `embarked`. `carrier` is the transport's base id when embarked.
- **Diffs:** step 0 is a full snapshot. Each later step stores **only the models that changed** since the previous step. To show step n, apply diffs 0..n; keep a cache of resolved steps for fast scrubbing.
- **Size budget:** store coordinates rounded to 0.1 mm and use arrays rather than objects per model. **A full 51-step game of about 100 models must export in under 200 KB.** Add a test that generates such a game and checks the size.
- **Storage:** a game belongs to a board (`board.games[]`) and lives in browser storage. Its export reuses the board text conventions (mm, portrait, `table` block).

### Wounds

- **Source:** extend `tools/units_export.py` to include `W` per model from `profiles` in 40kdc-data (`profiles[].name` matches the composition model names). The import then sets `maxW` per base.
- **Missing values:** if `W` is missing, default to 1 and flag it in the import preview, as is done for missing base sizes.
- **Victory points:** each army has a VP counter with − and + in the game bar. The value is saved with every step, so the replay shows the score as it changed. No scoring rules are built in.
- **Display:** wounds show only for models with more than 1 W, as a small pip or ring segment, plus "3/5" in the inspector. Destroyed models disappear from the live view and show as faded outlines in replay.

## Interface

- **Game bar:** a bar under the header while a game is open, reading `Round 2 · Hostile turn · step 4 of 9`, with **◀ ▶ ▶▶ (play)**, a scrub slider and **Save step**.
- **Selected panel:** gains a wounds control (−1, +1, Destroy, Restore).
- **Replay mode is read-only.** Editing is allowed only at the latest step, or explicitly with "Edit this step", which asks whether later steps should keep their positions.
- **Trails:** in replay, each moved model shows a line from its previous position, and the unit shows its largest move in inches. Rings and coherency keep working on the displayed step.

## Reserves, deep strike and transports (decided: keep the guards light)

The owner wants convenience, not rules enforcement. Show distances; don't block moves beyond the existing collision rules.

- **Reserves and deep strike:** the reserve list and markers now exist (`S.reserve`, `S.markers`; see `docs/spec-agent-api.md`), so a game step only needs to record which units are in reserve. Originally specified: units can start in a **reserve tray** beside the board (state `reserve`), chosen per unit before or during deployment. Arriving means placing the unit on the board like any other move: the normal collision with terrain and bases applies and nothing else. As a placement aid, a toggle shades the area within a set distance of enemy models (default 9", with 8" and 6" quick options; the owner confirms the 11th-edition distances). Placement inside the shaded area is allowed but gets an amber warning in the status bar. No board-edge restriction is enforced.
- **Embarking:** at any step, selecting a unit whose models are all within the embark distance of a friendly transport (default 3", a setting) offers **Embark into <transport>**. Its models leave the board (state `embarked`, `carrier` = transport id) and are listed in the transport's inspector. Capacity isn't checked.
- **Disembarking:** **Disembark** puts the unit back next to the transport, using `findSpot` around the hull. A ring shows the disembark distance (default 3", with a 6" option; a setting) and the user drags the unit into place. Models outside the ring get an amber warning, not a block. Battle-shock on disembarking isn't simulated.
- **Destroyed transports:** if a transport is destroyed with units inside, its embarked units are placed with Disembark automatically and highlighted for the user to adjust.
- **Sharing:** exporting a game as text is enough; no shareable link.

## Suggested order

1. **Refactor:** split `src/app.src.html` into modules with no behaviour change (see `CLAUDE.md`). All tests pass.
2. **Wound data:** extend `units_export.py` with `W`, show wounds in the import preview and the inspector, and add tests with the two fixture lists.
3. **Game model:** start a game, save steps, store and reload them. Tests: create a game, save 3 steps, reload the page, and check the steps are intact.
4. **Casualties:** take wounds, destroy and restore, with undo.
5. **Replay:** stepping, scrubbing, play animation and trails.
6. **Export and import of a game:** update `docs/agent-briefing.md` and `README.md`.
7. **Reserves, deep strike and transports** as described above.
8. **VP counter**, which can come earlier since it's small.

## Acceptance

- **Tests:** existing tests pass after every step, and each step adds its own Playwright tests.
- **Size:** a full 51-step game of about 100 models exports in under 200 KB (automated test).
- **Phone:** a full game recorded on a phone (390×844) is usable: the controls reach, nothing scrolls sideways, and play works.
- **Old saves:** boards saved before this feature still load unchanged.
