// ═══════════════════════════════════════════════
// GENERATOR
// ═══════════════════════════════════════════════
async function generateTests() {
  const planta   = document.getElementById('genPlant').value;
  if(!planta) { toast('Select a plant','error'); return; }

  // Pull the latest Records from SharePoint FIRST, so the 4-week
  // anti-repetition sees every user's data — not just this device's cache.
  if(SYNC_ENABLED) {
    try {
      toast('Syncing with SharePoint…','info');
      await syncPullRecords();
      await syncPullMasterPoints();
    } catch(e) {
      console.warn('[sync] pull before generate failed:', e);
      toast('Could not reach SharePoint — using local data','error');
    }
  }

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

  // ── Building-specific plans ────────────────────────────────────────
  // 1935 / 1931E / 1931W: 7 samples → 12 tests. Zones 2 & 3 are "double"
  // (primary + one secondary pathogen); zone 4 is "single" (primary only).
  const BUILDING_PLANS = {
    '1935':  { primary:'listeria', zones:{2:3, 3:2, 4:2}, secondaries:{ecoli:3, salmonella:1, saureus:1} },
    '1931E': { primary:'ecoli',    zones:{2:3, 3:2, 4:2}, secondaries:{listeria:3, salmonella:1, saureus:1} },
    '1931W': { primary:'ecoli',    zones:{2:3, 3:2, 4:2}, secondaries:{listeria:3, salmonella:1, saureus:1} },
  };
  const plan = BUILDING_PLANS[planta];

  // ── Pick samples ───────────────────────────────────────────────────
  const sel  = []; const used = new Set();
  const pick = (arr, n) => {
    const s = [...arr].sort(() => Math.random()-.5);
    for(const item of s) {
      if(n<=0) break;
      if(!used.has(item.sample)) { sel.push({...item}); used.add(item.sample); n--; }
    }
  };
  // Pick n samples from one zone, preferring fresh → fallback → full.
  const pickZone = (zi, n) => {
    const before = sel.length;
    pick(freshByZone[zi], n);
    if(sel.length - before < n) pick(fallbackByZone[zi], n - (sel.length - before));
    if(sel.length - before < n) pick(fullByZone[zi], n - (sel.length - before));
  };

  if(plan) {
    // Fixed per-zone counts (e.g. 3 zone 2 · 2 zone 3 · 2 zone 4)
    pickZone(0, plan.zones[2]);
    pickZone(1, plan.zones[3]);
    pickZone(2, plan.zones[4]);
  } else {
    // Default (1945): 10 samples — zones 2 & 4 first, fill with zone 3
    const n2 = Math.min(3, zf[0].length);
    const n4 = Math.min(3, zf[2].length);
    const n3 = Math.min(10-n2-n4, zf[1].length);
    pick(zf[0], n2); pick(zf[2], n4); pick(zf[1], n3);
    if(sel.length < 10) pick(available.filter(p=>!used.has(p.sample)), 10-sel.length);
    if(sel.length < 10) pick(pool.filter(p=>!used.has(p.sample)), 10-sel.length);
  }

  // ── Assign pathogens ───────────────────────────────────────────────
  if(plan) {
    // Every sample tests the primary. Zone 2 & 3 samples ("doubles") also
    // test one secondary; distribute the counts (3/1/1) at random across them.
    const secQueue = [];
    Object.entries(plan.secondaries).forEach(([pat, count]) => {
      for(let i=0;i<count;i++) secQueue.push(pat);
    });
    secQueue.sort(() => Math.random()-.5);
    TESTS = sel.map(s => {
      const flags = {ecoli:0, listeria:0, salmonella:0, saureus:0};
      flags[plan.primary] = 1;
      if((s.zone===2 || s.zone===3) && secQueue.length) flags[secQueue.shift()] = 1;
      return {...s, ...flags, modified:false};
    });
  } else {
    const po = [...Array(Math.max(10,sel.length)).keys()].sort(()=>Math.random()-.5);
    TESTS = sel.map((s,i) => {
      const pi = po[i] % PATS.length;
      return {...s, ecoli:PATS[pi][0], listeria:PATS[pi][1],
              salmonella:PATS[pi][2], saureus:PATS[pi][3], modified:false};
    });
  }

  OVRS=[]; RTITEMS=[];
  renderTests();
  document.getElementById('genTableCard').style.display='block';
  document.getElementById('quickAddBar').style.display='flex';
  document.getElementById('overrideCard').style.display='none';
  document.getElementById('retestSection').style.display='none';
  document.getElementById('btnPDF').disabled=false;
  document.getElementById('btnSave').disabled=false;

  const lbl = {'1945':'1945','1935':'1935','1931E':'1931 East','1931W':'1931 West'}[planta]||planta;
  document.getElementById('genTableTitle').textContent = 'Generated Tests — Plant '+lbl+
    ' | Week '+currentWeek;

  // Info toast
  const excluded4wks = excludeWeeks.size;
  const totalPathTests = TESTS.reduce((n,t)=>n + (t.ecoli?1:0)+(t.listeria?1:0)+(t.salmonella?1:0)+(t.saureus?1:0), 0);
  toast(
    sel.length+' samples · '+totalPathTests+' tests · '+
    totalExcluded+' samples excluded ('+excluded4wks+' wks) · '+
    availPct+'% of available pool',
    'success'
  );
}

