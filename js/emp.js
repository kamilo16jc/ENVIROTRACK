// ═══════════════════════════════════════════════════════════════
// EMP — Environmental Monitoring Program configuration (SQF 2.4.H)
// Pre-loaded from Caputo's SOP #2.4.H + verified lab accreditation.
// The sampling plan (zones, quotas, pathogens, rotation) is FIXED here
// because the generator implements it — a change goes through an SOP
// revision and a code change. Document facts (SOP version, owner, lab,
// forms), management review and training are editable by admins, with
// a change log. Overrides live in localStorage (cap_emp) until the new
// backend exists. The SQF audit pack reads getEMP().
// ═══════════════════════════════════════════════════════════════
const EMP_DEFAULTS = {
  clause: 'SQF 2.4.H',
  sopVersion: 'Rev. 22 · 01/09/2025',
  purpose: 'Verify the efficacy of sanitation procedures through the absence of indicator microorganisms within the production and surrounding environment.',
  owner: 'Quality Assurance designee',
  frequency: 'Weekly, per manufacturing facility.',
  samplingRules: [
    'Sponge collected no sooner than 3–4 hours after production starts.',
    'One sponge per site — do NOT composite.',
    'Swab ~6 in² in two directions (horizontal & vertical).',
    'Refrigerate samples until lab pick-up.'
  ],
  lab: {
    name: 'Matrix Sciences International Inc.',
    location: '1110 S. Huron Road, Green Bay, WI 54311',
    body: 'ANAB',
    standard: 'ISO/IEC 17025:2017',
    cert: 'AT-1491.06',
    expiry: '2027-06-19',
    scope: 'Listeria monocytogenes, Listeria species, Salmonella, E. coli, S. aureus — Food/Environmental'
  },
  zones: {
    1: 'Direct product-contact surfaces — verified with ATP (Pre-Op), not sponge.',
    2: 'Indirect / adjacent to product contact.',
    3: 'Surrounding Zone 2 (drains, floors, walls, equipment feet).',
    4: 'Distant / non-production (offices, restrooms, docks).'
  },
  plants: {
    '1945':  { total: 10, zones: { 2: 4, 3: 5, 4: 1 }, pathogens: 'All 10 → L. mono · 3 E. coli · 1 Salmonella · 1 S. aureus',
               rotation: 'Line-first: 2 lines/week — one 5 (2 Z2 + 3 Z3), one 4 (2 Z2 + 2 Z3) + 1 Z4. 8 lines (1-6, Chop Area, Grilling Cheese) covered over the cycle; each line gets Zone 2.',
               justification: 'High-moisture cheese production — weekly, Zone 2/3 focused.' },
    '1935':  { total: 8,  zones: { 2: 2, 3: 5, 4: 1 }, pathogens: 'All 8 → L. mono · 3 E. coli · 1 Salmonella · 1 S. aureus',
               rotation: 'Random sites by zone quota, weekly.', justification: 'Zone 2/3 focused, weekly.' },
    '1931E': { total: 7,  zones: { 2: 2, 3: 4, 4: 1 }, pathogens: 'All 7 → E. coli · 3 L. mono · 1 Salmonella · 1 S. aureus',
               rotation: 'Random sites by zone quota, weekly.', justification: 'E. coli primary focus.' },
    '1931W': { total: 7,  zones: { 2: 2, 3: 4, 4: 1 }, pathogens: 'All 7 → E. coli · 3 L. mono · 1 Salmonella · 1 S. aureus',
               rotation: 'Random sites by zone quota, weekly.', justification: 'E. coli primary focus.' }
  },
  forms: [
    '2.4.H.3.A / 3.B / 3.C — Environmental Monitoring Log (1945 / 1935 / 1931)',
    '2.4.H.8 – 2.4.H.11 — Site & date forms per facility',
    '2.5.C.2 — Corrective / Preventive Action (CAPA)',
    '2.4.H.A — Line & Area Descriptors (facility map)'
  ],
  // editable, persisted:
  managementReview: { cadence: '', lastReview: '', nextReview: '' },
  annualProgramReview: '',
  training: [],        // [{ name, role, date, formNo, trainer }]
  trainingForms: []     // issued numbered forms — see training.js
};

