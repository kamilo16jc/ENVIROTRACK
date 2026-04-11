// ═══════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════
function searchHistory() {
  const planta = document.getElementById('fPlanta').value;
  const sample = document.getElementById('fSample').value.trim();
  const desde  = document.getElementById('fDesde').value;
  const hasta  = document.getElementById('fHasta').value;
  const result = document.getElementById('fResult').value;
  let hist = GH();
  if(planta) hist = hist.filter(h=>h.planta===planta);
  if(sample) hist = hist.filter(h=>String(h.sample).includes(sample));
  if(desde)  hist = hist.filter(h=>h.fecha>=desde);
  if(hasta)  hist = hist.filter(h=>h.fecha<=hasta);
  if(result) hist = hist.filter(h=>h.resultado===result);
  hist.sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.id-a.id);
  document.getElementById('resultCount').textContent = hist.length;
  const tbody = document.getElementById('historyTable');
  if(!hist.length) {
    tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;color:var(--gray-500);padding:40px">'+(GH().length===0?'No hay registros aún. Genera y guarda una semana primero.':'Sin resultados para estos filtros.')+'</td></tr>';
    return;
  }
  tbody.innerHTML = hist.map(h => {
    const rc = h.resultado==='Positivo'?'var(--red)':h.resultado==='Negativo'?'var(--green)':'var(--yellow)';
    const rb = h.resultado==='Positivo'?'background:#fff5f5':h.resultado==='Negativo'?'background:#f0fdf4':'';
    return `<tr style="${rb}">
      <td style="font-size:12px;white-space:nowrap">${h.fecha}</td>
      <td><span class="badge badge-gray">${h.planta}</span></td>
      <td style="font-weight:700;font-size:14px">${h.sample}</td>
      <td style="text-align:center">${h.zone}</td>
      <td style="max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(h.area)}">${esc(h.area)}</td>
      <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(h.location)}">${esc(h.location)}</td>
      <td class="center">${h.ecoli?'<span class="px">X</span>':'<span style="color:var(--gray-200)">–</span>'}</td>
      <td class="center">${h.listeria?'<span class="px">X</span>':'<span style="color:var(--gray-200)">–</span>'}</td>
      <td class="center">${h.salmonella?'<span class="px">X</span>':'<span style="color:var(--gray-200)">–</span>'}</td>
      <td class="center">${h.saureus?'<span class="px">X</span>':'<span style="color:var(--gray-200)">–</span>'}</td>
      <td><span style="font-weight:600;font-size:12px;color:${rc}">${h.resultado==='Positivo'?'❌':h.resultado==='Negativo'?'✅':'⏳'} ${h.resultado}</span>
          ${h.resultado==='Positivo'&&h.failedPathogensLabel?'<div style="font-size:10px;color:var(--red);font-weight:600;margin-top:1px">'+esc(h.failedPathogensLabel)+'</div>':''}
          ${h.labNotes?'<div style="font-size:10px;color:var(--gray-400);margin-top:1px;max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+esc(h.labNotes)+'">'+esc(h.labNotes)+'</div>':''}</td>
      <td class="center">${h.retestNum?'<span class="badge badge-red" style="font-size:10px">'+h.retestNum+'</span>':'<span style="color:var(--gray-200)">–</span>'}</td>
      <td>${(()=>{
        if(h.resultado==='Negativo') return '<span style="font-size:11px;color:var(--green)">✅ OK</span>';
        const hasRetests = GH().some(r => r.originalId===h.id && r.retestNum);
        if(h.resultado==='Positivo' && hasRetests)
          return '<span style="font-size:11px;color:var(--gray-400)">🔒 Retests generados</span>';
        return '<button class="btn btn-sm" onclick="openFailModal('+h.id+')" style="background:'+(h.resultado==='Positivo'?'#DC2626':'var(--navy)')+';color:white;font-size:11px;padding:5px 10px">📋 Resultado</button>';
      })()}</td>
    </tr>`;
  }).join('');
}

function clearFilters() {
  ['fPlanta','fResult'].forEach(id=>document.getElementById(id).value='');
  ['fSample','fDesde','fHasta'].forEach(id=>document.getElementById(id).value='');
  searchHistory();
}