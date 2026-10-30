/* STICKMAN — sound. Small WebAudio synth: no files, no loading, no licence.
 * Every call is guarded, so a browser with autoplay restrictions (or the test
 * harness, which has no AudioContext at all) simply stays silent.
 */
'use strict';

var Sfx = (function () {
  var ctx = null;
  var master = null;
  var enabled = true;
  var failed = false;

  function ensure() {
    if (ctx || failed) return ctx;
    try {
      var AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!AC) { failed = true; return null; }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.25;
      master.connect(ctx.destination);
    } catch (e) { failed = true; ctx = null; }
    return ctx;
  }

  function tone(freq, dur, type, gain, slideTo) {
    if (!enabled) return;
    var c = ensure();
    if (!c) return;
    if (c.state === 'suspended' && c.resume) { try { c.resume(); } catch (e) {} }
    var t0 = c.currentTime;
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain === undefined ? 0.3 : gain), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain, filterHz) {
    if (!enabled) return;
    var c = ensure();
    if (!c) return;
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, Math.max(1, len), c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource();
    src.buffer = buf;
    var bp = c.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = filterHz || 1200;
    var g = c.createGain();
    g.gain.value = gain === undefined ? 0.3 : gain;
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start();
  }

  return {
    setEnabled: function (on) { enabled = !!on; },
    isEnabled: function () { return enabled; },
    unlock: function () { var c = ensure(); if (c && c.state === 'suspended' && c.resume) { try { c.resume(); } catch (e) {} } },

    shoot: function () { tone(660, 0.05, 'square', 0.10, 320); },
    /* each desk weapon gets its own voice, so a clip swap is audible */
    shootFor: function (weapon) {
      if (weapon === 'ruler') { tone(240, 0.09, 'square', 0.16, 150); noise(0.05, 0.10, 700); }
      else if (weapon === 'compass') { tone(1180, 0.05, 'sawtooth', 0.09, 700); }
      else if (weapon === 'stapler') { tone(900, 0.025, 'square', 0.07, 620); }
      else if (weapon === 'eraser') { tone(150, 0.16, 'sine', 0.18, 70); noise(0.12, 0.12, 400); }
      else { tone(660, 0.05, 'square', 0.10, 320); }
    },
    blast: function () { tone(180, 0.22, 'sawtooth', 0.12, 55); noise(0.25, 0.16, 1400); },
    swing: function (move) { noise(move === 'sword' ? 0.12 : 0.08, 0.08, move === 'sword' ? 2200 : 1000); },
    hit: function () { noise(0.06, 0.16, 900); },
    kill: function () { tone(190, 0.16, 'sawtooth', 0.16, 60); noise(0.12, 0.14, 700); },
    hurt: function () { tone(140, 0.22, 'sawtooth', 0.26, 55); },
    dash: function () { noise(0.14, 0.14, 2400); },
    pickup: function () { tone(880, 0.07, 'triangle', 0.15); },
    wave: function () { tone(330, 0.1, 'triangle', 0.16); setTimeout(function () { tone(494, 0.14, 'triangle', 0.16); }, 90); },
    choose: function () { tone(520, 0.08, 'triangle', 0.18); setTimeout(function () { tone(784, 0.12, 'triangle', 0.18); }, 70); },
    gameover: function () { tone(300, 0.5, 'sawtooth', 0.2, 60); },
    start: function () { tone(440, 0.09, 'square', 0.14); setTimeout(function () { tone(660, 0.12, 'square', 0.14); }, 90); }
  };
})();
