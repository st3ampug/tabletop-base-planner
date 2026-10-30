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
  // --- line of sight: the Sight button and watching from the Armies tab
  await pg.click('#btn-sight'); await pg.waitForTimeout(300);
  const st = await P(() => { const p = window.__planner, hostile = new Set(p.S.bases.filter(b => b.army === 'hostile').map(b => b.u)); return { on: p.S.los.on, n: p.S.los.watch.length, units: hostile.size, ms: p.sightTime() }; });
  ok(st.on && st.n > 0 && st.n === st.units, 'Sight with nothing watched watches the whole hostile army: ' + JSON.stringify(st));
  ok(st.ms < 500, 'mask for the whole hostile army in ' + st.ms + ' ms');
  await pg.waitForTimeout(2400);   // the 'watching the whole hostile army' message shows first
  ok((await pg.textContent('#status')).includes('watched units'), 'status line names the watched units');
  await pg.screenshot({ path: shots + '/sight.png' });
  await P(() => document.getElementById('army-hostile').click()); await pg.click('#army-unwatch');
  ok(await P(() => window.__planner.S.los.watch.length) === 0, 'Unwatch all clears the hostile army');
  await pg.locator('.unit .eye').first().click();
  ok(await P(() => window.__planner.S.los.watch.length) === 1, 'the eye button watches one unit');
  // --- line of sight: a wall (x 380-400, y 200-400) and a terrain area (x 300-500, y 600-800), all in mm
  const LOS = (los, bases, pts, selU) => pg.evaluate(([los, bases, pts, selU]) => {
    const p = window.__planner, id = p.S.mapId, rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    p.applyState({ mapId: id, terrain: { [id]: [ { id: 'w', name: 'Wall', kind: 'scenery', collision: 'block', poly: rect(380, 200, 400, 400) },
        { id: 'a', name: 'Ruin', kind: 'area', collision: 'allow', poly: rect(300, 600, 500, 800) } ] },
      bases: bases.map((b, i) => ({ id: i + 1, w: b[3] || 32, h: b[3] || 32, x: b[0], y: b[1], rot: 0, colour: '#d1a51c', label: 'M', army: b[2].split(':')[0], u: b[2] })),
      los: Object.assign({ on: true, watch: ['hostile:W'] }, los) });
    p.select(selU ? { type: 'base', b: p.S.bases.find(b => b.u === selU) } : null, true);
    return pts.map(q => p.isSeen(q[0], q[1]));
  }, [los, bases, pts, selU]);
  const Wb = [200, 300, 'hostile:W'];
  let r = await LOS({}, [Wb], [[600, 300], [200, 800], [400, 700], [600, 1100]]);
  ok(r.join() === 'false,true,true,false', 'the wall hides, open ground and the inside of an area are seen, the area hides what is behind it: ' + r);
  r = await LOS({ areas: false }, [Wb], [[600, 1100]]); ok(r[0] === true, 'with areas not blocking, the spot behind the area is seen');
  r = await LOS({}, [[400, 700, 'hostile:W']], [[600, 1100], [100, 1300]]); ok(r[0] && r[1], 'a model inside an area sees out of it: ' + r);
  r = await LOS({ range: 24 }, [Wb], [[200, 300 + 20*25.4], [200, 300 + 30*25.4]]); ok(r[0] && !r[1], 'a 24" range shows 20" away but not 30": ' + r);
  const W2 = [800, 300, 'hostile:X'], one = await LOS({}, [Wb, W2], [[600, 300]]), both = await LOS({ watch: ['hostile:W', 'hostile:X'] }, [Wb, W2], [[600, 300]]);
  ok(one[0] === false && both[0] === true, 'watching a second unit adds what it sees');
  await LOS({}, [Wb], []);
  const edge = await P(() => { const p = window.__planner; for (let y = 300; y < 1500; y += 2) if (p.isSeen(700, y)) return y; return -1; });
  const B60 = [[Wb, [1000, 1400, 'friendly:B', 60]], [[700, edge - 10]]];
  const c0 = await LOS({}, ...B60), c60 = await LOS({}, ...B60, 'friendly:B'), cOff = await LOS({ partial: false }, ...B60, 'friendly:B');
  ok(edge > 0 && !c0[0] && c60[0] && !cOff[0], 'a spot 10 mm into the shadow is hidden for a centre point but seen for a selected 60 mm base: edge at y=' + edge + ' ' + [c0, c60, cOff]);
  await LOS({ range: 18 }, [Wb], []); await pg.screenshot({ path: shots + '/sight-test.png' });
  await pg.reload(); await pg.waitForTimeout(400);
  const lo = await P(() => window.__planner.S.los);
  ok(lo.on && lo.range === 18 && lo.watch.join() === 'hostile:W', 'sight settings survive a reload: ' + JSON.stringify(lo));
  const old = await P(() => { const p = window.__planner; p.applyState({ bases: [] }); return p.S.los; });
  ok(JSON.stringify(old) === '{"on":false,"watch":[],"range":0,"areas":true,"partial":true}', 'an old board without sight settings loads with the defaults');
  await cx.close();
  const c2 = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 }); const p2 = await c2.newPage(); p2.on('pageerror', e => errs.push('phone ' + e.message));
  await p2.goto('file://' + dir + '/index.html'); await p2.waitForTimeout(400); await p2.screenshot({ path: shots + '/phone.png' });
  await p2.tap('#map-btn'); await p2.waitForTimeout(150); await p2.screenshot({ path: shots + '/phone-picker.png' });
  ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll on phone');
  await p2.keyboard.press('Escape'); await p2.tap('#btn-help'); await p2.waitForTimeout(150); await p2.screenshot({ path: shots + '/phone-help.png' });
  ok(await p2.evaluate(() => { const r = document.querySelector('#help .pk').getBoundingClientRect(); return document.getElementById('help').open && r.left >= 0 && r.right <= innerWidth; }), 'help fits the phone screen');
  await p2.tap('#help-close'); await p2.tap('#btn-sight'); await p2.waitForTimeout(300); await p2.screenshot({ path: shots + '/phone-sight.png' });
  ok(await p2.evaluate(() => window.__planner.S.los.on && document.documentElement.scrollWidth <= innerWidth), 'Sight works on the phone with no sideways scroll');
  ok(!errs.length, 'no page errors ' + JSON.stringify(errs)); await br.close();
})();
