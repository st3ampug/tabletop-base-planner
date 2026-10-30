import { IN, $ } from '../core.js';
import { S, sel, pushUndo, save } from '../state.js';
import { isHull, tryMove, moveGroup } from '../geometry.js';
import { dirty } from '../render.js';
import { removeSel, dupSel, rotateSel } from './actions.js';
import { renderInspector } from './panel.js';

/* ---------- keyboard ---------- */
window.addEventListener('keydown', e => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){ e.preventDefault(); $('btn-undo').click(); return; }
  if (!sel || sel.type !== 'base') return; const b = sel.b, step = e.shiftKey ? IN : 1;
  const mv = { ArrowLeft:[-step,0], ArrowRight:[step,0], ArrowUp:[0,-step], ArrowDown:[0,step] }[e.key];
  if (mv){ e.preventDefault(); pushUndo(); if (S.unitMove && b.u) moveGroup(S.bases.filter(x => x.u === b.u), mv[0], mv[1]); else tryMove(b, b.x + mv[0], b.y + mv[1]); save(); dirty(); }
  else if (e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); removeSel(); }
  else if (e.key.toLowerCase() === 'r' && (b.w !== b.h || isHull(b))){ pushUndo(); rotateSel(b.rot + 15); renderInspector(); }
  else if (e.key.toLowerCase() === 'd'){ dupSel(); }
});
