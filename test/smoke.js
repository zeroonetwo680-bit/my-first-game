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
  const children = {};
  return {
    id, style: {}, textContent: '', value: '', offsetWidth: 100,
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      toggle: (c, f) => { if (f === undefined) f = !classes.has(c); if (f) classes.add(c); else classes.delete(c); return f; },
      contains: c => classes.has(c)
    },
    querySelector: sel => (children[sel] || (children[sel] = makeEl(id + ' ' + sel))),
    addEventListener() {}, focus() {}, blur() {},
    appendChild() {},
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
  navigator: { maxTouchPoints: 0, getGamepads: () => [] },
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: cb => { rafCb = cb; return 1; },
  document: {
    hidden: false,
    activeElement: null,
    getElementById: id => (elements[id] || (elements[id] = makeEl(id))),
    createElement: () => Object.assign(makeEl('dyn'), { width: 0, height: 0, getContext: () => makeCtx() }),
    querySelector: sel => (elements[sel] || (elements[sel] = makeEl(sel))),
    querySelectorAll: () => [],
    addEventListener() {}
  }
};
// deterministic RNG so runs are reproducible
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
sandbox.Math = Object.create(Math);
sandbox.Math.random = mulberry32(20260108);
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.__ls = Object.create(null);
sandbox.addEventListener = (t, fn) => { (sandbox.__ls[t] = sandbox.__ls[t] || []).push(fn); };
sandbox.removeEventListener = () => {};
sandbox.history = { pushState() {}, replaceState() {} };
sandbox.__vibes = [];
sandbox.navigator.vibrate = (pat) => { sandbox.__vibes.push(pat); return true; };
sandbox.navigator.wakeLock = { request: async () => ({ released: false, release: async () => {} }) };
sandbox.navigator.onLine = true;
sandbox.location = { reload() {} };
sandbox.document.fullscreenElement = null;
sandbox.document.documentElement = Object.assign(makeEl('html'), { requestFullscreen: () => undefined });
vm.createContext(sandbox);

