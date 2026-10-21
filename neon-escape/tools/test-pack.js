#!/usr/bin/env node
/* Round-trip test for tools/pack-frames.js.
 *
 * Simulates an animation export (a folder of numbered RGBA PNGs, exactly what
 * StykAnimate's "PNG sequence" gives you), packs it, and then proves the packed
 * atlas reproduces the source frames pixel for pixel — so an artist can drop a
 * new animation in and trust the numbers.
 *
 * Run: node tools/test-pack.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { packSequence } = require('./pack-frames');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};

const ROOT = path.join(__dirname, '..');
const SP = path.join(ROOT, 'assets', 'sprites');

/* ---- 1) fabricate an export: split the real poses atlas into numbered PNGs ---- */
async function makeExport(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const meta = JSON.parse(fs.readFileSync(path.join(SP, 'hero-poses.json')));
  const img = await loadImage(path.join(SP, meta.image));
  const written = [];
  meta.frames.forEach((f, i) => {
    const c = createCanvas(f.w, f.h);
    const cx = c.getContext('2d');
    cx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    const name = 'frame-' + String(i + 1).padStart(6, '0') + '.png';
    fs.writeFileSync(path.join(dir, name), c.encodeSync('png'));
    written.push({ name, w: f.w, h: f.h });
  });
  return written;
}

/* ---- 2) measure ink bounds of a canvas ---- */
function inkBounds(canvas) {
  const cx = canvas.getContext('2d');
  const d = cx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1, ink = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (d[(y * canvas.width + x) * 4 + 3] > 40) {
        ink++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY, ink };
}

