import { $ } from '../core.js';
import { MAPS } from '../maps.js';
import { S, undo, snapshot, applyState, BOARDS, lsGet, lsSet, lsDel, BX, saveIndex, saveNow } from '../state.js';
import { fit, setStatus } from '../render.js';
import { el } from './panel.js';

/* ---------- boards ---------- */
const newId = () => 'b' + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36);
let bdConfirm = null, bdRename = null;
function renderBoards(){
  const box = $('boards'); if (!box) return; box.textContent = '';
  BX.order.forEach(id => { const b = BX.boards[id]; if (!b) return; const cur = id === BX.current;
    const when = b.updated ? new Date(b.updated).toLocaleString([], { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
    const lay = MAPS[b.mapId] ? (MAPS[b.mapId].short || MAPS[b.mapId].name) : '';
    const kids = [];
    if (bdRename === id){ const inp = el('input', { type:'text', id:'bd-name', value: b.name, maxlength:'40', 'aria-label':'Board name' });
      kids.push(el('div', { class:'bn' }, [inp]), el('button', { class:'btn', text:'Save', onclick: () => { b.name = inp.value.trim() || b.name; bdRename = null; saveIndex(); renderBoards(); } }));
      setTimeout(() => inp.focus(), 0);
    } else {
      kids.push(el('div', { class:'bn' }, [ el('div', { text: b.name }), el('div', { class:'bd', text: [lay, when].filter(Boolean).join(' · ') }) ]));
      if (!cur) kids.push(el('button', { class:'btn', text:'Open', onclick: () => openBoard(id) }));
      kids.push(el('button', { class:'btn', text:'Rename', onclick: () => { bdRename = id; renderBoards(); } }));
      if (BX.order.length > 1) kids.push(el('button', { class:'btn danger', text: bdConfirm === id ? 'Confirm delete' : 'Delete', onclick: () => {
        if (bdConfirm !== id){ bdConfirm = id; renderBoards(); return; } bdConfirm = null; deleteBoard(id); } }));
    }
    box.appendChild(el('div', { class:'board' + (cur ? ' cur' : '') }, kids));
  });
}
function openBoard(id){
  saveNow(); const raw = lsGet(BOARDS + ':' + id); BX.current = id; saveIndex(); undo.length = 0;
  if (raw){ try { applyState(JSON.parse(raw)); } catch(e){ setStatus('That board could not be read', true); } }
  fit(); renderBoards(); setStatus('Opened ' + BX.boards[id].name);
}
function createBoard(name, stateText){ const id = newId(); BX.boards[id] = { name, updated: Date.now(), mapId: S.mapId }; BX.order.push(id); lsSet(BOARDS + ':' + id, stateText); return id; }
function deleteBoard(id){ const i = BX.order.indexOf(id); if (i < 0) return; const nm = BX.boards[id].name;
  BX.order.splice(i, 1); delete BX.boards[id]; lsDel(BOARDS + ':' + id);
  if (BX.current === id){ BX.current = BX.order[Math.max(0, i-1)]; saveIndex(); openBoard(BX.current); } else { saveIndex(); renderBoards(); }
  setStatus(nm + ' deleted'); }
$('bd-new').addEventListener('click', () => { saveNow();
  const o = JSON.parse(snapshot()); o.bases = []; o.reserve = []; o.markers = []; o.games = []; o.game = null; o.terrain = {}; o.nextId = 1;
  const id = createBoard('Board ' + (BX.order.length + 1), JSON.stringify(o)); saveIndex(); openBoard(id); setStatus('New board with the same armies. Deploy them from the Armies tab.'); });
$('bd-dup').addEventListener('click', () => { saveNow(); const id = createBoard((BX.boards[BX.current] || { name:'Board' }).name + ' copy', snapshot()); saveIndex(); openBoard(id); });

export { newId, renderBoards };
