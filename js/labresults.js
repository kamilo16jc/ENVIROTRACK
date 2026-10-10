// ═══════════════════════════════════════════════════════════════
// LAB RESULTS PER TEST — how Matrix Sciences reports each analysis
// (ANAB scope AT-1491.06, Green Bay WI):
//   • L. monocytogenes, Salmonella → qualitative pathogen screens
//     (VIDAS / GENE-UP + cultural confirmation): Negative /
//     Presumptive positive / Positive.
//   • E. coli, S. aureus → Petrifilm COUNTS: "<10 CFU" when nothing
//     grows (below the detection limit), otherwise a count. Any count
//     at or above the limit is a positive per SOP 2.4.H.
// The per-test results are written as one readable line at the top of
// the record's lab notes ("Lab results: …"), which is synced to the
// existing SharePoint Records list — no new columns — and parsed back.
// ═══════════════════════════════════════════════════════════════

const LAB_TESTS = {
  listeria:   { label: 'L. monocytogenes', short: 'Listeria',   type: 'qual',  method: 'VIDAS / GENE-UP' },
  salmonella: { label: 'Salmonella',       short: 'Salmonella', type: 'qual',  method: 'VIDAS / GENE-UP' },
  ecoli:      { label: 'E. coli',          short: 'E.Coli',     type: 'count', method: 'Petrifilm count', unit: 'CFU/sponge', lod: 10 },
  saureus:    { label: 'S. aureus',        short: 'S.Aureus',   type: 'count', method: 'Petrifilm count', unit: 'CFU/sponge', lod: 10 }
};
const LAB_ORDER = ['listeria', 'salmonella', 'ecoli', 'saureus'];
const LAB_LINE = 'Lab results: ';

// Tests ordered on a record (legacy records with no flags → all four).
function labTestsOf(rec) {
  const t = LAB_ORDER.filter(k => rec && rec[k]);
  return t.length ? t : LAB_ORDER.slice();
}
const labIsPos = r => !!r && r.r === 'Positive';
const labIsPres = r => !!r && r.r === 'Presumptive';
// A presumptive result is INTERIM: the record stays Pending (monitored) until
// the lab confirms it as Positive (→ retests) or Negative.
function labIsPresumptive(rec) {
  if (!rec || rec.resultado !== 'Pending') return false;
  const r = getLabResults(rec); return !!r && Object.values(r).some(labIsPres);
}

// Readable value of one result
function labResultText(k, res) {
  const T = LAB_TESTS[k]; if (!res || !res.r) return '—';
  if (T.type === 'count') return res.r === 'Negative' ? '<' + T.lod + ' ' + T.unit : (res.v || '?') + ' ' + T.unit;
  return res.r === 'Presumptive' ? 'Presumptive positive' : res.r;
}

function labDefaultNegative(rec) {
  const out = {}; labTestsOf(rec).forEach(k => { out[k] = { r: 'Negative' }; }); return out;
}

// "Lab results: Listeria: Negative; E. coli: <10 CFU/sponge"
function labResultsLine(results) {
  return LAB_LINE + LAB_ORDER.filter(k => results[k]).map(k => LAB_TESTS[k].label + ': ' + labResultText(k, results[k])).join('; ');
}

// Split stored lab notes into { results, notes }.
function labParse(labNotes) {
  const txt = String(labNotes || '');
  const nl = txt.indexOf('\n');
  const first = nl < 0 ? txt : txt.slice(0, nl);
  if (!first.startsWith(LAB_LINE)) return { results: null, notes: txt };
  const results = {};
  first.slice(LAB_LINE.length).split('; ').forEach(part => {
    const i = part.indexOf(': '); if (i < 0) return;
    const name = part.slice(0, i).trim(), val = part.slice(i + 2).trim();
    const k = LAB_ORDER.find(x => LAB_TESTS[x].label === name); if (!k) return;
    if (LAB_TESTS[k].type === 'count') {
      if (val.startsWith('<')) results[k] = { r: 'Negative' };
      else results[k] = { r: 'Positive', v: val.replace(/\s*CFU.*$/i, '').trim() };
    } else {
      results[k] = { r: /^presumptive/i.test(val) ? 'Presumptive' : /^positive/i.test(val) ? 'Positive' : 'Negative' };
    }
  });
  return { results, notes: nl < 0 ? '' : txt.slice(nl + 1) };
}

function getLabResults(rec) { return (rec && rec.labResults) || labParse(rec && rec.labNotes).results; }

