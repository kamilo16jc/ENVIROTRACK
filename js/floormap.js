// ═══════════════════════════════════════════════════════════════
// SAMPLING MAP — plots each sampling point (MasterPoint) as a pin on the
// plant floor plan, colored by status, so inspectors see WHERE to sample.
// v1: pin positions in localStorage (cap_mappins); image bundled locally.
// Phase B will move positions to MasterPoints (mapX/mapY) + private image host.
// ═══════════════════════════════════════════════════════════════

// Floor plan image per plant (only 1945 for now; others show "no plan yet").
const PLAN_IMAGES = { '1945': 'assets/plan_1945.webp' };

let FM_PLANT = '1945';
let FM_EDIT  = false;
let FM_SEL   = null;        // selected point key in edit mode ("plant|sample")
let FM_ZONE  = 'all';
let FM_STATUS = 'all';

const FM_COLORS = { none:'#94a3b8', neg:'#16a34a', pos:'#e11d48', pend:'#f59e0b' };
const FM_LABELS = { none:'Not tested', neg:'Negative', pos:'Open positive', pend:'Pending' };

// ── Pin positions (x,y as 0–1 fractions of the image) ──────────────
function fmGetPins()  { try { return JSON.parse(localStorage.getItem('cap_mappins') || '{}'); } catch(e){ return {}; } }
function fmSetPins(o) { try { localStorage.setItem('cap_mappins', JSON.stringify(o)); } catch(e){} }

// ── Status of a sampling point (plant+sample) from the records ─────
function fmPointStatus(plant, sample) {
  const hist = (typeof GH === 'function') ? GH() : [];
  const recs = hist.filter(h => h.planta === plant && String(h.sample) === String(sample) && !h.retestNum);
  if (!recs.length) return 'none';                                  // never tested
  const resolvedIds = new Set(((typeof GRV === 'function') ? GRV() : []).map(r => r.originalId));
  if (recs.some(h => h.resultado === 'Positive' && !resolvedIds.has(h.id))) return 'pos';  // open positive
  if (recs.some(h => h.resultado === 'Pending')) return 'pend';
  if (recs.some(h => h.resultado === 'Negative' || resolvedIds.has(h.id))) return 'neg';
  return 'none';
}

function fmMasterForPlant(p) {
  return ((typeof getActiveMaster === 'function') ? getActiveMaster(p) : []) || [];
}

// ── Main render ────────────────────────────────────────────────────
function loadFloorMap() {
  const page = document.getElementById('page-floormap'); if (!page) return;
  const canEdit = (typeof canEditRecords === 'function') ? canEditRecords() : false;
  fmRenderControls(canEdit);
  fmRenderLegend();

  const img = document.getElementById('fmImg');
  const noPlan = document.getElementById('fmNoPlan');
  const stage = document.getElementById('fmStage');
  const src = PLAN_IMAGES[FM_PLANT];
  if (!src) {
    if (stage) stage.style.display = 'none';
    if (noPlan) noPlan.style.display = 'block';
    document.getElementById('fmEditor').style.display = 'none';
    return;
  }
  if (noPlan) noPlan.style.display = 'none';
  if (stage) stage.style.display = 'block';
  if (img && img.getAttribute('src') !== src) img.setAttribute('src', src);

  fmRenderPins();
  fmRenderEditor(canEdit);
}

