// ═══════════════════════════════════════════════════════════════
// EnviroTrack — server-side audit trail of test records.
// Every change to an existing record (any writer: the app, a script, the
// SharePoint import) appends an entry to recordChanges. The app's own entries
// carry the reason; this one cannot be skipped from the browser, so a change
// with no app entry shows up as "no reason given".
// ═══════════════════════════════════════════════════════════════
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const REGION = "us-central1";
const AUDIT_FIELDS = ["fecha", "planta", "sample", "retestNum", "zone", "area", "location", "prodStart", "collTime",
  "resultado", "resultDate", "failedPathogensLabel", "labNotes", "voided", "voidReason"];
const RESULT_FIELDS = new Set(["resultado", "resultDate", "failedPathogensLabel", "labNotes"]);

const str = v => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

// Display names of the writers, looked up once per instance.
const _names = {};
async function nameOf(email) {
  if (!email || !email.includes("@")) return email || "";
  if (_names[email] === undefined) {
    _names[email] = await getAuth().getUserByEmail(email).then(u => u.displayName || "", () => "");
  }
  return _names[email] || email;
}

exports.auditRecords = onDocumentWritten({ document: "records/{id}", region: REGION }, async (ev) => {
  const before = ev.data && ev.data.before && ev.data.before.exists ? ev.data.before.data() : null;
  const after = ev.data && ev.data.after && ev.data.after.exists ? ev.data.after.data() : null;
  if (!before || !after) return;                 // creations are not changes; records are never deleted
  const changes = AUDIT_FIELDS.filter(k => str(before[k]) !== str(after[k]))
    .map(k => ({ field: k, from: str(before[k]).slice(0, 300), to: str(after[k]).slice(0, 300) }));
  if (!changes.length) return;
  const entered = (before.resultado || "Pending") === "Pending" && (after.resultado || "Pending") !== "Pending"
    && changes.every(c => RESULT_FIELDS.has(c.field));
  const by = String(after._by || "");
  const id = "srv_" + ev.params.id + "_" + Date.now();
  await getFirestore().collection("recordChanges").doc(id).set({
    id, source: "server",
    recordId: Number(ev.params.id) || 0, planta: after.planta || "", sample: after.sample || 0,
    recordDate: after.fecha || "", retestNum: after.retestNum || "",
    action: entered ? "entered" : "edit", changes, reason: "", samples: [],
    byEmail: by, byName: await nameOf(by), at: new Date().toISOString(),
    _by: "server", _at: FieldValue.serverTimestamp(),
  });
});
