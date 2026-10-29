/* ============================================================
   NEON WRECKAGE — input: keyboard, mouse aim, touch joystick
   ============================================================ */
'use strict';

const Input = {
  keys: Object.create(null),
  pressed: Object.create(null),

  // mouse
  mouse: { x: 0, y: 0, down: false, lastMove: -99 },

  // touch joystick
  stick: { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 },
  /* touch aim pad (right half of the screen). angle is the absolute direction
     the player is aiming in; moved stays false until the drag leaves the
     deadzone so a stray tap does not yank the turret around. */
  aim: { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0, angle: 0, mag: 0, moved: false },
  touch: { fire: false, boost: false, rocketPressed: false },
  swapPressed: false,
  padState: null,
  padPrev: Object.create(null),
  padRocket: false,
  padSwap: false,
  padPause: false,
  touchUsed: false,

  el: {},

  init(canvas) {
    this.canvas = canvas;
    this.el.stickZone = document.getElementById('stick-zone');
    this.el.stick = document.getElementById('stick');
    this.el.knob = document.getElementById('stick-knob');
    this.el.aimStick = document.getElementById('aim-stick');
    this.el.aimKnob = document.getElementById('aim-knob');
    this.el.aimHint = document.getElementById('aim-hint');

    /* ---------------- keyboard ---------------- */
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const code = e.code;
      if (!this.keys[code]) this.pressed[code] = true;
      this.keys[code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); this.mouse.down = false; });

    /* ---------------- mouse (desktop aim) ---------------- */
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        const r = canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - r.left;
        this.mouse.y = e.clientY - r.top;
        this.mouse.lastMove = performance.now() / 1000;
      }
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        if (e.button === 0) this.mouse.down = true;
        if (e.button === 2) this.swapPressed = true;
        const r = canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - r.left;
        this.mouse.y = e.clientY - r.top;
        this.mouse.lastMove = performance.now() / 1000;
      } else if (e.pointerType === 'touch') {
        this.touchUsed = true;
      }
    });
    window.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    /* ---------------- touch joystick (left zone) ---------------- */
    const zone = this.el.stickZone;
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      if (this.stick.active) return;
      this.stick.active = true;
      this.stick.id = e.pointerId;
      this.stick.ox = e.clientX;
      this.stick.oy = e.clientY;
      this.stick.dx = 0; this.stick.dy = 0;
      this.el.stick.style.left = e.clientX + 'px';
      this.el.stick.style.top = e.clientY + 'px';
      this.el.stick.classList.remove('hidden');
      this.updateKnob(0, 0);
      zone.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (!this.stick.active || e.pointerId !== this.stick.id) return;
      const R = 58;
      let dx = e.clientX - this.stick.ox;
      let dy = e.clientY - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      this.stick.dx = dx / R;
      this.stick.dy = dy / R;
      this.updateKnob(dx, dy);
      e.preventDefault();
    });
    const endStick = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.active = false;
      this.stick.id = -1;
      this.stick.dx = 0; this.stick.dy = 0;
      this.el.stick.classList.add('hidden');
    };
    zone.addEventListener('pointerup', endStick);
    zone.addEventListener('pointercancel', endStick);

    /* ---------------- touch aim pad (right zone) ---------------- */
    const aimZone = document.getElementById('aim-zone');
    if (aimZone) {
      const AIM_R = 70, AIM_DEAD = 9;
      aimZone.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
        this.touchUsed = true;
        if (this.aim.active) return;
        this.aim.active = true;
        this.aim.id = e.pointerId;
        this.aim.ox = e.clientX;
        this.aim.oy = e.clientY;
        this.aim.dx = 0; this.aim.dy = 0; this.aim.mag = 0; this.aim.moved = false;
        if (this.el.aimStick) {
          this.el.aimStick.style.left = e.clientX + 'px';
          this.el.aimStick.style.top = e.clientY + 'px';
          this.el.aimStick.classList.remove('hidden');
        }
        if (this.el.aimKnob) this.el.aimKnob.style.transform = '';
        if (this.el.aimHint) this.el.aimHint.classList.add('hidden');
        e.preventDefault();
      });
      aimZone.addEventListener('pointermove', (e) => {
        if (!this.aim.active || e.pointerId !== this.aim.id) return;
        let dx = e.clientX - this.aim.ox;
        let dy = e.clientY - this.aim.oy;
        const m = Math.hypot(dx, dy);
        if (m > AIM_R) { dx = dx / m * AIM_R; dy = dy / m * AIM_R; }
        this.aim.dx = dx / AIM_R;
        this.aim.dy = dy / AIM_R;
        this.aim.mag = m;
        if (m > AIM_DEAD) {
          this.aim.angle = Math.atan2(dy, dx);
          this.aim.moved = true;
        }
        if (this.el.aimKnob) this.el.aimKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        e.preventDefault();
      });
      const endAim = (e) => {
        if (e.pointerId !== this.aim.id) return;
        this.aim.active = false;
        this.aim.id = -1;
        this.aim.dx = 0; this.aim.dy = 0; this.aim.mag = 0; this.aim.moved = false;
        if (this.el.aimStick) this.el.aimStick.classList.add('hidden');
        if (this.el.aimKnob) this.el.aimKnob.style.transform = '';
        if (this.el.aimHint) this.el.aimHint.classList.remove('hidden');
      };
      aimZone.addEventListener('pointerup', endAim);
      aimZone.addEventListener('pointercancel', endAim);
      aimZone.addEventListener('pointerleave', endAim);
    }

    /* ---------------- touch action buttons ---------------- */
    this.bindBtn('btn-fire', 'fire');
    this.bindBtn('btn-boost', 'boost');
    const rk = document.getElementById('btn-rocket');
    if (rk) {
      rk.addEventListener('pointerdown', (e) => {
        this.touch.rocketPressed = true;
        rk.classList.add('pressed');
        e.preventDefault();
      });
      const upRk = () => rk.classList.remove('pressed');
      rk.addEventListener('pointerup', upRk);
      rk.addEventListener('pointercancel', upRk);
    }
    const sw = document.getElementById('btn-swap');
    if (sw) {
      sw.addEventListener('pointerdown', (e) => {
        this.swapPressed = true;
        sw.classList.add('pressed');
        e.preventDefault();
      });
      const upSw = () => sw.classList.remove('pressed');
      sw.addEventListener('pointerup', upSw);
      sw.addEventListener('pointercancel', upSw);
    }
  },

  bindBtn(id, prop) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      this.touch[prop] = true;
      el.classList.add('pressed');
      e.preventDefault();
    });
    const up = () => { this.touch[prop] = false; el.classList.remove('pressed'); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  },

  /** poll the first connected gamepad (standard mapping) */
  pollPad() {
    let gp = null;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const g of pads) if (g && g.connected) { gp = g; break; }
    } catch (e) { gp = null; }
    if (!gp) { this.padState = null; this.padRocket = false; this.padSwap = false; this.padPause = false; return; }
    const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
    const ax = [dz(gp.axes[0] || 0), dz(gp.axes[1] || 0), dz(gp.axes[2] || 0), dz(gp.axes[3] || 0)];
    const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4));
    const edge = (i) => {
      const nowP = btn(i), was = !!this.padPrev[i];
      this.padPrev[i] = nowP;
      return nowP && !was;
    };
    this.padRocket = edge(5) || edge(2);   // RB or X fires a rocket
    this.padSwap = edge(3);                // Y swaps weapon
    this.padPause = edge(9);               // Start pauses
    this.padState = {
      ax,
      fire: btn(0) || btn(7),              // A or RT
      boost: btn(4) || btn(6) || btn(1),   // LB, LT or B
      aimX: Math.abs(ax[2]) > 0.3 ? ax[2] : 0,
      aimY: Math.abs(ax[3]) > 0.3 ? ax[3] : 0
    };
  },

  consumePadPause() {
    if (this.padPause) { this.padPause = false; return true; }
    return false;
  },

  updateKnob(dx, dy) {
    this.el.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  },

  /** steering: -1..1 ; throttle: -1..1 */
  getDrive() {
    let steer = 0, throttle = 0;
    const k = this.keys;
    if (k['KeyA'] || k['ArrowLeft']) steer -= 1;
    if (k['KeyD'] || k['ArrowRight']) steer += 1;
    if (k['KeyW'] || k['ArrowUp']) throttle += 1;
    if (k['KeyS'] || k['ArrowDown']) throttle -= 1;
    if (this.padState && (Math.abs(this.padState.ax[0]) + Math.abs(this.padState.ax[1])) > 0.22) {
      return { stick: { x: this.padState.ax[0], y: this.padState.ax[1] } };
    }
    if (this.stick.active) {
      const mag = Math.hypot(this.stick.dx, this.stick.dy);
      if (mag > 0.22) {
        // joystick direction maps to steering + throttle relative to car heading (set by game)
        return { stick: { x: this.stick.dx, y: this.stick.dy } };
      }
      return { steer: 0, throttle: 0 };
    }
    return { steer, throttle };
  },

  getFire() {
    return !!this.keys['Space'] || !!this.keys['KeyJ'] || this.mouse.down || this.touch.fire ||
      !!(this.padState && this.padState.fire);
  },

  getBoost() {
    return !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight'] || !!this.keys['KeyK'] || this.touch.boost ||
      !!(this.padState && this.padState.boost);
  },

  consumeRocket() {
    if (this.keys['KeyE'] || this.keys['KeyR'] || this.touch.rocketPressed || this.padRocket) {
      this.keys['KeyE'] = false; this.keys['KeyR'] = false;
      this.touch.rocketPressed = false;
      this.padRocket = false;
      return true;
    }
    return false;
  },

  consumeSwap() {
    if (this.swapPressed || this.padSwap) {
      this.swapPressed = false;
      this.padSwap = false;
      return true;
    }
    return false;
  },

  consumePressed(code) {
    if (this.pressed[code]) { this.pressed[code] = false; return true; }
    return false;
  },

  endFrame() {
    this.pressed = Object.create(null);
    this.touch.rocketPressed = false;
    this.swapPressed = false;
  },

  /** right-stick aim override, null when idle */
  resetAim() {
    this.aim.active = false;
    this.aim.id = -1;
    this.aim.dx = 0; this.aim.dy = 0; this.aim.mag = 0; this.aim.moved = false;
    if (this.el.aimStick) this.el.aimStick.classList.add('hidden');
    if (this.el.aimKnob) this.el.aimKnob.style.transform = '';
  },

  /* ---- touch aim ---- */
  aimAiming() {
    return !!(this.aim.active && this.aim.moved);
  },

  /* absolute aim direction in radians, or null when the pad is not in use */
  aimAngle() {
    return this.aimAiming() ? this.aim.angle : null;
  },

  /* holding the aim pad fires too: two thumbs cannot also reach FIRE */
  aimFiring() {
    return this.aimAiming();
  },

  padAim() {
    if (this.padState && (this.padState.aimX || this.padState.aimY)) {
      return Math.atan2(this.padState.aimY, this.padState.aimX);
    }
    return null;
  },

  /** should turret follow the mouse? (desktop: mouse moved in last 3s) */
  mouseAiming() {
    if (this.touchUsed && !matchMedia('(hover: hover)').matches) return false;
    return performance.now() / 1000 - this.mouse.lastMove < 3;
  },

  showTouchUI(show) {
    document.getElementById('touch-ui').classList.toggle('hidden', !show);
    if (!show) this.resetAim();
  }
};
