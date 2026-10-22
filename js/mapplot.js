// ═══════════════════════════════════════════════════════════════
// SAMPLING MAP — where each MASTER point is on the facility plan.
// The plan geometry (buildings, 254 areas, doors) comes from the 3D
// facility map and lives in Firestore private/mapGeometry (confidential,
// signed-in users only). Each MASTER point is placed ONCE by an admin
// (click on the plan) and keeps mapX/mapZ (+ detected area) on its
// masterPoints document. The generator then prints the week's tests as
// numbered dots on the plan (PDF), and the point history shows a mini map.
// World coordinates are metres: x → east, z → south.
// ═══════════════════════════════════════════════════════════════

// Distinct colors for the tests of one sampling map (≈10 per day); they repeat only past 12.
const MAP_TEST_COLORS = [[230, 25, 75], [0, 130, 200], [60, 180, 75], [245, 130, 48], [145, 30, 180], [70, 240, 240],
  [240, 50, 230], [255, 225, 25], [128, 0, 0], [0, 0, 128], [170, 110, 40], [0, 128, 128]];
const MAP_BUILDINGS_OF = { '1945': ['1945', 'Docks'], '1935': ['1935'], '1931E': ['1931E'], '1931W': ['1931W'] };
let MAP_GEO = null;

async function mapGeo() {
  if (MAP_GEO) return MAP_GEO;
  const g = typeof storePrivate === 'function' ? await storePrivate('mapGeometry').catch(() => null) : null;
  if (!g) return null;
  MAP_GEO = typeof g.json === 'string' ? JSON.parse(g.json) : g;
  return MAP_GEO;
}

// ── Geometry helpers ───────────────────────────────────────────
const _mpArea = poly => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
function _mpInside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (((zi > pt[1]) !== (zj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - zi) / (zj - zi) + xi)) c = !c;
  }
  return c;
}
// Smallest area that contains the point (equipment inside a room wins).
function mapAreaAt(geo, x, z) {
  return geo.areas.filter(a => _mpInside([x, z], a.polygon)).sort((a, b) => _mpArea(a.polygon) - _mpArea(b.polygon))[0] || null;
}
function _mpBBox(polys) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  polys.forEach(p => p.forEach(([x, z]) => { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }));
  return { x0, z0, x1, z1, w: x1 - x0, h: z1 - z0 };
}
function _mpScene(geo, plant) {
  const ids = MAP_BUILDINGS_OF[plant] || [plant];
  const buildings = geo.buildings.filter(b => ids.includes(b.id));
  const areas = geo.areas.filter(a => ids.includes(a.building));
  const doors = geo.doors.filter(d => ids.includes(d.building));
  return { ids, buildings, areas, doors, box: _mpBBox(buildings.map(b => b.polygon).concat(areas.map(a => a.polygon))) };
}
const _mpNorm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Areas worth suggesting for a point: same production line, or a name match.
function mapSuggestedAreas(scene, pt) {
  const line = _mpNorm(pt.line).replace(/^line /, '');
  const words = _mpNorm(pt.area + ' ' + pt.location).split(' ').filter(w => w.length > 3 && !/^(area|zone|point|line|misc|miscellaneous|spots)$/.test(w));
  const hit = a => { const n = _mpNorm(a.name); return words.some(w => n.includes(w)); };
  const onLine = (line && line !== 'n a' && line !== 'na') ? scene.areas.filter(a => _mpNorm(a.line) === line) : [];
  if (onLine.length) { const refined = onLine.filter(hit); return new Set((refined.length ? refined : onLine).map(a => a.id)); }
  return new Set(scene.areas.filter(hit).map(a => a.id));
}

