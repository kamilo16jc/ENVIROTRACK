// ═══════════════════════════════════════════════════════════════
// CAPA & VECTOR SAMPLING — corrective action on positives
// SOP 2.4.H §7 (corrective actions) · form 2.5.C.2 (CAPA)
//
// • Vector samples are stored as Records exactly like retests (same
//   originalId = the case root, isRetest:true) but with retestNum
//   "Vector #N", so they go to the lab and sync through the existing
//   Records flow with no new SharePoint columns. A positive vector is
//   escalated by the normal flow (it spawns its own round of 3 retests).
// • The 3 retests at the original site stay the ONLY closure criterion
//   (3 consecutive negatives) — vectors never count toward it.
// • CAPA (form 2.5.C.2): one per event, see the CAPA section below.
// ═══════════════════════════════════════════════════════════════
const VECTOR_MAX = 5;   // SOP 2.4.H: recommended limit is five vector locations

function isVectorRec(h) { return /^vector/i.test(String((h && h.retestNum) || '')); }
function caseVectors(rootId) { return GH().filter(h => h.originalId === rootId && isVectorRec(h)); }
function caseRetests(rootId) { return GH().filter(h => h.originalId === rootId && h.retestNum && !isVectorRec(h)); }

// How many times this site (building + sample) has come back positive → harborage flag.
function sitePositiveCount(planta, sample) {
  if (!sample) return 0;
  return GH().filter(h => h.planta === planta && String(h.sample) === String(sample) && h.resultado === 'Positive').length;
}

function _failedFlags(rec) {
  const failed = (Array.isArray(rec.failedPathogens) && rec.failedPathogens.length)
    ? rec.failedPathogens : ['ecoli', 'listeria', 'salmonella', 'saureus'].filter(k => rec[k]);
  const f = { ecoli: 0, listeria: 0, salmonella: 0, saureus: 0 };
  failed.forEach(k => { if (k in f) f[k] = 1; });
  return f;
}
const _patLabel = { ecoli: 'E. coli', listeria: 'Listeria', salmonella: 'Salmonella', saureus: 'S. aureus' };

// ── VECTOR SAMPLING ────────────────────────────────────────────
let VECROOT = null;

function openVectorModal(rootId) {
  const root = GH().find(h => h.id === rootId); if (!root) return;
  VECROOT = rootId;
  const existing = caseVectors(rootId);
  const left = VECTOR_MAX - existing.length;
  const used = new Set(existing.map(v => String(v.sample)));
  const L = String(root.line || ''), A = String(root.area || '').toLowerCase(), rz = Number(root.zone) || 0;

  // Rank MASTER points by closeness to the positive: same line, same area, same/adjacent zone.
  const cands = getActiveMaster(root.planta)
    .filter(p => String(p.sample) !== String(root.sample) && !used.has(String(p.sample)))
    .map(p => {
      let score = 0; const why = [];
      if (L && L !== 'N/A' && String(p.line) === L) { score += 3; why.push('same line'); }
      if (A && String(p.area || '').toLowerCase() === A) { score += 2; why.push('same area'); }
      const dz = Math.abs((Number(p.zone) || 0) - rz);
      if (dz === 0) { score += 1; why.push('same zone'); } else if (dz === 1) { score += 1; why.push('adjacent zone'); }
      return { p, score, why };
    })
    .sort((a, b) => b.score - a.score || a.p.sample - b.p.sample)
    .slice(0, 24);

  const flags = _failedFlags(root);
  const pats = Object.keys(flags).filter(k => flags[k]).map(k => _patLabel[k]).join(', ') || '—';
  const nextDay = todayLocal(getNextWeekday(new Date()));

  const list = cands.length ? cands.map(c =>
    '<label class="vec-cand"><input type="checkbox" class="vec-pick" value="' + c.p.sample + '" onchange="vecLimit()" ' + (left <= 0 ? 'disabled' : '') + '>' +
    '<span class="vec-s">#' + c.p.sample + '</span><span class="vec-z">Z' + (c.p.zone || '?') + '</span>' +
    '<span class="vec-l">' + esc(c.p.area || '') + (c.p.location ? ' — ' + esc(c.p.location) : '') + '</span>' +
    '<span class="vec-w">' + esc(c.why.join(' · ') || 'same building') + '</span></label>').join('')
    : '<div style="color:var(--gray-500);font-size:13px;padding:10px">No other MASTER points in this building.</div>';

  const listed = existing.length ? '<div class="vec-existing"><strong>Already scheduled:</strong> ' +
    existing.map(v => esc(v.retestNum) + ' · #' + (v.sample || esc(v.location)) + ' (' + esc(v.resultado) + ')').join(' &nbsp;|&nbsp; ') + '</div>' : '';

  document.getElementById('vectorModalBody').innerHTML =
    '<h3><svg class="ln ico-inline" width="15" height="15" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="10"/></svg>Vector Sampling</h3>' +
    '<div class="vec-info"><strong>Sample #' + root.sample + '</strong> · ' + esc(root.planta) + ' · Zone ' + (root.zone || '—') +
      '<br>' + esc(root.area || '') + (root.location ? ' — ' + esc(root.location) : '') + '<br>Positive ' + esc(root.fecha) + ' · ' + esc(pats) + '</div>' +
    '<p class="vec-help">Vector sampling looks for the <strong>source</strong>: up to five locations at varying distances and directions around the positive, including spots that may have been cross-contaminated — ideally before the area is sanitized. It does not replace the 3 retests at this site, and routine weekly sampling continues as normal (SOP 2.4.H).</p>' +
    listed +
    '<div class="vec-row"><div><div class="modal-label">Collection date</div><input type="date" id="vecDate" value="' + nextDay + '" class="vec-input"></div>' +
      '<div class="vec-slots" id="vecSlots">' + Math.max(0, left) + ' of ' + VECTOR_MAX + ' slots available</div></div>' +
    '<div class="modal-label" style="margin-top:12px">Suggested locations (closest first)</div>' +
    '<div class="vec-list">' + list + '</div>' +
    '<div class="modal-label" style="margin-top:12px">Other location (not in MASTER)</div>' +
    '<div class="vec-row"><input type="text" id="vecOther" placeholder="e.g. floor crack by column B4" class="vec-input" style="flex:1" ' + (left <= 0 ? 'disabled' : '') + ' oninput="vecLimit()">' +
      '<select id="vecOtherZone" class="vec-input" style="width:110px"><option value="2">Zone 2</option><option value="3" selected>Zone 3</option><option value="4">Zone 4</option></select></div>' +
    '<div class="modal-actions"><button class="btn btn-outline" onclick="closeVectorModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="confirmVector()" ' + (left <= 0 ? 'disabled' : '') + '>Schedule vector samples</button></div>';
  document.getElementById('vectorModal').classList.add('open');
  vecLimit();
}

