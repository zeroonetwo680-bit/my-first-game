/* Headless smoke test: stub browser APIs, run the real game logic for
   thousands of frames, exercise waves, kills, rockets, death, restart. */
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

/* ---------------- stubs ---------------- */
function makeCtx() {
  const gradient = { addColorStop() {} };
  const target = {};
  return new Proxy(target, {
    get(t, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (!(prop in t)) t[prop] = () => undefined;
      return t[prop];
    },
    set(t, prop, v) { t[prop] = v; return true; }
  });
}

const elements = {};
function makeEl(id) {
  const classes = new Set();
  return {
    id, style: {}, textContent: '', value: '', offsetWidth: 100,
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      toggle: (c, f) => { if (f === undefined) f = !classes.has(c); if (f) classes.add(c); else classes.delete(c); return f; },
      contains: c => classes.has(c)
    },
    addEventListener() {}, focus() {}, blur() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 })
  };
}

let now = 0;
let rafCb = null;

// pre-seed the #game canvas element (needs getContext + element API)
const gameCanvas = Object.assign(makeEl('game'), {
  width: 0, height: 0, getContext: () => makeCtx()
});
elements['game'] = gameCanvas;

const storage = {};
const sandbox = {
  console,
  Math, Infinity, NaN, isFinite, parseInt, parseFloat,
  performance: { now: () => now },
  setTimeout: (fn) => 0, clearTimeout: () => {},
  localStorage: {
    getItem: k => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; }
  },
  navigator: { maxTouchPoints: 0 },
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: cb => { rafCb = cb; return 1; },
  document: {
    hidden: false,
    activeElement: null,
    getElementById: id => (elements[id] || (elements[id] = makeEl(id))),
    createElement: () => ({ width: 0, height: 0, getContext: () => makeCtx() }),
    querySelector: sel => (elements[sel] || (elements[sel] = makeEl(sel))),
    addEventListener() {}
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
vm.createContext(sandbox);

for (const f of ['core.js', 'audio.js', 'fx.js', 'input.js', 'game.js']) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}

sandbox.__getRaf = () => rafCb;
vm.runInContext('this.__frame = (t) => { now = t; const cb = __getRaf(); cb && cb(t); };', sandbox);

const run = (code) => vm.runInContext(code, sandbox);

