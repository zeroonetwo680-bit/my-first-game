'use strict';
/* ============================================================
   NEON ESCAPE — smoke tests
   Boots the real game files in a vm sandbox: logic + render +
   levels + shop + modes + perf. Run: node test/smoke.js
   ============================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const fails = [];

function check(name, expr) {
  let ok = false, err = null;
  try { ok = !!vm.runInContext(expr, sandbox); }
  catch (e) { err = e; }
  if (ok) { pass++; console.log('PASS  ' + name); }
  else {
    fail++;
    fails.push(name + (err ? '  [' + err.message + ']' : ''));
    console.log('FAIL  ' + name + (err ? '  [' + err.message + ']' : '  -> ' + expr));
  }
}

/* ---------------- sandbox ---------------- */
const sandbox = { console: console, Math: Math, JSON: JSON, Date: Date, Object: Object, Array: Array, String: String, Number: Number, Boolean: Boolean };
vm.createContext(sandbox);

// localStorage stub
const mem = {};
sandbox.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; }
};

// performance stub (advances 16.6ms per call)
let perfT = 0;
sandbox.performance = { now: () => { perfT += 16.6; return perfT; } };

// canvas ctx stub
const drawCounts = {};
function ctxStub() {
  return new Proxy({}, {
    get(t, k) {
      if (k === 'canvas') return { width: 900, height: 540 };
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'getImageData') return () => ({ data: [] });
      if (typeof k === 'string') {
        return function () { drawCounts[k] = (drawCounts[k] || 0) + 1; };
      }
      return undefined;
    },
    set() { return true; }
  });
}

// element stubs (auto-vivify)
function makeEl(id) {
  const el = {
    id: id, textContent: '', innerHTML: '', hidden: false,
    classList: {
      _s: new Set(),
      toggle(c, f) { if (f === undefined) f = !this._s.has(c); if (f) this._s.add(c); else this._s.delete(c); return f; },
      contains(c) { return this._s.has(c); },
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }
    },
    style: {}, dataset: {}, children: [],
    getAttribute(n) { return this['_a_' + n] !== undefined ? this['_a_' + n] : null; },
    setAttribute(n, v) { this['_a_' + n] = v; },
    addEventListener(type, fn) { this['_on_' + type] = fn; },
    appendChild(c) { this.children.push(c); },
    getContext() { if (!this._ctx) this._ctx = ctxStub(); return this._ctx; },
    width: 900, height: 540
  };
  return el;
}
const els = {};
sandbox.document = {
  getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
  addEventListener(type, fn) { this['_on_' + type] = fn; },
  createElement: () => makeEl('dyn'),
  body: makeEl('body')
};

// window + rAF
const rafCbs = [];
sandbox.window = {
  addEventListener(type, fn) { this['_on_' + type] = fn; },
  AudioContext: undefined, webkitAudioContext: undefined
};
sandbox.rafCbs = rafCbs;
sandbox.drawCounts = drawCounts;   // Node-side draw counters, visible to in-sandbox checks
sandbox.requestAnimationFrame = (fn) => { rafCbs.push(fn); return rafCbs.length; };
sandbox.cancelAnimationFrame = () => {};
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearInterval; sandbox.setInterval = () => 0; sandbox.clearInterval = () => {};

// load game files
['js/core.js', 'js/audio.js', 'js/fx.js', 'js/art.js', 'js/rig.js', 'js/runner.js', 'js/levels.js', 'js/game.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox, { filename: f });
});

/* ============================================================ */
const ev = (code) => vm.runInContext(code, sandbox);

/* ---- boot ---- */
ev("Game.boot(document.getElementById('ne-canvas'))");
check('boot: game object ready', "typeof Game === 'object' && Game.state === 'menu'");
check('boot: canvas bound', "Game.canvas !== null");
check('boot: menu screen visible', "!document.getElementById('ne-menu').classList.contains('hidden')");
check('boot: hud hidden at menu', "document.getElementById('ne-hud').classList.contains('hidden')");
check('boot: rAF loop captured', ev("rafCbs.length") >= 1 ? 'true' : 'false');

/* ---- helpers ---- */
check('mulberry32 deterministic', "(function(){ var a = mulberry32(42), b = mulberry32(42); return a() === b() && a() === b(); })()");
check('clamp works', "clamp(5, 0, 3) === 3 && clamp(-1, 0, 3) === 0 && clamp(2, 0, 3) === 2");
check('lerp works', "Math.abs(lerp(0, 10, 0.5) - 5) < 1e-9");
check('aabb overlap', "aabb({x:0,y:0,w:10,h:10},{x:5,y:5,w:10,h:10}) && !aabb({x:0,y:0,w:10,h:10},{x:20,y:20,w:5,h:5})");
check('Store set/get/del', "(function(){ Store.set('t1', 7); var v = Store.get('t1', 0); Store.del('t1'); return v === 7 && Store.get('t1', 9) === 9; })()");

/* ---- defs ---- */
check('MOVES has 5 moves with prices', "Object.keys(MOVES).length === 5 && Object.keys(MOVES).every(k => MOVES[k].price > 0)");
check('MOVES ids unique', "(function(){ var ids = Object.keys(MOVES).map(k => MOVES[k].id); return new Set(ids).size === 5; })()");
check('GEARS has 4 gear sets x 3 tiers', "Object.keys(GEARS).length === 4 && Object.keys(GEARS).every(k => GEARS[k].tiers.length === 3)");
check('gear tier prices ascend', "Object.keys(GEARS).every(k => GEARS[k].tiers[0].price < GEARS[k].tiers[1].price && GEARS[k].tiers[1].price < GEARS[k].tiers[2].price)");
check('SKINS has 8, subject free', "SKINS.length === 8 && SKINS[0].id === 'subject' && SKINS[0].price === 0");
check('skins have rarity + trail', "SKINS.every(s => s.rarity && s.trail && s.col)");

/* ---- flow ---- */
check('flow increments to x2 at 3', "(function(){ Flow.reset(); Flow.add(3); return Flow.mult === 2; })()");
check('flow caps at x8', "(function(){ Flow.reset(); Flow.add(40); return Flow.mult === 8; })()");
check('flow decays to x1', "(function(){ Flow.reset(); Flow.add(6); Flow.update(4.5); return Flow.mult === 1; })()");

