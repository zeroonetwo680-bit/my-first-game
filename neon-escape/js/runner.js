'use strict';
/* ============================================================
   NEON ESCAPE — runner.js
   Player physics (auto-run parkour), moves, gear, skins, flow.
   ============================================================ */

const TILE = 48;
const GROUND_Y = 432;          // walk line (row 9 top)
const G = 2300;                // gravity px/s^2

/* ---------------- defs (tests assert these) ---------------- */
const MOVES = {
  dbl:     { id: 'dbl',     name: 'Double Jump',    desc: 'قفزة تانية في الهوا',            price: 600 },
  wall:    { id: 'wall',    name: 'Tic-Tac',        desc: 'ارتداد من جدران الجري',          price: 900 },
  flip:    { id: 'flip',    name: 'Backflip',       desc: 'حركة ظلية على القفز المزدوج',   price: 700 },
  phantom: { id: 'phantom', name: 'Phantom Slide',  desc: 'زحلوق شبحي: مناعة 0.18s',       price: 1200 },
  prec:    { id: 'prec',    name: 'Precision Landing', desc: 'هبوط نضيف = دفعة سرعة',      price: 1000 }
};

const GEARS = {
  visor:   { id: 'visor',   name: 'VISOR',   desc: 'شفاط عملات أوسع',
             tiers: [{ price: 500, val: 70 }, { price: 1400, val: 120 }, { price: 3200, val: 190 }] },
  suit:    { id: 'suit',    name: 'SUIT',    desc: 'درع يبتلع الضربات (يتعبد كل مرحلة)',
             tiers: [{ price: 800, val: 1 }, { price: 2200, val: 2 }, { price: 5000, val: 3 }] },
  gloves:  { id: 'gloves',  name: 'GLOVES',  desc: 'ثبات على الجدران أطول',
             tiers: [{ price: 600, val: 1 }, { price: 1600, val: 2 }, { price: 3600, val: 3 }] },
  boots:   { id: 'boots',   name: 'BOOTS',   desc: 'قفزة أعلى وسرعة أعلى',
             tiers: [{ price: 700, val: 1 }, { price: 1800, val: 2 }, { price: 4200, val: 3 }] }
};

const SKINS = [
  { id: 'subject', name: 'SUBJECT-01', col: '#eaf6ff', trail: '#35f0ff', price: 0,    rarity: 'common' },
  { id: 'ember',   name: 'EMBER',      col: '#ff6a3d', trail: '#ffb84d', price: 600,  rarity: 'common' },
  { id: 'volt',    name: 'VOLT',       col: '#ff3d81', trail: '#35f0ff', price: 1200, rarity: 'rare' },
  { id: 'matrix',  name: 'MATRIX',     col: '#52ff9d', trail: '#2ecc71', price: 2000, rarity: 'rare' },
  { id: 'royal',   name: 'ROYAL',      col: '#b28dff', trail: '#8a5cff', price: 3000, rarity: 'epic' },
  { id: 'ice',     name: 'ICE',        col: '#9be8ff', trail: '#35c8ff', price: 4200, rarity: 'epic' },
  { id: 'shadow',  name: 'SHADOW',     col: '#54545e', trail: '#2a2a33', price: 5600, rarity: 'legendary' },
  { id: 'gold',    name: 'GOLD',       col: '#ffd24d', trail: '#ff9d00', price: 0,    rarity: 'legendary', feat: 'finish-all' }
];

/* ---------------- FLOW combo ---------------- */
const Flow = {
  mult: 1, t: 0, hits: 0,
  reset() { this.mult = 1; this.t = 0; this.hits = 0; },
  add(n) {
    this.hits += (n || 1);
    this.mult = Math.min(8, 1 + Math.floor(this.hits / 3));
    this.t = 4.0;
  },
  update(dt) {
    if (this.t > 0) { this.t -= dt; if (this.t <= 0) { this.hits = 0; this.mult = 1; } }
  }
};

