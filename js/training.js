// ═══════════════════════════════════════════════════════════════
// TRAINING FORMS — numbered, downloadable training records.
// An admin issues a form for one or more QA samplers (a session):
// it gets a consecutive number (TRN-<year>-<issuer initials>-<NNN>)
// and a PDF to complete and sign. Training can only be registered
// with a number that was issued, is not voided and has not been
// used, so every record maps to one signed paper form (SQF 2.4.H).
// Stored in cap_emp.trainingForms (localStorage) until the new
// backend exists — then the counter moves server-side and the
// issuer initials can be dropped from the number.
// ═══════════════════════════════════════════════════════════════

const TR_MAX_TRAINEES = 10;
const TR_TOPICS = [
  'EMP purpose and SQF 2.4.H requirements',
  'Sanitary zones 1-4 and site selection (MASTER sampling points)',
  'Timing: collect no sooner than 3-4 hours after production starts',
  'Aseptic technique: hand washing, sterile gloves, no contact with the sponge',
  'One sponge per site - never composite samples',
  'Swab ~6 in2 in two directions (horizontal and vertical)',
  'Sample labeling, sample ID and lab collection form',
  'Storage: refrigerate until lab pick-up; chain of custody to the accredited lab',
  'Positive results: 3 consecutive negative retests, vector sampling (max 5), CAPA form 2.5.C.2',
  'Recording in EnviroTrack: generated tests, results, retests'
];
const TR_PRACTICAL = [
  'Hand hygiene and glove use before sampling',
  'Opens the sponge bag aseptically',
  'Swabs the correct area in two directions',
  'Closes, labels and records the sample correctly',
  'Stores the sample refrigerated for lab pick-up'
];

// Forms issued before multi-trainee support stored a single name/role.
function _trNormalize(f) {
  if (!Array.isArray(f.trainees)) f.trainees = f.name ? [{ name: f.name, role: f.role || '' }] : [];
  delete f.name; delete f.role;
  return f;
}
function _trForms() { return getEMP().trainingForms.map(_trNormalize); }
function _trSaveForms(list) { _saveEMP({ trainingForms: list }); }
const _trNames = f => f.trainees.map(t => t.name).join(', ');

// Issuer initials keep numbers unique while each browser has its own counter.
function trInitials() {
  const src = String((CU && (CU.displayName || CU.email)) || 'QA').split('@')[0];
  const words = src.replace(/[^A-Za-z\s.]/g, ' ').split(/[\s.]+/).filter(Boolean);
  const ini = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || 'QA').slice(0, 2);
  return ini.toUpperCase();
}
// With the backend on, numbers come from the server counter (TRN-2026-004);
// without it (offline / local), the per-browser scheme with initials.
async function trAssignNo() {
  if (typeof storeActive === 'function' && storeActive()) {
    const prefix = 'TRN-' + todayLocal().slice(0, 4);
    const floor = _trForms().filter(f => new RegExp('^' + prefix + '-\\d+$').test(f.no))
      .reduce((m, f) => Math.max(m, parseInt(f.no.slice(prefix.length + 1), 10) || 0), 0);
    return storeNextNumber(prefix, floor);
  }
  return trNextNo();
}
function trNextNo() {
  const prefix = 'TRN-' + todayLocal().slice(0, 4) + '-' + trInitials() + '-';
  const max = _trForms().filter(f => f.no.startsWith(prefix))
    .reduce((m, f) => Math.max(m, parseInt(f.no.slice(prefix.length), 10) || 0), 0);
  return prefix + String(max + 1).padStart(3, '0');
}
const trNorm = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
function trStatus(f) { return f.voidedAt ? 'Voided' : f.usedAt ? 'Registered' : 'Pending'; }

