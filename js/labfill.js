// ═══════════════════════════════════════════════════════════════
// LAB FILL — fills the lab template (TEMPLATE_LAB/FillLabForm.xlsx,
// sheet "ENV") CLIENT-SIDE with ExcelJS, replicating the old Office
// Script exactly. Returns the filled .xlsx as base64 so the flow only
// has to save + email it (no throttled Office Scripts connector).
//
// Office Script replicated (FillLabForm.main):
//   sheet "ENV", data from row 10, clears A10:Q45 first.
//   A{r}=# (1..n)  C{r}=building  D{r}=zone  E{r}=site  F{r}=collectionDate
//   pathogen "X" in M=ecoli N=listeria O=salmonella P=saureus
//   one spreadsheet row per rowsJson entry (one per pathogen).
// ═══════════════════════════════════════════════════════════════

const _LAB_PAT_COL = { ecoli: 'M', listeria: 'N', salmonella: 'O', saureus: 'P' };

let _labTplBuf = null;   // cached template bytes (fetched once per session)
// The template LIVES IN SHAREPOINT (private) — never in the public repo. It is
// fetched through the role-gated proxy (op 'templateRead' → Get file content →
// base64), same pattern as photoContent. Uses the plain SharePoint connector
// (NOT Office Scripts), so no throttling. Cached in memory after the first pull.
async function _loadLabTemplate() {
  if (!_labTplBuf) {
    const r = await _spPost('templateRead', {});
    const b64 = (r && (r.content || (typeof r === 'string' ? r : ''))) || '';
    if (!b64) throw new Error('Lab template unavailable from SharePoint');
    _labTplBuf = _b64ToArrayBuffer(String(b64));
  }
  return _labTplBuf.slice(0);   // ExcelJS consumes the buffer → hand out a copy
}
function _b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function _abToBase64(ab) {
  const bytes = new Uint8Array(ab);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}

// Build the filled lab .xlsx and return it as base64. `rows` = [{zone, site, pathogen}].
async function buildLabFormB64(building, collectionDate, rows) {
  if (typeof ExcelJS === 'undefined') throw new Error('ExcelJS library not loaded');
  const buf = await _loadLabTemplate();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('ENV');
  if (!ws) throw new Error('Template worksheet "ENV" not found');

  // Clear old data rows (A10:Q45) contents, keep headers & formatting.
  for (let r = 10; r <= 45; r++) {
    for (let c = 1; c <= 17; c++) ws.getRow(r).getCell(c).value = null;   // A..Q = 1..17
  }

  // Fill one row per pathogen entry (identical to the Office Script).
  let r = 10;
  rows.forEach((row, i) => {
    ws.getCell('A' + r).value = i + 1;             // #
    ws.getCell('C' + r).value = building;          // Room/Area = building
    ws.getCell('D' + r).value = row.zone;          // Zone
    ws.getCell('E' + r).value = row.site;          // Site Description
    ws.getCell('F' + r).value = collectionDate;    // Collection Date
    const col = _LAB_PAT_COL[row.pathogen];
    if (col) ws.getCell(col + r).value = 'X';       // pathogen X
    r++;
  });

  const out = await wb.xlsx.writeBuffer();
  return _abToBase64(out);
}
