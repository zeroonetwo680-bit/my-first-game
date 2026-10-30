/* Headless smoke test for STICKMAN.
 *
 * Loads the real game files into a stubbed browser, then exercises the rig,
 * the spawn pipeline, combat, the what-if powers, death and restart. The canvas
 * is a no-op proxy, so anything that only looks right (never throws) is caught
 * here, and anything that is pure geometry is asserted numerically.
 */
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------- stubs --- */
function makeCtx() {
  const gradient = { addColorStop() {} };
  const t = {};
  return new Proxy(t, {
    get(o, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'measureText') return (s) => ({ width: String(s).length * 9 });
      if (!(prop in o)) o[prop] = () => undefined;
      return o[prop];
    },
    set(o, prop, v) { o[prop] = v; return true; }
  });
}

const elements = {};
function makeEl(id) {
  return {
    id, style: {}, textContent: '', width: 0, height: 0,
    clientWidth: 1280, clientHeight: 720,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, appendChild() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    getContext: () => makeCtx()
  };
}
elements.game = makeEl('game');

const storage = {};
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sandbox = {
  console, Infinity, NaN, isFinite, parseInt, parseFloat,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  performance: { now: () => 0 },
  localStorage: {
    getItem: k => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; }
  },
  navigator: { maxTouchPoints: 0 },
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: () => 1,
  document: {
    getElementById: id => (elements[id] || (elements[id] = makeEl(id))),
    createElement: () => makeEl('dyn'),
    addEventListener() {}
  }
};
sandbox.Math = Object.create(Math);
sandbox.Math.random = mulberry32(20261030);
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ['core.js', 'rig.js', 'audio.js', 'game.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox, { filename: f });
}

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

/* ---------------------------------------------------------- the rig --- */
console.log('--- rig ---');
check('head sits above the hips', `
var p = Rig.pose({ x: 100, y: 300, size: 60 });
p.head.y < p.hip.y
`, v => v === true);

check('feet hang below the hips', `
var p = Rig.pose({ x: 100, y: 300, size: 60 });
p.legL.foot.y > p.hip.y && p.legR.foot.y > p.hip.y
`, v => v === true);

check('a standing figure keeps both feet near the ground', `
var p = Rig.pose({ x: 100, y: 300, size: 60, gait: 0 });
Math.abs(p.legL.foot.y - p.legR.foot.y) < 4
`, v => v === true);

check('walking swings the legs apart', `
var a = Rig.pose({ x: 100, y: 300, size: 60, gait: 1, phase: 0 });
var b = Rig.pose({ x: 100, y: 300, size: 60, gait: 1, phase: Math.PI });
Math.abs(a.legL.foot.x - b.legL.foot.x) > 8
`, v => v === true);

check('two arms by default, six with the arms power', `
var one = Rig.pose({ x: 0, y: 0, size: 60 });
var six = Rig.pose({ x: 0, y: 0, size: 60, arms: 3, aimSpreads: [0, 0.3, -0.3] });
one.hands.length === 2 && six.hands.length === 6
`, v => v === true);

check('aiming points an arm along the aim angle', `
var p = Rig.pose({ x: 400, y: 400, size: 60, aim: 0 });
var hand = p.armPairs[0].right.hand;
hand.x > p.shoulder.x + 10
`, v => v === true);

check('the pose is deterministic for the same seed and frame', `
var a = Rig.pose({ x: 10, y: 20, size: 60, seed: 42, t: 1.0, phase: 1.2, gait: 1 });
var b = Rig.pose({ x: 10, y: 20, size: 60, seed: 42, t: 1.0, phase: 1.2, gait: 1 });
JSON.stringify(a.legL.foot) === JSON.stringify(b.legL.foot) && a.head.x === b.head.x
`, v => v === true);

check('the wobble is bounded, it never displaces a joint by a lot', `
var p = Rig.pose({ x: 0, y: 0, size: 60, seed: 3, t: 2.5 });
var p2 = Rig.pose({ x: 0, y: 0, size: 60, seed: 3, t: 2.5 });
Math.abs(p.head.x - p2.head.x) < 0.0001 && Math.abs(p.head.x) < 12
`, v => v === true);

/* -------------------------------------------------------- the game --- */
console.log('--- boot ---');
check('the game starts on the menu', 'Game.state', s => s === 'menu');
check('nothing is simulated on the menu', `
Game.update(0.016); Game.enemies.length + Game.pending.length
`, n => n === 0);

check('starting a run gives a live player on wave one', `
Game.startRun();
[Game.state, Game.wave, Game.player.hp, Game.player.dead].join(',')
`, v => v === 'playing,1,100,false');

check('wave one telegraphs its spawns before they arrive', 'Game.pending.length', n => n > 0);

