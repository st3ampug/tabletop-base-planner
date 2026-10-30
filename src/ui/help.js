import { $ } from '../core.js';

/* ---------- help ---------- */
$('btn-help').addEventListener('click', () => { try { $('help').showModal(); } catch(e){ $('help').setAttribute('open', ''); } });
$('help-close').addEventListener('click', () => $('help').close());
$('help').addEventListener('click', e => { if (e.target === $('help')) $('help').close(); });
