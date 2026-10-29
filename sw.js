/* ============================================================
   NEON WRECKAGE — service worker
   Cache-first app shell. Bump VERSION on every deploy.
   ============================================================ */
'use strict';

const VERSION = 'nw-v8';   // v8: 3D layer black-screen fixes
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

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        // cache app-shell + fonts (opaque for cross-origin) for offline play
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
