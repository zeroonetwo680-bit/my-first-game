/* ============================================================
   NEON WRECKAGE — core helpers
   ============================================================ */
'use strict';

const TAU = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const sign = (v) => (v < 0 ? -1 : 1);

/** shortest signed angle from a to b, in [-PI, PI] */
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** safe localStorage wrapper */
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

/** fixed-size object pool */
class Pool {
  constructor(factory, size) {
    this.factory = factory;
    this.items = [];
    for (let i = 0; i < size; i++) this.items.push(factory());
  }
  obtain() {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      if (!items[i].active) return items[i];
    }
    if (items.length < 1600) {
      const it = this.factory();
      this.items.push(it);
      return it;
    }
    return null;
  }
  deactivateAll() {
    for (let i = 0; i < this.items.length; i++) this.items[i].active = false;
  }
}

const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || false;
