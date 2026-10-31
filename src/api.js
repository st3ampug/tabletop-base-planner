import { IN, DC, $ } from './core.js';
import { MAPS } from './maps.js';
import { MARKER_KINDS, S, M, T, sel, setSel, pushUndo, applyState, save, saveNow, PR, savePrefs, snapshot } from './state.js';
import { rad, extents, isHull, basePoly, blockers, edgeDist, cohIssues, segCross, pip, engagedPairs, baseHitsBase } from './geometry.js';
import { isSeen } from './sight.js';
import { fit, dirty, boardImage } from './render.js';
import { renderInspector, setMap } from './ui/panel.js';
import { parseRoster, deployUnit, footprint, renderArmies, whereIs, toReserve, arrive } from './armies.js';
import { readList, rememberSizes, moveOf } from './import.js';
import { addMarker } from './ui/markers.js';
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
  const mk = /^marker:(\d+)$/.exec(String(ref)); if (mk){ const m = S.markers.find(x => +x.id === +mk[1]); return m ? [{ id: 'marker:' + m.id, label: m.label || m.kind, x: m.x, y: m.y, w: m.d, h: m.d, rot: 0 }] : []; }
  if (typeof ref === 'number' || /^\d+$/.test(String(ref))){ const b = S.bases.find(x => +x.id === +ref); return b ? [b] : []; }
  if (ARMY_KEYS.indexOf(ref) >= 0) return S.bases.filter(b => b.army === ref);
  return S.bases.filter(b => b.u === ref);
}
function needUnit(u){ const G = refBases(u); if (!G.length) throw new Error('No unit or base "' + u + '". Use planner.units() to list them.'); return G; }
const centre = G => [G.reduce((a, b) => a + b.x, 0)/G.length, G.reduce((a, b) => a + b.y, 0)/G.length];
const baseInfo = b => ({ id: b.id, label: b.label, u: b.u || null });
function changed(){ save(); renderArmies(); renderInspector(); dirty(); }
// Collisions for a whole unit, ignoring its own models. Always checks bases against bases, whatever the Rules tab says.
// Base against base is tested both ways round (ovals and hulls are compared against the other base's outline, which isn't
// symmetric), so anything this accepts, check() accepts too. opt.walls === false leaves out terrain (moving through walls).
function unitBlockers(G, dx, dy, turn, origin, opt){
  const ign = new Set(G), out = [], c = Math.cos(rad(turn || 0)), s = Math.sin(rad(turn || 0)), walls = !opt || opt.walls !== false, all = new Set(S.bases);
  for (const b of G){
    let x = b.x + dx, y = b.y + dy; const rot = (b.rot + (turn || 0) + 360) % 360;
    if (turn){ const ox = b.x - origin[0], oy = b.y - origin[1]; x = origin[0] + ox*c - oy*s + dx; y = origin[1] + ox*s + oy*c + dy; }
    const e = extents(b, rad(rot));
    if (x < e[0] - 0.01 || y < e[1] - 0.01 || x > M.W - e[0] + 0.01 || y > M.H - e[1] + 0.01){ out.push({ base: baseInfo(b), by: 'board edge' }); continue; }
    if (walls) for (const h of blockers(b, x, y, rot, all, false)) out.push({ base: baseInfo(b), by: h });
    const ghost = Object.assign({}, b, { x, y, rot });
    for (const o of S.bases){ if (ign.has(o)) continue;
      if (baseHitsBase(b, x, y, rad(rot), o) || baseHitsBase(o, o.x, o.y, rad(o.rot), ghost)){ out.push({ base: baseInfo(b), by: o.label ? 'base ' + o.label : 'another base' }); break; } }
  }
  return out;
}
// Tries a move without keeping it: applies it, runs fn, puts every base back. No undo step, no save.
function trial(G, fn){ const keep = G.map(b => [b, b.x, b.y, b.rot]); try { return fn(); } finally { for (const [b, x, y, r] of keep){ b.x = x; b.y = y; b.rot = r; } } }
// Along a straight line: the furthest fraction (0..1) the unit can go. With walls off, the path only has to avoid models and
// the board edge, and the end spot must still be fully legal, so it steps back from the furthest clear point until it is.
function furthest(G, tx, ty, throughWalls){
  const path = m => unitBlockers(G, tx*m, ty*m, 0, null, { walls: !throughWalls }).length;
  // Walk the line in 5 mm steps so a thin wall or a small base can't be jumped over, then refine the first blocked step.
  const len = Math.hypot(tx, ty) || 1, n = Math.max(1, Math.ceil(len/5));
  let lo = 0, hi = 1;
  for (let k = 1; k <= n; k++){ const m = k/n; if (path(m)){ hi = m; break; } lo = m; }
  if (lo < 1) for (let i = 0; i < 16; i++){ const m = (lo + hi)/2; if (path(m)) hi = m; else lo = m; }
  if (!throughWalls) return lo;
  const step = 1/len;
  for (let m = lo; m > 0; m -= step) if (!unitBlockers(G, tx*m, ty*m).length) return m;
  return 0;
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
  const out = {}, res = {};
  for (const b of S.bases) if (b.u && (!army || b.army === army)) (out[b.u] = out[b.u] || []).push(b);
  for (const b of S.reserve) if (b.u && (!army || b.army === army)) (res[b.u] = res[b.u] || []).push(b);
  const list = Object.keys(out).map(u => { const G = out[u], c = centre(G), key = u.slice(u.indexOf(':') + 1);
    const un = parseRoster(S.armies[G[0].army].roster).units.find(x => x.key === key);
    return { u, army: G[0].army, name: un ? un.name : key, where: 'table', models: G.length, move_in: moveOf(u), centre: { x: Math.round(c[0]*10)/10, y: Math.round(c[1]*10)/10 },
      bases: G.map(b => ({ id: b.id, label: b.label, w: b.w, h: b.h, shape: b.shape || (b.w === b.h ? 'round' : 'oval'), x: b.x, y: b.y, rot: b.rot })) }; });
  return list.concat(Object.keys(res).map(u => { const G = res[u], key = u.slice(u.indexOf(':') + 1), un = parseRoster(S.armies[G[0].army].roster).units.find(x => x.key === key);
    return { u, army: G[0].army, name: un ? un.name : key, where: 'reserve', models: G.length, move_in: moveOf(u), centre: null,
      bases: G.map(b => ({ id: b.id, label: b.label, w: b.w, h: b.h, shape: b.shape || (b.w === b.h ? 'round' : 'oval') })) }; }));
}
// Reserves: take a unit off the table (or put an undeployed roster unit straight into reserve), and bring it back.
function apiToReserve(u){
  const i = String(u).indexOf(':'), army = String(u).slice(0, i), key = String(u).slice(i + 1);
  if (ARMY_KEYS.indexOf(army) < 0) return { ok: false, error: 'Use a unit key like "friendly:LUC"' };
  const un = parseRoster(S.armies[army].roster).units.find(x => x.key === key); if (!un) return { ok: false, error: 'No unit "' + u + '" in the ' + army + ' roster' };
  if (whereIs(u) === 'reserve') return { ok: true, already: true };
  pushUndo(); toReserve(army, un, true); changed(); return { ok: true };
}
function apiArrive(u, x, y, opts){
  const o = opts || {}, snap = snapshot(), r = arrive(u, x, y, { exact: o.exact !== false, searchInches: o.searchInches || 6 });
  if (!r.ok) return { ok: false, error: r.error };
  // arrive() finds its spot with the one-way test; re-check both ways round so check() can't call the landing an overlap.
  const placedG = S.bases.filter(b => b.u === u), clash = unitBlockers(placedG, 0, 0);
  if (clash.length){ S.bases = S.bases.filter(b => b.u !== u); S.reserve = S.reserve.concat(placedG); return { ok: false, error: 'No free spot for the unit there', blockers: clash }; }
  pushUndo(snap); changed(); const G = S.bases.filter(b => b.u === u), c = centre(G);
  return { ok: true, placed: { x: Math.round(c[0]*10)/10, y: Math.round(c[1]*10)/10 }, pushed_in: toIn(r.pushed), check: check() };
}
// Markers don't block movement. kind: tunnel, deep-strike, objective or note.
const markerOut = m => ({ id: m.id, ref: 'marker:' + m.id, kind: m.kind, x: m.x, y: m.y, d: m.d, ring_in: m.ring, label: m.label });
function apiMarkers(){ return S.markers.map(markerOut); }
function apiAddMarker(o){
  const p = o || {}; if (!MARKER_KINDS[p.kind]) return { ok: false, error: 'kind must be one of ' + Object.keys(MARKER_KINDS).join(', ') };
  if (!isFinite(p.x) || !isFinite(p.y)) return { ok: false, error: 'Give x and y in mm' };
  pushUndo(); const m = addMarker(p.kind, +p.x, +p.y, p.label); if (p.size_mm) m.d = Math.max(5, Math.min(200, +p.size_mm)); if (p.ring_in) m.ring = Math.max(0, +p.ring_in); changed();
  return Object.assign({ ok: true }, markerOut(m));
}
function apiMoveMarker(id, x, y){ const m = S.markers.find(q => +q.id === +String(id).replace('marker:', '')); if (!m) return { ok: false, error: 'No marker ' + id };
  pushUndo(); m.x = Math.min(Math.max(+x, 0), M.W); m.y = Math.min(Math.max(+y, 0), M.H); changed(); return Object.assign({ ok: true }, markerOut(m)); }