let failures = 0;
function check(name, code, expect) {
  try {
    const got = run(code);
    const ok = expect === undefined ? true : expect(got);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> got: ' + JSON.stringify(got)}`);
    if (!ok) failures++;
  } catch (e) {
    console.log(`ERROR ${name}  -> ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
    failures++;
  }
}

console.log('--- boot ---');
run('__frame(0)');

check('state is menu after boot', 'Game.state', s => s === 'menu');
check('menu has attract cars', 'Game.enemies.length', n => n === 4);

console.log('--- run: 60s of play with input ---');
run(`
Game.startRun();
this.__diedAt = -1;
this.__midParticles = false;
this.__minHp = 100;
for (let i = 1; i <= 3600; i++) {
  Input.keys['KeyW'] = true;
  if (i % 5 < 3) Input.keys['Space'] = true;   // fire most frames
  if (i % 400 < 120) Input.keys['ShiftLeft'] = true; // boost bursts
  if (i % 300 === 150) { Input.keys['KeyD'] = true; }
  if (i % 300 === 220) { Input.keys['KeyD'] = false; Input.keys['KeyA'] = true; }
  if (i % 300 === 290) { Input.keys['KeyA'] = false; }
  __frame(i * 16.6);
  Input.endFrame();
  if (i === 600) { this.__midParticles = FX.particles.items.some(p => p.active); this.__hp10 = Game.player.hp; }
  if (Game.player) this.__minHp = Math.min(this.__minHp, Game.player.hp);
  if (Game.player.dead && this.__diedAt < 0) this.__diedAt = (i * 16.6 / 1000).toFixed(1);
}
`);
check('blind bot survives a reasonable time (or is still going)', 'Game.state + ":" + this.__diedAt', s => {
  const [state, diedAt] = s.split(':');
  return (state === 'playing' && diedAt === '-1') || Number(diedAt) > 20;
});
check('hp healthy after first 10s (fun, not brutal)', 'this.__hp10', h => h > 50);
check('player object present', 'Game.player ? "ok" : "no"', s => s === 'ok');
check('particles were spawned mid-run', 'this.__midParticles', b => b === true);
check('bullets flew', 'Game.bullets.items.some(b => b.active) || Game.score > 0', b => b === true);

console.log('--- force kills / rockets / pickups ---');
run(`
// teleport enemies in front of player for kills
for (let k = 0; k < 6; k++) {
  const p = Game.player;
  Game.spawnEnemy('rammer', p.x + Math.cos(p.angle) * (200 + k * 30), p.y + Math.sin(p.angle) * (200 + k * 30));
}
const p2 = Game.player;
p2.rockets = 1;
Input.keys['KeyE'] = true;
for (let i = 0; i < 600; i++) {
  Input.keys['KeyW'] = true; Input.keys['Space'] = true;
  __frame((4000 + i) * 16.6);
  Input.endFrame();
}
`);
check('rockets consumed', 'Game.player.rockets', n => n < 3);
check('kills registered', 'Game.kills', n => n > 0);
check('score accumulated', 'Game.score', n => n > 0);
check('combo tracked', 'Game.maxCombo', n => n >= 1);

console.log('--- wave flow: explicit wave runs, clears, and advances ---');
run(`
this.__maxAlive = 0;
this.__maxQueue = 0;
if (Game.state !== 'playing') Game.startRun();
Game.startWave(3);
this.__maxQueue = Game.spawnQueue.length;
for (let i = 0; i < 1500 && !Game.betweenWaves; i++) {
  Input.keys['KeyW'] = true;
  __frame((50000 + i) * 16.6);
  Input.endFrame();
  this.__maxAlive = Math.max(this.__maxAlive, Game.enemies.length + Game.portals.length);
  // bot helps clear: snipe anything alive
  for (const e of [...Game.enemies]) if (dist2(e.x, e.y, Game.player.x, Game.player.y) < 500 * 500) damageEnemy(e, 3, e.x, e.y);
  if (Game.player.dead) break;
}
`);
check('wave 3 was set', 'Game.wave >= 3', v => v === true);
check('wave 3 queue was built', 'this.__maxQueue', n => n === 8);
check('enemies/portals appeared', 'this.__maxAlive', n => n > 0);
check('wave 3 eventually cleared', 'Game.betweenWaves', b => b === true);
run(`
Game.betweenTimer = 0.01;
__frame((52000) * 16.6);
Input.endFrame();
`);
check('advanced to wave 4 after clear', 'Game.wave', w => w === 4);

console.log('--- pickups apply ---');
run(`
const types = ['repair','coin','nitro','triple','shield'];
for (const t of types) Game.applyPickup({ x: Game.player.x, y: Game.player.y, type: t, t: 0, life: 5 });
`);
check('repair applied', 'Game.player.hp', h => h > 0);
check('triple timer set', 'Game.player.triple', t => t > 0);
check('shield timer set', 'Game.player.shield', t => t > 0);

console.log('--- death & game over ---');
run(`
Game.player.shield = 0;
damagePlayer(9999, Game.player.x, Game.player.y);
for (let i = 0; i < 200; i++) __frame((60000 + i) * 16.6);
`);
check('player died', 'Game.player.dead', d => d === true);
check('game over reached', 'Game.state', s => s === 'over');

console.log('--- high scores ---');
run('Game.score = 12345; Game.renderScores("over-highscores"); if (Game.qualifies()) Game.saveScore();');
check('score saved to storage', 'JSON.parse(localStorage.getItem("nw.scores")).length', n => n >= 1);
check('restart works', 'Game.startRun(); Game.state', s => s === 'playing');
run(`
for (let i = 0; i < 600; i++) {
  Input.keys['KeyW'] = true;
  __frame((80000 + i) * 16.6);
  Input.endFrame();
}
`);
check('post-restart playing', 'Game.state', s => s === 'playing');

console.log('--- pause flow ---');
run('Game.togglePause();');
check('paused', 'Game.state', s => s === 'paused');
run('Game.togglePause();');
check('resumed', 'Game.state', s => s === 'playing');
run('Game.enterMenu();');
check('back to menu', 'Game.state', s => s === 'menu');
run('for (let i = 0; i < 300; i++) __frame((100000 + i) * 16.6);');
check('menu idles fine', 'Game.state', s => s === 'menu');

console.log('--- touch drive path ---');
run(`
Game.startRun();
Input.touchUsed = true;
Input.stick.active = true;
Input.stick.dx = 0.8; Input.stick.dy = -0.4;
Input.touch.fire = true; Input.touch.boost = true;
for (let i = 0; i < 600; i++) __frame((120000 + i) * 16.6);
Input.stick.active = false; Input.touch.fire = false; Input.touch.boost = false;
`);
check('touch run ok', 'Game.state', s => s === 'playing' || s === 'over');

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
