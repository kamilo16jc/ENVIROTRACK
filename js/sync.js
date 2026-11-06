// ═══════════════════════════════════════════════════════════════
// SYNC — data goes to Firestore first; SharePoint gets a copy from the server
//   · Records, retest cases, sampling points and the lab-form log are written
//     to Firestore only (js/store.js). The spMirror Cloud Functions copy every
//     change to SharePoint; nothing is read back from SharePoint.
//   · The SharePoint proxy (Cloud Function `spProxy`) is only used for files:
//     the lab form, archived PDFs, retest photos, and the monthly email. The
//     secret Power Automate flow URLs live server-side (functions/.env).
// ═══════════════════════════════════════════════════════════════

const SYNC_ENABLED = true;

// Firestore is connected once the session is up (js/store.js).
const FS_PRIMARY = () => typeof storeActive === 'function' && storeActive();
function _needStore() {
  if (FS_PRIMARY()) return true;
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return false;   // dev without a session: local copy only
  throw new Error('offline-store');
}

// ── Low-level call → Cloud Function proxy ──────────────────────
async function _spPost(op, body) {
  const call = fbFunctions.httpsCallable('spProxy');
  const res = await call({ op, body: body || {} });
  return res.data;
}

// ═══════════════════════════════════════════════════════════════
// OLD WRITE QUEUE — versions before Firestore queued unsent writes here
// (cap_outbox) for SharePoint. SharePoint no longer accepts writes from the
// app, so anything still waiting on this device is saved to Firestore once,
// then removed. Rules apply as for any other write.
// ═══════════════════════════════════════════════════════════════
const OUTBOX_KEY = 'cap_outbox';
const getOutbox = () => { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch (e) { return []; } };
const _outNum = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : v; };
const _fromSP = it => {
  const r = Object.assign({}, it);
  if (r.department !== undefined) { r.planta = r.department; delete r.department; }
  if (typeof r.failedPathogens === 'string') r.failedPathogens = r.failedPathogens ? r.failedPathogens.split(',').map(x => x.trim()).filter(Boolean) : [];
  return r;
};
let _drainBusy = false;
async function drainOldOutbox() {
  if (_drainBusy || !FS_PRIMARY()) return;
  const q = getOutbox(); if (!q.length) return;
  _drainBusy = true;
  try {
    const left = [];
    for (const entry of q) {
      try {
        const items = ((entry.body && entry.body.items) || []).map(_fromSP);
        if (entry.op === 'recordsWrite') {
          await fsCreateRecords(items.filter(r => !GH().some(h => String(h.id) === String(r.id))).map(r => Object.assign(r, { id: _outNum(r.id), sample: _outNum(r.sample), zone: _outNum(r.zone) })));
        } else if (entry.op === 'recordsUpdate') {
          for (const u of items) { const cur = GH().find(h => String(h.id) === String(u.id)); if (cur) await fsUpdateRecord(Object.assign({}, cur, u, { id: cur.id })); }
        } else if (entry.op === 'resolvedWrite') {
          await fsAddResolved(items);
        } else if (entry.op === 'masterPointsWrite' || entry.op === 'masterPointsUpdate') {
          for (const p of items) {
            const plant = p.planta, cur = getMasterPoints().find(x => x.plant === plant && String(x.sample) === String(p.sample));
            await fsSetPoint(Object.assign({}, cur || {}, p, { plant }));
          }
        }   // anything else was a SharePoint-only call: nothing to save
      } catch (e) { console.warn('[outbox] could not save an old queued change', entry.op, e && e.code); left.push(entry); }
    }
    if (left.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(left)); else localStorage.removeItem(OUTBOX_KEY);
  } finally { _drainBusy = false; }
}
if (typeof fbAuth !== 'undefined') fbAuth.onAuthStateChanged(u => { if (u) setTimeout(() => drainOldOutbox().catch(() => {}), 15000); });

