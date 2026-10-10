// ═══════════════════════════════════════════════════════════════
// ACTION ITEMS — what needs attention right now, derived from the data
// already in the app (no new storage). Shown on the Dashboard ("Needs
// attention") and at the top of the notification panel; red items also
// count on the bell badge. Each item links to where it gets resolved.
// ═══════════════════════════════════════════════════════════════

const ALERT_LAB_WARN_DAYS = 60;   // accreditation expiring soon
const ALERT_MR_WARN_DAYS = 14;    // management review due soon

const _alDays = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const _alFmt = d => (typeof _apFmt === 'function' ? _apFmt(d) : d);

function buildAlerts() {
  const out = [];
  const add = (level, text, sub, go) => out.push({ level, text, sub, go });
  const today = todayLocal();
  const hist = GH();
  const start = typeof SQF_PROGRAM_START !== 'undefined' ? SQF_PROGRAM_START : '';

  // 1) Positives whose 3 retests are not scheduled yet
  const rids = new Set(GRV().map(r => r.originalId));
  const rootsWithRetests = new Set(hist.filter(h => h.retestNum && h.originalId && !isVectorRec(h)).map(h => h.originalId));
  const needRetests = hist.filter(h => h.resultado === 'Positive' && (!h.retestNum || h.fecha >= start) && !rids.has(h.id) && !rootsWithRetests.has(h.id));
  if (needRetests.length) add('red', needRetests.length + ' positive' + (needRetests.length === 1 ? '' : 's') + ' without retests scheduled',
    needRetests.slice(0, 3).map(h => '#' + h.sample + ' ' + h.planta).join(', '), 'retests');

  // 2) Overdue retests / vector samples (still pending after their date)
  const overdue = hist.filter(h => h.retestNum && h.resultado === 'Pending' && h.fecha < today && !(typeof labIsPresumptive === 'function' && labIsPresumptive(h)));
  if (overdue.length) add('red', overdue.length + ' retest' + (overdue.length === 1 ? '' : 's') + ' overdue',
    'Oldest scheduled ' + _alFmt(overdue.map(h => h.fecha).sort()[0]), 'retests');

  // 3) Presumptive results waiting for the lab's confirmation
  const pres = hist.filter(h => typeof labIsPresumptive === 'function' && labIsPresumptive(h));
  if (pres.length) add('amber', pres.length + ' presumptive result' + (pres.length === 1 ? '' : 's') + ' awaiting lab confirmation',
    pres.slice(0, 3).map(h => '#' + h.sample + ' ' + h.planta + (h.failedPathogensLabel ? ' · ' + h.failedPathogensLabel.replace(/ \(presumptive\)/g, '') : '')).join(', '), 'presumptive');

  // 4) Positives (from program start) without a complete CAPA
  if (typeof getCapa === 'function') {
    const noCapa = hist.filter(h => h.resultado === 'Positive' && h.fecha >= start && ((!h.retestNum && !h.isRetest) || isVectorRec(h)) && !capaComplete(getCapa(h.id)));
    if (noCapa.length) add('red', noCapa.length + ' positive' + (noCapa.length === 1 ? '' : 's') + ' without a complete CAPA (2.5.C.2)',
      noCapa.slice(0, 3).map(h => '#' + h.sample + ' ' + h.planta + ' · ' + _alFmt(h.fecha)).join(', '), 'capa');
  }

  // 5) Program deviation CAPAs not closed
  if (typeof getProgCapas === 'function') {
    getProgCapas().forEach(c => {
      const st = pcapaStatus(c);
      if (st === 'Closed') return;
      const auto = pcapaAutoEffect(c);
      add(st === 'Not effective' ? 'red' : st === 'Open' ? 'amber' : 'gray', c.no + ' ' + st.toLowerCase(),
        (c.title || '') + (auto ? ' — ' + auto.text : ''), 'capa');
    });
  }

  // 6) Management review
  const emp = getEMP();
  const reviews = typeof getMgmtReviews === 'function' ? getMgmtReviews() : [];
  const lastMr = reviews.map(r => r.date).sort().pop() || emp.managementReview.lastReview || '';
  const lastRec = reviews.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  const nextMr = (lastRec && lastRec.nextReview) || emp.managementReview.nextReview || '';
  const yearAgo = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return todayLocal(d); })();
  if (!lastMr) add('amber', 'No management review on record', 'Required for SQF — record one in Reports → SQF Compliance', 'mr');
  else if (nextMr && nextMr < today) add('red', 'Management review overdue', 'Was due ' + _alFmt(nextMr) + ' · last review ' + _alFmt(lastMr), 'mr');
  else if (!nextMr && lastMr < yearAgo) add('red', 'Management review older than 12 months', 'Last review ' + _alFmt(lastMr), 'mr');
  else if (nextMr && _alDays(today, nextMr) <= ALERT_MR_WARN_DAYS) add('amber', 'Management review due ' + _alFmt(nextMr), 'In ' + _alDays(today, nextMr) + ' day(s)', 'mr');

  // 7) Lab accreditation
  const exp = emp.lab.expiry;
  if (exp && exp < today) add('red', 'Lab accreditation expired', emp.lab.name + ' · ' + emp.lab.cert + ' · expired ' + _alFmt(exp), 'emp');
  else if (exp && _alDays(today, exp) <= ALERT_LAB_WARN_DAYS) add('amber', 'Lab accreditation expires ' + _alFmt(exp), emp.lab.name + ' · ' + emp.lab.cert + ' — request the renewed certificate', 'emp');

  // 8) Training
  if (!emp.training.length) add('amber', 'No sampler training on file', 'Issue and register training forms in Settings → EMP Program', 'emp');
  const pendingForms = (emp.trainingForms || []).filter(f => !f.usedAt && !f.voidedAt && f.issuedAt && _alDays(todayLocal(new Date(f.issuedAt)), today) > 14);
  if (pendingForms.length) add('gray', pendingForms.length + ' training form' + (pendingForms.length === 1 ? '' : 's') + ' issued but not registered',
    pendingForms.map(f => f.no).slice(0, 3).join(', '), 'emp');

  // 9) Local-only records without a recent backup
  if (typeof backupHasLocalData === 'function' && backupHasLocalData()) {
    const lastBk = localStorage.getItem('cap_backup_last');
    const age = lastBk ? _alDays(lastBk.slice(0, 10), today) : null;
    if (age === null) add('amber', 'No backup of the local records yet', 'CAPAs, EMP, training and reviews live only in this browser — menu → Backup & restore', 'backup');
    else if (age > 7) add('amber', 'Last backup ' + age + ' days ago', 'Download a fresh backup — menu → Backup & restore', 'backup');
  }

  const rank = { red: 0, amber: 1, gray: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

// Where each alert takes the user
function alertGo(go) {
  if (typeof closeNotifPanel === 'function') closeNotifPanel();
  if (go === 'retests') showPage('retests');
  else if (go === 'presumptive') { showPage('history'); const f = document.getElementById('fResult'); if (f) { f.value = 'Presumptive'; searchHistory(); } }
  else if (go === 'capa' || go === 'mr') { showPage('reports'); switchRepTab('sqf'); switchSqfSub(go); }
  else if (go === 'emp') { showPage('settings'); switchCfgTab('emp'); }
  else if (go === 'backup' && typeof openBackupModal === 'function') openBackupModal();
}

function _alertRow(a) {
  return '<button type="button" class="al-row al-' + a.level + '" onclick="alertGo(\'' + a.go + '\')">' +
    '<span class="al-dot"></span><span class="al-txt"><strong>' + esc(a.text) + '</strong>' + (a.sub ? '<span>' + esc(a.sub) + '</span>' : '') + '</span>' +
    '<span class="al-go">Open →</span></button>';
}

function renderDashboardAlerts() {
  const host = document.getElementById('dashAlerts'); if (!host) return;
  const list = buildAlerts();
  host.innerHTML = '<div class="card-title emp-head"><span>Needs attention</span>' + (list.length ? '<span class="al-count">' + list.length + '</span>' : '') + '</div>' +
    (list.length ? list.map(_alertRow).join('') : '<div class="al-clear">All clear — nothing needs attention right now.</div>');
}

// Notification panel section (top) + red items on the bell badge
function alertsPanelHtml() {
  const list = buildAlerts();
  if (!list.length) return '';
  return '<div class="al-panel-head">Needs attention</div>' + list.map(_alertRow).join('') + '<div class="al-panel-head" style="margin-top:6px">Activity</div>';
}
function alertsRedCount() { try { return buildAlerts().filter(a => a.level === 'red').length; } catch (e) { return 0; } }