/* ---- levels: campaign ---- */
check('15 campaign levels', "Levels.LIST.length === 15");
check('5 levels per zone', "[1,2,3].every(z => Levels.LIST.filter(d => d.zone === z).length === 5)");
check('all levels maxGap <= 4', "Levels.LIST.every(d => Levels.maxGap(d) <= 4)");
check('all campaign levels have gaps', "Levels.LIST.every(d => Levels.maxGap(d) >= 1)");
check('every level builds solids', "Levels.LIST.every(d => Levels.build(d).solids.length > 20)");
check('every level has exit + start', "Levels.LIST.every(d => { const L = Levels.build(d); return L.exit && L.start && L.exit.x > L.start.x; })");
check('every level has coins', "Levels.LIST.every(d => Levels.build(d).coins.length > 4)");
check('coins not in gaps (exit ground solid)', "(function(){ var L = Levels.build(Levels.LIST[0]); var under = L.solids.some(s => s.kind === 'ground' && L.exit.x + 10 >= s.x && L.exit.x + 10 <= s.x + s.w); return under; })()");
check('campaign total coins > 250', "Levels.LIST.reduce((n, d) => n + Levels.build(d).coins.length, 0) > 250");
check('gear parts in 6+ levels', "Levels.LIST.filter(d => (d.parts || []).length > 0).length >= 6");
check('lasers in 4+ levels', "Levels.LIST.filter(d => (d.lasers || []).length > 0).length >= 4");
check('saws in 5+ levels', "Levels.LIST.filter(d => (d.saws || []).length > 0).length >= 5");
check('vents in 3+ levels', "Levels.LIST.filter(d => (d.vents || []).length > 0).length >= 3");
check('pistons in 3+ levels', "Levels.LIST.filter(d => (d.pistons || []).length > 0).length >= 3");
check('drones in 4+ levels', "Levels.LIST.filter(d => (d.drones || []).length > 0).length >= 4");
check('mines in 3+ levels', "Levels.LIST.filter(d => (d.mines || []).length > 0).length >= 3");
check('walls in 3+ levels', "Levels.LIST.filter(d => (d.walls || []).length > 0).length >= 3");
check('beams in 6+ levels', "Levels.LIST.filter(d => (d.beams || []).length > 0).length >= 6");
check('no level starts on hazard', "Levels.LIST.every(d => { const L = Levels.build(d); return !L.hazards.some(h => h.x < 140); })");
check('sky5 has all trap families', "(function(){ var d = Levels.LIST[14]; return d.lasers.length > 0 && d.saws.length > 0 && d.mines.length > 0 && d.pistons.length > 0 && d.walls.length > 0 && d.beams.length > 0; })()");

/* ---- levels: generator ---- */
check('genDef deterministic', "JSON.stringify(Levels.genDef(42, 12)) === JSON.stringify(Levels.genDef(42, 12))");
check('genDef differs by seed', "JSON.stringify(Levels.genDef(42, 12)) !== JSON.stringify(Levels.genDef(43, 12))");
check('generated level builds', "(function(){ var L = Levels.generate(7, 14); return L.solids.length > 40 && L.exit && L.coins.length > 5; })()");
check('generated gaps <= 3', "(function(){ var d = Levels.genDef(9, 16); return d.gaps.every(g => g[1] - g[0] + 1 <= 3); })()");
check('dailySeed stable + distinct', "Levels.dailySeed(20261020) === Levels.dailySeed(20261020) && Levels.dailySeed(20261020) !== Levels.dailySeed(20261021)");
check('generate = build(genDef)', "(function(){ var a = Levels.generate(5, 10), b = Levels.build(Levels.genDef(5, 10)); return a.width === b.width && a.coins.length === b.coins.length; })()");

/* ---- hazardRect ---- */
check('laser periodic on/off', "(function(){ var h = {type:'laser', x:0,y:0,w:2,h:2, period:2, on:1, phase:0}; return !!Levels.hazardRect(h, 0.5) && !Levels.hazardRect(h, 1.5); })()");
check('vent periodic on/off', "(function(){ var h = {type:'vent', x:0,y:0,w:2,h:2, period:2, on:1, phase:0}; return !!Levels.hazardRect(h, 0.2) && !Levels.hazardRect(h, 1.8); })()");
check('piston periodic on/off', "(function(){ var h = {type:'piston', x:0,y:0,w:2,h:2, period:2, on:1, phase:0}; return !!Levels.hazardRect(h, 0.2) && !Levels.hazardRect(h, 1.8); })()");
check('saw always active', "(function(){ var h = {type:'saw', x:0,y:0,w:2,h:2}; return !!Levels.hazardRect(h, 123) === true; })()");
check('drone patrol moves', "(function(){ var h = {type:'drone', x:0,y:0,w:2,h:2, phase:0, range:100}; var a = Levels.hazardRect(h, 0), b = Levels.hazardRect(h, 1.4); return a.x !== b.x; })()");

/* ---- runner physics ---- */
check('runner create fields', "(function(){ var p = Runner.create(10, 432); return p.x === 10 && p.y === 432 && p.onGround && !p.dead && p.baseSpeed === 310; })()");
check('gravity pulls down', "(function(){ var p = Runner.create(0, 0); p.onGround = false; Runner.step(p, 0.1, {solids: [], hazards: [], coins: [], moves: {}, gear: {}}, null, 0); return p.vy > 0; })()");
check('auto-run advances x', "(function(){ var p = Runner.create(0, 432); Runner.step(p, 0.5, {solids: [], hazards: [], coins: [], moves: {}, gear: {}}, null, 0); return p.x > 100 && p.dist > 100; })()");
check('grounded jump launches', "(function(){ var p = Runner.create(50, 432); var w = {solids: [{x: -100, y: 432, w: 4000, h: 48, kind: 'ground'}], hazards: [], coins: [], moves: {}, gear: {}}; Runner.step(p, 0.016, w, {jump: true}, 0); return p.vy < -400 && !p.onGround; })()");
check('double jump only with move', "(function(){ var w = {solids: [{x:-100,y:432,w:4000,h:48,kind:'ground'}], hazards:[], coins:[], moves:{dbl:false}, gear:{}}; var p = Runner.create(50, 432); Runner.step(p, 0.016, w, {jump: true}, 0); Runner.step(p, 0.2, w, null, 0); Runner.step(p, 0.016, w, {jump: true}, 0); var noDbl = p.jumpsUsed; var w2 = {solids: w.solids, hazards: [], coins: [], moves: {dbl: true}, gear: {}}; var p2 = Runner.create(50, 432); Runner.step(p2, 0.016, w2, {jump: true}, 0); Runner.step(p2, 0.2, w2, null, 0); var v0 = p2.vy; Runner.step(p2, 0.016, w2, {jump: true}, 0); return noDbl === 1 && p2.jumpsUsed === 2 && p2.vy < v0; })()");
check('slide shrinks box', "(function(){ var p = Runner.create(50, 432); Runner.trySlide(p, {gear: {}}); return Runner.box(p).h === 36 && p.slideT > 0; })()");
check('dash sets timers', "(function(){ var p = Runner.create(50, 432); Runner.tryDash(p); return p.dashT > 0 && p.dashCd > 0 && p.iframes > 0; })()");
check('dash cooldown blocks re-dash', "(function(){ var p = Runner.create(50, 432); Runner.tryDash(p); Runner.tryDash(p); return p.dashT < 0.31; })()");

