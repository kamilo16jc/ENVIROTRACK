// ═══════════════════════════════════════════════════════════════
// FIRESTORE ⇄ SHAREPOINT
// Firestore is the primary database. SharePoint keeps a full copy:
//   • spMirror* triggers copy every create / change of records, resolved
//     retests and master points to SharePoint through the existing Power
//     Automate flows (URLs in functions/.env — never in the client).
//   • spImport pulls from SharePoint anything Firestore does not have yet:
//     the one-time migration of the history, plus a safety net every 30 min
//     for devices still running the old version (which write to SharePoint).
// Bookkeeping lives in spMirror/{collection}__{id} (server-only).
// ═══════════════════════════════════════════════════════════════

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const REGION = "us-central1";
const db = () => admin.firestore();
const nowIso = () => new Date().toISOString();

async function callFlow(envKey, body) {
  const url = process.env[envKey];
  if (!url) throw new Error("flow not configured: " + envKey);
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const text = await r.text();
  if (!r.ok) throw new Error(envKey + " HTTP " + r.status + " " + text.slice(0, 200));
  return text ? (() => { try { return JSON.parse(text); } catch (e) { return text; } })() : null;
}

// ── Mappers (same shapes the app sent before) ──────────────────
const spInt = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : v; };
const val = v => (v && typeof v === "object" && "Value" in v) ? v.Value : v;
const pick = (o, ...keys) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };
const arr = s => Array.isArray(s) ? s : (s ? String(s).split(",").map(x => x.trim()).filter(Boolean) : []);
const todayUtc = () => new Date().toISOString().slice(0, 10);

function recordToSP(r) {
  return {
    id: spInt(r.id), fecha: r.fecha, department: r.planta, by: r.by || "",
    sample: spInt(r.sample), zone: spInt(r.zone), area: r.area || "", line: r.line || "",
    location: r.location || "",
    ecoli: r.ecoli ? 1 : 0, listeria: r.listeria ? 1 : 0, salmonella: r.salmonella ? 1 : 0, saureus: r.saureus ? 1 : 0,
    resultado: r.resultado || "Pending", retestNum: r.retestNum || "",
    labNotes: r.labNotes || "", isRetest: !!r.isRetest,
    originalId: spInt(r.originalId) || 0, scheduled: !!r.scheduled,
    enteredByEmail: r.enteredByEmail || "", enteredByName: r.enteredByName || "", enteredAt: r.enteredAt || nowIso()
  };
}
function recordUpdateToSP(r) {
  return {
    id: spInt(r.id), fecha: r.fecha || todayUtc(), resultado: r.resultado || "",
    resultDate: r.resultDate || r.fecha || todayUtc(), labNotes: r.labNotes || "",
    failedPathogens: Array.isArray(r.failedPathogens) ? r.failedPathogens.join(",") : (r.failedPathogens || ""),
    failedPathogensLabel: r.failedPathogensLabel || ""
  };
}
function resolvedToSP(r) {
  return {
    originalId: r.originalId, sample: r.sample, department: r.planta, area: r.area || "", location: r.location || "",
    originalDate: r.originalDate || "", resolvedDate: r.resolvedDate || "", retestNum: r.retestNum || "", notes: r.notes || "",
    closedOnGenerate: !!r.closedOnGenerate,
    enteredByEmail: r.enteredByEmail || "", enteredByName: r.enteredByName || "", enteredAt: r.enteredAt || nowIso()
  };
}
function pointToSP(p, isCreate) {
  const o = { department: p.plant, sample: p.sample, zone: p.zone, area: p.area || "", line: p.line || "", location: p.location || "", active: p.active !== false };
  if (isCreate) Object.assign(o, { enteredByEmail: p.enteredByEmail || "", enteredByName: p.enteredByName || "", enteredAt: p.enteredAt || nowIso() });
  return o;
}

