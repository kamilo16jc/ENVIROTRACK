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
// • CAPA (root cause / correction / preventive / disposition / SOP
//   actions / verification) is kept per case root in localStorage
//   (cap_capa) until a SharePoint "CAPA" list + flows are created.
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
    const open = kids.length ? kids.some(r => r.resultado === 'Pending') : !rids.has(h.id);
    if (open) out.add(String(h.sample));
  });
  hist.forEach(h => { if (h.retestNum && !isVectorRec(h) && h.resultado === 'Pending' && h.sample) out.add(String(h.sample)); });
  hist.forEach(h => { if (h.sample && typeof labIsPresumptive === 'function' && labIsPresumptive(h)) out.add(String(h.sample)); });
  return out;
}

// ── CAPA (form 2.5.C.2) ─────────────────────────────────────────
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
const CAPA_DISPOSITIONS = [
  'Not applicable — environmental site, no product affected',
  'Product placed on hold pending results',
  'Product tested and released',
  'Product reworked / destroyed'
];
let CAPAROOT = null;

function getCapaAll() { try { return JSON.parse(localStorage.getItem(CAPA_KEY) || '{}'); } catch (e) { return {}; } }
function getCapa(rootId) { return getCapaAll()[rootId] || null; }
function capaComplete(c) { return !!(c && c.rootCause && c.correction && c.preventive && c.disposition); }

// Efficacy per SOP: 3 consecutive negative retests at the original site.
function capaEffectiveness(rootId) {
  const rts = caseRetests(rootId);
  if (!rts.length) return { ok: false, text: 'Retests not scheduled yet' };
  if (rts.some(r => r.resultado === 'Positive')) return { ok: false, text: 'Not effective — a retest was positive (escalated to a new round)' };
  const neg = rts.filter(r => r.resultado === 'Negative').length;
  if (rts.length >= 3 && neg === rts.length) return { ok: true, text: 'Confirmed — 3 consecutive negative retests' };
  return { ok: false, text: neg + ' of 3 retests negative so far' };
}

function openCapaModal(rootId) {
  const root = GH().find(h => h.id === rootId); if (!root) return;
  CAPAROOT = rootId;
  const c = getCapa(rootId) || {};
  const eff = capaEffectiveness(rootId);
  const vec = caseVectors(rootId);
  const vecPos = vec.filter(v => v.resultado === 'Positive').length;
  const hits = sitePositiveCount(root.planta, root.sample);
  const acts = new Set(c.actions || []);
  const ta = (id, v, ph) => '<textarea id="' + id + '" class="capa-ta" placeholder="' + ph + '">' + esc(v || '') + '</textarea>';

  document.getElementById('capaModalBody').innerHTML =
    '<h3><svg class="ln ico-inline" width="15" height="15" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>Corrective &amp; Preventive Action — 2.5.C.2</h3>' +
    '<div class="vec-info"><strong>Sample #' + root.sample + '</strong> · ' + esc(root.planta) + ' · Zone ' + (root.zone || '—') + ' · Positive ' + esc(root.fecha) +
      (root.failedPathogensLabel ? ' · ' + esc(root.failedPathogensLabel) : '') + '<br>' + esc(root.area || '') + (root.location ? ' — ' + esc(root.location) : '') +
      (hits >= 2 ? '<br><strong style="color:var(--red)">Recurring site: positive ' + hits + ' times — vectorize per SOP</strong>' : '') + '</div>' +
    '<div class="modal-label">Root cause (investigation findings) *</div>' + ta('capaRoot', c.rootCause, 'What caused the positive? Harborage found, cleaning gap, traffic, water…') +
    '<div class="modal-label">Correction / corrective action taken *</div>' + ta('capaCorr', c.correction, 'What was done to eliminate it (and when)?') +
    '<div class="modal-label">Preventive action *</div>' + ta('capaPrev', c.preventive, 'What prevents it from coming back? SOP change, repair, training, frequency…') +
    '<div class="modal-label">Product disposition *</div>' +
    '<select id="capaDisp" class="vec-input" style="width:100%"><option value="">— Select —</option>' +
      CAPA_DISPOSITIONS.map(d => '<option' + (c.disposition === d ? ' selected' : '') + '>' + esc(d) + '</option>').join('') + '</select>' +
    '<div class="modal-label" style="margin-top:12px">Corrective actions performed (SOP 2.4.H §7)</div>' +
    '<div class="capa-acts">' + CAPA_ACTIONS.map(([k, l]) =>
      '<label><input type="checkbox" class="capa-act" value="' + k + '"' + (acts.has(k) ? ' checked' : '') + '> ' + esc(l) + '</label>').join('') + '</div>' +
    '<div class="modal-label" style="margin-top:12px">Verification of effectiveness</div>' +
    '<div class="capa-eff ' + (eff.ok ? 'ok' : '') + '">' + esc(eff.text) +
      (vec.length ? '<br>Vector samples: ' + vec.length + ' scheduled · ' + vecPos + ' positive' : '') + '</div>' +
    '<div class="vec-row" style="margin-top:10px">' +
      '<div style="flex:1"><div class="modal-label">Verified by</div><input type="text" id="capaVerBy" class="vec-input" style="width:100%" value="' + esc(c.verifiedBy || '') + '" placeholder="SQF Practitioner / QA supervisor"></div>' +
      '<div><div class="modal-label">Verification date</div><input type="date" id="capaVerDate" class="vec-input" value="' + esc(c.verifiedDate || '') + '"></div></div>' +
    (c.updatedAt ? '<p class="vec-help" style="margin-top:10px">Last updated ' + new Date(c.updatedAt).toLocaleString('en-US') + (c.updatedBy ? ' by ' + esc(c.updatedBy) : '') + '</p>' : '') +
    '<div class="modal-actions"><button class="btn btn-outline" onclick="closeCapaModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="saveCapa()">Save CAPA</button></div>';
  document.getElementById('capaModal').classList.add('open');
}

