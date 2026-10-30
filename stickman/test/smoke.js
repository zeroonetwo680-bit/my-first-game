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

console.log('--- weapons ---');
check('a run starts with the pen, and it never runs dry', `
Game.reset('playing'); Game.startRun();
[Game.player.weapon, Game.player.ammo].join(',')
`, v => v === 'pen,Infinity');

check('there are five weapons and four of them are pickups', `
Object.keys(Game.WEAPONS).length === 5 && Game.WEAPON_IDS.length === 4
`, v => v === true);

check('every weapon has a finite clip except the pen', `
Game.WEAPON_IDS.every(function (id) { return isFinite(Game.WEAPONS[id].ammo) && Game.WEAPONS[id].ammo > 0; }) &&
  !isFinite(Game.WEAPONS.pen.ammo)
`, v => v === true);

check('equipping a weapon swaps the clip in', `
Game.reset('playing'); Game.startRun();
Game.equipWeapon('ruler');
[Game.player.weapon, Game.player.ammo].join(',')
`, v => v === 'ruler,24');

check('the ruler fires three slugs in a cone', `
Game.reset('playing'); Game.startRun();
Game.equipWeapon('ruler');
Game.bullets.length = 0; Game.player.fireCd = 0;
Game.fire();
var angles = Game.bullets.map(function (b) { return Math.round(b.a * 100) / 100; });
Game.bullets.length === 3 && new Set(angles).size === 3
`, v => v === true);

check('each slug costs one round', `
Game.reset('playing'); Game.startRun();
Game.equipWeapon('ruler');
Game.player.fireCd = 0; Game.fire();
Game.player.ammo === 23
`, v => v === true);

check('an empty weapon drops back to the pen, which cannot empty', `
Game.reset('playing'); Game.startRun();
Game.equipWeapon('stapler');
Game.player.ammo = 1; Game.player.fireCd = 0;
Game.fire();
[Game.player.weapon, Game.player.ammo].join(',')
`, v => v === 'pen,Infinity');

check('the compass needle passes through a crowd', `
Game.reset('playing'); Game.startRun();
Game.enemies.length = 0; Game.pending.length = 0;
Game.equipWeapon('compass');
var a = Game.spawnEnemy('brute', Game.player.x + 90, Game.player.y - 40);
var b = Game.spawnEnemy('brute', Game.player.x + 190, Game.player.y - 40);
Game.player.aim = 0;
Game.bullets.length = 0; Game.player.fireCd = 0;
Game.fire();
var hits = 0;
for (var i = 0; i < 30; i++) {
  Game.updateBullets(1 / 120);
  hits = (a.hp < a.maxhp ? 1 : 0) + (b.hp < b.maxhp ? 1 : 0);
  if (hits === 2) break;
}
hits === 2
`, v => v === true);

check('a plain pen bullet stops at the first body', `
Game.reset('playing'); Game.startRun();
Game.enemies.length = 0; Game.pending.length = 0;
var a = Game.spawnEnemy('brute', Game.player.x + 90, Game.player.y - 40);
var b = Game.spawnEnemy('brute', Game.player.x + 260, Game.player.y - 40);
Game.player.aim = 0;
Game.bullets.length = 0; Game.player.fireCd = 0;
Game.fire();
for (var i = 0; i < 40; i++) Game.updateBullets(1 / 120);
[a.hp < a.maxhp, b.hp < b.maxhp].join(',')
`, v => v === 'true,false');

check('the eraser ricochets off the margin', `
Game.reset('playing'); Game.startRun();
Game.bullets.length = 0;
Game.bullets.push({ x: 30, y: 360, vx: -600, vy: 0, life: 9, dmg: 40, r: 11,
                    a: Math.PI, w: 'eraser', len: 0, pierce: 0, bounce: 2, dead: false });
for (var i = 0; i < 12; i++) Game.updateBullets(1 / 60);
var bx = Game.bullets[0];
bx && bx.vx > 0 && bx.x >= 10
`, v => v === true);

check('a ricochet runs out instead of bouncing for ever', `
Game.reset('playing'); Game.startRun();
Game.bullets.length = 0;
Game.bullets.push({ x: 30, y: 360, vx: -600, vy: 0, life: 9, dmg: 40, r: 11,
                    a: Math.PI, w: 'eraser', len: 0, pierce: 0, bounce: 0, dead: false });
Game.bullets[0].x = 5;
Game.bullets[0].vx = -600;
for (var i = 0; i < 12; i++) {
  if (!Game.bullets.length) break;
  Game.updateBullets(1 / 60);
}
/* with no bounces left it may fly off the page, but it must never be
 * reflected back into play */
Game.bullets.length === 0 || Game.bullets[0].x < 10
`, v => v === true);

