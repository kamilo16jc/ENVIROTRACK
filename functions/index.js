// ═══════════════════════════════════════════════════════════════
// EnviroTrack — Cloud Functions
// User management (Admin SDK): lets admins create / list / disable /
// delete login accounts and set roles from inside the app.
// (The SharePoint proxy is kept separately in sharepoint.js.disabled
//  and is deployed later, independently.)
// ═══════════════════════════════════════════════════════════════

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

initializeApp();

// ── Cost caps ──────────────────────────────────────────────────────
// 1) At most a few servers per function: a flood of calls waits or is refused
//    instead of starting dozens of billed instances. Normal use needs one.
setGlobalOptions({ maxInstances: 5 });
// 2) Calls per person (or per address, for the public endpoints) within a minute.
//    Counted in memory on each server, so it costs nothing extra; with the cap
//    above, the real ceiling is at most 5 times these numbers.
const LIMITS = { proxy: 120, admin: 30, upload: 30 };   // the manual import: 5 a minute, in spmirror.js
const _hits = new Map();
function overLimit(key, max) {
  const now = Date.now(), recent = (_hits.get(key) || []).filter(t => now - t < 60000);
  if (recent.length >= max) { _hits.set(key, recent); return true; }
  recent.push(now); _hits.set(key, recent);
  if (_hits.size > 5000) for (const [k, v] of _hits) if (!v.length || now - v[v.length - 1] > 60000) _hits.delete(k);
  return false;
}
function rateLimit(key, max) {
  if (overLimit(key, max)) throw new HttpsError("resource-exhausted", "Too many requests. Wait a minute and try again.");
}

