// ═══════════════════════════════════════════════════════════════
// STORE — Firestore backend for the records that used to live only in
// each browser (Phase 1 of the backend): CAPAs, program CAPAs, the EMP
// program (lab, training, training forms, change log), management
// reviews and lab-form status.
//
// The app keeps reading its localStorage keys synchronously (getEMP(),
// getCapaAll()…). This layer keeps those keys in step with Firestore:
//   • live listeners (onSnapshot) rewrite each key whenever the server
//     changes — any device, any user — and the open views re-render;
//   • storeSaved(key) after a local save diffs the key against the last
//     server state and writes only the documents that changed.
// Firestore's offline cache queues writes made without connection.
// Numbers (TRN-…, CAPA-…) come from a server-side counter (transaction).
// ═══════════════════════════════════════════════════════════════

const _sid = s => String(s).replace(/[\/#?\[\]]/g, '_').replace(/^\.+$/, '_').slice(0, 900) || '_';
const _byId = (arr, idOf) => { const o = {}; (arr || []).forEach(x => { if (x) o[_sid(idOf(x))] = x; }); return o; };
const _vals = o => Object.values(o || {});

// key → which collections hold it, how to split it into docs and rebuild it
const STORE_MAP = {
  cap_capa: {
    cols: ['capa'],
    toDocs: v => ({ capa: _byId(Object.entries(v || {}).map(([k, d]) => Object.assign({}, d, { rootId: k })), d => d.rootId) }),
    fromDocs: c => { const o = {}; _vals(c.capa).forEach(d => { const x = Object.assign({}, d); const k = x.rootId; delete x.rootId; o[k] = x; }); return o; }
  },
  cap_capa_prog: {
    cols: ['programCapas'], keep: ['programCapas'],
    toDocs: v => ({ programCapas: _byId(v, c => c.no) }),
    fromDocs: c => _vals(c.programCapas).sort((a, b) => a.no.localeCompare(b.no))
  },
  cap_mgmt_reviews: {
    cols: ['mgmtReviews'], keep: ['mgmtReviews'],
    toDocs: v => ({ mgmtReviews: _byId(v, r => r.id) }),
    fromDocs: c => _vals(c.mgmtReviews).sort((a, b) => a.date.localeCompare(b.date))
  },
  cap_labsent: {
    cols: ['labStatus'],
    toDocs: v => ({ labStatus: _byId(Object.entries(v || {}).map(([k, d]) => Object.assign({}, d, { recId: k })), d => d.recId) }),
    fromDocs: c => { const o = {}; _vals(c.labStatus).forEach(d => { const x = Object.assign({}, d); const k = x.recId; delete x.recId; o[k] = x; }); return o; }
  },
  cap_emp: {
    cols: ['emp', 'training', 'trainingForms', 'empChangeLog'], keep: ['emp', 'trainingForms', 'empChangeLog'],
    toDocs: v => {
      v = v || {};
      const cfg = {};
      ['program', 'lab', 'forms', 'managementReview', 'annualProgramReview'].forEach(k => { if (v[k] !== undefined) cfg[k] = v[k]; });
      return {
        emp: Object.keys(cfg).length ? { config: cfg } : {},
        training: _byId(v.training, t => (t.formNo || 'noform') + '_' + t.name + '_' + t.date),
        trainingForms: _byId(v.trainingForms, f => f.no),
        empChangeLog: _byId(v.changeLog, c => c.at + '_' + c.section)
      };
    },
    fromDocs: c => Object.assign({}, (c.emp || {}).config || {}, {
      training: _vals(c.training).sort((a, b) => String(a.date).localeCompare(String(b.date))),
      trainingForms: _vals(c.trainingForms).sort((a, b) => String(a.issuedAt).localeCompare(String(b.issuedAt))),
      changeLog: _vals(c.empChangeLog).sort((a, b) => String(b.at).localeCompare(String(a.at)))
    })
  }
};

// Primary data — Firestore is the source of truth, SharePoint gets a copy from
// the spMirror Cloud Functions. Read through listeners into the same caches
// the app always used; written explicitly by the fs* helpers below (never
// diffed / bulk-migrated from the browser).
const _num = v => (v === '' || v == null) ? v : (Number.isFinite(Number(v)) ? Number(v) : v);
Object.assign(STORE_MAP, {
  cap_h: {
    cols: ['records'], primary: true,
    fromDocs: c => _vals(c.records).map(r => Object.assign({}, r, { id: _num(r.id), sample: _num(r.sample), zone: _num(r.zone), originalId: _num(r.originalId) || 0 }))
      .filter(r => r.id).sort((a, b) => a.id - b.id)
  },
  cap_rv: {
    cols: ['resolved'], primary: true,
    fromDocs: c => _vals(c.resolved).sort((a, b) => String(a.resolvedDate).localeCompare(String(b.resolvedDate)))
  },
  cap_submissions: {
    cols: ['submissions'], primary: true,
    fromDocs: c => _vals(c.submissions).sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)))
  },
  cap_masterpoints: {
    cols: ['masterPoints'], primary: true,
    fromDocs: c => _vals(c.masterPoints).map(p => Object.assign({}, p, { sample: _num(p.sample), zone: _num(p.zone) }))
  }
});

