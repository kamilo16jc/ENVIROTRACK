// ═══════════════════════════════════════════════════════════════
// CAPA LOG — Reports → SQF Compliance → CAPA Log.
// One register for every corrective & preventive action (form
// 2.5.C.2): the CAPAs attached to positive results (js/capa.js) and
// PROGRAM CAPAs for deviations that are not a positive — e.g. the
// sampling plan not matching SOP #2.4.H. Program CAPAs are numbered
// CAPA-<year>-<NNN> and kept in localStorage (cap_capa_prog) until
// the new backend exists.
// ═══════════════════════════════════════════════════════════════

const PCAPA_KEY = 'cap_capa_prog';
const PCAPA_DISPOSITIONS = [
  'Not applicable — program deviation, no product implicated',
  'Product placed on hold pending review',
  'Product tested and released',
  'Product reworked / destroyed'
];
const PCAPA_VERIFY_WEEKS = 4;   // sampling-plan CAPAs: weeks at 100% adherence to close
let PCAPA_EDIT = null;          // CAPA no. being edited, or '' for a new one

function getProgCapas() { try { return JSON.parse(localStorage.getItem(PCAPA_KEY) || '[]') || []; } catch (e) { return []; } }
function _saveProgCapas(list) { localStorage.setItem(PCAPA_KEY, JSON.stringify(list)); if (typeof storeSaved === 'function') storeSaved(PCAPA_KEY); }
function _pcNextNo() {
  const prefix = 'CAPA-' + todayLocal().slice(0, 4) + '-';
  const max = getProgCapas().filter(c => c.no.startsWith(prefix)).reduce((m, c) => Math.max(m, parseInt(c.no.slice(prefix.length), 10) || 0), 0);
  return prefix + String(max + 1).padStart(3, '0');
}
const _pcFmt = d => (typeof _apFmt === 'function' ? _apFmt(d) : (d || '—'));
const _pcRequired = c => !!(c.title && c.description && c.rootCause && c.correction && c.preventive && c.disposition);

// Sampling-plan CAPAs verify themselves: consecutive building-weeks at
// 100% SOP adherence (all buildings) after the correction date.
function pcapaAutoEffect(c) {
  if (c.kind !== 'sampling') return null;
  if (!c.correctedOn) return { ok: false, text: 'Waiting for the correction date' };
  const plants = typeof AP_PLANTS !== 'undefined' ? AP_PLANTS : ['1945', '1935', '1931E', '1931W'];
  const firstMon = _apMonday(c.correctedOn) === c.correctedOn ? c.correctedOn
    : (() => { const d = new Date(_apMonday(c.correctedOn) + 'T12:00:00'); d.setDate(d.getDate() + 7); return todayLocal(d); })();
  if (firstMon > todayLocal()) return { ok: false, text: '0 of ' + PCAPA_VERIFY_WEEKS + ' weeks verified — first full week starts ' + _pcFmt(firstMon) };
  const weeks = apWeeklyAdherence(firstMon, todayLocal(), plants).filter(w => w.status !== 'current');
  const byWeek = {};
  weeks.forEach(w => { (byWeek[w.week] = byWeek[w.week] || []).push(w); });
  let streak = 0, broke = null;
  Object.keys(byWeek).sort().forEach(k => {
    if (byWeek[k].every(w => w.status === 'ok')) streak++;
    else { streak = 0; broke = k; }
  });
  if (streak >= PCAPA_VERIFY_WEEKS) return { ok: true, text: 'Effective — ' + streak + ' consecutive weeks at 100% SOP adherence' };
  return { ok: false, text: streak + ' of ' + PCAPA_VERIFY_WEEKS + ' consecutive weeks at 100% adherence' + (broke ? ' (reset after week of ' + _pcFmt(broke) + ')' : '') };
}

function pcapaStatus(c) {
  if (c.verifyResult === 'Not effective') return 'Not effective';
  const auto = pcapaAutoEffect(c);
  if (_pcRequired(c) && c.correctedOn && (c.verifyResult === 'Effective' || (auto && auto.ok)) && c.verifiedBy) return 'Closed';
  if (_pcRequired(c) && c.correctedOn) return 'Verification pending';
  return 'Open';
}

