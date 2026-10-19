/* ============================================================
   NEON FIST — game
   1v1 neon fighting: combos, block, dash, NOVA special,
   best-of-3 rounds, vs CPU or 2-player on one keyboard.
   ============================================================ */
'use strict';

const W = 900, H = 540;         // logical arena
const WALL = 70;
const ROUND_TIME = 60;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let vw = 0, vh = 0, dpr = 1, viewScale = 1, viewOX = 0, viewOY = 0;

/* ============================================================
   Game
   ============================================================ */
const Game = {
  state: 'boot', // menu | intro | fighting | roundend | over | paused
  mode: 'cpu',   // cpu | 2p
  diff: store.get('nff.diff', 'normal'),
  p1Id: store.get('nff.p1', 'blaze'),

  fighters: [null, null],
  ais: [null, null],

  round: 1,
  wins: [0, 0],
  clock: ROUND_TIME,
  stateT: 0,
  hitStop: 0,
  slowmo: 0,

  stats: { maxCombo: 0, damage: 0, specials: 0 },
  record: store.get('nff.record', { wins: 0, games: 0 }),
  matchResult: '',

  hudCache: {},

  /* ---------------- lifecycle ---------------- */
  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.state === 'fighting' || this.state === 'intro')) this.togglePause();
    });
    this.renderRoster();
    this.syncDiff();
    this.renderLifetime();
    this.enterMenu();
  },

  resize() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(vw * dpr);
    canvas.height = Math.ceil(vh * dpr);
    viewScale = Math.min(vw / W, vh / H);
    viewOX = (vw - W * viewScale) / 2;
    viewOY = (vh - H * viewScale) / 2;
  },

  enterMenu() {
    this.state = 'menu';
    this.setScreen('nf-start');
    document.getElementById('hud').classList.add('hidden');
    Input.showTouch(false);
    this.renderLifetime();
  },

  makeFighter(id, slot) {
    const def = FIGHTER_DEFS[id];
    return {
      def, slot,
      x: slot === 0 ? W * 0.32 : W * 0.68,
      dir: slot === 0 ? 1 : -1,
      hp: def.hp, maxHp: def.hp,
      meter: 0,
      state: 'idle', st: 0,
      attack: null, attackPhase: 0, hitDone: false,
      vx: 0, dashT: 0, dashCd: 0,
      seed: rand(TAU),
      comboOn: 0, lastHitAt: -9,
      flash: 0,
      wins: 0
    };
  },

  startMatch() {
    AudioSys.init(); AudioSys.resume();
    const ids = Object.keys(FIGHTER_DEFS);
    const p1 = this.p1Id;
    const p2 = ids.find(i => i !== p1);
    this.fighters = [this.makeFighter(p1, 0), this.makeFighter(p2, 1)];
    this.wins = [0, 0];
    this.round = 1;
    this.stats = { maxCombo: 0, damage: 0, specials: 0 };
    this.matchResult = '';
    this.ais = [null, null];
    if (this.mode === 'cpu') this.ais[1] = AI.new(this.fighters[1], this.fighters[0], this.diff);
    document.getElementById('name-p1').textContent = this.mode === 'cpu' ? this.fighters[0].def.name : 'P1 ' + this.fighters[0].def.name;
    document.getElementById('name-p2').textContent = this.mode === 'cpu' ? 'CPU ' + this.fighters[1].def.name : 'P2 ' + this.fighters[1].def.name;
    this.hudCache = {};
    this.startRound();
    this.state = 'intro';
    this.setScreen(null);
    document.getElementById('hud').classList.remove('hidden');
    Input.showTouch(IS_TOUCH);
  },

  startRound() {
    for (const f of this.fighters) {
      f.hp = f.maxHp;
      f.meter = Math.min(f.meter, 40); // carry a little momentum
      f.x = f.slot === 0 ? W * 0.32 : W * 0.68;
      f.dir = f.slot === 0 ? 1 : -1;
      f.state = 'idle';
      f.st = 0;
      f.attack = null;
      f.vx = 0;
      f.comboOn = 0;
    }
    this.clock = ROUND_TIME;
    this.stateT = 0;
    this.state = 'intro';
    this.hitStop = 0;
    this.slowmo = 0;
    FX.clear();
    this.banner('ROUND ' + this.round);
    this.updateHUD(true);
  },

  beginFight() {
    this.state = 'fighting';
    this.banner('FIGHT!');
    AudioSys.gong();
  },

  togglePause() {
    if (this.state === 'fighting' || this.state === 'intro' || this.state === 'roundend') {
      this._prePause = this.state;
      this.state = 'paused';
      this.setScreen('nf-pausescreen');
    } else if (this.state === 'paused') {
      this.state = this._prePause || 'fighting';
      this.setScreen(null);
    }
  },

  setScreen(id) {
    for (const s of ['nf-start', 'nf-pausescreen', 'nf-over']) {
      document.getElementById(s).classList.toggle('visible', s === id);
    }
  },

  banner(text) {
    const el = document.getElementById('nf-banner');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  },

  screenFlash(alpha) {
    const el = document.getElementById('nf-flash');
    el.style.transition = 'none';
    el.style.opacity = String(alpha);
    void el.offsetWidth; // commit the instant flash before fading
    el.style.transition = 'opacity 0.35s ease-out';
    el.style.opacity = '0';
  },

  /* ---------------- attacks ---------------- */
  tryAttack(f, kind) {
    if (f.state !== 'idle' && f.state !== 'walk') return;
    if (this.state !== 'fighting') return;
    const atk = f.def[kind];
    f.state = kind;
    f.st = 0;
    f.attack = atk;
    f.attackPhase = 0;
    f.hitDone = false;
    AudioSys.whoosh();
  },

  trySpecial(f) {
    if (f.state !== 'idle' && f.state !== 'walk') return;
    if (this.state !== 'fighting' || f.meter < 100) return;
    f.meter = 0;
    f.state = 'special';
    f.st = 0;
    f.attackPhase = 0;
    f.hitDone = false;
    f.dashT = 0;
    this.stats.specials += f.slot === 0 ? 1 : 0;
    this.hitStop = Math.max(this.hitStop, 0.32); // cinematic freeze
    this.banner(f.def.name + ' NOVA!');
    AudioSys.novaCharge();
    this.screenFlash(0.35);
    FX.addShake(5);
    Platform3.vibrate(30);
  },

  tryDash(f, dir) {
    if ((f.state !== 'idle' && f.state !== 'walk') || f.dashCd > 0) return;
    f.dashT = 0.16;
    f.dashCd = 0.7;
    f.vx = dir * f.def.dashSpeed;
    AudioSys.dash();
    FX.sparks(f.x, BODY.ground - 60, f.def.color, 6, 200);
  },

  resolveHit(att, vic, atk, kind) {
    att.hitDone = true;
    const hx = vic.x - vic.dir * 10;
    const hy = BODY.ground - 90 + rand(-8, 8);

    // blocked?
    if (vic.state === 'block') {
      const chip = atk.dmg * 0.18 * att.def.dmgMul;
      vic.hp = Math.max(0, vic.hp - chip);
      vic.vx = Math.sign(vic.x - att.x) * 90;
      att.vx = -Math.sign(vic.x - att.x) * 60;
      vic.meter = Math.min(100, vic.meter + chip * 1.4);
      att.meter = Math.min(100, att.meter + chip);
      FX.impactStar(hx, hy, '#9fb4d8');
      FX.sparks(hx, hy, '#dfe8ff', 5, 220);
      AudioSys.block();
      FX.addShake(1.6);
      Platform3.vibrate(8);
      FX.text(hx, hy - 26, 'BLOCK', '#9fb4d8', 13);
      return;
    }

    // damage with combo scaling on the victim
    const now = this.time;
    if (now - vic.lastHitAt > 1.2) vic.comboOn = 0;
    vic.comboOn++;
    vic.lastHitAt = now;
    const comboMul = Math.min(1.5, 1 + 0.1 * (vic.comboOn - 1));
    const dmg = atk.dmg * att.def.dmgMul * comboMul;
    vic.hp = Math.max(0, vic.hp - dmg);
    vic.state = 'hit';
    vic.st = 0;
    vic.attack = null;
    vic.vx = att.dir * atk.kb;
    vic.flash = 1;

    att.meter = Math.min(100, att.meter + dmg * 1.15);
    vic.meter = Math.min(100, vic.meter + dmg * 0.75);

    if (att.slot === 0) this.stats.damage += dmg;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, att.slot === 0 ? vic.comboOn : this.stats.maxCombo);

    // juice
    const big = kind === 'kick' || kind === 'special';
    FX.impactStar(hx, hy, att.def.accent);
    FX.sparks(hx, hy, att.def.accent, big ? 12 : 7, big ? 380 : 260);
    FX.addShake(big ? 6 : 3);
    FX.text(hx, hy - 30, Math.round(dmg) + (vic.comboOn > 1 ? '  x' + vic.comboOn : ''), big ? '#ffb84d' : '#fff', big ? 19 : 15);
    this.hitStop = Math.max(this.hitStop, big ? 0.09 : 0.055);
    Platform3.vibrate(big ? 26 : 12);
    if (kind === 'special') {
      AudioSys.novaHit();
      this.screenFlash(0.5);
      this.slowmo = 0.5;
      FX.ring(hx, hy, att.def.color, 90, 0.5);
    } else if (kind === 'kick') AudioSys.kickHit();
    else AudioSys.punchHit();

    // combo popup for player 1
    if (att.slot === 0 && vic.comboOn >= 2) {
      const el = document.getElementById('combo-p1');
      el.textContent = vic.comboOn + ' HITS!';
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
    }

    if (vic.hp <= 0) this.onKO(vic, att);
  },

  onKO(vic, att) {
    vic.state = 'ko';
    vic.st = 0;
    this.state = 'roundend';
    this.stateT = 0;
    this.slowmo = 1.1;
    const winner = att;
    winner.wins++;
    this.wins[winner.slot] = winner.wins;
    this.banner('K.O.!');
    AudioSys.ko();
    this.screenFlash(0.55);
    FX.addShake(14);
    Platform3.vibrate([60, 50, 90]);
    this._lastWinner = winner.slot;
    this._perfect = winner.hp >= winner.maxHp - 0.01;
    if (this._perfect) setTimeout(() => this.banner('PERFECT!'), 1500);
  },

  timeUp() {
    this.state = 'roundend';
    this.stateT = 0;
    const [a, b] = this.fighters;
    if (Math.abs(a.hp - b.hp) < 0.5) {
      this.banner('DRAW');
      this._lastWinner = -1;
    } else {
      const w = a.hp > b.hp ? 0 : 1;
      this.wins[w]++;
      this.fighters[w].wins++;
      this._lastWinner = w;
      this.banner('TIME UP!');
    }
    AudioSys.gong();
  },

  endRound() {
    if (this.wins[0] >= 2 || this.wins[1] >= 2) {
      this.finishMatch();
    } else {
      this.round++;
      document.getElementById('round-label').textContent = 'ROUND ' + this.round;
      this.startRound();
    }
  },

  finishMatch() {
    this.state = 'over';
    const winnerSlot = this.wins[0] >= 2 ? 0 : 1;
    const winner = this.fighters[winnerSlot];
    const humanWon = this.mode === '2p' ? true : winnerSlot === 0;
    this.matchResult = winner.def.name + ' WINS!';

    if (this.mode === 'cpu') {
      this.record.games++;
      if (humanWon) this.record.wins++;
      store.set('nff.record', this.record);
      this._bestBefore = store.get('nff.beststreak', 0);
      if (this.diff === 'hard') {
        const streak = humanWon ? store.get('nff.streak', 0) + 1 : 0;
        store.set('nff.streak', streak);
        if (streak > this._bestBefore) store.set('nff.beststreak', streak);
      }
    }

    document.getElementById('nf-over-title').textContent = this.matchResult;
    document.getElementById('ov-rounds').textContent = this.wins[0] + '-' + this.wins[1];
    document.getElementById('ov-combo').textContent = 'x' + Math.max(1, this.stats.maxCombo);
    document.getElementById('ov-dmg').textContent = fmtNum(this.stats.damage);
    document.getElementById('ov-spec').textContent = this.stats.specials;
    const recordLine = document.getElementById('nf-record-line');
    if (this.mode === 'cpu' && this.diff === 'hard') {
      const streak = store.get('nff.streak', 0);
      const best = store.get('nff.beststreak', 0);
      recordLine.textContent = 'HARD WIN STREAK: ' + streak + '  •  BEST: ' + best;
      const isNewBest = humanWon && streak > this._bestBefore && streak > 1;
      document.getElementById('nf-new-best').classList.toggle('hidden', !isNewBest);
    } else {
      recordLine.textContent = '';
      document.getElementById('nf-new-best').classList.add('hidden');
    }
    document.getElementById('hud').classList.add('hidden');
    Input.showTouch(false);
    this.setScreen('nf-over');
    if (humanWon) AudioSys.win(); else AudioSys.lose();
    winner.state = 'win';
    winner.st = 0;
  },

  /* ============================================================
     UPDATE
     ============================================================ */
  update(dt) {
    this.time = (this.time || 0) + dt;
    this.stateT += dt;

    if (this.state === 'intro' && this.stateT > 1.35) this.beginFight();

    if (this.state === 'roundend' && this.stateT > 2.2) this.endRound();

    const fighting = this.state === 'fighting';
    if (fighting) {
      this.clock -= dt;
      if (this.clock <= 0) {
        this.clock = 0;
        this.timeUp();
      }
    }

    if (this.state === 'intro' || this.state === 'fighting' || this.state === 'roundend') {
      const scale = this.slowmo > 0 ? 0.3 : 1;
      const sdt = dt * scale;
      if (this.slowmo > 0) this.slowmo -= dt;

      if (this.hitStop > 0) {
        this.hitStop -= dt;
      } else {
        for (let i = 0; i < 2; i++) {
          const f = this.fighters[i];
          const opp = this.fighters[1 - i];
          let inp = { left: false, right: false, block: false, punch: false, kick: false, special: false, dash: false };
          if (this.state === 'fighting') {
            if (this.ais[i]) inp = AI.update(this.ais[i], sdt, this.time);
            else inp = Input.playerInput(i);
          }
          this.updateFighter(f, inp, opp, sdt);
        }
      }
      FX.update(sdt);
    } else {
      FX.update(dt);
    }
  },

  updateFighter(f, inp, opp, dt) {
    f.st += dt;
    if (f.dashCd > 0) f.dashCd -= dt;
    if (f.flash > 0) f.flash -= dt * 5;

    // face the opponent always (except ko/win)
    if (f.state !== 'ko' && f.state !== 'win' && f.state !== 'hit') {
      f.dir = opp.x >= f.x ? 1 : -1;
    }

    // knockback / dash velocity
    if (f.vx !== 0) {
      f.x += f.vx * dt;
      if (f.dashT <= 0) {
        f.vx *= Math.max(0, 1 - 8 * dt);
        if (Math.abs(f.vx) < 8) f.vx = 0;
      }
    }

    switch (f.state) {
      case 'hit':
        if (f.st >= f.attack ? 0.3 : 0.3) { /* keep simple fixed stun if no attack ref */
        }
        if (f.st >= 0.32) { f.state = 'idle'; f.st = 0; }
        break;

      case 'ko':
        break;

      case 'win':
        break;

      case 'punch':
      case 'kick': {
        const atk = f.attack;
        f.attackPhase = f.st / (atk.startup + atk.active + atk.recovery);
        const inActive = f.st >= atk.startup && f.st <= atk.startup + atk.active;
        if (inActive && !f.hitDone) {
          const dist = Math.abs(opp.x - f.x);
          if (dist <= atk.reach + 24 && opp.state !== 'ko' && this.state === 'fighting') {
            this.resolveHit(f, opp, atk, f.state);
          }
        }
        if (f.st >= atk.startup + atk.active + atk.recovery) {
          f.state = 'idle';
          f.st = 0;
          f.attack = null;
        }
        break;
      }

      case 'special': {
        const atk = f.def.special;
        f.attackPhase = f.st / (atk.active + atk.recovery);
        // dash toward the opponent
        if (f.st <= atk.active && !f.hitDone) {
          f.x += f.dir * (atk.dashDist / atk.active) * dt;
          FX.emit({
            x: f.x - f.dir * 26, y: BODY.ground - 80 + rand(-20, 20),
            vx: -f.dir * rand(60, 160), vy: rand(-30, 30),
            life: 0.3, size: rand(3, 7), color: f.def.color, kind: 'glow', drag: 2
          });
          const dist = Math.abs(opp.x - f.x);
          if (dist <= 90 && opp.state !== 'ko' && this.state === 'fighting') {
            this.resolveHit(f, opp, atk, 'special');
          }
        }
        if (f.st >= atk.active + atk.recovery) {
          f.state = 'idle';
          f.st = 0;
        }
        break;
      }

      default: { // idle / walk / block
        let move = 0;
        if (inp.left) move -= 1;
        if (inp.right) move += 1;

        if (f.dashT > 0) {
          f.dashT -= dt;
          f.state = f.state === 'walk' ? 'walk' : f.state;
        }

        if (inp.block) {
          f.state = 'block';
        } else if (f.state === 'block') {
          f.state = 'idle';
        }

        if (f.state !== 'block') {
          if (move !== 0) {
            f.x += move * f.def.speed * dt;
            f.state = 'walk';
          } else if (f.state === 'walk') {
            f.state = 'idle';
          }
        }

        if (inp.dash) this.tryDash(f, move !== 0 ? move : f.dir);
        if (inp.punch) this.tryAttack(f, 'punch');
        else if (inp.kick) this.tryAttack(f, 'kick');
        else if (inp.special) this.trySpecial(f);
        break;
      }
    }

    // clamp to arena & keep fighters from overlapping fully
    f.x = clamp(f.x, WALL, W - WALL);
    const minGap = 46;
    const dx = f.x - opp.x;
    if (Math.abs(dx) < minGap && f.state !== 'ko' && opp.state !== 'ko') {
      const push = (minGap - Math.abs(dx)) / 2 * Math.sign(dx || 1);
      f.x += push;
      opp.x -= push;
      f.x = clamp(f.x, WALL, W - WALL);
      opp.x = clamp(opp.x, WALL, W - WALL);
    }
  },

  /* ============================================================
     RENDER
     ============================================================ */
  render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04060f';
    ctx.fillRect(0, 0, vw, vh);
    if (this.state === 'menu') { this.renderMenuBg(); return; }

    ctx.save();
    ctx.translate(viewOX + FX.shakeX, viewOY + FX.shakeY);
    ctx.scale(viewScale, viewScale);

    this.renderArena();
    const [a, b] = this.fighters;
    // draw the farther one first (behind)
    const order = a.x <= b.x ? [a, b] : [b, a];
    for (const f of order) drawFighter(ctx, f, this.time);

    ctx.globalCompositeOperation = 'lighter';
    FX.drawAdditive(ctx);
    ctx.globalCompositeOperation = 'source-over';
    FX.drawTexts(ctx);
    ctx.restore();
  },

  renderArena() {
    // backdrop grid
    ctx.strokeStyle = 'rgba(53,240,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, BODY.ground); }
    for (let y = 0; y <= BODY.ground; y += 60) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    // horizon glow line
    ctx.strokeStyle = 'rgba(255,61,129,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, BODY.ground - 130);
    ctx.lineTo(W, BODY.ground - 130);
    ctx.stroke();

    // floor
    const grad = ctx.createLinearGradient(0, BODY.ground, 0, H);
    grad.addColorStop(0, 'rgba(14, 24, 44, 0.9)');
    grad.addColorStop(1, 'rgba(4, 6, 15, 1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, BODY.ground, W, H - BODY.ground);
    ctx.strokeStyle = 'rgba(53,240,255,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, BODY.ground);
    ctx.lineTo(W, BODY.ground);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,61,129,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, BODY.ground + 10);
    ctx.lineTo(W, BODY.ground + 10);
    ctx.stroke();
    // wall posts
    ctx.fillStyle = 'rgba(53,240,255,0.5)';
    ctx.fillRect(WALL - 40, BODY.ground - 46, 4, 46);
    ctx.fillRect(W - WALL + 36, BODY.ground - 46, 4, 46);
  },

  renderMenuBg() {
    if (!this._menuFx) {
      this._menuFx = [];
      for (let i = 0; i < 16; i++) {
        this._menuFx.push({
          x: rand(vw), y: rand(vh), vx: rand(-20, 20), vy: rand(-12, 12),
          c: Math.random() < 0.5 ? '#35f0ff' : '#ff3d81', s: rand(2, 5)
        });
      }
    }
    ctx.save();
    for (const p of this._menuFx) {
      p.x += p.vx * 0.016; p.y += p.vy * 0.016;
      if (p.x < 0) p.x = vw; if (p.x > vw) p.x = 0;
      if (p.y < 0) p.y = vh; if (p.y > vh) p.y = 0;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, p.s, p.s);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  },

  /* ============================================================
     HUD
     ============================================================ */
  updateHUD(force) {
    if (this.state === 'menu' || this.state === 'over') return;
    const c = this.hudCache;
    const [a, b] = this.fighters;
    if (!a) return;

    for (const [f, i] of [[a, 'p1'], [b, 'p2']]) {
      const frac = clamp(f.hp / f.maxHp, 0, 1);
      const key = 'hp' + i;
      if (c[key] !== frac.toFixed(3) || force) {
        c[key] = frac.toFixed(3);
        const el = document.getElementById('hp-' + i);
        el.style.transform = `scaleX(${frac})`;
        el.classList.toggle('low', frac < 0.3);
        const gh = document.getElementById('hp-ghost-' + i);
        gh.style.transform = `scaleX(${frac})`; // CSS transition (0.6s + 0.25s delay) lags behind
      }
      const m = Math.floor(f.meter);
      if (c['m' + i] !== m || force) {
        c['m' + i] = m;
        const el = document.getElementById('mt-' + i);
        el.style.transform = `scaleX(${f.meter / 100})`;
        document.getElementById('mt-' + i + '-txt').textContent = f.meter >= 100 ? 'NOVA READY' : '';
        el.parentElement.classList.toggle('full', f.meter >= 100);
      }
      const wins = f.wins;
      if (c['w' + i] !== wins || force) {
        c['w' + i] = wins;
        const pips = document.getElementById('pips-' + i).children;
        for (let p = 0; p < pips.length; p++) pips[p].classList.toggle('won', p < wins);
      }
    }

    const secs = Math.ceil(this.clock);
    if (c.clock !== secs || force) {
      c.clock = secs;
      const el = document.getElementById('clock');
      el.textContent = secs;
      el.classList.toggle('low', secs <= 10);
    }
  },

  /* ---------------- menu helpers ---------------- */
  renderRoster() {
    const wrap = document.getElementById('roster');
    wrap.innerHTML = '';
    for (const id of Object.keys(FIGHTER_DEFS)) {
      const def = FIGHTER_DEFS[id];
      const card = document.createElement('button');
      card.className = 'fcard' + (id === this.p1Id ? ' active' : '');
      card.dataset.id = id;
      card.innerHTML =
        '<canvas class="mini"></canvas>' +
        '<span class="nm">' + def.name + '</span>' +
        '<span class="ds">' + def.desc + '</span>' +
        '<span class="bars">HP ' + bars(def.hp, 118) + ' PWR ' + bars(def.dmgMul, 1.3) + ' SPD ' + bars(def.speed, 340) + '</span>';
      card.addEventListener('click', () => {
        this.p1Id = id;
        store.set('nff.p1', id);
        this.renderRoster();
        AudioSys.init(); AudioSys.resume(); AudioSys.select();
      });
      wrap.appendChild(card);
      drawPortrait(card.querySelector('.mini'), def);
    }
  },

  syncDiff() {
    for (const b of document.querySelectorAll('.diff-btn')) {
      b.classList.toggle('active', b.dataset.diff === this.diff);
    }
  },

  renderLifetime() {
    const el = document.getElementById('nf-stats');
    if (el && this.mode === 'cpu') {
      const best = store.get('nff.beststreak', 0);
      el.textContent = 'HARD-MODE STREAK BEST: ' + best + '  •  WINS: ' + fmtNum(this.record.wins);
    } else if (el) {
      el.textContent = '';
    }
  }
};

