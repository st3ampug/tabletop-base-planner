import { IN, $ } from './core.js';
import { S, M, T, sel, view, ruler } from './state.js';
import { rad, isHull, ruleOf, blockers, cohIssues, ringPath } from './geometry.js';
import { drag } from './ui/pointer.js';
import { updateBaseWarn } from './ui/panel.js';
import { drawSight, sightStatus } from './sight.js';

/* ---------- canvas ---------- */
const cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage');
let cssW = 300, cssH = 300, raf = 0, fitted = false;
function resize(){
  const r = stage.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cssW = r.width; cssH = r.height; cv.width = Math.round(cssW*dpr); cv.height = Math.round(cssH*dpr);
  if (!fitted){ fit(); fitted = true; }
  dirty();
}
function fit(){
  const pad = 14, top = 54; view.s = Math.min((cssW - 2*pad)/M.W, (cssH - top - pad)/M.H);
  view.ox = (cssW - M.W*view.s)/2; view.oy = top + (cssH - top - pad - M.H*view.s)/2; dirty();
}
const s2w = (x, y) => [(x - view.ox)/view.s, (y - view.oy)/view.s];
function dirty(){ if (!raf) raf = requestAnimationFrame(draw); }
function path(poly){ ctx.beginPath(); poly.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); }
function lum(hex){ const n = parseInt(hex.slice(1), 16); return (0.299*(n>>16) + 0.587*((n>>8)&255) + 0.114*(n&255))/255; }

