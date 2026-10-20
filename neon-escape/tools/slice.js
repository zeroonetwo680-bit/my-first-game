#!/usr/bin/env node
/* NEON ESCAPE — art slicer.
 *
 * Turns the raw generated art into clean, trimmed, game-ready sprites:
 *   assets/art/*.png  ->  assets/sprites/*.png + *.json
 *
 * Modes
 *   'blobs'   : every big connected component is one frame (solid silhouettes)
 *   'sheet'   : components merged into figures, split by row bands then x (run cycle)
 *   'ranges'  : hand-verified column ranges (last resort)
 *   chroma    : green-screen art -> trimmed transparent RGBA sprite
 *
 * Output frames carry bottom-centre pivots + per-frame target heights so the game
 * can draw them with a single uniform scale without any per-frame tweaking.
 *
 * Usage: node tools/slice.js
 */
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const ROOT = path.join(__dirname, '..');
const ART = path.join(ROOT, 'assets', 'art');
const OUT = path.join(ROOT, 'assets', 'sprites');
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('   ', ...a);

/* ---------------- masks & blobs ---------------- */

function buildMask(data, w, h) {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    m[i] = a > 40 && (0.299 * r + 0.587 * g + 0.114 * b) < 118 ? 1 : 0;
  }
  return m;
}

function components(mask, w, h, labels) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let minX = w, maxX = -1, minY = h, maxY = -1, area = 0;
    const id = out.length + 1;
    while (sp) {
      const idx = stack[--sp];
      if (labels) labels[idx] = id;
      const x = idx % w, y = (idx / w) | 0;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && mask[idx - 1] && !seen[idx - 1]) { seen[idx - 1] = 1; stack[sp++] = idx - 1; }
      if (x < w - 1 && mask[idx + 1] && !seen[idx + 1]) { seen[idx + 1] = 1; stack[sp++] = idx + 1; }
      if (y > 0 && mask[idx - w] && !seen[idx - w]) { seen[idx - w] = 1; stack[sp++] = idx - w; }
      if (y < h - 1 && mask[idx + w] && !seen[idx + w]) { seen[idx + w] = 1; stack[sp++] = idx + w; }
    }
    out.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
  }
  return out;
}

// remove divider rules + specks that would glue frames together
function cleanMask(mask, w, h) {
  let rows = 0;
  for (let y = 0; y < h; y++) {
    let ink = 0;
    for (let x = 0; x < w; x++) if (mask[y * w + x]) ink++;
    if (ink > w * 0.55) { for (let x = 0; x < w; x++) mask[y * w + x] = 0; rows++; }
  }
  let specks = 0;
  for (const c of components(mask, w, h)) {
    if (c.area < 320 || (c.w > w * 0.35 && c.h < 26)) {
      for (let y = c.y; y < c.y + c.h; y++)
        for (let x = c.x; x < c.x + c.w; x++) mask[y * w + x] = 0;
      specks++;
    }
  }
  if (rows || specks) log(`clean: ${rows} divider rows, ${specks} specks removed`);
}

