// ═══════════════════════════════════════════════════════════════
// BACKUP & RESTORE — the records that live ONLY in this browser
// (until the new backend exists): CAPAs, program CAPAs, the edited EMP
// program (lab, training, training forms, change log), management
// reviews and the lab-form "sent" flags. Everything else comes from
// SharePoint and is not part of the backup.
// Export → one JSON file. Import → MERGE (default: nothing local is
// lost, the newer version of each record wins) or REPLACE.
// ═══════════════════════════════════════════════════════════════

const BACKUP_KEYS = {
  cap_capa:         'CAPAs on positive results',
  cap_capa_prog:    'Program deviation CAPAs',
  cap_emp:          'EMP program (lab, training, training forms, change log)',
  cap_mgmt_reviews: 'Management reviews',
  cap_labsent:      'Lab form sent / filled status'
};
const BACKUP_LAST_KEY = 'cap_backup_last';

const _bkRead = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const _bkWrite = (k, v) => { localStorage.setItem(k, JSON.stringify(v)); if (typeof storeSaved === 'function') storeSaved(k); };

// What is in each section, for the summary lines
function _bkCount(k, v) {
  if (!v) return 0;
  if (k === 'cap_emp') return (v.training || []).length + (v.trainingForms || []).length + (v.changeLog || []).length + (v.lab || v.program ? 1 : 0);
  return Array.isArray(v) ? v.length : Object.keys(v).length;
}
function _bkSummary(data) {
  const e = data.cap_emp || {};
  return [
    ['CAPAs on positives', Object.keys(data.cap_capa || {}).length],
    ['Program CAPAs', (data.cap_capa_prog || []).length],
    ['Management reviews', (data.cap_mgmt_reviews || []).length],
    ['Training records', (e.training || []).length],
    ['Training forms issued', (e.trainingForms || []).length],
    ['EMP changes logged', (e.changeLog || []).length]
  ];
}
function backupHasLocalData() { return Object.keys(BACKUP_KEYS).some(k => _bkCount(k, _bkRead(k)) > 0); }

// ── Export ─────────────────────────────────────────────────────
function exportBackup() {
  const data = {};
  Object.keys(BACKUP_KEYS).forEach(k => { const v = _bkRead(k); if (v != null) data[k] = v; });
  const payload = { app: 'EnviroTrack', kind: 'local-records-backup', version: 1,
    exportedAt: new Date().toISOString(), exportedBy: (CU && (CU.displayName || CU.email)) || '', data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'EnviroTrack backup ' + todayLocal() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  localStorage.setItem(BACKUP_LAST_KEY, new Date().toISOString());
  toast('Backup downloaded — keep it in a safe shared folder', 'success');
  renderBackupModal();
  if (typeof refreshDashboard === 'function') refreshDashboard();
}

// ── Merge helpers (newer record wins, nothing local is dropped) ──
const _newer = (a, b) => String((b && (b.updatedAt || b.at || b.issuedAt)) || '') > String((a && (a.updatedAt || a.at || a.issuedAt)) || '') ? b : a;
function _mergeById(cur, inc, idOf) {
  const map = new Map((cur || []).map(x => [idOf(x), x]));
  (inc || []).forEach(x => { const id = idOf(x); map.set(id, map.has(id) ? _newer(map.get(id), x) : x); });
  return [...map.values()];
}
function _mergeObj(cur, inc) {
  const out = Object.assign({}, cur || {});
  Object.entries(inc || {}).forEach(([k, v]) => { out[k] = out[k] ? _newer(out[k], v) : v; });
  return out;
}
function _mergeEmp(cur, inc) {
  cur = cur || {}; inc = inc || {};
  const out = Object.assign({}, inc, cur);   // local scalar sections win when both exist
  out.training = _mergeById(cur.training, inc.training, t => (t.formNo || '') + '|' + t.name + '|' + t.date);
  // a training form that was registered / voided on either side stays that way
  out.trainingForms = _mergeById(cur.trainingForms, inc.trainingForms, f => f.no).map(f => {
    const o = [...(cur.trainingForms || []), ...(inc.trainingForms || [])].filter(x => x.no === f.no);
    return Object.assign({}, f, ...o.filter(x => x.usedAt || x.voidedAt).map(x => ({ usedAt: x.usedAt || f.usedAt, usedBy: x.usedBy || f.usedBy, voidedAt: x.voidedAt || f.voidedAt, voidReason: x.voidReason || f.voidReason })));
  });
  out.changeLog = _mergeById(cur.changeLog, inc.changeLog, c => c.at + '|' + c.section).sort((a, b) => b.at.localeCompare(a.at));
  return out;
}
function _mergeKey(k, cur, inc) {
  if (k === 'cap_capa') return _mergeObj(cur, inc);
  if (k === 'cap_capa_prog') return _mergeById(cur, inc, c => c.no);
  if (k === 'cap_mgmt_reviews') return _mergeById(cur, inc, r => r.id);
  if (k === 'cap_emp') return _mergeEmp(cur, inc);
  if (k === 'cap_labsent') {   // 'sent' beats 'filled'
    const out = Object.assign({}, inc || {}, cur || {});
    Object.entries(inc || {}).forEach(([id, v]) => { if (v && v.status === 'sent') out[id] = v; });
    return out;
  }
  return inc;
}

// ── Import ─────────────────────────────────────────────────────
let BACKUP_PENDING = null;

function backupFilePicked(input) {
  const f = input.files && input.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const p = JSON.parse(rd.result);
      if (!p || p.app !== 'EnviroTrack' || p.kind !== 'local-records-backup' || !p.data) throw new Error('not an EnviroTrack backup');
      BACKUP_PENDING = p;
      renderBackupModal();
    } catch (e) { toast('This file is not an EnviroTrack backup', 'error'); }
    input.value = '';
  };
  rd.readAsText(f);
}

