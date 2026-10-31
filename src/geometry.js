import { IN } from './core.js';
import { S, M, T } from './state.js';

/* ---------- geometry (all in mm) ---------- */
function pip(px, py, poly){
  let c = false;
  for (let i = 0, j = poly.length-1; i < poly.length; j = i++){
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > py) !== (yj > py) && px < (xj-xi)*(py-yi)/(yj-yi) + xi) c = !c;
  }
  return c;
}
function segD2(ax, ay, bx, by){            // squared distance from origin to segment
  const dx = bx-ax, dy = by-ay, l = dx*dx + dy*dy;
  let t = l ? -(ax*dx + ay*dy)/l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t*dx, qy = ay + t*dy; return qx*qx + qy*qy;
}
const LIM = (1 - 1e-3) * (1 - 1e-3);
function unitHitsPoly(poly){               // unit circle at the origin against a polygon
  for (let i = 0, j = poly.length-1; i < poly.length; j = i++)
    if (segD2(poly[j][0], poly[j][1], poly[i][0], poly[i][1]) < LIM) return true;
  return pip(0, 0, poly);
}
// Map a polygon into the space where base b (at x, y, rot) is the unit circle. Exact for circles and ellipses.
function toUnit(b, x, y, r, poly){
  const a = b.w/2, bb = b.h/2, c = Math.cos(r), s = Math.sin(r);
  return poly.map(q => { const dx = q[0]-x, dy = q[1]-y; return [(dx*c + dy*s)/a, (-dx*s + dy*c)/bb]; });
}
function outline(b, x, y, r, n){
  const a = b.w/2, bb = b.h/2, c = Math.cos(r), s = Math.sin(r), out = [];
  for (let i = 0; i < n; i++){ const t = i/n*2*Math.PI, ex = a*Math.cos(t), ey = bb*Math.sin(t); out.push([x + ex*c - ey*s, y + ex*s + ey*c]); }
  return out;
}
const rad = d => d*Math.PI/180;
function extents(b, r){ const a = b.w/2, bb = b.h/2, c = Math.cos(r), s = Math.sin(r);
  if (b.shape === 'hull') return [Math.abs(a*c) + Math.abs(bb*s), Math.abs(a*s) + Math.abs(bb*c)];
  return [Math.hypot(a*c, bb*s), Math.hypot(a*s, bb*c)]; }
