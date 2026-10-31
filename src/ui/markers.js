import { IN, $ } from '../core.js';
import { MARKER_KINDS, S, M, sel, view, pushUndo, save } from '../state.js';
import { cssW, cssH, s2w, dirty, setStatus } from '../render.js';
import { select } from './actions.js';
import { el, renderInspector, setTab } from './panel.js';

/* ---------- markers ---------- */
// Tokens on the board that don't block movement: tunnel markers, deep strike points, objective markers and notes.
// A marker is { id, kind, x, y, d (diameter in mm), ring (inches from its edge, 0 for none), label }.
function addMarker(kind, x, y, label){
  const k = MARKER_KINDS[kind] ? kind : 'note';
  let cx = x, cy = y; if (cx === undefined){ const c = s2w(cssW/2, cssH/2); cx = c[0]; cy = c[1]; }
  const m = { id: S.nextId++, kind: k, x: Math.min(Math.max(cx, 0), M.W), y: Math.min(Math.max(cy, 0), M.H), d: MARKER_KINDS[k].d, ring: 0, label: String(label || '').slice(0, 24) };
  S.markers.push(m); return m;
}
function removeMarker(m){ pushUndo(); S.markers = S.markers.filter(x => x !== m); if (sel && sel.m === m) select(null); save(); dirty(); }
function hitMarker(w){
  for (let i = S.markers.length - 1; i >= 0; i--){ const m = S.markers[i]; if (Math.hypot(w[0] - m.x, w[1] - m.y) <= Math.max(m.d/2 + 4/view.s, 14/view.s)) return m; }
  return null;
}
function drawMarkers(c, px, s){
  for (const m of S.markers){
    const k = MARKER_KINDS[m.kind] || MARKER_KINDS.note, r = m.d/2, on = sel && sel.type === 'marker' && sel.m === m;
    if (m.ring > 0){ c.beginPath(); c.arc(m.x, m.y, r + m.ring*IN, 0, 2*Math.PI); c.fillStyle = 'rgba(255,255,255,.08)'; c.fill();
      c.setLineDash([6*px, 4*px]); c.lineWidth = 1.8*px; c.strokeStyle = k.colour; c.stroke(); c.setLineDash([]); }
    c.beginPath();
    if (m.kind === 'deep-strike'){ c.moveTo(m.x, m.y - r); c.lineTo(m.x + r, m.y); c.lineTo(m.x, m.y + r); c.lineTo(m.x - r, m.y); c.closePath(); }
    else if (m.kind === 'note'){ c.rect(m.x - r, m.y - r, 2*r, 2*r); }
    else c.arc(m.x, m.y, r, 0, 2*Math.PI);
    c.fillStyle = k.colour; c.fill(); c.lineWidth = Math.max(1.5*px, 1); c.strokeStyle = '#fff'; c.stroke();
    if (m.kind === 'tunnel'){ c.beginPath(); c.arc(m.x, m.y, r*0.55, 0, 2*Math.PI); c.fillStyle = 'rgba(0,0,0,.55)'; c.fill(); }
    if (m.kind === 'deep-strike'){ c.beginPath(); c.moveTo(m.x - r*0.45, m.y); c.lineTo(m.x + r*0.45, m.y); c.moveTo(m.x, m.y - r*0.45); c.lineTo(m.x, m.y + r*0.45); c.strokeStyle = '#fff'; c.stroke(); }
    if (on){ c.beginPath(); c.arc(m.x, m.y, r + 3*px, 0, 2*Math.PI); c.lineWidth = 2.5*px; c.strokeStyle = '#ffd23f'; c.stroke(); }
    if (m.label && s*IN > 6){ const fs = Math.max(0.42*IN, 11*px); c.font = '700 ' + fs + 'px ' + getComputedStyle(document.body).fontFamily; c.textAlign = 'center'; c.textBaseline = 'top';
      c.lineWidth = 3*px; c.strokeStyle = 'rgba(0,0,0,.7)'; c.strokeText(m.label, m.x, m.y + r + 2*px); c.fillStyle = '#fff'; c.fillText(m.label, m.x, m.y + r + 2*px); }
  }
}
function renderMarkerInspector(box){
  const m = sel.m, k = MARKER_KINDS[m.kind] || MARKER_KINDS.note;
  box.appendChild(el('div', {}, [ el('b', { text: k.name }), el('span', { class:'hint', text: '  ' + m.d + ' mm · doesn\'t block movement' }) ]));
  const kind = el('select', { id:'mk-kind', 'aria-label':'Marker kind', onchange: e => { pushUndo(); m.kind = e.target.value; m.d = MARKER_KINDS[m.kind].d; save(); renderInspector(); dirty(); } },
    Object.keys(MARKER_KINDS).map(v => el('option', { value: v, text: MARKER_KINDS[v].name }))); kind.value = m.kind;
  box.appendChild(el('div', { class:'row' }, [ kind ]));
  box.appendChild(el('div', { class:'row' }, [ el('label', { for:'mk-label', text:'Label' }),
    el('input', { type:'text', id:'mk-label', maxlength:'24', value: m.label, autocomplete:'off', oninput: e => { m.label = e.target.value.slice(0, 24); save(); dirty(); } }) ]));
  box.appendChild(el('div', { class:'row' }, [ el('label', { for:'mk-size', text:'Size' }),
    el('input', { type:'number', id:'mk-size', min:'5', max:'200', step:'1', value: String(m.d), inputmode:'decimal', 'aria-label':'Marker diameter in mm', onchange: e => { pushUndo(); m.d = Math.max(5, Math.min(200, +e.target.value || k.d)); save(); renderInspector(); dirty(); } }),
    el('span', { text:'mm' }) ]));
  const ring = el('div', { class:'ringchips', role:'group', 'aria-label':'Marker ring' }, [ el('span', { class:'hint', style:'align-self:center', text:'Ring' }) ].concat(
    [0, 3, 6, 8, 9, 12].map(v => el('button', { class:'chip', id:'mk-ring-' + v, 'aria-pressed': String(m.ring === v), text: v ? v + '"' : 'Off', onclick: () => { pushUndo(); m.ring = v; save(); renderInspector(); dirty(); } }))));
  ring.appendChild(el('input', { type:'number', id:'mk-ring-custom', min:'0', max:'48', step:'0.5', value: [0, 3, 6, 8, 9, 12].indexOf(m.ring) < 0 ? String(m.ring) : '', placeholder:'other', inputmode:'decimal', 'aria-label':'Ring distance in inches', style:'width:76px',
    onchange: e => { pushUndo(); m.ring = Math.max(0, Math.min(48, +e.target.value || 0)); save(); renderInspector(); dirty(); } }));
  box.appendChild(ring);
  box.appendChild(el('p', { class:'hint', text:'Drag the marker to move it. The ring is measured from its edge.' }));
  box.appendChild(el('div', { class:'row' }, [ el('button', { class:'btn', id:'mk-dup', text:'Duplicate', onclick: () => { pushUndo(); const n = addMarker(m.kind, m.x + m.d + 6, m.y, m.label); n.d = m.d; n.ring = m.ring; save(); select({ type:'marker', m: n }); } }),
    el('button', { class:'btn danger', id:'mk-del', text:'Remove', onclick: () => removeMarker(m) }) ]));
}
document.querySelectorAll('[data-marker]').forEach(b => b.addEventListener('click', () => {
  pushUndo(); const m = addMarker(b.dataset.marker); save(); select({ type:'marker', m }); setStatus(MARKER_KINDS[m.kind].name + ' added in the middle of the view. Drag it into place.');
}));

export { addMarker, removeMarker, hitMarker, drawMarkers, renderMarkerInspector };
