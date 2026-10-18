/* ============================================================
   NEON WRECKAGE — procedural audio (WebAudio, no assets)
   ============================================================ */
'use strict';

const AudioSys = {
  ctx: null,
  master: null,
  sfx: null,
  music: null,
  muted: store.get('nw.muted', false),

  // engine
  engOsc1: null, engOsc2: null, engFilter: null, engGain: null,
  // skid
  skidGain: null,

  // music sequencer
  musicOn: false,
  musicStep: 0,
  nextNoteTime: 0,
  musicTimer: 0,
  noiseBuf: null,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);

    this.music = this.ctx.createGain();
    this.music.gain.value = 0.3;
    this.music.connect(this.master);

    // white noise buffer (1s)
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.startEngineLoops();
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  setMuted(m) {
    this.muted = m;
    store.set('nw.muted', m);
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03);
  },

  /* ---------------- continuous loops ---------------- */
  startEngineLoops() {
    const t = this.ctx.currentTime;

    this.engFilter = this.ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 400;
    this.engFilter.Q.value = 2;

    this.engGain = this.ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.master);

    this.engOsc1 = this.ctx.createOscillator();
    this.engOsc1.type = 'sawtooth';
    this.engOsc1.frequency.value = 50;
    this.engOsc1.connect(this.engFilter);
    this.engOsc1.start(t);

    this.engOsc2 = this.ctx.createOscillator();
    this.engOsc2.type = 'square';
    this.engOsc2.frequency.value = 25;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.4;
    this.engOsc2.connect(g2);
    g2.connect(this.engFilter);
    this.engOsc2.start(t);

    // skid loop: filtered noise
    const skidSrc = this.ctx.createBufferSource();
    skidSrc.buffer = this.noiseBuf;
    skidSrc.loop = true;
    const skidFilter = this.ctx.createBiquadFilter();
    skidFilter.type = 'bandpass';
    skidFilter.frequency.value = 900;
    skidFilter.Q.value = 1.2;
    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.value = 0;
    skidSrc.connect(skidFilter);
    skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.master);
    skidSrc.start(t);
  },

  /** speed01: 0..1 relative speed, boosting adds bite */
  engine(speed01, boosting, active) {
    if (!this.ctx || !this.engGain) return;
    const t = this.ctx.currentTime;
    const target = active ? 0.045 + 0.075 * speed01 + (boosting ? 0.03 : 0) : 0;
    this.engGain.gain.setTargetAtTime(target, t, 0.08);
    const f = 42 + speed01 * 96 + (boosting ? 26 : 0);
    this.engOsc1.frequency.setTargetAtTime(f, t, 0.06);
    this.engOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engFilter.frequency.setTargetAtTime(280 + speed01 * 900, t, 0.08);
  },

  skid(amount) {
    if (!this.ctx || !this.skidGain) return;
    this.skidGain.gain.setTargetAtTime(amount * 0.14, this.ctx.currentTime, 0.05);
  },

  /* ---------------- one shots ---------------- */
  _noise(dur, filterType, f0, f1, gain, q = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rand(0.85, 1.15);
    const flt = this.ctx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    flt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.sfx);
    src.start(t); src.stop(t + dur + 0.02);
  },

  _tone(type, f0, f1, dur, gain, dest) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.02);
  },

  shoot() {
    if (!this.ctx) return;
    this._noise(0.07, 'bandpass', 2200, 700, 0.16, 1.4);
    this._tone('square', rand(380, 440), 110, 0.06, 0.1);
  },

  enemyShoot() {
    this._noise(0.08, 'bandpass', 1200, 400, 0.09, 1.2);
  },

  rocket() {
    this._noise(0.5, 'lowpass', 900, 2500, 0.22);
    this._tone('sawtooth', 140, 420, 0.35, 0.12);
  },

  explosion(big) {
    if (!this.ctx) return;
    const d = big ? 0.9 : 0.55;
    this._noise(d, 'lowpass', 2800, 60, big ? 0.65 : 0.42);
    this._tone('sine', big ? 150 : 110, 28, d, big ? 0.5 : 0.32);
  },

  hit() {
    this._noise(0.05, 'highpass', 3000, 2000, 0.12);
  },

  crash() {
    this._noise(0.18, 'lowpass', 1600, 200, 0.3);
    this._tone('sawtooth', 90, 40, 0.15, 0.18);
  },

  pickup() {
    if (!this.ctx) return;
    this._tone('sine', 660, 660, 0.07, 0.16);
    const self = this;
    setTimeout(() => self._tone('sine', 990, 990, 0.12, 0.16), 70);
  },

  ui() {
    this._tone('square', 440, 660, 0.08, 0.08);
  },

  waveHorn() {
    if (!this.ctx) return;
    this._tone('sawtooth', 110, 110, 0.5, 0.16, this.music);
    this._tone('sawtooth', 165, 165, 0.5, 0.12, this.music);
  },

  bossHorn() {
    if (!this.ctx) return;
    this._tone('sawtooth', 48, 96, 1.2, 0.24, this.music);
    this._tone('sawtooth', 53, 106, 1.2, 0.2, this.music);
    this._noise(1.1, 'bandpass', 180, 1400, 0.1, 0.8);
    const self = this;
    setTimeout(() => {
      self._tone('sawtooth', 96, 48, 0.9, 0.22, self.music);
      self._tone('sawtooth', 101, 50, 0.9, 0.18, self.music);
    }, 1100);
  },

  /* ---------------- music: minimal dark synthwave loop ---------------- */
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.musicStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this._musicTick();
  },

  _musicTick() {
    if (!this.musicOn || !this.ctx) return;
    const SPB = 60 / 116 / 4; // 16th at 116bpm
    while (this.nextNoteTime < this.ctx.currentTime + 0.14) {
      this._scheduleStep(this.musicStep, this.nextNoteTime);
      this.musicStep = (this.musicStep + 1) % 32;
      this.nextNoteTime += SPB;
    }
    this.musicTimer = setTimeout(() => this._musicTick(), 50);
  },

  _scheduleStep(step, when) {
    const c = this.ctx;
    // kick on quarters
    if (step % 8 === 0) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, when);
      o.frequency.exponentialRampToValueAtTime(38, when + 0.12);
      g.gain.setValueAtTime(0.5, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.14);
      o.connect(g); g.connect(this.music);
      o.start(when); o.stop(when + 0.16);
    }
    // hat on off-8ths
    if (step % 8 === 4) {
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      s.playbackRate.value = 2;
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 6500;
      const g = c.createGain();
      g.gain.setValueAtTime(0.08, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
      s.connect(f); f.connect(g); g.connect(this.music);
      s.start(when); s.stop(when + 0.06);
    }
    // bass pattern (semitones from A1) — played on 8ths
    const bassPat = [0, -1, 0, -1, 3, -1, 0, -1, 5, -1, 3, -1, 0, -1, 7, 5];
    if (step % 2 === 0) {
      const semi = bassPat[(step / 2) | 0];
      if (semi >= 0) {
        const freq = 55 * Math.pow(2, semi / 12);
        const o = c.createOscillator();
        const f = c.createBiquadFilter();
        const g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.value = freq;
        f.type = 'lowpass';
        f.frequency.setValueAtTime(700, when);
        f.frequency.exponentialRampToValueAtTime(180, when + 0.22);
        g.gain.setValueAtTime(0.16, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + 0.24);
        o.connect(f); f.connect(g); g.connect(this.music);
        o.start(when); o.stop(when + 0.26);
      }
    }
  }
};
