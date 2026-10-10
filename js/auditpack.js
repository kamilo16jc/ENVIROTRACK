// ═══════════════════════════════════════════════════════════════
// SQF AUDIT PACKAGE (SQF 2.4.H — Environmental Monitoring)
// One-click, date-ranged package for the auditor: program & lab
// (from getEMP), weekly frequency adherence vs the SOP targets,
// results, positives + retests/corrective status, recurring sites,
// MASTER coverage and a sign-off block. Lives in Reports → SQF.
// ═══════════════════════════════════════════════════════════════
const AP_PATHO = { ecoli: 'E. coli', listeria: 'L. monocytogenes', salmonella: 'Salmonella', saureus: 'S. aureus' };
const AP_PLANTS = ['1945', '1935', '1931E', '1931W'];
const AP_SECTIONS = [
  ['program',   'EMP program & laboratory'],
  ['adherence', 'Weekly frequency adherence'],
  ['results',   'Results summary'],
  ['positives', 'Positives & corrective actions'],
  ['recurring', 'Recurring sites (harborage)'],
  ['coverage',  'MASTER coverage'],
  ['signoff',   'Verification sign-off']
];

function switchSqfSub(t) {
  ['summary', 'pack', 'capa', 'mr'].forEach(x => {
    const p = document.getElementById('sqfSub-' + x); if (p) p.style.display = x === t ? 'block' : 'none';
    const b = document.getElementById('sqfSubBtn-' + x); if (b) b.classList.toggle('active', x === t);
  });
  if (t === 'pack') initAuditPack();
  if (t === 'capa' && typeof renderCapaLog === 'function') renderCapaLog();
  if (t === 'mr' && typeof renderMgmtReviews === 'function') renderMgmtReviews();
}

function initAuditPack() {
  const f = document.getElementById('apFrom'), to = document.getElementById('apTo');
  const start = (typeof SQF_PROGRAM_START !== 'undefined') ? SQF_PROGRAM_START : '';
  if (f && !f.value) { const jan = new Date().getFullYear() + '-01-01'; f.value = start > jan ? start : jan; }
  if (to && !to.value) to.value = todayLocal();
  const sec = document.getElementById('apSections');
  if (sec && !sec.children.length)
    sec.innerHTML = AP_SECTIONS.map(([k, l]) => '<label><input type="checkbox" data-sec="' + k + '" checked> ' + l + '</label>').join('');
  renderAuditPackPreview();
}

const _apMonday = ds => { const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return todayLocal(d); };
const _apFmt = ds => ds ? new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const _apPath = h => {
  const k = (typeof positivePathogens === 'function') ? positivePathogens(h) : [];
  return k.length ? k.map(x => AP_PATHO[x] || x).join(', ') : (h.failedPathogensLabel || '—');
};

// Weekly adherence vs SOP targets — every Monday in range, so weeks with NO
// sampling show as missed instead of silently disappearing. `base` = routine
// records (optional; computed from GH() when omitted).
function apWeeklyAdherence(from, to, plants, base) {
  const emp = getEMP();
  if (!base) base = GH().filter(h => !h.retestNum && !h.isRetest && plants.includes(h.planta) && (!from || h.fecha >= from) && h.fecha <= to);
  const start = (typeof SQF_PROGRAM_START !== 'undefined') ? SQF_PROGRAM_START : '';
  const firstWk = _apMonday(from && from > start ? from : (start || from || to));
  const lastWk = _apMonday(to), thisWk = _apMonday(todayLocal());
  const counts = {};
  base.forEach(h => {
    const k = h.planta + '|' + _apMonday(h.fecha);
    const o = counts[k] || (counts[k] = { total: 0, z: { 2: 0, 3: 0, 4: 0 } });
    o.total++; if (o.z[h.zone] !== undefined) o.z[h.zone]++;
  });
  const weeks = [];
  for (const d = new Date(firstWk + 'T12:00:00'); todayLocal(d) <= lastWk; d.setDate(d.getDate() + 7)) {
    const w = todayLocal(d);
    plants.forEach(p => {
      const t = (emp.plants[p] || {}), tz = t.zones || { 2: 0, 3: 0, 4: 0 };
      const c = counts[p + '|' + w] || { total: 0, z: { 2: 0, 3: 0, 4: 0 } };
      let status;
      if (w === thisWk) status = 'current';
      else if (!c.total) status = 'missed';
      else if (c.total >= (t.total || 0) && c.z[2] >= tz[2] && c.z[3] >= tz[3] && c.z[4] >= tz[4]) status = 'ok';
      else status = 'partial';
      weeks.push({ plant: p, week: w, total: c.total, z: c.z, target: t.total || 0, tz, status });
    });
  }
  return weeks;
}

