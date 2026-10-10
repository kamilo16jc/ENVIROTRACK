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

  // Reflect the current page name in the top bar.
  const _titles = { dashboard:'Dashboard', history:'Test History', retests:'Retests',
    submissions:'Lab Submissions', generator:'Generate Tests', reports:'Reports',
    facilitymap:'Facility Map', settings:'Settings' };
  const _pt = document.getElementById('pageTitle');
  if(_pt && _titles[p]) _pt.textContent = _titles[p];

  // Lazy-load the facility map iframe the first time it's opened.
  if(p==='facilitymap') loadFacilityMap();

  // Highlight parent group button for dropdown items
  const groupMap = {
    'history': 'nav-records', 'retests': 'nav-records', 'submissions': 'nav-records',
    'generator': 'nav-testing', 'reports': 'nav-testing', 'facilitymap': 'nav-testing',
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

// Top-bar hamburger menu (holds Refresh / Notifications / Log out).
function toggleNavMenu(e) {
  if (e) e.stopPropagation();
  const m = document.getElementById('navMenu'); if (m) m.classList.toggle('open');
  const p = document.getElementById('notifPanel'); if (p) p.classList.remove('open');
}
function closeNavMenu() {
  const m = document.getElementById('navMenu'); if (m) m.classList.remove('open');
}
// Click outside the user area closes the menu and the notifications panel.
document.addEventListener('click', function (e) {
  const inUser = e.target.closest && e.target.closest('.nav-user');
  if (!inUser) {
    closeNavMenu();
    const p = document.getElementById('notifPanel'); if (p) p.classList.remove('open');
  }
});

function updateNotifDot() {
  const hist     = GH();
  const resolved = GRV();
  const rids     = new Set(resolved.map(r => r.originalId));
  const active   = hist.filter(h => h.resultado === 'Positive' && !h.retestNum && !rids.has(h.id));
  const dot = document.getElementById('notifDot');
  if(dot) dot.classList.toggle('show', active.length > 0);
}

// The facility map is confidential: it is served from Firestore
// (private/facilityMap, signed-in users only), never from the public site.
async function loadFacilityMap() {
  const f = document.getElementById('facilityMapFrame');
  if (!f || f.dataset.loaded === '1') return;
  f.dataset.loaded = '1';
  let doc = null;
  try { doc = typeof storePrivate === 'function' ? await storePrivate('facilityMap') : null; } catch (e) {}
  if (doc && doc.html) { f.srcdoc = doc.html; return; }
  f.dataset.loaded = '';
  f.srcdoc = '<p style="font-family:Arial,sans-serif;color:#65715f;padding:28px">The facility map is available after signing in. Try again in a moment.</p>';
}

