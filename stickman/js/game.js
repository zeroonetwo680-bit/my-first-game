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
  floats: [],

  wave: 0,
  waveTimer: 0,
  banner: 0,
  bannerText: '',
  score: 0,
  combo: 0,
  comboTimer: 0,
  kills: 0,
  best: 0,
  powers: Object.create(null),
  offer: [],
  sel: 0,
  runTime: 0,

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
    this.parts.length = 0; this.splats.length = 0; this.marks.length = 0;
    this.pending.length = 0; this.floats.length = 0;
    this.wave = 0; this.waveTimer = 0; this.banner = 0; this.bannerText = '';
    this.score = 0; this.combo = 0; this.comboTimer = 0; this.kills = 0;
    this.powers = Object.create(null);
    this.offer = []; this.sel = 0; this.runTime = 0;
    this.player = null;
  },

  startRun: function () {
    this.reset('playing');
    this.player = {
      x: W / 2, y: H / 2 + 60, vx: 0, vy: 0,
      size: 124, hp: 100, maxhp: 100,
      aim: -Math.PI / 2, phase: 0, gait: 0,
      fireCd: 0, dashCd: 0, dashT: 0, iframes: 0, hurtT: 0,
      arms: 1, powerCd: 0, regenT: 0, dead: false, deadT: 0,
      facing: 1, walkT: 0
    };
    this.nextWave();
    return this.player;
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
      thrower: { hp: 18, speed: 48, size: 104, dmg: 8, r: 18, score: 18 },
      brute: { hp: 70, speed: 42, size: 152, dmg: 20, r: 30, score: 40 }
    }[type] || { hp: 20, speed: 60, size: 54, dmg: 8, r: 16, score: 10 };
    var e = {
      type: type, x: x, y: y, vx: 0, vy: 0,
      hp: base.hp, maxhp: base.hp, speed: base.speed, size: base.size,
      dmg: base.dmg, r: base.r, score: base.score,
      phase: this.rng() * TAU, t: 0, hurt: 0, stun: 0,
      attackCd: 0, throwCd: 0.8 + this.rng() * 1.2,
      seed: 1 + Math.floor(this.rng() * 9999),
      dead: false, deadT: 0
    };
    this.enemies.push(e);
    return e;
  },

  /* -------------------------------------------------------------- update --- */
  update: function (rawDt) {
    var dt = Math.min(rawDt, 0.05);
    this.t += dt;

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
      if (this.banner > 0) this.banner -= dt;
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }
      if (this.enemies.length === 0 && this.pending.length === 0 && this.waveTimer <= 0) {
        this.waveTimer = 1.4;
      }
      if (this.waveTimer > 0) {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) this.betweenWaves();
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

    /* aim: mouse, or the right half of the screen on touch */
    if (Input.touch.active && Input.touch.aimId !== -1) {
      p.aim = angleTo(p.x, p.y, Input.touch.ax, Input.touch.ay);
    } else {
      p.aim = angleTo(p.x, p.y, Input.mouse.x, Input.mouse.y);
    }

    /* timers */
    p.fireCd -= dt; p.dashCd -= dt; p.iframes -= dt; p.hurtT -= dt;
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
    if (wantFire && p.fireCd <= 0) this.fire();
  },

  fire: function () {
    var p = this.player;
    var rate = this.powers.pain ? 0.105 : 0.135;
    p.fireCd = rate;
    var count = this.powers.arms ? 3 : 1;
    var spread = 0.17;
    for (var i = 0; i < count; i++) {
      var a = p.aim + (count === 1 ? 0 : (i - (count - 1) / 2) * spread);
      var hx = p.x + Math.cos(a) * 22;
      var hy = p.y - p.size * 0.30 + Math.sin(a) * 22;
      this.bullets.push({
        x: hx, y: hy,
        vx: Math.cos(a) * 980, vy: Math.sin(a) * 980,
        life: 1.1, dmg: 11, r: 3, a: a
      });
    }
    p.vx -= Math.cos(p.aim) * 26;
    p.vy -= Math.sin(p.aim) * 26;
    Sfx.shoot();
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

      if (e.type === 'thrower') {
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
          this.shots.push({
            x: e.x + Math.cos(ba) * 14, y: e.y - e.size * 0.3 + Math.sin(ba) * 14,
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
      if (d < e.r + 20 && e.attackCd <= 0) {
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
      if (this.powers.eyes) this.home(b, dt);
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
        this.bullets.splice(i, 1);
        continue;
      }
      for (j = 0; j < this.enemies.length; j++) {
        var e = this.enemies[j];
        if (e.dead) continue;
        var rr = e.r + b.r + 4;
        if (dist2(b.x, b.y, e.x, e.y - e.size * 0.35) < rr * rr) {
          this.hurtEnemy(e, b.dmg, b.a);
          this.bullets.splice(i, 1);
          break;
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
    e.hurt = 0.12;
    e.stun = Math.min(0.35, e.stun + 0.12);
    var push = e.type === 'brute' ? 26 : 90;
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
    if (pool.length === 0) { this.nextWave(); return; }
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
    this.nextWave();
  },

  /* -------------------------------------------------------------- render --- */
  render: function () {
    var ctx = this.ctx;
    if (!ctx) return;
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
    this.drawGround(ctx);
    this.drawMarks(ctx);
    this.drawPending(ctx);
    this.drawEnemies(ctx);
    this.drawPlayer(ctx);
    this.drawBullets(ctx);
    this.drawParticles(ctx);
    this.drawFloats(ctx);

    if (this.flash > 0.01) {
      ctx.fillStyle = 'rgba(255,60,60,' + (this.flash * 0.22) + ')';
      ctx.fillRect(-40, -40, W + 80, H + 80);
    }

    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    this.drawHUD(ctx);

    if (this.state === 'menu') this.drawMenu(ctx);
    if (this.state === 'power') this.drawPower(ctx);
    if (this.state === 'dead') this.drawDead(ctx);
    if (this.state === 'paused') this.drawPaused(ctx);

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

  drawEnemies: function (ctx) {
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      var a = angleTo(e.x, e.y, this.player ? this.player.x : e.x, this.player ? this.player.y : e.y);
      /* only the thrower takes aim; the rest swing their arms as they walk,
       * otherwise every enemy reads as a pointing statue */
      var p = Rig.pose({
        x: e.x, y: e.y, size: e.size, phase: e.phase, gait: e.dead ? 0 : (e.gait || 0),
        t: this.t, seed: e.seed,
        aim: e.dead ? null : (e.type === 'thrower' ? a : null),
        crouch: e.dead ? 1 : 0
      });
      if (e.dead) {
        /* fall over and fade out */
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - e.deadT / 0.45);
        ctx.translate(e.x, e.y); ctx.rotate(e.deadT * 2.4); ctx.translate(-e.x, -e.y);
        Rig.draw(ctx, p, { color: '#333', lw: 3.4 });
        ctx.restore();
      } else {
        Rig.draw(ctx, p, {
          color: e.type === 'brute' ? '#141417' : '#2f2f36',
          lw: e.type === 'brute' ? 6.5 : 4.2,
          flash: e.hurt > 0 ? 'rgba(220,60,60,0.9)' : null,
          face: e.type !== 'brute'
        });
      }
    }
  },

  drawPlayer: function (ctx) {
    var p = this.player;
    if (!p) return;
    var pose = Rig.pose({
      x: p.x, y: p.y, size: p.size,
      phase: p.phase, gait: p.gait,
      t: this.t, seed: 7, aim: p.aim,
      arms: this.powers.arms ? 3 : 1,
      aimSpreads: this.powers.arms ? [0, 0.62, -0.62] : [0],
      crouch: p.dead ? 1 : (p.dashT > 0 ? 0.4 : 0),
      lean: clamp(p.vx / 900, -0.5, 0.5)
    });
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
  },

  drawBullets: function (ctx) {
    ctx.lineCap = 'round';
    for (var i = 0; i < this.bullets.length; i++) {
      var b = this.bullets[i];
      var len = 13;
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(b.a) * len, b.y - Math.sin(b.a) * len);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(17,17,17,0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(b.a) * len * 2.4, b.y - Math.sin(b.a) * len * 2.4);
      ctx.lineTo(b.x - Math.cos(b.a) * len, b.y - Math.sin(b.a) * len);
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

    /* wave */
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(24,24,28,0.45)';
    ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
    ctx.fillText('WAVE', W / 2, by - 4);
    ctx.fillStyle = 'rgba(24,24,28,0.85)';
    ctx.font = 'bold 30px ui-monospace, Menlo, monospace';
    ctx.fillText(('0' + this.wave).slice(-2), W / 2, by + 26);

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

    /* owned powers, as little marginalia */
    var px = 30, py = H - 34;
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

    ctx.textAlign = 'center';
    var blink = 0.55 + Math.sin(this.t * 4) * 0.45;
    ctx.fillStyle = 'rgba(24,24,28,' + blink + ')';
    ctx.font = 'bold 20px ui-monospace, Menlo, monospace';
    ctx.fillText('PRESS ENTER  /  CLICK TO START', W / 2, 566);

    if (this.best > 0) {
      ctx.fillStyle = 'rgba(24,24,28,0.5)';
      ctx.font = 'bold 14px ui-monospace, Menlo, monospace';
      ctx.fillText('BEST  ' + this.best, W / 2, 606);
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
