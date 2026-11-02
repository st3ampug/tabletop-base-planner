// Usage: node tests/test-import.js build   (Playwright; reads build/index.html)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const dir = path.resolve(process.argv[2] || 'build');
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const pg = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + dir + '/index.html'); await pg.waitForTimeout(400);
  for (const f of ['children-of-the-recon.txt', 'stephen-imperial-fists.txt']){
    const txt = fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
    const r = await pg.evaluate(t => { const r = window.__planner.readList(t); return { title: r.title, faction: r.faction, units: r.units.map(g => [g.key, g.name, g.bases, g.matched.join(' / '), g.flags.join(' ')]) }; }, txt);
    console.log('\n==', f, '| title:', r.title, '| faction:', r.faction); r.units.forEach(u => console.log('  ' + u.join('  |  ')));
  }
  // A loadout suffix the data doesn't list falls back to the base datasheet; other units keep their match.
  const fails = [];
  const wolves = await pg.evaluate(t => window.__planner.readList(t).units.map(g => ({ name: g.name, bases: g.bases, matched: g.matched.join(' / ') })),
    fs.readFileSync(path.join(__dirname, 'fixtures', 'space-wolves-logan.txt'), 'utf8'));
  console.log('\n== space-wolves-logan.txt'); wolves.forEach(u => console.log('  ' + [u.name, u.bases, u.matched].join('  |  ')));
  const era = wolves.filter(u => /^Eradicator Squad with melta/i.test(u.name));
  if (era.length !== 2) fails.push('expected 2 Eradicator units, got ' + era.length);
  for (const u of era){
    if (!/^Eradicator Squad \(/.test(u.matched)) fails.push('Eradicators matched ' + u.matched);
    if (!/^3 @ 40 EMR2? w3$/.test(u.bases)) fails.push('Eradicator bases ' + u.bases);
  }
  if (wolves.some(u => /not found/.test(u.matched))) fails.push('unmatched: ' + wolves.filter(u => /not found/.test(u.matched)).map(u => u.name).join(', '));
  if (errs.length) fails.push('page errors');
  console.log('errors', JSON.stringify(errs)); await br.close();
  if (fails.length){ console.error('FAIL', fails); process.exit(1); } else console.log('import checks: ok');
})();
