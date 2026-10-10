// ═══════════════════════════════════════════════════════════════
// MANAGEMENT REVIEW — Reports → SQF Compliance → Management Review.
// Records the periodic management review of the Environmental
// Monitoring Program (SQF 2.1.3 / 2.4.H): the review inputs are
// computed from EnviroTrack and FROZEN as a snapshot when the review
// is saved, so the minutes PDF always shows what was reviewed that day.
// Saving also updates Settings → EMP Program → "Last review".
// Stored in localStorage (cap_mgmt_reviews) until the new backend.
// ═══════════════════════════════════════════════════════════════

const MR_KEY = 'cap_mgmt_reviews';
let MR_EDIT = null;   // review id being edited, '' = new

function getMgmtReviews() { try { return JSON.parse(localStorage.getItem(MR_KEY) || '[]') || []; } catch (e) { return []; } }
function _saveMgmtReviews(l) { localStorage.setItem(MR_KEY, JSON.stringify(l)); if (typeof storeSaved === 'function') storeSaved(MR_KEY); }

// Review inputs for a period — the same numbers the Audit Package uses.
function mrSnapshot(from, to) {
  const d = auditPackData({ from, to, sel: 'all' });
  const capaDone = d.positives.filter(x => typeof capaComplete === 'function' && capaComplete(x.capa)).length;
  const presumptive = GH().filter(h => h.fecha >= from && h.fecha <= to && typeof labIsPresumptive === 'function' && labIsPresumptive(h)).length;
  return {
    takenAt: new Date().toISOString(),
    routineTests: d.base.length,
    byPlant: d.byPlant,
    positives: d.positives.length, openPositives: d.openPos, presumptive,
    positiveList: d.positives.map(x => ({ date: x.p.fecha, plant: x.p.planta, site: x.site, path: x.path, status: x.status })),
    capaComplete: capaDone,
    adherence: d.adherence, okWeeks: d.okWeeks, evalWeeks: d.evalWeeks.length,
    programCapas: d.progCapas.map(c => ({ no: c.no, title: c.title, status: c.status })),
    recurring: d.recurring.length, coverage: d.coverageRate,
    lab: d.emp.lab.name + ' · ' + d.emp.lab.body + ' ' + d.emp.lab.cert + ' · expires ' + _apFmt(d.emp.lab.expiry),
    labValid: !!(d.emp.lab.expiry && d.emp.lab.expiry >= todayLocal()),
    training: d.emp.training.length, sop: d.emp.sopVersion, readiness: d.readiness
  };
}

function _mrInputRows(s) {
  return [
    ['Routine tests', String(s.routineTests)],
    ['Positive results', s.positives + ' (' + s.openPositives + ' open / in follow-up)' + (s.presumptive ? ' · ' + s.presumptive + ' presumptive' : '')],
    ['CAPA documented (2.5.C.2)', s.capaComplete + ' of ' + s.positives + ' positives'],
    ['Weekly frequency adherence', s.adherence + '% (' + s.okWeeks + ' of ' + s.evalWeeks + ' building-weeks)'],
    ['Program deviations / CAPAs', s.programCapas.length ? s.programCapas.map(c => c.no + ' (' + c.status + ')').join(', ') : 'None'],
    ['Recurring positive sites', String(s.recurring)],
    ['MASTER coverage', s.coverage + '%'],
    ['Accredited laboratory', s.lab + (s.labValid ? '' : ' — EXPIRED')],
    ['Sampler training records', String(s.training)],
    ['SOP #2.4.H version', s.sop],
    ['Audit readiness', s.readiness + '%']
  ];
}

