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
    '<br><strong>Area:</strong> '+esc(h.area)+' &nbsp;·&nbsp; <strong>Zone:</strong> '+h.zone+
    '<br><strong>Location:</strong> '+esc(h.location)+
    '<br><strong>Pathogens tested:</strong> <span style="font-weight:700;color:var(--navy)">'+esc(patsLabel)+'</span>'+
    ' &nbsp;·&nbsp; <strong>Date:</strong> '+h.fecha;

  // Build per-pathogen checkboxes
  document.getElementById('pathoCheckboxes').innerHTML = testedPats.map(([key,name]) =>
    '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 12px;'+
    'background:white;border-radius:6px;border:1.5px solid var(--gray-200);transition:all .15s" id="lbl-'+key+'">'+
    '<input type="checkbox" id="chk-'+key+'" onchange="onPathoCheck()" '+
    'style="width:16px;height:16px;accent-color:var(--red);cursor:pointer">'+
    '<span style="font-size:13px;font-weight:600">'+name+'</span>'+
    '<span style="font-size:11px;color:var(--gray-400);margin-left:auto">positive</span></label>'
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

  if(r === 'Positive') {
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
    b.textContent = 'NEGATIVE — No contamination detected';
    document.getElementById('btnConfirmFail').disabled = false;
  }
  document.getElementById('btnNeg').style.opacity = r==='Negative' ? '1' : '0.4';
  document.getElementById('btnPos').style.opacity = r==='Positive' ? '1' : '0.4';
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
    b.textContent='POSITIVE: '+nameList+' — A retest will be generated';
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

  if(FAILRES==='Positive') {
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

    // A positive test — original OR a retest — escalates: it spawns its own
    // fresh round of 3 retests, unless it already spawned one.
    const alreadySpawned = hist.some(h => h.originalId === hist[idx].id && h.retestNum);
    if(!alreadySpawned) {
      SH(hist);
      syncSafe(() => syncUpdateRecord(hist[idx]), 'update result');
      closeFailModal();
      searchHistory(); loadRetests(); refreshDashboard();
      toast('Sample #'+hist[idx].sample+' POSITIVE ('+hist[idx].failedPathogensLabel+') — Schedule the 3 retests', 'error');
      openRetestDateModal(hist[idx].id);
      return;
    }
  }

  SH(hist);
  syncSafe(() => syncUpdateRecord(hist[idx]), 'update result');
  closeFailModal();

  // If this is a retest that came back Negative, check whether all 3 are done
  if (FAILRES === 'Negative' && hist[idx].retestNum && hist[idx].originalId) {
    const origId     = hist[idx].originalId;
    const allRetests = GH().filter(r => r.originalId === origId && r.retestNum);
    const allDone    = allRetests.length === 3 && allRetests.every(r => r.resultado === 'Negative');
    if (allDone) {
      searchHistory(); loadRetests(); refreshDashboard();
      toast('✅ Sample #'+hist[idx].sample+' — All 3 retests negative. Case fully closed.', 'success');
      return;
    }
  }

  searchHistory(); loadRetests(); refreshDashboard();
  const msg = FAILRES==='Positive'
    ? '❌ Sample #'+hist[idx].sample+' POSITIVE: '+hist[idx].failedPathogensLabel
    : '✅ Negative result recorded';
  toast(msg, FAILRES==='Positive'?'error':'success');
}