// ── Photo upload tokens ────────────────────────────────────────────
// The phone (capture.html) has no Firebase auth, so the upload endpoint is
// public. To stop anyone from posting files to SharePoint, a signed-in user
// mints a SHORT-LIVED token scoped to one retest; the QR carries it and the
// upload function verifies it (signature + expiry + retestId). HMAC secret in
// functions/.env (PHOTO_TOKEN_SECRET).
function signPhotoToken(retestId, ttlMs) {
  const secret = process.env.PHOTO_TOKEN_SECRET;
  if (!secret) throw new HttpsError("failed-precondition", "Photo tokens not configured.");
  const exp = Date.now() + (ttlMs || 15 * 60 * 1000);   // 15 min
  const payload = Buffer.from(JSON.stringify({ r: String(retestId), e: exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return payload + "." + sig;
}
function verifyPhotoToken(token, retestId) {
  try {
    const secret = process.env.PHOTO_TOKEN_SECRET;
    if (!secret || !token) return false;
    const parts = String(token).split(".");
    if (parts.length !== 2) return false;
    const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest("base64url");
    const a = Buffer.from(parts[1]);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;   // bad signature
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (!data || data.e < Date.now()) return false;                            // expired
    if (String(data.r) !== String(retestId)) return false;                     // wrong retest
    return true;
  } catch (e) { return false; }
}

// ── Admin allowlist (bootstrap) ────────────────────────────────────
// These emails can ALWAYS manage users, so there is always at least one
// admin without needing to set a claim first. Additionally, any user
// promoted to the "Administrator" role (custom claim) is also an admin.
// Edit this list to add/remove root admins.
// Root administrators: functions/.env ROOT_ADMINS (comma separated) — not in the public repo.
const ROOT_ADMINS = String(process.env.ROOT_ADMINS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

// Throws unless the caller is an admin. Returns the caller's email.
function assertAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must sign in.");
  }
  rateLimit("admin:" + request.auth.uid, LIMITS.admin);
  const email = (request.auth.token.email || "").toLowerCase();
  const isAdmin =
    request.auth.token.role === "Administrator" || ROOT_ADMINS.includes(email);
  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Only administrators can manage users.");
  }
  assertAdminMfa(request);
  return email;
}

// The roles an ADMIN assigns to real accounts. A self-registered account (e.g.
// someone who hit the public sign-up endpoint) has NO role claim, so it fails
// this check — which is exactly what blocks anonymous data access.
const VALID_ROLES = ["Inspector", "Manager", "Administrator"];

// Same lab form within this window = duplicate (see spProxy).
const LABFORM_REPEAT_MS = 2 * 60 * 1000;

// Operations only administrators may perform (the monthly email). Sampling
// points are managed in Firestore, where the rules allow administrators only.
const ADMIN_OPS = new Set(["emailmonthly"]);

// Root administrators cannot be disabled, demoted or deleted by other admins.
async function assertNotRoot(uid) {
  const u = await getAuth().getUser(uid).catch(() => null);
  if (u && ROOT_ADMINS.includes(String(u.email || "").toLowerCase())) {
    throw new HttpsError("permission-denied", "This account is protected.");
  }
}

// Effective role of the caller, or null if the account was not provisioned by
// an admin. Root admins are always treated as Administrator.
function roleOf(request) {
  if (!request.auth) return null;
  const email = (request.auth.token.email || "").toLowerCase();
  if (ROOT_ADMINS.includes(email)) return "Administrator";
  const role = request.auth.token.role;
  return VALID_ROLES.includes(role) ? role : null;
}

// ── Two-step verification (everyone) ───────────────────────────────
// EnviroTrack checks the authenticator-app code itself. Firebase's own
// two-step verification mails an "undo" link that company mail scanners open
// by themselves, which removed the second factor every time.
//   · The secret of each person's authenticator app lives in mfaSecrets/{uid}
//     (the database rules give pages no access), encrypted with MFA_SECRET_KEY.
//   · A right code adds the session's sign-in time (token auth_time) to the
//     user's claim "mfa_s" (the last 5 sessions). auth_time stays the same while
//     a session lives and is new at every password sign-in, so a session that
//     typed the code is recognised and a new one is not, until it types it too.
//   · Accounts that still use Firebase's own factor also count
//     (token firebase.sign_in_second_factor).
// Safety valve: MFA=off in functions/.env turns the server checks off (the
// database rules still require the code).
const MFA_ON = String(process.env.MFA || process.env.ADMIN_MFA || "on").toLowerCase() !== "off";
const MFA_SESSIONS = 5;
function signedInWithMfa(request) {
  const t = (request.auth && request.auth.token) || {};
  if (t.firebase && t.firebase.sign_in_second_factor) return true;
  return Array.isArray(t.mfa_s) && t.mfa_s.includes(t.auth_time);
}
function assertMfa(request) {
  if (MFA_ON && !signedInWithMfa(request)) {
    throw new HttpsError("failed-precondition", "mfa-required: Sign in with your two-step verification code.");
  }
}
const assertAdminMfa = assertMfa;

// RFC 6238 codes: 6 digits, 30-second steps, SHA-1 (what authenticator apps use).
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32encode(buf) {
  let bits = 0, val = 0, out = "";
  for (const byte of buf) { val = (val << 8) | byte; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function b32decode(str) {
  let bits = 0, val = 0; const out = [];
  for (const ch of String(str).toUpperCase().replace(/[^A-Z2-7]/g, "")) { val = (val << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totpAt(secret, step) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", b32decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, "0");
}
// The step the code belongs to (now, or one step before/after for clock drift), or -1.
function totpMatch(secret, code, lastStep) {
  const now = Math.floor(Date.now() / 30000);
  for (const d of [0, -1, 1]) {
    const step = now + d;
    if (step <= (lastStep || 0)) continue;                     // a code works once
    const a = Buffer.from(totpAt(secret, step)), b = Buffer.from(code);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return step;
  }
  return -1;
}
function mfaKey() {
  const k = process.env.MFA_SECRET_KEY;
  if (!k) throw new HttpsError("failed-precondition", "Two-step verification is not configured on the server (MFA_SECRET_KEY).");
  return crypto.createHash("sha256").update(k).digest();
}
function sealSecret(secret) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", mfaKey(), iv);
  const enc = Buffer.concat([c.update(secret, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString("base64")).join(".");
}
function openSecret(sealed) {
  const [iv, tag, enc] = String(sealed).split(".").map(x => Buffer.from(x, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", mfaKey(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
const MFA_MAX_FAILS = 5, MFA_LOCK_MS = 5 * 60 * 1000;
const mfaDoc = (uid) => db().collection("mfaSecrets").doc(uid);
// Only a provisioned account may set up or type a code.
function assertMfaCaller(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must sign in.");
  if (!roleOf(request)) throw new HttpsError("permission-denied", "This account is not provisioned.");
  rateLimit("mfa:" + request.auth.uid, LIMITS.admin);
}
const codeOf = (request) => String((request.data && request.data.code) || "").replace(/\D/g, "");
// Remember this session (its auth_time) as one that typed the code.
async function markSession(request) {
  const t = request.auth.token;
  const u = await getAuth().getUser(request.auth.uid);
  const claims = Object.assign({}, u.customClaims || {});
  const list = (Array.isArray(claims.mfa_s) ? claims.mfa_s : []).filter(x => x !== t.auth_time);
  claims.mfa_s = list.concat([t.auth_time]).slice(-MFA_SESSIONS);
  await getAuth().setCustomUserClaims(request.auth.uid, claims);
}
// Check a code against a stored, encrypted secret (with the fail counter).
async function checkCode(ref, field, code) {
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref); const d = snap.exists ? snap.data() : {};
    if (!d[field]) return { ok: false, why: "not-set-up" };
    if (d.lockedUntil && d.lockedUntil > Date.now()) return { ok: false, why: "locked" };
    const step = totpMatch(openSecret(d[field]), code, d.lastStep);
    if (step < 0) {
      const fails = (d.fails || 0) + 1;
      tx.set(ref, fails >= MFA_MAX_FAILS ? { fails: 0, lockedUntil: Date.now() + MFA_LOCK_MS } : { fails }, { merge: true });
      return { ok: false, why: fails >= MFA_MAX_FAILS ? "locked" : "wrong" };
    }
    const upd = { lastStep: step, fails: 0, lockedUntil: 0, lastUsedAt: FieldValue.serverTimestamp() };
    if (field === "pending") Object.assign(upd, { secret: d.pending, pending: FieldValue.delete(), confirmedAt: FieldValue.serverTimestamp() });
    tx.set(ref, upd, { merge: true });
    return { ok: true };
  });
}
function codeError(why) {
  if (why === "locked") throw new HttpsError("resource-exhausted", "mfa-locked: Too many wrong codes. Wait 5 minutes.");
  if (why === "not-set-up") throw new HttpsError("failed-precondition", "mfa-not-set-up: Set up two-step verification first.");
  throw new HttpsError("invalid-argument", "mfa-wrong-code: That code is not right.");
}

// ── New accounts: invite e-mail with a link to create the password ────────
// Only administrators create accounts, and only for the company domains
// (ALLOWED_EMAIL_DOMAINS, default caputocheese.com). The account starts with
// no password; the person gets a one-time link (72 h) to create it. The link
// opens auth-action.html, which does nothing until the person presses the
// button (company mail scanners open every link they see).
// The e-mail goes out from SMTP_USER (the EnviroTrack support Gmail) with an
// app password in SMTP_PASS; without them the admin gets the link to send.
const ALLOWED_EMAIL_DOMAINS = String(process.env.ALLOWED_EMAIL_DOMAINS || "caputocheese.com")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const APP_URL = String(process.env.APP_URL || "https://kamilo16jc.github.io/ENVIROTRACK/").replace(/\/?$/, "/");
const INVITE_MS = 72 * 3600 * 1000;
function assertCompanyEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  const m = /^[^\s@]+@([a-z0-9.-]+)$/.exec(e);
  if (!m || !ALLOWED_EMAIL_DOMAINS.includes(m[1])) {
    throw new HttpsError("invalid-argument", "Only " + ALLOWED_EMAIL_DOMAINS.map(d => "@" + d).join(" / ") + " e-mails can have an account.");
  }
  return e;
}
// An invited account has no password until the person creates it.
const hasPassword = (u) => !!(u && (u.providerData || []).some(p => p.providerId === "password"));
const inviteId = (code) => crypto.createHash("sha256").update(String(code)).digest("hex");
// A new link for this account (older links of the same account stop working).
async function newInvite(uid, email, by) {
  const old = await db().collection("invites").where("uid", "==", uid).get();
  await Promise.all(old.docs.map(d => d.ref.delete()));
  const code = crypto.randomBytes(24).toString("base64url");
  const expiresAt = Date.now() + INVITE_MS;
  await db().collection("invites").doc(inviteId(code)).set({ uid, email, expiresAt, by: by || "", createdAt: FieldValue.serverTimestamp() });
  return { link: APP_URL + "auth-action.html?mode=invite&code=" + code, expiresAt };
}
// Sends the invite (design in invite-mail.js); false when the mail account is
// not set up or the send fails — the admin then gets the link to send.
async function mailInvite(email, name, role, link, expiresAt) {
  // Gmail shows app passwords in groups of 4: the spaces are not part of it.
  const user = String(process.env.SMTP_USER || "").trim(), pass = String(process.env.SMTP_PASS || "").replace(/\s+/g, "");
  if (!user || !pass) return false;
  const until = new Date(expiresAt).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
  try {
    const { inviteMail, LOGO_FILES } = require("./invite-mail");
    const m = inviteMail({ name, email, role, link, until, logos: { envirotrack: "cid:envirotrack-logo", caputo: "cid:caputo-logo" } });
    const nodemailer = require("nodemailer");
    const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
    await t.sendMail({
      from: { name: "EnviroTrack", address: user }, to: email,
      subject: m.subject, text: m.text, html: m.html,
      attachments: [
        { filename: "envirotrack.png", path: LOGO_FILES.envirotrack, cid: "envirotrack-logo" },
        { filename: "caputo.png", path: LOGO_FILES.caputo, cid: "caputo-logo" },
      ],
    });
    return true;
  } catch (e) {
    console.error("invite mail failed:", e && e.message);
    return false;
  }
}

const REGION = "us-central1";
const db = () => getFirestore();

// List all users (email, name, role, active status, dates).
exports.adminListUsers = onCall({ region: REGION, cors: true }, async (request) => {
  assertAdmin(request);
  const result = await getAuth().listUsers(1000);
  const withCode = new Set((await db().collection("mfaSecrets").get()).docs.filter(d => d.get("secret")).map(d => d.id));
  return result.users.map((u) => ({
    uid: u.uid,
    email: u.email || "",
    name: u.displayName || "",
    role: (u.customClaims && u.customClaims.role) || "Inspector",
    active: !u.disabled,
    mfa: withCode.has(u.uid) || !!(u.multiFactor && u.multiFactor.enrolledFactors && u.multiFactor.enrolledFactors.length),
    created: u.metadata.creationTime || "",
    lastSignIn: u.metadata.lastSignInTime || "",
    invited: !hasPassword(u),
  }));
});

// Create a new login account (company e-mail only). It has no password yet:
// the person gets the invite link to create it. Does NOT sign out the admin.
exports.adminCreateUser = onCall({ region: REGION, cors: true }, async (request) => {
  const by = assertAdmin(request);
  const { name, role } = request.data || {};
  const email = assertCompanyEmail((request.data || {}).email);
  let user;
  try {
    // emailVerified: the administrator vouches for the work e-mail.
    user = await getAuth().createUser({ email, displayName: str(name, 80), emailVerified: true });
  } catch (e) {
    if (e.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "A user with that email already exists.");
    }
    if (e.code === "auth/invalid-email") {
      throw new HttpsError("invalid-argument", "Invalid email address.");
    }
    throw new HttpsError("internal", e.message || "Could not create the user.");
  }
  await getAuth().setCustomUserClaims(user.uid, { role: VALID_ROLES.includes(role) ? role : "Inspector" });
  const inv = await newInvite(user.uid, email, by);
  const emailed = await mailInvite(email, str(name, 80), VALID_ROLES.includes(role) ? role : "Inspector", inv.link, inv.expiresAt);
  return { uid: user.uid, emailed, link: inv.link, expiresAt: inv.expiresAt };
});

// A new invite for an account that has no password yet (link lost or expired).
exports.adminSendInvite = onCall({ region: REGION, cors: true }, async (request) => {
  const by = assertAdmin(request);
  const { uid } = request.data || {};
  if (!uid) throw new HttpsError("invalid-argument", "Missing user id.");
  const u = await getAuth().getUser(uid).catch(() => null);
  if (!u || !u.email) throw new HttpsError("not-found", "User not found.");
  if (hasPassword(u)) throw new HttpsError("failed-precondition", "This user already has a password. Use Edit to set a new one.");
  const inv = await newInvite(uid, u.email, by);
  const emailed = await mailInvite(u.email, u.displayName || "", (u.customClaims && u.customClaims.role) || "Inspector", inv.link, inv.expiresAt);
  return { emailed, link: inv.link, expiresAt: inv.expiresAt };
});

// The invite page (auth-action.html). No sign-in: the link itself is the key.
// inviteCheck only reads (a mail scanner opening the page changes nothing);
// inviteAccept sets the password and uses the link up.
async function inviteFor(code) {
  if (!code || String(code).length < 20) return null;
  const ref = db().collection("invites").doc(inviteId(code));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const d = snap.data();
  if (!d.expiresAt || d.expiresAt < Date.now()) { await ref.delete(); return null; }
  return { ref, d };
}
const ipOf = (request) => String((request.rawRequest && request.rawRequest.ip) || "?");
exports.inviteCheck = onCall({ region: REGION, cors: true }, async (request) => {
  rateLimit("invite:" + ipOf(request), LIMITS.admin);
  const inv = await inviteFor((request.data || {}).code);
  if (!inv) throw new HttpsError("not-found", "invite-invalid: This link has expired or was already used.");
  return { email: inv.d.email, expiresAt: inv.d.expiresAt };
});
exports.inviteAccept = onCall({ region: REGION, cors: true }, async (request) => {
  rateLimit("invite:" + ipOf(request), LIMITS.admin);
  const { code, password } = request.data || {};
  const pw = String(password || "");
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
    throw new HttpsError("invalid-argument", "invite-weak: Use at least 8 characters with letters and numbers.");
  }
  const inv = await inviteFor(code);
  if (!inv) throw new HttpsError("not-found", "invite-invalid: This link has expired or was already used.");
  await getAuth().updateUser(inv.d.uid, { password: pw });
  await inv.ref.delete();
  return { email: inv.d.email };
});

// Enable / disable an account (disabled users cannot sign in).
exports.adminSetUserActive = onCall({ region: REGION, cors: true }, async (request) => {
  const callerEmail = assertAdmin(request);
  const { uid, active } = request.data || {};
  if (!uid) throw new HttpsError("invalid-argument", "Missing user id.");
  if (uid === request.auth.uid && active === false) {
    throw new HttpsError("failed-precondition", "You cannot deactivate your own account.");
  }
  await assertNotRoot(uid);
  await getAuth().updateUser(uid, { disabled: active === false });
  return { ok: true };
});

// Change a user's role (Inspector / Manager / Administrator).
exports.adminSetRole = onCall({ region: REGION, cors: true }, async (request) => {
  assertAdmin(request);
  const { uid, role } = request.data || {};
  const allowed = ["Inspector", "Manager", "Administrator"];
  if (!uid || !allowed.includes(role)) {
    throw new HttpsError("invalid-argument", "Invalid user id or role.");
  }
  if (role !== "Administrator") await assertNotRoot(uid);
  const cur = await getAuth().getUser(uid);
  await getAuth().setCustomUserClaims(uid, Object.assign({}, cur.customClaims || {}, { role }));
  return { ok: true };
});

// Reset a user's password.
exports.adminResetPassword = onCall({ region: REGION, cors: true }, async (request) => {
  assertAdmin(request);
  const { uid, password } = request.data || {};
  if (!uid || !password || String(password).length < 6) {
    throw new HttpsError("invalid-argument", "Password must be at least 6 characters.");
  }
  await getAuth().updateUser(uid, { password });
  return { ok: true };
});

// Turn off a user's two-step verification (lost or new phone). They set it up
// again at their next sign-in. Every open session of that user is closed.
exports.adminResetMfa = onCall({ region: REGION, cors: true }, async (request) => {
  assertAdmin(request);
  const { uid } = request.data || {};
  if (!uid) throw new HttpsError("invalid-argument", "Missing user id.");
  if (uid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "Another administrator must reset your own two-step verification.");
  }
  await assertNotRoot(uid);
  await mfaDoc(uid).delete();
  const u = await getAuth().getUser(uid);
  const claims = Object.assign({}, u.customClaims || {}); delete claims.mfa_s;
  await getAuth().setCustomUserClaims(uid, claims);
  if (u.multiFactor && u.multiFactor.enrolledFactors && u.multiFactor.enrolledFactors.length) {
    await getAuth().updateUser(uid, { multiFactor: { enrolledFactors: null } });
  }
  await getAuth().revokeRefreshTokens(uid);
  return { ok: true };
});

// ── Two-step verification: the steps the sign-in page calls ──────────────
// Is it set up for me, and does this session already count?
exports.mfaStatus = onCall({ region: REGION, cors: true }, async (request) => {
  assertMfaCaller(request);
  const d = (await mfaDoc(request.auth.uid).get()).data() || {};
  return { enrolled: !!d.secret, session: signedInWithMfa(request) };
});

// First time: a new secret for the authenticator app (QR). Refused once one is set
// up, so a stolen password cannot replace the owner's phone.
exports.mfaSetupStart = onCall({ region: REGION, cors: true }, async (request) => {
  assertMfaCaller(request);
  const ref = mfaDoc(request.auth.uid);
  const d = (await ref.get()).data() || {};
  if (d.secret) throw new HttpsError("already-exists", "mfa-already-set-up: Two-step verification is already set up. Ask an administrator to reset it.");
  const secret = b32encode(crypto.randomBytes(20));
  await ref.set({ pending: sealSecret(secret), createdAt: FieldValue.serverTimestamp(), fails: 0 }, { merge: true });
  const label = encodeURIComponent("EnviroTrack:" + (request.auth.token.email || request.auth.uid));
  return { secret, uri: "otpauth://totp/" + label + "?secret=" + secret + "&issuer=EnviroTrack&algorithm=SHA1&digits=6&period=30" };
});

// First code from the app: saves the secret and lets this session in.
exports.mfaSetupFinish = onCall({ region: REGION, cors: true }, async (request) => {
  assertMfaCaller(request);
  const code = codeOf(request);
  if (code.length !== 6) throw new HttpsError("invalid-argument", "mfa-wrong-code: Type the 6-digit code.");
  const r = await checkCode(mfaDoc(request.auth.uid), "pending", code);
  if (!r.ok) codeError(r.why === "not-set-up" ? "wrong" : r.why);
  await markSession(request);
  return { ok: true };
});

// Every sign-in: the code from the app lets this session in.
exports.mfaVerify = onCall({ region: REGION, cors: true }, async (request) => {
  assertMfaCaller(request);
  const code = codeOf(request);
  if (code.length !== 6) throw new HttpsError("invalid-argument", "mfa-wrong-code: Type the 6-digit code.");
  const r = await checkCode(mfaDoc(request.auth.uid), "secret", code);
  if (!r.ok) codeError(r.why);
  await markSession(request);
  return { ok: true };
});

// Before setting up two-step verification: Firebase requires a verified email.
// Accounts exist only because an administrator created them (sign-up is off),
// so a provisioned account's email is marked verified here.
exports.mfaPrepare = onCall({ region: REGION, cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must sign in.");
  if (!roleOf(request)) throw new HttpsError("permission-denied", "This account is not provisioned.");
  rateLimit("admin:" + request.auth.uid, LIMITS.admin);
  if (!request.auth.token.email_verified) await getAuth().updateUser(request.auth.uid, { emailVerified: true });
  return { ok: true };
});

// Delete an account.
exports.adminDeleteUser = onCall({ region: REGION, cors: true }, async (request) => {
  assertAdmin(request);
  const { uid } = request.data || {};
  if (!uid) throw new HttpsError("invalid-argument", "Missing user id.");
  if (uid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "You cannot delete your own account.");
  }
  await assertNotRoot(uid);
  await getAuth().deleteUser(uid);
  const inv = await db().collection("invites").where("uid", "==", uid).get();
  await Promise.all(inv.docs.map(d => d.ref.delete()));
  return { ok: true };
});

// ── SharePoint proxy ───────────────────────────────────────────────
// Hides the Power Automate flow URLs (kept in functions/.env, never in the
// public client JS) and only lets SIGNED-IN, provisioned users trigger them.
// Data is written to Firestore first; SharePoint only receives copies made by
// the server (spmirror.js). So the proxy no longer offers the old direct
// writes or reads of Records / ResolvedRetests / MasterPoints / Submissions —
// only files (lab form, PDFs, photos) and the monthly email.
const FLOW_ENV = {
  labform:            "FLOW_LABFORM",
  templateRead:       "FLOW_TEMPLATE_READ",
  savepdf:            "FLOW_SAVEPDF",
  emailmonthly:       "FLOW_EMAIL_MONTHLY",
  photoUploadUrl:     "FLOW_PHOTO_UPLOAD",
  photosRead:         "FLOW_PHOTOS_READ",
  photoContent:       "FLOW_PHOTO_CONTENT",
};

// Who may email the laboratory: private/appConfig.labSenders (Firestore, not
// in the public repo). Read on the server, so hiding the button is not the
// only gate. Cached for a minute.
let _senders = { at: 0, list: [] };
async function labSenders() {
  if (Date.now() - _senders.at < 60000) return _senders.list;
  const d = await db().collection("private").doc("appConfig").get();
  let c = d.exists ? d.data() : {};
  if (c && typeof c.json === "string") { try { c = JSON.parse(c.json); } catch (e) { c = {}; } }
  const list = (Array.isArray(c && c.labSenders) ? c.labSenders : []).map(x => String(x).trim().toLowerCase()).filter(Boolean);
  _senders = { at: Date.now(), list };
  return list;
}

const str = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").slice(0, max || 200);
// A file name the flows may create (they add the extension): no folders,
// no control characters.
const safeFileName = (n) => {
  const s = String(n || "").trim();
  return s.length > 0 && s.length <= 180 && !/[\\/:*?"<>|\u0000-\u001f]/.test(s) && !s.includes("..");
};

exports.spProxy = onCall({ region: REGION, cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must sign in.");
  }
  // Being signed in is NOT enough: the account must have an admin-assigned role.
  // This blocks self-registered accounts from reading/writing any SharePoint data.
  const role = roleOf(request);
  if (!role) {
    throw new HttpsError(
      "permission-denied",
      "This account is not provisioned for data access."
    );
  }
  rateLimit("proxy:" + request.auth.uid, LIMITS.proxy);
  assertMfa(request);
  const email = String(request.auth.token.email || "").toLowerCase();
  const { op } = request.data || {};
  const body = Object.assign({}, (request.data && request.data.body) || {});
  // photoToken: mint a short-lived, retest-scoped upload token for the QR. Only
  // a signed-in, provisioned user (checked above) can get one.
  if (op === "photoToken") {
    const rid = String(body.retestId || "");
    if (!rid) throw new HttpsError("invalid-argument", "Missing retestId");
    return { token: signPhotoToken(rid) };
  }
  const envKey = FLOW_ENV[op];
  if (!envKey) {
    throw new HttpsError("invalid-argument", "Unknown operation: " + op);
  }
  // Sensitive operations require the Administrator role.
  if (ADMIN_OPS.has(op)) {
    if (role !== "Administrator") {
      throw new HttpsError("permission-denied", "Only administrators can perform this operation.");
    }
    assertAdminMfa(request);
  }
  // Only photos the upload function created can be read back.
  if (op === "photoContent" && !/^photo_[0-9A-Za-z]+_[0-9]+\.(jpg|png)$/.test(String(body.fileName || ""))) {
    throw new HttpsError("invalid-argument", "Not a photo of this app.");
  }
  const url = process.env[envKey];
  if (!url) {
    throw new HttpsError("failed-precondition", "Flow URL not configured for " + op);
  }
  // photoUploadUrl: the QR embeds the URL the phone will POST to. The phone has no
  // Firebase auth and the raw Power Automate URL has no CORS headers, so a browser
  // POST is blocked. Return the CORS-enabled `photoUpload` function instead (it
  // forwards to the flow server-side, keeping the flow URL hidden too).
  if (op === "photoUploadUrl") {
    return { url: "https://" + REGION + "-envirotrack-5173f.cloudfunctions.net/photoUpload" };
  }
  // PDFs are archived in the flow's own folder: a plain .pdf name and real PDF content.
  if (op === "savepdf") {
    if (!safeFileName(body.fileName)) throw new HttpsError("invalid-argument", "Invalid file name.");
    const b64 = String(body.contentBase64 || "");
    if (!b64.startsWith("JVBERi0")) throw new HttpsError("invalid-argument", "Only PDF files are archived.");
    if (b64.length > 20 * 1024 * 1024) throw new HttpsError("invalid-argument", "The PDF is too large.");
    delete body.folder;
  }
  // labform: checked and logged HERE, in Firestore, before the flow runs.
  //  · Emailing the lab needs to be in labSenders (checked on the server).
  //  · Who sent it comes from the sign-in, not from what the page says.
  //  · An identical form (same file, rows and send/fill) arriving again within
  //    2 minutes — a double click, or two devices — does not run the flow twice.
  let lockRef = null, subRef = null;
  if (op === "labform") {
    if (!safeFileName(body.fileName)) throw new HttpsError("invalid-argument", "Invalid file name.");
    if (body.sendToLab && !(await labSenders()).includes(email)) {
      throw new HttpsError("permission-denied", "Your account is not allowed to send forms to the laboratory.");
    }
    body.submittedByEmail = email;
    body.submittedByName = str(request.auth.token.name || body.submittedByName || email.split("@")[0], 120);
    body.submittedAt = new Date().toISOString();
    body.status = body.sendToLab ? "Sent to lab" : "Generated";
    const key = crypto.createHash("sha256")
      .update([body.fileName, !!body.sendToLab, body.building, body.collectionDate, body.rowsJson].join("|")).digest("hex");
    lockRef = db().collection("opLocks").doc("labform_" + key);
    const first = await db().runTransaction(async (tx) => {
      const d = await tx.get(lockRef);
      if (d.exists && Date.now() - (d.data().at || 0) < LABFORM_REPEAT_MS) return false;
      tx.set(lockRef, { at: Date.now(), by: email, fileName: str(body.fileName) });
      return true;
    });
    if (!first) return { duplicate: true };
    subRef = db().collection("submissions").doc();
    await subRef.set({
      building: str(body.building, 20), sample: str(body.sample, 400), type: str(body.type || "Generator", 20),
      retestNum: str(body.retestNum, 20), status: body.status, fileName: str(body.fileName),
      collectionDate: str(body.collectionDate, 20), submittedByEmail: email, submittedByName: body.submittedByName,
      submittedAt: body.submittedAt, _by: email, _at: FieldValue.serverTimestamp(), _src: "server",
    });
  }
  // A failed run is undone: the log entry goes and it may be retried at once.
  const undo = () => Promise.all([
    lockRef ? lockRef.delete().catch(() => {}) : null,
    subRef ? subRef.delete().catch(() => {}) : null,
  ]);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    await undo();
    throw new HttpsError("unavailable", "Could not reach the SharePoint flow.");
  }
  const text = await res.text();
  if (!res.ok) {
    await undo();
    throw new HttpsError("internal", "Flow returned HTTP " + res.status);
  }
  // photoContent / templateRead return the raw base64 of a file (not JSON).
  // Unwrap a surrounding quote if the flow returned it as a JSON string.
  if (op === "photoContent" || op === "templateRead") {
    let c = text || "";
    if (c[0] === '"') { try { c = JSON.parse(c); } catch (e) {} }
    return { content: c };
  }
  try { return text ? JSON.parse(text) : null; } catch (e) { return null; }
});

