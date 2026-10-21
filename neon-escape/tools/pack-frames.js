#!/usr/bin/env node
/* NEON ESCAPE — PNG-sequence packer.
 *
 * Turns an exported image sequence (StykAnimate "PNG sequence", Aseprite,
 * ezgif, any tool that writes numbered RGBA PNGs) into an atlas + JSON that
 * the game loads directly through art.js.
 *
 * Why this exists: the game's hero is drawn as a plain white silhouette and
 * tinted at runtime, so every animation needs the same treatment. This tool
 * trims each frame to its ink, aligns it on a stable pivot, optionally flattens
 * it to a tintable silhouette, and writes the same schema as tools/slice.js.
 *
 * Usage
 *   node tools/pack-frames.js <input-dir> <name> [options]
 *
 * Options
 *   --keep              keep the original colours (for drones, props)
 *   --height N          on-screen height of the tallest frame, px   (default 66)
 *   --align bottom|top|center                                        (default bottom)
 *   --threshold N       alpha cut-off for "this pixel is ink"        (default 40)
 *   --cols N            override the atlas column count
 *   --register          also insert the animation into js/art.js (idempotent)
 *
 * Output
 *   assets/sprites/<name>.png    atlas
 *   assets/sprites/<name>.json   frame list + pivots + target heights
 *   ... plus a ready-to-paste SPRITES entry printed to stdout
 */
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const OUT = path.join(__dirname, '..', 'assets', 'sprites');

/* ---------------- helpers ---------------- */

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function parseArgs(argv) {
  const args = { _: [], keep: false, height: 66, align: 'bottom', threshold: 40, cols: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--keep') args.keep = true;
    else if (a === '--height') args.height = Number(argv[++i]);
    else if (a === '--align') args.align = argv[++i];
    else if (a === '--threshold') args.threshold = Number(argv[++i]);
    else if (a === '--cols') args.cols = Number(argv[++i]);
    else if (a === '--register') args.register = true;
    else if (a.startsWith('--')) throw new Error('unknown option: ' + a);
    else args._.push(a);
  }
  return args;
}

/* ---------------- packing ---------------- */

async function packSequence(inputDir, name, opts) {
  opts = Object.assign({ keep: false, height: 66, align: 'bottom', threshold: 40, cols: 0 }, opts || {});
  const pad = 2;

  if (!fs.existsSync(inputDir)) throw new Error('input folder not found: ' + inputDir);
  const files = fs.readdirSync(inputDir)
    .filter(f => /\.png$/i.test(f))
    .sort(naturalCompare);
  if (!files.length) throw new Error('no .png frames in ' + inputDir);

  // 1) decode every frame and measure its ink
  const frames = [];
  for (const file of files) {
    const img = await loadImage(path.join(inputDir, file));
    const c = createCanvas(img.width, img.height);
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    const data = cx.getImageData(0, 0, img.width, img.height).data;

    let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if (data[(y * img.width + x) * 4 + 3] > opts.threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) { minX = 0; minY = 0; maxX = img.width - 1; maxY = img.height - 1; }  // fully transparent frame

    const w = maxX - minX + 1, h = maxY - minY + 1;
    const fc = createCanvas(w, h);
    const fctx = fc.getContext('2d');
    fctx.drawImage(img, minX, minY, w, h, 0, 0, w, h);

    if (!opts.keep) {
      // flatten to a white silhouette so the skin tint can recolour it
      const fd = fctx.getImageData(0, 0, w, h);
      const d = fd.data;
      for (let p = 0; p < w * h; p++) {
        const on = d[p * 4 + 3] > opts.threshold ? 255 : 0;
        d[p * 4] = 255; d[p * 4 + 1] = 255; d[p * 4 + 2] = 255; d[p * 4 + 3] = on;
      }
      fctx.putImageData(fd, 0, 0);
    }
    frames.push({ canvas: fc, w, h, src: file });
  }

  // 2) uniform cell
  const cw = Math.max(...frames.map(f => f.w)) + pad * 2;
  const ch = Math.max(...frames.map(f => f.h)) + pad * 2;
  let cols = opts.cols || Math.max(1, Math.min(frames.length, Math.floor(2048 / cw)));
  const rows = Math.ceil(frames.length / cols);

  const atlas = createCanvas(cw * cols, ch * rows);
  const actx = atlas.getContext('2d');
  const metas = frames.map((f, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const dx = col * cw, dy = row * ch;
    let oy;
    if (opts.align === 'top') oy = dy + pad;
    else if (opts.align === 'center') oy = dy + pad + Math.round((ch - pad * 2 - f.h) / 2);
    else oy = dy + pad + (ch - pad * 2 - f.h);           // bottom
    const ox = dx + pad + Math.round((cw - pad * 2 - f.w) / 2);   // horizontally centred
    actx.drawImage(f.canvas, ox, oy);
    return {
      i, x: ox, y: oy, w: f.w, h: f.h,
      px: ox + Math.round(f.w / 2), py: oy + f.h
    };
  });

  // 3) target heights: uniform scale from the tallest frame
  const refH = Math.max(...metas.map(m => m.h));
  const th = opts.height || 66;
  metas.forEach(m => { m.th = th; });

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name + '.png'), atlas.encodeSync('png'));
  const meta = {
    image: name + '.png',
    frameW: cw, frameH: ch, cols, rows,
    count: metas.length, refH, heroH: th,
    align: opts.align, mode: opts.keep ? 'colour' : 'silhouette',
    frames: metas
  };
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(meta, null, 1));
  return meta;
}

