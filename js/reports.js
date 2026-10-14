// ═══════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════
let chartInstances = {};

function destroyCharts() {
  Object.values(chartInstances).forEach(c => { try { c.destroy(); } catch(e){} });
  chartInstances = {};
}

// The period the Reports view (and its PDF) covers: explicit From/To dates win,
// otherwise the period selector (Today / This month / Last month / last N days).
function repRange() {
  const from = (document.getElementById('repFrom') || {}).value || '';
  const to = (document.getElementById('repTo') || {}).value || '';
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (from || to) return { from, to, label: from && to && from === to ? fmt(from) : (from ? fmt(from) : 'Start') + ' – ' + (to ? fmt(to) : 'Today') };
  const v = (document.getElementById('reportPeriod') || {}).value || 'all';
  const now = new Date(), today = todayLocal();
  if (v === 'today') return { from: today, to: today, label: 'Today · ' + fmt(today) };
  if (v === 'month') {
    const f = todayLocal(new Date(now.getFullYear(), now.getMonth(), 1));
    return { from: f, to: today, label: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
  }
  if (v === 'prevmonth') {
    const f = new Date(now.getFullYear(), now.getMonth() - 1, 1), l = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: todayLocal(f), to: todayLocal(l), label: f.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
  }
  const days = parseInt(v, 10);
  if (!isNaN(days)) { const c = new Date(); c.setDate(c.getDate() - days); return { from: todayLocal(c), to: today, label: 'Last ' + days + ' days' }; }
  return { from: '', to: '', label: 'All history' };
}

function getFilteredHistory() {
  const r = repRange();
  return GH().filter(h => (!r.from || h.fecha >= r.from) && (!r.to || h.fecha <= r.to));
}

function clearRepDates() {
  const f = document.getElementById('repFrom'), t = document.getElementById('repTo');
  if(f) f.value = ''; if(t) t.value = '';
  buildReports();
}

// Pathogens that ACTUALLY came back positive for a record — uses the recorded
// failedPathogens (what the lab confirmed), NOT every pathogen that was tested
// on a positive sample. Falls back to the tested flags only for legacy records
// that predate failedPathogens. This is what prevents phantom pathogen positives
// (e.g. a Salmonella "+" just because it was swabbed on an E.Coli-positive point).
function positivePathogens(h) {
  if (!h || h.resultado !== 'Positive') return [];
  const f = Array.isArray(h.failedPathogens) ? h.failedPathogens.filter(Boolean) : [];
  if (f.length) return f;
  // No failedPathogens, but the lab results are on the record (e.g. imported lab
  // reports on older records): the tests that came back Positive.
  const lab = (typeof getLabResults === 'function') ? getLabResults(h) : null;
  const fromLab = lab ? ['ecoli','listeria','salmonella','saureus'].filter(k => lab[k] && lab[k].r === 'Positive') : [];
  if (fromLab.length) return fromLab;
  // No failedPathogens recorded (legacy record): only infer when a SINGLE
  // pathogen was tested — then it must be the one that failed. If several were
  // tested we cannot know which, so attribute to none rather than invent
  // positives for every pathogen that happened to be swabbed.
  const tested = ['ecoli','listeria','salmonella','saureus'].filter(k => h[k]);
  return tested.length === 1 ? tested : [];
}

function buildReports() {
  // New "Environmental insights" view (real data). When its markup is present
  // we render it and skip the legacy Chart.js canvases (which were replaced).
  if (document.getElementById('enviro-reports')) {
    try { renderReportsView(); } catch (e) { console.warn('[reports] renderReportsView', e); }
    return;
  }
  destroyCharts();
  if(window.Chart) Chart.defaults.animation = false; // render instantly → clean PDF capture
  const hist = getFilteredHistory();
  const plants = ['1945','1935','1931E','1931W'];
  const COLORS = { '1945':'#C0392B','1935':'#1A5276','1931E':'#0E6655','1931W':'#6C3483' };
  const resColors = { 'Negative':'#059669','Positive':'#DC2626','Pending':'#D97706' };
  const patColors = ['#C0392B','#1A5276','#0E6655','#6C3483'];

  // ── KPI Cards ───────────────────────────────────────────────────────────
  const total    = hist.length;
  const pos      = hist.filter(h => h.resultado==='Positive').length;
  const neg      = hist.filter(h => h.resultado==='Negative').length;
  const pend     = hist.filter(h => h.resultado==='Pending').length;
  const retests  = hist.filter(h => h.retestNum).length;
  const posRate  = total > 0 ? (pos/total*100).toFixed(1) : '0.0';
  const negRate  = total > 0 ? (neg/total*100).toFixed(1) : '0.0';
  const resolved = GRV().length;

  const kpis = [
    { label:'Total Tests', value:total, sub:'records', sc:'sc-blue',
      ico:'<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>' },
    { label:'Positive Rate', value:posRate+'%', sub:pos+' positives', sc:'sc-red',
      ico:'<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' },
    { label:'Negative Rate', value:negRate+'%', sub:neg+' negatives', sc:'sc-green',
      ico:'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' },
    { label:'Retests Generated', value:retests, sub:'of '+pos+' positives', sc:'sc-amber',
      ico:'<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>' },
    { label:'Resolved Cases', value:resolved, sub:'retests OK', sc:'sc-green',
      ico:'<path d="M20 6 9 17l-5-5"/>' },
  ];

  document.getElementById('kpiCards').innerHTML = kpis.map(k => `
    <div class="stat-card ${k.sc}">
      <svg class="ln stat-ico" width="24" height="24" viewBox="0 0 24 24">${k.ico}</svg>
      <div class="stat-value">${k.value}</div>
      <div class="stat-label">${k.label}</div>
      <div class="stat-sub">${k.sub}</div>
    </div>`).join('');

  // ── Chart 1: Tests by plant (bar) ───────────────────────────────────────
  const plantCounts = plants.map(p => hist.filter(h => h.planta===p).length);
  const plantPos    = plants.map(p => hist.filter(h => h.planta===p && h.resultado==='Positive').length);
  chartInstances.plant = new Chart(document.getElementById('chartPlant'), {
    type:'bar',
    data:{ labels:plants,
      datasets:[
        { label:'Total', data:plantCounts, backgroundColor:plants.map(p=>COLORS[p]+'99'), borderColor:plants.map(p=>COLORS[p]), borderWidth:1.5 },
        { label:'Positives', data:plantPos, backgroundColor:'#DC262699', borderColor:'#DC2626', borderWidth:1.5 }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'top', labels:{ boxWidth:10, font:{ size:11 } } } },
      scales:{ y:{ beginAtZero:true, ticks:{ font:{ size:10 } } }, x:{ ticks:{ font:{ size:11 } } } }
    }
  });

  // ── Chart 2: Result distribution (doughnut) ──────────────────────────────
  const resDist = ['Negative','Positive','Pending'].map(r => hist.filter(h=>h.resultado===r).length);
  chartInstances.result = new Chart(document.getElementById('chartResult'), {
    type:'doughnut',
    data:{ labels:['Negative','Positive','Pending'],
      datasets:[{ data:resDist,
        backgroundColor:['#05966999','#DC262699','#D9770699'],
        borderColor:['#059669','#DC2626','#D97706'], borderWidth:1.5
      }]
    },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'65%',
      plugins:{ legend:{ display:true, position:'right', labels:{ boxWidth:10, font:{ size:11 }, generateLabels: chart => {
        const data=chart.data;
        return data.labels.map((label,i) => ({
          text: label+' ('+data.datasets[0].data[i]+')',
          fillStyle:data.datasets[0].backgroundColor[i],
          strokeStyle:data.datasets[0].borderColor[i], lineWidth:1.5, index:i
        }));
      }}}}
    }
  });

  // ── Chart 3: Positive rate by zone (bar) ────────────────────────────────
  const zones = [2,3,4];
  const zoneTotal = zones.map(z => hist.filter(h=>h.zone==z).length);
  const zonePos   = zones.map(z => hist.filter(h=>h.zone==z&&h.resultado==='Positive').length);
  const zoneRate  = zones.map((_,i) => zoneTotal[i]>0 ? +(zonePos[i]/zoneTotal[i]*100).toFixed(1) : 0);
  chartInstances.zone = new Chart(document.getElementById('chartZone'), {
    type:'bar',
    data:{ labels:['Zone 2','Zone 3','Zone 4'],
      datasets:[
        { label:'% Positives', data:zoneRate, backgroundColor:['#1A527699','#C0392B99','#0E665599'],
          borderColor:['#1A5276','#C0392B','#0E6655'], borderWidth:1.5, yAxisID:'y' },
        { label:'Total tests', data:zoneTotal, type:'line',
          borderColor:'#D97706', backgroundColor:'transparent', borderWidth:2,
          pointBackgroundColor:'#D97706', yAxisID:'y1' }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'top', labels:{ boxWidth:10, font:{ size:11 } } } },
      scales:{
        y:{ beginAtZero:true, position:'left', title:{ display:true, text:'% Positives', font:{ size:10 } }, ticks:{ callback:v=>v+'%', font:{ size:10 } } },
        y1:{ beginAtZero:true, position:'right', title:{ display:true, text:'Total', font:{ size:10 } }, grid:{ drawOnChartArea:false }, ticks:{ font:{ size:10 } } },
        x:{ ticks:{ font:{ size:11 } } }
      }
    }
  });

  // ── Chart 4: Pathogen distribution (bar) ────────────────────────────────
  const patNames = ['E.Coli','Listeria','Salmonella','S.Aureus'];
  const patKeys  = ['ecoli','listeria','salmonella','saureus'];
  const patTested = patKeys.map(k => hist.filter(h=>h[k]).length);
  const patPos    = patKeys.map(k => hist.filter(h=>positivePathogens(h).includes(k)).length);
  chartInstances.pat = new Chart(document.getElementById('chartPat'), {
    type:'bar',
    data:{ labels:patNames,
      datasets:[
        { label:'Tested', data:patTested, backgroundColor:patColors.map(c=>c+'55'), borderColor:patColors, borderWidth:1.5 },
        { label:'Positives', data:patPos, backgroundColor:patColors.map(c=>c+'CC'), borderColor:patColors, borderWidth:1.5 }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'top', labels:{ boxWidth:10, font:{ size:11 } } } },
      scales:{ y:{ beginAtZero:true, ticks:{ font:{ size:10 } } }, x:{ ticks:{ font:{ size:10 } } } }
    }
  });

  // ── Chart 5: Weekly trend (line) ─────────────────────────────────────────
  const weekMap = {};
  hist.forEach(h => {
    const d = new Date(h.fecha+'T12:00:00');
    const mon = new Date(d); mon.setDate(d.getDate()-d.getDay()+1);
    const key = mon.toISOString().split('T')[0];
    if(!weekMap[key]) weekMap[key]={total:0,pos:0};
    weekMap[key].total++;
    if(h.resultado==='Positive') weekMap[key].pos++;
  });
  const weekKeys = Object.keys(weekMap).sort().slice(-16);
  const weekLabels = weekKeys.map(k => { const d=new Date(k+'T12:00:00'); return (d.getMonth()+1)+'/'+d.getDate(); });
  chartInstances.trend = new Chart(document.getElementById('chartTrend'), {
    type:'line',
    data:{ labels:weekLabels,
      datasets:[
        { label:'Total tests', data:weekKeys.map(k=>weekMap[k].total),
          borderColor:'#1A5276', backgroundColor:'#1A527622', fill:true, tension:0.3, pointRadius:3, borderWidth:2 },
        { label:'Positives', data:weekKeys.map(k=>weekMap[k].pos),
          borderColor:'#DC2626', backgroundColor:'transparent', tension:0.3, pointRadius:3, borderWidth:2, borderDash:[4,4] }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'top', labels:{ boxWidth:10, font:{ size:11 } } } },
      scales:{
        y:{ beginAtZero:true, ticks:{ font:{ size:10 } } },
        x:{ ticks:{ maxRotation:45, autoSkip:false, font:{ size:9 } } }
      }
    }
  });

  // ── Chart 6: Retests by plant (bar) ──────────────────────────────────────
  const retestByPlant = plants.map(p => hist.filter(h=>h.planta===p&&h.retestNum).length);
  chartInstances.retest = new Chart(document.getElementById('chartRetest'), {
    type:'bar',
    data:{ labels:plants,
      datasets:[{ label:'Retests', data:retestByPlant,
        backgroundColor:plants.map(p=>COLORS[p]+'99'), borderColor:plants.map(p=>COLORS[p]), borderWidth:1.5
      }]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{ y:{ beginAtZero:true, ticks:{ font:{ size:10 } } }, x:{ ticks:{ font:{ size:11 } } } }
    }
  });

  // ── Top 10 Failing Samples ───────────────────────────────────────────────
  const sampleMap = {};
  hist.filter(h=>!h.retestNum).forEach(h => {
    const key = h.planta+'|'+h.sample;
    if(!sampleMap[key]) sampleMap[key]={ sample:h.sample, planta:h.planta, zone:h.zone, area:h.area, location:h.location, total:0, pos:0, pats:{ecoli:0,listeria:0,salmonella:0,saureus:0} };
    sampleMap[key].total++;
    if(h.resultado==='Positive') {
      sampleMap[key].pos++;
      if(h.ecoli)      sampleMap[key].pats.ecoli++;
      if(h.listeria)   sampleMap[key].pats.listeria++;
      if(h.salmonella) sampleMap[key].pats.salmonella++;
      if(h.saureus)    sampleMap[key].pats.saureus++;
    }
  });
  const topFail = Object.values(sampleMap).filter(s=>s.pos>0)
    .sort((a,b)=>b.pos-a.pos||b.pos/b.total-a.pos/a.total).slice(0,10);

  document.getElementById('topFailTable').innerHTML = topFail.length===0
    ? '<tr><td colspan="9" style="text-align:center;color:var(--gray-500);padding:24px">No positives recorded</td></tr>'
    : topFail.map((s,i) => {
      const rate = s.total>0 ? (s.pos/s.total*100).toFixed(0) : 0;
      const topPat = Object.entries(s.pats).sort((a,b)=>b[1]-a[1])[0];
      const patName = {ecoli:'E.Coli',listeria:'Listeria',salmonella:'Salmonella',saureus:'S.Aureus'}[topPat[0]];
      const rateColor = rate>=50?'var(--red)':rate>=25?'var(--yellow)':'var(--green)';
      return `<tr style="${i<3?'background:#fff5f5':''}">
        <td style="font-weight:700;${i<3?'color:var(--red)':''}">${s.sample}</td>
        <td><span class="badge badge-gray">${s.planta}</span></td>
        <td style="text-align:center">${s.zone}</td>
        <td style="max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.area)}</td>
        <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(s.location)}">${esc(s.location)}</td>
        <td style="text-align:center">${s.total}</td>
        <td style="text-align:center;font-weight:700;color:var(--red)">${s.pos}</td>
        <td style="text-align:center;font-weight:700;color:${rateColor}">${rate}%</td>
        <td style="font-size:12px">${patName||'—'}</td>
      </tr>`;
    }).join('');

  // ── Monthly Heatmap ──────────────────────────────────────────────────────
  const monthMap = {};
  hist.forEach(h => {
    const key = h.fecha.substring(0,7); // YYYY-MM
    if(!monthMap[key]) monthMap[key]={};
    if(!monthMap[key][h.planta]) monthMap[key][h.planta]={total:0,pos:0};
    monthMap[key][h.planta].total++;
    if(h.resultado==='Positive') monthMap[key][h.planta].pos++;
  });
  const months = Object.keys(monthMap).sort().slice(-12);
  const maxTotal = Math.max(...months.flatMap(m=>plants.map(p=>monthMap[m]?.[p]?.total||0)), 1);

  let heatHtml = '<table style="width:100%;border-collapse:collapse;font-size:12px">';
  heatHtml += '<tr><th style="padding:6px 10px;text-align:left;color:var(--gray-500)">Building</th>';
  months.forEach(m => {
    const [yr,mo] = m.split('-');
    const label = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(mo)]+' '+yr.slice(2);
    heatHtml += `<th style="padding:6px 8px;text-align:center;color:var(--gray-500);font-weight:500;font-size:11px">${label}</th>`;
  });
  heatHtml += '</tr>';
  plants.forEach(p => {
    heatHtml += `<tr><td style="padding:8px 10px;font-weight:600;white-space:nowrap">${p}</td>`;
    months.forEach(m => {
      const d = monthMap[m]?.[p];
      const n = d?.total||0;
      const po = d?.pos||0;
      const alpha = n>0 ? Math.round(30+70*(n/maxTotal)) : 0;
      const bg = n===0?'var(--gray-100)': po>0?`rgba(192,57,43,${alpha/100})`:`rgba(26,82,118,${alpha/100})`;
      const fg = n===0?'var(--gray-300)': po>0?'white':'white';
      const title = n===0?'No tests':`${n} tests, ${po} positive(s)`;
      heatHtml += `<td style="text-align:center;padding:4px;"><div title="${title}" style="background:${bg};color:${fg};border-radius:4px;padding:6px 4px;font-size:11px;font-weight:600;min-width:36px;cursor:default">${n||''}</div></td>`;
    });
    heatHtml += '</tr>';
  });
  heatHtml += '</table>';
  heatHtml += '<div style="display:flex;align-items:center;gap:16px;margin-top:10px;font-size:11px;color:var(--gray-500)">';
  heatHtml += '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:2px;background:rgba(26,82,118,.7)"></span>Tests OK</span>';
  heatHtml += '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:2px;background:rgba(192,57,43,.7)"></span>With positives</span>';
  heatHtml += '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:2px;background:var(--gray-100)"></span>No activity</span>';
  heatHtml += '</div>';
  document.getElementById('heatmapContainer').innerHTML = heatHtml;

  // ── Pathogen x Plant Table ────────────────────────────────────────────────
  const patKeys2 = ['ecoli','listeria','salmonella','saureus'];
  document.getElementById('pathoPlantTable').innerHTML = plants.map(p => {
    const ph = hist.filter(h=>h.planta===p&&h.resultado==='Positive');
    const total_p = hist.filter(h=>h.planta===p).length;
    const pos_p = ph.length;
    const rate_p = total_p>0?(pos_p/total_p*100).toFixed(1):'0.0';
    const counts = patKeys2.map(k=>ph.filter(h=>positivePathogens(h).includes(k)).length);
    const rateColor = parseFloat(rate_p)>=20?'var(--red)':parseFloat(rate_p)>=10?'var(--yellow)':'var(--green)';
    return `<tr>
      <td><span class="badge badge-gray">${p}</span></td>
      ${counts.map(c=>`<td style="text-align:center;font-weight:${c>0?'700':'400'};color:${c>0?'var(--red)':'var(--gray-300)'}">${c||'–'}</td>`).join('')}
      <td style="text-align:center;font-weight:700;color:var(--red)">${pos_p}</td>
      <td style="text-align:center;font-weight:700;color:${rateColor}">${rate_p}%</td>
    </tr>`;
  }).join('');
}

