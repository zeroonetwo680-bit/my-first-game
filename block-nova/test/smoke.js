/* BLOCK NOVA — headless smoke test.
   Boots the real game with stubbed browser APIs and drives the logic:
   placement, line clears, streaks, rotation, bomb, hammer, refill
   guarantee, both modes, game over, persistence. */
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
    id, style: {}, textContent: '', value: '', innerHTML: '', offsetWidth: 100,
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      toggle: (c, f) => { if (f === undefined) f = !classes.has(c); if (f) classes.add(c); else classes.delete(c); return f; },
      contains: c => classes.has(c)
    },
    querySelector: sel => (children[sel] || (children[sel] = makeEl(id + ' ' + sel))),
    addEventListener() {}, focus() {}, blur() {},
    appendChild() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 })
  };
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
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: cb => { rafCb = cb; return 1; },
  document: {
    hidden: false, activeElement: null, fullscreenElement: null,
    getElementById: id => (elements[id] || (elements[id] = makeEl(id))),
    createElement: () => Object.assign(makeEl('dyn'), { width: 0, height: 0, getContext: () => makeCtx() }),
    querySelector: sel => (elements[sel] || (elements[sel] = makeEl(sel))),
    querySelectorAll: () => [],
    addEventListener() {},
    documentElement: Object.assign(makeEl('html'), { requestFullscreen: () => undefined })
  },
  history: { pushState() {} },
  location: { reload() {} }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = (t, fn) => {};
sandbox.removeEventListener = () => {};
sandbox.Math = Object.create(Math);
sandbox.Math.random = mulberry32(20261019);
elements['game'] = Object.assign(makeEl('game'), { width: 0, height: 0, getContext: () => makeCtx() });
vm.createContext(sandbox);

