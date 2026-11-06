// ═══════════════════════════════════════════════════════════════
// TWO-STEP VERIFICATION — authenticator app (TOTP)
// After the password, the user types the 6-digit code their authenticator
// app shows (Google Authenticator, Microsoft Authenticator, …).
//   · Administrators must have it: they set it up at their first sign-in,
//     and the server and the database rules refuse an admin session that was
//     opened without the code.
//   · Anyone else may turn it on from the menu.
// The Firebase "compat" SDK this app loads only ships SMS codes, so the TOTP
// steps call the Identity Toolkit REST API directly and hand the result back
// to the SDK through the assertion object below (the SDK only calls its
// _process method). The SDK version is pinned in index.html.
// ═══════════════════════════════════════════════════════════════

const MFA_ROLES = ['Administrator'];
const mfaRequiredFor = role => MFA_ROLES.includes(role);

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
// What the server's error codes mean for the person typing.
function mfaError(e) {
  const m = String((e && (e.idtk || e.code || e.message)) || '');
  if (/INVALID_CODE|INVALID_VERIFICATION_CODE|invalid-verification-code|MISSING_CODE/i.test(m)) return 'That code is not right. Type the code the app shows now.';
  if (/PENDING_CREDENTIAL|SESSION_EXPIRED|code-expired|INVALID_SESSION_INFO|expired/i.test(m)) return 'This step expired. Start again.';
  if (/OPERATION_NOT_ALLOWED|TOTP.*not.*enabled|not enabled|CONFIGURATION_NOT_FOUND/i.test(m)) return 'Two-step verification is not turned on in Firebase yet.';
  if (/CREDENTIAL_TOO_OLD|requires-recent-login|TOKEN_EXPIRED/i.test(m)) return 'Sign out and sign in again, then set it up right away.';
  if (/UNVERIFIED_EMAIL/i.test(m)) return 'This account could not be prepared. Ask an administrator.';
  if (/NETWORK|network|functions\/(unavailable|internal|not-found)/i.test(m)) return 'No connection to the server. Try again.';
  if (/TOO_MANY|too-many/i.test(m)) return 'Too many attempts. Wait a moment.';
  if (/NOT_SAVED/.test(m)) return 'Firebase did not save the two-step verification.';
  return 'Could not verify the code.';
}
// The same message plus Firebase's own reason, so a failure can be traced.
function mfaErrorFull(e) {
  const raw = String((e && (e.idtk || e.code || e.message)) || '').slice(0, 120);
  try { console.warn('[two-step]', raw, e); } catch (x) {}
  return mfaError(e) + (raw ? ' (' + raw + ')' : '');
}

// The SDK calls _process(auth, session): session.type is 'enroll' (credential =
// ID token) or 'signin' (credential = the pending sign-in from the password step).
function _totpAssertion(code, info) {
  return {
    factorId: 'totp',
    _process(auth, session, displayName) {
      if (session.type === 'enroll') {
        return _idtk('/v2/accounts/mfaEnrollment:finalize', {
          idToken: session.credential, displayName: displayName || 'Authenticator app',
          totpVerificationInfo: { sessionInfo: info.sessionInfo, verificationCode: code }
        });
      }
      return _idtk('/v2/accounts/mfaSignIn:finalize', {
        mfaPendingCredential: session.credential, mfaEnrollmentId: info.enrollmentId,
        totpVerificationInfo: { verificationCode: code }
      });
    }
  };
}

function mfaSignedIn(tokenResult) {
  const f = (tokenResult && tokenResult.claims && tokenResult.claims.firebase) || {};
  return !!f.sign_in_second_factor;
}
function mfaEnrolled(user) {
  return !!(user && user.multiFactor && user.multiFactor.enrolledFactors && user.multiFactor.enrolledFactors.length);
}

// ── Sign-in: the code step on the login card ───────────────────
// Resolves with the user credential, or rejects with { cancelled: true }.
function mfaAskSignInCode(resolver) {
  const hint = (resolver.hints || []).find(h => h.factorId === 'totp');
  const box = document.getElementById('loginCodeStep'), form = document.getElementById('lab-form');
  const input = document.getElementById('loginCode'), err = document.getElementById('loginCodeError');
  return new Promise((resolve, reject) => {
    if (!hint) { reject(Object.assign(new Error('This account uses a kind of verification this app does not support.'), { mfaMsg: true })); return; }
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
        const cred = await resolver.resolveSignIn(_totpAssertion(code, { enrollmentId: hint.uid }));
        done(); resolve(cred);
      } catch (e) {
        const msg = mfaError(e);
        err.textContent = mfaErrorFull(e); input.select();
        if (/expired/i.test(msg)) { setTimeout(() => { done(); reject({ cancelled: true, msg }); }, 1600); }
      } finally { btn.disabled = false; }
    };
  });
}

