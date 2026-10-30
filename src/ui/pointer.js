import { S, M, T, xform, groupOf, commitTerrain, view, ruler, snapshot, pushUndo, save } from '../state.js';
import { pip, segD2, rad, isHull, tryMove, moveGroup } from '../geometry.js';
import { cv, cssW, cssH, s2w, dirty, liveMsg, clearLiveMsg, setStatus } from '../render.js';
import { editTerrain, select } from './actions.js';

/* ---------- pointer input ---------- */
let drag = null;           // live move overlay {sx, sy, b}
const ptrs = new Map(); let g = null;
function hitBase(x, y){
  const w = s2w(x, y);
  for (let i = S.bases.length-1; i >= 0; i--){
    const b = S.bases[i], r = rad(b.rot), c = Math.cos(r), sn = Math.sin(r), dx = w[0]-b.x, dy = w[1]-b.y;
    const a = Math.max(b.w/2 + 5/view.s, 15/view.s), bb = Math.max(b.h/2 + 5/view.s, 15/view.s);
    const u = (dx*c + dy*sn)/a, v = (-dx*sn + dy*c)/bb;
    if (isHull(b) ? (Math.abs(u) <= 1 && Math.abs(v) <= 1) : u*u + v*v <= 1) return b;
  }
  return null;
}
function hitTerrain(w){
  const tol = 7/view.s, tol2 = tol*tol;
  for (let pass = 0; pass < 2; pass++) for (let i = T.length-1; i >= 0; i--){
    const t = T[i]; if ((t.kind === 'scenery') !== (pass === 0)) continue;
    if (w[0] < t.bb[0]-tol || w[0] > t.bb[2]+tol || w[1] < t.bb[1]-tol || w[1] > t.bb[3]+tol) continue;
    if (pip(w[0], w[1], t.poly)) return t;
    if (pass === 0) for (let a = 0, b = t.poly.length-1; a < t.poly.length; b = a++)
      if (segD2(t.poly[b][0]-w[0], t.poly[b][1]-w[1], t.poly[a][0]-w[0], t.poly[a][1]-w[1]) < tol2) return t;
  }
  return null;
}
function pos(e){ const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  try { cv.setPointerCapture(e.pointerId); } catch(_){}
  const p = pos(e); ptrs.set(e.pointerId, p);
  if (ptrs.size === 2){
    if (g && g.type === 'base' && g.moved){ drag = null; save(); }
    const a = [...ptrs.values()];
    g = { type:'pinch', d0: Math.hypot(a[0][0]-a[1][0], a[0][1]-a[1][1]) || 1, m0: [(a[0][0]+a[1][0])/2, (a[0][1]+a[1][1])/2], s0: view.s, ox: view.ox, oy: view.oy };
    return;
  }
  if (ptrs.size > 2) return;
  const w = s2w(p[0], p[1]);
  if (ruler.on){ g = { type:'ruler' }; ruler.a = w; ruler.b = w; dirty(); return; }
  const b = hitBase(p[0], p[1]);
  if (b){ select({ type:'base', b }); const G = S.unitMove && b.u ? S.bases.filter(x => x.u === b.u) : [b];
    g = { type:'base', b, G, sx: b.x, sy: b.y, dx: w[0]-b.x, dy: w[1]-b.y, p, moved:false, snap: snapshot() }; }
  else {
    const t = editTerrain ? hitTerrain(w) : null;
    if (t){ select({ type:'terrain', t }); g = { type:'terrain', t, last: w, p, moved:false, snap: snapshot() }; }
    else g = { type:'pan', p, ox: view.ox, oy: view.oy, moved:false };
  }
  cv.style.cursor = 'grabbing';
});
cv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  const p = pos(e); ptrs.set(e.pointerId, p); if (!g) return;
  if (g.type === 'pinch'){
    if (ptrs.size < 2) return;
    const a = [...ptrs.values()], d = Math.hypot(a[0][0]-a[1][0], a[0][1]-a[1][1]) || 1, m = [(a[0][0]+a[1][0])/2, (a[0][1]+a[1][1])/2];
    const ns = clampScale(g.s0 * d/g.d0), k = ns/g.s0;
    view.s = ns; view.ox = m[0] - (g.m0[0] - g.ox)*k; view.oy = m[1] - (g.m0[1] - g.oy)*k; dirty(); return;
  }
  const w = s2w(p[0], p[1]);
  if (g.type === 'ruler'){ ruler.b = w; dirty(); return; }
  if (!g.moved && Math.hypot(p[0]-g.p[0], p[1]-g.p[1]) < (e.pointerType === 'mouse' ? 3 : 7)) return;
  if (g.type === 'pan'){ g.moved = true; view.ox = g.ox + p[0]-g.p[0]; view.oy = g.oy + p[1]-g.p[1]; dirty(); return; }
  if (g.type === 'terrain'){
    if (!g.moved){ g.moved = true; pushUndo(g.snap); }
    let dx = w[0]-g.last[0], dy = w[1]-g.last[1]; const t = g.t;
    dx = Math.min(Math.max(dx, -t.c[0]), M.W - t.c[0]); dy = Math.min(Math.max(dy, -t.c[1]), M.H - t.c[1]);
    groupOf(t).forEach(x => xform(x, q => [q[0]+dx, q[1]+dy])); g.last = [g.last[0]+dx, g.last[1]+dy]; dirty(); return;
  }
  if (g.type === 'base'){
    if (!g.moved){ g.moved = true; pushUndo(g.snap); drag = { b: g.b, sx: g.sx, sy: g.sy }; }
    const hit = g.G.length > 1 ? moveGroup(g.G, w[0]-g.dx - g.b.x, w[1]-g.dy - g.b.y) : tryMove(g.b, w[0]-g.dx, w[1]-g.dy);
    if (hit.length) setStatus((S.mode === 'stop' ? 'Blocked by ' : 'Overlaps ') + hit[0], true); else if (liveMsg){ clearLiveMsg(); }
    dirty();
  }
});
function endPtr(e){
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId); cv.style.cursor = ruler.on ? 'crosshair' : 'grab';
  if (!g) return;
  if (g.type === 'pinch'){ if (ptrs.size < 2){ g = ptrs.size ? { type:'idle' } : null; } return; }
  if (g.type === 'idle'){ if (!ptrs.size) g = null; return; }
  if (g.type === 'pan' && !g.moved){
    const p = pos(e), w = s2w(p[0], p[1]);
    const t = hitTerrain(w); select(t ? { type:'terrain', t } : null);
  }
  if (g.type === 'base' && g.moved){ drag = null; save(); }
  if (g.type === 'terrain' && g.moved) commitTerrain();
  g = null; dirty();
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
function clampScale(s){ const base = Math.min(cssW/M.W, cssH/M.H); return Math.min(Math.max(s, base*0.5), 6); }
cv.addEventListener('wheel', e => {
  e.preventDefault(); const p = pos(e), ns = clampScale(view.s * Math.exp(-e.deltaY*(e.ctrlKey ? 0.01 : 0.0016))), k = ns/view.s;
  view.ox = p[0] - (p[0]-view.ox)*k; view.oy = p[1] - (p[1]-view.oy)*k; view.s = ns; dirty();
}, { passive:false });

export { drag };
