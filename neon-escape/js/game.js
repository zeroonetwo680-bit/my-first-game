'use strict';
/* ============================================================
   NEON ESCAPE — game.js
   States, camera, rendering, campaign/shop/gear/skins, modes.
   Modes: campaign (15 handcrafted) | endless | daily | training.
   ============================================================ */

const Game = {
  W: 900, H: 540,
  canvas: null, ctx: null,
  state: 'menu', mode: 'campaign',
  t: 0, lastTs: 0,
  camX: 0, zoom: 1,
  level: null, levelDef: null, levelIdx: 0,
  run: null, world: null,
  wallet: 0, runScore: 0, runCoins: 0,
  progress: {}, moves: { dbl: false, wall: false, flip: false, phantom: false, prec: false },
  gear: { visor: 0, suit: 0, gloves: 0, boots: 0 },
  skin: 'subject', skins: ['subject'],
  best: { endless: 0, daily: 0 },
  storySeen: {}, revived: false, todayYmd: 0,
  finishing: false,
  swarm: { active: false, gap: 0, max: 380, ramp: 0 }, lastDeath: 'trap', _buzzTick: -1,

  /* ---------------- persistence ---------------- */
  save() {
    Store.set('coins', this.wallet);
    Store.set('progress', this.progress);
    Store.set('moves', this.moves);
    Store.set('gear', this.gear);
    Store.set('skin', this.skin);
    Store.set('skins', this.skins);
    Store.set('best', this.best);
    Store.set('story', this.storySeen);
  },
  load() {
    this.wallet = Store.get('coins', 0);
    this.progress = Store.get('progress', {});
    const m = Store.get('moves', null); if (m) Object.assign(this.moves, m);
    const g = Store.get('gear', null); if (g) Object.assign(this.gear, g);
    this.skin = Store.get('skin', 'subject');
    this.skins = Store.get('skins', ['subject']);
    this.best = Store.get('best', { endless: 0, daily: 0 });
    this.storySeen = Store.get('story', {});
  },

  /* ---------------- boot ---------------- */
  boot(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext ? canvas.getContext('2d') : null;
    this.load();
    if (typeof Art !== 'undefined') Art.load();
    Input.init(canvas);
    AudioSys.init();
    this.bindUi();
    this.state = 'menu';
    this.showScreen('ne-menu');
    const self = this;
    this.lastTs = (typeof performance !== 'undefined' ? performance.now() : 0);
    const frame = function (ts) {
      const now = (typeof performance !== 'undefined' ? performance.now() : ts || 0);
      let dt = (now - self.lastTs) / 1000;
      self.lastTs = now;
      if (!(dt > 0) || dt > 0.05) dt = 0.016;
      self.update(dt);
      self.render();
      if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
    };
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  },

  bindUi() {
    const self = this;
    if (typeof document === 'undefined' || !document.addEventListener) return;
    document.addEventListener('click', function (e) {
      const el = e.target || {};
      const act = el.getAttribute && el.getAttribute('data-act');
      if (act) { self.act(act); }
    });
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('keydown', function (e) {
        if (e.code === 'KeyP' || e.code === 'Escape') self.act('pause');
        if (e.code === 'KeyR' && (self.state === 'playing' || self.state === 'dead')) self.act('retry');
      });
    }
  },

  showScreen(id) {
    const ids = ['ne-menu', 'ne-levels', 'ne-shop', 'ne-gear', 'ne-skins', 'ne-story', 'ne-pause', 'ne-dead', 'ne-complete', 'ne-over', 'ne-ending'];
    if (typeof document === 'undefined') return;
    for (let i = 0; i < ids.length; i++) {
      const el = document.getElementById(ids[i]);
      if (el && el.classList) el.classList.toggle('hidden', ids[i] !== id);
    }
    const hud = document.getElementById('ne-hud');
    if (hud && hud.classList) hud.classList.toggle('hidden', id !== null && this.state !== 'playing' && this.state !== 'paused');
  },

  setText(id, txt) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  },

  /* ---------------- UI actions ---------------- */
  act(a) {
    AudioSys.init(); AudioSys.resume();
    const parts = a.split(':');
    switch (parts[0]) {
      case 'menu': this.state = 'menu'; this.showScreen('ne-menu'); AudioSys.play('ui'); break;
      case 'open': this.state = parts[1]; this.showScreen('ne-' + parts[1]); this.renderPanel(parts[1]); AudioSys.play('ui'); break;
      case 'mute': AudioSys.toggleMute(); AudioSys.play('ui'); break;
      case 'mode':
        this.mode = parts[1];
        if (parts[1] === 'campaign') { this.state = 'levels'; this.showScreen('ne-levels'); this.renderPanel('levels'); }
        else if (parts[1] === 'training') this.startLevel({ id: 'train', name: 'Training Room', zone: 1, len: 60, gaps: [], crates: [8, 20, 32], beams: [[14, 16], [26, 28]], saws: [12, 24, 36], mines: [30], vents: [18], lasers: [{ c: 22, row: 4 }], pistons: [{ c: 28, row: 2 }], drones: [{ c: 34, row: 4 }], walls: [40], coinArcs: [[10, 12, 3]], floorCoins: [[4, 6]] });
        else this.startRun(parts[1]);
        AudioSys.play('ui');
        break;
      case 'level': this.startCampaignLevel(parts[1]); break;
      case 'retry': this.retry(); AudioSys.play('ui'); break;
      case 'resume': this.state = 'playing'; this.showScreen(null); AudioSys.play('ui'); break;
      case 'pause':
        if (this.state === 'playing') { this.state = 'paused'; this.showScreen('ne-pause'); }
        else if (this.state === 'paused') { this.state = 'playing'; this.showScreen(null); }
        break;
      case 'revive':
        if (!this.revived && this.run && this.run.dead) {
          this.revived = true;
          this.run.dead = false; this.run.iframes = 1.4; this.run.vy = 0; this.run.stumbleT = 0;
          this.swarm.gap = Math.max(this.swarm.gap, 280);
          this.state = 'playing'; this.showScreen(null);
          AudioSys.play('shield');
        }
        break;
      case 'next': this.nextLevel(); break;
      case 'buyMove': this.buyMove(parts[1]); break;
      case 'buySkin': this.buySkin(parts[1]); break;
      case 'equipSkin': this.skin = parts[1]; this.save(); this.renderPanel('skins'); AudioSys.play('buy'); break;
      case 'buyGear': this.buyGear(parts[1]); break;
      case 'story': this.afterStory(); break;
      case 'endless': case 'daily': this.startRun(parts[0]); break;
    }
    this.updateHud();
  },

  buyMove(id) {
    const m = MOVES[id];
    if (!m || this.moves[id] || this.wallet < m.price) { AudioSys.play('stumble'); return; }
    this.wallet -= m.price; this.moves[id] = true; this.save(); this.renderPanel('shop');
    AudioSys.play('buy'); FX.addFlash(0.2, '#52ff9d');
  },
  buySkin(id) {
    const s = SKINS.filter(x => x.id === id)[0];
    if (!s || this.skins.indexOf(id) >= 0 || this.wallet < s.price) { AudioSys.play('stumble'); return; }
    if (s.feat && !this.progressDone()) { AudioSys.play('stumble'); return; }
    this.wallet -= s.price; this.skins.push(id); this.skin = id; this.save(); this.renderPanel('skins');
    AudioSys.play('buy'); FX.addFlash(0.2, s.trail);
  },
  buyGear(id) {
    const g = GEARS[id];
    if (!g) return;
    const tier = this.gear[id] || 0;
    if (tier >= g.tiers.length) { AudioSys.play('stumble'); return; }
    const price = g.tiers[tier].price;
    if (this.wallet < price) { AudioSys.play('stumble'); return; }
    this.wallet -= price; this.gear[id] = tier + 1; this.save(); this.renderPanel('gear');
    AudioSys.play('buy'); FX.addFlash(0.2, '#ffd24d');
  },

  /* ---------------- panels ---------------- */
  renderPanel(which) {
    if (which === 'levels') {
      let html = '';
      for (let z = 1; z <= 3; z++) {
        html += '<div class="ne-zone-title">ZONE ' + z + '</div><div class="ne-grid">';
        for (let i = 0; i < Levels.LIST.length; i++) {
          const d = Levels.LIST[i];
          if (d.zone !== z) continue;
          const done = this.progress[d.id] && this.progress[d.id].done;
          html += '<button class="ne-card' + (done ? ' done' : '') + '" data-act="level:' + d.id + '">' +
            d.id.toUpperCase() + '<span>' + d.name + '</span></button>';
        }
        html += '</div>';
      }
      this.setHtml('ne-levels-body', html);
    } else if (which === 'shop') {
      let html = '<div class="ne-grid">';
      for (const k in MOVES) {
        const m = MOVES[k], owned = this.moves[k];
        html += '<button class="ne-card' + (owned ? ' done' : '') + '" data-act="' + (owned ? '' : 'buyMove:' + k) + '">' +
          m.name + '<span>' + m.desc + '</span><b>' + (owned ? 'OWNED' : m.price + ' C') + '</b></button>';
      }
      html += '</div>';
      this.setHtml('ne-shop-body', html);
    } else if (which === 'skins') {
      let html = '<div class="ne-grid">';
      for (let i = 0; i < SKINS.length; i++) {
        const s = SKINS[i], owned = this.skins.indexOf(s.id) >= 0;
        const feat = s.feat && !this.progressDone();
        html += '<button class="ne-card' + (this.skin === s.id ? ' done' : '') + '" style="border-color:' + s.trail + '" data-act="' +
          (owned ? 'equipSkin:' + s.id : (feat ? '' : 'buySkin:' + s.id)) + '">' +
          s.name + '<span>' + s.rarity + '</span><b>' + (owned ? (this.skin === s.id ? 'EQUIPPED' : 'EQUIP') : (feat ? 'FINISH ALL LEVELS' : s.price + ' C')) + '</b></button>';
      }
      html += '</div>';
      this.setHtml('ne-skins-body', html);
    } else if (which === 'gear') {
      let html = '<div class="ne-grid">';
      for (const k in GEARS) {
        const g = GEARS[k], tier = this.gear[k] || 0;
        const maxed = tier >= g.tiers.length;
        const price = maxed ? 0 : g.tiers[tier].price;
        html += '<button class="ne-card' + (maxed ? ' done' : '') + '" data-act="' + (maxed ? '' : 'buyGear:' + k) + '">' +
          g.name + ' ' + '★'.repeat(tier) + '<span>' + g.desc + '</span><b>' + (maxed ? 'MAX' : price + ' C') + '</b></button>';
      }
      html += '</div>';
      this.setHtml('ne-gear-body', html);
    }
  },
  setHtml(id, html) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  },
  progressDone() {
    let n = 0;
    for (let i = 0; i < Levels.LIST.length; i++) {
      const p = this.progress[Levels.LIST[i].id];
      if (p && p.done) n++;
    }
    return n >= Levels.LIST.length;
  },

  /* ---------------- start / flow ---------------- */
  startCampaignLevel(id) {
    let def = null, idx = 0;
    for (let i = 0; i < Levels.LIST.length; i++) if (Levels.LIST[i].id === id) { def = Levels.LIST[i]; idx = i; }
    if (!def) return;
    this.levelIdx = idx;
    const firstOfZone = !this.storySeen['z' + def.zone];
    if (firstOfZone) {
      this.pendingDef = def;
      this.state = 'story';
      this.setText('ne-story-text', ZONE_STORY[def.zone]);
      this.showScreen('ne-story');
      return;
    }
    this.startLevel(def, false);
  },
  afterStory() {
    if (this.pendingDef) {
      this.storySeen['z' + this.pendingDef.zone] = true;
      this.save();
      this.startLevel(this.pendingDef, false);
      this.pendingDef = null;
    } else if (this.finishing) {
      this.state = 'ending';
      this.setText('ne-ending-text', ZONE_STORY.end);
      this.showScreen('ne-ending');
    }
  },
  startRun(mode) {
    this.mode = mode;
    const ymd = this.todayYmd || 20261020;
    const seed = mode === 'daily' ? Levels.dailySeed(ymd) : ((Date.now ? Date.now() : ymd) % 100000);
    const def = Levels.genDef(seed, mode === 'daily' ? 22 : 40);
    def.id = mode === 'daily' ? 'daily' : 'endless';
    def.name = mode === 'daily' ? 'Daily Run' : 'Endless';
    this.startLevel(def);
  },
  startLevel(def) {
    this.levelDef = def;
    this.level = Levels.build(def);
    this.run = Runner.create(this.level.start.x, this.level.start.y);
    this.run.shieldHits = this.gear.suit || 0;
    this.runScore = 0; this.runCoins = 0; this.revived = false; this.finishing = false;
    Flow.reset();
    FX.clear();
    this.lastDeath = 'trap';
    this.swarm.active = !!def.chase || this.mode === 'endless' || this.mode === 'daily';
    this.swarm.gap = 300; this.swarm.max = 380; this.swarm.ramp = 0; this._buzzTick = -1;
    this.camX = 0; this.zoom = 1;
    this.state = 'playing';
    this.showScreen(null);
    AudioSys.startMusic();
    this.updateHud();
  },
  retry() {
    if (this.levelDef) this.startLevel(this.levelDef);
  },
  nextLevel() {
    if (this.mode === 'campaign') {
      const next = Levels.LIST[this.levelIdx + 1];
      if (next) this.startCampaignLevel(next.id);
      else { this.finishing = true; this.afterStory(); }
    } else this.startRun(this.mode);
  },

  /* ---------------- HUD ---------------- */
  updateHud() {
    this.setText('ne-score', String(Math.floor(this.runScore)));
    this.setText('ne-coins', String(Math.floor(this.runCoins)));
    this.setText('ne-flow', 'x' + Flow.mult);
    this.setText('ne-wallet', this.wallet + ' C');
    this.setText('ne-level-name', this.levelDef ? this.levelDef.name : '');
    if (this.run) this.setText('ne-shield', '◆'.repeat(this.run.shieldHits) + '◇'.repeat(Math.max(0, (this.gear.suit || 0) - this.run.shieldHits)));
  },

  /* ---------------- update ---------------- */
  update(dt) {
    this.t += dt;
    FX.update(dt);
    if (this.state !== 'playing' || !this.run) { Input.endFrame(); return; }

    const now = (typeof performance !== 'undefined' ? performance.now() : this.t * 1000);
    const sw = Input.consumeSwipe();
    const acts = {
      jump: Input.pressed('KeyW', 'ArrowUp', 'Space') || sw === 'up',
      slide: Input.pressed('KeyS', 'ArrowDown') || sw === 'down',
      dash: Input.pressed('KeyD', 'ArrowRight', 'ShiftLeft', 'ShiftRight') || sw === 'right' || Input.tapDashUntil > now
    };

    const world = {
      solids: this.level.solids, hazards: this.level.hazards, coins: this.level.coins,
      exit: this.level.exit, moves: this.moves, gear: this.gear,
      hazardRect: Levels.hazardRect, done: false
    };
    const p = this.run;
    const prevX = p.x;
    Runner.step(p, dt, world, acts, this.t);
    this.runScore += (p.x - prevX) * 0.1 * Flow.mult;
    Flow.update(dt);

    if (world.done && !p.dead) return this.complete();
    if (p.dead) { this.lastDeath = 'trap'; return this.die(); }

    // ---- SWARM CHASE (stumbles let it close in; clean play + dash pull away) ----
    if (this.swarm.active) {
      let delta = 16;
      if (p.stumbleT > 0) delta = -215;
      else if (p.dashT > 0) delta = 330;
      else if (p.vaultT > 0) delta = 40;
      if (p.precT > 0) delta += 55;
      this.swarm.ramp = Math.min(9, p.dist / 9000);
      delta -= this.swarm.ramp;
      this.swarm.gap = clamp(this.swarm.gap + delta * dt, -20, this.swarm.max);
      const bTick = Math.floor(this.t * 2.5);
      if (this.swarm.gap < 150 && bTick !== this._buzzTick) { this._buzzTick = bTick; AudioSys.play('buzz'); }
      if (this.swarm.gap <= 0) {
        p.dead = true; this.lastDeath = 'swarm';
        FX.spawn(p.x, p.y - 40, '#ff3b5c', 26, { speed: 340 });
        FX.shake(10, 0.5); FX.addFlash(0.6, '#ff3b5c');
        AudioSys.play('death');
        return this.die();
      }
    }

    // camera
    const target = clamp(p.x - 280, 0, Math.max(0, this.level.width - this.W));
    this.camX = lerp(this.camX, target, Math.min(1, dt * 7));
    const zTarget = p.dashT > 0 ? 1.035 : 1;
    this.zoom = lerp(this.zoom, zTarget, Math.min(1, dt * 4));

    this.updateHud();
    Input.endFrame();
  },

  complete() {
    const p = this.run;
    const bonus = 100 + Math.floor(p.dist / 20) + p.coins * 10 + p.tricks * 25;
    this.wallet += p.coins + Math.floor(bonus / 10);
    this.runCoins += p.coins;
    if (this.mode === 'campaign' && this.levelDef && this.levelDef.id) {
      const cur = this.progress[this.levelDef.id] || {};
      cur.done = true;
      cur.best = Math.max(cur.best || 0, Math.floor(this.runScore + bonus));
      this.progress[this.levelDef.id] = cur;
    } else {
      const sc = Math.floor(this.runScore + bonus);
      if (this.mode === 'daily') this.best.daily = Math.max(this.best.daily, sc);
      else this.best.endless = Math.max(this.best.endless, sc);
    }
    this.save();
    this.state = 'complete';
    this.setText('ne-complete-score', String(Math.floor(this.runScore + bonus)));
    this.setText('ne-complete-coins', '+' + (p.coins + Math.floor(bonus / 10)) + ' C');
    this.showScreen('ne-complete');
    AudioSys.play('win');
    AudioSys.stopMusic();
  },

  die() {
    this.state = 'dead';
    this.setText('ne-dead-title', this.lastDeath === 'swarm' ? 'SWARMED!' : 'CAUGHT!');
    this.setText('ne-dead-score', String(Math.floor(this.runScore)));
    this.setText('ne-dead-coins', '+' + this.run.coins + ' C');
    this.showScreen('ne-dead');
    AudioSys.stopMusic();
    this.wallet += this.run.coins;
    this.save();
  },

  /* ---------------- render ---------------- */
  render() {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.W, H = this.H;
    ctx.save();
    // camera shake + zoom
    const sh = FX.shakeT > 0 ? FX.shakeM : 0;
    const ox = sh ? (Math.random() - 0.5) * sh : 0, oy = sh ? (Math.random() - 0.5) * sh : 0;
    ctx.translate(W / 2 + ox, H / 2 + oy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-W / 2, -H / 2);

    this.drawBg(ctx);

    if (this.level && this.run) {
      const cam = this.camX;
      this.drawLevel(ctx, cam);
      this.drawSwarm(ctx, cam);
      Runner.drawGhosts(ctx, this.run, cam, this.skinDef());
      Runner.draw(ctx, this.run, cam, this.skinDef());
      FX.draw(ctx, cam);
    } else {
      FX.draw(ctx, 0);
      this.drawMenuBg(ctx);
    }

    // vignette + flash
    if (FX.flash > 0) {
      ctx.fillStyle = FX.flashCol || '#ffffff';
      ctx.globalAlpha = FX.flash * 0.5;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },

  skinDef() {
    return SKINS.filter(s => s.id === this.skin)[0] || SKINS[0];
  },

  drawBg(ctx) {
    const zone = this.levelDef ? (this.levelDef.zone || 1) : 1;
    const cam = this.camX || 0;
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    if (zone === 1) { g.addColorStop(0, '#071426'); g.addColorStop(1, '#0d2438'); }
    else if (zone === 2) { g.addColorStop(0, '#1a0714'); g.addColorStop(1, '#2b0f1c'); }
    else { g.addColorStop(0, '#05060f'); g.addColorStop(1, '#141b33'); }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);

    // parallax layers (deterministic shapes)
    const rnd = mulberry32(zone * 999 + 7);
    for (let layer = 0; layer < 3; layer++) {
      const speed = [0.18, 0.38, 0.62][layer];
      const col = ['#0f2a44', '#123a5c', '#18496e'][layer];
      const baseY = [210, 290, 360][layer];
      const off = (cam * speed) % 220;
      ctx.fillStyle = zone === 2 ? ['#2b1020', '#3a152c', '#4c1c3c'][layer] : (zone === 3 ? ['#0c1226', '#131c38', '#1a2748'][layer] : col);
      for (let i = -1; i < 6; i++) {
        const x = i * 220 - off;
        const h = 60 + ((i + layer * 5 + zone) % 4) * 42;
        ctx.fillRect(x, baseY - h + 60, 150, h + 120);
        // window lights
        ctx.fillStyle = 'rgba(53,240,255,0.08)';
        for (let wy = 0; wy < 4; wy++) {
          for (let wx = 0; wx < 5; wx++) {
            if (((i * 13 + wy * 7 + wx * 3 + layer) % 5) < 2) {
              ctx.fillRect(x + 12 + wx * 28, baseY - h + 72 + wy * 26, 14, 10);
            }
          }
        }
        ctx.fillStyle = zone === 2 ? ['#2b1020', '#3a152c', '#4c1c3c'][layer] : (zone === 3 ? ['#0c1226', '#131c38', '#1a2748'][layer] : col);
      }
    }
    if (zone === 3) {
      // moon + searchlights
      ctx.fillStyle = '#eaf6ff';
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(720 - cam * 0.05, 90, 34, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = '#ffd24d';
      ctx.beginPath();
      ctx.moveTo(120 - cam * 0.12 % this.W, 0); ctx.lineTo(320 - cam * 0.12 % this.W, 432); ctx.lineTo(20 - cam * 0.12 % this.W, 432);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  },

  drawMenuBg(ctx) {
    const t = this.t;
    ctx.fillStyle = 'rgba(53,240,255,0.06)';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 180 + t * 40) % (this.W + 200)) - 100;
      ctx.fillRect(x, 380 - (i % 3) * 60, 120, 200);
    }
  },

  drawLevel(ctx, cam) {
    const L = this.level;
    // solids
    for (let i = 0; i < L.solids.length; i++) {
      const s = L.solids[i];
      const x = s.x - cam;
      if (x > this.W + 60 || x < -80) continue;
      if (s.kind === 'ground') {
        const grad = ctx.createLinearGradient(0, s.y, 0, this.H);
        grad.addColorStop(0, '#1c2b3c'); grad.addColorStop(1, '#0a121c');
        ctx.fillStyle = grad;
        ctx.fillRect(x, s.y, s.w + 1, this.H - s.y);
        ctx.fillStyle = '#35f0ff';
        ctx.fillRect(x, s.y, s.w + 1, 3);
      } else if (s.kind === 'plat') {
        ctx.fillStyle = '#22405c'; ctx.fillRect(x, s.y, s.w, s.h);
        ctx.fillStyle = '#35f0ff'; ctx.fillRect(x, s.y, s.w, 2);
      } else if (s.kind === 'beam') {
        ctx.fillStyle = '#ff3d81'; ctx.fillRect(x, s.y, s.w, s.h);
        ctx.fillStyle = 'rgba(255,61,129,0.35)'; ctx.fillRect(x - 2, s.y - 3, s.w + 4, s.h + 6);
      } else if (s.kind === 'crate') {
        ctx.fillStyle = '#7a4a1e'; ctx.fillRect(x, s.y, s.w, s.h);
        ctx.fillStyle = '#ffb84d'; ctx.fillRect(x + 4, s.y + 4, s.w - 8, 3);
        ctx.fillRect(x + 4, s.y + s.h - 8, s.w - 8, 3);
      } else if (s.kind === 'wall') {
        ctx.fillStyle = '#2b3f55'; ctx.fillRect(x, s.y, s.w, s.h);
        ctx.fillStyle = '#52ff9d'; ctx.fillRect(x + 8, s.y + 6, 3, s.h - 12);
      }
    }
    // hazards
    const t = this.t;
    for (let i = 0; i < L.hazards.length; i++) {
      const h = L.hazards[i];
      const r = Levels.hazardRect(h, t);
      const x = h.x - cam;
      if (x > this.W + 160 || x < -160) continue;
      this.drawTrap(ctx, h, r, cam, t);
    }
    // coins
    for (let i = 0; i < L.coins.length; i++) {
      const c = L.coins[i];
      if (c.got) continue;
      const x = c.x - cam;
      if (x < -40 || x > this.W + 40) continue;
      const bob = Math.sin(t * 3 + c.x * 0.02) * 3;
      const rr = c.val > 1 ? 13 : 9;
      ctx.save();
      ctx.translate(x, c.y + bob);
      ctx.rotate(Math.sin(t * 2 + c.x) * 0.4);
      ctx.fillStyle = c.val > 1 ? '#b28dff' : '#ffd24d';
      ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(-rr + 3, -rr + 3, rr, rr * 0.6);
      ctx.restore();
    }
    // exit
    if (L.exit) {
      const e = L.exit, x = e.x - cam;
      if (x > -100 && x < this.W + 100) {
        ctx.fillStyle = '#0d3b2e';
        ctx.fillRect(x, e.y, e.w, e.h);
        ctx.strokeStyle = '#52ff9d'; ctx.lineWidth = 3;
        ctx.strokeRect(x, e.y, e.w, e.h);
        ctx.fillStyle = '#52ff9d';
        ctx.font = 'bold 14px Orbitron, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('EXIT', x + e.w / 2, e.y - 10);
        ctx.textAlign = 'left';
      }
    }
  },

  drawSwarm(ctx, cam) {
    if (!this.swarm.active || !this.run) return;
    const sx = this.run.x - this.swarm.gap - cam;
    const t = this.t;
    const close = clamp((150 - this.swarm.gap) / 150, 0, 1);
    // smoke trail
    ctx.fillStyle = 'rgba(40,8,20,0.55)';
    for (let i = 0; i < 5; i++) {
      const off = Math.sin(t * 2 + i * 1.3) * 30;
      ctx.beginPath();
      ctx.arc(sx - 40 - i * 26, GROUND_Y - 70 + off + Math.sin(t * 3 + i) * 14, 34 + i * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // bots — real sprites when the atlas is loaded, glowing dots otherwise
    const art = typeof Art !== 'undefined' && Art.ready;
    for (let i = 0; i < 7; i++) {
      const bx = sx - 20 + Math.sin(t * 2.4 + i * 1.7) * 26 - i * 5;
      const by = GROUND_Y - 78 + Math.sin(t * 3.1 + i * 2.1) * 26;
      const wasp = i % 3 === 1;
      ctx.fillStyle = 'rgba(255,59,92,' + (0.12 + close * 0.2) + ')';
      ctx.beginPath(); ctx.arc(bx, by, (wasp ? 20 : 27) + close * 6, 0, Math.PI * 2); ctx.fill();
      let ok = false;
      if (art) {
        ok = Art.drawBot(ctx, wasp ? 'wasp' : 'hunter', bx, by,
          (wasp ? 26 : 34) + close * 3, 0.85 + close * 0.15,
          Math.sin(t * 2.2 + i) * 0.08);
      }
      if (!ok) {
        const r = 7 + ((i * 37) % 5);
        ctx.fillStyle = i % 2 ? '#ff3b5c' : '#ff6a8a';
        ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd24d';
        ctx.fillRect(bx - 2, by - 2, 4, 4);
      }
    }
    // gap meter
    const w = 260, x0 = this.W / 2 - w / 2, y0 = 18;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x0, y0, w, 10);
    const frac = clamp(this.swarm.gap / this.swarm.max, 0, 1);
    ctx.fillStyle = frac > 0.5 ? '#52ff9d' : (frac > 0.25 ? '#ffd24d' : '#ff3b5c');
    ctx.fillRect(x0, y0, w * frac, 10);
    ctx.fillStyle = '#eaf6ff';
    ctx.font = 'bold 11px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SWARM', this.W / 2, y0 - 5);
    ctx.textAlign = 'left';
    // red vignette when close
    if (close > 0) {
      ctx.fillStyle = 'rgba(255,59,92,' + (close * 0.22 * (0.7 + 0.3 * Math.sin(t * 6))) + ')';
      ctx.fillRect(0, 0, this.W, this.H);
    }
  },

  drawTrap(ctx, h, r, cam, t) {
    const x = h.x - cam;
    if (h.type === 'laser') {
      // emitters
      ctx.fillStyle = '#ff3b5c';
      ctx.fillRect(x - 6, h.y - 6, h.w + 12, 10);
      ctx.fillRect(x - 6, h.y + h.h - 4, h.w + 12, 10);
      if (r) {
        ctx.fillStyle = 'rgba(255,59,92,0.85)';
        ctx.fillRect(x, h.y, h.w, h.h);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(x + h.w / 2 - 2, h.y, 4, h.h);
      } else {
        const cyc = (t + h.phase) % h.period;
        if (cyc > h.on + (h.period - h.on) * 0.5) {
          ctx.fillStyle = 'rgba(255,59,92,0.25)';
          ctx.fillRect(x + h.w / 2 - 1, h.y, 2, h.h);
        }
      }
    } else if (h.type === 'saw') {
      const cx = x + h.w / 2, cy = h.y + h.h / 2, rr = h.w / 2 - 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 6 + h.phase);
      ctx.fillStyle = '#c8d4e0';
      for (let a = 0; a < 8; a++) {
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(rr * 0.55, -5, rr * 0.55, 10);
      }
      ctx.beginPath(); ctx.arc(0, 0, rr * 0.72, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a4654';
      ctx.beginPath(); ctx.arc(0, 0, rr * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (h.type === 'piston') {
      const down = !!r;
      const hy = down ? h.y + h.h - 56 : h.y;
      ctx.fillStyle = '#243447';
      ctx.fillRect(x + 2, h.y, h.w - 4, h.h);
      ctx.fillStyle = down ? '#ff3b5c' : '#8a4a55';
      ctx.fillRect(x - 4, hy, h.w + 8, 56);
      if (down) {
        ctx.fillStyle = 'rgba(255,59,92,0.3)';
        ctx.fillRect(x - 10, hy + 56, h.w + 20, 8);
      }
    } else if (h.type === 'vent') {
      ctx.fillStyle = '#22303e';
      ctx.fillRect(x, h.y + h.h - 12, h.w, 12);
      if (r) {
        ctx.fillStyle = 'rgba(200,230,255,0.45)';
        for (let s = 0; s < 4; s++) {
          const wob = Math.sin(t * 9 + s * 1.7) * 6;
          ctx.fillRect(x + 4 + wob + s * 5, h.y, 7, h.h - 12);
        }
      }
    } else if (h.type === 'mine') {
      const cx = x + h.w / 2, blink = (Math.sin(t * 5 + h.phase) > 0.2);
      ctx.fillStyle = blink ? '#ff3b5c' : '#7a2333';
      ctx.beginPath(); ctx.arc(cx, h.y + h.h - 8, 13, Math.PI, 0); ctx.fill();
      ctx.fillStyle = blink ? '#ffd24d' : '#a04040';
      ctx.fillRect(cx - 3, h.y + 2, 6, 8);
    } else if (h.type === 'drone') {
      const rr = r || h;
      const x2 = rr.x - cam;
      ctx.fillStyle = '#2b3f55';
      ctx.fillRect(x2, rr.y, rr.w, rr.h);
      ctx.fillStyle = '#ff3b5c';
      ctx.fillRect(x2 + rr.w / 2 - 5, rr.y + 6, 10, 8);
      ctx.fillStyle = 'rgba(53,240,255,0.5)';
      const rot = t * 12;
      ctx.fillRect(x2 + 4 + Math.sin(rot) * 6, rr.y - 6, 18, 4);
      ctx.fillRect(x2 + rr.w - 22 + Math.sin(rot + 2) * 6, rr.y - 6, 18, 4);
    }
  }
};

const ZONE_STORY = {
  1: 'THE COMPLEX — TEST WING\n\nYou wake up in a facility that measures everything you do.\nA voice on the broken intercom: "Run. I will open the doors."\nThey want a specimen. Give them a ghost.',
  2: 'THE REACTOR — MAINTENANCE\n\nHeat, steam, and machines that do not sleep.\nBehind you, the swarm wakes up — and it never slows down.\n"The core door is ahead. Do not stumble."\nTrust the run.',
  3: 'THE SURFACE — EXODUS\n\nNight air. Searchlights. The city beyond the fence.\n"They know you are leaving. GO."\nOne last sprint between you and freedom.',
  end: 'FREEDOM\n\nThe gates open. The city is yours.\nNo more tests. No more numbers.\nJust the wind — and the next run.\n\nTHANK YOU FOR PLAYING NEON ESCAPE'
};
