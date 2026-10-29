/* ============================================================
   NEON WRECKAGE — game
   top-down combat racing arena — canvas 2d, fixed-ish timestep
   ============================================================ */
'use strict';

const WORLD = { w: 2560, h: 2560 };
const WALL = 30; // wall thickness margin

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let vw = 0, vh = 0, dpr = 1;

/* ============================================================
   Sprites (pre-rendered once)
   ============================================================ */
const SPRITES = {};

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

function bodyPath(g, L, W) {
  const hl = L / 2, hw = W / 2;
  g.beginPath();
  g.moveTo(hl, 0);
  g.lineTo(hl * 0.52, -hw);
  g.lineTo(-hl * 0.78, -hw);
  g.quadraticCurveTo(-hl, -hw, -hl, -hw * 0.55);
  g.lineTo(-hl, hw * 0.55);
  g.quadraticCurveTo(-hl, hw, -hl * 0.78, hw);
  g.lineTo(hl * 0.52, hw);
  g.closePath();
}

function makeCarSprite(o) {
  const SS = 3, pad = 20;
  const w = o.len + pad * 2, h = o.wid + pad * 2;

  const build = (white) => {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * SS); c.height = Math.ceil(h * SS);
    const g = c.getContext('2d');
    g.scale(SS, SS);
    g.translate(w / 2, h / 2);
    const hl = o.len / 2, hw = o.wid / 2;

    // wheels
    g.fillStyle = white ? '#e8e8e8' : '#0b0f16';
    const wl = o.len * 0.22, ww = 4.6;
    for (const sy of [-1, 1]) {
      g.fillRect(hl * 0.5 - wl / 2, sy * (hw + 0.6) - ww / 2, wl, ww);
      g.fillRect(-hl * 0.55 - wl / 2, sy * (hw + 0.6) - ww / 2, wl, ww);
    }
    // glow underlay
    if (!white) {
      g.shadowColor = o.glow;
      g.shadowBlur = 16;
      g.fillStyle = o.glow;
      bodyPath(g, o.len, o.wid);
      g.fill();
      g.shadowBlur = 0;
    }
    // body
    const grad = g.createLinearGradient(0, -hw, 0, hw);
    if (white) { grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#d8d8d8'); }
    else {
      grad.addColorStop(0, shade(o.body, 1.35));
      grad.addColorStop(0.45, o.body);
      grad.addColorStop(1, shade(o.body, 0.55));
    }
    bodyPath(g, o.len, o.wid);
    g.fillStyle = grad;
    g.fill();
    // center stripe
    g.fillStyle = white ? '#aab' : o.stripe;
    g.globalAlpha = white ? 1 : 0.85;
    g.fillRect(-hl * 0.9, -1.4, o.len * 0.82, 2.8);
    g.globalAlpha = 1;
    // cockpit
    g.fillStyle = white ? '#99a' : 'rgba(8, 16, 28, 0.9)';
    g.beginPath();
    g.moveTo(hl * 0.3, -hw * 0.55);
    g.lineTo(-hl * 0.12, -hw * 0.58);
    g.lineTo(-hl * 0.34, 0);
    g.lineTo(-hl * 0.12, hw * 0.58);
    g.lineTo(hl * 0.3, hw * 0.55);
    g.closePath();
    g.fill();
    // heavy armor plating (boss)
    if (o.heavy && !white) {
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(-hl * 0.72, -hw * 1.02, o.len * 0.55, 4.5);
      g.fillRect(-hl * 0.72, hw * 1.02 - 4.5, o.len * 0.55, 4.5);
      g.strokeStyle = 'rgba(255,255,255,0.16)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(-hl * 0.38, -hw * 0.82); g.lineTo(-hl * 0.38, hw * 0.82); g.stroke();
      g.beginPath(); g.moveTo(hl * 0.42, -hw * 0.75); g.lineTo(hl * 0.42, hw * 0.75); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.22)';
      for (const bx of [-hl * 0.55, 0, hl * 0.55]) {
        g.fillRect(bx - 1.5, -hw * 0.92, 3, 3);
        g.fillRect(bx - 1.5, hw * 0.92 - 3, 3, 3);
      }
    }
    // headlights
    if (!white) {
      g.shadowColor = '#ffe9b3';
      g.shadowBlur = 8;
      g.fillStyle = '#ffefc0';
      g.fillRect(hl - 5, -hw * 0.72, 3.6, 4);
      g.fillRect(hl - 5, hw * 0.72 - 4, 3.6, 4);
      // taillights
      g.shadowColor = '#ff2040';
      g.fillStyle = '#ff3050';
      g.fillRect(-hl + 0.5, -hw * 0.7, 2.6, 3.6);
      g.fillRect(-hl + 0.5, hw * 0.7 - 3.6, 2.6, 3.6);
      g.shadowBlur = 0;
    }
    return c;
  };

  return { c: build(false), white: build(true), w, h };
}

function makePillarSprite(r) {
  const SS = 2, pad = 30;
  const size = (r + pad) * 2;
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size * SS);
  const g = c.getContext('2d');
  g.scale(SS, SS);
  g.translate(size / 2, size / 2);
  g.shadowColor = 'rgba(53,240,255,0.75)';
  g.shadowBlur = 20;
  g.fillStyle = '#0a1424';
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 3; g.strokeStyle = 'rgba(53,240,255,0.75)';
  g.beginPath(); g.arc(0, 0, r - 1.5, 0, TAU); g.stroke();
  g.lineWidth = 1; g.strokeStyle = 'rgba(53,240,255,0.25)';
  g.beginPath(); g.arc(0, 0, r * 0.62, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(53,240,255,0.10)';
  g.beginPath(); g.arc(0, 0, r * 0.3, 0, TAU); g.fill();
  return { c, w: size, h: size };
}

function makePickupSprite(color, glyph) {
  const SS = 3, size = 40;
  const c = document.createElement('canvas');
  c.width = c.height = size * SS;
  const g = c.getContext('2d');
  g.scale(SS, SS);
  g.translate(size / 2, size / 2);
  g.shadowColor = color; g.shadowBlur = 12;
  g.fillStyle = 'rgba(10, 18, 32, 0.9)';
  g.strokeStyle = color; g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU - Math.PI / 2;
    const x = Math.cos(a) * 13, y = Math.sin(a) * 13;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  g.fill(); g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = color; g.strokeStyle = color;
  switch (glyph) {
    case 'cross':
      g.fillRect(-2.6, -7, 5.2, 14); g.fillRect(-7, -2.6, 14, 5.2);
      break;
    case 'coin':
      g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill();
      g.fillStyle = 'rgba(10,18,32,1)';
      g.font = '900 9px Rajdhani, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('$', 0, 0.5);
      break;
    case 'bolt':
      g.beginPath();
      g.moveTo(2, -8); g.lineTo(-4, 1); g.lineTo(0, 1); g.lineTo(-2, 8); g.lineTo(4.5, -1.5); g.lineTo(0.5, -1.5);
      g.closePath(); g.fill();
      break;
    case 'shield':
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(0, -7.5);
      g.lineTo(6, -4.5); g.lineTo(6, 1.5);
      g.quadraticCurveTo(6, 6, 0, 8);
      g.quadraticCurveTo(-6, 6, -6, 1.5);
      g.lineTo(-6, -4.5);
      g.closePath(); g.stroke();
      break;
    case 'triple':
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.arc(i * 6.5, i === 0 ? -4 : 3, 2.6, 0, TAU);
        g.fill();
      }
      break;
  }
  return { c, w: size, h: size };
}

const PICKUP_DEFS = {
  repair: { color: '#4dff88', glyph: 'cross', label: 'HULL +35' },
  coin:   { color: '#ffd24d', glyph: 'coin',  label: '+150' },
  nitro:  { color: '#ff7b3d', glyph: 'bolt',  label: 'NITRO +50' },
  triple: { color: '#4dd9ff', glyph: 'triple', label: 'TRIPLE GUN!' },
  shield: { color: '#7fb0ff', glyph: 'shield', label: 'SHIELD UP' }
};

const ENEMY_TYPES = {
  rammer: { r: 19, hp: 26, speed: 332, accel: 560, turn: 3.1, score: 100, color: '#e0246e', glow: '#ff3d81', contact: 8, ai: 'ram', mass: 3.6 },
  gunner: { r: 20, hp: 32, speed: 300, accel: 520, turn: 3.3, score: 150, color: '#e07f22', glow: '#ff9a3d', contact: 9, ai: 'gun', fireCd: 1.6, mass: 4 },
  brute:  { r: 30, hp: 155, speed: 235, accel: 400, turn: 2.1, score: 300, color: '#8a3fd4', glow: '#b06cff', contact: 22, ai: 'ram', mass: 9 },
  inter:  { r: 18, hp: 34, speed: 400, accel: 700, turn: 3.7, score: 250, color: '#1dbb6a', glow: '#58ff9b', contact: 10, ai: 'dash', mass: 3.2 },
  boss:   { r: 40, hp: 780, speed: 250, accel: 400, turn: 1.55, score: 2500, color: '#c22a55', glow: '#ff2255', contact: 24, ai: 'boss', mass: 14 },
  bomber: { r: 16, hp: 16, speed: 452, accel: 760, turn: 3.6, score: 120, color: '#e8b420', glow: '#ffd24d', contact: 0, ai: 'bomber', mass: 2.4 },
  sniper: { r: 18, hp: 30, speed: 310, accel: 540, turn: 3.2, score: 220, color: '#5a7bff', glow: '#8fa8ff', contact: 8, ai: 'sniper', mass: 3 }
};

const PLAYER_STATS = { accel: 640, maxF: 430, turn: 3.35, grip: 8.5 };
const BOOST_STATS = { accel: 960, maxF: 650, turn: 2.9, grip: 7.0 };
const _pStats = { accel: 0, maxF: 0, turn: 0, grip: 0 };

/* ---------- adaptive quality: keeps 60fps on mid-range Android ---------- */
const QLEVELS = [
  { dprCap: 2.0,  spawn: 1.0,  scan: true },
  { dprCap: 1.5,  spawn: 0.7,  scan: true },
  { dprCap: 1.2,  spawn: 0.5,  scan: false },
  { dprCap: 1.0,  spawn: 0.32, scan: false }
];

