// ═══════════════════════════════════════════════════════════════
// TWO-STEP VERIFICATION — authenticator app (TOTP), required for everyone
// After the password, the user types the 6-digit code their authenticator
// app shows (Apple Passwords, Google Authenticator, Microsoft Authenticator…).
//   · The code is checked by EnviroTrack's own server (functions mfaStatus,
//     mfaSetupStart, mfaSetupFinish, mfaVerify). A right code marks the
//     current session; the server and the database rules refuse sessions
//     that did not type it.
//   · Firebase's own two-step verification is not used for new set-ups: it
//     mails an "undo" link that the company mail scanner opens by itself,
//     which removed the factor every time. Accounts still on it keep working
//     through the old path below (Firebase asks for the code at sign-in).
// ═══════════════════════════════════════════════════════════════

const _mfaFn = name => fbFunctions.httpsCallable(name);

// ── The sign-in card: steps, busy button, leaving ───────────────────────
const _labReduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const _labEase = 'cubic-bezier(.2,.8,.2,1)';
// The button shows a spinner and a short label while the server answers.
function labBusy(btn, on, label) {
  if (!btn) return;
  const s = btn.querySelector('span');
  if (!btn.dataset.label) btn.dataset.label = s.textContent;
  btn.classList.remove('is-busy', 'is-done');
  if (on) { btn.classList.add('is-busy'); s.textContent = label || 'Verifying…'; btn.disabled = true; }
  else { s.textContent = btn.dataset.label; btn.disabled = false; }
}
function labDone(btn, label) {
  if (!btn) return;
  btn.classList.remove('is-busy'); btn.classList.add('is-done'); btn.disabled = true;
  btn.querySelector('span').textContent = label || 'Verified';
}
function labCodeVisible() { const c = document.getElementById('loginCodeStep'); return !!(c && c.style.display !== 'none'); }
// Password <-> code: the card keeps its size and the new step slides in.
function labShowStep(which) {
  const side = document.querySelector('#enviro-login-single-logo .lab-formside');
  const form = document.getElementById('lab-form'), code = document.getElementById('loginCodeStep'), head = document.getElementById('labFormHeading');
  const toCode = which === 'code', show = toCode ? code : form, hide = toCode ? form : code;
  if (hide.style.display === 'none' && show.style.display !== 'none') return;
  const h0 = side.offsetHeight;
  side.style.minHeight = toCode ? h0 + 'px' : '';
  hide.style.display = 'none'; show.style.display = '';
  if (head) head.textContent = toCode ? 'Two-step verification' : 'Sign in';
  if (_labReduced()) return;
  const h1 = side.offsetHeight;
  if (Math.abs(h1 - h0) > 2) side.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: 300, easing: _labEase });
  show.animate([{ opacity: 0, transform: 'translateX(' + (toCode ? 18 : -18) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 340, easing: _labEase });
  if (head) head.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 340, easing: _labEase });
}
// After the last step: the card fades away into the loading screen.
function labLeave() {
  const p = document.querySelector('#enviro-login-single-logo .lab-panel');
  if (!p || _labReduced()) return Promise.resolve();
  p.classList.add('lab-leaving');
  return new Promise(r => setTimeout(r, 260));
}
// Back to a clean password step (sign-out, cancel).
function labReset() {
  const p = document.querySelector('#enviro-login-single-logo .lab-panel'); if (p) p.classList.remove('lab-leaving');
  labBusy(document.querySelector('#lab-form .lab-enter'), false);
  labBusy(document.getElementById('loginCodeBtn'), false);
  const code = document.getElementById('loginCodeStep'), form = document.getElementById('lab-form');
  if (code) code.style.display = 'none'; if (form) form.style.display = '';
  const side = document.querySelector('#enviro-login-single-logo .lab-formside'); if (side) side.style.minHeight = '';
  const head = document.getElementById('labFormHeading'); if (head) head.textContent = 'Sign in';
}
// The code field: digits only; the sixth digit sends it.
function _labCodeInput(input, form) {
  input.classList.remove('is-wrong');
  input.oninput = () => {
    input.classList.remove('is-wrong');
    const d = input.value.replace(/\D/g, '').slice(0, 6);
    if (input.value !== d) input.value = d;
    if (d.length === 6 && !document.getElementById('loginCodeBtn').disabled) form.requestSubmit();
  };
}
// A wrong code: the field shakes, empties and waits for the next one.
function _labWrong(input) { input.classList.remove('is-wrong'); void input.offsetWidth; input.classList.add('is-wrong'); setTimeout(() => { input.value = ''; input.focus(); }, 380); }