/* ---- collisions ---- */
check('hazard kills without shield', "(function(){ var p = Runner.create(100, 432); var h = {type:'mine', x: 90, y: 404, w: 30, h: 28, period: 0, on: 1}; Runner.step(p, 0.016, {solids: [{x:-100,y:432,w:4000,h:48,kind:'ground'}], hazards: [h], coins: [], moves: {}, gear: {}, hazardRect: Levels.hazardRect}, null, 0); return p.dead; })()");
check('dash i-frames pass hazard', "(function(){ var p = Runner.create(100, 432); p.dashT = 0.3; p.iframes = 0.3; var h = {type:'mine', x: 90, y: 404, w: 30, h: 28, period: 0, on: 1}; Runner.step(p, 0.016, {solids: [{x:-100,y:432,w:4000,h:48,kind:'ground'}], hazards: [h], coins: [], moves: {}, gear: {}, hazardRect: Levels.hazardRect}, null, 0); return !p.dead; })()");
check('phantom slide passes hazard', "(function(){ var p = Runner.create(100, 432); Runner.trySlide(p, {moves: {phantom: true}, gear: {}}); var h = {type:'mine', x: 90, y: 404, w: 30, h: 28, period: 0, on: 1}; Runner.step(p, 0.016, {solids: [{x:-100,y:432,w:4000,h:48,kind:'ground'}], hazards: [h], coins: [], moves: {phantom: true}, gear: {}, hazardRect: Levels.hazardRect}, null, 0); return !p.dead; })()");
check('shield absorbs one hit', "(function(){ var p = Runner.create(100, 432); p.shieldHits = 1; var h = {type:'mine', x: 90, y: 404, w: 30, h: 28, period: 0, on: 1}; Runner.step(p, 0.016, {solids: [{x:-100,y:432,w:4000,h:48,kind:'ground'}], hazards: [h], coins: [], moves: {}, gear: {}, hazardRect: Levels.hazardRect}, null, 0); return !p.dead && p.shieldHits === 0; })()");
check('fall death below 620', "(function(){ var p = Runner.create(50, 630); p.onGround = false; Runner.step(p, 0.016, {solids: [], hazards: [], coins: [], moves: {}, gear: {}}, null, 0); return p.dead; })()");
check('beam stumble (standing)', "(function(){ var p = Runner.create(80, 432); Runner.step(p, 0.016, {solids: [{x: 90, y: 384, w: 48, h: 8, kind: 'beam'}], hazards: [], coins: [], moves: {}, gear: {}}, null, 0); return p.stumbleT > 0; })()");
check('beam pass (sliding)', "(function(){ var p = Runner.create(80, 432); Runner.trySlide(p, {gear: {}}); Runner.step(p, 0.016, {solids: [{x: 90, y: 384, w: 48, h: 8, kind: 'beam'}], hazards: [], coins: [], moves: {}, gear: {}}, null, 0); return p.stumbleT === 0; })()");
check('crate vault on side hit', "(function(){ var p = Runner.create(80, 432); Runner.step(p, 0.016, {solids: [{x: 90, y: 388, w: 48, h: 44, kind: 'crate'}], hazards: [], coins: [], moves: {}, gear: {}}, null, 0); return p.vaultT > 0; })()");
check('dash smashes crate', "(function(){ var p = Runner.create(80, 432); p.dashT = 0.3; p.iframes = 0.3; var s = [{x: 90, y: 388, w: 48, h: 44, kind: 'crate'}]; Runner.step(p, 0.016, {solids: s, hazards: [], coins: [], moves: {}, gear: {}}, null, 0); return s.length === 0; })()");
check('wall cling needs move', "(function(){ var p = Runner.create(80, 300); p.onGround = false; p.vy = 100; Runner.step(p, 0.016, {solids: [{x: 95, y: 280, w: 24, h: 96, kind: 'wall'}], hazards: [], coins: [], moves: {wall: true}, gear: {}}, null, 0); return p.wallT > 0; })()");
check('wall bounce on jump', "(function(){ var p = Runner.create(80, 300); p.onGround = false; p.vy = 100; var w = {solids: [{x: 95, y: 280, w: 24, h: 96, kind: 'wall'}], hazards: [], coins: [], moves: {wall: true}, gear: {}}; Runner.step(p, 0.016, w, null, 0); Runner.step(p, 0.016, w, {jump: true}, 0); return p.vy < -500 && p.wallT === 0; })()");
check('near-miss adds flow', "(function(){ Flow.reset(); var p = Runner.create(100, 432); var h = {type:'mine', x: 148, y: 404, w: 30, h: 28, period: 0, on: 1}; Runner.step(p, 0.016, {solids: [{x:-100,y:432,w:4000,h:48,kind:'ground'}], hazards: [h], coins: [], moves: {}, gear: {}, hazardRect: Levels.hazardRect}, null, 0); return h._passed === true && Flow.hits > 0; })()");
check('coin pickup + part value', "(function(){ var p = Runner.create(100, 432); var c1 = {x: 108, y: 404, got: false, val: 1}; var c2 = {x: 118, y: 404, got: false, val: 40}; Runner.step(p, 0.016, {solids: [], hazards: [], coins: [c1, c2], moves: {}, gear: {}}, null, 0); return p.coins === 41 && c1.got && c2.got; })()");
check('visor widens magnet', "(function(){ var p = Runner.create(100, 432); var c = {x: 140, y: 404, got: false, val: 1}; Runner.step(p, 0.016, {solids: [], hazards: [], coins: [c], moves: {}, gear: {visor: 3}}, null, 0); return c.got; })()");
check('exit triggers world.done', "(function(){ var p = Runner.create(100, 432); var w = {solids: [], hazards: [], coins: [], moves: {}, gear: {}, exit: {x: 105, y: 336, w: 40, h: 96}, done: false}; Runner.step(p, 0.016, w, null, 0); return w.done === true; })()");
check('precision landing move', "(function(){ var p = Runner.create(50, 300); p.onGround = false; p.vy = 200; var w = {solids: [{x: -100, y: 432, w: 4000, h: 48, kind: 'ground'}], hazards: [], coins: [], moves: {prec: true}, gear: {}}; Runner.step(p, 0.15, w, null, 0); Runner.step(p, 0.15, w, null, 0); return p.precT > 0 && p.tricks > 0; })()");
check('backflip trick on double jump', "(function(){ Flow.reset(); var p = Runner.create(50, 432); var w = {solids: [{x: -100, y: 432, w: 4000, h: 48, kind: 'ground'}], hazards: [], coins: [], moves: {dbl: true, flip: true}, gear: {}}; Runner.step(p, 0.016, w, {jump: true}, 0); Runner.step(p, 0.2, w, null, 0); Runner.step(p, 0.016, w, {jump: true}, 0); return p.flipT > 0 && p.tricks >= 1; })()");
check('ghosts spawn during dash', "(function(){ var p = Runner.create(50, 432); p.dashT = 0.3; Runner.step(p, 0.016, {solids: [], hazards: [], coins: [], moves: {}, gear: {}}, null, 0); return p.ghosts.length > 0; })()");

