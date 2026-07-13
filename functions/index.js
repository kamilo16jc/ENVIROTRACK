// ═══════════════════════════════════════════════════════════════
// EnviroTrack — Cloud Functions
// User management (Admin SDK): lets admins create / list / disable /
// delete login accounts and set roles from inside the app.
// (The SharePoint proxy is kept separately in sharepoint.js.disabled
//  and is deployed later, independently.)
// ═══════════════════════════════════════════════════════════════

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

// ── Admin allowlist (bootstrap) ────────────────────────────────────
// These emails can ALWAYS manage users, so there is always at least one
// admin without needing to set a claim first. Additionally, any user
// promoted to the "Administrator" role (custom claim) is also an admin.
// Edit this list to add/remove root admins.
const ROOT_ADMINS = ["jagudelo@caputocheese.com"];

// Throws unless the caller is an admin. Returns the caller's email.
function assertAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must sign in.");
  }
  const email = (request.auth.token.email || "").toLowerCase();
  const isAdmin =
    request.auth.token.role === "Administrator" || ROOT_ADMINS.includes(email);
  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Only administrators can manage users.");
  }
  return email;
}

const REGION = "us-central1";

// List all users (email, name, role, active status, dates).
exports.adminListUsers = onCall({ region: REGION, cors: true }, async (request) => {
  assertAdmin(request);
  const result = await admin.auth().listUsers(1000);
  return result.users.map((u) => ({
    uid: u.uid,
    email: u.email || "",
    name: u.displayName || "",
    role: (u.customClaims && u.customClaims.role) || "Inspector",
    active: !u.disabled,
    created: u.metadata.creationTime || "",
    lastSignIn: u.metadata.lastSignInTime || "",
  }));
});

// Create a new login account. Does NOT sign out the admin.
exports.adminCreateUser = onCall({ region: REGION, cors: true }, async (request) => {
  assertAdmin(request);
  const { email, password, name, role } = request.data || {};
  if (!email || !password) {
    throw new HttpsError("invalid-argument", "Email and password are required.");
  }
  if (String(password).length < 6) {
    throw new HttpsError("invalid-argument", "Password must be at least 6 characters.");
  }
  let user;
  try {
    user = await admin.auth().createUser({ email, password, displayName: name || "" });
  } catch (e) {
    if (e.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "A user with that email already exists.");
    }
    if (e.code === "auth/invalid-email") {
      throw new HttpsError("invalid-argument", "Invalid email address.");
    }
    throw new HttpsError("internal", e.message || "Could not create the user.");
  }
  await admin.auth().setCustomUserClaims(user.uid, { role: role || "Inspector" });
  return { uid: user.uid };
});

// Enable / disable an account (disabled users cannot sign in).
exports.adminSetUserActive = onCall({ region: REGION, cors: true }, async (request) => {
  const callerEmail = assertAdmin(request);
  const { uid, active } = request.data || {};
  if (!uid) throw new HttpsError("invalid-argument", "Missing user id.");
  if (uid === request.auth.uid && active === false) {
    throw new HttpsError("failed-precondition", "You cannot deactivate your own account.");
  }
  await admin.auth().updateUser(uid, { disabled: active === false });
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
  await admin.auth().setCustomUserClaims(uid, { role });
  return { ok: true };
});

// Reset a user's password.
exports.adminResetPassword = onCall({ region: REGION, cors: true }, async (request) => {
  assertAdmin(request);
  const { uid, password } = request.data || {};
  if (!uid || !password || String(password).length < 6) {
    throw new HttpsError("invalid-argument", "Password must be at least 6 characters.");
  }
  await admin.auth().updateUser(uid, { password });
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
  await admin.auth().deleteUser(uid);
  return { ok: true };
});

// ── SharePoint proxy ───────────────────────────────────────────────
// Hides the Power Automate flow URLs (kept in functions/.env, never in the
// public client JS) and only lets SIGNED-IN users trigger them.
const FLOW_ENV = {
  recordsWrite:       "FLOW_RECORDS_WRITE",
  recordsRead:        "FLOW_RECORDS_READ",
  recordsUpdate:      "FLOW_RECORDS_UPDATE",
  resolvedWrite:      "FLOW_RESOLVED_WRITE",
  resolvedRead:       "FLOW_RESOLVED_READ",
  masterWrite:        "FLOW_MASTER_WRITE",
  masterRead:         "FLOW_MASTER_READ",
  masterPointsRead:   "FLOW_MASTERPOINTS_READ",
  masterPointsWrite:  "FLOW_MASTERPOINTS_WRITE",
  masterPointsUpdate: "FLOW_MASTERPOINTS_UPDATE",
  labform:            "FLOW_LABFORM",
  savepdf:            "FLOW_SAVEPDF",
};

exports.spProxy = onCall({ region: REGION, cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must sign in.");
  }
  const { op, body } = request.data || {};
  const envKey = FLOW_ENV[op];
  if (!envKey) {
    throw new HttpsError("invalid-argument", "Unknown operation: " + op);
  }
  const url = process.env[envKey];
  if (!url) {
    throw new HttpsError("failed-precondition", "Flow URL not configured for " + op);
  }
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  } catch (e) {
    throw new HttpsError("unavailable", "Could not reach the SharePoint flow.");
  }
  const text = await res.text();
  if (!res.ok) {
    throw new HttpsError("internal", "Flow returned HTTP " + res.status);
  }
  return text ? JSON.parse(text) : null;
});
