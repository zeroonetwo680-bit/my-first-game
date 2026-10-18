/* ============================================================
   NEON WRECKAGE — platform layer
   Android/mobile niceties: haptics, wake lock, fullscreen,
   back-button handling, offline indicator, SW update prompt.
   ============================================================ */
'use strict';

const Platform = {
  wakeLock: null,
  navPushed: false,
  swReg: null,

  init() {
    /* ---------------- online / offline badge ---------------- */
    this.setOnline(navigator.onLine !== false);
    window.addEventListener('online', () => this.setOnline(true));
    window.addEventListener('offline', () => this.setOnline(false));

    /* ---------------- android back button → pause, not exit ---------------- */
    window.addEventListener('popstate', (e) => {
      if (e && e.state === null && !this.navPushed) return;
      this.navPushed = false;
      const st = typeof Game !== 'undefined' ? Game.state : 'menu';
      if (st === 'playing') {
        Game.togglePause();
        this.pushNav();
      } else if (st === 'paused' || st === 'over' || st === 'upgrade') {
        if (st === 'upgrade') { setScreen(null); }
        Game.enterMenu();
      }
      /* menu: let the browser leave for real */
    });

    /* ---------------- fullscreen button ---------------- */
    const fb = document.getElementById('btn-full');
    if (fb) fb.addEventListener('click', () => this.toggleFullscreen());

    /* ---------------- reacquire wake lock after tab switch ---------------- */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && typeof Game !== 'undefined' && Game.state === 'playing') {
        this.keepAwake(true);
      }
    });
  },

  /* ---------------- haptics (Android) ---------------- */
  vibrate(pattern) {
    try {
      if (AudioSys.muted || document.hidden) return;
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* unsupported */ }
  },

  /* ---------------- wake lock: keep the screen on while racing ---------------- */
  keepAwake(on) {
    try {
      if (!navigator.wakeLock) return;
      if (on) {
        if (!this.wakeLock) {
          const self = this;
          const lock = {
            released: false,
            release: async () => {
              lock.released = true;
              if (self.wakeLock === lock) self.wakeLock = null;
              try { if (lock._real) await lock._real.release(); } catch (e) { /* ignore */ }
            }
          };
          this.wakeLock = lock;
          navigator.wakeLock.request('screen').then((real) => {
            lock._real = real;
            if (lock.released) real.release();
          }).catch(() => { if (self.wakeLock === lock) self.wakeLock = null; });
        }
      } else if (this.wakeLock && !this.wakeLock.released) {
        this.wakeLock.release();
      }
    } catch (e) { /* denied or unsupported */ }
  },

  /* ---------------- fullscreen ---------------- */
  toggleFullscreen() {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' })
          : el.webkitRequestFullscreen ? el.webkitRequestFullscreen()
          : null;
        if (p && p.catch) p.catch(() => {});
        this.vibrate(12);
      } else {
        const p = document.exitFullscreen ? document.exitFullscreen()
          : document.webkitExitFullscreen ? document.webkitExitFullscreen()
          : null;
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) { /* unsupported (iOS Safari) */ }
  },

  /* ---------------- history for back-button handling ---------------- */
  pushNav() {
    if (this.navPushed) return;
    try {
      history.pushState({ nw: 1 }, '');
      this.navPushed = true;
    } catch (e) { /* sandboxed or unavailable */ }
  },

  /* ---------------- offline badge ---------------- */
  setOnline(online) {
    const badge = document.getElementById('offline-badge');
    if (badge) badge.classList.toggle('hidden', !!online);
    if (!online && typeof banner === 'function' && typeof Game !== 'undefined' && Game.state === 'playing') {
      banner('OFFLINE \u2014 STILL PLAYABLE');
    }
  },

  /* ---------------- service worker update flow ---------------- */
  swReady(reg) {
    this.swReg = reg;
    try {
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            const el = document.getElementById('update-banner');
            if (el) el.classList.remove('hidden');
          }
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (this._pendingReload) location.reload();
      });
    } catch (e) { /* older browsers */ }
  },

  applyUpdate() {
    const el = document.getElementById('update-banner');
    if (el) el.classList.add('hidden');
    this._pendingReload = true;
    try {
      if (this.swReg && this.swReg.waiting) this.swReg.waiting.postMessage('SKIP_WAITING');
      else location.reload();
    } catch (e) { location.reload(); }
  }
};