function _empStored() {
  try { return JSON.parse(localStorage.getItem('cap_emp') || '{}') || {}; } catch (e) { return {}; }
}
function getEMP() {
  const base = JSON.parse(JSON.stringify(EMP_DEFAULTS));
  const st = _empStored();
  if (st.program) ['sopVersion', 'purpose', 'owner'].forEach(k => { if (st.program[k]) base[k] = st.program[k]; });
  if (st.lab) Object.keys(base.lab).forEach(k => { if (st.lab[k]) base.lab[k] = st.lab[k]; });
  if (Array.isArray(st.forms) && st.forms.length) base.forms = st.forms;
  if (st.managementReview) Object.assign(base.managementReview, st.managementReview);
  if (st.annualProgramReview) base.annualProgramReview = st.annualProgramReview;
  if (Array.isArray(st.training)) base.training = st.training;
  if (Array.isArray(st.trainingForms)) base.trainingForms = st.trainingForms;
  base.changeLog = Array.isArray(st.changeLog) ? st.changeLog : [];
  return base;
}
function _saveEMP(partial) {
  localStorage.setItem('cap_emp', JSON.stringify(Object.assign(_empStored(), partial))); if (typeof storeSaved === 'function') storeSaved('cap_emp');
}

// Only administrators change the program record.
function empCanEdit() {
  return !!(typeof CU !== 'undefined' && CU && typeof isAdmin === 'function' && isAdmin(CU.email, CU.role));
}

// Append one entry per save: who, when, which section and field diffs.
function _empLog(section, changes) {
  if (!changes.length) return;
  const log = getEMP().changeLog.slice();
  log.unshift({ at: new Date().toISOString(), by: (CU && (CU.displayName || CU.email)) || '', section, changes });
  _saveEMP({ changeLog: log.slice(0, 200) });
}
function _empDiff(fields, before, after) {
  return fields.filter(([k]) => String(before[k] || '') !== String(after[k] || ''))
               .map(([k, label]) => ({ field: label, from: before[k] || '', to: after[k] || '' }));
}

const EMP_PROGRAM_FIELDS = [['sopVersion', 'SOP version'], ['owner', 'Program owner'], ['purpose', 'Purpose']];
const EMP_LAB_FIELDS = [['name', 'Laboratory'], ['location', 'Location'], ['body', 'Accreditation body'], ['standard', 'Standard'],
                        ['cert', 'Certificate'], ['expiry', 'Expires'], ['scope', 'Scope']];

let EMP_EDITING = null;   // 'program' | 'lab' | 'forms' | null

function empEdit(section) { if (!empCanEdit()) return; EMP_EDITING = section; renderEMPConfig(); }
function empCancel() { EMP_EDITING = null; renderEMPConfig(); }

