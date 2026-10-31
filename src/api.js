import { IN, DC, $ } from './core.js';
import { MAPS } from './maps.js';
import { S, M, T, sel, setSel, pushUndo, applyState, save, saveNow, PR, savePrefs } from './state.js';
import { rad, extents, isHull, basePoly, blockers, edgeDist, cohIssues, segCross, pip } from './geometry.js';
import { isSeen } from './sight.js';
import { fit, dirty, boardImage } from './render.js';
import { renderInspector, setMap } from './ui/panel.js';
import { parseRoster, deployUnit, footprint, renderArmies } from './armies.js';
import { readList } from './import.js';
import { exportText } from './ui/saveload.js';

/* ---------- agent interface ---------- */
// window.planner: the documented, versioned interface for scripts and AI agents (docs/api.md).
// It changes the board the same way the UI does (undo, autosave, redraw) and returns reports instead of failing silently.
// Every position is in millimetres; distances in reports also come in inches. Bump API_VERSION on any breaking change.
const API_VERSION = 1;
const toIn = mm => Math.round(mm/IN*10)/10;
const ARMY_KEYS = ['friendly', 'hostile'];
const DISP_ABBR = { tah:'take-and-hold', dis:'disruption', ptf:'purge-the-foe', pa:'priority-assets', rec:'reconnaissance' };

function refBases(ref){
  if (ref && typeof ref === 'object' && Array.isArray(ref.bases)) return ref.bases;
  if (typeof ref === 'number' || /^\d+$/.test(String(ref))){ const b = S.bases.find(x => +x.id === +ref); return b ? [b] : []; }
  if (ARMY_KEYS.indexOf(ref) >= 0) return S.bases.filter(b => b.army === ref);
  return S.bases.filter(b => b.u === ref);
}
function needUnit(u){ const G = refBases(u); if (!G.length) throw new Error('No unit or base "' + u + '". Use planner.units() to list them.'); return G; }
const centre = G => [G.reduce((a, b) => a + b.x, 0)/G.length, G.reduce((a, b) => a + b.y, 0)/G.length];
const baseInfo = b => ({ id: b.id, label: b.label, u: b.u || null });
function changed(){ save(); renderArmies(); renderInspector(); dirty(); }
// Collisions for a whole unit, ignoring its own models. Always checks bases against bases, whatever the Rules tab says.
function unitBlockers(G, dx, dy, turn, origin){
  const ign = new Set(G), out = [], c = Math.cos(rad(turn || 0)), s = Math.sin(rad(turn || 0));
  for (const b of G){
    let x = b.x + dx, y = b.y + dy; const rot = (b.rot + (turn || 0) + 360) % 360;
    if (turn){ const ox = b.x - origin[0], oy = b.y - origin[1]; x = origin[0] + ox*c - oy*s + dx; y = origin[1] + ox*s + oy*c + dy; }
    const e = extents(b, rad(rot));
    if (x < e[0] - 0.01 || y < e[1] - 0.01 || x > M.W - e[0] + 0.01 || y > M.H - e[1] + 0.01) out.push({ base: baseInfo(b), by: 'board edge' });
    else for (const h of blockers(b, x, y, rot, ign, true)) out.push({ base: baseInfo(b), by: h });
  }
  return out;
}
function applyMove(G, dx, dy, turn, origin){
  const c = Math.cos(rad(turn || 0)), s = Math.sin(rad(turn || 0));
  for (const b of G){
    if (turn){ const ox = b.x - origin[0], oy = b.y - origin[1]; b.x = origin[0] + ox*c - oy*s; b.y = origin[1] + ox*s + oy*c; b.rot = (b.rot + turn + 360) % (isHull(b) ? 360 : 180); }
    b.x += dx; b.y += dy;
  }
}
const wrap = fn => (...a) => { try { return fn(...a); } catch(e){ return { ok: false, error: e.message }; } };

