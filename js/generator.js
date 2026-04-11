// ═══════════════════════════════════════════════
// GENERATOR
// ═══════════════════════════════════════════════
function generateTests() {
  const planta   = document.getElementById('genPlanta').value;
  if(!planta) { toast('Selecciona una planta','error'); return; }
  const pool     = getActiveMaster(planta);
  const hist     = GH();
  const plantH   = hist.filter(h => h.planta===planta && !h.retestNum);

  // ── Get ISO week string (YYYY-Www) for a date ──────────────────────
  const isoWeek = dateStr => {
    const d = new Date(dateStr+'T12:00:00');
    const thu = new Date(d); thu.setDate(d.getDate() - ((d.getDay()+6)%7) + 3);
    const wk  = Math.ceil(((thu - new Date(thu.getFullYear(),0,1))/864e5 + 1)/7);
    return thu.getFullYear()+'-W'+String(wk).padStart(2,'0');
  };

  // ── Build map: sample → set of weeks it was tested ─────────────────
  const sampleWeeks = {};
  plantH.forEach(h => {
    const wk = isoWeek(h.fecha);
    if(!sampleWeeks[h.sample]) sampleWeeks[h.sample] = new Set();
    sampleWeeks[h.sample].add(wk);
  });

  // ── Current week ───────────────────────────────────────────────────
  const selectedDate = document.getElementById('genDate').value ||
                       new Date().toISOString().split('T')[0];
  const currentWeek  = isoWeek(selectedDate);

  // Weeks to exclude: last 4 calendar weeks before current week
  const allWeeks = [...new Set(plantH.map(h => isoWeek(h.fecha)))]
                   .filter(w => w < currentWeek).sort().reverse();
  const excludeWeeks = new Set(allWeeks.slice(0,4));

  // Samples used in any of those 4 weeks → excluded from pool
  const recentExcluded = new Set();
  Object.entries(sampleWeeks).forEach(([sample, weeks]) => {
    if([...weeks].some(w => excludeWeeks.has(w)))
      recentExcluded.add(parseInt(sample));
  });

  const totalExcluded = recentExcluded.size;
  const totalPool     = pool.length;
  const available     = pool.filter(p => !recentExcluded.has(p.sample));
  const availPct      = totalPool>0 ? Math.round(available.length/totalPool*100) : 100;

  // ── Zone pools (fresh first, fallback to last-week-only exclusion) ──
  const freshByZone = [2,3,4].map(z =>
    pool.filter(p => p.zone===z && !recentExcluded.has(p.sample))
  );

  // Fallback for a zone: exclude only the most recent week
  const lastWeekSamples = new Set();
  if(allWeeks.length>0) {
    const lastWk = allWeeks[0];
    plantH.filter(h => isoWeek(h.fecha)===lastWk).forEach(h => lastWeekSamples.add(h.sample));
  }
  const fallbackByZone = [2,3,4].map(z =>
    pool.filter(p => p.zone===z && !lastWeekSamples.has(p.sample))
  );
  const fullByZone = [2,3,4].map(z => pool.filter(p => p.zone===z));

  // Use freshest available pool per zone
  const zf = freshByZone.map((arr,i) =>
    arr.length>=2 ? arr : fallbackByZone[i].length>=1 ? fallbackByZone[i] : fullByZone[i]
  );

  // ── Pick samples ───────────────────────────────────────────────────
  const sel  = []; const used = new Set();
  const pick = (arr, n) => {
    const s = [...arr].sort(() => Math.random()-.5);
    for(const item of s) {
      if(n<=0) break;
      if(!used.has(item.sample)) { sel.push({...item}); used.add(item.sample); n--; }
    }
  };

  const n2 = Math.min(3, zf[0].length);
  const n4 = Math.min(3, zf[2].length);
  const n3 = Math.min(10-n2-n4, zf[1].length);
  pick(zf[0], n2); pick(zf[2], n4); pick(zf[1], n3);

  // Fill remaining from fresh pool (any zone)
  if(sel.length < 10) pick(available.filter(p=>!used.has(p.sample)), 10-sel.length);
  // Last resort: any unused sample
  if(sel.length < 10) pick(pool.filter(p=>!used.has(p.sample)), 10-sel.length);

  // ── Assign pathogens ───────────────────────────────────────────────
  const po = [...Array(Math.max(10,sel.length)).keys()].sort(()=>Math.random()-.5);
  TESTS = sel.map((s,i) => {
    const pi = po[i] % PATS.length;
    return {...s, ecoli:PATS[pi][0], listeria:PATS[pi][1],
            salmonella:PATS[pi][2], saureus:PATS[pi][3], modified:false};
  });

  OVRS=[]; RTITEMS=[];
  renderTests();
  document.getElementById('genTableCard').style.display='block';
  document.getElementById('quickAddBar').style.display='flex';
  document.getElementById('overrideCard').style.display='none';
  document.getElementById('retestSection').style.display='none';
  document.getElementById('btnPDF').disabled=false;
  document.getElementById('btnSave').disabled=false;

  const lbl = {'1945':'1945','1935':'1935','1931E':'1931 East','1931W':'1931 West'}[planta]||planta;
  document.getElementById('genTableTitle').textContent = 'Tests Generados — Planta '+lbl+
    ' | Semana '+currentWeek;

  // Info toast
  const excluded4wks = excludeWeeks.size;
  toast(
    '✅ '+sel.length+' tests generados · '+
    totalExcluded+' samples excluidos ('+excluded4wks+' sem.) · '+
    availPct+'% del pool disponible',
    'success'
  );
}

