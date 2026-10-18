/* ============================================================
   BLOCK NOVA — game
   neon block puzzle: drag, blast, streak, power-ups
   ============================================================ */
'use strict';

const GRID = 8;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let vw = 0, vh = 0, dpr = 1;

/* layout (recomputed on resize) */
const L = { boardX: 0, boardY: 0, cell: 40, trayY: 0, trayCell: 22, slotW: 0 };
let cellSprites = [];

/* ============================================================
   Game
   ============================================================ */
const Game = {
  state: 'boot', // menu | playing | paused | dying | over
  mode: 'classic',
  time: 0,
  runTime: 0,

  board: new Uint8Array(GRID * GRID), // 0 empty, else palette k+1
  tray: [],
  lastSlot: 0,

  score: 0, shownScore: 0, scorePopT: 0,
  streak: 0, maxStreak: 0,
  lines: 0,
  best: { classic: 0, rush: 0 },
  stats: { games: 0, lines: 0, allclears: 0 },

  charges: { rotate: 3, bomb: 1, hammer: 1 },
  earn: { rotate: 0, bomb: 0, hammer: 0 },
  EARN_AT: { rotate: 1200, bomb: 2600, hammer: 2000 },
  CAPS: { rotate: 5, bomb: 3, hammer: 3 },
  armed: null, // 'bomb' | 'hammer' | null

  timeLeft: 120,
  lockT: 0,
  dying: 0,
  overReason: '',

  drag: null, // { slot, px, py, gx, gy, valid, moved }
  tapT: 0, tapSlot: -1,

  clearAnims: [], // { x, y(px), color, t, delay }
  popAnims: [],   // { gx, gy, t }

  hudCache: {},

  /* ---------------- lifecycle ---------------- */
  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.togglePause();
    });
    this.best.classic = Math.max(this.best.classic, 0);
    const b = store.get('bn.best', null);
    if (b) this.best = b;
    const st = store.get('bn.stats', null);
    if (st) this.stats = st;
    this.renderScores('hs-classic', 'classic');
    this.renderScores('hs-rush', 'rush');
    this.renderLifetime();
    this.enterMenu();
  },

  resize() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(vw * dpr);
    canvas.height = Math.ceil(vh * dpr);
    const safeTop = 64;
    const boardSize = Math.min(vw - 20, (vh - safeTop - 170) * 0.96, 560);
    L.cell = boardSize / GRID;
    L.boardX = (vw - boardSize) / 2;
    L.boardY = safeTop + Math.max(18, (vh - safeTop - 170 - boardSize) * 0.28);
    L.trayCell = L.cell * 0.5;
    L.trayY = Math.min(vh - 108, L.boardY + boardSize + L.cell * 0.9);
    L.slotW = L.trayCell * 5.4;
    this.buildSprites();
  },

  buildSprites() {
    cellSprites = PALETTE.map((col) => this.makeCellSprite(L.cell, col));
  },

  makeCellSprite(size, color) {
    const SS = 2;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * SS);
    const g = c.getContext('2d');
    g.scale(SS, SS);
    const m = Math.max(1.5, size * 0.045);
    const s = size - m * 2;
    const r = Math.max(3, size * 0.16);
    // glow
    g.shadowColor = color;
    g.shadowBlur = size * 0.28;
    g.fillStyle = color;
    this.roundRect(g, m, m, s, s, r);
    g.fill();
    g.shadowBlur = 0;
    // face gradient
    const grad = g.createLinearGradient(0, m, 0, m + s);
    grad.addColorStop(0, this.lighten(color, 1.45));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, this.lighten(color, 0.62));
    g.fillStyle = grad;
    this.roundRect(g, m, m, s, s, r);
    g.fill();
    // top gloss
    g.globalAlpha = 0.34;
    g.fillStyle = '#ffffff';
    this.roundRect(g, m + s * 0.14, m + s * 0.09, s * 0.72, s * 0.2, r * 0.5);
    g.fill();
    g.globalAlpha = 1;
    // inner border
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 1;
    this.roundRect(g, m + 0.5, m + 0.5, s - 1, s - 1, r);
    g.stroke();
    return c;
  },

  roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  },

  lighten(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
    const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
    const b = clamp(Math.round((n & 255) * f), 0, 255);
    return `rgb(${r},${g},${b})`;
  },

  /* ---------------- flow ---------------- */
  enterMenu() {
    this.state = 'menu';
    this.setScreen('bn-start');
    document.getElementById('hud').classList.add('hidden');
    this.renderScores('hs-classic', 'classic');
    this.renderScores('hs-rush', 'rush');
    this.renderLifetime();
  },

  startRun(mode) {
    AudioSys.init(); AudioSys.resume();
    this.mode = mode;
    this.board.fill(0);
    this.tray.length = 0;
    this.refillTray();
    this.score = 0; this.shownScore = 0;
    this.streak = 0; this.maxStreak = 0;
    this.lines = 0;
    this.charges = { rotate: 3, bomb: 1, hammer: 1 };
    this.earn = { rotate: 0, bomb: 0, hammer: 0 };
    this.armed = null;
    this.timeLeft = 120;
    this.lockT = 0;
    this.dying = 0;
    this.clearAnims.length = 0;
    this.popAnims.length = 0;
    this.drag = null;
    FX.clear();
    this.hudCache = {};
    this.runTime = 0;
    this.state = 'playing';
    this.setScreen(null);
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('mode-label').textContent = mode === 'rush' ? 'RUSH' : 'CLASSIC';
    document.getElementById('rush-timer').classList.toggle('hidden', mode !== 'rush');
    this.updateHUD(true);
  },

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.setScreen('bn-pause');
      if (this.drag) this.drag = null;
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.setScreen(null);
    }
  },

  setScreen(id) {
    for (const s of ['bn-start', 'bn-pause', 'bn-over']) {
      document.getElementById(s).classList.toggle('visible', s === id);
    }
  },

  /* ---------------- tray ---------------- */
  newPiece() {
    const s = pickShape();
    return { cells: s.cells.map(p => p.slice()), w: s.w, h: s.h, color: s.color, k: s.k, used: false, spawnT: 0 };
  },

  refillTray() {
    // fairness: reroll the set a few times so at least one piece fits
    for (let attempt = 0; attempt < 14; attempt++) {
      const set = [this.newPiece(), this.newPiece(), this.newPiece()];
      if (set.some(p => this.canFitAny(p))) {
        this.tray.length = 0;
        this.tray.push(...set);
        return;
      }
    }
    // mercy: force a single-cell piece into the set
    const single = this.newPiece();
    single.cells = [[0, 0]]; single.w = 1; single.h = 1; single.k = 2; single.color = PALETTE[2];
    this.tray.length = 0;
    this.tray.push(single, this.newPiece(), this.newPiece());
  },

  /* ---------------- board logic ---------------- */
  canPlace(p, gx, gy) {
    if (gx < 0 || gy < 0 || gx + p.w > GRID || gy + p.h > GRID) return false;
    for (const [cx, cy] of p.cells) {
      if (this.board[(gy + cy) * GRID + gx + cx]) return false;
    }
    return true;
  },

  canFitAny(p) {
    for (let gy = 0; gy <= GRID - p.h; gy++) {
      for (let gx = 0; gx <= GRID - p.w; gx++) {
        if (this.canPlace(p, gx, gy)) return true;
      }
    }
    return false;
  },

  anyMoves() {
    return this.tray.some(p => !p.used && this.canFitAny(p));
  },

  tryPlace(slot, gx, gy) {
    if (this.state !== 'playing' || this.lockT > 0) return false;
    const p = this.tray[slot];
    if (!p || p.used) return false;
    if (!this.canPlace(p, gx, gy)) return false;

    // stamp
    for (const [cx, cy] of p.cells) {
      const idx = (gy + cy) * GRID + gx + cx;
      this.board[idx] = p.k + 1;
      this.popAnims.push({ gx: gx + cx, gy: gy + cy, t: 0 });
    }
    p.used = true;
    this.lastSlot = slot;
    AudioSys.place();
    Platform2.vibrate(8);

    const cleared = this.resolveClears(gx + p.w / 2, gy + p.h / 2);

    if (!cleared) {
      this.streak = 0;
      this.addScore(p.cells.length, null);
    }

    // refill when all used
    if (this.tray.every(t => t.used)) this.refillTray();

    // classic death check
    if (this.mode === 'classic' && !this.anyMoves()) {
      this.beginDeath('NO MOVES LEFT');
    }
    return true;
  },

  /** detect & clear full rows/cols; returns count of lines or 0 */
  resolveClears(px, py) {
    const rows = [], cols = [];
    for (let y = 0; y < GRID; y++) {
      let full = true;
      for (let x = 0; x < GRID; x++) if (!this.board[y * GRID + x]) { full = false; break; }
      if (full) rows.push(y);
    }
    for (let x = 0; x < GRID; x++) {
      let full = true;
      for (let y = 0; y < GRID; y++) if (!this.board[y * GRID + x]) { full = false; break; }
      if (full) cols.push(x);
    }
    const nLines = rows.length + cols.length;
    if (nLines === 0) return 0;

    // collect unique cells
    const cellSet = new Set();
    for (const y of rows) for (let x = 0; x < GRID; x++) cellSet.add(y * GRID + x);
    for (const x of cols) for (let y = 0; y < GRID; y++) cellSet.add(y * GRID + x);

    // clear + animate
    const cx = this.boardXY().x + GRID * L.cell / 2;
    const cy = this.boardXY().y + GRID * L.cell / 2;
    let i = 0;
    for (const idx of cellSet) {
      const k = this.board[idx];
      const gx = idx % GRID, gy = (idx / GRID) | 0;
      this.board[idx] = 0;
      const delay = (i % 7) * 0.016 + ((i / 7) | 0) * 0.02;
      this.clearAnims.push({
        x: this.cellCX(gx), y: this.cellCY(gy),
        color: PALETTE[k - 1], t: 0, delay
      });
      i++;
    }

    // streak & score
    this.streak++;
    this.maxStreak = Math.max(this.maxStreak, this.streak);
    this.lines += nLines;
    this.stats.lines++;
    const mult = 1 + 0.5 * (this.streak - 1);
    const base = cellSet.size * 10 + nLines * 100;
    const gained = Math.round(base * mult);
    this.addScore(gained, null);

    // juice
    const midY = rows.length ? this.cellCY(rows[0] + 0.5) : cy;
    const label = nLines >= 2 ? (nLines + 'x BLAST!') : 'BLAST!';
    FX.text(cx, midY - L.cell * 1.4, label + (this.streak > 1 ? '  x' + this.streak : ''), this.streak > 1 ? '#ffb84d' : '#9feeff', 20 + Math.min(nLines * 3, 12));
    FX.addShake(2 + nLines * 2.2 + Math.min(this.streak, 6));
    FX.ring(cx, midY, '#ffffff', L.cell * 2.2, 0.3);
    AudioSys.clear(nLines, this.streak);
    Platform2.vibrate(nLines >= 2 ? 35 : 15);
    if (this.streak >= 3) this.banner('STREAK x' + this.streak + '!');
    this.lockT = 0.2;

    // rush time bonus
    if (this.mode === 'rush') {
      this.timeLeft = Math.min(180, this.timeLeft + 2 * nLines);
    }

    // all clear bonus
    let isEmpty = true;
    for (let j = 0; j < this.board.length; j++) if (this.board[j]) { isEmpty = false; break; }
    if (isEmpty) {
      this.addScore(500, null);
      this.stats.allclears++;
      this.grantCharge('bomb', true);
      FX.confetti(cx, cy, '#ffb84d', 26);
      FX.confetti(cx, cy, '#35f0ff', 26);
      FX.text(cx, cy - L.cell, 'ALL CLEAR! +500', '#fff', 26);
      this.banner('ALL CLEAR!');
      AudioSys.allClear();
      FX.addShake(10);
    }
    return nLines;
  },

  boardXY() { return { x: L.boardX, y: L.boardY }; },
  cellCX(gx) { return L.boardX + (gx + 0.5) * L.cell; },
  cellCY(gy) { return L.boardY + (gy + 0.5) * L.cell; },

  addScore(n, _) {
    this.score += n;
    // charge earning progress
    for (const key of ['rotate', 'bomb', 'hammer']) {
      if (this.charges[key] >= this.CAPS[key]) continue;
      this.earn[key] += n;
      if (this.earn[key] >= this.EARN_AT[key]) {
        this.earn[key] -= this.EARN_AT[key];
        this.grantCharge(key, false);
      }
    }
  },

  grantCharge(key, free) {
    if (this.charges[key] >= this.CAPS[key]) return;
    this.charges[key]++;
    AudioSys.powerGain();
    FX.text(vw / 2, L.trayY - 40, (key === 'rotate' ? '\u21BB ROTATE' : key === 'bomb' ? '\uD83D\uDCA5 BOMB' : '\uD83D\uDD28 HAMMER') + ' +1', '#ffb84d', 17);
  },

  /* ---------------- power-ups ---------------- */
  rotateTray(slot) {
    if (this.state !== 'playing') return;
    const p = this.tray[slot];
    if (!p || p.used) return;
    if (this.charges.rotate <= 0) { AudioSys.invalid(); return; }
    const r = rotatedCells(p.cells);
    p.cells = r.cells; p.w = r.w; p.h = r.h;
    p.spawnT = 0.12; // little re-pop
    this.charges.rotate--;
    AudioSys.rotate();
    Platform2.vibrate(10);
  },

  armPower(kind) {
    if (this.state !== 'playing') return;
    if (this.armed === kind) { this.armed = null; AudioSys.ui(); return; }
    if (this.charges[kind] <= 0) { AudioSys.invalid(); return; }
    this.armed = kind;
    this.drag = null;
    AudioSys.ui();
  },

  useBomb(gx, gy) {
    if (this.state !== 'playing' || this.charges.bomb <= 0) return false;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = gx + dx, y = gy + dy;
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
        const idx = y * GRID + x;
        if (this.board[idx]) {
          n++;
          this.clearAnims.push({ x: this.cellCX(x), y: this.cellCY(y), color: PALETTE[this.board[idx] - 1], t: 0, delay: rand(0, 0.05) });
          this.board[idx] = 0;
        }
      }
    }
    if (!n) { AudioSys.invalid(); return false; }
    this.charges.bomb--;
    this.armed = null;
    const cx = this.cellCX(gx), cy = this.cellCY(gy);
    FX.glowBurst(cx, cy, '#ff7b3d', 16, 380);
    FX.sparks(cx, cy, '#ffd24d', 12, 420);
    FX.ring(cx, cy, '#ff7b3d', L.cell * 2.4, 0.4);
    FX.addShake(7);
    AudioSys.bomb();
    Platform2.vibrate(45);
    this.addScore(n * 15, null);
    FX.text(cx, cy - L.cell, '+' + (n * 15), '#ff9a3d', 17);
    return true;
  },

  useHammer(gx, gy) {
    if (this.state !== 'playing' || this.charges.hammer <= 0) return false;
    const idx = gy * GRID + gx;
    if (!this.board[idx]) { AudioSys.invalid(); return false; }
    const color = PALETTE[this.board[idx] - 1];
    this.board[idx] = 0;
    this.charges.hammer--;
    this.armed = null;
    const cx = this.cellCX(gx), cy = this.cellCY(gy);
    FX.sparks(cx, cy, color, 10, 340);
    FX.ring(cx, cy, '#ffffff', L.cell, 0.25);
    FX.addShake(3);
    AudioSys.hammer();
    Platform2.vibrate(20);
    this.addScore(25, null);
    FX.text(cx, cy - L.cell * 0.6, '+25', '#9feeff', 15);
    return true;
  },

  /* ---------------- death / over ---------------- */
  beginDeath(reason) {
    if (this.state !== 'playing') return;
    this.state = 'dying';
    this.overReason = reason;
    this.dying = 1.0;
    this.drag = null;
    this.armed = null;
    this.banner(reason);
    AudioSys.gameOver();
    Platform2.vibrate([60, 40, 60]);
    // crumble the board
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const k = this.board[gy * GRID + gx];
        if (k) {
          this.clearAnims.push({ x: this.cellCX(gx), y: this.cellCY(gy), color: PALETTE[k - 1], t: 0, delay: rand(0, 0.5) });
        }
      }
    }
    this.board.fill(0);
  },

  finishOver() {
    this.state = 'over';
    const isNewBest = this.score > (this.best[this.mode] || 0);
    if (isNewBest) {
      this.best[this.mode] = this.score;
      store.set('bn.best', this.best);
    }
    this.stats.games++;
    store.set('bn.stats', this.stats);

    // top-5 table
    const key = 'bn.scores.' + this.mode;
    const list = store.get(key, []);
    list.push({ s: this.score, lines: this.lines, d: Date.now() });
    list.sort((a, b) => b.s - a.s);
    store.set(key, list.slice(0, 5));

    document.getElementById('over-title').textContent = this.overReason || 'GAME OVER';
    document.getElementById('bn-new-best').classList.toggle('hidden', !isNewBest || this.score === 0);
    document.getElementById('ov-score').textContent = fmtNum(this.score);
    document.getElementById('ov-lines').textContent = this.lines;
    document.getElementById('ov-streak').textContent = 'x' + Math.max(1, this.maxStreak);
    document.getElementById('ov-best').textContent = fmtNum(this.best[this.mode] || 0);
    document.getElementById('ov-hs-title').textContent = (this.mode === 'rush' ? 'RUSH' : 'CLASSIC') + ' TOP 5';
    this.renderScores('ov-hs', this.mode);
    document.getElementById('hud').classList.add('hidden');
    this.setScreen('bn-over');
    if (isNewBest && this.score > 0) setTimeout(() => AudioSys.newBest(), 350);
  },

  /* ---------------- persistence UI ---------------- */
  renderScores(elId, mode) {
    const el = document.getElementById(elId);
    if (!el) return;
    const list = store.get('bn.scores.' + mode, []);
    if (!list.length) {
      el.innerHTML = '<div class="hs-row empty">NO RUNS YET</div>';
      return;
    }
    let html = '';
    for (let i = 0; i < list.length; i++) {
      html += `<div class="hs-row${i === 0 ? ' first' : ''}"><span class="rank">${i + 1}</span><span class="score">${fmtNum(list[i].s)}</span><span class="sub">${list[i].lines} lines</span></div>`;
    }
    el.innerHTML = html;
  },

  renderLifetime() {
    const el = document.getElementById('bn-stats');
    if (el) el.textContent = `LIFETIME: ${fmtNum(this.stats.lines || 0)} LINES \u2022 ${this.stats.allclears || 0} ALL-CLEARS \u2022 ${this.stats.games || 0} GAMES`;
  },

  banner(text) {
    const el = document.getElementById('bn-banner');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  },

  /* ============================================================
     UPDATE
     ============================================================ */
  update(dt) {
    this.time += dt;
    if (this.state !== 'playing' && this.state !== 'dying') return;
    this.runTime += dt;

    if (this.lockT > 0) this.lockT -= dt;

    // dying sequence
    if (this.state === 'dying') {
      this.dying -= dt;
      if (this.dying <= 0) this.finishOver();
    }

    // rush timer
    if (this.state === 'playing' && this.mode === 'rush') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.beginDeath('TIME UP');
      }
    }

    // anims
    for (let i = this.clearAnims.length - 1; i >= 0; i--) {
      const a = this.clearAnims[i];
      if (a.delay > 0) { a.delay -= dt; continue; }
      a.t += dt;
      if (a.t >= 0.26) {
        FX.cellPop(a.x, a.y, L.cell, a.color);
        this.clearAnims.splice(i, 1);
      }
    }
    for (let i = this.popAnims.length - 1; i >= 0; i--) {
      this.popAnims[i].t += dt;
      if (this.popAnims[i].t >= 0.18) this.popAnims.splice(i, 1);
    }
    for (const p of this.tray) if (p.spawnT < 1) p.spawnT = Math.min(1, p.spawnT + dt * 5);

    FX.update(dt);
  },

  /* ============================================================
     RENDER
     ============================================================ */
  render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    if (this.state === 'menu') { this.renderMenuBg(); return; }

    ctx.save();
    ctx.translate(FX.shakeX, FX.shakeY);

    this.renderBoard();
    if (this.state === 'playing') this.renderTray();
    if (this.drag) this.renderDrag();

    ctx.globalCompositeOperation = 'lighter';
    FX.drawAdditive(ctx);
    ctx.globalCompositeOperation = 'source-over';
    FX.drawTexts(ctx);
    ctx.restore();
  },

  renderMenuBg() {
    // ambient floating blocks behind the menu (sprites pre-rendered once)
    if (!this._menuBlocks) {
      this._menuBlocks = [];
      for (let i = 0; i < 14; i++) {
        const size = rand(18, 46);
        const col = PALETTE[(Math.random() * PALETTE.length) | 0];
        this._menuBlocks.push({
          x: rand(vw), y: rand(vh), s: size,
          spr: this.makeCellSprite(size, col),
          vx: rand(-14, 14), vy: rand(-10, 10), rot: rand(TAU), vr: rand(-0.4, 0.4)
        });
      }
    }
    const t = this.time;
    ctx.save();
    for (const b of this._menuBlocks) {
      b.x += b.vx * 0.016; b.y += b.vy * 0.016; b.rot += b.vr * 0.016;
      if (b.x < -60) b.x = vw + 50; if (b.x > vw + 60) b.x = -50;
      if (b.y < -60) b.y = vh + 50; if (b.y > vh + 60) b.y = -50;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot + Math.sin(t + b.s) * 0.08);
      ctx.globalAlpha = 0.14;
      ctx.drawImage(b.spr, -b.s / 2, -b.s / 2, b.s, b.s);
      ctx.restore();
    }
    ctx.restore();
  },

  renderBoard() {
    const { boardX, boardY, cell } = L;

    // panel
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#060b16';
    ctx.fillRect(boardX - 10, boardY - 10, cell * GRID + 20, cell * GRID + 20);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(53,240,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boardX - 10.5, boardY - 10.5, cell * GRID + 21, cell * GRID + 21);

    // slots + blocks
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const x = boardX + gx * cell, y = boardY + gy * cell;
        const k = this.board[gy * GRID + gx];
        // slot
        ctx.fillStyle = 'rgba(10, 18, 32, 0.85)';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.strokeStyle = 'rgba(53,240,255,0.06)';
        ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
        // block
        if (k) {
          const pop = this.popAnims.find(a => a.gx === gx && a.gy === gy);
          let scale = 1;
          if (pop) {
            const t = clamp(pop.t / 0.18, 0, 1);
            scale = 0.5 + 0.62 * t - 0.12 * Math.sin(t * Math.PI);
          }
          this.drawCell(x, y, cell, k - 1, scale);
        }
      }
    }

    // clearing cells
    for (const a of this.clearAnims) {
      if (a.delay > 0) continue;
      const t = clamp(a.t / 0.26, 0, 1);
      const scale = 1 - t;
      ctx.globalAlpha = 1 - t * 0.6;
      if (t < 0.4) {
        ctx.fillStyle = '#ffffff';
        this.roundRect(ctx, a.x - cell * 0.46 * (1 - t), a.y - cell * 0.46 * (1 - t), cell * 0.92 * (1 - t), cell * 0.92 * (1 - t), 4);
        ctx.fill();
      } else {
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(a.x, a.y, cell * 0.5 * scale + 2, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // drag ghost preview
    if (this.drag && this.drag.gx !== null && this.state === 'playing') {
      const p = this.tray[this.drag.slot];
      if (p && !p.used) {
        const { gx, gy, valid } = this.drag;
        for (const [cx2, cy2] of p.cells) {
          const x = boardX + (gx + cx2) * cell, y = boardY + (gy + cy2) * cell;
          if (gx + cx2 < 0 || gy + cy2 < 0 || gx + cx2 >= GRID || gy + cy2 >= GRID) continue;
          ctx.globalAlpha = valid ? 0.34 : 0.26;
          ctx.fillStyle = valid ? p.color : '#ff5470';
          this.roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, cell * 0.16);
          ctx.fill();
          ctx.globalAlpha = valid ? 0.9 : 0.8;
          ctx.strokeStyle = valid ? p.color : '#ff5470';
          ctx.lineWidth = 1.6;
          this.roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, cell * 0.16);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
  },

  drawCell(x, y, cell, k, scale) {
    const spr = cellSprites[k];
    if (!spr) return;
    if (scale >= 0.999) {
      ctx.drawImage(spr, x, y, cell, cell);
    } else {
      const s = cell * scale;
      ctx.drawImage(spr, x + (cell - s) / 2, y + (cell - s) / 2, s, s);
    }
  },

  renderTray() {
    const tc = L.trayCell;
    const slotW = L.slotW;
    const totalW = slotW * 3;
    const startX = (vw - totalW) / 2;
    for (let i = 0; i < 3; i++) {
      const p = this.tray[i];
      if (!p || p.used) continue;
      const cx = startX + slotW * i + slotW / 2;
      const bob = Math.sin(this.time * 2 + i * 1.3) * 2.5;
      const cy = L.trayY + bob;
      const scale = tc / L.cell * (p.spawnT < 1 ? 0.6 + 0.4 * p.spawnT : 1);
      const alpha = 1;
      const isLast = i === this.lastSlot;
      // slot underline
      ctx.globalAlpha = 0.25 + (isLast ? 0.2 : 0);
      ctx.strokeStyle = isLast ? '#35f0ff' : 'rgba(53,240,255,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - slotW * 0.32, cy + L.trayCell * 2.4);
      ctx.lineTo(cx + slotW * 0.32, cy + L.trayCell * 2.4);
      ctx.stroke();
      ctx.globalAlpha = 1;

      const pw = p.w * tc, ph = p.h * tc;
      const ox = cx - pw / 2, oy = cy - ph / 2;
      ctx.globalAlpha = alpha * (p.spawnT < 1 ? p.spawnT : 1);
      for (const [px, py] of p.cells) {
        const x = ox + px * tc, y = oy + py * tc;
        const spr = cellSprites[p.k];
        if (spr) ctx.drawImage(spr, x, y, tc, tc);
      }
      ctx.globalAlpha = 1;
    }
  },

  renderDrag() {
    const p = this.tray[this.drag.slot];
    if (!p || p.used) return;
    const cell = L.cell;
    const ox = this.drag.px - p.w * cell / 2;
    const oy = this.drag.py + this.dragLift() - p.h * cell / 2;
    ctx.globalAlpha = 0.95;
    for (const [px, py] of p.cells) {
      const x = ox + px * cell, y = oy + py * cell;
      const spr = cellSprites[p.k];
      if (spr) ctx.drawImage(spr, x, y, cell, cell);
    }
    ctx.globalAlpha = 1;
  },

  dragLift() {
    return IS_TOUCH ? -L.cell * 1.35 : 0;
  },

  /* ---------------- pointer input ---------------- */
  hitTray(px, py) {
    const slotW = L.slotW;
    const startX = (vw - slotW * 3) / 2;
    for (let i = 0; i < 3; i++) {
      const p = this.tray[i];
      if (!p || p.used) continue;
      const cx = startX + slotW * i + slotW / 2;
      const cy = L.trayY;
      const reach = L.trayCell * 2.6;
      if (Math.abs(px - cx) < reach && Math.abs(py - cy) < reach) return i;
    }
    return -1;
  },

  onPointerDown(e) {
    if (this.state !== 'playing') return;
    AudioSys.init(); AudioSys.resume();
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;

    // armed power: tap the board
    if (this.armed) {
      const gx = Math.floor((px - L.boardX) / L.cell);
      const gy = Math.floor((py - L.boardY) / L.cell);
      if (gx >= 0 && gy >= 0 && gx < GRID && gy < GRID) {
        if (this.armed === 'bomb') this.useBomb(gx, gy);
        else if (this.armed === 'hammer') this.useHammer(gx, gy);
        this.updateHUD(true);
      }
      return;
    }

    const slot = this.hitTray(px, py);
    if (slot >= 0) {
      // double-tap rotate
      const now = this.time;
      if (this.tapSlot === slot && now - this.tapT < 0.34) {
        this.rotateTray(slot);
        this.tapSlot = -1;
        return;
      }
      this.tapSlot = slot; this.tapT = now;
      this.lastSlot = slot;
      this.drag = { slot, px, py, gx: null, gy: null, valid: false, moved: false };
      AudioSys.grab();
    }
  },

  onPointerMove(e) {
    if (!this.drag || this.state !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    this.drag.px = e.clientX - rect.left;
    this.drag.py = e.clientY - rect.top;
    this.drag.moved = true;

    const p = this.tray[this.drag.slot];
    if (!p || p.used) { this.drag = null; return; }
    const ox = this.drag.px - p.w * L.cell / 2;
    const oy = this.drag.py + this.dragLift() - p.h * L.cell / 2;
    const gx = Math.round((ox - L.boardX) / L.cell);
    const gy = Math.round((oy - L.boardY) / L.cell);
    // only show ghost when reasonably close to the board
    const near = gx > -2 && gy > -2 && gx < GRID + 2 && gy < GRID + 2;
    if (near) {
      this.drag.gx = gx; this.drag.gy = gy;
      this.drag.valid = this.canPlace(p, gx, gy);
    } else {
      this.drag.gx = null; this.drag.gy = null; this.drag.valid = false;
    }
  },

  onPointerUp() {
    if (!this.drag || this.state !== 'playing') { this.drag = null; return; }
    const d = this.drag;
    this.drag = null;
    const p = this.tray[d.slot];
    if (!p || p.used) return;
    if (d.gx !== null && d.valid) {
      this.tryPlace(d.slot, d.gx, d.gy);
    } else if (d.moved) {
      AudioSys.invalid();
    }
  },

  /* ============================================================
     HUD
     ============================================================ */
  updateHUD(force) {
    if (this.state !== 'playing' && this.state !== 'dying' && this.state !== 'paused') return;
    const c = this.hudCache;

    if (this.shownScore !== this.score) {
      const diff = this.score - this.shownScore;
      this.shownScore += Math.ceil(diff * 0.25);
      if (this.shownScore > this.score) this.shownScore = this.score;
      const el = document.getElementById('bn-score');
      el.textContent = fmtNum(this.shownScore);
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }

    const best = Math.max(this.best[this.mode] || 0, this.score);
    const bestTxt = 'BEST ' + fmtNum(best);
    if (c.best !== bestTxt) {
      c.best = bestTxt;
      document.getElementById('bn-best').textContent = bestTxt;
    }

    const showStreak = this.streak >= 2;
    if (c.streakOn !== showStreak) {
      c.streakOn = showStreak;
      document.getElementById('bn-streak').classList.toggle('hidden', !showStreak);
    }
    if (showStreak && c.streakX !== this.streak) {
      c.streakX = this.streak;
      const el = document.getElementById('streak-x');
      el.textContent = 'x' + this.streak;
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }

    // charges
    for (const key of ['rotate', 'bomb', 'hammer']) {
      const n = this.charges[key];
      const id = key === 'rotate' ? 'pw-rot-n' : key === 'bomb' ? 'pw-bomb-n' : 'pw-ham-n';
      if (c[key + 'N'] !== n) {
        c[key + 'N'] = n;
        document.getElementById(id).textContent = '\u00d7' + n;
      }
      const btnId = key === 'rotate' ? 'pw-rotate' : key === 'bomb' ? 'pw-bomb' : 'pw-hammer';
      const btn = document.getElementById(btnId);
      const empty = n <= 0;
      if (c[key + 'Empty'] !== empty) {
        c[key + 'Empty'] = empty;
        btn.classList.toggle('empty', empty);
      }
      const armed = this.armed === key;
      if (c[key + 'Armed'] !== armed) {
        c[key + 'Armed'] = armed;
        btn.classList.toggle('armed', armed);
      }
      // earning progress
      const prog = this.charges[key] >= this.CAPS[key] ? 1 : clamp(this.earn[key] / this.EARN_AT[key], 0, 1);
      const cdId = key === 'rotate' ? 'cd-rotate' : key === 'bomb' ? 'cd-bomb' : 'cd-hammer';
      if (c[key + 'Prog'] !== prog.toFixed(2)) {
        c[key + 'Prog'] = prog.toFixed(2);
        document.getElementById(cdId).style.transform = `scaleX(${prog})`;
      }
    }

    // rush timer
    if (this.mode === 'rush') {
      const frac = clamp(this.timeLeft / 120, 0, 1);
      if (c.rushFrac !== frac.toFixed(3)) {
        c.rushFrac = frac.toFixed(3);
        document.getElementById('rush-fill').style.transform = `scaleX(${frac})`;
        const s = Math.ceil(this.timeLeft);
        document.getElementById('rush-secs').textContent = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
      }
    }
  }
};

/* lightweight platform niceties shared with the main game */
const Platform2 = {
  vibrate(pattern) {
    try {
      if (AudioSys.muted || document.hidden) return;
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* unsupported */ }
  }
};

function fmtNum(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* ============================================================
   Boot
   ============================================================ */
function wireUI() {
  const on = (id, fn) => {
    const el = document.getElementById(id);
    el.addEventListener('click', (e) => { e.preventDefault(); el.blur(); fn(); });
  };
  on('btn-classic', () => { AudioSys.init(); AudioSys.resume(); AudioSys.ui(); Game.startRun('classic'); });
  on('btn-rush', () => { AudioSys.init(); AudioSys.resume(); AudioSys.ui(); Game.startRun('rush'); });
  on('bn-resume', () => { AudioSys.ui(); Game.togglePause(); });
  on('bn-restart', () => { AudioSys.ui(); Game.startRun(Game.mode); });
  on('bn-quit', () => { AudioSys.ui(); Game.enterMenu(); });
  on('bn-again', () => { AudioSys.ui(); Game.startRun(Game.mode); });
  on('bn-menu', () => { AudioSys.ui(); Game.enterMenu(); });
  on('bn-pause', () => { if (Game.state === 'playing' || Game.state === 'paused') Game.togglePause(); });
  on('bn-mute', () => {
    AudioSys.init();
    AudioSys.setMuted(!AudioSys.muted);
    document.getElementById('bn-mute').classList.toggle('off', AudioSys.muted);
  });
  on('pw-rotate', () => Game.rotateTray(Game.lastSlot));
  on('pw-bomb', () => Game.armPower('bomb'));
  on('pw-hammer', () => Game.armPower('hammer'));

  if (AudioSys.muted) document.getElementById('bn-mute').classList.add('off');

  canvas.addEventListener('pointerdown', (e) => { Game.onPointerDown(e); e.preventDefault(); });
  canvas.addEventListener('pointermove', (e) => Game.onPointerMove(e));
  window.addEventListener('pointerup', () => Game.onPointerUp());
  window.addEventListener('pointercancel', () => { Game.drag = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // desktop keys
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (Game.state === 'playing' || Game.state === 'paused') Game.togglePause();
    } else if (e.code === 'KeyR') {
      if (Game.state === 'over') Game.startRun(Game.mode);
      else if (Game.state === 'playing') Game.rotateTray(Game.lastSlot);
    } else if (e.code === 'KeyB') Game.armPower('bomb');
    else if (e.code === 'KeyH') Game.armPower('hammer');
    else if (e.code === 'KeyM') {
      AudioSys.init();
      AudioSys.setMuted(!AudioSys.muted);
      document.getElementById('bn-mute').classList.toggle('off', AudioSys.muted);
    }
  });

  const unlock = () => { AudioSys.init(); AudioSys.resume(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;
  if (dt < 0) dt = 0;

  Game.update(dt);
  Game.render();
  Game.updateHUD();
}

Game.init();
wireUI();
requestAnimationFrame(frame);