// ── Compute everything the package needs ──────────────────────
// opts {from, to, sel} — omitted → read from the Audit Package controls.
function auditPackData(opts) {
  const _v = id => (document.getElementById(id) || {}).value || '';
  const from = opts ? (opts.from || '') : _v('apFrom'), to = (opts ? opts.to : _v('apTo')) || todayLocal();
  const sel = opts ? (opts.sel || 'all') : (_v('apPlant') || 'all');
  const plants = sel === 'all' ? AP_PLANTS : [sel];
  const emp = getEMP();
  const all = GH();
  const H = all.filter(h => (!from || h.fecha >= from) && h.fecha <= to && plants.includes(h.planta));
  const base = H.filter(h => !h.retestNum && !h.isRetest);
  const resolvedById = {}; GRV().forEach(r => { resolvedById[r.originalId] = r; });

  const weeks = apWeeklyAdherence(from, to, plants, base);
  const evalWeeks = weeks.filter(w => w.status !== 'current');
  const progCapas = (typeof getProgCapas === 'function' ? getProgCapas() : [])
    .filter(c => (!c.periodFrom || c.periodFrom <= to) && (!c.periodTo || !from || c.periodTo >= from))
    .map(c => Object.assign({}, c, { status: pcapaStatus(c), auto: pcapaAutoEffect(c) }));
  const devCapas = progCapas.filter(c => c.kind === 'sampling');
  const okWeeks = evalWeeks.filter(w => w.status === 'ok').length;
  const adherence = evalWeeks.length ? Math.round(okWeeks / evalWeeks.length * 100) : 100;

  // Positives + retest chain + status
  // Routine positives + positive VECTOR sites (a new positive location with its own follow-up)
  const positives = H.filter(h => h.resultado === 'Positive' && ((!h.retestNum && !h.isRetest) || isVectorRec(h))).sort((a, b) => a.fecha.localeCompare(b.fecha)).map(p => {
    const kids = all.filter(r => r.originalId === p.id && (r.retestNum || r.isRetest)).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const rts = kids.filter(r => !isVectorRec(r));          // the 3 confirmation retests
    const vecs = kids.filter(r => isVectorRec(r));          // vector samples (source investigation)
    const capa = (typeof getCapa === 'function') ? getCapa(p.id) : null;
    const eff = (typeof capaEffectiveness === 'function') ? capaEffectiveness(p.id) : { ok: false, text: '—' };
    const res = resolvedById[p.id];
    // The app writes a "resolved" anchor the moment retests are SCHEDULED, so it is
    // not proof of closure. Closed = SOP efficacy passed (3 consecutive negatives),
    // or a legacy manual closure (anchor without closedOnGenerate).
    const status = (eff.ok || (res && !res.closedOnGenerate)) ? 'Closed'
      : rts.some(r => r.resultado === 'Positive') ? 'Escalated'
      : (kids.some(r => r.resultado === 'Pending') || res) ? 'In follow-up' : 'Open';
    const site = (p.sample ? '#' + p.sample : (p.location || 'Site')) + (isVectorRec(p) ? ' (' + p.retestNum + ')' : '');
    return { p, rts, vecs, capa, eff, res, status, path: _apPath(p), site };
  });
  const openPos = positives.filter(x => x.status !== 'Closed').length;
  const capaMissing = positives.filter(x => !(typeof capaComplete === 'function' && capaComplete(x.capa))).length;

  // Recurring sites: same building+sample positive 2+ times in range (incl. retests)
  const rec = {};
  H.filter(h => h.resultado === 'Positive').forEach(h => {
    const k = h.planta + '|' + h.sample;
    (rec[k] || (rec[k] = { plant: h.planta, sample: h.sample, area: h.area, location: h.location, dates: [] })).dates.push(h.fecha);
  });
  const recurring = Object.values(rec).filter(r => r.dates.length >= 2).sort((a, b) => b.dates.length - a.dates.length);

  // Results by building + pathogen positives
  const byPlant = plants.map(p => {
    const b = base.filter(h => h.planta === p);
    return { plant: p, tests: b.length, neg: b.filter(h => h.resultado === 'Negative').length,
             pos: b.filter(h => h.resultado === 'Positive').length, pend: b.filter(h => h.resultado === 'Pending').length };
  });
  const pathCounts = { ecoli: 0, listeria: 0, salmonella: 0, saureus: 0 };
  base.filter(h => h.resultado === 'Positive').forEach(h => (positivePathogens(h) || []).forEach(k => { if (k in pathCounts) pathCounts[k]++; }));

  // MASTER coverage
  const tested = new Set(base.map(h => h.planta + '|' + h.sample));
  const coverage = plants.map(p => {
    const m = getActiveMaster(p), t = m.filter(pt => tested.has(p + '|' + pt.sample)).length;
    return { plant: p, master: m.length, tested: t, rate: m.length ? Math.round(t / m.length * 100) : 0 };
  });
  const mTot = coverage.reduce((s, c) => s + c.master, 0), tTot = coverage.reduce((s, c) => s + c.tested, 0);
  const coverageRate = mTot ? Math.round(tTot / mTot * 100) : 0;

  // Readiness checklist (what an auditor will probe)
  const today = todayLocal();
  const labOk = emp.lab.expiry && emp.lab.expiry >= today;
  const last = emp.managementReview.lastReview;
  const yearAgo = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return todayLocal(d); })();
  const freqMismatch = plants.filter(p => typeof minSamplesFor === 'function' && emp.plants[p] && minSamplesFor(p) !== emp.plants[p].total)
    .map(p => p + ': system ' + minSamplesFor(p) + '/wk vs SOP ' + emp.plants[p].total + '/wk');
  const checks = [
    { ok: labOk, label: 'Accredited lab certificate current', detail: emp.lab.name + ' · ' + emp.lab.cert + ' · expires ' + _apFmt(emp.lab.expiry) },
    { ok: !!last && last >= yearAgo, label: 'Management review recorded (last 12 months)', detail: last ? 'Last review ' + _apFmt(last) : 'No review recorded — Settings → EMP Program' },
    { ok: emp.training.length > 0, label: 'Sampler training on file', detail: emp.training.length ? emp.training.length + ' record(s)' : 'No training records — Settings → EMP Program' },
    { ok: openPos === 0, label: 'No open positives in period', detail: openPos ? openPos + ' positive(s) still open / in follow-up' : 'All positives closed' },
    { ok: capaMissing === 0, label: 'CAPA (2.5.C.2) documented for every positive', detail: positives.length ? (positives.length - capaMissing) + ' of ' + positives.length + ' positives have a complete CAPA' : 'No positives in period' },
    { ok: adherence >= 90, label: 'Weekly frequency adherence >= 90%', detail: okWeeks + ' of ' + evalWeeks.length + ' building-weeks met the SOP (' + adherence + '%)' },
    { ok: adherence >= 90 || devCapas.length > 0, label: 'Adherence deviations documented with a CAPA', detail: adherence >= 90 ? 'Not required — adherence at or above 90%' : devCapas.length ? devCapas.map(c => c.no + ' (' + c.status + ')').join(', ') : 'No CAPA covers the non-compliant weeks — Reports → SQF Compliance → CAPA Log' },
    { ok: !freqMismatch.length, label: 'System sampling plan matches SOP 2.4.H', detail: freqMismatch.length ? freqMismatch.join(' · ') : 'Weekly totals match the SOP' }
  ];
  const readiness = Math.round(checks.filter(c => c.ok).length / checks.length * 100);

  return { from, to, plants, sel, emp, H, base, weeks, evalWeeks, okWeeks, adherence, positives, openPos, progCapas, devCapas,
           recurring, byPlant, pathCounts, coverage, coverageRate, checks, readiness };
}

