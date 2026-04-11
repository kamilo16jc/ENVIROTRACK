// ═══════════════════════════════════════════════
// SERVICE WORKER — EnviroTrack PWA
// ═══════════════════════════════════════════════
const CACHE_NAME = 'envirotrack-v1';

const ASSETS = [
  '/caputo-env-monitoring/',
  '/caputo-env-monitoring/index.html',
  '/caputo-env-monitoring/css/styles.css',
  '/caputo-env-monitoring/js/data.js',
  '/caputo-env-monitoring/js/storage.js',
  '/caputo-env-monitoring/js/auth.js',
  '/caputo-env-monitoring/js/navigation.js',
  '/caputo-env-monitoring/js/generator.js',
  '/caputo-env-monitoring/js/pdf.js',
  '/caputo-env-monitoring/js/history.js',
  '/caputo-env-monitoring/js/retests.js',
  '/caputo-env-monitoring/js/dashboard.js',
  '/caputo-env-monitoring/js/reports.js',
  '/caputo-env-monitoring/js/settings.js',
  '/caputo-env-monitoring/js/init.js',
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
          return caches.match('/caputo-env-monitoring/index.html');
        }
      });
    })
  );
});
