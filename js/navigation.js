// ═══════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════
function showPage(p) {
  // Guard: leaving the generator with tests that were generated but never saved.
  const curEl = document.querySelector('.page.active');
  const curId = curEl ? curEl.id.replace('page-', '') : '';
  if (curId === 'generator' && p !== 'generator' && _genUnsaved && TESTS.length) {
    _genPendingNav = p;
    const m = document.getElementById('unsavedModal'); if (m) m.style.display = 'flex';
    return;   // hold navigation until the user decides
  }

  // Hide all pages
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));

  // Reset all nav buttons
  document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));

  // Show target page
  const page = document.getElementById('page-'+p);
  if(page) page.classList.add('active');

  // Highlight correct nav button
  const navEl = document.getElementById('nav-'+p);
  if(navEl) navEl.classList.add('active');

  // Highlight parent group button for dropdown items
  const groupMap = {
    'history': 'nav-records', 'retests': 'nav-records', 'submissions': 'nav-records',
    'generator': 'nav-testing', 'reports': 'nav-testing',
    'settings': 'nav-settings'
  };
  if(groupMap[p]) {
    const parent = document.getElementById(groupMap[p]);
    if(parent) parent.classList.add('active');
  }

  // Update notification bell
  if (typeof updateNotifBadge === 'function') updateNotifBadge();

  // Trigger page logic
  if(p==='dashboard') refreshDashboard();
  if(p==='history')   searchHistory();
  if(p==='retests')   loadRetests();
  if(p==='submissions') { loadSubmissions(); refreshSubmissions(); }
  if(p==='reports')   { switchRepTab('stats'); }
  if(p==='settings')  { loadUsersTable(); switchCfgTab('users'); }
}

// Resolve the "unsaved tests" prompt: save & go, leave without saving, or stay.
function unsavedResolve(action) {
  const m = document.getElementById('unsavedModal'); if (m) m.style.display = 'none';
  const target = _genPendingNav; _genPendingNav = null;
  if (action === 'cancel') return;                       // stay on the generator
  if (action === 'save') {
    if (!saveWeek({ skipConfirm: true })) return;        // save failed → stay
  } else if (action === 'leave') {
    setGenUnsaved(false);                                // user chose to discard the reminder
  }
  if (target) showPage(target);
}

// Last-resort net: warn before closing/reloading the tab with unsaved tests.
window.addEventListener('beforeunload', function (e) {
  if (_genUnsaved && TESTS && TESTS.length) { e.preventDefault(); e.returnValue = ''; }
});

function updateNotifDot() {
  const hist     = GH();
  const resolved = GRV();
  const rids     = new Set(resolved.map(r => r.originalId));
  const active   = hist.filter(h => h.resultado === 'Positive' && !h.retestNum && !rids.has(h.id));
  const dot = document.getElementById('notifDot');
  if(dot) dot.classList.toggle('show', active.length > 0);
}