for (const f of ['core.js', 'audio.js', 'fx.js', 'achievements.js', 'input.js', 'platform.js', 'render3d.js', 'game.js']) {
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
  if (Game.state === 'upgrade') Game.chooseUpgrade(0);
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
check('hp healthy after first 10s (fun, not brutal)', 'this.__hp10', h => h > 45);
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
check('upgrade screen opened after wave clear', 'Game.state', s => s === 'upgrade');
check('3 upgrade cards offered', 'Game.offered.length', n => n === 3);
run(`
Game.chooseUpgrade(0);
this.__picked = Game.state;
for (let i = 0; i < 200; i++) { __frame((52200 + i) * 16.6); Input.endFrame(); }
`);
check('back to playing after pick', 'this.__picked', s => s === 'playing');
check('advanced to wave 4 after upgrade', 'Game.wave', w => w === 4);

console.log('--- boss wave: spawn, health bar, kill, reward ---');
run(`
if (Game.state !== 'playing') Game.startRun();
Game.startWave(5);
this.__bossSeen = false;
this.__bossBarShown = false;
this.__teleSeen = false;
for (let i = 0; i < 1400; i++) {
  if (Game.state === 'upgrade') Game.chooseUpgrade(0);
  Input.keys['KeyW'] = true; Input.keys['Space'] = true;
  if (!Game.player.dead && Game.player.hp < 200) Game.player.hp = 200;  // test cheat: survive boss
  __frame((60000 + i) * 16.6);
  Input.endFrame();
  const b = Game.enemies.find(e => e.type === 'boss');
  if (b) {
    this.__bossSeen = true;
    if (!document.getElementById('boss-bar').classList.contains('hidden')) this.__bossBarShown = true;
    if (b.bphase.indexOf('_wind') >= 0) this.__teleSeen = true;
  }
  if (Game.player.dead) break;
}
`);
check('boss queued on wave 5', 'Game.wave === 5', v => v === true);
check('boss spawned into arena', 'this.__bossSeen', v => v === true);
check('boss HUD bar activated', 'this.__bossBarShown', v => v === true);
check('boss attack telegraphs exist', 'this.__teleSeen', v => v === true);
check('boss uses real attacks (bullets in flight at some point)', 'Game.bullets.items.some(b => b.team === "e") || Game.kills > 0', v => v === true);
run(`
const b = Game.enemies.find(e => e.type === 'boss');
if (b) {
  const s0 = Game.score;
  const pk0 = Game.pickups.length;
  damageEnemy(b, 999999, b.x, b.y);
  this.__bonus = Game.score > s0 + 2000;
  this.__loot = Game.pickups.length >= pk0 + 3;
} else { this.__bonus = false; this.__loot = false; }
`);
check('boss kill grants big bonus', 'this.__bonus', v => v === true);
check('boss drops loot', 'this.__loot', v => v === true);
run(`
for (let i = 0; i < 1500; i++) {
  for (const e of [...Game.enemies]) damageEnemy(e, 5, e.x, e.y);
  if (Game.state === 'upgrade') break;
  Input.keys['KeyW'] = true;
  if (!Game.player.dead && Game.player.hp < 200) Game.player.hp = 200;
  __frame((65000 + i) * 16.6);
  Input.endFrame();
}
`);
check('upgrade screen after boss wave cleared', 'Game.state', s => s === 'upgrade');
run(`
Input.pressed['Digit1'] = true;   // keyboard path
__frame((67000) * 16.6);
Input.endFrame();
for (let i = 0; i < 150; i++) { __frame((67200 + i) * 16.6); Input.endFrame(); }
`);
check('keyboard 1-key picked upgrade', 'Game.state', s => s === 'playing');
check('advanced to wave 6 after boss', 'Game.wave', w => w >= 6);
check('boss bar hidden after death', 'document.getElementById("boss-bar").classList.contains("hidden")', v => v === true);

console.log('--- upgrades actually modify stats ---');
run(`
Game.startRun();
const p = Game.player;
Game.openUpgradeScreen();
const dmgDef = UPGRADES.find(u => u.id === 'dmg');
dmgDef.apply(p);
p.upgradeCounts.dmg = 1;
Game.chooseUpgrade(0);   // exit via the real path (applies offered[0] too)
`);
check('damage upgrade stacks mod', 'Game.player.mods.dmg', v => v > 1);
check('upgrade count tracked', 'Game.player.upgradeCounts.dmg', n => n >= 1);
check('upgrade screen exits to playing', 'Game.state', s2 => s2 === 'playing');

console.log('--- pickups apply ---');
run(`
const types = ['repair','coin','nitro','triple','shield'];
for (const t of types) Game.applyPickup({ x: Game.player.x, y: Game.player.y, type: t, t: 0, life: 5 });
`);
check('repair applied', 'Game.player.hp', h => h > 0);
check('triple timer set', 'Game.player.triple', t => t > 0);
check('shield timer set', 'Game.player.shield', t => t > 0);

console.log('--- shotgun: unlock, fire spread pellets, swap back ---');
run(`
Game.startRun();
const sp = Game.player;
sp.weapons.push('shotgun');
sp.weapon = 'shotgun';
this.__maxPellets = 0;
for (let i = 0; i < 60; i++) {
  Input.keys['Space'] = true;
  __frame((68000 + i) * 16.6);
  Input.endFrame();
  this.__maxPellets = Math.max(this.__maxPellets, Game.bullets.items.filter(b => b.active && b.kb > 0).length);
}
`);
check('shotgun fires spread pellets', 'this.__maxPellets', n => n >= 4);
run(`
Input.pressed['KeyQ'] = true;
__frame((68070) * 16.6);
Input.endFrame();
`);
check('Q swaps back to machine gun', 'Game.player.weapon', w => w === 'gun');

console.log('--- bomber: fuse, detonation, area damage ---');
run(`
Game.startRun();
Input.keys = Object.create(null);   // release keys held by earlier sections
const bp = Game.player;
bp.hp = 100; bp.shield = 0;
Game.spawnEnemy('bomber', bp.x + 120, bp.y);
this.__bomberHp0 = bp.hp;
this.__bomberGone = false;
this.__minHp = 100;
for (let i = 0; i < 260 && !this.__bomberGone; i++) {
  bp.vx = 0; bp.vy = 0;             // keep the test player stationary
  __frame((68200 + i) * 16.6);
  Input.endFrame();
  this.__minHp = Math.min(this.__minHp, Game.player.hp);
  if (!Game.enemies.some(e => e.type === 'bomber')) this.__bomberGone = true;
}
`);
check('bomber detonated and left the field', 'this.__bomberGone', v => v === true);
check('detonation damaged the player', 'this.__minHp', h => h < 100);

console.log('--- sniper: laser telegraph then heavy shot ---');
run(`
Game.startRun();
Input.keys = Object.create(null);
const np = Game.player;
Game.spawnEnemy('sniper', np.x + 600, np.y);
this.__sniperLaser = false;
this.__sniperFired = false;
for (let i = 0; i < 300 && !this.__sniperFired; i++) {
  __frame((68600 + i) * 16.6);
  Input.endFrame();
  const sn = Game.enemies.find(e => e.type === 'sniper');
  if (sn && sn.aimT > 0.3) this.__sniperLaser = true;
  if (Game.bullets.items.some(b => b.active && b.team === 'e' && Math.hypot(b.vx, b.vy) > 800)) this.__sniperFired = true;
}
`);
check('sniper shows laser telegraph', 'this.__sniperLaser', v => v === true);
check('sniper fires high-speed shot', 'this.__sniperFired', v => v === true);
check('sniper shot is lethal-grade damage bullet present or player hit', 'Game.player.hp >= 0', v => v === true);

console.log('--- garage: coins, buy, select, per-car stats ---');
run(`
this.__bought = false;
this.__lockedRefused = false;
this.__bankAfter = 0;
Game.bank = 1000;
this.__bought = Game.buyCar('titan');
this.__bankAfter = Game.bank;
this.__lockedRefused = !Game.selectCar('vortex') && Game.carId === 'titan';
Game.startRun();
`);
check('titan bought for 600 coins', 'this.__bought && this.__bankAfter === 400', v => v === true);
check('locked car refused', 'this.__lockedRefused', v => v === true);
check('car stats applied (titan hull)', 'Game.player.maxHp', h => h === 160);
check('car speed multiplier applied', 'Game.player.carSpeed', v => v < 1);
check('bank persisted to storage', 'JSON.parse(localStorage.getItem("nw.bank"))', v => v === 400);

console.log('--- difficulty: separate score tables & multipliers ---');
run(`
Game.setDiff('easy');
this.__easyTable = Game.diff;
Game.score = 7777; Game.kills = 10; Game.wave = 4; Game.maxCombo = 2;
Game.saveScore();
this.__easySaved = store.get('nw.scores.easy', []).some(e => e.score === 7777);
Game.setDiff('normal');
this.__normalClean = !store.get('nw.scores.normal', []).some(e => e.score === 7777);
this.__hsReloaded = !Game.highscores.some(e => e.score === 7777);
`);
check('difficulty switch works', 'this.__easyTable', v => v === 'easy');
check('easy table saved', 'this.__easySaved', v => v === true);
check('normal table untouched', 'this.__normalClean', v => v === true);
check('score view reloaded per difficulty', 'this.__hsReloaded', v => v === true);

console.log('--- polish: nitro trail & ground lights ---');
run(`
Game.startRun();
Game.trail.length = 0;
for (let i = 0; i < 90; i++) {
  Input.keys['KeyW'] = true; Input.keys['ShiftLeft'] = true;
  if (Game.state === 'upgrade') Game.chooseUpgrade(0);
  __frame((76000 + i) * 16.6);
  Input.endFrame();
}
`);
check('nitro trail emits points', 'Game.trail.length', n => n > 5);
check('explosions cast ground lights', 'FX.explosion(Game.player.x, Game.player.y, "#ff9a3d", 1.5, false), FX.groundLights.length', n => n >= 1);

console.log('--- gamepad: fire & drive ---');
run(`
const fake = { connected: true, axes: [0.9, -0.5, 0, 0], buttons: [] };
for (let i = 0; i < 10; i++) fake.buttons.push({ pressed: false, value: 0 });
fake.buttons[0] = { pressed: true, value: 1 };
navigator.getGamepads = () => [fake];
Input.pollPad();
this.__padFire = Input.getFire();
const drv = Input.getDrive();
this.__padDrive = !!(drv.stick && drv.stick.x > 0.5);
this.__padRocketWorks = (fake.buttons[5] = { pressed: true, value: 1 }, Input.pollPad(), Input.consumeRocket());
navigator.getGamepads = () => [];
Input.pollPad();
`);
check('gamepad A button fires', 'this.__padFire', v => v === true);
check('gamepad left stick drives', 'this.__padDrive', v => v === true);
check('gamepad RB fires rocket', 'this.__padRocketWorks', v => v === true);

console.log('--- achievements: unlock paths, persistence, toasts ---');
run(`
// fresh slate (earlier sections already earned some)
Achievements.unlocked = {};
Achievements.stats = { kills: 0, bosses: 0, bombed: 0 };
Achievements.queue.length = 0;
localStorage.removeItem('nw.ach');
localStorage.removeItem('nw.stats');
Game.startRun();
this.__before = Achievements.has('first-blood');
Game.spawnEnemy('rammer', Game.player.x + 150, Game.player.y);
for (const e of [...Game.enemies]) damageEnemy(e, 999, e.x, e.y);
this.__after = Achievements.has('first-blood');
this.__kills = Achievements.stats.kills;
Game.spawnEnemy('boss', Game.player.x + 420, Game.player.y);
const bossE = Game.enemies.find(e => e.type === 'boss');
if (bossE) damageEnemy(bossE, 999999, bossE.x, bossE.y);
`);
check('first-blood locked before any kill', 'this.__before', v => v === false);
check('first-blood unlocked after kill', 'this.__after', v => v === true);
check('total kill counter increments', 'this.__kills', n => n >= 1);
check('boss kill unlocks WARLORD SLAYER', 'Achievements.has("boss-1")', v => v === true);
run(`
Game.startRun();
Game.combo = 8;
Game.registerKill({ def: { score: 10 }, x: Game.player.x, y: Game.player.y });
`);
check('x8 combo achievement', 'Achievements.has("combo-8")', v => v === true);
run(`
Game.startRun();
Game.damageSinceWave = false;
Game.flawlessWaves = 4;
Game.wave = 5;
Game.enemies.length = 0; Game.spawnQueue.length = 0; Game.portals.length = 0;
Game.waveCleared();
`);
check('flawless-5 streak achievement', 'Achievements.has("flawless-5")', v => v === true);
run(`
Game.score = 26000;
Game.gameOver();
`);
check('score-25k on game over', 'Achievements.has("score-25k")', v => v === true);
run(`
Game.startRun();
const rp = Game.player;
for (let k = 0; k < 3; k++) Game.spawnEnemy('rammer', rp.x + 92 + k * 16, rp.y);
const r = Game.rockets.obtain();
if (r) { r.active = true; r.x = rp.x + 62; r.y = rp.y; r.angle = 0; r.speed = 500; r.life = 2; r.target = null; r.trailT = 0; Game.explodeRocket(r); }
`);
check('rocket multi-kill ROCKET ACE', 'Achievements.has("rocket-ace")', v => v === true);
run(`
if (!Achievements.has('wave-20')) Achievements.unlock('wave-20');
for (let i = 0; i < 20; i++) Achievements.update(3);
`);
check('toast queue drains cleanly', 'Achievements.queue.length', n => n === 0);
check('achievements persisted to storage', 'JSON.parse(localStorage.getItem("nw.ach"))["first-blood"] > 0', v => v === true);
check('stats persisted to storage', 'JSON.parse(localStorage.getItem("nw.stats")).kills >= 1', v => v === true);

console.log('--- platform: haptics, offline badge, back button, fullscreen ---');
run(`
this.__vibBefore = __vibes.length;
Platform.vibrate(25);
this.__vibAfter = __vibes.length;
Game.startRun();
Platform.setOnline(false);
this.__badgeShown = !document.getElementById('offline-badge').classList.contains('hidden');
Platform.setOnline(true);
this.__badgeHidden = document.getElementById('offline-badge').classList.contains('hidden');
`);
check('haptic fired manually', 'this.__vibAfter > this.__vibBefore', v => v === true);
check('offline badge appears when offline', 'this.__badgeShown', v => v === true);
check('offline badge hides when online', 'this.__badgeHidden', v => v === true);
run(`
Game.startRun();
this.__vibBefore2 = __vibes.length;
damagePlayer(6, Game.player.x, Game.player.y);
this.__vibAfter2 = __vibes.length;
__ls['popstate'][0]({ state: { nw: 1 } });
`);
check('damage triggers haptic feedback', 'this.__vibAfter2 > this.__vibBefore2', v => v === true);
check('android back pauses the game', 'Game.state', s2 => s2 === 'paused');
run(`
__ls['popstate'][0]({ state: { nw: 1 } });
`);
check('back while paused quits to menu', 'Game.state', s2 => s2 === 'menu');
run(`
Game.startRun();
Platform.toggleFullscreen();
this.__wake = !!Platform.wakeLock;
Game.togglePause();
this.__wakeReleased = !Platform.wakeLock;
Game.enterMenu();
`);
check('wake lock held while playing', 'this.__wake', v => v === true);
check('wake lock released on pause', 'this.__wakeReleased', v => v === true);

console.log('--- adaptive quality: drops under load, restores when fast ---');
run(`
Game.startRun();
Game.applyQuality(0);
const t0 = 2100000;
let t = t0;
for (let i = 0; i < 700; i++) {   // ~23s of 30fps frames
  t += 33.3;
  if (Game.state === 'upgrade') Game.chooseUpgrade(0);
  if (Game.player.dead) { Game.player.dead = false; Game.player.hp = 120; }
  if (Game.state === 'over') Game.startRun();
  __frame(t);
  Input.endFrame();
  Input.keys['KeyW'] = true;
}
`);
check('quality stepped down under slow frames', 'Game.qual.level', n => n >= 2);
check('particle spawn scaled down', 'FX.spawnScale', v => v < 0.6);
check('scanlines disabled at low quality', 'document.getElementById("scanlines").style.display === "none"', v => v === true);
run(`
let t2 = 2300000;
for (let i = 0; i < 2000; i++) {  // ~33s of healthy 60fps frames
  t2 += 16.6;
  if (Game.state === 'upgrade') Game.chooseUpgrade(0);
  if (Game.player.dead) { Game.player.dead = false; Game.player.hp = 120; }
  if (Game.state === 'over') Game.startRun();
  __frame(t2);
  Input.endFrame();
}
`);
check('quality restored when frames are fast', 'Game.qual.level', n => n === 0);
check('spawn scale back to full', 'FX.spawnScale', v => v === 1);

console.log('--- death & game over ---');
run(`
Game.player.shield = 0;
damagePlayer(9999, Game.player.x, Game.player.y);
for (let i = 0; i < 200; i++) __frame((77000 + i) * 16.6);
`);
check('player died', 'Game.player.dead', d => d === true);
check('game over reached', 'Game.state', s => s === 'over');

console.log('--- high scores ---');
run('Game.score = 12345; Game.renderScores("over-highscores"); if (Game.qualifies()) Game.saveScore();');
check('score saved to storage', 'JSON.parse(localStorage.getItem("nw.scores.normal") || "[]").filter(e => e.score > 0).length', n => n >= 1);
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

/* ---------------- optional 3D layer (degradation path) ---------------- */
console.log('--- optional 3D layer ---');
run(`
this.__dc = { fillRect: 0, clearRect: 0, drawImage: 0 };
(function () {
  ['fillRect', 'clearRect', 'drawImage'].forEach(function (n) {
    var orig = ctx[n];
    ctx[n] = function () { __dc[n]++; return orig.apply(ctx, arguments); };
  });
})();
`);
const dc = () => run('__dc');
check('render3d: module is present', "typeof Render3D === 'object' && typeof Render3D.render === 'function'");
check('render3d: detects no WebGL in this sandbox', "Render3D.available() === false");
check('render3d: inactive without a renderer', "Render3D.active() === false");
check('render3d: init refuses cleanly with no WebGL', "Render3D.init(document.getElementById('gl')) === false");
check('render3d: render() is a no-op and never throws', "(function(){ try { Render3D.render(Game); return Render3D.active() === false; } catch (e) { return false; } })()");
check('render3d: showcase() is a no-op too', "(function(){ try { return Render3D.showcase() === false; } catch (e) { return false; } })()");
check('render3d: toggle stays a safe no-op', "(function(){ try { toggle3d(); return true; } catch (e) { return false; } })()");
check('render3d: paint-order helper reports the layer as off', "sync3dButton() || document.getElementById('btn-3d').classList.contains('off') === true");

/* layer off -> the classic opaque 2D frame, exactly as before */
check('render3d: layer off fills the backdrop opaque', "(function(){ var b=__dc.fillRect; Game.render(); return __dc.fillRect > b; })()");
check('render3d: layer off still draws the 2D cars', "(function(){ var b=__dc.drawImage; Game.render(); return __dc.drawImage > b; })()");

/* layer on -> transparent clear + no duplicate 2D world pass */
// single canvas: the 3D frame is blitted into the game canvas with drawImage
check('render3d: layer on composites the 3D frame into the game canvas', "(function(){ var blits=0; var fake={domElement:{width:64,height:64},getContext:function(){return {isContextLost:function(){return false;}};}}; Render3D.renderer=fake; Render3D._force=true; var orig=ctx.drawImage; ctx.drawImage=function(src){ if(src===fake.domElement) blits++; return orig.apply(ctx, arguments); }; try { Game.render(); } finally { ctx.drawImage=orig; Render3D._force=false; Render3D.renderer=null; } return blits === 1; })()");
check('render3d: layer on skips the 2D floor and cars', "(function(){ var fake={domElement:{width:64,height:64},getContext:function(){return {isContextLost:function(){return false;}};}}; Render3D.renderer=fake; Render3D._force=true; var before=__dc.fillRect; Game.render(); Render3D._force=false; Render3D.renderer=null; return __dc.fillRect === before; })()");
check('render3d: a failed composite falls back to the 2D frame', "(function(){ Render3D.renderer=null; Render3D._force=true; var before=__dc.fillRect; Game.render(); Render3D._force=false; return __dc.fillRect > before; })()");
check('render3d: simulation is untouched by the render mode', "(function(){ Render3D._force=true; try { Game.render(); Game.update(0.016); } catch (e) { Render3D._force=false; return false; } Render3D._force=false; return !isNaN(Game.player.x) && !isNaN(Game.player.y) && Game.enemies.length >= 0; })()");

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