function bars(v, max) {
  const n = clamp(Math.round((v / max) * 5), 1, 5);
  let r = '';
  for (let i = 0; i < 5; i++) r += i < n ? '▮' : '▯';
  return r;
}

/* lightweight haptics */
const Platform3 = {
  vibrate(pattern) {
    try {
      if (AudioSys.muted || document.hidden) return;
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* unsupported */ }
  }
};

/* ============================================================
   Input
   ============================================================ */
const Input = {
  keys: Object.create(null),
  touch: { left: false, right: false, block: false, punch: false, kick: false, special: false, dash: false },
  edge: Object.create(null),

  init() {
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (!this.keys[e.code]) this.edge[e.code] = true;
      this.keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); });

    const bind = (id, prop) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => {
        this.touch[prop] = true;
        el.classList.add('pressed');
        e.preventDefault();
      });
      const up = () => { this.touch[prop] = false; el.classList.remove('pressed'); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };
    bind('t-left', 'left');
    bind('t-right', 'right');
    bind('t-block', 'block');
    bind('t-punch', 'punch');
    bind('t-kick', 'kick');
    bind('t-spec', 'special');
  },

  playerInput(slot) {
    const k = this.keys;
    const t = this.touch;
    if (slot === 0) {
      return {
        left: !!(k['KeyA'] || t.left),
        right: !!(k['KeyD'] || t.right),
        block: !!(k['KeyS'] || t.block),
        punch: !!(k['KeyF'] || t.punch),
        kick: !!(k['KeyG'] || t.kick),
        special: !!(k['KeyH'] || t.special),
        dash: !!k['ShiftLeft']
      };
    }
    return {
      left: !!k['ArrowLeft'],
      right: !!k['ArrowRight'],
      block: !!k['ArrowDown'],
      punch: !!k['KeyK'],
      kick: !!k['KeyL'],
      special: !!(k['Semicolon'] || k['KeyO']),
      dash: false
    };
  },

  consumeEdges() {
    // edge-triggered actions become "pressed once" — treat keydown edges
    this.edge = Object.create(null);
  },

  showTouch(on) {
    document.getElementById('touch-ui').classList.toggle('hidden', !on);
  }
};

