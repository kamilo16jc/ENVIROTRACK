// ═══════════════════════════════════════════════════════════════
// REPORTS VIEW — "Environmental insights" (new design, real data)
// Renders the interactive report (KPIs, bars, donut, zones, pathogens,
// weekly trend, retests, risk table, monthly) from getFilteredHistory().
// Called by buildReports(); safe to re-run on every period change.
// ═══════════════════════════════════════════════════════════════
let _erTrendRO = null;

function renderReportsView() {
  const root = document.getElementById('enviro-reports');
  if (!root || typeof getFilteredHistory !== 'function') return;
  const $  = s => root.querySelector(s);
  const $$ = s => Array.from(root.querySelectorAll(s));
  const NS = 'http://www.w3.org/2000/svg';
  const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c; if (txt !== undefined) n.textContent = txt; return n; };
  const svgEl = (t, a) => { const n = document.createElementNS(NS, t); for (const k in (a || {})) n.setAttribute(k, String(a[k])); return n; };
  const num = n => String(n);

  // ── Data from real records ──────────────────────────────────
  const H = getFilteredHistory();
  const base = H.filter(h => !h.retestNum && !h.isRetest);
  const retestRecs = H.filter(h => (h.retestNum || h.isRetest) && !isVectorRec(h));   // vector samples are reported separately
  const PLANTS = ['1945', '1935', '1931E', '1931W'];
  const resolved = (typeof GRV === 'function' ? GRV() : []);

  const buildings = PLANTS.map(id => ({
    id,
    total:    base.filter(h => h.planta === id).length,
    positive: base.filter(h => h.planta === id && h.resultado === 'Positive').length,
    retests:  retestRecs.filter(h => h.planta === id).length
  })).filter(b => b.total || b.retests);
  if (!buildings.length) PLANTS.forEach(id => buildings.push({ id, total: 0, positive: 0, retests: 0 }));

  const totalTests = base.length;
  const negC  = base.filter(h => h.resultado === 'Negative').length;
  const posC  = base.filter(h => h.resultado === 'Positive').length;
  const pendC = base.filter(h => h.resultado === 'Pending').length;
  const results = [
    { key: 'negative', name: 'Negative', count: negC,  color: 'var(--er-series)' },
    { key: 'positive', name: 'Positive', count: posC,  color: 'var(--er-positive)' },
    { key: 'pending',  name: 'Pending',  count: pendC, color: 'var(--er-pending)' }
  ];
  const PATHO = [['ecoli', 'E. coli'], ['listeria', 'Listeria'], ['salmonella', 'Salmonella'], ['saureus', 'S. aureus']];
  // tested = samples assigned that pathogen (the flag); positive = lab-confirmed
  // via positivePathogens() — never infer a positive just because it was swabbed.
  const _posOf = h => (typeof positivePathogens === 'function' ? positivePathogens(h) : []);
  const pathogens = PATHO.map(([k, name]) => ({ name, key: k,
    tested: base.filter(h => h[k]).length,
    positive: base.filter(h => h.resultado === 'Positive' && _posOf(h).includes(k)).length }));

  const zoneIds = Array.from(new Set(base.map(h => Number(h.zone)).filter(z => z))).sort((a, b) => a - b);
  const zones = (zoneIds.length ? zoneIds : [1, 2, 3]).map(z => {
    const zr = base.filter(h => Number(h.zone) === z);
    return { name: 'Zone ' + z, total: zr.length, positive: zr.filter(h => h.resultado === 'Positive').length };
  });

  function weekStart(ds) { const d = new Date(ds + 'T00:00:00'); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d; }
  const wmap = {};
  base.forEach(h => { if (!h.fecha) return; const ws = weekStart(h.fecha); const key = ws.toISOString().slice(0, 10); (wmap[key] || (wmap[key] = { ws, total: 0, positive: 0 })); wmap[key].total++; if (h.resultado === 'Positive') wmap[key].positive++; });
  const weeks = Object.values(wmap).sort((a, b) => a.ws - b.ws).slice(-8)
    .map(w => ({ label: 'Week of ' + w.ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), total: w.total, positive: w.positive }));

  const totalRetests = retestRecs.length;
  const resolvedCount = resolved.length;
  const positiveRate = totalTests ? (posC / totalTests * 100) : 0;
  const negativeRate = totalTests ? (negC / totalTests * 100) : 0;

  // ── Period label ────────────────────────────────────────────
  const pSel = document.getElementById('reportPeriod');
  $('#er-period-label').textContent = (pSel && pSel.options[pSel.selectedIndex]) ? pSel.options[pSel.selectedIndex].text : 'All history';

  // ── KPIs ────────────────────────────────────────────────────
  const kpis = [
    { label: 'Total tests',   value: num(totalTests),               ctx: 'Recorded samples' },
    { label: 'Positive rate', value: positiveRate.toFixed(1) + '%', ctx: posC + ' positive result' + (posC === 1 ? '' : 's'), sw: 'positive' },
    { label: 'Negative rate', value: negativeRate.toFixed(1) + '%', ctx: negC + ' negative result' + (negC === 1 ? '' : 's'), sw: '' },
    { label: 'Retests',       value: num(totalRetests),             ctx: 'Follow-up tests', sw: 'pending' },
    { label: 'Resolved cases',value: num(resolvedCount),            ctx: 'Retests OK' }
  ];
  $('#er-kpis').innerHTML = kpis.map(k =>
    '<div class="er-kpi"><div class="er-kpi-label">' + (k.sw !== undefined ? '<span class="er-swatch ' + k.sw + '" aria-hidden="true"></span>' : '') + esc(k.label) +
    '</div><span class="er-kpi-value">' + esc(k.value) + '</span><div class="er-kpi-context">' + esc(k.ctx) + '</div></div>').join('');

  // ── Tooltip plumbing ────────────────────────────────────────
  const tooltip = $('#er-tooltip');
  const hideTip = () => { tooltip.hidden = true; };
  function tip(node, title, detail, ev) {
    tooltip.replaceChildren(el('strong', '', title), el('span', '', detail)); tooltip.hidden = false;
    const b = root.getBoundingClientRect(), r = node.getBoundingClientRect();
    const x = (ev && ev.clientX !== undefined ? ev.clientX : r.left + r.width / 2) - b.left;
    const y = (ev && ev.clientY !== undefined ? ev.clientY : r.top) - b.top;
    const w = tooltip.offsetWidth, h = tooltip.offsetHeight;
    tooltip.style.left = Math.max(8, Math.min(x + 12, b.width - w - 8)) + 'px';
    tooltip.style.top = Math.max(8, y - h - 12) + 'px';
  }
  function bindTip(node, title, detail, onEnter, onLeave) {
    node.addEventListener('pointerenter', e => { tip(node, title, detail, e); if (onEnter) onEnter(); });
    node.addEventListener('pointermove', e => tip(node, title, detail, e));
    node.addEventListener('pointerleave', () => { hideTip(); if (onLeave) onLeave(); });
  }
  const announce = t => { const l = $('#er-live'); if (l) l.textContent = t; };

  // ── Bar rows ────────────────────────────────────────────────
  function barRow(label, count, max, positive, cls) {
    const b = el('button', 'er-bar-row cursor-interaction' + (cls ? ' ' + cls : '')); b.type = 'button';
    b.appendChild(el('span', '', label));
    const track = el('span', 'er-bar-track'), fill = el('span', 'er-bar-fill');
    fill.style.width = (max ? count / max * 100 : 0) + '%';
    if (positive) { const p = el('span', 'er-bar-positive'); p.style.width = (count ? positive / count * 100 : 0) + '%'; fill.appendChild(p); }
    track.appendChild(fill); b.appendChild(track); b.appendChild(el('span', 'er-number', num(count)));
    return b;
  }

  // ── Building link highlighting ──────────────────────────────
  let pinnedBuilding = null, pinnedResult = null, activeWeek = null;
  function linkBuilding(id) {
    $$('[data-building]').forEach(n => n.classList.toggle('is-linked', n.dataset.building === id));
    const b = buildings.find(v => v.id === id);
    $('#er-selection').textContent = b
      ? 'Building ' + b.id + ' · ' + b.total + ' tests · ' + b.positive + ' positive · ' + b.retests + ' retests'
      : 'All buildings · ' + totalTests + ' tests · ' + posC + ' positive · ' + totalRetests + ' retests';
    $('#er-building-note').textContent = b
      ? 'Building ' + b.id + ' · ' + (b.total ? (b.positive / b.total * 100).toFixed(1) : '0.0') + '% positive rate'
      : 'Select a building to highlight its activity.';
    const clr = $('#er-clear'); if (clr) clr.hidden = !pinnedBuilding;
  }
  function bindBuilding(node, b) {
    node.dataset.building = b.id;
    bindTip(node, 'Building ' + b.id, b.total + ' tests · ' + b.positive + ' positive · ' + b.retests + ' retests', () => linkBuilding(b.id), () => linkBuilding(pinnedBuilding));
    node.addEventListener('click', () => { pinnedBuilding = pinnedBuilding === b.id ? null : b.id; linkBuilding(pinnedBuilding); announce($('#er-selection').textContent); });
  }

  // ── Tests by building + retests + monthly + positives tables ─
  $('#er-building-bars').innerHTML = ''; $('#er-retest-bars').innerHTML = '';
  $('#er-month-rows').innerHTML = ''; $('#er-positive-rows').innerHTML = '';
  $('#er-build-count').textContent = totalTests + ' tests';
  const maxB = Math.max(1, ...buildings.map(b => b.total));
  const maxR = Math.max(1, ...buildings.map(b => b.retests));
  buildings.forEach(b => {
    const tb = barRow(b.id, b.total, maxB, b.positive); bindBuilding(tb, b); $('#er-building-bars').appendChild(tb);
    const rb = barRow(b.id, b.retests, maxR, 0, 'er-retest-row'); bindBuilding(rb, b); $('#er-retest-bars').appendChild(rb);
    const mr = el('tr'); mr.dataset.building = b.id; mr.appendChild(el('td', '', b.id));
    const cell = el('td');
    const mc = el('button', 'er-month-cell cursor-interaction' + (b.positive ? ' has-positive' : '')); mc.type = 'button';
    mc.appendChild(el('span', '', num(b.total))); mc.appendChild(el('small', '', b.positive ? b.positive + ' positive' : '0 positives'));
    bindBuilding(mc, b); cell.appendChild(mc); mr.appendChild(cell); $('#er-month-rows').appendChild(mr);
    const pr = el('tr'); pr.dataset.building = b.id;
    [b.id, num(b.positive), (b.total ? (b.positive / b.total * 100).toFixed(1) : '0.0') + '%'].forEach((v, i) => pr.appendChild(el('td', i ? 'ed-num' : '', v)));
    $('#er-positive-rows').appendChild(pr);
  });
  $('#er-retest-note').textContent = resolvedCount + ' case' + (resolvedCount === 1 ? '' : 's') + ' resolved · ' + totalRetests + ' retests';
  const nowMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  $('#er-month-caption').textContent = nowMonth + ' · Tests by building';

  // ── Pathogens ───────────────────────────────────────────────
  $('#er-pathogen-bars').innerHTML = '';
  const maxPat = Math.max(1, ...pathogens.map(p => p.tested));
  pathogens.forEach(p => {
    const b = barRow(p.name, p.tested, maxPat, p.positive, 'er-pathogen-row');
    bindTip(b, p.name, p.tested + ' tested · ' + p.positive + ' positive' + (p.tested ? ' · ' + (p.positive / p.tested * 100).toFixed(1) + '%' : ''));
    $('#er-pathogen-bars').appendChild(b);
  });

  // ── Zones ───────────────────────────────────────────────────
  $('#er-zone-bars').innerHTML = '';
  zones.forEach(z => {
    const rate = z.total ? z.positive / z.total * 100 : null;
    const row = el('button', 'er-zone-row cursor-interaction'); row.type = 'button';
    row.appendChild(el('span', '', z.name));
    const track = el('span', 'er-bar-track'), fill = el('span', 'er-bar-fill');
    fill.style.width = (rate === null ? 0 : Math.min(100, rate / 10 * 100)) + '%'; track.appendChild(fill); row.appendChild(track);
    const side = el('span', 'er-zone-side', rate === null ? '—' : rate.toFixed(1) + '%'); side.appendChild(el('small', '', z.total + ' tests')); row.appendChild(side);
    const detail = z.total + ' tests · ' + z.positive + ' positive' + (rate === null ? ' · Rate not calculated' : ' · ' + rate.toFixed(1) + '% positive rate');
    bindTip(row, z.name, detail);
    $('#er-zone-bars').appendChild(row);
  });

  // ── Donut (result distribution) ─────────────────────────────
  $('#er-arcs').innerHTML = ''; $('#er-result-list').innerHTML = '';
  $('#er-result-caption').textContent = pendC + ' of ' + totalTests + ' results are still pending';
  $('#er-donut-value').textContent = num(totalTests); $('#er-donut-label').textContent = 'total tests';
  let offset = 0; const arcs = [];
  results.forEach((r, index) => {
    const pct = totalTests ? r.count / totalTests * 100 : 0;
    const arc = svgEl('g', { 'class': 'er-arc' });
    const ang = (offset + pct / 2) * Math.PI / 50 - Math.PI / 2;
    arc.style.setProperty('--er-dx', (Math.cos(ang) * 5).toFixed(2) + 'px');
    arc.style.setProperty('--er-dy', (Math.sin(ang) * 5).toFixed(2) + 'px');
    arc.appendChild(svgEl('circle', { cx: 90, cy: 90, r: 62, fill: 'none', stroke: r.color, 'stroke-width': 13, pathLength: 100, 'stroke-dasharray': pct + ' ' + (100 - pct), 'stroke-dashoffset': -offset, transform: 'rotate(-90 90 90)' }));
    $('#er-arcs').appendChild(arc); arcs.push(arc); offset += pct;
    const b = el('button', 'er-result cursor-interaction'); b.type = 'button'; b.dataset.result = String(index); b.setAttribute('aria-pressed', 'false');
    b.appendChild(el('span', 'er-swatch' + (r.key === 'negative' ? '' : ' ' + r.key)));
    const lbl = el('span', '', r.name); lbl.appendChild(el('small', '', pct.toFixed(1) + '% of all tests')); b.appendChild(lbl);
    b.appendChild(el('span', 'er-number', num(r.count)));
    bindTip(b, r.name, r.count + ' of ' + totalTests + ' tests · ' + pct.toFixed(1) + '%', () => selectResult(index), () => selectResult(pinnedResult));
    b.addEventListener('click', () => { pinnedResult = pinnedResult === index ? null : index; selectResult(pinnedResult); announce(pinnedResult === null ? 'All results' : r.name + ': ' + r.count + ' tests.'); });
    $('#er-result-list').appendChild(b);
  });
  function selectResult(index) {
    arcs.forEach((a, i) => { a.classList.toggle('is-selected', i === index); a.classList.toggle('is-muted', index !== null && index !== undefined && i !== index); });
    $$('[data-result]').forEach((b, i) => { b.classList.toggle('is-selected', i === index); b.setAttribute('aria-pressed', String(i === pinnedResult)); });
    const r = (index === null || index === undefined) ? null : results[index];
    $('#er-donut-value').textContent = r ? (totalTests ? (r.count / totalTests * 100).toFixed(1) : '0') + '%' : num(totalTests);
    $('#er-donut-label').textContent = r ? r.name.toLowerCase() : 'total tests';
    $('#er-result-note').textContent = r ? r.count + ' ' + r.name.toLowerCase() + ' result' + (r.count === 1 ? '' : 's') + ' out of ' + totalTests + ' tests' : 'Hover or select a result to see its share.';
  }
  const donut = $('#er-donut');
  donut.onpointermove = event => {
    if (event.pointerType === 'touch' || !totalTests) return;
    const b = donut.getBoundingClientRect();
    const x = (event.clientX - b.left) / b.width * 180 - 90, y = (event.clientY - b.top) / b.height * 180 - 90;
    if (Math.hypot(x, y) < 45 || Math.hypot(x, y) > 80) return;
    const share = ((Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 100;
    let cum = 0, idx = results.findIndex(r => { cum += totalTests ? r.count / totalTests * 100 : 0; return share < cum; });
    if (idx < 0) idx = results.length - 1;
    selectResult(idx); tip(donut, results[idx].name, results[idx].count + ' of ' + totalTests + ' tests', event);
  };
  donut.onpointerleave = () => { selectResult(pinnedResult); hideTip(); };

  // ── Weekly trend ────────────────────────────────────────────
  const trend = $('#er-trend'); let trendMarkers = [];
  function selectWeek(index) {
    trendMarkers.forEach((m, i) => m.setAttribute('r', i === index ? '6' : '4'));
    $$('[data-week]').forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
    $('#er-trend-note').textContent = (index === null || index === undefined)
      ? weeks.length + ' reported week' + (weeks.length === 1 ? '' : 's') + ' · ' + totalTests + ' tests total'
      : weeks[index].label + ' · ' + weeks[index].total + ' tests · ' + weeks[index].positive + ' positive';
  }
  function drawTrend() {
    const n = weeks.length;
    const width = Math.max(240, (trend.getBoundingClientRect().width || 300)), height = 172, left = 42, right = width - 28, top = 18, bottom = 146;
    const ceiling = Math.max(5, Math.ceil(Math.max(1, ...weeks.map(w => w.total)) / 5) * 5);
    const y = v => bottom - v / ceiling * (bottom - top);
    const x = i => n <= 1 ? (left + right) / 2 : left + i * (right - left) / (n - 1);
    trend.setAttribute('viewBox', '0 0 ' + width + ' ' + height); trend.replaceChildren(); trendMarkers = [];
    [0, ceiling / 2, ceiling].forEach(v => {
      trend.appendChild(svgEl('line', { x1: left, y1: y(v), x2: right, y2: y(v), stroke: 'var(--ed-border)', 'stroke-width': 1 }));
      const t = svgEl('text', { x: left - 10, y: y(v) + 4, 'text-anchor': 'end' }); t.textContent = v; trend.appendChild(t);
    });
    const unit = svgEl('text', { x: 4, y: 10 }); unit.textContent = 'Tests'; trend.appendChild(unit);
    if (n > 0) {
      let tp = 'M ' + x(0) + ' ' + y(weeks[0].total); for (let i = 1; i < n; i++) tp += ' L ' + x(i) + ' ' + y(weeks[i].total);
      trend.appendChild(svgEl('path', { d: tp + ' L ' + x(n - 1) + ' ' + bottom + ' L ' + x(0) + ' ' + bottom + ' Z', 'class': 'er-area' }));
      trend.appendChild(svgEl('path', { d: tp, 'class': 'er-total-line' }));
      let pp = 'M ' + x(0) + ' ' + y(weeks[0].positive); for (let i = 1; i < n; i++) pp += ' L ' + x(i) + ' ' + y(weeks[i].positive);
      trend.appendChild(svgEl('path', { d: pp, 'class': 'er-positive-line' }));
      weeks.forEach((w, i) => {
        const m = svgEl('circle', { cx: x(i), cy: y(w.total), r: 4, 'class': 'er-marker' }); trend.appendChild(m); trendMarkers.push(m);
        trend.appendChild(svgEl('circle', { cx: x(i), cy: y(w.positive), r: 3, 'class': 'er-positive-marker' }));
        const lbl = svgEl('text', { x: x(i), y: y(w.total) - 9, 'text-anchor': 'middle' }); lbl.textContent = w.total; trend.appendChild(lbl);
        const hit = svgEl('circle', { cx: x(i), cy: y(w.total), r: 16, fill: 'transparent' });
        bindTip(hit, w.label, w.total + ' tests · ' + w.positive + ' positive', () => selectWeek(i), () => selectWeek(activeWeek));
        hit.addEventListener('click', () => { activeWeek = activeWeek === i ? null : i; selectWeek(activeWeek); announce($('#er-trend-note').textContent); });
        trend.appendChild(hit);
      });
    }
    selectWeek(activeWeek);
  }
  $('#er-weeks').innerHTML = '';
  weeks.forEach((w, i) => {
    const b = el('button', 'er-week-button cursor-interaction', w.label); b.type = 'button'; b.dataset.week = String(i); b.setAttribute('aria-pressed', 'false');
    bindTip(b, w.label, w.total + ' tests · ' + w.positive + ' positive', () => selectWeek(i), () => selectWeek(activeWeek));
    b.addEventListener('click', () => { activeWeek = activeWeek === i ? null : i; selectWeek(activeWeek); announce($('#er-trend-note').textContent); });
    $('#er-weeks').appendChild(b);
  });
  drawTrend();
  if (_erTrendRO) { try { _erTrendRO.disconnect(); } catch (e) {} }
  _erTrendRO = new ResizeObserver(() => drawTrend()); _erTrendRO.observe(trend);

  // ── Risk table (points with positives) ─────────────────────
  $('#er-risk-rows').innerHTML = '';
  const ptMap = {};
  base.filter(h => h.resultado === 'Positive').forEach(h => {
    const key = h.planta + '|' + h.sample;
    const p = ptMap[key] || (ptMap[key] = { sample: h.sample, planta: h.planta, zone: h.zone, area: h.area, location: h.location, total: 0, positive: 0, path: {} });
    _posOf(h).forEach(k => { const nm = (PATHO.find(x => x[0] === k) || [k, k])[1]; p.path[nm] = (p.path[nm] || 0) + 1; });
  });
  base.forEach(h => { const key = h.planta + '|' + h.sample; if (ptMap[key]) { ptMap[key].total++; if (h.resultado === 'Positive') ptMap[key].positive++; } });
  const riskPts = Object.values(ptMap).sort((a, b) => b.positive - a.positive);
  $('#er-risk-count').textContent = riskPts.length + ' point' + (riskPts.length === 1 ? '' : 's') + ' reported';
  if (!riskPts.length) {
    $('#er-risk-rows').innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--ed-muted);padding:22px">No positive results in this period</td></tr>';
  } else {
    riskPts.forEach(p => {
      const topPath = Object.keys(p.path).sort((a, b) => p.path[b] - p.path[a])[0] || '—';
      const rate = p.total ? (p.positive / p.total * 100).toFixed(0) + '%' : '—';
      const tr = el('tr', 'er-risk-row'); tr.dataset.building = p.planta;
      tr.innerHTML = '<td class="er-risk">' + esc(String(p.sample)) + '</td><td>' + esc(p.planta) + '</td><td>' + esc(String(p.zone || '')) +
        '</td><td>' + esc((p.area || '') + (p.location ? ' · ' + p.location : '')) + '</td><td class="ed-num">' + p.total +
        '</td><td class="ed-num er-risk">' + p.positive + '</td><td class="ed-num er-risk">' + rate + '</td><td>' + esc(topPath) + '</td>';
      $('#er-risk-rows').appendChild(tr);
    });
  }

  // ── Clear / review actions ──────────────────────────────────
  const clr = $('#er-clear');
  if (clr) clr.onclick = () => { pinnedBuilding = null; linkBuilding(null); announce('Building selection cleared.'); };

  linkBuilding(null); selectResult(null); selectWeek(null);
}