function exportReportPDF(opts) {
  opts = opts || {};
  if (!opts.returnDoc) buildReports();   // the PDF and the screen show the same period
  const H = getFilteredHistory();
  const D = erReportData(H);
  const range = repRange();
  if (!D.totalTests && !D.totalRetests) { if (!opts.returnDoc) toast('No data for this period', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const W = 215.9, PH = 279.4, M = 14;
  const G = [52, 93, 70], INK = [40, 61, 49], MUT = [102, 115, 98], LINE = [221, 229, 216], SOFT = [244, 247, 241], TRACK = [232, 237, 223];
  const SERIES = [128, 157, 114], POS = [189, 135, 123], PEND = [184, 162, 104], RED = [167, 90, 82];
  const safe = t => String(t == null ? '' : t).replace(/[–—]/g, '-').replace(/·/g, '-').replace(/→/g, '->');
  const base = D.base, total = D.totalTests, pos = D.posC, neg = D.negC, pend = D.pendC, retests = D.totalRetests;
  const posRate = +D.positiveRate.toFixed(1);
  const patNames = { ecoli: 'E. coli', listeria: 'Listeria', salmonella: 'Salmonella', saureus: 'S. aureus' };
  const fmt = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  // ── Metrics & insights (routine tests, same as the screen) ──────────
  const resolvedIds = new Set((typeof GRV === 'function' ? GRV() : []).map(r => r.originalId));
  const openPos = base.filter(h => h.resultado === 'Positive' && !resolvedIds.has(h.id)).length;
  const bStats = D.buildings.map(b => ({ p: b.id, total: b.total, pos: b.positive, rate: b.total ? b.positive / b.total * 100 : 0, retests: b.retests }));
  const worstB = bStats.filter(b => b.total > 0).sort((a, b) => b.rate - a.rate)[0];
  const patStat = D.pathogens.map(p => ({ k: p.key, n: p.positive })).sort((a, b) => b.n - a.n);
  const worstPat = patStat[0];
  const zStat = D.zones.map(z => ({ z: z.zone, total: z.total, pos: z.positive, rate: z.total ? z.positive / z.total * 100 : 0 }));
  const worstZone = zStat.filter(z => z.total > 0).sort((a, b) => b.rate - a.rate)[0];
  const smap = {};
  base.forEach(h => { const k = h.planta + '|' + h.sample; if (!smap[k]) smap[k] = { sample: h.sample, planta: h.planta, zone: h.zone, area: h.area, location: h.location, total: 0, pos: 0 }; smap[k].total++; if (h.resultado === 'Positive') smap[k].pos++; });
  const topPts = Object.values(smap).filter(s => s.pos > 0).sort((a, b) => b.pos - a.pos || (b.pos / b.total) - (a.pos / a.total));
  const topPt = topPts[0];
  const dates = base.map(h => h.fecha).filter(Boolean).sort();
  let trend = 'stable';
  if (dates.length > 6) {
    const mid = dates[Math.floor(dates.length / 2)];
    const fh = base.filter(h => h.fecha < mid), sh = base.filter(h => h.fecha >= mid);
    const r1 = fh.length ? fh.filter(h => h.resultado === 'Positive').length / fh.length * 100 : 0;
    const r2 = sh.length ? sh.filter(h => h.resultado === 'Positive').length / sh.length * 100 : 0;
    if (r2 < r1 - 1) trend = 'improving'; else if (r2 > r1 + 1) trend = 'worsening';
  }

  // ── Layout helpers ──────────────────────────────────────────────────
  let y = 0;
  const ensure = h => { if (y + h > PH - 16) { doc.addPage(); y = 16; } };
  const secTitle = t => { ensure(14); doc.setFillColor(...G); doc.rect(M, y, W - M * 2, 7, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(255, 255, 255); doc.text(safe(t), M + 3, y + 4.8); y += 10; };
  const bullet = txt => { const lines = doc.splitTextToSize(safe(txt), W - M * 2 - 8); ensure(lines.length * 4.2 + 2); doc.setFillColor(...G); doc.circle(M + 2, y - 0.8, 0.8, 'F'); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(lines, M + 5, y); y += lines.length * 4.2 + 1.5; };
  const txt = (t, x, yy, o) => { o = o || {}; doc.setFont('helvetica', o.bold ? 'bold' : 'normal'); doc.setFontSize(o.size || 7.5); doc.setTextColor(...(o.color || INK)); doc.text(safe(t), x, yy, o.align ? { align: o.align } : undefined); };
  const n1 = v => v.toFixed(1);

  // ── Chart primitives (vector) ───────────────────────────────────────
  // Horizontal bars with the positive share overlaid, like the screen.
  function hbars(x, yy, w, h, rows) {
    const max = Math.max(1, ...rows.map(r => r.value));
    const rh = Math.min(9, h / Math.max(1, rows.length)), lw = 18, vw = 18, bw = w - lw - vw;
    rows.forEach((r, i) => {
      const cy = yy + i * rh + rh / 2;
      txt(r.label, x, cy + 1.2, { size: 7.5 });
      doc.setFillColor(...TRACK); doc.roundedRect(x + lw, cy - 1.8, bw, 3.6, 1, 1, 'F');
      const fw = bw * (r.value / max);
      if (fw > 0) { doc.setFillColor(...(r.color || SERIES)); doc.roundedRect(x + lw, cy - 1.8, Math.max(fw, 1.2), 3.6, 1, 1, 'F'); }
      if (r.positive && r.value) { doc.setFillColor(...POS); doc.roundedRect(x + lw, cy - 1.8, Math.max(fw * r.positive / r.value, 1.2), 3.6, 1, 1, 'F'); }
      txt(r.right != null ? r.right : String(r.value), x + w, cy + 1.2, { size: 7.5, bold: true, align: 'right' });
    });
  }
  // Donut by filled arc polygons.
  function donut(cx, cy, ro, ri, parts) {
    const sum = parts.reduce((a, p) => a + p.value, 0);
    if (!sum) { doc.setDrawColor(...TRACK); doc.setLineWidth(ro - ri); doc.circle(cx, cy, (ro + ri) / 2, 'S'); return; }
    let a0 = -Math.PI / 2;
    parts.forEach(p => {
      if (!p.value) return;
      const a1 = a0 + p.value / sum * Math.PI * 2, steps = Math.max(4, Math.ceil((a1 - a0) / 0.08)), pts = [];
      for (let i = 0; i <= steps; i++) { const a = a0 + (a1 - a0) * i / steps; pts.push([cx + ro * Math.cos(a), cy + ro * Math.sin(a)]); }
      for (let i = steps; i >= 0; i--) { const a = a0 + (a1 - a0) * i / steps; pts.push([cx + ri * Math.cos(a), cy + ri * Math.sin(a)]); }
      const d = []; for (let i = 1; i < pts.length; i++) d.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
      doc.setFillColor(...p.color); doc.setDrawColor(...p.color); doc.setLineWidth(0.1);
      doc.lines(d, pts[0][0], pts[0][1], [1, 1], 'FD', true);
      a0 = a1;
    });
  }
  // Weekly trend: total tests line + positive line, with labels.
  function trendChart(x, yy, w, h, weeks) {
    const n = weeks.length, l = x + 8, r = x + w - 3, top = yy + 3, bot = yy + h - 7;
    const ceil = Math.max(5, Math.ceil(Math.max(1, ...weeks.map(v => v.total)) / 5) * 5);
    const Y = v => bot - v / ceil * (bot - top), X = i => n <= 1 ? (l + r) / 2 : l + i * (r - l) / (n - 1);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2);
    [0, ceil / 2, ceil].forEach(v => { doc.line(l, Y(v), r, Y(v)); txt(String(v), l - 1.5, Y(v) + 1, { size: 6, color: MUT, align: 'right' }); });
    if (!n) { txt('No weekly data', (l + r) / 2, (top + bot) / 2, { size: 7, color: MUT, align: 'center' }); return; }
    const line = (key, col, wdt) => { doc.setDrawColor(...col); doc.setLineWidth(wdt); for (let i = 1; i < n; i++) doc.line(X(i - 1), Y(weeks[i - 1][key]), X(i), Y(weeks[i][key])); };
    line('total', SERIES, 0.7); line('positive', POS, 0.6);
    weeks.forEach((v, i) => {
      doc.setFillColor(...SERIES); doc.circle(X(i), Y(v.total), 0.9, 'F');
      doc.setFillColor(...POS); doc.circle(X(i), Y(v.positive), 0.7, 'F');
      txt(String(v.total), X(i), Y(v.total) - 1.8, { size: 6, bold: true, align: 'center' });
      if (n <= 8 || i % Math.ceil(n / 8) === 0) txt(v.short, X(i), bot + 4, { size: 5.8, color: MUT, align: 'center' });
    });
  }
  const legend = (x, yy, items) => { let cx = x; items.forEach(([lbl, col]) => { doc.setFillColor(...col); doc.roundedRect(cx, yy - 2, 3, 2.4, 0.5, 0.5, 'F'); txt(lbl, cx + 4, yy, { size: 6.5, color: MUT }); cx += 6 + doc.getTextWidth(safe(lbl)) + 4; }); };
  // Chart card frame
  const card = (x, yy, w, h, title, sub) => {
    doc.setDrawColor(...LINE); doc.setFillColor(255, 255, 255); doc.setLineWidth(0.25); doc.roundedRect(x, yy, w, h, 2, 2, 'FD');
    txt(title, x + 4, yy + 6, { size: 8.5, bold: true }); if (sub) txt(sub, x + w - 4, yy + 6, { size: 6.5, color: MUT, align: 'right' });
  };

  // ── Header ──────────────────────────────────────────────────────────
  try { doc.addImage(typeof pdfLogo === 'function' ? pdfLogo() : LOGO, 'JPEG', M, 8, 28, 14); } catch (e) {}
  txt('Environmental Monitoring Report', W - M, 13, { size: 15, bold: true, align: 'right' });
  txt('Period: ' + range.label + (range.from || range.to ? '  (' + fmt(range.from || dates[0]) + ' - ' + fmt(range.to || dates[dates.length - 1]) + ')' : ''), W - M, 19, { size: 8.5, color: MUT, align: 'right' });
  txt('Generated ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + (CU && CU.displayName ? ' by ' + CU.displayName : ''), W - M, 23.5, { size: 7.5, color: MUT, align: 'right' });
  doc.setDrawColor(...G); doc.setLineWidth(0.6); doc.line(M, 28, W - M, 28);
  y = 34;

  // ── Executive summary ───────────────────────────────────────────────
  secTitle('Executive Summary');
  const assess = posRate < 5 ? 'WELL-CONTROLLED' : posRate < 12 ? 'MODERATE CONCERN' : 'HIGH CONCERN';
  const trendTxt = trend === 'improving' ? 'The positive rate is trending down versus the earlier part of the period.' : trend === 'worsening' ? 'The positive rate is trending up versus the earlier part of the period; corrective action is recommended.' : 'The positive rate has held stable across the period.';
  const summary = total + ' routine environmental samples were collected in this period. ' + pos + ' tested positive (' + posRate + '%), ' + neg + ' were negative and ' + pend + ' are pending. ' +
    retests + ' follow-up retest(s) were run. ' + (openPos > 0 ? openPos + ' positive case(s) remain open. ' : 'All positive cases have been managed through their retest cycle. ') +
    (worstB && worstB.pos > 0 ? 'Building ' + worstB.p + ' carries the highest positive rate (' + n1(worstB.rate) + '%). ' : '') +
    (worstPat && worstPat.n > 0 ? patNames[worstPat.k] + ' is the most frequently detected organism (' + worstPat.n + '). ' : '') + 'Program status: ' + assess + '. ' + trendTxt;
  const sumLines = doc.splitTextToSize(safe(summary), W - M * 2 - 6), sumH = sumLines.length * 4.2 + 6;
  doc.setFillColor(...SOFT); doc.roundedRect(M, y, W - M * 2, sumH, 2, 2, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(sumLines, M + 3, y + 5);
  y += sumH + 6;

  // ── KPI tiles (same five as the screen + open cases) ────────────────
  const kpis = [['Total tests', String(total), 'Recorded samples', INK], ['Positive rate', posRate + '%', pos + ' positive', RED], ['Negative rate', n1(D.negativeRate) + '%', neg + ' negative', G],
    ['Retests', String(retests), 'Follow-up tests', [140, 116, 59]], ['Resolved cases', String(D.resolvedCount), 'Retests OK', G], ['Open cases', String(openPos), 'Need follow-up', openPos ? RED : G]];
  const kw = (W - M * 2 - 5 * 3) / 6, kh = 19;
  ensure(kh + 4);
  kpis.forEach((k, i) => {
    const x = M + i * (kw + 3);
    doc.setDrawColor(...LINE); doc.setFillColor(255, 255, 255); doc.setLineWidth(0.25); doc.roundedRect(x, y, kw, kh, 2, 2, 'FD');
    txt(k[0].toUpperCase(), x + 3, y + 5, { size: 5.8, bold: true, color: MUT });
    txt(k[1], x + 3, y + 12.5, { size: 14, bold: true, color: k[3] });
    txt(k[2], x + 3, y + 16.5, { size: 6, color: MUT });
  });
  y += kh + 8;

  // ── Charts (same set as the screen) ─────────────────────────────────
  secTitle('Visual Analysis');
  const cw = (W - M * 2 - 6) / 2, ch = 62;
  const pairs = [
    [c => { card(c.x, c.y, cw, ch, 'Tests by building', total + ' tests');
            hbars(c.x + 4, c.y + 11, cw - 8, 36, D.buildings.map(b => ({ label: b.id, value: b.total, positive: b.positive })));
            legend(c.x + 4, c.y + ch - 5, [['All tests', SERIES], ['Positive', POS]]); },
     c => { card(c.x, c.y, cw, ch, 'Result distribution', pend + ' pending');
            donut(c.x + 22, c.y + 34, 15, 9.5, [{ value: neg, color: SERIES }, { value: pos, color: POS }, { value: pend, color: PEND }]);
            txt(String(total), c.x + 22, c.y + 35, { size: 11, bold: true, align: 'center' }); txt('tests', c.x + 22, c.y + 39, { size: 6, color: MUT, align: 'center' });
            [['Negative', neg, SERIES], ['Positive', pos, POS], ['Pending', pend, PEND]].forEach((r, i) => {
              const yy = c.y + 22 + i * 9; doc.setFillColor(...r[2]); doc.roundedRect(c.x + 44, yy - 2.4, 3, 3, 0.6, 0.6, 'F');
              txt(r[0], c.x + 49, yy, { size: 7.5 }); txt((total ? n1(r[1] / total * 100) : '0.0') + '% of all tests', c.x + 49, yy + 3.4, { size: 6, color: MUT });
              txt(String(r[1]), c.x + cw - 4, yy, { size: 8, bold: true, align: 'right' }); }); }],
    [c => { card(c.x, c.y, cw, ch, 'Positive rate by zone', 'scale 0-10%');
            hbars(c.x + 4, c.y + 11, cw - 8, 36, D.zones.map(z => { const r = z.total ? z.positive / z.total * 100 : 0;
              return { label: z.name, value: Math.min(10, r), right: z.total ? n1(r) + '% (' + z.total + ')' : '-', color: r > 0 ? POS : SERIES }; }).map(r => Object.assign(r, { value: r.value })));
            txt('Bar length = positive rate (capped at 10%); tests in brackets', c.x + 4, c.y + ch - 5, { size: 6, color: MUT }); },
     c => { card(c.x, c.y, cw, ch, 'Pathogens', 'tested vs positive');
            hbars(c.x + 4, c.y + 11, cw - 8, 36, D.pathogens.map(p => ({ label: p.name, value: p.tested, positive: p.positive, right: p.tested + (p.positive ? ' (' + p.positive + '+)' : '') })));
            legend(c.x + 4, c.y + ch - 5, [['Tested', SERIES], ['Positive', POS]]); }],
    [c => { card(c.x, c.y, cw, ch, 'Weekly trend', D.weeks.length + ' week' + (D.weeks.length === 1 ? '' : 's'));
            trendChart(c.x + 4, c.y + 10, cw - 8, 44, D.weeks.slice(-12));
            legend(c.x + 4, c.y + ch - 3, [['Tests', SERIES], ['Positive', POS]]); },
     c => { card(c.x, c.y, cw, ch, 'Retests by building', D.resolvedCount + ' resolved - ' + retests + ' retests');
            hbars(c.x + 4, c.y + 11, cw - 8, 36, D.buildings.map(b => ({ label: b.id, value: b.retests, color: PEND })));
            legend(c.x + 4, c.y + ch - 5, [['Retests', PEND]]); }]
  ];
  pairs.forEach(row => { ensure(ch + 4); row.forEach((draw, j) => draw({ x: M + j * (cw + 6), y })); y += ch + 5; });

  // ── Key findings ────────────────────────────────────────────────────
  y += 2; secTitle('Key Findings');
  bullet('Positive rate for the period: ' + posRate + '% (' + pos + ' of ' + total + ' routine tests). Assessed as ' + assess.toLowerCase() + '.');
  if (worstB && worstB.pos > 0) bullet('Most affected building: ' + worstB.p + ' with ' + worstB.pos + ' positive(s), a ' + n1(worstB.rate) + '% positive rate.');
  if (worstPat && worstPat.n > 0) bullet('Most frequent organism: ' + patNames[worstPat.k] + ' with ' + worstPat.n + ' positive detection(s).');
  if (worstZone && worstZone.pos > 0) bullet('Highest-risk zone: Zone ' + worstZone.z + ' at ' + n1(worstZone.rate) + '% positive.');
  if (topPt) bullet('Top recurring point: Sample #' + topPt.sample + ' (' + topPt.planta + ' - ' + (topPt.area || '') + ') with ' + topPt.pos + ' positive(s) out of ' + topPt.total + ' tests.');
  bullet('Retest activity: ' + retests + ' retest(s) in the period; ' + openPos + ' positive case(s) still open.');

  // ── Recommendations ─────────────────────────────────────────────────
  secTitle('Recommendations');
  const recs = [];
  if (openPos > 0) recs.push('Prioritize closing the ' + openPos + ' open positive case(s): schedule and complete their retest cycles promptly.');
  if (topPt && topPt.pos >= 2) recs.push('Root-cause Sample #' + topPt.sample + ' at ' + topPt.planta + ' (' + (topPt.area || '') + ' / ' + (topPt.location || '') + ') - a recurring positive that warrants vector sampling, a deep clean and an equipment review.');
  if (worstB && worstB.rate >= 8) recs.push('Reinforce sanitation and verification in Building ' + worstB.p + ', which shows the highest positive rate.');
  if (worstPat && worstPat.n >= 2) recs.push('Target ' + patNames[worstPat.k] + ' controls (the leading organism): review harborage points, drains and cleaning chemistry.');
  if (worstZone && worstZone.rate >= 8) recs.push('Focus corrective cleaning on Zone ' + worstZone.z + ' surfaces, currently the highest-risk zone.');
  if (trend === 'worsening') recs.push('The positive trend is rising - investigate what changed (equipment, staffing, cleaning schedule) and act before it escalates.');
  if (!recs.length) recs.push('No critical issues detected this period. Maintain current sanitation and verification practices and keep monitoring.');
  recs.forEach(bullet);

  // ── Detail tables ───────────────────────────────────────────────────
  const tblHead = { fillColor: [234, 241, 228], textColor: INK, fontStyle: 'bold', fontSize: 8.5, lineColor: LINE, lineWidth: 0.2 };
  const tblStyle = { fontSize: 8.5, cellPadding: 2.4, textColor: INK, lineColor: LINE, lineWidth: 0.2, halign: 'center' };
  y += 2; secTitle('Detail - Tests by Building');
  doc.autoTable({
    head: [['Building', 'Routine tests', 'Positives', 'Negatives', 'Pending', 'Retests', 'Positive rate']],
    body: [...bStats.map(b => [b.p, b.total, b.pos, base.filter(h => h.planta === b.p && h.resultado === 'Negative').length, base.filter(h => h.planta === b.p && h.resultado === 'Pending').length, b.retests, b.total ? n1(b.rate) + '%' : '0%']),
      ['TOTAL', total, pos, neg, pend, retests, total ? posRate + '%' : '0%']],
    startY: y, margin: { left: M, right: M }, styles: tblStyle, headStyles: tblHead, columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    didParseCell: d => { if (d.row.raw && d.row.raw[0] === 'TOTAL') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = SOFT; }
      if ((d.column.index === 2 || d.column.index === 6) && d.section === 'body' && parseFloat(d.cell.raw) > 0) d.cell.styles.textColor = RED; }
  });
  y = doc.lastAutoTable.finalY + 7;
  ensure(30); secTitle('Detail - Positives by Building & Pathogen');
  doc.autoTable({
    head: [['Building', 'E. coli +', 'Listeria +', 'Salmonella +', 'S. aureus +', 'Total pos.', 'Positive rate']],
    body: bStats.map(b => { const ph = base.filter(h => h.planta === b.p && h.resultado === 'Positive'); return [b.p, ...['ecoli', 'listeria', 'salmonella', 'saureus'].map(k => ph.filter(h => positivePathogens(h).includes(k)).length), b.pos, b.total ? n1(b.rate) + '%' : '0%']; }),
    startY: y, margin: { left: M, right: M }, styles: tblStyle, headStyles: tblHead, columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    didParseCell: d => { if (d.section === 'body' && d.column.index > 0 && d.column.index < 6 && parseFloat(d.cell.raw) > 0) { d.cell.styles.textColor = RED; d.cell.styles.fontStyle = 'bold'; } }
  });
  y = doc.lastAutoTable.finalY + 7;
  ensure(30); secTitle('Detail - Points with Positives');
  doc.autoTable({
    head: [['#', 'Sample', 'Bldg', 'Zone', 'Area', 'Location', 'Tests', 'Pos.', 'Rate']],
    body: topPts.length ? topPts.slice(0, 15).map((s, i) => [i + 1, s.sample, s.planta, s.zone, s.area || '', s.location || '', s.total, s.pos, s.total ? (s.pos / s.total * 100).toFixed(0) + '%' : '0%'])
      : [['-', '-', '-', '-', 'No positives recorded', '-', '-', '-', '-']],
    startY: y, margin: { left: M, right: M }, styles: Object.assign({}, tblStyle, { fontSize: 8 }), headStyles: Object.assign({}, tblHead, { fontSize: 8 }),
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 16 }, 2: { cellWidth: 16 }, 3: { cellWidth: 14 }, 4: { halign: 'left' }, 5: { halign: 'left' }, 6: { cellWidth: 13 }, 7: { cellWidth: 13, fontStyle: 'bold' }, 8: { cellWidth: 13 } },
    didParseCell: d => { if (d.section === 'body' && d.column.index === 7 && parseFloat(d.cell.raw) > 0) d.cell.styles.textColor = RED; }
  });

  // ── Footer on every page ────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, PH - 11, W - M, PH - 11);
    txt('Caputo Foods - Environmental Monitoring Program - ' + range.label + ' - Confidential', M, PH - 7, { size: 7, color: MUT });
    txt('Page ' + p + ' of ' + pages, W - M, PH - 7, { size: 7, color: MUT, align: 'right' });
  }

  const tag = range.from && range.to ? (range.from === range.to ? range.from : range.from + '_to_' + range.to) : todayLocal();
  const fname = opts.fileName || 'Environmental Report ' + tag;
  if (opts.returnDoc) return { doc: doc, fname: fname };
  doc.save(fname + '.pdf');
  toast('Report exported - ' + range.label, 'success');
}

