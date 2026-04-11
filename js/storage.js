// ═══════════════════════════════════════════════
// STATE (single declaration of each variable)
// ═══════════════════════════════════════════════
let CU      = null;   // currentUser
let TESTS   = [];     // currentTests
let OVRS    = [];     // overrides
let PENDO   = null;   // pendingOverride
let RTITEMS = [];     // retestItems in generator
let QAC     = null;   // quickAddCandidate
let QPATS   = {ecoli:0,listeria:1,salmonella:0,saureus:0};
let FAILID  = null;
let FAILRES = null;
let OKID    = null;

// ═══════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════
const GH  = ()  => JSON.parse(localStorage.getItem('cap_h')  || '[]');
const GW  = ()  => JSON.parse(localStorage.getItem('cap_w')  || '[]');
const GRV = ()  => JSON.parse(localStorage.getItem('cap_rv') || '[]');
const SH  = h   => localStorage.setItem('cap_h',  JSON.stringify(h));
const SW  = w   => localStorage.setItem('cap_w',  JSON.stringify(w));
const SRV = rv  => localStorage.setItem('cap_rv', JSON.stringify(rv));

// ═══════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════
function toast(msg, type='info') {
  const t = document.getElementById('toast');
  t.textContent = ({success:'✅',error:'❌',info:'ℹ️'})[type] + ' ' + msg;
  t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');