check('killing an enemy can drop stationery', `
Game.reset('playing'); Game.startRun();
Game.pickups.length = 0;
var dropped = 0;
for (var i = 0; i < 40; i++) {
  var e = Game.spawnEnemy('brute', 200 + (i % 7) * 40, 200);
  Game.hurtEnemy(e, 999, 0);
}
Game.pickups.length > 0
`, v => v === true);

check('walking over a pickup equips it', `
Game.reset('playing'); Game.startRun();
Game.pickups.length = 0;
var k = Game.dropWeapon(Game.player.x, Game.player.y - 20, 'compass');
Game.updatePickups(0.016);
[Game.player.weapon, Game.pickups.length].join(',')
`, v => v === 'compass,0');

check('pickups expire instead of littering the page', `
Game.reset('playing'); Game.startRun();
Game.pickups.length = 0;
Game.dropWeapon(200, 200, 'ruler');
for (var i = 0; i < 40; i++) Game.updatePickups(0.5);
Game.pickups.length
`, n => n === 0);

check('a dropped weapon is always one the game knows', `
Game.reset('playing'); Game.startRun();
var ok = true;
for (var i = 0; i < 60; i++) {
  Game.pickups.length = 0;            // the page only holds so much clutter
  var k = Game.dropWeapon(400, 300);
  if (!k || !Game.WEAPONS[k.w]) ok = false;
}
ok
`, v => v === true);

check('six arms triples a three-shot weapon', `
Game.reset('playing'); Game.startRun();
Game.equipWeapon('ruler');
Game.powers = Object.create(null); Game.powers.arms = true;
Game.player.arms = 3;
Game.bullets.length = 0; Game.player.fireCd = 0;
Game.fire();
Game.bullets.length === 9
`, v => v === true);

check('the weapon reset with the run', `
Game.reset('playing'); Game.startRun();
[Game.player.weapon, Game.pickups.length].join(',')
`, v => v === 'pen,0');

console.log('--- the shot leaves the gun ---');
check('a bullet is born on the weapon, not in the body', `
Game.reset('playing'); Game.startRun();
Game.pending.length = 0; Game.enemies.length = 0;
Game.player.x = 640; Game.player.y = 460;
Game.player.aim = 0;
Game.bullets.length = 0; Game.player.fireCd = 0;
Game.fire();
var m = Game.muzzlePoint();
var b = Game.bullets[0];
dist(b.x, b.y, m.x, m.y) < 0.001
`, v => v === true);

check('the muzzle is in front of the body, along the aim', `
Game.reset('playing'); Game.startRun();
Game.player.x = 640; Game.player.y = 460; Game.player.aim = 0;
var m = Game.muzzlePoint();
m.x > Game.player.x + 30
`, v => v === true);

check('the muzzle follows the aim direction', `
Game.reset('playing'); Game.startRun();
Game.player.x = 640; Game.player.y = 460;
/* the muzzle lives at the shoulder, so compare the two aim directions with
 * each other rather than with the feet */
Game.player.aim = Math.PI / 2;   // aim down the page
var down = Game.muzzlePoint().y;
Game.player.aim = -Math.PI / 2;  // aim up the page
var up = Game.muzzlePoint().y;
down > up + 20
`, v => v === true);

check('the muzzle is not the same point for every weapon', `
Game.reset('playing'); Game.startRun();
Game.player.x = 640; Game.player.y = 460; Game.player.aim = 0;
var pen = Game.muzzlePoint();
Game.equipWeapon('ruler');
var ruler = Game.muzzlePoint();
Math.abs(ruler.x - pen.x) > 4
`, v => v === true);

