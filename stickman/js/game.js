/* STICKMAN — WHAT IF
 *
 * A twin-stick arena survival game where every upgrade is a "what if" premise
 * with a real-world baseline printed on the card. The power is fiction; the
 * numbers beside it are not.
 *
 * The HUD is drawn on the canvas (not in the DOM) on purpose: a screenshot of
 * the game then contains everything, which matters the day we need store
 * screenshots.
 */
'use strict';

var Game = {
  canvas: null,
  ctx: null,
  state: 'menu',
  t: 0,
  timeScale: 1,
  slow: 0,          // remaining seconds of artificial slow motion
  freeze: 0,        // hit-stop in seconds
  shake: 0,
  flash: 0,
  rng: makeRng(1),

  player: null,
  enemies: [],
  bullets: [],
  shots: [],
  parts: [],
  splats: [],
  marks: [],
  pending: [],      // telegraphed spawns
  pickups: [],      // stationery and first aid waiting to be picked up
  crates: [],       // breakable supplies in house rooms
  floats: [],

  wave: 0,
  waveTimer: 0,
  banner: 0,
  bannerText: '',
  toast: 0,
  toastText: '',
  score: 0,
  combo: 0,
  comboTimer: 0,
  kills: 0,
  best: 0,
  powers: Object.create(null),
  offer: [],
  sel: 0,
  runTime: 0,


  /* -------------------------------------------------------------- arms ---
   * The page is the world, so the weapons are what you would find on a desk.
   * Each one is a different verb, not a different number: the pen is precise,
   * the ruler clears a cone, the compass punches a line through a crowd, the
   * stapler is a hose, and the eraser is a wrecking ball that bounces.
   */
  WEAPONS: {
    pen: {
      name: 'PEN', tip: 'One clean line. Never runs out.',
      shots: 1, spread: 0, rate: 0.135, dmg: 11, speed: 980, life: 1.1,
      r: 3, len: 13, pierce: 0, ammo: Infinity, kick: 26, drop: 0, reach: 13, tipLength: 11
    },
    ruler: {
      name: 'RULER', tip: 'Three hard slugs in a cone.',
      shots: 3, spread: 0.20, rate: 0.40, dmg: 16, speed: 820, life: 0.46,
      r: 6, len: 21, pierce: 0, ammo: 24, kick: 130, drop: 0.5, reach: 20, tipLength: 14
    },
    compass: {
      name: 'COMPASS', tip: 'A needle that goes through everything.',
      shots: 1, spread: 0, rate: 0.34, dmg: 24, speed: 1500, life: 1.0,
      r: 2.5, len: 26, pierce: 3, ammo: 12, kick: 90, drop: 0.65, reach: 13, tipLength: 11
    },
    stapler: {
      name: 'STAPLER', tip: 'Fast, mean, and very short range.',
      shots: 1, spread: 0.10, rate: 0.065, dmg: 5, speed: 1250, life: 0.42,
      r: 2, len: 8, pierce: 0, ammo: 80, kick: 12, drop: 0.9, reach: 10, tipLength: 10
    },
    eraser: {
      name: 'ERASER', tip: 'Slow and heavy. It ricochets off the margin.',
      shots: 1, spread: 0, rate: 0.60, dmg: 42, speed: 640, life: 1.6,
      r: 11, len: 0, pierce: 0, ammo: 8, kick: 240, bounce: 2, drop: 0.4, reach: 10, tipLength: 9
    }
  },
  WEAPON_IDS: ['ruler', 'compass', 'stapler', 'eraser'],

  /* ------------------------------------------------------------- powers --- */
  POWERS: [
    {
      id: 'reflex',
      title: 'your reflexes were three times faster',
      fact: 'Most people react in about a quarter of a second.',
      effect: 'Time crawls when something is close.',
      short: 'REFLEX'
    },
    {
      id: 'arms',
      title: 'you had six arms',
      fact: 'Two is the human default.',
      effect: 'Every shot becomes three.',
      short: 'ARMS'
    },
    {
      id: 'sonic',
      title: 'you could move at the speed of sound',
      fact: 'Sound crosses 343 meters in a second.',
      effect: 'Dash blinks through enemies and hurts them.',
      short: 'SONIC'
    },
    {
      id: 'heart',
      title: 'you had a second heart',
      fact: 'An octopus runs on three.',
      effect: 'More health, and it slowly comes back.',
      short: 'HEART'
    },
    {
      id: 'eyes',
      title: 'your eyes could track anything',
      fact: 'Your eyes jump about three times a second.',
      effect: 'Bullets lean toward the nearest enemy.',
      short: 'EYES'
    },
    {
      id: 'pain',
      title: 'you never felt pain',
      fact: 'Pain is a signal, not a weakness.',
      effect: 'Nothing staggers you. You fire faster.',
      short: 'PAIN'
    }
  ],

  /* --------------------------------------------------------------- setup --- */
  init: function (canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.best = Store.get('best', 0) || 0;
    this.makePaper();
    this.reset('menu');
    return this;
  },

  /* A fibre texture for the paper, generated once. If the environment has no
   * real canvas (the headless tests), we simply skip it. */
  makePaper: function () {
    this.paper = null;
    try {
      if (typeof document === 'undefined' || !document.createElement) return;
      var c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      var g = c.getContext('2d');
      if (!g || !g.getImageData) return;
      var img = g.createImageData(256, 256);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = 246 + Math.floor(Math.random() * 9);
        img.data[i] = v; img.data[i + 1] = v - 1; img.data[i + 2] = v - 8;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      this.paper = c;
    } catch (e) { this.paper = null; }
  },

  reset: function (state) {
    this.state = state || 'menu';
    this.t = 0; this.timeScale = 1; this.slow = 0; this.freeze = 0;
    this.shake = 0; this.flash = 0;
    this.enemies.length = 0; this.bullets.length = 0; this.shots.length = 0;
    this.pickups.length = 0; this.crates.length = 0;
    this.parts.length = 0; this.splats.length = 0; this.marks.length = 0;
    this.pending.length = 0; this.floats.length = 0;
    this.wave = 0; this.waveTimer = 0; this.banner = 0; this.bannerText = '';
    this.toast = 0; this.toastText = '';
    this.score = 0; this.combo = 0; this.comboTimer = 0; this.kills = 0;
    this.powers = Object.create(null);
    this.offer = []; this.sel = 0; this.runTime = 0;
    this.pickups.length = 0;
    this.player = null;
    this.house = null;
    this.blast = null; this.blasting = false;
  },

  startRun: function (skipWave) {
    this.reset('playing');
    this.player = {
      x: W / 2, y: H / 2 + 60, vx: 0, vy: 0,
      size: 124, hp: 100, maxhp: 100,
      aim: -Math.PI / 2, phase: 0, gait: 0,
      fireCd: 0, dashCd: 0, dashT: 0, iframes: 0, hurtT: 0,
      arms: 1, powerCd: 0, regenT: 0, dead: false, deadT: 0,
      facing: 1, walkT: 0,
      weapon: 'pen', ammo: Infinity, muzzle: 0,
      attack: null, meleeCd: 0, queuedMelee: null, comboStep: 0, comboTimer: 0, ink: 0
    };
    if (!skipWave) this.nextWave();
    return this.player;
  },

  // The map and house run are separate from the original endless arena.
  openMap: function () {
    this.reset('map');
  },

  startHouse: function () {
    this.startRun(true);
    this.house = { room: 0, exitOpen: false, waitingForPower: false };
    this.loadHouseRoom(1);
  },

  loadHouseRoom: function (room) {
    if (!this.house || room < 1 || room > 3) return;
    this.house.room = room;
    this.house.exitOpen = false;
    this.house.waitingForPower = false;
    this.wave = room;
    this.waveTimer = 0;
    this.toast = 0; this.toastText = '';
    this.enemies.length = 0; this.pending.length = 0;
    this.bullets.length = 0; this.shots.length = 0; this.blast = null;
    this.pickups.length = 0; this.crates.length = 0; this.parts.length = 0;
    this.marks.length = 0; this.splats.length = 0;
    var p = this.player;
    p.x = room === 1 ? 250 : 160; p.y = H / 2 + 30;
    p.vx = p.vy = 0; p.attack = null; p.queuedMelee = null;
    p.iframes = Math.max(p.iframes, 0.6);
    if (room > 1) p.hp = Math.min(p.maxhp, p.hp + 15);
    if (room === 1) this.crates.push({x: 690, y: 235, hp: 22, kind: 'health'}, {x: 925, y: 505, hp: 22, kind: 'stapler'});
    if (room === 2) this.crates.push({x: 510, y: 245, hp: 22, kind: 'health'}, {x: 900, y: 505, hp: 22, kind: 'eraser'});
    var groups = [[], ['walker', 'runner', 'walker', 'runner', 'walker'],
      ['runner', 'thrower', 'swordsman', 'runner', 'brute', 'thrower'], ['boss']];
    var types = groups[room];
    for (var i = 0; i < types.length; i++) {
      var pos = room === 3 ? { x: 960, y: 360 } : this.edgePoint();
      // Do not spawn right on top of the entrance.
      if (pos.x < 380) pos.x = 600 + this.rng() * 400;
      if (room === 1 && i === 0) { pos.x = 520; pos.y = H / 2 + 30; }
      this.pending.push({ type: types[i], x: pos.x, y: pos.y, t: 0.65 + i * 0.4 });
    }
    this.bannerText = room === 3 ? 'THE INK GUARDIAN' : 'ROOM ' + room + ' / 3';
    this.banner = 1.6;
    Sfx.wave();
  },

  updateHouse: function (dt) {
    var h = this.house, p = this.player;
    if (!h || !p || p.dead || this.state !== 'playing') return;
    if (!h.exitOpen && this.pending.length === 0 && this.enemies.length === 0) {
      this.waveTimer += dt;
      if (this.waveTimer >= 0.65) {
        if (h.room === 3) {
          Store.set('house1_complete', true);
          this.best = Math.max(this.best, this.score);
          Store.set('best', this.best);
          this.state = 'victory';
          this.shake = 0;
          Sfx.choose();
        } else {
          h.exitOpen = true;
          // A useful, deterministic reward on the path to the exit.
          if (this.pickups.length > 6) this.pickups.shift();
          this.dropWeapon(W - 195, H / 2 - p.size * 0.4, h.room === 1 ? 'ruler' : 'compass');
          this.toastText = 'ROOM CLEAR - PICK UP YOUR REWARD';
          this.toast = 3;
          Sfx.pickup();
        }
      }
    }
    if (h.exitOpen && p.x > W - 112 && Math.abs(p.y - H / 2) < 80) {
      if (h.room === 2) {
        h.exitOpen = false;
        h.waitingForPower = true;
        this.offerPowers();
      } else {
        this.loadHouseRoom(h.room + 1);
      }
    }
  },

  /* --------------------------------------------------------------- waves --- */
  nextWave: function () {
    this.wave++;
    this.pending.length = 0;
    var n = 3 + Math.floor(this.wave * 1.7);
    n = Math.min(n, 22);
    var types = this.waveTypes();
    for (var i = 0; i < n; i++) {
      var type = types[Math.floor(this.rng() * types.length)];
      var pos = this.edgePoint();
      this.pending.push({
        type: type, x: pos.x, y: pos.y,
        t: 0.55 + i * 0.16 + this.rng() * 0.2
      });
    }
    this.bannerText = 'WAVE ' + this.wave;
    this.banner = 1.8;
    Sfx.wave();
  },

  waveTypes: function () {
    var t = ['walker'];
    if (this.wave >= 2) t.push('runner');
    if (this.wave >= 3) t.push('runner', 'thrower');
    if (this.wave >= 4) t.push('brute');
    if (this.wave >= 6) t.push('brute', 'thrower');
    return t;
  },

  edgePoint: function () {
    var m = 44;
    var side = Math.floor(this.rng() * 4);
    if (side === 0) return { x: m + this.rng() * (W - m * 2), y: m };
    if (side === 1) return { x: W - m, y: m + this.rng() * (H - m * 2) };
    if (side === 2) return { x: m + this.rng() * (W - m * 2), y: H - m };
    return { x: m, y: m + this.rng() * (H - m * 2) };
  },

  spawnEnemy: function (type, x, y) {
    var base = {
      walker: { hp: 22, speed: 62, size: 108, dmg: 9, r: 19, score: 10 },
      runner: { hp: 14, speed: 118, size: 96, dmg: 7, r: 16, score: 14 },
      swordsman: { hp: 36, speed: 78, size: 116, dmg: 14, r: 19, score: 24 },
      thrower: { hp: 18, speed: 48, size: 104, dmg: 8, r: 18, score: 18 },
      brute: { hp: 70, speed: 42, size: 152, dmg: 20, r: 30, score: 40 },
      boss: { hp: 260, speed: 48, size: 205, dmg: 18, r: 38, score: 300 }
    }[type] || { hp: 20, speed: 60, size: 54, dmg: 8, r: 16, score: 10 };
    var e = {
      type: type, x: x, y: y, vx: 0, vy: 0,
      hp: base.hp, maxhp: base.hp, speed: base.speed, size: base.size,
      dmg: base.dmg, r: base.r, score: base.score,
      phase: this.rng() * TAU, t: 0, hurt: 0, stun: 0,
      attackCd: 0, throwCd: 0.8 + this.rng() * 1.2,
      seed: 1 + Math.floor(this.rng() * 9999),
      dead: false, deadT: 0, bossPhase: 'idle', bossTimer: 2.1, chargeX: 0, chargeY: 0, enraged: false, swordPhase: 'approach', swordTimer: 0, swordHit: false
    };
    this.enemies.push(e);
    return e;
  },

  /* -------------------------------------------------------------- update --- */
  update: function (rawDt) {
    var dt = Math.min(rawDt, 0.05);
    this.t += dt;
    if (this.state === 'duel') {
      Duel.update(dt);
      Input.endFrame();
      return;
    }

    /* hit-stop: the world holds still for a beat on a big kill */
    if (this.freeze > 0) {
      this.freeze = Math.max(0, this.freeze - dt);
      this.updateEffects(dt);
      return;
    }

    if (this.state === 'playing') {
      this.runTime += dt;
      var scale = 1;
      if (this.slow > 0) { this.slow = Math.max(0, this.slow - dt); scale = 0.35; }
      if (this.powers.reflex) scale = Math.min(scale, this.reflexScale());
      this.timeScale = lerp(this.timeScale, scale, 1 - Math.pow(0.001, dt));
      var sdt = dt * this.timeScale;
      this.updatePlayer(sdt);
      this.updateEnemies(sdt);
      this.updateBullets(sdt);
      this.updatePending(sdt);
      this.updatePickups(sdt);
      if (this.banner > 0) this.banner -= dt;
      if (this.toast > 0) this.toast -= dt;
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }
      if (this.house) {
        this.updateHouse(dt);
      } else {
        if (this.enemies.length === 0 && this.pending.length === 0 && this.waveTimer <= 0) {
          this.waveTimer = 1.4;
        }
        if (this.waveTimer > 0) {
          this.waveTimer -= dt;
          if (this.waveTimer <= 0) this.betweenWaves();
        }
      }
    } else if (this.state === 'dead') {
      this.player.deadT += dt;
      this.updateEnemies(dt * 0.25);
      this.updateBullets(dt * 0.25);
    }

    this.updateEffects(dt);
    Input.endFrame();
  },

  reflexScale: function () {
    /* three times faster: the world runs at a third speed when danger is near */
    var p = this.player;
    if (!p) return 1;
    var near = 1e9;
    for (var i = 0; i < this.enemies.length; i++) {
      near = Math.min(near, dist(p.x, p.y, this.enemies[i].x, this.enemies[i].y));
    }
    for (var j = 0; j < this.shots.length; j++) {
      near = Math.min(near, dist(p.x, p.y, this.shots[j].x, this.shots[j].y));
    }
    var t = clamp((260 - near) / 160, 0, 1);
    return 1 - t * 0.68;
  },

  updateEffects: function (dt) {
    if (this.blast && this.state === 'playing') {
      this.blast.time = Math.max(0, this.blast.time - dt);
      this.processBlast();
      if (this.blast.time <= 0) this.blast = null;
    }
    var i;
    for (i = this.parts.length - 1; i >= 0; i--) {
      var q = this.parts[i];
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= Math.pow(0.12, dt); q.vy *= Math.pow(0.12, dt);
      q.vy += q.g * dt;
      q.life -= dt;
      if (q.life <= 0) this.parts.splice(i, 1);
    }
    for (i = this.floats.length - 1; i >= 0; i--) {
      var f = this.floats[i];
      f.y -= 34 * dt; f.life -= dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flash = Math.max(0, this.flash - dt * 3.2);
  },

  updatePlayer: function (dt) {
    var p = this.player;
    if (!p || p.dead) return;

    var mv = Input.moveVector();
    var accel = 2400;
    p.vx += mv.x * accel * dt;
    p.vy += mv.y * accel * dt;

    var maxSpeed = 330 * (this.powers.pain ? 1.04 : 1);
    var speed = Math.hypot(p.vx, p.vy);
    if (speed > maxSpeed) { p.vx = p.vx / speed * maxSpeed; p.vy = p.vy / speed * maxSpeed; }
    var friction = Math.pow(mv.x || mv.y ? 0.0009 : 0.00002, dt);
    p.vx *= friction; p.vy *= friction;

    p.x += p.vx * dt; p.y += p.vy * dt;
    var pad = 26;
    if (p.x < pad) { p.x = pad; p.vx = Math.abs(p.vx) * 0.2; }
    if (p.x > W - pad) { p.x = W - pad; p.vx = -Math.abs(p.vx) * 0.2; }
    if (p.y < pad) { p.y = pad; p.vy = Math.abs(p.vy) * 0.2; }
    if (p.y > H - pad) { p.y = H - pad; p.vy = -Math.abs(p.vy) * 0.2; }

    /* walk cycle speed follows actual movement, so an idle stickman stands */
    var spd = Math.hypot(p.vx, p.vy);
    p.gait = lerp(p.gait, clamp(spd / 260, 0, 1), 1 - Math.pow(0.0001, dt));
    p.phase += dt * (6 + spd * 0.028) * (0.3 + p.gait);
    p.facing = p.vx < -8 ? -1 : p.vx > 8 ? 1 : p.facing;

    /* Aim from the shoulder rather than the feet: the muzzle is on that
     * arm, so shots travel through the crosshair instead of above it. */
    var shoulder = this.playerPose().shoulder;
    if (Input.touch.active && Input.touch.aimId !== -1) {
      p.aim = angleTo(shoulder.x, shoulder.y, Input.touch.ax, Input.touch.ay);
    } else {
      p.aim = angleTo(shoulder.x, shoulder.y, Input.mouse.x, Input.mouse.y);
    }

    /* timers */
    p.fireCd -= dt; p.dashCd -= dt; p.iframes -= dt; p.hurtT -= dt;
    p.meleeCd = Math.max(0, p.meleeCd - dt);
    p.comboTimer = Math.max(0, p.comboTimer - dt);
    this.updateMelee(dt);
    p.muzzle = Math.max(0, p.muzzle - dt);
    p.regenT += dt;
    if (this.powers.heart) {
      p.maxhp = 160;
      if (p.regenT > 3.5 && p.hp < p.maxhp) {
        p.hp = Math.min(p.maxhp, p.hp + 5 * dt);
      }
    }

    /* dash */
    if (p.dashT > 0) {
      p.dashT -= dt;
      if (this.powers.sonic) {
        this.sonicTrail(p);
      } else if (Math.random() < 0.6) {
        this.puff(p.x, p.y + p.size * 0.5);
      }
    }

    /* firing: hold to spray */
    var wantFire = Input.mouse.down || Input.down('Space') || Input.hit('KeyJ') ||
      (Input.touch.active && Input.touch.aimId !== -1);
    if (wantFire && p.fireCd <= 0 && !p.attack) this.fire();
  },

  // Close combat is independent of the equipped ranged weapon. Each press
  // starts one committed attack; a timed active frame applies damage once.
  startMelee: function (kind) {
    var p = this.player;
    if (this.state !== 'playing' || !p || p.dead) return false;
    if (kind !== 'kungfu' && kind !== 'sword') return false;
    if (p.meleeCd > 0 || p.attack) { p.queuedMelee = kind; return true; }
    var move = kind === 'sword' ? 'sword' : (p.comboTimer > 0 && p.comboStep === 1 ? 'kick' : 'punch');
    if (kind === 'kungfu') {
      p.comboStep = move === 'punch' ? 1 : 0;
      p.comboTimer = 1.1;
    }
    var duration = move === 'sword' ? 0.46 : (move === 'kick' ? 0.43 : 0.32);
    p.attack = { move: move, aim: p.aim, time: 0, duration: duration, hit: false };
    p.meleeCd = duration + 0.05;
    p.muzzle = 0;
    p.vx += Math.cos(p.aim) * (move === 'kick' ? 105 : 55);
    p.vy += Math.sin(p.aim) * (move === 'kick' ? 105 : 55);
    if (typeof Sfx.swing === 'function') Sfx.swing(move);
    return true;
  },

  updateMelee: function (dt) {
    var p = this.player, a = p && p.attack;
    if (!p) return;
    if (!a) {
      if (p.queuedMelee && p.meleeCd <= 0) {
        var next = p.queuedMelee; p.queuedMelee = null; this.startMelee(next);
      }
      return;
    }
    a.time += dt;
    var progress = a.time / a.duration;
    if (!a.hit && progress >= 0.36) {
      a.hit = true;
      var reach = a.move === 'sword' ? 140 : (a.move === 'kick' ? 80 : 90);
      var damage = a.move === 'sword' ? 38 : (a.move === 'kick' ? 30 : 18);
      var halfArc = a.move === 'sword' ? 1.15 : 0.68;
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (e.dead) continue;
        var dx = e.x - p.x, dy = e.y - p.y;
        var distance = Math.hypot(dx, dy);
        if (distance > reach + e.r || (distance > e.r && Math.abs(angleDelta(a.aim, Math.atan2(dy, dx))) > halfArc)) continue;
        this.hurtEnemy(e, damage, a.aim);
        this.shake = Math.max(this.shake, a.move === 'sword' ? 5 : 3);
      }
      for (var ci = this.crates.length - 1; ci >= 0; ci--) {
        var box = this.crates[ci];
        var cx = box.x - p.x, cy = box.y + p.size * 0.4 - p.y;
        var cd = Math.hypot(cx, cy);
        if (cd <= reach + 24 && (cd <= 24 || Math.abs(angleDelta(a.aim, Math.atan2(cy, cx))) <= halfArc)) {
          this.hitCrate(box, damage);
        }
      }
    }
    if (progress >= 1) p.attack = null;
  },

  gainInk: function (amount) {
    var p = this.player;
    if (!p || p.dead || this.blasting) return;
    var wasReady = p.ink >= 100;
    p.ink = Math.min(100, p.ink + amount);
    if (!wasReady && p.ink >= 100) {
      this.toastText = 'INK BLAST READY - PRESS Q';
      this.toast = 2.8;
      if (typeof Sfx.pickup === 'function') Sfx.pickup();
    }
  },

  activateBlast: function () {
    var p = this.player;
    if (this.state !== 'playing' || !p || p.dead || p.ink < 100 || this.blast) return false;
    p.ink = 0;
    p.iframes = Math.max(p.iframes, 0.38);
    var radius = 225;
    this.blast = { x: p.x, y: p.y - p.size * 0.4, groundY: p.y,
      time: 0.48, duration: 0.48, radius: radius, hits: [] };
    this.shake = Math.max(this.shake, 12);
    this.processBlast();
    if (typeof Sfx.blast === 'function') Sfx.blast();
    else Sfx.dash();
    return true;
  },

  processBlast: function () {
    var b = this.blast;
    if (!b) return;
    var progress = 1 - b.time / b.duration;
    var radius = b.radius * (0.25 + 0.75 * progress);
    this.blasting = true;
    try {
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (!e.dead && b.hits.indexOf(e) === -1 && dist(b.x, b.groundY, e.x, e.y) <= radius + e.r) {
          b.hits.push(e);
          this.hurtEnemy(e, e.type === 'boss' ? 55 : 65, angleTo(b.x, b.groundY, e.x, e.y));
        }
      }
    } finally { this.blasting = false; }
    for (var c = this.crates.length - 1; c >= 0; c--) {
      var box = this.crates[c];
      if (dist(b.x, b.y, box.x, box.y) <= radius + 23) this.hitCrate(box, 65);
    }
    for (var j = this.shots.length - 1; j >= 0; j--) {
      if (dist(b.x, b.y, this.shots[j].x, this.shots[j].y) <= radius) this.shots.splice(j, 1);
    }
  },

  weaponDef: function () {
    return this.WEAPONS[(this.player && this.player.weapon) || 'pen'] || this.WEAPONS.pen;
  },

  fire: function () {
    var p = this.player;
    var w = this.weaponDef();
    var rate = w.rate * (this.powers.pain ? 0.82 : 1);
    p.fireCd = rate;

    /* six arms triples the shots; the spread stays in the weapon's hands */
    var volley = w.shots * (this.powers.arms ? 3 : 1);
    var spread = w.spread;
    /* the bullet leaves the end of the weapon, read off the very pose the
     * figure is drawn in this frame */
    p.vx -= Math.cos(p.aim) * w.kick;
    p.vy -= Math.sin(p.aim) * w.kick;
    var muzzle = this.muzzlePoint();
    var firedWeapon = p.weapon;

    for (var i = 0; i < volley; i++) {
      var a = p.aim + (volley === 1 ? 0 : (i - (volley - 1) / 2) * spread);
      this.bullets.push({
        x: muzzle.x, y: muzzle.y,
        vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
        life: w.life, dmg: w.dmg, r: w.r, a: a,
        w: p.weapon, len: w.len,
        pierce: w.pierce || 0, bounce: w.bounce || 0,
        traveled: 0, dead: false
      });
    }

    p.muzzle = 0.06;
    p.muzzleWeapon = firedWeapon;

    /* ammunition: the pen is the only weapon that never runs dry */
    if (p.ammo !== Infinity) {
      p.ammo -= 1;
      if (p.ammo <= 0) this.expireWeapon();
    }

    // A tab may still have the pre-weapons audio script cached after an update.
    // Missing optional weapon sounds must never stop the animation loop.
    if (typeof Sfx.shootFor === 'function') Sfx.shootFor(firedWeapon);
    else if (typeof Sfx.shoot === 'function') Sfx.shoot();
  },

  expireWeapon: function () {
    var p = this.player;
    var was = this.weaponDef().name;
    p.weapon = 'pen';
    p.ammo = Infinity;
    this.bannerText = was + ' EMPTY — BACK TO THE PEN';
    this.banner = 1.4;
  },

  equipWeapon: function (id) {
    var def = this.WEAPONS[id];
    if (!def || !this.player) return false;
    this.player.weapon = id;
    this.player.ammo = def.ammo;
    this.player.muzzle = 0;
    this.toastText = def.name + ' - ' + def.tip;
    this.toast = 2.4;
    Sfx.pickup();
    return true;
  },

  dash: function () {
    var p = this.player;
    if (!p || p.dead || p.dashCd > 0) return;
    p.dashCd = this.powers.sonic ? 0.62 : 1.0;
    p.dashT = 0.16;
    p.iframes = 0.28;
    var mv = Input.moveVector();
    var a = (mv.x || mv.y) ? Math.atan2(mv.y, mv.x) : p.aim;
    var power = 1150;
    p.vx = Math.cos(a) * power;
    p.vy = Math.sin(a) * power;
    if (this.powers.sonic) {
      this.teleport(a);
    }
    Sfx.dash();
  },

  teleport: function (a) {
    var p = this.player;
    var from = { x: p.x, y: p.y };
    var step = 150;
    p.x = clamp(p.x + Math.cos(a) * step, 26, W - 26);
    p.y = clamp(p.y + Math.sin(a) * step, 26, H - 26);
    /* anything on the line gets cut */
    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      if (this.distToSegment(e.x, e.y, from.x, from.y, p.x, p.y) < e.r + 18) {
        this.hurtEnemy(e, 26, a);
      }
    }
    for (var k = 0; k < 12; k++) {
      this.ink(from.x + Math.random() * 40 - 20, from.y + Math.random() * 40 - 20,
               2 + Math.random() * 3, 0.3);
    }
  },

  distToSegment: function (px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len = dx * dx + dy * dy;
    var t = len ? clamp(((px - ax) * dx + (py - ay) * dy) / len, 0, 1) : 0;
    return dist(px, py, ax + dx * t, ay + dy * t);
  },

  sonicTrail: function (p) {
    this.marks.push({ x: p.x, y: p.y, t: 0.5, size: p.size });
    if (this.marks.length > 14) this.marks.shift();
  },

  updateEnemies: function (dt) {
    var p = this.player;
    if (!p) return;
    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      e.t += dt;
      e.hurt = Math.max(0, e.hurt - dt);
      e.stun = Math.max(0, e.stun - dt);
      e.attackCd -= dt;
      e.throwCd -= dt;

      if (e.dead) {
        e.deadT += dt;
        if (e.deadT > 0.45) this.enemies.splice(i, 1);
        continue;
      }

      var d = dist(e.x, e.y, p.x, p.y) || 1;
      var ax = (p.x - e.x) / d, ay = (p.y - e.y) / d;
      var spd = e.speed * (e.stun > 0 ? 0.15 : 1);

      if (e.type === 'boss') {
        if (!e.enraged && e.hp <= e.maxhp / 2) {
          e.enraged = true;
          this.toastText = 'THE GUARDIAN IS ENRAGED'; this.toast = 2.4;
          this.shake = Math.max(this.shake, 7);
        }
        e.bossTimer -= dt;
        if (e.bossPhase === 'idle') {
          e.x += ax * spd * dt; e.y += ay * spd * dt;
          if (e.bossTimer <= 0) {
            e.bossPhase = 'windup'; e.bossTimer = e.enraged ? 0.65 : 0.85;
            e.chargeX = ax; e.chargeY = ay;
          }
        } else if (e.bossPhase === 'windup') {
          if (e.bossTimer <= 0) { e.bossPhase = 'charge'; e.bossTimer = 0.48; }
        } else {
          e.x = clamp(e.x + e.chargeX * 330 * dt, 40, W - 40);
          e.y = clamp(e.y + e.chargeY * 330 * dt, 40, H - 40);
          if (e.bossTimer <= 0) {
            e.bossPhase = 'idle'; e.bossTimer = e.enraged ? 1.5 : 2.2;
            if (e.enraged) {
              for (var k = 0; k < 8; k++) {
                var ba2 = k * TAU / 8;
                this.shots.push({ x: e.x, y: e.y - e.size * 0.4,
                  vx: Math.cos(ba2) * 210, vy: Math.sin(ba2) * 210,
                  life: 2.2, r: 6, dmg: 7 });
              }
            }
          }
        }
      } else if (e.type === 'swordsman') {
        e.swordTimer -= dt;
        if (e.swordPhase === 'approach') {
          e.x += ax * spd * dt; e.y += ay * spd * dt;
          if (d < 160 && e.swordTimer <= 0) {
            e.swordPhase = 'windup'; e.swordTimer = 0.65;
            e.chargeX = ax; e.chargeY = ay; e.swordHit = false;
          }
        } else if (e.swordPhase === 'windup') {
          if (e.swordTimer <= 0) { e.swordPhase = 'lunge'; e.swordTimer = 0.3; }
        } else if (e.swordPhase === 'lunge') {
          e.x = clamp(e.x + e.chargeX * 420 * dt, 40, W - 40);
          e.y = clamp(e.y + e.chargeY * 420 * dt, 40, H - 40);
          if (!e.swordHit && dist(e.x, e.y, p.x, p.y) < e.r + 40) {
            e.swordHit = true; this.damagePlayer(e.dmg, e.chargeX, e.chargeY);
          }
          if (e.swordTimer <= 0) { e.swordPhase = 'recovery'; e.swordTimer = 0.85; }
        } else if (e.swordTimer <= 0) {
          e.swordPhase = 'approach'; e.swordTimer = 0.2;
        }
      } else if (e.type === 'thrower') {
        /* keep a working distance, then throw */
        var want = 250;
        var push = d < want ? -1 : d > want + 90 ? 1 : 0;
        e.x += ax * spd * push * dt;
        e.y += ay * spd * push * dt;
        e.x += -ay * spd * 0.35 * dt * Math.sin(e.t * 1.3);
        e.y += ax * spd * 0.35 * dt * Math.sin(e.t * 1.3);
        if (e.throwCd <= 0 && d < 520) {
          e.throwCd = 2.2;
          var ba = angleTo(e.x, e.y - e.size * 0.3, p.x, p.y);
          /* the thrown stone also leaves the thrower's hand, not its chest */
          var ePose = Rig.pose({
            x: e.x, y: e.y, size: e.size, phase: e.phase, gait: e.gait || 0,
            t: this.t, seed: e.seed, aim: ba
          });
          var eHand = ePose.armPairs[0].right.hand;
          var eScale = Math.max(0.4, e.size / 132);
          var hx = eHand.x + Math.cos(ba) * 6 * eScale;
          var hy = eHand.y + Math.sin(ba) * 6 * eScale;
          this.shots.push({
            x: hx, y: hy,
            vx: Math.cos(ba) * 300, vy: Math.sin(ba) * 300, life: 3, r: 7, dmg: 9
          });
          Sfx.hit();
        }
      } else {
        e.x += ax * spd * dt;
        e.y += ay * spd * dt;
        if (e.type === 'runner') {
          e.x += -ay * Math.sin(e.t * 6) * 26 * dt;
          e.y += ax * Math.sin(e.t * 6) * 26 * dt;
        }
      }

      /* bodies do not stack: a gentle separation pass */
      for (var j = i - 1; j >= 0; j--) {
        var o = this.enemies[j];
        if (o.dead) continue;
        var dd = dist(e.x, e.y, o.x, o.y);
        var min = e.r + o.r;
        if (dd > 0 && dd < min) {
          var push2 = (min - dd) / dd * 0.5;
          e.x += (e.x - o.x) * push2; e.y += (e.y - o.y) * push2;
          o.x -= (e.x - o.x) * push2 * 0.5; o.y -= (e.y - o.y) * push2 * 0.5;
        }
      }

      /* contact damage */
      if (e.type !== 'swordsman' && d < e.r + 20 && e.attackCd <= 0) {
        e.attackCd = 0.9;
        this.damagePlayer(e.dmg, ax, ay);
      }

      e.phase += dt * (e.type === 'runner' ? 15 : 7);
      e.gait = 1;
    }
  },

  updateBullets: function (dt) {
    var i, j;
    for (i = this.bullets.length - 1; i >= 0; i--) {
      var b = this.bullets[i];
      var previousX = b.x, previousY = b.y;
      if (this.powers.eyes && b.pierce <= 0) this.home(b, dt);
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.traveled !== undefined) b.traveled += Math.hypot(b.vx, b.vy) * dt;
      b.life -= dt;

      /* the eraser ricochets off the margin instead of dying there */
      if (b.bounce > 0) {
        if (b.x < 10 || b.x > W - 10) {
          b.vx *= -1; b.bounce--;
          b.x = clamp(b.x, 10, W - 10);
          Sfx.hit();
        }
        if (b.y < 10 || b.y > H - 10) {
          b.vy *= -1; b.bounce--;
          b.y = clamp(b.y, 10, H - 10);
          Sfx.hit();
        }
      }

      if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) {
        this.bullets.splice(i, 1);
        continue;
      }

      for (j = 0; j < this.enemies.length; j++) {
        var e = this.enemies[j];
        if (e.dead || (b.hits && b.hits.indexOf(e) !== -1)) continue;
        /* A stick figure is tall and thin, so its hit area is a vertical
         * capsule from the feet to the shoulders. A round box centred on the
         * chest let bullets fly straight through a body at hip height, which
         * read as the gun being broken. */
        var rr = e.r * 0.92 + b.r + 2;
        var bodyTop = e.y - e.size * 0.80;
        var bodyLow = e.y - e.size * 0.06;
        var hit = this.distToSegment(b.x, b.y, e.x, bodyTop, e.x, bodyLow) < rr;
        if (hit) {
          this.hurtEnemy(e, b.dmg, b.a);
          if (b.pierce > 0) {
            /* punch through: remember the body so it cannot be hit twice */
            b.pierce--;
            if (!b.hits) b.hits = [];
            b.hits.push(e);
            b.dmg *= 0.85;
          } else {
            this.bullets.splice(i, 1);
          }
          break;
        }
      }
      // Swept collision prevents fast needles skipping a small supply box.
      if (this.bullets[i] === b) {
        for (j = this.crates.length - 1; j >= 0; j--) {
          var box = this.crates[j];
          if (this.distToSegment(box.x, box.y, previousX, previousY, b.x, b.y) <= 23 + b.r) {
            this.hitCrate(box, b.dmg);
            this.bullets.splice(i, 1);
            break;
          }
        }
      }
    }

    for (i = this.shots.length - 1; i >= 0; i--) {
      var s = this.shots[i];
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0 || s.x < -30 || s.x > W + 30 || s.y < -30 || s.y > H + 30) {
        this.shots.splice(i, 1);
        continue;
      }
      var p = this.player;
      if (p && p.iframes <= 0 && dist2(s.x, s.y, p.x, p.y - p.size * 0.3) < (s.r + 14) * (s.r + 14)) {
        this.damagePlayer(s.dmg, s.vx / 300, s.vy / 300);
        this.shots.splice(i, 1);
      }
    }
  },

  home: function (b, dt) {
    var best = null, bd = 260 * 260;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead) continue;
      var d = dist2(b.x, b.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    var want = angleTo(b.x, b.y, best.x, best.y);
    var cur = Math.atan2(b.vy, b.vx);
    var na = cur + angleDelta(cur, want) * clamp(7 * dt, 0, 1);
    var sp = Math.hypot(b.vx, b.vy);
    b.vx = Math.cos(na) * sp;
    b.vy = Math.sin(na) * sp;
    b.a = na;
  },

  hurtEnemy: function (e, dmg, dirA) {
    if (e.dead) return;
    e.hp -= dmg;
    if (e.type === 'swordsman' && e.swordPhase === 'windup') { e.swordPhase = 'recovery'; e.swordTimer = 0.65; }
    this.gainInk(Math.max(3, Math.min(12, dmg * 0.4)));
    e.hurt = 0.12;
    e.stun = Math.min(0.35, e.stun + 0.12);
    var push = (e.type === 'brute' || e.type === 'boss') ? 26 : 90;
    e.x += Math.cos(dirA) * push * 0.12;
    e.y += Math.sin(dirA) * push * 0.12;
    this.ink(e.x, e.y - e.size * 0.4, 2 + Math.random() * 2, 0.35);
    Sfx.hit();
    if (e.hp <= 0) this.killEnemy(e, dirA);
  },

  killEnemy: function (e, dirA) {
    e.dead = true;
    e.deadT = 0;
    this.kills++;
    this.gainInk(8);
    this.combo = Math.min(this.combo + 1, 9);
    this.comboTimer = 3.2;
    var mult = Math.max(1, this.combo);
    var gained = e.score * mult;
    this.score += gained;
    this.floats.push({ x: e.x, y: e.y - e.size, text: '+' + gained, life: 0.9 });
    /* ink burst */
    var n = e.type === 'brute' ? 26 : 12;
    for (var i = 0; i < n; i++) {
      var a = dirA + (Math.random() - 0.5) * 2.6;
      var sp = 60 + Math.random() * 260;
      this.parts.push({
        x: e.x, y: e.y - e.size * 0.4,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life: 0.4 + Math.random() * 0.5, g: 620,
        r: 1.5 + Math.random() * 3.5, kind: 'ink'
      });
    }
    this.splat(e.x, e.y);

    /* a weapon every few kills, more often from the heavy ones */
    var chance = e.type === 'boss' ? 0 : e.type === 'brute' ? 0.55 : 0.14;
    if (this.rng() < chance) this.dropWeapon(e.x, e.y);
    this.shake = Math.min(14, this.shake + (e.type === 'brute' ? 10 : 4));
    if (e.type === 'brute') this.freeze = 0.07;
    Sfx.kill();
  },

  damagePlayer: function (amount, nx, ny) {
    var p = this.player;
    if (!p || p.dead || p.iframes > 0) return;
    p.hp -= amount;
    p.hurtT = 0.35;
    p.iframes = 0.55;
    p.regenT = 0;
    this.shake = Math.min(18, this.shake + 8);
    this.flash = Math.max(this.flash, 0.35);
    this.combo = 0;
    if (!this.powers.pain) {
      p.vx += (nx || 0) * 340;
      p.vy += (ny || 0) * 340;
    }
    for (var i = 0; i < 10; i++) {
      this.ink(p.x + (Math.random() - 0.5) * 20, p.y - 20 + (Math.random() - 0.5) * 20,
               2 + Math.random() * 2, 0.35);
    }
    Sfx.hurt();
    if (p.hp <= 0) this.die();
  },

  die: function () {
    var p = this.player;
    p.dead = true;
    p.hp = 0;
    this.state = 'dead';
    this.best = Math.max(this.best, this.score);
    Store.set('best', this.best);
    this.shake = 20;
    this.freeze = 0.18;
    for (var i = 0; i < 30; i++) {
      var a = Math.random() * TAU, sp = 60 + Math.random() * 300;
      this.parts.push({
        x: p.x, y: p.y - p.size * 0.4,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80,
        life: 0.5 + Math.random() * 0.7, g: 700,
        r: 1.5 + Math.random() * 4, kind: 'ink'
      });
    }
    Sfx.gameover();
  },

  ink: function (x, y, r, life) {
    if (this.parts.length > 320) return;
    this.parts.push({
      x: x, y: y, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90,
      life: life, g: 260, r: r, kind: 'ink'
    });
  },

  puff: function (x, y) {
    this.parts.push({
      x: x + (Math.random() - 0.5) * 16, y: y + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 40, vy: -10 - Math.random() * 30,
      life: 0.35, g: -20, r: 2 + Math.random() * 2.5, kind: 'dust'
    });
  },

  splat: function (x, y) {
    if (this.splats.length > 90) this.splats.shift();
    var blobs = [];
    var n = 3 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      blobs.push({
        dx: (Math.random() - 0.5) * 46,
        dy: (Math.random() - 0.5) * 30,
        r: 3 + Math.random() * 9
      });
    }
    this.splats.push({ x: x, y: y, blobs: blobs });
  },

  hitCrate: function (box, damage) {
    var index = this.crates.indexOf(box);
    if (index === -1) return;
    box.hp -= damage;
    this.ink(box.x, box.y, 3, 0.25);
    if (box.hp > 0) return;
    this.crates.splice(index, 1);
    for (var i = 0; i < 8; i++) this.ink(box.x, box.y, 2 + Math.random() * 3, 0.4);
    if (this.pickups.length > 6) this.pickups.shift();
    if (box.kind === 'health') {
      this.pickups.push({ x: box.x, y: box.y, kind: 'health', t: 0, life: 22, bob: this.rng() * TAU });
    } else this.dropWeapon(box.x, box.y, box.kind);
    this.toastText = 'SUPPLIES FOUND - WALK OVER TO COLLECT'; this.toast = 2.2;
    Sfx.pickup();
  },

  dropWeapon: function (x, y, id) {
    if (this.pickups.length > 6) return null;
    var which = id || this.WEAPON_IDS[Math.floor(this.rng() * this.WEAPON_IDS.length)];
    var pick = {
      x: clamp(x, 40, W - 40), y: clamp(y, 40, H - 40),
      w: which, t: 0, life: 14, bob: this.rng() * TAU
    };
    this.pickups.push(pick);
    return pick;
  },

  updatePickups: function (dt) {
    var p = this.player;
    if (!p) return;
    for (var i = this.pickups.length - 1; i >= 0; i--) {
      var k = this.pickups[i];
      k.t += dt;
      k.life -= dt;
      if (k.life <= 0) { this.pickups.splice(i, 1); continue; }
      if (!p.dead && dist(k.x, k.y, p.x, p.y - p.size * 0.4) < 42) {
        if (k.kind === 'health') {
          if (p.hp >= p.maxhp) continue;
          p.hp = Math.min(p.maxhp, p.hp + 25);
          this.toastText = 'FIRST AID +25 HP'; this.toast = 1.8;
          Sfx.pickup();
        } else this.equipWeapon(k.w);
        for (var n = 0; n < 10; n++) this.ink(k.x, k.y, 2 + Math.random() * 2, 0.3);
        this.pickups.splice(i, 1);
      }
    }
  },

  updatePending: function (dt) {
    for (var i = this.pending.length - 1; i >= 0; i--) {
      var s = this.pending[i];
      s.t -= dt;
      if (s.t <= 0) {
        this.spawnEnemy(s.type, s.x, s.y);
        this.pending.splice(i, 1);
      }
    }
  },

  betweenWaves: function () {
    /* offer a power every other wave, starting after wave two */
    if (this.wave >= 2 && this.wave % 2 === 0) {
      this.offerPowers();
    } else {
      this.nextWave();
    }
  },

  offerPowers: function () {
    var pool = this.POWERS.filter(function (p) { return !Game.powers[p.id]; }, this);
    if (pool.length === 0) {
      if (this.house && this.house.waitingForPower) this.loadHouseRoom(3);
      else this.nextWave();
      return;
    }
    /* two distinct choices */
    var a = Math.floor(this.rng() * pool.length);
    var first = pool[a];
    var rest = pool.filter(function (p) { return p.id !== first.id; });
    var second = rest[Math.floor(this.rng() * rest.length)] || first;
    this.offer = [first, second];
    this.sel = 0;
    this.state = 'power';
    Sfx.pickup();
  },

  choosePower: function (index) {
    if (this.state !== 'power') return;
    var p = this.offer[index === undefined ? this.sel : index];
    if (!p) return;
    this.powers[p.id] = true;
    if (p.id === 'arms') this.player.arms = 3;
    if (p.id === 'heart') { this.player.maxhp = 160; this.player.hp = Math.min(160, this.player.hp + 60); }
    this.offer = [];
    this.state = 'playing';
    this.bannerText = 'WHAT IF ' + p.short + '?';
    this.banner = 1.6;
    Sfx.choose();
    if (this.house && this.house.waitingForPower) this.loadHouseRoom(3);
    else this.nextWave();
  },

  /* -------------------------------------------------------------- render --- */
  render: function () {
    var ctx = this.ctx;
    if (!ctx) return;
    if (this.state === 'duel') { Duel.render(ctx); return; }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width || W, this.canvas.height || H);

    /* the world is drawn in logical 1280x720 space */
    var scale = this.viewScale || 1;
    var ox = this.viewX || 0, oy = this.viewY || 0;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);

    var sh = this.shake;
    if (sh > 0.1) {
      ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    }

    this.drawPaper(ctx);
    if (this.house && this.state !== 'map') this.drawHouseRoom(ctx);
    this.drawGround(ctx);
    this.drawMarks(ctx);
    this.drawCrates(ctx);
    this.drawPickups(ctx);
    this.drawPending(ctx);
    this.drawEnemies(ctx);
    this.drawPlayer(ctx);
    this.drawBullets(ctx);
    this.drawBlast(ctx);
    this.drawParticles(ctx);
    this.drawFloats(ctx);

    if (this.flash > 0.01) {
      ctx.fillStyle = 'rgba(255,60,60,' + (this.flash * 0.22) + ')';
      ctx.fillRect(-40, -40, W + 80, H + 80);
    }

    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    this.drawHUD(ctx);

    if (this.state === 'menu') this.drawMenu(ctx);
    if (this.state === 'map') this.drawMap(ctx);
    if (this.state === 'victory') this.drawVictory(ctx);
    if (this.state === 'power') this.drawPower(ctx);
    if (this.state === 'dead') this.drawDead(ctx);
    if (this.state === 'paused') this.drawPaused(ctx);

    ctx.restore();
  },

  drawHouseRoom: function (ctx) {
    var h = this.house;
    ctx.save();
    // Ruled-paper rooms are distinct pages of the same house, not a loading screen.
    ctx.strokeStyle = 'rgba(42,38,35,0.22)'; ctx.lineWidth = 3;
    ctx.strokeRect(86, 95, W - 172, H - 160);
    ctx.fillStyle = 'rgba(35,32,30,0.38)';
    ctx.textAlign = 'left'; ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillText(['', '01 / THE ENTRY', '02 / THE HALL', '03 / GUARDIAN ROOM'][h.room], 105, 121);
    // Faint furniture and floor mats establish a place without blocking combat.
    ctx.fillStyle = 'rgba(120,100,80,0.065)'; ctx.strokeStyle = 'rgba(65,56,48,0.18)'; ctx.lineWidth = 2;
    if (h.room === 1) {
      ctx.fillRect(145, 150, 210, 54); ctx.strokeRect(145, 150, 210, 54);
      ctx.beginPath(); ctx.moveTo(145, 180); ctx.lineTo(355, 180);
      ctx.moveTo(215, 150); ctx.lineTo(215, 204); ctx.moveTo(285, 150); ctx.lineTo(285, 204); ctx.stroke();
      ctx.fillStyle = 'rgba(130,100,80,0.05)'; ctx.fillRect(440, 275, 370, 215);
      ctx.strokeRect(440, 275, 370, 215);
      ctx.fillStyle = 'rgba(60,50,40,0.35)'; ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.fillText('SUPPLIES', 193, 170);
    }
    if (h.room === 2) {
      ctx.strokeStyle = 'rgba(45,42,40,0.18)'; ctx.lineWidth = 2;
      ctx.strokeRect(530, 130, 220, 58);
      ctx.beginPath(); ctx.moveTo(545, 160); ctx.lineTo(735, 160); ctx.stroke();
      ctx.fillStyle = 'rgba(130,100,80,0.05)'; ctx.fillRect(325, 240, 630, 300);
      ctx.strokeRect(325, 240, 630, 300);
      ctx.fillStyle = 'rgba(60,50,40,0.35)'; ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.fillText('THE TRAINING HALL', 640, 151); ctx.textAlign = 'left';
    } else if (h.room === 3) {
      ctx.strokeStyle = 'rgba(186,52,52,0.22)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 190, 0, TAU); ctx.stroke();
    }
    if (h.room < 3) {
      var x = W - 112, y = H / 2;
      ctx.fillStyle = h.exitOpen ? '#fdfbf2' : '#b9b4aa';
      ctx.strokeStyle = h.exitOpen ? '#c62b30' : '#5d5852'; ctx.lineWidth = 4;
      ctx.fillRect(x, y - 58, 42, 116); ctx.strokeRect(x, y - 58, 42, 116);
      ctx.fillStyle = h.exitOpen ? '#c62b30' : '#625c55';
      ctx.beginPath(); ctx.arc(x + 30, y, 3, 0, TAU); ctx.fill();
      ctx.textAlign = 'right'; ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillText(h.exitOpen ? 'NEXT ROOM  →' : 'CLEAR TO OPEN', x - 10, y - 69);
    }
    ctx.restore();
  },

  drawMap: function (ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(246,243,235,0.98)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#a52c2e';
    ctx.font = 'bold 13px ui-monospace, monospace'; ctx.fillText('THE PAGE / CHAPTER 01', W / 2, 83);
    ctx.fillStyle = '#202024'; ctx.font = 'bold 48px ui-monospace, monospace';
    ctx.fillText('THE HOUSE MAP', W / 2, 140);
    ctx.fillStyle = '#77716a'; ctx.font = '15px ui-monospace, monospace';
    ctx.fillText('Clear the rooms. Find the guardian. Open the way.', W / 2, 175);
    ctx.strokeStyle = '#bab3a9'; ctx.lineWidth = 3; ctx.setLineDash([7, 9]);
    ctx.beginPath(); ctx.moveTo(320, 353); ctx.lineTo(960, 353); ctx.stroke(); ctx.setLineDash([]);
    var cards = [
      {x: 140, title: 'THE FIRST HOUSE', sub: '3 ROOMS  /  1 GUARDIAN', active: true},
      {x: 500, title: 'HOUSE 02', sub: 'COMING SOON', active: false},
      {x: 860, title: 'HOUSE 03', sub: 'COMING SOON', active: false}
    ];
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i], x = c.x, y = 240;
      ctx.fillStyle = c.active ? '#fffdf7' : '#e9e5dc';
      ctx.strokeStyle = c.active ? '#242326' : '#c6c1b7'; ctx.lineWidth = c.active ? 3 : 1.5;
      ctx.fillRect(x, y, 280, 250); ctx.strokeRect(x, y, 280, 250);
      ctx.strokeStyle = c.active ? '#2c2a2b' : '#aaa59d'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x + 80, y + 112); ctx.lineTo(x + 140, y + 60);
      ctx.lineTo(x + 200, y + 112); ctx.lineTo(x + 200, y + 165);
      ctx.lineTo(x + 80, y + 165); ctx.closePath(); ctx.stroke();
      ctx.strokeRect(x + 130, y + 128, 22, 37);
      ctx.fillStyle = c.active ? '#a82e30' : '#aaa59d';
      ctx.fillRect(x + 93, y + 129, 22, 19); ctx.fillRect(x + 165, y + 129, 22, 19);
      ctx.fillStyle = c.active ? '#222126' : '#99948c'; ctx.font = 'bold 17px ui-monospace, monospace';
      ctx.fillText(c.title, x + 140, y + 200);
      ctx.fillStyle = c.active ? '#a82e30' : '#aaa59d'; ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText(c.sub, x + 140, y + 224);
    }
    ctx.fillStyle = '#242326'; ctx.font = 'bold 17px ui-monospace, monospace';
    ctx.fillText('ENTER / CLICK THE FIRST HOUSE TO PLAY', W / 2, 552);
    if (Store.get('house1_complete', false)) {
      ctx.fillStyle = '#a82e30'; ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillText('FIRST HOUSE CLEARED  ✓', W / 2, 587);
    }
    ctx.restore();
  },

  drawVictory: function (ctx) {
    ctx.save(); ctx.fillStyle = 'rgba(246,243,235,0.96)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#aa2e30'; ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillText('CHAPTER 01  /  COMPLETE', W / 2, 190);
    ctx.fillStyle = '#202024'; ctx.font = 'bold 52px ui-monospace, monospace';
    ctx.fillText('HOUSE CLEARED', W / 2, 265);
    ctx.fillStyle = '#716a62'; ctx.font = '17px ui-monospace, monospace';
    ctx.fillText('The Ink Guardian has fallen.', W / 2, 310);
    ctx.fillStyle = '#202024'; ctx.font = 'bold 20px ui-monospace, monospace';
    ctx.fillText('SCORE  ' + this.score + '     KILLS  ' + this.kills, W / 2, 380);
    ctx.fillStyle = '#a82e30'; ctx.font = 'bold 16px ui-monospace, monospace';
    ctx.fillText('ENTER / CLICK TO RETURN TO THE MAP', W / 2, 480);
    ctx.restore();
  },

  drawPaper: function (ctx) {
    ctx.fillStyle = '#f4f1e8';
    ctx.fillRect(-40, -40, W + 80, H + 80);
    if (this.paper) {
      var pat = ctx.createPattern(this.paper, 'repeat');
      if (pat) { ctx.fillStyle = pat; ctx.fillRect(-40, -40, W + 80, H + 80); }
    }
    /* ruled lines */
    ctx.strokeStyle = 'rgba(90,130,175,0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var y = 70; y < H; y += 36) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
    /* margin */
    ctx.strokeStyle = 'rgba(200,80,90,0.35)';
    ctx.beginPath();
    ctx.moveTo(72.5, 0); ctx.lineTo(72.5, H);
    ctx.stroke();
    /* vignette so the eye lands in the middle */
    var g = ctx.createRadialGradient(W / 2, H / 2, H * 0.30, W / 2, H / 2, H * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(40,34,26,0.16)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  },

  drawGround: function (ctx) {
    for (var i = 0; i < this.splats.length; i++) {
      var s = this.splats[i];
      ctx.fillStyle = 'rgba(30,30,34,0.16)';
      for (var j = 0; j < s.blobs.length; j++) {
        var b = s.blobs[j];
        ctx.beginPath();
        ctx.ellipse(s.x + b.dx, s.y + b.dy * 0.5 + 10, b.r, b.r * 0.55, 0, 0, TAU);
        ctx.fill();
      }
    }
  },

  drawMarks: function (ctx) {
    for (var i = 0; i < this.marks.length; i++) {
      var m = this.marks[i];
      m.t -= 0.016;
      ctx.strokeStyle = 'rgba(30,30,34,' + Math.max(0, m.t * 0.25) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y - m.size * 0.7, m.size * 0.5, 0, TAU);
      ctx.stroke();
    }
  },

  drawPending: function (ctx) {
    for (var i = 0; i < this.pending.length; i++) {
      var s = this.pending[i];
      var k = clamp(1 - s.t / 0.9, 0, 1);
      ctx.strokeStyle = 'rgba(30,30,34,' + (0.12 + k * 0.5) + ')';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 18 + (1 - k) * 14, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(30,30,34,' + (0.1 + k * 0.25) + ')';
      ctx.font = 'bold 10px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('?', s.x, s.y + 4);
    }
  },

  /* The stationery lying on the page. Drawn as a small paper tab with the
   * tool itself on it, plus a name, so a player who has never seen a drop
   * knows exactly what it is before touching it. */
  drawCrates: function (ctx) {
    for (var i = 0; i < this.crates.length; i++) {
      var b = this.crates[i];
      ctx.save(); ctx.translate(b.x, b.y);
      ctx.fillStyle = 'rgba(30,30,34,0.12)';
      ctx.beginPath(); ctx.ellipse(0, 26, 33, 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e4d6bb'; ctx.strokeStyle = '#665d4e'; ctx.lineWidth = 2;
      ctx.fillRect(-28, -24, 56, 48); ctx.strokeRect(-28, -24, 56, 48);
      ctx.strokeStyle = 'rgba(91,78,59,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-23,-19); ctx.lineTo(23,19);
      ctx.moveTo(23,-19); ctx.lineTo(-23,19); ctx.stroke();
      ctx.fillStyle = '#fffdf5'; ctx.fillRect(-12, -12, 24, 24);
      if (b.kind === 'health') {
        ctx.fillStyle = '#ba3436'; ctx.fillRect(-3, -9, 6, 18); ctx.fillRect(-9, -3, 18, 6);
      } else {
        ctx.fillStyle = '#29282a'; ctx.fillRect(-8, -2, 16, 4);
        ctx.fillRect(4, -6, 3, 12);
      }
      ctx.textAlign = 'center'; ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.fillStyle = '#504b45'; ctx.fillText('SHOOT / SLASH', 0, 43);
      ctx.restore();
    }
  },

  drawPickups: function (ctx) {
    for (var i = 0; i < this.pickups.length; i++) {
      var k = this.pickups[i];
      var bob = Math.sin(k.t * 3 + k.bob) * 4;
      var fade = k.life < 3 ? (0.35 + Math.abs(Math.sin(k.life * 6)) * 0.65) : 1;
      var w = this.WEAPONS[k.w];
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(k.x, k.y + bob);

      /* shadow on the sheet */
      ctx.fillStyle = 'rgba(30,30,34,0.13)';
      ctx.beginPath();
      ctx.ellipse(0, 20, 24, 6, 0, 0, TAU);
      ctx.fill();

      /* the tab */
      ctx.fillStyle = '#fffdf6';
      ctx.strokeStyle = 'rgba(30,30,34,0.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.rect(-22, -18, 44, 34);
      ctx.fill();
      ctx.stroke();

      if (k.kind === 'health') {
        ctx.fillStyle = '#ba3436'; ctx.fillRect(-3, -11, 6, 20); ctx.fillRect(-10, -4, 20, 6);
      } else this.drawTool(ctx, k.w, 0, -1, 1);

      ctx.fillStyle = 'rgba(30,30,34,0.85)';
      ctx.font = 'bold 9px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(k.kind === 'health' ? '+25 HP' : w.name, 0, 30);
      ctx.restore();
    }
  },

  /* One shape per tool, reused for the pickup tab and for the thing the
   * player is holding, so the pickup always looks like what you get. */
  drawTool: function (ctx, id, x, y, scale, angle) {
    var s = scale || 1;
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    ctx.scale(s, s);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (id === 'ruler') {
      ctx.fillStyle = '#e8d9a8';
      ctx.strokeStyle = '#2a2415';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.rect(-14, -2.5, 28, 5);
      ctx.fill();
      ctx.stroke();
      for (var i = -10; i <= 10; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, -2.5); ctx.lineTo(i, i % 8 === 2 ? 0.5 : -0.5);
        ctx.stroke();
      }
    } else if (id === 'compass') {
      ctx.strokeStyle = '#2a2a30';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-11, 0); ctx.lineTo(11, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-11, 0); ctx.lineTo(-8, -7);
      ctx.moveTo(-11, 0); ctx.lineTo(-8, 7);
      ctx.stroke();
      ctx.fillStyle = '#cc2b2b';
      ctx.beginPath();
      ctx.moveTo(11, 0); ctx.lineTo(6, -2.2); ctx.lineTo(6, 2.2);
      ctx.closePath();
      ctx.fill();
    } else if (id === 'stapler') {
      ctx.fillStyle = '#8a8f96';
      ctx.strokeStyle = '#22252a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.rect(-10, -5, 20, 10);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-10, 2); ctx.lineTo(9, 2);
      ctx.stroke();
    } else if (id === 'eraser') {
      ctx.fillStyle = '#f0d9dd';
      ctx.strokeStyle = '#c98d97';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.rect(-9, -6, 18, 12);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(120,90,96,0.5)';
      ctx.beginPath();
      ctx.moveTo(-9, 0); ctx.lineTo(9, 0);
      ctx.stroke();
    } else {
      /* pen */
      ctx.fillStyle = '#1f2228';
      ctx.strokeStyle = '#f8f4e9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-11, 0);
      ctx.lineTo(4, -2.2);
      ctx.lineTo(11, 0);
      ctx.lineTo(4, 2.2);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.fillStyle = '#cc2b2b';
      ctx.fillRect(-13, -1, 4, 2);
    }
    ctx.restore();
  },

  /* The weapon lives in the stickman's aiming hand, at the same angle as the
   * arm, so the muzzle and the bullets agree. */
  drawHeldWeapon: function (ctx, pose, id, aim) {
    var m = this.muzzlePoint(pose, id, aim);
    var def = this.WEAPONS[id] || this.WEAPONS.pen;
    var artScale = Math.max(0.55, m.scale * 1.15);
    /* Anchor the art by its TIP, not by its middle: the weapon is drawn so
     * that the point the bullets leave from is exactly the point the tool
     * ends at. Otherwise the muzzle floats a few pixels off the barrel and
     * the shot looks like it comes from nowhere. */
    var tip = def.tipLength || 11;
    var grip = { x: m.x - Math.cos(aim) * tip * artScale,
                 y: m.y - Math.sin(aim) * tip * artScale };
    this.drawTool(ctx, id, grip.x, grip.y, artScale, aim);

    /* muzzle puff, a couple of frames after a shot */
    if (this.player.muzzle > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(this.player.muzzle * 10, 0, 1) * 0.8;
      ctx.fillStyle = 'rgba(30,30,34,0.75)';
      ctx.beginPath();
      ctx.arc(m.x, m.y, (id === 'eraser' ? 9 : 4.5) * artScale, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  },

  drawEnemies: function (ctx) {
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      var a = angleTo(e.x, e.y, this.player ? this.player.x : e.x, this.player ? this.player.y : e.y);
      if (e.type === 'swordsman' && (e.swordPhase === 'windup' || e.swordPhase === 'lunge')) a = Math.atan2(e.chargeY, e.chargeX);
      /* only the thrower takes aim; the rest swing their arms as they walk,
       * otherwise every enemy reads as a pointing statue */
      var p = Rig.pose({
        x: e.x, y: e.y, size: e.size, phase: e.phase, gait: e.dead ? 0 : (e.gait || 0),
        t: this.t, seed: e.seed,
        aim: e.dead ? null : ((e.type === 'thrower' || e.type === 'swordsman') ? a : null),
        crouch: e.dead ? 1 : 0
      });
      if (!e.dead && e.type === 'swordsman' && e.swordPhase === 'windup') {
        ctx.save(); ctx.strokeStyle = 'rgba(191,46,48,0.8)'; ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + e.chargeX * 135, e.y + e.chargeY * 135); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
      }
      if (!e.dead && e.type === 'boss' && e.bossPhase === 'windup') {
        ctx.save(); ctx.strokeStyle = 'rgba(194,45,48,0.7)'; ctx.lineWidth = 3;
        ctx.setLineDash([8, 8]); ctx.beginPath();
        ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.chargeX * 260, e.y + e.chargeY * 260);
        ctx.stroke();
        if (e.enraged) {
          ctx.beginPath(); ctx.arc(e.x, e.y - e.size * 0.4, 42, 0, TAU); ctx.stroke();
        }
        ctx.setLineDash([]); ctx.restore();
      }
      if (e.dead) {
        /* fall over and fade out */
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - e.deadT / 0.45);
        ctx.translate(e.x, e.y); ctx.rotate(e.deadT * 2.4); ctx.translate(-e.x, -e.y);
        Rig.draw(ctx, p, { color: '#333', lw: 3.4 });
        ctx.restore();
      } else {
        Rig.draw(ctx, p, {
          color: (e.type === 'brute' || e.type === 'boss') ? '#141417' : '#2f2f36',
          lw: e.type === 'boss' ? 8 : e.type === 'brute' ? 6.5 : 4.2,
          flash: e.hurt > 0 ? 'rgba(220,60,60,0.9)' : null,
          face: e.type !== 'brute'
        });
        if (e.type === 'swordsman') {
          var hand = p.armPairs[0].right.hand;
          ctx.save(); ctx.translate(hand.x, hand.y); ctx.rotate(a);
          ctx.strokeStyle = '#302d2c'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(-4, -7); ctx.lineTo(-4, 7); ctx.stroke();
          ctx.fillStyle = '#fffdf7'; ctx.strokeStyle = '#343234'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(49, -2); ctx.lineTo(58, 0);
          ctx.lineTo(49, 2); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
        if (e.type === 'boss') {
          ctx.save(); ctx.strokeStyle = '#bb2f32'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(p.head.x - 20, p.head.y - p.headR + 4);
          ctx.lineTo(p.head.x - 15, p.head.y - p.headR - 15);
          ctx.lineTo(p.head.x, p.head.y - p.headR - 5);
          ctx.lineTo(p.head.x + 15, p.head.y - p.headR - 15);
          ctx.lineTo(p.head.x + 20, p.head.y - p.headR + 4); ctx.stroke(); ctx.restore();
        }
      }
    }
  },

  /* The one pose the player is drawn in. Firing reads its muzzle out of this
   * same pose, so the bullet always leaves the end of the weapon and never the
   * middle of the body. */
  playerPose: function () {
    var p = this.player;
    return Rig.pose({
      x: p.x, y: p.y, size: p.size,
      phase: p.phase, gait: p.gait,
      t: this.t, seed: 7, aim: p.aim,
      arms: this.powers.arms ? 3 : 1,
      aimSpreads: this.powers.arms ? [0, 0.62, -0.62] : [0],
      crouch: p.dead ? 1 : (p.dashT > 0 ? 0.4 : 0),
      lean: clamp(p.vx / 900, -0.5, 0.5),
      attack: p.attack
    });
  },

  /* Where the weapon ends: the aiming hand, pushed out by the tool's own
   * length, scaled with the figure. */
  muzzlePoint: function (pose, weaponId, aim) {
    var p = this.player;
    pose = pose || this.playerPose();
    var id = weaponId || p.weapon;
    aim = aim === undefined ? p.aim : aim;
    var hand = pose.armPairs[0].right.hand;
    var scale = Math.max(0.4, pose.size / 132);
    var reach = (this.WEAPONS[id] || this.WEAPONS.pen).reach || 12;
    var d = reach * scale;
    return {
      x: hand.x + Math.cos(aim) * d,
      y: hand.y + Math.sin(aim) * d,
      hand: hand,
      scale: scale
    };
  },

  drawPlayer: function (ctx) {
    var p = this.player;
    if (!p) return;
    var pose = this.playerPose();
    if (p.dead) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.translate(p.x, p.y); ctx.rotate(Math.min(1.5, p.deadT * 3)); ctx.translate(-p.x, -p.y);
      Rig.draw(ctx, pose, { color: '#111', lw: 3 });
      ctx.restore();
      return;
    }
    Rig.draw(ctx, pose, {
      color: '#111',
      lw: 5,
      scarf: '#cc2b2b',
      scarfDir: p.vx < -25 ? 1 : -1,
      t: this.t,
      flash: p.hurtT > 0 ? 'rgba(220,60,60,0.85)' : null,
      alpha: p.iframes > 0 ? 0.62 + Math.sin(this.t * 40) * 0.25 : 1,
      face: true
    });
    if (p.attack) {
      this.drawMelee(ctx, pose, p.attack);
    } else {
      // Draw over the arm so the weapon remains visible even when aiming down.
      this.drawHeldWeapon(ctx, pose, p.muzzle > 0 && p.muzzleWeapon ? p.muzzleWeapon : p.weapon, p.aim);
    }
  },

  drawMelee: function (ctx, pose, attack) {
    var t = clamp(attack.time / attack.duration, 0, 1);
    var hand = pose.armPairs[0].right.hand;
    var a = attack.aim;
    ctx.save();
    if (attack.move === 'sword') {
      var swordAngle = a - 1.15 + 2.30 * t;
      ctx.translate(hand.x, hand.y);
      ctx.rotate(swordAngle);
      // A long silver blade and a red-wrapped hilt, both attached to the hand.
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#22242a'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(8, 0); ctx.stroke();
      ctx.strokeStyle = '#c82e32'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(1, 0); ctx.stroke();
      ctx.strokeStyle = '#292a2c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(7, -9); ctx.lineTo(7, 9); ctx.stroke();
      ctx.fillStyle = '#faf9f2'; ctx.strokeStyle = '#31343a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(8, -4); ctx.lineTo(65, -3);
      ctx.lineTo(78, 0); ctx.lineTo(65, 3); ctx.lineTo(8, 4); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
      if (t > 0.25 && t < 0.8) {
        ctx.save();
        ctx.globalAlpha = Math.sin((t - 0.25) / 0.55 * Math.PI) * 0.6;
        ctx.strokeStyle = '#c62b30'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(pose.shoulder.x, pose.shoulder.y, pose.size * 0.78,
          a - 1.15, a - 1.15 + 2.30 * t); ctx.stroke();
        ctx.restore();
      }
      return;
    }
    // Small ink speed strokes make the punch and extended kick easy to read.
    var tip = attack.move === 'kick' ? pose.legR.foot : hand;
    var strength = Math.sin(t * Math.PI);
    ctx.globalAlpha = strength * 0.7;
    ctx.strokeStyle = '#c62b30'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (var i = -1; i <= 1; i++) {
      var px = tip.x - Math.sin(a) * i * 6, py = tip.y + Math.cos(a) * i * 6;
      ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * 6, py + Math.sin(a) * 6);
      ctx.lineTo(px + Math.cos(a) * (13 + strength * 8), py + Math.sin(a) * (13 + strength * 8)); ctx.stroke();
    }
    ctx.restore();
  },

  // Never draw a streak behind the point where this projectile was fired.
  trailLength: function (b, length) {
    return Math.min(length, b.traveled === undefined ? length : b.traveled);
  },

  drawBullets: function (ctx) {
    ctx.lineCap = 'round';
    for (var i = 0; i < this.bullets.length; i++) {
      var b = this.bullets[i];
      var c = Math.cos(b.a), sn = Math.sin(b.a);
      var trail = this.trailLength.bind(this, b);

      if (b.w === 'eraser') {
        /* a fat eraser: dark core, soft ring, slow enough to see */
        ctx.fillStyle = '#22242a';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(34,36,42,0.30)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 4, 0, TAU);
        ctx.stroke();
        continue;
      }

      if (b.w === 'compass') {
        /* a needle: thin, long, and visibly faster than everything else */
        ctx.strokeStyle = 'rgba(34,36,42,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(b.x - c * trail(b.len * 3.2), b.y - sn * trail(b.len * 3.2));
        ctx.lineTo(b.x - c * trail(b.len), b.y - sn * trail(b.len));
        ctx.stroke();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x - c * trail(b.len), b.y - sn * trail(b.len));
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = '#cc2b2b';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2, 0, TAU);
        ctx.fill();
        continue;
      }

      if (b.w === 'ruler') {
        /* a hard slug: short, thick, with a heavy smear behind it */
        ctx.strokeStyle = 'rgba(34,36,42,0.18)';
        ctx.lineWidth = b.r * 1.6;
        ctx.beginPath();
        ctx.moveTo(b.x - c * trail(b.len * 2.2), b.y - sn * trail(b.len * 2.2));
        ctx.lineTo(b.x - c * trail(b.len), b.y - sn * trail(b.len));
        ctx.stroke();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = b.r;
        ctx.beginPath();
        ctx.moveTo(b.x - c * trail(b.len), b.y - sn * trail(b.len));
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        continue;
      }

      if (b.w === 'stapler') {
        /* a staple: a tiny tick, they come far too fast to decorate */
        ctx.strokeStyle = '#22242a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x - c * trail(7), b.y - sn * trail(7));
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        continue;
      }

      /* pen: the original clean line */
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - c * trail(b.len), b.y - sn * trail(b.len));
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(17,17,17,0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(b.x - c * trail(b.len * 2.4), b.y - sn * trail(b.len * 2.4));
      ctx.lineTo(b.x - c * trail(b.len), b.y - sn * trail(b.len));
      ctx.stroke();
    }
    for (var j = 0; j < this.shots.length; j++) {
      var s = this.shots[j];
      ctx.fillStyle = '#2a2a30';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(42,42,48,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r + 3.5, 0, TAU);
      ctx.stroke();
    }
  },

  drawBlast: function (ctx) {
    var b = this.blast;
    if (!b) return;
    var t = 1 - b.time / b.duration;
    var r = b.radius * (0.25 + 0.75 * t);
    ctx.save(); ctx.globalAlpha = (1 - t) * 0.8;
    ctx.strokeStyle = '#b52e32'; ctx.lineWidth = 7 * (1 - t) + 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#302d2d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.82, 0, TAU); ctx.stroke();
    for (var i = 0; i < 12; i++) {
      var a = i * TAU / 12;
      ctx.beginPath(); ctx.moveTo(b.x + Math.cos(a) * r * 0.8, b.y + Math.sin(a) * r * 0.8);
      ctx.lineTo(b.x + Math.cos(a) * (r + 13), b.y + Math.sin(a) * (r + 13)); ctx.stroke();
    }
    ctx.restore();
  },

  drawParticles: function (ctx) {
    for (var i = 0; i < this.parts.length; i++) {
      var q = this.parts[i];
      var a = clamp(q.life * 2, 0, 1);
      ctx.fillStyle = q.kind === 'dust'
        ? 'rgba(120,112,100,' + a * 0.5 + ')'
        : 'rgba(24,24,28,' + a + ')';
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r * (q.kind === 'dust' ? 1.6 : 1), 0, TAU);
      ctx.fill();
    }
  },

  drawFloats: function (ctx) {
    ctx.textAlign = 'center';
    for (var i = 0; i < this.floats.length; i++) {
      var f = this.floats[i];
      ctx.fillStyle = 'rgba(24,24,28,' + clamp(f.life * 1.6, 0, 1) + ')';
      ctx.font = 'bold 16px ui-monospace, Menlo, monospace';
      ctx.fillText(f.text, f.x, f.y);
    }
  },

  /* ---------------------------------------------------------------- HUD --- */
  drawHUD: function (ctx) {
    if (this.state === 'menu') return;
    var p = this.player;
    if (!p) return;
    var font = 'bold 15px ui-monospace, Menlo, monospace';

    /* a soft paper card under each cluster, so the HUD stays readable over
     * the ruled lines without turning into a solid bar */
    function chip(x, y, w, h) {
      ctx.save();
      ctx.fillStyle = 'rgba(246,243,235,0.72)';
      ctx.strokeStyle = 'rgba(40,36,30,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, 4);
      else ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    chip(16, 12, 300, 44);
    chip(16, 64, 300, 42);
    chip(W / 2 - 62, 12, 124, 60);
    chip(W - 266, 12, 250, 62);

    /* health, as ink segments so it suits the paper */
    var segs = 10;
    var bw = 22, bh = 15, bx = 30, by = 30;
    ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(24,24,28,0.55)';
    ctx.textAlign = 'left';
    ctx.fillText('HEALTH', bx, by - 8);
    for (var i = 0; i < segs; i++) {
      var filled = (p.hp / p.maxhp) > (i / segs);
      ctx.strokeStyle = 'rgba(24,24,28,0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx + i * (bw + 4), by, bw, bh);
      if (filled) {
        ctx.fillStyle = p.hp / p.maxhp < 0.34 ? 'rgba(190,50,50,0.75)' : 'rgba(24,24,28,0.72)';
        ctx.fillRect(bx + i * (bw + 4) + 2, by + 2, bw - 4, bh - 4);
      }
    }

    ctx.textAlign = 'left'; ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = p.ink >= 100 ? '#ad292d' : 'rgba(24,24,28,0.65)';
    ctx.fillText(p.ink >= 100 ? 'INK BLAST READY  •  PRESS Q' : 'INK BLAST  •  HIT TO CHARGE', 30, 80);
    ctx.fillStyle = 'rgba(24,24,28,0.15)'; ctx.fillRect(30, 88, 258, 8);
    ctx.fillStyle = p.ink >= 100 ? '#c52e31' : '#8b4c4a';
    ctx.fillRect(30, 88, 258 * clamp(p.ink / 100, 0, 1), 8);

    /* wave */
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(24,24,28,0.45)';
    ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
    ctx.fillText(this.house ? 'ROOM' : 'WAVE', W / 2, by - 4);
    ctx.fillStyle = 'rgba(24,24,28,0.85)';
    ctx.font = 'bold 30px ui-monospace, Menlo, monospace';
    ctx.fillText(this.house ? this.house.room + ' / 3' : ('0' + this.wave).slice(-2), W / 2, by + 26);

    /* score */
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(24,24,28,0.45)';
    ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
    ctx.fillText('SCORE', W - 30, by - 4);
    ctx.fillStyle = 'rgba(24,24,28,0.9)';
    ctx.font = 'bold 26px ui-monospace, Menlo, monospace';
    ctx.fillText(String(this.score), W - 30, by + 22);

    if (this.combo >= 2) {
      ctx.fillStyle = 'rgba(190,50,50,0.85)';
      ctx.font = 'bold 18px ui-monospace, Menlo, monospace';
      ctx.fillText('x' + this.combo + ' COMBO', W - 30, by + 46);
    }

    if (this.house && this.house.room === 3) {
      var boss = this.enemies.find(function (e) { return e.type === 'boss' && !e.dead; });
      if (boss) {
        ctx.textAlign = 'center'; ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillStyle = '#a62e30'; ctx.fillText(boss.enraged ? 'THE INK GUARDIAN  /  ENRAGED' : 'THE INK GUARDIAN', W / 2, 96);
        ctx.fillStyle = 'rgba(40,35,35,0.2)'; ctx.fillRect(W / 2 - 180, 104, 360, 9);
        ctx.fillStyle = '#b62e32'; ctx.fillRect(W / 2 - 180, 104, 360 * clamp(boss.hp / boss.maxhp, 0, 1), 9);
      }
    }

    /* the weapon in hand, bottom right, with its ammunition as ticks */
    var wd = this.weaponDef();
    var wx = W - 30, wy = H - 30;
    var chipW = 236, chipH = 54, chipX = wx - chipW, chipY = wy - chipH + 8;
    chip(chipX, chipY, chipW, chipH);

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(24,24,28,0.42)';
    ctx.font = 'bold 10px ui-monospace, Menlo, monospace';
    ctx.fillText('IN HAND', chipX + 12, chipY + 15);

    ctx.fillStyle = 'rgba(24,24,28,0.92)';
    ctx.font = 'bold 18px ui-monospace, Menlo, monospace';
    ctx.fillText(wd.name, chipX + 12, chipY + 35);

    /* the tool itself, on the right of the chip */
    this.drawTool(ctx, p.weapon, chipX + chipW - 28, chipY + 27, 2.0, 0);

    var total = wd.ammo, have = Math.max(0, p.ammo);
    ctx.textAlign = 'right';
    if (total === Infinity) {
      ctx.fillStyle = 'rgba(24,24,28,0.38)';
      ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
      ctx.fillText('UNLIMITED', chipX + chipW - 62, chipY + 33);
    } else {
      var slots = 10, tw = 5, gap2 = 3;
      var used = Math.ceil((have / total) * slots);
      var tx0 = chipX + 12;
      for (var si = 0; si < slots; si++) {
        ctx.fillStyle = si < used ? 'rgba(24,24,28,0.70)' : 'rgba(24,24,28,0.13)';
        ctx.fillRect(tx0 + si * (tw + gap2), chipY + 42, tw, 5);
      }
      ctx.fillStyle = 'rgba(24,24,28,0.6)';
      ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
      ctx.fillText(String(have), chipX + chipW - 62, chipY + 47);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(24,24,28,0.58)';
    ctx.font = 'bold 12px ui-monospace, Menlo, monospace';
    ctx.fillText('E  KUNG FU   /   F  SWORD', W - 30, H - 94);

    /* owned powers, as little marginalia */
    var px = 30, py = H - 76;
    ctx.textAlign = 'left';
    for (var k = 0; k < this.POWERS.length; k++) {
      var pw = this.POWERS[k];
      if (!this.powers[pw.id]) continue;
      ctx.strokeStyle = 'rgba(24,24,28,0.5)';
      ctx.lineWidth = 1.4;
      var wpx = px, wpy = py;
      ctx.strokeRect(wpx, wpy - 12, 62, 18);
      ctx.fillStyle = 'rgba(24,24,28,0.7)';
      ctx.font = 'bold 10px ui-monospace, Menlo, monospace';
      ctx.fillText(pw.short, wpx + 7, wpy + 1);
      px += 68;
    }

    /* pickup note: a small paper slip, not the giant wave banner */
    if (this.toast > 0 && this.state === 'playing') {
      var ta = Math.min(1, this.toast / 0.35);
      ctx.save();
      ctx.globalAlpha = ta;
      ctx.font = 'bold 14px ui-monospace, Menlo, monospace';
      var tw2 = ctx.measureText ? ctx.measureText(this.toastText).width : 300;
      var bx2 = W - 30 - tw2 - 22, by2 = H - 132;
      ctx.fillStyle = 'rgba(255,253,246,0.96)';
      ctx.strokeStyle = 'rgba(30,30,34,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.rect(bx2, by2, tw2 + 22, 30);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(24,24,28,0.9)';
      ctx.textAlign = 'left';
      ctx.fillText(this.toastText, bx2 + 11, by2 + 20);
      ctx.restore();
    }

    /* wave banner (never over the power screen or a menu) */
    if (this.banner > 0 && this.state === 'playing') {
      var a = Math.min(1, this.banner / 0.5);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(24,24,28,' + (a * 0.85) + ')';
      ctx.font = 'bold 44px ui-monospace, Menlo, monospace';
      ctx.fillText(this.bannerText, W / 2, H / 2 - 120);
    }

    /* crosshair at the cursor */
    if (this.state === 'playing') {
      var mx = Input.mouse.x, my = Input.mouse.y;
      ctx.strokeStyle = 'rgba(24,24,28,0.45)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(mx, my, 9, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx - 15, my); ctx.lineTo(mx - 4, my);
      ctx.moveTo(mx + 4, my); ctx.lineTo(mx + 15, my);
      ctx.moveTo(mx, my - 15); ctx.lineTo(mx, my - 4);
      ctx.moveTo(mx, my + 4); ctx.lineTo(mx, my + 15);
      ctx.stroke();
    }
  },

  drawMenu: function (ctx) {
    ctx.fillStyle = 'rgba(244,241,232,0.86)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';

    /* the hero, standing on the page, breathing; plus two walkers so the
     * menu shows the game's own animation instead of explaining it */
    var heroPose = Rig.pose({
      x: W - 232, y: H - 52, size: 216, phase: this.t * 1.1, gait: 0,
      t: this.t, seed: 12, aim: null
    });
    Rig.draw(ctx, heroPose, {
      color: '#111', lw: 7, scarf: '#cc2b2b', scarfDir: -1, t: this.t, face: false
    });
    var w1 = Rig.pose({
      x: 148, y: H - 56, size: 104, phase: this.t * 5.2, gait: 1,
      t: this.t, seed: 21, aim: null
    });
    var w2 = Rig.pose({
      x: 316, y: H - 44, size: 76, phase: this.t * 5.2 + 2.2, gait: 1,
      t: this.t, seed: 33, aim: null
    });
    Rig.draw(ctx, w1, { color: 'rgba(30,30,34,0.55)', lw: 4, alpha: 0.75 });
    Rig.draw(ctx, w2, { color: 'rgba(30,30,34,0.55)', lw: 4, alpha: 0.75 });

    ctx.fillStyle = 'rgba(24,24,28,0.55)';
    ctx.font = 'bold 15px ui-monospace, Menlo, monospace';
    ctx.fillText('W H A T   I F   ...', W / 2, 150);

    ctx.fillStyle = '#111';
    ctx.font = 'bold 88px ui-monospace, Menlo, monospace';
    ctx.fillText('STICKMAN', W / 2, 244);

    ctx.strokeStyle = 'rgba(24,24,28,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 250, 272); ctx.lineTo(W / 2 + 250, 272);
    ctx.stroke();

    ctx.fillStyle = 'rgba(24,24,28,0.75)';
    ctx.font = 'bold 17px ui-monospace, Menlo, monospace';
    ctx.fillText('Survive the page. Every upgrade is a question.', W / 2, 316);

    /* controls, two columns */
    ctx.font = 'bold 13px ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(24,24,28,0.62)';
    ctx.textAlign = 'right';
    ctx.fillText('MOVE', W / 2 - 30, 384);
    ctx.fillText('AIM / FIRE', W / 2 - 30, 412);
    ctx.fillText('DASH', W / 2 - 30, 440);
    ctx.fillText('PAUSE', W / 2 - 30, 468);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(24,24,28,0.85)';
    ctx.fillText('W A S D   or   ARROWS', W / 2 + 10, 384);
    ctx.fillText('MOUSE   +   HOLD LEFT', W / 2 + 10, 412);
    ctx.fillText('SHIFT   or   RIGHT CLICK', W / 2 + 10, 440);
    ctx.fillText('P', W / 2 + 10, 468);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(24,24,28,0.62)';
    ctx.fillText('WEAPONS', W / 2 - 30, 496);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(24,24,28,0.85)';
    ctx.fillText('WALK OVER THE STATIONERY', W / 2 + 10, 496);

    // Two clear mode choices: Enter remains the house shortcut for old players.
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fffdf7'; ctx.strokeStyle = '#343034'; ctx.lineWidth = 2;
    ctx.fillRect(425, 526, 430, 47); ctx.strokeRect(425, 526, 430, 47);
    ctx.fillRect(425, 582, 430, 47); ctx.strokeRect(425, 582, 430, 47);
    ctx.fillStyle = '#29272a'; ctx.font = 'bold 16px ui-monospace, Menlo, monospace';
    ctx.fillText('1 / ENTER   HOUSE ADVENTURE', W / 2, 556);
    ctx.fillStyle = '#b12c30';
    ctx.fillText('2   SWORD DUEL  /  VS CPU', W / 2, 612);

    if (this.best > 0) {
      ctx.fillStyle = 'rgba(24,24,28,0.5)';
      ctx.font = 'bold 14px ui-monospace, Menlo, monospace';
      ctx.fillText('BEST  ' + this.best, W / 2, 664);
    }
  },

  drawPower: function (ctx) {
    ctx.fillStyle = 'rgba(244,241,232,0.965)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(24,24,28,0.55)';
    ctx.font = 'bold 14px ui-monospace, Menlo, monospace';
    ctx.fillText('W A V E   ' + this.wave + '   C L E A R', W / 2, 118);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 40px ui-monospace, Menlo, monospace';
    ctx.fillText('WHAT IF ...', W / 2, 172);

    var cw = 430, ch = 300, gap = 44;
    var totalW = cw * 2 + gap;
    var x0 = (W - totalW) / 2;
    for (var i = 0; i < this.offer.length; i++) {
      var o = this.offer[i];
      var x = x0 + i * (cw + gap), y = 226;
      var active = i === this.sel;
      ctx.save();
      if (active) { ctx.shadowColor = 'rgba(24,24,28,0.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8; }
      ctx.fillStyle = active ? '#fffdf7' : 'rgba(255,253,247,0.72)';
      ctx.fillRect(x, y, cw, ch);
      ctx.restore();
      ctx.strokeStyle = active ? '#111' : 'rgba(24,24,28,0.35)';
      ctx.lineWidth = active ? 3 : 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);

      ctx.fillStyle = 'rgba(190,50,50,0.9)';
      ctx.font = 'bold 13px ui-monospace, Menlo, monospace';
      ctx.fillText('WHAT IF ' + (i + 1), x + cw / 2, y + 34);

      ctx.fillStyle = '#111';
      ctx.font = 'bold 23px ui-monospace, Menlo, monospace';
      this.wrapText(ctx, o.title, x + cw / 2, y + 82, cw - 56, 30);

      ctx.fillStyle = 'rgba(24,24,28,0.55)';
      ctx.font = 'italic 13px ui-monospace, Menlo, monospace';
      this.wrapText(ctx, o.fact, x + cw / 2, y + 158, cw - 70, 19);

      ctx.strokeStyle = 'rgba(24,24,28,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 60, y + 190); ctx.lineTo(x + cw - 60, y + 190);
      ctx.stroke();

      ctx.fillStyle = 'rgba(24,24,28,0.9)';
      ctx.font = 'bold 15px ui-monospace, Menlo, monospace';
      this.wrapText(ctx, o.effect, x + cw / 2, y + 222, cw - 60, 24);

      ctx.fillStyle = 'rgba(24,24,28,0.4)';
      ctx.font = 'bold 12px ui-monospace, Menlo, monospace';
      ctx.fillText('[ ' + (i + 1) + ' ]', x + cw / 2, y + ch - 20);
    }

    ctx.fillStyle = 'rgba(24,24,28,0.5)';
    ctx.font = 'bold 13px ui-monospace, Menlo, monospace';
    ctx.fillText('PRESS  1  or  2   TO CHOOSE', W / 2, 588);
  },

  drawPaused: function (ctx) {
    ctx.fillStyle = 'rgba(244,241,232,0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#111';
    ctx.font = 'bold 52px ui-monospace, Menlo, monospace';
    ctx.fillText('PAUSED', W / 2, H / 2 - 10);
    ctx.font = 'bold 14px ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(24,24,28,0.6)';
    ctx.fillText('PRESS  P  TO CONTINUE', W / 2, H / 2 + 34);
  },

  drawDead: function (ctx) {
    var a = clamp(this.player.deadT * 2, 0, 1);
    ctx.fillStyle = 'rgba(244,241,232,' + (a * 0.88) + ')';
    ctx.fillRect(0, 0, W, H);
    if (a < 0.5) return;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#111';
    ctx.font = 'bold 62px ui-monospace, Menlo, monospace';
    ctx.fillText('ERASED', W / 2, 244);
    ctx.fillStyle = 'rgba(190,50,50,0.85)';
    ctx.font = 'bold 13px ui-monospace, Menlo, monospace';
    ctx.fillText('THE PAGE WINS', W / 2, 274);

    ctx.fillStyle = 'rgba(24,24,28,0.75)';
    ctx.font = 'bold 18px ui-monospace, Menlo, monospace';
    ctx.fillText('SCORE  ' + this.score, W / 2, 340);
    ctx.fillText('WAVE  ' + this.wave, W / 2, 370);
    ctx.fillText('KILLS  ' + this.kills, W / 2, 400);
    if (this.score >= this.best && this.score > 0) {
      ctx.fillStyle = 'rgba(190,50,50,0.9)';
      ctx.font = 'bold 15px ui-monospace, Menlo, monospace';
      ctx.fillText('NEW BEST', W / 2, 434);
    } else {
      ctx.fillStyle = 'rgba(24,24,28,0.45)';
      ctx.font = 'bold 15px ui-monospace, Menlo, monospace';
      ctx.fillText('BEST  ' + this.best, W / 2, 434);
    }

    ctx.fillStyle = 'rgba(24,24,28,' + (0.5 + Math.sin(this.t * 4) * 0.4) + ')';
    ctx.font = 'bold 19px ui-monospace, Menlo, monospace';
    ctx.fillText('PRESS ENTER  /  CLICK TO RETRY', W / 2, 520);
  },

  wrapText: function (ctx, text, cx, y, maxW, lh) {
    var words = String(text).split(' ');
    var line = '', lines = [];
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      var w = ctx.measureText ? ctx.measureText(test).width : test.length * 10;
      if (w > maxW && line) { lines.push(line); line = words[i]; } else line = test;
    }
    if (line) lines.push(line);
    for (var k = 0; k < lines.length; k++) ctx.fillText(lines[k], cx, y + k * lh);
    return lines.length;
  }
};