// ── Toolbar: plant select + filters + edit toggle + counters ───────
function fmRenderControls(canEdit) {
  const el = document.getElementById('fmControls'); if (!el) return;
  const plants = ['1945','1935','1931E','1931W'];
  const master = fmMasterForPlant(FM_PLANT);
  const pins = fmGetPins();
  const placed = master.filter(pt => pins[FM_PLANT + '|' + pt.sample]).length;
  const needTest = master.filter(pt => fmPointStatus(FM_PLANT, pt.sample) === 'none').length;
  el.innerHTML =
    '<select id="fmPlantSel" onchange="FM_PLANT=this.value;FM_SEL=null;loadFloorMap()" style="padding:7px 10px;border:1.5px solid var(--gray-200);border-radius:8px;font-family:var(--font);font-weight:600">' +
      plants.map(p => '<option value="'+p+'"'+(p===FM_PLANT?' selected':'')+'>Plant '+p+(PLAN_IMAGES[p]?'':' (no plan)')+'</option>').join('') + '</select>' +
    '<select id="fmZoneSel" onchange="FM_ZONE=this.value;fmRenderPins()" style="padding:7px 10px;border:1.5px solid var(--gray-200);border-radius:8px;font-family:var(--font)">' +
      ['all','2','3','4'].map(z => '<option value="'+z+'"'+(z===FM_ZONE?' selected':'')+'>'+(z==='all'?'All zones':'Zone '+z)+'</option>').join('') + '</select>' +
    '<select id="fmStatSel" onchange="FM_STATUS=this.value;fmRenderPins()" style="padding:7px 10px;border:1.5px solid var(--gray-200);border-radius:8px;font-family:var(--font)">' +
      [['all','All'],['none','Needs testing'],['pend','Pending'],['pos','Open positive'],['neg','Negative']].map(o => '<option value="'+o[0]+'"'+(o[0]===FM_STATUS?' selected':'')+'>'+o[1]+'</option>').join('') + '</select>' +
    '<span style="font-size:12px;color:var(--gray-500)">'+placed+'/'+master.length+' placed · <strong style="color:'+FM_COLORS.none+'">'+needTest+' need testing</strong></span>' +
    (canEdit ? '<button class="rt-btn'+(FM_EDIT?' send done':'')+'" onclick="fmToggleEdit()" style="margin-left:auto">'+(FM_EDIT?'✓ Done placing':'✎ Place pins')+'</button>' : '');
}

function fmToggleEdit() { FM_EDIT = !FM_EDIT; FM_SEL = null; loadFloorMap(); }

function fmRenderLegend() {
  const el = document.getElementById('fmLegend'); if (!el) return;
  el.innerHTML = ['none','neg','pend','pos'].map(k =>
    '<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--gray-600);margin-right:16px">' +
    '<span style="width:12px;height:12px;border-radius:50%;background:'+FM_COLORS[k]+';box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 1px 2px rgba(0,0,0,.3)"></span>'+FM_LABELS[k]+'</span>').join('');
}

// ── Pins overlay ───────────────────────────────────────────────────
function fmRenderPins() {
  const layer = document.getElementById('fmPins'); if (!layer) return;
  const pins = fmGetPins();
  const master = fmMasterForPlant(FM_PLANT);
  layer.innerHTML = master.map(pt => {
    const key = FM_PLANT + '|' + pt.sample;
    const pos = pins[key];
    if (!pos) return '';                                   // unplaced → not on the map
    if (FM_ZONE !== 'all' && String(pt.zone) !== FM_ZONE) return '';
    const st = fmPointStatus(FM_PLANT, pt.sample);
    if (!FM_EDIT && FM_STATUS !== 'all' && st !== FM_STATUS) return '';
    const color = FM_COLORS[st];
    const click = FM_EDIT ? 'fmPinMouseDown(event,\''+key+'\')' : 'fmShowPin(\''+key+'\')';
    return '<div class="fm-pin" data-key="'+key+'" title="Sample '+pt.sample+' · '+esc(pt.area||'')+'" ' +
      'style="position:absolute;left:'+(pos.x*100)+'%;top:'+(pos.y*100)+'%;transform:translate(-50%,-50%);' +
      'width:16px;height:16px;border-radius:50%;background:'+color+';border:2px solid #fff;cursor:'+(FM_EDIT?'move':'pointer')+';' +
      'box-shadow:0 1px 3px rgba(0,0,0,.5);z-index:2" ' +
      (FM_EDIT ? 'onmousedown="'+click+'"' : 'onclick="'+click+'"') + '>' +
      '<span style="position:absolute;top:-7px;left:50%;transform:translateX(-50%);font-size:8px;font-weight:800;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.8);white-space:nowrap">'+pt.sample+'</span></div>';
  }).join('');
}