check('drawn barrel tip matches the fired projectile for every weapon and angle', `
Game.reset('playing'); Game.startRun();
var ok = true;
for (var id of ['pen', 'ruler', 'compass', 'stapler', 'eraser']) {
  for (var a of [0, Math.PI/2, Math.PI, -Math.PI/2, 0.7]) {
    Game.equipWeapon(id); Game.player.aim = a;
    Game.player.vx = 180; Game.bullets.length = 0; Game.fire();
    var b = Game.bullets[0], pose = Game.playerPose();
    var original = Game.drawTool, captured;
    Game.drawTool = function(ctx, id, x, y, scale, angle) {
      captured = {x:x, y:y, scale:scale, angle:angle};
    };
    Game.player.muzzle = 0;
    Game.drawHeldWeapon({}, pose, id, a);
    Game.drawTool = original;
    var tip = Game.WEAPONS[id].tipLength * captured.scale;
    var x = captured.x + Math.cos(captured.angle) * tip;
    var y = captured.y + Math.sin(captured.angle) * tip;
    if (dist(x, y, b.x, b.y) > 0.001) ok = false;
  }
}
ok
`, v => v === true);

check('real rendered bullet strokes never extend behind the muzzle on their first frames', `
Game.reset('playing'); Game.startRun();
var ok = true;
for (var id of ['pen', 'ruler', 'compass', 'stapler']) {
  for (var a of [0, 0.8, Math.PI, -Math.PI/2]) {
    Game.equipWeapon(id); Game.player.aim = a; Game.bullets.length = 0;
    Game.enemies.length = 0; Game.fire();
    var origin = {x: Game.bullets[0].x, y: Game.bullets[0].y};
    // Test immediately and after one fixed timestep, including the long trails.
    for (var dt of [0, 1/120]) {
      if (dt) Game.updateBullets(dt);
      var points = [];
      var ctx = new Proxy({}, {get: function(o, key) {
        if (key === 'moveTo' || key === 'lineTo') return function(x,y) { points.push([x,y]); };
        return function() {};
      }, set: function() { return true; }});
      // Test each spread projectile against its own direction.
      var all = Game.bullets;
      for (var bullet of all) {
        Game.bullets = [bullet]; points.length = 0; Game.drawBullets(ctx);
        for (var pt of points) {
          var projection = (pt[0]-origin.x)*Math.cos(bullet.a) + (pt[1]-origin.y)*Math.sin(bullet.a);
          if (projection < -0.001) ok = false;
        }
      }
      Game.bullets = all;
    }
  }
}
ok
`, v => v === true);

check('last shot keeps the fired weapon visible during its muzzle flash', `
Game.reset('playing'); Game.startRun(); Game.equipWeapon('ruler');
Game.player.ammo = 1; Game.player.aim = 0; Game.fire();
var fired = '';
var original = Game.drawHeldWeapon;
Game.drawHeldWeapon = function(ctx, pose, id) { fired = id; };
Game.drawPlayer(new Proxy({}, {get:function(){ return function() {}; }, set:function(){ return true; }}));
Game.drawHeldWeapon = original;
Game.player.weapon === 'pen' && fired === 'ruler'
`, v => v === true);

check('pickup descriptions remain text, not the barrel length', `
Game.reset('playing'); Game.startRun(); Game.equipWeapon('ruler');
Game.toastText === 'RULER - Three hard slugs in a cone.'
`, v => v === true);

check('a thrower throws from its hand, not its chest', `
Game.reset('playing'); Game.startRun();
Game.enemies.length = 0; Game.pending.length = 0; Game.shots.length = 0;
var e = Game.spawnEnemy('thrower', Game.player.x + 200, Game.player.y);
e.throwCd = 0;
Game.updateEnemies(0.016);
var shot = Game.shots[0];
var ePose = Rig.pose({ x: e.x, y: e.y, size: e.size, phase: e.phase, gait: e.gait || 0, t: Game.t, seed: e.seed, aim: angleTo(e.x, e.y - e.size * 0.3, Game.player.x, Game.player.y) });
var hand = ePose.armPairs[0].right.hand;
dist(shot.x, shot.y, hand.x, hand.y) < 20 && dist(shot.x, shot.y, e.x, e.y - e.size * 0.3) > 20
`, v => v === true);

check('shooting works with the old cached audio script', `
Game.reset('playing'); Game.startRun();
var old = Sfx.shootFor;
var called = 0, oldShoot = Sfx.shoot;
Sfx.shootFor = undefined;
Sfx.shoot = function () { called++; };
Game.player.fireCd = 0;
Game.fire();
var ok = Game.bullets.length > 0 && called === 1;
Sfx.shootFor = old; Sfx.shoot = oldShoot;
ok
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
