// ═══════════════════════════════════════════════
// MASTER MANAGEMENT
// ═══════════════════════════════════════════════

// localStorage keys
const MASTER_ADD_KEY = 'cap_master_add'; // [{plant,sample,zone,area,line,location,custom:true}]
const MASTER_DEL_KEY = 'cap_master_del'; // ['1945|303', '1935|140']

function getMasterAdd() { return JSON.parse(localStorage.getItem(MASTER_ADD_KEY)||'[]'); }
function getMasterDel() { return JSON.parse(localStorage.getItem(MASTER_DEL_KEY)||'[]'); }
function saveMasterAdd(d) { localStorage.setItem(MASTER_ADD_KEY, JSON.stringify(d)); }
function saveMasterDel(d) { localStorage.setItem(MASTER_DEL_KEY, JSON.stringify(d)); }

// Returns merged active master for a plant
function getActiveMaster(plant) {
  const base = (MASTER[plant]||[]).map(p => ({...p, _custom:false}));
  const dels  = new Set(getMasterDel());
  const adds  = getMasterAdd().filter(p => p.plant===plant).map(p => ({...p, _custom:true}));
  const merged = [...base, ...adds].filter(p => !dels.has(plant+'|'+p.sample));
  return merged;
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
  const dels   = new Set(getMasterDel());

  // Base points
  const base = (MASTER[plant]||[]).map(p => ({...p, _custom:false, _deleted: dels.has(plant+'|'+p.sample)}));
  // Custom added points
  const adds = getMasterAdd().filter(p => p.plant===plant).map(p => ({...p, _custom:true, _deleted: dels.has(plant+'|'+p.sample)}));
  let all = [...base, ...adds];

  // Filters
  if(zone) all = all.filter(p => String(p.zone)===zone);
  if(search) all = all.filter(p =>
    p.area.toLowerCase().includes(search) ||
    p.location.toLowerCase().includes(search) ||
    String(p.sample).includes(search)
  );

  document.getElementById('masterCount').textContent = all.filter(p=>!p._deleted).length+' activos / '+all.length+' total';

  const tbody = document.getElementById('masterTable');
  if(!all.length) {
    tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--gray-500);padding:32px">Sin puntos con esos filtros</td></tr>';
    return;
  }

  tbody.innerHTML = all.map(p => {
    const deleted = p._deleted;
    const rowStyle = deleted ? 'opacity:.45;text-decoration:line-through' : '';
    const badge = p._custom
      ? '<span style="background:#d1fae5;color:#059669;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">🟢 Custom</span>'
      : '<span style="background:var(--gray-100);color:var(--gray-500);font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">🔵 Base</span>';
    const delBadge = deleted ? '<span style="background:var(--red-light);color:var(--red);font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:4px">🔴 Desactivado</span>' : '';
    return `<tr style="${rowStyle}">
      <td style="font-weight:700;font-size:14px">${p.sample}</td>
      <td style="text-align:center">${p.zone}</td>
      <td style="max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(p.area)}">${esc(p.area)}</td>
      <td>${esc(p.line||'N/A')}</td>
      <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(p.location)}">${esc(p.location)}</td>
      <td>${badge}${delBadge}</td>
      <td>
        <div style="display:flex;gap:5px">
          ${!deleted
            ? `<button class="btn btn-outline btn-sm" onclick="editMasterPoint('${plant}',${p.sample})" title="Editar">✏️</button>
               <button class="btn btn-outline btn-sm" onclick="deactivateMasterPoint('${plant}',${p.sample})" style="color:var(--red)" title="Desactivar">🚫</button>`
            : `<button class="btn btn-outline btn-sm" onclick="reactivateMasterPoint('${plant}',${p.sample})" style="color:var(--green)" title="Reactivar">✅</button>`
          }
          ${p._custom && !deleted
            ? `<button class="btn btn-outline btn-sm" onclick="deleteMasterPoint('${plant}',${p.sample})" style="color:var(--red)" title="Eliminar permanentemente">🗑</button>`
            : ''
          }
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Modal ─────────────────────────────────────
function openMasterModal(plant, sample) {
  const isEdit = plant && sample;
  document.getElementById('masterModalTitle').textContent = isEdit ? '✏️ Editar Punto' : '➕ Agregar Punto de Muestreo';
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
    // Find the point
    const base = (MASTER[plant]||[]).find(p => p.sample==sample);
    const custom = getMasterAdd().find(p => p.plant===plant && p.sample==sample);
    const pt = custom || base;
    if(pt) {
      document.getElementById('mPlant').value    = plant;
      document.getElementById('mSample').value   = pt.sample;
      document.getElementById('mZone').value     = pt.zone;
      document.getElementById('mLine').value     = pt.line||'N/A';
      document.getElementById('mArea').value     = pt.area;
      document.getElementById('mLocation').value = pt.location;
      // Lock sample# and plant when editing base
      document.getElementById('mSample').disabled = !!base && !custom;
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

  if(!area || !location) { msg.style.color='var(--red)'; msg.textContent='⚠️ Área y Ubicación son obligatorios.'; return; }
  if(!sample || sample<1) { msg.style.color='var(--red)'; msg.textContent='⚠️ Ingresa un Sample # válido.'; return; }

  const adds = getMasterAdd();
  const dels = getMasterDel();
  const editPlant = editKey ? editKey.split('|')[0] : null;
  const editSample= editKey ? parseInt(editKey.split('|')[1]) : null;

  // Check duplicate sample# in plant (skip current if editing)
  const baseHas   = (MASTER[plant]||[]).some(p => p.sample===sample && !(editPlant===plant && editSample===sample));
  const customHas = adds.some(p => p.plant===plant && p.sample===sample && !(editPlant===plant && editSample===sample));
  if(baseHas || customHas) {
    msg.style.color='var(--red)';
    msg.textContent='⚠️ Sample #'+sample+' ya existe en el edificio '+plant+'.';
    return;
  }

  if(editKey) {
    // Editing a custom point → update it
    const idx = adds.findIndex(p => p.plant===editPlant && p.sample===editSample);
    if(idx>=0) {
      adds[idx] = {plant, sample, zone, line, area, location, _custom:true, created: adds[idx].created};
    } else {
      // Editing a base point → create a custom override (deactivate base, add custom)
      const delKey = editPlant+'|'+editSample;
      if(!dels.includes(delKey)) dels.push(delKey);
      saveMasterDel(dels);
      adds.push({plant, sample, zone, line, area, location, _custom:true, created: new Date().toLocaleDateString('en-US')});
    }
  } else {
    adds.push({plant, sample, zone, line, area, location, _custom:true, created: new Date().toLocaleDateString('en-US')});
  }

  saveMasterAdd(adds);
  closeMasterModal();
  loadMasterTable();
  toast('✅ Punto guardado correctamente','success');
}

// ── Deactivate / Reactivate / Delete ─────────
function deactivateMasterPoint(plant, sample) {
  if(!confirm('¿Desactivar Sample #'+sample+' de planta '+plant+'? No aparecerá en el generador pero el historial se mantiene.')) return;
  const dels = getMasterDel();
  const key = plant+'|'+sample;
  if(!dels.includes(key)) dels.push(key);
  saveMasterDel(dels);
  loadMasterTable();
  toast('🚫 Sample #'+sample+' desactivado','success');
}

function reactivateMasterPoint(plant, sample) {
  const dels = getMasterDel().filter(k => k !== plant+'|'+sample);
  saveMasterDel(dels);
  loadMasterTable();
  toast('✅ Sample #'+sample+' reactivado','success');
}

function deleteMasterPoint(plant, sample) {
  if(!confirm('¿ELIMINAR permanentemente Sample #'+sample+'? Solo aplica a puntos custom.')) return;
  const adds = getMasterAdd().filter(p => !(p.plant===plant && p.sample==sample));
  saveMasterAdd(adds);
  const dels = getMasterDel().filter(k => k !== plant+'|'+sample);
  saveMasterDel(dels);
  loadMasterTable();
  toast('🗑 Sample #'+sample+' eliminado','success');
}

// ═══════════════════════════════════════════════
// USERS / SETTINGS
// ═══════════════════════════════════════════════
const DEFAULT_USERS = [
  {id:'u1', name:'Admin', role:'Administrador', pin:'0000', active:true, created:'Sistema'},
];

function getUsers() {
  const stored = localStorage.getItem('cap_users');
  if(!stored) {
    localStorage.setItem('cap_users', JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }
  return JSON.parse(stored);
}
function saveUsers(u) { localStorage.setItem('cap_users', JSON.stringify(u)); }

function doLogin_dynamic() {
  const name = document.getElementById('loginName').value.trim();
  const pin  = document.getElementById('pinInput').value.trim();
  const err  = document.getElementById('loginError');
  if(!name) { err.textContent='Ingresa tu nombre.'; return; }
  if(pin.length!==4) { err.textContent='El PIN debe tener 4 dígitos.'; return; }

  const users = getUsers();
  let user = users.find(u => u.pin===pin && u.active);
  if(!user) { err.textContent='PIN incorrecto o usuario inactivo.'; return; }

  CU = {...user, displayName: name};
  err.textContent='';
  document.getElementById('userAvatar').textContent = name[0].toUpperCase();
  document.getElementById('userName').textContent   = name;
  document.getElementById('userRole').textContent   = user.role;
  document.getElementById('genCollectedBy').value   = name;
  document.getElementById('genDate').value = new Date().toISOString().split('T')[0];

  // Show settings only for Admin
  document.getElementById('nav-settings').style.display =
    user.role==='Administrador' ? 'flex' : 'none';

  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('appScreen').classList.add('active');
  refreshDashboard(); searchHistory();
  resetSessionTimer();
}

function loadUsersTable() {
  const users = getUsers();
  const tbody = document.getElementById('usersTable');
  if(!users.length) {
    tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--gray-500);padding:32px">Sin usuarios registrados</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td style="font-weight:600">${esc(u.name)}</td>
      <td>
        <span class="badge ${u.role==='Administrador'?'badge-red':u.role==='Manager'?'badge-yellow':'badge-gray'}">
          ${u.role}
        </span>
      </td>
      <td style="font-family:var(--mono);font-size:13px;letter-spacing:.15em;color:var(--gray-400)">••••</td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;
              color:${u.active?'var(--green)':'var(--gray-400)'}">
          ${u.active?'✅ Activo':'⏸ Inactivo'}
        </span>
      </td>
      <td style="font-size:12px;color:var(--gray-500)">${u.created||'—'}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-outline btn-sm" onclick="editUser('${u.id}')" title="Editar">✏️</button>
          <button class="btn btn-outline btn-sm" onclick="toggleUser('${u.id}')" 
                  style="color:${u.active?'var(--red)':'var(--green)'}"
                  title="${u.active?'Desactivar':'Activar'}">
            ${u.active?'⏸':'▶'}
          </button>
          ${u.id!=='u1'?`<button class="btn btn-outline btn-sm" onclick="deleteUser('${u.id}')" style="color:var(--red)" title="Eliminar">🗑</button>`:''}
        </div>
      </td>
    </tr>`).join('');
}

