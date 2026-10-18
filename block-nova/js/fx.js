/* ============================================================
   BLOCK NOVA — juice: particles, shake, floating text
   ============================================================ */
'use strict';

const FX = {
  particles: new Pool(() => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
    size: 4, color: '#fff', kind: 'glow', drag: 2, spin: 0, rot: 0, grow: 0
  }), 600),

  texts: new Pool(() => ({
    active: false, x: 0, y: 0, vy: 0, life: 0, maxLife: 1, text: '', color: '#fff', size: 16
  }), 40),

  glowCache: {},
  shake: 0, shakeX: 0, shakeY: 0,

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

  sparks(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU);
      const s = rand(speed * 0.4, speed);
      this.emit({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.2, 0.5), size: rand(1.5, 3), color,
        kind: 'spark', drag: 3.5
      });
    }
  },

  glowBurst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU);
      const s = rand(speed * 0.3, speed);
      this.emit({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.2, 0.6), size: rand(3, 8), color, kind: 'glow', drag: 3 });
    }
  },

  confetti(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU);
      const s = rand(120, 420);
      this.emit({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 160,
        life: rand(0.5, 1.1), size: rand(3, 6), color,
        kind: 'debris', drag: 1.6, spin: rand(-14, 14), vy2: 320
      });
    }
  },

  ring(x, y, color, size, life) {
    this.emit({ x, y, life: life || 0.3, size: size || 30, color, kind: 'ring', grow: (size || 30) * 3 });
  },

  cellPop(cx, cy, size, color) {
    // small square burst when a block cell is cleared
    this.glowBurst(cx, cy, color, 3, 240);
    this.sparks(cx, cy, '#ffffff', 2, 190);
    this.emit({ x: cx, y: cy, life: 0.22, size: size * 0.4, color, kind: 'ring', grow: size * 2.4 });
  },

  text(x, y, str, color, size) {
    const t = this.texts.obtain();
    if (!t) return;
    t.active = true;
    t.x = x; t.y = y;
    t.vy = -64;
    t.life = t.maxLife = 0.95;
    t.text = str;
    t.color = color || '#fff';
    t.size = size || 15;
  },

  addShake(mag) {
    this.shake = Math.min(this.shake + mag, 22);
  },

  update(dt) {
    if (this.shake > 0.05) {
      this.shake *= Math.max(0, 1 - 7 * dt);
      this.shakeX = rand(-this.shake, this.shake);
      this.shakeY = rand(-this.shake, this.shake);
    } else {
      this.shake = 0; this.shakeX = 0; this.shakeY = 0;
    }

    const items = this.particles.items;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      if (p.kind === 'debris') p.vy += 340 * dt; // gravity for confetti
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.grow) p.size += p.grow * dt;
    }

    const tx = this.texts.items;
    for (let i = 0; i < tx.length; i++) {
      const t = tx[i];
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) { t.active = false; continue; }
      t.y += t.vy * dt;
      t.vy *= Math.max(0, 1 - 2.2 * dt);
    }
  },

  clear() {
    this.particles.deactivateAll();
    this.texts.deactivateAll();
    this.shake = 0; this.shakeX = 0; this.shakeY = 0;
  },

  /** additive pass — glow, sparks, rings, confetti */
  drawAdditive(ctx) {
    const items = this.particles.items;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (!p.active) continue;
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
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.stroke();
      } else if (p.kind === 'ring') {
        ctx.globalAlpha = a * 0.8;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 + 3 * a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
      } else { // debris / confetti
        ctx.globalAlpha = a;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  },

  drawTexts(ctx) {
    const tx = this.texts.items;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < tx.length; i++) {
      const t = tx[i];
      if (!t.active) continue;
      const a = clamp(t.life / t.maxLife, 0, 1);
      const pop = a > 0.85 ? 1 + (1 - a) * 3 : 1;
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.font = `900 ${Math.round(t.size * pop)}px Rajdhani, sans-serif`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
};
