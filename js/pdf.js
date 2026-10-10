// ═══════════════════════════════════════════════
// Printed forms are flat: white, grays and black text only —
// the Caputo logo is the one exception and keeps its colors.
// ═══════════════════════════════════════════════
function pdfLogo() { return LOGO; }

// ═══════════════════════════════════════════════
// PDF — MAIN WEEKLY FORM
// ═══════════════════════════════════════════════
function pdfHeader(doc,planta,sqf,W,margin) {
  try{doc.addImage(pdfLogo(),'JPEG',margin,5,34,17);}catch(e){}
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
  if(!TESTS.length) { toast('Generate tests first','error'); return; }
  const planta = document.getElementById('genPlant').value;
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
  const pdfName = namePdfGenerator(planta, fecha);
  doc.save(pdfName + '.pdf');
  syncSafe(() => savePdfToSharePoint(pdfName, doc), 'save generator pdf');
  toast('✅ PDF exported','success');
  document.getElementById('btnPDF')?.classList.add('done');
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

  // Retest / vector number from the record itself ("Retest #2" / "Vector #2" → 2)
  const rn = parseInt(String(h.retestNum || '').replace(/\D/g, ''), 10) || 1;
  const kind = (typeof labKindOf === 'function') ? labKindOf(h) : 'Retest';   // 'Retest' | 'Vector'

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
  doc.setDrawColor(190,190,190); doc.setLineWidth(0.3);
  doc.line(M,y+20,W-M,y+20);

  // Retest / vector number — plain text
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(0,0,0);
  doc.text(kind.toUpperCase()+' #'+rn, M, y+8);

  // Title
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(0,0,0);
  doc.text('Environmental Monitoring — '+(kind==='Vector'?'Vector Sampling':'Retest')+' Collection Form', M+40, y+8);

  // Original positive info row
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(110,110,110);
  doc.text('Original positive:', M+40, y+14.5);
  doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
  doc.text(origDate+'  |  Failed: '+failedBact, M+40+doc.getTextWidth('Original positive: '), y+14.5);

  // Retest date (right side)
  doc.setFont('helvetica','normal'); doc.setTextColor(110,110,110);
  doc.text(kind+' date:', W-M-90, y+8);
  doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
  doc.text(retestDate, W-M-90+doc.getTextWidth(kind+' date: '), y+8);
  doc.setFont('helvetica','normal'); doc.setTextColor(110,110,110);
  doc.text('Collected by:', W-M-90, y+14.5);
  doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
  doc.text('_______________________', W-M-90+doc.getTextWidth('Collected by: '), y+14.5);

  // ── Table ─────────────────────────────────────────────────────────────
  const rows = [[String(h.sample),String(h.zone),h.area,String(h.line||'N/A'),h.location,
    h.ecoli?'X':'', h.listeria?'X':'', h.salmonella?'X':'', h.saureus?'X':'']];
  pdfMainTable(doc, rows, 57, W, M);

  // ── Doc control + footer ──────────────────────────────────────────────
  const tableEnd = doc.lastAutoTable.finalY + 4;
  pdfDocControl(doc, tableEnd+4, M);
  pdfFooter(doc, W, M);

  const pdfName = namePdfRetest(h.planta, h.fecha, h.sample, rn, kind);
  doc.save(pdfName + '.pdf');
  syncSafe(() => savePdfToSharePoint(pdfName, doc), 'save retest pdf');
  toast('✅ '+kind+' #'+rn+' PDF exported for Sample #'+(h.sample||h.location),'success');
}

