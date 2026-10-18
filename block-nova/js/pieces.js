/* ============================================================
   BLOCK NOVA — piece shapes, palette, weighted bag + difficulty
   ============================================================ */
'use strict';

/* color themes — PALETTE is reassigned at runtime by Game.setTheme */
const THEMES = {
  neon:   { label: 'NEON',   palette: ['#35f0ff', '#ff3d81', '#ffb84d', '#58ff9b', '#b06cff', '#ff7b3d', '#5a8cff', '#ff5470'] },
  sunset: { label: 'SUNSET', palette: ['#ffd166', '#ff9a3d', '#ff5e5b', '#ff3d81', '#d84ddb', '#8a5cff', '#ff8fab', '#ffe3a3'] },
  toxic:  { label: 'TOXIC',  palette: ['#d0ff4d', '#8aff5e', '#35f0ff', '#00e5a0', '#58ff9b', '#5a8cff', '#a4f9c9', '#e0ffb3'] }
};
let PALETTE = THEMES.neon.palette.slice();

/* raw shape families — rotations are generated below.
   c: cells [x,y], k: palette index, w: spawn weight.
   Shapes with >=4 cells count as "big" and grow with difficulty. */
const RAW_SHAPES = [
  { c: [[0, 0]], k: 2, w: 5 },                                            // single
  { c: [[0, 0], [1, 0]], k: 0, w: 8 },                                    // I2 h
  { c: [[0, 0], [0, 1]], k: 3, w: 8 },                                    // I2 v
  { c: [[0, 0], [1, 0], [2, 0]], k: 1, w: 8 },                            // I3 h
  { c: [[0, 0], [0, 1], [0, 2]], k: 1, w: 8 },                            // I3 v
  { c: [[0, 0], [1, 0], [2, 0], [3, 0]], k: 6, w: 5 },                    // I4 h
  { c: [[0, 0], [0, 1], [0, 2], [0, 3]], k: 6, w: 5 },                    // I4 v
  { c: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], k: 5, w: 2 },            // I5 h
  { c: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], k: 5, w: 2 },            // I5 v
  { c: [[0, 0], [1, 0], [0, 1], [1, 1]], k: 2, w: 8 },                    // O2
  { c: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]], k: 1, w: 1 }, // O3
  { c: [[0, 0], [1, 0], [1, 1]], k: 3, w: 6 },                            // corner ⌜
  { c: [[0, 0], [0, 1], [1, 1]], k: 3, w: 6 },                            // corner ⌐
  { c: [[0, 0], [1, 0], [0, 1]], k: 3, w: 6 },                            // corner ⌙
  { c: [[1, 0], [0, 1], [1, 1]], k: 3, w: 6 },                            // corner ⌝
  { c: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2]], k: 0, w: 3 }, // big L
  { c: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2], [1, 3]], k: 0, w: 3 },         // big L rot
  { c: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1], [3, 1]], k: 0, w: 3 },         // big L rot
  { c: [[1, 0], [1, 1], [1, 2], [1, 3], [0, 3], [2, 3]], k: 0, w: 3 },         // big L rot
  { c: [[0, 0], [1, 0], [2, 0], [1, 1]], k: 4, w: 4 },                    // T
  { c: [[1, 0], [1, 1], [1, 2], [0, 1]], k: 4, w: 4 },                    // T rot
  { c: [[0, 1], [1, 1], [2, 1], [1, 0]], k: 4, w: 4 },                    // T rot
  { c: [[0, 0], [0, 1], [0, 2], [1, 1]], k: 4, w: 4 },                    // T rot
  { c: [[1, 0], [2, 0], [0, 1], [1, 1]], k: 6, w: 2 },                    // S
  { c: [[0, 0], [1, 0], [1, 1], [2, 1]], k: 5, w: 2 }                     // Z
];

const SHAPES = [];
(function buildShapes() {
  for (const raw of RAW_SHAPES) {
    let maxX = 0, maxY = 0;
    for (const [x, y] of raw.c) { if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
    SHAPES.push({
      cells: raw.c.map(p => p.slice()),
      w: maxX + 1,
      h: maxY + 1,
      k: raw.k,          // color resolved at piece creation (theme-aware)
      weight: raw.w,
      big: raw.c.length >= 4
    });
  }
})();

/** tiered weights: big pieces gain, small pieces shrink (floor 0.3) */
function shapeWeights(tier) {
  tier = tier || 0;
  const ws = SHAPES.map(s => Math.max(0.3, s.weight * (s.big ? 1 + 0.4 * tier : 1 - 0.13 * tier)));
  let total = 0;
  const cum = ws.map(w => (total += w, total));
  return { ws, cum, total };
}

function pickShape(tier) {
  const { cum, total } = shapeWeights(tier);
  const r = Math.random() * total;
  for (let i = 0; i < SHAPES.length; i++) {
    if (r < cum[i]) return SHAPES[i];
  }
  return SHAPES[0];
}

/** rotate shape cells 90° clockwise: (x,y) -> (maxY - y, x) */
function rotatedCells(cells) {
  let maxY = 0;
  for (const [, y] of cells) if (y > maxY) maxY = y;
  const out = cells.map(([x, y]) => [maxY - y, x]);
  let maxX = 0;
  for (const [x] of out) if (x > maxX) maxX = x;
  let mY = 0;
  for (const [, y] of out) if (y > mY) mY = y;
  return { cells: out, w: maxX + 1, h: mY + 1 };
}