// ── Card inside Settings → EMP Program ─────────────────────────
function trainingCardHtml(e, admin) {
  const fmt = typeof _empFmt === 'function' ? _empFmt : (d => d || '—');
  const icon = (fn, title, path) => '<button class="emp-edit" onclick="' + fn + '" title="' + title + '" aria-label="' + title + '"><svg class="ln" width="14" height="14" viewBox="0 0 24 24">' + path + '</svg></button>';
  const IC_DL = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>';
  const IC_TRASH = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>';
  const IC_VOID = '<circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/>';
  const mono = 'font-family:ui-monospace,Consolas,monospace;font-size:12px';

  const rows = e.training.map((t, i) =>
    '<tr><td>' + esc(t.name || '') + '</td><td>' + esc(t.role || '') + '</td><td>' + esc(fmt(t.date)) + '</td>' +
    '<td style="' + mono + '">' + esc(t.formNo || '—') + '</td>' +
    (admin ? '<td style="text-align:center">' + icon('trRemove(' + i + ')', 'Remove', IC_TRASH) + '</td>' : '') + '</tr>').join('')
    || '<tr><td colspan="' + (admin ? 5 : 4) + '" style="text-align:center;color:var(--gray-500);padding:18px">No training records</td></tr>';

  const register = admin
    ? '<div class="emp-add">' +
        '<input type="text" id="trNo" placeholder="Form number (TRN-…)" oninput="trHint()" style="text-transform:uppercase">' +
        '<input type="date" id="trDate" value="' + todayLocal() + '" title="Training date">' +
        '<button class="btn btn-primary btn-sm" onclick="trRegister()">Register</button>' +
      '</div><div id="trHint" class="tr-hint">Enter the number printed on the completed, signed training form.</div><div id="trPick"></div>'
    : '';

  const forms = _trForms().reverse();
  const formRows = forms.map(f => {
    const st = trStatus(f);
    const badge = st === 'Registered' ? 'badge-green' : st === 'Voided' ? 'badge-red' : 'badge-gray';
    const acts = icon('trDownload(\'' + f.no + '\')', 'Download form', IC_DL) +
      (st === 'Pending' ? ' ' + icon('trVoid(\'' + f.no + '\')', 'Void form', IC_VOID) : '');
    const who = f.trainees.length > 2 ? f.trainees.slice(0, 2).map(t => t.name).join(', ') + ' +' + (f.trainees.length - 2) : _trNames(f);
    return '<tr><td style="' + mono + ';font-weight:600">' + esc(f.no) + '</td>' +
      '<td title="' + esc(_trNames(f)) + '">' + esc(who) + '<div style="font-size:11px;color:var(--gray-500)">' + f.trainees.length + ' trainee' + (f.trainees.length === 1 ? '' : 's') + '</div></td>' +
      '<td style="font-size:12px">' + esc(fmt(todayLocal(new Date(f.issuedAt)))) + '<div style="font-size:11px;color:var(--gray-500)">' + esc(f.issuedBy || '') + '</div></td>' +
      '<td><span class="badge ' + badge + '">' + st + '</span>' + (f.usedAt ? '<div style="font-size:11px;color:var(--gray-500)">' + esc(fmt(todayLocal(new Date(f.usedAt)))) + '</div>' : '') + '</td>' +
      '<td style="white-space:nowrap;text-align:center">' + acts + '</td></tr>';
  }).join('');

  return '<div class="card"><div class="card-title emp-head"><span>Training</span>' +
      (admin ? '<button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="trIssueOpen()">New form</button>' : '') + '</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Trained on</th><th>Form No.</th>' + (admin ? '<th style="width:60px"></th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      register +
      (admin && forms.length
        ? '<div class="tr-sub">Issued forms</div><div class="table-wrap"><table><thead><tr><th>Form No.</th><th>Issued to</th><th>Issued</th><th>Status</th><th style="width:90px"></th></tr></thead><tbody>' + formRows + '</tbody></table></div>'
        : '') +
    '</div>';
}

// Live feedback while typing the form number; a valid form lists its
// trainees with checkboxes (uncheck anyone absent or not yet competent).
function trHint() {
  const el = document.getElementById('trHint'), pick = document.getElementById('trPick'); if (!el) return;
  const no = trNorm(document.getElementById('trNo').value);
  pick.innerHTML = '';
  if (!no) { el.className = 'tr-hint'; el.textContent = 'Enter the number printed on the completed, signed training form.'; return; }
  const f = _trForms().find(x => trNorm(x.no) === no);
  const msg = !f ? ['bad', 'No form was issued with this number.']
    : f.voidedAt ? ['bad', 'This form was voided and cannot be used.']
    : f.usedAt ? ['bad', 'Already registered on ' + todayLocal(new Date(f.usedAt)) + ' — each form can be used once.']
    : ['ok', 'Valid form — select the trainees marked Competent on the signed form:'];
  el.className = 'tr-hint ' + msg[0]; el.textContent = msg[1];
  if (msg[0] === 'ok') pick.innerHTML = '<div class="tr-pick">' + f.trainees.map((t, i) =>
    '<label><input type="checkbox" class="tr-pick-cb" value="' + i + '" checked> ' + esc(t.name) + (t.role ? ' <span>' + esc(t.role) + '</span>' : '') + '</label>').join('') + '</div>';
}

function trRegister() {
  if (!empCanEdit()) return;
  const no = trNorm(document.getElementById('trNo').value);
  const date = document.getElementById('trDate').value || todayLocal();
  if (!no) { toast('Enter the training form number', 'error'); return; }
  const list = _trForms();
  const f = list.find(x => trNorm(x.no) === no);
  if (!f) { toast('Invalid form number — no form was issued with ' + no, 'error'); return; }
  if (f.voidedAt) { toast('Form ' + f.no + ' was voided', 'error'); return; }
  if (f.usedAt) { toast('Form ' + f.no + ' was already registered', 'error'); return; }
  if (date < todayLocal(new Date(f.issuedAt))) { toast('Training date cannot be before the form was issued (' + todayLocal(new Date(f.issuedAt)) + ')', 'error'); return; }
  const picked = [...document.querySelectorAll('.tr-pick-cb:checked')].map(c => f.trainees[+c.value]).filter(Boolean);
  if (!picked.length) { toast('Select at least one trainee', 'error'); return; }
  f.usedAt = new Date().toISOString(); f.usedBy = (CU && (CU.displayName || CU.email)) || '';
  f.registered = picked.map(t => t.name);
  const t = getEMP().training.slice();
  picked.forEach(p => t.push({ name: p.name, role: p.role, date, formNo: f.no, trainer: f.trainer }));
  const skipped = f.trainees.filter(x => !picked.includes(x)).map(x => x.name);
  _empLog('Training', [{ field: 'Registered', from: '', to: f.no + ' · ' + date + ' · ' + picked.map(p => p.name).join(', ') }]
    .concat(skipped.length ? [{ field: 'Not registered', from: '', to: skipped.join(', ') }] : []));
  _saveEMP({ training: t, trainingForms: list });
  toast('Training registered for ' + picked.length + ' trainee' + (picked.length === 1 ? '' : 's'), 'success'); renderEMPConfig();
}

// Removing a record; when no record of that form remains, the form
// returns to Pending so it can be registered again.
function trRemove(i) {
  if (!empCanEdit()) return;
  const t = getEMP().training.slice(); const r = t[i]; if (!r) return;
  const others = r.formNo ? t.filter((x, j) => j !== i && x.formNo === r.formNo).length : 0;
  if (!confirm('Remove training record for ' + r.name + '?' + (r.formNo && !others ? '\nForm ' + r.formNo + ' will return to Pending.' : ''))) return;
  t.splice(i, 1);
  const list = _trForms();
  const f = r.formNo && list.find(x => x.no === r.formNo);
  if (f && !others) { delete f.usedAt; delete f.usedBy; delete f.registered; }
  else if (f && Array.isArray(f.registered)) f.registered = f.registered.filter(n => n !== r.name);
  _empLog('Training', [{ field: 'Removed', from: r.name + (r.formNo ? ' · ' + r.formNo : '') + ' · ' + r.date, to: '' }]);
  _saveEMP({ training: t, trainingForms: list }); renderEMPConfig();
}

function trVoid(no) {
  if (!empCanEdit()) return;
  const list = _trForms(); const f = list.find(x => x.no === no);
  if (!f || f.usedAt || f.voidedAt) return;
  const why = prompt('Void form ' + no + ' (' + _trNames(f) + ').\nReason (lost, damaged, issued by mistake…):');
  if (why === null) return;
  f.voidedAt = new Date().toISOString(); f.voidReason = why.trim();
  _empLog('Training form', [{ field: 'Voided', from: no + ' · ' + _trNames(f), to: why.trim() || 'No reason given' }]);
  _trSaveForms(list); renderEMPConfig();
}

// ── Issue modal ────────────────────────────────────────────────
function _trTraineeRow(name, role) {
  return '<div class="tr-row"><input type="text" class="tr-in-name" placeholder="Name" value="' + esc(name || '') + '">' +
    '<input type="text" class="tr-in-role" placeholder="Role" value="' + esc(role || 'QA sampler') + '">' +
    '<button class="emp-edit" onclick="trRowRemove(this)" title="Remove" aria-label="Remove"><svg class="ln" width="14" height="14" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>';
}
function trRowAdd() {
  const box = document.getElementById('trRows');
  if (box.children.length >= TR_MAX_TRAINEES) { toast('Up to ' + TR_MAX_TRAINEES + ' trainees per form', 'error'); return; }
  box.insertAdjacentHTML('beforeend', _trTraineeRow());
  box.lastElementChild.querySelector('.tr-in-name').focus();
}
function trRowRemove(btn) {
  const box = document.getElementById('trRows');
  if (box.children.length > 1) btn.closest('.tr-row').remove();
  else box.querySelector('.tr-in-name').value = '';
}

function trIssueOpen() {
  if (!empCanEdit()) return;
  const me = (CU && CU.displayName) || '';
  document.getElementById('trainModalBody').innerHTML =
    '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:6px">' +
      '<h3 style="margin:0;font-size:18px;color:var(--gray-900)">New training form</h3>' +
      '<span class="tr-no">' + ((typeof storeActive === 'function' && storeActive()) ? 'Number assigned on issue' : esc(trNextNo())) + '</span></div>' +
    '<p class="vec-help">Print it, complete the session, collect signatures, then register the number to record the training.</p>' +
    '<div class="field" style="margin-bottom:6px"><label>Trainees *</label></div>' +
    '<div id="trRows">' + _trTraineeRow() + '</div>' +
    '<button class="tr-add" onclick="trRowAdd()">+ Add trainee</button>' +
    '<div class="field" style="margin:14px 0"><label>Trainer *</label><input type="text" id="trIssTrainer" value="' + esc(me) + '" style="width:100%"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-outline btn-sm" onclick="trIssueClose()">Cancel</button><button class="btn btn-primary btn-sm" onclick="trIssueConfirm()">Issue &amp; download</button></div>';
  document.getElementById('trainModal').classList.add('open');
  setTimeout(() => { const n = document.querySelector('#trRows .tr-in-name'); if (n) n.focus(); }, 50);
}
function trIssueClose() { document.getElementById('trainModal').classList.remove('open'); }

async function trIssueConfirm() {
  if (!empCanEdit()) return;
  const trainees = [...document.querySelectorAll('#trRows .tr-row')]
    .map(r => ({ name: r.querySelector('.tr-in-name').value.trim(), role: r.querySelector('.tr-in-role').value.trim() }))
    .filter(t => t.name);
  const trainer = (document.getElementById('trIssTrainer').value || '').trim();
  if (!trainees.length) { toast('Add at least one trainee', 'error'); return; }
  if (!trainer) { toast('Trainer is required', 'error'); return; }
  const dup = trainees.find((t, i) => trainees.findIndex(x => x.name.toLowerCase() === t.name.toLowerCase()) !== i);
  if (dup) { toast(dup.name + ' is listed twice', 'error'); return; }
  let no;
  try { no = await trAssignNo(); }
  catch (e) { toast('Could not get a form number from the server — check the connection and try again', 'error'); return; }
  const list = _trForms();
  const form = { no, trainees, trainer, sopVersion: getEMP().sopVersion,
                 issuedAt: new Date().toISOString(), issuedBy: (CU && (CU.displayName || CU.email)) || '' };
  list.push(form);
  _empLog('Training form', [{ field: 'Issued', from: '', to: form.no + ' · ' + _trNames(form) }]);
  _trSaveForms(list);
  trIssueClose(); renderEMPConfig();
  trPdf(form);
}

function trDownload(no) { const f = _trForms().find(x => x.no === no); if (f) trPdf(f); }

// ── PDF (flat: white, grays, black text) ───────────────────────
function trPdf(f) {
  if (!window.jspdf) { toast('PDF library not loaded', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const W = 215.9, PH = doc.internal.pageSize.getHeight(), M = 14;
  const INK = [0, 0, 0], MUT = [110, 110, 110], LINE = [190, 190, 190], HEAD = [242, 242, 242];
  const issued = new Date(f.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const box = (x, y) => { doc.setDrawColor(...INK); doc.setLineWidth(0.25); doc.rect(x, y, 3.4, 3.4); };
  const n = f.trainees.length;
  let y;

  const footer = () => {
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, PH - 14, W - M, PH - 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUT);
    doc.text('Register ' + f.no + ' in EnviroTrack (Settings > EMP Program > Training) once completed and signed. Each number can be registered once.', M, PH - 9.5);
  };
  const need = h => { if (y + h > PH - 18) { doc.addPage(); y = 16; } };

  // Header
  try { doc.addImage(typeof pdfLogo === 'function' ? pdfLogo() : LOGO, 'JPEG', M, 9, 28, 14); } catch (e) {}
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...INK);
  doc.text(f.no, W - M, 17, { align: 'right' });
  doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.line(M, 26, W - M, 26);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Training', M, 34.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUT);
  doc.text('Environmental Monitoring Program - SQF 2.4.H - SOP #2.4.H ' + String(f.sopVersion || '').replace(/·/g, '-'), M, 40);

  const section = t => { need(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK);
    doc.text(t, M, y + 4); doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.line(M, y + 5.6, W - M, y + 5.6); y += 8; };
  const tbl = opts => { doc.autoTable(Object.assign({ startY: y, margin: { left: M, right: M, bottom: 18 },
    styles: { fontSize: 8.2, cellPadding: 1.45, textColor: INK, lineColor: LINE, lineWidth: 0.2, overflow: 'linebreak' },
    headStyles: { fillColor: HEAD, textColor: INK, fontStyle: 'bold', lineColor: LINE, lineWidth: 0.2 } }, opts));
    y = doc.lastAutoTable.finalY + 4; };
  // empty checkbox drawn centered in cells whose raw value is the marker
  const CHK = '\u0000';
  const chkCell = { didParseCell: d => { if (d.cell.raw === CHK) d.cell.text = ['']; },
                    didDrawCell: d => { if (d.section === 'body' && d.cell.raw === CHK) box(d.cell.x + d.cell.width / 2 - 1.7, d.cell.y + d.cell.height / 2 - 1.7); } };

  // Session info
  y = 44;
  tbl({ theme: 'grid', body: [
      ['Trainer', f.trainer || '', 'Issued', issued + ' by ' + (f.issuedBy || '')],
      ['Training date', '', 'Building(s)', '1945  /  1935  /  1931E  /  1931W']
    ], columnStyles: { 0: { fontStyle: 'bold', cellWidth: 28, fillColor: HEAD }, 2: { fontStyle: 'bold', cellWidth: 26, fillColor: HEAD } } });

  section('1. Trainees');
  tbl(Object.assign({ head: [['#', 'Name', 'Role', 'Competent', 'Retrain', 'Signature']],
    body: f.trainees.map((t, i) => [String(i + 1), t.name, t.role || '', CHK, CHK, '']),
    bodyStyles: { minCellHeight: 8, valign: 'middle' },
    columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 2: { cellWidth: 30 }, 3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 17, halign: 'center' }, 5: { cellWidth: 52 } } }, chkCell));

  section('2. Training content - SOP #2.4.H');
  tbl(Object.assign({ head: [['#', 'Topic', 'Covered']],
    body: TR_TOPICS.map((t, i) => [String(i + 1), t, CHK]),
    columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 2: { cellWidth: 18, halign: 'center' } } }, chkCell));

  section('3. Practical demonstration - mark each trainee (#) who passed the step');
  const tcols = {}; for (let i = 1; i <= n; i++) tcols[i] = { cellWidth: n > 6 ? 9 : 12, halign: 'center' };
  tbl(Object.assign({ head: [['Step'].concat(f.trainees.map((_, i) => String(i + 1)))],
    body: TR_PRACTICAL.map(s => [s].concat(f.trainees.map(() => CHK))),
    headStyles: { fillColor: HEAD, textColor: INK, fontStyle: 'bold', lineColor: LINE, lineWidth: 0.2 },
    columnStyles: Object.assign({ 0: { halign: 'left' } }, tcols),
    didParseCell: d => { if (d.cell.raw === CHK) d.cell.text = ['']; if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = 'center'; },
    didDrawCell: chkCell.didDrawCell }));

  // Comments + signatures
  need(28);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUT); doc.text('Comments:', M, y + 4);
  doc.setDrawColor(...LINE); doc.setLineWidth(0.2);
  [y + 4.5, y + 10.5].forEach(ly => doc.line(M + 18, ly, W - M, ly));
  y += 20;
  const colW = (W - M * 2 - 10) / 2;
  ['Trainer', 'QA Manager (verification)'].forEach((lbl, i) => {
    const x = M + i * (colW + 10);
    doc.setDrawColor(...INK); doc.setLineWidth(0.25); doc.line(x, y, x + colW, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...INK); doc.text(lbl, x, y + 4);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUT); doc.text('Signature / Date', x, y + 8);
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) { doc.setPage(p); footer(); }

  const who = n === 1 ? f.trainees[0].name : n + ' trainees';
  doc.save('Training ' + f.no + ' - ' + who.replace(/[\\/:*?"<>|]/g, '') + '.pdf');
  toast('Training form ' + f.no + ' downloaded', 'success');
}
