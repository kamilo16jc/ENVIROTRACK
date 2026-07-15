// ═══════════════════════════════════════════════════════════════
// LAB FORM — builds lab-submission rows (ONE ROW PER PATHOGEN) and
// the exact file names. The rows are sent to a flow that fills the
// LAB_TEMPLATE (Office Script) and saves it to SharePoint.
// ═══════════════════════════════════════════════════════════════

const LAB_PATS = ['ecoli', 'listeria', 'salmonella', 'saureus'];

// Building name as it must appear on the lab form / file names.
// The East building is "1931E" in the app but "1931" on the lab form.
function labBuilding(dept) { return dept === '1931E' ? '1931' : dept; }

// Normal (generator) lab form → one row per tested pathogen, per sample.
function labRowsNormal(tests) {
  const rows = [];
  tests.forEach(t => LAB_PATS.forEach(p => {
    if (t[p]) rows.push({ zone: t.zone, site: String(t.sample), pathogen: p });
  }));
  return rows;
}

// Retest lab form → one row per FAILED pathogen; site = "<sample> (Retest N)".
function labRowsRetest(rec, retestNum) {
  const failed = (Array.isArray(rec.failedPathogens) && rec.failedPathogens.length)
    ? rec.failedPathogens
    : LAB_PATS.filter(p => rec[p]);
  return failed.map(p => ({
    zone: rec.zone,
    site: String(rec.sample) + ' (Retest ' + retestNum + ')',
    pathogen: p
  }));
}

// ── File names ────────────────────────────────────────────────
function _p2(n) { return String(n).padStart(2, '0'); }
function _mmddyyyy(date) {
  const d = new Date(date + 'T12:00:00');
  return _p2(d.getMonth() + 1) + _p2(d.getDate()) + d.getFullYear();
}
function _mmddyyyyDash(date) {
  const d = new Date(date + 'T12:00:00');
  return _p2(d.getMonth() + 1) + '-' + _p2(d.getDate()) + '-' + d.getFullYear();
}
function _stamp(dt) {
  dt = dt || new Date();
  return dt.getFullYear() + '-' + _p2(dt.getMonth() + 1) + '-' + _p2(dt.getDate()) +
         ' ' + _p2(dt.getHours()) + '-' + _p2(dt.getMinutes());
}

// Submission_1945_05202026
function nameSubmission(dept, date)   { return 'Submission_' + labBuilding(dept) + '_' + _mmddyyyy(date); }
// Swabs_1945_05152026
function namePdfGenerator(dept, date) { return 'Swabs_' + labBuilding(dept) + '_' + _mmddyyyy(date); }
// Retest Form #1 - 1945 (sample 423) - 07-13-2026  (parallels the submission form
// so the automation can pair the PDF with its retest submission by #N + sample)
function namePdfRetest(dept, date, sample, retestNum) {
  return 'Retest Form #' + retestNum + ' - ' + labBuilding(dept) +
         ' (sample ' + sample + ') - ' + _mmddyyyyDash(date);
}
// Submission Form Retest #1 - 1945 (sample 423) - 2026-07-08 17-05
function nameSubmissionRetest(retestNum, dept, sample) {
  return 'Submission Form Retest #' + retestNum + ' - ' + labBuilding(dept) +
         ' (sample ' + sample + ') - ' + _stamp(new Date());
}

// ── Payloads sent to the fill/save flow ───────────────────────
function labPayloadNormal(dept, date, tests) {
  return {
    type: 'normal', building: labBuilding(dept), collectionDate: date,
    fileName: nameSubmission(dept, date), rows: labRowsNormal(tests)
  };
}
function labPayloadRetest(rec, retestNum) {
  return {
    type: 'retest', building: labBuilding(rec.planta), collectionDate: rec.fecha,
    fileName: nameSubmissionRetest(retestNum, rec.planta, rec.sample),
    rows: labRowsRetest(rec, retestNum)
  };
}

// ── Who can "Send to Lab" (email is tied to Julian's config) ──
const LAB_SENDER_EMAILS = ['jagudelo@caputocheese.com'];
function canSendToLab(email) { return LAB_SENDER_EMAILS.includes((email || '').toLowerCase()); }

