// ═════════════════════════════════════════════════
// MAP POINTS — small dots on the 3D map. Clicking one opens the photo of
// that exact sampling spot with the data of the sample.
// The confidential map runs in its own frame and talks to this page by
// messages: it asks for the points, and says which dot was clicked.
// Photos stay in SharePoint and load one at a time, only when opened;
// the copy kept here lives in memory and goes away on sign-out or reload.
// ═════════════════════════════════════════════════

const _pcPhotos = {};
const PC_PHOTO_CACHE = 30;
let _pcOpen = null;

// Points placed in 3D: without a height they only have a location on the flat plan.
function fmPointsPayload() {
  return getMasterPoints()
    .filter(p => p.mapX != null && p.mapZ != null && p.mapY != null && p.active !== false)
    .map(p => ({ plant: p.plant, sample: Number(p.sample), zone: Number(p.zone) || 0, x: Number(p.mapX), y: Number(p.mapY), z: Number(p.mapZ), b: p.mapBuilding || p.plant, photo: !!p.photoFile }));
}
function fmSendPoints() {
  const f = document.getElementById('facilityMapFrame');
  if (f && f.contentWindow) f.contentWindow.postMessage({ type: 'fm-points', points: fmPointsPayload() }, '*');
}
window.addEventListener('message', e => {
  const f = document.getElementById('facilityMapFrame');
  if (!f || e.source !== f.contentWindow || !e.data) return;
  if (e.data.type === 'fm-ready') fmSendPoints();
  else if (e.data.type === 'fm-point') openPointCard(String(e.data.plant), e.data.sample);
});
if (typeof fbAuth !== 'undefined') fbAuth.onAuthStateChanged(u => { if (!u) Object.keys(_pcPhotos).forEach(k => delete _pcPhotos[k]); });

function _pcRow(label, value, color) {
  return '<div style="display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid var(--gray-200);font-size:13px">' +
    '<span style="color:var(--gray-500)">' + esc(label) + '</span><strong style="text-align:right' + (color ? ';color:' + color : '') + '">' + esc(String(value)) + '</strong></div>';
}
function _pcResultColor(r) {
  return r === 'Positive' ? 'var(--red)' : r === 'Negative' ? 'var(--green)' : '';
}

function openPointCard(plant, sample) {
  const key = String(sample);
  const pt = getMasterPoints().find(p => p.plant === plant && String(p.sample) === key);
  if (!pt) return;
  const recs = GH().filter(h => h.planta === plant && String(h.sample) === key).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const done = recs.filter(h => h.resultado && h.resultado !== 'Pending');
  const positives = recs.filter(h => h.resultado === 'Positive').length;
  const retests = recs.filter(h => !_phIsRoutine(h)).length;
  const hasLine = pt.line && pt.line !== 'N/A';
  _pcOpen = { plant, sample: key };

  document.getElementById('pcTitle').textContent = 'Sample #' + key + ' · ' + (pt.area || '');
  document.getElementById('pcSub').textContent = 'Building ' + plant + (hasLine ? ' · Line ' + pt.line : '') + ' · Zone ' + (pt.zone || '—');
  document.getElementById('pcData').innerHTML =
    _pcRow('Machine', pt.area || '—') +
    _pcRow('Part sampled', pt.location || '—') +
    _pcRow('Zone', pt.zone || '—') +
    (hasLine ? _pcRow('Line', pt.line) : '') +
    _pcRow('Last sampled', recs.length ? _phFmt(recs[0].fecha) : 'Never') +
    _pcRow('Last result', done.length ? done[0].resultado : '—', done.length ? _pcResultColor(done[0].resultado) : '') +
    _pcRow('Times sampled', recs.length) +
    _pcRow('Retests', retests) +
    _pcRow('Positives', positives, positives ? 'var(--red)' : '');
  document.getElementById('pointCardModal').classList.add('open');
  _pcLoadPhoto(pt);
}

function _pcShow(html) { document.getElementById('pcPhoto').innerHTML = html; }

async function _pcLoadPhoto(pt) {
  const file = pt.photoFile;
  const msg = t => '<div style="color:var(--gray-500);font-size:13px;padding:24px;text-align:center">' + t + '</div>';
  if (!file) { _pcShow(msg('No photo for this point yet.')); return; }
  const show = src => _pcShow('<img id="pcImg" alt="Sampling spot of sample ' + esc(String(pt.sample)) + '" src="' + src + '" style="max-width:100%;max-height:72vh;display:block;border-radius:10px">');
  if (_pcPhotos[file]) { show(_pcPhotos[file]); return; }
  const open = _pcOpen;
  _pcShow('<div class="pc-load" role="status">Loading photo…<div class="pc-load-bar"></div></div>');
  try {
    const r = await _spPost('photoContent', { fileName: file });
    const b64 = r && r.content;
    if (!b64 || !/^(\/9j\/|iVBORw0KGgo)/.test(b64)) throw new Error('not an image');
    const src = 'data:image/' + (b64[0] === '/' ? 'jpeg' : 'png') + ';base64,' + b64;
    const names = Object.keys(_pcPhotos);
    if (names.length >= PC_PHOTO_CACHE) delete _pcPhotos[names[0]];
    _pcPhotos[file] = src;
    if (_pcOpen === open) show(src);          // another point may have been opened meanwhile
  } catch (e) {
    if (_pcOpen === open) _pcShow(msg('The photo could not be loaded.') + '<div style="text-align:center"><button class="btn btn-outline btn-sm" onclick="pcRetryPhoto()">Try again</button></div>');
  }
}
function pcRetryPhoto() {
  if (!_pcOpen) return;
  const pt = getMasterPoints().find(p => p.plant === _pcOpen.plant && String(p.sample) === _pcOpen.sample);
  if (pt) _pcLoadPhoto(pt);
}
function closePointCard() {
  _pcOpen = null;
  document.getElementById('pointCardModal').classList.remove('open');
}
function pcOpenHistory() {
  if (!_pcOpen) return;
  const o = _pcOpen;
  closePointCard();
  openPointHistory(o.plant, o.sample);
}