function renderTests() {
  document.getElementById('genTableBody').innerHTML = TESTS.map((t,i) => `
    <tr class="${t.modified?'modified':''}">
      <td style="color:var(--gray-400);font-size:11px;font-weight:600;text-align:center">${i+1}</td>
      <td><input type="text" value="${t.sample}" style="width:65px;font-weight:700" onchange="chg(${i},'sample',this.value,this)">
          ${t.modified?'<span class="ob">✎</span>':''}</td>
      <td><select onchange="chg(${i},'zone',this.value,this)" style="width:65px">
          <option ${t.zone==2?'selected':''}>2</option>
          <option ${t.zone==3?'selected':''}>3</option>
          <option ${t.zone==4?'selected':''}>4</option></select></td>
      <td><input type="text" value="${t.area}" style="width:100%" onchange="chg(${i},'area',this.value,this)"></td>
      <td><input type="text" value="${t.line}" style="width:55px" onchange="chg(${i},'line',this.value,this)"></td>
      <td><input type="text" value="${t.location}" style="width:100%" onchange="chg(${i},'location',this.value,this)"></td>
      <td class="pat-cell" onclick="togPat(${i},0)">${t.ecoli?'<span class="px">X</span>':'<span style="color:var(--gray-200)">–</span>'}</td>
      <td class="pat-cell" onclick="togPat(${i},1)">${t.listeria?'<span class="px">X</span>':'<span style="color:var(--gray-200)">–</span>'}</td>
      <td class="pat-cell" onclick="togPat(${i},2)">${t.salmonella?'<span class="px">X</span>':'<span style="color:var(--gray-200)">–</span>'}</td>
      <td class="pat-cell" onclick="togPat(${i},3)">${t.saureus?'<span class="px">X</span>':'<span style="color:var(--gray-200)">–</span>'}</td>
      <td style="text-align:center"><button class="btn btn-outline btn-sm" onclick="rmTest(${i})" style="padding:4px 8px;color:var(--red)">✕</button></td>
    </tr>`).join('');
}

function chg(idx, field, val, el) {
  const t = TESTS[idx];
  if(String(t[field]) === String(val)) return;
  PENDO = {idx, field, oldVal:t[field], newVal:val, el};
  document.getElementById('ovField').textContent  = field;
  document.getElementById('ovSample').textContent = t.sample;
  document.getElementById('ovReason').value = '';
  document.getElementById('overrideModal').classList.add('open');
}

function cancelOverride() {
  if(PENDO && PENDO.el) PENDO.el.value = PENDO.oldVal;
  PENDO = null;
  document.getElementById('overrideModal').classList.remove('open');
}

function confirmOverride() {
  const reason = document.getElementById('ovReason').value.trim();
  if(!reason) { toast('La razón es requerida','error'); return; }
  const {idx,field,oldVal,newVal} = PENDO;
  if(field==='zone') TESTS[idx][field] = parseInt(newVal);
  else if(['ecoli','listeria','salmonella','saureus'].includes(field)) TESTS[idx][field] = newVal==='X'?1:0;
  else TESTS[idx][field] = newVal;
  TESTS[idx].modified = true;
  OVRS.push({sample:TESTS[idx].sample,field,oldVal,newVal,reason,by:CU.displayName,time:new Date().toLocaleTimeString()});
  renderTests();
  document.getElementById('overrideLog').innerHTML = OVRS.map(o => `<tr><td style="font-weight:600">${o.sample}</td><td>${o.field}</td><td style="color:var(--red)">${o.oldVal}</td><td style="color:var(--green)">${o.newVal}</td><td>${o.reason}</td><td>${o.by}</td><td style="color:var(--gray-500)">${o.time}</td></tr>`).join('');
  document.getElementById('overrideCard').style.display = 'block';
  document.getElementById('overrideModal').classList.remove('open');
  PENDO = null;
  toast('Cambio registrado','success');
}