// ── Render the Settings → "EMP Program" panel ───────────────────
function renderEMPConfig() {
  const host = document.getElementById('cfgPanel-emp');
  if (!host) return;
  const e = getEMP();
  const admin = empCanEdit();
  const row = (k, v) => '<div style="display:flex;gap:12px;padding:7px 0;border-bottom:1px solid var(--gray-100)"><div style="width:150px;flex:none;color:var(--gray-500);font-size:12px;font-weight:600">' + esc(k) + '</div><div style="font-size:13px;color:var(--gray-900);min-width:0;flex:1">' + v + '</div></div>';
  const fld = (label, html) => '<div class="field" style="margin-bottom:10px"><label>' + esc(label) + '</label>' + html + '</div>';
  const txt = (id, v, ph) => '<input type="text" id="' + id + '" value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '" style="width:100%">';
  const area = (id, v, rows) => '<textarea id="' + id + '" class="capa-ta" rows="' + (rows || 3) + '" style="margin-bottom:0">' + esc(v || '') + '</textarea>';
  const pencil = s => admin && EMP_EDITING !== s
    ? '<button class="emp-edit" onclick="empEdit(\'' + s + '\')" title="Edit" aria-label="Edit"><svg class="ln" width="14" height="14" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>' : '';
  const head = (icon, title, s, extra) => '<div class="card-title emp-head">' + icon + '<span>' + title + '</span>' + (extra || '') + pencil(s) + '</div>';
  const actions = fn => '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px"><button class="btn btn-outline btn-sm" onclick="empCancel()">Cancel</button><button class="btn btn-primary btn-sm" onclick="' + fn + '()">Save</button></div>';

  const IC_DOC = '<svg class="ln ico-inline" width="15" height="15" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  const IC_LAB = '<svg class="ln ico-inline" width="15" height="15" viewBox="0 0 24 24"><path d="M9 3h6M10 3v6l-5.2 8.7A1.5 1.5 0 0 0 6.1 20h11.8a1.5 1.5 0 0 0 1.3-2.3L14 9V3"/></svg>';
  const IC_LOCK = '<svg class="ln ico-inline" width="13" height="13" viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  // lab accreditation status
  const labOk = e.lab.expiry && e.lab.expiry >= todayLocal();
  const labBadge = ' <span class="badge ' + (labOk ? 'badge-green' : 'badge-red') + '" style="margin-left:6px">' + (labOk ? 'Valid' : 'Expired') + '</span>';

  // Program
  const program = EMP_EDITING === 'program'
    ? fld('SOP version', txt('empSop', e.sopVersion, 'e.g. Rev. 23 · 03/01/2027')) +
      fld('Program owner', txt('empOwner', e.owner)) +
      fld('Purpose', area('empPurpose', e.purpose, 3)) + actions('empSaveProgram')
    : row('SQF clause', '<strong>' + esc(e.clause) + '</strong>') +
      row('SOP version', esc(e.sopVersion)) +
      row('Purpose', esc(e.purpose)) +
      row('Program owner', esc(e.owner)) +
      row('Frequency', esc(e.frequency)) +
      row('Sampling rules', '<ul style="margin:0;padding-left:16px">' + e.samplingRules.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>');

  // Lab
  const lab = EMP_EDITING === 'lab'
    ? fld('Laboratory', txt('empLab_name', e.lab.name)) +
      fld('Location', txt('empLab_location', e.lab.location)) +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">' +
        fld('Accreditation body', txt('empLab_body', e.lab.body)) + fld('Standard', txt('empLab_standard', e.lab.standard)) +
        fld('Certificate', txt('empLab_cert', e.lab.cert)) +
        fld('Expires', '<input type="date" id="empLab_expiry" value="' + esc(e.lab.expiry) + '" style="width:100%">') +
      '</div>' +
      fld('Scope', area('empLab_scope', e.lab.scope, 2)) + actions('empSaveLab')
    : row('Laboratory', esc(e.lab.name)) +
      row('Location', esc(e.lab.location)) +
      row('Accreditation', esc(e.lab.body) + ' · ' + esc(e.lab.standard)) +
      row('Certificate', '<strong>' + esc(e.lab.cert) + '</strong>') +
      row('Scope', esc(e.lab.scope)) +
      row('Expires', esc(_empFmt(e.lab.expiry)));

  const plantRows = Object.entries(e.plants).map(([p, d]) =>
    '<tr><td class="ed-plant" style="font-weight:600">' + p + '</td><td style="text-align:center">' + d.total + '</td>' +
    '<td style="text-align:center">' + d.zones[2] + '</td><td style="text-align:center">' + d.zones[3] + '</td><td style="text-align:center">' + d.zones[4] + '</td>' +
    '<td style="font-size:11px">' + esc(d.pathogens) + '</td></tr>').join('');

  const mr = e.managementReview;
  const review = admin
    ? '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end">' +
        '<div class="field"><label>Cadence</label><input type="text" id="empMgmtCadence" placeholder="e.g. Quarterly / Annual" value="' + esc(mr.cadence || '') + '" style="min-width:180px"></div>' +
        '<div class="field"><label>Last review</label><input type="date" id="empMgmtLast" value="' + esc(mr.lastReview || '') + '"></div>' +
        '<div class="field"><label>Annual program review</label><input type="date" id="empAnnual" value="' + esc(e.annualProgramReview || '') + '"></div>' +
        '<button class="btn btn-primary" onclick="empSaveReview()">Save</button>' +
      '</div>'
    : row('Cadence', esc(mr.cadence || '—')) + row('Last review', esc(_empFmt(mr.lastReview))) + row('Annual program review', esc(_empFmt(e.annualProgramReview)));

  const forms = EMP_EDITING === 'forms'
    ? fld('One form per line', area('empForms', e.forms.join('\n'), 6)) + actions('empSaveForms')
    : '<ul style="margin:0;padding-left:18px;font-size:13px;color:var(--gray-800);line-height:1.9">' + e.forms.map(f => '<li>' + esc(f) + '</li>').join('') + '</ul>';

  const logRows = e.changeLog.slice(0, 15).map(c =>
    '<tr><td style="white-space:nowrap;font-size:12px">' + esc(_empFmtTs(c.at)) + '</td><td style="font-size:12px">' + esc(c.by || '—') + '</td><td style="font-size:12px">' + esc(c.section) + '</td>' +
    '<td style="font-size:12px">' + c.changes.map(x => '<div><strong>' + esc(x.field) + ':</strong> ' +
      (x.from ? '<span style="color:var(--gray-500);text-decoration:line-through">' + esc(String(x.from).slice(0, 80)) + '</span> → ' : '') + esc(String(x.to).slice(0, 80)) + '</div>').join('') + '</td></tr>').join('');

  host.innerHTML =
    (admin ? '' : '<div class="emp-note">' + IC_LOCK + ' Read-only — only administrators can change the program record.</div>') +
    '<div class="card">' + head(IC_DOC, 'EMP Program', 'program') + program + '</div>' +
    '<div class="card">' + head(IC_LAB, 'Accredited laboratory', 'lab', labBadge) + lab + '</div>' +

    '<div class="card"><div class="card-title emp-head">' + IC_LOCK + '<span>Sanitary zones</span></div>' +
      Object.entries(e.zones).map(([z, d]) => row('Zone ' + z, esc(d))).join('') +
    '</div>' +

    '<div class="card"><div class="card-title emp-head">' + IC_LOCK + '<span>Sampling plan by building (weekly)</span></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Building</th><th style="text-align:center">Total/week</th><th style="text-align:center">Z2</th><th style="text-align:center">Z3</th><th style="text-align:center">Z4</th><th>Pathogens</th></tr></thead><tbody>' + plantRows + '</tbody></table></div>' +
      '<div style="margin-top:12px;padding:12px;background:var(--green-light);border-radius:8px;font-size:12px;color:var(--gray-800)"><strong>1945 rotation:</strong> ' + esc(e.plants['1945'].rotation) + '</div>' +
      '<div class="emp-locked">Fixed by SOP 2.4.H — the test generator follows this plan. Changing it requires an SOP revision and a system update.</div>' +
    '</div>' +

    '<div class="card"><div class="card-title">Management review</div>' + review + '</div>' +

    trainingCardHtml(e, admin) +

    '<div class="card">' + head(IC_DOC, 'Linked forms &amp; records', 'forms') + forms + '</div>' +

    (logRows ? '<div class="card"><div class="card-title">Change history</div><div class="table-wrap"><table><thead><tr><th>When</th><th>By</th><th>Section</th><th>Change</th></tr></thead><tbody>' + logRows + '</tbody></table></div></div>' : '');
}

function _empFmt(d) {
  if (!d) return '—';
  const x = new Date(d + 'T00:00:00');
  return isNaN(x) ? d : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function _empFmtTs(iso) {
  const x = new Date(iso);
  return isNaN(x) ? (iso || '') : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + x.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
const _empVal = id => ((document.getElementById(id) || {}).value || '').trim();

function empSaveProgram() {
  if (!empCanEdit()) return;
  const before = getEMP();
  const next = { sopVersion: _empVal('empSop'), owner: _empVal('empOwner'), purpose: _empVal('empPurpose') };
  if (!next.sopVersion || !next.owner) { toast('SOP version and program owner are required', 'error'); return; }
  _empLog('Program', _empDiff(EMP_PROGRAM_FIELDS, before, next));
  _saveEMP({ program: next });
  EMP_EDITING = null; toast('Program updated', 'success'); renderEMPConfig();
}
function empSaveLab() {
  if (!empCanEdit()) return;
  const before = getEMP().lab;
  const next = {};
  EMP_LAB_FIELDS.forEach(([k]) => { next[k] = _empVal('empLab_' + k); });
  if (!next.name || !next.cert || !next.expiry) { toast('Laboratory, certificate and expiry are required', 'error'); return; }
  _empLog('Laboratory', _empDiff(EMP_LAB_FIELDS, before, next));
  _saveEMP({ lab: next });
  EMP_EDITING = null; toast('Laboratory updated', 'success'); renderEMPConfig();
}
function empSaveForms() {
  if (!empCanEdit()) return;
  const before = getEMP().forms;
  const next = _empVal('empForms').split('\n').map(s => s.trim()).filter(Boolean);
  if (!next.length) { toast('Add at least one form', 'error'); return; }
  const added = next.filter(f => !before.includes(f)), removed = before.filter(f => !next.includes(f));
  _empLog('Forms', added.map(f => ({ field: 'Added', from: '', to: f })).concat(removed.map(f => ({ field: 'Removed', from: f, to: '' }))));
  _saveEMP({ forms: next });
  EMP_EDITING = null; toast('Forms updated', 'success'); renderEMPConfig();
}
function empSaveReview() {
  if (!empCanEdit()) return;
  const e = getEMP();
  const before = { cadence: e.managementReview.cadence, lastReview: e.managementReview.lastReview, annual: e.annualProgramReview };
  const next = { cadence: _empVal('empMgmtCadence'), lastReview: _empVal('empMgmtLast'), annual: _empVal('empAnnual') };
  _empLog('Management review', _empDiff([['cadence', 'Cadence'], ['lastReview', 'Last review'], ['annual', 'Annual program review']], before, next));
  _saveEMP({ managementReview: Object.assign({}, e.managementReview, { cadence: next.cadence, lastReview: next.lastReview }), annualProgramReview: next.annual });
  toast('Management review saved', 'success'); renderEMPConfig();
}
