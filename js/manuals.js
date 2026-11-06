// ═══════════════════════════════════════════════════════════════
// USER MANUALS — English and Spanish PDF, kept on the server only
// Everyone signed in (with their two-step code) can open them; administrators
// upload a new version whenever a feature changes. The file comes from the
// manualGet function into memory and opens as a local blob: there is never a
// public link to it. Older versions stay listed (document control).
// ═══════════════════════════════════════════════════════════════

const MANUAL_LANGS = [{ id: 'en', name: 'English', title: 'User Manual' }, { id: 'es', name: 'Español', title: 'Manual de Usuario' }];
let _manualState = { current: {}, history: [] };
const _manualFn = name => fbFunctions.httpsCallable(name);
const _manualErr = e => (e && e.code === 'functions/permission-denied') ? 'Only administrators can upload manuals.' : fnError(e);

function _manualWhen(ms) {
  return ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}
function _manualSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; }

function openManuals() {
  document.getElementById('manualModal').classList.add('open');
  const admin = typeof CU !== 'undefined' && CU && isAdmin(CU.email, CU.role);
  document.getElementById('manualUploadBox').style.display = admin ? '' : 'none';
  document.getElementById('manualUploadMsg').textContent = '';
  loadManuals();
}
function closeManuals() { document.getElementById('manualModal').classList.remove('open'); }

function loadManuals() {
  const box = document.getElementById('manualCards');
  box.innerHTML = '<p style="color:var(--gray-500);font-size:13px;padding:8px 0">Loading…</p>';
  _manualFn('manualList')().then(r => {
    _manualState = r.data || { current: {}, history: [] };
    renderManuals();
  }).catch(e => { box.innerHTML = '<p style="color:var(--red);font-size:13px">' + esc(_manualErr(e)) + '</p>'; });
}

function renderManuals() {
  const cur = _manualState.current || {};
  document.getElementById('manualCards').innerHTML = MANUAL_LANGS.map(l => {
    const m = cur[l.id];
    return `<div style="border:1px solid var(--gray-200);border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:14px">
      <div style="width:42px;height:52px;border-radius:6px;background:var(--green-light);color:var(--green);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex:none">PDF</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--gray-900)">${esc(l.title)} <span style="font-weight:500;color:var(--gray-500)">· ${esc(l.name)}</span></div>
        <div style="font-size:12px;color:var(--gray-500);margin-top:2px">${m
          ? 'Version ' + m.version + ' · ' + esc(_manualWhen(m.uploadedAt)) + ' · ' + _manualSize(m.size) + (m.note ? '<br><span style="color:var(--gray-700)">' + esc(m.note) + '</span>' : '')
          : 'Not uploaded yet'}</div>
      </div>
      ${m ? `<div style="display:flex;gap:6px;flex:none">
        <button class="btn btn-primary btn-sm" onclick="openManual('${l.id}',${m.version},false)">Open</button>
        <button class="btn btn-outline btn-sm" onclick="openManual('${l.id}',${m.version},true)" title="Download">Download</button>
      </div>` : ''}
    </div>`;
  }).join('');
  const hist = (_manualState.history || []).filter(m => cur[m.lang] && m.version !== cur[m.lang].version);
  const hb = document.getElementById('manualHistory');
  hb.style.display = hist.length ? '' : 'none';
  document.getElementById('manualHistoryList').innerHTML = hist.map(m =>
    `<tr><td>${m.lang === 'es' ? 'Español' : 'English'}</td><td>v${m.version}</td><td>${esc(_manualWhen(m.uploadedAt))}</td>
     <td style="color:var(--gray-700)">${esc(m.note || '')}</td><td style="color:var(--gray-500)">${esc(m.uploadedBy || '')}</td>
     <td><button class="btn btn-outline btn-sm" onclick="openManual('${m.lang}',${m.version},false)">Open</button></td></tr>`).join('');
}

// Fetches the PDF from the server and opens (or saves) it from memory.
async function openManual(lang, version, download) {
  // A tab opened now (inside the click) is not blocked by the browser; the PDF goes into it when it arrives.
  const tab = download ? null : window.open('', '_blank');
  if (tab) tab.document.write('<p style="font:14px Segoe UI,Arial,sans-serif;color:#555;padding:24px">Opening the manual…</p>');
  toast('Opening the manual…', 'info');
  try {
    const r = (await _manualFn('manualGet')({ lang, version })).data;
    const bin = atob(r.contentBase64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    if (download || !tab) {
      const a = document.createElement('a'); a.href = url; a.download = r.fileName; document.body.appendChild(a); a.click(); a.remove();
    } else {
      tab.location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  } catch (e) {
    if (tab) tab.close();
    toast(_manualErr(e), 'error');
  }
}

// Administrators: upload a new version.
function uploadManual() {
  const lang = document.getElementById('manualLang').value;
  const file = document.getElementById('manualFile').files[0];
  const note = document.getElementById('manualNote').value.trim();
  const msg = document.getElementById('manualUploadMsg');
  msg.style.color = 'var(--red)';
  if (!file) { msg.textContent = 'Choose the PDF file.'; return; }
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { msg.textContent = 'Only PDF files.'; return; }
  if (file.size > 20 * 1024 * 1024) { msg.textContent = 'The PDF is larger than 20 MB.'; return; }
  if (!note) { msg.textContent = 'Write what changed in this version.'; return; }
  const btn = document.getElementById('manualUploadBtn'); btn.disabled = true;
  msg.style.color = 'var(--gray-500)'; msg.textContent = 'Uploading…';
  const rd = new FileReader();
  rd.onload = () => {
    const b64 = String(rd.result).split(',')[1] || '';
    _manualFn('manualUpload')({ lang, note, contentBase64: b64 }).then(r => {
      msg.style.color = 'var(--green)';
      msg.textContent = 'Saved as version ' + r.data.version + '.';
      document.getElementById('manualFile').value = ''; document.getElementById('manualNote').value = '';
      loadManuals();
    }).catch(e => { msg.style.color = 'var(--red)'; msg.textContent = _manualErr(e); })
      .finally(() => { btn.disabled = false; });
  };
  rd.onerror = () => { btn.disabled = false; msg.textContent = 'Could not read the file.'; };
  rd.readAsDataURL(file);
}