// ═══════════════════════════════════════════════
// MONTHLY REPORT → SharePoint (Option 1 automation)
// Admin generates the previous month's PDF (with its charts) once, and it
// lands in SharePoint. A scheduled Power Automate flow then emails it on the
// 2nd of each month. See automation/monthly-report-flow.md.
// ═══════════════════════════════════════════════
// Build the previous-month report PDF (with its charts) and return it plus the
// pre-formatted date strings. Restores the user's current Reports view after.
// Returns null when there is no data for last month.
async function _buildPrevMonthReport() {
  const rf = document.getElementById('repFrom'), rt = document.getElementById('repTo'), rp = document.getElementById('reportPeriod');
  const now = new Date();
  const firstPrev = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const lastPrev  = new Date(now.getFullYear(), now.getMonth(),   0);
  const ymd = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const tag = firstPrev.getFullYear()+'-'+String(firstPrev.getMonth()+1).padStart(2,'0'); // "2026-06"
  const longOpts = { month:'long', day:'numeric', year:'numeric' };

  const sF = rf?rf.value:'', sT = rt?rt.value:'', sP = rp?rp.value:'';
  if (rf) rf.value = ymd(firstPrev);
  if (rt) rt.value = ymd(lastPrev);
  buildReports();
  await new Promise(r => setTimeout(r, 120));                        // let the canvases paint
  let res;
  try { res = exportReportPDF({ returnDoc:true, fileName:'Monthly_Report_'+tag }); }
  finally { if (rf) rf.value = sF; if (rt) rt.value = sT; if (rp) rp.value = sP; buildReports(); }
  if (!res || !res.doc) return null;
  return {
    doc: res.doc, tag: tag, fileName: 'Monthly_Report_'+tag,
    monthLabel:  firstPrev.toLocaleDateString('en-US', { month:'long', year:'numeric' }),
    periodStart: firstPrev.toLocaleDateString('en-US', longOpts),
    periodEnd:   lastPrev.toLocaleDateString('en-US', longOpts),
    genDate:     now.toLocaleDateString('en-US', longOpts)
  };
}

