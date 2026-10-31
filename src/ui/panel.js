import { IN, DC, COLOURS, $ } from '../core.js';
import { MAPS } from '../maps.js';
import { DEFAULT_SIZES, S, M, T, setM, groupOf, loadTerrain, commitTerrain, sel, undo, ruler, pushUndo, applyState, save } from '../state.js';
import { isHull, clampToBoard, ruleOf } from '../geometry.js';
import { cv, resize, fit, dirty, ZONE, setStatus } from '../render.js';
import { editTerrain, select, sizeName, addBases, removeSel, dupSel, rotateSel, setRule, rectPoly, ovalPoly, TEMPLATES, addTerrain, turnTerrain, removeTerrain, dupTerrain, setEditTerrain } from './actions.js';
import { findUnit, removeUnit, setUnitMove, renderArmies } from '../armies.js';
import { renderBoards } from './boards.js';
import { toggleWatch, isWatched, syncSightUI } from './watch.js';
import { renderMarkerInspector } from './markers.js';
import { moveOf } from '../import.js';

/* ---------- panel ---------- */
let editSizes = false;
let newColour = COLOURS[0];
function el(tag, attrs, kids){ const n = document.createElement(tag); for (const k in (attrs||{})){ if (k === 'text') n.textContent = attrs[k]; else if (k.slice(0,2) === 'on') n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]); } (kids||[]).forEach(c => n.appendChild(c)); return n; }
function swatches(current, onPick, idp){
  return COLOURS.map((c, i) => el('button', { class:'sw', id: idp + i, style:'background:' + c, 'aria-label':'Colour ' + (i+1), 'aria-pressed': String(c === current), onclick: () => onPick(c) }));
}
function renderNewColours(){ const box = $('new-colours'); box.textContent = ''; swatches(newColour, c => { newColour = c; renderNewColours(); }, 'nc-').forEach(n => box.appendChild(n)); }
function updateBaseWarn(){
  const w = $('f-warn'); if (!w || !sel || sel.type !== 'base') return; const bad = sel.b._bad || [];
  w.hidden = !bad.length; if (bad.length) w.textContent = 'Illegal position: overlaps ' + bad.join(', ') + '.';
}
function renderInspector(){
  const box = $('inspector'); box.textContent = '';
  if (!sel){ box.appendChild(el('p', { class:'hint', text:'Tap a base or a terrain piece to edit it. Drag a base to move it and see the distance in inches.' })); return; }
  if (sel.type === 'marker'){ renderMarkerInspector(box); return; }
  if (sel.type === 'terrain'){
    const t = sel.t, r = ruleOf(t);
    const w = (t.bb[2]-t.bb[0])/IN, h = (t.bb[3]-t.bb[1])/IN;
    box.appendChild(el('div', { class:'row' }, [ el('label', { for:'t-name', text:'Name' }),
      el('input', { type:'text', id:'t-name', maxlength:'30', value: t.name, autocomplete:'off', oninput: e => { t.name = e.target.value.slice(0, 30) || 'Terrain'; commitTerrain(); dirty(); } }) ]));
    const kind = el('select', { id:'t-kind', 'aria-label':'Type', onchange: e => { pushUndo(); t.kind = e.target.value; commitTerrain(); dirty(); } }, [ el('option', { value:'area', text:'Terrain area' }), el('option', { value:'scenery', text:'Wall or scenery' }) ]); kind.value = t.kind;
    const ov = t.objective === 'home' ? 'home-' + (t.owner === 'red' ? 'red' : 'blue') : (t.objective || '');
    const obj = el('select', { id:'t-obj', 'aria-label':'Objective', onchange: e => { pushUndo(); const v = e.target.value; t.objective = v ? v.split('-')[0] : null; t.owner = v.indexOf('home-') === 0 ? v.slice(5) : null; commitTerrain(); dirty(); } },
      [['', 'Not an objective'], ['home-blue', 'Home objective (blue)'], ['home-red', 'Home objective (red)'], ['round', 'Round objective'], ['diamond', 'Diamond objective']].map(o => el('option', { value: o[0], text: o[1] }))); obj.value = ov;
    box.appendChild(el('div', { class:'row' }, [kind, obj]));
    const gn = groupOf(t).length - 1;
    box.appendChild(el('p', { class:'hint k', text: 'Fits in ' + w.toFixed(1) + '" × ' + h.toFixed(1) + '"' + (gn > 0 ? ' · carries ' + gn + (gn === 1 ? ' part' : ' parts') : '') }));
    box.appendChild(el('div', { class:'seg', role:'group', 'aria-label':'Collision rule' }, [
      el('button', { class:'btn', id:'t-allow', 'aria-pressed': String(r === 'allow'), text:'Bases can enter', onclick: () => setRule(t, 'allow') }),
      el('button', { class:'btn', id:'t-block', 'aria-pressed': String(r === 'block'), text:'Blocks bases', onclick: () => setRule(t, 'block') }) ]));
    box.appendChild(el('p', { class:'hint', text: r === 'block' ? 'No part of a base may overlap this piece.' : 'Bases move onto and through this piece freely.' }));
    const turn = d => () => { pushUndo(); turnTerrain(t, d); renderInspector(); };
    box.appendChild(el('div', { class:'row' }, [ el('label', { text:'Turn' }), el('button', { class:'btn', id:'t-rot-m15', text:'−15°', onclick: turn(-15) }), el('button', { class:'btn', id:'t-rot-m1', text:'−1°', onclick: turn(-1) }),
      el('button', { class:'btn', id:'t-rot-p1', text:'+1°', onclick: turn(1) }), el('button', { class:'btn', id:'t-rot-p15', text:'+15°', onclick: turn(15) }), el('button', { class:'btn', id:'t-rot-90', text:'90°', onclick: turn(90) }) ]));
    box.appendChild(el('div', { class:'row' }, [ el('button', { class:'btn', id:'t-move', 'aria-pressed': String(editTerrain), text: editTerrain ? 'Dragging on' : 'Drag to move', onclick: () => setEditTerrain(!editTerrain) }),
      el('button', { class:'btn', id:'t-dup', text:'Duplicate', onclick: () => dupTerrain(t) }), el('button', { class:'btn danger', id:'t-del', text:'Remove', onclick: () => removeTerrain(t) }) ]));
    return;
  }
  const b = sel.b, round = b.w === b.h && !isHull(b);
  box.appendChild(el('div', {}, [el('b', { class:'k', text: sizeName(b) })]));
  if (b.u){ const un = findUnit(b.u), n = S.bases.filter(x => x.u === b.u).length;
    box.appendChild(el('p', { class:'hint', text: (un ? un.name : 'Unit no longer in the roster') + ' · ' + S.armies[b.army].name + ' · ' + n + (n === 1 ? ' model' : ' models') }));
    box.appendChild(el('div', { class:'row' }, [ el('button', { class:'btn', id:'f-unitmove', 'aria-pressed': String(S.unitMove), text: S.unitMove ? 'Dragging the whole unit' : 'Dragging one model', onclick: () => setUnitMove(!S.unitMove) }),
      el('button', { class:'btn danger', id:'f-unitdel', text:'Remove unit', onclick: () => removeUnit(b.u) }),
      el('button', { class:'btn', id:'f-watch', 'aria-pressed': String(isWatched(b.u)), text: isWatched(b.u) ? 'Watching its sight' : 'Watch its sight', title:'Show where this unit can see', onclick: () => toggleWatch(b.u) }) ])); }
  box.appendChild(el('div', { class:'row' }, [ el('label', { for:'f-maxw', text:'Wounds' }),
    el('input', { type:'number', id:'f-maxw', min:'1', max:'99', step:'1', inputmode:'numeric', style:'width:64px', value: String(b.maxW || 1), 'aria-label':'Wounds of this model',
      onchange: e => { pushUndo(); const v = Math.max(1, Math.min(99, Math.round(+e.target.value) || 1)); b.maxW = v > 1 ? v : undefined; if (b.wounds > v) b.wounds = v; save(); renderInspector(); dirty(); } }),
    el('span', { class:'hint', text: 'per model, from the list (1 if it has none)' }) ]));
  box.appendChild(el('div', { class:'row' }, [ el('label', { for:'f-label', text:'Label' }),
    el('input', { type:'text', id:'f-label', maxlength:'6', value: b.label, autocomplete:'off', oninput: e => { b.label = e.target.value.slice(0, 6); save(); dirty(); } }) ]));
  box.appendChild(el('div', { class:'row', role:'group', 'aria-label':'Base colour' }, swatches(b.colour, c => { pushUndo(); b.colour = c; save(); renderInspector(); dirty(); }, 'fc-')));
  if (!round){
    const out = el('span', { class:'k', id:'f-rot-out', text: Math.round(b.rot) + '°' });
    const rng = el('input', { type:'range', id:'f-rot', min:'0', max: isHull(b) ? '359' : '179', step:'1', value: String(Math.round(b.rot)), 'aria-label':'Rotation',
      onpointerdown: () => pushUndo(), oninput: e => { if (!rotateSel(+e.target.value)) e.target.value = String(Math.round(b.rot)); out.textContent = Math.round(b.rot) + '°'; } });
    const step = d => () => { pushUndo(); rotateSel(b.rot + d); rng.value = String(Math.round(b.rot)); out.textContent = Math.round(b.rot) + '°'; };
    box.appendChild(el('div', { class:'row' }, [ el('label', { for:'f-rot', text:'Turn' }), rng, out ]));
    box.appendChild(el('div', { class:'row' }, [ el('button', { class:'btn', id:'f-rot-m', text:'−15°', onclick: step(-15) }), el('button', { class:'btn', id:'f-rot-p', text:'+15°', onclick: step(15) }), el('button', { class:'btn', id:'f-rot-90', text:'90°', onclick: step(90) }) ]));
  }
  const rings = [1, 2, 3, 6, 9, 12];
  const rr = el('div', { class:'ringchips', role:'group', 'aria-label':'Range ring' }, [ el('span', { class:'hint', style:'align-self:center', text:'Ring' }) ].concat(
    [0].concat(rings).map(v => el('button', { class:'chip', id:'ring-' + v, 'aria-pressed': String(S.ring === v), text: v ? v + '"' : 'Off', onclick: () => { S.ring = v; save(); renderInspector(); dirty(); } }))));
  const custom = el('input', { type:'number', id:'ring-custom', min:'0', max:'48', step:'0.5', value: rings.indexOf(S.ring) < 0 && S.ring ? String(S.ring) : '', placeholder:'other', inputmode:'decimal', 'aria-label':'Ring distance in inches', style:'width:76px',
    onchange: e => { const v = Math.max(0, Math.min(48, +e.target.value || 0)); S.ring = v; save(); renderInspector(); dirty(); } });
  rr.appendChild(custom);
  const mv = b.u ? moveOf(b.u) : null;
  if (mv) [['ring-move', 'Move ' + mv + '"', mv], ['ring-adv', 'Advance ' + (mv + 6) + '"', mv + 6]].forEach(([id, text, v]) =>
    rr.appendChild(el('button', { class:'chip', id, 'aria-pressed': String(S.ring === v), title: id === 'ring-move' ? 'Move of the slowest model in the unit' : 'Move plus the highest Advance roll (6")', text, onclick: () => { S.ring = v; save(); renderInspector(); dirty(); } })));
  box.appendChild(rr);
  box.appendChild(el('p', { class:'hint', text: 'The ring is measured from the base edge' + (b.u && S.unitMove ? ', around every model in the unit.' : '.') + (mv ? ' Move is from the 40kdc data, the slowest model in the unit; Advance adds 6".' : '') }));
  box.appendChild(el('p', { class:'warnmsg', id:'f-warn', hidden:'' }));
  box.appendChild(el('div', { class:'row' }, [ el('button', { class:'btn', id:'f-dup', text:'Duplicate', onclick: dupSel }), el('button', { class:'btn danger', id:'f-del', text:'Remove', onclick: removeSel }) ]));
  updateBaseWarn();
}
function setTab(t){ $('panel').dataset.tab = t; document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t))); requestAnimationFrame(resize); }
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
const DISP = ['take-and-hold', 'disruption', 'purge-the-foe', 'priority-assets', 'reconnaissance'];
const DAB = { 'take-and-hold':'TAH', 'disruption':'DIS', 'purge-the-foe':'PTF', 'priority-assets':'PA', 'reconnaissance':'REC' };
const LAYOUT_INFO = {}; (DC.layouts || []).forEach(l => { LAYOUT_INFO[l.id] = l; });
function layoutsFor(a, b){ return (DC.layouts || []).filter(l => (l.a === a && l.b === b) || (l.a === b && l.b === a)).sort((p, q) => p.v - q.v); }
let pkPair = null;
function buildMapSelect(){ const m = M; $('map-btn').textContent = m.group ? m.short : m.name; $('map-btn').title = m.name + ' (choose a layout)'; }
function setMap(id){ if (!MAPS[id] || id === S.mapId) return; pushUndo(); S.mapId = id; setM(MAPS[S.mapId]); loadTerrain(); select(null);
  for (const b of S.bases){ const p = clampToBoard(b, b.x, b.y, b.rot); b.x = p[0]; b.y = p[1]; } buildMapSelect(); fit(); save(); renderArmies(); renderBoards(); }
