// ═══════════════════════════════════════════════
// LOGIN / LOGOUT
// ═══════════════════════════════════════════════
function doLogin() { doLogin_dynamic(); }

function doLogout() {
  clearTimeout(sessionTimer); clearTimeout(warnTimer); clearInterval(countdownTimer);
  hideSessionWarning();
  CU = null; TESTS = []; OVRS = []; RTITEMS = [];
  document.getElementById('loginName').value = '';
  document.getElementById('pinInput').value  = '';
  document.getElementById('loginError').textContent = '';
  document.getElementById('appScreen').classList.remove('active');
  document.getElementById('loginScreen').classList.add('active');
}