function spToRecord(it) {
  return {
    id: Number(pick(it, "id0", "id", "ID")), fecha: pick(it, "Date", "fecha") || "",
    planta: val(pick(it, "Departament", "department", "planta")) || "", by: pick(it, "by", "By") || "",
    sample: Number(pick(it, "sample", "Sample")) || 0, zone: Number(pick(it, "zone", "Zone")) || 0,
    area: pick(it, "Area", "area") || "", line: pick(it, "Line", "line") || "", location: pick(it, "Location", "location") || "",
    ecoli: Number(pick(it, "ecoli", "Ecoli")) || 0, listeria: Number(pick(it, "listeria", "Listeria")) || 0,
    salmonella: Number(pick(it, "salmonella", "Salmonella")) || 0, saureus: Number(pick(it, "saureus", "Saureus")) || 0,
    resultado: val(pick(it, "results", "resultado", "Resultado")) || "Pending", retestNum: pick(it, "retestNum", "RetestNum") || "",
    labNotes: pick(it, "LabNotes", "labNotes") || "", resultDate: pick(it, "ResultDate", "resultDate") || "",
    failedPathogens: arr(pick(it, "failedPathogens", "FailedPathogens")), failedPathogensLabel: pick(it, "failedPathogensLabel", "FailedPathogensLabel") || "",
    isRetest: !!pick(it, "isRetest", "IsRetest"), originalId: Number(pick(it, "originalId", "OriginalId")) || 0,
    scheduled: !!pick(it, "scheduled", "Scheduled"),
    enteredByEmail: pick(it, "enteredByEmail", "EnteredByEmail") || "", enteredByName: pick(it, "enteredByName", "EnteredByName") || "",
    enteredAt: pick(it, "enteredAt", "EnteredAt") || ""
  };
}
function spToResolved(it) {
  return {
    originalId: Number(pick(it, "originalId", "OriginalId")) || 0, sample: Number(pick(it, "sample", "Sample")) || 0,
    planta: val(pick(it, "Departament", "department", "planta")) || "", area: pick(it, "Area", "area") || "",
    location: pick(it, "Location", "location") || "", originalDate: pick(it, "originalDate", "OriginalDate") || "",
    resolvedDate: pick(it, "resolvedDate", "ResolvedDate") || "", retestNum: pick(it, "retestNum", "RetestNum") || "",
    notes: pick(it, "notes", "Notes") || "", closedOnGenerate: !!pick(it, "closedOnGenerate", "ClosedOnGenerate"),
    enteredByEmail: pick(it, "enteredByEmail", "EnteredByEmail") || "", enteredByName: pick(it, "enteredByName", "EnteredByName") || "",
    enteredAt: pick(it, "enteredAt", "EnteredAt") || ""
  };
}
function spToSubmission(it) {
  return {
    building: val(pick(it, "building", "Building", "Departament", "department")) || "", sample: String(pick(it, "sample", "Sample") || ""),
    type: pick(it, "type", "Type", "TypeForm") || "Generator", retestNum: String(pick(it, "retestNum", "RetestNum") || ""),
    status: val(pick(it, "status", "Status")) || "Generated", fileName: pick(it, "fileName", "FileName") || "",
    collectionDate: pick(it, "collectionDate", "CollectionDate") || "", submittedByEmail: pick(it, "submittedByEmail", "SubmittedByEmail") || "",
    submittedByName: pick(it, "submittedByName", "SubmittedByName") || "", submittedAt: pick(it, "submittedAt", "SubmittedAt") || ""
  };
}
function spToPoint(it) {
  return {
    plant: val(pick(it, "Departament", "department", "plant")) || "", sample: Number(pick(it, "sample", "Sample")) || 0,
    zone: Number(pick(it, "zone", "Zone")) || 0, area: pick(it, "Area", "area") || "", line: pick(it, "Line", "line") || "N/A",
    location: pick(it, "Location", "location") || "", active: pick(it, "active", "Active") !== false
  };
}
const rows = data => Array.isArray(data) ? data : (data && data.value) || [];
const clean = o => JSON.parse(JSON.stringify(o));

