'use strict';
/* ============================================================
   NEON ESCAPE — core.js
   RNG, storage, input (keyboard + touch swipes), math helpers.
   ============================================================ */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const Store = {
  ns: 'nesc.',
  get(k, d) {
    try { const v = localStorage.getItem(this.ns + k); return v === null ? d : JSON.parse(v); }
    catch (e) { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(this.ns + k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  },
  del(k) { try { localStorage.removeItem(this.ns + k); } catch (e) {} }
};

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

const Input = {
  keys: Object.create(null),
  prev: Object.create(null),
  swipe: null,           // 'up' | 'down' | 'right' — consumed by game
  tapDashUntil: 0,
  _down: null,           // active pointer origin
  _tapT: Object.create(null),

  init(el) {
    if (this._bound) return;
    this._bound = true;
    const down = (e) => {
      const k = e.code || e.key;
      this.keys[k] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(k) >= 0 && e.preventDefault) e.preventDefault();
    };
    const up = (e) => { this.keys[e.code || e.key] = false; };
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);
    }
    if (el && el.addEventListener) {
      el.addEventListener('pointerdown', (e) => {
        this._down = { x: e.clientX, y: e.clientY, t: Date.now() };
        // double-tap right half = dash
        const key = 'p' + (e.pointerId || 0);
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const last = this._tapT[key] === undefined ? -1e9 : this._tapT[key];
        this._tapT[key] = now;
        if (now - last < 260) { this.tapDashUntil = now + 140; }
      });
      el.addEventListener('pointerup', (e) => {
        if (!this._down) return;
        const dx = e.clientX - this._down.x, dy = e.clientY - this._down.y;
        this._down = null;
        if (Math.abs(dy) >= Math.abs(dx) && Math.abs(dy) > 28) this.swipe = dy < 0 ? 'up' : 'down';
        else if (dx > 36) this.swipe = 'right';
      });
      el.addEventListener('pointercancel', () => { this._down = null; });
    }
  },

  down() { const a = arguments; for (let i = 0; i < a.length; i++) if (this.keys[a[i]]) return true; return false; },
  pressed() { const a = arguments; for (let i = 0; i < a.length; i++) if (this.keys[a[i]] && !this.prev[a[i]]) return true; return false; },
  endFrame() { this.prev = Object.assign(Object.create(null), this.keys); },
  consumeSwipe() { const s = this.swipe; this.swipe = null; return s; },
  dashHeld(now) {
    return this.down('ShiftLeft', 'ShiftRight', 'KeyD', 'ArrowRight') || this.tapDashUntil > now;
  }
};