// ── SVG plan (app) ─────────────────────────────────────────────
// opts: { marks:[{x,z,label,zone,muted,id}], highlight:Set(areaIds), labels:bool, interactive:bool }
function mapSvg(geo, plant, opts) {
  opts = opts || {};
  const sc = _mpScene(geo, plant), b = sc.box, pad = Math.max(b.w, b.h) * 0.03;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'mp-svg');
  const vb = { x: b.x0 - pad, y: b.z0 - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  svg._home = Object.assign({}, vb); svg._vb = vb;
  const setVB = () => svg.setAttribute('viewBox', [vb.x, vb.y, vb.w, vb.h].join(' '));
  setVB();
  const el = (t, a, parent) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); (parent || svg).appendChild(n); return n; };
  const pts = poly => poly.map(p => p.join(',')).join(' ');
  const unit = Math.max(b.w, b.h) / 100;      // ~1% of the plan

  sc.buildings.forEach(bd => el('polygon', { points: pts(bd.polygon), class: 'mp-bldg', 'stroke-width': unit * 0.35 }));
  const typeCls = { Line: 'mp-line', Equipment: 'mp-eq', Rack: 'mp-rack', Corridor: 'mp-corr', Area: 'mp-area', Outdoor: 'mp-out' };
  sc.areas.slice().sort((a, c) => _mpArea(c.polygon) - _mpArea(a.polygon)).forEach(a => {
    const p = el('polygon', { points: pts(a.polygon), class: 'mp-a ' + (typeCls[a.type] || 'mp-area') + (opts.highlight && opts.highlight.has(a.id) ? ' mp-hi' : ''), 'stroke-width': unit * 0.12 });
    const t = document.createElementNS(NS, 'title'); t.textContent = a.name; p.appendChild(t);
  });
  sc.doors.forEach(d => el('line', { x1: d.a[0], y1: d.a[1], x2: d.b[0], y2: d.b[1], class: 'mp-door', 'stroke-width': unit * 0.45 }));
  if (opts.labels !== false) {
    const g = el('g', { class: 'mp-labels' });
    sc.areas.forEach(a => {
      const bb = _mpBBox([a.polygon]);
      if (bb.w < unit * 9 || bb.h < unit * 3 || !a.center || a.center.length < 2) return;
      const fs = Math.min(unit * 1.5, bb.h * 0.32, bb.w / Math.max(4, a.name.length) * 1.7);
      if (fs < unit * 0.7) return;
      const t = el('text', { x: a.center[0], y: a.center[1], 'font-size': fs, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, g);
      t.textContent = a.name;
    });
  }
  const mg = el('g', { class: 'mp-marks' });
  svg._unit = unit; svg._marks = mg; svg._scene = sc;
  (opts.marks || []).forEach(m => mapAddMark(svg, m));

  if (opts.interactive) {
    let drag = null;
    // screen → plan through the SVG's own matrix (the plan is letterboxed inside its box)
    const toWorld = ev => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const w = p.matrixTransform(svg.getScreenCTM().inverse()); return [w.x, w.y]; };
    svg.addEventListener('wheel', ev => {
      ev.preventDefault();
      const [wx, wz] = toWorld(ev), f = ev.deltaY < 0 ? 0.85 : 1 / 0.85;
      const nw = Math.min(svg._home.w * 1.5, Math.max(svg._home.w / 12, vb.w * f)), k = nw / vb.w;
      vb.x = wx - (wx - vb.x) * k; vb.y = wz - (wz - vb.y) * k; vb.w = nw; vb.h *= k; setVB();
    }, { passive: false });
    svg.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, y: ev.clientY, vx: vb.x, vy: vb.y, k: svg.getScreenCTM().a, moved: false }; svg.setPointerCapture(ev.pointerId); });
    svg.addEventListener('pointermove', ev => {
      if (!drag) return;
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) { vb.x = drag.vx - dx / drag.k; vb.y = drag.vy - dy / drag.k; setVB(); }
    });
    svg.addEventListener('pointerup', ev => {
      const wasDrag = drag && drag.moved; drag = null;
      if (wasDrag) return;
      const mk = _mpMarkAt(ev);
      if (mk) { mapShowTip(svg, mk); return; }          // tap on a dot → show its number, do not move the point
      mapShowTip(svg, null);
      if (opts.onPick) { const [x, z] = toWorld(ev); opts.onPick(x, z); }
    });
    svg._zoom = f => { const cx = vb.x + vb.w / 2, cz = vb.y + vb.h / 2; vb.w *= f; vb.h *= f; vb.x = cx - vb.w / 2; vb.y = cz - vb.h / 2; setVB(); };
    svg._reset = () => { Object.assign(vb, svg._home); setVB(); };
  } else {
    svg.addEventListener('click', ev => mapShowTip(svg, _mpMarkAt(ev)));
  }
  return svg;
}
// Every point is a plain dot; tapping it shows its number (mapShowTip).
function mapAddMark(svg, m) {
  const NS = 'http://www.w3.org/2000/svg', u = svg._unit;
  const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'mp-mark' + (m.muted ? ' mp-muted' : '') + (m.current ? ' mp-current' : ''));
  if (m.id) g.dataset.id = m.id;
  g.dataset.tip = m.tip || (m.label != null ? '#' + m.label : '');
  g.dataset.x = m.x; g.dataset.z = m.z;
  const circle = (r, cls) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', m.x); c.setAttribute('cy', m.z); c.setAttribute('r', r); c.setAttribute('class', cls); g.appendChild(c); return c; };
  circle(u * 1.5, 'mp-hit');                                   // bigger invisible target (fingers)
  if (m.current) circle(u * 1.6, 'mp-halo');
  circle(m.current ? u * 1.1 : u * 0.85, 'mp-dot').setAttribute('stroke-width', u * 0.25);
  svg._marks.appendChild(g);
  return g;
}
function mapShowTip(svg, g) {
  const NS = 'http://www.w3.org/2000/svg', old = svg.querySelector('.mp-tip'); if (old) old.remove();
  if (!g || !g.dataset.tip) return;
  const k = svg._vb.w / svg._home.w, u = svg._unit * Math.max(0.35, Math.min(1.4, k)), x = Number(g.dataset.x), z = Number(g.dataset.z);
  const t = document.createElementNS(NS, 'g'); t.setAttribute('class', 'mp-tip');
  const tx = document.createElementNS(NS, 'text'); tx.textContent = g.dataset.tip;
  tx.setAttribute('x', x); tx.setAttribute('y', z - u * 3.4); tx.setAttribute('font-size', u * 2.3); tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('dominant-baseline', 'central');
  t.appendChild(tx); svg.appendChild(t);
  const bb = tx.getBBox(), pad = u * 0.7, bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('x', bb.x - pad); bg.setAttribute('y', bb.y - pad * 0.6); bg.setAttribute('width', bb.width + pad * 2); bg.setAttribute('height', bb.height + pad * 1.2);
  bg.setAttribute('rx', u * 0.6); t.insertBefore(bg, tx);
}
function _mpMarkAt(ev) { const h = document.elementFromPoint(ev.clientX, ev.clientY); return h && h.closest ? h.closest('.mp-mark') : null; }

