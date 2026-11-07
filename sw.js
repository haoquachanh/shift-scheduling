// Service worker: cache toàn bộ app để chạy offline. Tăng VERSION mỗi khi cập nhật code.
const VERSION = 'v1.2.1';
const CACHE = `timesheet-${VERSION}`;
const ASSETS = [
  './', './index.html', './manifest.json', './css/styles.css',
  './js/app.js', './js/i18n.js', './js/util.js', './js/rules.js', './js/planner.js', './js/store.js', './js/sync.js', './js/pdf.js',
  './vendor/jspdf.umd.min.js', './vendor/html2canvas.min.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('timesheet-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      const net = fetch(e.request).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      }).catch(() => hit);
      return isLocal ? net : (hit || net);
    }),
  );
});