// ── Public photo upload (CORS) ─────────────────────────────────────
// The phone (capture.html, scanned from the retest QR) has no Firebase auth and
// the raw Power Automate upload URL returns no CORS headers → a browser POST is
// blocked ("Network error"). This CORS-enabled endpoint receives the photo and
// forwards it to the flow server-side (the flow URL stays hidden). Unauthenticated
// The phone posts here with a signed, short-lived, retest-scoped token (minted
// by a signed-in user via op 'photoToken'). Four gates stop abuse: (1) valid
// unexpired token, (2) must be a real image (JPEG/PNG magic bytes), (3) size cap,
// (4) filename forced server-side (client can't set .exe/.html). Then forwards
// to the flow (flow URL stays hidden).
exports.photoUpload = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST only" }); return; }
  if (overLimit("upload:" + (req.ip || "?"), LIMITS.upload)) { res.status(429).json({ ok: false, error: "too many requests" }); return; }
  const b = req.body || {};
  const retestId = String(b.retestId || "");
  // 1) Token: valid signature + not expired + scoped to THIS retest.
  if (!verifyPhotoToken(b.token, retestId)) {
    res.status(403).json({ ok: false, error: "invalid or expired upload token" }); return;
  }
  // 2) Real image only — JPEG (/9j/) or PNG (iVBORw0KGgo) in base64.
  const b64 = String(b.contentBase64 || "");
  if (!/^(\/9j\/|iVBORw0KGgo)/.test(b64)) {
    res.status(400).json({ ok: false, error: "only JPEG/PNG images are accepted" }); return;
  }
  // 3) Size cap (~9 MB decoded).
  if (b64.length > 12 * 1024 * 1024) {
    res.status(413).json({ ok: false, error: "image too large" }); return;
  }
  // 4) Force a safe, server-generated filename (ignore whatever the client sent).
  const safeName = "photo_" + retestId.replace(/[^0-9A-Za-z]/g, "") + "_" + Date.now() + ".jpg";
  const url = process.env.FLOW_PHOTO_UPLOAD;
  if (!url) { res.status(500).json({ ok: false, error: "not configured" }); return; }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        retestId: retestId,
        fileName: safeName,
        contentBase64: b64,
        label: String(b.label || "").slice(0, 200),
        uploadedAt: b.uploadedAt || new Date().toISOString(),
      }),
    });
    if (r.ok) { res.status(200).json({ ok: true }); }
    else { res.status(502).json({ ok: false, status: r.status }); }
  } catch (e) {
    res.status(502).json({ ok: false, error: "upstream" });
  }
});

// Firestore <-> SharePoint mirror + import (see spmirror.js)
Object.assign(exports, require("./spmirror"));
// Server-side audit trail of test records (see audit.js)
Object.assign(exports, require("./audit"));