// ── Sub-tab ────────────────────────────────────────────────────
function renderMgmtReviews() {
  const host = document.getElementById('mrBody'); if (!host) return;
  const emp = getEMP(), list = getMgmtReviews().slice().sort((a, b) => b.date.localeCompare(a.date));
  const last = list[0];
  const next = (last && last.nextReview) || emp.managementReview.nextReview || '';
  const due = next && next < todayLocal();
  const icon = (fn, title, path) => '<button class="emp-edit" onclick="event.stopPropagation();' + fn + '" title="' + title + '" aria-label="' + title + '"><svg class="ln" width="14" height="14" viewBox="0 0 24 24">' + path + '</svg></button>';
  const IC_DL = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>';
  const rows = list.map(r => '<tr class="cl-row" onclick="openMgmtReview(\'' + r.id + '\')">' +
    '<td style="font-weight:600;white-space:nowrap">' + esc(_apFmt(r.date)) + '</td>' +
    '<td style="font-size:12px">' + esc(_apFmt(r.periodFrom)) + ' – ' + esc(_apFmt(r.periodTo)) + '</td>' +
    '<td style="font-size:12px">' + esc(r.attendees || '—') + '</td>' +
    '<td><span class="badge ' + (r.effective === 'Effective' ? 'badge-green' : r.effective ? 'badge-red' : 'badge-gray') + '">' + esc(r.effective || 'Not stated') + '</span></td>' +
    '<td style="text-align:center">' + (r.actions || []).length + '</td>' +
    '<td style="text-align:center">' + icon('mrPdf(\'' + r.id + '\')', 'Download minutes (PDF)', IC_DL) + '</td></tr>').join('')
    || '<tr><td colspan="6" class="cl-empty">No management reviews recorded yet</td></tr>';

  host.innerHTML =
    '<div class="card"><div class="card-title emp-head"><span>Management reviews</span>' +
      (empCanEdit() ? '<button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="openMgmtReview(\'\')">New review</button>' : '') + '</div>' +
      '<p class="vec-help" style="margin-top:-6px">' + (last ? 'Last review ' + esc(_apFmt(last.date)) + '. ' : 'No review on record. ') +
        (next ? '<span style="color:' + (due ? 'var(--red)' : 'var(--gray-500)') + ';font-weight:' + (due ? 700 : 400) + '">Next review ' + (due ? 'overdue — was due ' : 'due ') + esc(_apFmt(next)) + '.</span>' : '') +
        (emp.managementReview.cadence ? ' Cadence: ' + esc(emp.managementReview.cadence) + '.' : '') + '</p>' +
      '<div class="table-wrap"><table><thead><tr><th style="width:120px">Review date</th><th>Period reviewed</th><th>Attendees</th><th style="width:130px">Program</th><th style="width:70px;text-align:center">Actions</th><th style="width:60px"></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</div>';
}

// ── Review form ────────────────────────────────────────────────
function openMgmtReview(id) {
  const admin = empCanEdit();
  const list = getMgmtReviews();
  const today = todayLocal();
  const prev = list.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  const start = typeof SQF_PROGRAM_START !== 'undefined' ? SQF_PROGRAM_START : '';
  const r = id ? (list.find(x => x.id === id) || {}) : {
    date: today, periodFrom: prev ? prev.periodTo : start, periodTo: today,
    attendees: '', discussion: '', effective: '', effectiveNote: '', actions: [], nextReview: ''
  };
  MR_EDIT = id || '';
  const ro = admin ? '' : ' disabled';
  const inp = (id_, v, type, ph) => '<input type="' + (type || 'text') + '" id="' + id_ + '" class="vec-input" style="width:100%" value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '"' + ro + '>';
  const lbl = t => '<div class="modal-label">' + t + '</div>';
  const snap = r.snapshot || mrSnapshot(r.periodFrom, r.periodTo);

  document.getElementById('mrModalBody').innerHTML =
    '<h3 style="margin:0 0 4px">Management Review — Environmental Monitoring</h3>' +
    '<p class="vec-help">SQF 2.1.3 / 2.4.H. ' + (r.snapshot ? 'Review inputs frozen on ' + esc(new Date(r.snapshot.takenAt).toLocaleString('en-US')) + '.' : 'Review inputs are calculated from EnviroTrack and frozen when you save.') + '</p>' +
    '<div class="vec-row"><div>' + lbl('Review date *') + inp('mrDate', r.date, 'date') + '</div>' +
      '<div>' + lbl('Period reviewed — from') + inp('mrFrom', r.periodFrom, 'date') + '</div>' +
      '<div>' + lbl('to') + inp('mrTo', r.periodTo, 'date') + '</div>' +
      (admin && !r.snapshot ? '<div style="align-self:flex-end"><button class="btn btn-outline btn-sm" onclick="mrRecalc()">Update inputs</button></div>' : '') + '</div>' +
    '<div style="margin-top:8px">' + lbl('Attendees *') + inp('mrAtt', r.attendees, 'text', 'Names / roles — QA Manager, Plant Manager, Sanitation…') + '</div>' +
    '<div class="ph-sec" style="margin-top:14px">Review inputs</div>' +
    '<div id="mrInputs">' + mrInputsHtml(snap) + '</div>' +
    '<div style="margin-top:12px">' + lbl('Discussion &amp; conclusions *') + '<textarea id="mrDisc" class="capa-ta" rows="4" placeholder="Trends, positives and their root causes, adherence, resources, changes to the program…"' + ro + '>' + esc(r.discussion || '') + '</textarea></div>' +
    '<div class="vec-row"><div>' + lbl('Program effectiveness *') + '<select id="mrEff" class="vec-input"' + ro + '>' +
      ['', 'Effective', 'Effective with improvements', 'Not effective'].map(v => '<option value="' + v + '"' + ((r.effective || '') === v ? ' selected' : '') + '>' + (v || '— Select —') + '</option>').join('') + '</select></div>' +
      '<div style="flex:1">' + lbl('Comment') + inp('mrEffNote', r.effectiveNote) + '</div></div>' +
    '<div class="ph-sec" style="margin-top:14px">Actions</div>' +
    '<div id="mrActs">' + (r.actions || []).map(a => _mrActRow(a, ro)).join('') + '</div>' +
    (admin ? '<button class="tr-add" onclick="mrActAdd()">+ Add action</button>' : '') +
    '<div class="vec-row" style="margin-top:12px"><div>' + lbl('Next review') + inp('mrNext', r.nextReview, 'date') + '</div></div>' +
    '<div class="modal-actions"><button class="btn btn-outline" onclick="closeMgmtReview()">' + (admin ? 'Cancel' : 'Close') + '</button>' +
      (id ? '<button class="btn btn-outline" onclick="mrPdf(\'' + id + '\')">Download PDF</button>' : '') +
      (admin ? '<button class="btn btn-primary" onclick="saveMgmtReview()">Save review</button>' : '') + '</div>';
  document.getElementById('mrModal').classList.add('open');
}

