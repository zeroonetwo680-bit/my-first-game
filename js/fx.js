/* ============================================================
   NEON WRECKAGE — juice: particles, shake, decals, floating text
   ============================================================ */
'use strict';

const FX = {
  particles: new Pool(() => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
    size: 4, color: '#fff', kind: 'glow', drag: 2, spin: 0, rot: 0, grow: 0
  }), 700),

  texts: new Pool(() => ({
    active: false, x: 0, y: 0, vy: 0, life: 0, maxLife: 1, text: '', color: '#fff', size: 16
  }), 40),

  glowCache: {},
  groundLights: [],
  spawnScale: 1,
  shake: 0, shakeX: 0, shakeY: 0,
  flash: 0,

  /* ---------- pre-rendered glow sprite ---------- */
  makeGlow(color) {
    if (this.glowCache[color]) return this.glowCache[color];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.25, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.glowCache[color] = c;
    return c;
  },

  /** fractional particle-count scaling for adaptive quality */
  scaledCount(n) {
    const v = n * this.spawnScale;
    const f = Math.floor(v);
    return f + (Math.random() < v - f ? 1 : 0);
  },

  /* ---------- emitters ---------- */
  emit(props) {
    const p = this.particles.obtain();
    if (!p) return;
    p.active = true;
    p.x = props.x; p.y = props.y;
    p.vx = props.vx || 0; p.vy = props.vy || 0;
    p.life = p.maxLife = props.life || 0.5;
    p.size = props.size || 4;
    p.color = props.color || '#fff';
    p.kind = props.kind || 'glow';
    p.drag = props.drag !== undefined ? props.drag : 2;
    p.spin = props.spin || 0;
    p.rot = props.rot || 0;
    p.grow = props.grow || 0;
  },

  sparks(x, y, color, n, speed, spread, baseAngle) {
    n = this.scaledCount(n || 8);
    for (let i = 0; i < n; i++) {
      const a = baseAngle !== undefined ? baseAngle + rand(-spread || -1, spread || 1) : rand(TAU);
      const s = rand(speed * 0.4, speed);
      this.emit({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.15, 0.4), size: rand(1.5, 3), color,
        kind: 'spark', drag: 4
      });
    }
  },

  smoke(x, y, n, tint) {
    n = this.scaledCount(n || 1);
    for (let i = 0; i < n; i++) {
      this.emit({
        x: x + rand(-4, 4), y: y + rand(-4, 4),
        vx: rand(-30, 30), vy: rand(-30, 30),
        life: rand(0.5, 1.1), size: rand(5, 10),
        color: tint || '#5a6a7a', kind: 'smoke', drag: 1.2, grow: 14
      });
    }
  },

  glowBurst(x, y, color, n, speed) {
    n = this.scaledCount(n || 1);
    for (let i = 0; i < n; i++) {
      const a = rand(TAU);
      const s = rand(speed * 0.3, speed);
      this.emit({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.2, 0.55), size: rand(3, 7), color, kind: 'glow', drag: 3
      });
    }
  },

  ring(x, y, color, size, life) {
    this.emit({ x, y, life: life || 0.3, size: size || 30, color, kind: 'ring', grow: (size || 30) * 3.4 });
  },

  debris(x, y, color, n) {
    n = this.scaledCount(n || 1);
    for (let i = 0; i < n; i++) {
      const a = rand(TAU);
      const s = rand(60, 260);
      this.emit({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.4, 0.9), size: rand(2.5, 5), color,
        kind: 'debris', drag: 1.8, spin: rand(-12, 12)
      });
    }
  },

  explosion(x, y, color, scale, decal) {
    scale = scale || 1;
    this.groundLights.push({ x, y, life: 0.3, max: 0.3, size: 190 * scale, color });
    if (this.groundLights.length > 10) this.groundLights.shift();
    this.emit({ x, y, life: 0.14, size: 26 * scale, color: '#ffffff', kind: 'glow', grow: 240 * scale });
    this.ring(x, y, color, 24 * scale, 0.32);
    const sc = this.spawnScale;
    this.sparks(x, y, color, Math.round(16 * scale * sc), 420 * scale);
    this.sparks(x, y, '#ffd24d', Math.round(10 * scale * sc), 300 * scale);
    this.debris(x, y, color, Math.round(6 * scale * sc));
    this.smoke(x, y, Math.round(7 * scale * sc));
    this.glowBurst(x, y, color, Math.round(8 * scale * sc), 220 * scale);
    this.addShake(5 * scale);
    if (decal && Game.decals) Game.decals.scorch(x, y, 16 * scale);
  },

  muzzle(x, y, angle, color) {
    this.emit({ x, y, life: 0.06, size: 9, color: '#ffffff', kind: 'glow', grow: 60 });
    this.emit({ x, y, life: 0.05, size: 12, color: color || '#ffd24d', kind: 'glow', grow: 40 });
    for (let i = 0; i < 3; i++) {
      const a = angle + rand(-0.4, 0.4);
      const s = rand(150, 340);
      this.emit({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.1, size: 2, color: color || '#ffd24d', kind: 'spark', drag: 3 });
    }
  },

  text(x, y, str, color, size) {
    const t = this.texts.obtain();
    if (!t) return;
    t.active = true;
    t.x = x + rand(-8, 8); t.y = y - 14;
    t.vy = -55;
    t.life = t.maxLife = 0.95;
    t.text = str;
    t.color = color || '#fff';
    t.size = size || 15;
  },

  addShake(mag) {
    this.shake = Math.min(this.shake + mag, 26);
  },

  addFlash(a) {
    this.flash = Math.min(this.flash + a, 1);
  },

  /* ---------- per-frame update ---------- */
  update(dt) {
    // shake
    if (this.shake > 0.05) {
      this.shake *= Math.max(0, 1 - 7 * dt);
      const m = this.shake;
      this.shakeX = rand(-m, m);
      this.shakeY = rand(-m, m);
    } else {
      this.shake = 0; this.shakeX = 0; this.shakeY = 0;
    }

    // particles
    const items = this.particles.items;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.grow) p.size += p.grow * dt;
    }

    // floating texts
    const tx = this.texts.items;
    for (let i = 0; i < tx.length; i++) {
      const t = tx[i];
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) { t.active = false; continue; }
      t.y += t.vy * dt;
      t.vy *= Math.max(0, 1 - 2.5 * dt);
    }

    // ground lights
    const gl = this.groundLights;
    for (let i = gl.length - 1; i >= 0; i--) {
      gl[i].life -= dt;
      if (gl[i].life <= 0) gl.splice(i, 1);
    }
  },

  clear() {
    this.particles.deactivateAll();
    this.texts.deactivateAll();
    this.groundLights.length = 0;
    this.shake = 0; this.shakeX = 0; this.shakeY = 0; this.flash = 0;
  },

  /** big soft light on the floor under explosions (drawn additively, under cars) */
  drawGroundLights(ctx) {
    const gl = this.groundLights;
    for (let i = 0; i < gl.length; i++) {
      const g = gl[i];
      const spr = this.makeGlow(g.color);
      const sz = g.size * 2;
      ctx.globalAlpha = clamp(g.life / g.max, 0, 1) * 0.42;
      ctx.drawImage(spr, g.x - sz / 2, g.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  },

  /* ---------- rendering (world transform must be applied) ---------- */
  drawParticles(ctx, additive) {
    const items = this.particles.items;
    // normal composite pass: smoke + debris
    if (!additive) {
      for (let i = 0; i < items.length; i++) {
        const p = items[i];
        if (!p.active || (p.kind !== 'smoke' && p.kind !== 'debris')) continue;
        const a = clamp(p.life / p.maxLife, 0, 1);
        if (p.kind === 'smoke') {
          ctx.globalAlpha = a * 0.28;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
        } else {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    } else {
      for (let i = 0; i < items.length; i++) {
        const p = items[i];
        if (!p.active || (p.kind !== 'glow' && p.kind !== 'spark' && p.kind !== 'ring')) continue;
        const a = clamp(p.life / p.maxLife, 0, 1);
        if (p.kind === 'glow') {
          const spr = this.makeGlow(p.color);
          ctx.globalAlpha = a * 0.9;
          const s = p.size * 2.4;
          ctx.drawImage(spr, p.x - s / 2, p.y - s / 2, s, s);
        } else if (p.kind === 'spark') {
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * 0.8;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
          ctx.stroke();
        } else { // ring
          ctx.globalAlpha = a * 0.8;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2 + 3 * a;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
  },

  drawTexts(ctx) {
    const tx = this.texts.items;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < tx.length; i++) {
      const t = tx[i];
      if (!t.active) continue;
      const a = clamp(t.life / t.maxLife, 0, 1);
      const pop = a > 0.85 ? 1 + (1 - a) * 4 : 1;
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.font = `900 ${Math.round(t.size * pop)}px Rajdhani, sans-serif`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
};

/* ============================================================
   Persistent decals (skid marks, scorch) — half-res offscreen
   ============================================================ */
function makeDecalCanvas(worldW, worldH) {
  const scale = 0.5;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(worldW * scale);
  canvas.height = Math.ceil(worldH * scale);
  const g = canvas.getContext('2d');
  let frame = 0;

  return {
    canvas, scale,
    clear() { g.clearRect(0, 0, canvas.width, canvas.height); },
    skid(x, y, angle, alpha) {
      frame++;
      g.save();
      g.translate(x * scale, y * scale);
      g.rotate(angle);
      g.fillStyle = `rgba(10, 12, 18, ${alpha})`;
      g.fillRect(-2, -2.4, 4, 4.8);
      g.restore();
    },
    scorch(x, y, r) {
      const grad = g.createRadialGradient(x * scale, y * scale, 0, x * scale, y * scale, r * scale);
      grad.addColorStop(0, 'rgba(5, 6, 10, 0.75)');
      grad.addColorStop(0.7, 'rgba(10, 10, 16, 0.35)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x * scale, y * scale, r * scale, 0, TAU);
      g.fill();
    }
  };
}