function closeCapaModal() { document.getElementById('capaModal').classList.remove('open'); CAPAROOT = null; }

function saveCapa() {
  if (!CAPAROOT) return;
  const v = id => (document.getElementById(id).value || '').trim();
  const rec = {
    rootCause: v('capaRoot'), correction: v('capaCorr'), preventive: v('capaPrev'), disposition: v('capaDisp'),
    actions: [...document.querySelectorAll('.capa-act:checked')].map(c => c.value),
    verifiedBy: v('capaVerBy'), verifiedDate: v('capaVerDate'),
    updatedAt: new Date().toISOString(), updatedBy: (CU && CU.displayName) || ''
  };
  const all = getCapaAll(); all[CAPAROOT] = rec;
  localStorage.setItem(CAPA_KEY, JSON.stringify(all)); if (typeof storeSaved === 'function') storeSaved(CAPA_KEY);
  closeCapaModal(); loadRetests(); if (typeof renderCapaLog === 'function') renderCapaLog();
  toast(capaComplete(rec) ? 'CAPA saved — complete' : 'CAPA saved — required fields still missing', capaComplete(rec) ? 'success' : 'info');
}

// Header chips + buttons for a case card in the Retests view.
function caseToolsHtml(rootId, planta, sample) {
  const c = getCapa(rootId), done = capaComplete(c);
  const nv = caseVectors(rootId).length, hits = sitePositiveCount(planta, sample);
  return (hits >= 2 ? '<span class="rt-tag" style="color:#fff;background:var(--red)" title="Positive ' + hits + ' times at this site">Recurring site</span>' : '') +
    '<div style="display:flex;gap:6px">' +
      '<button class="rt-btn" onclick="openVectorModal(' + rootId + ')" title="Vector sampling — find the source (max ' + VECTOR_MAX + ')">Vector ' + nv + '/' + VECTOR_MAX + '</button>' +
      '<button class="rt-btn ' + (done ? 'send done' : 'accent') + '" onclick="openCapaModal(' + rootId + ')" title="Corrective & preventive action (2.5.C.2)">' + (done ? 'CAPA ✓' : 'CAPA') + '</button>' +
    '</div>';
}
