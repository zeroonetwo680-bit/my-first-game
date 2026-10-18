/* ============================================================
   BLOCK NOVA — procedural audio (WebAudio, no assets)
   ============================================================ */
'use strict';

const AudioSys = {
  ctx: null,
  master: null,
  sfx: null,
  muted: store.get('bn.muted', false),

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
    store.set('bn.muted', m);
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

  grab() { this._tone('triangle', 320, 480, 0.06, 0.1); },

  place() {
    this._tone('sine', 210, 130, 0.09, 0.28);
    this._noise(0.045, 'lowpass', 1800, 500, 0.14);
  },

  invalid() { this._tone('square', 130, 90, 0.14, 0.12); },

  rotate() { this._tone('triangle', 520, 760, 0.07, 0.14); },

  clear(lines, streak) {
    // rising sweep + chord that climbs with combo
    const base = 300 + Math.min(streak, 8) * 55;
    this._noise(0.22, 'bandpass', 900 + lines * 400, 3400, 0.2);
    for (let i = 0; i < lines + 1; i++) {
      this._tone('triangle', base * Math.pow(1.25, i), base * Math.pow(1.25, i) * 1.5, 0.16, 0.13, i * 0.045);
    }
  },

  bomb() {
    this._noise(0.5, 'lowpass', 2600, 90, 0.5);
    this._tone('sine', 130, 30, 0.4, 0.4);
  },

  hammer() {
    this._noise(0.12, 'lowpass', 2200, 300, 0.34);
    this._tone('square', 170, 70, 0.1, 0.16);
  },

  powerGain() {
    this._tone('sine', 620, 930, 0.1, 0.14);
    this._tone('sine', 930, 1240, 0.14, 0.12, 0.09);
  },

  allClear() {
    const notes = [523, 659, 784, 1047];
    for (let i = 0; i < notes.length; i++) this._tone('triangle', notes[i], notes[i], 0.22, 0.16, i * 0.09);
    this._noise(0.6, 'bandpass', 1200, 5200, 0.18);
  },

  ui() { this._tone('square', 480, 640, 0.06, 0.08); },

  gameOver() {
    this._tone('sawtooth', 330, 165, 0.5, 0.16);
    this._tone('sawtooth', 220, 82, 0.8, 0.16, 0.25);
  },

  newBest() {
    const notes = [523, 659, 784, 1047, 1319];
    for (let i = 0; i < notes.length; i++) this._tone('triangle', notes[i], notes[i], 0.2, 0.15, i * 0.1);
  }
};
