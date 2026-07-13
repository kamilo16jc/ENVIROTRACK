// ═══════════════════════════════════════════════════════════════
// LAB SUBMISSIONS — audit log of every lab form the app produced.
// Each time a form is filled ("Generated") or sent ("Sent to lab"),
// the labform flow writes one row to the SharePoint `Submissions`
// list (who / when / status / building / sample / retest). This view
// reads that list (via syncPullSubmissions) and displays it.
// The list is the source of truth — cap_submissions is only a cache.
// ═══════════════════════════════════════════════════════════════

function loadSubmissions() {
  const all = getSubmissions();

  // ── Filters ──────────────────────────────────────────────────
  const fB = (document.getElementById('subBuilding') || {}).value || '';
  const fS = (document.getElementById('subStatus')   || {}).value || '';
  const fT = (document.getElementById('subType')     || {}).value || '';
  const q  = ((document.getElementById('subSearch')  || {}).value || '').trim().toLowerCase();

  let rows = all.slice().sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  if (fB) rows = rows.filter(r => r.building === fB);
  if (fS) rows = rows.filter(r => r.status === fS);
  if (fT) rows = rows.filter(r => r.type === fT);
  if (q)  rows = rows.filter(r =>
    String(r.sample).toLowerCase().includes(q) ||
    (r.fileName || '').toLowerCase().includes(q) ||
    (r.submittedByName || '').toLowerCase().includes(q) ||
    (r.submittedByEmail || '').toLowerCase().includes(q));

  // ── Counters ─────────────────────────────────────────────────
  const sent = all.filter(r => r.status === 'Sent to lab').length;
  const gen  = all.filter(r => r.status === 'Generated').length;
  setTxt('subCountTotal', all.length);
  setTxt('subCountSent',  sent);
  setTxt('subCountGen',   gen);

  // ── Table ────────────────────────────────────────────────────
  const tbody = document.getElementById('submissionsList');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray-500);padding:40px">' +
      '<svg class="ln ico-inline" width="15" height="15" viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9 22 2z"/></svg>' +
      (all.length ? 'No submissions match the filters' : 'No lab submissions yet') + '</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const isSent = r.status === 'Sent to lab';
    const badge = isSent
      ? '<span class="badge badge-green"><svg class="ln ico-inline" width="11" height="11" viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9 22 2z"/></svg>Sent to lab</span>'
      : '<span class="badge badge-gray"><svg class="ln ico-inline" width="11" height="11" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Generated</span>';
    const typeLabel = r.type === 'Retest'
      ? 'Retest' + (r.retestNum ? ' #' + r.retestNum : '')
      : 'Generator';
    const who = isSent
      ? (esc(r.submittedByName || r.submittedByEmail || '—'))
      : '<span style="color:var(--gray-400)">—</span>';
    return '<tr>' +
      '<td style="font-size:12px;white-space:nowrap">' + fmtSubDate(r.submittedAt) + '</td>' +
      '<td style="text-align:center"><span class="badge badge-gray">' + esc(r.building) + '</span></td>' +
      '<td style="font-weight:700">' + esc(String(r.sample || '—')) + '</td>' +
      '<td style="font-size:12px">' + typeLabel + '</td>' +
      '<td style="text-align:center">' + badge + '</td>' +
      '<td style="font-size:12px">' + who + '</td>' +
      '<td style="font-size:11px;color:var(--gray-500);max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(r.fileName || '') + '">' + esc(r.fileName || '—') + '</td>' +
      '</tr>';
  }).join('');
}

// Pretty date for the submittedAt ISO timestamp.
function fmtSubDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
         ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function setTxt(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

// Pull the latest submissions from SharePoint, then re-render.
function refreshSubmissions() {
  syncSafe(() => syncPullSubmissions().then(loadSubmissions), 'pull submissions');
}
