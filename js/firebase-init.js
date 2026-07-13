// ═══════════════════════════════════════════════════════════════
// FIREBASE — Initialization, Auth & helpers
// (uses the "compat" SDK loaded via CDN → global `firebase` object)
// ═══════════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyCUMxDD5LHVNAIP5Nx1Mrkt2L9G4pQGEFY",
  authDomain: "envirotrack-5173f.firebaseapp.com",
  projectId: "envirotrack-5173f",
  storageBucket: "envirotrack-5173f.firebasestorage.app",
  messagingSenderId: "837603440295",
  appId: "1:837603440295:web:5c200e682eb4710bce0d82",
  measurementId: "G-6GSPR7VRVP"
};

firebase.initializeApp(firebaseConfig);

const fbAuth = firebase.auth();
const fbFunctions = firebase.app().functions("us-central1");

// NON-persistent session: closing the tab signs the user out.
// Ideal for shared plant PCs (forces login every time).
fbAuth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(() => {});

// ── Admin: who sees the Settings panel ───────────────────────
// List here the emails that should see the settings (points
// management, etc.). If left empty, ALL signed-in users
// see it. E.g. const ADMIN_EMAILS = ["jagudelo@caputocheese.com"];
// Root admin emails — always treated as admins (matches ROOT_ADMINS in the
// Cloud Function). Users promoted to the "Administrator" role also count.
const ADMIN_EMAILS = ["jagudelo@caputocheese.com"];
function isAdmin(email, role) {
  if (role === "Administrator") return true;
  return ADMIN_EMAILS.includes((email || "").toLowerCase());
}

// ── Firebase auth errors → English messages ────────────────────
function fbAuthError(e) {
  const code = (e && e.code) || "";
  switch (code) {
    case "auth/invalid-email":        return "Invalid email.";
    case "auth/user-disabled":        return "Account disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":   return "Incorrect email or password.";
    case "auth/too-many-requests":    return "Too many attempts. Please wait a moment.";
    case "auth/network-request-failed": return "No connection. Check your internet.";
    default:                          return "Could not sign in.";
  }
}