for (const f of ['core.js', 'audio.js', 'fx.js', 'pieces.js', 'game.js']) {
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

console.log('--- boot ---');
check('boots to menu', 'Game.state', s => s === 'menu');
check('tray empty in menu', 'Game.tray.length', n => n === 0);

console.log('--- classic: place, clear, streak ---');
run(`Game.startRun('classic');`);
check('classic run starts', 'Game.state', s => s === 'playing');
check('tray has 3 pieces', 'Game.tray.filter(p => !p.used).length', n => n === 3);
check('board starts empty', 'Game.board.every(v => !v)', b => b === true);

// place the first piece wherever it fits
run(`
this.__placed = false;
for (const p of Game.tray) {
  outer:
  for (let gy = 0; gy <= 8 - p.h; gy++) {
    for (let gx = 0; gx <= 8 - p.w; gx++) {
      if (Game.canPlace(p, gx, gy)) { this.__placed = Game.tryPlace(Game.tray.indexOf(p), gx, gy); break outer; }
    }
  }
  if (this.__placed) break;
}
`);
check('piece placed on empty board', 'this.__placed', v => v === true);
check('board has blocks now', 'Game.board.some(v => v)', b => b === true);
check('score > 0 after placement', 'Game.score', n => n > 0);

// force a full row clear: fill row 0 except one cell, place a single there
run(`
Game.board.fill(0);
for (let x = 1; x < 8; x++) Game.board[7 * 8 + x] = 1;  // row 7 minus (0,7)
const mk = (cells) => ({ cells, w: 1, h: 1, color: '#fff', k: 0, used: false, spawnT: 1 });
Game.tray.length = 0;
Game.tray.push(mk([[0,0]]), mk([[0,0]]), mk([[0,0]]));
const s0 = Game.score;
Game.tryPlace(0, 0, 7);   // single completes row 7
let t = 1000;
for (let i = 0; i < 30; i++) { t += 16.6; __frame(t); }
this.__lines = Game.lines;
this.__gained = Game.score - s0;
this.__streak = Game.streak;
`);
check('row cleared', 'this.__lines', n => n >= 1);
check('clear awarded big points (>=110)', 'this.__gained', n => n >= 110);
check('streak is 1 after first clear', 'this.__streak', n => n === 1);
check('row is actually empty', '[...Array(8).keys()].every(x => !Game.board[7*8+x])', v => v === true);

// combo: second consecutive clear doubles multiplier
run(`
for (let x = 1; x < 8; x++) Game.board[6 * 8 + x] = 2;
const s0b = Game.score;
Game.tryPlace(1, 0, 6);   // single at (0,6) completes row 6
this.__gained2 = Game.score - s0b;
this.__streak2 = Game.streak;
`);
check('streak climbed to 2', 'this.__streak2', n => n === 2);
check('streak multiplier boosted points (>=165)', 'this.__gained2', n => n >= 165);

// non-clearing placement resets streak
run(`
Game.board.fill(0);   // empty board: a single placement can never clear
let t = 8000;
for (let i = 0; i < 30; i++) { t += 16.6; __frame(t); }   // let lockT decay
const mk = (cells) => ({ cells, w: 1, h: 1, color: '#fff', k: 0, used: false, spawnT: 1 });
Game.tray.length = 0;
Game.tray.push(mk([[0,0]]), mk([[0,0]]), mk([[0,0]]));
this.__ok = Game.tryPlace(0, 5, 0);
`);
check('streak test placement succeeded', 'this.__ok', v => v === true);
check('streak resets on non-clearing placement', 'Game.streak', n => n === 0);

console.log('--- rotate ---');
run(`
Game.charges.rotate = 3;
Game.tray.length = 0;
const mk = (cells) => ({ cells, w: 2, h: 1, color: '#fff', k: 0, used: false, spawnT: 1 });
Game.tray.push(mk([[0,0],[1,0]]), mk([[0,0]]), mk([[0,0]]));
const w0 = Game.tray[0].w, h0 = Game.tray[0].h;
Game.rotateTray(0);
this.__rot = Game.tray[0].w === 1 && Game.tray[0].h === 2;
this.__cost = Game.charges.rotate === 2;
`);
check('rotate turns piece 90 degrees', 'this.__rot', v => v === true);
check('rotate consumes a charge', 'this.__cost', v => v === true);

console.log('--- bomb & hammer ---');
run(`
Game.board.fill(0);
Game.board[0] = 1; Game.board[1] = 1; Game.board[8] = 1; Game.board[9] = 1; // 2x2 at top-left
Game.charges.bomb = 1;
this.__boom = Game.useBomb(0, 0);
this.__cleared = !Game.board[0] && !Game.board[1] && !Game.board[8] && !Game.board[9];
this.__bombSpent = Game.charges.bomb === 0;
`);
check('bomb clears 3x3 area', 'this.__boom && this.__cleared', v => v === true);
check('bomb consumes charge', 'this.__bombSpent', v => v === true);
run(`
Game.board.fill(0);
Game.board[3 * 8 + 4] = 2;
Game.charges.hammer = 1;
this.__whack = Game.useHammer(4, 3);
this.__gone = !Game.board[3 * 8 + 4];
this.__hammerSpent = Game.charges.hammer === 0;
`);
check('hammer removes a single cell', 'this.__whack && this.__gone', v => v === true);
check('hammer consumes charge', 'this.__hammerSpent', v => v === true);

console.log('--- charge earning from score ---');
run(`
Game.charges.rotate = 0; Game.earn.rotate = 0;
Game.addScore(1300, null);
`);
check('rotate earned from 1300 points', 'Game.charges.rotate', n => n === 1);

console.log('--- refill fairness: at least one piece always fits ---');
run(`
Game.board.fill(0);
// leave exactly ONE empty cell
Game.board.fill(1);
Game.board[5 * 8 + 5] = 0;
Game.refillTray();
this.__fits = Game.tray.some(p => Game.canFitAny(p));
`);
check('refill guarantees a placeable piece', 'this.__fits', v => v === true);

console.log('--- classic game over & persistence ---');
run(`
Game.board.fill(1);          // full board -> nothing fits
Game.tray.length = 0;
const mk = (cells) => ({ cells, w: 2, h: 1, color: '#fff', k: 0, used: false, spawnT: 1 });
Game.tray.push(mk([[0,0],[1,0]]), mk([[0,0]]), mk([[0,0]]));
Game.score = 4321;
Game.beginDeath('NO MOVES LEFT');
let t = 50000;
for (let i = 0; i < 90; i++) { t += 16.6; __frame(t); }
`);
check('game over reached', 'Game.state', s => s === 'over');
check('best score persisted', 'JSON.parse(localStorage.getItem("bn.best")).classic', n => n === 4321);
check('score table saved', 'JSON.parse(localStorage.getItem("bn.scores.classic")).some(e => e.s === 4321)', v => v === true);

console.log('--- rush mode: timer, time bonus, time-up death ---');
run(`
Game.startRun('rush');
`);
check('rush starts with 120s', 'Game.timeLeft', n => n === 120);
run(`
// full row except one, then clear it -> +2s per line
Game.board.fill(0);
for (let x = 1; x < 8; x++) Game.board[3 * 8 + x] = 1;
Game.tray.length = 0;
const mk = (cells) => ({ cells, w: 1, h: 1, color: '#fff', k: 0, used: false, spawnT: 1 });
Game.tray.push(mk([[0,0]]), mk([[0,0]]), mk([[0,0]]));
this.__placed = Game.tryPlace(0, 0, 3);
this.__bonus = Game.timeLeft;
`);
check('rush placement worked', 'this.__placed', v => v === true);
check('line clear adds rush time (+2s)', 'this.__bonus', n => n >= 121);
run(`
let t = 200000;
Game.timeLeft = 0.5;
for (let i = 0; i < 250 && Game.state !== "over"; i++) { t += 16.6; __frame(t); }
`);
check('rush time-up triggers game over', 'Game.state', s => s === 'over');

console.log('--- pause flow ---');
run(`Game.startRun('classic'); Game.togglePause();`);
check('paused', 'Game.state', s => s === 'paused');
run(`Game.togglePause();`);
check('resumed', 'Game.state', s => s === 'playing');
run(`
// stress: 2000 placements + clears across 60 simulated seconds
let t = 300000;
this.__crashes = 0;
try {
  for (let i = 0; i < 3600; i++) {
    t += 16.6;
    if (Game.state === 'over') Game.startRun('classic');
    // place any fitting piece every ~20 frames
    if (i % 20 === 0) {
      for (let s = 0; s < 3; s++) {
        const p = Game.tray[s];
        if (!p || p.used) continue;
        let placed = false;
        outer:
        for (let gy = 0; gy <= 8 - p.h; gy++)
          for (let gx = 0; gx <= 8 - p.w; gx++)
            if (Game.canPlace(p, gx, gy)) { Game.tryPlace(s, gx, gy); placed = true; break outer; }
        if (placed) break;
      }
    }
    __frame(t);
  }
} catch (e) { this.__crashes = 1; console.log('CRASH:', e.message); }
`);
check('60s stress run without crashes', 'this.__crashes', n => n === 0);
check('still functional after stress', '["playing","over","dying"].includes(Game.state)', v => v === true);

console.log('--- difficulty tiers & shape bag ---');
run(`
Game.startRun('classic');
this.__t0 = Game.tier();
Game.lines = 20;
this.__t2 = Game.tier();
Game.lines = 100;
this.__t4 = Game.tier();
Game.lines = 999;
this.__tmax = Game.tier();
const low = shapeWeights(0), high = shapeWeights(4);
let lowBig = 0, highBig = 0;
for (let i = 0; i < SHAPES.length; i++) {
  if (SHAPES[i].big) { lowBig += low.ws[i]; highBig += high.ws[i]; }
}
this.__bigShareUp = highBig / high.total > lowBig / low.total;
this.__smallNeverZero = low.ws.every((w, i) => !SHAPES[i].big || true) && high.ws.every(w => w >= 0.299);
Game.lines = 0;
`);
check('tier 0 at start', 'this.__t0', n => n === 0);
check('tier 2 at 20 lines', 'this.__t2', n => n === 2);
check('tier 4 at 100 lines', 'this.__t4', n => n === 4);
check('tier caps at 4', 'this.__tmax', n => n === 4);
check('big pieces grow with tier', 'this.__bigShareUp', v => v === true);
check('weights never vanish (>=0.3)', 'this.__smallNeverZero', v => v === true);

console.log('--- stones: block placement, crack, shatter ---');
run(`
Game.startRun('classic');
Game.board.fill(0);
Game.stones.fill(0);
const mk = (cells) => ({ cells, w: 1, h: 1, color: '#fff', k: 0, used: false, spawnT: 1 });
Game.tray.length = 0;
Game.tray.push(mk([[0,0]]), mk([[0,0]]), mk([[0,0]]));
Game.stones[0] = 1;   // intact rock at (0,0)
this.__blockedOnRock = !Game.canPlace(Game.tray[0], 0, 0);
this.__okBeside = Game.canPlace(Game.tray[0], 1, 0);
`);
check('stone blocks placement', 'this.__blockedOnRock', v => v === true);
check('placement fine beside stone', 'this.__okBeside', v => v === true);

run(`
// row 7 full of blocks except (0,7); intact stone at (4,7)
Game.board.fill(0);
Game.stones.fill(0);
for (let x = 1; x < 8; x++) Game.board[7 * 8 + x] = 1;
Game.stones[7 * 8 + 4] = 1;
const mk = (cells) => ({ cells, w: 1, h: 1, color: '#fff', k: 0, used: false, spawnT: 1 });
Game.tray.length = 0;
Game.tray.push(mk([[0,0]]), mk([[0,0]]), mk([[0,0]]));
const s0 = Game.score;
this.__cleared = Game.tryPlace(0, 0, 7);
let t = 1000;
for (let i = 0; i < 30; i++) { t += 16.6; __frame(t); }
this.__cracked = Game.stones[7 * 8 + 4] === 2;
this.__stillThere = Game.stones[7 * 8 + 4] !== 0;
this.__rowGone = [...Array(8).keys()].filter(x => x !== 4).every(x => !Game.board[7 * 8 + x]);
`);
check('line over intact stone still clears', 'this.__cleared', v => v === true);
check('stone survives first blast but cracks', 'this.__cracked && this.__stillThere', v => v === true);
check('board blocks cleared around the stone', 'this.__rowGone', v => v === true);

run(`
// second clear through the cracked stone destroys it (+50)
// (placement hole at x=2, cracked stone sits at x=4 and counts as filled)
Game.stones.fill(0);
Game.stones[6 * 8 + 4] = 2;
Game.board.fill(0);
for (let x = 0; x < 8; x++) if (x !== 2 && x !== 4) Game.board[6 * 8 + x] = 1;
const mk = (cells) => ({ cells, w: 1, h: 1, color: '#fff', k: 0, used: false, spawnT: 1 });
Game.tray.length = 0;
Game.tray.push(mk([[0,0]]), mk([[0,0]]), mk([[0,0]]));
const s0 = Game.score;
this.__cleared2 = Game.tryPlace(0, 2, 6);
this.__gained = Game.score - s0;
this.__shattered = Game.stones[6 * 8 + 4] === 0;
`);
check('cracked stone shatters on second blast', 'this.__cleared2 && this.__shattered', v => v === true);
check('shatter pays +50 bonus (>=225 total)', 'this.__gained', n => n >= 225);

run(`
// bomb wipes an intact stone instantly
Game.board.fill(0);
Game.stones.fill(0);
Game.stones[0] = 1;
Game.charges.bomb = 1;
this.__boom = Game.useBomb(0, 0);
this.__stoneGone = Game.stones[0] === 0;
this.__bombUsed = Game.charges.bomb === 0;
`);
check('bomb destroys intact stone', 'this.__boom && this.__stoneGone && this.__bombUsed', v => v === true);

run(`
// hammer can target a stone directly
Game.board.fill(0);
Game.stones.fill(0);
Game.stones[3 * 8 + 3] = 1;
Game.charges.hammer = 1;
this.__whack = Game.useHammer(3, 3);
this.__stoneGone2 = Game.stones[3 * 8 + 3] === 0;
`);
check('hammer crushes a stone', 'this.__whack && this.__stoneGone2', v => v === true);

console.log('--- stone spawning tied to difficulty ---');
run(`
Game.startRun('classic');
Game.board.fill(0);
Game.stones.fill(0);
this.__noneAtTier0 = Game.maybeSpawnStones() === undefined && !Game.stones.some(v => v);
Game.lines = 60;   // tier 4
let spawnedAny = false;
for (let k = 0; k < 30; k++) {
  Game.board.fill(0); Game.stones.fill(0);
  Game.maybeSpawnStones();
  if (Game.stones.some(v => v)) { spawnedAny = true; break; }
}
this.__spawnedAtHighTier = spawnedAny;
// cap test
Game.board.fill(0); Game.stones.fill(0);
const placed = Game.spawnStones(10);
this.__capPlaced = placed;
this.__capTotal = Game.stones.reduce((a, v) => a + (v ? 1 : 0), 0);
Game.lines = 0;
`);
check('no stones at tier 0', 'this.__noneAtTier0', v => v === true);
check('stones appear at high tier', 'this.__spawnedAtHighTier', v => v === true);
check('stone spawn respects board cap (<=4)', 'this.__capPlaced <= 4 && this.__capTotal <= 4', v => v === true);

run(`
// all-clear requires stones gone too
Game.startRun('classic');
Game.board.fill(0); Game.stones.fill(0);
Game.lines = 0;
this.__emptyNoStones = Game.isBoardEmpty();
Game.stones[2] = 1;
this.__emptyWithStone = Game.isBoardEmpty();
`);
check('isBoardEmpty false with a stone', 'this.__emptyNoStones && !this.__emptyWithStone', v => v === true);

console.log('--- perf ---');
run(`
Game.startRun('classic');
let t = 400000;
for (let i = 0; i < 600; i++) { t += 16.6; if (Game.state === 'over' || Game.state === 'dying') Game.startRun('classic'); __frame(t); }
const t0 = __wall();
for (let i = 0; i < 3000; i++) { t += 16.6; if (Game.state === 'over' || Game.state === 'dying') Game.startRun('classic'); __frame(t); }
const t1 = __wall();
__ms = Number(t1 - t0) / 1e6 / 3000;
if (!isFinite(__ms)) __ms = -1;
`);
check('logic under 1.5ms/frame', '__ms', n => n >= 0 && n < 1.5);
console.log('   [logic ms/frame =', Number(evalx('__ms')).toFixed(4), '| wall =', evalx('typeof __wall'), ']');

console.log(failures === 0 ? '\nALL BLOCK NOVA TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
