// ═══════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════
function showPage(p) {
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
    'history': 'nav-records', 'retests': 'nav-records',
    'generator': 'nav-testing', 'reports': 'nav-testing',
    'settings': 'nav-settings'
  };
  if(groupMap[p]) {
    const parent = document.getElementById(groupMap[p]);
    if(parent) parent.classList.add('active');
  }

  // Update notification dot
  updateNotifDot();

  // Trigger page logic
  if(p==='dashboard') refreshDashboard();
  if(p==='history')   searchHistory();
  if(p==='retests')   loadRetests();
  if(p==='reports')   { switchRepTab('stats'); }
  if(p==='settings')  { loadUsersTable(); switchCfgTab('users'); }
}

function updateNotifDot() {
  const hist     = GH();
  const resolved = GRV();
  const rids     = new Set(resolved.map(r => r.originalId));
  const active   = hist.filter(h => h.resultado === 'Positive' && !h.retestNum && !rids.has(h.id));
  const dot = document.getElementById('notifDot');
  if(dot) dot.classList.toggle('show', active.length > 0);
}