/* ---------- roguelite upgrades: offered 1-of-3 after every cleared wave ---------- */
const UPGRADES = [
  { id: 'dmg',    icon: '\uD83D\uDCA5', name: 'HEAVY ROUNDS',   desc: '+25% gun damage',                 max: 6, apply: p => { p.mods.dmg += 0.25; } },
  { id: 'rate',   icon: '\u26A1', name: 'RAPID FIRE',     desc: '+15% fire rate',                  max: 6, apply: p => { p.mods.fireRate += 0.15; } },
  { id: 'rocket', icon: '\uD83D\uDE80', name: 'EXTRA TUBE',     desc: '+1 rocket capacity, load 1 now',  max: 3, apply: p => { p.maxRockets++; p.rockets = Math.min(p.rockets + 1, p.maxRockets); } },
  { id: 'hull',   icon: '\uD83D\uDEE1\uFE0F', name: 'ARMOR PLATING',  desc: '+25 max hull, repair 25',         max: 5, apply: p => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
  { id: 'engine', icon: '\uD83C\uDFCE\uFE0F', name: 'TURBO ENGINE',   desc: '+10% top speed & acceleration',   max: 5, apply: p => { p.mods.speed += 0.10; } },
  { id: 'grip',   icon: '\uD83C\uDF00', name: 'GRIP TIRES',     desc: '+12% turn rate',                  max: 4, apply: p => { p.mods.turn += 0.12; } },
  { id: 'nitro',  icon: '\uD83D\uDCA8', name: 'NITRO FLOW',     desc: '+50% nitro recharge',             max: 4, apply: p => { p.mods.nitroRegen += 0.5; } },
  { id: 'magnet', icon: '\uD83E\uDF22', name: 'SCRAP MAGNET',   desc: '+60% pickup pickup range',        max: 3, apply: p => { p.mods.magnet += 0.6; } },
  { id: 'gold',   icon: '\uD83D\uDCB0', name: 'BOUNTY DEAL',    desc: '+15% score from kills',           max: 5, apply: p => { p.mods.scoreMult += 0.15; } },
  { id: 'repair', icon: '\uD83D\uDD27', name: 'FIELD REPAIR',   desc: 'Repair 60 hull instantly',        max: 99, cond: p => p.hp < p.maxHp * 0.9, apply: p => { p.hp = Math.min(p.maxHp, p.hp + 60); } },
  { id: 'shotgun', icon: '\uD83D\uDD2B', name: 'SCATTER GUN',    desc: 'Unlock the shotgun \u2014 swap with Q', max: 1, cond: p => p.weapons.indexOf('shotgun') < 0, apply: p => { p.weapons.push('shotgun'); p.weapon = 'shotgun'; } }
];

/* ---------- garage: unlockable cars, bought with salvage coins ---------- */
const CARS = {
  interceptor: { name: 'INTERCEPTOR', price: 0,    desc: 'Balanced pursuit vehicle', hp: 100, speed: 1.0,  turn: 1.0,  hull5: 3, spd5: 3, grp5: 3 },
  titan:       { name: 'TITAN',       price: 600,  desc: 'Heavy plating, slower hull', hp: 160, speed: 0.9,  turn: 0.88, hull5: 5, spd5: 2, grp5: 2 },
  vortex:      { name: 'VORTEX',      price: 1000, desc: 'Overclocked racer, fragile', hp: 80,  speed: 1.18, turn: 1.15, hull5: 2, spd5: 5, grp5: 4 },
  warden:      { name: 'WARDEN',      price: 1500, desc: 'Scatter gun onboard, +1 rocket', hp: 115, speed: 1.02, turn: 1.0, hull5: 4, spd5: 3, grp5: 3, weapon: 'shotgun', rockets: 3 }
};

/* ---------- difficulty levels: separate score tables ---------- */
const DIFFS = {
  easy:    { label: 'EASY',    hp: 0.85, speed: 0.92, count: 0.8,   contact: 0.8,  score: 0.75 },
  normal:  { label: 'NORMAL',  hp: 1.0,  speed: 1.0,  count: 1.0,   contact: 1.0,  score: 1.0 },
  inferno: { label: 'INFERNO', hp: 1.2,  speed: 1.1,  count: 1.25,  contact: 1.25, score: 1.5 }
};

/* ============================================================
   Game
   ============================================================ */
const Game = {
  state: 'boot',
  time: 0,
  runTime: 0,
  timeScale: 1,
  hitStop: 0,
  deathTimer: 0,

  score: 0, shownScore: 0, scorePopT: 0,
  kills: 0,
  combo: 0, comboTimer: 0, maxCombo: 1,
  firstKillDone: false,

  wave: 0,
  spawnQueue: [],
  spawnTimer: 0,
  betweenWaves: true,
  betweenTimer: 0,

  player: null,
  enemies: [],
  pickups: [],
  portals: [],
  pillars: [],

  bullets: new Pool(() => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, team: 'p', dmg: 9, kb: 0 }), 220),
  rockets: new Pool(() => ({ active: false, x: 0, y: 0, angle: 0, speed: 0, life: 0, target: null, trailT: 0 }), 16),

  cam: { x: WORLD.w / 2, y: WORLD.h / 2, zoom: 1 },
  decals: null,
  highscores: [],
  lastEntry: null,
  hudCache: {},
  diff: store.get('nw.diff', 'normal'),
  carId: store.get('nw.car', 'interceptor'),
  carViewIdx: 0,
  bank: store.get('nw.bank', 0),
  unlocked: store.get('nw.unlocked', { interceptor: true }),
  coinsEarned: 0,
  trail: [],
  qual: { level: 0, ema: 1 / 60, timer: 0, cool: 2, goodTimer: 0 },

  /* ---------------- init ---------------- */
  init() {
    this.resize();
    this.decals = makeDecalCanvas(WORLD.w, WORLD.h);
    this.loadScores();
    this.renderScores('start-highscores');
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing' && !this.player.dead) this.togglePause();
    });
  },

  resize() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    const cap = QLEVELS[this.qual.level].dprCap;
    dpr = Math.min(window.devicePixelRatio || 1, 2, cap);
    canvas.width = Math.ceil(vw * dpr);
    canvas.height = Math.ceil(vh * dpr);
    if (typeof Render3D !== 'undefined' && Render3D.ready) Render3D.resize(vw, vh, cap);
  },

  applyQuality(level) {
    const q = this.qual;
    q.level = clamp(level, 0, QLEVELS.length - 1);
    q.cool = 3;
    q.goodTimer = 0;
    FX.spawnScale = QLEVELS[q.level].spawn;
    const sc = document.getElementById('scanlines');
    if (sc) sc.style.display = QLEVELS[q.level].scan ? '' : 'none';
    this.resize();
  },

  /* ---------------- world setup ---------------- */
  resetWorld() {
    this.enemies.length = 0;
    this.pickups.length = 0;
    this.portals.length = 0;
    this.bullets.deactivateAll();
    this.rockets.deactivateAll();
    this.spawnQueue.length = 0;
    FX.clear();
    this.decals.clear();

    const car = CARS[this.carId] || CARS.interceptor;
    this.player = {
      team: 'player', x: WORLD.w / 2, y: WORLD.h / 2,
      angle: -Math.PI / 2, turret: -Math.PI / 2,
      vx: 0, vy: 0, r: 19, mass: 4.5, def: null,
      hp: car.hp, maxHp: car.hp,
      carSpeed: car.speed, carTurn: car.turn,
      boost: 100, rockets: car.rockets != null ? car.rockets : 2, maxRockets: 3, rocketRegen: 0,
      fireCd: 0, triple: 0, shield: 0,
      boosting: false, flash: 0, skidT: 0, smokeT: 0,
      contactCd: 0, dead: false,
      weapons: car.weapon ? ['shotgun', 'gun'] : ['gun'],
      weapon: car.weapon || 'gun',
      trailT: 0,
      mods: { dmg: 1, fireRate: 1, speed: 1, turn: 1, nitroRegen: 1, magnet: 1, scoreMult: 1 },
      upgradeCounts: {}
    };
    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this.cam.zoom = clamp(Math.min(vw, vh) / 900, 0.62, 1.05);

    this.pillars = this.genPillars();
    if (typeof Render3D !== 'undefined' && Render3D.active()) Render3D.buildWorld(this);

    this.runTime = 0;
    this.score = 0; this.shownScore = 0;
    this.kills = 0;
    this.combo = 0; this.comboTimer = 0; this.maxCombo = 1;
    this.firstKillDone = false;
    this.wave = 0;
    this.betweenWaves = true;
    this.betweenTimer = 0;
    this.timeScale = 1;
    this.hitStop = 0;
    this.hudCache = {};
    this.pendingUpgrades = false;
    this.offered = [];
    this.coinsEarned = 0;
    this.trail.length = 0;
    this.damageSinceWave = false;
    this.flawlessWaves = 0;
  },

  genPillars() {
    const list = [];
    let tries = 0;
    while (list.length < 6 && tries < 300) {
      tries++;
      const r = rand(42, 62);
      const x = rand(280, WORLD.w - 280);
      const y = rand(280, WORLD.h - 280);
      if (dist2(x, y, WORLD.w / 2, WORLD.h / 2) < 420 * 420) continue;
      let ok = true;
      for (const p of list) if (dist2(x, y, p.x, p.y) < 460 * 460) { ok = false; break; }
      if (!ok) continue;
      list.push({ x, y, r, spr: makePillarSprite(r), pulse: rand(TAU) });
    }
    return list;
  },

  enterMenu() {
    this.resetWorld();
    this.state = 'menu';
    Platform.keepAwake(false);
    Platform.navPushed = false;
    setScreen('start');
    this.loadScores();
    this.syncGarage();
    Achievements.renderGrid();
    document.getElementById('hud').classList.add('hidden');
    Input.showTouchUI(false);
    // attract mode cars
    const types = ['rammer', 'gunner', 'inter', 'rammer'];
    for (const t of types) {
      const def = ENEMY_TYPES[t];
      this.enemies.push({
        type: t, def, team: 'enemy',
        x: rand(500, WORLD.w - 500), y: rand(500, WORLD.h - 500),
        angle: rand(TAU), vx: 0, vy: 0, r: def.r, mass: def.mass,
        hp: 1e9, maxHp: 1e9, fireCd: 99, contactCd: 0, retreatT: 0, flash: 0,
        seed: rand(TAU), ai: 'wander', phase: 'cruise', phaseT: 1,
        orbitDir: Math.random() < 0.5 ? 1 : -1,
        boosting: false, skidT: 0, smokeT: 0, wt: null, wander: true
      });
    }
    this.cam.zoom = 0.8;
  },

  startRun() {
    AudioSys.init(); AudioSys.resume(); AudioSys.startMusic();
    this.resetWorld();
    this.state = 'playing';
    Platform.pushNav();
    Platform.keepAwake(true);
    setScreen(null);
    document.getElementById('hud').classList.remove('hidden');
    Input.showTouchUI(IS_TOUCH);
    this.betweenTimer = 0.9;
    this.betweenWaves = true;
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
  },

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      setScreen('pause');
      Platform.keepAwake(false);
      AudioSys.engine(0, false, false);
      AudioSys.skid(0);
    } else if (this.state === 'paused') {
      this.state = 'playing';
      Platform.keepAwake(true);
      setScreen(null);
    }
  },

  toggleMute() {
    AudioSys.init();
    AudioSys.setMuted(!AudioSys.muted);
    document.getElementById('btn-mute').classList.toggle('off', AudioSys.muted);
  },

  /* ============================================================
     UPDATE
     ============================================================ */
  update(dt) {
    this.time += dt;
    if (!this.player.dead) this.runTime += dt;

    this.updatePlayer(dt);
    this.updatePortals(dt);
    if (this.state === 'playing') this.updateSpawning(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateRockets(dt);
    this.updatePickups(dt);

    // combo decay
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // wave flow
    if (this.state === 'playing') {
      if (this.betweenWaves) {
        this.betweenTimer -= dt;
        if (this.betweenTimer <= 0) {
          if (this.pendingUpgrades) {
            this.pendingUpgrades = false;
            this.openUpgradeScreen();
          } else {
            this.startWave(this.wave + 1);
          }
        }
      } else if (!this.player.dead && this.spawnQueue.length === 0 && this.portals.length === 0 && this.enemies.length === 0) {
        this.waveCleared();
      }
    }

    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt;
      if (this.trail[i].life <= 0) this.trail.splice(i, 1);
    }
    FX.update(dt);
    this.updateCamera(dt);

    const p = this.player;
    const speed01 = p.dead ? 0 : clamp(Math.hypot(p.vx, p.vy) / 650, 0, 1);
    AudioSys.engine(speed01, p.boosting && !p.dead, this.state === 'playing' && !p.dead);
  },

  updateMenu(dt) {
    this.time += dt;
    for (const e of this.enemies) this.updateEnemy(e, dt);
    for (const e of this.enemies) this.enemyWorldCollide(e, dt);
    for (let i = 0; i < this.enemies.length; i++)
      for (let j = i + 1; j < this.enemies.length; j++)
        collideCars(this.enemies[i], this.enemies[j], false);
    FX.update(dt);
    // slow orbit camera
    const cx = WORLD.w / 2 + Math.cos(this.time * 0.07) * 300;
    const cy = WORLD.h / 2 + Math.sin(this.time * 0.09) * 300;
    const k = 1 - Math.exp(-1.2 * dt);
    this.cam.x += (cx - this.cam.x) * k;
    this.cam.y += (cy - this.cam.y) * k;
    const baseZoom = clamp(Math.min(vw, vh) / 900, 0.62, 1.05) * 0.82;
    this.cam.zoom += (baseZoom - this.cam.zoom) * k;
    AudioSys.engine(0, false, false);
  },

  updateCamera(dt) {
    const p = this.player;
    const lookX = p.x + p.vx * 0.3;
    const lookY = p.y + p.vy * 0.3;
    const k = 1 - Math.exp(-5 * dt);
    this.cam.x += (lookX - this.cam.x) * k;
    this.cam.y += (lookY - this.cam.y) * k;
    const speed01 = clamp(Math.hypot(p.vx, p.vy) / 650, 0, 1);
    const baseZoom = clamp(Math.min(vw, vh) / 900, 0.62, 1.05);
    const target = baseZoom * (1 - speed01 * 0.1);
    this.cam.zoom += (target - this.cam.zoom) * (1 - Math.exp(-3 * dt));
    const hw = vw / (2 * this.cam.zoom), hh = vh / (2 * this.cam.zoom);
    this.cam.x = hw * 2 >= WORLD.w ? WORLD.w / 2 : clamp(this.cam.x, hw, WORLD.w - hw);
    this.cam.y = hh * 2 >= WORLD.h ? WORLD.h / 2 : clamp(this.cam.y, hh, WORLD.h - hh);
  },

  /* ---------------- player ---------------- */
  updatePlayer(dt) {
    const p = this.player;
    if (p.dead) return;

    // ----- drive input -----
    let throttle = 0, steer = 0;
    const drive = Input.getDrive();
    if (drive.stick) {
      const mag = Math.hypot(drive.stick.x, drive.stick.y);
      const target = Math.atan2(drive.stick.y, drive.stick.x);
      const diff = angDiff(p.angle, target);
      const tScale = clamp((mag - 0.22) / 0.78, 0, 1);
      if (Math.abs(diff) > 2.35 && mag < 0.92) {
        // reverse toward stick
        throttle = -0.85 * tScale;
        const tailDiff = angDiff(p.angle, target + Math.PI);
        steer = clamp(-tailDiff * 2.2, -1, 1);
      } else {
        throttle = tScale;
        steer = clamp(diff * 2.4, -1, 1);
      }
    } else {
      throttle = drive.throttle;
      steer = drive.steer;
    }

    // ----- boost -----
    const wantBoost = Input.getBoost() && p.boost > 2 && throttle > 0.1;
    p.boosting = wantBoost;
    if (wantBoost) p.boost = Math.max(0, p.boost - 36 * dt);
    else p.boost = Math.min(100, p.boost + 13 * p.mods.nitroRegen * dt);

    const base = wantBoost ? BOOST_STATS : PLAYER_STATS;
    const m = p.mods;
    _pStats.accel = base.accel * m.speed * p.carSpeed;
    _pStats.maxF = base.maxF * m.speed * p.carSpeed;
    _pStats.turn = base.turn * m.turn * p.carTurn;
    _pStats.grip = base.grip;
    driveCar(p, throttle, steer, dt, _pStats);

    // skid marks + sound
    const slip = Math.abs(p.vl || 0);
    const skidding = slip > 105;
    if (skidding) {
      p.skidT -= dt;
      if (p.skidT <= 0) {
        p.skidT = 0.016;
        emitSkids(p, 0.16);
      }
      FX.smoke(p.x - Math.cos(p.angle) * p.r, p.y - Math.sin(p.angle) * p.r, 1, '#3a4a5c');
    }
    AudioSys.skid(skidding ? clamp(slip / 320, 0.2, 1) : 0);

    // boost flames
    if (wantBoost) {
      const bx = p.x - Math.cos(p.angle) * p.r * 1.1;
      const by = p.y - Math.sin(p.angle) * p.r * 1.1;
      for (let i = 0; i < 2; i++) {
        FX.emit({
          x: bx + rand(-3, 3), y: by + rand(-3, 3),
          vx: -Math.cos(p.angle) * rand(120, 260) + p.vx * 0.4,
          vy: -Math.sin(p.angle) * rand(120, 260) + p.vy * 0.4,
          life: rand(0.12, 0.3), size: rand(4, 8),
          color: i ? '#35f0ff' : '#ffffff', kind: 'glow', drag: 2
        });
      }
    }

    // nitro light trail
    if (wantBoost) {
      p.trailT -= dt;
      if (p.trailT <= 0) {
        p.trailT = 0.014;
        this.trail.push({ x: p.x - Math.cos(p.angle) * p.r * 0.8, y: p.y - Math.sin(p.angle) * p.r * 0.8, life: 0.3, max: 0.3 });
        if (this.trail.length > 42) this.trail.shift();
      }
    }

    // damage smoke
    if (p.hp < 38) {
      p.smokeT -= dt;
      if (p.smokeT <= 0) {
        p.smokeT = 0.14;
        FX.smoke(p.x, p.y, 1, p.hp < 20 ? '#2a2530' : '#4a5464');
        if (p.hp < 20) FX.emit({ x: p.x, y: p.y, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.25, size: 4, color: '#ff7b3d', kind: 'glow', drag: 2 });
      }
    }

    // ----- turret / aim -----
    let desired = p.angle;
    const padAim = Input.padAim();
    if (padAim !== null) {
      desired = padAim;
    } else if (Input.mouseAiming() && !IS_TOUCH_ONLY) {
      const wx = this.cam.x + (Input.mouse.x - vw / 2) / this.cam.zoom;
      const wy = this.cam.y + (Input.mouse.y - vh / 2) / this.cam.zoom;
      desired = Math.atan2(wy - p.y, wx - p.x);
    } else {
      // auto-aim: nearest hostile inside a generous forward cone
      let found = false, bestD = 640 * 640;
      for (const e of this.enemies) {
        const d2v = dist2(p.x, p.y, e.x, e.y);
        if (d2v > bestD) continue;
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        if (Math.abs(angDiff(p.angle, a)) < 1.35) {
          bestD = d2v;
          desired = a;
          found = true;
        }
      }
      if (!found) desired = p.angle;
    }
    p.turret += angDiff(p.turret, desired) * Math.min(1, 20 * dt);

    // ----- weapon swap -----
    if (p.weapons.length > 1 && (Input.consumePressed('KeyQ') || Input.consumeSwap())) {
      this.switchWeapon();
    }

    // ----- fire -----
    p.fireCd -= dt;
    if (Input.getFire() && p.fireCd <= 0) {
      const nx = p.x + Math.cos(p.angle) * 24;
      const ny = p.y + Math.sin(p.angle) * 24;
      if (p.weapon === 'shotgun') {
        // ===== SCATTER GUN: 6 pellets, short range, heavy knockback =====
        p.fireCd = 0.72 / Math.min(p.mods.fireRate, 1.5);
        for (let i = 0; i < 6; i++) {
          const a = p.turret + (i / 5 - 0.5) * 0.4 + rand(-0.03, 0.03);
          const b = this.bullets.obtain();
          if (!b) break;
          b.active = true;
          b.x = nx + Math.cos(a) * 14; b.y = ny + Math.sin(a) * 14;
          const sp = rand(700, 900);
          b.vx = Math.cos(a) * sp + p.vx * 0.25;
          b.vy = Math.sin(a) * sp + p.vy * 0.25;
          b.life = rand(0.28, 0.36);
          b.team = 'p';
          b.dmg = 8 * p.mods.dmg;
          b.kb = 150;
        }
        FX.emit({ x: nx + Math.cos(p.turret) * 14, y: ny + Math.sin(p.turret) * 14, life: 0.09, size: 16, color: '#ffd24d', kind: 'glow', grow: 120 });
        FX.muzzle(nx + Math.cos(p.turret) * 12, ny + Math.sin(p.turret) * 12, p.turret, '#ffb84d');
        AudioSys.shotgun();
        FX.addShake(2.2);
        p.vx -= Math.cos(p.turret) * 60;
        p.vy -= Math.sin(p.turret) * 60;
      } else {
        // ===== MACHINE GUN =====
        p.fireCd = (p.triple > 0 ? 0.13 : 0.115) / p.mods.fireRate;
        const angles = p.triple > 0 ? [-0.12, 0, 0.12] : [0];
        for (const off of angles) {
          const a = p.turret + off + rand(-0.028, 0.028);
          const b = this.bullets.obtain();
          if (!b) break;
          b.active = true;
          b.x = nx + Math.cos(a) * 12; b.y = ny + Math.sin(a) * 12;
          b.vx = Math.cos(a) * 950 + p.vx * 0.35;
          b.vy = Math.sin(a) * 950 + p.vy * 0.35;
          b.life = 0.8;
          b.team = 'p';
          b.dmg = (p.triple > 0 ? 7 : 9) * p.mods.dmg;
          b.kb = 0;
        }
        FX.muzzle(nx + Math.cos(p.turret) * 10, ny + Math.sin(p.turret) * 10, p.turret, '#ffd24d');
        AudioSys.shoot();
        p.vx -= Math.cos(p.turret) * 9;
        p.vy -= Math.sin(p.turret) * 9;
      }
    }

    // ----- rockets -----
    if (p.rockets < p.maxRockets) {
      p.rocketRegen += dt;
      if (p.rocketRegen >= 9) { p.rocketRegen = 0; p.rockets++; }
    }
    if (Input.consumeRocket() && p.rockets > 0) {
      p.rockets--;
      const r = this.rockets.obtain();
      if (r) {
        r.active = true;
        r.x = p.x + Math.cos(p.turret) * 26;
        r.y = p.y + Math.sin(p.turret) * 26;
        r.angle = p.turret;
        r.speed = 360;
        r.life = 3.2;
        r.trailT = 0;
        // target: enemy nearest to aim line
        let best = null, bestScore = Infinity;
        for (const e of this.enemies) {
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          const pen = Math.abs(angDiff(p.turret, a)) * 400 + Math.hypot(e.x - p.x, e.y - p.y) * 0.4;
          if (pen < bestScore) { bestScore = pen; best = e; }
        }
        r.target = best;
      }
      AudioSys.rocket();
      FX.addShake(2.5);
    }

    // ----- timers -----
    if (p.contactCd > 0) p.contactCd -= dt;
    if (p.triple > 0) p.triple -= dt;
    if (p.shield > 0) p.shield -= dt;
    if (p.flash > 0) p.flash -= dt * 5;

    this.playerWorldCollide(p, dt);
  },

  playerWorldCollide(p, dt) {
    collideWalls(p, true);
    for (const pil of this.pillars) collidePillar(p, pil, true);
  },

  /* ---------------- enemies ---------------- */
  updateSpawning(dt) {
    if (this.betweenWaves) return;
    if (this.spawnQueue.length === 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length + this.portals.length < 11) {
      const type = this.spawnQueue.shift();
      const pos = this.findSpawnPos();
      this.portals.push({ x: pos.x, y: pos.y, type, t: 0, dur: type === 'boss' ? 1.8 : 0.9, big: type === 'boss' });
      this.spawnTimer = rand(0.45, 0.85);
    }
  },

  findSpawnPos() {
    const p = this.player;
    for (let i = 0; i < 40; i++) {
      const side = randInt(0, 3);
      const m = 170;
      let x, y;
      if (side === 0) { x = rand(m, WORLD.w - m); y = m; }
      else if (side === 1) { x = rand(m, WORLD.w - m); y = WORLD.h - m; }
      else if (side === 2) { x = m; y = rand(m, WORLD.h - m); }
      else { x = WORLD.w - m; y = rand(m, WORLD.h - m); }
      if (dist2(x, y, p.x, p.y) > 620 * 620) {
        let ok = true;
        for (const pil of this.pillars) if (dist2(x, y, pil.x, pil.y) < (pil.r + 60) * (pil.r + 60)) { ok = false; break; }
        if (ok) return { x, y };
      }
    }
    return { x: rand(200, WORLD.w - 200), y: 170 };
  },

  updatePortals(dt) {
    for (let i = this.portals.length - 1; i >= 0; i--) {
      const pt = this.portals[i];
      pt.t += dt;
      if (pt.t >= pt.dur) {
        this.portals.splice(i, 1);
        if (this.state === 'playing') this.spawnEnemy(pt.type, pt.x, pt.y);
      }
    }
  },

  spawnEnemy(type, x, y) {
    const def = ENEMY_TYPES[type];
    const hpScale = (1 + (this.wave - 1) * 0.055) * DIFFS[this.diff].hp;
    const hp = type === 'boss' ? (def.hp + this.wave * 80) * DIFFS[this.diff].hp : def.hp * hpScale;
    const e = {
      type, def, team: 'enemy',
      x, y, angle: Math.atan2(this.player.y - y, this.player.x - x),
      vx: 0, vy: 0, r: def.r, mass: def.mass,
      hp, maxHp: hp,
      fireCd: rand(0.9, 1.8), contactCd: 0, retreatT: 0, flash: 0,
      seed: rand(TAU), ai: def.ai, phase: 'cruise', phaseT: rand(0.6, 1.6),
      bphase: 'approach', rage: false,
      sphase: 'reposition', snT: rand(1, 2), aimT: 0, aimA: 0,
      fuseT: null, beepT: 0, detonated: false,
      orbitDir: Math.random() < 0.5 ? 1 : -1,
      boosting: false, skidT: 0, smokeT: 0, wander: false
    };
    this.enemies.push(e);
    FX.glowBurst(x, y, def.glow, type === 'boss' ? 26 : 12, type === 'boss' ? 420 : 300);
    FX.ring(x, y, def.glow, type === 'boss' ? 70 : 34, type === 'boss' ? 0.7 : 0.4);
    if (type === 'boss') {
      FX.addShake(6);
      banner('\u26A0 WARLORD \u26A0');
    }
  },

  startWave(n) {
    this.wave = n;
    this.betweenWaves = false;
    this.damageSinceWave = false;
    const list = [];
    if (n % 5 === 0) {
      // ===== boss wave =====
      list.push('boss');
      const minions = 1 + Math.floor(n / 5);
      for (let i = 0; i < minions; i++) {
        const r = Math.random();
        list.push(n >= 10 && r < 0.4 ? 'inter' : r < 0.6 ? 'gunner' : 'rammer');
      }
      banner('\u26A0 BOSS WAVE \u26A0');
      AudioSys.bossHorn();
    } else {
      const count = Math.min(Math.round((2 + n * 2) * DIFFS[this.diff].count), 30);
      for (let i = 0; i < count; i++) {
        const r = Math.random();
        let t = 'rammer';
        if (n >= 2 && r < 0.28) t = 'gunner';
        else if (n >= 3 && r > 0.9) t = 'brute';
        else if (n >= 4 && r >= 0.58 && r < 0.7) t = 'inter';
        else if (n >= 6 && r >= 0.7 && r < 0.8) t = 'bomber';
        else if (n >= 8 && r < 0.05) t = 'sniper';
        list.push(t);
      }
      if (n % 5 === 4) list.push('brute');
      if (n >= 9) list.push('sniper');
      banner('WAVE ' + n);
      AudioSys.waveHorn();
    }
    this.spawnQueue = list;
    this.spawnTimer = n % 5 === 0 ? 0.7 : 0.35;
  },

  waveCleared() {
    const bonus = Math.round((200 + this.wave * 100) * DIFFS[this.diff].score);
    this.coinsEarned += 10 * this.wave;
    this.score += bonus;
    FX.text(this.player.x, this.player.y - 30, 'WAVE CLEAR  +' + bonus, '#35f0ff', 20);
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 8);
    if (!this.damageSinceWave) this.flawlessWaves++;
    banner('WAVE ' + this.wave + ' CLEARED');
    AudioSys.pickup();
    this.betweenWaves = true;
    this.betweenTimer = 2.0;
    this.pendingUpgrades = true;
    Achievements.onWave(this.wave, this.flawlessWaves);
  },

  /* ---------------- garage & difficulty ---------------- */
  carList() { return Object.keys(CARS); },

  setDiff(d) {
    if (!DIFFS[d] || this.diff === d) { if (DIFFS[d]) { this.syncGarage(); } return; }
    this.diff = d;
    store.set('nw.diff', d);
    this.loadScores();
    this.syncGarage();
    AudioSys.ui();
  },

  viewCar(dir) {
    const L = this.carList();
    this.carViewIdx = (this.carViewIdx + dir + L.length) % L.length;
    this.syncGarage();
    AudioSys.ui();
  },

  selectCar(id) {
    if (!this.unlocked[id]) return false;
    this.carId = id;
    store.set('nw.car', id);
    this.syncGarage();
    return true;
  },

  buyCar(id) {
    const car = CARS[id];
    if (!car || this.unlocked[id]) return false;
    if (this.bank < car.price) return false;
    this.bank -= car.price;
    this.unlocked[id] = true;
    store.set('nw.bank', this.bank);
    store.set('nw.unlocked', this.unlocked);
    this.carId = id;
    store.set('nw.car', id);
    this.syncGarage();
    Achievements.checkGarage();
    return true;
  },

  carAction() {
    const id = this.carList()[this.carViewIdx];
    if (this.unlocked[id]) { this.selectCar(id); AudioSys.ui(); }
    else if (this.bank >= CARS[id].price) { this.buyCar(id); AudioSys.pickup(); }
  },

  syncGarage() {
    const L = this.carList();
    const id = L[this.carViewIdx] || 'interceptor';
    const car = CARS[id];
    const locked = !this.unlocked[id];
    const bars = (n) => { let r = ''; for (let i = 0; i < 5; i++) r += i < n ? '\u25AE' : '\u25AF'; return r; };
    const nameEl = document.getElementById('car-name');
    const cardEl = document.getElementById('car-card');
    const actEl = document.getElementById('car-action');
    if (!nameEl || !actEl) return;
    nameEl.textContent = car.name;
    document.getElementById('car-desc').textContent = car.desc;
    document.getElementById('car-stats').innerHTML =
      'HULL ' + bars(car.hull5) + '<br>SPEED ' + bars(car.spd5) + '<br>GRIP ' + bars(car.grp5);
    cardEl.classList.toggle('locked', locked);
    if (locked) {
      actEl.textContent = 'BUY ' + car.price + ' \u24B2';
      actEl.classList.toggle('cant', this.bank < car.price);
    } else if (this.carId === id) {
      actEl.textContent = '\u2713 SELECTED';
      actEl.classList.remove('cant');
    } else {
      actEl.textContent = 'SELECT';
      actEl.classList.remove('cant');
    }
    document.getElementById('bank-label').textContent = 'SALVAGE \u24B2 ' + fmtNum(this.bank);
    for (const b of document.querySelectorAll('.diff-btn')) {
      b.classList.toggle('active', b.dataset.diff === this.diff);
    }
    const tag = ' \u2014 ' + DIFFS[this.diff].label;
    const t1 = document.getElementById('hs-diff-tag-start');
    const t2 = document.getElementById('hs-diff-tag-over');
    if (t1) t1.textContent = tag;
    if (t2) t2.textContent = tag;
  },

  switchWeapon() {
    const p = this.player;
    if (p.weapons.length < 2) return;
    p.weapon = p.weapons[(p.weapons.indexOf(p.weapon) + 1) % p.weapons.length];
    p.fireCd = Math.max(p.fireCd, 0.28);
    AudioSys.ui();
    FX.text(p.x, p.y - 42, p.weapon === 'shotgun' ? '\uD83D\uDD2B SHOTGUN' : 'MACHINE GUN', '#b06cff', 15);
  },

  openUpgradeScreen() {
    if (this.player.dead) {
      this.pendingUpgrades = false;
      return;
    }
    const p = this.player;
    const pool = UPGRADES.filter(u => (p.upgradeCounts[u.id] || 0) < u.max && (!u.cond || u.cond(p)));
    this.offered = [];
    const bag = pool.slice();
    while (this.offered.length < 3 && bag.length > 0) {
      this.offered.push(bag.splice((Math.random() * bag.length) | 0, 1)[0]);
    }
    if (this.offered.length === 0) {
      this.betweenTimer = 0.6;
      return;
    }
    const wrap = document.getElementById('upgrade-cards');
    wrap.innerHTML = '';
    this.offered.forEach((u, i) => {
      const lv = p.upgradeCounts[u.id] || 0;
      const btn = document.createElement('button');
      btn.className = 'card';
      btn.innerHTML = '<span class="ic">' + u.icon + '</span>' +
        '<span class="nm">' + u.name + '</span>' +
        '<span class="ds">' + u.desc + '</span>' +
        '<span class="lv">' + (lv ? 'LV ' + (lv + 1) : 'NEW') + '</span>' +
        '<span class="key">' + (i + 1) + '</span>';
      btn.addEventListener('click', () => this.chooseUpgrade(i));
      wrap.appendChild(btn);
    });
    this.state = 'upgrade';
    setScreen('upgrade');
    AudioSys.ui();
  },

  chooseUpgrade(i) {
    if (this.state !== 'upgrade') return;
    const u = this.offered[i];
    if (!u) return;
    const p = this.player;
    u.apply(p);
    p.upgradeCounts[u.id] = (p.upgradeCounts[u.id] || 0) + 1;
    AudioSys.pickup();
    FX.text(p.x, p.y - 46, u.icon + ' ' + u.name, '#35f0ff', 18);
    FX.ring(p.x, p.y, '#35f0ff', 42, 0.5);
    this.offered = [];
    this.state = 'playing';
    setScreen(null);
    this.betweenTimer = 1.0;
    this.hudCache.wave = null;
  },

  updateEnemy(e, dt) {
    if (e.contactCd > 0) e.contactCd -= dt;
    if (e.flash > 0) e.flash -= dt * 5;
    const p = this.player;

    let desired = e.angle, throttle = 1;
    if (e.ai === 'wander') {
      if (!e.wt || dist2(e.x, e.y, e.wt.x, e.wt.y) < 140 * 140) {
        e.wt = { x: rand(400, WORLD.w - 400), y: rand(400, WORLD.h - 400) };
      }
      desired = Math.atan2(e.wt.y - e.y, e.wt.x - e.x);
      throttle = 0.72;
    } else if (p.dead) {
      // circle the wreck
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      desired = a + e.orbitDir * 0.9;
      throttle = 0.55;
    } else if (e.ai === 'ram') {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (e.retreatT > 0) {
        e.retreatT -= dt;
        desired = Math.atan2(e.y - p.y, e.x - p.x); // bounce away after a hit
        throttle = 0.9;
      } else {
        desired = Math.atan2(p.y - e.y, p.x - e.x) + Math.sin(this.time * 2.2 + e.seed) * 0.22;
        throttle = d > 420 ? 1.15 : 1;
      }
      e.boosting = d > 430 && e.retreatT <= 0;
    } else if (e.ai === 'gun') {
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      desired = ang + e.orbitDir * 1.15;
      if (d > 500) desired = ang;
      else if (d < 250) desired = ang + Math.PI;
      throttle = 0.85;
      e.fireCd -= dt;
      if (e.fireCd <= 0 && d < 580 && !p.dead) {
        e.fireCd = ENEMY_TYPES.gunner.fireCd * rand(0.8, 1.25) * Math.max(0.65, 1 - this.wave * 0.02);
        const t = d / 520;
        const aim = Math.atan2(p.y + p.vy * t * 0.45 - e.y, p.x + p.vx * t * 0.45 - e.x);
        const b = this.bullets.obtain();
        if (b) {
          b.active = true;
          b.x = e.x + Math.cos(aim) * 24; b.y = e.y + Math.sin(aim) * 24;
          b.vx = Math.cos(aim) * 520; b.vy = Math.sin(aim) * 520;
          b.life = 1.5; b.team = 'e'; b.dmg = 7;
        }
        FX.muzzle(e.x + Math.cos(aim) * 26, e.y + Math.sin(aim) * 26, aim, '#ff9a3d');
        AudioSys.enemyShoot();
      }
    } else if (e.ai === 'dash') {
      e.phaseT -= dt;
      if (e.phase === 'cruise') {
        desired = Math.atan2(p.y - e.y, p.x - e.x);
        throttle = 0.75;
        if (e.phaseT <= 0 && dist2(e.x, e.y, p.x, p.y) < 560 * 560) {
          e.phase = 'aim'; e.phaseT = 0.5;
        }
      } else if (e.phase === 'aim') {
        desired = Math.atan2(p.y - e.y, p.x - e.x);
        throttle = 0.05;
        if (e.phaseT <= 0) { e.phase = 'dash'; e.phaseT = 0.7; AudioSys.rocket(); }
      } else { // dash
        throttle = 1.8;
        e.boosting = true;
        if (e.phaseT <= 0) { e.phase = 'cruise'; e.phaseT = rand(1.1, 2.1); e.boosting = false; }
      }
    } else if (e.ai === 'boss') {
      // ===== BOSS: approach / volley / dash / summon, rage below 50% =====
      e.phaseT -= dt;
      const ang = Math.atan2(p.y - e.y, p.x - e.x);
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (!e.rage && e.hp < e.maxHp * 0.5) {
        e.rage = true;
        FX.ring(e.x, e.y, '#ff2255', e.r + 34, 0.6);
        FX.text(e.x, e.y - e.r - 34, 'ENRAGED!', '#ff2255', 24);
        FX.addShake(5);
        AudioSys.bossHorn();
      }
      const rage = e.rage;
      switch (e.bphase) {
        case 'volley': {
          const n = rage ? 9 : 7;
          const tt = d / 480;
          const aim = Math.atan2(p.y + p.vy * tt * 0.35 - e.y, p.x + p.vx * tt * 0.35 - e.x);
          for (let i = 0; i < n; i++) {
            const a = aim + (i / (n - 1) - 0.5) * 0.9 + rand(-0.02, 0.02);
            const b = this.bullets.obtain();
            if (!b) break;
            b.active = true;
            b.x = e.x + Math.cos(a) * e.r;
            b.y = e.y + Math.sin(a) * e.r;
            b.vx = Math.cos(a) * 480;
            b.vy = Math.sin(a) * 480;
            b.life = 1.6; b.team = 'e'; b.dmg = 8;
          }
          FX.muzzle(e.x + Math.cos(aim) * e.r, e.y + Math.sin(aim) * e.r, aim, '#ff2255');
          FX.addShake(2);
          AudioSys.enemyShoot();
          e.bphase = 'approach';
          e.phaseT = rage ? 1.5 : 2.1;
          throttle = 0.2;
          break;
        }
        case 'dash': {
          throttle = 1.9;
          e.boosting = true;
          desired = ang;
          if (e.phaseT <= 0) {
            e.bphase = 'approach';
            e.phaseT = rage ? 1.5 : 2.3;
            e.boosting = false;
          }
          break;
        }
        case 'summon': {
          throttle = 0.1;
          if (e.phaseT <= 0) {
            const kinds = rage ? ['rammer', 'bomber', 'inter'] : ['rammer', 'gunner'];
            for (let i = 0; i < kinds.length; i++) {
              const a = ang + Math.PI + (i - (kinds.length - 1) / 2) * 0.95;
              const px = clamp(e.x + Math.cos(a) * (e.r + 95), 100, WORLD.w - 100);
              const py = clamp(e.y + Math.sin(a) * (e.r + 95), 100, WORLD.h - 100);
              this.portals.push({ x: px, y: py, type: kinds[i], t: 0, dur: 0.9, big: false });
              FX.ring(px, py, ENEMY_TYPES[kinds[i]].glow, 26, 0.4);
            }
            AudioSys.waveHorn();
            e.bphase = 'approach';
            e.phaseT = rage ? 2.1 : 2.9;
          }
          break;
        }
        case 'dash_wind': {
          throttle = 0.06;
          desired = ang;
          if (e.phaseT <= 0) {
            e.bphase = 'dash';
            e.phaseT = rage ? 1.15 : 1.0;
            AudioSys.rocket();
          }
          break;
        }
        case 'volley_wind': {
          throttle = 0.12;
          desired = ang;
          if (e.phaseT <= 0) e.bphase = 'volley';
          break;
        }
        case 'summon_wind': {
          throttle = 0.1;
          if (e.phaseT <= 0) e.bphase = 'summon';
          break;
        }
        default: { // approach — pick the next attack
          desired = ang + Math.sin(this.time * 1.6 + e.seed) * 0.35;
          throttle = 0.85;
          if (e.phaseT <= 0) {
            const roll = Math.random();
            if (roll < 0.45) { e.bphase = 'volley_wind'; e.phaseT = rage ? 0.5 : 0.7; }
            else if (roll < 0.8) { e.bphase = 'dash_wind'; e.phaseT = rage ? 0.45 : 0.6; FX.ring(e.x, e.y, '#ff2255', e.r + 26, 0.5); }
            else { e.bphase = 'summon_wind'; e.phaseT = rage ? 0.4 : 0.5; }
          }
        }
      }
    } else if (e.ai === 'sniper') {
      // ===== SNIPER: keeps distance, laser telegraph, heavy shot =====
      const dxp = p.x - e.x, dyp = p.y - e.y;
      const d = Math.hypot(dxp, dyp);
      e.snT -= dt;
      if (e.sphase === 'aim') {
        desired = Math.atan2(dyp, dxp);
        throttle = 0.06;
        e.aimT = Math.min(1, e.aimT + dt / 1.6);
        e.aimA = Math.atan2(p.y + p.vy * 0.22 - e.y, p.x + p.vx * 0.22 - e.x);
        if (e.aimT >= 1 && e.snT <= 0) {
          if (!p.dead) {
            const b = this.bullets.obtain();
            if (b) {
              b.active = true;
              b.x = e.x + Math.cos(e.aimA) * e.r;
              b.y = e.y + Math.sin(e.aimA) * e.r;
              b.vx = Math.cos(e.aimA) * 920;
              b.vy = Math.sin(e.aimA) * 920;
              b.life = 1.4; b.team = 'e'; b.dmg = 13; b.kb = 0;
            }
            FX.muzzle(e.x + Math.cos(e.aimA) * e.r, e.y + Math.sin(e.aimA) * e.r, e.aimA, '#ff4d6e');
            AudioSys.sniperShot();
          }
          e.sphase = 'reposition';
          e.snT = rand(1.8, 2.6);
          e.aimT = 0;
        }
      } else {
        desired = d < 640 ? Math.atan2(-dyp, -dxp) + e.orbitDir * 0.7
          : d > 830 ? Math.atan2(dyp, dxp)
          : Math.atan2(dyp, dxp) + e.orbitDir * 1.25;
        throttle = 0.75;
        e.aimT = Math.max(0, e.aimT - dt * 2);
        if (e.snT <= 0 && d < 880 && !p.dead) { e.sphase = 'aim'; e.aimT = 0; e.snT = 1.7; }
      }
    } else if (e.ai === 'bomber') {
      // ===== BOMBER: kamikaze with fuse + beep telegraph =====
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      desired = Math.atan2(p.y - e.y, p.x - e.x) + Math.sin(this.time * 6 + e.seed) * 0.12;
      throttle = 1.25;
      if (e.fuseT !== null) {
        e.fuseT -= dt;
        e.beepT -= dt;
        if (e.beepT <= 0) {
          e.beepT = Math.max(0.08, e.fuseT * 0.22);
          AudioSys.beep();
          FX.sparks(e.x, e.y, '#ffd24d', 3, 130);
        }
        if (e.fuseT <= 0 || d < e.r + p.r + 6) this.detonateBomber(e);
      } else if (d < 175 && !p.dead) {
        e.fuseT = 0.85;
        e.beepT = 0;
      }
    }

    // pillar avoidance
    for (const pil of this.pillars) {
      const dx = pil.x - e.x, dy = pil.y - e.y;
      const d = Math.hypot(dx, dy);
      const reach = pil.r + e.r + 90;
      if (d < reach && d > 1) {
        // is pillar roughly ahead?
        const ahead = Math.cos(e.angle) * dx + Math.sin(e.angle) * dy;
        if (ahead > 0) {
          const side = Math.cos(e.angle) * dy - Math.sin(e.angle) * dx;
          desired += (side > 0 ? -1 : 1) * (1 - d / reach) * 1.9;
        }
      }
    }

    const def = e.def;
    const speedScale = Math.min(1 + (this.wave - 1) * 0.02, 1.22) * DIFFS[this.diff].speed;
    const stats = e.boosting
      ? { accel: def.accel * 1.5, maxF: def.speed * speedScale * 1.18, turn: def.turn * 0.85, grip: 7.5 }
      : { accel: def.accel, maxF: def.speed * speedScale, turn: def.turn, grip: 9 };

    if (e.ai === 'boss' && e.bphase === 'dash') {
      stats.accel = def.accel * 2.4;
      stats.maxF = 660 * (e.rage ? 1.1 : 1);
      stats.turn = def.turn * 0.65;
    }

    // steering: angle-error controller for smooth AI driving
    const err = angDiff(e.angle, desired);
    const steer = clamp(err * 2.6, -1, 1);
    driveCar(e, Math.min(throttle, 1.8), steer, dt, stats);

    // fx
    const slip = Math.abs(e.vl || 0);
    if (slip > 130) {
      e.skidT -= dt;
      if (e.skidT <= 0) { e.skidT = 0.03; emitSkids(e, 0.1); }
    }
    if (e.boosting && Math.random() < 0.6) {
      const bx = e.x - Math.cos(e.angle) * e.r * 1.1;
      const by = e.y - Math.sin(e.angle) * e.r * 1.1;
      FX.emit({ x: bx, y: by, vx: -Math.cos(e.angle) * 150, vy: -Math.sin(e.angle) * 150, life: 0.2, size: 5, color: def.glow, kind: 'glow', drag: 2 });
    }

    this.enemyWorldCollide(e, dt);
  },

  enemyWorldCollide(e, dt) {
    collideWalls(e, false);
    for (const pil of this.pillars) collidePillar(e, pil, false);
  },

  updateEnemies(dt) {
    const n = this.enemies.length;
    for (let i = n - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e) continue; // chain detonations can shrink the array mid-loop
      this.updateEnemy(e, dt);
    }
    // pairwise separation
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        collideCars(this.enemies[i], this.enemies[j], false);
      }
    }
    // player vs enemies
    if (!this.player.dead) {
      for (const e of this.enemies) collideCars(this.player, e, true);
    }
  },

  /* ---------------- projectiles ---------------- */
  updateBullets(dt) {
    const items = this.bullets.items;
    const p = this.player;
    for (let i = 0; i < items.length; i++) {
      const b = items[i];
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; continue; }

      // walls
      if (b.x < WALL || b.x > WORLD.w - WALL || b.y < WALL || b.y > WORLD.h - WALL) {
        b.active = false;
        FX.sparks(b.x, b.y, b.team === 'p' ? '#9df2ff' : '#ffb35c', 4, 180);
        continue;
      }
      // pillars
      let died = false;
      for (const pil of this.pillars) {
        if (dist2(b.x, b.y, pil.x, pil.y) < pil.r * pil.r) {
          b.active = false;
          FX.sparks(b.x, b.y, '#ffd24d', 5, 200);
          died = true;
          break;
        }
      }
      if (died) continue;

      if (b.team === 'p') {
        for (const e of this.enemies) {
          const rr = e.r + 4;
          if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
            b.active = false;
            damageEnemy(e, b.dmg, b.x, b.y);
            if (b.kb) {
              const sp = Math.hypot(b.vx, b.vy) || 1;
              e.vx += b.vx / sp * b.kb / e.mass;
              e.vy += b.vy / sp * b.kb / e.mass;
            }
            break;
          }
        }
      } else if (!p.dead) {
        const rr = p.r + 3;
        if (dist2(b.x, b.y, p.x, p.y) < rr * rr) {
          b.active = false;
          damagePlayer(b.dmg, b.x, b.y);
          FX.sparks(p.x, p.y, '#ff5470', 5, 200);
        }
      }
    }
  },

  updateRockets(dt) {
    const items = this.rockets.items;
    for (let i = 0; i < items.length; i++) {
      const r = items[i];
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) { this.explodeRocket(r); continue; }
      r.speed = Math.min(820, r.speed + 950 * dt);
      if (r.target && r.target.hp > 0) {
        const desired = Math.atan2(r.target.y - r.y, r.target.x - r.x);
        const d = clamp(angDiff(r.angle, desired), -4.6 * dt, 4.6 * dt);
        r.angle += d;
      }
      r.x += Math.cos(r.angle) * r.speed * dt;
      r.y += Math.sin(r.angle) * r.speed * dt;

      // trail
      r.trailT -= dt;
      if (r.trailT <= 0) {
        r.trailT = 0.012;
        FX.emit({ x: r.x, y: r.y, vx: rand(-25, 25), vy: rand(-25, 25), life: 0.28, size: 6, color: '#ff9a3d', kind: 'glow', drag: 2.5 });
        FX.emit({ x: r.x, y: r.y, vx: rand(-14, 14), vy: rand(-14, 14), life: 0.5, size: 3.5, color: '#5a6a7a', kind: 'smoke', drag: 1.5, grow: 8 });
      }

      // detonate
      let boom = false;
      if (r.x < WALL || r.x > WORLD.w - WALL || r.y < WALL || r.y > WORLD.h - WALL) boom = true;
      if (!boom) for (const pil of this.pillars) {
        if (dist2(r.x, r.y, pil.x, pil.y) < pil.r * pil.r) { boom = true; break; }
      }
      if (!boom) for (const e of this.enemies) {
        const rr = e.r + 8;
        if (dist2(r.x, r.y, e.x, e.y) < rr * rr) { boom = true; break; }
      }
      if (boom) this.explodeRocket(r);
    }
  },

  explodeRocket(r) {
    r.active = false;
    const killsBefore = this.kills;
    const R = 135;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - r.x, e.y - r.y);
      if (d < R + e.r) {
        const dmg = 85 * (1 - clamp((d - e.r) / R, 0, 1)) + 18;
        damageEnemy(e, dmg, e.x, e.y);
        const a = Math.atan2(e.y - r.y, e.x - r.x);
        e.vx += Math.cos(a) * 260 / e.mass;
        e.vy += Math.sin(a) * 260 / e.mass;
      }
    }
    FX.explosion(r.x, r.y, '#ff9a3d', 1.8, true);
    AudioSys.explosion(true);
    FX.addShake(9);
    this.hitStop = Math.max(this.hitStop, 0.05);
    Achievements.onMultiRocket(this.kills - killsBefore);
  },

  /* ---------------- pickups ---------------- */
  updatePickups(dt) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.t += dt;
      pk.life -= dt;
      if (pk.life <= 0) { this.pickups.splice(i, 1); continue; }
      if (p.dead) continue;
      const d2v = dist2(pk.x, pk.y, p.x, p.y);
      const pullR = 150 * p.mods.magnet;
      if (d2v < pullR * pullR) {
        const d = Math.sqrt(d2v) || 1;
        const pull = 330 * dt;
        pk.x += (p.x - pk.x) / d * pull;
        pk.y += (p.y - pk.y) / d * pull;
      }
      if (d2v < (p.r + 16) * (p.r + 16)) {
        this.applyPickup(pk);
        this.pickups.splice(i, 1);
      }
    }
  },

  applyPickup(pk) {
    const p = this.player;
    const def = PICKUP_DEFS[pk.type];
    switch (pk.type) {
      case 'repair': p.hp = Math.min(p.maxHp, p.hp + 35); break;
      case 'coin': this.score += 150; this.coinsEarned += 40; break;
      case 'nitro': p.boost = Math.min(100, p.boost + 50); break;
      case 'triple': p.triple = 10; break;
      case 'shield': p.shield = 6; break;
    }
    FX.text(pk.x, pk.y, def.label, def.color, 16);
    FX.glowBurst(pk.x, pk.y, def.color, 10, 220);
    FX.ring(pk.x, pk.y, def.color, 20, 0.3);
    AudioSys.pickup();
    Platform.vibrate(8);
  },

  dropPickup(x, y) {
    let type;
    if (!this.firstKillDone) {
      type = Math.random() < 0.5 ? 'triple' : 'repair';
      this.firstKillDone = true;
    } else {
      if (Math.random() > 0.2) return;
      const roll = Math.random() * 100;
      if (roll < 28) type = 'coin';
      else if (roll < 50) type = 'repair';
      else if (roll < 70) type = 'nitro';
      else if (roll < 85) type = 'triple';
      else type = 'shield';
    }
    this.pickups.push({ x, y, type, t: rand(TAU), life: 12 });
  },

  detonateBomber(e) {
    if (e.detonated) return;
    e.detonated = true;
    const idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);
    FX.explosion(e.x, e.y, '#ffb84d', 1.35, true);
    AudioSys.explosion(false);
    FX.addShake(6);
    this.hitStop = Math.max(this.hitStop, 0.03);
    const R = 125;
    for (const o of this.enemies) {
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d < R + o.r && o !== e) {
        damageEnemy(o, 45 * (1 - clamp(d / (R + o.r), 0, 1)) + 8, o.x, o.y);
        const a = Math.atan2(o.y - e.y, o.x - e.x);
        o.vx += Math.cos(a) * 200 / o.mass;
        o.vy += Math.sin(a) * 200 / o.mass;
      }
    }
    const P = this.player;
    if (!P.dead) {
      const d = Math.hypot(P.x - e.x, P.y - e.y);
      if (d < R + P.r) {
        damagePlayer(24 * (1 - clamp(d / (R + P.r), 0, 1)) + 4, e.x, e.y);
        const a = Math.atan2(P.y - e.y, P.x - e.x);
        P.vx += Math.cos(a) * 260;
        P.vy += Math.sin(a) * 260;
        if (!P.dead) Achievements.onBombed();
      }
    }
  },

  /* ============================================================
     DAMAGE / SCORE / DEATH
     ============================================================ */
  registerKill(e) {
    this.kills++;
    this.combo = Math.min(this.combo + 1, 8);
    this.comboTimer = 3;
    this.maxCombo = Math.max(this.maxCombo, Math.max(1, this.combo));
    const mult = Math.max(1, this.combo);
    const gained = Math.round(e.def.score * mult * this.player.mods.scoreMult * DIFFS[this.diff].score);
    this.score += gained;
    FX.text(e.x, e.y, '+' + gained + (mult > 1 ? '  x' + mult : ''), mult > 1 ? '#ffd24d' : '#9feeff', mult > 1 ? 18 : 15);
    this.dropPickup(e.x, e.y);
    Achievements.onKill(e);
  },

  die() {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.boosting = false;
    this.pendingUpgrades = false;
    FX.explosion(p.x, p.y, '#35f0ff', 2.2, true);
    FX.explosion(p.x + rand(-20, 20), p.y + rand(-20, 20), '#ff9a3d', 1.4, false);
    AudioSys.explosion(true);
    Platform.vibrate([90, 60, 90]);
    FX.addShake(18);
    this.hitStop = 0.09;
    this.deathTimer = 1.5;
    AudioSys.engine(0, false, false);
    AudioSys.skid(0);
  },

  gameOver() {
    this.state = 'over';
    this.timeScale = 1;
    Platform.keepAwake(false);
    Input.showTouchUI(false);
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('name-input').value = store.get('nw.name', 'PLAYER');

    const q = this.qualifies();
    document.getElementById('save-row').classList.toggle('hidden', !q);
    document.getElementById('new-best').classList.toggle('hidden', !this.isPersonalBest());
    Achievements.onGameOver(this.score);
    this.bank += this.coinsEarned;
    store.set('nw.bank', this.bank);
    document.getElementById('stat-coins').textContent = '+' + fmtNum(this.coinsEarned);
    document.getElementById('stat-score').textContent = fmtNum(this.score);
    document.getElementById('stat-kills').textContent = this.kills;
    document.getElementById('stat-combo').textContent = 'x' + Math.max(1, this.maxCombo);
    document.getElementById('stat-wave').textContent = this.wave;
    document.getElementById('stat-time').textContent = fmtTime(this.runTime);
    this.renderScores('over-highscores');
    setScreen('over');
  },

  qualifies() {
    if (this.score <= 0) return false;
    const s = this.highscores;
    return s.length < 8 || this.score > s[s.length - 1].score;
  },

  isPersonalBest() {
    return this.score > 0 && this.highscores.length > 0 && this.score > this.highscores[0].score;
  },

  saveScore() {
    if (!this.qualifies()) return;
    const nameInput = document.getElementById('name-input');
    let name = (nameInput.value || 'PLAYER').trim().toUpperCase().slice(0, 12) || 'PLAYER';
    store.set('nw.name', name);
    const entry = { name, score: this.score, wave: this.wave, date: Date.now() };
    this.highscores.push(entry);
    this.highscores.sort((a, b) => b.score - a.score);
    this.highscores = this.highscores.slice(0, 8);
    store.set('nw.scores.' + this.diff, this.highscores);
    this.lastEntry = entry;
    document.getElementById('save-row').classList.add('hidden');
    this.renderScores('over-highscores');
    this.renderScores('start-highscores');
    AudioSys.ui();
  },

  loadScores() {
    if (!DIFFS[this.diff]) this.diff = 'normal';
    // one-time migration from the old single-table save
    const legacy = store.get('nw.scores', null);
    if (legacy && !store.get('nw.scores.normal', null)) {
      store.set('nw.scores.normal', legacy);
    }
    this.highscores = store.get('nw.scores.' + this.diff, []);
    if (!Array.isArray(this.highscores)) this.highscores = [];
  },

  renderScores(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const s = this.highscores;
    if (!s.length) {
      el.innerHTML = '<div class="hs-row empty">NO RUNS YET — BE THE FIRST</div>';
      return;
    }
    let html = '';
    for (let i = 0; i < s.length; i++) {
      const e = s[i];
      const me = this.lastEntry && e === this.lastEntry;
      html += `<div class="hs-row${me ? ' me' : ''}${i === 0 ? ' first' : ''}">` +
        `<span class="rank">${i + 1}</span>` +
        `<span class="name">${escapeHtml(e.name)}</span>` +
        `<span class="score">${fmtNum(e.score)}</span>` +
        `<span class="wv">W${e.wave || 1}</span></div>`;
    }
    el.innerHTML = html;
  },

  /* ============================================================
     RENDER
     ============================================================ */
  render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Optional three.js presentation layer. When it is live it draws the deck
    // and the cars BEHIND this canvas, so we clear to transparent and skip the
    // passes it replaces. Everything else (FX, bullets, tracers, health bars,
    // the DOM HUD) still draws here, on top, exactly as before.
    const use3d = (typeof Render3D !== 'undefined') && Render3D.active();
    if (use3d) {
      if (this.state === 'menu') Render3D.showcase();
      else Render3D.render(this);
      ctx.clearRect(0, 0, vw, vh);
    } else {
      ctx.fillStyle = '#04060f';
      ctx.fillRect(0, 0, vw, vh);
    }

    const z = this.cam.zoom;
    ctx.save();
    ctx.translate(vw / 2 + FX.shakeX, vh / 2 + FX.shakeY);
    ctx.scale(z, z);
    ctx.translate(-this.cam.x, -this.cam.y);

    const x0 = this.cam.x - vw / (2 * z) - 40, y0 = this.cam.y - vh / (2 * z) - 40;
    const x1 = this.cam.x + vw / (2 * z) + 40, y1 = this.cam.y + vh / (2 * z) + 40;

    const t = this.time;
    if (!use3d) {
      this.drawFloor(x0, y0, x1, y1);

      // decals
      ctx.drawImage(this.decals.canvas, 0, 0, WORLD.w, WORLD.h);

      // pillars
      for (const p of this.pillars) {
        ctx.drawImage(p.spr.c, p.x - p.spr.w / 2, p.y - p.spr.h / 2, p.spr.w, p.spr.h);
      }
    }

    // pickups
    for (const pk of this.pickups) {
      const def = PICKUP_DEFS[pk.type];
      const bob = Math.sin(pk.t * 3.2 + pk.t) * 3;
      const blink = pk.life < 3 && (Math.floor(pk.life * 6) % 2 === 0);
      if (blink) continue;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      ctx.rotate(Math.sin(pk.t * 1.7) * 0.18);
      ctx.drawImage(def.spr.c, -20, -20, 40, 40);
      ctx.restore();
    }

    // portals
    for (const pt of this.portals) {
      const def = ENEMY_TYPES[pt.type];
      const k = pt.t / pt.dur;
      const bs = pt.big ? 2.1 : 1;
      const rad = lerp(74 * bs, 16 * bs, k);
      ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(pt.t * 18));
      ctx.strokeStyle = def.glow;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, rad, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // smoke & debris under cars
    FX.drawParticles(ctx, false);

    // cars
    for (const e of this.enemies) {
      if (!use3d) drawCar(e, SPRITES[e.type]);
      if (e.type === 'bomber' && e.fuseT !== null && Math.floor(e.fuseT * 14) % 2 === 0) {
        ctx.globalAlpha = 0.75;
        const g = FX.makeGlow('#ff5030');
        const gs = e.r * 4.4;
        ctx.drawImage(g, e.x - gs / 2, e.y - gs / 2, gs, gs);
        ctx.globalAlpha = 1;
      }
      if (e.hp < e.maxHp && !e.wander) drawHpBar(e);
    }
    const p = this.player;
    if (!p.dead) {
      if (!use3d) drawCar(p, SPRITES.pcars[p.carId] || SPRITES.pcars.interceptor);
      if (p.shield > 0) {
        const blink = p.shield < 1.2 && Math.floor(p.shield * 8) % 2 === 0;
        if (!blink) {
          ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 6);
          ctx.strokeStyle = '#7fb0ff';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 13, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = '#7fb0ff';
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }

    // additive pass
    ctx.globalCompositeOperation = 'lighter';
    // nitro light trail
    if (this.trail.length > 1) {
      ctx.lineCap = 'round';
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1], b = this.trail[i];
        const al = clamp(b.life / b.max, 0, 1);
        ctx.globalAlpha = al * 0.5;
        ctx.strokeStyle = '#35f0ff';
        ctx.lineWidth = 2 + 7 * al;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
    }
    FX.drawGroundLights(ctx);
    this.drawBullets();
    for (const r of this.rockets.items) {
      if (!r.active) continue;
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.angle);
      ctx.fillStyle = '#ffe9c2';
      ctx.fillRect(-7, -2.5, 12, 5);
      ctx.fillStyle = '#ff5030';
      ctx.fillRect(5, -2.5, 4, 5);
      ctx.restore();
    }
    for (const e of this.enemies) {
      if (e.type === 'sniper' && e.aimT > 0.02) {
        ctx.globalAlpha = 0.2 + 0.55 * e.aimT;
        ctx.strokeStyle = '#ff4d6e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(e.aimA) * e.r, e.y + Math.sin(e.aimA) * e.r);
        ctx.lineTo(e.x + Math.cos(e.aimA) * 950, e.y + Math.sin(e.aimA) * 950);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    for (const e of this.enemies) {
      if (e.type === 'boss' && e.bphase && e.bphase.indexOf('_wind') >= 0) {
        ctx.globalAlpha = 0.35 + 0.3 * Math.sin(this.time * 20);
        ctx.strokeStyle = '#ff2255';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 16 + Math.sin(this.time * 14) * 5, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    FX.drawParticles(ctx, true);
    ctx.globalCompositeOperation = 'source-over';

    FX.drawTexts(ctx);
    ctx.restore();

    if (this.state === 'playing' || this.state === 'over') this.drawMinimap();
  },

  drawFloor(x0, y0, x1, y1) {
    const step = 128;
    const zx = clamp(x0, 0, WORLD.w), zy = clamp(y0, 0, WORLD.h);
    const zx1 = clamp(x1, 0, WORLD.w), zy1 = clamp(y1, 0, WORLD.h);
    ctx.lineWidth = 1 / this.cam.zoom;
    ctx.strokeStyle = 'rgba(53,240,255,0.05)';
    ctx.beginPath();
    for (let x = Math.floor(zx / step) * step; x <= zx1; x += step) {
      ctx.moveTo(x, zy); ctx.lineTo(x, zy1);
    }
    for (let y = Math.floor(zy / step) * step; y <= zy1; y += step) {
      ctx.moveTo(zx, y); ctx.lineTo(zx1, y);
    }
    ctx.stroke();

    // arena border
    ctx.strokeStyle = 'rgba(53,240,255,0.14)';
    ctx.lineWidth = 16;
    ctx.strokeRect(0, 0, WORLD.w, WORLD.h);
    ctx.strokeStyle = 'rgba(53,240,255,0.65)';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, WORLD.w, WORLD.h);
    ctx.strokeStyle = 'rgba(255,61,129,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(WALL - 8, WALL - 8, WORLD.w - (WALL - 8) * 2, WORLD.h - (WALL - 8) * 2);
  },

  drawBullets() {
    const items = this.bullets.items;
    for (let i = 0; i < items.length; i++) {
      const b = items[i];
      if (!b.active) continue;
      const col = b.team === 'p' ? '#9df2ff' : '#ffb35c';
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.stroke();
      const spr = FX.makeGlow(col);
      ctx.drawImage(spr, b.x - 9, b.y - 9, 18, 18);
    }
  },

  drawMinimap() {
    const size = IS_TOUCH ? 96 : 132;
    const px = vw - size - 14;
    const py = 76 + (IS_TOUCH ? 4 : 8);
    const s = size / WORLD.w;
    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = 'rgba(6, 12, 26, 0.78)';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(53,240,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    // pillars
    ctx.fillStyle = 'rgba(110,140,170,0.5)';
    for (const p of this.pillars) {
      ctx.beginPath(); ctx.arc(p.x * s, p.y * s, Math.max(1.5, p.r * s), 0, TAU); ctx.fill();
    }
    // pickups
    ctx.fillStyle = '#ffd24d';
    for (const pk of this.pickups) {
      ctx.fillRect(pk.x * s - 1, pk.y * s - 1, 2, 2);
    }
    // enemies
    for (const e of this.enemies) {
      ctx.fillStyle = e.def.glow;
      ctx.beginPath(); ctx.arc(e.x * s, e.y * s, e.type === 'boss' ? 5 : 2.2, 0, TAU); ctx.fill();
    }
    // portals blink
    for (const pt of this.portals) {
      if (Math.floor(pt.t * 10) % 2 === 0) {
        ctx.fillStyle = ENEMY_TYPES[pt.type].glow;
        ctx.beginPath(); ctx.arc(pt.x * s, pt.y * s, 2, 0, TAU); ctx.fill();
      }
    }
    // player
    const p = this.player;
    if (p && !p.dead) {
      ctx.fillStyle = '#35f0ff';
      ctx.beginPath(); ctx.arc(p.x * s, p.y * s, 3, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#35f0ff';
      ctx.beginPath();
      ctx.moveTo(p.x * s, p.y * s);
      ctx.lineTo(p.x * s + Math.cos(p.angle) * 7, p.y * s + Math.sin(p.angle) * 7);
      ctx.stroke();
    }
    ctx.restore();
  },

  /* ============================================================
     HUD
     ============================================================ */
  updateHUD() {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    const c = this.hudCache;
    const p = this.player;
    if (!p) return;

    // hp
    const hpPct = clamp(p.hp / p.maxHp, 0, 1);
    if (c.hp !== hpPct) {
      c.hp = hpPct;
      document.getElementById('hp-fill').style.transform = `scaleX(${hpPct})`;
      document.getElementById('hp-text').textContent = Math.max(0, Math.ceil(p.hp));
      document.querySelector('.bar.hp').classList.toggle('low', hpPct < 0.3);
    }
    // boost
    const bo = clamp(p.boost / 100, 0, 1);
    if (c.boost !== bo) {
      c.boost = bo;
      document.getElementById('boost-fill').style.transform = `scaleX(${bo})`;
    }
    // rockets
    if (c.rockets !== p.rockets) {
      c.rockets = p.rockets;
      document.getElementById('rocket-charges').textContent = '\u00d7' + p.rockets;
      document.getElementById('rocket-chip').classList.toggle('ready', p.rockets > 0);
    }
    // weapon
    if (c.weapon !== p.weapon) {
      c.weapon = p.weapon;
      document.getElementById('weapon-name').textContent = p.weapon === 'shotgun' ? 'SG' : 'MG';
    }
    if (c.swapVisible !== (p.weapons.length > 1)) {
      c.swapVisible = p.weapons.length > 1;
      document.getElementById('btn-swap').classList.toggle('hidden', !c.swapVisible);
    }
    // score (animated count-up)
    if (this.shownScore !== this.score) {
      const diff = this.score - this.shownScore;
      this.shownScore += Math.ceil(diff * 0.18);
      if (this.shownScore > this.score) this.shownScore = this.score;
      document.getElementById('score-value').textContent = fmtNum(this.shownScore);
      this.scorePopT -= 1;
      if (this.scorePopT <= 0) {
        this.scorePopT = 10;
        const el = document.getElementById('score-value');
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
    }
    // wave / enemies
    const remaining = this.enemies.length + this.spawnQueue.length + this.portals.length;
    const waveTxt = this.wave > 0 ? 'WAVE ' + this.wave : 'GET READY';
    if (c.wave !== waveTxt) {
      c.wave = waveTxt;
      document.getElementById('wave-label').textContent = waveTxt;
    }
    const enTxt = this.betweenWaves ? 'INCOMING\u2026' : remaining + ' HOSTILES';
    if (c.enemies !== enTxt) {
      c.enemies = enTxt;
      document.getElementById('enemies-label').textContent = enTxt;
    }
    // combo
    const showCombo = this.combo >= 2 && this.comboTimer > 0;
    if (c.comboOn !== showCombo) {
      c.comboOn = showCombo;
      document.getElementById('combo').classList.toggle('hidden', !showCombo);
    }
    if (showCombo) {
      if (c.comboX !== this.combo) {
        c.comboX = this.combo;
        const el = document.getElementById('combo-x');
        el.textContent = 'x' + this.combo;
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
      document.getElementById('combo-fill').style.transform = `scaleX(${clamp(this.comboTimer / 3, 0, 1)})`;
    }
    // boss bar
    const boss = this.enemies.find(e => e.type === 'boss');
    if (c.bossAlive !== !!boss) {
      c.bossAlive = !!boss;
      document.getElementById('boss-bar').classList.toggle('hidden', !boss);
    }
    if (boss) {
      const pct = clamp(boss.hp / boss.maxHp, 0, 1);
      if (c.bossHp !== pct) {
        c.bossHp = pct;
        document.getElementById('boss-fill').style.transform = `scaleX(${pct})`;
      }
      const nm = 'WARLORD ' + (['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][Math.max(0, Math.floor(this.wave / 5) - 1)] || '');
      if (c.bossName !== nm) {
        c.bossName = nm;
        document.getElementById('boss-name').textContent = nm;
      }
    }
  }
};

/* ============================================================
   Physics helpers
   ============================================================ */
function driveCar(c, throttle, steer, dt, stats) {
  const fx = Math.cos(c.angle), fy = Math.sin(c.angle);
  let vf = c.vx * fx + c.vy * fy;
  let vl = -c.vx * fy + c.vy * fx;
  const speed = Math.hypot(c.vx, c.vy);
  const sf = clamp(speed / 130, 0, 1);
  const dir = vf >= -20 ? 1 : -1;
  c.angle += steer * stats.turn * sf * dir * dt;

  if (throttle > 0) vf += stats.accel * Math.min(throttle, 1.8) * dt;
  else if (throttle < 0) vf += stats.accel * 0.55 * throttle * dt;

  vf *= 1 - (throttle !== 0 ? 0.45 : 1.7) * dt;
  if (vf > stats.maxF) vf = lerp(vf, stats.maxF, clamp(5 * dt, 0, 1));
  if (vf < -190) vf = -190;

  const grip = stats.grip * (1 - clamp((Math.abs(vf) - stats.maxF * 0.8) / stats.maxF, 0, 0.25));
  vl *= Math.max(0, 1 - grip * dt);
  // cap lateral so drift never explodes
  vl = clamp(vl, -320, 320);

  c.vx = fx * vf - fy * vl;
  c.vy = fy * vf + fx * vl;
  c.vf = vf; c.vl = vl;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
}

function collideWalls(c, isPlayer) {
  let hit = 0;
  if (c.x < WALL + c.r) { c.x = WALL + c.r; if (c.vx < 0) { hit = -c.vx; c.vx *= -0.45; } }
  else if (c.x > WORLD.w - WALL - c.r) { c.x = WORLD.w - WALL - c.r; if (c.vx > 0) { hit = c.vx; c.vx *= -0.45; } }
  if (c.y < WALL + c.r) { c.y = WALL + c.r; if (c.vy < 0) { hit = Math.max(hit, -c.vy); c.vy *= -0.45; } }
  else if (c.y > WORLD.h - WALL - c.r) { c.y = WORLD.h - WALL - c.r; if (c.vy > 0) { hit = Math.max(hit, c.vy); c.vy *= -0.45; } }
  if (hit > 170) {
    FX.sparks(c.x, c.y, '#ffd24d', 7, 300);
    if (isPlayer) {
      FX.addShake(clamp(hit / 90, 1, 6));
      AudioSys.crash();
      if (hit > 480) damagePlayer((hit - 480) * 0.025 + 3, c.x, c.y);
    } else if (hit > 460) {
      damageEnemy(c, (hit - 460) * 0.05, c.x, c.y);
    }
  }
}

function collidePillar(c, pil, isPlayer) {
  const dx = c.x - pil.x, dy = c.y - pil.y;
  const rr = pil.r + c.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 === 0) return;
  const d = Math.sqrt(d2);
  const nx = dx / d, ny = dy / d;
  c.x = pil.x + nx * rr;
  c.y = pil.y + ny * rr;
  const vn = c.vx * nx + c.vy * ny;
  if (vn < 0) {
    c.vx -= 1.5 * vn * nx;
    c.vy -= 1.5 * vn * ny;
    const impact = -vn;
    if (impact > 150) {
      FX.sparks(c.x - nx * c.r, c.y - ny * c.r, '#ffd24d', 6, 280);
      if (isPlayer) { FX.addShake(clamp(impact / 100, 1, 6)); AudioSys.crash(); }
      if (isPlayer && impact > 520) damagePlayer((impact - 520) * 0.025 + 3, c.x, c.y);
      if (!isPlayer && !c.wander && impact > 480) damageEnemy(c, (impact - 480) * 0.05, c.x, c.y);
    }
  }
}

function collideCars(a, b, involvesPlayer) {
  if (!a || !b || a.dead || (b.team === 'player' && b.dead)) return;
  const dx = b.x - a.x, dy = b.y - a.y;
  const rr = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 === 0) return;
  const d = Math.sqrt(d2);
  const nx = dx / d, ny = dy / d;
  const overlap = rr - d;
  const tm = a.mass + b.mass;
  a.x -= nx * overlap * (b.mass / tm);
  a.y -= ny * overlap * (b.mass / tm);
  b.x += nx * overlap * (a.mass / tm);
  b.y += ny * overlap * (a.mass / tm);
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel >= 0) return;
  const j = -1.4 * rel / (1 / a.mass + 1 / b.mass);
  a.vx -= j * nx / a.mass; a.vy -= j * ny / a.mass;
  b.vx += j * nx / b.mass; b.vy += j * ny / b.mass;
  const impact = -rel;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  if (impact > 140) {
    FX.sparks(mx, my, '#ffd24d', Math.min(12, 3 + impact / 60 | 0), 320);
    if (impact > 230) {
      AudioSys.crash();
      FX.addShake(involvesPlayer ? clamp(impact / 110, 1.5, 7) : 1.5);
    }
  }
  if (!involvesPlayer) return;
  const P = Game.player;
  if (P.dead) return;
  const e = a === P ? b : a;
  // hard crash damage
  if (impact > 380) {
    const dmg = (impact - 380) * 0.045 + 4;
    damageEnemy(e, dmg, mx, my);
    damagePlayer(dmg * 0.5, mx, my);
  }
  // ram contact damage — global player immunity window keeps swarms fair
  if (e.contactCd <= 0 && P.contactCd <= 0 && !e.wander) {
    e.contactCd = 1.0;
    e.retreatT = Game.wave <= 1 ? 1.3 : 0.7;
    P.contactCd = 0.4;
    damagePlayer(e.def.contact * clamp(0.6 + 0.08 * Game.wave, 0.6, 1) * DIFFS[Game.diff].contact * (Game.runTime < 3 ? 0.5 : 1), e.x, e.y);
    // enemies bounce off hard, player gets nudged
    const a2 = Math.atan2(e.y - P.y, e.x - P.x);
    e.vx += Math.cos(a2) * 430 / e.mass;
    e.vy += Math.sin(a2) * 430 / e.mass;
    P.vx -= Math.cos(a2) * 130;
    P.vy -= Math.sin(a2) * 130;
    FX.sparks(mx, my, e.def.glow, 6, 260);
    damageEnemy(e, 7, mx, my);
  }
}

/* ============================================================
   Damage
   ============================================================ */
function damageEnemy(e, d, hx, hy) {
  if (e.wander || e.hp <= 0) return;
  e.hp -= d;
  e.flash = 1;
  FX.sparks(hx, hy, '#ffd24d', 4, 240);
  if (Math.random() < 0.4) AudioSys.hit();
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.hp = 0;
  const idx = Game.enemies.indexOf(e);
  if (idx >= 0) Game.enemies.splice(idx, 1);
  const big = e.type === 'brute';
  FX.explosion(e.x, e.y, e.def.glow, big ? 1.7 : e.type === 'inter' ? 1.05 : 1.25, true);
  FX.debris(e.x, e.y, e.def.color, big ? 10 : 6);
  AudioSys.explosion(big);
  Platform.vibrate(e.type === 'boss' ? [40, 50, 60] : 14);
  Game.hitStop = Math.max(Game.hitStop, big ? 0.055 : 0.028);
  Game.registerKill(e);
  if (e.type === 'bomber') Game.detonateBomber(e);
  if (e.type === 'boss') Achievements.onBoss();
  if (e.type === 'boss') {
    // chained boss detonation + loot + bonus
    FX.explosion(e.x + rand(-36, 36), e.y + rand(-36, 36), '#ffb84d', 1.6, false);
    FX.explosion(e.x + rand(-46, 46), e.y + rand(-46, 46), '#ffffff', 1.3, false);
    FX.ring(e.x, e.y, '#ff2255', 96, 0.7);
    AudioSys.explosion(true);
    FX.addShake(16);
    Game.hitStop = Math.max(Game.hitStop, 0.09);
    const bonus = Math.round((1000 + Game.wave * 200) * DIFFS[Game.diff].score);
    Game.score += bonus;
    Game.coinsEarned += 150;
    FX.text(e.x, e.y - 62, 'BOSS DOWN  +' + bonus, '#ffd24d', 24);
    banner('BOSS DOWN');
    for (let i = 0; i < 3; i++) {
      const a = rand(TAU);
      Game.pickups.push({
        x: clamp(e.x + Math.cos(a) * 66, 60, WORLD.w - 60),
        y: clamp(e.y + Math.sin(a) * 66, 60, WORLD.h - 60),
        type: pick(['repair', 'nitro', 'coin', 'shield']),
        t: rand(TAU), life: 14
      });
    }
  }
}

let hitFlashTimer = 0;
function damagePlayer(d, sx, sy) {
  const p = Game.player;
  if (p.dead || d <= 0) return;
  if (p.shield > 0) {
    FX.ring(p.x, p.y, '#7fb0ff', p.r + 16, 0.3);
    FX.sparks(sx, sy, '#7fb0ff', 6, 260);
    AudioSys.hit();
    return;
  }
  p.hp -= d;
  p.flash = 1;
  Platform.vibrate(30);
  Game.damageSinceWave = true;
  Game.flawlessWaves = 0;
  FX.addShake(clamp(d * 0.4, 2, 7));
  FX.addFlash(0.5);
  AudioSys.hit();
  AudioSys.crash();
  const el = document.getElementById('hit-flash');
  el.classList.add('on');
  clearTimeout(hitFlashTimer);
  hitFlashTimer = setTimeout(() => el.classList.remove('on'), 70);
  if (p.hp <= 0) {
    p.hp = 0;
    Game.die();
  }
}

/* ============================================================
   Drawing helpers
   ============================================================ */
function drawCar(car, spr) {
  ctx.save();
  ctx.translate(car.x, car.y);
  // shadow
  ctx.save();
  ctx.rotate(car.angle);
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(3, 6, spr.w / 2 - 16, spr.h / 2 - 15, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.rotate(car.angle);
  ctx.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
  if (car.flash > 0) {
    ctx.globalAlpha = clamp(car.flash, 0, 1) * 0.85;
    ctx.drawImage(spr.white, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawHpBar(e) {
  const w = e.type === 'brute' ? 44 : 30;
  const y = e.y - e.r - 14;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(4, 8, 16, 0.8)';
  ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, 5);
  const pct = clamp(e.hp / e.maxHp, 0, 1);
  ctx.fillStyle = pct > 0.4 ? e.def.glow : '#ff5470';
  ctx.fillRect(e.x - w / 2, y, w * pct, 3);
  ctx.globalAlpha = 1;
}

function emitSkids(c, alpha) {
  const fx = Math.cos(c.angle), fy = Math.sin(c.angle);
  const rx = -fy, ry = fx;
  const bx = c.x - fx * c.r * 0.85, by = c.y - fy * c.r * 0.85;
  Game.decals.skid(bx + rx * c.r * 0.5, by + ry * c.r * 0.5, c.angle, alpha);
  Game.decals.skid(bx - rx * c.r * 0.5, by - ry * c.r * 0.5, c.angle, alpha);
}

/* ============================================================
   UI helpers
   ============================================================ */
const SCREENS = ['start', 'pause', 'over', 'upgrade'];
function setScreen(name) {
  for (const s of SCREENS) {
    document.getElementById('screen-' + s).classList.toggle('visible', s === name);
  }
}

let bannerTimer = 0;
function banner(text) {
  const el = document.getElementById('banner');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function fmtNum(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============================================================
   Boot
   ============================================================ */
let IS_TOUCH_ONLY = false;

function buildAllSprites() {
  SPRITES.player = makeCarSprite({ len: 46, wid: 26, body: '#25c9e8', glow: '#35f0ff', stripe: '#eafcff' });
  SPRITES.rammer = makeCarSprite({ len: 44, wid: 25, body: '#e0246e', glow: '#ff3d81', stripe: '#ffc2d9' });
  SPRITES.gunner = makeCarSprite({ len: 46, wid: 27, body: '#e07f22', glow: '#ff9a3d', stripe: '#ffe1b3' });
  SPRITES.brute = makeCarSprite({ len: 66, wid: 40, body: '#8a3fd4', glow: '#b06cff', stripe: '#e3ccff' });
  SPRITES.inter = makeCarSprite({ len: 42, wid: 22, body: '#1dbb6a', glow: '#58ff9b', stripe: '#c9ffe2' });
  SPRITES.boss = makeCarSprite({ len: 104, wid: 62, body: '#c22a55', glow: '#ff2255', stripe: '#ffd9e6', heavy: true });
  SPRITES.bomber = makeCarSprite({ len: 38, wid: 22, body: '#e8b420', glow: '#ffd24d', stripe: '#1a1408' });
  SPRITES.sniper = makeCarSprite({ len: 50, wid: 20, body: '#5a7bff', glow: '#8fa8ff', stripe: '#dfe6ff' });
  SPRITES.pcars = {
    interceptor: makeCarSprite({ len: 46, wid: 26, body: '#25c9e8', glow: '#35f0ff', stripe: '#eafcff' }),
    titan: makeCarSprite({ len: 54, wid: 34, body: '#6f7f96', glow: '#a9bdd6', stripe: '#e6edf6', heavy: true }),
    vortex: makeCarSprite({ len: 44, wid: 23, body: '#8a4fe0', glow: '#b06cff', stripe: '#f0e4ff' }),
    warden: makeCarSprite({ len: 47, wid: 29, body: '#d99a26', glow: '#ffb84d', stripe: '#fff2d0', heavy: true })
  };
  for (const k in PICKUP_DEFS) {
    PICKUP_DEFS[k].spr = makePickupSprite(PICKUP_DEFS[k].color, PICKUP_DEFS[k].glyph);
  }
}

function wireInstallBanner() {
  const show = () => document.getElementById('install-banner').classList.remove('hidden');
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    if (!store.get('nw.installDismissed', false)) show();
  });
  const btn = document.getElementById('btn-install');
  const x = document.getElementById('btn-install-x');
  if (btn) btn.addEventListener('click', () => {
    document.getElementById('install-banner').classList.add('hidden');
    if (deferred) { deferred.prompt(); deferred = null; }
  });
  if (x) x.addEventListener('click', () => {
    document.getElementById('install-banner').classList.add('hidden');
    store.set('nw.installDismissed', true);
  });
}

/* ---------------- optional three.js layer ---------------- */
function wire3d() {
  if (typeof Render3D === 'undefined' || !Render3D.available()) return false;
  const glCanvas = document.getElementById('gl');
  if (!glCanvas || !Render3D.init(glCanvas)) return false;

  // on capable machines the 3D view is the default; a player's choice sticks
  Render3D.enabled = store.get('nw.3d', true) !== false;
  Render3D.resize(vw, vh, QLEVELS[Game.qual.level].dprCap);
  Render3D.setEnabled(Render3D.enabled, Game);
  sync3dButton();
  return true;
}

function sync3dButton() {
  const b = document.getElementById('btn-3d');
  if (!b || typeof Render3D === 'undefined') return;
  const live = Render3D.active();
  b.classList.toggle('off', !live);
  b.classList.toggle('on3d', live);
  const badge = document.getElementById('gl-badge');
  if (badge) badge.classList.toggle('live', live);
}

function toggle3d() {
  if (typeof Render3D === 'undefined' || !Render3D.ready) return;
  Render3D.setEnabled(!Render3D.enabled, Game);
  sync3dButton();
  if (typeof AudioSys !== 'undefined') AudioSys.ui();
}

function wireUI() {
  const on = (id, fn) => {
    const el = document.getElementById(id);
    el.addEventListener('click', (e) => { e.preventDefault(); el.blur(); fn(); });
  };
  on('btn-play', () => { AudioSys.init(); AudioSys.resume(); AudioSys.startMusic(); AudioSys.ui(); Game.startRun(); });
  on('btn-resume', () => { AudioSys.ui(); Game.togglePause(); });
  on('btn-restart', () => { AudioSys.ui(); Game.startRun(); });
  on('btn-quit', () => { AudioSys.ui(); Game.enterMenu(); });
  on('btn-again', () => { AudioSys.ui(); Game.startRun(); });
  on('btn-menu', () => { AudioSys.ui(); Game.enterMenu(); });
  on('btn-save', () => Game.saveScore());
  on('car-prev', () => Game.viewCar(-1));
  on('car-next', () => Game.viewCar(1));
  on('car-action', () => Game.carAction());
  const diffBtns = document.querySelectorAll('.diff-btn');
  for (const b of diffBtns) {
    b.addEventListener('click', (e) => { e.preventDefault(); Game.setDiff(b.dataset.diff); });
  }
  on('btn-pause', () => { if (Game.state === 'playing' || Game.state === 'paused') Game.togglePause(); });
  on('btn-mute', () => Game.toggleMute());
  on('btn-3d', () => toggle3d());
  on('btn-update', () => Platform.applyUpdate());

  const nameInput = document.getElementById('name-input');
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); Game.saveScore(); document.getElementById('btn-again').focus(); }
  });

  if (AudioSys.muted) document.getElementById('btn-mute').classList.add('off');

  // controls hint
  const hint = document.getElementById('controls-hint');
  if (IS_TOUCH) {
    hint.innerHTML = 'LEFT SIDE &mdash; drag to drive &bull; <b>FIRE</b> / <b>NOS</b> / <b>RKT</b> buttons &bull; <b>SWP</b> swaps weapons (when unlocked) &bull; auto-aim assist ON';
  } else {
    hint.innerHTML = '<span class="key">GAMEPAD</span> supported \u2022 <span class="key">W A S D</span> drive &bull; <span class="key">SPACE</span>/<span class="key">CLICK</span> fire &bull; <span class="key">SHIFT</span> nitro &bull; <span class="key">E</span> rocket &bull; <span class="key">Q</span>/right-click swap weapon &bull; <span class="key">P</span> pause &bull; mouse aims the gun';
  }
}

/* ---------------- main loop ---------------- */
let lastT = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;
  if (dt < 0) dt = 0; // rAF timestamps can jump backward after mobile sleep/resume

  Input.pollPad();
  if (Input.consumePressed('KeyM')) Game.toggleMute();

  // ----- adaptive quality governor -----
  {
    const q = Game.qual;
    if (q.cool > 0) q.cool -= dt;
    if (Game.state === 'playing') {
      q.ema = q.ema * 0.94 + dt * 0.06;
      q.timer += dt;
      if (q.timer >= 2 && q.cool <= 0) {
        if (q.ema > 0.021 && q.level < QLEVELS.length - 1) {
          Game.applyQuality(q.level + 1);
        } else if (q.ema < 0.018 && q.level > 0) { // healthy 60fps (16.6ms) earns quality back
          q.goodTimer += 2;
          if (q.goodTimer >= 4) Game.applyQuality(q.level - 1);
        } else {
          q.goodTimer = 0;
        }
        q.timer = 0;
      }
    }
  }

  switch (Game.state) {
    case 'menu':
      if (Input.consumePressed('Enter')) Game.startRun();
      Game.updateMenu(dt);
      break;

    case 'playing':
      if (Input.consumePressed('KeyP') || Input.consumePressed('Escape') || Input.consumePadPause()) { Game.togglePause(); break; }
      if (Game.hitStop > 0) {
        Game.hitStop -= dt;
        FX.update(dt * 0.35);
      } else {
        const ts = Game.player.dead ? 0.32 : 1;
        Game.update(dt * ts);
        if (Game.player.dead) {
          Game.deathTimer -= dt;
          if (Game.deathTimer <= 0) Game.gameOver();
        }
      }
      break;

    case 'paused':
      if (Input.consumePressed('KeyP') || Input.consumePressed('Escape') || Input.consumePressed('Enter')) Game.togglePause();
      break;

    case 'over':
      if (Input.consumePressed('KeyR') || Input.consumePressed('Enter')) { Game.startRun(); break; }
      Game.update(dt * 0.5);
      break;

    case 'upgrade':
      if (Input.consumePressed('Digit1') || Input.consumePressed('Numpad1')) Game.chooseUpgrade(0);
      else if (Input.consumePressed('Digit2') || Input.consumePressed('Numpad2')) Game.chooseUpgrade(1);
      else if (Input.consumePressed('Digit3') || Input.consumePressed('Numpad3')) Game.chooseUpgrade(2);
      break;
  }

  Input.endFrame();
  Game.render();
  Game.updateHUD();
  Achievements.update(dt);
}

function boot() {
  buildAllSprites();
  IS_TOUCH_ONLY = IS_TOUCH && !matchMedia('(hover: hover)').matches;
  Game.init();
  Input.init(canvas);
  wireUI();
  wireInstallBanner();
  Achievements.init();
  Platform.init();
  wire3d();
  Game.enterMenu();

  // audio unlock on first gesture
  const unlock = () => {
    AudioSys.init();
    AudioSys.resume();
    AudioSys.startMusic();
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  requestAnimationFrame(frame);
}

boot();
