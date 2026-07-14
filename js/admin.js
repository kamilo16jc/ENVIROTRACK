// ═══════════════════════════════════════════════
// ADMIN — RECORD CORRECTION
// Admin-only tool to re-open / correct a recorded result.
// Fixes the common mistake of a test being marked "finished"
// (Negative / OK) when it should still be Pending or Positive.
//
// Scope (Level A): only the result-level fields are touched —
// resultado, failedPathogens(+label), resultDate, labNotes — which is
// exactly what the existing SharePoint Records_Update flow syncs.
// Structural fields (sample, area, zone, dates…) are NOT edited here.
// ═══════════════════════════════════════════════

let AEID  = null;   // record id being corrected
let AERES = null;   // chosen result: 'Pending' | 'Negative' | 'Positive'

const AE_PATS = { ecoli:'E.Coli', listeria:'Listeria', salmonella:'Salmonella', saureus:'S.Aureus' };

// Only administrators may correct records.
function canEditRecords() {
  return !!(typeof CU !== 'undefined' && CU &&
            typeof isAdmin === 'function' && isAdmin(CU.email, CU.role));
}

// Does this record already have child retests generated? If so, changing its
// result would orphan them in SharePoint (there is no delete flow yet), so we
// restrict the correction to notes only and point the admin at the Retests tab.
function aeHasChildRetests(id) {
  return GH().some(r => r.originalId === id && r.retestNum);
}

function openAdminEdit(id) {
  if (!canEditRecords()) { toast('Administrators only', 'error'); return; }
  const h = GH().find(r => r.id === id);
  if (!h) return;
  AEID = id; AERES = null;

  const locked = aeHasChildRetests(id);

  const testedPats = Object.entries(AE_PATS).filter(([k]) => h[k]);
  const patsLabel  = testedPats.map(([,n]) => n).join(', ') || '—';

  document.getElementById('aeInfo').innerHTML =
    '<strong>Sample #' + h.sample + '</strong> — ' + esc(h.planta) +
    (h.retestNum ? ' &nbsp;·&nbsp; <span class="badge badge-red" style="font-size:10px">' + esc(h.retestNum) + '</span>' : '') +
    '<br><strong>Area:</strong> ' + esc(h.area) + ' &nbsp;·&nbsp; <strong>Zone:</strong> ' + h.zone +
    '<br><strong>Location:</strong> ' + esc(h.location) +
    '<br><strong>Pathogens tested:</strong> <span style="font-weight:700;color:var(--navy)">' + esc(patsLabel) + '</span>' +
    '<br><strong>Current result:</strong> <span style="font-weight:700">' + esc(h.resultado) + '</span>' +
    (h.failedPathogensLabel ? ' <span style="color:var(--red)">(' + esc(h.failedPathogensLabel) + ')</span>' : '') +
    ' &nbsp;·&nbsp; <strong>Date:</strong> ' + h.fecha;

  // Lock notice + result buttons
  const lockNotice = document.getElementById('aeLockNotice');
  const resultRow  = document.getElementById('aeResultRow');
  if (locked) {
    lockNotice.style.display = 'block';
    resultRow.style.display  = 'none';
    document.getElementById('aePathoSection').style.display = 'none';
    document.getElementById('aeBadge').style.display = 'none';
  } else {
    lockNotice.style.display = 'none';
    resultRow.style.display  = 'flex';
  }

  // Build per-pathogen checkboxes (only those actually tested), pre-checking
  // any pathogen already recorded as failed.
  const failed = Array.isArray(h.failedPathogens) ? h.failedPathogens : [];
  document.getElementById('aePathoCheckboxes').innerHTML = testedPats.map(([key,name]) =>
    '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 12px;' +
    'background:white;border-radius:6px;border:1.5px solid var(--gray-200)" id="aelbl-' + key + '">' +
    '<input type="checkbox" id="aechk-' + key + '" onchange="onAdminPathoCheck()" ' +
    (failed.includes(key) ? 'checked ' : '') +
    'style="width:16px;height:16px;accent-color:var(--red);cursor:pointer">' +
    '<span style="font-size:13px;font-weight:600">' + name + '</span></label>'
  ).join('');

  document.getElementById('aePathoSection').style.display = 'none';
  document.getElementById('aeBadge').style.display = 'none';
  document.getElementById('aeNotes').value = h.labNotes || '';
  document.getElementById('btnAeSave').disabled = !locked; // notes-only mode can save immediately
  ['aeReopen','aeNeg','aePos'].forEach(bid => { const b = document.getElementById(bid); if (b) b.style.opacity = '1'; });
  document.getElementById('adminEditModal').classList.add('open');
}

