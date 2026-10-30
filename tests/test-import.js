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
  console.log('errors', JSON.stringify(errs)); await br.close();
})();
