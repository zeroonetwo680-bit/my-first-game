/* ============================================================
   NEON WRECKAGE — service worker
   Cache-first app shell. Bump VERSION on every deploy.
   ============================================================ */
'use strict';

const VERSION = 'nw-v12';  // v12: clearer aim indicator
const CORE = [
  './',
  './index.html',
  './css/style.css',
  './js/core.js',
  './js/audio.js',
  './js/fx.js',
  './js/achievements.js',
  './js/input.js',
  './js/platform.js',
  './vendor/three.min.js',
  './js/render3d.js',
  './js/game.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // cache individually: an optional asset (the 3D layer) may be missing
      // without breaking the offline shell
      .then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* The app shell (HTML/CSS/JS) is NETWORK-FIRST. Cache-first is what made every
   bug fix invisible during testing: the browser kept serving the old CSS and
   JS from the previous cache version, so a fixed file never reached the page.
   The cache is now purely the offline fallback. Images and fonts stay
   cache-first because they never change. */
const SHELL = /\.(html|css|js|json|webmanifest|mjs)$/i;

function isShell(url) {
  try {
    const u = new URL(url);
    return SHELL.test(u.pathname) || u.pathname.endsWith('/');
  } catch (err) { return false; }
}

function cachePut(req, res) {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  if (isShell(e.request.url)) {
    // network first: always serve the deployed file, fall back to cache offline
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then((res) => cachePut(e.request, res))
        .catch(() => caches.match(e.request, { ignoreSearch: true })
          .then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // cache first for immutable assets (icons, textures, fonts)
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request)
        .then((res) => cachePut(e.request, res))
        .catch(() => caches.match('./index.html'));
    })
  );
});