function vecLimit() {
  const root = GH().find(h => h.id === VECROOT); if (!root) return;
  const left = VECTOR_MAX - caseVectors(VECROOT).length;
  const other = (document.getElementById('vecOther') || {}).value;
  const picked = document.querySelectorAll('.vec-pick:checked').length + (other && other.trim() ? 1 : 0);
  document.querySelectorAll('.vec-pick').forEach(c => { if (!c.checked) c.disabled = picked >= left; });
  const s = document.getElementById('vecSlots');
  if (s) s.textContent = picked + ' selected · ' + Math.max(0, left - picked) + ' of ' + VECTOR_MAX + ' slots left';
}

function closeVectorModal() { document.getElementById('vectorModal').classList.remove('open'); VECROOT = null; }

function confirmVector() {
  const hist = GH(); const root = hist.find(h => h.id === VECROOT); if (!root) return;
  const date = document.getElementById('vecDate').value;
  if (!date) { toast('Select a collection date', 'error'); return; }
  const existing = caseVectors(root.id);
  const left = VECTOR_MAX - existing.length;
  const master = getActiveMaster(root.planta);
  const picks = [...document.querySelectorAll('.vec-pick:checked')]
    .map(c => master.find(p => String(p.sample) === c.value)).filter(Boolean);
  const other = document.getElementById('vecOther').value.trim();
  if (other) picks.push({ sample: 0, zone: Number(document.getElementById('vecOtherZone').value) || 3, area: 'Vector', line: '', location: other });
  if (!picks.length) { toast('Select at least one location', 'error'); return; }
  if (picks.length > left) { toast('Only ' + left + ' vector slot(s) left (SOP limit: ' + VECTOR_MAX + ')', 'error'); return; }

  const flags = _failedFlags(root);
  let n = existing.length;
  let nextId = Math.max(0, ...hist.map(h => h.id)) + 1;
  const recs = picks.map(pt => Object.assign({
    id: nextId++, fecha: date, planta: root.planta, by: (CU && CU.displayName) || '',
    sample: pt.sample || 0, zone: pt.zone, area: pt.area || '', line: pt.line || '', location: pt.location || '',
    resultado: 'Pending', retestNum: 'Vector #' + (++n), labNotes: '',
    isRetest: true, originalId: root.id, scheduled: true
  }, flags));
  hist.push(...recs);
  SH(hist);
  syncSafe(() => syncPushRecords(recs), 'push vector samples');
  closeVectorModal();
  loadRetests(); if (typeof searchHistory === 'function') searchHistory(); if (typeof refreshDashboard === 'function') refreshDashboard();
  toast(recs.length + ' vector sample(s) scheduled for Sample #' + root.sample, 'success');
}

// A positive already got its follow-up when the SAME site has retests dated
// after it — even if that round was recorded under another origin (legacy
// escalations were logged under the first positive, e.g. 1935 #148 in July).
function siteRetestedAfter(p, hist) {
  // A positive RETEST's own later siblings (#2/#3 of the same round) are not a
  // follow-up of it — only a new round is: retests linked to it, retests of
  // another case, or a round under the same original that restarts its numbering.
  const num = r => parseInt(String(r.retestNum || '').replace(/\D/g, ''), 10) || 0;
  return (hist || GH()).some(x => x.planta === p.planta && String(x.sample) === String(p.sample) &&
    x.retestNum && !isVectorRec(x) && x.id !== p.id && String(x.fecha) > String(p.fecha) &&
    (!p.retestNum || x.originalId === p.id || x.originalId !== p.originalId || num(x) <= num(p)));
}

