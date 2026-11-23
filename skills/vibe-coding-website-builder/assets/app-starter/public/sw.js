// Keeps the app's own pages and scripts on the device so it opens without a
// connection. Data requests (/api/...) are never stored here: private data in
// this cache would outlive the session and could show one person's records to
// the next person on a shared device.
//
// Change VERSION whenever a file in SHELL changes, or devices keep the old one.

const VERSION = 'v1';
const SHELL = ['/', '/login', '/account', '/app.css', '/js/api.js', '/js/shell.js', '/js/live.js', '/js/merge.js', '/js/offline.js', '/js/home.js', '/js/login.js', '/js/account.js', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Fresh from the network when there is one; the stored copy when there is not.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) { const copy = response.clone(); caches.open(VERSION).then((cache) => cache.put(event.request, copy)); }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || caches.match('/'))),
  );
});