// Professional HTML email body (values already filled in — no flow expressions).
function monthlyEmailBodyHtml(r) {
  return '' +
'<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Arial,sans-serif;background:#eef1f5;padding:24px 0">' +
'<table role="presentation" width="580" cellpadding="0" cellspacing="0" align="center" style="width:580px;max-width:580px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.08)">' +
'<tr><td style="background:#16243d;padding:24px 30px">' +
'<div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#8fa4c7;text-transform:uppercase">Caputo Foods &middot; Wiscon Corp</div>' +
'<div style="padding-top:6px;font-size:20px;font-weight:700;color:#fff">Environmental Monitoring &mdash; Monthly Report</div>' +
'<div style="padding-top:3px;font-size:14px;color:#c3d0e6">'+esc(r.monthLabel)+'</div></td></tr>' +
'<tr><td style="height:4px;background:#C0392B;font-size:0;line-height:0">&nbsp;</td></tr>' +
'<tr><td style="padding:26px 30px 8px">' +
'<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155">Please find attached the Environmental Monitoring report for <strong>'+esc(r.monthLabel)+'</strong>, covering all four production buildings.</p>' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;border:1px solid #e2e8f0;border-radius:8px">' +
'<tr><td style="padding:14px 18px;font-size:13px;line-height:1.9;color:#334155">' +
'<strong style="color:#16243d">Reporting period:</strong> '+esc(r.periodStart)+' &ndash; '+esc(r.periodEnd)+'<br>' +
'<strong style="color:#16243d">Buildings:</strong> 1945, 1935, 1931E, 1931W<br>' +
'<strong style="color:#16243d">Generated:</strong> '+esc(r.genDate)+'</td></tr></table>' +
'<p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#334155">The full analysis, charts and recommendations are in the attached PDF.</p></td></tr>' +
'<tr><td style="padding:20px 30px 26px">' +
'<div style="border-top:1px solid #e2e8f0;padding-top:14px;font-size:12px;line-height:1.6;color:#94a3b8">This is an automated message from the EnviroTrack system.<br>Quality Assurance &middot; Caputo Cheese &mdash; Wiscon Corp &middot; Confidential</div>' +
'</td></tr></table></div>';
}