function mrInputsHtml(s) {
  const plants = '<div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Building</th><th style="text-align:center">Tests</th><th style="text-align:center">Negative</th><th style="text-align:center">Positive</th><th style="text-align:center">Pending</th></tr></thead><tbody>' +
    s.byPlant.map(b => '<tr><td style="font-weight:600">' + esc(b.plant) + '</td><td style="text-align:center">' + b.tests + '</td><td style="text-align:center">' + b.neg + '</td><td style="text-align:center">' + b.pos + '</td><td style="text-align:center">' + b.pend + '</td></tr>').join('') + '</tbody></table></div>';
  return '<div class="mr-inputs">' + _mrInputRows(s).map(([k, v]) => '<div><span>' + esc(k) + '</span><strong>' + esc(v) + '</strong></div>').join('') + '</div>' + plants;
}

function mrRecalc() {
  const f = document.getElementById('mrFrom').value, t = document.getElementById('mrTo').value || todayLocal();
  document.getElementById('mrInputs').innerHTML = mrInputsHtml(mrSnapshot(f, t));
}

function _mrActRow(a, ro) {
  a = a || {};
  return '<div class="mr-act"><input type="text" class="vec-input mr-a" placeholder="Action" value="' + esc(a.action || '') + '"' + (ro || '') + '>' +
    '<input type="text" class="vec-input mr-o" placeholder="Owner" value="' + esc(a.owner || '') + '"' + (ro || '') + '>' +
    '<input type="date" class="vec-input mr-d" value="' + esc(a.due || '') + '"' + (ro || '') + '>' +
    (ro ? '' : '<button class="emp-edit" onclick="this.closest(\'.mr-act\').remove()" title="Remove" aria-label="Remove"><svg class="ln" width="14" height="14" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>') + '</div>';
}
function mrActAdd() { document.getElementById('mrActs').insertAdjacentHTML('beforeend', _mrActRow()); }
function closeMgmtReview() { document.getElementById('mrModal').classList.remove('open'); MR_EDIT = null; }

function saveMgmtReview() {
  if (!empCanEdit() || MR_EDIT === null) return;
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  const rec = {
    date: v('mrDate'), periodFrom: v('mrFrom'), periodTo: v('mrTo') || todayLocal(), attendees: v('mrAtt'),
    discussion: v('mrDisc'), effective: v('mrEff'), effectiveNote: v('mrEffNote'), nextReview: v('mrNext'),
    actions: [...document.querySelectorAll('#mrActs .mr-act')].map(r => ({ action: r.querySelector('.mr-a').value.trim(), owner: r.querySelector('.mr-o').value.trim(), due: r.querySelector('.mr-d').value })).filter(a => a.action),
    updatedAt: new Date().toISOString(), updatedBy: (CU && CU.displayName) || ''
  };
  if (!rec.date || !rec.attendees || !rec.discussion || !rec.effective) { toast('Review date, attendees, discussion and effectiveness are required', 'error'); return; }
  const list = getMgmtReviews();
  const prev = MR_EDIT ? list.find(x => x.id === MR_EDIT) : null;
  if (prev) Object.assign(prev, rec);
  else list.push(Object.assign(rec, { id: 'MR-' + Date.now(), createdBy: rec.updatedBy, snapshot: mrSnapshot(rec.periodFrom, rec.periodTo) }));
  _saveMgmtReviews(list);
  // Keep Settings → EMP Program in step (drives the audit readiness check)
  const latest = list.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  _saveEMP({ managementReview: Object.assign({}, getEMP().managementReview, { lastReview: latest.date, nextReview: latest.nextReview || '' }) });
  closeMgmtReview(); renderMgmtReviews();
  toast('Management review saved', 'success');
}