// A positive case is CLOSED when its retests confirmed it (3 consecutive
// negatives) or it was closed manually in the legacy system (a resolved anchor
// that is not just "retests scheduled"). Same rule for every report.
function caseClosed(rootId) {
  if (typeof capaEffectiveness === 'function' && capaEffectiveness(rootId).ok) return true;
  return (typeof GRV === 'function' ? GRV() : []).some(r => r.originalId === rootId && !r.closedOnGenerate);
}

// Sites of a building with an OPEN positive follow-up: a positive whose
// retests are not scheduled yet, or whose retests are still pending. The
// weekly generator skips these — they are being retested, not rotated.
function sitesInFollowUp(planta) {
  const hist = GH().filter(h => h.planta === planta);
  const rids = new Set(GRV().map(r => r.originalId));
  const out = new Set();
  hist.forEach(h => {
    if (h.resultado !== 'Positive' || !h.sample) return;
    const kids = hist.filter(r => r.originalId === h.id && r.retestNum && !isVectorRec(r));
    const start = typeof SQF_PROGRAM_START !== 'undefined' ? SQF_PROGRAM_START : '';
    const open = kids.length ? kids.some(r => r.resultado === 'Pending') : (h.fecha >= start && !rids.has(h.id) && !siteRetestedAfter(h, hist));
    if (open) out.add(String(h.sample));
  });
  hist.forEach(h => { if (h.retestNum && !isVectorRec(h) && h.resultado === 'Pending' && h.sample) out.add(String(h.sample)); });
  hist.forEach(h => { if (h.sample && typeof labIsPresumptive === 'function' && labIsPresumptive(h)) out.add(String(h.sample)); });
  return out;
}

// ── CAPA (form 2.5.C.2) ─────────────────────────────────────────
// SOP 2.4.H: every positive is addressed with a documented corrective action
// (root cause investigated, correction taken) and its efficacy is confirmed by
// three consecutive negative retests; L. monocytogenes also needs the
// prevention written down. To keep it light:
//   • ONE CAPA per EVENT — positives of the same building and collection date
//     can share it (the others store { linkedTo: <primary root id> }).
//   • The system fills what it already knows (sites, pathogens, counts,
//     history, retests, vectors); the user picks a root cause, ticks the
//     corrections done (SOP §7 list) and writes the prevention when needed.
//   • Verification is automatic from the retests; a Manager / Administrator
//     approves with one click (name + date = the audit record).
//   • Due: documented before retest #1.
const CAPA_KEY = 'cap_capa';
const CAPA_ACTIONS = [
  ['cleaning',  'Reviewed completed cleaning records and standard cleaning methods'],
  ['handling',  'Audited employee handling practices'],
  ['harborage', 'Looked for harborages / sanitary-design deficiencies in equipment & facility'],
  ['breakdown', 'Complete break-down, wash-down and thorough swabbing of target area'],
  ['atp',       'ATP swabbing performed'],
  ['traffic',   'Reviewed facility traffic patterns'],
  ['water',     'Eliminated water collection points'],
  ['vector',    'Vector sampling to find a potential source'],
  ['sanitizer', 'Applied Quat floor conditioner / Peracetic Acid / Alpet sanitizer']
];
const CAPA_CAUSES = [
  ['cleaning',    'Inadequate cleaning / sanitation of the site'],
  ['handling',    'Employee practices / handling'],
  ['harborage',   'Harborage or sanitary-design deficiency'],
  ['water',       'Water accumulation / condensation'],
  ['traffic',     'Traffic pattern / cross-contamination'],
  ['maintenance', 'Equipment damage or maintenance activity'],
  ['unknown',     'No specific cause found after investigation'],
  ['other',       'Other (describe)']
];
// One-click starting points for the preventive action (editable).
const CAPA_PREV_HINTS = {
  cleaning:    'Retrain the sanitation crew on the SSOP for this area and verify with ATP swabs for the next 4 weeks.',
  handling:    'Retrain employees in the area on hygienic practices and add a supervisor check to the daily pre-op.',
  harborage:   'Repair / seal the harborage point (work order) and add the site to the master sampling list for follow-up.',
  water:       'Correct the water source (drainage, leak or condensation) and add a daily check of the area to the pre-op.',
  traffic:     'Adjust the traffic flow / add a footbath or sanitizing step at the entry point and retrain staff.',
  maintenance: 'Require sanitation and swab verification after maintenance work in this area before production restarts.',
  unknown:     'Increase sampling of the site and adjacent areas for the next 4 weeks to confirm the source is controlled.'
};
const CAPA_DISPOSITIONS = [
  'Not applicable — environmental site, no product affected',
  'Product placed on hold pending results',
  'Product tested and released',
  'Product reworked / destroyed'
];
const CAPA_PREV_NA = 'Not required — single indicator positive (E. coli / S. aureus); corrective action and verification retests are sufficient.';
let CAPAROOT = null;

