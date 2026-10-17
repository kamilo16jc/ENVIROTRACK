// ═══════════════════════════════════════════════
// SERVICE WORKER — EnviroTrack PWA
// ═══════════════════════════════════════════════
const CACHE_NAME = 'envirotrack-v116';

// Relative paths → work under any deploy sub-path (e.g. /ENVIROTRACK/).
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192-v2.png',
  './icons/icon-512-v2.png',
  './icons/icon-maskable-192-v2.png',
  './icons/icon-maskable-512-v2.png',
  './icons/apple-touch-icon-v2.png',
  './icons/favicon-32-v2.png',
  './img/logo.svg',
  './css/styles.css',
  './js/firebase-init.js',
  './js/data.js',
  './js/storage.js',
  './js/sync.js',
  './js/labfill.js',
  './js/labform.js',
  './js/submissions.js',
  './js/auth.js',
  './js/navigation.js',
  './js/generator.js',
  './js/pointhistory.js',
  './js/mapplot.js',
  './js/kpis.js',
  './js/pdf.js',
  './js/history.js',
  './js/labresults.js',
  './js/capa.js',
  './js/retests.js',
  './js/admin.js',
  './js/changelog.js',
  './js/emp.js',
  './js/training.js',
  './js/notifications.js',
  './js/live.js',
  './js/dashboard.js',
  './js/reports.js',
  './js/reports-view.js',
  './js/auditpack.js',
  './js/capalog.js',
  './js/mgmtreview.js',
  './js/alerts.js',
  './js/backup.js',
  './js/store.js',
  './js/settings.js',
  './js/init.js',
  './js/devlocal.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.7.0/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'
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
        // Cache only GETs of this app's own files and the pinned CDN libraries —
        // never Firestore / Functions / Microsoft responses (data stays off the device cache).
        const u = new URL(evt.request.url);
        const cacheable = evt.request.method === 'GET' && (u.origin === self.location.origin || u.hostname === 'cdnjs.cloudflare.com' || u.hostname === 'www.gstatic.com');
        if (cacheable && response && response.status === 200) {
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
