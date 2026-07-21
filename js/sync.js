// ═══════════════════════════════════════════════════════════════
// SYNC — SharePoint bridge (via the Firebase Cloud Function `spProxy`)
// SharePoint is the source of truth; localStorage is a local cache.
//   · Before generating tests → PULL Records (fresh anti-repetition data)
//   · On save / result / retests / master → PUSH to SharePoint
// The secret Power Automate flow URLs live SERVER-SIDE (functions/.env);
// this client only calls `spProxy` — NO flow URL is exposed here.
// ═══════════════════════════════════════════════════════════════

const SYNC_ENABLED = true;

// ── Low-level call → Cloud Function proxy ──────────────────────
// Sends { op, body } to spProxy, which resolves the secret flow URL,
// POSTs to SharePoint, and returns the flow's JSON response.
async function _spPost(op, body) {
  const call = fbFunctions.httpsCallable('spProxy');
  const res = await call({ op, body: body || {} });
  return res.data;
}

// ═══════════════════════════════════════════════════════════════
// OUTBOX — durable write queue (offline-safe)
// Every write is enqueued in localStorage BEFORE hitting the network and
// only removed once SharePoint confirms it. This prevents the data-loss
// window where a failed push (offline / flow down) would be wiped by the
// next destructive pull. Order is preserved and the flush stops on the
// first failure so dependent ops (create → update) never run out of order.
// ═══════════════════════════════════════════════════════════════

const OUTBOX_KEY = 'cap_outbox';
const getOutbox   = () => { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch (e) { return []; } };
const _setOutbox  = q  => localStorage.setItem(OUTBOX_KEY, JSON.stringify(q));

// Enqueue a write. `body` must be a plain, already-mapped payload snapshot.
function outboxAdd(op, body) {
  const q = getOutbox();
  q.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), op, body, ts: new Date().toISOString(), attempts: 0 });
  _setOutbox(q);
  updateSyncBadge();
}

// Drain the queue in order. Returns true when empty (fully synced), false if
// items remain (still offline / failing). De-duped: concurrent callers share
// the same in-flight flush and get the real result (no race on pulls).
let _flushPromise = null;
function flushOutbox() {
  if (!SYNC_ENABLED) return Promise.resolve(getOutbox().length === 0);
  if (_flushPromise) return _flushPromise;
  _flushPromise = _doFlush().finally(() => { _flushPromise = null; });
  return _flushPromise;
}
async function _doFlush() {
  while (true) {
    const q = getOutbox();
    if (!q.length) { updateSyncBadge(); return true; }
    const entry = q[0];
    try {
      await _spPost(entry.op, entry.body);
    } catch (e) {
      const q2 = getOutbox();
      if (q2[0]) { q2[0].attempts = (q2[0].attempts || 0) + 1; _setOutbox(q2); }
      console.warn('[outbox] flush stopped at ' + entry.op + ' (attempt ' + ((q2[0] && q2[0].attempts) || '?') + '):', e);
      updateSyncBadge();
      return false;
    }
    // Success → remove this exact entry (by id, in case the queue shifted).
    const q3 = getOutbox();
    const idx = q3.findIndex(x => x.id === entry.id);
    if (idx >= 0) { q3.splice(idx, 1); _setOutbox(q3); }
    updateSyncBadge();
  }
}

// Discreet floating indicator: shows only when writes are still pending.
// Clicking it forces a retry. Created lazily so no HTML changes are needed.
function updateSyncBadge() {
  if (typeof document === 'undefined' || !document.body) return;
  let el = document.getElementById('syncBadge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'syncBadge';
    el.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9999;background:#C0392B;color:#fff;' +
      'padding:8px 14px;border-radius:20px;font-family:var(--font,sans-serif);font-size:12px;font-weight:600;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;display:none;align-items:center;gap:8px;user-select:none';
    el.title = 'Some changes have not reached SharePoint yet. Click to retry.';
    el.onclick = () => { el.textContent = 'Syncing…'; flushOutbox().then(updateSyncBadge); };
    document.body.appendChild(el);
  }
  const n = getOutbox().length;
  if (n > 0) {
    el.textContent = n + (n > 1 ? ' changes' : ' change') + ' not synced — Retry';
    el.style.display = 'flex';
  } else {
    el.style.display = 'none';
  }
}

// Auto-retry the moment connectivity returns.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flushOutbox().then(updateSyncBadge); });
}

