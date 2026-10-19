/* ============================================================
   NEON FIST — procedural audio
   ============================================================ */
'use strict';

const AudioSys = {
  ctx: null,
  master: null,
  sfx: null,
  muted: store.get('nff.muted', false),

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 5;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  setMuted(m) {
    this.muted = m;
    store.set('nff.muted', m);
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.03);
  },

  _tone(type, f0, f1, dur, gain, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.03);
  },

  _noise(dur, type, f0, f1, gain, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.ceil(this.ctx.sampleRate * (dur + 0.05));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.sfx);
    src.start(t); src.stop(t + dur + 0.03);
  },

  whoosh() { this._noise(0.12, 'bandpass', 700, 2400, 0.12); },
  grab() { this._tone('triangle', 300, 420, 0.05, 0.08); },

  punchHit() {
    this._noise(0.09, 'lowpass', 2000, 300, 0.34);
    this._tone('sine', 180, 70, 0.08, 0.26);
  },

  kickHit() {
    this._noise(0.14, 'lowpass', 1700, 200, 0.44);
    this._tone('sine', 150, 50, 0.12, 0.34);
  },

  block() {
    this._noise(0.07, 'highpass', 2600, 1800, 0.2);
    this._tone('square', 320, 260, 0.06, 0.1);
  },

  dash() { this._noise(0.16, 'bandpass', 500, 1800, 0.14); },

  parry() {
    this._tone('square', 700, 1500, 0.09, 0.22);
    this._tone('triangle', 1800, 2400, 0.12, 0.14);
  },

  novaCharge() {
    this._tone('sawtooth', 90, 440, 0.5, 0.2);
    this._noise(0.5, 'bandpass', 300, 2600, 0.14);
  },

  novaHit() {
    this._noise(0.5, 'lowpass', 2800, 80, 0.6);
    this._tone('sine', 120, 26, 0.5, 0.5);
    this._tone('sawtooth', 220, 40, 0.4, 0.25);
  },

  ko() {
    this._noise(0.7, 'lowpass', 2400, 60, 0.6);
    this._tone('sine', 100, 24, 0.8, 0.5);
    this._tone('sawtooth', 180, 30, 0.6, 0.2, 0.1);
  },

  gong() {
    this._tone('triangle', 520, 518, 0.7, 0.22);
    this._tone('triangle', 780, 776, 0.6, 0.12, 0.02);
    this._noise(0.3, 'bandpass', 900, 500, 0.08);
  },

  ui() { this._tone('square', 480, 640, 0.06, 0.08); },

  win() {
    const notes = [523, 659, 784, 1047];
    for (let i = 0; i < notes.length; i++) this._tone('triangle', notes[i], notes[i], 0.2, 0.15, i * 0.1);
  },

  lose() {
    this._tone('sawtooth', 330, 165, 0.5, 0.14);
    this._tone('sawtooth', 220, 82, 0.8, 0.14, 0.25);
  },

  select() { this._tone('triangle', 620, 880, 0.08, 0.12); }
};