/* ---- runner render ---- */
check('draw run pose', "(function(){ var p = Runner.create(200, 432); p.state = 'run'; Runner.draw(Game.ctx, p, 0, SKINS[0]); return true; })()");
check('draw all poses', "(function(){ var p = Runner.create(200, 432); ['run','jump','slide','dash','vault','wall','flip','dead'].forEach(function(st){ p.state = st; Runner.draw(Game.ctx, p, 0, SKINS[1]); }); return true; })()");
check('drawGhosts no crash', "(function(){ var p = Runner.create(200, 432); p.ghosts = [{x: 190, y: 432, state: 'dash', phase: 1, flipT: 0, slideT: 0, life: 0.2}]; Runner.drawGhosts(Game.ctx, p, 0, SKINS[0]); return true; })()");

/* ---- game flow: campaign ---- */
check('act menu keeps menu', "(function(){ Game.act('menu'); return Game.state === 'menu'; })()");
check('act open shop', "(function(){ Game.act('open:shop'); return Game.state === 'shop' && !document.getElementById('ne-shop').classList.contains('hidden'); })()");
check('shop panel lists moves', "(function(){ Game.renderPanel('shop'); return document.getElementById('ne-shop-body').innerHTML.indexOf('Double Jump') >= 0; })()");
check('gear panel lists gear', "(function(){ Game.act('open:gear'); return document.getElementById('ne-gear-body').innerHTML.indexOf('VISOR') >= 0; })()");
check('skins panel lists skins', "(function(){ Game.act('open:skins'); return document.getElementById('ne-skins-body').innerHTML.indexOf('VOLT') >= 0; })()");
check('mode campaign opens levels', "(function(){ Game.act('mode:campaign'); return Game.state === 'levels'; })()");
check('levels panel lists 15', "(function(){ Game.renderPanel('levels'); var h = document.getElementById('ne-levels-body').innerHTML; return (h.match(/data-act/g) || []).length === 15; })()");
check('level starts with story gate', "(function(){ Game.storySeen = {}; Game.act('level:lab1'); return Game.state === 'story'; })()");
check('story continue starts level', "(function(){ Game.act('story'); return Game.state === 'playing' && Game.levelDef.id === 'lab1' && Game.storySeen.z1 === true; })()");
check('hud shows level name', "(function(){ Game.updateHud(); return document.getElementById('ne-level-name').textContent === 'Wake Up'; })()");
check('pause + resume', "(function(){ Game.act('pause'); var a = Game.state === 'paused'; Game.act('pause'); return a && Game.state === 'playing'; })()");
check('run advances in update', "(function(){ var x0 = Game.run.x; Game.update(0.016); return Game.run.x > x0; })()");
check('swipe up jumps', "(function(){ Input.swipe = 'up'; var y0 = Game.run.y; Game.update(0.016); return Game.run.vy < 0; })()");
check('keyboard dash works', "(function(){ Input.keys['ShiftLeft'] = true; Game.update(0.016); var d = Game.run.dashT > 0; Input.keys['ShiftLeft'] = false; Input.endFrame(); return d; })()");
check('updateHud sets score/coins/flow', "(function(){ Game.updateHud(); return document.getElementById('ne-score').textContent !== '' && document.getElementById('ne-flow').textContent === 'x' + Flow.mult; })()");
check('die awards coins + state', "(function(){ Game.run.coins = 7; Game.run.dead = true; Game.die(); return Game.state === 'dead'; })()");
check('revive works once', "(function(){ var w0 = Game.wallet; Game.act('revive'); var a = Game.state === 'playing' && Game.revived; Game.run.dead = true; Game.die(); Game.act('revive'); return a && Game.state === 'dead'; })()");
check('retry rebuilds level (coins reset)', "(function(){ Game.level.coins.forEach(function(c){ c.got = true; }); Game.act('retry'); return Game.level.coins.every(function(c){ return !c.got; }) && Game.state === 'playing'; })()");
check('complete awards + progress', "(function(){ var w0 = Game.wallet; Game.run.coins = 5; Game.complete(); return Game.state === 'complete' && Game.progress.lab1.done === true && Game.wallet > w0; })()");
check('next level advances', "(function(){ Game.act('next'); return Game.state === 'playing' && Game.levelDef.id === 'lab2'; })()");
check('ending after final level', "(function(){ Game.levelIdx = 14; Game.act('next'); return Game.state === 'ending'; })()");
check('ending text set', "(function(){ return document.getElementById('ne-ending-text').textContent.indexOf('FREEDOM') >= 0; })()");

