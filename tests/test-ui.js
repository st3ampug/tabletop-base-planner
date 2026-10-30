// Usage: node tests/test-ui.js build   (Playwright; screenshots go to build/shots)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const dir = path.resolve(process.argv[2] || 'build'), shots = path.join(dir, 'shots'); fs.mkdirSync(shots, { recursive: true });
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const errs = []; const cx = await br.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }); const pg = await cx.newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + dir + '/index.html'); await pg.waitForTimeout(500);
  const P = f => pg.evaluate(f);
  ok(await P(() => window.__planner.S.bases.length) === 95, 'fresh board deploys both example armies');
  ok(await P(() => window.__planner.BX.order.length) === 1, 'one board exists');
  // --- picker
  // --- help
  await pg.click('#btn-help'); await pg.waitForTimeout(150); await pg.screenshot({ path: shots + '/help.png' });
  ok(await P(() => document.getElementById('help').open && document.getElementById('help').textContent.includes('Through a game')), 'help opens with usage and game steps');
  await pg.click('#help-close'); ok(await P(() => !document.getElementById('help').open), 'help closes');
  await pg.click('#map-btn'); await pg.waitForTimeout(150); await pg.screenshot({ path: shots + '/picker.png' });
  await pg.click('#pk-PTF-REC'); await pg.click('#pk-v-2');
  ok(await P(() => window.__planner.S.mapId) === 'bm-purge-vs-recon-02', 'picker chooses PTF v REC 2');
  ok((await pg.textContent('#map-btn')).includes('PTF v REC 2'), 'header shows the chosen layout');
  await pg.click('#map-btn'); await pg.click('#pk-REC-TAH'); await pg.click('#pk-v-1');
  ok(await P(() => window.__planner.S.mapId) === 'bm-take-vs-recon-01', 'reverse order REC v TAH gives the same table');
  // --- import with UI
  await pg.click('.tabs button[data-tab="army"]').catch(() => {});
  await P(() => document.getElementById('imp').open = true);
  await pg.fill('#imp-text', fs.readFileSync(path.join(__dirname, 'fixtures/children-of-the-recon.txt'), 'utf8')); await pg.click('#imp-read');
  ok(await pg.locator('.impunit').count() === 11, 'import shows 11 units');
  ok(await pg.locator('.impunit.flag').count() === 1, 'only the Rhino is flagged');
  await pg.click('#imp-friendly'); ok((await pg.textContent('#imp-msg')).includes('no size'), 'cannot apply with a missing size');
  const rhino = await P(() => [...document.querySelectorAll('.impunit')].findIndex(c => c.textContent.includes('Chaos Rhino')));
  await pg.fill('#imp-b-' + rhino, '1 @ hull 117x74 CR'); await pg.dispatchEvent('#imp-b-' + rhino, 'change');
  await pg.screenshot({ path: shots + '/import.png' });
  await pg.click('#imp-friendly');
  const fr = await P(() => { const p = window.__planner, B = p.S.bases.filter(b => b.army === 'friendly'); return { n: B.length, units: new Set(B.map(b => b.u)).size, illegal: B.filter(b => p.blockers(b, b.x, b.y, b.rot).length).length, name: p.S.armies.friendly.name }; });
  ok(fr.n === 46 && fr.units === 11 && fr.illegal === 0, 'imported friendly army deployed: ' + JSON.stringify(fr));
  ok(await P(() => JSON.parse(localStorage.getItem('tabletop-base-planner-prefs')).sizes['Chaos Rhino']) === 'hull 117x74', 'Rhino size remembered');
  await P(() => document.getElementById('imp').open = true);
  await pg.fill('#imp-text', fs.readFileSync(path.join(__dirname, 'fixtures/children-of-the-recon.txt'), 'utf8')); await pg.click('#imp-read');
  ok(await pg.locator('.impunit.flag').count() === 0, 'second import fills the Rhino from memory');
  await pg.click('#imp-cancel');
  await P(() => document.getElementById('imp').open = true);
  await pg.fill('#imp-text', fs.readFileSync(path.join(__dirname, 'fixtures/stephen-imperial-fists.txt'), 'utf8')); await pg.click('#imp-read'); await pg.click('#imp-hostile');
  const ho = await P(() => { const p = window.__planner, B = p.S.bases.filter(b => b.army === 'hostile'); return { n: B.length, illegal: B.filter(b => p.blockers(b, b.x, b.y, b.rot).length).length }; });
  ok(ho.n === 49 && ho.illegal === 0, 'imported hostile army deployed: ' + JSON.stringify(ho));
  // --- coherency: pull one Infractor 6" away in model mode
  ok(await P(() => window.__planner.cohIssues().size) === 0, 'deployed units are in coherency');
  await P(() => { const p = window.__planner, b = p.S.bases.find(b => b.u === 'friendly:INF' && b.label === 'INF'); b.y -= 6*25.4; });
  const c1 = await P(() => [...window.__planner.cohIssues().keys()]);
  ok(c1.length === 1 && c1[0] === 'friendly:INF', 'moved Infractor flagged out of coherency: ' + c1);
  await P(() => { const p = window.__planner, b = p.S.bases.find(b => b.u === 'friendly:INF' && b.label === 'INF'); b.y += 6*25.4; });
  // --- ring on a selected unit
  const pt = await P(() => { const p = window.__planner, b = p.S.bases.find(b => b.u === 'hostile:AT'), r = document.getElementById('cv').getBoundingClientRect(); return [r.left + b.x*p.view.s + p.view.ox, r.top + b.y*p.view.s + p.view.oy]; });
  await pg.mouse.click(pt[0], pt[1]); await pg.click('#ring-9'); ok(await P(() => window.__planner.S.ring) === 9, 'ring set to 9"');
  await pg.screenshot({ path: shots + '/ring.png' });
  // --- Find selects the unit and leaves the view alone unless the unit is off screen
  await P(() => document.getElementById('army-hostile').click()); const v0 = await P(() => JSON.stringify(window.__planner.view));
  await pg.locator('.unit').filter({ hasText: 'Redemptor' }).getByText('Find').click();
  ok(await P(() => JSON.stringify(window.__planner.view)) === v0 && (await pg.textContent('#inspector')).includes('Redemptor'), 'Find selects the unit without moving the board');
  await P(() => { const v = window.__planner.view; v.s *= 4; v.ox = -3000; v.oy = -3000; });
  await pg.locator('.unit').filter({ hasText: 'Redemptor' }).getByText('Find').click();
  ok(await P(() => { const p = window.__planner, v = p.view, b = p.S.bases.find(b => b.u === 'hostile:RED'), c = document.getElementById('cv').getBoundingClientRect(), x = b.x*v.s + v.ox, y = b.y*v.s + v.oy; return x > 0 && x < c.width && y > 0 && y < c.height; }), 'Find pans to a unit that is off screen');
  await pg.click('#btn-fit');
  // --- boards
  await pg.click('.tabs button[data-tab="save"]').catch(() => {}); await pg.click('#bd-dup');
  ok(await P(() => window.__planner.BX.order.length) === 2, 'duplicate creates a second board');
  await P(() => { window.__planner.S.bases.splice(0, 5); }); await pg.click('#bd-new');
  ok(await P(() => window.__planner.S.bases.length) === 0 && await P(() => window.__planner.S.armies.hostile.name) === 'Stephen', 'new board keeps rosters, empty table');
  await pg.locator('.board').first().getByText('Open').click();
  ok(await P(() => window.__planner.S.bases.length) === 95, 'first board reopens intact');
  await pg.reload(); await pg.waitForTimeout(400);
  ok(await P(() => window.__planner.BX.order.length) === 3 && await P(() => window.__planner.S.bases.length) === 95, 'boards survive a reload');
  await pg.screenshot({ path: shots + '/boards.png' });
  await cx.close();
  const c2 = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 }); const p2 = await c2.newPage(); p2.on('pageerror', e => errs.push('phone ' + e.message));
  await p2.goto('file://' + dir + '/index.html'); await p2.waitForTimeout(400); await p2.screenshot({ path: shots + '/phone.png' });
  await p2.tap('#map-btn'); await p2.waitForTimeout(150); await p2.screenshot({ path: shots + '/phone-picker.png' });
  ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll on phone');
  await p2.keyboard.press('Escape'); await p2.tap('#btn-help'); await p2.waitForTimeout(150); await p2.screenshot({ path: shots + '/phone-help.png' });
  ok(await p2.evaluate(() => { const r = document.querySelector('#help .pk').getBoundingClientRect(); return document.getElementById('help').open && r.left >= 0 && r.right <= innerWidth; }), 'help fits the phone screen');
  ok(!errs.length, 'no page errors ' + JSON.stringify(errs)); await br.close();
})();
