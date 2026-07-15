// ═══════════════════════════════════════════════
// MASTER MANAGEMENT
// ═══════════════════════════════════════════════

// The catalog lives in SharePoint (list MasterPoints). Local cache =
// cap_masterpoints, filled by syncPullMasterPoints() (js/sync.js).
function saveMasterPoints(arr) { localStorage.setItem('cap_masterpoints', JSON.stringify(arr)); }

// Active points for a plant (used by the generator).
function getActiveMaster(plant) {
  return getMasterPoints()
    .filter(p => p.plant === plant && p.active !== false)
    .map(p => ({...p, _custom:false}));
}

// ── Tab switcher ──────────────────────────────
function switchCfgTab(tab) {
  ['users','master'].forEach(t => {
    document.getElementById('cfgPanel-'+t).style.display = t===tab ? 'block' : 'none';
    const btn = document.getElementById('tab-'+t);
    if(t===tab) {
      btn.style.borderBottom='2px solid var(--red)';
      btn.style.color='var(--red)'; btn.style.fontWeight='600';
    } else {
      btn.style.borderBottom='2px solid transparent';
      btn.style.color='var(--gray-500)'; btn.style.fontWeight='500';
    }
  });
  if(tab==='master') loadMasterTable();
  if(tab==='users')  loadUsersTable();
}

