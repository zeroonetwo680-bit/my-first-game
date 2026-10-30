/* Render real frames of STICKMAN to PNG, without a browser.
 *
 * Used to check the game actually looks like a drawing on paper rather than
 * trusting that "the tests pass". Run: node tools/render.js [outDir]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/stickman';
fs.mkdirSync(OUT, { recursive: true });

function makeCtx() { return null; }

const W = 1280, H = 720;
const real = createCanvas(W, H);
const ctx = real.getContext('2d');

/* A canvas good enough for the game: everything real except document. */
const sandbox = {
  console, Infinity, NaN, isFinite, parseInt, parseFloat,
  setTimeout: () => 0, clearTimeout: () => {},
  performance: { now: () => 0 },
  localStorage: { _m: {}, getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } },
  navigator: { maxTouchPoints: 0 },
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: () => 1,
  document: { getElementById: () => null, createElement: () => null, addEventListener() {} }
};
sandbox.Math = Object.create(Math);
let seed = 20261030;
sandbox.Math.random = function () {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['core.js', 'rig.js', 'audio.js', 'game.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), sandbox, { filename: f });
}
const run = (code) => vm.runInContext(code, sandbox);

/* the game renders in logical space; the canvas is already 1280x720 */
const canvasLike = { width: W, height: H, getContext: () => ctx, clientWidth: W, clientHeight: H };
sandbox.__c = canvasLike;
run('Game.init(__c)');
run('Game.viewScale = 1; Game.viewX = 0; Game.viewY = 0;');

function shot(name) {
  run('Game.render()');
  fs.writeFileSync(path.join(OUT, name + '.png'), real.toBuffer('image/png'));
  console.log('wrote', name + '.png');
}

/* ------------------------------------------------------------- menu --- */
run('Game.reset("menu"); Game.t = 1.2;');
shot('01-menu');

/* --------------------------------------------------------- gameplay --- */
run(`
Game.startRun();
Game.pending.length = 0;
Game.enemies.length = 0;
Game.bullets.length = 0;
Game.wave = 3;
var p = Game.player;
p.x = 560; p.y = 470;
Game.spawnEnemy('walker', 800, 300);
Game.spawnEnemy('runner', 300, 250);
Game.spawnEnemy('thrower', 940, 520);
Game.spawnEnemy('brute', 220, 560);
Input.mouse.x = 900; Input.mouse.y = 280;
for (var i = 0; i < 12; i++) { Input.mouse.down = true; Game.update(1/60); }
Game.bullets.push({x:700,y:340,vx:900,vy:-200,life:1,dmg:11,r:3,a:-0.2});
Game.score = 1480; Game.combo = 4; Game.comboTimer = 2; Game.kills = 37;
`);
shot('02-gameplay');

/* ------------------------------------------------------- six arms ------ */
run(`
Game.reset('playing'); Game.startRun();
Game.pending.length = 0; Game.enemies.length = 0;
Game.powers.arms = true; Game.player.arms = 3;
Game.powers.heart = true; Game.powers.reflex = true; Game.powers.sonic = true;
Game.wave = 5;
var p = Game.player; p.x = 640; p.y = 430; p.maxhp = 160; p.hp = 118;
Game.spawnEnemy('brute', 900, 300);
Game.spawnEnemy('walker', 380, 300);
Game.spawnEnemy('thrower', 980, 520);
Input.mouse.x = 940; Input.mouse.y = 220;
Input.mouse.down = true; Game.player.fireCd = 0;
Game.fire(); Game.update(1/60);
Game.score = 5210; Game.combo = 6; Game.comboTimer = 2;
`);
shot('03-six-arms');

/* ------------------------------------------------------ power screen --- */
run(`
Game.reset('playing'); Game.startRun();
Game.pending.length = 0; Game.enemies.length = 0;
Game.wave = 2;
Game.betweenWaves();
Game.sel = 0;
`);
shot('04-what-if');

/* ---------------------------------------------------------- game over -- */
run(`
Game.reset('playing'); Game.startRun();
Game.score = 3120; Game.wave = 7; Game.kills = 54; Game.best = 3120;
Game.player.iframes = 0; Game.damagePlayer(999, 0, 0);
Game.player.deadT = 0.9;
`);
shot('05-game-over');

console.log('\nframes in', OUT);