const STORE = { on: false, db: null, unsub: [], data: {}, ready: {}, migrated: false };
const _clean = o => JSON.parse(JSON.stringify(o));                       // drops undefined
const _strip = d => { const x = Object.assign({}, d); delete x._by; delete x._at; return x; };
// Order-insensitive comparison: Firestore returns map fields in its own order.
const _canon = v => Array.isArray(v) ? v.map(_canon)
  : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => { o[k] = _canon(v[k]); return o; }, {}) : v;
const _same = (a, b) => JSON.stringify(_canon(a)) === JSON.stringify(_canon(b));
const _keyReady = key => STORE_MAP[key].cols.every(c => STORE.ready[c]);
const _readLocal = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } };

function storeActive() { return STORE.on; }

// ── Start / stop with the signed-in session ────────────────────
function storeStart() {
  if (STORE.on || typeof firebase === 'undefined' || !firebase.firestore) return;
  STORE.db = firebase.firestore();
  STORE.on = true; STORE.data = {}; STORE.ready = {}; STORE.migrated = false;
  const cols = [...new Set(Object.values(STORE_MAP).flatMap(m => m.cols))];
  cols.forEach(col => {
    STORE.unsub.push(STORE.db.collection(col).onSnapshot(snap => {
      const docs = {};
      snap.forEach(d => { docs[d.id] = _strip(d.data()); });
      STORE.data[col] = docs; STORE.ready[col] = true;
      _storeApply(col);
    }, err => { console.warn('[store] ' + col, err && err.code); STORE.ready[col] = true; }));
  });
}
function storeStop() {
  STORE.unsub.forEach(u => { try { u(); } catch (e) {} });
  STORE.unsub = []; STORE.on = false; STORE.data = {}; STORE.ready = {};
}

// A collection changed on the server → rebuild the keys that use it.
function _storeApply(col) {
  Object.entries(STORE_MAP).forEach(([key, m]) => {
    if (!m.cols.includes(col) || !_keyReady(key)) return;
    const cols = {}; m.cols.forEach(c => { cols[c] = STORE.data[c] || {}; });
    localStorage.setItem(key, JSON.stringify(m.fromDocs(cols)));
  });
  if (!STORE.migrated && Object.keys(STORE_MAP).every(_keyReady)) { STORE.migrated = true; _storeFirstSync(); }
  _storeRerender();
}