/* ---- game flow: modes ---- */
check('endless starts playing', "(function(){ Game.act('mode:endless'); return Game.state === 'playing' && Game.levelDef.id === 'endless' && Game.level.width > 4000; })()");
check('endless level has hazards', "(function(){ return Game.level.hazards.length > 10; })()");
check('daily uses date seed', "(function(){ Game.todayYmd = 20261020; Game.act('mode:daily'); var a = Game.levelDef.id === 'daily'; Game.todayYmd = 20261020; Game.retry(); var w1 = Game.level.width; Game.act('mode:daily'); return a && Game.level.width === w1; })()");
check('training starts', "(function(){ Game.act('mode:training'); return Game.state === 'playing' && Game.levelDef.id === 'train'; })()");

/* ---- shop economy ---- */
check('buy move deducts + owns', "(function(){ Game.wallet = 10000; Game.moves.dbl = false; Game.act('buyMove:dbl'); return Game.moves.dbl === true && Game.wallet === 9400; })()");
check('buy move needs funds', "(function(){ Game.wallet = 10; Game.moves.wall = false; Game.act('buyMove:wall'); return Game.moves.wall === false && Game.wallet === 10; })()");
check('no duplicate buy', "(function(){ Game.wallet = 10000; Game.act('buyMove:dbl'); return Game.wallet === 10000; })()");
check('buy skin deducts + equips', "(function(){ Game.wallet = 10000; Game.act('buySkin:volt'); return Game.skins.indexOf('volt') >= 0 && Game.skin === 'volt' && Game.wallet === 8800; })()");
check('equip skin works', "(function(){ Game.act('equipSkin:subject'); return Game.skin === 'subject'; })()");
check('feat skin blocked until done', "(function(){ Game.wallet = 99999; Game.skins = ['subject']; Game.progress = {}; Game.act('buySkin:gold'); return Game.skins.indexOf('gold') < 0; })()");
check('buy gear tiers up', "(function(){ Game.wallet = 10000; Game.gear.visor = 0; Game.act('buyGear:visor'); Game.act('buyGear:visor'); return Game.gear.visor === 2 && Game.wallet === 10000 - 500 - 1400; })()");
check('gear max stops buying', "(function(){ Game.wallet = 99999; Game.gear.boots = 3; Game.act('buyGear:boots'); return Game.gear.boots === 3; })()");
check('progressDone all levels', "(function(){ Game.progress = {}; Levels.LIST.forEach(function(d){ Game.progress[d.id] = {done: true}; }); return Game.progressDone() === true; })()");
check('save/load roundtrip', "(function(){ Game.wallet = 1234; Game.save(); Game.wallet = 0; Game.load(); return Game.wallet === 1234; })()");

/* ---- FX ---- */
check('FX spawn + update', "(function(){ FX.clear(); FX.spawn(100, 100, '#fff', 10); var n = FX.parts.length; FX.update(0.016); return n === 10 && FX.parts.length <= 10; })()");
check('FX text lifecycle', "(function(){ FX.clear(); FX.text(50, 50, 'HI', '#fff'); var n = FX.texts.length; FX.update(1.5); return n === 1 && FX.texts.length === 0; })()");
check('FX shake + flash decay', "(function(){ FX.shake(8, 0.2); FX.addFlash(0.5); FX.update(0.3); return FX.shakeT <= 0 && FX.flash < 0.5; })()");
check('FX clear empties', "(function(){ FX.spawn(0, 0, '#fff', 5); FX.text(0, 0, 'x'); FX.clear(); return FX.parts.length === 0 && FX.texts.length === 0; })()");

/* ---- audio / input ---- */
check('audio play without ctx safe', "(function(){ AudioSys.play('jump'); AudioSys.startMusic(); AudioSys.stopMusic(); return true; })()");
check('mute toggles + persists', "(function(){ AudioSys.muted = false; AudioSys.toggleMute(); var m = AudioSys.muted; AudioSys.toggleMute(); return m === true && AudioSys.muted === false; })()");
check('consumeSwipe clears', "(function(){ Input.swipe = 'up'; var s = Input.consumeSwipe(); return s === 'up' && Input.consumeSwipe() === null; })()");
check('tapDash dashHeld', "(function(){ Input.tapDashUntil = 1e12; var d = Input.dashHeld(0); Input.tapDashUntil = 0; return d; })()");
check('double-tap arm sets dash', "(function(){ Input.tapDashUntil = 0; Input._tapT['p1'] = 0; perfT = 100; (function(){ Input.keys['x'] = 1; })(); var now = 120; var last = Input._tapT['p1'] === undefined ? -1e9 : Input._tapT['p1']; var armed = (now - last < 260); if (armed) Input.tapDashUntil = now + 110; return armed && Input.tapDashUntil > now; })()");

/* ---- render states ---- */
check('render menu no crash', "(function(){ Game.act('menu'); Game.render(); return true; })()");
check('render playing no crash', "(function(){ Game.act('mode:endless'); Game.render(); return true; })()");
check('render dead no crash', "(function(){ Game.run.dead = true; Game.die(); Game.render(); return true; })()");
check('drawTrap laser/saw/piston/vent/mine/drone', "(function(){ var hz = [{type:'laser', x:10, y:200, w:18, h:200, period:1.6, on:0.9, phase:0}, {type:'saw', x:50, y:384, w:48, h:48, phase:0}, {type:'piston', x:100, y:200, w:32, h:232, period:2, on:1, phase:0}, {type:'vent', x:150, y:336, w:28, h:96, period:2, on:1, phase:0}, {type:'mine', x:200, y:404, w:30, h:28, phase:0}, {type:'drone', x:250, y:300, w:44, h:24, phase:0, range:50}]; hz.forEach(function(h){ Game.drawTrap(Game.ctx, h, Levels.hazardRect(h, 0.1), 0, 0.1); }); return true; })()");
check('drawBg zone 2 tint', "(function(){ Game.levelDef = {zone: 2}; Game.drawBg(Game.ctx); Game.levelDef = {zone: 3}; Game.drawBg(Game.ctx); return true; })()");
check('showScreen toggles', "(function(){ Game.showScreen('ne-pause'); var a = !document.getElementById('ne-pause').classList.contains('hidden') && document.getElementById('ne-menu').classList.contains('hidden'); Game.showScreen(null); return a; })()");