// ── View mode: pin detail popup ────────────────────────────────────
function fmShowPin(key) {
  const sample = key.split('|')[1];
  const pt = fmMasterForPlant(FM_PLANT).find(p => String(p.sample) === String(sample));
  if (!pt) return;
  const st = fmPointStatus(FM_PLANT, sample);
  const hist = (typeof GH === 'function') ? GH() : [];
  const recs = hist.filter(h => h.planta === FM_PLANT && String(h.sample) === String(sample) && !h.retestNum)
                   .sort((a,b) => String(b.fecha).localeCompare(String(a.fecha)));
  const last = recs[0];
  const box = document.getElementById('fmPopup');
  box.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<strong style="font-size:15px">Sample '+pt.sample+'</strong>' +
      '<button onclick="document.getElementById(\'fmPopup\').style.display=\'none\'" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--gray-400)">×</button></div>' +
    '<div style="font-size:13px;line-height:1.8;color:var(--gray-700)">' +
      '<div><span style="width:11px;height:11px;border-radius:50%;background:'+FM_COLORS[st]+';display:inline-block;margin-right:6px"></span><strong>'+FM_LABELS[st]+'</strong></div>' +
      '<div><strong>Zone:</strong> '+pt.zone+'</div>' +
      '<div><strong>Area:</strong> '+esc(pt.area||'—')+'</div>' +
      '<div><strong>Location:</strong> '+esc(pt.location||'—')+'</div>' +
      (last ? '<div><strong>Last test:</strong> '+last.fecha+' — '+last.resultado+'</div>' : '<div style="color:'+FM_COLORS.none+'"><strong>Never tested</strong></div>') +
    '</div>';
  box.style.display = 'block';
}

// ── Edit mode: place / drag pins ───────────────────────────────────
function fmRenderEditor(canEdit) {
  const ed = document.getElementById('fmEditor');
  if (!ed) return;
  if (!FM_EDIT || !canEdit) { ed.style.display = 'none'; return; }
  ed.style.display = 'block';
  const pins = fmGetPins();
  const master = fmMasterForPlant(FM_PLANT).slice().sort((a,b) => a.zone - b.zone || (a.sample - b.sample));
  const unplaced = master.filter(pt => !pins[FM_PLANT + '|' + pt.sample]);
  ed.innerHTML =
    '<div style="font-weight:700;font-size:13px;margin-bottom:6px">Place points</div>' +
    '<div style="font-size:11px;color:var(--gray-500);margin-bottom:10px">Pick a point, then click its spot on the map. Drag a pin to adjust.</div>' +
    '<div style="font-size:11px;font-weight:700;color:var(--gray-500);margin-bottom:6px">Unplaced ('+unplaced.length+')</div>' +
    '<div style="max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">' +
    unplaced.map(pt => {
      const key = FM_PLANT + '|' + pt.sample;
      const active = FM_SEL === key;
      return '<div onclick="FM_SEL=\''+key+'\';fmRenderEditor(true)" style="cursor:pointer;padding:7px 9px;border-radius:7px;font-size:12px;'+
        (active?'background:var(--navy);color:#fff':'background:var(--gray-50)')+'">'+
        '<strong>#'+pt.sample+'</strong> · Z'+pt.zone+' · '+esc((pt.area||'').slice(0,22))+'</div>';
    }).join('') +
    (unplaced.length ? '' : '<div style="font-size:12px;color:var(--green);padding:8px">✓ All points placed</div>') +
    '</div>' +
    (FM_SEL ? '<div style="margin-top:10px;padding:8px;background:var(--navy-light,#eef);border-radius:8px;font-size:12px">Now click on the map to place <strong>#'+FM_SEL.split('|')[1]+'</strong></div>' : '');
}

// Click on the stage (edit mode) → place the selected point there.
function fmStageClick(ev) {
  if (!FM_EDIT || !FM_SEL) return;
  if (ev.target.classList && ev.target.classList.contains('fm-pin')) return; // handled by drag
  const stage = document.getElementById('fmStage');
  const r = stage.getBoundingClientRect();
  const x = (ev.clientX - r.left) / r.width;
  const y = (ev.clientY - r.top) / r.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return;
  const pins = fmGetPins();
  pins[FM_SEL] = { x: +x.toFixed(4), y: +y.toFixed(4) };
  fmSetPins(pins);
  FM_SEL = null;
  fmRenderPins(); fmRenderEditor(true); fmRenderControls(true);
}

// Drag an existing pin to reposition it.
let _fmDrag = null;
function fmPinMouseDown(ev, key) {
  if (!FM_EDIT) return;
  ev.preventDefault(); ev.stopPropagation();
  _fmDrag = key;
  const move = e => {
    const stage = document.getElementById('fmStage'); const r = stage.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    const pins = fmGetPins(); pins[key] = { x:+x.toFixed(4), y:+y.toFixed(4) }; fmSetPins(pins);
    const pin = document.querySelector('.fm-pin[data-key="'+key+'"]');
    if (pin) { pin.style.left = (x*100)+'%'; pin.style.top = (y*100)+'%'; }
  };
  const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); _fmDrag = null; };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}
