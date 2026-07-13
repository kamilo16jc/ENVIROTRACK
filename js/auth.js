// ═══════════════════════════════════════════════
// LOGIN / LOGOUT
// ═══════════════════════════════════════════════
function doLogin() { doLogin_dynamic(); }

function doLogout() {
  try { clearTimeout(sessionTimer); } catch(e){}
  try { clearTimeout(warnTimer); } catch(e){}
  try { clearInterval(countdownTimer); } catch(e){}
  try { const sw=document.getElementById('sessionWarning'); if(sw) sw.style.display='none'; } catch(e){}
  try { fbAuth.signOut(); } catch(e){}
  CU = null; TESTS = []; OVRS = []; RTITEMS = [];
  try { document.getElementById('loginEmail').value = ''; } catch(e){}
  try { document.getElementById('loginPassword').value  = ''; } catch(e){}
  try { document.getElementById('loginError').textContent = ''; } catch(e){}
  const app=document.getElementById('appScreen');
  const login=document.getElementById('loginScreen');
  if(app)   app.classList.remove('active');
  if(login) login.classList.add('active');
}