// ── Place a MASTER point on the plan (admin) ───────────────────
let MP_EDIT = null;   // { plant, sample, x, z, area }
let MP_QUEUE = null;  // guided placement: { plant, list:[samples], i, vb }

// Points Master → "Place points on the map": walks the active points not yet placed, one after another.
function startPlaceQueue(plant) {
  if (!empCanEdit()) return;
  const list = getMasterPoints().filter(p => p.plant === plant && p.active !== false && p.mapX == null)
    .map(p => Number(p.sample)).sort((a, b) => a - b);
  if (!list.length) { toast('All active points of ' + plant + ' are already on the map', 'success'); return; }
  MP_QUEUE = { plant, list, i: 0, vb: null };
  openPlaceOnMap(plant, list[0]);
}
function _mpQueueOn(plant, sample) { return MP_QUEUE && MP_QUEUE.plant === plant && MP_QUEUE.list[MP_QUEUE.i] === Number(sample); }
function mpSkip() {
  if (!MP_QUEUE) return;
  if (MP_EDIT && MP_EDIT.svg) MP_QUEUE.vb = Object.assign({}, MP_EDIT.svg._vb);
  _mpNext();
}
function _mpNext() {
  const q = MP_QUEUE; q.i++;
  if (q.i >= q.list.length) { MP_QUEUE = null; closePlaceOnMap(); toast('Done — no more points to place in this round', 'success'); return; }
  openPlaceOnMap(q.plant, q.list[q.i]);
}

