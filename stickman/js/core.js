/* STICKMAN — shared constants, math, storage and input.
 *
 * Everything here is deliberately free of DOM assumptions beyond the few
 * guards, so the headless test harness can load the real files instead of a
 * copy of the logic.
 */
'use strict';

var W = 1280;               // logical playfield width
var H = 720;                // logical playfield height
var TAU = Math.PI * 2;

/* ---------------------------------------------------------------- math --- */
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist2(ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}
function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

/* Shortest signed difference between two angles. */
function angleDelta(a, b) {
  var d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/* Deterministic hash in [-1, 1]; used for the hand-drawn wobble so a stroke
 * does not shimmer every frame. */
function hash1(n) {
  var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/* Seeded RNG (mulberry32). Keeps a run reproducible for the tests. */
function makeRng(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------- storage --- */
var Store = {
  key: 'stickman.',
  get: function (k, dflt) {
    try {
      var raw = localStorage.getItem(this.key + k);
      if (raw === null || raw === undefined) return dflt;
      return JSON.parse(raw);
    } catch (e) { return dflt; }
  },
  set: function (k, v) {
    try { localStorage.setItem(this.key + k, JSON.stringify(v)); } catch (e) {}
    return v;
  }
};

/* ---------------------------------------------------------------- input --- */
var Input = {
  keys: Object.create(null),
  mouse: { x: W / 2, y: H / 2, down: false },
  /* touch: left half drags a virtual stick, right half aims and fires */
  touch: { active: false, moveId: -1, aimId: -1, mx: 0, my: 0, ax: 0, ay: 0, dx: 0, dy: 0 },
  pressed: Object.create(null),   // edge-triggered, cleared each frame
  anyPressed: false,

  down: function (code) { return !!this.keys[code]; },
  hit: function (code) { return !!this.pressed[code]; },

  moveVector: function () {
    var x = 0, y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    if (this.touch.active && (this.touch.dx || this.touch.dy)) {
      x += this.touch.dx; y += this.touch.dy;
    }
    var len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x: x, y: y };
  },

  endFrame: function () {
    this.pressed = Object.create(null);
    this.anyPressed = false;
  }
};
