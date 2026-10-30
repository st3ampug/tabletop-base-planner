# Spec: game rounds, wounds and replay

**Status:** proposed. **Owner:** Balint. **Read first:** `CLAUDE.md`.

## Goal

Record a real game turn by turn (model positions, wounds and casualties), then replay it step by step to review the game or hand it to an analysis AI.

## User stories

1. **Recording:** after deploying both armies, I start a game. At the end of each player turn I save a step, and the planner keeps where every model was.
2. **Wounds:** when a model takes damage, I tap it and take wounds off. When it reaches zero, or when I remove it, it is destroyed and leaves the table.
3. **Replay:** I step back and forward through the game, or press play, and see models move between steps with their trails and distances.
4. **Correcting a step:** I can go back to an earlier step, fix a position, and save that step again.
5. **Export:** I can export the whole game as text to give to an analysis AI.

## Model

```
game = {
  id, name, mapId, created,
  armies: { friendly, hostile },        // copied from the board when the game starts
  roster: { [baseId]: { u, label, w, h, shape, maxW } },   // fixed per game
  steps: [
    { round: 1, player: "friendly"|"hostile", phase: "end"|"movement"|..., note: "",
      models: { [baseId]: { x, y, rot, wounds, state: "table"|"destroyed"|"reserve"|"embarked" } } }
  ]
}
```

- **Step 0** is deployment. Saving a step copies the current board positions into a new step.
- **Snapshots:** store full snapshots, not diffs. About 100 models × 30 steps is well under 1 MB. Compress only if a measurement says it's needed.
- **Storage:** a game belongs to a board (`board.games[]`) and lives in browser storage like boards. A game's export reuses the board text conventions (mm, portrait, `table` block).

### Wounds

- **Source:** extend `tools/units_export.py` to include `W` per model from `profiles` in 40kdc-data (`profiles[].name` matches the composition model names). The import then sets `maxW` per base.
- **Missing values:** if `W` is missing, default to 1 and flag it in the import preview, as is done for missing base sizes.
- **Display:** wounds show only for models with more than 1 W, as a small pip or ring segment, plus "3/5" in the inspector. Destroyed models disappear from the live view and show as faded outlines in replay.

## Interface

- **Game bar:** a bar under the header while a game is open, reading `Round 2 · Hostile turn · step 4 of 9`, with **◀ ▶ ▶▶ (play)**, a scrub slider and **Save step**.
- **Selected panel:** gains a wounds control (−1, +1, Destroy, Restore).
- **Replay mode is read-only.** Editing is allowed only at the latest step, or explicitly with "Edit this step", which asks whether later steps should keep their positions.
- **Trails:** in replay, each moved model shows a line from its previous position, and the unit shows its largest move in inches. Rings and coherency keep working on the displayed step.

## Open questions (decide before building)

1. **Step size:** one step per player turn, or per phase (Movement, Charge, Fight)? Suggestion: per turn by default, with optional extra steps.
2. **Reserves and deep strike:** do models start off the table? Suggestion: a `reserve` state shown in a tray beside the board, placed when they arrive.
3. **Transports:** suggestion: an `embarked` state linked to the transport's id, with the models hidden and listed in the transport's inspector.
4. **Scoring:** record VP per turn? It's cheap to add to steps and useful for the analysis AI.
5. **Sharing:** should a game export be loadable on another device as text (yes), and should there be a shareable link? A link isn't possible without a server unless the game is encoded in the URL, which is long.

## Suggested order

1. **Refactor:** split `src/app.src.html` into modules with no behaviour change (see `CLAUDE.md`). All tests pass.
2. **Wound data:** extend `units_export.py` with `W`, show wounds in the import preview and the inspector, and add tests with the two fixture lists.
3. **Game model:** start a game, save steps, store and reload them. Tests: create a game, save 3 steps, reload the page, and check the steps are intact.
4. **Casualties:** take wounds, destroy and restore, with undo.
5. **Replay:** stepping, scrubbing, play animation and trails.
6. **Export and import of a game:** update `docs/agent-briefing.md` and `README.md`.
7. **Reserves and transports**, once the owner answers questions 2 and 3.

## Acceptance

- **Tests:** existing tests pass after every step, and each step adds its own Playwright tests.
- **Phone:** a full game recorded on a phone (390×844) is usable: the controls reach, nothing scrolls sideways, and play works.
- **Old saves:** boards saved before this feature still load unchanged.