async function openPlaceOnMap(plant, sample) {
  const pt = getMasterPoints().find(p => p.plant === plant && Number(p.sample) === Number(sample));
  if (!pt) { toast('Point not found', 'error'); return; }
  const geo = await mapGeo();
  if (!geo) { toast('The facility plan is available after signing in', 'error'); return; }
  const admin = typeof empCanEdit === 'function' && empCanEdit();
  MP_EDIT = { plant, sample: Number(sample), x: pt.mapX, z: pt.mapZ, area: null };
  const scene = _mpScene(geo, plant);
  const hi = mapSuggestedAreas(scene, pt);
  const others = getMasterPoints().filter(p => p.plant === plant && p.mapX != null && Number(p.sample) !== Number(sample))
    .map(p => ({ x: p.mapX, z: p.mapZ, muted: true, tip: '#' + p.sample + (p.area ? ' · ' + p.area : '') }));

  const inQ = admin && _mpQueueOn(plant, sample);
  if (!inQ) MP_QUEUE = null;
  const body = document.getElementById('mapPlaceBody');
  body.innerHTML =
    '<div class="mp-head"><div><h3>Sample #' + esc(String(sample)) + ' <span class="badge badge-gray">' + esc(plant) + '</span>' +
      (inQ ? '<span class="mp-qcount">' + (MP_QUEUE.i + 1) + ' of ' + MP_QUEUE.list.length + '</span>' : '') + '</h3>' +
      '<div class="ph-sub">Zone ' + esc(String(pt.zone || '—')) + ' · ' + esc(pt.area || '—') + (pt.line && pt.line !== 'N/A' ? ' · Line ' + esc(pt.line) : '') + ' · ' + esc(pt.location || '—') + '</div></div>' +
      '<div class="mp-tools"><button class="emp-edit" onclick="mpZoom(0.75)" title="Zoom in" aria-label="Zoom in">+</button><button class="emp-edit" onclick="mpZoom(1.33)" title="Zoom out" aria-label="Zoom out">−</button>' +
      '<button class="emp-edit" onclick="mpReset()" title="Fit building" aria-label="Fit building"><svg class="ln" width="14" height="14" viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button></div></div>' +
    '<p class="vec-help" style="margin:4px 0 8px">' + (admin ? 'Click the plan where this point is. Scroll to zoom, drag to move.' : 'Location of this point on the facility plan.') +
      (hi.size ? ' <span style="color:var(--green);font-weight:600">Suggested areas are highlighted' + (pt.line && pt.line !== 'N/A' ? ' (Line ' + esc(pt.line) + ')' : '') + '.</span>' : '') + '</p>' +
    '<div id="mpPlan" class="mp-plan"></div>' +
    '<div id="mpStatus" class="mp-status"></div>' +
    '<div class="modal-actions">' +
      (admin && pt.mapX != null ? '<button class="btn btn-outline" style="color:var(--red)" onclick="mpRemove()">Remove location</button>' : '') +
      '<button class="btn btn-outline" onclick="closePlaceOnMap()">' + (inQ ? 'Stop' : admin ? 'Cancel' : 'Close') + '</button>' +
      (inQ ? '<button class="btn btn-outline" onclick="mpSkip()" title="Leave this point for later">Skip</button>' : '') +
      (admin ? '<button class="btn btn-primary" id="mpSave" onclick="mpSave()" disabled>' + (inQ ? 'Save &amp; next' : 'Save location') + '</button>' : '') + '</div>';

  const svg = mapSvg(geo, plant, { highlight: hi, marks: others, interactive: true,
    onPick: admin ? (x, z) => { MP_EDIT.x = x; MP_EDIT.z = z; _mpDrawCurrent(svg, geo, pt); } : null });
  document.getElementById('mpPlan').appendChild(svg);
  MP_EDIT.svg = svg;
  if (inQ && MP_QUEUE.vb) { Object.assign(svg._vb, MP_QUEUE.vb); svg.setAttribute('viewBox', [svg._vb.x, svg._vb.y, svg._vb.w, svg._vb.h].join(' ')); }
  if (pt.mapX != null) _mpDrawCurrent(svg, geo, pt, true);
  else document.getElementById('mpStatus').textContent = 'Not placed yet.';
  document.getElementById('mapPlaceModal').classList.add('open');
}
function _mpDrawCurrent(svg, geo, pt, initial) {
  const old = svg.querySelector('.mp-current'); if (old) old.remove();
  mapShowTip(svg, null);
  mapAddMark(svg, { x: MP_EDIT.x, z: MP_EDIT.z, label: String(pt.sample), zone: pt.zone, current: true });
  const a = mapAreaAt(geo, MP_EDIT.x, MP_EDIT.z); MP_EDIT.area = a;
  const st = document.getElementById('mpStatus');
  st.innerHTML = (a ? 'Area on the plan: <strong>' + esc(a.name) + '</strong>' + (a.line ? ' · Line ' + esc(a.line) : '') : '<span style="color:var(--yellow)">Outside any mapped area</span>') +
    (initial ? '' : ' — not saved yet');
  const s = document.getElementById('mpSave'); if (s) s.disabled = !!initial;
}
function mpZoom(f) { if (MP_EDIT && MP_EDIT.svg && MP_EDIT.svg._zoom) MP_EDIT.svg._zoom(f); }
function mpReset() { if (MP_EDIT && MP_EDIT.svg && MP_EDIT.svg._reset) MP_EDIT.svg._reset(); }
function closePlaceOnMap() {
  document.getElementById('mapPlaceModal').classList.remove('open'); MP_EDIT = null;
  if (MP_QUEUE) { MP_QUEUE = null; if (typeof loadMasterTable === 'function' && document.getElementById('masterTable')) loadMasterTable(); }
}

function _mpSavePoint(changes, msg) {
  const pts = getMasterPoints();
  const i = pts.findIndex(p => p.plant === MP_EDIT.plant && Number(p.sample) === MP_EDIT.sample);
  if (i < 0) return;
  Object.assign(pts[i], changes);
  Object.keys(changes).forEach(k => { if (changes[k] === null) delete pts[i][k]; });
  saveMasterPoints(pts);
  syncSafe(() => syncUpdatePoint(pts[i]), 'map location');
  if (MP_QUEUE && _mpQueueOn(MP_EDIT.plant, MP_EDIT.sample)) {   // guided placement → straight to the next point
    MP_QUEUE.vb = Object.assign({}, MP_EDIT.svg._vb);
    toast(msg, 'success'); _mpNext(); return;
  }
  closePlaceOnMap();
  if (typeof loadMasterTable === 'function' && document.getElementById('masterTable')) loadMasterTable();
  if (typeof renderTests === 'function' && typeof TESTS !== 'undefined' && TESTS.length) renderTests();
  toast(msg, 'success');
}
function mpSave() {
  if (!MP_EDIT || MP_EDIT.x == null || !empCanEdit()) return;
  const r = v => Math.round(v * 100) / 100, a = MP_EDIT.area;
  _mpSavePoint({ mapX: r(MP_EDIT.x), mapZ: r(MP_EDIT.z), mapArea: a ? a.id : '', mapAreaName: a ? a.name : '', mapBuilding: a ? a.building : MP_EDIT.plant },
    'Sample #' + MP_EDIT.sample + ' placed on the map');
}
function mpRemove() {
  if (!MP_EDIT || !empCanEdit() || !confirm('Remove the map location of Sample #' + MP_EDIT.sample + '?')) return;
  _mpSavePoint({ mapX: null, mapZ: null, mapArea: null, mapAreaName: null, mapBuilding: null }, 'Map location removed');
}