function apiRemoveMarker(id){ const m = S.markers.find(q => +q.id === +String(id).replace('marker:', '')); if (!m) return { ok: false, error: 'No marker ' + id };
  pushUndo(); S.markers = S.markers.filter(q => q !== m); if (sel && sel.m === m) setSel(null); changed(); return { ok: true }; }
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
  rememberSizes(r, res); pushUndo();
  const A = S.armies[army]; A.roster = lines.join('\n'); A.name = (o.name || r.title || A.name).trim();
  S.bases = S.bases.filter(b => b.army !== army); S.reserve = S.reserve.filter(b => b.army !== army); if (sel && sel.b && sel.b.army === army) setSel(null);
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
  if (hit.length) return { ok: false, blockers: hit, placed: null, dryRun: !!o.dryRun };
  const nc = [c[0] + dx, c[1] + dy];
  if (!o.dryRun){ pushUndo(); applyMove(G, dx, dy, turn, c); changed(); }
  return { ok: true, placed: { x: Math.round(nc[0]*10)/10, y: Math.round(nc[1]*10)/10 }, pushed_mm: Math.round(pushed*10)/10, pushed_in: toIn(pushed), blockers: [], dryRun: !!o.dryRun };
}
// Would the unit fit with its centre on (x, y)? Nothing changes. Same as placeUnit(..., { exact: true, dryRun: true }).
function canPlace(u, x, y, opts){ const o = opts || {}; const r = placeUnit(u, x, y, { exact: true, turn: o.turn, dryRun: true }); return { ok: r.ok, blockers: r.blockers }; }
// Moves a unit by (dx, dy) in a straight line, stopping at the first wall, model or board edge, like dragging in "stop" mode.
// opts.throughWalls: the path ignores walls (Infantry and Beasts in 11th edition); models and the board edge still stop it, and
// the end spot must be legal. opts.dryRun: report without moving.
function moveUnit(u, dx, dy, opts){
  const o = opts || {}, G = needUnit(u), want = Math.hypot(dx, dy);
  let f = 1; if (o.maxInches !== undefined && want > o.maxInches*IN) f = o.maxInches*IN/want;
  const tx = dx*f, ty = dy*f, start = unitBlockers(G, 0, 0);
  const lo = start.length ? 1 : furthest(G, tx, ty, !!o.throughWalls);
  const stoppedBy = lo < 1 ? unitBlockers(G, tx*Math.min(1, lo + 1e-3 + 1/(Math.hypot(tx, ty) || 1)), ty*Math.min(1, lo + 1e-3 + 1/(Math.hypot(tx, ty) || 1)), 0, null, { walls: !o.throughWalls }) : [];
  if (lo > 0 && !o.dryRun){ pushUndo(); applyMove(G, tx*lo, ty*lo); changed(); }
  const moved = Math.hypot(tx*lo, ty*lo);
  return { ok: lo === 1 && f === 1, moved_in: toIn(moved), moved_mm: Math.round(moved*10)/10, requested_in: toIn(want), limitedByMax: f < 1, stoppedBy, startedIllegal: start,
    throughWalls: !!o.throughWalls, dryRun: !!o.dryRun };
}
function closestPair(A, B){
  let best = null;
  for (const a of A) for (const b of B){ const d = edgeDist(a, b); if (!best || d < best.d) best = { a, b, d }; }
  return best;
}
// Moves a unit straight at the closest model of the target until base contact (within 0.5 mm), or as far as it can go.
// opts.maxInches caps the move (a charge roll). opts.within_in counts the move as done when it ends that close (e.g. 1 for a
// charge, which must end within 1"). opts.throughWalls and opts.dryRun work as for moveUnit.
function toContact(u, target, opts){
  const o = opts || {}, G = needUnit(u), Tg = needUnit(target), p = closestPair(G, Tg);
  let vx = p.b.x - p.a.x, vy = p.b.y - p.a.y; const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
  let dist = p.d + 1; if (o.maxInches !== undefined) dist = Math.min(dist, o.maxInches*IN);
  const lo = dist > 0 ? furthest(G, vx*dist, vy*dist, !!o.throughWalls)*dist : 0;
  const blocking = lo < dist ? unitBlockers(G, vx*Math.min(dist, lo + 1), vy*Math.min(dist, lo + 1), 0, null, { walls: !o.throughWalls }) : [];
  const measureAfter = () => closestPair(G, Tg);
  let after;
  if (o.dryRun) after = trial(G, () => { applyMove(G, vx*lo, vy*lo); const a = measureAfter(); return { a: a.a, b: a.b, d: a.d }; });
  else { if (lo > 0){ pushUndo(); applyMove(G, vx*lo, vy*lo); changed(); } after = measureAfter(); }
  const reach = Math.max(0.5, (o.within_in || 0)*IN), done = after.d <= reach;
  const others = blocking.filter(h => !Tg.some(b => h.by === (b.label ? 'base ' + b.label : 'another base')));
  return { ok: done, gap_in: toIn(after.d), gap_mm: Math.round(after.d*10)/10, moved_in: toIn(lo), from: baseInfo(after.a), to: baseInfo(after.b),
    blockers: done ? [] : others, targetIds: Tg.map(b => b.id), throughWalls: !!o.throughWalls, dryRun: !!o.dryRun };
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
  const engagement = engagedPairs().map(p => ({ a: p.a.u || p.a.id, b: p.b.u || p.b.id, inches: toIn(p.d), mm: Math.round(p.d*10)/10, from: baseInfo(p.a), to: baseInfo(p.b) }));
  const reserve = [...new Set(S.reserve.map(b => b.u))];
  return { ok: !illegal.length && !coherency.length, illegal, coherency, engagement, engagementRange_in: S.eng === undefined ? 1 : S.eng, reserve };
}
function image(opts){ const o = opts || {}; return boardImage(o.pxPerInch || 16, o.caption || ''); }
function undoLast(){ const b = $('btn-undo'); if (b.disabled) return { ok: false, error: 'Nothing to undo' }; b.click(); return { ok: true }; }

const planner = Object.freeze({ version: API_VERSION, getBoard: wrap(getBoard), loadBoard: wrap(loadBoard), layouts: wrap(layouts), findLayout: wrap(findLayout),
  setLayout: wrap(setLayout), units: wrap(units), importList: wrap(importList), placeUnit: wrap(placeUnit), moveUnit: wrap(moveUnit), toContact: wrap(toContact),
  measure: wrap(measure), seen: wrap(seen), canPlace: wrap(canPlace), check: wrap(check), image: wrap(image), undo: wrap(undoLast),
  toReserve: wrap(apiToReserve), arrive: wrap(apiArrive), markers: wrap(apiMarkers), addMarker: wrap(apiAddMarker), moveMarker: wrap(apiMoveMarker), removeMarker: wrap(apiRemoveMarker) });
window.planner = planner;

export { planner };