// ── Value helpers (SharePoint quirks, for the photo list) ──────
// Choice columns come back as { Value: "1935" }; plain columns as strings.
const _val  = v => (v && typeof v === 'object' && 'Value' in v) ? v.Value : v;
// Pick the first defined key (SharePoint internal names vary in casing).
const _pick = (o, ...keys) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

// ═══════════════════════════════════════════════════════════════
// READ — live Firestore listeners fill the local cache (js/store.js)
// ═══════════════════════════════════════════════════════════════
async function syncPullRecords()      { return FS_PRIMARY() ? storeWhenReady(['records']) : false; }
async function syncPullResolved()     { return FS_PRIMARY() ? storeWhenReady(['resolved']) : false; }
async function syncPullSubmissions()  { return FS_PRIMARY() ? storeWhenReady(['submissions']) : false; }
async function syncPullMasterPoints() { return FS_PRIMARY() ? storeWhenReady(['masterPoints']) : false; }

const getSubmissions = () => JSON.parse(localStorage.getItem('cap_submissions') || '[]');
const getMasterPoints = () => JSON.parse(localStorage.getItem('cap_masterpoints') || '[]');

// ═══════════════════════════════════════════════════════════════
// WRITE — Firestore only (the server copies to SharePoint)
// ═══════════════════════════════════════════════════════════════
async function syncPushRecords(recs)   { if (recs && recs.length && _needStore()) return fsCreateRecords(recs); }
async function syncUpdateRecord(rec)   { if (rec && _needStore()) return fsUpdateRecord(rec); }
async function syncPushResolved(items) { if (items && items.length && _needStore()) return fsAddResolved(items); }
async function syncPushPoint(point)    { if (point && _needStore()) return fsSetPoint(point); }   // create a new point
async function syncUpdatePoint(point)  { if (point && _needStore()) return fsSetPoint(point); }   // edit / activate / deactivate

// ═══════════════════════════════════════════════════════════════
// RETEST PHOTOS — evidence images attached to a retest (uploaded from
// a phone via the QR capture page; the app reads them to display).
// ═══════════════════════════════════════════════════════════════
function spToPhoto(it) {
  const url = _pick(it, 'fileUrl', 'FileUrl');
  return {
    retestId:   String(_pick(it, 'retestId', 'RetestId', 'ref', 'Ref') || ''),
    fileName:   _pick(it, 'fileName', 'FileName') || '',
    fileUrl:    (url && typeof url === 'object') ? (url.Url || url.url || '') : (url || ''),
    label:      _pick(it, 'label', 'Label') || '',
    uploadedAt: _pick(it, 'uploadedAt', 'UploadedAt') || '',
    uploadedByName: _pick(it, 'uploadedByName', 'UploadedByName') || ''
  };
}
const getPhotos = () => JSON.parse(localStorage.getItem('cap_photos') || '[]');
async function syncPullPhotos() {
  if (!SYNC_ENABLED) return false;
  const data = await _spPost('photosRead', {});
  const rows = Array.isArray(data) ? data : (data && data.value) || [];
  localStorage.setItem('cap_photos', JSON.stringify(rows.map(spToPhoto).filter(p => p.retestId)));
  return true;
}
// The signed-in desktop asks the proxy for the raw upload URL to embed in the QR
// (the phone posts there directly). Cached briefly so opening several QRs is snappy.
let _photoUploadUrl = '';
async function getPhotoUploadUrl() {
  if (_photoUploadUrl) return _photoUploadUrl;
  if (!SYNC_ENABLED) return '';
  const r = await _spPost('photoUploadUrl', {});
  _photoUploadUrl = (r && r.url) || '';
  return _photoUploadUrl;
}

// Fire-and-forget wrapper: never let a sync failure break the local flow.
function syncSafe(promiseFactory, label) {
  Promise.resolve()
    .then(promiseFactory)
    .catch(err => {
      console.warn('[sync] ' + (label || '') + ' failed:', err);
      toast(err && err.code === 'permission-denied' ? 'Your account cannot change this record'
        : err && err.message === 'offline-store' ? 'Not connected to the database — sign in again' : 'Saved on this device — will sync when online', 'error');
    });
}
