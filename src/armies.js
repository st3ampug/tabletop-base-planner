import { IN, $ } from './core.js';
import { DEFAULT_ARMIES, S, M, sel, setSel, view, pushUndo, save } from './state.js';
import { pip, segD2, rad, extents, isHull, basePoly, blockers, findSpot } from './geometry.js';
import { cssW, cssH, s2w, dirty, lum, setStatus } from './render.js';
import { select } from './ui/actions.js';
import { el, swatches, renderInspector } from './ui/panel.js';
import { renderImport } from './import.js';
import { toggleWatch, watchArmy, isWatched } from './ui/watch.js';

/* ---------- armies ---------- */
let armyView = 'friendly';
const setArmyView = k => { armyView = k; };
const SIDE_NAME = { blue:'Blue zone', red:'Red zone' };
function parseRoster(text){
  const units = [], errs = [], seen = {};
  String(text || '').split('\n').forEach((line, i) => {
    line = line.trim(); if (!line || line[0] === '#') return;
    const parts = line.split('|').map(x => x.trim());
    if (parts.length < 3){ errs.push('Line ' + (i+1) + ': needs three parts, label | unit | bases.'); return; }
    let label = parts[0].replace(/\s+/g, '').slice(0, 6) || 'U'; const base = label; let k = 2;
    while (seen[label]) label = (base.slice(0, 5) + k++).slice(0, 6); seen[label] = 1;
    const groups = [];
    for (const tok of parts[2].split(',')){
      const m = tok.trim().match(/^(\d+)\s*@\s*(hull\s+)?(\d+(?:\.\d+)?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?(?:\s+(\S{1,6}))?$/i);
      if (!m){ errs.push('Line ' + (i+1) + ': can\'t read "' + tok.trim() + '". Write it like 6 @ 40 or 1 @ hull 117x74.'); continue; }
      const n = Math.min(+m[1], 40), a = +m[3], c = m[4] ? +m[4] : a;
      if (!(n > 0 && a >= 10 && a <= 400 && c >= 10 && c <= 400)){ errs.push('Line ' + (i+1) + ': sizes run from 10 to 400 mm.'); continue; }
      groups.push({ n, w: Math.max(a, c), h: Math.min(a, c), hull: !!m[2], label: m[5] || label });
    }
    if (groups.length) units.push({ key: label, name: parts[1] || label, groups });
  });
  return { units, errs };
}
function findUnit(u){ if (!u) return null; const i = u.indexOf(':'), army = u.slice(0, i), key = u.slice(i+1);
  return S.armies[army] ? parseRoster(S.armies[army].roster).units.find(x => x.key === key) : null; }
function unitSummary(un){ return un.groups.map(gp => gp.n + '×' + (gp.hull ? 'hull ' + gp.w + '×' + gp.h : gp.w === gp.h ? gp.w : gp.w + '×' + gp.h)).join(' + ') + ' mm'; }
function zoneOf(side){ return M.zones.find(z => z.owner === side) || null; }
function within(b, x, y, poly){
  if (!pip(x, y, poly)) return false;
  if (!isHull(b) && b.w === b.h){ const r2_ = (b.w/2)*(b.w/2);
    for (let i = 0, j = poly.length-1; i < poly.length; j = i++) if (segD2(poly[j][0]-x, poly[j][1]-y, poly[i][0]-x, poly[i][1]-y) < r2_) return false; return true; }
  return basePoly(b, x, y, rad(b.rot), 20).every(q => pip(q[0], q[1], poly));
}
function formation(un, army){
  const bs = []; un.groups.forEach(gp => { for (let i = 0; i < gp.n; i++) bs.push({ w: gp.w, h: gp.h, shape: gp.hull ? 'hull' : undefined, label: gp.label }); });
  const n = bs.length, cols = n <= 3 ? n : Math.min(6, Math.ceil(Math.sqrt(n*1.8))), rows = Math.ceil(n/cols);
  const cw = Math.max(...bs.map(b => b.w)) + 2.5, rh = Math.max(...bs.map(b => b.h)) + 2.5;
  bs.forEach((b, i) => { b.ox = ((i % cols) - (cols-1)/2)*cw; b.oy = (Math.floor(i/cols) - (rows-1)/2)*rh; b.rot = 0; b.colour = army.colour; });
  return bs;
}
function deployUnit(armyKey, un, quiet){
  const army = S.armies[armyKey], F = formation(un, army), zone = zoneOf(army.side), u = armyKey + ':' + un.key;
  const fits = (ax, ay, poly) => F.every(b => { const x = ax + b.ox, y = ay + b.oy, e = extents(b, 0);
    if (x < e[0] || y < e[1] || x > M.W - e[0] || y > M.H - e[1]) return false;
    if (poly && !within(b, x, y, poly)) return false;
    return !blockers(b, x, y, 0, null, true).length; });
  let at = null;
  if (zone){
    const zb = [Math.min(...zone.poly.map(q => q[0])), Math.min(...zone.poly.map(q => q[1])), Math.max(...zone.poly.map(q => q[0])), Math.max(...zone.poly.map(q => q[1]))];
    const zc = [zone.poly.reduce((a, q) => a + q[0], 0)/zone.poly.length, zone.poly.reduce((a, q) => a + q[1], 0)/zone.poly.length];
    let vx = zc[0] - M.W/2, vy = zc[1] - M.H/2; const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
    const cand = [], st = IN/2;
    for (let y = zb[1]; y <= zb[3]; y += st) for (let x = zb[0]; x <= zb[2]; x += st) if (pip(x, y, zone.poly)) cand.push([x, y, x*vx + y*vy]);
    cand.sort((p, q) => (q[2] - p[2]) || (p[0] - q[0]) || (p[1] - q[1]));
    for (const c of cand) if (fits(c[0], c[1], zone.poly)){ at = c; break; }
  }
  let outside = false;
  if (!at){ outside = true; const c = s2w(cssW/2, cssH/2); at = [c[0], c[1]]; }
  const made = F.map(f => ({ id: S.nextId++, w: f.w, h: f.h, shape: f.shape, x: at[0] + f.ox, y: at[1] + f.oy, rot: 0, colour: army.colour, label: f.label, army: armyKey, u }));
  for (const b of made){ if (outside){ const p = findSpot(b, b.x, b.y); b.x = p[0]; b.y = p[1]; } S.bases.push(b); }
  if (!quiet) setStatus(outside ? un.name + ' did not fit in the ' + SIDE_NAME[army.side].toLowerCase() + '. Placed near the middle of the view.' : un.name + ' deployed in the ' + SIDE_NAME[army.side].toLowerCase(), outside);
  return !outside;
}
const footprint = un => un.groups.reduce((a, gp) => a + gp.n*gp.w*gp.h, 0);
function deployAll(armyKey){
  const army = S.armies[armyKey], { units } = parseRoster(army.roster);
  const todo = units.filter(un => !whereIs(armyKey + ':' + un.key)).sort((a, b) => footprint(b) - footprint(a));
  if (!todo.length){ setStatus('Every unit of ' + army.name + ' is already on the table'); return; }
  pushUndo(); let miss = 0; for (const un of todo) if (!deployUnit(armyKey, un, true)) miss++;
  save(); renderArmies(); dirty();
  setStatus(miss ? miss + (miss === 1 ? ' unit' : ' units') + ' did not fit in the zone and were placed near the middle' : todo.length + ' units deployed in the ' + SIDE_NAME[army.side].toLowerCase(), !!miss);
}
function removeUnit(u){ pushUndo(); S.bases = S.bases.filter(b => b.u !== u); S.reserve = S.reserve.filter(b => b.u !== u); if (sel && sel.b && sel.b.u === u) select(null); save(); renderArmies(); renderInspector(); dirty(); }
const whereIs = u => S.bases.some(b => b.u === u) ? 'table' : S.reserve.some(b => b.u === u) ? 'reserve' : null;
// Reserves: the unit's bases leave the table (or are made in its formation) and wait off the board. Nothing on the board sees them.
function toReserve(armyKey, un, quiet){
  const u = armyKey + ':' + un.key;
  if (S.bases.some(b => b.u === u)){ S.reserve = S.reserve.concat(S.bases.filter(b => b.u === u)); S.bases = S.bases.filter(b => b.u !== u); if (sel && sel.b && sel.b.u === u) setSel(null); }
  else if (!S.reserve.some(b => b.u === u)){ const army = S.armies[armyKey];
    for (const f of formation(un, army)) S.reserve.push({ id: S.nextId++, w: f.w, h: f.h, shape: f.shape, x: f.ox, y: f.oy, rot: 0, colour: army.colour, label: f.label, army: armyKey, u }); }
  if (!quiet){ save(); renderArmies(); renderInspector(); dirty(); setStatus(un.name + ' is in reserve'); }
}
// Free spot for a whole unit near (cx, cy), keeping its formation: rings of 1/4" steps out to 'lim' mm. Returns the offset, or null.
function groupSpot(G, cx, cy, lim){
  const c = [G.reduce((a, b) => a + b.x, 0)/G.length, G.reduce((a, b) => a + b.y, 0)/G.length], ign = new Set(G);
  const free = (dx, dy) => G.every(b => { const x = b.x + dx, y = b.y + dy, e = extents(b, rad(b.rot));
    return x >= e[0] && y >= e[1] && x <= M.W - e[0] && y <= M.H - e[1] && !blockers(b, x, y, b.rot, ign, true).length; });
  const bx = cx - c[0], by = cy - c[1]; if (free(bx, by)) return [bx, by];
  for (let k = 1; k*IN/4 <= (lim || 12*IN); k++){ const r = k*IN/4, n = 8 + k*4;
    for (let i = 0; i < n; i++){ const t = i/n*2*Math.PI, dx = bx + r*Math.cos(t), dy = by + r*Math.sin(t); if (free(dx, dy)) return [dx, dy]; } }
  return null;
}
// Arriving from reserve: the unit comes back in its formation at the middle of the view (or x, y), on the nearest free spot.
function arrive(u, x, y, opts){
  const G = S.reserve.filter(b => b.u === u); if (!G.length) return { ok: false, error: u + ' is not in reserve' };
  let cx = x, cy = y; if (cx === undefined){ const c = s2w(cssW/2, cssH/2); cx = Math.min(Math.max(c[0], 0), M.W); cy = Math.min(Math.max(c[1], 0), M.H); }
  S.reserve = S.reserve.filter(b => b.u !== u); S.bases = S.bases.concat(G);
  const off = (opts && opts.exact) ? (groupSpot(G, cx, cy, 0.001) || null) : groupSpot(G, cx, cy, (opts && opts.searchInches || 12)*IN);
  if (!off){ S.bases = S.bases.filter(b => b.u !== u); S.reserve = S.reserve.concat(G); return { ok: false, error: 'No free spot for the unit there' }; }
  for (const b of G){ b.x += off[0]; b.y += off[1]; }
  return { ok: true, pushed: Math.hypot(cx - (G.reduce((a, b) => a + b.x, 0)/G.length), cy - (G.reduce((a, b) => a + b.y, 0)/G.length)) };
}
function clearArmy(armyKey){ if (!S.bases.some(b => b.army === armyKey)) return; pushUndo(); S.bases = S.bases.filter(b => b.army !== armyKey); select(null); save(); renderArmies(); setStatus(S.armies[armyKey].name + ' removed from the table. Undo brings it back.'); }
function swapSides(){
  pushUndo(); for (const k of ['friendly', 'hostile']) S.armies[k].side = S.armies[k].side === 'blue' ? 'red' : 'blue';
  for (const b of S.bases) if (b.army){ b.x = M.W - b.x; b.y = M.H - b.y; b.rot = (b.rot + 180) % (isHull(b) ? 360 : 180); }
  save(); renderArmies(); dirty(); setStatus('Sides swapped. Both armies were turned to the opposite zone.');
}
function setUnitMove(on){ S.unitMove = on; $('dm-unit').setAttribute('aria-pressed', String(on)); $('dm-model').setAttribute('aria-pressed', String(!on)); save(); if (sel && sel.type === 'base') renderInspector(); dirty(); }
$('dm-unit').addEventListener('click', () => setUnitMove(true));
$('dm-model').addEventListener('click', () => setUnitMove(false));
function focusUnit(u){
  const G = S.bases.filter(b => b.u === u); if (!G.length) return;
  select({ type:'base', b: G[0] }, true);
  // Leave the view alone when the whole unit is already on screen, which it usually is with the board fitted.
  const r = b => Math.max(b.w, b.h)/2, x0 = Math.min(...G.map(b => b.x - r(b))), x1 = Math.max(...G.map(b => b.x + r(b))), y0 = Math.min(...G.map(b => b.y - r(b))), y1 = Math.max(...G.map(b => b.y + r(b)));
  const tl = s2w(0, 0), br = s2w(cssW, cssH); if (x0 >= tl[0] && x1 <= br[0] && y0 >= tl[1] && y1 <= br[1]) return;
  view.ox = cssW/2 - (x0 + x1)/2*view.s; view.oy = cssH/2 - (y0 + y1)/2*view.s; dirty();
}
function renderArmies(){
  const k = armyView, army = S.armies[k], box = $('army-box'); box.textContent = '';
  $('army-friendly').setAttribute('aria-pressed', String(k === 'friendly')); $('army-hostile').setAttribute('aria-pressed', String(k === 'hostile'));
  const { units, errs } = parseRoster(army.roster);
  renderImport(box);
  box.appendChild(el('div', { class:'row' }, [ el('label', { for:'army-name', text:'Name' }),
    el('input', { type:'text', id:'army-name', maxlength:'40', value: army.name, autocomplete:'off', onchange: e => { army.name = e.target.value.trim() || (k === 'friendly' ? 'Friendly' : 'Hostile'); save(); } }) ]));
  box.appendChild(el('div', { class:'row', role:'group', 'aria-label':'Army colour' }, swatches(army.colour, c => { pushUndo(); army.colour = c; S.bases.forEach(b => { if (b.army === k) b.colour = c; }); save(); renderArmies(); dirty(); }, 'ac-')));
  const side = el('select', { id:'army-side', 'aria-label':'Deployment zone', onchange: e => { army.side = e.target.value; save(); } },
    [el('option', { value:'blue', text:'Deploys in the blue zone' }), el('option', { value:'red', text:'Deploys in the red zone' })]); side.value = army.side;
  box.appendChild(el('div', { class:'row' }, [ side, el('button', { class:'btn', id:'army-swap', text:'Swap sides', title:'Swap zones and turn both armies to the other side', onclick: swapSides }) ]));
  const onT = un => S.bases.some(b => b.u === k + ':' + un.key), nOn = units.filter(onT).length, nRes = units.filter(un => whereIs(k + ':' + un.key) === 'reserve').length, nPlaced = nOn + nRes;
  box.appendChild(el('div', { class:'row' }, [ Object.assign(el('button', { class:'btn primary', id:'army-deploy', text: nPlaced === units.length && units.length ? 'All deployed' : nPlaced ? 'Deploy the rest' : 'Deploy all', onclick: () => deployAll(k) }), { disabled: !units.length || nPlaced === units.length }),
    el('button', { class:'btn danger', id:'army-clear', text:'Clear from table', onclick: () => clearArmy(k) }),
    el('span', { class:'hint k', text: nOn + ' of ' + units.length + ' units on the table' + (nRes ? ' · ' + nRes + ' in reserve' : '') }) ]));
  const nW = units.filter(un => isWatched(k + ':' + un.key)).length;
  if (nOn) box.appendChild(el('div', { class:'row' }, [ el('button', { class:'btn', id:'army-watch', text:'Watch all', title:'Show where this whole army can see', onclick: () => watchArmy(k, true) }),
    el('button', { class:'btn', id:'army-unwatch', text:'Unwatch all', onclick: () => watchArmy(k, false) }), el('span', { class:'hint k', text: nW + ' watched for sight' }) ]));
  const list = el('div', { class:'units' });
  units.forEach(un => {
    const u = k + ':' + un.key, where = whereIs(u), on = where === 'table', fg = lum(army.colour) > 0.55 ? '#111' : '#fff';
    const acts = on ? [ el('button', { class:'btn eye', 'aria-pressed': String(isWatched(u)), text:'👁', title:'Show where this unit can see', 'aria-label': (isWatched(u) ? 'Stop watching ' : 'Watch ') + un.name, onclick: () => toggleWatch(u) }),
        el('button', { class:'btn', text:'Find', 'aria-label':'Find ' + un.name, onclick: () => focusUnit(u) }),
        el('button', { class:'btn', text:'Reserve', title:'Take the unit off the table into reserve', 'aria-label':'Put ' + un.name + ' in reserve', onclick: () => { pushUndo(); toReserve(k, un); } }),
        el('button', { class:'btn danger', text:'Remove', 'aria-label':'Remove ' + un.name, onclick: () => removeUnit(u) }) ]
      : where === 'reserve' ? [ el('button', { class:'btn primary', text:'Arrive', title:'Bring the unit onto the table in the middle of the view', 'aria-label':'Bring ' + un.name + ' onto the table', onclick: () => {
          pushUndo(); const r = arrive(u); if (!r.ok){ setStatus(r.error, true); return; } save(); renderArmies(); focusUnit(u); setStatus(un.name + ' arrived. Drag it into place.'); } }),
        el('button', { class:'btn danger', text:'Remove', 'aria-label':'Remove ' + un.name, onclick: () => removeUnit(u) }) ]
      : [ el('button', { class:'btn', text:'Deploy', 'aria-label':'Deploy ' + un.name, onclick: () => { pushUndo(); deployUnit(k, un); save(); renderArmies(); focusUnit(u); } }),
        el('button', { class:'btn', text:'Reserve', 'aria-label':'Put ' + un.name + ' in reserve', onclick: () => { pushUndo(); toReserve(k, un); } }) ];
    list.appendChild(el('div', { class:'unit' + (on ? ' on' : where === 'reserve' ? ' res' : '') }, [
      el('span', { class:'tag', style:'background:' + army.colour + ';color:' + fg, text: un.key }),
      el('span', { class:'nm', text: un.name }),
      el('div', { class:'acts' }, acts),
      el('span', { class:'sz', text: unitSummary(un) + (on ? ' · on the table' : where === 'reserve' ? ' · in reserve' : '') }) ]));
  });
  if (!units.length) list.appendChild(el('p', { class:'hint', text:'No units yet. Open Edit roster below and add a line per unit.' }));
  box.appendChild(list);
  const ta = el('textarea', { id:'army-roster', spellcheck:'false', 'aria-label':'Roster', style:'height:190px' }); ta.value = army.roster;
  const msg = el('p', { class:'warnmsg', id:'army-msg' }); msg.hidden = !errs.length; msg.textContent = errs.join(' ');
  const det = el('details', { id:'army-edit' }, [ el('summary', { text:'Edit roster' }),
    el('p', { class:'hint', style:'margin:8px 0', text:'One unit per line: label | name | bases. Bases are count @ size, with an optional label per group, e.g. 1 @ 40 LYS, 10 @ 40 TH. Use 120x92 for an oval and hull 117x74 for a vehicle without a base. Units already on the table keep their bases.' }),
    ta, el('div', { class:'row', style:'margin-top:8px' }, [ el('button', { class:'btn', id:'army-apply', text:'Apply roster', onclick: () => { pushUndo(); army.roster = ta.value; save(); renderArmies(); $('army-edit').open = true; setStatus('Roster updated'); } }),
      el('button', { class:'btn', id:'army-default', text:'Restore example list', onclick: () => { pushUndo(); army.roster = DEFAULT_ARMIES[k].roster; save(); renderArmies(); } }) ]), msg ]);
  box.appendChild(det);
}
$('army-friendly').addEventListener('click', () => { armyView = 'friendly'; renderArmies(); });
$('army-hostile').addEventListener('click', () => { armyView = 'hostile'; renderArmies(); });

export { armyView, setArmyView, SIDE_NAME, parseRoster, findUnit, deployUnit, footprint, deployAll, removeUnit, setUnitMove, renderArmies, whereIs, toReserve, arrive, groupSpot, focusUnit };
