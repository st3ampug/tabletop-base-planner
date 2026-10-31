import { IN } from '../core.js';
import { S, sel, setSel } from '../state.js';
import { dirty, tag } from '../render.js';
import { renderInspector } from './panel.js';
import { openGame, resolveStep } from '../game.js';
import { renderGame } from './game.js';

/* ---------- replay: a read-only view of a game's saved steps ----------
   While a step is shown, the board draws that step's models instead of the live ones (draw() swaps them in and back),
   so rings, coherency, engagement and sight all work on the step. Nothing on the live board changes. Any change to the
   live board (anything that makes an undo step) ends the replay. */
let RP = null;          // { g, n, t } — step n shown; t < 1 while moving from step n-1 to step n
let playT = 0, animT = 0;
const replayOn = () => !!RP;
const replayStep = () => RP ? RP.n : null;
const MOVE_MS = 800, HOLD_MS = 450;
function colourOf(g, army){ return ((S.armies[army] || g.armies[army] || {}).colour) || '#888'; }
function baseOf(g, id, m){ const r = g.roster[id], b = { id: +id, w: r.w, h: r.h, x: m[0], y: m[1], rot: m[2], colour: colourOf(g, r.army), label: r.label, army: r.army, u: r.u };
  if (r.shape) b.shape = r.shape; if (r.maxW) b.maxW = r.maxW; if (m[3] < (r.maxW || 1)) b.wounds = m[3]; return b; }
const onTable = m => m && !m[4];
// The models to draw: step n, or part of the way from step n-1 to n while playing.
function replayBases(){
  const g = RP.g, B = resolveStep(g, RP.n), A = RP.n ? resolveStep(g, RP.n - 1) : null, t = RP.t, out = [];
  for (const id in B){ if (!g.roster[id]) continue; const b = B[id], a = A && A[id];
    if (t >= 1 || !a){ if (onTable(b)) out.push(baseOf(g, id, b)); continue; }
    if (onTable(a) && onTable(b)){ let dr = ((b[2] - a[2] + 540) % 360) - 180; out.push(baseOf(g, id, [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t, a[2] + dr*t, t < 0.5 ? a[3] : b[3]])); }
    else if (onTable(b) ? t >= 0.5 : (onTable(a) && t < 0.5)) out.push(baseOf(g, id, onTable(b) ? b : a));
  }
  return out;
}
// Under the bases: faded outlines of models destroyed by this step, and a line from where each moved model was at the step before.
function drawReplayUnder(ctx, px){
  const g = RP.g, B = resolveStep(g, RP.n), A = RP.n ? resolveStep(g, RP.n - 1) : null;
  ctx.save(); ctx.setLineDash([3*px, 3*px]); ctx.lineWidth = 1.4*px;
  for (const id in B){ const m = B[id], r = g.roster[id]; if (!r || m[4] !== 'destroyed' || !(m[0] || m[1])) continue;
    ctx.beginPath(); ctx.ellipse(m[0], m[1], r.w/2, r.h/2, m[2]*Math.PI/180, 0, 2*Math.PI); ctx.fillStyle = 'rgba(30,30,30,.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(30,30,30,.55)'; ctx.stroke(); }
  ctx.setLineDash([]);
  if (A) for (const id in g.steps[RP.n].models){ const a = A[id], b = B[id]; if (!onTable(a) || !onTable(b) || Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) continue;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineWidth = 3.2*px; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.stroke(); ctx.lineWidth = 1.8*px; ctx.strokeStyle = colourOf(g, g.roster[id].army); ctx.stroke(); }
  ctx.restore();
}
// Over the bases: each unit that moved gets its longest model move, in inches.
function drawReplayOver(){
  if (!RP.n || RP.t < 1) return; const g = RP.g, B = resolveStep(g, RP.n), A = resolveStep(g, RP.n - 1), units = {};
  for (const id in g.steps[RP.n].models){ const a = A[id], b = B[id], r = g.roster[id]; if (!r || !r.u || !onTable(a) || !onTable(b)) continue;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d < 1) continue; const U = units[r.u] = units[r.u] || { d: 0, x: 0, y: 0, n: 0 };
    U.d = Math.max(U.d, d); U.x += b[0]; U.y += b[1]; U.n++; }
  for (const u in units){ const U = units[u]; tag(u.split(':')[1] + ' ' + (U.d/IN).toFixed(1) + '"', U.x/U.n, U.y/U.n - 12); }
}
function showStep(n, animate){
  const g = openGame(); if (!g || S.editing) return false; cancelAnimationFrame(animT);
  n = Math.max(0, Math.min(g.steps.length - 1, n)); if (sel) setSel(null);
  RP = { g, n, t: animate && n > 0 ? 0 : 1 }; renderInspector(); renderGame(); dirty();
  if (RP.t < 1){ const t0 = performance.now(); const tick = now => { if (!RP) return; RP.t = Math.min(1, (now - t0)/MOVE_MS); dirty(); if (RP.t < 1) animT = requestAnimationFrame(tick); }; animT = requestAnimationFrame(tick); }
  return true;
}
function stopReplay(){ if (!RP) return; clearTimeout(playT); cancelAnimationFrame(animT); RP = null; renderGame(); dirty(); }
const playing = () => !!(RP && RP.playing);
// Play: moves through the steps from the one shown (from the start if the last one is shown), and stops at the last.
function play(){
  const g = openGame(); if (!g || S.editing) return;
  if (playing()){ clearTimeout(playT); RP.playing = false; renderGame(); return; }
  let n = RP && RP.n < g.steps.length - 1 ? RP.n : 0; showStep(n); RP.playing = true; renderGame();
  const next = () => { if (!RP || !RP.playing) return; if (RP.n >= g.steps.length - 1){ RP.playing = false; renderGame(); return; }
    showStep(RP.n + 1, true); RP.playing = true; renderGame(); playT = setTimeout(next, MOVE_MS + HOLD_MS); };
  playT = setTimeout(next, HOLD_MS);
}

export { replayOn, replayStep, replayBases, drawReplayUnder, drawReplayOver, showStep, stopReplay, play, playing };