function drawThumb(c, id){
  const m = MAPS[id], ter = (S.terrain[id] || m.terrain), W = 88, H = 120, dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = W*dpr; c.height = H*dpr; const x = c.getContext('2d'); x.scale(dpr*W/m.W, dpr*H/m.H);
  x.fillStyle = '#dedbd0'; x.fillRect(0, 0, m.W, m.H);
  const pth = poly => { x.beginPath(); poly.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.closePath(); };
  for (const z of m.zones){ pth(z.poly); x.fillStyle = ZONE[z.owner] || 'rgba(0,0,0,.2)'; x.fill(); }
  for (const t of ter){ pth(t.poly); x.fillStyle = t.kind === 'scenery' ? '#2f4a42' : '#c7cbc8'; x.fill(); }
  for (const t of ter) if (t.objective){ const o = t.icon || [(Math.min(...t.poly.map(q => q[0])) + Math.max(...t.poly.map(q => q[0])))/2, (Math.min(...t.poly.map(q => q[1])) + Math.max(...t.poly.map(q => q[1])))/2];
    x.beginPath(); x.arc(o[0], o[1], 34, 0, 7); x.fillStyle = t.objective === 'home' ? (t.owner === 'red' ? '#7d1b12' : '#2c5578') : '#0f6b55'; x.fill(); x.lineWidth = 8; x.strokeStyle = '#fff'; x.stroke(); }
}
function renderPicker(){
  const cur = LAYOUT_INFO[S.mapId]; if (!pkPair) pkPair = cur ? [cur.a, cur.b] : [DISP[0], DISP[0]];
  const grid = $('pk-grid'); grid.textContent = '';
  grid.appendChild(el('span', { class:'hd', text:'YOU ↓' }));
  DISP.forEach(d => grid.appendChild(el('span', { class:'hd', text: DAB[d], title: DC.disp[d] })));
  DISP.forEach(a => { grid.appendChild(el('span', { class:'rh', text: DAB[a], title: DC.disp[a] }));
    DISP.forEach(b => { const on = pkPair[0] === a && pkPair[1] === b, isCur = cur && ((cur.a === a && cur.b === b) || (cur.a === b && cur.b === a));
      grid.appendChild(el('button', { class:'cell' + (isCur ? ' cur' : ''), 'aria-pressed': String(on), id:'pk-' + DAB[a] + '-' + DAB[b], title: DC.disp[a] + ' vs ' + DC.disp[b],
        text: DAB[a] + '·' + DAB[b], onclick: () => { pkPair = [a, b]; renderPicker(); } })); }); });
  const vars = $('pk-vars'); vars.textContent = '';
  layoutsFor(pkPair[0], pkPair[1]).forEach(l => { const c = el('canvas', { 'aria-hidden':'true' }); drawThumb(c, l.id);
    vars.appendChild(el('button', { class:'var' + (l.id === S.mapId ? ' cur' : ''), id:'pk-v-' + l.v, onclick: () => { $('picker').close(); setMap(l.id); } },
      [c, el('span', { text: 'Layout ' + l.v + ' · ' + DC.deploy[l.d].n })])); });
  const cu = $('pk-custom'); cu.textContent = ''; const own = Object.keys(MAPS).filter(k => !LAYOUT_INFO[k]);
  if (own.length){ cu.appendChild(el('p', { class:'legend', text:'Your maps' })); const r = el('div', { class:'row' });
    own.forEach(k => r.appendChild(el('button', { class:'btn', text: MAPS[k].name, onclick: () => { $('picker').close(); setMap(k); } }))); cu.appendChild(r); }
}
$('map-btn').addEventListener('click', () => { pkPair = null; renderPicker(); try { $('picker').showModal(); } catch(e){ $('picker').setAttribute('open', ''); } });
$('pk-close').addEventListener('click', () => $('picker').close());
$('picker').addEventListener('click', e => { if (e.target === $('picker')) $('picker').close(); });
function syncRulesUI(){ $('mode-stop').setAttribute('aria-pressed', String(S.mode === 'stop')); $('mode-flag').setAttribute('aria-pressed', String(S.mode === 'flag')); $('base-collide').checked = S.baseCollide; $('btn-undo').disabled = !undo.length;
  $('coh-on').checked = S.coh.on; $('coh-dist').value = S.coh.dist; $('coh-big').value = S.coh.big; $('coh-group').checked = S.coh.group; $('eng-dist').value = S.eng; syncSightUI(); }
