import { $ } from '../core.js';
import { MAPS } from '../maps.js';
import { S, setM, loadTerrain, pushUndo, save } from '../state.js';
import { dirty, fit, setStatus } from '../render.js';
import { el, renderInspector, buildMapSelect } from './panel.js';
import { tableData } from './saveload.js';
import { renderArmies } from '../armies.js';
import { DEFAULT_PHASES, openGame, stepLabel, nextSlot, totalSteps, startGame, saveStep, dropStep, setVP, applyStep, armyOfTurn, beginEdit, finishEdit, editVP, cleanGames } from '../game.js';
import { replayStep, showStep, stopReplay, play, playing } from './replay.js';

/* ---------- the Game tab and the game bar ---------- */
// A score with − and +; with no onChange it only shows the score (a replayed step).
function vpControl(g, army, value, onChange){
  const A = S.armies[army] || g.armies[army] || {}, nm = A.name || army, ro = !onChange;
  const b = (d, t, l) => Object.assign(el('button', { class:'btn', id:'vp-' + army + (d > 0 ? '-plus' : '-minus'), text: t, 'aria-label': l + nm, onclick: () => { onChange(value + d); renderGame(); } }), { disabled: ro });
  if (ro) return el('span', { class:'vp', title: nm + ' victory points at this step' }, [ el('span', { class:'dot', style:'background:' + (A.colour || '#888'), 'aria-hidden':'true' }),
    el('span', { class:'n', id:'vp-' + army, text: String(value), 'aria-label': nm + ' victory points at this step' }) ]);
  return el('span', { class:'vp', title: nm + ' victory points' }, [ el('span', { class:'dot', style:'background:' + (A.colour || '#888'), 'aria-hidden':'true' }),
    b(-1, '−', 'One victory point less for '), el('span', { class:'n', id:'vp-' + army, text: String(value), 'aria-label': nm + ' victory points' }), b(1, '+', 'One victory point more for ') ]);
}
function slotText(g, st){ return st.round ? 'Round ' + st.round + ' · ' + (st.turn === 'attacker' ? 'Attacker' : 'Defender') + ' (' + ((g.armies[armyOfTurn(g, st.turn)] || {}).name || '') + ')' : 'before round 1'; }
// The bar has three modes: playing (the phase to play, VP, Save step), replay (a saved step, read-only) and editing a saved step.
function renderBar(g){
  const bar = $('gamebar'); bar.hidden = !g; if (!g) return;
  const E = S.editing && S.editing.game === g.id ? S.editing : null, rn = E ? null : replayStep(), last = g.steps.length - 1, nx = nextSlot(g);
  bar.classList.toggle('replay', rn !== null); bar.classList.toggle('editing', !!E);
  const shown = E ? g.steps[E.n] : rn !== null ? g.steps[rn] : nx;
  $('gb-phase').textContent = E ? 'Editing step ' + E.n : shown ? (shown.round ? shown.phase : 'Deployment') : 'Game over';
  $('gb-now').textContent = E ? stepLabel(g, g.steps[E.n]) : shown ? slotText(g, shown) : 'all ' + g.rounds + ' rounds saved';
  $('gb-step').title = shown && !E ? (shown.round || rn === null ? stepLabel(g, shown) : 'Deployment') : '';
  $('gb-of').textContent = E ? '' : rn !== null ? 'step ' + rn + ' of ' + last : nx ? 'step ' + g.steps.length + ' of ' + (totalSteps(g) - 1) : '';
  // replay controls
  const rp = $('gb-rp'); rp.textContent = ''; rp.hidden = !!E;
  if (!E){ const pos = rn === null ? g.steps.length : rn;
    rp.appendChild(Object.assign(el('button', { class:'btn', id:'rp-prev', text:'◀', title:'Show the step before', 'aria-label':'Show the step before', onclick: () => showStep(rn === null ? last : rn - 1) }), { disabled: rn === 0 }));
    const sl = el('input', { type:'range', id:'rp-slider', min:'0', max: String(g.steps.length), step:'1', value: String(pos), 'aria-label':'Saved step to show; the far right is the game now',
      oninput: e => { const v = +e.target.value; if (v >= g.steps.length) stopReplay(); else showStep(v); } }); rp.appendChild(sl);
    rp.appendChild(Object.assign(el('button', { class:'btn', id:'rp-next', text:'▶', title:'Show the next step, moving the models', 'aria-label':'Show the next step', onclick: () => { if (rn >= last) stopReplay(); else showStep(rn + 1, true); } }), { disabled: rn === null }));
    rp.appendChild(el('button', { class:'btn', id:'rp-play', text: playing() ? '❚❚' : '▶▶', title: playing() ? 'Pause' : 'Play the game through, step by step', 'aria-label': playing() ? 'Pause' : 'Play the game', onclick: play })); }
  // victory points
  const vp = $('gb-vp'); vp.textContent = '';
  for (const k of ['friendly', 'hostile']) vp.appendChild(E ? vpControl(g, k, E.vp[k], v => editVP(k, v)) : rn !== null ? vpControl(g, k, g.steps[rn].vp[k], null) : vpControl(g, k, g.vp[k], v => setVP(k, v)));
  // actions
  const act = $('gb-act'); act.textContent = '';
  if (E){ const later = E.n < last;
    act.appendChild(el('button', { class:'btn primary', id:'ed-keep', text: later ? 'Save, later steps unchanged' : 'Save changes', title:'Rewrite this step from the board. Later steps keep their positions.', onclick: () => endEdit('keep') }));
    if (later) act.appendChild(el('button', { class:'btn', id:'ed-carry', text:'Save and carry forward', title:'Rewrite this step. Models the later steps did not move stay where you put them.', onclick: () => endEdit('carry') }));
    act.appendChild(el('button', { class:'btn', id:'ed-cancel', text:'Cancel', onclick: () => endEdit('cancel') })); }
  else if (rn !== null){
    act.appendChild(el('button', { class:'btn', id:'rp-edit', text:'Edit this step', title:'Put the board at this step to correct it', onclick: () => { const n = rn; stopReplay(); if (beginEdit(g, n)){ renderGame(); renderArmies(); renderInspector(); dirty(); setStatus('Editing ' + stepLabel(g, g.steps[n]) + '. Move, wound or restore models, then save.'); } } }));
    act.appendChild(el('button', { class:'btn primary', id:'rp-live', text:'Back to game', onclick: stopReplay })); }
  else act.appendChild(Object.assign(el('button', { class:'btn primary', id:'gb-save', text:'Save step', title:'Save where every model is now as the end of this phase', onclick: () => {
    const r = saveStep(); if (!r.ok){ setStatus(r.error, true); return; } renderGame();
    setStatus('Saved ' + r.label + ' (' + r.changed + (r.changed === 1 ? ' model' : ' models') + ' changed).' + (r.next ? '' : ' That was the last phase of the game.')); } }), { disabled: !nx }));
}
function endEdit(mode){ const r = finishEdit(mode); renderGame(); renderArmies(); renderInspector(); dirty();
  setStatus(mode === 'cancel' ? 'Edit cancelled. The board is back as it was.' : 'Step saved' + (r && r.changed !== null ? ' (' + r.changed + (r.changed === 1 ? ' model' : ' models') + ' changed)' : '') + '. The board is back as it was before the edit.'); }