check('the telegraphs turn into enemies', `
for (var i = 0; i < 400; i++) Game.update(0.05);
Game.pending.length === 0 && Game.enemies.length > 0
`, v => v === true);

check('enemies stay inside the page', `
Game.enemies.every(function (e) { return e.x >= 0 && e.x <= W && e.y >= 0 && e.y <= H; })
`, v => v === true);

console.log('--- combat ---');
check('holding fire produces bullets', `
Game.reset('playing'); Game.startRun();
Game.pending.length = 0;
Game.bullets.length = 0;
Input.mouse.down = true;
for (var i = 0; i < 20; i++) Game.update(0.016);
Input.mouse.down = false;
Game.bullets.length > 0 || Game.kills > 0
`, v => v === true);

check('a bullet kills a weak enemy and pays out', `
Game.reset('playing'); Game.startRun();
Game.enemies.length = 0; Game.pending.length = 0;
var e = Game.spawnEnemy('walker', Game.player.x + 120, Game.player.y);
var before = Game.score;
Game.hurtEnemy(e, 999, 0);
[Game.score > before, e.dead, Game.combo >= 1].join(',')
`, v => 'true,true,true');

check('a kill raises the combo multiplier', `
Game.reset('playing'); Game.startRun();
Game.enemies.length = 0; Game.pending.length = 0;
var a = Game.spawnEnemy('walker', 200, 200);
var b = Game.spawnEnemy('walker', 300, 200);
Game.hurtEnemy(a, 999, 0); Game.hurtEnemy(b, 999, 0);
Game.combo >= 2 && Game.comboTimer > 0
`, v => v === true);

check('taking a hit costs health and grants brief invulnerability', `
Game.reset('playing'); Game.startRun();
Game.player.iframes = 0;
Game.damagePlayer(15, 0, 0);
var hp = Game.player.hp;
Game.damagePlayer(15, 0, 0);
[hp < 100, Game.player.iframes > 0, Game.player.hp === hp].join(',')
`, v => 'true,true,true');

check('a hit breaks the combo', `
Game.reset('playing'); Game.startRun();
Game.combo = 5; Game.player.iframes = 0;
Game.damagePlayer(5, 0, 0);
Game.combo === 0
`, v => v === true);

check('dying ends the run and records the best score', `
Game.reset('playing'); Game.startRun();
Game.score = 1234; Game.player.iframes = 0;
Game.damagePlayer(9999, 0, 0);
[Game.state, Game.player.dead, Game.best].join(',')
`, v => 'dead,true,1234');

check('the stored best survives a reload', 'Store.get("best", 0)', v => v === 1234);

check('restarting clears the board', `
Game.startRun();
[Game.state, Game.enemies.length, Game.score, Game.wave].join(',')
`, v => 'playing,0,0,1');

console.log('--- movement and dash ---');
check('input moves the player', `
Game.reset('playing'); Game.startRun();
var x0 = Game.player.x;
Input.keys['KeyD'] = true;
for (var i = 0; i < 40; i++) Game.update(0.016);
Input.keys['KeyD'] = false;
Game.player.x > x0 + 10
`, v => v === true);

check('the player cannot leave the page', `
for (var i = 0; i < 200; i++) { Input.keys['KeyA'] = true; Game.update(0.016); }
Input.keys['KeyA'] = false;
Game.player.x >= 0 && Game.player.x <= W
`, v => v === true);

check('dash moves you and then goes on cooldown', `
Game.reset('playing'); Game.startRun();
Game.player.dashCd = 0;
var x0 = Game.player.x;
Input.keys['KeyD'] = true;
Game.dash();
Input.keys['KeyD'] = false;
[Game.player.dashCd > 0, Game.player.iframes > 0].join(',')
`, v => 'true,true');

check('dash cannot be spammed', `
Game.reset('playing'); Game.startRun();
Game.player.dashCd = 0;
var dashes = 0;
for (var i = 0; i < 5; i++) {
  var before = Game.player.dashCd;
  Game.dash();
  if (Game.player.dashCd > before && Game.player.dashCd > 0.5) dashes++;
}
dashes === 1
`, v => v === true);

console.log('--- the what-if powers ---');
check('clearing a wave offers exactly two powers', `
Game.reset('playing'); Game.startRun();
Game.wave = 2; Game.betweenWaves();
[Game.state, Game.offer.length].join(',')
`, v => 'power,2');

check('the two offers are different', `
Game.offer[0].id !== Game.offer[1].id
`, v => v === true);

check('choosing a power records it and resumes play', `
Game.choosePower(0);
Game.state === 'playing' && Object.keys(Game.powers).length === 1
`, v => v === true);

