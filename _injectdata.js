// ═══════════════════════════════════════════════════════════════
// ONE-TIME DATA INJECTION → Records + ResolvedRetests (1931W/1931E/1935,
// week of 2026-06-04). Enriches zone/area/line/location from the verified
// MasterPoints catalog. Builds the 206 retest cascade (3 rounds) and the
// 186 round (all negative).
//
// Reads flow URLs from functions/.env. Two phases:
//   1) Records WRITE (create) all records
//   2) Records UPDATE the positives (failedPathogens / resultDate)
//   3) ResolvedRetests WRITE the round anchors
//
//   node _injectdata.js --dry    # print plan, write nothing
//   node _injectdata.js --test   # create ONE throwaway record (sample 99999)
//                                 # + one throwaway resolved row, to verify the
//                                 # flow column mapping. Delete them after.
//   node _injectdata.js          # inject everything for real
//
// After the full run: log out/in of the app to re-pull. Then delete this file.
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const { execSync } = require('child_process');

// ── flow URLs from functions/.env ──
const env = {};
fs.readFileSync('functions/.env', 'utf8').split('\n').forEach(l => {
  const mm = l.match(/^([A-Z_]+)\s*=\s*(.*)$/); if (mm) env[mm[1]] = mm[2].trim();
});
const REC_WRITE = env.FLOW_RECORDS_WRITE, REC_UPD = env.FLOW_RECORDS_UPDATE, RES_WRITE = env.FLOW_RESOLVED_WRITE;
if (!REC_WRITE || !REC_UPD || !RES_WRITE) { console.error('Missing FLOW_RECORDS_WRITE / FLOW_RECORDS_UPDATE / FLOW_RESOLVED_WRITE in functions/.env'); process.exit(1); }

// ── catalog (zone/area/line/location) from the verified MASTER in git ──
const _raw = execSync('git show ce7af53:js/data.js').toString();
const _m = _raw.match(/const MASTER\s*=\s*(\{[\s\S]*?\});/);
if (!_m) { console.error('Could not recover MASTER catalog from git commit ce7af53'); process.exit(1); }
const CAT = JSON.parse(_m[1]);
const cat = (dept, sample) => (CAT[dept] || []).find(x => x.sample === sample) || { zone: 0, area: '', line: '', location: '' };

const DATE = '2026-06-04';
const now = new Date().toISOString();

// ── originals: [dept, sample, testedPathogens, result, failedPathogens] ──
const originals = [
  ['1931W',171,['ecoli'],'Negative',null],
  ['1931W',186,['ecoli','salmonella'],'Positive',['ecoli']],
  ['1931W',188,['ecoli','listeria'],'Negative',null],
  ['1931W',196,['ecoli','listeria'],'Negative',null],
  ['1931W',205,['ecoli','listeria'],'Negative',null],
  ['1931W',226,['ecoli','saureus'],'Negative',null],
  ['1931W',247,['ecoli'],'Negative',null],
  ['1931E',153,['ecoli','listeria'],'Negative',null],
  ['1931E',177,['ecoli'],'Negative',null],
  ['1931E',176,['ecoli','listeria'],'Negative',null],
  ['1931E',213,['ecoli','saureus'],'Negative',null],
  ['1931E',206,['ecoli','listeria'],'Positive',['ecoli']],
  ['1931E',220,['ecoli','salmonella'],'Negative',null],
  ['1931E',224,['ecoli'],'Negative',null],
  ['1935',140,['ecoli','listeria'],'Negative',null],
  ['1935',111,['listeria'],'Negative',null],
  ['1935',109,['ecoli','listeria'],'Negative',null],
  ['1935',148,['listeria','saureus'],'Negative',null],
  ['1935',149,['listeria','salmonella'],'Negative',null],
  ['1935',172,['ecoli','listeria'],'Negative',null],
  ['1935',191,['listeria'],'Negative',null],
];

const PK = ['ecoli','listeria','salmonella','saureus'];
const LBL = { ecoli:'E.Coli', listeria:'Listeria', salmonella:'Salmonella', saureus:'S.Aureus' };
let nextId = 7001;
const recs = [];
const idOf = {};

