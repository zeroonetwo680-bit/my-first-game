'use strict';
/* ============================================================
   NEON ESCAPE — fx.js
   Particles, floating texts, screen shake, flash, speed lines.
   ============================================================ */

const FX = {
  parts: [], texts: [], shakeT: 0, shakeM: 0, flash: 0, flashCol: '#ffffff',

  clear() { this.parts.length = 0; this.texts.length = 0; this.shakeT = 0; this.flash = 0; },

  spawn(x, y, col, n, opts) {
    n = n || 8;
    opts = opts || {};
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 240) this.parts.shift();
      const a = opts.dir !== undefined ? opts.dir + (Math.random() - 0.5) * (opts.spread || 1.6) : Math.random() * Math.PI * 2;
      const sp = (opts.speed || 180) * (0.4 + Math.random() * 0.9);
      this.parts.push({
        x: x, y: y, vx: Math.cos(a) * sp + (opts.vx || 0), vy: Math.sin(a) * sp + (opts.vy || 0),
        life: opts.life || (0.35 + Math.random() * 0.35), max: opts.life || 0.6,
        col: col, size: opts.size || (2 + Math.random() * 3), g: opts.g !== undefined ? opts.g : 520
      });
    }
  },

  text(x, y, str, col, big) {
    this.texts.push({ x: x, y: y, str: str, col: col || '#ffffff', life: big ? 1.1 : 0.85, max: big ? 1.1 : 0.85, big: !!big, vy: -46 });
  },

  shake(m, t) { this.shakeM = Math.max(this.shakeM, m); this.shakeT = Math.max(this.shakeT, t || 0.25); },
  addFlash(a, col) { this.flash = Math.max(this.flash, a); if (col) this.flashCol = col; },

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) { this.texts.splice(i, 1); continue; }
      t.y += t.vy * dt; t.vy *= (1 - 1.8 * dt);
    }
    if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeM = 0; }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.4);
  },

  draw(ctx, camX) {
    const ox = camX || 0;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - ox - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      const k = t.life / t.max;
      ctx.globalAlpha = Math.min(1, k * 1.8);
      ctx.font = (t.big ? 'bold 30px' : 'bold 18px') + ' Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(t.str, t.x - ox + 2, t.y + 2);
      ctx.fillStyle = t.col;
      ctx.fillText(t.str, t.x - ox, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
};