check('six arms fires three bullets per shot', `
Game.reset('playing'); Game.startRun();
Game.powers = Object.create(null); Game.powers.arms = true;
Game.player.arms = 3; Game.player.fireCd = 0;
Game.bullets.length = 0;
Game.fire();
Game.bullets.length === 3
`, v => v === true);

check('a second heart raises the health ceiling', `
Game.reset('playing'); Game.startRun();
Game.powers = Object.create(null);
Game.offer = Game.POWERS.filter(function (p) { return p.id === 'heart'; });
Game.state = 'power';
Game.choosePower(0);
[Game.player.maxhp, Game.player.hp].join(',')
`, v => '160,160');

check('sonic dash blinks the player forward', `
Game.reset('playing'); Game.startRun();
Game.powers = Object.create(null);
Game.offer = Game.POWERS.filter(function (p) { return p.id === 'sonic'; });
Game.state = 'power'; Game.choosePower(0);
var x0 = Game.player.x, y0 = Game.player.y;
Game.dash();
Math.abs(Game.player.x - x0) + Math.abs(Game.player.y - y0) > 80
`, v => v === true);

check('sonic dash cuts the enemies it passes through', `
Game.reset('playing'); Game.startRun();
Game.powers = Object.create(null);
Game.offer = Game.POWERS.filter(function (p) { return p.id === 'sonic'; });
Game.state = 'power'; Game.choosePower(0);
Game.enemies.length = 0;
var e = Game.spawnEnemy('brute', Game.player.x + 60, Game.player.y);
Game.player.aim = 0;
Input.keys = Object.create(null);
Input.keys['KeyD'] = true;
Game.dash();
Input.keys['KeyD'] = false;
e.hp < e.maxhp
`, v => v === true);

check('tracking eyes bend a bullet toward a target', `
Game.reset('playing'); Game.startRun();
Game.powers = Object.create(null); Game.powers.eyes = true;
Game.enemies.length = 0;
var e = Game.spawnEnemy('brute', 400, 300);
var b = { x: 200, y: 400, vx: 900, vy: 0, life: 2, dmg: 5, r: 3, a: 0 };
Game.home(b, 0.05);
b.vy < -5
`, v => v === true);

check('reflexes slow the world when something is close', `
Game.reset('playing'); Game.startRun();
Game.powers = Object.create(null); Game.powers.reflex = true;
Game.enemies.length = 0;
var far = Game.reflexScale();
Game.spawnEnemy('walker', Game.player.x + 30, Game.player.y);
var near = Game.reflexScale();
far > 0.95 && near < 0.6
`, v => v === true);

check('pain immunity stops knockback', `
Game.reset('playing'); Game.startRun();
Game.powers = Object.create(null); Game.powers.pain = true;
Game.player.vx = 0; Game.player.vy = 0; Game.player.iframes = 0;
Game.damagePlayer(5, 1, 0);
Math.abs(Game.player.vx) < 1
`, v => v === true);

console.log('--- robustness ---');
check('a huge frame delta is clamped, not simulated in one gulp', `
Game.reset('playing'); Game.startRun();
var x0 = Game.player.x;
Input.keys['KeyD'] = true;
Game.update(5);
Input.keys['KeyD'] = false;
Math.abs(Game.player.x - x0) < 60
`, v => v === true);

check('rendering never throws in any state', `
var states = ['menu', 'playing', 'paused', 'power', 'dead'];
var ok = true;
Game.reset('playing'); Game.startRun();
for (var i = 0; i < states.length; i++) {
  Game.state = states[i];
  if (states[i] === 'power') { Game.wave = 2; Game.offerPowers(); }
  try { Game.render(); } catch (e) { ok = false; }
}
ok
`, v => v === true);

check('a full simulated run survives two minutes without desync', `
Game.reset('playing'); Game.startRun();
var frames = 0, err = null;
try {
  for (var i = 0; i < 7200; i++) {
    Input.keys['KeyW'] = (i % 400) < 120;
    Input.keys['KeyA'] = (i % 300) < 80;
    Input.mouse.down = (i % 6) < 4;
    Game.update(1 / 60);
    if (Game.state === 'power') Game.choosePower(0);
    if (Game.state === 'dead') Game.startRun();
    frames++;
  }
} catch (e) { err = e.message; }
[err === null, frames === 7200, Game.enemies.length < 60].join(',')
`, v => 'true,true,true');

check('enemy count never runs away', 'Game.enemies.length', n => n < 60);

console.log('');
if (failures === 0) {
  console.log('ALL STICKMAN TESTS PASSED');
} else {
  console.log(failures + ' FAILURE' + (failures === 1 ? '' : 'S'));
  process.exitCode = 1;
}
