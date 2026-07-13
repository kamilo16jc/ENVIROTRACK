// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════
function refreshDashboard() {
  const hist=GH(), weeks=GW();
  document.getElementById('st0').textContent=hist.length;
  document.getElementById('st1').textContent=hist.filter(h=>h.resultado==='Negative').length;
  document.getElementById('st2').textContent=hist.filter(h=>h.resultado==='Positive').length;
  document.getElementById('st3').textContent=hist.filter(h=>h.resultado==='Pending').length;
  const wb=document.getElementById('recentWeeks');
  const rw=[...weeks].reverse().slice(0,8);
  wb.innerHTML=rw.length===0
    ?'<tr><td colspan="6" style="text-align:center;color:var(--gray-500);padding:24px">No records</td></tr>'
    :rw.map(w=>{
      const wh=hist.filter(h=>h.planta===w.planta&&h.fecha===w.fecha);
      const pos=wh.filter(h=>h.resultado==='Positive').length;
      const pend=wh.filter(h=>h.resultado==='Pending').length;
      const cls=pos>0?'badge-red':pend>0?'badge-yellow':'badge-green';
      const txt=pos>0?pos+' Positive(s)':pend>0?'Pending':'Complete';
      return '<tr><td><span class="badge badge-gray">'+w.planta+'</span></td><td>'+w.fecha+'</td><td style="text-align:center;font-weight:600">'+w.count+'</td><td style="text-align:center">'+(pos>0?'<span class="badge badge-red">'+pos+'</span>':'<span style="color:var(--gray-200)">–</span>')+'</td><td><span class="badge '+cls+'">'+txt+'</span></td><td style="color:var(--gray-500)">'+w.by+'</td></tr>';
    }).join('');
  document.getElementById('plantStats').innerHTML=['1945','1935','1931E','1931W'].map(p=>{
    const total=getActiveMaster(p).length, tested=hist.filter(h=>h.planta===p).length;
    const pct=total>0?Math.min(100,Math.round(tested/total*100)):0;
    return '<div><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:13px;font-weight:600">Plant '+p+'</span><span style="font-size:12px;color:var(--gray-500)">'+total+' points</span></div><div style="background:var(--gray-100);border-radius:4px;height:6px;overflow:hidden"><div style="background:var(--red);height:6px;width:'+pct+'%;border-radius:4px"></div></div><div style="font-size:11px;color:var(--gray-400);margin-top:3px">'+tested+' tests registrados</div></div>';
  }).join('');
  const resolved=GRV(), rids=new Set(resolved.map(r=>r.originalId));
  const activePos=hist.filter(h=>h.resultado==='Positive'&&!rids.has(h.id));
  document.getElementById('pendingRetests').innerHTML=activePos.length===0
    ?'<p style="color:var(--gray-500);font-size:13px"><svg class="ln ico-inline" width="14" height="14" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>No pending retests</p>'
    :activePos.slice(0,5).map(h=>'<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--gray-100)"><span style="font-weight:700;color:var(--red);font-size:14px">#'+h.sample+'</span><span style="font-size:12px;color:var(--gray-500)">'+h.planta+' — '+h.fecha+'</span><button class="btn btn-primary btn-sm" onclick="showPage(\'retests\')" style="margin-left:auto">Ver \u2192</button></div>').join('');
}