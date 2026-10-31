import { S, pushUndo, save } from './state.js';

/* ---------- games: rounds, phases and saved steps (docs/spec-rounds-and-replay.md) ----------
   A game belongs to the board (S.games) and records where every model was at the end of each phase.
   Step 0 is deployment and holds every model; each later step holds only the models that changed.
   A model is [x, y, rot, wounds] on the table, with a fifth field 'reserve' or 'destroyed' otherwise.
   Destroyed models keep their last position, for replay. Positions are rounded to 0.1 mm. */
const DEFAULT_PHASES = ['Command', 'Movement', 'Shooting', 'Charge', 'Fight'];
const GAME_ROUNDS = 5;
const gr1 = v => Math.round(v*10)/10;
const openGame = () => S.game ? S.games.find(g => g.id === S.game) || null : null;
const nameOf = (g, army) => (g.armies[army] || {}).name || army;
const defenderOf = g => g.attacker === 'friendly' ? 'hostile' : 'friendly';
// Which army plays a turn: the attacker first in every round.
const armyOfTurn = (g, turn) => turn === 'attacker' ? g.attacker : defenderOf(g);
function stepLabel(g, st){
  if (!st.round) return 'Deployment';
  return 'Round ' + st.round + ' · ' + (st.turn === 'attacker' ? 'Attacker' : 'Defender') + ' (' + nameOf(g, armyOfTurn(g, st.turn)) + ') · ' + st.phase;
}
// The phase after the last saved step, or null once the last round is over.
function nextSlot(g){
  const last = g.steps[g.steps.length - 1];
  if (!last || !last.round) return { round: 1, turn: 'attacker', phase: g.phases[0] };
  const i = g.phases.indexOf(last.phase);
  if (i >= 0 && i < g.phases.length - 1) return { round: last.round, turn: last.turn, phase: g.phases[i + 1] };
  if (last.turn === 'attacker') return { round: last.round, turn: 'defender', phase: g.phases[0] };
  return last.round < g.rounds ? { round: last.round + 1, turn: 'attacker', phase: g.phases[0] } : null;
}
const totalSteps = g => 1 + g.rounds*2*g.phases.length;
function modelOf(b, state){ const w = b.wounds !== undefined ? b.wounds : (b.maxW || 1);
  return state ? [gr1(b.x), gr1(b.y), Math.round(b.rot || 0), w, state] : [gr1(b.x), gr1(b.y), Math.round(b.rot || 0), w]; }
