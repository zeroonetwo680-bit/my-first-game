'use strict';
/* ============================================================
   NEON ESCAPE — levels.js
   Campaign levels as structured "beat specs" (handcrafted),
   expanded deterministically into the world by Levels.build().
   Seeded generator for Endless + Daily runs.

   Rows (tile 48px): row 9 = ground line (y=432).
     row 2-3 : air coins / gear parts (jump arcs)
     row 3   : tall lasers (timing), pistons
     row 4   : jumpable lasers, drones (slide-or-jump), wall tops
     row 5   : crates (vault), beams (slide under), drones (jump), wall bases
     row 9   : ground + saws/mines/vents/coins/start/exit  |  gaps = pits
   ============================================================ */

const Levels = {

  /* ---------------- expansion ---------------- */
  build(def) {
    const len = def.len;
    const G = [];
    for (let c = 0; c < len; c++) G[c] = '#';
    (def.gaps || []).forEach(function (g) { for (let c = g[0]; c <= g[1]; c++) G[c] = ' '; });
    G[0] = '@';
    G[len - 1] = 'E';

    const L = {
      id: def.id, name: def.name, zone: def.zone, len: len,
      width: len * TILE,
      solids: [], hazards: [], coins: [],
      start: { x: 24, y: GROUND_Y },
      exit: { x: (len - 1) * TILE + 4, y: GROUND_Y - 96, w: 40, h: 96 }
    };
    // ground solids + floor entities
    for (let c = 0; c < len; c++) {
      if (G[c] === ' ') continue;
      L.solids.push({ x: c * TILE, y: GROUND_Y, w: TILE, h: TILE, kind: 'ground' });
    }
    const crate = (c, row) => L.solids.push({ x: c * TILE, y: row === 5 ? GROUND_Y - 44 : row * TILE + 4, w: TILE, h: 44, kind: 'crate' });
    const beam = (a, b) => { for (let c = a; c <= b; c++) L.solids.push({ x: c * TILE, y: 8 * TILE, w: TILE, h: 8, kind: 'beam' }); };
    const wall = (c) => {
      L.solids.push({ x: c * TILE + 12, y: 7 * TILE, w: 24, h: TILE, kind: 'wall' });
      L.solids.push({ x: c * TILE + 12, y: 8 * TILE, w: 24, h: TILE, kind: 'wall' });
    };
    const laser = (c, row) => L.hazards.push({
      type: 'laser', x: c * TILE + TILE / 2 - 9, y: row * TILE, w: 18, h: GROUND_Y - row * TILE,
      period: 1.6, on: 0.92, phase: (c % 5) * 0.23
    });
    const saw = (c) => L.hazards.push({ type: 'saw', x: c * TILE, y: GROUND_Y - 48, w: TILE, h: 48, period: 0, on: 1, phase: c * 0.11 });
    const mine = (c) => L.hazards.push({ type: 'mine', x: c * TILE + 9, y: GROUND_Y - 28, w: 30, h: 28, period: 0, on: 1, phase: 0 });
    const vent = (c) => L.hazards.push({ type: 'vent', x: c * TILE + 10, y: GROUND_Y - 96, w: 28, h: 96, period: 1.9, on: 0.42, phase: (c % 4) * 0.37 });
    const piston = (c, row) => L.hazards.push({
      type: 'piston', x: c * TILE + 8, y: row * TILE, w: 32, h: GROUND_Y - row * TILE,
      period: 2.3, on: 0.5, phase: (c % 3) * 0.62
    });
    const drone = (c, row) => L.hazards.push({
      type: 'drone', x: c * TILE, y: row * TILE + 12, w: 44, h: 24,
      period: 0, on: 1, phase: c * 0.23, range: 140
    });
    const coin = (c, row) => L.coins.push({
      x: c * TILE + TILE / 2,
      y: row === 9 ? GROUND_Y - 28 : row * TILE + 24,
      got: false, val: 1
    });
    const part = (c, row) => L.coins.push({ x: c * TILE + TILE / 2, y: row * TILE + 24, got: false, val: 40 });

    (def.crates || []).forEach(function (c) { crate(c, 5); });
    (def.beams || []).forEach(function (b) { beam(b[0], b[1]); });
    (def.walls || []).forEach(wall);
    (def.lasers || []).forEach(function (l) { laser(l.c, l.row); });
    (def.saws || []).forEach(saw);
    (def.mines || []).forEach(mine);
    (def.vents || []).forEach(vent);
    (def.pistons || []).forEach(function (p) { piston(p.c, p.row); });
    (def.drones || []).forEach(function (d) { drone(d.c, d.row); });
    (def.parts || []).forEach(function (p) { part(p.c, p.row); });
    (def.coinArcs || []).forEach(function (a) {
      for (let c = a[0]; c <= a[1]; c++) coin(c, a[2]);
    });
    (def.floorCoins || []).forEach(function (a) {
      for (let c = a[0]; c <= a[1]; c++) coin(c, 9);
    });
    return L;
  },

  hazardRect(h, t) {
    if (h.type === 'saw' || h.type === 'mine') return h;
    if (h.type === 'drone') {
      return { x: h.x + Math.sin(t * 1.1 + h.phase) * (h.range || 140), y: h.y, w: h.w, h: h.h };
    }
    const cycle = (t + h.phase) % h.period;
    return cycle < h.on ? h : null;
  },

  maxGap(def) {
    let best = 0;
    (def.gaps || []).forEach(function (g) { best = Math.max(best, g[1] - g[0] + 1); });
    return best;
  },

  /* ---------------- handcrafted campaign (15) ---------------- */
  LIST: [
    /* ZONE 1 — LAB */
    {
      id: 'lab1', name: 'Wake Up', zone: 1, len: 100,
      gaps: [[26, 27], [50, 52], [67, 68]],
      crates: [12, 78], beams: [[40, 42]],
      coinArcs: [[25, 28, 3], [49, 52, 3], [65, 68, 3]],
      floorCoins: [[18, 20], [33, 35], [86, 90]]
    },
    {
      id: 'lab2', name: 'First Tests', zone: 1, len: 104,
      gaps: [[15, 17], [40, 42], [70, 72]],
      saws: [28, 55], vents: [33, 60], crates: [22, 48], beams: [[80, 82]],
      coinArcs: [[15, 17, 3], [40, 42, 3], [70, 72, 3]],
      floorCoins: [[8, 10], [44, 46], [88, 92]]
    },
    {
      id: 'lab3', name: 'Glass Corridor', zone: 1, len: 108,
      gaps: [[26, 27], [68, 69]],
      parts: [{ c: 62, row: 2 }],
      beams: [[20, 22], [38, 40], [56, 58], [74, 76]],
      drones: [{ c: 30, row: 4 }, { c: 52, row: 4 }, { c: 70, row: 4 }],
      crates: [12, 44, 62, 90],
      coinArcs: [[25, 28, 3], [67, 70, 3]],
      floorCoins: [[8, 12], [30, 33], [48, 51], [80, 84], [94, 98]]
    },
    {
      id: 'lab4', name: 'Laser Hall', zone: 1, len: 108,
      gaps: [[36, 38], [66, 68]],
      lasers: [{ c: 18, row: 3 }, { c: 30, row: 4 }, { c: 48, row: 3 }, { c: 60, row: 4 }, { c: 78, row: 3 }, { c: 90, row: 4 }],
      mines: [24, 54, 84], crates: [12, 42, 72],
      coinArcs: [[36, 38, 3], [66, 68, 3], [16, 20, 2], [46, 50, 2]],
      floorCoins: [[8, 10], [94, 98]]
    },
    {
      id: 'lab5', name: 'The Gate', zone: 1, len: 112,
      gaps: [[34, 36], [70, 72]],
      pistons: [{ c: 16, row: 2 }, { c: 28, row: 2 }, { c: 52, row: 2 }, { c: 64, row: 2 }, { c: 88, row: 2 }],
      saws: [22, 40, 58, 76, 96], walls: [44, 80], beams: [[84, 86]],
      parts: [{ c: 50, row: 2 }, { c: 86, row: 2 }],
      coinArcs: [[34, 36, 3], [70, 72, 3]],
      floorCoins: [[8, 12], [44, 47], [62, 66], [92, 95]]
    },

    /* ZONE 2 — REACTOR */
    {
      id: 'rea1', name: 'Steamworks', zone: 2, len: 112,
      gaps: [[20, 21], [58, 59], [92, 93]],
      vents: [12, 24, 36, 48, 60, 72, 84, 96],
      crates: [18, 42, 66, 90], beams: [[30, 32], [54, 56]],
      coinArcs: [[20, 21, 3], [58, 59, 3], [92, 93, 3]],
      floorCoins: [[8, 10], [28, 29], [64, 65], [98, 102]]
    },
    {
      id: 'rea2', name: 'Piston Alley', zone: 2, len: 116,
      gaps: [[30, 32], [56, 58], [82, 84]],
      pistons: [{ c: 12, row: 3 }, { c: 24, row: 2 }, { c: 38, row: 3 }, { c: 50, row: 2 }, { c: 64, row: 3 }, { c: 76, row: 2 }, { c: 90, row: 3 }, { c: 102, row: 2 }],
      crates: [18, 44, 70, 96],
      coinArcs: [[30, 32, 3], [56, 58, 3], [82, 84, 3]],
      floorCoins: [[8, 10], [40, 42], [66, 68], [108, 112]]
    },
    {
      id: 'rea3', name: 'Blade Run', zone: 2, len: 112, chase: true,
      gaps: [[42, 44], [68, 70]],
      saws: [14, 26, 38, 52, 64, 78, 90],
      drones: [{ c: 20, row: 4 }, { c: 46, row: 4 }, { c: 72, row: 4 }, { c: 98, row: 4 }],
      beams: [[32, 34], [58, 60], [84, 86]], crates: [10, 50, 88],
      coinArcs: [[42, 44, 3], [68, 70, 3]],
      floorCoins: [[16, 18], [30, 31], [56, 57], [92, 96]]
    },
    {
      id: 'rea4', name: 'Overheat', zone: 2, len: 116, chase: true,
      gaps: [[28, 30], [56, 58], [84, 86]],
      lasers: [{ c: 16, row: 3 }, { c: 34, row: 4 }, { c: 52, row: 3 }, { c: 70, row: 4 }, { c: 88, row: 3 }, { c: 104, row: 4 }],
      vents: [24, 44, 62, 80, 100], crates: [12, 40, 68, 96],
      parts: [{ c: 48, row: 2 }, { c: 92, row: 2 }],
      coinArcs: [[28, 30, 3], [56, 58, 3], [84, 86, 3]],
      floorCoins: [[8, 10], [36, 38], [72, 74], [108, 112]]
    },
    {
      id: 'rea5', name: 'Core Door', zone: 2, len: 120, chase: true,
      gaps: [[34, 36], [62, 64], [90, 92]],
      pistons: [{ c: 14, row: 2 }, { c: 30, row: 2 }, { c: 58, row: 2 }, { c: 86, row: 2 }],
      saws: [22, 46, 74, 100],
      drones: [{ c: 38, row: 4 }, { c: 66, row: 4 }, { c: 94, row: 4 }],
      mines: [26, 52, 80, 106], walls: [40, 68],
      parts: [{ c: 54, row: 2 }, { c: 82, row: 2 }],
      coinArcs: [[34, 36, 3], [62, 64, 3], [90, 92, 3]],
      floorCoins: [[8, 12], [48, 50], [76, 78], [110, 114]]
    },

    /* ZONE 3 — ROOFTOP EXODUS */
    {
      id: 'sky1', name: 'Surface', zone: 3, len: 116, chase: true,
      gaps: [[24, 27], [52, 55], [80, 83]],
      drones: [{ c: 16, row: 4 }, { c: 32, row: 4 }, { c: 48, row: 4 }, { c: 64, row: 4 }, { c: 80, row: 4 }, { c: 96, row: 4 }],
      crates: [12, 40, 68, 96], beams: [[20, 22], [48, 50], [76, 78]],
      coinArcs: [[24, 27, 3], [52, 55, 3], [80, 83, 3]],
      floorCoins: [[8, 10], [36, 38], [60, 62], [100, 104]]
    },
    {
      id: 'sky2', name: 'Wind Line', zone: 3, len: 112, chase: true,
      gaps: [[34, 36], [62, 64], [90, 92]],
      vents: [14, 28, 42, 56, 70, 84, 98],
      beams: [[20, 22], [48, 50], [76, 78]], crates: [10, 38, 66, 94],
      coinArcs: [[34, 36, 3], [62, 64, 3], [90, 92, 3]],
      floorCoins: [[8, 9], [24, 26], [52, 54], [100, 104]]
    },
    {
      id: 'sky3', name: 'Searchlights', zone: 3, len: 120, chase: true,
      gaps: [[32, 34], [66, 68], [98, 100]],
      lasers: [{ c: 12, row: 3 }, { c: 26, row: 3 }, { c: 44, row: 4 }, { c: 58, row: 3 }, { c: 76, row: 4 }, { c: 90, row: 3 }, { c: 104, row: 4 }],
      mines: [20, 50, 82, 110], crates: [16, 46, 78],
      parts: [{ c: 60, row: 2 }, { c: 94, row: 2 }],
      coinArcs: [[32, 34, 3], [66, 68, 3], [98, 100, 3]],
      floorCoins: [[8, 10], [40, 42], [72, 74], [112, 116]]
    },
    {
      id: 'sky4', name: 'The Chase', zone: 3, len: 116, chase: true,
      gaps: [[26, 28], [56, 58], [86, 88]],
      drones: [{ c: 12, row: 4 }, { c: 22, row: 5 }, { c: 32, row: 4 }, { c: 42, row: 5 }, { c: 52, row: 4 }, { c: 62, row: 5 }, { c: 72, row: 4 }, { c: 82, row: 5 }, { c: 92, row: 4 }],
      crates: [18, 48, 78, 104],
      coinArcs: [[26, 28, 3], [56, 58, 3], [86, 88, 3]],
      floorCoins: [[8, 10], [34, 36], [64, 66], [96, 98], [108, 112]]
    },
    {
      id: 'sky5', name: 'Freedom', zone: 3, len: 124, chase: true,
      gaps: [[28, 30], [54, 56], [82, 84], [104, 106]],
      pistons: [{ c: 14, row: 2 }, { c: 40, row: 2 }, { c: 66, row: 2 }, { c: 92, row: 2 }],
      lasers: [{ c: 24, row: 3 }, { c: 52, row: 3 }, { c: 80, row: 3 }, { c: 108, row: 3 }],
      saws: [32, 58, 84, 112], mines: [46, 72, 100],
      walls: [36, 62, 90], beams: [[20, 22], [70, 72]],
      parts: [{ c: 48, row: 2 }, { c: 76, row: 2 }, { c: 100, row: 2 }],
      coinArcs: [[28, 30, 3], [54, 56, 3], [82, 84, 3], [104, 106, 3]],
      floorCoins: [[8, 12], [42, 44], [68, 69], [94, 96], [116, 120]]
    }
  ],

  /* ---------------- seeded generator (endless / daily) ---------------- */
  GEN_BEATS: [
    function flat(r) { return { crates: [], beams: [], floorCoins: [[0, 3]] }; },
    function gap2(r) { return { gaps: [[10, 11]], coinArcs: [[10, 11, 3]] }; },
    function gap3(r) { return { gaps: [[12, 14]], coinArcs: [[12, 14, 3]] }; },
    function beams(r) { return { beams: [[4, 6], [10, 12]], coinArcs: [[4, 6, 2], [10, 12, 2]] }; },
    function sawHop(r) { return { saws: [6, 12], floorCoins: [[3, 4], [9, 10]] }; },
    function ventAlley(r) { return { vents: [5, 11], crates: [8] }; },
    function crateRun(r) { return { crates: [4, 9, 14], floorCoins: [[6, 7], [11, 12]] }; },
    function pistonHall(r) { return { pistons: [{ c: 5, row: 2 }, { c: 11, row: 2 }], coinArcs: [[7, 9, 3]] }; },
    function laserGate(r) { return { lasers: [{ c: 6, row: 3 }, { c: 11, row: 4 }], floorCoins: [[8, 9]] }; },
    function mineField(r) { return { mines: [5, 10, 15], gaps: [[7, 8]], coinArcs: [[7, 8, 3]] }; },
    function droneSpan(r) { return { drones: [{ c: 5, row: 4 }, { c: 11, row: 4 }], beams: [[7, 8]] }; },
    function platHop(r) { return { gaps: [[6, 8]], coinArcs: [[6, 8, 2]], crates: [12] }; }
  ],

  genDef(seed, segments) {
    const rnd = mulberry32(seed);
    const n = segments || 16;
    const def = {
      id: 'gen', name: 'Generated', zone: 0, len: 0,
      gaps: [], crates: [], beams: [], saws: [], mines: [], vents: [],
      lasers: [], pistons: [], drones: [], walls: [], parts: [], coinArcs: [], floorCoins: []
    };
    const push = (beat, off) => {
      (beat.gaps || []).forEach(g => def.gaps.push([g[0] + off, g[1] + off]));
      (beat.crates || []).forEach(c => def.crates.push(c + off));
      (beat.beams || []).forEach(b => def.beams.push([b[0] + off, b[1] + off]));
      (beat.saws || []).forEach(c => def.saws.push(c + off));
      (beat.mines || []).forEach(c => def.mines.push(c + off));
      (beat.vents || []).forEach(c => def.vents.push(c + off));
      (beat.lasers || []).forEach(l => def.lasers.push({ c: l.c + off, row: l.row }));
      (beat.pistons || []).forEach(p => def.pistons.push({ c: p.c + off, row: p.row }));
      (beat.drones || []).forEach(d => def.drones.push({ c: d.c + off, row: d.row }));
      (beat.coinArcs || []).forEach(a => def.coinArcs.push([a[0] + off, a[1] + off, a[2]]));
      (beat.floorCoins || []).forEach(a => def.floorCoins.push([a[0] + off, a[1] + off]));
    };
    push({ floorCoins: [[0, 3]] }, 0);
    let off = 6, last = -1;
    for (let s = 0; s < n; s++) {
      let pi = Math.floor(rnd() * this.GEN_BEATS.length);
      if (pi === last) pi = (pi + 1) % this.GEN_BEATS.length;
      last = pi;
      const beat = this.GEN_BEATS[pi](rnd);
      push(beat, off);
      off += 18;
    }
    def.len = off + 10;
    def.floorCoins.push([off + 1, off + 4]);
    return def;
  },

  generate(seed, segments) {
    return this.build(this.genDef(seed, segments));
  },

  dailySeed(ymd) { return (ymd | 0) * 7919 + 13; }
};
