// ═══════════════════════════════════════════════════════════════
// SYNC — SharePoint bridge (via Power Automate HTTP flows)
// SharePoint is the source of truth; localStorage is a local cache.
//   · Before generating tests → PULL Records (fresh anti-repetition data)
//   · On save / result / retests / master → PUSH to SharePoint
// The flow URLs below are SECRET. They stay LOCAL for now; before pushing
// to GitHub they must be hidden behind the Firebase Cloud Function.
// ═══════════════════════════════════════════════════════════════

// ── Flow URLs — PASTE YOUR 7 URLs HERE (local only, do NOT commit) ──
const SYNC_URLS = {
  recordsWrite:  'https://REMOVED',
  recordsRead:   'https://REMOVED',
  recordsUpdate: 'https://REMOVED',
  resolvedWrite: 'https://REMOVED',
  resolvedRead:  'https://REMOVED',
  masterWrite:   'https://REMOVED',
  masterRead:    'https://REMOVED',
  masterPointsRead:   'https://REMOVED',   // EnviroTrack_MasterPoints_Read
  masterPointsWrite:  'https://REMOVED',
  masterPointsUpdate: 'https://REMOVED',
};

// Master switch — if any URL is missing, sync is skipped and the app
// works purely on localStorage (offline-friendly, no errors thrown).
const SYNC_ON = () => Object.values(SYNC_URLS).every(Boolean);

// ── Low-level POST helper ──────────────────────────────────────
async function _spPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error('Flow HTTP ' + res.status);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
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
    scheduled:  !!_pick(it, 'scheduled', 'Scheduled')
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

// master change → SharePoint payload
function masterChangeToSP(action, p) {
  return {
    action, department: p.plant || p.planta, sample: p.sample,
    zone: p.zone || 0, area: p.area || '', line: p.line || '',
    location: p.location || '', custom: !!p.custom,
    enteredByEmail: (CU && CU.email) || '',
    enteredByName:  (CU && CU.displayName) || '',
    enteredAt: new Date().toISOString()
  };
}

// ═══════════════════════════════════════════════════════════════
// PULL — bring SharePoint into the local cache
// ═══════════════════════════════════════════════════════════════

// Pull all Records → overwrite local cap_h. Returns true on success.
async function syncPullRecords() {
  if (!SYNC_URLS.recordsRead) return false;
  const data = await _spPost(SYNC_URLS.recordsRead, {});
  const rows = Array.isArray(data) ? data : (data && data.value) || [];
  const recs = rows.map(spToRecord).filter(r => r.id);
  SH(recs);
  return true;
}

// ═══════════════════════════════════════════════════════════════
// PUSH — send local changes to SharePoint
// ═══════════════════════════════════════════════════════════════

async function syncPushRecords(recs) {
  if (!SYNC_URLS.recordsWrite || !recs || !recs.length) return;
  await _spPost(SYNC_URLS.recordsWrite, {
    list: 'Records', action: 'create', items: recs.map(recordToSP)
  });
}

async function syncUpdateRecord(rec) {
  if (!SYNC_URLS.recordsUpdate || !rec) return;
  await _spPost(SYNC_URLS.recordsUpdate, {
    list: 'Records', action: 'update', items: [recordUpdateToSP(rec)]
  });
}

async function syncPushResolved(resolvedItems) {
  if (!SYNC_URLS.resolvedWrite || !resolvedItems || !resolvedItems.length) return;
  await _spPost(SYNC_URLS.resolvedWrite, {
    list: 'ResolvedRetests', action: 'create', items: resolvedItems.map(resolvedToSP)
  });
}

async function syncPushMaster(action, point) {
  if (!SYNC_URLS.masterWrite || !point) return;
  await _spPost(SYNC_URLS.masterWrite, {
    list: 'MasterChanges', action: 'create', items: [masterChangeToSP(action, point)]
  });
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
  if (!SYNC_URLS.masterPointsRead) return false;
  const data = await _spPost(SYNC_URLS.masterPointsRead, {});
  const rows = Array.isArray(data) ? data : (data && data.value) || [];
  const pts = rows.map(spToPoint).filter(p => p.sample);
  localStorage.setItem('cap_masterpoints', JSON.stringify(pts));
  return true;
}

const getMasterPoints = () => JSON.parse(localStorage.getItem('cap_masterpoints') || '[]');

async function syncPushPoint(point) {      // create a new point
  if (!SYNC_URLS.masterPointsWrite || !point) return;
  await _spPost(SYNC_URLS.masterPointsWrite, {
    list: 'MasterPoints', action: 'create', items: [pointToSP(point, true)]
  });
}

async function syncUpdatePoint(point) {    // update by department + sample (edit / activate / deactivate)
  if (!SYNC_URLS.masterPointsUpdate || !point) return;
  await _spPost(SYNC_URLS.masterPointsUpdate, {
    list: 'MasterPoints', action: 'update', items: [pointToSP(point, false)]
  });
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
