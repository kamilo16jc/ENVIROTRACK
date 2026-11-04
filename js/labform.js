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

// Retest / vector lab form → one row per FAILED pathogen; site = "<sample> (Retest N)"
// or "<sample|location> (Vector N)". kind defaults to 'Retest'.
function labRowsRetest(rec, retestNum, kind) {
  const failed = (Array.isArray(rec.failedPathogens) && rec.failedPathogens.length)
    ? rec.failedPathogens
    : LAB_PATS.filter(p => rec[p]);
  const where = rec.sample ? String(rec.sample) : (rec.location || 'Vector site');
  return failed.map(p => ({
    zone: rec.zone,
    site: where + ' (' + (kind || 'Retest') + ' ' + retestNum + ')',
    pathogen: p
  }));
}
// 'Vector' for vector-sampling records, 'Retest' otherwise.
function labKindOf(rec) { return (typeof isVectorRec === 'function' && isVectorRec(rec)) ? 'Vector' : 'Retest'; }

// ── File names ────────────────────────────────────────────────
function _p2(n) { return String(n).padStart(2, '0'); }
function _mmddyyyy(date) {
  const d = new Date(date + 'T12:00:00');
  return _p2(d.getMonth() + 1) + _p2(d.getDate()) + d.getFullYear();
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
// Retest PDF name: "Retest #N - <bldg> (sample #) - YYYY-MM-DD HH-MM".
// Same date format as the submission form (so the file-organizing automation
// parses the month and files it), carries the retest number + sample for
// pairing/uniqueness. (date param unused — stamp generated like the form.)
function namePdfRetest(dept, date, sample, retestNum, kind) {
  return (kind || 'Retest') + ' #' + retestNum + ' - ' + labBuilding(dept) +
         ' (sample ' + sample + ') - ' + _stamp(new Date());
}
// Submission Form Retest #1 - 1945 (sample 423) - 2026-07-08 17-05
// (vector samples: "Submission Form Vector #1 - …")
function nameSubmissionRetest(retestNum, dept, sample, kind) {
  return 'Submission Form ' + (kind || 'Retest') + ' #' + retestNum + ' - ' + labBuilding(dept) +
         ' (sample ' + sample + ') - ' + _stamp(new Date());
}

// ── Payloads sent to the fill/save flow ───────────────────────
function labPayloadNormal(dept, date, tests) {
  return {
    type: 'normal', building: labBuilding(dept), collectionDate: date,
    fileName: nameSubmission(dept, date), rows: labRowsNormal(tests)
  };
}
function labPayloadRetest(rec, retestNum, kind) {
  return {
    type: 'retest', building: labBuilding(rec.planta), collectionDate: rec.fecha,
    fileName: nameSubmissionRetest(retestNum, rec.planta, rec.sample, kind),
    rows: labRowsRetest(rec, retestNum, kind)
  };
}

// ── Who can "Send to Lab" (email is tied to Julian's config) ──
// Who may email the lab: private/appConfig.labSenders (not in the public repo).
function canSendToLab(email) { const l = (typeof appConfig === 'function' ? appConfig().labSenders : null) || []; return l.map(x => String(x).toLowerCase()).includes((email || '').toLowerCase()); }

// ── Submit the normal (generator) lab form ────────────────────
// sendToLab=false → only fill + archive (FOLDER PROVISIONAL).
// sendToLab=true  → also drop a copy in PENDING AUTOMATION (fires the email).
// ── Duplicate guard ─────────────────────────────────────────────
// One lab form at a time (a second click while the first is on its way used to
// run the flow twice), and a warning when the same form was already filled or
// sent (from the Submissions log, shared by every device).
let _labBusy = false;
function _labBusyMsg() { toast('A lab form is already being processed — wait a moment', 'info'); }
function _subWho(s)  { return s.submittedByName || s.submittedByEmail || 'someone'; }
function _subWhen(s) {
  const d = new Date(s.submittedAt);
  return isNaN(d) ? (s.submittedAt || 'earlier') : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function _labPrior(match) {
  return ((typeof getSubmissions === 'function') ? getSubmissions() : []).filter(match)
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
}
// true = go ahead. Filled before and now sending = the normal path (no warning).
function _labRepeatOK(prior, sendToLab, what) {
  if (!prior.length) return true;
  const sent = prior.find(s => /sent/i.test(s.status || ''));
  if (sent) return confirm(what + ' was already SENT to the lab on ' + _subWhen(sent) + ' by ' + _subWho(sent) + '.\n\n' +
    (sendToLab ? 'Sending it again emails the laboratory a second time.' : 'Filling it again creates a duplicate file.') + ' Continue anyway?');
  if (!sendToLab) return confirm(what + ' was already filled on ' + _subWhen(prior[0]) + ' by ' + _subWho(prior[0]) + '.\n\nFill it again? This creates a duplicate file.');
  return true;
}

async function submitLabForm(sendToLab) {
  if (!TESTS || !TESTS.length) { toast('Generate tests first', 'error'); return; }
  const planta = document.getElementById('genPlant').value;
  const fecha  = document.getElementById('genDate').value || todayLocal();
  return submitLabFormFor(planta, fecha, TESTS, sendToLab, document.getElementById(sendToLab ? 'btnLabSend' : 'btnLabFill'));
}
async function submitLabFormFor(planta, fecha, tests, sendToLab, btn) {
  if (_labBusy) { _labBusyMsg(); return; }
  _labBusy = true;
  try { await _submitLabForm(planta, fecha, tests, sendToLab, btn); } finally { _labBusy = false; }
}
async function _submitLabForm(planta, fecha, tests, sendToLab, btn) {
  const p = labPayloadNormal(planta, fecha, tests);
  if (!p.rows.length) { toast('The tests have no pathogens selected', 'error'); return; }
  const prior = _labPrior(s => s.type !== 'Retest' && s.fileName === p.fileName);
  if (!_labRepeatOK(prior, sendToLab, 'The ' + p.building + ' lab form of ' + fecha)) return;
  if (sendToLab && !prior.some(s => /sent/i.test(s.status || '')) &&
      !confirm('Send the lab form for ' + p.building + ' to the laboratory? This will email them.')) return;

  // Fill the lab template client-side (ExcelJS) → the flow only saves + emails it
  // (no throttled Office Scripts). Falls back to rowsJson if the fill fails.
  let contentBase64 = '';
  try { contentBase64 = await buildLabFormB64(p.building, p.collectionDate, p.rows); }
  catch (e) { console.warn('[labform] client fill failed, sending rows only:', e); }
  const body = Object.assign(
    { fileName: p.fileName, building: p.building, collectionDate: p.collectionDate,
      rowsJson: JSON.stringify(p.rows), contentBase64: contentBase64, sendToLab: !!sendToLab },
    submissionMeta('Generator', String(tests.map(t => t.sample).join(', ')), '', sendToLab)
  );
  try {
    if (btn) btn.disabled = true;   // icon-only: dim while busy, keep the icon
    toast(sendToLab ? 'Sending to lab…' : 'Filling lab form…', 'info');
    const res = await _spPost('labform', body);
    if (res && res.duplicate) { toast('This form was just submitted — it was not sent again', 'info'); return; }
    if (typeof fsAddSubmission === 'function') fsAddSubmission(body).catch(e => console.warn('[labform] submission log', e));
    toast(sendToLab ? 'Lab form sent to the laboratory' : 'Lab form filled and archived', 'success');
    if (btn) btn.classList.add('done');   // turn the icon green
    if (typeof refreshSubmissions === 'function') refreshSubmissions();
  } catch (e) {
    console.error('[labform] submit failed:', e);
    toast('Could not generate the lab form', 'error');
  } finally {
    if (btn) btn.disabled = false;
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
async function submitRetestLabForm(retestId, sendToLab, opts) {
  opts = opts || {};
  if (opts.bulk) return _submitRetestLabForm(retestId, sendToLab, opts);   // the bulk send holds the lock
  if (_labBusy) { _labBusyMsg(); return; }
  _labBusy = true;
  try { return await _submitRetestLabForm(retestId, sendToLab, opts); } finally { _labBusy = false; }
}
async function _submitRetestLabForm(retestId, sendToLab, opts) {
  const rec = GH().find(r => r.id === retestId);
  if (!rec) { toast('Retest not found', 'error'); return; }
  const rn = (String(rec.retestNum).match(/\d+/) || ['1'])[0]; // "Retest #2" → "2"
  const kind = labKindOf(rec);                                  // 'Retest' | 'Vector'
  const p = labPayloadRetest(rec, rn, kind);
  if (!p.rows.length) { if (!opts.silent) toast('This ' + kind.toLowerCase() + ' has no pathogen to test', 'error'); return; }
  // Same physical retest = same building + sample + retest # + retest date (the file name carries the time).
  const rnKey = kind === 'Vector' ? 'V' + rn : rn;
  const prior = _labPrior(s => s.type === 'Retest' && String(s.sample) === String(rec.sample) && String(s.retestNum) === rnKey &&
    (!s.building || s.building === p.building) && s.collectionDate === p.collectionDate);
  const flag = (typeof getLabStatusFlag === 'function') ? getLabStatusFlag(rec) : '';
  if (!prior.length && flag) prior.push({ status: flag === 'sent' ? 'Sent to lab' : 'Generated', submittedAt: '' });
  if (!opts.skipConfirm && !_labRepeatOK(prior, sendToLab, kind + ' #' + rn + ' of sample ' + (rec.sample || rec.location))) return;
  if (sendToLab && !opts.skipConfirm && !prior.some(s => /sent/i.test(s.status || '')) &&
      !confirm('Send ' + kind + ' #' + rn + ' lab form for sample ' + (rec.sample || rec.location) + ' to the laboratory? This will email them.')) return;
  let contentBase64 = '';
  try { contentBase64 = await buildLabFormB64(p.building, p.collectionDate, p.rows); }
  catch (e) { console.warn('[labform] retest client fill failed, sending rows only:', e); }
  const body = Object.assign(
    { fileName: p.fileName, building: p.building, collectionDate: p.collectionDate,
      rowsJson: JSON.stringify(p.rows), contentBase64: contentBase64, sendToLab: !!sendToLab },
    submissionMeta('Retest', String(rec.sample), kind === 'Vector' ? 'V' + rn : rn, sendToLab)
  );
  // Show the in-flight spinner on the row (single sends; bulk runs silent).
  if (!opts.silent) {
    if (typeof _retestSending !== 'undefined') _retestSending.add(retestId);
    if (typeof loadRetests === 'function') loadRetests();
  }
  try {
    if (!opts.silent) toast(sendToLab ? 'Sending retest to lab…' : 'Filling retest form…', 'info');
    const res = await _spPost('labform', body);
    if (res && res.duplicate) {
      if (typeof _retestSending !== 'undefined') _retestSending.delete(retestId);
      if (!opts.silent) { if (typeof loadRetests === 'function') loadRetests(); toast('This form was just submitted — it was not sent again', 'info'); }
      return;
    }
    if (typeof fsAddSubmission === 'function') fsAddSubmission(body).catch(e => console.warn('[labform] submission log', e));
    // Mark sent/filled in the DURABLE store (survives Records pulls → no green
    // flicker). Only set AFTER the request completes = confirmed it fired.
    if (typeof setLabStatusFlag === 'function') setLabStatusFlag(rec, sendToLab ? 'sent' : 'filled');
    if (typeof _retestSending !== 'undefined') _retestSending.delete(retestId);
    if (!opts.silent) {
      if (typeof loadRetests === 'function') loadRetests();
      toast(sendToLab ? 'Retest form sent to the laboratory' : 'Retest form filled and archived', 'success');
      if (typeof refreshSubmissions === 'function') refreshSubmissions();
    }
  } catch (e) {
    console.error('[labform] retest submit failed:', e);
    if (typeof _retestSending !== 'undefined') _retestSending.delete(retestId);
    if (!opts.silent) { if (typeof loadRetests === 'function') loadRetests(); toast('Could not generate the retest lab form', 'error'); }
    else throw e;
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