// PRIMARY monthly action: generate last month's PDF and EMAIL it straight to QA
// via a tiny 2-action HTTP flow (no SharePoint file fetching). Also archives a
// copy to SharePoint best-effort.
async function emailMonthlyReport() {
  if (typeof canEditRecords === 'function' && !canEditRecords()) { toast('Administrators only','error'); return; }
  const r = await _buildPrevMonthReport();
  if (!r) { toast('No data recorded for last month — nothing to send','error'); return; }
  const b64 = r.doc.output('datauristring').split('base64,')[1];
  try {
    toast('Sending monthly report to QA…','info');
    await _spPost('emailmonthly', {
      fileName: r.fileName + '.pdf',
      contentBase64: b64,
      subject: 'Environmental Monitoring Report — ' + r.monthLabel,
      bodyHtml: monthlyEmailBodyHtml(r)
    });
    toast('Monthly report for ' + r.monthLabel + ' sent to QA','success');
    syncSafe(() => savePdfToSharePoint(r.fileName, r.doc, 'Monthly Reports'), 'archive monthly'); // best-effort archive
  } catch (e) {
    console.error('[monthly] email failed:', e);
    toast('Could not send monthly report — check your connection','error');
  }
}

// Kept for archival-only use (saves to SharePoint without emailing).
async function saveMonthlyReportToSharePoint() {
  if (typeof canEditRecords === 'function' && !canEditRecords()) { toast('Administrators only','error'); return; }
  const r = await _buildPrevMonthReport();
  if (!r) { toast('No data recorded for last month — nothing to save','error'); return; }
  try {
    toast('Saving monthly report…','info');
    await savePdfToSharePoint(r.fileName, r.doc, 'Monthly Reports');
    toast('Monthly report for ' + r.tag + ' saved to SharePoint','success');
  } catch (e) {
    console.error('[monthly] save failed:', e);
    toast('Could not save monthly report — check your connection','error');
  }
}