// ═══════════════════════════════════════════════
// RETESTS
// ═══════════════════════════════════════════════
function loadRetests() {
  const hist     = GH();
  const resolved = GRV();
  const rids     = new Set(resolved.map(r => r.originalId));
  // Roots that already spawned retests (derived straight from Records). Used as
  // a safety net so a positive whose resolved anchor is missing does NOT
  // resurface as "Generate retests" and let the user create duplicate rounds.
  const rootsWithRetests = new Set(
    hist.filter(h => h.retestNum && h.originalId).map(h => h.originalId)
  );

  // Original positives without retests generated yet
  const pos = hist.filter(h =>
    h.resultado === 'Positive' && !h.retestNum &&
    !rids.has(h.id) && !rootsWithRetests.has(h.id)
  );

  // A round (retests sharing a root) is ACTIVE while it still has PENDING
  // retests AND none of its retests failed. A failed retest escalates to a
  // brand-new round, so its old round is no longer active.
  // Anchor list = the resolved "closedOnGenerate" entries, PLUS synthetic
  // anchors rebuilt from Records for any root that has retest children but lost
  // its resolved entry (e.g. a sync push that never landed). This keeps the
  // pending retests — and their Lab/Send buttons — visible from Records alone.
  const resolvedRootIds = new Set(resolved.map(r => r.originalId));
  const syntheticGroups = [...rootsWithRetests]
    .filter(id => !resolvedRootIds.has(id))
    .map(id => {
      const o = hist.find(h => h.id === id) || {};
      return {
        originalId: id, sample: o.sample, planta: o.planta,
        area: o.area || '', location: o.location || '',
        originalDate: o.fecha || '',
        notes: o.failedPathogensLabel ? 'Positive: ' + o.failedPathogensLabel : '',
        closedOnGenerate: true
      };
    });
  const closedGroups = [...resolved.filter(r => r.closedOnGenerate), ...syntheticGroups];
  const activeGroups = closedGroups.filter(r => {
    const myRetests = hist.filter(h => h.originalId === r.originalId && h.retestNum);
    const hasPending   = myRetests.some(h => h.resultado === 'Pending');
    const hasEscalated = myRetests.some(h => h.resultado === 'Positive');
    return myRetests.length > 0 && hasPending && !hasEscalated;
  });

  const totalActive = pos.length + activeGroups.length;
  document.getElementById('retestActiveCount').textContent = totalActive;

  const tbody = document.getElementById('retestsList');
  if (totalActive === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--gray-500);padding:40px"><svg class="ln ico-inline" width="14" height="14" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>No active retests</td></tr>';
  } else {
    const rows = [];

    // Group A: positives without retests generated
    pos.forEach(orig => {
      const pats = [orig.ecoli?'E.Coli':'',orig.listeria?'Listeria':'',orig.salmonella?'Salmonella':'',orig.saureus?'S.Aureus':''].filter(Boolean).join(', ');
      rows.push(`<tr style="background:#fff5f5;border-top:2px solid var(--red)">
        <td style="font-weight:700;font-size:14px;color:var(--red)">${orig.sample}</td>
        <td><span class="badge badge-gray">${orig.planta}</span></td>
        <td style="font-size:12px;font-weight:600">${orig.fecha}</td>
        <td style="max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(orig.area)}</td>
        <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(orig.location)}">${esc(orig.location)}</td>
        <td style="color:var(--red);font-weight:600;font-size:12px">${pats}${orig.failedPathogensLabel?'<br><span style="font-size:10px;background:var(--red-light);padding:2px 6px;border-radius:4px">Failed: '+esc(orig.failedPathogensLabel)+'</span>':''}</td>
        <td style="text-align:center"><span class="badge badge-red">Positive</span></td>
        <td style="font-size:11px;color:var(--gray-500)">${orig.labNotes||'—'}</td>
        <td style="text-align:center"><span style="font-size:11px;color:var(--yellow);font-weight:600">Generate retests</span></td>
      </tr>`);
    });

    // Group B: active retests (original already closed)
    activeGroups.forEach(resolvedOrig => {
      const retests = hist.filter(h => h.originalId === resolvedOrig.originalId && h.retestNum)
                          .sort((a,b) => a.retestNum.localeCompare(b.retestNum));
      if (!retests.length) return;
      rows.push(`<tr style="background:#fff0f0;border-top:2px solid var(--red)">
        <td style="font-weight:700;font-size:14px;color:var(--red)" rowspan="${retests.length+1}">${resolvedOrig.sample}</td>
        <td><span class="badge badge-gray">${resolvedOrig.planta}</span></td>
        <td style="font-size:12px;color:var(--gray-500)">${resolvedOrig.originalDate}</td>
        <td colspan="3" style="font-size:12px;color:var(--gray-500)">${esc(resolvedOrig.area)}</td>
        <td style="text-align:center"><span class="badge badge-red">Failed</span></td>
        <td colspan="2" style="font-size:11px;color:var(--gray-400);font-style:italic;text-align:center">${resolvedOrig.notes||''}</td>
      </tr>`);
      retests.forEach((rt, i) => {
        const isDone    = rt.resultado === 'Negative';
        const isPending = rt.resultado === 'Pending';
        const isPos     = rt.resultado === 'Positive';
        const statusColor = isDone?'var(--green)':isPos?'var(--red)':'var(--yellow)';
        const statusText  = isDone?'Negative':isPos?'Positive':'Pending';
        rows.push(`<tr style="background:${isDone?'#f0fdf4':isPending?'#fffbeb':'#fff5f5'}">
          <td><span class="badge badge-gray">${resolvedOrig.planta}</span></td>
          <td style="font-size:12px">${rt.fecha}</td>
          <td colspan="2" style="font-size:12px;color:var(--gray-700);font-weight:600">${rt.retestNum}</td>
          <td></td>
          <td style="text-align:center;font-size:12px;font-weight:600;color:${statusColor}">${statusText}</td>
          <td style="font-size:11px;color:var(--gray-500)">${rt.labNotes||'—'}</td>
          <td style="text-align:center">
            <div style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap">
              <button class="btn btn-primary btn-sm" onclick="exportRetestPDF(${rt.id})" style="font-size:10px;padding:4px 7px"><svg class="ln ico-inline" width="12" height="12" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>PDF</button>
              ${!isDone?`<button class="btn btn-sm" onclick="openFailModal(${rt.id})" style="background:var(--navy);color:white;font-size:10px;padding:4px 7px"><svg class="ln ico-inline" width="12" height="12" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>Lab</button>`:''}
              <button class="btn btn-outline btn-sm" onclick="submitRetestLabForm(${rt.id},false)" style="font-size:10px;padding:4px 7px" title="Fill lab form"><svg class="ln ico-inline" width="12" height="12" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/></svg>Form</button>
              ${canSendToLab(CU&&CU.email)?`<button class="btn btn-success btn-sm" onclick="submitRetestLabForm(${rt.id},true)" style="font-size:10px;padding:4px 7px" title="Send to lab"><svg class="ln ico-inline" width="12" height="12" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Send</button>`:''}
            </div>
          </td>
        </tr>`);
      });
    });
    tbody.innerHTML = rows.join('');
  }

  // Resolved / closed rounds: show any closed round that is no longer active,
  // labeling the outcome — all-negative (success) or escalated (a retest
  // failed, so a fresh round was generated from it).
  const roundState = r => {
    if (!r.closedOnGenerate) return { show:true, escalated:false };
    const my = hist.filter(h => h.originalId === r.originalId && h.retestNum);
    const hasPending   = my.some(h => h.resultado === 'Pending');
    const hasEscalated = my.some(h => h.resultado === 'Positive');
    return { show: !(hasPending && !hasEscalated), escalated: hasEscalated };
  };
  const resolvedToShow = resolved.filter(r => roundState(r).show);
  const rTbody = document.getElementById('retestResolved');
  rTbody.innerHTML = resolvedToShow.length === 0
    ? '<tr><td colspan="8" style="text-align:center;color:var(--gray-500);padding:32px">No resolved retests</td></tr>'
    : [...resolvedToShow].reverse().map(r => {
        const esc_ = roundState(r).escalated;
        const outcome = esc_
          ? '<span style="color:var(--red);font-weight:600"><svg class="ln ico-inline" width="13" height="13" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>Failed — new round generated</span>'
          : '<span style="color:var(--green);font-weight:600"><svg class="ln ico-inline" width="13" height="13" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>'+(r.closedOnGenerate?'Retests all negative':'Negative / OK')+'</span>';
        return `<tr style="background:${esc_?'#fff5f5':'#f0fdf4'}">
        <td style="font-weight:700">${r.sample}</td>
        <td><span class="badge badge-gray">${r.planta}</span></td>
        <td>${r.area}</td>
        <td style="font-size:12px">${r.originalDate}</td>
        <td style="font-size:12px">${r.resolvedDate}</td>
        <td style="text-align:center"><span class="badge ${esc_?'badge-red':'badge-green'}">${r.retestNum||'—'}</span></td>
        <td>${outcome}</td>
        <td style="font-size:12px;color:var(--gray-500)">${r.notes||'—'}</td>
      </tr>`;
      }).join('');
}

