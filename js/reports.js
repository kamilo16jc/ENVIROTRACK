// ═══════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════
let chartInstances = {};

function destroyCharts() {
  Object.values(chartInstances).forEach(c => { try { c.destroy(); } catch(e){} });
  chartInstances = {};
}

function getFilteredHistory() {
  const days = parseInt(document.getElementById('reportPeriod').value);
  let hist = GH();
  if(!isNaN(days)) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutStr = cutoff.toISOString().split('T')[0];
    hist = hist.filter(h => h.fecha >= cutStr);
  }
  return hist;
}

function buildReports() {
  destroyCharts();
  const hist = getFilteredHistory();
  const plants = ['1945','1935','1931E','1931W'];
  const COLORS = { '1945':'#C0392B','1935':'#1A5276','1931E':'#0E6655','1931W':'#6C3483' };
  const resColors = { 'Negativo':'#059669','Positivo':'#DC2626','Pendiente':'#D97706' };
  const patColors = ['#C0392B','#1A5276','#0E6655','#6C3483'];

  // ── KPI Cards ───────────────────────────────────────────────────────────
  const total    = hist.length;
  const pos      = hist.filter(h => h.resultado==='Positivo').length;
  const neg      = hist.filter(h => h.resultado==='Negativo').length;
  const pend     = hist.filter(h => h.resultado==='Pendiente').length;
  const retests  = hist.filter(h => h.retestNum).length;
  const posRate  = total > 0 ? (pos/total*100).toFixed(1) : '0.0';
  const negRate  = total > 0 ? (neg/total*100).toFixed(1) : '0.0';
  const resolved = GRV().length;

  const kpis = [
    { label:'Total Tests', value:total, sub:'registros', color:'var(--navy)' },
    { label:'Tasa de Positivos', value:posRate+'%', sub:pos+' positivos', color:'#DC2626' },
    { label:'Tasa de Negativos', value:negRate+'%', sub:neg+' negativos', color:'var(--green)' },
    { label:'Retests Generados', value:retests, sub:'de '+pos+' positivos', color:'#D97706' },
    { label:'Casos Resueltos', value:resolved, sub:'retests OK', color:'var(--green)' },
  ];

  document.getElementById('kpiCards').innerHTML = kpis.map(k => `
    <div style="background:var(--white);border-radius:var(--radius);padding:18px 20px;
         box-shadow:0 1px 3px rgba(0,0,0,.1);border-top:3px solid ${k.color}">
      <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${k.label}</div>
      <div style="font-size:26px;font-weight:700;color:${k.color}">${k.value}</div>
      <div style="font-size:11px;color:var(--gray-400);margin-top:3px">${k.sub}</div>
    </div>`).join('');

  // ── Chart 1: Tests by plant (bar) ───────────────────────────────────────
  const plantCounts = plants.map(p => hist.filter(h => h.planta===p).length);
  const plantPos    = plants.map(p => hist.filter(h => h.planta===p && h.resultado==='Positivo').length);
  chartInstances.plant = new Chart(document.getElementById('chartPlant'), {
    type:'bar',
    data:{ labels:plants,
      datasets:[
        { label:'Total', data:plantCounts, backgroundColor:plants.map(p=>COLORS[p]+'99'), borderColor:plants.map(p=>COLORS[p]), borderWidth:1.5 },
        { label:'Positivos', data:plantPos, backgroundColor:'#DC262699', borderColor:'#DC2626', borderWidth:1.5 }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'top', labels:{ boxWidth:10, font:{ size:11 } } } },
      scales:{ y:{ beginAtZero:true, ticks:{ font:{ size:10 } } }, x:{ ticks:{ font:{ size:11 } } } }
    }
  });

  // ── Chart 2: Result distribution (doughnut) ──────────────────────────────
  const resDist = ['Negativo','Positivo','Pendiente'].map(r => hist.filter(h=>h.resultado===r).length);
  chartInstances.result = new Chart(document.getElementById('chartResult'), {
    type:'doughnut',
    data:{ labels:['Negativo','Positivo','Pendiente'],
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
  const zonePos   = zones.map(z => hist.filter(h=>h.zone==z&&h.resultado==='Positivo').length);
  const zoneRate  = zones.map((_,i) => zoneTotal[i]>0 ? +(zonePos[i]/zoneTotal[i]*100).toFixed(1) : 0);
  chartInstances.zone = new Chart(document.getElementById('chartZone'), {
    type:'bar',
    data:{ labels:['Zona 2','Zona 3','Zona 4'],
      datasets:[
        { label:'% Positivos', data:zoneRate, backgroundColor:['#1A527699','#C0392B99','#0E665599'],
          borderColor:['#1A5276','#C0392B','#0E6655'], borderWidth:1.5, yAxisID:'y' },
        { label:'Total tests', data:zoneTotal, type:'line',
          borderColor:'#D97706', backgroundColor:'transparent', borderWidth:2,
          pointBackgroundColor:'#D97706', yAxisID:'y1' }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'top', labels:{ boxWidth:10, font:{ size:11 } } } },
      scales:{
        y:{ beginAtZero:true, position:'left', title:{ display:true, text:'% Positivos', font:{ size:10 } }, ticks:{ callback:v=>v+'%', font:{ size:10 } } },
        y1:{ beginAtZero:true, position:'right', title:{ display:true, text:'Total', font:{ size:10 } }, grid:{ drawOnChartArea:false }, ticks:{ font:{ size:10 } } },
        x:{ ticks:{ font:{ size:11 } } }
      }
    }
  });

  // ── Chart 4: Pathogen distribution (bar) ────────────────────────────────
  const patNames = ['E.Coli','Listeria','Salmonella','S.Aureus'];
  const patKeys  = ['ecoli','listeria','salmonella','saureus'];
  const patTested = patKeys.map(k => hist.filter(h=>h[k]).length);
  const patPos    = patKeys.map(k => hist.filter(h=>h[k]&&h.resultado==='Positivo').length);
  chartInstances.pat = new Chart(document.getElementById('chartPat'), {
    type:'bar',
    data:{ labels:patNames,
      datasets:[
        { label:'Testeados', data:patTested, backgroundColor:patColors.map(c=>c+'55'), borderColor:patColors, borderWidth:1.5 },
        { label:'Positivos', data:patPos, backgroundColor:patColors.map(c=>c+'CC'), borderColor:patColors, borderWidth:1.5 }
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
    if(h.resultado==='Positivo') weekMap[key].pos++;
  });
  const weekKeys = Object.keys(weekMap).sort().slice(-16);
  const weekLabels = weekKeys.map(k => { const d=new Date(k+'T12:00:00'); return (d.getMonth()+1)+'/'+d.getDate(); });
  chartInstances.trend = new Chart(document.getElementById('chartTrend'), {
    type:'line',
    data:{ labels:weekLabels,
      datasets:[
        { label:'Total tests', data:weekKeys.map(k=>weekMap[k].total),
          borderColor:'#1A5276', backgroundColor:'#1A527622', fill:true, tension:0.3, pointRadius:3, borderWidth:2 },
        { label:'Positivos', data:weekKeys.map(k=>weekMap[k].pos),
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
    if(h.resultado==='Positivo') {
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
    ? '<tr><td colspan="9" style="text-align:center;color:var(--gray-500);padding:24px">Sin positivos registrados</td></tr>'
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
    if(h.resultado==='Positivo') monthMap[key][h.planta].pos++;
  });
  const months = Object.keys(monthMap).sort().slice(-12);
  const maxTotal = Math.max(...months.flatMap(m=>plants.map(p=>monthMap[m]?.[p]?.total||0)), 1);

  let heatHtml = '<table style="width:100%;border-collapse:collapse;font-size:12px">';
  heatHtml += '<tr><th style="padding:6px 10px;text-align:left;color:var(--gray-500)">Edificio</th>';
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
      const title = n===0?'Sin tests':`${n} tests, ${po} positivo(s)`;
      heatHtml += `<td style="text-align:center;padding:4px;"><div title="${title}" style="background:${bg};color:${fg};border-radius:4px;padding:6px 4px;font-size:11px;font-weight:600;min-width:36px;cursor:default">${n||''}</div></td>`;
    });
    heatHtml += '</tr>';
  });
  heatHtml += '</table>';
  heatHtml += '<div style="display:flex;align-items:center;gap:16px;margin-top:10px;font-size:11px;color:var(--gray-500)">';
  heatHtml += '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:2px;background:rgba(26,82,118,.7)"></span>Tests OK</span>';
  heatHtml += '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:2px;background:rgba(192,57,43,.7)"></span>Con positivos</span>';
  heatHtml += '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:2px;background:var(--gray-100)"></span>Sin actividad</span>';
  heatHtml += '</div>';
  document.getElementById('heatmapContainer').innerHTML = heatHtml;

  // ── Pathogen x Plant Table ────────────────────────────────────────────────
  const patKeys2 = ['ecoli','listeria','salmonella','saureus'];
  document.getElementById('pathoPlantTable').innerHTML = plants.map(p => {
    const ph = hist.filter(h=>h.planta===p&&h.resultado==='Positivo');
    const total_p = hist.filter(h=>h.planta===p).length;
    const pos_p = ph.length;
    const rate_p = total_p>0?(pos_p/total_p*100).toFixed(1):'0.0';
    const counts = patKeys2.map(k=>ph.filter(h=>h[k]).length);
    const rateColor = parseFloat(rate_p)>=20?'var(--red)':parseFloat(rate_p)>=10?'var(--yellow)':'var(--green)';
    return `<tr>
      <td><span class="badge badge-gray">${p}</span></td>
      ${counts.map(c=>`<td style="text-align:center;font-weight:${c>0?'700':'400'};color:${c>0?'var(--red)':'var(--gray-300)'}">${c||'–'}</td>`).join('')}
      <td style="text-align:center;font-weight:700;color:var(--red)">${pos_p}</td>
      <td style="text-align:center;font-weight:700;color:${rateColor}">${rate_p}%</td>
    </tr>`;
  }).join('');
}

function exportReportPDF() {
  const hist = getFilteredHistory();
  if(!hist.length) { toast('Sin datos para exportar','error'); return; }
  const {jsPDF} = window.jspdf;
  const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'letter'});
  const W=215.9, margin=14, today=new Date().toLocaleDateString('en-US');
  const period = document.getElementById('reportPeriod');
  const periodLabel = period.options[period.selectedIndex].text;
  const plants = ['1945','1935','1931E','1931W'];
  const COL_W = (W - margin*2) / 7; // uniform column width

  // ── Logo + Header ───────────────────────────────────────────────────────
  try { doc.addImage(LOGO,'JPEG',margin,8,28,14); } catch(e){}

  doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.setTextColor(0,0,0);
  doc.text('Reporte de Monitoreo Ambiental',W/2,13,{align:'center'});
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(192,57,43);
  doc.text('CAPUTO FOODS',W/2,19,{align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(100,100,100);
  doc.text('Período: '+periodLabel+'   |   Generado: '+today,W/2,24,{align:'center'});

  // Version info top right
  doc.setFontSize(7.5); doc.setTextColor(100,100,100);
  doc.text('Version: 6 | Revision: 08/30/24',W-margin,10,{align:'right'});

  doc.setDrawColor(192,57,43); doc.setLineWidth(0.5);
  doc.line(margin,27,W-margin,27);
  doc.setDrawColor(0,0,0); doc.setLineWidth(0.2);

  // ── KPI Summary ─────────────────────────────────────────────────────────
  const total=hist.length, pos=hist.filter(h=>h.resultado==='Positivo').length,
        neg=hist.filter(h=>h.resultado==='Negativo').length,
        pend=hist.filter(h=>h.resultado==='Pendiente').length,
        retests=hist.filter(h=>h.retestNum).length,
        resolved=GRV().length;

  const kpiColW = (W-margin*2)/6;
  const kpis = [
    {label:'Total Tests',     value:String(total)},
    {label:'Negativos',       value:String(neg)},
    {label:'Positivos',       value:String(pos)},
    {label:'Pendientes',      value:String(pend)},
    {label:'Tasa Positivos',  value:total>0?(pos/total*100).toFixed(1)+'%':'0%'},
    {label:'Retests',         value:String(retests)},
  ];
  let kx = margin;
  const ky = 30;
  kpis.forEach((k,i) => {
    const isRed = k.label==='Positivos'||k.label==='Tasa Positivos';
    const isGreen = k.label==='Negativos';
    doc.setDrawColor(180,180,180); doc.setLineWidth(0.2);
    doc.rect(kx, ky, kpiColW-1, 18);
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(120,120,120);
    doc.text(k.label, kx+kpiColW/2-0.5, ky+5.5, {align:'center'});
    doc.setFont('helvetica','bold'); doc.setFontSize(14);
    doc.setTextColor(isRed?192:isGreen?5:26, isRed?57:isGreen?150:35, isRed?43:isGreen?105:50);
    doc.text(k.value, kx+kpiColW/2-0.5, ky+14, {align:'center'});
    kx += kpiColW;
  });

  // ── Section title helper ──────────────────────────────────────────────
  const sectionTitle = (title, y) => {
    doc.setFillColor(26,35,50); doc.rect(margin, y, W-margin*2, 7, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(255,255,255);
    doc.text(title, margin+3, y+5);
    return y+7;
  };

  // ── Tests por Edificio ────────────────────────────────────────────────
  const fullW = W-margin*2;
  const bCols = [30,25,25,25,25,25,25]; // 7 cols, total=180 = fullW
  let y = 53;
  y = sectionTitle('Tests por Edificio', y);
  doc.autoTable({
    head:[['Edificio','Total','Positivos','Negativos','Pendientes','Retests','Tasa Falla']],
    body:[...plants.map(p=>{
      const ph=hist.filter(h=>h.planta===p);
      const pp=ph.filter(h=>h.resultado==='Positivo').length;
      return [p,ph.length,pp,ph.filter(h=>h.resultado==='Negativo').length,
              ph.filter(h=>h.resultado==='Pendiente').length,
              ph.filter(h=>h.retestNum).length,
              ph.length>0?(pp/ph.length*100).toFixed(1)+'%':'0%'];
    }),
    ['TOTAL',total,pos,neg,pend,retests,total>0?(pos/total*100).toFixed(1)+'%':'0%']],
    startY:y, margin:{left:margin,right:margin},
    styles:{fontSize:9,cellPadding:3,textColor:[0,0,0],lineColor:[0,0,0],lineWidth:0.2,halign:'center'},
    headStyles:{fillColor:[255,255,255],textColor:[0,0,0],fontStyle:'bold',fontSize:9,lineColor:[0,0,0],lineWidth:0.2},
    columnStyles:{
      0:{cellWidth:bCols[0],halign:'left',fontStyle:'bold'},
      1:{cellWidth:bCols[1]},2:{cellWidth:bCols[2]},3:{cellWidth:bCols[3]},
      4:{cellWidth:bCols[4]},5:{cellWidth:bCols[5]},6:{cellWidth:bCols[6]}
    },
    didParseCell: d=>{
      if(d.row.raw && d.row.raw[0]==='TOTAL'){
        d.cell.styles.fontStyle='bold'; d.cell.styles.fillColor=[245,245,245];
      }
      if(d.column.index===2 && parseFloat(d.cell.raw)>0 && d.row.index>=0){
        d.cell.styles.textColor=[192,57,43]; d.cell.styles.fontStyle='bold';
      }
      if(d.column.index===6 && parseFloat(d.cell.raw)>5 && d.row.index>=0){
        d.cell.styles.textColor=[192,57,43];
      }
    }
  });

  // ── Retests por Edificio ────────────────────────────────────────────
  y = doc.lastAutoTable.finalY+8;
  y = sectionTitle('Retests por Edificio y Patógeno', y);
  const patKeys=['ecoli','listeria','salmonella','saureus'];
  const patNames=['E.Coli','Listeria','Salmonella','S.Aureus'];
  const rCols=[30,28,28,28,28,28,30]; // 7 cols
  doc.autoTable({
    head:[['Edificio','E.Coli +','Listeria +','Salmonella +','S.Aureus +','Total Pos.','Tasa Falla']],
    body:plants.map(p=>{
      const ph=hist.filter(h=>h.planta===p);
      const pos_p=ph.filter(h=>h.resultado==='Positivo');
      const t=ph.length;
      const pp=pos_p.length;
      return [p,...patKeys.map(k=>pos_p.filter(h=>h[k]).length),pp,
              t>0?(pp/t*100).toFixed(1)+'%':'0%'];
    }),
    startY:y, margin:{left:margin,right:margin},
    styles:{fontSize:9,cellPadding:3,textColor:[0,0,0],lineColor:[0,0,0],lineWidth:0.2,halign:'center'},
    headStyles:{fillColor:[255,255,255],textColor:[0,0,0],fontStyle:'bold',fontSize:9,lineColor:[0,0,0],lineWidth:0.2},
    columnStyles:{
      0:{cellWidth:rCols[0],halign:'left',fontStyle:'bold'},
      1:{cellWidth:rCols[1]},2:{cellWidth:rCols[2]},3:{cellWidth:rCols[3]},
      4:{cellWidth:rCols[4]},5:{cellWidth:rCols[5]},6:{cellWidth:rCols[6]}
    },
    didParseCell: d=>{
      if(d.column.index>0 && d.column.index<6 && parseFloat(d.cell.raw)>0 && d.row.index>=0){
        d.cell.styles.textColor=[192,57,43]; d.cell.styles.fontStyle='bold';
      }
    }
  });

  // ── Top 10 failing samples ───────────────────────────────────────────
  y = doc.lastAutoTable.finalY+8;
  y = sectionTitle('Top 10 — Puntos con Más Positivos', y);
  const smap={};
  hist.filter(h=>!h.retestNum).forEach(h=>{
    const k=h.planta+'|'+h.sample;
    if(!smap[k]) smap[k]={sample:h.sample,planta:h.planta,zone:h.zone,area:h.area,location:h.location,total:0,pos:0};
    smap[k].total++; if(h.resultado==='Positivo') smap[k].pos++;
  });
  const top10=Object.values(smap).filter(s=>s.pos>0).sort((a,b)=>b.pos-a.pos).slice(0,10);
  const tCols=[8,14,18,10,38,52,15,15,12]; // 9 cols, total=182
  doc.autoTable({
    head:[['#','Sample','Planta','Zona','Área','Ubicación','Tests','Positivos','Tasa']],
    body:top10.length>0
      ? top10.map((s,i)=>[i+1,s.sample,s.planta,s.zone,
          s.area.length>18?s.area.substring(0,18)+'...':s.area,
          s.location.length>28?s.location.substring(0,28)+'...':s.location,
          s.total,s.pos,s.total>0?(s.pos/s.total*100).toFixed(0)+'%':'0%'])
      : [['—','—','—','—','Sin positivos registrados','—','—','—','—']],
    startY:y, margin:{left:margin,right:margin},
    styles:{fontSize:8,cellPadding:2.8,textColor:[0,0,0],lineColor:[0,0,0],lineWidth:0.2},
    headStyles:{fillColor:[255,255,255],textColor:[0,0,0],fontStyle:'bold',fontSize:8,lineColor:[0,0,0],lineWidth:0.2},
    columnStyles:{
      0:{cellWidth:tCols[0],halign:'center'},
      1:{cellWidth:tCols[1],halign:'center'},
      2:{cellWidth:tCols[2],halign:'center'},
      3:{cellWidth:tCols[3],halign:'center'},
      4:{cellWidth:tCols[4],halign:'left'},
      5:{cellWidth:tCols[5],halign:'left'},
      6:{cellWidth:tCols[6],halign:'center'},
      7:{cellWidth:tCols[7],halign:'center',fontStyle:'bold'},
      8:{cellWidth:tCols[8],halign:'center'},
    },
    didParseCell: d=>{
      if(d.column.index===7 && parseFloat(d.cell.raw)>0 && d.row.index>=0){
        d.cell.styles.textColor=[192,57,43];
      }
      if(d.column.index===8 && parseFloat(d.cell.raw)>=50 && d.row.index>=0){
        d.cell.styles.textColor=[192,57,43]; d.cell.styles.fontStyle='bold';
      }
    }
  });

  // ── Footer ────────────────────────────────────────────────────────────
  const footY = doc.lastAutoTable.finalY+10;
  doc.setDrawColor(192,57,43); doc.setLineWidth(0.4);
  doc.line(margin, footY, W-margin, footY);
  doc.setFont('helvetica','italic'); doc.setFontSize(7.5); doc.setTextColor(140,140,140);
  doc.text('Caputo Foods — Environmental Monitoring Program | SQF 2.4.H | Confidential',W/2,footY+5,{align:'center'});

  doc.save('Caputo_Reporte_'+new Date().toISOString().split('T')[0]+'.pdf');
  toast('✅ Reporte PDF exportado','success');
}

// ═══════════════════════════════════════════════
// SQF COMPLIANCE
// ═══════════════════════════════════════════════
const SQF_MIN_TESTS  = 10;   // min tests per plant per week
const SQF_RETEST_DAYS = 3;   // max business days to start retest after positive
const SQF_ZONES = [2, 3, 4]; // required zones per cycle
const PLANTS = ['1945','1935','1931E','1931W'];

function initSQFYears() {
  const hist = GH();
  const sel = document.getElementById('sqfYear');
  if(!sel) return;
  const years = [...new Set(hist.map(h=>h.fecha.substring(0,4)))].sort().reverse();
  if(!years.length) years.push(new Date().getFullYear().toString());
  sel.innerHTML = '<option value="all">Todo el historial</option>' +
    years.map(y=>`<option value="${y}">${y}</option>`).join('');
}

function getSQFHistory() {
  const year  = document.getElementById('sqfYear').value;
  const plant = document.getElementById('sqfPlant').value;
  let hist = GH().filter(h => !h.retestNum); // only original tests, not retests
  if(year !== 'all')  hist = hist.filter(h => h.fecha.startsWith(year));
  if(plant !== 'all') hist = hist.filter(h => h.planta === plant);
  return hist;
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day===0 ? 6 : day-1));
  return mon.toISOString().split('T')[0];
}

function businessDaysBetween(d1Str, d2Str) {
  const start = new Date(d1Str + 'T12:00:00');
  const end   = new Date(d2Str + 'T12:00:00');
  if(end <= start) return 0;
  let count = 0, cur = new Date(start);
  cur.setDate(cur.getDate()+1);
  while(cur <= end) {
    const day = cur.getDay();
    if(day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate()+1);
  }
  return count;
}

function buildSQF() {
  const allHist = GH();
  const year    = document.getElementById('sqfYear').value;
  const plant   = document.getElementById('sqfPlant').value;

  // Filtered original tests (no retests)
  let hist = allHist.filter(h => !h.retestNum);
  if(year  !== 'all')  hist = hist.filter(h => h.fecha.startsWith(year));
  if(plant !== 'all')  hist = hist.filter(h => h.planta === plant);

  const activePlants = plant === 'all' ? PLANTS : [plant];

  // ── 1. Build week-plant map ──────────────────────────────────────────
  const weekPlantMap = {}; // { weekKey: { plant: [records] } }
  hist.forEach(h => {
    const wk = getWeekKey(h.fecha);
    if(!weekPlantMap[wk]) weekPlantMap[wk] = {};
    if(!weekPlantMap[wk][h.planta]) weekPlantMap[wk][h.planta] = [];
    weekPlantMap[wk][h.planta].push(h);
  });
  const allWeeks = Object.keys(weekPlantMap).sort();

  // ── 2. Calculate compliance per requirement ──────────────────────────
  // REQ A: Min 10 tests per plant per week
  let reqA_total=0, reqA_pass=0;
  const incompleteWeeks = [];
  allWeeks.forEach(wk => {
    activePlants.forEach(p => {
      const recs = weekPlantMap[wk][p] || [];
      if(recs.length === 0) return; // plant didn't sample this week — skip
      reqA_total++;
      const zones = [...new Set(recs.map(r=>r.zone))];
      const missingZones = SQF_ZONES.filter(z => !zones.includes(z));
      if(recs.length >= SQF_MIN_TESTS && missingZones.length===0) {
        reqA_pass++;
      } else {
        incompleteWeeks.push({week:wk, plant:p, count:recs.length, zones, missingZones});
      }
    });
  });

  // REQ B: Zone coverage (all 3 zones in each cycle)
  let reqB_total=0, reqB_pass=0;
  allWeeks.forEach(wk => {
    activePlants.forEach(p => {
      const recs = weekPlantMap[wk][p]||[];
      if(!recs.length) return;
      reqB_total++;
      const zones = [...new Set(recs.map(r=>r.zone))];
      if(SQF_ZONES.every(z=>zones.includes(z))) reqB_pass++;
    });
  });

  // REQ C: Retest started within SQF_RETEST_DAYS business days of positive
  const positives = allHist.filter(h => {
    if(h.retestNum) return false;
    if(h.resultado !== 'Positivo') return false;
    if(year!=='all' && !h.fecha.startsWith(year)) return false;
    if(plant!=='all' && h.planta!==plant) return false;
    return true;
  });
  let reqC_total=0, reqC_pass=0;
  positives.forEach(pos => {
    const retests = allHist.filter(r => r.originalId===pos.id && r.retestNum);
    if(!retests.length) return; // no retests yet
    reqC_total++;
    const firstRetest = retests.sort((a,b)=>a.fecha.localeCompare(b.fecha))[0];
    const days = businessDaysBetween(pos.fecha, firstRetest.fecha);
    if(days <= SQF_RETEST_DAYS) reqC_pass++;
  });

  // REQ D: All positives resolved (retests completed, moved to resolved)
  const resolved = GRV();
  const resolvedIds = new Set(resolved.map(r=>r.originalId));
  const openPositives = positives.filter(p => !resolvedIds.has(p.id));
  const reqD_total = positives.length;
  const reqD_pass  = positives.length - openPositives.length;

  // REQ E: Master coverage — % of active master points tested at least once
  let reqE_total=0, reqE_pass=0;
  activePlants.forEach(p => {
    const masterPoints = getActiveMaster(p);
    const testedSamples = new Set(hist.filter(h=>h.planta===p).map(h=>h.sample));
    reqE_total += masterPoints.length;
    reqE_pass  += masterPoints.filter(mp=>testedSamples.has(mp.sample)).length;
  });

  // ── 3. Overall score ────────────────────────────────────────────────
  const weights = [
    {pass:reqA_pass, total:reqA_total, w:30},
    {pass:reqB_pass, total:reqB_total, w:20},
    {pass:reqC_pass, total:reqC_total, w:20},
    {pass:reqD_pass, total:reqD_total, w:20},
    {pass:reqE_pass, total:reqE_total, w:10},
  ];
  let weightedScore = 0, totalWeight = 0;
  weights.forEach(({pass,total,w}) => {
    if(total>0) { weightedScore += (pass/total)*w; totalWeight+=w; }
  });
  const score = totalWeight>0 ? Math.round(weightedScore/totalWeight*100) : 0;

  // ── 4. Render banner ────────────────────────────────────────────────
  const scoreColor = score>=95?'#059669':score>=80?'#D97706':'#DC2626';
  const scoreBg    = score>=95?'linear-gradient(135deg,#f0fdf4,#dcfce7)':score>=80?'linear-gradient(135deg,#fffbeb,#fef3c7)':'linear-gradient(135deg,#fff5f5,#fee2e2)';
  const statusText = score>=95?'✅ Excelente — Listo para auditoría SQF':score>=80?'⚠️ Aceptable — Revisar incumplimientos antes de auditoría':'❌ Requiere atención urgente';
  document.getElementById('sqfBanner').style.background = scoreBg;
  document.getElementById('sqfScore').style.color = scoreColor;
  document.getElementById('sqfScore').textContent = score+'%';
  document.getElementById('sqfStatus').style.color = scoreColor;
  document.getElementById('sqfStatus').textContent = statusText;

  const miniStats = [
    {label:'Semanas analizadas', value: reqA_total},
    {label:'Positivos en período', value: positives.length},
    {label:'Casos resueltos', value: reqD_pass+'/'+reqD_total},
  ];
  document.getElementById('sqfMiniCards').innerHTML = miniStats.map(s=>`
    <div style="background:rgba(255,255,255,.7);border-radius:8px;padding:12px 16px;text-align:center;min-width:110px">
      <div style="font-size:22px;font-weight:700;color:${scoreColor}">${s.value}</div>
      <div style="font-size:11px;color:var(--gray-500);margin-top:3px">${s.label}</div>
    </div>`).join('');

  // ── 5. Requirements table ────────────────────────────────────────────
  const reqs = [
    { name:'Mín. '+SQF_MIN_TESTS+' tests por planta por semana', ref:'SQF 2.4.H',
      meta:'100% semanas', pass:reqA_pass, total:reqA_total },
    { name:'Cobertura de Zonas 2, 3 y 4 en cada ciclo', ref:'SQF 2.4.H',
      meta:'100% ciclos', pass:reqB_pass, total:reqB_total },
    { name:'Primer retest ≤ '+SQF_RETEST_DAYS+' días hábiles del positivo', ref:'SQF 2.4.H',
      meta:'100% positivos', pass:reqC_pass, total:reqC_total },
    { name:'Resolución de todos los casos positivos', ref:'SQF 2.4.H',
      meta:'0 casos abiertos', pass:reqD_pass, total:reqD_total },
    { name:'Cobertura del MASTER de puntos de muestreo', ref:'SQF 2.4.H',
      meta:'>80% puntos', pass:reqE_pass, total:reqE_total },
  ];
  document.getElementById('sqfReqTable').innerHTML = reqs.map(r => {
    const pct  = r.total>0 ? Math.round(r.pass/r.total*100) : 100;
    const ok   = pct>=95;
    const warn = pct>=80 && pct<95;
    const color= ok?'var(--green)':warn?'var(--yellow)':'var(--red)';
    const icon = ok?'✅':warn?'⚠️':'❌';
    const barW = Math.max(2,pct);
    return `<tr>
      <td>
        <div style="font-weight:600;font-size:13px">${r.name}</div>
        <div style="font-size:11px;color:var(--gray-400)">${r.ref}</div>
      </td>
      <td style="font-size:12px;color:var(--gray-500)">${r.meta}</td>
      <td>
        <div style="font-size:13px;font-weight:600">${r.pass}/${r.total}</div>
        <div style="background:var(--gray-100);border-radius:4px;height:5px;margin-top:4px;overflow:hidden">
          <div style="background:${color};height:5px;width:${barW}%;border-radius:4px;transition:width .4s"></div>
        </div>
      </td>
      <td style="text-align:center;font-weight:700;font-size:15px;color:${color}">${r.total>0?pct+'%':'N/A'}</td>
      <td style="text-align:center;font-size:18px">${r.total>0?icon:'—'}</td>
    </tr>`;
  }).join('');

  // ── 6. Weekly heatmap ───────────────────────────────────────────────
  const displayWeeks = allWeeks.slice(-16);
  let weekHtml = '<table style="width:100%;border-collapse:collapse;font-size:11px">';
  weekHtml += '<tr><th style="padding:5px 8px;text-align:left;color:var(--gray-500)">Planta</th>';
  displayWeeks.forEach(wk => {
    const d = new Date(wk+'T12:00:00');
    weekHtml += `<th style="padding:4px 6px;text-align:center;color:var(--gray-500);font-weight:500;white-space:nowrap">
      ${(d.getMonth()+1)+'/'+d.getDate()}</th>`;
  });
  weekHtml += '</tr>';
  activePlants.forEach(p => {
    weekHtml += `<tr><td style="padding:6px 8px;font-weight:600;white-space:nowrap">${p}</td>`;
    displayWeeks.forEach(wk => {
      const recs = weekPlantMap[wk]?.[p]||[];
      const zones = [...new Set(recs.map(r=>r.zone))];
      const ok  = recs.length>=SQF_MIN_TESTS && SQF_ZONES.every(z=>zones.includes(z));
      const partial = recs.length>0 && !ok;
      const none    = recs.length===0;
      const bg = none?'var(--gray-100)':ok?'rgba(5,150,105,.15)':'rgba(220,38,38,.15)';
      const border = none?'1px solid var(--gray-200)':ok?'1px solid rgba(5,150,105,.3)':'1px solid rgba(220,38,38,.3)';
      const icon = none?'':ok?'✓':recs.length;
      const iconColor = ok?'var(--green)':'var(--red)';
      const title = none?'Sin muestras':`${recs.length} tests · Zonas: ${zones.sort().join(',')}`;
      weekHtml += `<td style="text-align:center;padding:3px">
        <div title="${title}" style="background:${bg};border:${border};border-radius:4px;
             padding:5px 3px;font-size:11px;font-weight:700;color:${iconColor};min-width:28px;cursor:default">
          ${icon}
        </div></td>`;
    });
    weekHtml += '</tr>';
  });
  weekHtml += '</table>';
  weekHtml += '<div style="display:flex;gap:16px;margin-top:10px;font-size:11px;color:var(--gray-500)">';
  weekHtml += '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:2px;background:rgba(5,150,105,.15);border:1px solid rgba(5,150,105,.3)"></span>Completo (≥10 tests, 3 zonas)</span>';
  weekHtml += '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:2px;background:rgba(220,38,38,.15);border:1px solid rgba(220,38,38,.3)"></span>Incompleto</span>';
  weekHtml += '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:2px;background:var(--gray-100);border:1px solid var(--gray-200)"></span>Sin actividad</span>';
  weekHtml += '</div>';
  document.getElementById('sqfWeekTable').innerHTML = weekHtml;

  // ── 7. Zone coverage table ───────────────────────────────────────────
  let zoneHtml = '<table style="width:100%;border-collapse:collapse;font-size:13px">';
  zoneHtml += '<thead><tr><th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--gray-500);border-bottom:1px solid var(--gray-200)">Planta</th>';
  SQF_ZONES.forEach(z => {
    zoneHtml += `<th style="padding:10px 12px;text-align:center;font-size:11px;color:var(--gray-500);border-bottom:1px solid var(--gray-200)">Zona ${z}</th>`;
  });
  zoneHtml += '<th style="padding:10px 12px;text-align:center;font-size:11px;color:var(--gray-500);border-bottom:1px solid var(--gray-200)">Cobertura</th></tr></thead><tbody>';
  activePlants.forEach(p => {
    const ph = hist.filter(h=>h.planta===p);
    const zoneCounts = SQF_ZONES.map(z => ph.filter(h=>h.zone===z).length);
    const total = ph.length;
    const covered = SQF_ZONES.filter((_,i)=>zoneCounts[i]>0).length;
    const pct = SQF_ZONES.length>0?Math.round(covered/SQF_ZONES.length*100):0;
    const ok = pct===100;
    zoneHtml += `<tr style="border-bottom:1px solid var(--gray-100)">
      <td style="padding:10px 12px;font-weight:600">${p}</td>`;
    zoneCounts.forEach((c,i) => {
      const zPct = total>0?Math.round(c/total*100):0;
      zoneHtml += `<td style="text-align:center;padding:10px 12px">
        <div style="font-weight:700;font-size:14px">${c}</div>
        <div style="font-size:10px;color:var(--gray-400)">${zPct}% del total</div>
      </td>`;
    });
    zoneHtml += `<td style="text-align:center;padding:10px 12px">
      <span style="font-weight:700;font-size:13px;color:${ok?'var(--green)':'var(--red)'}">${pct}% ${ok?'✅':'⚠️'}</span>
    </td></tr>`;
  });
  zoneHtml += '</tbody></table>';
  document.getElementById('sqfZoneTable').innerHTML = zoneHtml;

  // ── 8. Incomplete weeks detail ───────────────────────────────────────
  const incTbody = document.getElementById('sqfIncompleteTable');
  if(!incompleteWeeks.length) {
    incTbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--green);padding:20px;font-weight:600">✅ Sin semanas incompletas en el período</td></tr>';
  } else {
    incTbody.innerHTML = incompleteWeeks.sort((a,b)=>b.week.localeCompare(a.week)).map(w => {
      const d = new Date(w.week+'T12:00:00');
      const weekLabel = 'Sem '+( d.getMonth()+1)+'/'+d.getDate()+'/'+d.getFullYear().toString().slice(2);
      const missing = SQF_MIN_TESTS - w.count;
      const obs = [];
      if(w.count < SQF_MIN_TESTS) obs.push('Faltan '+missing+' tests');
      if(w.missingZones.length) obs.push('Sin Zona '+w.missingZones.join(', '));
      return `<tr style="background:#fffbeb">
        <td style="font-weight:600">${weekLabel}</td>
        <td><span class="badge badge-gray">${w.plant}</span></td>
        <td style="text-align:center;font-weight:700;color:${w.count<SQF_MIN_TESTS?'var(--red)':'var(--green)'}">${w.count}</td>
        <td style="text-align:center;color:var(--gray-500)">${SQF_MIN_TESTS}</td>
        <td style="text-align:center;font-weight:700;color:var(--red)">${Math.max(0,missing)}</td>
        <td style="text-align:center">${w.zones.sort().map(z=>'<span style="background:var(--gray-100);padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600;margin:1px">Z'+z+'</span>').join('')}</td>
        <td style="font-size:12px;color:var(--yellow);font-weight:600">${obs.join(' · ')}</td>
      </tr>`;
    }).join('');
  }

  // ── 9. Open positives ────────────────────────────────────────────────
  const opTbody = document.getElementById('sqfOpenPositives');
  if(!openPositives.length) {
    opTbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--green);padding:20px;font-weight:600">✅ Sin positivos pendientes de resolución</td></tr>';
  } else {
    const today = new Date();
    opTbody.innerHTML = openPositives.map(p => {
      const retests = allHist.filter(r=>r.originalId===p.id&&r.retestNum);
      const posDate = new Date(p.fecha+'T12:00:00');
      const daysOpen = Math.round((today-posDate)/(1000*60*60*24));
      const urgentColor = daysOpen>14?'var(--red)':daysOpen>7?'var(--yellow)':'var(--gray-700)';
      return `<tr style="background:#fff5f5">
        <td style="font-weight:700;color:var(--red)">${p.sample}</td>
        <td><span class="badge badge-gray">${p.planta}</span></td>
        <td style="font-size:12px">${p.fecha}</td>
        <td style="font-size:12px;color:var(--red);font-weight:600">${esc(p.failedPathogensLabel||p.labNotes||'—')}</td>
        <td style="text-align:center">${retests.length}/3</td>
        <td style="text-align:center;font-weight:700;color:${urgentColor}">${daysOpen} días</td>
        <td><span style="font-size:12px;font-weight:600;color:${urgentColor}">${daysOpen>14?'🔴 Urgente':daysOpen>7?'🟡 En seguimiento':'🟠 Reciente'}</span></td>
      </tr>`;
    }).join('');
  }
}

