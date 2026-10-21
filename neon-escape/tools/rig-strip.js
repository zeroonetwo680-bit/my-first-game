#!/usr/bin/env node
/* Animation QA: render a filmstrip of the rig across one stride so the cycle can
 * be judged frame by frame (foot planting, bob, arm swing, silhouette).
 * Run: node tools/rig-strip.js [state] */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createCanvas } = require('@napi-rs/canvas');

const R = path.join(__dirname, '..');
const state = process.argv[2] || 'run';
const N = 12;
const SCALE = 1.7;                 // zoom for inspection

const sb = { console, Math, JSON, Object, Array, String, Number, Boolean, parseInt, parseFloat, isNaN };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(R, 'js/core.js'), 'utf8'), sb, { filename: 'core.js' });
vm.runInContext(fs.readFileSync(path.join(R, 'js/rig.js'), 'utf8'), sb, { filename: 'rig.js' });
const Rig = vm.runInContext('Rig', sb);

const cw = 150, ch = 230;
const c = createCanvas(cw * N / 2, ch * 2);
const ctx = c.getContext('2d');
ctx.fillStyle = '#0e0e18'; ctx.fillRect(0, 0, c.width, c.height);

for (let i = 0; i < N; i++) {
  const col = i % (N / 2), row = Math.floor(i / (N / 2));
  const ox = col * cw, oy = row * ch;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.strokeStyle = 'rgba(53,240,255,0.35)';
  ctx.beginPath(); ctx.moveTo(0, ch - 34.5); ctx.lineTo(cw, ch - 34.5); ctx.stroke();
  ctx.fillStyle = '#4af'; ctx.font = 'bold 11px monospace';
  ctx.fillText('#' + i, 6, 16);

  const p = {
    x: 0, y: 0, onGround: true, vy: 0,
    state: state, runPhase: (i / N) * Math.PI * 2,
    baseSpeed: 310, speedNow: 310, dashT: 0, flipT: 0, slideT: 0
  };
  ctx.save();
  ctx.translate(cw / 2, ch - 34);
  ctx.scale(SCALE, SCALE);
  Rig.draw(ctx, p, 0, { col: '#eaf6ff' }, 1);
  ctx.restore();
  ctx.restore();
}
fs.writeFileSync('/tmp/rig-' + state + '.png', c.encodeSync('png'));
console.log('wrote /tmp/rig-' + state + '.png');
