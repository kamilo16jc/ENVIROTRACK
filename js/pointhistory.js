// ═══════════════════════════════════════════════════════════════
// SAMPLE POINT HISTORY — the magnifier on each generated test.
// Shows every time a MASTER point was sampled (routine, retests and
// vector samples), a 26-week strip, and how often it is sampled
// compared with the other points of the same building — so QA can
// verify the rotation is really spreading across the facility.
// ═══════════════════════════════════════════════════════════════

const PH_WEEKS = 26;

const _phIso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
// Monday (local) of the week that contains an ISO date → 'YYYY-MM-DD'
function _phMonday(iso) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return _phIso(d);
}
function _phFmt(iso) {
  const d = new Date(iso + 'T12:00:00');
  return isNaN(d) ? (iso || '') : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function _phType(h) {
  const rn = String(h.retestNum || '').trim();
  if (!rn) return h.isRetest ? 'Retest' : 'Routine';
  return /^\d+$/.test(rn) ? 'Retest #' + rn : rn;
}
const _phIsRoutine = h => !h.isRetest && !String(h.retestNum || '').trim();

// From the generator table row
function genPointHistory(i) {
  const t = TESTS[i]; if (!t) return;
  openPointHistory(document.getElementById('genPlant').value, t.sample, t);
}

function openPointHistory(planta, sample, fallback) {
  const key = String(sample).trim();
  const all = GH().filter(h => h.planta === planta);
  const recs = all.filter(h => String(h.sample) === key).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const routine = recs.filter(_phIsRoutine);
  const pt = (typeof getActiveMaster === 'function' ? getActiveMaster(planta) : []).find(p => String(p.sample) === key) || fallback || recs[0] || {};
  const today = todayLocal();

  // Weeks window (oldest → newest)
  const weeks = [];
  const cur = new Date(_phMonday(today) + 'T12:00:00');
  for (let k = PH_WEEKS - 1; k >= 0; k--) { const d = new Date(cur); d.setDate(d.getDate() - k * 7); weeks.push(_phIso(d)); }
  const since = weeks[0];

  // This point vs. the building, routine samples in the window
  const inWin = all.filter(h => _phIsRoutine(h) && h.fecha >= since);
  const perPoint = {};
  inWin.forEach(h => { const s = String(h.sample); perPoint[s] = (perPoint[s] || 0) + 1; });
  const master = typeof getActiveMaster === 'function' ? getActiveMaster(planta) : [];
  const nPoints = master.length || Object.keys(perPoint).length || 1;
  const avg = inWin.length / nPoints;
  const mine = perPoint[key] || 0;
  const neverCount = master.filter(p => !perPoint[String(p.sample)]).length;

  // Interval between routine samplings
  const rDates = [...new Set(routine.map(h => h.fecha))].sort();
  const gaps = rDates.slice(1).map((d, i) => (new Date(d) - new Date(rDates[i])) / 864e5);
  const avgGapW = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length / 7 : null;
  const last = rDates[rDates.length - 1];
  const weeksAgo = last ? Math.floor((new Date(today) - new Date(last)) / (7 * 864e5)) : null;
  const positives = recs.filter(h => h.resultado === 'Positive').length;

  // Rotation verdict
  let verdict, cls;
  const lastPos = recs.find(h => h.resultado === 'Positive');
  const posWeeks = lastPos ? Math.floor((new Date(today) - new Date(lastPos.fecha)) / (7 * 864e5)) : null;
  if (lastPos && posWeeks < 8) { verdict = 'Positive on ' + _phFmt(lastPos.fecha) + ' — this site is under follow-up (retests / CAPA).'; cls = 'bad'; }
  else if (!routine.length) { verdict = 'Never sampled before — a new site for the rotation.'; cls = 'ok'; }
  else if (weeksAgo !== null && weeksAgo < 4) { verdict = 'Sampled ' + (weeksAgo === 0 ? 'this week' : weeksAgo + ' week' + (weeksAgo === 1 ? '' : 's') + ' ago') + ' — consider rotating to a less-sampled site.'; cls = 'warn'; }
  else if (mine > avg * 1.5 && mine >= 2) { verdict = 'Sampled more often than the average ' + planta + ' point in the last ' + PH_WEEKS + ' weeks.'; cls = 'warn'; }
  else { verdict = 'Good rotation — last sampled ' + weeksAgo + ' weeks ago.'; cls = 'ok'; }

  // 26-week strip
  const byWeek = {};
  recs.forEach(h => { const w = _phMonday(h.fecha); (byWeek[w] = byWeek[w] || []).push(h); });
  const strip = weeks.map(w => {
    const hs = byWeek[w] || [];
    const st = !hs.length ? '' : hs.some(h => h.resultado === 'Positive') ? ' pos' : hs.some(_phIsRoutine) ? ' on' : ' rt';
    const tip = _phFmt(w) + (hs.length ? ' — ' + hs.map(h => _phType(h) + ' ' + (h.resultado || 'Pending')).join(', ') : '');
    return '<span class="ph-wk' + st + (w === _phMonday(today) ? ' now' : '') + '" title="' + esc(tip) + '"></span>';
  }).join('');

  const PAT = [['ecoli', 'E. coli'], ['listeria', 'Listeria'], ['salmonella', 'Salmonella'], ['saureus', 'S. aureus']];
  const rows = recs.map(h => {
    const pats = PAT.filter(([k]) => h[k]).map(([, l]) => l).join(', ') || '—';
    const res = h.resultado || 'Pending';
    const badge = res === 'Positive' ? 'badge-red' : res === 'Negative' ? 'badge-green' : 'badge-gray';
    return '<tr><td style="white-space:nowrap">' + esc(_phFmt(h.fecha)) + '</td><td>' + esc(_phType(h)) + '</td>' +
      '<td style="font-size:12px">' + esc(pats) + '</td><td><span class="badge ' + badge + '">' + esc(res) + '</span></td>' +
      '<td style="font-size:12px;color:var(--gray-500)">' + esc(h.by || '—') + '</td></tr>';
  }).join('');

  const tile = (v, l) => '<div class="ph-tile"><div class="ph-v">' + v + '</div><div class="ph-l">' + l + '</div></div>';
  document.getElementById('pointHistBody').innerHTML =
    '<div class="ph-head"><div><h3>Sample #' + esc(key) + ' <span class="badge badge-gray">' + esc(planta) + '</span></h3>' +
      '<div class="ph-sub">Zone ' + esc(pt.zone || '—') + ' · ' + esc(pt.area || '—') + (pt.line && pt.line !== 'N/A' ? ' · Line ' + esc(pt.line) : '') + ' · ' + esc(pt.location || '—') + '</div></div>' +
      '<button class="emp-edit" onclick="closePointHistory()" title="Close" aria-label="Close"><svg class="ln" width="14" height="14" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>' +
    '<div class="ph-verdict ' + cls + '">' + esc(verdict) + '</div>' +
    '<div class="ph-tiles">' +
      tile(routine.length, 'Times sampled') +
      tile(last ? esc(_phFmt(last)) : '—', 'Last routine sample') +
      tile(avgGapW !== null ? avgGapW.toFixed(1) + ' wk' : '—', 'Avg. interval') +
      tile(positives, 'Positives') +
    '</div>' +
    '<div class="ph-sec">Last ' + PH_WEEKS + ' weeks</div>' +
    '<div class="ph-strip">' + strip + '</div>' +
    '<div class="ph-legend"><span><i class="ph-wk on"></i>Routine</span><span><i class="ph-wk rt"></i>Retest / vector</span><span><i class="ph-wk pos"></i>Positive</span>' +
      '<span style="margin-left:auto">This point: <strong>' + mine + '</strong> · ' + esc(planta) + ' average: <strong>' + avg.toFixed(1) + '</strong> · never sampled: <strong>' + neverCount + '</strong> of ' + nPoints + ' points</span></div>' +
    '<div class="ph-sec">Sampling history</div>' +
    (rows
      ? '<div class="table-wrap" style="max-height:260px;overflow-y:auto"><table><thead><tr><th>Date</th><th>Type</th><th>Pathogens</th><th>Result</th><th>Collected by</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<div style="text-align:center;color:var(--gray-500);padding:22px;font-size:13px">No samples recorded for this point yet.</div>');
  document.getElementById('pointHistModal').classList.add('open');
}

function closePointHistory() { document.getElementById('pointHistModal').classList.remove('open'); }