// What a later UPDATE must carry to SharePoint (a change elsewhere is not sent).
const SIG = {
  records: r => JSON.stringify([r.fecha, r.resultado, r.resultDate || "", r.labNotes || "", arr(r.failedPathogens).join(","), r.failedPathogensLabel || ""]),
  masterPoints: p => JSON.stringify([p.zone, p.area || "", p.line || "", p.location || "", p.active !== false]),
  resolved: () => "1"
};
const MIRROR = {
  records: {
    create: r => callFlow("FLOW_RECORDS_WRITE", { list: "Records", action: "create", items: [recordToSP(r)] }),
    update: r => callFlow("FLOW_RECORDS_UPDATE", { list: "Records", action: "update", items: [recordUpdateToSP(r)] })
  },
  resolved: {
    create: r => callFlow("FLOW_RESOLVED_WRITE", { list: "ResolvedRetests", action: "create", items: [resolvedToSP(r)] }),
    update: null
  },
  masterPoints: {
    create: p => callFlow("FLOW_MASTERPOINTS_WRITE", { list: "MasterPoints", action: "create", items: [pointToSP(p, true)] }),
    update: p => callFlow("FLOW_MASTERPOINTS_UPDATE", { list: "MasterPoints", action: "update", items: [pointToSP(p, false)] })
  }
};

// One run per document at a time; the run re-reads the document until what
// SharePoint has matches it (so a change made while it was busy is not lost).
async function mirror(col, id) {
  const mref = db().collection("spMirror").doc(col + "__" + id);
  const state = await db().runTransaction(async tx => {
    const m = await tx.get(mref);
    const s = m.exists ? m.data() : {};
    if (s.busy && Date.now() - (s.busyAt || 0) < 120000) return null;
    tx.set(mref, { busy: true, busyAt: Date.now() }, { merge: true });
    return s;
  });
  if (!state) return;
  let s = { created: !!state.created, sent: state.sent || "" };
  try {
    for (let pass = 0; pass < 4; pass++) {
      const snap = await db().collection(col).doc(id).get();
      if (!snap.exists) break;
      const cur = snap.data();
      const sig = SIG[col](cur);
      if (!s.created) { await MIRROR[col].create(cur); s = { created: true, sent: sig }; }
      else if (sig !== s.sent && MIRROR[col].update) { await MIRROR[col].update(cur); s.sent = sig; }
      else break;
    }
    await mref.set({ created: s.created, sent: s.sent, busy: false, ok: true, err: "", at: nowIso() }, { merge: true });
  } catch (e) {
    await mref.set({ created: s.created, sent: s.sent, busy: false, ok: false, err: String(e && e.message || e).slice(0, 500), at: nowIso() }, { merge: true });
    console.error("[spMirror] " + col + "/" + id, e);
  }
}

const trig = col => onDocumentWritten({ document: col + "/{id}", region: REGION, timeoutSeconds: 120 }, ev => {
  if (!ev.data || !ev.data.after || !ev.data.after.exists) return null;
  return mirror(col, ev.params.id);
});
exports.spMirrorRecords = trig("records");
exports.spMirrorResolved = trig("resolved");
exports.spMirrorPoints = trig("masterPoints");

// ── Import from SharePoint (migration + safety net) ────────────
async function writeAll(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = db().batch(); ops.slice(i, i + 400).forEach(f => f(b)); await b.commit();
  }
}
const resolvedKey = r => [r.originalId, r.resolvedDate, r.closedOnGenerate ? 1 : 0].join("|");
const submissionKey = s => (s.fileName || "") + "|" + (s.submittedAt || "");