function applyBackup(mode) {
  if (!BACKUP_PENDING || !empCanEdit()) return;
  if (mode === 'replace' && !confirm('Replace ALL local CAPAs, EMP data, training and management reviews with the backup?\nRecords that are only in this browser and not in the backup will be lost.')) return;
  Object.keys(BACKUP_KEYS).forEach(k => {
    if (!(k in BACKUP_PENDING.data)) return;
    const inc = BACKUP_PENDING.data[k];
    _bkWrite(k, mode === 'replace' ? inc : _mergeKey(k, _bkRead(k), inc));
  });
  const from = BACKUP_PENDING.exportedAt;
  BACKUP_PENDING = null;
  toast('Backup ' + (mode === 'replace' ? 'restored' : 'merged') + ' — from ' + new Date(from).toLocaleString('en-US'), 'success');
  renderBackupModal();
  if (typeof refreshDashboard === 'function') refreshDashboard();
  if (typeof renderEMPConfig === 'function') renderEMPConfig();
}

// ── Modal ──────────────────────────────────────────────────────
function openBackupModal() { BACKUP_PENDING = null; renderBackupModal(); document.getElementById('backupModal').classList.add('open'); }
function closeBackupModal() { BACKUP_PENDING = null; document.getElementById('backupModal').classList.remove('open'); }

function renderBackupModal() {
  const host = document.getElementById('backupModalBody'); if (!host) return;
  const admin = empCanEdit();
  const local = {}; Object.keys(BACKUP_KEYS).forEach(k => { local[k] = _bkRead(k); });
  const last = localStorage.getItem(BACKUP_LAST_KEY);
  const outbox = (() => { try { return (JSON.parse(localStorage.getItem('cap_outbox') || '[]') || []).length; } catch (e) { return 0; } })();
  const rows = (s, t) => '<div class="mr-inputs" style="grid-template-columns:1fr">' + s.map(([k, v]) => '<div><span>' + esc(k) + '</span><strong>' + v + '</strong></div>').join('') + '</div>';

  host.innerHTML =
    '<h3 style="margin:0 0 4px">Backup &amp; restore</h3>' +
    '<p class="vec-help">CAPAs, EMP program edits, training and management reviews are stored <strong>only in this browser</strong> until the new backend is live. ' +
      'Download a backup regularly and keep it in a shared folder; restore it here on another computer or after clearing the browser.</p>' +
    '<div class="ph-sec">In this browser</div>' + rows(_bkSummary(local)) +
    '<p class="vec-help" style="margin-top:8px">' + (last ? 'Last backup: ' + esc(new Date(last).toLocaleString('en-US')) + '.' : '<span style="color:var(--yellow);font-weight:600">No backup downloaded from this browser yet.</span>') +
      (outbox ? ' <span style="color:var(--yellow);font-weight:600">' + outbox + ' change(s) are still waiting to sync to SharePoint — those sync on their own and are not part of this backup.</span>' : '') + '</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' +
      '<button class="btn btn-primary btn-sm" onclick="exportBackup()">Download backup</button>' +
      (admin ? '<label class="btn btn-outline btn-sm" style="cursor:pointer">Restore from file…<input type="file" accept=".json,application/json" style="display:none" onchange="backupFilePicked(this)"></label>' : '') +
    '</div>' +
    (BACKUP_PENDING
      ? '<div class="ph-sec">Backup file — ' + esc(new Date(BACKUP_PENDING.exportedAt).toLocaleString('en-US')) + (BACKUP_PENDING.exportedBy ? ' by ' + esc(BACKUP_PENDING.exportedBy) : '') + '</div>' +
        rows(_bkSummary(BACKUP_PENDING.data)) +
        '<p class="vec-help" style="margin-top:8px"><strong>Merge</strong> adds what is missing and keeps the newer version of each record — nothing in this browser is lost. <strong>Replace</strong> overwrites this browser with the file.</p>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="applyBackup(\'replace\')">Replace</button>' +
          '<button class="btn btn-primary btn-sm" onclick="applyBackup(\'merge\')">Merge into this browser</button></div>'
      : '') +
    '<div class="modal-actions"><button class="btn btn-outline" onclick="closeBackupModal()">Close</button></div>';
}
