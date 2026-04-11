// ═══════════════════════════════════════════════
// FAIL MODAL
// ═══════════════════════════════════════════════
function openFailModal(id) {
  const h = GH().find(r=>r.id===id);
  if(!h) return;
  FAILID=id; FAILRES=null;

  const patMap = {ecoli:'E.Coli',listeria:'Listeria',salmonella:'Salmonella',saureus:'S.Aureus'};
  const testedPats = Object.entries(patMap).filter(([k]) => h[k]);
  const patsLabel = testedPats.map(([,n])=>n).join(', ');

  document.getElementById('failInfo').innerHTML =
    '<strong>Sample #'+h.sample+'</strong> — '+esc(h.planta)+
    '<br><strong>Área:</strong> '+esc(h.area)+' &nbsp;·&nbsp; <strong>Zona:</strong> '+h.zone+
    '<br><strong>Ubicación:</strong> '+esc(h.location)+
    '<br><strong>Patógenos testeados:</strong> <span style="font-weight:700;color:var(--navy)">'+esc(patsLabel)+'</span>'+
    ' &nbsp;·&nbsp; <strong>Fecha:</strong> '+h.fecha;

  // Build per-pathogen checkboxes
  document.getElementById('pathoCheckboxes').innerHTML = testedPats.map(([key,name]) =>
    '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 12px;'+
    'background:white;border-radius:6px;border:1.5px solid var(--gray-200);transition:all .15s" id="lbl-'+key+'">'+
    '<input type="checkbox" id="chk-'+key+'" onchange="onPathoCheck()" '+
    'style="width:16px;height:16px;accent-color:var(--red);cursor:pointer">'+
    '<span style="font-size:13px;font-weight:600">'+name+'</span>'+
    '<span style="font-size:11px;color:var(--gray-400);margin-left:auto">positivo</span></label>'
  ).join('');

  document.getElementById('pathoResultSection').style.display = 'none';
  document.getElementById('resultBadge').style.display = 'none';
  document.getElementById('failNotes').value = h.labNotes||'';
  document.getElementById('btnConfirmFail').disabled = true;
  document.getElementById('btnNeg').style.opacity = '1';
  document.getElementById('btnPos').style.opacity = '1';
  document.getElementById('failModal').classList.add('open');
}

function updatePathoResult(key) {
  const chk = document.getElementById('chk-'+key);
  const lbl = document.getElementById('lbl-'+key);
  if(chk && lbl) {
    lbl.style.borderColor = chk.checked ? 'var(--red)' : 'var(--gray-200)';
    lbl.style.background  = chk.checked ? 'var(--red-light)' : 'white';
  }
}


function setResult(r) {
  FAILRES = r;
  const pathoSection = document.getElementById('pathoResultSection');
  const b = document.getElementById('resultBadge');

  if(r === 'Positivo') {
    pathoSection.style.display = 'block';
    b.style.display = 'none';
    document.getElementById('btnConfirmFail').disabled = true;
  } else {
    pathoSection.style.display = 'none';
    document.querySelectorAll('#pathoCheckboxes input[type=checkbox]').forEach(c => {
      c.checked = false;
      const lbl = document.getElementById('lbl-'+c.id.replace('chk-',''));
      if(lbl) { lbl.style.borderColor='var(--gray-200)'; lbl.style.background='white'; }
    });
    b.style.display = 'block';
    b.style.background = '#d1fae5'; b.style.color = '#059669';
    b.textContent = '✅ NEGATIVO — Sin contaminación detectada';
    document.getElementById('btnConfirmFail').disabled = false;
  }
  document.getElementById('btnNeg').style.opacity = r==='Negativo' ? '1' : '0.4';
  document.getElementById('btnPos').style.opacity = r==='Positivo' ? '1' : '0.4';
}


