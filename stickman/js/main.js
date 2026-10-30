/* STICKMAN — browser wiring: sizing, input, the frame loop.
 * The game itself lives in game.js and knows nothing about the DOM.
 */
'use strict';

(function () {
  var canvas = document.getElementById('game');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var dpr = 1;
  var view = { scale: 1, ox: 0, oy: 0 };
  var last = 0;
  var acc = 0;
  var STEP = 1 / 120;          // fixed timestep, so physics is frame-rate free

  /* ------------------------------------------------------------- sizing --- */
  function resize() {
    var cw = canvas.clientWidth || window.innerWidth;
    var ch = canvas.clientHeight || window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    var s = Math.min(cw / W, ch / H);
    view.scale = s;
    view.ox = (cw - W * s) / 2;
    view.oy = (ch - H * s) / 2;
    Game.viewScale = s * dpr;
    Game.viewX = view.ox * dpr;
    Game.viewY = view.oy * dpr;
  }

  /* screen (css px) -> logical playfield coords */
  function toWorld(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left - view.ox) / view.scale,
      y: (clientY - r.top - view.oy) / view.scale
    };
  }

  /* -------------------------------------------------------------- input --- */
  var keysBlocked = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };

  window.addEventListener('keydown', function (e) {
    if (keysBlocked[e.code]) e.preventDefault();
    if (e.repeat) return;
    Input.keys[e.code] = true;
    Input.pressed[e.code] = true;
    Input.anyPressed = true;
    Sfx.unlock();
    onKey(e.code);
  }, { passive: false });

  window.addEventListener('keyup', function (e) {
    Input.keys[e.code] = false;
  });

  function onKey(code) {
    if (code === 'KeyM') {
      Sfx.setEnabled(!Sfx.isEnabled());
      return;
    }
    if (Game.state === 'menu') {
      if (code === 'Enter' || code === 'Space') Game.openMap();
      return;
    }
    if (Game.state === 'map') {
      if (code === 'Enter' || code === 'Space') Game.startHouse();
      return;
    }
    if (Game.state === 'victory') {
      if (code === 'Enter' || code === 'Space') Game.openMap();
      return;
    }
    if (Game.state === 'dead') {
      if (code === 'Enter' || code === 'Space') {
        if (Game.house) Game.startHouse(); else Game.startRun();
      }
      return;
    }
    if (Game.state === 'power') {
      if (code === 'Digit1' || code === 'Numpad1') Game.choosePower(0);
      if (code === 'Digit2' || code === 'Numpad2') Game.choosePower(1);
      if (code === 'ArrowLeft') Game.sel = 0;
      if (code === 'ArrowRight') Game.sel = 1;
      return;
    }
    if (code === 'KeyP' || code === 'Escape') {
      if (Game.state === 'playing') Game.state = 'paused';
      else if (Game.state === 'paused') Game.state = 'playing';
      return;
    }
    if (Game.state === 'playing') {
      if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyK') Game.dash();
      if (code === 'KeyE') Game.startMelee('kungfu');
      if (code === 'KeyF') Game.startMelee('sword');
      if (code === 'KeyQ') Game.activateBlast();
    }
  }

  /* mouse */
  canvas.addEventListener('mousemove', function (e) {
    var w = toWorld(e.clientX, e.clientY);
    Input.mouse.x = w.x; Input.mouse.y = w.y;
  });

  canvas.addEventListener('mousedown', function (e) {
    Sfx.unlock();
    var w = toWorld(e.clientX, e.clientY);
    Input.mouse.x = w.x; Input.mouse.y = w.y;
    if (e.button === 2) {
      if (Game.state === 'playing') Game.dash();
      e.preventDefault();
      return;
    }
    if (Game.state === 'menu' || Game.state === 'victory') { Game.openMap(); return; }
    if (Game.state === 'map') {
      if (w.x >= 140 && w.x <= 420 && w.y >= 240 && w.y <= 490) Game.startHouse();
      return;
    }
    if (Game.state === 'dead') {
      if (Game.house) Game.startHouse(); else Game.startRun();
      return;
    }
    Input.mouse.down = true;
    if (Game.state === 'power') {
      /* click a card */
      var cw = 430, ch = 300, gap = 44;
      var totalW = cw * 2 + gap;
      var x0 = (W - totalW) / 2;
      for (var i = 0; i < 2; i++) {
        var x = x0 + i * (cw + gap);
        if (w.x >= x && w.x <= x + cw && w.y >= 226 && w.y <= 226 + ch) {
          Game.choosePower(i);
          return;
        }
      }
    }
  });

  window.addEventListener('mouseup', function () { Input.mouse.down = false; });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* touch: drag the left half to move, drag the right half to aim and fire */
  canvas.addEventListener('touchstart', function (e) {
    Sfx.unlock();
    if (Game.state === 'menu' || Game.state === 'victory') { Game.openMap(); e.preventDefault(); return; }
    if (Game.state === 'map') {
      var tap = toWorld(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      if (tap.x >= 140 && tap.x <= 420 && tap.y >= 240 && tap.y <= 490) Game.startHouse();
      e.preventDefault(); return;
    }
    if (Game.state === 'dead') {
      if (Game.house) Game.startHouse(); else Game.startRun();
      e.preventDefault(); return;
    }
    if (Game.state === 'power') {
      var choice = toWorld(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      var left = (W - 904) / 2;
      if (choice.y >= 226 && choice.y <= 526) {
        if (choice.x >= left && choice.x <= left + 430) Game.choosePower(0);
        else if (choice.x >= left + 474 && choice.x <= left + 904) Game.choosePower(1);
      }
      e.preventDefault(); return;
    }
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var w = toWorld(t.clientX, t.clientY);
      if (w.x < W / 2) {
        if (Input.touch.moveId === -1) {
          Input.touch.moveId = t.identifier;
          Input.touch.mx = w.x; Input.touch.my = w.y;
        }
      } else if (Input.touch.aimId === -1) {
        Input.touch.aimId = t.identifier;
        Input.touch.ax = w.x; Input.touch.ay = w.y;
      }
    }
    Input.touch.active = true;
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', function (e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var w = toWorld(t.clientX, t.clientY);
      if (t.identifier === Input.touch.moveId) {
        var dx = w.x - Input.touch.mx, dy = w.y - Input.touch.my;
        var len = Math.hypot(dx, dy) || 1;
        var k = Math.min(1, len / 46);
        Input.touch.dx = (dx / len) * k;
        Input.touch.dy = (dy / len) * k;
      } else if (t.identifier === Input.touch.aimId) {
        Input.touch.ax = w.x; Input.touch.ay = w.y;
      }
    }
    e.preventDefault();
  }, { passive: false });

  function endTouch(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === Input.touch.moveId) {
        Input.touch.moveId = -1; Input.touch.dx = 0; Input.touch.dy = 0;
      }
      if (t.identifier === Input.touch.aimId) {
        Input.touch.aimId = -1;
      }
    }
    if (e.touches.length === 0) Input.touch.active = false;
    e.preventDefault();
  }
  canvas.addEventListener('touchend', endTouch, { passive: false });
  canvas.addEventListener('touchcancel', endTouch, { passive: false });

  window.addEventListener('blur', function () {
    Input.keys = Object.create(null);
    Input.mouse.down = false;
    if (Game.state === 'playing') Game.state = 'paused';
  });

  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  // Buttons sit above the canvas, so they do not steal either touch stick.
  var meleeControls = document.getElementById('melee-controls');
  function bindMeleeButton(id, kind) {
    var button = document.getElementById(id);
    if (!button) return;
    button.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      Sfx.unlock();
      if (kind === 'blast') Game.activateBlast(); else Game.startMelee(kind);
    });
  }
  bindMeleeButton('kungfu-button', 'kungfu');
  bindMeleeButton('sword-button', 'sword');
  bindMeleeButton('blast-button', 'blast');

  /* --------------------------------------------------------------- boot --- */
  Game.init(canvas);
  resize();
  Game.viewScale = view.scale * dpr;
  Game.viewX = view.ox * dpr;
  Game.viewY = view.oy * dpr;

  /* first interaction unlocks audio */
  window.addEventListener('pointerdown', function () { Sfx.unlock(); }, { once: true });

  function frame(now) {
    if (!last) last = now;
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    var guard = 0;
    while (acc >= STEP && guard < 8) {
      Game.update(STEP);
      acc -= STEP;
      guard++;
    }
    if (guard >= 8) acc = 0;
    Game.render();
    if (meleeControls) meleeControls.hidden = Game.state !== 'playing';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