// ── Set up: QR + first code ────────────────────────────────────
// opts.required: no "Later" button (administrators). Resolves true when done.
let _mfaSetup = null;
function mfaOpenSetup(opts) {
  opts = opts || {};
  const m = document.getElementById('mfaModal');
  document.getElementById('mfaLater').style.display = opts.required ? 'none' : '';
  document.getElementById('mfaIntro').textContent = opts.required
    ? 'Administrators need two-step verification. Set it up now: it takes a minute.'
    : 'After your password, EnviroTrack will also ask for a code from your phone.';
  document.getElementById('mfaQr').innerHTML = '';
  document.getElementById('mfaSecret').textContent = '';
  document.getElementById('mfaCode').value = '';
  const err = document.getElementById('mfaErr'); err.style.color = 'var(--gray-500)'; err.textContent = 'Preparing…';
  document.getElementById('mfaVerify').disabled = true;
  m.classList.add('open');
  return new Promise(resolve => {
    _mfaSetup = { resolve, info: null };
    _mfaStart().catch(e => {
      err.style.color = 'var(--red)'; err.textContent = mfaErrorFull(e);
      if (opts.required) document.getElementById('mfaLater').style.display = '';   // cannot be set up now: let them in
    });
  });
}
async function _mfaStart() {
  const user = fbAuth.currentUser; if (!user) throw new Error('signed out');
  // Firebase only enrolls accounts with a verified email: the server marks it
  // (accounts are created by administrators), then the token is refreshed.
  if (!user.emailVerified) { await fbFunctions.httpsCallable('mfaPrepare')(); await user.reload(); }
  const r = await _idtk('/v2/accounts/mfaEnrollment:start', { idToken: await user.getIdToken(true), totpEnrollmentInfo: {} });
  const t = r.totpSessionInfo || {};
  if (!t.sharedSecretKey || !t.sessionInfo) throw new Error('no secret');
  _mfaSetup.info = t;
  const issuer = 'EnviroTrack', account = user.email || 'user';
  const url = 'otpauth://totp/' + encodeURIComponent(issuer + ':' + account) + '?secret=' + t.sharedSecretKey +
    '&issuer=' + encodeURIComponent(issuer) + '&algorithm=' + (t.hashingAlgorithm || 'SHA1') +
    '&digits=' + (t.verificationCodeLength || 6) + '&period=' + (t.periodSec || 30);
  new QRCode(document.getElementById('mfaQr'), { text: url, width: 184, height: 184, correctLevel: QRCode.CorrectLevel.M });
  document.getElementById('mfaSecret').textContent = t.sharedSecretKey.replace(/(.{4})/g, '$1 ').trim();
  const err = document.getElementById('mfaErr'); err.style.color = 'var(--gray-500)'; err.textContent = '';
  document.getElementById('mfaVerify').disabled = false;
  setTimeout(() => document.getElementById('mfaCode').focus(), 50);
}
async function mfaVerifySetup() {
  const s = _mfaSetup; if (!s || !s.info) return;
  const code = document.getElementById('mfaCode').value.replace(/\D/g, '');
  const err = document.getElementById('mfaErr');
  if (code.length !== 6) { err.style.color = 'var(--red)'; err.textContent = 'Type the 6-digit code the app shows.'; return; }
  const btn = document.getElementById('mfaVerify'); btn.disabled = true;
  err.style.color = 'var(--gray-500)'; err.textContent = 'Verifying…';
  try {
    await fbAuth.currentUser.multiFactor.enroll(_totpAssertion(code, { sessionInfo: s.info.sessionInfo }), 'Authenticator app');
    // Ask Firebase itself whether the factor is on the account before saying it is done.
    const look = await _idtk('/v1/accounts:lookup', { idToken: await fbAuth.currentUser.getIdToken(true) });
    const acct = (look.users || [])[0] || {};
    if (!(acct.mfaInfo || []).length) { const x = new Error('NOT_SAVED'); x.idtk = 'NOT_SAVED: ' + JSON.stringify((acct.mfaInfo || []).map(f => Object.keys(f))); throw x; }
    document.getElementById('mfaModal').classList.remove('open');
    _mfaSetup = null; s.resolve(true);
  } catch (e) {
    err.style.color = 'var(--red)'; err.textContent = mfaErrorFull(e);
    btn.disabled = false;
  }
}
function mfaLater() {
  document.getElementById('mfaModal').classList.remove('open');
  const s = _mfaSetup; _mfaSetup = null; if (s) s.resolve(false);
}

// After setting it up, the session is opened again with the code, so it
// carries the second factor everywhere (server and database rules).
async function mfaSetupThenSignInAgain(opts) {
  const ok = await mfaOpenSetup(opts);
  if (!ok) return false;
  try { doLogout(); } catch (e) {}
  const err = document.getElementById('loginError');
  if (err) err.textContent = 'Two-step verification is on. Sign in again and type the code from your app.';
  return true;
}

// Menu → Two-step verification
function openMfaFromMenu() {
  const user = fbAuth.currentUser; if (!user) return;
  if (mfaEnrolled(user)) {
    const f = user.multiFactor.enrolledFactors[0];
    const when = f.enrollmentTime ? new Date(f.enrollmentTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    toast('Two-step verification is on' + (when ? ' (since ' + when + ')' : '') + '. Lost your phone? Ask an administrator to reset it.', 'info');
    return;
  }
  mfaSetupThenSignInAgain({ required: false });
}
