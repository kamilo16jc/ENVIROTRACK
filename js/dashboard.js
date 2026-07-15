// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════
function refreshDashboard() {
  const hist=GH();
  document.getElementById('st0').textContent=hist.length;
  document.getElementById('st1').textContent=hist.filter(h=>h.resultado==='Negative').length;
  document.getElementById('st2').textContent=hist.filter(h=>h.resultado==='Positive').length;
  document.getElementById('st3').textContent=hist.filter(h=>h.resultado==='Pending').length;
  // Recent weeks — DERIVED from the records (grouped by plant+date) so it always
  // reflects SharePoint data. Retests are excluded (they aren't sampling weeks).
  const wb=document.getElementById('recentWeeks');
  const groups={};
  hist.filter(h=>!h.retestNum && !h.isRetest).forEach(h=>{
    const k=h.planta+'|'+h.fecha;
    if(!groups[k]) groups[k]={planta:h.planta,fecha:h.fecha,count:0,pos:0,pend:0,by:''};
    const g=groups[k];
    g.count++;
    if(h.resultado==='Positive') g.pos++;
    else if(h.resultado==='Pending') g.pend++;
    if(!g.by) g.by=h.by||h.enteredByName||'';
  });
  const rw=Object.values(groups).sort((a,b)=>a.fecha<b.fecha?1:a.fecha>b.fecha?-1:0).slice(0,8);
  wb.innerHTML=rw.length===0
    ?'<tr><td colspan="6" style="text-align:center;color:var(--gray-500);padding:24px">No records</td></tr>'
    :rw.map(w=>{
      const cls=w.pos>0?'badge-red':w.pend>0?'badge-yellow':'badge-green';
      const txt=w.pos>0?w.pos+' Positive(s)':w.pend>0?'Pending':'Complete';
      return '<tr><td><span class="badge badge-gray">'+w.planta+'</span></td><td>'+w.fecha+'</td><td style="text-align:center;font-weight:600">'+w.count+'</td><td style="text-align:center">'+(w.pos>0?'<span class="badge badge-red">'+w.pos+'</span>':'<span style="color:var(--gray-200)">–</span>')+'</td><td><span class="badge '+cls+'">'+txt+'</span></td><td style="color:var(--gray-500)">'+esc(w.by)+'</td></tr>';
    }).join('');
  document.getElementById('plantStats').innerHTML=['1945','1935','1931E','1931W'].map(p=>{
    const total=getActiveMaster(p).length, tested=hist.filter(h=>h.planta===p).length;
    const pct=total>0?Math.min(100,Math.round(tested/total*100)):0;
    return '<div><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:13px;font-weight:600">Plant '+p+'</span><span style="font-size:12px;color:var(--gray-500)">'+total+' points</span></div><div style="background:var(--gray-100);border-radius:4px;height:6px;overflow:hidden"><div style="background:var(--red);height:6px;width:'+pct+'%;border-radius:4px"></div></div><div style="font-size:11px;color:var(--gray-400);margin-top:3px">'+tested+' tests recorded</div></div>';
  }).join('');
  const resolved=GRV(), rids=new Set(resolved.map(r=>r.originalId));
  // Cases still in follow-up (mirrors the Retests view's "active" set):
  //   (1) ORIGINAL positives that haven't spawned retests yet, and
  //   (2) any case with a retest still PENDING (round in progress).
  // A positive retest inside a fully-resolved cascade (no pending children) is
  // NOT active — that's what kept the migrated 206 out. De-duped by sample+plant.
  const rootsWithRetests=new Set(hist.filter(h=>h.retestNum&&h.originalId).map(h=>h.originalId));
  const cases=new Map();
  hist.filter(h=>h.resultado==='Positive'&&!h.retestNum&&!rids.has(h.id)&&!rootsWithRetests.has(h.id))
      .forEach(h=>cases.set(h.planta+'|'+h.sample,{sample:h.sample,planta:h.planta,fecha:h.fecha}));
  hist.filter(h=>h.retestNum&&h.resultado==='Pending')
      .forEach(h=>{const k=h.planta+'|'+h.sample; if(!cases.has(k)) cases.set(k,{sample:h.sample,planta:h.planta,fecha:h.fecha});});
  const activePos=[...cases.values()];
  document.getElementById('pendingRetests').innerHTML=activePos.length===0
    ?'<p style="color:var(--gray-500);font-size:13px"><svg class="ln ico-inline" width="14" height="14" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>No pending retests</p>'
    :activePos.slice(0,5).map(h=>'<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--gray-100)"><span style="font-weight:700;color:var(--red);font-size:14px">#'+h.sample+'</span><span style="font-size:12px;color:var(--gray-500)">'+h.planta+' — '+h.fecha+'</span><button class="btn btn-primary btn-sm" onclick="showPage(\'retests\')" style="margin-left:auto">Ver \u2192</button></div>').join('');
}