function openUserModal(id) {
  document.getElementById('userModalTitle').textContent = id ? '✏️ Editar Usuario' : '➕ Nuevo Usuario';
  document.getElementById('editUserId').value = id || '';
  document.getElementById('uName').value = '';
  document.getElementById('uRole').value = 'Inspector';
  document.getElementById('uPin').value = '';
  document.getElementById('pinValidMsg').textContent = 'El PIN debe ser único de 4 dígitos numéricos.';
  document.getElementById('pinValidMsg').style.color = 'var(--gray-500)';

  if(id) {
    const user = getUsers().find(u=>u.id===id);
    if(user) {
      document.getElementById('uName').value = user.name;
      document.getElementById('uRole').value = user.role;
      document.getElementById('uPin').value  = user.pin;
    }
  }
  document.getElementById('userModal').classList.add('open');
  setTimeout(()=>document.getElementById('uName').focus(),100);
}

function closeUserModal() {
  document.getElementById('userModal').classList.remove('open');
}

function validatePinInput(el) {
  el.value = el.value.replace(/\D/g,'');
  const users = getUsers();
  const editId = document.getElementById('editUserId').value;
  const pin = el.value;
  const msg = document.getElementById('pinValidMsg');
  if(pin.length===4) {
    const conflict = users.find(u=>u.pin===pin && u.id!==editId);
    if(conflict) {
      msg.textContent='⚠️ PIN ya está en uso por: '+conflict.name;
      msg.style.color='var(--red)';
    } else {
      msg.textContent='✅ PIN disponible';
      msg.style.color='var(--green)';
    }
  } else {
    msg.textContent='El PIN debe ser único de 4 dígitos numéricos.';
    msg.style.color='var(--gray-500)';
  }
}