// ═══════════════════════════════════════════════
// SQF COMPLIANCE
// ═══════════════════════════════════════════════
const SQF_MIN_TESTS  = 10;   // min tests per plant per week (default / 1945)
// Weekly SAMPLE minimum per building, per SOP 2.4.H:
// 1945 = 10, 1935 = 8, 1931E / 1931W = 7.
const BUILDING_MIN_SAMPLES = { '1945':10, '1935':8, '1931E':7, '1931W':7 };
function minSamplesFor(plant, fallback) {
  return BUILDING_MIN_SAMPLES[plant] || fallback || SQF_MIN_TESTS;
}
// The environmental program went fully live in the last two weeks of June 2026.
// Weeks before this (Monday 2026-06-22) came from onboarding/migration data
// (e.g. 1945 had records while 1935/1931E/1931W were not yet in use) and would
// show as false "incomplete weeks" — they are excluded from SQF compliance.
const SQF_PROGRAM_START = '2026-06-22';   // go-live week of Jun 15 had no sampling

function switchRepTab(tab) {
  ['stats','sqf'].forEach(t => {
    document.getElementById('repPanel-'+t).style.display = t===tab ? 'block' : 'none';
    const btn = document.getElementById('rtab-'+t);
    if(t===tab) {
      btn.style.borderBottom='2px solid var(--red)';
      btn.style.color='var(--red)'; btn.style.fontWeight='600';
    } else {
      btn.style.borderBottom='2px solid transparent';
      btn.style.color='var(--gray-500)'; btn.style.fontWeight='500';
    }
  });
  if(tab==='sqf')   initSQF();
  if(tab==='stats') buildReports();
}

function initSQF() {
  // Populate year selector from history
  const hist = GH();
  const years = [...new Set(hist.map(h => h.fecha.substring(0,4)))].sort().reverse();
  const sel = document.getElementById('sqfYear');
  sel.innerHTML = years.length
    ? years.map(y => `<option value="${y}">${y}</option>`).join('')
    : `<option value="${new Date().getFullYear()}">${new Date().getFullYear()}</option>`;
  buildSQF();
}