// First connection of this browser: anything that only existed locally
// (before the backend) is merged up — newer version of each record wins.
function _storeFirstSync() {
  const flag = 'cap_store_uploaded';
  if (localStorage.getItem(flag) === '1') return;
  const pre = (() => { try { return JSON.parse(localStorage.getItem('cap_store_preload') || '{}'); } catch (e) { return {}; } })();
  Object.keys(STORE_MAP).forEach(key => {
    if (STORE_MAP[key].primary) return;
    const local = pre[key]; if (local == null) return;
    const remote = _readLocal(key);
    const merged = typeof _mergeKey === 'function' ? _mergeKey(key, remote, local) : local;
    if (_same(merged, remote)) return;
    localStorage.setItem(key, JSON.stringify(merged));
    storeSaved(key);
  });
  localStorage.setItem(flag, '1');
  localStorage.removeItem('cap_store_preload');
}

// Snapshot the pre-backend local records BEFORE the first listener
// overwrites them, so _storeFirstSync can upload them.
function storePreload() {
  if (localStorage.getItem('cap_store_uploaded') === '1' || localStorage.getItem('cap_store_preload')) return;
  const pre = {};
  Object.keys(STORE_MAP).forEach(k => { if (STORE_MAP[k].primary) return; const v = _readLocal(k); if (v != null) pre[k] = v; });
  localStorage.setItem('cap_store_preload', JSON.stringify(pre));
}

// ── Local save → write the changed documents ───────────────────
// Collections whose documents are only ever CREATED from the app: an
// existing doc is never re-sent (the audit trail is append-only in the rules).
const STORE_APPEND_ONLY = new Set(['empChangeLog']);

function storeSaved(key) {
  if (!STORE.on || !STORE_MAP[key] || STORE_MAP[key].primary) return Promise.resolve();
  const m = STORE_MAP[key];
  const want = m.toDocs(_readLocal(key));
  const by = (typeof fbAuth !== 'undefined' && fbAuth.currentUser && fbAuth.currentUser.email) || (typeof CU !== 'undefined' && CU && CU.email) || '';
  const ts = firebase.firestore.FieldValue.serverTimestamp();
  const commits = [];
  // One batch per collection, so a rejected write in one collection never
  // takes the others down with it.
  m.cols.forEach(col => {
    const have = STORE.data[col] || (STORE.data[col] = {}), next = want[col] || {};
    const ops = [];
    Object.entries(next).forEach(([id, doc]) => {
      const clean = _clean(doc);
      if (have[id] && (STORE_APPEND_ONLY.has(col) || _same(clean, have[id]))) return;
      ops.push(b => b.set(STORE.db.collection(col).doc(id), Object.assign({}, clean, { _by: by, _at: ts })));
      have[id] = clean;          // optimistic: the next save diffs against what was just sent
    });
    if (!(m.keep || []).includes(col))
      Object.keys(have).forEach(id => { if (!next[id]) { ops.push(b => b.delete(STORE.db.collection(col).doc(id))); delete have[id]; } });
    for (let i = 0; i < ops.length; i += 450) {
      const batch = STORE.db.batch(); ops.slice(i, i + 450).forEach(f => f(batch));
      commits.push(batch.commit().catch(e => { e._col = col; throw e; }));
    }
  });
  if (!commits.length) return Promise.resolve();
  return Promise.all(commits).catch(e => {
    console.warn('[store] write ' + key + (e && e._col ? ' / ' + e._col : ''), e);
    toast(e && e.code === 'permission-denied' ? 'Only administrators can change this record' : 'Could not save to the server — will retry when online', 'error');
  });
}

// Resolves when the first server snapshot of these collections has arrived
// (false after `ms` — the caller keeps working with the cached copy).
function storeWhenReady(cols, ms) {
  return new Promise(res => {
    const t0 = Date.now();
    (function wait() {
      if (STORE.on && cols.every(c => STORE.ready[c])) return res(true);
      if (Date.now() - t0 > (ms || 15000)) return res(false);
      setTimeout(wait, 100);
    })();
  });
}

