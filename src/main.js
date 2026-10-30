import { STORE } from './core.js';
import { MAPS } from './maps.js';
import { S, M, T, loadTerrain, view, applyState, BOARDS, lsGet, BX, setBX, saveNow } from './state.js';
import { blockers, tryMove, edgeDist, cohIssues, moveGroup } from './geometry.js';
import { stage, resize, setStatus } from './render.js';
import { renderNewColours, renderInspector, buildMapSelect, setMap, syncRulesUI, renderChips } from './ui/panel.js';
import { parseRoster, deployUnit, footprint, deployAll, setUnitMove, renderArmies } from './armies.js';
import { readList } from './import.js';
import { newId, renderBoards } from './ui/boards.js';

/* ---------- boot ---------- */
function seedExample(){
  for (const k of ['friendly', 'hostile']) for (const un of parseRoster(S.armies[k].roster).units.sort((a, b) => footprint(b) - footprint(a))) deployUnit(k, un, true);
}
let restored = false;
try { const ix = JSON.parse(lsGet(BOARDS) || 'null'); if (ix && ix.order && ix.order.length && ix.boards){ setBX(ix); if (!BX.boards[BX.current]) BX.current = BX.order[0]; } } catch(e){}
if (BX.current){ const raw = lsGet(BOARDS + ':' + BX.current); if (raw){ try { applyState(JSON.parse(raw)); restored = true; } catch(e){} } }
else { const legacy = lsGet(STORE); if (legacy){ try { applyState(JSON.parse(legacy)); restored = true; } catch(e){} }
  const id = newId(); setBX({ current: id, order: [id], boards: { [id]: { name: 'Board 1', updated: Date.now(), mapId: S.mapId } } }); }
if (!restored){ loadTerrain(); seedExample(); buildMapSelect(); syncRulesUI(); renderChips(); renderInspector(); renderArmies(); }
saveNow(); renderBoards();
renderNewColours(); setUnitMove(S.unitMove);
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);
resize();
if (!restored) setStatus('Both example armies deployed. Change them in the Armies tab.');
window.__planner = { get S(){ return S; }, get M(){ return M; }, get T(){ return T; }, get BX(){ return BX; }, blockers, tryMove, moveGroup, parseRoster, readList, deployAll, setMap, cohIssues, edgeDist, view, MAPS };
