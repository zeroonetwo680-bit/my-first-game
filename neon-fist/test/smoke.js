/* NEON FIST — headless smoke test.
   Boots the real game with stubbed browser APIs and drives the logic:
   match flow, hits, blocks, combos, meter, NOVA, dash, KO/rounds,
   best-of-3, timeout/draw, AI, FX pools, persistence, stress, perf. */
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
      if (prop === 'canvas') return null;
      if (!(prop in t)) t[prop] = () => undefined;
      return t[prop];
    },
    set(t, prop, v) { t[prop] = v; return true; }
  });
}

const elements = {};
function makeEl(id) {
  const classes = new Set();
  const children = [];
  const el = {
    id, style: {}, dataset: {}, textContent: '', value: '', innerHTML: '', offsetWidth: 100,
    width: 0, height: 0, children,
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      toggle: (c, f) => { if (f === undefined) f = !classes.has(c); if (f) classes.add(c); else classes.delete(c); return f; },
      contains: c => classes.has(c)
    },
    get parentElement() { return el; },
    getContext: () => makeCtx(),
    querySelector: sel => {
      let c = children.find(x => x.__sel === sel);
      if (!c) { c = makeEl(id + ' ' + sel); c.__sel = sel; children.push(c); }
      return c;
    },
    addEventListener() {}, removeEventListener() {}, focus() {}, blur() {},
    appendChild(c) { children.push(c); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 540 })
  };
  return el;
}

let now = 0;
let rafCb = null;

// deterministic RNG
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const storage = {};
const sandbox = {
  console, Math, Infinity, NaN, isFinite, parseInt, parseFloat,
  performance: { now: () => now },
  setTimeout: (fn, ms) => { if (ms <= 350) fn(); return 0; },
  clearTimeout: () => {},
  localStorage: {
    getItem: k => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; }
  },
  navigator: { maxTouchPoints: 0, vibrate: () => true, onLine: true },
  requestAnimationFrame: cb => { rafCb = cb; return 1; },
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  document: {
    hidden: false, activeElement: null,
    getElementById: id => (elements[id] || (elements[id] = makeEl(id))),
    createElement: () => makeEl('dyn'),
    querySelector: sel => (elements[sel] || (elements[sel] = makeEl(sel))),
    querySelectorAll: () => [],
    addEventListener() {},
    documentElement: Object.assign(makeEl('html'), { requestFullscreen: () => undefined })
  },
  location: { reload() {} }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.Math = Object.create(Math);
sandbox.Math.random = mulberry32(20261020);

// round-win pips need real children
for (const p of ['pips-p1', 'pips-p2']) {
  const e = elements[p] = makeEl(p);
  e.children.push(makeEl(p + '.0'), makeEl(p + '.1'));
}
elements['game'] = makeEl('game');
vm.createContext(sandbox);

for (const f of ['core.js', 'audio.js', 'fx.js', 'fighters.js', 'ai.js', 'game.js']) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}
sandbox.__getRaf = () => rafCb;
sandbox.__wall = () => process.hrtime.bigint();
vm.runInContext('this.__frame = (t) => { now = t; const cb = __getRaf(); cb && cb(t); };', sandbox);

const run = (code) => vm.runInContext('(() => {' + code + '})()', sandbox);
const evalx = (code) => vm.runInContext('(' + code + ')', sandbox);
run('__frame(0);');