// ── Writes to the primary collections ──────────────────────────
const RECORD_FIELDS = ['id', 'fecha', 'planta', 'by', 'sample', 'zone', 'area', 'line', 'location', 'ecoli', 'listeria', 'salmonella', 'saureus',
  'resultado', 'retestNum', 'labNotes', 'resultDate', 'failedPathogens', 'failedPathogensLabel', 'labResults', 'isRetest', 'originalId', 'scheduled',
  'enteredByEmail', 'enteredByName', 'enteredAt'];
const _recDoc = r => { const o = {}; RECORD_FIELDS.forEach(k => { if (r[k] !== undefined && r[k] !== null) o[k] = r[k]; }); return _clean(o); };
// The rules compare _by with the token's email, so use the Firebase session's.
const _fsWho = () => (typeof fbAuth !== 'undefined' && fbAuth.currentUser && fbAuth.currentUser.email) || (CU && CU.email) || '';
const _fsStamp = () => ({ _by: _fsWho(), _at: firebase.firestore.FieldValue.serverTimestamp() });
const _sameRec = (a, b) => a.fecha === b.fecha && a.planta === b.planta && String(a.sample) === String(b.sample) && String(a.retestNum || '') === String(b.retestNum || '');

// Reserve `n` consecutive test ids on the server (counters/records).
async function _allocIds(n, floor) {
  const ref = STORE.db.collection('counters').doc('records');
  return STORE.db.runTransaction(async tx => {
    const d = await tx.get(ref);
    const start = Math.max(d.exists ? (d.data().n || 0) : 0, floor || 0) + 1;
    tx.set(ref, Object.assign({ n: start + n - 1 }, _fsStamp()));
    return start;
  });
}

// New tests / retests / vector samples. Ids come from the server counter so
// two devices saving at once never collide; if the local id differs, the
// cached copy is renumbered. Offline → local ids, queued by Firestore.
async function fsCreateRecords(recs) {
  if (!recs || !recs.length) return;
  const now = new Date().toISOString();
  recs.forEach(r => { r.enteredByEmail = r.enteredByEmail || (CU && CU.email) || ''; r.enteredByName = r.enteredByName || (CU && CU.displayName) || ''; r.enteredAt = r.enteredAt || now; });
  try {
    const start = await _allocIds(recs.length, Math.min(...recs.map(r => Number(r.id) || 0)) - 1);
    const remap = {};
    recs.forEach((r, i) => { if (r.id !== start + i) { remap[r.id] = { to: start + i, rec: Object.assign({}, r) }; r.id = start + i; } });
    if (Object.keys(remap).length) {
      const h = GH();
      h.forEach(x => { const m = remap[x.id]; if (m && _sameRec(x, m.rec)) x.id = m.to; });
      SH(h);
    }
  } catch (e) { console.warn('[store] id counter unavailable — using local ids', e && e.code); }
  const b = STORE.db.batch();
  recs.forEach(r => b.set(STORE.db.collection('records').doc(String(r.id)), Object.assign(_recDoc(r), _fsStamp())));
  await b.commit();
}
async function fsUpdateRecord(rec) {
  if (!rec || !rec.id) return;
  await STORE.db.collection('records').doc(String(rec.id)).set(Object.assign(_recDoc(rec), _fsStamp()));
}
async function fsAddResolved(items) {
  const b = STORE.db.batch(), now = new Date().toISOString();
  (items || []).forEach((r, i) => {
    const doc = _clean(Object.assign({}, r, { enteredByEmail: r.enteredByEmail || (CU && CU.email) || '', enteredByName: r.enteredByName || (CU && CU.displayName) || '', enteredAt: r.enteredAt || now }));
    b.set(STORE.db.collection('resolved').doc(r.originalId + '_' + Date.now() + '_' + i), Object.assign(doc, _fsStamp()));
  });
  await b.commit();
}
async function fsSetPoint(p) {
  const doc = _clean({ plant: p.plant || p.planta, sample: Number(p.sample), zone: Number(p.zone), area: p.area || '', line: p.line || '', location: p.location || '', active: p.active !== false,
    enteredByEmail: p.enteredByEmail || (CU && CU.email) || '', enteredByName: p.enteredByName || (CU && CU.displayName) || '', enteredAt: p.enteredAt || new Date().toISOString() });
  await STORE.db.collection('masterPoints').doc(doc.plant + '_' + doc.sample).set(Object.assign(doc, _fsStamp()));
}
// Lab-form log entry (the labform flow writes the SharePoint copy itself).
async function fsAddSubmission(s) {
  if (!STORE.on) return;
  const doc = _clean({ building: s.building || '', sample: String(s.sample || ''), type: s.type || 'Generator', retestNum: String(s.retestNum || ''), status: s.status || 'Generated',
    fileName: s.fileName || '', collectionDate: s.collectionDate || '', submittedByEmail: s.submittedByEmail || '', submittedByName: s.submittedByName || '', submittedAt: s.submittedAt || new Date().toISOString() });
  await STORE.db.collection('submissions').add(Object.assign(doc, _fsStamp()));
}

