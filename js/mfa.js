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
  const box = document.getElementById('loginCodeStep'), form = document.getElementById('lab-form');
  const input = document.getElementById('loginCode'), err = document.getElementById('loginCodeError');
  return new Promise((resolve, reject) => {
    form.style.display = 'none'; box.style.display = '';
    input.value = ''; err.textContent = '';
    setTimeout(() => input.focus(), 50);
    const done = () => { box.style.display = 'none'; form.style.display = ''; box.onsubmit = null; document.getElementById('loginCodeCancel').onclick = null; };
    document.getElementById('loginCodeCancel').onclick = () => { done(); _mfaCancel(reject); };
    box.onsubmit = async ev => {
      ev.preventDefault();
      const code = input.value.replace(/\D/g, '');
      if (code.length !== 6) { err.textContent = 'Type the 6-digit code.'; return; }
      err.textContent = 'Verifying…';
      const btn = document.getElementById('loginCodeBtn'); btn.disabled = true;
      try { await _mfaFn('mfaVerify')({ code }); done(); resolve(); }
      catch (e) { err.textContent = mfaErrorFull(e); input.select(); }
      finally { btn.disabled = false; }
    };
  });
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
    form.style.display = 'none'; box.style.display = '';
    input.value = ''; err.textContent = '';
    setTimeout(() => input.focus(), 50);
    const done = () => { box.style.display = 'none'; form.style.display = ''; box.onsubmit = null; document.getElementById('loginCodeCancel').onclick = null; };
    document.getElementById('loginCodeCancel').onclick = () => { done(); reject({ cancelled: true }); };
    box.onsubmit = async ev => {
      ev.preventDefault();
      const code = input.value.replace(/\D/g, '');
      if (code.length !== 6) { err.textContent = 'Type the 6-digit code.'; return; }
      err.textContent = 'Verifying…';
      const btn = document.getElementById('loginCodeBtn'); btn.disabled = true;
      try {
        let cred = null, last = null;
        for (const h of hints) {
          try { cred = await resolver.resolveSignIn(_totpAssertion(code, { enrollmentId: h.uid })); break; }
          catch (e) { last = e; if (!/ENROLLMENT_ID|ENROLLMENT_NOT_FOUND|info-not-found/i.test(String(e.idtk || e.code || e.message))) break; }
        }
        if (!cred) throw last;
        done(); resolve(cred);
      } catch (e) {
        err.textContent = mfaErrorFull(e); input.select();
      } finally { btn.disabled = false; }
    };
  });
}
