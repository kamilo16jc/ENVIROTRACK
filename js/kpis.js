// ═══════════════════════════════════════════════
// DASHBOARD KPI DONUTS
// Interactive result-breakdown rings (Total / Negative / Positive / Pending).
// Driven by the real counts from refreshDashboard() via kpiRender().
// ═══════════════════════════════════════════════
const KG_NS = 'http://www.w3.org/2000/svg';

// (Re)build the four donut cards from live counts. Safe to call on every
// dashboard refresh — it clears and rebuilds the arcs and rebinds handlers.
function kpiRender(total, neg, pos, pend) {
  const root = document.getElementById('enviro-dashboard-kpis');
  if (!root) return;
  total = total || 0;
  const categories = [
    { key: 'negative', label: 'Negative', count: neg || 0 },
    { key: 'positive', label: 'Positive', count: pos || 0 },
    { key: 'pending',  label: 'Pending',  count: pend || 0 }
  ];
  categories.forEach(c => { c.percent = total > 0 ? (c.count / total * 100) : 0; });
  const announce = root.querySelector('#kg-announcement');

  root.querySelectorAll('.kg-card').forEach(oldCard => {
    // Clone to drop any listeners bound on a previous render.
    const card = oldCard.cloneNode(true);
    oldCard.parentNode.replaceChild(card, oldCard);

    const kind = card.dataset.kind;
    const svg = card.querySelector('svg');
    const group = card.querySelector('.kg-marks');
    const detail = card.querySelector('.kg-detail');
    const percentEl = card.querySelector('.kg-percent');
    const data = kind === 'total' ? categories : categories.filter(c => c.key === kind);

    group.innerHTML = '';
    let offset = 0;
    const arcs = data.map(category => {
      const arc = document.createElementNS(KG_NS, 'g');
      arc.setAttribute('class', 'kg-arc kg-' + category.key + '-arc');
      const circle = document.createElementNS(KG_NS, 'circle');
      circle.setAttribute('class', 'kg-mark');
      circle.setAttribute('cx', '56'); circle.setAttribute('cy', '56'); circle.setAttribute('r', '38');
      circle.setAttribute('pathLength', '100');
      circle.setAttribute('stroke-dasharray', category.percent + ' ' + (100 - category.percent));
      circle.setAttribute('stroke-dashoffset', String(-offset));
      circle.setAttribute('transform', 'rotate(-90 56 56)');
      const angle = (offset + category.percent / 2) * Math.PI / 50 - Math.PI / 2;
      arc.style.setProperty('--kg-dx', (Math.cos(angle) * 4).toFixed(2) + 'px');
      arc.style.setProperty('--kg-dy', (Math.sin(angle) * 4).toFixed(2) + 'px');
      arc.appendChild(circle); group.appendChild(arc);
      offset += category.percent;
      return { element: arc, category };
    });

    // Resting state text
    if (kind === 'total') {
      percentEl.textContent = '100%';
      detail.textContent = 'All results';
    } else {
      percentEl.textContent = (data[0] ? data[0].percent : 0).toFixed(1) + '%';
      detail.textContent = 'of all tests';
    }

    let pinned = false, hovered = false, focused = false, selected = 0;
    function render() {
      const active = hovered || focused || pinned;
      card.classList.toggle('is-active', active);
      arcs.forEach((arc, i) => arc.element.classList.toggle('is-highlighted', active && i === selected));
      if (kind === 'total') {
        const c = data[selected] || data[0];
        percentEl.textContent = active && c ? c.percent.toFixed(1) + '%' : '100%';
        detail.textContent = active && c ? c.label + ' · ' + c.count : 'All results';
      } else {
        detail.textContent = active ? data[0].count + ' of ' + total + ' tests' : 'of all tests';
      }
    }
    card.addEventListener('pointerenter', () => { hovered = true; render(); });
    card.addEventListener('pointerleave', () => { hovered = false; render(); });
    card.addEventListener('focus', () => { focused = true; render(); });
    card.addEventListener('blur', () => { focused = false; render(); });

    if (kind === 'total') {
      svg.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch') return;
        const b = svg.getBoundingClientRect();
        const x = (event.clientX - b.left) / b.width * 112 - 56;
        const y = (event.clientY - b.top) / b.height * 112 - 56;
        if (Math.hypot(x, y) < 26) return;
        const ang = (Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
        const share = ang / (Math.PI * 2) * 100;
        let cum = 0;
        selected = data.findIndex(c => { cum += c.percent; return share < cum; });
        if (selected < 0) selected = data.length - 1;
        render();
      });
      card.addEventListener('click', () => {
        selected = pinned ? (selected + 1) % data.length : selected;
        pinned = true; render();
        const c = data[selected];
        if (announce && c) announce.textContent = c.label + ': ' + c.count + ' tests, ' + c.percent.toFixed(1) + ' percent of ' + total + '.';
      });
    } else {
      card.addEventListener('click', () => {
        pinned = !pinned;
        card.setAttribute('aria-pressed', String(pinned));
        render();
        if (announce) announce.textContent = data[0].label + ': ' + data[0].count + ' of ' + total + ' tests.';
      });
    }
    card.addEventListener('keydown', event => {
      if (event.key === 'Escape') { pinned = hovered = focused = false; if (kind !== 'total') card.setAttribute('aria-pressed', 'false'); render(); }
    });
  });
}