// Progress for Points Master
function mapPlacedCount(plant) {
  const pts = getMasterPoints().filter(p => p.plant === plant && p.active !== false);
  return { placed: pts.filter(p => p.mapX != null).length, total: pts.length };
}

// ── Sampling map PDF (generator) ───────────────────────────────
// ── 3D snapshot of the facility map (for the printed Sampling Map) ──
// The confidential 3D map (private/facilityMap) is loaded in an invisible
// frame, framed on the building with a fixed 3D camera, rendered and read
// back in black & white; the test locations are projected with the map's
// own camera so the dots land on the right spot. null → flat plan fallback.
// Injected INSIDE the map's own scope (its interactive code runs in an arrow-function block).
const FM_BRIDGE = 'window.__fmSnap=function(o){try{' +
  'var mt=document.getElementById("f-motion-toggle");if(mt)mt.checked=false;' +
  'if(o.w&&o.h){stage.style.width=o.w+"px";stage.style.height=o.h+"px";resize();}' +
  'window.__fmExtra=o.extra||[];changeBuilding(o.building||"all",false);animation=null;yaw=o.yaw;pitch=o.pitch;' +
  // frame in screen space on the floor AND the wall tops (else the far wall is cut off)
  'var b=basis(),P=[];o.frame.forEach(function(p){P.push([p[0],0,p[1]],[p[0],o.wallTop||5,p[1]])});' +
  'var U=P.map(function(p){return dot(p,b.u)}),R=P.map(function(p){return dot(p,b.r)}),' +
  'cu=(Math.min.apply(null,U)+Math.max.apply(null,U))/2,cr=(Math.min.apply(null,R)+Math.max.apply(null,R))/2;' +
  'target=[0,0,0];[0,1,2].forEach(function(i){target[i]=b.u[i]*cu+b.r[i]*cr});var t=-target[1]/b.f[1];target=target.map(function(x,i){return x+b.f[i]*t});' +
  'half=Math.max(Math.max.apply(null,U.map(function(u){return Math.abs(u-cu)})),Math.max.apply(null,R.map(function(r){return Math.abs(r-cr)}))*height/width)*1.04+0.5;' +
  'shadowDirty=true;pickDirty=true;render(performance.now());' +
  'var c=document.getElementById("f-canvas"),l=document.getElementById("f-labels"),out=document.createElement("canvas");out.width=c.width;out.height=c.height;' +
  'var x=out.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,out.width,out.height);x.filter=o.color?"none":"grayscale(1) contrast(1.15) brightness(1.04)";x.drawImage(c,0,0);if(o.labels&&l)x.drawImage(l,0,0);' +
  'return{url:out.toDataURL("image/jpeg",o.quality||0.9),w:width,h:height,proj:o.points.map(function(p){return project([p[0],o.y||0.4,p[1]])})};' +
  '}catch(e){return{error:String(e&&e.message||e)}}};';
// Light theme inside the frame, whatever the device uses (the snapshot is printed).
const FM_LIGHT = '<script>(function(){var mm=window.matchMedia.bind(window);window.matchMedia=function(q){return /prefers-color-scheme:\\s*dark/.test(q)?' +
  '{matches:false,media:q,addEventListener:function(){},removeEventListener:function(){},addListener:function(){},removeListener:function(){}}:mm(q);};})();<\/script>';