// ── Value helpers (SharePoint quirks) ──────────────────────────
// Choice columns come back as { Value: "1935" }; plain columns as strings.
const _val  = v => (v && typeof v === 'object' && 'Value' in v) ? v.Value : v;
// Pick the first defined key (SharePoint internal names vary in casing).
const _pick = (o, ...keys) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};
const _arr  = s => Array.isArray(s) ? s : (s ? String(s).split(',').map(x=>x.trim()).filter(Boolean) : []);

// ═══════════════════════════════════════════════════════════════
// MAPPERS
// ═══════════════════════════════════════════════════════════════

// SharePoint item → app record (READ). Tolerant to internal-name casing.
function spToRecord(it) {
  return {
    id:         Number(_pick(it, 'id0', 'id', 'ID')),
    fecha:      _pick(it, 'Date', 'fecha') || '',
    planta:     _val(_pick(it, 'Departament', 'department', 'planta')) || '',
    by:         _pick(it, 'by', 'By') || '',
    sample:     Number(_pick(it, 'sample', 'Sample')) || 0,
    zone:       Number(_pick(it, 'zone', 'Zone')) || 0,
    area:       _pick(it, 'Area', 'area') || '',
    line:       _pick(it, 'Line', 'line') || '',
    location:   _pick(it, 'Location', 'location') || '',
    ecoli:      Number(_pick(it, 'ecoli', 'Ecoli')) || 0,
    listeria:   Number(_pick(it, 'listeria', 'Listeria')) || 0,
    salmonella: Number(_pick(it, 'salmonella', 'Salmonella')) || 0,
    saureus:    Number(_pick(it, 'saureus', 'Saureus')) || 0,
    resultado:  _val(_pick(it, 'results', 'resultado', 'Resultado')) || 'Pending',
    retestNum:  _pick(it, 'retestNum', 'RetestNum') || '',
    labNotes:   _pick(it, 'LabNotes', 'labNotes') || '',
    resultDate: _pick(it, 'ResultDate', 'resultDate') || '',
    failedPathogens:      _arr(_pick(it, 'failedPathogens', 'FailedPathogens')),
    failedPathogensLabel: _pick(it, 'failedPathogensLabel', 'FailedPathogensLabel') || '',
    isRetest:   !!_pick(it, 'isRetest', 'IsRetest'),
    originalId: Number(_pick(it, 'originalId', 'OriginalId')) || 0,
    scheduled:  !!_pick(it, 'scheduled', 'Scheduled'),
    enteredByEmail: _pick(it, 'enteredByEmail', 'EnteredByEmail') || '',
    enteredByName:  _pick(it, 'enteredByName', 'EnteredByName') || '',
    enteredAt:      _pick(it, 'enteredAt', 'EnteredAt') || ''
  };
}

// app record → SharePoint payload (WRITE / create). Seals audit fields.
function recordToSP(r) {
  return {
    id: r.id, fecha: r.fecha, department: r.planta, by: r.by || '',
    sample: r.sample, zone: r.zone, area: r.area || '', line: r.line || '',
    location: r.location || '',
    ecoli: r.ecoli ? 1 : 0, listeria: r.listeria ? 1 : 0,
    salmonella: r.salmonella ? 1 : 0, saureus: r.saureus ? 1 : 0,
    resultado: r.resultado || 'Pending', retestNum: r.retestNum || '',
    labNotes: r.labNotes || '', isRetest: !!r.isRetest,
    originalId: r.originalId || 0, scheduled: !!r.scheduled,
    enteredByEmail: (CU && CU.email) || '',
    enteredByName:  (CU && CU.displayName) || '',
    enteredAt: new Date().toISOString()
  };
}

// app record → SharePoint UPDATE payload (only the result fields change).
function recordUpdateToSP(r) {
  return {
    id: r.id,
    resultado: r.resultado || '',
    resultDate: r.resultDate || '',
    labNotes: r.labNotes || '',
    failedPathogens: Array.isArray(r.failedPathogens) ? r.failedPathogens.join(',') : (r.failedPathogens || ''),
    failedPathogensLabel: r.failedPathogensLabel || ''
  };
}

// app resolved-retest → SharePoint payload
function resolvedToSP(r) {
  return {
    originalId: r.originalId, sample: r.sample, department: r.planta,
    area: r.area || '', location: r.location || '',
    originalDate: r.originalDate || '', resolvedDate: r.resolvedDate || '',
    retestNum: r.retestNum || '', notes: r.notes || '',
    closedOnGenerate: !!r.closedOnGenerate,
    enteredByEmail: (CU && CU.email) || '',
    enteredByName:  (CU && CU.displayName) || '',
    enteredAt: new Date().toISOString()
  };
}

