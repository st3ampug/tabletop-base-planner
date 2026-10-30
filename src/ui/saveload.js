import { $ } from '../core.js';
import { normMap, MAPS } from '../maps.js';
import { S, M, T, setM, loadTerrain, snapshot, pushUndo, applyState, BX, save } from '../state.js';
import { clampToBoard } from '../geometry.js';
import { fit, setStatus } from '../render.js';
import { select } from './actions.js';
import { buildMapSelect } from './panel.js';

/* ---------- save / load ---------- */
function ioMsg(t){ const m = $('io-msg'); m.hidden = !t; m.textContent = t || ''; }
function tableData(){
  const r1 = v => Math.round(v*10)/10, P = poly => poly.map(q => [r1(q[0]), r1(q[1])]);
  const ROLE = { home:'home', round:'centre', diamond:'expansion' };
  return {
    note: 'Read-only description of the table for analysis; ignored when this board is loaded. Millimetres, origin top-left, y down, board portrait. Red (attacker) zone at the top.',
    units: 'mm', board: { width: r1(M.W), height: r1(M.H) },
    map: { id: S.mapId, name: M.name },
    zones: M.zones.map(z => ({ owner: z.owner, poly: P(z.poly) })),
    objectives: T.filter(t => t.objective).map(t => { const c = t.icon || t.c; return { role: ROLE[t.objective] || t.objective, owner: t.owner || null, x: r1(c[0]), y: r1(c[1]), terrain: t.id }; }),
    terrain: T.map(t => { const o = { id: t.id, name: t.name, kind: t.kind === 'scenery' ? 'wall' : 'area', collision: t.collision, poly: P(t.poly) }; if (t.g && t.kind === 'scenery') o.area = t.g; return o; }),
    source: 'Layouts: github.com/wn-mitch/40kdc-data (CC BY 4.0), turned to portrait with the attacker at the top.'
  };
}
function exportText(){ const o = JSON.parse(snapshot()); o.table = tableData(); return JSON.stringify(o); }
function loadText(txt){
  let o; try { o = JSON.parse(txt); } catch(e){ ioMsg('That text is not valid JSON: ' + e.message); return; }
  try {
    if (o && Array.isArray(o.terrain) && !o.bases){
      const id = 'custom-' + Date.now().toString(36); MAPS[id] = normMap(id, o); pushUndo(); S.custom[id] = o; S.mapId = id; setM(MAPS[id]); loadTerrain();
      buildMapSelect(); select(null); for (const b of S.bases){ const p = clampToBoard(b, b.x, b.y, b.rot); b.x = p[0]; b.y = p[1]; } fit(); save(); ioMsg(''); setStatus('Map "' + M.name + '" added'); return;
    }
    if (o && Array.isArray(o.bases)){ pushUndo(); applyState(o); fit(); save(); ioMsg(''); setStatus('Board loaded'); return; }
    ioMsg('That JSON is neither a saved board nor a map. A board has "bases"; a map has "terrain".');
  } catch(e){ ioMsg(e.message); }
}
$('io-copy').addEventListener('click', () => { const t = exportText(); $('io').value = t;
  const done = () => setStatus('Board copied'), fb = () => { $('io').focus(); $('io').select(); setStatus('Text selected. Copy it with your keyboard or the long-press menu.'); };
  try { navigator.clipboard.writeText(t).then(done, fb); } catch(e){ fb(); } });
$('io-load').addEventListener('click', () => { const t = $('io').value.trim(); if (!t){ ioMsg('Paste a saved board or a map into the box first.'); return; } loadText(t); });
$('io-file').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('io').value = String(r.result); loadText(String(r.result)); }; r.readAsText(f); e.target.value = ''; });
if (location.protocol === 'file:' || /github\.io$/.test(location.hostname) || location.hostname === 'localhost'){ $('io-download').hidden = false; $('io-download').addEventListener('click', () => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportText()], { type:'application/json' })); a.download = ((BX.boards[BX.current] || {}).name || 'board').replace(/[^\w-]+/g, '-') + '.json'; document.body.appendChild(a); a.click(); a.remove(); }); }
