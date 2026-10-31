import { ROUNDS, OVALS, COLOURS, $ } from './core.js';
import { normMap, MAPS, DEFAULT_MAP } from './maps.js';
import { dirty } from './render.js';
import { renderInspector, buildMapSelect, syncRulesUI, renderChips } from './ui/panel.js';
import { renderArmies } from './armies.js';

/* ---------- state ---------- */
const DEFAULT_SIZES = ROUNDS.map(d => [d, d]).concat(OVALS);
const DEFAULT_ARMIES = {
  friendly: { name: 'Children of the Recon', colour: '#a8348f', side: 'blue', roster: [
    "# Label | Unit | bases: count @ size [label], separated by commas",
    "# Sizes in mm: 40 round, 120x92 oval, hull 117x74 for a vehicle without a base",
    "LUC | Lucius + Flawless Blades | 1 @ 50 LUC, 6 @ 40 FB",
    "LEX | Lord Exultant + Infractors | 1 @ 40 LEX, 1 @ 32 OB, 9 @ 32 INF",
    "SOR | Sorcerer + Tormentors | 1 @ 32 SOR, 1 @ 32 OB, 4 @ 32 TOR",
    "DP1 | Daemon Prince (Faultless Opportunist) | 1 @ 60 DP1",
    "DP2 | Daemon Prince (Distortion) | 1 @ 60 DP2",
    "TOR | Tormentors | 1 @ 32 OB, 4 @ 32 TOR",
    "RH | Chaos Rhino | 1 @ hull 117x74 RH",
    "FB2 | Flawless Blades | 6 @ 40 FB2",
    "FB3 | Flawless Blades | 6 @ 40 FB3",
    "MF1 | Maulerfiend | 1 @ 120x92 MF1",
    "MF2 | Maulerfiend | 1 @ 120x92 MF2" ].join('\n') },
  hostile: { name: 'Stephen: Imperial Fists', colour: '#d1a51c', side: 'red', roster: [
    "LYS | Lysander + Ancient + Assault Terminators | 1 @ 40 LYS, 1 @ 40 ANC, 10 @ 40 TH",
    "GAR | Tor Garadon + Eradicators | 1 @ 40 GAR, 6 @ 40 ERA",
    "IM1 | Impulsor | 1 @ 100 IM1",
    "IM2 | Impulsor | 1 @ 100 IM2",
    "ER1 | Eradicators (melta) | 3 @ 40 ER1",
    "ER2 | Eradicators (melta) | 3 @ 40 ER2",
    "INC | Inceptors | 6 @ 40 INC",
    "ICR | Incursors | 5 @ 32 ICR",
    "RED | Redemptor Dreadnought | 1 @ 90 RED",
    "RV1 | Reivers | 5 @ 32 RV1",
    "RV2 | Reivers | 5 @ 32 RV2" ].join('\n') }
};
const cloneArmies = a => JSON.parse(JSON.stringify(a));
// Marker kinds: name, default diameter in mm, colour. Markers don't block movement.
const MARKER_KINDS = { tunnel: { name:'Tunnel marker', d: 40, colour:'#6b4a2b' }, 'deep-strike': { name:'Deep strike point', d: 32, colour:'#7a2fa0' },
  objective: { name:'Objective marker', d: 40, colour:'#0f6b55' }, note: { name:'Note', d: 25, colour:'#3c4a45' } };
function cleanBases(list){
  return (Array.isArray(list) ? list : []).filter(b => b && b.w > 0 && b.h > 0 && isFinite(b.x) && isFinite(b.y)).map(b => ({
    id: b.id, w:+b.w, h:+b.h, x:+b.x, y:+b.y, rot:+b.rot || 0, colour: b.colour || COLOURS[0], label: String(b.label || '').slice(0,6),
    shape: b.shape === 'hull' ? 'hull' : undefined, army: b.army || undefined, u: b.u || undefined }));
}
let S = { v:2, mapId: MAPS[DEFAULT_MAP] ? DEFAULT_MAP : Object.keys(MAPS)[0], custom:{}, terrain:{}, sizes: DEFAULT_SIZES.map(z => z.slice()), armies: cloneArmies(DEFAULT_ARMIES), unitMove:true, coh: { on:true, dist:2, big:7, group:true }, ring: 0, los: { on:false, watch:[], range:0, areas:true, partial:true }, eng: 1, bases:[], reserve:[], markers:[], mode:'stop', baseCollide:true, nextId:1 };
let M = MAPS[S.mapId];
let T = [];                // live terrain of the current layout
// Other modules can read these live bindings but not assign them, so they go through setters.
const setM = m => { M = m; }, setT = t => { T = t; }, setSel = x => { sel = x; };
function fin(t){ const xs = t.poly.map(q => q[0]), ys = t.poly.map(q => q[1]);
  t.bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  t.c = [xs.reduce((a, b) => a+b, 0)/xs.length, ys.reduce((a, b) => a+b, 0)/ys.length]; return t; }
const r2 = v => Math.round(v*100)/100;
function strip(t){ const o = { id:t.id, name:t.name, kind: t.kind === 'scenery' ? 'scenery' : 'area', objective:t.objective || null, owner:t.owner || null, collision:t.collision, poly:t.poly.map(q => [r2(q[0]), r2(q[1])]) };
  if (t.g) o.g = t.g; if (t.deco) o.deco = t.deco.map(q => [r2(q[0]), r2(q[1])]); if (t.icon) o.icon = [r2(t.icon[0]), r2(t.icon[1])]; return o; }