// What the server's answers mean for the person typing.
function mfaError(e) {
  const m = String((e && (e.idtk || e.message || e.code)) || '');
  if (/mfa-wrong-code|INVALID_CODE|INVALID_VERIFICATION_CODE|invalid-verification-code|MISSING_CODE/i.test(m)) return 'That code is not right. Type the code the app shows now.';
  if (/mfa-locked|TOO_MANY|too-many|resource-exhausted/i.test(m)) return 'Too many wrong codes. Wait 5 minutes and try again.';
  if (/mfa-already-set-up/i.test(m)) return 'Two-step verification is already set up for this account. Ask an administrator to reset it.';
  if (/mfa-not-set-up/i.test(m)) return 'Two-step verification is not set up yet. Sign in again.';
  if (/MFA_SECRET_KEY|not configured/i.test(m)) return 'Two-step verification is not ready on the server yet. Tell an administrator.';
  if (/PENDING_CREDENTIAL|SESSION_EXPIRED|code-expired|expired/i.test(m)) return 'This step expired. Start again.';
  if (/not provisioned|permission-denied/i.test(m)) return 'This account has no access. Ask an administrator.';
  if (/NETWORK|network|unavailable|internal|not-found|deadline/i.test(m)) return 'No connection to the server. Try again.';
  return 'Could not verify the code.';
}
// The same message plus the server's own reason when it is not a known one.
function mfaErrorFull(e) {
  const raw = String((e && (e.idtk || e.message || e.code)) || '').replace(/^[a-z-]+: /, '').slice(0, 120);
  try { console.warn('[two-step]', raw, e); } catch (x) {}
  const msg = mfaError(e);
  return msg === 'Could not verify the code.' && raw ? msg + ' (' + raw + ')' : msg;
}

// Did this session type the code? (server-checked session, or Firebase's own factor)
function mfaSignedIn(tokenResult) {
  const c = (tokenResult && tokenResult.claims) || {};
  if (c.firebase && c.firebase.sign_in_second_factor) return true;
  return Array.isArray(c.mfa_s) && c.mfa_s.includes(c.auth_time);
}

// ── After the password: the code, or the set-up the first time ─────────
// Resolves with the new token once the session has typed the code; rejects
// with { cancelled: true } when the user backs out (they are signed out).
async function mfaSecondStep() {
  const st = (await _mfaFn('mfaStatus')()).data || {};
  if (!st.session) {
    if (st.enrolled) await _mfaAskCode();
    else await _mfaSetup();
  }
  // New token: it now carries this session in the "mfa_s" claim.
  const tok = await fbAuth.currentUser.getIdTokenResult(true);
  if (!mfaSignedIn(tok)) throw Object.assign(new Error('The server did not confirm the code. Try again.'), { mfaMsg: true });
  return tok;
}

function _mfaCancel(reject) {
  try { fbAuth.signOut(); } catch (e) {}
  reject({ cancelled: true });
}

