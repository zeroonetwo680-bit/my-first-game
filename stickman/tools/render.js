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
for (const f of ['core.js', 'rig.js', 'audio.js', 'game.js', 'duel.js']) {
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
Game.dropWeapon(760, 560, 'ruler');
Game.dropWeapon(360, 190, 'eraser');
`);
shot('02-gameplay');

/* ------------------------------------------------------- with a weapon --- */
run(`
Game.reset('playing'); Game.startRun();
Game.pending.length = 0; Game.enemies.length = 0;
Game.wave = 4;
Game.equipWeapon('ruler');
var p = Game.player; p.x = 520; p.y = 460;
Game.spawnEnemy('walker', 780, 300);
Game.spawnEnemy('runner', 300, 330);
Game.spawnEnemy('thrower', 940, 520);
Input.mouse.x = 900; Input.mouse.y = 250;
Game.update(0.01);
Input.mouse.down = true;
p.fireCd = 0; Game.fire();
for (var i = 0; i < 6; i++) Game.update(1 / 60);
p.fireCd = 0.2;
for (var k = 0; k < 5; k++) Game.update(1 / 60);
Input.mouse.down = false;
Game.score = 2010; Game.combo = 3; Game.comboTimer = 2;
`);
shot('06-weapon-ruler');

run(`
Game.reset('playing'); Game.startRun();
Game.pending.length = 0; Game.enemies.length = 0;
Game.wave = 4;
Game.equipWeapon('eraser');
var p = Game.player; p.x = 620; p.y = 470;
Game.spawnEnemy('brute', 860, 300);
Game.spawnEnemy('walker', 420, 300);
Input.mouse.x = 900; Input.mouse.y = 280;
p.fireCd = 0; Game.fire();
for (var i = 0; i < 8; i++) Game.update(1 / 60);
Game.score = 860; Game.combo = 1;
`);
shot('07-weapon-eraser');

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

/* -------------------------------------------------- muzzle close-up --- */
run(`
Game.reset('playing'); Game.startRun();
Game.pending.length = 0; Game.enemies.length = 0;
Game.equipWeapon('ruler');
var p = Game.player; p.x = 520; p.y = 470; p.aim = -0.45;
Game.toast = 0;
Input.mouse.x = 900; Input.mouse.y = 300;
p.fireCd = 0; Game.fire();
for (var i = 0; i < 2; i++) Game.update(1 / 60);
`);
shot('08-muzzle-line');

run(`
Game.reset('playing'); Game.startRun();
Game.pending.length = 0; Game.enemies.length = 0;
Game.equipWeapon('eraser');
var p = Game.player; p.x = 520; p.y = 470; p.aim = -0.45;
Game.toast = 0;
Input.mouse.x = 900; Input.mouse.y = 300;
p.fireCd = 0; Game.fire();
for (var i = 0; i < 3; i++) Game.update(1 / 60);
`);
shot('09-muzzle-eraser');

/* A real fixed-step first frame: ensure the streak doesn't reach behind the muzzle. */
run(`
Game.reset('playing'); Game.startRun();
Game.pending.length = 0; Game.enemies.length = 0;
Game.equipWeapon('compass');
var p = Game.player; p.x = 520; p.y = 470;
Game.banner = 0; Game.toast = 0;
Input.mouse.x = 1000; Input.mouse.y = 470; Input.mouse.down = true;
p.fireCd = 0; Game.update(1 / 120);
Input.mouse.down = false;
`);
shot('10-first-shot');

/* Close-combat action frames, with a live opponent in striking range. */
for (const move of ['punch', 'kick', 'sword']) {
  sandbox.__move = move;
  run(`
    Game.reset('playing'); Game.startRun();
    Game.pending.length = 0; Game.enemies.length = 0;
    Game.banner = 0; Game.player.x = 500; Game.player.y = 460; Game.player.aim = 0;
    Input.mouse.x = 1000; Input.mouse.y = 460; Input.mouse.down = false;
    var foe = Game.spawnEnemy('brute', __move === 'sword' ? 640 : 600, 460); foe.hp = 250; foe.maxhp = 250;
    if (__move === 'kick') { Game.player.comboTimer = 1; Game.player.comboStep = 1; }
    Game.startMelee(__move === 'sword' ? 'sword' : 'kungfu');
    Game.updateMelee(Game.player.attack.duration * 0.46);
  `);
  shot('11-combat-' + move);
}

/* House adventure: map, unlocked exit, boss and completion. */
run("Game.openMap(); Game.t = 1;");
shot('12-house-map');
run(`
Game.startHouse(); Game.pending.length = 0; Game.enemies.length = 0;
Game.updateHouse(0.7); Game.banner = 0; Game.player.x = 720; Game.player.y = 390; Game.player.iframes = 0;
`);
shot('13-house-door');
run(`
Game.loadHouseRoom(3); Game.pending.length = 0;
var boss = Game.spawnEnemy('boss', 900, 410); boss.bossPhase = 'windup';
boss.chargeX = -1; boss.chargeY = 0; Game.banner = 0;
Game.player.x = 420; Game.player.y = 410; Game.player.aim = 0; Game.player.iframes = 0;
`);
shot('14-house-boss');
run("Game.score=1840; Game.kills=10; Game.state='victory';");
shot('15-house-victory');

/* Combat pacing and the charged ink blast in real game frames. */
run(`
Game.startHouse(); Game.pending.length = 0; Game.enemies.length = 0;
Game.banner = 0; Game.player.x = 530; Game.player.y = 450; Game.player.aim = 0;
Game.player.iframes = 0; Game.player.ink = 100;
Game.spawnEnemy('runner', 700, 410); Game.spawnEnemy('brute', 750, 500);
Input.mouse.x = 900; Input.mouse.y = 450; Input.mouse.down = false;
`);
shot('16-ink-ready');
run(`Game.activateBlast(); Game.updateEffects(0.31);`);
shot('17-ink-blast');
run(`
Game.startHouse(); Game.loadHouseRoom(3); Game.pending.length = 0;
var boss = Game.spawnEnemy('boss', 900, 410); boss.hp = boss.maxhp * 0.4;
boss.enraged = true; boss.bossPhase = 'windup'; boss.chargeX = -1; boss.chargeY = 0;
Game.banner = 0; Game.player.x = 420; Game.player.y = 410; Game.player.aim = 0;
Game.player.iframes = 0;
`);
shot('18-boss-enraged');

/* New room props, hostile swordsman windup and a first-aid pickup. */
run(`
Game.startHouse(); Game.pending.length = 0; Game.enemies.length = 0;
Game.banner = 0; Game.player.iframes = 0; Game.player.x = 385; Game.player.y = 425;
Game.player.aim = 0; Input.mouse.x = 800; Input.mouse.y = 300;
Game.spawnEnemy('walker', 850, 430);
`);
shot('19-supply-room');
run(`
Game.loadHouseRoom(2); Game.pending.length = 0; Game.enemies.length = 0;
Game.banner = 0; Game.player.iframes = 0; Game.player.x = 460; Game.player.y = 430;
Game.player.aim = 0; var swordsman = Game.spawnEnemy('swordsman', 630, 430);
swordsman.swordPhase = 'windup'; swordsman.chargeX = -1; swordsman.chargeY = 0;
`);
shot('20-swordsman');
run(`
Game.hitCrate(Game.crates[0], 30); Game.player.hp = 55;
`);
shot('21-first-aid');

/* Separate sword duel: idle face-off, a slash, a block, and the result. */
run(`Duel.start(); Duel.player.x=465; Duel.rival.x=805; Game.t=2;`);
shot('22-duel-faceoff');
run(`Duel.player.x=560; Duel.rival.x=710; Duel.strike(Duel.player); Duel.player.attack.time=0.23;`);
shot('23-duel-slash');
run(`Duel.player.attack=null; Duel.rival.block=true; Duel.rival.guard=40;`);
shot('24-duel-block');
run(`Duel.phase='over'; Duel.result='YOU WIN'; Duel.rival.hp=0;`);
shot('25-duel-result');

console.log('\nframes in', OUT);