function togPat(idx,pi) {
  const fields = ['ecoli','listeria','salmonella','saureus'];
  const f = fields[pi];
  const ov = TESTS[idx][f] ? 'X' : '–';
  const nv = TESTS[idx][f] ? '–' : 'X';
  PENDO = {idx, field:f, oldVal:ov, newVal:nv, el:null};
  document.getElementById('ovField').textContent  = f + ' (patógeno)';
  document.getElementById('ovSample').textContent = TESTS[idx].sample;
  document.getElementById('ovReason').value = '';
  document.getElementById('overrideModal').classList.add('open');
}

function rmTest(idx) {
  if(!confirm('¿Eliminar este punto?')) return;
  TESTS.splice(idx,1); renderTests();
}

// QUICK ADD
function previewSample(val) {
  const planta = document.getElementById('genPlanta').value;
  const num = parseInt(val);
  const prev = document.getElementById('quickAddPreview');
  if(!num || !planta) { prev.textContent=''; return; }
  const found = getActiveMaster(planta).find(p => p.sample===num);
  if(found) {
    const inUse = TESTS.some(t => t.sample===num);
    prev.style.color = inUse ? 'var(--yellow)' : 'var(--green)';
    prev.textContent = inUse ? '⚠️ Ya en formulario — '+esc(found.area) : '✅ '+esc(found.area)+' · Zona '+found.zone+' · '+esc(found.location);
  } else if(val.length>=2) {
    prev.style.color='var(--red)';
    prev.textContent='❌ No encontrado en esta planta';
  } else prev.textContent='';
}

function quickAddSample() {
  const planta = document.getElementById('genPlanta').value;
  if(!planta) { toast('Selecciona planta primero','error'); return; }
  const num = parseInt(document.getElementById('quickSampleInput').value.trim());
  if(!num) { toast('Escribe un número válido','error'); return; }
  const found = getActiveMaster(planta).find(p => p.sample===num);
  if(!found) { toast('Sample #'+num+' no existe en '+planta,'error'); return; }
  if(TESTS.some(t => t.sample===num)) { toast('Sample #'+num+' ya está en el formulario','error'); return; }
  QAC = found; QPATS = {ecoli:0,listeria:1,salmonella:0,saureus:0};
  updateQP();
  document.getElementById('quickPatInfo').innerHTML = '<strong>Sample #'+found.sample+'</strong> — Zona '+found.zone+' · Line '+found.line+'<br><strong>Área:</strong> '+esc(found.area)+'<br><strong>Ubicación:</strong> '+esc(found.location);
  document.getElementById('quickPatModal').classList.add('open');
}

function closeQPModal() { document.getElementById('quickPatModal').classList.remove('open'); QAC=null; }

function toggleQP(p) {
  if(p==='listeria') { toast('Listeria es obligatoria','info'); return; }
  QPATS[p] = QPATS[p] ? 0 : 1; updateQP();
}

function updateQP() {
  const map = {ecoli:'E. Coli',listeria:'Listeria ✓',salmonella:'Salmonella',saureus:'S. Aureus'};
  Object.keys(QPATS).forEach(p => {
    const el = document.getElementById('qp-'+p);
    if(el) { el.className='pat-toggle '+(QPATS[p]?'on':'off'); el.textContent=map[p]; }
  });
}

function confirmQuickAdd() {
  if(!QAC) return;
  TESTS.push({...QAC,...QPATS,modified:false});
  renderTests(); closeQPModal();
  document.getElementById('quickSampleInput').value='';
  document.getElementById('quickAddPreview').textContent='';
  toast('✅ Sample #'+QAC.sample+' agregado','success');
}

// SAVE WEEK
function saveWeek() {
  if(!TESTS.length) { toast('No hay tests para guardar','error'); return; }
  if(!confirm('¿Guardar esta semana en el historial?')) return;
  const planta = document.getElementById('genPlanta').value;
  const fecha  = document.getElementById('genDate').value;
  const by     = document.getElementById('genCollectedBy').value;
  const hist   = GH(); const weeks = GW();
  let nextId   = hist.length>0 ? Math.max(...hist.map(h=>h.id))+1 : 1;
  const recs   = TESTS.map(t => ({id:nextId++,fecha,planta,by,sample:t.sample,zone:t.zone,area:t.area,line:t.line,location:t.location,ecoli:t.ecoli,listeria:t.listeria,salmonella:t.salmonella,saureus:t.saureus,resultado:'Pendiente',retestNum:'',labNotes:''}));
  SH([...hist,...recs]);
  SW([...weeks,{planta,fecha,by,count:TESTS.length,savedAt:new Date().toISOString()}]);
  toast('✅ '+recs.length+' registros guardados','success');
  refreshDashboard(); searchHistory();
}