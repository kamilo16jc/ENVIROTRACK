// ═══════════════════════════════════════════════════════════════
// COMPLETED FORMS — download the forms of the tests the lab already
// confirmed, watermarked TEST COMPLETED + the confirmation date.
// A form is completed when every test on it has a confirmed result,
// Negative or Positive (retests still open on a positive don't matter).
// Pending and presumptive results keep it out of the list.
// It only makes the PDF: nothing is archived, sent or changed.
// Nothing is read until the magnifier is clicked, and then only the records
// of the chosen dates (and building) come from the server. Type and Sample #
// narrow the result here: a weekly form needs all its tests to know it is complete.
// ═══════════════════════════════════════════════════════════════
const _cfFinal = r => r.resultado === 'Negative' || r.resultado === 'Positive';
const _cfLastDate = recs => recs.map(r => r.resultDate).filter(Boolean).sort().pop() || '';
const CF_MAX_DAYS = 366;
const CF_START = 'Choose the dates and click the magnifier';
let CF_ROWS = [];
let CF_LAST = null;   // the search on screen: { planta, from, to }
let _cfSeq = 0;

// The completed forms among these records, newest first:
// { key, kind: 'Weekly'|'Retest'|'Vector', planta, fecha, sample, confirmed, recs }
function completedForms(hist) {
  const weeks = {}, out = [];
  hist.forEach(r => {
    if (r.retestNum || r.isRetest) {
      if (_cfFinal(r)) out.push({ key: 'r:' + r.id, kind: labKindOf(r), planta: r.planta, fecha: r.fecha, sample: r.sample, confirmed: r.resultDate || '', recs: [r] });
      return;
    }
    const k = r.planta + '|' + r.fecha;
    (weeks[k] = weeks[k] || []).push(r);
  });
  Object.values(weeks).forEach(recs => {
    if (recs.every(_cfFinal)) out.push({ key: 'w:' + recs[0].planta + '|' + recs[0].fecha, kind: 'Weekly', planta: recs[0].planta, fecha: recs[0].fecha, sample: '', confirmed: _cfLastDate(recs), recs });
  });
  return out.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(a.planta).localeCompare(String(b.planta)));
}

const _cfRecs = docs => {
  const c = {};
  docs.forEach(d => { if (d.exists) c[d.id] = _strip(d.data()); });
  return STORE_MAP.cap_h.fromDocs({ records: c });
};

// Always from the server: a partial offline copy could make a form look complete.
async function _cfFetch(planta, from, to) {
  if (!STORE.on) {                                       // localhost without a session
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) throw new Error('Not connected to the server');
    return GH().filter(r => !r.voided && (!planta || r.planta === planta) && r.fecha >= from && r.fecha <= to);
  }
  const col = STORE.db.collection('records');
  const byDate = from === to ? col.where('fecha', '==', from) : col.where('fecha', '>=', from).where('fecha', '<=', to);
  let snap;
  try { snap = await (planta ? byDate.where('planta', '==', planta) : byDate).get({ source: 'server' }); }
  catch (e) {
    if (!planta || e.code !== 'failed-precondition') throw e;   // building + date index not deployed yet
    snap = await byDate.get({ source: 'server' });
  }
  return _cfRecs(snap.docs).filter(r => !planta || r.planta === planta);
}

const _cfPrompt = msg => {
  const tbody = document.getElementById('completedList');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-500);padding:40px">' + msg + '</td></tr>';
};
const _cfCounts = forms => {
  setTxt('cfCountTotal', forms.length);
  setTxt('cfCountWeekly', forms.filter(f => f.kind === 'Weekly').length);
  setTxt('cfCountRetest', forms.filter(f => f.kind !== 'Weekly').length);
};