// Apply per-test results to a record: overall result, failed pathogens
// (with counts), and the composed lab notes. Mutates and returns rec.
function applyLabResults(rec, results, userNotes) {
  const pos = LAB_ORDER.filter(k => labIsPos(results[k]));
  const pres = LAB_ORDER.filter(k => labIsPres(results[k]));
  rec.labResults = results;
  rec.resultado = pos.length ? 'Positive' : pres.length ? 'Pending' : 'Negative';
  rec.failedPathogens = pos;   // only confirmed positives drive the retests
  rec.failedPathogensLabel = pos.map(k => LAB_TESTS[k].short + (LAB_TESTS[k].type === 'count' ? ' ' + results[k].v + ' CFU' : ''))
    .concat(pres.map(k => LAB_TESTS[k].short + ' (presumptive)')).join(', ');
  const notes = String(userNotes == null ? labParse(rec.labNotes).notes : userNotes).trim();
  rec.labNotes = labResultsLine(results) + (notes ? '\n' + notes : '');
  rec.resultDate = todayLocal();
  return rec;
}

// ── Result modal (Records → enter lab result) ──────────────────
let LABRES = {};   // working copy while the modal is open

function labModalRows(rec) {
  return labTestsOf(rec).map(k => {
    const T = LAB_TESTS[k];
    const opts = T.type === 'qual'
      ? [['Negative', 'Negative'], ['Presumptive', 'Presumptive'], ['Positive', 'Positive']]
      : [['Negative', '<' + T.lod + ' CFU'], ['Positive', 'Count']];
    return '<div class="lr-row" data-k="' + k + '">' +
      '<div class="lr-name">' + esc(T.label) + '<span>' + esc(T.method) + (T.type === 'count' ? ' · ' + esc(T.unit) : '') + '</span></div>' +
      '<div class="lr-seg">' + opts.map(([v, l]) => '<button type="button" data-v="' + v + '" onclick="labPick(\'' + k + '\',\'' + v + '\')">' + esc(l) + '</button>').join('') + '</div>' +
      (T.type === 'count' ? '<input type="number" min="' + T.lod + '" step="1" class="lr-count" id="lrc-' + k + '" placeholder="CFU" oninput="labCount(\'' + k + '\',this.value)">' : '') +
    '</div>';
  }).join('');
}

function labPick(k, v) {
  LABRES[k] = Object.assign({}, LABRES[k], { r: v });
  if (LAB_TESTS[k].type === 'count' && v === 'Negative') delete LABRES[k].v;
  labRefresh();
  if (LAB_TESTS[k].type === 'count' && v === 'Positive') { const i = document.getElementById('lrc-' + k); if (i) i.focus(); }
}
function labCount(k, val) { LABRES[k] = Object.assign({}, LABRES[k], { r: 'Positive', v: String(val).trim() }); labRefresh(); }
function labAllNegative() { const h = GH().find(r => r.id === FAILID); LABRES = labDefaultNegative(h); labRefresh(); }

// Is every ordered test answered (and every count a valid number ≥ LOD)?
function labComplete(rec) {
  return labTestsOf(rec).every(k => {
    const x = LABRES[k]; if (!x || !x.r) return false;
    if (LAB_TESTS[k].type === 'count' && x.r === 'Positive') { const n = Number(x.v); return x.v !== '' && Number.isFinite(n) && n >= LAB_TESTS[k].lod; }
    return true;
  });
}

function labRefresh() {
  const rec = GH().find(r => r.id === FAILID); if (!rec) return;
  document.querySelectorAll('#labResultRows .lr-row').forEach(row => {
    const k = row.dataset.k, x = LABRES[k] || {};
    row.querySelectorAll('.lr-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === x.r));
    row.classList.toggle('pos', labIsPos(x));
    row.classList.toggle('pres', labIsPres(x));
    const inp = row.querySelector('.lr-count');
    if (inp) { inp.style.display = x.r === 'Positive' ? '' : 'none'; if (x.r === 'Positive' && x.v !== undefined && inp.value !== x.v) inp.value = x.v; }
  });
  const done = labComplete(rec);
  const pos = labTestsOf(rec).filter(k => labIsPos(LABRES[k]));
  const pres = labTestsOf(rec).filter(k => labIsPres(LABRES[k]));
  FAILRES = done ? (pos.length ? 'Positive' : pres.length ? 'Presumptive' : 'Negative') : null;
  const out = document.getElementById('labOverall');
  out.className = 'lr-overall' + (done ? (pos.length ? ' bad' : pres.length ? ' warn' : ' ok') : '');
  out.textContent = !done ? 'Enter a result for every test'
    : pos.length ? 'Overall: POSITIVE — ' + pos.map(k => LAB_TESTS[k].label + ' ' + labResultText(k, LABRES[k])).join(', ') + '. Three retests will be scheduled.'
    : pres.length ? 'Overall: PRESUMPTIVE — ' + pres.map(k => LAB_TESTS[k].label).join(', ') + '. Kept under monitoring until the lab confirms; no retests yet.'
    : 'Overall: Negative — all tests below the detection limit / not detected';
  document.getElementById('btnConfirmFail').disabled = !done;
}