// ── Minutes PDF (flat: white, grays, black; logo in color) ─────
function mrPdf(id) {
  const r = getMgmtReviews().find(x => x.id === id); if (!r) return;
  if (!window.jspdf) { toast('PDF library not loaded', 'error'); return; }
  const s = r.snapshot || mrSnapshot(r.periodFrom, r.periodTo);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const W = 215.9, PH = doc.internal.pageSize.getHeight(), M = 14;
  const INK = [0, 0, 0], MUT = [110, 110, 110], LINE = [200, 200, 200], HEAD = [242, 242, 242];
  const safe = t => String(t == null ? '' : t).replace(/→/g, '->').replace(/[–—]/g, '-').replace(/·/g, '-');
  let y = 0;
  const need = h => { if (y + h > PH - 18) { doc.addPage(); y = 16; } };
  const section = t => { need(26); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK); doc.text(t, M, y + 4);
    doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.line(M, y + 5.6, W - M, y + 5.6); y += 9; };
  const para = t => { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(safe(t), W - M * 2); lines.forEach(l => { need(5); doc.text(l, M, y + 3.5); y += 4.6; }); y += 2; };
  const table = (head, body, opts) => { doc.autoTable(Object.assign({ startY: y, margin: { left: M, right: M, bottom: 18 }, head: head ? [head] : undefined,
    body: body.map(row => row.map(c => (c && typeof c === 'object') ? Object.assign({}, c, { content: safe(c.content) }) : safe(c))), theme: 'grid',
    styles: { fontSize: 8.2, cellPadding: 1.6, textColor: INK, lineColor: LINE, lineWidth: 0.2, overflow: 'linebreak' },
    headStyles: { fillColor: HEAD, textColor: INK, fontStyle: 'bold' } }, opts || {})); y = doc.lastAutoTable.finalY + 5; };

  try { doc.addImage(typeof pdfLogo === 'function' ? pdfLogo() : LOGO, 'JPEG', M, 9, 28, 14); } catch (e) {}
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUT);
  doc.text('Review date: ' + safe(_apFmt(r.date)), W - M, 17, { align: 'right' });
  doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.line(M, 26, W - M, 26);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...INK); doc.text('Management Review', M, 34.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUT);
  doc.text('Environmental Monitoring Program - SQF 2.1.3 / 2.4.H - SOP #2.4.H ' + safe(s.sop), M, 40);
  y = 45;
  table(null, [
    ['Review date', _apFmt(r.date), 'Period reviewed', _apFmt(r.periodFrom) + ' - ' + _apFmt(r.periodTo)],
    ['Attendees', { content: r.attendees || '', colSpan: 3 }],
  ], { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30, fillColor: HEAD }, 2: { fontStyle: 'bold', cellWidth: 32, fillColor: HEAD } } });

  section('1. Review inputs');
  table(['Item', 'Result'], _mrInputRows(s), { columnStyles: { 0: { cellWidth: 62, fontStyle: 'bold' } } });
  table(['Building', 'Routine tests', 'Negative', 'Positive', 'Pending'], s.byPlant.map(b => [b.plant, b.tests, b.neg, b.pos, b.pend]),
    { columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' } } });
  if (s.positiveList.length) table(['Date', 'Bldg', 'Site', 'Pathogen', 'Status'], s.positiveList.map(p => [_apFmt(p.date), p.plant, p.site, p.path, p.status]));

  section('2. Discussion & conclusions');
  para(r.discussion || '-');

  section('3. Program effectiveness');
  para((r.effective || 'Not stated') + (r.effectiveNote ? ' - ' + r.effectiveNote : ''));

  section('4. Actions');
  if ((r.actions || []).length) table(['#', 'Action', 'Owner', 'Due'], r.actions.map((a, i) => [i + 1, a.action, a.owner || '', a.due ? _apFmt(a.due) : '']),
    { columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 2: { cellWidth: 40 }, 3: { cellWidth: 28 } } });
  else para('No actions.');
  para('Next review: ' + (r.nextReview ? _apFmt(r.nextReview) : 'Not scheduled'));

  need(26); y += 10;
  const colW = (W - M * 2 - 10) / 2;
  ['QA Manager', 'Plant / Operations Manager'].forEach((lbl, i) => {
    const x = M + i * (colW + 10);
    doc.setDrawColor(...INK); doc.setLineWidth(0.25); doc.line(x, y, x + colW, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...INK); doc.text(lbl, x, y + 4);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUT); doc.text('Signature / Date', x, y + 8);
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, PH - 12, W - M, PH - 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUT);
    doc.text('Caputo Foods - EMP Management Review - Confidential', M, PH - 7.5);
    doc.text('Page ' + i + ' of ' + pages, W - M, PH - 7.5, { align: 'right' });
  }
  doc.save('Management Review ' + r.date + '.pdf');
  toast('Minutes downloaded', 'success');
}