async function searchCompleted() {
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  const fB = v('cfBuilding'), fT = v('cfType'), fS = v('cfSample'), fF = v('cfFrom'), fU = v('cfTo');
  if (!fF || !fU) { toast('Choose the From and To dates', 'error'); return; }
  if (fF > fU) { toast('The From date is after the To date', 'error'); return; }
  if ((new Date(fU) - new Date(fF)) / 864e5 > CF_MAX_DAYS) { toast('Search one year at most', 'error'); return; }
  const seq = ++_cfSeq, btn = document.getElementById('cfAllBtn');
  CF_ROWS = []; CF_LAST = null;
  if (btn) btn.disabled = true;
  _cfCounts([]); setTxt('cfCount', 0);
  _cfPrompt('Searching…');
  let all;
  try { all = completedForms(await _cfFetch(fB, fF, fU)); }
  catch (e) {
    console.warn('[completed] search', e);
    if (seq === _cfSeq) _cfPrompt('Could not search — check the connection and try again');
    return;
  }
  if (seq !== _cfSeq) return;                            // a newer search is on its way
  CF_LAST = { planta: fB, from: fF, to: fU };
  CF_ROWS = all.filter(f => (!fT || f.kind === fT) && (!fS || f.recs.some(r => String(r.sample) === fS)));
  renderCompleted(all);
}

function renderCompleted(all) {
  _cfCounts(all);
  setTxt('cfCount', CF_ROWS.length);
  const btn = document.getElementById('cfAllBtn'); if (btn) btn.disabled = !CF_ROWS.length;
  const tbody = document.getElementById('completedList');
  if (!tbody) return;
  if (!CF_ROWS.length) { _cfPrompt(all.length ? 'No completed forms match the filters' : 'No completed forms in these dates'); return; }
  const fmt = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US') : '—';
  tbody.innerHTML = CF_ROWS.map((f, i) => {
    const pos = f.recs.filter(r => r.resultado === 'Positive').length, r = f.recs[0];
    const detail = f.kind === 'Weekly' ? f.recs.length + ' test' + (f.recs.length === 1 ? '' : 's') + (pos ? ' · ' + pos + ' positive' : '')
      : esc(r.sample ? 'Sample #' + r.sample : (r.location || 'Site')) + ' · ' + esc(r.resultado);
    return '<tr>' +
      '<td style="font-weight:600">' + (f.kind === 'Weekly' ? 'Weekly form' : esc(r.retestNum || f.kind)) + '</td>' +
      '<td style="text-align:center"><span class="badge badge-gray">' + esc(f.planta) + '</span></td>' +
      '<td style="white-space:nowrap">' + fmt(f.fecha) + '</td>' +
      '<td style="font-size:12px">' + detail + '</td>' +
      '<td style="white-space:nowrap">' + fmt(f.confirmed) + '</td>' +
      '<td style="text-align:center"><button class="rt-btn ico" onclick="downloadCompleted(' + i + ')" title="Download form"><svg class="ln ico-inline" width="13" height="13" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button></td>' +
      '</tr>';
  }).join('');
}

function clearCompletedFilters() {
  ['cfBuilding', 'cfType', 'cfSample', 'cfFrom', 'cfTo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  _cfSeq++; CF_ROWS = []; CF_LAST = null;
  _cfCounts([]); setTxt('cfCount', 0);
  const btn = document.getElementById('cfAllBtn'); if (btn) btn.disabled = true;
  _cfPrompt(CF_START);
}

// First look at the page: empty until a search.
function openCompleted() {
  if (!CF_LAST) clearCompletedFilters();
}

// From the lock on a confirmed retest: straight to that one form.
function openCompletedRetest(id) {
  const r = GH().find(x => x.id === id);
  showPage('completed');
  if (!r) return;
  clearCompletedFilters();
  const set = (i, val) => { const el = document.getElementById(i); if (el) el.value = val; };
  set('cfBuilding', r.planta); set('cfType', labKindOf(r)); set('cfSample', String(r.sample)); set('cfFrom', r.fecha); set('cfTo', r.fecha);
  searchCompleted();
}

// Diagonal gray mark over every page; the form underneath stays readable.
function watermarkCompleted(doc, confirmed) {
  const a = 30 * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const when = confirmed ? 'Confirmed ' + new Date(confirmed + 'T12:00:00').toLocaleDateString('en-US') : '';
  const line = (text, size, cx, cy) => {
    doc.setFontSize(size);
    const w = doc.getTextWidth(text);
    doc.text(text, cx - cos * w / 2, cy + sin * w / 2, { angle: 30 });
  };
  for (let p = 1, n = doc.getNumberOfPages(); p <= n; p++) {
    doc.setPage(p);
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.2 }));
    doc.setFont('helvetica', 'bold'); doc.setTextColor(70, 70, 70);
    line('TEST COMPLETED', 62, W / 2, H / 2);
    if (when) line(when, 24, W / 2 + sin * 19, H / 2 + cos * 19);
    doc.restoreGraphicsState();
  }
  return doc;
}

