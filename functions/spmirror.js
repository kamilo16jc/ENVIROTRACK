// ═══════════════════════════════════════════════════════════════
// FIRESTORE ⇄ SHAREPOINT
// Firestore is the primary database and the only place the app writes.
// SharePoint keeps a copy, one way only (Firestore → SharePoint):
//   • spMirror* triggers copy every create / change of records, resolved
//     retests and master points to SharePoint through the existing Power
//     Automate flows (URLs in functions/.env — never in the client).
//   • spBackfill copies bulk-imported history a few documents at a time.
// Nothing is read back from SharePoint into Firestore: a change made in
// SharePoint (or by anyone holding a flow URL) never reaches the app's data.
// Bookkeeping lives in spMirror/{collection}__{id} (server-only).
// ═══════════════════════════════════════════════════════════════

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const REGION = "us-central1";
const db = () => getFirestore();
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
  if (ev.data.after.data()._spDefer === true) return null;   // bulk history import → copied later by spBackfill
  return mirror(col, ev.params.id);
});
// ── Backfill: history imported in bulk (_spDefer: true) goes to SharePoint a
// few documents at a time, so the Power Automate flows are never flooded.
// Each run copies up to BACKFILL_BATCH documents one by one, clears the flag
// on success (that write is then a no-op for the mirror) and stops early when
// the flows start failing — the next run retries.
const BACKFILL_BATCH = 25;
async function spBackfill() {
  const out = { sent: 0, failed: 0, left: 0 };
  let budget = BACKFILL_BATCH, fails = 0;
  for (const col of ["resolved", "records"]) {
    if (budget <= 0 || fails >= 2) break;
    const snap = await db().collection(col).where("_spDefer", "==", true).limit(budget).get();
    for (const d of snap.docs) {
      if (fails >= 2) break;
      await mirror(col, d.id);
      const m = await db().collection("spMirror").doc(col + "__" + d.id).get();
      if (m.exists && m.data().created && m.data().ok) {
        await d.ref.update({ _spDefer: FieldValue.delete() });
        out.sent++; budget--; fails = 0;
      } else { out.failed++; fails++; }
    }
  }
  for (const col of ["resolved", "records"]) {
    out.left += (await db().collection(col).where("_spDefer", "==", true).count().get()).data().count;
  }
  await db().collection("spMirror").doc("_backfill").set({ at: nowIso(), last: out }, { merge: true });
  return out;
}
exports.spBackfill = onSchedule({ schedule: "every 10 minutes", region: REGION, timeoutSeconds: 540 }, async () => {
  const r = await spBackfill();
  if (r.sent || r.failed) console.log("[spBackfill]", JSON.stringify(r));
});

exports.spMirrorRecords = trig("records");
exports.spMirrorResolved = trig("resolved");
exports.spMirrorPoints = trig("masterPoints");