async function spImport() {
  const out = { records: 0, recordsUpdated: 0, resolved: 0, points: 0, submissions: 0 };
  const stamp = { _by: "sharepoint-import", _at: FieldValue.serverTimestamp() };
  const mirrorDone = (col, id, sig) => b => b.set(db().collection("spMirror").doc(col + "__" + id), { created: true, sent: sig, busy: false, ok: true, err: "", at: nowIso(), imported: true }, { merge: true });

  // Records
  const spRecs = rows(await callFlow("FLOW_RECORDS_READ", {})).map(spToRecord).filter(r => r.id);
  const fsRecs = new Map((await db().collection("records").get()).docs.map(d => [d.id, d.data()]));
  const ops = [];
  spRecs.forEach(r => {
    const id = String(r.id), have = fsRecs.get(id);
    if (!have) {
      ops.push(mirrorDone("records", id, SIG.records(r)));
      ops.push(b => b.set(db().collection("records").doc(id), Object.assign(clean(r), stamp)));
      out.records++;
    } else if ((have.resultado || "Pending") === "Pending" && r.resultado && r.resultado !== "Pending") {
      // a result entered from a device still on the old version
      const upd = { resultado: r.resultado, resultDate: r.resultDate, labNotes: r.labNotes, failedPathogens: r.failedPathogens, failedPathogensLabel: r.failedPathogensLabel };
      ops.push(mirrorDone("records", id, SIG.records(Object.assign({}, have, upd))));
      ops.push(b => b.set(db().collection("records").doc(id), Object.assign(clean(upd), stamp), { merge: true }));
      out.recordsUpdated++;
    }
  });

  // Resolved retests
  const spRes = rows(await callFlow("FLOW_RESOLVED_READ", {})).map(spToResolved).filter(r => r.originalId);
  const fsResKeys = new Set((await db().collection("resolved").get()).docs.map(d => resolvedKey(d.data())));
  spRes.forEach(r => {
    if (fsResKeys.has(resolvedKey(r))) return;
    fsResKeys.add(resolvedKey(r));
    const id = "sp_" + resolvedKey(r).replace(/[^0-9A-Za-z_-]/g, "_");
    ops.push(mirrorDone("resolved", id, "1"));
    ops.push(b => b.set(db().collection("resolved").doc(id), Object.assign(clean(r), stamp)));
    out.resolved++;
  });

  // Master points
  const spPts = rows(await callFlow("FLOW_MASTERPOINTS_READ", {})).map(spToPoint).filter(p => p.sample && p.plant);
  const fsPts = new Set((await db().collection("masterPoints").get()).docs.map(d => d.id));
  spPts.forEach(p => {
    const id = p.plant + "_" + p.sample;
    if (fsPts.has(id)) return;
    fsPts.add(id);
    ops.push(mirrorDone("masterPoints", id, SIG.masterPoints(p)));
    ops.push(b => b.set(db().collection("masterPoints").doc(id), Object.assign(clean(p), stamp)));
    out.points++;
  });

  // Lab submissions (the labform flow writes SharePoint itself; no mirror)
  const spSubs = rows(await callFlow("FLOW_SUBMISSIONS_READ", {})).map(spToSubmission).filter(s => s.fileName || s.sample);
  const fsSubKeys = new Set((await db().collection("submissions").get()).docs.map(d => submissionKey(d.data())));
  spSubs.forEach(s => {
    if (fsSubKeys.has(submissionKey(s))) return;
    fsSubKeys.add(submissionKey(s));
    ops.push(b => b.set(db().collection("submissions").doc(), Object.assign(clean(s), stamp)));
    out.submissions++;
  });

  await writeAll(ops);
  await db().collection("spMirror").doc("_import").set({ at: nowIso(), last: out }, { merge: true });
  return out;
}

// Safety net while old app versions may still write straight to SharePoint.
exports.spImportScheduled = onSchedule({ schedule: "every 30 minutes", region: REGION, timeoutSeconds: 540, memory: "512MiB" }, async () => {
  const r = await spImport();
  console.log("[spImport] scheduled", JSON.stringify(r));
});

// Manual run (migration): POST with header x-import-key = IMPORT_KEY (functions/.env).
exports.spImportNow = onRequest({ region: REGION, timeoutSeconds: 540, memory: "512MiB" }, async (req, res) => {
  const key = process.env.IMPORT_KEY;
  if (!key || req.get("x-import-key") !== key) { res.status(403).json({ ok: false }); return; }
  try { res.json({ ok: true, imported: await spImport() }); }
  catch (e) { console.error("[spImport]", e); res.status(500).json({ ok: false, error: String(e && e.message || e).slice(0, 300) }); }
});