// ── On-screen preview ─────────────────────────────────────────
function renderAuditPackPreview() {
  const host = document.getElementById('apPreview'); if (!host) return;
  const d = auditPackData();
  const tile = (k, v, s, cls) => '<div class="ap-tile ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
  const pill = st => st === 'ok' ? '<span class="ap-pill ok">Met</span>' : st === 'partial' ? '<span class="ap-pill mid">Partial</span>'
    : st === 'missed' ? '<span class="ap-pill bad">Missed</span>' : '<span class="ap-pill" style="background:var(--gray-400)">In progress</span>';
  const wkRows = d.weeks.slice().reverse().map(w =>
    '<tr><td style="font-weight:600">' + w.plant + '</td><td>' + _apFmt(w.week) + '</td>' +
    '<td style="text-align:center">' + w.total + ' / ' + w.target + '</td>' +
    '<td style="text-align:center">' + w.z[2] + ' / ' + w.tz[2] + '</td><td style="text-align:center">' + w.z[3] + ' / ' + w.tz[3] + '</td>' +
    '<td style="text-align:center">' + w.z[4] + ' / ' + w.tz[4] + '</td><td style="text-align:center">' + pill(w.status) + '</td></tr>').join('')
    || '<tr><td colspan="7" style="text-align:center;color:var(--gray-500);padding:18px">No weeks in range</td></tr>';

  host.innerHTML =
    '<div class="ap-grid">' +
      tile('Audit readiness', d.readiness + '%', d.checks.filter(c => c.ok).length + ' of ' + d.checks.length + ' checks', d.readiness >= 90 ? 'ok' : 'warn') +
      tile('Frequency adherence', d.adherence + '%', d.okWeeks + ' / ' + d.evalWeeks.length + ' building-weeks', d.adherence >= 90 ? 'ok' : 'warn') +
      tile('Positives', d.positives.length, d.openPos + ' open / in follow-up', d.openPos ? 'warn' : '') +
      tile('MASTER coverage', d.coverageRate + '%', d.base.length + ' routine tests in period', '') +
    '</div>' +
    '<div class="card"><div class="card-title">Audit readiness checklist</div>' +
      d.checks.map(c =>
        '<div style="display:flex;gap:12px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--gray-100)">' +
        '<span style="flex:none;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:12px;font-weight:700;background:' + (c.ok ? '#3b684e' : '#a75a52') + '">' + (c.ok ? '✓' : '!') + '</span>' +
        '<div><div style="font-size:13px;font-weight:600;color:var(--gray-900)">' + esc(c.label) + '</div>' +
        '<div style="font-size:12px;color:var(--gray-500)">' + esc(c.detail) + '</div></div></div>').join('') +
    '</div>' +
    '<div class="card"><div class="card-title">Weekly frequency adherence vs SOP 2.4.H</div>' +
      '<div class="table-wrap" style="max-height:360px;overflow-y:auto"><table><thead><tr><th>Building</th><th>Week of</th>' +
      '<th style="text-align:center">Tests</th><th style="text-align:center">Zone 2</th><th style="text-align:center">Zone 3</th>' +
      '<th style="text-align:center">Zone 4</th><th style="text-align:center">Status</th></tr></thead><tbody>' + wkRows + '</tbody></table></div>' +
    '</div>';
}

