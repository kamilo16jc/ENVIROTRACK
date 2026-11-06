// ═══════════════════════════════════════════════════════════════
// EnviroTrack — user manuals (PDF, English and Spanish)
// Kept on the server only: Firestore collections `manuals` (one document per
// version) and `manualChunks` (the PDF split in pieces under Firestore's 1 MB
// document limit). The database rules give pages no access to either; these
// functions hand the file to signed-in users who typed their two-step code.
// Every upload is a new version; older versions stay (document control).
// ═══════════════════════════════════════════════════════════════
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

const REGION = "us-central1";
const LANGS = { en: "English", es: "Español" };
const CHUNK = 700 * 1024;                 // base64 characters per piece
const MAX_PDF = 20 * 1024 * 1024;         // 20 MB file
const db = () => getFirestore();

module.exports = function manuals(h) {
  // h: { assertMfaCaller, assertMfa, assertAdmin, rateLimit, LIMITS, str }
  const caller = (request) => { h.assertMfaCaller(request); h.assertMfa(request); };
  // Newest version number of a language (0 = none). Few documents: no index needed.
  const latestVersion = async (lang) => (await db().collection("manuals").where("lang", "==", lang).get())
    .docs.reduce((mx, d) => Math.max(mx, d.get("version") || 0), 0);
  const metaOut = (d) => ({
    lang: d.lang, version: d.version, note: d.note || "", fileName: d.fileName, size: d.size,
    uploadedBy: d.uploadedBy || "", uploadedAt: d.uploadedAt && d.uploadedAt.toMillis ? d.uploadedAt.toMillis() : null,
  });

  // Current version of each language + the history.
  const manualList = onCall({ region: REGION, cors: true }, async (request) => {
    caller(request);
    const snap = await db().collection("manuals").get();
    const all = snap.docs.map(d => metaOut(d.data())).sort((a, b) => b.version - a.version || a.lang.localeCompare(b.lang));
    const current = {};
    for (const m of all) if (!current[m.lang]) current[m.lang] = m;
    return { current, history: all };
  });

  // The PDF of one version (the newest when no version is given).
  const manualGet = onCall({ region: REGION, cors: true, memory: "512MiB" }, async (request) => {
    caller(request);
    h.rateLimit("manual:" + request.auth.uid, 20);
    const lang = String((request.data || {}).lang || "");
    if (!LANGS[lang]) throw new HttpsError("invalid-argument", "Unknown language.");
    let version = parseInt((request.data || {}).version, 10);
    if (!version) {
      version = await latestVersion(lang);
      if (!version) throw new HttpsError("not-found", "No manual uploaded yet.");
    }
    const meta = await db().collection("manuals").doc(lang + "_" + version).get();
    if (!meta.exists) throw new HttpsError("not-found", "That version does not exist.");
    const m = meta.data();
    const parts = await Promise.all(Array.from({ length: m.chunks }, (_, i) =>
      db().collection("manualChunks").doc(lang + "_" + version + "_" + i).get()));
    const b64 = parts.map(p => p.get("data") || "").join("");
    if (crypto.createHash("sha256").update(Buffer.from(b64, "base64")).digest("hex") !== m.sha256) {
      throw new HttpsError("data-loss", "The stored manual is damaged. Upload it again.");
    }
    return { fileName: m.fileName, version, contentBase64: b64 };
  });

  // Administrators: a new version of one language.
  const manualUpload = onCall({ region: REGION, cors: true, memory: "512MiB" }, async (request) => {
    const by = h.assertAdmin(request);
    const { lang, note, contentBase64 } = request.data || {};
    if (!LANGS[lang]) throw new HttpsError("invalid-argument", "Choose English or Spanish.");
    const b64 = String(contentBase64 || "");
    if (!/^JVBERi0/.test(b64)) throw new HttpsError("invalid-argument", "Only PDF files.");
    const bytes = Buffer.from(b64, "base64");
    if (bytes.length > MAX_PDF) throw new HttpsError("invalid-argument", "The PDF is larger than 20 MB.");
    const clean = bytes.toString("base64");      // canonical base64 (no line breaks)
    const version = (await latestVersion(lang)) + 1;
    const pieces = [];
    for (let i = 0; i < clean.length; i += CHUNK) pieces.push(clean.slice(i, i + CHUNK));
    // pieces first, the version document last: a failed upload never shows up as a version
    for (let i = 0; i < pieces.length; i += 4) {
      const batch = db().batch();
      pieces.slice(i, i + 4).forEach((p, k) => batch.set(db().collection("manualChunks").doc(lang + "_" + version + "_" + (i + k)), { data: p }));
      await batch.commit();
    }
    const fileName = (lang === "es" ? "EnviroTrack_Manual_de_Usuario" : "EnviroTrack_User_Manual") + "_v" + version + ".pdf";
    await db().collection("manuals").doc(lang + "_" + version).set({
      lang, version, note: h.str(note, 300), fileName, size: bytes.length, chunks: pieces.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      uploadedBy: by, uploadedAt: FieldValue.serverTimestamp(),
    });
    return { version, fileName };
  });

  return { manualList, manualGet, manualUpload };
};
