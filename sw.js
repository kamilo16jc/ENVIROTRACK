// ═══════════════════════════════════════════════
// SERVICE WORKER — EnviroTrack PWA
// ═══════════════════════════════════════════════
const CACHE_NAME = 'envirotrack-v26';

// Relative paths → work under any deploy sub-path (e.g. /ENVIROTRACK/).
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/firebase-init.js',
  './js/data.js',
  './js/storage.js',
  './js/sync.js',
  './js/labform.js',
  './js/submissions.js',
  './js/auth.js',
  './js/navigation.js',
  './js/generator.js',
  './js/pdf.js',
  './js/history.js',
  './js/retests.js',
  './js/admin.js',
  './js/notifications.js',
  './js/live.js',
  './js/dashboard.js',
  './js/reports.js',
  './js/settings.js',
  './js/init.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.7.0/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
];

// Install — cache all assets
self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — serve from cache, fallback to network
self.addEventListener('fetch', evt => {
  evt.respondWith(
    caches.match(evt.request).then(cached => {
      if (cached) return cached;
      return fetch(evt.request).then(response => {
        // Cache new successful requests
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(evt.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback
        if (evt.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