// The code step on the login card.
function _mfaAskCode() {
  const box = document.getElementById('loginCodeStep');
  const input = document.getElementById('loginCode'), err = document.getElementById('loginCodeError');
  const btn = document.getElementById('loginCodeBtn');
  return new Promise((resolve, reject) => {
    const who = document.getElementById('loginCodeWho'); if (who) who.textContent = (fbAuth.currentUser && fbAuth.currentUser.email) || 'your account';
    input.value = ''; input.readOnly = false; err.textContent = ''; labBusy(btn, false);
    labBusy(document.querySelector('#lab-form .lab-enter'), false);
    labShowStep('code');
    _labCodeInput(input, box);
    setTimeout(() => input.focus(), 120);
    const release = () => { box.onsubmit = null; input.oninput = null; document.getElementById('loginCodeCancel').onclick = null; };
    document.getElementById('loginCodeCancel').onclick = () => { release(); labShowStep('password'); _labBackToPassword(); _mfaCancel(reject); };
    box.onsubmit = async ev => {
      ev.preventDefault();
      const code = input.value.replace(/\D/g, '');
      if (code.length !== 6) { err.textContent = 'Type the 6-digit code.'; _labWrong(input); return; }
      err.textContent = ''; labBusy(btn, true, 'Verifying…'); input.readOnly = true; input.classList.remove('is-wrong');
      try { await _mfaFn('mfaVerify')({ code }); release(); labDone(btn, 'Verified'); resolve(); }
      catch (e) { labBusy(btn, false); input.readOnly = false; err.textContent = mfaErrorFull(e); _labWrong(input); }
    };
  });
}
function _labBackToPassword() {
  const pw = document.getElementById('loginPassword'); if (pw) { pw.value = ''; setTimeout(() => pw.focus(), 120); }
}

// First sign-in: QR + first code.
let _mfaSetupState = null;
function _mfaSetup() {
  const m = document.getElementById('mfaModal');
  document.getElementById('mfaIntro').textContent = 'EnviroTrack asks for a code from your phone after your password. Set it up now: it takes a minute.';
  document.getElementById('mfaQr').innerHTML = '';
  document.getElementById('mfaSecret').textContent = '';
  document.getElementById('mfaCode').value = '';
  const err = document.getElementById('mfaErr'); err.style.color = 'var(--gray-500)'; err.textContent = 'Preparing…';
  document.getElementById('mfaVerify').disabled = true;
  labBusy(document.querySelector('#lab-form .lab-enter'), false);
  m.classList.add('open');
  return new Promise((resolve, reject) => {
    _mfaSetupState = { resolve, reject };
    _mfaFn('mfaSetupStart')().then(r => {
      const t = r.data || {};
      new QRCode(document.getElementById('mfaQr'), { text: t.uri, width: 184, height: 184, correctLevel: QRCode.CorrectLevel.M });
      document.getElementById('mfaSecret').textContent = String(t.secret || '').replace(/(.{4})/g, '$1 ').trim();
      err.textContent = '';
      document.getElementById('mfaVerify').disabled = false;
      setTimeout(() => document.getElementById('mfaCode').focus(), 50);
    }).catch(e => { err.style.color = 'var(--red)'; err.textContent = mfaErrorFull(e); });
  });
}
async function mfaVerifySetup() {
  const s = _mfaSetupState; if (!s) return;
  const code = document.getElementById('mfaCode').value.replace(/\D/g, '');
  const err = document.getElementById('mfaErr');
  if (code.length !== 6) { err.style.color = 'var(--red)'; err.textContent = 'Type the 6-digit code the app shows.'; return; }
  const btn = document.getElementById('mfaVerify'); btn.disabled = true;
  err.style.color = 'var(--gray-500)'; err.textContent = 'Verifying…';
  try {
    await _mfaFn('mfaSetupFinish')({ code });
    document.getElementById('mfaModal').classList.remove('open');
    _mfaSetupState = null; s.resolve();
  } catch (e) {
    err.style.color = 'var(--red)'; err.textContent = mfaErrorFull(e);
    btn.disabled = false;
  }
}
// "Cancel" in the set-up: back to the login, signed out.
function mfaLater() {
  document.getElementById('mfaModal').classList.remove('open');
  const s = _mfaSetupState; _mfaSetupState = null;
  if (s) _mfaCancel(s.reject);
}