/* ---------------- register into art.js ---------------- */

const ART_JS = path.join(__dirname, '..', 'js', 'art.js');
const BEGIN = '/* EXTRA-ANIM:START';
const END = '/* EXTRA-ANIM:END */';

function registerInArt(name, meta) {
  if (!fs.existsSync(ART_JS)) throw new Error('js/art.js not found');
  let src = fs.readFileSync(ART_JS, 'utf8');
  const b = src.indexOf(BEGIN);
  const e = src.indexOf(END);
  if (b < 0 || e < 0) throw new Error('EXTRA-ANIM markers missing from js/art.js');

  const frames = meta.frames.map(f => `{x:${f.x},y:${f.y},w:${f.w},h:${f.h}}`).join(',');
  const entry =
    `  ${name}: {\n` +
    `    file: '${meta.image}', cw: ${meta.frameW}, ch: ${meta.frameH}, refH: ${meta.refH},\n` +
    `    frames: [${frames}]\n` +
    `  },\n`;

  const block = src.slice(b, e + END.length);
  // idempotent: replace an existing entry with the same name, else append
  const re = new RegExp('  ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': \\{[\\s\\S]*?\\n  \\},\\n');
  let next;
  if (re.test(block)) next = block.replace(re, entry);
  else next = block.replace(END, entry + '  ' + END);

  src = src.slice(0, b) + next + src.slice(e + END.length);
  fs.writeFileSync(ART_JS, src);
  return re.test(block) ? 'updated' : 'added';
}

/* ---------------- CLI ---------------- */

if (require.main === module) {
  (async () => {
    let args;
    try { args = parseArgs(process.argv.slice(2)); }
    catch (e) { console.error(e.message); process.exit(2); }

    if (args._.length < 2) {
      console.log('usage: node tools/pack-frames.js <input-dir> <name> [--keep] [--height N] [--align bottom|top|center]');
      process.exit(2);
    }
    const [inputDir, name] = args._;
    const meta = await packSequence(inputDir, name, args);

    if (args.register) {
      const what = registerInArt(name, meta);
      console.log(`registered "${name}" in js/art.js (${what}) — load it with Art.drawAnim(ctx, '${name}', i, x, y, h, colour)`);
    }

    console.log(`packed ${meta.count} frames -> assets/sprites/${meta.image}`);
    console.log(`  cell ${meta.frameW}x${meta.frameH}  grid ${meta.cols}x${meta.rows}  mode ${meta.mode}  align ${meta.align}`);
    console.log('\nAdd this to SPRITES in js/art.js:\n');
    console.log(`  ${name}: {`);
    console.log(`    file: '${meta.image}',`);
    console.log(`    cw: ${meta.frameW}, ch: ${meta.frameH}, refH: ${meta.refH},`);
    console.log(`    frames: [` + meta.frames.map(f => `{x:${f.x},y:${f.y},w:${f.w},h:${f.h}}`).join(',') + `]`);
    console.log(`  },`);
  })().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
}

module.exports = { packSequence, registerInArt };
