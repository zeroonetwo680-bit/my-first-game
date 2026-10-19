/* ============================================================
   NEON FIST — core helpers
   ============================================================ */
'use strict';

const TAU = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }
};

const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || false;

function fmtNum(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** fixed-size object pool — zero GC churn for particles etc. */
class Pool {
  constructor(factory, size) {
    this.items = new Array(size);
    for (let i = 0; i < size; i++) this.items[i] = factory();
    this._scan = 0;
  }
  obtain() {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const i = (this._scan + k) % n;
      if (!this.items[i].active) { this._scan = (i + 1) % n; return this.items[i]; }
    }
    return null; // pool exhausted: silently drop
  }
  deactivateAll() {
    for (const it of this.items) it.active = false;
  }
}