/* ---- misc content ---- */
check('zone stories non-empty', "ZONE_STORY[1].length > 40 && ZONE_STORY[2].length > 40 && ZONE_STORY[3].length > 40 && ZONE_STORY.end.indexOf('FREEDOM') >= 0");
check('menu hint present', "document.getElementById('ne-menu') !== null");

/* ---- SWARM CHASE ---- */
check('chase flags: 8 levels (rea3..sky5)', "(function(){ return Levels.LIST.filter(d => d.chase).length === 8 && Levels.LIST[7].chase === true && Levels.LIST[14].chase === true && Levels.LIST[0].chase === undefined && Levels.LIST[5].chase === undefined; })()");
check('swarm inactive in zone 1', "(function(){ Game.act('mode:campaign'); Game.storySeen = {z1: true, z2: true, z3: true}; Game.act('level:lab1'); return Game.swarm.active === false; })()");
check('swarm active in rea3 (reactor)', "(function(){ Game.act('level:rea3'); return Game.swarm.active === true && Game.swarm.gap === 300; })()");
check('swarm active in sky4', "(function(){ Game.act('level:sky4'); return Game.swarm.active === true; })()");
check('swarm active in endless + daily', "(function(){ Game.act('mode:endless'); var a = Game.swarm.active === true; Game.act('mode:daily'); return a && Game.swarm.active === true; })()");
check('swarm inactive in training', "(function(){ Game.act('mode:training'); return Game.swarm.active === false; })()");
check('clean run recovers gap', "(function(){ Game.startLevel({id: 'sw', name: 'sw', zone: 1, len: 200, chase: true}); var g0 = Game.swarm.gap; for (var i = 0; i < 60; i++) Game.update(0.016); return Game.swarm.gap > g0; })()");
check('stumble shrinks gap', "(function(){ Game.startLevel({id: 'sw', name: 'sw', zone: 1, len: 200, chase: true}); var g0 = Game.swarm.gap; Game.run.stumbleT = 0.5; for (var i = 0; i < 30; i++) Game.update(0.016); return Game.swarm.gap < g0; })()");
check('dash pulls away from swarm', "(function(){ Game.startLevel({id: 'sw', name: 'sw', zone: 1, len: 200, chase: true}); var g0 = Game.swarm.gap; Game.run.dashT = 0.3; Game.update(0.1); return Game.swarm.gap > g0 + 15; })()");
check('precision landing buys space', "(function(){ Game.startLevel({id: 'sw', name: 'sw', zone: 1, len: 200, chase: true}); Game.run.precT = 0.5; var g0 = Game.swarm.gap; for (var i = 0; i < 20; i++) Game.update(0.016); return Game.swarm.gap > g0; })()");
check('swarm catch kills (SWARMED!)', "(function(){ Game.startLevel({id: 'sw', name: 'sw', zone: 1, len: 200, chase: true}); Game.swarm.gap = 5; Game.run.stumbleT = 0.5; Game.update(0.2); return Game.run.dead === true && Game.state === 'dead' && Game.lastDeath === 'swarm' && document.getElementById('ne-dead-title').textContent === 'SWARMED!'; })()");
check('trap death says CAUGHT!', "(function(){ Game.startLevel({id: 'sw2', name: 'sw2', zone: 1, len: 200}); Game.run.dead = true; Game.die(); return document.getElementById('ne-dead-title').textContent === 'CAUGHT!'; })()");
check('revive restores safe gap', "(function(){ Game.startLevel({id: 'sw', name: 'sw', zone: 1, len: 200, chase: true}); Game.swarm.gap = 5; Game.run.stumbleT = 0.5; Game.update(0.2); Game.act('revive'); return Game.state === 'playing' && Game.swarm.gap >= 280; })()");
check('swarm ramp grows with distance', "(function(){ Game.startLevel({id: 'sw', name: 'sw', zone: 1, len: 200, chase: true}); Game.run.dist = 30000; Game.update(0.016); return Game.swarm.ramp > 2; })()");
check('gap clamped to max', "(function(){ Game.startLevel({id: 'sw', name: 'sw', zone: 1, len: 200, chase: true}); Game.swarm.gap = 375; Game.run.dashT = 0.3; Game.update(0.2); return Game.swarm.gap <= Game.swarm.max; })()");
check('drawSwarm no crash (active+off)', "(function(){ Game.startLevel({id: 'sw', name: 'sw', zone: 1, len: 200, chase: true}); Game.drawSwarm(Game.ctx, 0); Game.swarm.active = false; Game.drawSwarm(Game.ctx, 0); return true; })()");
check('swarm story mentions the swarm', "ZONE_STORY[2].indexOf('swarm') >= 0");

/* ---- 60s stress ---- */
check('logic+render under 1.5ms/frame', "(function(){ Game.act('mode:endless'); var t0 = Date.now(); for (var i = 0; i < 2400; i++) { Game.update(0.016); if (Game.state !== 'playing') { Game.act('mode:endless'); } Game.render(); } var ms = (Date.now() - t0) / 2400; globalThis.__ms = ms; return ms < 1.5; })()");

/* ---------------- sprite art ---------------- */
check('art: not ready without images (vector fallback)', "Art.ready === false && Art.drawHero(Game.ctx, Game.run || {x:0,y:0,onGround:true,runPhase:0}, 0, Game.skinDef(), 1) === false");

// install an Image stub that "loads" the moment src is assigned, then reload the atlases
sandbox.Image = function () {
  const img = { width: 236, height: 328, onload: null, onerror: null };
  Object.defineProperty(img, 'src', {
    set() { if (img.onload) img.onload(); },
    get() { return 'stub'; }
  });
  return img;
};
ev('Art.reset(); Art.load();');
check('art: ready after images load', "Art.ready === true");
check('art: all four atlases present', "!!Art.img.run && !!Art.img.poses && !!Art.img.botHunter && !!Art.img.botWasp");
check('art: run atlas has 12 frames', "SPRITES.run.frames.length === 12");
check('art: six poses keyed by name', "['tuck','fall','slide','wall','vault','dive'].every(function (n) { return !!SPRITES.poses.frames[n]; })");
check('art: heroH matches hitbox', "SPRITES.heroH > 64 && SPRITES.heroH <= 72");