function onPathoCheck() {
  const anyChecked = [...document.querySelectorAll('#pathoCheckboxes input[type=checkbox]')].some(c=>c.checked);
  document.getElementById('btnConfirmFail').disabled = !anyChecked;
  // Update badge
  const b = document.getElementById('resultBadge');
  if(anyChecked) {
    const checked = [...document.querySelectorAll('#pathoCheckboxes input[type=checkbox]')]
      .filter(c=>c.checked).map(c=>c.id.replace('chk-',''));
    const names = {ecoli:'E.Coli',listeria:'Listeria',salmonella:'Salmonella',saureus:'S.Aureus'};
    const nameList = checked.map(k=>names[k]).join(', ');
    b.style.display='block';
    b.style.background='#fee2e2'; b.style.color='#dc2626';
    b.textContent='❌ POSITIVO: '+nameList+' — Se generará retest';
  } else {
    b.style.display='none';
  }
}

function closeFailModal() { document.getElementById('failModal').classList.remove('open'); FAILID=null; FAILRES=null; }

function confirmResult() {
  if(!FAILID||!FAILRES) return;
  const hist=GH(), idx=hist.findIndex(r=>r.id===FAILID);
  if(idx<0) return;

  hist[idx].resultado = FAILRES;
  hist[idx].labNotes  = document.getElementById('failNotes').value.trim();
  hist[idx].resultDate = new Date().toISOString().split('T')[0];

  if(FAILRES==='Positivo') {
    // Collect which specific pathogens failed
    const patKeys = ['ecoli','listeria','salmonella','saureus'];
    const failedPats = patKeys.filter(k => {
      const chk = document.getElementById('chk-'+k);
      return chk && chk.checked;
    });
    hist[idx].failedPathogens = failedPats; // e.g. ['listeria']
    hist[idx].failedPathogensLabel = failedPats.map(k =>
      ({ecoli:'E.Coli',listeria:'Listeria',salmonella:'Salmonella',saureus:'S.Aureus'})[k]
    ).join(', ');

    const ex=hist.filter(h=>h.sample==hist[idx].sample&&h.planta===hist[idx].planta&&h.retestNum).length;
    if(ex===0) {
      SH(hist);
      closeFailModal();
      searchHistory(); refreshDashboard();
      toast('❌ Sample #'+hist[idx].sample+' POSITIVO ('+hist[idx].failedPathogensLabel+') — Programa el retest', 'error');
      openRetestDateModal(hist[idx].id);
      return;
    }
  }

  SH(hist);
  closeFailModal();

  // Si es un retest que salió Negativo, verificar si los 3 terminaron
  if (FAILRES === 'Negativo' && hist[idx].retestNum && hist[idx].originalId) {
    const origId     = hist[idx].originalId;
    const allRetests = GH().filter(r => r.originalId === origId && r.retestNum);
    const allDone    = allRetests.length === 3 && allRetests.every(r => r.resultado === 'Negativo');
    if (allDone) {
      searchHistory(); loadRetests(); refreshDashboard();
      toast('✅ Sample #'+hist[idx].sample+' — Los 3 retests negativos. Caso completamente cerrado.', 'success');
      return;
    }
  }

  searchHistory(); loadRetests(); refreshDashboard();
  const msg = FAILRES==='Positivo'
    ? '❌ Sample #'+hist[idx].sample+' POSITIVO: '+hist[idx].failedPathogensLabel
    : '✅ Resultado Negativo registrado';
  toast(msg, FAILRES==='Positivo'?'error':'success');
}