function buildSQF() {
  const year     = document.getElementById('sqfYear').value;
  const plant    = document.getElementById('sqfPlant').value;
  const minTests = parseInt(document.getElementById('sqfMinTests').value)||10;
  const plants   = plant==='all' ? ['1945','1935','1931E','1931W'] : [plant];

  let hist = GH().filter(h => h.fecha.startsWith(year));
  if(plant!=='all') hist = hist.filter(h => h.planta===plant);

  // ── 1. Weekly frequency compliance ────────────────────────────────────
  // Group tests by plant+week, check if >= minTests
  const weekMap = {};
  hist.filter(h=>!h.retestNum).forEach(h => {
    const d = new Date(h.fecha+'T12:00:00');
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay()+6)%7)); // Monday of week
    const wk = mon.toISOString().split('T')[0];
    plants.forEach(p => {
      const key = p+'|'+wk;
      if(!weekMap[key]) weekMap[key]={plant:p, week:wk, count:0, zones:new Set()};
    });
    const key = h.planta+'|'+wk;
    if(!weekMap[key]) weekMap[key]={plant:h.planta, week:wk, count:0, zones:new Set()};
    weekMap[key].count++;
    weekMap[key].zones.add(h.zone);
  });

  const allWeeks = Object.values(weekMap)
    .filter(w => plants.includes(w.plant) && w.week >= SQF_PROGRAM_START);
  const totalWeeks = allWeeks.length;
  const compliantFreq = allWeeks.filter(w => w.count >= minSamplesFor(w.plant, minTests)).length;
  const compliantZone2 = allWeeks.filter(w => w.zones.has(2)).length;
  const compliantZone3 = allWeeks.filter(w => w.zones.has(3)).length;
  const compliantZone4 = allWeeks.filter(w => w.zones.has(4)).length;

  // ── 2. Retest response time ────────────────────────────────────────────
  const positives = hist.filter(h => h.resultado==='Positive' && !h.retestNum);
  let retestOnTime = 0;
  positives.forEach(pos => {
    const retests = GH().filter(r => r.originalId===pos.id);
    if(retests.length>0) {
      const posDate = new Date(pos.fecha+'T12:00:00');
      const firstRetest = new Date(retests[0].fecha+'T12:00:00');
      const diffDays = Math.round((firstRetest-posDate)/(1000*60*60*24));
      if(diffDays<=7) retestOnTime++; // within 7 calendar days
    }
  });

  // ── 3. Positive resolution ────────────────────────────────────────────
  const resolved = GRV();
  const resolvedIds = new Set(resolved.map(r=>r.originalId));
  const openPositives = positives.filter(p => !resolvedIds.has(p.id));
  const resolutionRate = positives.length>0
    ? Math.round((positives.length-openPositives.length)/positives.length*100) : 100;

  // ── 4. MASTER coverage ────────────────────────────────────────────────
  const testedSamples = new Set(hist.filter(h=>!h.retestNum).map(h=>h.planta+'|'+h.sample));
  const masterTotal = plants.reduce((sum,p) => sum+getActiveMaster(p).length, 0);
  const masterTested = plants.reduce((sum,p) =>
    sum+getActiveMaster(p).filter(pt=>testedSamples.has(p+'|'+pt.sample)).length, 0);
  const coverageRate = masterTotal>0 ? Math.round(masterTested/masterTotal*100) : 0;

  // ── 5. Calculate overall score ───────────────────────────────────────
  const scores = [];
  if(totalWeeks>0) {
    scores.push(Math.round(compliantFreq/totalWeeks*100));
    scores.push(Math.round(compliantZone2/totalWeeks*100));
    scores.push(Math.round(compliantZone3/totalWeeks*100));
    scores.push(Math.round(compliantZone4/totalWeeks*100));
  }
  scores.push(resolutionRate);
  if(positives.length>0) scores.push(Math.round(retestOnTime/positives.length*100));
  scores.push(coverageRate);
  const overall = scores.length>0 ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 100;

  // ── Render score badge ────────────────────────────────────────────────
  const scoreColor = overall>=90?'var(--green)':overall>=75?'var(--yellow)':'var(--red)';
  const scoreBadge = document.getElementById('sqfScoreBadge');
  scoreBadge.style.border='5px solid '+scoreColor;
  document.getElementById('sqfScoreNum').style.color=scoreColor;
  document.getElementById('sqfScoreNum').textContent=overall+'%';
  const scoreLabel = overall>=90?'EXCELLENT':overall>=75?'ACCEPTABLE':'NEEDS ATTENTION';
  document.getElementById('sqfSummaryTitle').textContent =
    'SQF Compliance '+year+' — '+scoreLabel;
  document.getElementById('sqfSummaryDesc').textContent =
    'Building'+(plant==='all'?'s: All':': '+plant)+
    ' | Evaluated: '+totalWeeks+' weeks'+
    ' | '+hist.filter(h=>!h.retestNum).length+' tests registrados';

  // Quick stats
  document.getElementById('sqfQuickStats').innerHTML = [
    {v:hist.filter(h=>!h.retestNum).length, l:'Total Tests', c:'var(--gray-900)'},
    {v:positives.length, l:'Positives', c:positives.length?'var(--red)':'var(--gray-900)'},
    {v:openPositives.length, l:'Unresolved', c:openPositives.length?'var(--red)':'var(--green)'},
    {v:coverageRate+'%', l:'Master Coverage', c:coverageRate>=80?'var(--green)':'var(--yellow)'},
  ].map(s=>`<div class="sqf-kpi"><div class="k">${s.l}</div><div class="v" style="color:${s.c}">${s.v}</div></div>`).join('');

  // ── Requirements table ────────────────────────────────────────────────
  const pct = (n,d) => d>0 ? Math.round(n/d*100) : 100;
  const pill = (val, good=90, warn=75) => {
    const c = val>=good?'var(--green)':val>=warn?'var(--yellow)':'var(--red)';
    const ic = val>=good?`<svg class="ln" width="15" height="15" viewBox="0 0 24 24" style="color:${c};vertical-align:-3px"><polyline points="20 6 9 17 4 12"/></svg>`:val>=warn?`<svg class="ln" width="15" height="15" viewBox="0 0 24 24" style="color:${c};vertical-align:-3px"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`:`<svg class="ln" width="15" height="15" viewBox="0 0 24 24" style="color:${c};vertical-align:-3px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    return {c, ic, val};
  };

  const reqs = [
    { req:'Sampling frequency', desc:(plant==='all'?'Min. samples/week per building (10 for 1945 · 8 for 1935 · 7 for 1931E/1931W)':`Minimum ${minSamplesFor(plant, minTests)} samples per week`),
      meta:totalWeeks+' weeks', logrado:compliantFreq+' weeks',
      ...pill(pct(compliantFreq,totalWeeks)) },
    { req:'Zone 2 Coverage', desc:'At least 1 point from Zone 2 per week',
      meta:'100%', logrado:pct(compliantZone2,totalWeeks)+'%',
      ...pill(pct(compliantZone2,totalWeeks)) },
    { req:'Zone 3 Coverage', desc:'At least 1 point from Zone 3 per week',
      meta:'100%', logrado:pct(compliantZone3,totalWeeks)+'%',
      ...pill(pct(compliantZone3,totalWeeks)) },
    { req:'Zone 4 Coverage', desc:'At least 1 point from Zone 4 per week',
      meta:'100%', logrado:pct(compliantZone4,totalWeeks)+'%',
      ...pill(pct(compliantZone4,totalWeeks)) },
    { req:'Response to positives', desc:'Retest #1 started ≤ 7 days from the positive',
      meta:'100%', logrado:positives.length>0?pct(retestOnTime,positives.length)+'%':'N/A',
      ...pill(positives.length>0?pct(retestOnTime,positives.length):100) },
    { req:'Resolution of positives', desc:'All positives with completed retests',
      meta:'100%', logrado:resolutionRate+'%',
      ...pill(resolutionRate) },
    { req:'MASTER Coverage', desc:'Sampling points tested in the period',
      meta:'>80%', logrado:coverageRate+'%',
      ...pill(coverageRate, 80, 60) },
  ];

  document.getElementById('sqfReqTable').innerHTML = reqs.map(r => `
    <tr>
      <td style="font-weight:600;white-space:nowrap">${r.req}</td>
      <td style="font-size:12px;color:var(--gray-500)">${r.desc}</td>
      <td style="text-align:center;font-size:13px">${r.meta}</td>
      <td style="text-align:center;font-size:13px;font-weight:600">${r.logrado}</td>
      <td style="text-align:center">
        <div style="background:var(--gray-100);border-radius:4px;height:6px;overflow:hidden;width:80px;margin:0 auto">
          <div style="background:${r.c};height:6px;width:${Math.min(parseInt(r.val)||0,100)}%"></div>
        </div>
        <span style="font-size:11px;font-weight:600;color:${r.c}">${r.val}%</span>
      </td>
      <td style="text-align:center;font-size:16px">${r.ic}</td>
    </tr>`).join('');

  // ── Non-compliant weeks ───────────────────────────────────────────────
  const badWeeks = allWeeks.filter(w=>w.count<minSamplesFor(w.plant, minTests))
    .sort((a,b)=>a.week.localeCompare(b.week));
  const wkEl = document.getElementById('sqfWeekIssues');
  if(!badWeeks.length) {
    wkEl.innerHTML='<span style="color:var(--green);font-weight:600"><svg class="ln ico-inline" width="14" height="14" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>All weeks met the minimum frequency</span>';
  } else {
    wkEl.innerHTML='<div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto">'+
      badWeeks.map(w=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;
             background:var(--red-light);border-radius:6px;font-size:12px">
          <span style="font-weight:600">${w.plant}</span>
          <span style="color:var(--gray-500)">${new Date(w.week+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
          <span style="color:var(--red);font-weight:700">${w.count}/${minSamplesFor(w.plant, minTests)} tests</span>
        </div>`).join('')+
      '</div>';
  }

  // ── Open positives ────────────────────────────────────────────────────
  const opEl = document.getElementById('sqfOpenPositives');
  if(!openPositives.length) {
    opEl.innerHTML='<span style="color:var(--green);font-weight:600"><svg class="ln ico-inline" width="14" height="14" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>All positives have been resolved</span>';
  } else {
    opEl.innerHTML='<div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto">'+
      openPositives.map(p=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;
             background:var(--red-light);border-radius:6px;font-size:12px">
          <span style="font-weight:700;color:var(--red)">Sample #${p.sample}</span>
          <span class="badge badge-gray">${p.planta}</span>
          <span style="color:var(--gray-500)">${p.fecha}</span>
          <span style="color:var(--red);font-size:11px">${p.failedPathogensLabel||'Positive'}</span>
        </div>`).join('')+
      '</div>';
  }

  // ── MASTER coverage by plant ──────────────────────────────────────────
  document.getElementById('sqfCoverageTable').innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">'+
    plants.map(p=>{
      const master = getActiveMaster(p);
      const tested = master.filter(pt=>testedSamples.has(p+'|'+pt.sample)).length;
      const rate = master.length>0?Math.round(tested/master.length*100):0;
      const barColor = rate>=80?'var(--green)':rate>=60?'var(--yellow)':'var(--red)';
      return `<div style="background:var(--gray-50);border-radius:8px;padding:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:13px;font-weight:700">Plant ${p}</span>
          <span style="font-size:13px;font-weight:700;color:${barColor}">${rate}%</span>
        </div>
        <div style="background:var(--gray-200);border-radius:4px;height:8px;overflow:hidden;margin-bottom:6px">
          <div style="background:${barColor};height:8px;width:${rate}%;border-radius:4px;transition:width .4s"></div>
        </div>
        <div style="font-size:11px;color:var(--gray-500)">${tested} de ${master.length} points testeados</div>
      </div>`;
    }).join('')+
    '</div>';
}

// ── SQF PDF Export ────────────────────────────────────────────────────────
function exportSQFpdf() {
  const year    = document.getElementById('sqfYear').value;
  const plant   = document.getElementById('sqfPlant').value;
  const minT    = parseInt(document.getElementById('sqfMinTests').value)||10;
  const {jsPDF} = window.jspdf;
  const doc     = new jsPDF({orientation:'portrait',unit:'mm',format:'letter'});
  const W=215.9, M=14, today=new Date().toLocaleDateString('en-US');

  // ── Header ─────────────────────────────────────────────────────────
  try { doc.addImage(LOGO,'JPEG',M,8,28,14); } catch(e){}
  doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.setTextColor(0,0,0);
  doc.text('SQF Compliance Report',W/2,13,{align:'center'});
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(192,57,43);
  doc.text('CAPUTO FOODS',W/2,19,{align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(100,100,100);
  doc.text('Year: '+year+' | Building: '+(plant==='all'?'All':plant)+' | Generated: '+today,W/2,24.5,{align:'center'});
  doc.setDrawColor(192,57,43); doc.setLineWidth(0.5); doc.line(M,28,W-M,28);

  // ── Score box ──────────────────────────────────────────────────────
  const scoreEl = document.getElementById('sqfScoreNum');
  const overall = scoreEl ? parseInt(scoreEl.textContent) : 0;
  const scoreColor = overall>=90?[5,150,105]:overall>=75?[217,119,6]:[192,57,43];
  doc.setFillColor(...scoreColor); doc.setDrawColor(...scoreColor); doc.setLineWidth(0.5);
  doc.roundedRect(M,31,40,20,3,3,'FD');
  doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(255,255,255);
  doc.text(overall+'%',M+20,42,{align:'center'});
  doc.setFontSize(8); doc.text('COMPLIANCE',M+20,47,{align:'center'});
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(0,0,0);
  const label = overall>=90?'EXCELLENT':overall>=75?'ACCEPTABLE':'NEEDS ATTENTION';
  doc.text(label,M+48,38);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(100,100,100);
  const hist = GH().filter(h=>h.fecha.startsWith(year)&&(plant==='all'||h.planta===plant));
  doc.text('Tests recorded: '+hist.filter(h=>!h.retestNum).length+
           '  |  Positives: '+hist.filter(h=>h.resultado==='Positive'&&!h.retestNum).length,M+48,44);
  doc.text('Period evaluated: 01/01/'+year+' — 12/31/'+year,M+48,50);

  // ── Requirements table ─────────────────────────────────────────────
  const sectionTitle = (t,y) => {
    doc.setFillColor(26,35,50); doc.rect(M,y,W-M*2,7,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(255,255,255);
    doc.text(t,M+3,y+5); return y+7;
  };

  let y = 56;
  y = sectionTitle('SQF Requirements — Compliance Detail',y);

  // Collect data from DOM table
  const rows = [];
  document.querySelectorAll('#sqfReqTable tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if(cells.length>=5) {
      const pctText = cells[4].querySelector('span:last-child');
      const val = pctText ? parseInt(pctText.textContent) : 0;
      const status = val>=90?'✓ CUMPLE':val>=75?'⚠ PARCIAL':'✗ INCUMPLE';
      rows.push([cells[0].textContent.trim(), cells[2].textContent.trim(),
                 cells[3].textContent.trim(), val+'%', status]);
    }
  });

  const cW = (W-M*2)/5;
  doc.autoTable({
    head:[['Requirement','Target','Achieved','Compliance','Status']],
    body:rows,
    startY:y,margin:{left:M,right:M},
    styles:{fontSize:8.5,cellPadding:3,textColor:[0,0,0],lineColor:[0,0,0],lineWidth:0.2},
    headStyles:{fillColor:[255,255,255],textColor:[0,0,0],fontStyle:'bold',fontSize:8.5,lineColor:[0,0,0],lineWidth:0.2},
    columnStyles:{
      0:{cellWidth:cW*1.8,fontStyle:'bold'},
      1:{cellWidth:cW*.8,halign:'center'},
      2:{cellWidth:cW*.8,halign:'center'},
      3:{cellWidth:cW*.8,halign:'center'},
      4:{cellWidth:cW*.8,halign:'center',fontStyle:'bold'},
    },
    didParseCell:d=>{
      if(d.column.index===4&&d.row.index>=0){
        const v=d.cell.raw;
        if(v&&v.includes('✓')) d.cell.styles.textColor=[5,150,105];
        else if(v&&v.includes('⚠')) d.cell.styles.textColor=[217,119,6];
        else if(v&&v.includes('✗')) d.cell.styles.textColor=[192,57,43];
      }
    }
  });

  // ── Coverage by plant ──────────────────────────────────────────────
  y = doc.lastAutoTable.finalY+8;
  y = sectionTitle('MASTER Coverage by Building',y);
  const plants2 = plant==='all'?['1945','1935','1931E','1931W']:[plant];
  const testedSet = new Set(hist.filter(h=>!h.retestNum).map(h=>h.planta+'|'+h.sample));
  doc.autoTable({
    head:[['Building','Total MASTER Points','Tested Points','Untested Points','Coverage']],
    body:plants2.map(p=>{
      const master=getActiveMaster(p);
      const tested=master.filter(pt=>testedSet.has(p+'|'+pt.sample)).length;
      const rate=master.length>0?Math.round(tested/master.length*100):0;
      return[p,master.length,tested,master.length-tested,rate+'%'];
    }),
    startY:y,margin:{left:M,right:M},
    styles:{fontSize:9,cellPadding:3,textColor:[0,0,0],lineColor:[0,0,0],lineWidth:0.2,halign:'center'},
    headStyles:{fillColor:[255,255,255],textColor:[0,0,0],fontStyle:'bold',lineColor:[0,0,0],lineWidth:0.2},
    columnStyles:{0:{fontStyle:'bold',halign:'left'}},
    didParseCell:d=>{
      if(d.column.index===4&&d.row.index>=0){
        const v=parseInt(d.cell.raw);
        if(v>=80) d.cell.styles.textColor=[5,150,105];
        else if(v>=60) d.cell.styles.textColor=[217,119,6];
        else d.cell.styles.textColor=[192,57,43];
        d.cell.styles.fontStyle='bold';
      }
    }
  });

  // ── Non-compliant weeks ────────────────────────────────────────────
  const weekMap2={};
  hist.filter(h=>!h.retestNum).forEach(h=>{
    const d=new Date(h.fecha+'T12:00:00');
    const mon=new Date(d); mon.setDate(d.getDate()-((d.getDay()+6)%7));
    const wk=mon.toISOString().split('T')[0];
    const key=h.planta+'|'+wk;
    if(!weekMap2[key]) weekMap2[key]={plant:h.planta,week:wk,count:0};
    weekMap2[key].count++;
  });
  const badWks=Object.values(weekMap2).filter(w=>w.count<minSamplesFor(w.plant, minT)&&plants2.includes(w.plant)&&w.week>=SQF_PROGRAM_START).sort((a,b)=>a.week.localeCompare(b.week));

  if(badWks.length>0){
    y=doc.lastAutoTable.finalY+8;
    y=sectionTitle('Weeks Below Minimum Frequency',y);
    doc.autoTable({
      head:[['Building','Week of','Tests','Min','Missing','% Met']],
      body:badWks.map(w=>{ const m=minSamplesFor(w.plant, minT); return [w.plant,new Date(w.week+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),w.count,m,m-w.count,Math.round(w.count/m*100)+'%']; }),
      startY:y,margin:{left:M,right:M},
      styles:{fontSize:8.5,cellPadding:2.5,textColor:[0,0,0],lineColor:[0,0,0],lineWidth:0.2,halign:'center'},
      headStyles:{fillColor:[255,255,255],textColor:[0,0,0],fontStyle:'bold',lineColor:[0,0,0],lineWidth:0.2},
      columnStyles:{0:{fontStyle:'bold',halign:'left'},1:{halign:'left'}},
    });
  }

  // ── Footer ──────────────────────────────────────────────────────────
  const pages=doc.internal.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    doc.setPage(i);
    const fY=doc.internal.pageSize.getHeight()-10;
    doc.setDrawColor(192,57,43); doc.setLineWidth(0.4); doc.line(M,fY-4,W-M,fY-4);
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(140,140,140);
    doc.text('Caputo Foods | SQF Environmental Monitoring Program | Confidential',M,fY);
    doc.text('Pg. '+i+' de '+pages,W-M,fY,{align:'right'});
  }

  doc.save('Caputo_SQF_Compliance_'+year+'_'+todayLocal()+'.pdf');
  toast('✅ SQF Report exported','success');
}