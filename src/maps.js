import { IN, DC } from './core.js';
import { fin } from './state.js';
import { pip } from './geometry.js';

/* ---------- maps ---------- */
function normMap(id, m){
  if (!m || typeof m.width !== 'number' || typeof m.height !== 'number' || !Array.isArray(m.terrain))
    throw new Error('A map needs "width", "height" and a "terrain" list.');
  const k = m.units === 'mm' ? 1 : IN;
  const P = (p, what) => {
    if (!Array.isArray(p) || p.length < 3 || p.some(q => !Array.isArray(q) || typeof q[0] !== 'number' || typeof q[1] !== 'number'))
      throw new Error(what + ' needs a "poly" of at least three [x, y] points.');
    return p.map(q => [q[0]*k, q[1]*k]);
  };
  return {
    id, name: String(m.name || id), W: m.width*k, H: m.height*k,
    zones: (m.zones || []).map(z => ({owner: z.owner, poly: P(z.poly, 'Each zone')})),
    markers: (m.markers || []).map(q => [q[0]*k, q[1]*k]),
    terrain: m.terrain.map((t, i) => {
      const poly = P(t.poly, 'Terrain piece ' + (i+1));
      const xs = poly.map(q => q[0]), ys = poly.map(q => q[1]);
      return { id: String(t.id || 't' + i), name: String(t.name || 'Terrain'), kind: (t.kind === 'scenery' || t.kind === 'feature' || t.kind === 'wall') ? 'scenery' : 'area',
        objective: t.objective || null, owner: t.owner || null, collision: t.collision === 'block' ? 'block' : 'allow', poly, g: t.g || undefined,
        deco: Array.isArray(t.deco) ? t.deco.map(q => [q[0]*k, q[1]*k]) : undefined, icon: Array.isArray(t.icon) ? [t.icon[0]*k, t.icon[1]*k] : undefined,
        bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        c: [xs.reduce((a,b)=>a+b,0)/xs.length, ys.reduce((a,b)=>a+b,0)/ys.length] };
    })
  };
}
const MAPS = {};
const DEFAULT_MAP = 'bm-take-vs-recon-01';
(function expand(){
  const AB = { 'take-and-hold':'TAH', 'disruption':'DIS', 'purge-the-foe':'PTF', 'priority-assets':'PA', 'reconnaissance':'REC' };
  const place = (pts, deg, x, y) => { const a = deg*Math.PI/180, c = Math.cos(a), s = Math.sin(a); return pts.map(q => [(c*q[0] - s*q[1] + x)*IN, (s*q[0] + c*q[1] + y)*IN]); };
  for (const l of (DC.layouts || [])){
    const dep = DC.deploy[l.d], zones = dep.z.map(z => ({ owner: z.owner, poly: z.poly.map(q => [q[0]*IN, q[1]*IN]) }));
    const areas = [], parts = [];
    l.p.forEach((p, i) => {
      const t = DC.tpl[p[0]], g = 'a' + (i+1);
      const it = { id: g, name: t.n, kind:'area', collision:'allow', g, objective: null, owner: null, poly: place(t.f, p[3], p[1], p[2]) };
      if (p[4]){ it.objective = { h:'home', c:'round', e:'diamond' }[p[4]]; it.icon = [p[5]*IN, p[6]*IN];
        if (it.objective === 'home'){ const z = zones.find(z => pip(it.icon[0], it.icon[1], z.poly)); it.owner = z ? z.owner : (p[6] > 30 ? 'blue' : 'red'); } }
      areas.push(fin(it));
      t.parts.forEach((q, j) => { const f = { id: g + '-' + (j+1), name: q.n, kind:'scenery', collision:'block', g, objective: null, owner: null, poly: place(q.p, p[3], p[1], p[2]) };
        if (q.d) f.deco = place(q.d, p[3], p[1], p[2]); parts.push(fin(f)); });
    });
    const A = DC.disp[l.a], B = DC.disp[l.b];
    MAPS[l.id] = { id: l.id, name: A + ' vs ' + B + ' ' + l.v + ' · ' + dep.n, group: A + ' vs ' + B, short: AB[l.a] + ' v ' + AB[l.b] + ' ' + l.v + ' · ' + dep.n,
      W: 44*IN, H: 60*IN, zones, markers: [], terrain: areas.concat(parts) };
  }
})();

export { normMap, MAPS, DEFAULT_MAP };
