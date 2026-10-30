import { IN } from './core.js';
import { S, M, T, sel } from './state.js';
import { pip, outline, rad, isHull, reach, basePoly } from './geometry.js';
import { drag } from './ui/pointer.js';

/* ---------- sight ---------- */
// Line-of-sight mask. Each watched model looks out from 6 or 8 points on its base edge. Walls, and terrain areas when
// S.los.areas is on, cast shadows away from each point; a spot is hidden when it is in shadow from every point.
// The mask is a canvas at LOS_MM per pixel. Each point's shadows are filled straight onto it with destination-in,
// which keeps only what is also in that point's shadow.
const LOS_MM = 4;                                   // compositing costs per pixel; 4 mm keeps a full army well under a second
const FAR = 4000;                                   // shadows run on past the board edge
let LA = null;                                      // the hidden-from-all mask
let losKey = null, losHid = null, losD2 = null, losW = 0, losH = 0, losMs = 0, losViews = 0, losUnits = 0;
let LO = null, loKey = null;                        // the overlay image, and the state it was drawn for

const losOn = () => S.los.on && S.los.watch.length > 0;
function watchers(){ const w = new Set(S.los.watch); return S.bases.filter(b => b.u && w.has(b.u)); }
function viewpoints(b){
  if (!isHull(b)) return outline(b, b.x, b.y, rad(b.rot), b.w <= 50 ? 6 : 8);   // 6 points stay within a mask pixel of a base up to 50 mm
  const c = basePoly(b, b.x, b.y, rad(b.rot)); return c.concat(c.map((q, i) => { const n = c[(i+1) % 4]; return [(q[0]+n[0])/2, (q[1]+n[1])/2]; }));
}
// Pieces that block sight, with the sign of their winding so the far-side edges can be found from any point.
function sightBlockers(){
  return T.filter(t => t.kind === 'scenery' ? !t.objective : S.los.areas).map(t => {
    const p = t.poly; let a = 0; for (let i = 0, j = p.length-1; i < p.length; j = i++) a += p[j][0]*p[i][1] - p[i][0]*p[j][1];
    return { p, s: a > 0 ? 1 : -1 };
  });
}
function computeSight(){
  const t0 = performance.now(), W = Math.ceil(M.W/LOS_MM), H = Math.ceil(M.H/LOS_MM);
  if (!LA) LA = document.createElement('canvas');
  if (LA.width !== W || LA.height !== H){ LA.width = W; LA.height = H; }
  const a = LA.getContext('2d');
  a.setTransform(1, 0, 0, 1, 0, 0); a.globalCompositeOperation = 'source-over'; a.fillStyle = '#000'; a.fillRect(0, 0, W, H);   // hidden until a viewpoint sees it
  a.setTransform(1/LOS_MM, 0, 0, 1/LOS_MM, 0, 0); a.globalCompositeOperation = 'destination-in';
  const blk = sightBlockers(), R = S.los.range*IN, ws = watchers(); let n = 0;
  for (const m of ws) for (const v of viewpoints(m)){
    const b = a; b.beginPath();
    for (const k of blk){
      const p = k.p; if (pip(v[0], v[1], p)) continue;            // a model inside an area sees out of it
      for (let i = 0, j = p.length-1; i < p.length; j = i++){
        let P = p[j], Q = p[i];
        // only edges with the viewpoint on their inner side: a sight line leaves the piece through them
        if (((Q[0]-P[0])*(v[1]-P[1]) - (Q[1]-P[1])*(v[0]-P[0])) * k.s <= 0) continue;
        if (k.s < 0){ const x = P; P = Q; Q = x; }                  // same winding for every quad, so nonzero fill never cancels
        const pl = Math.hypot(P[0]-v[0], P[1]-v[1]) || 1, ql = Math.hypot(Q[0]-v[0], Q[1]-v[1]) || 1;
        b.moveTo(P[0], P[1]); b.lineTo(Q[0], Q[1]);
        b.lineTo(Q[0] + (Q[0]-v[0])/ql*FAR, Q[1] + (Q[1]-v[1])/ql*FAR); b.lineTo(P[0] + (P[0]-v[0])/pl*FAR, P[1] + (P[1]-v[1])/pl*FAR); b.closePath();
      }
    }
    // Out of range is shadow too: the board wound like the quads, minus the range circle wound the other way.
    if (R > 0){ const e = LOS_MM; b.moveTo(-e, -e); b.lineTo(-e, M.H + e); b.lineTo(M.W + e, M.H + e); b.lineTo(M.W + e, -e); b.closePath();
      b.moveTo(v[0] + R, v[1]); b.arc(v[0], v[1], R, 0, 2*Math.PI); b.closePath(); }
    b.fill('nonzero'); n++;
  }
  a.setTransform(1, 0, 0, 1, 0, 0); a.globalCompositeOperation = 'source-over';
  const d = a.getImageData(0, 0, W, H).data, hid = new Uint8Array(W*H);
  for (let i = 0; i < W*H; i++) hid[i] = d[i*4 + 3] > 127 ? 1 : 0;
  losHid = hid; losD2 = edt(hid, W, H); losW = W; losH = H;
  losViews = n; losUnits = new Set(ws.map(m => m.u)).size; losMs = Math.round(performance.now() - t0);
}
// Squared distance in pixels from each hidden pixel to the nearest seen one (Felzenszwalb and Huttenlocher).
function edt(hid, W, H){
  const BIG = 1e20, D = new Float64Array(W*H), L = Math.max(W, H), f = new Float64Array(L), out = new Float64Array(L), v = new Int32Array(L), z = new Float64Array(L + 1);
  for (let i = 0; i < W*H; i++) D[i] = hid[i] ? BIG : 0;
  const pass = n => {
    let k = 0; v[0] = 0; z[0] = -BIG; z[1] = BIG;
    for (let q = 1; q < n; q++){
      let s = ((f[q] + q*q) - (f[v[k]] + v[k]*v[k])) / (2*q - 2*v[k]);
      while (s <= z[k]){ k--; s = ((f[q] + q*q) - (f[v[k]] + v[k]*v[k])) / (2*q - 2*v[k]); }
      k++; v[k] = q; z[k] = s; z[k+1] = BIG;
    }
    k = 0; for (let q = 0; q < n; q++){ while (z[k+1] < q) k++; out[q] = (q - v[k])*(q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < W; x++){ for (let y = 0; y < H; y++) f[y] = D[y*W + x]; pass(H); for (let y = 0; y < H; y++) D[y*W + x] = out[y]; }
  for (let y = 0; y < H; y++){ for (let x = 0; x < W; x++) f[x] = D[y*W + x]; pass(W); for (let x = 0; x < W; x++) D[y*W + x] = out[x]; }
  return D;
}
function sightKey(){
  const r1 = v => Math.round(v*10);
  return [M.id, S.los.areas, S.los.range].concat(T.map(t => t.kind[0] + (t.objective ? 'o' : '') + r1(t.c[0]) + ',' + r1(t.c[1]) + ',' + r1(t.poly[0][0]) + ',' + r1(t.poly[0][1])), '|',
    watchers().map(b => [b.u, r1(b.x), r1(b.y), r1(b.rot), b.w, b.h, b.shape || ''].join(','))).join(';');
}
// While a base is being dragged the last mask stays up; it catches up when the drag ends.
function sightFresh(){ if (drag && losHid) return; const k = sightKey(); if (k !== losKey){ computeSight(); losKey = k; } }
// With "any part seen" on, a spot is only safe if the selected unit's biggest base fits there wholly in shadow.
function fitRadius(){
  if (!S.los.partial || !sel || sel.type !== 'base') return 0;
  return Math.max(...(sel.b.u ? S.bases.filter(b => b.u === sel.b.u) : [sel.b]).map(reach));
}
const seenPx = (i, rr) => !losHid[i] || (rr > 0 && losD2[i] <= rr*rr);
function isSeen(x, y){
  if (!losOn() || x < 0 || y < 0 || x >= M.W || y >= M.H) return false; sightFresh();
  return seenPx(Math.floor(y/LOS_MM)*losW + Math.floor(x/LOS_MM), fitRadius()/LOS_MM);
}
function drawSight(c){
  if (!losOn()) return; sightFresh();
  const r = fitRadius(), k = losKey + '|' + r;
  if (k !== loKey){
    if (!LO) LO = document.createElement('canvas'); LO.width = losW; LO.height = losH;
    const o = LO.getContext('2d'), img = o.createImageData(losW, losH), px = img.data, rr = r/LOS_MM;
    for (let i = 0; i < losW*losH; i++) if (seenPx(i, rr)){ px[i*4] = 214; px[i*4+1] = 38; px[i*4+2] = 24; px[i*4+3] = 96; }
    o.putImageData(img, 0, 0); loKey = k;
  }
  c.save(); c.beginPath(); c.rect(0, 0, M.W, M.H); c.clip(); c.imageSmoothingEnabled = true; c.drawImage(LO, 0, 0, losW*LOS_MM, losH*LOS_MM); c.restore();
}
function sightStatus(){ return losOn() ? 'Seen by ' + losUnits + (losUnits === 1 ? ' watched unit' : ' watched units') + (S.los.range ? ' · ' + S.los.range + '" range' : '') + ' · red is in sight' : ''; }
const sightStats = () => ({ ms: losMs, views: losViews, units: losUnits });
function sightTime(){ losKey = null; sightFresh(); return losMs; }

export { isSeen, drawSight, sightStatus, sightStats, sightTime };