// ═══════════════════════════════════════════════
// RETESTS
// ═══════════════════════════════════════════════
function loadRetests() {
  const hist     = GH();
  const resolved = GRV();
  const rids     = new Set(resolved.map(r => r.originalId));

  // Positivos originales sin retests generados aún
  const pos = hist.filter(h =>
    h.resultado === 'Positivo' && !h.retestNum && !rids.has(h.id)
  );

  // Originales cerrados al generar retests, cuyos retests aún no están todos Negativos
  const closedGroups = resolved.filter(r => r.closedOnGenerate);
  const activeGroups = closedGroups.filter(r => {
    const myRetests = hist.filter(h => h.originalId === r.originalId && h.retestNum);
    return myRetests.length > 0 && myRetests.some(h => h.resultado !== 'Negativo');
  });

  const totalActive = pos.length + activeGroups.length;
  document.getElementById('retestActiveCount').textContent = totalActive;

  const tbody = document.getElementById('retestsList');
  if (totalActive === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--gray-500);padding:40px">✅ Sin retests activos</td></tr>';
  } else {
    const rows = [];

    // Grupo A: positivos sin retests generados
    pos.forEach(orig => {
      const pats = [orig.ecoli?'E.Coli':'',orig.listeria?'Listeria':'',orig.salmonella?'Salmonella':'',orig.saureus?'S.Aureus':''].filter(Boolean).join(', ');
      rows.push(`<tr style="background:#fff5f5;border-top:2px solid var(--red)">
        <td style="font-weight:700;font-size:14px;color:var(--red)">${orig.sample}</td>
        <td><span class="badge badge-gray">${orig.planta}</span></td>
        <td style="font-size:12px;font-weight:600">${orig.fecha}</td>
        <td style="max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(orig.area)}</td>
        <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(orig.location)}">${esc(orig.location)}</td>
        <td style="color:var(--red);font-weight:600;font-size:12px">${pats}${orig.failedPathogensLabel?'<br><span style="font-size:10px;background:var(--red-light);padding:2px 6px;border-radius:4px">Falló: '+esc(orig.failedPathogensLabel)+'</span>':''}</td>
        <td style="text-align:center"><span class="badge badge-red">❌ Positivo</span></td>
        <td style="font-size:11px;color:var(--gray-500)">${orig.labNotes||'—'}</td>
        <td style="text-align:center"><span style="font-size:11px;color:var(--yellow);font-weight:600">⚠️ Generar retests</span></td>
      </tr>`);
    });

    // Grupo B: retests activos (original ya cerrado)
    activeGroups.forEach(resolvedOrig => {
      const retests = hist.filter(h => h.originalId === resolvedOrig.originalId && h.retestNum)
                          .sort((a,b) => a.retestNum.localeCompare(b.retestNum));
      if (!retests.length) return;
      rows.push(`<tr style="background:#fff0f0;border-top:2px solid var(--red)">
        <td style="font-weight:700;font-size:14px;color:var(--red)" rowspan="${retests.length+1}">${resolvedOrig.sample}</td>
        <td><span class="badge badge-gray">${resolvedOrig.planta}</span></td>
        <td style="font-size:12px;color:var(--gray-500)">${resolvedOrig.originalFecha}</td>
        <td colspan="3" style="font-size:12px;color:var(--gray-500)">${esc(resolvedOrig.area)}</td>
        <td style="text-align:center"><span class="badge badge-red">❌ Falló</span></td>
        <td colspan="2" style="font-size:11px;color:var(--gray-400);font-style:italic;text-align:center">${resolvedOrig.notes||''}</td>
      </tr>`);
      retests.forEach((rt, i) => {
        const isDone    = rt.resultado === 'Negativo';
        const isPending = rt.resultado === 'Pendiente';
        const isPos     = rt.resultado === 'Positivo';
        const statusColor = isDone?'var(--green)':isPos?'var(--red)':'var(--yellow)';
        const statusText  = isDone?'✅ Negativo':isPos?'❌ Positivo':'⏳ Pendiente';
        rows.push(`<tr style="background:${isDone?'#f0fdf4':isPending?'#fffbeb':'#fff5f5'}">
          <td><span class="badge badge-gray">${resolvedOrig.planta}</span></td>
          <td style="font-size:12px">${rt.fecha}</td>
          <td colspan="2" style="font-size:12px;color:var(--gray-700);font-weight:600">${rt.retestNum}</td>
          <td></td>
          <td style="text-align:center;font-size:12px;font-weight:600;color:${statusColor}">${statusText}</td>
          <td style="font-size:11px;color:var(--gray-500)">${rt.labNotes||'—'}</td>
          <td style="text-align:center">
            <div style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap">
              <button class="btn btn-primary btn-sm" onclick="exportRetestPDF(${rt.id})" style="font-size:10px;padding:4px 7px">📄 PDF</button>
              ${!isDone?`<button class="btn btn-sm" onclick="openFailModal(${rt.id})" style="background:var(--navy);color:white;font-size:10px;padding:4px 7px">📋 Lab</button>`:''}
            </div>
          </td>
        </tr>`);
      });
    });
    tbody.innerHTML = rows.join('');
  }

  // Resueltos — excluir closedOnGenerate con retests aún pendientes
  const resolvedToShow = resolved.filter(r => {
    if (!r.closedOnGenerate) return true;
    const myRetests = hist.filter(h => h.originalId === r.originalId && h.retestNum);
    return myRetests.every(h => h.resultado === 'Negativo');
  });
  const rTbody = document.getElementById('retestResolved');
  rTbody.innerHTML = resolvedToShow.length === 0
    ? '<tr><td colspan="8" style="text-align:center;color:var(--gray-500);padding:32px">Sin retests resueltos</td></tr>'
    : [...resolvedToShow].reverse().map(r => `<tr style="background:#f0fdf4">
        <td style="font-weight:700">${r.sample}</td>
        <td><span class="badge badge-gray">${r.planta}</span></td>
        <td>${r.area}</td>
        <td style="font-size:12px">${r.originalFecha}</td>
        <td style="font-size:12px">${r.resolvedDate}</td>
        <td style="text-align:center"><span class="badge badge-green">${r.retestNum||'—'}</span></td>
        <td><span style="color:var(--green);font-weight:600">✅ ${r.closedOnGenerate?'Positivo — Retests OK':'Negativo / OK'}</span></td>
        <td style="font-size:12px;color:var(--gray-500)">${r.notes||'—'}</td>
      </tr>`).join('');
}

