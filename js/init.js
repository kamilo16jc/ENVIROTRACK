// ═══════════════════════════════════════════════
// SESSION TIMEOUT — 5 minutes inactivity
// ═══════════════════════════════════════════════
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const WARN_BEFORE_MS     = 60 * 1000;      // warn 1 minute before
let sessionTimer   = null;
let warnTimer      = null;
let countdownTimer = null;
let timeLeft       = 60;

function resetSessionTimer() {
  // Only track if logged in
  if(!CU) return;
  clearTimeout(sessionTimer);
  clearTimeout(warnTimer);
  clearInterval(countdownTimer);
  hideSessionWarning();

  // Warning at 4 min
  warnTimer = setTimeout(() => {
    showSessionWarning();
  }, SESSION_TIMEOUT_MS - WARN_BEFORE_MS);

  // Logout at 5 min
  sessionTimer = setTimeout(() => {
    forceLogout();
  }, SESSION_TIMEOUT_MS);
}

function showSessionWarning() {
  if(!CU) return;
  timeLeft = 60;
  document.getElementById('sessionWarning').style.display = 'flex';
  document.getElementById('sessionCountdown').textContent = timeLeft;
  countdownTimer = setInterval(() => {
    timeLeft--;
    document.getElementById('sessionCountdown').textContent = timeLeft;
    if(timeLeft <= 0) clearInterval(countdownTimer);
  }, 1000);
}

function hideSessionWarning() {
  document.getElementById('sessionWarning').style.display = 'none';
  clearInterval(countdownTimer);
}

function extendSession() {
  resetSessionTimer();
  toast('✅ Sesión extendida 5 minutos más', 'success');
}

function forceLogout() {
  hideSessionWarning();
  clearTimeout(sessionTimer);
  clearTimeout(warnTimer);
  clearInterval(countdownTimer);
  doLogout();
  // Show message on login screen
  setTimeout(() => {
    document.getElementById('loginError').textContent =
      '⏱ Sesión cerrada por inactividad. Vuelve a ingresar.';
    document.getElementById('loginError').style.color = 'var(--yellow)';
  }, 100);
}

// Track all user activity
const ACTIVITY_EVENTS = ['mousemove','mousedown','keydown','touchstart','click','scroll'];
ACTIVITY_EVENTS.forEach(evt =>
  document.addEventListener(evt, () => { if(CU) resetSessionTimer(); }, {passive:true})
);

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('genDate').value = new Date().toISOString().split('T')[0];
});

// ── EnviroTrack typing animation ─────────────────
(function(){
  var full='EnviroTrack', el=document.getElementById('et-typed'), i=0;
  if(!el) return;
  function type(){
    if(i<=full.length){
      el.textContent=full.slice(0,i); i++;
      setTimeout(type, i===1?500:75+Math.random()*35);
    } else {
      var c=document.getElementById('et-cursor');
      if(c) c.style.animation='etblink 1s step-end infinite';
    }
  }
  setTimeout(type,400);
})();