// ── Submit the normal (generator) lab form ────────────────────
// sendToLab=false → only fill + archive (FOLDER PROVISIONAL).
// sendToLab=true  → also drop a copy in PENDING AUTOMATION (fires the email).
async function submitLabForm(sendToLab) {
  if (!TESTS || !TESTS.length) { toast('Generate tests first', 'error'); return; }
  const planta = document.getElementById('genPlant').value;
  const fecha  = document.getElementById('genDate').value || new Date().toISOString().split('T')[0];
  const p = labPayloadNormal(planta, fecha, TESTS);
  if (!p.rows.length) { toast('The tests have no pathogens selected', 'error'); return; }
  if (sendToLab && !confirm('Send the lab form for ' + p.building + ' to the laboratory? This will email them.')) return;

  const body = Object.assign(
    { fileName: p.fileName, building: p.building, collectionDate: p.collectionDate,
      rowsJson: JSON.stringify(p.rows), sendToLab: !!sendToLab },
    submissionMeta('Generator', String(TESTS.map(t => t.sample).join(', ')), '', sendToLab)
  );
  const btn = document.getElementById(sendToLab ? 'btnLabSend' : 'btnLabFill');
  const prev = btn ? btn.innerHTML : '';
  try {
    if (btn) { btn.disabled = true; btn.textContent = sendToLab ? 'Sending…' : 'Filling…'; }
    toast(sendToLab ? 'Sending to lab…' : 'Filling lab form…', 'info');
    await _spPost('labform', body);
    toast(sendToLab ? 'Lab form sent to the laboratory' : 'Lab form filled and archived', 'success');
    if (typeof refreshSubmissions === 'function') refreshSubmissions();
  } catch (e) {
    console.error('[labform] submit failed:', e);
    toast('Could not generate the lab form', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = prev; }
  }
}

// ── Save a generated PDF (jsPDF doc) to SharePoint (FOLDER PROVISIONAL) ──
async function savePdfToSharePoint(fileName, doc, folder) {
  const b64 = doc.output('datauristring').split('base64,')[1];
  const body = { fileName: fileName, contentBase64: b64 };
  if (folder) body.folder = folder;   // optional destination subfolder (flow may honor it)
  await _spPost('savepdf', body);
}

// ── Submit the RETEST lab form (from the Retests view) ────────
async function submitRetestLabForm(retestId, sendToLab) {
  const rec = GH().find(r => r.id === retestId);
  if (!rec) { toast('Retest not found', 'error'); return; }
  const rn = (String(rec.retestNum).match(/\d+/) || ['1'])[0]; // "Retest #2" → "2"
  const p = labPayloadRetest(rec, rn);
  if (!p.rows.length) { toast('This retest has no pathogen to test', 'error'); return; }
  if (sendToLab && !confirm('Send Retest #' + rn + ' lab form for sample ' + rec.sample + ' to the laboratory? This will email them.')) return;
  const body = Object.assign(
    { fileName: p.fileName, building: p.building, collectionDate: p.collectionDate,
      rowsJson: JSON.stringify(p.rows), sendToLab: !!sendToLab },
    submissionMeta('Retest', String(rec.sample), rn, sendToLab)
  );
  try {
    toast(sendToLab ? 'Sending retest to lab…' : 'Filling retest form…', 'info');
    await _spPost('labform', body);
    toast(sendToLab ? 'Retest form sent to the laboratory' : 'Retest form filled and archived', 'success');
    if (typeof refreshSubmissions === 'function') refreshSubmissions();
  } catch (e) {
    console.error('[labform] retest submit failed:', e);
    toast('Could not generate the retest lab form', 'error');
  }
}

// Submission metadata added to the labform payload so the flow can log a row
// in the Submissions list: who did it, when, and whether it was sent or only
// generated. "Sent to lab" is recorded when the user clicked Send (the form is
// staged in PENDING AUTOMATION); "Generated" when it was only filled/archived.
function submissionMeta(type, sample, retestNum, sendToLab) {
  return {
    submittedByEmail: (typeof CU !== 'undefined' && CU && CU.email) || '',
    submittedByName:  (typeof CU !== 'undefined' && CU && CU.displayName) || '',
    submittedAt:      new Date().toISOString(),
    status:           sendToLab ? 'Sent to lab' : 'Generated',
    type:             type,
    sample:           sample,
    retestNum:        retestNum || ''
  };
}

// Node export (for the migration/test harness); ignored in the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { labBuilding, labRowsNormal, labRowsRetest, nameSubmission,
    namePdfGenerator, namePdfRetest, nameSubmissionRetest, labPayloadNormal, labPayloadRetest };
}