// ── PDF export ────────────────────────────────────────────────
function exportAuditPack() {
  if (!window.jspdf) { toast('PDF library not loaded', 'error'); return; }
  const d = auditPackData();
  const on = k => { const c = document.querySelector('#apSections input[data-sec="' + k + '"]'); return !c || c.checked; };
  const safe = s => String(s == null ? '' : s).replace(/→/g, '->').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/✓/g, 'OK').replace(/✗/g, 'X');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const W = 215.9, PH = doc.internal.pageSize.getHeight(), M = 14;
  const G = [52, 93, 70], RED = [167, 90, 82], AMB = [140, 116, 59], INK = [40, 61, 49], MUT = [102, 115, 98];
  let y = 0;
  const need = h => { if (y + h > PH - 18) { doc.addPage(); y = 18; } };
  const section = t => { need(16); doc.setFillColor(...G); doc.rect(M, y, W - M * 2, 7.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(255, 255, 255); doc.text(safe(t), M + 3, y + 5.2); y += 10; };
  const sub = t => { need(9); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(safe(t), M, y + 3); y += 6; };
  const para = (t, size) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(size || 8.5); doc.setTextColor(...MUT);
    const lines = doc.splitTextToSize(safe(t), W - M * 2); need(lines.length * 4 + 2); doc.text(lines, M, y + 3); y += lines.length * 4 + 2; };
  const table = (head, body, opts) => {
    doc.autoTable(Object.assign({
      head: [head], body: body.map(r => r.map(safe)), startY: y, margin: { left: M, right: M },
      styles: { fontSize: 8, cellPadding: 2.4, textColor: INK, lineColor: [221, 229, 216], lineWidth: 0.2, overflow: 'linebreak' },
      headStyles: { fillColor: [234, 241, 228], textColor: INK, fontStyle: 'bold', lineColor: [221, 229, 216], lineWidth: 0.2 },
      alternateRowStyles: { fillColor: [250, 251, 249] }
    }, opts || {}));
    y = doc.lastAutoTable.finalY + 6;
  };
  const statusColor = v => /Met|Closed|OK|Current|Valid|Confirmed/.test(v) ? G : /Partial|follow/.test(v) ? AMB : /Missed|Open|Expired|Action|Escalated|Missing|Not effective/.test(v) ? RED : INK;

  // ── Cover ──
  try { doc.addImage(LOGO, 'JPEG', M, 14, 34, 17); } catch (e) {}
  doc.setDrawColor(...G); doc.setLineWidth(0.8); doc.line(M, 36, W - M, 36);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...INK);
  doc.text('Environmental Monitoring Program', M, 52);
  doc.setFontSize(15); doc.setTextColor(...G); doc.text('SQF Audit Package', M, 61);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUT);
  doc.text(safe('SQF Code element ' + d.emp.clause.replace('SQF ', '') + ' — Environmental Monitoring'), M, 69);
  const meta = [
    ['Facility', 'Caputo Foods'],
    ['Buildings', d.plants.join(', ')],
    ['Period', _apFmt(d.from) + ' — ' + _apFmt(d.to)],
    ['Program SOP', 'SQF #2.4.H · ' + d.emp.sopVersion],
    ['Laboratory', d.emp.lab.name + ' (' + d.emp.lab.body + ' ' + d.emp.lab.cert + ')'],
    ['Prepared by', (CU && CU.displayName ? CU.displayName : '—') + ' · ' + _apFmt(todayLocal())]
  ];
  y = 80;
  doc.autoTable({ body: meta.map(r => r.map(safe)), startY: y, margin: { left: M, right: M }, theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: 2.2, textColor: INK }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38, textColor: MUT } } });
  y = doc.lastAutoTable.finalY + 8;
  // Summary boxes
  const box = (x, label, val, col) => {
    doc.setDrawColor(221, 229, 216); doc.setFillColor(250, 251, 249); doc.roundedRect(x, y, 44, 22, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...col); doc.text(safe(val), x + 4, y + 11);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUT); doc.text(safe(label), x + 4, y + 17.5);
  };
  box(M, 'Audit readiness', d.readiness + '%', d.readiness >= 90 ? G : RED);
  box(M + 47, 'Frequency adherence', d.adherence + '%', d.adherence >= 90 ? G : RED);
  box(M + 94, 'Positives (open)', d.positives.length + ' (' + d.openPos + ')', d.openPos ? RED : G);
  box(M + 141, 'MASTER coverage', d.coverageRate + '%', INK);
  y += 30;
  sub('Readiness checklist');
  table(['Check', 'Result', 'Detail'], d.checks.map(c => [c.label, c.ok ? 'OK' : 'Action needed', c.detail]), {
    columnStyles: { 0: { cellWidth: 70, fontStyle: 'bold' }, 1: { cellWidth: 26, halign: 'center', fontStyle: 'bold' } },
    didParseCell: x => { if (x.section === 'body' && x.column.index === 1) x.cell.styles.textColor = statusColor(x.cell.raw); } });
  sub('Contents');
  para(AP_SECTIONS.filter(([k]) => on(k)).map(([, l], i) => (i + 1) + '. ' + l).join('    '));

  // ── 1. Program & lab ──
  if (on('program')) {
    doc.addPage(); y = 18;
    section('1. Environmental Monitoring Program (SOP #2.4.H)');
    const e = d.emp, labOk = e.lab.expiry >= todayLocal();
    table(['Item', 'Detail'], [
      ['Code element', e.clause], ['SOP version', e.sopVersion], ['Purpose', e.purpose], ['Program owner', e.owner],
      ['Frequency', e.frequency], ['Sampling rules', e.samplingRules.join('  |  ')]
    ], { columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold' } } });
    sub('Accredited laboratory');
    table(['Item', 'Detail'], [
      ['Laboratory', e.lab.name], ['Location', e.lab.location], ['Accreditation', e.lab.body + ' · ' + e.lab.standard],
      ['Certificate', e.lab.cert], ['Expiry', _apFmt(e.lab.expiry) + (labOk ? '  (Current)' : '  (Expired)')], ['Scope', e.lab.scope]
    ], { columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold' } } });
    sub('Sanitary zones');
    table(['Zone', 'Definition'], Object.entries(e.zones).map(([z, t]) => ['Zone ' + z, t]), { columnStyles: { 0: { cellWidth: 24, fontStyle: 'bold' } } });
    sub('Sampling plan by building (weekly)');
    table(['Building', 'Total', 'Zone 2', 'Zone 3', 'Zone 4', 'Pathogens'],
      AP_PLANTS.map(p => { const x = e.plants[p]; return [p, x.total, x.zones[2], x.zones[3], x.zones[4], x.pathogens]; }),
      { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 20 }, 1: { halign: 'center', cellWidth: 14 }, 2: { halign: 'center', cellWidth: 15 }, 3: { halign: 'center', cellWidth: 15 }, 4: { halign: 'center', cellWidth: 15 } } });
    para('Building 1945 rotation: ' + e.plants['1945'].rotation);
    sub('Management review & training');
    table(['Item', 'Detail'], [
      ['Review cadence', e.managementReview.cadence || 'Not set'],
      ['Last management review', _apFmt(e.managementReview.lastReview)],
      ['Annual program review', _apFmt(e.annualProgramReview)]
    ], { columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } } });
    const mrs = (typeof getMgmtReviews === 'function' ? getMgmtReviews() : []).filter(r => r.date >= d.from && r.date <= d.to);
    if (mrs.length) table(['Review date', 'Period reviewed', 'Program effective', 'Actions', 'Next review'],
      mrs.map(r => [_apFmt(r.date), _apFmt(r.periodFrom) + ' - ' + _apFmt(r.periodTo), r.effective || '—', String((r.actions || []).length), _apFmt(r.nextReview)]));
    if (e.training.length) table(['Sampler', 'Role', 'Trained on', 'Training form'], e.training.map(t => [t.name, t.role, _apFmt(t.date), t.formNo || 'Not on file']));
    else para('No sampler training records registered.');
    sub('Linked forms & records');
    para(e.forms.join('   |   '));
  }

  // ── 2. Adherence ──
  if (on('adherence')) {
    doc.addPage(); y = 18;
    section('2. Weekly Frequency Adherence vs SOP 2.4.H');
    para(d.okWeeks + ' of ' + d.evalWeeks.length + ' building-weeks met the SOP sampling plan (' + d.adherence + '%). Counts shown as actual / SOP target. Weeks with no sampling are listed as Missed; the current week is In progress.');
    const _s = t => String(t || '').trim().replace(/\.+$/, '');
    d.devCapas.forEach(c => para('Deviation documented: ' + c.no + ' - ' + _s(c.title) + '. Root cause: ' + _s(c.rootCause) + '. Correction: ' + _s(c.correction) + (c.correctedOn ? ' (completed ' + _apFmt(c.correctedOn) + ')' : ' (completion date pending)') + '. Status: ' + c.status + (c.auto ? ' - ' + _s(c.auto.text) : '') + '.'));
    const lab = s => ({ ok: 'Met', partial: 'Partial', missed: 'Missed', current: 'In progress' })[s];
    table(['Building', 'Week of', 'Tests', 'Zone 2', 'Zone 3', 'Zone 4', 'Status'],
      d.weeks.map(w => [w.plant, _apFmt(w.week), w.total + ' / ' + w.target, w.z[2] + ' / ' + w.tz[2], w.z[3] + ' / ' + w.tz[3], w.z[4] + ' / ' + w.tz[4], lab(w.status)]),
      { styles: { fontSize: 7.8, cellPadding: 2, textColor: INK, lineColor: [221, 229, 216], lineWidth: 0.2, halign: 'center' },
        columnStyles: { 0: { fontStyle: 'bold' }, 6: { fontStyle: 'bold' } },
        didParseCell: x => { if (x.section === 'body' && x.column.index === 6) x.cell.styles.textColor = statusColor(x.cell.raw); } });
  }

  // ── 3. Results ──
  if (on('results')) {
    doc.addPage(); y = 18;
    section('3. Results Summary');
    table(['Building', 'Routine tests', 'Negative', 'Positive', 'Pending', 'Positive rate'],
      d.byPlant.map(b => [b.plant, b.tests, b.neg, b.pos, b.pend, b.tests ? (b.pos / b.tests * 100).toFixed(1) + '%' : '—']),
      { columnStyles: { 0: { fontStyle: 'bold' } }, styles: { fontSize: 8.5, cellPadding: 2.4, textColor: INK, lineColor: [221, 229, 216], lineWidth: 0.2, halign: 'center' } });
    sub('Confirmed positives by pathogen');
    table(['Pathogen', 'Positives'], Object.entries(d.pathCounts).map(([k, n]) => [AP_PATHO[k], n]), { columnStyles: { 1: { halign: 'center' } } });
  }

  // ── 4. Positives & corrective actions ──
  if (on('positives')) {
    doc.addPage(); y = 18;
    section('4. Positive Results & Corrective Actions');
    para('Per SOP 2.4.H: positive site is examined, root cause investigated, corrective action taken, and efficacy confirmed with three consecutive negative retests before returning to routine sampling. Corrective action records: form 2.5.C.2.');
    if (!d.positives.length) para('No positive results in this period.', 9);
    else table(['Date', 'Bldg', 'Sample', 'Zone', 'Area / location', 'Pathogen', 'Retests', 'Status'],
      d.positives.map(x => [
        _apFmt(x.p.fecha), x.p.planta, x.site, x.p.zone || '—',
        (x.p.area || '') + (x.p.location ? ' / ' + x.p.location : ''), x.path,
        (x.rts.length ? x.rts.map(r => 'R' + (String(r.retestNum).replace(/\D/g, '') || '?') + ' ' + _apFmt(r.fecha) + ' ' + (r.resultado === 'Negative' ? 'Neg' : r.resultado === 'Positive' ? 'POS' : 'Pend')).join('\n') : 'None scheduled') +
          (x.vecs.length ? '\nVector: ' + x.vecs.length + ' site(s), ' + x.vecs.filter(v => v.resultado === 'Positive').length + ' pos' : ''),
        x.status
      ]),
      { styles: { fontSize: 7.5, cellPadding: 2, textColor: INK, lineColor: [221, 229, 216], lineWidth: 0.2, overflow: 'linebreak' },
        columnStyles: { 0: { cellWidth: 21 }, 1: { cellWidth: 12 }, 2: { cellWidth: 15 }, 3: { cellWidth: 11, halign: 'center' }, 6: { cellWidth: 40 }, 7: { cellWidth: 23, fontStyle: 'bold' } },
        didParseCell: x => { if (x.section === 'body' && x.column.index === 7) x.cell.styles.textColor = statusColor(x.cell.raw); } });

    if (d.positives.length) {
      sub('Corrective & preventive actions (form 2.5.C.2)');
      const dash = v => v || 'Missing';
      table(['Positive', 'Root cause', 'Correction', 'Preventive action', 'Product disposition', 'Effectiveness / verification'],
        d.positives.map(x => {
          const c = x.capa || {};
          return [
            x.site + ' · ' + x.p.planta + '\n' + _apFmt(x.p.fecha),
            dash(c.rootCause), dash(c.correction), dash(c.preventive), dash(c.disposition),
            x.eff.text + (c.verifiedBy ? '\nVerified: ' + c.verifiedBy + (c.verifiedDate ? ' · ' + _apFmt(c.verifiedDate) : '') : '\nVerified: Missing')
          ];
        }),
        { styles: { fontSize: 7.2, cellPadding: 2, textColor: INK, lineColor: [221, 229, 216], lineWidth: 0.2, overflow: 'linebreak', valign: 'top' },
          columnStyles: { 0: { cellWidth: 22, fontStyle: 'bold' }, 4: { cellWidth: 28 }, 5: { cellWidth: 34 } },
          didParseCell: x => { if (x.section === 'body' && x.cell.raw && /Missing|Not effective/.test(String(x.cell.raw))) x.cell.styles.textColor = RED;
                               else if (x.section === 'body' && x.column.index === 5 && /Confirmed/.test(String(x.cell.raw))) x.cell.styles.textColor = G; } });
    }
  }

  if (on('positives') && d.progCapas.length) {
    sub('Program deviations - CAPA log (form 2.5.C.2)');
    const dash = v => v || 'Missing';
    table(['CAPA', 'Deviation', 'Root cause', 'Correction', 'Preventive action', 'Verification'],
      d.progCapas.map(c => [
        c.no + '\nOpened ' + _apFmt(c.openedOn),
        dash(c.title) + (c.periodFrom ? '\nPeriod: ' + _apFmt(c.periodFrom) + ' - ' + (c.periodTo ? _apFmt(c.periodTo) : 'correction') : ''),
        dash(c.rootCause), dash(c.correction) + (c.correctedOn ? '\nCompleted ' + _apFmt(c.correctedOn) : ''), dash(c.preventive),
        c.status + (c.auto ? '\n' + c.auto.text : '') + (c.verifiedBy ? '\nVerified: ' + c.verifiedBy + (c.verifiedDate ? ' · ' + _apFmt(c.verifiedDate) : '') : '\nVerified: Missing')
      ]),
      { styles: { fontSize: 7.2, cellPadding: 2, textColor: INK, lineColor: [221, 229, 216], lineWidth: 0.2, overflow: 'linebreak', valign: 'top' },
        columnStyles: { 0: { cellWidth: 22, fontStyle: 'bold' }, 1: { cellWidth: 34 }, 5: { cellWidth: 32 } },
        didParseCell: x => { if (x.section === 'body' && x.cell.raw && /Missing|Not effective|^Open/.test(String(x.cell.raw))) x.cell.styles.textColor = RED;
                             else if (x.section === 'body' && x.column.index === 5 && /^Closed/.test(String(x.cell.raw))) x.cell.styles.textColor = G; } });
  }

  // ── 5. Recurring sites ──
  if (on('recurring')) {
    need(40); if (y > 60) { doc.addPage(); y = 18; }
    section('5. Recurring Sites (Potential Harborage)');
    para('Sites positive two or more times in the period. Per SOP 2.4.H these are vectorized to adjacent locations (recommended limit: five) rather than following the routine frequency.');
    if (!d.recurring.length) para('No recurring positive sites in this period.', 9);
    else table(['Bldg', 'Sample', 'Area / location', 'Positives', 'Dates'],
      d.recurring.map(r => [r.plant, '#' + r.sample, (r.area || '') + (r.location ? ' / ' + r.location : ''), r.dates.length, r.dates.map(_apFmt).join(', ')]),
      { columnStyles: { 3: { halign: 'center', fontStyle: 'bold', textColor: RED } } });
  }

  // ── 6. Coverage ──
  if (on('coverage')) {
    need(50);
    section('6. MASTER Sampling Point Coverage');
    table(['Building', 'Active points', 'Tested in period', 'Not tested', 'Coverage'],
      d.coverage.map(c => [c.plant, c.master, c.tested, c.master - c.tested, c.rate + '%']),
      { styles: { fontSize: 8.5, cellPadding: 2.4, textColor: INK, lineColor: [221, 229, 216], lineWidth: 0.2, halign: 'center' }, columnStyles: { 0: { fontStyle: 'bold' } } });
  }

  // ── 7. Sign-off ──
  if (on('signoff')) {
    need(70); if (y > PH - 90) { doc.addPage(); y = 18; }
    section('7. Verification & Approval');
    para('Monitoring records are reviewed for accuracy and timeliness by a person in a position of authority (verification), and trends are reviewed by management (validation).');
    y += 4;
    [['Prepared by (QA designee)', CU && CU.displayName ? CU.displayName : ''], ['Verified by (SQF Practitioner)', ''], ['Approved by (Management)', '']].forEach(([role, name]) => {
      need(22);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(safe(role), M, y + 3);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUT);
      doc.setDrawColor(...MUT); doc.setLineWidth(0.3);
      doc.line(M, y + 13, M + 80, y + 13); doc.line(M + 90, y + 13, M + 140, y + 13); doc.line(M + 150, y + 13, W - M, y + 13);
      doc.setFontSize(7.5); doc.text('Name' + (name ? ':  ' + safe(name) : ''), M, y + 17); doc.text('Signature', M + 90, y + 17); doc.text('Date', M + 150, y + 17);
      y += 24;
    });
  }

  // ── Footer on every page ──
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...G); doc.setLineWidth(0.4); doc.line(M, PH - 13, W - M, PH - 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUT);
    doc.text('Caputo Foods  |  SQF 2.4.H Environmental Monitoring — Audit Package  |  Confidential', M, PH - 8.5);
    doc.text('Page ' + i + ' of ' + n, W - M, PH - 8.5, { align: 'right' });
  }
  doc.save('Caputo_SQF_AuditPackage_' + (d.from || 'start') + '_to_' + d.to + '.pdf');
  toast('Audit package generated', 'success');
}