function mkRecord(o) {
  const c = cat(o.dept, o.sample);
  const flags = {}; PK.forEach(k => flags[k] = (o.tested || []).includes(k) ? 1 : 0);
  const failed = o.failed || [];
  return {
    id: o.id, fecha: o.fecha, dept: o.dept, sample: o.sample,
    zone: c.zone, area: c.area, line: c.line, location: c.location,
    ...flags, resultado: o.result, retestNum: o.retestNum || '',
    isRetest: !!o.isRetest, originalId: o.originalId || 0, scheduled: !!o.scheduled,
    resultDate: o.resultDate || '', failed, failedLabel: failed.map(k => LBL[k]).join(', ')
  };
}

// originals
originals.forEach(([dept, sample, tested, result, failed]) => {
  const id = nextId++;
  idOf[dept + '|' + sample] = id;
  recs.push(mkRecord({ id, dept, sample, fecha: DATE, tested, result, failed, resultDate: DATE }));
});

// a retest tests ONLY the failed pathogen (E.Coli here)
function mkRetest(dept, sample, rootId, n, date, result) {
  const failed = result === 'Positive' ? ['ecoli'] : null;
  return mkRecord({ id: nextId++, dept, sample, fecha: date, tested: ['ecoli'], result, failed,
    retestNum: 'Retest #' + n, isRetest: true, originalId: rootId, scheduled: true, resultDate: date });
}

// 186 (1931W): one round, all negative
const root186 = idOf['1931W|186'];
recs.push(mkRetest('1931W', 186, root186, 1, '2026-06-08', 'Negative'));
recs.push(mkRetest('1931W', 186, root186, 2, '2026-06-09', 'Negative'));
recs.push(mkRetest('1931W', 186, root186, 3, '2026-06-10', 'Negative'));

// 206 (1931E): 3-round cascade
const root206 = idOf['1931E|206'];
// round 1 (root=206): +, +, −  → escalates from the first positive (06/08)
const r1a = recs.push(mkRetest('1931E', 206, root206, 1, '2026-06-08', 'Positive')) && recs[recs.length-1].id;
recs.push(mkRetest('1931E', 206, root206, 2, '2026-06-09', 'Positive'));
recs.push(mkRetest('1931E', 206, root206, 3, '2026-06-10', 'Negative'));
// round 2 (root=r1a): −, −, +  → escalates from the positive (06/18)
recs.push(mkRetest('1931E', 206, r1a, 1, '2026-06-16', 'Negative'));
recs.push(mkRetest('1931E', 206, r1a, 2, '2026-06-17', 'Negative'));
const r2c = recs.push(mkRetest('1931E', 206, r1a, 3, '2026-06-18', 'Positive')) && recs[recs.length-1].id;
// round 3 (root=r2c): −, −, −  → resolved
recs.push(mkRetest('1931E', 206, r2c, 1, '2026-06-22', 'Negative'));
recs.push(mkRetest('1931E', 206, r2c, 2, '2026-06-23', 'Negative'));
recs.push(mkRetest('1931E', 206, r2c, 3, '2026-06-24', 'Negative'));

// ── ResolvedRetests anchors (closedOnGenerate) ──
const cat186 = cat('1931W', 186), cat206 = cat('1931E', 206);
const resolved = [
  { originalId: root186, sample: 186, dept: '1931W', area: cat186.area, location: cat186.location, originalDate: DATE,         resolvedDate: '2026-06-08', retestNum: '—', notes: 'Positive: E.Coli. 3 retests scheduled.', closedOnGenerate: true },
  { originalId: root206, sample: 206, dept: '1931E', area: cat206.area, location: cat206.location, originalDate: DATE,         resolvedDate: '2026-06-08', retestNum: '—', notes: 'Positive: E.Coli. 3 retests scheduled.', closedOnGenerate: true },
  { originalId: r1a,     sample: 206, dept: '1931E', area: cat206.area, location: cat206.location, originalDate: '2026-06-08', resolvedDate: '2026-06-16', retestNum: '—', notes: 'Retest positive — new round generated.', closedOnGenerate: true },
  { originalId: r2c,     sample: 206, dept: '1931E', area: cat206.area, location: cat206.location, originalDate: '2026-06-18', resolvedDate: '2026-06-22', retestNum: '—', notes: 'Retest positive — new round generated.', closedOnGenerate: true },
];

