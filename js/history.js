// ═══════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════
function searchHistory() {
  const planta = document.getElementById('fPlant').value;
  const sample = document.getElementById('fSample').value.trim();
  const desde  = document.getElementById('fFrom').value;
  const hasta  = document.getElementById('fTo').value;
  const result = document.getElementById('fResult').value;
  let hist = GH();
  if(planta) hist = hist.filter(h=>h.planta===planta);
  if(sample) hist = hist.filter(h=>String(h.sample).includes(sample));
  if(desde)  hist = hist.filter(h=>h.fecha>=desde);
  if(hasta)  hist = hist.filter(h=>h.fecha<=hasta);
  if(result) hist = hist.filter(h=>h.resultado===result);
  hist.sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.id-a.id);
  document.getElementById('resultCount').textContent = hist.length;
  const canEdit = (typeof canEditRecords === 'function') && canEditRecords();
  const tbody = document.getElementById('historyTable');
  clearHistSelection();
  if(!hist.length) {
    tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;color:var(--gray-500);padding:40px">'+(GH().length===0?'No records yet. Generate and save a week first.':'No results for these filters.')+'</td></tr>';
    return;
  }
  tbody.innerHTML = hist.map(h => {
    const rc = h.resultado==='Positive'?'var(--red)':h.resultado==='Negative'?'var(--green)':'var(--yellow)';
    const isPending = h.resultado==='Pending';
    const dash = '<span style="color:var(--gray-200)">–</span>';

    // Minimal, single-line action cell
    let action;
    if(h.resultado==='Negative') {
      action = '<span style="font-size:12px;color:var(--green);display:inline-flex;align-items:center;gap:5px"><svg class="ln ico-inline" width="13" height="13" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>OK</span>';
    } else if(h.resultado==='Positive' && GH().some(r => r.originalId===h.id && r.retestNum)) {
      action = '<span style="font-size:11px;color:var(--gray-400);display:inline-flex;align-items:center;gap:5px"><svg class="ln ico-inline" width="12" height="12" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Retests done</span>';
    } else {
      action = '<button class="rt-btn accent" onclick="openFailModal('+h.id+')"><svg class="ln ico-inline" width="12" height="12" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>Result</button>';
    }
    const editBtn = canEdit ? '<button class="rt-btn" onclick="openAdminEdit('+h.id+')" title="Correct record" style="padding:6px 8px"><svg class="ln ico-inline" width="12" height="12" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>' : '';

    return `<tr>
      <td style="text-align:center">${isPending?`<input type="checkbox" class="hist-check" data-id="${h.id}" onchange="updateHistBulkBar()">`:''}</td>
      <td style="font-size:12px;white-space:nowrap">${h.fecha}</td>
      <td><span class="badge badge-gray">${h.planta}</span></td>
      <td style="font-weight:700;font-size:14px">${h.sample}</td>
      <td style="text-align:center">${h.zone}</td>
      <td style="max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(h.area)}">${esc(h.area)}</td>
      <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(h.location)}">${esc(h.location)}</td>
      <td class="center">${h.ecoli?'<span class="px">X</span>':dash}</td>
      <td class="center">${h.listeria?'<span class="px">X</span>':dash}</td>
      <td class="center">${h.salmonella?'<span class="px">X</span>':dash}</td>
      <td class="center">${h.saureus?'<span class="px">X</span>':dash}</td>
      <td><span style="font-weight:600;font-size:12px;color:${rc}">${h.resultado==='Positive'?'<svg class="ln ico-inline" width="13" height="13" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>':h.resultado==='Negative'?'<svg class="ln ico-inline" width="13" height="13" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>':'<svg class="ln ico-inline" width="13" height="13" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 8 12 12 14 14"/></svg>'}${h.resultado}</span>
          ${h.resultado==='Positive'&&h.failedPathogensLabel?'<div style="font-size:10px;color:var(--red);font-weight:600;margin-top:1px">'+esc(h.failedPathogensLabel)+'</div>':''}
          ${h.labNotes?'<div style="font-size:10px;color:var(--gray-400);margin-top:1px;max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+esc(h.labNotes)+'">'+esc(h.labNotes)+'</div>':''}</td>
      <td class="center">${h.retestNum?'<span class="badge badge-red" style="font-size:10px">'+h.retestNum+'</span>':dash}</td>
      <td><div style="display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:nowrap">${action}${editBtn}</div></td>
    </tr>`;
  }).join('');
}

// ── Bulk-confirm Negative from Test History ──────────────────────
function updateHistBulkBar() {
  const n = document.querySelectorAll('.hist-check:checked').length;
  const bar = document.getElementById('histBulkBar');
  if (bar) bar.style.display = n > 0 ? 'flex' : 'none';
  const c = document.getElementById('histBulkCount');
  if (c) c.textContent = n + ' selected';
}
function toggleHistSelectAll(cb) {
  document.querySelectorAll('.hist-check').forEach(c => { c.checked = cb.checked; });
  updateHistBulkBar();
}
function clearHistSelection() {
  document.querySelectorAll('.hist-check:checked').forEach(c => { c.checked = false; });
  const sa = document.getElementById('histSelectAll'); if (sa) sa.checked = false;
  updateHistBulkBar();
}
function bulkMarkNegativeHistory() {
  const ids = [...document.querySelectorAll('.hist-check:checked')].map(c => +c.dataset.id);
  if (!ids.length) return;
  if (!confirm('Mark ' + ids.length + ' test(s) as Negative?')) return;
  const n = _markRecordsNegative(ids);
  if (!n) return;
  searchHistory();
  if (typeof loadRetests === 'function') loadRetests();
  toast(n + ' test(s) marked Negative', 'success');
}

function clearFilters() {
  ['fPlant','fResult'].forEach(id=>document.getElementById(id).value='');
  ['fSample','fFrom','fTo'].forEach(id=>document.getElementById(id).value='');
  searchHistory();
}