function saveUser() {
  const name = document.getElementById('uName').value.trim();
  const role = document.getElementById('uRole').value;
  const pin  = document.getElementById('uPin').value.trim();
  const editId = document.getElementById('editUserId').value;

  if(!name) { toast('Ingresa el nombre del usuario','error'); return; }
  if(pin.length!==4 || !/^\d{4}$/.test(pin)) { toast('El PIN debe ser 4 dígitos numéricos','error'); return; }

  const users = getUsers();
  const conflict = users.find(u=>u.pin===pin && u.id!==editId);
  if(conflict) { toast('PIN ya está en uso por '+conflict.name,'error'); return; }

  if(editId) {
    const idx = users.findIndex(u=>u.id===editId);
    if(idx>=0) {
      users[idx].name = name;
      users[idx].role = role;
      users[idx].pin  = pin;
    }
    toast('✅ Usuario actualizado','success');
  } else {
    const newId = 'u'+Date.now();
    users.push({
      id: newId, name, role, pin, active: true,
      created: new Date().toLocaleDateString('en-US')
    });
    toast('✅ Usuario creado exitosamente','success');
  }

  saveUsers(users);
  closeUserModal();
  loadUsersTable();
}

function toggleUser(id) {
  if(id==='u1') { toast('No puedes desactivar el Admin principal','error'); return; }
  const users = getUsers();
  const idx = users.findIndex(u=>u.id===id);
  if(idx>=0) {
    users[idx].active = !users[idx].active;
    saveUsers(users);
    loadUsersTable();
    toast(users[idx].active?'✅ Usuario activado':'⏸ Usuario desactivado','success');
  }
}

function deleteUser(id) {
  if(id==='u1') { toast('No puedes eliminar el Admin principal','error'); return; }
  if(!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
  const users = getUsers().filter(u=>u.id!==id);
  saveUsers(users);
  loadUsersTable();
  toast('Usuario eliminado','success');
}