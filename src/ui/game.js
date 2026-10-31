import { $ } from '../core.js';
import { S, pushUndo, save } from '../state.js';
import { dirty, setStatus } from '../render.js';
import { el, renderInspector } from './panel.js';
import { renderArmies } from '../armies.js';
import { DEFAULT_PHASES, openGame, stepLabel, nextSlot, totalSteps, startGame, saveStep, dropStep, setVP, applyStep, armyOfTurn } from '../game.js';

/* ---------- the Game tab and the game bar ---------- */
function vpControl(g, army){
  const A = S.armies[army] || g.armies[army] || {}, nm = A.name || army;
  return el('span', { class:'vp', title: nm + ' victory points' }, [ el('span', { class:'dot', style:'background:' + (A.colour || '#888'), 'aria-hidden':'true' }),
    el('button', { class:'btn', id:'vp-' + army + '-minus', text:'−', 'aria-label':'One victory point less for ' + nm, onclick: () => { setVP(army, g.vp[army] - 1); renderGame(); } }),
    el('span', { class:'n', id:'vp-' + army, text: String(g.vp[army]), 'aria-label': nm + ' victory points' }),
    el('button', { class:'btn', id:'vp-' + army + '-plus', text:'+', 'aria-label':'One victory point more for ' + nm, onclick: () => { setVP(army, g.vp[army] + 1); renderGame(); } }) ]);
}
function renderBar(g){
  const bar = $('gamebar'); bar.hidden = !g; if (!g) return;
  const nx = nextSlot(g);
  // The phase to play first, then the round and whose turn it is (cut short on a phone), then the count.
  $('gb-phase').textContent = nx ? nx.phase : 'Game over';
  $('gb-now').textContent = nx ? 'Round ' + nx.round + ' · ' + (nx.turn === 'attacker' ? 'Attacker' : 'Defender') + ' (' + ((g.armies[armyOfTurn(g, nx.turn)] || {}).name || '') + ')' : 'all ' + g.rounds + ' rounds saved';
  $('gb-step').title = nx ? stepLabel(g, nx) : '';
  $('gb-of').textContent = nx ? 'step ' + g.steps.length + ' of ' + (totalSteps(g) - 1) : '';
  const vp = $('gb-vp'); vp.textContent = ''; vp.appendChild(vpControl(g, 'friendly')); vp.appendChild(vpControl(g, 'hostile'));
  $('gb-save').disabled = !nx;
}
function renderGame(){
  const g = openGame(), box = $('game-box'); renderBar(g); if (!box) return; box.textContent = '';
  if (g){
    box.appendChild(el('p', { class:'hint', text: g.name + ' · attacker: ' + (g.armies[g.attacker] || {}).name + ' · ' + g.phases.join(', ') }));
    box.appendChild(el('p', { class:'hint', text: 'Play the phase shown in the bar above the board, then press Save step. The planner keeps where every model is at the end of each phase. Victory points are saved with each step.' }));
    const list = el('div', { class:'steps', id:'game-steps' });
    g.steps.forEach((st, i) => list.appendChild(el('div', { class:'st' }, [ el('span', { class:'i', text: String(i) }), el('span', { class:'l', text: stepLabel(g, st) + (st.note ? ' · ' + st.note : '') }),
      el('span', { class:'s', text: (i ? Object.keys(st.models).length + ' moved · ' : '') + st.vp.friendly + '–' + st.vp.hostile + ' VP' }) ])));
    box.appendChild(list); setTimeout(() => { list.scrollTop = list.scrollHeight; }, 0);
    box.appendChild(el('div', { class:'row' }, [
      Object.assign(el('button', { class:'btn', id:'game-drop', text:'Delete last step', title:'Take the last saved step off the game. The board stays as it is.', onclick: () => { if (dropStep()){ renderGame(); setStatus('Last step deleted'); } } }), { disabled: g.steps.length < 2 }),
      el('button', { class:'btn', id:'game-close', text:'Close game', title:'Leave the game; it stays saved with this board', onclick: () => { pushUndo(); S.game = null; save(); renderGame(); setStatus('Game closed. Reopen it from the Game tab.'); } }) ]));
  } else {
    box.appendChild(el('p', { class:'hint', text: 'Record a game phase by phase. Deploy both armies first: where the models are when you start is step 0. A game has ' + 5 + ' battle rounds, each the attacker\'s turn then the defender\'s.' }));
    const atk = el('select', { id:'game-attacker', 'aria-label':'Attacker' }, ['friendly', 'hostile'].map(k => el('option', { value: k, text: 'Attacker: ' + S.armies[k].name })));
    atk.value = S.armies.hostile.side === 'red' ? 'hostile' : 'friendly';
    box.appendChild(el('div', { class:'row' }, [ atk ]));
    const ph = el('input', { type:'text', id:'game-phases', value: DEFAULT_PHASES.join(', '), 'aria-label':'Phases, separated by commas' });
    box.appendChild(el('div', { class:'row' }, [ el('label', { for:'game-phases', text:'Phases' }), ph ]));
    box.appendChild(el('p', { class:'hint', text: 'The 10th-edition phases; set them to your 11th-edition rules. The attacker is normally the army in the red zone.' }));
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
$('gb-save').addEventListener('click', () => { const r = saveStep(); if (!r.ok){ setStatus(r.error, true); return; } renderGame();
  setStatus('Saved ' + r.label + ' (' + r.changed + (r.changed === 1 ? ' model' : ' models') + ' changed).' + (r.next ? '' : ' That was the last phase of the game.')); });

export { renderGame };
