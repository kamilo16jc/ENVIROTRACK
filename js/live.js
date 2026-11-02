// ═══════════════════════════════════════════════════════════════
// LIVE FRESHNESS — keep data current across sessions without a full
// real-time backend. Three low-cost mechanisms:
//   (A) pull when the user returns to the tab (focus / visibility)
//   (B) a gentle background poll while the tab is visible (~90s)
//   (C) an "Updated Xm ago" label + manual Refresh button
// All app-side: it reuses the existing read flows, respects the outbox
// guard (never clobbers un-synced local writes), and never disrupts a
// user mid-action (open modal or an active row selection).
// ═══════════════════════════════════════════════════════════════

const LIVE_POLL_MS = 90000;   // pull at most this often in the background
let _liveTimer = null;
let _liveRefreshing = false;
let _lastSyncAt = 0;

function _liveLoggedIn() {
  return typeof CU !== 'undefined' && CU &&
         typeof SYNC_ENABLED !== 'undefined' && SYNC_ENABLED;
}
function _liveBusyUI() {
  // Don't yank the UI while a modal is open or rows are selected for a bulk action.
  return document.querySelector('.modal-overlay.open') ||
         document.querySelector('.hist-check:checked') ||
         document.querySelector('.rt-check:checked');
}

// Pull the shared lists and re-render whatever page is active.
async function refreshLiveData(opts) {
  opts = opts || {};
  if (!_liveLoggedIn() || _liveRefreshing) return;
  if (!opts.force && _liveBusyUI()) return;
  _liveRefreshing = true;
  try {
    const jobs = [];
    if (typeof syncPullRecords === 'function')     jobs.push(syncPullRecords());
    if (typeof syncPullResolved === 'function')    jobs.push(syncPullResolved());
    if (typeof syncPullSubmissions === 'function') jobs.push(syncPullSubmissions());
    await Promise.all(jobs);

    const active = document.querySelector('.page.active');
    const id = active ? active.id : '';
    if      (id === 'page-dashboard'   && typeof refreshDashboard === 'function') refreshDashboard();
    else if (id === 'page-history'     && typeof searchHistory   === 'function') searchHistory();
    else if (id === 'page-retests'     && typeof loadRetests     === 'function') loadRetests();
    else if (id === 'page-submissions' && typeof loadSubmissions === 'function') loadSubmissions();
    if (typeof updateNotifBadge === 'function') updateNotifBadge();

    _lastSyncAt = Date.now();
    _renderLastSync();
  } catch (e) {
    console.warn('[live] refresh failed', e);
  } finally {
    _liveRefreshing = false;
  }
}

function _renderLastSync() {
  const s = _lastSyncAt ? Math.floor((Date.now() - _lastSyncAt) / 1000) : null;
  const txt = s === null ? 'Refresh data'
    : s < 10   ? 'Updated just now'
    : s < 60   ? 'Updated ' + s + 's ago'
    : s < 3600 ? 'Updated ' + Math.floor(s / 60) + 'm ago'
    :            'Updated ' + Math.floor(s / 3600) + 'h ago';
  const el = document.getElementById('liveSyncLabel');   // optional text (removed from header)
  if (el) el.textContent = _lastSyncAt ? txt : '';
  const btn = document.getElementById('liveRefreshBtn'); // show the freshness in the tooltip
  if (btn) btn.title = txt;
}

function liveManualRefresh() {
  const btn = document.getElementById('liveRefreshBtn');
  if (btn) btn.classList.add('spin');
  refreshLiveData({ force: true }).then(() => {
    if (typeof toast === 'function') toast('Data refreshed', 'success');
  }).finally(() => { if (btn) btn.classList.remove('spin'); });
}

function _onLiveVisible() {
  if (document.visibilityState !== 'visible') return;
  if (Date.now() - _lastSyncAt >= 20000) refreshLiveData();   // throttle to ≥20s stale
}

// Start after login (login already did the first pull).
function startLiveSync() {
  stopLiveSync();
  _lastSyncAt = Date.now();
  _renderLastSync();
  _liveTimer = setInterval(() => {
    _renderLastSync();                                          // keep the label ticking
    if (document.visibilityState === 'visible' && Date.now() - _lastSyncAt >= LIVE_POLL_MS) {
      refreshLiveData();                                       // (B) gentle background poll
    }
  }, 15000);
  document.addEventListener('visibilitychange', _onLiveVisible);  // (A) refresh on return
  window.addEventListener('focus', _onLiveVisible);
}

function stopLiveSync() {
  if (_liveTimer) { clearInterval(_liveTimer); _liveTimer = null; }
  document.removeEventListener('visibilitychange', _onLiveVisible);
  window.removeEventListener('focus', _onLiveVisible);
  _lastSyncAt = 0;
  _renderLastSync();
}
