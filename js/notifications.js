// ═══════════════════════════════════════════════
// NOTIFICATION CENTER
// A feed of what happens across the app, DERIVED from the data already
// synced from SharePoint (Records / ResolvedRetests / Submissions) using
// their audit fields (enteredByName / enteredAt / submittedByName). No new
// SharePoint infrastructure required.
//
// "Unread" is a single watermark: any event newer than `cap_notif_seen`.
// On first ever run the watermark is set to now, so the user is not flooded
// with the full history — notifications accrue going forward.
// ═══════════════════════════════════════════════

const NOTIF_SEEN_KEY = 'cap_notif_seen';
const getNotifSeen = () => localStorage.getItem(NOTIF_SEEN_KEY) || '';
const setNotifSeen = iso => localStorage.setItem(NOTIF_SEEN_KEY, iso);

const NOTIF_ICON = {
  'tests-added':     '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>',
  'retest-scheduled':'<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  'retest-failed':   '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'retest-resolved': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'lab-sent':        '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  'lab-generated':   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'
};
const NOTIF_COLOR = { blue:'#1A5276', amber:'#D97706', red:'#C0392B', green:'#059669', navy:'#16243d', gray:'#6B7280' };

function notifRelTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d < 7)  return d + 'd ago';
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

// Build the event feed from the synced caches. Newest first.
function buildNotifications() {
  const out  = [];
  const hist = (typeof GH === 'function') ? GH() : [];
  const resolved = (typeof GRV === 'function') ? GRV() : [];
  const subs = (typeof getSubmissions === 'function') ? getSubmissions() : [];

  // 1) New tests added — group non-retest records by building + collection date + who saved them
  const groups = {};
  hist.forEach(h => {
    if (h.retestNum) return;         // retests are their own events
    if (!h.enteredAt) return;        // need an audit timestamp
    const k = h.planta + '|' + h.fecha + '|' + (h.enteredByEmail || '');
    if (!groups[k]) groups[k] = { plant:h.planta, fecha:h.fecha, actorEmail:h.enteredByEmail||'', actor:h.enteredByName||'', count:0, ts:'' };
    groups[k].count++;
    if (h.enteredAt > groups[k].ts) groups[k].ts = h.enteredAt;
  });
  Object.keys(groups).forEach(k => {
    const g = groups[k];
    out.push({ key:'tests|'+k, cat:'tests-added', tone:'blue', plant:g.plant,
      actor:g.actor, actorEmail:g.actorEmail, ts:g.ts, page:'history',
      title: g.count + ' new test' + (g.count>1?'s':'') + ' · ' + g.plant,
      sub: 'Collection ' + g.fecha });
  });

  // 2 & 3) Retests scheduled / resolved (ResolvedRetests)
  resolved.forEach(r => {
    const ts = r.enteredAt || (r.resolvedDate ? r.resolvedDate + 'T12:00:00.000Z' : '');
    if (!ts) return;
    if (r.closedOnGenerate) {
      out.push({ key:'rsch|'+r.originalId, cat:'retest-scheduled', tone:'amber', plant:r.planta,
        actor:r.enteredByName||'', actorEmail:r.enteredByEmail||'', ts, page:'retests',
        title:'3 retests scheduled · ' + r.planta, sub:'Sample #' + r.sample });
    } else {
      out.push({ key:'rok|'+r.originalId+'|'+r.resolvedDate, cat:'retest-resolved', tone:'green', plant:r.planta,
        actor:r.enteredByName||'', actorEmail:r.enteredByEmail||'', ts, page:'retests',
        title:'Retests resolved OK · ' + r.planta, sub:'Sample #' + r.sample });
    }
  });

  // 4) Retest failed — a retest record that came back Positive
  hist.forEach(h => {
    if (h.retestNum && h.resultado === 'Positive') {
      const ts = h.resultDate ? h.resultDate + 'T12:00:00.000Z' : (h.enteredAt || '');
      if (!ts) return;
      out.push({ key:'rfail|'+h.id, cat:'retest-failed', tone:'red', plant:h.planta,
        actor:'', actorEmail:'', ts, page:'retests',
        title: h.retestNum + ' came back POSITIVE · ' + h.planta,
        sub: 'Sample #' + h.sample + (h.failedPathogensLabel ? ' · ' + h.failedPathogensLabel : '') });
    }
  });

  // 5) Lab submissions (generated / sent)
  subs.forEach((s, i) => {
    const ts = s.submittedAt || '';
    if (!ts) return;
    const sent = String(s.status || '').toLowerCase().indexOf('sent') >= 0;
    out.push({ key:'sub|'+(s.fileName||i)+'|'+ts, cat: sent?'lab-sent':'lab-generated',
      tone: sent?'navy':'gray', plant:s.building, actor:s.submittedByName||'', actorEmail:s.submittedByEmail||'',
      ts, page:'submissions',
      title:(sent ? 'Lab form sent · ' : 'Lab form generated · ') + s.building,
      sub:'Sample ' + (s.sample || '—') + (s.type ? ' · ' + s.type : '') });
  });

  out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return out;
}