let failures = 0;
function check(name, code, expect) {
  try {
    const got = evalx(code);
    const ok = expect === undefined ? true : expect(got);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> got: ' + JSON.stringify(got)}`);
    if (!ok) failures++;
  } catch (e) {
    console.log(`ERROR ${name}  -> ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
    failures++;
  }
}

console.log('--- boot & defs ---');
check('boots to menu', 'Game.state', s => s === 'menu');
check('logical arena is 900x540', 'W + "x" + H', s => s === '900x540');
check('three fighters defined', 'Object.keys(FIGHTER_DEFS).length', n => n === 3);
check('VOLT speed sits between BLAZE and TITAN', 'FIGHTER_DEFS.volt.speed < FIGHTER_DEFS.blaze.speed && FIGHTER_DEFS.volt.speed > FIGHTER_DEFS.titan.speed', v => v === true);
check('blaze is faster than titan', 'FIGHTER_DEFS.blaze.speed > FIGHTER_DEFS.titan.speed', v => v === true);
check('titan has more hp than blaze', 'FIGHTER_DEFS.titan.hp > FIGHTER_DEFS.blaze.hp', v => v === true);
check('pool recycles objects', '(() => { const p = new Pool(() => ({ active: false }), 3); const a = p.obtain(); a.active = true; const b = p.obtain(); b.active = true; const c = p.obtain(); c.active = true; const d = p.obtain(); a.active = false; const e = p.obtain(); return d === null && e === a && p.items[1] === b; })()', v => v === true);
check('fmtNum adds separators', 'fmtNum(1234567)', s => s === '1,234,567');

console.log('--- match start (vs CPU) ---');
run(`Game.startMatch();`);
check('match starts in intro', 'Game.state', s => s === 'intro');
check('fighters spawn on opposite sides', 'Math.abs(Game.fighters[0].x - Game.fighters[1].x) > 300', v => v === true);
check('fighters face each other', 'Game.fighters[0].dir === 1 && Game.fighters[1].dir === -1', v => v === true);
check('clock starts at 60', 'Game.clock', n => n === 60);
check('round wins reset', 'Game.wins.join("")', s => s === '00');
check('CPU AI attached only to p2', '!!Game.ais[1] && !Game.ais[0]', v => v === true);
check('hud visible after start', 'document.getElementById("hud").classList.contains("hidden")', v => v === false);
check('p2 name tagged as CPU', 'document.getElementById("name-p2").textContent.indexOf("CPU")', n => n === 0);

console.log('--- intro locks input, then FIGHT ---');
run(`
let t = 1000;
for (let i = 0; i < 8; i++) { t += 16.6; __frame(t); }
Input.keys['KeyF'] = true;   // mash punch during intro
for (let i = 0; i < 8; i++) { t += 16.6; __frame(t); }
this.__introState = Game.fighters[0].state;
Input.keys['KeyF'] = false;
for (let i = 0; i < 90; i++) { t += 16.6; __frame(t); }
this.__fightState = Game.state;
`);
check('punch locked during intro', 'this.__introState', s => s === 'idle' || s === 'walk');
check('round transitions to fighting', 'this.__fightState', s => s === 'fighting');

console.log('--- auto-face & movement ---');
run(`
const f = Game.fighters[0], o = Game.fighters[1];
o.x = f.x - 200;   // opponent jumps to my left
let t = 2000;
for (let i = 0; i < 3; i++) { t += 16.6; __frame(t); }
this.__faced = f.dir;
Input.keys['KeyD'] = true;
const x0 = f.x;
for (let i = 0; i < 10; i++) { t += 16.6; __frame(t); }
Input.keys['KeyD'] = false;
this.__moved = f.x - x0;
`);
check('fighter auto-faces opponent', 'this.__faced', n => n === -1);
check('walk input moves fighter right', 'this.__moved > 20', v => v === true);
check('arena clamps to left wall', '(() => { Game.fighters[0].x = 5; __frame(2600); return Game.fighters[0].x; })()', n => n >= 70);

console.log('--- punch: whiff then hit ---');
run(`
const f = Game.fighters[0], o = Game.fighters[1];
f.state = 'idle'; o.state = 'idle'; o.attack = null;
f.x = 400; o.x = 700;   // far: out of range
let t = 3000;
for (let i = 0; i < 2; i++) { t += 16.6; __frame(t); }
Game.tryAttack(f, 'punch');
for (let i = 0; i < 14; i++) { t += 16.6; __frame(t); }
this.__whiffHp = o.hp;
`);
check('whiffed punch deals no damage', 'this.__whiffHp', n => n === 118);
run(`
const f = Game.fighters[0], o = Game.fighters[1];
f.state = 'idle'; o.state = 'idle'; o.attack = null;
f.x = 400; o.x = 480;   // in range
const t0 = 4000;
__frame(t0);
Game.tryAttack(f, 'punch');
for (let i = 0; i < 12; i++) { __frame(t0 + (i + 1) * 16.6); }
this.__hit = o.hp < o.maxHp;
this.__hitstun = o.state === 'hit';
this.__ameter = f.meter;
this.__vmeter = o.meter;
this.__dmg = o.maxHp - o.hp;
this.__dmgStat = Game.stats.damage;
`);
check('punch connects in range', 'this.__hit', v => v === true);
check('victim enters hitstun', 'this.__hitstun', v => v === true);
check('attacker gains meter on hit', 'this.__ameter', n => n > 0);
check('victim also gains meter', 'this.__vmeter', n => n > 0);
check('punch damage matches def (dmg*dmgMul)', 'Math.abs(this.__dmg - 6.65) < 0.01', v => v === true);
check('p1 damage stat tracked', 'this.__dmgStat', n => n > 6);

console.log('--- block: chip damage, no hitstun ---');
run(`
const f = Game.fighters[0], o = Game.fighters[1];
f.state = 'idle'; o.state = 'block';
f.meter = 0; o.meter = 0;
o.hp = 50;
const comboBefore = o.comboOn;
Game.resolveHit(f, o, f.def.punch, 'punch');
this.__chip = 50 - o.hp;
this.__stillBlock = o.state === 'block';
this.__noCombo = o.comboOn === comboBefore;
this.__blockMeter = o.meter > 0;
`);
check('blocked hit deals 18% chip (1.197)', 'Math.abs(this.__chip - 1.197) < 0.001', v => v === true);
check('blocker stays guarding (no hitstun)', 'this.__stillBlock', v => v === true);
check('block does not build victim combo', 'this.__noCombo', v => v === true);
check('blocking still earns meter', 'this.__blockMeter', v => v === true);

console.log('--- combo: second hit inside window scales ---');
run(`
const f = Game.fighters[0], o = Game.fighters[1];
Game.ais[1] = null;   // pin the dummy so nothing interrupts the combo
let t = 5000;
// reset cleanly
o.hp = o.maxHp; o.comboOn = 0; Game.stats.maxCombo = 0;
f.meter = 0; o.meter = 0;
f.state = 'idle'; o.state = 'idle';
f.x = 400; o.x = 480;
__frame(t);
const h1 = o.hp;
Game.tryAttack(f, 'punch');
for (let i = 0; i < 12; i++) { t += 16.6; __frame(t); }
const d1 = h1 - o.hp;
// let both recover but stay inside the 1.2s combo window
for (let i = 0; i < 18; i++) { t += 16.6; __frame(t); }
f.state = 'idle'; o.state = 'idle'; f.attack = null;
const h2 = o.hp;
Game.tryAttack(f, 'punch');
for (let i = 0; i < 12; i++) { t += 16.6; __frame(t); }
const d2 = h2 - o.hp;
this.__d1 = d1; this.__d2 = d2;
this.__combo = o.comboOn;
this.__maxCombo = Game.stats.maxCombo;
this.__pop = document.getElementById('combo-p1').textContent;
`);
check('second hit lands (combo counter = 2)', 'this.__combo', n => n === 2);
check('combo scales damage up', 'this.__d2 > this.__d1', v => v === true);
check('max combo recorded in match stats', 'this.__maxCombo', n => n >= 2);
check('combo popup shown to player', 'this.__pop.indexOf("2")', n => n >= 0);

console.log('--- dash ---');
run(`
const f = Game.fighters[0];
f.state = 'idle'; f.x = 300; f.dashCd = 0;
let t = 7000;
__frame(t);
Game.tryDash(f, 1);
this.__dashT = f.dashT;
this.__vx = f.vx;
const x0 = f.x;
for (let i = 0; i < 6; i++) { t += 16.6; __frame(t); }
this.__dashDist = f.x - x0;
`);
check('dash sets timer + velocity', 'this.__dashT > 0 && this.__vx > 0', v => v === true);
check('dash covers ground fast', 'this.__dashDist > 50', v => v === true);

console.log('--- NOVA special ---');
run(`
const f = Game.fighters[0], o = Game.fighters[1];
let t = 8000;
f.state = 'idle'; o.state = 'idle'; o.attack = null;
f.x = 300; o.x = 620; o.hp = o.maxHp;
f.meter = 100;
__frame(t);
Game.trySpecial(f);
this.__meterSpent = f.meter;
this.__specState = f.state;
this.__freeze = Game.hitStop;
this.__banner = document.getElementById('nf-banner').textContent;
const x0 = f.x;
for (let i = 0; i < 45; i++) { t += 16.6; __frame(t); }
this.__advanced = f.x - x0;
this.__specDmg = o.maxHp - o.hp;
this.__slow = Game.slowmo;
this.__specials = Game.stats.specials;
`);
check('NOVA consumes the full meter', 'this.__meterSpent', n => n === 0);
check('fighter enters special state', 'this.__specState', s => s === 'special' || s === 'idle');
check('NOVA freezes time on cast', 'this.__freeze', n => n > 0.2);
check('NOVA banner announces the move', 'this.__banner.indexOf("NOVA")', n => n >= 0);
check('NOVA dashes forward', 'this.__advanced > 100', v => v === true);
check('NOVA hits hard (>= 18)', 'this.__specDmg', n => n >= 18);
check('NOVA triggers slow motion', 'this.__slow', n => n > 0);
check('special counted in stats', 'this.__specials', n => n === 1);

console.log('--- meter cap at round start ---');
run(`
Game.fighters[0].meter = 100;
Game.fighters[1].meter = 77;
Game.startRound();
this.__cap0 = Game.fighters[0].meter;
this.__cap1 = Game.fighters[1].meter;
`);
check('meter carries over but caps at 40', 'this.__cap0 <= 40 && this.__cap1 <= 40', v => v === true);

console.log('--- KO, round wins, best-of-3 ---');
run(`
// fight through intro again
let t = 9000;
for (let i = 0; i < 95; i++) { t += 16.6; __frame(t); }
const f = Game.fighters[0], o = Game.fighters[1];
o.hp = 2; o.state = 'idle';
f.state = 'idle'; f.x = 400; o.x = 480;
__frame(t);
Game.resolveHit(f, o, f.def.punch, 'punch');
this.__zoomAtKO = Game.cam.zoom;
this.__koState = Game.state;
this.__loser = o.state;
this.__w1 = Game.wins[0];
this.__koBanner = document.getElementById('nf-banner').textContent;
for (let i = 0; i < 150; i++) { t += 16.6; __frame(t); }
this.__round2 = Game.round;
this.__state2 = Game.state;
this.__pip = document.getElementById('pips-p1').children[0].classList.contains('won');
`);
check('lethal hit ends the round', 'this.__koState', s => s === 'roundend');
check('loser is knocked out', 'this.__loser', s => s === 'ko');
check('round win awarded to p1', 'this.__w1', n => n === 1);
check('K.O. banner shown', 'this.__koBanner', s => s === 'K.O.!');
check('KO punch zooms the camera', 'this.__zoomAtKO > 1', v => v === true);
check('next round starts (best of 3)', 'this.__round2', n => n === 2);
check('round-win pip lights up', 'this.__pip', v => v === true);

run(`
// second KO for p1 ends the match
let t = 20000;
for (let i = 0; i < 95 && Game.state !== 'fighting'; i++) { t += 16.6; __frame(t); }
const f = Game.fighters[0], o = Game.fighters[1];
o.hp = 2; o.state = 'idle';
f.state = 'idle'; f.x = 400; o.x = 480;
Game.resolveHit(f, o, f.def.punch, 'punch');
for (let i = 0; i < 150; i++) { t += 16.6; __frame(t); }
this.__over = Game.state;
this.__title = document.getElementById('nf-over-title').textContent;
this.__rounds = document.getElementById('ov-rounds').textContent;
this.__winnerPose = f.state;
this.__rec = JSON.parse(localStorage.getItem('nff.record'));
this.__hudHidden = document.getElementById('hud').classList.contains('hidden');
`);
check('two round wins end the match', 'this.__over', s => s === 'over');
check('over screen announces winner', 'this.__title', s => s === 'BLAZE WINS!');
check('round score shown 2-0', 'this.__rounds', s => s === '2-0');
check('winner strikes a victory pose', 'this.__winnerPose', s => s === 'win');
check('cpu match record persisted (1 game, 1 win)', 'this.__rec.games === 1 && this.__rec.wins === 1', v => v === true);
check('hud hidden on over screen', 'this.__hudHidden', v => v === true);

console.log('--- losing a match records a loss ---');
run(`
Game.startMatch();
let t = 40000;
for (let i = 0; i < 95 && Game.state !== 'fighting'; i++) { t += 16.6; __frame(t); }
const f = Game.fighters[0], o = Game.fighters[1];
Game.wins[0] = 1; Game.wins[1] = 1;  // force 1-1 so this KO decides it
o.wins = 1; f.wins = 1;
f.hp = 2; f.state = 'idle';
o.state = 'idle'; o.x = 480; f.x = 420;
Game.resolveHit(o, f, o.def.kick, 'kick');
for (let i = 0; i < 150; i++) { t += 16.6; __frame(t); }
this.__over2 = Game.state;
this.__title2 = document.getElementById('nf-over-title').textContent;
this.__rec2 = JSON.parse(localStorage.getItem('nff.record'));
`);
check('cpu win on match point ends match', 'this.__over2', s => s === 'over');
check('over screen credits CPU TITAN', 'this.__title2', s => s === 'TITAN WINS!');
check('record now 2 games, 1 win', 'this.__rec2.games === 2 && this.__rec2.wins === 1', v => v === true);

console.log('--- hard mode: win streak + NEW BEST ---');
run(`
Game.mode = 'cpu'; Game.diff = 'hard';
Game.wins = [2, 0]; Game.fighters[0].hp = 10;
Game._bestBefore = 0;
Game.finishMatch();   // hard win #1
this.__streak1 = store.get('nff.streak', -1);
this.__best1 = store.get('nff.beststreak', -1);
this.__bestShown1 = !document.getElementById('nf-new-best').classList.contains('hidden');
Game.wins = [2, 0];
Game.finishMatch();   // hard win #2 -> beats the old best
this.__streak2 = store.get('nff.streak', -1);
this.__best2 = store.get('nff.beststreak', -1);
this.__bestShown2 = !document.getElementById('nf-new-best').classList.contains('hidden');
this.__recordLine = document.getElementById('nf-record-line').textContent;
Game.wins = [0, 2];
Game.finishMatch();   // hard loss resets the streak
this.__streak3 = store.get('nff.streak', -1);
`);
check('first hard win starts the streak', 'this.__streak1', n => n === 1);
check('best starts at 1', 'this.__best1', n => n === 1);
check('no NEW BEST on streak of 1', 'this.__bestShown1', v => v === false);
check('second hard win extends streak', 'this.__streak2', n => n === 2);
check('best climbs to 2', 'this.__best2', n => n === 2);
check('NEW BEST badge shows on a new record', 'this.__bestShown2', v => v === true);
check('record line reports streak and best', 'this.__recordLine.indexOf("STREAK: 2")', n => n >= 0);
check('hard loss resets streak to 0', 'this.__streak3', n => n === 0);

console.log('--- time up: hp decides, draw replays ---');
run(`
Game.startMatch();
let t = 60000;
for (let i = 0; i < 95 && Game.state !== 'fighting'; i++) { t += 16.6; __frame(t); }
const f = Game.fighters[0], o = Game.fighters[1];
f.hp = 50; o.hp = 50;   // equal -> draw
Game.clock = 0.05;
for (let i = 0; i < 6; i++) { t += 16.6; __frame(t); }
this.__drawBanner = document.getElementById('nf-banner').textContent;
this.__drawState = Game.state;
this.__winsAfterDraw = Game.wins.join('');
for (let i = 0; i < 160; i++) { t += 16.6; __frame(t); }
this.__replayRound = Game.round;
`);
check('equal hp at time-up is a draw', 'this.__drawBanner', s => s === 'DRAW');
check('draw awards no round win', 'this.__winsAfterDraw', s => s === '00');
check('draw round is replayed (same round number... next round slot)', '[2,3].includes(this.__replayRound)', v => v === true);

run(`
// unequal hp: the healthier fighter takes the round
let t = 80000;
for (let i = 0; i < 95 && Game.state !== 'fighting'; i++) { t += 16.6; __frame(t); }
const f = Game.fighters[0], o = Game.fighters[1];
f.hp = 90; o.hp = 30;
Game.clock = 0.05;
for (let i = 0; i < 6; i++) { t += 16.6; __frame(t); }
this.__toBanner = document.getElementById('nf-banner').textContent;
this.__toWins = Game.wins.join('');
`);
check('time-up awards round to higher hp', 'this.__toWins', s => s === '10');
check('time-up banner shown', 'this.__toBanner', s => s === 'TIME UP!');

console.log('--- pause freezes the fight ---');
run(`
Game.startMatch();
let t = 100000;
for (let i = 0; i < 95 && Game.state !== 'fighting'; i++) { t += 16.6; __frame(t); }
Game.togglePause();
this.__paused = Game.state;
this.__pauseScreen = document.getElementById('nf-pausescreen').classList.contains('visible');
const c0 = Game.clock;
for (let i = 0; i < 30; i++) { t += 16.6; __frame(t); }
this.__clockFrozen = Game.clock === c0;
Game.togglePause();
this.__resumed = Game.state;
`);
check('pause enters paused state', 'this.__paused', s => s === 'paused');
check('pause overlay visible', 'this.__pauseScreen', v => v === true);
check('clock frozen while paused', 'this.__clockFrozen', v => v === true);
check('resume returns to the fight', 'this.__resumed', s => s === 'fighting');

console.log('--- AI ---');
run(`
this.__order = DIFFS.hard.tick < DIFFS.normal.tick && DIFFS.normal.tick < DIFFS.easy.tick;
this.__blocks = DIFFS.hard.blockProb > DIFFS.normal.blockProb && DIFFS.normal.blockProb > DIFFS.easy.blockProb;
`);
check('hard reacts faster than normal than easy', 'this.__order', v => v === true);
check('hard blocks more than normal than easy', 'this.__blocks', v => v === true);

run(`
const me = Game.makeFighter('blaze', 1), opp = Game.makeFighter('titan', 0);
me.x = 150; opp.x = 800; me.state = 'idle'; opp.state = 'idle';
const ai = AI.new(me, opp, 'easy');
this.__farInp = AI.update(ai, 0.016, 1);
`);
check('AI far away closes the distance', 'this.__farInp.right || this.__farInp.dash', v => v === true);

run(`
let attacked = false, blocked = false, specced = false;
for (let k = 0; k < 40 && !(attacked && blocked && specced); k++) {
  const me = Game.makeFighter('blaze', 1), opp = Game.makeFighter('titan', 0);
  me.state = 'idle'; opp.state = 'idle';
  const ai = AI.new(me, opp, 'hard');
  // close range: should swing
  me.x = 700; opp.x = 740;
  let inp = AI.update(ai, 0.016, 1);
  if (inp.punch || inp.kick) attacked = true;
  // react to incoming punch: should block sometimes (hard 0.55)
  opp.state = 'punch'; opp.st = 0;
  me.x = 700; opp.x = 760;
  ai.timer = 0;
  inp = AI.update(ai, 0.016, 1);
  if (inp.block) blocked = true;
  // full meter at range: should unleash NOVA
  opp.state = 'idle';
  me.meter = 100; me.x = 200; opp.x = 520;
  ai.timer = 0;
  inp = AI.update(ai, 0.016, 1);
  if (inp.special) specced = true;
}
this.__atk = attacked; this.__blk = blocked; this.__spc = specced;
`);
check('AI swings in close range', 'this.__atk', v => v === true);
check('AI blocks reacting to telegraphed attacks', 'this.__blk', v => v === true);
check('AI fires NOVA when meter is full', 'this.__spc', v => v === true);

run(`
// AI vs AI for 6 seconds: somebody gets hit or at least everyone moves
Game.startMatch();
Game.ais[0] = AI.new(Game.fighters[0], Game.fighters[1], 'normal');
let t = 120000;
for (let i = 0; i < 95 && Game.state !== 'fighting'; i++) { t += 16.6; __frame(t); }
const x0 = Game.fighters[0].x, x1 = Game.fighters[1].x;
for (let i = 0; i < 360; i++) { t += 16.6; if (Game.state === 'over') Game.startMatch(); __frame(t); }
this.__moved = Game.fighters[0].x !== x0 || Game.fighters[1].x !== x1;
this.__inBounds = Game.fighters[0].x >= 70 && Game.fighters[0].x <= 830 && Game.fighters[1].x >= 70 && Game.fighters[1].x <= 830;
`);
check('AI vs AI: both fighters act', 'this.__moved', v => v === true);
check('fighters stay inside the arena', 'this.__inBounds', v => v === true);

console.log('--- FX systems ---');
run(`
FX.clear();
FX.sparks(100, 200, '#fff', 10, 300);
this.__particles = FX.particles.items.filter(p => p.active).length;
FX.text(100, 200, '12');
this.__texts = FX.texts.items.filter(p => p.active).length;
FX.addShake(12);
FX.update(0.4);
this.__shakeDecay = FX.shake < 12;
FX.clear();
this.__cleared = FX.particles.items.every(p => !p.active);
`);
check('sparks spawn pooled particles', 'this.__particles', n => n >= 10);
check('floating damage text pools', 'this.__texts', n => n === 1);
check('shake decays over time', 'this.__shakeDecay', v => v === true);
check('FX.clear resets all pools', 'this.__cleared', v => v === true);

console.log('--- pose rig ---');
run(`
const f = Game.makeFighter('blaze', 0);
f.x = 450;
const j = computePose(f, 0.5);
this.__rig = [j.hip.x, j.head.y, j.handF.x, j.footF.y].every(v => isFinite(v));
const k = Game.makeFighter('titan', 1); k.x = 500;
for (const st of ['walk', 'punch', 'kick', 'block', 'hit', 'special', 'ko', 'win']) { f.state = st; computePose(f, 1.2); }
this.__poses = true;
`);
check('pose rig returns finite joints', 'this.__rig', v => v === true);
check('all fighter states pose without crashing', 'this.__poses', v => v === true);

console.log('--- persistence of prefs ---');
run(`
Game.p1Id = 'titan';
store.set('nff.p1', Game.p1Id);
this.__p1 = store.get('nff.p1', 'blaze');
store.set('nff.diff', 'hard');
Game.syncDiff();
this.__diff = store.get('nff.diff', 'normal');
`);
check('fighter pick persists', 'this.__p1', s => s === 'titan');
check('difficulty persists', 'this.__diff', s => s === 'hard');

console.log('--- VOLT: parry mechanic ---');
run(`
const f = Game.makeFighter('blaze', 0), o = Game.makeFighter('volt', 1);
f.state = 'idle'; o.state = 'block'; o.st = 0;
o.hp = o.maxHp; o.meter = 0;
Game.resolveHit(f, o, f.def.punch, 'punch');
this.__parryHp = o.hp;
this.__parryStun = f.state === 'hit' && f.stunT === 0.55;
this.__parryMeter = o.meter;
this.__parryText = (() => { let found = null; for (const t of FX.texts.items) if (t.active && t.text === 'PARRY!') found = t.text; return found; })();
// a stale (long-held) block gets normal chip damage
const f2 = Game.makeFighter('blaze', 0), o2 = Game.makeFighter('volt', 1);
o2.state = 'block'; o2.st = 1; o2.hp = 50;
Game.resolveHit(f2, o2, f2.def.punch, 'punch');
this.__chipHp = o2.hp;
this.__hasParry = !!FIGHTER_DEFS.volt.parry && !FIGHTER_DEFS.blaze.parry && !FIGHTER_DEFS.titan.parry;
`);
check('only VOLT has the parry trait', 'this.__hasParry', v => v === true);
check('parry negates all damage', 'this.__parryHp', n => n === 105);
check('parry stuns the attacker (0.55s)', 'this.__parryStun', v => v === true);
check('parry rewards meter (+18)', 'this.__parryMeter', n => n >= 18);
check('PARRY! callout spawned', 'this.__parryText', s => s === 'PARRY!');
check('stale block still chips normally', 'Math.abs(this.__chipHp - (50 - 6.65 * 0.18)) < 0.001', v => v === true);

console.log('--- roster cycling ---');
run(`
Game.p1Id = 'volt';
Game.startMatch();
this.__oppOfVolt = Game.fighters[1].def.id;
Game.p1Id = 'blaze';
Game.startMatch();
this.__pair = Game.fighters[0].def.id + '+' + Game.fighters[1].def.id;
`);
check('VOLT faces BLAZE next in the roster cycle', 'this.__oppOfVolt', s => s === 'blaze');
check('restored default pairing BLAZE+TITAN', 'this.__pair', s => s === 'blaze+titan');

console.log('--- punch -> kick combo cancel ---');
run(`
let t = 200000;
for (let i = 0; i < 95 && Game.state !== 'fighting'; i++) { t += 16.6; __frame(t); }
const f = Game.fighters[0], o = Game.fighters[1];
Game.ais[1] = null;
f.state = 'idle'; o.state = 'idle'; o.attack = null; o.vx = 0;
f.x = 400; o.x = 480;
__frame(t);
Game.tryAttack(f, 'punch');
for (let i = 0; i < 7; i++) { t += 16.6; __frame(t); }
this.__connected = f.hitDone && o.hp < o.maxHp;
Game.updateFighter(f, { left: false, right: false, block: false, punch: false, kick: true, special: false, dash: false }, o, 0.016);
this.__cancelState = f.state;
this.__cancelAtk = f.attack === f.def.kick;
`);
check('punch connected before the cancel', 'this.__connected', v => v === true);
check('kick during a connected punch cancels into kick', 'this.__cancelState', s => s === 'kick');
check('canceled kick uses the kick definition', 'this.__cancelAtk', v => v === true);

console.log('--- dash afterimages + double-tap dash ---');
run(`
const f = Game.fighters[0], o = Game.fighters[1];
f.state = 'idle'; f.dashCd = 0; f.x = 300; f.vx = 0;
FX.clear();
Game.tryDash(f, 1);
Game.updateFighter(f, { left: false, right: false, block: false, punch: false, kick: false, special: false, dash: false }, o, 0.016);
this.__ghosts = FX.ghosts.filter(g => g.active).length;
Input.touch.dashUntil = 0;
Input._tapTimes = Object.create(null);
Input.tapDir('t-left');
Input.tapDir('t-left');
this.__dashArm = Input.touch.dashUntil > performance.now();
this.__dashIn = Input.playerInput(0).dash;
`);
check('dash leaves neon afterimages', 'this.__ghosts', n => n >= 1);
check('double-tap a direction arms the dash', 'this.__dashArm', v => v === true);
check('armed double-tap reaches player input', 'this.__dashIn', v => v === true);

console.log('--- 60s stress: cpu match churn ---');
run(`
Game.startMatch();
let t = 300000;
this.__crashes = 0;
try {
  for (let i = 0; i < 3600; i++) {
    t += 16.6;
    if (Game.state === 'over') Game.startMatch();
    __frame(t);
  }
} catch (e) { this.__crashes = 1; console.log('CRASH:', e.message); }
`);
check('60s of CPU matches without crashes', 'this.__crashes', n => n === 0);
check('still functional after stress', '["menu","intro","fighting","roundend","over","paused"].includes(Game.state)', v => v === true);

console.log('--- perf ---');
run(`
Game.startMatch();
let t = 700000;
for (let i = 0; i < 120; i++) { t += 16.6; if (Game.state === 'over') Game.startMatch(); __frame(t); }
const t0 = __wall();
for (let i = 0; i < 3000; i++) { t += 16.6; if (Game.state === 'over') Game.startMatch(); __frame(t); }
const t1 = __wall();
__ms = Number(t1 - t0) / 1e6 / 3000;
if (!isFinite(__ms)) __ms = -1;
`);
check('logic+render under 1.5ms/frame', '__ms', n => n >= 0 && n < 1.5);
console.log('   [ms/frame =', Number(evalx('__ms')).toFixed(4), ']');

console.log(failures === 0 ? '\nALL NEON FIST TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
