'use strict';
/* ============================================================
   NEON ESCAPE — audio.js
   WebAudio synth: SFX + a driving synth loop. No assets needed.
   ============================================================ */

const AudioSys = {
  ctx: null, master: null, musicGain: null, muted: false, _step: 0, _timer: null,

  init() {
    if (this.ctx) return;
    const AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);
    this.muted = !!Store.get('muted', false);
    this.master.gain.value = this.muted ? 0 : 0.85;
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  toggleMute() {
    this.muted = !this.muted;
    Store.set('muted', this.muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.85;
    return this.muted;
  },

  _tone(freq, dur, type, vol, slideTo, when) {
    if (!this.ctx || this.muted) return;
    const t0 = when || this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.18, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },
  _noise(dur, vol, hp) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, (this.ctx.sampleRate * dur) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    const f = this.ctx.createBiquadFilter(); f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = hp || 900;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  },

  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'jump': this._tone(300, 0.14, 'square', 0.16, 520); break;
      case 'djump': this._tone(420, 0.14, 'square', 0.15, 700); break;
      case 'land': this._noise(0.06, 0.1); break;
      case 'slide': this._noise(0.22, 0.12); break;
      case 'dash': this._tone(160, 0.2, 'sawtooth', 0.13, 60); this._noise(0.18, 0.08, 2200); break;
      case 'coin': this._tone(880, 0.07, 'triangle', 0.14); this._tone(1320, 0.09, 'triangle', 0.12, 1320, this.ctx.currentTime + 0.05); break;
      case 'part': this._tone(660, 0.1, 'triangle', 0.15, 990); this._tone(990, 0.14, 'triangle', 0.13, 1480, this.ctx.currentTime + 0.08); break;
      case 'trick': this._tone(520, 0.1, 'square', 0.12, 780); this._tone(780, 0.12, 'square', 0.1, 1040, this.ctx.currentTime + 0.07); break;
      case 'near': this._tone(1200, 0.05, 'sine', 0.1, 1800); break;
      case 'stumble': this._tone(180, 0.16, 'square', 0.16, 80); this._noise(0.12, 0.1); break;
      case 'shield': this._tone(440, 0.12, 'sine', 0.18, 220); this._noise(0.1, 0.08, 3000); break;
      case 'hit': this._tone(120, 0.3, 'sawtooth', 0.2, 40); this._noise(0.25, 0.16); break;
      case 'death': this._tone(220, 0.5, 'sawtooth', 0.2, 45); this._noise(0.4, 0.14); break;
      case 'ui': this._tone(620, 0.05, 'square', 0.1); break;
      case 'buy': this._tone(520, 0.08, 'triangle', 0.14, 780); this._tone(780, 0.12, 'triangle', 0.13, 1040, this.ctx.currentTime + 0.08); break;
      case 'win': {
        const n = [523, 659, 784, 1046];
        for (let i = 0; i < n.length; i++) this._tone(n[i], 0.22, 'triangle', 0.16, n[i], this.ctx.currentTime + i * 0.12);
        break;
      }
      case 'laser': this._tone(1400, 0.05, 'sine', 0.05, 900); break;
    }
  },

  /* simple 16-step synth loop */
  startMusic() {
    if (!this.ctx || this._timer) return;
    const bass = [55, 55, 82.4, 55, 55, 98, 82.4, 55, 55, 55, 82.4, 55, 110, 98, 82.4, 73.4];
    const self = this;
    this._timer = setInterval(function () {
      if (self.muted || !self.ctx) return;
      const t = self.ctx.currentTime, s = self._step++ % 16;
      // kick
      if (s % 4 === 0) {
        const o = self.ctx.createOscillator(), g = self.ctx.createGain();
        o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        o.connect(g); g.connect(self.musicGain); o.start(t); o.stop(t + 0.16);
      }
      // hat
      if (s % 2 === 1) {
        const len = 0.03, buf = self.ctx.createBuffer(1, 600, self.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < 600; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / 600);
        const src = self.ctx.createBufferSource(); src.buffer = buf;
        const g = self.ctx.createGain(); g.gain.value = 0.06;
        const f = self.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
        src.connect(f); f.connect(g); g.connect(self.musicGain); src.start(t);
      }
      // bass
      const o = self.ctx.createOscillator(), g = self.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = bass[s];
      g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g); g.connect(self.musicGain); o.start(t); o.stop(t + 0.18);
    }, 125);
  },
  stopMusic() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }
};