function renderTests() {
  document.getElementById('genTableBody').innerHTML = TESTS.map((t,i) => `
    <tr class="${t.modified?'modified':''}">
      <td style="color:var(--gray-400);font-size:11px;font-weight:600;text-align:center">${i+1}</td>
      <td><input type="text" value="${t.sample}" style="width:65px;font-weight:700" onchange="chg(${i},'sample',this.value,this)">
          ${t.modified?'<span class="ob"><svg class="ln" width="11" height="11" viewBox="0 0 24 24" style="vertical-align:-1px"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span>':''}</td>
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
      <td style="text-align:center"><button class="btn btn-outline btn-sm" onclick="rmTest(${i})" style="padding:4px 8px;color:var(--red)"><svg class="ln" width="13" height="13" viewBox="0 0 24 24" style="vertical-align:-2px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td>
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
  if(!reason) { toast('A reason is required','error'); return; }
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
  toast('Change logged','success');
}

function togPat(idx,pi) {
  const fields = ['ecoli','listeria','salmonella','saureus'];
  const f = fields[pi];
  const ov = TESTS[idx][f] ? 'X' : '–';
  const nv = TESTS[idx][f] ? '–' : 'X';
  PENDO = {idx, field:f, oldVal:ov, newVal:nv, el:null};
  document.getElementById('ovField').textContent  = f + ' (pathogen)';
  document.getElementById('ovSample').textContent = TESTS[idx].sample;
  document.getElementById('ovReason').value = '';
  document.getElementById('overrideModal').classList.add('open');
}

function rmTest(idx) {
  if(!confirm('Delete this point?')) return;
  TESTS.splice(idx,1); renderTests();
}

// QUICK ADD
function previewSample(val) {
  const planta = document.getElementById('genPlant').value;
  const num = parseInt(val);
  const prev = document.getElementById('quickAddPreview');
  if(!num || !planta) { prev.textContent=''; return; }
  const found = getActiveMaster(planta).find(p => p.sample===num);
  if(found) {
    const inUse = TESTS.some(t => t.sample===num);
    prev.style.color = inUse ? 'var(--yellow)' : 'var(--green)';
    prev.textContent = inUse ? 'Already in form — '+esc(found.area) : esc(found.area)+' · Zone '+found.zone+' · '+esc(found.location);
  } else if(val.length>=2) {
    prev.style.color='var(--red)';
    prev.textContent='Not found in this plant';
  } else prev.textContent='';
}

function quickAddSample() {
  const planta = document.getElementById('genPlant').value;
  if(!planta) { toast('Select a plant first','error'); return; }
  const num = parseInt(document.getElementById('quickSampleInput').value.trim());
  if(!num) { toast('Type a valid number','error'); return; }
  const found = getActiveMaster(planta).find(p => p.sample===num);
  if(!found) { toast('Sample #'+num+' does not exist in '+planta,'error'); return; }
  if(TESTS.some(t => t.sample===num)) { toast('Sample #'+num+' is already in the form','error'); return; }
  QAC = found; QPATS = {ecoli:0,listeria:1,salmonella:0,saureus:0};
  updateQP();
  document.getElementById('quickPatInfo').innerHTML = '<strong>Sample #'+found.sample+'</strong> — Zone '+found.zone+' · Line '+found.line+'<br><strong>Area:</strong> '+esc(found.area)+'<br><strong>Location:</strong> '+esc(found.location);
  document.getElementById('quickPatModal').classList.add('open');
}

function closeQPModal() { document.getElementById('quickPatModal').classList.remove('open'); QAC=null; }

function toggleQP(p) {
  if(p==='listeria') { toast('Listeria is required','info'); return; }
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
  if(!TESTS.length) { toast('No tests to save','error'); return; }
  if(!confirm('Save this week to the history?')) return;
  const planta = document.getElementById('genPlant').value;
  const fecha  = document.getElementById('genDate').value;
  const by     = document.getElementById('genCollectedBy').value;
  const hist   = GH(); const weeks = GW();
  let nextId   = hist.length>0 ? Math.max(...hist.map(h=>h.id))+1 : 1;
  const recs   = TESTS.map(t => ({id:nextId++,fecha,planta,by,sample:t.sample,zone:t.zone,area:t.area,line:t.line,location:t.location,ecoli:t.ecoli,listeria:t.listeria,salmonella:t.salmonella,saureus:t.saureus,resultado:'Pending',retestNum:'',labNotes:''}));
  SH([...hist,...recs]);
  SW([...weeks,{planta,fecha,by,count:TESTS.length,savedAt:new Date().toISOString()}]);
  // Mirror the new week to SharePoint (non-blocking; local save already done).
  syncSafe(() => syncPushRecords(recs), 'push new week');
  toast('✅ '+recs.length+' records saved','success');
  refreshDashboard(); searchHistory();
}