function renderGame(){
  const g = openGame(), box = $('game-box'); renderBar(g); if (!box) return; box.textContent = '';
  if (g){
    box.appendChild(el('p', { class:'hint', text: g.name + ' · attacker: ' + (g.armies[g.attacker] || {}).name + ' · ' + g.phases.join(', ') }));
    const E = S.editing, rn = replayStep();
    box.appendChild(el('p', { class:'hint', text: E ? 'You are correcting step ' + E.n + '. Move, wound or restore models, then save it in the bar above the board, or cancel. Your board as it was before the edit comes back either way.'
      : 'Play the phase shown in the bar above the board, then press Save step. Victory points are saved with each step. Tap a step below, or use ◀ ▶ in the bar, to see it again; ▶▶ plays the game through.' }));
    const list = el('div', { class:'steps', id:'game-steps' });
    g.steps.forEach((st, i) => list.appendChild(Object.assign(el('button', { class:'st' + (rn === i || (E && E.n === i) ? ' cur' : ''), 'aria-label':'Show step ' + i + ': ' + stepLabel(g, st), onclick: () => showStep(i) }, [
      el('span', { class:'i', text: String(i) }), el('span', { class:'l', text: stepLabel(g, st) + (st.note ? ' · ' + st.note : '') }),
      el('span', { class:'s', text: (i ? Object.keys(st.models).length + ' changed · ' : '') + st.vp.friendly + '–' + st.vp.hostile + ' VP' }) ]), { disabled: !!E })));
    box.appendChild(list); setTimeout(() => { const c = list.querySelector('.cur'); if (c) c.scrollIntoView({ block:'nearest' }); else list.scrollTop = list.scrollHeight; }, 0);
    box.appendChild(el('div', { class:'row' }, [
      Object.assign(el('button', { class:'btn', id:'game-drop', text:'Delete last step', title:'Take the last saved step off the game. The board stays as it is.', onclick: () => { if (dropStep()){ renderGame(); setStatus('Last step deleted'); } } }), { disabled: g.steps.length < 2 || !!E }),
      el('button', { class:'btn', id:'game-copy', text:'Copy game', title:'Copy the game and the table as text, for another device or an analysis AI', onclick: copyGame }),
      Object.assign(el('button', { class:'btn', id:'game-close', text:'Close game', title:'Leave the game; it stays saved with this board', onclick: () => { pushUndo(); S.game = null; save(); renderGame(); setStatus('Game closed. Reopen it from the Game tab.'); } }), { disabled: !!E }) ]));
  } else {
    box.appendChild(el('p', { class:'hint', text: 'Record a game phase by phase. Deploy both armies first: where the models are when you start is step 0. A game has ' + 5 + ' battle rounds, each the attacker\'s turn then the defender\'s.' }));
    const atk = el('select', { id:'game-attacker', 'aria-label':'Attacker' }, ['friendly', 'hostile'].map(k => el('option', { value: k, text: 'Attacker: ' + S.armies[k].name })));
    atk.value = S.armies.hostile.side === 'red' ? 'hostile' : 'friendly';
    box.appendChild(el('div', { class:'row' }, [ atk ]));
    const ph = el('input', { type:'text', id:'game-phases', value: DEFAULT_PHASES.join(', '), 'aria-label':'Phases, separated by commas' });
    box.appendChild(el('div', { class:'row' }, [ el('label', { for:'game-phases', text:'Phases' }), ph ]));
    box.appendChild(el('p', { class:'hint', text: 'The 11th-edition phases. The attacker is normally the army in the red zone.' }));
    box.appendChild(el('div', { class:'row' }, [ el('button', { class:'btn primary', id:'game-start', text:'Start game', onclick: () => {
      const r = startGame({ attacker: atk.value, phases: ph.value.split(',') });
      if (!r.ok){ setStatus(r.error, true); return; } renderGame(); setStatus('Game started. Deployment is step 0; play ' + r.game.next + '.'); } }) ]));
  }
  const others = S.games.filter(x => x !== g);
  if (others.length){
    box.appendChild(el('h2', { style:'margin-top:6px', text:'Games on this board' }));
    for (const o of others) box.appendChild(el('div', { class:'board' }, [ el('span', { class:'bn', text: o.name }), el('span', { class:'bd', text: (o.steps.length - 1) + ' steps' }),
      el('button', { class:'btn', text:'Open', 'aria-label':'Open ' + o.name, title:'Open the game and put the models where they were at its last step', onclick: () => {
        pushUndo(); S.game = o.id; applyStep(o, o.steps.length - 1); save(); renderGame(); renderArmies(); renderInspector(); dirty(); setStatus(o.name + ' opened at its last step'); } }),
      el('button', { class:'btn danger', text:'Delete', 'aria-label':'Delete ' + o.name, onclick: () => { pushUndo(); S.games = S.games.filter(x => x !== o); save(); renderGame(); setStatus(o.name + ' deleted. Undo brings it back.'); } }) ]));
  }
}