// ═══════════════════════════════════════════════════════════════
// PULL — bring SharePoint into the local cache
// ═══════════════════════════════════════════════════════════════

// Pull all Records → overwrite local cap_h. Returns true on success.
// Guarded: flush pending writes FIRST; if any remain unsynced, skip the
// overwrite so un-pushed local changes are never clobbered.
async function syncPullRecords() {
  if (!SYNC_ENABLED) return false;
  if (!(await flushOutbox())) { console.warn('[sync] pull Records skipped — pending local writes'); return false; }
  const data = await _spPost('recordsRead', {});
  const rows = Array.isArray(data) ? data : (data && data.value) || [];
  const recs = rows.map(spToRecord).filter(r => r.id);
  SH(recs);
  return true;
}

// ═══════════════════════════════════════════════════════════════
// PUSH — send local changes to SharePoint
// ═══════════════════════════════════════════════════════════════

// All pushes ENQUEUE (durable) then trigger a flush. The payload is a mapped
// snapshot taken now, so audit fields (who/when) reflect the action time even
// if it flushes later. Never throws — pending state is shown via the badge.
function syncPushRecords(recs) {
  if (!SYNC_ENABLED || !recs || !recs.length) return Promise.resolve();
  outboxAdd('recordsWrite', { list: 'Records', action: 'create', items: recs.map(recordToSP) });
  return flushOutbox();
}

function syncUpdateRecord(rec) {
  if (!SYNC_ENABLED || !rec) return Promise.resolve();
  outboxAdd('recordsUpdate', { list: 'Records', action: 'update', items: [recordUpdateToSP(rec)] });
  return flushOutbox();
}

function syncPushResolved(resolvedItems) {
  if (!SYNC_ENABLED || !resolvedItems || !resolvedItems.length) return Promise.resolve();
  outboxAdd('resolvedWrite', { list: 'ResolvedRetests', action: 'create', items: resolvedItems.map(resolvedToSP) });
  return flushOutbox();
}

// SharePoint ResolvedRetests item → app resolved entry (READ).
function spToResolved(it) {
  return {
    originalId:       Number(_pick(it, 'originalId', 'OriginalId')) || 0,
    sample:           Number(_pick(it, 'sample', 'Sample')) || 0,
    planta:           _val(_pick(it, 'Departament', 'department', 'planta')) || '',
    area:             _pick(it, 'Area', 'area') || '',
    location:         _pick(it, 'Location', 'location') || '',
    originalDate:     _pick(it, 'originalDate', 'OriginalDate') || '',
    resolvedDate:     _pick(it, 'resolvedDate', 'ResolvedDate') || '',
    retestNum:        _pick(it, 'retestNum', 'RetestNum') || '',
    notes:            _pick(it, 'notes', 'Notes') || '',
    closedOnGenerate: !!_pick(it, 'closedOnGenerate', 'ClosedOnGenerate'),
    enteredByEmail:   _pick(it, 'enteredByEmail', 'EnteredByEmail') || '',
    enteredByName:    _pick(it, 'enteredByName', 'EnteredByName') || '',
    enteredAt:        _pick(it, 'enteredAt', 'EnteredAt') || ''
  };
}

// Pull all ResolvedRetests → overwrite local cap_rv. Returns true on success.
// Without this, resolved/closed rounds live only in the session that created
// them: on the next login the anchoring entries vanish, closed positives
// resurface as "Generate retests", and their retests become orphaned.
async function syncPullResolved() {
  if (!SYNC_ENABLED) return false;
  if (!(await flushOutbox())) { console.warn('[sync] pull Resolved skipped — pending local writes'); return false; }
  const data = await _spPost('resolvedRead', {});
  const rows = Array.isArray(data) ? data : (data && data.value) || [];
  const recs = rows.map(spToResolved).filter(r => r.originalId);
  SRV(recs);
  return true;
}

// ═══════════════════════════════════════════════════════════════
// SUBMISSIONS — audit log of lab forms filled / sent (source of truth
// = SharePoint `Submissions`; the labform flow writes the row).
// ═══════════════════════════════════════════════════════════════