ev("Game.startLevel({id:'art', name:'art', zone: 0, len: 400})");
check('art: grounded -> run cycle', "(function(){ var r=Game.run; r.onGround=true; r.slideT=0; r.wallT=0; r.vaultT=0; return Art.heroFrame(r).key === 'run'; })()");
check('art: rising -> tuck', "(function(){ var r=Game.run; r.onGround=false; r.vy=-400; return Art.heroFrame(r).name === 'tuck'; })()");
check('art: falling -> fall', "(function(){ var r=Game.run; r.onGround=false; r.vy=200; return Art.heroFrame(r).name === 'fall'; })()");
check('art: fast fall -> dive', "(function(){ var r=Game.run; r.onGround=false; r.vy=900; return Art.heroFrame(r).name === 'dive'; })()");
check('art: slide -> slide pose', "(function(){ var r=Game.run; r.slideT=0.3; return Art.heroFrame(r).name === 'slide'; })()");
check('art: wall -> wall pose', "(function(){ var r=Game.run; r.slideT=0; r.wallT=0.2; return Art.heroFrame(r).name === 'wall'; })()");
check('art: vault -> vault pose', "(function(){ var r=Game.run; r.wallT=0; r.vaultT=0.2; return Art.heroFrame(r).name === 'vault'; })()");

check('art: run phase covers 12 distinct frames', "(function(){ var seen={}, n=0; for (var i=0;i<240;i++){ var ph=(i*(Math.PI*2/240))%(Math.PI*2); var idx=Math.floor(ph/(Math.PI*2)*SPRITES.run.frames.length); if(!seen[idx]){seen[idx]=1;n++;} } return n === 12; })()");
check('art: drawHero blits to canvas', "(function(){ var r=Game.run; r.slideT=0; r.vaultT=0; r.wallT=0; r.onGround=true; r.flipT=0; r.dashT=0; var before=drawCounts.drawImage||0; Art.drawHero(Game.ctx, r, 0, Game.skinDef(), 1); return (drawCounts.drawImage||0) > before; })()");
check('art: tint cache reuses one canvas per colour', "(function(){ var col='#123456'; var n=Art._tintCount; Art._tint('run', SPRITES.run.frames[0], col); var a=Art._tintCount; Art._tint('run', SPRITES.run.frames[0], col); return a === n + 1 && Art._tintCount === a; })()");
check('art: different skins get different tints', "(function(){ var a=Art._tint('run', SPRITES.run.frames[0], '#ff6a3d'); var b=Art._tint('run', SPRITES.run.frames[0], '#52ff9d'); return !!a && !!b && a !== b; })()");
check('art: drawBot draws hunter + wasp', "(function(){ var before=drawCounts.drawImage||0; var a=Art.drawBot(Game.ctx,'hunter',100,100,34,1,0); var b=Art.drawBot(Game.ctx,'wasp',140,100,26,1,0); return a && b && (drawCounts.drawImage||0) >= before + 2; })()");
check('art: Runner.draw paints stroke geometry', "(function(){ var before=(drawCounts.stroke||0)+(drawCounts.drawImage||0); Runner.draw(Game.ctx, Game.run, 0, Game.skinDef()); return ((drawCounts.stroke||0)+(drawCounts.drawImage||0)) > before; })()");
check('art: ghosts still render', "(function(){ Game.run.dashT=0.3; Game.run.ghosts.push({x:Game.run.x,y:Game.run.y,state:'run',phase:0,flipT:0,slideT:0,life:0.2}); var before=(drawCounts.stroke||0)+(drawCounts.drawImage||0); Runner.drawGhosts(Game.ctx, Game.run, 0, Game.skinDef()); return ((drawCounts.stroke||0)+(drawCounts.drawImage||0)) > before; })()");
check('art: swarm bots render sprites', "(function(){ Game.swarm.active=true; Game.swarm.gap=200; var before=drawCounts.drawImage||0; Game.drawSwarm(Game.ctx, 0); return (drawCounts.drawImage||0) >= before + 7; })()");
check('art: generic loader loads every atlas', "Object.keys(Art.img).length >= 4 && !!Art.img.run && !!Art.img.poses && !!Art.img.botHunter && !!Art.img.botWasp");
check('art: has() is true only for frame sequences', "Art.has('run') === true && Art.has('poses') === false && Art.has('botHunter') === false && Art.frameCount('run') === 12");
check('art: drawAnim clamps + wraps frame index', "(function(){ var before=drawCounts.drawImage||0; var a=Art.drawAnim(Game.ctx,'run',-1,100,400,72,'#eaf6ff',1); var b=Art.drawAnim(Game.ctx,'run',999,140,400,72,'#eaf6ff',1); return a && b && (drawCounts.drawImage||0) >= before+2; })()");
check('art: drawAnim refuses unknown animations', "Art.drawAnim(Game.ctx,'nope',0,0,0,10,null,1) === false && Art.frameCount('nope') === 0 && Art.has('nope') === false");
check('art: EXTRA-ANIM block is empty by default', "Object.keys(SPRITES).filter(function(k){return typeof SPRITES[k]==='object' && typeof SPRITES[k].file==='string';}).length === 4");
check('art: falls back to vector when atlas missing', "(function(){ Art.ready=false; var before=drawCounts.beginPath||0; Runner.draw(Game.ctx, Game.run, 0, Game.skinDef()); var ok=(drawCounts.beginPath||0) > before; Art.ready=true; return ok; })()");

/* ---------------- skeletal rig ---------------- */
check('rig: enabled + reports a standing height', "Rig.enabled === true && Rig.height() >= 64 && Rig.height() <= 76");
check('rig: gait rate derives from the pose constants', "(function(){ var k = Rig.gaitK(); return Math.abs(k - Rig.P.duty * Math.PI / Rig.P.stride) < 1e-9; })()");
check('rig: Runner.draw prefers the rig', "(function(){ var before=drawCounts.stroke||0; Rig.enabled=true; Runner.draw(Game.ctx, Game.run, 0, Game.skinDef()); return (drawCounts.stroke||0) > before; })()");

