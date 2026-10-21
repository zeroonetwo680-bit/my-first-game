#!/usr/bin/env node
/* Real-render QA: boots the ACTUAL game files against a native canvas and
 * writes PNG frames, so the sprites can be verified exactly as players see them.
 * Run from the neon-escape folder: node tools/render-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createCanvas, Image } = require('@napi-rs/canvas');

const ROOT = path.join(__dirname, '..');

const canvas = createCanvas(900, 540);
const ctx = canvas.getContext('2d');

/* ---- minimal browser stubs ---- */
function makeEl(id) {
  const el = {
    id, textContent: '', innerHTML: '', hidden: false, width: 900, height: 540,
    classList: { _s: new Set(), toggle(c, f) { if (f === undefined) f = !this._s.has(c); if (f) this._s.add(c); else this._s.delete(c); return f; }, contains(c) { return this._s.has(c); }, add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); } },
    style: {}, dataset: {}, children: [],
    getAttribute() { return null; }, setAttribute() {}, addEventListener() {}, appendChild(c) { this.children.push(c); },
    getContext() { return ctx; }
  };
  return el;
}
const els = {};
const doc = {
  getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
  addEventListener() {},
  createElement: (tag) => (tag === 'canvas' ? createCanvas(1, 1) : makeEl('dyn')),  // offscreen canvases must be real
  body: makeEl('body')
};

const sandbox = {
  console, Math, JSON, Date, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat,
  document: doc, Image,
  localStorage: { _m: {}, getItem(k) { return this._m[k] === undefined ? null : this._m[k]; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } },
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {}
};
sandbox.window = { addEventListener() {}, AudioContext: undefined, webkitAudioContext: undefined };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

['js/core.js', 'js/audio.js', 'js/fx.js', 'js/art.js', 'js/runner.js', 'js/levels.js', 'js/game.js']
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f }));

const ev = (c) => vm.runInContext(c, sandbox);

ev("Game.boot(document.getElementById('ne-canvas'))");

/* ---- wait for the atlases ---- */
function waitArt(timeoutMs) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (ev('Art.ready')) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(tick, 30);
    };
    tick();
  });
}

function shot(name) {
  fs.writeFileSync(path.join('/tmp', name), canvas.encodeSync('png'));
  console.log('  wrote /tmp/' + name);
}

(async () => {
  const ok = await waitArt(6000);
  const slots = ev('Object.keys(Art.img).map(function(k){return k+":"+(!!Art.img[k]);}).join(" ")');
  console.log('art ready:', ok, '| atlases:', slots);

  // ---- menu ----
  ev("Game.state='menu'; Game.render()");
  shot('shot-menu.png');

  // ---- gameplay: a chase level, mid-run ----
  ev("Game.startLevel(Levels.LIST.filter(function(l){return l.chase;})[0])");
  for (let i = 0; i < 40; i++) ev('Game.update(0.016); Game.render()');
  shot('shot-run.png');

  // ---- slide pose ----
  ev("Game.run.slideT = 0.5; Game.run.onGround = true; Game.render()");
  shot('shot-slide.png');

  // ---- airborne tuck ----
  ev("Game.run.slideT = 0; Game.run.onGround = false; Game.run.vy = -300; Game.run.flipT = 0; Game.render()");
  shot('shot-jump.png');

  // ---- swarm closing in ----
  ev("Game.swarm.active = true; Game.swarm.gap = 60; Game.run.onGround = true; Game.render()");
  shot('shot-swarm.png');

  // ---- every skin colour on one frame (tint cache check) ----
  ev("Game.state='skins'; Game.renderPanel('skins')");
  const skins = ev('SKINS.map(function(s){return s.id + ":" + s.col;}).join(",")');
  console.log('  skins:', skins);
  console.log('  tint canvases built:', ev('Art._tintCount'));
})();

/* ---- skin showcase (appended pass) ---- */
setTimeout(() => {
  try {
    const skins = vm.runInContext('SKINS', sandbox);
    const cv = canvas.getContext('2d');
    cv.fillStyle = '#0b0b12'; cv.fillRect(0, 0, 900, 540);
    // ground
    cv.strokeStyle = 'rgba(53,240,255,0.5)';
    cv.beginPath(); cv.moveTo(0, 470.5); cv.lineTo(900, 470.5); cv.stroke();
    skins.forEach((sk, i) => {
      vm.runInContext("Game.skin='" + sk.id + "'; Game.run.onGround=true; Game.run.slideT=0; Game.run.vaultT=0; Game.run.wallT=0; Game.run.flipT=0; Game.run.runPhase=" + (i * 0.52) + "; Art.drawHero(Game.ctx, {x:" + (110 + i * 98) + ", y:466, onGround:true, runPhase:" + (i * 0.52) + ", slideT:0, vaultT:0, wallT:0, flipT:0, dashT:0, precT:0, vy:0, state:'run'}, 0, Game.skinDef(), 1)", sandbox);
      cv.fillStyle = sk.col; cv.font = '9px monospace';
      cv.fillText(sk.name, 110 + i * 98 - 20, 496);
    });
    fs.writeFileSync('/tmp/shot-skins.png', canvas.encodeSync('png'));
    console.log('  wrote /tmp/shot-skins.png');
  } catch (e) { console.error('skins shot failed:', e.message); }
}, 300);
