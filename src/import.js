import { CAT, $ } from './core.js';
import { S, setSel, sel, pushUndo, PR, savePrefs, save } from './state.js';
import { dirty, setStatus } from './render.js';
import { el, renderInspector } from './ui/panel.js';
import { armyView, setArmyView, SIDE_NAME, parseRoster, deployUnit, footprint, renderArmies } from './armies.js';

/* ---------- army list import ---------- */
const CHAPTERS = /\b(ultramarines|imperial fists|blood angels|dark angels|space wolves|black templars|salamanders|raven guard|iron hands|white scars|crimson fists|deathwatch|space marines|adeptus astartes)\b/i;
const STOPW = new Set(['the','of','in','with','squad','a','and','armour','armor','unit','on']);
function toks(s){ return String(s).toLowerCase().replace(/[’'`]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w && !STOPW.has(w)).map(w => w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w); }
const CATT = (CAT.units || []).map(u => ({ u, t: new Set(toks(u[0])) }));
function score(q, T){ if (!q.length || !T.size) return 0; let i = 0; for (const w of new Set(q)) if (T.has(w)) i++; if (!i) return 0; const un = new Set([...q, ...T]).size; return 0.7*i/new Set(q).size + 0.3*i/un; }
function matchUnit(name, fac){
  const q = toks(name); let best = null, bs = 0;
  for (const c of CATT){ let s = score(q, c.t); if (!s) continue; if (fac !== null && c.u[1] === fac) s += 0.06; if (s > bs || (s === bs && best && c.u[0].length < best[0].length)){ bs = s; best = c.u; } }
  return bs >= 0.62 ? best : null;
}
function detectFaction(text, heads){
  const fs = CAT.factions || [], low = text.toLowerCase().replace(/[’']/g, '');
  if (CHAPTERS.test(text)) return fs.indexOf('adeptus-astartes');
  for (let i = 0; i < fs.length; i++) if (low.indexOf(fs[i].replace(/-/g, ' ')) >= 0) return i;
  const votes = {}; for (const h of heads){ const q = toks(h); for (const c of CATT) if (score(q, c.t) >= 0.99) votes[c.u[1]] = (votes[c.u[1]] || 0) + 1; }
  let bf = null, bv = 0; for (const k in votes) if (votes[k] > bv){ bv = votes[k]; bf = +k; } return bf;
}
const sizeTxt = c => !c ? '' : c[0] === 'r' ? c.slice(1) : c[0] === 'o' ? c.slice(1) : '';
function initials(name, n){ const w = toks(name).filter(x => !/^\d+$/.test(x)); if (!w.length) return 'U';
  return (w.length === 1 ? w[0].slice(0, 3) : w.map(x => x[0]).join('').slice(0, n || 3)).toUpperCase(); }
function readList(text){
  const lines = String(text).split(/\r?\n/), entries = [], heads = []; let group = null, gid = 0, cur = null;
  const SECTION = /^(characters?|battleline|dedicated transports?|transports?|other datasheets|other|fortifications?|allied units|epic heroes|monsters?|vehicles?|infantry|attached units?)\s*:?$/i;
  let title = '';
  for (const raw of lines){
    const line = raw.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim(); if (!line) continue;
    if (/^attached unit\b/i.test(line)){ group = 'g' + (++gid); cur = null; continue; }
    if (SECTION.test(line)){ group = null; cur = null; continue; }
    if (/attached as:/i.test(line) || /^(exported with|data version|app version)/i.test(line)) continue;
    const bullet = /^[•\-*·◦▪]/.test(line), pts = line.match(/\((\d{1,4})\s*(?:pts?|points?)?\)/i);
    if (!title && pts && +pts[1] >= 500) title = line.replace(/\(.*$/, '').trim();
    if (!bullet && pts && +pts[1] < 1000){
      let name = line.replace(/^\+\s*/, ''), cnt = null; const plus = /^\+/.test(line);
      const m = name.match(/^(\d+)\s*[x×]\s*(.+)$/i); if (m){ cnt = +m[1]; name = m[2]; }
      name = name.split(/\s+[–—-]\s+|,|\(/)[0].trim(); if (!name || /:/.test(name)) continue;
      cur = { name, cnt, models: [], plus, group }; entries.push(cur); heads.push(name); continue;
    }
    if (!title && !pts && !bullet && entries.length === 0 && !/^(errors?|strike force|incursion|onslaught)/i.test(line)) title = line.replace(/[:–—-]\s*\d+\/\d+.*$/, '').replace(/:$/, '').trim();
    if (cur){ const mm = line.replace(/^[•\-*·◦▪]\s*/, '').match(/^(\d+)\s*[x×]\s*(.+)$/i); if (mm) cur.models.push([+mm[1], mm[2].trim()]); }
  }
  // "+" lines join the unit above them
  for (let i = 0; i < entries.length; i++) if (entries[i].plus && i > 0){ const prev = entries[i-1]; if (!prev.group) prev.group = 'g' + (++gid); entries[i].group = prev.group; }
  const fac = detectFaction(text, heads);
  // build model groups per entry
  for (const e of entries){
    const u = matchUnit(e.name, fac); e.unit = u; e.parts = []; e.flags = [];
    if (!u){ e.flags.push('Not found in the unit list. Enter the bases.'); e.parts.push({ n: e.cnt || 1, size: '', label: initials(e.name) }); continue; }
    const comp = (u[5] || [[u[0], u[3], u[4], u[2]]]).map(m => ({ name: m[0], min: m[1], max: m[2], code: m[3] || u[2], n: 0 }));
    let counted = false;
    for (const [n, nm] of e.models){ const q = toks(nm); let bi = -1, bs = 0;
      comp.forEach((c, i) => { const T = new Set(toks(c.name)); const s = score(q, T) + (q.length === T.size ? 0.05 : 0); if (s > bs){ bs = s; bi = i; } });
      if (bi >= 0 && bs >= 0.99){ comp[bi].n += n; counted = true; } }
    if (!counted){ const total = e.cnt || u[3] || 1; comp.forEach(c => c.n = Math.min(c.min, total)); let left = total - comp.reduce((a, c) => a + c.n, 0);
      const main = comp.reduce((a, c) => (c.max - c.min) > (a.max - a.min) ? c : a, comp[0]); main.n += Math.max(0, left); }
    for (const c of comp) if (c.n > 0){
      let size = sizeTxt(c.code), remembered = false;
      if (!size){ const memo = PR.sizes[u[0]]; if (memo){ size = memo; remembered = true; } else e.flags.push((c.code === 'h' ? 'Vehicle hull with no size in the data' : 'No base size in the data') + ' for ' + c.name + '. Measure it and enter e.g. ' + (c.code === 'h' ? 'hull 117x74.' : '60.')); }
      e.parts.push({ n: c.n, size, label: '', model: c.name, remembered, unitName: u[0], hull: c.code === 'h' });
    }
  }
  // merge attached groups into planner units
  const out = [], used = {}; const byG = {};
  for (const e of entries){ if (e.group){ if (byG[e.group]){ byG[e.group].members.push(e); continue; } byG[e.group] = { members: [e] }; out.push(byG[e.group]); } else out.push({ members: [e] }); }
  for (const g of out){
    const mem = g.members, body = mem.reduce((a, e) => e.parts.reduce((s, p) => s + p.n, 0) > a.parts.reduce((s, p) => s + p.n, 0) ? e : a, mem[0]);
    let key = initials(body.name); const base = key; let k = 2; while (used[key]) key = (base.slice(0, 4) + k++).slice(0, 6); used[key] = 1; g.key = key;
    g.name = mem.map(e => e.name).join(' + ');
    g.parts = []; g.flags = []; g.matched = mem.map(e => e.unit ? e.unit[0] + ' (' + (CAT.factions[e.unit[1]] || '').replace(/-/g, ' ') + ')' : e.name + ' (not found)');
    for (const e of mem){ const lab = e === body ? key : initials(e.name);
      for (const p of e.parts) g.parts.push(Object.assign({}, p, { label: (mem.length > 1 && e !== body) ? lab : key })); g.flags.push(...e.flags); }
    const merged = []; for (const p of g.parts){ const last = merged[merged.length-1]; if (last && last.size === p.size && last.label === p.label && p.size) last.n += p.n; else merged.push(Object.assign({}, p)); }
    g.parts = merged; g.bases = g.parts.map(p => p.n + ' @ ' + (p.size || '?') + ' ' + p.label).join(', ');
    g.remembered = g.parts.some(p => p.remembered);
  }
  return { title, faction: fac === null ? null : CAT.factions[fac], units: out };
}
let IMP = null;
function renderImport(box){
  const k = armyView, army = S.armies[k];
  const det = el('details', { id:'imp' }); if (IMP && IMP.open !== false) det.open = true;
  det.appendChild(el('summary', { text:'Paste an army list' }));
  const wrap = el('div', { class:'imp', style:'margin-top:8px' });
  wrap.appendChild(el('p', { class:'hint', text:'Paste a list exported from the Warhammer app or written as text, then check the bases before using it. Base sizes come from the 40kdc unit data.' }));
  const ta = el('textarea', { id:'imp-text', spellcheck:'false', 'aria-label':'Army list text', style:'height:150px', placeholder:'Paste the army list here' }); ta.value = IMP ? IMP.text : '';
  wrap.appendChild(ta);
  wrap.appendChild(el('div', { class:'row' }, [ el('button', { class:'btn primary', id:'imp-read', text:'Read list', onclick: () => {
    const t = ta.value.trim(); if (!t){ setStatus('Paste a list into the box first', true); return; }
    const r = readList(t); IMP = { text: ta.value, r, open: true, name: r.title || army.name }; renderArmies(); setTimeout(() => { const f = $('imp-name'); if (f) f.scrollIntoView({ block:'nearest' }); }, 0); } }) ]));
  if (IMP && IMP.r){
    const r = IMP.r;
    if (!r.units.length) wrap.appendChild(el('p', { class:'warnmsg', text:'No units found. Each unit line needs its points in brackets, e.g. "Impulsor (80)" or "Lucius the Eternal (130 points)".' }));
    else {
      wrap.appendChild(el('p', { class:'hint k', text: r.units.length + ' units' + (r.faction ? ' · ' + r.faction.replace(/-/g, ' ') : '') + ' · check anything marked in red' }));
      wrap.appendChild(el('div', { class:'row' }, [ el('label', { for:'imp-name', text:'Name' }), el('input', { type:'text', id:'imp-name', value: IMP.name, maxlength:'40', onchange: e => IMP.name = e.target.value }) ]));
      r.units.forEach((g, i) => {
        const flag = g.flags.length > 0 || /\?/.test(g.bases);
        const card = el('div', { class:'impunit' + (flag ? ' flag' : '') });
        card.appendChild(el('b', { text: g.name }));
        card.appendChild(el('span', { class:'src', text: 'Matched: ' + g.matched.join(', ') + (g.remembered ? ' · size from your earlier entry' : '') }));
        card.appendChild(el('div', { class:'row' }, [ el('input', { type:'text', class:'key', id:'imp-k-' + i, value: g.key, maxlength:'6', 'aria-label':'Label', onchange: e => g.key = e.target.value.replace(/\s+/g, '').slice(0, 6) || g.key }),
          el('input', { type:'text', id:'imp-b-' + i, value: g.bases, 'aria-label':'Bases for ' + g.name, onchange: e => g.bases = e.target.value }) ]));
        g.flags.forEach(f => card.appendChild(el('p', { class:'warnmsg', text: f })));
        wrap.appendChild(card);
      });
      const msg = el('p', { class:'warnmsg', id:'imp-msg', hidden:'' });
      const apply = target => () => {
        const lines = r.units.map(g => g.key + ' | ' + g.name + ' | ' + g.bases), res = parseRoster(lines.join('\n'));
        if (/@\s*\?/.test(lines.join('\n'))){ msg.hidden = false; msg.textContent = 'Some bases still have no size (shown as ?). Fill them in first.'; return; }
        if (res.errs.length){ msg.hidden = false; msg.textContent = res.errs.join(' '); return; }
        r.units.forEach((g, i) => { const one = g.parts.length === 1 ? g.parts[0] : null, ru = res.units[i];
          if (one && one.unitName && (one.hull || one.remembered || !one.size) && ru && ru.groups.length === 1){ const z = ru.groups[0];
            PR.sizes[one.unitName] = z.hull ? 'hull ' + z.w + 'x' + z.h : z.w === z.h ? String(z.w) : z.w + 'x' + z.h; } });
        savePrefs(); pushUndo();
        const A = S.armies[target]; A.roster = lines.join('\n'); A.name = (IMP.name || '').trim() || A.name;
        S.bases = S.bases.filter(b => b.army !== target); if (sel && sel.b && sel.b.army === target) setSel(null);
        setArmyView(target); IMP = null; save(); deployAllQuiet(target); renderArmies(); renderInspector(); dirty();
        setStatus(A.name + ' set as the ' + target + ' army and deployed in the ' + SIDE_NAME[A.side].toLowerCase());
      };
      wrap.appendChild(el('div', { class:'row' }, [ el('button', { class:'btn primary', id:'imp-friendly', text:'Use as friendly army', onclick: apply('friendly') }),
        el('button', { class:'btn', id:'imp-hostile', text:'Use as hostile army', onclick: apply('hostile') }),
        el('button', { class:'btn', id:'imp-cancel', text:'Discard', onclick: () => { IMP = null; renderArmies(); } }) ]));
      wrap.appendChild(msg);
    }
  }
  det.appendChild(wrap); det.addEventListener('toggle', () => { if (IMP) IMP.open = det.open; else if (det.open) IMP = { text: '', open: true }; });
  box.appendChild(det);
}
function deployAllQuiet(k){ const { units } = parseRoster(S.armies[k].roster);
  for (const un of units.filter(un => !S.bases.some(b => b.u === k + ':' + un.key)).sort((a, b) => footprint(b) - footprint(a))) deployUnit(k, un, true); save(); }

export { readList, renderImport };
