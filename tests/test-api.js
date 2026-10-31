// Tests for window.planner, the agent interface (docs/api.md).
// Usage: node tests/test-api.js build   (Playwright; reads build/index.html)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const dir = path.resolve(process.argv[2] || 'build'), shots = path.join(dir, 'shots'); fs.mkdirSync(shots, { recursive: true });
const IN = 25.4;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c){ fails++; process.exitCode = 1; } };
const fixture = f => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const errs = []; const pg = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + dir + '/index.html'); await pg.waitForFunction(() => window.planner);
  const call = (name, ...args) => pg.evaluate(([n, a]) => window.planner[n](...a), [name, args]);

  ok(await pg.evaluate(() => window.planner.version) === 1, 'version is 1');
  ok(await pg.evaluate(() => Object.isFrozen(window.planner)), 'the interface is frozen');

  // layouts
  const ls = await call('layouts');
  ok(ls.length === 45 && ls.every(l => l.id && l.you && l.opponent && l.variant && l.deployment), 'layouts() lists 45 layouts with details');
  ok(await call('findLayout', 'REC', 'TAH', 1) === 'bm-take-vs-recon-01', 'findLayout works in either order with abbreviations');
  ok(await call('findLayout', 'take-and-hold', 'reconnaissance', 2) === 'bm-take-vs-recon-02', 'findLayout takes full names');
  ok((await call('setLayout', 'nope')).ok === false, 'setLayout refuses an unknown id');
  const sl = await call('setLayout', 'bm-purge-vs-recon-03');
  ok(sl.ok && await pg.evaluate(() => window.planner.getBoard().mapId) === 'bm-purge-vs-recon-03', 'setLayout switches the layout');

  // import
  const noSize = await call('importList', fixture('children-of-the-recon.txt'), { army: 'friendly' });
  ok(!noSize.ok && noSize.units.find(u => u.name === 'Chaos Rhino').missingSize.length === 1, 'importList refuses while the Rhino has no size, and says which unit');
  const imp = await call('importList', fixture('children-of-the-recon.txt'), { army: 'friendly', sizes: { 'Chaos Rhino': 'hull 117x74' } });
  ok(imp.ok && imp.units.length === 11 && imp.notInZone.length === 0, 'importList applies and deploys the friendly army: ' + (imp.error || ''));
  const imp2 = await call('importList', fixture('stephen-imperial-fists.txt'), { army: 'hostile' });
  ok(imp2.ok && imp2.units.length === 11, 'importList applies the hostile army');
  const us = await call('units');
  ok(us.length === 22 && us.reduce((a, u) => a + u.models, 0) === 95, 'units() lists 22 units and 95 models');
  const chk0 = await call('check');
  ok(chk0.ok && !chk0.illegal.length && !chk0.coherency.length && !chk0.engagement.length, 'check() is clean after deploying');

  // board round trip
  const board = await call('getBoard');
  ok(Array.isArray(board.bases) && board.table && board.table.objectives.length > 0, 'getBoard() includes bases and the table');
  ok((await call('loadBoard', '{"nope":1}')).ok === false, 'loadBoard refuses text without bases');
  const lb = await call('loadBoard', JSON.stringify(board));
  ok(lb.ok && lb.check.ok, 'loadBoard accepts its own output and returns a check');

  // placing
  const fb = us.find(u => u.u.endsWith(':FB'));
  const wall = await pg.evaluate(() => { const t = window.__planner.T.find(t => t.kind === 'scenery' && t.collision === 'block' && (t.bb[2]-t.bb[0]) > 100); return { x: (t.bb[0]+t.bb[2])/2, y: (t.bb[1]+t.bb[3])/2, name: t.name }; });
  const bad = await call('placeUnit', fb.u, wall.x, wall.y);
  ok(!bad.ok && bad.blockers.length > 0, 'placeUnit (exact) refuses a spot on a wall and lists blockers');
  const unchanged = (await call('units')).find(u => u.u === fb.u).centre;
  ok(Math.abs(unchanged.x - fb.centre.x) < 0.2 && Math.abs(unchanged.y - fb.centre.y) < 0.2, 'a refused placement leaves the unit where it was');
  const near = await call('placeUnit', fb.u, wall.x, wall.y, { exact: false });
  ok(near.ok && near.pushed_mm > 0 && near.pushed_in <= 6, 'placeUnit exact:false takes the nearest free spot and reports the push (' + near.pushed_in + '")');
  ok((await call('check')).illegal.length === 0, 'the nearest-spot placement is legal');
  const mid = await call('placeUnit', fb.u, 558.8, 760, { exact: false, turn: 90 });
  ok(mid.ok, 'placeUnit can turn the unit while placing');

  // moving with a limit
  const mv = await call('moveUnit', fb.u, 0, -20*IN, { maxInches: 6 });
  ok(Math.abs(mv.moved_in - 6) < 0.15 || mv.stoppedBy.length > 0, 'moveUnit respects maxInches (moved ' + mv.moved_in + '")');
  ok(mv.limitedByMax === true, 'moveUnit reports that the limit applied');
  ok((await call('check')).illegal.length === 0, 'moveUnit leaves the unit legal');

  // measuring
  const ms = await call('measure', 'friendly:FB', 'hostile');
  ok(ms.inches > 0 && ms.from.u === 'friendly:FB' && ms.to.u.startsWith('hostile:'), 'measure() gives the closest pair between a unit and an army (' + ms.inches + '")');
  const self = await call('measure', fb.bases[0].id, fb.bases[0].id);
  ok(self.inches === 0, 'measure() of a base to itself is 0');

  // contact
  const sw = await call('setLayout', 'bm-take-vs-recon-01');   // open ground around x = 300 mm between y = 760 and 1000
  ok(sw.ok && sw.check && Array.isArray(sw.check.illegal), 'setLayout reports a check, since bases keep their positions on the new terrain');
  await call('placeUnit', 'hostile:RED', 300, 760, { exact: false });
  await call('placeUnit', 'friendly:DPS', 300, 1000, { exact: false });
  const tc = await call('toContact', 'friendly:DPS', 'hostile:RED');
  const after = await call('measure', 'friendly:DPS', 'hostile:RED');
  ok(tc.ok && after.mm <= 0.5 && tc.moved_in > 0, 'toContact reaches base contact in open ground (moved ' + tc.moved_in + '")');
  const chk = await call('check'); ok(!chk.illegal.some(b => b.u === 'friendly:DPS' || b.u === 'hostile:RED') && chk.engagement.some(e => e.a === 'friendly:DPS' && e.b === 'hostile:RED' && e.inches === 0), 'after contact both units are legal and check() lists the engagement');
  await call('undo');
  const lim = await call('toContact', 'friendly:DPS', 'hostile:RED', { maxInches: 2 });
  ok(!lim.ok && Math.abs(lim.moved_in - 2) < 0.15 && lim.gap_in > 0, 'toContact respects maxInches and reports the gap left (' + JSON.stringify(lim.moved_in) + '", gap ' + lim.gap_in + '")');
  const wallTest = await call('measure', 'friendly:DPS', 'hostile');
  ok(typeof wallTest.crossesWalls === 'boolean', 'measure() reports whether the line crosses a wall');

  // sight
  const sAny = await call('seen', 'friendly:DPS', { by: 'hostile' });
  ok(sAny.ok && typeof sAny.seen === 'boolean' && sAny.fraction >= 0 && sAny.fraction <= 1, 'seen() answers for a unit (' + JSON.stringify(sAny) + ')');
  const before = await pg.evaluate(() => JSON.stringify(window.__planner.S.los));
  await call('seen', { x: 558.8, y: 762 }, { by: ['hostile:RED'] });
  ok(await pg.evaluate(() => JSON.stringify(window.__planner.S.los)) === before, 'seen() leaves the sight settings as they were');
  ok((await call('seen', 'friendly:DPS')).ok === false, 'seen() without watchers asks for opts.by');

  // image, undo, errors
  const img = await call('image', { caption: 'Test board', pxPerInch: 10 });
  ok(typeof img === 'string' && img.startsWith('data:image/png;base64,') && img.length > 20000, 'image() returns a PNG');
  fs.writeFileSync(path.join(shots, 'api-image.png'), Buffer.from(img.split(',')[1], 'base64'));
  const vp = await pg.evaluate(() => ({ w: document.getElementById('cv').width, s: window.__planner.view.s }));
  ok(vp.w > 0 && vp.s > 0, 'image() puts the view back');
  const pre = (await call('units')).find(u => u.u === 'friendly:DPS').centre;
  await call('moveUnit', 'friendly:DPS', 0, 3*IN); const un = await call('undo');
  const post = (await call('units')).find(u => u.u === 'friendly:DPS').centre;
  ok(un.ok && Math.abs(post.y - pre.y) < 0.2, 'undo() reverts the last change');
  const err = await call('placeUnit', 'friendly:NOPE', 0, 0);
  ok(err.ok === false && /No unit/.test(err.error), 'unknown units return an error instead of throwing');

  // labels: leaders by name, different units that would clash by where their names differ
  const nids = await pg.evaluate(() => window.__planner.readList('Neurotyrant (105)\nNeurolictor (80)\nInceptors (130)\nIncursors (90)').units.map(g => g.key));
  ok(nids[0] !== nids[1] && nids[0] === 'NTY' && nids[1] === 'NLI', 'labels: Neurotyrant and Neurolictor get NTY and NLI (' + nids.join(', ') + ')');
  ok(nids[2] !== nids[3] && !/\d/.test(nids[2] + nids[3]), 'labels: Inceptors and Incursors get different labels without numbers (' + nids.slice(2).join(', ') + ')');
  const lead = await pg.evaluate(() => window.__planner.readList('Attached Unit 1\nLucius the Eternal (130 points)\nFlawless Blades (190 points)\n  • 6x Flawless Blade').units[0].bases);
  ok(/1 @ 50 LUC/.test(lead), 'labels: a leader gets the first letters of its name (' + lead + ')');

  // Move from the catalogue
  const mvs = await call('units', 'friendly');
  ok(mvs.find(u => u.u === 'friendly:INF').move_in === 7 && mvs.find(u => u.u === 'friendly:DPS').move_in === 14, 'units() gives Move from the data (Infractors 7", winged Daemon Prince 14")');

  // reserves
  const rv = await call('toReserve', 'friendly:FB2');
  const afterRv = await call('units', 'friendly');
  ok(rv.ok && afterRv.find(u => u.u === 'friendly:FB2').where === 'reserve' && !(await call('check')).illegal.some(b => b.u === 'friendly:FB2'), 'toReserve takes a unit off the table');
  ok((await call('check')).reserve.indexOf('friendly:FB2') >= 0, 'check() lists units in reserve');
  ok((await call('seen', 'friendly:FB2', { by: 'hostile' })).ok === false, 'a unit in reserve is not on the table for sight questions');
  const wallSpot = await pg.evaluate(() => { const t = window.__planner.T.find(t => t.kind === 'scenery' && t.collision === 'block' && (t.bb[2]-t.bb[0]) > 100); return [(t.bb[0]+t.bb[2])/2, (t.bb[1]+t.bb[3])/2]; });
  const arrBad = await call('arrive', 'friendly:FB2', wallSpot[0], wallSpot[1]);
  ok(!arrBad.ok && (await call('units', 'friendly')).find(u => u.u === 'friendly:FB2').where === 'reserve', 'arrive (exact) refuses a blocked spot and the unit stays in reserve');
  const arr = await call('arrive', 'friendly:FB2', wallSpot[0], wallSpot[1], { exact: false });
  ok(arr.ok && !arr.check.illegal.some(b => b.u === 'friendly:FB2'), 'arrive with exact:false lands on the nearest free spot (' + arr.pushed_in + '" away)');
  const fresh = await call('importList', 'Neurotyrant (105)', { army: 'hostile', deploy: false });
  ok(fresh.ok && (await call('units', 'hostile')).length === 0, 'importList with deploy:false sets the roster without deploying');
  ok((await call('toReserve', 'hostile:NEU')).ok && (await call('units', 'hostile'))[0].where === 'reserve', 'toReserve puts an undeployed roster unit straight into reserve');
  await call('importList', fixture('stephen-imperial-fists.txt'), { army: 'hostile' });

  // markers
  const mk = await call('addMarker', { kind: 'tunnel', x: 300, y: 600, label: 'Trygon', ring_in: 3 });
  ok(mk.ok && mk.ref === 'marker:' + mk.id && (await call('markers')).length === 1, 'addMarker adds a marker with a ring');
  ok((await call('addMarker', { kind: 'bogus', x: 1, y: 1 })).ok === false, 'addMarker refuses an unknown kind');
  const mm = await call('measure', mk.ref, 'friendly:DPS');
  ok(mm.inches >= 0 && mm.from.id === mk.ref, 'measure() works from a marker (' + mm.inches + '")');
  const legalBefore = (await call('check')).illegal.length;
  await call('moveMarker', mk.id, (await call('units', 'friendly')).find(u => u.u === 'friendly:DPS').centre.x, (await call('units', 'friendly')).find(u => u.u === 'friendly:DPS').centre.y);
  ok((await call('check')).illegal.length === legalBefore, 'markers do not block or overlap models');
  const brd = await call('getBoard');
  ok(Array.isArray(brd.markers) && brd.markers.length === 1 && Array.isArray(brd.reserve), 'the board text includes markers and reserve');
  ok((await call('removeMarker', mk.ref)).ok && (await call('markers')).length === 0, 'removeMarker removes it');
  ok((await call('loadBoard', JSON.stringify(brd))).ok && (await call('markers')).length === 1, 'a board with markers loads back');

  // persistence
  await pg.waitForTimeout(400); await pg.reload(); await pg.waitForFunction(() => window.planner);
  ok((await call('units')).filter(u => u.where === 'table').length === 22 && (await call('markers')).length === 1 && await pg.evaluate(() => window.planner.getBoard().mapId) === 'bm-take-vs-recon-01', 'changes made through the interface survive a reload');
  ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
  console.log(fails ? fails + ' failed' : 'all passed'); await br.close();
})();