function getCapaAll() { try { return JSON.parse(localStorage.getItem(CAPA_KEY) || '{}'); } catch (e) { return {}; } }
const _capaEmpty = e => !e || (!e.linkedTo && !e.rootCat && !e.rootCause && !e.correction && !(e.actions || []).length);
// The id of the CAPA that covers this positive (itself, or the event it was linked to).
function capaPrimaryId(rootId) { const e = getCapaAll()[rootId]; return e && e.linkedTo ? e.linkedTo : rootId; }
function getCapa(rootId) { const c = getCapaAll()[capaPrimaryId(rootId)]; return _capaEmpty(c) ? null : c; }
function capaRootsOf(primaryId) { const c = getCapaAll()[primaryId]; return [primaryId].concat(((c && c.roots) || []).filter(id => id !== primaryId)); }
function capaComplete(c) { return !!(c && c.rootCause && c.correction && c.preventive && c.disposition); }
function canApproveCapa() { return !!(typeof CU !== 'undefined' && CU && (CU.role === 'Manager' || (typeof isAdmin === 'function' && isAdmin(CU.email, CU.role)))); }

// Efficacy per SOP: 3 consecutive negative retests at the original site.
function capaEffectiveness(rootId) {
  const rts = caseRetests(rootId);
  if (!rts.length) return { ok: false, text: 'Retests not scheduled yet' };
  if (rts.some(r => r.resultado === 'Positive')) return { ok: false, bad: true, text: 'Not effective — a retest was positive (escalated to a new round)' };
  const neg = rts.filter(r => r.resultado === 'Negative').length;
  if (rts.length >= 3 && neg === rts.length) return { ok: true, text: 'Confirmed — 3 consecutive negative retests' };
  return { ok: false, text: neg + ' of 3 retests negative so far' };
}
// Same, for every site covered by the event.
function capaEventEffect(primaryId) {
  const roots = capaRootsOf(primaryId), effs = roots.map(capaEffectiveness);
  if (roots.length === 1) return effs[0];
  const ok = effs.filter(e => e.ok).length;
  if (effs.some(e => e.bad)) return { ok: false, bad: true, text: 'Not effective — a retest was positive at one of the sites' };
  return ok === roots.length ? { ok: true, text: 'Confirmed — 3 consecutive negative retests at all ' + roots.length + ' sites' } : { ok: false, text: ok + ' of ' + roots.length + ' sites confirmed (3 negative retests)' };
}
// Date the CAPA must be documented by: the first retest of any covered site.
function capaDue(primaryId) {
  const d = capaRootsOf(primaryId).map(id => caseRetests(id).map(r => r.fecha).sort()[0]).filter(Boolean).sort()[0];
  return d || '';
}
// Open → Verification pending → Awaiting approval → Closed (or Not effective).
function capaStatus(rootId) {
  const pid = capaPrimaryId(rootId), c = getCapa(pid);
  if (!capaComplete(c)) return 'Open';
  const eff = capaEventEffect(pid);
  if (eff.bad) return 'Not effective';
  if (!eff.ok) return 'Verification pending';
  return c.approvedAt || c.verifiedBy ? 'Closed' : 'Awaiting approval';
}
// Preventive action is mandatory for Listeria / Salmonella or a recurring site.
function capaNeedsPrevention(roots) {
  return roots.some(h => {
    const pats = (typeof positivePathogens === 'function') ? positivePathogens(h) : (h.failedPathogens || []);
    return pats.includes('listeria') || pats.includes('salmonella') || sitePositiveCount(h.planta, h.sample) >= 2;
  });
}
// Other positives of the same event (building + collection date) still free to share this CAPA.
function capaEventCandidates(root) {
  const all = getCapaAll();
  return GH().filter(h => h.id !== root.id && h.resultado === 'Positive' && h.planta === root.planta && h.fecha === root.fecha &&
    ((!h.retestNum && !h.isRetest) || isVectorRec(h)))
    .filter(h => { const e = all[h.id]; return _capaEmpty(e) || e.linkedTo === root.id; });
}

const _capaSite = h => (h.sample ? '#' + h.sample : esc(h.location || 'Site')) + ' · ' + esc(h.planta);
const _capaPath = h => (typeof labPositiveText === 'function' && labPositiveText(h)) || h.failedPathogensLabel || 'Positive';