function openRetestOkModal(id) {
  const hist=GH(), h=hist.find(r=>r.id===id);
  if(!h) return;
  OKID=id;
  const retests=hist.filter(r=>r.sample==h.sample&&r.planta===h.planta&&r.retestNum);
  const last=retests[retests.length-1];
  document.getElementById('retestOkInfo').innerHTML='<strong>Sample #'+h.sample+'</strong> — '+esc(h.planta)+'<br><strong>Area:</strong> '+esc(h.area)+'<br><strong>Positive date:</strong> '+h.fecha+'<br><strong>Last retest:</strong> '+(last?last.retestNum+' ('+last.fecha+')':'—');
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
  const resolvedEntry={originalId:h.id,sample:h.sample,planta:h.planta,area:h.area,location:h.location,originalDate:h.fecha,resolvedDate:new Date().toISOString().split('T')[0],retestNum:last?last.retestNum:'—',notes};
  resolved.push(resolvedEntry);
  SRV(resolved);
  syncSafe(() => syncPushResolved([resolvedEntry]), 'push resolved ok');
  closeRetestOkModal();
  loadRetests(); refreshDashboard();
  toast('Sample #'+h.sample+' resolved','success');
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
    '<br><strong>Area:</strong> '+esc(h.area)+
    '<br><strong>Positive result:</strong> '+h.fecha;

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
    warning = 'The selected date is a weekend. It will move automatically to Monday.';
  }
  const d1 = getNextWeekday(start);
  const d2 = addWorkday(d1, 1);
  const d3 = addWorkday(d2, 1);
  const fmt = d => d.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});
  document.getElementById('retestPreview').innerHTML =
    (warning ? '<p style="color:var(--yellow);font-weight:600;margin-bottom:6px">'+warning+'</p>' : '') +
    '<svg class="ln ico-inline" width="13" height="13" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><strong>Retest #1:</strong> '+fmt(d1)+'<br>' +
    '<svg class="ln ico-inline" width="13" height="13" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><strong>Retest #2:</strong> '+fmt(d2)+'<br>' +
    '<svg class="ln ico-inline" width="13" height="13" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><strong>Retest #3:</strong> '+fmt(d3);
}