// ── Templates ──────────────────────────────────────────────────
// The template TEXT is confidential, so it is not in this (public) code:
// it lives in Firestore private/capaTemplates (signed-in users only) and
// {{tokens}} are filled here with live values.
let PCAPA_TEMPLATES = {};
function pcLoadTemplates() {
  if (typeof storePrivate !== 'function') return Promise.resolve();
  return storePrivate('capaTemplates').then(t => { PCAPA_TEMPLATES = t || {}; }).catch(() => {});
}
function _pcTemplateVars() {
  const emp = getEMP(), P = emp.plants;
  const start = typeof SQF_PROGRAM_START !== 'undefined' ? SQF_PROGRAM_START : '2026-06-22';
  const plants = typeof AP_PLANTS !== 'undefined' ? AP_PLANTS : ['1945', '1935', '1931E', '1931W'];
  const wk = apWeeklyAdherence(start, todayLocal(), plants).filter(w => w.status !== 'current');
  const z = p => P[p].zones[2] + '/' + P[p].zones[3] + '/' + P[p].zones[4];
  return {
    start, startFmt: _pcFmt(start), sop: emp.sopVersion, verifyWeeks: PCAPA_VERIFY_WEEKS,
    wkOk: wk.filter(w => w.status === 'ok').length, wkTotal: wk.length,
    pos: GH().filter(h => !h.isRetest && !String(h.retestNum || '') && h.resultado === 'Positive' && h.fecha >= start).length,
    z1945: z('1945'), z1935: z('1935'), z1931E: z('1931E'), t1945: P['1945'].total, t1935: P['1935'].total, t1931E: P['1931E'].total
  };
}
const _pcFill = (txt, v) => String(txt || '').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? v[k] : m));

// ── CAPA Log sub-tab ───────────────────────────────────────────
function renderCapaLog() {
  const host = document.getElementById('capaLogBody'); if (!host) return;
  if (!Object.keys(PCAPA_TEMPLATES).length) pcLoadTemplates();
  const badge = st => '<span class="badge ' + (st === 'Closed' ? 'badge-green' : st === 'Open' || st === 'Not effective' ? 'badge-red' : 'badge-gray') + '">' + esc(st) + '</span>';

  const prog = getProgCapas().slice().sort((a, b) => b.no.localeCompare(a.no));
  const progRows = prog.map(c => {
    const auto = pcapaAutoEffect(c);
    return '<tr class="cl-row" onclick="openProgCapa(\'' + c.no + '\')"><td class="cl-no">' + esc(c.no) + '</td><td>' + esc(_pcFmt(c.openedOn)) + '</td>' +
      '<td><div style="font-weight:600">' + esc(c.title || '—') + '</div><div class="cl-sub">' + esc(c.reference || '') + '</div></td>' +
      '<td style="font-size:12px">' + esc(auto ? auto.text : (c.verifyResult || 'Not verified')) + '</td><td>' + badge(pcapaStatus(c)) + '</td></tr>';
  }).join('') || '<tr><td colspan="5" class="cl-empty">No program deviations recorded</td></tr>';

  const pos = GH().filter(h => h.resultado === 'Positive' && ((!h.isRetest && !String(h.retestNum || '')) || isVectorRec(h))).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const posRows = pos.map(p => {
    const c = typeof getCapa === 'function' ? getCapa(p.id) : null;
    const eff = typeof capaEffectiveness === 'function' ? capaEffectiveness(p.id) : { ok: false, text: '—' };
    const st = !capaComplete(c) ? 'Open' : (eff.ok && c.verifiedBy) ? 'Closed' : 'Verification pending';
    return '<tr class="cl-row" onclick="openCapaModal(' + p.id + ')"><td class="cl-no">' + (p.sample ? '#' + esc(p.sample) : esc(p.location || 'Site')) + ' · ' + esc(p.planta) + (isVectorRec(p) ? '<div class="cl-sub">' + esc(p.retestNum) + '</div>' : '') + '</td><td>' + esc(_pcFmt(p.fecha)) + '</td>' +
      '<td><div style="font-weight:600">' + esc(_apPath(p)) + ' positive</div><div class="cl-sub">Zone ' + esc(p.zone || '—') + ' · ' + esc(p.area || '') + (p.location ? ' — ' + esc(p.location) : '') + '</div></td>' +
      '<td style="font-size:12px">' + esc(eff.text) + '</td><td>' + badge(st) + '</td></tr>';
  }).join('') || '<tr><td colspan="5" class="cl-empty">No positive results</td></tr>';

  const head = '<thead><tr><th style="width:150px">No.</th><th style="width:110px">Opened</th><th>Subject</th><th style="width:260px">Effectiveness</th><th style="width:140px">Status</th></tr></thead>';
  host.innerHTML =
    '<div class="card"><div class="card-title emp-head"><span>Program deviations</span>' +
      (empCanEdit() ? '<button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="openProgCapa(\'\')">New CAPA</button>' : '') + '</div>' +
      '<div class="table-wrap"><table>' + head + '<tbody>' + progRows + '</tbody></table></div></div>' +
    '<div class="card"><div class="card-title">Positive results</div>' +
      '<div class="table-wrap"><table>' + head + '<tbody>' + posRows + '</tbody></table></div></div>';
}

