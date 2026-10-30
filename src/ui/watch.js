import { $ } from '../core.js';
import { S, save } from '../state.js';
import { dirty, setStatus } from '../render.js';
import { el, renderInspector } from './panel.js';
import { renderArmies } from '../armies.js';

/* ---------- watch ---------- */
// Which units the line-of-sight mask looks from (S.los.watch, unit keys like "hostile:LYS"), the Sight button and the sight settings.
const LOS_RANGES = [12, 18, 24, 36];
const unitsOf = k => [...new Set(S.bases.filter(b => b.army === k && b.u).map(b => b.u))];
function sightChanged(){ syncSightUI(); save(); renderArmies(); renderInspector(); dirty(); }
function setSight(on){
  S.los.on = on;
  if (on && !S.los.watch.some(u => S.bases.some(b => b.u === u))){
    S.los.watch = unitsOf('hostile');
    if (S.los.watch.length) setStatus('Watching the whole hostile army. Pick units with the eye buttons in the Armies tab.');
    else setStatus('Nothing to watch: deploy the hostile army first', true);
  }
  sightChanged();
}
function toggleWatch(u){ const w = S.los.watch, i = w.indexOf(u); if (i >= 0) w.splice(i, 1); else { w.push(u); S.los.on = true; } sightChanged(); }
function watchArmy(k, on){ const us = unitsOf(k); S.los.watch = S.los.watch.filter(u => us.indexOf(u) < 0).concat(on ? us : []); if (on && us.length) S.los.on = true; sightChanged(); }
const isWatched = u => S.los.watch.indexOf(u) >= 0;
function setRange(v){ S.los.range = v; syncSightUI(); save(); dirty(); }
function syncSightUI(){
  $('btn-sight').setAttribute('aria-pressed', String(S.los.on)); $('los-areas').checked = S.los.areas; $('los-partial').checked = S.los.partial;
  const box = $('los-range'); box.textContent = '';
  box.appendChild(el('span', { class:'hint', style:'align-self:center', text:'Range' }));
  [0].concat(LOS_RANGES).forEach(v => box.appendChild(el('button', { class:'chip', id:'los-r-' + v, 'aria-pressed': String(S.los.range === v), text: v ? v + '"' : 'Any', onclick: () => setRange(v) })));
  box.appendChild(el('input', { type:'number', id:'los-r-custom', min:'0', max:'72', step:'1', value: LOS_RANGES.indexOf(S.los.range) < 0 && S.los.range ? String(S.los.range) : '', placeholder:'other', inputmode:'decimal',
    'aria-label':'Sight range in inches', style:'width:76px', onchange: e => setRange(Math.max(0, Math.min(72, +e.target.value || 0))) }));
}
$('btn-sight').addEventListener('click', () => setSight(!S.los.on));
$('los-areas').addEventListener('change', e => { S.los.areas = e.target.checked; save(); dirty(); });
$('los-partial').addEventListener('change', e => { S.los.partial = e.target.checked; save(); dirty(); });

export { toggleWatch, watchArmy, isWatched, syncSightUI };