$('coh-on').addEventListener('change', e => { S.coh.on = e.target.checked; save(); dirty(); });
$('eng-dist').addEventListener('change', e => { S.eng = Math.max(0, Math.min(6, +e.target.value || 0)); e.target.value = S.eng; save(); });
$('coh-group').addEventListener('change', e => { S.coh.group = e.target.checked; save(); dirty(); });
$('coh-dist').addEventListener('change', e => { S.coh.dist = Math.max(0.5, Math.min(12, +e.target.value || 2)); e.target.value = S.coh.dist; save(); dirty(); });
$('coh-big').addEventListener('change', e => { S.coh.big = Math.max(2, Math.min(40, Math.round(+e.target.value) || 7)); e.target.value = S.coh.big; save(); dirty(); });


$('btn-fit').addEventListener('click', fit);
$('btn-undo').addEventListener('click', () => { const s = undo.pop(); if (!s) return; applyState(JSON.parse(s)); save(); setStatus('Undone'); });
$('btn-ruler').addEventListener('click', () => { ruler.on = !ruler.on; ruler.a = ruler.b = null; $('btn-ruler').setAttribute('aria-pressed', String(ruler.on)); cv.style.cursor = ruler.on ? 'crosshair' : 'grab'; if (ruler.on) setStatus('Drag on the board to measure'); dirty(); });
function renderChips(){
  const R = $('chips-round'), O = $('chips-oval'); R.textContent = ''; O.textContent = '';
  R.classList.toggle('removing', editSizes); O.classList.toggle('removing', editSizes);
  const sorted = S.sizes.slice().sort((a, b) => a[0]*a[1] - b[0]*b[1]);
  for (const z of sorted){
    const round = z[0] === z[1], id = 'chip-' + (round ? 'r-' : 'o-') + String(z[0]).replace('.', '_') + (round ? '' : 'x' + String(z[1]).replace('.', '_'));
    (round ? R : O).appendChild(el('button', { class:'chip' + (round ? '' : ' oval'), id, text: (editSizes ? '✕ ' : '') + (round ? z[0] : z[0] + '×' + z[1]),
      title: (editSizes ? 'Remove ' : 'Add ') + (round ? z[0] + ' mm round' : z[0] + ' × ' + z[1] + ' mm oval'),
      onclick: () => { if (editSizes){ S.sizes = S.sizes.filter(q => !(q[0] === z[0] && q[1] === z[1])); save(); renderChips(); } else addBases(z[0], z[1]); } }));
  }
  $('sizes-edit').setAttribute('aria-pressed', String(editSizes)); $('sizes-reset').hidden = !editSizes; $('sizes-hint').hidden = !editSizes;
}
function customSize(){ const w = +$('cust-w').value, h = +$('cust-h').value;
  if (!(w >= 10 && w <= 400 && h >= 10 && h <= 400)){ setStatus('Custom sizes run from 10 to 400 mm', true); return null; } return [Math.max(w, h), Math.min(w, h)]; }
