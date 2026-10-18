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
  inter:  { r: 18, hp: 34, speed: 400, accel: 700, turn: 3.7, score: 250, color: '#1dbb6a', glow: '#58ff9b', contact: 10, ai: 'dash', mass: 3.2 }
};

const PLAYER_STATS = { accel: 640, maxF: 430, turn: 3.35, grip: 8.5 };
const BOOST_STATS = { accel: 960, maxF: 650, turn: 2.9, grip: 7.0 };

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

  bullets: new Pool(() => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, team: 'p', dmg: 9 }), 220),
  rockets: new Pool(() => ({ active: false, x: 0, y: 0, angle: 0, speed: 0, life: 0, target: null, trailT: 0 }), 16),

  cam: { x: WORLD.w / 2, y: WORLD.h / 2, zoom: 1 },
  decals: null,
  highscores: [],
  lastEntry: null,
  hudCache: {},

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
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(vw * dpr);
    canvas.height = Math.ceil(vh * dpr);
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

    this.player = {
      team: 'player', x: WORLD.w / 2, y: WORLD.h / 2,
      angle: -Math.PI / 2, turret: -Math.PI / 2,
      vx: 0, vy: 0, r: 19, mass: 4.5, def: null,
      hp: 100, maxHp: 100,
      boost: 100, rockets: 2, maxRockets: 3, rocketRegen: 0,
      fireCd: 0, triple: 0, shield: 0,
      boosting: false, flash: 0, skidT: 0, smokeT: 0,
      contactCd: 0, dead: false
    };
    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this.cam.zoom = clamp(Math.min(vw, vh) / 900, 0.62, 1.05);

    this.pillars = this.genPillars();

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
    setScreen('start');
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
      AudioSys.engine(0, false, false);
      AudioSys.skid(0);
    } else if (this.state === 'paused') {
      this.state = 'playing';
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
        if (this.betweenTimer <= 0) this.startWave(this.wave + 1);
      } else if (this.spawnQueue.length === 0 && this.portals.length === 0 && this.enemies.length === 0) {
        this.waveCleared();
      }
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
    else p.boost = Math.min(100, p.boost + 13 * dt);

    const stats = wantBoost ? BOOST_STATS : PLAYER_STATS;
    driveCar(p, throttle, steer, dt, stats);

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
    if (Input.mouseAiming() && !IS_TOUCH_ONLY) {
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

    // ----- fire -----
    p.fireCd -= dt;
    if (Input.getFire() && p.fireCd <= 0) {
      p.fireCd = p.triple > 0 ? 0.13 : 0.115;
      const nx = p.x + Math.cos(p.angle) * 24;
      const ny = p.y + Math.sin(p.angle) * 24;
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
        b.dmg = p.triple > 0 ? 7 : 9;
      }
      FX.muzzle(nx + Math.cos(p.turret) * 10, ny + Math.sin(p.turret) * 10, p.turret, '#ffd24d');
      AudioSys.shoot();
      p.vx -= Math.cos(p.turret) * 9;
      p.vy -= Math.sin(p.turret) * 9;
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
      this.portals.push({ x: pos.x, y: pos.y, type, t: 0, dur: 0.9 });
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
    const hpScale = 1 + (this.wave - 1) * 0.055;
    const e = {
      type, def, team: 'enemy',
      x, y, angle: Math.atan2(this.player.y - y, this.player.x - x),
      vx: 0, vy: 0, r: def.r, mass: def.mass,
      hp: def.hp * hpScale, maxHp: def.hp * hpScale,
      fireCd: rand(0.9, 1.8), contactCd: 0, retreatT: 0, flash: 0,
      seed: rand(TAU), ai: def.ai, phase: 'cruise', phaseT: rand(0.6, 1.6),
      orbitDir: Math.random() < 0.5 ? 1 : -1,
      boosting: false, skidT: 0, smokeT: 0, wander: false
    };
    this.enemies.push(e);
    FX.glowBurst(x, y, def.glow, 12, 300);
    FX.ring(x, y, def.glow, 34, 0.4);
  },

  startWave(n) {
    this.wave = n;
    this.betweenWaves = false;
    const list = [];
    const count = Math.min(2 + n * 2, 26);
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      let t = 'rammer';
      if (n >= 2 && r < 0.3) t = 'gunner';
      else if (n >= 3 && r > 0.88) t = 'brute';
      else if (n >= 4 && r > 0.6 && r < 0.74) t = 'inter';
      list.push(t);
    }
    if (n % 5 === 0) list.push('brute', 'brute');
    this.spawnQueue = list;
    this.spawnTimer = 0.35;
    banner('WAVE ' + n);
    AudioSys.waveHorn();
  },

  waveCleared() {
    const bonus = 200 + this.wave * 100;
    this.score += bonus;
    FX.text(this.player.x, this.player.y - 30, 'WAVE CLEAR  +' + bonus, '#35f0ff', 20);
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 8);
    banner('WAVE ' + this.wave + ' CLEARED');
    AudioSys.pickup();
    this.betweenWaves = true;
    this.betweenTimer = 2.4;
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
    const speedScale = Math.min(1 + (this.wave - 1) * 0.02, 1.22);
    const stats = e.boosting
      ? { accel: def.accel * 1.5, maxF: def.speed * speedScale * 1.18, turn: def.turn * 0.85, grip: 7.5 }
      : { accel: def.accel, maxF: def.speed * speedScale, turn: def.turn, grip: 9 };

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
      if (d2v < 150 * 150) {
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
      case 'coin': this.score += 150; break;
      case 'nitro': p.boost = Math.min(100, p.boost + 50); break;
      case 'triple': p.triple = 10; break;
      case 'shield': p.shield = 6; break;
    }
    FX.text(pk.x, pk.y, def.label, def.color, 16);
    FX.glowBurst(pk.x, pk.y, def.color, 10, 220);
    FX.ring(pk.x, pk.y, def.color, 20, 0.3);
    AudioSys.pickup();
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

  /* ============================================================
     DAMAGE / SCORE / DEATH
     ============================================================ */
  registerKill(e) {
    this.kills++;
    this.combo = Math.min(this.combo + 1, 8);
    this.comboTimer = 3;
    this.maxCombo = Math.max(this.maxCombo, Math.max(1, this.combo));
    const mult = Math.max(1, this.combo);
    const gained = e.def.score * mult;
    this.score += gained;
    FX.text(e.x, e.y, '+' + gained + (mult > 1 ? '  x' + mult : ''), mult > 1 ? '#ffd24d' : '#9feeff', mult > 1 ? 18 : 15);
    this.dropPickup(e.x, e.y);
  },

  die() {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.boosting = false;
    FX.explosion(p.x, p.y, '#35f0ff', 2.2, true);
    FX.explosion(p.x + rand(-20, 20), p.y + rand(-20, 20), '#ff9a3d', 1.4, false);
    AudioSys.explosion(true);
    FX.addShake(18);
    this.hitStop = 0.09;
    this.deathTimer = 1.5;
    AudioSys.engine(0, false, false);
    AudioSys.skid(0);
  },

  gameOver() {
    this.state = 'over';
    this.timeScale = 1;
    Input.showTouchUI(false);
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('name-input').value = store.get('nw.name', 'PLAYER');

    const q = this.qualifies();
    document.getElementById('save-row').classList.toggle('hidden', !q);
    document.getElementById('new-best').classList.toggle('hidden', !this.isPersonalBest());
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
    store.set('nw.scores', this.highscores);
    this.lastEntry = entry;
    document.getElementById('save-row').classList.add('hidden');
    this.renderScores('over-highscores');
    this.renderScores('start-highscores');
    AudioSys.ui();
  },

  loadScores() {
    this.highscores = store.get('nw.scores', []);
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
    ctx.fillStyle = '#04060f';
    ctx.fillRect(0, 0, vw, vh);

    const z = this.cam.zoom;
    ctx.save();
    ctx.translate(vw / 2 + FX.shakeX, vh / 2 + FX.shakeY);
    ctx.scale(z, z);
    ctx.translate(-this.cam.x, -this.cam.y);

    const x0 = this.cam.x - vw / (2 * z) - 40, y0 = this.cam.y - vh / (2 * z) - 40;
    const x1 = this.cam.x + vw / (2 * z) + 40, y1 = this.cam.y + vh / (2 * z) + 40;

    this.drawFloor(x0, y0, x1, y1);

    // decals
    ctx.drawImage(this.decals.canvas, 0, 0, WORLD.w, WORLD.h);

    // pillars
    const t = this.time;
    for (const p of this.pillars) {
      ctx.drawImage(p.spr.c, p.x - p.spr.w / 2, p.y - p.spr.h / 2, p.spr.w, p.spr.h);
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
      const rad = lerp(74, 16, k);
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
      drawCar(e, SPRITES[e.type]);
      if (e.hp < e.maxHp && !e.wander) drawHpBar(e);
    }
    const p = this.player;
    if (!p.dead) {
      drawCar(p, SPRITES.player);
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
      ctx.beginPath(); ctx.arc(e.x * s, e.y * s, 2.2, 0, TAU); ctx.fill();
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
    e.retreatT = 0.7;
    P.contactCd = 0.4;
    damagePlayer(e.def.contact * clamp(0.6 + 0.08 * Game.wave, 0.6, 1), e.x, e.y);
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
  Game.hitStop = Math.max(Game.hitStop, big ? 0.055 : 0.028);
  Game.registerKill(e);
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
const SCREENS = ['start', 'pause', 'over'];
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
  for (const k in PICKUP_DEFS) {
    PICKUP_DEFS[k].spr = makePickupSprite(PICKUP_DEFS[k].color, PICKUP_DEFS[k].glyph);
  }
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
  on('btn-pause', () => { if (Game.state === 'playing' || Game.state === 'paused') Game.togglePause(); });
  on('btn-mute', () => Game.toggleMute());

  const nameInput = document.getElementById('name-input');
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); Game.saveScore(); document.getElementById('btn-again').focus(); }
  });

  if (AudioSys.muted) document.getElementById('btn-mute').classList.add('off');

  // controls hint
  const hint = document.getElementById('controls-hint');
  if (IS_TOUCH) {
    hint.innerHTML = 'LEFT SIDE &mdash; drag to drive &bull; <b>FIRE</b> / <b>NOS</b> / <b>RKT</b> buttons &bull; auto-aim assist ON';
  } else {
    hint.innerHTML = '<span class="key">W A S D</span> drive &bull; <span class="key">SPACE</span>/<span class="key">CLICK</span> fire &bull; <span class="key">SHIFT</span> nitro &bull; <span class="key">E</span> rocket &bull; <span class="key">P</span> pause &bull; mouse aims the gun';
  }
}

/* ---------------- main loop ---------------- */
let lastT = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;

  if (Input.consumePressed('KeyM')) Game.toggleMute();

  switch (Game.state) {
    case 'menu':
      if (Input.consumePressed('Enter')) Game.startRun();
      Game.updateMenu(dt);
      break;

    case 'playing':
      if (Input.consumePressed('KeyP') || Input.consumePressed('Escape')) { Game.togglePause(); break; }
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
  }

  Input.endFrame();
  Game.render();
  Game.updateHUD();
}

function boot() {
  buildAllSprites();
  IS_TOUCH_ONLY = IS_TOUCH && !matchMedia('(hover: hover)').matches;
  Game.init();
  Input.init(canvas);
  wireUI();
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