function openCapaModal(rootId) {
  rootId = capaPrimaryId(rootId);
  const root = GH().find(h => h.id === rootId); if (!root) return;
  CAPAROOT = rootId;
  const c = getCapaAll()[rootId] || {};
  const linked = new Set(c.roots || []);
  const cands = capaEventCandidates(root);
  const acts = new Set(c.actions || []);
  const hits = sitePositiveCount(root.planta, root.sample);
  const due = capaDue(rootId), today = todayLocal();
  const zoneOk = [root].concat(cands).every(h => Number(h.zone) >= 2);
  const disp = c.disposition || (zoneOk ? CAPA_DISPOSITIONS[0] : '');
  const lbl = (n, t, hint) => '<div class="modal-label capa-step"><span>' + n + '</span>' + t + (hint ? '<em>' + hint + '</em>' : '') + '</div>';

  document.getElementById('capaModalBody').innerHTML =
    '<h3><svg class="ln ico-inline" width="15" height="15" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>Corrective &amp; Preventive Action — 2.5.C.2</h3>' +
    '<div class="vec-info"><strong>' + _capaSite(root) + '</strong> · Zone ' + (root.zone || '—') + ' · Positive ' + esc(root.fecha) + ' · ' + esc(_capaPath(root)) +
      '<br>' + esc(root.area || '') + (root.location ? ' — ' + esc(root.location) : '') +
      (hits >= 2 ? '<br><strong style="color:var(--red)">Recurring site: positive ' + hits + ' times — vectorize per SOP</strong>' : '') +
      (due ? '<br><span class="capa-due' + (!capaComplete(c) && due <= today ? ' late' : '') + '">Document before retest #1 · ' + esc(due) + '</span>' : '') + '</div>' +
    (cands.length ? '<div class="capa-event"><div class="modal-label" style="margin:0 0 4px">Same event — also covered by this CAPA</div>' +
      cands.map(h => '<label><input type="checkbox" class="capa-root" value="' + h.id + '"' + (linked.has(h.id) || !c.updatedAt ? ' checked' : '') + ' onchange="capaPrevRule();capaRenderVerification()"> ' +
        _capaSite(h) + ' · Zone ' + (h.zone || '—') + ' · ' + esc(_capaPath(h)) + ' <span>' + esc(h.area || '') + (h.location ? ' — ' + esc(h.location) : '') + '</span></label>').join('') + '</div>' : '') +

    lbl('1', 'Root cause *', 'what the investigation found') +
    '<select id="capaCause" class="vec-input" style="width:100%" onchange="capaCauseChanged()"><option value="">— Select —</option>' +
      CAPA_CAUSES.map(([k, l]) => '<option value="' + k + '"' + (c.rootCat === k ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>' +
    '<input type="text" id="capaCauseNote" class="vec-input capa-note" value="' + esc(c.rootNote || '') + '" placeholder="Details (optional) — e.g. crack under the conveyor leg">' +

    lbl('2', 'Correction taken *', 'tick what was done (SOP 2.4.H §7)') +
    '<div class="capa-acts">' + CAPA_ACTIONS.map(([k, l]) =>
      '<label><input type="checkbox" class="capa-act" value="' + k + '"' + (acts.has(k) ? ' checked' : '') + '> ' + esc(l) + '</label>').join('') + '</div>' +
    '<input type="text" id="capaCorrNote" class="vec-input capa-note" value="' + esc(c.corrNote || '') + '" placeholder="Other correction / details (optional)">' +

    '<div id="capaPrevBox"></div>' +

    lbl('4', 'Product disposition *') +
    '<select id="capaDisp" class="vec-input" style="width:100%"><option value="">— Select —</option>' +
      CAPA_DISPOSITIONS.map(d => '<option' + (disp === d ? ' selected' : '') + '>' + esc(d) + '</option>').join('') + '</select>' +

    lbl('5', 'Verification', 'automatic from the retests') +
    '<div id="capaVerBox"></div>' +
    (c.updatedAt ? '<p class="vec-help" style="margin-top:10px">Last updated ' + new Date(c.updatedAt).toLocaleString('en-US') + (c.updatedBy ? ' by ' + esc(c.updatedBy) : '') + '</p>' : '') +
    '<div class="modal-actions">' +
      '<button class="btn btn-outline" onclick="exportCapaPDF(' + rootId + ')" title="Download the 2.5.C.2 form" style="margin-right:auto"><svg class="ln ico-inline" width="14" height="14" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>PDF</button>' +
      '<button class="btn btn-outline" onclick="closeCapaModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="saveCapa()">Save CAPA</button></div>';
  capaPrevRule(c);
  capaRenderVerification();
  document.getElementById('capaModal').classList.add('open');
}

// Roots ticked in the modal (the primary + the event positives kept checked).
function _capaModalRoots() {
  const ids = [CAPAROOT].concat([...document.querySelectorAll('.capa-root:checked')].map(x => Number(x.value)));
  const H = GH(); return ids.map(id => H.find(h => h.id === id)).filter(Boolean);
}

// Step 3 — required or optional depending on the pathogens / recurrence.
function capaPrevRule(saved) {
  const box = document.getElementById('capaPrevBox'); if (!box) return;
  const cur = document.getElementById('capaPrev');
  const c = saved && saved.rootCat !== undefined ? saved : null;
  const val = cur ? cur.value : ((c && c.preventive) || '');
  const na = cur ? (document.getElementById('capaPrevNA') || {}).checked : !!(c && c.prevNA);
  const need = capaNeedsPrevention(_capaModalRoots());
  box.innerHTML = '<div class="modal-label capa-step"><span>3</span>Preventive action' + (need ? ' *' : '') +
      '<em>' + (need ? 'required — Listeria / Salmonella or recurring site' : 'optional for a single E. coli / S. aureus positive') + '</em></div>' +
    '<textarea id="capaPrev" class="capa-ta" placeholder="What prevents it from coming back? Repair, SOP change, training, frequency…"' + (!need && na ? ' disabled' : '') + '>' + esc(!need && na ? '' : (val === CAPA_PREV_NA ? '' : val)) + '</textarea>' +
    '<div class="capa-prev-tools"><button type="button" class="capa-hint" onclick="capaUseHint()">Suggest from root cause</button>' +
      (!need ? '<label><input type="checkbox" id="capaPrevNA"' + (na ? ' checked' : '') + ' onchange="capaPrevRule()"> Not required</label>' : '') + '</div>';
}
function capaCauseChanged() { const p = document.getElementById('capaPrev'); if (p && !p.value.trim() && !p.disabled) capaUseHint(true); }
function capaUseHint(quiet) {
  const k = (document.getElementById('capaCause') || {}).value, p = document.getElementById('capaPrev');
  if (!p || p.disabled) return;
  if (!CAPA_PREV_HINTS[k]) { if (!quiet) toast('Pick a root cause first', 'info'); return; }
  p.value = CAPA_PREV_HINTS[k];
}

// Step 5 — retests per site + approval.
function capaRenderVerification() {
  const box = document.getElementById('capaVerBox'); if (!box || !CAPAROOT) return;
  const c = getCapaAll()[CAPAROOT] || {};
  const roots = _capaModalRoots();
  const rows = roots.map(h => {
    const e = capaEffectiveness(h.id), rts = caseRetests(h.id).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const vec = caseVectors(h.id), vecPos = vec.filter(v => v.resultado === 'Positive').length;
    return '<div class="capa-ver-row"><strong>' + _capaSite(h) + '</strong> ' +
      (rts.length ? rts.map(r => '<span class="capa-rt ' + (r.resultado === 'Negative' ? 'ok' : r.resultado === 'Positive' ? 'bad' : '') + '" title="' + esc(r.retestNum + ' · ' + r.fecha) + '">' + esc(r.fecha.slice(5)) + ' ' + esc(r.resultado) + '</span>').join('') : '<span class="capa-rt">Not scheduled</span>') +
      '<div class="capa-eff ' + (e.ok ? 'ok' : '') + '">' + esc(e.text) + (vec.length ? ' · Vectors: ' + vec.length + (vecPos ? ' (' + vecPos + ' positive)' : '') : '') + '</div></div>';
  }).join('');
  const all = roots.every(h => capaEffectiveness(h.id).ok);
  const approved = c.approvedAt || c.verifiedBy;
  box.innerHTML = rows +
    (approved
      ? '<div class="capa-approved"><svg class="ln ico-inline" width="13" height="13" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Approved and closed by ' + esc(c.approvedBy || c.verifiedBy) + ' · ' + esc(c.verifiedDate || (c.approvedAt ? todayLocal(new Date(c.approvedAt)) : '')) + '</div>'
      : all && canApproveCapa()
        ? '<button type="button" class="btn btn-primary btn-sm" style="margin-top:8px" onclick="approveCapa()">Approve &amp; close</button>'
        : '<p class="vec-help" style="margin-top:6px">' + (all ? 'Ready — a Manager or Administrator approves and closes it.' : 'Closes after 3 consecutive negative retests' + (roots.length > 1 ? ' at every site' : '') + ', approved by a Manager or Administrator.') + '</p>');
}

function closeCapaModal() { document.getElementById('capaModal').classList.remove('open'); CAPAROOT = null; }

// Read the modal into a CAPA record (composed text for the reports + structured fields to edit again).
function _capaFromModal() {
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  const cause = v('capaCause'), causeNote = v('capaCauseNote'), corrNote = v('capaCorrNote');
  const acts = [...document.querySelectorAll('.capa-act:checked')].map(x => x.value);
  const roots = _capaModalRoots();
  const need = capaNeedsPrevention(roots);
  const na = !need && !!(document.getElementById('capaPrevNA') || {}).checked;
  const causeLbl = (CAPA_CAUSES.find(x => x[0] === cause) || [])[1] || '';
  const rootCause = cause === 'other' ? causeNote : causeLbl ? causeLbl + (causeNote ? ' — ' + causeNote : '') : '';
  const correction = acts.map(k => (CAPA_ACTIONS.find(x => x[0] === k) || [])[1]).filter(Boolean).concat(corrNote ? [corrNote] : []).join('; ');
  return {
    rootCat: cause, rootNote: causeNote, rootCause, actions: acts, corrNote, correction,
    preventive: na ? CAPA_PREV_NA : v('capaPrev'), prevNA: na, disposition: v('capaDisp'),
    roots: roots.map(h => h.id)
  };
}

function saveCapa() {
  if (!CAPAROOT) return;
  const f = _capaFromModal();
  if (f.rootCat === 'other' && !f.rootNote) { toast('Describe the root cause', 'error'); return; }
  const all = getCapaAll(), prev = all[CAPAROOT] || {};
  const rec = Object.assign({}, prev, f, { updatedAt: new Date().toISOString(), updatedBy: (CU && (CU.displayName || CU.email)) || '' });
  all[CAPAROOT] = rec;
  // Link / unlink the other positives of the event (unlinked entries are emptied, not deleted).
  capaEventCandidates(GH().find(h => h.id === CAPAROOT) || {}).forEach(h => {
    const on = f.roots.includes(h.id);
    if (on) all[h.id] = { linkedTo: CAPAROOT, updatedAt: rec.updatedAt };
    else if (all[h.id] && all[h.id].linkedTo === CAPAROOT) all[h.id] = { linkedTo: '', updatedAt: rec.updatedAt };
  });
  localStorage.setItem(CAPA_KEY, JSON.stringify(all)); if (typeof storeSaved === 'function') storeSaved(CAPA_KEY);
  closeCapaModal(); loadRetests(); if (typeof renderCapaLog === 'function') renderCapaLog();
  const ok = capaComplete(rec);
  toast(ok ? 'CAPA saved — documented' + (f.roots.length > 1 ? ' for ' + f.roots.length + ' positives' : '') : 'CAPA saved — required steps still missing', ok ? 'success' : 'info');
}

function approveCapa() {
  if (!CAPAROOT || !canApproveCapa()) return;
  const f = _capaFromModal();
  if (!capaComplete(f)) { toast('Complete steps 1–4 before approving', 'error'); return; }
  const roots = f.roots;
  if (!roots.every(id => capaEffectiveness(id).ok)) { toast('Verification is not complete yet', 'error'); return; }
  // Verification date = when the last confirming retest result came in.
  const last = roots.flatMap(id => caseRetests(id)).map(r => r.resultDate || r.fecha).sort().pop() || todayLocal();
  const who = (CU && (CU.displayName || CU.email)) || '';
  const all = getCapaAll();
  all[CAPAROOT] = Object.assign({}, all[CAPAROOT], f, {
    verifiedBy: who, verifiedDate: last, approvedBy: who, approvedByEmail: (CU && CU.email) || '', approvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), updatedBy: who
  });
  localStorage.setItem(CAPA_KEY, JSON.stringify(all)); if (typeof storeSaved === 'function') storeSaved(CAPA_KEY);
  closeCapaModal(); loadRetests(); if (typeof renderCapaLog === 'function') renderCapaLog();
  toast('CAPA approved and closed', 'success');
}

// ── PDF — form 2.5.C.2 (flat printed form, Caputo logo in color) ──
function exportCapaPDF(rootId) {
  const pid = capaPrimaryId(rootId);
  const open = CAPAROOT === pid && document.getElementById('capaModal').classList.contains('open');
  const c = Object.assign({}, getCapaAll()[pid] || {}, open ? _capaFromModal() : {});   // what is on screen, even unsaved
  const H = GH(), roots = (c.roots && c.roots.length ? c.roots : capaRootsOf(pid)).map(id => H.find(h => h.id === id)).filter(Boolean);
  if (!roots.length) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const W = 215.9, PH = doc.internal.pageSize.getHeight(), M = 12, INK = [0, 0, 0], MUT = [110, 110, 110], LINE = [190, 190, 190], HEAD = [242, 242, 242];
  const safe = s => String(s == null ? '' : s).replace(/[–—]/g, '-').replace(/·/g, '-').replace(/[≤]/g, '<=');
  const fmt = iso => { if (!iso) return '-'; const x = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return isNaN(x) ? iso : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  const root = roots[0], status = capaStatus(pid);

  try { doc.addImage(pdfLogo(), 'JPEG', M, 7, 30, 15); } catch (e) {}
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...INK);
  doc.text('SQF # 2.5.C.2: Corrective Action Preventative Action', W / 2, 12, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text('Environmental Monitoring - Positive result (SOP 2.4.H)', W / 2, 17, { align: 'center' });
  doc.setFontSize(8); doc.text('Status: ' + status, W - M, 12, { align: 'right' });
  doc.text('Building ' + root.planta, W - M, 17, { align: 'right' });
  doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.line(M, 25, W - M, 25);

  let y = 30;
  const sec = t => { if (y > PH - 30) { doc.addPage(); y = 18; } doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(t, M, y); y += 2; };
  const tbl = (head, body, opts) => { doc.autoTable(Object.assign({ startY: y, margin: { left: M, right: M }, head: head ? [head] : undefined, body,
    theme: 'grid', styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: INK, lineColor: LINE, lineWidth: 0.2, valign: 'top', overflow: 'linebreak' },
    headStyles: { fillColor: HEAD, textColor: INK, fontStyle: 'bold' } }, opts || {})); y = doc.lastAutoTable.finalY + 5; };

  sec('1. Positive result' + (roots.length > 1 ? 's (same event)' : ''));
  tbl(['Sample', 'Zone', 'Area / location', 'Collected', 'Result'], roots.map(h => [
    h.sample ? '#' + h.sample : safe(h.location || 'Site') + (isVectorRec(h) ? ' (' + safe(h.retestNum) + ')' : ''), String(h.zone || '-'),
    safe((h.area || '') + (h.location ? ' - ' + h.location : '')), fmt(h.fecha), safe(_capaPath(h)) + (sitePositiveCount(h.planta, h.sample) >= 2 ? '\nRecurring site (' + sitePositiveCount(h.planta, h.sample) + ' positives)' : '')]),
    { columnStyles: { 0: { cellWidth: 18, fontStyle: 'bold' }, 1: { cellWidth: 12, halign: 'center' }, 3: { cellWidth: 24 }, 4: { cellWidth: 52 } } });

  sec('2. Investigation - root cause');
  tbl(null, [[safe(c.rootCause || '')]], { styles: { fontSize: 8.5, cellPadding: 2.4, textColor: INK, lineColor: LINE, lineWidth: 0.2, minCellHeight: 8 } });

  sec('3. Correction / corrective action taken');
  const acts = new Set(c.actions || []);
  tbl(null, CAPA_ACTIONS.map(([k, l]) => [acts.has(k) ? 'X' : '', safe(l)]).concat(c.corrNote ? [['X', safe(c.corrNote)]] : []),
    { columnStyles: { 0: { cellWidth: 9, halign: 'center', fontStyle: 'bold' } }, styles: { fontSize: 7.6, cellPadding: 1.1, textColor: INK, lineColor: LINE, lineWidth: 0.2 } });

  sec('4. Preventive action');
  tbl(null, [[safe(c.preventive || '')]], { styles: { fontSize: 8.5, cellPadding: 2.4, textColor: INK, lineColor: LINE, lineWidth: 0.2, minCellHeight: 8 } });

  sec('5. Product disposition');
  tbl(null, [[safe(c.disposition || '')]], { styles: { fontSize: 8.5, cellPadding: 2.4, textColor: INK, lineColor: LINE, lineWidth: 0.2 } });

  sec('6. Verification of effectiveness - 3 consecutive negative retests');
  const vrows = [];
  roots.forEach(h => {
    caseRetests(h.id).sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(r => vrows.push([h.sample ? '#' + h.sample : safe(h.location || ''), safe(r.retestNum), fmt(r.fecha), safe(r.resultado) + (r.resultado === 'Positive' && typeof labPositiveText === 'function' && labPositiveText(r) ? ' - ' + safe(labPositiveText(r)) : '')]));
    caseVectors(h.id).forEach(r => vrows.push([h.sample ? '#' + h.sample : '', safe(r.retestNum) + ' - ' + safe(r.location || ''), fmt(r.fecha), safe(r.resultado)]));
  });
  tbl(['Site', 'Sample', 'Date', 'Result'], vrows.length ? vrows : [['-', 'Retests not scheduled yet', '-', '-']], { columnStyles: { 0: { cellWidth: 18 }, 2: { cellWidth: 26 }, 3: { cellWidth: 52 } }, styles: { fontSize: 7.8, cellPadding: 1.4, textColor: INK, lineColor: LINE, lineWidth: 0.2 } });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text(safe(capaEventEffect(pid).text), M, y - 2); y += 4;

  sec('7. Approval');
  tbl(null, [['Documented by', safe(c.updatedBy || ''), 'Date', fmt(c.updatedAt)], ['Verified / approved by', safe(c.approvedBy || c.verifiedBy || ''), 'Date', c.approvedAt || c.verifiedDate ? fmt(c.verifiedDate || c.approvedAt) : '']],
    { columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' }, 2: { cellWidth: 16, fontStyle: 'bold' }, 3: { cellWidth: 32 } }, styles: { fontSize: 8.5, cellPadding: 2.4, textColor: INK, lineColor: LINE, lineWidth: 0.2 } });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, PH - 9, W - M, PH - 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUT);
    doc.text('Caputo Foods - SQF 2.5.C.2 Corrective Action Preventative Action - Confidential', M, PH - 5);
    doc.text('Page ' + i + ' of ' + pages, W - M, PH - 5, { align: 'right' });
  }
  const name = 'CAPA ' + root.planta + ' sample ' + (root.sample || root.id) + ' ' + root.fecha;
  doc.save(name + '.pdf');
  if (typeof syncSafe === 'function' && typeof savePdfToSharePoint === 'function') syncSafe(() => savePdfToSharePoint(name, doc), 'save capa pdf');
}

// Header chips + buttons for a case card in the Retests view.
function caseToolsHtml(rootId, planta, sample) {
  const st = capaStatus(rootId), done = st !== 'Open';
  const due = capaDue(capaPrimaryId(rootId)), late = !done && due && due <= todayLocal();
  const nv = caseVectors(rootId).length, hits = sitePositiveCount(planta, sample);
  return (hits >= 2 ? '<span class="rt-tag" style="color:#fff;background:var(--red)" title="Positive ' + hits + ' times at this site">Recurring site</span>' : '') +
    '<div style="display:flex;gap:6px">' +
      '<button class="rt-btn" onclick="openVectorModal(' + rootId + ')" title="Vector sampling — find the source (max ' + VECTOR_MAX + ')">Vector ' + nv + '/' + VECTOR_MAX + '</button>' +
      '<button class="rt-btn ' + (done ? 'send done' : 'accent') + (late ? ' capa-late' : '') + '" onclick="openCapaModal(' + rootId + ')" title="Corrective & preventive action (2.5.C.2) — ' + st + (due && !done ? ' · due ' + due : '') + '">' + (st === 'Closed' ? 'CAPA ✓' : done ? 'CAPA · ' + (st === 'Awaiting approval' ? 'Approve' : st === 'Not effective' ? 'Not effective' : 'Verifying') : late ? 'CAPA due' : 'CAPA') + '</button>' +
    '</div>';
}