// Bell badge — count of events newer than the seen watermark.
function updateNotifBadge() {
  const el = document.getElementById('notifCount');
  if (!el) return;
  let seen = getNotifSeen();
  if (!seen) { seen = new Date().toISOString(); setNotifSeen(seen); }  // first run: nothing unread
  const unread = buildNotifications().filter(n => n.ts > seen).length;
  el.textContent = unread > 9 ? '9+' : String(unread);
  el.style.display = unread > 0 ? 'flex' : 'none';
}

function renderNotifPanel() {
  const body = document.getElementById('notifBody');
  if (!body) return;
  const list = buildNotifications();
  const seen = getNotifSeen();
  const meEmail = (CU && CU.email || '').toLowerCase();
  if (!list.length) {
    body.innerHTML = '<div style="padding:36px 20px;text-align:center;color:var(--gray-400);font-size:13px">No activity yet</div>';
    return;
  }
  body.innerHTML = list.slice(0, 40).map(n => {
    const unread = seen ? (n.ts > seen) : true;
    const color  = NOTIF_COLOR[n.tone] || '#6B7280';
    const who    = n.actor ? ((n.actorEmail && n.actorEmail.toLowerCase() === meEmail) ? 'You' : n.actor) : '';
    const meta   = [who, notifRelTime(n.ts)].filter(Boolean).join(' · ');
    return `<div class="notif-item" onclick="notifGoto('${n.page}')" style="border-left:3px solid ${unread?color:'transparent'};background:${unread?'#f4f8fd':'#fff'}">
      <span style="flex:none;width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:${color}1a;color:${color}">
        <svg class="ln" width="15" height="15" viewBox="0 0 24 24">${NOTIF_ICON[n.cat]||''}</svg>
      </span>
      <div style="min-width:0;flex:1">
        <div style="font-size:13px;font-weight:600;color:var(--gray-900);line-height:1.35">${esc(n.title)}</div>
        <div style="font-size:12px;color:var(--gray-600);margin-top:1px">${esc(n.sub)}</div>
        ${meta ? '<div style="font-size:11px;color:var(--gray-400);margin-top:2px">'+esc(meta)+'</div>' : ''}
      </div>
      ${unread ? '<span style="flex:none;width:7px;height:7px;border-radius:50%;background:'+color+';margin-top:6px"></span>' : ''}
    </div>`;
  }).join('');
}

function toggleNotifPanel() {
  const p = document.getElementById('notifPanel');
  if (!p) return;
  if (p.classList.contains('open')) { closeNotifPanel(); return; }
  renderNotifPanel();
  p.classList.add('open');
  setTimeout(() => document.addEventListener('click', notifOutside), 0);
}
function closeNotifPanel() {
  const p = document.getElementById('notifPanel');
  if (p) p.classList.remove('open');
  document.removeEventListener('click', notifOutside);
}
function notifOutside(e) {
  const w = document.getElementById('notifWrap');
  if (w && !w.contains(e.target)) closeNotifPanel();
}

function markAllNotifRead() {
  const list = buildNotifications();
  const now  = new Date().toISOString();
  const newest = list.length ? list[0].ts : now;
  setNotifSeen(newest > now ? newest : now);
  updateNotifBadge();
  renderNotifPanel();
}

function notifGoto(page) {
  closeNotifPanel();
  if (typeof showPage === 'function') showPage(page);
}
