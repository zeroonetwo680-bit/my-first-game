#!/usr/bin/env node
/* Visual QA: composite the sliced sprites at real in-game scale on a ground line,
 * exactly the way the game will draw them (bottom-centre pivot + per-frame target height). */
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const ROOT = path.join(__dirname, '..');
const SP = path.join(ROOT, 'assets', 'sprites');

(async () => {
  const run = JSON.parse(fs.readFileSync(path.join(SP, 'hero-run.json')));
  const poses = JSON.parse(fs.readFileSync(path.join(SP, 'hero-poses.json')));
  const runImg = await loadImage(path.join(SP, 'hero-run.png'));
  const poseImg = await loadImage(path.join(SP, 'hero-poses.png'));
  const botH = await loadImage(path.join(SP, 'bot-hunter.png'));
  const botW = await loadImage(path.join(SP, 'bot-wasp.png'));

  const W = 1500, H = 470;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  const g1 = ctx.createLinearGradient(0, 0, 0, H);
  g1.addColorStop(0, '#0a0a14'); g1.addColorStop(1, '#131327');
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);

  const ground = 250;
  ctx.strokeStyle = 'rgba(53,240,255,0.55)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, ground + 0.5); ctx.lineTo(W, ground + 0.5); ctx.stroke();
  ctx.fillStyle = 'rgba(53,240,255,0.05)'; ctx.fillRect(0, ground, W, 70);

  // draw helper with the same math the game will use
  function blit(img, f, x, y, tint, alpha) {
    const s = f.th / f.h;
    const w = f.w * s, h = f.h * s;
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    if (tint) {
      const t = createCanvas(f.w, f.h);
      const tc = t.getContext('2d');
      tc.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      tc.globalCompositeOperation = 'source-in';
      tc.fillStyle = tint; tc.fillRect(0, 0, f.w, f.h);
      ctx.drawImage(t, x - w / 2, y - h, w, h);
    } else {
      ctx.drawImage(img, f.x, f.y, f.w, f.h, x - w / 2, y - h, w, h);
    }
    ctx.restore();
  }

  ctx.fillStyle = '#7fb'; ctx.font = 'bold 13px monospace';
  ctx.fillText('RUN CYCLE @ 66px — bottom-centre pivot', 10, 22);

  const ts = 0.42;
  ctx.save();
  ctx.translate(14, ground - 6);
  ctx.scale(ts, ts);
  run.frames.forEach((f, i) => {
    blit(runImg, f, (i + 0.5) * (run.frameW + 6), 0, '#eaf6ff', 1);
  });
  ctx.restore();

  ctx.fillStyle = '#7fb';
  ctx.fillText('POSES', 10, ground + 46);
  poses.frames.forEach((f, i) => {
    const x = 40 + i * 120;
    blit(poseImg, f, x, ground + 150, '#eaf6ff', 1);
    ctx.fillStyle = '#54627a'; ctx.font = '11px monospace';
    ctx.fillText(poses.names[i], x - 18, ground + 162);
  });

  // bots
  ctx.fillStyle = '#7fb'; ctx.font = 'bold 13px monospace';
  ctx.fillText('HUNTER BOTS (swarm)', 800, ground + 46);
  for (let i = 0; i < 4; i++) {
    const x = 830 + i * 95, y = ground + 110 + Math.sin(i * 1.7) * 16;
    ctx.drawImage(botH, x - botH.width / 2, y - botH.height / 2);
  }
  for (let i = 0; i < 3; i++) {
    const x = 1210 + i * 78, y = ground + 120 + Math.cos(i * 2.1) * 18;
    ctx.drawImage(botW, x - botW.width / 2, y - botW.height / 2);
  }

  fs.writeFileSync('/tmp/preview.png', c.encodeSync('png'));
  console.log('wrote /tmp/preview.png');
})();
