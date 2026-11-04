// ═══════════════════════════════════════════════════════════════
// CORRECT A FORM — administrators only, from Test History.
// Finds a saved weekly form by building + date, moves its collection date and
// makes its forms again from the saved tests: the same samples, never a new
// random selection. Works only while every test on the form is still Pending;
// once there is a lab result the form comes from Completed Forms.
// Retests keep their own date control in the Retests page.
// ═══════════════════════════════════════════════════════════════
const FF_FAR_DAYS = 7;
let FF = null;        // the form on screen: { planta, fecha, recs, locked }
let _ffSeq = 0;
let _ffBusy = false;

const _ffVal = id => ((document.getElementById(id) || {}).value || '').trim();
const _ffShow = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
const _ffDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US') : '';
const _ffLocked = recs => recs.some(r => r.resultado !== 'Pending' || labIsPresumptive(r));

async function _ffRead(planta, fecha) {
  return (await _cfFetch(planta, fecha, fecha)).filter(r => !r.retestNum && !r.isRetest).sort((a, b) => a.id - b.id);
}

function openFormFix() {
  if (!canEditRecords()) { toast('Administrators only', 'error'); return; }
  _ffSeq++; FF = null;
  ['ffBuilding', 'ffFecha', 'ffNewDate', 'ffReason'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['ffForm', 'ffOld'].forEach(id => _ffShow(id, false));
  setTxt('ffStatus', 'Choose the building and the date on the form, then click the magnifier.');
  _ffShow('ffStatus', true);
  document.getElementById('formFixModal').classList.add('open');
}
function closeFormFix() {
  _ffSeq++;
  document.getElementById('formFixModal').classList.remove('open');
  FF = null;
}

async function ffSearch() {
  if (!canEditRecords()) { toast('Administrators only', 'error'); return; }
  const planta = _ffVal('ffBuilding'), fecha = _ffVal('ffFecha');
  if (!planta || !fecha) { toast('Choose the building and the date', 'error'); return; }
  const seq = ++_ffSeq;
  FF = null;
  ['ffForm', 'ffOld'].forEach(id => _ffShow(id, false));
  setTxt('ffStatus', 'Searching…'); _ffShow('ffStatus', true);
  let recs;
  try { recs = await _ffRead(planta, fecha); }
  catch (e) {
    console.warn('[formfix] search', e);
    if (seq === _ffSeq) setTxt('ffStatus', 'Could not search — check the connection and try again');
    return;
  }
  if (seq !== _ffSeq) return;
  if (!recs.length) { setTxt('ffStatus', 'No weekly form for ' + planta + ' on ' + _ffDate(fecha) + '. Check the date in Test History.'); return; }
  FF = { planta, fecha, recs, locked: _ffLocked(recs) };
  _ffRender();
}

function _ffRender() {
  _ffShow('ffStatus', false); _ffShow('ffForm', true);
  const f = FF, first = f.recs[0];
  document.getElementById('ffInfo').innerHTML = '<strong>' + esc(f.planta) + '</strong> &nbsp;·&nbsp; collection date <strong>' + esc(_ffDate(f.fecha)) + '</strong> &nbsp;·&nbsp; ' + f.recs.length + ' test' + (f.recs.length === 1 ? '' : 's') +
    '<br><span style="color:var(--gray-500)">Collected by ' + esc(first.by || '—') + ' · production start ' + esc(first.prodStart || '—') + ' · collection ' + esc(first.collTime || '—') + '</span>';
  document.getElementById('ffTests').innerHTML = f.recs.map(r => '<tr><td style="font-weight:700">' + esc(r.sample) + '</td><td style="text-align:center">' + esc(r.zone) + '</td><td>' + esc(r.location || r.area || '') + '</td><td style="white-space:nowrap">' +
    Object.entries(AE_PATS).filter(([k]) => r[k]).map(([, n]) => n).join(', ') + '</td><td>' + esc(labIsPresumptive(r) ? 'Presumptive' : r.resultado) + '</td></tr>').join('');
  _ffShow('ffLocked', f.locked);
  ['ffChange', 'ffMake'].forEach(id => _ffShow(id, !f.locked));
  _ffShow('ffLabSend', typeof canSendToLab === 'function' && CU && canSendToLab(CU.email));
}

function _ffSetBusy(on) {
  _ffBusy = on;
  ['ffSaveBtn', 'ffSwab', 'ffLabFill', 'ffLabSend'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = on; });
}

// Read the form again right before acting on it: someone may have entered a result meanwhile.
async function _ffFresh() {
  const f = FF;
  const recs = await _ffRead(f.planta, f.fecha);
  if (FF !== f) return null;
  if (!recs.length) { toast('This form is no longer on that date — search again', 'error'); return null; }
  f.recs = recs; f.locked = _ffLocked(recs);
  if (f.locked) { _ffRender(); toast('This form now has a lab result — it cannot be changed here', 'error'); return null; }
  return f;
}