// ═══════════════════════════════════════════════
// PDF — HISTORY EXPORT
// ═══════════════════════════════════════════════
function exportHistoryPDF() {
  const f = id => (document.getElementById(id) || {}).value || '';
  const p = f('fPlant'), smp = f('fSample').trim(), d = f('fFrom'), u = f('fTo'), r = f('fResult');
  const hist = GH().filter(h =>
    (!p || h.planta === p) && (!smp || String(h.sample).includes(smp)) &&
    (!d || h.fecha >= d) && (!u || h.fecha <= u) && (!r || h.resultado === r))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || String(a.planta).localeCompare(String(b.planta)) || (a.sample || 0) - (b.sample || 0));
  if (!hist.length) { toast('No data to export', 'error'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const W = 279.4, PH = doc.internal.pageSize.getHeight(), M = 10;
  const INK = [0, 0, 0], MUT = [110, 110, 110], LINE = [200, 200, 200], HEAD = [242, 242, 242];
  const fmt = iso => { const x = new Date(iso + 'T12:00:00'); return isNaN(x) ? (iso || '') : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  const now = new Date();
  const stamp = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const who = (typeof CU !== 'undefined' && CU && (CU.displayName || CU.email)) || '';

  // ── Header ──
  try { doc.addImage(pdfLogo(), 'JPEG', M, 7, 30, 15); } catch (e) {}
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...INK);
  doc.text('Environmental Test History', M + 36, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUT);
  doc.text('Caputo Foods - Environmental Monitoring Program (SQF 2.4.H)', M + 36, 19.5);
  doc.setFontSize(8);
  doc.text('Generated ' + stamp, W - M, 13, { align: 'right' });
  if (who) doc.text('by ' + who, W - M, 17.5, { align: 'right' });
  doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.line(M, 25, W - M, 25);

  // ── Filters + summary ──
  const period = d || u ? (d ? fmt(d) : 'Start') + ' - ' + (u ? fmt(u) : 'Today') : 'All dates';
  const filters = [['Building', p || 'All'], ['Sample', smp || 'All'], ['Period', period], ['Result', r || 'All']];
  let x = M;
  doc.setFontSize(8);
  filters.forEach(([k, v]) => {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUT); doc.text(k + ':', x, 31);
    const kw = doc.getTextWidth(k + ': ');
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK); doc.text(v, x + kw, 31);
    x += kw + doc.getTextWidth(v) + 9;
  });
  const cnt = k => hist.filter(h => h.resultado === k).length;
  const stats = [['Records', hist.length], ['Negative', cnt('Negative')], ['Positive', cnt('Positive')], ['Pending', cnt('Pending')]];
  const bw = 26, bx0 = W - M - stats.length * (bw + 3) + 3;
  stats.forEach(([k, v], i) => {
    const bx = bx0 + i * (bw + 3);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.25); doc.rect(bx, 28, bw, 11);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK); doc.text(String(v), bx + 3, 34);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...MUT); doc.text(k.toUpperCase(), bx + 3, 37.5);
  });

  // ── Table ──
  const MARK = '\u0001';   // pathogen tested → drawn as a filled dot
  // retestNum may be "Retest #2", "Vector #1" or just "2"
  const typeOf = h => { const rn = String(h.retestNum || '').trim();
    if (!rn) return h.isRetest ? 'Retest' : 'Routine';
    return /^\d+$/.test(rn) ? 'Retest #' + rn : rn; };
  doc.autoTable({
    startY: 43, margin: { left: M, right: M, top: 14, bottom: 14 },
    head: [['Date', 'Bldg', 'Sample', 'Zone', 'Area', 'Line', 'Location', 'E. coli', 'Listeria', 'Salm.', 'S. aureus', 'Result', 'Type']],
    body: hist.map(h => [fmt(h.fecha), h.planta, h.sample ? '#' + h.sample : '—', h.zone || '—', h.area || '', h.line || '',
      h.location || '', h.ecoli ? MARK : '', h.listeria ? MARK : '', h.salmonella ? MARK : '', h.saureus ? MARK : '',
      h.resultado || 'Pending', typeOf(h)]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.6, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, textColor: INK, lineColor: LINE, lineWidth: 0.2, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: HEAD, textColor: INK, fontStyle: 'bold', fontSize: 7.4, valign: 'middle' },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 22 }, 1: { cellWidth: 14, halign: 'center' }, 2: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 11, halign: 'center' }, 4: { cellWidth: 30 }, 5: { cellWidth: 20 }, 6: { cellWidth: 'auto' },
      7: { cellWidth: 14, halign: 'center' }, 8: { cellWidth: 14, halign: 'center' }, 9: { cellWidth: 12, halign: 'center' }, 10: { cellWidth: 17, halign: 'center' },
      11: { cellWidth: 19, halign: 'center' }, 12: { cellWidth: 21, halign: 'center' }
    },
    didParseCell: c => {
      if (c.section === 'head' && c.column.index >= 1 && c.column.index !== 4 && c.column.index !== 5 && c.column.index !== 6) c.cell.styles.halign = 'center';
      if (c.section !== 'body') return;
      if (c.cell.raw === MARK) c.cell.text = [''];
      if (c.column.index === 11 && c.cell.raw === 'Positive') c.cell.styles.fontStyle = 'bold';
      if (c.column.index === 11 && c.cell.raw === 'Pending') c.cell.styles.textColor = MUT;
      if (c.column.index === 12 && c.cell.raw === 'Routine') c.cell.styles.textColor = MUT;
    },
    didDrawCell: c => {
      if (c.section === 'body' && c.cell.raw === MARK) {
        doc.setFillColor(...INK); doc.circle(c.cell.x + c.cell.width / 2, c.cell.y + c.cell.height / 2, 1.1, 'F');
      }
    }
  });

  // ── Footer on every page ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, PH - 9, W - M, PH - 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUT);
    doc.text('Caputo Foods - Environmental Test History - Confidential', M, PH - 5);
    doc.text('Page ' + i + ' of ' + pages, W - M, PH - 5, { align: 'right' });
  }

  doc.save('Test History ' + todayLocal() + '.pdf');
  toast('PDF exported — ' + hist.length + ' record' + (hist.length === 1 ? '' : 's'), 'success');
}