function closeRetestDateModal() {
  document.getElementById('retestDateModal').classList.remove('open');
  RDID = null;
  const dateInput = document.getElementById('retestStartDate');
  dateInput.removeEventListener('input', updateRetestPreview);
}

function confirmRetestDates() {
  const val = document.getElementById('retestStartDate').value;
  if(!val) { toast('Select a start date', 'error'); return; }

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

  // Retest ONLY the pathogen(s) that actually failed — not every pathogen
  // that was originally tested. Falls back to the original flags if no
  // specific failure was recorded (legacy data).
  const failed = Array.isArray(orig.failedPathogens) ? orig.failedPathogens : [];
  const onlyFailed = failed.length ? {
    ecoli:      failed.includes('ecoli')      ? 1 : 0,
    listeria:   failed.includes('listeria')   ? 1 : 0,
    salmonella: failed.includes('salmonella') ? 1 : 0,
    saureus:    failed.includes('saureus')    ? 1 : 0
  } : {};

  let nextId = Math.max(...hist.map(h => h.id)) + 1;
  const newRetests = dates.map((d, i) => ({
      ...orig,
      ...onlyFailed,
      id: nextId++,
      fecha: d.toISOString().split('T')[0],
      resultado: 'Pending',
      retestNum: 'Retest #'+(i+1),
      location: orig.location,
      labNotes: '',
      isRetest: true,
      originalId: orig.id,
      scheduled: true,
      // fresh pending tests — clear any failure data inherited from the parent
      failedPathogens: undefined,
      failedPathogensLabel: undefined,
      resultDate: undefined
  }));
  hist.push(...newRetests);
  SH(hist);
  syncSafe(() => syncPushRecords(newRetests), 'push retests');

  // Close the original IMMEDIATELY — retests are independent cases
  const resolved = GRV();
  if (!resolved.some(r => r.originalId === orig.id)) {
    const resolvedEntry = {
      originalId:       orig.id,
      sample:           orig.sample,
      planta:           orig.planta,
      area:             orig.area,
      location:         orig.location,
      originalDate:    orig.fecha,
      resolvedDate:     new Date().toISOString().split('T')[0],
      retestNum:        '—',
      notes:            'Positive: '+(orig.failedPathogensLabel||'—')+'. 3 retests scheduled.',
      closedOnGenerate: true
    };
    resolved.push(resolvedEntry);
    SRV(resolved);
    syncSafe(() => syncPushResolved([resolvedEntry]), 'push resolved');
  }

  closeRetestDateModal();
  loadRetests(); searchHistory(); refreshDashboard();
  toast('✅ 3 retests scheduled for Sample #'+orig.sample+' — Original case closed.', 'success');
}