const ZONE = { red:'rgba(128,28,18,.80)', blue:'rgba(47,86,118,.82)' };
function skull(r){
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -r*0.12, r*0.5, 0, 7); ctx.fill();
  ctx.fillRect(-r*0.28, r*0.15, r*0.56, r*0.38);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(-r*0.2, -r*0.1, r*0.13, 0, 7); ctx.arc(r*0.2, -r*0.1, r*0.13, 0, 7); ctx.fill();
}
function objIcon(t){
  const r = 0.95*IN, o = t.icon || t.c; ctx.save(); ctx.translate(o[0], o[1]); ctx.globalAlpha = 0.9; ctx.lineWidth = r*0.14; ctx.strokeStyle = '#fff';
  if (t.objective === 'home'){
    ctx.fillStyle = t.owner === 'red' ? '#7d1b12' : '#2c5578'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; const u = r*0.2;
    ctx.fillRect(-2.5*u, -1*u, 5*u, 3.2*u); for (const x of [-2.5, -0.5, 1.5]) ctx.fillRect(x*u, -2.4*u, u, 1.5*u);
    ctx.fillStyle = t.owner === 'red' ? '#7d1b12' : '#2c5578'; ctx.fillRect(-0.6*u, 0.6*u, 1.2*u, 1.6*u);
  } else if (t.objective === 'diamond'){
    ctx.fillStyle = '#4f9a86'; ctx.beginPath(); ctx.moveTo(0, -r*1.25); ctx.lineTo(r*1.25, 0); ctx.lineTo(0, r*1.25); ctx.lineTo(-r*1.25, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); skull(r);
  } else {
    ctx.fillStyle = '#0f6b55'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke(); skull(r);
  }
  ctx.restore();
}
let RC = null;
function ringCanvas(){ if (!RC) RC = document.createElement('canvas'); if (RC.width !== cv.width || RC.height !== cv.height){ RC.width = cv.width; RC.height = cv.height; } return RC; }
function ellipsePath(b, grow, x, y){
  const g0 = grow || 0, cx = x === undefined ? b.x : x, cy = y === undefined ? b.y : y; ctx.beginPath();
  if (!isHull(b)){ ctx.ellipse(cx, cy, b.w/2 + g0, b.h/2 + g0, rad(b.rot), 0, 2*Math.PI); return; }
  const a = b.w/2 + g0, bb = b.h/2 + g0, r = rad(b.rot), c = Math.cos(r), s = Math.sin(r);
  [[-a,-bb],[a,-bb],[a,bb],[-a,bb]].forEach((q, i) => { const px_ = cx + q[0]*c - q[1]*s, py_ = cy + q[0]*s + q[1]*c; i ? ctx.lineTo(px_, py_) : ctx.moveTo(px_, py_); });
  ctx.closePath();
}
function tag(text, x, y, warn){
  ctx.save(); ctx.setTransform(1,0,0,1,0,0); const dpr = cv.width/cssW; ctx.scale(dpr, dpr);
  ctx.font = '600 13px ' + getComputedStyle(document.body).fontFamily; const w = ctx.measureText(text).width + 12;
  const px = Math.min(Math.max(x*view.s + view.ox - w/2, 4), cssW - w - 4), py = Math.max(y*view.s + view.oy - 30, 4);
  ctx.fillStyle = warn ? '#8f1d17' : 'rgba(10,14,13,.88)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px, py, w, 22, 5) : ctx.rect(px, py, w, 22); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(text, px + 6, py + 11.5); ctx.restore();
}
function draw(){
  raf = 0;
  const dpr = cv.width/cssW, s = view.s, px = 1/s;
  ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr*s, 0, 0, dpr*s, dpr*view.ox, dpr*view.oy);
  // mat
  ctx.fillStyle = '#dedbd0'; ctx.fillRect(0, 0, M.W, M.H);
  for (const z of M.zones){ path(z.poly); ctx.fillStyle = ZONE[z.owner] || 'rgba(0,0,0,.2)'; ctx.fill(); }
  ctx.lineWidth = px; ctx.strokeStyle = 'rgba(40,50,46,.16)'; ctx.beginPath();
  for (let x = IN; x < M.W - 1; x += IN){ ctx.moveTo(x, 0); ctx.lineTo(x, M.H); }
  for (let y = IN; y < M.H - 1; y += IN){ ctx.moveTo(0, y); ctx.lineTo(M.W, y); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(20,26,24,.6)'; ctx.setLineDash([3*px, 5*px]); ctx.lineWidth = 1.5*px; ctx.beginPath();
  ctx.moveTo(M.W/2, 0); ctx.lineTo(M.W/2, M.H); ctx.moveTo(0, M.H/2); ctx.lineTo(M.W, M.H/2); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#0c100f'; ctx.lineWidth = 2*px; ctx.strokeRect(0, 0, M.W, M.H);
  // terrain
  for (const t of T){
    const block = ruleOf(t) === 'block', isSel = sel && sel.type === 'terrain' && sel.t === t;
    const solid = t.kind === 'scenery';
    if (t.deco){ path(t.deco); ctx.fillStyle = 'rgba(15,107,85,.17)'; ctx.fill(); ctx.lineWidth = px; ctx.strokeStyle = 'rgba(15,107,85,.55)'; ctx.stroke(); }
    path(t.poly); ctx.fillStyle = solid ? (block ? '#35554c' : 'rgba(120,150,140,.45)') : '#cdd0cd'; ctx.fill();
    if (block && !solid){
      ctx.save(); path(t.poly); ctx.clip(); ctx.strokeStyle = 'rgba(60,30,20,.38)'; ctx.lineWidth = 0.09*IN; ctx.beginPath();
      const w = t.bb[2]-t.bb[0], h = t.bb[3]-t.bb[1];
      for (let d = -h; d < w; d += 0.5*IN){ ctx.moveTo(t.bb[0]+d, t.bb[1]); ctx.lineTo(t.bb[0]+d+h, t.bb[3]); }
      ctx.stroke(); ctx.restore();
    }
    path(t.poly); ctx.lineWidth = (block && !solid ? 2.5 : 1.5)*px; ctx.strokeStyle = solid ? '#16241f' : block ? '#4a2318' : '#4c5653';
    ctx.setLineDash(block ? [] : [6*px, 4*px]); ctx.stroke(); ctx.setLineDash([]);
    if (isSel){ path(t.poly); ctx.lineWidth = 4*px; ctx.strokeStyle = '#ffd23f'; ctx.stroke(); }
    if (t.objective) continue;
    if (!t.g && s*IN > 9){
      ctx.fillStyle = 'rgba(25,32,30,.75)'; ctx.font = '600 ' + 0.62*IN + 'px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t.name, t.c[0], t.c[1]);
    }
  }
  for (const t of T) if (t.objective) objIcon(t);
  for (const m of M.markers){ ctx.fillStyle = 'rgba(20,26,24,.55)'; ctx.beginPath(); ctx.moveTo(m[0], m[1]-12); ctx.lineTo(m[0]+12, m[1]); ctx.lineTo(m[0], m[1]+12); ctx.lineTo(m[0]-12, m[1]); ctx.fill(); }
  drawSight(ctx);
  // bases
  let badCount = 0; const selUnit = sel && sel.type === 'base' && S.unitMove ? sel.b.u : null;
  const coh = cohIssues(); let cohUnits = [];
  coh.forEach((set, u) => cohUnits.push(u.split(':')[1] + ' (' + set.size + ')'));
  if (S.ring > 0 && sel && sel.type === 'base'){
    const G = selUnit ? S.bases.filter(b => b.u === selUnit) : [sel.b], d = S.ring*IN;
    ctx.beginPath(); for (const b of G) ringPath(ctx, b, d); ctx.fillStyle = 'rgba(255,210,63,.16)'; ctx.fill('nonzero');
    const rc = ringCanvas(); const r = rc.getContext('2d'); r.setTransform(1,0,0,1,0,0); r.clearRect(0, 0, rc.width, rc.height);
    r.setTransform(ctx.getTransform()); r.beginPath(); for (const b of G) ringPath(r, b, d); r.lineWidth = 2.2*px; r.strokeStyle = '#ffd23f'; r.setLineDash([7*px, 4*px]); r.stroke();
    r.globalCompositeOperation = 'destination-out'; r.beginPath(); for (const b of G) ringPath(r, b, d - 1.6*px); r.fill('nonzero'); r.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(rc, 0, 0); ctx.restore();
  }
  for (const b of S.bases){
    const bad = blockers(b, b.x, b.y, b.rot); b._bad = bad; if (bad.length) badCount++;
    ellipsePath(b); ctx.fillStyle = b.colour; ctx.fill();
    ctx.lineWidth = Math.max(1.2*px, 1); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.stroke();
    ellipsePath(b, -Math.min(b.w, b.h)*0.09); ctx.lineWidth = Math.max(px, 0.6); ctx.strokeStyle = lum(b.colour) > 0.55 ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.35)'; ctx.stroke();
    if (bad.length){ ellipsePath(b, 1.5*px); ctx.lineWidth = 3*px; ctx.strokeStyle = '#ff2d1a'; ctx.setLineDash([5*px, 3*px]); ctx.stroke(); ctx.setLineDash([]);
      ellipsePath(b); ctx.fillStyle = 'rgba(255,45,26,.35)'; ctx.fill(); }
    if (b.label){
      const fs = Math.min(b.h*0.5, b.w*1.5/Math.max(b.label.length, 2));
      if (fs*s >= 6){ ctx.fillStyle = lum(b.colour) > 0.55 ? '#111' : '#fff'; ctx.font = '700 ' + fs + 'px ' + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.label, b.x, b.y + fs*0.05); }
    }
    if (isHull(b)){ const r = rad(b.rot), f = b.w/2 - Math.min(b.w, b.h)*0.18; ctx.beginPath(); ctx.moveTo(b.x + Math.cos(r)*f, b.y + Math.sin(r)*f); ctx.lineTo(b.x + Math.cos(r)*(b.w/2 - 2), b.y + Math.sin(r)*(b.w/2 - 2));
      ctx.lineWidth = Math.max(2*px, 1.5); ctx.strokeStyle = lum(b.colour) > 0.55 ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.6)'; ctx.stroke(); }
    const cb = b.u && coh.get(b.u);
    if (cb && cb.has(b)){ ellipsePath(b, 2.5*px); ctx.lineWidth = 2.6*px; ctx.strokeStyle = '#ff9f1a'; ctx.setLineDash([3*px, 3*px]); ctx.stroke(); ctx.setLineDash([]); }
    if (selUnit && b.u === selUnit && !(sel && sel.b === b)){ ellipsePath(b, 2*px); ctx.lineWidth = 1.8*px; ctx.strokeStyle = '#ffd23f'; ctx.stroke(); }
    if (sel && sel.type === 'base' && sel.b === b){ ellipsePath(b, 3*px); ctx.lineWidth = 2.5*px; ctx.strokeStyle = '#ffd23f'; ctx.stroke(); ellipsePath(b, 4.6*px); ctx.lineWidth = px; ctx.strokeStyle = '#000'; ctx.stroke(); }
  }
  // overlays
  if (drag){
    const b = drag.b, d = Math.hypot(b.x - drag.sx, b.y - drag.sy);
    ellipsePath(b, 0, drag.sx, drag.sy); ctx.setLineDash([4*px, 4*px]); ctx.lineWidth = 1.5*px; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(drag.sx, drag.sy); ctx.lineTo(b.x, b.y); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2*px; ctx.stroke(); ctx.setLineDash([]);
    if (d > 0.5) tag((d/IN).toFixed(1) + '"', b.x, b.y - b.h/2);
  }
  if (ruler.a && ruler.b){
    ctx.beginPath(); ctx.moveTo(ruler.a[0], ruler.a[1]); ctx.lineTo(ruler.b[0], ruler.b[1]); ctx.strokeStyle = '#000'; ctx.lineWidth = 4*px; ctx.stroke();
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2*px; ctx.stroke();
    for (const p of [ruler.a, ruler.b]){ ctx.beginPath(); ctx.arc(p[0], p[1], 4*px, 0, 7); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = px; ctx.strokeStyle = '#000'; ctx.stroke(); }
    const d = Math.hypot(ruler.b[0]-ruler.a[0], ruler.b[1]-ruler.a[1]);
    tag((d/IN).toFixed(1) + '"  ·  ' + Math.round(d) + ' mm', ruler.b[0], ruler.b[1]);
  }
  if (S.ring > 0 && sel && sel.type === 'base') tag(S.ring + '" ring', sel.b.x, sel.b.y - sel.b.h/2 - S.ring*IN);
  if (!liveMsg){ const parts = [];
    if (badCount) parts.push(badCount + (badCount === 1 ? ' base is' : ' bases are') + ' in an illegal position');
    if (cohUnits.length) parts.push('Out of coherency: ' + cohUnits.join(', '));
    setStatus(parts.length ? parts.join(' · ') : sightStatus(), !!parts.length, true); }
  if (sel && sel.type === 'base') updateBaseWarn();
}
let liveMsg = false, msgT = 0;
const clearLiveMsg = () => { liveMsg = false; };
function setStatus(text, warn, passive){
  const el = $('status'); if (el.textContent !== text) el.textContent = text; el.className = warn ? 'warn' : '';
  if (!passive){ liveMsg = true; clearTimeout(msgT); msgT = setTimeout(() => { liveMsg = false; dirty(); }, 2200); }
}

export { cv, stage, cssW, cssH, resize, fit, s2w, dirty, lum, ZONE, liveMsg, clearLiveMsg, setStatus };
