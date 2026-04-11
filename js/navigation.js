// ═══════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════
function showPage(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  document.getElementById('page-'+p).classList.add('active');
  document.getElementById('nav-'+p).classList.add('active');
  if(p==='dashboard') refreshDashboard();
  if(p==='history')   searchHistory();
  if(p==='retests')   loadRetests();
  if(p==='reports')   { switchRepTab('stats'); }
  if(p==='settings')  { loadUsersTable(); switchCfgTab('users'); }
  if(p==='sqf')       { initSQFYears(); buildSQF(); }
}