function openRetestOkModal(id) {
  const hist=GH(), h=hist.find(r=>r.id===id);
  if(!h) return;
  OKID=id;
  const retests=hist.filter(r=>r.sample==h.sample&&r.planta===h.planta&&r.retestNum);
  const last=retests[retests.length-1];
  document.getElementById('retestOkInfo').innerHTML='<strong>Sample #'+h.sample+'</strong> — '+esc(h.planta)+'<br><strong>Área:</strong> '+esc(h.area)+'<br><strong>Fecha del positivo:</strong> '+h.fecha+'<br><strong>Último retest:</strong> '+(last?last.retestNum+' ('+last.fecha+')':'—');
  document.getElementById('retestOkNotes').value='';
  document.getElementById('retestOkModal').classList.add('open');
}

function closeRetestOkModal() { document.getElementById('retestOkModal').classList.remove('open'); OKID=null; }

function confirmRetestOk() {
  if(!OKID) return;
  const hist=GH(), h=hist.find(r=>r.id===OKID);
  if(!h) return;
  const notes=document.getElementById('retestOkNotes').value.trim();
  const resolved=GRV();
  const retests=hist.filter(r=>r.sample==h.sample&&r.planta===h.planta&&r.retestNum);
  const last=retests[retests.length-1];
  resolved.push({originalId:h.id,sample:h.sample,planta:h.planta,area:h.area,location:h.location,originalFecha:h.fecha,resolvedDate:new Date().toISOString().split('T')[0],retestNum:last?last.retestNum:'—',notes});
  SRV(resolved);
  closeRetestOkModal();
  loadRetests(); refreshDashboard();
  toast('✅ Sample #'+h.sample+' resuelto','success');
}

// ═══════════════════════════════════════════════
// RETEST DATE MODAL
// ═══════════════════════════════════════════════
let RDID = null; // retest date target original ID

function getNextWeekday(date) {
  // If date is Saturday (6) → move to Monday (+2)
  // If date is Sunday (0) → move to Monday (+1)
  const d = new Date(date);
  const day = d.getDay();
  if(day === 6) d.setDate(d.getDate() + 2);
  if(day === 0) d.setDate(d.getDate() + 1);
  return d;
}

function addWorkday(date, days) {
  // Add N working days (skip weekends)
  const d = new Date(date);
  let added = 0;
  while(added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if(day !== 0 && day !== 6) added++;
  }
  return d;
}