// ── PDF Export SQF ────────────────────────────
function exportSQFPDF() {
  const hist = GH().filter(h=>!h.retestNum);
  const year  = document.getElementById('sqfYear').value;
  const plant = document.getElementById('sqfPlant').value;
  const score = document.getElementById('sqfScore').textContent;
  const status = document.getElementById('sqfStatus').textContent;
  const period = year==='all'?'Todo el historial':year;
  const plantLabel = plant==='all'?'Todas las plantas':plant;

  const {jsPDF} = window.jspdf;
  const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'letter'});
  const W=215.9, M=14, today=new Date().toLocaleDateString('en-US');

  // Header
  try { doc.addImage(LOGO,'JPEG',M,8,28,14); } catch(e){}
  doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(0,0,0);
  doc.text('Reporte de Cumplimiento SQF',W/2,13,{align:'center'});
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(192,57,43);
  doc.text('CAPUTO FOODS — Environmental Monitoring Program',W/2,19,{align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(100,100,100);
  doc.text(`Período: ${period}  |  Planta: ${plantLabel}  |  Generado: ${today}`,W/2,24,{align:'center'});
  doc.setDrawColor(192,57,43); doc.setLineWidth(0.5); doc.line(M,27,W-M,27);

  // Score box
  const scoreNum = parseInt(score);
  const boxColor = scoreNum>=95?[5,150,105]:scoreNum>=80?[217,119,6]:[220,38,38];
  doc.setFillColor(...boxColor);
  doc.roundedRect(M,30,W-M*2,22,3,3,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(28); doc.setTextColor(255,255,255);
  doc.text(score,M+10,47);
  doc.setFontSize(10);
  doc.text('CUMPLIMIENTO GENERAL DEL PROGRAMA',M+35,38);
  doc.setFont('helvetica','normal'); doc.setFontSize(9);
  doc.text(status.replace(/[✅⚠️❌]/g,'').trim(),M+35,45);
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
  doc.text('Referencia: SQF 11th Edition § 2.4.H',W-M,50,{align:'right'});

  // Requirements table
  let y = 58;
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(0,0,0);
  doc.text('Requisitos del Programa — Evaluación',M,y); y+=4;
  const colW = [82,28,22,20,20];
  doc.autoTable({
    head:[['Requisito SQF','Meta','Logrado','Resultado','Estado']],
    body:[
      [`Mín. ${SQF_MIN_TESTS} tests por planta por semana`,'100%','—','—','—'],
      ['Cobertura Zonas 2, 3 y 4 por ciclo','100%','—','—','—'],
      [`Primer retest ≤ ${SQF_RETEST_DAYS} días hábiles del positivo`,'100%','—','—','—'],
      ['Resolución de todos los positivos','0 abiertos','—','—','—'],
      ['Cobertura del MASTER de puntos','>80%','—','—','—'],
    ],
    startY:y, margin:{left:M,right:M},
    styles:{fontSize:9,cellPadding:3,textColor:[0,0,0],lineColor:[0,0,0],lineWidth:0.2},
    headStyles:{fillColor:[26,35,50],textColor:[255,255,255],fontStyle:'bold',fontSize:9},
    columnStyles:{
      0:{cellWidth:colW[0]},1:{cellWidth:colW[1],halign:'center'},
      2:{cellWidth:colW[2],halign:'center'},3:{cellWidth:colW[3],halign:'center'},
      4:{cellWidth:colW[4],halign:'center'}
    },
    didDrawCell: d => {
      // Fill live data from DOM
      const rows = document.querySelectorAll('#sqfReqTable tr');
      if(d.row.index>=0 && d.row.index<rows.length && d.column.index>=2) {
        const cells = rows[d.row.index].querySelectorAll('td');
        if(d.column.index===2 && cells[2]) {
          const txt = cells[2].querySelector('div').textContent.trim();
          doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(0,0,0);
          doc.text(txt,d.cell.x+d.cell.width/2,d.cell.y+d.cell.height/2+3,{align:'center'});
        }
        if(d.column.index===3 && cells[3]) {
          const pct = cells[3].textContent.trim();
          const num = parseInt(pct);
          const c = num>=95?[5,150,105]:num>=80?[217,119,6]:[220,38,38];
          doc.setFont('helvetica','bold'); doc.setFontSize(10);
          doc.setTextColor(...c);
          doc.text(pct,d.cell.x+d.cell.width/2,d.cell.y+d.cell.height/2+3,{align:'center'});
        }
        if(d.column.index===4 && cells[4]) {
          const icon = cells[4].textContent.trim();
          doc.setFontSize(11);
          doc.text(icon,d.cell.x+d.cell.width/2,d.cell.y+d.cell.height/2+3,{align:'center'});
        }
      }
    }
  });

  // Signature block
  const footY = doc.lastAutoTable.finalY + 12;
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(0,0,0);
  doc.text('Aprobado por / Approved By:', M, footY);
  doc.setLineWidth(0.2);
  doc.line(M+55, footY, M+130, footY);
  doc.text('Cargo / Title:', M, footY+8);
  doc.line(M+30, footY+8, M+130, footY+8);
  doc.text('Fecha / Date:', M, footY+16);
  doc.line(M+30, footY+16, M+80, footY+16);
  doc.text('Firma / Signature:', W-M-70, footY);
  doc.line(W-M-40, footY, W-M, footY);

  // Footer
  doc.setDrawColor(192,57,43); doc.setLineWidth(0.4);
  doc.line(M, footY+24, W-M, footY+24);
  doc.setFont('helvetica','italic'); doc.setFontSize(7.5); doc.setTextColor(140,140,140);
  doc.text('Caputo Foods | Environmental Monitoring Program | SQF 2.4.H | Confidential — Internal Use Only',W/2,footY+29,{align:'center'});

  doc.save('Caputo_SQF_Compliance_'+new Date().toISOString().split('T')[0]+'.pdf');
  toast('✅ Reporte de Cumplimiento SQF exportado','success');
}

// ═══════════════════════════════════════════════
// SQF COMPLIANCE
// ═══════════════════════════════════════════════

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

  const allWeeks = Object.values(weekMap).filter(w => plants.includes(w.plant));
  const totalWeeks = allWeeks.length;
  const compliantFreq = allWeeks.filter(w => w.count >= minTests).length;
  const compliantZone2 = allWeeks.filter(w => w.zones.has(2)).length;
  const compliantZone3 = allWeeks.filter(w => w.zones.has(3)).length;
  const compliantZone4 = allWeeks.filter(w => w.zones.has(4)).length;

  // ── 2. Retest response time ────────────────────────────────────────────
  const positives = hist.filter(h => h.resultado==='Positivo' && !h.retestNum);
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
  const scoreLabel = overall>=90?'EXCELENTE':overall>=75?'ACEPTABLE':'REQUIERE ATENCIÓN';
  document.getElementById('sqfSummaryTitle').textContent =
    'Cumplimiento SQF '+year+' — '+scoreLabel;
  document.getElementById('sqfSummaryDesc').textContent =
    'Edificio'+(plant==='all'?'s: Todos':': '+plant)+
    ' | Evaluado: '+totalWeeks+' semanas'+
    ' | '+hist.filter(h=>!h.retestNum).length+' tests registrados';

  // Quick stats
  document.getElementById('sqfQuickStats').innerHTML = [
    {v:hist.filter(h=>!h.retestNum).length, l:'Tests totales', c:'var(--navy)'},
    {v:positives.length, l:'Positivos', c:'var(--red)'},
    {v:openPositives.length, l:'Sin resolver', c:openPositives.length>0?'var(--red)':'var(--green)'},
    {v:coverageRate+'%', l:'Cobertura MASTER', c:coverageRate>=80?'var(--green)':'var(--yellow)'},
  ].map(s=>`
    <div style="text-align:center;min-width:80px">
      <div style="font-size:22px;font-weight:700;color:${s.c}">${s.v}</div>
      <div style="font-size:11px;color:var(--gray-500)">${s.l}</div>
    </div>`).join('');

  // ── Requirements table ────────────────────────────────────────────────
  const pct = (n,d) => d>0 ? Math.round(n/d*100) : 100;
  const pill = (val, good=90, warn=75) => {
    const c = val>=good?'var(--green)':val>=warn?'var(--yellow)':'var(--red)';
    const ic = val>=good?'✅':val>=warn?'⚠️':'❌';
    return {c, ic, val};
  };

  const reqs = [
    { req:'Frecuencia de muestreo', desc:`Mínimo ${minTests} tests por planta/semana`,
      meta:totalWeeks+' semanas', logrado:compliantFreq+' semanas',
      ...pill(pct(compliantFreq,totalWeeks)) },
    { req:'Cobertura Zona 2', desc:'Al menos 1 punto de Zona 2 por semana',
      meta:'100%', logrado:pct(compliantZone2,totalWeeks)+'%',
      ...pill(pct(compliantZone2,totalWeeks)) },
    { req:'Cobertura Zona 3', desc:'Al menos 1 punto de Zona 3 por semana',
      meta:'100%', logrado:pct(compliantZone3,totalWeeks)+'%',
      ...pill(pct(compliantZone3,totalWeeks)) },
    { req:'Cobertura Zona 4', desc:'Al menos 1 punto de Zona 4 por semana',
      meta:'100%', logrado:pct(compliantZone4,totalWeeks)+'%',
      ...pill(pct(compliantZone4,totalWeeks)) },
    { req:'Respuesta a positivos', desc:'Retest #1 iniciado en ≤ 7 días del positivo',
      meta:'100%', logrado:positives.length>0?pct(retestOnTime,positives.length)+'%':'N/A',
      ...pill(positives.length>0?pct(retestOnTime,positives.length):100) },
    { req:'Resolución de positivos', desc:'Todos los positivos con retests completados',
      meta:'100%', logrado:resolutionRate+'%',
      ...pill(resolutionRate) },
    { req:'Cobertura del MASTER', desc:'Puntos de muestreo testeados en el período',
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
  const badWeeks = allWeeks.filter(w=>w.count<minTests)
    .sort((a,b)=>a.week.localeCompare(b.week));
  const wkEl = document.getElementById('sqfWeekIssues');
  if(!badWeeks.length) {
    wkEl.innerHTML='<span style="color:var(--green);font-weight:600">✅ Todas las semanas cumplieron la frecuencia mínima</span>';
  } else {
    wkEl.innerHTML='<div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto">'+
      badWeeks.map(w=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;
             background:var(--red-light);border-radius:6px;font-size:12px">
          <span style="font-weight:600">${w.plant}</span>
          <span style="color:var(--gray-500)">${new Date(w.week+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
          <span style="color:var(--red);font-weight:700">${w.count}/${minTests} tests</span>
        </div>`).join('')+
      '</div>';
  }

  // ── Open positives ────────────────────────────────────────────────────
  const opEl = document.getElementById('sqfOpenPositives');
  if(!openPositives.length) {
    opEl.innerHTML='<span style="color:var(--green);font-weight:600">✅ Todos los positivos han sido resueltos</span>';
  } else {
    opEl.innerHTML='<div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto">'+
      openPositives.map(p=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;
             background:var(--red-light);border-radius:6px;font-size:12px">
          <span style="font-weight:700;color:var(--red)">Sample #${p.sample}</span>
          <span class="badge badge-gray">${p.planta}</span>
          <span style="color:var(--gray-500)">${p.fecha}</span>
          <span style="color:var(--red);font-size:11px">${p.failedPathogensLabel||'Positivo'}</span>
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
          <span style="font-size:13px;font-weight:700">Planta ${p}</span>
          <span style="font-size:13px;font-weight:700;color:${barColor}">${rate}%</span>
        </div>
        <div style="background:var(--gray-200);border-radius:4px;height:8px;overflow:hidden;margin-bottom:6px">
          <div style="background:${barColor};height:8px;width:${rate}%;border-radius:4px;transition:width .4s"></div>
        </div>
        <div style="font-size:11px;color:var(--gray-500)">${tested} de ${master.length} puntos testeados</div>
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
  doc.text('Reporte de Cumplimiento SQF',W/2,13,{align:'center'});
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(192,57,43);
  doc.text('CAPUTO FOODS',W/2,19,{align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(100,100,100);
  doc.text('Año: '+year+' | Edificio: '+(plant==='all'?'Todos':plant)+' | Generado: '+today,W/2,24.5,{align:'center'});
  doc.setDrawColor(192,57,43); doc.setLineWidth(0.5); doc.line(M,28,W-M,28);

  // ── Score box ──────────────────────────────────────────────────────
  const scoreEl = document.getElementById('sqfScoreNum');
  const overall = scoreEl ? parseInt(scoreEl.textContent) : 0;
  const scoreColor = overall>=90?[5,150,105]:overall>=75?[217,119,6]:[192,57,43];
  doc.setFillColor(...scoreColor); doc.setDrawColor(...scoreColor); doc.setLineWidth(0.5);
  doc.roundedRect(M,31,40,20,3,3,'FD');
  doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(255,255,255);
  doc.text(overall+'%',M+20,42,{align:'center'});
  doc.setFontSize(8); doc.text('CUMPLIMIENTO',M+20,47,{align:'center'});
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(0,0,0);
  const label = overall>=90?'EXCELENTE':overall>=75?'ACEPTABLE':'REQUIERE ATENCIÓN';
  doc.text(label,M+48,38);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(100,100,100);
  const hist = GH().filter(h=>h.fecha.startsWith(year)&&(plant==='all'||h.planta===plant));
  doc.text('Tests registrados: '+hist.filter(h=>!h.retestNum).length+
           '  |  Positivos: '+hist.filter(h=>h.resultado==='Positivo'&&!h.retestNum).length,M+48,44);
  doc.text('Período evaluado: 01/01/'+year+' — 12/31/'+year,M+48,50);

  // ── Requirements table ─────────────────────────────────────────────
  const sectionTitle = (t,y) => {
    doc.setFillColor(26,35,50); doc.rect(M,y,W-M*2,7,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(255,255,255);
    doc.text(t,M+3,y+5); return y+7;
  };

  let y = 56;
  y = sectionTitle('Requisitos SQF — Detalle de Cumplimiento',y);

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
    head:[['Requisito','Meta','Logrado','Cumplimiento','Estado']],
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
  y = sectionTitle('Cobertura del MASTER por Edificio',y);
  const plants2 = plant==='all'?['1945','1935','1931E','1931W']:[plant];
  const testedSet = new Set(hist.filter(h=>!h.retestNum).map(h=>h.planta+'|'+h.sample));
  doc.autoTable({
    head:[['Edificio','Total Puntos MASTER','Puntos Testeados','Puntos Sin Testear','Cobertura']],
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
  const badWks=Object.values(weekMap2).filter(w=>w.count<minT&&plants2.includes(w.plant)).sort((a,b)=>a.week.localeCompare(b.week));

  if(badWks.length>0){
    y=doc.lastAutoTable.finalY+8;
    y=sectionTitle('Semanas con Frecuencia Insuficiente (< '+minT+' tests)',y);
    doc.autoTable({
      head:[['Edificio','Semana del','Tests','Faltaron','% Cumplido']],
      body:badWks.map(w=>[w.plant,new Date(w.week+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),w.count,minT-w.count,Math.round(w.count/minT*100)+'%']),
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
    doc.text('Pág. '+i+' de '+pages,W-M,fY,{align:'right'});
  }

  doc.save('Caputo_SQF_Cumplimiento_'+year+'_'+new Date().toISOString().split('T')[0]+'.pdf');
  toast('✅ Reporte SQF exportado','success');
}