function rosterEntry(b){ const o = { u: b.u, army: b.army, label: b.label, w: b.w, h: b.h }; if (b.shape === 'hull') o.shape = 'hull'; if (b.maxW > 1) o.maxW = b.maxW; return o; }
// Every model of the game as it stands now on the board. Models of the game that are no longer anywhere are destroyed where they last stood.
function liveModels(g, prev){
  const out = {};
  for (const b of S.bases){ if (!g.roster[b.id]) g.roster[b.id] = rosterEntry(b); out[b.id] = modelOf(b); }
  for (const b of S.reserve){ if (!g.roster[b.id]) g.roster[b.id] = rosterEntry(b); out[b.id] = [0, 0, 0, b.wounds !== undefined ? b.wounds : (b.maxW || 1), 'reserve']; }
  for (const id in g.roster) if (!out[id]){ const p = prev && prev[id]; out[id] = p ? (p[4] === 'destroyed' ? p : [p[0], p[1], p[2], 0, 'destroyed']) : [0, 0, 0, 0, 'destroyed']; }
  return out;
}
// The full position of every model at step n: step 0 with the changes of steps 1..n applied. Cached per game.
const RESOLVED = new WeakMap();
function resolveStep(g, n){
  let c = RESOLVED.get(g); if (!c || c.len !== g.steps.length){ c = { len: g.steps.length, at: [] }; RESOLVED.set(g, c); }
  if (c.at[n]) return c.at[n];
  let k = n; while (k > 0 && !c.at[k - 1]) k--;
  let cur = k > 0 ? c.at[k - 1] : null;
  for (let i = k; i <= n; i++){ cur = Object.assign({}, cur || {}, g.steps[i].models); c.at[i] = cur; }
  return cur;
}
function startGame(opts){
  const o = opts || {};
  if (!S.bases.length && !S.reserve.length) return { ok: false, error: 'Deploy the armies first: the positions when the game starts are step 0.' };
  const attacker = o.attacker === 'friendly' || o.attacker === 'hostile' ? o.attacker : (S.armies.hostile.side === 'red' ? 'hostile' : 'friendly');
  const phases = (Array.isArray(o.phases) ? o.phases : DEFAULT_PHASES).map(p => String(p).trim().slice(0, 24)).filter(Boolean);
  if (!phases.length) return { ok: false, error: 'A game needs at least one phase.' };
  pushUndo();
  const armies = {}; for (const k of ['friendly', 'hostile']){ const A = S.armies[k]; armies[k] = { name: A.name, colour: A.colour, side: A.side, roster: A.roster }; }
  const g = { id: 'g' + Date.now().toString(36), name: String(o.name || (S.armies.friendly.name + ' vs ' + S.armies.hostile.name)).slice(0, 60), created: new Date().toISOString().slice(0, 10),
    mapId: S.mapId, attacker, rounds: GAME_ROUNDS, phases, armies, roster: {}, vp: { friendly: 0, hostile: 0 }, steps: [] };
  g.steps.push({ round: 0, phase: 'Deployment', vp: { friendly: 0, hostile: 0 }, models: liveModels(g, null) });
  S.games.push(g); S.game = g.id; save();
  return { ok: true, game: gameSummary(g) };
}
function saveStep(opts){
  const g = openGame(); if (!g) return { ok: false, error: 'No game is open. Start one in the Game tab.' };
  const slot = nextSlot(g); if (!slot) return { ok: false, error: 'The game is over: all ' + g.rounds + ' rounds are saved.' };
  pushUndo();
  const prev = resolveStep(g, g.steps.length - 1), now = liveModels(g, prev), diff = {};
  for (const id in now) if (!prev[id] || JSON.stringify(prev[id]) !== JSON.stringify(now[id])) diff[id] = now[id];
  const st = Object.assign(slot, { vp: { friendly: g.vp.friendly, hostile: g.vp.hostile }, models: diff });
  const note = opts && opts.note ? String(opts.note).slice(0, 200) : ''; if (note) st.note = note;
  g.steps.push(st); save();
  return { ok: true, step: g.steps.length - 1, label: stepLabel(g, st), changed: Object.keys(diff).length, next: nextSlot(g) ? stepLabel(g, nextSlot(g)) : null };
}
// Take the last saved step off the game (the board stays as it is). Step 0 stays.
function dropStep(){ const g = openGame(); if (!g || g.steps.length < 2) return false; pushUndo(); g.steps.pop(); save(); return true; }
function setVP(army, v){ const g = openGame(); if (!g || !(army in g.vp)) return false; pushUndo(); g.vp[army] = Math.max(0, Math.min(999, Math.round(+v) || 0)); save(); return true; }
// Put the board back to step n of a game: models on the table where they were, reserves in reserve, destroyed models off the board.
function applyStep(g, n){
  const at = resolveStep(g, n), onT = [], res = [];
  for (const id in at){ const r = g.roster[id], m = at[id]; if (!r) continue;
    const b = { id: +id, w: r.w, h: r.h, x: m[0], y: m[1], rot: m[2], colour: ((S.armies[r.army] || g.armies[r.army] || {}).colour) || '#a8348f', label: r.label, army: r.army, u: r.u };
    if (r.shape) b.shape = r.shape; if (r.maxW) b.maxW = r.maxW; if (m[3] !== (r.maxW || 1)) b.wounds = m[3];
    if (!m[4]) onT.push(b); else if (m[4] === 'reserve'){ b.x = 0; b.y = 0; res.push(b); } }
  S.bases = S.bases.filter(b => !b.u && !g.roster[b.id]).concat(onT); S.reserve = res;
  S.nextId = Math.max(S.nextId, 1 + Math.max(0, ...Object.keys(g.roster).map(Number)));
}
function gameSummary(g){
  const nx = nextSlot(g);
  return { id: g.id, name: g.name, open: S.game === g.id, attacker: g.attacker, phases: g.phases.slice(), rounds: g.rounds, vp: Object.assign({}, g.vp),
    steps: g.steps.map((st, i) => ({ step: i, label: stepLabel(g, st), vp: Object.assign({}, st.vp), changed: i ? Object.keys(st.models).length : undefined, note: st.note })),
    next: nx ? stepLabel(g, nx) : null, of: totalSteps(g) };
}
// Board loading: keep games that have the expected shape, drop anything else.
function cleanGames(list){
  return (Array.isArray(list) ? list : []).filter(g => g && typeof g.id === 'string' && Array.isArray(g.steps) && g.steps.length && g.roster && typeof g.roster === 'object').map(g => ({
    id: g.id, name: String(g.name || 'Game').slice(0, 60), created: g.created, mapId: g.mapId, attacker: g.attacker === 'hostile' ? 'hostile' : 'friendly',
    rounds: Math.max(1, Math.min(9, +g.rounds || GAME_ROUNDS)), phases: Array.isArray(g.phases) && g.phases.length ? g.phases.map(String) : DEFAULT_PHASES.slice(),
    armies: g.armies || {}, roster: g.roster, vp: { friendly: +(g.vp && g.vp.friendly) || 0, hostile: +(g.vp && g.vp.hostile) || 0 },
    steps: g.steps.filter(st => st && st.models && typeof st.models === 'object') }));
}

export { DEFAULT_PHASES, openGame, stepLabel, nextSlot, totalSteps, resolveStep, startGame, saveStep, dropStep, setVP, applyStep, gameSummary, cleanGames, armyOfTurn };