async function ffSaveDate() {
  if (!canEditRecords()) { toast('Administrators only', 'error'); return; }
  if (!FF || _ffBusy) return;
  const newDate = _ffVal('ffNewDate'), reason = _ffVal('ffReason');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) { toast('Choose the correct collection date', 'error'); return; }
  if (newDate === FF.fecha) { toast('The new date is the same as the current one', 'error'); return; }
  if (!reason) { toast('Enter the reason for the correction', 'error'); return; }
  _ffSetBusy(true);
  try {
    const f = await _ffFresh();
    if (!f) return;
    const clash = await _ffRead(f.planta, newDate);
    if (clash.length) { toast(f.planta + ' already has a form on ' + _ffDate(newDate) + ' — it was not changed', 'error'); return; }
    const old = f.fecha, days = Math.abs(new Date(newDate + 'T12:00:00') - new Date(todayLocal() + 'T12:00:00')) / 864e5;
    if (!confirm('Change ' + f.recs.length + ' test(s) of ' + f.planta + ' from ' + _ffDate(old) + ' to ' + _ffDate(newDate) + '?' +
      (days > FF_FAR_DAYS ? '\n\nThis date is ' + Math.round(days) + ' days from today.' : ''))) return;

    const updated = f.recs.map(r => Object.assign({}, r, { fecha: newDate }));
    await fsUpdateRecords(updated);      // all or none

    const byId = {}; updated.forEach(r => { byId[r.id] = r; });
    const hist = GH().map(h => byId[h.id] ? Object.assign({}, h, { fecha: newDate }) : h);
    SH(hist);
    f.recs.forEach(r => logRecordChange(byId[r.id], 'correction', recSnap(r), recSnap(byId[r.id]), reason, { always: true, recordDate: old }));

    const oldLab = nameSubmission(f.planta, old);
    const sent = _labPrior(s => s.type !== 'Retest' && s.fileName === oldLab).find(s => /sent/i.test(s.status || ''));
    document.getElementById('ffOldFiles').innerHTML = [oldLab, namePdfGenerator(f.planta, old)].map(n => '<li>' + esc(n) + '</li>').join('');
    _ffShow('ffOldSent', !!sent);
    _ffShow('ffOld', true);

    f.fecha = newDate; f.recs = updated;
    document.getElementById('ffFecha').value = newDate;
    document.getElementById('ffNewDate').value = '';
    document.getElementById('ffReason').value = '';
    _ffRender();
    if (typeof searchHistory === 'function') searchHistory();
    if (typeof refreshDashboard === 'function') refreshDashboard();
    toast(f.recs.length + ' test(s) moved to ' + _ffDate(newDate), 'success');
  } catch (e) {
    console.warn('[formfix] date', e);
    toast(e && e.code === 'permission-denied' ? 'Only administrators can change this date' : 'Nothing was changed — check the connection and try again', 'error');
  } finally { _ffSetBusy(false); }
}

async function ffMakeSwab() {
  if (!canEditRecords()) { toast('Administrators only', 'error'); return; }
  if (!FF || _ffBusy) return;
  _ffSetBusy(true);
  try {
    const f = await _ffFresh();
    if (!f) return;
    const tpl = await swabFormTemplate(f.planta);
    if (!tpl) { toast('Could not load the ' + f.planta + ' form — check the connection and try again', 'error'); return; }
    const first = k => (f.recs.find(r => r[k]) || {})[k] || '';
    const doc = await swabFormDoc(tpl, f.planta, f.fecha, first('by'), first('prodStart'), first('collTime'), f.recs);
    const name = namePdfGenerator(f.planta, f.fecha);
    doc.save(name + '.pdf');
    try { await savePdfToSharePoint(name, doc); toast('Collection form downloaded and archived', 'success'); }
    catch (e) { console.warn('[formfix] archive', e); toast('Collection form downloaded, but it could not be archived in SharePoint', 'error'); }
  } catch (e) {
    console.warn('[formfix] swab', e);
    toast('Could not create the PDF — try again', 'error');
  } finally { _ffSetBusy(false); }
}

async function ffMakeLab(sendToLab) {
  if (!canEditRecords()) { toast('Administrators only', 'error'); return; }
  if (!FF || _ffBusy) return;
  _ffSetBusy(true);
  try {
    const f = await _ffFresh();
    if (!f) return;
    await submitLabFormFor(f.planta, f.fecha, f.recs, sendToLab, null);
  } catch (e) {
    console.warn('[formfix] lab', e);
    toast('Could not generate the lab form', 'error');
  } finally { _ffSetBusy(false); }
}