const isHull = b => b.shape === 'hull';
const reach = b => isHull(b) ? Math.hypot(b.w, b.h)/2 : Math.max(b.w, b.h)/2;
function basePoly(b, x, y, r, n){
  if (!isHull(b)) return outline(b, x, y, r, n || 48);
  const a = b.w/2 - 0.05, bb = b.h/2 - 0.05, c = Math.cos(r), s = Math.sin(r);
  return [[-a,-bb],[a,-bb],[a,bb],[-a,bb]].map(q => [x + q[0]*c - q[1]*s, y + q[0]*s + q[1]*c]);
}
function segCross(p, q, r, t){
  const o = (a, b, c) => (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
  const d1 = o(r, t, p), d2 = o(r, t, q), d3 = o(p, q, r), d4 = o(p, q, t);
  return d1*d2 < 0 && d3*d4 < 0;
}
function polysHit(A, B){
  for (let i = 0, j = A.length-1; i < A.length; j = i++)
    for (let k = 0, l = B.length-1; k < B.length; l = k++) if (segCross(A[j], A[i], B[l], B[k])) return true;
  return pip(A[0][0], A[0][1], B) || pip(B[0][0], B[0][1], A);
}
function clampToBoard(b, x, y, rotDeg){
  const e = extents(b, rad(rotDeg));
  return [Math.min(Math.max(x, e[0]), Math.max(e[0], M.W - e[0])), Math.min(Math.max(y, e[1]), Math.max(e[1], M.H - e[1]))];
}
function ruleOf(t){ return t.collision; }
function baseHitsBase(b, x, y, r, o){
  const R = reach(b) + reach(o), dx = o.x-x, dy = o.y-y, d2 = dx*dx + dy*dy;
  if (d2 >= R*R) return false;
  if (isHull(b) || isHull(o)) return polysHit(basePoly(b, x, y, r, 40), basePoly(o, o.x, o.y, rad(o.rot), 40));
  if (b.w === b.h && o.w === o.h) return Math.sqrt(d2) < b.w/2 + o.w/2 - 0.05;
  return unitHitsPoly(toUnit(b, x, y, r, outline(o, o.x, o.y, rad(o.rot), 64)));
}
function blockers(b, x, y, rotDeg, ignore, forceBases){
  const out = [], r = rad(rotDeg), R = reach(b); let hp = null;
  for (const t of T){
    if (ruleOf(t) !== 'block') continue;
    if (x+R < t.bb[0] || x-R > t.bb[2] || y+R < t.bb[1] || y-R > t.bb[3]) continue;
    if (isHull(b) ? polysHit(hp = hp || basePoly(b, x, y, r), t.poly) : unitHitsPoly(toUnit(b, x, y, r, t.poly))) out.push(t.name);
  }
  if (S.baseCollide || forceBases) for (const o of S.bases){
    if (o === b || (ignore && ignore.has(o))) continue;
    if (baseHitsBase(b, x, y, r, o)){ out.push(o.label ? 'base ' + o.label : 'another base'); break; }
  }
  return out;
}
function tryMove(b, tx, ty){
  [tx, ty] = clampToBoard(b, tx, ty, b.rot);
  const hit = blockers(b, tx, ty, b.rot);
  if (S.mode === 'flag' || !hit.length || blockers(b, b.x, b.y, b.rot).length){ b.x = tx; b.y = ty; return hit; }
  const free = (x, y) => blockers(b, x, y, b.rot).length === 0;
  const adv = (fx, fy, gx, gy) => { let lo = 0, hi = 1;
    for (let i = 0; i < 14; i++){ const m = (lo+hi)/2; if (free(fx+(gx-fx)*m, fy+(gy-fy)*m)) lo = m; else hi = m; }
    return [fx+(gx-fx)*lo, fy+(gy-fy)*lo]; };
  const q = adv(b.x, b.y, tx, ty);
  const a = free(tx, q[1]) ? [tx, q[1]] : adv(q[0], q[1], tx, q[1]);
  const c = free(q[0], ty) ? [q[0], ty] : adv(q[0], q[1], q[0], ty);
  const p = Math.abs(a[0]-q[0]) >= Math.abs(c[1]-q[1]) ? a : c;
  b.x = p[0]; b.y = p[1];
  return hit;
}
function edgeDist(a, b){
  if (!isHull(a) && !isHull(b) && a.w === a.h && b.w === b.h) return Math.max(0, Math.hypot(a.x-b.x, a.y-b.y) - a.w/2 - b.w/2);
  const A = basePoly(a, a.x, a.y, rad(a.rot), 28), B = basePoly(b, b.x, b.y, rad(b.rot), 28);
  if (polysHit(A, B)) return 0;
  let m = Infinity;
  const pass = (P, Q) => { for (const q of P) for (let i = 0, j = Q.length-1; i < Q.length; j = i++){ const d = segD2(Q[j][0]-q[0], Q[j][1]-q[1], Q[i][0]-q[0], Q[i][1]-q[1]); if (d < m) m = d; } };
  pass(A, B); pass(B, A); return Math.sqrt(m);
}
function cohIssues(){
  const out = new Map(); if (!S.coh.on) return out;
  const units = {}; for (const b of S.bases) if (b.u) (units[b.u] = units[b.u] || []).push(b);
  const lim = S.coh.dist*IN + 0.01;
  for (const u in units){
    const G = units[u]; if (G.length < 2) continue;
    const need = G.length >= S.coh.big ? 2 : 1, adj = G.map(() => []);
    for (let i = 0; i < G.length; i++) for (let j = i+1; j < G.length; j++){
      const reachSum = reach(G[i]) + reach(G[j]) + lim;
      if (Math.hypot(G[i].x-G[j].x, G[i].y-G[j].y) > reachSum) continue;
      if (edgeDist(G[i], G[j]) <= lim){ adj[i].push(j); adj[j].push(i); }
    }
    const bad = new Set(); G.forEach((b, i) => { if (adj[i].length < need) bad.add(b); });
    if (S.coh.group){ const seen = new Set([0]), st = [0]; while (st.length){ const i = st.pop(); for (const j of adj[i]) if (!seen.has(j)){ seen.add(j); st.push(j); } }
      if (seen.size < G.length){ let big = seen; /* mark the smaller part */ const rest = G.map((_, i) => i).filter(i => !seen.has(i));
        (rest.length <= seen.size ? rest : [...seen]).forEach(i => bad.add(G[i])); } }
    if (bad.size) out.set(u, bad);
  }
  return out;
}
function ringPath(c, b, d, x, y){
  const cx = x === undefined ? b.x : x, cy = y === undefined ? b.y : y, r = rad(b.rot), co = Math.cos(r), si = Math.sin(r), a = b.w/2, bb = b.h/2;
  const P = (lx, ly) => [cx + lx*co - ly*si, cy + lx*si + ly*co];
  c.moveTo(...P(a + d, 0));
  if (isHull(b)){
    const corners = [[a, bb, 0], [-a, bb, 90], [-a, -bb, 180], [a, -bb, 270]];
    for (const [lx, ly, st] of corners){ for (let k = 0; k <= 8; k++){ const t = rad(st + k*90/8); c.lineTo(...P(lx + d*Math.cos(t), ly + d*Math.sin(t))); } }
  } else {
    for (let k = 1; k <= 96; k++){ const t = k/96*2*Math.PI, ex = a*Math.cos(t), ey = bb*Math.sin(t), nx = bb*Math.cos(t), ny = a*Math.sin(t), nl = Math.hypot(nx, ny) || 1;
      c.lineTo(...P(ex + nx/nl*d, ey + ny/nl*d)); }
  }
  c.closePath();
}
function moveGroup(G, dx, dy){
  for (const b of G){ const e = extents(b, rad(b.rot));
    dx = Math.min(Math.max(dx, e[0] - b.x), M.W - e[0] - b.x); dy = Math.min(Math.max(dy, e[1] - b.y), M.H - e[1] - b.y); }
  const ign = new Set(G);
  const hitsAt = (ex, ey) => { for (const b of G){ const h = blockers(b, b.x + ex, b.y + ey, b.rot, ign); if (h.length) return h; } return []; };
  const apply = (ex, ey) => { for (const b of G){ b.x += ex; b.y += ey; } };
  const hit = hitsAt(dx, dy);
  if (S.mode === 'flag' || !hit.length || hitsAt(0, 0).length){ apply(dx, dy); return hit; }
  const free = (ex, ey) => !hitsAt(ex, ey).length;
  const adv = (fx, fy, gx, gy) => { let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++){ const m = (lo+hi)/2; if (free(fx+(gx-fx)*m, fy+(gy-fy)*m)) lo = m; else hi = m; }
    return [fx+(gx-fx)*lo, fy+(gy-fy)*lo]; };
  const q = adv(0, 0, dx, dy);
  const a = adv(q[0], q[1], dx, q[1]), c = adv(q[0], q[1], q[0], dy);
  const pck = Math.abs(a[0]-q[0]) >= Math.abs(c[1]-q[1]) ? a : c;
  apply(pck[0], pck[1]); return hit;
}
function findSpot(b, cx, cy){
  for (let ring = 0; ring < 60; ring++){
    const n = ring ? ring*8 : 1, d = ring * (Math.min(b.w, b.h)/2 + 3);
    for (let i = 0; i < n; i++){
      const t = i/n*2*Math.PI, p = clampToBoard(b, cx + d*Math.cos(t), cy + d*Math.sin(t), b.rot);
      if (!blockers(b, p[0], p[1], b.rot).length) return p;
    }
  }
  return clampToBoard(b, cx, cy, b.rot);
}

export { segCross, pip, segD2, rad, extents, isHull, basePoly, clampToBoard, ruleOf, blockers, tryMove, edgeDist, cohIssues, ringPath, moveGroup, findSpot, outline, reach };
