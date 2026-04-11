// ═══════════════════════════════════════════════
// PDF — MAIN WEEKLY FORM
// ═══════════════════════════════════════════════
function pdfHeader(doc,planta,sqf,W,margin) {
  try{doc.addImage(LOGO,'JPEG',margin,5,34,17);}catch(e){}
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(0,0,0);
  doc.text('SQF # '+sqf+': '+planta+' Sample Collection Form',W/2,10,{align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(0,0,0);
  doc.text('1945 N 15th Ave, Melrose Park, IL, 60160',W/2,15,{align:'center'});
  doc.setFontSize(7.5);
  doc.text('Version: 6',W-margin,8,{align:'right'});
  doc.text('Revision: 08/30/24',W-margin,12,{align:'right'});
  doc.text('Supersedes: 09/07/23',W-margin,16,{align:'right'});
  doc.setDrawColor(0,0,0); doc.setLineWidth(0.3); doc.line(margin,24,W-margin,24);
}

function pdfMainTable(doc,rows,startY,W,margin) {
  doc.autoTable({
    head:[['Sample #','Zone','Area','Line','Location','E. Coli','Listeria','Salmonella','S. Aureus']],
    body:rows, startY, margin:{left:margin,right:margin},
    styles:{font:'helvetica',fontSize:7.5,cellPadding:2,textColor:[0,0,0],lineColor:[0,0,0],lineWidth:0.2},headStyles:{fillColor:[255,255,255],textColor:[0,0,0],fontStyle:'bold',halign:'center',fontSize:7.5,lineColor:[0,0,0],lineWidth:0.2},
    columnStyles:{0:{halign:'center',cellWidth:18},1:{halign:'center',cellWidth:12},2:{cellWidth:50,halign:'left'},3:{halign:'center',cellWidth:22},4:{cellWidth:87,halign:'left'},5:{halign:'center',cellWidth:17},6:{halign:'center',cellWidth:17},7:{halign:'center',cellWidth:19},8:{halign:'center',cellWidth:17}}
  });
}

function pdfDocControl(doc,startY,margin) {
  doc.autoTable({
    head:[['Document Control','','']],
    body:[['Version','Date','Action Taken'],...DOC_CONTROL.map(r=>[String(r[0]),r[1],r[2]])],
    startY, margin:{left:margin,right:margin},
    styles:{fontSize:6.8,cellPadding:1.8,textColor:[0,0,0],lineColor:[0,0,0],lineWidth:0.2},headStyles:{fillColor:[255,255,255],textColor:[0,0,0],fontStyle:'bold',halign:'center',fontSize:6.8},
    columnStyles:{0:{cellWidth:22,halign:'center'},1:{cellWidth:30,halign:'center'},2:{halign:'left'}}
  });
}

function pdfFooter(doc,W,margin) {
  const y = doc.lastAutoTable.finalY+6;
  doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(0,0,0);
  doc.text('Approved By:',margin+2,y); doc.setLineWidth(0.2);
  doc.line(margin+28,y,margin+90,y);
  doc.text('Date:',margin+2,y+5); doc.line(margin+16,y+5,margin+90,y+5);
  doc.text('Confidential',W-margin,y+5,{align:'right'});
}

function exportPDF() {
  if(!TESTS.length) { toast('Genera tests primero','error'); return; }
  const planta = document.getElementById('genPlanta').value;
  const fecha  = document.getElementById('genDate').value;
  const by     = document.getElementById('genCollectedBy').value;
  const sqf    = SQF_NUMS[planta]||'2.4.H';
  const {jsPDF} = window.jspdf;
  const doc = new jsPDF({orientation:'landscape',unit:'mm',format:'letter'});
  const W=279.4, margin=10;
  pdfHeader(doc,planta,sqf,W,margin);
  const dateStr = fecha ? new Date(fecha+'T12:00:00').toLocaleDateString('en-US') : '';
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(0,0,0);
  doc.text(planta+' Sample Collection Form',W/2,29,{align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.text('Date Sampled: '+dateStr+' ('+planta+')',margin+2,34);
  const rows = TESTS.map(t=>[String(t.sample),String(t.zone),t.area,String(t.line),t.location,t.ecoli?'X':'',t.listeria?'X':'',t.salmonella?'X':'',t.saureus?'X':'']);
  pdfMainTable(doc,rows,37,W,margin);
  const fy = doc.lastAutoTable.finalY+5;
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(0,0,0);
  doc.text('Samples Collected By/Date:',margin+2,fy);
  doc.setFont('helvetica','normal');
  doc.text('  '+by+' / '+dateStr, margin+2+doc.getTextWidth('Samples Collected By/Date:'),fy);
  pdfDocControl(doc,fy+6,margin);
  pdfFooter(doc,W,margin);
  doc.save('ENV_MONITORING_'+planta+'_'+(fecha||'').replace(/-/g,'')+'.pdf');
  toast('✅ PDF exportado','success');
}

// ═══════════════════════════════════════════════
// PDF — RETEST FORM
// ═══════════════════════════════════════════════
function exportRetestPDF(id) {
  const hist = GH();
  const h = hist.find(r => r.id===id);
  if(!h) return;

  // Get the original positive record
  const orig = h.originalId ? hist.find(r => r.id===h.originalId) : null;

  // Retest number from the retest record itself
  const rnStr = h.retestNum ? h.retestNum.replace('Retest #','').trim() : '1';
  const rn = parseInt(rnStr) || 1;

  // Key dates and info
  const retestDate  = new Date(h.fecha+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const origDate    = orig ? new Date(orig.fecha+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) : h.fecha;
  const failedBact  = orig ? (orig.failedPathogensLabel || '—') : (h.failedPathogensLabel || '—');
  const sqf         = SQF_NUMS[h.planta]||'2.4.H';

  const {jsPDF} = window.jspdf;
  const doc = new jsPDF({orientation:'landscape',unit:'mm',format:'letter'});
  const W=279.4, M=10;

  // ── Header ────────────────────────────────────────────────────────────
  pdfHeader(doc, h.planta, sqf, W, M);

  // ── Sub-header: Retest title ──────────────────────────────────────────
  const y = 32.5;
  doc.setFillColor(247,249,252);
  doc.rect(0,y,W,22,'F');
  doc.setDrawColor(215,222,232); doc.setLineWidth(0.3);
  doc.line(0,y+22,W,y+22);

  // Red badge with retest number
  doc.setFillColor(192,57,43);
  doc.roundedRect(M,y+3,36,9,2,2,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(255,255,255);
  doc.text('RETEST #'+rn, M+18, y+9, {align:'center'});

  // Title
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(26,35,50);
  doc.text('Environmental Monitoring — Retest Collection Form', M+40, y+8);

  // Original positive info row
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(130,140,155);
  doc.text('Original positive:', M+40, y+14.5);
  doc.setFont('helvetica','bold'); doc.setTextColor(192,57,43);
  doc.text(origDate+'  |  Failed: '+failedBact, M+40+doc.getTextWidth('Original positive: '), y+14.5);

  // Retest date (right side)
  doc.setFont('helvetica','normal'); doc.setTextColor(120,130,145);
  doc.text('Retest date:', W-M-90, y+8);
  doc.setFont('helvetica','bold'); doc.setTextColor(26,35,50);
  doc.text(retestDate, W-M-90+doc.getTextWidth('Retest date: '), y+8);
  doc.setFont('helvetica','normal'); doc.setTextColor(120,130,145);
  doc.text('Collected by:', W-M-90, y+14.5);
  doc.setFont('helvetica','bold'); doc.setTextColor(26,35,50);
  doc.text('_______________________', W-M-90+doc.getTextWidth('Collected by: '), y+14.5);

  // ── Table ─────────────────────────────────────────────────────────────
  const rows = [[String(h.sample),String(h.zone),h.area,String(h.line||'N/A'),h.location,
    h.ecoli?'X':'', h.listeria?'X':'', h.salmonella?'X':'', h.saureus?'X':'']];
  pdfMainTable(doc, rows, 57, W, M);

  // ── Failed pathogen alert box ─────────────────────────────────────────
  const tableEnd = doc.lastAutoTable.finalY + 4;
  doc.setFillColor(253,235,235);
  doc.setDrawColor(192,57,43); doc.setLineWidth(0.4);
  doc.roundedRect(M, tableEnd, W-M*2, 10, 1.5, 1.5, 'FD');
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(192,57,43);
  doc.text('⚠  This retest is required because Sample #'+h.sample+' tested POSITIVE for: '+failedBact+' on '+origDate, M+5, tableEnd+6.5);

  // ── Doc control + footer ──────────────────────────────────────────────
  pdfDocControl(doc, tableEnd+14, M);
  pdfFooter(doc, W, M);

  doc.save('Caputo_RETEST'+rn+'_'+h.planta+'_S'+h.sample+'_'+h.fecha+'.pdf');
  toast('✅ Retest #'+rn+' PDF exported for Sample #'+h.sample,'success');
}

// ═══════════════════════════════════════════════
// PDF — HISTORY EXPORT
// ═══════════════════════════════════════════════
function exportHistoryPDF() {
  let hist = GH();
  hist = hist.filter(h => {
    const p=document.getElementById('fPlanta').value, s=document.getElementById('fSample').value.trim(),
          d=document.getElementById('fDesde').value,  u=document.getElementById('fHasta').value,
          r=document.getElementById('fResult').value;
    return (!p||h.planta===p) && (!s||String(h.sample).includes(s)) &&
           (!d||h.fecha>=d) && (!u||h.fecha<=u) && (!r||h.resultado===r);
  });
  hist.sort((a,b)=>b.fecha.localeCompare(a.fecha));
  if(!hist.length) { toast('No hay datos para exportar','error'); return; }
  const {jsPDF} = window.jspdf;
  const doc = new jsPDF({orientation:'landscape',unit:'mm',format:'letter'});
  const W=279.4;
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(0,0,0);
  doc.text('CAPUTO FOODS — Historial de Tests Ambientales',W/2,13,{align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.text('Generado: '+new Date().toLocaleDateString('en-US'),W/2,19,{align:'center'});
  doc.autoTable({
    head:[['Fecha','Edificio','Sample#','Zona','Área','Ubicación','E.C','List','Salm','S.A','Resultado','Retest']],
    body:hist.map(h=>[h.fecha,h.planta,h.sample,h.zone,h.area.substring(0,25),h.location.substring(0,35),h.ecoli?'X':'',h.listeria?'X':'',h.salmonella?'X':'',h.saureus?'X':'',h.resultado,h.retestNum||'']),
    startY:23, margin:{left:8,right:8},
    styles:{fontSize:7,cellPadding:2,textColor:[0,0,0],lineColor:[0,0,0],lineWidth:0.15},
    headStyles:{fillColor:[255,255,255],textColor:[0,0,0],fontStyle:'bold',fontSize:7,lineColor:[0,0,0],lineWidth:0.15},
    columnStyles:{0:{cellWidth:20},1:{cellWidth:17},2:{cellWidth:15,halign:'center'},3:{cellWidth:10,halign:'center'},4:{cellWidth:38},5:{cellWidth:55},6:{cellWidth:9,halign:'center'},7:{cellWidth:9,halign:'center'},8:{cellWidth:10,halign:'center'},9:{cellWidth:9,halign:'center'},10:{cellWidth:22},11:{cellWidth:18}}
  });
  doc.save('Caputo_Historial_'+new Date().toISOString().split('T')[0]+'.pdf');
  toast('✅ PDF exportado','success');
}