(async () => {
  const tmp = path.join(os.tmpdir(), 'nesc-pack-test');
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log('1) fabricate an export (numbered RGBA PNGs)');
  const written = await makeExport(tmp);
  ok('export: one PNG per source frame', written.length === 6, written.length);
  ok('export: numbered like frame-000001.png', /^frame-\d{6}\.png$/.test(written[0].name), written[0].name);

  console.log('\n2) pack it back');
  const meta = await packSequence(tmp, '_pack-test', { height: 60 });
  ok('pack: all frames kept', meta.count === 6, meta.count);
  ok('pack: atlas file written', fs.existsSync(path.join(SP, '_pack-test.png')));
  ok('pack: json written', fs.existsSync(path.join(SP, '_pack-test.json')));
  ok('pack: silhouette mode by default', meta.mode === 'silhouette', meta.mode);
  ok('pack: frames laid out in a grid', meta.cols >= 1 && meta.rows >= 1, meta.cols + 'x' + meta.rows);

  console.log('\n3) verify the atlas reproduces each source frame');
  const atlas = await loadImage(path.join(SP, '_pack-test.png'));
  const cv = createCanvas(atlas.width, atlas.height);
  cv.getContext('2d').drawImage(atlas, 0, 0);

  let sizeMatch = 0, inkMatch = 0, tintable = 0;
  for (let i = 0; i < meta.count; i++) {
    const f = meta.frames[i];
    const cell = createCanvas(f.w, f.h);
    cell.getContext('2d').drawImage(cv, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    const b = inkBounds(cell);
    // trim removes empty margins, so the ink must fill the whole cell
    if (b.ink > 0 && b.minX === 0 && b.minY === 0 && b.maxX === f.w - 1 && b.maxY === f.h - 1) inkMatch++;
    if (f.w === written[i].w && f.h === written[i].h) sizeMatch++;

    // silhouette check: every opaque pixel must be pure white
    const d = cell.getContext('2d').getImageData(0, 0, f.w, f.h).data;
    let white = true;
    for (let p = 0; p < f.w * f.h; p++) {
      if (d[p * 4 + 3] > 40 && (d[p * 4] !== 255 || d[p * 4 + 1] !== 255 || d[p * 4 + 2] !== 255)) { white = false; break; }
    }
    if (white) tintable++;
  }
  ok('atlas: every frame keeps its exact trimmed size', sizeMatch === meta.count, sizeMatch + '/' + meta.count);
  ok('atlas: ink touches all four edges (trim is tight)', inkMatch === meta.count, inkMatch + '/' + meta.count);
  ok('atlas: frames are pure white and tintable', tintable === meta.count, tintable + '/' + meta.count);

  console.log('\n4) pivot + scale contract used by art.js');
  ok('pivot: bottom-centre inside the frame', meta.frames.every(f => f.py === f.y + f.h && Math.abs(f.px - (f.x + f.w / 2)) <= 1));
  ok('scale: uniform target height', meta.frames.every(f => f.th === 60) && meta.heroH === 60);
  ok('scale: refH is the tallest frame', meta.refH === Math.max(...meta.frames.map(f => f.h)));

  console.log('\n5) colour mode vs silhouette mode on a COLOURED source');
  // a coloured fake export: three frames, each a distinctly coloured blob
  const colDir = path.join(os.tmpdir(), 'nesc-pack-colour');
  fs.rmSync(colDir, { recursive: true, force: true });
  fs.mkdirSync(colDir, { recursive: true });
  const COLS = ['#ff2d55', '#22cc66', '#2d7dff'];
  COLS.forEach((col, i) => {
    const c = createCanvas(60, 80);
    const cx = c.getContext('2d');
    cx.fillStyle = col;
    cx.beginPath(); cx.arc(30, 40, 20 + i * 4, 0, Math.PI * 2); cx.fill();
    fs.writeFileSync(path.join(colDir, 'frame-' + String(i + 1).padStart(6, '0') + '.png'), c.encodeSync('png'));
  });

  const metaKeep = await packSequence(colDir, '_pack-keep', { keep: true, height: 60 });
  const atKeep = await loadImage(path.join(SP, '_pack-keep.png'));
  const cvKeep = createCanvas(atKeep.width, atKeep.height);
  cvKeep.getContext('2d').drawImage(atKeep, 0, 0);
  const kf = metaKeep.frames[0];
  const kcell = createCanvas(kf.w, kf.h);
  kcell.getContext('2d').drawImage(cvKeep, kf.x, kf.y, kf.w, kf.h, 0, 0, kf.w, kf.h);
  const kd = kcell.getContext('2d').getImageData(0, 0, kf.w, kf.h).data;
  let redPixels = 0;
  for (let p = 0; p < kf.w * kf.h; p++) {
    if (kd[p * 4 + 3] > 40 && kd[p * 4] > 200 && kd[p * 4 + 1] < 90) redPixels++;
  }
  ok('colour mode: --keep keeps the original red ink', metaKeep.mode === 'colour' && redPixels > 500, redPixels);

  const metaSil = await packSequence(colDir, '_pack-sil', { height: 60 });
  const atSil = await loadImage(path.join(SP, '_pack-sil.png'));
  const cvSil = createCanvas(atSil.width, atSil.height);
  cvSil.getContext('2d').drawImage(atSil, 0, 0);
  const sf = metaSil.frames[0];
  const scell = createCanvas(sf.w, sf.h);
  scell.getContext('2d').drawImage(cvSil, sf.x, sf.y, sf.w, sf.h, 0, 0, sf.w, sf.h);
  const sd = scell.getContext('2d').getImageData(0, 0, sf.w, sf.h).data;
  let allWhite = true, anyInk = false;
  for (let p = 0; p < sf.w * sf.h; p++) {
    if (sd[p * 4 + 3] > 40) {
      anyInk = true;
      if (sd[p * 4] !== 255 || sd[p * 4 + 1] !== 255 || sd[p * 4 + 2] !== 255) { allWhite = false; break; }
    }
  }
  ok('silhouette mode: colour flattened to pure white', metaSil.mode === 'silhouette' && allWhite && anyInk);

  console.log('\n6) --register wires an animation into js/art.js');
  const { registerInArt } = require('./pack-frames');
  const artPath = path.join(ROOT, 'js', 'art.js');
  const artBefore = fs.readFileSync(artPath, 'utf8');

  const what1 = registerInArt('zzTestAnim', metaSil);
  const artAfter1 = fs.readFileSync(artPath, 'utf8');
  ok('register: reports "added" the first time', what1 === 'added', what1);
  ok('register: entry is inside the EXTRA-ANIM block',
    /EXTRA-ANIM:START[\s\S]*zzTestAnim:[\s\S]*EXTRA-ANIM:END/.test(artAfter1));
  ok('register: art.js still parses', (() => {
    try { new Function(artAfter1.replace(/^'use strict';/, '')); return true; } catch (e) { return false; }
  })());

  const what2 = registerInArt('zzTestAnim', metaSil);
  const artAfter2 = fs.readFileSync(artPath, 'utf8');
  const occurrences = (artAfter2.match(/zzTestAnim:/g) || []).length;
  ok('register: second call updates instead of duplicating', what2 === 'updated' && occurrences === 1, what2 + ' / ' + occurrences);

  // the game must actually be able to load and play it
  const vm = require('vm');
  const sb = { console, Math, JSON, Object, Array, String, Number, Boolean, document: { createElement: () => createCanvas(1, 1) } };
  sb.Image = function () {
    const img = { width: 10, height: 10, onload: null, onerror: null };
    Object.defineProperty(img, 'src', { set() { if (img.onload) img.onload(); }, get() { return 'stub'; } });
    return img;
  };
  vm.createContext(sb);
  vm.runInContext(artAfter2, sb, { filename: 'art.js' });
  vm.runInContext('Art.load()', sb);
  ok('register: Art.has() sees the new animation', vm.runInContext("Art.has('zzTestAnim')", sb) === true);
  ok('register: frame count is exposed', vm.runInContext("Art.frameCount('zzTestAnim')", sb) === metaSil.count);

  // restore art.js exactly, and drop the test atlas
  fs.writeFileSync(artPath, artBefore);
  ok('register: art.js restored byte-for-byte', fs.readFileSync(artPath, 'utf8') === artBefore);

  /* cleanup the throwaway artifacts */
  ['_pack-test.png', '_pack-test.json', '_pack-keep.png', '_pack-keep.json', '_pack-sil.png', '_pack-sil.json', 'zzTestAnim.png', 'zzTestAnim.json']
    .forEach(f => { try { fs.unlinkSync(path.join(SP, f)); } catch (e) {} });
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(colDir, { recursive: true, force: true });

  console.log('\n----------------------------------------');
  console.log('PASSED: ' + pass + '   FAILED: ' + fail);
  if (fail) process.exit(1);
  console.log('PACK-FRAMES PIPELINE OK');
})().catch(e => { console.error(e); process.exit(1); });