/* ---------------- runner ---------------- */
const Runner = {
  create(x, y) {
    return {
      x: x, y: y, vy: 0, onGround: true, dead: false,
      state: 'run', runPhase: 0,
      baseSpeed: 310,
      slideT: 0, dashT: 0, dashCd: 0, vaultT: 0, wallT: 0, flipT: 0,
      stumbleT: 0, iframes: 0, phantomT: 0, precT: 0, coyoteT: 0, bufferT: 0,
      jumpsUsed: 0, shieldHits: 0, coins: 0, dist: 0, tricks: 0, deaths: 0,
      ghosts: []
    };
  },

  box(p) {
    const h = p.slideT > 0 ? 36 : 72;
    return { x: p.x - 17, y: p.y - h, w: 34, h: h };
  },

  tryJump(p) { p.bufferT = 0.12; },
  trySlide(p, world) {
    if (p.onGround) {
      p.slideT = 0.52 * (world && world.gear && world.gear.boots ? 1.12 : 1);
      p.phantomT = (world && world.moves && world.moves.phantom) ? 0.18 : 0;
    } else if (p.vy < 860) { p.vy = 860; }   // dive
  },
  tryDash(p) {
    if (p.dashCd <= 0 && !p.dead) {
      p.dashT = 0.30; p.dashCd = 1.10; p.iframes = Math.max(p.iframes, 0.22);
    }
  },

  step(p, dt, world, acts, t) {
    if (p.dead) return;
    const moves = world.moves || {};
    const gear = world.gear || {};
    const bootsMul = 1 + (gear.boots || 0) * 0.035;

    // --- timers ---
    const dec = (k) => { if (p[k] > 0) p[k] = Math.max(0, p[k] - dt); };
    dec('slideT'); dec('dashT'); dec('dashCd'); dec('vaultT'); dec('wallT'); dec('flipT');
    dec('stumbleT'); dec('iframes'); dec('phantomT'); dec('precT'); dec('coyoteT'); dec('bufferT');

    // --- actions ---
    if (acts && acts.jump) this.tryJump(p);
    if (acts && acts.slide) this.trySlide(p, world);
    if (acts && acts.dash) this.tryDash(p);

    // --- horizontal (auto-run) ---
    let speed = p.baseSpeed * bootsMul;
    if (p.dashT > 0) speed *= 2.05;
    if (p.precT > 0) speed *= 1.12;
    if (p.stumbleT > 0) speed *= 0.45;
    if (p.vaultT > 0) speed *= 1.15;
    p.x += speed * dt;
    p.dist += speed * dt;
    p.runPhase += dt * speed * 0.028;

    // --- vertical ---
    p.vy += G * dt;
    if (p.wallT > 0 && !p.onGround && p.vy > (140 + (gear.gloves || 0) * 30)) {
      p.vy = 140 + (gear.gloves || 0) * 30;
    }
    if (p.vy > 1500) p.vy = 1500;
    const prevFeet = p.y, prevHead = p.y - (p.slideT > 0 ? 36 : 72);
    p.y += p.vy * dt;

    // --- resolve solids ---
    const wasAir = !p.onGround;
    p.onGround = false;
    const solids = world.solids || [];
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      const b = this.box(p);
      if (!aabb(b, s)) continue;
      if (p.vy >= 0 && prevFeet <= s.y + 10) {
        // landing
        p.y = s.y; p.vy = 0; p.onGround = true;
        if (wasAir) {
          if (moves.prec && p.vy === 0) { p.precT = 0.6; p.tricks++; Flow.add(1); FX.text(p.x, p.y - 90, 'CRISP!', '#52ff9d'); }
          if (p.bufferT > 0) { p.bufferT = 0; p.vy = -840 * bootsMul; p.onGround = false; p.jumpsUsed = 1; AudioSys.play('jump'); }
          else { p.jumpsUsed = 0; if (p.flipT <= 0) AudioSys.play('land'); }
        }
      } else if (p.vy < 0 && prevHead >= s.y + s.h - 10) {
        p.y = s.y + s.h + (p.slideT > 0 ? 36 : 72); p.vy = 0;           // head bump
      } else {
        // side collision
        if (s.kind === 'crate') {
          if (p.dashT > 0) {
            s.broken = true; Flow.add(2); p.tricks++;
            FX.spawn(s.x + s.w / 2, s.y, '#ffb84d', 12, { speed: 240 });
            FX.text(s.x + s.w / 2, s.y - 30, 'SMASH!', '#ffb84d');
            AudioSys.play('stumble');
          } else {
            p.y = s.y; p.vy = -260; p.vaultT = 0.28; p.onGround = false;
            AudioSys.play('slide');
          }
        } else if (s.kind === 'wall' && moves.wall && !p.onGround) {
          p.x = s.x - 17; p.wallT = 0.25;
        } else {
          p.x = s.x - 17;
          if (p.stumbleT <= 0 && p.dashT <= 0 && p.iframes <= 0) {
            p.stumbleT = 0.5;
            FX.spawn(p.x + 12, p.y - 40, '#ff6a3d', 8, { speed: 160 });
            AudioSys.play('stumble');
          }
        }
      }
    }
    // remove broken crates
    if (world.solids) {
      for (let i = world.solids.length - 1; i >= 0; i--) if (world.solids[i].broken) world.solids.splice(i, 1);
    }

    // wall jump
    if (p.wallT > 0 && p.bufferT > 0 && moves.wall) {
      p.bufferT = 0; p.wallT = 0; p.vy = -780 * bootsMul; p.jumpsUsed = 1;
      FX.spawn(p.x, p.y - 40, '#35f0ff', 8, { speed: 180 });
      AudioSys.play('djump');
    }
    // double jump
    if (p.bufferT > 0 && !p.onGround && p.wallT <= 0 && p.jumpsUsed < 2 && moves.dbl) {
      p.bufferT = 0; p.vy = -720 * bootsMul; p.jumpsUsed = 2;
      FX.spawn(p.x, p.y, '#35f0ff', 10, { speed: 200 });
      AudioSys.play('djump');
      if (moves.flip) { p.flipT = 0.5; p.tricks++; Flow.add(1); FX.text(p.x, p.y - 100, 'BACKFLIP!', '#b28dff'); AudioSys.play('trick'); }
    }
    // plain grounded jump (buffer fired while grounded)
    if (p.bufferT > 0 && p.onGround) {
      p.bufferT = 0; p.vy = -840 * bootsMul; p.onGround = false; p.jumpsUsed = 1;
      AudioSys.play('jump');
    }

    // --- hazards ---
    const b = this.box(p);
    const hazards = world.hazards || [];
    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      const r = world.hazardRect ? world.hazardRect(h, t) : h;
      if (!r) continue;
      const near = Math.abs((b.x + b.w / 2) - (r.x + r.w / 2)) < (r.w / 2 + b.w / 2 + 34) &&
                   Math.abs((b.y + b.h / 2) - (r.y + r.h / 2)) < (r.h / 2 + b.h / 2 + 34);
      if (aabb(b, r)) {
        if (p.dashT > 0 || p.iframes > 0 || p.phantomT > 0) {
          if (!h._passed) { h._passed = true; Flow.add(1); FX.text(p.x, p.y - 96, 'NEAR!', '#35f0ff'); AudioSys.play('near'); }
          continue;
        }
        if (p.shieldHits > 0) {
          p.shieldHits--; p.iframes = 0.9;
          FX.spawn(p.x, p.y - 40, '#52ff9d', 14, { speed: 260 });
          FX.addFlash(0.25, '#52ff9d');
          AudioSys.play('shield');
          continue;
        }
        p.dead = true; p.deaths++;
        FX.spawn(p.x, p.y - 40, '#ff3b5c', 22, { speed: 320 });
        FX.shake(9, 0.4); FX.addFlash(0.5, '#ff3b5c');
        AudioSys.play('death');
        return;
      } else if (near && !h._passed) {
        h._passed = true;
        Flow.add(1);
        FX.text(p.x, p.y - 96, 'NEAR!', '#35f0ff');
        AudioSys.play('near');
      }
    }

    // --- coins (with visor magnet) ---
    const coins = world.coins || [];
    const mag = 26 + (gear.visor || 0) * 55;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.got) continue;
      const d = dist2(p.x, p.y - 40, c.x, c.y);
      if (d < mag * mag) {
        c.got = true; p.coins += (c.val || 1);
        FX.spawn(c.x, c.y, '#ffd24d', 5, { speed: 130 });
        if (c.val && c.val > 1) { AudioSys.play('part'); FX.text(c.x, c.y - 26, '+' + c.val, '#ffd24d'); }
        else AudioSys.play('coin');
      }
    }

    // --- exit ---
    if (world.exit && aabb(b, world.exit)) world.done = true;

    // state & ghosts
    p.state = p.dead ? 'dead' : (p.dashT > 0 ? 'dash' : (p.wallT > 0 ? 'wall' : (p.flipT > 0 ? 'flip' :
      (p.vaultT > 0 ? 'vault' : (p.slideT > 0 ? 'slide' : (!p.onGround ? 'jump' : 'run'))))));
    if (p.dashT > 0) {
      p.ghosts.push({ x: p.x, y: p.y, state: p.state, phase: p.runPhase, flipT: p.flipT, slideT: p.slideT, life: 0.26 });
      if (p.ghosts.length > 14) p.ghosts.shift();
    }
    for (let i = p.ghosts.length - 1; i >= 0; i--) {
      p.ghosts[i].life -= dt;
      if (p.ghosts[i].life <= 0) p.ghosts.splice(i, 1);
    }
    if (p.y > 620) {
      p.dead = true; p.deaths++;
      FX.shake(8, 0.35); AudioSys.play('death');
    }
  },

  /* silhouette parkour pose */
  draw(ctx, p, camX, skin, alpha) {
    const x = p.x - camX, y = p.y;
    const a = alpha === undefined ? 1 : alpha;
    const col = (skin && skin.col) || '#eaf6ff';
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    if (p.state === 'flip' || p.flipT > 0) ctx.rotate((0.5 - p.flipT) * Math.PI * 4);
    if (p.state === 'dash') ctx.rotate(-0.18);
    const st = p.state;
    const ph = p.runPhase || 0;

    // trail glow
    if (a === 1 && (st === 'dash' || p.precT > 0)) {
      ctx.fillStyle = 'rgba(53,240,255,0.18)';
      ctx.fillRect(-90, -70, 80, 60);
    }

    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';

    if (st === 'slide' || p.slideT > 0) {
      // low horizontal pose
      ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(-16, -14); ctx.lineTo(18, -18); ctx.stroke();   // torso
      ctx.beginPath(); ctx.arc(24, -20, 9, 0, Math.PI * 2); ctx.fill();            // head
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(-10, -12); ctx.lineTo(-26, -2); ctx.stroke();    // back leg
      ctx.beginPath(); ctx.moveTo(2, -12); ctx.lineTo(16, -2); ctx.stroke();       // front leg
      ctx.beginPath(); ctx.moveTo(12, -16); ctx.lineTo(30, -10); ctx.stroke();     // arm
    } else if (st === 'jump' || (!p.onGround && st !== 'wall')) {
      ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(2, -18); ctx.stroke();       // torso
      ctx.beginPath(); ctx.arc(2, -58, 10, 0, Math.PI * 2); ctx.fill();            // head
      ctx.lineWidth = 9;
      const tuck = p.vy < 0 ? 1 : 0.4;
      ctx.beginPath(); ctx.moveTo(2, -20); ctx.lineTo(16 * tuck + 4, -6); ctx.lineTo(26 * tuck, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(-12 * tuck, -8); ctx.lineTo(-20 * tuck, -2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(16, -34 * tuck - 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(-14, -30 * tuck - 8); ctx.stroke();
    } else if (st === 'wall') {
      ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(-6, -48); ctx.lineTo(2, -18); ctx.stroke();
      ctx.beginPath(); ctx.arc(-4, -60, 10, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(2, -22); ctx.lineTo(12, -6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(14, -52); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, -30); ctx.lineTo(12, -22); ctx.stroke();
    } else if (st === 'vault') {
      ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(-4, -40); ctx.lineTo(8, -16); ctx.stroke();
      ctx.beginPath(); ctx.arc(2, -52, 10, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(6, -18); ctx.lineTo(22, -26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, -18); ctx.lineTo(-14, -6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, -38); ctx.lineTo(20, -30); ctx.stroke();
    } else {
      // run cycle
      const swing = Math.sin(ph) * 0.9;
      const swing2 = Math.sin(ph + Math.PI) * 0.9;
      ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(2, -20); ctx.stroke();       // torso
      ctx.beginPath(); ctx.arc(3, -60, 10, 0, Math.PI * 2); ctx.fill();            // head
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(2, -20); ctx.lineTo(2 + swing * 16, -2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, -20); ctx.lineTo(2 + swing2 * 16, -2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(swing2 * 14, -32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(swing * 14, -34); ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  },

  drawGhosts(ctx, p, camX, skin) {
    for (let i = 0; i < p.ghosts.length; i++) {
      const g = p.ghosts[i];
      const gp = { x: g.x, y: g.y, state: g.state, runPhase: g.phase, flipT: g.flipT, slideT: g.slideT, onGround: true, vy: 0, precT: 0 };
      this.draw(ctx, gp, camX, { col: (skin && skin.trail) || '#35f0ff' }, (g.life / 0.26) * 0.4);
    }
  }
};