/* merge detached limbs of the SAME figure, then band rows and sort x */
function sheetFrames(comps, minArea) {
  const big = comps.filter(c => c.area >= minArea).map(c => ({ ...c }));
  let changed = true;
  while (changed) {
    changed = false;
    outer:
    for (let i = 0; i < big.length; i++) {
      for (let j = i + 1; j < big.length; j++) {
        const a = big[i], b = big[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        const gapY = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
        if (ox / Math.min(a.w, b.w) > 0.45 && (oy > 0 || gapY < 10)) {
          const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
          const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h);
          a.x = x1; a.y = y1; a.w = x2 - x1; a.h = y2 - y1; a.area += b.area;
          big.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  big.sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
  const bands = [];
  for (const f of big) {
    const cy = f.y + f.h / 2;
    const band = bands[bands.length - 1];
    if (band && Math.abs(cy - band.cy) < f.h * 0.6) {
      band.items.push(f);
      band.cy = (band.cy * (band.items.length - 1) + cy) / band.items.length;
    } else bands.push({ cy, items: [f] });
  }
  const out = [];
  for (const b of bands) { b.items.sort((p, q) => p.x - q.x); out.push(...b.items); }
  return out;
}

/* ---------------- silhouette sheet -> tinted atlas ---------------- */

async function sliceSheet(file, name, opts) {
  const img = await loadImage(path.join(ART, file));
  const W = img.width, H = img.height;
  const src = createCanvas(W, H);
  const sctx = src.getContext('2d');
  sctx.drawImage(img, 0, 0);
  const data = sctx.getImageData(0, 0, W, H).data;

  const mask = buildMask(data, W, H);
  cleanMask(mask, W, H);

  let frames;
  if (opts.mode === 'blobs') {
    const labels = new Int32Array(W * H);
    const comps = components(mask, W, H, labels);
    frames = comps
      .map((c, i) => Object.assign(c, { label: i + 1 }))
      .filter(c => c.area >= opts.minArea)
      .sort((a, b) => a.x - b.x);
    opts._labels = labels;
  } else if (opts.ranges) {
    frames = opts.ranges.map(r => {
      let minY = H, maxY = -1;
      for (let y = 0; y < H; y++) {
        for (let x = r[0]; x <= r[1]; x++) {
          if (mask[y * W + x]) { if (y < minY) minY = y; if (y > maxY) maxY = y; break; }
        }
      }
      return { x: r[0], y: minY, w: r[1] - r[0] + 1, h: maxY - minY + 1, area: 1 };
    });
  } else {
    frames = sheetFrames(components(mask, W, H), opts.minArea);
  }

  const pad = 4;
  const cw = Math.max(...frames.map(f => f.w)) + pad * 2;
  const ch = Math.max(...frames.map(f => f.h)) + pad * 2;
  const atlas = createCanvas(cw * frames.length, ch);
  const actx = atlas.getContext('2d');
  const metas = [];

  frames.forEach((f, i) => {
    // copy the ink of this frame, recoloured pure white so the game can tint it
    const fc = createCanvas(f.w, f.h);
    const fctx = fc.getContext('2d');
    fctx.drawImage(src, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    const fd = fctx.getImageData(0, 0, f.w, f.h);
    const labels = opts._labels || null;
    for (let p = 0; p < f.w * f.h; p++) {
      const a = fd.data[p * 4 + 3];
      const lum = 0.299 * fd.data[p * 4] + 0.587 * fd.data[p * 4 + 1] + 0.114 * fd.data[p * 4 + 2];
      let ink = a > 40 && lum < 160;
      // blob mode: only keep pixels that belong to THIS pose, never a neighbour's limb
      if (ink && labels && f.label) {
        const px = f.x + (p % f.w), py = f.y + ((p / f.w) | 0);
        ink = labels[py * W + px] === f.label;
      }
      fd.data[p * 4] = 255; fd.data[p * 4 + 1] = 255; fd.data[p * 4 + 2] = 255;
      fd.data[p * 4 + 3] = ink ? 255 : 0;
    }
    fctx.putImageData(fd, 0, 0);

    const dx = i * cw + Math.round((cw - f.w) / 2);
    const dy = pad;
    actx.drawImage(fc, dx, dy);
    metas.push({
      i, x: dx, y: dy, w: f.w, h: f.h,
      // pivot in atlas pixels: bottom-centre of the ink
      px: dx + Math.round(f.w / 2), py: dy + f.h,
      // draw scale so this frame ends up `th` px tall on screen
      th: opts.heights ? opts.heights[i] : (opts.height || null)
    });
  });

  fs.writeFileSync(path.join(OUT, name + '.png'), atlas.encodeSync('png'));
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({
    image: name + '.png', frameW: cw, frameH: ch, count: metas.length,
    names: opts.names || null, frames: metas
  }, null, 1));
  log(`${name}: ${metas.length} frames, cell ${cw}x${ch}`);
  return metas.length;
}

/* ---------------- chroma key -> transparent sprite ---------------- */

async function chromaKey(file, name, targetH) {
  const img = await loadImage(path.join(ART, file));
  const W = img.width, H = img.height;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data;
  for (let i = 0; i < W * H; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const maxRB = Math.max(r, b);
    const spill = g - maxRB;
    if (spill > 18 && g > 70) d[i * 4 + 3] = 0;                    // green screen
    else if (spill > 0) {                                          // rim: kill green bleed
      d[i * 4 + 1] = Math.min(g, maxRB + 6);
      d[i * 4 + 3] = Math.min(d[i * 4 + 3], 255 - Math.round(spill * 3));
    }
  }
  ctx.putImageData(id, 0, 0);

  let minX = W, minY = H, maxX = -1, maxY = -1;
  const dd = ctx.getImageData(0, 0, W, H).data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (dd[(y * W + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const tw = maxX - minX + 1, th = maxY - minY + 1;
  const scale = targetH / th;
  const ow = Math.round(tw * scale), oh = targetH;
  const out = createCanvas(ow, oh);
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(c, minX, minY, tw, th, 0, 0, ow, oh);
  fs.writeFileSync(path.join(OUT, name + '.png'), out.encodeSync('png'));
  log(`${name}: ${tw}x${th} -> ${ow}x${oh}`);
  return { w: ow, h: oh };
}

/* ---------------- build ---------------- */

(async () => {
  console.log('NEON ESCAPE art slicer');

  // run cycle: 12 frames, every frame normalised to the same on-screen height
  await sliceSheet('run-cycle-raw.png', 'hero-run', {
    mode: 'sheet', minArea: 1500, height: 0 /* filled below */
  });

  // poses: 6 independent silhouettes, each exactly one blob
  await sliceSheet('hero-poses-raw.png', 'hero-poses', {
    mode: 'blobs', minArea: 6000,
    names: ['tuck', 'fall', 'slide', 'wall', 'vault', 'dive'],
    heights: [58, 68, 50, 74, 62, 42]
  });

  const bots = {};
  bots.hunter = await chromaKey('bot-hunter-raw.png', 'bot-hunter', 54);
  bots.wasp = await chromaKey('bot-wasp-raw.png', 'bot-wasp', 38);

  // patch run heights (uniform standing height for the whole cycle)
  const runJsonPath = path.join(OUT, 'hero-run.json');
  const runJson = JSON.parse(fs.readFileSync(runJsonPath));
  const refH = Math.max(...runJson.frames.map(f => f.h));
  runJson.refH = refH;
  runJson.heroH = 66;                      // in-game standing height, px
  runJson.frames.forEach(f => { f.th = 66; });
  fs.writeFileSync(runJsonPath, JSON.stringify(runJson, null, 1));

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ bots, heroH: 66 }, null, 1));
  console.log('done -> assets/sprites/');
})().catch(e => { console.error(e); process.exit(1); });