// The same approved forms the app prints (X on the tested pathogens) + the watermark.
async function buildCompletedDoc(f) {
  let doc, name;
  if (f.kind === 'Weekly') {
    const tpl = await swabFormTemplate(f.planta);
    if (!tpl) throw new Error('Could not load the ' + f.planta + ' form — check the connection and try again');
    const first = k => (f.recs.find(r => r[k]) || {})[k] || '';
    doc = await swabFormDoc(tpl, f.planta, f.fecha, first('by'), first('prodStart'), first('collTime'), f.recs);
    name = namePdfGenerator(f.planta, f.fecha);
  } else {
    const r = f.recs[0], b = buildRetestDoc(r, { plain: true });
    doc = b.doc;
    name = b.kind + ' #' + b.rn + ' - ' + labBuilding(f.planta) + ' (sample ' + r.sample + ') - ' + f.fecha;
  }
  return { doc: watermarkCompleted(doc, f.confirmed), name: name + ' - Completed' };
}

// Read again at download time, just this form: a result re-opened after the list was drawn is no longer completed.
async function _cfFresh(f) {
  const recs = f.kind !== 'Weekly' && STORE.on
    ? _cfRecs([await STORE.db.collection('records').doc(String(f.recs[0].id)).get({ source: 'server' })])
    : await _cfFetch(f.planta, f.fecha, f.fecha);
  return completedForms(recs).find(x => x.key === f.key) || null;
}

async function downloadCompleted(i) {
  if (!CF_ROWS[i]) return;
  try {
    const f = await _cfFresh(CF_ROWS[i]);
    if (!f) { toast('This form is no longer completed', 'error'); searchCompleted(); return; }
    const b = await buildCompletedDoc(f);
    b.doc.save(b.name + '.pdf');
    toast('Form downloaded', 'success');
  } catch (e) { console.warn('[completed]', e); toast(e.message || 'Could not create the PDF — try again', 'error'); }
}

// Everything on the list, in one ZIP.
async function downloadAllCompleted() {
  const rows = CF_ROWS.slice(), last = CF_LAST;
  if (!rows.length || !last) return;
  if (typeof JSZip === 'undefined') { toast('Could not load the ZIP tool — check the connection', 'error'); return; }
  const btn = document.getElementById('cfAllBtn'), label = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Checking…';
  let fresh;
  try { fresh = completedForms(await _cfFetch(last.planta, last.from, last.to)); }   // one read for the whole list
  catch (e) { console.warn('[completed] zip', e); toast('Could not reach the server — try again', 'error'); btn.innerHTML = label; btn.disabled = false; return; }
  const zip = new JSZip(), used = {};
  let done = 0, failed = 0;
  for (const row of rows) {
    btn.textContent = 'Creating ' + (done + 1) + ' of ' + rows.length + '…';
    await new Promise(r => setTimeout(r));              // let the counter paint
    try {
      const f = fresh.find(x => x.key === row.key); if (!f) throw new Error('no longer completed');
      const b = await buildCompletedDoc(f);
      used[b.name] = (used[b.name] || 0) + 1;
      zip.file(b.name + (used[b.name] > 1 ? ' (' + used[b.name] + ')' : '') + '.pdf', b.doc.output('arraybuffer'));
    } catch (e) { failed++; console.warn('[completed] ' + row.key, e); }
    done++;
  }
  try {
    if (failed < rows.length) {
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'Completed Forms - ' + todayLocal() + '.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
    toast(failed ? (rows.length - failed) + ' forms in the ZIP — ' + failed + ' could not be created' : rows.length + ' forms downloaded', failed ? 'error' : 'success');
  } catch (e) { console.warn('[completed] zip', e); toast('Could not create the ZIP — try again', 'error'); }
  btn.innerHTML = label; btn.disabled = false;
}