async function facilitySnapshot(frame, points, size, buildings, opts) {
  const d = typeof storePrivate === 'function' ? await storePrivate('facilityMap').catch(() => null) : null;
  if (!d || !d.html || !frame.length) return null;
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
  const sw = (size && size.w) || 1600, sh = (size && size.h) || 1200;
  f.style.cssText = 'position:fixed;left:0;top:0;width:' + (sw + 80) + 'px;height:' + (sh + 600) + 'px;opacity:0;pointer-events:none;z-index:-1;border:0';
  const HOOK = /\(\(\)=>\{(?=\s*const root=document\.getElementById\()/;
  if (!HOOK.test(d.html)) { console.warn('[map] 3D map structure changed — flat plan'); return null; }
  const FILTER = "allowedBuilding=b=>building==='all'||b===building";
  f.srcdoc = d.html.replace(/<head[^>]*>/i, m => m + FM_LIGHT).replace(HOOK, m => m + FM_BRIDGE)
    .replace(FILTER, FILTER + '||(window.__fmExtra||[]).includes(b)');
  document.body.appendChild(f);
  try {
    await new Promise((res, rej) => { f.onload = res; setTimeout(() => rej(new Error('3D map timeout')), 25000); });
    for (let i = 0; i < 80 && !(f.contentWindow && f.contentWindow.__fmSnap); i++) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setTimeout(r, 600));   // let the scene finish its first frames
    const ids = buildings && buildings.length ? buildings : ['all'];
    const r = f.contentWindow.__fmSnap(Object.assign({ yaw: 0, pitch: 0.98, building: ids[0], extra: ids.slice(1), frame, points, labels: true, y: 0.4, w: sw, h: sh }, opts || {}));
    if (!r || r.error) { if (r) console.warn('[map] 3D snapshot', r.error); return null; }
    return r;
  } catch (e) { console.warn('[map] 3D snapshot', e); return null; }
  finally { f.remove(); }
}

// ── Facility Map page → print / PDF of the whole map or one building ──
let _fmPrinting = false;
async function printFacilityMap(download) {
  if (_fmPrinting) return;
  const what = (document.getElementById('fmPrintWhat') || {}).value || 'all';
  const color = ((document.getElementById('fmPrintColor') || {}).value || 'color') === 'color';
  const geo = await mapGeo();
  if (!geo) { toast('The facility map is available after signing in', 'error'); return; }
  const btn = document.getElementById('fmPrintBtn');
  _fmPrinting = true; if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  try {
    toast('Preparing the map for printing…', 'info');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const W = 279.4, PH = 215.9, M = 8, MUT = [110, 110, 110], LINE = [190, 190, 190];
    const txt = (s, x, y, o) => { o = o || {}; doc.setFont('helvetica', o.bold ? 'bold' : 'normal'); doc.setFontSize(o.size || 8); doc.setTextColor(...(o.color || [0, 0, 0])); doc.text(String(s), x, y, o.align ? { align: o.align } : undefined); };
    const title = what === 'all' ? 'Whole facility' : 'Building ' + what;
    try { doc.addImage(typeof pdfLogo === 'function' ? pdfLogo() : LOGO, 'JPEG', M, 5, 24, 12); } catch (e) {}
    txt('Facility Map', W - M, 10, { size: 14, bold: true, align: 'right' });
    txt(title + ' - ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), W - M, 15.5, { size: 8.5, color: MUT, align: 'right' });
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3); doc.line(M, 19, W - M, 19);
    // map area: framed on every building (and the outdoor areas) for the whole facility, or on the chosen building
    const PX = M, PY = 22, PW = W - 2 * M, PHh = PH - PY - 9;
    const frame = what === 'all' ? geo.buildings.concat(geo.areas || []).flatMap(x => x.polygon || [])
      : _mpScene(geo, what).buildings.flatMap(bd => bd.polygon);
    const snap = await facilitySnapshot(frame, [], { w: 2400, h: Math.round(2400 * PHh / PW) },
      what === 'all' ? ['all'] : (MAP_BUILDINGS_OF[what] || [what]), { color, quality: 0.92 });
    if (!snap) { toast('The 3D map could not be rendered — try again', 'error'); return; }
    const k = Math.min(PW / snap.w, PHh / snap.h), iw = snap.w * k, ih = snap.h * k;
    doc.addImage(snap.url, 'JPEG', PX + (PW - iw) / 2, PY + (PHh - ih) / 2, iw, ih);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, PH - 6, W - M, PH - 6);
    txt('Caputo Foods - Environmental Monitoring - Facility map - Confidential', M, PH - 2.5, { size: 6.5, color: MUT });
    const name = 'Facility Map ' + (what === 'all' ? 'All' : what) + ' ' + todayLocal() + '.pdf';
    if (download) { doc.save(name); toast('Map downloaded', 'success'); return; }
    doc.autoPrint();
    const w = window.open(doc.output('bloburl'), '_blank');
    if (!w) { doc.save(name); toast('Pop-ups are blocked — the PDF was downloaded; print it from there', 'info'); }
  } catch (e) { console.warn('[map] print', e); toast('Could not prepare the map: ' + (e.message || e), 'error'); }
  finally { _fmPrinting = false; if (btn) { btn.disabled = false; btn.classList.remove('busy'); } }
}

// Flat printed form: white / grays / black (Caputo logo in color).
async function exportTestsMapPDF() {
  if (typeof TESTS === 'undefined' || !TESTS.length) { toast('Generate the tests first', 'error'); return; }
  const plant = document.getElementById('genPlant').value;
  const fecha = document.getElementById('genDate').value || todayLocal();
  const by = (document.getElementById('genCollectedBy') || {}).value || '';
  const geo = await mapGeo();
  if (!geo) { toast('The facility plan is available after signing in', 'error'); return; }
  const master = getMasterPoints().filter(p => p.plant === plant);
  const rows = TESTS.map(t => {
    const mp = master.find(p => Number(p.sample) === Number(t.sample)) || {};
    return Object.assign({}, t, { mapX: mp.mapX, mapZ: mp.mapZ, mapAreaName: mp.mapAreaName });
  });
  const placed = rows.filter(r => r.mapX != null), unplaced = rows.filter(r => r.mapX == null);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const W = 279.4, PH = 215.9, M = 10, INK = [0, 0, 0], MUT = [110, 110, 110], LINE = [190, 190, 190];
  const safe = s => String(s == null ? '' : s).replace(/[–—]/g, '-').replace(/·/g, '-');
  const txt = (s, x, y, o) => { o = o || {}; doc.setFont('helvetica', o.bold ? 'bold' : 'normal'); doc.setFontSize(o.size || 8); doc.setTextColor(...(o.color || INK)); doc.text(safe(s), x, y, o.align ? { align: o.align } : undefined); };
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  // Header
  try { doc.addImage(typeof pdfLogo === 'function' ? pdfLogo() : LOGO, 'JPEG', M, 6, 26, 13); } catch (e) {}
  txt('Sampling Map', W - M, 11, { size: 14, bold: true, align: 'right' });
  txt('Building ' + plant + ' - ' + fmt(fecha) + (by ? ' - Collected by: ' + by : ''), W - M, 16.5, { size: 8.5, color: MUT, align: 'right' });
  doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.line(M, 21, W - M, 21);

  // Plan area (left) — realistic 3D view in black & white when the map can render; flat plan otherwise
  const scene = _mpScene(geo, plant), b = scene.box;
  const PX = M, PY = 25, PW = 178, PHh = PH - PY - 17;
  toast('Rendering the 3D sampling map…', 'info');
  const frame = scene.buildings.flatMap(bd => bd.polygon);
  const snap = await facilitySnapshot(frame, placed.map(r => [r.mapX, r.mapZ]), { w: 1600, h: Math.round(1600 * PHh / PW) }, MAP_BUILDINGS_OF[plant] || [plant]);
  let posOf;
  if (snap) {
    const k = Math.min(PW / snap.w, PHh / snap.h), iw = snap.w * k, ih = snap.h * k, ix = PX + (PW - iw) / 2, iy = PY + (PHh - ih) / 2;
    doc.addImage(snap.url, 'JPEG', ix, iy, iw, ih);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.rect(ix, iy, iw, ih);
    const at = {}; placed.forEach((r, i) => { at[r.sample + '|' + i] = [ix + snap.proj[i][0] / snap.w * iw, iy + snap.proj[i][1] / snap.h * ih]; });
    posOf = (r, i) => at[r.sample + '|' + i];
  } else {
  const s = Math.min(PW / b.w, PHh / b.h), ox = PX + (PW - b.w * s) / 2, oy = PY + (PHh - b.h * s) / 2;
  const X = x => ox + (x - b.x0) * s, Y = z => oy + (z - b.z0) * s;
  const poly = (p, style) => {
    const d = []; for (let i = 1; i < p.length; i++) d.push([X(p[i][0]) - X(p[i - 1][0]), Y(p[i][1]) - Y(p[i - 1][1])]);
    doc.lines(d, X(p[0][0]), Y(p[0][1]), [1, 1], style, true);
  };
  scene.buildings.forEach(bd => { doc.setFillColor(246, 246, 246); doc.setDrawColor(60, 60, 60); doc.setLineWidth(0.35); poly(bd.polygon, 'FD'); });
  const fillOf = { Line: [236, 236, 236], Equipment: [222, 222, 222], Rack: [230, 230, 230], Corridor: [250, 250, 250], Area: [248, 248, 248], Outdoor: [240, 240, 240] };
  scene.areas.slice().sort((a, c) => _mpArea(c.polygon) - _mpArea(a.polygon)).forEach(a => {
    doc.setFillColor(...(fillOf[a.type] || [248, 248, 248])); doc.setDrawColor(...LINE); doc.setLineWidth(0.12); poly(a.polygon, 'FD');
  });
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.7);
  scene.doors.forEach(d => doc.line(X(d.a[0]), Y(d.a[1]), X(d.b[0]), Y(d.b[1])));
  // area labels (only where they fit)
  scene.areas.forEach(a => {
    const bb = _mpBBox([a.polygon]), wmm = bb.w * s, hmm = bb.h * s;
    if (!a.center || wmm < 14 || hmm < 4) return;
    let size = Math.min(6.5, hmm * 1.6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size);
    while (size > 3.6 && doc.getTextWidth(safe(a.name)) > wmm - 1.5) { size -= 0.3; doc.setFontSize(size); }
    if (doc.getTextWidth(safe(a.name)) > wmm - 1.5) return;
    doc.setTextColor(130, 130, 130); doc.text(safe(a.name), X(a.center[0]), Y(a.center[1]) + size * 0.12, { align: 'center' });
  });
    posOf = r => [X(r.mapX), Y(r.mapZ)];
  }
  // dots: one color per test (the same color sits under its number in the list), white halo → readable on the 3D image
  const colorOf = {}; placed.forEach((r, i) => { colorOf[r.sample + '|' + r.zone] = MAP_TEST_COLORS[i % MAP_TEST_COLORS.length]; });
  const inkOn = c => (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) > 150 ? INK : [255, 255, 255];
  placed.forEach((r, i) => {
    const [cx, cy] = posOf(r, i), c = colorOf[r.sample + '|' + r.zone];
    doc.setFillColor(255, 255, 255); doc.circle(cx, cy, 3.5, 'F');
    doc.setFillColor(...c); doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3); doc.circle(cx, cy, 2.7, 'FD');
    txt(String(r.sample), cx, cy + 1, { size: String(r.sample).length > 2 ? 5.2 : 6.2, bold: true, color: inkOn(c), align: 'center' });
  });
  const ly = PH - 10;
  txt('Each test has its own color: the dot on the map matches the color under its number in the list.', PX, ly, { size: 7, color: MUT });
  txt(snap ? '3D view of the Facility Map.' : 'Same orientation as the Facility Map.', PX + PW, ly, { size: 7, color: MUT, align: 'right' });

  // List (right)
  const LX = PX + PW + 6, LW = W - M - LX;
  doc.autoTable({
    startY: PY, margin: { left: LX, right: M, bottom: 14 }, tableWidth: LW,
    head: [['#', 'Zn', 'Area / location', 'Tests']],
    body: rows.map(r => [String(r.sample), String(r.zone || ''), (r.area || '') + (r.line && r.line !== 'N/A' ? ' - Line ' + r.line : '') + '\n' + (r.location || '') + (r.mapX == null ? '\n(not on map yet)' : ''),
      ['ecoli', 'listeria', 'salmonella', 'saureus'].filter(k => r[k]).map(k => ({ ecoli: 'E.coli', listeria: 'L.mono', salmonella: 'Salm.', saureus: 'S.aur' })[k]).join(', ')]),
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.3, textColor: INK, lineColor: LINE, lineWidth: 0.2, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [242, 242, 242], textColor: INK, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 10, fontStyle: 'bold', halign: 'center', valign: 'top', fontSize: 8 }, 1: { cellWidth: 7, halign: 'center' }, 3: { cellWidth: 18 } },
    didParseCell: d => { if (d.section === 'body' && d.column.index === 2 && /not on map/.test(d.cell.raw)) d.cell.styles.textColor = [90, 90, 90]; },
    didDrawCell: d => {   // color bar under the test number = color of its dot
      if (d.section !== 'body' || d.column.index !== 0) return;
      const r = rows[d.row.index], c = r && colorOf[r.sample + '|' + r.zone]; if (!c) return;
      const w = d.cell.width - 3, h = 2.4, y = d.cell.y + Math.max(5.2, d.cell.height - h - 1.6);
      doc.setFillColor(...c); doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.15); doc.roundedRect(d.cell.x + 1.5, y, w, h, 0.6, 0.6, 'FD');
    }
  });
  doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, PH - 6, W - M, PH - 6);
  txt('Caputo Foods - Environmental Monitoring - Sampling map - Confidential', M, PH - 2.5, { size: 6.5, color: MUT });
  txt(placed.length + ' of ' + rows.length + ' tests on the map', W - M, PH - 2.5, { size: 6.5, color: MUT, align: 'right' });

  doc.save('Sampling Map ' + plant + ' ' + fecha + '.pdf');
  if (unplaced.length) toast(unplaced.length + ' test(s) are not on the map yet — use the pin in the table to place them', 'info');
  else toast('Sampling map downloaded', 'success');
}

// Mini map for the point-history modal (read-only).
async function mapMiniInto(host, plant, sample) {
  const pt = getMasterPoints().find(p => p.plant === plant && Number(p.sample) === Number(sample));
  if (!host || !pt || pt.mapX == null) return;
  const geo = await mapGeo(); if (!geo) return;
  const svg = mapSvg(geo, plant, { labels: false, marks: [{ x: pt.mapX, z: pt.mapZ, label: String(sample), zone: pt.zone, current: true }] });
  // zoom around the point
  const u = svg._unit, vb = svg._vb; vb.w = u * 45; vb.h = u * 28; vb.x = pt.mapX - vb.w / 2; vb.y = pt.mapZ - vb.h / 2;
  svg.setAttribute('viewBox', [vb.x, vb.y, vb.w, vb.h].join(' '));
  host.innerHTML = '<div class="ph-sec">On the plan' + (pt.mapAreaName ? ' · ' + esc(pt.mapAreaName) : '') + '</div>';
  const box = document.createElement('div'); box.className = 'mp-mini'; box.appendChild(svg); host.appendChild(box);
}