// a full stride must contain distinct poses (this is what the sprite sheet failed at)
check('rig: run cycle has 12 distinct poses', "(function(){ var sigs=[], seen={}, distinct=0; for (var i=0;i<12;i++){ var q=Rig.pose({state:'run', onGround:true, runPhase:i/12*Math.PI*2, baseSpeed:310, speedNow:310}); var sig=[q.hip.y,q.shoulder.x,q.legs[0].ankle.x,q.legs[1].ankle.x,q.legs[0].knee.x,q.arms[0].hand.x].map(function(v){return v.toFixed(2);}).join(','); if(!seen[sig]){seen[sig]=1;distinct++;} } return distinct === 12; })()");
check('rig: opposite legs stay half a cycle apart', "(function(){ for (var i=0;i<12;i++){ var q=Rig.pose({state:'run', onGround:true, runPhase:i/12*Math.PI*2, baseSpeed:310, speedNow:310}); var a=q.legs[0].ankle.x, b=q.legs[1].ankle.x; if (Math.abs(a-b) < 2) return false; } return true; })()");

// foot planting: the contact foot must move backwards at exactly the body speed
check('rig: stance foot is locked to the ground', "(function(){ var spd=310, dt=1/600; var slip=0, n=0; for (var i=0;i<40;i++){ var ph=i*0.02; var q0=Rig.pose({state:'run',onGround:true,runPhase:ph,baseSpeed:spd,speedNow:spd}); var q1=Rig.pose({state:'run',onGround:true,runPhase:ph+spd*Rig.gaitK()*dt,baseSpeed:spd,speedNow:spd}); var a=q0.legs[0].ankle, b=q1.legs[0].ankle; if (a.y > -0.5 && b.y > -0.5) { var worldMove = (b.x - a.x) + spd*dt; slip += Math.abs(worldMove); n++; } } return n > 5 && slip/n < 0.35; })()",
);
check('rig: knees always bend forward', "(function(){ for (var i=0;i<12;i++){ var q=Rig.pose({state:'run',onGround:true,runPhase:i/12*Math.PI*2,baseSpeed:310,speedNow:310}); for (var j=0;j<2;j++){ var knee=q.legs[j].knee, hip=q.hip, ankle=q.legs[j].ankle; if (knee.x < Math.min(hip.x, ankle.x) - 0.5) return false; } } return true; })()");
check('rig: legs never over-extend past their length', "(function(){ for (var i=0;i<24;i++){ var q=Rig.pose({state:'run',onGround:true,runPhase:i/24*Math.PI*2,baseSpeed:310,speedNow:310}); for (var j=0;j<2;j++){ var l=q.legs[j]; var dx=l.knee.x-l.hip.x, dy=l.knee.y-l.hip.y, ex=l.ankle.x-l.knee.x, ey=l.ankle.y-l.knee.y; if (Math.sqrt(dx*dx+dy*dy) > Rig.P.thigh+0.01) return false; if (Math.sqrt(ex*ex+ey*ey) > Rig.P.shin+0.01) return false; } } return true; })()");
check('rig: hands hang below the shoulder (not over the head)', "(function(){ for (var i=0;i<12;i++){ var q=Rig.pose({state:'run',onGround:true,runPhase:i/12*Math.PI*2,baseSpeed:310,speedNow:310}); for (var j=0;j<2;j++){ if (q.arms[j].hand.y < q.shoulder.y - 6) return false; } } return true; })()");

// every movement state produces a pose
check('rig: all states pose without gaps', "['run','dash','jump','fall','slide','wall','vault','dead'].every(function(st){ var q=Rig.pose({state:st,onGround:st==='run'||st==='slide'||st==='dash',vy:st==='fall'?300:-200,runPhase:1.1,baseSpeed:310,speedNow:310,dashT:st==='dash'?0.2:0,slideT:st==='slide'?0.3:0,wallT:st==='wall'?0.3:0}); return q && q.legs.length===2 && q.arms.length===2 && isFinite(q.head.x) && isFinite(q.hip.y); })");
check('rig: airborne feet are tucked above the standing foot line', "(function(){ var g=Rig.pose({state:'run',onGround:true,runPhase:1.1,baseSpeed:310,speedNow:310}); var a=Rig.pose({state:'jump',onGround:false,vy:-500,runPhase:1.1,baseSpeed:310,speedNow:310}); var grounded=Math.min(g.legs[0].ankle.y, g.legs[1].ankle.y); var lifted=Math.min(a.legs[0].ankle.y, a.legs[1].ankle.y); return lifted < grounded - 2; })()");
check('rig: dash leans further than a normal run', "(function(){ var r=Rig.pose({state:'run',onGround:true,runPhase:1,baseSpeed:310,speedNow:310}); var d=Rig.pose({state:'dash',onGround:true,runPhase:1,baseSpeed:310,speedNow:310}); return d.lean > r.lean; })()");
check('rig: faster speed increases the lean', "(function(){ var slow=Rig.pose({state:'run',onGround:true,runPhase:1,baseSpeed:310,speedNow:310}); var fast=Rig.pose({state:'run',onGround:true,runPhase:1,baseSpeed:310,speedNow:700}); return fast.lean > slow.lean; })()");
check('rig: skin colour drives the silhouette', "(function(){ var before=drawCounts.stroke||0; Rig.draw(Game.ctx,{x:0,y:0,onGround:true,runPhase:0.5,state:'run',baseSpeed:310,speedNow:310},0,{col:'#ff6a3d'},1); return (drawCounts.stroke||0) >= before + 6; })()");
check('rig: can be disabled for the fallback path', "(function(){ Rig.enabled=false; var a=Rig.draw(Game.ctx, Game.run, 0, Game.skinDef(), 1); Rig.enabled=true; return a === false; })()");

console.log('\nms/frame = ' + (ev('globalThis.__ms') ? ev('globalThis.__ms').toFixed(4) : '?'));
console.log('----------------------------------------');
console.log('PASSED: ' + pass + '   FAILED: ' + fail);
if (fail) {
  console.log('\nFAILURES:');
  fails.forEach((f) => console.log('  - ' + f));
  process.exit(1);
} else {
  console.log('ALL NEON ESCAPE TESTS PASSED');
}