function getBoard(){ return JSON.parse(exportText()); }
function loadBoard(input){
  const o = typeof input === 'string' ? JSON.parse(input) : input;
  if (!o || !Array.isArray(o.bases)) return { ok: false, errors: ['A board needs a "bases" list. Use getBoard() for an example.'] };
  if (o.mapId && !MAPS[o.mapId]) return { ok: false, errors: ['Unknown mapId "' + o.mapId + '". Use planner.layouts() for the ids.'] };
  pushUndo(); applyState(o); setSel(null); fit(); saveNow();
  return { ok: true, errors: [], check: check() };
}
function layouts(){
  return (DC.layouts || []).map(l => ({ id: l.id, you: DC.disp[l.a], opponent: DC.disp[l.b], variant: l.v, deployment: DC.deploy[l.d].n, name: MAPS[l.id].name }));
}
// findLayout('TAH', 'REC', 1) or findLayout('take-and-hold', 'reconnaissance', 1): both orders are the same table.
function findLayout(you, opponent, variant){
  const norm = d => DISP_ABBR[String(d).toLowerCase()] || String(d).toLowerCase().replace(/\s+/g, '-');
  const a = norm(you), b = norm(opponent);
  const l = (DC.layouts || []).find(l => ((l.a === a && l.b === b) || (l.a === b && l.b === a)) && l.v === (+variant || 1));
  return l ? l.id : null;
}
function setLayout(id){
  if (!MAPS[id]) return { ok: false, error: 'Unknown layout "' + id + '". Use planner.layouts() or planner.findLayout(you, opponent, variant).' };
  setMap(id); saveNow(); return { ok: true, id, name: M.name, check: check() };   // bases stay where they were, so some may now overlap the new terrain
}
function units(army){
  const out = {};
  for (const b of S.bases) if (b.u && (!army || b.army === army)) (out[b.u] = out[b.u] || []).push(b);
  return Object.keys(out).map(u => { const G = out[u], c = centre(G), key = u.slice(u.indexOf(':') + 1);
    const un = parseRoster(S.armies[G[0].army].roster).units.find(x => x.key === key);
    return { u, army: G[0].army, name: un ? un.name : key, models: G.length, centre: { x: Math.round(c[0]*10)/10, y: Math.round(c[1]*10)/10 },
      bases: G.map(b => ({ id: b.id, label: b.label, w: b.w, h: b.h, shape: b.shape || (b.w === b.h ? 'round' : 'oval'), x: b.x, y: b.y, rot: b.rot })) }; });
}
// Reads a list like the Armies tab does; applies it as an army and deploys it only when every base has a size.
function importList(text, opts){
  const o = opts || {}, army = o.army || 'friendly', sizes = o.sizes || {};
  if (ARMY_KEYS.indexOf(army) < 0) return { ok: false, error: 'army must be "friendly" or "hostile"' };
  const r = readList(text), report = [];
  for (const g of r.units){
    for (const p of g.parts) if (!p.size){ const s = sizes[p.unitName] || sizes[g.name] || sizes[g.key]; if (s){ p.size = String(s).trim(); p.given = true; } }
    g.bases = g.parts.map(p => p.n + ' @ ' + (p.size || '?') + ' ' + p.label).join(', ');
    const missing = g.parts.filter(p => !p.size).map(p => p.unitName || g.name);
    report.push({ key: g.key, name: g.name, bases: g.bases, matched: g.matched, flags: missing.length ? g.flags : [], missingSize: missing });
  }
  const missing = report.filter(x => x.missingSize.length);
  if (!r.units.length) return { ok: false, error: 'No units found. Each unit line needs its points in brackets, e.g. "Impulsor (80)".', units: [] };
  if (missing.length) return { ok: false, error: 'Some units have no base size. Pass them in opts.sizes, e.g. { "Chaos Rhino": "hull 117x74" }.', units: report };
  const lines = r.units.map(g => g.key + ' | ' + g.name + ' | ' + g.bases), res = parseRoster(lines.join('\n'));
  if (res.errs.length) return { ok: false, error: res.errs.join(' '), units: report };
  r.units.forEach((g, i) => { const one = g.parts.length === 1 ? g.parts[0] : null, ru = res.units[i];
    if (one && one.unitName && (one.hull || one.given) && ru && ru.groups.length === 1){ const z = ru.groups[0];
      PR.sizes[one.unitName] = z.hull ? 'hull ' + z.w + 'x' + z.h : z.w === z.h ? String(z.w) : z.w + 'x' + z.h; } });
  savePrefs(); pushUndo();
  const A = S.armies[army]; A.roster = lines.join('\n'); A.name = (o.name || r.title || A.name).trim();
  S.bases = S.bases.filter(b => b.army !== army); if (sel && sel.b && sel.b.army === army) setSel(null);
  const notInZone = [];
  if (o.deploy !== false) for (const un of res.units.slice().sort((a, b) => footprint(b) - footprint(a))) if (!deployUnit(army, un, true)) notInZone.push(army + ':' + un.key);
  changed(); saveNow();
  return { ok: true, army, name: A.name, faction: r.faction, units: report, deployed: o.deploy !== false, notInZone };
}
// Moves a unit so its centre lands on (x, y). opts.turn turns the whole unit (degrees clockwise) about its centre first.
// exact (the default) refuses rather than sliding; exact: false takes the nearest free spot within opts.searchInches (default 6").
function placeUnit(u, x, y, opts){
  const o = opts || {}, G = needUnit(u), c = centre(G), turn = +o.turn || 0;
  let dx = x - c[0], dy = y - c[1], hit = unitBlockers(G, dx, dy, turn, c), pushed = 0;
  if (hit.length && o.exact === false){
    const lim = (o.searchInches || 6)*IN; let found = null;
    for (let k = 1; !found && k*IN/4 <= lim; k++){ const r = k*IN/4, n = 8 + k*4;
      for (let i = 0; i < n && !found; i++){ const t = i/n*2*Math.PI, ex = dx + r*Math.cos(t), ey = dy + r*Math.sin(t); if (!unitBlockers(G, ex, ey, turn, c).length) found = [ex, ey, r]; } }
    if (found){ dx = found[0]; dy = found[1]; pushed = found[2]; hit = []; }
  }
  if (hit.length) return { ok: false, blockers: hit, placed: null };
  pushUndo(); applyMove(G, dx, dy, turn, c); changed();
  const nc = centre(G);
  return { ok: true, placed: { x: Math.round(nc[0]*10)/10, y: Math.round(nc[1]*10)/10 }, pushed_mm: Math.round(pushed*10)/10, pushed_in: toIn(pushed), blockers: [] };
}
// Moves a unit by (dx, dy) in a straight line, stopping at the first wall, model or board edge, like dragging in "stop" mode.
function moveUnit(u, dx, dy, opts){
  const o = opts || {}, G = needUnit(u), want = Math.hypot(dx, dy);
  let f = 1; if (o.maxInches !== undefined && want > o.maxInches*IN) f = o.maxInches*IN/want;
  const tx = dx*f, ty = dy*f, start = unitBlockers(G, 0, 0);
  let lo = 0, hi = 1;
  if (!unitBlockers(G, tx, ty).length || start.length) lo = 1;
  else for (let i = 0; i < 18; i++){ const m = (lo + hi)/2; if (unitBlockers(G, tx*m, ty*m).length) hi = m; else lo = m; }
  const stoppedBy = lo < 1 ? unitBlockers(G, tx*Math.min(1, hi + 1e-3), ty*Math.min(1, hi + 1e-3)) : [];
  if (lo > 0){ pushUndo(); applyMove(G, tx*lo, ty*lo); changed(); }
  const moved = Math.hypot(tx*lo, ty*lo);
  return { ok: lo === 1 && f === 1, moved_in: toIn(moved), moved_mm: Math.round(moved*10)/10, requested_in: toIn(want), limitedByMax: f < 1, stoppedBy, startedIllegal: start };
}
function closestPair(A, B){
  let best = null;
  for (const a of A) for (const b of B){ const d = edgeDist(a, b); if (!best || d < best.d) best = { a, b, d }; }
  return best;
}
// Moves a unit straight at the closest model of the target until base contact (within 0.5 mm), or as far as it can go.
function toContact(u, target, opts){
  const o = opts || {}, G = needUnit(u), Tg = needUnit(target), p = closestPair(G, Tg);
  let vx = p.b.x - p.a.x, vy = p.b.y - p.a.y; const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
  let dist = p.d + 1; if (o.maxInches !== undefined) dist = Math.min(dist, o.maxInches*IN);
  let lo = 0, hi = dist;
  if (!unitBlockers(G, vx*dist, vy*dist).length) lo = dist;
  else for (let i = 0; i < 22; i++){ const m = (lo + hi)/2; if (unitBlockers(G, vx*m, vy*m).length) hi = m; else lo = m; }
  const blocking = lo < dist ? unitBlockers(G, vx*(lo + 0.3), vy*(lo + 0.3)) : [];
  if (lo > 0){ pushUndo(); applyMove(G, vx*lo, vy*lo); changed(); }
  const after = closestPair(G, Tg), targetIds = new Set(Tg.map(b => b.id));
  const others = blocking.filter(h => !Tg.some(b => h.by === (b.label ? 'base ' + b.label : 'another base')));
  return { ok: after.d <= 0.5, gap_in: toIn(after.d), gap_mm: Math.round(after.d*10)/10, moved_in: toIn(lo), from: baseInfo(after.a), to: baseInfo(after.b),
    blockers: after.d <= 0.5 ? [] : others, targetIds: [...targetIds] };
}
// Base edge to base edge. a and b are base ids, unit keys or "friendly"/"hostile"; for groups, the closest pair.
function measure(a, b){
  const A = needUnit(a), B = needUnit(b), p = closestPair(A, B);
  const walls = T.filter(t => t.kind === 'scenery' && t.collision === 'block');
  const P = [p.a.x, p.a.y], Q = [p.b.x, p.b.y];
  const hit = walls.find(t => pip(P[0], P[1], t.poly) || pip(Q[0], Q[1], t.poly) || t.poly.some((q, i) => segCross(P, Q, t.poly[(i + t.poly.length - 1) % t.poly.length], q)));
  return { inches: toIn(p.d), mm: Math.round(p.d*10)/10, from: baseInfo(p.a), to: baseInfo(p.b), crossesWalls: !!hit, wall: hit ? hit.name : null };
}
// Whether a point, base or unit is visible to the watched units, or to opts.by (unit keys, or "friendly"/"hostile").
function seen(target, opts){
  const o = opts || {}, keep = JSON.stringify(S.los), keepSel = sel;
  let by = o.by; if (typeof by === 'string') by = ARMY_KEYS.indexOf(by) >= 0 ? [...new Set(S.bases.filter(b => b.army === by && b.u).map(b => b.u))] : [by];
  try {
    S.los.on = true; if (by) S.los.watch = by;
    if (!S.los.watch.length) throw new Error('Nothing is watching. Pass opts.by, e.g. { by: "hostile" }.');
    setSel(null);
    let pts;
    if (target && typeof target === 'object' && !Array.isArray(target) && isFinite(target.x)) pts = [[target.x, target.y]];
    else pts = needUnit(target).flatMap(b => [[b.x, b.y]].concat(basePoly(b, b.x, b.y, rad(b.rot), 12)));
    const hits = pts.filter(q => isSeen(q[0], q[1])).length;
    return { ok: true, seen: hits > 0, fraction: Math.round(hits/pts.length*100)/100, by: S.los.watch.slice() };
  } finally { S.los = Object.assign(S.los, JSON.parse(keep)); setSel(keepSel); dirty(); }
}
// Collisions (every base, walls and other bases), coherency (Rules tab settings) and engagement range (Rules tab, default 1").
function check(){
  const illegal = [];
  for (const b of S.bases){ const h = blockers(b, b.x, b.y, b.rot, null, true); if (h.length) illegal.push(Object.assign(baseInfo(b), { blockers: h })); }
  const coherency = []; cohIssues().forEach((set, u) => coherency.push({ u, models: [...set].map(baseInfo) }));
  const engagement = [], lim = (S.eng === undefined ? 1 : S.eng)*IN + 0.01, F = S.bases.filter(b => b.army === 'friendly'), H = S.bases.filter(b => b.army === 'hostile'), seenPair = {};
  for (const a of F) for (const b of H){
    if (Math.hypot(a.x - b.x, a.y - b.y) > Math.max(a.w, a.h, b.w, b.h)*1.5 + lim) continue;
    const d = edgeDist(a, b); if (d > lim) continue;
    const k = (a.u || a.id) + '|' + (b.u || b.id); if (!seenPair[k] || d < seenPair[k].mm) seenPair[k] = { a: a.u || a.id, b: b.u || b.id, inches: toIn(d), mm: Math.round(d*10)/10 };
  }
  for (const k in seenPair) engagement.push(seenPair[k]);
  return { ok: !illegal.length && !coherency.length, illegal, coherency, engagement, engagementRange_in: S.eng === undefined ? 1 : S.eng };
}
function image(opts){ const o = opts || {}; return boardImage(o.pxPerInch || 16, o.caption || ''); }
function undoLast(){ const b = $('btn-undo'); if (b.disabled) return { ok: false, error: 'Nothing to undo' }; b.click(); return { ok: true }; }

const planner = Object.freeze({ version: API_VERSION, getBoard: wrap(getBoard), loadBoard: wrap(loadBoard), layouts: wrap(layouts), findLayout: wrap(findLayout),
  setLayout: wrap(setLayout), units: wrap(units), importList: wrap(importList), placeUnit: wrap(placeUnit), moveUnit: wrap(moveUnit), toContact: wrap(toContact),
  measure: wrap(measure), seen: wrap(seen), check: wrap(check), image: wrap(image), undo: wrap(undoLast) });
window.planner = planner;

export { planner };