// ── Accounts still on Firebase's own factor ─────────────────────────────
// Firebase asks for the code at the password step (auth/multi-factor-auth-required).
// The compat SDK has no TOTP helper, so the code goes to the Identity Toolkit
// REST API through this assertion object (the SDK only calls _process).
function _idtkUrl(path) {
  const host = (typeof FB_EMU !== 'undefined' && FB_EMU) ? 'http://127.0.0.1:9099/identitytoolkit.googleapis.com' : 'https://identitytoolkit.googleapis.com';
  return host + path + '?key=' + encodeURIComponent(firebaseConfig.apiKey);
}
async function _idtk(path, body) {
  let r;
  try { r = await fetch(_idtkUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch (e) { const x = new Error('network'); x.idtk = 'NETWORK'; throw x; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const m = (j.error && j.error.message) || ('HTTP ' + r.status); const x = new Error(m); x.idtk = m; throw x; }
  return j;
}
function _totpAssertion(code, info) {
  return {
    factorId: 'totp',
    _process(auth, session) {
      return _idtk('/v2/accounts/mfaSignIn:finalize', {
        mfaPendingCredential: session.credential, mfaEnrollmentId: info.enrollmentId,
        totpVerificationInfo: { verificationCode: code }
      });
    }
  };
}
function mfaAskSignInCode(resolver) {
  const hints = (resolver.hints || []).filter(h => h.factorId === 'totp')
    .sort((x, y) => (Date.parse(y.enrollmentTime) || 0) - (Date.parse(x.enrollmentTime) || 0));
  const box = document.getElementById('loginCodeStep'), form = document.getElementById('lab-form');
  const input = document.getElementById('loginCode'), err = document.getElementById('loginCodeError');
  return new Promise((resolve, reject) => {
    if (!hints.length) { reject(Object.assign(new Error('This account uses a kind of verification this app does not support.'), { mfaMsg: true })); return; }
    const who = document.getElementById('loginCodeWho'); if (who) who.textContent = document.getElementById('loginEmail').value.trim() || 'your account';
    input.value = ''; input.readOnly = false; err.textContent = '';
    const btn = document.getElementById('loginCodeBtn'); labBusy(btn, false);
    labBusy(document.querySelector('#lab-form .lab-enter'), false);
    labShowStep('code');
    _labCodeInput(input, box);
    setTimeout(() => input.focus(), 120);
    const done = () => { box.onsubmit = null; input.oninput = null; document.getElementById('loginCodeCancel').onclick = null; };
    document.getElementById('loginCodeCancel').onclick = () => { done(); labShowStep('password'); _labBackToPassword(); reject({ cancelled: true }); };
    box.onsubmit = async ev => {
      ev.preventDefault();
      const code = input.value.replace(/\D/g, '');
      if (code.length !== 6) { err.textContent = 'Type the 6-digit code.'; _labWrong(input); return; }
      err.textContent = ''; labBusy(btn, true, 'Verifying…'); input.readOnly = true; input.classList.remove('is-wrong');
      try {
        let cred = null, last = null;
        for (const h of hints) {
          try { cred = await resolver.resolveSignIn(_totpAssertion(code, { enrollmentId: h.uid })); break; }
          catch (e) { last = e; if (!/ENROLLMENT_ID|ENROLLMENT_NOT_FOUND|info-not-found/i.test(String(e.idtk || e.code || e.message))) break; }
        }
        if (!cred) throw last;
        done(); labDone(btn, 'Verified'); resolve(cred);
      } catch (e) {
        labBusy(btn, false); input.readOnly = false; err.textContent = mfaErrorFull(e); _labWrong(input);
      }
    };
  });
}