// ── payload builders (mirror the app's recordToSP / resolvedToSP) ──
const recSP = r => ({
  id: r.id, fecha: r.fecha, department: r.dept, by: '', sample: r.sample,
  zone: r.zone, area: r.area, line: String(r.line == null ? '' : r.line), location: r.location,
  ecoli: r.ecoli, listeria: r.listeria, salmonella: r.salmonella, saureus: r.saureus,
  resultado: r.resultado, retestNum: r.retestNum || '', labNotes: '',
  isRetest: !!r.isRetest, originalId: r.originalId || 0, scheduled: !!r.scheduled,
  resultDate: r.resultDate || '', failedPathogens: (r.failed || []).join(','), failedPathogensLabel: r.failedLabel || '',
  enteredByEmail: 'migration', enteredByName: 'Data Migration', enteredAt: now
});
const recUpd = r => ({ id: r.id, resultado: r.resultado, resultDate: r.resultDate || '',
  labNotes: '', failedPathogens: (r.failed || []).join(','), failedPathogensLabel: r.failedLabel || '' });
const resSP = r => ({ originalId: r.originalId, sample: r.sample, department: r.dept,
  area: r.area || '', location: r.location || '', originalDate: r.originalDate || '', resolvedDate: r.resolvedDate || '',
  retestNum: r.retestNum || '', notes: r.notes || '', closedOnGenerate: !!r.closedOnGenerate,
  enteredByEmail: 'migration', enteredByName: 'Data Migration', enteredAt: now });

const args = process.argv.slice(2);
const DRY = args.includes('--dry'), TEST = args.includes('--test');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function post(url, list, action, items) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ list, action, items }) });
  if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status + ': ' + (await r.text()).slice(0, 200));
}
async function batchPost(url, list, action, items, label) {
  let done = 0;
  for (let i = 0; i < items.length; i += 20) {
    const chunk = items.slice(i, i + 20);
    await post(url, list, action, chunk); done += chunk.length;
    process.stdout.write('  ' + label + ': ' + done + '/' + items.length + '   \r'); await sleep(350);
  }
  console.log('  ' + label + ': ' + done + '/' + items.length + ' done');
}

(async () => {
  const positives = recs.filter(r => r.resultado === 'Positive');
  console.log('Plan: ' + recs.length + ' records (' + originals.length + ' originals + ' + (recs.length - originals.length) + ' retests), '
    + positives.length + ' positives to update, ' + resolved.length + ' resolved anchors.');

  if (DRY) {
    console.log('\n[DRY] first 3 records:'); recs.slice(0,3).forEach(r => console.log('  ', JSON.stringify(recSP(r))));
    console.log('[DRY] resolved[0]:', JSON.stringify(resSP(resolved[0])));
    return;
  }

  if (TEST) {
    // throwaway record + resolved row (sample 99999) to verify column mapping
    const t = mkRecord({ id: 99999, dept: '1931W', sample: 99999, fecha: DATE, tested: ['ecoli','salmonella'], result: 'Positive', failed: ['ecoli'], resultDate: DATE });
    t.area = 'TEST MIGRATION — DELETE ME'; t.zone = 2; t.location = 'test loc'; t.line = '9';
    await post(REC_WRITE, 'Records', 'create', [recSP(t)]);
    await post(REC_UPD, 'Records', 'update', [recUpd(t)]);
    await post(RES_WRITE, 'ResolvedRetests', 'create', [resSP({ originalId: 99999, sample: 99999, dept: '1931W', area: 'TEST MIGRATION — DELETE ME', location: 'test', originalDate: DATE, resolvedDate: DATE, retestNum: '—', notes: 'TEST', closedOnGenerate: true })]);
    console.log('\nTEST created: 1 Record + 1 ResolvedRetests, sample 99999.');
    console.log('➡  VERIFY in SharePoint that the columns landed correctly:');
    console.log('   Records: sample=99999, department=1931W, zone=2, area="TEST MIGRATION...", ecoli=1, salmonella=1, resultado=Positive, failedPathogens=ecoli, isRetest=No.');
    console.log('   ResolvedRetests: sample=99999, department=1931W, area="TEST MIGRATION...", originalId=99999.');
    console.log('   If OK → DELETE both 99999 rows → run the full inject:  node _injectdata.js');
    return;
  }

  // FULL
  console.log('\nPhase 1 — create Records...');
  await batchPost(REC_WRITE, 'Records', 'create', recs.map(recSP), 'records');
  console.log('Phase 2 — update positives (failedPathogens/resultDate)...');
  await batchPost(REC_UPD, 'Records', 'update', positives.map(recUpd), 'updates');
  console.log('Phase 3 — create ResolvedRetests anchors...');
  await batchPost(RES_WRITE, 'ResolvedRetests', 'create', resolved.map(resSP), 'resolved');
  console.log('\nAll done. Log out/in of the app to re-pull, then verify History + Retests. Delete _injectdata.js after.');
})();
