import { IN, $ } from '../core.js';
import { S, M, T, setT, setSel, fin, strip, xform, groupOf, commitTerrain, sel, pushUndo, save } from '../state.js';
import { rad, isHull, clampToBoard, blockers, findSpot } from '../geometry.js';
import { cssW, cssH, s2w, dirty, setStatus } from '../render.js';
import { newColour, renderInspector, setTab } from './panel.js';
import { renderArmies } from '../armies.js';

/* ---------- actions ---------- */
let editTerrain = false;
function select(x, stay){
  const same = (!x && !sel) || (x && sel && x.type === sel.type && x.b === sel.b && x.t === sel.t && x.m === sel.m);
  setSel(x); if (!same){ renderInspector(); if (x && !stay) setTab('sel'); } dirty();
}
function sizeName(b){ return isHull(b) ? b.w + ' × ' + b.h + ' mm hull' : b.w === b.h ? b.w + ' mm round' : b.w + ' × ' + b.h + ' mm oval'; }
function addBases(w, h){
  const qty = Math.min(Math.max(parseInt($('new-qty').value, 10) || 1, 1), 30), label = $('new-label').value.trim().slice(0, 6);
  pushUndo();
  const c = s2w(cssW/2, cssH/2), cols = Math.ceil(Math.sqrt(qty*1.6)); let last = null;
  for (let i = 0; i < qty; i++){
    const b = { id: S.nextId++, w, h, x: 0, y: 0, rot: 0, colour: newColour, label };
    const gx = c[0] + ((i % cols) - (cols-1)/2)*(w + 4), gy = c[1] + (Math.floor(i/cols) - (Math.ceil(qty/cols)-1)/2)*(h + 4);
    const p = findSpot(b, gx, gy); b.x = p[0]; b.y = p[1]; S.bases.push(b); last = b;
  }
  select({ type:'base', b: last }); if (qty > 1) setTab('bases');
  setStatus('Added ' + qty + ' × ' + sizeName(last)); save(); dirty();
}
function removeSel(){ if (!sel || sel.type !== 'base') return; pushUndo(); S.bases = S.bases.filter(b => b !== sel.b); select(null); save(); renderArmies(); }
function dupSel(){
  if (!sel || sel.type !== 'base') return; pushUndo(); const o = sel.b, b = Object.assign({}, o, { id: S.nextId++ }); delete b._bad;
  const p = findSpot(b, o.x + o.w + 3, o.y); b.x = p[0]; b.y = p[1]; S.bases.push(b); select({ type:'base', b }); save();
}
function rotateSel(deg){
  if (!sel || sel.type !== 'base') return false; const b = sel.b, nr = ((deg % (isHull(b) ? 360 : 180)) + 360) % (isHull(b) ? 360 : 180);
  const p = clampToBoard(b, b.x, b.y, nr);
  if (S.mode === 'stop' && !blockers(b, b.x, b.y, b.rot).length){
    const hit = blockers(b, p[0], p[1], nr); if (hit.length){ setStatus('Can\'t turn: blocked by ' + hit[0], true); return false; }
  }
  b.rot = nr; b.x = p[0]; b.y = p[1]; save(); dirty(); return true;
}
function setRule(t, v){ pushUndo(); t.collision = v; commitTerrain(); renderInspector(); dirty(); }
const rectPoly = (w, h) => [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
const ovalPoly = (w, h) => { const o = []; for (let i = 0; i < 36; i++){ const a = i/36*2*Math.PI; o.push([w/2*Math.cos(a), h/2*Math.sin(a)]); } return o; };
const TEMPLATES = [
  { label:'Large area 11.5×7', name:'Large ruin area', kind:'area', collision:'allow', poly: rectPoly(11.5*IN, 7*IN) },
  { label:'Angled area 11.75×8.25', name:'Angled ruin area', kind:'area', collision:'allow', poly: [[-5.875,4.125],[5.875,4.125],[5.875,-4.125],[3.875,-4.125],[-5.875,2.125]].map(q => [q[0]*IN, q[1]*IN]) },
  { label:'Small area 6×4', name:'Small area', kind:'area', collision:'allow', poly: rectPoly(6*IN, 4*IN) },
  { label:'Long strip 10×2.5', name:'Long strip', kind:'area', collision:'allow', poly: rectPoly(10*IN, 2.5*IN) },
  { label:'Short strip 6×2', name:'Short strip', kind:'area', collision:'allow', poly: rectPoly(6*IN, 2*IN) },
  { label:'Wall 6×0.5', name:'Wall', kind:'scenery', collision:'block', poly: rectPoly(6*IN, 0.5*IN) },
  { label:'Corner wall 4×4', name:'Corner wall', kind:'scenery', collision:'block', poly: [[-2,-2],[2,-2],[2,-1.5],[-1.5,-1.5],[-1.5,2],[-2,2]].map(q => [q[0]*IN, q[1]*IN]) },
  { label:'Block 4×3', name:'Generator', kind:'scenery', collision:'block', poly: rectPoly(4*IN, 3*IN) },
  { label:'Objective marker 40 mm', name:'Objective marker', kind:'scenery', collision:'allow', objective:'round', poly: ovalPoly(40, 40) }
];
function addTerrain(tpl){
  pushUndo(); const c = s2w(cssW/2, cssH/2), cx = Math.min(Math.max(c[0], 0), M.W), cy = Math.min(Math.max(c[1], 0), M.H);
  const t = fin({ id:'u' + Date.now().toString(36) + Math.floor(Math.random()*1e3), name: tpl.name, kind: tpl.kind, objective: tpl.objective || null, owner: null,
    collision: tpl.collision, poly: tpl.poly.map(q => [q[0]+cx, q[1]+cy]) });
  T.push(t); commitTerrain(); setEditTerrain(true); select({ type:'terrain', t }); setStatus('Added ' + t.name + '. Drag it into place.'); dirty();
}
function turnTerrain(t, deg){ const a = rad(deg), c = Math.cos(a), s = Math.sin(a), o = t.c.slice();
  groupOf(t).forEach(x => xform(x, q => [o[0] + (q[0]-o[0])*c - (q[1]-o[1])*s, o[1] + (q[0]-o[0])*s + (q[1]-o[1])*c])); commitTerrain(); dirty(); }
function removeTerrain(t){ pushUndo(); const grp = groupOf(t); setT(T.filter(x => grp.indexOf(x) < 0)); commitTerrain(); select(null);
  setStatus(t.name + (grp.length > 1 ? ' and its ' + (grp.length-1) + ' parts' : '') + ' removed. Undo brings it back.'); }
function dupTerrain(t){ pushUndo(); const stamp = 'u' + Date.now().toString(36); let first = null;
  groupOf(t).forEach((x, i) => { const n = strip(x); n.id = stamp + '-' + i; if (n.g) n.g = x.kind === 'area' || t.kind === 'area' ? stamp : n.g; xform(n, q => [q[0] + IN, q[1] + IN]); T.push(n); if (x === t) first = n; });
  commitTerrain(); setEditTerrain(true); select({ type:'terrain', t: first }); }
function setEditTerrain(on){ editTerrain = on; $('terrain-edit').setAttribute('aria-pressed', String(on)); if (sel && sel.type === 'terrain') renderInspector(); }

export { editTerrain, select, sizeName, addBases, removeSel, dupSel, rotateSel, setRule, rectPoly, ovalPoly, TEMPLATES, addTerrain, turnTerrain, removeTerrain, dupTerrain, setEditTerrain };