function openRetestDateModal(origId) {
  const hist = GH();
  const h = hist.find(r => r.id === origId);
  if(!h) return;
  RDID = origId;

  document.getElementById('retestDateInfo').innerHTML =
    '<strong>Sample #'+h.sample+'</strong> — '+h.planta+
    '<br><strong>Área:</strong> '+esc(h.area)+
    '<br><strong>Resultado positivo:</strong> '+h.fecha;

  // Default start date: next weekday from today
  const defaultStart = getNextWeekday(new Date());
  // If today is Mon-Wed, suggest tomorrow; Thu/Fri suggest Monday
  const today = new Date();
  const todayDay = today.getDay();
  let suggestedStart;
  if(todayDay >= 4) { // Thursday or Friday
    // Next Monday
    suggestedStart = new Date(today);
    suggestedStart.setDate(today.getDate() + (8 - todayDay));
  } else {
    // Next weekday
    suggestedStart = addWorkday(today, 1);
  }

  const dateInput = document.getElementById('retestStartDate');
  dateInput.value = suggestedStart.toISOString().split('T')[0];
  updateRetestPreview();
  document.getElementById('retestDateModal').classList.add('open');
  dateInput.addEventListener('input', updateRetestPreview);
}

function updateRetestPreview() {
  const val = document.getElementById('retestStartDate').value;
  if(!val) { document.getElementById('retestPreview').textContent = ''; return; }
  const start = new Date(val + 'T12:00:00');
  const day = start.getDay();
  let warning = '';
  if(day === 0 || day === 6) {
    warning = '⚠️ La fecha seleccionada es fin de semana. Se moverá automáticamente al lunes.';
  }
  const d1 = getNextWeekday(start);
  const d2 = addWorkday(d1, 1);
  const d3 = addWorkday(d2, 1);
  const fmt = d => d.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});
  document.getElementById('retestPreview').innerHTML =
    (warning ? '<p style="color:var(--yellow);font-weight:600;margin-bottom:6px">'+warning+'</p>' : '') +
    '📅 <strong>Retest #1:</strong> '+fmt(d1)+'<br>' +
    '📅 <strong>Retest #2:</strong> '+fmt(d2)+'<br>' +
    '📅 <strong>Retest #3:</strong> '+fmt(d3);
}

function closeRetestDateModal() {
  document.getElementById('retestDateModal').classList.remove('open');
  RDID = null;
  const dateInput = document.getElementById('retestStartDate');
  dateInput.removeEventListener('input', updateRetestPreview);
}

function confirmRetestDates() {
  const val = document.getElementById('retestStartDate').value;
  if(!val) { toast('Selecciona una fecha de inicio', 'error'); return; }

  const hist = GH();
  const origIdx = hist.findIndex(r => r.id === RDID);
  if(origIdx < 0) return;
  const orig = hist[origIdx];

  // Calculate 3 consecutive workdays
  const start = new Date(val + 'T12:00:00');
  const d1 = getNextWeekday(start);
  const d2 = addWorkday(d1, 1);
  const d3 = addWorkday(d2, 1);
  const dates = [d1, d2, d3];

  let nextId = Math.max(...hist.map(h => h.id)) + 1;
  dates.forEach((d, i) => {
    hist.push({
      ...orig,
      id: nextId++,
      fecha: d.toISOString().split('T')[0],
      resultado: 'Pendiente',
      retestNum: 'Retest #'+(i+1),
      location: orig.location,
      labNotes: '',
      isRetest: true,
      originalId: orig.id,
      scheduled: true
    });
  });
  SH(hist);

  // Cerrar el original INMEDIATAMENTE — los retests son casos independientes
  const resolved = GRV();
  if (!resolved.some(r => r.originalId === orig.id)) {
    resolved.push({
      originalId:       orig.id,
      sample:           orig.sample,
      planta:           orig.planta,
      area:             orig.area,
      location:         orig.location,
      originalFecha:    orig.fecha,
      resolvedDate:     new Date().toISOString().split('T')[0],
      retestNum:        '—',
      notes:            'Positivo: '+(orig.failedPathogensLabel||'—')+'. 3 retests programados.',
      closedOnGenerate: true
    });
    SRV(resolved);
  }

  closeRetestDateModal();
  loadRetests(); searchHistory(); refreshDashboard();
  toast('✅ 3 retests programados para Sample #'+orig.sample+' — Caso original cerrado.', 'success');
}