function xform(t, fn){ t.poly = t.poly.map(fn); if (t.deco) t.deco = t.deco.map(fn); if (t.icon) t.icon = fn(t.icon); fin(t); }
function groupOf(t){ return t.kind === 'area' && t.g ? T.filter(x => x.g === t.g) : [t]; }
function loadTerrain(){ T = (S.terrain[S.mapId] || M.terrain).map(t => fin(strip(t))); }
function commitTerrain(){ S.terrain[S.mapId] = T.map(strip); save(); }
let sel = null;            // {type:'base', b} | {type:'terrain', t}
const undo = [];
const view = { s: 0.3, ox: 0, oy: 0 };
const ruler = { on:false, a:null, b:null };

function snapshot(){ return JSON.stringify({ mapId:S.mapId, custom:S.custom, terrain:S.terrain, sizes:S.sizes, armies:S.armies, unitMove:S.unitMove, coh:S.coh, ring:S.ring, los:S.los, eng:S.eng, bases:S.bases, reserve:S.reserve, markers:S.markers, mode:S.mode, baseCollide:S.baseCollide, nextId:S.nextId, v:2 }, (k, v) => k === '_bad' ? undefined : v); }
function pushUndo(snap){ undo.push(snap || snapshot()); if (undo.length > 60) undo.shift(); $('btn-undo').disabled = false; }
function applyState(o){
  const custom = {};
  for (const k in (o.custom || {})) { try { MAPS[k] = normMap(k, o.custom[k]); custom[k] = o.custom[k]; } catch(e){} }
  const terrain = {};
  for (const k in (o.terrain || {})) if (MAPS[k] && Array.isArray(o.terrain[k])) terrain[k] = o.terrain[k].filter(t => t && Array.isArray(t.poly) && t.poly.length >= 3);
  const sizes = Array.isArray(o.sizes) ? o.sizes.filter(z => Array.isArray(z) && z[0] > 0 && z[1] > 0).map(z => [+z[0], +z[1]]) : DEFAULT_SIZES.map(z => z.slice());
  const armies = cloneArmies(DEFAULT_ARMIES);
  for (const k of ['friendly', 'hostile']) if (o.armies && o.armies[k]) Object.assign(armies[k], o.armies[k]);
  const coh = Object.assign({ on:true, dist:2, big:7, group:true }, o.coh || {});
  const lo = o.los || {}, los = { on: lo.on === true, watch: Array.isArray(lo.watch) ? lo.watch.filter(u => typeof u === 'string') : [], range: Math.max(0, +lo.range || 0), areas: lo.areas !== false, partial: lo.partial !== false };
  S = { v:2, mapId: MAPS[o.mapId] ? o.mapId : (MAPS[DEFAULT_MAP] ? DEFAULT_MAP : Object.keys(MAPS)[0]), custom, terrain, sizes, armies, unitMove: o.unitMove !== false, coh, ring: +o.ring || 0, los, eng: o.eng === undefined ? 1 : Math.max(0, +o.eng || 0),
        bases: cleanBases(o.bases), reserve: cleanBases(o.reserve),
        markers: (Array.isArray(o.markers) ? o.markers : []).filter(m => m && isFinite(m.x) && isFinite(m.y)).map(m => ({
          id: m.id, kind: MARKER_KINDS[m.kind] ? m.kind : 'note', x:+m.x, y:+m.y, d: Math.max(5, +m.d || MARKER_KINDS[MARKER_KINDS[m.kind] ? m.kind : 'note'].d), ring: Math.max(0, +m.ring || 0), label: String(m.label || '').slice(0, 24) })),
        mode: o.mode === 'flag' ? 'flag' : 'stop', baseCollide: o.baseCollide !== false, nextId: o.nextId || 1 };
  for (const b of S.bases.concat(S.reserve, S.markers)) if (!b.id) b.id = S.nextId++;
  S.nextId = Math.max(S.nextId, 1 + Math.max(0, ...S.bases.concat(S.reserve, S.markers).map(b => +b.id || 0)));
  M = MAPS[S.mapId]; sel = null; loadTerrain();
  buildMapSelect(); syncRulesUI(); renderChips(); renderInspector(); renderArmies(); dirty();
}
let saveT = 0;
const BOARDS = 'tabletop-base-planner-boards', PREFS = 'tabletop-base-planner-prefs';
const lsGet = k => { try { return localStorage.getItem(k); } catch(e){ return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch(e){ return false; } };
const lsDel = k => { try { localStorage.removeItem(k); } catch(e){} };
let BX = { current: null, order: [], boards: {} };
const setBX = x => { BX = x; };
let PR = { sizes: {} };
try { const p = JSON.parse(lsGet(PREFS) || 'null'); if (p && typeof p === 'object') PR = Object.assign(PR, p); } catch(e){}
const savePrefs = () => lsSet(PREFS, JSON.stringify(PR));
function saveIndex(){ lsSet(BOARDS, JSON.stringify(BX)); }
function saveNow(){ clearTimeout(saveT); if (!BX.current) return;
  lsSet(BOARDS + ':' + BX.current, snapshot()); const b = BX.boards[BX.current]; if (b){ b.updated = Date.now(); b.mapId = S.mapId; } saveIndex(); }
function save(){ clearTimeout(saveT); saveT = setTimeout(saveNow, 250); }
window.addEventListener('pagehide', saveNow); document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

export { MARKER_KINDS, DEFAULT_SIZES, DEFAULT_ARMIES, S, M, T, setM, setT, setSel, fin, strip, xform, groupOf, loadTerrain, commitTerrain, sel, undo, view, ruler, snapshot, pushUndo, applyState, BOARDS, lsGet, lsSet, lsDel, BX, setBX, PR, savePrefs, saveIndex, saveNow, save };