// A game as text: the game itself plus the read-only table, so it can be loaded on another device (Save tab → Load from text) or read by an analysis AI.
function gameText(g){ return JSON.stringify({ kind: 'tabletop-base-planner game', note: 'Load with Save → Load from text. Format: docs/agent-briefing.md (GAMES). Millimetres, origin top-left, y down, red zone at the top.', mapId: g.mapId, game: g, table: tableData() }); }
function copyGame(){ const g = openGame(); if (!g) return; const t = gameText(g); $('io').value = t;
  const done = () => setStatus('Game copied (' + Math.round(t.length/1024) + ' KB)'), fb = () => { setStatus('Game text is in the box in the Save tab. Copy it from there.'); };
  try { navigator.clipboard.writeText(t).then(done, fb); } catch(e){ fb(); } }
// Loading a copied game: it joins this board's games (as a copy if this board already has it), with its armies and layout, opened at its last step.
function loadGame(o){
  const g = cleanGames([o.game])[0]; if (!g) return { ok: false, error: 'That game text has no steps.' };
  pushUndo(); if (S.games.some(x => x.id === g.id)){ g.id = 'g' + Date.now().toString(36); g.name += ' (copy)'; }
  for (const k of ['friendly', 'hostile']) if (g.armies[k]) Object.assign(S.armies[k], g.armies[k]);
  if (g.mapId && g.mapId !== S.mapId && MAPS[g.mapId]){ S.mapId = g.mapId; setM(MAPS[g.mapId]); loadTerrain(); buildMapSelect(); fit(); }
  S.games.push(g); S.game = g.id; S.editing = null; applyStep(g, g.steps.length - 1); save(); renderGame(); renderArmies(); renderInspector(); dirty();
  return { ok: true, id: g.id, steps: g.steps.length };
}

export { renderGame, gameText, loadGame };
