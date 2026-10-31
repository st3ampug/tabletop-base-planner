#!/usr/bin/env node
// Runs a planning script against the planner page in headless Chromium, offline, and saves boards and images.
//
//   node tools/planner/run.mjs <script.mjs> [--out DIR] [--board board.json] [--page index.html] [--headed]
//
// The script's default export is called as  async (planner, ctx) => result
//   planner   every window.planner function (docs/api.md), called from Node: await planner.check()
//   ctx.save(name, { caption, image = true })   writes DIR/<name>.board.json and DIR/<name>.png
//   ctx.read(path)   reads a text file relative to the current folder
//   ctx.log(...)     prints a line
//   ctx.page         the Playwright page, for anything the interface doesn't cover
// The result is printed as JSON. The page starts from its built-in example board in a fresh browser profile.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const headed = args.includes('--headed'); if (headed) args.splice(args.indexOf('--headed'), 1);
const out = path.resolve(opt('--out') || 'planner-out'), boardFile = opt('--board'), pageOpt = opt('--page'), script = args[0];
if (!script){ console.error('Usage: node tools/planner/run.mjs <script.mjs> [--out DIR] [--board board.json] [--page index.html] [--headed]'); process.exit(2); }

// Build the page into build/ when it's missing or older than the sources.
let pageFile = pageOpt ? path.resolve(pageOpt) : path.join(root, 'build', 'index.html');
if (!pageOpt){
  const newest = d => fs.readdirSync(d, { withFileTypes: true }).reduce((m, e) => Math.max(m, e.isDirectory() ? newest(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).mtimeMs), 0);
  const srcTime = Math.max(newest(path.join(root, 'src')), newest(path.join(root, 'data')));
  if (!fs.existsSync(pageFile) || fs.statSync(pageFile).mtimeMs < srcTime){
    try { execFileSync('python3', [path.join(root, 'tools', 'build.py'), path.join(root, 'build')], { stdio: 'inherit' }); }
    catch(e){ console.error('Could not build the page with python3; using the committed index.html.'); pageFile = path.join(root, 'index.html'); }
  }
}

let chromium;
try { ({ chromium } = require('playwright')); }
catch(e){ console.error('Playwright is missing. Run: npm install && npx playwright install chromium'); process.exit(2); }
const exe = process.env.PLANNER_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ headless: !headed, executablePath: exe });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
await page.goto(pathToFileURL(pageFile).href);
await page.waitForFunction(() => window.planner, null, { timeout: 15000 });
const version = await page.evaluate(() => window.planner.version);

const planner = new Proxy({}, { get: (_, name) => {
  if (name === 'version') return version;
  if (name === 'then' || typeof name !== 'string') return undefined;
  return (...a) => page.evaluate(([n, x]) => { const f = window.planner[n]; if (typeof f !== 'function') return { ok: false, error: 'planner.' + n + ' does not exist' }; return f(...x); }, [name, a]);
} });
fs.mkdirSync(out, { recursive: true });
const ctx = {
  page, out,
  log: (...a) => console.log(...a),
  read: p => fs.readFileSync(path.resolve(p), 'utf8'),
  async save(name, o = {}){
    const board = await planner.getBoard(); fs.writeFileSync(path.join(out, name + '.board.json'), JSON.stringify(board));
    if (o.image !== false){ const img = await planner.image({ caption: o.caption || name, pxPerInch: o.pxPerInch || 16 }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(img.split(',')[1], 'base64')); }
    console.log('saved ' + path.join(out, name) + (o.image !== false ? ' (.board.json, .png)' : ' (.board.json)'));
  }
};
let code = 0;
try {
  if (boardFile){ const r = await planner.loadBoard(fs.readFileSync(boardFile, 'utf8')); if (!r.ok) throw new Error('Could not load ' + boardFile + ': ' + (r.errors || [r.error]).join(' ')); console.log('loaded ' + boardFile); }
  const mod = await import(pathToFileURL(path.resolve(script)).href);
  if (typeof mod.default !== 'function') throw new Error(script + ' must export a default async function (planner, ctx)');
  const result = await mod.default(planner, ctx);
  if (result !== undefined) console.log(JSON.stringify(result, null, 2));
} catch(e){ console.error('Error: ' + e.message); code = 1; }
if (pageErrors.length){ console.error('Page errors:\n  ' + pageErrors.join('\n  ')); code = 1; }
await browser.close(); process.exit(code);
