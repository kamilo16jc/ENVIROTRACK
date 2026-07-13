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

// ── One-time migration: legacy Spanish data values → English ──────
// The app was localized to English; existing records stored with
// 'Positivo'/'Negativo'/'Pendiente' (and role 'Administrador') are
// converted in place so comparisons keep working. Runs once.
(function migrateLangValues() {
  if (localStorage.getItem('cap_i18n') === 'en') return;
  const rmap = { 'Positivo':'Positive', 'Negativo':'Negative', 'Pendiente':'Pending' };
  ['cap_h', 'cap_rv'].forEach(key => {
    try {
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      let changed = false;
      arr.forEach(r => { if (r && rmap[r.resultado]) { r.resultado = rmap[r.resultado]; changed = true; } });
      if (changed) localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {}
  });
  try {
    const users = JSON.parse(localStorage.getItem('cap_users') || '[]');
    let changed = false;
    users.forEach(u => { if (u && u.role === 'Administrador') { u.role = 'Administrator'; changed = true; } });
    if (changed) localStorage.setItem('cap_users', JSON.stringify(users));
  } catch (e) {}
  localStorage.setItem('cap_i18n', 'en');
})();

// ═══════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════
const TOAST_ICONS = {
  success:'<svg class="ln" width="16" height="16" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  error:'<svg class="ln" width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  info:'<svg class="ln" width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
};
function toast(msg, type='info') {
  const t = document.getElementById('toast');
  // strip any leading emoji/symbols the callers may still prepend
  const clean = String(msg == null ? '' : msg)
    .replace(/^[\s℀-➿⬀-⯿️\u{1F000}-\u{1FAFF}]+/u, '').trim();
  t.innerHTML = '<span class="toast-ico">' + (TOAST_ICONS[type] || TOAST_ICONS.info) +
                '</span><span>' + esc(clean) + '</span>';
  t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');