$('cust-add').addEventListener('click', () => { const z = customSize(); if (z) addBases(z[0], z[1]); });
$('cust-save').addEventListener('click', () => { const z = customSize(); if (!z) return;
  if (S.sizes.some(q => q[0] === z[0] && q[1] === z[1])){ setStatus('That size is already in the list'); return; } S.sizes.push(z); save(); renderChips(); setStatus('Size saved to the list'); });
$('sizes-edit').addEventListener('click', () => { editSizes = !editSizes; renderChips(); });
$('sizes-reset').addEventListener('click', () => { S.sizes = DEFAULT_SIZES.map(z => z.slice()); editSizes = false; save(); renderChips(); setStatus('Default sizes restored'); });
TEMPLATES.forEach((tp, i) => $('chips-terrain').appendChild(el('button', { class:'chip t', id:'chip-t-' + i, text: tp.label, onclick: () => addTerrain(tp) })));
$('terrain-edit').addEventListener('click', () => { setEditTerrain(!editTerrain); setStatus(editTerrain ? 'Drag terrain pieces to move them' : 'Terrain locked'); });
$('terrain-reset').addEventListener('click', () => { pushUndo(); delete S.terrain[S.mapId]; loadTerrain(); select(null); save(); dirty(); setStatus('Layout defaults restored. Undo brings your changes back.'); });
$('tc-add').addEventListener('click', () => { const w = +$('tc-w').value, h = +$('tc-h').value, oval = $('tc-shape').value === 'oval';
  if (!(w >= 0.5 && w <= 60 && h >= 0.5 && h <= 60)){ setStatus('Terrain sizes run from 0.5 to 60 inches', true); return; }
  addTerrain({ name: oval ? 'Round terrain' : 'Terrain', kind:'scenery', collision:'block', poly: oval ? ovalPoly(w*IN, h*IN) : rectPoly(w*IN, h*IN) }); });
