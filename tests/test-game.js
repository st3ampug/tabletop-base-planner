// Usage: node tests/test-game.js build   (Playwright) — wounds from the data, and games: rounds, phases, saved steps, VP.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const dir = path.resolve(process.argv[2] || 'build'), shots = path.join(dir, 'shots'); fs.mkdirSync(shots, { recursive: true });
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const errs = []; const cx = await br.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }); const pg = await cx.newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + dir + '/index.html'); await pg.waitForTimeout(400);
  const P = (f, a) => pg.evaluate(f, a);

  // --- wounds
  const w = await P(() => { const S = window.__planner.S, by = l => S.bases.find(b => b.label === l); return { LUC: by('LUC').maxW, FB: by('FB').maxW, IM1: by('IM1').maxW, TH: by('TH').maxW, ICR: by('ICR').maxW }; });
  ok(w.LUC === 6 && w.FB === 3 && w.IM1 === 11 && w.TH === 3 && w.ICR === 2, 'example armies have wounds per model: ' + JSON.stringify(w));
  const pr = await P(() => window.__planner.parseRoster('A | x | 6 @ 40 w2\nB | y | 1 @ 60 DP w10, 2 @ 32\nC | z | 1 @ 40 W4X').units.map(u => u.groups.map(g => [g.label, g.wounds])));
  ok(JSON.stringify(pr) === JSON.stringify([[['A', 2]], [['DP', 10], ['B', 1]], [['W4X', 1]]]), 'roster reads wounds after the label, with or without one: ' + JSON.stringify(pr));
  const imp = await P(t => window.__planner.readList(t).units.map(u => u.bases), fs.readFileSync(path.join(__dirname, 'fixtures/children-of-the-recon.txt'), 'utf8'));
  ok(imp.some(b => /LUC w6/.test(b) && /FB w3/.test(b)) && imp.some(b => /w12/.test(b)), 'import writes wounds from the data: ' + imp.slice(0, 3).join(' / '));
  const impS = await P(t => window.__planner.readList(t).units.map(u => u.bases), fs.readFileSync(path.join(__dirname, 'fixtures/stephen-imperial-fists.txt'), 'utf8'));
  ok(impS.some(b => /w11/.test(b)) && impS.some(b => /TH w3|w3/.test(b)), 'hostile list gets wounds too: ' + impS.slice(0, 3).join(' / '));
  await P(() => { const S = window.__planner.S; window.__planner.select({ type:'base', b: S.bases.find(b => b.label === 'LUC') }); });
  ok(await pg.inputValue('#f-maxw') === '6', 'inspector shows the wounds of the selected model');
  await pg.fill('#f-maxw', '7'); await pg.dispatchEvent('#f-maxw', 'change');
  ok(await P(() => window.__planner.S.bases.find(b => b.label === 'LUC').maxW) === 7, 'wounds can be corrected per model');
  await pg.click('#btn-undo');

  // --- start a game
  ok(await pg.isHidden('#gamebar'), 'no game bar before a game starts');
  ok(await pg.inputValue('#game-attacker') === 'hostile', 'the army in the red zone is the default attacker');
  await pg.click('#game-start'); await pg.waitForTimeout(100);
  ok(await pg.isVisible('#gamebar'), 'game bar shows once a game starts');
  ok((await pg.getAttribute('#gb-step', 'title')) === 'Round 1 · Attacker (Stephen: Imperial Fists) · Command' && (await pg.textContent('#gb-phase')) === 'Command', 'bar names the phase to play: ' + await pg.textContent('#gb-step'));
  const g0 = await P(() => { const g = window.__planner.S.games[0]; return { steps: g.steps.length, n: Object.keys(g.steps[0].models).length, roster: Object.keys(g.roster).length, open: window.__planner.S.game === g.id }; });
  ok(g0.steps === 1 && g0.n === 95 && g0.roster === 95 && g0.open, 'step 0 holds every model: ' + JSON.stringify(g0));

  // --- save steps: a move, a casualty, a unit into reserve
  await P(() => window.planner.moveUnit('hostile:INC', 0, 100));
  await pg.click('#vp-hostile-plus'); await pg.click('#vp-hostile-plus');
  ok(await pg.textContent('#vp-hostile') === '2', 'VP + raises the score');
  await pg.click('#gb-save'); await pg.waitForTimeout(50);
  const s1 = await P(() => { const g = window.__planner.S.games[0], st = g.steps[1]; return { phase: st.phase, round: st.round, turn: st.turn, n: Object.keys(st.models).length, vp: st.vp }; });
  ok(s1.phase === 'Command' && s1.round === 1 && s1.turn === 'attacker' && s1.n === 6 && s1.vp.hostile === 2, 'step 1 stores only the 6 moved models and the score: ' + JSON.stringify(s1));
  ok((await pg.textContent('#gb-phase')) === 'Movement', 'bar moves on to the next phase');
  await P(() => { const S = window.__planner.S; window.__planner.S.bases = S.bases.filter(b => b.label !== 'ICR'); });
  await pg.click('#gb-save');
  await P(() => window.planner.toReserve('friendly:MF1'));
  await pg.click('#gb-save');
  const s3 = await P(() => { const p = window.__planner, g = p.S.games[0], at = p.resolveStep(g, 3), byL = l => Object.keys(g.roster).filter(id => g.roster[id].label === l).map(id => at[id]);
    return { icr: byL('ICR'), mf: byL('MF1'), st2: Object.keys(g.steps[2].models).length, st3: Object.keys(g.steps[3].models).length }; });
  ok(s3.icr.length === 5 && s3.icr.every(m => m[4] === 'destroyed' && m[3] === 0 && m[0] > 0), 'removed models are destroyed where they stood: ' + JSON.stringify(s3.icr[0]));
  ok(s3.mf.length === 1 && s3.mf[0][4] === 'reserve', 'a unit in reserve is recorded as reserve');
  ok(s3.st2 === 5 && s3.st3 === 1, 'each step stores only what changed: ' + s3.st2 + ', ' + s3.st3);
  ok(await pg.locator('#game-steps .st').count() === 4, 'the Game tab lists the saved steps');

  // --- reload keeps everything
  const before = await P(() => JSON.stringify(window.__planner.S.games));
  await pg.reload(); await pg.waitForTimeout(400);
  ok(await P(() => JSON.stringify(window.__planner.S.games)) === before, 'the game survives a reload unchanged');
  ok(await pg.isVisible('#gamebar') && (await pg.textContent('#gb-phase')) === 'Charge', 'the open game is still open after a reload');

  // --- delete last step, undo
  await pg.click('#game-drop'); ok(await P(() => window.__planner.S.games[0].steps.length) === 3, 'Delete last step removes it');
  await pg.click('#btn-undo'); ok(await P(() => window.__planner.S.games[0].steps.length) === 4, 'undo brings the step back');

  // --- close and reopen: the board goes back to the last step
  await pg.click('#game-close'); ok(await pg.isHidden('#gamebar'), 'closing the game hides the bar');
  await P(() => { const S = window.__planner.S; S.bases.filter(b => b.u === 'hostile:INC').forEach(b => { b.x += 200; }); });
  await pg.click('button[aria-label^="Open "]'); await pg.waitForTimeout(50);
  const re = await P(() => { const p = window.__planner, g = p.S.games[0], at = p.resolveStep(g, g.steps.length - 1);
    const bad = p.S.bases.filter(b => g.roster[b.id] && (Math.abs(b.x - at[b.id][0]) > 0.11 || Math.abs(b.y - at[b.id][1]) > 0.11)).length;
    return { bad, icr: p.S.bases.filter(b => b.label === 'ICR').length, mf: p.S.reserve.filter(b => b.label === 'MF1').length, open: p.S.game === g.id }; });
  ok(re.bad === 0 && re.icr === 0 && re.mf === 1 && re.open, 'reopening puts every model where the last step had it: ' + JSON.stringify(re));

  // --- interface
  const api = await P(() => { const p = window.planner, a = p.game(), r = p.saveStep({ note: 'charged', vp: { friendly: 3 } }), b = p.game(), v = p.setVP('hostile', 5);
    return { a: a.ok && a.steps.length === 4 && a.next.endsWith('Charge'), r, last: b.steps[b.steps.length - 1], v: v.vp, again: p.startGame().ok, wounds: p.units('friendly')[0].bases[0].wounds }; });
  ok(api.a && api.r.ok && api.r.label === 'Round 1 · Attacker (Stephen: Imperial Fists) · Charge' && api.last.note === 'charged' && api.last.vp.friendly === 3 && api.v.hostile === 5, 'planner.game, saveStep and setVP: ' + JSON.stringify(api.r));
  ok(api.again === false && api.wounds >= 1, 'startGame refuses while a game is open; units() reports wounds');

  // --- a full game stays small: 50 more steps with every model moving each time
  const full = await P(() => { const p = window.__planner, S = p.S, g = S.games[0];
    let saved = 0, k = 0; for (;;){ k++; S.bases.forEach((b, i) => { b.x += ((i + k) % 3 - 1)*3.37; b.y += ((i*7 + k) % 5 - 2)*2.11; }); const r = window.planner.saveStep(); if (!r.ok) break; saved++; }
    return { steps: g.steps.length, saved, models: Object.keys(g.roster).length, game: JSON.stringify(g).length, board: JSON.stringify(window.planner.getBoard()).length, next: window.planner.game().next }; });
  ok(full.steps === 51 && full.next === null, 'a game stops after 5 rounds of 5 phases each side: ' + full.steps + ' steps');
  ok(full.game < 200*1024, 'a full 51-step game of ' + full.models + ' models is ' + Math.round(full.game/1024) + ' KB (limit 200 KB); whole board ' + Math.round(full.board/1024) + ' KB');
  ok(await pg.isDisabled('#gb-save') && (await pg.textContent('#gb-phase')) === 'Game over', 'Save step is off once the game is over');
  await pg.screenshot({ path: shots + '/game.png' });

  // --- board text round trip, and an old board without games
  const rt = await P(() => { const t = JSON.stringify(window.planner.getBoard()), n = window.__planner.S.games[0].steps.length; window.planner.loadBoard(t); return n === window.__planner.S.games[0].steps.length && !!window.__planner.S.game; });
  ok(rt, 'a board with a game loads back from its text with the game open');
  const old = await P(() => { const o = window.planner.getBoard(); delete o.games; delete o.game; const r = window.planner.loadBoard(o); return r.ok && window.__planner.S.games.length === 0 && document.getElementById('gamebar').hidden; });
  ok(old, 'a board saved before games existed loads with no game');
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs));

  // --- phone
  const c2 = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 }); const p2 = await c2.newPage(); p2.on('pageerror', e => errs.push('phone ' + e.message));
  await p2.goto('file://' + dir + '/index.html'); await p2.waitForTimeout(400);
  await p2.tap('.tabs button[data-tab="game"]'); await p2.tap('#game-start'); await p2.waitForTimeout(100);
  await p2.tap('#vp-friendly-plus'); await p2.tap('#gb-save'); await p2.waitForTimeout(150);
  await p2.screenshot({ path: shots + '/phone-game.png' });
  const ph = await p2.evaluate(() => ({ sw: document.documentElement.scrollWidth, bar: document.getElementById('gamebar').getBoundingClientRect(), save: document.getElementById('gb-save').getBoundingClientRect(), steps: window.__planner.S.games[0].steps.length,
    tabs: [...document.querySelectorAll('.tabs button')].every(b => b.scrollWidth <= b.clientWidth + 1) }));
  ok(ph.sw <= 390 && ph.save.right <= 390 && ph.bar.height < 100 && ph.steps === 2, 'phone: game bar fits and Save step works: ' + JSON.stringify({ sw: ph.sw, barH: Math.round(ph.bar.height), steps: ph.steps }));
  ok(ph.tabs, 'phone: all seven tab names fit');
  ok(errs.length === 0, 'no phone errors ' + JSON.stringify(errs));
  await br.close();
  if (!process.exitCode) console.log('all passed');
})();