// ── Server-side consecutive numbers ────────────────────────────
// prefix e.g. 'TRN-2026' → 'TRN-2026-004'. `floor` = highest number already
// in use (legacy records), so the counter never hands out a used number.
async function storeNextNumber(prefix, floor) {
  if (!STORE.on) throw new Error('offline-store');
  const ref = STORE.db.collection('counters').doc(_sid(prefix));
  const n = await STORE.db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    const next = Math.max(doc.exists ? (doc.data().n || 0) : 0, floor || 0) + 1;
    tx.set(ref, Object.assign({ n: next }, _fsStamp()));
    return next;
  });
  return prefix + '-' + String(n).padStart(3, '0');
}

// ── Confidential content (private/{id}) ────────────────────────
// Firestore when signed in; on localhost without a session, the git-ignored
// private-local/ folder (dev only — it does not exist on the public site).
const _privCache = {};
async function storePrivate(id) {
  if (_privCache[id]) return _privCache[id];
  let data = null;
  if (STORE.on) {
    const d = await STORE.db.collection('private').doc(id).get();
    data = d.exists ? _strip(d.data()) : null;
  } else if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    const file = id === 'facilityMap' ? 'facility-map.html' : id + '.json';
    const r = await fetch('private-local/' + file, { cache: 'no-store' });
    if (r.ok) data = id === 'facilityMap' ? { html: await r.text() } : await r.json();
  }
  if (data) _privCache[id] = data;
  return data;
}

// ── Re-render whatever is on screen (never while a form is open) ──
let _storeRT = null;
function _storeRerender() {
  clearTimeout(_storeRT);
  _storeRT = setTimeout(() => {
    if (document.querySelector('.modal-overlay.open')) { _storeRerender(); return; }   // wait until the user closes it
    const vis = id => { const el = document.getElementById(id); return el && el.offsetParent !== null; };
    try { if (typeof refreshDashboard === 'function') refreshDashboard(); } catch (e) {}
    try { if (vis('cfgPanel-emp') && typeof EMP_EDITING !== 'undefined' && !EMP_EDITING) renderEMPConfig(); } catch (e) {}
    try { if (vis('retestsList')) loadRetests(); } catch (e) {}
    try { if (vis('capaLogBody')) renderCapaLog(); } catch (e) {}
    try { if (vis('mrBody')) renderMgmtReviews(); } catch (e) {}
    try { if (typeof updateNotifBadge === 'function') updateNotifBadge(); } catch (e) {}
  }, 300);
}

// Follow the Firebase session
if (typeof fbAuth !== 'undefined') {
  fbAuth.onAuthStateChanged(u => { if (u) { storePreload(); storeStart(); } else storeStop(); });
}