function setAdminResult(r) {
  AERES = r;
  const pathoSection = document.getElementById('aePathoSection');
  const b = document.getElementById('aeBadge');

  if (r === 'Positive') {
    pathoSection.style.display = 'block';
    // require at least one pathogen checked
    onAdminPathoCheck();
  } else {
    pathoSection.style.display = 'none';
    if (r === 'Negative') {
      b.style.display = 'block';
      b.style.background = '#d1fae5'; b.style.color = '#059669';
      b.textContent = 'NEGATIVE — test closed as OK';
    } else { // Pending (re-open)
      b.style.display = 'block';
      b.style.background = '#fef3c7'; b.style.color = '#b45309';
      b.textContent = 'RE-OPEN — back to Pending, awaiting lab result';
    }
    document.getElementById('btnAeSave').disabled = false;
  }
  document.getElementById('aeReopen').style.opacity = r === 'Pending'  ? '1' : '0.4';
  document.getElementById('aeNeg').style.opacity    = r === 'Negative' ? '1' : '0.4';
  document.getElementById('aePos').style.opacity    = r === 'Positive' ? '1' : '0.4';
}

function onAdminPathoCheck() {
  const boxes = [...document.querySelectorAll('#aePathoCheckboxes input[type=checkbox]')];
  boxes.forEach(c => {
    const lbl = document.getElementById('aelbl-' + c.id.replace('aechk-',''));
    if (lbl) { lbl.style.borderColor = c.checked ? 'var(--red)' : 'var(--gray-200)'; lbl.style.background = c.checked ? 'var(--red-light)' : 'white'; }
  });
  const checked = boxes.filter(c => c.checked).map(c => c.id.replace('aechk-',''));
  document.getElementById('btnAeSave').disabled = checked.length === 0;
  const b = document.getElementById('aeBadge');
  if (checked.length) {
    b.style.display = 'block';
    b.style.background = '#fee2e2'; b.style.color = '#dc2626';
    b.textContent = 'POSITIVE: ' + checked.map(k => AE_PATS[k]).join(', ');
  } else {
    b.style.display = 'block';
    b.style.background = '#fee2e2'; b.style.color = '#dc2626';
    b.textContent = 'Select at least one positive pathogen';
  }
}

function closeAdminEdit() {
  document.getElementById('adminEditModal').classList.remove('open');
  AEID = null; AERES = null;
}

function confirmAdminEdit() {
  if (!canEditRecords()) { toast('Administrators only', 'error'); return; }
  if (AEID == null) return;
  const hist = GH(), idx = hist.findIndex(r => r.id === AEID);
  if (idx < 0) return;
  const rec = hist[idx];
  const locked = aeHasChildRetests(AEID);

  const newNotes = document.getElementById('aeNotes').value.trim();

  if (locked) {
    // Notes-only correction — result is left untouched to protect the cascade.
    rec.labNotes = newNotes;
  } else {
    if (!AERES) { toast('Choose a result', 'error'); return; }
    rec.labNotes = newNotes;

    if (AERES === 'Positive') {
      const failed = ['ecoli','listeria','salmonella','saureus'].filter(k => {
        const c = document.getElementById('aechk-' + k); return c && c.checked;
      });
      if (!failed.length) { toast('Select at least one positive pathogen', 'error'); return; }
      rec.resultado = 'Positive';
      rec.failedPathogens = failed;
      rec.failedPathogensLabel = failed.map(k => AE_PATS[k]).join(', ');
      rec.resultDate = new Date().toISOString().split('T')[0];
    } else if (AERES === 'Negative') {
      rec.resultado = 'Negative';
      rec.failedPathogens = [];
      rec.failedPathogensLabel = '';
      rec.resultDate = new Date().toISOString().split('T')[0];
    } else { // Pending — re-open a wrongly-finalized test
      rec.resultado = 'Pending';
      rec.failedPathogens = [];
      rec.failedPathogensLabel = '';
      rec.resultDate = '';
    }
  }

  SH(hist);
  syncSafe(() => syncUpdateRecord(rec), 'admin correct record');
  closeAdminEdit();
  searchHistory(); loadRetests(); refreshDashboard();

  const label = locked ? 'notes updated'
    : rec.resultado === 'Pending'  ? 're-opened (Pending)'
    : rec.resultado === 'Negative' ? 'set to Negative'
    : 'set to Positive (' + rec.failedPathogensLabel + ')';
  toast('Sample #' + rec.sample + ' — ' + label, rec.resultado === 'Positive' ? 'error' : 'success');
}