// ── Program CAPA modal (reuses the #capaModal shell) ───────────
function openProgCapa(no) {
  const admin = empCanEdit();
  const c = no ? (getProgCapas().find(x => x.no === no) || {}) : { openedOn: todayLocal(), disposition: PCAPA_DISPOSITIONS[0] };
  PCAPA_EDIT = no || '';
  const ro = admin ? '' : ' disabled';
  const ta = (id, v, ph, rows) => '<textarea id="' + id + '" class="capa-ta" rows="' + (rows || 3) + '" placeholder="' + esc(ph || '') + '"' + ro + '>' + esc(v || '') + '</textarea>';
  const inp = (id, v, type, ph) => '<input type="' + (type || 'text') + '" id="' + id + '" class="vec-input" style="width:100%" value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '"' + ro + '>';
  const lbl = t => '<div class="modal-label">' + t + '</div>';
  const auto = pcapaAutoEffect(c);

  document.getElementById('capaModalBody').innerHTML =
    '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">' +
      '<h3 style="margin:0">Corrective &amp; Preventive Action — 2.5.C.2</h3><span class="tr-no">' + esc(no || ((typeof storeActive === 'function' && storeActive()) ? 'Number assigned on save' : _pcNextNo())) + '</span></div>' +
    '<p class="vec-help" style="margin-top:4px">Program deviation — not linked to a positive result.' + (c.no ? ' Status: <strong>' + esc(pcapaStatus(c)) + '</strong>' : '') + '</p>' +
    (admin && !no && Object.keys(PCAPA_TEMPLATES).length ? '<div class="vec-row" style="margin-bottom:10px"><div style="flex:1">' + lbl('Start from template') +
      '<select id="pcTpl" class="vec-input" style="width:100%" onchange="pcApplyTemplate(this.value)"><option value="">— Blank —</option>' +
      Object.entries(PCAPA_TEMPLATES).map(([k, t]) => '<option value="' + k + '">' + esc(t.label || k) + '</option>').join('') + '</select></div></div>' : '') +
    lbl('Deviation (title) *') + inp('pcTitle', c.title) +
    '<div class="vec-row" style="margin-top:8px"><div style="flex:1">' + lbl('Reference') + inp('pcRef', c.reference, '', 'SQF 2.4.H · SOP #2.4.H') + '</div>' +
      '<div>' + lbl('Opened') + inp('pcOpened', c.openedOn, 'date') + '</div></div>' +
    '<div class="vec-row" style="margin-top:8px"><div style="flex:1">' + lbl('Detected by / source') + inp('pcSource', c.source, '', 'Internal review, audit, complaint…') + '</div></div>' +
    '<div class="vec-row" style="margin-top:8px"><div>' + lbl('Period affected — from') + inp('pcFrom', c.periodFrom, 'date') + '</div>' +
      '<div>' + lbl('to') + inp('pcTo', c.periodTo, 'date') + '</div></div>' +
    '<div style="margin-top:10px">' + lbl('Description of the deviation *') + ta('pcDesc', c.description, 'What happened, where, since when, how it was found', 4) + '</div>' +
    lbl('Risk assessment') + ta('pcRisk', c.risk, 'Impact on food safety / product', 3) +
    lbl('Root cause *') + ta('pcRoot', c.rootCause, 'Why it happened', 3) +
    lbl('Correction / corrective action *') + ta('pcCorr', c.correction, 'What was done to fix it', 3) +
    '<div class="vec-row" style="margin-bottom:10px"><div>' + lbl('Correction completed on') + inp('pcCorrOn', c.correctedOn, 'date') + '</div></div>' +
    lbl('Preventive action *') + ta('pcPrev', c.preventive, 'What prevents it from happening again', 3) +
    lbl('Product disposition *') +
    '<select id="pcDisp" class="vec-input" style="width:100%"' + ro + '>' + PCAPA_DISPOSITIONS.map(d => '<option' + (c.disposition === d ? ' selected' : '') + '>' + esc(d) + '</option>').join('') + '</select>' +
    '<div style="margin-top:12px">' + lbl('Verification of effectiveness') + ta('pcPlan', c.verifyPlan, 'How and when effectiveness will be verified', 2) + '</div>' +
    (auto ? '<div class="capa-eff ' + (auto.ok ? 'ok' : '') + '" id="pcAuto" style="margin-bottom:10px">' + esc(auto.text) + '</div>' : '<div id="pcAuto"></div>') +
    '<div class="vec-row"><div style="flex:1">' + lbl('Verified by') + inp('pcVerBy', c.verifiedBy, '', 'SQF Practitioner / QA Manager') + '</div>' +
      '<div>' + lbl('Date') + inp('pcVerDate', c.verifiedDate, 'date') + '</div>' +
      '<div>' + lbl('Result') + '<select id="pcVerRes" class="vec-input"' + ro + '>' + ['', 'Effective', 'Not effective'].map(v => '<option value="' + v + '"' + ((c.verifyResult || '') === v ? ' selected' : '') + '>' + (v || '— Pending —') + '</option>').join('') + '</select></div></div>' +
    (c.updatedAt ? '<p class="vec-help" style="margin-top:10px">Last updated ' + new Date(c.updatedAt).toLocaleString('en-US') + (c.updatedBy ? ' by ' + esc(c.updatedBy) : '') + '</p>' : '') +
    '<div class="modal-actions"><button class="btn btn-outline" onclick="closeCapaModal()">' + (admin ? 'Cancel' : 'Close') + '</button>' +
      (admin ? '<button class="btn btn-primary" onclick="saveProgCapa()">Save CAPA</button>' : '') + '</div>';
  document.getElementById('capaModal').dataset.kind = (c.kind || '');
  document.getElementById('capaModal').classList.add('open');
}