// SharePoint Submissions item → app submission. Text columns → simple reads.
function spToSubmission(it) {
  return {
    building:        _val(_pick(it, 'building', 'Building', 'Departament', 'department')) || '',
    sample:          _pick(it, 'sample', 'Sample') || '',
    type:            _pick(it, 'type', 'Type', 'TypeForm') || 'Generator',
    retestNum:       _pick(it, 'retestNum', 'RetestNum') || '',
    status:          _val(_pick(it, 'status', 'Status')) || 'Generated',
    fileName:        _pick(it, 'fileName', 'FileName') || '',
    collectionDate:  _pick(it, 'collectionDate', 'CollectionDate') || '',
    submittedByEmail:_pick(it, 'submittedByEmail', 'SubmittedByEmail') || '',
    submittedByName: _pick(it, 'submittedByName', 'SubmittedByName') || '',
    submittedAt:     _pick(it, 'submittedAt', 'SubmittedAt') || ''
  };
}

// Pull all Submissions → local cache (cap_submissions). Returns true on success.
async function syncPullSubmissions() {
  if (!SYNC_ENABLED) return false;
  const data = await _spPost('submissionsRead', {});
  const rows = Array.isArray(data) ? data : (data && data.value) || [];
  const recs = rows.map(spToSubmission).filter(r => r.fileName || r.sample);
  localStorage.setItem('cap_submissions', JSON.stringify(recs));
  return true;
}

const getSubmissions = () => JSON.parse(localStorage.getItem('cap_submissions') || '[]');

// ═══════════════════════════════════════════════════════════════
// RETEST PHOTOS — evidence images attached to a retest (uploaded from
// a phone via the QR capture page; the app reads them to display).
// ═══════════════════════════════════════════════════════════════
function spToPhoto(it) {
  const url = _pick(it, 'fileUrl', 'FileUrl');
  return {
    retestId:   String(_pick(it, 'retestId', 'RetestId') || ''),
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

// ═══════════════════════════════════════════════════════════════
// MASTER POINTS — the full sampling catalog lives in SharePoint
// ═══════════════════════════════════════════════════════════════

// SharePoint MasterPoints item → app point
function spToPoint(it) {
  return {
    plant:    _val(_pick(it, 'Departament', 'department', 'plant')) || '',
    sample:   Number(_pick(it, 'sample', 'Sample')) || 0,
    zone:     Number(_pick(it, 'zone', 'Zone')) || 0,
    area:     _pick(it, 'Area', 'area') || '',
    line:     _pick(it, 'Line', 'line') || 'N/A',
    location: _pick(it, 'Location', 'location') || '',
    active:   _pick(it, 'active', 'Active') !== false
  };
}

// app point → SharePoint MasterPoints payload
function pointToSP(p, isCreate) {
  const o = {
    department: p.plant || p.planta, sample: p.sample, zone: p.zone,
    area: p.area || '', line: p.line || '', location: p.location || '',
    active: p.active !== false
  };
  if (isCreate) {
    o.enteredByEmail = (CU && CU.email) || '';
    o.enteredByName  = (CU && CU.displayName) || '';
    o.enteredAt = new Date().toISOString();
  }
  return o;
}

// Pull the whole catalog → local cache (cap_masterpoints).
async function syncPullMasterPoints() {
  if (!SYNC_ENABLED) return false;
  if (!(await flushOutbox())) { console.warn('[sync] pull MasterPoints skipped — pending local writes'); return false; }
  const data = await _spPost('masterPointsRead', {});
  const rows = Array.isArray(data) ? data : (data && data.value) || [];
  const pts = rows.map(spToPoint).filter(p => p.sample);
  localStorage.setItem('cap_masterpoints', JSON.stringify(pts));
  return true;
}

const getMasterPoints = () => JSON.parse(localStorage.getItem('cap_masterpoints') || '[]');

function syncPushPoint(point) {      // create a new point
  if (!SYNC_ENABLED || !point) return Promise.resolve();
  outboxAdd('masterPointsWrite', { list: 'MasterPoints', action: 'create', items: [pointToSP(point, true)] });
  return flushOutbox();
}

function syncUpdatePoint(point) {    // update by department + sample (edit / activate / deactivate)
  if (!SYNC_ENABLED || !point) return Promise.resolve();
  outboxAdd('masterPointsUpdate', { list: 'MasterPoints', action: 'update', items: [pointToSP(point, false)] });
  return flushOutbox();
}

// Fire-and-forget wrapper: never let a sync failure break the local flow.
function syncSafe(promiseFactory, label) {
  Promise.resolve()
    .then(promiseFactory)
    .catch(err => {
      console.warn('[sync] ' + (label || '') + ' failed:', err);
      toast('Saved locally — SharePoint sync failed', 'error');
    });
}
