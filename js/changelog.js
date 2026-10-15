// ═══════════════════════════════════════════════════════════════
// RECORD CHANGE LOG — who changed a test record, when, what and why.
// Append-only (Firestore recordChanges: the rules allow create only).
// Logged: admin corrections, a recorded result changed, retest dates
// moved, generator site substitutions, bulk negatives and collection
// times. Shown per record in Test History and in the SQF Audit Package.
// ═══════════════════════════════════════════════════════════════
const RC_KEY = 'cap_rec_changes';
const RC_FIELDS = { fecha: 'Date', resultado: 'Result', failedPathogensLabel: 'Positive for', labNotes: 'Lab notes', zone: 'Zone',
  area: 'Area', location: 'Location', sample: 'Sample', prodStart: 'Production start', collTime: 'Collection time' };
const RC_ACTIONS = { correction: 'Admin correction', result: 'Result changed', reschedule: 'Retest date moved', override: 'Generator substitution',
  bulkNegative: 'Bulk negative', collTime: 'Collection time', void: 'Voided' };

function getRecordChanges() { try { return JSON.parse(localStorage.getItem(RC_KEY) || '[]') || []; } catch (e) { return []; } }
function recSnap(r) { const o = {}; Object.keys(RC_FIELDS).forEach(k => { o[k] = r && r[k] != null ? r[k] : ''; }); return o; }
const _rcKey = r => [r.planta, r.fecha, r.sample, r.retestNum || ''].join('|');

// before/after: recSnap() objects (or an explicit changes list via opts.changes)
function logRecordChange(rec, action, before, after, reason, opts) {
  opts = opts || {};
  const changes = opts.changes || Object.keys(RC_FIELDS)
    .filter(k => String(before[k] == null ? '' : before[k]) !== String(after[k] == null ? '' : after[k]))
    .map(k => ({ field: k, from: String(before[k] == null ? '' : before[k]).slice(0, 300), to: String(after[k] == null ? '' : after[k]).slice(0, 300) }));
  if (!changes.length && !opts.always) return null;
  const who = (typeof fbAuth !== 'undefined' && fbAuth.currentUser && fbAuth.currentUser.email) || (CU && CU.email) || '';
  const e = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    recordId: rec.id || 0, planta: rec.planta || '', sample: rec.sample || 0, recordDate: (opts.recordDate || rec.fecha || ''), retestNum: rec.retestNum || '',
    action, changes, reason: String(reason || '').slice(0, 500), samples: opts.samples || [],
    byEmail: who, byName: (CU && (CU.displayName || CU.email)) || '', at: new Date().toISOString()
  };
  const list = getRecordChanges(); list.push(e);
  localStorage.setItem(RC_KEY, JSON.stringify(list));
  if (typeof storeSaved === 'function') storeSaved(RC_KEY);
  return e;
}

// Changes of one record: by id, or by building+date+sample (entries logged before the server assigned the id).
function changesOf(rec) {
  const k = _rcKey(rec);
  return getRecordChanges().filter(e => (e.recordId && e.recordId === rec.id) || [e.planta, e.recordDate, e.sample, e.retestNum || ''].join('|') === k
      || (!e.sample && !rec.retestNum && e.planta === rec.planta && e.recordDate === rec.fecha))   // building + date entries (collection time)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
const rcFieldLabel = f => RC_FIELDS[f] || f;
const rcActionLabel = a => RC_ACTIONS[a] || a;
const rcWhen = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); };

function openRecordChanges(id) {
  const rec = GH().find(r => r.id === id); if (!rec) return;
  const list = changesOf(rec);
  document.getElementById('recChangesBody').innerHTML =
    '<h3><svg class="ln ico-inline" width="15" height="15" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/><polyline points="12 7 12 12 15 14"/></svg>Change history</h3>' +
    '<div class="lr-info"><strong>Sample #' + esc(rec.sample) + '</strong> · ' + esc(rec.planta) + (rec.retestNum ? ' · ' + esc(rec.retestNum) : '') + ' · ' + esc(rec.fecha) + '</div>' +
    (list.length ? list.map(e => '<div class="rc-entry"><div class="rc-head"><strong>' + esc(rcActionLabel(e.action)) + '</strong><span>' + esc(rcWhen(e.at)) + ' · ' + esc(e.byName || e.byEmail) + '</span></div>' +
      (e.changes || []).map(c => '<div class="rc-change">' + esc(rcFieldLabel(c.field)) + ': <s>' + esc(c.from || '—') + '</s> → <b>' + esc(c.to || '—') + '</b></div>').join('') +
      (e.reason ? '<div class="rc-reason">Reason: ' + esc(e.reason) + '</div>' : '') + '</div>').join('')
      : '<p class="vec-help">No changes recorded for this test.</p>') +
    '<div class="modal-actions"><button class="btn btn-outline" onclick="document.getElementById(\'recChangesModal\').classList.remove(\'open\')">Close</button></div>';
  document.getElementById('recChangesModal').classList.add('open');
}