function pcApplyTemplate(k) {
  const t = PCAPA_TEMPLATES[k]; if (!t) return;
  const vars = _pcTemplateVars();
  const f = x => _pcFill(x, vars);
  const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
  set('pcTitle', f(t.title)); set('pcRef', f(t.reference)); set('pcSource', f(t.source)); set('pcFrom', vars.start); set('pcTo', '');
  set('pcDesc', f(t.description)); set('pcRisk', f(t.risk)); set('pcRoot', f(t.rootCause)); set('pcCorr', f(t.correction));
  set('pcPrev', f(t.preventive)); set('pcDisp', PCAPA_DISPOSITIONS[0]); set('pcPlan', f(t.verifyPlan));
  document.getElementById('capaModal').dataset.kind = t.kind || '';
  toast('Template loaded — review every field before saving', 'info');
}

async function _pcAssignNo() {
  if (typeof storeActive === 'function' && storeActive()) {
    const prefix = 'CAPA-' + todayLocal().slice(0, 4);
    const floor = getProgCapas().filter(c => c.no.startsWith(prefix + '-')).reduce((m, c) => Math.max(m, parseInt(c.no.slice(prefix.length + 1), 10) || 0), 0);
    return storeNextNumber(prefix, floor);
  }
  return _pcNextNo();
}

async function saveProgCapa() {
  if (!empCanEdit() || PCAPA_EDIT === null) return;
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  const list = getProgCapas();
  const prev = PCAPA_EDIT ? list.find(x => x.no === PCAPA_EDIT) : null;
  let newNo = null;
  if (!prev) {
    if (!v('pcTitle')) { toast('Enter the deviation title', 'error'); return; }
    try { newNo = await _pcAssignNo(); }
    catch (e) { toast('Could not get a CAPA number from the server — check the connection and try again', 'error'); return; }
  }
  const rec = Object.assign(prev || { no: newNo, createdAt: new Date().toISOString(), createdBy: (CU && CU.displayName) || '' }, {
    kind: document.getElementById('capaModal').dataset.kind || (prev && prev.kind) || '',
    title: v('pcTitle'), reference: v('pcRef'), source: v('pcSource'), openedOn: v('pcOpened') || todayLocal(),
    periodFrom: v('pcFrom'), periodTo: v('pcTo'), description: v('pcDesc'), risk: v('pcRisk'),
    rootCause: v('pcRoot'), correction: v('pcCorr'), correctedOn: v('pcCorrOn'), preventive: v('pcPrev'),
    disposition: v('pcDisp'), verifyPlan: v('pcPlan'), verifiedBy: v('pcVerBy'), verifiedDate: v('pcVerDate'), verifyResult: v('pcVerRes'),
    updatedAt: new Date().toISOString(), updatedBy: (CU && CU.displayName) || ''
  });
  if (!rec.title) { toast('Enter the deviation title', 'error'); return; }
  if (!prev) list.push(rec);
  _saveProgCapas(list);
  closeCapaModal(); renderCapaLog();
  toast(rec.no + (_pcRequired(rec) ? ' saved' : ' saved — required fields still missing'), _pcRequired(rec) ? 'success' : 'info');
}