/* ============================================================
   Boot
   ============================================================ */
function wireUI() {
  const on = (id, fn) => {
    const el = document.getElementById(id);
    el.addEventListener('click', (e) => { e.preventDefault(); el.blur(); fn(); });
  };
  on('btn-vs-cpu', () => { Game.mode = 'cpu'; AudioSys.init(); AudioSys.resume(); AudioSys.select(); Game.startMatch(); });
  on('btn-2p', () => { Game.mode = '2p'; AudioSys.init(); AudioSys.resume(); AudioSys.select(); Game.startMatch(); });
  on('nf-resume', () => { AudioSys.ui(); Game.togglePause(); });
  on('nf-restart', () => { AudioSys.ui(); Game.startMatch(); });
  on('nf-quit', () => { AudioSys.ui(); Game.enterMenu(); });
  on('nf-again', () => { AudioSys.ui(); Game.startMatch(); });
  on('nf-menu', () => { AudioSys.ui(); Game.enterMenu(); });
  on('nf-pause', () => { if (Game.state !== 'menu' && Game.state !== 'over') Game.togglePause(); });
  on('nf-mute', () => {
    AudioSys.init();
    AudioSys.setMuted(!AudioSys.muted);
    document.getElementById('nf-mute').classList.toggle('off', AudioSys.muted);
  });
  for (const b of document.querySelectorAll('.diff-btn')) {
    b.addEventListener('click', () => {
      Game.diff = b.dataset.diff;
      store.set('nff.diff', Game.diff);
      Game.syncDiff();
      AudioSys.init(); AudioSys.ui();
    });
  }
  if (AudioSys.muted) document.getElementById('nf-mute').classList.add('off');

  const hint = document.getElementById('nf-controls-hint');
  if (IS_TOUCH) {
    hint.innerHTML = 'On-screen buttons: <b>move</b> + BLOCK / PUNCH / KICK / NOVA.<br>Fill the amber meter, then unleash the NOVA dash!';
  } else {
    hint.innerHTML =
      'P1: <span class="key">A</span><span class="key">D</span> move &bull; <span class="key">S</span> block &bull; <span class="key">F</span> punch &bull; <span class="key">G</span> kick &bull; <span class="key">H</span> NOVA &bull; <span class="key">SHIFT</span> dash<br>' +
      'P2: <span class="key">&#8592;</span><span class="key">&#8594;</span> move &bull; <span class="key">&#8595;</span> block &bull; <span class="key">K</span> punch &bull; <span class="key">L</span> kick &bull; <span class="key">O</span> NOVA<br>' +
      'Chain hits for combo damage &bull; Best of 3 rounds';
  }
}

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;
  if (dt < 0) dt = 0;

  if (Input.edge['KeyP'] || Input.edge['Escape']) {
    if (Game.state !== 'menu' && Game.state !== 'over') Game.togglePause();
  }
  if (Input.edge['KeyR'] && Game.state === 'over') Game.startMatch();
  if (Input.edge['KeyM']) {
    AudioSys.init();
    AudioSys.setMuted(!AudioSys.muted);
    document.getElementById('nf-mute').classList.toggle('off', AudioSys.muted);
  }
  Input.consumeEdges();

  Game.update(dt);
  Game.render();
  Game.updateHUD();
}

Game.init();
Input.init();
wireUI();
requestAnimationFrame(frame);