// ── Master Table ──────────────────────────────
function loadMasterTable() {
  const plant  = document.getElementById('masterFilterPlant').value;
  const zone   = document.getElementById('masterFilterZone').value;
  const search = document.getElementById('masterSearch').value.trim().toLowerCase();

  let all = getMasterPoints().filter(p => p.plant === plant);
  if(zone)   all = all.filter(p => String(p.zone)===zone);
  if(search) all = all.filter(p =>
    (p.area||'').toLowerCase().includes(search) ||
    (p.location||'').toLowerCase().includes(search) ||
    String(p.sample).includes(search)
  );
  all.sort((a,b) => a.sample - b.sample);

  document.getElementById('masterCount').textContent =
    all.filter(p=>p.active!==false).length+' active / '+all.length+' total';

  const tbody = document.getElementById('masterTable');
  if(!all.length) {
    tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--gray-500);padding:32px">No points for these filters</td></tr>';
    return;
  }

  tbody.innerHTML = all.map(p => {
    const off = p.active === false;
    const rowStyle = off ? 'opacity:.45;text-decoration:line-through' : '';
    const stBadge = off
      ? '<span style="background:var(--red-light);color:var(--red);font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">Deactivated</span>'
      : '<span style="background:#d1fae5;color:#059669;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">Active</span>';
    return `<tr style="${rowStyle}">
      <td style="font-weight:700;font-size:14px">${p.sample}</td>
      <td style="text-align:center">${p.zone}</td>
      <td style="max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(p.area)}">${esc(p.area)}</td>
      <td>${esc(p.line||'N/A')}</td>
      <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(p.location)}">${esc(p.location)}</td>
      <td>${stBadge}</td>
      <td>
        <div style="display:flex;gap:5px">
          ${!off
            ? `<button class="btn btn-outline btn-sm" onclick="editMasterPoint('${plant}',${p.sample})" title="Edit"><svg class="ln" width="14" height="14" viewBox="0 0 24 24" style="vertical-align:-2px"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
               <button class="btn btn-outline btn-sm" onclick="deactivateMasterPoint('${plant}',${p.sample})" style="color:var(--red)" title="Deactivate"><svg class="ln" width="14" height="14" viewBox="0 0 24 24" style="vertical-align:-2px"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></button>`
            : `<button class="btn btn-outline btn-sm" onclick="reactivateMasterPoint('${plant}',${p.sample})" style="color:var(--green)" title="Reactivate"><svg class="ln" width="14" height="14" viewBox="0 0 24 24" style="vertical-align:-2px"><polyline points="20 6 9 17 4 12"/></svg></button>`
          }
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Modal ─────────────────────────────────────
function openMasterModal(plant, sample) {
  const isEdit = plant && sample;
  document.getElementById('masterModalTitle').textContent = isEdit ? 'Edit Point' : 'Add Sampling Point';
  document.getElementById('editMasterKey').value = isEdit ? plant+'|'+sample : '';
  document.getElementById('masterModalMsg').textContent = '';

  const currentPlant = document.getElementById('masterFilterPlant').value;
  document.getElementById('mPlant').value = plant || currentPlant;
  document.getElementById('mZone').value  = '2';
  document.getElementById('mLine').value  = 'N/A';
  document.getElementById('mSample').value   = '';
  document.getElementById('mArea').value     = '';
  document.getElementById('mLocation').value = '';

  if(isEdit) {
    const pt = getMasterPoints().find(p => p.plant===plant && p.sample==sample);
    if(pt) {
      document.getElementById('mPlant').value    = plant;
      document.getElementById('mSample').value   = pt.sample;
      document.getElementById('mZone').value     = pt.zone;
      document.getElementById('mLine').value     = pt.line||'N/A';
      document.getElementById('mArea').value     = pt.area;
      document.getElementById('mLocation').value = pt.location;
      // sample # and plant are the key → locked while editing
      document.getElementById('mSample').disabled = true;
      document.getElementById('mPlant').disabled  = true;
    }
  } else {
    document.getElementById('mSample').disabled = false;
    document.getElementById('mPlant').disabled  = false;
  }

  document.getElementById('masterModal').classList.add('open');
  setTimeout(()=>document.getElementById('mArea').focus(),100);
}

function closeMasterModal() {
  document.getElementById('masterModal').classList.remove('open');
  document.getElementById('mSample').disabled = false;
  document.getElementById('mPlant').disabled  = false;
}

function editMasterPoint(plant, sample) {
  openMasterModal(plant, sample);
}

function saveMasterPoint() {
  const plant    = document.getElementById('mPlant').value;
  const sample   = parseInt(document.getElementById('mSample').value);
  const zone     = parseInt(document.getElementById('mZone').value);
  const line     = document.getElementById('mLine').value.trim()||'N/A';
  const area     = document.getElementById('mArea').value.trim();
  const location = document.getElementById('mLocation').value.trim();
  const editKey  = document.getElementById('editMasterKey').value;
  const msg      = document.getElementById('masterModalMsg');

  if(!area || !location) { msg.style.color='var(--red)'; msg.textContent='Area and Location are required.'; return; }
  if(!sample || sample<1) { msg.style.color='var(--red)'; msg.textContent='Enter a valid Sample #.'; return; }

  const pts = getMasterPoints();
  const editPlant  = editKey ? editKey.split('|')[0] : null;
  const editSample = editKey ? parseInt(editKey.split('|')[1]) : null;

  // Duplicate sample# check (skip the one being edited)
  const dup = pts.some(p => p.plant===plant && p.sample===sample &&
                            !(editPlant===plant && editSample===sample));
  if(dup) {
    msg.style.color='var(--red)';
    msg.textContent='Sample #'+sample+' already exists in building '+plant+'.';
    return;
  }

  if(editKey) {
    const idx = pts.findIndex(p => p.plant===editPlant && p.sample===editSample);
    if(idx>=0) {
      pts[idx] = {...pts[idx], plant, sample, zone, line, area, location, active:true};
      saveMasterPoints(pts);
      syncSafe(() => syncUpdatePoint(pts[idx]), 'update point');
    }
  } else {
    const np = {plant, sample, zone, line, area, location, active:true};
    pts.push(np);
    saveMasterPoints(pts);
    syncSafe(() => syncPushPoint(np), 'create point');
  }

  closeMasterModal();
  loadMasterTable();
  toast('Point saved successfully','success');
}

// ── Deactivate / Reactivate ──────────────────
function deactivateMasterPoint(plant, sample) {
  if(!confirm('Deactivate Sample #'+sample+' from plant '+plant+'? It will not appear in the generator but the history is kept.')) return;
  const pts = getMasterPoints();
  const p = pts.find(x => x.plant===plant && x.sample==sample);
  if(p) { p.active = false; saveMasterPoints(pts); syncSafe(() => syncUpdatePoint(p), 'deactivate point'); }
  loadMasterTable();
  toast('Sample #'+sample+' deactivated','success');
}

function reactivateMasterPoint(plant, sample) {
  const pts = getMasterPoints();
  const p = pts.find(x => x.plant===plant && x.sample==sample);
  if(p) { p.active = true; saveMasterPoints(pts); syncSafe(() => syncUpdatePoint(p), 'reactivate point'); }
  loadMasterTable();
  toast('Sample #'+sample+' reactivated','success');
}

// ═══════════════════════════════════════════════
// USERS / SETTINGS
// ═══════════════════════════════════════════════
// Users live in Firebase Auth and are managed via Cloud Functions (admin only).
const userFn = name => fbFunctions.httpsCallable(name);
let USERS_CACHE = [];

// Friendly message for callable errors.
function fnError(e) {
  const code = (e && e.code) || '';
  if (code === 'functions/permission-denied')  return 'Only administrators can manage users.';
  if (code === 'functions/unauthenticated')    return 'Please sign in again.';
  if (code === 'functions/not-found' || code === 'functions/internal')
    return 'User management is unavailable. If you just set this up, deploy the Cloud Functions first.';
  if (code === 'functions/unavailable')        return 'Could not reach the server. Check your connection.';
  return (e && e.message) || 'Something went wrong.';
}

function doLogin_dynamic() {
  const email = document.getElementById('loginEmail').value.trim();
  const pw    = document.getElementById('loginPassword').value;
  const err   = document.getElementById('loginError');
  if(!email) { err.textContent='Enter your email.'; return; }
  if(!pw)    { err.textContent='Enter your password.'; return; }

  err.textContent = 'Verifying…';
  fbAuth.signInWithEmailAndPassword(email, pw)
    .then(async cred => {
      const user = cred.user;
      // Read the role from the token's custom claims (set by an admin).
      let role = 'Inspector';
      try { const tok = await user.getIdTokenResult(); if (tok.claims && tok.claims.role) role = tok.claims.role; } catch(e){}
      if (isAdmin(user.email) && role === 'Inspector') role = 'Administrator';
      const name = user.displayName || user.email.split('@')[0];
      CU = { id:user.uid, uid:user.uid, name, displayName:name,
             email:user.email, role, active:true };
      err.textContent='';
      document.getElementById('userAvatar').textContent = name[0].toUpperCase();
      document.getElementById('userName').textContent   = name;
      const ur = document.getElementById('userRole'); if(ur) ur.textContent = role;
      document.getElementById('genCollectedBy').value   = name;
      document.getElementById('genDate').value = new Date().toISOString().split('T')[0];

      // Show the Settings/Users panel only to admins
      const sg = document.getElementById('nav-settings-group');
      if(sg) sg.classList.toggle('visible', isAdmin(user.email, role));
      // "Send to Lab" only for the configured sender (email tied to their account)
      const bls = document.getElementById('btnLabSend');
      if(bls) bls.style.display = canSendToLab(user.email) ? '' : 'none';
      // "Save Monthly Report" only for admins (feeds the automatic monthly email)
      const bsm = document.getElementById('btnSaveMonthly');
      if(bsm) bsm.style.display = isAdmin(user.email, role) ? '' : 'none';

      document.getElementById('loginScreen').classList.remove('active');
      document.getElementById('appScreen').classList.add('active');
      refreshDashboard(); searchHistory();
      // Load the catalog + latest records + resolved rounds from SharePoint on
      // entry. Resolved MUST be pulled too: it anchors the active-retest groups
      // and marks which positives are already closed. Pull records and resolved
      // together, then refresh the views that depend on both.
      syncSafe(() => syncPullMasterPoints(), 'pull points');
      syncSafe(() => Promise.all([syncPullRecords(), syncPullResolved()])
        .then(() => { refreshDashboard(); searchHistory(); loadRetests(); updateNotifBadge(); }), 'pull records');
      syncSafe(() => syncPullSubmissions().then(() => updateNotifBadge()), 'pull submissions');
      if (typeof startLiveSync === 'function') startLiveSync();   // focus-refresh + gentle poll + "updated Xm ago"
      resetSessionTimer();
    })
    .catch(e => { err.textContent = fbAuthError(e); });
}

function loadUsersTable() {
  const tbody = document.getElementById('usersTable');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-500);padding:32px">Loading…</td></tr>';
  userFn('adminListUsers')().then(res => {
    const users = (res.data || []).slice().sort((a,b)=>(a.email||'').localeCompare(b.email||''));
    USERS_CACHE = users;
    if(!users.length) {
      tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--gray-500);padding:32px">No users</td></tr>';
      return;
    }
    const svgEdit   = '<svg class="ln" width="14" height="14" viewBox="0 0 24 24" style="vertical-align:-2px"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
    const svgPause  = '<svg class="ln" width="14" height="14" viewBox="0 0 24 24" style="vertical-align:-2px"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
    const svgPlay   = '<svg class="ln" width="14" height="14" viewBox="0 0 24 24" style="vertical-align:-2px"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    const svgTrash  = '<svg class="ln" width="14" height="14" viewBox="0 0 24 24" style="vertical-align:-2px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
    tbody.innerHTML = users.map(u => {
      const isMe = CU && u.uid === CU.uid;
      const created = u.created ? new Date(u.created).toLocaleDateString('en-US') : '—';
      return `<tr>
      <td style="font-weight:600">${esc(u.name || (u.email||'').split('@')[0])}${isMe?' <span style="font-size:10px;color:var(--gray-400);font-weight:500">(you)</span>':''}</td>
      <td style="font-size:13px;color:var(--gray-700)">${esc(u.email)}</td>
      <td><span class="badge ${u.role==='Administrator'?'badge-red':u.role==='Manager'?'badge-yellow':'badge-gray'}">${esc(u.role)}</span></td>
      <td><span style="font-size:12px;font-weight:600;color:${u.active?'var(--green)':'var(--gray-400)'}">${u.active?'Active':'Inactive'}</span></td>
      <td style="font-size:12px;color:var(--gray-500)">${created}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-outline btn-sm" onclick="editUser('${u.uid}')" title="Edit role / reset password">${svgEdit}</button>
          <button class="btn btn-outline btn-sm" onclick="toggleUser('${u.uid}',${u.active})" style="color:${u.active?'var(--red)':'var(--green)'}" title="${u.active?'Deactivate':'Activate'}"${isMe&&u.active?' disabled':''}>${u.active?svgPause:svgPlay}</button>
          ${isMe?'':`<button class="btn btn-outline btn-sm" onclick="deleteUser('${u.uid}','${esc(u.email)}')" style="color:var(--red)" title="Delete">${svgTrash}</button>`}
        </div>
      </td>
    </tr>`;
    }).join('');
  }).catch(e => {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--red);padding:24px">'+esc(fnError(e))+'</td></tr>';
  });
}

function openUserModal(uid) {
  const editing = !!uid;
  const u = editing ? USERS_CACHE.find(x=>x.uid===uid) : null;
  document.getElementById('userModalTitle').textContent = editing ? 'Edit User' : 'New User';
  document.getElementById('editUserId').value = uid || '';
  document.getElementById('uEmail').value = u ? u.email : '';
  document.getElementById('uEmail').disabled = editing;
  document.getElementById('uName').value = u ? (u.name||'') : '';
  document.getElementById('uName').disabled = editing;
  document.getElementById('uRole').value = u ? u.role : 'Inspector';
  document.getElementById('uPass').value = '';
  document.getElementById('uPass').placeholder = editing ? 'Leave blank to keep current' : 'At least 6 characters';
  const msg = document.getElementById('userMsg');
  msg.textContent = editing ? 'Change the role, or set a new password below.' : 'Minimum 6 characters.';
  msg.style.color = 'var(--gray-500)';
  document.getElementById('userModal').classList.add('open');
  setTimeout(()=>document.getElementById(editing?'uRole':'uEmail').focus(),100);
}
function editUser(uid){ openUserModal(uid); }

function closeUserModal() {
  document.getElementById('userModal').classList.remove('open');
}

function saveUser() {
  const editId = document.getElementById('editUserId').value;
  const email  = document.getElementById('uEmail').value.trim();
  const name   = document.getElementById('uName').value.trim();
  const role   = document.getElementById('uRole').value;
  const pass   = document.getElementById('uPass').value;
  const btn    = document.getElementById('btnSaveUser');
  const busy = b => { if(btn){ btn.disabled=b; btn.style.opacity=b?'.6':'1'; } };

  if(editId) {
    // Edit: update role, and password only if a new one was typed
    if(pass && pass.length<6) { toast('Password must be at least 6 characters','error'); return; }
    busy(true);
    const jobs = [ userFn('adminSetRole')({uid:editId, role}) ];
    if(pass) jobs.push(userFn('adminResetPassword')({uid:editId, password:pass}));
    Promise.all(jobs)
      .then(()=>{ toast('User updated','success'); closeUserModal(); loadUsersTable(); })
      .catch(e=>toast(fnError(e),'error'))
      .finally(()=>busy(false));
    return;
  }
  // Create
  if(!email) { toast('Enter an email','error'); return; }
  if(pass.length<6) { toast('Password must be at least 6 characters','error'); return; }
  busy(true);
  userFn('adminCreateUser')({email, password:pass, name, role})
    .then(()=>{ toast('User created','success'); closeUserModal(); loadUsersTable(); })
    .catch(e=>toast(fnError(e),'error'))
    .finally(()=>busy(false));
}

function toggleUser(uid, currentlyActive) {
  userFn('adminSetUserActive')({uid, active: !currentlyActive})
    .then(()=>{ toast(currentlyActive?'User deactivated':'User activated','success'); loadUsersTable(); })
    .catch(e=>toast(fnError(e),'error'));
}

function deleteUser(uid, email) {
  if(!confirm('Delete '+(email||'this user')+'? This cannot be undone.')) return;
  userFn('adminDeleteUser')({uid})
    .then(()=>{ toast('User deleted','success'); loadUsersTable(); })
    .catch(e=>toast(fnError(e),'error'));
}