$('mode-stop').addEventListener('click', () => { S.mode = 'stop'; syncRulesUI(); save(); });
$('mode-flag').addEventListener('click', () => { S.mode = 'flag'; syncRulesUI(); save(); });
$('base-collide').addEventListener('change', e => { S.baseCollide = e.target.checked; save(); dirty(); });
function toggleKind(kind){ const ts = T.filter(t => t.kind === kind); if (!ts.length) return; pushUndo(); const to = ts.every(t => t.collision === 'block') ? 'allow' : 'block';
  ts.forEach(t => t.collision = to); commitTerrain(); renderInspector(); dirty();
  setStatus((kind === 'area' ? 'Terrain areas' : 'Walls and scenery') + (to === 'block' ? ' now block bases' : ' can now be entered')); }
$('rules-ruins').addEventListener('click', () => toggleKind('area'));
$('rules-scenery').addEventListener('click', () => toggleKind('scenery'));
$('clear-bases').addEventListener('click', () => { if (!S.bases.length) return; pushUndo(); S.bases = []; select(null); save(); renderArmies(); setStatus('All bases removed. Undo brings them back.'); });

export { newColour, el, swatches, renderNewColours, updateBaseWarn, renderInspector, setTab, buildMapSelect, setMap, syncRulesUI, renderChips };
